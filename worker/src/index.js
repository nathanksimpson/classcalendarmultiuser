/**
 * Cloudflare Worker API — production deploy (Pages static + /api/* routed here).
 */
import * as CalAccess from './calendar-access.js';
import * as Auth from './auth-permissions.js';
import * as ActivityLog from './activity-log.js';
import * as Presence from './presence.js';
import * as Suggestions from './suggestions.js';
import * as NotificationMeta from './notification-meta.js';
import * as AccessRequests from './access-requests.js';
import * as AdminUserPolicy from './admin-user-policy.js';
import * as ViewAs from './view-as.js';
import * as AppSettings from './app-settings.js';
import { prepareDayNotesForSave } from './day-notes-access.js';
import { prepareClassroomForSave } from './classroom-access.js';
import {
    CALENDAR_DOC_SELECT,
    calendarDocForClient,
    parseDataObjectFromRow,
    serializeCalendarData
} from './calendar-storage.js';
import {
    KAKAO_OAUTH_COOKIE,
    oauthStateSecret,
    createKakaoOAuthState,
    verifyKakaoOAuthState,
    clearKakaoOAuthStateCookie,
    sanitizeReturnTo
} from './oauth-state.js';
import { rateLimitOr429 } from './rate-limit.js';
import {
    LOGIN_CONTEXT_PERSONAL,
    sanitizeLoginContext,
    resolveLoginProfile,
    sessionPolicyFromRow
} from './login-context.js';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { dbOne, dbAll, dbRun, nowIso } from './db.js';
import * as Lock from './lock.js';
import * as CalendarMeta from './calendar-meta.js';
import { findCalendarByName, assertCalendarNameAvailable } from './calendars.js';

const MAX_CALENDAR_BODY_BYTES = 5 * 1024 * 1024;
const RATE_AUTH_WINDOW_MS = 15 * 60 * 1000;

const SESSION_COOKIE = 'cal_session';
const PBKDF2_ITERATIONS = 100000;
const SESSION_DAYS = 14;
const MIN_PASSWORD_LENGTH = 8;

function json(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: Object.assign({ 'Content-Type': 'application/json' }, extraHeaders)
    });
}

function redirectTo(location, headers = {}) {
    return new Response(null, { status: 302, headers: Object.assign({ Location: location }, headers) });
}

