/**
 * View As mode — tab-scoped session token and banner UI.
 */
(function (global) {
    const VIEW_AS_STORAGE_KEY = 'cal_view_as_session';
    const VIEW_AS_HEADER = 'X-View-As-Session';

    function tViewAs(key, vars) {
        if (typeof global.CCPViewAsI18n !== 'undefined' && global.CCPViewAsI18n.tViewAs) {
            return global.CCPViewAsI18n.tViewAs(key, vars);
        }
        const fallbacks = {
            viewAsBannerPrimary: 'Viewing as: {name}',
            viewAsBannerSecondary: 'Super Admin: {actor} · Changes are not saved',
            viewAsExitBtn: 'Exit View As',
            viewAsEnded: 'View As ended. You can close this tab.',
            viewAsActivationFailed: 'View As activation failed',
            viewAsExitFailed: 'Could not exit View As',
            viewAsLinkExpired: 'View As link expired. Close this tab and try again from Admin.',
            viewAsDocTitle: 'View as: {name}',
            viewAsUserFallback: 'User',
            viewAsSuperAdminFallback: 'Super Admin'
        };
        let str = fallbacks[key] || key;
        if (vars) {
            Object.keys(vars).forEach((k) => {
                str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
            });
        }
        return str;
    }

    function getViewAsToken() {
        try {
            return sessionStorage.getItem(VIEW_AS_STORAGE_KEY) || '';
        } catch (_) {
            return '';
        }
    }

    function storeViewAsToken(token) {
        try {
            if (token) {
                sessionStorage.setItem(VIEW_AS_STORAGE_KEY, token);
            } else {
                sessionStorage.removeItem(VIEW_AS_STORAGE_KEY);
            }
        } catch (_) {
            /* ignore */
        }
    }

    function clearViewAsToken() {
        storeViewAsToken('');
    }

    function authFetchHeaders(extra) {
        const headers = Object.assign({}, extra || {});
        const token = getViewAsToken();
        if (token) {
            headers[VIEW_AS_HEADER] = token;
        }
        return headers;
    }

    async function activateViewAsFromUrl() {
        if (typeof location === 'undefined') {
            return false;
        }
        const params = new URLSearchParams(location.search);
        const exchange = params.get('viewAsExchange');
        if (!exchange) {
            return false;
        }
        const res = await fetch('/api/admin/view-as/activate', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exchangeToken: exchange })
        });
        let json = null;
        try {
            json = await res.json();
        } catch (_) {
            json = null;
        }
        if (!res.ok || !json || !json.viewAsSessionToken) {
            const serverErr = json && json.error;
            throw new Error(serverErr || tViewAs('viewAsActivationFailed'));
        }
        storeViewAsToken(json.viewAsSessionToken);
        params.delete('viewAsExchange');
        const nextSearch = params.toString();
        const nextUrl = location.pathname + (nextSearch ? '?' + nextSearch : '') + location.hash;
        history.replaceState(null, '', nextUrl);
        return true;
    }

    function viewAsTargetLabel(user) {
        if (!user) {
            return tViewAs('viewAsUserFallback');
        }
        if (user.viewAs && user.viewAs.targetDisplayName) {
            return user.viewAs.targetDisplayName;
        }
        return user.displayName || user.email || tViewAs('viewAsUserFallback');
    }

    function syncRolePalette(user) {
        if (typeof TeamAuth !== 'undefined' && TeamAuth.applyRolePalette) {
            TeamAuth.applyRolePalette(user);
        }
    }

    let lastBannerUser = null;

    function renderViewAsBanner(user) {
        if (typeof document === 'undefined') {
            return;
        }
        lastBannerUser = user;
        const banner = document.getElementById('viewAsBanner');
        if (!banner) {
            syncRolePalette(user);
            return;
        }
        const active =
            user &&
            user.viewAs &&
            user.viewAs.active &&
            (typeof TeamAuth === 'undefined' || !TeamAuth.isViewAsMode || TeamAuth.isViewAsMode());
        if (!active) {
            banner.hidden = true;
            document.documentElement.classList.remove('view-as-active');
            syncRolePalette(user);
            return;
        }
        const targetName = viewAsTargetLabel(user);
        const actorName =
            (user.viewAs && user.viewAs.actorDisplayName) || tViewAs('viewAsSuperAdminFallback');
        const primary = document.getElementById('viewAsBannerPrimary');
        const secondary = document.getElementById('viewAsBannerSecondary');
        const exitBtn = document.getElementById('viewAsBannerExitBtn');
        if (primary) {
            primary.textContent = tViewAs('viewAsBannerPrimary', { name: targetName });
        }
        if (secondary) {
            secondary.textContent = tViewAs('viewAsBannerSecondary', { actor: actorName });
        }
        if (exitBtn) {
            exitBtn.textContent = tViewAs('viewAsExitBtn');
            if (!exitBtn.dataset.viewAsBound) {
                exitBtn.dataset.viewAsBound = '1';
                exitBtn.addEventListener('click', () => {
                    ViewAsBanner.exitViewAs().catch((err) => {
                        const msg =
                            err && err.message
                                ? err.message
                                : tViewAs('viewAsExitFailed');
                        if (window.CCPNotice && window.CCPNotice.show) {
                            window.CCPNotice.show(msg, {
                                type: 'error',
                                duration: 0,
                                dismissible: true,
                                force: true
                            });
                        } else {
                            alert(msg);
                        }
                    });
                });
            }
        }
        banner.hidden = false;
        document.documentElement.classList.add('view-as-active');
        const baseTitle = document.title.replace(/^View as: [^—]+ — /, '');
        document.title = tViewAs('viewAsDocTitle', { name: targetName }) + ' — ' + baseTitle;
        syncRolePalette(user);
    }

    async function exitViewAs() {
        const token = getViewAsToken();
        if (!token) {
            clearViewAsToken();
            try {
                window.close();
            } catch (_) {
                /* ignore */
            }
            return;
        }
        await fetch('/api/admin/view-as/exit', {
            method: 'POST',
            credentials: 'same-origin',
            headers: authFetchHeaders({ 'Content-Type': 'application/json' })
        });
        clearViewAsToken();
        if (typeof window.clearViewAsSessionDayNotes === 'function') {
            window.clearViewAsSessionDayNotes();
        }
        if (typeof TeamAuth !== 'undefined' && TeamAuth.stopIdleWatch) {
            TeamAuth.stopIdleWatch();
        }
        try {
            window.close();
        } catch (_) {
            /* ignore */
        }
        setTimeout(() => {
            document.body.innerHTML =
                '<p style="font-family:sans-serif;padding:2rem;">' +
                tViewAs('viewAsEnded') +
                '</p>';
        }, 300);
    }

    function onLanguageChanged() {
        if (typeof global.CCPViewAsI18n !== 'undefined' && global.CCPViewAsI18n.applyViewAsBannerLanguage) {
            global.CCPViewAsI18n.applyViewAsBannerLanguage();
        }
        if (lastBannerUser) {
            renderViewAsBanner(lastBannerUser);
        }
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('calendarLanguageChanged', onLanguageChanged);
        document.addEventListener('adminLanguageChanged', onLanguageChanged);
    }

    const ViewAsBanner = {
        VIEW_AS_STORAGE_KEY,
        VIEW_AS_HEADER,
        getViewAsToken,
        storeViewAsToken,
        clearViewAsToken,
        authFetchHeaders,
        activateViewAsFromUrl,
        renderViewAsBanner,
        exitViewAs,
        viewAsTargetLabel
    };

    global.ViewAsBanner = ViewAsBanner;
})(typeof window !== 'undefined' ? window : globalThis);
