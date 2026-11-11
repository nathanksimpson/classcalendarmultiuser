/**
 * Class board rules shared by the local server and the Cloudflare Worker.
 * Posts live outside the calendar document. Bodies are encrypted by the caller.
 */
const Auth = require('./auth-permissions.cjs');

const BOARD_KINDS = ['class', 'cohort', 'staff'];
const KIND_SET = new Set(BOARD_KINDS);
/** Fixed reaction set. One of each per person per post or reply. */
const REACTIONS = ['\u{1F44D}', '\u2705', '\u{1F440}', '\u2764\uFE0F'];
const REACTION_SET = new Set(REACTIONS);

const BODY_MAX = 8000;
const TAG_MAX = 12;
const TAG_LEN = 40;
const STUDENT_MAX = 30;
const MENTION_MAX = 20;
const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;
const SEARCH_SCAN = 200;
const PIN_MAX = 50;
const INBOX_LIMIT = 50;

const POST_SELECT = `id, calendar_id AS calendarId, board_kind AS boardKind, board_ref AS boardRef,
    lesson_date AS lessonDate, author_user_id AS authorUserId,
    body, body_enc_version AS bodyEncVersion, body_key_wrapped AS bodyKeyWrapped,
    tags_json AS tagsJson, is_special AS isSpecial,
    created_at AS createdAt, updated_at AS updatedAt,
    deleted_at AS deletedAt, deleted_by AS deletedBy`;

const REPLY_SELECT = `id, post_id AS postId, author_user_id AS authorUserId,
    body, body_enc_version AS bodyEncVersion, body_key_wrapped AS bodyKeyWrapped,
    created_at AS createdAt, updated_at AS updatedAt,
    deleted_at AS deletedAt, deleted_by AS deletedBy`;

const CALENDAR_DELETE_STEPS = [
    {
        sql: `DELETE FROM board_reactions WHERE target_id IN (
            SELECT id FROM board_posts WHERE calendar_id = ?
            UNION
            SELECT r.id FROM board_replies r
            INNER JOIN board_posts p ON p.id = r.post_id
            WHERE p.calendar_id = ?
        )`,
        params: (id) => [id, id]
    },
    {
        sql: `DELETE FROM board_revisions WHERE target_id IN (
            SELECT id FROM board_posts WHERE calendar_id = ?
            UNION
            SELECT r.id FROM board_replies r
            INNER JOIN board_posts p ON p.id = r.post_id
            WHERE p.calendar_id = ?
        )`,
        params: (id) => [id, id]
    },
    {
        sql: 'DELETE FROM board_post_students WHERE calendar_id = ?',
        params: (id) => [id]
    },
    {
        sql: `DELETE FROM board_post_mentions WHERE post_id IN (
            SELECT id FROM board_posts WHERE calendar_id = ?
        )`,
        params: (id) => [id]
    },
    {
        sql: `DELETE FROM board_replies WHERE post_id IN (
            SELECT id FROM board_posts WHERE calendar_id = ?
        )`,
        params: (id) => [id]
    },
    {
        sql: 'DELETE FROM board_read_state WHERE calendar_id = ?',
        params: (id) => [id]
    },
    {
        sql: 'DELETE FROM board_posts WHERE calendar_id = ?',
        params: (id) => [id]
    }
];

function boardError(message, status, code) {
    const err = new Error(message);
    err.status = status;
    err.code = code;
    return err;
}

function qstr(query, key) {
    if (!query) {
        return '';
    }
    const value = query[key];
    if (Array.isArray(value)) {
        return value.length ? String(value[0] == null ? '' : value[0]) : '';
    }
    return value == null ? '' : String(value);
}

function hasOwn(obj, key) {
    return Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}

function boardKey(kind, ref) {
    return kind === 'staff' ? 'staff' : `${kind}:${ref}`;
}

function teachesClass(cls, userId) {
    if (!cls || !userId) {
        return false;
    }
    const uid = String(userId);
    if (String(cls.assignedTeacherUserId || '') === uid) {
        return true;
    }
    return (
        Array.isArray(cls.classTeachers) &&
        cls.classTeachers.some((row) => row && String(row.userId || '') === uid)
    );
}

function classInCohort(cls, cohort) {
    if (!cls || !cohort) {
        return false;
    }
    if (cls.cohortId === cohort.id) {
        return true;
    }
    if (Array.isArray(cls.cohortIds) && cls.cohortIds.includes(cohort.id)) {
        return true;
    }
    return Array.isArray(cohort.classIds) && cohort.classIds.includes(cls.id);
}

/** Class, cohort, and staff boards that belong on this person's feed. */
function mineBoardKeys(userId, data) {
    const keys = [{ kind: 'staff', ref: '' }];
    const uid = String(userId || '');
    const classes = (data && data.classes) || [];
    const taught = [];
    classes.forEach((cls) => {
        if (cls && cls.id && teachesClass(cls, uid)) {
            taught.push(cls);
            keys.push({ kind: 'class', ref: String(cls.id) });
        }
    });
    ((data && data.cohorts) || []).forEach((cohort) => {
        if (!cohort || !cohort.id || cohort.isArchiveCohort) {
            return;
        }
        const homeroom = String(cohort.homeroomTeacherUserId || '') === uid;
        const teachesOne = taught.some((cls) => classInCohort(cls, cohort));
        if (homeroom || teachesOne) {
            keys.push({ kind: 'cohort', ref: String(cohort.id) });
        }
    });
    return keys;
}

/**
 * Teachers to tell about a 특이사항 post: class teachers of classes the tagged
 * students are in, plus that cohort's homeroom teacher. No tags means nobody.
 */
function notifyUserIdsForSpecial(data, students) {
    const studentIds = new Set();
    const tmsIds = new Set();
    (students || []).forEach((row) => {
        if (!row) {
            return;
        }
        if (row.studentId) {
            studentIds.add(String(row.studentId));
        }
        if (row.tmsMpidx) {
            tmsIds.add(String(row.tmsMpidx));
        }
    });
    if (!studentIds.size && !tmsIds.size) {
        return [];
    }
    const notify = new Set();
    const classes = (data && data.classes) || [];
    ((data && data.cohorts) || []).forEach((cohort) => {
        if (!cohort || cohort.isArchiveCohort) {
            return;
        }
        const hit = (cohort.students || []).some((student) => {
            if (!student) {
                return false;
            }
            if (student.id && studentIds.has(String(student.id))) {
                return true;
            }
            const mp = String(student.tmsMpidx || '');
            return Boolean(mp) && tmsIds.has(mp);
        });
        if (!hit) {
            return;
        }
        if (cohort.homeroomTeacherUserId) {
            notify.add(String(cohort.homeroomTeacherUserId));
        }
        classes.forEach((cls) => {
            if (!classInCohort(cls, cohort)) {
                return;
            }
            if (cls.assignedTeacherUserId) {
                notify.add(String(cls.assignedTeacherUserId));
            }
            (cls.classTeachers || []).forEach((row) => {
                if (row && row.userId) {
                    notify.add(String(row.userId));
                }
            });
        });
    });
    return Array.from(notify);
}

function normalizeKindRef(kindRaw, refRaw) {
    const kind = String(kindRaw || '').trim();
    if (!KIND_SET.has(kind)) {
        return { error: 'Board must be class, cohort, or staff' };
    }
    if (kind === 'staff') {
        return { kind, ref: '' };
    }
    const ref = String(refRaw == null ? '' : refRaw).trim();
    if (!ref) {
        return { error: 'Choose a class or cohort' };
    }
    if (ref.length > 80) {
        return { error: 'Board reference is too long' };
    }
    return { kind, ref };
}