function redirectWithCookie(location, setCookieValue) {
    const headers = new Headers();
    headers.set('Location', location);
    if (setCookieValue) {
        headers.append('Set-Cookie', setCookieValue);
    }
    return new Response(null, { status: 302, headers });
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

function sessionCookie(token, secure, maxAgeSec) {
    const maxAge = Number(maxAgeSec) > 0 ? Number(maxAgeSec) : SESSION_DAYS * 86400;
    const parts = [
        `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${maxAge}`
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
    const user = {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        kakaoUserId: row.kakao_user_id,
        role: row.role,
        permissions: row.permissions,
        active: Boolean(row.active)
    };
    user.effectivePermissions = Auth.getEffectivePermissions(user);
    return user;
}

async function deleteAllSessionsForUser(env, userId) {
    if (userId) {
        await Lock.releaseAllLocksHeldByUser(env, userId);
        await Presence.removePresence(env, userId);
        await dbRun(env, 'DELETE FROM sessions WHERE user_id = ?', userId);
    }
}

async function permanentlyDeleteUser(env, targetId, actingAdminId) {
    const target = await dbOne(env, 'SELECT * FROM users WHERE id = ?', targetId);
    if (!target) {
        return { error: 'User not found', status: 404 };
    }
    if (targetId === actingAdminId) {
        return { error: 'You cannot delete your own account', status: 403 };
    }
    if (target.active !== 0) {
        return { error: 'Deactivate the account before permanent delete', status: 403 };
    }
    if (Auth.isSuperAdminRole(target)) {
        const row = await dbOne(
            env,
            `SELECT COUNT(*) AS c FROM users WHERE role IN ('admin', 'super_admin')`
        );
        if (Number(row?.c || 0) <= 1) {
            return { error: 'Cannot delete the only super admin account', status: 403 };
        }
    }
    await dbRun(env, 'DELETE FROM sessions WHERE user_id = ?', targetId);
    await dbRun(env, 'DELETE FROM calendar_members WHERE user_id = ?', targetId);
    await dbRun(env, 'DELETE FROM group_members WHERE user_id = ?', targetId);
    await dbRun(env, 'DELETE FROM calendar_locks WHERE holder_user_id = ?', targetId);
    await dbRun(
        env,
        `UPDATE calendar_locks SET pending_requester_id = NULL, pending_requester_name = NULL, pending_requested_at = NULL WHERE pending_requester_id = ?`,
        targetId
    );
    await dbRun(env, 'DELETE FROM users WHERE id = ?', targetId);
    return { ok: true };
}

async function createSession(env, userId, deviceContext, options) {
    const admin = await AppSettings.getAdminSettings(env);
    const profile = resolveLoginProfile(deviceContext, admin);
    const maxAgeSec = profile.sessionMaxAgeSec;
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expires = new Date(Date.now() + maxAgeSec * 1000).toISOString();
    const viewAsUserId =
        options && options.viewAsUserId ? String(options.viewAsUserId) : null;
    await dbRun(
        env,
        `INSERT INTO sessions (token, user_id, expires_at, login_context, idle_logout_minutes, idle_warning_minutes, view_as_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        token,
        userId,
        expires,
        profile.loginContext,
        profile.idleLogoutMinutes,
        profile.idleWarningMinutes,
        viewAsUserId
    );
    return {
        token,
        maxAgeSec,
        loginContext: profile.loginContext,
        idleLogoutMinutes: profile.idleLogoutMinutes,
        idleWarningMinutes: profile.idleWarningMinutes
    };
}

async function createViewAsSession(env, actorUserId, targetUserId, deviceContext) {
    return createSession(env, actorUserId, deviceContext, { viewAsUserId: targetUserId });
}

function applySessionPolicyToUser(user, sessionRow, admin) {
    const policy = sessionPolicyFromRow(sessionRow, admin);
    user.loginContext = policy.loginContext;
    user.idleLogoutMinutes = policy.idleLogoutMinutes;
    user.idleWarningMinutes = policy.idleWarningMinutes;
    return user;
}

async function getSessionContext(env, token) {
    if (!token) {
        return { effective: null, actor: null, viewAsActive: false, token: null };
    }
    const sessionRow = await dbOne(
        env,
        `SELECT token, user_id, expires_at, view_as_user_id, login_context, idle_logout_minutes, idle_warning_minutes
         FROM sessions WHERE token = ?`,
        token
    );
    if (!sessionRow) {
        return { effective: null, actor: null, viewAsActive: false, token: null };
    }
    if (new Date(sessionRow.expires_at).getTime() < Date.now()) {
        await dbRun(env, 'DELETE FROM sessions WHERE token = ?', token);
        return { effective: null, actor: null, viewAsActive: false, token: null };
    }
    const actorRow = await dbOne(env, 'SELECT * FROM users WHERE id = ? AND active = 1', sessionRow.user_id);
    if (!actorRow) {
        await dbRun(env, 'DELETE FROM sessions WHERE token = ?', token);
        return { effective: null, actor: null, viewAsActive: false, token: null };
    }
    const admin = await AppSettings.getAdminSettings(env);
    const actor = applySessionPolicyToUser(rowToUser(actorRow), sessionRow, admin);
    if (sessionRow.view_as_user_id) {
        if (!Auth.isSuperAdminRole(actor)) {
            await dbRun(env, 'DELETE FROM sessions WHERE token = ?', token);
            return { effective: null, actor: null, viewAsActive: false, token: null };
        }
        const targetRow = await dbOne(
            env,
            'SELECT * FROM users WHERE id = ? AND active = 1',
            sessionRow.view_as_user_id
        );
        if (!targetRow) {
            await dbRun(env, 'DELETE FROM sessions WHERE token = ?', token);
            return { effective: null, actor: null, viewAsActive: false, token: null };
        }
        const effective = applySessionPolicyToUser(rowToUser(targetRow), sessionRow, admin);
        effective.viewAsActive = true;
        effective.actorUserId = actor.id;
        effective.actorDisplayName = actor.displayName || actor.email || 'Admin';
        effective.sessionToken = token;
        return { effective, actor, viewAsActive: true, token };
    }
    return { effective: actor, actor, viewAsActive: false, token };
}

async function getSessionUser(env, token) {
    const ctx = await getSessionContext(env, token);
    return ctx.effective;
}

async function createLoginSession(env, userId, deviceContext) {
    await deleteAllSessionsForUser(env, userId);
    return createSession(env, userId, deviceContext);
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
        const attempt = scryptSync(password, salt, 64).toString('hex');
        return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
    } catch (_) {
        return false;
    }
}

async function countSuperAdmins(env) {
    const row = await dbOne(
        env,
        `SELECT COUNT(*) AS c FROM users WHERE active = 1 AND role IN ('admin', 'super_admin')`
    );
    return Number(row?.c || 0);
}

async function countAdmins(env) {
    return countSuperAdmins(env);
}

async function verifyUserPassword(env, userId, password) {
    if (!userId || password == null || password === '') {
        return false;
    }
    const row = await dbOne(env, 'SELECT password_hash FROM users WHERE id = ?', userId);
    if (!row || !row.password_hash) {
        return false;
    }
    return verifyPassword(String(password), row.password_hash);
}

function makeAdminPolicyDeps(env) {
    return {
        getActorRow: (id) => dbOne(env, 'SELECT password_hash FROM users WHERE id = ?', id),
        verifyUserPassword: (id, pwd) => verifyUserPassword(env, id, pwd)
    };
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

async function createUser(env, { email, displayName, kakaoUserId, role, passwordHash, permissions }) {
    const id = uuid();
    const em = normalizeEmail(email);
    const assignedRole = Auth.normalizeAssignableRole(role || 'teacher');
    const permsJson =
        permissions != null
            ? typeof permissions === 'string'
                ? permissions
                : JSON.stringify(permissions)
            : null;
    await dbRun(
        env,
        `INSERT INTO users (id, email, display_name, kakao_user_id, password_hash, role, permissions, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        id,
        em,
        displayName || '',
        kakaoUserId ? String(kakaoUserId) : null,
        passwordHash || null,
        assignedRole,
        permsJson,
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
    const role = fields.role != null ? Auth.normalizeAssignableRole(fields.role) : existing.role;
    let permissions = existing.permissions;
    if (fields.permissions !== undefined) {
        permissions =
            fields.permissions == null
                ? null
                : typeof fields.permissions === 'string'
                  ? fields.permissions
                  : JSON.stringify(fields.permissions);
    }
    await dbRun(
        env,
        `UPDATE users SET email = ?, display_name = ?, kakao_user_id = ?, role = ?, permissions = ?, active = ? WHERE id = ?`,
        email,
        displayName,
        kakaoUserId,
        role,
        permissions,
        active,
        id
    );
    if (fields.displayName != null) {
        const label = String(displayName || '').trim();
        await dbRun(env, 'UPDATE calendar_locks SET holder_name = ? WHERE holder_user_id = ?', label, id);
        await dbRun(
            env,
            'UPDATE calendar_locks SET pending_requester_name = ? WHERE pending_requester_id = ?',
            label,
            id
        );
    }
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
            const linkedKid = byEmail.kakao_user_id ? String(byEmail.kakao_user_id) : null;
            if (linkedKid && kid && linkedKid !== kid) {
                return { mismatch: true };
            }
            if (linkedKid && kid && linkedKid === kid) {
                return rowToUser(byEmail);
            }
            if (!linkedKid && kid) {
                return { needsKakaoLink: true };
            }
            if (!linkedKid && !kid) {
                return rowToUser(byEmail);
            }
        }
    }
    return null;
}

async function findInactiveUserForKakao(env, kakaoUserId, email) {
    const kid = kakaoUserId ? String(kakaoUserId) : null;
    const em = normalizeEmail(email);
    if (kid) {
        const byKid = await dbOne(env, 'SELECT * FROM users WHERE kakao_user_id = ? AND active = 0', kid);
        if (byKid) {
            return rowToUser(byKid);
        }
    }
    if (em) {
        const byEmail = await dbOne(env, 'SELECT * FROM users WHERE email = ? AND active = 0', em);
        if (byEmail) {
            return rowToUser(byEmail);
        }
    }
    return null;
}

function isUniqueConstraintError(err) {
    const msg = String((err && err.message) || '');
    return msg.includes('UNIQUE') || msg.includes('constraint');
}

async function provisionUserFromKakaoProfile(env, profile) {
    const kid = profile && profile.kakaoUserId ? String(profile.kakaoUserId) : '';
    if (!kid) {
        return null;
    }
    try {
        const nickname = profile.nickname && String(profile.nickname).trim();
        const created = await createUser(env, {
            email: profile.email || null,
            displayName: nickname || `Kakao ${kid}`,
            kakaoUserId: kid,
            role: 'teacher'
        });
        if (created) {
            try {
                await AccessRequests.notifyUserNeedsAccess(env, created, { source: 'kakao_signup' });
            } catch (_) {
                /* ignore */
            }
        }
        return created;
    } catch (err) {
        if (isUniqueConstraintError(err)) {
            const again = await findUserForKakao(env, profile.kakaoUserId, profile.email);
            if (again && !again.mismatch && !again.needsKakaoLink) {
                return again;
            }
        }
        throw err;
    }
}

async function resolveKakaoLoginUser(env, profile) {
    const match = await findUserForKakao(env, profile.kakaoUserId, profile.email);
    if (match && match.mismatch) {
        return { error: 'kakao_mismatch' };
    }
    if (match && match.needsKakaoLink) {
        return { error: 'kakao_not_linked' };
    }
    if (match) {
        return { user: match, created: false };
    }
    if (await findInactiveUserForKakao(env, profile.kakaoUserId, profile.email)) {
        return { disabled: true };
    }
    const created = await provisionUserFromKakaoProfile(env, profile);
    if (!created || created.mismatch || created.needsKakaoLink) {
        return { error: 'missing_kakao_id' };
    }
    return { user: created, created: true };
}

function kakaoLoginErrorRedirect(code) {
    return '/login.html?error=' + encodeURIComponent(code);
}

function sanitizeKakaoOAuthPrompt(value) {
    const p = value && String(value).trim();
    if (p === 'login' || p === 'select_account') {
        return p;
    }
    return null;
}

function kakaoOAuthScopes(env) {
    const raw = env.KAKAO_OAUTH_SCOPES || '';
    return raw && String(raw).trim() ? String(raw).trim() : '';
}

function kakaoErrorDetail(err) {
    const body = (err && err.body) || {};
    const parts = [
        err && err.message,
        body.error_description,
        body.error,
        body.error_code
    ].filter(Boolean);
    return String(parts[0] || 'unknown').slice(0, 200);
}

function classifyKakaoOAuthError(err) {
    const msg = String((err && err.message) || '').toLowerCase();
    const body = (err && err.body) || {};
    const code = String(body.error || '').toLowerCase();
    const errCode = String(body.error_code || '').toUpperCase();
    if (
        msg.includes('client_secret') ||
        msg.includes('bad client credentials') ||
        code === 'invalid_client' ||
        errCode === 'KOE029'
    ) {
        return 'kakao_client_secret';
    }
    if (msg.includes('redirect_uri') || msg.includes('redirect uri') || errCode === 'KOE006') {
        return 'redirect_uri_mismatch';
    }
    if (msg.includes('invalid_grant') || msg.includes('authorization code') || errCode === 'KOE322') {
        return 'oauth_code_expired';
    }
    if (errCode === 'KOE205') {
        return 'invalid_scope';
    }
    return 'oauth_failed';
}

function loginRedirectForKakaoError(err) {
    const code = classifyKakaoOAuthError(err);
    return `/login.html?error=${encodeURIComponent(code)}`;
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
        const err = new Error(json.error_description || json.error || 'token failed');
        err.body = json;
        throw err;
    }
    return json;
}

async function kakaoMe(accessToken) {
    const res = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
        }
    });
    const json = await res.json();
    if (!res.ok) {
        const err = new Error(json.msg || json.error_description || 'profile failed');
        err.body = json;
        throw err;
    }
    if (json.id == null || json.id === undefined) {
        throw new Error('Kakao profile missing user id');
    }
    const account = json.kakao_account || {};
    let email = account.email || null;
    if (account.email_needs_agreement === true) {
        email = null;
    }
    return {
        kakaoUserId: String(json.id),
        email,
        nickname:
            (account.profile && account.profile.nickname) ||
            (json.properties && json.properties.nickname) ||
            ''
    };
}

function publicUrl(env, request) {
    return (env.PUBLIC_URL || new URL(request.url).origin).replace(/\/$/, '');
}

function kakaoRedirectUri(env, request) {
    return env.KAKAO_REDIRECT_URI || publicUrl(env, request) + '/api/auth/kakao/callback';
}

async function requireUser(request, env) {
    const ctx = await resolveRequestContext(env, request);
    if (!ctx || !ctx.effective) {
        return null;
    }
    return ctx.effective;
}

async function resolveRequestContext(env, request) {
    const viewAsToken = ViewAs.getViewAsSessionHeader(request);
    if (viewAsToken) {
        return getSessionContext(env, viewAsToken);
    }
    return getSessionContext(env, parseCookies(request)[SESSION_COOKIE] || '');
}

async function requireCookieUser(request, env) {
    const ctx = await getSessionContext(env, parseCookies(request)[SESSION_COOKIE] || '');
    if (!ctx || !ctx.effective || ctx.viewAsActive) {
        return null;
    }
    return ctx.effective;
}

function buildAuthMePayload(user, actorUser) {
    const payload = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: Auth.normalizeRole(user.role),
        roleRaw: user.role,
        permissions: Auth.getEffectivePermissions(user),
        canAccessAdmin: Auth.canAccessAdminPage(user),
        canForceUnlock: Auth.canForceUnlock(user),
        hasCalendarAccess: false,
        loginContext: user.loginContext || LOGIN_CONTEXT_PERSONAL,
        idleLogoutMinutes: user.idleLogoutMinutes,
        idleWarningMinutes: user.idleWarningMinutes
    };
    const viewAsMeta = ViewAs.buildAuthMeViewAs(user, actorUser);
    if (viewAsMeta) {
        payload.viewAs = viewAsMeta;
    }
    return payload;
}

