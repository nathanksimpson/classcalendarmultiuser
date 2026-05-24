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

console.log('books-editor.test.mjs: all passed');
