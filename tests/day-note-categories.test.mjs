/**
 * Run: node tests/day-note-categories.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'day-note-categories.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'day-notes.js')).href);

const categories = globalThis.CCPDayNoteCategories;
const dayNotes = globalThis.CCPDayNotes;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const t = (key) => ({
    dayNoteCategoryClassNotes: 'Class notes',
    dayNoteCategoryParentConsult: 'Parent consult',
    dayNoteCategoryNextClass: 'Notes for next class'
}[key] || key);

assert(categories.normalizeCategoryId('') === 'class-notes', 'empty category defaults to class-notes');
assert(categories.normalizeCategoryId('parent-consult') === 'parent-consult', 'builtin id preserved');
assert(categories.normalizeCategoryId('next-class-notes') === 'next-class-notes', 'next-class-notes id preserved');
assert(categories.isBuiltinCategoryId('next-class-notes'), 'next-class-notes is builtin');

const normalized = dayNotes.normalizeDayNote({
    id: 'n1',
    classId: 'class-1',
    date: '2026-06-10',
    text: 'Hello',
    createdAt: '2026-06-10T10:00:00.000Z'
});
assert(normalized.categoryId === 'class-notes', 'normalizeDayNote defaults categoryId');

const withCategory = dayNotes.normalizeDayNote({
    id: 'n2',
    classId: 'class-1',
    date: '2026-06-10',
    text: 'Parent call',
    createdAt: '2026-06-10T11:00:00.000Z',
    categoryId: 'parent-consult'
});
assert(withCategory.categoryId === 'parent-consult', 'normalizeDayNote keeps categoryId');

const notes = [
    {
        id: 'a',
        classId: 'class-1',
        date: '2026-06-09',
        text: 'Tagged',
        createdAt: '2026-06-09T10:00:00.000Z',
        taggedStudentIds: ['stu-1'],
        categoryId: 'class-notes'
    },
    {
        id: 'b',
        classId: 'class-1',
        date: '2026-06-10',
        text: 'Class only',
        createdAt: '2026-06-10T10:00:00.000Z',
        categoryId: 'class-notes'
    },
    {
        id: 'c',
        classId: 'class-2',
        date: '2026-06-10',
        text: 'Also tagged',
        createdAt: '2026-06-10T12:00:00.000Z',
        taggedStudentIds: ['stu-1', 'stu-2'],
        categoryId: 'parent-consult'
    }
];

const forStudent = dayNotes.getNotesForStudent(notes, 'stu-1');
assert(forStudent.length === 2, 'getNotesForStudent returns only tagged notes');
assert(forStudent[0].id === 'c', 'getNotesForStudent sorts date desc then createdAt desc');

const parentOnly = dayNotes.getNotesForStudent(notes, 'stu-1', { categoryId: 'parent-consult' });
assert(parentOnly.length === 1 && parentOnly[0].id === 'c', 'getNotesForStudent filters by category');

const custom = categories.createCategory('Behavior');
assert(custom && custom.id.startsWith('dnc_'), 'createCategory returns id');
assert(categories.canDeleteCategory('class-notes', notes).ok === false, 'builtin cannot delete');
assert(categories.canDeleteCategory(custom.id, notes).ok === true, 'unused custom can delete');
const usedCustom = categories.createCategory('Used');
const notesWithCustom = notes.concat([{
    id: 'd',
    classId: 'class-1',
    date: '2026-06-11',
    text: 'Custom cat',
    createdAt: '2026-06-11T10:00:00.000Z',
    categoryId: usedCustom.id
}]);
assert(
    categories.canDeleteCategory(usedCustom.id, notesWithCustom).reason === 'in_use',
    'in-use custom blocked'
);

const all = categories.getAllCategories([custom], t);
assert(all.length === 6, 'getAllCategories merges builtins + custom');
assert(
    dayNotes.resolveDayNoteCategoryLabel('next-class-notes', [], t) === 'Notes for next class',
    'resolveDayNoteCategoryLabel for next-class-notes'
);
assert(
    dayNotes.resolveDayNoteCategoryLabel('class-notes', [], t) === 'Class notes',
    'resolveDayNoteCategoryLabel uses i18n for builtin'
);
assert(
    dayNotes.resolveDayNoteCategoryLabel(custom.id, [custom], t) === 'Behavior',
    'resolveDayNoteCategoryLabel uses custom name'
);

console.log('day-note-categories.test.mjs: all passed');
