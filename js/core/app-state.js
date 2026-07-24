/**
 * Core app data defaults — shared between app.js and tests.
 */
(function (global) {
    const SCHEMA_VERSION = 3;

    const DEFAULT_VISIBILITY_FILTERS = {
        lessons: true,
        holidays: true,
        evaluation_deadline: true,
        homework_deadline: true,
        evaluation_period: true,
        other: true
    };

    function getDefaultTimetableTimeSlots() {
        return [
            { id: 'ts1', start: '14:00', end: '15:00', durationMin: 55, sortOrder: 1 },
            { id: 'ts2', start: '15:00', end: '16:00', durationMin: 55, sortOrder: 2 },
            { id: 'ts3', start: '16:00', end: '17:00', durationMin: 55, sortOrder: 3 },
            { id: 'ts4', start: '17:00', end: '18:00', durationMin: 55, sortOrder: 4 },
            { id: 'ts5', start: '18:00', end: '19:00', durationMin: 55, sortOrder: 5 },
            { id: 'ts6', start: '19:00', end: '20:00', durationMin: 55, sortOrder: 6 },
            { id: 'ts7', start: '20:00', end: '21:00', durationMin: 55, sortOrder: 7 }
        ];
    }

    function getDefaultPeriodSlotMap() {
        if (global.CCPTeacherTimetable && global.CCPTeacherTimetable.getDefaultPeriodSlotMap) {
            return global.CCPTeacherTimetable.getDefaultPeriodSlotMap();
        }
        return { '1': 'ts1', '2': 'ts2', '3': 'ts3', '4': 'ts4', '5': 'ts5', '6': 'ts6', '7': 'ts7' };
    }

    function getDefaultAppData(deps) {
        const d = deps || {};
        const slots =
            typeof d.getDefaultTimetableTimeSlots === 'function'
                ? d.getDefaultTimetableTimeSlots()
                : getDefaultTimetableTimeSlots();
        const periodSlotMap =
            typeof d.getDefaultPeriodSlotMap === 'function'
                ? d.getDefaultPeriodSlotMap()
                : getDefaultPeriodSlotMap();
        return {
            schemaVersion: SCHEMA_VERSION,
            classes: [],
            events: [],
            holidays: [],
            cohorts: [],
            tmsRosterLinks: {},
            timetableTimeSlots: slots,
            periodSlotMap,
            customClassTypes: [],
            customSyllabusTemplates: [],
            defaultClassTypeOverrides: {},
            bookOverrides: {},
            curriculumOverrides: {},
            curriculumRemovedIds: [],
            termStart: null,
            termEnd: null,
            useAutoTermEnd: true,
            termMonthCount: 3,
            calendarName: '',
            dayNotes: [],
            dayNoteCategories: [],
            attendanceSessions: [],
            homeworkCompletions: [],
            essaySubmissions: [],
            studentPoints: [],
            studentTests: [],
            debateTeamSessions: [],
            debateScores: [],
            debateCustomFormats: [],
            portfolioRecordings: [],
            portfolioEntries: [],
            smsLog: [],
            rooms: [],
            teacherProfiles: [],
            plannerDrafts: [],
            plannerState: null,
            ui: {
                visibilityFilters: { ...DEFAULT_VISIBILITY_FILTERS },
                printVisibility: { ...DEFAULT_VISIBILITY_FILTERS },
                topBarCollapsed: false
            }
        };
    }

    global.CCPCoreAppState = {
        SCHEMA_VERSION,
        DEFAULT_VISIBILITY_FILTERS,
        getDefaultTimetableTimeSlots,
        getDefaultPeriodSlotMap,
        getDefaultAppData
    };
})(typeof window !== 'undefined' ? window : globalThis);
