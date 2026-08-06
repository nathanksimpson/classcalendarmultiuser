/**
 * Collaborative calendar edit locks (worker).
 * Ownership is user + session: same user on another device auto-takes over;
 * different users still use edit-request → Allow / Dismiss.
 */
import * as Auth from './auth-permissions.js';
import * as AppSettings from './app-settings.js';
import { dbOne, dbRun, nowIso } from './db.js';

export function sessionTokenOf(user) {
    if (!user || typeof user !== 'object') {
        return '';
    }
    return String(user.sessionToken || '').trim();
}

/**
 * True when this caller owns the lock for edit.
 * Legacy rows with null holder_session_token match any session of the holder user
 * until the next assign stamps a session (see claimLegacyLockSession).
 */
export function lockHeldByCaller(lock, userId, sessionToken) {
    if (!lock || !userId) {
        return false;
    }
    if (lock.holder_user_id !== userId) {
        return false;
    }
    const holderSession = String(lock.holder_session_token || '').trim();
    if (!holderSession) {
        return true;
    }
    const mine = String(sessionToken || '').trim();
    return Boolean(mine) && holderSession === mine;
}

export async function isLockStale(env, lock) {
    if (!lock) {
        return true;
    }
    const staleMs = await AppSettings.getLockStaleMs(env);
    return Date.now() - new Date(lock.updated_at).getTime() > staleMs;
}

export async function getLock(env, calendarId) {
    return dbOne(env, 'SELECT * FROM calendar_locks WHERE calendar_id = ?', calendarId);
}

/**
 * If lock is held by this user with no session token yet, stamp this session
 * so other devices of the same user no longer see holdsLock.
 */
export async function claimLegacyLockSession(env, lock, userId, sessionToken) {
    if (!lock || !userId || !sessionToken) {
        return lock;
    }
    if (lock.holder_user_id !== userId) {
        return lock;
    }
    if (String(lock.holder_session_token || '').trim()) {
        return lock;
    }
    await dbRun(
        env,
        `UPDATE calendar_locks SET holder_session_token = ?, updated_at = ? WHERE calendar_id = ? AND holder_user_id = ? AND (holder_session_token IS NULL OR holder_session_token = '')`,
        sessionToken,
        nowIso(),
        lock.calendar_id,
        userId
    );
    return Object.assign({}, lock, { holder_session_token: sessionToken });
}

export async function assignLockHolder(env, calendarId, userId, displayName, sessionToken) {
    const at = nowIso();
    const sess = String(sessionToken || '').trim() || null;
    await dbRun(
        env,
        `INSERT INTO calendar_locks (
            calendar_id, holder_user_id, holder_name, updated_at,
            pending_requester_id, pending_requester_name, pending_requested_at,
            holder_session_token, pending_requester_session_token
         )
         VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, NULL)
         ON CONFLICT(calendar_id) DO UPDATE SET
           holder_user_id = excluded.holder_user_id,
           holder_name = excluded.holder_name,
           updated_at = excluded.updated_at,
           pending_requester_id = NULL,
           pending_requester_name = NULL,
           pending_requested_at = NULL,
           holder_session_token = excluded.holder_session_token,
           pending_requester_session_token = NULL`,
        calendarId,
        userId,
        displayName,
        at,
        sess
    );
}

export async function grantLockToPending(env, calendarId, holderUserId, holderSessionToken) {
    const lock = await getLock(env, calendarId);
    if (!lock || (await isLockStale(env, lock))) {
        return { error: 'No active lock on this calendar', status: 400 };
    }
    if (!lockHeldByCaller(lock, holderUserId, holderSessionToken)) {
        return { error: 'Only the current editor can allow another user', status: 403 };
    }
    if (!lock.pending_requester_id) {
        return { error: 'No edit request is pending', status: 400 };
    }
    const pendingId = lock.pending_requester_id;
    const label = lock.pending_requester_name || 'Teacher';
    const pendingSession = String(lock.pending_requester_session_token || '').trim() || null;
    await assignLockHolder(env, calendarId, pendingId, label, pendingSession);
    return { ok: true };
}

export async function touchLockHolder(env, calendarId, userId, sessionToken) {
    let lock = await getLock(env, calendarId);
    if (!lock || (await isLockStale(env, lock))) {
        return false;
    }
    lock = await claimLegacyLockSession(env, lock, userId, sessionToken);
    if (!lockHeldByCaller(lock, userId, sessionToken)) {
        return false;
    }
    await dbRun(env, 'UPDATE calendar_locks SET updated_at = ? WHERE calendar_id = ?', nowIso(), calendarId);
    return true;
}

export async function releaseAllLocksHeldByUser(env, userId) {
    if (!userId) {
        return { released: 0 };
    }
    await dbRun(
        env,
        `UPDATE calendar_locks SET
            pending_requester_id = NULL,
            pending_requester_name = NULL,
            pending_requested_at = NULL,
            pending_requester_session_token = NULL
         WHERE pending_requester_id = ?`,
        userId
    );
    await dbRun(env, 'DELETE FROM calendar_locks WHERE holder_user_id = ?', userId);
    return { released: true };
}

/** Release locks (and clear pending requests) owned by this browser session only. */
export async function releaseLocksHeldBySession(env, sessionToken) {
    const token = String(sessionToken || '').trim();
    if (!token) {
        return { released: 0 };
    }
    await dbRun(
        env,
        `UPDATE calendar_locks SET
            pending_requester_id = NULL,
            pending_requester_name = NULL,
            pending_requested_at = NULL,
            pending_requester_session_token = NULL
         WHERE pending_requester_session_token = ?`,
        token
    );
    await dbRun(env, 'DELETE FROM calendar_locks WHERE holder_session_token = ?', token);
    return { released: true };
}

