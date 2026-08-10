/**
 * Run: node tests/debate-book-check-transfer.test.mjs
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

const fromCohort = {
    id: 'cohort-a',
    name: 'Purple A',
    students: [{ id: 'stu_1', name: '김민수', active: true, tags: [] }]
};
const toCohort = {
    id: 'cohort-b',
    name: 'Purple B',
    students: []
};
const debateClassA = {
    id: 'cls-a',
    name: 'Debate A',
    scheduleModel: 'debateMonthly',
    startDate: '2026-03-01',
    endDate: '2026-05-31',
    book: 'Debate Purple',
    levelPreset: 'Garam',
    cohortIds: ['cohort-a'],
    debateBookPeriods: [{ id: 'p1', startDate: '2026-03-01', book: 'Debate Purple' }]
};
const debateClassB = {
    id: 'cls-b',
    name: 'Debate B',
    scheduleModel: 'debateMonthly',
    startDate: '2026-03-01',
    endDate: '2026-05-31',
    book: 'Debate Yeoul',
    levelPreset: 'Garam',
    cohortIds: ['cohort-b'],
    debateBookPeriods: [{ id: 'p1', startDate: '2026-03-01', book: 'Debate Yeoul' }]
};
const writingNoBook = {
    id: 'cls-wr',
    name: 'Writing',
    scheduleModel: 'sequentialTerm',
    book: '',
    cohortIds: ['cohort-a']
};

let distributions = [];
distributions = d.upsertDebateBookDistribution(distributions, {
    id: 'dbd1',
    classId: 'cls-a',
    periodKey: '2026-03',
    bookTitle: 'Debate Purple',
    bookLevel: 'Garam',
    records: [{ studentId: 'stu_1', status: 'issued', note: '', issuedAt: '2026-03-05' }]
});

const appData = {
    cohorts: [fromCohort, toCohort],
    classes: [debateClassA, debateClassB, writingNoBook],
    debateBookDistributions: distributions,
    pendingDebateBookChecks: [],
    ui: { debateBookPeriodByClassId: { 'cls-a': '2026-03', 'cls-b': '2026-03' } }
};

assert(d.classTracksDebateBookDelivery(debateClassA) === true, 'debate monthly tracks books');
assert(d.classTracksDebateBookDelivery(writingNoBook) === false, 'empty book does not track');

const moved = d.moveStudentsBetweenCohorts(appData.cohorts, 'cohort-a', 'cohort-b', ['stu_1']);
assert(!moved.error, 'move ok');
const afterMove = Object.assign({}, appData, { cohorts: moved.cohorts });

const recorded = d.recordDebateBookChecksForMoves(
    afterMove,
    [{ studentId: 'stu_1', fromCohortId: 'cohort-a', toCohortId: 'cohort-b' }],
    {
        students: [{ id: 'stu_1', name: '김민수' }],
        newId: () => 'dbc_test_1',
        createdAt: '2026-03-10T00:00:00.000Z'
    }
);
assert(recorded.events.length === 1, `expected 1 event, got ${recorded.events.length}`);
const ev = recorded.events[0];
assert(ev.id === 'dbc_test_1', 'event id');
assert(ev.studentId === 'stu_1', 'student id');
assert(ev.toClassIds.includes('cls-b'), 'to class includes B');
assert(ev.fromClassIds.includes('cls-a'), 'from class includes A');
assert(!ev.fromClassIds.includes('cls-wr'), 'writing without book excluded');
assert(ev.priorStatusByClassId['cls-a'], 'prior snapshot for A');
assert(ev.priorStatusByClassId['cls-a'].status === 'issued', 'prior issued');
assert(ev.priorStatusByClassId['cls-a'].bookTitle === 'Debate Purple', 'prior book title');
assert(ev.resolvedAt == null, 'unresolved');

const listed = d.listPendingDebateBookChecks(recorded.appData, { classId: 'cls-b', role: 'to' });
assert(listed.length === 1, 'list pending for destination');

const resolved = d.resolveDebateBookCheck(recorded.appData, 'dbc_test_1', {
    userId: 'user_1',
    resolvedAt: '2026-03-11T00:00:00.000Z'
});
assert(resolved.pendingDebateBookChecks[0].resolvedAt === '2026-03-11T00:00:00.000Z', 'resolved at');
assert(resolved.pendingDebateBookChecks[0].resolvedByUserId === 'user_1', 'resolved by');
assert(
    d.listPendingDebateBookChecks(resolved, { unresolvedOnly: true }).length === 0,
    'no unresolved after resolve'
);

const noBookApp = {
    cohorts: [
        { id: 'c1', name: 'A', students: [{ id: 's1', name: '홍길동', active: true }] },
        { id: 'c2', name: 'B', students: [] }
    ],
    classes: [
        { id: 'x1', name: 'NoBook1', scheduleModel: 'sequentialTerm', book: '', cohortIds: ['c1'] },
        { id: 'x2', name: 'NoBook2', scheduleModel: 'sequentialTerm', book: '', cohortIds: ['c2'] }
    ],
    debateBookDistributions: [],
    pendingDebateBookChecks: []
};
const empty = d.recordDebateBookChecksForMoves(noBookApp, [
    { studentId: 's1', fromCohortId: 'c1', toCohortId: 'c2' }
]);
assert(empty.events.length === 0, 'no events when neither side tracks books');

const archiveCohort = {
    id: 'cohort-student-archive',
    name: 'Archive',
    isArchiveCohort: true,
    students: []
};
const archiveMove = d.buildDebateBookCheckEventsForMove(
    {
        cohorts: [fromCohort, archiveCohort],
        classes: [debateClassA],
        debateBookDistributions: distributions
    },
    { studentIds: ['stu_1'], fromCohortId: 'cohort-a', toCohortId: 'cohort-student-archive' }
);
assert(archiveMove.length === 0, 'skip archive moves');

const forStudent = d.resolveDebateBookChecksForStudentOnClass(
    recorded.appData,
    'stu_1',
    'cls-b',
    { role: 'to', userId: 'u2', resolvedAt: '2026-03-12T00:00:00.000Z' }
);
assert(forStudent.resolvedIds.includes('dbc_test_1'), 'resolve by student+class');

console.log('debate-book-check-transfer.test.mjs: ok');
