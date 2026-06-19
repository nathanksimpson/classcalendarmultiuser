/**
 * Run: node tests/classroom-points-day-note.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'classroom-domain.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'day-note-categories.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'day-notes.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'classroom-points-day-note.js')).href);

const d = globalThis.CCPClassroomDomain;
const sync = globalThis.CCPClassroomPointsDayNote;
const dayNotes = globalThis.CCPDayNotes;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const t = (key) => {
    const map = {
        classroomPointsNoteNoReason: 'No reason'
    };
    return map[key] || key;
};

const students = [
    { student: { id: 's1', name: 'Kim' } },
    { student: { id: 's2', name: 'Lee' } }
];

const homework = 'Homework (+/-)';
const attitude = 'Classroom attitude (+/-)';

const points = [
    { id: 'p1', classId: 'cls1', studentId: 's1', date: '2026-06-18', delta: 2, reason: homework },
    { id: 'p2', classId: 'cls1', studentId: 's1', date: '2026-06-18', delta: 1, reason: homework },
    { id: 'p3', classId: 'cls1', studentId: 's1', date: '2026-06-18', delta: -1, reason: attitude },
    { id: 'p4', classId: 'cls1', studentId: 's2', date: '2026-06-18', delta: -1, reason: 'late' }
];

const text = sync.buildPointsDayNoteText({
    entries: sync.listPointsForClassOnDate(points, 'cls1', '2026-06-18'),
    students,
    translate: t
});
assert(text.includes('Kim: -1 — Classroom attitude (+/-); +3 — Homework (+/-)'), 'kim grouped by reason (alphabetical)');
assert(text.includes('Lee: -1 — late'), 'lee with reason label');

const sameReasonSum = sync.buildPointsDayNoteText({
    entries: [
        { id: 'a', classId: 'cls1', studentId: 's1', date: '2026-06-18', delta: 2, reason: homework },
        { id: 'b', classId: 'cls1', studentId: 's1', date: '2026-06-18', delta: 1, reason: homework }
    ],
    students,
    translate: t
});
assert(sameReasonSum === 'Kim: +3 — Homework (+/-)', 'same reason summed');

const cancelOut = sync.buildPointsDayNoteText({
    entries: [
        { id: 'a', classId: 'cls1', studentId: 's1', date: '2026-06-18', delta: 1, reason: homework },
        { id: 'b', classId: 'cls1', studentId: 's1', date: '2026-06-18', delta: -1, reason: homework }
    ],
    students,
    translate: t
});
assert(cancelOut === '', 'zero net reason omitted');

let notes = [];
let next = sync.syncPointsDayNote({
    dayNotes: notes,
    studentPoints: points,
    classId: 'cls1',
    dateStr: '2026-06-18',
    students,
    authorUserId: 't1',
    translate: t,
    normalizeDayNote: dayNotes.normalizeDayNote,
    generateId: () => 'dn_test_1'
});
assert(next.length === 1, 'creates one note');
assert(next[0].categoryId === 'class-points', 'points category');
assert(next[0].text === text, 'note text matches');

next = sync.syncPointsDayNote({
    dayNotes: next,
    studentPoints: points.concat([
        { id: 'p5', classId: 'cls1', studentId: 's2', date: '2026-06-18', delta: 2, reason: homework }
    ]),
    classId: 'cls1',
    dateStr: '2026-06-18',
    students,
    authorUserId: 't1',
    translate: t,
    normalizeDayNote: dayNotes.normalizeDayNote,
    generateId: () => 'dn_test_2'
});
assert(next.length === 1, 'still one note after update');
assert(next[0].id === 'dn_test_1', 'same note id');
assert(next[0].text.includes('Lee: +2 — Homework (+/-); -1 — late'), 'lee updated with grouped reasons');

const cleared = sync.syncPointsDayNote({
    dayNotes: next,
    studentPoints: [],
    classId: 'cls1',
    dateStr: '2026-06-18',
    students,
    normalizeDayNote: dayNotes.normalizeDayNote
});
assert(cleared.length === 0, 'removes note when no points');

const twoDates = [
    { id: 'pd1', classId: 'cls1', studentId: 's1', date: '2026-06-17', delta: 2, reason: homework },
    { id: 'pd2', classId: 'cls1', studentId: 's1', date: '2026-06-18', delta: 1, reason: homework }
];
let multi = sync.syncPointsDayNote({
    dayNotes: [],
    studentPoints: twoDates,
    classId: 'cls1',
    dateStr: '2026-06-17',
    students,
    translate: t,
    normalizeDayNote: dayNotes.normalizeDayNote,
    generateId: () => 'dn_multi_1'
});
multi = sync.syncPointsDayNote({
    dayNotes: multi,
    studentPoints: twoDates,
    classId: 'cls1',
    dateStr: '2026-06-18',
    students,
    translate: t,
    normalizeDayNote: dayNotes.normalizeDayNote,
    generateId: () => 'dn_multi_2'
});
assert(multi.length === 2, 'two dates same class → two notes');
multi = sync.syncPointsDayNote({
    dayNotes: multi,
    studentPoints: twoDates.concat([
        { id: 'pd3', classId: 'cls1', studentId: 's1', date: '2026-06-18', delta: 2, reason: homework }
    ]),
    classId: 'cls1',
    dateStr: '2026-06-18',
    students,
    translate: t,
    normalizeDayNote: dayNotes.normalizeDayNote,
    generateId: () => 'dn_multi_3'
});
assert(multi.length === 2, 'same date updates one note only');
const june18 = multi.find((n) => n.date === '2026-06-18');
assert(june18 && june18.text.includes('+3'), 'same-day note text updated');

assert(
    globalThis.CCPDayNoteCategories.isSystemManagedCategoryId('class-points'),
    'class-points is system managed'
);

console.log('classroom-points-day-note.test.mjs: all passed');
