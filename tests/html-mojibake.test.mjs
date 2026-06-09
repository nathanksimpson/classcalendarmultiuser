/**
 * Run: node tests/html-mojibake.test.mjs
 * Guards index.html against common UTF-8 mis-encoded fallback text.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const badPatterns = [
    { pattern: 'â†’', label: 'broken arrow' },
    { pattern: 'Â·', label: 'broken middle dot' },
    { pattern: 'â€¦', label: 'broken ellipsis' },
    { pattern: 'â€"', label: 'broken em dash' },
    { pattern: 'ðŸŒ', label: 'broken emoji bytes' },
    { pattern: 'ë‹´ìž„', label: 'broken Korean homeroom' },
    { pattern: 'í•©ë°˜', label: 'broken Korean combined cohorts' }
];

const hits = badPatterns.filter(({ pattern }) => html.includes(pattern));
if (hits.length) {
    throw new Error(`index.html mojibake detected: ${hits.map((h) => h.label).join(', ')}`);
}

console.log('All html-mojibake tests passed.');
