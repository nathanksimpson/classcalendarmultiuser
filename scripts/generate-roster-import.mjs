/**
 * Generate data/roster-import-jun2026.json from the SMS paste fixture.
 * Usage: node scripts/generate-roster-import.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadRosterImport() {
    const code = readFileSync(path.join(root, 'js', 'roster-import.js'), 'utf8');
    const sandbox = { window: {}, globalThis: {} };
    vm.runInNewContext(code, sandbox);
    return sandbox.window.CCPRosterImport;
}

const RI = loadRosterImport();
const paste = readFileSync(path.join(root, 'tests', 'fixtures', 'roster-paste-jun2026.txt'), 'utf8');
const { cohorts } = RI.parseRosterPaste(paste);

const output = {
    version: 1,
    source: 'SMS roster paste 2026-06-09',
    cohorts
};

const dataDir = path.join(root, 'data');
mkdirSync(dataDir, { recursive: true });

const jsonPath = path.join(dataDir, 'roster-import-jun2026.json');
writeFileSync(jsonPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

const summaryLines = [
    'Roster import summary — 2026-06-09',
    `Cohorts: ${cohorts.length}`,
    `Students: ${cohorts.reduce((n, c) => n + c.students.length, 0)}`,
    '',
    ...cohorts.map((c) => `${c.cohortName}: ${c.students.length} students`)
];
const summaryPath = path.join(dataDir, 'roster-import-jun2026.summary.txt');
writeFileSync(summaryPath, summaryLines.join('\n') + '\n', 'utf8');

console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${summaryPath}`);
