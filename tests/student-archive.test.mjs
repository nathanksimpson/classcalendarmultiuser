/**
 * Run: node tests/student-archive.test.mjs
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
        students: [{ id: 's1', name: 'Kim', sortOrder: 0, active: true }]
    }
];

let archived = d.archiveStudent(cohorts, 's1', 'c1', {
    archiveReason: 'break',
    archivedAt: '2026-01-01T12:00:00.000Z'
});
assert(!archived.error, 'archive succeeds');
const archiveCohort = d.findArchiveCohort(archived.cohorts);
assert(archiveCohort, 'archive cohort created');
assert(d.isArchiveCohort(archiveCohort), 'archive cohort flagged');
assert(
    !archived.cohorts.find((c) => c.id === 'c1').students.some((s) => s.id === 's1'),
    'student removed from source cohort'
);
const archivedStudent = d.normalizeCohortStudents(archiveCohort).find((s) => s.id === 's1');
assert(archivedStudent, 'student in archive');
assert(archivedStudent.active === false, 'archived student inactive');
assert(archivedStudent.archiveReason === 'break', 'archive reason stored');

const withC2 = [
    {
        id: 'c2',
        name: '4T',
        students: [{ id: 's2', name: 'Lee', sortOrder: 0, active: true }]
    },
    ...archived.cohorts
];
const startingSoon = d.archiveStudent(withC2, 's2', 'c2', {
    archiveReason: 'starting_soon',
    expectedStartDate: '2026-09-01'
});
assert(!startingSoon.error, 'starting_soon archive succeeds');
const s2 = d.normalizeCohortStudents(d.findArchiveCohort(startingSoon.cohorts)).find((s) => s.id === 's2');
assert(s2.expectedStartDate === '2026-09-01', 'expected start date stored');
assert(s2.tags.includes('starting_soon'), 'starting_soon tag applied');

const restored = d.restoreStudentFromArchive(startingSoon.cohorts, 's2', 'c1');
assert(!restored.error, 'restore succeeds');
assert(
    d.normalizeCohortStudents(restored.cohorts.find((c) => c.id === 'c1')).some((s) => s.id === 's2'),
    'student in target cohort'
);
assert(
    !d.normalizeCohortStudents(d.findArchiveCohort(restored.cohorts)).some((s) => s.id === 's2'),
    'student removed from archive'
);
const restoredS2 = d.normalizeCohortStudents(restored.cohorts.find((c) => c.id === 'c1')).find(
    (s) => s.id === 's2'
);
assert(restoredS2.active === true, 'restored student active');
assert(!restoredS2.archivedAt, 'archivedAt cleared');

assert(
    d.isPastArchiveRetention(
        { archivedAt: '2026-01-01T00:00:00.000Z' },
        90,
        '2026-06-01'
    ),
    'past retention when ref date exceeds cutoff'
);
assert(
    !d.isPastArchiveRetention(
        { archivedAt: '2026-05-01T00:00:00.000Z' },
        90,
        '2026-06-01'
    ),
    'not past retention within window'
);

const pastList = d.listStudentsPastRetention(
    d.findArchiveCohort(restored.cohorts),
    90,
    '2026-06-01'
);
assert(pastList.some((s) => s.id === 's1'), 'listStudentsPastRetention finds s1');

const deleted = d.deleteStudentPermanently(restored.cohorts, 's1', d.ARCHIVE_COHORT_ID);
assert(!deleted.error, 'delete from archive succeeds');
assert(
    !d.normalizeCohortStudents(d.findArchiveCohort(deleted.cohorts)).some((s) => s.id === 's1'),
    'student removed from archive cohort'
);

const dataWithRecords = {
    cohorts: deleted.cohorts,
    attendanceSessions: [
        {
            id: 'att1',
            classId: 'cls1',
            date: '2026-06-09',
            records: [
                { studentId: 's1', status: 'present' },
                { studentId: 's3', status: 'absent' }
            ]
        }
    ],
    homeworkCompletions: [
        {
            id: 'hw1',
            records: [
                { studentId: 's1', grade: 'A' },
                { studentId: 's3', grade: 'B' }
            ]
        }
    ]
};
const purged = d.purgeStudentRecords(dataWithRecords, 's1');
assert(purged.attendanceSessions[0].records.length === 1, 'attendance record purged');
assert(purged.attendanceSessions[0].records[0].studentId === 's3', 'other attendance kept');
assert(purged.homeworkCompletions[0].records.length === 1, 'homework record purged');

const migrated = { cohorts: [{ id: 'x', name: 'X' }] };
assert(d.migrateClassroomData(migrated) === true, 'migrate creates archive cohort');
assert(d.findArchiveCohort(migrated.cohorts), 'archive cohort on migrate');
assert(Number.isFinite(migrated.ui.studentArchiveRetentionDays), 'retention days default');

console.log('student-archive.test.mjs: all passed');
