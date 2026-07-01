/**
 * Run: node tests/classroom-header.test.mjs
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

const code = readFileSync(path.join(root, 'js', 'classroom-header.js'), 'utf8');
const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(code, sandbox);

const { CCPClassroomHeader } = sandbox.window;

{
    const classes = [
        { id: 'c1', name: 'Purple Debate', grade: '5', levelPreset: 'Purple' },
        { id: 'c2', name: 'Yeoul RC', grade: '4', levelPreset: 'Yeoul' }
    ];
    const filtered = CCPClassroomHeader.filterClassesForSearch(classes, 'debate', '');
    assert(filtered.length === 1 && filtered[0].id === 'c1', 'filter by search term');
}

{
    const classes = [
        { id: 'c1', name: 'Purple Debate', grade: '5' },
        { id: 'c2', name: 'Yeoul RC', grade: '4' }
    ];
    const filtered = CCPClassroomHeader.filterClassesForSearch(classes, 'zzz', 'c2');
    assert(filtered.length === 1 && filtered[0].id === 'c2', 'keep selected class when no match');
}

console.log('classroom-header.test.mjs: all passed');
