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

function tmsBridgeAllowedOrigin(origin) {
    const o = String(origin || '')
        .trim()
        .replace(/\/$/, '');
    if (!o) {
        return '';
    }
    if (TMS_BRIDGE_CORS_ORIGINS.has(o)) {
        return o;
    }
    try {
        const u = new URL(o);
        if (
            (u.hostname === 'localhost' || u.hostname === '127.0.0.1') &&
            (u.protocol === 'http:' || u.protocol === 'https:')
        ) {
            return o;
        }
    } catch (_) {
        /* ignore */
    }
    return '';
}

module.exports = {
    TMS_BRIDGE_CORS_ORIGINS,
    isLoopbackAddress,
    isLoopbackRequest,
    tmsBridgeAllowedOrigin
};
