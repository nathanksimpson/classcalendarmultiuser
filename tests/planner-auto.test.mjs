/**
 * Run: node tests/planner-auto.test.mjs
 */
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['timetable-periods.js', 'teacher-timetable.js', 'planner/teacher-planner-core.js', 'planner/teacher-planner-auto.js']) {
    await import(pathToFileURL(path.join(root, 'js', f)).href);
}
const api = globalThis.CCPTeacherPlanner;
const auto = globalThis.CCPPlannerAuto;

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

const st = (n) => ({ id: `x${n}`, name: `학생${n}`, tmsMpidx: String(1000 + n) });

// Last term: Orange (students 1-6) had Kim for Debate and Lee for RC.
const prev = {
    cohorts: [{ id: 'p-orange', name: 'Orange M', meetingDays: [1, 3, 5], level: 'Orange', students: [1, 2, 3, 4, 5, 6].map(st) }],
    classes: [
        { id: 'p1', name: 'Orange Debate', cohortIds: ['p-orange'], classTypeId: 'builtin-debate', meetingDays: [1, 3], period: 2, classTeachers: [{ name: 'Kim' }] },
        { id: 'p2', name: 'Orange RC', cohortIds: ['p-orange'], classTypeId: 'builtin-rc', meetingDays: [1, 3], period: 1, classTeachers: [{ name: 'Lee' }] }
    ]
};
// This term they levelled up to Yellow (5 of the 6 stayed, new ids), plus a new Green cohort.
const data = {
    cohorts: [
        { id: 'yellow', name: 'Yellow M', meetingDays: [1, 3, 5], level: 'Yellow', students: [1, 2, 3, 4, 5, 9].map((n) => Object.assign(st(n), { id: `new${n}` })) },
        { id: 'green', name: 'Green M', meetingDays: [1, 3, 5], level: 'Green', students: [20, 21, 22].map(st) }
    ],
    classes: [
        { id: 'c1', name: 'Yellow Debate', cohortIds: ['yellow'], classTypeId: 'builtin-debate', weeklyFrequency: 2 },
        { id: 'c2', name: 'Yellow RC', cohortIds: ['yellow'], classTypeId: 'builtin-rc', weeklyFrequency: 2 },
        { id: 'c3', name: 'Green Debate', cohortIds: ['green'], classTypeId: 'builtin-debate', weeklyFrequency: 2 },
        { id: 'c4', name: 'Speaking (Yellow + Green)', cohortIds: ['yellow', 'green'], classTypeId: 'builtin-conversation', weeklyFrequency: 1, teacherRequirementType: 'native' },
        { id: 'c5', name: 'Green RC', cohortIds: ['green'], classTypeId: 'builtin-rc', weeklyFrequency: 2 }
    ],
    teacherProfiles: [
        { id: 'kim', name: 'Kim' },
        { id: 'lee', name: 'Lee' },
        { id: 'james', name: 'James', role: 'native', limits: { ownTypeOnly: true } },
        { id: 'mid', name: 'Middle only', limits: { juniorAllowed: false, seniorAllowed: false } }
    ],
    rooms: []
};
api.ensurePlannerFields(data);

const analysis = auto.analysePreviousTerm(data, prev);
assert(analysis.students === 9 && analysis.matched === 5, `matched ${analysis.matched}/${analysis.students}`);
const debate = analysis.byDemand.get('demand:c1');
assert(debate.total === 6 && debate.teachers[0].teacherProfileId === 'kim' && debate.teachers[0].count === 5, 'Kim taught 5 of 6');
assert(debate.teachers[0].sameSubject === true, 'same subject');

const draft = { id: 'd', assignments: [], issues: [], metrics: {} };
const res = auto.autoSchedule(data, draft, { analysis, priority: 'continuity' });
const asg = (id) => draft.assignments.find((a) => a.classId === id);
assert(res.unplaced.length === 0, `unplaced: ${JSON.stringify(res.unplaced)}`);
assert(asg('c1').teacherProfileId === 'kim', 'Debate stays with Kim');
assert(asg('c2').teacherProfileId === 'lee', 'RC stays with Lee');
assert(asg('c1').auto.count === 5 && asg('c1').auto.total === 6, 'reason recorded');
assert(asg('c4').teacherProfileId === 'james', 'native class goes to the native teacher');
// The native-only and middle-only teachers take nothing else.
assert(draft.assignments.filter((a) => a.teacherProfileId === 'james').length === 1, 'native-only teacher');
assert(!draft.assignments.some((a) => a.teacherProfileId === 'mid'), 'middle-only teacher gets no junior class');
// Every class has all its periods; nothing clashes.
data.classes.forEach((c) => assert(asg(c.id).meetings.length === c.weeklyFrequency, `${c.name} complete`));
const clashCodes = ['teacher_double_booked', 'cohort_double_booked'];
assert(!draft.issues.some((i) => clashCodes.includes(i.code)), 'no clashes');
// Shared class: its one time is free for both cohorts.
const shared = asg('c4').meetings[0];
['c1', 'c2', 'c3', 'c5'].forEach((id) => assert(
    !asg(id).meetings.some((m) => m.dow === shared.dow && m.period === shared.period), 'shared class time is free'));
