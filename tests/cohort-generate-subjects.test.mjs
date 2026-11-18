/**
 * Run: node tests/cohort-generate-subjects.test.mjs
 * Cohort editor, Generate subjects: from the TMS timetables (shared classes, existing classes linked, double
 * periods) and from the flyer level schedule (elementary fixes, middle school, Mon-only class).
 * Synthetic data only (the repo never holds real names).
 */
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
// The cohorts tab binds a few buttons on init: a bare document is enough here.
const el = () => ({ addEventListener() {}, dataset: {}, value: '', innerHTML: '', textContent: '', querySelector: () => null, querySelectorAll: () => [] });
globalThis.document = { body: el(), documentElement: { lang: 'en', getAttribute: () => null }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el };
for (const f of ['schedule-matrix-data.js', 'syllabus-schedule-matrix.js', 'level-profile.js', 'timetable-periods.js',
    'teacher-timetable.js', 'planner/teacher-planner-core.js', 'planner/tms-schedule-import.js', 'cohort-management.js']) {
    await import(pathToFileURL(path.join(root, 'js', f)).href);
}
const I = globalThis.CCPTmsScheduleImport;
const M = globalThis.CCPScheduleMatrix;
const CM = globalThis.CCPCohortManagement;
const TT = globalThis.CCPTeacherTimetable;

/* ---------- flyer level schedule ---------- */
{
    const slot = (level, patternId, period) => M.findSlots({ level, patternId }).find((s) => s.period === period);
    // Red/Orange/Yellow Fri: Spk & Wr then Animation.
    assert.deepEqual(slot('Red', 'mwf', 1).byWeekday, { 1: 'phonics', 3: 'phonics', 5: 'spkWr' });
    assert.deepEqual(slot('Red', 'mwf', 2).byWeekday, { 1: 'spkWr', 3: 'animation', 5: 'animation' });
    // Purple Wed P2 and Thu P3 are Debate.
    assert.equal(slot('Purple', 'mwf', 2).byWeekday[3], 'debate');
    assert.equal(slot('Purple', 'tth', 3).byWeekday[4], 'debate');
    // 샘물 Fri: Reading(V) then Grammar; 가람 Thu P1 is News.
    assert.deepEqual(slot('Saemmul', 'mwf', 1).byWeekday, { 1: 'news', 3: 'news', 5: 'ipkV' });
    assert.deepEqual(slot('Saemmul', 'mwf', 2).byWeekday, { 1: 'ipkV', 3: 'debate', 5: 'grammar' });
    assert.equal(slot('Garam', 'tth', 1).byWeekday[4], 'news');
    // Middle school: 중1/중2 vs 중3 vs Pre-Basic, and the Mon-only class for Inter-high / Advanced 중2–3.
    assert.deepEqual(slot('빅키', 'mwf', 1).byWeekday, { 1: 'news', 3: 'grammar', 5: 'news' });
    assert.deepEqual(slot('로체', 'mwf', 1).byWeekday, { 1: 'rc', 3: 'rc', 5: 'news' });
    assert.deepEqual(slot('S2', 'tth', 3).byWeekday, { 2: 'grammar', 4: 'lc|voca' });
    assert.deepEqual(slot('\uC720\uB9C8', 'mwf', 2).byWeekday, { 1: 'grammar', 3: 'rc', 5: 'debate|rc' });
    assert.equal(M.findSlots({ level: '빅키', patternId: 'mon' }).length, 5);
    assert.equal(M.findSlots({ level: '파보', patternId: 'mon' }).length, 0, '중1 has no Mon-only class');
    assert.equal(M.patternIdFromMeetingDays([1]), 'mon');
}

