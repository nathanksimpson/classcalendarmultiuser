/**
 * Run: node tests/cohort-display-title.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'teacher-timetable.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'cohort-management.js')).href);

const api = globalThis.CCPTeacherTimetable;
const cm = globalThis.CCPCohortManagement;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

assert(cm.formatCohortDisplayTitle({ name: 'Blue · days 2,4' }) === 'Blue', 'strip middle dot days suffix');
assert(cm.formatCohortDisplayTitle({ name: 'Bada - days 4' }) === 'Bada', 'strip hyphen days suffix');
assert(cm.formatCohortDisplayTitle({ name: 'Purple' }) === 'Purple', 'plain name unchanged');

const suggestions = api.suggestCohortsFromClasses([
    {
        id: 'c1',
        levelPreset: 'Bada',
        grade: '3',
        meetingDays: [2, 4]
    }
]);
assert(suggestions.length === 1, 'one suggestion group');
assert(!/\bdays\b/i.test(suggestions[0].name), 'import name has no days word');
assert(suggestions[0].name.includes('Bada'), 'name includes level');

console.log('cohort-display-title.test.mjs: all passed');
