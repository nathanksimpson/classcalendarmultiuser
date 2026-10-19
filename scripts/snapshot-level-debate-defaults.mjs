/**
 * Golden snapshot of level-driven debate defaults (Phase 7 parity guard).
 *
 * Run: node scripts/snapshot-level-debate-defaults.mjs
 *   Rewrites tests/fixtures/level-debate-golden.json from the current code.
 *   Only re-run on purpose (when a debate default is meant to change).
 *
 * tests/level-debate-defaults.test.mjs imports computeLevelDebateOutputs()
 * and compares it to the fixture, with and without js/level-profile.js.
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import vm from 'vm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GOLDEN_PATH = path.join(root, 'tests', 'fixtures', 'level-debate-golden.json');

/** Every Simson level id (elementary, pre-middle, middle) — same list as the class form. */
const MIDDLE_IDS = [
    '\uC720\uB9C8', '\uB808\uC624', '\uD30C\uBCF4', '\uD3F4\uB77C',
    '\uD649\uC2A4', '\uD2F0\uCE74', '\uBE45\uD0A4', '\uBC14\uC774\uCEEC',
    '\uC548\uB098', '\uB0AD\uAC00', '\uB85C\uCCB4', '\uCE89\uCCB8'
];
export const ALL_LEVEL_IDS = [
    'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Navy', 'Purple',
    'Yeoul', 'Saemmul', 'Garam', 'Bada', 'Byeolmaru', 'Mirinae',
    ...MIDDLE_IDS.map((id) => `Pre ${id}`),
    ...MIDDLE_IDS
];

const CUSTOM_LEVEL_TEXTS = [
    '', 'Foo', 'A', '\uC5EC\uC6B8 M', '\uD37C\uD50C', '\uC0D8\uBB3C', 'saemul', 'Yeoul Debate'
];

const EXTRA_CLASS_INPUTS = [
    { levelPreset: 'Foo', level: 'Purple' },
    { levelPreset: 'Navy', level: 'Yeoul' },
    { levelPreset: ' Purple ' },
    { levelPreset: 'purple' },
    { levelPreset: 'navy' },
    { level: 'Saemmul' },
    { level: 'Purple', levelCustom: 'Foo' },
    { levelPreset: 'Garam', levelCustom: '\uC5EC\uC6B8' },
    { levelPreset: 'A' },
    { levelPreset: 'B', levelCustom: '\uD37C\uD50C' }
];

const BOOKS = [
    '', 'Debate Purple', 'Yeoul Debate', '\uC0D8\uBB3C Debate',
    'Garam Debate', 'Byeolmaru Debate', '\uBCC4\uB9C8\uB8E8 Debate'
];

function baseClassInputs() {
    const list = [];
    ALL_LEVEL_IDS.forEach((id) => list.push({ levelPreset: id }));
    ALL_LEVEL_IDS.forEach((id) => list.push({ levelCustom: id }));
    CUSTOM_LEVEL_TEXTS.forEach((text) => list.push({ levelCustom: text }));
    EXTRA_CLASS_INPUTS.forEach((c) => list.push({ ...c }));
    return list;
}

/** Each base class × each book, passed as the debateBook argument and as classData.book. */
export function buildInputs() {
    const out = [];
    baseClassInputs().forEach((c) => {
        BOOKS.forEach((book) => {
            out.push({ classData: { ...c }, debateBook: book });
            if (book) {
                out.push({ classData: { ...c, book }, debateBook: '' });
            }
        });
    });
    return out;
}

function engineStates() {
    const base = {
        version: 2,
        students: [],
        classTitle: '',
        hrTeacher: '',
        topic: ''
    };
    return {
        pristine: { ...base, formatId: 'ap', purpleMode: false, includeReply: false, maxTeamSize: 3, sheetTemplate: 'garam', debates: [] },
        dirty: { ...base, formatId: 'bp', purpleMode: false, includeReply: true, maxTeamSize: 4, sheetTemplate: 'yeoul', debates: [] },
        purpleLeftover: { ...base, formatId: 'ap', purpleMode: true, includeReply: false, maxTeamSize: 1, sheetTemplate: 'yeoul', debates: [] },
        withTeams: {
            ...base,
            students: ['(Stuaa)', '(Stuab)'],
            formatId: 'ap',
            purpleMode: false,
            includeReply: false,
            maxTeamSize: 3,
            sheetTemplate: 'garam',
            debates: [{ number: 1, benches: [] }]
        }
    };
}

const ENGINE_OPTIONS = {
    force: { forceForNewSession: true },
    pristineOnly: { onlyIfPristine: true },
    stored: { onlyIfPristine: false },
    plain: {}
};

export function loadDebateSandbox({ withProfile }) {
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        alert() {},
        confirm: () => true,
        document: {
            createElement() {
                return { style: {}, click() {} };
            },
            body: { appendChild() {}, removeChild() {} }
        },
        navigator: {}
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    const files = ['js/utils.js'];
    if (withProfile) {
        files.push('js/level-profile.js');
    }
    files.push('js/classroom-domain.js', 'js/debate/debate-teams-v2.js');
    files.forEach((rel) => {
        vm.runInNewContext(readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
    });
    return sandbox;
}

function engineSummary(st) {
    return [
        st.purpleMode ? 1 : 0,
        st.formatId,
        st.includeReply ? 1 : 0,
        st.maxTeamSize,
        st.sheetTemplate
    ].join('|');
}

/**
 * @returns {{ stateKeys: string[], optionKeys: string[], cases: object[], reshaped: string[] }}
 */
export function computeLevelDebateOutputs({ withProfile = false } = {}) {
    const sandbox = loadDebateSandbox({ withProfile });
    const engine = sandbox.CCPDebateTeamsV2;
    const domain = sandbox.CCPClassroomDomain;
    const states = engineStates();
    const stateKeys = Object.keys(states);
    const optionKeys = Object.keys(ENGINE_OPTIONS);
    const reshaped = [];
    const cases = buildInputs().map((input, idx) => {
        const engineOut = [];
        stateKeys.forEach((sk) => {
            optionKeys.forEach((ok) => {
                engine.loadState(JSON.parse(JSON.stringify(states[sk])));
                const before = JSON.stringify(engine.collectState());
                engine.applyClassFormatDefaults(
                    JSON.parse(JSON.stringify(input.classData)),
                    { ...ENGINE_OPTIONS[ok], debateBook: input.debateBook }
                );
                const after = engine.collectState();
                if (sk === 'withTeams' && JSON.stringify(after) !== before) {
                    reshaped.push(`${idx}:${sk}:${ok}`);
                }
                engineOut.push(engineSummary(after));
            });
        });
        return {
            classData: input.classData,
            debateBook: input.debateBook,
            isPurple: !!engine.isPurpleDebateClass(input.classData, input.debateBook),
            sheet: domain.defaultDebateSheetTemplate(input.classData, input.debateBook),
            engine: engineOut
        };
    });
    return { stateKeys, optionKeys, cases, reshaped };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
    const out = computeLevelDebateOutputs({ withProfile: false });
    const payload = {
        note: 'Generated by scripts/snapshot-level-debate-defaults.mjs from the pre-Phase-7 debate code. Engine strings: purpleMode|formatId|includeReply|maxTeamSize|sheetTemplate.',
        stateKeys: out.stateKeys,
        optionKeys: out.optionKeys,
        cases: out.cases
    };
    writeFileSync(GOLDEN_PATH, `${JSON.stringify(payload)}\n`, 'utf8');
    console.log(`Wrote ${out.cases.length} cases to ${path.relative(root, GOLDEN_PATH)}; reshaped=${out.reshaped.length}`);
}
