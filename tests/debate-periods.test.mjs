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

console.log('debate-periods.test.mjs: all passed');
