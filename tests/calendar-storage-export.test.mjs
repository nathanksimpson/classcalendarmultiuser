/**
 * Local board posts encrypt through serializeDataBlob.
 * Run: node tests/calendar-storage-export.test.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storage = require(path.join(root, 'server', 'calendar-storage.js'));

let failures = 0;
function check(name, ok, detail) {
    if (!ok) {
        failures += 1;
        console.error(`FAIL ${name}${detail ? ` (${detail})` : ''}`);
    }
}

check('serializeDataBlob is exported', typeof storage.serializeDataBlob === 'function');
const blob = storage.serializeDataBlob('post-1', 'hello from the board');
check('blob has a data field', blob && typeof blob.data === 'string' && blob.data.length > 0);
const parsed = storage.parseDataObjectFromRow(
    {
        id: 'post-1',
        data: blob.data,
        dataEncVersion: blob.dataEncVersion,
        dataKeyWrapped: blob.dataKeyWrapped
    },
    'post-1'
);
check('board text round-trips', parsed === 'hello from the board', String(parsed));

if (failures) {
    console.error(`\n${failures} calendar-storage check(s) failed`);
    process.exit(1);
}
console.log('calendar-storage export ok');
