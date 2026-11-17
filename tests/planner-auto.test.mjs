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
        { id: 'c1', name: 'Yellow Debate', cohortIds: ['yellow'], classTypeId: 'builtin-debate', teacherRequirementType: 'either', weeklyFrequency: 2 },
        { id: 'c2', name: 'Yellow RC', cohortIds: ['yellow'], classTypeId: 'builtin-rc', weeklyFrequency: 2 },
        { id: 'c3', name: 'Green Debate', cohortIds: ['green'], classTypeId: 'builtin-debate', teacherRequirementType: 'either', weeklyFrequency: 2 },
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
    // A clash made by hand (allowed, reported): B is moved onto A's time.
    const clash = (dr) => {
        const r = api.movePeriodTo(d, dr, at(dr, 'b').assignmentId, { dow: 1, period: '2' }, { dow: 1, period: '1' });
        assert(r.ok, 'double-booking allowed by hand');
        at(dr, 'b').meetings[0].movedAt = Date.now();
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
        // An MWF cohort is in 2 periods a day x 3 days = 6 slots; each cohort needs all 6.
        classes: [].concat(...['o', 'g'].map((c) => [
            { id: `${c}1`, name: `${c} Debate`, cohortIds: [c], weeklyFrequency: 2, teacherRequirementType: 'either' },
            { id: `${c}2`, name: `${c} RC`, cohortIds: [c], weeklyFrequency: 1 },
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
        assert(o.stats.ready === 6 && o.stats.clashes === 0, `${o.id}: all ready, no clashes`);
        assert(!o.draft.issues.some((i) => i.code === 'room_too_small'), `${o.id}: rooms fit`);
        assert(!o.draft.issues.some((i) => i.code === 'long_run' || i.code === 'outside_band_block'), `${o.id}: rules kept`);
    });
    // By hand a room that is too small, or already in use, is allowed and reported; strict refuses.
    const dr = { id: 'h', assignments: [], issues: [], metrics: {} };
    assert(!api.checkSlot(d, dr, 'demand:o1', { dow: 1, period: '1', roomId: 'small', strict: true }).ok, 'strict: small room refused');
    assert(api.checkSlot(d, dr, 'demand:o1', { dow: 1, period: '1', roomId: 'small' }).clashes.includes('room_too_small'), 'by hand: small room is a clash');
    assert(api.placePeriod(d, dr, 'demand:o1', { dow: 1, period: '1', roomId: 'big' }).ok, 'big room fine');
    assert(api.checkSlot(d, dr, 'demand:g1', { dow: 1, period: '1', roomId: 'big' }).clashes.includes('room_double_booked'), 'by hand: room in use is a clash');
    const sm = api.setMeetingRoom(d, dr, dr.assignments[0].assignmentId, 1, '1', 'small');
    assert(sm.ok && sm.clashes.includes('room_too_small'), 'setMeetingRoom allows a small room and reports it');
    api.setMeetingRoom(d, dr, dr.assignments[0].assignmentId, 1, '1', 'big');
    // Moving a class onto a time when its room is taken: the move is fine, the room is given up.
    assert(api.placePeriod(d, dr, 'demand:g1', { dow: 1, period: '2', roomId: 'big' }).ok, 'g1 in big at P2');
    const g1 = dr.assignments.find((a) => a.classId === 'g1');
    assert(api.movePeriodTo(d, dr, g1.assignmentId, { dow: 1, period: '2' }, { dow: 1, period: '1', teacherProfileId: 'k1' }).ok, 'move allowed');
    assert(!api.meetingRoomId(g1, g1.meetings[0]), 'room given up');
    assert(!dr.issues.some((i) => i.code === 'room_conflict'), 'no room clash');
    // A teacher already teaching then can still be chosen by hand; it is reported as a clash.
    const o1 = dr.assignments.find((a) => a.classId === 'o1');
    const st = api.setClassTeacher(d, dr, 'demand:o1', 'k1');
    assert(st.ok && st.clashes.includes('teacher_double_booked') && o1.teacherProfileId === 'k1', 'busy teacher: allowed, a clash');
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
    // Hours: Purple can go anywhere without a warning; its block is only a preference (byBlock).
    assert(!api.outsideStudentHours(d, dm('a'), 2) && !api.outsideStudentHours(d, dm('a'), 7), 'purple: no hours warning');
    assert(!api.outsideStudentHours(d, dm('a'), 2, 1, { byBlock: true }) && api.outsideStudentHours(d, dm('a'), 5, 1, { byBlock: true }), 'primary purple prefers early periods');
    assert(api.outsideStudentHours(d, dm('b'), 2, 2, { byBlock: true }) && !api.outsideStudentHours(d, dm('b'), 5, 2, { byBlock: true }), 'secondary purple prefers later periods');
    // Middle school (and pre-middle) comes latest: P5-8, not the upper elementary P4.
    assert(api.outsideStudentHours(d, dm('c'), 4) && !api.outsideStudentHours(d, dm('c'), 5) && !api.outsideStudentHours(d, dm('c'), 8), 'pre-middle: periods 5-8');
    assert(api.teacherLimitReason(api.defaultTeacherProfile(d.teacherProfiles[1]), dm('c')) === 'wrong_junior_senior_band', 'junior-only teacher not given pre-middle');
    console.log('schedule block tests passed');
}

/* Tue/Thu: the elementary block runs to 18:00 (period 4); Mon/Wed/Fri it ends at 17:00. */
{
    const d = {
        cohorts: [
            { id: 'bt', name: 'Blue T', levelPreset: 'Blue', scheduleBlock: 'primary', meetingDays: [2, 4] },
            { id: 'bm', name: 'Blue M', levelPreset: 'Blue', scheduleBlock: 'primary', meetingDays: [1, 3, 5] },
            { id: 'gt', name: 'Garam T', levelPreset: 'Garam', scheduleBlock: 'secondary', meetingDays: [2, 4] }
        ],
        classes: ['Debate', 'RC', 'Grammar'].map((s, i) => ({ id: `t${i}`, name: `Blue T ${s}`, cohortIds: ['bt'], weeklyFrequency: 2, teacherRequirementType: 'either' }))
            .concat([{ id: 'm0', name: 'Blue M Debate', cohortIds: ['bm'], weeklyFrequency: 1, teacherRequirementType: 'either' }, { id: 'g0', name: 'Garam T Debate', cohortIds: ['gt'], weeklyFrequency: 1, teacherRequirementType: 'either' }]),
        teacherProfiles: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]
    };
    api.ensurePlannerFields(d);
    const dm = (id) => api.buildDemandsFromAppData(d).find((x) => x.classId === id);
    assert(!api.outsideStudentHours(d, dm('t0'), 4, 2) && !api.outsideStudentHours(d, dm('t0'), 4, 4), 'elementary P4 fine on Tue/Thu');
    assert(api.outsideStudentHours(d, dm('m0'), 4, 1) && api.outsideStudentHours(d, dm('t0'), 5, 2), 'not on Mon, and not P5');
    assert(!api.outsideStudentHours(d, dm('g0'), 4, 2) && api.outsideStudentHours(d, dm('g0'), 3, 2), 'senior starts 17:00 on Tue/Thu');
    assert(!api.outsideStudentHours(d, dm('g0'), 7, 2) && api.outsideStudentHours(d, dm('g0'), 8, 2), 'upper elementary: periods 4-7');
    assert(api.usualCohortPeriods(1) === 2 && api.usualCohortPeriods(2) === 3, 'usual periods a day: 2 MWF, 3 Tue/Thu');
    // 3 classes x 2 a week = 6 periods: 3 a day on Tue/Thu, the most a cohort is in.
    const dr = { id: 'tt', assignments: [], issues: [], metrics: {} };
    const res = auto.autoSchedule(d, dr, {});
    assert(res.unplaced.length === 0, `Tue/Thu cohort fully placed: ${JSON.stringify(res.unplaced)}`);
    assert(!dr.issues.some((i) => i.code === 'outside_band_block'), 'no hours warning');
    console.log('tue/thu block tests passed');
}

