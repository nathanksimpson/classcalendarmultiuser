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
    const normalized = normalizeEventType(type);
    return normalized === EVENT_TYPES.HOLIDAY
        || normalized === EVENT_TYPES.EVALUATION_PERIOD;
}

function eventAppliesToClass(event, classData) {
    if (!event || !classData) {
        return false;
    }
    const classId = String(classData.id || '').trim();
    const excludedClassIds = Array.isArray(event.excludedClassIds) ? event.excludedClassIds : [];
    if (classId && excludedClassIds.includes(classId)) {
        return false;
    }
    const classIds = Array.isArray(event.classIds) ? event.classIds : [];
    const hasClassNames = event.classNames && event.classNames.length > 0;
    const hasClassIds = classIds.length > 0;
    const hasGrades = event.grades && event.grades.length > 0;
    const hasSections = event.sectionLevels && event.sectionLevels.length > 0;
    const hasBroadFilters = hasGrades || hasSections
        || event.allElementary === true
        || event.allMiddleSchool === true;
    if (!hasClassIds && !hasClassNames && !hasBroadFilters) {
        return true;
    }
    if (hasClassIds && classId && classIds.includes(classId)) {
        return true;
    }
    if (!hasClassIds && hasClassNames && event.classNames.includes(classData.name)) {
        return true;
    }
    if (!hasBroadFilters) {
        return false;
    }
    if (hasGrades && event.grades.includes(classData.grade)) {
        return true;
    }
    return false;
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
assert(eventTypeBlocksClass('evaluation_period'), 'evaluation period blocks class');
assert(!eventTypeBlocksClass('homework_deadline'), 'homework deadline does not block class');

const evalPeriodDay = [
    {
        type: 'evaluation_period',
        name: 'Midterm week',
        startDate: '2026-03-02',
        endDate: '2026-03-06',
        classNames: []
    }
];
assert(isHolidayForClassOnDay(evalPeriodDay), 'evaluation period blocks class on day');

const classData = { id: 'navy-7a', name: 'Navy 7A' };
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

const blueP1 = { id: 'blue-p1', name: 'Blue', grade: '중1' };
const blueP2 = { id: 'blue-p2', name: 'Blue', grade: '중1' };
const broadBlueExceptP2 = {
    type: 'holiday',
    grades: ['중1'],
    classIds: [],
    classNames: [],
    excludedClassIds: ['blue-p2'],
    sectionLevels: [],
    allElementary: false,
    allMiddleSchool: false
};
assert(eventAppliesToClass(broadBlueExceptP2, blueP1), 'broad include still applies to Blue P1');
assert(!eventAppliesToClass(broadBlueExceptP2, blueP2), 'class-specific exclusion removes Blue P2');

const explicitOnlyP2 = {
    type: 'holiday',
    classIds: ['blue-p2'],
    classNames: ['Blue'],
    excludedClassIds: [],
    grades: [],
    sectionLevels: [],
    allElementary: false,
    allMiddleSchool: false
};
assert(!eventAppliesToClass(explicitOnlyP2, blueP1), 'same-name sibling not matched when ids differ');
assert(eventAppliesToClass(explicitOnlyP2, blueP2), 'explicit class id targets intended class instance');

const mixedDay = [
    { type: 'other', name: 'Reminder', date: lessonDay },
    { type: 'holiday', name: 'Holiday', date: lessonDay }
];
assert(isHolidayForClassOnDay(mixedDay), 'holiday on mixed day still blocks');

console.log('All events-schedule tests passed.');
