/**
 * Eng/Kor level names: TMS class names → levels, recommended TMS matches, search.
 * Names below are real ones from the live calendars (Nov 2026).
 * Run: node tests/level-names.test.mjs
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

const sandbox = { console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(readFileSync(path.join(root, 'js', 'level-profile.js'), 'utf8'), sandbox);
const L = sandbox.CCPLevelProfile;

// Every level has English and Korean
L.getAllLevels().forEach((def) => {
    const names = L.getLevelNames(def.id);
    assert(names && names.en && names.ko, `${def.id} has English and Korean`);
});

// Parsing: TMS form and ClassManager form agree
const cases = [
    ['샘물M^2609', 'Saemmul', 'm'],
    ['Saemmul M', 'Saemmul', 'm'],
    ['가람T^2609', 'Garam', 't'],
    ['가람 T', 'Garam', 't'],
    ['BlueT^2609', 'Blue', 't'],
    ['NavyM_26SP', 'Navy', 'm'],
    ['별마루M^2606', 'Byeolmaru', 'm'],
    ['Byeomaru M', 'Byeolmaru', 'm'],
    ['유마M^2606', '유마', 'm'],
    ['Yuma T- News', '유마', 't'],
    ['pre폴라M^2609', 'Pre 폴라', 'm'],
    ['Pre 폴라', 'Pre 폴라', ''],
    ['Pre 포라 M', 'Pre 폴라', 'm'],
    ['Pre Leo T News', 'Pre 레오', 't'],
    ['Kanchen M Debate', '캉첸', 'm'],
    ['바이칼T', '바이컬', 't'],
    ['바이컬 M', '바이컬', 'm'],
    ['Baikal M', '바이컬', 'm'],
    ['[잠실] 파보T^2609', '파보', 't']
];
cases.forEach(([name, levelId, section]) => {
    const p = L.parseClassName(name);
    assert(p, `${name} parses`);
    assert(p.levelId === levelId, `${name} → ${levelId} (got ${p.levelId})`);
    assert(p.section === section, `${name} section ${section || '(none)'} (got ${p.section || '(none)'})`);
});
assert(L.parseClassName('PrepM^2606') === null, 'Prep is not a level');
assert(L.parseClassName('Purple M').levelId === 'Purple', 'Purple is not read as Pre + level');
assert(L.parseClassName('') === null, 'empty name');

// Display: 바이컬 id shows the corrected spelling
assert(L.levelDisplayName('바이컬', 'ko') === '바이칼', 'Baikal shows as 바이칼');
assert(L.levelDisplayName('바이컬', 'en') === 'Baikal', 'Baikal in English');
assert(L.levelDisplayName('Saemmul', 'ko') === '샘물', 'Korean display');

// Recommended matches against the Fall Term cohorts
const cohorts = [
    'Blue M', 'Blue T', 'Green M', 'Leo M', 'Navy M', 'Navy T', 'Pre Leo M', 'Pre Leo T',
    'Pre Yuma M', 'Pre Yuma T', 'Pre 폴라', 'Purple M', 'Purple T', 'Saemmul M', 'Yellow M',
    'Yeoul M', 'Yuma M', 'Yuma T', '가람 M', '가람 T', '바다 T', '샘물 T', '파보 T'
].map((name, i) => ({ id: `c${i}`, name }));
const match = (tms) => {
    const hit = L.matchByLevelName(tms, cohorts);
    return hit ? hit.name : null;
};
assert(match('샘물M^2609') === 'Saemmul M', '샘물M → Saemmul M');
assert(match('샘물T^2609') === '샘물 T', '샘물T → 샘물 T');
assert(match('여울M^2609') === 'Yeoul M', '여울M → Yeoul M');
assert(match('pre폴라M^2609') === 'Pre 폴라', 'pre폴라M → the one Pre 폴라 cohort (no section)');
assert(match('유마T^2606') === 'Yuma T', '유마T → Yuma T, not Pre Yuma T');
assert(match('PurpleT^2609') === 'Purple T', 'English TMS names still match');
assert(match('별마루M^2606') === null, 'no Byeolmaru cohort → no suggestion');
assert(match('PrepM^2606') === null, 'unknown level → no suggestion');
// Ambiguous: two same-level, same-section cohorts → no guess
assert(L.matchByLevelName('가람M', [{ id: 'a', name: 'Garam M' }, { id: 'b', name: '가람 M' }]) === null, 'two Garam M → no suggestion');

// Search names
const hay = L.searchNamesForClass({ name: 'Saemmul M', levelPreset: 'Saemmul' });
assert(hay.includes('샘물') && hay.includes('Saemmul'), 'search has both languages');
assert(L.searchNamesForClass({ name: 'Polar M Debate', levelPreset: '폴라' }).includes('폴라'), 'Polar class searchable by 폴라');
assert(L.searchNamesForClass({ name: 'Pre 폴라 M' }).includes('Pre Polar'), 'Pre class searchable in English');

console.log('level-names.test.mjs: all passed');
