/**
 * Run: node tests/classroom-debate-books.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'debate-periods.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'classroom-domain.js')).href);

const d = globalThis.CCPClassroomDomain;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

assert(d.classUsesMonthlyDebateBooks({ scheduleModel: 'debateMonthly' }) === true, 'monthly detect');
assert(d.classUsesMonthlyDebateBooks({ scheduleModel: 'sequentialTerm' }) === false, 'term detect');
assert(d.classUsesMonthlyDebateBooks({}) === false, 'empty schedule is term');

const debateClass = {
    id: 'cls-debate',
    scheduleModel: 'debateMonthly',
    startDate: '2026-03-01',
    endDate: '2026-05-31',
    book: 'Debate Purple',
    levelPreset: 'Garam',
    debateBookPeriods: [
        { id: 'p1', startDate: '2026-03-01', book: 'Debate Purple' },
        { id: 'p2', startDate: '2026-04-01', book: 'Debate Yeoul' },
        { id: 'p3', startDate: '2026-05-01', book: 'Debate Garam Plus' }
    ]
};

const monthOpts = d.listDebateBookMonthOptions(debateClass);
assert(monthOpts.length === 3, `expected 3 months, got ${monthOpts.length}`);
assert(monthOpts[0].periodKey === '2026-03', 'first month key');
assert(monthOpts[0].label.includes('Mar 2026'), `month label: ${monthOpts[0].label}`);
assert(monthOpts[0].label.includes('Debate Purple'), `book in label: ${monthOpts[0].label}`);
assert(monthOpts[0].label.includes('Garam'), `level in label: ${monthOpts[0].label}`);
assert(monthOpts[1].bookTitle === 'Debate Yeoul', 'april book from period');

const writingClass = {
    id: 'cls-wr',
    scheduleModel: 'sequentialTerm',
    startDate: '2026-03-01',
    endDate: '2026-05-31',
    book: 'Write Now',
    levelCustom: 'Blue'
};
const termOpt = d.getDebateBookTermOption(writingClass);
assert(termOpt.periodKey === d.DEBATE_BOOK_TERM_PERIOD_KEY, 'term key');
assert(termOpt.bookTitle === 'Write Now', 'term book');
assert(termOpt.bookLevel === 'Blue', 'term level');
assert(termOpt.label.includes('Write Now'), `term label: ${termOpt.label}`);
assert(d.pickDefaultDebateBookPeriodKey(writingClass) === 'term', 'default term key');

let list = [];
list = d.upsertDebateBookDistribution(list, {
    id: 'dbd1',
    classId: 'cls-debate',
    periodKey: '2026-03',
    bookTitle: 'Debate Purple',
    bookLevel: 'Garam',
    records: [
        { studentId: 's1', status: 'issued', note: '' },
        { studentId: 's2', status: 'bogus', note: 'x' }
    ]
});
assert(list.length === 1, 'upsert inserts monthly');
const found = d.findDebateBookDistribution(list, 'cls-debate', '2026-03');
assert(found && found.records.length === 2, 'find monthly');
assert(found.records[1].status === 'not_issued', 'invalid status normalized');

list = d.upsertDebateBookDistribution(list, {
    id: 'dbd2',
    classId: 'cls-wr',
    periodKey: 'term',
    bookTitle: 'Write Now',
    bookLevel: 'Blue',
    records: [{ studentId: 's1', status: 'missing', note: 'lost' }]
});
assert(list.length === 2, 'monthly and term do not collide');
assert(d.findDebateBookDistribution(list, 'cls-wr', 'term').records[0].status === 'missing', 'term find');

list = d.upsertDebateBookDistribution(list, {
    id: 'dbd3',
    classId: 'cls-debate',
    periodKey: '2026-03',
    bookTitle: 'Debate Purple',
    bookLevel: 'Garam',
    records: [{ studentId: 's1', status: 'missing', note: 'updated' }]
});
assert(list.length === 2, 'upsert replaces same month');
assert(
    d.findDebateBookDistribution(list, 'cls-debate', '2026-03').records[0].status === 'missing',
    'month upsert updates'
);

const ensured = d.ensureDebateBookRecordsForStudents(
    { id: 'x', classId: 'c', periodKey: 'term', records: [] },
    [{ student: { id: 'a' } }, { student: { id: 'b' } }]
);
assert(ensured.records.length === 2, 'ensure records');
assert(ensured.records.every((r) => r.status === 'not_issued'), 'default not issued');

const counts = d.countDebateBookByStatus(
    {
        records: [
            { studentId: 'a', status: 'issued' },
            { studentId: 'b', status: 'missing' },
            { studentId: 'c', status: 'not_issued' }
        ]
    },
    ['a', 'b', 'c']
);
assert(counts.issued === 1 && counts.missing === 1 && counts.not_issued === 1, 'counts');

console.log('classroom-debate-books.test.mjs: ok');
