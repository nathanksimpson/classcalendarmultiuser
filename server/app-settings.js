const { getDb } = require('./schema');

const SETTING_LOCK_STALE_MINUTES = 'lock_stale_minutes';
const DEFAULT_LOCK_STALE_MINUTES = 20;
const MIN_LOCK_STALE_MINUTES = 5;
const MAX_LOCK_STALE_MINUTES = 120;

function clampLockStaleMinutes(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) {
        return DEFAULT_LOCK_STALE_MINUTES;
    }
    return Math.min(MAX_LOCK_STALE_MINUTES, Math.max(MIN_LOCK_STALE_MINUTES, v));
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

function getAdminSettings() {
    return { lockStaleMinutes: getLockStaleMinutes() };
}

function setLockStaleMinutes(minutes) {
    const clamped = clampLockStaleMinutes(minutes);
    setSetting(SETTING_LOCK_STALE_MINUTES, String(clamped));
    return { lockStaleMinutes: clamped };
}

module.exports = {
    getLockStaleMinutes,
    getLockStaleMs,
    getAdminSettings,
    setLockStaleMinutes,
    MIN_LOCK_STALE_MINUTES,
    MAX_LOCK_STALE_MINUTES,
    DEFAULT_LOCK_STALE_MINUTES
};