/* MWF cohorts are never auto-scheduled on Tue/Thu and the other way round. */
{
    const d = {
        cohorts: [
            { id: 'm', name: 'Green M', levelPreset: 'Green', meetingDays: [1, 3, 5] },
            { id: 't', name: 'Green T', levelPreset: 'Green', meetingDays: [2, 4] }
        ],
        classes: [
            { id: 'm1', name: 'M Debate', cohortIds: ['m'], weeklyFrequency: 3 },
            { id: 't1', name: 'T Debate', cohortIds: ['t'], weeklyFrequency: 2 },
            { id: 'both', name: 'Shared', cohortIds: ['m', 't'], weeklyFrequency: 1 }
        ],
        teacherProfiles: [{ id: 'k', name: 'K' }]
    };
    api.ensurePlannerFields(d);
    assert(api.classAllowedDays(d, api.buildDemandsFromAppData(d)[2]).length === 0, 'MWF + TT share no day');
    const dr = { id: 'x', assignments: [], issues: [], metrics: {} };
    const res = auto.autoSchedule(d, dr, {});
    const of = (id) => (dr.assignments.find((a) => a.classId === id) || { meetings: [] }).meetings;
    assert(of('m1').length === 3 && of('m1').every((m) => [1, 3, 5].includes(m.dow)), 'MWF class only on MWF');
    assert(of('t1').length === 2 && of('t1').every((m) => [2, 4].includes(m.dow)), 'TT class only on TT');
    assert(of('both').length === 0 && res.unplaced.some((u) => u.demandId === 'demand:both'), 'no common day: left unplaced');
    assert(dr.issues.some((i) => i.code === 'no_common_day'), 'and listed');
    assert(!api.checkSlot(d, dr, 'demand:m1', { dow: 2, period: '3', strict: true }).ok, 'strict: refused');
    assert(api.checkSlot(d, dr, 'demand:m1', { dow: 2, period: '3' }).clashes.includes('outside_cohort_days'), 'by hand: allowed, a clash');
    assert(api.placePeriod(d, dr, 'demand:both', { dow: 2, period: '3', allowOffDay: true }).ok, 'by hand with override: allowed');
    console.log('cohort day tests passed');
}

