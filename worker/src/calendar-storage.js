import * as blobAtRest from './blob-at-rest.js';

export function getMasterKeyFromEnv(env) {
    return (env && env.DATA_ENCRYPTION_MASTER_KEY) || '';
}

function encryptionRequired(env) {
    return blobAtRest.encryptionRequiredFromEnv(env || {});
}

export function serializeDataBlob(entityId, dataObject, env) {
    const plain = JSON.stringify(dataObject);
    const enc = blobAtRest.encryptBlob(plain, entityId, getMasterKeyFromEnv(env));
    if (enc) {
        return enc;
    }
    if (encryptionRequired(env)) {
        const err = new Error('DATA_ENCRYPTION_MASTER_KEY is required but not set');
        err.status = 500;
        throw err;
    }
    return { data: plain, dataKeyWrapped: null, dataEncVersion: 0 };
}

export function parseDataObjectFromRow(row, entityId, env) {
    const id = entityId != null ? entityId : row.id;
    const plain = blobAtRest.decryptBlob(row, getMasterKeyFromEnv(env), id);
    return JSON.parse(plain);
}

export function calendarDocForClient(row, env) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        name: row.name,
        revision: row.revision,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
        data: parseDataObjectFromRow(row, row.id, env)
    };
}

export function serializeCalendarData(calendarId, dataObject, env) {
    return serializeDataBlob(calendarId, dataObject, env);
}

export function suggestionDocForClient(row, env) {
    if (!row) {
        return null;
    }
    return Object.assign({}, row, {
        data: parseDataObjectFromRow(row, row.id, env)
    });
}

export function serializeSuggestionData(suggestionId, dataObject, env) {
    return serializeDataBlob(suggestionId, dataObject, env);
}

/**
 * Encrypt any legacy plaintext blobs left in D1 (data_enc_version = 0). Runs from the daily cron,
 * so the data never leaves Cloudflare. No-op until DATA_ENCRYPTION_MASTER_KEY is set.
 * Each UPDATE is guarded on the row still being plaintext (and, for calendars, on the same
 * revision) so a teacher save landing mid-run is never overwritten; that row is retried next run.
 */
export async function encryptPlaintextBlobs(env) {
    const key = getMasterKeyFromEnv(env);
    const result = { calendars: 0, suggestions: 0, skipped: 0 };
    if (!key || !env || !env.DB) {
        return result;
    }
    const pending = await env.DB.prepare(
        'SELECT id FROM calendars WHERE COALESCE(data_enc_version, 0) < 1'
    ).all();
    for (const { id } of (pending && pending.results) || []) {
        const row = await env.DB.prepare(
            'SELECT id, data, revision FROM calendars WHERE id = ? AND COALESCE(data_enc_version, 0) < 1'
        )
            .bind(id)
            .first();
        if (!row || String(row.data || '').startsWith('enc1$')) {
            continue;
        }
        const enc = blobAtRest.encryptBlob(String(row.data), row.id, key);
        const res = await env.DB.prepare(
            'UPDATE calendars SET data = ?, data_key_wrapped = ?, data_enc_version = 1 WHERE id = ? AND revision = ? AND COALESCE(data_enc_version, 0) < 1'
        )
            .bind(enc.data, enc.dataKeyWrapped, row.id, row.revision)
            .run();
        if (res && res.meta && res.meta.changes) {
            result.calendars += 1;
        } else {
            result.skipped += 1;
        }
    }
    const pendingSug = await env.DB.prepare(
        'SELECT id FROM calendar_suggestions WHERE COALESCE(data_enc_version, 0) < 1'
    ).all();
    for (const { id } of (pendingSug && pendingSug.results) || []) {
        const row = await env.DB.prepare(
            'SELECT id, data FROM calendar_suggestions WHERE id = ? AND COALESCE(data_enc_version, 0) < 1'
        )
            .bind(id)
            .first();
        if (!row || String(row.data || '').startsWith('enc1$')) {
            continue;
        }
        const enc = blobAtRest.encryptBlob(String(row.data), row.id, key);
        const res = await env.DB.prepare(
            'UPDATE calendar_suggestions SET data = ?, data_key_wrapped = ?, data_enc_version = 1 WHERE id = ? AND COALESCE(data_enc_version, 0) < 1'
        )
            .bind(enc.data, enc.dataKeyWrapped, row.id)
            .run();
        if (res && res.meta && res.meta.changes) {
            result.suggestions += 1;
        } else {
            result.skipped += 1;
        }
    }
    return result;
}

export const CALENDAR_DOC_SELECT =
    'id, name, data, data_enc_version AS dataEncVersion, data_key_wrapped AS dataKeyWrapped, revision, updated_at AS updatedAt, updated_by AS updatedBy';

export const SUGGESTION_DOC_SELECT =
    'id, calendar_id AS calendarId, base_revision AS baseRevision, data, data_enc_version AS dataEncVersion, data_key_wrapped AS dataKeyWrapped, summary, created_by_user_id AS createdByUserId, created_by_name AS createdByName, created_at AS createdAt, status';
