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
        el.setAttribute('role', 'alert');
        el.hidden = true;
        el.style.cssText =
            'position:fixed;left:0;right:0;top:0;z-index:100000;padding:0.65rem 1rem;' +
            'background:#fef3c7;border-bottom:1px solid #f59e0b;color:#92400e;' +
            'font-size:0.9rem;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.08);';
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

    async function fetchMe() {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (res.status === 401) {
            return null;
        }
        if (!res.ok) {
            throw new Error('Auth check failed');
        }
        return res.json();
    }

    const TeamAuth = {
        getUser() {
            return currentUser;
        },

        isSignedIn() {
            return Boolean(currentUser);
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
                }
                return currentUser;
            }
            if (location.protocol === 'file:') {
                checked = true;
                return null;
            }
            try {
                const health = await fetch('/api/health', { credentials: 'same-origin' });
                if (!health.ok) {
                    checked = true;
                    return null;
                }
                const healthJson = await health.json().catch(() => ({}));
                if (healthJson.openAccess) {
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
            attachIdleWatch();
            return currentUser;
        },

        async refresh() {
            currentUser = await fetchMe();
            applyIdlePolicy(currentUser);
            if (currentUser) {
                attachIdleWatch();
            } else {
                detachIdleWatch();
            }
            return currentUser;
        },

        async logoutAll() {
            detachIdleWatch();
            if (typeof CalendarSync !== 'undefined') {
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
            try {
                await fetch('/api/auth/logout-all', { method: 'POST', credentials: 'same-origin' });
            } catch (_) {
                /* proceed to login */
            }
            currentUser = null;
            checked = false;
            idleLoggingOut = false;
            location.href = '/login.html';
        },

        async logout(options) {
            const idleReason = options && options.reason === 'idle';
            detachIdleWatch();
            if (typeof CalendarSync !== 'undefined') {
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
            try {
                await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
            } catch (_) {
                /* proceed to login */
            }
            currentUser = null;
            checked = false;
            idleLoggingOut = false;
            if (idleReason) {
                const q = new URLSearchParams({ signedOut: 'idle' });
                location.href = '/login.html?' + q.toString();
            } else {
                location.href = '/login.html';
            }
        }
    };

    global.TeamAuth = TeamAuth;
})(typeof window !== 'undefined' ? window : globalThis);
