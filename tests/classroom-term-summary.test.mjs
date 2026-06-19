/**
 * Run: node tests/classroom-term-summary.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'classroom-domain.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'classroom-term-summary.js')).href);

const summary = globalThis.CCPClassroomTermSummary;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const appData = {
    calendarName: 'Test Calendar',
    classes: [
        {
            id: 'cls1',
            name: 'Debate A',
            startDate: '2026-03-01',
            endDate: '2026-06-30',
            cohortIds: ['coh1']
        }
    ],
    cohorts: [
        {
            id: 'coh1',
            name: 'Cohort 1',
            students: [
                { id: 's1', name: 'Kim', active: true, sortOrder: 0 },
                { id: 's2', name: 'Lee', active: true, sortOrder: 1 }
            ]
        }
    ],
    studentPoints: [
        { id: 'p1', classId: 'cls1', studentId: 's1', date: '2026-06-01', delta: 2, reason: 'hw' },
        { id: 'p2', classId: 'cls1', studentId: 's1', date: '2026-07-01', delta: 5, reason: 'hw' }
    ],
    attendanceSessions: [
        {
            id: 'a1',
            classId: 'cls1',
            date: '2026-06-02',
            records: [{ studentId: 's1', status: 'present', sessionNote: '' }]
        }
    ],
    homeworkCompletions: [
        {
            id: 'h1',
            classId: 'cls1',
            syllabusRowId: 'row1',
            lessonDate: '2026-06-03',
            records: [{ studentId: 's1', grade: 'A', selfCheck: 'none', parentCheck: false, note: '' }]
        }
    ],
    studentTests: [
        {
            id: 't1',
            classId: 'cls1',
            testName: 'Mock 1',
            testDate: '2026-06-10',
            records: [{ studentId: 's1', score: 88, maxScore: 100, note: '' }]
        }
    ]
};

const range = summary.getClassTermDateRange(appData.classes[0]);
assert(range.from === '2026-03-01' && range.to === '2026-06-30', 'class term range');

const classPayload = summary.buildClassTermSummaryPayload(appData, 'cls1');
assert(classPayload && classPayload.students.length === 2, 'two students in class summary');
const kim = classPayload.students.find((s) => s.studentId === 's1');
assert(kim.points.total === 2, 'points outside term excluded');
assert(kim.attendance.present === 1, 'attendance counted');
assert(kim.homework.A === 1, 'homework counted');
assert(kim.tests.length === 1, 'test counted');

const studentPayload = summary.buildStudentTermSummaryPayload(appData, 's1');
assert(studentPayload.classes.length === 1, 'student linked to one class');
assert(studentPayload.classes[0].points.total === 2, 'student section uses class term range');

console.log('classroom-term-summary.test.mjs: all passed');