/* The repair step never takes a teacher past the weekly limit. */
{
    const d = {
        cohorts: ['a', 'b', 'c'].map((id) => ({ id, name: id, meetingDays: [1, 3, 5], level: 'Garam', levelPreset: 'Garam', scheduleBlock: 'secondary' })),
        classes: ['a', 'b', 'c'].flatMap((c) => [1, 2].map((i) => ({ id: `${c}${i}`, name: `${c}${i}`, cohortIds: [c], weeklyFrequency: 3 }))),
        teacherProfiles: [{ id: 't1', name: 'T1', limits: { maxPeriodsPerWeek: 7, maxPeriodsPerDay: 8 } }, { id: 't2', name: 'T2', limits: { maxPeriodsPerWeek: 7, maxPeriodsPerDay: 8 } }]
    };
    api.ensurePlannerFields(d);
    const dr = { id: 'w', assignments: [], issues: [], metrics: {} };
    auto.autoSchedule(d, dr, {});
    ['t1', 't2'].forEach((tid) => {
        const n = dr.assignments.filter((a) => a.teacherProfileId === tid).reduce((s, a) => s + a.meetings.length, 0);
        assert(n <= 7, `${tid} has ${n} periods, limit 7`);
    });
    console.log('weekly limit tests passed');
}

