/**
 * Two fake sample calendars for the Schedule planner (no real names).
 *
 *   Fall 2026  – 21 cohorts, every class scheduled (days, periods, teacher, room).
 *   Winter 2027 – the next term: cohorts levelled up, same teachers and rooms,
 *                 classes created from the curriculum with no times or teachers.
 *
 * Subjects and how often they meet come from the level schedule matrix
 * (js/schedule-matrix-data.js). The Fall timetable is built with the planner's own
 * auto-schedule, so it follows the same rules the app checks.
 *
 * Run: node scripts/make-sample-calendars.mjs   (writes to "Example Calendars/")
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
for (const f of ['schedule-matrix-data.js', 'timetable-periods.js', 'teacher-timetable.js', 'level-profile.js',
    'planner/teacher-planner-core.js', 'planner/teacher-planner-auto.js']) {
    await import(pathToFileURL(path.join(root, 'js', f)).href);
}
const P = globalThis.CCPTeacherPlanner;
const A = globalThis.CCPPlannerAuto;
const LP = globalThis.CCPLevelProfile;
const MATRIX = globalThis.CCPScheduleMatrixData.slots;
const TT = globalThis.CCPTeacherTimetable;

/* ------------------------------------------------------------ helpers */
let seed = 20261114;
const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
};
let idn = 0;
const id = (p) => `${p}-${(++idn).toString(36).padStart(4, '0')}`;

const SUBJECTS = {
    phonics: { en: 'Phonics', need: 'korean' },
    reading: { en: 'Reading', need: 'korean' },
    spkWr: { en: 'Speaking & Writing', need: 'native', type: 'builtin-wr-sp' },
    animation: { en: 'Animation', need: 'either' },
    ipkV: { en: 'IPK V', need: 'korean' },
    news: { en: 'News', need: 'either' },
    newsLc: { en: 'News LC', need: 'either' },
    ipeNative: { en: 'IPE', need: 'native' },
    grammar: { en: 'Grammar', need: 'korean' },
    debate: { en: 'Debate', need: 'native', type: 'builtin-debate' },
    toeflRc: { en: 'TOEFL RC', need: 'korean' }
};
const COLORS = {
    Red: '#e5484d', Orange: '#f76b15', Yellow: '#e2a400', Green: '#30a46c', Blue: '#3e63dd', Navy: '#1e3a8a',
    Purple: '#8e4ec6', Yeoul: '#fb923c', Saemmul: '#0ea5e9', Garam: '#16a34a', Bada: '#15803d',
    Byeolmaru: '#0f766e', Mirinae: '#115e59'
};
const ORDER = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Navy', 'Purple', 'Yeoul', 'Saemmul', 'Garam', 'Bada', 'Byeolmaru', 'Mirinae'];
const textOn = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? '#1c2430' : '#ffffff';
};

/** Subjects and meeting count for a level on MWF or TT, from the matrix. */
function curriculum(level, pattern) {
    const out = new Map();
    MATRIX.filter((s) => s.level === level && s.patternId === pattern).forEach((s) => {
        Object.values(s.byWeekday).forEach((track) => out.set(track, (out.get(track) || 0) + 1));
    });
    return [...out.entries()].map(([track, perWeek]) => ({ track, perWeek }));
}

/* Fake names in the repo's fixture pattern (김테가 / (Stuaa)). */
const SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오'];
const GIV = '가나다라마바사아자차카타파하';
let sn = 0;
function student() {
    const n = sn++;
    const a = String.fromCharCode(97 + Math.floor(n / 26) % 26);
    const b = String.fromCharCode(97 + n % 26);
    return {
        id: id('st'),
        name: `${SUR[n % SUR.length]}테${GIV[Math.floor(n / SUR.length) % GIV.length]}`,
        nameEn: `Stu${a}${b}`,
        tmsMpidx: String(900000 + n),
        active: true,
        tags: [],
        memo: ''
    };
}

/* ------------------------------------------------------------ cohorts */
const FALL = [
    ['Red', 'mwf'], ['Orange', 'mwf'], ['Yellow', 'mwf'], ['Green', 'mwf'], ['Blue', 'mwf'], ['Navy', 'mwf'], ['Purple', 'mwf'],
    ['Orange', 'tth'], ['Yellow', 'tth'], ['Green', 'tth'], ['Purple', 'tth'],
    ['Yeoul', 'mwf'], ['Saemmul', 'mwf'], ['Garam', 'mwf'], ['Bada', 'mwf'], ['Byeolmaru', 'mwf'],
    ['Yeoul', 'tth'], ['Saemmul', 'tth'], ['Garam', 'tth'], ['Mirinae', 'tth'], ['Byeolmaru', 'tth']
];
const SIZES = [6, 7, 7, 6, 5, 7, 6, 5, 6, 7, 6, 7, 7, 5, 6, 5, 8, 6, 5, 7, 6]; // 130 students