// Students are at school 14:30-17:00 (junior): nothing outside it.
assert(!draft.issues.some((i) => i.code === 'outside_band_block' || i.code === 'outside_cohort_days'), 'inside student hours');

// Never moves what is already placed.
const draft2 = { id: 'd2', assignments: [], issues: [], metrics: {} };
api.placePeriod(data, draft2, 'demand:c1', { dow: 5, period: '3', teacherProfileId: 'lee' });
auto.autoSchedule(data, draft2, { analysis });
const kept = draft2.assignments.find((a) => a.classId === 'c1');
assert(kept.teacherProfileId === 'lee' && kept.meetings.some((m) => m.dow === 5 && m.period === '3'), 'hand-placed period kept');
assert(kept.meetings.length === 2, 'and completed');

// At most 4 in a row.
const busy = {
    cohorts: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: id, meetingDays: [1], level: 'Bada' })),
    classes: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id: `k${id}`, name: `K ${id}`, cohortIds: [id], weeklyFrequency: 1 })),
    teacherProfiles: [{ id: 't', name: 'T', limits: { maxPeriodsPerDay: 8 } }, { id: 'u', name: 'U', limits: { maxPeriodsPerDay: 8 } }]
};
api.ensurePlannerFields(busy);
const draft3 = { id: 'd3', assignments: [], issues: [], metrics: {} };
auto.autoSchedule(busy, draft3, {});
['t', 'u'].forEach((tid) => {
    const ps = draft3.assignments.filter((a) => a.teacherProfileId === tid).flatMap((a) => a.meetings.map((m) => m.period));
    assert(api.longestRun(ps) <= 4, `run for ${tid}: ${ps}`);
});
assert(!draft3.issues.some((i) => i.code === 'long_run'), 'no long-run warning');
// By hand it is allowed, and warned.
const draft4 = { id: 'd4', assignments: [], issues: [], metrics: {} };
['a', 'b', 'c', 'd', 'e'].forEach((id, i) => api.placePeriod(busy, draft4, `demand:k${id}`, { dow: 1, period: String(4 + i), teacherProfileId: 't' }));
assert(draft4.issues.some((i) => i.code === 'long_run' && i.count === 5), '5 in a row warns');

// Alternatives.
const options = auto.buildOptions(data, { id: 'o', assignments: [], issues: [], metrics: {} }, analysis);
assert(options.length >= 1 && options.length <= 3, 'options');
assert(options[0].id === 'continuity' && options[0].stats.keptShare === 1, `kept share ${options[0].stats.keptShare}`);
options.forEach((o) => assert(o.stats.ready === 5 && o.stats.longestRun <= 4, `${o.id} complete`));

console.log('planner-auto tests passed');

