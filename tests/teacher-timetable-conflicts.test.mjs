/**
 * Run: node tests/teacher-timetable-conflicts.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'schedule-matrix-data.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'syllabus-schedule-matrix.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'teacher-timetable.js')).href);

const api = globalThis.CCPTeacherTimetable;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const slots = api.getDefaultTimetableTimeSlots();
const slotMap = api.getDefaultPeriodSlotMap();

const appData = {
    cohorts: [
        {
            id: 'cohort-1',
            name: '3M',
            meetingDays: [1, 3, 5],
            schedulePattern: 'mwf',
            classIds: []
        },
        {
            id: 'cohort-2',
            name: '3T',
            meetingDays: [2, 4],
            schedulePattern: 'tth',
            classIds: []
        }
    ],
    classes: [
        {
            id: 'math-a',
            name: '3M Math',
            cohortIds: ['cohort-1'],
            cohortId: 'cohort-1',
            meetingDays: [1, 3, 5],
            period: 2,
            classTeachers: [{ userId: 't1', name: 'Teacher One' }]
        },
        {
            id: 'sci-a',
            name: '3M Science',
            cohortIds: ['cohort-1'],
            cohortId: 'cohort-1',
            meetingDays: [1, 3, 5],
            period: 2,
            classTeachers: [{ userId: 't1', name: 'Teacher One' }]
        },
        {
            id: 'debate-a',
            name: '3M Debate',
            classTypeId: 'builtin-debate',
            cohortIds: ['cohort-1'],
            cohortId: 'cohort-1',
            meetingDays: [1, 3, 5],
            period: 4,
            classTeachers: [{ userId: 't2', name: 'Teacher Two', category: 'Debate' }]
        }
    ],
    timetableTimeSlots: slots,
    periodSlotMap: slotMap
};

appData.cohorts[0].classIds = ['math-a', 'sci-a', 'debate-a'];

const selector = { userId: 't1', displayName: 'Teacher One' };
const conflicts = api.collectTeacherTimetableConflicts(appData, selector, { lang: 'en' });

assert(conflicts.hasConflicts, 'Teacher One should have conflicts');
assert(conflicts.teacherDoubleBook.length === 3, 'double-book on Mon/Wed/Fri');
assert(
    conflicts.teacherDoubleBook.every((c) => c.period === 2),
    'all double-book conflicts are period 2'
);
assert(
    conflicts.teacherDoubleBook.every((c) =>
        c.classNames.includes('3M Math') && c.classNames.includes('3M Science')
    ),
    'double-book lists both class names'
);
assert(
    conflicts.cohortPeriodCollisions.length === 3,
    'cohort period collision on Mon/Wed/Fri'
);
assert(
    conflicts.cohortPeriodCollisions.some((c) => c.cohortName === '3M'),
    'cohort collision names cohort'
);

const grid = api.buildTeacherWeeklyGrid(appData, selector, { lang: 'en' });
assert(grid.conflicts && grid.conflicts.hasConflicts, 'grid includes conflicts');
const conflictCell = grid.blocks[0].rows.find((r) => r.timeSlotId === slotMap['2'])
    .cells.find((c) => c.dow === 1);
assert(conflictCell.conflict, 'grid cell marked conflict');
assert(conflictCell.cohortCollision === false, 'double-book cell does not also get cohort flag');

const cleanSelector = { userId: 't2', displayName: 'Teacher Two' };
const cleanConflicts = api.collectTeacherTimetableConflicts(appData, cleanSelector, { lang: 'en' });
assert(!cleanConflicts.hasConflicts, 'Teacher Two has no conflicts');
assert(cleanConflicts.teacherDoubleBook.length === 0, 'no double-book for Teacher Two');
assert(cleanConflicts.cohortPeriodCollisions.length === 0, 'no cohort collision for Teacher Two');

assert(api.getPeriodNumberForTimeSlot(slotMap['2'], appData) === 2, 'period reverse lookup');

console.log('teacher-timetable-conflicts.test.mjs: all passed');
