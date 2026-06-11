/**
 * Run: node tests/blob-at-rest.test.mjs
 */
import { createRequire } from 'module';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const blobAtRest = require(path.join(root, 'crypto/blob-at-rest.js'));

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const masterKey = crypto.randomBytes(32).toString('base64');
const entityId = 'cal-test-001';
const sample = JSON.stringify({ schemaVersion: 3, calendarName: 'Test', classes: [] });

const enc = blobAtRest.encryptBlob(sample, entityId, masterKey);
assert(enc && enc.dataEncVersion === 1, 'encrypt returns v1');
assert(enc.data.startsWith('enc1$'), 'ciphertext prefix');
assert(enc.dataKeyWrapped.startsWith('w1$'), 'wrapped key prefix');
assert(!enc.data.includes('Test'), 'plaintext not visible in blob');

const row = {
    id: entityId,
    data: enc.data,
    data_enc_version: enc.dataEncVersion,
    data_key_wrapped: enc.dataKeyWrapped
};
assert(blobAtRest.isEncryptedRow(row), 'isEncryptedRow true for v1');
const plain = blobAtRest.decryptBlob(row, masterKey, entityId);
assert(plain === sample, 'round-trip decrypt');

const legacy = { id: entityId, data: sample, data_enc_version: 0 };
assert(!blobAtRest.isEncryptedRow(legacy), 'legacy row not encrypted');
assert(blobAtRest.decryptBlob(legacy, masterKey, entityId) === sample, 'legacy pass-through');

let wrongKeyFailed = false;
try {
    blobAtRest.decryptBlob(row, crypto.randomBytes(32).toString('base64'), entityId);
} catch (_) {
    wrongKeyFailed = true;
}
assert(wrongKeyFailed, 'wrong master key fails decrypt');

let wrongAadFailed = false;
try {
    blobAtRest.decryptBlob(row, masterKey, 'other-calendar-id');
} catch (_) {
    wrongAadFailed = true;
}
assert(wrongAadFailed, 'wrong entity id (AAD) fails decrypt');

let missingKeyFailed = false;
try {
    blobAtRest.decryptBlob(row, '', entityId);
} catch (err) {
    missingKeyFailed = err.message.includes('DATA_ENCRYPTION_MASTER_KEY');
}
assert(missingKeyFailed, 'encrypted row without key throws');

assert(blobAtRest.encryptBlob(sample, entityId, '') === null, 'no key returns null encrypt');

console.log('blob-at-rest.test.mjs: all passed');