function validateBody(raw) {
    const body = String(raw == null ? '' : raw);
    if (!body.trim()) {
        return { error: 'Say what happened in class' };
    }
    if (body.length > BODY_MAX) {
        return { error: 'Note is too long' };
    }
    return { body };
}

function validateLessonDate(raw) {
    if (raw == null || raw === '') {
        return { date: null };
    }
    const date = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { error: 'Lesson date must be YYYY-MM-DD' };
    }
    const parts = date.split('-').map(Number);
    const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (
        dt.getUTCFullYear() !== parts[0] ||
        dt.getUTCMonth() !== parts[1] - 1 ||
        dt.getUTCDate() !== parts[2]
    ) {
        return { error: 'Lesson date must be YYYY-MM-DD' };
    }
    return { date };
}

function validateTags(raw) {
    if (raw == null) {
        return { tags: [] };
    }
    if (!Array.isArray(raw)) {
        return { error: 'Tags must be a list' };
    }
    if (raw.length > TAG_MAX) {
        return { error: 'Too many tags' };
    }
    const tags = [];
    const seen = new Set();
    for (const item of raw) {
        const tag = String(item == null ? '' : item).trim().replace(/^#/, '');
        if (!tag) {
            continue;
        }
        if (tag.length > TAG_LEN || /[\u0000-\u001f]/.test(tag)) {
            return { error: 'Invalid tag' };
        }
        if (seen.has(tag)) {
            continue;
        }
        seen.add(tag);
        tags.push(tag);
    }
    return { tags };
}

function validateStudents(raw) {
    if (raw == null) {
        return { students: [] };
    }
    if (!Array.isArray(raw)) {
        return { error: 'Students must be a list' };
    }
    if (raw.length > STUDENT_MAX) {
        return { error: 'Too many students' };
    }
    const students = [];
    const seen = new Set();
    for (const item of raw) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return { error: 'Invalid student tag' };
        }
        const studentId = String(item.studentId || item.student_id || '').trim();
        const tmsMpidx = String(item.tmsMpidx || item.tms_mpidx || '').trim();
        if (!studentId && !tmsMpidx) {
            continue;
        }
        if (studentId.length > 80 || tmsMpidx.length > 80) {
            return { error: 'Student id is too long' };
        }
        const key = `${studentId}\u0000${tmsMpidx}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        students.push({ studentId, tmsMpidx });
    }
    return { students };
}

function validateMentions(raw) {
    if (raw == null) {
        return { mentions: [] };
    }
    if (!Array.isArray(raw)) {
        return { error: 'Mentions must be a list' };
    }
    if (raw.length > MENTION_MAX) {
        return { error: 'Too many mentions' };
    }
    const mentions = [];
    const seen = new Set();
    for (const item of raw) {
        const id = String(item == null ? '' : item).trim();
        if (!id) {
            continue;
        }
        if (id.length > 80) {
            return { error: 'Mention is too long' };
        }
        if (seen.has(id)) {
            continue;
        }
        seen.add(id);
        mentions.push(id);
    }
    return { mentions };
}

function validateSpecial(raw) {
    if (raw == null || raw === false || raw === 0 || raw === '0' || raw === 'false') {
        return { isSpecial: 0 };
    }
    if (raw === true || raw === 1 || raw === '1' || raw === 'true') {
        return { isSpecial: 1 };
    }
    return { error: 'isSpecial must be true or false' };
}

function takeChecked(result, status, code) {
    if (result.error) {
        throw boardError(result.error, status || 400, code);
    }
    return result;
}

function canEditOwn(user, authorUserId) {
    return Boolean(user && authorUserId) && String(user.id) === String(authorUserId);
}

function canSoftDelete(user, authorUserId) {
    if (canEditOwn(user, authorUserId)) {
        return true;
    }
    return Auth.hasPermission(user, Auth.PERMS.MANAGE_CALENDAR_ACCESS);
}

function pageLimit(query) {
    const raw = qstr(query, 'limit');
    if (!raw) {
        return PAGE_DEFAULT;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || Math.floor(n) !== n || n < 1 || n > PAGE_MAX) {
        throw boardError('limit must be from 1 to 50', 400, 'BOARD_LIMIT');
    }
    return n;
}

function encodeCursor(createdAt, id) {
    return Buffer.from(JSON.stringify({ t: createdAt, id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
    if (!cursor) {
        return null;
    }
    try {
        const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
        if (!parsed || typeof parsed.t !== 'string' || typeof parsed.id !== 'string') {
            return null;
        }
        if (!parsed.t || !parsed.id || parsed.t.length > 40 || parsed.id.length > 80) {
            return null;
        }
        return parsed;
    } catch (_) {
        return null;
    }
}

function readCursor(query) {
    const raw = qstr(query, 'cursor');
    if (!raw) {
        return null;
    }
    const decoded = decodeCursor(raw);
    if (!decoded) {
        throw boardError('Invalid page cursor', 400, 'BOARD_CURSOR');
    }
    return decoded;
}

function snippetAround(text, query) {
    const hay = String(text || '').replace(/\s+/g, ' ').trim();
    const needle = String(query || '').trim().toLowerCase();
    const idx = hay.toLowerCase().indexOf(needle);
    if (idx < 0) {
        return '';
    }
    const start = Math.max(0, idx - 40);
    const end = Math.min(hay.length, idx + needle.length + 40);
    let snip = hay.slice(start, end).trim();
    if (start > 0) {
        snip = `…${snip}`;
    }
    if (end < hay.length) {
        snip = `${snip}…`;
    }
    return snip;
}

function placeholders(list) {
    return list.map(() => '?').join(', ');
}

function groupBy(rows, key) {
    const map = new Map();
    (rows || []).forEach((row) => {
        const id = String(row[key]);
        if (!map.has(id)) {
            map.set(id, []);
        }
        map.get(id).push(row);
    });
    return map;
}

async function requireCalendar(ctx, user, calendarId) {
    if (!calendarId || !(await ctx.canAccess(user, calendarId)) || !(await ctx.calendarExists(calendarId))) {
        throw boardError('Calendar not found', 404, 'BOARD_NOT_FOUND');
    }
}

async function loadNames(ctx, ids) {
    const unique = Array.from(new Set((ids || []).filter(Boolean).map(String)));
    const map = new Map();
    if (!unique.length) {
        return map;
    }
    const rows = await ctx.db.all(
        `SELECT id, display_name AS displayName FROM users WHERE id IN (${placeholders(unique)})`,
        unique
    );
    rows.forEach((row) => {
        map.set(String(row.id), row.displayName || '');
    });
    return map;
}

function plainBody(ctx, row) {
    if (!row || row.deletedAt) {
        return '';
    }
    const text = ctx.decrypt(row, row.id);
    return text == null ? '' : String(text);
}

function publicPost(row, extras, names) {
    const deleted = Boolean(row.deletedAt);
    const students = (extras.students.get(String(row.id)) || []).map((s) => ({
        studentId: s.studentId || '',
        tmsMpidx: s.tmsMpidx || ''
    }));
    const mentions = (extras.mentions.get(String(row.id)) || []).map((m) => m.userId);
    let tags = [];
    try {
        const parsed = JSON.parse(row.tagsJson || '[]');
        tags = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        tags = [];
    }
    return {
        id: row.id,
        calendarId: row.calendarId,
        boardKind: row.boardKind,
        boardRef: row.boardRef || '',
        boardKey: boardKey(row.boardKind, row.boardRef || ''),
        lessonDate: row.lessonDate || null,
        authorUserId: row.authorUserId,
        authorName: names.get(String(row.authorUserId)) || '',
        body: deleted ? null : extras.bodies.get(String(row.id)) || '',
        tags,
        isSpecial: Number(row.isSpecial) === 1,
        students,
        mentions,
        reactions: extras.reactions.get(String(row.id)) || [],
        replyCount: extras.replyCounts.get(String(row.id)) || 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deleted: deleted,
        deletedAt: row.deletedAt || null,
        deletedBy: row.deletedBy || null,
        deletedByName: row.deletedBy ? names.get(String(row.deletedBy)) || '' : null
    };
}

function publicReply(row, reactions, names, bodyText) {
    const deleted = Boolean(row.deletedAt);
    return {
        id: row.id,
        postId: row.postId,
        authorUserId: row.authorUserId,
        authorName: names.get(String(row.authorUserId)) || '',
        body: deleted ? null : bodyText,
        reactions: reactions.get(String(row.id)) || [],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deleted: deleted,
        deletedAt: row.deletedAt || null,
        deletedBy: row.deletedBy || null,
        deletedByName: row.deletedBy ? names.get(String(row.deletedBy)) || '' : null
    };
}

async function sideMaps(ctx, postRows) {
    const postIds = postRows.map((row) => row.id);
    const students = new Map();
    const mentions = new Map();
    const reactions = new Map();
    const replyCounts = new Map();
    const bodies = new Map();
    if (!postIds.length) {
        return { students, mentions, reactions, replyCounts, bodies };
    }
    const ph = placeholders(postIds);
    const studentRows = await ctx.db.all(
        `SELECT post_id AS postId, student_id AS studentId, tms_mpidx AS tmsMpidx
         FROM board_post_students WHERE post_id IN (${ph})`,
        postIds
    );
    const mentionRows = await ctx.db.all(
        `SELECT post_id AS postId, user_id AS userId FROM board_post_mentions WHERE post_id IN (${ph})`,
        postIds
    );
    const countRows = await ctx.db.all(
        `SELECT post_id AS postId, COUNT(*) AS n FROM board_replies
         WHERE post_id IN (${ph}) AND deleted_at IS NULL GROUP BY post_id`,
        postIds
    );
    const reactionRows = await ctx.db.all(
        `SELECT target_id AS targetId, user_id AS userId, emoji, created_at AS createdAt
         FROM board_reactions WHERE target_id IN (${ph}) ORDER BY created_at ASC`,
        postIds
    );
    groupBy(studentRows, 'postId').forEach((list, id) => students.set(id, list));
    groupBy(mentionRows, 'postId').forEach((list, id) => mentions.set(id, list));
    countRows.forEach((row) => replyCounts.set(String(row.postId), Number(row.n) || 0));
    const named = await reactionMap(ctx, reactionRows);
    named.forEach((list, id) => reactions.set(id, list));
    postRows.forEach((row) => {
        if (!row.deletedAt) {
            bodies.set(String(row.id), plainBody(ctx, row));
        }
    });
    return { students, mentions, reactions, replyCounts, bodies };
}

async function reactionMap(ctx, reactionRows) {
    const names = await loadNames(
        ctx,
        (reactionRows || []).map((row) => row.userId)
    );
    const map = new Map();
    (reactionRows || []).forEach((row) => {
        const id = String(row.targetId);
        if (!map.has(id)) {
            map.set(id, []);
        }
        map.get(id).push({
            emoji: row.emoji,
            userId: row.userId,
            userName: names.get(String(row.userId)) || '',
            createdAt: row.createdAt
        });
    });
    return map;
}

async function presentPosts(ctx, rows) {
    const extras = await sideMaps(ctx, rows);
    const names = await loadNames(
        ctx,
        rows.flatMap((row) => [row.authorUserId, row.deletedBy])
    );
    return rows.map((row) => publicPost(row, extras, names));
}

async function getPostRow(ctx, calendarId, postId) {
    return ctx.db.one(
        `SELECT ${POST_SELECT} FROM board_posts WHERE id = ? AND calendar_id = ?`,
        [postId, calendarId]
    );
}

function assertTargetExists(data, kind, ref) {
    if (kind === 'staff') {
        return;
    }
    if (!data) {
        throw boardError('Calendar not found', 404, 'BOARD_NOT_FOUND');
    }
    if (kind === 'class') {
        const ok = (data.classes || []).some((cls) => cls && String(cls.id) === ref);
        if (!ok) {
            throw boardError('Unknown class', 400, 'BOARD_REF');
        }
        return;
    }
    const ok = (data.cohorts || []).some(
        (cohort) => cohort && String(cohort.id) === ref && !cohort.isArchiveCohort
    );
    if (!ok) {
        throw boardError('Unknown cohort', 400, 'BOARD_REF');
    }
}

async function replaceStudents(ctx, postId, calendarId, students) {
    await ctx.db.run('DELETE FROM board_post_students WHERE post_id = ?', [postId]);
    for (const student of students) {
        await ctx.db.run(
            `INSERT INTO board_post_students (post_id, calendar_id, student_id, tms_mpidx)
             VALUES (?, ?, ?, ?)`,
            [postId, calendarId, student.studentId, student.tmsMpidx]
        );
    }
}

async function replaceMentions(ctx, postId, mentions) {
    await ctx.db.run('DELETE FROM board_post_mentions WHERE post_id = ?', [postId]);
    for (const userId of mentions) {
        await ctx.db.run(
            'INSERT INTO board_post_mentions (post_id, user_id) VALUES (?, ?)',
            [postId, userId]
        );
    }
}

async function logWrite(ctx, user, calendarId, action, summary, detail) {
    const calendarName = await ctx.calendarName(calendarId);
    await ctx.record(user, {
        action,
        calendarId,
        calendarName: calendarName || '',
        summary,
        detail
    });
}

function appendCommonFilters(where, params, query) {
    const from = qstr(query, 'from');
    const to = qstr(query, 'to');
    const tag = qstr(query, 'tag').trim().replace(/^#/, '');
    const author = qstr(query, 'author') || qstr(query, 'authorId');
    const special = qstr(query, 'special');
    const studentId = qstr(query, 'studentId').trim();
    const tmsMpidx = qstr(query, 'tmsMpidx').trim();
    if (from) {
        const checked = takeChecked(validateLessonDate(from), 400, 'BOARD_DATE');
        where.push('lesson_date >= ?');
        params.push(checked.date);
    }
    if (to) {
        const checked = takeChecked(validateLessonDate(to), 400, 'BOARD_DATE');
        where.push('lesson_date <= ?');
        params.push(checked.date);
    }
    if (author) {
        where.push('author_user_id = ?');
        params.push(author);
    }
    if (special === '1' || special === 'true') {
        where.push('is_special = 1');
    }
    if (tag) {
        where.push(
            'EXISTS (SELECT 1 FROM json_each(board_posts.tags_json) je WHERE je.value = ?)'
        );
        params.push(tag);
    }
    if (studentId || tmsMpidx) {
        where.push(
            `EXISTS (
                SELECT 1 FROM board_post_students s
                WHERE s.post_id = board_posts.id
                  AND ((? != '' AND s.student_id = ?) OR (? != '' AND s.tms_mpidx = ?))
            )`
        );
        params.push(studentId, studentId, tmsMpidx, tmsMpidx);
    }
}

function appendCursor(where, params, cursor) {
    if (!cursor) {
        return;
    }
    where.push('(created_at < ? OR (created_at = ? AND id < ?))');
    params.push(cursor.t, cursor.t, cursor.id);
}

async function selectPosts(ctx, where, params, limit) {
    const sql = `SELECT ${POST_SELECT} FROM board_posts
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC, id DESC
        LIMIT ?`;
    return ctx.db.all(sql, params.concat([limit]));
}

async function listBoard(ctx, user, calendarId, query) {
    await requireCalendar(ctx, user, calendarId);
    const kindRef = takeChecked(
        normalizeKindRef(qstr(query, 'kind'), qstr(query, 'ref')),
        400,
        'BOARD_KIND'
    );
    const limit = pageLimit(query);
    const cursor = readCursor(query);
    const where = ['calendar_id = ?', 'board_kind = ?', 'board_ref = ?'];
    const params = [calendarId, kindRef.kind, kindRef.ref];
    appendCommonFilters(where, params, query);
    const specialOnly = qstr(query, 'special') === '1' || qstr(query, 'special') === 'true';
    let pinned = [];
    const pageWhere = where.slice();
    const pageParams = params.slice();
    if (!specialOnly) {
        pageWhere.push('NOT (is_special = 1 AND deleted_at IS NULL)');
    }
    if (!cursor && !specialOnly) {
        const pinWhere = where.concat(['is_special = 1', 'deleted_at IS NULL']);
        pinned = await selectPosts(ctx, pinWhere, params.slice(), PIN_MAX);
    }
    appendCursor(pageWhere, pageParams, cursor);
    const page = await selectPosts(ctx, pageWhere, pageParams, limit + 1);
    const hasMore = page.length > limit;
    const slice = hasMore ? page.slice(0, limit) : page;
    const posts = await presentPosts(ctx, pinned.concat(slice));
    const last = slice[slice.length - 1];
    const read = await ctx.db.one(
        `SELECT last_read_at AS lastReadAt FROM board_read_state
         WHERE user_id = ? AND calendar_id = ? AND board_key = ?`,
        [user.id, calendarId, boardKey(kindRef.kind, kindRef.ref)]
    );
    const newest = await ctx.db.one(
        `SELECT MAX(created_at) AS newest FROM board_posts
         WHERE calendar_id = ? AND board_kind = ? AND board_ref = ? AND deleted_at IS NULL`,
        [calendarId, kindRef.kind, kindRef.ref]
    );
    const lastReadAt = read && read.lastReadAt ? read.lastReadAt : null;
    const newestAt = newest && newest.newest ? newest.newest : null;
    return {
        status: 200,
        body: {
            boardKind: kindRef.kind,
            boardRef: kindRef.ref,
            boardKey: boardKey(kindRef.kind, kindRef.ref),
            posts,
            nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
            lastReadAt,
            hasUnread: Boolean(newestAt) && (!lastReadAt || newestAt > lastReadAt)
        }
    };
}

async function listFeed(ctx, user, calendarId, query) {
    await requireCalendar(ctx, user, calendarId);
    const scope = qstr(query, 'scope') || 'mine';
    if (scope !== 'mine' && scope !== 'all') {
        throw boardError('scope must be mine or all', 400, 'BOARD_SCOPE');
    }
    const limit = pageLimit(query);
    const cursor = readCursor(query);
    const where = ['calendar_id = ?'];
    const params = [calendarId];
    const data = await ctx.loadCalendar(calendarId);
    if (scope === 'mine') {
        if (!data) {
            throw boardError('Calendar not found', 404, 'BOARD_NOT_FOUND');
        }
        const keys = mineBoardKeys(user.id, data);
        const parts = keys.map(() => '(board_kind = ? AND board_ref = ?)');
        where.push(`(${parts.join(' OR ')})`);
        keys.forEach((key) => {
            params.push(key.kind, key.ref);
        });
    }
    appendCommonFilters(where, params, query);
    appendCursor(where, params, cursor);
    const page = await selectPosts(ctx, where, params, limit + 1);
    const hasMore = page.length > limit;
    const slice = hasMore ? page.slice(0, limit) : page;
    const last = slice[slice.length - 1];
    const unreadBoards = data
        ? await unreadBoardList(ctx, user, calendarId, mineBoardKeys(user.id, data))
        : [];
    return {
        status: 200,
        body: {
            scope,
            posts: await presentPosts(ctx, slice),
            nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
            unreadBoards
        }
    };
}

async function unreadBoardList(ctx, user, calendarId, keys) {
    if (!keys.length) {
        return [];
    }
    const parts = keys.map(() => '(board_kind = ? AND board_ref = ?)');
    const params = [calendarId];
    keys.forEach((key) => {
        params.push(key.kind, key.ref);
    });
    const newestRows = await ctx.db.all(
        `SELECT board_kind AS boardKind, board_ref AS boardRef, MAX(created_at) AS newest
         FROM board_posts
         WHERE calendar_id = ? AND deleted_at IS NULL AND (${parts.join(' OR ')})
         GROUP BY board_kind, board_ref`,
        params
    );
    const reads = await ctx.db.all(
        `SELECT board_key AS boardKey, last_read_at AS lastReadAt
         FROM board_read_state WHERE user_id = ? AND calendar_id = ?`,
        [String(user.id), calendarId]
    );
    const readAt = new Map(reads.map((row) => [row.boardKey, row.lastReadAt]));
    return newestRows
        .filter((row) => {
            const seen = readAt.get(boardKey(row.boardKind, row.boardRef || ''));
            return Boolean(row.newest) && (!seen || row.newest > seen);
        })
        .map((row) => ({ boardKind: row.boardKind, boardRef: row.boardRef || '' }));
}

const IMPORT_SKIP_CATEGORIES = new Set(['class-points', 'essay-resubmit']);

async function importDayNotes(ctx, user, calendarId) {
    await requireCalendar(ctx, user, calendarId);
    const data = await ctx.loadCalendar(calendarId);
    if (!data) {
        throw boardError('Calendar not found', 404, 'BOARD_NOT_FOUND');
    }
    const classIds = new Set((data.classes || []).filter((row) => row && row.id).map((row) => String(row.id)));
    const studentsById = new Map();
    (data.cohorts || []).forEach((cohort) => {
        (cohort.students || []).forEach((student) => {
            if (student && student.id) {
                studentsById.set(String(student.id), student);
            }
        });
    });
    const notes = Array.isArray(data.dayNotes) ? data.dayNotes : [];
    let imported = 0;
    let skipped = 0;
    for (const note of notes) {
        if (!note || typeof note !== 'object') {
            skipped += 1;
            continue;
        }
        const noteId = String(note.id || '').trim();
        const classId = String(note.classId || '').trim();
        const category = String(note.categoryId || 'class-notes').trim() || 'class-notes';
        if (!noteId || !classId || !classIds.has(classId) || IMPORT_SKIP_CATEGORIES.has(category)) {
            skipped += 1;
            continue;
        }
        const bodyCheck = validateBody(String(note.text || '').slice(0, BODY_MAX));
        const dateCheck = validateLessonDate(note.date);
        if (bodyCheck.error || dateCheck.error) {
            skipped += 1;
            continue;
        }
        const sourceRef = `daynote:${noteId}`.slice(0, 200);
        const existing = await ctx.db.one(
            'SELECT id FROM board_posts WHERE calendar_id = ? AND source_ref = ?',
            [calendarId, sourceRef]
        );
        if (existing) {
            skipped += 1;
            continue;
        }
        const tagged = Array.isArray(note.taggedStudentIds) ? note.taggedStudentIds : [];
        const students = takeChecked(
            validateStudents(
                tagged.map((studentId) => {
                    const student = studentsById.get(String(studentId));
                    return {
                        studentId: String(studentId),
                        tmsMpidx: student && student.tmsMpidx ? String(student.tmsMpidx) : ''
                    };
                })
            ),
            400,
            'BOARD_STUDENTS'
        ).students;
        const tags = category === 'class-notes' ? [] : takeChecked(validateTags([category]), 400, 'BOARD_TAGS').tags;
        const author = String(note.authorUserId || user.id || '').trim() || String(user.id);
        const id = ctx.newId();
        const now = ctx.now();
        const blob = ctx.encrypt(id, bodyCheck.body);
        try {
            await ctx.db.run(
                `INSERT INTO board_posts (
                    id, calendar_id, board_kind, board_ref, lesson_date, author_user_id,
                    body, body_enc_version, body_key_wrapped, tags_json, is_special,
                    created_at, updated_at, source_ref
                ) VALUES (?, ?, 'class', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
                [
                    id,
                    calendarId,
                    classId,
                    dateCheck.date,
                    author,
                    blob.body,
                    blob.bodyEncVersion,
                    blob.bodyKeyWrapped,
                    JSON.stringify(tags),
                    now,
                    now,
                    sourceRef
                ]
            );
        } catch (err) {
            if (err && /unique/i.test(String(err.message || ''))) {
                skipped += 1;
                continue;
            }
            throw err;
        }
        await replaceStudents(ctx, id, calendarId, students);
        imported += 1;
    }
    if (imported) {
        await logWrite(ctx, user, calendarId, 'board_post_create', 'Brought old day notes onto the class board', {
            imported
        });
    }
    return { status: 200, body: { imported, skipped } };
}

