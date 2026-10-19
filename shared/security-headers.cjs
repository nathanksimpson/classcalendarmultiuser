'use strict';
/**
 * Single source for HTTP security headers.
 * - Static assets: scripts/build-assets.mjs renders dist/_headers from this module.
 * - Worker-served pages (run_worker_first): worker/src/index.js withSecurityHeaders().
 * CSP is report-only until a clean week of production traffic; then rename the key to
 * Content-Security-Policy and move index.html inline on*= handlers into JS.
 */

const CSP_DIRECTIVES = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://cdn.sheetjs.com https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://unpkg.com",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "connect-src 'self' http://127.0.0.1:8765 http://127.0.0.1:8080 http://localhost:8765 http://localhost:8080 https://holidays.hyunbin.page https://generativelanguage.googleapis.com https://api.openai.com https://api.blerp.com https://r.jina.ai https://cf.opengrammer.eu.cc https://cdn.jsdelivr.net https://unpkg.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
];

const SECURITY_HEADERS = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    'Content-Security-Policy-Report-Only': CSP_DIRECTIVES.join('; ')
};

/** Extra path rules for dist/_headers (static assets only). */
const STATIC_PATH_RULES = [
    ['/soundboard/media/*', { 'Cache-Control': 'public, max-age=31536000, immutable' }],
    ['/soundboard/boards/*', { 'Cache-Control': 'public, max-age=3600' }]
];

function renderHeadersFile() {
    const block = (pattern, headers) =>
        [pattern, ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`)].join('\n');
    return [block('/*', SECURITY_HEADERS), ...STATIC_PATH_RULES.map(([p, h]) => block(p, h))].join('\n\n') + '\n';
}

module.exports = { SECURITY_HEADERS, STATIC_PATH_RULES, renderHeadersFile };
