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

const api = globalThis.CCPSyllabusTemplates;
assert.ok(api, 'CCPSyllabusTemplates loaded');

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

console.log('syllabus-tab.test.mjs: all passed');