async function searchBoard(ctx, user, calendarId, query) {
    await requireCalendar(ctx, user, calendarId);
    const text = qstr(query, 'q').trim();
    if (!text) {
        throw boardError('Type something to search', 400, 'BOARD_QUERY');
    }
    if (text.length > 200) {
        throw boardError('Search is too long', 400, 'BOARD_QUERY');
    }
    const limit = pageLimit(query);
    const cursor = readCursor(query);
    const where = ['calendar_id = ?', 'deleted_at IS NULL'];
    const params = [calendarId];
    const kind = qstr(query, 'kind');
    if (kind) {
        const kindRef = takeChecked(normalizeKindRef(kind, qstr(query, 'ref')), 400, 'BOARD_KIND');
        where.push('board_kind = ?');
        params.push(kindRef.kind);
        where.push('board_ref = ?');
        params.push(kindRef.ref);
    }
    appendCommonFilters(where, params, query);
    appendCursor(where, params, cursor);
    const scanned = await selectPosts(ctx, where, params, SEARCH_SCAN);
    const needle = text.toLowerCase();
    const matches = [];
    let lastExamined = null;
    for (const row of scanned) {
        lastExamined = row;
        const body = plainBody(ctx, row);
        if (body.toLowerCase().includes(needle)) {
            matches.push({ row, body });
            if (matches.length >= limit) {
                break;
            }
        }
    }
    const posts = await presentPosts(
        ctx,
        matches.map((hit) => hit.row)
    );
    const byId = new Map(matches.map((hit) => [String(hit.row.id), hit.body]));
    posts.forEach((post) => {
        post.snippet = snippetAround(byId.get(String(post.id)) || '', text);
    });
    const moreInScan = scanned.length === SEARCH_SCAN || matches.length >= limit;
    const exhausted = !lastExamined || (matches.length < limit && scanned.length < SEARCH_SCAN);
    return {
        status: 200,
        body: {
            q: text,
            posts,
            nextCursor: !exhausted && moreInScan && lastExamined
                ? encodeCursor(lastExamined.createdAt, lastExamined.id)
                : null
        }
    };
}

