/**
 * Run: node tests/conflict-merge.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'conflict-merge.js')).href);

const cm = globalThis.CCPConflictMerge;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const local = {
    calendarName: 'Local',
    classes: [{ id: 'c1', name: 'A' }],
    events: [],
    dayNotes: [{ id: 'n1', text: 'mine' }]
};
const server = {
    calendarName: 'Server',
    classes: [{ id: 'c1', name: 'B' }, { id: 'c2', name: 'New' }],
    events: [],
    dayNotes: []
};

const lines = cm.summarizeConflict(local, server);
assert(lines.length >= 2, 'conflict summary has sections');
assert(lines.some((l) => l.labelKey === 'syncConflictClasses'), 'classes diff');

console.log('conflict-merge.test.mjs: all passed');