/* ---------- calendar + hooks ---------- */
let n = 0;
const appData = {
    cohorts: [
        { id: 'co-b', name: 'BlueT^2609', meetingDays: [2, 4], schedulePattern: 'tth', students: [] },
        { id: 'co-n', name: 'NavyT^2609', meetingDays: [2, 4], schedulePattern: 'tth', students: [] },
        { id: 'co-v', name: '빅키T^2612', meetingDays: [2, 4], schedulePattern: 'tth', students: [] },
        { id: 'co-s', name: 'S1M', meetingDays: [1, 3, 5], schedulePattern: 'mwf', students: [] }
    ],
    classes: [
        // Already linked to BlueT: updated, not duplicated.
        { id: 'k-read', name: 'BlueT · Reading', cohortIds: ['co-b'], cohortId: 'co-b' },
        // Named for BlueT but not linked: linked.
        { id: 'k-anim', name: 'Blue T · Animation', cohortIds: [], cohortId: '' },
        // NavyT's grammar class: TMS teaches BlueT and NavyT together, so BlueT shares it.
        { id: 'k-gram', name: 'NavyT · Grammar', cohortIds: ['co-n'], cohortId: 'co-n' }
    ],
    teacherProfiles: [{ id: 't1', userId: 'u-kim', name: 'Kim', limits: {}, preferences: {} }]
};
const hooks = {
    getAppData: () => appData,
    generateId: () => `gen-${++n}`,
    syncClassCohortLinks: (cohort) => {
        cohort.classIds = appData.classes.filter((k) => TT.getClassCohortIds(k).includes(cohort.id)).map((k) => k.id);
    },
    getSimsonLevelById: (id) => globalThis.CCPLevelProfile.getLevelById(id),
    t: (k) => k,
    getLang: () => 'en',
    showMessage: () => {},
    saveData: () => {},
    invalidateScheduleCache: () => {}
};
CM.initTab(hooks, {});

const row = (teacher, day, start, cohort, subject) => ({ teacherName: teacher, day, start, end: '', cohortName: cohort, subject });
const tms = {
    placements: [
        row('Kim', 'tue', '14:30', 'BlueT^2609', 'Reading'),
        row('Kim', 'thu', '14:30', 'BlueT^2609', 'Reading'),
        row('Lee', 'tue', '15:20', 'BlueT^2609', 'Animation'),
        row('Lee', 'thu', '15:20', 'BlueT^2609', 'Animation'),
        // One teacher, one slot, two cohorts: a combined class.
        row('Park', 'tue', '16:10', 'BlueT^2609', 'Grammar'),
        row('Park', 'tue', '16:10', 'NavyT^2609', 'Grammar'),
        row('Park', 'thu', '16:10', 'BlueT^2609', 'Grammar'),
        row('Park', 'thu', '16:10', 'NavyT^2609', 'Grammar'),
        // Twice on Tuesday; shared with a TMS class that is not in this calendar.
        row('Choi', 'tue', '17:00', 'BlueT^2609', 'News'),
        row('Choi', 'tue', '18:00', 'BlueT^2609', 'News'),
        row('Choi', 'tue', '17:00', 'GreenT^2609', 'News'),
        // Another term: ignored.
        row('Kim', 'fri', '14:30', 'BlueT^2612', 'Debate')
    ]
};

/* ---------- TMS plan for one cohort ---------- */
const blue = appData.cohorts[0];
const plan = I.planCohortSubjectsFromTms(appData, tms, blue, { term: '2609' });
assert.equal(plan.term, '2609');
const byKey = Object.fromEntries(plan.subjects.map((s) => [s.subjectKey, s]));
assert.deepEqual(Object.keys(byKey).sort(), ['animation', 'grammar', 'news', 'reading']);
assert.deepEqual(byKey.reading.placements, [{ dow: 2, period: 1 }, { dow: 4, period: 1 }]);
assert.equal(byKey.reading.teacher, 'Kim');
assert.equal(byKey.reading.teacherProfile.userId, 'u-kim');
assert.deepEqual(byKey.grammar.partners.map((p) => p.cohortId), ['co-n']);
assert.deepEqual(byKey.news.placements, [{ dow: 2, period: 4 }, { dow: 2, period: 5 }]);
assert.deepEqual(byKey.news.partnersNotInCalendar, ['GreenT']);

/* ---------- preview, then apply ---------- */
const gen = CM.planCohortGeneration(blue, { kind: 'tms', plan });
const how = Object.fromEntries(gen.rows.map((r) => [r.slot.subjectKey, r.how]));
assert.deepEqual(how, { reading: 'update', animation: 'link', grammar: 'share', news: 'create' });
assert.equal(appData.classes.length, 3, 'planning changes nothing');

const res = CM.applyCohortGeneration(blue, gen, gen.rows);
assert.deepEqual(res, { created: 1, updated: 1, linked: 2 });
const k = (id) => appData.classes.find((c) => c.id === id);
assert.deepEqual(k('k-read').placements, [{ dow: 2, period: 1 }, { dow: 4, period: 1 }]);
assert.equal(k('k-read').classTeachers[0].userId, 'u-kim');
assert.deepEqual(TT.getClassCohortIds(k('k-anim')), ['co-b']);
assert.deepEqual(TT.getClassCohortIds(k('k-gram')).sort(), ['co-b', 'co-n']);
const news = appData.classes.find((c) => c.name === 'BlueT · News');
assert.ok(news, 'new class named after the cohort');
assert.equal(news.weeklyFrequency, 2);
assert.deepEqual(news.meetingDays, [2]);
assert.ok(appData.cohorts[1].classIds.includes('k-gram'), 'partner cohort links refreshed');

