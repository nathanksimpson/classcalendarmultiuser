const fs = require('fs');
const path = require('path');

const list = fs.readFileSync(path.join(__dirname, '_tms-dump/writing-list-get.html'), 'utf8');
const start = list.indexOf('function photopoliview');
console.log('=== photopoliview ===');
console.log(list.slice(start, start + 900));

const h = fs.readFileSync(path.join(__dirname, '_tms-dump/recphotopholi-sample.html'), 'utf8');
console.log('\n=== textareas ===');
for (const m of h.matchAll(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi)) {
    console.log(m[0].slice(0, 500));
    console.log('---');
}
console.log('\n=== txtcontent1 context ===');
const i = h.toLowerCase().indexOf('txtcontent1');
console.log(h.slice(Math.max(0, i - 120), i + 900));
console.log('\n=== essay id context ===');
const j = h.toLowerCase().indexOf('id="essay"');
console.log(h.slice(Math.max(0, j - 80), j + 600));
