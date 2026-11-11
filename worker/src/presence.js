const PRESENCE_STALE_SEC = 90;
const STALE_MS = PRESENCE_STALE_SEC * 1000;
/** Skip rewriting an unchanged row more often than this (must stay well under PRESENCE_STALE_SEC). */
const PRESENCE_WRITE_THROTTLE_MS = 30 * 1000;

function nowIso() {
    return new Date().toISOString();
}

function missingFocusColumn(err) {
    return /no such column|has no column named/i.test(String((err && err.message) || err || ''));
}

/** Clean a focus key / label from the client (short, plain text). */
export function cleanFocus(value, max) {
    return String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

export async function touchPresence(env, userId, displayName, calendarId, calendarName, focus, focusLabel) {
    const label = displayName || userId;
    const throttle = new Date(Date.now() - PRESENCE_WRITE_THROTTLE_MS).toISOString();
    try {
        await env.DB.prepare(
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
        )
            .bind(userId, label, calendarId || null, calendarName || '', nowIso(), focus || null, focusLabel || null, throttle)
            .run();
        return;
    } catch (err) {
        if (!missingFocusColumn(err)) {
            throw err;
        }
    }
    // Before migration 0021: presence without focus.
    await env.DB.prepare(
        `INSERT INTO user_presence (user_id, display_name, calendar_id, calendar_name, last_seen_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           display_name = excluded.display_name,
           calendar_id = excluded.calendar_id,
           calendar_name = excluded.calendar_name,
           last_seen_at = excluded.last_seen_at
         WHERE user_presence.last_seen_at < ?
            OR user_presence.calendar_id IS NOT excluded.calendar_id
            OR user_presence.calendar_name IS NOT excluded.calendar_name
            OR user_presence.display_name IS NOT excluded.display_name`
    )
        .bind(userId, label, calendarId || null, calendarName || '', nowIso(), throttle)
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
        calendarName,
        cleanFocus(payload && payload.focus, 120),
        cleanFocus(payload && payload.focusLabel, 80)
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
    let r;
    try {
        r = await env.DB.prepare(
            `SELECT user_id AS userId, display_name AS displayName, focus, focus_label AS focusLabel
             FROM user_presence
             WHERE calendar_id = ? AND last_seen_at >= ?
             ORDER BY display_name COLLATE NOCASE`
        )
            .bind(calendarId, cutoff)
            .all();
    } catch (err) {
        if (!missingFocusColumn(err)) {
            throw err;
        }
        r = await env.DB.prepare(
            `SELECT user_id AS userId, display_name AS displayName
             FROM user_presence
             WHERE calendar_id = ? AND last_seen_at >= ?
             ORDER BY display_name COLLATE NOCASE`
        )
            .bind(calendarId, cutoff)
            .all();
    }
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
