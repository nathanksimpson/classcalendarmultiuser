/**
 * Run: node tests/tms-schedule-import.test.mjs
 * Synthetic data only (the repo never holds real names).
 */
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
for (const f of ['timetable-periods.js', 'teacher-timetable.js', 'planner/teacher-planner-core.js', 'planner/tms-schedule-import.js']) {
    await import(pathToFileURL(path.join(root, 'js', f)).href);
}
const P = globalThis.CCPTeacherPlanner;
const I = globalThis.CCPTmsScheduleImport;

const prof = (id, name, role) => ({ id, userId: `u-${id}`, name, role, limits: {}, preferences: {} });
const cal = {
    cohorts: [
        { id: 'co1', name: 'Blue M', level: 'Blue', meetingDays: [1, 3, 5], students: [] },
        { id: 'co2', name: 'Navy T', level: 'Navy', meetingDays: [2, 4], students: [] }
    ],
    classes: [
        { id: 'c1', name: 'Blue M · Speaking & Writing', cohortIds: ['co1'], cohortId: 'co1', weeklyFrequency: 3 },
        { id: 'c2', name: 'Blue M · Reading', cohortIds: ['co1'], cohortId: 'co1', weeklyFrequency: 3 },
        { id: 'c3', name: 'Navy T · Grammar', cohortIds: ['co2'], cohortId: 'co2', weeklyFrequency: 2 },
        { id: 'c4', name: 'Navy T · News', cohortIds: ['co2'], cohortId: 'co2', weeklyFrequency: 2 }
    ],
    teacherProfiles: [prof('t1', 'Kim', 'korean'), prof('t2', 'Lee', 'native')]
};
P.ensurePlannerFields(cal);

const row = (teacher, day, start, cohort, subject) => ({ teacherName: teacher, day, start, end: '', cohortName: cohort, subject });
const tms = {
    placements: [
        row('Lee', 'mon', '15:20', 'BlueM^2609', 'Wr&Spk'),
        row('Lee', 'wed', '15:20', 'BlueM^2609', 'Wr&Spk'),
        row('Lee', 'fri', '15:20', 'BlueM^2609', 'Spk&Wr'),
        row('Kim', 'mon', '16:10', 'BlueM^2609', 'RC'),
        row('Kim', 'tue', '15:20', 'Navy T^2609', 'Grammar'),
        row('Kim', 'thu', '15:20', 'Navy T^2609', 'Grammar'),
        row('Nobody', 'tue', '16:10', 'Navy T^2609', 'News'),     // teacher not in the calendar
        row('Kim', 'tue', '17:00', 'Gone M^2609', 'RC'),           // cohort not in the calendar
        row('Kim', 'wed', '17:00', 'BlueM^2609', 'Debate'),        // class not in the calendar
        row('Kim', 'mon', '15:20', 'BlueM^2612', 'RC'),            // another TMS term
        row('Kim', 'sun', '10:30', '', '')                         // not a cohort class
    ]
};

const { draft, report } = I.buildDraftFromTms(cal, tms, { now: new Date('2026-11-17T04:00:00Z') });
assert.equal(report.term, '2609', 'the term that matches the most cohorts is chosen');
assert.deepEqual(report.terms.map((t) => t.term), ['2609', '2612']);
assert.equal(report.unmatchedCohorts.length, 1, 'a cohort that is not in the calendar is reported');
assert.equal(report.unmatchedCohorts[0].name, 'Gone M^2609');
assert.equal(report.unmatchedClasses.length, 1, 'a subject the cohort has no class for is reported');
assert.equal(report.unmatchedTeachers[0].name, 'Nobody', 'a teacher that is not in the calendar is reported');

const byClass = Object.fromEntries(draft.assignments.map((a) => [a.classId, a]));
assert.equal(byClass.c1.teacherProfileId, 't2', 'spelling variants of one subject land on one class and the teacher is matched');
assert.equal(byClass.c1.meetings.length, 3);
assert.deepEqual(byClass.c1.meetings.map((m) => [m.dow, m.period]), [[1, '2'], [3, '2'], [5, '2']], '15:20 is period 2');
assert.equal(byClass.c2.meetings[0].period, '3', '16:10 is period 3');
assert.equal(byClass.c3.meetings.length, 2);
assert.equal(byClass.c4.teacherProfileId, null, 'an unknown teacher leaves the class without one');
assert.equal(draft.source, 'tms');
assert.ok(draft.label.startsWith('TMS 2026-11-17'), 'the draft is labelled with its date');
assert.equal(report.classesWithoutTms, 0);

