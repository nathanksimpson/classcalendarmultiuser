const { getDb, newId, nowIso } = require('./schema');
const users = require('./users');
const CalAccess = require('./calendar-access');
const Auth = require('./auth-permissions');
const { recordActivityForUser } = require('./activity-log');
const DayNotesAccess = require('./day-notes-access');
const ClassroomAccess = require('./classroom-access');
const CalStorage = require('./calendar-storage');
const CalendarMutations = require('../shared/calendar-mutations.cjs');
const SyncRevs = require('../shared/sync-revs.cjs');

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

    // No edit lock. A full save replaces the whole calendar (import / restore), so it still
    // needs the revision it was built from unless the user chose to overwrite.
    const forceAllowed = Boolean(force);

    if (!forceAllowed && revision != null && Number(revision) !== Number(existing.revision)) {
        return { ok: false, status: 409, document: getCalendar(id) };
    }

    const now = nowIso();
    const label = editorLabel || user.displayName || user.email || 'Teacher';
    const currentDoc = getCalendar(id);
    const stored = CalStorage.serializeCalendarData(
        id,
        SyncRevs.stampDiff(currentDoc.data, currentDoc.revision, data, Number(currentDoc.revision) + 1)
    );
    // Compare-and-set: guard the write on the revision we just read.
    let nextRevision = Number(existing.revision) + 1;
    let writeResult = db
        .prepare(
            `UPDATE calendars SET name = ?, data = ?, data_enc_version = ?, data_key_wrapped = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ? AND revision = ?`
        )
        .run(
            displayName,
            stored.data,
            stored.dataEncVersion,
            stored.dataKeyWrapped,
            nextRevision,
            now,
            label,
            id,
            Number(existing.revision)
        );
    if (writeResult.changes !== 1) {
        if (!forceAllowed) {
            return { ok: false, status: 409, document: getCalendar(id) };
        }
        // Force save: re-base onto the latest revision and retry.
        let forcedOk = false;
        for (let attempt = 0; attempt < 5 && !forcedOk; attempt += 1) {
            const cur = db.prepare('SELECT revision FROM calendars WHERE id = ?').get(id);
            if (!cur) {
                break;
            }
            nextRevision = Number(cur.revision) + 1;
            writeResult = db
                .prepare(
                    `UPDATE calendars SET name = ?, data = ?, data_enc_version = ?, data_key_wrapped = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ? AND revision = ?`
                )
                .run(
                    displayName,
                    stored.data,
                    stored.dataEncVersion,
                    stored.dataKeyWrapped,
                    nextRevision,
                    nowIso(),
                    label,
                    id,
                    Number(cur.revision)
                );
            forcedOk = writeResult.changes === 1;
        }
        if (!forcedOk) {
            return { ok: false, status: 409, document: getCalendar(id) };
        }
    }

    const meta = getCalendarMeta(id);
    recordActivityForUser(user, {
        action: 'calendar_save',
        calendarId: id,
        calendarName: meta && meta.name,
        summary: `Saved calendar (revision ${nextRevision})`,
        detail: { revision: nextRevision }
    });

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
    const mergedData = SyncRevs.stampDiff(
        existingDoc.data,
        existingDoc.revision,
        Object.assign({}, existingDoc.data, {
            dayNotes: Array.isArray(prepared.dayNotes) ? prepared.dayNotes : []
        }),
        Number(existingDoc.revision) + 1
    );
    const db = getDb();
    const nextRevision = Number(existingDoc.revision) + 1;
    const now = nowIso();
    const label = editorLabel || user.displayName || user.email || 'Teacher';
    const stored = CalStorage.serializeCalendarData(id, mergedData);
    const writeResult = db
        .prepare(
            `UPDATE calendars SET data = ?, data_enc_version = ?, data_key_wrapped = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ? AND revision = ?`
        )
        .run(
            stored.data,
            stored.dataEncVersion,
            stored.dataKeyWrapped,
            nextRevision,
            now,
            label,
            id,
            Number(existingDoc.revision)
        );
    if (writeResult.changes !== 1) {
        return { ok: false, status: 409, document: getCalendar(id) };
    }

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
    const mergedData = SyncRevs.stampDiff(
        existingDoc.data,
        existingDoc.revision,
        Object.assign({}, existingDoc.data, prepared.merged),
        Number(existingDoc.revision) + 1
    );
    const db = getDb();
    const nextRevision = Number(existingDoc.revision) + 1;
    const now = nowIso();
    const label = editorLabel || user.displayName || user.email || 'Teacher';
    const stored = CalStorage.serializeCalendarData(id, mergedData);
    const writeResult = db
        .prepare(
            `UPDATE calendars SET data = ?, data_enc_version = ?, data_key_wrapped = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ? AND revision = ?`
        )
        .run(
            stored.data,
            stored.dataEncVersion,
            stored.dataKeyWrapped,
            nextRevision,
            now,
            label,
            id,
            Number(existingDoc.revision)
        );
    if (writeResult.changes !== 1) {
        return { ok: false, status: 409, document: getCalendar(id) };
    }

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

    const domains = CalendarMutations.classifyMutations(mutations);
    const needsScheduleEdit = domains.schedule;
    const canEdit = CalAccess.canEditCalendar(user, id);
    const canSuggest = CalAccess.canSuggestChanges(user, id);
    // Schedule mutations require full edit access. Classroom/dayNotes-only may use suggester
    // (same as classroomOnly / dayNotesOnly PUT paths).
    if (needsScheduleEdit && !canEdit) {
        return { ok: false, status: 403, error: 'You do not have edit access to this calendar' };
    }
    if (!needsScheduleEdit && !canEdit && !canSuggest) {
        return { ok: false, status: 403, error: 'You do not have edit access to this calendar' };
    }

    const existingDoc = getCalendar(id);
    // No edit lock: apply on top of the latest. An item these mutations change that was also
    // changed after the client's base revision is "latest save wins"; report which ones.
    let overwritten = [];
    // Whole-session saves from an old copy never undo newer marks on other students.
    if (baseRevision != null) {
        mutations = SyncRevs.protectNewerRecords(existingDoc.data, mutations, baseRevision, existing.revision);
    }
    if (baseRevision != null && Number(baseRevision) !== Number(existing.revision)) {
        const check = SyncRevs.canRebase(existingDoc.data, mutations, baseRevision, existing.revision);
        if (!check.ok && check.reason === 'conflict') {
            overwritten = Array.from(new Set(check.keys)).slice(0, 40);
        }
    }
    let mergedData = CalendarMutations.applyCalendarMutations(existingDoc.data, mutations);

    if (domains.classroom) {
        const classroomPayload = CalendarMutations.classroomMutationsToPayload(
            mutations,
            existingDoc.data
        );
        const prepared = ClassroomAccess.prepareClassroomForSave(
            user,
            existingDoc.data,
            classroomPayload
        );
        if (prepared.error) {
            return { ok: false, status: 403, error: prepared.error };
        }
        mergedData = Object.assign({}, mergedData, prepared.merged);
    }

    if (domains.dayNotes) {
        const prepared = DayNotesAccess.prepareDayNotesForSave(
            user,
            existingDoc.data,
            mergedData.dayNotes
        );
        if (prepared.error) {
            return { ok: false, status: 403, error: prepared.error };
        }
        mergedData = Object.assign({}, mergedData, { dayNotes: prepared.dayNotes });
    }

    const nextRevision = Number(existing.revision) + 1;
    const now = nowIso();
    const label = editorLabel || user.displayName || user.email || 'Teacher';
    mergedData = SyncRevs.stampMutations(existingDoc.data, existing.revision, mergedData, mutations, nextRevision);
    const stored = CalStorage.serializeCalendarData(id, mergedData);
    // Compare-and-set: on contention return 409 so the client re-applies its mutations.
    const writeResult = db
        .prepare(
            `UPDATE calendars SET data = ?, data_enc_version = ?, data_key_wrapped = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ? AND revision = ?`
        )
        .run(
            stored.data,
            stored.dataEncVersion,
            stored.dataKeyWrapped,
            nextRevision,
            now,
            label,
            id,
            Number(existing.revision)
        );
    if (writeResult.changes !== 1) {
        return { ok: false, status: 409, document: getCalendar(id) };
    }

    const meta = getCalendarMeta(id);
    recordActivityForUser(user, {
        action: 'calendar_patch',
        calendarId: id,
        calendarName: meta && meta.name,
        summary: `Patched calendar (${mutations.length} mutation(s), revision ${nextRevision})`,
        detail: {
            revision: nextRevision,
            mutationCount: mutations.length,
            domains: {
                schedule: domains.schedule,
                classroom: domains.classroom,
                dayNotes: domains.dayNotes
            }
        }
    });

    return { ok: true, document: getCalendar(id), overwritten };
}

