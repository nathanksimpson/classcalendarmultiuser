/**
 * Per-user notification dismissal meta (worker / D1).
 */
import { dbAll, dbOne, dbRun, nowIso } from './db.js';

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

export async function listMeta(env, userId, calendarId) {
    if (!userId || !calendarId) {
        return { meta: {} };
    }
    const rows = await dbAll(
        env,
        `SELECT notification_id, first_seen_at, dismissed_at
         FROM user_notification_meta
         WHERE user_id = ? AND calendar_id = ?`,
        userId,
        calendarId
    );
    const meta = {};
    (rows || []).forEach((row) => {
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

export async function upsertEntries(env, userId, calendarId, entries) {
    if (!userId || !calendarId || !entries || typeof entries !== 'object') {
        return listMeta(env, userId, calendarId);
    }
    const nowMs = Date.now();
    const updatedAt = nowIso();
    for (const notificationId of Object.keys(entries)) {
        const id = String(notificationId || '').trim();
        if (!id) {
            continue;
        }
        const existingRow = await dbOne(
            env,
            `SELECT notification_id, first_seen_at, dismissed_at
             FROM user_notification_meta
             WHERE user_id = ? AND calendar_id = ? AND notification_id = ?`,
            userId,
            calendarId,
            id
        );
        const merged = mergeEntryValues(
            existingRow ? rowToEntry(existingRow) : null,
            entries[notificationId],
            nowMs
        );
        await dbRun(
            env,
            `INSERT INTO user_notification_meta
                (user_id, calendar_id, notification_id, first_seen_at, dismissed_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, calendar_id, notification_id) DO UPDATE SET
                first_seen_at = excluded.first_seen_at,
                dismissed_at = excluded.dismissed_at,
                updated_at = excluded.updated_at`,
            userId,
            calendarId,
            id,
            merged.firstSeenAt,
            merged.dismissedAt,
            updatedAt
        );
    }
    return listMeta(env, userId, calendarId);
}

export async function dismissOne(env, userId, calendarId, notificationId, dismissedAt) {
    if (!userId || !calendarId) {
        return { meta: {} };
    }
    const id = String(notificationId || '').trim();
    if (!id) {
        return listMeta(env, userId, calendarId);
    }
    const nowMs = Date.now();
    const atRaw = dismissedAt != null ? Number(dismissedAt) : nowMs;
    const dismissed = Number.isFinite(atRaw) && atRaw > 0 ? atRaw : nowMs;
    const existing = (await listMeta(env, userId, calendarId)).meta[id];
    const merged = mergeEntryValues(
        existing || null,
        { firstSeenAt: dismissed, dismissedAt: dismissed },
        nowMs
    );
    return upsertEntries(env, userId, calendarId, { [id]: merged });
}
