/**
 * One-off: extract GUIDE { en, ko } from js/help-guide.js into help/guide-content.json
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const root = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'help-guide.js'), 'utf8');
const start = src.indexOf('const GUIDE = {');
const end = src.indexOf('const ROLE_MATRIX = {');
if (start < 0 || end < 0) {
    console.error('Could not locate GUIDE block');
    process.exit(1);
}
const guideBody = src.slice(start + 'const GUIDE = '.length, end).trim();
const guideEnd = guideBody.lastIndexOf('};');
const guideLiteral = guideBody.slice(0, guideEnd + 1);
const GUIDE = new Function('return ' + guideLiteral)();
const out = path.join(root, 'help', 'guide-content.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(GUIDE, null, 2) + '\n');
console.log('Wrote', out, fs.statSync(out).size, 'bytes');
