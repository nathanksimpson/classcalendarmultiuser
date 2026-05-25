const SETTING_LOCK_STALE_MINUTES = 'lock_stale_minutes';
const DEFAULT_LOCK_STALE_MINUTES = 20;
const MIN_LOCK_STALE_MINUTES = 5;
const MAX_LOCK_STALE_MINUTES = 120;

const SETTING_IDLE_LOGOUT_MINUTES = 'idle_logout_minutes';
const SETTING_IDLE_WARNING_MINUTES = 'idle_warning_minutes';
const DEFAULT_IDLE_LOGOUT_MINUTES = 30;
const MIN_IDLE_LOGOUT_MINUTES = 5;
const MAX_IDLE_LOGOUT_MINUTES = 240;
const DEFAULT_IDLE_WARNING_MINUTES = 2;
const MIN_IDLE_WARNING_MINUTES = 1;
const MAX_IDLE_WARNING_MINUTES = 60;

const SETTING_SESSION_MAX_DAYS = 'session_max_days';
const DEFAULT_SESSION_MAX_DAYS = 14;
const MIN_SESSION_MAX_DAYS = 1;
const MAX_SESSION_MAX_DAYS = 14;

let cachedStaleMinutes = null;
let cachedIdleLogoutMinutes = null;
let cachedIdleWarningMinutes = null;
let cachedSessionMaxDays = null;
let cachedAt = 0;
const CACHE_MS = 60 * 1000;

export function clampLockStaleMinutes(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) {
        return DEFAULT_LOCK_STALE_MINUTES;
    }
    return Math.min(MAX_LOCK_STALE_MINUTES, Math.max(MIN_LOCK_STALE_MINUTES, v));
}

export function clampIdleLogoutMinutes(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) {
        return DEFAULT_IDLE_LOGOUT_MINUTES;
    }
    return Math.min(MAX_IDLE_LOGOUT_MINUTES, Math.max(MIN_IDLE_LOGOUT_MINUTES, v));
}

export function clampIdleWarningMinutes(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) {
        return DEFAULT_IDLE_WARNING_MINUTES;
    }
    return Math.min(MAX_IDLE_WARNING_MINUTES, Math.max(MIN_IDLE_WARNING_MINUTES, v));
}

export function normalizeIdlePair(logoutMinutes, warningMinutes) {
    const idleLogoutMinutes = clampIdleLogoutMinutes(logoutMinutes);
    let idleWarningMinutes = clampIdleWarningMinutes(warningMinutes);
    if (idleWarningMinutes >= idleLogoutMinutes) {
        idleWarningMinutes = Math.max(MIN_IDLE_WARNING_MINUTES, idleLogoutMinutes - 1);
    }
    return { idleLogoutMinutes, idleWarningMinutes };
}

export function clampSessionMaxDays(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) {
        return DEFAULT_SESSION_MAX_DAYS;
    }
    return Math.min(MAX_SESSION_MAX_DAYS, Math.max(MIN_SESSION_MAX_DAYS, v));
}

function invalidateCache() {
    cachedStaleMinutes = null;
    cachedIdleLogoutMinutes = null;
    cachedIdleWarningMinutes = null;
    cachedSessionMaxDays = null;
    cachedAt = 0;
}

async function readSetting(env, key) {
    const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?').bind(key).first();
    return row?.value ?? null;
}

async function readLockStaleMinutes(env) {
    const now = Date.now();
    if (cachedStaleMinutes != null && now - cachedAt < CACHE_MS) {
        return cachedStaleMinutes;
    }
    const row = await readSetting(env, SETTING_LOCK_STALE_MINUTES);
    const minutes = clampLockStaleMinutes(row || DEFAULT_LOCK_STALE_MINUTES);
    cachedStaleMinutes = minutes;
    cachedAt = now;
    return minutes;
}

async function readIdlePair(env) {
    const now = Date.now();
    if (cachedIdleLogoutMinutes != null && cachedIdleWarningMinutes != null && now - cachedAt < CACHE_MS) {
        return {
            idleLogoutMinutes: cachedIdleLogoutMinutes,
            idleWarningMinutes: cachedIdleWarningMinutes
        };
    }
    const logoutRaw = await readSetting(env, SETTING_IDLE_LOGOUT_MINUTES);
    const warnRaw = await readSetting(env, SETTING_IDLE_WARNING_MINUTES);
    const pair = normalizeIdlePair(logoutRaw || DEFAULT_IDLE_LOGOUT_MINUTES, warnRaw || DEFAULT_IDLE_WARNING_MINUTES);
    cachedIdleLogoutMinutes = pair.idleLogoutMinutes;
    cachedIdleWarningMinutes = pair.idleWarningMinutes;
    cachedAt = now;
    return pair;
}

