/**
 * Per-user browser session restore (UI prefs, last path, workspace/admin state).
 */
(function (global) {
    const SESSION_PREFIX = 'ccpUserSession:';
    const UI_PREFIX = 'classCalendarUi:';
    const UI_LOCAL_ID = 'local';
    const ACTIVE_PREFIX = 'teamCalendarActiveId:';
    const LEGACY_ACTIVE = 'teamCalendarActiveId';
    const MIGRATE_FLAG_PREFIX = 'ccpSessionMigrated:';
    const SESSION_VERSION = 1;
    const QUEUE_PREFIX = 'classCalendarQueue:';

    function isFileProtocol() {
        return typeof location !== 'undefined' && location.protocol === 'file:';
    }

    function isViewAsSkip() {
        try {
            if (typeof TeamAuth !== 'undefined' && TeamAuth.isViewAsMode && TeamAuth.isViewAsMode()) {
                return true;
            }
        } catch (_) {
            /* ignore */
        }
        return false;
    }

    function getSessionUserId() {
        if (isFileProtocol() || isViewAsSkip()) {
            return null;
        }
        try {
            if (typeof TeamAuth !== 'undefined' && TeamAuth.getUser) {
                const u = TeamAuth.getUser();
                if (u && u.id) {
                    if (u.viewAs && u.viewAs.active && u.viewAs.actorUserId) {
                        return String(u.viewAs.actorUserId);
                    }
                    return String(u.id);
                }
            }
        } catch (_) {
            /* ignore */
        }
        return null;
    }

    function sessionKey(userId) {
        return SESSION_PREFIX + userId;
    }

    function getCurrentPath() {
        if (typeof location === 'undefined') {
            return '/';
        }
        return location.pathname + location.search + (location.hash || '');
    }

    /** Resume last page on cold open only — not browser Back/Forward or same-site links (e.g. Admin → Calendar). */
    function shouldAttemptLastPathRestore() {
        if (typeof performance !== 'undefined' && performance.getEntriesByType) {
            const nav = performance.getEntriesByType('navigation')[0];
            if (nav && nav.type === 'back_forward') {
                return false;
            }
        }
        if (typeof document !== 'undefined' && document.referrer) {
            try {
                const ref = new URL(document.referrer);
                if (ref.origin === location.origin) {
                    return false;
                }
            } catch (_) {
                /* ignore */
            }
        }
        return true;
    }

    function loadUserSession(userId) {
        if (!userId) {
            return null;
        }
        try {
            const raw = localStorage.getItem(sessionKey(userId));
            if (!raw) {
                return null;
            }
            const data = JSON.parse(raw);
            return data && typeof data === 'object' ? data : null;
        } catch (_) {
            return null;
        }
    }

    function saveUserSession(userId, patch) {
        if (!userId || !patch) {
            return;
        }
        try {
            const prev = loadUserSession(userId) || { version: SESSION_VERSION };
            const next = Object.assign({}, prev, patch, { version: SESSION_VERSION });
            localStorage.setItem(sessionKey(userId), JSON.stringify(next));
        } catch (_) {
            /* ignore */
        }
    }

    function isLegacyUiKey(key) {
        if (!key || !key.startsWith(UI_PREFIX)) {
            return false;
        }
        const colons = (key.match(/:/g) || []).length;
        return colons === 1;
    }

    function getUiStorageKey(calendarId) {
        const cal =
            calendarId != null && String(calendarId).trim()
                ? String(calendarId).trim()
                : UI_LOCAL_ID;
        const userId = getSessionUserId();
        if (userId) {
            return UI_PREFIX + userId + ':' + cal;
        }
        return UI_PREFIX + cal;
    }

    function getLegacyUiStorageKey(calendarId) {
        const cal =
            calendarId != null && String(calendarId).trim()
                ? String(calendarId).trim()
                : UI_LOCAL_ID;
        return UI_PREFIX + cal;
    }

    function migrateLegacyKeys(userId) {
        if (!userId) {
            return;
        }
        const flag = MIGRATE_FLAG_PREFIX + userId;
        try {
            if (localStorage.getItem(flag) === '1') {
                return;
            }
            const legacyActive = localStorage.getItem(LEGACY_ACTIVE);
            if (legacyActive && !localStorage.getItem(ACTIVE_PREFIX + userId)) {
                localStorage.setItem(ACTIVE_PREFIX + userId, legacyActive);
            }
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && isLegacyUiKey(k)) {
                    keys.push(k);
                }
            }
            keys.forEach((k) => {
                const calId = k.slice(UI_PREFIX.length);
                const userKey = UI_PREFIX + userId + ':' + calId;
                if (!localStorage.getItem(userKey)) {
                    const val = localStorage.getItem(k);
                    if (val) {
                        localStorage.setItem(userKey, val);
                    }
                }
            });
            localStorage.setItem(flag, '1');
        } catch (_) {
            /* ignore */
        }
    }

    function getActiveCalendarIdFromStorage() {
        const userId = getSessionUserId();
        if (userId) {
            try {
                const scoped = localStorage.getItem(ACTIVE_PREFIX + userId);
                if (scoped) {
                    return scoped;
                }
            } catch (_) {
                /* ignore */
            }
        }
        try {
            return localStorage.getItem(LEGACY_ACTIVE);
        } catch (_) {
            return null;
        }
    }

    function setActiveCalendarIdInStorage(id) {
        const userId = getSessionUserId();
        try {
            if (userId) {
                if (id) {
                    localStorage.setItem(ACTIVE_PREFIX + userId, String(id));
                } else {
                    localStorage.removeItem(ACTIVE_PREFIX + userId);
                }
            }
            if (id) {
                localStorage.setItem(LEGACY_ACTIVE, String(id));
            } else {
                localStorage.removeItem(LEGACY_ACTIVE);
            }
        } catch (_) {
            /* ignore */
        }
    }

    function capturePageSession(extra) {
        if (isViewAsSkip()) {
            return;
        }
        const userId = getSessionUserId();
        if (!userId) {
            return;
        }
        const patch = Object.assign({ lastPath: getCurrentPath() }, extra || {});
        saveUserSession(userId, patch);
    }

    function captureBeforeLogout() {
        if (isViewAsSkip()) {
            return;
        }
        try {
            if (typeof saveUiStateToLocalStorage === 'function') {
                saveUiStateToLocalStorage();
            }
        } catch (_) {
            /* ignore */
        }
        try {
            if (typeof captureAppSessionExtras === 'function') {
                captureAppSessionExtras();
            }
        } catch (_) {
            /* ignore */
        }
        capturePageSession();
    }

    function getLogoutReturnUrl() {
        return getCurrentPath();
    }

    function buildLoginRedirect(idleReason) {
        const path = getLogoutReturnUrl() || '/';
        const q = new URLSearchParams({ return: path });
        if (idleReason) {
            q.set('signedOut', 'idle');
        }
        return '/login.html?' + q.toString();
    }

    function saveAdminSession(adminPatch) {
        const userId = getSessionUserId();
        if (!userId || !adminPatch) {
            return;
        }
        const sess = loadUserSession(userId) || {};
        saveUserSession(userId, {
            admin: Object.assign({}, sess.admin || {}, adminPatch)
        });
    }

    function getAdminSession() {
        const userId = getSessionUserId();
        if (!userId) {
            return null;
        }
        const sess = loadUserSession(userId);
        return sess && sess.admin ? sess.admin : null;
    }

    function saveWorkspaceSession(wsPatch) {
        const userId = getSessionUserId();
        if (!userId || !wsPatch) {
            return;
        }
        const sess = loadUserSession(userId) || {};
        saveUserSession(userId, {
            workspace: Object.assign({}, sess.workspace || {}, wsPatch)
        });
    }

    function getWorkspaceSession() {
        const userId = getSessionUserId();
        if (!userId) {
            return null;
        }
        const sess = loadUserSession(userId);
        return sess && sess.workspace ? sess.workspace : null;
    }

    function saveNotesSession(notesPatch) {
        const userId = getSessionUserId();
        if (!userId || !notesPatch) {
            return;
        }
        const sess = loadUserSession(userId) || {};
        saveUserSession(userId, {
            notes: Object.assign({}, sess.notes || {}, notesPatch)
        });
    }

    function getNotesSession() {
        const userId = getSessionUserId();
        if (!userId) {
            return null;
        }
        const sess = loadUserSession(userId);
        return sess && sess.notes ? sess.notes : null;
    }

    function onUserAuthenticated() {
        const userId = getSessionUserId();
        if (userId) {
            migrateLegacyKeys(userId);
        }
    }

    function initSessionTracking() {
        if (typeof window === 'undefined' || window.__ccpSessionTrackingInit) {
            return;
        }
        window.__ccpSessionTrackingInit = true;
        window.addEventListener('beforeunload', () => {
            capturePageSession();
        });
    }

    function maybeRestoreLastPath() {
        if (typeof location === 'undefined') {
            return false;
        }
        if (!shouldAttemptLastPathRestore()) {
            return false;
        }
        const userId = getSessionUserId();
        if (!userId) {
            return false;
        }
        const sess = loadUserSession(userId);
        const target = sess && sess.lastPath ? String(sess.lastPath).trim() : '';
        if (!target || target === getCurrentPath()) {
            return false;
        }
        const path = location.pathname || '/';
        const isEntry =
            path === '/' || path === '/index.html' || path.endsWith('/index.html');
        if (!isEntry) {
            return false;
        }
        if (
            target.indexOf('login.html') >= 0 ||
            target.indexOf('pending-access') >= 0
        ) {
            return false;
        }
        location.replace(target);
        return true;
    }

    function queueKey(calendarId) {
        return QUEUE_PREFIX + String(calendarId || '');
    }

    function saveOfflineQueue(calendarId, queueArray) {
        if (isFileProtocol() || isViewAsSkip() || !calendarId) {
            return;
        }
        try {
            const arr = Array.isArray(queueArray) ? queueArray : [];
            localStorage.setItem(queueKey(calendarId), JSON.stringify(arr));
        } catch (_) {
            /* ignore quota / private mode */
        }
    }

    function loadOfflineQueue(calendarId) {
        if (isFileProtocol() || !calendarId) {
            return [];
        }
        try {
            const raw = localStorage.getItem(queueKey(calendarId));
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function clearOfflineQueue(calendarId) {
        if (isFileProtocol() || !calendarId) {
            return;
        }
        try {
            localStorage.removeItem(queueKey(calendarId));
        } catch (_) {
            /* ignore */
        }
    }

    global.CCPSessionRestore = {
        getSessionUserId,
        getUiStorageKey,
        getLegacyUiStorageKey,
        migrateLegacyKeys,
        getActiveCalendarIdFromStorage,
        setActiveCalendarIdInStorage,
        capturePageSession,
        captureBeforeLogout,
        initSessionTracking,
        getLogoutReturnUrl,
        buildLoginRedirect,
        loadUserSession,
        saveUserSession,
        saveAdminSession,
        getAdminSession,
        saveWorkspaceSession,
        getWorkspaceSession,
        saveNotesSession,
        getNotesSession,
        onUserAuthenticated,
        maybeRestoreLastPath,
        isViewAsSkip,
        saveOfflineQueue,
        loadOfflineQueue,
        clearOfflineQueue
    };

    initSessionTracking();
})(typeof window !== 'undefined' ? window : globalThis);
