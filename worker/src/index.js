/**
 * Cloudflare Worker API — production deploy (Pages static + /api/* routed here).
 */
import * as CalAccess from './calendar-access.js';

const SESSION_COOKIE = 'cal_session';
const PBKDF2_ITERATIONS = 100000;
const SESSION_DAYS = 14;
const LOCK_STALE_MS = 20 * 60 * 1000;

function json(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders)
    });
}

function redirectTo(location, headers = {}) {
    return new Response(null, { status: 302, headers: Object.assign({ Location: location }, headers) });
}

function parseCookies(request) {
    const out = {};
    const raw = request.headers.get('Cookie') || '';
    raw.split(';').forEach((part) => {
        const idx = part.indexOf('=');
        if (idx < 0) {
            return;
        }
        out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    });
    return out;
}

function sessionCookie(token, secure) {
    const parts = [
        `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${SESSION_DAYS * 86400}`
    ];
    if (secure) {
        parts.push('Secure');
    }
    return parts.join('; ');
}

function clearSessionCookie(secure) {
    const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
    if (secure) {
        parts.push('Secure');
    }
    return parts.join('; ');
}

function uuid() {
    return crypto.randomUUID();
}

function nowIso() {
    return new Date().toISOString();
}

function normalizeEmail(email) {
    if (!email) {
        return null;
    }
    const t = String(email).trim().toLowerCase();
    return t || null;
}

function rowToUser(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        kakaoUserId: row.kakao_user_id,
        role: row.role,
        active: Boolean(row.active)
    };
}

async function dbOne(env, sql, ...params) {
    const stmt = env.DB.prepare(sql);
    return params.length ? stmt.bind(...params).first() : stmt.first();
}

async function dbAll(env, sql, ...params) {
    const stmt = env.DB.prepare(sql);
    const r = params.length ? stmt.bind(...params).all() : stmt.all();
    return (await r).results || [];
}

async function dbRun(env, sql, ...params) {
    return env.DB.prepare(sql).bind(...params).run();
}

async function getSessionUser(env, token) {
    if (!token) {
        return null;
    }
    const row = await dbOne(
        env,
        `SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.active = 1`,
        token
    );
    if (!row) {
        return null;
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
        await dbRun(env, 'DELETE FROM sessions WHERE token = ?', token);
        return null;
    }
    return rowToUser(row);
}

async function createSession(env, userId) {
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    await dbRun(env, 'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, expires);
    return token;
}

function isLockStale(lock) {
    return !lock || Date.now() - new Date(lock.updated_at).getTime() > LOCK_STALE_MS;
}

async function getLock(env, calendarId) {
    return dbOne(env, 'SELECT * FROM calendar_locks WHERE calendar_id = ?', calendarId);
}

async function lockToClient(env, lock) {
    if (!lock) {
        return null;
    }
    const holder = await dbOne(env, 'SELECT email, display_name FROM users WHERE id = ?', lock.holder_user_id);
    let pendingRequester = null;
    if (lock.pending_requester_id) {
        const pending = await dbOne(env, 'SELECT email, display_name FROM users WHERE id = ?', lock.pending_requester_id);
        pendingRequester = {
            userId: lock.pending_requester_id,
            displayName:
                lock.pending_requester_name ||
                (pending && pending.display_name) ||
                '',
            email: pending && pending.email ? pending.email : null,
            requestedAt: lock.pending_requested_at || null
        };
    }
    return {
        holderUserId: lock.holder_user_id,
        holderName: lock.holder_name,
        holderEmail: holder && holder.email ? holder.email : null,
        updatedAt: lock.updated_at,
        pendingRequester
    };
}

async function lockStatus(env, calendarId, userId) {
    const lock = await getLock(env, calendarId);
    if (!lock || isLockStale(lock)) {
        return { held: false, readOnly: false, lock: null };
    }
    const heldByMe = lock.holder_user_id === userId;
    return {
        held: true,
        readOnly: !heldByMe,
        lock: await lockToClient(env, lock)
    };
}

async function recordLockEditRequest(env, calendarId, user) {
    const label = user.displayName || user.email || user.id;
    await dbRun(
        env,
        `UPDATE calendar_locks SET pending_requester_id = ?, pending_requester_name = ?, pending_requested_at = ? WHERE calendar_id = ?`,
        user.id,
        label,
        nowIso(),
        calendarId
    );
}

async function clearLockEditRequest(env, calendarId) {
    await dbRun(
        env,
        `UPDATE calendar_locks SET pending_requester_id = NULL, pending_requester_name = NULL, pending_requested_at = NULL WHERE calendar_id = ?`,
        calendarId
    );
}

function bytesToHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

function safeEqualHex(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

async function pbkdf2Hash(password, saltBytes) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        256
    );
    return new Uint8Array(bits);
}

