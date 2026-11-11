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

if (failures) {
    console.error(`\n${failures} class-board check(s) failed`);
    process.exit(1);
}
console.log('class-board.test.mjs: all passed');
