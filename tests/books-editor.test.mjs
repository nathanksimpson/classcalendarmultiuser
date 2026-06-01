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
const { CCPCurriculaData } = globalThis;

CCPBooksEditor.init({
    getAppData: () => ({}),
    saveData: () => {},
    t: (k) => k,
    getLang: () => 'en',
    canAdoptTeamCurriculumDefault: () => true
});

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function buildWriteNowRows(n, detailPrefix) {
    const rows = [];
    for (let i = 0; i < n; i += 1) {
        rows.push({
            sessionNumber: i + 1,
            planTitle: `Unit ${i + 1}`,
            planDetail: `${detailPrefix || 'PAGES'}-${i + 1}`,
            note: ''
        });
    }
    return rows;
}

const books = CCPBooksEditor.discoverBooks({});
const monsterPhonics = books.find((b) => b.id === 'monster-phonics');
assert(monsterPhonics, 'Monster Phonics book discovered');
assert(
    monsterPhonics.factoryPresetLevels.includes('Red')
    && monsterPhonics.factoryPresetLevels.includes('Orange')
    && monsterPhonics.factoryPresetLevels.includes('Yellow'),
    'Monster Phonics lists Red, Orange, Yellow'
);
const orangePhonicsPreset = CCPBooksEditor.resolvePresetFromLevelAndBook(
    'Orange',
    'monster-phonics',
    {}
);
assert(orangePhonicsPreset === 'preset-phonics-orange', 'Orange resolves to phonics orange preset');
const orangePhonicsElig = CCPBooksEditor.getCurriculumApplyEligibility(
    'Orange',
    'monster-phonics',
    {}
);
assert(orangePhonicsElig.ok && orangePhonicsElig.presetId === 'preset-phonics-orange', 'Orange can apply Monster Phonics');
assert(orangePhonicsElig.hasSyllabusTemplates, 'Orange apply uses Red session pages from shared book');

const writeNow = books.find((b) => b.id === 'write-now');
assert(writeNow, 'write now book discovered');
assert(writeNow.presetIds.length === 3, 'three write now levels');
assert(writeNow.sessionCount === 20, 'write now 20 sessions');

const debateBooks = books.filter((b) => b.programTrack === 'debate');
assert(debateBooks.length === 3, 'three debate curriculum books');
assert(debateBooks.some((b) => b.id === 'debate-purple'), 'debate purple book');
assert(debateBooks.some((b) => b.id === 'debate-garam-plus'), 'debate garam plus book');

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

const debateMsPreset = CCPBooksEditor.resolvePresetFromLevelAndBook(
    '\uD649\uC2A4',
    'debate-garam-plus',
    appData
);
assert(debateMsPreset === 'preset-debate-senior', 'middle school debate uses Garam+ preset');
const debatePurplePreset = CCPBooksEditor.resolvePresetFromLevelAndBook(
    'Purple',
    'debate-purple',
    appData
);
assert(debatePurplePreset === 'preset-debate-purple', 'Purple debate preset');
const debateYeoul = CCPBooksEditor.resolvePresetFromLevelAndBook(
    'Yeoul',
    'debate-yeoul-saemmul',
    appData
);
assert(debateYeoul === 'preset-debate-yeoul-saemmul', 'Yeoul debate preset');
assert(
    CCPBooksEditor.resolvePresetFromLevelAndBook('Green', 'debate-purple', appData) === null,
    'Green cannot use debate purple book'
);

const purpleTpl = CCPBooksEditor.getTemplatesForBookId('debate-purple', appData);
assert(purpleTpl.length === 6, 'purple debate has six day templates');
assert(purpleTpl[1].planDetail.includes('20-21'), 'purple day 2 page range');
const seniorTpl = CCPBooksEditor.getTemplatesForBookId('debate-garam-plus', appData);
assert(seniorTpl[1].planDetail.includes('20-25'), 'senior day 2 page range');
assert(seniorTpl[5].planDetail.includes('34-35'), 'senior day 4 example pages');

