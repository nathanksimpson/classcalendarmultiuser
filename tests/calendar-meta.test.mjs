/**
 * Calendar meta module exports (server).
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const CalendarMeta = require(path.join(root, 'server/calendar-meta.js'));

assert(typeof CalendarMeta.calendarMetaExtras === 'function', 'calendarMetaExtras export');
assert(typeof CalendarMeta.enrichAdminUserRow === 'function', 'enrichAdminUserRow export');

console.log('calendar-meta.test.mjs: all passed');
