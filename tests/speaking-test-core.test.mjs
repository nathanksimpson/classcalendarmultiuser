/**
 * Run: node tests/speaking-test-core.test.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

function loadCore() {
    const sandbox = { window: {}, globalThis: {}, console };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    const code = readFileSync(
        path.join(root, 'js', 'speaking-test', 'speaking-test-core.js'),
        'utf8'
    );
    vm.runInNewContext(code, sandbox);
    return sandbox.CCPSpeakingTestCore;
}

const c = loadCore();
assert(c, 'CCPSpeakingTestCore loaded');
assert(c.RUBRIC_CATEGORIES.length === 5, '5 rubric categories');
assert(c.QUESTION_COUNT === 10, '10 questions');

assert(c.convertGradeToPoints('pronunciation', 'A') === 2, 'A pronunciation = 2');
assert(c.convertGradeToPoints('content', 'B') === 2.4, 'B content = 2.4');
assert(c.convertGradeToPoints('intonation', 'D') === 0.4, 'D intonation = 0.4');

const perfect = c.createDefaultScoreBreakdown();
assert(c.calculateQuestionTotal(perfect) === 10, 'all A = 10');

const mixed = {
    pronunciation: 'A',
    speed: 'B',
    intonation: 'A',
    grammar: 'C',
    content: 'A'
};
const mixedTotal = c.calculateQuestionTotal(mixed);
assert(Math.abs(mixedTotal - (2 + 1.5 + 1 + 1 + 3)) < 0.001, 'mixed question total');

const emptyAvg = c.calculateCategoryAverages([]);
assert(emptyAvg.totalSum === 0, 'empty averages total 0');
assert(emptyAvg.averages.pronunciation === 0, 'empty pronunciation avg 0');

const tenQs = Array.from({ length: 10 }, () => Object.assign({}, perfect));
const avgPerfect = c.calculateCategoryAverages(tenQs);
assert(Math.abs(avgPerfect.totalSum - 10) < 0.001, '10 perfect questions average to 10');
assert(Math.abs(avgPerfect.averages.pronunciation - 2) < 0.001, 'perfect pronunciation avg 2');

const tip = c.generateScoreTooltip(tenQs);
assert(tip.includes('Q1:'), 'tooltip includes Q1');
assert(c.generateScoreTooltip([]) === 'No scores entered yet.', 'empty tooltip');

const students = [
    { id: '1', name: '가영 (Kay)', entryOrder: 2, pasteOrder: 1 },
    { id: '2', name: '나영 (Nay)', entryOrder: 1, pasteOrder: 2 },
    { id: '3', name: 'Apple', entryOrder: 0, pasteOrder: 0 }
];
const alpha = c.getSortedStudents(students, 'alphabetical');
assert(alpha[0].name.startsWith('가영') || alpha[0].name === 'Apple', 'alphabetical sorts');
const paste = c.getSortedStudents(students, 'pasteOrder');
assert(paste[0].pasteOrder === 0, 'pasteOrder sort');
const entry = c.getSortedStudents(students, 'entryOrder');
assert(entry[0].entryOrder === 0, 'entryOrder sort');

const mapped = c.mapLocalStorageToRecord(
    {
        students: [
            {
                id: 'local1',
                name: '가영 (Kay)',
                scores: {
                    a1: [perfect]
                }
            },
            { id: 'local2', name: 'Unknown Student', scores: {} }
        ],
        assignments: [{ id: 'a1', title: 'Unit 1', date: '2026-01-01' }],
        settings: { studentSortMode: 'entryOrder' }
    },
    [{ id: 'stu1', name: '가영 (Kay)' }]
);
assert(mapped && mapped.matched === 1, 'local map matches one');
assert(mapped.unmatched.length === 1, 'local map unmatched one');
assert(mapped.scores.stu1 && mapped.scores.stu1.a1, 'scores remapped to roster id');
assert(mapped.settings.studentSortMode === 'entryOrder', 'settings mapped');

console.log('speaking-test-core.test.mjs: ok');
