/**
 * The one place the Worker writes a calendar document.
 *
 * Every save is compare-and-set on the revision it read: if someone else saved in
 * between, nothing is written and the caller gets { ok: false } to retry or report.
 */
import { dbOne, dbRun, rowsChanged, nowIso } from './db.js';
import { serializeCalendarData, parseDataObjectFromRow, CALENDAR_DOC_SELECT } from './calendar-storage.js';

/** D1 refuses any single value or row over 2,000,000 bytes. */
export const CALENDAR_MAX_STORED_BYTES = 2000000;
/** Start warning well before the hard limit so there is time to act. */
export const CALENDAR_WARN_STORED_BYTES = 1500000;

const textEncoder = new TextEncoder();

/** Bytes this calendar takes as one D1 value (what counts against the 2 MB limit). */
export function storedByteLength(storedData) {
    return textEncoder.encode(String(storedData == null ? '' : storedData)).length;
}

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
    const bytes = storedByteLength(stored.data);
    if (bytes > CALENDAR_MAX_STORED_BYTES) {
        // D1 would reject this write with an opaque error; say what happened instead.
        console.error(`Calendar ${calId} is ${bytes} bytes, over the ${CALENDAR_MAX_STORED_BYTES} byte D1 limit; save refused`);
        const err = new Error(
            'This calendar has reached the storage limit, so the change could not be saved. Ask an admin to archive old data.'
        );
        err.status = 507;
        err.code = 'CALENDAR_TOO_LARGE';
        throw err;
    }
    if (bytes > CALENDAR_WARN_STORED_BYTES) {
        console.warn(`Calendar ${calId} is ${bytes} bytes (${Math.round((bytes / CALENDAR_MAX_STORED_BYTES) * 100)}% of the D1 limit)`);
    }
    const updatedAt = nowIso();
    const updatedBy = label || 'Teacher';
    const sets = ['data=?', 'data_enc_version=?', 'data_key_wrapped=?', 'revision=?', 'updated_at=?', 'updated_by=?'];
    const params = [stored.data, stored.dataEncVersion, stored.dataKeyWrapped, nextRevision, updatedAt, updatedBy];
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
    return { ok: rowsChanged(result) === 1, revision: nextRevision, bytes, updatedAt, updatedBy };
}

/**
 * Read, build, write; retry when another save lands in between.
 * `build({ row, data, revision })` returns { data, name? } to write, or { stop: response }
 * to return early (a conflict, an access error). Returns { ok, revision, stop?, attempts, saved }.
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
        let written;
        try {
            written = await writeCalendar(env, calId, {
                expectedRevision: current.revision,
                data: plan.data,
                label,
                name: plan.name
            });
        } catch (err) {
            if (err && err.code === 'CALENDAR_TOO_LARGE') {
                // Retrying cannot help; callers answer with tooLargeResponse().
                return { ok: false, tooLarge: true, error: err.message, current };
            }
            throw err;
        }
        if (written.ok) {
            return {
                ok: true,
                revision: written.revision,
                attempts: attempt,
                current,
                bytes: written.bytes,
                // Exactly what is now stored, so callers need not read the row back.
                saved: {
                    data: plan.data,
                    name: plan.name != null ? plan.name : current.row.name,
                    updatedAt: written.updatedAt,
                    updatedBy: written.updatedBy
                }
            };
        }
    }
    return { ok: false, busy: true };
}
