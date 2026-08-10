/**
 * Canonical calendar backup export shape — shared by Node tests and browser (via js/calendar-export.js).
 * Keep in sync with js/calendar-export.js and js/core/app-state.js defaults.
 */

const EXPORT_FORMAT_VERSION = 1;

/** Top-level keys that belong in a full calendar backup (plus optional exportMeta). */
const CALENDAR_DOMAIN_TOP_LEVEL_KEYS = [
    'schemaVersion',
    'calendarName',
    'termStart',
    'termEnd',
    'useAutoTermEnd',
    'termMonthCount',
    'classes',
    'events',
    'cohorts',
    'tmsRosterLinks',
    'tmsEssayLinks',
    'timetableTimeSlots',
    'periodSlotMap',
    'customClassTypes',
    'customSyllabusTemplates',
    'defaultClassTypeOverrides',
    'bookOverrides',
    'curriculumOverrides',
    'curriculumRemovedIds',
    'dayNotes',
    'dayNoteCategories',
    'attendanceSessions',
    'homeworkCompletions',
    'essaySubmissions',
    'studentPoints',
    'studentTests',
    'debateTeamSessions',
    'debateScores',
    'debateCustomFormats',
    'speakingTestRecords',
    'debateBookDistributions',
    'pendingDebateBookChecks',
    'portfolioRecordings',
    'portfolioEntries',
    'smsLog',
    'rooms',
    'teacherProfiles',
    'plannerDrafts',
    'plannerState',
    'ui'
];

const ARRAY_KEYS = new Set([
    'classes',
    'events',
    'cohorts',
    'timetableTimeSlots',
    'customClassTypes',
    'customSyllabusTemplates',
    'curriculumRemovedIds',
    'dayNotes',
    'dayNoteCategories',
    'attendanceSessions',
    'homeworkCompletions',
    'essaySubmissions',
    'studentPoints',
    'studentTests',
    'debateTeamSessions',
    'debateScores',
    'debateCustomFormats',
    'speakingTestRecords',
    'debateBookDistributions',
    'pendingDebateBookChecks',
    'portfolioRecordings',
    'portfolioEntries',
    'smsLog',
    'rooms',
    'teacherProfiles',
    'plannerDrafts'
]);

const OBJECT_KEYS = new Set([
    'tmsRosterLinks',
    'tmsEssayLinks',
    'periodSlotMap',
    'defaultClassTypeOverrides',
    'bookOverrides',
    'curriculumOverrides',
    'ui'
]);

function deepClone(value) {
    return JSON.parse(JSON.stringify(value == null ? {} : value));
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Ensure every canonical domain key exists with a safe empty default.
 * Does not run full migrateData (avoids global side effects / alerts).
 * @param {object} data
 * @returns {object} same object mutated
 */
function ensureCalendarExportShape(data) {
    const out = data && typeof data === 'object' ? data : {};

    ARRAY_KEYS.forEach((key) => {
        if (!Array.isArray(out[key])) {
            out[key] = [];
        }
    });

    OBJECT_KEYS.forEach((key) => {
        if (!isPlainObject(out[key])) {
            out[key] = {};
        }
    });

    if (out.plannerState != null && !isPlainObject(out.plannerState)) {
        out.plannerState = null;
    } else if (out.plannerState === undefined) {
        out.plannerState = null;
    }

    if (typeof out.calendarName !== 'string') {
        out.calendarName = out.calendarName == null ? '' : String(out.calendarName);
    }

    if (out.useAutoTermEnd === undefined) {
        out.useAutoTermEnd = true;
    }

    if (out.termStart === undefined) {
        out.termStart = null;
    }
    if (out.termEnd === undefined) {
        out.termEnd = null;
    }

    if (!Number.isFinite(Number(out.termMonthCount))) {
        out.termMonthCount = 3;
    }

    return out;
}

/**
 * Build a complete calendar backup payload for download.
 * Keeps `ui`, omits legacy `holidays`, preserves unknown top-level keys, adds exportMeta.
 *
 * @param {object} source - live appData (or fixture)
 * @param {object} [options]
 * @param {number|string} [options.schemaVersion]
 * @param {function} [options.normalizeTermStartDate]
 * @param {function} [options.getResolvedTermEndISO]
 * @param {function} [options.getTermMonthCount]
 * @param {string|Date} [options.exportedAt]
 * @returns {object}
 */
function buildCalendarExportPayload(source, options) {
    const opts = options || {};
    const payload = deepClone(source || {});
    ensureCalendarExportShape(payload);

    if (Object.prototype.hasOwnProperty.call(payload, 'holidays')) {
        delete payload.holidays;
    }

    const schemaVersion =
        opts.schemaVersion != null
            ? Number(opts.schemaVersion)
            : Number(payload.schemaVersion) || 3;
    payload.schemaVersion = schemaVersion;

    if (typeof opts.normalizeTermStartDate === 'function') {
        payload.termStart = opts.normalizeTermStartDate(payload.termStart);
    }
    if (typeof opts.getResolvedTermEndISO === 'function') {
        payload.termEnd = opts.getResolvedTermEndISO();
    }
    if (typeof opts.getTermMonthCount === 'function') {
        payload.termMonthCount = opts.getTermMonthCount();
    } else if (!Number.isFinite(Number(payload.termMonthCount))) {
        payload.termMonthCount = 3;
    }
    payload.useAutoTermEnd = payload.useAutoTermEnd !== false;

    const exportedAt =
        opts.exportedAt instanceof Date
            ? opts.exportedAt.toISOString()
            : typeof opts.exportedAt === 'string' && opts.exportedAt
              ? opts.exportedAt
              : new Date().toISOString();

    payload.exportMeta = {
        exportFormatVersion: EXPORT_FORMAT_VERSION,
        exportedAt,
        schemaVersion
    };

    return payload;
}

/**
 * Strip backup-only metadata before import/apply.
 * @param {object} imported
 * @returns {object}
 */
function stripExportMeta(imported) {
    if (!imported || typeof imported !== 'object') {
        return imported;
    }
    if (Object.prototype.hasOwnProperty.call(imported, 'exportMeta')) {
        delete imported.exportMeta;
    }
    return imported;
}

module.exports = {
    EXPORT_FORMAT_VERSION,
    CALENDAR_DOMAIN_TOP_LEVEL_KEYS,
    ensureCalendarExportShape,
    buildCalendarExportPayload,
    stripExportMeta,
    deepClone
};
