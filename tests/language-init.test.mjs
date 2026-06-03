/**
 * Run: node tests/language-init.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'language-init.js')).href);

const Lang = globalThis.CCPLanguage;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const detect = Lang.detectLanguageFromPreferenceList;

assert(detect(['ko-KR']) === 'ko', 'ko-KR → ko');
assert(detect(['ko']) === 'ko', 'ko → ko');
assert(detect(['en-US']) === 'en', 'en-US → en');
assert(detect(['en']) === 'en', 'en → en');
assert(detect(['ja', 'fr']) === 'en', 'ja, fr only → en');
assert(detect(['ja', 'en-US']) === 'en', 'ja then en → en');
assert(detect(['ko', 'en']) === 'ko', 'ko before en → ko');
assert(detect(['ja', 'ko']) === 'ko', 'ja then ko → ko');
assert(detect([]) === 'en', 'empty list → en');
assert(detect(null) === 'en', 'null list → en');

const htmlPages = [
    'index.html',
    'workspace.html',
    'notes.html',
    'login.html',
    'pending-access.html',
    'help.html',
    'admin.html'
];
for (const page of htmlPages) {
    const fs = await import('fs');
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    assert(
        text.includes('js/language-init.js'),
        `${page} must load language-init.js in head`
    );
}

console.log('language-init.test.mjs: all passed');
