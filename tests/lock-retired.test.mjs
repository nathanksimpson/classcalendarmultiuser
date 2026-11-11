/**
 * The calendar edit lock is retired (lock-free sync). Old browser tabs still call the
 * lock endpoints; they must always hear "free, you may edit" and nothing may block a save.
 * Run: node tests/lock-retired.test.mjs
 */
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const Lock = await import(pathToFileURL(path.join(root, 'worker', 'src', 'lock.js')).href);

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const ran = [];
const env = {
    DB: {
        prepare(sql) {
            return {
                bind(...args) {
                    ran.push({ sql: String(sql), args });
                    return this;
                },
                async run() {
                    return { meta: { changes: 0 } };
                },
                async first() {
                    // An old lock row held by someone else must be ignored.
                    return { holder_user_id: 'other', updated_at: new Date().toISOString() };
                },
                async all() {
                    return { results: [] };
                }
            };
        }
    }
};

const me = { id: 'u1', sessionToken: 'tab-a', displayName: 'Nathan' };
const otherTab = { id: 'u1', sessionToken: 'tab-b', displayName: 'Nathan' };
const otherTeacher = { id: 'u2', sessionToken: 'x', displayName: 'Kim' };

for (const user of [me, otherTab, otherTeacher]) {
    const status = await Lock.lockStatus(env, 'cal1', user.id, user);
    assert(status.holdsLock === true && status.readOnly === false && status.lock === null,
        'free for ' + user.sessionToken);
    const saveCheck = await Lock.ensureSameUserSessionCanSave(env, 'cal1', user);
    assert(saveCheck.readOnly === false, 'save never blocked for ' + user.sessionToken);
    const acquired = await Lock.acquireOrRequestLock(env, 'cal1', user, {});
    assert(acquired.acquired === true && acquired.editRequestRecorded === false, 'acquire is a no-op success');
    const payload = await Lock.lockPayloadForClient(env, 'cal1', user);
    assert(payload.holdsLock === true && payload.readOnly === false, 'payload free');
}
assert((await Lock.getLock(env, 'cal1')) === null, 'leftover lock rows are not read');
assert((await Lock.touchLockHolder(env, 'cal1', 'u1', 'tab-a')) === true, 'touch ok');
assert(!ran.some((r) => /INSERT INTO calendar_locks/i.test(r.sql)), 'never writes a lock');

console.log('lock-retired.test.mjs: all passed');
