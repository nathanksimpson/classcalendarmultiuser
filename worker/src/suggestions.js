import {
    SUGGESTION_DOC_SELECT,
    serializeSuggestionData,
    suggestionDocForClient
} from './calendar-storage.js';

export async function createSuggestion(env, calendarId, user, baseRevision, data, summary) {
    const id = crypto.randomUUID();
    const at = new Date().toISOString();
    const name = user.displayName || user.email || 'Teacher';
    const stored = serializeSuggestionData(id, data, env);
    await env.DB.prepare(
        `INSERT INTO calendar_suggestions (id, calendar_id, base_revision, data, data_enc_version, data_key_wrapped, summary, created_by_user_id, created_by_name, created_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    )
        .bind(
            id,
            calendarId,
            Number(baseRevision),
            stored.data,
            stored.dataEncVersion,
            stored.dataKeyWrapped,
            summary ? String(summary).trim() : null,
            user.id,
            name,
            at
        )
        .run();
    return getSuggestion(env, id);
}

export async function getSuggestion(env, id) {
    const row = await env.DB.prepare(`SELECT ${SUGGESTION_DOC_SELECT} FROM calendar_suggestions WHERE id = ?`)
        .bind(id)
        .first();
    return suggestionDocForClient(row, env);
}

export async function listPendingSuggestions(env, calendarId) {
    const r = await env.DB.prepare(
        `SELECT id, calendar_id AS calendarId, base_revision AS baseRevision, summary,
                created_by_user_id AS createdByUserId, created_by_name AS createdByName,
                created_at AS createdAt, status
         FROM calendar_suggestions WHERE calendar_id = ? AND status = 'pending'
         ORDER BY created_at ASC`
    )
        .bind(calendarId)
        .all();
    return r.results || [];
}

export async function countPendingSuggestions(env, calendarId) {
    const row = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM calendar_suggestions WHERE calendar_id = ? AND status = 'pending'`
    )
        .bind(calendarId)
        .first();
    return row ? row.c : 0;
}

export async function setSuggestionStatus(env, id, status) {
    await env.DB.prepare('UPDATE calendar_suggestions SET status = ? WHERE id = ?').bind(status, id).run();
}
