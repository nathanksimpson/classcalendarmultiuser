/**
 * Pure collaborative-lock helpers shared by Express (`server/users.js`)
 * and Cloudflare Worker (`worker/src/lock.js`). Persistence stays in adapters.
 */

function sessionTokenOf(user) {
    if (!user || typeof user !== 'object') {
        return '';
    }
    return String(user.sessionToken || '').trim();
}

/**
 * True when this caller owns the lock for edit.
 * Legacy rows with null/empty holder_session_token match any session of the holder user
 * until the next assign stamps a session.
 */
function lockHeldByCaller(lock, userId, sessionToken) {
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

/** Pure staleness check — adapters pass stale window in ms from app settings. */
function isLockStaleByUpdatedAt(lock, staleMs) {
    if (!lock) {
        return true;
    }
    const ms = Number(staleMs);
    const windowMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
    const updated = new Date(lock.updated_at).getTime();
    if (!Number.isFinite(updated)) {
        return true;
    }
    return Date.now() - updated > windowMs;
}

/** ISO expiry timestamp for client display, or null. */
function lockExpiresAtIso(lock, staleMs) {
    if (!lock || !lock.updated_at) {
        return null;
    }
    const ms = Number(staleMs);
    const windowMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
    const updated = new Date(lock.updated_at).getTime();
    if (!Number.isFinite(updated)) {
        return null;
    }
    return new Date(updated + windowMs).toISOString();
}

/**
 * Remaining life of the lock in ms (0 if stale/missing).
 * Useful for skipping redundant lock/touch while still fresh.
 */
function lockRemainingMs(lock, staleMs) {
    if (!lock || !lock.updated_at) {
        return 0;
    }
    const ms = Number(staleMs);
    const windowMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
    const updated = new Date(lock.updated_at).getTime();
    if (!Number.isFinite(updated)) {
        return 0;
    }
    return Math.max(0, updated + windowMs - Date.now());
}

module.exports = {
    sessionTokenOf,
    lockHeldByCaller,
    isLockStaleByUpdatedAt,
    lockExpiresAtIso,
    lockRemainingMs
};
