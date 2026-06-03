/**
 * Calendar access: direct members + group-based access (local server).
 */
const { getDb } = require('./schema');
const Auth = require('./auth-permissions');
const { ACCESS_LEVELS } = require('./activity-log');

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

function canViewAllCalendars(user) {
    return Auth.hasPermission(user, Auth.PERMS.VIEW_ALL_CALENDARS);
}

/** List/open all calendars (main app dropdown) — same scope as Admin Calendars tab. */
function canListAllCalendars(user) {
    return (
        canViewAllCalendars(user) ||
        Auth.hasPermission(user, Auth.PERMS.MANAGE_CALENDAR_ACCESS)
    );
}

function canViewCalendars(user) {
    return (
        canViewAllCalendars(user) || Auth.hasPermission(user, Auth.PERMS.VIEW_CALENDARS)
    );
}

function getCalendarCreatedByUserId(calendarId) {
    if (!calendarId) {
        return null;
    }
    const db = getDb();
    const row = db
        .prepare('SELECT created_by_user_id FROM calendars WHERE id = ?')
        .get(calendarId);
    return row && row.created_by_user_id ? String(row.created_by_user_id) : null;
}

function isCalendarCreator(user, calendarId, createdByUserId) {
    if (!user || !calendarId) {
        return false;
    }
    const creatorId =
        createdByUserId !== undefined ? createdByUserId : getCalendarCreatedByUserId(calendarId);
    return Boolean(creatorId && creatorId === user.id);
}

function canManageCalendarAccess(user, calendarId, createdByUserId) {
    if (!user || !calendarId) {
        return false;
    }
    if (Auth.hasPermission(user, Auth.PERMS.MANAGE_CALENDAR_ACCESS)) {
        return true;
    }
    return isCalendarCreator(user, calendarId, createdByUserId);
}

function canDeleteCalendar(user, calendarId, createdByUserId) {
    if (!user || !calendarId) {
        return false;
    }
    if (Auth.hasPermission(user, Auth.PERMS.DELETE_CALENDARS)) {
        return true;
    }
    return isCalendarCreator(user, calendarId, createdByUserId);
}

