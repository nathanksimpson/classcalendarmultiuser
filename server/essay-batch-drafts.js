/**
 * Per-teacher batch editor draft (local Express / sqlite).
 * Encrypted like calendar blobs. API keys are stripped before write.
 */
const { getDb, nowIso } = require('./schema');
const { parseDataObjectFromRow, serializeCalendarData } = require('./calendar-storage');
const {
    draftConflict,
    draftEntityId,
    emptyDraftResponse,
    sanitizeDraft
} = require('../shared/essay-batch-draft-core.cjs');

const SELECT_SQL = `SELECT data,
            data_enc_version AS dataEncVersion,
            data_key_wrapped AS dataKeyWrapped,
            updated_at AS updatedAt
     FROM essay_batch_drafts
     WHERE user_id = ? AND calendar_id = ?`;

const UPSERT_SQL = `INSERT INTO essay_batch_drafts (
        user_id, calendar_id, data, data_enc_version, data_key_wrapped, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, calendar_id) DO UPDATE SET
        data = excluded.data,
        data_enc_version = excluded.data_enc_version,
        data_key_wrapped = excluded.data_key_wrapped,
        updated_at = excluded.updated_at`;

function fail(message, status, code, extra) {
    const err = new Error(message);
    err.status = status;
    err.code = code;
    if (extra && typeof extra === 'object') {
        Object.assign(err, extra);
    }
    return err;
}

function readRow(userId, calendarId) {
    return getDb().prepare(SELECT_SQL).get(userId, calendarId);
}

function draftFromRow(row, userId, calendarId) {
    if (!row || row.data == null || row.data === '') {
        return emptyDraftResponse();
    }
    const stored = parseDataObjectFromRow(row, draftEntityId(userId, calendarId));
    const sanitized = sanitizeDraft(stored);
    if (sanitized.error) {
        throw fail(sanitized.error, sanitized.status || 500, sanitized.code || 'DRAFT_INVALID');
    }
    return {
        draft: sanitized.draft,
        updatedAt: row.updatedAt || null
    };
}

function getDraft(userId, calendarId) {
    if (!userId || !calendarId) {
        return emptyDraftResponse();
    }
    return draftFromRow(readRow(userId, calendarId), userId, calendarId);
}

function putDraft(userId, calendarId, body) {
    if (!userId || !calendarId) {
        throw fail('Missing draft owner', 400, 'DRAFT_OWNER');
    }
    const src = body && typeof body === 'object' ? body : {};
    const row = readRow(userId, calendarId);
    const existingAt = row && row.updatedAt ? row.updatedAt : '';
    if (draftConflict(existingAt, src.baseUpdatedAt)) {
        const current = draftFromRow(row, userId, calendarId);
        throw fail(
            'This batch was saved on another computer. Reload to use that copy.',
            409,
            'DRAFT_CONFLICT',
            { draft: current.draft, updatedAt: current.updatedAt }
        );
    }
    const payload = src.draft !== undefined ? src.draft : src;
    const sanitized = sanitizeDraft(payload);
    if (sanitized.error) {
        throw fail(sanitized.error, sanitized.status || 400, sanitized.code || 'DRAFT_INVALID');
    }
    const updatedAt = nowIso();
    const blob = serializeCalendarData(draftEntityId(userId, calendarId), sanitized.draft);
    getDb()
        .prepare(UPSERT_SQL)
        .run(
            userId,
            calendarId,
            blob.data,
            blob.dataEncVersion,
            blob.dataKeyWrapped,
            updatedAt
        );
    return { draft: sanitized.draft, updatedAt };
}

module.exports = {
    getDraft,
    putDraft
};
