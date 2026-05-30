import fs from 'fs';
import path from 'path';

const indexPath = path.join(path.resolve(import.meta.dirname, '..'), 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
const ids = ['classFormTemplate', 'syllabusEditorTemplate', 'holidayFormTemplate', 'printFormTemplate'];
for (const id of ids) {
    const re = new RegExp(`\\s*<template id="${id}">[\\s\\S]*?</template>\\s*`, 'g');
    html = html.replace(re, '\n');
}
if (html.includes('classFormTemplate')) {
    console.error('Templates still present in index.html');
    process.exit(1);
}
fs.writeFileSync(indexPath, html);
console.log('Stripped templates from index.html');