async function createPost(ctx, user, calendarId, input) {
    await requireCalendar(ctx, user, calendarId);
    const src = input && typeof input === 'object' ? input : {};
    const kindRef = takeChecked(normalizeKindRef(src.boardKind, src.boardRef), 400, 'BOARD_KIND');
    const body = takeChecked(validateBody(src.body), 400, 'BOARD_BODY');
    const date = takeChecked(validateLessonDate(src.lessonDate), 400, 'BOARD_DATE');
    const tags = takeChecked(validateTags(src.tags), 400, 'BOARD_TAGS');
    const students = takeChecked(validateStudents(src.students), 400, 'BOARD_STUDENTS');
    const mentions = takeChecked(validateMentions(src.mentions), 400, 'BOARD_MENTIONS');
    const special = takeChecked(validateSpecial(src.isSpecial), 400, 'BOARD_SPECIAL');
    const data = await ctx.loadCalendar(calendarId);
    assertTargetExists(data, kindRef.kind, kindRef.ref);
    const id = ctx.newId();
    const now = ctx.now();
    const blob = ctx.encrypt(id, body.body);
    await ctx.db.run(
        `INSERT INTO board_posts (
            id, calendar_id, board_kind, board_ref, lesson_date, author_user_id,
            body, body_enc_version, body_key_wrapped, tags_json, is_special,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            calendarId,
            kindRef.kind,
            kindRef.ref,
            date.date,
            String(user.id),
            blob.body,
            blob.bodyEncVersion,
            blob.bodyKeyWrapped,
            JSON.stringify(tags.tags),
            special.isSpecial,
            now,
            now
        ]
    );
    await replaceStudents(ctx, id, calendarId, students.students);
    await replaceMentions(ctx, id, mentions.mentions);
    await logWrite(ctx, user, calendarId, 'board_post_create', 'Posted a class board note', {
        postId: id,
        boardKind: kindRef.kind,
        boardRef: kindRef.ref,
        isSpecial: special.isSpecial === 1
    });
    const row = await getPostRow(ctx, calendarId, id);
    const posts = await presentPosts(ctx, [row]);
    return { status: 201, body: { post: posts[0] } };
}

async function getPost(ctx, user, calendarId, postId) {
    await requireCalendar(ctx, user, calendarId);
    const row = await getPostRow(ctx, calendarId, postId);
    if (!row) {
        throw boardError('Post not found', 404, 'BOARD_NOT_FOUND');
    }
    const posts = await presentPosts(ctx, [row]);
    const replies = await ctx.db.all(
        `SELECT ${REPLY_SELECT} FROM board_replies WHERE post_id = ? ORDER BY created_at ASC, id ASC`,
        [postId]
    );
    const replyIds = replies.map((reply) => reply.id);
    let reactionRows = [];
    if (replyIds.length) {
        reactionRows = await ctx.db.all(
            `SELECT target_id AS targetId, user_id AS userId, emoji, created_at AS createdAt
             FROM board_reactions WHERE target_id IN (${placeholders(replyIds)})
             ORDER BY created_at ASC`,
            replyIds
        );
    }
    const reactionByTarget = await reactionMap(ctx, reactionRows);
    const names = await loadNames(
        ctx,
        replies.flatMap((reply) => [reply.authorUserId, reply.deletedBy])
    );
    const replyViews = replies.map((reply) =>
        publicReply(
            reply,
            reactionByTarget,
            names,
            reply.deletedAt ? '' : ctx.decrypt(reply, reply.id)
        )
    );
    return { status: 200, body: { post: posts[0], replies: replyViews } };
}

async function patchPost(ctx, user, calendarId, postId, input) {
    await requireCalendar(ctx, user, calendarId);
    const row = await getPostRow(ctx, calendarId, postId);
    if (!row) {
        throw boardError('Post not found', 404, 'BOARD_NOT_FOUND');
    }
    if (row.deletedAt) {
        throw boardError('This post was deleted', 400, 'BOARD_DELETED');
    }
    if (!canEditOwn(user, row.authorUserId)) {
        throw boardError('You can only edit your own post', 403, 'BOARD_FORBIDDEN');
    }
    const src = input && typeof input === 'object' ? input : {};
    if (hasOwn(src, 'boardKind') || hasOwn(src, 'boardRef')) {
        const next = normalizeKindRef(
            hasOwn(src, 'boardKind') ? src.boardKind : row.boardKind,
            hasOwn(src, 'boardRef') ? src.boardRef : row.boardRef
        );
        if (next.error || next.kind !== row.boardKind || next.ref !== (row.boardRef || '')) {
            throw boardError('A post stays on the board where it was written', 400, 'BOARD_KIND');
        }
    }
    let blob = null;
    if (hasOwn(src, 'body')) {
        const nextBody = takeChecked(validateBody(src.body), 400, 'BOARD_BODY').body;
        const previous = plainBody(ctx, row);
        if (previous !== nextBody) {
            const revisionId = ctx.newId();
            const previousBlob = ctx.encrypt(revisionId, previous);
            await ctx.db.run(
                `INSERT INTO board_revisions (
                    id, target_id, body, body_enc_version, body_key_wrapped, editor_user_id, edited_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    revisionId,
                    row.id,
                    previousBlob.body,
                    previousBlob.bodyEncVersion,
                    previousBlob.bodyKeyWrapped,
                    String(user.id),
                    ctx.now()
                ]
            );
            blob = ctx.encrypt(row.id, nextBody);
        }
    }
    const tags = hasOwn(src, 'tags')
        ? takeChecked(validateTags(src.tags), 400, 'BOARD_TAGS').tags
        : null;
    const students = hasOwn(src, 'students')
        ? takeChecked(validateStudents(src.students), 400, 'BOARD_STUDENTS').students
        : null;
    const mentions = hasOwn(src, 'mentions')
        ? takeChecked(validateMentions(src.mentions), 400, 'BOARD_MENTIONS').mentions
        : null;
    const special = hasOwn(src, 'isSpecial')
        ? takeChecked(validateSpecial(src.isSpecial), 400, 'BOARD_SPECIAL').isSpecial
        : null;
    const date = hasOwn(src, 'lessonDate')
        ? takeChecked(validateLessonDate(src.lessonDate), 400, 'BOARD_DATE').date
        : undefined;
    const now = ctx.now();
    await ctx.db.run(
        `UPDATE board_posts SET
            body = ?,
            body_enc_version = ?,
            body_key_wrapped = ?,
            tags_json = ?,
            is_special = ?,
            lesson_date = ?,
            updated_at = ?
         WHERE id = ? AND calendar_id = ?`,
        [
            blob ? blob.body : row.body,
            blob ? blob.bodyEncVersion : row.bodyEncVersion,
            blob ? blob.bodyKeyWrapped : row.bodyKeyWrapped,
            tags ? JSON.stringify(tags) : row.tagsJson,
            special == null ? row.isSpecial : special,
            date === undefined ? row.lessonDate : date,
            now,
            row.id,
            calendarId
        ]
    );
    if (students) {
        await replaceStudents(ctx, row.id, calendarId, students);
    }
    if (mentions) {
        await replaceMentions(ctx, row.id, mentions);
    }
    await logWrite(ctx, user, calendarId, 'board_post_edit', 'Edited a class board note', {
        postId: row.id
    });
    const saved = await getPostRow(ctx, calendarId, row.id);
    const posts = await presentPosts(ctx, [saved]);
    return { status: 200, body: { post: posts[0] } };
}

