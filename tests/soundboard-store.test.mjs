/**
 * Run: node tests/soundboard-store.test.mjs
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { prepareBoard, validateBoard } = require('../shared/soundboard-store.cjs');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const good = {
    schemaVersion: 2,
    name: 'From Blerp',
    sounds: [
        { id: 'sound-1', title: 'Oops', audioRef: 'remote:https://cdn.blerp.com/normalized/example' }
    ]
};

assert(validateBoard(good).ok, 'valid board');
const prepared = prepareBoard(good);
assert(prepared.ok && prepared.json.includes('sound-1'), 'prepare serializes board');

assert(!validateBoard(null).ok, 'rejects null');
assert(!validateBoard({ schemaVersion: 3, sounds: [] }).ok, 'rejects unknown version');
assert(!validateBoard({ schemaVersion: 2, sounds: [{ id: '', title: 'x', audioRef: 'a' }] }).ok, 'rejects blank id');
assert(!prepareBoard({ schemaVersion: 2, sounds: [{ id: 'a', title: 'x' }] }).ok, 'rejects missing audio');

const huge = {
    schemaVersion: 2,
    sounds: [{ id: 'a', title: 'x', audioRef: 'remote:https://example.test/' + 'y'.repeat(900000) }]
};
assert(!prepareBoard(huge).ok, 'rejects oversized board');

console.log('soundboard-store.test.mjs: ok');