function canListAdminCalendars(user) {
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

function getUserAccessLevel(user, calendarId) {
    if (!user || !calendarId) {
        return null;
    }
    if (canListAllCalendars(user)) {
        return 'editor';
    }
    const db = getDb();
    const member = db
        .prepare(
            'SELECT access_level AS accessLevel FROM calendar_members WHERE calendar_id = ? AND user_id = ?'
        )
        .get(calendarId, user.id);
    let level = member ? member.accessLevel : null;
    const groupRows = db
        .prepare(
            `SELECT cg.access_level AS accessLevel FROM calendar_groups cg
             INNER JOIN group_members gm ON gm.group_id = cg.group_id
             WHERE cg.calendar_id = ? AND gm.user_id = ?`
        )
        .all(calendarId, user.id);
    for (const row of groupRows) {
        level = level ? maxAccessLevel(level, row.accessLevel) : row.accessLevel;
    }
    return level ? normalizeAccessLevel(level) : null;
}

function canAccessCalendar(user, calendarId) {
    if (!user || !calendarId) {
        return false;
    }
    if (!canViewCalendars(user)) {
        return false;
    }
    if (canListAllCalendars(user)) {
        return true;
    }
    return getUserAccessLevel(user, calendarId) != null;
}

function canEditCalendar(user, calendarId) {
    if (!user || !calendarId) {
        return false;
    }
    const level = getUserAccessLevel(user, calendarId);
    return level === 'editor';
}

function canSuggestChanges(user, calendarId) {
    if (!user || !calendarId) {
        return false;
    }
    const level = getUserAccessLevel(user, calendarId);
    return level === 'suggester' || level === 'editor';
}

function listCalendarsForUser(user) {
    const db = getDb();
    const selectCols =
        'id, name, revision, updated_at AS updatedAt, updated_by AS updatedBy, created_by_user_id AS createdByUserId';
    if (canListAllCalendars(user)) {
        return db
            .prepare(`SELECT ${selectCols} FROM calendars ORDER BY name COLLATE NOCASE`)
            .all()
            .map((row) => Object.assign({}, row, calendarListRowExtras(user, row)));
    }
    if (!canViewCalendars(user)) {
        return [];
    }
    return db
        .prepare(
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
        .all(user.id, user.id)
        .map((row) => Object.assign({}, row, calendarListRowExtras(user, row)));
}

function getCalendarAccess(calendarId) {
    const db = getDb();
    const users = db
        .prepare(
            `SELECT user_id AS userId, access_level AS accessLevel
             FROM calendar_members WHERE calendar_id = ? ORDER BY user_id`
        )
        .all(calendarId);
    const groups = db
        .prepare(
            `SELECT group_id AS groupId, access_level AS accessLevel
             FROM calendar_groups WHERE calendar_id = ? ORDER BY group_id`
        )
        .all(calendarId);
    return {
        userAccess: users.map((r) => ({
            userId: r.userId,
            accessLevel: normalizeAccessLevel(r.accessLevel)
        })),
        groupAccess: groups.map((r) => ({
            groupId: r.groupId,
            accessLevel: normalizeAccessLevel(r.accessLevel)
        })),
        userIds: users.map((r) => r.userId),
        groupIds: groups.map((r) => r.groupId)
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

function filterActiveUserAccess(userAccess) {
    const ids = [...new Set(userAccess.map((u) => u.userId).filter(Boolean))];
    if (ids.length === 0) {
        return [];
    }
    const db = getDb();
    const placeholders = ids.map(() => '?').join(',');
    const active = new Set(
        db
            .prepare(`SELECT id FROM users WHERE active = 1 AND id IN (${placeholders})`)
            .all(...ids)
            .map((r) => r.id)
    );
    return userAccess.filter((u) => active.has(u.userId));
}

function filterExistingGroupAccess(groupAccess) {
    const ids = [...new Set(groupAccess.map((g) => g.groupId).filter(Boolean))];
    if (ids.length === 0) {
        return [];
    }
    const db = getDb();
    const placeholders = ids.map(() => '?').join(',');
    const existing = new Set(
        db
            .prepare(`SELECT id FROM teacher_groups WHERE id IN (${placeholders})`)
            .all(...ids)
            .map((r) => r.id)
    );
    return groupAccess.filter((g) => existing.has(g.groupId));
}

function setCalendarAccess(calendarId, userIdsOrPayload, groupIds, grantedByUserId) {
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
    const users = filterActiveUserAccess(userAccess);
    const groups = filterExistingGroupAccess(groupAccess);
    const db = getDb();
    const at = new Date().toISOString();
    db.prepare('DELETE FROM calendar_members WHERE calendar_id = ?').run(calendarId);
    db.prepare('DELETE FROM calendar_groups WHERE calendar_id = ?').run(calendarId);
    const insertMember = db.prepare(
        `INSERT INTO calendar_members (calendar_id, user_id, granted_at, granted_by_user_id, access_level)
         VALUES (?, ?, ?, ?, ?)`
    );
    const insertGroup = db.prepare(
        `INSERT INTO calendar_groups (calendar_id, group_id, granted_at, granted_by_user_id, access_level)
         VALUES (?, ?, ?, ?, ?)`
    );
    for (const u of users) {
        insertMember.run(calendarId, u.userId, at, grantedByUserId || null, u.accessLevel);
    }
    for (const g of groups) {
        insertGroup.run(calendarId, g.groupId, at, grantedByUserId || null, g.accessLevel);
    }
    return {
        userAccess: users,
        groupAccess: groups,
        userIds: users.map((u) => u.userId),
        groupIds: groups.map((g) => g.groupId)
    };
}

function deleteCalendarAccess(calendarId) {
    const db = getDb();
    db.prepare('DELETE FROM calendar_members WHERE calendar_id = ?').run(calendarId);
    db.prepare('DELETE FROM calendar_groups WHERE calendar_id = ?').run(calendarId);
}

function listTeachers() {
    const db = getDb();
    return db
        .prepare(
            `SELECT id, email, display_name AS displayName, role FROM users
             WHERE active = 1
             ORDER BY display_name COLLATE NOCASE`
        )
        .all();
}

function listGroups() {
    const db = getDb();
    return db
        .prepare(
            'SELECT id, name, created_at AS createdAt, created_by_user_id AS createdByUserId FROM teacher_groups ORDER BY name COLLATE NOCASE'
        )
        .all();
}

function getGroup(groupId) {
    const db = getDb();
    return db
        .prepare(
            'SELECT id, name, created_at AS createdAt, created_by_user_id AS createdByUserId FROM teacher_groups WHERE id = ?'
        )
        .get(groupId);
}

function createGroup(id, name, createdByUserId) {
    const db = getDb();
    const at = new Date().toISOString();
    db.prepare('INSERT INTO teacher_groups (id, name, created_at, created_by_user_id) VALUES (?, ?, ?, ?)').run(
        id,
        String(name).trim(),
        at,
        createdByUserId || null
    );
    return getGroup(id);
}

function updateGroupName(groupId, name) {
    const db = getDb();
    db.prepare('UPDATE teacher_groups SET name = ? WHERE id = ?').run(String(name).trim(), groupId);
    return getGroup(groupId);
}

function deleteGroup(groupId) {
    const db = getDb();
    db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
    db.prepare('DELETE FROM calendar_groups WHERE group_id = ?').run(groupId);
    db.prepare('DELETE FROM teacher_groups WHERE id = ?').run(groupId);
}

function getGroupMemberIds(groupId) {
    const db = getDb();
    const rows = db.prepare('SELECT user_id AS userId FROM group_members WHERE group_id = ?').all(groupId);
    return rows.map((row) => row.userId);
}

function setGroupMembers(groupId, userIds) {
    const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
    const db = getDb();
    let users = [];
    if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        users = db
            .prepare(`SELECT id FROM users WHERE active = 1 AND id IN (${placeholders})`)
            .all(...ids)
            .map((r) => r.id);
    }
    db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
    const insert = db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)');
    for (const uid of users) {
        insert.run(groupId, uid);
    }
    return users;
}

function listAdminCalendarsWithAccess() {
    const db = getDb();
    const cals = db
        .prepare(
            'SELECT id, name, revision, updated_at AS updatedAt, updated_by AS updatedBy, created_by_user_id AS createdByUserId FROM calendars ORDER BY name COLLATE NOCASE'
        )
        .all();
    return cals.map((cal) => Object.assign({}, cal, getCalendarAccess(cal.id)));
}

function listAdminCalendarsForUser(user) {
    const all = listAdminCalendarsWithAccess();
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

function getCalendarSummaryForUser(user) {
    if (!user) {
        return { calendarAccessMode: 'none', calendarSummary: [] };
    }
    if (canListAllCalendars(user)) {
        return { calendarAccessMode: 'all', calendarSummary: [] };
    }
    const cals = listCalendarsForUser(user);
    const calendarSummary = cals.map((cal) => ({
        calendarId: cal.id,
        name: cal.name,
        accessLevel: getUserAccessLevel(user, cal.id)
    }));
    return {
        calendarAccessMode: calendarSummary.length ? 'some' : 'none',
        calendarSummary
    };
}

module.exports = {
    canViewAllCalendars,
    canViewCalendars,
    getCalendarCreatedByUserId,
    isCalendarCreator,
    canManageCalendarAccess,
    canDeleteCalendar,
    canListAdminCalendars,
    getUserAccessLevel,
    canAccessCalendar,
    canEditCalendar,
    canSuggestChanges,
    listCalendarsForUser,
    getCalendarAccess,
    setCalendarAccess,
    deleteCalendarAccess,
    listTeachers,
    listGroups,
    getGroup,
    createGroup,
    updateGroupName,
    deleteGroup,
    getGroupMemberIds,
    setGroupMembers,
    listAdminCalendarsWithAccess,
    listAdminCalendarsForUser,
    getCalendarSummaryForUser,
    normalizeAccessLevel
};
