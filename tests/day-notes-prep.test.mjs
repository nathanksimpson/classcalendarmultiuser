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

console.log('day-notes-prep.test.mjs: all passed');
