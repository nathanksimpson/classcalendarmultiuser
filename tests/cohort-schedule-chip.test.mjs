/**
 * Run: node tests/cohort-schedule-chip.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'teacher-timetable.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'cohort-management.js')).href);

const cm = globalThis.CCPCohortManagement;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const appData = { cohorts: [], classes: [] };

assert(
    cm.formatCohortScheduleChipLabel(
        { schedulePattern: 'mwf', meetingDays: [1, 3, 5] },
        appData
    ) === 'M/W/F',
    'mwf pattern chip'
);
assert(
    cm.formatCohortScheduleChipLabel(
        { schedulePattern: 'tth', meetingDays: [2, 4] },
        appData
    ) === 'T/T',
    'tth pattern chip'
);
assert(
    cm.formatCohortScheduleChipLabel(
        { schedulePattern: 'custom', meetingDays: [1, 2] },
        appData
    ) === 'M/T',
    'custom two-day chip'
);

console.log('cohort-schedule-chip.test.mjs: all passed');
