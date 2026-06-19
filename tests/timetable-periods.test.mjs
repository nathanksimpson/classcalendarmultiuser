/**
 * Run: node tests/timetable-periods.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'teacher-timetable.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'timetable-periods.js')).href);

const api = globalThis.CCPTimetablePeriods;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

assert(api.computeDurationMin('14:30', '15:20') === 50, 'duration 14:30–15:20');

const defaults = api.resetToDefaultSchedule();
assert(defaults.slots.length >= 7, 'default slots');
assert(Object.keys(defaults.map).length >= 7, 'default period map');

const added = api.addPeriod(defaults.slots, defaults.map);
assert(added.ok, 'add period');
assert(api.getPeriodNumbers(added.map).length === 8, 'eight periods after add');

const appData = {
    classes: [{
        id: 'c1',
        name: 'Debate A',
        period: 2
    }],
    periodSlotMap: added.map,
    timetableTimeSlots: added.slots
};
const inUse = api.findClassesUsingPeriod(appData, 2);
assert(inUse.length === 1 && inUse[0].id === 'c1', 'find class using period');

const period8 = Math.max(...api.getPeriodNumbers(added.map));
const removed = api.removePeriod(added.slots, added.map, period8);
assert(removed.ok, 'remove unused highest period');
assert(removed.slots.length === added.slots.length - 1, 'slot removed from list');

const validation = api.validatePeriodSchedule(defaults.slots, defaults.map);
assert(validation.ok, 'default schedule validates');

assert(api.getMaxPeriodNumber({ periodSlotMap: { '1': 'ts1', '8': 'ts8' } }) === 8, 'dynamic max period');

console.log('timetable-periods.test.mjs: all assertions passed');
