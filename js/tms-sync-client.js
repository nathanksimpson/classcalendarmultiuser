/**
 * One TMS transport for every sync screen.
 * Same-origin pages talk to this PC's bridge. The live site probes a local helper,
 * then falls back to /api/tms/run/:kind.
 */
(function (global) {
    'use strict';

    const HELPER_PORTS = [8765, 8080];
    const HELPER_HOSTS = ['127.0.0.1', 'localhost'];
    // Probe order: http://127.0.0.1:8765, then http://127.0.0.1:8080, then the same ports on localhost.
    const PING_TIMEOUT_MS = 2500;
    const DEFAULT_RUN_TIMEOUT_MS = 120000;
    const USERNAME_KEY = 'ccp.tmsRosterUsername';
    const LAST_SYNC_KEY = 'ccp.tmsLastSync';
    const MIN_PROTOCOL = 2;
    /** Default age after which Sync Center shows a “sync overdue” nudge (24h). */
    const STALE_SYNC_MS = 24 * 60 * 60 * 1000;

    const listeners = [];
    let bridgeState = {
        checked: false,
        status: 'missing',
        base: '',
        protocol: 0,
        version: '',
        kinds: [],
        bridgeKind: ''
    };

    function notify() {
        listeners.forEach((fn) => {
            try {
                fn(bridgeState);
            } catch (_) {
                /* listener */
            }
        });
    }

    function setState(next) {
        bridgeState = Object.assign({ checked: true }, next);
        notify();
        return bridgeState;
    }

    function pingOnce(url) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), PING_TIMEOUT_MS) : null;
        return fetch(url, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            targetAddressSpace: 'loopback',
            signal: controller ? controller.signal : undefined
        }).finally(() => {
            if (timer) {
                clearTimeout(timer);
            }
        });
    }

    /** The Sync Helper only runs on a Windows or Mac computer, so phones and
     *  tablets skip the four local pings (each one waits for a timeout there). */
    function isMobileDevice() {
        try {
            const nav = global.navigator || {};
            const ua = String(nav.userAgent || '');
            if (/iPhone|iPad|iPod|Android/i.test(ua)) {
                return true;
            }
            // iPadOS reports itself as a Mac; a Mac has no touch screen.
            return /Macintosh/i.test(ua) && Number(nav.maxTouchPoints) > 1;
        } catch (_) {
            return false;
        }
    }

    async function detectBridge() {
        if (isMobileDevice()) {
            return applyManifest({
                status: 'missing',
                base: '',
                protocol: 0,
                version: '',
                kinds: [],
                bridgeKind: ''
            });
        }
        let outdated = null;
        for (let p = 0; p < HELPER_PORTS.length; p += 1) {
            const port = HELPER_PORTS[p];
            for (let h = 0; h < HELPER_HOSTS.length; h += 1) {
                const host = HELPER_HOSTS[h];
                const base = 'http://' + host + ':' + port;
                try {
                    const res = await pingOnce(base + '/api/tms/bridge/ping');
                    if (!res.ok) {
                        continue;
                    }
                    const body = await res.json().catch(() => null);
                    if (!body || body.ok !== true || body.bridge !== true) {
                        continue;
                    }
                    const protocol = Number(body.protocol);
                    if (Number.isFinite(protocol) && protocol < MIN_PROTOCOL) {
                        outdated = {
                            status: 'outdated',
                            base: base,
                            protocol: protocol,
                            version: body.version || '',
                            kinds: Array.isArray(body.kinds) ? body.kinds : [],
                            bridgeKind: body.kind || ''
                        };
                        continue;
                    }
                    if (body.protocol == null) {
                        outdated = outdated || {
                            status: 'outdated',
                            base: base,
                            protocol: 0,
                            version: body.version || '',
                            kinds: [],
                            bridgeKind: body.kind || ''
                        };
                        continue;
                    }
                    return applyManifest({
                        status: 'ready',
                        base: base,
                        protocol: protocol,
                        version: body.version || '',
                        kinds: Array.isArray(body.kinds) ? body.kinds : [],
                        selfUpdate: body.selfUpdate === true,
                        bridgeKind: body.kind || ''
                    });
                } catch (_) {
                    /* next host */
                }
            }
        }
        if (outdated) {
            return applyManifest(outdated);
        }
        return applyManifest({
            status: 'missing',
            base: '',
            protocol: 0,
            version: '',
            kinds: [],
            bridgeKind: ''
        });
    }

    function versionLess(left, right) {
        const a = String(left || '0').split('.');
        const b = String(right || '0').split('.');
        const n = Math.max(a.length, b.length);
        for (let i = 0; i < n; i += 1) {
            const da = parseInt(a[i], 10) || 0;
            const db = parseInt(b[i], 10) || 0;
            if (da < db) {
                return true;
            }
            if (da > db) {
                return false;
            }
        }
        return false;
    }

    async function applyManifest(state) {
        let manifest = null;
        try {
            const res = await fetch('/downloads/helper-manifest.json', { credentials: 'same-origin' });
            if (res.ok) {
                manifest = await res.json();
            }
        } catch (_) {
            manifest = null;
        }
        const next = Object.assign({}, state, {
            downloadUrl: manifest && manifest.url ? String(manifest.url) : ''
        });
        if (
            next.bridgeKind === 'helper' &&
            next.status === 'ready' &&
            manifest &&
            manifest.version &&
            versionLess(next.version, manifest.version)
        ) {
            next.status = 'outdated';
        }
        return setState(next);
    }

    function runUrl(kind) {
        const encoded = encodeURIComponent(kind);
        if (bridgeState.status === 'same-origin') {
            return { url: '/api/tms/bridge/run/' + encoded, bridge: false, sameOrigin: true };
        }
        if (bridgeState.status === 'ready' && bridgeState.base) {
            return { url: bridgeState.base + '/api/tms/bridge/run/' + encoded, bridge: true, sameOrigin: false };
        }
        return { url: '/api/tms/run/' + encoded, bridge: false, sameOrigin: true };
    }

    function fail(message, code, status) {
        const err = new Error(message || 'TMS sync failed');
        err.code = code || '';
        if (status != null) {
            err.status = status;
        }
        return err;
    }

    async function run(kind, payload, opts) {
        const options = opts || {};
        if (!bridgeState.checked || options.forceDetect) {
            await detectBridge();
        }
        if (bridgeState.status === 'outdated') {
            throw fail(
                'Update the local ClassManager (restart npm start).',
                'TMS_BRIDGE_OUTDATED',
                0
            );
        }
        const target = runUrl(kind);
        const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_RUN_TIMEOUT_MS;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        if (options.signal && controller) {
            if (options.signal.aborted) {
                controller.abort();
            } else {
                options.signal.addEventListener('abort', () => controller.abort(), { once: true });
            }
        }
        const init = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload && typeof payload === 'object' ? payload : {}),
            signal: controller ? controller.signal : undefined
        };
        if (target.bridge) {
            init.mode = 'cors';
            init.credentials = 'omit';
            init.targetAddressSpace = 'loopback';
        } else {
            init.credentials = 'same-origin';
        }
        let res;
        try {
            res = await fetch(target.url, init);
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
        const contentType = String(res.headers.get('content-type') || '').toLowerCase();
        const body = contentType.includes('application/json') ? await res.json().catch(() => null) : null;
        if (!res.ok) {
            const err = fail(
                (body && body.error) || 'TMS sync failed',
                (body && body.code) || '',
                res.status
            );
            if (isSignInError(err)) {
                forgetSessionCredentials();
            }
            throw err;
        }
        if (!body || typeof body !== 'object') {
            throw fail('TMS sync failed', 'TMS_SCRAPE_FAILED', res.status);
        }
        // A sign-in TMS accepted is reused by every other TMS screen in this tab (see runWithSignIn).
        rememberSessionCredentials(payload);
        recordLastSync(kind);
        return body;
    }

    function onBridgeChange(fn) {
        if (typeof fn === 'function') {
            listeners.push(fn);
        }
        return function unsubscribe() {
            const idx = listeners.indexOf(fn);
            if (idx >= 0) {
                listeners.splice(idx, 1);
            }
        };
    }

    function getSavedUsername() {
        try {
            return String(localStorage.getItem(USERNAME_KEY) || '').trim();
        } catch (_) {
            return '';
        }
    }

    function setSavedUsername(username, remember) {
        try {
            const name = String(username || '').trim();
            if (remember && name) {
                localStorage.setItem(USERNAME_KEY, name);
            } else if (!remember) {
                localStorage.removeItem(USERNAME_KEY);
            }
        } catch (_) {
            /* ignore */
        }
    }

    function getLastSync() {
        try {
            const raw = localStorage.getItem(LAST_SYNC_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    function recordLastSync(kind) {
        const map = getLastSync();
        map[kind] = new Date().toISOString();
        try {
            localStorage.setItem(LAST_SYNC_KEY, JSON.stringify(map));
        } catch (_) {
            /* ignore */
        }
    }

    /**
     * True when no sync has been recorded, or the newest kind timestamp is older
     * than maxAgeMs (default 24h).
     */
    function isLastSyncStale(maxAgeMs) {
        const limit = Number.isFinite(Number(maxAgeMs)) && Number(maxAgeMs) > 0
            ? Number(maxAgeMs)
            : STALE_SYNC_MS;
        const map = getLastSync();
        const times = Object.keys(map)
            .map((k) => Date.parse(map[k]))
            .filter((n) => Number.isFinite(n));
        if (!times.length) {
            return true;
        }
        const newest = Math.max.apply(null, times);
        return Date.now() - newest > limit;
    }

    function isBridgeReady(state) {
        const s = state || bridgeState;
        return Boolean(s && (s.status === 'ready' || s.status === 'same-origin'));
    }

    function estimateSyncMinutes(studentCount) {
        const secondsPerStudent = 4;
        const count = Math.max(1, Number(studentCount) || 1);
        return Math.max(2, Math.ceil((count * secondsPerStudent) / 60));
    }

    function getBridgeState() {
        return bridgeState;
    }

    function helperListenPort(state) {
        try {
            return String(new URL(state && state.base ? state.base : '').port || '');
        } catch (_) {
            return '';
        }
    }

    async function stopHelper() {
        const state = bridgeState;
        if (!state || state.bridgeKind !== 'helper' || !state.base) {
            return false;
        }
        const port = helperListenPort(state);
        if (!port || port === '8080') {
            return false;
        }
        try {
            const res = await fetch(state.base + '/api/helper/stop', {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                targetAddressSpace: 'loopback',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            });
            return res.ok;
        } catch (_) {
            return false;
        }
    }

    /** Ask the running helper to download and install the newest version, then wait for it to come back. */
    async function updateHelper() {
        const state = bridgeState;
        if (!state || state.bridgeKind !== 'helper' || !state.base) {
            return { ok: false, reason: 'no-helper' };
        }
        if (!state.selfUpdate) {
            return { ok: false, reason: 'unsupported' };
        }
        const before = state.version;
        try {
            const res = await fetch(state.base + '/api/helper/update', {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                targetAddressSpace: 'loopback',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                return { ok: false, reason: 'failed', error: body.error || ('HTTP ' + res.status) };
            }
            if (!body.updated) {
                return { ok: true, updated: false };
            }
        } catch (_) {
            /* the helper may drop the connection as it restarts */
        }
        for (let i = 0; i < 30; i += 1) {
            await new Promise((r) => setTimeout(r, 2000));
            const next = await detectBridge();
            if (next && next.status === 'ready' && next.version && next.version !== before) {
                return { ok: true, updated: true, version: next.version };
            }
        }
        return { ok: false, reason: 'timeout' };
    }

    // ---- One TMS sign-in, one error wording, one timetable pull for every screen ----------

    /** Reuse a timetable pull this long (Planner, Generate subjects and the term wizard share it). */
    const SCHEDULE_REUSE_MS = 60 * 60 * 1000;
    /** The last TMS sign-in that worked, for this open tab only. Never written to storage. */
    let sessionCreds = null;
    let lastSchedulePull = null;

    function tr(key, fallback) {
        try {
            if (typeof global.t === 'function') {
                const val = global.t(key);
                if (val && val !== key) {
                    return val;
                }
            }
        } catch (_) {
            /* ignore */
        }
        return fallback || key;
    }

    function getSessionCredentials() {
        return sessionCreds ? { username: sessionCreds.username, password: sessionCreds.password } : null;
    }

    function rememberSessionCredentials(creds) {
        const username = String((creds && creds.username) || '').trim();
        const password = String((creds && creds.password) || '');
        if (username && password) {
            sessionCreds = { username, password };
        }
    }

    function forgetSessionCredentials() {
        sessionCreds = null;
    }

    /**
     * The TMS sign-in for a tab's Sync button: what is typed in the Sync Center, else this tab's last
     * sign-in TMS accepted, else just the remembered username.
     */
    function currentCredentials() {
        const center = global.CCPTmsSyncCenter;
        if (center && typeof center.getCredentials === 'function') {
            return center.getCredentials();
        }
        const saved = getSavedUsername();
        const session = getSessionCredentials();
        return {
            username: session ? session.username : saved,
            password: session ? session.password : '',
            rememberUser: Boolean(saved)
        };
    }

    /** currentCredentials(), also keeping (or forgetting) the username on this computer as ticked. */
    function credentialsForSync() {
        const creds = currentCredentials();
        setSavedUsername(creds.username, creds.rememberUser);
        return creds;
    }

    /** True when TMS refused the sign-in (or none was given), so asking again can help. */
    function isSignInError(err) {
        const code = err && err.code;
        return code === 'TMS_CREDS_MISSING' || code === 'TMS_LOGIN_FAILED' || Boolean(err && err.status === 401);
    }

    function isHelperMissingError(err) {
        const code = err && err.code;
        return (
            code === 'TMS_HELPER_MISSING' ||
            code === 'TMS_BRIDGE_REQUIRED' ||
            Boolean(err && /failed to fetch|networkerror|load failed/i.test(String(err.message || '')))
        );
    }

    /** The same message for the same TMS problem on every screen. */
    function errorText(err, fallback) {
        const code = err && err.code;
        if (code === 'TMS_CREDS_MISSING') {
            return tr('cohortsGenTmsNeedLogin', 'Enter your TMS username and password.');
        }
        if (code === 'TMS_LOGIN_FAILED' || (err && err.status === 401)) {
            return tr('cohortsGenTmsLoginFailed', 'Could not sign in to TMS. Check the username and password.');
        }
        if (code === 'TMS_BRIDGE_OUTDATED') {
            return tr('tmsSyncOutdatedHint', 'Update the local ClassManager (restart npm start).');
        }
        if (isHelperMissingError(err)) {
            return tr('tmsHelperNotRunning', 'The Sync Helper is not running on this computer. Open Sync from TMS to set it up.');
        }
        return (err && err.message) || fallback || 'TMS sync failed';
    }

    function escapeText(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * The one TMS sign-in popup. Resolves to { username, password } or null when cancelled.
     * The username can be remembered on this computer; the password is only kept for this tab.
     * @param {{ title?: string, hint?: string, note?: string, problem?: string, submitLabel?: string }} [opts]
     */
    function askSignIn(opts) {
        const o = opts || {};
        if (typeof document === 'undefined' || !document.body) {
            return Promise.resolve(null);
        }
        return new Promise((resolve) => {
            const saved = getSavedUsername();
            const start = (sessionCreds && sessionCreds.username) || saved;
            const overlay = document.createElement('div');
            overlay.className = 'sp-overlay sp-overlay--confirm tms-signin-overlay';
            overlay.innerHTML = `
                <form class="sp-dialog sp-dialog--pop tms-signin-dialog" role="dialog" aria-modal="true" aria-labelledby="tmsSignInTitle" autocomplete="on">
                    <header class="sp-dialog-head">
                        <h2 id="tmsSignInTitle">${escapeText(o.title || tr('cohortsGenTmsLoginTitle', 'Sign in to TMS'))}</h2>
                        <button type="button" class="modal-close" data-tms-cancel aria-label="${escapeText(tr('closeAria', 'Close'))}">&times;</button>
                    </header>
                    <div class="sp-dialog-body">
                        ${o.hint ? `<p class="sp-hint">${escapeText(o.hint)}</p>` : ''}
                        <p class="sp-hint sp-auto-error" role="alert" data-tms-problem ${o.problem ? '' : 'hidden'}>${escapeText(o.problem || '')}</p>
                        <label class="sp-field"><span>${escapeText(tr('rosterTmsUsernameLabel', 'TMS username'))}</span>
                            <input type="text" class="field-input" data-tms-user autocomplete="username" spellcheck="false" value="${escapeText(start)}"></label>
                        <label class="sp-field"><span>${escapeText(tr('rosterTmsPasswordLabel', 'TMS password'))}</span>
                            <input type="password" class="field-input" data-tms-pass autocomplete="current-password"></label>
                        <label class="checkbox-label"><input type="checkbox" data-tms-remember ${saved ? 'checked' : ''}> <span>${escapeText(tr('spTmsRemember', 'Remember my username on this computer'))}</span></label>
                        ${o.note ? `<p class="sp-hint">${escapeText(o.note)}</p>` : ''}
                    </div>
                    <footer class="sp-dialog-foot">
                        <button type="button" class="btn btn-outline btn-small" data-tms-cancel>${escapeText(tr('spCancel', 'Cancel'))}</button>
                        <button type="submit" class="btn btn-primary btn-small">${escapeText(o.submitLabel || tr('cohortsGenTmsSignIn', 'Sign in'))}</button>
                    </footer>
                </form>`;
            const form = overlay.querySelector('form');
            const user = overlay.querySelector('[data-tms-user]');
            const pass = overlay.querySelector('[data-tms-pass]');
            const remember = overlay.querySelector('[data-tms-remember]');
            const done = (val) => {
                pass.value = '';
                document.removeEventListener('keydown', onKey, true);
                overlay.remove();
                resolve(val);
            };
            function onKey(ev) {
                if (ev.key === 'Escape') {
                    ev.stopPropagation();
                    done(null);
                }
            }
            form.addEventListener('submit', (ev) => {
                ev.preventDefault();
                const username = String(user.value || '').trim();
                setSavedUsername(username, remember.checked);
                done({ username, password: String(pass.value || '') });
            });
            overlay.addEventListener('click', (ev) => {
                if (ev.target === overlay || ev.target.closest('[data-tms-cancel]')) {
                    done(null);
                }
            });
            document.addEventListener('keydown', onKey, true);
            document.body.appendChild(overlay);
            (user.value ? pass : user).focus();
        });
    }

    /**
     * Run a TMS job with the tab's sign-in, asking only when there is none yet or TMS refuses it.
     * Resolves to the job's body, or null when the person cancels the sign-in.
     * Other failures are thrown (use errorText for the message).
     * @param {string} kind
     * @param {object} [payload]
     * @param {{ timeoutMs?: number, signIn?: object, onSignedIn?: function }} [opts]
     */
    async function runWithSignIn(kind, payload, opts) {
        const o = opts || {};
        let problem = '';
        let creds = getSessionCredentials();
        for (;;) {
            if (!creds) {
                creds = await askSignIn(Object.assign({}, o.signIn || {}, { problem }));
                if (!creds) {
                    return null;
                }
            }
            if (typeof o.onSignedIn === 'function') {
                o.onSignedIn();
            }
            const body = Object.assign({}, payload || {});
            if (creds.username || creds.password) {
                body.username = creds.username;
                body.password = creds.password;
            }
            try {
                return await run(kind, body, { timeoutMs: o.timeoutMs });
            } catch (err) {
                if (!isSignInError(err)) {
                    throw err;
                }
                problem = errorText(err);
                creds = null;
            }
        }
    }

    /** The last timetable pull, when it is recent enough to reuse (null otherwise). */
    function recentSchedule(maxAgeMs) {
        const age = Number(maxAgeMs) >= 0 ? Number(maxAgeMs) : SCHEDULE_REUSE_MS;
        const last = lastSchedulePull;
        if (last && last.body && Array.isArray(last.body.placements) && Date.now() - last.at < age) {
            return last.body;
        }
        return null;
    }

    function rememberSchedule(body) {
        if (body && Array.isArray(body.placements)) {
            lastSchedulePull = { at: Date.now(), body };
        }
    }

    /**
     * Every teacher's timetable from TMS (read-only). One function for the Planner, Generate subjects and the
     * term wizard: reuses a pull from the last hour unless opts.fresh, signs in once per tab.
     * @param {{ fresh?: boolean, credentials?: {username:string,password:string}, timeoutMs?: number,
     *   signIn?: object, onSignedIn?: function }} [opts]
     * @returns {Promise<{ body?: object, reused?: boolean, cancelled?: boolean }>} throws on other failures.
     */
    async function pullSchedule(opts) {
        const o = opts || {};
        if (!o.fresh) {
            const recent = recentSchedule();
            if (recent) {
                return { body: recent, reused: true };
            }
        }
        // No helper check here: run() uses the helper when there is one, else the server (which can read the
        // timetable itself, or answers TMS_BRIDGE_REQUIRED).
        let body;
        if (o.credentials) {
            const payload = {};
            const username = String(o.credentials.username || '').trim();
            const password = String(o.credentials.password || '');
            if (username || password) {
                payload.username = username;
                payload.password = password;
            }
            body = await run('schedule', payload, { timeoutMs: o.timeoutMs });
        } else {
            body = await runWithSignIn('schedule', {}, o);
            if (body === null) {
                return { cancelled: true };
            }
        }
        if (!body || !Array.isArray(body.placements)) {
            throw fail(tr('cohortsGenTmsFailed', 'Could not pull the timetables from TMS.'), 'TMS_SCRAPE_FAILED', 0);
        }
        rememberSchedule(body);
        return { body };
    }

    global.CCPTmsSync = {
        HELPER_PORTS: HELPER_PORTS,
        SCHEDULE_REUSE_MS: SCHEDULE_REUSE_MS,
        askSignIn: askSignIn,
        currentCredentials: currentCredentials,
        credentialsForSync: credentialsForSync,
        runWithSignIn: runWithSignIn,
        pullSchedule: pullSchedule,
        recentSchedule: recentSchedule,
        rememberSchedule: rememberSchedule,
        errorText: errorText,
        isSignInError: isSignInError,
        isHelperMissingError: isHelperMissingError,
        getSessionCredentials: getSessionCredentials,
        rememberSessionCredentials: rememberSessionCredentials,
        forgetSessionCredentials: forgetSessionCredentials,
        STALE_SYNC_MS: STALE_SYNC_MS,
        detectBridge: detectBridge,
        stopHelper: stopHelper,
        updateHelper: updateHelper,
        run: run,
        onBridgeChange: onBridgeChange,
        getSavedUsername: getSavedUsername,
        setSavedUsername: setSavedUsername,
        getLastSync: getLastSync,
        recordLastSync: recordLastSync,
        isLastSyncStale: isLastSyncStale,
        isBridgeReady: isBridgeReady,
        estimateSyncMinutes: estimateSyncMinutes,
        getBridgeState: getBridgeState
    };
})(typeof window !== 'undefined' ? window : globalThis);