/* Fixing clashes: the most recently moved or locked class stays, the others move around it. */
{
    const d = {
        termStart: '2099-01-01',
        cohorts: [{ id: 'y', name: 'Yellow', meetingDays: [1, 3, 5], level: 'Yellow' }, { id: 'g', name: 'Green', meetingDays: [1, 3, 5], level: 'Green' }],
        classes: [
            { id: 'a', name: 'A', cohortIds: ['y'], weeklyFrequency: 1 },
            { id: 'b', name: 'B', cohortIds: ['g'], weeklyFrequency: 1 },
            { id: 'c', name: 'C', cohortIds: ['g'], weeklyFrequency: 1 }
        ],
        teacherProfiles: [{ id: 'kim', name: 'Kim' }, { id: 'lee', name: 'Lee' }]
    };
    api.ensurePlannerFields(d);
    const fresh = () => {
        const dr = { id: 'r', assignments: [], issues: [], metrics: {} };
        api.placePeriod(d, dr, 'demand:a', { dow: 1, period: '1', teacherProfileId: 'kim' });
        api.placePeriod(d, dr, 'demand:b', { dow: 1, period: '2', teacherProfileId: 'kim' });
        dr.assignments.forEach((a, i) => a.meetings.forEach((m) => { m.movedAt = 1000 + i; }));
        return dr;
    };
    const at = (dr, id) => dr.assignments.find((a) => a.classId === id);
    // A clash cannot be made by hand any more, but one can arrive from the calendar: B lands on A's time.
    const clash = (dr) => {
        assert(!api.movePeriodTo(d, dr, at(dr, 'b').assignmentId, { dow: 1, period: '2' }, { dow: 1, period: '1' }).ok, 'double-booking refused by hand');
        Object.assign(at(dr, 'b').meetings[0], { dow: 1, period: '1', movedAt: Date.now() });
        api.recomputeDraftMetrics(d, dr);
    };
    // B is dragged onto A's time: B (moved last) stays, A moves, Kim keeps both.
    let dr = fresh();
    clash(dr);
    assert(dr.issues.some((i) => i.code === 'teacher_double_booked'), 'clash made');
    let r = auto.resolveClashes(d, dr, {});
    assert(r.moved.length === 1 && r.moved[0].demandId === 'demand:a', 'A moved');
    assert(at(dr, 'b').meetings[0].period === '1' && at(dr, 'b').meetings[0].dow === 1, 'B stayed');
    assert(at(dr, 'a').teacherProfileId === 'kim', 'same teacher kept');
    assert(!dr.issues.some((i) => i.code === 'teacher_double_booked'), 'clash gone');
    // Locked beats recently moved.
    dr = fresh();
    at(dr, 'a').locked = true;
    clash(dr);
    r = auto.resolveClashes(d, dr, {});
    assert(r.moved[0].demandId === 'demand:b' && at(dr, 'a').meetings[0].period === '1', 'locked class stays');
    // Kim has no other free time: a teacher change is needed, and only happens when allowed.
    const kim = d.teacherProfiles.find((t) => t.id === 'kim');
    kim.availability.unavailableSlots = [1, 2, 3, 4, 5].flatMap((dow) => ['1', '2', '3', '4', '5', '6', '7', '8'].map((period) => ({ dow, period })))
        .filter((s) => !(s.dow === 1 && s.period === '1'));
    dr = fresh();
    clash(dr);
    r = auto.resolveClashes(d, dr, { allowTeacherChange: false });
    assert(r.needTeacherChange.includes('demand:a') && at(dr, 'a').teacherProfileId === 'kim', 'asks before changing teacher');
    assert(at(dr, 'a').meetings.length === 1, 'class put back');
    r = auto.resolveClashes(d, dr, { allowTeacherChange: true });
    assert(r.teacherChanged.length === 1 && at(dr, 'a').teacherProfileId === 'lee', 'teacher changed when allowed');
    assert(!dr.issues.some((i) => i.code === 'teacher_double_booked'), 'clash gone after change');
    assert(auto.termHasStarted({ termStart: '2026-09-01' }, new Date(2026, 10, 14)) === true, 'term started');
    assert(auto.termHasStarted(d, new Date(2026, 10, 14)) === false, 'term not started');
    console.log('clash fixing tests passed');
}

