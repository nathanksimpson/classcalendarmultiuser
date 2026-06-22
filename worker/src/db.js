/**
 * Shared D1 query helpers (worker).
 */
export async function dbOne(env, sql, ...params) {
    const stmt = env.DB.prepare(sql);
    return params.length ? stmt.bind(...params).first() : stmt.first();
}

export async function dbAll(env, sql, ...params) {
    const stmt = env.DB.prepare(sql);
    const r = params.length ? await stmt.bind(...params).all() : await stmt.all();
    return r.results || [];
}

export async function dbRun(env, sql, ...params) {
    const stmt = env.DB.prepare(sql);
    return params.length ? stmt.bind(...params).run() : stmt.run();
}

/**
 * Number of rows actually written by a dbRun result. Used for compare-and-set
 * (optimistic concurrency) writes such as `UPDATE ... WHERE id = ? AND revision = ?`:
 * a value of 0 means the guard did not match (someone else wrote first).
 * D1 exposes the count under result.meta.changes; better-sqlite3 uses result.changes.
 */
export function rowsChanged(result) {
    if (!result) {
        return 0;
    }
    if (result.meta && typeof result.meta.changes === 'number') {
        return result.meta.changes;
    }
    if (typeof result.changes === 'number') {
        return result.changes;
    }
    return 0;
}

export function nowIso() {
    return new Date().toISOString();
}
