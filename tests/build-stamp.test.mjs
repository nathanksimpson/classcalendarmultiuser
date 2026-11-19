/**
 * Top-left deploy stamp. Run: node tests/build-stamp.test.mjs
 */
import { formatBuildStamp } from '../scripts/build-assets.mjs';

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

{
    const stamp = formatBuildStamp(new Date('2026-11-18T11:03:05Z'), 'efc91874b907da67d2ed0707732ad73f108f4f9d');
    assert(stamp.short === '11/18 20:03 · efc9187', 'top-left stamp shows KST time and the short commit');
    assert(stamp.full === '2026-11-18 20:03 KST · efc9187', 'account menu shows the full stamp');
    assert(stamp.title === 'Last update: 2026-11-18 20:03 KST · efc9187', 'tooltip names the update');
}

{
    const local = formatBuildStamp(new Date('2026-11-19T00:00:00Z'), '');
    assert(local.short === '11/19 09:00', 'a local copy without a commit still shows the time');
    assert(!local.short.includes('·'), 'no empty commit marker');
    assert(local.full === '2026-11-19 09:00 KST', 'full line has no dangling separator');
}

console.log('build-stamp.test.mjs: all passed');
