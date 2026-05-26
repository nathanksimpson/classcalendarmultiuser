const { getDb, nowIso } = require('./schema');

const STALE_MS = 90 * 1000;

function upsertPresence(user, payload) {
    if (!user || !user.id) {
        return;
    }
    const db = getDb();
    const at = nowIso();
    const calendarId = payload && payload.calendarId ? String(payload.calendarId) : null;
    const calendarName = payload && payload.calendarName ? String(payload.calendarName) : null;
    db.prepare(
        `INSERT INTO user_presence (user_id, display_name, calendar_id, calendar_name, last_seen_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           display_name = excluded.display_name,
           calendar_id = excluded.calendar_id,
           calendar_name = excluded.calendar_name,
           last_seen_at = excluded.last_seen_at`
    ).run(
        user.id,
        user.displayName || user.email || user.id,
        calendarId,
        calendarName,
        at
    );
}

function removePresence(userId) {
    if (!userId) {
        return;
    }
    getDb().prepare('DELETE FROM user_presence WHERE user_id = ?').run(userId);
}

function listOnlinePresence() {
    const cutoff = new Date(Date.now() - STALE_MS).toISOString();
    const db = getDb();
    const rows = db
        .prepare(
            `SELECT user_id AS userId, display_name AS displayName, calendar_id AS calendarId,
                    calendar_name AS calendarName, last_seen_at AS lastSeenAt
             FROM user_presence WHERE last_seen_at >= ?
             ORDER BY display_name COLLATE NOCASE`
        )
        .all(cutoff);
    return rows.map((row) =>
        Object.assign({}, row, {
            online: true
        })
    );
}

module.exports = {
    STALE_MS,
    upsertPresence,
    removePresence,
    listOnlinePresence
};
