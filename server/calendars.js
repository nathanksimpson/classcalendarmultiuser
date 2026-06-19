const { getDb, newId, nowIso } = require('./schema');
const users = require('./users');
const CalAccess = require('./calendar-access');
const Auth = require('./auth-permissions');
const { recordActivityForUser } = require('./activity-log');
const DayNotesAccess = require('./day-notes-access');
const ClassroomAccess = require('./classroom-access');
const CalStorage = require('./calendar-storage');
const CalendarMutations = require('../shared/calendar-mutations.cjs');

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
        .prepare(`SELECT ${CalStorage.CALENDAR_DOC_SELECT} FROM calendars WHERE id = ?`)
        .get(id);
    return CalStorage.parseCalendarRow(row);
}

function getCalendarMeta(id) {
    const db = getDb();
    return db
        .prepare(
            'SELECT id, name, revision, updated_at AS updatedAt, updated_by AS updatedBy, created_by_user_id AS createdByUserId FROM calendars WHERE id = ?'
        )
        .get(id);
}

function normalizeCalendarName(name) {
    return String(name || '').trim();
}

function findCalendarByName(name, excludeId) {
    const normalized = normalizeCalendarName(name);
    if (!normalized) {
        return null;
    }
    const db = getDb();
    const exclude = excludeId ? String(excludeId) : '';
    return (
        db
            .prepare(
                `SELECT id, name FROM calendars
                 WHERE LOWER(TRIM(name)) = LOWER(?) AND id != ? LIMIT 1`
            )
            .get(normalized, exclude) || null
    );
}

function assertNameAvailable(name, excludeId) {
    const existing = findCalendarByName(name, excludeId);
    if (existing) {
        const err = new Error(
            'A calendar named "' + normalizeCalendarName(name) + '" already exists'
        );
        err.status = 409;
        err.code = 'DUPLICATE_NAME';
        throw err;
    }
}

