/**
 * Run: node tests/essay-batch-list-status.test.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(readFileSync(path.join(root, 'js', 'essay-batch-list-status.js'), 'utf8'), sandbox);
const api = sandbox.window.CCPEssayBatchListStatus;

const complete = { listStatus: 'complete', isDone: false };
const received = { listStatus: 'submitted', isDone: true };
const resubmit = { listStatus: 'resubmit_required' };
const demerit = { listStatus: 'demerit', isDone: true };
const failed = { isFailed: true, listStatus: 'complete' };
const legacyDone = { isDone: true };
const legacyResubmit = { isResubmit: true, isDone: true };

assert(api.isComplete(complete), 'complete chip is the Done filter');
assert(!api.isComplete(received), 'a Done checkbox does not count when the list says Received');
assert(api.isResubmit(resubmit), 'resubmit chip is the Resubmit filter');
assert(api.isDemerit(demerit), 'demerit is its own status');
assert(api.isSettled(complete) && api.isSettled(resubmit) && api.isSettled(demerit), 'final marks are settled');
assert(!api.isSettled(received), 'Received is still open work');

assert(api.matchesFilter(complete, 'done'), 'saved Done filter means Complete');
assert(api.matchesFilter(complete, 'complete'), 'Complete filter matches the chip');
assert(!api.matchesFilter(demerit, 'done'), 'Demerit is not the Complete filter');
assert(!api.matchesFilter(received, 'done'), 'Received is not Complete');
assert(api.matchesFilter(resubmit, 'resubmit'), 'Resubmit filter');
assert(api.matchesFilter(received, 'open'), 'Received stays in Open');
assert(!api.matchesFilter(complete, 'open') && !api.matchesFilter(demerit, 'open'), 'settled cards leave Open');
assert(!api.matchesFilter(failed, 'open'), 'an API failure is not Open');
assert(api.matchesFilter(failed, 'failed'), 'API failure filter still uses isFailed');

assert(api.statusFromLegacyChecklist(legacyDone) === 'complete', 'old Done checkbox becomes Complete once');
assert(
    api.statusFromLegacyChecklist(legacyResubmit) === 'resubmit_required',
    'old Resubmit checkbox wins over Done'
);
assert(
    api.statusFromLegacyChecklist({ listStatus: 'submitted', isDone: true }) === 'submitted',
    'a saved list status is kept'
);

console.log('essay-batch-list-status.test.mjs: all passed');
