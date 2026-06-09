/**
 * Run: node tests/classroom-domain.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'classroom-domain.js')).href);

const d = globalThis.CCPClassroomDomain;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const cohorts = [
    {
        id: 'c1',
        name: '3M',
        students: [
            { id: 's1', name: 'Kim', sortOrder: 0, active: true },
            { id: 's2', name: 'Lee', sortOrder: 1, active: true }
        ]
    },
    {
        id: 'c2',
        name: '3T',
        students: [{ id: 's2', name: 'Lee (T)', sortOrder: 0, active: true }]
    }
];

const classSingle = { id: 'cls1', cohortIds: ['c1'] };
const classCombined = { id: 'cls2', cohortIds: ['c1', 'c2'] };

const singleStudents = d.resolveStudentsForClass(classSingle, cohorts);
assert(singleStudents.length === 2, 'single cohort resolves 2 students');
assert(singleStudents[0].student.name === 'Kim', 'sorted by sortOrder');

const combined = d.resolveStudentsForClass(classCombined, cohorts);
assert(combined.length === 2, 'combined cohorts dedupe by student id');
assert(combined.some((e) => e.student.id === 's1'), 's1 from c1');
assert(combined.some((e) => e.student.id === 's2'), 's2 once');

let sessions = [];
const session = {
    id: 'att1',
    classId: 'cls1',
    date: '2026-06-09',
    records: [{ studentId: 's1', status: 'present', sessionNote: '' }]
};
sessions = d.upsertAttendanceSession(sessions, session);
sessions = d.upsertAttendanceSession(sessions, {
    ...session,
    records: [{ studentId: 's1', status: 'absent', sessionNote: 'sick' }]
});
assert(sessions.length === 1, 'upsert attendance replaces same class+date');
assert(sessions[0].records[0].status === 'absent', 'attendance record updated');

const migrated = { cohorts: [{ id: 'x', name: 'X' }] };
assert(d.migrateClassroomData(migrated) === true, 'migrate adds arrays');
assert(Array.isArray(migrated.attendanceSessions), 'attendanceSessions init');
assert(Array.isArray(migrated.cohorts[0].students), 'cohort students init');

console.log('classroom-domain.test.mjs: all passed');
