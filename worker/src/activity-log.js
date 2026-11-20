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
    const r = await env.DB.prepare(sql).bind(...binds, limit).all();
    const rows = r.results || [];
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
export function sanitizeClientError(raw) {
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

export async function recordClientErrors(env, user, list, calendar) {
    const items = (Array.isArray(list) ? list : []).map(sanitizeClientError).filter(Boolean).slice(0, 10);
    for (const item of items) {
        await recordActivityForUser(env, user, {
            action: 'client_error',
            calendarId: (calendar && calendar.id) || null,
            calendarName: (calendar && calendar.name) || null,
            summary: item.message,
            detail: item
        });
    }
    if (items.length) {
        await env.DB.prepare(
            `DELETE FROM activity_log WHERE action = 'client_error' AND id NOT IN (
                SELECT id FROM activity_log WHERE action = 'client_error' ORDER BY created_at DESC LIMIT ?
            )`
        )
            .bind(CLIENT_ERROR_KEEP)
            .run();
    }
    return items.length;
}

export async function clearClientErrors(env) {
    await env.DB.prepare(`DELETE FROM activity_log WHERE action = 'client_error'`).run();
}
