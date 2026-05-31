/**
 * Calendar access: direct members + group-based access.
 */
import * as Auth from './auth-permissions.js';
import { ACCESS_LEVELS } from './activity-log.js';

const LEVEL_RANK = { viewer: 0, suggester: 1, editor: 2 };

function normalizeAccessLevel(level) {
    const l = String(level || 'editor').trim().toLowerCase();
    return ACCESS_LEVELS.has(l) ? l : 'editor';
}

function maxAccessLevel(a, b) {
    const ra = LEVEL_RANK[normalizeAccessLevel(a)] ?? 0;
    const rb = LEVEL_RANK[normalizeAccessLevel(b)] ?? 0;
    return ra >= rb ? normalizeAccessLevel(a) : normalizeAccessLevel(b);
}

export function isAdmin(user) {
    return Auth.hasPermission(user, Auth.PERMS.VIEW_ALL_CALENDARS);
}

export function canViewAllCalendars(user) {
    return Auth.hasPermission(user, Auth.PERMS.VIEW_ALL_CALENDARS);
}

/** List/open all calendars (main app dropdown) — same scope as Admin Calendars tab. */
export function canListAllCalendars(user) {
    return (
        canViewAllCalendars(user) ||
        Auth.hasPermission(user, Auth.PERMS.MANAGE_CALENDAR_ACCESS)
    );
}

export function canViewCalendars(user) {
    return (
        canViewAllCalendars(user) || Auth.hasPermission(user, Auth.PERMS.VIEW_CALENDARS)
    );
}

export async function getCalendarCreatedByUserId(env, calendarId) {
    if (!calendarId) {
        return null;
    }
    const row = await env.DB.prepare('SELECT created_by_user_id FROM calendars WHERE id = ?')
        .bind(calendarId)
        .first();
    return row && row.created_by_user_id ? String(row.created_by_user_id) : null;
}

export function isCalendarCreator(user, calendarId, createdByUserId) {
    if (!user || !calendarId) {
        return false;
    }
    const creatorId = createdByUserId !== undefined ? createdByUserId : null;
    if (creatorId === null && createdByUserId === undefined) {
        return false;
    }
    return Boolean(creatorId && creatorId === user.id);
}

export async function isCalendarCreatorAsync(env, user, calendarId, createdByUserId) {
    if (!user || !calendarId) {
        return false;
    }
    const creatorId =
        createdByUserId !== undefined
            ? createdByUserId
            : await getCalendarCreatedByUserId(env, calendarId);
    return Boolean(creatorId && creatorId === user.id);
}

export function canManageCalendarAccess(user, calendarId, createdByUserId) {
    if (!user || !calendarId) {
        return false;
    }
    if (Auth.hasPermission(user, Auth.PERMS.MANAGE_CALENDAR_ACCESS)) {
        return true;
    }
    return isCalendarCreator(user, calendarId, createdByUserId);
}

export async function canManageCalendarAccessAsync(env, user, calendarId, createdByUserId) {
    if (!user || !calendarId) {
        return false;
    }
    if (Auth.hasPermission(user, Auth.PERMS.MANAGE_CALENDAR_ACCESS)) {
        return true;
    }
    return isCalendarCreatorAsync(env, user, calendarId, createdByUserId);
}

export function canDeleteCalendar(user, calendarId, createdByUserId) {
    if (!user || !calendarId) {
        return false;
    }
    if (Auth.hasPermission(user, Auth.PERMS.DELETE_CALENDARS)) {
        return true;
    }
    return isCalendarCreator(user, calendarId, createdByUserId);
}

export async function canDeleteCalendarAsync(env, user, calendarId, createdByUserId) {
    if (!user || !calendarId) {
        return false;
    }
    if (Auth.hasPermission(user, Auth.PERMS.DELETE_CALENDARS)) {
        return true;
    }
    return isCalendarCreatorAsync(env, user, calendarId, createdByUserId);
}

export function canListAdminCalendars(user) {
    if (!user) {
        return false;
    }
    return Auth.hasAnyPermission(user, [
        Auth.PERMS.MANAGE_CALENDAR_ACCESS,
        Auth.PERMS.VIEW_ALL_CALENDARS,
        Auth.PERMS.CREATE_CALENDARS
    ]);
}

function calendarListRowExtras(user, row) {
    const createdByUserId = row.createdByUserId != null ? row.createdByUserId : null;
    return {
        createdByUserId,
        canManageAccess: canManageCalendarAccess(user, row.id, createdByUserId),
        canDelete: canDeleteCalendar(user, row.id, createdByUserId)
    };
}

