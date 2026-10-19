/**
 * Localhost-only TMS bridge guards (live site → npm start on work PC).
 */
'use strict';

const TMS_BRIDGE_CORS_ORIGINS = new Set([
    'https://classmanager.live',
    'https://www.classmanager.live',
    'http://localhost:8080',
    'http://127.0.0.1:8080'
]);

/** Live sites, plus any http(s) localhost / 127.0.0.1 port (see isLocalWebOrigin). */
const TMS_HELPER_CORS_ORIGINS = new Set([
    'https://classmanager.live',
    'https://www.classmanager.live',
    'https://classcalendarmultiuser.nathanksimpson.workers.dev'
]);

function isLoopbackAddress(addr) {
    const raw = String(addr || '').trim().toLowerCase();
    if (!raw) {
        return false;
    }
    if (raw === '127.0.0.1' || raw === '::1' || raw === 'localhost') {
        return true;
    }
    if (raw.startsWith('::ffff:') && raw.slice(7) === '127.0.0.1') {
        return true;
    }
    return false;
}

function isLoopbackRequest(req) {
    const candidates = [
        req && req.socket && req.socket.remoteAddress,
        req && req.connection && req.connection.remoteAddress
    ];
    return candidates.some((a) => isLoopbackAddress(a));
}

function isLocalWebOrigin(origin) {
    try {
        const u = new URL(origin);
        return (
            (u.protocol === 'http:' || u.protocol === 'https:') &&
            (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
        );
    } catch (_) {
        return false;
    }
}

function tmsBridgeAllowedOrigin(origin, options) {
    const o = String(origin || '')
        .trim()
        .replace(/\/$/, '');
    if (!o) {
        return '';
    }
    const mode = options && options.mode;
    if (mode === 'helper') {
        if (TMS_HELPER_CORS_ORIGINS.has(o) || isLocalWebOrigin(o)) {
            return o;
        }
        return '';
    }
    if (TMS_BRIDGE_CORS_ORIGINS.has(o) || isLocalWebOrigin(o)) {
        return o;
    }
    return '';
}

module.exports = {
    TMS_BRIDGE_CORS_ORIGINS,
    TMS_HELPER_CORS_ORIGINS,
    isLoopbackAddress,
    isLoopbackRequest,
    tmsBridgeAllowedOrigin
};
