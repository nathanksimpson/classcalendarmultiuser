/**
 * Run: node tests/roster-export-roundtrip.test.mjs
 */
import { readFileSync } from 'fs';
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

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const calendarCohorts = [
    {
        id: 'cohort-purple',
        name: 'PurpleT',
        students: [
            { id: 'stu-purple-t-01', name: 'Kim', nameEn: 'Kim', sortOrder: 0, active: true, tags: [], memo: '' }
        ]
    }
];

const pack = RI.buildRosterPack(calendarCohorts, { calendarName: 'Test', source: 'unit test' });
assert(pack.cohorts[0].cohortId === 'cohort-purple', 'export includes cohortId');
assert(pack.cohorts[0].students.length === 1, 'export student count');

const parsed = RI.parseRosterPack(pack);
assert(!parsed.error, parsed.error);

const plan = RI.matchImportCohorts(parsed.pack.cohorts, calendarCohorts);
assert(plan[0].matchStatus === 'byId', 'round-trip byId match');
assert(plan[0].userAction === 'map', 'auto map');

const applied = RI.applyRosterImport(calendarCohorts, plan);
assert(!applied.error, 'apply ok');
assert(applied.cohorts[0].students.length === 1, 'student count preserved');
assert(applied.cohorts[0].students[0].name === 'Kim', 'name preserved');

console.log('roster-export-roundtrip.test.mjs: all passed');
