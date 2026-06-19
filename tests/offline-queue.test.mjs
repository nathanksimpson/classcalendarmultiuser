import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadSessionRestore() {
    const code = readFileSync(path.join(root, 'js', 'session-restore.js'), 'utf8');
    const storage = {};
    const localStorage = {
        getItem(k) {
            return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null;
        },
        setItem(k, v) {
            storage[k] = String(v);
        },
        removeItem(k) {
            delete storage[k];
        }
    };
    const sandbox = {
        localStorage,
        window: {
            localStorage,
            location: { protocol: 'http:', pathname: '/index.html', search: '', hash: '' },
            addEventListener() {},
            removeEventListener() {}
        },
        globalThis: {},
        TeamAuth: undefined,
        document: { addEventListener() {}, removeEventListener() {} }
    };
    sandbox.globalThis = sandbox.window;
    vm.runInNewContext(code, sandbox);
    return { CCPSessionRestore: sandbox.window.CCPSessionRestore, storage };
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const { CCPSessionRestore, storage } = loadSessionRestore();

{
    assert(CCPSessionRestore.loadOfflineQueue('missing').length === 0, 'missing -> []');

    const queue = [{ entity: 'classes', action: 'upsert', payload: {}, timestamp: 1 }];
    CCPSessionRestore.saveOfflineQueue('cal-1', queue);
    assert(CCPSessionRestore.loadOfflineQueue('cal-1').length === 1, 'save/load roundtrip');

    CCPSessionRestore.clearOfflineQueue('cal-1');
    assert(CCPSessionRestore.loadOfflineQueue('cal-1').length === 0, 'clear removes key');

    storage['classCalendarQueue:bad'] = '{not json';
    assert(CCPSessionRestore.loadOfflineQueue('bad').length === 0, 'corrupt -> []');

    storage['classCalendarQueue:obj'] = '{"x":1}';
    assert(CCPSessionRestore.loadOfflineQueue('obj').length === 0, 'non-array -> []');
}

console.log('offline-queue.test.mjs: all passed');
