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

    async function detectBridge() {
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
            throw fail(
                (body && body.error) || 'TMS sync failed',
                (body && body.code) || '',
                res.status
            );
        }
        if (!body || typeof body !== 'object') {
            throw fail('TMS sync failed', 'TMS_SCRAPE_FAILED', res.status);
        }
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

    global.CCPTmsSync = {
        HELPER_PORTS: HELPER_PORTS,
        detectBridge: detectBridge,
        stopHelper: stopHelper,
        run: run,
        onBridgeChange: onBridgeChange,
        getSavedUsername: getSavedUsername,
        setSavedUsername: setSavedUsername,
        getLastSync: getLastSync,
        estimateSyncMinutes: estimateSyncMinutes,
        getBridgeState: getBridgeState
    };
})(typeof window !== 'undefined' ? window : globalThis);
