/**
 * Run: node tests/schedule-migrate.test.mjs
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Load schedule-core in Node
const schedulePath = path.join(root, 'js', 'schedule-core.js');
await import(pathToFileURL(schedulePath).href);

const { CCPSchedule } = globalThis;

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

// buildLessonGroups: merge days 2+3
{
    const { groups } = CCPSchedule.buildLessonGroups(4, [2]);
    assert(groups.length === 3, 'expected 3 groups after one merge');
    assert(groups[1].compressed === true, 'second group should be compressed');
    assert(groups[1].days.length === 2, 'merged group spans 2 days');
}

// mergePlanToFit auto: 4 lessons, 2 slots
{
    const merges = CCPSchedule.mergePlanToFit(2, 4, [], 'autoWhenNeeded');
    const { groups } = CCPSchedule.buildLessonGroups(4, merges);
    assert(groups.length <= 2, 'auto merge should fit 2 slots');
}

// normalizeCompressionMerges rejects overlapping
{
    const m = CCPSchedule.normalizeCompressionMerges([1, 2], 6);
    assert(m.length === 1, 'overlapping merges collapse to one start');
}

// sanitizeTotalLessons
assert(CCPSchedule.sanitizeTotalLessons('x') === 1, 'invalid -> 1');
assert(CCPSchedule.sanitizeTotalLessons(8) === 8, 'valid passthrough');

console.log('All schedule-migrate tests passed.');
