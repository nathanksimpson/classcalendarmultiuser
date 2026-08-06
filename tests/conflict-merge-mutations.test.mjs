import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadScripts() {
    const sandbox = { window: {}, globalThis: {} };
    sandbox.globalThis = sandbox.window;
    vm.runInNewContext(
        readFileSync(path.join(root, 'js', 'calendar-mutations.js'), 'utf8'),
        sandbox
    );
    vm.runInNewContext(readFileSync(path.join(root, 'js', 'conflict-merge.js'), 'utf8'), sandbox);
    return {
        CCPConflictMerge: sandbox.window.CCPConflictMerge,
        CCPCalendarMutations: sandbox.window.CCPCalendarMutations
    };
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const { CCPConflictMerge } = loadScripts();

{
    const server = {
        classes: [{ id: 'c1', name: 'Server' }],
        events: [],
        dayNotes: []
    };
    const mutations = [
        {
            entity: 'classes',
            action: 'upsert',
            payload: { class: { id: 'c2', name: 'Local only' } }
        }
    ];
    assert(!CCPConflictMerge.mutationsOverlap(mutations, server), 'different class ids no overlap');

    const overlapMutations = [
        {
            entity: 'classes',
            action: 'upsert',
            payload: { class: { id: 'c1', name: 'Local edit' } }
        }
    ];
    assert(CCPConflictMerge.mutationsOverlap(overlapMutations, server), 'same class id overlap');
}

{
    const server = {
        attendanceSessions: [
            {
                id: 'att1',
                records: [
                    { studentId: 's1', status: 'present' },
                    { studentId: 's2', status: 'present' }
                ]
            }
        ]
    };
    const differentStudent = [
        {
            entity: 'attendanceSessions',
            action: 'upsert',
            payload: {
                session: {
                    id: 'att1',
                    records: [
                        { studentId: 's1', status: 'present' },
                        { studentId: 's2', status: 'absent' }
                    ],
                    touchedStudentIds: ['s2']
                }
            }
        }
    ];
    assert(
        CCPConflictMerge.mutationsOverlap(differentStudent, server),
        'touched student status change overlaps'
    );

    const otherStudentOnly = [
        {
            entity: 'attendanceSessions',
            action: 'upsert',
            payload: {
                session: {
                    id: 'att1',
                    records: [
                        { studentId: 's1', status: 'present' },
                        { studentId: 's2', status: 'absent' }
                    ],
                    touchedStudentIds: ['s3']
                }
            }
        }
    ];
    assert(
        !CCPConflictMerge.mutationsOverlap(otherStudentOnly, server),
        'touched student not on server records no overlap'
    );

    const newSession = [
        {
            entity: 'attendanceSessions',
            action: 'upsert',
            payload: {
                session: {
                    id: 'att2',
                    records: [{ studentId: 's1', status: 'late' }]
                }
            }
        }
    ];
    assert(!CCPConflictMerge.mutationsOverlap(newSession, server), 'different session id no overlap');

    const pointsIndependent = [
        {
            entity: 'studentPoints',
            action: 'upsert',
            payload: { entry: { id: 'p2', delta: 3 } }
        }
    ];
    assert(
        !CCPConflictMerge.mutationsOverlap(pointsIndependent, {
            studentPoints: [{ id: 'p1', delta: 1 }]
        }),
        'different points ids no overlap'
    );
}

{
    const lines = CCPConflictMerge.summarizeConflict(
        {
            attendanceSessions: [{ id: 'a1', records: [] }],
            studentPoints: [{ id: 'p1', delta: 2 }]
        },
        {
            attendanceSessions: [],
            studentPoints: [{ id: 'p1', delta: 1 }]
        }
    );
    assert(
        lines.some((l) => l.labelKey === 'syncConflictAttendance'),
        'summary includes attendance'
    );
    assert(lines.some((l) => l.labelKey === 'syncConflictPoints'), 'summary includes points');
}

console.log('conflict-merge-mutations.test.mjs: all passed');
