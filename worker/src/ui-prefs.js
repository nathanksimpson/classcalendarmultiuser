/**
 * Per-user UI prefs (worker / D1) — nav layout, etc.
 */
import { dbOne, dbRun, nowIso } from './db.js';

function emptyPrefs() {
    return {
        navZoneOrder: null,
        navTabZone: null,
        navTabOrder: null,
        updatedAt: null
    };
}

function parsePrefsJson(raw) {
    if (!raw || typeof raw !== 'string') {
        return {};
    }
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function sanitizePrefsBody(body) {
    const src = body && typeof body === 'object' ? body : {};
    const out = {};
    if (Array.isArray(src.navZoneOrder)) {
        out.navZoneOrder = src.navZoneOrder.map((id) => String(id || '').trim()).filter(Boolean);
    }
    if (src.navTabZone && typeof src.navTabZone === 'object' && !Array.isArray(src.navTabZone)) {
        const map = {};
        Object.keys(src.navTabZone).forEach((tabId) => {
            const tid = String(tabId || '').trim();
            const zoneId = String(src.navTabZone[tabId] || '').trim();
            if (tid && zoneId) {
                map[tid] = zoneId;
            }
        });
        out.navTabZone = map;
    }
    if (src.navTabOrder && typeof src.navTabOrder === 'object' && !Array.isArray(src.navTabOrder)) {
        const map = {};
        Object.keys(src.navTabOrder).forEach((zoneId) => {
            const zid = String(zoneId || '').trim();
            const order = src.navTabOrder[zoneId];
            if (!zid || !Array.isArray(order)) {
                return;
            }
            map[zid] = order.map((id) => String(id || '').trim()).filter(Boolean);
        });
        out.navTabOrder = map;
    }
    return out;
}

function rowToResponse(row) {
    if (!row) {
        return emptyPrefs();
    }
    const parsed = parsePrefsJson(row.prefs_json);
    return {
        navZoneOrder: Array.isArray(parsed.navZoneOrder) ? parsed.navZoneOrder : null,
        navTabZone: parsed.navTabZone && typeof parsed.navTabZone === 'object' ? parsed.navTabZone : null,
        navTabOrder: parsed.navTabOrder && typeof parsed.navTabOrder === 'object' ? parsed.navTabOrder : null,
        updatedAt: row.updated_at || null
    };
}

/** Reserved calendar_id row for prefs that follow the user across calendars. */
export const USER_PREFS_CALENDAR_ID = '__user__';
const CLASS_SCOPE_VALUES = ['all', 'mine'];

export function isReservedCalendarId(calendarId) {
    return String(calendarId || '') === USER_PREFS_CALENDAR_ID;
}

export function sanitizeUserPrefsBody(body) {
    const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const out = {};
    if (Object.prototype.hasOwnProperty.call(src, 'classScope')) {
        const scope = String(src.classScope == null ? '' : src.classScope).trim();
        out.classScope = CLASS_SCOPE_VALUES.includes(scope) ? scope : null;
    }
    return out;
}

function userRowToResponse(row) {
    const parsed = row ? parsePrefsJson(row.prefs_json) : {};
    return {
        classScope: CLASS_SCOPE_VALUES.includes(parsed.classScope) ? parsed.classScope : null,
        updatedAt: (row && row.updated_at) || null
    };
}

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
