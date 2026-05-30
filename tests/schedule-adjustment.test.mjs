/**
 * Run: node tests/schedule-adjustment.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'schedule-core.js')).href);

const { CCPSchedule } = globalThis;

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

{
    const { groups, skipped } = CCPSchedule.buildScheduleGroups(6, [1], [5, 6], null);
    assert(groups.length === 3, 'merge 1+2, lesson 3, skip 5-6');
    assert(skipped.length === 2 && skipped[0] === 5, 'skipped 5-6');
}

{
    const ranges = CCPSchedule.skippedLessonsToRanges([11, 12, 13, 15]);
    assert(ranges.length === 2, 'two skip ranges');
    assert(ranges[0].start === 11 && ranges[0].end === 13, 'first range');
}

{
    const order = CCPSchedule.getUnitPairMergeStartPreferenceOrder(8);
    assert(order[0] === 1, 'prefer unit-pair merge at 1');
    assert(order[1] === 3, 'then 3');
}

{
    const result = CCPSchedule.proposeScheduleFit(3, 6, {
        mergeStartOrder: [1, 3, 5, 2, 4]
    });
    const { groups } = CCPSchedule.buildScheduleGroups(6, result.merges, result.skipped, null);
    assert(groups.length <= 3, 'fits in 3 slots');
}

{
    const empty = CCPSchedule.resolveCompressionMergesFromSources(true, [], [1, 3], 8);
    assert(empty.length === 0, 'adjustment table with no merges returns [], not legacy');
    const legacy = CCPSchedule.resolveCompressionMergesFromSources(false, [], [1, 3], 8);
    assert(legacy.length === 2 && legacy[0] === 1, 'legacy path when no adjustment table');
}

console.log('schedule-adjustment.test.mjs: ok');
