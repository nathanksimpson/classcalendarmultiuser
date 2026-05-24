const SETTING_LOCK_STALE_MINUTES = 'lock_stale_minutes';
const DEFAULT_LOCK_STALE_MINUTES = 20;
const MIN_LOCK_STALE_MINUTES = 5;
const MAX_LOCK_STALE_MINUTES = 120;

let cachedStaleMinutes = null;
let cachedAt = 0;
const CACHE_MS = 60 * 1000;

export function clampLockStaleMinutes(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) {
        return DEFAULT_LOCK_STALE_MINUTES;
    }
    return Math.min(MAX_LOCK_STALE_MINUTES, Math.max(MIN_LOCK_STALE_MINUTES, v));
}

async function readLockStaleMinutes(env) {
    const now = Date.now();
    if (cachedStaleMinutes != null && now - cachedAt < CACHE_MS) {
        return cachedStaleMinutes;
    }
    const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?')
        .bind(SETTING_LOCK_STALE_MINUTES)
        .first();
    const minutes = clampLockStaleMinutes(row?.value || DEFAULT_LOCK_STALE_MINUTES);
    cachedStaleMinutes = minutes;
    cachedAt = now;
    return minutes;
}

export async function getLockStaleMs(env) {
    const minutes = await readLockStaleMinutes(env);
    return minutes * 60 * 1000;
}

export async function getLockStaleMinutes(env) {
    return readLockStaleMinutes(env);
}

export async function getAdminSettings(env) {
    return { lockStaleMinutes: await readLockStaleMinutes(env) };
}

export async function setLockStaleMinutes(env, minutes) {
    const clamped = clampLockStaleMinutes(minutes);
    await env.DB.prepare(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
        .bind(SETTING_LOCK_STALE_MINUTES, String(clamped))
        .run();
    cachedStaleMinutes = clamped;
    cachedAt = Date.now();
    return { lockStaleMinutes: clamped };
}

export { MIN_LOCK_STALE_MINUTES, MAX_LOCK_STALE_MINUTES, DEFAULT_LOCK_STALE_MINUTES };
