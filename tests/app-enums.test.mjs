/**
 * Run: node tests/app-enums.test.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

function loadEnums() {
    const sandbox = { window: {}, globalThis: {} };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    const src = require('fs').readFileSync(
        path.join(__dirname, '..', 'js', 'core', 'app-enums.js'),
        'utf8'
    );
    vm.runInNewContext(src, sandbox);
    return sandbox.CCPAppEnums;
}

const E = loadEnums();
assert(E.SENTINEL.NO_GRADE === '__no_grade__', 'sentinel no grade');
assert(E.SENTINEL.NO_LEVEL === '__no_level__', 'sentinel no level');
assert(E.SENTINEL.NO_TYPE === '__no_type__', 'sentinel no type');
assert(E.SENTINEL.NO_BOOK === '__no_book__', 'sentinel no book');
assert(E.SENTINEL.NO_TEACHER === '__no_teacher__', 'sentinel no teacher');

console.log('app-enums.test.mjs: all passed');
