/**
 * Calendar access: direct members + group-based access (local server).
 */
const { getDb } = require('./schema');

function isAdmin(user) {
    return Boolean(user && user.role === 'admin');
}

function canAccessCalendar(user, calendarId) {
    if (!user || !calendarId) {
        return false;
    }
    if (isAdmin(user)) {
        return true;
    }
    const db = getDb();
    const row = db
        .prepare(
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
        .get(calendarId, user.id, user.id);
    return Boolean(row);
}

function listCalendarsForUser(user) {
    const db = getDb();
    if (isAdmin(user)) {
        return db
            .prepare(
                'SELECT id, name, revision, updated_at AS updatedAt, updated_by AS updatedBy FROM calendars ORDER BY name COLLATE NOCASE'
            )
            .all();
    }
    return db
        .prepare(
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
        .all(user.id, user.id);
}

function getCalendarAccess(calendarId) {
    const db = getDb();
    const users = db
        .prepare('SELECT user_id AS userId FROM calendar_members WHERE calendar_id = ? ORDER BY user_id')
        .all(calendarId);
    const groups = db
        .prepare('SELECT group_id AS groupId FROM calendar_groups WHERE calendar_id = ? ORDER BY group_id')
        .all(calendarId);
    return {
        userIds: users.map((r) => r.userId),
        groupIds: groups.map((r) => r.groupId)
    };
}

function filterActiveUserIds(userIds) {
    const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
    if (ids.length === 0) {
        return [];
    }
    const db = getDb();
    const placeholders = ids.map(() => '?').join(',');
    const rows = db
        .prepare(`SELECT id FROM users WHERE active = 1 AND id IN (${placeholders})`)
        .all(...ids);
    return rows.map((row) => row.id);
}

function filterExistingGroupIds(groupIds) {
    const ids = [...new Set((groupIds || []).map(String).filter(Boolean))];
    if (ids.length === 0) {
        return [];
    }
    const db = getDb();
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id FROM teacher_groups WHERE id IN (${placeholders})`).all(...ids);
    return rows.map((row) => row.id);
}

function setCalendarAccess(calendarId, userIds, groupIds, grantedByUserId) {
    const db = getDb();
    const users = filterActiveUserIds(userIds);
    const groups = filterExistingGroupIds(groupIds);
    const at = new Date().toISOString();
    db.prepare('DELETE FROM calendar_members WHERE calendar_id = ?').run(calendarId);
    db.prepare('DELETE FROM calendar_groups WHERE calendar_id = ?').run(calendarId);
    const insertMember = db.prepare(
        'INSERT INTO calendar_members (calendar_id, user_id, granted_at, granted_by_user_id) VALUES (?, ?, ?, ?)'
    );
    const insertGroup = db.prepare(
        'INSERT INTO calendar_groups (calendar_id, group_id, granted_at, granted_by_user_id) VALUES (?, ?, ?, ?)'
    );
    for (const uid of users) {
        insertMember.run(calendarId, uid, at, grantedByUserId || null);
    }
    for (const gid of groups) {
        insertGroup.run(calendarId, gid, at, grantedByUserId || null);
    }
    return { userIds: users, groupIds: groups };
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
            `SELECT id, email, display_name AS displayName, role FROM users WHERE active = 1 AND role = 'teacher' ORDER BY display_name COLLATE NOCASE`
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
    const users = filterActiveUserIds(userIds);
    const db = getDb();
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
            'SELECT id, name, revision, updated_at AS updatedAt, updated_by AS updatedBy FROM calendars ORDER BY name COLLATE NOCASE'
        )
        .all();
    return cals.map((cal) => Object.assign({}, cal, getCalendarAccess(cal.id)));
}

module.exports = {
    isAdmin,
    canAccessCalendar,
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
    listAdminCalendarsWithAccess
};
