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
    assert.deepEqual(slot('S2', 'tth', 3).byWeekday, { 2: 'grammar', 4: 'lc' });
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
assert.deepEqual(vGen.rows.map((r) => r.slot.subjectTrack).sort(), ['debate', 'grammar', 'news', 'rc']);
assert.ok(vGen.rows.every((r) => r.how === 'create'));
const s1 = appData.cohorts[3];
assert.equal(CM.resolveMatrixLevel(s1), 'S1');
const sGen = CM.planCohortGeneration(s1, { kind: 'matrix' });
assert.deepEqual(sGen.rows.map((r) => r.slot.subjectTrack).sort(), ['grammar', 'lc', 'rc']);
// Pre-Basic Tue/Thu has Grammar twice on Tuesday: the class plans 3 periods a week on 2 days.
s1.schedulePattern = 'tth';
s1.meetingDays = [2, 4];
s1.subjectSlots = [];
const tGen = CM.planCohortGeneration(s1, { kind: 'matrix' });
const gRow = tGen.rows.find((r) => r.slot.subjectTrack === 'grammar');
assert.equal(gRow.slot.placements.length, 3);
CM.applyCohortGeneration(s1, tGen, [gRow]);
assert.equal(appData.classes.find((c) => c.id === gRow.slot.classId).weeklyFrequency, 3);

console.log('cohort-generate-subjects tests passed');
