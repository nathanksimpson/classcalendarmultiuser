/**
 * Per-teacher UI prefs sync (nav layout) — localStorage cache + cloud GET/PUT.
 */
(function uiPrefsSyncModule(global) {
    'use strict';

    const DEBOUNCE_MS = 500;
    let hooks = null;
    let pushTimer = null;
    let lastCloudUpdatedAt = null;
    let pushInFlight = false;

    function getCalendarId() {
        if (hooks && typeof hooks.getCalendarId === 'function') {
            return hooks.getCalendarId() || '';
        }
        if (typeof CalendarSync !== 'undefined' && CalendarSync.getActiveCalendarId) {
            return CalendarSync.getActiveCalendarId() || '';
        }
        return '';
    }

    function getLocalPrefsPayload() {
        if (hooks && typeof hooks.getLocalPrefs === 'function') {
            return hooks.getLocalPrefs() || {};
        }
        return {};
    }

    function applyCloudPrefs(prefs) {
        if (hooks && typeof hooks.applyCloudPrefs === 'function') {
            hooks.applyCloudPrefs(prefs || {});
        }
    }

    function parseTime(iso) {
        if (!iso || typeof iso !== 'string') {
            return 0;
        }
        const ms = Date.parse(iso);
        return Number.isFinite(ms) ? ms : 0;
    }

    async function fetchPrefs() {
        const calId = getCalendarId();
        if (!calId || typeof CalendarSync === 'undefined' || !CalendarSync.loadUiPrefs) {
            return null;
        }
        try {
            return await CalendarSync.loadUiPrefs(calId);
        } catch (err) {
            console.warn('ui-prefs GET failed', err);
            return null;
        }
    }

    async function putPrefs(payload) {
        const calId = getCalendarId();
        if (!calId || typeof CalendarSync === 'undefined' || !CalendarSync.putUiPrefs) {
            return null;
        }
        try {
            return await CalendarSync.putUiPrefs(calId, payload || {});
        } catch (err) {
            console.warn('ui-prefs PUT failed', err);
            return null;
        }
    }

    async function loadAndMerge() {
        const cloud = await fetchPrefs();
        if (!cloud) {
            return;
        }
        lastCloudUpdatedAt = cloud.updatedAt || null;
        const local = getLocalPrefsPayload();
        const cloudMs = parseTime(cloud.updatedAt);
        const localMs = parseTime(local.updatedAt);
        const hasCloudLayout = !!(
            (Array.isArray(cloud.navZoneOrder) && cloud.navZoneOrder.length)
            || (cloud.navTabZone && Object.keys(cloud.navTabZone).length)
            || (cloud.navTabOrder && Object.keys(cloud.navTabOrder).length)
        );
        if (hasCloudLayout && cloudMs >= localMs) {
            applyCloudPrefs(cloud);
        } else if (localMs > cloudMs) {
            schedulePush();
        }
    }

    function schedulePush() {
        if (pushTimer) {
            clearTimeout(pushTimer);
        }
        pushTimer = setTimeout(() => {
            pushTimer = null;
            void flushPush();
        }, DEBOUNCE_MS);
    }

    async function flushPush() {
        if (pushInFlight) {
            schedulePush();
            return;
        }
        pushInFlight = true;
        try {
            const local = getLocalPrefsPayload();
            const body = {
                navZoneOrder: local.navZoneOrder || null,
                navTabZone: local.navTabZone || null,
                navTabOrder: local.navTabOrder || null
            };
            const result = await putPrefs(body);
            if (result && result.updatedAt) {
                lastCloudUpdatedAt = result.updatedAt;
                if (hooks && typeof hooks.setLocalUpdatedAt === 'function') {
                    hooks.setLocalUpdatedAt(result.updatedAt);
                }
            }
        } finally {
            pushInFlight = false;
        }
    }

    async function resetAndPushDefaults(defaultsPayload) {
        applyCloudPrefs(defaultsPayload || {});
        if (hooks && typeof hooks.setLocalUpdatedAt === 'function') {
            hooks.setLocalUpdatedAt(new Date().toISOString());
        }
        await flushPush();
    }

    function init(nextHooks) {
        hooks = nextHooks || null;
    }

    global.CCPUiPrefsSync = {
        init,
        loadAndMerge,
        schedulePush,
        flushPush,
        resetAndPushDefaults,
        getLastCloudUpdatedAt() {
            return lastCloudUpdatedAt;
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
