/**
 * Run: node tests/day-notes-prep.test.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadModules() {
    const sandbox = { window: {}, globalThis: {} };
    sandbox.window.globalThis = sandbox.globalThis;
    sandbox.globalThis.window = sandbox.window;
    const files = ['js/utils.js', 'js/day-note-categories.js', 'js/homework-tab.js', 'js/day-notes.js'];
    files.forEach((rel) => {
        vm.runInNewContext(readFileSync(path.join(root, rel), 'utf8'), sandbox);
    });
    return {
        dayNotes: sandbox.window.CCPDayNotes,
        homework: sandbox.window.CCPHomeworkTab
    };
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const { dayNotes, homework } = loadModules();

// MW class: Mon 6/1, Wed 6/3, Mon 6/8, Wed 6/10, …
const classData = {
    id: 'class-1',
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    meetingDays: [1, 3]
};

const hooks = {
    getMeetingDays: () => [1, 3],
    isHolidayForClass: () => false
};

assert(
    homework.getPreviousClassMeetingBefore(classData, '2026-06-10', hooks) === '2026-06-08',
    'previous meeting skips non-class days'
);
assert(
    homework.getPreviousClassMeetingBefore(classData, '2026-06-03', hooks) === '2026-06-01',
    'Wed HW previous is Mon same week (2x/week)'
);
assert(
    homework.getPreviousClassMeetingBefore(classData, '2026-06-02', hooks) === '2026-06-01',
    'previous meeting on first week'
);
assert(
    homework.getPreviousClassMeetingBefore(classData, '2026-06-01', hooks) === '',
    'no meeting before term start'
);

const notes = [
    {
        id: 'n1',
        classId: 'class-1',
        date: '2026-06-08',
        text: 'Review pages 5-8 next time',
        createdAt: '2026-06-08T15:00:00.000Z',
        categoryId: 'next-class-notes'
    },
    {
        id: 'n2',
        classId: 'class-1',
        date: '2026-06-09',
        text: 'General class log',
        createdAt: '2026-06-09T15:05:00.000Z',
        categoryId: 'class-notes'
    }
];

const prep = dayNotes.getNextClassPrepNotes(notes, 'class-1', '2026-06-10', classData, hooks);
assert(prep.previousMeetingDate === '2026-06-08', 'prep finds previous meeting');
assert(prep.notes.length === 1 && prep.notes[0].id === 'n1', 'prep filters next-class-notes only');

const empty = dayNotes.getNextClassPrepNotes(notes, 'class-1', '2026-06-02', classData, hooks);
assert(empty.previousMeetingDate === '2026-06-01', 'prep on second meeting');
assert(empty.notes.length === 0, 'no prep notes on first meeting day');

// Canonical: note dated on prior meeting (Mon) shows on Wed HW
const priorMeetingNotes = [
    {
        id: 'n-prior',
        classId: 'class-1',
        date: '2026-06-01',
        text: 'Bring workbook Wednesday',
        createdAt: '2026-06-01T15:00:00.000Z',
        categoryId: 'next-class-notes'
    }
];
const wedFromPrior = dayNotes.getNextClassPrepNotes(
    priorMeetingNotes,
    'class-1',
    '2026-06-03',
    classData,
    hooks
);
assert(wedFromPrior.previousMeetingDate === '2026-06-01', 'Wed anchor previous is Mon');
assert(
    wedFromPrior.notes.length === 1 && wedFromPrior.notes[0].id === 'n-prior',
    'note dated on prior Mon shows on Wed HW'
);

// Legacy Now Class path: note dated on next meeting (Wed) still shows on Wed HW
const legacyNextMeetingNotes = [
    {
        id: 'n-legacy',
        classId: 'class-1',
        date: '2026-06-03',
        text: 'Saved on Wed by old Now Class popup',
        createdAt: '2026-06-01T16:00:00.000Z',
        categoryId: 'next-class-notes'
    }
];
const wedFromLegacy = dayNotes.getNextClassPrepNotes(
    legacyNextMeetingNotes,
    'class-1',
    '2026-06-03',
    classData,
    hooks
);
assert(wedFromLegacy.previousMeetingDate === '2026-06-01', 'legacy still reports prior meeting');
assert(
    wedFromLegacy.notes.length === 1 && wedFromLegacy.notes[0].id === 'n-legacy',
    'legacy note dated on Wed anchor shows on Wed HW'
);

// Both prior + legacy: merge without duplicate, prior first
const both = dayNotes.getNextClassPrepNotes(
    [...priorMeetingNotes, ...legacyNextMeetingNotes],
    'class-1',
    '2026-06-03',
    classData,
    hooks
);
assert(both.notes.length === 2, 'merges prior and anchor-dated prep notes');
assert(both.notes[0].id === 'n-prior' && both.notes[1].id === 'n-legacy', 'prior notes first');

console.log('day-notes-prep.test.mjs: all passed');
