/**
 * The local Notes board saves each post through serializeDataBlob.
 * Run: node tests/calendar-storage-export.test.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const storage = require('../server/calendar-storage.js');

assert.equal(typeof storage.serializeDataBlob, 'function');
const blob = storage.serializeDataBlob('post-1', 'What happened in class');
const back = storage.parseDataObjectFromRow(
    {
        id: 'post-1',
        data: blob.data,
        dataEncVersion: blob.dataEncVersion,
        dataKeyWrapped: blob.dataKeyWrapped
    },
    'post-1'
);
assert.equal(back, 'What happened in class');
console.log('calendar-storage-export.test.mjs: all passed');