function makeCohort(level, pattern, students) {
    const days = pattern === 'mwf' ? [1, 3, 5] : [2, 4];
    const color = COLORS[level];
    return {
        id: id('co'),
        name: `${level} ${pattern === 'mwf' ? 'M' : 'T'}`,
        level,
        levelPreset: level,
        grade: '',
        schedulePattern: pattern,
        meetingDays: days,
        scheduleBlock: LP.defaultScheduleBlockForLevel(level),
        blockDefaultV: 1,
        color,
        homeroomTeacherName: '',
        homeroomDaySuffix: pattern === 'mwf' ? 'M' : 'T',
        classIds: [],
        subjectSlots: [],
        students: students.map((s, i) => Object.assign({}, s, { id: id('st'), sortOrder: i }))
    };
}

function makeClasses(cohort, term) {
    const pattern = cohort.schedulePattern;
    return curriculum(cohort.levelPreset, pattern).map(({ track, perWeek }) => {
        const sub = SUBJECTS[track];
        const cls = {
            id: id('cl'),
            name: `${cohort.name} · ${sub.en}`,
            levelPreset: cohort.levelPreset,
            level: cohort.levelPreset,
            grade: '',
            cohortId: cohort.id,
            cohortIds: [cohort.id],
            classTypeId: sub.type || '',
            scheduleBlock: cohort.scheduleBlock,
            meetingDays: [],
            weeklyFrequency: perWeek,
            teacherRequirementType: sub.need,
            classTeachers: [],
            color: cohort.color,
            textColor: textOn(cohort.color),
            startDate: term.start,
            endDate: term.end,
            useAutoTermEnd: false,
            generatedFromCohort: true,
            notes: ''
        };
        cohort.classIds.push(cls.id);
        return cls;
    });
}

/* ------------------------------------------------------------ teachers & rooms */
const TEACHERS = [
    ['김테하', 'korean'], ['박테라', 'korean'], ['이테소', 'korean'],
    ['Ava Testa', 'native'], ['Ben Tello', 'native'], ['Cal Teague', 'native']
].map(([name, role]) => P.defaultTeacherProfile({
    id: id('tp'),
    name,
    role,
    limits: { maxPeriodsPerWeek: 22, maxPeriodsPerDay: 6 }
}));
const ROOMS = ['201', '202', '203', '204', '205', '206', '207'].map((n, i) => ({
    id: id('rm'), name: `Room ${n}`, capacity: i < 2 ? 6 : 10, sortOrder: i + 1
}));

function baseCalendar(name, term, cohorts, classes) {
    return {
        schemaVersion: 3,
        calendarName: name,
        termStart: term.start,
        termEnd: term.end,
        useAutoTermEnd: false,
        termMonthCount: 3,
        classes,
        events: [],
        cohorts,
        timetableTimeSlots: TT.getDefaultTimetableTimeSlots(),
        periodSlotMap: TT.getDefaultPeriodSlotMap(),
        rooms: JSON.parse(JSON.stringify(ROOMS)),
        teacherProfiles: JSON.parse(JSON.stringify(TEACHERS)),
        plannerDrafts: [],
        plannerState: null
    };
}

/* ------------------------------------------------------------ Fall: built */
const fallTerm = { start: '2026-09-01', end: '2026-11-30' };
const roster = SIZES.map((n) => Array.from({ length: n }, student));
const fallCohorts = FALL.map(([lvl, pat], i) => makeCohort(lvl, pat, roster[i]));
const fallClasses = fallCohorts.flatMap((c) => makeClasses(c, fallTerm));
const fall = baseCalendar('Sample · Fall 2026 (scheduled)', fallTerm, fallCohorts, fallClasses);
P.ensurePlannerFields(fall);

