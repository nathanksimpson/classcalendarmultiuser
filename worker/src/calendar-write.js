/**
 * The one place the Worker writes a calendar document.
 *
 * Every save is compare-and-set on the revision it read: if someone else saved in
 * between, nothing is written and the caller gets { ok: false } to retry or report.
 */
import { dbOne, dbRun, rowsChanged, nowIso } from './db.js';
import { serializeCalendarData, parseDataObjectFromRow, CALENDAR_DOC_SELECT } from './calendar-storage.js';

/** Read the stored row and its decrypted data. Returns null when the calendar is gone. */
export async function readCalendar(env, calId) {
    const row = await dbOne(env, `SELECT ${CALENDAR_DOC_SELECT} FROM calendars WHERE id = ?`, calId);
    if (!row) {
        return null;
    }
    return { row, data: parseDataObjectFromRow(row, calId, env), revision: Number(row.revision) };
}

/**
 * Write `data` as revision expectedRevision + 1, only if the stored revision is still
 * expectedRevision. `name` is optional (kept when omitted).
 */
export async function writeCalendar(env, calId, { expectedRevision, data, label, name }) {
    const nextRevision = Number(expectedRevision) + 1;
    const stored = serializeCalendarData(calId, data, env);
    const sets = ['data=?', 'data_enc_version=?', 'data_key_wrapped=?', 'revision=?', 'updated_at=?', 'updated_by=?'];
    const params = [stored.data, stored.dataEncVersion, stored.dataKeyWrapped, nextRevision, nowIso(), label || 'Teacher'];
    if (name != null) {
        sets.unshift('name=?');
        params.unshift(name);
    }
    const result = await dbRun(
        env,
        `UPDATE calendars SET ${sets.join(', ')} WHERE id=? AND revision=?`,
        ...params,
        calId,
        Number(expectedRevision)
    );
    return { ok: rowsChanged(result) === 1, revision: nextRevision };
}

/**
 * Read, build, write; retry when another save lands in between.
 * `build({ row, data, revision })` returns { data, name? } to write, or { stop: response }
 * to return early (a conflict, an access error). Returns { ok, revision, stop?, attempts }.
 */
export async function saveWithRetry(env, calId, label, build, maxAttempts = 5) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const current = await readCalendar(env, calId);
        if (!current) {
            return { ok: false, missing: true };
        }
        const plan = await build(current);
        if (plan && plan.stop) {
            return { ok: false, stop: plan.stop, current };
        }
        const written = await writeCalendar(env, calId, {
            expectedRevision: current.revision,
            data: plan.data,
            label,
            name: plan.name
        });
        if (written.ok) {
            return { ok: true, revision: written.revision, attempts: attempt, current };
        }
    }
    return { ok: false, busy: true };
}
