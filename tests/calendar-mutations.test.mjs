import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const mutations = require(path.join(root, 'shared', 'calendar-mutations.cjs'));

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const base = {
    schemaVersion: 3,
    classes: [{ id: 'c1', name: 'Alpha' }],
    events: [{ id: 'e1', name: 'Holiday' }],
    dayNotes: [{ id: 'n1', classId: 'c1', date: '2026-06-01', text: 'Hi' }]
};

{
    const next = mutations.applyCalendarMutations(base, [
        {
            entity: 'classes',
            action: 'upsert',
            payload: { class: { id: 'c1', name: 'Alpha Updated' } }
        }
    ]);
    assert(next.classes.length === 1, 'classes upsert count');
    assert(next.classes[0].name === 'Alpha Updated', 'classes upsert merge');

    const added = mutations.applyCalendarMutations(base, [
        {
            entity: 'classes',
            action: 'upsert',
            payload: { class: { id: 'c2', name: 'Beta' } }
        }
    ]);
    assert(added.classes.length === 2, 'classes add');

    const removed = mutations.applyCalendarMutations(base, [
        { entity: 'classes', action: 'remove', payload: { classId: 'c1' } }
    ]);
    assert(removed.classes.length === 0, 'classes remove');

    const ev = mutations.applyCalendarMutations(base, [
        { entity: 'events', action: 'upsert', payload: { event: { id: 'e2', name: 'Break' } } }
    ]);
    assert(ev.events.length === 2, 'events upsert');

    const noteUpsert = mutations.applyCalendarMutations(base, [
        {
            entity: 'dayNotes',
            action: 'mutate',
            payload: { op: 'upsert', note: { id: 'n1', classId: 'c1', date: '2026-06-01', text: 'Updated' } }
        }
    ]);
    assert(noteUpsert.dayNotes[0].text === 'Updated', 'dayNotes upsert op');

    const noteRemove = mutations.applyCalendarMutations(base, [
        { entity: 'dayNotes', action: 'mutate', payload: { op: 'remove', noteId: 'n1' } }
    ]);
    assert(noteRemove.dayNotes.length === 0, 'dayNotes remove op');

    const bad = mutations.validateMutations([]);
    assert(!bad.ok, 'empty mutations invalid');

    const good = mutations.validateMutations([
        { entity: 'classes', action: 'upsert', payload: { class: { id: 'x' } } }
    ]);
    assert(good.ok, 'valid mutations');
}

console.log('calendar-mutations.test.mjs: all passed');
