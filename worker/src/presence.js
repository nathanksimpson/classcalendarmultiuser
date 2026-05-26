const STALE_MS = 90 * 1000;

export async function upsertPresence(env, user, payload) {
    if (!user || !user.id) {
        return;
    }
    const at = new Date().toISOString();
    const calendarId = payload && payload.calendarId ? String(payload.calendarId) : null;
    const calendarName = payload && payload.calendarName ? String(payload.calendarName) : null;
    await env.DB.prepare(
        `INSERT INTO user_presence (user_id, display_name, calendar_id, calendar_name, last_seen_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           display_name = excluded.display_name,
           calendar_id = excluded.calendar_id,
           calendar_name = excluded.calendar_name,
           last_seen_at = excluded.last_seen_at`
    )
        .bind(
            user.id,
            user.displayName || user.email || user.id,
            calendarId,
            calendarName,
            at
        )
        .run();
}

export async function removePresence(env, userId) {
    if (!userId) {
        return;
    }
    await env.DB.prepare('DELETE FROM user_presence WHERE user_id = ?').bind(userId).run();
}

export async function listOnlinePresence(env) {
    const cutoff = new Date(Date.now() - STALE_MS).toISOString();
    const r = await env.DB.prepare(
        `SELECT user_id AS userId, display_name AS displayName, calendar_id AS calendarId,
                calendar_name AS calendarName, last_seen_at AS lastSeenAt
         FROM user_presence WHERE last_seen_at >= ?
         ORDER BY display_name COLLATE NOCASE`
    )
        .bind(cutoff)
        .all();
    return (r.results || []).map((row) => Object.assign({}, row, { online: true }));
}