export async function dismissLockRequest(env, calendarId, holderUserId, holderSessionToken) {
    const lock = await getLock(env, calendarId);
    if (!lock || (await isLockStale(env, lock))) {
        return { error: 'No active lock on this calendar', status: 400 };
    }
    if (!lockHeldByCaller(lock, holderUserId, holderSessionToken)) {
        return { error: 'Only the current editor can dismiss a request', status: 403 };
    }
    await clearLockEditRequest(env, calendarId);
    return { ok: true };
}

export async function lockToClient(env, lock) {
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
        pendingRequester,
        holderSessionBound: Boolean(String(lock.holder_session_token || '').trim())
    };
}

export async function lockStatus(env, calendarId, userId, user = null) {
    const lockStaleMinutes = await AppSettings.getLockStaleMinutes(env);
    const bypassLock = user && Auth.hasPermission(user, Auth.PERMS.BYPASS_COLLABORATIVE_LOCK);
    const sessionToken = sessionTokenOf(user);
    let lock = await getLock(env, calendarId);
    if (!lock || (await isLockStale(env, lock))) {
        return {
            held: false,
            holdsLock: false,
            readOnly: false,
            lock: null,
            pendingEditRequest: false,
            lockStaleMinutes,
            bypassLock: Boolean(bypassLock)
        };
    }
    lock = await claimLegacyLockSession(env, lock, userId, sessionToken);
    const heldByMe = lockHeldByCaller(lock, userId, sessionToken);
    const pendingEditRequest = Boolean(
        lock.pending_requester_id &&
            lock.pending_requester_id === userId &&
            (!lock.pending_requester_session_token ||
                lock.pending_requester_session_token === sessionToken)
    );
    return {
        held: true,
        holdsLock: heldByMe,
        readOnly: bypassLock ? false : !heldByMe,
        lock: await lockToClient(env, lock),
        pendingEditRequest,
        lockStaleMinutes,
        bypassLock: Boolean(bypassLock)
    };
}

export async function lockPayloadForClient(env, calendarId, user, extra = {}) {
    const userId = typeof user === 'string' ? user : user && user.id;
    const userObj = typeof user === 'object' && user ? user : null;
    const status = await lockStatus(env, calendarId, userId, userObj);
    return Object.assign(
        {
            acquired: Boolean(status.holdsLock),
            lock: status.lock,
            readOnly: status.readOnly,
            holdsLock: Boolean(status.holdsLock),
            pendingEditRequest: status.pendingEditRequest,
            lockStaleMinutes: status.lockStaleMinutes,
            editRequestRecorded: false
        },
        extra
    );
}

export async function recordLockEditRequest(env, calendarId, user) {
    const label = user.displayName || user.email || user.id;
    const sessionToken = sessionTokenOf(user) || null;
    await dbRun(
        env,
        `UPDATE calendar_locks SET
            pending_requester_id = ?,
            pending_requester_name = ?,
            pending_requested_at = ?,
            pending_requester_session_token = ?
         WHERE calendar_id = ?`,
        user.id,
        label,
        nowIso(),
        sessionToken,
        calendarId
    );
}

export async function clearLockEditRequest(env, calendarId) {
    await dbRun(
        env,
        `UPDATE calendar_locks SET
            pending_requester_id = NULL,
            pending_requester_name = NULL,
            pending_requested_at = NULL,
            pending_requester_session_token = NULL
         WHERE calendar_id = ?`,
        calendarId
    );
}

/**
 * Same user on another session (or stale/free): take the lock.
 * Different user: record edit request only.
 */
export async function acquireOrRequestLock(env, calendarId, user, opts) {
    const force = Boolean(opts && opts.force);
    const name = user.displayName || user.email || 'Teacher';
    const sessionToken = sessionTokenOf(user);
    const existing = await getLock(env, calendarId);
    if (force && Auth.canForceUnlock(user)) {
        await assignLockHolder(env, calendarId, user.id, name, sessionToken);
        return { acquired: true, forced: true, editRequestRecorded: false };
    }
    const stale = !existing || (await isLockStale(env, existing));
    // Same user (any session) or free/stale → assign to this session (auto-takeover).
    if (stale || (existing && existing.holder_user_id === user.id)) {
        await assignLockHolder(env, calendarId, user.id, name, sessionToken);
        return { acquired: true, forced: false, editRequestRecorded: false };
    }
    await recordLockEditRequest(env, calendarId, user);
    return { acquired: false, forced: false, editRequestRecorded: true };
}

/**
 * Before save: if this user holds on another session, quietly take over.
 * Returns updated lock status.
 */
export async function ensureSameUserSessionCanSave(env, calendarId, user) {
    const sessionToken = sessionTokenOf(user);
    let lock = await getLock(env, calendarId);
    if (!lock || (await isLockStale(env, lock))) {
        return lockStatus(env, calendarId, user.id, user);
    }
    if (lock.holder_user_id === user.id && !lockHeldByCaller(lock, user.id, sessionToken)) {
        const name = user.displayName || user.email || 'Teacher';
        await assignLockHolder(env, calendarId, user.id, name, sessionToken);
    }
    return lockStatus(env, calendarId, user.id, user);
}
