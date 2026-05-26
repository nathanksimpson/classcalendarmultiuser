const { getDb, newId, nowIso } = require('./schema');

const ACCESS_LEVELS = new Set(['editor', 'viewer', 'suggester']);

function recordActivity(entry) {
    const db = getDb();
    const id = newId();
    const at = nowIso();
    let detailJson = null;
    if (entry.detail != null) {
        detailJson =
            typeof entry.detail === 'string' ? entry.detail : JSON.stringify(entry.detail);
    }
    db.prepare(
        `INSERT INTO activity_log (id, action, actor_user_id, actor_name, calendar_id, calendar_name, summary, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        String(entry.action || 'unknown'),
        entry.actorUserId || null,
        String(entry.actorName || 'System'),
        entry.calendarId || null,
        entry.calendarName || null,
        String(entry.summary || ''),
        detailJson,
        at
    );
    return id;
}

function recordActivityForUser(user, entry) {
    return recordActivity(
        Object.assign({}, entry, {
            actorUserId: user && user.id,
            actorName: (user && (user.displayName || user.email)) || 'Unknown'
        })
    );
}

function listActivity(options) {
    const limit = Math.min(Math.max(Number(options && options.limit) || 100, 1), 500);
    const calendarId = options && options.calendarId ? String(options.calendarId) : null;
    const db = getDb();
    let rows;
    if (calendarId) {
        rows = db
            .prepare(
                `SELECT id, action, actor_user_id AS actorUserId, actor_name AS actorName,
                        calendar_id AS calendarId, calendar_name AS calendarName,
                        summary, detail_json AS detailJson, created_at AS createdAt
                 FROM activity_log WHERE calendar_id = ?
                 ORDER BY created_at DESC LIMIT ?`
            )
            .all(calendarId, limit);
    } else {
        rows = db
            .prepare(
                `SELECT id, action, actor_user_id AS actorUserId, actor_name AS actorName,
                        calendar_id AS calendarId, calendar_name AS calendarName,
                        summary, detail_json AS detailJson, created_at AS createdAt
                 FROM activity_log ORDER BY created_at DESC LIMIT ?`
            )
            .all(limit);
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

module.exports = {
    ACCESS_LEVELS,
    recordActivity,
    recordActivityForUser,
    listActivity
};
