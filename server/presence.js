const { getDb, nowIso } = require('./schema');

const PRESENCE_STALE_SEC = 90;
const STALE_MS = PRESENCE_STALE_SEC * 1000;

function touchPresence(userId, displayName, calendarId, calendarName) {
    const db = getDb();
    const label = displayName || userId;
    db.prepare(
        `INSERT INTO user_presence (user_id, display_name, calendar_id, calendar_name, last_seen_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           display_name = excluded.display_name,
           calendar_id = excluded.calendar_id,
           calendar_name = excluded.calendar_name,
           last_seen_at = excluded.last_seen_at`
    ).run(userId, label, calendarId || null, calendarName || '', nowIso());
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
        calendarName
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
            `SELECT user_id AS userId, display_name AS displayName
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