export async function getLockStaleMs(env) {
    const minutes = await readLockStaleMinutes(env);
    return minutes * 60 * 1000;
}

export async function getLockStaleMinutes(env) {
    return readLockStaleMinutes(env);
}

export async function getIdleLogoutMinutes(env) {
    const pair = await readIdlePair(env);
    return pair.idleLogoutMinutes;
}

export async function getIdleWarningMinutes(env) {
    const pair = await readIdlePair(env);
    return pair.idleWarningMinutes;
}

async function readSessionMaxDays(env) {
    const now = Date.now();
    if (cachedSessionMaxDays != null && now - cachedAt < CACHE_MS) {
        return cachedSessionMaxDays;
    }
    const row = await readSetting(env, SETTING_SESSION_MAX_DAYS);
    const days = clampSessionMaxDays(row || DEFAULT_SESSION_MAX_DAYS);
    cachedSessionMaxDays = days;
    cachedAt = now;
    return days;
}

export async function getSessionMaxDays(env) {
    return readSessionMaxDays(env);
}

export async function getSessionMaxAgeSec(env) {
    const days = await readSessionMaxDays(env);
    return days * 86400;
}

export async function getAdminSettings(env) {
    const pair = await readIdlePair(env);
    return {
        lockStaleMinutes: await readLockStaleMinutes(env),
        idleLogoutMinutes: pair.idleLogoutMinutes,
        idleWarningMinutes: pair.idleWarningMinutes,
        sessionMaxDays: await readSessionMaxDays(env)
    };
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

async function setIdleSessionMinutes(env, logoutMinutes, warningMinutes) {
    const pair = normalizeIdlePair(logoutMinutes, warningMinutes);
    await env.DB.prepare(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
        .bind(SETTING_IDLE_LOGOUT_MINUTES, String(pair.idleLogoutMinutes))
        .run();
    await env.DB.prepare(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
        .bind(SETTING_IDLE_WARNING_MINUTES, String(pair.idleWarningMinutes))
        .run();
    cachedIdleLogoutMinutes = pair.idleLogoutMinutes;
    cachedIdleWarningMinutes = pair.idleWarningMinutes;
    cachedAt = Date.now();
    return pair;
}

export async function patchAdminSettings(env, body) {
    if (!body || typeof body !== 'object') {
        return getAdminSettings(env);
    }
    if (body.lockStaleMinutes !== undefined) {
        await setLockStaleMinutes(env, body.lockStaleMinutes);
    }
    if (body.idleLogoutMinutes !== undefined || body.idleWarningMinutes !== undefined) {
        const current = await readIdlePair(env);
        const logout =
            body.idleLogoutMinutes !== undefined ? body.idleLogoutMinutes : current.idleLogoutMinutes;
        const warning =
            body.idleWarningMinutes !== undefined ? body.idleWarningMinutes : current.idleWarningMinutes;
        await setIdleSessionMinutes(env, logout, warning);
    }
    if (body.sessionMaxDays !== undefined) {
        const days = clampSessionMaxDays(body.sessionMaxDays);
        await env.DB.prepare(
            `INSERT INTO app_settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
            .bind(SETTING_SESSION_MAX_DAYS, String(days))
            .run();
        cachedSessionMaxDays = days;
        cachedAt = Date.now();
    }
    return getAdminSettings(env);
}

export {
    MIN_LOCK_STALE_MINUTES,
    MAX_LOCK_STALE_MINUTES,
    DEFAULT_LOCK_STALE_MINUTES,
    MIN_IDLE_LOGOUT_MINUTES,
    MAX_IDLE_LOGOUT_MINUTES,
    DEFAULT_IDLE_LOGOUT_MINUTES,
    MIN_IDLE_WARNING_MINUTES,
    MAX_IDLE_WARNING_MINUTES,
    DEFAULT_IDLE_WARNING_MINUTES,
    MIN_SESSION_MAX_DAYS,
    MAX_SESSION_MAX_DAYS,
    DEFAULT_SESSION_MAX_DAYS
};
