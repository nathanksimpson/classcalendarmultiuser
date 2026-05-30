/**
 * Shared /api fetch helper (window.CCPApi).
 */
(function (global) {
    const API_PREFIX = '/api';

    function redirectToLogin() {
        const ret = encodeURIComponent(global.location.pathname + global.location.search);
        global.location.replace('/login.html?return=' + ret);
    }

    function normalizePath(path) {
        if (!path) {
            return '/';
        }
        return path.startsWith('/') ? path : '/' + path;
    }

    async function apiFetch(path, options) {
        const opts = Object.assign({ credentials: 'same-origin' }, options || {});
        const skipSessionCheck = Boolean(opts.skipSessionCheck);
        const skipAuthRedirect = Boolean(opts.skipAuthRedirect);
        const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 0;

        if (
            !skipSessionCheck &&
            typeof global.TeamAuth !== 'undefined' &&
            global.TeamAuth.isSignedIn &&
            !global.TeamAuth.isSignedIn()
        ) {
            const err = new Error('Not signed in');
            err.status = 401;
            throw err;
        }

        const controller = timeoutMs > 0 && typeof AbortController !== 'undefined' ? new AbortController() : null;
        let timeoutId = null;
        if (controller) {
            timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        }

        const headers = Object.assign({}, opts.headers || {});
        if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(opts.body);
        }
        opts.headers = headers;

        let res;
        try {
            res = await fetch(
                API_PREFIX + normalizePath(path),
                Object.assign({}, opts, controller ? { signal: controller.signal } : {})
            );
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }

        let json = null;
        const text = await res.text();
        if (text) {
            try {
                json = JSON.parse(text);
            } catch (_) {
                json = { raw: text };
            }
        }

        if (res.status === 401 && !skipAuthRedirect) {
            redirectToLogin();
            const err = new Error((json && json.error) || 'Not signed in');
            err.status = 401;
            err.body = json;
            throw err;
        }

        if (!res.ok) {
            const err = new Error((json && json.error) || res.statusText || 'Request failed');
            err.status = res.status;
            err.body = json;
            throw err;
        }

        return json;
    }

    global.CCPApi = { API_PREFIX, apiFetch, redirectToLogin };
})(typeof window !== 'undefined' ? window : globalThis);