function createCalendar(id, name, data, editorLabel, createdByUserId) {
    assertNameAvailable(name);
    const db = getDb();
    const trimmed = normalizeCalendarName(name);
    const now = nowIso();
    const stored = CalStorage.serializeCalendarData(id, data);
    db.prepare(
        `INSERT INTO calendars (id, name, data, data_enc_version, data_key_wrapped, revision, updated_at, updated_by, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).run(
        id,
        trimmed,
        stored.data,
        stored.dataEncVersion,
        stored.dataKeyWrapped,
        now,
        editorLabel || '',
        createdByUserId || null
    );
    return getCalendar(id);
}

function updateCalendar(id, name, data, revision, editorLabel, force, user) {
    const db = getDb();
    const existing = db.prepare('SELECT revision, name FROM calendars WHERE id = ?').get(id);
    if (!existing) {
        return { ok: false, status: 404, error: 'Calendar not found' };
    }

    if (!CalAccess.canEditCalendar(user, id)) {
        return { ok: false, status: 403, error: 'You do not have edit access to this calendar' };
    }

    const displayName = name != null ? normalizeCalendarName(name) : existing.name;
    if (displayName.toLowerCase() !== String(existing.name || '').trim().toLowerCase()) {
        try {
            assertNameAvailable(displayName, id);
        } catch (err) {
            return { ok: false, status: err.status || 409, error: err.message, code: err.code };
        }
    }

    const lockState = users.lockStatusForClient(id, user.id, user);
    const forceAllowed =
        Boolean(force) &&
        (Auth.canForceUnlock(user) ||
            Auth.hasPermission(user, Auth.PERMS.FORCE_SAVE) ||
            lockState.holdsLock);
    if (lockState.readOnly && !forceAllowed) {
        return { ok: false, status: 423, error: 'Calendar is locked by another user', lock: lockState.lock };
    }
    const lockRow = users.getLock(id);
    if (!forceAllowed && lockRow && lockRow.holder_user_id !== user.id) {
        return {
            ok: false,
            status: 423,
            error: 'Calendar is locked by another user',
            lock: lockState.lock
        };
    }

    if (!forceAllowed && revision != null && Number(revision) !== Number(existing.revision)) {
        return { ok: false, status: 409, document: getCalendar(id) };
    }

    const nextRevision = Number(existing.revision) + 1;
    const now = nowIso();
    const label = editorLabel || user.displayName || user.email || 'Teacher';
    const stored = CalStorage.serializeCalendarData(id, data);
    db.prepare(
        `UPDATE calendars SET name = ?, data = ?, data_enc_version = ?, data_key_wrapped = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ?`
    ).run(
        displayName,
        stored.data,
        stored.dataEncVersion,
        stored.dataKeyWrapped,
        nextRevision,
        now,
        label,
        id
    );

    const meta = getCalendarMeta(id);
    recordActivityForUser(user, {
        action: 'calendar_save',
        calendarId: id,
        calendarName: meta && meta.name,
        summary: `Saved calendar (revision ${nextRevision})`,
        detail: { revision: nextRevision }
    });

    if (lockState.holdsLock) {
        users.refreshLock(id, user.id);
    }

    return { ok: true, document: getCalendar(id) };
}

/** Merge dayNotes only — does not require collaborative calendar edit lock. */
function updateCalendarDayNotes(id, dayNotes, revision, editorLabel, user) {
    if (!CalAccess.canEditCalendar(user, id) && !CalAccess.canSuggestChanges(user, id)) {
        return { ok: false, status: 403, error: 'You do not have edit access to this calendar' };
    }
    const existingDoc = getCalendar(id);
    if (!existingDoc) {
        return { ok: false, status: 404, error: 'Calendar not found' };
    }
    const prepared = DayNotesAccess.prepareDayNotesForSave(user, existingDoc.data, dayNotes);
    if (prepared.error) {
        return { ok: false, status: 403, error: prepared.error };
    }
    if (revision != null && Number(revision) !== Number(existingDoc.revision)) {
        return { ok: false, status: 409, document: existingDoc };
    }
    const mergedData = Object.assign({}, existingDoc.data, {
        dayNotes: Array.isArray(prepared.dayNotes) ? prepared.dayNotes : []
    });
    const db = getDb();
    const nextRevision = Number(existingDoc.revision) + 1;
    const now = nowIso();
    const label = editorLabel || user.displayName || user.email || 'Teacher';
    const stored = CalStorage.serializeCalendarData(id, mergedData);
    db.prepare(
        `UPDATE calendars SET data = ?, data_enc_version = ?, data_key_wrapped = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ?`
    ).run(
        stored.data,
        stored.dataEncVersion,
        stored.dataKeyWrapped,
        nextRevision,
        now,
        label,
        id
    );

    const meta = getCalendarMeta(id);
    recordActivityForUser(user, {
        action: 'day_notes_save',
        calendarId: id,
        calendarName: meta && meta.name,
        summary: `Saved class day notes (revision ${nextRevision})`,
        detail: { revision: nextRevision }
    });

    return { ok: true, document: getCalendar(id) };
}

/** Merge classroom slices — does not require collaborative calendar edit lock. */
function updateCalendarClassroom(id, payload, revision, editorLabel, user) {
    if (!CalAccess.canEditCalendar(user, id) && !CalAccess.canSuggestChanges(user, id)) {
        return { ok: false, status: 403, error: 'You do not have edit access to this calendar' };
    }
    const existingDoc = getCalendar(id);
    if (!existingDoc) {
        return { ok: false, status: 404, error: 'Calendar not found' };
    }
    const prepared = ClassroomAccess.prepareClassroomForSave(user, existingDoc.data, payload);
    if (prepared.error) {
        return { ok: false, status: 403, error: prepared.error };
    }
    if (revision != null && Number(revision) !== Number(existingDoc.revision)) {
        return { ok: false, status: 409, document: existingDoc };
    }
    const mergedData = Object.assign({}, existingDoc.data, prepared.merged);
    const db = getDb();
    const nextRevision = Number(existingDoc.revision) + 1;
    const now = nowIso();
    const label = editorLabel || user.displayName || user.email || 'Teacher';
    const stored = CalStorage.serializeCalendarData(id, mergedData);
    db.prepare(
        `UPDATE calendars SET data = ?, data_enc_version = ?, data_key_wrapped = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ?`
    ).run(
        stored.data,
        stored.dataEncVersion,
        stored.dataKeyWrapped,
        nextRevision,
        now,
        label,
        id
    );

    const meta = getCalendarMeta(id);
    recordActivityForUser(user, {
        action: 'classroom_save',
        calendarId: id,
        calendarName: meta && meta.name,
        summary: `Saved classroom data (revision ${nextRevision})`,
        detail: { revision: nextRevision, fields: Object.keys(prepared.merged) }
    });

    return { ok: true, document: getCalendar(id) };
}

function patchCalendar(id, baseRevision, mutations, editorLabel, force, user) {
    const validated = CalendarMutations.validateMutations(mutations);
    if (!validated.ok) {
        return { ok: false, status: 400, error: validated.error };
    }

    const db = getDb();
    const existing = db.prepare('SELECT revision, name FROM calendars WHERE id = ?').get(id);
    if (!existing) {
        return { ok: false, status: 404, error: 'Calendar not found' };
    }

    if (!CalAccess.canEditCalendar(user, id)) {
        return { ok: false, status: 403, error: 'You do not have edit access to this calendar' };
    }

    const lockState = users.lockStatusForClient(id, user.id, user);
    const forceAllowed =
        Boolean(force) &&
        (Auth.canForceUnlock(user) ||
            Auth.hasPermission(user, Auth.PERMS.FORCE_SAVE) ||
            lockState.holdsLock);
    if (lockState.readOnly && !forceAllowed) {
        return { ok: false, status: 423, error: 'Calendar is locked by another user', lock: lockState.lock };
    }
    const lockRow = users.getLock(id);
    if (!forceAllowed && lockRow && lockRow.holder_user_id !== user.id) {
        return {
            ok: false,
            status: 423,
            error: 'Calendar is locked by another user',
            lock: lockState.lock
        };
    }

    if (!forceAllowed && baseRevision != null && Number(baseRevision) !== Number(existing.revision)) {
        return { ok: false, status: 409, document: getCalendar(id) };
    }

    const existingDoc = getCalendar(id);
    let mergedData = CalendarMutations.applyCalendarMutations(existingDoc.data, mutations);

    const touchesDayNotes = mutations.some((m) => m && m.entity === 'dayNotes');
    if (touchesDayNotes) {
        const prepared = DayNotesAccess.prepareDayNotesForSave(user, existingDoc.data, mergedData.dayNotes);
        if (prepared.error) {
            return { ok: false, status: 403, error: prepared.error };
        }
        mergedData = Object.assign({}, mergedData, { dayNotes: prepared.dayNotes });
    }

    const nextRevision = Number(existing.revision) + 1;
    const now = nowIso();
    const label = editorLabel || user.displayName || user.email || 'Teacher';
    const stored = CalStorage.serializeCalendarData(id, mergedData);
    db.prepare(
        `UPDATE calendars SET data = ?, data_enc_version = ?, data_key_wrapped = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ?`
    ).run(
        stored.data,
        stored.dataEncVersion,
        stored.dataKeyWrapped,
        nextRevision,
        now,
        label,
        id
    );

    const meta = getCalendarMeta(id);
    recordActivityForUser(user, {
        action: 'calendar_patch',
        calendarId: id,
        calendarName: meta && meta.name,
        summary: `Patched calendar (${mutations.length} mutation(s), revision ${nextRevision})`,
        detail: { revision: nextRevision, mutationCount: mutations.length }
    });

    if (lockState.holdsLock) {
        users.refreshLock(id, user.id);
    }

    return { ok: true, document: getCalendar(id) };
}

function deleteCalendar(id) {
    const db = getDb();
    const result = db.prepare('DELETE FROM calendars WHERE id = ?').run(id);
    db.prepare('DELETE FROM calendar_locks WHERE calendar_id = ?').run(id);
    db.prepare('DELETE FROM calendar_suggestions WHERE calendar_id = ?').run(id);
    return result.changes > 0;
}

module.exports = {
    listCalendars,
    getCalendar,
    getCalendarMeta,
    findCalendarByName,
    assertNameAvailable,
    createCalendar,
    updateCalendar,
    updateCalendarDayNotes,
    updateCalendarClassroom,
    patchCalendar,
    deleteCalendar,
    newId
};
