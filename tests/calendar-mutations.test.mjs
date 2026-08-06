import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const mutations = require(path.join(root, 'shared', 'calendar-mutations.cjs'));

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const base = {
    schemaVersion: 3,
    classes: [{ id: 'c1', name: 'Alpha' }],
    events: [{ id: 'e1', name: 'Holiday' }],
    dayNotes: [{ id: 'n1', classId: 'c1', date: '2026-06-01', text: 'Hi' }],
    attendanceSessions: [
        {
            id: 'att1',
            classId: 'c1',
            date: '2026-06-01',
            records: [
                { studentId: 's1', status: 'present' },
                { studentId: 's2', status: 'present' }
            ]
        }
    ],
    studentPoints: [{ id: 'p1', studentId: 's1', delta: 1 }]
};

{
    const next = mutations.applyCalendarMutations(base, [
        {
            entity: 'classes',
            action: 'upsert',
            payload: { class: { id: 'c1', name: 'Alpha Updated' } }
        }
    ]);
    assert(next.classes.length === 1, 'classes upsert count');
    assert(next.classes[0].name === 'Alpha Updated', 'classes upsert merge');

    const added = mutations.applyCalendarMutations(base, [
        {
            entity: 'classes',
            action: 'upsert',
            payload: { class: { id: 'c2', name: 'Beta' } }
        }
    ]);
    assert(added.classes.length === 2, 'classes add');

    const removed = mutations.applyCalendarMutations(base, [
        { entity: 'classes', action: 'remove', payload: { classId: 'c1' } }
    ]);
    assert(removed.classes.length === 0, 'classes remove');

    const ev = mutations.applyCalendarMutations(base, [
        { entity: 'events', action: 'upsert', payload: { event: { id: 'e2', name: 'Break' } } }
    ]);
    assert(ev.events.length === 2, 'events upsert');

    const noteUpsert = mutations.applyCalendarMutations(base, [
        {
            entity: 'dayNotes',
            action: 'mutate',
            payload: { op: 'upsert', note: { id: 'n1', classId: 'c1', date: '2026-06-01', text: 'Updated' } }
        }
    ]);
    assert(noteUpsert.dayNotes[0].text === 'Updated', 'dayNotes upsert op');

    const noteRemove = mutations.applyCalendarMutations(base, [
        { entity: 'dayNotes', action: 'mutate', payload: { op: 'remove', noteId: 'n1' } }
    ]);
    assert(noteRemove.dayNotes.length === 0, 'dayNotes remove op');

    const bad = mutations.validateMutations([]);
    assert(!bad.ok, 'empty mutations invalid');

    const good = mutations.validateMutations([
        { entity: 'classes', action: 'upsert', payload: { class: { id: 'x' } } }
    ]);
    assert(good.ok, 'valid mutations');
}

{
    const merged = mutations.mergeSessionRecords(
        [{ studentId: 's1', status: 'absent' }, { studentId: 's3', status: 'late' }],
        [
            { studentId: 's1', status: 'present' },
            { studentId: 's2', status: 'present' }
        ]
    );
    const byId = Object.fromEntries(merged.map((r) => [r.studentId, r.status]));
    assert(byId.s1 === 'absent', 'local wins for s1');
    assert(byId.s2 === 'present', 'server kept for s2');
    assert(byId.s3 === 'late', 'local-only student added');

    const touchedOnly = mutations.mergeSessionRecords(
        [
            { studentId: 's1', status: 'absent' },
            { studentId: 's2', status: 'early_leave' }
        ],
        [
            { studentId: 's1', status: 'present' },
            { studentId: 's2', status: 'present' }
        ],
        'studentId',
        ['s1']
    );
    const touchedMap = Object.fromEntries(touchedOnly.map((r) => [r.studentId, r.status]));
    assert(touchedMap.s1 === 'absent', 'touched s1 overlaid');
    assert(touchedMap.s2 === 'present', 'untouched s2 kept from server');
}

{
    const next = mutations.applyCalendarMutations(base, [
        {
            entity: 'attendanceSessions',
            action: 'upsert',
            payload: {
                session: {
                    id: 'att1',
                    classId: 'c1',
                    date: '2026-06-01',
                    records: [{ studentId: 's1', status: 'absent' }],
                    touchedStudentIds: ['s1']
                }
            }
        }
    ]);
    const session = next.attendanceSessions[0];
    const byId = Object.fromEntries(session.records.map((r) => [r.studentId, r.status]));
    assert(byId.s1 === 'absent', 'attendance upsert merges touched student');
    assert(byId.s2 === 'present', 'attendance upsert keeps other student');
}

{
    const next = mutations.applyCalendarMutations(base, [
        {
            entity: 'studentPoints',
            action: 'upsert',
            payload: { entry: { id: 'p1', studentId: 's1', delta: 5 } }
        },
        {
            entity: 'studentPoints',
            action: 'upsert',
            payload: { entry: { id: 'p2', studentId: 's2', delta: 2 } }
        }
    ]);
    assert(next.studentPoints.length === 2, 'points upsert add');
    assert(next.studentPoints.find((p) => p.id === 'p1').delta === 5, 'points upsert merge');
}

{
    const classif = mutations.classifyMutations([
        { entity: 'classes', action: 'upsert', payload: { class: { id: 'c1' } } },
        { entity: 'attendanceSessions', action: 'upsert', payload: { session: { id: 'a1' } } },
        { entity: 'dayNotes', action: 'mutate', payload: { op: 'upsert', note: { id: 'n1' } } }
    ]);
    assert(classif.schedule === true, 'classify schedule');
    assert(classif.classroom === true, 'classify classroom');
    assert(classif.dayNotes === true, 'classify dayNotes');

    const classOnly = mutations.classifyMutations([
        { entity: 'essaySubmissions', action: 'upsert', payload: { submission: { id: 'e1' } } }
    ]);
    assert(classOnly.schedule === false, 'classroom-only no schedule');
    assert(classOnly.classroom === true, 'classroom-only classroom');
}

{
    const muts = mutations.classroomFieldsToMutations({
        attendanceSessions: [{ id: 'att1', classId: 'c1', records: [] }],
        studentPoints: [{ id: 'p1', delta: 1 }]
    });
    assert(muts.length === 2, 'fields to mutations count');
    assert(muts[0].entity === 'attendanceSessions', 'fields to mutations entity');
}

console.log('calendar-mutations.test.mjs: all passed');
