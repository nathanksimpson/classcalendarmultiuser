/**
 * Same-user multi-session collaborative lock helpers (worker lock.js).
 * Run: node tests/session-lock.test.mjs
 */
import path from 'path';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const Lock = await import(pathToFileURL(path.join(root, 'worker', 'src', 'lock.js')).href);

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

/** Minimal in-memory D1-ish env for lock.js helpers. */
function createMemoryEnv(seed = {}) {
    const locks = new Map();
    const users = new Map(Object.entries(seed.users || {}));
    if (seed.lock) {
        locks.set(seed.lock.calendar_id, Object.assign({}, seed.lock));
    }
    return {
        _locks: locks,
        _users: users,
        DB: {
            prepare(sql) {
                const text = String(sql);
                return {
                    bind(...args) {
                        this._args = args;
                        return this;
                    },
                    async first() {
                        if (/FROM calendar_locks WHERE calendar_id/i.test(text)) {
                            return locks.get(argsOr(this, 0)) || null;
                        }
                        if (/FROM users WHERE id/i.test(text)) {
                            const id = argsOr(this, 0);
                            return users.get(id) || null;
                        }
                        return null;
                    },
                    async run() {
                        const a = this._args || [];
                        if (/INSERT INTO calendar_locks/i.test(text) || /ON CONFLICT\(calendar_id\) DO UPDATE/i.test(text)) {
                            const calendarId = a[0];
                            locks.set(calendarId, {
                                calendar_id: calendarId,
                                holder_user_id: a[1],
                                holder_name: a[2],
                                updated_at: a[3],
                                pending_requester_id: null,
                                pending_requester_name: null,
                                pending_requested_at: null,
                                holder_session_token: a[4],
                                pending_requester_session_token: null
                            });
                            return { success: true, meta: { changes: 1 } };
                        }
                        if (/UPDATE calendar_locks SET\s+pending_requester_id/i.test(text) && /WHERE calendar_id/i.test(text)) {
                            const lock = locks.get(a[a.length - 1]);
                            if (lock) {
                                lock.pending_requester_id = a[0];
                                lock.pending_requester_name = a[1];
                                lock.pending_requested_at = a[2];
                                lock.pending_requester_session_token = a[3];
                            }
                            return { success: true, meta: { changes: 1 } };
                        }
                        if (/DELETE FROM calendar_locks WHERE holder_session_token/i.test(text)) {
                            for (const [id, lock] of [...locks.entries()]) {
                                if (lock.holder_session_token === a[0]) {
                                    locks.delete(id);
                                }
                            }
                            return { success: true, meta: { changes: 1 } };
                        }
                        if (/DELETE FROM calendar_locks WHERE holder_user_id/i.test(text)) {
                            for (const [id, lock] of [...locks.entries()]) {
                                if (lock.holder_user_id === a[0]) {
                                    locks.delete(id);
                                }
                            }
                            return { success: true, meta: { changes: 1 } };
                        }
                        if (/UPDATE calendar_locks SET[\s\S]*pending_requester_session_token = NULL[\s\S]*WHERE pending_requester_session_token/i.test(text)) {
                            for (const lock of locks.values()) {
                                if (lock.pending_requester_session_token === a[0]) {
                                    lock.pending_requester_id = null;
                                    lock.pending_requester_name = null;
                                    lock.pending_requested_at = null;
                                    lock.pending_requester_session_token = null;
                                }
                            }
                            return { success: true, meta: { changes: 1 } };
                        }
                        if (/UPDATE calendar_locks SET[\s\S]*pending_requester_id = NULL[\s\S]*WHERE pending_requester_id/i.test(text)) {
                            for (const lock of locks.values()) {
                                if (lock.pending_requester_id === a[0]) {
                                    lock.pending_requester_id = null;
                                    lock.pending_requester_name = null;
                                    lock.pending_requested_at = null;
                                    lock.pending_requester_session_token = null;
                                }
                            }
                            return { success: true, meta: { changes: 1 } };
                        }
                        if (/UPDATE calendar_locks SET holder_session_token/i.test(text)) {
                            const lock = locks.get(a[2]);
                            if (lock && lock.holder_user_id === a[3] && !String(lock.holder_session_token || '').trim()) {
                                lock.holder_session_token = a[0];
                                lock.updated_at = a[1];
                            }
                            return { success: true, meta: { changes: 1 } };
                        }
                        if (/UPDATE calendar_locks SET updated_at/i.test(text)) {
                            const lock = locks.get(a[1]);
                            if (lock) {
                                lock.updated_at = a[0];
                            }
                            return { success: true, meta: { changes: 1 } };
                        }
                        return { success: true, meta: { changes: 0 } };
                    },
                    async all() {
                        return { results: [] };
                    }
                };
                function argsOr(stmt, i) {
                    return (stmt._args || [])[i];
                }
            }
        }
    };
}

// --- Pure helpers ---
assert(Lock.sessionTokenOf({ sessionToken: ' abc ' }) === 'abc', 'sessionTokenOf trims');
assert(Lock.sessionTokenOf(null) === '', 'sessionTokenOf null');

