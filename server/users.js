const crypto = require('crypto');
const { getDb, newId, nowIso } = require('./schema');
const appSettings = require('./app-settings');
const loginContext = require('./login-context');
const Auth = require('./auth-permissions');
const { removePresence } = require('./presence');
const LockCore = require('../shared/lock-core.cjs');

const SESSION_DAYS = 14; /* default; createSession uses app_settings.session_max_days */
const MIN_PASSWORD_LENGTH = 8;
const MAX_DISPLAY_NAME_LENGTH = 120;

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
        active: Boolean(row.active),
        createdAt: row.created_at
    };
    user.effectivePermissions = Auth.getEffectivePermissions(user);
    return user;
}

function listUsers() {
    const db = getDb();
    const rows = db
        .prepare(
            `SELECT id, email, display_name, kakao_user_id, role, permissions, active, created_at
             FROM users ORDER BY display_name COLLATE NOCASE`
        )
        .all();
    return rows.map(rowToUser);
}

function getUserById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return rowToUser(row);
}

function findUserForKakaoLogin(kakaoUserId, email) {
    const db = getDb();
    const kid = kakaoUserId ? String(kakaoUserId) : null;
    const em = normalizeEmail(email);
    if (kid) {
        const byKid = db
            .prepare('SELECT * FROM users WHERE kakao_user_id = ? AND active = 1')
            .get(kid);
        if (byKid) {
            return rowToUser(byKid);
        }
    }
    if (em) {
        const byEmail = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(em);
        if (byEmail) {
            const linkedKid = byEmail.kakao_user_id ? String(byEmail.kakao_user_id) : null;
            if (linkedKid && kid && linkedKid !== kid) {
                return { mismatch: true };
            }
            if (linkedKid && kid && linkedKid === kid) {
                return rowToUser(byEmail);
            }
            if (!linkedKid && kid) {
                return { needsKakaoLink: true, row: byEmail };
            }
            if (!linkedKid && !kid) {
                return rowToUser(byEmail);
            }
        }
    }
    return null;
}

function findInactiveUserForKakao(kakaoUserId, email) {
    const db = getDb();
    const kid = kakaoUserId ? String(kakaoUserId) : null;
    const em = normalizeEmail(email);
    if (kid) {
        const byKid = db.prepare('SELECT * FROM users WHERE kakao_user_id = ? AND active = 0').get(kid);
        if (byKid) {
            return rowToUser(byKid);
        }
    }
    if (em) {
        const byEmail = db.prepare('SELECT * FROM users WHERE email = ? AND active = 0').get(em);
        if (byEmail) {
            return rowToUser(byEmail);
        }
    }
    return null;
}

