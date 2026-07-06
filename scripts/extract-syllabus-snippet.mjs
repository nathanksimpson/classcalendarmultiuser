import fs from 'fs';

const html = fs.readFileSync('c:/Users/SIMSTER/Downloads/Print Styles (A4) - standalone.html', 'utf8');
const m = html.match(/script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/);
const raw = JSON.parse(m[1]);
const start = raw.indexOf('Syllabus print · A4 portrait');
const end = raw.indexOf('</script>', start);
const chunk = raw.slice(start - 500, end);
fs.writeFileSync('scripts/_extracted-syllabus-print-snippet.txt', chunk, 'utf8');
console.log('wrote', chunk.length, 'chars');