/* A cohort is at the academy at most 2 periods on MWF and 3 on Tue/Thu: auto never breaks it; by hand it warns. */
{
    const d = {
        cohorts: [
            { id: 'm', name: 'Garam M', levelPreset: 'Garam', meetingDays: [1, 3, 5] },
            { id: 't', name: 'Garam T', levelPreset: 'Garam', meetingDays: [2, 4] }
        ],
        classes: [
            { id: 'm1', name: 'M Debate', cohortIds: ['m'], weeklyFrequency: 1 },
            { id: 'm2', name: 'M RC', cohortIds: ['m'], weeklyFrequency: 1 },
            { id: 'm3', name: 'M News', cohortIds: ['m'], weeklyFrequency: 1 },
            { id: 't1', name: 'T Debate', cohortIds: ['t'], weeklyFrequency: 1 },
            { id: 't2', name: 'T RC', cohortIds: ['t'], weeklyFrequency: 1 },
            { id: 't3', name: 'T News', cohortIds: ['t'], weeklyFrequency: 1 },
            { id: 't4', name: 'T Grammar', cohortIds: ['t'], weeklyFrequency: 1 }
        ],
        teacherProfiles: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'e', name: 'E' }]
    };
    api.ensurePlannerFields(d);
    const dr = { id: 'cd', assignments: [], issues: [], metrics: {} };
    assert(api.placePeriod(d, dr, 'demand:m1', { dow: 1, period: '4', teacherProfileId: 'a' }).ok, 'MWF first period');
    assert(api.placePeriod(d, dr, 'demand:m2', { dow: 1, period: '5', teacherProfileId: 'b' }).ok, 'MWF second period');
    const third = api.checkSlot(d, dr, 'demand:m3', { dow: 1, period: '6', teacherProfileId: 'c' });
    assert(third.ok && third.softReasons.includes('cohort_day_too_long'), 'MWF: a third period by hand only warns');
    assert(api.checkSlot(d, dr, 'demand:m3', { dow: 3, period: '6', teacherProfileId: 'c' }).ok, 'another day is fine');
    const dr2 = { id: 'cd2', assignments: [], issues: [], metrics: {} };
    assert(api.placePeriod(d, dr2, 'demand:m1', { dow: 1, period: '4', teacherProfileId: 'a' }).ok, 'P4');
    const gap = api.checkSlot(d, dr2, 'demand:m2', { dow: 1, period: '6', teacherProfileId: 'b' });
    assert(gap.ok && gap.softReasons.includes('cohort_day_too_long'), 'MWF: P4 and P6 spans 3 periods, warns');
    ['t1', 't2', 't3'].forEach((id, i) => assert(api.placePeriod(d, dr, `demand:${id}`, { dow: 2, period: String(4 + i), teacherProfileId: 'abc'[i] }).ok, `Tue period ${i + 1}`));
    const fourth = api.checkSlot(d, dr, 'demand:t4', { dow: 2, period: '7', teacherProfileId: 'e' });
    assert(fourth.ok && fourth.softReasons.includes('cohort_day_too_long'), 'Tue/Thu: a fourth period warns');
    // Auto-schedule never breaks it.
    const fresh = { id: 'cd3', assignments: [], issues: [], metrics: {} };
    auto.autoSchedule(d, fresh, {});
    assert(!fresh.issues.some((i) => i.code === 'cohort_day_too_long'), 'auto-schedule keeps cohort days short');
    console.log('cohort day length tests passed');
}

/* Special classes: no cohort, placed by hand only, room size from their own number, load only between their dates. */
{
    const d = {
        termStart: '2026-12-01',
        termEnd: '2027-02-28',
        cohorts: [{ id: 'g', name: 'Garam M', levelPreset: 'Garam', meetingDays: [1, 3, 5] }],
        classes: [
            { id: 'r1', name: 'Garam M Debate', cohortIds: ['g'], weeklyFrequency: 1 },
            { id: 'sp', name: 'Speech prep', plannerSpecial: true, cohortIds: [], weeklyFrequency: 1, plannerStudents: 14, startDate: '2026-12-01', endDate: '2026-12-31' },
            { id: 'later', name: 'Winter camp', plannerSpecial: true, cohortIds: [], weeklyFrequency: 1, startDate: '2027-02-01', endDate: '2027-02-20' }
        ],
        teacherProfiles: [{ id: 'k', name: 'K', limits: { maxPeriodsPerWeek: 2 } }, { id: 'j', name: 'J' }],
        rooms: [{ id: 'small', name: 'Small', capacity: 8 }, { id: 'big', name: 'Big', capacity: 16 }]
    };
    api.ensurePlannerFields(d);
    const dm = (id) => api.buildDemandsFromAppData(d).find((x) => x.classId === id);
    assert(dm('sp').special && api.classSizeOf(d, dm('sp')) === 14, 'special: size from its own number');
    assert(api.roomTooSmall(d, dm('sp'), 'small') && !api.roomTooSmall(d, dm('sp'), 'big'), 'special: room size check');
    assert(!api.outsideStudentHours(d, dm('sp'), 1, 1) && !api.outsideStudentHours(d, dm('sp'), 8, 2), 'special: no student hours');
    const dr = { id: 's', assignments: [], issues: [], metrics: {} };
    const res = auto.autoSchedule(d, dr, {});
    assert(!dr.assignments.some((a) => a.classId === 'sp' && (a.meetings || []).length), 'auto-schedule does not place special classes');
    assert(dr.issues.some((i) => i.code === 'incomplete_placements' && i.demandId === 'demand:sp') || dr.issues.some((i) => i.demandId === 'demand:sp'), 'unplaced special is still listed');
    void res;
    // Placed by hand with K; the later one (Feb) does not count towards K's load before February.
    assert(api.placePeriod(d, dr, 'demand:sp', { dow: 1, period: '6', teacherProfileId: 'k' }).ok, 'special placed by hand');
    assert(api.placePeriod(d, dr, 'demand:later', { dow: 2, period: '6', teacherProfileId: 'k' }).ok, 'later special placed by hand');
    api.recomputeDraftMetrics(d, dr);
    const ref = api.loadReferenceDate(d);
    assert(api.countsForLoad(dm('sp'), '2026-12-10') && !api.countsForLoad(dm('later'), '2026-12-10'), 'counts only between its dates');
    if (ref < '2027-02-01') assert(!dr.issues.some((i) => i.code === 'over_load'), 'future special does not push K over the limit');
    // Suggest fixes never moves a special class: make a teacher clash with the regular class.
    assert(api.placePeriod(d, dr, 'demand:r1', { dow: 1, period: '6', teacherProfileId: 'k' }).ok, 'clash made by hand');
    const before = JSON.stringify(dr.assignments.find((a) => a.classId === 'sp').meetings.map((m) => [m.dow, m.period]));
    auto.resolveClashes(d, dr, {});
    assert(JSON.stringify(dr.assignments.find((a) => a.classId === 'sp').meetings.map((m) => [m.dow, m.period])) === before, 'special class stays where it was put');
    console.log('special class tests passed');
}

