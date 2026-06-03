/**
 * Run: node tests/cohort-setup-warnings.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

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
            id: 'empty-a',
            name: '3M Reading',
            cohortIds: ['cohort-1'],
            cohortId: 'cohort-1',
            meetingDays: [1, 3, 5],
            period: 3
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
        },
        {
            id: 'debate-b',
            name: '3T Debate',
            classTypeId: 'builtin-debate',
            cohortIds: ['cohort-2'],
            cohortId: 'cohort-2',
            meetingDays: [1, 3, 5],
            period: 4,
            classTeachers: [{ userId: 't2', name: 'Teacher Two', category: 'Debate' }]
        }
    ],
    timetableTimeSlots: slots,
    periodSlotMap: slotMap
};

const cohort1 = appData.cohorts[0];
const warnings = api.collectCohortSetupWarnings(cohort1, appData);

assert(
    warnings.some((w) => w.code === 'class_no_teacher' && w.classId === 'empty-a'),
    'class without teacher warns'
);
assert(
    warnings.some((w) => w.code === 'teacher_double_book' && w.severity === 'error'),
    'same teacher same period in cohort is error'
);
assert(
    warnings.some((w) => w.code === 'period_collision'),
    'two classes same period slot warn'
);
assert(
    warnings.some((w) => w.code === 'duplicate_combined' && w.params.otherCohort === '3T'),
    'duplicate combine pair touches cohort-1'
);
assert(
    warnings.some((w) => w.code === 'no_homeroom'),
    'missing homeroom warns'
);

console.log('cohort-setup-warnings.test.mjs: all passed');
