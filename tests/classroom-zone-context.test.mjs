/**
 * Run: node tests/classroom-zone-context.test.mjs
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

function loadZone() {
    const store = new Map();
    const sandbox = {
        window: {},
        globalThis: {},
        document: {
            documentElement: { getAttribute() { return ''; } },
            getElementById() { return null; },
            addEventListener() {}
        },
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
        appData: {
            ui: {},
            classes: [
                { id: 'c-purple', name: 'Purple M', cohortIds: ['coh-purple'], color: '#6f54a8' },
                { id: 'c-green', name: 'Green T', cohortIds: ['coh-green'], color: '#2f9e6b' },
                { id: 'c-navy', name: 'Navy M', cohortIds: ['coh-navy'], color: '#356a9e' }
            ],
            cohorts: [
                { id: 'coh-purple', name: 'Purple M' },
                { id: 'coh-green', name: 'Green T' },
                { id: 'coh-navy', name: 'Navy M' }
            ],
            essaySubmissions: []
        },
        CCPSessionRestore: {
            getSessionUserId() {
                return 'user-test-1';
            }
        },
        CCPClassroomAccess: {
            canBypass() {
                return true;
            },
            canEditClass() {
                return true;
            }
        },
        CCPCohortSidebarFilter: {
            getActiveCohortId() {
                return sandbox.CCPActiveContext.getActiveCohortId();
            },
            filterClassesByCohort(classes, cohortId) {
                if (!cohortId) {
                    return classes.slice();
                }
                return classes.filter(
                    (c) =>
                        c &&
                        (c.cohortId === cohortId ||
                            (Array.isArray(c.cohortIds) && c.cohortIds.includes(cohortId)))
                );
            }
        },
        CCPEssayClassFilter: {
            filterClassesForZoneContext(classes) {
                return classes;
            }
        },
        CustomEvent: class CustomEvent {
            constructor(type, init) {
                this.type = type;
                this.detail = init && init.detail;
            }
        },
        dispatchEvent() {},
        addEventListener() {}
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const active = readFileSync(path.join(root, 'js', 'active-context.js'), 'utf8');
    const domain = readFileSync(path.join(root, 'js', 'classroom-domain.js'), 'utf8');
    const zone = readFileSync(path.join(root, 'js', 'classroom-zone-context.js'), 'utf8');
    vm.runInNewContext(active, sandbox);
    vm.runInNewContext(domain, sandbox);
    vm.runInNewContext(zone, sandbox);

    sandbox.CCPClassroomZoneContext.init({
        t(key) {
            const map = {
                classroomEssayAlertRs: 'RS:{count}',
                classroomEssayAlertOd: 'OD:{count}',
                classroomEssayAlertAe: 'AE:{count}',
                classroomEssayAlertAs: 'NS:{count}',
                classroomEssayAlertNv: 'NV:{count}',
                classroomEssayDebateVideoMissing: 'Missing debate video'
            };
            return map[key] || key;
        },
        getAppData() {
            return sandbox.appData;
        },
        getCurrentUserId() {
            return 'user-test-1';
        },
        setUiPref() {}
    });

    return sandbox;
}

{
    const sandbox = loadZone();
    sandbox.CCPActiveContext.set({ cohortId: 'coh-purple' }, { source: 'cohort-board' });
    const visible = sandbox.CCPClassroomZoneContext.getVisibleClasses();
    assert(visible.length === 3, 'zone picker ignores active cohort filter');
    assert(
        visible.some((c) => c.id === 'c-green'),
        'other cohort classes still listed'
    );
}

{
    const sandbox = loadZone();
    const html = sandbox.CCPClassroomZoneContext.buildEssayAlertBadgesHtml({
        rs: 2,
        as: 0,
        od: 1,
        ae: 0,
        nv: 0
    });
    assert(html.includes('classroom-essay-alert-rs'), 'RS pill present');
    assert(html.includes('RS:2'), 'RS count rendered');
    assert(html.includes('classroom-essay-alert-od'), 'OD pill present');
    assert(html.includes('OD:1'), 'OD count rendered');
    assert(!html.includes('AE:'), 'zero AE omitted');
}

{
    const sandbox = loadZone();
    sandbox.CCPActiveContext.set({ cohortId: 'coh-keep' }, { source: 'pre' });
    sandbox.CCPActiveContext.setFromClass(sandbox.appData, 'c-purple', undefined, 'test');
    assert(sandbox.CCPActiveContext.getActiveCohortId() === 'coh-keep', 'class pick keeps cohort');
    assert(sandbox.CCPActiveContext.getActiveClassId() === 'c-purple', 'class pick sets class');
}

console.log('classroom-zone-context.test.mjs: all passed');
