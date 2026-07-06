import fs from 'fs';

const html = fs.readFileSync('c:/Users/SIMSTER/Downloads/Print Styles (A4) - standalone.html', 'utf8');
const m = html.match(/script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/);
const raw = JSON.parse(m[1]);
const start = raw.indexOf('// ---- syllabus rows ----');
const end = raw.indexOf('return { weeks, weekdays, sylRows, generalNotes }');
const chunk = raw.slice(start, end + 80);
fs.writeFileSync('scripts/_extracted-syllabus-data-js.txt', chunk, 'utf8');
console.log('wrote', chunk.length, 'chars');
