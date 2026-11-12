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
        data: withoutSyncMarks(parseDataObjectFromRow(row, row.id, env))
    };
}

/**
 * The client document for a save that just succeeded, built from what was written instead of
 * reading the whole row back from D1 (one less full read and parse per save).
 */
export function calendarDocFromSaved(calId, saved, revision) {
    return {
        id: calId,
        name: saved.name,
        revision,
        updatedAt: saved.updatedAt,
        updatedBy: saved.updatedBy,
        data: withoutSyncMarks(saved.data)
    };
}

/** Change marks (shared/sync-revs.cjs) are server bookkeeping; clients never need them. */
function withoutSyncMarks(data) {
    if (data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, '_syncRevs')) {
        const copy = Object.assign({}, data);
        delete copy._syncRevs;
        return copy;
    }
    return data;
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

/** Nightly snapshots are kept this long (D1 Time Travel covers 7 days on the free plan). */
export const CALENDAR_SNAPSHOT_KEEP_DAYS = 14;

/**
 * Copy every calendar that changed since its last snapshot into calendar_history, and drop
 * snapshots past the retention window. Runs from the daily cron as plain SQL, so the
 * documents never pass through Worker memory. Saves are latest-wins on a single row; this is
 * the way back from a bad save.
 *
 * A plaintext calendar is copied as-is. An encrypted one is wrapped with its key material,
 * {"encVersion","keyWrapped","data"}, because the wrapped key lives in separate columns.
 * To restore: put `data` (and the key columns, when wrapped) back on the calendars row and
 * bump its revision.
 */
export async function snapshotChangedCalendars(env, nowMs = Date.now()) {
    const savedAt = new Date(nowMs).toISOString();
    const cutoff = new Date(nowMs - CALENDAR_SNAPSHOT_KEEP_DAYS * 86400 * 1000).toISOString();
    const pruned = await env.DB.prepare('DELETE FROM calendar_history WHERE saved_at < ?').bind(cutoff).run();
    const copied = await env.DB.prepare(
        `INSERT INTO calendar_history (id, calendar_id, revision, data, saved_by_user_id, saved_by_name, saved_at)
         SELECT lower(hex(randomblob(16))), c.id, c.revision,
                CASE WHEN COALESCE(c.data_enc_version, 0) = 0 THEN c.data
                     ELSE json_object('encVersion', c.data_enc_version, 'keyWrapped', c.data_key_wrapped, 'data', c.data)
                END,
                NULL, COALESCE(c.updated_by, 'Teacher'), ?
         FROM calendars c
         WHERE NOT EXISTS (
             SELECT 1 FROM calendar_history h WHERE h.calendar_id = c.id AND h.revision = c.revision
         )`
    )
        .bind(savedAt)
        .run();
    return {
        copied: Number((copied && copied.meta && copied.meta.changes) || 0),
        pruned: Number((pruned && pruned.meta && pruned.meta.changes) || 0)
    };
}

export const CALENDAR_DOC_SELECT =
    'id, name, data, data_enc_version AS dataEncVersion, data_key_wrapped AS dataKeyWrapped, revision, updated_at AS updatedAt, updated_by AS updatedBy';

export const SUGGESTION_DOC_SELECT =
    'id, calendar_id AS calendarId, base_revision AS baseRevision, data, data_enc_version AS dataEncVersion, data_key_wrapped AS dataKeyWrapped, summary, created_by_user_id AS createdByUserId, created_by_name AS createdByName, created_at AS createdAt, status';
