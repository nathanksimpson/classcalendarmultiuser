const blobAtRest = require('../crypto/blob-at-rest');

function getMasterKey() {
    return process.env.DATA_ENCRYPTION_MASTER_KEY || '';
}

function encryptionRequired() {
    return blobAtRest.encryptionRequiredFromEnv(process.env);
}

function serializeDataBlob(entityId, dataObject) {
    const plain = JSON.stringify(dataObject);
    const enc = blobAtRest.encryptBlob(plain, entityId, getMasterKey());
    if (enc) {
        return enc;
    }
    if (encryptionRequired()) {
        const err = new Error('DATA_ENCRYPTION_MASTER_KEY is required but not set');
        err.status = 500;
        throw err;
    }
    return { data: plain, dataKeyWrapped: null, dataEncVersion: 0 };
}

function parseDataObjectFromRow(row, entityId) {
    const plain = blobAtRest.decryptBlob(row, getMasterKey(), entityId != null ? entityId : row.id);
    return JSON.parse(plain);
}

function parseCalendarRow(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        name: row.name,
        revision: row.revision,
        updatedAt: row.updatedAt != null ? row.updatedAt : row.updated_at,
        updatedBy: row.updatedBy != null ? row.updatedBy : row.updated_by,
        data: parseDataObjectFromRow(row, row.id)
    };
}

function serializeCalendarData(calendarId, dataObject) {
    return serializeDataBlob(calendarId, dataObject);
}

function parseSuggestionRow(row) {
    if (!row) {
        return null;
    }
    return Object.assign({}, row, {
        data: parseDataObjectFromRow(row, row.id)
    });
}

function serializeSuggestionData(suggestionId, dataObject) {
    return serializeDataBlob(suggestionId, dataObject);
}

/** SQL columns to SELECT for calendar documents with encryption metadata. */
const CALENDAR_DOC_SELECT =
    'id, name, data, data_enc_version AS dataEncVersion, data_key_wrapped AS dataKeyWrapped, revision, updated_at AS updatedAt, updated_by AS updatedBy';

const SUGGESTION_DOC_SELECT =
    'id, calendar_id AS calendarId, base_revision AS baseRevision, data, data_enc_version AS dataEncVersion, data_key_wrapped AS dataKeyWrapped, summary, created_by_user_id AS createdByUserId, created_by_name AS createdByName, created_at AS createdAt, status';

module.exports = {
    parseCalendarRow,
    serializeCalendarData,
    parseSuggestionRow,
    serializeSuggestionData,
    parseDataObjectFromRow,
    CALENDAR_DOC_SELECT,
    SUGGESTION_DOC_SELECT,
    getMasterKey
};
