/**
 * Calendar name helpers (worker) — partial extract from index.js.
 */
import { dbOne } from './db.js';

export async function findCalendarByName(env, name, excludeId) {
    const normalized = String(name || '').trim();
    if (!normalized) {
        return null;
    }
    return dbOne(
        env,
        `SELECT id, name FROM calendars
         WHERE LOWER(TRIM(name)) = LOWER(?) AND id != ? LIMIT 1`,
        normalized,
        excludeId ? String(excludeId) : ''
    );
}

export async function assertCalendarNameAvailable(env, name, excludeId) {
    const existing = await findCalendarByName(env, name, excludeId);
    if (existing) {
        return {
            error: 'A calendar named "' + String(name || '').trim() + '" already exists',
            status: 409,
            code: 'DUPLICATE_NAME'
        };
    }
    return null;
}