const lockA = {
    holder_user_id: 'u1',
    holder_session_token: 'sess-1'
};
assert(Lock.lockHeldByCaller(lockA, 'u1', 'sess-1') === true, 'same user+session holds');
assert(Lock.lockHeldByCaller(lockA, 'u1', 'sess-2') === false, 'same user other session does not hold');
assert(Lock.lockHeldByCaller(lockA, 'u2', 'sess-1') === false, 'different user does not hold');
assert(
    Lock.lockHeldByCaller({ holder_user_id: 'u1', holder_session_token: null }, 'u1', 'sess-1') === true,
    'legacy null session matches holder user'
);

// --- Same-user acquire auto-takeover ---
{
    const env = createMemoryEnv({
        lock: {
            calendar_id: 'cal-1',
            holder_user_id: 'u1',
            holder_name: 'Teacher',
            updated_at: new Date().toISOString(),
            holder_session_token: 'sess-1',
            pending_requester_id: null,
            pending_requester_name: null,
            pending_requested_at: null,
            pending_requester_session_token: null
        },
        users: {
            u1: { id: 'u1', email: 'a@x.com', display_name: 'Teacher' }
        }
    });
    const userSess2 = { id: 'u1', displayName: 'Teacher', email: 'a@x.com', sessionToken: 'sess-2' };
    const result = await Lock.acquireOrRequestLock(env, 'cal-1', userSess2, {});
    assert(result.acquired === true, 'same user other session acquires (takeover)');
    assert(result.editRequestRecorded === false, 'same user does not record edit request');
    const after = env._locks.get('cal-1');
    assert(after.holder_session_token === 'sess-2', 'lock session stamped to taker');
}

// --- Different user stays strict ---
{
    const env = createMemoryEnv({
        lock: {
            calendar_id: 'cal-2',
            holder_user_id: 'u1',
            holder_name: 'A',
            updated_at: new Date().toISOString(),
            holder_session_token: 'sess-a',
            pending_requester_id: null,
            pending_requester_name: null,
            pending_requested_at: null,
            pending_requester_session_token: null
        },
        users: {
            u1: { id: 'u1', email: 'a@x.com', display_name: 'A' },
            u2: { id: 'u2', email: 'b@x.com', display_name: 'B' }
        }
    });
    const userB = { id: 'u2', displayName: 'B', email: 'b@x.com', sessionToken: 'sess-b' };
    const result = await Lock.acquireOrRequestLock(env, 'cal-2', userB, {});
    assert(result.acquired === false, 'different user does not auto-acquire');
    assert(result.editRequestRecorded === true, 'different user records edit request');
    const after = env._locks.get('cal-2');
    assert(after.holder_user_id === 'u1', 'holder unchanged for different user');
    assert(after.pending_requester_id === 'u2', 'pending requester set');
}

// --- ensureSameUserSessionCanSave takeover ---
{
    const env = createMemoryEnv({
        lock: {
            calendar_id: 'cal-3',
            holder_user_id: 'u1',
            holder_name: 'Teacher',
            updated_at: new Date().toISOString(),
            holder_session_token: 'sess-1',
            pending_requester_id: null,
            pending_requester_name: null,
            pending_requested_at: null,
            pending_requester_session_token: null
        },
        users: {
            u1: { id: 'u1', email: 'a@x.com', display_name: 'Teacher' }
        }
    });
    const userSess2 = { id: 'u1', displayName: 'Teacher', email: 'a@x.com', sessionToken: 'sess-2' };
    const status = await Lock.ensureSameUserSessionCanSave(env, 'cal-3', userSess2);
    assert(status.holdsLock === true, 'save path same-user takeover holdsLock');
    assert(status.readOnly === false, 'save path same-user takeover not readOnly');
    assert(env._locks.get('cal-3').holder_session_token === 'sess-2', 'save path stamps session');
}

// --- Session logout releases only that session's locks ---
{
    const env = createMemoryEnv({
        lock: {
            calendar_id: 'cal-4',
            holder_user_id: 'u1',
            holder_name: 'Teacher',
            updated_at: new Date().toISOString(),
            holder_session_token: 'sess-2',
            pending_requester_id: null,
            pending_requester_name: null,
            pending_requested_at: null,
            pending_requester_session_token: null
        }
    });
    await Lock.releaseLocksHeldBySession(env, 'sess-1');
    assert(env._locks.has('cal-4'), 'logout session 1 leaves session 2 lock');
    await Lock.releaseLocksHeldBySession(env, 'sess-2');
    assert(!env._locks.has('cal-4'), 'logout session 2 releases its lock');
}

// --- logout-all style wipe still clears all user locks ---
{
    const env = createMemoryEnv({
        lock: {
            calendar_id: 'cal-5',
            holder_user_id: 'u1',
            holder_name: 'Teacher',
            updated_at: new Date().toISOString(),
            holder_session_token: 'sess-9',
            pending_requester_id: null,
            pending_requester_name: null,
            pending_requested_at: null,
            pending_requester_session_token: null
        }
    });
    await Lock.releaseAllLocksHeldByUser(env, 'u1');
    assert(!env._locks.has('cal-5'), 'releaseAllLocksHeldByUser clears user locks');
}

console.log('session-lock.test.mjs: all passed');
