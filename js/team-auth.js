/**
 * Session check for team server — redirects to login when required.
 */
(function (global) {
    let currentUser = null;
    let checked = false;

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

        async ensure() {
            if (checked) {
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
                if (!healthJson.kakaoConfigured && !healthJson.auth) {
                    checked = true;
                    return null;
                }
            } catch (_) {
                checked = true;
                return null;
            }

            currentUser = await fetchMe();
            checked = true;
            if (!currentUser) {
                const ret = encodeURIComponent(location.pathname + location.search);
                location.replace('/login.html?return=' + ret);
                throw new Error('redirect');
            }
            return currentUser;
        },

        async refresh() {
            currentUser = await fetchMe();
            return currentUser;
        },

        async logout() {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
            currentUser = null;
            location.href = '/login.html';
        }
    };

    global.TeamAuth = TeamAuth;
})(typeof window !== 'undefined' ? window : globalThis);
