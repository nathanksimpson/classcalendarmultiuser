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

// Soft out-of-block + 2x same weekday detection helper
assert(api.isOutOfBlock('junior', 7) === true, 'junior P7 is out of block');
assert(api.isOutOfBlock('junior', 2) === false, 'junior P2 is in block');
assert(api.hasDuplicateWeekday([{ dow: 1, period: 2 }, { dow: 1, period: 3 }]) === true, 'same day 2x detected');
assert(api.hasDuplicateWeekday([{ dow: 1, period: 2 }, { dow: 3, period: 2 }]) === false, 'distinct days ok');

// Permissive placement: duplicate weekday / off-cohort are soft warnings, not hard fails
appData.plannerState.lockToCohortDays = true;
const draft2 = {
    id: 'draft-test-2',
    assignments: [],
    issues: [],
    metrics: {}
};
const p1 = api.placePeriodOnTeacher(appData, draft2, mwf.demandId, 'tp-k1', 1, 2);
assert(p1.ok, `first place should work: ${p1.reason || ''}`);
const p2same = api.placePeriodOnTeacher(appData, draft2, mwf.demandId, 'tp-k1', 1, 3);
assert(p2same.ok, '2x same weekday is allowed (soft)');
assert((p2same.softReasons || []).includes('duplicate_weekday_2x'), 'duplicate_weekday_2x soft reason');
const draft2b = { id: 'draft-test-2b', assignments: [], issues: [], metrics: {} };
const p2ok = api.placePeriodOnTeacher(appData, draft2b, mwf.demandId, 'tp-k1', 1, 2);
assert(p2ok.ok, `place Mon: ${p2ok.reason || ''}`);
const p3ok = api.placePeriodOnTeacher(appData, draft2b, mwf.demandId, 'tp-k1', 3, 2);
assert(p3ok.ok, `second place on different day should work: ${p3ok.reason || ''}`);

const offDay = api.placePeriodOnTeacher(appData, {
    id: 'd3',
    assignments: [],
    issues: [],
    metrics: {}
}, mwf.demandId, 'tp-k1', 2, 2);
assert(offDay.ok, 'lock ON still allows off-cohort day (soft warn)');
assert((offDay.softReasons || []).includes('outside_cohort_days'), 'outside_cohort_days soft reason when lock on');

appData.plannerState.lockToCohortDays = false;
const offDaySoft = api.placePeriodOnTeacher(appData, {
    id: 'd4',
    assignments: [],
    issues: [],
    metrics: {}
}, mwf.demandId, 'tp-k1', 2, 2);
assert(offDaySoft.ok, 'lock OFF allows off-cohort day');
assert((offDaySoft.softReasons || []).includes('outside_cohort_days'), 'outside_cohort_days soft when lock off');

// Seed from calendar using classTeachers + meetings
const seedClass = appData.classes.find((c) => c.id === 'debate-mwf');
seedClass.classTeachers = [{ userId: 'k1', name: 'Korean 1', meetingDays: [1, 3], periodByWeekday: { 1: 2, 3: 2 } }];
seedClass.roomId = 'room-a';
const seeded = api.seedDraftFromCalendar(appData, { label: 'seed-test' });
assert(seeded.assignments.length >= 1, 'seed creates assignments');
const seededDebate = seeded.assignments.find((a) => a.classId === 'debate-mwf');
assert(seededDebate, 'seeded debate assignment');
assert(seededDebate.teacherProfileId === 'tp-k1', 'seed matches classTeachers teacher');
assert(seededDebate.source === 'imported', 'seed source imported');
assert(seededDebate.manualKeep === true, 'seed manualKeep');
assert((seededDebate.meetings || []).length >= 1, 'seed has meetings');
assert(seededDebate.roomId === 'room-a', 'seed room from class');

// Move assigned period to empty cell (other teacher)
const moveDraft = {
    id: 'draft-move',
    assignments: [{
        assignmentId: 'asg-move',
        demandId: mwf.demandId,
        classId: 'debate-mwf',
        teacherProfileId: 'tp-k1',
        userId: 'k1',
        roomId: null,
        meetings: [{ meetingId: 'm1', dow: 1, period: '2' }],
        manualKeep: false,
        source: 'generated'
    }],
    issues: [],
    metrics: {}
};
const moved = api.movePeriod(appData, moveDraft, 'asg-move', 1, 2, 'tp-k2', 3, 4);
assert(moved.ok, `movePeriod should succeed: ${moved.reason || ''}`);
const movedAsg = moveDraft.assignments[0];
assert(movedAsg.teacherProfileId === 'tp-k2', 'move reassigns teacher');
assert(movedAsg.meetings.length === 1 && Number(movedAsg.meetings[0].dow) === 3, 'meeting moved to Wed');
assert(String(movedAsg.meetings[0].period) === '4', 'meeting moved to P4');

