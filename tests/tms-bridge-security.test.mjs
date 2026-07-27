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

console.log('tms-bridge-security.test.mjs: ok');
