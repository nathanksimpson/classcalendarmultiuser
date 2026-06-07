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

export function nowIso() {
    return new Date().toISOString();
}
