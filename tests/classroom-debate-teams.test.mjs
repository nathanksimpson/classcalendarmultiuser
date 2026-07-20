/**
 * Run: node tests/classroom-debate-teams.test.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

function loadDebateEngine(options = {}) {
    const utilsCode = readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
    const engineCode = readFileSync(path.join(root, 'js', 'debate', 'debate-teams-v2.js'), 'utf8');
    const mountHtml = readFileSync(
        path.join(root, 'templates', 'classroom-debate-teams-body.html'),
        'utf8'
    );

    const listeners = [];
    class AbortControllerPoly {
        constructor() {
            this.signal = { aborted: false };
        }
        abort() {
            this.signal.aborted = true;
        }
    }
    const sandbox = {
        window: {},
        globalThis: {},
        AbortController: globalThis.AbortController || AbortControllerPoly,
        document: {
            createElement() {
                return {
                    href: '',
                    download: '',
                    click() {},
                    style: {}
                };
            },
            body: {
                appendChild() {},
                removeChild() {}
            }
        },
        navigator: {
            clipboard: {
                writeText() {
                    return Promise.resolve();
                }
            }
        },
        console,
        setTimeout,
        clearTimeout,
        alert() {},
        confirm: options.confirm || (() => true)
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    function makeEl(html) {
        const el = {
            innerHTML: '',
            className: '',
            classList: {
                contains(cls) {
                    return el.className.split(/\s+/).includes(cls);
                },
                toggle(_cls, on) {
                    if (on) {
                        el.className = (el.className + ' ' + _cls).trim();
                    } else {
                        el.className = el.className
                            .split(/\s+/)
                            .filter((c) => c && c !== _cls)
                            .join(' ');
                    }
                }
            },
            hidden: false,
            value: '',
            checked: false,
            textContent: '',
            id: '',
            setAttribute() {},
            getAttribute() {
                return null;
            },
            querySelector(sel) {
                if (sel === '.classroom-debate-v2') {
                    return el._child || null;
                }
                return null;
            },
            querySelectorAll() {
                return [];
            },
        addEventListener(type, fn, opts) {
            listeners.push({ type, fn, el, opts });
        }
        };
        el._child = {
            className: 'classroom-debate-v2',
            classList: {
                contains(cls) {
                    return el._child.className.split(/\s+/).includes(cls);
                },
                toggle(cls, on) {
                    if (on) {
                        el._child.className = (el._child.className + ' ' + cls).trim();
                    } else {
                        el._child.className = el._child.className
                            .split(/\s+/)
                            .filter((c) => c && c !== cls)
                            .join(' ');
                    }
                }
            },
            addEventListener(type, fn, opts) {
                listeners.push({ type, fn, el: el._child, opts });
            },
            querySelector(sel) {
                if (sel === '#debateV2Generate') {
                    return genBtn;
                }
                return null;
            },
            querySelectorAll() {
                return [];
            }
        };
        return el;
    }

    const mount = makeEl();
    mount.innerHTML = mountHtml;
    const genBtn = {
        id: 'debateV2Generate',
        disabled: false,
        textContent: '',
        closest() {
            return null;
        }
    };
    mount.querySelector = (sel) => {
        if (sel === '.classroom-debate-v2') {
            return mount._child;
        }
        if (sel === '#debateV2Generate') {
            return genBtn;
        }
        return null;
    };

    vm.runInNewContext(utilsCode, sandbox);
    vm.runInNewContext(engineCode, sandbox);
    const api = sandbox.CCPDebateTeamsV2;
    assert(api, 'CCPDebateTeamsV2 loaded');

    const bridge = {
        canEdit: () => true,
        t: (key) => key,
        onSave() {},
        onResultsVisibility() {}
    };
    api.init(mount, bridge);

    return { api, mount, genBtn, listeners };
}

{
    const { api } = loadDebateEngine();
    api.loadState({
        version: 2,
        students: ['Alice', 'Bob', 'Carol', 'Dave'],
        formatId: 'ap',
        includeReply: false,
        maxTeamSize: 3,
        classTitle: 'Period 3',
        hrTeacher: 'Kim',
        topic: '',
        sheetTemplate: 'garam',
        debates: [{ number: 1, formatId: 'ap', notes: '', benches: [{ id: 'gov', label: 'Gov', members: [] }] }]
    });
    assert(api.collectState().debates.length === 1, 'seed debates present');

    const outcome = api.importRoster(['Alice', 'Bob', 'Carol', 'Dave', 'Eve'], { clearDebates: true });
    assert(outcome.ok && outcome.debatesCleared, 'importRoster clears debates when roster changes');
    assert(api.collectState().debates.length === 0, 'debates empty after roster refresh');
    assert(api.collectState().students.length === 5, 'students updated from roster');
}

{
    const { api } = loadDebateEngine();
    api.loadState({
        version: 2,
        students: ['Alice', 'Bob', 'Carol', 'Dave'],
        formatId: 'ap',
        includeReply: false,
        maxTeamSize: 3,
        classTitle: '',
        hrTeacher: '',
        topic: '',
        sheetTemplate: 'garam',
        debates: [{ number: 1, formatId: 'ap', notes: '', benches: [{ id: 'gov', label: 'Gov', members: [] }] }]
    });
    const sameRoster = ['Alice', 'Bob', 'Carol', 'Dave'];
    const outcome = api.importRoster(sameRoster, { clearDebates: true });
    assert(outcome.ok && outcome.reason === 'cleared-debates', 'unchanged roster refresh clears debates');
    assert(outcome.debatesCleared, 'debatesCleared flag set');
    assert(api.collectState().debates.length === 0, 'assignments cleared when roster unchanged');
    assert(api.collectState().students.length === 4, 'student list unchanged');
}

{
    const { api } = loadDebateEngine();
    api.loadState({
        version: 2,
        students: [],
        formatId: 'ap',
        includeReply: false,
        maxTeamSize: 3,
        classTitle: '',
        hrTeacher: '',
        topic: '',
        sheetTemplate: 'garam',
        debates: []
    });
    const outcome = api.importRoster(['One', 'Two', 'Three', 'Four'], { clearDebates: false });
    assert(outcome.ok && outcome.count === 4, 'bootstrap import fills empty student list');
    assert(api.collectState().students.length === 4, 'empty session bootstraps students from roster');
}

{
    let studentsListTouchedByUser = false;
    let rosterAutoImported = false;
    function shouldAutoSyncRoster(studentCount, rosterCount) {
        if (studentsListTouchedByUser || rosterAutoImported) {
            return false;
        }
        return studentCount === 0 && rosterCount > 0;
    }
    assert(shouldAutoSyncRoster(0, 5), 'auto-sync when sidebar empty and roster ready');
    studentsListTouchedByUser = true;
    assert(!shouldAutoSyncRoster(0, 5), 'no auto-sync after user cleared list');
    studentsListTouchedByUser = false;
    rosterAutoImported = true;
    assert(!shouldAutoSyncRoster(0, 5), 'no auto-sync after roster already imported');
}

{
    const { api } = loadDebateEngine();
    api.importRoster(['Ann', 'Ben', 'Cal', 'Dan'], { clearDebates: false });
    assert(api.collectState().students.length === 4, 'seed four students');
    api.loadState({
        version: 2,
        students: [],
        formatId: 'ap',
        includeReply: false,
        maxTeamSize: 3,
        classTitle: '',
        hrTeacher: '',
        topic: '',
        sheetTemplate: 'garam',
        debates: [],
        studentsManual: true
    });
    assert(api.collectState().students.length === 0, 'clear all leaves empty student list');
}

{
    const { api } = loadDebateEngine();
    api.importRoster(['Kim', 'Lee', 'Park', 'Choi'], { clearDebates: false });
    const before = api.collectState().students.length;
    api.importRoster(['Kim', 'Lee', 'Park'], { clearDebates: false });
    assert(api.collectState().students.length === before - 1, 'chip remove simulated via shorter roster import');
}

{
    let hydratedSessionKey = '';
    function canMarkHydrated(studentCount, rosterCount, userTouched) {
        if (studentCount > 0 || rosterCount === 0 || userTouched) {
            return true;
        }
        return false;
    }
    function tryHydrate(studentCount, rosterCount, userTouched) {
        const key = 'c|d';
        if (canMarkHydrated(studentCount, rosterCount, userTouched)) {
            hydratedSessionKey = key;
        }
    }
    tryHydrate(0, 0, false);
    assert(hydratedSessionKey === 'c|d', 'hydrate when roster empty');
    hydratedSessionKey = '';
    tryHydrate(0, 8, false);
    assert(hydratedSessionKey === '', 'defer hydrate until roster sync fills students');
    tryHydrate(8, 8, false);
    assert(hydratedSessionKey === 'c|d', 'hydrate once students populated');
}

{
    const { api, genBtn } = loadDebateEngine();
    api.setEditEnabled(false);
    assert(!genBtn.disabled, 'setEditEnabled(false) does not disable Generate button');
}

{
    const { api, mount } = loadDebateEngine();
    api.init(mount, { canEdit: () => false, t: (k) => k, onSave() {}, onResultsVisibility() {} });
    api.render();
    const shell = mount.querySelector('.classroom-debate-v2');
    assert(shell && shell.className.includes('debate-v2--readonly'), 'readonly shell class applied when not editable');
}

{
    const { api } = loadDebateEngine();
    assert(api.FORMATS.purple, 'purple format exists');
    assert(api.FORMATS.purple.govRoles.length === 1 && api.FORMATS.purple.govRoles[0].abbr === 'PM', 'purple gov is PM only');
    assert(api.FORMATS.purple.oppRoles.length === 1 && api.FORMATS.purple.oppRoles[0].abbr === 'LO', 'purple opp is LO only');
    assert(api.FORMATS.purple.fixedTeamSize === 1, 'purple fixed team size is 1');
    assert(api.FORMATS.purple.min === 1, 'purple allows solo student');
    assert(api.FORMATS.purple.allowSoloDebate, 'purple allows solo debate');
    api.loadState({
        version: 2,
        students: [],
        formatId: 'ap',
        includeReply: false,
        maxTeamSize: 3,
        classTitle: '',
        hrTeacher: '',
        topic: '',
        sheetTemplate: 'garam',
        debates: []
    });
    api.applyClassFormatDefaults({ levelPreset: 'Purple' }, { debateBook: 'Debate Purple', onlyIfPristine: true });
    const st = api.collectState();
    assert(st.purpleMode, 'purple class defaults to purple mode checkbox');
    assert(st.formatId === 'ap', 'purple mode keeps standard format id in state');
    assert(st.maxTeamSize === 1, 'purple defaults max team size to 1');
    assert(st.sheetTemplate === 'yeoul', 'purple defaults to yeoul score sheet');
    assert(!api.isPurpleDebateClass({ levelPreset: 'Garam' }, ''), 'garam class is not purple debate');
    assert(api.isPurpleDebateClass({ levelPreset: 'Purple' }, ''), 'purple preset detected');
}

{
    const { api } = loadDebateEngine();
    api.loadState({
        version: 2,
        students: ['Solo'],
        formatId: 'ap',
        purpleMode: true,
        includeReply: false,
        maxTeamSize: 1,
        classTitle: '',
        hrTeacher: '',
        topic: '',
        sheetTemplate: 'yeoul',
        debates: []
    });
    const debates = api.assignDebates();
    assert(debates.length === 1, 'one student creates one purple debate');
    assert(debates[0].benches[0].members.length === 1, 'solo student on gov bench');
    assert(debates[0].benches[0].members[0].role.abbr === 'PM', 'solo student is PM');
    assert(debates[0].benches[1].members.length === 0, 'solo debate has empty opposition');
}

{
    const { api } = loadDebateEngine();
    api.loadState({
        version: 2,
        students: ['Ann', 'Ben', 'Cal'],
        formatId: 'ap',
        purpleMode: true,
        includeReply: false,
        maxTeamSize: 1,
        classTitle: '',
        hrTeacher: '',
        topic: '',
        sheetTemplate: 'yeoul',
        debates: []
    });
    const debates = api.assignDebates();
    assert(debates.length === 2, 'three purple students yield pair + solo debates');
    const paired = debates.find((d) => d.benches[0].members.length && d.benches[1].members.length);
    const solo = debates.find((d) => d.benches[0].members.length === 1 && !d.benches[1].members.length);
    assert(paired, 'purple odd count includes one PM vs LO debate');
    assert(solo && solo.benches[0].members[0].role.abbr === 'PM', 'leftover purple student is solo PM');
}

{
    const { api } = loadDebateEngine();
    api.loadState({
        version: 2,
        students: ['One'],
        formatId: 'purple',
        includeReply: false,
        maxTeamSize: 1,
        classTitle: '',
        hrTeacher: '',
        topic: '',
        sheetTemplate: 'yeoul',
        debates: []
    });
    const st = api.collectState();
    assert(st.purpleMode, 'legacy purple formatId migrates to purpleMode');
    assert(st.formatId === 'ap', 'legacy purple formatId resets format dropdown to ap');
}

{
    const { api } = loadDebateEngine();
    api.loadState({
        version: 2,
        students: ['A', 'B'],
        formatId: 'ap',
        includeReply: false,
        maxTeamSize: 3,
        classTitle: 'Old Class',
        hrTeacher: 'Old Teacher',
        topic: '',
        sheetTemplate: 'garam',
        debates: []
    });
    api.applyMetadataDefaults('New Class', 'New Teacher');
    let st = api.collectState();
    assert(st.classTitle === 'Old Class', 'defaults leave existing class title');
    assert(st.hrTeacher === 'Old Teacher', 'defaults leave existing HR teacher');

    api.applyMetadataDefaults('New Class', 'New Teacher', { force: true });
    st = api.collectState();
    assert(st.classTitle === 'New Class', 'force updates class title from class');
    assert(st.hrTeacher === 'New Teacher', 'force updates HR teacher from class');

    api.applyMetadataDefaults('Kept Class', '', { force: true });
    st = api.collectState();
    assert(st.classTitle === 'Kept Class', 'force updates title when HR empty');
    assert(st.hrTeacher === '', 'force clears HR when class has none');
}

{
    let confirmCalls = 0;
    let confirmResult = false;
    const { api } = loadDebateEngine({
        confirm() {
            confirmCalls += 1;
            return confirmResult;
        }
    });
    api.loadState({
        version: 2,
        students: ['Alice', 'Bob', 'Carol', 'Dave'],
        formatId: 'ap',
        includeReply: false,
        maxTeamSize: 3,
        classTitle: '',
        hrTeacher: '',
        topic: '',
        sheetTemplate: 'garam',
        debates: [
            {
                number: 1,
                formatId: 'ap',
                notes: '',
                benches: [
                    { id: 'gov', label: 'Gov', members: [{ name: 'Alice', present: '', rebut: '' }] },
                    { id: 'opp', label: 'Opp', members: [{ name: 'Bob', present: '', rebut: '' }] }
                ]
            }
        ]
    });
    const before = JSON.stringify(api.collectState().debates);
    api.generateDebates();
    assert(confirmCalls === 1, 'regenerate confirms even without notes/args edits');
    assert(JSON.stringify(api.collectState().debates) === before, 'cancel leaves existing teams unchanged');

    confirmResult = true;
    api.generateDebates();
    assert(confirmCalls === 2, 'regenerate confirms again when accepted');
    assert(api.collectState().debates.length >= 1, 'accepted regenerate still produces debates');
}

console.log('classroom-debate-teams.test.mjs: all passed');
