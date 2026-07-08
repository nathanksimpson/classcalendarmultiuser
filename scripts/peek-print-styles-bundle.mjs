import fs from 'fs';

const html = fs.readFileSync('c:/Users/SIMSTER/Downloads/Print Styles (A4) - standalone.html', 'utf8');
const m = html.match(/script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/);
if (!m) {
    console.error('no template');
    process.exit(1);
}
const raw = JSON.parse(m[1]);
const keys = [
    'syllabus', 'lesson-plan', 'Syllabus', 'Month', 'Notes',
    'print-shell', 'modern-print', 'a4-page', 'syllabus-print',
    'PAGES', 'Lesson plan'
];
for (const k of keys) {
    let pos = 0;
    let count = 0;
    while (count < 3) {
        const idx = raw.indexOf(k, pos);
        if (idx < 0) break;
        console.log('---', k, 'at', idx);
        console.log(raw.slice(Math.max(0, idx - 100), idx + 300).replace(/\n/g, '\\n'));
        pos = idx + k.length;
        count += 1;
    }
}
console.log('template length', raw.length);
