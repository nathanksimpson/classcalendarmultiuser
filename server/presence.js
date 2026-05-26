const { getDb, nowIso } = require('./schema');

const PRESENCE_STALE_SEC = 90;

function touchPresence(userId, calendarId, calendarName) {
    const db = getDb();
    db.prepare(
        `INSERT INTO user_presence (user_id, calendar_id, calendar_name, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           calendar_id = excluded.calendar_id,
           calendar_name = excluded.calendar_name,
           updated_at = excluded.updated_at`
    ).run(userId, calendarId || null, calendarName || '', nowIso());
}

function listViewersForCalendar(calendarId, excludeUserId) {
    if (!calendarId) {
        return [];
    }
    const db = getDb();
    const cutoff = new Date(Date.now() - PRESENCE_STALE_SEC * 1000).toISOString();
    const rows = db
        .prepare(
            `SELECT p.user_id AS userId,
                    COALESCE(u.display_name, u.email, p.user_id) AS displayName
             FROM user_presence p
             INNER JOIN users u ON u.id = p.user_id AND u.active = 1
             WHERE p.calendar_id = ? AND p.updated_at >= ?
             ORDER BY u.display_name COLLATE NOCASE`
        )
        .all(calendarId, cutoff);
    if (!excludeUserId) {
        return rows;
    }
    return rows.filter((r) => r.userId !== excludeUserId);
}

module.exports = {
    touchPresence,
    listViewersForCalendar,
    PRESENCE_STALE_SEC
};