const empty = { id: 'draft-fall', label: 'Fall plan', assignments: [], issues: [], metrics: {} };
let best = null;
A.buildOptions(fall, empty, undefined).forEach((o) => {
    const score = o.result.unplaced.length * 1000 + o.stats.holes;
    if (!best || score < best.score) best = { o, score };
});
const plan = best.o;
if (plan.result.unplaced.length) {
    console.error('Fall could not be fully placed:', plan.result.unplaced.map((u) => fallClasses.find((c) => 'demand:' + c.id === u.demandId).name));
    const loads = {};
    plan.draft.assignments.forEach((a) => { loads[a.teacherProfileId] = (loads[a.teacherProfileId] || 0) + a.meetings.length; });
    console.error(JSON.stringify(TEACHERS.map((t) => [t.name, loads[t.id] || 0])));
    process.exit(1);
}
const applied = P.applyDraftToAppData(fall, plan.draft, { allowMissingUserId: true, replaceFirstTeacher: true });
// Homeroom: the Korean teacher with the most periods in the cohort.
fallCohorts.forEach((c) => {
    const load = new Map();
    fallClasses.filter((cls) => cls.cohortId === c.id).forEach((cls) => {
        const t = (cls.classTeachers || [])[0];
        if (!t) return;
        const prof = TEACHERS.find((p) => p.name === t.name);
        if (!prof || prof.role !== 'korean') return;
        load.set(t.name, (load.get(t.name) || 0) + (cls.weeklyFrequency || 1));
    });
    const top = [...load.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) c.homeroomTeacherName = top[0];
});
fall.plannerDrafts = [];
fall.plannerState = null;

/* ------------------------------------------------------------ Winter: not built */
const next = (lvl) => ORDER[ORDER.indexOf(lvl) + 1];
const winterTerm = { start: '2026-12-01', end: '2027-02-28' };
const winterCohorts = [];
fallCohorts.forEach((c) => {
    const up = next(c.levelPreset);
    if (!up || up === 'Yeoul' && false) return;
    // A few students stay behind or leave; everyone else moves up together.
    const moving = c.students.filter(() => rand() > 0.12);
    winterCohorts.push({ level: up, pattern: c.schedulePattern, students: moving.map(({ id: _x, sortOrder: _y, ...s }) => s) });
});
// Top cohorts (Mirinae) move on to middle school; a new Red cohort starts.
const kept = winterCohorts.filter((w) => ORDER.includes(w.level));
kept.unshift({ level: 'Red', pattern: 'mwf', students: Array.from({ length: 6 }, student) });
// Merge cohorts that land on the same level and days.
const merged = new Map();
kept.forEach((w) => {
    const key = `${w.level}|${w.pattern}`;
    if (!merged.has(key)) merged.set(key, { level: w.level, pattern: w.pattern, students: [] });
    merged.get(key).students.push(...w.students);
});
// A few new students join existing cohorts.
const wCohorts = [...merged.values()].map((w) => {
    if (rand() < 0.4) w.students.push(student());
    return makeCohort(w.level, w.pattern, w.students);
});
const wClasses = wCohorts.flatMap((c) => makeClasses(c, winterTerm));
const winter = baseCalendar('Sample · Winter 2027 (to schedule)', winterTerm, wCohorts, wClasses);

/* ------------------------------------------------------------ checks */
function report(cal, label) {
    P.ensurePlannerFields(cal);
    const draft = P.seedDraftFromCalendar(cal, { label: 'check' });
    P.recomputeDraftMetrics(cal, draft);
    const loads = {};
    draft.assignments.forEach((a) => {
        const t = (cal.teacherProfiles.find((p) => p.id === a.teacherProfileId) || {}).name || '—';
        loads[t] = (loads[t] || 0) + (a.meetings || []).length;
    });
    const count = (codes) => draft.issues.filter((i) => codes.includes(i.code)).length;
    const students = cal.cohorts.reduce((n, c) => n + c.students.length, 0);
    const periods = cal.classes.reduce((n, c) => n + c.weeklyFrequency, 0);
    console.log(`\n${label}: ${cal.cohorts.length} cohorts, ${students} students, ${cal.classes.length} classes, ${periods} periods a week`);
    console.log('  clashes', count(['teacher_double_booked', 'cohort_double_booked', 'room_conflict']),
        '| incomplete', count(['incomplete_placements']), '| no teacher', count(['no_teacher']),
        '| outside hours/days', count(['outside_band_block', 'outside_cohort_days']),
        '| long runs', count(['long_run']), '| room too small', count(['room_too_small']));
    console.log('  teacher periods', JSON.stringify(loads));
    draft.issues.filter((i) => ['teacher_double_booked', 'cohort_double_booked', 'room_conflict'].includes(i.code)).slice(0, 6)
        .forEach((i) => console.log('   ', i.code, i.message));
    return { draft, students, periods };
}
report(fall, 'Fall (scheduled)');
report(winter, 'Winter (to schedule)');
console.log('\nWinter levels:', wCohorts.map((c) => `${c.name}(${c.students.length})`).join(', '));

const outDir = path.join(root, 'Example Calendars');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'Sample-Fall-2026-scheduled.json'), JSON.stringify(fall, null, 1));
fs.writeFileSync(path.join(outDir, 'Sample-Winter-2027-to-schedule.json'), JSON.stringify(winter, null, 1));
console.log('\nWritten to Example Calendars/');
