const { getDb, newId, nowIso } = require('./schema');
const users = require('./users');

function listCalendars() {
    const db = getDb();
    return db
        .prepare(
            'SELECT id, name, revision, updated_at AS updatedAt, updated_by AS updatedBy FROM calendars ORDER BY name COLLATE NOCASE'
        )
        .all();
}

function getCalendar(id) {
    const db = getDb();
    const row = db
        .prepare(
            'SELECT id, name, data, revision, updated_at AS updatedAt, updated_by AS updatedBy FROM calendars WHERE id = ?'
        )
        .get(id);
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        name: row.name,
        revision: row.revision,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
        data: JSON.parse(row.data)
    };
}

function getCalendarMeta(id) {
    const db = getDb();
    return db
        .prepare('SELECT id, revision, updated_at AS updatedAt, updated_by AS updatedBy FROM calendars WHERE id = ?')
        .get(id);
}

function createCalendar(id, name, data, editorLabel) {
    const db = getDb();
    const now = nowIso();
    const dataJson = JSON.stringify(data);
    db.prepare(
        `INSERT INTO calendars (id, name, data, revision, updated_at, updated_by)
         VALUES (?, ?, ?, 1, ?, ?)`
    ).run(id, name, dataJson, now, editorLabel || '');
    return getCalendar(id);
}

function updateCalendar(id, name, data, revision, editorLabel, force, user) {
    const db = getDb();
    const existing = db.prepare('SELECT revision FROM calendars WHERE id = ?').get(id);
    if (!existing) {
        return { ok: false, status: 404, error: 'Calendar not found' };
    }

    const lockState = users.lockStatusForClient(id, user.id);
    if (lockState.readOnly && !force) {
        return { ok: false, status: 423, error: 'Calendar is locked by another user', lock: lockState.lock };
    }

    if (!force && revision != null && Number(revision) !== Number(existing.revision)) {
        return { ok: false, status: 409, document: getCalendar(id) };
    }

    const nextRevision = Number(existing.revision) + 1;
    const now = nowIso();
    const label = editorLabel || user.displayName || user.email || 'Teacher';
    db.prepare(
        `UPDATE calendars SET name = ?, data = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ?`
    ).run(name, JSON.stringify(data), nextRevision, now, label, id);

    users.appendHistory(id, nextRevision, data, user);
    users.refreshLock(id, user.id);

    return { ok: true, document: getCalendar(id) };
}

function deleteCalendar(id) {
    const db = getDb();
    const result = db.prepare('DELETE FROM calendars WHERE id = ?').run(id);
    db.prepare('DELETE FROM calendar_locks WHERE calendar_id = ?').run(id);
    return result.changes > 0;
}

module.exports = {
    listCalendars,
    getCalendar,
    getCalendarMeta,
    createCalendar,
    updateCalendar,
    deleteCalendar,
    newId
};
