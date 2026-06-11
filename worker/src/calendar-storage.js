import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const blobAtRest = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../crypto/blob-at-rest.js'));

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

export const CALENDAR_DOC_SELECT =
    'id, name, data, data_enc_version AS dataEncVersion, data_key_wrapped AS dataKeyWrapped, revision, updated_at AS updatedAt, updated_by AS updatedBy';

export const SUGGESTION_DOC_SELECT =
    'id, calendar_id AS calendarId, base_revision AS baseRevision, data, data_enc_version AS dataEncVersion, data_key_wrapped AS dataKeyWrapped, summary, created_by_user_id AS createdByUserId, created_by_name AS createdByName, created_at AS createdAt, status';
