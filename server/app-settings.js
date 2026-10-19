const { getDb } = require('./schema');
const Core = require('../shared/app-settings-core.cjs');

const {
    SETTING_LOCK_STALE_MINUTES,
    DEFAULT_LOCK_STALE_MINUTES,
    MIN_LOCK_STALE_MINUTES,
    MAX_LOCK_STALE_MINUTES,
    SETTING_IDLE_LOGOUT_MINUTES,
    SETTING_IDLE_WARNING_MINUTES,
    DEFAULT_IDLE_LOGOUT_MINUTES,
    MIN_IDLE_LOGOUT_MINUTES,
    MAX_IDLE_LOGOUT_MINUTES,
    DEFAULT_IDLE_WARNING_MINUTES,
    MIN_IDLE_WARNING_MINUTES,
    MAX_IDLE_WARNING_MINUTES,
    SETTING_SESSION_MAX_DAYS,
    DEFAULT_SESSION_MAX_DAYS,
    MIN_SESSION_MAX_DAYS,
    MAX_SESSION_MAX_DAYS,
    SETTING_NAV_NOTIFICATION_ACTIVE_DAYS,
    SETTING_NAV_NOTIFICATION_DISMISSED_DAYS,
    DEFAULT_NAV_NOTIFICATION_ACTIVE_DAYS,
    MIN_NAV_NOTIFICATION_ACTIVE_DAYS,
    MAX_NAV_NOTIFICATION_ACTIVE_DAYS,
    DEFAULT_NAV_NOTIFICATION_DISMISSED_DAYS,
    MIN_NAV_NOTIFICATION_DISMISSED_DAYS,
    MAX_NAV_NOTIFICATION_DISMISSED_DAYS,
    clampLockStaleMinutes,
    clampIdleLogoutMinutes,
    normalizeIdlePair,
    clampSessionMaxDays,
    clampNavNotificationActiveDays,
    clampNavNotificationDismissedDays
} = Core;

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

function getSessionMaxDays() {
    return clampSessionMaxDays(getSetting(SETTING_SESSION_MAX_DAYS) || DEFAULT_SESSION_MAX_DAYS);
}

function getSessionMaxAgeSec() {
    return getSessionMaxDays() * 86400;
}

function getNavNotificationActiveDays() {
    return clampNavNotificationActiveDays(
        getSetting(SETTING_NAV_NOTIFICATION_ACTIVE_DAYS) || DEFAULT_NAV_NOTIFICATION_ACTIVE_DAYS
    );
}

function getNavNotificationDismissedDays() {
    return clampNavNotificationDismissedDays(
        getSetting(SETTING_NAV_NOTIFICATION_DISMISSED_DAYS) || DEFAULT_NAV_NOTIFICATION_DISMISSED_DAYS
    );
}

function getAdminSettings() {
    const pair = normalizeIdlePair(getIdleLogoutMinutes(), getSetting(SETTING_IDLE_WARNING_MINUTES) || DEFAULT_IDLE_WARNING_MINUTES);
    return {
        lockStaleMinutes: getLockStaleMinutes(),
        idleLogoutMinutes: pair.idleLogoutMinutes,
        idleWarningMinutes: pair.idleWarningMinutes,
        sessionMaxDays: getSessionMaxDays(),
        navNotificationActiveDays: getNavNotificationActiveDays(),
        navNotificationDismissedDays: getNavNotificationDismissedDays()
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
    if (body.sessionMaxDays !== undefined) {
        setSetting(SETTING_SESSION_MAX_DAYS, String(clampSessionMaxDays(body.sessionMaxDays)));
    }
    if (body.navNotificationActiveDays !== undefined) {
        setSetting(
            SETTING_NAV_NOTIFICATION_ACTIVE_DAYS,
            String(clampNavNotificationActiveDays(body.navNotificationActiveDays))
        );
    }
    if (body.navNotificationDismissedDays !== undefined) {
        setSetting(
            SETTING_NAV_NOTIFICATION_DISMISSED_DAYS,
            String(clampNavNotificationDismissedDays(body.navNotificationDismissedDays))
        );
    }
    return getAdminSettings();
}

module.exports = {
    getLockStaleMinutes,
    getLockStaleMs,
    getIdleLogoutMinutes,
    getIdleWarningMinutes,
    getSessionMaxDays,
    getSessionMaxAgeSec,
    getNavNotificationActiveDays,
    getNavNotificationDismissedDays,
    getAdminSettings,
    setLockStaleMinutes,
    patchAdminSettings,
    MIN_SESSION_MAX_DAYS,
    MAX_SESSION_MAX_DAYS,
    DEFAULT_SESSION_MAX_DAYS,
    MIN_LOCK_STALE_MINUTES,
    MAX_LOCK_STALE_MINUTES,
    DEFAULT_LOCK_STALE_MINUTES,
    MIN_IDLE_LOGOUT_MINUTES,
    MAX_IDLE_LOGOUT_MINUTES,
    DEFAULT_IDLE_LOGOUT_MINUTES,
    MIN_IDLE_WARNING_MINUTES,
    MAX_IDLE_WARNING_MINUTES,
    DEFAULT_IDLE_WARNING_MINUTES,
    MIN_NAV_NOTIFICATION_ACTIVE_DAYS,
    MAX_NAV_NOTIFICATION_ACTIVE_DAYS,
    DEFAULT_NAV_NOTIFICATION_ACTIVE_DAYS,
    MIN_NAV_NOTIFICATION_DISMISSED_DAYS,
    MAX_NAV_NOTIFICATION_DISMISSED_DAYS,
    DEFAULT_NAV_NOTIFICATION_DISMISSED_DAYS
};
