/**
 * Security and save-path checks against the real Worker code (tests/support/worker-rig.mjs).
 * Run: node tests/worker-hardening.test.mjs   (needs better-sqlite3, like worker-concurrency)
 *
 * Covers: same-site return paths, endpoints closed to accounts with no calendar, the save
 * response matching a fresh read, and the storage-limit answer.
 */
import path from 'node:path';
import { makeEnv, loadWorker, addUser, grant, client, ROOT } from './support/worker-rig.mjs';

const OAuthState = await import(path.join(ROOT, 'worker', 'src', 'oauth-state.js'));
const CalendarWrite = await import(path.join(ROOT, 'worker', 'src', 'calendar-write.js'));
const worker = await loadWorker();

let failures = 0;
function check(name, ok, detail) {
    if (!ok) {
        failures += 1;
        console.error(`FAIL ${name}${detail ? ` (${detail})` : ''}`);
    }
}

// --- Return paths stay on this site -------------------------------------------------
{
    const f = OAuthState.sanitizeReturnTo;
    check('plain path kept', f('/index.html?calendar=abc#x') === '/index.html?calendar=abc#x');
    check('root kept', f('/') === '/');
    check('protocol-relative blocked', f('//evil.example') === '/');
    check('backslash blocked', f('/\\evil.example') === '/');
    check('tab blocked', f('/\t/evil.example') === '/');
    check('newline blocked', f('/a\nb') === '/');
    check('absolute url blocked', f('https://evil.example') === '/');
    check('non-string blocked', f(undefined) === '/' && f(null) === '/');

    const env = makeEnv();
    const res = await worker.fetch(
        new Request('https://classmanager.live/signed-in?return=' + encodeURIComponent('/\\evil.example')),
        env,
        { waitUntil() {}, passThroughOnException() {} }
    );
    check('signed-in never redirects off site', res.status >= 300 && res.status < 400 && res.headers.get('location') === '/', `location=${res.headers.get('location')}`);
}

/** Admin A owns a calendar, teacher B is a member, P signed in but has no calendar. */
async function setup() {
    const env = makeEnv();
    const A = client(worker, env, addUser(env, 'ua', 'Teacher Alpha', 'admin'));
    const B = client(worker, env, addUser(env, 'ub', 'Teacher Beta', 'teacher'));
    const P = client(worker, env, addUser(env, 'up', 'Pending Person', 'teacher'));
    const created = await A('POST', '/api/calendars', {
        name: 'Test Term',
        data: {
            classes: [{ id: 'c1', name: 'Class One', classTeachers: [{ userId: 'ub', name: 'B' }] }],
            events: []
        }
    });
    const id = created.body.id;
    grant(env, id, 'ub', 'editor');
    env.DB.raw.prepare('DELETE FROM calendar_locks').run();
    return { env, A, B, P, id };
}

// --- Accounts with no calendar cannot use shared endpoints ---------------------------
{
    const { B, P } = await setup();
    const board = { board: { sounds: [] } };

    const pGet = await P('GET', '/api/soundboard');
    check('pending: soundboard read refused', pGet.status === 403, `status=${pGet.status}`);
    const pPut = await P('PUT', '/api/soundboard', board);
    check('pending: soundboard write refused', pPut.status === 403, `status=${pPut.status}`);
    const pTr = await P('POST', '/api/translate', { text: 'hello', target: 'ko' });
    check('pending: translate refused', pTr.status === 403, `status=${pTr.status}`);
    const pTms = await P('POST', '/api/tms/run/roster', { username: 'x', password: 'y' });
    check('pending: TMS run refused', pTms.status === 403, `status=${pTms.status}`);

    const bGet = await B('GET', '/api/soundboard');
    check('member: soundboard read allowed', bGet.status === 200, `status=${bGet.status}`);
    const bTr = await B('POST', '/api/translate', { text: 'hello', target: 'ko' });
    check('member: translate passes the access gate', bTr.status !== 403 && bTr.status !== 401, `status=${bTr.status}`);
}