async function softDeletePost(ctx, user, calendarId, postId) {
    await requireCalendar(ctx, user, calendarId);
    const row = await getPostRow(ctx, calendarId, postId);
    if (!row) {
        throw boardError('Post not found', 404, 'BOARD_NOT_FOUND');
    }
    if (!row.deletedAt) {
        if (!canSoftDelete(user, row.authorUserId)) {
            throw boardError('You can only delete your own post', 403, 'BOARD_FORBIDDEN');
        }
        const now = ctx.now();
        await ctx.db.run(
            `UPDATE board_posts SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?`,
            [now, String(user.id), now, row.id]
        );
        await logWrite(ctx, user, calendarId, 'board_post_delete', 'Deleted a class board note', {
            postId: row.id
        });
    }
    const saved = await getPostRow(ctx, calendarId, row.id);
    const posts = await presentPosts(ctx, [saved]);
    return { status: 200, body: { post: posts[0] } };
}

async function createReply(ctx, user, calendarId, postId, input) {
    await requireCalendar(ctx, user, calendarId);
    const post = await getPostRow(ctx, calendarId, postId);
    if (!post) {
        throw boardError('Post not found', 404, 'BOARD_NOT_FOUND');
    }
    if (post.deletedAt) {
        throw boardError('This post was deleted', 400, 'BOARD_DELETED');
    }
    const src = input && typeof input === 'object' ? input : {};
    const body = takeChecked(validateBody(src.body), 400, 'BOARD_BODY').body;
    const id = ctx.newId();
    const now = ctx.now();
    const blob = ctx.encrypt(id, body);
    await ctx.db.run(
        `INSERT INTO board_replies (
            id, post_id, author_user_id, body, body_enc_version, body_key_wrapped, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, postId, String(user.id), blob.body, blob.bodyEncVersion, blob.bodyKeyWrapped, now, now]
    );
    await logWrite(ctx, user, calendarId, 'board_reply_create', 'Replied on a class board note', {
        postId,
        replyId: id
    });
    const full = await getPost(ctx, user, calendarId, postId);
    const reply = (full.body.replies || []).find((item) => item.id === id) || null;
    return { status: 201, body: { reply, post: full.body.post } };
}

async function getReplyRow(ctx, calendarId, replyId) {
    return ctx.db.one(
        `SELECT r.id, r.post_id AS postId, r.author_user_id AS authorUserId,
                r.body, r.body_enc_version AS bodyEncVersion, r.body_key_wrapped AS bodyKeyWrapped,
                r.created_at AS createdAt, r.updated_at AS updatedAt,
                r.deleted_at AS deletedAt, r.deleted_by AS deletedBy,
                p.calendar_id AS calendarId
         FROM board_replies r
         INNER JOIN board_posts p ON p.id = r.post_id
         WHERE r.id = ? AND p.calendar_id = ?`,
        [replyId, calendarId]
    );
}

async function patchReply(ctx, user, calendarId, replyId, input) {
    await requireCalendar(ctx, user, calendarId);
    const row = await getReplyRow(ctx, calendarId, replyId);
    if (!row) {
        throw boardError('Reply not found', 404, 'BOARD_NOT_FOUND');
    }
    if (row.deletedAt) {
        throw boardError('This reply was deleted', 400, 'BOARD_DELETED');
    }
    if (!canEditOwn(user, row.authorUserId)) {
        throw boardError('You can only edit your own reply', 403, 'BOARD_FORBIDDEN');
    }
    const src = input && typeof input === 'object' ? input : {};
    const nextBody = takeChecked(validateBody(src.body), 400, 'BOARD_BODY').body;
    const previous = ctx.decrypt(row, row.id);
    if (String(previous || '') !== nextBody) {
        const revisionId = ctx.newId();
        const previousBlob = ctx.encrypt(revisionId, String(previous || ''));
        const now = ctx.now();
        await ctx.db.run(
            `INSERT INTO board_revisions (
                id, target_id, body, body_enc_version, body_key_wrapped, editor_user_id, edited_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                revisionId,
                row.id,
                previousBlob.body,
                previousBlob.bodyEncVersion,
                previousBlob.bodyKeyWrapped,
                String(user.id),
                now
            ]
        );
        const blob = ctx.encrypt(row.id, nextBody);
        await ctx.db.run(
            `UPDATE board_replies SET body = ?, body_enc_version = ?, body_key_wrapped = ?, updated_at = ?
             WHERE id = ?`,
            [blob.body, blob.bodyEncVersion, blob.bodyKeyWrapped, now, row.id]
        );
    }
    await logWrite(ctx, user, calendarId, 'board_reply_edit', 'Edited a class board reply', {
        postId: row.postId,
        replyId: row.id
    });
    const full = await getPost(ctx, user, calendarId, row.postId);
    const reply = (full.body.replies || []).find((item) => item.id === row.id) || null;
    return { status: 200, body: { reply, post: full.body.post } };
}

