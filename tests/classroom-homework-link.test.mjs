/**
 * Run: node tests/classroom-homework-link.test.mjs
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

const rowWithId = {
    id: 'row-abc',
    kind: 'lesson',
    date: '2026-06-09',
    planTitle: 'Unit 3'
};
const rowNoId = {
    kind: 'lesson',
    date: '2026-06-10',
    sessionNumber: 2,
    planTitle: 'Review'
};

assert(d.getSyllabusRowKey(rowWithId) === 'row-abc', 'uses row id when present');
assert(d.getSyllabusRowKey(rowNoId) === '2026-06-10|2|Review', 'fallback key without id');

const classData = {
    syllabusRows: [rowWithId, rowNoId]
};
const rows = d.getLessonRowsFromSyllabus(classData.syllabusRows);
assert(rows.length === 2, 'lesson rows from syllabus');

let completions = [];
const entry = {
    id: 'hw1',
    classId: 'cls1',
    syllabusRowId: 'row-abc',
    lessonDate: '2026-06-09',
    records: [{ studentId: 's1', grade: 'A', selfCheck: 'none', parentCheck: false, note: '' }]
};
completions = d.upsertHomeworkCompletion(completions, entry);
completions = d.upsertHomeworkCompletion(completions, {
    ...entry,
    records: [{ studentId: 's1', grade: 'B', selfCheck: 'satisfied', parentCheck: true, note: 'ok' }]
});
assert(completions.length === 1, 'upsert homework by class+syllabusRowId');
assert(completions[0].records[0].grade === 'B', 'grade updated');

const found = d.findHomeworkCompletion(completions, 'cls1', 'row-abc');
assert(found && found.records[0].parentCheck === true, 'find by syllabus row key');

console.log('classroom-homework-link.test.mjs: all passed');
