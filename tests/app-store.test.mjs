import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadStore() {
    const stateCode = readFileSync(path.join(root, 'js', 'core', 'app-state.js'), 'utf8');
    const storeCode = readFileSync(path.join(root, 'js', 'core', 'app-store.js'), 'utf8');
    const sandbox = { window: {}, globalThis: {} };
    vm.runInNewContext(stateCode, sandbox);
    vm.runInNewContext(storeCode, sandbox);
    return {
        getDefaultAppData: sandbox.window.CCPCoreAppState.getDefaultAppData,
        store: sandbox.window.CCPAppStore
    };
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const { getDefaultAppData, store } = loadStore();
const appData = getDefaultAppData();
const appStore = store.createAppStore(appData);

{
    appStore.dispatch({ type: 'ui/set', key: 'calendarViewMode', value: 'agenda' });
    assert(appStore.getState().ui.calendarViewMode === 'agenda', 'ui/set');

    appStore.dispatch({ type: 'classes/upsert', classData: { id: 'c1', name: 'Test' } });
    assert(appStore.getState().classes.length === 1, 'classes/upsert add');
    assert(appStore.getState().classes[0].name === 'Test', 'class name');

    appStore.dispatch({ type: 'classes/upsert', classData: { id: 'c1', name: 'Updated' } });
    assert(appStore.getState().classes.length === 1, 'classes/upsert update count');
    assert(appStore.getState().classes[0].name === 'Updated', 'classes/upsert update');

    const snap = store.snapshotSlice(appStore, 'classes');
    appStore.dispatch({ type: 'classes/remove', id: 'c1' });
    assert(appStore.getState().classes.length === 0, 'classes/remove');
    store.restoreSlice(appStore, 'classes', snap);
    assert(appStore.getState().classes.length === 1, 'restoreSlice classes');

    appStore.dispatch({ type: 'events/upsert', event: { id: 'e1', name: 'Holiday' } });
    assert(appStore.getState().events.length === 1, 'events/upsert');
    appStore.dispatch({ type: 'events/remove', id: 'e1' });
    assert(appStore.getState().events.length === 0, 'events/remove');

    appStore.setMutationCalendarId('cal-test');
    appStore.dispatch({ type: 'classes/upsert', classData: { id: 'c2', name: 'Queued' } });
    assert(appStore.getMutationQueue().length === 1, 'mutation enqueued');
    appStore.flushMutationQueue(1);
    assert(appStore.getMutationQueue().length === 0, 'mutation flushed');
}

console.log('app-store.test.mjs: all passed');
