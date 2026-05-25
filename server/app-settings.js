const { getDb } = require('./schema');

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

function clampLockStaleMinutes(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) {
        return DEFAULT_LOCK_STALE_MINUTES;
    }
    return Math.min(MAX_LOCK_STALE_MINUTES, Math.max(MIN_LOCK_STALE_MINUTES, v));
}

function clampIdleLogoutMinutes(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) {
        return DEFAULT_IDLE_LOGOUT_MINUTES;
    }
    return Math.min(MAX_IDLE_LOGOUT_MINUTES, Math.max(MIN_IDLE_LOGOUT_MINUTES, v));
}

function clampIdleWarningMinutes(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) {
        return DEFAULT_IDLE_WARNING_MINUTES;
    }
    return Math.min(MAX_IDLE_WARNING_MINUTES, Math.max(MIN_IDLE_WARNING_MINUTES, v));
}

function normalizeIdlePair(logoutMinutes, warningMinutes) {
    const idleLogoutMinutes = clampIdleLogoutMinutes(logoutMinutes);
    let idleWarningMinutes = clampIdleWarningMinutes(warningMinutes);
    if (idleWarningMinutes >= idleLogoutMinutes) {
        idleWarningMinutes = Math.max(MIN_IDLE_WARNING_MINUTES, idleLogoutMinutes - 1);
    }
    return { idleLogoutMinutes, idleWarningMinutes };
}

function getSetting(key) {
    const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row ? row.value : null;
}

function setSetting(key, value) {
    getDb()
        .prepare(
            `INSERT INTO app_settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
        .run(key, String(value));
}

function getLockStaleMinutes() {
    return clampLockStaleMinutes(getSetting(SETTING_LOCK_STALE_MINUTES) || DEFAULT_LOCK_STALE_MINUTES);
}

function getLockStaleMs() {
    return getLockStaleMinutes() * 60 * 1000;
}

function getIdleLogoutMinutes() {
    return clampIdleLogoutMinutes(getSetting(SETTING_IDLE_LOGOUT_MINUTES) || DEFAULT_IDLE_LOGOUT_MINUTES);
}

function getIdleWarningMinutes() {
    const pair = normalizeIdlePair(getIdleLogoutMinutes(), getSetting(SETTING_IDLE_WARNING_MINUTES) || DEFAULT_IDLE_WARNING_MINUTES);
    return pair.idleWarningMinutes;
}

function getAdminSettings() {
    const pair = normalizeIdlePair(getIdleLogoutMinutes(), getSetting(SETTING_IDLE_WARNING_MINUTES) || DEFAULT_IDLE_WARNING_MINUTES);
    return {
        lockStaleMinutes: getLockStaleMinutes(),
        idleLogoutMinutes: pair.idleLogoutMinutes,
        idleWarningMinutes: pair.idleWarningMinutes
    };
}

function setLockStaleMinutes(minutes) {
    const clamped = clampLockStaleMinutes(minutes);
    setSetting(SETTING_LOCK_STALE_MINUTES, String(clamped));
    return clamped;
}

function setIdleSessionMinutes(logoutMinutes, warningMinutes) {
    const pair = normalizeIdlePair(logoutMinutes, warningMinutes);
    setSetting(SETTING_IDLE_LOGOUT_MINUTES, String(pair.idleLogoutMinutes));
    setSetting(SETTING_IDLE_WARNING_MINUTES, String(pair.idleWarningMinutes));
    return pair;
}

function patchAdminSettings(body) {
    if (!body || typeof body !== 'object') {
        return getAdminSettings();
    }
    if (body.lockStaleMinutes !== undefined) {
        setLockStaleMinutes(body.lockStaleMinutes);
    }
    if (body.idleLogoutMinutes !== undefined || body.idleWarningMinutes !== undefined) {
        const logout =
            body.idleLogoutMinutes !== undefined ? body.idleLogoutMinutes : getIdleLogoutMinutes();
        const warning =
            body.idleWarningMinutes !== undefined
                ? body.idleWarningMinutes
                : getSetting(SETTING_IDLE_WARNING_MINUTES) || DEFAULT_IDLE_WARNING_MINUTES;
        setIdleSessionMinutes(logout, warning);
    }
    return getAdminSettings();
}

module.exports = {
    getLockStaleMinutes,
    getLockStaleMs,
    getIdleLogoutMinutes,
    getIdleWarningMinutes,
    getAdminSettings,
    setLockStaleMinutes,
    patchAdminSettings,
    MIN_LOCK_STALE_MINUTES,
    MAX_LOCK_STALE_MINUTES,
    DEFAULT_LOCK_STALE_MINUTES,
    MIN_IDLE_LOGOUT_MINUTES,
    MAX_IDLE_LOGOUT_MINUTES,
    DEFAULT_IDLE_LOGOUT_MINUTES,
    MIN_IDLE_WARNING_MINUTES,
    MAX_IDLE_WARNING_MINUTES,
    DEFAULT_IDLE_WARNING_MINUTES
};
