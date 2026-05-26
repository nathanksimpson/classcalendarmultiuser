/**
 * Calendar access: direct members + group-based access.
 */
import { isCalendarSuperAdmin } from './permissions.js';

export function isAdmin(user) {
    return isCalendarSuperAdmin(user);
}

export async function canAccessCalendar(env, user, calendarId) {
    if (!user || !calendarId) {
        return false;
    }
    if (isAdmin(user)) {
        return true;
    }
    const row = await env.DB.prepare(
        `SELECT 1 AS ok FROM calendars c WHERE c.id = ?
         AND (
           EXISTS (SELECT 1 FROM calendar_members cm WHERE cm.calendar_id = c.id AND cm.user_id = ?)
           OR EXISTS (
             SELECT 1 FROM calendar_groups cg
             INNER JOIN group_members gm ON gm.group_id = cg.group_id
             WHERE cg.calendar_id = c.id AND gm.user_id = ?
           )
         )
         LIMIT 1`
    )
        .bind(calendarId, user.id, user.id)
        .first();
    return Boolean(row);
}

export async function listCalendarsForUser(env, user) {
    if (isAdmin(user)) {
        const r = await env.DB.prepare(
            'SELECT id, name, revision, updated_at AS updatedAt, updated_by AS updatedBy FROM calendars ORDER BY name COLLATE NOCASE'
        ).all();
        return r.results || [];
    }
    const r = await env.DB.prepare(
        `SELECT DISTINCT c.id, c.name, c.revision, c.updated_at AS updatedAt, c.updated_by AS updatedBy
         FROM calendars c
         WHERE EXISTS (SELECT 1 FROM calendar_members cm WHERE cm.calendar_id = c.id AND cm.user_id = ?)
            OR EXISTS (
              SELECT 1 FROM calendar_groups cg
              INNER JOIN group_members gm ON gm.group_id = cg.group_id
              WHERE cg.calendar_id = c.id AND gm.user_id = ?
            )
         ORDER BY c.name COLLATE NOCASE`
    )
        .bind(user.id, user.id)
        .all();
    return r.results || [];
}

export async function getCalendarAccess(env, calendarId) {
    const users = await env.DB.prepare(
        'SELECT user_id AS userId FROM calendar_members WHERE calendar_id = ? ORDER BY user_id'
    )
        .bind(calendarId)
        .all();
    const groups = await env.DB.prepare(
        'SELECT group_id AS groupId FROM calendar_groups WHERE calendar_id = ? ORDER BY group_id'
    )
        .bind(calendarId)
        .all();
    return {
        userIds: (users.results || []).map((r) => r.userId),
        groupIds: (groups.results || []).map((r) => r.groupId)
    };
}

async function filterActiveUserIds(env, userIds) {
    const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
    if (ids.length === 0) {
        return [];
    }
    const placeholders = ids.map(() => '?').join(',');
    const r = await env.DB.prepare(
        `SELECT id FROM users WHERE active = 1 AND id IN (${placeholders})`
    )
        .bind(...ids)
        .all();
    return (r.results || []).map((row) => row.id);
}

async function filterExistingGroupIds(env, groupIds) {
    const ids = [...new Set((groupIds || []).map(String).filter(Boolean))];
    if (ids.length === 0) {
        return [];
    }
    const placeholders = ids.map(() => '?').join(',');
    const r = await env.DB.prepare(`SELECT id FROM teacher_groups WHERE id IN (${placeholders})`)
        .bind(...ids)
        .all();
    return (r.results || []).map((row) => row.id);
}

