import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ids = [
    ['classFormTemplate', 'class-form.html'],
    ['syllabusEditorTemplate', 'syllabus-editor.html'],
    ['holidayFormTemplate', 'holiday-form.html'],
    ['printFormTemplate', 'print-form.html']
];
const outDir = path.join(root, 'templates');
fs.mkdirSync(outDir, { recursive: true });
for (const [id, file] of ids) {
    const re = new RegExp(`<template id="${id}">([\\s\\S]*?)</template>`);
    const m = html.match(re);
    if (!m) {
        console.error('missing', id);
        process.exit(1);
    }
    const outPath = path.join(outDir, file);
    fs.writeFileSync(outPath, m[1].trim() + '\n');
    console.log(file, m[1].length, 'bytes');
}
