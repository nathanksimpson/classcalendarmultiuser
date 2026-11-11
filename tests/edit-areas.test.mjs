/**
 * Admin edit limits (edit areas) against the real Worker code.
 * Run: node tests/edit-areas.test.mjs   (needs better-sqlite3, like worker-concurrency)
 */
import { createRequire } from 'module';
import { makeEnv, loadWorker, addUser, grant, client } from './support/worker-rig.mjs';

const require = createRequire(import.meta.url);
const Auth = require('../shared/auth-permissions.cjs');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

// Role defaults: teachers edit everything except curriculum; head teachers everything.
{
    const teacher = { role: 'teacher', permissions: null };
    const head = { role: 'head_teacher', permissions: null };
    assert(!Auth.hasEditArea(teacher, 'edit_curriculum'), 'teacher: no curriculum by default');
    for (const a of ['edit_classes', 'edit_events', 'edit_planner']) {
        assert(Auth.hasEditArea(teacher, a), 'teacher default ' + a);
    }
    for (const a of Auth.EDIT_AREA_PERMS) {
        assert(Auth.hasEditArea(head, a), 'head teacher ' + a);
    }
    // A custom list saved before edit areas existed keeps the role's areas (nobody locked out).
    const legacy = { role: 'teacher', permissions: JSON.stringify(['view_calendars']) };
    assert(Auth.hasEditArea(legacy, 'edit_classes'), 'legacy list keeps class editing');
    // A list saved from the new admin form means exactly what was ticked.
    const saved = Auth.resolvePermissionsForSave('teacher', ['view_calendars', 'edit_events']);
    const custom = { role: 'teacher', permissions: JSON.stringify(saved) };
    assert(Auth.hasEditArea(custom, 'edit_events') && !Auth.hasEditArea(custom, 'edit_classes'),
        'new custom list is exact: ' + JSON.stringify(saved));
    assert(!Auth.getEffectivePermissions(custom).includes(Auth.EDIT_AREAS_MARKER), 'marker never exposed');
}

const worker = await loadWorker();
const env = makeEnv();
const A = client(worker, env, addUser(env, 'ua', 'Teacher Alpha', 'admin'));
const T = client(worker, env, addUser(env, 'ut', 'Teacher Tau', 'teacher'));
const created = await A('POST', '/api/calendars', {
    name: 'Areas Term',
    data: { classes: [{ id: 'c1', name: 'Class One', classTeachers: [{ userId: 'ut', name: 'T' }] }], curriculumOverrides: {} }
});
const id = created.body.id;
grant(env, id, 'ut', 'editor');

// Teacher: curriculum change dropped (and named), class change in the same save applied.
{
    const rev = (await T('GET', `/api/calendars/${id}`)).body.revision;
    const r = await T('PATCH', `/api/calendars/${id}`, {
        baseRevision: rev,
        mutations: [
            { entity: 'curriculumOverrides', action: 'mapSet', payload: { key: 'book1', value: { sessions: [] } } },
            { entity: 'classes', action: 'patch', payload: { id: 'c1', set: { room: '301' } } }
        ]
    });
    const doc = (await A('GET', `/api/calendars/${id}`)).body;
    assert(r.status === 200, 'teacher save accepted: ' + r.status);
    assert(Array.isArray(r.body.denied) && r.body.denied.includes('curriculumOverrides'), 'denied listed');
    assert(!doc.data.curriculumOverrides.book1, 'curriculum not changed');
    assert(doc.data.classes[0].room === '301', 'class change applied');
}

// Teacher: a save with only blocked changes writes nothing.
{
    const before = (await A('GET', `/api/calendars/${id}`)).body.revision;
    const r = await T('PATCH', `/api/calendars/${id}`, {
        baseRevision: before,
        mutations: [{ entity: 'customSyllabusTemplates', action: 'set', payload: { item: { id: 't1', name: 'X' } } }]
    });
    const after = (await A('GET', `/api/calendars/${id}`)).body.revision;
    assert(r.status === 200 && r.body.denied.includes('customSyllabusTemplates'), 'blocked-only save answered');
    assert(after === before, 'no new revision for a fully blocked save');
}

// Admin: curriculum change applied.
{
    const rev = (await A('GET', `/api/calendars/${id}`)).body.revision;
    const r = await A('PATCH', `/api/calendars/${id}`, {
        baseRevision: rev,
        mutations: [{ entity: 'curriculumOverrides', action: 'mapSet', payload: { key: 'book1', value: { sessions: [1] } } }]
    });
    assert(r.status === 200 && r.body.denied.length === 0, 'admin not denied');
}

// Teacher: whole-calendar save (import) that changes curriculum is refused.
{
    const cur = (await T('GET', `/api/calendars/${id}`)).body;
    const r = await T('PUT', `/api/calendars/${id}`, {
        revision: cur.revision,
        data: Object.assign({}, cur.data, { curriculumOverrides: {} })
    });
    assert(r.status === 403 && r.body.denied.includes('curriculumOverrides'), 'import touching curriculum refused: ' + r.status);
}

console.log('edit-areas.test.mjs: all passed');
