/**
 * App-settings clamp constants and pure validators shared by
 * `server/app-settings.js` and `worker/src/app-settings.js`.
 * Persistence / caching stays in each backend adapter.
 */

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

const SETTING_NAV_NOTIFICATION_ACTIVE_DAYS = 'nav_notification_active_days';
const SETTING_NAV_NOTIFICATION_DISMISSED_DAYS = 'nav_notification_dismissed_days';
const DEFAULT_NAV_NOTIFICATION_ACTIVE_DAYS = 14;
const MIN_NAV_NOTIFICATION_ACTIVE_DAYS = 1;
const MAX_NAV_NOTIFICATION_ACTIVE_DAYS = 90;
const DEFAULT_NAV_NOTIFICATION_DISMISSED_DAYS = 3;
const MIN_NAV_NOTIFICATION_DISMISSED_DAYS = 1;
const MAX_NAV_NOTIFICATION_DISMISSED_DAYS = 30;

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

function clampSessionMaxDays(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) {
        return DEFAULT_SESSION_MAX_DAYS;
    }
    return Math.min(MAX_SESSION_MAX_DAYS, Math.max(MIN_SESSION_MAX_DAYS, v));
}

function clampNavNotificationActiveDays(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) {
        return DEFAULT_NAV_NOTIFICATION_ACTIVE_DAYS;
    }
    return Math.min(MAX_NAV_NOTIFICATION_ACTIVE_DAYS, Math.max(MIN_NAV_NOTIFICATION_ACTIVE_DAYS, v));
}

function clampNavNotificationDismissedDays(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) {
        return DEFAULT_NAV_NOTIFICATION_DISMISSED_DAYS;
    }
    return Math.min(MAX_NAV_NOTIFICATION_DISMISSED_DAYS, Math.max(MIN_NAV_NOTIFICATION_DISMISSED_DAYS, v));
}

module.exports = {
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
    clampIdleWarningMinutes,
    normalizeIdlePair,
    clampSessionMaxDays,
    clampNavNotificationActiveDays,
    clampNavNotificationDismissedDays
};
