/**
 * View As mode — tab-scoped session token and banner UI.
 */
(function (global) {
    const VIEW_AS_STORAGE_KEY = 'cal_view_as_session';
    const VIEW_AS_HEADER = 'X-View-As-Session';

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
            throw new Error((json && json.error) || 'View As activation failed');
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
            return 'User';
        }
        if (user.viewAs && user.viewAs.targetDisplayName) {
            return user.viewAs.targetDisplayName;
        }
        return user.displayName || user.email || 'User';
    }

    function syncRolePalette(user) {
        if (typeof TeamAuth !== 'undefined' && TeamAuth.applyRolePalette) {
            TeamAuth.applyRolePalette(user);
        }
    }

    function renderViewAsBanner(user) {
        if (typeof document === 'undefined') {
            return;
        }
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
            (user.viewAs && user.viewAs.actorDisplayName) || 'Super Admin';
        const primary = document.getElementById('viewAsBannerPrimary');
        const secondary = document.getElementById('viewAsBannerSecondary');
        const exitBtn = document.getElementById('viewAsBannerExitBtn');
        if (primary) {
            primary.textContent = 'Viewing as: ' + targetName;
        }
        if (secondary) {
            secondary.textContent =
                'Super Admin: ' + actorName + ' · Changes are not saved';
        }
        if (exitBtn && !exitBtn.dataset.viewAsBound) {
            exitBtn.dataset.viewAsBound = '1';
            exitBtn.addEventListener('click', () => {
                ViewAsBanner.exitViewAs().catch((err) => {
                    alert(err && err.message ? err.message : 'Could not exit View As');
                });
            });
        }
        banner.hidden = false;
        document.documentElement.classList.add('view-as-active');
        const baseTitle = document.title.replace(/^View as: [^—]+ — /, '');
        document.title = 'View as: ' + targetName + ' — ' + baseTitle;
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
                '<p style="font-family:sans-serif;padding:2rem;">View As ended. You can close this tab.</p>';
        }, 300);
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
