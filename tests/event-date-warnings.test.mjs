/**
 * Run: node tests/event-date-warnings.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'event-date-warnings.js')).href);

const w = globalThis.CCPEventDateWarnings;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const events = [
    {
        id: 'e1',
        name: 'Midterm',
        date: '2026-06-25',
        notifyEnabled: true,
        notifyLeadDays: 3
    },
    {
        id: 'e2',
        name: 'Silent',
        date: '2026-06-25',
        notifyEnabled: false,
        notifyLeadDays: 7
    },
    {
        id: 'e3',
        name: 'Range event',
        isRange: true,
        startDate: '2026-06-30',
        endDate: '2026-07-02',
        notifyEnabled: true,
        notifyLeadDays: 1
    }
];

const threeDaysOut = w.collectEventDateWarnings(events, '2026-06-22');
assert(threeDaysOut.length === 1, 'one alert three days before');
assert(threeDaysOut[0].id === 'event:e1:alert', 'upcoming id');
assert(threeDaysOut[0].params.days === '3', 'days until');

const todayAlert = w.collectEventDateWarnings(events, '2026-06-25');
assert(todayAlert.some((x) => x.id === 'event:e1:today'), 'day-of alert');
assert(!todayAlert.some((x) => x.id === 'event:e2:today'), 'disabled event skipped');

const rangeLead = w.collectEventDateWarnings(events, '2026-06-29');
assert(rangeLead.some((x) => x.id === 'event:e3:alert'), 'range uses startDate');

const tooEarly = w.collectEventDateWarnings(events, '2026-06-18');
assert(tooEarly.length === 0, 'outside lead window');

console.log('event-date-warnings.test.mjs: all passed');