// --- A save answers with exactly what a fresh read returns ---------------------------
{
    const { env, B, id } = await setup();
    const before = await B('GET', `/api/calendars/${id}`);
    const patch = await B('PATCH', `/api/calendars/${id}`, {
        baseRevision: before.body.revision,
        mutations: [{ entity: 'classes', action: 'patch', payload: { id: 'c1', set: { room: '201' } } }]
    });
    check('patch ok', patch.status === 200, `status=${patch.status}`);
    const after = await B('GET', `/api/calendars/${id}`);
    for (const key of ['id', 'name', 'revision', 'updatedAt', 'updatedBy']) {
        check(`patch response ${key} matches a fresh read`, patch.body[key] === after.body[key], `${patch.body[key]} vs ${after.body[key]}`);
    }
    check('patch response data matches a fresh read', JSON.stringify(patch.body.data) === JSON.stringify(after.body.data));
    check('patch response hides change marks', !('_syncRevs' in (patch.body.data || {})));
    check('patch applied', after.body.data.classes[0].room === '201');
    check('patch bumped the revision once', after.body.revision === before.body.revision + 1);

    // Nothing allowed to change: still answers with the current document.
    const empty = await B('PATCH', `/api/calendars/${id}`, { baseRevision: after.body.revision, mutations: [] });
    check('empty patch handled', empty.status === 200 || empty.status === 400, `status=${empty.status}`);

    const put = await B('PUT', `/api/calendars/${id}`, {
        revision: after.body.revision,
        name: after.body.name,
        data: Object.assign({}, after.body.data, { events: [{ id: 'e1', title: 'Parents day', date: '2026-11-20' }] })
    });
    const afterPut = await B('GET', `/api/calendars/${id}`);
    check('put ok', put.status === 200, `status=${put.status}`);
    check('put response matches a fresh read', JSON.stringify(put.body) === JSON.stringify({
        id: afterPut.body.id,
        name: afterPut.body.name,
        revision: afterPut.body.revision,
        updatedAt: afterPut.body.updatedAt,
        updatedBy: afterPut.body.updatedBy,
        data: afterPut.body.data
    }));
    const stored = JSON.parse(env.DB.raw.prepare('SELECT data FROM calendars WHERE id = ?').get(id).data);
    check('stored document kept the event', stored.events.length === 1);
}

// --- A calendar past the D1 value limit is refused with a clear answer ----------------
{
    const { env, B, id } = await setup();
    const before = await B('GET', `/api/calendars/${id}`);
    const big = 'x'.repeat(CalendarWrite.CALENDAR_MAX_STORED_BYTES);
    const patch = await B('PATCH', `/api/calendars/${id}`, {
        baseRevision: before.body.revision,
        mutations: [{ entity: 'classes', action: 'patch', payload: { id: 'c1', set: { room: big } } }]
    });
    check('oversize save answers 507', patch.status === 507 && patch.body && patch.body.code === 'CALENDAR_TOO_LARGE', `status=${patch.status}`);
    const row = env.DB.raw.prepare('SELECT revision FROM calendars WHERE id = ?').get(id);
    check('oversize save wrote nothing', Number(row.revision) === before.body.revision);
    check('byte length counts multi-byte text', CalendarWrite.storedByteLength('가나') === 6);
}

// --- Nightly snapshots: one per changed revision, pruned after the retention window ---
{
    const { env, B, id } = await setup();
    const runCron = async (nowMs) => {
        const pending = [];
        const realNow = Date.now;
        Date.now = () => nowMs;
        try {
            await worker.scheduled({}, env, { waitUntil: (p) => pending.push(p) });
            await Promise.all(pending);
        } finally {
            Date.now = realNow;
        }
    };
    const history = () => env.DB.raw.prepare('SELECT revision, data, saved_at FROM calendar_history WHERE calendar_id = ? ORDER BY revision').all(id);
    const day = 86400 * 1000;
    const hour = 3600 * 1000; // stay inside the test session's one-day life until the last run
    const t0 = Date.now();

    await runCron(t0);
    check('first run snapshots the calendar', history().length === 1);
    await runCron(t0 + hour);
    check('unchanged calendar is not copied again', history().length === 1);

    const doc = await B('GET', `/api/calendars/${id}`);
    await B('PATCH', `/api/calendars/${id}`, {
        baseRevision: doc.body.revision,
        mutations: [{ entity: 'classes', action: 'patch', payload: { id: 'c1', set: { room: '305' } } }]
    });
    await runCron(t0 + 2 * hour);
    const two = history();
    check('changed calendar gets a new snapshot', two.length === 2 && two[1].revision === doc.body.revision + 1);
    check('snapshot holds the stored document', JSON.parse(two[1].data).classes[0].room === '305');
    check('older snapshot keeps the earlier state', JSON.parse(two[0].data).classes[0].room !== '305');

    await runCron(t0 + 15 * day);
    const kept = history();
    check('snapshots past 14 days are pruned', kept.length === 1 && kept[0].revision === doc.body.revision + 1, `kept=${kept.length}`);
}

if (failures) {
    console.error(`worker-hardening: ${failures} failure(s)`);
    process.exit(1);
}
console.log('worker-hardening.test.mjs: all passed');
