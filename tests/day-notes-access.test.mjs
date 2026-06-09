/**
 * Run: node tests/day-notes-access.test.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DayNotesAccess = require(path.join(__dirname, '..', 'server', 'day-notes-access.js'));

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const calendarData = {
    classes: [
        {
            id: 'c1',
            classTeachers: [{ userId: 'u1' }, { userId: 'u2' }]
        }
    ],
    dayNotes: [
        {
            id: 'n1',
            classId: 'c1',
            date: '2026-06-01',
            text: 'Kim note',
            createdAt: '2026-06-01T10:00:00.000Z',
            authorUserId: 'u1'
        },
        {
            id: 'legacy',
            classId: 'c1',
            date: '2026-06-01',
            text: 'Old',
            createdAt: '2026-06-01T09:00:00.000Z'
        }
    ]
};

const user2 = { id: 'u2', role: 'teacher' };

const addOwn = DayNotesAccess.prepareDayNotesForSave(user2, calendarData, [
    ...calendarData.dayNotes,
    {
        id: 'n2',
        classId: 'c1',
        date: '2026-06-01',
        text: 'Lee note',
        createdAt: '2026-06-01T11:00:00.000Z'
    }
]);
assert(!addOwn.error, 'u2 can add note for shared class');
assert(addOwn.dayNotes.find((n) => n.id === 'n2').authorUserId === 'u2', 'new note stamped u2');

const editOther = DayNotesAccess.prepareDayNotesForSave(user2, calendarData, [
    {
        id: 'n1',
        classId: 'c1',
        date: '2026-06-01',
        text: 'Hacked',
        createdAt: '2026-06-01T10:00:00.000Z',
        authorUserId: 'u1'
    },
    calendarData.dayNotes[1]
]);
assert(editOther.error && editOther.error.includes('another teacher'), 'u2 cannot edit u1 note');

const editLegacy = DayNotesAccess.prepareDayNotesForSave(user2, calendarData, [
    calendarData.dayNotes[0],
    {
        id: 'legacy',
        classId: 'c1',
        date: '2026-06-01',
        text: 'Changed',
        createdAt: '2026-06-01T09:00:00.000Z'
    }
]);
assert(editLegacy.error && editLegacy.error.includes('author tracking'), 'u2 cannot edit legacy note');

const addWithHr = DayNotesAccess.prepareDayNotesForSave(user2, calendarData, [
    ...calendarData.dayNotes,
    {
        id: 'n3',
        classId: 'c1',
        date: '2026-06-02',
        text: 'Notify HR',
        createdAt: '2026-06-02T10:00:00.000Z',
        homeroomNotifyUserId: 'hr1'
    }
]);
assert(!addWithHr.error, 'u2 can add note with homeroom notify');
assert(
    addWithHr.dayNotes.find((n) => n.id === 'n3').homeroomNotifyUserId === 'hr1',
    'homeroom notify stamped on new note'
);

const calendarWithHrNote = {
    classes: calendarData.classes,
    dayNotes: addWithHr.dayNotes
};

const nextNotesWithHrChange = calendarWithHrNote.dayNotes.map((note) => {
    if (note.id !== 'n3') {
        return note;
    }
    return Object.assign({}, note, {
        text: 'Changed HR target',
        homeroomNotifyUserId: 'hr2'
    });
});
const editHr = DayNotesAccess.prepareDayNotesForSave(user2, calendarWithHrNote, nextNotesWithHrChange);
assert(editHr.error && editHr.error.includes('homeroom'), 'cannot change homeroom notify on edit');

const nextNotesPreserveHr = calendarWithHrNote.dayNotes.map((note) => {
    if (note.id !== 'n3') {
        return note;
    }
    return Object.assign({}, note, { text: 'Text only edit' });
});
const preserveHr = DayNotesAccess.prepareDayNotesForSave(user2, calendarWithHrNote, nextNotesPreserveHr);
assert(!preserveHr.error, 'u2 can edit own note text');
assert(
    preserveHr.dayNotes.find((n) => n.id === 'n3').homeroomNotifyUserId === 'hr1',
    'homeroom notify preserved on edit'
);

console.log('day-notes-access.test.mjs: all passed');
