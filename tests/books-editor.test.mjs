/**
 * Run: node tests/books-editor.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'syllabus-curricula-data.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'syllabus-presets.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'books-editor.js')).href);

const { CCPBooksEditor } = globalThis;

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

const books = CCPBooksEditor.discoverBooks({});
const writeNow = books.find((b) => b.id === 'write-now');
assert(writeNow, 'write now book discovered');
assert(writeNow.presetIds.length === 3, 'three write now levels');
assert(writeNow.sessionCount === 20, 'write now 20 sessions');

const appData = { bookOverrides: {} };
CCPBooksEditor.saveBookTemplates('write-now', [
    { sessionNumber: 1, planTitle: 'Unit 1 Part 1', planDetail: 'CUSTOM-PAGES' }
], appData);
const tpl = CCPBooksEditor.getTemplatesForPresetId('preset-write-now-green', appData);
assert(tpl[0].planDetail === 'CUSTOM-PAGES', 'override applies to green preset');
assert(CCPBooksEditor.countBookOverrides(appData) === 1, 'one edited book');
assert(appData.curriculumOverrides && appData.curriculumOverrides['write-now'], 'migrated to curriculumOverrides');

const presetId = CCPBooksEditor.resolvePresetFromLevelAndBook('Green', 'write-now', appData);
assert(presetId === 'preset-write-now-green', 'level+book resolves preset');

const merged = CCPBooksEditor.buildMergedClassDefaults('write-now', presetId, appData);
assert(merged.defaultBook === 'Write Now', 'display book matches catalog not Write Now 1');

const msPreset = CCPBooksEditor.resolvePresetFromLevelAndBook('\uC720\uB9C8', CCPBooksEditor.NO_BOOK_CURRICULUM_ID, appData);
assert(msPreset === 'builtin-korean-multiweekly', 'middle school level without book resolves schedule preset');
const msMerged = CCPBooksEditor.buildLevelOnlyMergedDefaults('\uC720\uB9C8', appData);
assert(msMerged.defaultTotalLessons === 16, 'level-only default lesson count');
assert(msMerged.levelPreset === '\uC720\uB9C8', 'level-only keeps level');

const debatePreset = CCPBooksEditor.resolvePresetFromLevelAndBook(
    '\uD649\uC2A4',
    CCPBooksEditor.DEBATE_CURRICULUM_ID,
    appData
);
assert(debatePreset === 'builtin-debate', 'middle school debate curriculum resolves');
const debatePurple = CCPBooksEditor.resolvePresetFromLevelAndBook(
    'Purple',
    CCPBooksEditor.DEBATE_CURRICULUM_ID,
    appData
);
assert(debatePurple === 'builtin-debate', 'Purple debate curriculum resolves');
assert(
    CCPBooksEditor.resolvePresetFromLevelAndBook('Green', CCPBooksEditor.DEBATE_CURRICULUM_ID, appData) === null,
    'Green cannot use debate'
);
const debateInList = CCPBooksEditor.discoverBooks(appData).some((b) => b.id === CCPBooksEditor.DEBATE_CURRICULUM_ID);
assert(debateInList, 'Debate appears in curriculum list');
const debateBook = CCPBooksEditor.discoverBooks(appData).find((b) => b.isVirtualDebate);
assert(debateBook && debateBook.levels.includes('Purple'), 'Debate default includes Purple');

CCPBooksEditor.saveBookTemplates(
    CCPBooksEditor.DEBATE_CURRICULUM_ID,
    CCPBooksEditor.getFactoryDebateSessions(),
    appData,
    { applicableLevels: ['Purple'], classDefaults: { grade: '\uCD081', defaultTotalLessons: 4 } }
);
const after = CCPBooksEditor.getCurriculaForLevel('Purple', appData).map((b) => b.id);
assert(after.includes(CCPBooksEditor.DEBATE_CURRICULUM_ID), 'Debate applies to Purple after edit');
assert(
    !CCPBooksEditor.getCurriculaForLevel('Green', appData).some((b) => b.id === CCPBooksEditor.DEBATE_CURRICULUM_ID),
    'Debate removed from Green when limited to Purple'
);
const debateMerged = CCPBooksEditor.buildMergedClassDefaults(
    CCPBooksEditor.DEBATE_CURRICULUM_ID,
    debatePreset,
    appData,
    '\uD649\uC2A4'
);
assert(debateMerged.scheduleModel === 'debateMonthly', 'debate schedule model');
assert(debateMerged.defaultTotalLessons === 4, 'debate lesson count');

assert(
    CCPBooksEditor.isMiddleSchoolSimsonLevel('\uCE89\uCCB8'),
    '캉첸 (U+CCB8) is middle school'
);
assert(
    !CCPBooksEditor.isMiddleSchoolSimsonLevel('\uCE89\uCCA8'),
    'old typo 캉첨 (U+CCA8) is not in middle school set'
);

const customId = CCPBooksEditor.createCurriculum({ bookTitle: 'Test MS Reading' }, appData);
assert(customId, 'createCurriculum returns id');
const customBook = CCPBooksEditor.discoverBooks(appData).find((b) => b.id === customId);
assert(customBook && customBook.isCustom, 'custom appears in discover');
assert(customBook.sessionCount >= 1, 'custom starts with session row');

console.log('books-editor.test.mjs: all passed');
