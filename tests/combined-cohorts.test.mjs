/**
 * Run: node tests/combined-cohorts.test.mjs
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

const appData = {
    cohorts: [
        { id: 'cohort-a', name: '3M', classIds: [] },
        { id: 'cohort-b', name: '3T', classIds: [] }
    ],
    classes: [
        {
            id: 'debate-a',
            name: '3M · Debate',
            classTypeId: 'builtin-debate',
            cohortIds: ['cohort-a'],
            cohortId: 'cohort-a',
            meetingDays: [1, 3, 5],
            period: 2,
            classTeachers: [{ userId: 't1', name: 'Teacher One', category: 'Debate' }]
        },
        {
            id: 'debate-b',
            name: '3T · Debate',
            classTypeId: 'builtin-debate',
            cohortIds: ['cohort-b'],
            cohortId: 'cohort-b',
            meetingDays: [1, 3, 5],
            period: 2,
            classTeachers: [{ userId: 't1', name: 'Teacher One', category: 'Debate' }]
        }
    ],
    timetableTimeSlots: api.getDefaultTimetableTimeSlots(),
    periodSlotMap: api.getDefaultPeriodSlotMap()
};

const pairs = api.findDuplicateClassPairsForCohorts(appData, 'cohort-a', 'cohort-b');
assert(pairs.length === 1, 'findDuplicateClassPairsForCohorts finds debate pair');
assert(pairs[0].classA.id === 'debate-a', 'pair classA');

api.combineCohortClassPair(appData, 'debate-a', 'debate-b', 'cohort-a', 'cohort-b', {});
appData.classes = appData.classes.filter((c) => c.id !== 'debate-b');
api.syncClassPrimaryCohortId(appData.classes[0]);
appData.cohorts.forEach((cohort) => {
    cohort.classIds = api.getCohortClassIds(appData, cohort);
});

assert(api.classHasCohortId(appData.classes[0], 'cohort-a'), 'keeper linked to cohort A');
assert(api.classHasCohortId(appData.classes[0], 'cohort-b'), 'keeper linked to cohort B');
assert(api.getCohortClassIds(appData, appData.cohorts[0])[0] === 'debate-a', 'cohort A classIds');
assert(api.getCohortClassIds(appData, appData.cohorts[1])[0] === 'debate-a', 'cohort B classIds');

const grid = api.buildTeacherWeeklyGrid(appData, { userId: 't1', displayName: 'Teacher One' }, { lang: 'en' });
assert(!grid.hasConflicts, 'combined single class should not conflict');
const entry = grid.blocks[0].rows.find((r) => r.cells.some((c) => c.entries.length)).cells
    .find((c) => c.entries.length)?.entries[0];
assert(entry && entry.combinedCohorts, 'timetable entry shows combined cohort label');

console.log('combined-cohorts.test.mjs: all passed');