/* Repair step: a completely full cohort still gets every period, and rooms fit the class. */
{
    const kids = (n, p) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, name: `${p}${i}` }));
    const d = {
        cohorts: [
            { id: 'o', name: 'Orange', meetingDays: [1, 3, 5], level: 'Orange', students: kids(12, 'o') },
            { id: 'g', name: 'Green', meetingDays: [1, 3, 5], level: 'Green', students: kids(6, 'g') }
        ],
        // Junior hours are 3 periods a day x 3 days = 9 slots; each cohort needs all 9.
        classes: [].concat(...['o', 'g'].map((c) => [
            { id: `${c}1`, name: `${c} Debate`, cohortIds: [c], weeklyFrequency: 2 },
            { id: `${c}2`, name: `${c} RC`, cohortIds: [c], weeklyFrequency: 2 },
            { id: `${c}3`, name: `${c} Grammar`, cohortIds: [c], weeklyFrequency: 2 },
            { id: `${c}4`, name: `${c} Speaking`, cohortIds: [c], weeklyFrequency: 3, teacherRequirementType: 'native' }
        ])),
        teacherProfiles: [
            { id: 'k1', name: 'K1' }, { id: 'k2', name: 'K2' }, { id: 'k3', name: 'K3' },
            { id: 'n1', name: 'N1', role: 'native', limits: { ownTypeOnly: true } }
        ],
        rooms: [{ id: 'small', name: 'Small', capacity: 8, sortOrder: 1 }, { id: 'big', name: 'Big', capacity: 16, sortOrder: 2 }]
    };
    api.ensurePlannerFields(d);
    auto.buildOptions(d, { id: 'f', assignments: [], issues: [], metrics: {} }, undefined).forEach((o) => {
        assert(o.result.unplaced.length === 0, `${o.id}: full timetable placed (${JSON.stringify(o.result.unplaced)})`);
        assert(o.stats.ready === 8 && o.stats.clashes === 0, `${o.id}: all ready, no clashes`);
        assert(!o.draft.issues.some((i) => i.code === 'room_too_small'), `${o.id}: rooms fit`);
        assert(!o.draft.issues.some((i) => i.code === 'long_run' || i.code === 'outside_band_block'), `${o.id}: rules kept`);
    });
    // A room that is too small is refused by hand too; so is a room already in use.
    const dr = { id: 'h', assignments: [], issues: [], metrics: {} };
    let rr = api.placePeriod(d, dr, 'demand:o1', { dow: 1, period: '1', roomId: 'small' });
    assert(!rr.ok && rr.reason === 'room_too_small', 'small room refused');
    assert(api.placePeriod(d, dr, 'demand:o1', { dow: 1, period: '1', roomId: 'big' }).ok, 'big room fine');
    rr = api.placePeriod(d, dr, 'demand:g1', { dow: 1, period: '1', roomId: 'big' });
    assert(!rr.ok && rr.reason === 'room_double_booked', 'room double-booking refused');
    // Moving a class onto a time when its room is taken: the move is fine, the room is given up.
    assert(api.placePeriod(d, dr, 'demand:g1', { dow: 1, period: '2', roomId: 'big' }).ok, 'g1 in big at P2');
    const g1 = dr.assignments.find((a) => a.classId === 'g1');
    assert(api.movePeriodTo(d, dr, g1.assignmentId, { dow: 1, period: '2' }, { dow: 1, period: '1', teacherProfileId: 'k1' }).ok, 'move allowed');
    assert(!api.meetingRoomId(g1, g1.meetings[0]), 'room given up');
    assert(!dr.issues.some((i) => i.code === 'room_conflict'), 'no room clash');
    // A teacher cannot be given a class at a time they already teach.
    const o1 = dr.assignments.find((a) => a.classId === 'o1');
    assert(!api.setClassTeacher(d, dr, 'demand:o1', 'k1').ok && !o1.teacherProfileId, 'busy teacher refused');
    console.log('repair and room tests passed');
}

/* Cohort time blocks: the planner's copy is used at once; the cohort only changes after writeCohortBlocks. */
{
    const d = {
        cohorts: [{ id: 'y', name: 'Yellow', meetingDays: [1, 3, 5], schedulePattern: 'mwf', level: 'Yellow' }],
        classes: [{ id: 'a', name: 'A', cohortIds: ['y'], weeklyFrequency: 2 }],
        teacherProfiles: [{ id: 'kim', name: 'Kim' }]
    };
    api.ensurePlannerFields(d);
    const demand = () => api.buildDemandsFromAppData(d)[0];
    assert(api.cohortBlock(d, d.cohorts[0]).days.join() === '1,3,5' && !api.cohortBlock(d, d.cohorts[0]).staged, 'block from cohort');
    assert(api.outsideStudentHours(d, demand(), 5) === true, 'P5 is outside junior hours by default');
    // Planner: Tue/Thu 17:00-19:00.
    api.stageCohortBlock(d, 'y', { days: [2, 4], start: '17:00', end: '19:00' });
    assert(api.pendingCohortBlocks(d).length === 1, 'one pending');
    assert(d.cohorts[0].meetingDays.join() === '1,3,5' && !d.cohorts[0].blockStart, 'cohort not touched yet');
    assert(api.cohortMeetingDays(d, demand()).join() === '2,4', 'planner uses new days');
    assert(api.outsideStudentHours(d, demand(), 5) === false && api.outsideStudentHours(d, demand(), 1) === true, 'planner uses new hours');
    const dr = { id: 'c', assignments: [], issues: [], metrics: {} };
    auto.autoSchedule(d, dr, {});
    const ms = dr.assignments[0].meetings;
    assert(ms.length === 2 && ms.every((m) => [2, 4].includes(m.dow) && ['4', '5'].includes(m.period)), `auto follows the block: ${JSON.stringify(ms)}`);
    // Staging the saved values again clears the pending change.
    api.stageCohortBlock(d, 'y', { days: [1, 3, 5], start: '', end: '' });
    assert(api.pendingCohortBlocks(d).length === 0, 'no pending when equal');
    // After confirmation it is written to the cohort.
    api.stageCohortBlock(d, 'y', { days: [2, 4], start: '17:00', end: '19:00' });
    assert(api.writeCohortBlocks(d) === 1, 'written');
    const c = d.cohorts[0];
    assert(c.meetingDays.join() === '2,4' && c.schedulePattern === 'tth' && c.blockStart === '17:00' && c.blockEnd === '19:00', 'cohort updated');
    assert(api.pendingCohortBlocks(d).length === 0 && !api.cohortBlock(d, c).staged, 'nothing pending after write');
    console.log('cohort block tests passed');
}