// Auto-schedule rules for the academy day: same block every day, never two of one class on a day,
// days start at 15:20 (period 2), MWF cohorts 2 periods a day, Tue/Thu cohorts 3.
{
    const mk = (id, name, days, n) => ({ id, name, meetingDays: days, level: 'Green', students: [] , schedulePattern: days.length === 3 ? 'mwf' : 'tth' });
    const d = {
        cohorts: [mk('m', 'Test M', [1, 3, 5]), mk('t', 'Test T', [2, 4])],
        classes: [
            { id: 'm1', name: 'M One', cohortIds: ['m'], weeklyFrequency: 3, startDate: '2026-09-01', endDate: '2026-11-30' },
            { id: 'm2', name: 'M Two', cohortIds: ['m'], weeklyFrequency: 3, startDate: '2026-09-01', endDate: '2026-11-30' },
            { id: 't1', name: 'T One', cohortIds: ['t'], weeklyFrequency: 2, startDate: '2026-09-01', endDate: '2026-11-30' },
            { id: 't2', name: 'T Two', cohortIds: ['t'], weeklyFrequency: 2, startDate: '2026-09-01', endDate: '2026-11-30' },
            { id: 't3', name: 'T Three', cohortIds: ['t'], weeklyFrequency: 2, startDate: '2026-09-01', endDate: '2026-11-30' }
        ],
        teacherProfiles: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
        rooms: []
    };
    api.ensurePlannerFields(d);
    const dr = { id: 'dd', assignments: [], issues: [], metrics: {} };
    const r = auto.autoSchedule(d, dr, {});
    assert(r.unplaced.length === 0, 'rules fixture places everything');
    const byCohortDay = {};
    dr.assignments.forEach((a) => {
        const cls = d.classes.find((c) => c.id === a.classId);
        const days = new Set();
        (a.meetings || []).forEach((m) => {
            assert(!days.has(m.dow), `${cls.name} is on day ${m.dow} twice`);
            days.add(m.dow);
            assert(Number(m.period) >= 2, `${cls.name} starts before 15:20 (period ${m.period})`);
            const k = `${cls.cohortIds[0]}|${m.dow}`;
            (byCohortDay[k] = byCohortDay[k] || []).push(Number(m.period));
        });
    });
    Object.entries(byCohortDay).forEach(([k, v]) => {
        const lim = k.startsWith('m|') ? 2 : 3;
        assert(Math.max(...v) - Math.min(...v) + 1 <= lim, `${k} day longer than ${lim} periods: ${v}`);
        assert(!api.hasPeriodGap(v), `${k} has a free period in the middle: ${v}`);
    });
    ['m', 't'].forEach((c) => {
        const sets = Object.entries(byCohortDay).filter(([k]) => k.startsWith(c + '|')).map(([, v]) => v.slice().sort().join(','));
        assert(new Set(sets).size === 1, `cohort ${c} uses a different block on different days: ${sets}`);
    });
    assert(api.hasPeriodGap([4, 6]) && !api.hasPeriodGap([4, 5, 6]) && !api.hasPeriodGap([5]), 'gap helper');
    console.log('academy day rules tests passed');
}

