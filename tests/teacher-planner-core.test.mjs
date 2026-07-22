/**
 * Run: node tests/teacher-planner-core.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'teacher-timetable.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'planner', 'teacher-planner-core.js')).href);

const api = globalThis.CCPTeacherPlanner;

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

const appData = {
    cohorts: [
        { id: 'c-mwf', name: '3M', meetingDays: [1, 3, 5], schedulePattern: 'mwf', scheduleBlock: 'primary' },
        { id: 'c-tth', name: '3T', meetingDays: [2, 4], schedulePattern: 'tth', scheduleBlock: 'secondary' }
    ],
    classes: [
        {
            id: 'debate-mwf',
            name: 'Debate MWF',
            classTypeId: 'builtin-debate',
            curriculumId: 'debate',
            cohortIds: ['c-mwf'],
            meetingDays: [1, 3],
            period: 2,
            scheduleBlock: 'primary',
            weeklyFrequency: 2,
            teacherRequirementType: 'korean'
        },
        {
            id: 'rc-tth',
            name: 'RC T/T',
            classTypeId: 'builtin-rc',
            curriculumId: 'rc',
            cohortIds: ['c-tth'],
            meetingDays: [2, 4],
            period: 3,
            scheduleBlock: 'secondary',
            weeklyFrequency: 2,
            teacherRequirementType: 'either'
        },
        {
            id: 'conv-1x',
            name: 'Conversation Fri',
            classTypeId: 'builtin-conversation',
            cohortIds: ['c-mwf', 'c-tth'],
            meetingDays: [5],
            period: 4,
            scheduleBlock: 'primary',
            weeklyFrequency: 1,
            teacherRequirementType: 'native'
        }
    ],
    teacherProfiles: [],
    rooms: [],
    plannerDrafts: [],
    plannerState: null,
    timetableTimeSlots: globalThis.CCPTeacherTimetable.getDefaultTimetableTimeSlots(),
    periodSlotMap: globalThis.CCPTeacherTimetable.getDefaultPeriodSlotMap()
};

api.ensurePlannerFields(appData);
appData.teacherProfiles = [
    api.defaultTeacherProfile({
        id: 'tp-k1',
        userId: 'k1',
        name: 'Korean 1',
        role: 'korean',
        limits: { maxPeriodsPerWeek: 20, maxPeriodsPerDay: 5, minPeriodsPerWeek: 0, juniorAllowed: true, seniorAllowed: true },
        preferences: { preferCadence: ['mwf'], preferredCurricula: ['debate'] }
    }),
    api.defaultTeacherProfile({
        id: 'tp-k2',
        userId: 'k2',
        name: 'Korean 2',
        role: 'korean',
        limits: { maxPeriodsPerWeek: 20, maxPeriodsPerDay: 5, juniorAllowed: true, seniorAllowed: true }
    }),
    api.defaultTeacherProfile({
        id: 'tp-n1',
        userId: 'n1',
        name: 'Native 1',
        role: 'native',
        limits: { maxPeriodsPerWeek: 12, maxPeriodsPerDay: 4, juniorAllowed: true, seniorAllowed: false }
    })
];
appData.rooms = [
    api.defaultRoom({ id: 'room-a', name: 'Room A' }),
    api.defaultRoom({ id: 'room-b', name: 'Room B' })
];

const demands = api.buildDemandsFromAppData(appData);
assert(demands.length === 3, 'expected 3 demands');
const combined = demands.find((d) => d.classId === 'conv-1x');
assert(combined.cohortIds.length === 2, 'combined cohort demand');
assert(combined.meetings.length === 1, '1x meeting');
const mwf = demands.find((d) => d.classId === 'debate-mwf');
assert(mwf.meetings.length === 2, '2x linked meetings');
assert(mwf.linkGroupId === 'demand:debate-mwf', 'link group id');

// Block-out prevents placement on Korean 1 Fri P4 for native class — native required anyway
api.setTeacherBlockoutSlot(appData.teacherProfiles[0], 1, 2, true);
const hard = api.hardRejectReasons(
    appData.teacherProfiles[0],
    mwf,
    [],
    appData.plannerState.blockouts
);
assert(hard.includes('teacher_slot_blocked'), `expected teacher_slot_blocked, got ${hard.join(',')}`);

// Clear block so draft can place
api.setTeacherBlockoutSlot(appData.teacherProfiles[0], 1, 2, false);

const draft = api.generateDraft(appData, { label: 'test' });
assert(draft.assignments.length >= 2, `expected assignments, got ${draft.assignments.length}`);
const nativeAsg = draft.assignments.find((a) => a.classId === 'conv-1x');
assert(nativeAsg, 'native-required class assigned');
assert(nativeAsg.teacherProfileId === 'tp-n1', 'native class goes to native teacher');

const debateAsg = draft.assignments.find((a) => a.classId === 'debate-mwf');
assert(debateAsg && debateAsg.meetings.length === 2, 'debate keeps linked meetings');

const move = api.moveAssignmentBundle(
    draft,
    debateAsg.assignmentId,
    'tp-k2',
    appData.teacherProfiles,
    demands,
    appData.plannerState.blockouts
);
assert(move.ok, `move should succeed: ${move.reason || ''}`);
assert(
    draft.assignments.find((a) => a.classId === 'debate-mwf').teacherProfileId === 'tp-k2',
    'linked bundle moved together'
);
assert(
    draft.assignments.find((a) => a.classId === 'debate-mwf').manualKeep === true,
    'manual keep after move'
);

const withRooms = draft.assignments.filter((a) => a.roomId);
assert(withRooms.length >= 1, 'soft room recommendation should assign some rooms');
const roomMove = api.moveAssignmentRoom(draft, debateAsg.assignmentId, 'room-b');
assert(roomMove.ok, `room move should succeed: ${roomMove.reason || ''}`);
assert(draft.assignments.find((a) => a.classId === 'debate-mwf').roomId === 'room-b', 'linked room move');

const applied = api.applyDraftToAppData(appData, draft);
assert(applied.applied.length >= 1, 'apply should write assignments');
const debateClass = appData.classes.find((c) => c.id === 'debate-mwf');
assert(Array.isArray(debateClass.classTeachers) && debateClass.classTeachers.length >= 1, 'classTeachers written');
assert(debateClass.classTeachers.some((r) => r.userId === 'k2'), 'moved teacher written back');
assert(Array.isArray(debateClass.meetingDays) && debateClass.meetingDays.length >= 1, 'top-level meetingDays write-through');
assert(debateClass.periodByWeekday && typeof debateClass.periodByWeekday === 'object', 'top-level periodByWeekday write-through');

// Soft out-of-block + hard 2x distinct days
assert(api.isOutOfBlock('junior', 7) === true, 'junior P7 is out of block');
assert(api.isOutOfBlock('junior', 2) === false, 'junior P2 is in block');
assert(api.hasDuplicateWeekday([{ dow: 1, period: 2 }, { dow: 1, period: 3 }]) === true, 'same day 2x detected');
assert(api.hasDuplicateWeekday([{ dow: 1, period: 2 }, { dow: 3, period: 2 }]) === false, 'distinct days ok');

appData.plannerState.lockToCohortDays = true;
const placeSameDay = api.placePeriodOnTeacher(appData, draft, mwf.demandId, 'tp-k1', 1, 3);
// may fail for other reasons if debate already assigned — build fresh draft for placement tests
const draft2 = {
    id: 'draft-test-2',
    assignments: [],
    issues: [],
    metrics: {}
};
const p1 = api.placePeriodOnTeacher(appData, draft2, mwf.demandId, 'tp-k1', 1, 2);
assert(p1.ok, `first place should work: ${p1.reason || ''}`);
const p2same = api.placePeriodOnTeacher(appData, draft2, mwf.demandId, 'tp-k1', 1, 3);
assert(!p2same.ok, '2x same weekday must be rejected');
assert((p2same.reasons || []).includes('duplicate_weekday_2x') || p2same.reason === 'duplicate_weekday_2x', 'duplicate_weekday_2x reason');
const p2ok = api.placePeriodOnTeacher(appData, draft2, mwf.demandId, 'tp-k1', 3, 2);
assert(p2ok.ok, `second place on different day should work: ${p2ok.reason || ''}`);

const offDay = api.placePeriodOnTeacher(appData, {
    id: 'd3',
    assignments: [],
    issues: [],
    metrics: {}
}, mwf.demandId, 'tp-k1', 2, 2);
assert(!offDay.ok, 'lock to cohort days should reject Tue for MWF cohort');

appData.plannerState.lockToCohortDays = false;
const offDaySoft = api.placePeriodOnTeacher(appData, {
    id: 'd4',
    assignments: [],
    issues: [],
    metrics: {}
}, mwf.demandId, 'tp-k1', 2, 2);
assert(offDaySoft.ok, 'lock OFF allows off-cohort day');

console.log('teacher-planner-core tests passed');