function isUniqueConstraintError(err) {
    const msg = String((err && err.message) || '');
    return msg.includes('UNIQUE') || (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE');
}

function provisionUserFromKakaoProfile(profile) {
    const kid = profile && profile.kakaoUserId ? String(profile.kakaoUserId) : '';
    if (!kid) {
        return null;
    }
    try {
        const nickname = profile.nickname && String(profile.nickname).trim();
        const created = createUser({
            email: profile.email || null,
            displayName: nickname || `Kakao ${kid}`,
            kakaoUserId: kid,
            role: 'teacher'
        });
        if (created) {
            try {
                const AccessRequests = require('./access-requests');
                AccessRequests.notifyUserNeedsAccess(created, { source: 'kakao_signup' });
            } catch (_) {
                /* ignore notification errors */
            }
        }
        return created;
    } catch (err) {
        if (isUniqueConstraintError(err)) {
            const again = findUserForKakaoLogin(kid, profile.email);
            if (again && !again.mismatch && !again.needsKakaoLink) {
                return again;
            }
        }
        throw err;
    }
}

function resolveKakaoLoginUser(profile) {
    const match = findUserForKakaoLogin(profile.kakaoUserId, profile.email);
    if (match && match.mismatch) {
        return { error: 'kakao_mismatch' };
    }
    if (match && match.needsKakaoLink) {
        return { error: 'kakao_not_linked' };
    }
    if (match) {
        return { user: match, created: false };
    }
    if (findInactiveUserForKakao(profile.kakaoUserId, profile.email)) {
        return { disabled: true };
    }
    const created = provisionUserFromKakaoProfile(profile);
    if (!created || created.mismatch || created.needsKakaoLink) {
        return { error: 'missing_kakao_id' };
    }
    return { user: created, created: true };
}

function createUser({ email, displayName, kakaoUserId, role, passwordHash, permissions }) {
    const db = getDb();
    const id = newId();
    const em = normalizeEmail(email);
    const assignedRole = Auth.normalizeAssignableRole(role || 'teacher');
    const permsJson =
        permissions != null
            ? typeof permissions === 'string'
                ? permissions
                : JSON.stringify(permissions)
            : null;
    db.prepare(
        `INSERT INTO users (id, email, display_name, kakao_user_id, password_hash, role, permissions, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
        id,
        em,
        displayName || '',
        kakaoUserId ? String(kakaoUserId) : null,
        passwordHash || null,
        assignedRole,
        permsJson,
        nowIso()
    );
    return getUserById(id);
}

function updateUser(id, fields) {
    const db = getDb();
    const u = getUserById(id);
    if (!u) {
        return null;
    }
    const displayName = fields.displayName != null ? fields.displayName : u.displayName;
    const email = fields.email !== undefined ? normalizeEmail(fields.email) : u.email;
    const active = fields.active !== undefined ? (fields.active ? 1 : 0) : u.active ? 1 : 0;
    const kakaoUserId =
        fields.kakaoUserId !== undefined
            ? fields.kakaoUserId
                ? String(fields.kakaoUserId)
                : null
            : u.kakaoUserId;
    const role = fields.role != null ? Auth.normalizeAssignableRole(fields.role) : u.role;
    let permissions = u.permissions;
    if (fields.permissions !== undefined) {
        permissions =
            fields.permissions == null
                ? null
                : typeof fields.permissions === 'string'
                  ? fields.permissions
                  : JSON.stringify(fields.permissions);
    }
    db.prepare(
        `UPDATE users SET email = ?, display_name = ?, kakao_user_id = ?, role = ?, permissions = ?, active = ? WHERE id = ?`
    ).run(email, displayName, kakaoUserId, role, permissions, active, id);
    if (fields.displayName != null) {
        const label = String(displayName || '').trim();
        db.prepare('UPDATE calendar_locks SET holder_name = ? WHERE holder_user_id = ?').run(label, id);
        db.prepare('UPDATE calendar_locks SET pending_requester_name = ? WHERE pending_requester_id = ?').run(
            label,
            id
        );
    }
    return getUserById(id);
}

function countAdmins() {
    return countSuperAdmins();
}

function countSuperAdmins() {
    const db = getDb();
    return db
        .prepare(
            `SELECT COUNT(*) AS c FROM users WHERE active = 1 AND role IN ('admin', 'super_admin')`
        )
        .get().c;
}

function isSuperAdminRole(row) {
    const role = Auth.normalizeRole(row && row.role);
    return role === 'super_admin';
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    return `pbkdf2-sha256$100000$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPbkdf2Password(password, stored) {
    if (!stored || !password || !stored.startsWith('pbkdf2-sha256$')) {
        return false;
    }
    const parts = stored.split('$');
    if (parts.length !== 4) {
        return false;
    }
    const iterations = Number(parts[1]);
    const salt = Buffer.from(parts[2], 'hex');
    const expected = parts[3];
    const key = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    return crypto.timingSafeEqual(key, Buffer.from(expected, 'hex'));
}

function verifyPassword(password, stored) {
    if (!stored || !password) {
        return false;
    }
    if (stored.startsWith('pbkdf2-sha256$')) {
        return verifyPbkdf2Password(password, stored);
    }
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) {
        return false;
    }
    const attempt = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
}

function activeUserHasNoPassword(email) {
    const em = normalizeEmail(email);
    if (!em) {
        return false;
    }
    const row = getDb().prepare('SELECT password_hash FROM users WHERE email = ? AND active = 1').get(em);
    return Boolean(row && !row.password_hash);
}

function verifyUserPassword(userId, password) {
    if (!userId || password == null || password === '') {
        return false;
    }
    const row = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    if (!row || !row.password_hash) {
        return false;
    }
    return verifyPassword(String(password), row.password_hash);
}

function findUserByEmailPassword(email, password) {
    const em = normalizeEmail(email);
    if (!em || !password) {
        return null;
    }
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(em);
    if (!row || !row.password_hash) {
        return null;
    }
    if (!verifyPassword(password, row.password_hash)) {
        return null;
    }
    return rowToUser(row);
}

function createSession(userId, deviceContext, options) {
    const db = getDb();
    const admin = appSettings.getAdminSettings();
    const profile = loginContext.resolveLoginProfile(deviceContext, admin);
    const maxAgeSec = profile.sessionMaxAgeSec;
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + maxAgeSec * 1000).toISOString();
    const now = nowIso();
    const viewAsUserId =
        options && options.viewAsUserId ? String(options.viewAsUserId) : null;
    const userAgent =
        options && options.userAgent != null ? String(options.userAgent).slice(0, 400) : '';
    db.prepare(
        `INSERT INTO sessions (
            token, user_id, expires_at, login_context, idle_logout_minutes, idle_warning_minutes, view_as_user_id,
            id, created_at, last_seen_at, user_agent
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        token,
        userId,
        expires,
        profile.loginContext,
        profile.idleLogoutMinutes,
        profile.idleWarningMinutes,
        viewAsUserId,
        token,
        now,
        now,
        userAgent
    );
    return {
        token,
        expires,
        maxAgeSec,
        loginContext: profile.loginContext,
        idleLogoutMinutes: profile.idleLogoutMinutes,
        idleWarningMinutes: profile.idleWarningMinutes
    };
}

function createViewAsSession(actorUserId, targetUserId, deviceContext) {
    return createSession(actorUserId, deviceContext, { viewAsUserId: targetUserId });
}

function createLoginSession(userId, deviceContext) {
    // Keep other devices signed in; lock takeover is session-scoped.
    return createSession(userId, deviceContext);
}

function applySessionPolicyToUser(user, sessionRow) {
    const policy = loginContext.sessionPolicyFromRow(sessionRow, appSettings.getAdminSettings());
    user.loginContext = policy.loginContext;
    user.idleLogoutMinutes = policy.idleLogoutMinutes;
    user.idleWarningMinutes = policy.idleWarningMinutes;
    return user;
}

function getSessionContext(token) {
    if (!token) {
        return { effective: null, actor: null, viewAsActive: false, token: null };
    }
    const db = getDb();
    const sessionRow = db
        .prepare(
            `SELECT token, user_id, expires_at, view_as_user_id, login_context, idle_logout_minutes, idle_warning_minutes
             FROM sessions WHERE token = ?`
        )
        .get(token);
    if (!sessionRow) {
        return { effective: null, actor: null, viewAsActive: false, token: null };
    }
    if (new Date(sessionRow.expires_at).getTime() < Date.now()) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
        return { effective: null, actor: null, viewAsActive: false, token: null };
    }
    const actorRow = db
        .prepare('SELECT * FROM users WHERE id = ? AND active = 1')
        .get(sessionRow.user_id);
    if (!actorRow) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
        return { effective: null, actor: null, viewAsActive: false, token: null };
    }
    const actor = applySessionPolicyToUser(rowToUser(actorRow), sessionRow);
    actor.sessionToken = token;
    if (sessionRow.view_as_user_id) {
        if (!Auth.isSuperAdminRole(actor)) {
            db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
            return { effective: null, actor: null, viewAsActive: false, token: null };
        }
        const targetRow = db
            .prepare('SELECT * FROM users WHERE id = ? AND active = 1')
            .get(sessionRow.view_as_user_id);
        if (!targetRow) {
            db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
            return { effective: null, actor: null, viewAsActive: false, token: null };
        }
        const effective = applySessionPolicyToUser(rowToUser(targetRow), sessionRow);
        effective.viewAsActive = true;
        effective.actorUserId = actor.id;
        effective.actorDisplayName = actor.displayName || actor.email || 'Admin';
        effective.sessionToken = token;
        return { effective, actor, viewAsActive: true, token };
    }
    return { effective: actor, actor, viewAsActive: false, token };
}

function getSessionUser(token) {
    const ctx = getSessionContext(token);
    return ctx.effective;
}

function deleteSession(token) {
    if (!token) {
        return;
    }
    getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function deleteAllSessionsForUser(userId) {
    if (!userId) {
        return;
    }
    releaseAllLocksHeldByUser(userId);
    removePresence(userId);
    getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

function forceLogoutUser(targetId) {
    deleteAllSessionsForUser(targetId);
    return true;
}

function setUserPassword(userId, passwordHash) {
    const db = getDb();
    const row = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!row) {
        return false;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash || null, userId);
    return true;
}

function updateOwnDisplayName(userId, displayName) {
    const name = String(displayName || '').trim();
    if (!name) {
        const err = new Error('Display name is required');
        err.status = 400;
        throw err;
    }
    if (name.length > MAX_DISPLAY_NAME_LENGTH) {
        const err = new Error(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer`);
        err.status = 400;
        throw err;
    }
    const updated = updateUser(userId, { displayName: name });
    if (!updated || !updated.active) {
        const err = new Error('Not signed in');
        err.status = 401;
        throw err;
    }
    return updated;
}

