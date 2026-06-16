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
assert(E.CLASS_TYPE_WR_SP_ID === 'builtin-wr-sp', 'WR+SP id');
assert(E.LESSON_LABEL_MODE.GR_WEEKLY_UNIT === 'grWeeklyUnit', 'lesson label');
assert(E.COMPRESSION_MODE.MANUAL === 'manual', 'compression manual');
assert(E.EDITOR_MODE.POPOUT === 'popout', 'editor popout');
assert(E.SENTINEL.NO_GRADE === '__no_grade__', 'sentinel');

console.log('app-enums.test.mjs: all passed');