/**
 * Apply a suggestion onto the latest calendar: schedule from the suggestion, classroom
 * data and day notes as they are now. Refused when the schedule changed after the
 * suggestion was written.
 */
function applySuggestion(id, suggestion, editorLabel, user) {
    const current = getCalendar(id);
    if (!current) {
        return { ok: false, status: 404, error: 'Calendar not found' };
    }
    const merged = SyncRevs.applySuggestion(current.data, current.revision, suggestion.data, suggestion.baseRevision);
    if (!merged.ok) {
        return {
            ok: false,
            status: 409,
            code: 'SUGGESTION_OUTDATED',
            error: 'The schedule changed after this suggestion was written. Review it again before applying.',
            document: current
        };
    }
    const nextRevision = Number(current.revision) + 1;
    const data = SyncRevs.stampDiff(current.data, current.revision, merged.data, nextRevision);
    const stored = CalStorage.serializeCalendarData(id, data);
    const writeResult = getDb()
        .prepare(
            `UPDATE calendars SET data = ?, data_enc_version = ?, data_key_wrapped = ?, revision = ?, updated_at = ?, updated_by = ? WHERE id = ? AND revision = ?`
        )
        .run(
            stored.data,
            stored.dataEncVersion,
            stored.dataKeyWrapped,
            nextRevision,
            nowIso(),
            editorLabel || user.displayName || user.email || 'Teacher',
            id,
            Number(current.revision)
        );
    if (writeResult.changes !== 1) {
        return { ok: false, status: 409, document: getCalendar(id) };
    }
    return { ok: true, document: getCalendar(id) };
}

function deleteCalendar(id) {
    const db = getDb();
    db.prepare('DELETE FROM calendar_locks WHERE calendar_id = ?').run(id);
    db.prepare('DELETE FROM calendar_suggestions WHERE calendar_id = ?').run(id);
    db.prepare('DELETE FROM user_notification_meta WHERE calendar_id = ?').run(id);
    db.prepare('DELETE FROM user_ui_prefs WHERE calendar_id = ?').run(id);
    db.prepare('DELETE FROM essay_batch_drafts WHERE calendar_id = ?').run(id);
    db.prepare('DELETE FROM calendar_history WHERE calendar_id = ?').run(id);
    const result = db.prepare('DELETE FROM calendars WHERE id = ?').run(id);
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
    applySuggestion,
    deleteCalendar,
    newId
};
