/**
 * Per-user UI prefs (worker / D1) — nav layout, class scope, etc.
 * Pure sanitize/parse helpers live in shared/ui-prefs-core.cjs.
 */
import { dbOne, dbRun, nowIso } from './db.js';
import {
    USER_PREFS_CALENDAR_ID,
    emptyPrefs,
    parsePrefsJson,
    sanitizePrefsBody,
    rowToResponse,
    isReservedCalendarId,
    sanitizeUserPrefsBody,
    userRowToResponse
} from '../../shared/ui-prefs-core.cjs';

export { USER_PREFS_CALENDAR_ID, isReservedCalendarId, sanitizeUserPrefsBody };

async function readUserPrefsRow(env, userId) {
    return dbOne(
        env,
        `SELECT prefs_json, updated_at
         FROM user_ui_prefs
         WHERE user_id = ? AND calendar_id = ?`,
        userId,
        USER_PREFS_CALENDAR_ID
    );
}

export async function getUserPrefs(env, userId) {
    if (!userId) {
        return userRowToResponse(null);
    }
    return userRowToResponse(await readUserPrefsRow(env, userId));
}

export async function putUserPrefs(env, userId, body) {
    if (!userId) {
        return userRowToResponse(null);
    }
    const existing = parsePrefsJson((await readUserPrefsRow(env, userId))?.prefs_json);
    const merged = Object.assign({}, sanitizeUserPrefsBody(existing), sanitizeUserPrefsBody(body));
    await dbRun(
        env,
        `INSERT INTO user_ui_prefs (user_id, calendar_id, prefs_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, calendar_id) DO UPDATE SET
            prefs_json = excluded.prefs_json,
            updated_at = excluded.updated_at`,
        userId,
        USER_PREFS_CALENDAR_ID,
        JSON.stringify(merged),
        nowIso()
    );
    return getUserPrefs(env, userId);
}

export async function getPrefs(env, userId, calendarId) {
    if (!userId || !calendarId) {
        return emptyPrefs();
    }
    const row = await dbOne(
        env,
        `SELECT prefs_json, updated_at
         FROM user_ui_prefs
         WHERE user_id = ? AND calendar_id = ?`,
        userId,
        calendarId
    );
    return rowToResponse(row);
}

export async function putPrefs(env, userId, calendarId, body) {
    if (!userId || !calendarId) {
        return emptyPrefs();
    }
    const sanitized = sanitizePrefsBody(body);
    const updatedAt = nowIso();
    const prefsJson = JSON.stringify(sanitized);
    await dbRun(
        env,
        `INSERT INTO user_ui_prefs (user_id, calendar_id, prefs_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, calendar_id) DO UPDATE SET
            prefs_json = excluded.prefs_json,
            updated_at = excluded.updated_at`,
        userId,
        calendarId,
        prefsJson,
        updatedAt
    );
    return getPrefs(env, userId, calendarId);
}
