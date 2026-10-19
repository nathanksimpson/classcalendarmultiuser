const { getDb, nowIso } = require('./schema');
const {
    USER_PREFS_CALENDAR_ID,
    emptyPrefs,
    parsePrefsJson,
    sanitizePrefsBody,
    rowToResponse,
    isReservedCalendarId,
    sanitizeUserPrefsBody,
    userRowToResponse
} = require('../shared/ui-prefs-core.cjs');

function readUserPrefsRow(userId) {
    return getDb()
        .prepare(
            `SELECT prefs_json, updated_at
             FROM user_ui_prefs
             WHERE user_id = ? AND calendar_id = ?`
        )
        .get(userId, USER_PREFS_CALENDAR_ID);
}

function getUserPrefs(userId) {
    if (!userId) {
        return userRowToResponse(null);
    }
    return userRowToResponse(readUserPrefsRow(userId));
}

function putUserPrefs(userId, body) {
    if (!userId) {
        return userRowToResponse(null);
    }
    const existingRow = readUserPrefsRow(userId);
    const existing = parsePrefsJson(existingRow && existingRow.prefs_json);
    const merged = Object.assign({}, sanitizeUserPrefsBody(existing), sanitizeUserPrefsBody(body));
    getDb()
        .prepare(
            `INSERT INTO user_ui_prefs (user_id, calendar_id, prefs_json, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id, calendar_id) DO UPDATE SET
                prefs_json = excluded.prefs_json,
                updated_at = excluded.updated_at`
        )
        .run(userId, USER_PREFS_CALENDAR_ID, JSON.stringify(merged), nowIso());
    return getUserPrefs(userId);
}

function getPrefs(userId, calendarId) {
    if (!userId || !calendarId) {
        return emptyPrefs();
    }
    const row = getDb()
        .prepare(
            `SELECT prefs_json, updated_at
             FROM user_ui_prefs
             WHERE user_id = ? AND calendar_id = ?`
        )
        .get(userId, calendarId);
    return rowToResponse(row);
}

function putPrefs(userId, calendarId, body) {
    if (!userId || !calendarId) {
        return emptyPrefs();
    }
    const sanitized = sanitizePrefsBody(body);
    const updatedAt = nowIso();
    const prefsJson = JSON.stringify(sanitized);
    getDb()
        .prepare(
            `INSERT INTO user_ui_prefs (user_id, calendar_id, prefs_json, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id, calendar_id) DO UPDATE SET
                prefs_json = excluded.prefs_json,
                updated_at = excluded.updated_at`
        )
        .run(userId, calendarId, prefsJson, updatedAt);
    return getPrefs(userId, calendarId);
}

module.exports = {
    USER_PREFS_CALENDAR_ID,
    isReservedCalendarId,
    sanitizeUserPrefsBody,
    getUserPrefs,
    putUserPrefs,
    getPrefs,
    putPrefs
};
