/**
 * Injects css/syllabus-print-a4.css into js/syllabus-table.js between sync markers.
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = path.join(root, 'css', 'syllabus-print-a4.css');
const jsPath = path.join(root, 'js', 'syllabus-table.js');

const START = '/* SYLLABUS_PRINT_A4_CSS_START */';
const END = '/* SYLLABUS_PRINT_A4_CSS_END */';

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const css = readFileSync(cssPath, 'utf8').trim();
let js = readFileSync(jsPath, 'utf8');

if (!js.includes(START) || !js.includes(END)) {
    console.error('syllabus-table.js missing SYLLABUS_PRINT_A4_CSS markers');
    process.exit(1);
}

const replacement = `${START}\n${css}\n${END}`;
const pattern = new RegExp(`${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`);
js = js.replace(pattern, replacement);
writeFileSync(jsPath, js, 'utf8');
console.log('Synced syllabus-print-a4.css into syllabus-table.js');
