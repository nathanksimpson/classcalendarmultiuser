/**
 * Build test calendars from a TMS schedule scrape (cohort catalogue + term placements).
 *
 *   node scripts/make-tms-sample-calendar.mjs <scrape.json> [outDir]
 *
 * scrape.json = { "term": {"start","end"}, "branch": "...", "cohorts": [{"t": "가람M^2609[정규 초등_Intermediate_월수금]=>Debate"}],
 *                 "extraTeachers": ["name"], "placements": [{"teacher","day":"mon".."fri","start":"15:20","end":"16:10","cohort","subject"}] }
 *
 * Writes two calendars (load either with Data > Import calendar, or as a calendar in the local app):
 *   TMS-<branch>-scheduled.json    classes carry the teachers and times TMS has now (period = nearest period start)
 *   TMS-<branch>-to-schedule.json  the same cohorts, classes, teachers and rooms with NO times or teachers,
 *                                  ready for Auto-schedule
 *
 * The output contains real teacher and cohort names. Keep it out of git (the repo rule: fixtures never hold real names).
 * Read-only on everything: nothing here talks to TMS.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const inFile = process.argv[2];
if (!inFile) { console.error('usage: node scripts/make-tms-sample-calendar.mjs <scrape.json> [outDir]'); process.exit(1); }
const outDir = process.argv[3] || path.dirname(path.resolve(inFile));
const scrape = JSON.parse(fs.readFileSync(inFile, 'utf8'));

globalThis.window = globalThis;
for (const f of ['schedule-matrix-data.js', 'timetable-periods.js', 'teacher-timetable.js', 'level-profile.js', 'planner/teacher-planner-core.js']) {
    await import(pathToFileURL(path.join(root, 'js', f)).href);
}
const P = globalThis.CCPTeacherPlanner;
const LP = globalThis.CCPLevelProfile;
const TT = globalThis.CCPTeacherTimetable;

let idn = 0;
const id = (p) => `${p}-${(++idn).toString(36).padStart(4, '0')}`;
const DOW = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };
const term = scrape.term || { start: '2026-09-01', end: '2026-11-30' };
const KO_LEVEL = { 가람: 'Garam', 샘물: 'Saemmul', 여울: 'Yeoul', 바다: 'Bada', 별마루: 'Byeolmaru', 미리내: 'Mirinae' };
const COLORS = { Red: '#e5484d', Orange: '#f76b15', Yellow: '#e2a400', Green: '#30a46c', Blue: '#3e63dd', Navy: '#1e3a8a', Purple: '#8e4ec6', Yeoul: '#fb923c', Saemmul: '#0ea5e9', Garam: '#16a34a', Bada: '#15803d', Byeolmaru: '#0f766e', Mirinae: '#115e59' };
const textOn = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6 ? '#1c2430' : '#ffffff'; };

/** "가람M^2609[정규 초등_Intermediate_월수금]=>Debate" -> parts. */
function parseCohort(t) {
    const m = String(t).match(/^(.*?)\[(.*?)_(.*?)_(.*?)\]\s*(?:=>\s*(.*))?$/);
    if (!m) return null;
    const name = m[1].trim().replace(/\^.*$/, '');
    const day = m[4].replace(/\s/g, '');
    const pattern = day === '월수금' ? 'mwf' : day === '화목' ? 'tth' : '';
    const base = name.replace(/[MT]$/, '');
    const level = KO_LEVEL[base] || (LP.getLevelById && LP.getLevelById(base) ? base : base);
    return { key: m[1].trim(), name, level, tmsLevel: m[3], middle: m[2].includes('중등'), pattern, defaultSubject: (m[5] || '').trim() };
}

/** Nearest period whose start is closest to the class start (default slot map: 14:30,15:20,16:10,17:00,...). */
const slots = TT.getDefaultTimetableTimeSlots();
const map = TT.getDefaultPeriodSlotMap();
const mins = (s) => { const [a, b] = s.split(':').map(Number); return a * 60 + b; };
function periodFor(start) {
    let best = null;
    Object.keys(map).forEach((p) => {
        const slot = slots.find((s) => s.id === map[p]);
        if (!slot) return;
        const d = Math.abs(mins(slot.start) - mins(start));
        if (!best || d < best.d) best = { d, p: Number(p) };
    });
    return best.p;
}

const cohortInfo = (scrape.cohorts || []).map((c) => parseCohort(c.t)).filter(Boolean);
const byKey = new Map(cohortInfo.map((c) => [c.key, c]));
const placements = (scrape.placements || []).filter((p) => byKey.has(p.cohort));

const ROOM = { id: 'rm-1', name: scrape.room || '1강의실', capacity: 30, sortOrder: 1 };
// extraTeachers: staff who exist in TMS but have no classes in this scrape (still need a profile to receive classes).
const teacherNames = [...new Set(placements.map((p) => p.teacher).concat(scrape.extraTeachers || []))].sort();
const nativeNames = new Set(scrape.nativeTeachers || ['Nathan']);
const teachers = teacherNames.map((name, i) => P.defaultTeacherProfile({
    id: `tp-${i + 1}`, userId: `tms-teacher-${i + 1}`, name, role: nativeNames.has(name) ? 'native' : 'korean',
    limits: { maxPeriodsPerWeek: 22, maxPeriodsPerDay: 6 }
}));

