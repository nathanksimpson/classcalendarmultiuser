/**
 * Run: node tests/i18n-parity.test.mjs
 * Or: npm test (runs with language-init.test.mjs)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

function extractObjectKeys(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    assert(start >= 0, `Missing marker: ${startMarker}`);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert(end >= 0, `Missing end marker after: ${startMarker}`);
    const block = source.slice(start, end);
    return [...block.matchAll(/^\s+([a-zA-Z][a-zA-Z0-9_]*):/gm)].map((m) => m[1]);
}

function compareKeySets(label, enKeys, koKeys) {
    const enSet = new Set(enKeys);
    const koSet = new Set(koKeys);
    const enOnly = enKeys.filter((k) => !koSet.has(k));
    const koOnly = koKeys.filter((k) => !enSet.has(k));
    if (enOnly.length || koOnly.length) {
        const parts = [];
        if (enOnly.length) {
            parts.push(`en-only (${enOnly.length}): ${enOnly.slice(0, 20).join(', ')}${enOnly.length > 20 ? '…' : ''}`);
        }
        if (koOnly.length) {
            parts.push(`ko-only (${koOnly.length}): ${koOnly.slice(0, 20).join(', ')}${koOnly.length > 20 ? '…' : ''}`);
        }
        throw new Error(`${label} key mismatch — ${parts.join('; ')}`);
    }
}

function readUtf8Normalized(filePath) {
    return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

const calendarEn = readUtf8Normalized(path.join(root, 'js', 'i18n', 'calendar-en.js'));
const calendarKo = readUtf8Normalized(path.join(root, 'js', 'i18n', 'calendar-ko.js'));
const appEn = extractObjectKeys(calendarEn, 'global.CCPCalendarI18n.en = {', '\n})(typeof window');
const appKo = extractObjectKeys(calendarKo, 'global.CCPCalendarI18n.ko = {', '\n})(typeof window');
compareKeySets('calendar i18n (en/ko)', appEn, appKo);

const adminI18n = readUtf8Normalized(path.join(root, 'js', 'admin-i18n.js'));
const adminEn = extractObjectKeys(adminI18n, 'en: {', 'ko: {');
const adminKo = extractObjectKeys(adminI18n, 'ko: {', '}\n    };');
compareKeySets('admin-i18n.js ADMIN_STRINGS', adminEn, adminKo);

const jsFiles = [
    'app.js',
    ...fs
        .readdirSync(path.join(root, 'js'))
        .filter((f) => f.endsWith('.js'))
        .map((f) => path.join('js', f))
];

const rawDialogRe = /\b(alert|confirm|prompt)\(\s*['`]/g;
const allowedFiles = new Set(['js/calendar-sync.js']);

for (const rel of jsFiles) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    const lines = text.split('\n');
    const hits = [];
    lines.forEach((line, i) => {
        if (!rawDialogRe.test(line)) {
            return;
        }
        rawDialogRe.lastIndex = 0;
        if (/\b(alert|confirm|prompt)\(\s*t\(/.test(line)) {
            return;
        }
        if (/\b(alert|confirm|prompt)\(\s*hooks\.t\(/.test(line)) {
            return;
        }
        if (/\b(alert|confirm|prompt)\(\s*global\.confirm\(/.test(line)) {
            return;
        }
        if (allowedFiles.has(rel)) {
            return;
        }
        hits.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
    if (hits.length) {
        throw new Error(
            `Hardcoded dialog strings (use t() / hooks.t()):\n${hits.slice(0, 15).join('\n')}${
                hits.length > 15 ? `\n...and ${hits.length - 15} more` : ''
            }`
        );
    }
}

const mojibakeRe = /\?[가-힣]/;
const scanRoots = [
    path.join(root, 'index.html'),
    ...fs
        .readdirSync(path.join(root, 'templates'))
        .filter((f) => f.endsWith('.html'))
        .map((f) => path.join(root, 'templates', f))
];

function walkJs(dir, acc) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            walkJs(full, acc);
            return;
        }
        if (ent.name.endsWith('.js')) {
            acc.push(full);
        }
    });
    return acc;
}
walkJs(path.join(root, 'js'), scanRoots);

const mojibakeHits = [];
scanRoots.forEach((filePath) => {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
        if (mojibakeRe.test(line)) {
            mojibakeHits.push(`${path.relative(root, filePath)}:${i + 1}`);
        }
    });
});
assert(mojibakeHits.length === 0, `Mojibake pattern "?[Hangul]" found:\n${mojibakeHits.join('\n')}`);

const enKeySet = new Set(appEn);
const htmlFiles = [
    path.join(root, 'index.html'),
    ...fs
        .readdirSync(path.join(root, 'templates'))
        .filter((f) => f.endsWith('.html'))
        .map((f) => path.join(root, 'templates', f))
];
const missingDomKeys = [];
const attrRe = /data-i18n(?:-title|-aria-label)?=["']([a-zA-Z][a-zA-Z0-9_]*)["']/g;
htmlFiles.forEach((filePath) => {
    const text = fs.readFileSync(filePath, 'utf8');
    let m;
    while ((m = attrRe.exec(text))) {
        if (!enKeySet.has(m[1])) {
            missingDomKeys.push(`${path.relative(root, filePath)}: ${m[1]}`);
        }
    }
});
assert(
    missingDomKeys.length === 0,
    `data-i18n / data-i18n-title / data-i18n-aria-label keys missing from calendar-en.js:\n${missingDomKeys.slice(0, 30).join('\n')}${
        missingDomKeys.length > 30 ? `\n...and ${missingDomKeys.length - 30} more` : ''
    }`
);

console.log('i18n-parity.test.mjs: all passed');
