/**
 * Multi-teacher save races against the real Worker code (tests/support/worker-rig.mjs).
 * Run: node tests/worker-concurrency.test.mjs
 */
import path from 'node:path';
import { makeEnv, loadWorker, addUser, grant, client, ROOT } from './support/worker-rig.mjs';

const Lock = await import(path.join(ROOT, 'worker', 'src', 'lock.js'));
const worker = await loadWorker();

let failures = 0;
function check(name, ok, detail) {
    if (!ok) {
        failures += 1;
        console.error(`FAIL ${name}${detail ? ` (${detail})` : ''}`);
    }
}

/** Head teacher A (admin), class teachers B, suggester S. Invented names only. */
async function setup() {
    const env = makeEnv();
    const A = client(worker, env, addUser(env, 'ua', 'Teacher Alpha', 'admin'));
    const B = client(worker, env, addUser(env, 'ub', 'Teacher Beta', 'teacher'));
    const S = client(worker, env, addUser(env, 'us', 'Teacher Sigma', 'teacher'));
    const created = await A('POST', '/api/calendars', {
        name: 'Test Term',
        data: {
            classes: [
                { id: 'c1', name: 'Class One', classTeachers: [{ userId: 'ua', name: 'A' }, { userId: 'ub', name: 'B' }] },
                { id: 'c2', name: 'Class Two', classTeachers: [{ userId: 'ub', name: 'B' }] }
            ],
            events: [],
            attendanceSessions: [
                {
                    id: 's1',
                    classId: 'c1',
                    date: '2026-11-04',
                    records: [
                        { studentId: 'k1', status: 'present' },
                        { studentId: 'k2', status: 'present' }
                    ]
                }
            ]
        }
    });
    const id = created.body.id;
    grant(env, id, 'ub', 'editor');
    grant(env, id, 'us', 'suggester');
    // Release the creator's lock so each test starts from a free calendar.
    env.DB.raw.prepare('DELETE FROM calendar_locks').run();
    return { env, A, B, S, id };
}

const mark = (studentId, status) => [
    {
        entity: 'attendanceSessions',
        action: 'upsert',
        payload: { session: { id: 's1', classId: 'c1', records: [{ studentId, status }], touchedStudentIds: [studentId] } }
    }
];
const statuses = (doc) => Object.fromEntries(doc.data.attendanceSessions[0].records.map((r) => [r.studentId, r.status]));

// Edit lock retired: two teachers (or two devices) asking at once both may edit, nothing stored.
{
    const { env, id } = await setup();
    const ua = { id: 'ua', displayName: 'A', role: 'teacher', sessionToken: 'tok-ua' };
    const ub = { id: 'ub', displayName: 'B', role: 'teacher', sessionToken: 'tok-ub' };
    const [ra, rb] = await Promise.all([
        Lock.acquireOrRequestLock(env, id, ua, {}),
        Lock.acquireOrRequestLock(env, id, ub, {})
    ]);
    const rows = env.DB.raw.prepare('SELECT COUNT(*) AS n FROM calendar_locks').get().n;
    check('both may edit at once', ra.acquired === true && rb.acquired === true);
    check('no lock row written', rows === 0, `rows=${rows}`);
}

// Different students in the same session, saved at the same moment: both kept.
{
    const { A, B, id } = await setup();
    const rev = (await A('GET', `/api/calendars/${id}`)).body.revision;
    const [ra, rb] = await Promise.all([
        A('PATCH', `/api/calendars/${id}`, { baseRevision: rev, mutations: mark('k1', 'late') }),
        B('PATCH', `/api/calendars/${id}`, { baseRevision: rev, mutations: mark('k2', 'absent') })
    ]);
    const s = statuses((await A('GET', `/api/calendars/${id}`)).body);
    check('different students both saved', ra.status === 200 && rb.status === 200, `A=${ra.status} B=${rb.status}`);
    check('different students: both marks kept', s.k1 === 'late' && s.k2 === 'absent', JSON.stringify(s));
}

