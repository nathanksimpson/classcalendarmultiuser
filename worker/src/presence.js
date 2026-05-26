const PRESENCE_STALE_SEC = 90;

function nowIso() {
    return new Date().toISOString();
}

export async function touchPresence(env, userId, calendarId, calendarName) {
    await env.DB.prepare(
        `INSERT INTO user_presence (user_id, calendar_id, calendar_name, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           calendar_id = excluded.calendar_id,
           calendar_name = excluded.calendar_name,
           updated_at = excluded.updated_at`
    )
        .bind(userId, calendarId || null, calendarName || '', nowIso())
        .run();
}

export async function listViewersForCalendar(env, calendarId, excludeUserId) {
    if (!calendarId) {
        return [];
    }
    const cutoff = new Date(Date.now() - PRESENCE_STALE_SEC * 1000).toISOString();
    const r = await env.DB.prepare(
        `SELECT p.user_id AS userId,
                COALESCE(u.display_name, u.email, p.user_id) AS displayName
         FROM user_presence p
         INNER JOIN users u ON u.id = p.user_id AND u.active = 1
         WHERE p.calendar_id = ? AND p.updated_at >= ?
         ORDER BY u.display_name COLLATE NOCASE`
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
