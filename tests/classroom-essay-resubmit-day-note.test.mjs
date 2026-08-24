/**
 * Run: node tests/classroom-essay-resubmit-day-note.test.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

const code = readFileSync(path.join(root, 'js', 'classroom-essay-resubmit-day-note.js'), 'utf8');
const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(code, sandbox);

const { CCPClassroomEssayResubmitDayNote } = sandbox.window;

{
    const text = CCPClassroomEssayResubmitDayNote.buildEssayResubmitDayNoteText({
        records: [
            { studentId: 's1', status: 'resubmit_required', note: 'Fix intro' },
            { studentId: 's2', status: 'complete', note: '' }
        ],
        students: [{ student: { id: 's1', name: 'Amy' }, cohortName: 'Purple T' }],
        assignmentLabel: '2026-06-25 — Essay 1',
        translate: (k) => k
    });
    assert(text.includes('Purple T: Amy'), 'mentions student with Class: Name');
    assert(!text.includes('@Amy'), 'does not keep @ before student name');
    assert(text.includes('Fix intro'), 'includes reason');
    assert(text.includes('classroomEssayResubmitNoteHeader'), 'includes header key');
}

{
    const tagged = CCPClassroomEssayResubmitDayNote.collectTaggedStudentIds([
        { studentId: 's1', status: 'resubmit_required' },
        { studentId: 's2', status: 'submitted' }
    ]);
    assert(tagged.length === 1 && tagged[0] === 's1', 'tags resubmit students only');
}

{
    const dayNotes = [];
    const normalizeDayNote = (raw) => raw;
    const next = CCPClassroomEssayResubmitDayNote.syncEssayResubmitDayNote({
        dayNotes,
        essaySubmission: {
            records: [{ studentId: 's1', status: 'resubmit_required', note: 'Redo' }]
        },
        classId: 'c1',
        dateStr: '2026-07-02',
        students: [{ student: { id: 's1', name: 'Amy' } }],
        assignmentLabel: 'Essay 1',
        translate: (k) => k,
        normalizeDayNote,
        generateId: () => 'dn1'
    });
    assert(next.length === 1, 'creates note');
    assert(next[0].categoryId === 'essay-resubmit', 'category');
    assert(next[0].taggedStudentIds.includes('s1'), 'tagged ids');
}

{
    const dayNotes = [
        {
            id: 'dn1',
            classId: 'c1',
            date: '2026-07-02',
            categoryId: 'essay-resubmit',
            text: 'old',
            taggedStudentIds: ['s1']
        }
    ];
    const normalizeDayNote = (raw) => raw;
    const next = CCPClassroomEssayResubmitDayNote.syncEssayResubmitDayNote({
        dayNotes,
        essaySubmission: { records: [{ studentId: 's1', status: 'complete', note: '' }] },
        classId: 'c1',
        dateStr: '2026-07-02',
        students: [{ student: { id: 's1', name: 'Amy' } }],
        translate: (k) => k,
        normalizeDayNote
    });
    assert(next.length === 0, 'removes note when no resubmit students');
}

console.log('classroom-essay-resubmit-day-note.test.mjs: all passed');