// Same student changed by two teachers from the same base: latest save wins and says so.
{
    const { A, B, id } = await setup();
    const rev = (await A('GET', `/api/calendars/${id}`)).body.revision;
    const ra = await A('PATCH', `/api/calendars/${id}`, { baseRevision: rev, mutations: mark('k1', 'late') });
    const rb = await B('PATCH', `/api/calendars/${id}`, { baseRevision: rev, mutations: mark('k1', 'absent') });
    const s = statuses((await A('GET', `/api/calendars/${id}`)).body);
    check('same student: both saves accepted', ra.status === 200 && rb.status === 200, `A=${ra.status} B=${rb.status}`);
    check('same student: latest value kept', s.k1 === 'absent', JSON.stringify(s));
    check('latest save told what it replaced', rb.body && Array.isArray(rb.body.overwritten) &&
        rb.body.overwritten.includes('attendanceSessions:s1@k1'), JSON.stringify(rb.body && rb.body.overwritten));
    check('first save had nothing to report', Array.isArray(ra.body.overwritten) && ra.body.overwritten.length === 0);
}

// Re-sending a value that is already stored is not a conflict.
{
    const { A, B, id } = await setup();
    const rev = (await A('GET', `/api/calendars/${id}`)).body.revision;
    await A('PATCH', `/api/calendars/${id}`, { baseRevision: rev, mutations: mark('k1', 'late') });
    const rb = await B('PATCH', `/api/calendars/${id}`, { baseRevision: rev, mutations: mark('k1', 'late') });
    check('same value twice is fine', rb.status === 200, `B=${rb.status}`);
}

// Schedule editor holds the lock; an unrelated attendance save lands first.
{
    const { A, B, id } = await setup();
    await A('POST', `/api/calendars/${id}/lock`, {});
    const rev = (await A('GET', `/api/calendars/${id}`)).body.revision;
    await B('PATCH', `/api/calendars/${id}`, { baseRevision: rev, mutations: mark('k2', 'late') });
    const ra = await A('PATCH', `/api/calendars/${id}`, {
        baseRevision: rev,
        mutations: [{ entity: 'classes', action: 'upsert', payload: { class: { id: 'c2', name: 'Class Two renamed', classTeachers: [{ userId: 'ub', name: 'B' }] } } }]
    });
    const doc = (await A('GET', `/api/calendars/${id}`)).body;
    check('schedule edit not refused after unrelated save', ra.status === 200, `A=${ra.status}`);
    check('both changes present', doc.data.classes.find((c) => c.id === 'c2').name === 'Class Two renamed' && statuses(doc).k2 === 'late');
}

// A whole-session save sent from an old copy must not undo another teacher's mark.
{
    const { A, B, id } = await setup();
    const doc0 = (await A('GET', `/api/calendars/${id}`)).body;
    await B('PATCH', `/api/calendars/${id}`, { baseRevision: doc0.revision, mutations: mark('k2', 'absent') });
    const stale = doc0.data.attendanceSessions[0];
    const r = await A('PATCH', `/api/calendars/${id}`, {
        baseRevision: doc0.revision,
        mutations: [{ entity: 'attendanceSessions', action: 'upsert', payload: { session: Object.assign({}, stale, { records: [{ studentId: 'k1', status: 'late' }, { studentId: 'k2', status: 'present' }] }) } }]
    });
    const s = statuses((await A('GET', `/api/calendars/${id}`)).body);
    check('stale whole-session save is accepted', r.status === 200, `status=${r.status}`);
    check("other teacher's newer mark survives", s.k2 === 'absent', JSON.stringify(s));
    check('own mark from that save applied', s.k1 === 'late', JSON.stringify(s));
}

// Suggestion applied after the schedule changed: refused, newer edit kept.
{
    const { A, S, id } = await setup();
    const doc = (await A('GET', `/api/calendars/${id}`)).body;
    const sug = await S('POST', `/api/calendars/${id}/suggestions`, {
        revision: doc.revision,
        data: Object.assign({}, doc.data, { events: [{ id: 'e1', title: 'Suggested event' }] }),
        summary: 'add event'
    });
    await A('POST', `/api/calendars/${id}/lock`, {});
    await A('PUT', `/api/calendars/${id}`, {
        revision: doc.revision,
        data: Object.assign({}, doc.data, { classes: doc.data.classes.concat([{ id: 'c3', name: 'New class' }]) })
    });
    const ap = await A('POST', `/api/calendars/${id}/suggestions/${sug.body.id}/apply`, {});
    const after = (await A('GET', `/api/calendars/${id}`)).body;
    check('outdated suggestion refused', ap.status === 409 && ap.body.code === 'SUGGESTION_OUTDATED', `status=${ap.status}`);
    check('newer schedule edit kept', after.data.classes.some((c) => c.id === 'c3'));
}