function changeOwnPassword(userId, currentPassword, newPassword, deviceContext) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(userId);
    if (!row) {
        const err = new Error('Not signed in');
        err.status = 401;
        throw err;
    }
    if (!row.password_hash) {
        const err = new Error('No password set — contact your admin');
        err.status = 400;
        throw err;
    }
    const next = String(newPassword || '');
    if (next.length < MIN_PASSWORD_LENGTH) {
        const err = new Error('Password must be at least 8 characters');
        err.status = 400;
        throw err;
    }
    if (!verifyPassword(currentPassword, row.password_hash)) {
        const err = new Error('Current password is incorrect');
        err.status = 401;
        throw err;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), userId);
    deleteAllSessionsForUser(userId);
    return createSession(userId, deviceContext);
}

function permanentlyDeleteUser(targetId, actingAdminId) {
    const db = getDb();
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!target) {
        const err = new Error('User not found');
        err.status = 404;
        throw err;
    }
    if (targetId === actingAdminId) {
        const err = new Error('You cannot delete your own account');
        err.status = 403;
        throw err;
    }
    if (target.active !== 0) {
        const err = new Error('Deactivate the account before permanent delete');
        err.status = 403;
        throw err;
    }
    if (isSuperAdminRole(target)) {
        const adminCount = db
            .prepare(
                `SELECT COUNT(*) AS c FROM users WHERE role IN ('admin', 'super_admin')`
            )
            .get();
        if (Number(adminCount?.c || 0) <= 1) {
            const err = new Error('Cannot delete the only super admin account');
            err.status = 403;
            throw err;
        }
    }
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM calendar_members WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM group_members WHERE user_id = ?').run(targetId);
    db.prepare('DELETE FROM calendar_locks WHERE holder_user_id = ?').run(targetId);
    db.prepare(
        `UPDATE calendar_locks SET pending_requester_id = NULL, pending_requester_name = NULL, pending_requested_at = NULL WHERE pending_requester_id = ?`
    ).run(targetId);
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    return result.changes > 0;
}

