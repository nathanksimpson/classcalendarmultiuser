import { createRequire } from 'module';
import assert from 'assert';

const require = createRequire(import.meta.url);
const {
    isLoopbackAddress,
    isLoopbackRequest,
    tmsBridgeAllowedOrigin
} = require('../server/tms-bridge-security');

assert.strictEqual(isLoopbackAddress('127.0.0.1'), true);
assert.strictEqual(isLoopbackAddress('::1'), true);
assert.strictEqual(isLoopbackAddress('::ffff:127.0.0.1'), true);
assert.strictEqual(isLoopbackAddress('192.168.1.10'), false);
assert.strictEqual(isLoopbackAddress('10.0.0.5'), false);

assert.strictEqual(
    isLoopbackRequest({ socket: { remoteAddress: '127.0.0.1' } }),
    true
);
assert.strictEqual(
    isLoopbackRequest({ socket: { remoteAddress: '192.168.0.20' } }),
    false,
    'LAN peer must not pass loopback check'
);

assert.strictEqual(tmsBridgeAllowedOrigin('https://classmanager.live'), 'https://classmanager.live');
assert.strictEqual(tmsBridgeAllowedOrigin('https://evil.example'), '');
assert.ok(tmsBridgeAllowedOrigin('http://localhost:9999'));

const helper = { mode: 'helper' };
assert.strictEqual(tmsBridgeAllowedOrigin('https://classmanager.live', helper), 'https://classmanager.live');
assert.strictEqual(
    tmsBridgeAllowedOrigin('https://www.classmanager.live', helper),
    'https://www.classmanager.live'
);
assert.strictEqual(
    tmsBridgeAllowedOrigin('https://classcalendarmultiuser.nathanksimpson.workers.dev', helper),
    'https://classcalendarmultiuser.nathanksimpson.workers.dev'
);
assert.strictEqual(tmsBridgeAllowedOrigin('http://localhost:9999', helper), 'http://localhost:9999');
assert.strictEqual(tmsBridgeAllowedOrigin('http://127.0.0.1:8080', helper), 'http://127.0.0.1:8080');
assert.strictEqual(tmsBridgeAllowedOrigin('https://localhost:8443', helper), 'https://localhost:8443');
assert.strictEqual(tmsBridgeAllowedOrigin('https://127.0.0.1:443', helper), 'https://127.0.0.1:443');
assert.strictEqual(tmsBridgeAllowedOrigin('https://evil.example', helper), '');

console.log('tms-bridge-security.test.mjs: ok');
