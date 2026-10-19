/**
 * Run: node tests/level-profile.test.mjs
 * js/level-profile.js — level table, colors, debate bands, resolver (Phase 7).
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

function load(files) {
    const sandbox = { console };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    files.forEach((rel) => {
        vm.runInNewContext(readFileSync(path.join(root, rel), 'utf8'), sandbox, { filename: rel });
    });
    return sandbox;
}

const lpOnly = load(['js/level-profile.js']).CCPLevelProfile;
const curriculaAlone = load(['js/syllabus-curricula-data.js']).CCPCurriculaData;
const both = load(['js/level-profile.js', 'js/syllabus-curricula-data.js']);
const lp = both.CCPLevelProfile;
const curriculaWithProfile = both.CCPCurriculaData;
assert(lpOnly && lp, 'CCPLevelProfile loaded');
assert(curriculaAlone && curriculaWithProfile, 'CCPCurriculaData loaded');

const MID = ['\uC720\uB9C8', '\uB808\uC624', '\uD30C\uBCF4', '\uD3F4\uB77C', '\uD649\uC2A4', '\uD2F0\uCE74',
    '\uBE45\uD0A4', '\uBC14\uC774\uCEEC', '\uC548\uB098', '\uB0AD\uAC00', '\uB85C\uCCB4', '\uCE89\uCCB8'];
const ELEM = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Navy', 'Purple', 'Yeoul', 'Saemmul', 'Garam', 'Bada', 'Byeolmaru', 'Mirinae'];
const MID1 = '\uC9111';
const MID2 = '\uC9112';
const MID3 = '\uC9113';

// ---- Level list ----
const all = lp.getAllLevels();
assert(all.length === 37, `37 levels, got ${all.length}`);
assert(new Set(all.map((l) => l.id)).size === 37, 'level ids unique');
const expectedOrder = [...ELEM, ...MID.map((id) => `Pre ${id}`), ...MID];
assert(JSON.stringify(all.map((l) => l.id)) === JSON.stringify(expectedOrder), 'order elementary → pre-middle → middle');
all.filter((l) => l.preOf).forEach((l) => {
    assert(MID.includes(l.preOf), `${l.id} preOf points to a middle-school id`);
});
assert(lp.getLevelById('  Navy ').id === 'Navy', 'getLevelById trims');
assert(lp.getLevelById('navy') === null, 'getLevelById is case-sensitive');

// ---- Old getDefaultSimsonLevelColors values (pre-Phase-7 app.js), one per level ----
const OLD_COLORS = {
    Red: '#dc2626', Orange: '#ea580c', Yellow: '#facc15', Green: '#16a34a', Blue: '#2563eb',
    Navy: '#1e3a8a', Purple: '#9333ea', Yeoul: '#e8b8c4', Saemmul: '#d9a3a3', Garam: '#16a34a',
    Bada: '#16a34a', Byeolmaru: '#2563eb', Mirinae: '#2563eb'
};
const gradeColor = { [MID1]: '#fef08a', [MID2]: '#bbf7d0', [MID3]: '#bfdbfe' };
const OLD_GRADES = {};
MID.forEach((id, i) => {
    const grade = i < 4 ? MID1 : i < 8 ? MID2 : MID3;
    OLD_GRADES[id] = grade;
    OLD_COLORS[id] = gradeColor[grade];
    OLD_COLORS[`Pre ${id}`] = gradeColor[grade];
});
assert(Object.keys(OLD_COLORS).length === 37, 'old color snapshot covers 37 levels');

const readable = (hex) => `text-on-${hex}`;
all.forEach((level) => {
    const p = lp.resolve({ levelPreset: level.id }, { readableTextOn: readable });
    assert(p.known === true, `${level.id} known`);
    assert(p.levelId === level.id, `${level.id} levelId`);
    assert(['elementary', 'pre-middle', 'middle'].includes(p.groupId), `${level.id} groupId`);
    assert(p.colors && /^#[0-9a-f]{6}$/.test(p.colors.color), `${level.id} colors hex`);
    assert(p.colors.color === OLD_COLORS[level.id], `${level.id} color ${p.colors.color} === ${OLD_COLORS[level.id]}`);
    assert(p.colors.textColor === readable(p.colors.color), `${level.id} text color from readableTextOn`);
    assert(p.grade === (OLD_GRADES[level.id] || ''), `${level.id} grade ${p.grade}`);
    const band = lp.debateBandForLevel(level.id);
    assert(band === curriculaAlone.resolveDebateHomeworkBand(level.id), `${level.id} band matches curricula fallback`);
    assert(band === curriculaWithProfile.resolveDebateHomeworkBand(level.id), `${level.id} band matches curricula delegate`);
    assert(p.debate.band === band, `${level.id} profile debate band`);
    assert(
        p.debatePresetId === curriculaAlone.resolveDebatePresetId(level.id),
        `${level.id} debate preset id matches today`
    );
    if (level.id.startsWith('Pre ')) {
        assert(band === null, `${level.id} has no debate band (Q11 = A)`);
    }
});

// Band level lists equal today's literal lists (fallback path) for every band.
['purple', 'yeoulSaemmul', 'senior', 'nope'].forEach((band) => {
    assert(
        JSON.stringify(curriculaAlone.getDebateBandLevels(band)) === JSON.stringify(curriculaWithProfile.getDebateBandLevels(band)),
        `getDebateBandLevels(${band}) unchanged`
    );
});

// ---- Unknown / custom / legacy ----
[undefined, null, '', {}, { levelCustom: 'Foo' }, { levelPreset: 'A' }, { levelPreset: 'B' },
    { levelPreset: 'C' }, { levelPreset: 'navy' }, { level: 'Foo' }, 'Navy', 42].forEach((input) => {
    const p = lp.resolve(input, {
        listCurriculaForLevel: () => [{ id: 'x' }],
        matrix: { slots: [{ level: 'Navy', patternId: 'mwf' }] }
    });
    const label = JSON.stringify(input);
    assert(p.known === false, `${label} unknown`);
    assert(p.grade === '' && p.colors === null, `${label} neutral grade/colors`);
    assert(p.debate.band === null && p.debate.sheetTemplate === 'garam', `${label} neutral debate`);
    assert(p.curriculum.candidates.length === 0 && p.curriculum.single === null, `${label} empty curriculum`);
    assert(p.schedule.patterns.length === 0, `${label} empty schedule`);
});
assert(lp.resolveLevelId({ levelPreset: 'Foo', level: 'Navy' }) === 'Navy', 'falls back to legacy level');
assert(lp.resolveLevelId({ levelPreset: 'Purple', level: 'Navy' }) === 'Purple', 'preset wins');

// ---- Deps ----
const noDeps = lp.resolve({ levelPreset: 'Navy' });
assert(noDeps.curriculum.candidates.length === 0 && noDeps.schedule.patterns.length === 0, 'no deps → empty suggestions');
assert(noDeps.colors.textColor === '', 'no readableTextOn → empty text color');
const one = lp.resolve({ levelPreset: 'Navy' }, { listCurriculaForLevel: () => [{ id: 'b1', name: 'Book 1' }] });
assert(one.curriculum.single === 'b1' && one.curriculum.candidates[0].displayName === 'Book 1', 'single candidate');
const many = lp.resolve({ levelPreset: 'Navy' }, { listCurriculaForLevel: () => [{ id: 'b1' }, { id: 'b2' }] });
assert(many.curriculum.single === null && many.curriculum.candidates.length === 2, 'several candidates → no single');
const throwing = lp.resolve({ levelPreset: 'Navy' }, { listCurriculaForLevel: () => { throw new Error('x'); } });
assert(throwing.known && throwing.curriculum.candidates.length === 0, 'throwing dep never throws');
const matrix = {
    slots: [
        { level: 'Navy', patternId: 'tth' },
        { level: 'Navy', patternId: 'mwf' },
        { level: 'Red', patternId: 'mwf' }
    ]
};
assert(JSON.stringify(lp.resolve({ levelPreset: 'Navy' }, { matrix }).schedule.patterns) === '["mwf","tth"]', 'patterns ordered');
assert(JSON.stringify(lp.resolve({ levelPreset: 'Red' }, { matrix }).schedule.patterns) === '["mwf"]', 'single pattern');
assert(lp.resolve({ levelPreset: MID[0] }, { matrix }).schedule.patterns.length === 0, 'MS level has no patterns');
['mwf', 'tth'].forEach((pat) => {
    assert(lp.resolve({ levelPreset: 'Navy' }, { cohortPatternForClass: () => pat }).schedule.fromCohort === pat, `fromCohort ${pat}`);
});
['custom', '', null, 'weird'].forEach((pat) => {
    assert(lp.resolve({ levelPreset: 'Navy' }, { cohortPatternForClass: () => pat }).schedule.fromCohort === null, `fromCohort ignores ${pat}`);
});

// Real schedule matrix: elementary levels with slots offer both patterns.
const matrixData = load(['js/schedule-matrix-data.js']).CCPScheduleMatrixData;
assert(lp.resolve({ levelPreset: 'Navy' }, { matrix: matrixData }).schedule.patterns.length === 2, 'Navy runs MWF + TTh');

// ---- Debate defaults (Q1–Q3 = A) ----
Object.keys(lp.DEBATE_BAND_DEFAULTS).forEach((band) => {
    const row = lp.DEBATE_BAND_DEFAULTS[band];
    assert(row.includeReply === false, `${band} reply off`);
    assert(row.teamSize === 3, `${band} team size 3`);
    assert(row.formatId === 'ap', `${band} AP format`);
});
assert(lp.DEBATE_BAND_DEFAULTS.purple.sheetTemplate === 'yeoul' && lp.DEBATE_BAND_DEFAULTS.purple.purpleMode, 'purple row');
assert(lp.DEBATE_BAND_DEFAULTS.yeoulSaemmul.sheetTemplate === 'yeoul', 'yeoulSaemmul row → yeoul');
assert(lp.DEBATE_BAND_DEFAULTS.senior.sheetTemplate === 'garam', 'senior row → garam');
assert(lp.DEBATE_BAND_DEFAULTS.none.sheetTemplate === 'garam', 'none row → garam');
const weird = lp.debateDefaultsForBand('weird');
assert(weird.band === null && weird.sheetTemplate === 'garam' && !weird.purpleMode, 'unknown band → none row');
assert(lp.debateDefaultsForBand('purple').band === 'purple', 'band echoed');

// ---- Frozen tables ----
[lp.LEVEL_GROUPS, lp.LEVEL_GROUPS[0].levels[0], lp.LEVEL_COLORS.byLevel, lp.DEBATE_BAND_LEVELS.senior,
    lp.DEBATE_BAND_DEFAULTS.purple, lp.AUTO_FIELDS].forEach((obj, i) => {
    assert(Object.isFrozen(obj), `table ${i} frozen`);
});
const copy = lp.getAllLevels();
copy.push({ id: 'X' });
assert(lp.getAllLevels().length === 37, 'getAllLevels returns a copy');

console.log('level-profile.test.mjs: all passed');
