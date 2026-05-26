const PRESENCE_STALE_SEC = 90;

function nowIso() {
    return new Date().toISOString();
}

export async function touchPresence(env, userId, displayName, calendarId, calendarName) {
    const label = displayName || userId;
    await env.DB.prepare(
        `INSERT INTO user_presence (user_id, display_name, calendar_id, calendar_name, last_seen_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           display_name = excluded.display_name,
           calendar_id = excluded.calendar_id,
           calendar_name = excluded.calendar_name,
           last_seen_at = excluded.last_seen_at`
    )
        .bind(userId, label, calendarId || null, calendarName || '', nowIso())
        .run();
}

export async function listViewersForCalendar(env, calendarId, excludeUserId) {
    if (!calendarId) {
        return [];
    }
    const cutoff = new Date(Date.now() - PRESENCE_STALE_SEC * 1000).toISOString();
    const r = await env.DB.prepare(
        `SELECT user_id AS userId, display_name AS displayName
         FROM user_presence
         WHERE calendar_id = ? AND last_seen_at >= ?
         ORDER BY display_name COLLATE NOCASE`
    )
        .bind(calendarId, cutoff)
        .all();
    const rows = r.results || [];
    if (!excludeUserId) {
        return rows;
    }
    return rows.filter((row) => row.userId !== excludeUserId);
}

export { PRESENCE_STALE_SEC };
