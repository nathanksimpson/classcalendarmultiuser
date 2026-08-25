/**
 * Run: node tests/perf-eval-windows.test.mjs
 */
import assert from 'assert';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(pathToFileURL(path.join(root, 'js', 'perf-eval-windows.js')).href);

const api = globalThis.CCPPerfEvalWindows;
assert(api, 'CCPPerfEvalWindows loaded');

const cls = { id: 'c1', name: 'Blue', grade: 'M1', endDate: '2026-06-15' };
const other = { id: 'c2', name: 'Red', grade: 'E3', endDate: '2026-06-20' };

const events = [
    { type: 'perf_eval_open', date: '2026-05-01', classIds: [] },
    { type: 'perf_eval_close', date: '2026-05-20', classIds: [] },
    { type: 'perf_eval_reopen', date: '2026-05-25', classIds: [] },
    { type: 'perf_eval_finalized', date: '2026-06-01', classIds: [] },
    { type: 'perf_eval_close', date: '2026-05-15', classIds: ['c1'] },
    { type: 'holiday', date: '2026-05-05', classIds: [] }
];

assert(api.isPerfEvalEventType('perf_eval_close'), 'close is perf eval type');
assert(!api.isPerfEvalEventType('evaluation_deadline'), 'eval deadline is not perf eval type');

const win = api.resolvePerfEvalWindow(events, cls);
assert.strictEqual(win.open, '2026-05-01', 'open earliest');
assert.strictEqual(win.close, '2026-05-15', 'close uses earliest applicable (class-specific)');
assert.strictEqual(win.reopen, '2026-05-25', 'reopen');
assert.strictEqual(win.finalized, '2026-06-01', 'finalized');

const winOther = api.resolvePerfEvalWindow(events, other);
assert.strictEqual(winOther.close, '2026-05-20', 'other class gets school-wide close only');

const limits = api.essayDueLimits(cls, '2026-06-30', win);
assert.strictEqual(limits.maxSsDue, '2026-06-15', 'SS capped by class end before term end');
assert.strictEqual(limits.maxTeacherEvalDue, '2026-05-15', 'teacher eval capped by close');

const limitsNoClose = api.essayDueLimits(cls, '2026-06-10', { close: '', finalized: '' });
assert.strictEqual(limitsNoClose.maxSsDue, '2026-06-10', 'SS uses earlier term end');
assert.strictEqual(limitsNoClose.maxTeacherEvalDue, '2026-06-10', 'teacher eval follows SS when no close');

assert(api.debateScoringDateAfterClose('2026-05-22', '2026-05-20'), 'day after close');
assert(!api.debateScoringDateAfterClose('2026-05-20', '2026-05-20'), 'same day ok');
assert(!api.debateScoringDateAfterClose('2026-05-19', '2026-05-20'), 'before close ok');

const meetings = ['2026-05-12', '2026-05-14', '2026-05-19', '2026-05-21', '2026-05-26'];
assert.strictEqual(api.slotsBeforeClose(meetings, '2026-05-20'), 3, 'three slots on or before close');

assert.strictEqual(
    api.lastLessonDateInRange(['2026-05-05', '2026-05-12', '2026-05-19', '2026-05-26'], '2026-05-01', '2026-05-31'),
    '2026-05-26',
    'last in range'
);

const issues = api.debatePeriodsPastClose(
    [
        { id: 'p1', rangeStartDate: '2026-05-01', rangeEndDate: '2026-05-31', book: 'Book A' }
    ],
    ['2026-05-05', '2026-05-12', '2026-05-19', '2026-05-26'],
    '2026-05-20'
);
assert.strictEqual(issues.length, 1, 'one period past close');
assert.strictEqual(issues[0].lastLessonDate, '2026-05-26', 'last lesson after close');

const ok = api.debatePeriodsPastClose(
    [{ id: 'p1', rangeStartDate: '2026-05-01', rangeEndDate: '2026-05-31', book: 'Book A' }],
    ['2026-05-05', '2026-05-12', '2026-05-19'],
    '2026-05-20'
);
assert.strictEqual(ok.length, 0, 'no issue when day 4 on or before close');

const clamped = api.clampDueDate('2026-06-20', '2026-06-15');
assert.strictEqual(clamped.date, '2026-06-15', 'clamp down');
assert(clamped.clamped, 'marked clamped');

assert(api.essayLessonPastSsCap('2026-06-16', '2026-06-15'), 'lesson after SS cap');
assert(!api.essayLessonPastSsCap('2026-06-15', '2026-06-15'), 'lesson on cap ok');
assert(api.essayLessonPastClose('2026-05-21', '2026-05-20'), 'lesson after close');

console.log('perf-eval-windows.test.mjs: all passed');
