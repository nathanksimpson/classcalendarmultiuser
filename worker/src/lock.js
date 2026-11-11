/**
 * Calendar edit lock: retired (lock-free team sync, November 2026).
 *
 * Saves now send small per-item changes (js/sync-diff.js) that the server applies on top
 * of the latest calendar; the same field changed in two places is "latest save wins" and
 * the saver is told what it replaced. Nobody has to hold a lock to edit.
 *
 * These functions stay so older browser tabs (cached before the update) keep working:
 * every caller is told the calendar is free and they may edit. Edit permission still
 * comes from calendar access (CalAccess), never from here.
 */
import * as AppSettings from './app-settings.js';
import { dbRun } from './db.js';
import { sessionTokenOf as sessionTokenOfCore } from '../../shared/lock-core.cjs';

export function sessionTokenOf(user) {
    return sessionTokenOfCore(user);
}

/** Free-calendar answer shared by every status call. */
async function freeStatus(env, user) {
    return {
        held: false,
        // "You may edit" for old clients; readOnly from permissions is added by calendar-meta.
        holdsLock: true,
        readOnly: false,
        lock: null,
        pendingEditRequest: false,
        lockStaleMinutes: await AppSettings.getLockStaleMinutes(env),
        bypassLock: Boolean(user)
    };
}

export function lockHeldByCaller() {
    return true;
}

export async function isLockStale() {
    return true;
}

export async function getLock() {
    return null;
}

export async function claimLegacyLockSession(env, lock) {
    return lock;
}

export async function assignLockHolder() {
    return true;
}

export async function grantLockToPending() {
    return { ok: true };
}

export async function touchLockHolder() {
    return true;
}

/** Clear any rows left from before the lock was retired (harmless if none). */
export async function releaseAllLocksHeldByUser(env, userId) {
    if (userId) {
        await dbRun(env, 'DELETE FROM calendar_locks WHERE holder_user_id = ?', userId).catch(() => {});
    }
    return { released: true };
}

export async function releaseLocksHeldBySession(env, sessionToken) {
    const token = String(sessionToken || '').trim();
    if (token) {
        await dbRun(env, 'DELETE FROM calendar_locks WHERE holder_session_token = ?', token).catch(() => {});
    }
    return { released: true };
}

export async function dismissLockRequest() {
    return { ok: true };
}

export async function lockToClient() {
    return null;
}

export async function lockStatus(env, calendarId, userId, user = null) {
    return freeStatus(env, user);
}

export async function lockPayloadForClient(env, calendarId, user, extra = {}) {
    const status = await freeStatus(env, typeof user === 'object' ? user : null);
    return Object.assign(
        {
            acquired: true,
            lock: null,
            readOnly: false,
            holdsLock: true,
            pendingEditRequest: false,
            lockStaleMinutes: status.lockStaleMinutes,
            editRequestRecorded: false
        },
        extra
    );
}

export async function recordLockEditRequest() {}

export async function clearLockEditRequest() {}

export async function acquireOrRequestLock() {
    return { acquired: true, forced: false, editRequestRecorded: false };
}

export async function ensureSameUserSessionCanSave(env, calendarId, user) {
    return freeStatus(env, user);
}
