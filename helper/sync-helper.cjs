'use strict';
/**
 * ClassManager Sync Helper — localhost-only TMS bridge for https://classmanager.live
 * No Express, no database, no .env. Teachers run the packaged .exe.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');
const crypto = require('node:crypto');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { runTmsJob, JOB_KINDS, BRIDGE_PROTOCOL } = require('../shared/tms-jobs.cjs');
const { isLoopbackAddress, tmsBridgeAllowedOrigin } = require('../server/tms-bridge-security.js');

const VERSION = '1.1.0';
const PORT = Number(process.env.CCP_HELPER_PORT || 8765);
const HOST = '127.0.0.1';
const MAX_BODY = 5 * 1024 * 1024;
const ORIGIN_MODE = { mode: 'helper' };

installHelperCas();

const MANIFEST_URL = 'https://classmanager.live/downloads/helper-manifest.json';
const INSTALLER_PREFIX = 'https://github.com/nathanksimpson/classcalendarmultiuser/releases/download/';

function versionParts(v) {
    return String(v || '').split('.').map((n) => parseInt(n, 10) || 0);
}

function versionLessThan(a, b) {
    const x = versionParts(a);
    const y = versionParts(b);
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
        if ((x[i] || 0) !== (y[i] || 0)) {
            return (x[i] || 0) < (y[i] || 0);
        }
    }
    return false;
}

/** One-click self-update: download the newest installer, check its SHA-256, run it silently. */
async function selfUpdate() {
    if (process.platform !== 'win32') {
        const e = new Error('Self-update is only available on Windows');
        e.code = 'HELPER_UPDATE_UNSUPPORTED';
        throw e;
    }
    const mres = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!mres.ok) {
        throw new Error('Could not read the update manifest (HTTP ' + mres.status + ')');
    }
    const manifest = await mres.json();
    const url = String(manifest.url || '');
    const sha = String(manifest.sha256 || '').toLowerCase();
    if (!url.startsWith(INSTALLER_PREFIX) || !/^[0-9a-f]{64}$/.test(sha)) {
        throw new Error('Update manifest is not valid');
    }
    if (!versionLessThan(VERSION, manifest.version)) {
        return { updated: false, version: VERSION, latest: manifest.version };
    }
    const ires = await fetch(url);
    if (!ires.ok) {
        throw new Error('Could not download the installer (HTTP ' + ires.status + ')');
    }
    const buf = Buffer.from(await ires.arrayBuffer());
    const got = crypto.createHash('sha256').update(buf).digest('hex');
    if (got !== sha) {
        throw new Error('Installer checksum did not match; update cancelled');
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmsync-'));
    const file = path.join(dir, 'ClassManagerSyncSetup.exe');
    fs.writeFileSync(file, buf);
    // Wait for this process to exit, then install silently over it (the installer relaunches the helper).
    const cmd = 'ping -n 3 127.0.0.1 >nul & "' + file + '" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS';
    spawn('cmd.exe', ['/d', '/s', '/c', '"' + cmd + '"'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        windowsVerbatimArguments: true
    }).unref();
    return { updated: true, version: VERSION, latest: manifest.version };
}

function installHelperCas() {
    if (typeof tls.setDefaultCACertificates !== 'function' || typeof tls.getCACertificates !== 'function') {
        return;
    }
    const extras = [];
    const pemPath = path.join(__dirname, 'certs', 'tms-intermediate.pem');
    try {
        if (fs.existsSync(pemPath)) {
            extras.push(fs.readFileSync(pemPath));
        }
    } catch (_) {
        /* missing cert: fail closed, do not disable TLS checks */
    }
    let system = [];
    try {
        system = tls.getCACertificates('system') || [];
    } catch (_) {
        system = [];
    }
    try {
        tls.setDefaultCACertificates([...tls.getCACertificates(), ...system, ...extras]);
    } catch (_) {
        /* older Node */
    }
}

function cors(req, res) {
    const origin = tmsBridgeAllowedOrigin(req.headers.origin, ORIGIN_MODE);
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
        res.setHeader('Access-Control-Max-Age', '600');
    }
    return Boolean(origin);
}

function sendJson(res, status, obj) {
    const body = Buffer.from(JSON.stringify(obj), 'utf8');
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': String(body.length)
    });
    res.end(body);
}

function sendHtml(res, html) {
    const body = Buffer.from(html, 'utf8');
    res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': String(body.length)
    });
    res.end(body);
}

function statusPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>ClassManager Sync Helper</title></head>
<body>
<p>ClassManager Sync Helper is running.</p>
<p>Version ${VERSION}. Port ${PORT}.</p>
<p><a href="https://classmanager.live">Back to ClassManager</a></p>
</body>
</html>`;
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY) {
                reject(Object.assign(new Error('Body too large'), { status: 413, code: 'TMS_BODY_TOO_LARGE' }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (err) {
                reject(Object.assign(err, { status: 400, code: 'TMS_BAD_JSON' }));
            }
        });
        req.on('error', reject);
    });
}

function errorStatus(err) {
    const code = err && err.code;
    if (code === 'TMS_LOGIN_FAILED') {
        return 401;
    }
    if (code === 'TMS_CREDS_MISSING') {
        return (err && err.status) || 503;
    }
    if (code === 'TMS_UNKNOWN_KIND' || code === 'TMS_ESSAY_ROWS_MISSING' || code === 'TMS_BAD_JSON') {
        return (err && err.status) || 400;
    }
    if (code === 'TMS_BODY_TOO_LARGE') {
        return 413;
    }
    return 502;
}

function isLoopback(req) {
    return isLoopbackAddress(req.socket && req.socket.remoteAddress);
}

const server = http.createServer(async (req, res) => {
    if (!isLoopback(req)) {
        sendJson(res, 403, { error: 'TMS bridge is only available on localhost', code: 'TMS_BRIDGE_DENIED' });
        return;
    }
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathName = url.pathname;

    if (req.method === 'OPTIONS') {
        if (!cors(req, res)) {
            sendJson(res, 403, { error: 'Origin not allowed', code: 'TMS_BRIDGE_DENIED' });
            return;
        }
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && pathName === '/') {
        sendHtml(res, statusPage());
        return;
    }

    if (req.method === 'GET' && pathName === '/api/tms/bridge/ping') {
        if (!cors(req, res)) {
            sendJson(res, 403, { error: 'Origin not allowed', code: 'TMS_BRIDGE_DENIED' });
            return;
        }
        sendJson(res, 200, {
            ok: true,
            bridge: true,
            kind: 'helper',
            version: VERSION,
            protocol: BRIDGE_PROTOCOL,
            kinds: JOB_KINDS,
            selfUpdate: true,
            port: PORT
        });
        return;
    }

    if (req.method === 'POST' && pathName === '/api/helper/update') {
        if (!cors(req, res)) {
            sendJson(res, 403, { error: 'Origin not allowed', code: 'TMS_BRIDGE_DENIED' });
            return;
        }
        req.resume();
        try {
            const out = await selfUpdate();
            const body = Buffer.from(JSON.stringify(Object.assign({ ok: true }, out)), 'utf8');
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                'Content-Length': String(body.length)
            });
            res.end(body, () => {
                if (out.updated) {
                    setImmediate(() => process.exit(0));
                }
            });
        } catch (err) {
            sendJson(res, 500, { error: (err && err.message) || 'Update failed', code: (err && err.code) || 'HELPER_UPDATE_FAILED' });
        }
        return;
    }

    if (req.method === 'POST' && pathName === '/api/helper/stop') {
        if (!cors(req, res)) {
            sendJson(res, 403, { error: 'Origin not allowed', code: 'TMS_BRIDGE_DENIED' });
            return;
        }
        req.resume();
        const body = Buffer.from(JSON.stringify({ ok: true, stopping: true }), 'utf8');
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Length': String(body.length)
        });
        res.end(body, () => {
            setImmediate(() => process.exit(0));
        });
        return;
    }

    const runMatch = pathName.match(/^\/api\/tms\/bridge\/run\/([a-zA-Z]+)$/);
    if (runMatch && req.method === 'POST') {
        if (!cors(req, res)) {
            sendJson(res, 403, { error: 'Origin not allowed', code: 'TMS_BRIDGE_DENIED' });
            return;
        }
        try {
            const body = await readBody(req);
            const username = String((body && body.username) || '').trim();
            const password = String((body && body.password) || '');
            if (!username || !password) {
                sendJson(res, 503, {
                    error: 'TMS username and password are required',
                    code: 'TMS_CREDS_MISSING'
                });
                return;
            }
            const result = await runTmsJob(runMatch[1], body);
            sendJson(res, 200, result);
        } catch (err) {
            const status = errorStatus(err);
            if (status >= 500 && err && err.code !== 'TMS_CREDS_MISSING') {
                console.error('TMS sync failed');
            }
            sendJson(res, status, {
                error: (err && err.message) || 'TMS sync failed',
                code: (err && err.code) || 'TMS_SCRAPE_FAILED'
            });
        }
        return;
    }

    sendJson(res, 404, { error: 'Not found', code: 'TMS_NOT_FOUND' });
});

server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.log('ClassManager Sync Helper is already running.');
        process.exit(0);
    }
    console.error(err && err.message ? err.message : err);
    process.exit(1);
});

server.listen(PORT, HOST, () => {
    console.log('ClassManager Sync Helper ' + VERSION + ' on http://' + HOST + ':' + PORT);
});
