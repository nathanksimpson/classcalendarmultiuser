/**
 * Run: node tests/class-cohort-save.test.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const core = require(path.join(root, 'shared', 'class-cohort-form-core.cjs'));

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

assert(
    core.shouldBlockClassSaveForMissingCohort(true, [], '') === false,
    'admin save without cohort is not blocked'
);
assert(
    core.shouldBlockClassSaveForMissingCohort(true, ['cohort-a'], '') === false,
    'admin save with cohort chips is not blocked'
);

const draft = core.buildNewClassCohortDraft('cohort-a');
assert(draft.cohortId === 'cohort-a', 'draft primary cohort id');
assert(
    draft.cohortIds.length === 1 && draft.cohortIds[0] === 'cohort-a',
    'draft cohortIds includes primary'
);
assert(
    core.buildNewClassCohortDraft('').cohortIds.length === 0,
    'empty cohort id yields empty draft'
);

const sorted = core.sortCohortsForClassSelect([
    { id: 'b', name: '3T' },
    { id: 'a', name: '3M' },
    { id: '', name: 'skip' },
    null
]);
assert(sorted.length === 2 && sorted[0].id === 'a', 'cohorts sorted by display name');
assert(sorted[1].id === 'b', 'second cohort sorted');

console.log('class-cohort-save.test.mjs: all passed');