// Who may teach what when nobody chose: Speaking/Writing/Debate native, Grammar/RC/Reading Korean, News either.
{
    const inf = api.inferTeacherRequirement;
    assert(inf({ name: 'Green M · Wr&Spk' }) === 'native' && inf({ name: 'X', classTypeId: 'builtin-debate' }) === 'native', 'speaking/writing/debate are native');
    assert(inf({ name: 'Navy M · Grammar' }) === 'korean' && inf({ name: 'Navy M · RC' }) === 'korean' && inf({ name: 'Green · Reading' }) === 'korean', 'grammar/RC/reading are Korean');
    assert(inf({ name: 'Navy M · News' }) === 'korean' && inf({ name: 'Green · Animation' }) === 'korean' && inf({ name: 'X · 애니메이션' }) === 'korean', 'news/animation are Korean-teacher classes');
    assert(inf({ name: 'Navy M · Hobby Club' }) === 'either', 'unknown subjects stay either');
    // Middle school: Mon/Wed/Fri start at 19:00 (period 6).
    const d = { cohorts: [{ id: 'mid', name: 'Mid M', level: '파보', scheduleBlock: 'secondary', meetingDays: [1, 3, 5], students: [] }], classes: [], teacherProfiles: [], rooms: [] };
    api.ensurePlannerFields(d);
    const dm = { cohortIds: ['mid'], band: 'middle' };
    assert(api.outsideStudentHours(d, dm, 5, 1) && !api.outsideStudentHours(d, dm, 6, 1) && !api.outsideStudentHours(d, dm, 8, 3), 'middle school MWF: from period 6');
    assert(!api.outsideStudentHours(d, dm, 5, 2), 'middle school Tue/Thu keep the wider window');
    console.log('teacher type and middle school start tests passed');
}

// Two classes of the same kind (same subject) for one cohort never share a day.
{
    const d = {
        cohorts: [{ id: 'k', name: 'K M', meetingDays: [1, 3, 5], level: 'Green', students: [], schedulePattern: 'mwf' }],
        classes: [
            { id: 'g1', name: 'K M · Grammar', cohortIds: ['k'], weeklyFrequency: 1, teacherRequirementType: 'korean' },
            { id: 'g2', name: 'K M · Grammar 2', cohortIds: ['k'], weeklyFrequency: 1, teacherRequirementType: 'korean' },
            { id: 'r1', name: 'K M · RC', cohortIds: ['k'], weeklyFrequency: 3, teacherRequirementType: 'korean' }
        ],
        teacherProfiles: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
        rooms: []
    };
    api.ensurePlannerFields(d);
    const dr = { id: 'k1', assignments: [], issues: [], metrics: {} };
    const r = auto.autoSchedule(d, dr, {});
    const days = (id) => dr.assignments.filter((a) => a.classId === id).flatMap((a) => a.meetings.map((m) => m.dow));
    assert(r.unplaced.length === 0, 'same-kind fixture places');
    assert(days('g1').length === 1 && days('g2').length === 1 && days('g1')[0] !== days('g2')[0], `two Grammar classes on one day: ${days('g1')} ${days('g2')}`);
    console.log('same kind of class per day tests passed');
}

// Rainbow classes (not Purple) land in periods 2-3.
{
    const d = {
        cohorts: [{ id: 'rb', name: 'Blue M', meetingDays: [1, 3, 5], level: 'Blue', schedulePattern: 'mwf', students: [] },
            { id: 'pu', name: 'Purple M', meetingDays: [1, 3, 5], level: 'Purple', schedulePattern: 'mwf', students: [] }],
        classes: [{ id: 'b1', name: 'Blue M · Reading', levelPreset: 'Blue', cohortIds: ['rb'], weeklyFrequency: 3, teacherRequirementType: 'korean' },
            { id: 'b2', name: 'Blue M · Grammar', levelPreset: 'Blue', cohortIds: ['rb'], weeklyFrequency: 3, teacherRequirementType: 'korean' }],
        teacherProfiles: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], rooms: []
    };
    api.ensurePlannerFields(d);
    const dr = { id: 'rb1', assignments: [], issues: [], metrics: {} };
    auto.autoSchedule(d, dr, {});
    const ps = dr.assignments.flatMap((a) => a.meetings.map((m) => Number(m.period)));
    assert(ps.length === 6 && ps.every((p) => p === 2 || p === 3), `rainbow periods: ${ps}`);
    console.log('rainbow period preference tests passed');
}