// Suggestion applied after only attendance changed: applied, attendance kept.
{
    const { A, B, S, id } = await setup();
    const doc = (await A('GET', `/api/calendars/${id}`)).body;
    const sug = await S('POST', `/api/calendars/${id}/suggestions`, {
        revision: doc.revision,
        data: Object.assign({}, doc.data, { events: [{ id: 'e1', title: 'Suggested event' }] }),
        summary: 'add event'
    });
    await B('PATCH', `/api/calendars/${id}`, { baseRevision: doc.revision, mutations: mark('k2', 'absent') });
    const ap = await A('POST', `/api/calendars/${id}/suggestions/${sug.body.id}/apply`, {});
    const after = (await A('GET', `/api/calendars/${id}`)).body;
    check('suggestion applies over an attendance change', ap.status === 200, `status=${ap.status}`);
    check('suggested event added', after.data.events.some((e) => e.id === 'e1'));
    check('attendance kept', statuses(after).k2 === 'absent', JSON.stringify(statuses(after)));
}

// Another teacher "taking the lock" (old tab) no longer blocks applying a suggestion.
{
    const { A, B, S, id } = await setup();
    const doc = (await A('GET', `/api/calendars/${id}`)).body;
    const sug = await S('POST', `/api/calendars/${id}/suggestions`, { revision: doc.revision, data: doc.data, summary: 'x' });
    await B('POST', `/api/calendars/${id}/lock`, {});
    const ap = await A('POST', `/api/calendars/${id}/suggestions/${sug.body.id}/apply`, {});
    check('apply not blocked by a lock', ap.status === 200, `status=${ap.status}`);
}

// Live-sync field patches from two teachers on the same class: both fields kept.
{
    const { A, B, id } = await setup();
    const rev = (await A('GET', `/api/calendars/${id}`)).body.revision;
    const ra = await A('PATCH', `/api/calendars/${id}`, {
        baseRevision: rev,
        mutations: [{ entity: 'classes', action: 'patch', payload: { id: 'c1', set: { room: '201' } } }]
    });
    const rb = await B('PATCH', `/api/calendars/${id}`, {
        baseRevision: rev,
        mutations: [{ entity: 'classes', action: 'patch', payload: { id: 'c1', set: { period: 4 } } }]
    });
    const c1 = (await A('GET', `/api/calendars/${id}`)).body.data.classes.find((c) => c.id === 'c1');
    check('field patches accepted', ra.status === 200 && rb.status === 200, `A=${ra.status} B=${rb.status}`);
    check('both fields kept', c1.room === '201' && c1.period === 4, JSON.stringify(c1));
    check('different fields not reported', rb.body.overwritten.length === 0, JSON.stringify(rb.body.overwritten));
}

// Marks stay on the server: clients never receive them, and a full save keeps them.
{
    const { env, A, id } = await setup();
    const rev = (await A('GET', `/api/calendars/${id}`)).body.revision;
    await A('PATCH', `/api/calendars/${id}`, { baseRevision: rev, mutations: mark('k1', 'late') });
    const cur = (await A('GET', `/api/calendars/${id}`)).body;
    check('clients do not receive marks', !('_syncRevs' in cur.data));
    await A('POST', `/api/calendars/${id}/lock`, {});
    const put = await A('PUT', `/api/calendars/${id}`, { revision: cur.revision, data: cur.data });
    const stored = JSON.parse(env.DB.raw.prepare('SELECT data FROM calendars WHERE id = ?').get(id).data);
    check('full save keeps stored marks', put.status === 200 && stored._syncRevs && stored._syncRevs.keys['attendanceSessions:s1@k1'] === rev + 1, `status=${put.status}`);
}

if (failures) {
    console.error(`worker-concurrency: ${failures} failure(s)`);
    process.exit(1);
}
console.log('worker-concurrency.test.mjs: all passed');
