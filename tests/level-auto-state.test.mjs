/**
 * Run: node tests/level-auto-state.test.mjs
 * Level Auto / Custom model (grade + colors) and "never write on load" guards (Phase 7).
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

const sandbox = { console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(readFileSync(path.join(root, 'js', 'level-profile.js'), 'utf8'), sandbox);
const lp = sandbox.CCPLevelProfile;

const YUMA = '\uC720\uB9C8';
const MID1 = '\uC9111';
const readable = () => '#1e293b';
const profile = (levelPreset) => lp.resolve({ levelPreset }, { readableTextOn: readable });
const navy = profile('Navy');
const purple = profile('Purple');
const yuma = profile(YUMA);

assert(JSON.stringify(Array.from(lp.AUTO_FIELDS)) === '["grade","colors"]', 'AUTO_FIELDS is grade + colors (D6 = A)');

// ---- deriveAutoState: old classes compare values (D7 = A) ----
let st = lp.deriveAutoState({ levelPreset: 'Navy', grade: '', color: '#1e3a8a' }, navy);
assert(st.grade === 'auto' && st.colors === 'auto', 'equal values → auto');
st = lp.deriveAutoState({ levelPreset: 'Navy', grade: '', color: '#1E3A8A' }, navy);
assert(st.colors === 'auto', 'hex compare is case-insensitive');
st = lp.deriveAutoState({ levelPreset: 'Navy', grade: '\uCD084', color: '#123456' }, navy);
assert(st.grade === 'custom' && st.colors === 'custom', 'different values → custom');
st = lp.deriveAutoState({ levelPreset: 'Navy' }, navy);
assert(st.grade === 'auto', 'empty grade + elementary → auto');
st = lp.deriveAutoState({ levelPreset: YUMA, grade: MID1, color: '#fef08a' }, yuma);
assert(st.grade === 'auto' && st.colors === 'auto', 'middle school grade + color → auto');
st = lp.deriveAutoState({ levelCustom: 'Foo', grade: 'x' }, profile(''));
assert(st.grade === 'none' && st.colors === 'none', 'unknown level → none');

// ---- deriveAutoState: migrated classes trust levelOverrides only ----
st = lp.deriveAutoState(
    { levelPreset: 'Navy', grade: '\uCD084', color: '#123456', levelProfileMigrated: 1, levelOverrides: {} },
    navy
);
assert(st.grade === 'auto' && st.colors === 'auto', 'migrated without overrides → auto even if values differ');
st = lp.deriveAutoState(
    { levelPreset: 'Navy', grade: '', color: '#1e3a8a', levelProfileMigrated: 1, levelOverrides: { colors: true } },
    navy
);
assert(st.grade === 'auto' && st.colors === 'custom', 'migrated overrides decide');

// ---- applyLevelChange ----
const formValues = { grade: '', color: '#1e3a8a', textColor: '#f8fafc', book: 'Keep me', totalLessons: 24, meetingDays: [1, 3, 5] };
let res = lp.applyLevelChange(formValues, { grade: 'auto', colors: 'auto' }, purple);
assert(res.values.color === '#9333ea', 'Auto color follows Purple');
assert(res.values.textColor === '#1e293b', 'Auto text color from readableTextOn');
assert(res.values.grade === '', 'Purple grade stays empty');
assert(res.changed.length === 1 && res.changed[0] === 'colors', 'only colors changed');
assert(res.values.book === 'Keep me' && res.values.totalLessons === 24, 'book / total lessons untouched');
assert(JSON.stringify(res.values.meetingDays) === '[1,3,5]', 'meeting days untouched');
assert(formValues.color === '#1e3a8a', 'input values not mutated');

res = lp.applyLevelChange(formValues, { grade: 'auto', colors: 'custom' }, purple);
assert(res.values.color === '#1e3a8a' && res.changed.length === 0, 'Custom color stays');
assert(res.autoState.colors === 'custom', 'Custom state kept');

res = lp.applyLevelChange({ grade: '', color: '#1e3a8a' }, { grade: 'auto', colors: 'auto' }, yuma);
assert(res.values.grade === MID1 && res.values.color === '#fef08a', 'Navy → 유마 fills grade + color');
assert(res.changed.length === 2, 'two settings changed');

res = lp.applyLevelChange({ grade: '\uCD084', color: '#123456' }, { grade: 'auto', colors: 'auto' }, profile('Foo'));
assert(res.values.grade === '\uCD084' && res.values.color === '#123456', 'unknown level leaves values');
assert(res.changed.length === 0, 'unknown level changes nothing');
assert(res.autoState.grade === 'auto', 'state kept for a later known level');

res = lp.applyLevelChange({ grade: '', color: '#9333ea' }, { grade: 'none', colors: 'none' }, purple);
assert(res.autoState.colors === 'auto' && res.autoState.grade === 'auto', 'none → compared against the new level');
assert(res.changed.length === 0, 'none fields are not rewritten');

// ---- buildLevelOverridesForSave ----
let out = lp.buildLevelOverridesForSave({ grade: '', color: '#1e3a8a' }, navy);
assert(out.levelProfileMigrated === 1 && JSON.stringify(out.levelOverrides) === '{}', 'all auto → empty overrides + flag');
out = lp.buildLevelOverridesForSave({ grade: '', color: '#123456' }, navy);
assert(out.levelOverrides.colors === true && !out.levelOverrides.grade, 'different color → colors override');
out = lp.buildLevelOverridesForSave({ grade: '', color: '#1e3a8a' }, navy, { grade: 'auto', colors: 'custom' });
assert(out.levelOverrides.colors === true, 'form state wins over value comparison');
const again = lp.buildLevelOverridesForSave({ grade: '', color: '#123456' }, navy);
assert(JSON.stringify(again) === JSON.stringify(lp.buildLevelOverridesForSave({ grade: '', color: '#123456' }, navy)), 'idempotent');
out = lp.buildLevelOverridesForSave({ grade: 'x', color: '#000000' }, profile('Foo'), null, {
    levelOverrides: { grade: true }
});
assert(!('levelProfileMigrated' in out), 'unknown level does not set the flag');
assert(out.levelOverrides.grade === true, 'unknown level keeps previous overrides');
out = lp.buildLevelOverridesForSave({ grade: 'x', color: '#000000' }, profile('Foo'));
assert(!('levelOverrides' in out) && !('levelProfileMigrated' in out), 'unknown level, nothing before → nothing written');

// ---- Guards: nothing written on load; handleClassSubmit copies the markers ----
function functionBody(source, name) {
    const start = source.indexOf(`function ${name}(`);
    assert(start >= 0, `${name} found`);
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < source.length; i += 1) {
        if (source[i] === '{') {
            depth += 1;
        } else if (source[i] === '}') {
            depth -= 1;
            if (depth === 0) {
                return source.slice(open, i + 1);
            }
        }
    }
    throw new Error(`${name} body not closed`);
}
const appSrc = readFileSync(path.join(root, 'app.js'), 'utf8');
const domainSrc = readFileSync(path.join(root, 'js', 'classroom-domain.js'), 'utf8');
const migrateData = functionBody(appSrc, 'migrateData');
const migrateClassroomData = functionBody(domainSrc, 'migrateClassroomData');
['levelOverrides', 'levelProfileMigrated'].forEach((field) => {
    assert(!migrateData.includes(field), `migrateData must not touch ${field}`);
    assert(!migrateClassroomData.includes(field), `migrateClassroomData must not touch ${field}`);
});
const submit = functionBody(appSrc, 'handleClassSubmit');
assert(/classData\.levelOverrides\s*=/.test(submit), 'handleClassSubmit assigns levelOverrides');
assert(/classData\.levelProfileMigrated\s*=/.test(submit), 'handleClassSubmit assigns levelProfileMigrated');
const suggestion = functionBody(appSrc, 'selectClassSuggestion');
assert(!suggestion.includes('levelOverrides'), 'class-name autocomplete never copies levelOverrides');

console.log('level-auto-state.test.mjs: all passed');