/* Schedule block defaults by level, and how the planner reads them. */
{
    await import(pathToFileURL(path.join(root, 'js', 'level-profile.js')).href);
    const lp = globalThis.CCPLevelProfile;
    ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Navy'].forEach((id) => assert(lp.defaultScheduleBlockForLevel(id) === 'primary', `${id} primary`));
    ['Purple', 'Yeoul', 'Saemmul', 'Garam', 'Bada', 'Byeolmaru', 'Mirinae', '유마', 'Pre 유마', '캉첸'].forEach((id) =>
        assert(lp.defaultScheduleBlockForLevel(id) === 'secondary', `${id} secondary`));
    assert(lp.schedulingGroupForLevel('Purple') === 'junior' && lp.schedulingGroupForLevel('Garam') === 'senior', 'groups');
    assert(lp.schedulingGroupForLevel('Pre 유마') === 'middle' && lp.schedulingGroupForLevel('유마') === 'middle', 'pre-middle counts as middle');
    const d = {
        cohorts: [
            { id: 'p1', name: 'Purple M', levelPreset: 'Purple', scheduleBlock: 'primary', meetingDays: [1, 3, 5] },
            { id: 'p2', name: 'Purple T', levelPreset: 'Purple', scheduleBlock: 'secondary', meetingDays: [2, 4] },
            { id: 'pm', name: 'Pre 유마', levelPreset: 'Pre 유마', scheduleBlock: 'secondary', meetingDays: [2, 4] }
        ],
        classes: [
            { id: 'a', name: 'A', cohortIds: ['p1'], weeklyFrequency: 1 },
            { id: 'b', name: 'B', cohortIds: ['p2'], weeklyFrequency: 1 },
            { id: 'c', name: 'C', cohortIds: ['pm'], weeklyFrequency: 1 }
        ],
        teacherProfiles: [{ id: 'k', name: 'K' }, { id: 'jr', name: 'Junior only', limits: { middleAllowed: false, seniorAllowed: false } }]
    };
    api.ensurePlannerFields(d);
    const dm = (id) => api.buildDemandsFromAppData(d).find((x) => x.classId === id);
    assert(api.resolvePlannerBandForCohort(d.cohorts[2]) === 'middle' && dm('c').band === 'middle', 'pre-middle is middle band');
    assert(dm('a').band === 'junior' && dm('b').band === 'junior', 'purple stays junior level for teacher limits');
    // Hours: existing Purple on primary keeps the early periods; Purple and pre-middle on secondary use the later ones.
    assert(!api.outsideStudentHours(d, dm('a'), 2) && api.outsideStudentHours(d, dm('a'), 5), 'primary purple: early periods');
    assert(api.outsideStudentHours(d, dm('b'), 2) && !api.outsideStudentHours(d, dm('b'), 5), 'secondary purple: later periods');
    assert(api.outsideStudentHours(d, dm('c'), 2) && !api.outsideStudentHours(d, dm('c'), 5), 'pre-middle on secondary: later periods');
    assert(api.teacherLimitReason(api.defaultTeacherProfile(d.teacherProfiles[1]), dm('c')) === 'wrong_junior_senior_band', 'junior-only teacher not given pre-middle');
    console.log('schedule block tests passed');
}