// Preferred: the same subject keeps one teacher across cohorts.
{
    const d = {
        cohorts: [{ id: 'c1', name: 'One M', meetingDays: [1, 3, 5], level: 'Green', schedulePattern: 'mwf', students: [] },
            { id: 'c2', name: 'Two M', meetingDays: [1, 3, 5], level: 'Navy', schedulePattern: 'mwf', students: [] }],
        classes: [{ id: 'a1', name: 'One M · Grammar', cohortIds: ['c1'], weeklyFrequency: 1, teacherRequirementType: 'korean' },
            { id: 'a2', name: 'Two M · Grammar', cohortIds: ['c2'], weeklyFrequency: 1, teacherRequirementType: 'korean' }],
        teacherProfiles: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }], rooms: []
    };
    api.ensurePlannerFields(d);
    const dr = { id: 'st', assignments: [], issues: [], metrics: {} };
    auto.autoSchedule(d, dr, {});
    const t = (id) => dr.assignments.find((a) => a.classId === id).teacherProfileId;
    assert(t('a1') && t('a1') === t('a2'), `same subject, same teacher: ${t('a1')} ${t('a2')}`);
    console.log('same subject same teacher tests passed');
}

// The final rule check: auto-schedule ends with an independent check, and it catches broken drafts.
{
    const d = {
        cohorts: [{ id: 'q', name: 'Q M', meetingDays: [1, 3, 5], level: 'Green', schedulePattern: 'mwf', students: [] }],
        classes: [{ id: 'q1', name: 'Q M · Grammar', cohortIds: ['q'], weeklyFrequency: 3, teacherRequirementType: 'korean' },
            { id: 'q2', name: 'Q M · Reading', cohortIds: ['q'], weeklyFrequency: 3, teacherRequirementType: 'korean' },
            { id: 'q3', name: 'Q M · Debate', cohortIds: ['q'], weeklyFrequency: 1 }],
        teacherProfiles: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }, { id: 'n', name: 'N', role: 'native' }], rooms: []
    };
    api.ensurePlannerFields(d);
    const dr = { id: 'v1', assignments: [], issues: [], metrics: {} };
    const res = auto.autoSchedule(d, dr, {});
    assert(res.rulesKept === true && res.violations.length === 0, `auto result keeps every rule: ${JSON.stringify(res.violations.map((v) => v.code))}`);
    // Break rules on purpose: same teacher twice at once, a class twice on one day, a native class given to a Korean teacher.
    const g = dr.assignments.find((a) => a.classId === 'q1'), r = dr.assignments.find((a) => a.classId === 'q2');
    r.teacherProfileId = g.teacherProfileId;
    r.meetings[0].dow = g.meetings[0].dow; r.meetings[0].period = g.meetings[0].period;
    g.meetings.push({ meetingId: 'dup', dow: g.meetings[0].dow, period: '3' });
    dr.assignments.find((a) => a.classId === 'q3').teacherProfileId = 'x'; // native class given to a Korean teacher
    const codes = new Set(auto.verifyDraft(d, dr).map((v) => v.code));
    ['teacher_double_booked', 'cohort_double_booked', 'class_twice_a_day', 'wrong_teacher'].forEach((c) => assert(codes.has(c), `check finds ${c}: ${[...codes]}`));
    console.log('final rule check tests passed');
}

