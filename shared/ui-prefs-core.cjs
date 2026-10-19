/**
 * Pure UI-prefs helpers shared by local Express (`server/ui-prefs.js`)
 * and Cloudflare Worker (`worker/src/ui-prefs.js`).
 * DB I/O stays in each backend adapter.
 */

/** Reserved calendar_id row for prefs that follow the user across calendars. */
const USER_PREFS_CALENDAR_ID = '__user__';
const CLASS_SCOPE_VALUES = ['all', 'mine'];

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

function isReservedCalendarId(calendarId) {
    return String(calendarId || '') === USER_PREFS_CALENDAR_ID;
}

function sanitizeUserPrefsBody(body) {
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

module.exports = {
    USER_PREFS_CALENDAR_ID,
    CLASS_SCOPE_VALUES,
    emptyPrefs,
    parsePrefsJson,
    sanitizePrefsBody,
    rowToResponse,
    isReservedCalendarId,
    sanitizeUserPrefsBody,
    userRowToResponse
};
