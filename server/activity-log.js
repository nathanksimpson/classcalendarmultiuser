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
    // Client errors have their own Monitor section: ?action=client_error lists only them,
    // the normal activity list leaves them out.
    const action = options && options.action ? String(options.action) : null;
    const where = [];
    const binds = [];
    if (calendarId) {
        where.push('calendar_id = ?');
        binds.push(calendarId);
    }
    if (action) {
        where.push('action = ?');
        binds.push(action);
    } else {
        where.push("action != 'client_error'");
    }
    const sql = `SELECT id, action, actor_user_id AS actorUserId, actor_name AS actorName,
                    calendar_id AS calendarId, calendar_name AS calendarName,
                    summary, detail_json AS detailJson, created_at AS createdAt
             FROM activity_log WHERE ${where.join(' AND ')}
             ORDER BY created_at DESC LIMIT ?`;
    const rows = db.prepare(sql).all(...binds, limit);
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
        let detail = null;
        if (row.action === 'client_error' && row.detailJson) {
            try {
                detail = JSON.parse(row.detailJson);
            } catch (_) {
                detail = null;
            }
        }
        return {
            id: row.id,
            action: row.action,
            detail,
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

const CLIENT_ERROR_KEEP = 500;
const CLIENT_ERROR_MAX_TEXT = 4000;

function clip(value, max) {
    const s = String(value == null ? '' : value);
    return s.length > max ? s.slice(0, max) + '…' : s;
}

/** One browser-side error (notice, uncaught error, rejected promise) for Admin › Monitor › Error log. */
function sanitizeClientError(raw) {
    const e = raw && typeof raw === 'object' ? raw : {};
    const message = clip(e.message, 500).trim();
    if (!message) {
        return null;
    }
    return {
        message,
        kind: clip(e.kind || 'error', 40),
        context: clip(e.context, 200),
        stack: clip(e.stack, CLIENT_ERROR_MAX_TEXT),
        page: clip(e.page, 300),
        build: clip(e.build, 80),
        userAgent: clip(e.userAgent, 300),
        at: clip(e.at, 40),
        count: Math.max(1, Math.min(Number(e.count) || 1, 999))
    };
}

function recordClientErrors(user, list, calendar) {
    const items = (Array.isArray(list) ? list : []).map(sanitizeClientError).filter(Boolean).slice(0, 10);
    for (const item of items) {
        recordActivityForUser(user, {
            action: 'client_error',
            calendarId: (calendar && calendar.id) || null,
            calendarName: (calendar && calendar.name) || null,
            summary: item.message,
            detail: item
        });
    }
    if (items.length) {
        getDb().prepare(
            `DELETE FROM activity_log WHERE action = 'client_error' AND id NOT IN (
                SELECT id FROM activity_log WHERE action = 'client_error' ORDER BY created_at DESC LIMIT ?
            )`
        ).run(CLIENT_ERROR_KEEP);
    }
    return items.length;
}

function clearClientErrors() {
    getDb().prepare(`DELETE FROM activity_log WHERE action = 'client_error'`).run();
}

module.exports = {
    sanitizeClientError,
    recordClientErrors,
    clearClientErrors,
    ACCESS_LEVELS,
    recordActivity,
    recordActivityForUser,
    listActivity
};
