export const ACCESS_LEVELS = new Set(['editor', 'viewer', 'suggester']);

export async function recordActivity(env, entry) {
    const id = crypto.randomUUID();
    const at = new Date().toISOString();
    let detailJson = null;
    if (entry.detail != null) {
        detailJson =
            typeof entry.detail === 'string' ? entry.detail : JSON.stringify(entry.detail);
    }
    await env.DB.prepare(
        `INSERT INTO activity_log (id, action, actor_user_id, actor_name, calendar_id, calendar_name, summary, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
        .bind(
            id,
            String(entry.action || 'unknown'),
            entry.actorUserId || null,
            String(entry.actorName || 'System'),
            entry.calendarId || null,
            entry.calendarName || null,
            String(entry.summary || ''),
            detailJson,
            at
        )
        .run();
    return id;
}

export async function recordActivityForUser(env, user, entry) {
    return recordActivity(
        env,
        Object.assign({}, entry, {
            actorUserId: user && user.id,
            actorName: (user && (user.displayName || user.email)) || 'Unknown'
        })
    );
}

export async function listActivity(env, options) {
    const limit = Math.min(Math.max(Number(options && options.limit) || 100, 1), 500);
    const calendarId = options && options.calendarId ? String(options.calendarId) : null;
    let rows;
    if (calendarId) {
        const r = await env.DB.prepare(
            `SELECT id, action, actor_user_id AS actorUserId, actor_name AS actorName,
                    calendar_id AS calendarId, calendar_name AS calendarName,
                    summary, detail_json AS detailJson, created_at AS createdAt
             FROM activity_log WHERE calendar_id = ?
             ORDER BY created_at DESC LIMIT ?`
        )
            .bind(calendarId, limit)
            .all();
        rows = r.results || [];
    } else {
        const r = await env.DB.prepare(
            `SELECT id, action, actor_user_id AS actorUserId, actor_name AS actorName,
                    calendar_id AS calendarId, calendar_name AS calendarName,
                    summary, detail_json AS detailJson, created_at AS createdAt
             FROM activity_log ORDER BY created_at DESC LIMIT ?`
        )
            .bind(limit)
            .all();
        rows = r.results || [];
    }
    return rows.map((row) => {
        let revision = null;
        if (row.detailJson) {
            try {
                const d = JSON.parse(row.detailJson);
                if (d && d.revision != null) {
                    revision = d.revision;
                }
            } catch (_) {
                /* ignore */
            }
        }
        return {
            id: row.id,
            action: row.action,
            actorUserId: row.actorUserId,
            actorName: row.actorName,
            calendarId: row.calendarId,
            calendarName: row.calendarName,
            summary: row.summary,
            createdAt: row.createdAt,
            revision
        };
    });
}
