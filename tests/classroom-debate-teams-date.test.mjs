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

{
    const { sandbox } = load();
    const d = sandbox.CCPClassroomDomain;
    const classData = {
        id: 'c-day3',
        scheduleModel: 'debateMonthly',
        syllabusRows: [
            { kind: 'lesson', date: '2026-09-10', sessionNumber: 3, planTitle: 'Day 3' },
            { kind: 'lesson', date: '2026-09-12', sessionNumber: 4, planTitle: 'Day 4' }
        ]
    };
    assert(d.isDebateDayThreeTitle('Day 2 & 3 Combined') === true, 'combined is day 3 title');
    const assignments = d.listDebateTeamAssignmentsForClass(classData, {
        debateTeamSessions: [
            { classId: 'c-day3', date: '2026-09-08', sessionState: { debates: [{ number: 1 }] } }
        ]
    });
    assert(assignments.length === 1, 'Day 3, Day 4 and a saved session in one month give one assignment');
    assert(assignments[0].date === '2026-09-10', 'assignment date is the first debate lesson of the month');
    assert(
        assignments[0].lessonDates.includes('2026-09-12'),
        'Day 4 date belongs to the same month assignment'
    );
}

function loadHomeworkTeams() {
    const sandbox = {
        window: {},
        globalThis: {},
        document: {
            getElementById() {
                return null;
            },
            addEventListener() {},
            createElement() {
                return { style: {}, classList: { add() {}, remove() {}, toggle() {} } };
            },
            body: { appendChild() {}, removeChild() {} }
        },
        console,
        setTimeout,
        clearTimeout,
        alert() {},
        confirm() {
            return true;
        },
        CCPClassroomAccess: {
            canBypass() {
                return true;
            },
            canEditClass() {
                return true;
            }
        },
        appData: {
            ui: {},
            classes: [
                {
                    id: 'c-purple',
                    name: 'Purple M',
                    scheduleModel: 'debateMonthly',
                    levelPreset: 'Purple',
                    cohortIds: ['coh'],
                    debateBookPeriods: [
                        { id: 'mar', startDate: '2026-03-01', book: 'Debate Purple' },
                        { id: 'apr', startDate: '2026-04-01', book: 'Debate Purple' }
                    ]
                }
            ],
            cohorts: [
                {
                    id: 'coh',
                    name: 'Purple',
                    students: [
                        { id: 's1', name: '김', nameEn: 'Kim', active: true },
                        { id: 's2', name: '이', nameEn: 'Lee', active: true }
                    ]
                }
            ],
            debateTeamSessions: []
        }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const periods = readFileSync(path.join(root, 'js', 'debate-periods.js'), 'utf8');
    const domain = readFileSync(path.join(root, 'js', 'classroom-domain.js'), 'utf8');
    const engine = readFileSync(path.join(root, 'js', 'debate', 'debate-teams-v2.js'), 'utf8');
    const teams = readFileSync(path.join(root, 'js', 'classroom-debate-teams.js'), 'utf8');
    vm.runInNewContext(periods, sandbox);
    vm.runInNewContext(domain, sandbox);
    vm.runInNewContext(engine, sandbox);
    vm.runInNewContext(teams, sandbox);
    return sandbox;
}

{
    const sandbox = loadHomeworkTeams();
    const teamsApi = sandbox.CCPClassroomDebateTeams;
    const eng = sandbox.CCPDebateTeamsV2;
    let generateCalls = 0;
    const originalGenerate = eng.generateDebatesSilent.bind(eng);
    eng.generateDebatesSilent = (options) => {
        generateCalls += 1;
        return originalGenerate(options);
    };
    const hooks = {
        t: (key) => key,
        getAppData: () => sandbox.appData,
        getCurrentUserId: () => 'user-test-1',
        async saveClassroom(fields) {
            if (fields && Array.isArray(fields.debateTeamSessions)) {
                sandbox.appData.debateTeamSessions = fields.debateTeamSessions;
            }
        },
        showToast() {}
    };

    const first = await teamsApi.buildAndPersistForHomework({
        classId: 'c-purple',
        date: '2026-03-17',
        hooks
    });
    assert(first && first.ok, 'first homework create succeeds');
    assert(first.reused === false, 'first create is not a reuse');
    assert(first.sessionState && first.sessionState.purpleMode === true, 'Purple class creates purple teams');
    assert(first.sessionState.sheetTemplate === 'yeoul', 'Purple class uses the yeoul sheet');
    assert(first.sessionState.maxTeamSize === 1, 'Purple class uses 1-person teams');
    assert(generateCalls === 1, 'first create generates once');
    assert(sandbox.appData.debateTeamSessions.length === 1, 'one session is stored');
    assert(sandbox.appData.debateTeamSessions[0].date === '2026-03-17', 'teams are stored on the first debate date');

    const second = await teamsApi.buildAndPersistForHomework({
        classId: 'c-purple',
        date: '2026-03-24',
        hooks
    });
    assert(second && second.ok && second.reused === true, 'a later day in the month reuses teams');
    assert(generateCalls === 1, 'a later day does not generate again');
    assert(
        sandbox.appData.debateTeamSessions.length === 1,
        'a later syllabus date does not write a second session'
    );
    assert(second.entry && second.entry.date === '2026-03-17', 'reuse keeps the original session date');
    assert(second.sessionState && second.sessionState.purpleMode === true, 'reused teams stay purple');
}

console.log('classroom-debate-teams-date.test.mjs: all passed');
