/**
 * Run: node tests/syllabus-tab.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'syllabus-templates.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'syllabus-curricula-data.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'syllabus-presets.js')).href);

const api = globalThis.CCPSyllabusTemplates;
const curricula = globalThis.CCPCurriculaData;
assert.ok(api, 'CCPSyllabusTemplates loaded');
assert.ok(curricula, 'CCPCurriculaData loaded');

const rows = [
    { id: '1', kind: 'lesson', sessionNumber: 1, planTitle: 'Old', planDetail: '', source: 'generated' },
    { id: '2', kind: 'lesson', sessionNumber: 2, planTitle: 'L2', planDetail: '', source: 'generated' }
];
const templates = [
    { sessionNumber: 1, planTitle: 'Unit 1', planDetail: 'Pages 1-3' },
    { sessionNumber: 2, planTitle: 'Unit 2', planDetail: 'Pages 4-6' }
];
const result = api.applyRowTemplatesToSyllabusRows(rows, templates);
assert.equal(result.applied, 2);
assert.equal(result.rows[0].planDetail, 'Pages 1-3');
assert.equal(result.rows[0].source, 'manual');

const collected = api.collectTemplateFromEditor(
    [{ id: 'u1', title: 'U1', notes: '', speakingPages: '', writingPages: '' }],
    result.rows
);
assert.equal(collected.rowTemplates.length, 2);
assert.equal(collected.syllabusUnits.length, 1);

// Title is the canonical link: Unit 1 Part 1 always gets that block's pages
{
    const misnumbered = [
        {
            id: 'x',
            kind: 'lesson',
            sessionNumber: 9,
            lessonNumber: 9,
            planTitle: 'Unit 1 Part 1',
            planDetail: '',
            source: 'generated'
        }
    ];
    const wnTemplates = [
        { sessionNumber: 1, planTitle: 'Unit 1 Part 1', planDetail: 'PAGES-UNIT-1-PART-1' },
        { sessionNumber: 9, planTitle: 'Unit 5 Part 1', planDetail: 'PAGES-UNIT-5-PART-1' }
    ];
    const linked = api.applyRowTemplatesToSyllabusRows(misnumbered, wnTemplates);
    assert.equal(linked.applied, 1);
    assert.equal(linked.rows[0].planDetail, 'PAGES-UNIT-1-PART-1', 'pages follow plan title not class #');
}

const keptDetail = [
    { id: 'k1', kind: 'lesson', sessionNumber: 1, planTitle: 'Custom title', planDetail: 'Old pages', source: 'manual' }
];
const forceResult = api.applyRowTemplatesToSyllabusRows(keptDetail, templates, { force: true });
assert.equal(forceResult.applied, 1);
assert.equal(forceResult.rows[0].planTitle, 'Unit 1');
assert.equal(forceResult.rows[0].planDetail, 'Pages 1-3');

const noteRows = [
    { id: 'n1', kind: 'lesson', sessionNumber: 1, planTitle: 'Unit 1', planDetail: 'Pages 1-3', note: 'Old row note', source: 'manual' }
];
const noteTemplates = [
    { sessionNumber: 1, planTitle: 'Unit 1', planDetail: 'Pages 1-3', note: 'Curriculum session note' }
];
const noteForce = api.applyRowTemplatesToSyllabusRows(noteRows, noteTemplates, { force: true });
assert.equal(noteForce.rows[0].note, 'Curriculum session note', 'force refresh overwrites row note');

// --- Curriculum expand helpers (Write Right / Write Now / Early Writers) ---
assert.equal(api.getBookSessionCount(templates), 2);
assert.equal(api.countFillableLessonRows(rows), 2);
assert.equal(
    api.shouldOfferLessonExpand({
        isDebateMonthly: false,
        hasExistingClassId: true,
        classLessonCount: 8,
        bookSessionCount: 18
    }),
    true,
    'offer expand when book longer than class'
);
assert.equal(
    api.shouldOfferLessonExpand({
        isDebateMonthly: true,
        hasExistingClassId: true,
        classLessonCount: 4,
        bookSessionCount: 18
    }),
    false,
    'never offer expand for debate monthly'
);
assert.equal(
    api.shouldOfferLessonExpand({
        isDebateMonthly: false,
        hasExistingClassId: false,
        classLessonCount: 8,
        bookSessionCount: 18
    }),
    false,
    'no expand prompt for unsaved new class'
);
assert.equal(
    api.shouldOfferLessonExpand({
        isDebateMonthly: false,
        hasExistingClassId: true,
        classLessonCount: 18,
        bookSessionCount: 18
    }),
    false,
    'no expand when counts already match'
);

function makeLessonRows(n) {
    const out = [];
    for (let i = 1; i <= n; i += 1) {
        out.push({
            id: `r${i}`,
            kind: 'lesson',
            sessionNumber: i,
            lessonNumber: i,
            planTitle: `Lesson ${i}`,
            planDetail: '',
            source: 'generated'
        });
    }
    return out;
}

function assertBookFill(label, presetId, expectedCount, shortCount) {
    const preset = curricula.getById(presetId);
    assert.ok(preset, `${label} preset exists`);
    const bookTpl = preset.defaultSyllabusRowTemplates || [];
    assert.equal(api.getBookSessionCount(bookTpl), expectedCount, `${label} book session count`);

    // expand=no: only shortCount rows filled
    const shortRows = makeLessonRows(shortCount);
    const partial = api.applyRowTemplatesToSyllabusRows(shortRows, bookTpl, { force: true });
    assert.equal(partial.applied, shortCount, `${label} partial fill applies ${shortCount}`);
    assert.equal(api.countFillableLessonRows(partial.rows), shortCount);
    assert.ok(
        partial.rows.every((r) => String(r.planDetail || '').trim().length > 0),
        `${label} short rows all got planDetail`
    );
    assert.ok(
        expectedCount > shortCount,
        `${label} book longer than short class (partial case)`
    );

    // expand=yes: rebuild to book length then fill all
    const fullRows = makeLessonRows(expectedCount);
    const full = api.applyRowTemplatesToSyllabusRows(fullRows, bookTpl, { force: true });
    assert.equal(full.applied, expectedCount, `${label} expand fill applies all ${expectedCount}`);
    assert.ok(
        full.rows[shortCount] && String(full.rows[shortCount].planDetail || '').trim(),
        `${label} session ${shortCount + 1} filled after expand`
    );
    const last = full.rows[expectedCount - 1];
    assert.ok(last && String(last.planDetail || '').trim(), `${label} last session filled`);
}

assertBookFill('Write Right Green', 'preset-wr-sp-green', 18, 8);
assertBookFill('Write Now Green', 'preset-write-now-green', 20, 8);
assertBookFill('Early Writers Green', 'preset-early-writers-green', 21, 8);

// Write Right: after expand, project days (sessions 17–18) present
{
    const wr = curricula.getById('preset-wr-sp-green').defaultSyllabusRowTemplates;
    const full = api.applyRowTemplatesToSyllabusRows(makeLessonRows(18), wr, { force: true });
    assert.ok(
        full.rows[16].planTitle.includes('Writing Project'),
        'WR session 17 is Writing Project'
    );
    assert.ok(
        full.rows[4].planTitle.includes('Lesson 3A') || full.rows[4].planDetail.includes('SB'),
        'WR session 5 (week 3) filled — past first four weeks'
    );
}

console.log('syllabus-tab.test.mjs: all passed');
