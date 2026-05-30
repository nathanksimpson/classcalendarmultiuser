/**
 * Session check for team server — redirects to login when required.
 */
(function (global) {
    const DEFAULT_IDLE_LOGOUT_MS = 30 * 60 * 1000;
    const DEFAULT_IDLE_WARNING_MS = 2 * 60 * 1000;

    const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart'];

    let currentUser = null;
    let checked = false;
    let idleWatching = false;
    let idleWarningTimer = null;
    let idleLogoutTimer = null;
    let idleLoggingOut = false;
    let idleBannerEl = null;
    let idleTimeoutMs = DEFAULT_IDLE_LOGOUT_MS;
    let idleWarningMs = DEFAULT_IDLE_WARNING_MS;

    function idleWarnAtMs() {
        const gap = idleTimeoutMs - idleWarningMs;
        return gap > 0 ? gap : Math.max(0, idleTimeoutMs - 60000);
    }

    function applyIdlePolicy(me) {
        if (!me) {
            idleTimeoutMs = DEFAULT_IDLE_LOGOUT_MS;
            idleWarningMs = DEFAULT_IDLE_WARNING_MS;
            return;
        }
        const logoutMin = Number(me.idleLogoutMinutes);
        const warnMin = Number(me.idleWarningMinutes);
        if (Number.isFinite(logoutMin) && logoutMin > 0) {
            idleTimeoutMs = logoutMin * 60 * 1000;
        } else {
            idleTimeoutMs = DEFAULT_IDLE_LOGOUT_MS;
        }
        if (Number.isFinite(warnMin) && warnMin > 0) {
            idleWarningMs = warnMin * 60 * 1000;
        } else {
            idleWarningMs = DEFAULT_IDLE_WARNING_MS;
        }
        if (idleWarningMs >= idleTimeoutMs) {
            idleWarningMs = Math.max(60000, idleTimeoutMs - 60000);
        }
        updateIdleBannerText();
        if (idleWatching) {
            resetIdleTimers();
        }
    }

    function updateIdleBannerText() {
        const el = idleBannerEl || (typeof document !== 'undefined' ? document.getElementById('teamIdleWarningBanner') : null);
        if (!el) {
            return;
        }
        const warnMin = Math.max(1, Math.round(idleWarningMs / 60000));
        el.textContent =
            'You will be signed out in ' +
            warnMin +
            ' minute' +
            (warnMin === 1 ? '' : 's') +
            ' due to inactivity. Move the mouse or press a key to stay signed in.';
    }

    function onActivity() {
        resetIdleTimers();
    }

    function ensureIdleBanner() {
        if (idleBannerEl || typeof document === 'undefined') {
            return idleBannerEl;
        }
        const el = document.createElement('div');
        el.id = 'teamIdleWarningBanner';
        el.className = 'team-idle-warning-banner';
        el.setAttribute('role', 'alert');
        el.hidden = true;
        document.body.appendChild(el);
        idleBannerEl = el;
        updateIdleBannerText();
        return el;
    }

    function showIdleWarning() {
        const el = ensureIdleBanner();
        if (el) {
            updateIdleBannerText();
            el.hidden = false;
        }
    }

    function hideIdleWarning() {
        if (idleBannerEl) {
            idleBannerEl.hidden = true;
        }
    }

    function clearIdleTimers() {
        if (idleWarningTimer) {
            clearTimeout(idleWarningTimer);
            idleWarningTimer = null;
        }
        if (idleLogoutTimer) {
            clearTimeout(idleLogoutTimer);
            idleLogoutTimer = null;
        }
    }

    function resetIdleTimers() {
        hideIdleWarning();
        clearIdleTimers();
        if (!currentUser || !idleWatching || location.protocol === 'file:') {
            return;
        }
        if (TeamAuth.isViewAsMode && TeamAuth.isViewAsMode()) {
            return;
        }
        idleWarningTimer = setTimeout(() => {
            if (currentUser && idleWatching) {
                showIdleWarning();
            }
        }, idleWarnAtMs());
        idleLogoutTimer = setTimeout(() => {
            if (currentUser && idleWatching && !idleLoggingOut) {
                idleLoggingOut = true;
                TeamAuth.logout({ reason: 'idle' }).catch(() => {
                    idleLoggingOut = false;
                });
            }
        }, idleTimeoutMs);
    }

    function attachIdleWatch() {
        if (idleWatching || typeof document === 'undefined' || location.protocol === 'file:') {
            return;
        }
        if (!currentUser) {
            return;
        }
        if (TeamAuth.isViewAsMode && TeamAuth.isViewAsMode()) {
            return;
        }
        idleWatching = true;
        ACTIVITY_EVENTS.forEach((ev) => {
            document.addEventListener(ev, onActivity, { passive: true });
        });
        resetIdleTimers();
    }

    function detachIdleWatch() {
        idleWatching = false;
        clearIdleTimers();
        hideIdleWarning();
        if (typeof document !== 'undefined') {
            ACTIVITY_EVENTS.forEach((ev) => {
                document.removeEventListener(ev, onActivity);
            });
        }
    }

    function authHeaders(extra) {
        if (typeof ViewAsBanner !== 'undefined' && ViewAsBanner.authFetchHeaders) {
            return ViewAsBanner.authFetchHeaders(extra);
        }
        return Object.assign({}, extra || {});
    }

    async function fetchMe() {
        const res = await fetch('/api/auth/me', {
            credentials: 'same-origin',
            headers: authHeaders()
        });
        if (res.status === 401) {
            return null;
        }
        if (!res.ok) {
            throw new Error('Auth check failed');
        }
        return res.json();
    }

    function userPermissions() {
        if (!currentUser) {
            return [];
        }
        if (Array.isArray(currentUser.permissions)) {
            return currentUser.permissions;
        }
        return [];
    }

    async function releaseCalendarLocksBeforeLogout() {
        if (typeof CalendarSync === 'undefined') {
            return;
        }
        try {
            if (CalendarSync.prepareForLogout) {
                await CalendarSync.prepareForLogout();
            }
            if (CalendarSync.stopPolling) {
                CalendarSync.stopPolling();
            }
            const calId = CalendarSync.getActiveCalendarId && CalendarSync.getActiveCalendarId();
            if (calId && CalendarSync.state && CalendarSync.state.holdsLock && CalendarSync.releaseLock) {
                await CalendarSync.releaseLock(calId);
            }
        } catch (_) {
            /* server also releases locks on logout */
        }
    }

    const TeamAuth = {
        getUser() {
            return currentUser;
        },

        isSignedIn() {
            return Boolean(currentUser);
        },

        isViewAsMode() {
            return Boolean(
                currentUser &&
                    currentUser.viewAs &&
                    currentUser.viewAs.active &&
                    typeof ViewAsBanner !== 'undefined' &&
                    ViewAsBanner.getViewAsToken &&
                    ViewAsBanner.getViewAsToken()
            );
        },

        getViewAsTargetName() {
            if (!currentUser || !currentUser.viewAs) {
                return '';
            }
            return currentUser.viewAs.targetDisplayName || currentUser.displayName || '';
        },

        getViewAsActorName() {
            if (!currentUser || !currentUser.viewAs) {
                return '';
            }
            return currentUser.viewAs.actorDisplayName || '';
        },

        authHeaders,

        hasPermission(perm) {
            if (!perm) {
                return false;
            }
            if (userPermissions().includes(perm)) {
                return true;
            }
            if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'super_admin')) {
                return true;
            }
            return false;
        },

        canAccessAdmin() {
            return Boolean(currentUser && currentUser.canAccessAdmin);
        },

        startIdleWatch() {
            attachIdleWatch();
        },

        stopIdleWatch() {
            detachIdleWatch();
        },

        recordActivity() {
            resetIdleTimers();
        },

        async ensure() {
            if (checked) {
                if (currentUser) {
                    attachIdleWatch();
                    if (typeof ViewAsBanner !== 'undefined' && ViewAsBanner.renderViewAsBanner) {
                        ViewAsBanner.renderViewAsBanner(currentUser);
                    }
                }
                return currentUser;
            }
            if (location.protocol === 'file:') {
                checked = true;
                return null;
            }
            try {
                if (typeof ViewAsBanner !== 'undefined' && ViewAsBanner.activateViewAsFromUrl) {
                    await ViewAsBanner.activateViewAsFromUrl();
                }
            } catch (err) {
                checked = true;
                alert(err.message || 'View As link expired. Close this tab and try again from Admin.');
                throw err;
            }
            try {
                const health = await fetch('/api/health', { credentials: 'same-origin' });
                if (!health.ok) {
                    checked = true;
                    return null;
                }
                const healthJson = await health.json().catch(() => ({}));
                if (
                    healthJson.openAccess &&
                    !(typeof ViewAsBanner !== 'undefined' && ViewAsBanner.getViewAsToken && ViewAsBanner.getViewAsToken())
                ) {
                    checked = true;
                    return null;
                }
            } catch (_) {
                checked = true;
                return null;
            }

            currentUser = await fetchMe();
            applyIdlePolicy(currentUser);
            checked = true;
            if (!currentUser) {
                detachIdleWatch();
                const ret = encodeURIComponent(location.pathname + location.search);
                location.replace('/login.html?return=' + ret);
                throw new Error('redirect');
            }
            if (
                currentUser.hasCalendarAccess === false &&
                !currentUser.canAccessAdmin &&
                currentUser.role !== 'admin' &&
                typeof location !== 'undefined'
            ) {
                const path = location.pathname || '';
                const onPending =
                    path === '/pending-access.html' || path.endsWith('/pending-access.html');
                const onAdmin = path === '/admin.html' || path.endsWith('/admin.html');
                if (!onPending && !onAdmin) {
                    location.replace('/pending-access.html');
                    throw new Error('redirect');
                }
            }
            if (typeof ViewAsBanner !== 'undefined' && ViewAsBanner.renderViewAsBanner) {
                ViewAsBanner.renderViewAsBanner(currentUser);
            }
            attachIdleWatch();
            if (typeof CCPSessionRestore !== 'undefined' && CCPSessionRestore.onUserAuthenticated) {
                CCPSessionRestore.onUserAuthenticated();
            }
            return currentUser;
        },

        async refresh() {
            currentUser = await fetchMe();
            applyIdlePolicy(currentUser);
            if (currentUser) {
                attachIdleWatch();
                if (typeof ViewAsBanner !== 'undefined' && ViewAsBanner.renderViewAsBanner) {
                    ViewAsBanner.renderViewAsBanner(currentUser);
                }
            } else {
                detachIdleWatch();
            }
            return currentUser;
        },

        async logoutAll() {
            if (TeamAuth.isViewAsMode()) {
                return ViewAsBanner.exitViewAs();
            }
            detachIdleWatch();
            await releaseCalendarLocksBeforeLogout();
            if (typeof CCPSessionRestore !== 'undefined' && CCPSessionRestore.captureBeforeLogout) {
                CCPSessionRestore.captureBeforeLogout();
            }
            if (typeof CCPStoragePrune !== 'undefined' && CCPStoragePrune.pruneOnLogout) {
                CCPStoragePrune.pruneOnLogout();
            }
            try {
                await fetch('/api/auth/logout-all', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: authHeaders()
                });
            } catch (_) {
                /* proceed to login */
            }
            currentUser = null;
            checked = false;
            idleLoggingOut = false;
            location.href =
                typeof CCPSessionRestore !== 'undefined' && CCPSessionRestore.buildLoginRedirect
                    ? CCPSessionRestore.buildLoginRedirect(false)
                    : '/login.html';
        },

        async logout(options) {
            if (TeamAuth.isViewAsMode()) {
                return ViewAsBanner.exitViewAs();
            }
            const idleReason = options && options.reason === 'idle';
            detachIdleWatch();
            await releaseCalendarLocksBeforeLogout();
            if (typeof CCPSessionRestore !== 'undefined' && CCPSessionRestore.captureBeforeLogout) {
                CCPSessionRestore.captureBeforeLogout();
            }
            if (typeof CCPStoragePrune !== 'undefined' && CCPStoragePrune.pruneOnLogout) {
                CCPStoragePrune.pruneOnLogout();
            }
            try {
                await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
            } catch (_) {
                /* proceed to login */
            }
            currentUser = null;
            checked = false;
            idleLoggingOut = false;
            location.href =
                typeof CCPSessionRestore !== 'undefined' && CCPSessionRestore.buildLoginRedirect
                    ? CCPSessionRestore.buildLoginRedirect(idleReason)
                    : idleReason
                      ? '/login.html?signedOut=idle'
                      : '/login.html';
        }
    };

    global.TeamAuth = TeamAuth;
})(typeof window !== 'undefined' ? window : globalThis);