async function softDeleteReply(ctx, user, calendarId, replyId) {
    await requireCalendar(ctx, user, calendarId);
    const row = await getReplyRow(ctx, calendarId, replyId);
    if (!row) {
        throw boardError('Reply not found', 404, 'BOARD_NOT_FOUND');
    }
    if (!row.deletedAt) {
        if (!canSoftDelete(user, row.authorUserId)) {
            throw boardError('You can only delete your own reply', 403, 'BOARD_FORBIDDEN');
        }
        const now = ctx.now();
        await ctx.db.run(
            'UPDATE board_replies SET deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?',
            [now, String(user.id), now, row.id]
        );
        await logWrite(ctx, user, calendarId, 'board_reply_delete', 'Deleted a class board reply', {
            postId: row.postId,
            replyId: row.id
        });
    }
    const full = await getPost(ctx, user, calendarId, row.postId);
    const reply = (full.body.replies || []).find((item) => item.id === row.id) || null;
    return { status: 200, body: { reply, post: full.body.post } };
}

async function findReactionTarget(ctx, calendarId, targetId) {
    const post = await getPostRow(ctx, calendarId, targetId);
    if (post) {
        return { kind: 'post', row: post };
    }
    const reply = await getReplyRow(ctx, calendarId, targetId);
    if (reply) {
        return { kind: 'reply', row: reply };
    }
    return null;
}

