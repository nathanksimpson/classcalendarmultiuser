import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function walkObjectLiteral(source, openBraceIndex) {
    let i = openBraceIndex;
    let depth = 0;
    let inString = false;
    let quote = '';
    let escaped = false;
    const begin = openBraceIndex;
    for (; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === quote) {
                inString = false;
            }
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = true;
            quote = ch;
            continue;
        }
        if (ch === '{') {
            depth += 1;
        } else if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                return source.slice(begin, i + 1);
            }
        }
    }
    throw new Error('Unclosed object literal');
}

function extractLangObject(source, lang) {
    const marker = `${lang}: {`;
    const start = source.indexOf(marker);
    if (start < 0) {
        throw new Error(`Missing ${marker}`);
    }
    const openBrace = start + marker.length - 1;
    return walkObjectLiteral(source, openBrace);
}

function extractTopLevelKeys(objectLiteral) {
    let i = 0;
    let depth = 0;
    let inString = false;
    let quote = '';
    let escaped = false;
    const keys = [];
    for (; i < objectLiteral.length; i++) {
        const ch = objectLiteral[i];
        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                continue;
            }
            if (ch === quote) {
                inString = false;
            }
            continue;
        }
        if (ch === '"' || ch === "'") {
            inString = true;
            quote = ch;
            continue;
        }
        if (ch === '{') {
            depth += 1;
            continue;
        }
        if (ch === '}') {
            depth -= 1;
            continue;
        }
        if (depth === 1) {
            const rest = objectLiteral.slice(i);
            const m = rest.match(/^\s*([a-zA-Z][a-zA-Z0-9_]*)\s*:/);
            if (m) {
                keys.push(m[1]);
            }
        }
    }
    return keys;
}

const candidates = [
    path.join(root, '.tmp-app-head.js'),
    path.join(root, 'app.js')
];
let app = null;
for (const p of candidates) {
    if (!fs.existsSync(p)) {
        continue;
    }
    const text = fs.readFileSync(p, 'utf8');
    if (text.includes('const translations = {')) {
        app = text;
        break;
    }
}
if (!app) {
    throw new Error('Could not find translations source');
}

const blockStart = app.indexOf('const translations = {');
const blockEnd = app.indexOf('const SYNC_ERROR_KEYS', blockStart);
const block = app.slice(blockStart, blockEnd);

const enObj = extractLangObject(block, 'en');
const koObj = extractLangObject(block, 'ko');

const i18nDir = path.join(root, 'js', 'i18n');
fs.mkdirSync(i18nDir, { recursive: true });

function wrap(lang, objLiteral) {
    return (
        `(function (global) {\n` +
        `    'use strict';\n` +
        `    global.CCPCalendarI18n = global.CCPCalendarI18n || {};\n` +
        `    global.CCPCalendarI18n.${lang} = ${objLiteral};\n` +
        `})(typeof window !== 'undefined' ? window : globalThis);\n`
    );
}

fs.writeFileSync(path.join(i18nDir, 'calendar-en.js'), wrap('en', enObj));
fs.writeFileSync(path.join(i18nDir, 'calendar-ko.js'), wrap('ko', koObj));

const enKeys = extractTopLevelKeys(enObj);
const koKeys = extractTopLevelKeys(koObj);
console.log(`Re-extracted i18n — en ${enKeys.length} keys, ko ${koKeys.length} keys`);