export async function getUserAccessLevel(env, user, calendarId) {
    if (!user || !calendarId) {
        return null;
    }
    if (canListAllCalendars(user)) {
        return 'editor';
    }
    const member = await env.DB.prepare(
        'SELECT access_level AS accessLevel FROM calendar_members WHERE calendar_id = ? AND user_id = ?'
    )
        .bind(calendarId, user.id)
        .first();
    let level = member ? member.accessLevel : null;
    const groupRows = await env.DB.prepare(
        `SELECT cg.access_level AS accessLevel FROM calendar_groups cg
         INNER JOIN group_members gm ON gm.group_id = cg.group_id
         WHERE cg.calendar_id = ? AND gm.user_id = ?`
    )
        .bind(calendarId, user.id)
        .all();
    for (const row of groupRows.results || []) {
        level = level ? maxAccessLevel(level, row.accessLevel) : row.accessLevel;
    }
    return level ? normalizeAccessLevel(level) : null;
}

export async function canAccessCalendar(env, user, calendarId) {
    if (!user || !calendarId) {
        return false;
    }
    if (!canViewCalendars(user)) {
        return false;
    }
    if (canListAllCalendars(user)) {
        return true;
    }
    return (await getUserAccessLevel(env, user, calendarId)) != null;
}

export async function canEditCalendar(env, user, calendarId) {
    return (await getUserAccessLevel(env, user, calendarId)) === 'editor';
}

export async function canSuggestChanges(env, user, calendarId) {
    const level = await getUserAccessLevel(env, user, calendarId);
    return level === 'suggester' || level === 'editor';
}

