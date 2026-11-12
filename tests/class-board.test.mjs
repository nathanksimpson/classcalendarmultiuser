/**
 * Class board API: permissions, own-only edit, soft delete, revisions,
 * concurrent replies/reactions, and student lookup by tms_mpidx.
 * Run: node tests/class-board.test.mjs
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { makeEnv, loadWorker, addUser, grant, client, ROOT } from './support/worker-rig.mjs';

const require = createRequire(import.meta.url);
const core = require(path.join(ROOT, 'shared', 'board-core.cjs'));
const worker = await loadWorker();

let failures = 0;
function check(name, ok, detail) {
    if (!ok) {
        failures += 1;
        console.error(`FAIL ${name}${detail ? ` (${detail})` : ''}`);
    }
}

function setup() {
    const env = makeEnv();
    env.DATA_ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 9).toString('base64');
    const A = client(worker, env, addUser(env, 'ua', 'Teacher Alpha', 'admin'));
    const V = client(worker, env, addUser(env, 'uv', 'Teacher Viewer', 'teacher'));
    const B = client(worker, env, addUser(env, 'ub', 'Teacher Beta', 'teacher'));
    const H = client(worker, env, addUser(env, 'uh', 'Teacher Head', 'head_teacher'));
    const O = client(worker, env, addUser(env, 'uo', 'Teacher Outsider', 'teacher'));
    return { env, A, V, B, H, O };
}

async function makeCalendar(A, env, name, extra) {
    const created = await A('POST', '/api/calendars', {
        name,
        data: Object.assign(
            {
                classes: [
                    {
                        id: 'c1',
                        name: 'Class One',
                        cohortId: 'co1',
                        classTeachers: [{ userId: 'ub', name: 'Beta' }]
                    }
                ],
                cohorts: [
                    {
                        id: 'co1',
                        name: 'Cohort One',
                        homeroomTeacherUserId: 'uh',
                        classIds: ['c1'],
                        students: [
                            { id: 'stu_old', name: 'Stu Old', tmsMpidx: 'mp-100' },
                            { id: 'stu_new', name: 'Stu New', tmsMpidx: 'mp-100' }
                        ]
                    }
                ],
                events: []
            },
            extra || {}
        )
    });
    check(`${name} created`, created.status === 201 || created.status === 200, `status=${created.status}`);
    return created.body && created.body.id;
}

const thumb = core.REACTIONS[0];
const checkMark = core.REACTIONS[1];

{
    const { env, A, V, B, H, O } = setup();
    const id = await makeCalendar(A, env, 'Board Term');
    grant(env, id, 'uv', 'viewer');
    grant(env, id, 'ub', 'editor');
    const before = await A('GET', `/api/calendars/${id}`);
    const posted = await V('POST', `/api/calendars/${id}/board/posts`, {
        boardKind: 'class',
        boardRef: 'c1',
        lessonDate: '2026-11-02',
        body: 'Viewer wrote what happened in class',
        tags: ['parent-consult'],
        students: [{ studentId: 'stu_old', tmsMpidx: 'mp-100' }],
        mentions: ['ub'],
        isSpecial: true
    });
    const after = await A('GET', `/api/calendars/${id}`);
    const post = posted.body && posted.body.post;
    check('view-only account can post', posted.status === 201 && post && post.authorUserId === 'uv', `status=${posted.status}`);
    check('server stamped the author', post && post.authorUserId === 'uv');
    check('board write does not change the calendar revision', before.body.revision === after.body.revision, `${before.body.revision} -> ${after.body && after.body.revision}`);
    const stored = env.DB.raw.prepare('SELECT body, body_enc_version FROM board_posts WHERE id = ?').get(post && post.id);
    check('body is encrypted at rest', stored && Number(stored.body_enc_version) === 1 && String(stored.body).startsWith('enc1$') && !String(stored.body).includes('Viewer wrote'));

    const denied = await O('GET', `/api/calendars/${id}/board/feed`);
    check('no calendar access is hidden', denied.status === 404, `status=${denied.status}`);
    const deniedWrite = await O('POST', `/api/calendars/${id}/board/posts`, {
        boardKind: 'staff',
        body: 'Should not save'
    });
    check('outsider cannot post', deniedWrite.status === 404, `status=${deniedWrite.status}`);

    env.DB.raw.prepare('UPDATE sessions SET view_as_user_id = ? WHERE user_id = ?').run('uv', 'ua');
    const viewAs = await A('POST', `/api/calendars/${id}/board/posts`, {
        boardKind: 'staff',
        body: 'View As must not save'
    });
    check('View As cannot write', viewAs.status === 403 && viewAs.body && viewAs.body.code === 'VIEW_AS_MODE', `status=${viewAs.status} code=${viewAs.body && viewAs.body.code}`);
    env.DB.raw.prepare('UPDATE sessions SET view_as_user_id = NULL WHERE user_id = ?').run('ua');

    const edited = await B('PATCH', `/api/calendars/${id}/board/posts/${post.id}`, { body: 'Beta rewrote it' });
    check('another teacher cannot edit', edited.status === 403, `status=${edited.status}`);
    const ownEdit = await V('PATCH', `/api/calendars/${id}/board/posts/${post.id}`, {
        body: 'Viewer fixed the wording'
    });
    check('author can edit', ownEdit.status === 200 && ownEdit.body.post.body === 'Viewer fixed the wording', `status=${ownEdit.status}`);

    const removed = await H('DELETE', `/api/calendars/${id}/board/posts/${post.id}`);
    check('calendar-access admin can soft-delete', removed.status === 200 && removed.body.post.deleted === true && removed.body.post.body == null, `status=${removed.status}`);
    check('tombstone names who deleted it', removed.body.post.deletedBy === 'uh');
    const revisionCount = env.DB.raw
        .prepare('SELECT COUNT(*) AS n FROM board_revisions WHERE target_id = ?')
        .get(post.id).n;
    const tomb = env.DB.raw.prepare('SELECT deleted_at, body FROM board_posts WHERE id = ?').get(post.id);
    check('edit kept a revision row', revisionCount === 1, `n=${revisionCount}`);
    check('soft delete keeps the row', Boolean(tomb && tomb.deleted_at && tomb.body));

    const fresh = await V('POST', `/api/calendars/${id}/board/posts`, {
        boardKind: 'staff',
        body: 'Two people reply and react together'
    });
    const freshId = fresh.body.post.id;
    const [r1, r2, a1, a2] = await Promise.all([
        V('POST', `/api/calendars/${id}/board/posts/${freshId}/replies`, { body: 'Reply from viewer' }),
        B('POST', `/api/calendars/${id}/board/posts/${freshId}/replies`, { body: 'Reply from beta' }),
        V('POST', `/api/calendars/${id}/board/reactions`, { targetId: freshId, emoji: thumb }),
        B('POST', `/api/calendars/${id}/board/reactions`, { targetId: freshId, emoji: checkMark })
    ]);
    const thread = await A('GET', `/api/calendars/${id}/board/posts/${freshId}`);
    const replyBodies = (thread.body.replies || []).map((reply) => reply.body).sort();
    const emojis = (thread.body.post.reactions || []).map((row) => row.emoji).sort();
    check('concurrent replies both saved', r1.status === 201 && r2.status === 201 && replyBodies.length === 2, `r1=${r1.status} r2=${r2.status} n=${replyBodies.length}`);
    check('both reply texts kept', replyBodies.join('|') === 'Reply from beta|Reply from viewer', replyBodies.join('|'));
    check('concurrent reactions both saved', a1.status === 200 && a2.status === 200 && emojis.length === 2, emojis.join('|'));
    check('both reaction emojis kept', emojis.includes(thumb) && emojis.includes(checkMark), emojis.join('|'));

    // Facebook-style: one reaction per person; picking another replaces it, same again removes it.
    await V('POST', `/api/calendars/${id}/board/reactions`, { targetId: freshId, emoji: checkMark });
    const switched = await A('GET', `/api/calendars/${id}/board/posts/${freshId}`);
    const mineAfterSwitch = (switched.body.post.reactions || []).filter((row) => row.userId === 'uv').map((row) => row.emoji);
    check('switching reaction replaces it', mineAfterSwitch.length === 1 && mineAfterSwitch[0] === checkMark, mineAfterSwitch.join('|'));
    await V('POST', `/api/calendars/${id}/board/reactions`, { targetId: freshId, emoji: checkMark });
    const unreacted = await A('GET', `/api/calendars/${id}/board/posts/${freshId}`);
    check('same reaction again removes it', !(unreacted.body.post.reactions || []).some((row) => row.userId === 'uv'));
    const oldEmoji = await V('POST', `/api/calendars/${id}/board/reactions`, { targetId: freshId, emoji: '\u2705' });
    check('old checkmark reaction is no longer offered', oldEmoji.status === 400, String(oldEmoji.status));

    const logged = env.DB.raw
        .prepare("SELECT COUNT(*) AS n FROM activity_log WHERE action = 'board_post_create' AND calendar_id = ?")
        .get(id).n;
    check('writes are in the activity log', logged >= 1, `n=${logged}`);
}

{
    const { env, A, V, O } = setup();
    const older = await makeCalendar(A, env, 'Old Term');
    const newer = await makeCalendar(A, env, 'New Term');
    grant(env, older, 'uv', 'viewer');
    grant(env, newer, 'uv', 'viewer');
    grant(env, newer, 'uo', 'viewer');
    const posted = await V('POST', `/api/calendars/${older}/board/posts`, {
        boardKind: 'staff',
        body: 'Note from the old student id',
        students: [{ studentId: 'stu_old', tmsMpidx: 'mp-100' }]
    });
    check('tagged post saved', posted.status === 201, `status=${posted.status}`);
    const byTms = await V('GET', '/api/board/students/history?tmsMpidx=mp-100');
    const byNewId = await V('GET', '/api/board/students/history?studentId=stu_new');
    const byOldId = await V('GET', '/api/board/students/history?studentId=stu_old');
    const outsider = await O('GET', '/api/board/students/history?tmsMpidx=mp-100');
    const tmsIds = (byTms.body.posts || []).map((post) => post.id);
    check('history finds the post by tms_mpidx after the student id changed', byTms.status === 200 && tmsIds.includes(posted.body.post.id), `status=${byTms.status} ids=${tmsIds.join(',')}`);
    check('new stu_ id alone does not match the old row', byNewId.status === 200 && (byNewId.body.posts || []).length === 0);
    check('old student id still matches', (byOldId.body.posts || []).some((post) => post.id === posted.body.post.id));
    check('history stays inside calendars the person can open', outsider.status === 200 && (outsider.body.posts || []).length === 0, `n=${outsider.body && outsider.body.posts && outsider.body.posts.length}`);
}

{
    const { env, A, V } = setup();
    const id = await makeCalendar(A, env, 'Import Term', {
        dayNotes: [
            {
                id: 'dn-old',
                classId: 'c1',
                date: '2026-11-02',
                text: 'Old note about class',
                createdAt: '2026-11-02T06:15:00.000Z',
                authorUserId: 'uv',
                categoryId: 'parent-consult',
                taggedStudentIds: ['stu_old']
            },
            {
                id: 'dn-points',
                classId: 'c1',
                date: '2026-11-03',
                text: 'Point noise that should stay out',
                categoryId: 'class-points'
            }
        ]
    });
    grant(env, id, 'uv', 'viewer');
    const first = await V('POST', `/api/calendars/${id}/board/import-day-notes`, {});
    check('day notes import once', first.status === 200 && first.body.imported === 1, JSON.stringify(first.body));
    const second = await V('POST', `/api/calendars/${id}/board/import-day-notes`, {});
    check('day notes import is safe to repeat', second.status === 200 && second.body.imported === 0, JSON.stringify(second.body));
    const board = await V('GET', `/api/calendars/${id}/board?kind=class&ref=c1`);
    const posts = (board.body && board.body.posts) || [];
    check(
        'imported note is on the class board',
        posts.some((post) => post.body === 'Old note about class' && post.authorUserId === 'uv' && (post.tags || []).includes('parent-consult')),
        JSON.stringify(posts.map((post) => post.body))
    );
    check('points notes are not imported', !posts.some((post) => String(post.body || '').includes('Point noise')));
    const oldPost = posts.find((post) => post.body === 'Old note about class');
    check('imported note keeps when it was written', oldPost && oldPost.createdAt === '2026-11-02T06:15:00.000Z', oldPost && oldPost.createdAt);
    const byTms = await V('GET', '/api/board/students/history?tmsMpidx=mp-100');
    check(
        'imported tag keeps tms id',
        (byTms.body.posts || []).some((post) => post.body === 'Old note about class')
    );
}

{
    // Large imports run in chunks so one request never runs long, and resume safely.
    const { env, A, V } = setup();
    const many = [];
    for (let i = 0; i < 45; i += 1) {
        many.push({
            id: `dn-bulk-${i}`,
            classId: 'c1',
            date: '2026-11-04',
            text: `Bulk note ${i}`,
            authorUserId: 'uv',
            taggedStudentIds: i % 2 ? ['stu_old'] : []
        });
    }
    const id = await makeCalendar(A, env, 'Bulk import', { dayNotes: many });
    grant(env, id, 'uv', 'viewer');
    const r1 = await V('POST', `/api/calendars/${id}/board/import-day-notes`, {});
    check('bulk import first chunk', r1.status === 200 && r1.body.imported === 40 && r1.body.remaining === 5, JSON.stringify(r1.body));
    const r2 = await V('POST', `/api/calendars/${id}/board/import-day-notes`, {});
    check('bulk import second chunk', r2.status === 200 && r2.body.imported === 5 && r2.body.remaining === 0, JSON.stringify(r2.body));
    const r3 = await V('POST', `/api/calendars/${id}/board/import-day-notes`, {});
    check('bulk import done is a no-op', r3.status === 200 && r3.body.imported === 0 && r3.body.remaining === 0, JSON.stringify(r3.body));
    const count = env.DB.raw.prepare('SELECT count(*) AS n FROM board_posts WHERE calendar_id = ?').get(id).n;
    check('bulk import made no duplicates', count === 45, String(count));
    const links = env.DB.raw.prepare('SELECT count(*) AS n FROM board_post_students WHERE calendar_id = ?').get(id).n;
    check('bulk import linked tagged students', links === 22, String(links));
}

{
    // Newest / oldest sort, with paging in both directions, and repair of old copy times.
    const { env, A, V } = setup();
    const notes = [];
    for (let i = 0; i < 5; i += 1) {
        notes.push({
            id: `dn-ord-${i}`,
            classId: 'c1',
            date: `2026-11-0${i + 1}`,
            text: `Order note ${i}`,
            createdAt: `2026-11-0${i + 1}T05:00:00.000Z`,
            authorUserId: 'uv'
        });
    }
    const id = await makeCalendar(A, env, 'Order term', { dayNotes: notes });
    grant(env, id, 'uv', 'viewer');
    await V('POST', `/api/calendars/${id}/board/import-day-notes`, {});
    // Simulate posts copied by the first release, which stamped the copy time.
    env.DB.raw.prepare("UPDATE board_posts SET created_at = '2026-11-12T04:27:40.000Z' WHERE calendar_id = ?").run(id);
    const fix = await V('POST', `/api/calendars/${id}/board/import-day-notes`, {});
    check('re-running import repairs copy times', fix.body.repaired === 5, JSON.stringify(fix.body));
    const order = async (o) => {
        const all = [];
        let cursor = '';
        for (let k = 0; k < 5; k += 1) {
            const res = await V('GET', `/api/calendars/${id}/board?kind=class&ref=c1&limit=2&order=${o}${cursor ? `&cursor=${cursor}` : ''}`);
            (res.body.posts || []).forEach((post) => all.push(post.body));
            if (!res.body.nextCursor) {
                break;
            }
            cursor = res.body.nextCursor;
        }
        return all;
    };
    const newest = await order('newest');
    const oldest = await order('oldest');
    check('newest first, paged', newest.join('|') === 'Order note 4|Order note 3|Order note 2|Order note 1|Order note 0', newest.join('|'));
    check('oldest first, paged', oldest.join('|') === 'Order note 0|Order note 1|Order note 2|Order note 3|Order note 4', oldest.join('|'));
    const feedOld = await V('GET', `/api/calendars/${id}/board/feed?scope=all&order=oldest`);
    check('feed sorts oldest first too', (feedOld.body.posts || [])[0] && feedOld.body.posts[0].body === 'Order note 0', JSON.stringify((feedOld.body.posts || []).map((p) => p.body)));
    const bad = await V('GET', `/api/calendars/${id}/board?kind=class&ref=c1&order=sideways`);
    check('bad sort order is refused', bad.status === 400, String(bad.status));
}

if (failures) {
    console.error(`\n${failures} class-board check(s) failed`);
    process.exit(1);
}
console.log('class-board.test.mjs: all passed');