// Pulling again gives a separate draft (a snapshot), and a chosen term can differ.
const other = I.buildDraftFromTms(cal, tms, { term: '2612', now: new Date('2026-11-18T04:00:00Z') });
assert.notEqual(other.draft.id, draft.id, 'each pull is its own draft');
assert.equal(other.report.used, 1);

console.log('tms-schedule-import tests passed');

// Saved roster links match TMS class names that differ from the calendar's cohort names.
{
    const linked = JSON.parse(JSON.stringify(cal));
    linked.cohorts[0].name = 'Saemmul T';
    linked.classes[0].name = 'Saemmul T · Speaking & Writing';
    linked.classes[1].name = 'Saemmul T · Reading';
    linked.tmsRosterLinks = { 'xyz^2609': { action: 'map', tmsClassName: 'XYZ^2609', cohortId: 'co1' } };
    const link = (name) => [row('Lee', 'mon', '15:20', name, 'Wr&Spk')];
    assert.equal(I.buildDraftFromTms(linked, { placements: link('XYZ^2609') }).draft.assignments.length, 1);
    delete linked.tmsRosterLinks;
    assert.equal(I.buildDraftFromTms(linked, { placements: link('XYZ^2609') }).draft.assignments.length, 0);
}
console.log('tms-schedule-import linked-name test passed');

// Classes the person marked "not in this calendar" are left out silently.
{
    const c2 = JSON.parse(JSON.stringify(cal));
    c2.tmsRosterLinks = { 'other^2609': { action: 'skip', tmsClassName: 'Other^2609', cohortId: '' } };
    const out = I.buildDraftFromTms(c2, { placements: [row('Lee', 'mon', '15:20', 'Other^2609', 'Wr&Spk'), row('Lee', 'mon', '15:20', 'BlueM^2609', 'Wr&Spk')] });
    assert.equal(out.report.unmatchedCohorts.length, 0);
    assert.equal(out.draft.assignments.length, 1);
}
console.log('tms-schedule-import skip test passed');

// Two terms tie: the running term wins over next term's classes.
{
    const both = I.buildDraftFromTms(cal, { placements: [
        row('Lee', 'mon', '15:20', 'BlueM^2612', 'Wr&Spk'),
        row('Lee', 'mon', '15:20', 'BlueM^2609', 'Wr&Spk')
    ] }, { now: new Date(2026, 10, 17) });
    assert.equal(both.report.term, '2609');
}
console.log('tms-schedule-import term tie-break test passed');

// Two cohorts for the same teacher, day and time = a merged class; reported unless the calendar already merges them.
{
    const m = JSON.parse(JSON.stringify(cal));
    m.cohorts.push({ id: 'co3', name: 'Green M', level: 'Green', meetingDays: [1, 3, 5], students: [] });
    m.classes.push({ id: 'c5', name: 'Green M · Speaking & Writing', cohortIds: ['co3'], cohortId: 'co3', weeklyFrequency: 3 });
    const two = [row('Lee', 'mon', '15:20', 'BlueM^2609', 'Wr&Spk'), row('Lee', 'mon', '15:20', 'GreenM^2609', 'Wr&Spk')];
    const out = I.buildDraftFromTms(m, { placements: two });
    assert.equal(out.report.mergedClasses.length, 1);
    assert.equal(out.report.mergedClasses[0].calendarMerged, false);
    assert.equal(out.draft.assignments.length, 2);
    // The calendar already holds them as one class: both rows land on it, and it is not flagged.
    m.classes[0].cohortIds = ['co1', 'co3'];
    const out2 = I.buildDraftFromTms(m, { placements: two });
    assert.equal(out2.report.mergedClasses[0].calendarMerged, true);
    // After the one-click merge the extra class is left out of the plan: both rows land on the merged class only.
    m.classes[4].plannerExcluded = true;
    const out4 = I.buildDraftFromTms(m, { placements: two });
    assert.equal(out4.draft.assignments.length, 1);
    assert.equal(out4.draft.assignments[0].classId, 'c1');
    assert.deepEqual(out4.report.mergedClasses[0].cohortIds.sort(), ['co1', 'co3']);
    // A merged cohort that is not in this calendar is not a merge here.
    const out3 = I.buildDraftFromTms(cal, { placements: two });
    assert.equal(out3.report.mergedClasses.length, 0);
}
console.log('tms-schedule-import merged-class test passed');