// Running it again finds the same classes: nothing new.
const again = CM.planCohortGeneration(blue, { kind: 'tms', plan });
assert.ok(again.rows.every((r) => r.how === 'update'), 'second run only updates');

/* ---------- level schedule fallback from a TMS-style name ---------- */
const vicci = appData.cohorts[2];
assert.equal(CM.resolveMatrixLevel(vicci), '빅키');
const vGen = CM.planCohortGeneration(vicci, { kind: 'matrix' });
assert.deepEqual(vGen.rows.map((r) => r.slot.subjectTrack).sort(), ['debate|rc', 'grammar', 'news', 'rc']);
assert.ok(vGen.rows.every((r) => r.how === 'create'));
const s1 = appData.cohorts[3];
assert.equal(CM.resolveMatrixLevel(s1), 'S1');
const sGen = CM.planCohortGeneration(s1, { kind: 'matrix' });
assert.deepEqual(sGen.rows.map((r) => r.slot.subjectTrack).sort(), ['grammar', 'lc|voca', 'rc']);
// Pre-Basic Tue/Thu has Grammar twice on Tuesday: the class plans 3 periods a week on 2 days.
s1.schedulePattern = 'tth';
s1.meetingDays = [2, 4];
s1.subjectSlots = [];
const tGen = CM.planCohortGeneration(s1, { kind: 'matrix' });
const gRow = tGen.rows.find((r) => r.slot.subjectTrack === 'grammar');
assert.equal(gRow.slot.placements.length, 3);
CM.applyCohortGeneration(s1, tGen, [gRow]);
assert.equal(appData.classes.find((c) => c.id === gRow.slot.classId).weeklyFrequency, 3);

/* ---------- either/or subjects, picked per cohort ---------- */
{
    // Picking RC: the Fri period joins the RC class (one class, 3 periods).
    const vRows = vGen.rows;
    vRows.find((r) => r.slot.subjectTrack === 'debate|rc').choice = 'rc';
    const before = appData.classes.length;
    CM.applyCohortGeneration(vicci, vGen, vRows);
    const rcCls = appData.classes.find((c) => c.name === '\uBE45\uD0A4T \u00B7 RC');
    assert.ok(rcCls, 'RC class made');
    assert.equal(appData.classes.length - before, 3, 'news, grammar, rc: no separate class for the either/or slot');
    assert.deepEqual(rcCls.periodByWeekday, { 2: 2, 4: 3 });
    assert.ok(!appData.classes.some((c) => /Debate/.test(c.name) && TT.getClassCohortIds(c).includes('co-v')));
    // Another cohort picks Debate: its own Debate class on Fri P2.
    const yuma = { id: 'co-y', name: '\uC720\uB9C8M', meetingDays: [1, 3, 5], schedulePattern: 'mwf', students: [] };
    appData.cohorts.push(yuma);
    const yGen = CM.planCohortGeneration(yuma, { kind: 'matrix' });
    yGen.rows.find((r) => r.slot.subjectTrack === 'debate|rc').choice = 'debate';
    CM.applyCohortGeneration(yuma, yGen, yGen.rows);
    const deb = appData.classes.find((c) => c.name === '\uC720\uB9C8M \u00B7 Debate');
    assert.ok(deb, 'Debate class made');
    assert.equal(deb.classTypeId, 'builtin-debate');
    assert.deepEqual(deb.periodByWeekday, { 5: 2 });
    // Run again: the either/or row finds the Debate class and nothing new is made.
    const yAgain = CM.planCohortGeneration(yuma, { kind: 'matrix' });
    assert.ok(yAgain.rows.every((r) => r.how === 'update'), 'second run only updates');
}

