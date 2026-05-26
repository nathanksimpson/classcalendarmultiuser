const PRESENCE_STALE_SEC = 90;
const STALE_MS = PRESENCE_STALE_SEC * 1000;

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

export async function upsertPresence(env, user, payload) {
    if (!user || !user.id) {
        return;
    }
    const calendarId = payload && payload.calendarId ? String(payload.calendarId) : null;
    const calendarName = payload && payload.calendarName ? String(payload.calendarName) : null;
    await touchPresence(
        env,
        user.id,
        user.displayName || user.email || user.id,
        calendarId,
        calendarName
    );
}

export async function removePresence(env, userId) {
    if (!userId) {
        return;
    }
    await env.DB.prepare('DELETE FROM user_presence WHERE user_id = ?').bind(userId).run();
}

export async function listViewersForCalendar(env, calendarId, excludeUserId) {
    if (!calendarId) {
        return [];
    }
    const cutoff = new Date(Date.now() - STALE_MS).toISOString();
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

export async function listAllPresenceForAdmin(env) {
    return listOnlinePresence(env);
}

export { PRESENCE_STALE_SEC };