export async function listCalendarsForUser(env, user) {
    const selectCols =
        'id, name, revision, updated_at AS updatedAt, updated_by AS updatedBy, created_by_user_id AS createdByUserId';
    if (canListAllCalendars(user)) {
        const r = await env.DB.prepare(
            `SELECT ${selectCols} FROM calendars ORDER BY name COLLATE NOCASE`
        ).all();
        return (r.results || []).map((row) => Object.assign({}, row, calendarListRowExtras(user, row)));
    }
    if (!canViewCalendars(user)) {
        return [];
    }
    const r = await env.DB.prepare(
        `SELECT DISTINCT c.id, c.name, c.revision, c.updated_at AS updatedAt, c.updated_by AS updatedBy, c.created_by_user_id AS createdByUserId
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
    return (r.results || []).map((row) => Object.assign({}, row, calendarListRowExtras(user, row)));
}

export async function getCalendarAccess(env, calendarId) {
    const users = await env.DB.prepare(
        `SELECT user_id AS userId, access_level AS accessLevel
         FROM calendar_members WHERE calendar_id = ? ORDER BY user_id`
    )
        .bind(calendarId)
        .all();
    const groups = await env.DB.prepare(
        `SELECT group_id AS groupId, access_level AS accessLevel
         FROM calendar_groups WHERE calendar_id = ? ORDER BY group_id`
    )
        .bind(calendarId)
        .all();
    const userRows = users.results || [];
    const groupRows = groups.results || [];
    return {
        userAccess: userRows.map((r) => ({
            userId: r.userId,
            accessLevel: normalizeAccessLevel(r.accessLevel)
        })),
        groupAccess: groupRows.map((r) => ({
            groupId: r.groupId,
            accessLevel: normalizeAccessLevel(r.accessLevel)
        })),
        userIds: userRows.map((r) => r.userId),
        groupIds: groupRows.map((r) => r.groupId)
    };
}

function parseAccessPayload(body) {
    const userAccess = [];
    const groupAccess = [];
    if (Array.isArray(body.userAccess)) {
        for (const item of body.userAccess) {
            if (item && item.userId) {
                userAccess.push({
                    userId: String(item.userId),
                    accessLevel: normalizeAccessLevel(item.accessLevel)
                });
            }
        }
    } else if (Array.isArray(body.userIds)) {
        for (const uid of body.userIds) {
            userAccess.push({ userId: String(uid), accessLevel: 'editor' });
        }
    }
    if (Array.isArray(body.groupAccess)) {
        for (const item of body.groupAccess) {
            if (item && item.groupId) {
                groupAccess.push({
                    groupId: String(item.groupId),
                    accessLevel: normalizeAccessLevel(item.accessLevel)
                });
            }
        }
    } else if (Array.isArray(body.groupIds)) {
        for (const gid of body.groupIds) {
            groupAccess.push({ groupId: String(gid), accessLevel: 'editor' });
        }
    }
    return { userAccess, groupAccess };
}

async function filterActiveUserAccess(env, userAccess) {
    const ids = [...new Set(userAccess.map((u) => u.userId).filter(Boolean))];
    if (ids.length === 0) {
        return [];
    }
    const placeholders = ids.map(() => '?').join(',');
    const r = await env.DB.prepare(
        `SELECT id FROM users WHERE active = 1 AND id IN (${placeholders})`
    )
        .bind(...ids)
        .all();
    const active = new Set((r.results || []).map((row) => row.id));
    return userAccess.filter((u) => active.has(u.userId));
}

async function filterExistingGroupAccess(env, groupAccess) {
    const ids = [...new Set(groupAccess.map((g) => g.groupId).filter(Boolean))];
    if (ids.length === 0) {
        return [];
    }
    const placeholders = ids.map(() => '?').join(',');
    const r = await env.DB.prepare(`SELECT id FROM teacher_groups WHERE id IN (${placeholders})`)
        .bind(...ids)
        .all();
    const existing = new Set((r.results || []).map((row) => row.id));
    return groupAccess.filter((g) => existing.has(g.groupId));
}

export async function setCalendarAccess(env, calendarId, userIdsOrPayload, groupIds, grantedByUserId) {
    let userAccess;
    let groupAccess;
    if (
        userIdsOrPayload &&
        typeof userIdsOrPayload === 'object' &&
        !Array.isArray(userIdsOrPayload) &&
        (userIdsOrPayload.userAccess || userIdsOrPayload.userIds)
    ) {
        const parsed = parseAccessPayload(userIdsOrPayload);
        userAccess = parsed.userAccess;
        groupAccess = parsed.groupAccess;
    } else {
        const parsed = parseAccessPayload({
            userIds: userIdsOrPayload || [],
            groupIds: groupIds || []
        });
        userAccess = parsed.userAccess;
        groupAccess = parsed.groupAccess;
    }
    const users = await filterActiveUserAccess(env, userAccess);
    const groups = await filterExistingGroupAccess(env, groupAccess);
    const at = new Date().toISOString();
    await env.DB.prepare('DELETE FROM calendar_members WHERE calendar_id = ?').bind(calendarId).run();
    await env.DB.prepare('DELETE FROM calendar_groups WHERE calendar_id = ?').bind(calendarId).run();
    for (const u of users) {
        await env.DB.prepare(
            `INSERT INTO calendar_members (calendar_id, user_id, granted_at, granted_by_user_id, access_level)
             VALUES (?, ?, ?, ?, ?)`
        )
            .bind(calendarId, u.userId, at, grantedByUserId || null, u.accessLevel)
            .run();
    }
    for (const g of groups) {
        await env.DB.prepare(
            `INSERT INTO calendar_groups (calendar_id, group_id, granted_at, granted_by_user_id, access_level)
             VALUES (?, ?, ?, ?, ?)`
        )
            .bind(calendarId, g.groupId, at, grantedByUserId || null, g.accessLevel)
            .run();
    }
    return {
        userAccess: users,
        groupAccess: groups,
        userIds: users.map((u) => u.userId),
        groupIds: groups.map((g) => g.groupId)
    };
}

export async function deleteCalendarAccess(env, calendarId) {
    await env.DB.prepare('DELETE FROM calendar_members WHERE calendar_id = ?').bind(calendarId).run();
    await env.DB.prepare('DELETE FROM calendar_groups WHERE calendar_id = ?').bind(calendarId).run();
}

export async function listTeachers(env) {
    const r = await env.DB.prepare(
        `SELECT id, email, display_name AS displayName, role FROM users
         WHERE active = 1
         ORDER BY display_name COLLATE NOCASE`
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
    const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
    let users = [];
    if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        const r = await env.DB.prepare(
            `SELECT id FROM users WHERE active = 1 AND id IN (${placeholders})`
        )
            .bind(...ids)
            .all();
        users = (r.results || []).map((row) => row.id);
    }
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
        'SELECT id, name, revision, updated_at AS updatedAt, updated_by AS updatedBy, created_by_user_id AS createdByUserId FROM calendars ORDER BY name COLLATE NOCASE'
    ).all();
    const out = [];
    for (const cal of cals.results || []) {
        const access = await getCalendarAccess(env, cal.id);
        out.push(Object.assign({}, cal, access));
    }
    return out;
}

export async function listAdminCalendarsForUser(env, user) {
    const all = await listAdminCalendarsWithAccess(env);
    if (
        Auth.hasPermission(user, Auth.PERMS.MANAGE_CALENDAR_ACCESS) ||
        canViewAllCalendars(user)
    ) {
        return all.map((cal) =>
            Object.assign({}, cal, {
                canManageAccess: canManageCalendarAccess(user, cal.id, cal.createdByUserId),
                canDelete: canDeleteCalendar(user, cal.id, cal.createdByUserId)
            })
        );
    }
    if (!Auth.hasPermission(user, Auth.PERMS.CREATE_CALENDARS)) {
        return [];
    }
    return all
        .filter((cal) => isCalendarCreator(user, cal.id, cal.createdByUserId))
        .map((cal) =>
            Object.assign({}, cal, {
                canManageAccess: true,
                canDelete: canDeleteCalendar(user, cal.id, cal.createdByUserId)
            })
        );
}

export async function getCalendarSummaryForUser(env, user) {
    if (!user) {
        return { calendarAccessMode: 'none', calendarSummary: [] };
    }
    if (canListAllCalendars(user)) {
        return { calendarAccessMode: 'all', calendarSummary: [] };
    }
    const cals = await listCalendarsForUser(env, user);
    const calendarSummary = [];
    for (const cal of cals) {
        calendarSummary.push({
            calendarId: cal.id,
            name: cal.name,
            accessLevel: await getUserAccessLevel(env, user, cal.id)
        });
    }
    return {
        calendarAccessMode: calendarSummary.length ? 'some' : 'none',
        calendarSummary
    };
}
