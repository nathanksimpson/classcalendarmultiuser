/**
 * Browser port of shared/calendar-export-core.cjs — keep logic in sync.
 */
(function (global) {
    const EXPORT_FORMAT_VERSION = 1;

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

    function stripExportMeta(imported) {
        if (!imported || typeof imported !== 'object') {
            return imported;
        }
        if (Object.prototype.hasOwnProperty.call(imported, 'exportMeta')) {
            delete imported.exportMeta;
        }
        return imported;
    }

    global.CCPCalendarExport = {
        EXPORT_FORMAT_VERSION,
        CALENDAR_DOMAIN_TOP_LEVEL_KEYS,
        ensureCalendarExportShape,
        buildCalendarExportPayload,
        stripExportMeta,
        deepClone
    };
})(typeof window !== 'undefined' ? window : globalThis);