// The teacher grid parser keeps both cohorts when a cell lists two (shared room line, or one room each).
{
    const { createRequire } = await import('node:module');
    const core = createRequire(import.meta.url)('../shared/tms-roster-core.cjs');
    const html = (cell) => `<table><tr><td>시간</td><td>월</td></tr><tr><td>15:20~16:10</td><td>${cell}</td></tr></table>`;
    const shared = core.parseTeacherGrid(html('BlueM^2609(Wr&amp;Spk)<br>GreenM^2609(Wr&amp;Spk)<br>1강의실'));
    assert.equal(shared.length, 2);
    assert.deepEqual(shared.map((x) => x.room), ['1강의실', '1강의실']);
    assert.deepEqual(shared[0].sharedWith, ['GreenM^2609']);
    const each = core.parseTeacherGrid(html('BlueM^2609(Wr&amp;Spk)<br>1강의실<br>GreenM^2609(Wr&amp;Spk)<br>2강의실'));
    assert.deepEqual(each.map((x) => [x.cohortName, x.room]), [['BlueM^2609', '1강의실'], ['GreenM^2609', '2강의실']]);
    const single = core.parseTeacherGrid(html('동아(윤정미)(내신수업)<br>1강의실'));
    assert.deepEqual(single.map((x) => [x.cohortName, x.subject, x.room]), [['동아(윤정미)', '내신수업', '1강의실']]);
}
console.log('tms grid parser multi-cohort test passed');

// Choosing a term changes what is imported.
{
    const tms = { placements: [
        row('Lee', 'mon', '15:20', 'BlueM^2609', 'Wr&Spk'),
        row('Lee', 'tue', '16:10', 'BlueM^2612', 'Wr&Spk')
    ] };
    const a = I.buildDraftFromTms(cal, tms, { term: '2609' });
    const b = I.buildDraftFromTms(cal, tms, { term: '2612' });
    const dows = (o) => o.draft.assignments.flatMap((x) => x.meetings.map((m) => m.dow)).join(',');
    assert.notEqual(dows(a), dows(b));
    assert.equal(a.report.term, '2609');
    assert.equal(b.report.term, '2612');
}
console.log('tms-schedule-import term choice test passed');

// Unmatched cohorts carry their meeting days; unmatched classes carry the cohort id (used to create new cohorts/classes).
{
    const out = I.buildDraftFromTms(cal, { placements: [
        row('Lee', 'tue', '15:20', 'NewT^2609', 'Wr&Spk'), row('Lee', 'thu', '15:20', 'NewT^2609', 'Wr&Spk'),
        row('Lee', 'mon', '15:20', 'BlueM^2609', 'Zzz')
    ] });
    assert.deepEqual(out.report.unmatchedCohorts[0].days.sort(), [2, 4]);
    assert.equal(out.report.unmatchedClasses[0].cohortId, 'co1');
}
console.log('tms-schedule-import new-cohort data test passed');

// The trace records every row and where it went.
{
    const out = I.buildDraftFromTms(cal, { placements: [
        row('Lee', 'mon', '15:20', 'BlueM^2609', 'RC'), row('Lee', 'tue', '15:20', 'Nope^2609', 'RC'), row('Lee', 'wed', '15:20', 'BlueM^2609', 'Zzz')
    ] });
    assert.deepEqual(out.report.trace.map((x) => x.status).sort(), ['no-class', 'no-cohort', 'placed']);
    assert.equal(out.report.trace.find((x) => x.status === 'placed').className, 'Blue M · Reading');
}
console.log('tms-schedule-import trace test passed');

// A class named after its cohort alone does NOT absorb every subject: each subject is its own class.
{
    const bare = JSON.parse(JSON.stringify(cal));
    bare.classes = [{ id: 'b1', name: 'Blue M', cohortIds: ['co1'], cohortId: 'co1', weeklyFrequency: 3 }];
    P.ensurePlannerFields(bare);
    const out = I.buildDraftFromTms(bare, { placements: [
        row('Lee', 'mon', '15:20', 'BlueM^2609', 'Grammar'), row('Kim', 'tue', '15:20', 'BlueM^2609', 'RC')
    ] });
    assert.equal(out.report.matched, 0);
    assert.equal(out.report.unmatchedClasses.length, 2);
}
console.log('tms-schedule-import cohort-named class test passed');