async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await pbkdf2Hash(password, salt);
    return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}

function parsePbkdf2Stored(stored) {
    const match = /^pbkdf2-sha256\$(\d+)\$([a-f0-9]{32})\$([a-f0-9]{64})$/i.exec(stored);
    if (!match) {
        return null;
    }
    return {
        iterations: Number(match[1]),
        saltHex: match[2],
        hashHex: match[3]
    };
}

async function verifyPassword(password, stored) {
    if (!stored || !password) {
        return false;
    }
    const parsed = parsePbkdf2Stored(stored);
    if (parsed) {
        const salt = hexToBytes(parsed.saltHex);
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt, iterations: parsed.iterations, hash: 'SHA-256' },
            keyMaterial,
            256
        );
        return safeEqualHex(bytesToHex(new Uint8Array(bits)).toLowerCase(), parsed.hashHex.toLowerCase());
    }
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) {
        return false;
    }
    try {
        const { scryptSync, timingSafeEqual } = await import('node:crypto');
        const attempt = scryptSync(password, salt, 64).toString('hex');
        return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
    } catch (_) {
        return false;
    }
}

async function countAdmins(env) {
    const row = await dbOne(env, `SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1`);
    return Number(row?.c || 0);
}

async function findUserByEmailPassword(env, email, password) {
    const em = normalizeEmail(email);
    if (!em || !password) {
        return null;
    }
    const row = await dbOne(env, 'SELECT * FROM users WHERE email = ? AND active = 1', em);
    if (!row || !row.password_hash) {
        return null;
    }
    if (!(await verifyPassword(password, row.password_hash))) {
        return null;
    }
    return rowToUser(row);
}