async function toggleReaction(ctx, user, calendarId, input) {
    await requireCalendar(ctx, user, calendarId);
    const src = input && typeof input === 'object' ? input : {};
    const targetId = String(src.targetId || '').trim();
    const emoji = String(src.emoji == null ? '' : src.emoji);
    if (!targetId) {
        throw boardError('targetId is required', 400, 'BOARD_TARGET');
    }
    if (!REACTION_SET.has(emoji)) {
        throw boardError('Reaction must be one of the four board reactions', 400, 'BOARD_EMOJI');
    }
    const target = await findReactionTarget(ctx, calendarId, targetId);
    if (!target) {
        throw boardError('Post not found', 404, 'BOARD_NOT_FOUND');
    }
    if (target.row.deletedAt) {
        throw boardError('This note was deleted', 400, 'BOARD_DELETED');
    }
    const existing = await ctx.db.one(
        `SELECT emoji FROM board_reactions WHERE target_id = ? AND user_id = ? AND emoji = ?`,
        [targetId, String(user.id), emoji]
    );
    let on = false;
    if (existing) {
        await ctx.db.run(
            'DELETE FROM board_reactions WHERE target_id = ? AND user_id = ? AND emoji = ?',
            [targetId, String(user.id), emoji]
        );
    } else {
        on = true;
        await ctx.db.run(
            `INSERT INTO board_reactions (target_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)`,
            [targetId, String(user.id), emoji, ctx.now()]
        );
    }
    await logWrite(ctx, user, calendarId, 'board_reaction', on ? 'Reacted on a class board note' : 'Removed a class board reaction', {
        targetId,
        emoji,
        on
    });
    const reactionRows = await ctx.db.all(
        `SELECT target_id AS targetId, user_id AS userId, emoji, created_at AS createdAt
         FROM board_reactions WHERE target_id = ? ORDER BY created_at ASC`,
        [targetId]
    );
    const mapped = await reactionMap(ctx, reactionRows);
    return {
        status: 200,
        body: {
            targetId,
            emoji,
            on,
            reactions: mapped.get(String(targetId)) || []
        }
    };
}

async function markRead(ctx, user, calendarId, input) {
    await requireCalendar(ctx, user, calendarId);
    const src = input && typeof input === 'object' ? input : {};
    let key = String(src.boardKey || '').trim();
    if (!key) {
        const kindRef = takeChecked(normalizeKindRef(src.boardKind, src.boardRef), 400, 'BOARD_KIND');
        key = boardKey(kindRef.kind, kindRef.ref);
    }
    if (key.length > 120) {
        throw boardError('Board key is too long', 400, 'BOARD_KIND');
    }
    const at = ctx.now();
    await ctx.db.run(
        `INSERT INTO board_read_state (user_id, calendar_id, board_key, last_read_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, calendar_id, board_key) DO UPDATE SET last_read_at = excluded.last_read_at`,
        [String(user.id), calendarId, key, at]
    );
    return { status: 200, body: { boardKey: key, lastReadAt: at } };
}

async function studentHistory(ctx, user, query) {
    const studentId = qstr(query, 'studentId').trim();
    const tmsMpidx = qstr(query, 'tmsMpidx').trim();
    if (!studentId && !tmsMpidx) {
        throw boardError('studentId or tmsMpidx is required', 400, 'BOARD_STUDENTS');
    }
    const limit = pageLimit(query);
    const cursor = readCursor(query);
    const calendarIds = Array.from(
        new Set((await ctx.accessibleCalendarIds(user)).filter(Boolean).map(String))
    ).slice(0, 200);
    if (!calendarIds.length) {
        return { status: 200, body: { posts: [], nextCursor: null } };
    }
    const where = [
        `calendar_id IN (${placeholders(calendarIds)})`,
        `EXISTS (
            SELECT 1 FROM board_post_students s
            WHERE s.post_id = board_posts.id
              AND ((? != '' AND s.student_id = ?) OR (? != '' AND s.tms_mpidx = ?))
        )`
    ];
    const params = calendarIds.concat([studentId, studentId, tmsMpidx, tmsMpidx]);
    appendCursor(where, params, cursor);
    const page = await selectPosts(ctx, where, params, limit + 1);
    const hasMore = page.length > limit;
    const slice = hasMore ? page.slice(0, limit) : page;
    const last = slice[slice.length - 1];
    return {
        status: 200,
        body: {
            posts: await presentPosts(ctx, slice),
            nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null
        }
    };
}