// Teacher names: "김현빈 (Olivia)" in the calendar matches "김현빈" or "Olivia" in TMS.
{
    const d = JSON.parse(JSON.stringify(cal));
    d.teacherProfiles = [prof('t9', '김현빈 (Olivia)', 'korean')];
    P.ensurePlannerFields(d);
    const out = I.buildDraftFromTms(d, { placements: [row('김현빈', 'mon', '15:20', 'BlueM^2609', 'Reading'), row('Olivia', 'wed', '15:20', 'BlueM^2609', 'Reading')] });
    assert.equal(out.report.unmatchedTeachers.length, 0);
    assert.equal(out.draft.assignments[0].teacherProfileId, 't9');
}
console.log('tms-schedule-import teacher name test passed');

// Draft classes live on the plan only: planner lookups and the importer see them, the calendar's classes do not change.
{
    const d = JSON.parse(JSON.stringify(cal));
    d.classes = [];
    P.ensurePlannerFields(d);
    d.plannerDrafts = [{ id: 'dr1', assignments: [], draftClasses: [{ id: 'dc1', name: 'Blue M · Grammar', cohortIds: ['co1'], cohortId: 'co1', weeklyFrequency: 3, plannerDraftClass: true }] }];
    d.plannerState = Object.assign({}, d.plannerState, { activeDraftId: 'dr1' });
    assert.equal(d.classes.length, 0);
    assert.equal(P.allClasses(d).length, 1);
    const dem = P.buildDemandsFromAppData(d);
    assert.equal(dem.length, 1);
    assert.equal(dem[0].draft, true);
    const out = I.buildDraftFromTms(d, { placements: [row('Lee', 'mon', '15:20', 'BlueM^2609', 'Grammar')] });
    assert.equal(out.report.unmatchedClasses.length, 0);
    assert.equal(out.report.matched, 1);
}
console.log('tms-schedule-import draft class test passed');

// A real TMS class with no cohort in the calendar needs no mapping: it becomes a stand-alone draft class.
{
    const d = JSON.parse(JSON.stringify(cal));
    P.ensurePlannerFields(d);
    const body = { placements: [
        row('Lee', 'mon', '15:20', 'OrangeM^2609', 'Grammar'), row('Lee', 'wed', '15:20', 'OrangeM^2609', 'Grammar'),
        row('Lee', 'tue', '15:20', 'test폴라_수', 'RC')
    ] };
    const first = I.buildDraftFromTms(d, body);
    assert.equal(first.report.newDraftClasses.length, 1, 'junk/test entries do not make draft classes');
    const nd = first.report.newDraftClasses[0];
    assert.equal(nd.count, 2);
    assert.deepEqual(nd.days.sort(), [1, 3]);
    d.plannerDrafts = [{ id: 'dr2', assignments: [], draftClasses: [{ id: 'dc2', name: 'OrangeM · Grammar', cohortIds: [], tmsDraftKey: nd.tmsKey, meetingDays: [1, 3], schedulePattern: 'mwf', weeklyFrequency: 2, plannerDraftClass: true }] }];
    d.plannerState = Object.assign({}, d.plannerState, { activeDraftId: 'dr2' });
    const second = I.buildDraftFromTms(d, body);
    assert.equal(second.report.newDraftClasses.length, 0);
    assert.equal(second.report.matched, 2);
}
console.log('tms-schedule-import cohort-free draft class test passed');

// A cohort name's M/T is its class type, even when the record says otherwise.
{
    assert.deepEqual(P.daysFromCohortName('BlueT^2609'), [2, 4]);
    assert.deepEqual(P.daysFromCohortName('PavoT'), [2, 4]);
    assert.deepEqual(P.daysFromCohortName('Navy M'), [1, 3, 5]);
    assert.deepEqual(P.daysFromCohortName('빅키T^2612'), [2, 4]);
    assert.deepEqual(P.daysFromCohortName('Student archive'), []);
    const d = { cohorts: [{ id: 'x', name: 'BlueT^2609', meetingDays: [1, 3, 5], schedulePattern: 'mwf' }],
        classes: [{ id: 'k', name: 'BlueT · Grammar', cohortIds: ['x'], cohortId: 'x', weeklyFrequency: 2 }], teacherProfiles: [] };
    P.ensurePlannerFields(d);
    assert.deepEqual(P.cohortBlock(d, d.cohorts[0]).days, [2, 4]);
    assert.equal(P.buildDemandsFromAppData(d)[0].cadence, 'tth');
}
console.log('cohort name class-type test passed');