export async function setCalendarAccess(env, calendarId, userIds, groupIds, grantedByUserId) {
    const users = await filterActiveUserIds(env, userIds);
    const groups = await filterExistingGroupIds(env, groupIds);
    const at = new Date().toISOString();
    await env.DB.prepare('DELETE FROM calendar_members WHERE calendar_id = ?').bind(calendarId).run();
    await env.DB.prepare('DELETE FROM calendar_groups WHERE calendar_id = ?').bind(calendarId).run();
    for (const uid of users) {
        await env.DB.prepare(
            'INSERT INTO calendar_members (calendar_id, user_id, granted_at, granted_by_user_id) VALUES (?, ?, ?, ?)'
        )
            .bind(calendarId, uid, at, grantedByUserId || null)
            .run();
    }
    for (const gid of groups) {
        await env.DB.prepare(
            'INSERT INTO calendar_groups (calendar_id, group_id, granted_at, granted_by_user_id) VALUES (?, ?, ?, ?)'
        )
            .bind(calendarId, gid, at, grantedByUserId || null)
            .run();
    }
    return { userIds: users, groupIds: groups };
}

export async function deleteCalendarAccess(env, calendarId) {
    await env.DB.prepare('DELETE FROM calendar_members WHERE calendar_id = ?').bind(calendarId).run();
    await env.DB.prepare('DELETE FROM calendar_groups WHERE calendar_id = ?').bind(calendarId).run();
}

export async function listTeachers(env) {
    const r = await env.DB.prepare(
        `SELECT id, email, display_name AS displayName, role FROM users WHERE active = 1 AND role = 'teacher' ORDER BY display_name COLLATE NOCASE`
    ).all();
    return r.results || [];
}

export async function listGroups(env) {
    const r = await env.DB.prepare(
        'SELECT id, name, created_at AS createdAt, created_by_user_id AS createdByUserId FROM teacher_groups ORDER BY name COLLATE NOCASE'
    ).all();
    return r.results || [];
}

export async function getGroup(env, groupId) {
    return env.DB.prepare(
        'SELECT id, name, created_at AS createdAt, created_by_user_id AS createdByUserId FROM teacher_groups WHERE id = ?'
    )
        .bind(groupId)
        .first();
}

export async function createGroup(env, id, name, createdByUserId) {
    const at = new Date().toISOString();
    await env.DB.prepare(
        'INSERT INTO teacher_groups (id, name, created_at, created_by_user_id) VALUES (?, ?, ?, ?)'
    )
        .bind(id, String(name).trim(), at, createdByUserId || null)
        .run();
    return getGroup(env, id);
}

export async function updateGroupName(env, groupId, name) {
    await env.DB.prepare('UPDATE teacher_groups SET name = ? WHERE id = ?')
        .bind(String(name).trim(), groupId)
        .run();
    return getGroup(env, groupId);
}

export async function deleteGroup(env, groupId) {
    await env.DB.prepare('DELETE FROM group_members WHERE group_id = ?').bind(groupId).run();
    await env.DB.prepare('DELETE FROM calendar_groups WHERE group_id = ?').bind(groupId).run();
    await env.DB.prepare('DELETE FROM teacher_groups WHERE id = ?').bind(groupId).run();
}

export async function getGroupMemberIds(env, groupId) {
    const r = await env.DB.prepare('SELECT user_id AS userId FROM group_members WHERE group_id = ?')
        .bind(groupId)
        .all();
    return (r.results || []).map((row) => row.userId);
}

export async function setGroupMembers(env, groupId, userIds) {
    const users = await filterActiveUserIds(env, userIds);
    await env.DB.prepare('DELETE FROM group_members WHERE group_id = ?').bind(groupId).run();
    for (const uid of users) {
        await env.DB.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)')
            .bind(groupId, uid)
            .run();
    }
    return users;
}

export async function listAdminCalendarsWithAccess(env) {
    const cals = await env.DB.prepare(
        'SELECT id, name, revision, updated_at AS updatedAt, updated_by AS updatedBy FROM calendars ORDER BY name COLLATE NOCASE'
    ).all();
    const out = [];
    for (const cal of cals.results || []) {
        const access = await getCalendarAccess(env, cal.id);
        out.push(Object.assign({}, cal, access));
    }
    return out;
}
