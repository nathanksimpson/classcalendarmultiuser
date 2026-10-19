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

const patched = d.applyDebateBookRecordPatch(
    { studentId: 's1', status: 'not_issued', note: '', issuedAt: '' },
    { status: 'issued' },
    '2026-03-15'
);
assert(patched.status === 'issued' && patched.issuedAt === '2026-03-15', 'issuedAt on mark issued');

const cleared = d.applyDebateBookRecordPatch(patched, { status: 'missing' }, '2026-03-16');
assert(cleared.status === 'missing' && cleared.issuedAt === '', 'issuedAt cleared when not issued');

const cohorts = [
    {
        id: 'coh1',
        name: 'Debate',
        students: [
            { id: 's1', name: 'A', sortOrder: 0, active: true },
            { id: 's2', name: 'B', sortOrder: 1, active: true },
            { id: 's3', name: 'C', sortOrder: 2, active: true }
        ]
    }
];
const debateClassWithCohort = Object.assign({}, debateClass, { cohortIds: ['coh1'] });

const alertCounts = d.debateBookAlertCountsForClass(
    list,
    debateClassWithCohort,
    cohorts,
    { 'cls-debate': '2026-03' }
);
assert(
    typeof alertCounts.ni === 'number' && typeof alertCounts.ms === 'number',
    'picker alert counts resolve a period'
);
assert(
    d.resolveDebateBookPeriodKeyForClass(debateClass, { 'cls-debate': '2026-03' }, '2026-03-15') ===
        '2026-03',
    'saved March is kept while still in March'
);

const defaultPeriodAlerts = d.debateBookAlertCountsForClass(
    list,
    debateClassWithCohort,
    cohorts,
    {}
);
assert(typeof defaultPeriodAlerts.ni === 'number' && typeof defaultPeriodAlerts.ms === 'number', 'default period alerts');

const writingClassWithCohort = Object.assign({}, writingClass, { cohortIds: ['coh1'] });

const summaryEntries = d.listDebateBookSummaryEntries(
    {
        classes: [debateClassWithCohort, writingClassWithCohort],
        cohorts,
        debateBookDistributions: list
    },
    { skipEmptyRoster: true }
);
assert(summaryEntries.length === 4, `summary entries monthly+term, got ${summaryEntries.length}`);
assert(
    summaryEntries.some((entry) => entry.key === 'cls-debate|2026-03'),
    'summary includes debate month'
);
assert(summaryEntries.some((entry) => entry.key === 'cls-wr|term'), 'summary includes term class');

const summaryRows = d.listDebateBookSummaryRows(
    {
        classes: [debateClassWithCohort],
        cohorts,
        debateBookDistributions: list
    },
    { selectedKeys: ['cls-debate|2026-03'] }
);
assert(summaryRows.length === 3, 'summary rows for roster');
assert(summaryRows.filter((row) => row.status === 'missing').length === 1, 'summary missing row');

const transitionClass = {
    id: 'cls-transition',
    scheduleModel: 'debateMonthly',
    startDate: '2026-08-01',
    endDate: '2026-09-30',
    book: 'August Book',
    debateBookPeriods: [
        { id: 'p-aug', startDate: '2026-08-01', book: 'August Book' },
        { id: 'p-sep', startDate: '2026-09-01', book: 'September Book' }
    ]
};
assert(
    d.pickDefaultDebateBookPeriodKey(transitionClass, '2026-08-31') === '2026-09',
    'default on 2026-08-31 is September'
);
assert(
    d.pickDefaultDebateBookPeriodKey(transitionClass, '2026-08-28') === '2026-08',
    'default on 2026-08-28 stays August'
);
assert(
    d.resolveDebateBookPeriodKeyForClass(
        transitionClass,
        { 'cls-transition': '2026-08' },
        '2026-08-31'
    ) === '2026-09',
    'saved August is not kept on Aug 31'
);
assert(
    d.resolveDebateBookPeriodKeyForClass(
        transitionClass,
        { 'cls-transition': '2026-08' },
        '2026-08-28'
    ) === '2026-08',
    'saved August is kept before the transition week'
);

