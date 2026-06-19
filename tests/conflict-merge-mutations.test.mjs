import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadConflictMerge() {
    const code = readFileSync(path.join(root, 'js', 'conflict-merge.js'), 'utf8');
    const sandbox = { window: {}, globalThis: {} };
    sandbox.globalThis = sandbox.window;
    vm.runInNewContext(code, sandbox);
    return sandbox.window.CCPConflictMerge;
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const CCPConflictMerge = loadConflictMerge();

{
    const server = {
        classes: [{ id: 'c1', name: 'Server' }],
        events: [],
        dayNotes: []
    };
    const mutations = [
        {
            entity: 'classes',
            action: 'upsert',
            payload: { class: { id: 'c2', name: 'Local only' } }
        }
    ];
    assert(!CCPConflictMerge.mutationsOverlap(mutations, server), 'different class ids no overlap');

    const overlapMutations = [
        {
            entity: 'classes',
            action: 'upsert',
            payload: { class: { id: 'c1', name: 'Local edit' } }
        }
    ];
    assert(CCPConflictMerge.mutationsOverlap(overlapMutations, server), 'same class id overlap');
}

console.log('conflict-merge-mutations.test.mjs: all passed');
