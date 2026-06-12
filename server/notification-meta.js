const { getDb, nowIso } = require('./schema');

function normalizeEntry(entry, nowMs) {
    const now = nowMs != null ? nowMs : Date.now();
    if (!entry || typeof entry !== 'object') {
        return { firstSeenAt: now, dismissedAt: null };
    }
    const firstSeenAt = Number(entry.firstSeenAt);
    const dismissedAt = entry.dismissedAt == null ? null : Number(entry.dismissedAt);
    return {
        firstSeenAt: Number.isFinite(firstSeenAt) && firstSeenAt > 0 ? firstSeenAt : now,
        dismissedAt: Number.isFinite(dismissedAt) && dismissedAt > 0 ? dismissedAt : null
    };
}

function rowToEntry(row) {
    return {
        firstSeenAt: row.first_seen_at,
        dismissedAt: row.dismissed_at != null ? row.dismissed_at : null
    };
}

function listMeta(userId, calendarId) {
    if (!userId || !calendarId) {
        return { meta: {} };
    }
    const rows = getDb()
        .prepare(
            `SELECT notification_id, first_seen_at, dismissed_at
             FROM user_notification_meta
             WHERE user_id = ? AND calendar_id = ?`
        )
        .all(userId, calendarId);
    const meta = {};
    rows.forEach((row) => {
        meta[row.notification_id] = rowToEntry(row);
    });
    return { meta };
}

function mergeEntryValues(existing, incoming, nowMs) {
    const now = nowMs != null ? nowMs : Date.now();
    const a = normalizeEntry(existing, now);
    const b = normalizeEntry(incoming, now);
    return {
        firstSeenAt: Math.min(a.firstSeenAt, b.firstSeenAt),
        dismissedAt:
            a.dismissedAt != null && b.dismissedAt != null
                ? Math.max(a.dismissedAt, b.dismissedAt)
                : a.dismissedAt != null
                  ? a.dismissedAt
                  : b.dismissedAt
    };
}

function upsertEntries(userId, calendarId, entries) {
    if (!userId || !calendarId || !entries || typeof entries !== 'object') {
        return listMeta(userId, calendarId);
    }
    const db = getDb();
    const select = db.prepare(
        `SELECT notification_id, first_seen_at, dismissed_at
         FROM user_notification_meta
         WHERE user_id = ? AND calendar_id = ? AND notification_id = ?`
    );
    const upsert = db.prepare(
        `INSERT INTO user_notification_meta
            (user_id, calendar_id, notification_id, first_seen_at, dismissed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, calendar_id, notification_id) DO UPDATE SET
            first_seen_at = excluded.first_seen_at,
            dismissed_at = excluded.dismissed_at,
            updated_at = excluded.updated_at`
    );
    const nowMs = Date.now();
    const updatedAt = nowIso();
    Object.keys(entries).forEach((notificationId) => {
        const id = String(notificationId || '').trim();
        if (!id) {
            return;
        }
        const existingRow = select.get(userId, calendarId, id);
        const merged = mergeEntryValues(
            existingRow ? rowToEntry(existingRow) : null,
            entries[notificationId],
            nowMs
        );
        upsert.run(
            userId,
            calendarId,
            id,
            merged.firstSeenAt,
            merged.dismissedAt,
            updatedAt
        );
    });
    return listMeta(userId, calendarId);
}

function dismissOne(userId, calendarId, notificationId, dismissedAt) {
    if (!userId || !calendarId) {
        return { meta: {} };
    }
    const id = String(notificationId || '').trim();
    if (!id) {
        return listMeta(userId, calendarId);
    }
    const nowMs = Date.now();
    const atRaw = dismissedAt != null ? Number(dismissedAt) : nowMs;
    const dismissed = Number.isFinite(atRaw) && atRaw > 0 ? atRaw : nowMs;
    const existing = listMeta(userId, calendarId).meta[id];
    const merged = mergeEntryValues(existing || null, { firstSeenAt: dismissed, dismissedAt: dismissed }, nowMs);
    return upsertEntries(userId, calendarId, { [id]: merged });
}

module.exports = {
    listMeta,
    upsertEntries,
    dismissOne
};