const warnClass = Object.assign({}, debateClass, { cohortIds: ['coh-warn'] });
const warnCohorts = [
    {
        id: 'coh-warn',
        students: [
            { id: 'new1', name: '김신규★', active: true, tags: [] },
            { id: 'issuedNew', name: '이발급', active: true, tags: ['new'] },
            { id: 'abs1', name: '박결석', active: true },
            { id: 'oldAbs', name: '정지난달', active: true },
            { id: 'plain', name: '최평범', active: true },
            { id: 'both', name: '한둘★', active: true },
            { id: 'miss', name: '오분실', active: true }
        ]
    }
];
const warnData = {
    cohorts: warnCohorts,
    debateBookDistributions: [
        {
            id: 'dbd-warn',
            classId: 'cls-debate',
            periodKey: '2026-04',
            bookTitle: 'Debate Yeoul',
            records: [
                { studentId: 'issuedNew', status: 'issued', note: '', issuedAt: '2026-04-01' },
                { studentId: 'miss', status: 'missing', note: '' }
            ]
        }
    ],
    attendanceSessions: [
        {
            id: 'att-apr',
            classId: 'cls-debate',
            date: '2026-04-08',
            records: [
                { studentId: 'abs1', status: 'absent' },
                { studentId: 'both', status: 'absent' },
                { studentId: 'plain', status: 'late' },
                { studentId: 'miss', status: 'absent' }
            ]
        },
        {
            id: 'att-mar',
            classId: 'cls-debate',
            date: '2026-03-10',
            records: [{ studentId: 'oldAbs', status: 'absent' }]
        },
        {
            id: 'att-today',
            classId: 'cls-debate',
            date: '2026-04-15',
            records: [{ studentId: 'plain', status: 'absent' }]
        }
    ]
};

function warningIds(rows) {
    return (rows || []).map((row) => row.studentId).sort();
}

const warnings = d.listClassBookHandoutWarnings(warnData, warnClass, '2026-04-15');
assert(warnings.tracked === true, 'tracked class');
assert(warnings.periodKey === '2026-04', `period ${warnings.periodKey}`);
assert(warnings.bookTitle === 'Debate Yeoul', `book ${warnings.bookTitle}`);
assert(
    warningIds(warnings.newWithoutBook).join(',') === 'both,new1',
    `new without book: ${warningIds(warnings.newWithoutBook).join(',')}`
);
assert(
    warningIds(warnings.absentNeedingBook).join(',') === 'abs1',
    `absent needing book: ${warningIds(warnings.absentNeedingBook).join(',')}`
);
assert(
    !warnings.newWithoutBook.some((row) => row.studentId === 'issuedNew'),
    'issued new student is omitted'
);
assert(
    !warnings.absentNeedingBook.some((row) => row.studentId === 'oldAbs'),
    'absence from the previous book month is omitted'
);
assert(
    !warnings.newWithoutBook.concat(warnings.absentNeedingBook).some((row) => row.studentId === 'plain'),
    'not-issued student with no prior absence is omitted'
);
assert(
    !warnings.absentNeedingBook.some((row) => row.studentId === 'miss'),
    'missing status is omitted'
);

const issuedData = JSON.parse(JSON.stringify(warnData));
issuedData.debateBookDistributions[0].records.push(
    { studentId: 'new1', status: 'issued', note: '', issuedAt: '2026-04-08' },
    { studentId: 'abs1', status: 'issued', note: '', issuedAt: '2026-04-08' }
);
const afterIssue = d.listClassBookHandoutWarnings(issuedData, warnClass, '2026-04-15');
assert(
    !afterIssue.newWithoutBook.some((row) => row.studentId === 'new1'),
    'new student drops off once issued'
);
assert(
    !afterIssue.absentNeedingBook.some((row) => row.studentId === 'abs1'),
    'absent student drops off once issued'
);
assert(
    afterIssue.newWithoutBook.some((row) => row.studentId === 'both'),
    'other new student still listed'
);

const untracked = d.listClassBookHandoutWarnings(
    warnData,
    { id: 'plain-cls', scheduleModel: 'sequentialTerm', book: '' },
    '2026-04-15'
);
assert(untracked.tracked === false, 'class without book tracking');
assert(
    untracked.newWithoutBook.length === 0 && untracked.absentNeedingBook.length === 0,
    'untracked class returns no names'
);

console.log('classroom-debate-books.test.mjs: ok');
