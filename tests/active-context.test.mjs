/**
 * Run: node tests/active-context.test.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

function loadActiveContext() {
    const store = new Map();
    const listeners = [];
    const sandbox = {
        window: {},
        globalThis: {},
        localStorage: {
            getItem(k) {
                return store.has(k) ? store.get(k) : null;
            },
            setItem(k, v) {
                store.set(k, String(v));
            },
            removeItem(k) {
                store.delete(k);
            }
        },
        appData: { ui: {} },
        ensureUiState() {},
        saveUiStateToLocalStorage() {},
        CCPSessionRestore: {
            getSessionUserId() {
                return 'user-test-1';
            }
        },
        dispatchEvent(ev) {
            listeners.push(ev);
        },
        CustomEvent: class CustomEvent {
            constructor(type, init) {
                this.type = type;
                this.detail = init && init.detail;
            }
        },
        addEventListener() {}
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    const code = readFileSync(path.join(root, 'js', 'active-context.js'), 'utf8');
    vm.runInNewContext(code, sandbox);
    return { api: sandbox.CCPActiveContext, sandbox, listeners, store };
}

{
    const { api, sandbox } = loadActiveContext();
    api.set({ classId: 'cls-a', cohortId: 'coh-1', sessionDate: '2026-06-19' }, { source: 'test' });
    const ctx = api.get();
    assert(ctx.classId === 'cls-a', 'classId persisted');
    assert(ctx.cohortId === 'coh-1', 'cohortId persisted');
    assert(ctx.sessionDate === '2026-06-19', 'sessionDate persisted');
    assert(sandbox.appData.ui.homeworkTabClassId === 'cls-a', 'ui mirror homeworkTabClassId');
    assert(sandbox.appData.ui.cohortsTabSelectedId === 'coh-1', 'ui mirror cohortsTabSelectedId');
}

{
    const { api, sandbox, store } = loadActiveContext();
    sandbox.appData.ui = {
        homeworkTabClassId: 'legacy-class',
        cohortsTabSelectedId: 'legacy-cohort',
        classroomTabDate: '2026-06-01'
    };
    api.hydrateUiFromStorage(sandbox.appData.ui);
    assert(api.get().classId === 'legacy-class', 'migrated classId from legacy ui');
    assert(api.get().cohortId === 'legacy-cohort', 'migrated cohortId from legacy ui');
    assert(api.get().sessionDate === '2026-06-01', 'migrated sessionDate from legacy ui');
    assert(store.get('ccpActiveContextMigrated:user-test-1') === '1', 'migration flag set');
}

{
    const { api, listeners } = loadActiveContext();
    let seen = null;
    api.subscribe((detail) => {
        seen = detail;
    });
    api.set({ classId: 'cls-b' }, { source: 'subscribe-test' });
    assert(seen && seen.classId === 'cls-b', 'subscriber received update');
    assert(listeners.some((ev) => ev.type === 'ccp:activeContextChanged'), 'custom event dispatched');
}

{
    const { api } = loadActiveContext();
    const empty = api.get();
    assert(empty.classId === '' && empty.cohortId === '' && empty.sessionDate === '', 'graceful empty');
    const cohort = api.deriveCohortIdFromClass(
        { classes: [{ id: 'c1', cohortIds: ['g1', 'g2'] }] },
        'c1'
    );
    assert(cohort === 'g1', 'derive cohort from cohortIds');
}

{
    const { api, sandbox } = loadActiveContext();
    api.set({ sessionDate: '2026-06-23' }, { source: 'test' });
    sandbox.appData.ui.homeworkReferenceDate = '2026-06-24';
    sandbox.appData.ui.classroomTabDate = '2026-06-24';
    api.set({ classId: 'cls-b' }, { source: 'class-only' });
    assert(sandbox.appData.ui.homeworkReferenceDate === '2026-06-24', 'classId-only set keeps homeworkReferenceDate');
    assert(sandbox.appData.ui.classroomTabDate === '2026-06-24', 'classId-only set keeps classroomTabDate');
    assert(api.get().sessionDate === '2026-06-23', 'classId-only set keeps stored sessionDate until explicit update');
}

console.log('active-context.test.mjs: all passed');
