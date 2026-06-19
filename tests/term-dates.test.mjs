/**
 * Run: node tests/term-dates.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'term-dates.js')).href);

const api = globalThis.CCPTermDates;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const config = { defaultTermCalendarMonths: 3, minTermMonthCount: 3, maxTermMonthCount: 6 };

assert(api.normalizeTermStartDate('2026-03') === '2026-03-01', 'month migrates to first day');
assert(api.normalizeTermStartDate('2026-03-15') === '2026-03-15', 'full date preserved');

const migrated = { termStart: '2026-03', termMonthCount: 3 };
api.migrateTermFields(migrated, config);
assert(migrated.termStart === '2026-03-01', 'migrate termStart');
assert(migrated.termEnd === '2026-05-31', 'migrate termEnd from month count');
assert(migrated.useAutoTermEnd === true, 'migrate useAutoTermEnd default');

const range = api.getTermDateRangeISO({
    termStart: '2026-03-15',
    termEnd: '2026-06-10',
    useAutoTermEnd: false
}, config);
assert(range.start === '2026-03-15' && range.end === '2026-06-10', 'manual term range');

const autoRange = api.getTermDateRangeISO({
    termStart: '2026-03-15',
    termMonthCount: 3,
    useAutoTermEnd: true
}, config);
assert(autoRange.end === '2026-05-31', 'auto end uses calendar months from start month');

const exactEnd = api.computeTermEndDateExactMonths('2026-03-15', 3);
assert(api.formatDateForInput(exactEnd) === '2026-06-14', 'exact months end date');

const span = api.getTermCalendarMonthSpan({
    termStart: '2026-03-15',
    termEnd: '2026-06-10',
    useAutoTermEnd: false
}, config);
assert(span === 4, 'month span includes partial Mar–Jun');

assert(api.isDateInTermRange('2026-03-01', {
    termStart: '2026-03-15',
    termEnd: '2026-06-10',
    useAutoTermEnd: false
}, config) === false, 'before term start is out of range');

console.log('term-dates.test.mjs: all assertions passed');