function requestBodyTooLarge(request, maxBytes) {
    const cl = request.headers.get('Content-Length');
    if (cl && Number(cl) > maxBytes) {
        return true;
    }
    return false;
}

async function readJson(request, maxBytes = MAX_CALENDAR_BODY_BYTES) {
    if (requestBodyTooLarge(request, maxBytes)) {
        const err = new Error('Payload too large');
        err.status = 413;
        throw err;
    }
    try {
        return await request.json();
    } catch (_) {
        return {};
    }
}

async function readPasswordLoginBody(request) {
    const ct = (request.headers.get('Content-Type') || '').toLowerCase();
    if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
        const form = await request.formData();
        return {
            email: String(form.get('email') || form.get('username') || ''),
            password: String(form.get('password') || ''),
            returnTo: sanitizeReturnTo(String(form.get('return') || '/')),
            device: sanitizeLoginContext(String(form.get('device') || form.get('loginContext') || '')),
            wantsRedirect: true
        };
    }
    const body = await readJson(request);
    return {
        email: body.email || body.username,
        password: body.password,
        returnTo: sanitizeReturnTo(body.return || '/'),
        device: sanitizeLoginContext(body.device || body.loginContext),
        wantsRedirect: false
    };
}

function escapeHtmlAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;');
}

function passwordLoginSuccessHtml(returnTo) {
    const safeUrl = escapeHtmlAttr(returnTo);
    const safeJs = String(returnTo).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Signing in…</title>
<meta http-equiv="refresh" content="0;url=${safeUrl}">
</head>
<body>
<p>Signing in…</p>
<script>location.replace('${safeJs}');</script>
</body>
</html>`;
}

async function loginRedirectAfterAuth(env, user, returnTo, options) {
    const opts = options || {};
    if (!(await AccessRequests.userHasCalendarAccessAsync(env, user))) {
        return opts.welcome ? '/pending-access.html?welcome=1' : '/pending-access.html';
    }
    return sanitizeReturnTo(returnTo || '/');
}

function passwordLoginSuccessResponse(returnTo, cookie) {
    const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8' });
    if (cookie) {
        headers.append('Set-Cookie', cookie);
    }
    return new Response(passwordLoginSuccessHtml(returnTo), { status: 200, headers });
}

async function handlePasswordLogin(request, env, secure, htmlSuccess) {
    let loginBody;
    try {
        loginBody = await readPasswordLoginBody(request);
        const limited = await rateLimitOr429(env, request, 'auth_password', 25, RATE_AUTH_WINDOW_MS);
        if (limited) {
            if (loginBody.wantsRedirect || htmlSuccess) {
                return passwordLoginErrorRedirect(loginBody.returnTo, 'too_many_requests');
            }
            return limited;
        }
        const em = normalizeEmail(loginBody.email);
        const row = em
            ? await dbOne(env, 'SELECT * FROM users WHERE email = ? AND active = 1', em)
            : null;
        const storedHash = row && (row.password_hash || row.PASSWORD_HASH);
        if (row && !storedHash) {
            if (loginBody.wantsRedirect || htmlSuccess) {
                return passwordLoginErrorRedirect(loginBody.returnTo, 'password_not_set');
            }
            return json(
                {
                    error:
                        'No password is set for this account. Sign in with Kakao, or ask an admin to set a password for you.'
                },
                401
            );
        }
        const matched =
            row && storedHash && (await verifyPassword(loginBody.password, storedHash))
                ? rowToUser(row)
                : null;
        if (!matched) {
            if (loginBody.wantsRedirect || htmlSuccess) {
                return passwordLoginErrorRedirect(loginBody.returnTo, 'invalid_password');
            }
            return json({ error: 'Invalid email or password' }, 401);
        }
        const session = await createLoginSession(env, matched.id, loginBody.device);
        const cookie = sessionCookie(session.token, secure, session.maxAgeSec);
        const dest = await loginRedirectAfterAuth(env, matched, loginBody.returnTo);
        if (htmlSuccess) {
            return passwordLoginSuccessResponse(dest, cookie);
        }
        if (loginBody.wantsRedirect) {
            return redirectWithCookie(dest, cookie);
        }
        return json(
            {
                id: matched.id,
                email: matched.email,
                displayName: matched.displayName,
                role: matched.role
            },
            200,
            { 'Set-Cookie': cookie }
        );
    } catch (err) {
        console.error('Password login error:', err && err.message ? err.message : err);
        const ret = loginBody ? loginBody.returnTo : '/';
        if ((loginBody && loginBody.wantsRedirect) || htmlSuccess) {
            return passwordLoginErrorRedirect(ret, 'sign_in_failed');
        }
        return json({ error: 'Sign-in failed. Try again or use Kakao login.' }, 500);
    }
}

function passwordLoginErrorRedirect(returnTo, code) {
    const q = new URLSearchParams({ error: code });
    if (returnTo && returnTo !== '/') {
        q.set('return', returnTo);
    }
    return redirectTo(`/login.html?${q.toString()}`);
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        // Use the actual request scheme — PUBLIC_URL is https even on wrangler dev (http://localhost).
        const secure = url.protocol === 'https:';
        const kakaoId = (env.KAKAO_CLIENT_ID || '').trim();

        if (!path.startsWith('/api/')) {
            // Support friendly admin URL and avoid broken relative asset paths.
            if (path === '/admin' || path === '/admin/') {
                return redirectTo('/admin.html');
            }
            if (path === '/admin.html' && env.ASSETS) {
                const adminUser = await requireCookieUser(request, env);
                if (!adminUser || !Auth.canAccessAdminPage(adminUser)) {
                    return redirectTo(`/login.html?return=${encodeURIComponent('/admin.html')}`);
                }
            }
            if (env.ASSETS) {
                return env.ASSETS.fetch(request);
            }
            return new Response('Not found', { status: 404 });
        }

        if (path === '/api/health') {
            const adminCount = await countAdmins(env);
            return json({
                ok: true,
                time: nowIso(),
                auth: Boolean(kakaoId),
                kakaoConfigured: Boolean(kakaoId),
                kakaoClientSecretConfigured: Boolean(kakaoId && env.KAKAO_CLIENT_SECRET),
                kakaoRedirectUri: kakaoId ? kakaoRedirectUri(env, request) : null,
                passwordAuth: true,
                openAccess: false,
                needsBootstrap: adminCount === 0
            });
        }

        if (path === '/api/auth/kakao/config' && request.method === 'GET') {
            return json({
                configured: Boolean(kakaoId),
                redirectUri: kakaoId ? kakaoRedirectUri(env, request) : null,
                scopes: kakaoOAuthScopes(env) || null
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
            const ctx = await resolveRequestContext(env, request);
            if (!ctx || !ctx.effective) {
                return json({ error: 'Not signed in' }, 401);
            }
            const user = ctx.effective;
            const calendars = await CalAccess.listCalendarsForUser(env, user);
            const payload = buildAuthMePayload(user, ctx.actor);
            payload.hasCalendarAccess = CalAccess.canViewAllCalendars(user) || calendars.length > 0;
            return json(payload);
        }

        if (path === '/api/auth/logout' && request.method === 'POST') {
            const token = parseCookies(request)[SESSION_COOKIE];
            if (token) {
                const sessionRow = await dbOne(env, 'SELECT user_id FROM sessions WHERE token = ?', token);
                if (sessionRow && sessionRow.user_id) {
                    await Lock.releaseAllLocksHeldByUser(env, sessionRow.user_id);
                    await Presence.removePresence(env, sessionRow.user_id);
                }
                await dbRun(env, 'DELETE FROM sessions WHERE token = ?', token);
            }
            return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(secure) });
        }

        if (path === '/api/auth/logout-all' && request.method === 'POST') {
            const logoutUser = await requireUser(request, env);
            if (!logoutUser) {
                return json({ error: 'Not signed in' }, 401);
            }
            await deleteAllSessionsForUser(env, logoutUser.id);
            return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(secure) });
        }

        if (path === '/api/auth/kakao' && request.method === 'GET') {
            if (!kakaoId) {
                return new Response('Kakao not configured', { status: 503 });
            }
            const limited = await rateLimitOr429(env, request, 'auth_kakao_start', 40, RATE_AUTH_WINDOW_MS);
            if (limited) {
                return limited;
            }
            const returnTo = url.searchParams.get('return') || '/';
            const device = sanitizeLoginContext(
                url.searchParams.get('device') || url.searchParams.get('loginContext')
            );
            let prompt = sanitizeKakaoOAuthPrompt(url.searchParams.get('prompt'));
            const adminSettings = await AppSettings.getAdminSettings(env);
            const profile = resolveLoginProfile(device, adminSettings);
            if (!prompt && profile.kakaoPrompt) {
                prompt = profile.kakaoPrompt;
            }
            const oauthSecret = oauthStateSecret(env);
            const oauthState = await createKakaoOAuthState(returnTo, oauthSecret, secure, device);
            const params = new URLSearchParams({
                client_id: kakaoId,
                redirect_uri: kakaoRedirectUri(env, request),
                response_type: 'code',
                state: oauthState.state
            });
            if (prompt) {
                params.set('prompt', prompt);
            }
            const scope = kakaoOAuthScopes(env);
            if (scope) {
                params.set('scope', scope);
            }
            const headers = new Headers({ Location: 'https://kauth.kakao.com/oauth/authorize?' + params.toString() });
            headers.append('Set-Cookie', oauthState.setCookie);
            return new Response(null, { status: 302, headers });
        }

        if (path === '/api/auth/kakao/callback' && request.method === 'GET') {
            const limited = await rateLimitOr429(env, request, 'auth_kakao_callback', 40, RATE_AUTH_WINDOW_MS);
            if (limited) {
                return limited;
            }
            if (url.searchParams.get('error')) {
                return redirectTo('/login.html?error=oauth_denied');
            }
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state') || '';
            const oauthSecret = oauthStateSecret(env);
            const verified = await verifyKakaoOAuthState(
                state,
                parseCookies(request)[KAKAO_OAUTH_COOKIE],
                oauthSecret
            );
            if (!verified.ok) {
                return redirectTo('/login.html?error=oauth_state_invalid');
            }
            const returnTo = verified.returnTo;
            if (!code || !kakaoId) {
                return redirectTo('/login.html?error=missing_code');
            }
            try {
                const tokens = await kakaoToken(
                    code,
                    kakaoRedirectUri(env, request),
                    kakaoId,
                    (env.KAKAO_CLIENT_SECRET || '').trim()
                );
                const profile = await kakaoMe(tokens.access_token);
                const resolved = await resolveKakaoLoginUser(env, profile);
                if (resolved.disabled) {
                    return redirectTo('/login.html?error=account_disabled');
                }
                if (resolved.error) {
                    return redirectTo(kakaoLoginErrorRedirect(resolved.error));
                }
                if (!resolved.user) {
                    return redirectTo('/login.html?error=missing_kakao_id');
                }
                const session = await createLoginSession(env, resolved.user.id, verified.loginContext);
                const headers = new Headers({
                    Location: await loginRedirectAfterAuth(env, resolved.user, returnTo, {
                        welcome: Boolean(resolved.created)
                    }),
                    'Set-Cookie': sessionCookie(session.token, secure, session.maxAgeSec)
                });
                headers.append('Set-Cookie', clearKakaoOAuthStateCookie(secure));
                return new Response(null, { status: 302, headers });
            } catch (err) {
                console.error('Kakao callback error:', kakaoErrorDetail(err));
                return redirectTo(loginRedirectForKakaoError(err));
            }
        }

        if (path === '/api/login' && request.method === 'POST') {
            return handlePasswordLogin(request, env, secure, true);
        }

        if (path === '/api/auth/password' && request.method === 'POST') {
            return handlePasswordLogin(request, env, secure, false);
        }

        if (path === '/api/admin/bootstrap' && request.method === 'POST') {
            const limited = await rateLimitOr429(env, request, 'admin_bootstrap', 15, RATE_AUTH_WINDOW_MS);
            if (limited) {
                return limited;
            }
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
                role: 'super_admin',
                passwordHash: body.password ? await hashPassword(body.password) : null
            });
            const session = await createLoginSession(env, created.id, LOGIN_CONTEXT_PERSONAL);
            return json(
                { ok: true, userId: created.id },
                201,
                { 'Set-Cookie': sessionCookie(session.token, secure, session.maxAgeSec) }
            );
        }

        if (path === '/api/admin/view-as/activate' && request.method === 'POST') {
            const body = await readJson(request);
            const viewAsSessionToken = await ViewAs.redeemExchange(env, body.exchangeToken);
            if (!viewAsSessionToken) {
                return json({ error: 'Invalid or expired View As link' }, 400);
            }
            const ctx = await getSessionContext(env, viewAsSessionToken);
            if (!ctx || !ctx.viewAsActive || !ctx.effective) {
                return json({ error: 'Invalid View As session' }, 400);
            }
            return json({ viewAsSessionToken });
        }

        if (path === '/api/admin/view-as/exit' && request.method === 'POST') {
            const viewAsToken = ViewAs.getViewAsSessionHeader(request);
            if (!viewAsToken) {
                return json({ error: 'Not in View As mode' }, 400);
            }
            const ctx = await getSessionContext(env, viewAsToken);
            if (!ctx || !ctx.viewAsActive) {
                return json({ error: 'Not in View As mode' }, 400);
            }
            await ViewAs.exitViewAsSession(env, viewAsToken);
            if (ctx.actor) {
                await ActivityLog.recordActivityForUser(env, ctx.actor, {
                    action: 'view_as_exit',
                    summary: `Stopped viewing as ${ctx.effective.displayName || ctx.effective.email || ctx.effective.id}`,
                    detail: { targetUserId: ctx.effective.id }
                });
            }
            return json({ ok: true });
        }

        if (path === '/api/admin/view-as' && request.method === 'POST') {
            const actor = await requireCookieUser(request, env);
            if (!actor) {
                return json({ error: 'Not signed in' }, 401);
            }
            if (!Auth.isSuperAdminRole(actor)) {
                return json({ error: 'Super admin only' }, 403);
            }
            try {
                const body = await readJson(request);
                const target = await dbOne(env, 'SELECT * FROM users WHERE id = ?', String(body.userId || ''));
                ViewAs.assertViewAsTargetAllowed(actor, target ? rowToUser(target) : null);
                const device = sanitizeLoginContext(body.device || body.loginContext || '');
                const session = await createViewAsSession(env, actor.id, String(body.userId), device);
                const exchangeToken = await ViewAs.createExchange(env, session.token);
                const targetUser = rowToUser(target);
                await ActivityLog.recordActivityForUser(env, actor, {
                    action: 'view_as_start',
                    summary: `View as ${targetUser.displayName || targetUser.email || targetUser.id}`,
                    detail: { targetUserId: targetUser.id }
                });
                return json({
                    exchangeToken,
                    target: {
                        id: targetUser.id,
                        displayName: targetUser.displayName,
                        email: targetUser.email
                    }
                });
            } catch (err) {
                return json({ error: err.message || 'View As failed' }, err.status || 500);
            }
        }

        const isAdminApi =
            path.startsWith('/api/admin/') &&
            path !== '/api/admin/view-as/activate' &&
            !(path === '/api/admin/view-as' && request.method === 'POST') &&
            !(path === '/api/admin/view-as/exit' && request.method === 'POST');

        let userCtx;
        if (isAdminApi) {
            userCtx = await getSessionContext(env, parseCookies(request)[SESSION_COOKIE] || '');
            if (!userCtx || !userCtx.effective || userCtx.viewAsActive) {
                return json({ error: 'Not signed in' }, 401);
            }
            if (!Auth.canAccessAdminPage(userCtx.effective)) {
                return json({ error: 'Admin access required' }, 403);
            }
        } else {
            userCtx = await resolveRequestContext(env, request);
        }
        if (!userCtx || !userCtx.effective) {
            return json({ error: 'Not signed in' }, 401);
        }
        const user = userCtx.effective;
        const viewAsSession = Boolean(userCtx.viewAsActive);

        function rejectViewAsJson() {
            if (viewAsSession) {
                return json({ error: 'Changes are not saved in View As mode', code: 'VIEW_AS_MODE' }, 403);
            }
            return null;
        }

        if (path === '/api/auth/change-password' && request.method === 'POST') {
            const blocked = rejectViewAsJson();
            if (blocked) {
                return blocked;
            }
            const body = await readJson(request);
            const current = String(body.currentPassword || '');
            const newPwd = String(body.newPassword || '');
            if (newPwd.length < MIN_PASSWORD_LENGTH) {
                return json({ error: 'Password must be at least 8 characters' }, 400);
            }
            const row = await dbOne(env, 'SELECT * FROM users WHERE id = ? AND active = 1', user.id);
            if (!row || !row.password_hash) {
                return json({ error: 'No password set — contact your admin' }, 400);
            }
            if (!(await verifyPassword(current, row.password_hash))) {
                return json({ error: 'Current password is incorrect' }, 401);
            }
            await dbRun(
                env,
                'UPDATE users SET password_hash = ? WHERE id = ?',
                await hashPassword(newPwd),
                user.id
            );
            await deleteAllSessionsForUser(env, user.id);
            const session = await createSession(env, user.id, user.loginContext);
            return json(
                { ok: true },
                200,
                { 'Set-Cookie': sessionCookie(session.token, secure, session.maxAgeSec) }
            );
        }

        if (path === '/api/auth/verify-password' && request.method === 'POST') {
            const blocked = rejectViewAsJson();
            if (blocked) {
                return blocked;
            }
            const body = await readJson(request);
            const password = String((body && body.password) || '');
            const row = await dbOne(env, 'SELECT * FROM users WHERE id = ? AND active = 1', user.id);
            if (!row || !row.password_hash || !(await verifyPassword(password, row.password_hash))) {
                return json({ error: 'Invalid password' }, 403);
            }
            return json({ ok: true });
        }

        const MAX_DISPLAY_NAME_LENGTH = 120;
        if (path === '/api/auth/profile' && request.method === 'PATCH') {
            const blocked = rejectViewAsJson();
            if (blocked) {
                return blocked;
            }
            const body = await readJson(request);
            const name = String((body && body.displayName) || '').trim();
            if (!name) {
                return json({ error: 'Display name is required' }, 400);
            }
            if (name.length > MAX_DISPLAY_NAME_LENGTH) {
                return json(
                    { error: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer` },
                    400
                );
            }
            const updated = await updateUser(env, user.id, { displayName: name });
            if (!updated) {
                return json({ error: 'Not signed in' }, 401);
            }
            const calendars = await CalAccess.listCalendarsForUser(env, updated);
            const hasCalendarAccess = CalAccess.canViewAllCalendars(updated) || calendars.length > 0;
            return json({
                id: updated.id,
                email: updated.email,
                displayName: updated.displayName,
                role: updated.role,
                hasCalendarAccess,
                loginContext: user.loginContext || LOGIN_CONTEXT_PERSONAL,
                idleLogoutMinutes: user.idleLogoutMinutes,
                idleWarningMinutes: user.idleWarningMinutes
            });
        }

        if (path === '/api/access-request/me' && request.method === 'GET') {
            return json(await AccessRequests.getAccessRequestStatus(env, user));
        }

        if (path === '/api/access-request' && request.method === 'POST') {
            const blocked = rejectViewAsJson();
            if (blocked) {
                return blocked;
            }
            return json(await AccessRequests.registerAccessRequest(env, user));
        }

        if (path === '/api/calendars' && request.method === 'GET') {
            const rows = await CalAccess.listCalendarsForUser(env, user);
            return json(rows);
        }

        if (path === '/api/teachers' && request.method === 'GET') {
            const calendars = await CalAccess.listCalendarsForUser(env, user);
            const hasCalendarAccess =
                CalAccess.canViewAllCalendars(user) || calendars.length > 0;
            if (!hasCalendarAccess) {
                return json({ error: 'No calendar access' }, 403);
            }
            return json(await CalAccess.listTeachers(env));
        }

        if (path === '/api/groups' && request.method === 'GET') {
            const calendars = await CalAccess.listCalendarsForUser(env, user);
            const hasCalendarAccess =
                CalAccess.canViewAllCalendars(user) || calendars.length > 0;
            if (!hasCalendarAccess) {
                return json({ error: 'No calendar access' }, 403);
            }
            const groups = await CalAccess.listGroups(env);
            return json(groups);
        }

        if (path === '/api/presence/heartbeat' && request.method === 'POST') {
            const blocked = rejectViewAsJson();
            if (blocked) {
                return blocked;
            }
            const body = await readJson(request);
            await Presence.upsertPresence(env, user, body);
            return json({ ok: true });
        }

        const notifyMetaDismissMatch = path.match(
            /^\/api\/calendars\/([^/]+)\/notification-meta\/([^/]+)\/dismiss$/
        );
        if (notifyMetaDismissMatch && request.method === 'PATCH') {
            const calId = notifyMetaDismissMatch[1];
            if (!(await CalAccess.canAccessCalendar(env, user, calId))) {
                return json({ error: 'Calendar not found' }, 404);
            }
            const blocked = rejectViewAsJson();
            if (blocked) {
                return blocked;
            }
            const notificationId = decodeURIComponent(notifyMetaDismissMatch[2] || '');
            const body = await readJson(request);
            const dismissedAt =
                body && body.dismissedAt != null ? body.dismissedAt : undefined;
            return json(
                await NotificationMeta.dismissOne(env, user.id, calId, notificationId, dismissedAt)
            );
        }

        const notifyMetaMatch = path.match(/^\/api\/calendars\/([^/]+)\/notification-meta$/);
        if (notifyMetaMatch) {
            const calId = notifyMetaMatch[1];
            if (!(await CalAccess.canAccessCalendar(env, user, calId))) {
                return json({ error: 'Calendar not found' }, 404);
            }
            if (request.method === 'GET') {
                return json(await NotificationMeta.listMeta(env, user.id, calId));
            }
            if (request.method === 'PUT') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                const body = await readJson(request);
                const entries = body && body.meta && typeof body.meta === 'object' ? body.meta : body;
                return json(
                    await NotificationMeta.upsertEntries(env, user.id, calId, entries || {})
                );
            }
        }

        const suggestionMatch = path.match(
            /^\/api\/calendars\/([^/]+)\/suggestions(?:\/([^/]+)(\/apply|\/dismiss)?)?$/
        );
        if (suggestionMatch) {
            const calId = suggestionMatch[1];
            const suggestionId = suggestionMatch[2];
            const suggestionAction = suggestionMatch[3];
            if (!(await CalAccess.canAccessCalendar(env, user, calId))) {
                return json({ error: 'Calendar not found' }, 404);
            }
            if (!suggestionId && request.method === 'GET') {
                if (
                    !Auth.hasPermission(user, Auth.PERMS.APPLY_SUGGESTIONS) &&
                    !(await CalAccess.canSuggestChanges(env, user, calId))
                ) {
                    return json({ error: 'Forbidden' }, 403);
                }
                return json(await Suggestions.listPendingSuggestions(env, calId));
            }
            if (!suggestionId && request.method === 'POST') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                if (!(await CalAccess.canSuggestChanges(env, user, calId))) {
                    return json({ error: 'You cannot submit suggestions for this calendar' }, 403);
                }
                if (await CalAccess.canEditCalendar(env, user, calId)) {
                    return json({ error: 'Editors should save directly' }, 400);
                }
                const body = await readJson(request);
                if (!body.data || body.revision == null) {
                    return json({ error: 'data and revision are required' }, 400);
                }
                const meta = await dbOne(env, 'SELECT name FROM calendars WHERE id = ?', calId);
                const created = await Suggestions.createSuggestion(
                    env,
                    calId,
                    user,
                    body.revision,
                    body.data,
                    body.summary
                );
                await ActivityLog.recordActivityForUser(env, user, {
                    action: 'suggestion_submit',
                    calendarId: calId,
                    calendarName: meta && meta.name,
                    summary: body.summary || 'Submitted calendar suggestion',
                    detail: { suggestionId: created.id, baseRevision: body.revision }
                });
                return json(created, 201);
            }
            if (suggestionId && suggestionAction === '/apply' && request.method === 'POST') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                if (!Auth.hasPermission(user, Auth.PERMS.APPLY_SUGGESTIONS)) {
                    return json({ error: 'Forbidden' }, 403);
                }
                const suggestion = await Suggestions.getSuggestion(env, suggestionId);
                if (!suggestion || suggestion.calendarId !== calId || suggestion.status !== 'pending') {
                    return json({ error: 'Suggestion not found' }, 404);
                }
                const meta = await dbOne(env, 'SELECT revision, name FROM calendars WHERE id = ?', calId);
                const label = user.displayName || user.email || 'Teacher';
                const nextRev = Number(meta.revision) + 1;
                const stored = serializeCalendarData(calId, suggestion.data, env);
                await dbRun(
                    env,
                    'UPDATE calendars SET name=?, data=?, data_enc_version=?, data_key_wrapped=?, revision=?, updated_at=?, updated_by=? WHERE id=?',
                    meta.name,
                    stored.data,
                    stored.dataEncVersion,
                    stored.dataKeyWrapped,
                    nextRev,
                    nowIso(),
                    label,
                    calId
                );
                await Suggestions.setSuggestionStatus(env, suggestionId, 'applied');
                await ActivityLog.recordActivityForUser(env, user, {
                    action: 'suggestion_apply',
                    calendarId: calId,
                    calendarName: meta.name,
                    summary: `Applied suggestion from ${suggestion.createdByName}`,
                    detail: { suggestionId }
                });
                const doc = await dbOne(
                    env,
                    `SELECT ${CALENDAR_DOC_SELECT} FROM calendars WHERE id = ?`,
                    calId
                );
                return json(calendarDocForClient(doc, env));
            }
            if (suggestionId && suggestionAction === '/dismiss' && request.method === 'POST') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                if (!Auth.hasPermission(user, Auth.PERMS.APPLY_SUGGESTIONS)) {
                    return json({ error: 'Forbidden' }, 403);
                }
                const suggestion = await Suggestions.getSuggestion(env, suggestionId);
                if (!suggestion || suggestion.calendarId !== calId || suggestion.status !== 'pending') {
                    return json({ error: 'Suggestion not found' }, 404);
                }
                await Suggestions.setSuggestionStatus(env, suggestionId, 'dismissed');
                return json({ ok: true });
            }
        }

        const calMatch = path.match(
            /^\/api\/calendars\/([^/]+)(\/meta|\/lock\/grant|\/lock\/dismiss|\/lock\/touch|\/lock)?$/
        );
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
                    'SELECT id, name, revision, updated_at AS updatedAt, updated_by AS updatedBy, created_by_user_id AS createdByUserId FROM calendars WHERE id = ?',
                    calId
                );
                if (!meta) {
                    return json({ error: 'Calendar not found' }, 404);
                }
                return json(await CalendarMeta.calendarMetaExtras(env, user, calId, meta));
            }

            if (sub === '/lock/touch' && request.method === 'POST') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                const touched = await Lock.touchLockHolder(env, calId, user.id);
                if (!touched) {
                    return json({ error: 'Only the current editor can refresh the lock', touched: false }, 403);
                }
                return json(await Lock.lockPayloadForClient(env, calId, user, { touched: true }));
            }

            if (sub === '/lock/grant' && request.method === 'POST') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                const existingLock = await Lock.getLock(env, calId);
                if (existingLock && existingLock.pending_requester_id) {
                    const pendingUser = await dbOne(env, 'SELECT * FROM users WHERE id = ?', existingLock.pending_requester_id);
                    if (pendingUser) {
                        const pendingU = rowToUser(pendingUser);
                        if (!(await CalAccess.canEditCalendar(env, pendingU, calId))) {
                            return json({ error: 'That user cannot edit this calendar' }, 403);
                        }
                    }
                }
                const result = await Lock.grantLockToPending(env, calId, user.id);
                if (result.error) {
                    return json({ error: result.error }, result.status || 400);
                }
                const metaRow = await dbOne(
                    env,
                    'SELECT id, name, revision, updated_at AS updatedAt, updated_by AS updatedBy, created_by_user_id AS createdByUserId FROM calendars WHERE id = ?',
                    calId
                );
                return json(await CalendarMeta.calendarMetaExtras(env, user, calId, metaRow || { id: calId }));
            }

            if (sub === '/lock/dismiss' && request.method === 'POST') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                const result = await Lock.dismissLockRequest(env, calId, user.id);
                if (result.error) {
                    return json({ error: result.error }, result.status || 400);
                }
                return json(await Lock.lockPayloadForClient(env, calId, user));
            }

            if (sub === '/lock' && request.method === 'POST') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                if (!(await CalAccess.canEditCalendar(env, user, calId))) {
                    return json(
                        {
                            error: 'You do not have edit access to this calendar',
                            canEdit: false,
                            accessLevel: await CalAccess.getUserAccessLevel(env, user, calId)
                        },
                        403
                    );
                }
                let body = {};
                try {
                    body = await readJson(request);
                } catch (_) {
                    body = {};
                }
                const force = Boolean(body.force);
                const existing = await Lock.getLock(env, calId);
                let editRequestRecorded = false;
                let forced = false;
                let acquired = false;
                if (force && Auth.canForceUnlock(user)) {
                    const name = user.displayName || user.email || 'Teacher';
                    await Lock.assignLockHolder(env, calId, user.id, name);
                    forced = true;
                    acquired = true;
                } else {
                    const stale = !existing || (await Lock.isLockStale(env, existing));
                    const heldByMe = existing && existing.holder_user_id === user.id;
                    if (stale || heldByMe) {
                        const name = user.displayName || user.email || 'Teacher';
                        await Lock.assignLockHolder(env, calId, user.id, name);
                        acquired = true;
                    } else if (existing && existing.holder_user_id !== user.id) {
                        await Lock.recordLockEditRequest(env, calId, user);
                        editRequestRecorded = true;
                    }
                }
                const metaRow = await dbOne(
                    env,
                    'SELECT id, name, revision, updated_at AS updatedAt, updated_by AS updatedBy, created_by_user_id AS createdByUserId FROM calendars WHERE id = ?',
                    calId
                );
                const payload = await CalendarMeta.calendarMetaExtras(env, user, calId, metaRow || { id: calId });
                payload.editRequestRecorded = editRequestRecorded;
                payload.forced = forced;
                payload.acquired = acquired;
                return json(payload);
            }

            if (sub === '/lock' && request.method === 'DELETE') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                const lock = await Lock.getLock(env, calId);
                if (!lock) {
                    return json({ ok: true, released: false });
                }
                if (lock.holder_user_id !== user.id) {
                    return json({ error: 'Only the current editor can release this lock', lock: await Lock.lockToClient(env, lock) }, 403);
                }
                await dbRun(env, 'DELETE FROM calendar_locks WHERE calendar_id = ?', calId);
                return json({ ok: true, released: true });
            }

            if (!sub && request.method === 'GET') {
                const row = await dbOne(
                    env,
                    `SELECT ${CALENDAR_DOC_SELECT} FROM calendars WHERE id = ?`,
                    calId
                );
                if (!row) {
                    return json({ error: 'Calendar not found' }, 404);
                }
                const doc = calendarDocForClient(row, env);
                return json(await CalendarMeta.calendarMetaExtras(env, user, calId, doc));
            }

            if (!sub && request.method === 'PUT') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                let body;
                try {
                    body = await readJson(request);
                } catch (err) {
                    if (err && err.status === 413) {
                        return json({ error: 'Payload too large' }, 413);
                    }
                    body = {};
                }
                if (body.classroomOnly) {
                    const canEdit = await CalAccess.canEditCalendar(env, user, calId);
                    const canSuggest = await CalAccess.canSuggestChanges(env, user, calId);
                    if (!canEdit && !canSuggest) {
                        return json({ error: 'You do not have edit access to this calendar' }, 403);
                    }
                    const existingRow = await dbOne(
                        env,
                        `SELECT ${CALENDAR_DOC_SELECT} FROM calendars WHERE id = ?`,
                        calId
                    );
                    if (!existingRow) {
                        return json({ error: 'Calendar not found' }, 404);
                    }
                    const existingData = parseDataObjectFromRow(existingRow, calId, env);
                    const payload = {};
                    if (Object.prototype.hasOwnProperty.call(body, 'cohorts')) {
                        payload.cohorts = body.cohorts;
                    }
                    if (Object.prototype.hasOwnProperty.call(body, 'attendanceSessions')) {
                        payload.attendanceSessions = body.attendanceSessions;
                    }
                    if (Object.prototype.hasOwnProperty.call(body, 'homeworkCompletions')) {
                        payload.homeworkCompletions = body.homeworkCompletions;
                    }
                    const prepared = prepareClassroomForSave(user, existingData, payload);
                    if (prepared.error) {
                        return json({ error: prepared.error }, 403);
                    }
                    if (
                        body.revision != null &&
                        Number(body.revision) !== Number(existingRow.revision)
                    ) {
                        return json({ conflict: true, document: calendarDocForClient(existingRow, env) }, 409);
                    }
                    const mergedData = Object.assign({}, existingData, prepared.merged);
                    const nextRev = Number(existingRow.revision) + 1;
                    const label = user.displayName || user.email || 'Teacher';
                    const stored = serializeCalendarData(calId, mergedData, env);
                    await dbRun(
                        env,
                        'UPDATE calendars SET data=?, data_enc_version=?, data_key_wrapped=?, revision=?, updated_at=?, updated_by=? WHERE id=?',
                        stored.data,
                        stored.dataEncVersion,
                        stored.dataKeyWrapped,
                        nextRev,
                        nowIso(),
                        label,
                        calId
                    );
                    await ActivityLog.recordActivityForUser(env, user, {
                        action: 'classroom_save',
                        calendarId: calId,
                        calendarName: existingRow.name,
                        summary: `Saved classroom data (revision ${nextRev})`,
                        detail: { revision: nextRev, fields: Object.keys(prepared.merged) }
                    });
                    const saved = await dbOne(
                        env,
                        `SELECT ${CALENDAR_DOC_SELECT} FROM calendars WHERE id = ?`,
                        calId
                    );
                    const doc = calendarDocForClient(saved, env);
                    return json(await CalendarMeta.calendarMetaExtras(env, user, calId, doc));
                }

                if (body.dayNotesOnly) {
                    if (!Array.isArray(body.dayNotes)) {
                        return json({ error: 'dayNotes array is required' }, 400);
                    }
                    const canEdit = await CalAccess.canEditCalendar(env, user, calId);
                    const canSuggest = await CalAccess.canSuggestChanges(env, user, calId);
                    if (!canEdit && !canSuggest) {
                        return json({ error: 'You do not have edit access to this calendar' }, 403);
                    }
                    const existingRow = await dbOne(
                        env,
                        `SELECT ${CALENDAR_DOC_SELECT} FROM calendars WHERE id = ?`,
                        calId
                    );
                    if (!existingRow) {
                        return json({ error: 'Calendar not found' }, 404);
                    }
                    const existingData = parseDataObjectFromRow(existingRow, calId, env);
                    const prepared = prepareDayNotesForSave(user, existingData, body.dayNotes);
                    if (prepared.error) {
                        return json({ error: prepared.error }, 403);
                    }
                    if (
                        body.revision != null &&
                        Number(body.revision) !== Number(existingRow.revision)
                    ) {
                        return json({ conflict: true, document: calendarDocForClient(existingRow, env) }, 409);
                    }
                    const mergedData = Object.assign({}, existingData, {
                        dayNotes: prepared.dayNotes
                    });
                    const nextRev = Number(existingRow.revision) + 1;
                    const label = user.displayName || user.email || 'Teacher';
                    const stored = serializeCalendarData(calId, mergedData, env);
                    await dbRun(
                        env,
                        'UPDATE calendars SET data=?, data_enc_version=?, data_key_wrapped=?, revision=?, updated_at=?, updated_by=? WHERE id=?',
                        stored.data,
                        stored.dataEncVersion,
                        stored.dataKeyWrapped,
                        nextRev,
                        nowIso(),
                        label,
                        calId
                    );
                    await ActivityLog.recordActivityForUser(env, user, {
                        action: 'day_notes_save',
                        calendarId: calId,
                        calendarName: existingRow.name,
                        summary: `Saved class day notes (revision ${nextRev})`,
                        detail: { revision: nextRev }
                    });
                    const saved = await dbOne(
                        env,
                        `SELECT ${CALENDAR_DOC_SELECT} FROM calendars WHERE id = ?`,
                        calId
                    );
                    const doc = calendarDocForClient(saved, env);
                    return json(await CalendarMeta.calendarMetaExtras(env, user, calId, doc));
                }

                if (!body.data) {
                    return json({ error: 'data is required' }, 400);
                }
                const existing = await dbOne(env, 'SELECT revision, name FROM calendars WHERE id = ?', calId);
                if (!existing) {
                    return json({ error: 'Calendar not found' }, 404);
                }
                if (!(await CalAccess.canEditCalendar(env, user, calId))) {
                    return json({ error: 'You do not have edit access to this calendar' }, 403);
                }
                const lock = await Lock.lockStatus(env, calId, user.id, user);
                const forceAllowed =
                    Boolean(body.force) &&
                    (Auth.canForceUnlock(user) ||
                        Auth.hasPermission(user, Auth.PERMS.FORCE_SAVE) ||
                        Boolean(lock.holdsLock));
                if (lock.readOnly && !forceAllowed) {
                    return json({ error: 'Calendar is locked by another user', lock: lock.lock }, 423);
                }
                const lockRow = await Lock.getLock(env, calId);
                const lockStale = !lockRow || (await Lock.isLockStale(env, lockRow));
                if (
                    !forceAllowed &&
                    !lockStale &&
                    lockRow &&
                    lockRow.holder_user_id !== user.id
                ) {
                    return json(
                        {
                            error: 'Calendar is locked by another user',
                            lock: lock.lock
                        },
                        423
                    );
                }
                if (!lockStale && lockRow && lockRow.holder_user_id === user.id) {
                    await Lock.touchLockHolder(env, calId, user.id);
                }
                if (!forceAllowed && body.revision != null && Number(body.revision) !== Number(existing.revision)) {
                    const doc = await dbOne(
                        env,
                        `SELECT ${CALENDAR_DOC_SELECT} FROM calendars WHERE id = ?`,
                        calId
                    );
                    return json({ conflict: true, document: calendarDocForClient(doc, env) }, 409);
                }
                const nextRev = Number(existing.revision) + 1;
                const label = user.displayName || user.email || 'Teacher';
                const displayName = body.name != null ? String(body.name).trim() : existing.name;
                if (displayName.toLowerCase() !== String(existing.name || '').trim().toLowerCase()) {
                    const renameClash = await assertCalendarNameAvailable(env, displayName, calId);
                    if (renameClash) {
                        return json({ error: renameClash.error, code: renameClash.code }, renameClash.status);
                    }
                }
                const stored = serializeCalendarData(calId, body.data, env);
                await dbRun(
                    env,
                    'UPDATE calendars SET name=?, data=?, data_enc_version=?, data_key_wrapped=?, revision=?, updated_at=?, updated_by=? WHERE id=?',
                    displayName,
                    stored.data,
                    stored.dataEncVersion,
                    stored.dataKeyWrapped,
                    nextRev,
                    nowIso(),
                    label,
                    calId
                );
                await ActivityLog.recordActivityForUser(env, user, {
                    action: 'calendar_save',
                    calendarId: calId,
                    calendarName: displayName,
                    summary: `Saved calendar (revision ${nextRev})`,
                    detail: { revision: nextRev }
                });
                const doc = await dbOne(
                    env,
                    `SELECT ${CALENDAR_DOC_SELECT} FROM calendars WHERE id = ?`,
                    calId
                );
                return json(calendarDocForClient(doc, env));
            }

            if (!sub && request.method === 'DELETE') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                if (!(await CalAccess.canDeleteCalendarAsync(env, user, calId))) {
                    return json({ error: 'Forbidden' }, 403);
                }
                const meta = await dbOne(env, 'SELECT name FROM calendars WHERE id = ?', calId);
                await dbRun(env, 'DELETE FROM calendars WHERE id = ?', calId);
                await dbRun(env, 'DELETE FROM calendar_locks WHERE calendar_id = ?', calId);
                await dbRun(env, 'DELETE FROM calendar_suggestions WHERE calendar_id = ?', calId);
                await CalAccess.deleteCalendarAccess(env, calId);
                await ActivityLog.recordActivityForUser(env, user, {
                    action: 'calendar_delete',
                    calendarId: calId,
                    calendarName: meta && meta.name,
                    summary: `Deleted calendar "${(meta && meta.name) || calId}"`
                });
                return json({ ok: true });
            }
        }

        if (path === '/api/calendars' && request.method === 'POST') {
            const blocked = rejectViewAsJson();
            if (blocked) {
                return blocked;
            }
            if (!Auth.hasPermission(user, Auth.PERMS.CREATE_CALENDARS)) {
                return json({ error: 'Forbidden' }, 403);
            }
            const body = await readJson(request);
            if (!body.name || !body.data) {
                return json({ error: 'name and data are required' }, 400);
            }
            const trimmedName = String(body.name).trim();
            const nameClash = await assertCalendarNameAvailable(env, trimmedName);
            if (nameClash) {
                return json({ error: nameClash.error, code: nameClash.code }, nameClash.status);
            }
            const id = uuid();
            const label = user.displayName || user.email || 'Teacher';
            const stored = serializeCalendarData(id, body.data, env);
            await dbRun(
                env,
                'INSERT INTO calendars (id, name, data, data_enc_version, data_key_wrapped, revision, updated_at, updated_by, created_by_user_id) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
                id,
                trimmedName,
                stored.data,
                stored.dataEncVersion,
                stored.dataKeyWrapped,
                nowIso(),
                label,
                user.id
            );
            const memberIds = Array.isArray(body.memberUserIds) ? body.memberUserIds.map(String) : [];
            if (!memberIds.includes(user.id)) {
                memberIds.push(user.id);
            }
            const groupIds = Array.isArray(body.groupIds) ? body.groupIds.map(String) : [];
            await CalAccess.setCalendarAccess(env, id, { userIds: memberIds, groupIds }, null, user.id);
            await Lock.assignLockHolder(env, id, user.id, label);
            await ActivityLog.recordActivityForUser(env, user, {
                action: 'calendar_create',
                calendarId: id,
                calendarName: trimmedName,
                summary: `Created calendar "${trimmedName}"`
            });
            const doc = await dbOne(
                env,
                `SELECT ${CALENDAR_DOC_SELECT} FROM calendars WHERE id = ?`,
                id
            );
            return json(calendarDocForClient(doc, env), 201);
        }

        if (path === '/api/admin/activity' && request.method === 'GET') {
            if (!Auth.hasPermission(user, Auth.PERMS.VIEW_AUDIT)) {
                return json({ error: 'Forbidden' }, 403);
            }
            const url = new URL(request.url);
            return json(
                await ActivityLog.listActivity(env, {
                    limit: url.searchParams.get('limit'),
                    calendarId: url.searchParams.get('calendarId')
                })
            );
        }

        if (path === '/api/admin/presence' && request.method === 'GET') {
            if (!Auth.hasPermission(user, Auth.PERMS.VIEW_PRESENCE)) {
                return json({ error: 'Forbidden' }, 403);
            }
            return json(await Presence.listOnlinePresence(env));
        }

        const forceLogoutMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/force-logout$/);
        if (forceLogoutMatch && request.method === 'POST') {
            const blocked = rejectViewAsJson();
            if (blocked) {
                return blocked;
            }
            if (!Auth.hasPermission(user, Auth.PERMS.MANAGE_USERS)) {
                return json({ error: 'Forbidden' }, 403);
            }
            const target = await dbOne(env, 'SELECT * FROM users WHERE id = ?', forceLogoutMatch[1]);
            if (!target) {
                return json({ error: 'User not found' }, 404);
            }
            try {
                AdminUserPolicy.assertCanManageTargetUser(user, target);
            } catch (err) {
                return json({ error: err.message || 'Forbidden' }, err.status || 403);
            }
            await deleteAllSessionsForUser(env, forceLogoutMatch[1]);
            await ActivityLog.recordActivityForUser(env, user, {
                action: 'force_logout',
                summary: `Forced logout for ${target.display_name || target.email || target.id}`,
                detail: { targetUserId: target.id }
            });
            return json({ ok: true });
        }

        if (path === '/api/admin/settings' && Auth.hasPermission(user, Auth.PERMS.MANAGE_SETTINGS)) {
            if (request.method === 'GET') {
                return json(await AppSettings.getAdminSettings(env));
            }
            if (request.method === 'PATCH') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                const body = await readJson(request);
                return json(await AppSettings.patchAdminSettings(env, body));
            }
        }

        if (path === '/api/admin/groups' && request.method === 'GET' && Auth.hasPermission(user, Auth.PERMS.MANAGE_GROUPS)) {
            const groups = await CalAccess.listGroups(env);
            const out = [];
            for (const g of groups) {
                const memberIds = await CalAccess.getGroupMemberIds(env, g.id);
                out.push(Object.assign({}, g, { memberIds }));
            }
            return json(out);
        }

        if (path === '/api/admin/groups' && request.method === 'POST' && Auth.hasPermission(user, Auth.PERMS.MANAGE_GROUPS)) {
            const blocked = rejectViewAsJson();
            if (blocked) {
                return blocked;
            }
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
        if (adminGroupMatch && Auth.hasPermission(user, Auth.PERMS.MANAGE_GROUPS)) {
            const groupId = adminGroupMatch[1];
            const isMembers = adminGroupMatch[2] === '/members';
            const existing = await CalAccess.getGroup(env, groupId);
            if (!existing) {
                return json({ error: 'Group not found' }, 404);
            }
            if (isMembers && request.method === 'PUT') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                const body = await readJson(request);
                const memberIds = await CalAccess.setGroupMembers(env, groupId, body.memberIds || []);
                return json({ id: groupId, memberIds });
            }
            if (!isMembers && request.method === 'PATCH') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                const body = await readJson(request);
                const updated = await CalAccess.updateGroupName(env, groupId, body.name || existing.name);
                const memberIds = await CalAccess.getGroupMemberIds(env, groupId);
                return json(Object.assign({}, updated, { memberIds }));
            }
            if (!isMembers && request.method === 'DELETE') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                await CalAccess.deleteGroup(env, groupId);
                return json({ ok: true });
            }
        }

        if (
            path === '/api/admin/calendars' &&
            request.method === 'GET' &&
            Auth.hasAnyPermission(user, [
                Auth.PERMS.MANAGE_CALENDAR_ACCESS,
                Auth.PERMS.VIEW_ALL_CALENDARS,
                Auth.PERMS.CREATE_CALENDARS
            ])
        ) {
            return json(await CalAccess.listAdminCalendarsForUser(env, user));
        }

        const adminCalAccessMatch = path.match(/^\/api\/admin\/calendars\/([^/]+)\/access$/);
        if (adminCalAccessMatch) {
            const calId = adminCalAccessMatch[1];
            const meta = await dbOne(env, 'SELECT id FROM calendars WHERE id = ?', calId);
            if (!meta) {
                return json({ error: 'Calendar not found' }, 404);
            }
            if (!(await CalAccess.canManageCalendarAccessAsync(env, user, calId))) {
                return json({ error: 'Forbidden' }, 403);
            }
            if (request.method === 'GET') {
                return json(await CalAccess.getCalendarAccess(env, calId));
            }
            if (request.method === 'PUT') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                const body = await readJson(request);
                const result = await CalAccess.setCalendarAccess(env, calId, body, null, user.id);
                const metaRow = await dbOne(env, 'SELECT name FROM calendars WHERE id = ?', calId);
                await ActivityLog.recordActivityForUser(env, user, {
                    action: 'calendar_access_update',
                    calendarId: calId,
                    calendarName: metaRow && metaRow.name,
                    summary: 'Updated calendar access'
                });
                return json(result);
            }
        }

        if (
            path === '/api/admin/access-requests' &&
            request.method === 'GET' &&
            (Auth.hasPermission(user, Auth.PERMS.MANAGE_USERS) ||
                Auth.hasPermission(user, Auth.PERMS.MANAGE_CALENDAR_ACCESS))
        ) {
            return json(await AccessRequests.listAccessRequests(env));
        }

        if (
            path === '/api/admin/permission-meta' &&
            request.method === 'GET' &&
            Auth.hasPermission(user, Auth.PERMS.MANAGE_USERS)
        ) {
            if (!Auth.isSuperAdminRole(user)) {
                return json({ error: 'Forbidden' }, 403);
            }
            return json(Auth.getPermissionMetaForAdmin());
        }

        if (path === '/api/admin/users' && request.method === 'GET' && Auth.hasPermission(user, Auth.PERMS.MANAGE_USERS)) {
            const rows = await dbAll(
                env,
                'SELECT id, email, display_name, kakao_user_id, role, permissions, active, created_at FROM users ORDER BY display_name'
            );
            const list = [];
            for (const row of rows) {
                list.push(await CalendarMeta.enrichAdminUserRow(env, rowToUser(row)));
            }
            return json(list);
        }

        if (path === '/api/admin/users' && request.method === 'POST' && Auth.hasPermission(user, Auth.PERMS.MANAGE_USERS)) {
            const blocked = rejectViewAsJson();
            if (blocked) {
                return blocked;
            }
            try {
                const body = await readJson(request);
                const em = normalizeEmail(body.email);
                if (!em && !body.kakaoUserId) {
                    return json({ error: 'email or kakaoUserId is required' }, 400);
                }
                const policyDeps = makeAdminPolicyDeps(env);
                const nextRole = AdminUserPolicy.assertRoleAssignmentAllowed(
                    user,
                    body.role || 'teacher'
                );
                const permissionsField = await AdminUserPolicy.permissionsFieldForCreate(
                    user,
                    body,
                    nextRole,
                    policyDeps
                );
                const created = await createUser(env, {
                    email: em,
                    displayName: body.displayName || em || 'Teacher',
                    role: nextRole,
                    kakaoUserId: body.kakaoUserId || null,
                    passwordHash: body.password ? await hashPassword(body.password) : null,
                    permissions: permissionsField
                });
                if (created && created.id !== user.id) {
                    await AccessRequests.notifyUserNeedsAccess(env, created, {
                        source: 'admin_preadd',
                        actorUserId: user.id,
                        actorName: user.displayName || user.email || 'Admin'
                    });
                }
                return json(await CalendarMeta.enrichAdminUserRow(env, created), 201);
            } catch (err) {
                return json({ error: err.message || 'Create failed' }, err.status || 500);
            }
        }

        const adminUserMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/);
        if (adminUserMatch && Auth.hasPermission(user, Auth.PERMS.MANAGE_USERS)) {
            const targetId = adminUserMatch[1];
            if (request.method === 'DELETE') {
                const blocked = rejectViewAsJson();
                if (blocked) {
                    return blocked;
                }
                const targetRow = await dbOne(env, 'SELECT * FROM users WHERE id = ?', targetId);
                if (!targetRow) {
                    return json({ error: 'User not found' }, 404);
                }
                try {
                    AdminUserPolicy.assertCanManageTargetUser(user, targetRow);
                } catch (err) {
                    return json({ error: err.message || 'Forbidden' }, err.status || 403);
                }
                const result = await permanentlyDeleteUser(env, targetId, user.id);
                if (result.error) {
                    return json({ error: result.error }, result.status || 403);
                }
                return json({ ok: true });
            }
        }
        if (adminUserMatch && request.method === 'PATCH' && Auth.hasPermission(user, Auth.PERMS.MANAGE_USERS)) {
            const blocked = rejectViewAsJson();
            if (blocked) {
                return blocked;
            }
            try {
            const patchBody = await readJson(request);
            const targetId = adminUserMatch[1];
            const targetRow = await dbOne(env, 'SELECT * FROM users WHERE id = ?', targetId);
            if (!targetRow) {
                return json({ error: 'User not found' }, 404);
            }
            try {
                AdminUserPolicy.assertCanManageTargetUser(user, targetRow);
            } catch (err) {
                return json({ error: err.message || 'Forbidden' }, err.status || 403);
            }
            const nextRole =
                patchBody.role !== undefined
                    ? AdminUserPolicy.assertRoleAssignmentAllowed(user, patchBody.role)
                    : targetRow.role;
            const nextActive = patchBody.active !== undefined ? (patchBody.active ? 1 : 0) : targetRow.active;
            if (targetId === user.id && nextActive === 0) {
                return json({ error: 'You cannot deactivate your own account' }, 403);
            }
            if (Auth.isSuperAdminRole(targetRow) && nextActive === 0 && (await countSuperAdmins(env)) <= 1) {
                return json({ error: 'Cannot deactivate the last super admin' }, 403);
            }
            const demotingSuper =
                Auth.isSuperAdminRole(targetRow) &&
                !Auth.isSuperAdminRole({ role: nextRole }) &&
                nextActive === 1;
            if (demotingSuper && (await countSuperAdmins(env)) <= 1) {
                return json({ error: 'Cannot demote the last super admin' }, 403);
            }
            const policyDeps = makeAdminPolicyDeps(env);
            const permissionsField = await AdminUserPolicy.permissionsFieldForUpdate(
                user,
                targetRow,
                patchBody,
                nextRole,
                policyDeps
            );
            const updateFields = {
                email: patchBody.email,
                displayName: patchBody.displayName,
                role: patchBody.role != null ? nextRole : undefined,
                active: patchBody.active,
                kakaoUserId: patchBody.kakaoUserId
            };
            if (permissionsField !== undefined) {
                updateFields.permissions = permissionsField;
            }
            const updated = await updateUser(env, targetId, updateFields);
            if (!updated) {
                return json({ error: 'User not found' }, 404);
            }
            let passwordSecurityChange = false;
            if (patchBody.password !== undefined) {
                const pwd = String(patchBody.password || '');
                if (pwd.length < MIN_PASSWORD_LENGTH) {
                    return json({ error: 'Password must be at least 8 characters' }, 400);
                }
                await dbRun(
                    env,
                    'UPDATE users SET password_hash = ? WHERE id = ?',
                    await hashPassword(pwd),
                    targetId
                );
                passwordSecurityChange = true;
            }
            if (patchBody.clearPassword === true) {
                await dbRun(env, 'UPDATE users SET password_hash = NULL WHERE id = ?', targetId);
                passwordSecurityChange = true;
            }
            if (targetRow.active === 1 && nextActive === 0) {
                await deleteAllSessionsForUser(env, targetId);
            } else if (passwordSecurityChange) {
                await deleteAllSessionsForUser(env, targetId);
            }
            const freshRow = await dbOne(env, 'SELECT * FROM users WHERE id = ?', targetId);
            return json(await CalendarMeta.enrichAdminUserRow(env, rowToUser(freshRow)));
            } catch (err) {
                return json({ error: err.message || 'Update failed' }, err.status || 500);
            }
        }

        return json({ error: 'Not found' }, 404);
    }
};
