#!/usr/bin/env node
/**
 * Draft helper: list Sample Syllabi PDFs and remind how to add sessionTemplates.
 * Full PDF text extraction is not bundled; copy 회차 titles into js/syllabus-curricula-data.js
 * or add Reference/Syllabi/curricula/{preset-id}.json when using a local server.
 *
 * Usage: node scripts/build-syllabus-curricula.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const sampleDir = path.join(root, 'Reference', 'Syllabi', 'Sample Syllabi');

console.log('Syllabus curricula build helper');
console.log('Canonical rule: one JSON preset per subject+level (ignore 수금/월수/화목 schedule variants).');
console.log('Edit templates in: js/syllabus-curricula-data.js');
console.log('Schedule slots in: Reference/Syllabi/schedule-matrix.json + js/schedule-matrix-data.js');
console.log('');

if (!fs.existsSync(sampleDir)) {
    console.warn(`Sample folder not found (sync PDFs here): ${sampleDir}`);
    process.exit(0);
}

const pdfs = fs.readdirSync(sampleDir).filter(f => f.toLowerCase().endsWith('.pdf'));
console.log(`Found ${pdfs.length} PDF(s):`);
pdfs.sort().forEach(f => console.log(`  - ${f}`));
console.log('\nDone. Add sessionTemplates manually from 진도표 회차 column.');