async function inbox(ctx, user, calendarId) {
    await requireCalendar(ctx, user, calendarId);
    const uid = String(user.id);
    const replies = await ctx.db.all(
        `SELECT r.id AS replyId, r.post_id AS postId, r.author_user_id AS actorUserId, r.created_at AS createdAt
         FROM board_replies r
         INNER JOIN board_posts p ON p.id = r.post_id
         WHERE p.calendar_id = ?
           AND r.deleted_at IS NULL
           AND p.deleted_at IS NULL
           AND r.author_user_id != ?
           AND (
                p.author_user_id = ?
                OR EXISTS (
                    SELECT 1 FROM board_replies mine
                    WHERE mine.post_id = r.post_id
                      AND mine.author_user_id = ?
                      AND mine.deleted_at IS NULL
                      AND mine.id != r.id
                )
           )
         ORDER BY r.created_at DESC
         LIMIT ?`,
        [calendarId, uid, uid, uid, INBOX_LIMIT]
    );
    const mentions = await ctx.db.all(
        `SELECT p.id AS postId, p.author_user_id AS actorUserId, p.created_at AS createdAt
         FROM board_post_mentions m
         INNER JOIN board_posts p ON p.id = m.post_id
         WHERE m.user_id = ? AND p.calendar_id = ? AND p.deleted_at IS NULL AND p.author_user_id != ?
         ORDER BY p.created_at DESC
         LIMIT ?`,
        [uid, calendarId, uid, INBOX_LIMIT]
    );
    const specials = await ctx.db.all(
        `SELECT ${POST_SELECT} FROM board_posts
         WHERE calendar_id = ? AND is_special = 1 AND deleted_at IS NULL AND author_user_id != ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [calendarId, uid, INBOX_LIMIT]
    );
    const data = await ctx.loadCalendar(calendarId);
    const specialItems = [];
    if (data && specials.length) {
        const extras = await sideMaps(ctx, specials);
        specials.forEach((row) => {
            const students = extras.students.get(String(row.id)) || [];
            const teachers = notifyUserIdsForSpecial(data, students);
            if (teachers.includes(uid)) {
                specialItems.push({
                    type: 'special',
                    postId: row.id,
                    actorUserId: row.authorUserId,
                    createdAt: row.createdAt
                });
            }
        });
    }
    const items = replies
        .map((row) => ({
            type: 'reply',
            postId: row.postId,
            replyId: row.replyId,
            actorUserId: row.actorUserId,
            createdAt: row.createdAt
        }))
        .concat(
            mentions.map((row) => ({
                type: 'mention',
                postId: row.postId,
                actorUserId: row.actorUserId,
                createdAt: row.createdAt
            }))
        )
        .concat(specialItems);
    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { status: 200, body: { items: items.slice(0, INBOX_LIMIT) } };
}

function matchRoute(pathname) {
    if (pathname === '/api/board/students/history') {
        return { name: 'history' };
    }
    const match = String(pathname || '').match(/^\/api\/calendars\/([^/]+)\/board(?:\/(.*))?$/);
    if (!match) {
        return null;
    }
    const calendarId = decodeURIComponent(match[1]);
    const rest = match[2] || '';
    if (rest === '' ) {
        return { name: 'board', calendarId };
    }
    if (
        rest === 'feed' ||
        rest === 'search' ||
        rest === 'inbox' ||
        rest === 'read' ||
        rest === 'reactions' ||
        rest === 'posts' ||
        rest === 'import-day-notes'
    ) {
        return { name: rest, calendarId };
    }
    const post = rest.match(/^posts\/([^/]+)$/);
    if (post) {
        return { name: 'post', calendarId, postId: decodeURIComponent(post[1]) };
    }
    const postReplies = rest.match(/^posts\/([^/]+)\/replies$/);
    if (postReplies) {
        return { name: 'postReplies', calendarId, postId: decodeURIComponent(postReplies[1]) };
    }
    const reply = rest.match(/^replies\/([^/]+)$/);
    if (reply) {
        return { name: 'reply', calendarId, replyId: decodeURIComponent(reply[1]) };
    }
    return { name: 'unknown', calendarId };
}

function rejectViewAs(http) {
    if (http.viewAs && http.method !== 'GET' && http.method !== 'HEAD') {
        throw boardError('Changes are not saved in View As mode', 403, 'VIEW_AS_MODE');
    }
}

async function route(ctx, http) {
    const found = matchRoute(http.pathname);
    if (!found) {
        return null;
    }
    if (found.name === 'unknown') {
        throw boardError('Not found', 404, 'BOARD_NOT_FOUND');
    }
    rejectViewAs(http);
    const method = http.method;
    const query = http.query || {};
    const body = http.body && typeof http.body === 'object' ? http.body : {};
    if (found.name === 'history') {
        if (method !== 'GET') {
            throw boardError('Method not allowed', 405, 'BOARD_METHOD');
        }
        return studentHistory(ctx, http.user, query);
    }
    if (found.name === 'feed' && method === 'GET') {
        return listFeed(ctx, http.user, found.calendarId, query);
    }
    if (found.name === 'board' && method === 'GET') {
        return listBoard(ctx, http.user, found.calendarId, query);
    }
    if (found.name === 'search' && method === 'GET') {
        return searchBoard(ctx, http.user, found.calendarId, query);
    }
    if (found.name === 'inbox' && method === 'GET') {
        return inbox(ctx, http.user, found.calendarId);
    }
    if (found.name === 'read' && method === 'POST') {
        return markRead(ctx, http.user, found.calendarId, body);
    }
    if (found.name === 'reactions' && method === 'POST') {
        return toggleReaction(ctx, http.user, found.calendarId, body);
    }
    if (found.name === 'posts' && method === 'POST') {
        return createPost(ctx, http.user, found.calendarId, body);
    }
    if (found.name === 'import-day-notes' && method === 'POST') {
        return importDayNotes(ctx, http.user, found.calendarId);
    }
    if (found.name === 'posts' && method === 'GET') {
        return listBoard(ctx, http.user, found.calendarId, query);
    }
    if (found.name === 'post' && method === 'GET') {
        return getPost(ctx, http.user, found.calendarId, found.postId);
    }
    if (found.name === 'post' && method === 'PATCH') {
        return patchPost(ctx, http.user, found.calendarId, found.postId, body);
    }
    if (found.name === 'post' && method === 'DELETE') {
        return softDeletePost(ctx, http.user, found.calendarId, found.postId);
    }
    if (found.name === 'postReplies' && method === 'POST') {
        return createReply(ctx, http.user, found.calendarId, found.postId, body);
    }
    if (found.name === 'reply' && method === 'PATCH') {
        return patchReply(ctx, http.user, found.calendarId, found.replyId, body);
    }
    if (found.name === 'reply' && method === 'DELETE') {
        return softDeleteReply(ctx, http.user, found.calendarId, found.replyId);
    }
    throw boardError('Method not allowed', 405, 'BOARD_METHOD');
}

async function dispatch(ctx, http) {
    try {
        return await route(ctx, http || {});
    } catch (err) {
        const status = err && err.status ? err.status : 500;
        const payload = { error: (err && err.message) || 'Board request failed' };
        if (err && err.code) {
            payload.code = err.code;
        }
        return { status, body: payload };
    }
}

module.exports = {
    REACTIONS,
    BOARD_KINDS,
    CALENDAR_DELETE_STEPS,
    mineBoardKeys,
    notifyUserIdsForSpecial,
    dispatch
};
