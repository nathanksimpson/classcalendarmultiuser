/**
 * Run: node tests/event-day-notify.test.mjs
 * Mirrors collectEventDayNotifyMatches from app.js (not loaded in Node tests).
 */

function collectEventDayNotifyMatches(events, todayISO) {
    const today = typeof todayISO === 'string' ? todayISO.trim() : '';
    if (!today) {
        return [];
    }
    const out = [];
    (Array.isArray(events) ? events : []).forEach((raw) => {
        if (!raw || !raw.id) {
            return;
        }
        const notifyOnStart = raw.notifyOnStart === true;
        const isRange = raw.isRange === true;
        const notifyOnEnd = isRange && raw.notifyOnEnd === true;
        if (!notifyOnStart && !notifyOnEnd) {
            return;
        }
        const startDate = isRange
            ? (raw.startDate || '')
            : (raw.date || '');
        const endDate = isRange ? (raw.endDate || '') : '';
        let emittedStart = false;
        if (notifyOnStart && startDate === today) {
            out.push({
                id: `event-notify:${raw.id}:start:${today}`,
                kind: 'start',
                event: raw,
                date: today
            });
            emittedStart = true;
        }
        if (notifyOnEnd && endDate === today) {
            if (emittedStart && startDate === endDate) {
                return;
            }
            out.push({
                id: `event-notify:${raw.id}:end:${today}`,
                kind: 'end',
                event: raw,
                date: today
            });
        }
    });
    return out;
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const today = '2026-09-15';

assert(collectEventDayNotifyMatches([], today).length === 0, 'empty list');
assert(
    collectEventDayNotifyMatches([{ id: 'a', date: today, notifyOnStart: false }], today).length === 0,
    'unticked single-day ignored'
);

const single = collectEventDayNotifyMatches([
    { id: 's1', date: today, notifyOnStart: true }
], today);
assert(single.length === 1 && single[0].kind === 'start', 'single-day start');
assert(single[0].id === `event-notify:s1:start:${today}`, 'stable id');

assert(
    collectEventDayNotifyMatches([{ id: 's2', date: '2026-09-14', notifyOnStart: true }], today).length === 0,
    'wrong day ignored'
);

const rangeBoth = collectEventDayNotifyMatches([
    {
        id: 'r1',
        isRange: true,
        startDate: today,
        endDate: '2026-09-20',
        notifyOnStart: true,
        notifyOnEnd: true
    }
], today);
assert(rangeBoth.length === 1 && rangeBoth[0].kind === 'start', 'range start day only start match');

const rangeEnd = collectEventDayNotifyMatches([
    {
        id: 'r2',
        isRange: true,
        startDate: '2026-09-10',
        endDate: today,
        notifyOnStart: true,
        notifyOnEnd: true
    }
], today);
assert(rangeEnd.length === 1 && rangeEnd[0].kind === 'end', 'range end day');

const rangeBothSameDay = collectEventDayNotifyMatches([
    {
        id: 'r3',
        isRange: true,
        startDate: today,
        endDate: today,
        notifyOnStart: true,
        notifyOnEnd: true
    }
], today);
assert(rangeBothSameDay.length === 1 && rangeBothSameDay[0].kind === 'start', 'degenerate range one item');

assert(
    collectEventDayNotifyMatches([
        { id: 'r4', isRange: true, startDate: today, endDate: '2026-09-20', notifyOnEnd: true }
    ], today).length === 0,
    'end-only does not fire on start day'
);

assert(
    collectEventDayNotifyMatches([
        { id: 's3', date: today, notifyOnEnd: true, isRange: false }
    ], today).length === 0,
    'notifyOnEnd ignored for single-day'
);

console.log('event-day-notify.test.mjs: all passed');