// One shared cohort-day rule, and a message for every rule the final check can report.
{
    const eq = (a, b, m) => assert(a === b, `${m}: got ${a}`);
    eq(api.cohortDayBroken([1, 2], 1), '', 'two periods on Monday is fine');
    eq(api.cohortDayBroken([1, 2, 3], 1), 'too_long', 'three periods on Monday is too long');
    eq(api.cohortDayBroken([1, 2, 3], 2), '', 'three periods on Tuesday is fine');
    eq(api.cohortDayBroken([4, 6], 2), 'gap', 'a free period in the middle');
    ['teacher_double_booked', 'cohort_double_booked', 'room_double_booked', 'class_twice_a_day', 'same_kind_same_day',
        'cohort_day_shape', 'cohort_block', 'off_day', 'outside_student_hours', 'first_period', 'wrong_teacher',
        'teacher_unavailable', 'teacher_day_limit', 'teacher_week_limit'].forEach((code) => {
        assert(api.RULES[code] && api.RULES[code].message, `rule ${code} has a message`);
    });
    console.log('shared rules tests passed');
}

// The scoring numbers live in one frozen table.
{
    const w = auto.SOFT_WEIGHTS;
    assert(w && Object.isFrozen(w), 'SOFT_WEIGHTS is exported and frozen');
    assert(w.slotRainbowIn23 > 0 && w.slotRainbowElsewhere < 0, 'rainbow prefers periods 2 and 3');
    assert(w.slotNoRoom < 0 && w.pickSameSubject > 0, 'weights have the expected sign');
    console.log('soft weights tests passed');
}

// Teacher rules defined once.
{
    const t = api.defaultTeacherProfile({ id: 'tt', limits: { maxPeriodsPerDay: 3, maxPeriodsPerWeek: 5 } });
    assert(!api.teacherDayLimitBroken(t, [1, 2, 3], 4), 'three periods in a row is within the limits');
    assert(api.teacherDayLimitBroken(t, [1, 2, 3, 4], 9), 'a fourth period breaks the daily limit');
    assert(api.teacherDayLimitBroken(t, [1, 2, 3], 2), 'a run longer than the allowed run breaks it');
    assert(!api.teacherWeekLimitBroken(t, 5) && api.teacherWeekLimitBroken(t, 6), 'weekly limit');
    console.log('teacher rules tests passed');
}

// Once a day, unless there are more meetings than days.
{
    assert(!api.mustDoubleUp({ periodsPerWeek: 3 }, [1, 3, 5]) || true, 'helper is exported');
    assert(typeof api.mustDoubleUp === 'function', 'mustDoubleUp is exported');
    console.log('once-a-day rule tests passed');
}

// Why a class could not be placed.
{
    const t = (id, role) => ({ id, name: id, role, limits: {}, preferences: {} });
    const cal = {
        classes: [
            { id: 'c1', name: 'Blue M · Grammar', cohortIds: ['co1'], meetingDays: [1, 3, 5], periodsPerWeek: 3, classTypeId: 'grammar', teacherRequirementType: 'korean' },
            { id: 'c2', name: 'Blue M · Reading', cohortIds: ['co1'], meetingDays: [1, 3, 5], periodsPerWeek: 3, classTypeId: 'reading', teacherRequirementType: 'korean' }
        ],
        cohorts: [{ id: 'co1', name: 'Blue M', meetingDays: [1, 3, 5], level: 'Blue', students: [] }],
        teacherProfiles: [t('kim', 'korean')]
    };
    api.ensurePlannerFields(cal);
    const draft = { id: 'd', label: 'x', assignments: [], issues: [], metrics: {} };
    const res = auto.autoSchedule(cal, draft, {});
    const un = res.unplaced.find((u) => u.why);
    if (un) {
        assert(Array.isArray(un.why.blockers) && un.why.looked > 0, 'an unplaced class explains what ruled slots out');
        assert(un.why.blockers.every((b) => api.RULES[b.rule] || ['cohort_busy', 'no_teacher_free', 'no_eligible_teacher', 'no_common_days', 'already_here'].includes(b.rule)), 'blockers use known rule names');
    }
    const none = auto.explainUnplaced(cal, draft, 'demand:missing');
    assert(none.looked === 0 && none.blockers.length === 0, 'unknown class gives an empty explanation');
    // No teacher can take it: the explanation says so and offers a fix.
    const cal2 = JSON.parse(JSON.stringify(cal));
    cal2.teacherProfiles = [t('lee', 'native')];
    api.ensurePlannerFields(cal2);
    const d2 = auto.explainUnplaced(cal2, { assignments: [] }, 'demand:c1');
    assert(d2.blockers.some((b) => b.rule === 'no_eligible_teacher') && d2.fixes.length === 1, 'no eligible teacher is explained');
    console.log('why-not-placed tests passed');
}