/* ---------- batch: every cohort at once, shared classes made once ---------- */
{
    const fresh = [
        { id: 'co-p', name: 'PinkT^2609', meetingDays: [2, 4], schedulePattern: 'tth', students: [] },
        { id: 'co-q', name: 'TealT^2609', meetingDays: [2, 4], schedulePattern: 'tth', students: [] }
    ];
    appData.cohorts.push(...fresh);
    const body = { placements: [
        row('Han', 'tue', '14:30', 'PinkT^2609', 'Grammar'),
        row('Han', 'tue', '14:30', 'TealT^2609', 'Grammar'),
        row('Han', 'thu', '14:30', 'PinkT^2609', 'Grammar'),
        row('Han', 'thu', '14:30', 'TealT^2609', 'Grammar'),
        row('Seo', 'tue', '15:20', 'TealT^2609', 'News')
    ] };
    const plans = CM.planBatchGeneration(fresh, body);
    assert.equal(plans.length, 2);
    assert.ok(plans.every((p) => p.generation && !p.hasClasses));
    const before = appData.classes.length;
    const total = CM.applyBatchGeneration(plans.map((p) => ({
        cohort: p.cohort,
        rows: p.generation.rows.map((r) => ({ track: r.slot.subjectTrack, choice: '' }))
    })), body);
    assert.equal(total.cohorts, 2);
    assert.equal(appData.classes.length - before, 2, 'one shared Grammar class + Teal News');
    const shared = appData.classes.find((c) => c.name === 'PinkT + TealT \u00B7 Grammar');
    assert.ok(shared, 'shared class named for both cohorts');
    assert.deepEqual(TT.getClassCohortIds(shared).sort(), ['co-p', 'co-q']);
    assert.ok(fresh[1].subjectSlots.some((sl) => sl.classId === shared.id), 'Teal row points at the shared class');
}

/* ---------- Migrate to next term: classes built on the unsaved new calendar, curriculum from last term ---------- */
{
    const prevData = {
        cohorts: [{ id: 'old-p', name: 'PinkT^2606' }],
        classes: [{ id: 'old-g', name: 'PinkT · Grammar', cohortIds: ['old-p'], tmsSubject: 'grammar',
            curriculumId: 'cur-gram', book: 'Grammar 2', startDate: '2026-06-01' }]
    };
    const draft = {
        cohorts: [
            { id: 'new-p', name: 'PinkT^2609', meetingDays: [2, 4], schedulePattern: 'tth', students: [] },
            { id: 'new-q', name: 'TealT^2609', meetingDays: [2, 4], schedulePattern: 'tth', students: [] }
        ],
        classes: []
    };
    const body = { placements: [
        row('Han', 'tue', '14:30', 'PinkT^2609', 'Grammar'),
        row('Han', 'tue', '14:30', 'TealT^2609', 'Grammar'),
        row('Seo', 'thu', '15:20', 'TealT^2609', 'News')
    ] };
    const liveBefore = appData.classes.length;
    const copied = CM.withAppData(draft, () => {
        const plans = CM.planBatchGeneration(draft.cohorts, body, { term: '2609' });
        CM.applyBatchGeneration(plans.map((p) => ({
            cohort: p.cohort,
            rows: p.generation.rows.map((r) => ({ track: r.slot.subjectTrack, choice: '' }))
        })), body, { term: '2609' });
        return CM.copyCurriculumFromPrevious(draft.classes, prevData, (id) => (id === 'new-p' ? 'old-p' : ''),
            (k) => Object.assign({}, k, { startDate: '2026-09-01' }));
    });
    assert.equal(appData.classes.length, liveBefore, 'the open calendar is not touched');
    assert.equal(draft.classes.length, 2, 'shared Grammar + Teal News');
    const gram = draft.classes.find((c) => TT.getClassCohortIds(c).length === 2);
    assert.ok(gram, 'Grammar shared by both new cohorts');
    assert.equal(gram.curriculumId, 'cur-gram');
    assert.equal(gram.startDate, '2026-09-01', 'dates moved by the term shift');
    assert.equal(gram.curriculumCarriedFrom, 'old-g');
    assert.equal(copied, 1);
}

/* ---------- Migrate wizard: cohorts that appear only on teacher timetables ---------- */
{
    await import(pathToFileURL(path.join(root, 'js', 'term-migrate-wizard.js')).href);
    const W = globalThis.CCPTermMigrateWizard;
    const extra = W.scheduleOnlyCohorts([{ cohortName: 'PinkT^2609' }], { placements: [
        { cohortName: 'PinkT^2609', day: 'tue' },
        { cohortName: 'GoldT^2609', day: 'tue' },
        { cohortName: 'GoldT^2609', day: 'thu' },
        { cohortName: 'Test class', day: 'mon' },
        { cohortName: 'TestT^2609', day: 'mon' }
    ] });
    assert.equal(extra.length, 1);
    assert.equal(extra[0].cohortName, 'GoldT^2609');
    assert.deepEqual(extra[0].scheduleDays, [2, 4]);
    assert.ok(extra[0].fromSchedule && extra[0].students.length === 0);
}

console.log('cohort-generate-subjects tests passed');
