const fs = require('fs');
const path = require('path');

const h = fs.readFileSync(path.join(__dirname, '_tms-dump/recphotopholi-sample.html'), 'utf8');
const j = h.indexOf('id="essay"');
console.log(h.slice(Math.max(0, j - 80), j + 2000));
console.log('\n--- txtcontent1 raw length ---');
const ta = h.match(/<textarea[^>]*id=["']txtcontent1["'][^>]*>([\s\S]*?)<\/textarea>/i);
console.log(ta ? ta[1].slice(0, 600) : 'none');
