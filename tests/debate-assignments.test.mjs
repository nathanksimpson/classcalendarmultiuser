/**
 * Run: node tests/debate-assignments.test.mjs
 * Phase 5: one debate assignment per class per month (or book period);
 * teams/scores follow the period; Homework copy never touches the open tab or reshuffles.
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

function read(rel) {
    return readFileSync(path.join(root, rel), 'utf8');
}

function makeSandbox(appData) {
    const listeners = new Map();
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
        CustomEvent: class CustomEvent {
            constructor(type, init) {
                this.type = type;
                this.detail = init && init.detail;
            }
        },
        addEventListener(type, fn) {
            if (!listeners.has(type)) {
                listeners.set(type, []);
            }
            listeners.get(type).push(fn);
        },
        removeEventListener() {},
        dispatchEvent(evt) {
            (listeners.get(evt.type) || []).forEach((fn) => fn(evt));
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
        appData
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    return sandbox;
}

function loadDomain(appData) {
    const sandbox = makeSandbox(appData || { ui: {}, classes: [] });
    vm.runInNewContext(read('js/debate-periods.js'), sandbox);
    vm.runInNewContext(read('js/classroom-domain.js'), sandbox);
    vm.runInNewContext(read('js/assignments.js'), sandbox);
    return sandbox;
}

function loadTeams(appData) {
    const sandbox = loadDomain(appData);
    vm.runInNewContext(read('js/debate/debate-teams-v2.js'), sandbox);
    vm.runInNewContext(read('js/classroom-debate-teams.js'), sandbox);
    return sandbox;
}

function lesson(id, date, sessionNumber, planTitle) {
    return { id, kind: 'lesson', date, sessionNumber, planTitle };
}

// 1. Day 3 and Day 4 in one month give one assignment.
{
    const { CCPClassroomDomain: d } = loadDomain();
    const cls = {
        id: 'c1',
        scheduleModel: 'debateMonthly',
        syllabusRows: [
            lesson('r1', '2026-03-03', 1, 'Day 1'),
            lesson('r3', '2026-03-17', 3, 'Day 3'),
            lesson('r4', '2026-03-24', 4, 'Day 4'),
            lesson('r7', '2026-04-14', 3, 'Day 3'),
            lesson('r8', '2026-04-21', 4, 'Day 4')
        ]
    };
    const list = d.listDebateTeamAssignmentsForClass(cls, {
        debateTeamSessions: [{ id: 's-x', classId: 'c1', date: '2026-03-20', sessionState: { debates: [] } }]
    });
    assert(list.length === 2, 'one assignment per month (March, April)');
    assert(list[0].date === '2026-03-17', 'March assignment date is the first debate lesson');
    assert(list[0].id === 'debate:c1:month:2026-03', 'assignment id is class + period');
    assert(list[0].lessonDates.join(',') === '2026-03-17,2026-03-24', 'March keeps both lesson dates');
    assert(!/Day 4/.test(list[0].label), 'label uses month wording, not Day 4');
}

// 2. With book periods, the period start decides the grouping.
{
    const { CCPClassroomDomain: d } = loadDomain();
    const cls = {
        id: 'c2',
        scheduleModel: 'debateMonthly',
        debateBookPeriods: [
            { id: 'p1', startDate: '2026-03-10', book: 'Book A' },
            { id: 'p2', startDate: '2026-04-07', book: 'Book B' }
        ],
        syllabusRows: [
            lesson('a3', '2026-03-24', 3, 'Day 3'),
            lesson('a4', '2026-04-02', 4, 'Day 4'),
            lesson('b3', '2026-04-21', 3, 'Day 3')
        ]
    };
    const list = d.listDebateTeamAssignmentsForClass(cls);
    assert(list.length === 2, 'book periods give two assignments across the month boundary');
    assert(list[0].periodKey === 'period:2026-03-10', 'first assignment keyed by first book start');
    assert(
        list[0].lessonDates.includes('2026-04-02'),
        'early-April lesson stays in the March book period'
    );
    assert(list[1].periodKey === 'period:2026-04-07', 'second assignment keyed by second book start');
}

// 3. Shifting all lesson dates by a week keeps the same assignment id, teams, and scores.
{
    const { CCPClassroomDomain: d } = loadDomain();
    const before = {
        id: 'c3',
        scheduleModel: 'debateMonthly',
        syllabusRows: [lesson('x3', '2026-05-05', 3, 'Day 3'), lesson('x4', '2026-05-12', 4, 'Day 4')]
    };
    const after = Object.assign({}, before, {
        syllabusRows: [lesson('x3', '2026-05-12', 3, 'Day 3'), lesson('x4', '2026-05-19', 4, 'Day 4')]
    });
    const teams = [
        { id: 'dts-1', classId: 'c3', date: '2026-05-05', sessionState: { debates: [{ number: 1 }] } }
    ];
    const scores = [{ id: 'dbs-1', classId: 'c3', date: '2026-05-05', records: [{ studentId: 's1' }] }];
    const a1 = d.listDebateTeamAssignmentsForClass(before, { debateTeamSessions: teams });
    const a2 = d.listDebateTeamAssignmentsForClass(after, { debateTeamSessions: teams });
    assert(a1.length === 1 && a2.length === 1, 'still one assignment after the shift');
    assert(a1[0].id === a2[0].id, 'assignment id unchanged after a one-week shift');
    const team = d.findDebateTeamSessionForAssignment(teams, after, a2[0]);
    const score = d.findDebateScoreSessionForAssignment(scores, after, a2[0].periodKey);
    assert(team && team.id === 'dts-1', 'teams still attached after the shift');
    assert(score && score.id === 'dbs-1', 'scores still attached after the shift');
    assert(
        d.findDebateTeamSession(teams, 'c3', a2[0].date, after).id === 'dts-1',
        'date lookup goes through the period'
    );
}

// 6. Old sessions without periodKey are found after migration (duplicates kept).
{
    const appData = {
        ui: {},
        classes: [
            {
                id: 'c6',
                scheduleModel: 'debateMonthly',
                syllabusRows: [lesson('m3', '2026-06-09', 3, 'Day 3'), lesson('m4', '2026-06-16', 4, 'Day 4')]
            }
        ],
        debateTeamSessions: [
            { id: 'old-empty', classId: 'c6', date: '2026-06-09', sessionState: { debates: [] } },
            { id: 'old-teams', classId: 'c6', date: '2026-06-16', sessionState: { debates: [{ number: 1 }] } }
        ],
        debateScores: [{ id: 'old-score', classId: 'c6', date: '2026-06-16', records: [] }]
    };
    const { CCPClassroomDomain: d } = loadDomain(appData);
    d.migrateClassroomData(appData);
    assert(appData.debateTeamSessions.length === 2, 'migration keeps duplicate sessions');
    assert(
        appData.debateTeamSessions.every((s) => s.periodKey === 'month:2026-06'),
        'migration stamps periodKey on team sessions'
    );
    assert(appData.debateScores[0].periodKey === 'month:2026-06', 'migration stamps periodKey on scores');
    const cls = appData.classes[0];
    const [assignment] = d.listDebateTeamAssignmentsForClass(cls, {
        debateTeamSessions: appData.debateTeamSessions
    });
    assert(
        d.findDebateTeamSessionForAssignment(appData.debateTeamSessions, cls, assignment).id === 'old-teams',
        'period lookup prefers the session with generated teams'
    );
    assert(
        d.findDebateScoreSession(appData.debateScores, 'c6', '2026-06-09', cls).id === 'old-score',
        'old score sheet found from another date in the same month'
    );
}

// Shared selection: legacy maps migrate; debate dates resolve to their period.
{
    const appData = {
        ui: { debateAssignmentByClassId: { c7: '2026-03-24' }, essayAssignmentByClassId: { c8: 'row-e' } },
        classes: [
            {
                id: 'c7',
                scheduleModel: 'debateMonthly',
                syllabusRows: [lesson('p3', '2026-03-17', 3, 'Day 3'), lesson('p4', '2026-03-24', 4, 'Day 4')]
            }
        ],
        debateTeamSessions: []
    };
    const sandbox = loadDomain(appData);
    const api = sandbox.CCPAssignments;
    api.ensureStore(appData);
    assert(api.getSelected('essay', 'c8', appData) === 'row-e', 'essay selection migrated');
    const resolved = api.resolve('debate', appData.classes[0], appData, {});
    assert(resolved && resolved.id === 'debate:c7:month:2026-03', 'legacy debate date resolves to its month');
    assert(
        api.getSelected('debate', 'c7', appData) === 'debate:c7:month:2026-03',
        'legacy date rewritten to the assignment id'
    );
    let seen = null;
    api.subscribe((detail) => {
        seen = detail;
    });
    api.select('debate', 'c7', 'debate:c7:month:2026-04', { appData });
    assert(seen && seen.kind === 'debate' && seen.classId === 'c7', 'select emits ccp:assignmentChanged');
}

// 4 + 5. Homework copy for class B leaves tab A alone; a second copy reuses teams with no reshuffle.
{
    const roster = (prefix, n) =>
        Array.from({ length: n }, (_, i) => ({
            id: `${prefix}${i + 1}`,
            name: `김테${String.fromCharCode(0xac00 + i)}`,
            nameEn: `(Stu${prefix}${String.fromCharCode(97 + i)})`,
            active: true
        }));
    const appData = {
        ui: {},
        classes: [
            {
                id: 'cls-a',
                name: 'Class A',
                scheduleModel: 'debateMonthly',
                cohortIds: ['coh-a'],
                syllabusRows: [lesson('a3', '2026-03-17', 3, 'Day 3'), lesson('a4', '2026-03-24', 4, 'Day 4')]
            },
            {
                id: 'cls-b',
                name: 'Class B',
                scheduleModel: 'debateMonthly',
                cohortIds: ['coh-b'],
                syllabusRows: [lesson('b3', '2026-03-18', 3, 'Day 3'), lesson('b4', '2026-03-25', 4, 'Day 4')]
            }
        ],
        cohorts: [
            { id: 'coh-a', name: 'A', students: roster('a', 6) },
            { id: 'coh-b', name: 'B', students: roster('b', 8) }
        ],
        debateTeamSessions: []
    };
    const sandbox = loadTeams(appData);
    const teamsApi = sandbox.CCPClassroomDebateTeams;
    const eng = sandbox.CCPDebateTeamsV2;
    let saves = 0;
    const hooks = {
        t: (key) => key,
        getAppData: () => appData,
        getCurrentUserId: () => 'user-test',
        async saveClassroom(fields) {
            saves += 1;
            if (fields && Array.isArray(fields.debateTeamSessions)) {
                appData.debateTeamSessions = fields.debateTeamSessions;
            }
        },
        showToast() {}
    };

    // Open tab on class A (panel stub has no mount, so render stops before the DOM).
    const panelStub = { hidden: false, querySelector: () => null, querySelectorAll: () => [] };
    sandbox.document.getElementById = (id) => (id === 'panel-debate-teams' ? panelStub : null);
    await teamsApi.initTab(hooks, { classId: 'cls-a', date: '2026-03-17' });
    eng.loadState({
        version: 2,
        students: ['Live A1', 'Live A2'],
        studentIds: ['a1', 'a2'],
        formatId: 'ap',
        debates: []
    });
    const liveBefore = JSON.stringify(eng.collectState());
    const ctxBefore = JSON.stringify(teamsApi.getContext());

    const first = await teamsApi.buildAndPersistForHomework({ classId: 'cls-b', date: '2026-03-25', hooks });
    assert(first && first.ok && first.reused === false, 'copy for class B generates teams');
    assert(JSON.stringify(teamsApi.getContext()) === ctxBefore, 'open tab keeps class A and its date');
    assert(JSON.stringify(eng.collectState()) === liveBefore, 'open tab keeps class A students and state');
    const stored = appData.debateTeamSessions.filter((s) => s.classId === 'cls-b');
    assert(stored.length === 1, 'one session stored for class B');
    assert(stored[0].date === '2026-03-18', 'stored on the first debate date of the month');
    assert(stored[0].periodKey === 'month:2026-03', 'periodKey stamped on save');
    const names = (stored[0].sessionState.students || []).join('|');
    assert(names && !/Live A/.test(names), 'class B teams use class B students only');

    const order = JSON.stringify(stored[0].sessionState.debates);
    const second = await teamsApi.buildAndPersistForHomework({ classId: 'cls-b', date: '2026-03-18', hooks });
    assert(second && second.ok && second.reused === true, 'second copy in the same month reuses teams');
    const after = appData.debateTeamSessions.filter((s) => s.classId === 'cls-b');
    assert(after.length === 1, 'second copy writes no extra session');
    assert(JSON.stringify(after[0].sessionState.debates) === order, 'teams keep identical order (no reshuffle)');
    assert(JSON.stringify(eng.collectState()) === liveBefore, 'live tab still untouched after reuse');
    assert(saves >= 1, 'copy saved through hooks');
}

console.log('debate-assignments.test.mjs: all passed');
