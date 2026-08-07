/**
 * Run: node tests/classroom-debate-teams-date.test.mjs
 * Class picks must not jump global sessionDate via Debate Teams Day-4 defaults.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

function load() {
    const store = new Map();
    const subscribers = [];
    const panel = {
        id: 'panel-debate-teams',
        hidden: true,
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        }
    };

    const sandbox = {
        window: {},
        globalThis: {},
        document: {
            getElementById(id) {
                if (id === 'panel-debate-teams') {
                    return panel;
                }
                return null;
            },
            addEventListener() {},
            createElement() {
                return { style: {}, classList: { add() {}, remove() {}, toggle() {} } };
            }
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
            ui: { debateAssignmentByClassId: {} },
            classes: [
                {
                    id: 'c-purple',
                    name: 'Purple M',
                    scheduleModel: 'debateMonthly',
                    syllabusRows: [
                        { kind: 'lesson', date: '2026-08-07', sessionNumber: 1, planTitle: 'Day 1' },
                        { kind: 'lesson', date: '2026-08-28', sessionNumber: 4, planTitle: 'Day 4' },
                        { kind: 'lesson', date: '2026-09-25', sessionNumber: 4, planTitle: 'Day 4 late' }
                    ]
                },
                {
                    id: 'c-other',
                    name: 'Green T',
                    scheduleModel: 'weekly',
                    syllabusRows: []
                }
            ],
            cohorts: [],
            debateTeamSessions: []
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
        CCPClassroomZoneContext: {
            getVisibleClasses() {
                return sandbox.appData.classes;
            }
        },
        CCPDebatePeriods: {
            getBookForDate() {
                return '';
            }
        },
        CustomEvent: class CustomEvent {
            constructor(type, init) {
                this.type = type;
                this.detail = init && init.detail;
            }
        },
        dispatchEvent() {},
        addEventListener() {},
        console,
        setTimeout,
        clearTimeout
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const active = readFileSync(path.join(root, 'js', 'active-context.js'), 'utf8');
    const domain = readFileSync(path.join(root, 'js', 'classroom-domain.js'), 'utf8');
    const teams = readFileSync(path.join(root, 'js', 'classroom-debate-teams.js'), 'utf8');
    vm.runInNewContext(active, sandbox);
    vm.runInNewContext(domain, sandbox);
    vm.runInNewContext(teams, sandbox);

    // Wrap subscribe so we can also track calls; CCPActiveContext.subscribe already works.
    const origSubscribe = sandbox.CCPActiveContext.subscribe.bind(sandbox.CCPActiveContext);
    sandbox.CCPActiveContext.subscribe = (fn) => {
        subscribers.push(fn);
        return origSubscribe(fn);
    };

    return { sandbox, panel, subscribers };
}

{
    const { sandbox, panel } = load();
    sandbox.CCPActiveContext.set(
        { classId: 'c-other', sessionDate: '2026-08-07' },
        { source: 'setup' }
    );

    // Arm subscriber the same way initTab does (panel stays hidden).
    void sandbox.CCPClassroomDebateTeams.initTab(
        {
            t: (k) => k,
            getAppData: () => sandbox.appData,
            getCurrentUserId: () => 'user-test-1',
            setUiPref() {},
            showToast() {}
        },
        {}
    );

    assert(panel.hidden === true, 'debate panel stays hidden in this test');
    assert(sandbox.CCPActiveContext.get().sessionDate === '2026-08-07', 'init with hidden panel keeps date');

    // Class-only pick of a debateMonthly class (would previously push late Day 4).
    sandbox.CCPActiveContext.setFromClass(sandbox.appData, 'c-purple', undefined, 'classroom-ui-pref');
    assert(sandbox.CCPActiveContext.get().classId === 'c-purple', 'class switched');
    assert(
        sandbox.CCPActiveContext.get().sessionDate === '2026-08-07',
        'class pick does not jump sessionDate to late Day 4 while Debate Teams is hidden'
    );
}

{
    const { sandbox, panel } = load();
    sandbox.CCPActiveContext.set(
        { classId: 'c-purple', sessionDate: '2026-08-07' },
        { source: 'setup' }
    );
    panel.hidden = false;

    void sandbox.CCPClassroomDebateTeams.initTab(
        {
            t: (k) => k,
            getAppData: () => sandbox.appData,
            getCurrentUserId: () => 'user-test-1',
            setUiPref() {},
            showToast() {}
        },
        {}
    );

    // Even when Debate Teams is active, default Day-4 resolve must stay local.
    sandbox.CCPActiveContext.setFromClass(sandbox.appData, 'c-purple', undefined, 'reselect');
    assert(
        sandbox.CCPActiveContext.get().sessionDate === '2026-08-07',
        'visible Debate Teams does not push debate-assignment-default into global sessionDate'
    );
}

console.log('classroom-debate-teams-date.test.mjs: all passed');
