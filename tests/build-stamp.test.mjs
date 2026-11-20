/**
 * Top-left deploy stamp. Run: node tests/build-stamp.test.mjs
 */
import { formatBuildStamp, noteFromCommitMessage, pickUpdateNote } from '../scripts/build-assets.mjs';

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

{
    const squash = 'Show the deploy commit in the top-left version stamp (#37)\n\nCo-authored-by: Cursor Agent <cursoragent@cursor.com>';
    assert(noteFromCommitMessage(squash) === 'Show the deploy commit in the top-left version stamp', 'squash subject is the note, without the PR number');
    const githubMerge = 'Merge pull request #35 from nathanksimpson/claude/project-thread-gw3dyi\n\nTMS cleanup: one sign-in, one timetable pull, one name reader';
    assert(noteFromCommitMessage(githubMerge) === 'TMS cleanup: one sign-in, one timetable pull, one name reader', 'a GitHub merge uses the title under the merge line');
    assert(noteFromCommitMessage("Merge remote-tracking branch 'origin/main' into claude/project-thread") === '', 'a branch sync is not an update note');
    const walked = pickUpdateNote([
        "Merge remote-tracking branch 'origin/main' into feature",
        'Cohorts: no duplicate warnings for same-subject classes'
    ]);
    assert(walked === 'Cohorts: no duplicate warnings for same-subject classes', 'skip an empty merge and use the next commit, whoever wrote it');
    const stamp = formatBuildStamp(new Date('2026-11-20T04:56:00Z'), '9959e99def', walked);
    assert(stamp.short === '11/20 13:56 · Cohorts: no duplicate warnings for same-subject classes', 'top bar shows the note');
    assert(stamp.full.includes('9959e99') && stamp.full.includes(walked), 'account line keeps the hash and the note');
    assert(stamp.title.startsWith('Last update:'), 'tooltip still names the update');
}

console.log('build-stamp.test.mjs: all passed');
