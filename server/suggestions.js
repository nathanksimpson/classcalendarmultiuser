const { getDb, newId, nowIso } = require('./schema');
const CalStorage = require('./calendar-storage');

function createSuggestion(calendarId, user, baseRevision, data, summary) {
    const db = getDb();
    const id = newId();
    const at = nowIso();
    const name = user.displayName || user.email || 'Teacher';
    const stored = CalStorage.serializeSuggestionData(id, data);
    db.prepare(
        `INSERT INTO calendar_suggestions (id, calendar_id, base_revision, data, data_enc_version, data_key_wrapped, summary, created_by_user_id, created_by_name, created_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(
        id,
        calendarId,
        Number(baseRevision),
        stored.data,
        stored.dataEncVersion,
        stored.dataKeyWrapped,
        summary ? String(summary).trim() : null,
        user.id,
        name,
        at
    );
    return getSuggestion(id);
}

function getSuggestion(id) {
    const db = getDb();
    const row = db
        .prepare(`SELECT ${CalStorage.SUGGESTION_DOC_SELECT} FROM calendar_suggestions WHERE id = ?`)
        .get(id);
    return CalStorage.parseSuggestionRow(row);
}

function listPendingSuggestions(calendarId) {
    const db = getDb();
    const rows = db
        .prepare(
            `SELECT id, calendar_id AS calendarId, base_revision AS baseRevision, summary,
                    created_by_user_id AS createdByUserId, created_by_name AS createdByName,
                    created_at AS createdAt, status
             FROM calendar_suggestions WHERE calendar_id = ? AND status = 'pending'
             ORDER BY created_at ASC`
        )
        .all(calendarId);
    return rows;
}

function countPendingSuggestions(calendarId) {
    const db = getDb();
    const row = db
        .prepare(
            `SELECT COUNT(*) AS c FROM calendar_suggestions WHERE calendar_id = ? AND status = 'pending'`
        )
        .get(calendarId);
    return row ? row.c : 0;
}

function setSuggestionStatus(id, status) {
    getDb().prepare('UPDATE calendar_suggestions SET status = ? WHERE id = ?').run(status, id);
}

module.exports = {
    createSuggestion,
    getSuggestion,
    listPendingSuggestions,
    countPendingSuggestions,
    setSuggestionStatus
};
