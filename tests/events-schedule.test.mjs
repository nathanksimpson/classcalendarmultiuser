/**
 * Run: node tests/events-schedule.test.mjs
 * Mirrors eventTypeBlocksClass / normalizeEventType from app.js (not loaded in Node tests).
 */
const EVENT_TYPES = {
    HOLIDAY: 'holiday',
    EVALUATION_DEADLINE: 'evaluation_deadline',
    HOMEWORK_DEADLINE: 'homework_deadline',
    EVALUATION_PERIOD: 'evaluation_period',
    OTHER: 'other'
};

function normalizeEventType(type) {
    const valid = Object.values(EVENT_TYPES);
    return valid.includes(type) ? type : EVENT_TYPES.HOLIDAY;
}

function eventTypeBlocksClass(type) {
    return normalizeEventType(type) === EVENT_TYPES.HOLIDAY;
}

function eventAppliesToClass(event, classData) {
    if (!event || !classData) {
        return false;
    }
    const hasClassNames = event.classNames && event.classNames.length > 0;
    if (!hasClassNames) {
        return true;
    }
    return event.classNames.includes(classData.name);
}

function isHolidayForClassOnDay(eventsOnDay) {
    return eventsOnDay.some((ev) => eventTypeBlocksClass(ev.type));
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

assert(eventTypeBlocksClass('holiday'), 'holiday blocks class');
assert(!eventTypeBlocksClass('other'), 'other does not block class');
assert(!eventTypeBlocksClass(EVENT_TYPES.OTHER), 'other enum does not block class');
assert(eventTypeBlocksClass(''), 'unknown type defaults to holiday');
assert(!eventTypeBlocksClass('evaluation_deadline'), 'eval deadline does not block via helper');

const classData = { name: 'Navy 7A' };
const lessonDay = '2026-03-02';
const eventsOnDay = [
    {
        type: 'other',
        name: 'Assembly',
        date: lessonDay,
        classNames: ['Navy 7A']
    }
];
assert(eventAppliesToClass(eventsOnDay[0], classData), 'other applies to class');
assert(!isHolidayForClassOnDay(eventsOnDay), 'other alone is not a holiday for class');

const holidayDay = [
    {
        type: 'holiday',
        name: 'No school',
        date: lessonDay,
        classNames: []
    }
];
assert(isHolidayForClassOnDay(holidayDay), 'holiday blocks class');

const mixedDay = [
    { type: 'other', name: 'Reminder', date: lessonDay },
    { type: 'holiday', name: 'Holiday', date: lessonDay }
];
assert(isHolidayForClassOnDay(mixedDay), 'holiday on mixed day still blocks');

console.log('All events-schedule tests passed.');