async function createUser(env, { email, displayName, kakaoUserId, role, passwordHash }) {
    const id = uuid();
    const em = normalizeEmail(email);
    await dbRun(
        env,
        `INSERT INTO users (id, email, display_name, kakao_user_id, password_hash, role, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        id,
        em,
        displayName || '',
        kakaoUserId ? String(kakaoUserId) : null,
        passwordHash || null,
        role || 'teacher',
        nowIso()
    );
    return rowToUser(await dbOne(env, 'SELECT * FROM users WHERE id = ?', id));
}

async function updateUser(env, id, fields) {
    const existing = await dbOne(env, 'SELECT * FROM users WHERE id = ?', id);
    if (!existing) {
        return null;
    }
    const displayName = fields.displayName != null ? fields.displayName : existing.display_name;
    const email = fields.email !== undefined ? normalizeEmail(fields.email) : existing.email;
    const active = fields.active !== undefined ? (fields.active ? 1 : 0) : existing.active;
    const kakaoUserId =
        fields.kakaoUserId !== undefined
            ? fields.kakaoUserId
                ? String(fields.kakaoUserId)
                : null
            : existing.kakao_user_id;
    const role = fields.role || existing.role;
    await dbRun(
        env,
        `UPDATE users SET email = ?, display_name = ?, kakao_user_id = ?, role = ?, active = ? WHERE id = ?`,
        email,
        displayName,
        kakaoUserId,
        role,
        active,
        id
    );
    return rowToUser(await dbOne(env, 'SELECT * FROM users WHERE id = ?', id));
}

async function findUserForKakao(env, kakaoUserId, email) {
    const kid = kakaoUserId ? String(kakaoUserId) : null;
    const em = normalizeEmail(email);
    if (kid) {
        const byKid = await dbOne(env, 'SELECT * FROM users WHERE kakao_user_id = ? AND active = 1', kid);
        if (byKid) {
            return rowToUser(byKid);
        }
    }
    if (em) {
        const byEmail = await dbOne(env, 'SELECT * FROM users WHERE email = ? AND active = 1', em);
        if (byEmail) {
            if (kid && !byEmail.kakao_user_id) {
                await dbRun(env, 'UPDATE users SET kakao_user_id = ? WHERE id = ?', kid, byEmail.id);
            }
            return rowToUser(byEmail);
        }
    }
    return null;
}

async function kakaoToken(code, redirectUri, clientId, clientSecret) {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code
    });
    if (clientSecret) {
        body.set('client_secret', clientSecret);
    }
    const res = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body: body.toString()
    });
    const json = await res.json();
    if (!res.ok) {
        throw new Error(json.error_description || 'token failed');
    }
    return json;
}

async function kakaoMe(accessToken) {
    const res = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: { Authorization: 'Bearer ' + accessToken }
    });
    const json = await res.json();
    if (!res.ok) {
        throw new Error('profile failed');
    }
    const account = json.kakao_account || {};
    return {
        kakaoUserId: String(json.id),
        email: account.email || null,
        nickname: (account.profile && account.profile.nickname) || ''
    };
}

function publicUrl(env, request) {
    return (env.PUBLIC_URL || new URL(request.url).origin).replace(/\/$/, '');
}

function kakaoRedirectUri(env, request) {
    return env.KAKAO_REDIRECT_URI || publicUrl(env, request) + '/api/auth/kakao/callback';
}

async function requireUser(request, env) {
    const token = parseCookies(request)[SESSION_COOKIE];
    const user = await getSessionUser(env, token);
    if (user) {
        return user;
    }
    return null;
}

async function readJson(request) {
    try {
        return await request.json();
    } catch (_) {
        return {};
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        // Use the actual request scheme — PUBLIC_URL is https even on wrangler dev (http://localhost).
        const secure = url.protocol === 'https:';
        const kakaoId = env.KAKAO_CLIENT_ID || '';

        if (!path.startsWith('/api/')) {
            if (env.ASSETS) {
                return env.ASSETS.fetch(request);
            }
            return new Response('Not found', { status: 404 });
        }

        if (path === '/api/health') {
            return json({
                ok: true,
                time: nowIso(),
                auth: Boolean(kakaoId),
                kakaoConfigured: Boolean(kakaoId),
                passwordAuth: true,
                openAccess: false
            });
        }

        if (path === '/api/host-info') {
            return json({
                primaryTeamUrl: publicUrl(env, request),
                localhostUrl: publicUrl(env, request),
                authMode: kakaoId ? 'kakao' : 'open'
            });
        }

        if (path === '/api/auth/me' && request.method === 'GET') {
            const user = await requireUser(request, env);
            if (!user) {
                return json({ error: 'Not signed in' }, 401);
            }
            return json({
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                role: user.role
            });
        }

        if (path === '/api/auth/logout' && request.method === 'POST') {
            const token = parseCookies(request)[SESSION_COOKIE];
            if (token) {
                await dbRun(env, 'DELETE FROM sessions WHERE token = ?', token);
            }
            return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(secure) });
        }

        if (path === '/api/auth/kakao' && request.method === 'GET') {
            if (!kakaoId) {
                return new Response('Kakao not configured', { status: 503 });
            }
            const returnTo = url.searchParams.get('return') || '/';
            const state =
                crypto.randomUUID().replace(/-/g, '') +
                '.' +
                btoa(returnTo).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            const params = new URLSearchParams({
                client_id: kakaoId,
                redirect_uri: kakaoRedirectUri(env, request),
                response_type: 'code',
                state
            });
            return redirectTo('https://kauth.kakao.com/oauth/authorize?' + params.toString());
        }

        if (path === '/api/auth/kakao/callback' && request.method === 'GET') {
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state') || '';
            let returnTo = '/';
            if (state.includes('.')) {
                try {
                    const b64 = state.split('.').slice(1).join('.');
                    returnTo = atob(b64.replace(/-/g, '+').replace(/_/g, '/')) || '/';
                } catch (_) {
                    returnTo = '/';
                }
            }
            if (!code || !kakaoId) {
                return redirectTo('/login.html?error=missing_code');
            }
            try {
                const tokens = await kakaoToken(code, kakaoRedirectUri(env, request), kakaoId, env.KAKAO_CLIENT_SECRET || '');
                const profile = await kakaoMe(tokens.access_token);
                const matched = await findUserForKakao(env, profile.kakaoUserId, profile.email);
                if (!matched) {
                    const q = new URLSearchParams({
                        denied: '1',
                        email: profile.email || '',
                        kakaoId: profile.kakaoUserId,
                        nickname: profile.nickname || ''
                    });
                    return redirectTo('/login.html?' + q.toString());
                }
                const sessionToken = await createSession(env, matched.id);
                const safeReturn = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
                return redirectTo(safeReturn, { 'Set-Cookie': sessionCookie(sessionToken, secure) });
            } catch (err) {
                return redirectTo('/login.html?error=oauth_failed');
            }
        }

        if (path === '/api/auth/password' && request.method === 'POST') {
            const body = await readJson(request);
            const em = normalizeEmail(body.email);
            const row = em
                ? await dbOne(env, 'SELECT * FROM users WHERE email = ? AND active = 1', em)
                : null;
            const storedHash = row && (row.password_hash || row.PASSWORD_HASH);
            const matched =
                row && storedHash && (await verifyPassword(body.password, storedHash)) ? rowToUser(row) : null;
            if (!matched) {
                return json({ error: 'Invalid email or password' }, 401);
            }
            const sessionToken = await createSession(env, matched.id);
            return json(
                {
                    id: matched.id,
                    email: matched.email,
                    displayName: matched.displayName,
                    role: matched.role
                },
                200,
                { 'Set-Cookie': sessionCookie(sessionToken, secure) }
            );
        }

        if (path === '/api/admin/bootstrap' && request.method === 'POST') {
            const body = await readJson(request);
            if ((await countAdmins(env)) > 0) {
                return json({ error: 'Bootstrap already completed' }, 403);
            }
            const bootstrapSecret = env.BOOTSTRAP_ADMIN_SECRET || '';
            if (!bootstrapSecret || body.secret !== bootstrapSecret) {
                return json({ error: 'Invalid bootstrap secret' }, 403);
            }
            const em = normalizeEmail(body.email);
            if (!em) {
                return json({ error: 'email is required' }, 400);
            }
            const created = await createUser(env, {
                email: em,
                displayName: body.displayName || 'Admin',
                role: 'admin',
                passwordHash: body.password ? await hashPassword(body.password) : null
            });
            const sessionToken = await createSession(env, created.id);
            return json(
                { ok: true, userId: created.id },
                201,
                { 'Set-Cookie': sessionCookie(sessionToken, secure) }
            );
        }

        const user = await requireUser(request, env);
        if (!user) {
            return json({ error: 'Not signed in' }, 401);
        }

        if (path === '/api/calendars' && request.method === 'GET') {
            const rows = await CalAccess.listCalendarsForUser(env, user);
            return json(rows);
        }

        if (path === '/api/teachers' && request.method === 'GET') {
            const teachers = await CalAccess.listTeachers(env);
            if (!CalAccess.isAdmin(user)) {
                const me = teachers.find((t) => t.id === user.id);
                if (me) {
                    return json([me]);
                }
                return json([{ id: user.id, email: user.email, displayName: user.displayName, role: user.role }]);
            }
            return json(teachers);
        }

        if (path === '/api/groups' && request.method === 'GET') {
            const groups = await CalAccess.listGroups(env);
            return json(groups);
        }

        const calMatch = path.match(/^\/api\/calendars\/([^/]+)(\/meta|\/lock)?$/);
        if (calMatch) {
            const calId = calMatch[1];
            const sub = calMatch[2];

            const allowed = await CalAccess.canAccessCalendar(env, user, calId);
            if (!allowed) {
                return json({ error: 'Calendar not found' }, 404);
            }

            if (sub === '/meta' && request.method === 'GET') {
                const meta = await dbOne(
                    env,
                    'SELECT id, revision, updated_at AS updatedAt, updated_by AS updatedBy FROM calendars WHERE id = ?',
                    calId
                );
                if (!meta) {
                    return json({ error: 'Calendar not found' }, 404);
                }
                const lock = await lockStatus(env, calId, user.id);
                return json(Object.assign({}, meta, { lock: lock.lock, readOnly: lock.readOnly }));
            }

            if (sub === '/lock' && request.method === 'POST') {
                const body = await readJson(request);
                const existing = await getLock(env, calId);
                const force = Boolean(body.force);
                const stale = !existing || isLockStale(existing);
                const heldByMe = existing && existing.holder_user_id === user.id;
                if (stale || heldByMe || force) {
                    const name = user.displayName || user.email || 'Teacher';
                    await dbRun(
                        env,
                        `INSERT INTO calendar_locks (calendar_id, holder_user_id, holder_name, updated_at, pending_requester_id, pending_requester_name, pending_requested_at)
                         VALUES (?, ?, ?, ?, NULL, NULL, NULL)
                         ON CONFLICT(calendar_id) DO UPDATE SET
                           holder_user_id = excluded.holder_user_id,
                           holder_name = excluded.holder_name,
                           updated_at = excluded.updated_at,
                           pending_requester_id = NULL,
                           pending_requester_name = NULL,
                           pending_requested_at = NULL`,
                        calId,
                        user.id,
                        name,
                        nowIso()
                    );
                } else if (existing && existing.holder_user_id !== user.id) {
                    await recordLockEditRequest(env, calId, user);
                }
                const status = await lockStatus(env, calId, user.id);
                return json({
                    acquired: !status.readOnly,
                    lock: status.lock,
                    readOnly: status.readOnly,
                    editRequestRecorded: Boolean(existing && !stale && !heldByMe && !force)
                });
            }

            if (sub === '/lock' && request.method === 'DELETE') {
                const lock = await getLock(env, calId);
                if (!lock) {
                    return json({ ok: true, released: false });
                }
                if (lock.holder_user_id !== user.id) {
                    return json({ error: 'Only the current editor can release this lock', lock: await lockToClient(env, lock) }, 403);
                }
                await dbRun(env, 'DELETE FROM calendar_locks WHERE calendar_id = ?', calId);
                return json({ ok: true, released: true });
            }

            if (!sub && request.method === 'GET') {
                const row = await dbOne(
                    env,
                    'SELECT id, name, data, revision, updated_at AS updatedAt, updated_by AS updatedBy FROM calendars WHERE id = ?',
                    calId
                );
                if (!row) {
                    return json({ error: 'Calendar not found' }, 404);
                }
                const lock = await lockStatus(env, calId, user.id);
                return json(
                    Object.assign({}, row, {
                        data: JSON.parse(row.data),
                        lock: lock.lock,
                        readOnly: lock.readOnly
                    })
                );
            }

            if (!sub && request.method === 'PUT') {
                const body = await readJson(request);
                if (!body.data) {
                    return json({ error: 'data is required' }, 400);
                }
                const existing = await dbOne(env, 'SELECT revision, name FROM calendars WHERE id = ?', calId);
                if (!existing) {
                    return json({ error: 'Calendar not found' }, 404);
                }
                const lock = await lockStatus(env, calId, user.id);
                if (lock.readOnly && !body.force) {
                    return json({ error: 'Calendar is locked by another user', lock: lock.lock }, 423);
                }
                if (!body.force && body.revision != null && Number(body.revision) !== Number(existing.revision)) {
                    const doc = await dbOne(
                        env,
                        'SELECT id, name, data, revision, updated_at AS updatedAt, updated_by AS updatedBy FROM calendars WHERE id = ?',
                        calId
                    );
                    return json({ conflict: true, document: Object.assign({}, doc, { data: JSON.parse(doc.data) }) }, 409);
                }
                const nextRev = Number(existing.revision) + 1;
                const label = user.displayName || user.email || 'Teacher';
                const displayName = body.name != null ? String(body.name).trim() : existing.name;
                await dbRun(
                    env,
                    'UPDATE calendars SET name=?, data=?, revision=?, updated_at=?, updated_by=? WHERE id=?',
                    displayName,
                    JSON.stringify(body.data),
                    nextRev,
                    nowIso(),
                    label,
                    calId
                );
                const doc = await dbOne(
                    env,
                    'SELECT id, name, data, revision, updated_at AS updatedAt, updated_by AS updatedBy FROM calendars WHERE id = ?',
                    calId
                );
                return json(Object.assign({}, doc, { data: JSON.parse(doc.data) }));
            }

            if (!sub && request.method === 'DELETE') {
                if (user.role !== 'admin') {
                    return json({ error: 'Only admins can delete team calendars' }, 403);
                }
                await dbRun(env, 'DELETE FROM calendars WHERE id = ?', calId);
                await dbRun(env, 'DELETE FROM calendar_locks WHERE calendar_id = ?', calId);
                await CalAccess.deleteCalendarAccess(env, calId);
                return json({ ok: true });
            }
        }

        if (path === '/api/calendars' && request.method === 'POST') {
            const body = await readJson(request);
            if (!body.name || !body.data) {
                return json({ error: 'name and data are required' }, 400);
            }
            const id = uuid();
            const label = user.displayName || user.email || 'Teacher';
            await dbRun(
                env,
                'INSERT INTO calendars (id, name, data, revision, updated_at, updated_by) VALUES (?, ?, ?, 1, ?, ?)',
                id,
                String(body.name).trim(),
                JSON.stringify(body.data),
                nowIso(),
                label
            );
            const memberIds = Array.isArray(body.memberUserIds) ? body.memberUserIds.map(String) : [];
            if (!memberIds.includes(user.id)) {
                memberIds.push(user.id);
            }
            const groupIds = Array.isArray(body.groupIds) ? body.groupIds.map(String) : [];
            await CalAccess.setCalendarAccess(env, id, memberIds, groupIds, user.id);
            const doc = await dbOne(
                env,
                'SELECT id, name, data, revision, updated_at AS updatedAt, updated_by AS updatedBy FROM calendars WHERE id = ?',
                id
            );
            return json(Object.assign({}, doc, { data: JSON.parse(doc.data) }), 201);
        }

        if (path === '/api/admin/groups' && request.method === 'GET' && user.role === 'admin') {
            const groups = await CalAccess.listGroups(env);
            const out = [];
            for (const g of groups) {
                const memberIds = await CalAccess.getGroupMemberIds(env, g.id);
                out.push(Object.assign({}, g, { memberIds }));
            }
            return json(out);
        }

        if (path === '/api/admin/groups' && request.method === 'POST' && user.role === 'admin') {
            const body = await readJson(request);
            const name = body.name && String(body.name).trim();
            if (!name) {
                return json({ error: 'name is required' }, 400);
            }
            const gid = uuid();
            const created = await CalAccess.createGroup(env, gid, name, user.id);
            if (Array.isArray(body.memberIds) && body.memberIds.length) {
                await CalAccess.setGroupMembers(env, gid, body.memberIds);
            }
            const memberIds = await CalAccess.getGroupMemberIds(env, gid);
            return json(Object.assign({}, created, { memberIds }), 201);
        }

        const adminGroupMatch = path.match(/^\/api\/admin\/groups\/([^/]+)(\/members)?$/);
        if (adminGroupMatch && user.role === 'admin') {
            const groupId = adminGroupMatch[1];
            const isMembers = adminGroupMatch[2] === '/members';
            const existing = await CalAccess.getGroup(env, groupId);
            if (!existing) {
                return json({ error: 'Group not found' }, 404);
            }
            if (isMembers && request.method === 'PUT') {
                const body = await readJson(request);
                const memberIds = await CalAccess.setGroupMembers(env, groupId, body.memberIds || []);
                return json({ id: groupId, memberIds });
            }
            if (!isMembers && request.method === 'PATCH') {
                const body = await readJson(request);
                const updated = await CalAccess.updateGroupName(env, groupId, body.name || existing.name);
                const memberIds = await CalAccess.getGroupMemberIds(env, groupId);
                return json(Object.assign({}, updated, { memberIds }));
            }
            if (!isMembers && request.method === 'DELETE') {
                await CalAccess.deleteGroup(env, groupId);
                return json({ ok: true });
            }
        }

        if (path === '/api/admin/calendars' && request.method === 'GET' && user.role === 'admin') {
            return json(await CalAccess.listAdminCalendarsWithAccess(env));
        }

        const adminCalAccessMatch = path.match(/^\/api\/admin\/calendars\/([^/]+)\/access$/);
        if (adminCalAccessMatch && user.role === 'admin') {
            const calId = adminCalAccessMatch[1];
            const meta = await dbOne(env, 'SELECT id FROM calendars WHERE id = ?', calId);
            if (!meta) {
                return json({ error: 'Calendar not found' }, 404);
            }
            if (request.method === 'GET') {
                return json(await CalAccess.getCalendarAccess(env, calId));
            }
            if (request.method === 'PUT') {
                const body = await readJson(request);
                const result = await CalAccess.setCalendarAccess(
                    env,
                    calId,
                    body.userIds || [],
                    body.groupIds || [],
                    user.id
                );
                return json(result);
            }
        }

        if (path === '/api/admin/users' && request.method === 'GET' && user.role === 'admin') {
            const rows = await dbAll(
                env,
                'SELECT id, email, display_name, kakao_user_id, role, active, created_at FROM users ORDER BY display_name'
            );
            return json(rows.map(rowToUser));
        }

        if (path === '/api/admin/users' && request.method === 'POST' && user.role === 'admin') {
            const body = await readJson(request);
            const em = normalizeEmail(body.email);
            if (!em && !body.kakaoUserId) {
                return json({ error: 'email or kakaoUserId is required' }, 400);
            }
            const created = await createUser(env, {
                email: em,
                displayName: body.displayName || em || 'Teacher',
                role: body.role === 'admin' ? 'admin' : 'teacher',
                kakaoUserId: body.kakaoUserId || null,
                passwordHash: body.password ? await hashPassword(body.password) : null
            });
            return json(created, 201);
        }

        const adminUserMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/);
        if (adminUserMatch && request.method === 'PATCH' && user.role === 'admin') {
            const patchBody = await readJson(request);
            const targetId = adminUserMatch[1];
            const targetRow = await dbOne(env, 'SELECT * FROM users WHERE id = ?', targetId);
            if (!targetRow) {
                return json({ error: 'User not found' }, 404);
            }
            const nextRole = patchBody.role !== undefined ? patchBody.role : targetRow.role;
            const nextActive = patchBody.active !== undefined ? (patchBody.active ? 1 : 0) : targetRow.active;
            if (targetRow.role === 'admin' && nextActive === 0 && (await countAdmins(env)) <= 1) {
                return json({ error: 'Cannot deactivate the last admin' }, 403);
            }
            if (targetRow.role === 'admin' && nextRole !== 'admin' && (await countAdmins(env)) <= 1) {
                return json({ error: 'Cannot demote the last admin' }, 403);
            }
            const updated = await updateUser(env, targetId, {
                email: patchBody.email,
                displayName: patchBody.displayName,
                role: patchBody.role,
                active: patchBody.active,
                kakaoUserId: patchBody.kakaoUserId
            });
            if (!updated) {
                return json({ error: 'User not found' }, 404);
            }
            return json(updated);
        }

        return json({ error: 'Not found' }, 404);
    }
};
