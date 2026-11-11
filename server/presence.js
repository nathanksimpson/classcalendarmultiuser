const { getDb, nowIso } = require('./schema');

const PRESENCE_STALE_SEC = 90;
const STALE_MS = PRESENCE_STALE_SEC * 1000;
/** Skip rewriting an unchanged row more often than this (must stay well under PRESENCE_STALE_SEC). */
const PRESENCE_WRITE_THROTTLE_MS = 30 * 1000;

function cleanFocus(value, max) {
    return String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

function touchPresence(userId, displayName, calendarId, calendarName, focus, focusLabel) {
    const db = getDb();
    const label = displayName || userId;
    db.prepare(
        `INSERT INTO user_presence (user_id, display_name, calendar_id, calendar_name, last_seen_at, focus, focus_label)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           display_name = excluded.display_name,
           calendar_id = excluded.calendar_id,
           calendar_name = excluded.calendar_name,
           last_seen_at = excluded.last_seen_at,
           focus = excluded.focus,
           focus_label = excluded.focus_label
         WHERE user_presence.last_seen_at < ?
            OR user_presence.calendar_id IS NOT excluded.calendar_id
            OR user_presence.calendar_name IS NOT excluded.calendar_name
            OR user_presence.display_name IS NOT excluded.display_name
            OR user_presence.focus IS NOT excluded.focus`
    ).run(
        userId,
        label,
        calendarId || null,
        calendarName || '',
        nowIso(),
        focus || null,
        focusLabel || null,
        new Date(Date.now() - PRESENCE_WRITE_THROTTLE_MS).toISOString()
    );
}

function upsertPresence(user, payload) {
    if (!user || !user.id) {
        return;
    }
    const calendarId = payload && payload.calendarId ? String(payload.calendarId) : null;
    const calendarName = payload && payload.calendarName ? String(payload.calendarName) : null;
    touchPresence(
        user.id,
        user.displayName || user.email || user.id,
        calendarId,
        calendarName,
        cleanFocus(payload && payload.focus, 120),
        cleanFocus(payload && payload.focusLabel, 80)
    );
}

function removePresence(userId) {
    if (!userId) {
        return;
    }
    getDb().prepare('DELETE FROM user_presence WHERE user_id = ?').run(userId);
}

function listViewersForCalendar(calendarId, excludeUserId) {
    if (!calendarId) {
        return [];
    }
    const db = getDb();
    const cutoff = new Date(Date.now() - STALE_MS).toISOString();
    const rows = db
        .prepare(
            `SELECT user_id AS userId, display_name AS displayName, focus, focus_label AS focusLabel
             FROM user_presence
             WHERE calendar_id = ? AND last_seen_at >= ?
             ORDER BY display_name COLLATE NOCASE`
        )
        .all(calendarId, cutoff);
    if (!excludeUserId) {
        return rows;
    }
    return rows.filter((r) => r.userId !== excludeUserId);
}

function listOnlinePresence() {
    const db = getDb();
    const cutoff = new Date(Date.now() - STALE_MS).toISOString();
    const rows = db
        .prepare(
            `SELECT user_id AS userId, display_name AS displayName, calendar_id AS calendarId,
                    calendar_name AS calendarName, last_seen_at AS lastSeenAt
             FROM user_presence WHERE last_seen_at >= ?
             ORDER BY display_name COLLATE NOCASE`
        )
        .all(cutoff);
    return rows.map((row) => Object.assign({}, row, { online: true }));
}

function listAllPresenceForAdmin() {
    return listOnlinePresence();
}

module.exports = {
    PRESENCE_STALE_SEC,
    STALE_MS,
    touchPresence,
    upsertPresence,
    removePresence,
    listViewersForCalendar,
    listOnlinePresence,
    listAllPresenceForAdmin
};