const purpleCurricula = CCPBooksEditor.getCurriculaForLevel('Purple', appData).map((b) => b.id);
assert(purpleCurricula.includes('debate-purple'), 'Purple sees debate purple book');
assert(!purpleCurricula.includes('debate-garam-plus'), 'Purple does not see Garam+ book');
const msCurricula = CCPBooksEditor.getCurriculaForLevel('\uD649\uC2A4', appData).map((b) => b.id);
assert(msCurricula.includes('debate-garam-plus'), 'MS level sees Garam+ debate book');
assert(!msCurricula.includes('debate-purple'), 'MS does not see purple debate book');

const legacyDebate = CCPBooksEditor.resolvePresetFromLevelAndBook(
    'Saemmul',
    CCPBooksEditor.DEBATE_CURRICULUM_ID,
    appData
);
assert(legacyDebate === 'preset-debate-yeoul-saemmul', 'legacy __debate__ id resolves by level');

const debateMerged = CCPBooksEditor.buildMergedClassDefaults(
    'debate-garam-plus',
    debateMsPreset,
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

assert(CCPCurriculaData.resolveDebateHomeworkBand('\uD649\uC2A4') === 'senior', 'MS band is senior');
assert(CCPCurriculaData.resolveDebateHomeworkBand('Purple') === 'purple', 'Purple band');

const customId = CCPBooksEditor.createCurriculum({ bookTitle: 'Test MS Reading' }, appData);
assert(customId, 'createCurriculum returns id');
const customBook = CCPBooksEditor.discoverBooks(appData).find((b) => b.id === customId);
assert(customBook && customBook.isCustom, 'custom appears in discover');
assert(customBook.sessionCount >= 1, 'custom starts with session row');

const adoptData = { bookOverrides: {}, curriculumOverrides: {} };
const factoryWriteNow = CCPBooksEditor.discoverBooks({}).find((b) => b.id === 'write-now');
const factoryRowsForAdopt = [];
for (let i = 0; i < (factoryWriteNow ? factoryWriteNow.factorySessionCount : 20); i += 1) {
    factoryRowsForAdopt.push({
        sessionNumber: i + 1,
        planTitle: `Factory row ${i + 1}`,
        planDetail: 'same-as-shipped',
        note: ''
    });
}
CCPBooksEditor.saveBookTemplates('write-now', factoryRowsForAdopt, adoptData);
CCPBooksEditor.adoptTeamDefault('write-now', factoryRowsForAdopt, adoptData, {
    classDefaults: { defaultTotalLessons: factoryRowsForAdopt.length }
});
const sameCountAdopt = CCPBooksEditor.discoverBooks(adoptData).find((b) => b.id === 'write-now');
assert(
    adoptData.curriculumOverrides['write-now'].sessions
    && adoptData.curriculumOverrides['write-now'].sessions.length === factoryRowsForAdopt.length,
    'adopt keeps curriculum sessions when count matches shipped factory'
);
assert(sameCountAdopt && !sameCountAdopt.hasOverride, 'no override when working copy matches team default');

const adoptRows = buildWriteNowRows(22, 'ADOPT');
CCPBooksEditor.saveBookTemplates('write-now', adoptRows, adoptData);
let adoptBook = CCPBooksEditor.discoverBooks(adoptData).find((b) => b.id === 'write-now');
assert(adoptBook && adoptBook.hasOverride, '22 sessions differs from shipped factory before adopt');
assert(
    adoptBook.sessionCount === 22 && adoptBook.factorySessionCount === 20,
    'write-now counts before adopt'
);
CCPBooksEditor.adoptTeamDefault('write-now', adoptRows, adoptData, {
    classDefaults: { defaultTotalLessons: 22 }
});
adoptBook = CCPBooksEditor.discoverBooks(adoptData).find((b) => b.id === 'write-now');
assert(adoptBook && !adoptBook.hasOverride, 'no edited badge when sessions match team default');
assert(adoptBook.baselineSessionCount === 22, 'baseline session count is 22');
assert(
    CCPBooksEditor.getEffectiveSessionBaselineCount('write-now', adoptData, 20) === 22,
    'effective baseline uses team default'
);
const teamRec = adoptData.curriculumOverrides['write-now'].teamDefault;
assert(teamRec && teamRec.sessions.length === 22, 'teamDefault snapshot stored');

const dirtyRows = buildWriteNowRows(23, 'DIRTY');
CCPBooksEditor.saveBookTemplates('write-now', dirtyRows, adoptData);
adoptBook = CCPBooksEditor.discoverBooks(adoptData).find((b) => b.id === 'write-now');
assert(adoptBook && adoptBook.hasOverride, 'editing away from team default shows override again');

CCPBooksEditor.restoreFromTeamDefault('write-now', adoptData);
const restoredTpl = CCPBooksEditor.getTemplatesForBookId('write-now', adoptData);
assert(restoredTpl.length === 22, 'restoreFromTeamDefault restores 22 sessions');
assert(restoredTpl[0].planDetail === 'ADOPT-1', 'restored content matches team default');

const orangeData = { bookOverrides: {}, curriculumOverrides: {} };
const orangeId = CCPBooksEditor.createCurriculum({ bookTitle: 'Hand in Hand Orange' }, orangeData);
assert(orangeId === 'hand-in-hand-orange', 'Hand in Hand Orange custom id slug');
const orangeRows = buildWriteNowRows(12, 'ORANGE');
CCPBooksEditor.saveBookTemplates(orangeId, orangeRows, orangeData);
CCPBooksEditor.adoptTeamDefault(orangeId, orangeRows, orangeData, {
    classDefaults: { defaultTotalLessons: 12 }
});
assert(
    orangeData.curriculumOverrides[orangeId].teamDefault
    && orangeData.curriculumOverrides[orangeId].teamDefault.sessions.length === 12,
    'custom orange teamDefault stored'
);
assert(orangeData.curriculumOverrides[orangeId].isCustom, 'custom flag kept after adopt');
assert(
    orangeData.curriculumOverrides[orangeId].sessions
    && orangeData.curriculumOverrides[orangeId].sessions.length === 12,
    'sessions persisted on custom orange id'
);
const orangeBook = CCPBooksEditor.discoverBooks(orangeData).find((b) => b.id === orangeId);
assert(orangeBook && !orangeBook.hasOverride, 'custom orange no override when matching team default');
assert(orangeBook.baselineSessionCount === 12, 'custom orange baseline from team default');

const teacherResetData = { bookOverrides: {}, curriculumOverrides: {} };
CCPBooksEditor.adoptTeamDefault(
    'write-now',
    buildWriteNowRows(22, 'TEAM'),
    teacherResetData,
    {}
);
CCPBooksEditor.saveBookTemplates('write-now', buildWriteNowRows(23, 'WORK'), teacherResetData);
CCPBooksEditor.init({
    getAppData: () => teacherResetData,
    saveData: () => {},
    t: (k) => k,
    getLang: () => 'en',
    canAdoptTeamCurriculumDefault: () => false
});
CCPBooksEditor.resetBookToFactory('write-now', teacherResetData);
const afterTeacherReset = CCPBooksEditor.getTemplatesForBookId('write-now', teacherResetData);
assert(afterTeacherReset.length === 20, 'teacher reset restores shipped factory session count');
assert(
    teacherResetData.curriculumOverrides['write-now'].teamDefault.sessions.length === 22,
    'teacher reset keeps teamDefault on calendar'
);

const eligAppData = { bookOverrides: {}, curriculumOverrides: {}, defaultClassTypeOverrides: {} };

const rcGreenBook = CCPBooksEditor.getCurriculaForLevel('Green', eligAppData).find((b) =>
    (b.name || '').includes('50/80')
);
assert(rcGreenBook, 'RC Green-Blue book listed for Green level');
const rcOk = CCPBooksEditor.getCurriculumApplyEligibility('Green', rcGreenBook.id, eligAppData);
assert(rcOk.ok && rcOk.presetId === 'preset-rc-green-blue', 'Green + RC book is eligible');
assert(rcOk.hasSyllabusTemplates, 'RC Green-Blue has syllabus templates');

const rcStubBook = CCPBooksEditor.getCurriculaForLevel('Purple', eligAppData).find((b) =>
    (b.name || '').toLowerCase().includes('rc')
);
if (rcStubBook) {
    const stubElig = CCPBooksEditor.getCurriculumApplyEligibility('Purple', rcStubBook.id, eligAppData);
    assert(stubElig.ok, 'RC Purple stub can apply');
    assert(!stubElig.hasSyllabusTemplates, 'RC Purple stub has no templates');
    assert(stubElig.reason === 'noSyllabusTemplates', 'stub reason flagged');
}

const noLevel = CCPBooksEditor.getCurriculumApplyEligibility('', rcGreenBook.id, eligAppData);
assert(noLevel.reason === 'noLevel' && !noLevel.ok, 'empty level blocked');

const emptyLevel = '__test_level_no_curriculum_books__';
assert(
    CCPBooksEditor.getCurriculaForLevel(emptyLevel, eligAppData).length === 0,
    'synthetic level has no curriculum books'
);
const noBooksElig = CCPBooksEditor.getCurriculumApplyEligibility(
    emptyLevel,
    CCPBooksEditor.NO_BOOK_CURRICULUM_ID,
    eligAppData
);
assert(
    noBooksElig.reason === 'noBooksForLevel' && noBooksElig.needsConfirm && noBooksElig.ok,
    'level with no books: confirm before generic no-book apply'
);

const badMatch = CCPBooksEditor.getCurriculumApplyEligibility(
    'Blue',
    rcGreenBook.id,
    eligAppData
);
assert(badMatch.reason === 'bookLevelMismatch' && !badMatch.ok, 'Blue level cannot use RC book without Blue in applicability');

const factoryRows = CCPBooksEditor.getTemplatesForBookId('monster-phonics', {});
assert(factoryRows.length > 0, 'Monster Phonics has factory session rows');
const mpAppData = { bookOverrides: {}, curriculumOverrides: {} };
CCPBooksEditor.saveBookTemplates('monster-phonics', factoryRows, mpAppData, {
    applicableLevels: ['Red', 'Orange', 'Yellow']
});
assert(
    CCPBooksEditor.getCurriculaForLevel('Orange', mpAppData).some((b) => b.id === 'monster-phonics'),
    'saved applicability: Orange sees Monster Phonics on class form'
);

const multiLevelAppData = {
    bookOverrides: {},
    curriculumOverrides: {
        [rcGreenBook.id]: { applicableLevels: ['Green', 'Blue'] }
    }
};
assert(
    CCPBooksEditor.getCurriculaForLevel('Blue', multiLevelAppData).some((b) => b.id === rcGreenBook.id),
    'RC book lists for Blue when applicability includes Blue'
);
const blueRcOk = CCPBooksEditor.getCurriculumApplyEligibility(
    'Blue',
    rcGreenBook.id,
    multiLevelAppData
);
assert(
    blueRcOk.ok && blueRcOk.presetId === 'preset-rc-green-blue',
    'Blue + RC book applies when curriculum allows multiple levels'
);

const debateRestrictData = { bookOverrides: {}, curriculumOverrides: {} };
const debatePurpleRows = CCPBooksEditor.getTemplatesForBookId('debate-purple', {});
CCPBooksEditor.saveBookTemplates('debate-purple', debatePurpleRows, debateRestrictData, {
    applicableLevels: ['Purple']
});
const purpleOnlyDebate = CCPBooksEditor.getCurriculaForLevel('Purple', debateRestrictData).map((b) => b.id);
assert(
    purpleOnlyDebate.includes('debate-purple'),
    'debate-purple listed for Purple when applicability is Purple only'
);
const yeoulDebateRestricted = CCPBooksEditor.getCurriculaForLevel('Yeoul', debateRestrictData).map((b) => b.id);
assert(
    !yeoulDebateRestricted.includes('debate-purple'),
    'debate-purple hidden for Yeoul when applicability excludes Yeoul'
);

const writeNowRestrictData = { bookOverrides: {}, curriculumOverrides: {} };
const writeNowFactoryRows = CCPBooksEditor.getTemplatesForBookId('write-now', {});
CCPBooksEditor.saveBookTemplates('write-now', writeNowFactoryRows, writeNowRestrictData, {
    applicableLevels: ['Green']
});
assert(
    CCPBooksEditor.getCurriculaForLevel('Green', writeNowRestrictData).some((b) => b.id === 'write-now'),
    'write-now listed for Green when restricted to Green'
);
assert(
    !CCPBooksEditor.getCurriculaForLevel('Orange', writeNowRestrictData).some((b) => b.id === 'write-now'),
    'write-now hidden for Orange when restricted to Green only'
);

console.log('books-editor.test.mjs: all passed');
