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
    // One-time clear drops mystery cohort filters that older setFromClass auto-set.
    assert(api.get().cohortId === '', 'stale auto cohort filter cleared on hydrate');
    assert(sandbox.appData.ui.cohortsTabSelectedId === '', 'ui cohort selection cleared with filter');
    assert(api.get().sessionDate === '2026-06-01', 'migrated sessionDate from legacy ui');
    assert(store.get('ccpActiveContextMigrated:user-test-1') === '1', 'migration flag set');
    assert(store.get('ccpClearedAutoCohortFilter:user-test-1') === '1', 'auto-cohort clear flag set');
}

{
    const { api, store } = loadActiveContext();
    api.set({ classId: 'cls-a', cohortId: 'coh-stuck', sessionDate: '2026-06-19' }, { source: 'test' });
    assert(api.get().cohortId === 'coh-stuck', 'precondition cohort set');
    api.hydrateUiFromStorage({
        homeworkTabClassId: '',
        cohortsTabSelectedId: '',
        classroomTabDate: ''
    });
    assert(api.get().cohortId === '', 'hydrate clears stuck cohort once');
    api.set({ cohortId: 'coh-intentional' }, { source: 'cohort-board' });
    api.hydrateUiFromStorage({
        homeworkTabClassId: '',
        cohortsTabSelectedId: '',
        classroomTabDate: ''
    });
    assert(api.get().cohortId === 'coh-intentional', 'second hydrate keeps intentional cohort after clear flag');
    assert(store.get('ccpClearedAutoCohortFilter:user-test-1') === '1', 'clear flag remains');
}

{
    const { api } = loadActiveContext();
    api.set({ cohortId: 'coh-keep' }, { source: 'pre' });
    api.setFromClass(
        { classes: [{ id: 'c1', name: 'Purple M', cohortIds: ['coh-from-class'] }] },
        'c1',
        '2026-08-07',
        'classroom-ui-pref'
    );
    const ctx = api.get();
    assert(ctx.classId === 'c1', 'setFromClass sets classId');
    assert(ctx.sessionDate === '2026-08-07', 'setFromClass sets sessionDate');
    assert(ctx.cohortId === 'coh-keep', 'setFromClass does not change cohortId');
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

{
    const { api, sandbox } = loadActiveContext();
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    api.set({ sessionDate: '2020-01-15', classId: 'cls-old' }, { source: 'stale' });
    const resolved = api.resolveDefaults({ classes: [{ id: 'cls-old' }, { id: 'cls-b' }] });
    assert(resolved.sessionDate === today, 'resolveDefaults refreshes stale sessionDate to today');
    assert(sandbox.appData.ui.homeworkReferenceDate === today, 'resolveDefaults mirrors today into homeworkReferenceDate');
    assert(sandbox.appData.ui.classroomTabDate === today, 'resolveDefaults mirrors today into classroomTabDate');
    assert(resolved.classId === 'cls-old', 'resolveDefaults keeps existing classId');
}

{
    const { api } = loadActiveContext();
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    api.set({ sessionDate: today }, { source: 'already-today' });
    const resolved = api.resolveDefaults({ classes: [] });
    assert(resolved.sessionDate === today, 'resolveDefaults is a no-op when sessionDate is already today');
}

console.log('active-context.test.mjs: all passed');