/*
 * Calendar edit lock: retired (lock-free team sync). Same contract as worker/src/lock.js:
 * every caller is told the calendar is free and may be edited; edit permission comes from
 * calendar access. Kept so older browser tabs and any leftover callers keep working.
 */
function sessionTokenOf(user) {
    return LockCore.sessionTokenOf(user);
}

function lockHeldByCaller() {
    return true;
}

function getLock() {
    return null;
}

function isLockStale() {
    return true;
}

function freeLockStatus(user) {
    return {
        held: false,
        holdsLock: true,
        readOnly: false,
        lock: null,
        pendingEditRequest: false,
        lockStaleMinutes: appSettings.getLockStaleMinutes(),
        bypassLock: Boolean(user),
        lockExpiresAt: null,
        lockTimedOut: false
    };
}

function assignLockHolder() {
    return true;
}

function acquireLock() {
    return { acquired: true, forced: false, editRequestRecorded: false };
}

function grantLockToPending() {
    return { ok: true };
}

function dismissLockRequest() {
    return { ok: true };
}

function touchLock() {
    return true;
}

function refreshLock() {
    return true;
}

function releaseLock() {
    return { ok: true, released: false };
}

/** Clear rows left from before the lock was retired. */
function releaseAllLocksHeldByUser(userId) {
    if (userId) {
        getDb().prepare('DELETE FROM calendar_locks WHERE holder_user_id = ?').run(userId);
    }
    return { released: true };
}

