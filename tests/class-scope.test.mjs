/**
 * Header All / My classes scope + per-screen overrides.
 * Run: node tests/class-scope.test.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const code = readFileSync(path.join(root, 'js', 'class-scope.js'), 'utf8');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

function makeStorage() {
    const store = new Map();
    return {
        store,
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k)
    };
}

function load({ ui = {}, remote = null, assigned = ['c1'], userId = 'u1', storage = makeStorage() } = {}) {
    const events = [];
    const puts = [];
    const sandbox = {
        window: {},
        globalThis: {},
        console,
        setTimeout: (fn) => {
            fn();
            return 1;
        },
        clearTimeout() {},
        CustomEvent: class CustomEvent {
            constructor(type, init) {
                this.type = type;
                this.detail = init && init.detail;
            }
        },
        dispatchEvent(evt) {
            events.push(evt);
        }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInNewContext(code, sandbox);
    const appData = { ui };
    const api = sandbox.CCPClassScope;
    api.init({
        getUserId: () => userId,
        getAppData: () => appData,
        getClassIdsAssignedToViewer: () => assigned,
        storage,
        persistUi() {},
        loadRemote: () => Promise.resolve(remote),
        saveRemote: (body) => {
            puts.push(body);
            return Promise.resolve(body);
        }
    });
    return { api, appData, events, puts, storage };
}

{
    const { api } = load();
    assert(api.get() === 'all', 'default scope is all');
    assert(api.effectiveMine('classroom') === false, 'default screens show all');
    assert(api.cacheKey('u1') === 'ccp.classScope.v1:u1', 'cache key format');
}

// Migration from classroomZoneMyClassesOnly only when the server has no value.
for (const [legacy, expected] of [
    [true, 'mine'],
    ['1', 'mine'],
    ['', 'all'],
    [undefined, 'all']
]) {
    const ui = legacy === undefined ? {} : { classroomZoneMyClassesOnly: legacy };
    const { api, puts, storage } = load({ ui, remote: { classScope: null } });
    await api.syncFromServer();
    assert(api.get() === expected, `legacy ${JSON.stringify(legacy)} migrates to ${expected}`);
    assert(puts.length === 1 && puts[0].classScope === expected, 'migration saved to server');
    assert(storage.getItem('ccp.classScope.v1:u1') === expected, 'migration writes cache');
}

{
    const { api, puts } = load({ ui: { classroomZoneMyClassesOnly: true }, remote: { classScope: 'all' } });
    await api.syncFromServer();
    assert(api.get() === 'all', 'server value wins over legacy flag');
    assert(puts.length === 0, 'no migration write when server has a value');
}

{
    const storage = makeStorage();
    storage.setItem('ccp.classScope.v1:u1', 'mine');
    const { api } = load({ storage });
    assert(api.get() === 'mine', 'cache read at init for instant paint');
}

{
    const { api, appData, events, puts } = load();
    const seen = [];
    api.subscribe((d) => seen.push(d));
    api.setOverride('homework', true);
    api.setOverride('notes', true);
    assert(api.hasOverride('homework'), 'override recorded');
    assert(api.effectiveMine('homework') === true, 'override wins for its screen');
    assert(api.effectiveMine('classroom') === false, 'other screens still follow header');
    api.set('mine');
    assert(seen.length === 1, 'set emits once');
    assert(events.length === 1 && events[0].type === 'ccp:classScopeChanged', 'window event dispatched');
    assert(Object.keys(appData.ui.classScopeOverrides).length === 0, 'set clears overrides');
    ['classroom', 'homework', 'notes', 'debateBooksSummary'].forEach((s) => {
        assert(api.effectiveMine(s) === true, `${s} follows header after change`);
    });
    assert(puts.length === 1 && puts[0].classScope === 'mine', 'set saves to server');
    api.setOverride('notes', false);
    assert(api.effectiveMine('notes') === false && api.hasOverride('notes'), 'unticking under Mine is an override');
    api.setOverride('notes', true);
    assert(!api.hasOverride('notes'), 'matching the header drops the override');
}

{
    const { api, appData } = load({
        ui: { homeworkFilters: { myClassesOnly: true }, classNotesFilters: { myClassesOnly: false } },
        remote: { classScope: 'all' }
    });
    await api.syncFromServer();
    assert(appData.ui.classScopeOverrides.homework === true, 'homework legacy value seeds an override');
    assert(!('notes' in appData.ui.classScopeOverrides), 'matching value is not seeded');
    assert(api.effectiveMine('homework') === true && api.effectiveMine('notes') === false, 'seeded effective values');
    appData.ui.homeworkFilters.myClassesOnly = false;
    api.seedOverrides();
    assert(appData.ui.classScopeOverrides.homework === true, 'seeding runs once per calendar');
}

{
    const { api } = load({ assigned: ['c1', 'c2'] });
    assert(api.isMine({ id: 'c2' }) === true, 'isMine delegates to the assigned-class hook');
    assert(api.isMine({ id: 'c3' }) === false, 'isMine false for other classes');
    assert(api.hasAssignedClasses(), 'has assigned classes');
    const none = load({ assigned: null });
    assert(none.api.hasAssignedClasses() === false, 'no viewer → no assigned classes');
    assert(none.api.set('bogus') === false && none.api.get() === 'all', 'invalid scope ignored');
}

console.log('class-scope.test.mjs: all passed');
