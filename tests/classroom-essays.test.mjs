/**
 * Run: node tests/classroom-essays.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

const domainCode = readFileSync(path.join(root, 'js', 'classroom-domain.js'), 'utf8');
const essaysCode = readFileSync(path.join(root, 'js', 'classroom-essays.js'), 'utf8');
const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(domainCode, sandbox);
vm.runInNewContext(essaysCode, sandbox);

const { CCPClassroomEssays } = sandbox.window;

{
    const records = [
        { studentId: 's1', status: 'not_submitted', submittedRetest: false, note: '' },
        { studentId: 's2', status: 'not_submitted', submittedRetest: false, note: '' }
    ];
    const next = CCPClassroomEssays.applyBatchStatusToRecords(
        records,
        ['s1', 's2'],
        'complete',
        true
    );
    assert(next[0].status === 'complete' && next[0].submittedRetest === true, 'batch status + retest s1');
    assert(next[1].status === 'complete' && next[1].submittedRetest === true, 'batch status + retest s2');
}

{
    const records = [
        { studentId: 's1', status: 'submitted', submittedRetest: true, note: 'x' }
    ];
    const next = CCPClassroomEssays.applyBatchStatusToRecords(records, ['s1'], 'resubmit_required', null);
    assert(next[0].status === 'resubmit_required', 'batch status only');
    assert(next[0].submittedRetest === true, 'retest unchanged when null');
}

{
    const segments = CCPClassroomEssays.essayStatsSegmentFlex({
        not_submitted: 3,
        submitted: 2,
        complete: 5,
        resubmit_required: 1
    });
    assert(segments.length === 4, 'four segments');
    assert(segments[0].flex === 3 && segments[2].flex === 5, 'proportional flex');
    const empty = CCPClassroomEssays.essayStatsSegmentFlex({
        not_submitted: 0,
        submitted: 0,
        complete: 0,
        resubmit_required: 0
    });
    assert(empty.every((s) => s.flex === 1), 'equal flex when empty');
}

console.log('classroom-essays.test.mjs: all passed');
