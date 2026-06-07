/**
 * Run: node tests/notification-i18n.test.mjs
 * Ensures notification popover / tab-warnings i18n keys exist in calendar-en + calendar-ko.
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
    return new Set([...block.matchAll(/^\s+([a-zA-Z][a-zA-Z0-9_]*):/gm)].map((m) => m[1]));
}

function collectNotificationI18nKeys() {
    const keys = new Set();

    const tabWarnings = fs.readFileSync(path.join(root, 'js', 'tab-warnings.js'), 'utf8');
    for (const m of tabWarnings.matchAll(/messageKey:\s*'([^']+)'/g)) {
        keys.add(m[1]);
    }
    for (const m of tabWarnings.matchAll(/hooks\.t\(\s*'([^']+)'\s*\)/g)) {
        keys.add(m[1]);
    }

    const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const bellStart = appJs.indexOf('function getSyncNavWarningsForBell()');
    assert(bellStart >= 0, 'Missing getSyncNavWarningsForBell in app.js');
    const bellEnd = appJs.indexOf('\nfunction ', bellStart + 1);
    const bellBlock = appJs.slice(bellStart, bellEnd > bellStart ? bellEnd : bellStart + 2000);
    for (const m of bellBlock.matchAll(/messageKey:\s*'([^']+)'/g)) {
        keys.add(m[1]);
    }

    const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const popoverStart = indexHtml.indexOf('id="tabWarningsPopover"');
    const popoverEnd = indexHtml.indexOf('id="tabWarningsEmpty"', popoverStart);
    assert(popoverStart >= 0 && popoverEnd > popoverStart, 'Missing tabWarningsPopover block in index.html');
    const popoverBlock = indexHtml.slice(popoverStart, popoverEnd + 200);
    for (const m of popoverBlock.matchAll(/data-i18n="([^"]+)"/g)) {
        keys.add(m[1]);
    }
    const btnMatch = indexHtml.match(/id="appWarningsBtn"[^>]*data-i18n-title="([^"]+)"/);
    if (btnMatch) {
        keys.add(btnMatch[1]);
    }

    return [...keys].sort();
}

const calendarEn = fs.readFileSync(path.join(root, 'js', 'i18n', 'calendar-en.js'), 'utf8');
const calendarKo = fs.readFileSync(path.join(root, 'js', 'i18n', 'calendar-ko.js'), 'utf8');
const enKeys = extractObjectKeys(calendarEn, 'global.CCPCalendarI18n.en = {', '\n})(typeof window');
const koKeys = extractObjectKeys(calendarKo, 'global.CCPCalendarI18n.ko = {', '\n})(typeof window');

const required = collectNotificationI18nKeys();
assert(required.length > 0, 'No notification i18n keys collected');

const missingEn = required.filter((k) => !enKeys.has(k));
const missingKo = required.filter((k) => !koKeys.has(k));
if (missingEn.length || missingKo.length) {
    const parts = [];
    if (missingEn.length) {
        parts.push(`missing in en: ${missingEn.join(', ')}`);
    }
    if (missingKo.length) {
        parts.push(`missing in ko: ${missingKo.join(', ')}`);
    }
    throw new Error(`Notification i18n keys — ${parts.join('; ')}`);
}

console.log(`notification-i18n.test.mjs: ${required.length} keys OK`);