// Swap two occupied cells across teachers
const rc = demands.find((d) => d.classId === 'rc-tth');
const swapDraft = {
    id: 'draft-swap',
    assignments: [
        {
            assignmentId: 'asg-a',
            demandId: mwf.demandId,
            classId: 'debate-mwf',
            teacherProfileId: 'tp-k1',
            userId: 'k1',
            meetings: [{ meetingId: 'ma', dow: 1, period: '2' }],
            source: 'manual'
        },
        {
            assignmentId: 'asg-b',
            demandId: rc.demandId,
            classId: 'rc-tth',
            teacherProfileId: 'tp-k2',
            userId: 'k2',
            meetings: [{ meetingId: 'mb', dow: 2, period: '3' }],
            source: 'manual'
        }
    ],
    issues: [],
    metrics: {}
};
const swapped = api.swapPeriodCells(appData, swapDraft, 'asg-a', 'asg-b', 2, 3, 1, 2);
assert(swapped.ok, `swap should succeed: ${(swapped.reasons || []).join(',')}`);
const a = swapDraft.assignments.find((x) => x.assignmentId === 'asg-a');
const b = swapDraft.assignments.find((x) => x.assignmentId === 'asg-b');
assert(a.teacherProfileId === 'tp-k2', 'dragged takes target teacher');
assert(b.teacherProfileId === 'tp-k1', 'target takes dragged teacher');
assert(Number(a.meetings[0].dow) === 2 && String(a.meetings[0].period) === '3', 'a at Tue P3');
assert(Number(b.meetings[0].dow) === 1 && String(b.meetings[0].period) === '2', 'b at Mon P2');

// Full swap from sidebar semantics (teachers + all meetings)
const fullDraft = {
    id: 'draft-full-swap',
    assignments: [
        {
            assignmentId: 'asg-fa',
            demandId: mwf.demandId,
            classId: 'debate-mwf',
            teacherProfileId: 'tp-k1',
            userId: 'k1',
            meetings: [
                { meetingId: 'fa1', dow: 1, period: '2' },
                { meetingId: 'fa2', dow: 3, period: '2' }
            ],
            source: 'imported'
        },
        {
            assignmentId: 'asg-fb',
            demandId: rc.demandId,
            classId: 'rc-tth',
            teacherProfileId: 'tp-k2',
            userId: 'k2',
            meetings: [
                { meetingId: 'fb1', dow: 2, period: '3' },
                { meetingId: 'fb2', dow: 4, period: '3' }
            ],
            source: 'imported'
        }
    ],
    issues: [],
    metrics: {}
};
const fullSwap = api.swapAssignmentsFull(appData, fullDraft, 'asg-fa', 'asg-fb');
assert(fullSwap.ok, 'full swap ok');
const fa = fullDraft.assignments.find((x) => x.assignmentId === 'asg-fa');
const fb = fullDraft.assignments.find((x) => x.assignmentId === 'asg-fb');
assert(fa.teacherProfileId === 'tp-k2' && fb.teacherProfileId === 'tp-k1', 'full swap teachers');
assert(fa.meetings.length === 2 && Number(fa.meetings[0].dow) === 2, 'fa took fb meetings');
assert(fb.meetings.length === 2 && Number(fb.meetings[0].dow) === 1, 'fb took fa meetings');

// Soft issues after wrong-role place
const softDraft = { id: 'draft-soft', assignments: [], issues: [], metrics: {} };
const wrongRole = api.placePeriodOnTeacher(appData, softDraft, mwf.demandId, 'tp-n1', 1, 2);
assert(wrongRole.ok, 'wrong role still places');
assert((wrongRole.softReasons || []).includes('wrong_teacher_type'), 'wrong_teacher_type soft');
api.recomputeDraftMetrics(appData, softDraft);
assert(
    (softDraft.issues || []).some((i) => i.code === 'wrong_teacher_type' || (i.message || '').includes('wrong_teacher')),
    'metrics emit soft wrong_teacher issue'
);

// Default lock is OFF
const freshState = api.defaultPlannerState();
assert(freshState.lockToCohortDays === false, 'lockToCohortDays defaults OFF');

// Level-name band resolver (printed timetable groups)
assert(api.resolvePlannerBandFromText('Orange') === 'junior', 'Orange → junior');
assert(api.resolvePlannerBandFromText('Navy') === 'junior', 'Navy → junior');
assert(api.resolvePlannerBandFromText('Purple') === 'junior', 'Purple → junior');
assert(api.resolvePlannerBandFromText('샘물') === 'senior', '샘물 → senior');
assert(api.resolvePlannerBandFromText('여울') === 'senior', '여울 → senior');
assert(api.resolvePlannerBandFromText('Garam') === 'senior', 'Garam → senior');
assert(api.resolvePlannerBandFromText('별마루') === 'senior', '별마루 → senior');
assert(api.resolvePlannerBandFromText('유마') === null, '유마 unrecognized → null (middle default)');
assert(api.resolvePlannerBandForCohort({ name: '유마', scheduleBlock: 'primary' }) === 'middle', '유마 → middle');
assert(api.resolvePlannerBandForCohort({ levelPreset: 'Garam', scheduleBlock: 'primary' }) === 'senior', 'level beats primary block');
assert(
    api.bandFromScheduleBlock('primary', { levelPreset: 'Orange', name: 'Orange Debate' }, []) === 'junior',
    'class level Orange → junior even if primary block'
);
assert(api.levelSortIndex('junior', { name: 'Orange' }) < api.levelSortIndex('junior', { name: 'Navy' }), 'Orange before Navy');
assert(api.levelSortIndex('senior', { name: '샘물' }) < api.levelSortIndex('senior', { name: '가람' }), 'Saemmul before Garam');

console.log('teacher-planner-core tests passed');
