/**
 * Run: node tests/debate-periods.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'debate-periods.js')).href);

const DP = globalThis.CCPDebatePeriods;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const classData = {
    startDate: '2026-01-06',
    endDate: '2026-03-31',
    book: 'Default Book',
    debateBookPeriods: [
        { id: 'p1', startDate: '2026-01-06', book: 'Book 1' },
        { id: 'p2', startDate: '2026-01-27', book: 'Book 2' },
        { id: 'p3', startDate: '2026-02-24', book: 'Book 3' }
    ]
};

assert(DP.getBookForDate(classData, '2026-01-20') === 'Book 1', 'before period 2 uses book 1');
assert(DP.getBookForDate(classData, '2026-01-27') === 'Book 2', 'on period 2 start uses book 2');
assert(DP.getBookForDate(classData, '2026-02-10') === 'Book 2', 'mid period 2 uses book 2');

const periods = DP.enumerateDebatePeriodsInTerm(classData);
assert(periods.length === 3, 'three periods in term');
assert(periods[0].rangeEndDate === '2026-01-26', 'period 1 ends day before period 2');
assert(periods[1].rangeStartDate === '2026-01-27', 'period 2 starts Jan 27');

const migrated = {
    startDate: '2026-01-06',
    endDate: '2026-04-30',
    book: 'Fallback',
    booksByMonth: {
        '2026-01': 'Jan Book',
        '2026-02': 'Feb Book'
    }
};
assert(DP.migrateBooksByMonthToPeriods(migrated) === true, 'migration runs once');
assert(migrated.debateBookPeriods.length === 2, 'two periods from booksByMonth');
assert(migrated.debateBookPeriods[0].book === 'Jan Book', 'jan book preserved');
assert(migrated.debateBookPeriods[0].startDate === '2026-01-06', 'jan start clamped to class start');
assert(migrated.debateBookPeriods[1].startDate === '2026-02-01', 'feb starts first of month');
assert(DP.migrateBooksByMonthToPeriods(migrated) === false, 'migration does not re-run');

const suggested = DP.suggestPeriodsFromCalendarMonths('2026-01-15', '2026-03-10', 'Same Book');
assert(suggested.length === 3, 'three calendar months suggested');
assert(suggested[0].startDate === '2026-01-15', 'first period uses class start not 1st');
assert(suggested[1].startDate === '2026-02-01', 'second period uses month start');

const normalized = DP.normalizeDebateBookPeriods({
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    book: 'X',
    debateBookPeriods: [
        { startDate: '2026-03-01', book: 'B' },
        { startDate: '2026-01-15', book: 'A' },
        { startDate: '2026-03-01', book: 'B-dup' }
    ]
});
assert(normalized.length === 2, 'duplicate start dates collapse');
assert(normalized[0].startDate === '2026-01-15', 'sorted by date');

// Multi-period schedule: saved debateBookPeriods must yield more than one Day 1–4 cycle
await import(pathToFileURL(path.join(root, 'js', 'schedule-core.js')).href);
const { CCPSchedule } = globalThis;

function parseISODateLocal(dateStr) {
    const parts = dateStr.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function countMeetingDaysInRange(rangeStartStr, rangeEndStr, meetingDays) {
    const set = new Set(meetingDays);
    const start = parseISODateLocal(rangeStartStr);
    const end = parseISODateLocal(rangeEndStr);
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
        if (set.has(cur.getDay())) {
            count += 1;
        }
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}

function simulateDebatePeriodLessonCount(classData, meetingDays, totalLessons = 4) {
    const periods = DP.enumerateDebatePeriodsInTerm(classData);
    let scheduled = 0;
    periods.forEach((period) => {
        const eligible = countMeetingDaysInRange(
            period.rangeStartDate,
            period.rangeEndDate,
            meetingDays
        );
        const { groups } = CCPSchedule.buildLessonGroups(totalLessons, []);
        scheduled += Math.min(groups.length, eligible);
    });
    return scheduled;
}

const debateClass = {
    startDate: '2026-01-06',
    endDate: '2026-03-31',
    book: 'Default Book',
    meetingDays: [1, 3, 5],
    totalLessons: 4,
    debateBookPeriods: [
        { id: 'p1', startDate: '2026-01-06', book: 'Book 1' },
        { id: 'p2', startDate: '2026-01-27', book: 'Book 2' },
        { id: 'p3', startDate: '2026-02-24', book: 'Book 3' }
    ]
};

const multiPeriodLessons = simulateDebatePeriodLessonCount(debateClass, debateClass.meetingDays);
assert(multiPeriodLessons > 4, 'multi-period granular schedule schedules more than one Day 1–4 cycle');

const collapsedClass = {
    startDate: debateClass.startDate,
    endDate: debateClass.endDate,
    book: debateClass.book,
    meetingDays: debateClass.meetingDays,
    totalLessons: 4,
    debateBookPeriods: []
};
DP.ensureDebateBookPeriodsForClass(collapsedClass);
const collapsedLessons = simulateDebatePeriodLessonCount(collapsedClass, debateClass.meetingDays);
assert(collapsedLessons <= 4, 'single fallback period schedules at most one Day 1–4 cycle');
assert(multiPeriodLessons > collapsedLessons, 'saved periods must out-schedule collapsed fallback');

{
    const oldPeriods = [
        { id: 'old-a', startDate: '2026-01-06', book: 'A' },
        { id: 'old-b', startDate: '2026-02-01', book: 'B' }
    ];
    const newPeriods = [
        { id: 'new-a', startDate: '2026-01-06', book: 'A' },
        { id: 'new-b', startDate: '2026-02-01', book: 'B' }
    ];
    const oldMap = { 'old-a': [1], 'old-b': [2] };
    const remapped = DP.remapCompressionMergesByPeriod(oldMap, oldPeriods, newPeriods);
    assert(Array.isArray(remapped['new-a']) && remapped['new-a'][0] === 1, 'remap keeps merges by startDate');
    assert(Array.isArray(remapped['new-b']) && remapped['new-b'][0] === 2, 'remap last period Day2+3 start');
    assert(!remapped['old-a'], 'old period ids are not kept');
}

{
    const oldPeriods = [{ id: 'x1', startDate: '2026-03-15', book: 'C' }];
    const newPeriods = [{ id: 'y1', startDate: '2026-03-01', book: 'C' }];
    const oldMap = { x1: [2] };
    const remapped = DP.remapCompressionMergesByPeriod(oldMap, oldPeriods, newPeriods);
    assert(Array.isArray(remapped.y1) && remapped.y1[0] === 2, 'remap falls back to month key');
}

assert(DP.isManualCompressionMode('manual') === true, 'manual is manual mode');
assert(DP.isManualCompressionMode('manualPerMonth') === true, 'per-period is manual mode');
assert(DP.isManualCompressionMode('autoWhenNeeded') === false, 'auto is not manual mode');

console.log('debate-periods.test.mjs: all passed');
