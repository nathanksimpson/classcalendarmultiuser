/**
 * Run: node tests/term-clone.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'term-clone-wizard.js')).href);

const w = globalThis.CCPTermCloneWizard;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const source = {
    calendarName: 'Spring 2026',
    termStart: '2026-03',
    classes: [
        {
            id: 'cls-old',
            name: 'Debate',
            startDate: '2026-03-01',
            syllabusRows: [{ id: 'r1', kind: 'lesson', date: '2026-03-05' }]
        }
    ],
    events: [{ id: 'e1', startDate: '2026-03-10', endDate: '2026-03-10' }],
    cohorts: [{ id: 'coh1', classIds: ['cls-old'], students: [] }],
    attendanceSessions: [{ id: 'a1', classId: 'cls-old', date: '2026-03-05', records: [] }],
    dayNotes: [{ id: 'n1', classId: 'cls-old', date: '2026-03-05', text: 'hi' }]
};

const cloned = w.buildClonedCalendarData(source, {
    newName: 'Summer 2026',
    monthShift: 3,
    clearClassroom: true
});

assert(cloned.calendarName === 'Summer 2026', 'new name');
assert(cloned.termStart === '2026-06', 'term shifted');
assert(cloned.classes[0].id !== 'cls-old', 'new class id');
assert(cloned.classes[0].startDate === '2026-06-01', 'class date shifted');
assert(cloned.attendanceSessions.length === 0, 'classroom cleared');
assert(cloned.events.length === 0, 'events not cloned');

console.log('term-clone.test.mjs: all passed');
