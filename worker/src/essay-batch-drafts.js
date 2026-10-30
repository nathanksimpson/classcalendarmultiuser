/**
 * Per-teacher batch editor draft (worker / D1).
 * Encrypted like calendar blobs. API keys are stripped before write.
 */
import { dbOne, dbRun, nowIso } from './db.js';
import { parseDataObjectFromRow, serializeDataBlob } from './calendar-storage.js';
import {
    draftConflict,
    draftEntityId,
    emptyDraftResponse,
    sanitizeDraft
} from '../../shared/essay-batch-draft-core.cjs';

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

async function readRow(env, userId, calendarId) {
    return dbOne(env, SELECT_SQL, userId, calendarId);
}

function draftFromRow(row, userId, calendarId, env) {
    if (!row || row.data == null || row.data === '') {
        return emptyDraftResponse();
    }
    const stored = parseDataObjectFromRow(row, draftEntityId(userId, calendarId), env);
    const sanitized = sanitizeDraft(stored);
    if (sanitized.error) {
        throw fail(sanitized.error, sanitized.status || 500, sanitized.code || 'DRAFT_INVALID');
    }
    return {
        draft: sanitized.draft,
        updatedAt: row.updatedAt || null
    };
}

export async function getDraft(env, userId, calendarId) {
    if (!userId || !calendarId) {
        return emptyDraftResponse();
    }
    const row = await readRow(env, userId, calendarId);
    return draftFromRow(row, userId, calendarId, env);
}

export async function putDraft(env, userId, calendarId, body) {
    if (!userId || !calendarId) {
        throw fail('Missing draft owner', 400, 'DRAFT_OWNER');
    }
    const src = body && typeof body === 'object' ? body : {};
    const row = await readRow(env, userId, calendarId);
    const existingAt = row && row.updatedAt ? row.updatedAt : '';
    if (draftConflict(existingAt, src.baseUpdatedAt)) {
        const current = draftFromRow(row, userId, calendarId, env);
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
    const blob = serializeDataBlob(draftEntityId(userId, calendarId), sanitized.draft, env);
    await dbRun(
        env,
        UPSERT_SQL,
        userId,
        calendarId,
        blob.data,
        blob.dataEncVersion,
        blob.dataKeyWrapped,
        updatedAt
    );
    return { draft: sanitized.draft, updatedAt };
}