function releaseLocksHeldBySession(sessionToken) {
    const token = String(sessionToken || '').trim();
    if (token) {
        getDb().prepare('DELETE FROM calendar_locks WHERE holder_session_token = ?').run(token);
    }
    return { released: 0 };
}

function countSessionsForUser(userId) {
    if (!userId) {
        return 0;
    }
    const row = getDb()
        .prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?')
        .get(userId);
    return row && row.c ? Number(row.c) : 0;
}

function ensureSameUserSessionCanSave(calendarId, user) {
    return freeLockStatus(user);
}

function lockStatusForClient(calendarId, userId, user) {
    return freeLockStatus(user);
}

function lockPayloadForClient(calendarId, userId, user, extra) {
    return Object.assign(
        {
            acquired: true,
            lock: null,
            readOnly: false,
            holdsLock: true,
            pendingEditRequest: false,
            lockStaleMinutes: appSettings.getLockStaleMinutes(),
            bypassLock: Boolean(user),
            lockExpiresAt: null,
            lockTimedOut: false,
            editRequestRecorded: false,
            forced: false
        },
        extra || {}
    );
}

module.exports = {
    normalizeEmail,
    listUsers,
    getUserById,
    findUserForKakaoLogin,
    findInactiveUserForKakao,
    provisionUserFromKakaoProfile,
    resolveKakaoLoginUser,
    createUser,
    updateUser,
    countAdmins,
    countSuperAdmins,
    isSuperAdminRole,
    forceLogoutUser,
    hashPassword,
    verifyUserPassword,
    findUserByEmailPassword,
    activeUserHasNoPassword,
    createSession,
    createViewAsSession,
    createLoginSession,
    getSessionUser,
    getSessionContext,
    deleteSession,
    deleteAllSessionsForUser,
    setUserPassword,
    changeOwnPassword,
    updateOwnDisplayName,
    MAX_DISPLAY_NAME_LENGTH,
    MIN_PASSWORD_LENGTH,
    permanentlyDeleteUser,
    getLock,
    isLockStale,
    acquireLock,
    assignLockHolder,
    grantLockToPending,
    dismissLockRequest,
    touchLock,
    refreshLock,
    releaseLock,
    releaseAllLocksHeldByUser,
    releaseLocksHeldBySession,
    ensureSameUserSessionCanSave,
    sessionTokenOf,
    lockHeldByCaller,
    countSessionsForUser,
    lockStatusForClient,
    lockPayloadForClient
};
