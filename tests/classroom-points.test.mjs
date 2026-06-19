/**
 * Run: node tests/classroom-points.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'classroom-domain.js')).href);

const d = globalThis.CCPClassroomDomain;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

let points = [];
points = d.appendPointEntry(points, {
    id: 'p1',
    classId: 'cls1',
    studentId: 's1',
    date: '2026-06-01',
    delta: 5,
    reason: 'participation'
});
points = d.appendPointEntry(points, {
    id: 'p2',
    classId: 'cls1',
    studentId: 's1',
    date: '2026-06-02',
    delta: -2,
    reason: 'late'
});
assert(points.length === 2, 'two point entries');
assert(d.sumPointsForStudent(points, 'cls1', 's1') === 3, 'sum points');

points = d.appendPointEntries(points, [
    { id: 'p3', classId: 'cls1', studentId: 's2', date: '2026-06-03', delta: 1, reason: 'hw' },
    { id: 'p4', classId: 'cls1', studentId: 's2', date: '2026-06-03', delta: 2, reason: 'hw' }
]);
assert(points.length === 4, 'appendPointEntries adds two');

const test = d.upsertStudentTest([], {
    id: 't1',
    classId: 'cls1',
    testName: 'Mock 1',
    testDate: '2026-06-10',
    records: [{ studentId: 's1', score: 88, maxScore: 100, note: '' }]
});
assert(test.length === 1, 'upsert test');
assert(d.findStudentTest(test, 'cls1', 'Mock 1', '2026-06-10'), 'find test');

console.log('classroom-points.test.mjs: all passed');