function build(withTimes) {
    idn = 0;
    const cohorts = [];
    const classes = [];
    cohortInfo.forEach((ci) => {
        const mine = placements.filter((p) => p.cohort === ci.key);
        if (!mine.length) return; // cohort has no timetable in this branch/term
        const color = COLORS[ci.level] || (ci.middle ? '#ba7517' : '#64748b');
        const days = ci.pattern === 'mwf' ? [1, 3, 5] : [2, 4];
        const cohort = {
            id: id('co'), name: ci.name, level: ci.level, levelPreset: ci.level, grade: '', schedulePattern: ci.pattern, meetingDays: days,
            scheduleBlock: LP.defaultScheduleBlockForLevel(ci.level) || (ci.middle ? 'secondary' : 'primary'), blockDefaultV: 1, color,
            homeroomTeacherName: '', homeroomDaySuffix: ci.pattern === 'mwf' ? 'M' : 'T', classIds: [], subjectSlots: [], students: []
        };
        // one class per subject (and teacher) the cohort has in TMS
        const groups = new Map();
        mine.forEach((p) => { const k = p.subject + '|' + p.teacher; (groups.get(k) || groups.set(k, []).get(k)).push(p); });
        groups.forEach((list, k) => {
            const [subject, teacher] = k.split('|');
            const cls = {
                id: id('cl'), name: `${ci.name} · ${subject}`, levelPreset: ci.level, level: ci.level, grade: '', cohortId: cohort.id,
                cohortIds: [cohort.id], classTypeId: '', scheduleBlock: cohort.scheduleBlock, meetingDays: [], weeklyFrequency: list.length,
                teacherRequirementType: nativeNames.has(teacher) ? 'native' : 'either', classTeachers: [], color, textColor: textOn(color),
                startDate: term.start, endDate: term.end, useAutoTermEnd: false, generatedFromCohort: true, notes: ''
            };
            cohort.classIds.push(cls.id);
            classes.push(Object.assign(cls, { _list: list, _teacher: teacher }));
        });
        cohorts.push(cohort);
    });
    const cal = {
        schemaVersion: 3, calendarName: `TMS ${scrape.branch || ''} · ${withTimes ? 'current schedule' : 'to schedule'}`.replace('  ', ' '),
        termStart: term.start, termEnd: term.end, useAutoTermEnd: false, termMonthCount: 3,
        classes, events: [], cohorts, timetableTimeSlots: slots, periodSlotMap: map, rooms: [JSON.parse(JSON.stringify(ROOM))],
        teacherProfiles: JSON.parse(JSON.stringify(teachers)), plannerDrafts: [], plannerState: null
    };
    P.ensurePlannerFields(cal);
    if (withTimes) {
        const draft = { id: 'draft-tms', label: 'TMS current', status: 'ready', assignments: [], issues: [], metrics: {} };
        classes.forEach((cls) => {
            const prof = teachers.find((t) => t.name === cls._teacher);
            const seen = new Set();
            const meetings = [];
            cls._list.forEach((p) => {
                const dow = DOW[p.day], period = String(periodFor(p.start));
                if (seen.has(dow + '|' + period)) return;
                seen.add(dow + '|' + period);
                meetings.push({ meetingId: id('mtg'), dow, period });
            });
            draft.assignments.push({ assignmentId: id('asg'), demandId: 'demand:' + cls.id, classId: cls.id, teacherProfileId: prof ? prof.id : null,
                userId: prof ? prof.userId : null, roomId: null, meetings, locked: false, manualKeep: true, source: 'imported' });
        });
        P.applyDraftToAppData(cal, draft, { allowMissingUserId: true, replaceFirstTeacher: true });
        // homeroom = teacher with most periods in the cohort
        cal.cohorts.forEach((c) => {
            const load = new Map();
            cal.classes.filter((k) => k.cohortId === c.id).forEach((k) => { const t = (k.classTeachers || [])[0]; if (t) load.set(t.name, (load.get(t.name) || 0) + (k.weeklyFrequency || 1)); });
            const top = [...load.entries()].sort((a, b) => b[1] - a[1])[0];
            if (top) c.homeroomTeacherName = top[0];
        });
        cal.plannerDrafts = [];
    }
    // The academy day starts at 15:20 (period 2); period 1 (14:30) is not used.
    P.ensurePlannerFields(cal);
    cal.plannerState.blockouts = Object.assign({}, cal.plannerState.blockouts, { globalUnavailablePeriods: ['1'] });
    cal.classes.forEach((k) => { delete k._list; delete k._teacher; });
    return cal;
}

function report(cal, label) {
    P.ensurePlannerFields(cal);
    const draft = P.seedDraftFromCalendar(cal, { label: 'check' });
    P.recomputeDraftMetrics(cal, draft);
    const count = {};
    draft.issues.forEach((i) => { count[i.code] = (count[i.code] || 0) + 1; });
    const placed = draft.assignments.reduce((n, a) => n + (a.meetings || []).length, 0);
    console.log(`${label}: ${cal.cohorts.length} cohorts, ${cal.classes.length} classes, ${cal.classes.reduce((n, c) => n + c.weeklyFrequency, 0)} periods/week, ${placed} placed`);
    console.log('  issues', JSON.stringify(count));
}

const branch = String(scrape.branch || 'branch').replace(/[^\w가-힣-]+/g, '');
fs.mkdirSync(outDir, { recursive: true });
const scheduled = build(true), toSchedule = build(false);
report(scheduled, 'scheduled'); report(toSchedule, 'to-schedule');
fs.writeFileSync(path.join(outDir, `TMS-${branch}-scheduled.json`), JSON.stringify(scheduled, null, 1));
fs.writeFileSync(path.join(outDir, `TMS-${branch}-to-schedule.json`), JSON.stringify(toSchedule, null, 1));
console.log('written to', outDir);
