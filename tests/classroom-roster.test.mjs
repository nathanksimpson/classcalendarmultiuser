/**
 * Run: node tests/classroom-roster.test.mjs
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

const code = readFileSync(path.join(root, 'js', 'classroom-roster.js'), 'utf8');
const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(code, sandbox);

const { CCPClassroomRoster } = sandbox.window;

{
    const hay = CCPClassroomRoster.studentSearchHaystack({
        id: 's1',
        name: '김철수',
        nameEn: 'Chris Kim',
        locationTag: 'WF',
        memo: 'pickup gate'
    });
    assert(hay.includes('chris'), 'english name in haystack');
    assert(hay.includes('wf'), 'location in haystack');
}

{
    assert(CCPClassroomRoster.studentInitial({ name: '김철수', nameEn: 'Chris' }) === 'C', 'initial from english');
    assert(CCPClassroomRoster.studentInitial({ name: '김철수' }) === '김', 'initial from korean');
}

console.log('classroom-roster.test.mjs: all passed');
