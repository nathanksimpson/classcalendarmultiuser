/**
 * Collaborative calendar edit locks (worker).
 */
import * as Auth from './auth-permissions.js';
import * as AppSettings from './app-settings.js';
import { dbOne, dbRun, nowIso } from './db.js';

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

export async function assignLockHolder(env, calendarId, userId, displayName) {
    const at = nowIso();
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
        calendarId,
        userId,
        displayName,
        at
    );
}

export async function grantLockToPending(env, calendarId, holderUserId) {
    const lock = await getLock(env, calendarId);
    if (!lock || (await isLockStale(env, lock))) {
        return { error: 'No active lock on this calendar', status: 400 };
    }
    if (lock.holder_user_id !== holderUserId) {
        return { error: 'Only the current editor can allow another user', status: 403 };
    }
    if (!lock.pending_requester_id) {
        return { error: 'No edit request is pending', status: 400 };
    }
    const pendingId = lock.pending_requester_id;
    const label = lock.pending_requester_name || 'Teacher';
    await assignLockHolder(env, calendarId, pendingId, label);
    return { ok: true };
}

export async function touchLockHolder(env, calendarId, userId) {
    const lock = await getLock(env, calendarId);
    if (!lock || (await isLockStale(env, lock))) {
        return false;
    }
    if (lock.holder_user_id !== userId) {
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
        `UPDATE calendar_locks SET pending_requester_id = NULL, pending_requester_name = NULL, pending_requested_at = NULL
         WHERE pending_requester_id = ?`,
        userId
    );
    await dbRun(env, 'DELETE FROM calendar_locks WHERE holder_user_id = ?', userId);
    return { released: true };
}

export async function dismissLockRequest(env, calendarId, holderUserId) {
    const lock = await getLock(env, calendarId);
    if (!lock || (await isLockStale(env, lock))) {
        return { error: 'No active lock on this calendar', status: 400 };
    }
    if (lock.holder_user_id !== holderUserId) {
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
        pendingRequester
    };
}

export async function lockStatus(env, calendarId, userId, user = null) {
    const lockStaleMinutes = await AppSettings.getLockStaleMinutes(env);
    const bypassLock = user && Auth.hasPermission(user, Auth.PERMS.BYPASS_COLLABORATIVE_LOCK);
    const lock = await getLock(env, calendarId);
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
    const heldByMe = lock.holder_user_id === userId;
    const pendingEditRequest = Boolean(lock.pending_requester_id && lock.pending_requester_id === userId);
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
    await dbRun(
        env,
        `UPDATE calendar_locks SET pending_requester_id = ?, pending_requester_name = ?, pending_requested_at = ? WHERE calendar_id = ?`,
        user.id,
        label,
        nowIso(),
        calendarId
    );
}

export async function clearLockEditRequest(env, calendarId) {
    await dbRun(
        env,
        `UPDATE calendar_locks SET pending_requester_id = NULL, pending_requester_name = NULL, pending_requested_at = NULL WHERE calendar_id = ?`,
        calendarId
    );
}
