// ============================================
// Internationalization (i18n)
// ============================================
let currentLanguage = 'en';

const translations = {
    en: {
        // Header
        appTitle: 'Class Calendar Planner',
        addClass: '+ Add Class',
        addHoliday: '+ Add Holiday',
        export: 'Export',
        import: 'Import',
        print: 'Print',
        printCalendarBtn: 'Print calendar',
        printSummaryBtn: 'Print summary',
        printSectionCalendar: 'Calendar (landscape)',
        printSectionCalendarHint: 'Opens one preview tab with the month grid. Use your browser\'s Print or Save as PDF there.',
        printSectionSummary: 'Summary & syllabi (portrait)',
        printSectionSummaryHint: 'Opens one preview tab with lists and syllabus tables (one class per page).',
        printNothingSelectedSummary: 'Choose at least one summary section to print.',
        printCalendarNeedsTerm: 'Set a term start month before printing the calendar.',
        printCalendarWarnManyTypes: 'You turned on {count} event types on the printed calendar (this layout works best with {max} or fewer). Extra types crowd each day and may be cut off.',
        printCalendarWarnManyClasses: 'You have {count} classes showing on the calendar. Printed day cells are small; some lesson details may be cut off. Use “Filter lessons…” to show fewer classes.',
        printCalendarWarnContinue: 'Print anyway?',
        clearAllData: 'Clear All Data',
        topBarCollapse: 'Collapse toolbar',
        topBarExpand: 'Expand toolbar',
        teamCalendar: 'Team calendar:',
        teamNewCalendar: '+ New',
        syncConnecting: 'Connecting…',
        syncConnected: 'Connected — saved to team folder',
        syncOffline: 'Offline — changes saved in this browser only',
        syncSaving: 'Saving…',
        syncSaved: 'Saved',
        syncError: 'Save error',
        syncReload: 'Reload latest',
        syncDismiss: 'Keep editing',
        syncRemoteNewer: 'Someone else saved a newer version.',
        syncBackupNow: 'Backup to Drive',
        syncBackupOk: 'Backup completed.',
        syncBackupSkipped: 'Google Drive not configured on server.',
        syncConflictTitle: 'Save conflict',
        syncConflictHint: 'Someone else saved while you were editing. Choose which version to keep.',
        syncUseTheirs: 'Use their version',
        syncUseMine: 'Use my version',
        syncSmartMerge: 'Smart merge',
        editorNamePrompt: 'Your name (shown when you save):',
        uploadLocalPrompt: 'Upload your browser calendar to the team folder?',
        newCalendarNamePrompt: 'Name for the new team calendar:',
        newCalendarFailed: 'Could not create calendar',
        duplicateCalendarName: 'A calendar named "{name}" already exists. Choose a different name.',
        teamDeleteCalendar: 'Remove',
        teamCalendarHint: 'Pick a calendar from the list, or click + New. Changes auto-save to the cloud. Edit Calendar Name below to rename. Open Help (sections 15–17) for sign-in, locks, and collaboration.',
        newCalendarCreating: 'Creating…',
        deleteCalendarRemoving: 'Removing…',
        teamCalendarNameLabel: 'Calendar name (saved):',
        teamCalendarEmpty: '— No calendars yet — click + New',
        teamSyncOffline: 'Not connected to team server',
        newCalendarTitle: 'Add team calendar',
        newCalendarHint: 'Enter a name (e.g. Spring 2026). It will be saved to the team and selected in the dropdown above.',
        newCalendarCreate: 'Create calendar',
        newCalendarCreated: 'Created "{name}" — now selected in Team calendar ↑',
        newCalendarAccessTeachers: 'Who can access this calendar?',
        newCalendarAccessHint: 'Check teachers and/or groups. You are always included. Admins can see all calendars.',
        newCalendarAccessGroupsLabel: 'Groups',
        newCalendarNoAccessList: 'No other teachers or groups yet. Only you will have access until an admin adds more.',
        teamCalendarAccessLost: 'You no longer have access to that calendar. Switched to another calendar.',
        deleteCalendarTitle: 'Remove team calendar',
        deleteCalendarConfirm: 'Remove permanently',
        deleteCalendarPrompt: 'Remove "{name}" from the team? This cannot be undone.',
        deleteCalendarDone: 'Removed "{name}".',
        cancel: 'Cancel',
        openFromDriveTitle: 'Use the team link, not this file',
        openFromDriveHint: 'Open the app from your team URL in the browser — do not double-click index.html from a folder.',
        hostEngineTitle: 'Local team server — share this link',
        hostEngineHint: 'Other teachers on your school Wi‑Fi use this URL while the calendar server is running on this PC (npm start or START TEAM CALENDAR.bat).',
        hostTeamLinkLabel: 'Team link:',
        hostCopyLink: 'Copy link',
        teamLockStatusFree: 'Anyone can edit',
        teamLockStatusHeld: 'You are editing',
        teamLockStatusBlocked: '{name} has the lock',
        teamLockStatusPending: '{name} wants to edit',
        teamLockActionAcquire: 'Start editing',
        teamLockActionRelease: 'Release lock',
        teamLockActionRequest: 'Request to edit',
        teamLockActionWaiting: 'Request sent',
        teamLockStatusWaiting: 'Waiting for {name} to allow editing',
        teamLockAllow: 'Allow',
        teamLockDismiss: 'Dismiss',
        teamLockWaitingFlash: 'Waiting for {name} to allow you to edit.',
        teamLockRequestSentFlash: 'Edit request sent. Waiting for {name}.',
        teamLockGrantedFlash: 'You can edit now.',
        teamLockAllowedOtherFlash: '{name} can edit now.',
        teamLockDismissedFlash: 'Edit request dismissed.',
        teamLockedBy: '{name} is editing this calendar.',
        teamLockedByFlash: '{name} is editing this calendar. Click the lock to request editing.',
        teamLockHeld: 'You have the edit lock for this calendar.',
        teamLockHeldFlash: 'You are editing this calendar.',
        teamEditRequestedFlash: '{name} wants to edit this calendar.',
        teamLockReleasedFlash: 'Edit lock released. Others can edit now.',
        teamLockReleaseFailed: 'Could not release the lock. Only the current editor can release it.',
        teamLockRequestFailed: 'Could not send edit request. Try again.',
        teamLockGrantFailed: 'Could not allow editing. Try again.',
        teamLockDismissFailed: 'Could not dismiss the request. Try again.',
        teamLockUnknownUser: 'Another user',
        teamTakeLock: 'Take over editing',
        teamReleaseLock: 'Release lock',
        teamReadOnlySave: 'Someone else is editing. Take over the lock to save.',
        teamSignOut: 'Sign out',
        teamSignOutAll: 'Sign out all devices',
        teamAdminLink: 'Admin',
        editDisplayName: 'Edit name',
        editDisplayNameTitle: 'Edit display name',
        displayNameLabel: 'Display name',
        editDisplayNameHint: 'This name appears in the team calendar header and when you request to edit a calendar.',
        saveDisplayName: 'Save name',
        displayNameRequired: 'Please enter a display name.',
        displayNameTooLong: 'Display name must be 120 characters or fewer.',
        displayNameSaved: 'Display name updated.',
        displayNameSaveFailed: 'Could not update display name.',
        changePassword: 'Change password',
        changePasswordTitle: 'Change password',
        currentPassword: 'Current password',
        newPassword: 'New password',
        confirmPassword: 'Confirm new password',
        passwordMismatch: 'New passwords do not match.',
        passwordTooShort: 'Password must be at least 8 characters.',
        passwordChanged: 'Password updated.',
        passwordChangeFailed: 'Could not change password.',
        noPasswordSet: 'No password is set on your account. Ask your admin to set one.',
        hostLinkCopied: 'Team link copied!',
        langToggle: '🌐 한국어',
        themeDark: '🌙 Dark',
        themeLight: '☀️ Light',
        themeToggleTitle: 'Switch light/dark theme',
        howToBtn: 'Help',
        howToBtnTitle: 'How to use this app',
        printBtn: 'Print',
        printIncludeLabel: 'Include in this print:',
        printIncludeCalendar: 'Calendar (landscape)',
        printIncludeSummary: 'Summary & syllabi (portrait)',
        printNothingSelected: 'Choose at least one: calendar or summary.',
        teamCalendarHelp: 'Team help',
        
        // Term Selector
        calendarName: 'Calendar Name:',
        calendarNamePlaceholder: 'e.g., Fall 2025 Term',
        termStartMonth: 'Term Start Month:',
        termMonthCount: 'Months to display:',
        calendarVisibility: 'Show on calendar:',
        showLessons: 'Lessons',
        showHolidays: 'Holidays',
        showEvalDeadlines: 'Evaluation deadlines',
        showHomeworkDeadlines: 'Homework deadlines',
        showEvalPeriods: 'Evaluation periods',
        showOtherEvents: 'Other events',
        lessonFilterBtn: 'Filter lessons…',
        lessonFilterTitle: 'Filter lessons on calendar',
        lessonFilterStatus: 'Showing {visible} of {total} classes on the calendar and print summary.',
        filterSelectAll: 'Select all',
        filterClearAll: 'Clear all',
        lessonFilterReset: 'Reset filters',
        lessonFilterSectionClasses: 'By class',
        lessonFilterSectionGrade: 'By grade',
        lessonFilterSectionLevel: 'By level',
        lessonFilterSectionType: 'By class type',
        lessonFilterSectionPeriod: 'By period',
        lessonFilterSectionBook: 'By default book',
        lessonFilterNoGrade: '(no grade)',
        lessonFilterNoLevel: '(no level set)',
        lessonFilterNoType: '(no type)',
        lessonFilterNoBook: '(no default book)',
        lessonFilterBtnActive: 'Filter lessons ({visible}/{total})',
        lessonFilterSearchPlaceholder: 'Search classes, grades, levels…',
        lessonFilterSearchEmpty: 'No matches. Try a different search.',
        lessonFilterNoClassesOnCalendar: 'No classes have lessons in the displayed term months. Add classes or adjust the term dates.',
        printLessonFilterActive: 'Lesson filter is on: only {visible} of {total} classes appear on the calendar and in class-related print sections.',
        tabCalendar: 'Calendar',
        tabClasses: 'Classes',
        tabSyllabus: 'Syllabus',
        tabEvents: 'Events',
        tabHomework: 'Homework',
        tabData: 'Data',
        tabPrintDataHeading: 'Data & settings',
        printBooksHeading: 'Books',
        printBooksHint: 'Curriculum books (Write Now, Write Right, Hand in Hand, etc.): lesson plans and page blocks that class syllabi pull from. Green / Blue / Navy levels share one book where pagination is the same.',
        printBooksStats: '{books} book(s) in catalog · {edited} edited',
        printBooksEmpty: 'No curriculum books with page data are registered yet.',
        booksListEdit: 'Edit book',
        booksListSessions: '{n} sessions',
        booksListEdited: 'Edited',
        booksEditorTitle: 'Edit book',
        booksEditorHint: 'Lesson plans and page blocks for this book. Changes apply to all linked class types (e.g. Green, Blue, Navy).',
        booksEditorMetaLevels: 'Levels: {levels}',
        booksEditorMetaLessons: 'Typical lessons per term: {n}',
        booksEditorMetaPresets: 'Linked presets: {ids}',
        booksEditorCustomBadge: 'You have custom page data saved for this book.',
        booksEditorSessionsHeading: 'Sessions',
        booksEditorColPlan: 'Lesson plan',
        booksEditorColPages: 'Pages / detail',
        booksEditorSave: 'Save book',
        booksEditorReset: 'Reset to factory',
        booksEditorResetConfirm: 'Reset this book to factory page data? All linked class types will use the built-in pages again.',
        booksEditorNoRows: 'Add at least one session row before saving.',
        booksEditorAddSession: 'Add session',
        booksEditorColNote: 'Note',
        booksEditorSaveCurriculum: 'Save curriculum',
        booksEditorSessionCountWarn: 'You have {n} sessions; factory default is {factory}. Update total lessons on the class form if needed.',
        tabCurriculum: 'Curriculum',
        curriculumTabIntro: 'Edit session pages and default schedule for each program book, or add your own curriculum. On the class form, pick Level and Book, then Apply from curriculum.',
        curriculumTabPick: 'Select a curriculum to edit sessions and defaults.',
        curriculumAddBtn: 'Add curriculum',
        curriculumAddPrompt: 'Name for the new curriculum (e.g. Middle school reading):',
        curriculumAddTitleRequired: 'Enter a name for the curriculum.',
        curriculumAllLevels: 'All levels',
        curriculumCustomBadge: 'Custom curriculum you created.',
        curriculumEditorNameLabel: 'Curriculum name',
        curriculumDeleteBtn: 'Delete curriculum',
        curriculumDeleteConfirm: 'Delete this custom curriculum? Classes that used it keep their saved data; the book will no longer appear in the list.',
        curriculumEditorApplyHint: 'On the class form, pick Level and Book, then Apply from curriculum.',
        dataCurriculumLinkHint: 'Edit books, session pages, and program defaults on the Curriculum tab.',
        dataOpenCurriculumTab: 'Open Curriculum tab',
        classCurriculumLevel: 'Level',
        classCurriculumBook: 'Book',
        classCurriculumBookPickLevel: 'Select level first',
        classCurriculumNoBook: 'No book (level defaults only)',
        classCurriculumDebate: 'Debate',
        curriculumDebateLevelsLabel: 'Purple and above, middle school',
        curriculumDebateListTag: 'Debate',
        curriculumApplicabilityHeading: 'Applicability & class defaults',
        curriculumApplicabilityHint: 'Check which levels can pick this curriculum on the class form. Defaults apply when you click Apply from curriculum.',
        curriculumDisplayNameLabel: 'Display name',
        curriculumDefaultLessons: 'Default total lessons',
        curriculumDefaultGrade: 'Default grade',
        curriculumDefaultGradeNone: '— None —',
        curriculumDefaultLevel: 'Default section (optional)',
        curriculumDefaultLevelNone: '— None —',
        classCurriculumHint: 'Pick level, then book (Debate is available for Purple+ and middle school), or “No book”. Apply fills settings from the curriculum list.',
        applyCurriculumToClass: 'Apply from curriculum',
        applyCurriculumConfirm: 'Replace class settings from the selected curriculum? Class name and dates are kept.',
        applyCurriculumNoMatch: 'Select a level (and book, or “No book”).',
        applyCurriculumPreview: 'Will apply: book “{book}”, {lessons} lessons.',
        applyCurriculumPreviewNoBook: 'Will apply: level “{level}”, {lessons} lessons (no book; blank syllabus pages).',
        editCurriculumForBook: 'Edit curriculum',
        printSyllabusPresetsHeading: 'My lesson plans/books',
        printSyllabusPresetsHint: 'Custom lesson plans you save under My syllabi on the Syllabus tab, plus edited curriculum books. Export or import a pack to back up lesson plans, book page data, and class-type defaults.',
        printSyllabusStats: '{templates} custom lesson plan(s) · {overrides} edited class-type default(s)',
        printExportSyllabusPack: 'Export lesson plans/books pack',
        printImportSyllabusPack: 'Import lesson plans/books pack',
        printOpenSyllabusTab: 'Open Syllabus tab',
        printEditPdfPresets: 'Edit PDF preset defaults',
        printSyllabusPackExported: 'Lesson plans/books pack downloaded.',
        printSyllabusPackImported: 'Imported {templates} lesson plan(s), {books} book(s), and {overrides} class-type override(s).',
        printSyllabusPackInvalid: 'Not a valid lesson plans/books pack file.',
        printSyllabusManageTemplate: 'Edit',
        printSyllabusNoTemplates: 'No custom lesson plans yet. Use the Syllabus tab → My syllabi, or import a pack.',
        printSyllabusTemplateListLabel: 'Custom lesson plans',
        openFullClassEditor: 'Open full editor',
        viewClassInCalendar: 'View in Calendar',
        viewEventInCalendar: 'View in Calendar',
        openFullEventEditor: 'Open full editor',
        classEditorEmpty: 'Select a class from the list, or click + Add Class to create one.',
        eventEditorEmpty: 'Select an event from the list, or click + Add Event to create one.',
        classListSearchPlaceholder: 'Search classes…',
        eventListSearchPlaceholder: 'Search events…',
        addEvent: '+ Add Event',
        eventType: 'Event type',
        eventTypeHoliday: 'Holiday / no class',
        eventTypeEvalDeadline: 'Evaluation deadline',
        eventTypeHomeworkDeadline: 'Homework deadline',
        eventTypeEvalPeriod: 'Evaluation period',
        eventTypeOther: 'Other',
        eventsSummary: 'Events',
        includeEventsList: 'Include events list',
        printCalendarVisibility: 'On printed calendar, show:',
        saveEvent: 'Save Event',
        editEvent: 'Edit Event',
        addEventTitle: 'Add Event',
        contextAddEventOnDate: 'Add event on {date}',
        confirmDeleteEvent: 'Are you sure you want to delete this event?',
        eventNotesPlaceholder: 'Optional notes...',
        syllabusUnits: 'Syllabus / curriculum units',
        syllabusUnitsHint: 'Optional units for planning. Link events to a unit when editing an event.',
        addSyllabusUnit: 'Add unit',
        syllabusUnitSpeakingPages: 'Speaking pages',
        syllabusUnitWritingPages: 'Writing pages',
        syllabusTable: 'Syllabus table',
        syllabusTableHint: 'Build a printable table (Month, Week, Class #, lesson plan, pages/work). Choose meeting days first; Refresh places each session on those days in term order.',
        syllabusTableEmptyHint: 'No rows yet. Click Refresh from calendar to generate rows from your lesson schedule.',
        refreshSyllabusFromCalendar: 'Refresh from calendar',
        addSyllabusNoteRow: 'Add note row',
        syllabusColMonth: 'Month',
        syllabusColWeek: 'Week',
        syllabusColClass: 'Class',
        syllabusColPlan: 'Weekly Lesson Plan',
        syllabusColPages: 'Pages / detail',
        syllabusColNote: 'Note',
        syllabusTables: 'Syllabus tables',
        includeSyllabusTables: 'Syllabus tables (per class)',
        syllabusModuleMissing: 'Syllabus module did not load. Press Ctrl+F5 to refresh the page. If it still fails, check that js/syllabus-table.js is present.',
        printClassSyllabus: 'Print syllabus',
        printClassSyllabusHint: 'Opens the print dialog; choose Save as PDF to download.',
        printClassSyllabusTitle: 'Syllabus',
        printSyllabusBlocked: 'Could not open the print window. Allow pop-ups for this page and try again.',
        syllabusScheduleAdjustments: 'Schedule adjustments',
        syllabusScheduleAdjustmentsEmpty: 'No holidays or evaluation periods apply to this class during its term.',
        syllabusAdjColType: 'Type',
        syllabusAdjColName: 'Name',
        syllabusAdjColDates: 'Dates',
        syllabusSlotHolidayDetail: 'No regular lesson — holiday / no class',
        syllabusSlotEventDetail: 'Special session — not a regular lesson',
        syllabusOverflowIntro: 'Lessons below were not placed on the calendar before the term ended (holidays and special days used class periods).',
        syllabusOverflowNote: 'Not scheduled in term — extend dates or reduce holidays to fit.',
        syllabusExtraPeriodTitle: 'Open class period',
        syllabusExtraPeriodDetail: 'No lesson scheduled — extra period at end of term',
        syllabusExtraPeriodNote: 'Use for review, extra class, or adjust the calendar.',
        syllabusUnitTitle: 'Unit title',
        linkedSyllabusUnit: 'Syllabus unit (optional)',
        noSyllabusUnit: '— None —',
        fetchKrHolidays: 'Import Korean public holidays',
        fetchKrHolidaysLoading: 'Loading holidays…',
        fetchKrHolidaysConfirm: 'Import South Korea public holidays for your current term from a free public calendar (based on the official lunar gazette)? Includes substitute holidays (대체공휴일). Existing matching holidays will be skipped.',
        fetchKrHolidaysDone: 'Added {added} holiday(s). Skipped {skipped} duplicate(s).',
        fetchKrHolidaysError: 'Could not load Korean holidays. Check your internet connection and try again.',
        fetchKrHolidaysYearUnavailable: 'Holiday data for {year} is not available yet. Try again later or add holidays manually.',
        fetchKrHolidaysCorsError: 'Could not reach the holiday calendar from the browser. Try opening this app from a local web server instead of a file:// link.',
        fetchKrHolidaysNoTerm: 'Set a term start month first.',
        krHolidaysSourceHint: 'Source: holidays.hyunbin.page — free public calendar (official gazette, includes substitute holidays).',
        krPublicHolidayImportNote: 'Auto-imported (KR public calendar)',
        
        // Class Modal
        addNewClass: 'Add New Class',
        editClass: 'Edit Class',
        className: 'Class Name',
        classNamePlaceholder: 'e.g., Debate',
        classPeriod: 'Period',
        classPeriodHint: 'Lower numbers appear first in lists, print summary, and on days with multiple classes (1 = first period).',
        classPeriodVariesByDay: 'Different period on some meeting days',
        classPeriodVariesByDayHint: 'Use when this class is not the same period every day it meets (e.g. Period 1 on Monday, Period 3 on Wednesday).',
        classPeriodByDayLabel: 'Period by day',
        classLevel: 'Class Level',
        classLevelPreset: 'Simson level (preset)',
        classLevelCustom: 'Level (custom)',
        classLevelCustomPlaceholder: 'Optional: level not in the list',
        selectLevel: 'Select level',
        simsonLevelsElementary: 'Elementary',
        simsonLevelsMiddleSchool: 'Middle school',
        defaultBook: 'Default book (fallback)',
        booksByMonth: 'Books by month',
        booksByMonthHint: 'One book per calendar month. Leave blank to use the default book.',
        addBookMonth: 'Add month',
        fillBooksFromDefault: 'Fill term from default book',
        compressionModeLabel: 'Compression',
        compressionModeAuto: 'Auto compress when a month does not have enough class days',
        compressionModeManual: 'Manual only (use my merge choices below)',
        termCalendarMonths: 'Term (calendar months)',
        termCalendarMonthsHint: 'One book unit per month. Default is 3 months = 3 books.',
        useAutoTermEnd: 'Auto-set end date to the last day of the final month',
        bookThisLesson: 'Book (this lesson):',
        levelRequired: 'Please select a Simson level preset or enter a custom level.',
        monthAutoMergeHint: '{month}: auto merges applied ({merges})',
        monthIncompleteHint: '{month}: only {scheduled}/{total} lesson groups placed',
        grade: 'Grade',
        selectGrade: 'Select grade (optional)',
        book: 'Book',
        bookPlaceholder: 'e.g., Debate 2025 Fall Nov. A',
        notes: 'Notes',
        notesPlaceholder: 'Optional notes about this class...',
        startDate: 'Start Date',
        endDate: 'End Date',
        dayOfWeek: 'Day of Week',
        selectDay: 'Select Day',
        sunday: 'Sunday',
        monday: 'Monday',
        tuesday: 'Tuesday',
        wednesday: 'Wednesday',
        thursday: 'Thursday',
        friday: 'Friday',
        saturday: 'Saturday',
        color: 'Color',
        classBackgroundColor: 'Background color',
        classTextColor: 'Text color',
        customSchedule: 'Custom Schedule (manually pick dates for each lesson)',
        selectDatesHint: 'Select specific dates for each lesson day:',
        day1: 'Day 1',
        day2: 'Day 2',
        day3: 'Day 3',
        day4: 'Day 4',
        totalLessons: 'Total Lessons',
        lessonDayLabel: 'Day {n}',
        mergeDaysLabel: 'Merge Day {start}+{end}',
        compressionHint: 'Compression groups (choose merges):',
        compressionOverlapHint: 'Only adjacent lessons can be merged. Overlapping merges are disabled.',
        compressionMergeCheckboxesNote: 'Merge checkboxes apply in Manual mode only. In Auto mode, pairs merge only when a month has fewer class meetings than lesson days.',
        combineDay12: "Combine Day 1+2 on Day 1's date",
        combineDay34: "Combine Day 3+4 on Day 3's date",
        customScheduleLabel: 'Custom',
        delete: 'Delete',
        deleteClass: 'Delete class',
        saveClass: 'Save Class',
        classSaved: 'Class saved.',
        classTypeLabel: 'Class type',
        classTypeHint: 'Pick a preset for typical lesson counts and meeting days. You can still edit every field.',
        classTypeCustom: 'Custom (no preset)',
        classTypeDebate: 'Debate (once per week)',
        classTypeWrSp: 'WR+SP (2× per week, 1 unit/week)',
        classTypeKoreanMulti: 'Korean / multi-day (2× per week)',
        wrSpTypeHint: 'Write Right: 18 lessons (Lesson A/B + combined projects). Early Writers: 21 lessons (Unit [1/2]/[2/2] with SB/WB ranges, revision weeks, level test). Pick the preset that matches your book. (Write Now is separate.)',
        sequentialScheduleHint: 'Lessons run in order across the whole term (1, 2, 3…). Day-pair compression is for weekly debate only.',
        unitLessonSpeaking: 'Unit {u} [1/2] – Speaking',
        unitLessonWriting: 'Unit {u} [2/2] – Writing',
        lessonNumberLabel: 'Lesson {n}',
        termLessonsIncompleteHint: '{name}: {scheduled}/{total} lessons placed (not enough class days in the term)',
        classTypeNewType: 'New class type',
        classTypeCreateTitle: 'Create a class type',
        classTypeName: 'Type name',
        classTypeNamePlaceholder: 'e.g., Science club',
        classTypeMeetingDaysHint: 'Check the weekdays this type usually meets. You can change them later for each class.',
        classTypeSave: 'Save type',
        classTypeDelete: 'Delete type',
        confirmDeleteClassType: 'Remove this saved class type? Classes already added stay unchanged.',
        defaultClassEditorOpen: 'Edit defaults',
        defaultClassEditorTitle: 'Edit default class types',
        defaultClassEditorHint: 'Change factory defaults for built-in and PDF preset types. Your classes keep their own settings; new classes use these values.',
        defaultClassEditorPickType: 'Type to edit',
        defaultClassEditorDisplayName: 'Display name',
        defaultClassEditorImportMode: 'Homework paste mode',
        defaultClassEditorLabelMode: 'Lesson label style',
        defaultClassEditorUnitPair: 'Unit pair labels (speaking / writing)',
        defaultClassEditorSave: 'Save default',
        defaultClassEditorResetType: 'Reset this type',
        defaultClassEditorResetAll: 'Reset all to factory',
        defaultClassEditorResetTypeConfirm: 'Reset this type to factory settings?',
        defaultClassEditorResetAllConfirm: 'Reset every built-in and PDF preset to factory settings?',
        defaultClassEditorFactoryValues: 'Factory: {lessons} lessons, book “{book}”.',
        defaultClassEditorDuplicate: 'Duplicate class type',
        defaultClassEditorDuplicatePick: 'Select a class type to duplicate first.',
        defaultClassEditorCustomTypeNote: 'Custom copy — edit below and click Save custom type. Remove via Delete type when adding a class.',
        defaultClassEditorResetTypeDisabled: 'Only built-in / PDF presets can be reset to factory.',
        defaultClassEditorSaveCustom: 'Save custom type',
        meetingDays: 'Meeting days',
        meetingDaysHint: 'Check each weekday this class meets on the calendar. Use one day for weekly debate; two or more for classes that meet several times a week.',
        meetingDaysRequired: 'Select at least one meeting day, or turn on Custom schedule.',
        meetingDaysQuick: 'Quick:',
        meetingDaysPresetMwf: 'MWF',
        meetingDaysPresetMw: 'Mon/Wed',
        meetingDaysPresetWf: 'Wed/Fri',
        meetingDaysPresetMf: 'Mon/Fri',
        meetingDaysPresetTt: 'T/T',
        meetingDaysPresetClear: 'Clear',
        fillSyllabusFromUnits: 'Fill pages from units',
        applyPresetSyllabus: 'Apply preset pages',
        syllabusPresetTypeHint: 'Choose your meeting days and term dates. The calendar places each session on those days. Then use Refresh from calendar and Apply preset pages.',
        scheduleMatrixSuggestHint: 'Schedule tip: this subject is often Period {period} on {days} ({pattern}). You can change meeting days anytime.',
        homeworkImportTitle: 'Import homework from paste',
        homeworkImportHint: 'Paste debate Day blocks or Unit Part blocks. Run Refresh from calendar first so session numbers match.',
        homeworkImportPlaceholder: 'Paste homework text here…',
        homeworkImportPreview: 'Preview match',
        homeworkImportApply: 'Apply to table',
        homeworkImportNoPaste: 'Paste some homework text first.',
        homeworkImportNoRows: 'Refresh from calendar first to create syllabus rows.',
        homeworkImportPreviewHeader: 'Matched {matched}, unmatched {unmatched}',
        homeworkImportApplied: 'Applied homework to {n} row(s).',
        homeworkTabReferenceDate: 'Reference date',
        homeworkTabToday: 'Today',
        homeworkTabMiniCalendarLabel: 'Pick reference date',
        homeworkTabPrevMonth: 'Previous month',
        homeworkTabNextMonth: 'Next month',
        homeworkTabRefreshSyllabi: 'Refresh syllabi from calendar',
        homeworkTabEditorEmpty: 'Select a class to see homework copy blocks from its syllabus.',
        homeworkTabOpenClass: 'Edit syllabus in Classes',
        homeworkTabOpenSyllabus: 'Edit syllabus',
        openSyllabusTab: 'Edit syllabus',
        classTabOpenSyllabus: 'Edit syllabus',
        syllabusTabEditorEmpty: 'Select a class or a custom syllabus template.',
        syllabusSegmentClasses: 'Classes',
        syllabusSegmentTemplates: 'My syllabi',
        syllabusNewTemplate: '+ New custom syllabus',
        syllabusTemplateSearchPlaceholder: 'Search templates…',
        syllabusSaveClass: 'Save syllabus',
        syllabusSaveTemplate: 'Save template',
        syllabusOpenClassSettings: 'Class schedule & settings',
        syllabusOpenHomework: 'Homework copy',
        syllabusApplyTemplatePick: 'Apply custom syllabus…',
        syllabusSaveAsTemplate: 'Save as template',
        syllabusDeleteTemplate: 'Delete template',
        syllabusModeTemplate: 'Editing template: {name} — apply to a class when ready.',
        syllabusScheduleChip: 'Schedule (saved): {days} · {start} – {end}',
        syllabusScheduleUnsavedHint: 'Save the class in Classes first for an accurate Refresh from calendar.',
        syllabusClassSummary: '{rows} rows in syllabus',
        syllabusClassSummaryEmpty: 'No syllabus rows yet',
        syllabusStartBlank: 'Start blank syllabus',
        addSyllabusLessonRow: 'Add lesson row',
        syllabusConfirmBlank: 'Clear all syllabus units and rows for this class?',
        syllabusConfirmApplyTemplate: 'Replace this class syllabus units and merge page content from the template?',
        syllabusConfirmDeleteTemplate: 'Delete this custom syllabus template?',
        syllabusTemplateNamePrompt: 'Template name',
        syllabusTemplateSaved: 'Template saved.',
        syllabusTemplateApplied: 'Custom syllabus applied.',
        syllabusSaved: 'Syllabus saved.',
        syllabusDuplicateFromClass: 'Duplicate from class',
        syllabusNoTemplates: 'No custom syllabi yet. Click + New custom syllabus.',
        syllabusGeneralNotes: 'General notes & instructions',
        syllabusGeneralNotesHint: 'For parents, substitutes, or your own reminders. Shown at the top when you print this syllabus.',
        syllabusGeneralNotesPlaceholder: 'e.g., Bring workbook every class. Quiz on Unit 3 at session 8…',
        homeworkTabHint: 'This tab only prepares text to copy. Paste it into your separate Simson grading website and homework assignment website — those pages are not part of this app. Text comes from each class syllabus (Pages / detail). Refresh syllabi after calendar changes.',
        homeworkTabExternalBanner: 'Copy from here, then paste on your other websites (Simson grading and homework assignment).',
        homeworkTabDueDate: 'Homework due (next class)',
        homeworkTabGradingTitle: 'Previous week — for Simson grading site',
        homeworkTabAssignTitle: 'This week — for homework assignment site',
        homeworkTabGradingHint: 'Copy this block, open your Simson grading webpage in another tab, and paste there. This is homework due at the current class (from that session’s Pages / detail).',
        homeworkTabAssignHint: 'Copy this block, open your homework assignment webpage in another tab, and paste there. Due on the next in-person class (skips holidays and no-class days).',
        homeworkTabCopy: 'Copy',
        homeworkTabCopyBoth: 'Copy both blocks',
        homeworkTabSyllabiRefreshed: 'Syllabi updated from calendar.',
        homeworkTabCopied: 'Copied to clipboard.',
        homeworkTabCopyFailed: 'Could not copy. Select the text and copy manually.',
        homeworkTabNoLessons: 'No scheduled lessons in the syllabus. Open the class editor and click Refresh from calendar.',
        homeworkTabNoHomeworkText: 'Lessons are scheduled but Pages / detail is empty. Add homework in the syllabus or use Import homework from paste.',
        homeworkTabNoAssignText: 'No homework text for this week in the syllabus.',
        homeworkTabNoGradingText: 'No previous-week homework in the syllabus (first lesson of term).',
        homeworkTabNoDueDate: 'No next class date before term end. Check meeting days and end date.',
        homeworkTabTargetLesson: 'Assign at class on {date} · Session {n}: {title}',
        homeworkTabGradingFrom: 'Grade homework from session {n} ({date}): {title}',
        homeworkTabModuleMissing: 'Homework tab module did not load. Press Ctrl+F5 to refresh.',
        homeworkTabDueLabel: 'Due',
        homeworkTabSessionLabel: 'Session',
        homeworkTabEditableHint: 'Edit the text areas below to update the syllabus (Pages / detail). Copy adds the class name and session header.',
        homeworkTabSavesTo: 'Saves to syllabus: Session {n} · {title}',
        homeworkTabSaved: 'Homework saved to syllabus.',
        homeworkTabNoSyllabusRow: 'No syllabus row linked. Click Refresh syllabi from calendar first.',
        homeworkTabSkippedHeading: 'Regular class days skipped before due date:',
        homeworkTabSkipHoliday: '{date} — {name} (no class)',
        homeworkTabSkipHolidayNoName: '{date} — holiday (no class)',
        workspaceTitle: 'Curriculum workspace',
        workspaceBackCalendar: '← Back to calendar',
        workspaceTabHomework: 'Homework copy',
        workspaceTabBooks: 'Book editor',
        workspaceOpen: 'Open expanded workspace',
        workspaceOpenBooks: 'Open in workspace',
        workspaceHomeworkFlowHint:
            'Text comes from syllabus Pages / detail, which comes from the curriculum book. Edit the book, refresh syllabi, then copy here.',
        workspaceBooksIntro:
            'Edit shared page blocks for each curriculum book. Save, then refresh syllabi on the Homework copy tab.',
        workspaceBooksPick: 'Select a book to edit session pages.',
        workspaceSourceBook: 'Source book:',
        workspaceEditBook: 'Edit book →',
        workspaceBooksFeedHint:
            'Pages / detail here feed class syllabi when you refresh from calendar. Homework copy uses syllabus rows.',
        workspaceBooksSavedRefresh:
            'Book saved. Use Refresh syllabi from calendar on the Homework copy tab to update copy text.',
        workspaceRemoteNewer: 'Calendar was updated elsewhere.',
        workspaceReload: 'Reload',

        // Holiday Modal
        addHolidayTitle: 'Add Holiday',
        editHoliday: 'Edit Holiday',
        holidayName: 'Holiday/Event Name',
        holidayNamePlaceholder: 'e.g., Thanksgiving',
        dateRange: 'Date Range (multiple days)',
        date: 'Date',
        bgColor: 'Background Color',
        textColor: 'Text Color',
        appliesTo: 'Applies To',
        allClasses: 'All Classes',
        byGrade: 'By Grade:',
        byClassName: 'By Class Name:',
        bySection: 'By Simson level:',
        allElementaryLabel: 'All elementary (초1–초6)',
        allMiddleSchoolLabel: 'All middle school (중1–중3)',
        sectionsLabel: 'Levels',
        bySchoolBand: 'School level (quick):',
        holidayFilterRequired: 'Select at least one filter (section, grade band, grades, or class names), or turn on All Classes.',
        eventApplicabilityFilterBtn: 'Choose applicability…',
        eventApplicabilityFilterTitle: 'Event applies to',
        eventApplicabilityFilterStatus: '{selected} of {total} filters selected',
        eventApplicabilityFilterBtnActive: 'Applicability ({selected}/{total})',
        eventApplicabilitySectionSchoolBand: 'School level (quick)',
        eventApplicabilitySectionLevel: 'By Simson level',
        eventApplicabilityNoOptions: 'No classes yet. Add classes in the Classes tab.',
        eventApplicabilitySummaryEmpty: 'No filters selected — open the filter and choose at least one.',
        saveHoliday: 'Save Holiday',
        
        // Popup
        level: 'Level:',
        lesson: 'Lesson:',
        
        // Print Modal
        printOptions: 'Print Options',
        printCalendar: 'Print Calendar',
        printSummaryPage: 'Print Summary Page',
        includeClassList: 'Include Class List',
        includeLessonSchedule: 'Include Lesson Schedule',
        includeCompressionNotes: 'Include Compression Notes',
        
        // Print Summary
        termSummary: 'Term Summary',
        classes: 'Classes',
        holidays: 'Holidays',
        lessonSchedule: 'Lesson Schedule',
        compressionNotes: 'Compression Notes',
        day: 'Day',
        mergedGroupsLabel: 'Merged: {groups}',
        scheduledGroupsLabel: 'Scheduled {scheduled}/{total} lesson groups',
        compressionNoteAutoSuffix: '({available} available dates)',
        compressionNoteCustomSuffix: '(custom schedule)',
        
        // Term seasons (from class/calendar start month)
        termSeasonSpring: 'Spring',
        termSeasonSummer: 'Summer',
        termSeasonFall: 'Fall',
        termSeasonWinter: 'Winter',

        // Calendar
        monthNames: ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'],
        dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        dayNamesFull: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        
        // Autocomplete
        selectToAutofill: 'Select to auto-fill fields:',
        
        // Messages
        allClassesLabel: 'All Classes',
        gradesLabel: 'Grades',
        classesLabel: 'Classes',
        noClassesYet: 'No classes created yet',
        noCompressedDays: 'No classes have compressed days.',
        confirmDeleteClass: 'Are you sure you want to delete this class?',
        confirmDeleteHoliday: 'Are you sure you want to delete this holiday?',
        confirmClearAllData: 'Are you sure you want to clear all data? This will delete all classes, holidays, and calendar settings. This action cannot be undone.',
        clearDataSuccess: 'All data has been cleared.',
        importSuccess: 'Data imported successfully!',
        importDestinationTitle: 'Import calendar data',
        importToCurrent: 'Import into current calendar',
        importToNew: 'Create new team calendar from file',
        importOverwriteWarning: 'Replaces all data in this calendar. Export a backup first if unsure.',
        importOverwriteConfirm: 'Replace all data in "{name}" with the imported file? This cannot be undone.',
        importReadOnlyHint: 'This calendar is locked by another teacher. Request to edit first, or choose “Create new team calendar from file”.',
        importConfirm: 'Import',
        importImporting: 'Importing…',
        importNoActiveCalendar: 'No team calendar selected. Create a new calendar from the file instead.',
        importNewCreated: 'Imported into new calendar "{name}".',
        importToCurrentDone: 'Imported into "{name}".',
        invalidFile: 'Invalid file format. Please select a valid calendar export file.',
        errorReadingFile: 'Error reading file. Please select a valid JSON file.',
        migrationNotice: 'Data migrated to new format:\n- {classes} class(es) updated\n- {holidays} holiday(s) updated\n\nPlease review and update Class Levels (A/B/C) for migrated classes.'
    },
    ko: {
        // Header
        appTitle: '수업 캘린더 플래너',
        addClass: '+ 수업 추가',
        addHoliday: '+ 휴일 추가',
        export: '내보내기',
        import: '가져오기',
        print: '인쇄',
        printCalendarBtn: '캘린더 인쇄',
        printSummaryBtn: '요약 인쇄',
        printSectionCalendar: '캘린더 (가로)',
        printSectionCalendarHint: '월별 그리드 미리 보기 탭이 열립니다. 브라우저에서 인쇄하거나 PDF로 저장하세요.',
        printSectionSummary: '요약 및 강의계획표 (세로)',
        printSectionSummaryHint: '목록과 강의계획표(반별 1페이지) 미리 보기 탭이 열립니다.',
        printNothingSelectedSummary: '인쇄할 요약 항목을 하나 이상 선택하세요.',
        printCalendarNeedsTerm: '캘린더를 인쇄하려면 먼저 학기 시작 월을 설정하세요.',
        printCalendarWarnManyTypes: '인쇄 캘린더에 {count}개 유형이 켜져 있습니다(이 레이아웃은 {max}개 이하가 가장 잘 보입니다). 유형이 많으면 날짜 칸이 비좁고 잘릴 수 있습니다.',
        printCalendarWarnManyClasses: '캘린더에 {count}개 수업이 표시됩니다. 인쇄 칸이 작아 일부 수업 정보가 잘릴 수 있습니다. “수업 필터…”로 수업 수를 줄여 보세요.',
        printCalendarWarnContinue: '그래도 인쇄할까요?',
        clearAllData: '모든 데이터 지우기',
        topBarCollapse: '도구 모음 접기',
        topBarExpand: '도구 모음 펼치기',
        teamCalendar: '팀 캘린더:',
        teamNewCalendar: '+ 새로 만들기',
        syncConnecting: '연결 중…',
        syncConnected: '연결됨 — 팀 폴더에 저장',
        syncOffline: '오프라인 — 이 브라우저에만 저장',
        syncSaving: '저장 중…',
        syncSaved: '저장됨',
        syncError: '저장 오류',
        syncReload: '최신 불러오기',
        syncDismiss: '계속 편집',
        syncRemoteNewer: '다른 사람이 더 새 버전을 저장했습니다.',
        syncBackupNow: 'Drive에 백업',
        syncBackupOk: '백업 완료.',
        syncBackupSkipped: '서버에 Google Drive가 설정되지 않았습니다.',
        syncConflictTitle: '저장 충돌',
        syncConflictHint: '편집 중 다른 사람이 저장했습니다. 유지할 버전을 선택하세요.',
        syncUseTheirs: '상대 버전 사용',
        syncUseMine: '내 버전 사용',
        syncSmartMerge: '스마트 병합',
        editorNamePrompt: '이름 (저장 시 표시):',
        uploadLocalPrompt: '브라우저 캘린더를 팀 폴더에 업로드할까요?',
        newCalendarNamePrompt: '새 팀 캘린더 이름:',
        newCalendarFailed: '캘린더를 만들지 못했습니다',
        duplicateCalendarName: '"{name}"(이)라는 이름의 캘린더가 이미 있습니다. 다른 이름을 사용하세요.',
        teamDeleteCalendar: '삭제',
        teamCalendarHint: '목록에서 선택하거나 + 새로 만들기. 수정은 클라우드에 자동 저장됩니다. 아래 캘린더 이름으로 이름 변경. 로그인·잠금·협업은 도움말 15–17절을 보세요.',
        teamCalendarNameLabel: '캘린더 이름 (저장됨):',
        teamCalendarEmpty: '— 캘린더 없음 — + 새로 만들기 클릭',
        teamSyncOffline: '팀 서버에 연결되지 않음',
        newCalendarTitle: '팀 캘린더 추가',
        newCalendarHint: '이름을 입력하세요 (예: 2026 봄). 팀에 저장되고 위 목록에서 선택됩니다.',
        newCalendarCreating: '만드는 중…',
        deleteCalendarRemoving: '삭제 중…',
        newCalendarCreate: '캘린더 만들기',
        newCalendarCreated: '"{name}" 생성됨 — 팀 캘린더 ↑ 에서 선택됨',
        newCalendarAccessTeachers: '이 캘린더에 접근할 수 있는 사람',
        newCalendarAccessHint: '선생님 및/또는 그룹을 선택하세요. 본인은 항상 포함됩니다. 관리자는 모든 캘린더를 볼 수 있습니다.',
        newCalendarAccessGroupsLabel: '그룹',
        newCalendarNoAccessList: '다른 선생님이나 그룹이 없습니다. 관리자가 추가할 때까지 본인만 접근할 수 있습니다.',
        teamCalendarAccessLost: '해당 캘린더에 더 이상 접근할 수 없습니다. 다른 캘린더로 전환했습니다.',
        deleteCalendarTitle: '팀 캘린더 삭제',
        deleteCalendarConfirm: '영구 삭제',
        deleteCalendarPrompt: '팀에서 "{name}"을(를) 삭제할까요? 되돌릴 수 없습니다.',
        deleteCalendarDone: '"{name}" 삭제됨.',
        cancel: '취소',
        openFromDriveTitle: '팀 링크를 사용하세요 (이 파일 말고)',
        openFromDriveHint: '브라우저에서 팀 링크로 여세요. 폴더의 index.html을 더블클릭하지 마세요.',
        hostEngineTitle: '로컬 팀 서버 — 이 링크를 공유하세요',
        hostEngineHint: '이 PC에서 서버(npm start 또는 START TEAM CALENDAR.bat)를 켠 뒤, 같은 Wi‑Fi의 선생님이 아래 링크로 접속합니다.',
        hostTeamLinkLabel: '팀 링크:',
        hostCopyLink: '링크 복사',
        teamLockStatusFree: '누구나 편집할 수 있음',
        teamLockStatusHeld: '편집 중',
        teamLockStatusBlocked: '{name}님이 잠금 보유',
        teamLockStatusPending: '{name}님이 편집 요청',
        teamLockActionAcquire: '편집 시작',
        teamLockActionRelease: '잠금 해제',
        teamLockActionRequest: '편집 요청',
        teamLockActionWaiting: '요청 전송됨',
        teamLockStatusWaiting: '{name}님의 허용을 기다리는 중',
        teamLockAllow: '허용',
        teamLockDismiss: '거절',
        teamLockWaitingFlash: '{name}님이 편집을 허용할 때까지 기다리는 중입니다.',
        teamLockRequestSentFlash: '편집 요청을 보냈습니다. {name}님을 기다리는 중입니다.',
        teamLockGrantedFlash: '이제 편집할 수 있습니다.',
        teamLockAllowedOtherFlash: '{name}님이 편집할 수 있습니다.',
        teamLockDismissedFlash: '편집 요청이 거절되었습니다.',
        teamLockedBy: '{name}님이 이 캘린더를 편집 중입니다.',
        teamLockedByFlash: '{name}님이 편집 중입니다. 자물쇠를 눌러 편집을 요청하세요.',
        teamLockHeld: '이 캘린더의 편집 잠금을 보유 중입니다.',
        teamLockHeldFlash: '이 캘린더를 편집 중입니다.',
        teamEditRequestedFlash: '{name}님이 편집을 요청했습니다.',
        teamLockReleasedFlash: '편집 잠금을 해제했습니다. 다른 선생님도 편집할 수 있습니다.',
        teamLockReleaseFailed: '잠금을 해제할 수 없습니다. 현재 편집 중인 사람만 해제할 수 있습니다.',
        teamLockRequestFailed: '편집 요청을 보낼 수 없습니다. 다시 시도하세요.',
        teamLockGrantFailed: '편집을 허용할 수 없습니다. 다시 시도하세요.',
        teamLockDismissFailed: '요청을 거절할 수 없습니다. 다시 시도하세요.',
        teamLockUnknownUser: '다른 사용자',
        teamTakeLock: '편집 인수',
        teamReleaseLock: '잠금 해제',
        teamReadOnlySave: '다른 사람이 편집 중입니다. 저장하려면 잠금을 인수하세요.',
        teamSignOut: '로그아웃',
        teamSignOutAll: '모든 기기에서 로그아웃',
        teamAdminLink: '관리',
        editDisplayName: '이름 변경',
        editDisplayNameTitle: '표시 이름 변경',
        displayNameLabel: '표시 이름',
        editDisplayNameHint: '이 이름은 팀 캘린더 상단과 편집 요청 시 다른 선생님에게 표시됩니다.',
        saveDisplayName: '이름 저장',
        displayNameRequired: '표시 이름을 입력하세요.',
        displayNameTooLong: '표시 이름은 120자 이하여야 합니다.',
        displayNameSaved: '표시 이름이 저장되었습니다.',
        displayNameSaveFailed: '표시 이름을 저장할 수 없습니다.',
        changePassword: '비밀번호 변경',
        changePasswordTitle: '비밀번호 변경',
        currentPassword: '현재 비밀번호',
        newPassword: '새 비밀번호',
        confirmPassword: '새 비밀번호 확인',
        passwordMismatch: '새 비밀번호가 일치하지 않습니다.',
        passwordTooShort: '비밀번호는 8자 이상이어야 합니다.',
        passwordChanged: '비밀번호가 변경되었습니다.',
        passwordChangeFailed: '비밀번호를 변경할 수 없습니다.',
        noPasswordSet: '비밀번호가 설정되어 있지 않습니다. 관리자에게 문의하세요.',
        hostLinkCopied: '팀 링크가 복사되었습니다!',
        langToggle: '🌐 English',
        themeDark: '🌙 다크',
        themeLight: '☀️ 라이트',
        themeToggleTitle: '라이트/다크 테마 전환',
        howToBtn: '도움말',
        howToBtnTitle: '앱 사용 방법',
        printBtn: '인쇄',
        printIncludeLabel: '이번 인쇄에 포함:',
        printIncludeCalendar: '캘린더 (가로)',
        printIncludeSummary: '요약 및 강의계획 (세로)',
        printNothingSelected: '캘린더 또는 요약 중 하나 이상을 선택하세요.',
        teamCalendarHelp: '팀 도움말',
        
        // Term Selector
        calendarName: '캘린더 이름:',
        calendarNamePlaceholder: '예: 2025 가을 학기',
        termStartMonth: '학기 시작 월:',
        termMonthCount: '표시할 개월 수:',
        calendarVisibility: '캘린더에 표시:',
        showLessons: '수업',
        showHolidays: '휴일',
        showEvalDeadlines: '평가 마감',
        showHomeworkDeadlines: '숙제 마감',
        showEvalPeriods: '평가 기간',
        showOtherEvents: '기타 일정',
        lessonFilterBtn: '수업 필터…',
        lessonFilterTitle: '캘린더 수업 필터',
        lessonFilterStatus: '캘린더·인쇄에 {total}개 중 {visible}개 수업이 표시됩니다.',
        filterSelectAll: '전체 선택',
        filterClearAll: '전체 해제',
        lessonFilterReset: '필터 초기화',
        lessonFilterSectionClasses: '수업별',
        lessonFilterSectionGrade: '학년별',
        lessonFilterSectionLevel: '레벨별',
        lessonFilterSectionType: '수업 유형별',
        lessonFilterSectionPeriod: '교시별',
        lessonFilterSectionBook: '기본 교재별',
        lessonFilterNoGrade: '(학년 없음)',
        lessonFilterNoLevel: '(레벨 없음)',
        lessonFilterNoType: '(유형 없음)',
        lessonFilterNoBook: '(기본 교재 없음)',
        lessonFilterBtnActive: '수업 필터 ({visible}/{total})',
        lessonFilterSearchPlaceholder: '수업, 학년, 레벨 검색…',
        lessonFilterSearchEmpty: '일치하는 항목이 없습니다. 다른 검색어를 입력해 보세요.',
        lessonFilterNoClassesOnCalendar: '표시된 학기 달에 수업이 없습니다. 수업을 추가하거나 학기 날짜를 조정하세요.',
        printLessonFilterActive: '수업 필터 적용 중: {total}개 중 {visible}개만 캘린더와 수업 관련 인쇄에 표시됩니다.',
        tabCalendar: '캘린더',
        tabClasses: '수업',
        tabSyllabus: '강의 계획표',
        tabEvents: '일정',
        tabHomework: '숙제',
        tabData: '데이터',
        tabPrintDataHeading: '데이터 및 설정',
        printBooksHeading: '교재',
        printBooksHint: 'Write Now, Write Right, Hand in Hand 등 교재별 수업 계획·페이지 데이터입니다. 수업 강의 계획표에 불러옵니다. Green/Blue/Navy는 페이지가 같으면 하나의 교재로 묶입니다.',
        printBooksStats: '교재 {books}권 · 수정 {edited}권',
        printBooksEmpty: '등록된 교재 페이지 데이터가 없습니다.',
        booksListEdit: '교재 편집',
        booksListSessions: '수업 {n}회',
        booksListEdited: '수정됨',
        booksEditorTitle: '교재 편집',
        booksEditorHint: '이 교재의 수업 계획과 페이지 블록입니다. 저장하면 연결된 모든 수업 유형(Green, Blue, Navy 등)에 적용됩니다.',
        booksEditorMetaLevels: '레벨: {levels}',
        booksEditorMetaLessons: '학기 기본 수업 수: {n}',
        booksEditorMetaPresets: '연결 프리셋: {ids}',
        booksEditorCustomBadge: '이 교재에 저장된 사용자 페이지 데이터가 있습니다.',
        booksEditorSessionsHeading: '회차',
        booksEditorColPlan: '수업 계획',
        booksEditorColPages: '페이지 / 상세',
        booksEditorSave: '교재 저장',
        booksEditorReset: '공장 기본값 복원',
        booksEditorResetConfirm: '이 교재를 공장 기본 페이지로 되돌릴까요? 연결된 모든 수업 유형에 적용됩니다.',
        booksEditorNoRows: '저장하려면 최소 한 개의 회차가 필요합니다.',
        booksEditorAddSession: '회차 추가',
        booksEditorColNote: '메모',
        booksEditorSaveCurriculum: '교재과정 저장',
        booksEditorSessionCountWarn: '회차 {n}개입니다. 공장 기본값은 {factory}개입니다. 필요하면 수업의 총 수업 수를 맞추세요.',
        tabCurriculum: '교재과정',
        curriculumTabIntro: '프로그램 교재를 편집하거나 새 교재과정을 추가할 수 있습니다. 수업 양식에서 레벨·교재 선택 후 적용하세요.',
        curriculumTabPick: '편집할 교재과정을 선택하세요.',
        curriculumAddBtn: '교재과정 추가',
        curriculumAddPrompt: '새 교재과정 이름 (예: 중등 리딩):',
        curriculumAddTitleRequired: '교재과정 이름을 입력하세요.',
        curriculumAllLevels: '모든 레벨',
        curriculumCustomBadge: '직접 만든 교재과정입니다.',
        curriculumEditorNameLabel: '교재과정 이름',
        curriculumDeleteBtn: '교재과정 삭제',
        curriculumDeleteConfirm: '이 사용자 교재과정을 삭제할까요? 이미 쓰는 수업 데이터는 남고, 목록에서만 사라집니다.',
        curriculumEditorApplyHint: '수업 양식에서 레벨·교재 선택 후 교재과정에서 적용을 누르세요.',
        dataCurriculumLinkHint: '교재과정 탭에서 교재, 회차, 기본값을 편집합니다.',
        dataOpenCurriculumTab: '교재과정 탭 열기',
        classCurriculumLevel: '레벨',
        classCurriculumBook: '교재',
        classCurriculumBookPickLevel: '먼저 레벨을 선택하세요',
        classCurriculumNoBook: '교재 없음 (레벨 기본만)',
        classCurriculumDebate: '토론 (Debate)',
        curriculumDebateLevelsLabel: 'Purple 이상, 중등',
        curriculumDebateListTag: '토론',
        curriculumApplicabilityHeading: '적용 레벨·수업 기본값',
        curriculumApplicabilityHint: '수업 양식의 교재 목록에 이 교재과정이 보일 레벨을 고릅니다. 적용 시 기본값이 채워집니다.',
        curriculumDisplayNameLabel: '표시 이름',
        curriculumDefaultLessons: '기본 총 수업 수',
        curriculumDefaultGrade: '기본 학년',
        curriculumDefaultGradeNone: '— 없음 —',
        curriculumDefaultLevel: '기본 심슨 레벨 (선택)',
        curriculumDefaultLevelNone: '— 없음 —',
        classCurriculumHint: '레벨을 고른 뒤 교재를 선택하세요(토론: Purple 이상·중등). “교재 없음”도 가능합니다. 적용은 교재과정 탭과 동일합니다.',
        applyCurriculumToClass: '교재과정에서 적용',
        applyCurriculumConfirm: '선택한 교재과정으로 수업 설정을 바꿀까요? 수업 이름과 날짜는 유지됩니다.',
        applyCurriculumNoMatch: '레벨을 선택하세요 (교재 또는 “교재 없음”).',
        applyCurriculumPreview: '적용 예: 교재 “{book}”, 수업 {lessons}회',
        applyCurriculumPreviewNoBook: '적용 예: 레벨 “{level}”, 수업 {lessons}회 (교재 없음, 빈 페이지)',
        editCurriculumForBook: '교재과정 편집',
        printSyllabusPresetsHeading: '내 수업 계획/교재',
        printSyllabusPresetsHint: '강의 계획표 탭의 내 강의 계획표에 저장한 사용자 수업 계획과 수정한 교재입니다. 팩으로보내거나 가져와 수업 계획, 교재 페이지, 수업 유형 기본값을 백업할 수 있습니다.',
        printSyllabusStats: '사용자 수업 계획 {templates}개 · 수정한 유형 기본값 {overrides}개',
        printExportSyllabusPack: '수업 계획·교재 팩보내기',
        printImportSyllabusPack: '수업 계획·교재 팩 가져오기',
        printOpenSyllabusTab: '강의 계획표 탭 열기',
        printEditPdfPresets: 'PDF 프리셋 기본값 편집',
        printSyllabusPackExported: '수업 계획·교재 팩을 다운로드했습니다.',
        printSyllabusPackImported: '수업 계획 {templates}개, 교재 {books}권, 유형 덮어쓰기 {overrides}개를 가져왔습니다.',
        printSyllabusPackInvalid: '올바른 수업 계획·교재 팩 파일이 아닙니다.',
        printSyllabusManageTemplate: '편집',
        printSyllabusNoTemplates: '사용자 수업 계획이 없습니다. 강의 계획표 탭 → 내 강의 계획표를 사용하거나 팩을 가져오세요.',
        printSyllabusTemplateListLabel: '사용자 수업 계획',
        openFullClassEditor: '전체 편집기 열기',
        viewClassInCalendar: '캘린더에서 보기',
        viewEventInCalendar: '캘린더에서 보기',
        openFullEventEditor: '전체 편집기 열기',
        classEditorEmpty: '목록에서 수업을 선택하거나 + 수업 추가를 클릭하세요.',
        eventEditorEmpty: '목록에서 일정을 선택하거나 + 일정 추가를 클릭하세요.',
        classListSearchPlaceholder: '수업 검색…',
        eventListSearchPlaceholder: '일정 검색…',
        addEvent: '+ 일정 추가',
        eventType: '일정 유형',
        eventTypeHoliday: '휴일 / 수업 없음',
        eventTypeEvalDeadline: '평가 마감',
        eventTypeHomeworkDeadline: '숙제 마감',
        eventTypeEvalPeriod: '평가 기간',
        eventTypeOther: '기타',
        eventsSummary: '일정',
        includeEventsList: '일정 목록 포함',
        printCalendarVisibility: '인쇄 캘린더에 표시:',
        saveEvent: '일정 저장',
        editEvent: '일정 편집',
        addEventTitle: '일정 추가',
        contextAddEventOnDate: '{date}에 일정 추가',
        confirmDeleteEvent: '이 일정을 삭제하시겠습니까?',
        eventNotesPlaceholder: '메모 (선택)...',
        syllabusUnits: '교육과정 / 단원',
        syllabusUnitsHint: '선택 사항. 일정 편집 시 단원과 연결할 수 있습니다.',
        addSyllabusUnit: '단원 추가',
        syllabusUnitSpeakingPages: '스피킹 교재 페이지',
        syllabusUnitWritingPages: '라이팅 교재 페이지',
        syllabusTable: '강의 계획표',
        syllabusTableHint: '인쇄용 표(월, 주, 수업 번호, 수업 계획, 메모)를 만듭니다. 수업 요일을 먼저 선택한 뒤, 새로고침하면 학기 순서대로 해당 요일에 수업이 배치됩니다.',
        syllabusTableEmptyHint: '아직 행이 없습니다. 캘린더에서 새로고침을 눌러 수업 일정에서 행을 만드세요.',
        refreshSyllabusFromCalendar: '캘린더에서 새로고침',
        addSyllabusNoteRow: '메모 행 추가',
        syllabusColMonth: '월',
        syllabusColWeek: '주',
        syllabusColClass: '수업',
        syllabusColPlan: '주간 수업 계획',
        syllabusColPages: '교재 / 상세',
        syllabusColNote: '메모',
        syllabusTables: '강의 계획표',
        includeSyllabusTables: '강의 계획표 (수업별)',
        syllabusModuleMissing: '강의 계획표 모듈을 불러오지 못했습니다. Ctrl+F5로 새로고침하세요. js/syllabus-table.js 파일을 확인하세요.',
        printClassSyllabus: '강의 계획표 인쇄',
        printClassSyllabusHint: '인쇄 창이 열립니다. PDF로 저장을 선택하면 파일로 저장할 수 있습니다.',
        printClassSyllabusTitle: '강의 계획표',
        printSyllabusBlocked: '인쇄 창을 열 수 없습니다. 팝업을 허용한 뒤 다시 시도하세요.',
        syllabusScheduleAdjustments: '일정 조정',
        syllabusScheduleAdjustmentsEmpty: '이 수업 기간에 해당하는 공휴일·평가 기간이 없습니다.',
        syllabusAdjColType: '유형',
        syllabusAdjColName: '이름',
        syllabusAdjColDates: '기간',
        syllabusSlotHolidayDetail: '정규 수업 없음 — 공휴일 / 휴업',
        syllabusSlotEventDetail: '특별 일정 — 정규 수업 대신 진행',
        syllabusOverflowIntro: '아래 수업은 학기 종료 전에 달력에 배치되지 않았습니다 (공휴일·특별 일정이 수업일을 사용함).',
        syllabusOverflowNote: '학기 내 미배정 — 기간 연장 또는 공휴일 조정이 필요합니다.',
        syllabusExtraPeriodTitle: '여유 교시',
        syllabusExtraPeriodDetail: '배정된 수업 없음 — 학기 말 여유 교시',
        syllabusExtraPeriodNote: '복습, 보충 수업 등에 활용하거나 일정을 조정하세요.',
        syllabusUnitTitle: '단원 제목',
        linkedSyllabusUnit: '교육과정 단원 (선택)',
        noSyllabusUnit: '— 없음 —',
        fetchKrHolidays: '한국 공휴일 가져오기',
        fetchKrHolidaysLoading: '공휴일 불러오는 중…',
        fetchKrHolidaysConfirm: '현재 학기의 대한민국 공휴일을 무료 공개 달력(공식 월력요항 기준)에서 가져올까요? 대체공휴일을 포함합니다. 이미 있는 공휴일은 건너뜁니다.',
        fetchKrHolidaysDone: '공휴일 {added}개 추가, {skipped}개 중복 건너뜀.',
        fetchKrHolidaysError: '공휴일을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.',
        fetchKrHolidaysYearUnavailable: '{year}년 공휴일 데이터를 아직 사용할 수 없습니다. 나중에 다시 시도하거나 직접 추가하세요.',
        fetchKrHolidaysCorsError: '브라우저에서 공휴일 달력에 연결할 수 없습니다. file:// 대신 로컬 웹 서버로 열어 보세요.',
        fetchKrHolidaysNoTerm: '먼저 학기 시작 월을 설정하세요.',
        krHolidaysSourceHint: '출처: holidays.hyunbin.page — 무료 공개 달력(공식 월력요항, 대체공휴일 포함).',
        krPublicHolidayImportNote: '자동 가져옴 (한국 공휴일 공개 달력)',
        
        // Class Modal
        addNewClass: '새 수업 추가',
        editClass: '수업 편집',
        className: '수업 이름',
        classNamePlaceholder: '예: 토론',
        classPeriod: '교시',
        classPeriodHint: '숫자가 작을수록 목록·인쇄 요약·같은 날 여러 수업에서 먼저 표시됩니다 (1 = 1교시).',
        classPeriodVariesByDay: '요일마다 교시가 다름',
        classPeriodVariesByDayHint: '만나는 요일마다 교시가 다를 때 사용하세요 (예: 월 1교시, 수 3교시).',
        classPeriodByDayLabel: '요일별 교시',
        classLevel: '반',
        classLevelPreset: '심슨 레벨 (프리셋)',
        classLevelCustom: '레벨 (직접 입력)',
        classLevelCustomPlaceholder: '선택: 목록에 없는 레벨',
        selectLevel: '레벨 선택',
        simsonLevelsElementary: '초등',
        simsonLevelsMiddleSchool: '중등',
        defaultBook: '기본 교재 (대체)',
        booksByMonth: '월별 교재',
        booksByMonthHint: '달력 월마다 교재를 지정합니다. 비우면 기본 교재를 사용합니다.',
        addBookMonth: '월 추가',
        fillBooksFromDefault: '기간에 기본 교재 채우기',
        compressionModeLabel: '압축',
        compressionModeAuto: '한 달 수업일이 부족하면 자동으로 합치기',
        compressionModeManual: '수동만 (아래 선택한 합치기만 사용)',
        termCalendarMonths: '기간 (달력 개월 수)',
        termCalendarMonthsHint: '월마다 교재 1권. 기본 3개월 = 교재 3권.',
        useAutoTermEnd: '종료일을 마지막 달의 말일로 자동 설정',
        bookThisLesson: '교재 (이 수업):',
        levelRequired: '심슨 레벨 프리셋 또는 직접 입력 중 하나를 선택하세요.',
        monthAutoMergeHint: '{month}: 자동 합침 ({merges})',
        monthIncompleteHint: '{month}: {scheduled}/{total} 그룹만 배치',
        grade: '학년',
        selectGrade: '학년 선택 (선택)',
        book: '교재',
        bookPlaceholder: '예: 토론 2025 가을 11월 A',
        notes: '메모',
        notesPlaceholder: '이 수업에 대한 메모...',
        startDate: '시작일',
        endDate: '종료일',
        dayOfWeek: '요일',
        selectDay: '요일 선택',
        sunday: '일요일',
        monday: '월요일',
        tuesday: '화요일',
        wednesday: '수요일',
        thursday: '목요일',
        friday: '금요일',
        saturday: '토요일',
        color: '색상',
        classBackgroundColor: '배경색',
        classTextColor: '글자색',
        customSchedule: '사용자 지정 일정 (각 수업 날짜 직접 선택)',
        selectDatesHint: '각 수업일의 특정 날짜를 선택하세요:',
        day1: '1일차',
        day2: '2일차',
        day3: '3일차',
        day4: '4일차',
        totalLessons: '총 수업 횟수',
        lessonDayLabel: '{n}일차',
        mergeDaysLabel: '{start}+{end}일차 합치기',
        compressionHint: '압축 그룹 선택:',
        compressionOverlapHint: '인접 수업만 합칠 수 있습니다. 겹치는 합치기는 비활성화됩니다.',
        compressionMergeCheckboxesNote: '아래 합치기는 수동 모드에서만 적용됩니다. 자동 모드에서는 그 달 수업 횟수가 부족할 때만 합칩니다.',
        combineDay12: '1+2일차를 1일차 날짜에 합치기',
        combineDay34: '3+4일차를 3일차 날짜에 합치기',
        customScheduleLabel: '사용자 지정',
        delete: '삭제',
        deleteClass: '수업 삭제',
        saveClass: '수업 저장',
        classSaved: '수업을 저장했습니다.',
        classTypeLabel: '수업 유형',
        classTypeHint: '미리 정해진 수업 횟수·요일을 불러옵니다. 아래 항목은 언제든 바꿀 수 있습니다.',
        classTypeCustom: '사용자 지정 (프리셋 없음)',
        classTypeDebate: '토론 (주 1회)',
        classTypeWrSp: 'WR+SP (주 2회, 주당 1단원)',
        classTypeKoreanMulti: '한국어 / 주 2회 이상',
        wrSpTypeHint: 'Write Right 18회 / Early Writers 21회 — 프리셋별 페이지·숙제 상세 다름. 해당 교재 프리셋 선택. (Write Now 별도.)',
        sequentialScheduleHint: '학기 전체에 걸쳐 1, 2, 3… 순서로 배치합니다. 일자 합치기는 주 1회 토론 수업에만 해당합니다.',
        unitLessonSpeaking: '단원 {u} [1/2] – 말하기',
        unitLessonWriting: '단원 {u} [2/2] – 쓰기',
        lessonNumberLabel: '{n}회차',
        termLessonsIncompleteHint: '{name}: {scheduled}/{total}회 배치됨 (학기 중 수업일 부족)',
        classTypeNewType: '새 수업 유형',
        classTypeCreateTitle: '수업 유형 만들기',
        classTypeName: '유형 이름',
        classTypeNamePlaceholder: '예: 과학 동아리',
        classTypeMeetingDaysHint: '이 유형이 보통 만나는 요일을 선택하세요. 나중에 수업마다 바꿀 수 있습니다.',
        classTypeSave: '유형 저장',
        classTypeDelete: '유형 삭제',
        confirmDeleteClassType: '저장된 이 수업 유형을 삭제할까요? 이미 만든 수업은 그대로 둡니다.',
        defaultClassEditorOpen: '기본값 편집',
        defaultClassEditorTitle: '기본 수업 유형 편집',
        defaultClassEditorHint: '기본 유형과 PDF 프리셋의 공장 기본값을 바꿉니다. 이미 만든 수업은 그대로이고, 새 수업에 적용됩니다.',
        defaultClassEditorPickType: '편집할 유형',
        defaultClassEditorDisplayName: '표시 이름',
        defaultClassEditorImportMode: '과제 붙여넣기 모드',
        defaultClassEditorLabelMode: '수업 라벨 방식',
        defaultClassEditorUnitPair: '단원 쌍 라벨 (말하기/쓰기)',
        defaultClassEditorSave: '기본값 저장',
        defaultClassEditorResetType: '이 유형 초기화',
        defaultClassEditorResetAll: '전체 공장값 복원',
        defaultClassEditorResetTypeConfirm: '이 유형을 공장 기본값으로 되돌릴까요?',
        defaultClassEditorResetAllConfirm: '모든 기본·PDF 프리셋을 공장 기본값으로 되돌릴까요?',
        defaultClassEditorFactoryValues: '공장 기본: 수업 {lessons}회, 교재 “{book}”.',
        defaultClassEditorDuplicate: '수업 유형 복제',
        defaultClassEditorDuplicatePick: '먼저 복제할 유형을 선택하세요.',
        defaultClassEditorCustomTypeNote: '사용자 복사본 — 아래를 수정한 뒤 사용자 유형 저장을 누르세요. 수업 추가 화면에서 유형 삭제로 제거할 수 있습니다.',
        defaultClassEditorResetTypeDisabled: '공장 초기화는 기본·PDF 프리셋만 가능합니다.',
        defaultClassEditorSaveCustom: '사용자 유형 저장',
        meetingDays: '수업 요일',
        meetingDaysHint: '캘린더에서 실제로 만나는 요일을 모두 선택하세요. 토론은 보통 주 1회, 한국어 수업은 주 2회 이상인 경우가 많습니다.',
        meetingDaysRequired: '요일을 하나 이상 선택하거나, 사용자 지정 일정을 켜 주세요.',
        meetingDaysQuick: '빠른 선택:',
        meetingDaysPresetMwf: '월·수·금',
        meetingDaysPresetMw: '월수',
        meetingDaysPresetWf: '수금',
        meetingDaysPresetMf: '월금',
        meetingDaysPresetTt: '화·목',
        meetingDaysPresetClear: '지우기',
        fillSyllabusFromUnits: '단원에서 페이지 채우기',
        applyPresetSyllabus: '프리셋 페이지 적용',
        syllabusPresetTypeHint: '수업 요일과 학기 날짜를 직접 선택하세요. 캘린더가 그 요일에 수업을 배치합니다. 그다음 캘린더에서 새로고침 → 프리셋 페이지 적용을 사용하세요.',
        scheduleMatrixSuggestHint: '시간표 참고: 이 과목은 보통 {period}교시, {days} ({pattern})입니다. 수업 요일은 언제든 바꿀 수 있습니다.',
        homeworkImportTitle: '과제 붙여넣기 가져오기',
        homeworkImportHint: 'Debate Day 블록 또는 Unit Part 블록을 붙여넣으세요. 먼저 캘린더에서 새로고침하세요.',
        homeworkImportPlaceholder: '과제 텍스트를 여기에 붙여넣기…',
        homeworkImportPreview: '매칭 미리보기',
        homeworkImportApply: '표에 적용',
        homeworkImportNoPaste: '붙여넣을 텍스트가 없습니다.',
        homeworkImportNoRows: '먼저 캘린더에서 새로고침하세요.',
        homeworkImportPreviewHeader: '매칭 {matched}건, 미매칭 {unmatched}건',
        homeworkImportApplied: '{n}개 행에 과제를 적용했습니다.',
        homeworkTabReferenceDate: '기준 날짜',
        homeworkTabToday: '오늘',
        homeworkTabMiniCalendarLabel: '기준 날짜 선택',
        homeworkTabPrevMonth: '이전 달',
        homeworkTabNextMonth: '다음 달',
        homeworkTabRefreshSyllabi: '캘린더에서 강의 계획표 새로고침',
        homeworkTabEditorEmpty: '수업을 선택하면 강의 계획표의 숙제 복사 블록이 표시됩니다.',
        homeworkTabOpenClass: '수업 탭에서 강의 계획표 편집',
        homeworkTabOpenSyllabus: '강의 계획표 편집',
        openSyllabusTab: '강의 계획표 편집',
        classTabOpenSyllabus: '강의 계획표 편집',
        syllabusTabEditorEmpty: '수업 또는 사용자 강의 계획표 템플릿을 선택하세요.',
        syllabusSegmentClasses: '수업',
        syllabusSegmentTemplates: '내 강의 계획표',
        syllabusNewTemplate: '+ 사용자 강의 계획표',
        syllabusTemplateSearchPlaceholder: '템플릿 검색…',
        syllabusSaveClass: '강의 계획표 저장',
        syllabusSaveTemplate: '템플릿 저장',
        syllabusOpenClassSettings: '수업 일정 및 설정',
        syllabusOpenHomework: '숙제 복사',
        syllabusApplyTemplatePick: '사용자 강의 계획표 적용…',
        syllabusSaveAsTemplate: '템플릿으로 저장',
        syllabusDeleteTemplate: '템플릿 삭제',
        syllabusModeTemplate: '템플릿 편집: {name} — 준비되면 수업에 적용하세요.',
        syllabusScheduleChip: '일정 (저장됨): {days} · {start} – {end}',
        syllabusScheduleUnsavedHint: '캘린더에서 정확히 새로고침하려면 수업 탭에서 먼저 저장하세요.',
        syllabusClassSummary: '강의 계획표 {rows}행',
        syllabusClassSummaryEmpty: '강의 계획표 행 없음',
        syllabusStartBlank: '빈 강의 계획표로 시작',
        addSyllabusLessonRow: '수업 행 추가',
        syllabusConfirmBlank: '이 수업의 강의 계획표 단원과 행을 모두 지울까요?',
        syllabusConfirmApplyTemplate: '이 수업의 단원을 바꾸고 템플릿의 페이지 내용을 병합할까요?',
        syllabusConfirmDeleteTemplate: '이 사용자 강의 계획표 템플릿을 삭제할까요?',
        syllabusTemplateNamePrompt: '템플릿 이름',
        syllabusTemplateSaved: '템플릿을 저장했습니다.',
        syllabusTemplateApplied: '사용자 강의 계획표를 적용했습니다.',
        syllabusSaved: '강의 계획표를 저장했습니다.',
        syllabusDuplicateFromClass: '수업에서 복제',
        syllabusNoTemplates: '사용자 강의 계획표가 없습니다. + 사용자 강의 계획표를 누르세요.',
        syllabusGeneralNotes: '일반 메모 및 안내',
        syllabusGeneralNotesHint: '학부모, 대체 강사, 본인 참고용. 강의 계획표 인쇄 시 상단에 표시됩니다.',
        syllabusGeneralNotesPlaceholder: '예: 매 수업 교재 지참. 8회차에 3단원 시험…',
        homeworkTabHint: '이 탭은 복사할 텍스트만 준비합니다. 별도의 Simson 채점 웹사이트와 숙제 배정 웹사이트에 붙여넣으세요 — 그 페이지는 이 앱에 없습니다. 텍스트는 각 수업 강의 계획표(페이지/세부)에서 가져옵니다. 캘린더 변경 후 강의 계획표를 새로고침하세요.',
        homeworkTabExternalBanner: '여기서 복사한 뒤, 다른 웹사이트(Simson 채점·숙제 배정)에 붙여넣으세요.',
        homeworkTabDueDate: '숙제 마감 (다음 수업)',
        homeworkTabGradingTitle: '지난주 — Simson 채점 사이트용',
        homeworkTabAssignTitle: '이번주 — 숙제 배정 사이트용',
        homeworkTabGradingHint: '이 블록을 복사한 뒤, 다른 탭에서 Simson 채점 웹페이지를 열고 붙여넣으세요. 이번 수업에 제출할 숙제입니다(해당 회차의 페이지/세부).',
        homeworkTabAssignHint: '이 블록을 복사한 뒤, 다른 탭에서 숙제 배정 웹페이지를 열고 붙여넣으세요. 다음 대면 수업일까지 (휴일·수업 없는 날 제외).',
        homeworkTabCopy: '복사',
        homeworkTabCopyBoth: '두 블록 모두 복사',
        homeworkTabSyllabiRefreshed: '캘린더에서 강의 계획표를 업데이트했습니다.',
        homeworkTabCopied: '클립보드에 복사했습니다.',
        homeworkTabCopyFailed: '복사할 수 없습니다. 텍스트를 선택해 직접 복사하세요.',
        homeworkTabNoLessons: '강의 계획표에 예정된 수업이 없습니다. 수업 편집기에서 캘린더에서 새로고침을 누르세요.',
        homeworkTabNoHomeworkText: '수업은 있지만 페이지/세부 내용이 비어 있습니다. 강의 계획표에 숙제를 추가하거나 붙여넣기 가져오기를 사용하세요.',
        homeworkTabNoAssignText: '이번주 강의 계획표에 숙제 텍스트가 없습니다.',
        homeworkTabNoGradingText: '지난주 숙제가 없습니다 (학기 첫 수업).',
        homeworkTabNoDueDate: '학기 종료 전 다음 수업일을 찾을 수 없습니다. 수업 요일과 종료일을 확인하세요.',
        homeworkTabTargetLesson: '{date} 수업에 배정 · {n}회차: {title}',
        homeworkTabGradingFrom: '{n}회차 숙제 채점 ({date}): {title}',
        homeworkTabModuleMissing: '숙제 탭 모듈을 불러오지 못했습니다. Ctrl+F5로 새로고침하세요.',
        homeworkTabDueLabel: '마감',
        homeworkTabSessionLabel: '회차',
        homeworkTabEditableHint: '아래 텍스트를 수정하면 강의 계획표(페이지/세부)에 저장됩니다. 복사 시 수업 이름과 회차 헤더가 추가됩니다.',
        homeworkTabSavesTo: '강의 계획표에 저장: {n}회차 · {title}',
        homeworkTabSaved: '강의 계획표에 숙제를 저장했습니다.',
        homeworkTabNoSyllabusRow: '연결된 강의 계획표 행이 없습니다. 먼저 캘린더에서 강의 계획표를 새로고침하세요.',
        homeworkTabSkippedHeading: '마감 전에 건너뛴 정규 수업일:',
        homeworkTabSkipHoliday: '{date} — {name} (수업 없음)',
        homeworkTabSkipHolidayNoName: '{date} — 공휴일 (수업 없음)',
        workspaceTitle: '커리큘럼 작업 공간',
        workspaceBackCalendar: '← 캘린더로',
        workspaceTabHomework: '숙제 복사',
        workspaceTabBooks: '교재 편집',
        workspaceOpen: '확장 작업 공간 열기',
        workspaceOpenBooks: '작업 공간에서 열기',
        workspaceHomeworkFlowHint:
            '텍스트는 강의 계획표 Pages / detail에서 오며, 이는 교재에서 옵니다. 교재 편집 → 강의 계획표 새로고침 → 여기서 복사하세요.',
        workspaceBooksIntro:
            '교재별 공유 페이지 블록을 편집합니다. 저장 후 Homework copy 탭에서 강의 계획표를 새로고침하세요.',
        workspaceBooksPick: '편집할 교재를 선택하세요.',
        workspaceSourceBook: '원본 교재:',
        workspaceEditBook: '교재 편집 →',
        workspaceBooksFeedHint:
            '여기의 Pages / detail은 캘린더에서 새로고침할 때 강의 계획표에 반영됩니다. 숙제 복사는 강의 계획표 행을 사용합니다.',
        workspaceBooksSavedRefresh:
            '교재가 저장되었습니다. Homework copy 탭에서 강의 계획표 새로고침을 실행하세요.',
        workspaceRemoteNewer: '다른 곳에서 캘린더가 업데이트되었습니다.',
        workspaceReload: '다시 불러오기',
        
        // Holiday Modal
        addHolidayTitle: '휴일 추가',
        editHoliday: '휴일 편집',
        holidayName: '휴일/이벤트 이름',
        holidayNamePlaceholder: '예: 추석',
        dateRange: '기간 (여러 날)',
        date: '날짜',
        bgColor: '배경색',
        textColor: '글자색',
        appliesTo: '적용 대상',
        allClasses: '모든 수업',
        byGrade: '학년별:',
        byClassName: '수업별:',
        bySection: '심슨 레벨별:',
        allElementaryLabel: '전체 초등 (초1–초6)',
        allMiddleSchoolLabel: '전체 중등 (중1–중3)',
        sectionsLabel: '레벨',
        bySchoolBand: '학교급 (빠른 선택):',
        holidayFilterRequired: '모든 수업을 켜거나, 반·학교급·학년·수업 중 하나 이상 선택하세요.',
        eventApplicabilityFilterBtn: '적용 대상 선택…',
        eventApplicabilityFilterTitle: '일정 적용 대상',
        eventApplicabilityFilterStatus: '{total}개 중 {selected}개 필터 선택됨',
        eventApplicabilityFilterBtnActive: '적용 대상 ({selected}/{total})',
        eventApplicabilitySectionSchoolBand: '학교급 (빠른 선택)',
        eventApplicabilitySectionLevel: '심슨 레벨별',
        eventApplicabilityNoOptions: '수업이 없습니다. 수업 탭에서 수업을 추가하세요.',
        eventApplicabilitySummaryEmpty: '선택된 필터가 없습니다. 필터를 열어 하나 이상 선택하세요.',
        saveHoliday: '휴일 저장',
        
        // Popup
        level: '반:',
        lesson: '수업:',
        
        // Print Modal
        printOptions: '인쇄 옵션',
        printCalendar: '캘린더 인쇄',
        printSummaryPage: '요약 페이지 인쇄',
        includeClassList: '수업 목록 포함',
        includeLessonSchedule: '수업 일정 포함',
        includeCompressionNotes: '압축 노트 포함',
        
        // Print Summary
        termSummary: '학기 요약',
        classes: '수업',
        holidays: '휴일',
        lessonSchedule: '수업 일정',
        compressionNotes: '압축 노트',
        day: '요일',
        mergedGroupsLabel: '합친 수업: {groups}',
        scheduledGroupsLabel: '수업 그룹 {scheduled}/{total}개 일정',
        compressionNoteAutoSuffix: '(가능한 날짜 {available}개)',
        compressionNoteCustomSuffix: '(사용자 지정 일정)',
        
        // Term seasons (from class/calendar start month)
        termSeasonSpring: '봄',
        termSeasonSummer: '여름',
        termSeasonFall: '가을',
        termSeasonWinter: '겨울',

        // Calendar
        monthNames: ['1월', '2월', '3월', '4월', '5월', '6월',
                     '7월', '8월', '9월', '10월', '11월', '12월'],
        dayNamesShort: ['일', '월', '화', '수', '목', '금', '토'],
        dayNamesFull: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'],
        
        // Autocomplete
        selectToAutofill: '선택하여 자동 입력:',
        
        // Messages
        allClassesLabel: '모든 수업',
        gradesLabel: '학년',
        classesLabel: '수업',
        noClassesYet: '아직 수업이 없습니다',
        noCompressedDays: '압축된 수업이 없습니다.',
        confirmDeleteClass: '이 수업을 삭제하시겠습니까?',
        confirmDeleteHoliday: '이 휴일을 삭제하시겠습니까?',
        confirmClearAllData: '모든 데이터를 지우시겠습니까? 모든 수업, 휴일 및 캘린더 설정이 삭제됩니다. 이 작업은 취소할 수 없습니다.',
        clearDataSuccess: '모든 데이터가 지워졌습니다.',
        importSuccess: '데이터를 성공적으로 가져왔습니다!',
        importDestinationTitle: '캘린더 데이터 가져오기',
        importToCurrent: '현재 캘린더에 가져오기',
        importToNew: '파일로 새 팀 캘린더 만들기',
        importOverwriteWarning: '이 캘린더의 모든 데이터를 대체합니다. 확실하지 않으면 먼저보내기로 백업하세요.',
        importOverwriteConfirm: '"{name}"의 모든 데이터를 가져온 파일로 바꿀까요? 되돌릴 수 없습니다.',
        importReadOnlyHint: '다른 선생님이 이 캘린더를 편집 중입니다. 먼저 편집 요청을 하거나 “파일에서 새 팀 캘린더 만들기”를 선택하세요.',
        importConfirm: '가져오기',
        importImporting: '가져오는 중…',
        importNoActiveCalendar: '선택된 팀 캘린더가 없습니다. 파일로 새 캘린더를 만드세요.',
        importNewCreated: '새 캘린더 "{name}"에 가져옴.',
        importToCurrentDone: '"{name}"에 가져옴.',
        invalidFile: '잘못된 파일 형식입니다. 유효한 캘린더 내보내기 파일을 선택하세요.',
        errorReadingFile: '파일을 읽는 중 오류가 발생했습니다. 유효한 JSON 파일을 선택하세요.',
        migrationNotice: '데이터가 새 형식으로 마이그레이션되었습니다:\n- {classes}개의 수업 업데이트\n- {holidays}개의 휴일 업데이트\n\n마이그레이션된 수업의 반(A/B/C)을 확인하고 업데이트하세요.'
    }
};

function t(key) {
    return translations[currentLanguage][key] || translations['en'][key] || key;
}

function applyLanguage() {
    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLanguage][key]) {
            el.textContent = translations[currentLanguage][key];
        }
    });
    
    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[currentLanguage][key]) {
            el.placeholder = translations[currentLanguage][key];
        }
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria-label');
        if (translations[currentLanguage][key]) {
            el.setAttribute('aria-label', translations[currentLanguage][key]);
        }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (translations[currentLanguage][key]) {
            el.setAttribute('title', translations[currentLanguage][key]);
        }
    });
    
    // Update language toggle button text
    const langBtn = document.getElementById('langToggleBtn');
    if (langBtn) {
        langBtn.textContent = t('langToggle');
    }

    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        themeBtn.textContent = t(isDark ? 'themeLight' : 'themeDark');
        themeBtn.setAttribute('title', t('themeToggleTitle'));
    }
    
    document.documentElement.lang = currentLanguage === 'ko' ? 'ko' : 'en';
    const titleBase = (appData.calendarName && appData.calendarName.trim())
        ? appData.calendarName.trim()
        : t('appTitle');
    document.title = titleBase;

    // Update calendar title with name
    updateCalendarTitle();
    
    // Refresh dynamic lesson labels
    const totalLessons = getTotalLessonsValue();
    const currentDates = getCustomLessonDatesFromInputs();
    const currentMerges = getSelectedCompressionMerges();
    renderCustomLessonDates(totalLessons, currentDates);
    renderCompressionOptions(totalLessons, currentMerges);
    updateMeetingDayChipLabels();
    refreshMeetingDayPresetLabels();
    updateLessonFilterButtonLabel();
    updatePrintLessonFilterHint();
    if (isLessonFilterPopoverOpen()) {
        renderLessonFilterPopoverBody();
        updateLessonFilterStatusText();
    }
    const searchEl = document.getElementById('lessonFilterSearch');
    if (searchEl && translations[currentLanguage].lessonFilterSearchPlaceholder) {
        searchEl.placeholder = translations[currentLanguage].lessonFilterSearchPlaceholder;
    }
    setupSimsonLevelPresetSelect();
    if (isEventApplicabilityPopoverOpen()) {
        renderEventApplicabilityPopoverBody();
        updateEventApplicabilityStatusText();
    }
    updateEventApplicabilityButtonLabel();
    updateEventApplicabilitySummaryText();
    syncClassOpenEditorButton();
    syncEventOpenEditorButton();
    if (getActiveTab() === 'homework') {
        renderHomeworkReferenceMiniCalendar();
    }
    const eventAppSearchEl = document.getElementById('eventApplicabilitySearch');
    if (eventAppSearchEl && translations[currentLanguage].lessonFilterSearchPlaceholder) {
        eventAppSearchEl.placeholder = translations[currentLanguage].lessonFilterSearchPlaceholder;
    }
    if (elements.classTypeSelect && (isClassPopoutOpen() || (getActiveTab() === 'classes' && classEditorMount === 'tab'))) {
        const v = elements.classTypeSelect.value;
        populateClassTypeSelect();
        if (v && [...elements.classTypeSelect.options].some(o => o.value === v)) {
            elements.classTypeSelect.value = v;
        }
    }

    refreshLocalizedEventDisplayNames();

    // Re-render calendar to update month/day names and localized event labels
    if (appData.termStart) {
        renderCalendar();
    } else {
        updatePrintSummary();
    }
    applyTopBarCollapsedState();
    refreshCalendarNameLabel();
    document.dispatchEvent(new CustomEvent('calendarLanguageChanged', { detail: { lang: currentLanguage } }));
}

function refreshCalendarNameLabel() {
    const nameLabel = document.getElementById('calendarNameLabel');
    if (!nameLabel) {
        return;
    }
    nameLabel.textContent = teamSyncEnabled ? t('teamCalendarNameLabel') : t('calendarName');
}

function updateCalendarTitle() {
    const titleEl = document.querySelector('.app-top-bar-title-block h1');
    if (titleEl) {
        if (appData.calendarName && appData.calendarName.trim()) {
            titleEl.textContent = appData.calendarName;
        } else {
            titleEl.textContent = t('appTitle');
        }
    }
    requestAnimationFrame(syncAppChromeStickyTop);
}

function toggleLanguage() {
    currentLanguage = currentLanguage === 'en' ? 'ko' : 'en';
    localStorage.setItem('calendarLanguage', currentLanguage);
    applyLanguage();
}

function loadLanguage() {
    const saved = localStorage.getItem('calendarLanguage');
    if (saved && (saved === 'en' || saved === 'ko')) {
        currentLanguage = saved;
    }
}

function getStoredTheme() {
    const saved = localStorage.getItem('calendarTheme');
    if (saved === 'light' || saved === 'dark') {
        return saved;
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

function applyTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.classList.remove('print-color-mode-light');
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    localStorage.setItem('calendarTheme', next);
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        const labelKey = next === 'dark' ? 'themeLight' : 'themeDark';
        themeBtn.textContent = t(labelKey);
        themeBtn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
        themeBtn.setAttribute('title', t('themeToggleTitle'));
    }
}

function loadTheme() {
    applyTheme(getStoredTheme());
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ============================================
// Data Storage
// ============================================
const SCHEMA_VERSION = 2;

const EVENT_TYPES = {
    HOLIDAY: 'holiday',
    EVALUATION_DEADLINE: 'evaluation_deadline',
    HOMEWORK_DEADLINE: 'homework_deadline',
    EVALUATION_PERIOD: 'evaluation_period',
    OTHER: 'other'
};

const DEFAULT_VISIBILITY_FILTERS = {
    lessons: true,
    holidays: true,
    evaluation_deadline: true,
    homework_deadline: true,
    evaluation_period: true,
    other: true
};

/** Sentinel values for empty optional class fields in lesson filters. */
const LESSON_FILTER_NO_GRADE = '__no_grade__';
const LESSON_FILTER_NO_LEVEL = '__no_level__';
const LESSON_FILTER_NO_TYPE = '__no_type__';
const LESSON_FILTER_NO_BOOK = '__no_book__';

const LESSON_FILTER_DIMENSIONS = [
    'classIds',
    'grades',
    'levelPresets',
    'classTypeIds',
    'periods',
    'books'
];

const DEFAULT_LESSON_FILTERS = {
    classIds: null,
    grades: null,
    levelPresets: null,
    classTypeIds: null,
    periods: null,
    books: null,
    hideAllLessons: false
};

/** Maps stored filter keys to toolbar + print-option checkbox ids. */
const VISIBILITY_FILTER_FIELDS = [
    { key: 'lessons', uiId: 'visLessons', printId: 'printCalLessons' },
    { key: 'holidays', uiId: 'visHolidays', printId: 'printCalHolidays' },
    { key: 'evaluation_deadline', uiId: 'visEvalDeadline', printId: 'printCalEvalDeadline' },
    { key: 'homework_deadline', uiId: 'visHomeworkDeadline', printId: 'printCalHomeworkDeadline' },
    { key: 'evaluation_period', uiId: 'visEvalPeriod', printId: 'printCalEvalPeriod' },
    { key: 'other', uiId: 'visOther', printId: 'printCalOther' }
];

const PRINT_SUMMARY_OPTION_IDS = [
    'printClassList',
    'printLessonSchedule',
    'printCompressionNotes',
    'printSyllabusTables',
    'printEventsList'
];

const EVENT_TYPE_DEFAULT_COLORS = {
    holiday: { bg: '#fef3c7', text: '#b45309' },
    evaluation_deadline: { bg: '#fecaca', text: '#991b1b' },
    homework_deadline: { bg: '#dbeafe', text: '#1e40af' },
    evaluation_period: { bg: '#e9d5ff', text: '#6b21a1' },
    other: { bg: '#e5e7eb', text: '#374151' }
};

function getDefaultAppData() {
    return {
        schemaVersion: SCHEMA_VERSION,
        classes: [],
        events: [],
        holidays: [],
        customClassTypes: [],
        customSyllabusTemplates: [],
        defaultClassTypeOverrides: {},
        bookOverrides: {},
        curriculumOverrides: {},
        termStart: null,
        termMonthCount: 3,
        calendarName: '',
        ui: {
            visibilityFilters: { ...DEFAULT_VISIBILITY_FILTERS },
            printVisibility: { ...DEFAULT_VISIBILITY_FILTERS },
            topBarCollapsed: false
        }
    };
}

let appData = getDefaultAppData();

// Color palette for auto-assigning
const colorPalette = [
    '#e67e22', // Orange
    '#27ae60', // Green
    '#3498db', // Blue
    '#9b59b6', // Purple
    '#e74c3c', // Red
    '#1abc9c', // Teal
    '#f39c12', // Yellow
    '#34495e', // Dark Blue
    '#e91e63', // Pink
    '#00bcd4', // Cyan
    '#8bc34a', // Light Green
    '#ff5722'  // Deep Orange
];

let colorIndex = 0;

const DEFAULT_CLASS_TEXT_COLOR = '#ffffff';

const SCHEDULE_CONFIG = {
    maxMergeIterations: 48,
    defaultTermCalendarMonths: 3,
    minTermMonthCount: 3,
    maxTermMonthCount: 6,
    /** Prefer merging this lesson day with the next first (e.g. 2 = combine Day 2+3). */
    autoMergePreferredPairStart: 2
};

/** School day periods (1 = first period … 7 = seventh). */
const CLASS_PERIOD_MIN = 1;
const CLASS_PERIOD_MAX = 7;

function parseClassPeriodValue(raw) {
    if (raw === undefined || raw === null || raw === '') {
        return null;
    }
    const n = parseInt(String(raw).trim(), 10);
    if (Number.isNaN(n) || n < CLASS_PERIOD_MIN || n > CLASS_PERIOD_MAX) {
        return null;
    }
    return n;
}

function normalizePeriodByWeekday(map) {
    if (!map || typeof map !== 'object') {
        return null;
    }
    const out = {};
    Object.keys(map).forEach(key => {
        const dow = parseInt(key, 10);
        if (Number.isNaN(dow) || dow < 0 || dow > 6) {
            return;
        }
        const p = parseClassPeriodValue(map[key]);
        if (p !== null) {
            out[String(dow)] = p;
        }
    });
    return Object.keys(out).length ? out : null;
}

/** Period for one class; optional weekday (0=Sun … 6=Sat) uses periodByWeekday when set. */
function getClassPeriodNumber(classData, weekday) {
    if (!classData) {
        return null;
    }
    if (weekday !== undefined && weekday !== null) {
        const byWd = normalizePeriodByWeekday(classData.periodByWeekday);
        if (byWd && byWd[String(weekday)] !== undefined) {
            return byWd[String(weekday)];
        }
    }
    return parseClassPeriodValue(classData.period);
}

function getEffectiveClassPeriodValues(classData) {
    if (!classData) {
        return [];
    }
    const byWd = normalizePeriodByWeekday(classData.periodByWeekday);
    const meetingDays = getMeetingDaysFromClass(classData);
    if (byWd && meetingDays.length) {
        const vals = meetingDays
            .map(d => byWd[String(d)] ?? getClassPeriodNumber(classData))
            .filter(p => p !== null);
        if (vals.length) {
            return vals;
        }
    }
    const p = getClassPeriodNumber(classData);
    return p !== null ? [p] : [];
}

function classPeriodVariesByDay(classData) {
    const vals = getEffectiveClassPeriodValues(classData);
    return new Set(vals).size > 1;
}

function getClassPeriodForSort(classData, weekday) {
    if (weekday !== undefined && weekday !== null) {
        const p = getClassPeriodNumber(classData, weekday);
        if (p !== null) {
            return p;
        }
    }
    const vals = getEffectiveClassPeriodValues(classData);
    if (vals.length) {
        return Math.min(...vals);
    }
    return null;
}

function formatClassPeriodSummary(classData) {
    const vals = [...new Set(getEffectiveClassPeriodValues(classData))].sort((a, b) => a - b);
    if (!vals.length) {
        return '';
    }
    if (vals.length === 1) {
        return String(vals[0]);
    }
    return vals.join(', ');
}

function parseClassPeriodFromInput(elOrValue) {
    let raw;
    if (elOrValue && typeof elOrValue === 'object' && 'value' in elOrValue) {
        raw = elOrValue.value;
    } else {
        raw = elOrValue;
    }
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return null;
    }
    const n = parseInt(String(raw).trim(), 10);
    if (Number.isNaN(n) || n < CLASS_PERIOD_MIN || n > CLASS_PERIOD_MAX) {
        return null;
    }
    return n;
}

function compareClassesForDisplayOrder(a, b, weekday) {
    const pa = getClassPeriodForSort(a, weekday);
    const pb = getClassPeriodForSort(b, weekday);
    if (pa !== null && pb !== null && pa !== pb) {
        return pa - pb;
    }
    if (pa !== null && pb === null) {
        return -1;
    }
    if (pa === null && pb !== null) {
        return 1;
    }
    const na = (a && a.name) ? String(a.name) : '';
    const nb = (b && b.name) ? String(b.name) : '';
    return na.localeCompare(nb, undefined, { sensitivity: 'base' });
}

function getClassesInDisplayOrder() {
    return [...appData.classes].sort(compareClassesForDisplayOrder);
}

function normalizeLessonFilters(raw) {
    const out = { ...DEFAULT_LESSON_FILTERS };
    if (!raw || typeof raw !== 'object') {
        return out;
    }
    out.hideAllLessons = raw.hideAllLessons === true;
    LESSON_FILTER_DIMENSIONS.forEach(key => {
        if (raw[key] === undefined || raw[key] === null) {
            return;
        }
        if (!Array.isArray(raw[key])) {
            return;
        }
        if (raw[key].length === 0) {
            out[key] = [];
            return;
        }
        out[key] = raw[key].map(v => String(v));
    });
    return out;
}

function isLessonFilterActive() {
    ensureUiState();
    const f = appData.ui.lessonFilters;
    if (!f) {
        return false;
    }
    if (f.hideAllLessons) {
        return true;
    }
    return hasRestrictiveLessonFilter(f);
}

function hasRestrictiveLessonFilter(f) {
    if (!f) {
        return false;
    }
    return LESSON_FILTER_DIMENSIONS.some(key => Array.isArray(f[key]) && f[key].length > 0);
}

function classPassesLessonFilters(classData) {
    if (!classData) {
        return false;
    }
    if (!isLessonFilterActive()) {
        return true;
    }
    const f = appData.ui.lessonFilters;
    if (f.hideAllLessons) {
        return false;
    }
    if (!hasRestrictiveLessonFilter(f)) {
        return true;
    }
    if (Array.isArray(f.classIds) && f.classIds.length > 0) {
        if (!f.classIds.includes(classData.id)) {
            return false;
        }
    }
    if (Array.isArray(f.grades) && f.grades.length > 0) {
        const gradeToken = (classData.grade || '').trim() || LESSON_FILTER_NO_GRADE;
        if (!f.grades.includes(gradeToken)) {
            return false;
        }
    }
    if (Array.isArray(f.levelPresets) && f.levelPresets.length > 0) {
        const levelToken = (classData.levelPreset || '').trim() || LESSON_FILTER_NO_LEVEL;
        if (!f.levelPresets.includes(levelToken)) {
            return false;
        }
    }
    if (Array.isArray(f.classTypeIds) && f.classTypeIds.length > 0) {
        const typeToken = (classData.classTypeId || '').trim() || LESSON_FILTER_NO_TYPE;
        if (!f.classTypeIds.includes(typeToken)) {
            return false;
        }
    }
    if (Array.isArray(f.periods) && f.periods.length > 0) {
        const periodVals = getEffectiveClassPeriodValues(classData).map(p => String(p));
        if (!periodVals.some(p => f.periods.includes(p))) {
            return false;
        }
    }
    if (Array.isArray(f.books) && f.books.length > 0) {
        const bookToken = (classData.book || '').trim() || LESSON_FILTER_NO_BOOK;
        if (!f.books.includes(bookToken)) {
            return false;
        }
    }
    return true;
}

function getVisibleClassesInDisplayOrder() {
    return getClassesInDisplayOrder().filter(classPassesLessonFilters);
}

/** Visible classes that also have lessons in the displayed term (what the calendar can show). */
function getVisibleScheduledClassesInDisplayOrder() {
    return getClassesScheduledOnCalendar().filter(classPassesLessonFilters);
}

/** Classes used for calendar lesson bars and class-related print summary when no lesson filter is on. */
function getClassesForCalendarAndPrintSummary() {
    if (isLessonFilterActive()) {
        return getVisibleScheduledClassesInDisplayOrder();
    }
    return getClassesScheduledOnCalendar();
}

/** True if this class has at least one lesson on a day inside the displayed term months. */
function classHasLessonsInDisplayedTerm(classData) {
    const { start, end } = getTermDateRangeISO();
    if (!classData || !start || !end) {
        return false;
    }
    const rangeStart = parseISODateLocal(start);
    const rangeEnd = parseISODateLocal(end);
    if (!rangeStart || !rangeEnd) {
        return false;
    }
    const { lessons } = calculateLessonDates(classData);
    return lessons.some(lesson => {
        const d = lesson && lesson.date;
        if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) {
            return false;
        }
        const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return day >= rangeStart && day <= rangeEnd;
    });
}

/** Classes that actually have lesson bars in the current term calendar view. */
function getClassesScheduledOnCalendar() {
    return getClassesInDisplayOrder().filter(classHasLessonsInDisplayedTerm);
}

function countScheduledClassesOnCalendar() {
    return getClassesScheduledOnCalendar().length;
}

function countVisibleClassesForLessonFilter() {
    return getClassesScheduledOnCalendar().filter(classPassesLessonFilters).length;
}

function getVisibleClassIdsForLessonFilter() {
    if (!isLessonFilterActive()) {
        return null;
    }
    return getVisibleScheduledClassesInDisplayOrder().map(c => c.id);
}

function getNextSuggestedClassPeriod() {
    const periods = appData.classes.map(getClassPeriodNumber).filter(n => n !== null);
    if (periods.length === 0) {
        return CLASS_PERIOD_MIN;
    }
    return Math.min(Math.max(...periods) + 1, CLASS_PERIOD_MAX);
}

function formatClassLabelWithPeriod(classData) {
    const name = classData && classData.name ? classData.name : '';
    const summary = formatClassPeriodSummary(classData);
    if (!summary) {
        return name;
    }
    return `P${summary} · ${name}`;
}

function buildClassPeriodSelectInnerHtml(selectedValue) {
    const sel = selectedValue != null && selectedValue !== '' ? String(selectedValue) : '';
    let html = '<option value="">—</option>';
    for (let p = CLASS_PERIOD_MIN; p <= CLASS_PERIOD_MAX; p += 1) {
        const chosen = sel === String(p) ? ' selected' : '';
        html += `<option value="${p}"${chosen}>${p}</option>`;
    }
    return html;
}

function upgradeClassPeriodFieldToSelect(fieldEl) {
    if (!fieldEl) {
        return null;
    }
    if (fieldEl.tagName === 'SELECT') {
        fieldEl.innerHTML = buildClassPeriodSelectInnerHtml(fieldEl.value);
        return fieldEl;
    }
    const select = document.createElement('select');
    select.id = fieldEl.id || 'classPeriod';
    if (fieldEl.className) {
        select.className = fieldEl.className;
    }
    select.innerHTML = buildClassPeriodSelectInnerHtml(fieldEl.value);
    fieldEl.replaceWith(select);
    return select;
}

function ensureClassPeriodMarkup() {
    const form = document.getElementById('classForm');
    if (!form) {
        return;
    }

    let periodField = document.getElementById('classPeriod');
    if (!periodField) {
        const levelRow = form.querySelector('#classLevel')?.closest('.form-row');
        if (!levelRow) {
            return;
        }
        const group = document.createElement('d' + 'iv');
        group.className = 'form-group form-group-class-period';
        group.innerHTML = `
            <label for="classPeriod" data-i18n="classPeriod">Period</label>
            <select id="classPeriod"></select>
            <p class="section-hint" data-i18n="classPeriodHint"></p>`;
        levelRow.insertBefore(group, levelRow.firstChild);
        periodField = group.querySelector('#classPeriod');
    }

    elements.classPeriod = upgradeClassPeriodFieldToSelect(periodField);
    ensurePeriodByDayMarkup();
}

function periodVariesFromMap(periodByWeekday, meetingDays) {
    const map = normalizePeriodByWeekday(periodByWeekday);
    if (!map || !meetingDays || meetingDays.length < 2) {
        return false;
    }
    const vals = meetingDays.map(d => map[String(d)]).filter(p => p !== null && p !== undefined);
    return new Set(vals).size > 1;
}

function ensurePeriodByDayMarkup() {
    const form = document.getElementById('classForm');
    const periodGroup = form && form.querySelector('.form-group-class-period');
    if (!periodGroup || document.getElementById('classPeriodByDayWrap')) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.id = 'classPeriodByDayWrap';
    wrap.className = 'form-group class-period-by-day-wrap';
    wrap.hidden = true;
    wrap.innerHTML = `
        <label class="checkbox-label class-period-varies-label">
            <input type="checkbox" id="classPeriodVariesByDay">
            <span data-i18n="classPeriodVariesByDay">Different period on some meeting days</span>
        </label>
        <p class="section-hint" data-i18n="classPeriodVariesByDayHint"></p>
        <div id="classPeriodByDayRow" class="period-by-day-row" role="group" aria-label="Period by day"></div>`;
    periodGroup.insertAdjacentElement('afterend', wrap);

    const variesCb = document.getElementById('classPeriodVariesByDay');
    if (variesCb && !variesCb.dataset.bound) {
        variesCb.dataset.bound = '1';
        variesCb.addEventListener('change', () => syncPeriodByDayUi());
    }
    if (elements.classPeriod && !elements.classPeriod.dataset.periodByDayBound) {
        elements.classPeriod.dataset.periodByDayBound = '1';
        elements.classPeriod.addEventListener('change', () => {
            if (!document.getElementById('classPeriodVariesByDay')?.checked) {
                return;
            }
            const meetingDays = readMeetingDaysFromFormScope('#classForm', MEETING_DAY_INPUT_CLASS);
            renderPeriodByDayRow(document.getElementById('classPeriodByDayRow'), meetingDays);
        });
    }
}

function readPeriodByWeekdayFromForm() {
    const out = {};
    document.querySelectorAll('#classPeriodByDayRow select.class-period-by-day').forEach(sel => {
        const d = parseInt(sel.dataset.weekday, 10);
        const p = parseClassPeriodFromInput(sel);
        if (!Number.isNaN(d) && p !== null) {
            out[d] = p;
        }
    });
    return out;
}

function renderPeriodByDayRow(container, meetingDays) {
    if (!container) {
        return;
    }
    const short = t('dayNamesShort');
    const existing = readPeriodByWeekdayFromForm();
    const defaultP = elements.classPeriod
        ? (parseClassPeriodFromInput(elements.classPeriod) ?? CLASS_PERIOD_MIN)
        : CLASS_PERIOD_MIN;
    container.innerHTML = '';
    meetingDays.forEach(d => {
        const chip = document.createElement('div');
        chip.className = 'period-by-day-chip';
        const label = document.createElement('label');
        label.className = 'period-by-day-chip-label';
        const daySpan = document.createElement('span');
        daySpan.className = 'period-by-day-day';
        daySpan.textContent = short[d] != null ? short[d] : String(d);
        const sel = document.createElement('select');
        sel.dataset.weekday = String(d);
        sel.className = 'class-period-by-day';
        sel.innerHTML = buildClassPeriodSelectInnerHtml(existing[d] ?? defaultP);
        label.appendChild(daySpan);
        label.appendChild(sel);
        chip.appendChild(label);
        container.appendChild(chip);
    });
}

function syncPeriodByDayUi() {
    const wrap = document.getElementById('classPeriodByDayWrap');
    const variesCb = document.getElementById('classPeriodVariesByDay');
    const row = document.getElementById('classPeriodByDayRow');
    const periodGroup = document.querySelector('#classForm .form-group-class-period');
    if (!wrap || !variesCb || !row) {
        return;
    }
    const custom = elements.customScheduleEnabled && elements.customScheduleEnabled.checked;
    const meetingDays = readMeetingDaysFromFormScope('#classForm', MEETING_DAY_INPUT_CLASS);
    const showWrap = !custom && meetingDays.length >= 2;
    wrap.hidden = !showWrap;
    if (!showWrap) {
        variesCb.checked = false;
        row.innerHTML = '';
        if (periodGroup) {
            periodGroup.style.display = '';
        }
        return;
    }
    if (periodGroup) {
        periodGroup.style.display = variesCb.checked ? 'none' : '';
    }
    if (variesCb.checked) {
        renderPeriodByDayRow(row, meetingDays);
    } else {
        row.innerHTML = '';
    }
}

function writePeriodByWeekdayToForm(periodByWeekday, meetingDays) {
    const variesCb = document.getElementById('classPeriodVariesByDay');
    if (!variesCb) {
        return;
    }
    variesCb.checked = periodVariesFromMap(periodByWeekday, meetingDays);
    syncPeriodByDayUi();
    if (!variesCb.checked) {
        return;
    }
    const map = normalizePeriodByWeekday(periodByWeekday) || {};
    document.querySelectorAll('#classPeriodByDayRow select.class-period-by-day').forEach(sel => {
        const d = sel.dataset.weekday;
        if (map[d] !== undefined) {
            sel.value = String(map[d]);
        }
    });
}

function collectPeriodFieldsForSave() {
    const variesCb = document.getElementById('classPeriodVariesByDay');
    const meetingDays = readMeetingDaysFromFormScope('#classForm', MEETING_DAY_INPUT_CLASS);
    let period = elements.classPeriod ? parseClassPeriodFromInput(elements.classPeriod) : null;
    let periodByWeekday = null;
    if (variesCb && variesCb.checked && meetingDays.length >= 2) {
        const map = {};
        meetingDays.forEach(d => {
            const sel = document.querySelector(
                `#classPeriodByDayRow select.class-period-by-day[data-weekday="${d}"]`
            );
            const p = sel ? parseClassPeriodFromInput(sel) : period;
            if (p !== null) {
                map[String(d)] = p;
            }
        });
        const vals = Object.values(map);
        if (vals.length) {
            periodByWeekday = map;
            period = Math.min(...vals);
        }
    }
    return { period, periodByWeekday };
}

function applyPeriodFieldsToClassForm(classData) {
    if (!classData) {
        return;
    }
    if (elements.classPeriod) {
        const p = getClassPeriodNumber(classData);
        elements.classPeriod.value = p !== null ? String(p) : '';
    }
    const meetingDays = getMeetingDaysFromClass(classData);
    writePeriodByWeekdayToForm(classData.periodByWeekday, meetingDays);
}

/** Built-in class type ids (stable for saves and imports). */
const CLASS_TYPE_DEBATE_ID = 'builtin-debate';
const CLASS_TYPE_KOREAN_MULTI_ID = 'builtin-korean-multiweekly';
/** @deprecated Saved calendars may still reference this id; resolved to WR+SP. */
const CLASS_TYPE_EARLY_WRITER_ID = 'builtin-early-writer-weekly';
const CLASS_TYPE_WR_SP_ID = 'builtin-wr-sp';

/** Default class type when adding a new class. */
const DEFAULT_CLASS_TYPE_ID = CLASS_TYPE_WR_SP_ID;

/** Weekly debate: lesson "days" repeat each month with optional Day 2+3 merges. */
const SCHEDULE_MODEL_DEBATE_MONTHLY = 'debateMonthly';
/** Multi-day / WR+SP: lessons 1…N in order across the full term (no day-pair compression). */
const SCHEDULE_MODEL_SEQUENTIAL_TERM = 'sequentialTerm';

function initDefaultClassEditorModule() {
    if (!window.CCPDefaultClassEditor) {
        return;
    }
    window.CCPDefaultClassEditor.init({
        getAppData: () => appData,
        saveData,
        t,
        getLang: () => currentLanguage,
        sanitizeTotalLessons,
        generateId,
        applyLanguage,
        openModal,
        closeModal,
        onDefaultsSaved: () => {
            populateClassTypeSelect();
            syncClassTypeHint();
            const def = getClassTypeDefinitionById(elements.classTypeSelect?.value);
            if (def && (isClassPopoutOpen() || (getActiveTab() === 'classes' && classEditorMount === 'tab')) && !elements.classId?.value) {
                applyClassTypeDefinitionToForm(def);
            }
            renderPrintSyllabusManager();
        }
    });
    window.CCPDefaultClassEditor.bindEditorUI();
}

function initBooksEditorModule() {
    if (!window.CCPBooksEditor) {
        return;
    }
    window.CCPBooksEditor.init({
        getAppData: () => appData,
        saveData,
        t,
        getLang: () => currentLanguage,
        getSimsonLevelGroups: () => SIMSON_LEVEL_GROUPS.map((g) => ({
            id: g.id,
            label: t(g.labelKey) || g.fallbackLabel,
            levels: g.levels
        })),
        getSchoolGradeOptions: () => SCHOOL_GRADE_OPTIONS.slice(),
        applyLanguage,
        onBooksSaved: () => {
            renderPrintSyllabusManager();
            if (window.CCPDefaultClassEditor) {
                populateClassTypeSelect();
            }
            refreshCurriculumTabList();
            syncClassCurriculumBookSelect();
        },
        navigateToCurriculumTab: (curriculumId) => {
            navigateToTab('curriculum', { curriculumId });
        }
    });
    window.CCPBooksEditor.bindEditorUI();
}

/** Wrong hangul syllable was U+CCA8 (첨); Simson level is 캉첸 U+CCB8. */
const SIMSON_LEVEL_KANGCHEN_WRONG = '\uCE89\uCCA8';
const SIMSON_LEVEL_KANGCHEN_CORRECT = '\uCE89\uCCB8';

function migrateSimsonKangchenLevelSpelling(data) {
    if (!data) {
        return;
    }
    const fixToken = (value) => {
        const v = (value || '').trim();
        return v === SIMSON_LEVEL_KANGCHEN_WRONG ? SIMSON_LEVEL_KANGCHEN_CORRECT : value;
    };
    if (Array.isArray(data.classes)) {
        data.classes.forEach((cls) => {
            if (cls.levelPreset === SIMSON_LEVEL_KANGCHEN_WRONG) {
                cls.levelPreset = SIMSON_LEVEL_KANGCHEN_CORRECT;
            }
            if (cls.level === SIMSON_LEVEL_KANGCHEN_WRONG) {
                cls.level = SIMSON_LEVEL_KANGCHEN_CORRECT;
            }
        });
    }
    if (Array.isArray(data.holidays)) {
        data.holidays.forEach((holiday) => {
            if (!Array.isArray(holiday.sectionLevels)) {
                return;
            }
            holiday.sectionLevels = holiday.sectionLevels.map((lv) => fixToken(lv));
        });
    }
    if (data.curriculumOverrides && typeof data.curriculumOverrides === 'object') {
        const wrongKey = `level:${SIMSON_LEVEL_KANGCHEN_WRONG}`;
        const rightKey = `level:${SIMSON_LEVEL_KANGCHEN_CORRECT}`;
        if (data.curriculumOverrides[wrongKey] && !data.curriculumOverrides[rightKey]) {
            data.curriculumOverrides[rightKey] = data.curriculumOverrides[wrongKey];
        }
        delete data.curriculumOverrides[wrongKey];
    }
}

function migrateCurriculumData(data) {
    migrateSimsonKangchenLevelSpelling(data);
    if (window.CCPBooksEditor && window.CCPBooksEditor.migrateLegacyToCurriculum) {
        window.CCPBooksEditor.migrateLegacyToCurriculum(data || appData);
    }
    if (data && (!data.curriculumOverrides || typeof data.curriculumOverrides !== 'object')) {
        data.curriculumOverrides = {};
    }
}

function setupClassCurriculumLevelSelect() {
    const sel = document.getElementById('classCurriculumLevel');
    if (!sel) {
        return;
    }
    const prev = sel.value;
    sel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.setAttribute('data-i18n', 'selectLevel');
    ph.textContent = t('selectLevel');
    sel.appendChild(ph);
    SIMSON_LEVEL_GROUPS.forEach((group) => {
        const og = document.createElement('optgroup');
        og.label = t(group.labelKey) || group.fallbackLabel;
        group.levels.forEach((level) => {
            const o = document.createElement('option');
            o.value = level.id;
            o.textContent = level.name;
            og.appendChild(o);
        });
        sel.appendChild(og);
    });
    if (prev && Array.from(sel.options).some((o) => o.value === prev)) {
        sel.value = prev;
    }
}

function syncClassCurriculumBookSelect() {
    const levelSel = document.getElementById('classCurriculumLevel');
    const bookSel = document.getElementById('classCurriculumBook');
    const applyBtn = document.getElementById('applyCurriculumToClassBtn');
    const preview = document.getElementById('classCurriculumPreview');
    if (!levelSel || !bookSel) {
        return;
    }
    const level = (levelSel.value || '').trim();
    const prevBook = bookSel.value;
    bookSel.innerHTML = '';
    if (!level) {
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = t('classCurriculumBookPickLevel');
        bookSel.appendChild(ph);
        bookSel.disabled = true;
        if (applyBtn) {
            applyBtn.disabled = true;
        }
        if (preview) {
            preview.hidden = true;
        }
        return;
    }
    bookSel.disabled = false;
    const editor = window.CCPBooksEditor;
    const noBookId = editor ? editor.NO_BOOK_CURRICULUM_ID : '__no_book__';
    const noBookOpt = document.createElement('option');
    noBookOpt.value = noBookId;
    noBookOpt.setAttribute('data-i18n', 'classCurriculumNoBook');
    noBookOpt.textContent = t('classCurriculumNoBook');
    bookSel.appendChild(noBookOpt);
    const list = window.CCPBooksEditor
        ? window.CCPBooksEditor.getCurriculaForLevel(level, appData)
        : [];
    list.forEach((book) => {
        const o = document.createElement('option');
        o.value = book.id;
        o.textContent = book.displayName || book.name;
        bookSel.appendChild(o);
    });
    if (prevBook && [...bookSel.options].some((o) => o.value === prevBook)) {
        bookSel.value = prevBook;
    } else if (!list.length) {
        bookSel.value = noBookId;
    }
    syncClassCurriculumApplyState();
}

function syncClassCurriculumApplyState() {
    const levelSel = document.getElementById('classCurriculumLevel');
    const bookSel = document.getElementById('classCurriculumBook');
    const applyBtn = document.getElementById('applyCurriculumToClassBtn');
    const preview = document.getElementById('classCurriculumPreview');
    if (!levelSel || !bookSel || !applyBtn) {
        return;
    }
    const level = (levelSel.value || '').trim();
    const curriculumId = (bookSel.value || '').trim();
    const editor = window.CCPBooksEditor;
    const noBook = editor && editor.isNoBookCurriculum(curriculumId);
    const isDebate = editor && editor.isDebateCurriculum(curriculumId);
    const presetId = editor
        ? editor.resolvePresetFromLevelAndBook(level, curriculumId, appData)
        : null;
    applyBtn.disabled = !(level && presetId && (noBook || isDebate || curriculumId));
    if (!preview) {
        return;
    }
    if (presetId && level) {
        const def = getClassTypeDefinitionById(presetId);
        const merged = editor.buildMergedClassDefaults(curriculumId, presetId, appData, level);
        const lessons = merged.defaultTotalLessons != null
            ? merged.defaultTotalLessons
            : (def ? def.defaultTotalLessons : '—');
        if (noBook) {
            const sim = getSimsonLevelById(level);
            const levelLabel = sim ? sim.name : level;
            preview.textContent = t('applyCurriculumPreviewNoBook')
                .replace('{level}', levelLabel)
                .replace('{lessons}', String(lessons));
        } else {
            const bookLabel = editor.getCurriculumDisplayName(curriculumId, appData);
            preview.textContent = t('applyCurriculumPreview')
                .replace('{book}', bookLabel)
                .replace('{lessons}', String(lessons));
        }
        preview.hidden = false;
    } else {
        preview.hidden = true;
    }
}

function syncClassCurriculumPickersFromClass(classData) {
    const levelSel = document.getElementById('classCurriculumLevel');
    const bookSel = document.getElementById('classCurriculumBook');
    if (!levelSel || !bookSel) {
        return;
    }
    let curriculumId = classData && classData.curriculumId ? classData.curriculumId : '';
    if (!curriculumId && classData && window.CCPBooksEditor) {
        curriculumId = getBookIdForClass(classData) || '';
    }
    const level = classData ? resolveLevelPresetForForm(classData) : '';
    if (level) {
        levelSel.value = level;
    }
    syncClassCurriculumBookSelect();
    if (curriculumId) {
        bookSel.value = curriculumId;
    } else if (level && window.CCPBooksEditor) {
        const editor = window.CCPBooksEditor;
        const typeId = classData && classData.classTypeId ? classData.classTypeId : '';
        if (typeId === CLASS_TYPE_DEBATE_ID && editor.levelSupportsDebateCurriculum(level)) {
            bookSel.value = editor.DEBATE_CURRICULUM_ID;
        } else {
            bookSel.value = editor.NO_BOOK_CURRICULUM_ID;
        }
    }
    syncClassCurriculumApplyState();
}

function applyCurriculumClassDefaultsToForm(curriculumId, presetId, levelFromPicker) {
    const editor = window.CCPBooksEditor;
    if (!editor || !presetId || !elements.classTotalLessons) {
        return false;
    }
    const levelTrim = (levelFromPicker || '').trim();
    const noBook = editor.isNoBookCurriculum(curriculumId);
    const isDebate = editor.isDebateCurriculum(curriculumId);
    const merged = editor.buildMergedClassDefaults(curriculumId, presetId, appData, levelTrim);
    const def = getClassTypeDefinitionById(presetId);
    if (!def) {
        return false;
    }
    const defForForm = { ...def };
    const isCustom = editor.isCustomCurriculum(curriculumId, appData);
    if (noBook) {
        defForForm.defaultSyllabusRowTemplates = [];
    } else if (isDebate || isCustom) {
        const tpl = editor.getTemplatesForBookId(curriculumId, appData);
        defForForm.defaultSyllabusRowTemplates = tpl.length
            ? JSON.parse(JSON.stringify(tpl))
            : [];
    }
    if (noBook) {
        defForForm.defaultBook = '';
    }
    const displayBook = noBook
        ? ''
        : (merged.defaultBook || editor.getCurriculumDisplayName(curriculumId, appData));
    defForForm.defaultBook = displayBook;
    if (merged.defaultMeetingDays && merged.defaultMeetingDays.length) {
        defForForm.defaultMeetingDays = merged.defaultMeetingDays;
    }
    if (merged.levelPreset) {
        defForForm.level = merged.levelPreset;
    }
    if (merged.defaultCompressionMode) {
        defForForm.defaultCompressionMode = merged.defaultCompressionMode;
    }
    if (merged.scheduleModel) {
        defForForm.scheduleModel = merged.scheduleModel;
    }
    if (merged.lessonLabelMode) {
        defForForm.lessonLabelMode = merged.lessonLabelMode;
    }
    if (merged.homeworkImportMode) {
        defForForm.homeworkImportMode = merged.homeworkImportMode;
    }
    if (merged.usesUnitPairLabels != null) {
        defForForm.usesUnitPairLabels = merged.usesUnitPairLabels;
    }
    if (merged.defaultTotalLessons != null) {
        defForForm.defaultTotalLessons = merged.defaultTotalLessons;
    }

    const hidden = document.getElementById('classTypeIdHidden');
    if (hidden) {
        hidden.value = presetId;
    }
    if (elements.classTypeSelect) {
        elements.classTypeSelect.value = presetId;
    }

    elements.classTotalLessons.value = sanitizeTotalLessons(defForForm.defaultTotalLessons || 4);
    if (elements.classBook) {
        elements.classBook.value = displayBook;
    }
    const levelToSet = levelTrim || defForForm.level;
    if (levelToSet && elements.classLevel && getSimsonLevelById(levelToSet)) {
        elements.classLevel.value = levelToSet;
        handleClassLevelPresetChange();
    }
    if (merged.grade && elements.classGrade) {
        elements.classGrade.value = merged.grade;
    } else if (merged.levelPreset && getSimsonLevelById(merged.levelPreset)) {
        const sim = getSimsonLevelById(merged.levelPreset);
        if (sim && sim.grade && elements.classGrade) {
            elements.classGrade.value = sim.grade;
        }
    }
    const curriculumLevelSel = document.getElementById('classCurriculumLevel');
    if (curriculumLevelSel && levelTrim) {
        curriculumLevelSel.value = levelTrim;
    }
    if (Array.isArray(defForForm.defaultMeetingDays) && defForForm.defaultMeetingDays.length) {
        writeMeetingDaysInFormScope('#classForm', MEETING_DAY_INPUT_CLASS, defForForm.defaultMeetingDays);
        updateMeetingDayChipLabels();
    }
    const isSequential = defForForm.scheduleModel === SCHEDULE_MODEL_SEQUENTIAL_TERM
        || defForForm.defaultCompressionMode === 'sequentialTerm';
    if (!isSequential) {
        const mode = defForForm.defaultCompressionMode === 'manual' ? 'manual' : 'autoWhenNeeded';
        const modeAuto = document.getElementById('compressionModeAuto');
        const modeManual = document.getElementById('compressionModeManual');
        if (mode === 'manual' && modeManual) {
            modeManual.checked = true;
        } else if (modeAuto) {
            modeAuto.checked = true;
        }
    }
    const totalLessons = getTotalLessonsValue();
    renderCustomLessonDates(totalLessons, getCustomLessonDatesFromInputs());
    renderCompressionOptions(totalLessons, isSequential ? [] : getSelectedCompressionMerges());
    updateCompressionUiForScheduleModel();
    syncPeriodByDayUi();
    if (elements.classForm) {
        elements.classForm.dataset.homeworkImportMode = defForForm.homeworkImportMode || '';
        elements.classForm.dataset.lessonLabelMode = defForForm.lessonLabelMode || '';
    }
    syncClassTypeHint();
    tryAutoDistributeSyllabusFromPreset(defForForm);
    return true;
}

function handleApplyCurriculumToClass() {
    const level = (document.getElementById('classCurriculumLevel')?.value || '').trim();
    const curriculumId = (document.getElementById('classCurriculumBook')?.value || '').trim();
    if (!window.CCPBooksEditor) {
        return;
    }
    const presetId = window.CCPBooksEditor.resolvePresetFromLevelAndBook(level, curriculumId, appData);
    if (!presetId) {
        alert(t('applyCurriculumNoMatch'));
        return;
    }
    const isEdit = !!(elements.classId && elements.classId.value);
    if (isEdit && !confirm(t('applyCurriculumConfirm'))) {
        return;
    }
    applyCurriculumClassDefaultsToForm(curriculumId, presetId, level);
    const editor = window.CCPBooksEditor;
    const noBook = editor.isNoBookCurriculum(curriculumId);
    const label = noBook
        ? (getSimsonLevelById(level)?.name || level)
        : editor.getCurriculumDisplayName(curriculumId, appData);
    setAppStatusMessage(t('applyCurriculumToClass') + ': ' + label, false);
}

function refreshCurriculumTabList() {
    const listEl = document.getElementById('curriculumTabList');
    if (!listEl || !window.CCPBooksEditor) {
        return;
    }
    window.CCPBooksEditor.renderCurriculumList(listEl, curriculumTabSelectedId);
}

function handleAddCurriculum() {
    if (!window.CCPBooksEditor || !window.CCPBooksEditor.createCurriculum) {
        return;
    }
    const title = window.prompt(t('curriculumAddPrompt'));
    if (title == null) {
        return;
    }
    const trimmed = title.trim();
    if (!trimmed) {
        alert(t('curriculumAddTitleRequired'));
        return;
    }
    const id = window.CCPBooksEditor.createCurriculum({ bookTitle: trimmed }, appData);
    if (!id) {
        return;
    }
    curriculumTabSelectedId = id;
    initCurriculumTabPanel({ curriculumId: id });
    setAppStatusMessage(t('curriculumAddBtn') + ': ' + trimmed, false);
}

function initCurriculumTabPanel(options = {}) {
    if (options.curriculumId) {
        curriculumTabSelectedId = options.curriculumId;
    }
    refreshCurriculumTabList();
    const mount = document.getElementById('curriculumTabEditorMount');
    if (!mount || !window.CCPBooksEditor) {
        return;
    }
    if (curriculumTabSelectedId) {
        window.CCPBooksEditor.renderCurriculumEditorMount(mount, curriculumTabSelectedId, {
            idPrefix: 'curriculumTab',
            onSaved: (curriculumId) => {
                refreshCurriculumTabList();
                if (!curriculumId) {
                    curriculumTabSelectedId = null;
                    mount.innerHTML = `<p class="module-empty-hint" data-i18n="curriculumTabPick">${escapeHtml(t('curriculumTabPick'))}</p>`;
                }
            }
        });
    } else {
        mount.innerHTML = `<p class="module-empty-hint" data-i18n="curriculumTabPick">${escapeHtml(t('curriculumTabPick'))}</p>`;
    }
}

function setupClassCurriculumControls() {
    setupClassCurriculumLevelSelect();
    const levelSel = document.getElementById('classCurriculumLevel');
    const bookSel = document.getElementById('classCurriculumBook');
    const applyBtn = document.getElementById('applyCurriculumToClassBtn');
    const openCurBtn = document.getElementById('openCurriculumFromClassBtn');
    if (levelSel && levelSel.dataset.bound !== '1') {
        levelSel.dataset.bound = '1';
        levelSel.addEventListener('change', () => {
            syncClassCurriculumBookSelect();
        });
    }
    if (bookSel && bookSel.dataset.bound !== '1') {
        bookSel.dataset.bound = '1';
        bookSel.addEventListener('change', syncClassCurriculumApplyState);
    }
    if (applyBtn && applyBtn.dataset.bound !== '1') {
        applyBtn.dataset.bound = '1';
        applyBtn.addEventListener('click', handleApplyCurriculumToClass);
    }
    if (openCurBtn && openCurBtn.dataset.bound !== '1') {
        openCurBtn.dataset.bound = '1';
        openCurBtn.addEventListener('click', () => {
            const curriculumId = (bookSel && bookSel.value) || curriculumTabSelectedId;
            navigateToTab('curriculum', { curriculumId });
        });
    }
    const tabList = document.getElementById('curriculumTabList');
    if (tabList && tabList.dataset.bound !== '1') {
        tabList.dataset.bound = '1';
        tabList.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-curriculum-id],[data-book-id]');
            if (!btn) {
                return;
            }
            curriculumTabSelectedId = btn.dataset.curriculumId || btn.dataset.bookId;
            initCurriculumTabPanel({ curriculumId: curriculumTabSelectedId });
        });
    }
    const openDataBtn = document.getElementById('openCurriculumTabBtn');
    if (openDataBtn && openDataBtn.dataset.bound !== '1') {
        openDataBtn.dataset.bound = '1';
        openDataBtn.addEventListener('click', () => navigateToTab('curriculum'));
    }
    const addBtn = document.getElementById('curriculumAddBtn');
    if (addBtn && addBtn.dataset.bound !== '1') {
        addBtn.dataset.bound = '1';
        addBtn.addEventListener('click', handleAddCurriculum);
    }
}

function getSyllabusPresetClassTypes() {
    return window.CCPDefaultClassEditor
        ? window.CCPDefaultClassEditor.getPresetTypes(appData)
        : [];
}

function getBuiltinClassTypes() {
    return window.CCPDefaultClassEditor
        ? window.CCPDefaultClassEditor.getBuiltinTypes(appData)
        : [];
}

function resolveClassTypeId(id) {
    return window.CCPDefaultClassEditor
        ? window.CCPDefaultClassEditor.resolveId(id)
        : id;
}

function getCustomClassTypes() {
    return window.CCPDefaultClassEditor
        ? window.CCPDefaultClassEditor.getCustomTypes(appData)
        : (Array.isArray(appData.customClassTypes) ? appData.customClassTypes : []);
}

function getAllClassTypeDefinitions() {
    return window.CCPDefaultClassEditor
        ? window.CCPDefaultClassEditor.getAll(appData)
        : [];
}

function getClassTypeDefinitionById(id) {
    return window.CCPDefaultClassEditor
        ? window.CCPDefaultClassEditor.getById(id, appData)
        : null;
}

function inferScheduleModelFromClassFields(classData) {
    if (!classData) {
        return SCHEDULE_MODEL_SEQUENTIAL_TERM;
    }
    const typeId = classData.classTypeId || '';
    if (typeId === CLASS_TYPE_DEBATE_ID) {
        return SCHEDULE_MODEL_DEBATE_MONTHLY;
    }
    const def = getClassTypeDefinitionById(typeId);
    if (def && def.scheduleModel) {
        return def.scheduleModel;
    }
    const meetingDays = getMeetingDaysFromClass(classData);
    const total = sanitizeTotalLessons(classData.totalLessons || 4);
    if (meetingDays.length <= 1 && total <= 4) {
        return SCHEDULE_MODEL_DEBATE_MONTHLY;
    }
    return SCHEDULE_MODEL_SEQUENTIAL_TERM;
}

function getScheduleModelForClass(classData) {
    if (classData && (classData.scheduleModel === SCHEDULE_MODEL_DEBATE_MONTHLY
        || classData.scheduleModel === SCHEDULE_MODEL_SEQUENTIAL_TERM)) {
        return classData.scheduleModel;
    }
    return inferScheduleModelFromClassFields(classData);
}

function classUsesDebateCompression(classData) {
    return getScheduleModelForClass(classData) === SCHEDULE_MODEL_DEBATE_MONTHLY;
}

function getScheduleModelFromForm() {
    const typeId = elements.classTypeSelect ? (elements.classTypeSelect.value || '') : '';
    const def = getClassTypeDefinitionById(typeId);
    const meetingDays = readMeetingDaysFromFormScope('#classForm', MEETING_DAY_INPUT_CLASS);
    const total = getTotalLessonsValue();
    const draft = {
        classTypeId: typeId,
        meetingDays: meetingDays,
        totalLessons: total
    };
    if (def && def.scheduleModel) {
        return def.scheduleModel;
    }
    return inferScheduleModelFromClassFields(draft);
}

function classUsesDebateCompressionFromForm() {
    return getScheduleModelFromForm() === SCHEDULE_MODEL_DEBATE_MONTHLY;
}

function classUsesUnitPairLessonLabels(classData) {
    if (!classData) {
        return false;
    }
    const def = getClassTypeDefinitionById(classData.classTypeId);
    if (def && def.usesUnitPairLabels) {
        return true;
    }
    return classData.classTypeId === CLASS_TYPE_WR_SP_ID
        || classData.classTypeId === CLASS_TYPE_EARLY_WRITER_ID
        || classData.classTypeId === CLASS_TYPE_KOREAN_MULTI_ID;
}

function classUsesGrWeeklyUnitLabels(classData) {
    if (!classData) {
        return false;
    }
    if (classData.lessonLabelMode === 'grWeeklyUnit') {
        return true;
    }
    const def = getClassTypeDefinitionById(classData.classTypeId);
    return !!(def && def.lessonLabelMode === 'grWeeklyUnit');
}

function classUsesRcNavyUnitLabels(classData) {
    if (!classData) {
        return false;
    }
    if (classData.lessonLabelMode === 'rcNavyUnit') {
        return true;
    }
    const def = getClassTypeDefinitionById(classData.classTypeId);
    return !!(def && def.lessonLabelMode === 'rcNavyUnit');
}

function classUsesPhonicsUnitLabels(classData) {
    if (!classData) {
        return false;
    }
    if (classData.lessonLabelMode === 'phonicsUnit') {
        return true;
    }
    const def = getClassTypeDefinitionById(classData.classTypeId);
    return !!(def && def.lessonLabelMode === 'phonicsUnit');
}

function classUsesToeflRcPageLabels(classData) {
    if (!classData) {
        return false;
    }
    if (classData.lessonLabelMode === 'toeflRcPage') {
        return true;
    }
    const def = getClassTypeDefinitionById(classData.classTypeId);
    return !!(def && def.lessonLabelMode === 'toeflRcPage');
}

function classUsesWriteNowUnitLabels(classData) {
    if (!classData) {
        return false;
    }
    if (classData.lessonLabelMode === 'writeNowUnit') {
        return true;
    }
    const def = getClassTypeDefinitionById(classData.classTypeId);
    return !!(def && def.lessonLabelMode === 'writeNowUnit');
}

function classUsesWrSpUnitLabels(classData) {
    if (!classData) {
        return false;
    }
    if (classData.lessonLabelMode === 'wrSpUnit') {
        return true;
    }
    const def = getClassTypeDefinitionById(classData.classTypeId);
    return !!(def && def.lessonLabelMode === 'wrSpUnit');
}

function classUsesHandInHandUnitLabels(classData) {
    if (!classData) {
        return false;
    }
    if (classData.lessonLabelMode === 'handInHandUnit') {
        return true;
    }
    const def = getClassTypeDefinitionById(classData.classTypeId);
    return !!(def && def.lessonLabelMode === 'handInHandUnit');
}

function getLessonLabelFromTemplate(classData, lessonNum) {
    const def = getClassTypeDefinitionById(classData && classData.classTypeId);
    const templates = def && Array.isArray(def.defaultSyllabusRowTemplates)
        ? def.defaultSyllabusRowTemplates
        : [];
    const row = templates.find(r => r.sessionNumber === lessonNum);
    if (row && row.planTitle) {
        return row.planTitle;
    }
    return null;
}

function getGrWeeklyLessonLabel(lessonNum) {
    if (lessonNum === 1) {
        return 'OT + Unit 1';
    }
    return `Unit ${lessonNum}`;
}

function getUnitPairLessonLabel(lessonNum) {
    const unit = Math.ceil(lessonNum / 2);
    if (lessonNum % 2 === 1) {
        return t('unitLessonSpeaking').replace('{u}', unit);
    }
    return t('unitLessonWriting').replace('{u}', unit);
}

function getSequentialLessonLabel(classData, lessonNum) {
    const fromTemplate = getLessonLabelFromTemplate(classData, lessonNum);
    if (classUsesWrSpUnitLabels(classData) || classUsesWriteNowUnitLabels(classData)) {
        return fromTemplate || getUnitPairLessonLabel(lessonNum);
    }
    if (classUsesUnitPairLessonLabels(classData)) {
        return getUnitPairLessonLabel(lessonNum);
    }
    if (classUsesGrWeeklyUnitLabels(classData)) {
        return getGrWeeklyLessonLabel(lessonNum);
    }
    if (classUsesRcNavyUnitLabels(classData)
        || classUsesPhonicsUnitLabels(classData)
        || classUsesToeflRcPageLabels(classData)
        || classUsesHandInHandUnitLabels(classData)) {
        return fromTemplate || t('lessonNumberLabel').replace('{n}', lessonNum);
    }
    return t('lessonNumberLabel').replace('{n}', lessonNum);
}

function suggestMeetingDaysFromScheduleMatrix(def, isNewClass) {
    if (!def || !isNewClass || !window.CCPScheduleMatrix) {
        return null;
    }
    const current = readMeetingDaysFromFormScope('#classForm', MEETING_DAY_INPUT_CLASS);
    return window.CCPScheduleMatrix.suggestMeetingDaysForPreset(def, {
        currentMeetingDays: current
    });
}

function applyScheduleMatrixSuggestion(def, isNewClass) {
    const suggestion = suggestMeetingDaysFromScheduleMatrix(def, isNewClass);
    const hint = document.getElementById('classTypeHint');
    if (!suggestion) {
        return suggestion;
    }
    const lang = currentLanguage === 'ko' ? 'ko' : 'en';
    const daysLabel = suggestion.label ? suggestion.label[lang] : '';
    const patternLabel = suggestion.patternId === 'tth'
        ? (lang === 'ko' ? '화목' : 'Tue/Thu')
        : (lang === 'ko' ? '월수금' : 'MWF');
    const periodHint = suggestion.periodSummary != null
        ? suggestion.periodSummary
        : String(suggestion.period);
    if (hint && def && def.isSyllabusPreset) {
        const base = t('syllabusPresetTypeHint');
        const extra = t('scheduleMatrixSuggestHint')
            .replace('{period}', periodHint)
            .replace('{days}', daysLabel)
            .replace('{pattern}', patternLabel);
        hint.textContent = `${base} ${extra}`;
    }
    if (isNewClass) {
        const current = readMeetingDaysFromFormScope('#classForm', MEETING_DAY_INPUT_CLASS);
        if (current.length === 0 && suggestion.meetingDays && suggestion.meetingDays.length) {
            writeMeetingDaysInFormScope('#classForm', MEETING_DAY_INPUT_CLASS, suggestion.meetingDays);
            updateMeetingDayPresetButtonLabels();
        }
        if (elements.classPeriod && suggestion.period != null) {
            elements.classPeriod.value = String(suggestion.period);
        }
        if (suggestion.periodByWeekday) {
            const meetingDays = readMeetingDaysFromFormScope('#classForm', MEETING_DAY_INPUT_CLASS);
            writePeriodByWeekdayToForm(suggestion.periodByWeekday, meetingDays);
        } else {
            syncPeriodByDayUi();
        }
    }
    return suggestion;
}

function applyDefaultClassTypeToNewClassForm() {
    const hidden = document.getElementById('classTypeIdHidden');
    if (elements.classTypeSelect) {
        elements.classTypeSelect.value = '';
    }
    if (hidden) {
        hidden.value = '';
    }
    const levelSel = document.getElementById('classCurriculumLevel');
    const bookSel = document.getElementById('classCurriculumBook');
    if (levelSel) {
        levelSel.value = '';
    }
    if (bookSel) {
        bookSel.innerHTML = '';
        bookSel.disabled = true;
    }
    syncClassCurriculumBookSelect();
}

function syncClassTypeHint() {
    const hint = document.getElementById('classTypeHint');
    if (!hint || !elements.classTypeSelect) {
        return;
    }
    const def = getClassTypeDefinitionById(elements.classTypeSelect.value);
    if (def && def.isSyllabusPreset) {
        hint.textContent = t('syllabusPresetTypeHint');
    } else if (def && (def.id === CLASS_TYPE_WR_SP_ID || def.usesUnitPairLabels)) {
        hint.textContent = t('wrSpTypeHint');
    } else if (def && def.scheduleModel === SCHEDULE_MODEL_SEQUENTIAL_TERM) {
        hint.textContent = t('sequentialScheduleHint');
    } else {
        hint.textContent = t('classTypeHint');
    }
}

function updateCompressionUiForScheduleModel() {
    const debate = classUsesDebateCompressionFromForm();
    const compressionGroup = document.querySelector('.compression-mode-group');
    const globalSection = document.getElementById('compressionGlobalSection');
    const byMonthSection = document.getElementById('compressionByMonthSection');
    const display = debate ? '' : 'none';
    if (compressionGroup) {
        compressionGroup.style.display = display;
    }
    if (globalSection) {
        globalSection.style.display = display;
    }
    if (byMonthSection) {
        byMonthSection.style.display = display;
    }
}

function getClassTypeOptionLabel(def) {
    if (window.CCPDefaultClassEditor) {
        return window.CCPDefaultClassEditor.getOptionLabel(def);
    }
    if (!def) {
        return '';
    }
    return (def.name || def.fallbackName || def.id || '').trim();
}

function normalizeMeetingDaysArray(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    const nums = raw
        .map(v => parseInt(v, 10))
        .filter(n => !Number.isNaN(n) && n >= 0 && n <= 6);
    return [...new Set(nums)].sort((a, b) => a - b);
}

/**
 * Weekdays this class meets (0=Sun … 6=Sat). Prefers meetingDays; falls back to legacy dayOfWeek.
 */
function getMeetingDaysFromClass(classData) {
    if (!classData || (classData.customSchedule && classData.customSchedule.enabled)) {
        return [];
    }
    const fromArr = normalizeMeetingDaysArray(classData.meetingDays);
    if (fromArr.length > 0) {
        return fromArr;
    }
    const dow = classData.dayOfWeek;
    if (dow === null || dow === undefined || dow === '') {
        return [];
    }
    const n = parseInt(dow, 10);
    if (Number.isNaN(n) || n < 0 || n > 6) {
        return [];
    }
    return [n];
}

function collectAllMeetingDatesInRange(rangeStart, rangeEnd, meetingDays) {
    const set = new Set(normalizeMeetingDaysArray(meetingDays));
    if (set.size === 0) {
        return [];
    }
    const dates = [];
    const cur = new Date(rangeStart);
    while (cur <= rangeEnd) {
        if (set.has(cur.getDay())) {
            dates.push(new Date(cur));
        }
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

function collectEligibleMeetingDatesInMonth(rangeStart, rangeEnd, meetingDays, classData) {
    return collectAllMeetingDatesInRange(rangeStart, rangeEnd, meetingDays).filter(d => {
        const ds = formatDateISO(d);
        return !isHolidayForClass(ds, classData);
    });
}

function getSyllabusEventColors(event, type) {
    const normalized = normalizeEventType(type || (event && event.type) || EVENT_TYPES.OTHER);
    const defaults = EVENT_TYPE_DEFAULT_COLORS[normalized] || EVENT_TYPE_DEFAULT_COLORS.other;
    return {
        bg: (event && event.bgColor) || defaults.bg,
        text: (event && event.textColor) || defaults.text,
        type: normalized
    };
}

/** Fill rowBg/rowColor on holiday/event rows when missing (stale saves, form collect). */
function enrichSyllabusRowColors(rows, classData) {
    if (!Array.isArray(rows) || !rows.length) {
        return rows || [];
    }
    return rows.map(row => {
        if (row.rowBg) {
            return row;
        }
        const kind = row.kind || 'lesson';
        if (kind === 'holiday' && row.date && classData) {
            const hol = isHolidayForClass(row.date, classData)
                ? getHolidayForDate(row.date)
                : null;
            const colors = getSyllabusEventColors(hol, 'holiday');
            return { ...row, rowBg: colors.bg, rowColor: colors.text, eventType: colors.type };
        }
        if (kind === 'event' && row.date && classData) {
            const ev = getInlineScheduleEventForClassOnDate(row.date, classData);
            if (ev) {
                const colors = getSyllabusEventColors(ev, ev.type);
                return { ...row, rowBg: colors.bg, rowColor: colors.text, eventType: colors.type };
            }
        }
        if (kind === 'extra') {
            const colors = getSyllabusEventColors(null, 'other');
            return { ...row, rowBg: colors.bg, rowColor: colors.text, eventType: colors.type };
        }
        return row;
    });
}

function getUnscheduledLessonNumbers(classData, schedule) {
    const totalLessons = sanitizeTotalLessons(classData.totalLessons || 8);
    const scheduledCount = schedule.scheduledCount != null
        ? schedule.scheduledCount
        : (schedule.lessons || []).length;
    const totalGroups = schedule.totalGroups != null ? schedule.totalGroups : totalLessons;
    const cap = Math.max(totalLessons, totalGroups);
    const nums = [];
    for (let n = scheduledCount + 1; n <= cap; n += 1) {
        nums.push(n);
    }
    return nums;
}

/**
 * Chronological class meeting slots for syllabus rows (includes holidays as slots).
 * @returns {{ slots: Array, unscheduledLessonNumbers: number[] }}
 */
function buildSyllabusTimelineForClass(classData) {
    syncHolidaysFromEvents();
    const schedule = calculateLessonDates(classData);
    const lessons = schedule.lessons || [];
    const unscheduledLessonNumbers = getUnscheduledLessonNumbers(classData, schedule);

    if (classData.customSchedule && classData.customSchedule.enabled) {
        const slots = lessons.map(lesson => {
            const dateStr = lesson.date instanceof Date ? formatDateISO(lesson.date) : lesson.date;
            const monthKey = lesson.monthKey || (dateStr ? dateStr.slice(0, 7) : '');
            const isHol = isHolidayForClass(dateStr, classData);
            return {
                date: dateStr,
                monthKey,
                kind: isHol ? 'holiday' : 'lesson',
                label: lesson.label,
                lesson: isHol ? null : lesson
            };
        });
        return { slots, unscheduledLessonNumbers };
    }

    const meetingDays = getMeetingDaysFromClass(classData);
    const classStart = parseISODateLocal(classData.startDate);
    const classEnd = parseISODateLocal(classData.endDate);
    if (meetingDays.length === 0
        || Number.isNaN(classStart.getTime())
        || Number.isNaN(classEnd.getTime())) {
        const slots = lessons.map(lesson => {
            const dateStr = lesson.date instanceof Date ? formatDateISO(lesson.date) : lesson.date;
            return {
                date: dateStr,
                monthKey: lesson.monthKey || (dateStr ? dateStr.slice(0, 7) : ''),
                kind: 'lesson',
                label: lesson.label,
                lesson
            };
        });
        return { slots, unscheduledLessonNumbers };
    }

    const meetingDates = collectAllMeetingDatesInRange(classStart, classEnd, meetingDays);
    let lessonIdx = 0;
    const slots = [];

    meetingDates.forEach(d => {
        const dateStr = formatDateISO(d);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (isHolidayForClass(dateStr, classData)) {
            slots.push({ date: dateStr, monthKey, kind: 'holiday' });
        } else if (lessonIdx < lessons.length) {
            const lesson = lessons[lessonIdx];
            lessonIdx += 1;
            slots.push({
                date: dateStr,
                monthKey: lesson.monthKey || monthKey,
                kind: 'lesson',
                label: lesson.label,
                lesson
            });
        } else {
            slots.push({ date: dateStr, monthKey, kind: 'extra' });
        }
    });

    return { slots, unscheduledLessonNumbers };
}

function formatMeetingDaysSummary(classData) {
    if (classData.customSchedule && classData.customSchedule.enabled) {
        return t('customScheduleLabel');
    }
    const days = getMeetingDaysFromClass(classData);
    if (days.length === 0) {
        return '—';
    }
    const short = t('dayNamesShort');
    return days.map(d => short[d] || d).join(', ');
}

const MEETING_DAY_INPUT_CLASS = 'classMeetingDay';
const MEETING_DAY_INPUT_NEW_TYPE = 'newClassTypeMeetingDay';

/** Common school schedules: Mon/Wed/Fri and Tue/Thu (0=Sun … 6=Sat). */
const MEETING_DAY_PRESETS = [
    { id: 'mwf', labelKey: 'meetingDaysPresetMwf', fallbackLabel: 'MWF', days: [1, 3, 5] },
    { id: 'mw', labelKey: 'meetingDaysPresetMw', fallbackLabel: 'Mon/Wed', days: [1, 3] },
    { id: 'wf', labelKey: 'meetingDaysPresetWf', fallbackLabel: 'Wed/Fri', days: [3, 5] },
    { id: 'mf', labelKey: 'meetingDaysPresetMf', fallbackLabel: 'Mon/Fri', days: [1, 5] },
    { id: 'tt', labelKey: 'meetingDaysPresetTt', fallbackLabel: 'T/T', days: [2, 4] },
    { id: 'clear', labelKey: 'meetingDaysPresetClear', fallbackLabel: 'Clear', days: [] }
];

function buildMeetingDayPresetButtons(containerEl, formRootSelector, inputName) {
    if (!containerEl) {
        return;
    }
    containerEl.innerHTML = '';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'meeting-days-presets-label';
    labelSpan.setAttribute('data-i18n', 'meetingDaysQuick');
    labelSpan.textContent = t('meetingDaysQuick');
    containerEl.appendChild(labelSpan);
    MEETING_DAY_PRESETS.forEach(preset => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline btn-small meeting-day-preset-btn';
        btn.dataset.preset = preset.id;
        if (preset.labelKey) {
            btn.setAttribute('data-i18n', preset.labelKey);
        }
        btn.textContent = t(preset.labelKey) || preset.fallbackLabel;
        btn.addEventListener('click', () => {
            writeMeetingDaysInFormScope(formRootSelector, inputName, preset.days);
            if (inputName === MEETING_DAY_INPUT_CLASS) {
                syncPeriodByDayUi();
            }
        });
        containerEl.appendChild(btn);
    });
}

function refreshMeetingDayPresetLabels() {
    document.querySelectorAll('.meeting-days-presets-label[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key && translations[currentLanguage][key]) {
            el.textContent = translations[currentLanguage][key];
        }
    });
    document.querySelectorAll('.meeting-day-preset-btn[data-i18n]').forEach(btn => {
        const key = btn.getAttribute('data-i18n');
        if (key && translations[currentLanguage][key]) {
            btn.textContent = translations[currentLanguage][key];
        }
    });
}

function ensureMeetingDayPresetsForContainer(checkboxRow, formRootSelector, inputName) {
    if (!checkboxRow) {
        return;
    }
    let block = checkboxRow.closest('.meeting-days-block');
    if (!block) {
        block = document.createElement('div');
        block.className = 'meeting-days-block';
        checkboxRow.parentNode.insertBefore(block, checkboxRow);
        block.appendChild(checkboxRow);
    }
    let presets = block.querySelector('.meeting-days-presets');
    if (!presets) {
        presets = document.createElement('div');
        presets.className = 'meeting-days-presets';
        block.insertBefore(presets, checkboxRow);
    }
    if (!presets.querySelector('button')) {
        buildMeetingDayPresetButtons(presets, formRootSelector, inputName);
    }
}

function setupMeetingDaysBlock(checkboxContainer, formRootSelector, inputName) {
    if (!checkboxContainer) {
        return;
    }
    ensureMeetingDayPresetsForContainer(checkboxContainer, formRootSelector, inputName);
    if (!checkboxContainer.querySelector('input[type="checkbox"]')) {
        buildMeetingDaysCheckboxRow(checkboxContainer, inputName);
    }
}

function buildMeetingDaysCheckboxRow(containerEl, inputName) {
    if (!containerEl) {
        return;
    }
    containerEl.innerHTML = '';
    const short = t('dayNamesShort');
    for (let d = 0; d < 7; d += 1) {
        const label = document.createElement('label');
        label.className = 'meeting-day-chip';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = inputName;
        cb.value = String(d);
        const span = document.createElement('span');
        span.className = 'meeting-day-chip-text';
        span.textContent = short[d] != null ? short[d] : String(d);
        label.appendChild(cb);
        label.appendChild(span);
        containerEl.appendChild(label);
    }
}

function readMeetingDaysFromFormScope(formRootSelector, inputName) {
    const root = formRootSelector ? document.querySelector(formRootSelector) : document;
    if (!root) {
        return [];
    }
    return normalizeMeetingDaysArray(
        Array.from(root.querySelectorAll(`input[name="${inputName}"]:checked`)).map(cb => parseInt(cb.value, 10))
    );
}

function writeMeetingDaysInFormScope(formRootSelector, inputName, days) {
    const root = formRootSelector ? document.querySelector(formRootSelector) : document;
    if (!root) {
        return;
    }
    const set = new Set(normalizeMeetingDaysArray(days));
    root.querySelectorAll(`input[name="${inputName}"]`).forEach(cb => {
        cb.checked = set.has(parseInt(cb.value, 10));
    });
}

function updateMeetingDayChipLabels() {
    const short = t('dayNamesShort');
    document.querySelectorAll('.meeting-day-chip').forEach(label => {
        const cb = label.querySelector('input[type="checkbox"]');
        const span = label.querySelector('.meeting-day-chip-text');
        if (!cb || !span) {
            return;
        }
        const d = parseInt(cb.value, 10);
        span.textContent = short[d] != null ? short[d] : String(d);
    });
}

function populateClassTypeSelect() {
    const sel = elements.classTypeSelect;
    if (!sel) {
        return;
    }
    if (window.CCPDefaultClassEditor) {
        window.CCPDefaultClassEditor.populateSelect(sel, {
            appData,
            lang: currentLanguage
        });
        return;
    }
}

function syncDeleteCustomClassTypeButtonVisibility() {
    const btn = elements.deleteCustomClassTypeBtn;
    if (!btn || !elements.classTypeSelect) {
        return;
    }
    const opt = elements.classTypeSelect.selectedOptions[0];
    const show = !!(opt && opt.dataset && opt.dataset.customType === '1');
    btn.style.display = show ? 'inline-flex' : 'none';
}

function applyClassTypeDefinitionToForm(def) {
    if (!def || !elements.classTotalLessons) {
        return;
    }
    const isNewClass = !elements.classId.value;
    elements.classTotalLessons.value = sanitizeTotalLessons(def.defaultTotalLessons || 4);
    // Meeting days are always chosen by the teacher (quick presets or checkboxes).
    // Syllabus PDF presets never impose Mon/Wed, Wed/Fri, etc.
    if (isNewClass && !def.isSyllabusPreset && Array.isArray(def.defaultMeetingDays)
        && def.defaultMeetingDays.length > 0) {
        writeMeetingDaysInFormScope('#classForm', MEETING_DAY_INPUT_CLASS, def.defaultMeetingDays);
    }
    if (def.defaultBook && elements.classBook && isNewClass) {
        elements.classBook.value = def.defaultBook;
    }
    if (isNewClass && def.level && elements.classLevel && getSimsonLevelById(def.level)) {
        elements.classLevel.value = def.level;
    }
    if (isNewClass && Array.isArray(def.defaultSyllabusUnits) && def.defaultSyllabusUnits.length) {
        renderSyllabusUnitsRows(def.defaultSyllabusUnits);
    }
    if (isNewClass) {
        elements.customScheduleEnabled.checked = false;
        elements.customScheduleSection.style.display = 'none';
    }
    const isSequential = def.scheduleModel === SCHEDULE_MODEL_SEQUENTIAL_TERM
        || def.defaultCompressionMode === 'sequentialTerm';
    if (!isSequential) {
        const mode = def.defaultCompressionMode === 'manual' ? 'manual' : 'autoWhenNeeded';
        const modeAuto = document.getElementById('compressionModeAuto');
        const modeManual = document.getElementById('compressionModeManual');
        if (mode === 'manual' && modeManual) {
            modeManual.checked = true;
        } else if (modeAuto) {
            modeAuto.checked = true;
        }
    }
    const totalLessons = getTotalLessonsValue();
    const curDates = getCustomLessonDatesFromInputs();
    const curMerges = isSequential ? [] : getSelectedCompressionMerges();
    renderCustomLessonDates(totalLessons, curDates);
    renderCompressionOptions(totalLessons, curMerges);
    updateCompressionUiForScheduleModel();
    if (isNewClass) {
        applyScheduleMatrixSuggestion(def, true);
    } else {
        syncClassTypeHint();
    }
    syncPeriodByDayUi();
    if (elements.classForm) {
        elements.classForm.dataset.homeworkImportMode = def.homeworkImportMode || '';
        elements.classForm.dataset.lessonLabelMode = def.lessonLabelMode || '';
    }
    tryAutoDistributeSyllabusFromPreset(def);
}

/**
 * When adding a class: if type, term dates, and meeting days are set, build syllabus rows
 * on the calendar schedule and apply sample syllabus content by session number.
 */
function tryAutoDistributeSyllabusFromPreset(def) {
    if (!def || elements.classId.value) {
        return;
    }
    if (!elements.classStartDate.value || !elements.classEndDate.value) {
        return;
    }
    if (elements.customScheduleEnabled.checked) {
        return;
    }
    const meetingDays = readMeetingDaysFromFormScope('#classForm', MEETING_DAY_INPUT_CLASS);
    if (meetingDays.length === 0) {
        return;
    }
    if (!elements.syllabusTableBody) {
        return;
    }
    refreshSyllabusFromCalendar();
    if (Array.isArray(def.defaultSyllabusRowTemplates) && def.defaultSyllabusRowTemplates.length) {
        applyPresetSyllabusRowsToTable({ silent: true });
    }
}

function refreshClassModalDomRefs() {
    elements.classTypeSelect = document.getElementById('classTypeSelect');
    elements.classMeetingDaysRow = document.getElementById('classMeetingDaysRow');
    elements.openClassTypeModalBtn = document.getElementById('openClassTypeModalBtn');
    elements.deleteCustomClassTypeBtn = document.getElementById('deleteCustomClassTypeBtn');
    elements.classTypeModal = document.getElementById('classTypeModal');
    elements.classTypeForm = document.getElementById('classTypeForm');
    elements.deleteClassBtn = document.getElementById('deleteClassBtn');
    elements.classPeriod = document.getElementById('classPeriod');
}

/** Pop-out: Open full editor. Classes tab: View in Calendar (when class is saved). */
function syncClassOpenEditorButton() {
    const btn = document.getElementById('openClassInTabBtn');
    if (!btn) {
        return;
    }
    const inClassesTabEditor = classEditorMount === 'tab' && getActiveTab() === 'classes';
    const id = elements.classId && elements.classId.value;
    if (inClassesTabEditor) {
        btn.textContent = t('viewClassInCalendar');
        const show = !!id;
        btn.hidden = !show;
        btn.style.display = show ? 'inline-flex' : 'none';
        btn.setAttribute('aria-hidden', show ? 'false' : 'true');
    } else {
        btn.textContent = t('openFullClassEditor');
        btn.hidden = false;
        btn.style.display = 'inline-flex';
        btn.setAttribute('aria-hidden', 'false');
    }
}

function focusClassOnCalendar(classId) {
    const cls = appData.classes.find((c) => c.id === classId);
    if (!cls) {
        return;
    }
    ensureUiState();
    appData.ui.topBarCollapsed = false;
    applyTopBarCollapsedState();
    appData.ui.lessonFilters = normalizeLessonFilters({
        ...DEFAULT_LESSON_FILTERS,
        classIds: [classId]
    });
    updateLessonFilterButtonLabel();
    updatePrintLessonFilterHint();
    saveData();
    renderCalendar();
    requestAnimationFrame(() => {
        highlightClassLessonBarsOnCalendar(classId);
    });
}

function highlightClassLessonBarsOnCalendar(classId) {
    document.querySelectorAll('.event-bar--calendar-focus').forEach((el) => {
        el.classList.remove('event-bar--calendar-focus');
    });
    const bars = document.querySelectorAll(`.event-bar[data-class-id="${classId}"]`);
    if (!bars.length) {
        return;
    }
    bars.forEach((bar) => bar.classList.add('event-bar--calendar-focus'));
    bars[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
        bars.forEach((bar) => bar.classList.remove('event-bar--calendar-focus'));
    }, 4000);
}

function viewClassInCalendar(classId) {
    if (!classId) {
        return;
    }
    navigateToTab('calendar', { focusClassId: classId });
}

/** Pop-out: Open full editor. Events tab: View in Calendar (when event is saved). */
function syncEventOpenEditorButton() {
    const btn = document.getElementById('openEventInTabBtn');
    if (!btn) {
        return;
    }
    const inEventsTabEditor = eventEditorMount === 'tab' && getActiveTab() === 'events';
    const id = elements.holidayId && elements.holidayId.value;
    if (inEventsTabEditor) {
        btn.textContent = t('viewEventInCalendar');
        const show = !!id;
        btn.hidden = !show;
        btn.style.display = show ? 'inline-flex' : 'none';
        btn.setAttribute('aria-hidden', show ? 'false' : 'true');
    } else {
        btn.textContent = t('openFullEventEditor');
        btn.hidden = false;
        btn.style.display = 'inline-flex';
        btn.setAttribute('aria-hidden', 'false');
    }
}

function visibilityKeyForEventType(type) {
    const normalized = normalizeEventType(type);
    return normalized === EVENT_TYPES.HOLIDAY ? 'holidays' : normalized;
}

function ensureEventTypeVisibleOnCalendar(ev) {
    ensureUiState();
    const key = visibilityKeyForEventType(ev.type);
    if (appData.ui.visibilityFilters[key] === false) {
        appData.ui.visibilityFilters = {
            ...appData.ui.visibilityFilters,
            [key]: true
        };
        applyVisibilityFiltersToDom();
    }
}

function focusEventOnCalendar(eventId) {
    const ev = (appData.events || []).find((e) => e.id === eventId);
    if (!ev) {
        return;
    }
    ensureUiState();
    appData.ui.topBarCollapsed = false;
    applyTopBarCollapsedState();
    ensureEventTypeVisibleOnCalendar(ev);
    saveData();
    renderCalendar();
    requestAnimationFrame(() => {
        highlightEventOnCalendar(eventId);
    });
}

function highlightEventOnCalendar(eventId) {
    document.querySelectorAll('.calendar-event--calendar-focus').forEach((el) => {
        el.classList.remove('calendar-event--calendar-focus');
    });
    const targets = document.querySelectorAll(`[data-event-id="${eventId}"]`);
    if (!targets.length) {
        return;
    }
    targets.forEach((el) => el.classList.add('calendar-event--calendar-focus'));
    targets[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
        targets.forEach((el) => el.classList.remove('calendar-event--calendar-focus'));
    }, 4000);
}

function viewEventInCalendar(eventId) {
    if (!eventId) {
        return;
    }
    navigateToTab('calendar', { focusEventId: eventId });
}

/** Show Delete only when editing an existing class (not when adding a new one). */
function syncClassDeleteButtonVisibility(isEditing) {
    const modal = elements.classModal;
    if (modal) {
        modal.classList.toggle('class-modal--edit', !!isEditing);
    }
    const btn = document.getElementById('deleteClassBtn');
    elements.deleteClassBtn = btn;
    if (!btn) {
        return;
    }
    btn.hidden = !isEditing;
    btn.style.display = isEditing ? 'inline-flex' : 'none';
    btn.setAttribute('aria-hidden', isEditing ? 'false' : 'true');

    ['printClassSyllabusBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.style.display = isEditing ? 'inline-flex' : 'none';
            btn.hidden = !isEditing;
        }
    });
}

/**
 * One sticky top bar: title + Delete + Save + close (inside #classForm).
 * Migrates older HTML that had a separate header and toolbar.
 */
function ensureClassModalLayout() {
    const modal = document.getElementById('classModal');
    const form = document.getElementById('classForm');
    if (!modal || !form) {
        return;
    }

    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.classList.add('class-modal-content', 'modal-content--scrollable');
    }

    const hiddenId = form.querySelector('#classId');
    let header = form.querySelector('.class-modal-header');
    const headerOutside = modalContent
        ? modalContent.querySelector(':scope > .modal-header:not(.class-modal-header)')
        : null;
    if (!header && headerOutside) {
        header = headerOutside;
        header.classList.add('class-modal-header');
        if (hiddenId && hiddenId.nextSibling) {
            form.insertBefore(header, hiddenId.nextSibling);
        } else {
            form.insertBefore(header, form.firstChild);
        }
    }
    if (header) {
        header.classList.add('class-modal-header');
    }

    const deleteBtn = document.getElementById('deleteClassBtn');
    const saveBtn = form.querySelector('button[type="submit"].btn-primary')
        || form.querySelector('button[type="submit"]');
    const closeBtn = document.getElementById('closeClassModal');
    const toolbar = form.querySelector('.class-modal-toolbar');

    if (header) {
        let actions = header.querySelector('.class-modal-header-actions');
        if (!actions) {
            actions = document.createElement('d' + 'iv');
            actions.className = 'class-modal-header-actions';
            header.appendChild(actions);
        }
        if (deleteBtn && !actions.contains(deleteBtn)) {
            deleteBtn.classList.add('btn-small');
            actions.insertBefore(deleteBtn, actions.firstChild);
        }
        if (saveBtn && !actions.contains(saveBtn)) {
            saveBtn.classList.add('btn-small');
            const closeInActions = closeBtn && actions.contains(closeBtn);
            if (closeInActions) {
                actions.insertBefore(saveBtn, closeBtn);
            } else {
                actions.appendChild(saveBtn);
            }
        }
        if (closeBtn && !actions.contains(closeBtn)) {
            closeBtn.type = 'button';
            actions.appendChild(closeBtn);
        }
        if (closeBtn && closeBtn.parentElement === header) {
            closeBtn.type = 'button';
            actions.appendChild(closeBtn);
        }
    }

    if (toolbar) {
        toolbar.remove();
    }

    let body = form.querySelector('.class-modal-body');
    if (!body) {
        body = document.createElement('d' + 'iv');
        body.className = 'class-modal-body';
        const anchor = header ? header.nextSibling : (hiddenId ? hiddenId.nextSibling : null);
        if (anchor) {
            form.insertBefore(body, anchor);
        } else {
            form.appendChild(body);
        }
        const movable = [];
        Array.from(form.children).forEach(child => {
            if (child === hiddenId || child === header || child === body) {
                return;
            }
            if (child.classList && child.classList.contains('form-actions')) {
                return;
            }
            movable.push(child);
        });
        movable.forEach(node => body.appendChild(node));
    }

    const nameWrap = form.querySelector('.autocomplete-wrapper');
    if (nameWrap) {
        nameWrap.classList.add('class-modal-name-field');
    }
    const typeRow = form.querySelector('.class-type-row');
    if (nameWrap && typeRow && nameWrap.contains(typeRow)) {
        nameWrap.insertAdjacentElement('afterend', typeRow);
    }

    refreshClassModalDomRefs();
    const editing = !!(elements.classId && elements.classId.value);
    syncClassDeleteButtonVisibility(editing);
}

/**
 * If index.html is an older version, inject class type controls + meeting-day chips + modal.
 */
function ensureClassFormExtendedMarkup() {
    ensureClassModalLayout();
    ensureClassPeriodMarkup();
    if (document.getElementById('classTypeSelect')) {
        refreshClassModalDomRefs();
        return;
    }
    const form = document.getElementById('classForm');
    const daySelect = document.getElementById('classDayOfWeek');
    if (!form) {
        return;
    }

    const nameWrap = form.querySelector('.autocomplete-wrapper');
    if (nameWrap && !document.getElementById('classTypeSelect')) {
        const typeRow = document.createElement('div');
        typeRow.className = 'form-row class-type-row';
        typeRow.innerHTML = `
                    <div class="form-group class-type-select-wrap">
                        <label for="classTypeSelect" data-i18n="classTypeLabel">Class type</label>
                        <select id="classTypeSelect" aria-describedby="classTypeHint"></select>
                        <p id="classTypeHint" class="section-hint" data-i18n="classTypeHint"></p>
                    </div>
                    <div class="form-group class-type-inline-actions">
                        <span class="form-spacer-label" aria-hidden="true">&nbsp;</span>
                        <div class="class-type-action-buttons">
                            <button type="button" id="openClassTypeModalBtn" class="btn btn-outline btn-small" data-i18n="classTypeNewType"></button>
                            <button type="button" id="deleteCustomClassTypeBtn" class="btn btn-outline btn-small" style="display: none;" data-i18n="classTypeDelete"></button>
                        </div>
                    </div>`;
        nameWrap.insertAdjacentElement('afterend', typeRow);
    }

    if (daySelect) {
        const dowGroup = daySelect.closest('.form-group');
        const dowRow = dowGroup ? dowGroup.closest('.form-row') : null;
        if (dowGroup && dowRow) {
            dowGroup.remove();
            const meetingCol = document.createElement('div');
            meetingCol.className = 'form-group form-group-meeting-days';
            meetingCol.innerHTML = `
                        <label data-i18n="meetingDays"></label>
                        <p class="section-hint" data-i18n="meetingDaysHint"></p>
                        <div class="meeting-days-block">
                            <div class="meeting-days-presets"></div>
                            <div id="classMeetingDaysRow" class="meeting-days-row" role="group" aria-label="Meeting days"></div>
                        </div>`;
            dowRow.insertBefore(meetingCol, dowRow.firstChild);
            dowRow.classList.add('form-row-meeting-days');
        }
    }

    if (!document.getElementById('classTypeModal')) {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
    <div id="classTypeModal" class="modal">
        <div class="modal-content modal-small">
            <div class="modal-header">
                <h2 data-i18n="classTypeCreateTitle"></h2>
                <button type="button" class="modal-close" id="closeClassTypeModal">&times;</button>
            </div>
            <form id="classTypeForm">
                <div class="form-group">
                    <label for="newClassTypeName" data-i18n="classTypeName"></label>
                    <input type="text" id="newClassTypeName" required maxlength="80" data-i18n-placeholder="classTypeNamePlaceholder" placeholder="">
                </div>
                <div class="form-group">
                    <label for="newClassTypeTotalLessons" data-i18n="totalLessons"></label>
                    <input type="number" id="newClassTypeTotalLessons" min="1" value="8" required>
                </div>
                <div class="form-group">
                    <label data-i18n="meetingDays"></label>
                    <p class="section-hint" data-i18n="classTypeMeetingDaysHint"></p>
                    <div class="meeting-days-block">
                        <div class="meeting-days-presets"></div>
                        <div id="newClassTypeMeetingDaysRow" class="meeting-days-row" role="group"></div>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary" data-i18n="classTypeSave"></button>
                </div>
            </form>
        </div>
    </div>`;
        document.body.appendChild(wrap.firstElementChild);
    }

    refreshClassModalDomRefs();
}

function setupClassMeetingDaysUI() {
    const main = document.getElementById('classMeetingDaysRow');
    const modalRow = document.getElementById('newClassTypeMeetingDaysRow');
    setupMeetingDaysBlock(main, '#classForm', MEETING_DAY_INPUT_CLASS);
    setupMeetingDaysBlock(modalRow, '#classTypeForm', MEETING_DAY_INPUT_NEW_TYPE);
    updateMeetingDayChipLabels();
    refreshMeetingDayPresetLabels();
    if (main && !main.dataset.syllabusDistributeBound) {
        main.dataset.syllabusDistributeBound = '1';
        main.addEventListener('change', (e) => {
            if (e.target.matches(`input[name="${MEETING_DAY_INPUT_CLASS}"]`)) {
                tryAutoDistributeSyllabusFromPreset(getSelectedClassTypeDefinitionFromForm());
                syncPeriodByDayUi();
            }
        });
    }
}

function bindClassScheduleInputsForSyllabusDistribute() {
    const onScheduleInput = () => {
        tryAutoDistributeSyllabusFromPreset(getSelectedClassTypeDefinitionFromForm());
    };
    if (elements.classStartDate && !elements.classStartDate.dataset.syllabusDistributeBound) {
        elements.classStartDate.dataset.syllabusDistributeBound = '1';
        elements.classStartDate.addEventListener('change', onScheduleInput);
    }
    if (elements.classEndDate && !elements.classEndDate.dataset.syllabusDistributeBound) {
        elements.classEndDate.dataset.syllabusDistributeBound = '1';
        elements.classEndDate.addEventListener('change', onScheduleInput);
    }
}

function openClassTypeManagerModal() {
    if (!elements.classTypeModal) {
        return;
    }
    const nameIn = document.getElementById('newClassTypeName');
    const totalIn = document.getElementById('newClassTypeTotalLessons');
    if (nameIn) {
        nameIn.value = '';
    }
    if (totalIn) {
        totalIn.value = '8';
    }
    writeMeetingDaysInFormScope('#classTypeForm', MEETING_DAY_INPUT_NEW_TYPE, [1, 3]);
    updateMeetingDayChipLabels();
    openModal(elements.classTypeModal);
}

function handleClassTypeFormSubmit(e) {
    e.preventDefault();
    const nameIn = document.getElementById('newClassTypeName');
    const totalIn = document.getElementById('newClassTypeTotalLessons');
    if (!nameIn || !totalIn) {
        return;
    }
    const name = (nameIn.value || '').trim();
    if (!name) {
        return;
    }
    const days = readMeetingDaysFromFormScope('#classTypeForm', MEETING_DAY_INPUT_NEW_TYPE);
    if (days.length === 0) {
        alert(t('meetingDaysRequired'));
        return;
    }
    const def = {
        id: generateId(),
        name,
        defaultTotalLessons: sanitizeTotalLessons(totalIn.value || 1),
        defaultMeetingDays: days,
        defaultCompressionMode: 'autoWhenNeeded'
    };
    getCustomClassTypes().push(def);
    saveData();
    populateClassTypeSelect();
    if (elements.classTypeSelect) {
        elements.classTypeSelect.value = def.id;
        applyClassTypeDefinitionToForm(def);
        syncDeleteCustomClassTypeButtonVisibility();
    }
    closeModal(elements.classTypeModal);
}

function deleteSelectedCustomClassType() {
    if (!elements.classTypeSelect) {
        return;
    }
    const opt = elements.classTypeSelect.selectedOptions[0];
    if (!opt || opt.dataset.customType !== '1') {
        return;
    }
    if (!confirm(t('confirmDeleteClassType'))) {
        return;
    }
    const id = opt.value;
    appData.customClassTypes = getCustomClassTypes().filter(ct => ct.id !== id);
    saveData();
    populateClassTypeSelect();
    if (elements.classTypeSelect) {
        elements.classTypeSelect.value = DEFAULT_CLASS_TYPE_ID;
        applyClassTypeDefinitionToForm(getClassTypeDefinitionById(DEFAULT_CLASS_TYPE_ID));
    }
    syncDeleteCustomClassTypeButtonVisibility();
}

/**
 * Public KR holiday calendar (no API key). Based on official lunar gazette (월력요항);
 * includes substitute holidays (대체공휴일). See https://holidays.hyunbin.page/
 */
const KR_PUBLIC_HOLIDAYS_JSON_BASE = 'https://holidays.hyunbin.page';
const KR_PUBLIC_HOLIDAYS_JSON_CDN = 'https://cdn.jsdelivr.net/gh/hyunbinseo/holidays-kr@main/public';
const KR_PUBLIC_HOLIDAYS_SOURCE_PAGE = 'https://holidays.hyunbin.page/';

/** Korean labels from holidays.hyunbin.page → English display names */
const KR_PUBLIC_HOLIDAY_NAME_EN = {
    '1월 1일': 'New Year\'s Day',
    '신정': 'New Year\'s Day',
    '설날 전날': 'Day before Seollal (Lunar New Year)',
    '설날': 'Seollal (Lunar New Year)',
    '설날 다음 날': 'Day after Seollal (Lunar New Year)',
    '3ㆍ1절': 'Independence Movement Day (March 1)',
    '3·1절': 'Independence Movement Day (March 1)',
    '3.1절': 'Independence Movement Day (March 1)',
    '삼일절': 'Independence Movement Day (March 1)',
    '노동절': 'Labor Day',
    '어린이날': 'Children\'s Day',
    '부처님 오신 날': 'Buddha\'s Birthday',
    '석가탄신일': 'Buddha\'s Birthday',
    '전국동시지방선거': 'Local elections (national)',
    '현충일': 'Memorial Day',
    '제헌절': 'Constitution Day',
    '광복절': 'Liberation Day',
    '추석 전날': 'Day before Chuseok',
    '추석': 'Chuseok (Korean Thanksgiving)',
    '추석 다음 날': 'Day after Chuseok',
    '개천절': 'National Foundation Day',
    '한글날': 'Hangeul Day',
    '기독탄신일': 'Christmas Day',
    '크리스마스': 'Christmas Day',
    '대체공휴일': 'Substitute public holiday',
    '임시공휴일': 'Temporary public holiday'
};

function normalizeKrHolidayLabelForLookup(name) {
    return String(name || '')
        .trim()
        .replace(/\u00B7/g, 'ㆍ')
        .replace(/·/g, 'ㆍ');
}

function textContainsHangul(text) {
    return /[\u3131-\u318E\uAC00-\uD7A3]/.test(String(text || ''));
}

function translateKrPublicHolidayName(koName) {
    const raw = String(koName || '').trim();
    if (!raw) {
        return '';
    }
    const parts = raw.split(/\s*·\s*/).map(p => p.trim()).filter(Boolean);
    const translated = parts.map(part => {
        const key = normalizeKrHolidayLabelForLookup(part);
        if (KR_PUBLIC_HOLIDAY_NAME_EN[key]) {
            return KR_PUBLIC_HOLIDAY_NAME_EN[key];
        }
        const subMatch = part.match(/^대체공휴일\s*\((.+)\)$/);
        if (subMatch) {
            const inner = translateKrPublicHolidayName(subMatch[1]);
            return `Substitute holiday (${inner})`;
        }
        const tempMatch = part.match(/^임시공휴일\s*\((.+)\)$/);
        if (tempMatch) {
            const inner = translateKrPublicHolidayName(tempMatch[1]);
            return `Temporary public holiday (${inner})`;
        }
        return part;
    });
    return translated.join(' · ');
}

function isKrPublicHolidayImportedEvent(ev) {
    const note = (ev && ev.notes) ? String(ev.notes).trim() : '';
    return note === translations.en.krPublicHolidayImportNote
        || note === translations.ko.krPublicHolidayImportNote;
}

function getEventDisplayName(ev) {
    if (!ev) {
        return '';
    }
    const ko = ev.nameKo ? String(ev.nameKo).trim() : '';
    const en = ev.nameEn ? String(ev.nameEn).trim() : '';
    if (ko && en) {
        return currentLanguage === 'ko' ? ko : en;
    }
    if (isKrPublicHolidayImportedEvent(ev) && ev.name) {
        const backfilledKo = ev.name;
        const backfilledEn = translateKrPublicHolidayName(backfilledKo);
        if (currentLanguage === 'ko') {
            return backfilledKo;
        }
        return backfilledEn || backfilledKo;
    }
    return ev.name || '';
}

function backfillKrPublicHolidayBilingualNames(ev) {
    if (!ev || !isKrPublicHolidayImportedEvent(ev)) {
        return false;
    }
    let changed = false;
    if (!ev.nameKo && !ev.nameEn && ev.name) {
        const legacy = String(ev.name).trim();
        if (textContainsHangul(legacy)) {
            ev.nameKo = legacy;
            ev.nameEn = translateKrPublicHolidayName(legacy);
            changed = true;
        } else {
            ev.nameEn = legacy;
            changed = true;
        }
    }
    if (!ev.nameKo && ev.nameEn && textContainsHangul(ev.nameEn)) {
        ev.nameKo = String(ev.nameEn).trim();
        ev.nameEn = translateKrPublicHolidayName(ev.nameKo);
        changed = true;
    }
    if (ev.nameKo && !ev.nameEn) {
        ev.nameEn = (translateKrPublicHolidayName(ev.nameKo) || ev.nameKo).trim();
        changed = true;
    }
    if (!ev.nameKo && ev.nameEn) {
        changed = true;
    }
    const ko = (ev.nameKo || '').trim();
    const en = (ev.nameEn || (ko ? translateKrPublicHolidayName(ko) : '')).trim();
    if (ko) {
        ev.nameKo = ko;
    }
    if (en) {
        ev.nameEn = en;
    }
    const nextName = currentLanguage === 'ko' ? (ev.nameKo || ev.nameEn) : (ev.nameEn || ev.nameKo);
    if (nextName && ev.name !== nextName) {
        ev.name = nextName;
        changed = true;
    }
    return changed;
}

/** Keep calendar, print summary, and syllabus in sync with the active UI language. */
function refreshLocalizedEventDisplayNames() {
    if (!Array.isArray(appData.events)) {
        return;
    }
    let changed = false;
    appData.events.forEach((ev) => {
        if (backfillKrPublicHolidayBilingualNames(ev)) {
            changed = true;
        } else if (isKrPublicHolidayImportedEvent(ev) && (ev.nameKo || ev.nameEn)) {
            const nextName = currentLanguage === 'ko' ? (ev.nameKo || ev.nameEn) : (ev.nameEn || ev.nameKo);
            if (nextName && ev.name !== nextName) {
                ev.name = nextName;
                changed = true;
            }
        }
    });
    syncHolidaysFromEvents();
    if (changed) {
        saveData();
    }
}

function getEventById(eventId) {
    if (!eventId || !Array.isArray(appData.events)) {
        return null;
    }
    return appData.events.find((ev) => ev.id === eventId) || null;
}

function getLocalizedHolidayRecord(holiday) {
    if (!holiday) {
        return null;
    }
    const ev = getEventById(holiday.id);
    if (ev) {
        return { ...holiday, name: getEventDisplayName(ev) };
    }
    return { ...holiday, name: getEventDisplayName(holiday) };
}

function parseKrPublicHolidayYearJson(json, year) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('Invalid holiday data');
    }
    const rows = [];
    const yearPrefix = `${year}-`;
    Object.entries(json).forEach(([date, names]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(yearPrefix)) {
            return;
        }
        const list = Array.isArray(names) ? names : [names];
        const localName = list.map(n => String(n).trim()).filter(Boolean).join(' · ');
        if (!localName) {
            return;
        }
        rows.push({
            date,
            localName,
            name: translateKrPublicHolidayName(localName),
            types: ['Public']
        });
    });
    return dedupeKrHolidayRows(rows);
}

function dedupeKrHolidayRows(rows) {
    const seen = new Set();
    return rows.filter(row => {
        const key = `${row.date}\0${row.localName}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

async function fetchJsonFromFirstUrl(urls) {
    let lastError = null;
    for (const url of urls) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('Could not load holiday data');
}

async function fetchKrPublicHolidayRowsForYear(year) {
    const urls = [
        `${KR_PUBLIC_HOLIDAYS_JSON_BASE}/${year}.json`,
        `${KR_PUBLIC_HOLIDAYS_JSON_CDN}/${year}.json`
    ];
    const json = await fetchJsonFromFirstUrl(urls);
    const rows = parseKrPublicHolidayYearJson(json, year);
    if (rows.length === 0) {
        const err = new Error('YEAR_UNAVAILABLE');
        err.year = year;
        throw err;
    }
    return rows;
}

function getTermMonthCount() {
    const n = parseInt(appData.termMonthCount, 10);
    if (Number.isNaN(n)) {
        return SCHEDULE_CONFIG.defaultTermCalendarMonths;
    }
    return Math.min(
        SCHEDULE_CONFIG.maxTermMonthCount,
        Math.max(SCHEDULE_CONFIG.minTermMonthCount, n)
    );
}

function ensureUiState() {
    if (!appData.ui || typeof appData.ui !== 'object') {
        appData.ui = {};
    }
    if (!appData.ui.visibilityFilters) {
        appData.ui.visibilityFilters = { ...DEFAULT_VISIBILITY_FILTERS };
    }
    Object.keys(DEFAULT_VISIBILITY_FILTERS).forEach(key => {
        if (appData.ui.visibilityFilters[key] === undefined) {
            appData.ui.visibilityFilters[key] = DEFAULT_VISIBILITY_FILTERS[key];
        }
    });
    if (!appData.ui.printVisibility) {
        appData.ui.printVisibility = { ...DEFAULT_VISIBILITY_FILTERS };
    }
    Object.keys(DEFAULT_VISIBILITY_FILTERS).forEach(key => {
        if (appData.ui.printVisibility[key] === undefined) {
            appData.ui.printVisibility[key] = DEFAULT_VISIBILITY_FILTERS[key];
        }
    });
    if (appData.ui.topBarCollapsed === undefined) {
        appData.ui.topBarCollapsed = false;
    }
    if (appData.ui.activeTab === 'print') {
        appData.ui.activeTab = 'data';
    }
    if (!appData.ui.activeTab || !APP_TAB_IDS.includes(appData.ui.activeTab)) {
        appData.ui.activeTab = 'calendar';
    }
    if (!appData.ui.lessonFilters) {
        appData.ui.lessonFilters = { ...DEFAULT_LESSON_FILTERS };
    } else {
        appData.ui.lessonFilters = normalizeLessonFilters(appData.ui.lessonFilters);
    }
    if (typeof appData.ui.homeworkTabClassId !== 'string') {
        appData.ui.homeworkTabClassId = '';
    }
    if (typeof appData.ui.syllabusTabClassId !== 'string') {
        appData.ui.syllabusTabClassId = '';
    }
    if (typeof appData.ui.syllabusTabTemplateId !== 'string') {
        appData.ui.syllabusTabTemplateId = '';
    }
    if (!syllabusListSegment) {
        syllabusListSegment = 'classes';
    }
}

function getCustomSyllabusTemplates() {
    return Array.isArray(appData.customSyllabusTemplates) ? appData.customSyllabusTemplates : [];
}

function getSyllabusTemplatesApi() {
    return typeof window !== 'undefined' ? window.CCPSyllabusTemplates : null;
}

/** Match sticky month header / panels to the real global top bar height (avoids a gap below it). */
function syncAppChromeStickyTop() {
    const topBar = document.getElementById('appTopBar');
    if (!topBar) {
        return;
    }
    const height = Math.ceil(topBar.getBoundingClientRect().height);
    if (height > 0) {
        document.documentElement.style.setProperty('--app-chrome-sticky-top', `${height}px`);
    }
}

let appChromeStickyResizeObserver = null;

function initAppChromeStickyTop() {
    const topBar = document.getElementById('appTopBar');
    if (!topBar) {
        return;
    }
    syncAppChromeStickyTop();
    if (typeof ResizeObserver !== 'undefined') {
        if (appChromeStickyResizeObserver) {
            appChromeStickyResizeObserver.disconnect();
        }
        appChromeStickyResizeObserver = new ResizeObserver(() => syncAppChromeStickyTop());
        appChromeStickyResizeObserver.observe(topBar);
    }
    window.addEventListener('resize', syncAppChromeStickyTop);
}

function applyTopBarCollapsedState() {
    const bar = document.getElementById('calendarOptions') || document.getElementById('appTopBar');
    const toggle = document.getElementById('topBarToggle');
    if (!bar) {
        return;
    }
    ensureUiState();
    const collapsed = appData.ui.topBarCollapsed === true;
    bar.classList.toggle('calendar-options--collapsed', collapsed);
    bar.classList.toggle('app-top-bar--collapsed', collapsed);
    if (toggle) {
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.title = collapsed ? t('topBarExpand') : t('topBarCollapse');
        const label = toggle.querySelector('.top-bar-toggle-label');
        if (label) {
            label.textContent = collapsed ? t('topBarExpand') : t('topBarCollapse');
        }
    }
    updateTopBarCalendarLabel();
    requestAnimationFrame(syncAppChromeStickyTop);
}

function setTopBarCollapsed(collapsed) {
    ensureUiState();
    appData.ui.topBarCollapsed = collapsed === true;
    applyTopBarCollapsedState();
    saveData();
}

function updateTopBarCalendarLabel() {
    const labelEl = document.getElementById('topBarCalendarLabel');
    if (!labelEl) {
        return;
    }
    ensureUiState();
    const collapsed = appData.ui.topBarCollapsed === true;
    const name = (appData.calendarName || elements.calendarName?.value || '').trim();
    const showSubtitle = collapsed && name && !document.querySelector('.app-top-bar-title-block h1')?.textContent?.includes(name);
    if (showSubtitle) {
        labelEl.textContent = name;
        labelEl.hidden = false;
    } else {
        labelEl.textContent = '';
        labelEl.hidden = true;
    }
    requestAnimationFrame(syncAppChromeStickyTop);
}

function initTopBarToggle() {
    const toggle = document.getElementById('topBarToggle');
    if (!toggle) {
        return;
    }
    toggle.addEventListener('click', () => {
        ensureUiState();
        setTopBarCollapsed(!appData.ui.topBarCollapsed);
    });
    applyTopBarCollapsedState();
}

function normalizeEventType(type) {
    const valid = Object.values(EVENT_TYPES);
    return valid.includes(type) ? type : EVENT_TYPES.HOLIDAY;
}

function normalizeEvent(raw) {
    const type = normalizeEventType(raw.type || EVENT_TYPES.HOLIDAY);
    const defaults = EVENT_TYPE_DEFAULT_COLORS[type] || EVENT_TYPE_DEFAULT_COLORS.other;
    const isRange = raw.isRange === true
        || (type === EVENT_TYPES.EVALUATION_PERIOD && raw.startDate && raw.endDate);
    return {
        id: raw.id || generateId(),
        type,
        name: raw.name || '',
        notes: raw.notes || '',
        isRange,
        date: isRange ? null : (raw.date || null),
        startDate: isRange ? (raw.startDate || null) : null,
        endDate: isRange ? (raw.endDate || null) : null,
        bgColor: raw.bgColor || defaults.bg,
        textColor: raw.textColor || defaults.text,
        grades: Array.isArray(raw.grades) ? raw.grades : [],
        classNames: Array.isArray(raw.classNames) ? raw.classNames : [],
        sectionLevels: Array.isArray(raw.sectionLevels) ? raw.sectionLevels : [],
        allElementary: raw.allElementary === true,
        allMiddleSchool: raw.allMiddleSchool === true,
        linkedClassId: raw.linkedClassId || '',
        syllabusUnitId: raw.syllabusUnitId || '',
        nameKo: raw.nameKo ? String(raw.nameKo).trim() : '',
        nameEn: raw.nameEn ? String(raw.nameEn).trim() : ''
    };
}

function holidayFromEvent(ev) {
    return {
        id: ev.id,
        name: getEventDisplayName(ev),
        isRange: ev.isRange,
        date: ev.date,
        startDate: ev.startDate,
        endDate: ev.endDate,
        bgColor: ev.bgColor,
        textColor: ev.textColor,
        grades: ev.grades,
        classNames: ev.classNames,
        sectionLevels: ev.sectionLevels,
        allElementary: ev.allElementary,
        allMiddleSchool: ev.allMiddleSchool
    };
}

function syncHolidaysFromEvents() {
    if (!Array.isArray(appData.events)) {
        appData.events = [];
    }
    appData.holidays = appData.events
        .filter(ev => normalizeEventType(ev.type) === EVENT_TYPES.HOLIDAY)
        .map(holidayFromEvent);
}

function getCalendarEvents() {
    if (!Array.isArray(appData.events)) {
        appData.events = [];
    }
    return appData.events.map(normalizeEvent);
}

function eventHasAnyTargetFilter(event) {
    return holidayHasAnyTargetFilter(event);
}

function getEventAppliesToDescriptionParts(event) {
    return getHolidayAppliesToDescriptionParts(event);
}

function getEventDates(event) {
    return getHolidayDates(event);
}

function getEventTypeLabel(type) {
    const keyMap = {
        holiday: 'eventTypeHoliday',
        evaluation_deadline: 'eventTypeEvalDeadline',
        homework_deadline: 'eventTypeHomeworkDeadline',
        evaluation_period: 'eventTypeEvalPeriod',
        other: 'eventTypeOther'
    };
    return t(keyMap[type] || 'eventTypeOther');
}

function isVisibilityFilterOn(typeKey) {
    ensureUiState();
    const filters = appData.ui.visibilityFilters;
    if (typeKey === 'lessons') {
        return filters.lessons !== false;
    }
    if (typeKey === 'holiday') {
        return filters.holidays !== false;
    }
    return filters[typeKey] !== false;
}

function isPrintVisibilityOn(typeKey) {
    ensureUiState();
    const filters = appData.ui.printVisibility;
    if (typeKey === 'lessons') {
        return filters.lessons !== false;
    }
    if (typeKey === 'holiday') {
        return filters.holidays !== false;
    }
    return filters[typeKey] !== false;
}

/** Screen visibility, or print visibility while building a calendar print snapshot. */
function isCalendarItemVisible(typeKey) {
    if (calendarRenderForPrint) {
        return isPrintVisibilityOn(typeKey);
    }
    return isVisibilityFilterOn(typeKey);
}

function readVisibilityFiltersFromDom() {
    const filters = { ...DEFAULT_VISIBILITY_FILTERS };
    VISIBILITY_FILTER_FIELDS.forEach(({ key, uiId }) => {
        const el = document.getElementById(uiId);
        if (el) filters[key] = el.checked;
    });
    return filters;
}

function applyVisibilityFiltersToDom() {
    ensureUiState();
    const f = appData.ui.visibilityFilters;
    VISIBILITY_FILTER_FIELDS.forEach(({ key, uiId }) => {
        const el = document.getElementById(uiId);
        if (el) el.checked = f[key] !== false;
    });
}

function applyPrintVisibilityToDom() {
    ensureUiState();
    const f = appData.ui.printVisibility;
    VISIBILITY_FILTER_FIELDS.forEach(({ key, printId }) => {
        const el = document.getElementById(printId);
        if (el) el.checked = f[key] !== false;
    });
}

function pruneLessonFiltersToScheduledOptions() {
    ensureUiState();
    const groups = getLessonFilterOptionGroups();
    const validByKey = {
        classIds: new Set(groups.classes.map(o => o.value)),
        grades: new Set(groups.grades.map(o => o.value)),
        levelPresets: new Set(groups.levels.map(o => o.value)),
        classTypeIds: new Set(groups.types.map(o => o.value)),
        periods: new Set(groups.periods.map(o => o.value)),
        books: new Set(groups.books.map(o => o.value))
    };
    const f = appData.ui.lessonFilters;
    let changed = false;
    LESSON_FILTER_DIMENSIONS.forEach(key => {
        if (!Array.isArray(f[key])) {
            return;
        }
        if (f[key].length === 0) {
            return;
        }
        const pruned = f[key].filter(v => validByKey[key].has(v));
        if (pruned.length !== f[key].length) {
            changed = true;
        }
        f[key] = pruned.length ? pruned : null;
    });
    return changed;
}

function getLessonFilterOptionGroups() {
    const classes = getClassesScheduledOnCalendar();
    const grades = new Map();
    const levels = new Map();
    const types = new Map();
    const periods = new Set();
    const books = new Map();

    classes.forEach(classData => {
        const gradeKey = (classData.grade || '').trim() || LESSON_FILTER_NO_GRADE;
        grades.set(gradeKey, gradeKey === LESSON_FILTER_NO_GRADE
            ? t('lessonFilterNoGrade')
            : classData.grade.trim());

        const levelKey = (classData.levelPreset || '').trim() || LESSON_FILTER_NO_LEVEL;
        levels.set(levelKey, levelKey === LESSON_FILTER_NO_LEVEL
            ? t('lessonFilterNoLevel')
            : getClassLevelDisplay(classData));

        const typeKey = (classData.classTypeId || '').trim() || LESSON_FILTER_NO_TYPE;
        const typeDef = typeKey !== LESSON_FILTER_NO_TYPE
            ? getClassTypeDefinitionById(typeKey)
            : null;
        types.set(typeKey, typeDef
            ? getClassTypeOptionLabel(typeDef)
            : t('lessonFilterNoType'));

        getEffectiveClassPeriodValues(classData).forEach(p => periods.add(p));

        const bookKey = (classData.book || '').trim() || LESSON_FILTER_NO_BOOK;
        books.set(bookKey, bookKey === LESSON_FILTER_NO_BOOK
            ? t('lessonFilterNoBook')
            : classData.book.trim());
    });

    return {
        classes: classes.map(c => ({
            value: c.id,
            label: formatClassLabelWithPeriod(c)
        })),
        grades: [...grades.entries()].map(([value, label]) => ({ value, label })),
        levels: [...levels.entries()].map(([value, label]) => ({ value, label })),
        types: [...types.entries()].map(([value, label]) => ({ value, label })),
        periods: [...periods].sort((a, b) => a - b).map(p => ({
            value: String(p),
            label: String(p)
        })),
        books: [...books.entries()].map(([value, label]) => ({ value, label }))
    };
}

function readLessonFilterSectionFromDom(filterKey) {
    const boxes = document.querySelectorAll(
        `#lessonFilterPopoverBody input[data-lesson-filter="${filterKey}"]`
    );
    if (!boxes.length) {
        return null;
    }
    const checked = [];
    boxes.forEach(cb => {
        if (cb.checked) {
            checked.push(cb.value);
        }
    });
    if (checked.length === boxes.length) {
        return null;
    }
    if (checked.length === 0) {
        return [];
    }
    return checked;
}

function readLessonFiltersFromPopoverDom() {
    return normalizeLessonFilters({
        classIds: readLessonFilterSectionFromDom('classIds'),
        grades: readLessonFilterSectionFromDom('grades'),
        levelPresets: readLessonFilterSectionFromDom('levelPresets'),
        classTypeIds: readLessonFilterSectionFromDom('classTypeIds'),
        periods: readLessonFilterSectionFromDom('periods'),
        books: readLessonFilterSectionFromDom('books')
    });
}

function applyLessonFiltersToPopoverDom() {
    ensureUiState();
    const f = appData.ui.lessonFilters;
    document.querySelectorAll('#lessonFilterPopoverBody input[data-lesson-filter]').forEach(cb => {
        const key = cb.getAttribute('data-lesson-filter');
        if (f.hideAllLessons) {
            cb.checked = false;
            return;
        }
        const values = f[key];
        if (values === null || values === undefined) {
            cb.checked = true;
        } else if (Array.isArray(values) && values.length === 0) {
            cb.checked = false;
        } else {
            cb.checked = values.includes(cb.value);
        }
    });
}

function normalizeLessonFilterSearchQuery(query) {
    return String(query || '').trim().toLocaleLowerCase();
}

function lessonFilterLabelMatchesQuery(label, query) {
    if (!query) {
        return true;
    }
    return String(label || '').toLocaleLowerCase().includes(query);
}

function applyLessonFilterSearch() {
    const input = document.getElementById('lessonFilterSearch');
    const emptyMsg = document.getElementById('lessonFilterSearchEmpty');
    const body = document.getElementById('lessonFilterPopoverBody');
    if (!body) {
        return;
    }
    const query = normalizeLessonFilterSearchQuery(input ? input.value : '');
    let anyChipVisible = false;

    body.querySelectorAll('.lesson-filter-section').forEach(section => {
        let sectionMatches = 0;
        section.querySelectorAll('.lesson-filter-chip').forEach(chip => {
            const label = chip.querySelector('span')?.textContent || '';
            const match = lessonFilterLabelMatchesQuery(label, query);
            chip.hidden = !match;
            if (match) {
                sectionMatches += 1;
            }
        });
        section.hidden = sectionMatches === 0;
        if (sectionMatches > 0) {
            anyChipVisible = true;
        }
    });

    if (emptyMsg) {
        emptyMsg.hidden = !query || anyChipVisible;
    }
    body.classList.toggle('lesson-filter-body--search-empty', !!query && !anyChipVisible);
}

function buildLessonFilterSectionHtml(titleKey, filterKey, options) {
    if (!options.length) {
        return '';
    }
    const chips = options.map(opt => `
        <label class="checkbox-label lesson-filter-chip">
            <input type="checkbox" data-lesson-filter="${filterKey}" value="${escapeAttr(opt.value)}" checked>
            <span>${escapeHtml(opt.label)}</span>
        </label>`).join('');
    return `
        <section class="lesson-filter-section" data-filter-key="${filterKey}">
            <h4 class="lesson-filter-section-title">${escapeHtml(t(titleKey))}</h4>
            <div class="lesson-filter-chip-grid">${chips}</div>
        </section>`;
}

function renderLessonFilterPopoverBody() {
    const body = document.getElementById('lessonFilterPopoverBody');
    if (!body) {
        return;
    }
    const searchEl = document.getElementById('lessonFilterSearch');
    const prevQuery = searchEl ? searchEl.value : '';
    if (pruneLessonFiltersToScheduledOptions()) {
        saveData();
    }
    const groups = getLessonFilterOptionGroups();
    if (!groups.classes.length) {
        body.innerHTML = `<p class="lesson-filter-empty-calendar">${escapeHtml(t('lessonFilterNoClassesOnCalendar'))}</p>`;
        applyLessonFilterSearch();
        return;
    }
    body.innerHTML = [
        buildLessonFilterSectionHtml('lessonFilterSectionClasses', 'classIds', groups.classes),
        buildLessonFilterSectionHtml('lessonFilterSectionGrade', 'grades', groups.grades),
        buildLessonFilterSectionHtml('lessonFilterSectionLevel', 'levelPresets', groups.levels),
        buildLessonFilterSectionHtml('lessonFilterSectionType', 'classTypeIds', groups.types),
        buildLessonFilterSectionHtml('lessonFilterSectionPeriod', 'periods', groups.periods),
        buildLessonFilterSectionHtml('lessonFilterSectionBook', 'books', groups.books)
    ].join('');
    applyLessonFiltersToPopoverDom();
    if (searchEl) {
        searchEl.value = prevQuery;
    }
    applyLessonFilterSearch();
}

function updateLessonFilterStatusText() {
    const status = document.getElementById('lessonFilterStatus');
    if (!status) {
        return;
    }
    const total = countScheduledClassesOnCalendar();
    const visible = countVisibleClassesForLessonFilter();
    status.textContent = t('lessonFilterStatus')
        .replace('{visible}', String(visible))
        .replace('{total}', String(total));
}

function updateLessonFilterButtonLabel() {
    const btn = document.getElementById('lessonFilterBtn');
    if (!btn) {
        return;
    }
    const total = countScheduledClassesOnCalendar();
    const visible = countVisibleClassesForLessonFilter();
    if (isLessonFilterActive() && total > 0) {
        btn.textContent = t('lessonFilterBtnActive')
            .replace('{visible}', String(visible))
            .replace('{total}', String(total));
        btn.classList.add('lesson-filter-btn--active');
    } else {
        btn.textContent = t('lessonFilterBtn');
        btn.classList.remove('lesson-filter-btn--active');
    }
}

function updatePrintLessonFilterHint() {
    const hint = document.getElementById('printLessonFilterHint');
    if (!hint) {
        return;
    }
    if (!isLessonFilterActive() || countScheduledClassesOnCalendar() === 0) {
        hint.hidden = true;
        return;
    }
    hint.hidden = false;
    hint.textContent = t('printLessonFilterActive')
        .replace('{visible}', String(countVisibleClassesForLessonFilter()))
        .replace('{total}', String(countScheduledClassesOnCalendar()));
}

function positionLessonFilterPopover() {
    const popover = document.getElementById('lessonFilterPopover');
    const btn = document.getElementById('lessonFilterBtn');
    if (!popover || !btn) {
        return;
    }
    const rect = btn.getBoundingClientRect();
    const panel = popover.querySelector('.lesson-filter-popover-panel');
    const margin = 8;
    let top = rect.bottom + margin;
    let left = rect.left;
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    if (panel) {
        const panelRect = panel.getBoundingClientRect();
        if (left + panelRect.width > window.innerWidth - margin) {
            left = Math.max(margin, window.innerWidth - panelRect.width - margin);
            popover.style.left = `${left}px`;
        }
        if (top + panelRect.height > window.innerHeight - margin) {
            top = Math.max(margin, rect.top - panelRect.height - margin);
            popover.style.top = `${top}px`;
        }
    }
}

function openLessonFilterPopover() {
    const popover = document.getElementById('lessonFilterPopover');
    const btn = document.getElementById('lessonFilterBtn');
    const searchEl = document.getElementById('lessonFilterSearch');
    if (!popover || !btn) {
        return;
    }
    if (searchEl) {
        searchEl.value = '';
    }
    renderLessonFilterPopoverBody();
    updateLessonFilterStatusText();
    popover.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    positionLessonFilterPopover();
    if (searchEl) {
        requestAnimationFrame(() => searchEl.focus());
    }
}

function closeLessonFilterPopover() {
    const popover = document.getElementById('lessonFilterPopover');
    const btn = document.getElementById('lessonFilterBtn');
    if (!popover) {
        return;
    }
    popover.hidden = true;
    if (btn) {
        btn.setAttribute('aria-expanded', 'false');
    }
}

function isLessonFilterPopoverOpen() {
    const popover = document.getElementById('lessonFilterPopover');
    return popover && !popover.hidden;
}

function commitLessonFiltersFromPopover() {
    ensureUiState();
    const filters = readLessonFiltersFromPopoverDom();
    const inputs = document.querySelectorAll('#lessonFilterPopoverBody input[data-lesson-filter]');
    let checkedCount = 0;
    inputs.forEach(cb => {
        if (cb.checked) {
            checkedCount += 1;
        }
    });
    if (inputs.length > 0 && checkedCount === 0) {
        filters.hideAllLessons = true;
        LESSON_FILTER_DIMENSIONS.forEach(key => {
            filters[key] = [];
        });
    } else {
        filters.hideAllLessons = false;
    }
    appData.ui.lessonFilters = filters;
    updateLessonFilterStatusText();
    updateLessonFilterButtonLabel();
    updatePrintLessonFilterHint();
    saveData();
    renderCalendar();
}

function resetLessonFilters() {
    ensureUiState();
    appData.ui.lessonFilters = { ...DEFAULT_LESSON_FILTERS };
    if (isLessonFilterPopoverOpen()) {
        applyLessonFiltersToPopoverDom();
        updateLessonFilterStatusText();
    }
    updateLessonFilterButtonLabel();
    updatePrintLessonFilterHint();
    saveData();
    renderCalendar();
}

/** After import: expanded calendar toolbar, show all classes, lessons visible on calendar. */
function resetCalendarClassVisibilityAfterImport() {
    ensureUiState();
    appData.ui.topBarCollapsed = false;
    appData.ui.lessonFilters = { ...DEFAULT_LESSON_FILTERS };
    appData.ui.visibilityFilters = { ...DEFAULT_VISIBILITY_FILTERS };
    applyTopBarCollapsedState();
    applyVisibilityFiltersToDom();
    if (isLessonFilterPopoverOpen()) {
        renderLessonFilterPopoverBody();
        updateLessonFilterStatusText();
    }
    updateLessonFilterButtonLabel();
    updatePrintLessonFilterHint();
}

function setAllLessonFilterCheckboxesInPopover(checked) {
    document.querySelectorAll('#lessonFilterPopoverBody input[data-lesson-filter]').forEach(cb => {
        cb.checked = checked;
    });
    commitLessonFiltersFromPopover();
}

function selectAllLessonFiltersInPopover() {
    setAllLessonFilterCheckboxesInPopover(true);
}

function clearAllLessonFiltersInPopover() {
    setAllLessonFilterCheckboxesInPopover(false);
}

// ============================================
// Event applicability filter (event editor — same UX as lesson filter)
// ============================================
const EMPTY_EVENT_APPLICABILITY = {
    grades: [],
    classNames: [],
    sectionLevels: [],
    allElementary: false,
    allMiddleSchool: false
};
let eventApplicabilityDraft = { ...EMPTY_EVENT_APPLICABILITY };

function getEventApplicabilityOptionGroups() {
    const seenNames = new Set();
    const classes = [];
    getClassesInDisplayOrder().forEach(classData => {
        const name = classData.name;
        if (!name || seenNames.has(name)) {
            return;
        }
        seenNames.add(name);
        classes.push({
            value: name,
            label: formatClassLabelWithPeriod(classData)
        });
    });
    return {
        classes,
        grades: SCHOOL_GRADE_OPTIONS.map(code => ({ value: code, label: code })),
        sectionLevels: getAllSimsonLevels().map(level => ({
            value: level.id,
            label: level.name
        })),
        schoolBands: [
            { value: 'allElementary', label: t('allElementaryLabel') },
            { value: 'allMiddleSchool', label: t('allMiddleSchoolLabel') }
        ]
    };
}

function getDefaultAllSelectedEventApplicability() {
    const groups = getEventApplicabilityOptionGroups();
    return {
        grades: groups.grades.map(g => g.value),
        classNames: groups.classes.map(c => c.value),
        sectionLevels: groups.sectionLevels.map(s => s.value),
        allElementary: true,
        allMiddleSchool: true
    };
}

function countEventApplicabilityOptions() {
    const groups = getEventApplicabilityOptionGroups();
    return groups.classes.length
        + groups.grades.length
        + groups.sectionLevels.length
        + groups.schoolBands.length;
}

function countEventApplicabilitySelected(draft = eventApplicabilityDraft) {
    return (draft.grades?.length || 0)
        + (draft.classNames?.length || 0)
        + (draft.sectionLevels?.length || 0)
        + (draft.allElementary ? 1 : 0)
        + (draft.allMiddleSchool ? 1 : 0);
}

function loadEventApplicabilityDraftFromHoliday(holidayData) {
    if (!holidayData || !holidayHasAnyTargetFilter(holidayData)) {
        eventApplicabilityDraft = { ...EMPTY_EVENT_APPLICABILITY };
        return;
    }
    eventApplicabilityDraft = {
        grades: [...(holidayData.grades || [])],
        classNames: [...(holidayData.classNames || [])],
        sectionLevels: [...(holidayData.sectionLevels || [])],
        allElementary: holidayData.allElementary === true,
        allMiddleSchool: holidayData.allMiddleSchool === true
    };
}

function readEventApplicabilityFromPopoverDom() {
    const draft = { ...EMPTY_EVENT_APPLICABILITY };
    document.querySelectorAll('#eventApplicabilityPopoverBody input[data-event-filter]').forEach(cb => {
        if (!cb.checked) {
            return;
        }
        const key = cb.getAttribute('data-event-filter');
        const val = cb.value;
        if (key === 'schoolBand') {
            if (val === 'allElementary') {
                draft.allElementary = true;
            } else if (val === 'allMiddleSchool') {
                draft.allMiddleSchool = true;
            }
            return;
        }
        if (key === 'grades' || key === 'classNames' || key === 'sectionLevels') {
            draft[key].push(val);
        }
    });
    return draft;
}

function applyEventApplicabilityToPopoverDom() {
    const d = eventApplicabilityDraft;
    document.querySelectorAll('#eventApplicabilityPopoverBody input[data-event-filter]').forEach(cb => {
        const key = cb.getAttribute('data-event-filter');
        const val = cb.value;
        if (key === 'schoolBand') {
            cb.checked = val === 'allElementary' ? d.allElementary : d.allMiddleSchool;
            return;
        }
        const arr = d[key];
        cb.checked = Array.isArray(arr) && arr.includes(val);
    });
}

function applyEventApplicabilitySearch() {
    const input = document.getElementById('eventApplicabilitySearch');
    const emptyMsg = document.getElementById('eventApplicabilitySearchEmpty');
    const body = document.getElementById('eventApplicabilityPopoverBody');
    if (!body) {
        return;
    }
    const query = normalizeLessonFilterSearchQuery(input ? input.value : '');
    let anyChipVisible = false;

    body.querySelectorAll('.lesson-filter-section').forEach(section => {
        let sectionMatches = 0;
        section.querySelectorAll('.lesson-filter-chip').forEach(chip => {
            const label = chip.querySelector('span')?.textContent || '';
            const match = lessonFilterLabelMatchesQuery(label, query);
            chip.hidden = !match;
            if (match) {
                sectionMatches += 1;
            }
        });
        section.hidden = sectionMatches === 0;
        if (sectionMatches > 0) {
            anyChipVisible = true;
        }
    });

    if (emptyMsg) {
        emptyMsg.hidden = !query || anyChipVisible;
    }
    body.classList.toggle('lesson-filter-body--search-empty', !!query && !anyChipVisible);
}

function buildEventApplicabilitySectionHtml(titleKey, filterKey, options) {
    if (!options.length) {
        return '';
    }
    const chips = options.map(opt => `
        <label class="checkbox-label lesson-filter-chip">
            <input type="checkbox" data-event-filter="${filterKey}" value="${escapeAttr(opt.value)}">
            <span>${escapeHtml(opt.label)}</span>
        </label>`).join('');
    return `
        <section class="lesson-filter-section" data-filter-key="${filterKey}">
            <h4 class="lesson-filter-section-title">${escapeHtml(t(titleKey))}</h4>
            <div class="lesson-filter-chip-grid">${chips}</div>
        </section>`;
}

function renderEventApplicabilityPopoverBody() {
    const body = document.getElementById('eventApplicabilityPopoverBody');
    if (!body) {
        return;
    }
    const searchEl = document.getElementById('eventApplicabilitySearch');
    const prevQuery = searchEl ? searchEl.value : '';
    const groups = getEventApplicabilityOptionGroups();
    if (!groups.classes.length && !groups.grades.length) {
        body.innerHTML = `<p class="lesson-filter-empty-calendar">${escapeHtml(t('eventApplicabilityNoOptions'))}</p>`;
        applyEventApplicabilitySearch();
        return;
    }
    body.innerHTML = [
        buildEventApplicabilitySectionHtml('eventApplicabilitySectionSchoolBand', 'schoolBand', groups.schoolBands),
        buildEventApplicabilitySectionHtml('eventApplicabilitySectionLevel', 'sectionLevels', groups.sectionLevels),
        buildEventApplicabilitySectionHtml('lessonFilterSectionGrade', 'grades', groups.grades),
        buildEventApplicabilitySectionHtml('lessonFilterSectionClasses', 'classNames', groups.classes)
    ].join('');
    applyEventApplicabilityToPopoverDom();
    if (searchEl) {
        searchEl.value = prevQuery;
    }
    applyEventApplicabilitySearch();
}

function updateEventApplicabilityStatusText() {
    const status = document.getElementById('eventApplicabilityFilterStatus');
    if (!status) {
        return;
    }
    const total = countEventApplicabilityOptions();
    const selected = countEventApplicabilitySelected();
    status.textContent = t('eventApplicabilityFilterStatus')
        .replace('{selected}', String(selected))
        .replace('{total}', String(total));
}

function updateEventApplicabilityButtonLabel() {
    const btn = document.getElementById('eventApplicabilityFilterBtn');
    if (!btn) {
        return;
    }
    const total = countEventApplicabilityOptions();
    const selected = countEventApplicabilitySelected();
    if (total > 0 && selected > 0 && selected < total) {
        btn.textContent = t('eventApplicabilityFilterBtnActive')
            .replace('{selected}', String(selected))
            .replace('{total}', String(total));
        btn.classList.add('lesson-filter-btn--active');
    } else {
        btn.textContent = t('eventApplicabilityFilterBtn');
        btn.classList.remove('lesson-filter-btn--active');
    }
}

function updateEventApplicabilitySummaryText() {
    const el = document.getElementById('eventApplicabilitySummary');
    if (!el) {
        return;
    }
    if (elements.holidayAllClasses && elements.holidayAllClasses.checked) {
        el.hidden = true;
        return;
    }
    const parts = getHolidayAppliesToDescriptionParts(eventApplicabilityDraft);
    if (parts.length === 0) {
        el.textContent = t('eventApplicabilitySummaryEmpty');
    } else {
        el.textContent = parts.join(' · ');
    }
    el.hidden = false;
}

function syncEventApplicabilityUiFromDraft() {
    const row = document.getElementById('eventApplicabilityFilterRow');
    const allClasses = elements.holidayAllClasses && elements.holidayAllClasses.checked;
    if (row) {
        row.style.display = allClasses ? 'none' : 'flex';
    }
    updateEventApplicabilityButtonLabel();
    updateEventApplicabilitySummaryText();
    if (isEventApplicabilityPopoverOpen()) {
        applyEventApplicabilityToPopoverDom();
        updateEventApplicabilityStatusText();
    }
}

function positionEventApplicabilityPopover() {
    const popover = document.getElementById('eventApplicabilityPopover');
    const btn = document.getElementById('eventApplicabilityFilterBtn');
    if (!popover || !btn) {
        return;
    }
    const rect = btn.getBoundingClientRect();
    const panel = popover.querySelector('.lesson-filter-popover-panel');
    const margin = 8;
    let top = rect.bottom + margin;
    let left = rect.left;
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    if (panel) {
        const panelRect = panel.getBoundingClientRect();
        if (left + panelRect.width > window.innerWidth - margin) {
            left = Math.max(margin, window.innerWidth - panelRect.width - margin);
            popover.style.left = `${left}px`;
        }
        if (top + panelRect.height > window.innerHeight - margin) {
            top = Math.max(margin, rect.top - panelRect.height - margin);
            popover.style.top = `${top}px`;
        }
    }
}

function openEventApplicabilityPopover() {
    const popover = document.getElementById('eventApplicabilityPopover');
    const btn = document.getElementById('eventApplicabilityFilterBtn');
    const searchEl = document.getElementById('eventApplicabilitySearch');
    if (!popover || !btn) {
        return;
    }
    if (searchEl) {
        searchEl.value = '';
    }
    renderEventApplicabilityPopoverBody();
    updateEventApplicabilityStatusText();
    popover.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    positionEventApplicabilityPopover();
    if (searchEl) {
        requestAnimationFrame(() => searchEl.focus());
    }
}

function closeEventApplicabilityPopover() {
    const popover = document.getElementById('eventApplicabilityPopover');
    const btn = document.getElementById('eventApplicabilityFilterBtn');
    if (!popover) {
        return;
    }
    popover.hidden = true;
    if (btn) {
        btn.setAttribute('aria-expanded', 'false');
    }
}

function isEventApplicabilityPopoverOpen() {
    const popover = document.getElementById('eventApplicabilityPopover');
    return popover && !popover.hidden;
}

function commitEventApplicabilityFromPopover() {
    eventApplicabilityDraft = readEventApplicabilityFromPopoverDom();
    updateEventApplicabilityStatusText();
    updateEventApplicabilityButtonLabel();
    updateEventApplicabilitySummaryText();
}

function setAllEventApplicabilityCheckboxesInPopover(checked) {
    document.querySelectorAll('#eventApplicabilityPopoverBody input[data-event-filter]').forEach(cb => {
        cb.checked = checked;
    });
    commitEventApplicabilityFromPopover();
}

function selectAllEventApplicabilityInPopover() {
    setAllEventApplicabilityCheckboxesInPopover(true);
}

function clearAllEventApplicabilityInPopover() {
    setAllEventApplicabilityCheckboxesInPopover(false);
}

function setupEventApplicabilityFilterUi() {
    const btn = document.getElementById('eventApplicabilityFilterBtn');
    let popover = document.getElementById('eventApplicabilityPopover');
    const closeBtn = document.getElementById('eventApplicabilityFilterCloseBtn');
    const selectAllBtn = document.getElementById('eventApplicabilitySelectAllBtn');
    const clearAllBtn = document.getElementById('eventApplicabilityClearAllBtn');
    const body = document.getElementById('eventApplicabilityPopoverBody');
    if (!btn || !popover || !body) {
        return;
    }
    if (popover.parentElement !== document.body) {
        document.body.appendChild(popover);
    }

    if (!btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isEventApplicabilityPopoverOpen()) {
                closeEventApplicabilityPopover();
            } else {
                openEventApplicabilityPopover();
            }
        });
    }
    if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.dataset.bound = '1';
        closeBtn.addEventListener('click', () => closeEventApplicabilityPopover());
    }
    if (selectAllBtn && !selectAllBtn.dataset.bound) {
        selectAllBtn.dataset.bound = '1';
        selectAllBtn.addEventListener('click', () => selectAllEventApplicabilityInPopover());
    }
    if (clearAllBtn && !clearAllBtn.dataset.bound) {
        clearAllBtn.dataset.bound = '1';
        clearAllBtn.addEventListener('click', () => clearAllEventApplicabilityInPopover());
    }
    if (!body.dataset.bound) {
        body.dataset.bound = '1';
        body.addEventListener('change', (e) => {
            if (e.target.matches('input[data-event-filter]')) {
                commitEventApplicabilityFromPopover();
            }
        });
    }
    const searchEl = document.getElementById('eventApplicabilitySearch');
    if (searchEl && !searchEl.dataset.bound) {
        searchEl.dataset.bound = '1';
        searchEl.addEventListener('input', () => applyEventApplicabilitySearch());
        searchEl.addEventListener('search', () => applyEventApplicabilitySearch());
    }
    if (!document.body.dataset.eventApplicabilityDismissBound) {
        document.body.dataset.eventApplicabilityDismissBound = '1';
        document.addEventListener('click', (e) => {
            if (!isEventApplicabilityPopoverOpen()) {
                return;
            }
            const pop = document.getElementById('eventApplicabilityPopover');
            const filterBtn = document.getElementById('eventApplicabilityFilterBtn');
            if (pop && pop.contains(e.target)) {
                return;
            }
            if (filterBtn && filterBtn.contains(e.target)) {
                return;
            }
            closeEventApplicabilityPopover();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isEventApplicabilityPopoverOpen()) {
                closeEventApplicabilityPopover();
            }
        });
        window.addEventListener('resize', () => {
            if (isEventApplicabilityPopoverOpen()) {
                positionEventApplicabilityPopover();
            }
        });
    }
}

function setPrintCalendarVisibilityCheckboxes(checked) {
    ensureUiState();
    const filters = { ...appData.ui.printVisibility };
    VISIBILITY_FILTER_FIELDS.forEach(({ key, printId }) => {
        const el = document.getElementById(printId);
        if (el) {
            el.checked = checked;
            filters[key] = checked;
        }
    });
    appData.ui.printVisibility = filters;
    saveData();
}

function setPrintSummaryOptionCheckboxes(checked) {
    PRINT_SUMMARY_OPTION_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.checked = checked;
        }
    });
}

function setupLessonFilterUi() {
    const btn = document.getElementById('lessonFilterBtn');
    let popover = document.getElementById('lessonFilterPopover');
    const closeBtn = document.getElementById('lessonFilterCloseBtn');
    const selectAllBtn = document.getElementById('lessonFilterSelectAllBtn');
    const clearAllBtn = document.getElementById('lessonFilterClearAllBtn');
    const resetBtn = document.getElementById('lessonFilterResetBtn');
    const body = document.getElementById('lessonFilterPopoverBody');
    if (!btn || !popover || !body) {
        return;
    }
    if (popover.parentElement !== document.body) {
        document.body.appendChild(popover);
    }

    if (!btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isLessonFilterPopoverOpen()) {
                closeLessonFilterPopover();
            } else {
                openLessonFilterPopover();
            }
        });
    }
    if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.dataset.bound = '1';
        closeBtn.addEventListener('click', () => closeLessonFilterPopover());
    }
    if (selectAllBtn && !selectAllBtn.dataset.bound) {
        selectAllBtn.dataset.bound = '1';
        selectAllBtn.addEventListener('click', () => selectAllLessonFiltersInPopover());
    }
    if (clearAllBtn && !clearAllBtn.dataset.bound) {
        clearAllBtn.dataset.bound = '1';
        clearAllBtn.addEventListener('click', () => clearAllLessonFiltersInPopover());
    }
    if (resetBtn && !resetBtn.dataset.bound) {
        resetBtn.dataset.bound = '1';
        resetBtn.addEventListener('click', () => resetLessonFilters());
    }
    if (!body.dataset.bound) {
        body.dataset.bound = '1';
        body.addEventListener('change', (e) => {
            if (e.target.matches('input[data-lesson-filter]')) {
                commitLessonFiltersFromPopover();
            }
        });
    }
    const searchEl = document.getElementById('lessonFilterSearch');
    if (searchEl && !searchEl.dataset.bound) {
        searchEl.dataset.bound = '1';
        searchEl.addEventListener('input', () => applyLessonFilterSearch());
        searchEl.addEventListener('search', () => applyLessonFilterSearch());
    }
    if (!document.body.dataset.lessonFilterDismissBound) {
        document.body.dataset.lessonFilterDismissBound = '1';
        document.addEventListener('click', (e) => {
            if (!isLessonFilterPopoverOpen()) {
                return;
            }
            const target = e.target;
            if (popover.contains(target) || btn.contains(target)) {
                return;
            }
            closeLessonFilterPopover();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isLessonFilterPopoverOpen()) {
                closeLessonFilterPopover();
            }
        });
        window.addEventListener('resize', () => {
            if (isLessonFilterPopoverOpen()) {
                positionLessonFilterPopover();
            }
        });
    }
    updateLessonFilterButtonLabel();
    updatePrintLessonFilterHint();
}

/** Mirror toolbar visibility onto print-option checkboxes (both directions of on/off). */
function syncPrintVisibilityFromUi() {
    ensureUiState();
    const filters = readVisibilityFiltersFromDom();
    appData.ui.visibilityFilters = { ...filters };
    appData.ui.printVisibility = { ...filters };
    VISIBILITY_FILTER_FIELDS.forEach(({ key, uiId, printId }) => {
        const uiEl = document.getElementById(uiId);
        const printEl = document.getElementById(printId);
        if (uiEl && printEl) {
            printEl.checked = uiEl.checked;
        }
    });
}

function buildDayIndex() {
    const monthCount = getTermMonthCount();
    const [year, month] = appData.termStart.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);

    const scheduledLessons = {};
    getClassesForCalendarAndPrintSummary().forEach(classData => {
        const { lessons } = calculateLessonDates(classData);
        lessons.forEach(lesson => {
            const dateStr = formatDateISO(lesson.date);
            if (!scheduledLessons[dateStr]) {
                scheduledLessons[dateStr] = [];
            }
            scheduledLessons[dateStr].push({ classData, lesson });
        });
    });
    Object.keys(scheduledLessons).forEach(dateStr => {
        const d = parseISODateLocal(dateStr);
        const weekday = d ? d.getDay() : undefined;
        scheduledLessons[dateStr].sort((a, b) => compareClassesForDisplayOrder(a.classData, b.classData, weekday));
    });

    const eventsByDate = {};
    getCalendarEvents().forEach(ev => {
        getEventDates(ev).forEach(dateStr => {
            if (!eventsByDate[dateStr]) {
                eventsByDate[dateStr] = [];
            }
            eventsByDate[dateStr].push(ev);
        });
    });

    return { scheduledLessons, eventsByDate, monthCount, startDate };
}

function getTermDateRangeISO() {
    if (!appData.termStart) {
        return { start: '', end: '' };
    }
    const [y, m] = appData.termStart.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const endD = computeTermEndDateFromStart(start, getTermMonthCount());
    const end = endD ? formatDateForInput(endD) : start;
    return { start, end };
}

function getYearsForCurrentTerm() {
    const { start, end } = getTermDateRangeISO();
    if (!start) {
        return [new Date().getFullYear()];
    }
    const years = new Set();
    years.add(parseInt(start.slice(0, 4), 10));
    if (end) {
        years.add(parseInt(end.slice(0, 4), 10));
    }
    return [...years].sort();
}

function addOneDayISO(dateStr) {
    const d = parseISODateLocal(dateStr);
    d.setDate(d.getDate() + 1);
    return formatDateForInput(d);
}

function syncHolidayRangeEndFromStart() {
    if (!elements.holidayStartDate || !elements.holidayEndDate) {
        return;
    }
    const start = elements.holidayStartDate.value;
    if (!start) {
        return;
    }
    const end = elements.holidayEndDate.value;
    if (!end || end <= start) {
        elements.holidayEndDate.value = addOneDayISO(start);
    }
}

function applyDefaultClassDatesForNewClass(defaultStartDate) {
    const start = defaultStartDate || getTermDateRangeISO().start;
    if (!start || !elements.classStartDate) {
        return;
    }
    elements.classStartDate.value = start;
    if (elements.classUseAutoTermEnd && elements.classUseAutoTermEnd.checked) {
        syncClassTermEndAndBooks();
    }
}

let calendarContextMenuDate = null;

function hideCalendarContextMenu() {
    const menu = document.getElementById('calendarContextMenu');
    if (menu) {
        menu.hidden = true;
    }
    calendarContextMenuDate = null;
}

function showCalendarContextMenu(clientX, clientY, dateStr) {
    let menu = document.getElementById('calendarContextMenu');
    if (!menu) {
        return;
    }
    calendarContextMenuDate = dateStr;
    const btn = menu.querySelector('[data-action="add-event"]');
    if (btn) {
        btn.textContent = t('contextAddEventOnDate').replace('{date}', formatDateDisplay(dateStr));
    }
    menu.hidden = false;
    const pad = 8;
    const rect = menu.getBoundingClientRect();
    let left = clientX;
    let top = clientY;
    if (left + rect.width > window.innerWidth - pad) {
        left = window.innerWidth - rect.width - pad;
    }
    if (top + rect.height > window.innerHeight - pad) {
        top = window.innerHeight - rect.height - pad;
    }
    menu.style.left = `${Math.max(pad, left)}px`;
    menu.style.top = `${Math.max(pad, top)}px`;
}

function initCalendarContextMenu() {
    if (document.getElementById('calendarContextMenu')) {
        return;
    }
    const menu = document.createElement('div');
    menu.id = 'calendarContextMenu';
    menu.className = 'calendar-context-menu';
    menu.hidden = true;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'calendar-context-menu-item';
    btn.dataset.action = 'add-event';
    btn.addEventListener('click', () => {
        const dateStr = calendarContextMenuDate;
        hideCalendarContextMenu();
        if (dateStr) {
            openEventEditor(null, 'calendar-popout', { defaultDate: dateStr });
        }
    });
    menu.appendChild(btn);
    document.body.appendChild(menu);

    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) {
            hideCalendarContextMenu();
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideCalendarContextMenu();
        }
    });
    document.addEventListener('scroll', hideCalendarContextMenu, true);
    window.addEventListener('resize', hideCalendarContextMenu);
}

function groupKrPublicHolidayRows(rows) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const groups = [];

    sorted.forEach(row => {
        const nameKo = row.localName;
        const nameEn = row.name || translateKrPublicHolidayName(nameKo);
        const last = groups[groups.length - 1];
        if (last && last.nameKo === nameKo && last.nameEn === nameEn
            && addOneDayISO(last.endDate) === row.date) {
            last.endDate = row.date;
        } else {
            groups.push({
                nameKo,
                nameEn,
                startDate: row.date,
                endDate: row.date
            });
        }
    });

    return groups.map(g => {
        const isRange = g.startDate !== g.endDate;
        return {
            nameKo: g.nameKo,
            nameEn: g.nameEn,
            name: currentLanguage === 'ko' ? g.nameKo : g.nameEn,
            isRange,
            date: isRange ? null : g.startDate,
            startDate: isRange ? g.startDate : null,
            endDate: isRange ? g.endDate : null
        };
    });
}

function holidayEventOverlapsTerm(eventShape) {
    const { start, end } = getTermDateRangeISO();
    if (!start || !end) {
        return true;
    }
    const dates = eventShape.isRange
        ? getEventDates(eventShape)
        : [eventShape.date];
    return dates.some(d => d >= start && d <= end);
}

function isDuplicateKrHolidayImport(candidate) {
    const candDates = getEventDates(candidate);
    const existing = getCalendarEvents().filter(
        ev => normalizeEventType(ev.type) === EVENT_TYPES.HOLIDAY
    );

    return existing.some(ev => {
        const evDates = getEventDates(ev);
        const sharesDate = candDates.some(d => evDates.includes(d));
        if (!sharesDate) {
            return false;
        }
        const evKo = ev.nameKo || ev.name;
        const evEn = ev.nameEn || translateKrPublicHolidayName(evKo);
        const candKo = candidate.nameKo || candidate.name;
        const candEn = candidate.nameEn || translateKrPublicHolidayName(candKo);
        if (evKo === candKo || evEn === candEn || ev.name === candidate.name) {
            return true;
        }
        return candDates.every(d => evDates.includes(d));
    });
}

async function importKoreanPublicHolidays() {
    if (!appData.termStart) {
        alert(t('fetchKrHolidaysNoTerm'));
        return;
    }

    if (!confirm(t('fetchKrHolidaysConfirm'))) {
        return;
    }

    const btn = document.getElementById('fetchKrHolidaysBtn');
    const labelKey = 'fetchKrHolidays';
    if (btn) {
        btn.disabled = true;
        btn.textContent = t('fetchKrHolidaysLoading');
    }

    try {
        const years = getYearsForCurrentTerm();
        const allRows = [];
        for (const year of years) {
            const rows = await fetchKrPublicHolidayRowsForYear(year);
            allRows.push(...rows);
        }

        const { start, end } = getTermDateRangeISO();
        const inTermRows = allRows.filter(row => row.date >= start && row.date <= end);
        const grouped = groupKrPublicHolidayRows(inTermRows);

        if (!Array.isArray(appData.events)) {
            appData.events = [];
        }

        let added = 0;
        let skipped = 0;

        grouped.forEach(g => {
            const candidate = normalizeEvent({
                type: EVENT_TYPES.HOLIDAY,
                name: g.name,
                nameKo: g.nameKo,
                nameEn: g.nameEn,
                notes: t('krPublicHolidayImportNote'),
                isRange: g.isRange,
                date: g.date,
                startDate: g.startDate,
                endDate: g.endDate,
                grades: [],
                classNames: [],
                sectionLevels: [],
                allElementary: false,
                allMiddleSchool: false
            });

            if (!holidayEventOverlapsTerm(candidate)) {
                skipped += 1;
                return;
            }

            if (isDuplicateKrHolidayImport(candidate)) {
                skipped += 1;
                return;
            }

            appData.events.push(candidate);
            added += 1;
        });

        syncHolidaysFromEvents();
        saveData();
        renderCalendar();

        alert(
            t('fetchKrHolidaysDone')
                .replace('{added}', String(added))
                .replace('{skipped}', String(skipped))
        );
    } catch (err) {
        console.error('Korean holiday import failed:', err);
        let msg = t('fetchKrHolidaysError');
        const detail = err && err.message ? String(err.message) : '';
        if (detail === 'YEAR_UNAVAILABLE' && err.year) {
            msg = t('fetchKrHolidaysYearUnavailable').replace('{year}', String(err.year));
        } else if (err instanceof TypeError || detail.toLowerCase().includes('failed to fetch')) {
            msg = t('fetchKrHolidaysCorsError');
        }
        alert(msg);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = t(labelKey);
        }
    }
}

function getAutoMergeStartPreferenceOrder(totalLessons) {
    const starts = [];
    for (let s = 1; s < totalLessons; s += 1) {
        starts.push(s);
    }
    const preferred = SCHEDULE_CONFIG.autoMergePreferredPairStart;
    if (typeof preferred === 'number' && starts.includes(preferred)) {
        return [preferred, ...starts.filter(s => s !== preferred)];
    }
    return starts;
}

const ELEMENTARY_GRADES = ['초1', '초2', '초3', '초4', '초5', '초6'];
const MIDDLE_SCHOOL_GRADES = ['중1', '중2', '중3'];

function isElementaryGrade(grade) {
    return ELEMENTARY_GRADES.includes((grade || '').trim());
}

function isMiddleSchoolGrade(grade) {
    return MIDDLE_SCHOOL_GRADES.includes((grade || '').trim());
}

function getClassSectionPreset(classData) {
    const preset = (classData.levelPreset || '').trim();
    if (isSimsonLevelPreset(preset) || isLegacySectionPreset(preset)) {
        return preset;
    }
    const leg = (classData.level || '').trim();
    if (isSimsonLevelPreset(leg) || isLegacySectionPreset(leg)) {
        return leg;
    }
    return null;
}

function holidayHasAnyTargetFilter(holiday) {
    const hasGrades = holiday.grades && holiday.grades.length > 0;
    const hasClassNames = holiday.classNames && holiday.classNames.length > 0;
    const hasSections = holiday.sectionLevels && holiday.sectionLevels.length > 0;
    return hasGrades || hasClassNames || hasSections
        || holiday.allElementary === true
        || holiday.allMiddleSchool === true;
}

function getHolidayAppliesToDescriptionParts(holiday) {
    const parts = [];
    if (holiday.allElementary === true) {
        parts.push(t('allElementaryLabel'));
    }
    if (holiday.allMiddleSchool === true) {
        parts.push(t('allMiddleSchoolLabel'));
    }
    if (holiday.sectionLevels && holiday.sectionLevels.length > 0) {
        parts.push(`${t('sectionsLabel')}: ${holiday.sectionLevels.join(', ')}`);
    }
    if (holiday.grades && holiday.grades.length > 0) {
        parts.push(`${t('gradesLabel')}: ${holiday.grades.join(', ')}`);
    }
    if (holiday.classNames && holiday.classNames.length > 0) {
        parts.push(`${t('classesLabel')}: ${holiday.classNames.join(', ')}`);
    }
    return parts;
}

let scheduleCacheKey = '';
const scheduleCacheMap = new Map();

function invalidateScheduleCache() {
    scheduleCacheKey = '';
    scheduleCacheMap.clear();
}

function computeScheduleCacheKey() {
    return JSON.stringify({
        classes: appData.classes,
        events: appData.events,
        holidays: appData.holidays
    });
}

function parseISODateLocal(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
        return new Date(NaN);
    }
    const parts = dateStr.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function maxDate(a, b) {
    return a > b ? a : b;
}

function minDate(a, b) {
    return a < b ? a : b;
}

function enumerateMonthKeysBetween(startDateStr, endDateStr) {
    const keys = [];
    const start = parseISODateLocal(startDateStr);
    const end = parseISODateLocal(endDateStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return keys;
    }
    let y = start.getFullYear();
    let mo = start.getMonth();
    const endY = end.getFullYear();
    const endMo = end.getMonth();
    while (y < endY || (y === endY && mo <= endMo)) {
        keys.push(`${y}-${String(mo + 1).padStart(2, '0')}`);
        mo += 1;
        if (mo > 11) {
            mo = 0;
            y += 1;
        }
    }
    return keys;
}

function formatDateForInput(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function computeTermEndDateFromStart(startDateStr, monthCount) {
    const d = parseISODateLocal(startDateStr);
    if (Number.isNaN(d.getTime())) {
        return null;
    }
    const n = parseInt(monthCount, 10);
    if (Number.isNaN(n) || n < 1) {
        return null;
    }
    const y = d.getFullYear();
    const m0 = d.getMonth();
    const lastMonthIndex = m0 + n - 1;
    const endY = y + Math.floor(lastMonthIndex / 12);
    const endM = ((lastMonthIndex % 12) + 12) % 12;
    return new Date(endY, endM + 1, 0);
}

function applyClassTermEndUiState() {
    if (!elements.classUseAutoTermEnd || !elements.classEndDate) {
        return;
    }
    const auto = elements.classUseAutoTermEnd.checked;
    elements.classEndDate.readOnly = auto;
    elements.classEndDate.classList.toggle('input-readonly', auto);
}

function refreshBookRowsForTermRange() {
    const start = elements.classStartDate.value;
    const end = elements.classEndDate.value;
    if (!start || !end) {
        return;
    }
    const existing = collectBooksByMonthFromForm();
    const keys = enumerateMonthKeysBetween(start, end);
    elements.booksByMonthRows.innerHTML = '';
    keys.forEach(k => addBookMonthRow(k, existing[k] || ''));
    if (keys.length === 0) {
        addBookMonthRow('', '');
    }
}

function syncClassTermEndAndBooks() {
    if (!elements.classUseAutoTermEnd || !elements.classUseAutoTermEnd.checked) {
        return;
    }
    const start = elements.classStartDate.value;
    const n = parseInt(elements.classTermMonths.value, 10);
    if (!start || Number.isNaN(n) || n < 1) {
        return;
    }
    const endD = computeTermEndDateFromStart(start, n);
    if (endD) {
        elements.classEndDate.value = formatDateForInput(endD);
    }
    refreshBookRowsForTermRange();
}

function getClassLevelDisplay(classData) {
    const custom = (classData.levelCustom || '').trim();
    if (custom) {
        return custom;
    }
    const preset = (classData.levelPreset || '').trim();
    if (preset) {
        const def = getSimsonLevelById(preset);
        return def ? def.name : preset;
    }
    return (classData.level || '').trim();
}

function getClassLevelDisplayFromParts(preset, custom) {
    const c = (custom || '').trim();
    if (c) {
        return c;
    }
    const p = (preset || '').trim();
    const def = getSimsonLevelById(p);
    if (def) {
        return def.name;
    }
    return p;
}

function getBookForMonthKey(classData, monthKey) {
    const map = classData.booksByMonth && typeof classData.booksByMonth === 'object'
        ? classData.booksByMonth
        : {};
    const entry = map[monthKey];
    if (entry && String(entry).trim()) {
        return String(entry).trim();
    }
    return (classData.book || '').trim();
}

function mergePlanToFit(availableSlots, totalLessons, userMerges, mode) {
    const normalizedUser = normalizeCompressionMerges(userMerges, totalLessons);
    if (mode !== 'autoWhenNeeded') {
        return normalizedUser;
    }
    // Auto: start with no merges; only add merges when there are not enough class
    // meetings in this month for one group per lesson day.
    let merges = [];
    let { groups } = buildLessonGroups(totalLessons, merges);
    if (groups.length <= availableSlots) {
        return merges;
    }
    let guard = 0;
    while (groups.length > availableSlots && guard < SCHEDULE_CONFIG.maxMergeIterations) {
        guard += 1;
        const startOrder = getAutoMergeStartPreferenceOrder(totalLessons);
        const startRank = {};
        startOrder.forEach((s, i) => {
            startRank[s] = i;
        });
        let bestTrial = null;
        let bestCount = groups.length;
        let bestRank = 9999;
        for (const start of startOrder) {
            if (merges.includes(start)) {
                continue;
            }
            const trial = normalizeCompressionMerges([...merges, start], totalLessons);
            const cnt = buildLessonGroups(totalLessons, trial).groups.length;
            const rnk = startRank[start];
            if (cnt < bestCount || (cnt === bestCount && rnk < bestRank)) {
                bestCount = cnt;
                bestTrial = trial;
                bestRank = rnk;
            }
        }
        if (!bestTrial) {
            break;
        }
        merges = bestTrial;
        ({ groups } = buildLessonGroups(totalLessons, merges));
    }
    return merges;
}

function escapeAttr(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function formatBooksByMonthSummary(classData) {
    const m = classData.booksByMonth && typeof classData.booksByMonth === 'object'
        ? classData.booksByMonth
        : {};
    const keys = Object.keys(m).sort();
    if (keys.length === 0) {
        return '—';
    }
    return keys.map(k => `${k}: ${m[k]}`).join('; ');
}

function getCompressionModeFromForm() {
    const r = document.querySelector('input[name="compressionMode"]:checked');
    return r && r.value === 'manual' ? 'manual' : 'autoWhenNeeded';
}

function collectBooksByMonthFromForm() {
    const map = {};
    elements.booksByMonthRows.querySelectorAll('.book-month-row').forEach(row => {
        const monthIn = row.querySelector('input.book-month-month');
        const bookIn = row.querySelector('input.book-month-title');
        if (!monthIn || !bookIn) {
            return;
        }
        const k = monthIn.value;
        if (!k) {
            return;
        }
        const title = (bookIn.value || '').trim();
        if (title) {
            map[k] = title;
        }
    });
    return map;
}

function addBookMonthRow(monthKey, title) {
    const row = document.createElement('div');
    row.className = 'book-month-row';
    row.innerHTML = `
        <input type="month" class="book-month-month" value="${escapeAttr(monthKey)}">
        <input type="text" class="book-month-title" placeholder="" value="${escapeAttr(title)}">
        <button type="button" class="btn btn-outline btn-small book-month-remove">${t('delete')}</button>
    `;
    row.querySelector('.book-month-title').placeholder = t('bookPlaceholder');
    row.querySelector('.book-month-remove').addEventListener('click', () => {
        row.remove();
        if (!elements.booksByMonthRows.querySelector('.book-month-row')) {
            addBookMonthRow('', '');
        }
    });
    elements.booksByMonthRows.appendChild(row);
}

function renderBooksByMonthRows(booksByMonth) {
    elements.booksByMonthRows.innerHTML = '';
    const map = booksByMonth && typeof booksByMonth === 'object' ? booksByMonth : {};
    const entries = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
    if (entries.length === 0) {
        addBookMonthRow('', '');
        return;
    }
    entries.forEach(([k, v]) => addBookMonthRow(k, v));
}

function fillBooksFromTermDefaultBook() {
    const defaultBook = (elements.classBook.value || '').trim();
    if (!defaultBook) {
        return;
    }
    const start = elements.classStartDate.value;
    const end = elements.classEndDate.value;
    if (!start || !end) {
        return;
    }
    elements.booksByMonthRows.innerHTML = '';
    enumerateMonthKeysBetween(start, end).forEach(k => addBookMonthRow(k, defaultBook));
}

// ============================================
// App shell: templates, tabs, form mounts
// ============================================
const APP_TAB_IDS = ['calendar', 'classes', 'syllabus', 'events', 'homework', 'curriculum', 'data'];

let curriculumTabSelectedId = null;
let classEditorMount = 'modal';
let eventEditorMount = 'modal';
/** When true, calendar cells use print visibility checkboxes instead of screen filters. */
let calendarRenderForPrint = false;
let syllabusEditorMounted = false;
/** @type {'classes'|'templates'} */
let syllabusListSegment = 'classes';
/** @type {'class'|'template'|null} */
let syllabusEditorMode = null;

function mountTemplateInto(templateId, mountId) {
    const tpl = document.getElementById(templateId);
    const mount = document.getElementById(mountId);
    if (!tpl || !mount || mount.childElementCount > 0) {
        return;
    }
    mount.appendChild(tpl.content.cloneNode(true));
}

function initAppShellFromTemplates() {
    mountTemplateInto('classFormTemplate', 'classFormMountModal');
    mountTemplateInto('holidayFormTemplate', 'holidayFormMountModal');
    mountTemplateInto('printFormTemplate', 'printFormMountModal');
}

function mountSyllabusEditor() {
    if (syllabusEditorMounted) {
        refreshSyllabusElementRefs();
        return;
    }
    mountTemplateInto('syllabusEditorTemplate', 'syllabusFormMountTab');
    syllabusEditorMounted = true;
    refreshSyllabusElementRefs();
    initSyllabusEditorListeners();
}

function refreshSyllabusElementRefs() {
    elements.syllabusUnitsRows = document.getElementById('syllabusUnitsRows');
    elements.addSyllabusUnitBtn = document.getElementById('addSyllabusUnitBtn');
    elements.syllabusTableBody = document.getElementById('syllabusTableBody');
    elements.syllabusTableEmptyHint = document.getElementById('syllabusTableEmptyHint');
    elements.refreshSyllabusBtn = document.getElementById('refreshSyllabusBtn');
    elements.startBlankSyllabusBtn = document.getElementById('startBlankSyllabusBtn');
    elements.fillSyllabusFromUnitsBtn = document.getElementById('fillSyllabusFromUnitsBtn');
    elements.applyPresetSyllabusBtn = document.getElementById('applyPresetSyllabusBtn');
    elements.addSyllabusLessonRowBtn = document.getElementById('addSyllabusLessonRowBtn');
    elements.addSyllabusNoteRowBtn = document.getElementById('addSyllabusNoteRowBtn');
    elements.homeworkImportPaste = document.getElementById('homeworkImportPaste');
    elements.homeworkImportPreviewBtn = document.getElementById('homeworkImportPreviewBtn');
    elements.homeworkImportApplyBtn = document.getElementById('homeworkImportApplyBtn');
    elements.homeworkImportPreview = document.getElementById('homeworkImportPreview');
    elements.syllabusEditorForm = document.getElementById('syllabusEditorForm');
    elements.syllabusGeneralNotes = document.getElementById('syllabusGeneralNotes');
    elements.printClassSyllabusBtn = document.getElementById('printClassSyllabusBtn');
}

function getSyllabusGeneralNotesFromForm() {
    const el = elements.syllabusGeneralNotes || document.getElementById('syllabusGeneralNotes');
    return el ? (el.value || '').trim() : '';
}

function setSyllabusGeneralNotesInForm(value) {
    const el = elements.syllabusGeneralNotes || document.getElementById('syllabusGeneralNotes');
    if (el) {
        el.value = value || '';
    }
}

function getSyllabusEditorFormEl() {
    return document.getElementById('syllabusEditorForm') || elements.syllabusEditorForm;
}

function clearSyllabusEditorSelection(mode) {
    ensureUiState();
    if (mode === 'class') {
        appData.ui.syllabusTabTemplateId = '';
        syllabusEditorMode = 'class';
    } else if (mode === 'template') {
        appData.ui.syllabusTabClassId = '';
        syllabusEditorMode = 'template';
    }
}

function getSelectedSyllabusClass() {
    ensureUiState();
    const id = appData.ui.syllabusTabClassId;
    return id ? appData.classes.find((c) => c.id === id) : null;
}

function getSelectedSyllabusTemplate() {
    ensureUiState();
    const id = appData.ui.syllabusTabTemplateId;
    return id ? getCustomSyllabusTemplates().find((tpl) => tpl.id === id) : null;
}

function syncSyllabusEditorChrome() {
    const empty = document.getElementById('syllabusEditorEmpty');
    const shell = document.getElementById('syllabusEditorShell');
    const classData = getSelectedSyllabusClass();
    const template = getSelectedSyllabusTemplate();
    const hasClass = syllabusEditorMode === 'class' && classData;
    const hasTemplate = syllabusEditorMode === 'template' && template;
    const active = hasClass || hasTemplate;

    if (empty) {
        empty.hidden = active;
    }
    if (shell) {
        shell.hidden = !active;
    }

    const titleEl = document.getElementById('syllabusEditorTitle');
    const metaEl = document.getElementById('syllabusEditorMeta');
    const bannerEl = document.getElementById('syllabusEditorModeBanner');
    const chipEl = document.getElementById('syllabusScheduleChip');
    const saveClassBtn = document.getElementById('syllabusSaveClassBtn');
    const saveTplBtn = document.getElementById('syllabusSaveTemplateBtn');
    const openClassBtn = document.getElementById('syllabusOpenClassSettingsBtn');
    const openHwBtn = document.getElementById('syllabusOpenHomeworkBtn');
    const applySelect = document.getElementById('syllabusApplyTemplateSelect');
    const saveAsBtn = document.getElementById('syllabusSaveAsTemplateBtn');
    const delTplBtn = document.getElementById('syllabusDeleteTemplateBtn');
    const refreshBtn = elements.refreshSyllabusBtn;
    const blankBtn = elements.startBlankSyllabusBtn;
    const printBtn = elements.printClassSyllabusBtn;

    if (titleEl) {
        titleEl.textContent = hasClass ? classData.name : (hasTemplate ? template.name : '');
    }
    if (metaEl) {
        if (hasClass) {
            metaEl.textContent = [formatClassLabelWithPeriod(classData), classData.grade, classData.book]
                .filter(Boolean)
                .join(' · ');
        } else if (hasTemplate) {
            metaEl.textContent = template.notes || '';
        } else {
            metaEl.textContent = '';
        }
    }
    if (bannerEl) {
        if (hasTemplate) {
            bannerEl.hidden = false;
            bannerEl.textContent = t('syllabusModeTemplate', { name: template.name });
        } else {
            bannerEl.hidden = true;
            bannerEl.textContent = '';
        }
    }
    if (chipEl) {
        if (hasClass) {
            chipEl.hidden = false;
            chipEl.textContent = t('syllabusScheduleChip', {
                days: formatMeetingDaysSummary(classData),
                start: classData.startDate ? formatDateDisplay(classData.startDate) : '—',
                end: classData.endDate ? formatDateDisplay(classData.endDate) : '—'
            });
        } else {
            chipEl.hidden = true;
        }
    }

    if (saveClassBtn) {
        saveClassBtn.hidden = !hasClass;
    }
    if (saveTplBtn) {
        saveTplBtn.hidden = !hasTemplate;
    }
    if (openClassBtn) {
        openClassBtn.hidden = !hasClass;
    }
    if (openHwBtn) {
        openHwBtn.hidden = !hasClass;
    }
    if (applySelect) {
        applySelect.hidden = !hasClass;
    }
    if (saveAsBtn) {
        saveAsBtn.hidden = !hasClass;
    }
    if (delTplBtn) {
        delTplBtn.hidden = !hasTemplate;
    }
    if (refreshBtn) {
        refreshBtn.hidden = hasTemplate;
    }
    if (blankBtn) {
        blankBtn.hidden = hasTemplate;
    }
    if (printBtn) {
        printBtn.hidden = hasTemplate;
    }

    populateSyllabusApplyTemplateSelect();
}

function populateSyllabusApplyTemplateSelect() {
    const sel = document.getElementById('syllabusApplyTemplateSelect');
    if (!sel) {
        return;
    }
    const prev = sel.value;
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = t('syllabusApplyTemplatePick');
    sel.appendChild(opt0);
    getCustomSyllabusTemplates().forEach((tpl) => {
        const o = document.createElement('option');
        o.value = tpl.id;
        o.textContent = tpl.name;
        sel.appendChild(o);
    });
    if (prev && getCustomSyllabusTemplates().some((tpl) => tpl.id === prev)) {
        sel.value = prev;
    }
}

function setSyllabusEditorDataset(classData) {
    const form = getSyllabusEditorFormEl();
    if (!form) {
        return;
    }
    if (classData) {
        form.dataset.homeworkImportMode = classData.homeworkImportMode || '';
        form.dataset.lessonLabelMode = classData.lessonLabelMode || '';
    } else {
        form.dataset.homeworkImportMode = '';
        form.dataset.lessonLabelMode = '';
    }
}

function populateSyllabusEditorForClass(classData) {
    if (!classData) {
        return;
    }
    clearSyllabusEditorSelection('class');
    appData.ui.syllabusTabClassId = classData.id;
    saveData();
    setSyllabusEditorDataset(classData);
    setSyllabusGeneralNotesInForm(classData.syllabusGeneralNotes || '');
    renderSyllabusUnitsRows(classData.syllabusUnits || []);
    const rows = getSyllabusRowsForClass(classData, { preferMerged: true });
    renderSyllabusEditorTable(rows);
    if (elements.homeworkImportPaste) {
        elements.homeworkImportPaste.value = '';
    }
    if (elements.homeworkImportPreview) {
        elements.homeworkImportPreview.textContent = '';
        delete elements.homeworkImportPreview.dataset.importPayload;
    }
    syncSyllabusEditorChrome();
    renderSyllabusClassList();
}

function populateSyllabusEditorForTemplate(template) {
    if (!template) {
        return;
    }
    clearSyllabusEditorSelection('template');
    appData.ui.syllabusTabTemplateId = template.id;
    saveData();
    setSyllabusEditorDataset({
        homeworkImportMode: template.homeworkImportMode,
        lessonLabelMode: template.lessonLabelMode
    });
    setSyllabusGeneralNotesInForm(template.syllabusGeneralNotes || template.notes || '');
    renderSyllabusUnitsRows(template.syllabusUnits || []);
    const api = getSyllabusTemplatesApi();
    const mod = getSyllabusModule();
    let rows = [];
    if (api && typeof api.expandTemplateToEditorRows === 'function') {
        rows = api.expandTemplateToEditorRows(template, {
            newRowId: () => (mod ? mod.newRowId() : generateId())
        });
    }
    renderSyllabusEditorTable(rows);
    syncSyllabusEditorChrome();
    renderSyllabusTemplateList();
}

function updateClassSyllabusSummary(classData) {
    const wrap = document.getElementById('classSyllabusSummary');
    const text = document.getElementById('classSyllabusSummaryText');
    if (!wrap || !text) {
        return;
    }
    if (!classData || !classData.id) {
        wrap.hidden = true;
        return;
    }
    wrap.hidden = false;
    const count = Array.isArray(classData.syllabusRows) ? classData.syllabusRows.length : 0;
    text.textContent = count > 0
        ? t('syllabusClassSummary', { rows: count })
        : t('syllabusClassSummaryEmpty');
}

function renderSyllabusClassList() {
    const list = document.getElementById('syllabusClassList');
    if (!list) {
        return;
    }
    ensureUiState();
    const q = (document.getElementById('syllabusClassListSearch')?.value || '').trim().toLowerCase();
    const selectedId = appData.ui.syllabusTabClassId || '';
    list.innerHTML = '';
    const classes = getClassesInDisplayOrder().filter((c) => {
        if (!q) {
            return true;
        }
        const hay = [c.name, c.grade, c.book, c.levelCustom, formatClassLabelWithPeriod(c)].join(' ').toLowerCase();
        return hay.includes(q);
    });
    if (classes.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'module-list-empty';
        empty.style.padding = '12px';
        empty.style.color = 'var(--text-secondary)';
        empty.textContent = q ? t('lessonFilterSearchEmpty') : t('classEditorEmpty');
        list.appendChild(empty);
        return;
    }
    classes.forEach((c) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'module-list-item' + (c.id === selectedId && syllabusEditorMode === 'class' ? ' is-selected' : '');
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', String(c.id === selectedId && syllabusEditorMode === 'class'));
        btn.innerHTML = `<span>${escapeHtml(c.name)}</span><span class="module-list-item-meta">${escapeHtml([formatClassLabelWithPeriod(c), c.grade].filter(Boolean).join(' · '))}</span>`;
        btn.addEventListener('click', () => {
            syllabusListSegment = 'classes';
            syncSyllabusListSegmentUi();
            populateSyllabusEditorForClass(c);
        });
        list.appendChild(btn);
    });
}

function renderSyllabusTemplateList() {
    const list = document.getElementById('syllabusTemplateList');
    if (!list) {
        return;
    }
    ensureUiState();
    const q = (document.getElementById('syllabusTemplateListSearch')?.value || '').trim().toLowerCase();
    const selectedId = appData.ui.syllabusTabTemplateId || '';
    list.innerHTML = '';
    const templates = getCustomSyllabusTemplates().filter((tpl) => {
        if (!q) {
            return true;
        }
        return (tpl.name || '').toLowerCase().includes(q) || (tpl.notes || '').toLowerCase().includes(q);
    });
    if (templates.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'module-list-empty';
        empty.style.padding = '12px';
        empty.style.color = 'var(--text-secondary)';
        empty.textContent = q ? t('lessonFilterSearchEmpty') : t('syllabusNoTemplates');
        list.appendChild(empty);
        return;
    }
    templates.forEach((tpl) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'module-list-item' + (tpl.id === selectedId && syllabusEditorMode === 'template' ? ' is-selected' : '');
        btn.setAttribute('role', 'option');
        btn.innerHTML = `<span>${escapeHtml(tpl.name)}</span>`;
        btn.addEventListener('click', () => {
            syllabusListSegment = 'templates';
            syncSyllabusListSegmentUi();
            populateSyllabusEditorForTemplate(tpl);
        });
        list.appendChild(btn);
    });
}

function syncSyllabusListSegmentUi() {
    const classSec = document.getElementById('syllabusClassListSection');
    const tplSec = document.getElementById('syllabusTemplateListSection');
    const btnClass = document.getElementById('syllabusSegmentClasses');
    const btnTpl = document.getElementById('syllabusSegmentTemplates');
    const isClass = syllabusListSegment === 'classes';
    if (classSec) {
        classSec.hidden = !isClass;
    }
    if (tplSec) {
        tplSec.hidden = isClass;
    }
    if (btnClass) {
        btnClass.classList.toggle('is-active', isClass);
    }
    if (btnTpl) {
        btnTpl.classList.toggle('is-active', !isClass);
    }
}

function saveSyllabusForSelectedClass() {
    const classData = getSelectedSyllabusClass();
    if (!classData) {
        return;
    }
    const index = appData.classes.findIndex((c) => c.id === classData.id);
    if (index === -1) {
        return;
    }
    appData.classes[index].syllabusUnits = collectSyllabusUnitsFromForm();
    appData.classes[index].syllabusRows = collectSyllabusRowsFromForm();
    appData.classes[index].syllabusGeneralNotes = getSyllabusGeneralNotesFromForm();
    const form = getSyllabusEditorFormEl();
    if (form) {
        const mode = getHomeworkImportModeForSyllabusEditor(classData);
        if (mode) {
            appData.classes[index].homeworkImportMode = mode;
        }
    }
    saveData();
    renderCalendar();
    setAppStatusMessage(t('syllabusSaved'), false);
    updateClassSyllabusSummary(appData.classes[index]);
    if (elements.classId && elements.classId.value === classData.id) {
        updateClassSyllabusSummary(appData.classes[index]);
    }
}

function saveSyllabusTemplateFromEditor() {
    const template = getSelectedSyllabusTemplate();
    if (!template) {
        return;
    }
    const api = getSyllabusTemplatesApi();
    const idx = getCustomSyllabusTemplates().findIndex((tpl) => tpl.id === template.id);
    if (idx === -1) {
        return;
    }
    const units = collectSyllabusUnitsFromForm();
    const rows = collectSyllabusRowsFromForm();
    const collected = api
        ? api.collectTemplateFromEditor(units, rows)
        : { syllabusUnits: units, rowTemplates: [], noteRows: [] };
    appData.customSyllabusTemplates[idx] = {
        ...appData.customSyllabusTemplates[idx],
        syllabusUnits: collected.syllabusUnits,
        rowTemplates: collected.rowTemplates,
        noteRows: collected.noteRows,
        syllabusGeneralNotes: getSyllabusGeneralNotesFromForm()
    };
    saveData();
    setAppStatusMessage(t('syllabusTemplateSaved'), false);
    renderSyllabusTemplateList();
    renderPrintSyllabusManager();
}

function createBlankSyllabusTemplate() {
    const name = prompt(t('syllabusTemplateNamePrompt'), '');
    if (name === null) {
        return;
    }
    const trimmed = (name || '').trim() || (currentLanguage === 'ko' ? '새 강의 계획표' : 'New syllabus');
    const tpl = {
        id: generateId(),
        name: trimmed,
        notes: '',
        syllabusGeneralNotes: '',
        syllabusUnits: [],
        rowTemplates: [],
        noteRows: []
    };
    if (!Array.isArray(appData.customSyllabusTemplates)) {
        appData.customSyllabusTemplates = [];
    }
    appData.customSyllabusTemplates.push(tpl);
    saveData();
    syllabusListSegment = 'templates';
    syncSyllabusListSegmentUi();
    populateSyllabusEditorForTemplate(tpl);
    renderSyllabusTemplateList();
    renderPrintSyllabusManager();
}

function saveClassSyllabusAsTemplate() {
    const classData = getSelectedSyllabusClass();
    if (!classData) {
        return;
    }
    const name = prompt(t('syllabusTemplateNamePrompt'), classData.name + ' syllabus');
    if (name === null) {
        return;
    }
    const api = getSyllabusTemplatesApi();
    const units = collectSyllabusUnitsFromForm();
    const rows = collectSyllabusRowsFromForm();
    const collected = api
        ? api.collectTemplateFromEditor(units, rows)
        : { syllabusUnits: units, rowTemplates: [], noteRows: [] };
    const tpl = {
        id: generateId(),
        name: (name || '').trim() || classData.name,
        notes: '',
        syllabusGeneralNotes: getSyllabusGeneralNotesFromForm(),
        syllabusUnits: collected.syllabusUnits,
        rowTemplates: collected.rowTemplates,
        noteRows: collected.noteRows,
        homeworkImportMode: classData.homeworkImportMode,
        lessonLabelMode: classData.lessonLabelMode
    };
    if (!Array.isArray(appData.customSyllabusTemplates)) {
        appData.customSyllabusTemplates = [];
    }
    appData.customSyllabusTemplates.push(tpl);
    saveData();
    setAppStatusMessage(t('syllabusTemplateSaved'), false);
    syllabusListSegment = 'templates';
    syncSyllabusListSegmentUi();
    populateSyllabusEditorForTemplate(tpl);
    renderSyllabusTemplateList();
    renderPrintSyllabusManager();
}

function deleteSelectedSyllabusTemplate() {
    const template = getSelectedSyllabusTemplate();
    if (!template || !confirm(t('syllabusConfirmDeleteTemplate'))) {
        return;
    }
    appData.customSyllabusTemplates = getCustomSyllabusTemplates().filter((tpl) => tpl.id !== template.id);
    appData.ui.syllabusTabTemplateId = '';
    syllabusEditorMode = null;
    saveData();
    renderSyllabusTemplateList();
    renderPrintSyllabusManager();
    syncSyllabusEditorChrome();
}

function applyCustomSyllabusTemplateToSelectedClass(templateId) {
    const classData = getSelectedSyllabusClass();
    const template = getCustomSyllabusTemplates().find((tpl) => tpl.id === templateId);
    if (!classData || !template) {
        return;
    }
    if (!confirm(t('syllabusConfirmApplyTemplate'))) {
        return;
    }
    const index = appData.classes.findIndex((c) => c.id === classData.id);
    if (index === -1) {
        return;
    }
    appData.classes[index].syllabusUnits = (template.syllabusUnits || []).map((u) => ({ ...u, id: u.id || generateId() }));
    if (template.syllabusGeneralNotes) {
        appData.classes[index].syllabusGeneralNotes = template.syllabusGeneralNotes;
    }
    let rows = collectSyllabusRowsFromForm();
    if (!rows.length && template.rowTemplates && template.rowTemplates.length) {
        const api = getSyllabusTemplatesApi();
        rows = api
            ? api.expandTemplateToEditorRows(template, { newRowId: () => (getSyllabusModule()?.newRowId() || generateId()) })
            : [];
    }
    const api = getSyllabusTemplatesApi();
    if (api && template.rowTemplates && template.rowTemplates.length && rows.length) {
        const result = api.applyRowTemplatesToSyllabusRows(rows, template.rowTemplates);
        rows = result.rows;
    }
    if (template.homeworkImportMode) {
        appData.classes[index].homeworkImportMode = template.homeworkImportMode;
    }
    if (template.lessonLabelMode) {
        appData.classes[index].lessonLabelMode = template.lessonLabelMode;
    }
    appData.classes[index].syllabusRows = rows;
    saveData();
    populateSyllabusEditorForClass(appData.classes[index]);
    setAppStatusMessage(t('syllabusTemplateApplied'), false);
}

function startBlankSyllabusForSelectedClass() {
    const classData = getSelectedSyllabusClass();
    if (!classData || !confirm(t('syllabusConfirmBlank'))) {
        return;
    }
    setSyllabusGeneralNotesInForm('');
    renderSyllabusUnitsRows([]);
    renderSyllabusEditorTable([]);
}

function addSyllabusLessonRow() {
    const mod = getSyllabusModule();
    const rows = collectSyllabusRowsFromForm();
    let maxSession = 0;
    rows.forEach((row) => {
        if (row.kind === 'lesson' && row.sessionNumber > maxSession) {
            maxSession = row.sessionNumber;
        }
    });
    rows.push({
        id: mod ? mod.newRowId() : generateId(),
        kind: 'lesson',
        sessionNumber: maxSession + 1,
        planTitle: '',
        planDetail: '',
        note: '',
        source: 'manual',
        weekLabel: '',
        monthKey: '',
        date: ''
    });
    renderSyllabusEditorTable(rows);
}

function getClassTypeDefinitionForSyllabusClass(classData) {
    if (!classData || !classData.classTypeId) {
        return null;
    }
    return getClassTypeDefinitionById(classData.classTypeId);
}

function getHomeworkImportModeForSyllabusEditor(classData) {
    const form = getSyllabusEditorFormEl();
    if (form && form.dataset.homeworkImportMode) {
        return form.dataset.homeworkImportMode;
    }
    if (classData && classData.homeworkImportMode) {
        return classData.homeworkImportMode;
    }
    const def = getClassTypeDefinitionForSyllabusClass(classData);
    if (def && def.homeworkImportMode) {
        return def.homeworkImportMode;
    }
    if (classData && classUsesDebateCompression(classData)) {
        return 'debate';
    }
    return 'unitPair';
}

function initSyllabusTabControls() {
    mountSyllabusEditor();
    syncSyllabusListSegmentUi();
    renderSyllabusClassList();
    renderSyllabusTemplateList();
    const classData = getSelectedSyllabusClass();
    const template = getSelectedSyllabusTemplate();
    if (syllabusEditorMode === 'template' && template) {
        populateSyllabusEditorForTemplate(template);
    } else if (classData) {
        populateSyllabusEditorForClass(classData);
    } else {
        syncSyllabusEditorChrome();
    }
}

function initSyllabusEditorListeners() {
    const root = document.getElementById('syllabusFormMountTab');
    if (!root || root.dataset.syllabusListenersInit) {
        return;
    }
    root.dataset.syllabusListenersInit = '1';

    const segClass = document.getElementById('syllabusSegmentClasses');
    const segTpl = document.getElementById('syllabusSegmentTemplates');
    if (segClass) {
        segClass.addEventListener('click', () => {
            syllabusListSegment = 'classes';
            syncSyllabusListSegmentUi();
        });
    }
    if (segTpl) {
        segTpl.addEventListener('click', () => {
            syllabusListSegment = 'templates';
            syncSyllabusListSegmentUi();
            renderSyllabusTemplateList();
        });
    }

    const classSearch = document.getElementById('syllabusClassListSearch');
    if (classSearch) {
        classSearch.addEventListener('input', () => renderSyllabusClassList());
    }
    const tplSearch = document.getElementById('syllabusTemplateListSearch');
    if (tplSearch) {
        tplSearch.addEventListener('input', () => renderSyllabusTemplateList());
    }

    document.getElementById('syllabusNewTemplateBtn')?.addEventListener('click', createBlankSyllabusTemplate);
    document.getElementById('syllabusSaveClassBtn')?.addEventListener('click', saveSyllabusForSelectedClass);
    document.getElementById('syllabusSaveTemplateBtn')?.addEventListener('click', saveSyllabusTemplateFromEditor);
    document.getElementById('syllabusOpenClassSettingsBtn')?.addEventListener('click', () => {
        const id = appData.ui.syllabusTabClassId;
        if (id) {
            navigateToTab('classes', { classId: id });
        }
    });
    document.getElementById('syllabusOpenHomeworkBtn')?.addEventListener('click', () => {
        const id = appData.ui.syllabusTabClassId;
        if (id) {
            navigateToTab('homework', { classId: id });
        }
    });
    document.getElementById('syllabusSaveAsTemplateBtn')?.addEventListener('click', saveClassSyllabusAsTemplate);
    document.getElementById('syllabusDeleteTemplateBtn')?.addEventListener('click', deleteSelectedSyllabusTemplate);
    document.getElementById('syllabusApplyTemplateSelect')?.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val) {
            applyCustomSyllabusTemplateToSelectedClass(val);
            e.target.value = '';
        }
    });

    if (elements.addSyllabusUnitBtn) {
        elements.addSyllabusUnitBtn.addEventListener('click', () => addSyllabusUnitRow('', ''));
    }
    if (elements.refreshSyllabusBtn) {
        elements.refreshSyllabusBtn.addEventListener('click', refreshSyllabusFromCalendar);
    }
    if (elements.startBlankSyllabusBtn) {
        elements.startBlankSyllabusBtn.addEventListener('click', startBlankSyllabusForSelectedClass);
    }
    if (elements.fillSyllabusFromUnitsBtn) {
        elements.fillSyllabusFromUnitsBtn.addEventListener('click', fillSyllabusPagesFromUnits);
    }
    if (elements.applyPresetSyllabusBtn) {
        elements.applyPresetSyllabusBtn.addEventListener('click', () => applyPresetSyllabusRowsToTable());
    }
    if (elements.addSyllabusLessonRowBtn) {
        elements.addSyllabusLessonRowBtn.addEventListener('click', addSyllabusLessonRow);
    }
    if (elements.addSyllabusNoteRowBtn) {
        elements.addSyllabusNoteRowBtn.addEventListener('click', addSyllabusNoteRow);
    }
    if (elements.printClassSyllabusBtn) {
        elements.printClassSyllabusBtn.addEventListener('click', printClassSyllabusFromModal);
    }
    if (elements.homeworkImportPreviewBtn) {
        elements.homeworkImportPreviewBtn.addEventListener('click', previewHomeworkImport);
    }
    if (elements.homeworkImportApplyBtn) {
        elements.homeworkImportApplyBtn.addEventListener('click', applyHomeworkImport);
    }
}

initAppShellFromTemplates();

function getActiveTab() {
    ensureUiState();
    const tab = appData.ui.activeTab;
    return APP_TAB_IDS.includes(tab) ? tab : 'calendar';
}

function isClassPopoutOpen() {
    return elements.classModal && elements.classModal.classList.contains('active');
}

function isEventPopoutOpen() {
    return elements.holidayModal && elements.holidayModal.classList.contains('active');
}

function mountClassForm(target) {
    const form = document.getElementById('classForm');
    const modalMount = document.getElementById('classFormMountModal');
    const tabMount = document.getElementById('classFormMountTab');
    const mount = target === 'tab' ? tabMount : modalMount;
    if (!form || !mount) {
        return;
    }
    mount.appendChild(form);
    classEditorMount = target;
    updateClassEditorEmptyState();
    syncClassOpenEditorButton();
}

function mountPrintForm() {
    const form = document.getElementById('printForm');
    const mount = document.getElementById('printFormMountModal');
    if (!form || !mount) {
        return;
    }
    if (form.parentElement !== mount) {
        mount.appendChild(form);
    }
}

function resetHolidayPopoutLayout(mount) {
    if (!mount) {
        return;
    }
    mount.classList.remove('event-form-mount--popout');
    const body = mount.querySelector('.event-modal-body');
    const form = document.getElementById('holidayForm');
    const header = mount.querySelector('.event-editor-header');
    if (body && form && body.contains(form)) {
        if (header && header.nextSibling !== form) {
            header.insertAdjacentElement('afterend', form);
        } else if (!header) {
            mount.insertBefore(form, body);
        }
        body.remove();
    }
}

function ensureHolidayPopoutLayout(mount) {
    if (!mount) {
        return;
    }
    const header = mount.querySelector('.event-editor-header');
    const form = document.getElementById('holidayForm');
    if (!header || !form) {
        return;
    }
    mount.classList.add('event-form-mount--popout');
    let body = mount.querySelector('.event-modal-body');
    if (!body) {
        body = document.createElement('div');
        body.className = 'event-modal-body modal-body-scroll';
        if (form.parentElement === mount) {
            mount.insertBefore(body, form);
            body.appendChild(form);
        } else {
            header.insertAdjacentElement('afterend', body);
            body.appendChild(form);
        }
    } else if (!body.contains(form)) {
        body.appendChild(form);
    }
}

function mountHolidayForm(target) {
    const header = document.querySelector('#holidayFormMountModal .event-editor-header, #holidayFormMountTab .event-editor-header')
        || document.querySelector('.event-editor-header');
    const form = document.getElementById('holidayForm');
    const modalMount = document.getElementById('holidayFormMountModal');
    const tabMount = document.getElementById('holidayFormMountTab');
    const mount = target === 'tab' ? tabMount : modalMount;
    if (!mount) {
        return;
    }
    if (target === 'tab') {
        resetHolidayPopoutLayout(modalMount);
    } else {
        resetHolidayPopoutLayout(tabMount);
    }
    if (header && header.parentElement !== mount) {
        mount.appendChild(header);
    }
    if (form) {
        const formParent = form.parentElement;
        if (formParent !== mount && formParent !== mount.querySelector('.event-modal-body')) {
            mount.appendChild(form);
        }
    }
    if (target === 'modal') {
        ensureHolidayPopoutLayout(modalMount);
    }
    eventEditorMount = target;
    updateEventEditorEmptyState();
    syncEventOpenEditorButton();
}

function updateClassEditorEmptyState() {
    const empty = document.getElementById('classEditorEmpty');
    const tabMount = document.getElementById('classFormMountTab');
    if (!empty || !tabMount) {
        return;
    }
    const onClassesTab = getActiveTab() === 'classes';
    const hasForm = tabMount.querySelector('#classForm');
    const hasSelection = !!(elements.classId && elements.classId.value);
    empty.hidden = !onClassesTab || (hasForm && hasSelection);
}

function updateEventEditorEmptyState() {
    const empty = document.getElementById('eventEditorEmpty');
    const tabMount = document.getElementById('holidayFormMountTab');
    if (!empty || !tabMount) {
        return;
    }
    const onEventsTab = getActiveTab() === 'events';
    const hasForm = tabMount.querySelector('#holidayForm');
    const hasSelection = !!(elements.holidayId && elements.holidayId.value);
    empty.hidden = !onEventsTab || (hasForm && hasSelection);
}

function navigateToTab(tabId, options = {}) {
    if (!APP_TAB_IDS.includes(tabId)) {
        tabId = 'calendar';
    }
    ensureUiState();
    appData.ui.activeTab = tabId;
    saveData();

    APP_TAB_IDS.forEach((id) => {
        const panel = document.getElementById(`panel-${id}`);
        const btn = document.getElementById(`tabBtn-${id}`);
        const active = id === tabId;
        if (panel) {
            panel.hidden = !active;
            panel.classList.toggle('is-active', active);
        }
        if (btn) {
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', String(active));
        }
    });

    if (tabId === 'classes') {
        mountClassForm('tab');
        renderClassList();
        if (options.classId) {
            const cls = appData.classes.find((c) => c.id === options.classId);
            if (cls) {
                populateClassForm(cls);
            }
        } else if (options.newClass) {
            populateClassForm(null, options);
        }
        updateClassEditorEmptyState();
    } else if (tabId === 'events') {
        mountHolidayForm('tab');
        renderEventList();
        if (options.eventId) {
            const ev = (appData.events || []).find((e) => e.id === options.eventId);
            if (ev) {
                populateHolidayForm(ev);
            }
        } else if (options.newEvent) {
            populateHolidayForm(null, options);
        }
        updateEventEditorEmptyState();
    } else if (tabId === 'syllabus') {
        initSyllabusTabControls();
        if (options.classId) {
            const cls = appData.classes.find((c) => c.id === options.classId);
            if (cls) {
                syllabusListSegment = 'classes';
                syncSyllabusListSegmentUi();
                populateSyllabusEditorForClass(cls);
            }
        } else if (options.templateId) {
            const tpl = getCustomSyllabusTemplates().find((x) => x.id === options.templateId);
            if (tpl) {
                syllabusListSegment = 'templates';
                syncSyllabusListSegmentUi();
                populateSyllabusEditorForTemplate(tpl);
            }
        }
    } else if (tabId === 'homework') {
        initHomeworkTabControls();
        if (options.classId) {
            appData.ui.homeworkTabClassId = options.classId;
            saveData();
        }
        renderHomeworkClassList();
        renderHomeworkEditor();
    } else if (tabId === 'curriculum') {
        initCurriculumTabPanel(options);
    } else if (tabId === 'data') {
        requestAnimationFrame(() => {
            renderPrintSyllabusManager();
        });
    } else if (tabId === 'calendar' && options.focusClassId) {
        focusClassOnCalendar(options.focusClassId);
    } else if (tabId === 'calendar' && options.focusEventId) {
        focusEventOnCalendar(options.focusEventId);
    }

    syncClassOpenEditorButton();
    syncEventOpenEditorButton();

    if (tabId !== 'calendar') {
        if (elements.classModal) {
            closeModal(elements.classModal);
        }
        if (elements.holidayModal) {
            closeModal(elements.holidayModal);
        }
    }
    if (elements.printOptionsModal && elements.printOptionsModal.classList.contains('active')) {
        closePrintOptionsModal();
    }
}

function initAppTabs() {
    document.querySelectorAll('.app-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            navigateToTab(btn.dataset.tab || 'calendar');
        });
    });
    const classSearch = document.getElementById('classListSearch');
    if (classSearch) {
        classSearch.addEventListener('input', () => renderClassList());
    }
    const eventSearch = document.getElementById('eventListSearch');
    if (eventSearch) {
        eventSearch.addEventListener('input', () => renderEventList());
    }
    const classesTabAddBtn = document.getElementById('classesTabAddBtn');
    if (classesTabAddBtn) {
        classesTabAddBtn.addEventListener('click', () => openClassEditor(null, 'tab'));
    }
    const eventsTabAddBtn = document.getElementById('eventsTabAddBtn');
    if (eventsTabAddBtn) {
        eventsTabAddBtn.addEventListener('click', () => openEventEditor(null, 'tab'));
    }
    initHomeworkTabListeners();
    const openSyllabusTabBtn = document.getElementById('openSyllabusTabBtn');
    if (openSyllabusTabBtn) {
        openSyllabusTabBtn.addEventListener('click', () => {
            const id = elements.classId && elements.classId.value;
            closeModal(elements.classModal);
            navigateToTab('syllabus', id ? { classId: id } : {});
        });
    }
    const classOpenSyllabusTabBtn = document.getElementById('classOpenSyllabusTabBtn');
    if (classOpenSyllabusTabBtn) {
        classOpenSyllabusTabBtn.addEventListener('click', () => {
            const id = elements.classId && elements.classId.value;
            if (id) {
                navigateToTab('syllabus', { classId: id });
            }
        });
    }
    const openClassInTabBtn = document.getElementById('openClassInTabBtn');
    if (openClassInTabBtn) {
        openClassInTabBtn.addEventListener('click', () => {
            const id = elements.classId && elements.classId.value;
            if (classEditorMount === 'tab' && getActiveTab() === 'classes') {
                if (id) {
                    viewClassInCalendar(id);
                }
                return;
            }
            closeModal(elements.classModal);
            navigateToTab('classes', id ? { classId: id } : { newClass: true });
        });
    }
    const openEventInTabBtn = document.getElementById('openEventInTabBtn');
    if (openEventInTabBtn) {
        openEventInTabBtn.addEventListener('click', () => {
            const id = elements.holidayId && elements.holidayId.value;
            if (eventEditorMount === 'tab' && getActiveTab() === 'events') {
                if (id) {
                    viewEventInCalendar(id);
                }
                return;
            }
            closeModal(elements.holidayModal);
            navigateToTab('events', id ? { eventId: id } : { newEvent: true });
        });
    }
    navigateToTab(appData.ui.activeTab || 'calendar');
}

function renderClassList() {
    const list = document.getElementById('classList');
    if (!list) {
        return;
    }
    const q = (document.getElementById('classListSearch')?.value || '').trim().toLowerCase();
    const selectedId = elements.classId?.value || '';
    list.innerHTML = '';
    const classes = getClassesInDisplayOrder().filter((c) => {
        if (!q) {
            return true;
        }
        const hay = [c.name, c.grade, c.book, c.levelCustom, formatClassLabelWithPeriod(c)].join(' ').toLowerCase();
        return hay.includes(q);
    });
    if (classes.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'module-list-empty';
        empty.style.padding = '12px';
        empty.style.color = 'var(--text-secondary)';
        empty.textContent = q ? t('lessonFilterSearchEmpty') : t('classEditorEmpty');
        list.appendChild(empty);
        return;
    }
    classes.forEach((c) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'module-list-item' + (c.id === selectedId ? ' is-selected' : '');
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', String(c.id === selectedId));
        btn.innerHTML = `<span>${escapeHtml(c.name)}</span><span class="module-list-item-meta">${escapeHtml([formatClassLabelWithPeriod(c), c.grade].filter(Boolean).join(' · '))}</span>`;
        btn.addEventListener('click', () => {
            openClassEditor(c, 'tab');
            renderClassList();
        });
        list.appendChild(btn);
    });
}

function renderEventList() {
    const list = document.getElementById('eventList');
    if (!list) {
        return;
    }
    const q = (document.getElementById('eventListSearch')?.value || '').trim().toLowerCase();
    const selectedId = elements.holidayId?.value || '';
    list.innerHTML = '';
    const events = [...(appData.events || [])].sort((a, b) => {
        const da = a.date || a.startDate || '';
        const db = b.date || b.startDate || '';
        return da.localeCompare(db);
    }).filter((ev) => {
        if (!q) {
            return true;
        }
        const hay = [getEventDisplayName(ev), ev.type, ev.notes].join(' ').toLowerCase();
        return hay.includes(q);
    });
    if (events.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'module-list-empty';
        empty.style.padding = '12px';
        empty.style.color = 'var(--text-secondary)';
        empty.textContent = q ? t('lessonFilterSearchEmpty') : t('eventEditorEmpty');
        list.appendChild(empty);
        return;
    }
    events.forEach((ev) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'module-list-item' + (ev.id === selectedId ? ' is-selected' : '');
        btn.setAttribute('role', 'option');
        const dateStr = ev.isRange
            ? `${ev.startDate || ''} – ${ev.endDate || ''}`
            : (ev.date || '');
        btn.innerHTML = `<span>${escapeHtml(getEventDisplayName(ev))}</span><span class="module-list-item-meta">${escapeHtml(dateStr)}</span>`;
        btn.addEventListener('click', () => {
            openEventEditor(ev, 'tab');
            renderEventList();
        });
        list.appendChild(btn);
    });
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ============================================
// Homework tab
// ============================================
function getHomeworkTabModule() {
    return typeof window !== 'undefined' ? window.CCPHomeworkTab : null;
}

function getHomeworkTabHooks() {
    return {
        getMeetingDays: (classData) => getMeetingDaysFromClass(classData),
        isHolidayForClass: (dateStr, classData) => isHolidayForClass(dateStr, classData),
        getHolidayForClass: (dateStr, classData) => {
            const holiday = getHolidayForDate(dateStr);
            if (!holiday || !isHolidayForClass(dateStr, classData)) {
                return null;
            }
            return getLocalizedHolidayRecord(holiday);
        }
    };
}

/** Month shown in homework tab mini calendar ({ year, month } with 0-based month). */
let homeworkRefCalendarView = null;

function getHomeworkReferenceDateFromUi() {
    const input = document.getElementById('homeworkReferenceDate');
    if (input && input.value) {
        return input.value;
    }
    const mod = getHomeworkTabModule();
    return mod ? mod.formatISO(new Date()) : formatDateISO(new Date());
}

function syncHomeworkRefCalendarViewToDate(isoDate) {
    const d = parseISODateLocal(isoDate);
    if (Number.isNaN(d.getTime())) {
        return;
    }
    homeworkRefCalendarView = { year: d.getFullYear(), month: d.getMonth() };
}

function getHomeworkRefCalendarView() {
    if (!homeworkRefCalendarView) {
        syncHomeworkRefCalendarViewToDate(getHomeworkReferenceDateFromUi());
    }
    return homeworkRefCalendarView;
}

function setHomeworkReferenceDate(isoDate, options = {}) {
    const input = document.getElementById('homeworkReferenceDate');
    if (!input || !isoDate) {
        return;
    }
    input.value = isoDate;
    if (options.syncView !== false) {
        syncHomeworkRefCalendarViewToDate(isoDate);
    }
    renderHomeworkReferenceMiniCalendar();
    renderHomeworkEditor();
}

function renderHomeworkReferenceMiniCalendar() {
    const container = document.getElementById('homeworkReferenceMiniCalendar');
    if (!container) {
        return;
    }
    const selectedIso = getHomeworkReferenceDateFromUi();
    const view = getHomeworkRefCalendarView();
    const year = view.year;
    const month = view.month;
    const todayIso = formatDateISO(new Date());
    const monthNames = t('monthNames');
    const dayNames = t('dayNamesShort');
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const weekdayHtml = dayNames.map((name) =>
        `<div class="homework-mini-cal-weekday">${escapeHtml(name)}</div>`
    ).join('');

    let daysHtml = '';
    for (let i = firstDay - 1; i >= 0; i -= 1) {
        const dayNum = prevMonthDays - i;
        daysHtml += `<button type="button" class="homework-mini-cal-day other-month" disabled>${dayNum}</button>`;
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const classes = ['homework-mini-cal-day'];
        if (dateStr === selectedIso) {
            classes.push('is-selected');
        }
        if (dateStr === todayIso) {
            classes.push('is-today');
        }
        daysHtml += `<button type="button" class="${classes.join(' ')}" data-date="${escapeAttr(dateStr)}">${day}</button>`;
    }
    const totalCells = firstDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remaining; i += 1) {
        daysHtml += `<button type="button" class="homework-mini-cal-day other-month" disabled>${i}</button>`;
    }

    const monthTitle = `${monthNames[month] || ''} ${year}`;
    container.innerHTML = `
        <div class="homework-mini-cal-nav">
            <button type="button" class="homework-mini-cal-nav-btn homework-mini-cal-prev" data-action="prev-month" aria-label="${escapeAttr(t('homeworkTabPrevMonth'))}">‹</button>
            <span class="homework-mini-cal-title">${escapeHtml(monthTitle)}</span>
            <button type="button" class="homework-mini-cal-nav-btn homework-mini-cal-next" data-action="next-month" aria-label="${escapeAttr(t('homeworkTabNextMonth'))}">›</button>
        </div>
        <div class="homework-mini-cal-weekdays" aria-hidden="true">${weekdayHtml}</div>
        <div class="homework-mini-cal-days" role="grid">${daysHtml}</div>`;

    const ariaLabel = container.getAttribute('data-i18n-aria-label');
    if (ariaLabel && t(ariaLabel)) {
        container.setAttribute('aria-label', t(ariaLabel));
    }
}

function initHomeworkTabControls() {
    const input = document.getElementById('homeworkReferenceDate');
    const miniCal = document.getElementById('homeworkReferenceMiniCalendar');
    if (!input) {
        return;
    }
    const mod = getHomeworkTabModule();
    if (!input.value) {
        input.value = mod ? mod.formatISO(new Date()) : formatDateISO(new Date());
    }
    syncHomeworkRefCalendarViewToDate(input.value);

    if (input.dataset.homeworkInit !== '1') {
        input.dataset.homeworkInit = '1';
        input.addEventListener('change', () => {
            syncHomeworkRefCalendarViewToDate(input.value);
            renderHomeworkReferenceMiniCalendar();
            renderHomeworkEditor();
        });
    }

    const todayBtn = document.getElementById('homeworkReferenceTodayBtn');
    if (todayBtn && todayBtn.dataset.homeworkInit !== '1') {
        todayBtn.dataset.homeworkInit = '1';
        todayBtn.addEventListener('click', () => {
            setHomeworkReferenceDate(formatDateISO(new Date()));
        });
    }

    if (miniCal && miniCal.dataset.homeworkInit !== '1') {
        miniCal.dataset.homeworkInit = '1';
        miniCal.addEventListener('click', (e) => {
            const dayBtn = e.target.closest('button[data-date]');
            if (dayBtn && dayBtn.dataset.date) {
                setHomeworkReferenceDate(dayBtn.dataset.date);
                return;
            }
            const navBtn = e.target.closest('button[data-action]');
            if (!navBtn) {
                return;
            }
            const view = getHomeworkRefCalendarView();
            if (navBtn.dataset.action === 'prev-month') {
                const d = new Date(view.year, view.month - 1, 1);
                homeworkRefCalendarView = { year: d.getFullYear(), month: d.getMonth() };
            } else if (navBtn.dataset.action === 'next-month') {
                const d = new Date(view.year, view.month + 1, 1);
                homeworkRefCalendarView = { year: d.getFullYear(), month: d.getMonth() };
            }
            renderHomeworkReferenceMiniCalendar();
        });
    }

    renderHomeworkReferenceMiniCalendar();
}

function computeHomeworkPacketForClass(classData) {
    const mod = getHomeworkTabModule();
    if (!mod) {
        return { messageKey: 'homeworkTabModuleMissing' };
    }
    syncHolidaysFromEvents();
    const rows = getSyllabusRowsForClass(classData, { preferMerged: true });
    return mod.computeHomeworkForClass({
        classData,
        syllabusRows: rows,
        referenceDate: getHomeworkReferenceDateFromUi(),
        hooks: getHomeworkTabHooks()
    });
}

function renderHomeworkClassList() {
    const list = document.getElementById('homeworkClassList');
    if (!list) {
        return;
    }
    ensureUiState();
    const q = (document.getElementById('homeworkClassListSearch')?.value || '').trim().toLowerCase();
    const selectedId = appData.ui.homeworkTabClassId || '';
    list.innerHTML = '';
    const classes = getClassesInDisplayOrder().filter((c) => {
        if (!q) {
            return true;
        }
        const hay = [c.name, c.grade, c.book, c.levelCustom, formatClassLabelWithPeriod(c)].join(' ').toLowerCase();
        return hay.includes(q);
    });
    if (classes.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'module-list-empty';
        empty.style.padding = '12px';
        empty.style.color = 'var(--text-secondary)';
        empty.textContent = q ? t('lessonFilterSearchEmpty') : t('classEditorEmpty');
        list.appendChild(empty);
        return;
    }
    classes.forEach((c) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'module-list-item' + (c.id === selectedId ? ' is-selected' : '');
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', String(c.id === selectedId));
        btn.innerHTML = `<span>${escapeHtml(c.name)}</span><span class="module-list-item-meta">${escapeHtml([formatClassLabelWithPeriod(c), c.grade].filter(Boolean).join(' · '))}</span>`;
        btn.addEventListener('click', () => {
            appData.ui.homeworkTabClassId = c.id;
            saveData();
            renderHomeworkClassList();
            renderHomeworkEditor();
        });
        list.appendChild(btn);
    });
}

/** Active homework tab editor state (class + packet row ids for syllabus save). */
let homeworkEditorState = null;

function ensureClassSyllabusRowsForHomeworkEdit(classData) {
    const mod = getSyllabusModule();
    const generated = buildGeneratedSyllabusRows(classData);
    let saved = Array.isArray(classData.syllabusRows) ? classData.syllabusRows : [];
    if (!saved.length && generated.length) {
        classData.syllabusRows = generated.map((r) => ({ ...r }));
        return classData.syllabusRows;
    }
    if (mod && generated.length) {
        classData.syllabusRows = mod.mergeSyllabusRows(saved, generated);
        return classData.syllabusRows;
    }
    return saved;
}

function findSyllabusRowInClass(classData, rowId) {
    if (!classData || !rowId) {
        return null;
    }
    const rows = ensureClassSyllabusRowsForHomeworkEdit(classData);
    let row = rows.find((r) => r.id === rowId);
    if (row) {
        return row;
    }
    const merged = getSyllabusRowsForClass(classData, { preferMerged: true });
    row = merged.find((r) => r.id === rowId);
    if (!row) {
        return null;
    }
    rows.push({ ...row });
    classData.syllabusRows = rows;
    return row;
}

function saveHomeworkDetailToSyllabus(classData, rowId, planDetail) {
    const row = findSyllabusRowInClass(classData, rowId);
    if (!row) {
        return false;
    }
    row.planDetail = planDetail;
    if (row.source === 'generated') {
        row.source = 'edited';
    }
    const idx = appData.classes.findIndex((c) => c.id === classData.id);
    if (idx >= 0) {
        appData.classes[idx].syllabusRows = classData.syllabusRows;
    }
    saveData();
    return true;
}

function updateHomeworkSourceHints(packet) {
    const gradingHint = document.getElementById('homeworkGradingSourceHint');
    const assignHint = document.getElementById('homeworkAssignSourceHint');
    if (gradingHint) {
        if (packet && packet.gradingSourceRowId) {
            gradingHint.textContent = t('homeworkTabSavesTo')
                .replace('{n}', String(packet.targetSessionNumber || ''))
                .replace('{title}', packet.targetLessonTitle || '');
            gradingHint.hidden = false;
        } else {
            gradingHint.hidden = true;
        }
    }
    if (assignHint) {
        if (packet && packet.assignSourceRowId) {
            assignHint.textContent = t('homeworkTabSavesTo')
                .replace('{n}', String(packet.assignSourceSessionNumber || packet.dueSessionNumber || ''))
                .replace('{title}', packet.assignSourceTitle || '');
            assignHint.hidden = false;
        } else {
            assignHint.hidden = true;
        }
    }
}

function persistHomeworkTextareaToSyllabus(kind) {
    const state = homeworkEditorState;
    if (!state || !state.classId || !state.packet) {
        return false;
    }
    const classData = appData.classes.find((c) => c.id === state.classId);
    if (!classData) {
        return false;
    }
    const packet = state.packet;
    const rowId = kind === 'grading' ? packet.gradingSourceRowId : packet.assignSourceRowId;
    const el = document.getElementById(kind === 'grading' ? 'homeworkGradingText' : 'homeworkAssignText');
    if (!rowId || !el) {
        setAppStatusMessage(t('homeworkTabNoSyllabusRow'), true);
        return false;
    }
    const body = el.value;
    const ok = saveHomeworkDetailToSyllabus(classData, rowId, body);
    if (!ok) {
        setAppStatusMessage(t('homeworkTabNoSyllabusRow'), true);
        return false;
    }
    if (kind === 'grading') {
        packet.gradingHomework = body.trim();
    } else {
        packet.assignHomework = body.trim();
    }
    setAppStatusMessage(t('homeworkTabSaved'), false);
    return true;
}

let debouncedSaveHomeworkGrading = null;
let debouncedSaveHomeworkAssign = null;

function formatHomeworkPasteBlock(text, classData, packet, kind) {
    const mod = getHomeworkTabModule();
    if (!mod) {
        return (text || '').trim();
    }
    const opts = {
        includeHeader: true,
        className: classData.name,
        sessionLabel: t('homeworkTabSessionLabel'),
        sessionNumber: packet.targetSessionNumber
    };
    if (kind === 'assign') {
        opts.dueLabel = t('homeworkTabDueLabel');
        opts.dueDateLabel = packet.dueDate ? formatDateDisplay(packet.dueDate) : '';
    }
    return mod.formatHomeworkBlock(text, opts);
}

function renderHomeworkDueDateSkips(packet) {
    const container = document.getElementById('homeworkDueDateSkips');
    if (!container) {
        return;
    }
    const skipped = packet && Array.isArray(packet.skippedClassDates) ? packet.skippedClassDates : [];
    container.replaceChildren();
    if (!skipped.length) {
        container.hidden = true;
        return;
    }
    container.hidden = false;
    const heading = document.createElement('p');
    heading.className = 'homework-due-skips-heading';
    heading.textContent = t('homeworkTabSkippedHeading');
    container.appendChild(heading);
    const list = document.createElement('ul');
    list.className = 'homework-due-skips-list';
    skipped.forEach((item) => {
        const li = document.createElement('li');
        const dateLabel = formatDateDisplay(item.date);
        const templateKey = item.label ? 'homeworkTabSkipHoliday' : 'homeworkTabSkipHolidayNoName';
        li.textContent = t(templateKey)
            .replace('{date}', dateLabel)
            .replace('{name}', item.label || '');
        list.appendChild(li);
    });
    container.appendChild(list);
}

function renderHomeworkEditor() {
    const empty = document.getElementById('homeworkEditorEmpty');
    const content = document.getElementById('homeworkEditorContent');
    const gradingEl = document.getElementById('homeworkGradingText');
    const assignEl = document.getElementById('homeworkAssignText');
    const dueEl = document.getElementById('homeworkDueDateDisplay');
    const metaEl = document.getElementById('homeworkTargetLessonMeta');
    const msgEl = document.getElementById('homeworkTabMessage');
    const titleEl = document.getElementById('homeworkClassTitle');
    const classMetaEl = document.getElementById('homeworkClassMeta');
    if (!empty || !content) {
        return;
    }
    ensureUiState();
    const classId = appData.ui.homeworkTabClassId;
    const classData = classId ? appData.classes.find((c) => c.id === classId) : null;
    if (!classData) {
        empty.hidden = false;
        content.hidden = true;
        return;
    }
    empty.hidden = true;
    content.hidden = false;
    if (titleEl) {
        titleEl.textContent = classData.name;
    }
    if (classMetaEl) {
        classMetaEl.textContent = [formatClassLabelWithPeriod(classData), classData.grade, classData.book]
            .filter(Boolean)
            .join(' · ');
    }
    renderHomeworkSourceBook(classData);
    const packet = computeHomeworkPacketForClass(classData);
    homeworkEditorState = { classId: classData.id, packet };
    if (gradingEl) {
        gradingEl.value = packet.gradingHomework || '';
        gradingEl.disabled = !packet.gradingSourceRowId;
    }
    if (assignEl) {
        assignEl.value = packet.assignHomework || '';
        assignEl.disabled = !packet.assignSourceRowId;
    }
    updateHomeworkSourceHints(packet);
    if (dueEl) {
        dueEl.textContent = packet.dueDate ? formatDateDisplay(packet.dueDate) : '—';
    }
    renderHomeworkDueDateSkips(packet);
    if (metaEl) {
        const parts = [];
        if (packet.targetLessonDate) {
            parts.push(t('homeworkTabTargetLesson', {
                date: formatDateDisplay(packet.targetLessonDate),
                n: packet.targetSessionNumber,
                title: packet.targetLessonTitle || ''
            }));
        }
        if (packet.targetSessionNumber > 0 && packet.targetLessonDate) {
            parts.push(t('homeworkTabGradingFrom', {
                n: packet.targetSessionNumber,
                date: formatDateDisplay(packet.targetLessonDate),
                title: packet.targetLessonTitle || ''
            }));
        }
        metaEl.textContent = parts.join(' · ');
    }
    if (msgEl) {
        if (packet.messageKey) {
            msgEl.hidden = false;
            msgEl.textContent = t(packet.messageKey);
        } else {
            msgEl.hidden = true;
            msgEl.textContent = '';
        }
    }
}

async function copyTextToClipboard(text) {
    const value = (text || '').trim();
    if (!value) {
        return false;
    }
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch (e) {
        /* fallback below */
    }
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch (e2) {
        ok = false;
    }
    document.body.removeChild(ta);
    return ok;
}

const NOTIFY_MS_OUT = 360;

function afterNotificationTransition(el, onDone) {
    if (!el) {
        onDone();
        return;
    }
    let done = false;
    const finish = () => {
        if (done) {
            return;
        }
        done = true;
        el.removeEventListener('transitionend', onTransitionEnd);
        onDone();
    };
    const onTransitionEnd = (e) => {
        if (e.target === el && (e.propertyName === 'opacity' || e.propertyName === 'transform')) {
            finish();
        }
    };
    el.addEventListener('transitionend', onTransitionEnd);
    window.setTimeout(finish, NOTIFY_MS_OUT + 80);
}

function dismissAppStatus(el) {
    if (!el || !el.classList.contains('app-status-visible')) {
        return;
    }
    el.classList.remove('app-status-visible');
    afterNotificationTransition(el, () => {
        el.classList.remove('app-status-error', 'app-status-lock');
        el.textContent = '';
    });
}

function setAppStatusMessage(message, isError, durationMs) {
    const el = document.getElementById('appStatus');
    if (!el || !message) {
        return;
    }
    if (setAppStatusMessage._timer) {
        clearTimeout(setAppStatusMessage._timer);
    }
    const apply = () => {
        el.textContent = message;
        el.className = 'app-status' + (isError ? ' app-status-error' : ' app-status-lock');
        requestAnimationFrame(() => {
            el.classList.add('app-status-visible');
        });
        const ms = typeof durationMs === 'number' ? durationMs : 5000;
        setAppStatusMessage._timer = setTimeout(() => dismissAppStatus(el), ms);
    };
    if (el.classList.contains('app-status-visible')) {
        el.textContent = message;
        el.classList.toggle('app-status-error', !!isError);
        el.classList.toggle('app-status-lock', !isError);
        const ms = typeof durationMs === 'number' ? durationMs : 5000;
        setAppStatusMessage._timer = setTimeout(() => dismissAppStatus(el), ms);
        return;
    }
    if (el.textContent && !el.classList.contains('app-status-visible')) {
        afterNotificationTransition(el, apply);
        return;
    }
    apply();
}

function showHomeworkCopyStatus(ok) {
    setAppStatusMessage(
        ok ? t('homeworkTabCopied') : t('homeworkTabCopyFailed'),
        !ok
    );
}

function initHomeworkTabListeners() {
    if (!debouncedSaveHomeworkGrading && typeof debounce === 'function') {
        debouncedSaveHomeworkGrading = debounce(() => persistHomeworkTextareaToSyllabus('grading'), 600);
        debouncedSaveHomeworkAssign = debounce(() => persistHomeworkTextareaToSyllabus('assign'), 600);
    }
    const search = document.getElementById('homeworkClassListSearch');
    if (search && !search.dataset.homeworkInit) {
        search.dataset.homeworkInit = '1';
        search.addEventListener('input', () => renderHomeworkClassList());
    }
    const refreshBtn = document.getElementById('homeworkRefreshSyllabiBtn');
    if (refreshBtn && !refreshBtn.dataset.homeworkInit) {
        refreshBtn.dataset.homeworkInit = '1';
        refreshBtn.addEventListener('click', () => {
            if (syncAllClassSyllabusRowsFromCalendar()) {
                renderHomeworkEditor();
                setAppStatusMessage(t('homeworkTabSyllabiRefreshed'), false);
            }
        });
    }
    const openClassBtn = document.getElementById('homeworkOpenClassBtn');
    if (openClassBtn && !openClassBtn.dataset.homeworkInit) {
        openClassBtn.dataset.homeworkInit = '1';
        openClassBtn.addEventListener('click', () => {
            const id = appData.ui.homeworkTabClassId;
            if (id) {
                navigateToTab('syllabus', { classId: id });
            }
        });
    }
    const gradingTa = document.getElementById('homeworkGradingText');
    if (gradingTa && !gradingTa.dataset.homeworkInit) {
        gradingTa.dataset.homeworkInit = '1';
        gradingTa.addEventListener('input', () => debouncedSaveHomeworkGrading());
        gradingTa.addEventListener('blur', () => persistHomeworkTextareaToSyllabus('grading'));
    }
    const assignTa = document.getElementById('homeworkAssignText');
    if (assignTa && !assignTa.dataset.homeworkInit) {
        assignTa.dataset.homeworkInit = '1';
        assignTa.addEventListener('input', () => debouncedSaveHomeworkAssign());
        assignTa.addEventListener('blur', () => persistHomeworkTextareaToSyllabus('assign'));
    }
    const copyGrading = document.getElementById('homeworkCopyGradingBtn');
    if (copyGrading && !copyGrading.dataset.homeworkInit) {
        copyGrading.dataset.homeworkInit = '1';
        copyGrading.addEventListener('click', async () => {
            const state = homeworkEditorState;
            const classData = state?.classId
                ? appData.classes.find((c) => c.id === state.classId)
                : null;
            const body = document.getElementById('homeworkGradingText')?.value || '';
            const formatted = classData && state?.packet
                ? formatHomeworkPasteBlock(body, classData, state.packet, 'grading')
                : body;
            showHomeworkCopyStatus(await copyTextToClipboard(formatted));
        });
    }
    const copyAssign = document.getElementById('homeworkCopyAssignBtn');
    if (copyAssign && !copyAssign.dataset.homeworkInit) {
        copyAssign.dataset.homeworkInit = '1';
        copyAssign.addEventListener('click', async () => {
            const state = homeworkEditorState;
            const classData = state?.classId
                ? appData.classes.find((c) => c.id === state.classId)
                : null;
            const body = document.getElementById('homeworkAssignText')?.value || '';
            const formatted = classData && state?.packet
                ? formatHomeworkPasteBlock(body, classData, state.packet, 'assign')
                : body;
            showHomeworkCopyStatus(await copyTextToClipboard(formatted));
        });
    }
    const copyBoth = document.getElementById('homeworkCopyBothBtn');
    if (copyBoth && !copyBoth.dataset.homeworkInit) {
        copyBoth.dataset.homeworkInit = '1';
        copyBoth.addEventListener('click', async () => {
            const state = homeworkEditorState;
            const classData = state?.classId
                ? appData.classes.find((c) => c.id === state.classId)
                : null;
            const packet = state?.packet;
            const gBody = document.getElementById('homeworkGradingText')?.value || '';
            const aBody = document.getElementById('homeworkAssignText')?.value || '';
            const g = classData && packet
                ? formatHomeworkPasteBlock(gBody, classData, packet, 'grading')
                : gBody.trim();
            const a = classData && packet
                ? formatHomeworkPasteBlock(aBody, classData, packet, 'assign')
                : aBody.trim();
            const due = document.getElementById('homeworkDueDateDisplay')?.textContent || '';
            const combined = [
                '=== ' + t('homeworkTabGradingTitle') + ' ===',
                g.trim(),
                '',
                '=== ' + t('homeworkTabAssignTitle') + ' ===',
                t('homeworkTabDueLabel') + ': ' + due,
                a.trim()
            ].join('\n');
            showHomeworkCopyStatus(await copyTextToClipboard(combined));
        });
    }
}

function openClassEditor(classData, context, options = {}) {
    const ctx = context || (getActiveTab() === 'classes' ? 'tab' : 'calendar-popout');
    populateClassForm(classData, options);
    if (ctx === 'tab') {
        navigateToTab('classes');
        mountClassForm('tab');
        updateClassEditorEmptyState();
        renderClassList();
    } else {
        mountClassForm('modal');
        openModal(elements.classModal);
    }
}

function openEventEditor(holidayData, context, options = {}) {
    const ctx = context || (getActiveTab() === 'events' ? 'tab' : 'calendar-popout');
    populateHolidayForm(holidayData, options);
    if (ctx === 'tab') {
        navigateToTab('events');
        mountHolidayForm('tab');
        updateEventEditorEmptyState();
        renderEventList();
    } else {
        mountHolidayForm('modal');
        openModal(elements.holidayModal);
    }
}

// ============================================
// DOM Elements
// ============================================
const elements = {
    calendarName: document.getElementById('calendarName'),
    termStart: document.getElementById('termStart'),
    termMonthCount: document.getElementById('termMonthCount'),
    calendarContainer: document.getElementById('calendarContainer'),
    
    // Class Modal
    classModal: document.getElementById('classModal'),
    classForm: document.getElementById('classForm'),
    classModalTitle: document.getElementById('classModalTitle'),
    classId: document.getElementById('classId'),
    className: document.getElementById('className'),
    classPeriod: document.getElementById('classPeriod'),
    classLevel: document.getElementById('classLevel'),
    classLevelCustom: document.getElementById('classLevelCustom'),
    classGrade: document.getElementById('classGrade'),
    classBook: document.getElementById('classBook'),
    booksByMonthRows: document.getElementById('booksByMonthRows'),
    addBookMonthRowBtn: document.getElementById('addBookMonthRowBtn'),
    fillBooksFromDefaultBtn: document.getElementById('fillBooksFromDefaultBtn'),
    syllabusUnitsRows: document.getElementById('syllabusUnitsRows'),
    addSyllabusUnitBtn: document.getElementById('addSyllabusUnitBtn'),
    syllabusTableBody: document.getElementById('syllabusTableBody'),
    syllabusTableEmptyHint: document.getElementById('syllabusTableEmptyHint'),
    refreshSyllabusBtn: document.getElementById('refreshSyllabusBtn'),
    fillSyllabusFromUnitsBtn: document.getElementById('fillSyllabusFromUnitsBtn'),
    applyPresetSyllabusBtn: document.getElementById('applyPresetSyllabusBtn'),
    addSyllabusNoteRowBtn: document.getElementById('addSyllabusNoteRowBtn'),
    homeworkImportPaste: document.getElementById('homeworkImportPaste'),
    homeworkImportPreviewBtn: document.getElementById('homeworkImportPreviewBtn'),
    homeworkImportApplyBtn: document.getElementById('homeworkImportApplyBtn'),
    homeworkImportPreview: document.getElementById('homeworkImportPreview'),
    classNotes: document.getElementById('classNotes'),
    classStartDate: document.getElementById('classStartDate'),
    classEndDate: document.getElementById('classEndDate'),
    classTermMonths: document.getElementById('classTermMonths'),
    classUseAutoTermEnd: document.getElementById('classUseAutoTermEnd'),
    classTotalLessons: document.getElementById('classTotalLessons'),
    classTypeSelect: document.getElementById('classTypeSelect'),
    classMeetingDaysRow: document.getElementById('classMeetingDaysRow'),
    openClassTypeModalBtn: document.getElementById('openClassTypeModalBtn'),
    deleteCustomClassTypeBtn: document.getElementById('deleteCustomClassTypeBtn'),
    classTypeModal: document.getElementById('classTypeModal'),
    classTypeForm: document.getElementById('classTypeForm'),
    classColor: document.getElementById('classColor'),
    classTextColor: document.getElementById('classTextColor'),
    customScheduleEnabled: document.getElementById('customScheduleEnabled'),
    customScheduleSection: document.getElementById('customScheduleSection'),
    customLessonDates: document.getElementById('customLessonDates'),
    compressionCheckboxes: document.getElementById('compressionCheckboxes'),
    deleteClassBtn: document.getElementById('deleteClassBtn'),
    
    // Holiday Modal
    holidayModal: document.getElementById('holidayModal'),
    holidayForm: document.getElementById('holidayForm'),
    holidayModalTitle: document.getElementById('holidayModalTitle'),
    holidayId: document.getElementById('holidayId'),
    eventType: document.getElementById('eventType'),
    eventNotes: document.getElementById('eventNotes'),
    holidayName: document.getElementById('holidayName'),
    holidayIsRange: document.getElementById('holidayIsRange'),
    holidaySingleDate: document.getElementById('holidaySingleDate'),
    holidayDate: document.getElementById('holidayDate'),
    holidayDateRange: document.getElementById('holidayDateRange'),
    holidayStartDate: document.getElementById('holidayStartDate'),
    holidayEndDate: document.getElementById('holidayEndDate'),
    holidayBgColor: document.getElementById('holidayBgColor'),
    holidayTextColor: document.getElementById('holidayTextColor'),
    holidayAllClasses: document.getElementById('holidayAllClasses'),
    deleteHolidayBtn: document.getElementById('deleteHolidayBtn'),
    
    // Print (tab panel + options modal)
    printForm: document.getElementById('printForm'),
    printOptionsModal: document.getElementById('printOptionsModal'),
    
    // Popup
    classPopup: document.getElementById('classPopup'),
    
    // Print Summary
    printSummary: document.getElementById('printSummary'),
    classSummaryTable: document.getElementById('classSummaryTable'),
    eventSummaryTable: document.getElementById('eventSummaryTable'),
    lessonScheduleSummary: document.getElementById('lessonScheduleSummary'),
    compressionNotes: document.getElementById('compressionNotes'),
    syllabusTablesSummary: document.getElementById('syllabusTablesSummary')
};

// ============================================
// School grade UI (Korean grades — built in JS so labels stay correct even if index.html encoding breaks)
// ============================================
const SCHOOL_GRADE_OPTIONS = (() => {
    const elem = '\uCD08';
    const mid = '\uC911';
    return [elem + '1', elem + '2', elem + '3', elem + '4', elem + '5', elem + '6', mid + '1', mid + '2', mid + '3'];
})();

/** Simson standard level names (stored in class.levelPreset and holiday.sectionLevels). */
const SIMSON_LEVEL_GROUPS = (() => {
    const mid = '\uC911';
    const mid1 = mid + '1';
    const mid2 = mid + '2';
    const mid3 = mid + '3';
    return [
        {
            id: 'elementary',
            labelKey: 'simsonLevelsElementary',
            fallbackLabel: 'Elementary',
            levels: [
                { id: 'Red', name: 'Red', grade: null },
                { id: 'Orange', name: 'Orange', grade: null },
                { id: 'Yellow', name: 'Yellow', grade: null },
                { id: 'Green', name: 'Green', grade: null },
                { id: 'Blue', name: 'Blue', grade: null },
                { id: 'Navy', name: 'Navy', grade: null },
                { id: 'Purple', name: 'Purple', grade: null },
                { id: 'Yeoul', name: 'Yeoul', grade: null },
                { id: 'Saemmul', name: 'Saemmul', grade: null },
                { id: 'Garam', name: 'Garam', grade: null },
                { id: 'Bada', name: 'Bada', grade: null },
                { id: 'Byeolmaru', name: 'Byeolmaru', grade: null },
                { id: 'Mirinae', name: 'Mirinae', grade: null }
            ]
        },
        {
            id: 'middle',
            labelKey: 'simsonLevelsMiddleSchool',
            fallbackLabel: 'Middle school',
            levels: [
                { id: '\uC720\uB9C8', name: '\uC720\uB9C8', grade: mid1 },
                { id: '\uB808\uC624', name: '\uB808\uC624', grade: mid1 },
                { id: '\uD30C\uBCF4', name: '\uD30C\uBCF4', grade: mid1 },
                { id: '\uD3F4\uB77C', name: '\uD3F4\uB77C', grade: mid1 },
                { id: '\uD649\uC2A4', name: '\uD649\uC2A4', grade: mid2 },
                { id: '\uD2F0\uCE74', name: '\uD2F0\uCE74', grade: mid2 },
                { id: '\uBE45\uD0A4', name: '\uBE45\uD0A4', grade: mid2 },
                { id: '\uBC14\uC774\uCEEC', name: '\uBC14\uC774\uCEEC', grade: mid2 },
                { id: '\uC548\uB098', name: '\uC548\uB098', grade: mid3 },
                { id: '\uB0AD\uAC00', name: '\uB0AD\uAC00', grade: mid3 },
                { id: '\uB85C\uCCB4', name: '\uB85C\uCCB4', grade: mid3 },
                { id: '\uCE89\uCCB8', name: '\uCE89\uCCB8', grade: mid3 }
            ]
        }
    ];
})();

const LEGACY_SECTION_PRESETS = ['A', 'B', 'C'];

function getAllSimsonLevels() {
    return SIMSON_LEVEL_GROUPS.flatMap(g => g.levels);
}

function getSimsonLevelById(id) {
    const v = (id || '').trim();
    if (!v) {
        return null;
    }
    return getAllSimsonLevels().find(l => l.id === v) || null;
}

function isSimsonLevelPreset(value) {
    return !!getSimsonLevelById(value);
}

function isLegacySectionPreset(value) {
    return LEGACY_SECTION_PRESETS.includes((value || '').trim());
}

function resolveLevelPresetForForm(classData) {
    if (!classData) {
        return '';
    }
    const preset = (classData.levelPreset != null ? classData.levelPreset : '').trim();
    if (isSimsonLevelPreset(preset)) {
        return preset;
    }
    const leg = (classData.level || '').trim();
    if (isSimsonLevelPreset(leg)) {
        return leg;
    }
    return '';
}

function resolveLevelCustomForForm(classData) {
    if (!classData) {
        return '';
    }
    const custom = (classData.levelCustom || '').trim();
    if (custom) {
        return custom;
    }
    const preset = (classData.levelPreset || '').trim();
    if (isLegacySectionPreset(preset)) {
        return preset;
    }
    const leg = (classData.level || '').trim();
    if (leg && !isSimsonLevelPreset(leg) && !isLegacySectionPreset(leg)) {
        return leg;
    }
    if (preset && !isSimsonLevelPreset(preset) && !isLegacySectionPreset(preset)) {
        return preset;
    }
    return '';
}

function setupSimsonLevelPresetSelect() {
    const sel = document.getElementById('classLevel');
    if (!sel) {
        return;
    }
    const prev = sel.value;
    sel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.setAttribute('data-i18n', 'selectLevel');
    ph.textContent = t('selectLevel');
    sel.appendChild(ph);
    SIMSON_LEVEL_GROUPS.forEach(group => {
        const og = document.createElement('optgroup');
        og.label = t(group.labelKey) || group.fallbackLabel;
        group.levels.forEach(level => {
            const o = document.createElement('option');
            o.value = level.id;
            o.textContent = level.name;
            og.appendChild(o);
        });
        sel.appendChild(og);
    });
    if (prev && Array.from(sel.options).some(o => o.value === prev)) {
        sel.value = prev;
    }
}

function handleClassLevelPresetChange() {
    if (!elements.classLevel || !elements.classGrade) {
        return;
    }
    const def = getSimsonLevelById(elements.classLevel.value);
    if (def && def.grade) {
        elements.classGrade.value = def.grade;
    }
}

function setupSimsonLevelControls() {
    setupSimsonLevelPresetSelect();
}

function setupSchoolGradeControls() {
    const classSel = document.getElementById('classGrade');
    if (classSel) {
        const firstOpt = classSel.querySelector('option[value=""]');
        classSel.innerHTML = '';
        if (firstOpt) {
            const ph = firstOpt.cloneNode(true);
            if (!ph.getAttribute('data-i18n')) {
                ph.setAttribute('data-i18n', 'selectGrade');
            }
            classSel.appendChild(ph);
        } else {
            const opt = document.createElement('option');
            opt.value = '';
            opt.setAttribute('data-i18n', 'selectGrade');
            opt.textContent = t('selectGrade');
            classSel.appendChild(opt);
        }
        SCHOOL_GRADE_OPTIONS.forEach(code => {
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = code;
            classSel.appendChild(opt);
        });
    }

}

/** Fix broken markup like `??? ?????/button>` from bad saves / wrong encoding. */
function repairCorruptedLangToggleButton() {
    const btn = document.getElementById('langToggleBtn');
    if (!btn || btn.tagName !== 'BUTTON') {
        return;
    }
    const raw = btn.outerHTML || '';
    const text = (btn.textContent || '').trim();
    const hasHangul = /[\uAC00-\uD7A3]/.test(text);
    if (raw.includes('/button>') && !raw.toLowerCase().includes('</button>')) {
        const parent = btn.parentNode;
        const next = document.createElement('button');
        next.id = 'langToggleBtn';
        next.type = 'button';
        next.className = 'btn btn-outline btn-lang';
        parent.replaceChild(next, btn);
        return;
    }
    if (!hasHangul && !text.includes('English') && (text.includes('?') || text.length < 2)) {
        const parent = btn.parentNode;
        const next = document.createElement('button');
        next.id = 'langToggleBtn';
        next.type = 'button';
        next.className = 'btn btn-outline btn-lang';
        parent.replaceChild(next, btn);
    }
}

// ============================================
// Initialization
// ============================================
function getCalendarOptionsTermSelector() {
    const termSelector = document.querySelector('#topBarDetails .term-selector');
    if (!termSelector || termSelector.closest('#teamCalendarRow')) {
        return null;
    }
    return termSelector;
}

function cleanupMisplacedKrHolidayControls() {
    const teamRow = document.getElementById('teamCalendarRow');
    if (!teamRow) {
        return;
    }
    teamRow.querySelectorAll('#fetchKrHolidaysBtn, #krHolidaysSourceHint').forEach((el) => el.remove());
}

function ensureKrHolidaysSourceHint() {
    if (document.getElementById('krHolidaysSourceHint')) {
        return;
    }
    const termSelector = getCalendarOptionsTermSelector();
    if (!termSelector) {
        return;
    }
    const hint = document.createElement('p');
    hint.id = 'krHolidaysSourceHint';
    hint.className = 'kr-holidays-source-hint';
    hint.setAttribute('data-i18n', 'krHolidaysSourceHint');
    hint.textContent = t('krHolidaysSourceHint');
    termSelector.appendChild(hint);
}

function ensureKrHolidaysImportButton() {
    if (document.getElementById('fetchKrHolidaysBtn')) {
        return;
    }
    const termSelector = getCalendarOptionsTermSelector();
    if (!termSelector) {
        return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'fetchKrHolidaysBtn';
    btn.className = 'btn btn-outline';
    btn.setAttribute('data-i18n', 'fetchKrHolidays');
    btn.textContent = t('fetchKrHolidays');
    btn.addEventListener('click', importKoreanPublicHolidays);
    termSelector.appendChild(btn);
}

function warnIfOpenedFromNetworkFile() {
    if (window.location.protocol !== 'file:') {
        return;
    }
    const banner = document.getElementById('openFromDriveBanner');
    if (banner) {
        banner.style.display = 'block';
    }
}

function getBookIdForClass(classData) {
    if (!classData || !window.CCPBooksEditor || !window.CCPBooksEditor.deriveBookKey) {
        return null;
    }
    const def = getClassTypeDefinitionById(classData.classTypeId);
    if (def) {
        return window.CCPBooksEditor.deriveBookKey(def);
    }
    return null;
}

function getBookIdForSelectedHomeworkClass() {
    ensureUiState();
    const classId = appData.ui.homeworkTabClassId;
    if (!classId) {
        return null;
    }
    const classData = appData.classes.find((c) => c.id === classId);
    return classData ? getBookIdForClass(classData) : null;
}

function renderHomeworkSourceBook(classData) {
    const row = document.getElementById('homeworkSourceBookRow');
    const nameEl = document.getElementById('homeworkSourceBookName');
    const editBtn = document.getElementById('homeworkEditBookBtn');
    if (!row || !nameEl) {
        return;
    }
    const bookId = getBookIdForClass(classData);
    if (!bookId || !window.CCPBooksEditor) {
        row.hidden = true;
        return;
    }
    const book = window.CCPBooksEditor.getBookById(bookId, appData);
    row.hidden = false;
    nameEl.textContent = book ? book.name : bookId;
    if (editBtn) {
        editBtn.dataset.bookId = bookId;
    }
}

function openWorkspacePage(tab, bookId) {
    const params = new URLSearchParams();
    params.set('tab', tab === 'books' ? 'books' : 'homework');
    if (bookId) {
        params.set('book', String(bookId));
    }
    if (typeof CalendarSync !== 'undefined' && CalendarSync.getActiveCalendarId) {
        const calId = CalendarSync.getActiveCalendarId();
        if (calId) {
            try {
                localStorage.setItem('teamCalendarActiveId', calId);
            } catch (_) {
                /* ignore */
            }
        }
    }
    window.open('/workspace.html?' + params.toString(), '_blank', 'noopener');
}

async function reloadWorkspaceCalendar() {
    if (typeof CalendarSync === 'undefined' || !teamSyncEnabled) {
        return;
    }
    const id = CalendarSync.getActiveCalendarId();
    if (!id) {
        return;
    }
    const doc = await CalendarSync.loadCalendar(id);
    applyServerDocument(doc);
    if (typeof renderHomeworkClassList === 'function') {
        renderHomeworkClassList();
    }
    if (typeof renderHomeworkEditor === 'function') {
        renderHomeworkEditor();
    }
    const banner = document.getElementById('workspaceRemoteBanner');
    if (banner) {
        banner.hidden = true;
    }
    CalendarSync.state.remoteNewer = false;
    const label = document.getElementById('workspaceCalendarLabel');
    if (label) {
        label.textContent = appData.calendarName || '';
    }
    setAppStatusMessage(t('syncReload') || 'Reloaded', false);
}

if (typeof window !== 'undefined') {
    window.openWorkspacePage = openWorkspacePage;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (document.body.classList.contains('workspace-page')) {
        return;
    }
    ensureClassFormExtendedMarkup();
    repairCorruptedLangToggleButton();
    setupTeamLockButtons();
    setupTeamLockPendingButtons();
    setupTeamLockDebugPanel();
    loadLanguage();
    loadTheme();
    warnIfOpenedFromNetworkFile();
    if (typeof TeamAuth !== 'undefined' && location.protocol !== 'file:') {
        try {
            await TeamAuth.ensure();
            setupTeamUserBar();
        } catch (e) {
            if (e && e.message === 'redirect') {
                return;
            }
        }
    }
    setupSchoolGradeControls();
    setupSimsonLevelControls();
    setupClassMeetingDaysUI();
    bindClassScheduleInputsForSyllabusDistribute();
    loadData();
    initDefaultClassEditorModule();
    initBooksEditorModule();
    await initTeamSync();
    initializeTermStart();
    cleanupMisplacedKrHolidayControls();
    ensureKrHolidaysImportButton();
    ensureKrHolidaysSourceHint();
    setupEventListeners();
    initAppTabs();
    initCalendarContextMenu();
    initTopBarToggle();
    initAppChromeStickyTop();
    applyLanguage();
    renderCalendar();
    requestAnimationFrame(syncAppChromeStickyTop);
});

function initializeTermStart() {
    ensureUiState();
    if (!appData.termStart) {
        const now = new Date();
        appData.termStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    if (!appData.termMonthCount) {
        appData.termMonthCount = SCHEDULE_CONFIG.defaultTermCalendarMonths;
    }
    elements.termStart.value = appData.termStart;
    if (elements.termMonthCount) {
        elements.termMonthCount.value = String(getTermMonthCount());
    }
    elements.calendarName.value = appData.calendarName || '';
    updateCalendarTitle();
    updateTopBarCalendarLabel();
    applyVisibilityFiltersToDom();
    syncHolidaysFromEvents();
}

// ============================================
// Event Listeners Setup
// ============================================
function setupEventListeners() {
    const openWsHomework = document.getElementById('openWorkspaceHomeworkBtn');
    if (openWsHomework && openWsHomework.dataset.bound !== '1') {
        openWsHomework.dataset.bound = '1';
        openWsHomework.addEventListener('click', () => openWorkspacePage('homework'));
    }
    const openWsBooks = document.getElementById('openWorkspaceBooksBtn');
    if (openWsBooks && openWsBooks.dataset.bound !== '1') {
        openWsBooks.dataset.bound = '1';
        openWsBooks.addEventListener('click', () => openWorkspacePage('books'));
    }

    // Calendar Name Change
    elements.calendarName.addEventListener('input', (e) => {
        appData.calendarName = e.target.value;
        updateActiveTeamCalendarOptionLabel();
        updateCalendarTitle();
        updateTopBarCalendarLabel();
        saveData();
    });
    
    // Term Start Change
    elements.termStart.addEventListener('change', (e) => {
        appData.termStart = e.target.value;
        saveData();
        renderCalendar();
    });

    if (elements.termMonthCount) {
        elements.termMonthCount.addEventListener('change', (e) => {
            const parsed = parseInt(e.target.value, 10);
            if (!Number.isNaN(parsed)) {
                appData.termMonthCount = Math.min(
                    SCHEDULE_CONFIG.maxTermMonthCount,
                    Math.max(SCHEDULE_CONFIG.minTermMonthCount, parsed)
                );
            }
            saveData();
            renderCalendar();
        });
    }

    VISIBILITY_FILTER_FIELDS.forEach(({ uiId }) => {
        const el = document.getElementById(uiId);
        if (el) {
            el.addEventListener('change', () => {
                ensureUiState();
                appData.ui.visibilityFilters = readVisibilityFiltersFromDom();
                saveData();
                renderCalendar();
            });
        }
    });

    const fetchKrBtn = document.getElementById('fetchKrHolidaysBtn');
    if (fetchKrBtn) {
        fetchKrBtn.addEventListener('click', importKoreanPublicHolidays);
    }
    
    // Language Toggle
    document.getElementById('langToggleBtn').addEventListener('click', toggleLanguage);
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }
    
    // Button Clicks
    document.getElementById('addClassBtn').addEventListener('click', () => openClassEditor(null, 'calendar-popout'));
    document.getElementById('addHolidayBtn').addEventListener('click', () => openEventEditor(null, 'calendar-popout'));
    document.getElementById('exportBtn').addEventListener('click', exportData);
    setupImportDestinationModal();
    setupChangePasswordModal();
    setupEditDisplayNameModal();
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', importData);
    const printCalVisSelectAll = document.getElementById('printCalVisSelectAllBtn');
    const printCalVisClearAll = document.getElementById('printCalVisClearAllBtn');
    if (printCalVisSelectAll && !printCalVisSelectAll.dataset.bound) {
        printCalVisSelectAll.dataset.bound = '1';
        printCalVisSelectAll.addEventListener('click', () => setPrintCalendarVisibilityCheckboxes(true));
    }
    if (printCalVisClearAll && !printCalVisClearAll.dataset.bound) {
        printCalVisClearAll.dataset.bound = '1';
        printCalVisClearAll.addEventListener('click', () => setPrintCalendarVisibilityCheckboxes(false));
    }
    const printSummarySelectAll = document.getElementById('printSummarySelectAllBtn');
    const printSummaryClearAll = document.getElementById('printSummaryClearAllBtn');
    if (printSummarySelectAll && !printSummarySelectAll.dataset.bound) {
        printSummarySelectAll.dataset.bound = '1';
        printSummarySelectAll.addEventListener('click', () => setPrintSummaryOptionCheckboxes(true));
    }
    if (printSummaryClearAll && !printSummaryClearAll.dataset.bound) {
        printSummaryClearAll.dataset.bound = '1';
        printSummaryClearAll.addEventListener('click', () => setPrintSummaryOptionCheckboxes(false));
    }
    setupLessonFilterUi();
    setupEventApplicabilityFilterUi();
    document.getElementById('clearDataBtn').addEventListener('click', clearAllData);
    setupPrintSyllabusControls();
    setupPrintColorModeIsolation();
    setupAppPrintOpenerSafeties();

    // Modal Close Buttons
    document.getElementById('closeClassModal').addEventListener('click', () => closeModal(elements.classModal));
    document.getElementById('closeHolidayModal').addEventListener('click', () => closeModal(elements.holidayModal));
    // Form Submissions
    elements.classForm.addEventListener('submit', handleClassSubmit);
    elements.holidayForm.addEventListener('submit', handleHolidaySubmit);
    elements.printForm.addEventListener('submit', handlePrint);
    
    // Delete Buttons
    const deleteClassBtnEl = document.getElementById('deleteClassBtn');
    if (deleteClassBtnEl) {
        deleteClassBtnEl.addEventListener('click', deleteClass);
        elements.deleteClassBtn = deleteClassBtnEl;
    }
    elements.deleteHolidayBtn.addEventListener('click', deleteHoliday);
    
    // Holiday "All Classes" toggle
    elements.holidayAllClasses.addEventListener('change', (e) => {
        if (e.target.checked) {
            closeEventApplicabilityPopover();
            eventApplicabilityDraft = { ...EMPTY_EVENT_APPLICABILITY };
        } else if (!holidayHasAnyTargetFilter(eventApplicabilityDraft)) {
            eventApplicabilityDraft = getDefaultAllSelectedEventApplicability();
        }
        syncEventApplicabilityUiFromDraft();
    });
    
    // Class Name autocomplete + auto-fill levels when name exactly matches a class
    const onClassNameInput = debounce(() => {
        showClassNameSuggestions();
        autoFillLevelsFromExactClassNameMatch();
    }, 300);
    elements.className.addEventListener('input', onClassNameInput);
    elements.className.addEventListener('focus', showClassNameSuggestions);
    elements.className.addEventListener('blur', () => {
        // Delay hiding to allow click on suggestion
        setTimeout(hideClassNameSuggestions, 200);
    });
    
    // Handle keyboard navigation in autocomplete
    elements.className.addEventListener('keydown', handleAutocompleteKeydown);

    elements.classLevelCustom.addEventListener(
        'input',
        debounce(autoFillLevelPresetFromCustomLevelInput, 250)
    );

    if (elements.classLevel) {
        elements.classLevel.addEventListener('change', handleClassLevelPresetChange);
    }
    
    // Holiday "Date Range" toggle
    elements.holidayIsRange.addEventListener('change', (e) => {
        const isRange = e.target.checked;
        elements.holidaySingleDate.style.display = isRange ? 'none' : 'block';
        elements.holidayDateRange.style.display = isRange ? 'grid' : 'none';
        if (isRange) {
            if (!elements.holidayStartDate.value && elements.holidayDate.value) {
                elements.holidayStartDate.value = elements.holidayDate.value;
            }
            syncHolidayRangeEndFromStart();
        }
    });

    if (elements.holidayStartDate) {
        elements.holidayStartDate.addEventListener('change', () => {
            if (elements.holidayIsRange.checked) {
                syncHolidayRangeEndFromStart();
            }
        });
    }

    if (elements.eventType) {
        elements.eventType.addEventListener('change', applyEventTypeDefaultColors);
    }
    
    // Custom Schedule toggle
    elements.customScheduleEnabled.addEventListener('change', (e) => {
        elements.customScheduleSection.style.display = e.target.checked ? 'block' : 'none';
        syncPeriodByDayUi();
    });

    if (elements.classTypeSelect) {
        elements.classTypeSelect.addEventListener('change', () => {
            syncDeleteCustomClassTypeButtonVisibility();
            updateCompressionUiForScheduleModel();
            syncClassTypeHint();
        });
    }
    setupClassCurriculumControls();
    if (elements.openClassTypeModalBtn) {
        elements.openClassTypeModalBtn.addEventListener('click', openClassTypeManagerModal);
    }
    if (elements.deleteCustomClassTypeBtn) {
        elements.deleteCustomClassTypeBtn.addEventListener('click', deleteSelectedCustomClassType);
    }
    if (elements.classTypeForm) {
        elements.classTypeForm.addEventListener('submit', handleClassTypeFormSubmit);
    }
    const closeClassTypeModalBtn = document.getElementById('closeClassTypeModal');
    if (closeClassTypeModalBtn && elements.classTypeModal) {
        closeClassTypeModalBtn.addEventListener('click', () => closeModal(elements.classTypeModal));
    }
    if (elements.classTypeModal) {
        bindModalBackdropClose(elements.classTypeModal);
    }

    // Total lessons change
    elements.classTotalLessons.addEventListener('input', () => {
        const totalLessons = getTotalLessonsValue();
        const currentDates = getCustomLessonDatesFromInputs();
        const currentMerges = getSelectedCompressionMerges();
        renderCustomLessonDates(totalLessons, currentDates);
        renderCompressionOptions(totalLessons, currentMerges);
    });

    elements.addBookMonthRowBtn.addEventListener('click', () => addBookMonthRow('', ''));
    elements.fillBooksFromDefaultBtn.addEventListener('click', fillBooksFromTermDefaultBook);

    elements.classUseAutoTermEnd.addEventListener('change', () => {
        applyClassTermEndUiState();
        if (elements.classUseAutoTermEnd.checked) {
            syncClassTermEndAndBooks();
        }
    });
    elements.classStartDate.addEventListener('change', () => {
        if (elements.classUseAutoTermEnd.checked) {
            syncClassTermEndAndBooks();
        }
    });
    elements.classTermMonths.addEventListener('input', () => {
        if (elements.classUseAutoTermEnd.checked) {
            syncClassTermEndAndBooks();
        }
    });
    
    // Close modals on backdrop click (safe for text selection dragging)
    [elements.classModal, elements.holidayModal, elements.classTypeModal, elements.printOptionsModal]
        .filter(Boolean)
        .forEach(bindModalBackdropClose);

    const closePrintOptionsModalBtn = document.getElementById('closePrintOptionsModal');
    if (closePrintOptionsModalBtn && elements.printOptionsModal) {
        closePrintOptionsModalBtn.addEventListener('click', closePrintOptionsModal);
    }
    
    // Close modals on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(elements.classModal);
            closeModal(elements.holidayModal);
            if (elements.classTypeModal) {
                closeModal(elements.classTypeModal);
            }
            if (elements.printOptionsModal) {
                closePrintOptionsModal();
            }
        }
    });
    
    // Popup handling
    document.addEventListener('mousemove', handlePopupPosition);
}

// ============================================
// Modal Functions
// ============================================
const EXCLUSIVE_MODAL_IDS = [
    'booksEditorModal',
    'defaultClassEditorModal',
    'howToModal',
    'changePasswordModal',
    'editDisplayNameModal'
];

function closeExclusiveModalsExcept(keepModal) {
    EXCLUSIVE_MODAL_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (el && el !== keepModal && el.classList.contains('active')) {
            closeModal(el);
        }
    });
}

function openModal(modal) {
    if (!modal) {
        return;
    }
    if (modal.id && EXCLUSIVE_MODAL_IDS.includes(modal.id)) {
        closeExclusiveModalsExcept(modal);
    }
    modal.style.removeProperty('display');
    modal.classList.add('active');
}

function closeModal(modal) {
    if (!modal) {
        return;
    }
    modal.classList.remove('active');
    modal.style.removeProperty('display');
    if (modal === elements.holidayModal) {
        closeEventApplicabilityPopover();
    }
}

/**
 * Close modal on backdrop interaction only when press+release both start on the overlay.
 * Otherwise, dragging to select text can end on the dimmed area and incorrectly fire click there.
 */
function bindModalBackdropClose(modal) {
    let pressStartedOnBackdrop = false;
    modal.addEventListener('pointerdown', (e) => {
        pressStartedOnBackdrop = e.target === modal;
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal && pressStartedOnBackdrop) {
            closeModal(modal);
        }
        pressStartedOnBackdrop = false;
    });
}

function renderSyllabusUnitsRows(units = []) {
    if (!elements.syllabusUnitsRows) return;
    elements.syllabusUnitsRows.innerHTML = '';
    (units || []).forEach(unit => {
        addSyllabusUnitRow(
            unit.title || '',
            unit.notes || '',
            unit.id,
            unit.speakingPages || '',
            unit.writingPages || ''
        );
    });
}

function addSyllabusUnitRow(title = '', notes = '', unitId = null, speakingPages = '', writingPages = '') {
    if (!elements.syllabusUnitsRows) return;
    const row = document.createElement('div');
    row.className = 'syllabus-unit-row';
    row.dataset.unitId = unitId || generateId();
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    row.innerHTML = `
        <div class="syllabus-unit-title-wrap">
            <label class="syllabus-unit-field syllabus-unit-field-title">
                <span>${escapeHtml(t('syllabusUnitTitle'))}</span>
                <input type="text" class="syllabus-unit-title" value="${esc(title)}">
            </label>
            <button type="button" class="btn btn-outline btn-small syllabus-unit-remove" aria-label="Remove">×</button>
        </div>
        <div class="syllabus-unit-field">
            <label>${escapeHtml(t('syllabusUnitSpeakingPages'))}</label>
            <textarea class="syllabus-unit-speaking" rows="2">${esc(speakingPages)}</textarea>
        </div>
        <div class="syllabus-unit-field">
            <label>${escapeHtml(t('syllabusUnitWritingPages'))}</label>
            <textarea class="syllabus-unit-writing" rows="2">${esc(writingPages)}</textarea>
        </div>
        <div class="syllabus-unit-field syllabus-unit-field-full">
            <label>${escapeHtml(t('notes'))}</label>
            <textarea class="syllabus-unit-notes" rows="2">${esc(notes)}</textarea>
        </div>
    `;
    row.querySelector('.syllabus-unit-remove').addEventListener('click', () => row.remove());
    elements.syllabusUnitsRows.appendChild(row);
}

function collectSyllabusUnitsFromForm() {
    if (!elements.syllabusUnitsRows) return [];
    const rows = elements.syllabusUnitsRows.querySelectorAll('.syllabus-unit-row');
    return Array.from(rows).map(row => {
        const speakingEl = row.querySelector('.syllabus-unit-speaking');
        const writingEl = row.querySelector('.syllabus-unit-writing');
        const notesEl = row.querySelector('.syllabus-unit-notes');
        return {
            id: row.dataset.unitId || generateId(),
            title: (row.querySelector('.syllabus-unit-title')?.value || '').trim(),
            notes: notesEl ? (notesEl.value || '').trim() : '',
            speakingPages: speakingEl ? (speakingEl.value || '').trim() : '',
            writingPages: writingEl ? (writingEl.value || '').trim() : ''
        };
    }).filter(u => u.title.length > 0);
}

function getSyllabusModule() {
    return typeof window !== 'undefined' ? window.CCPSyllabus : null;
}

function getSyllabusTableLabels(classData) {
    return {
        colMonth: t('syllabusColMonth'),
        colWeek: t('syllabusColWeek'),
        colClass: t('syllabusColClass'),
        colPlan: t('syllabusColPlan'),
        colNote: t('syllabusColNote'),
        pdfLayout: true,
        tableYear: classData ? getSyllabusYearForClass(classData) : getSyllabusYearForClass({})
    };
}

function syllabusScheduleHooks() {
    return {
        useFullMonthNames: true,
        isHolidayForClass,
        getHolidayForClass: (dateStr, classData) => (
            isHolidayForClass(dateStr, classData) ? getHolidayForDate(dateStr) : null
        ),
        getInlineEventForClass: (dateStr, classData) => getInlineScheduleEventForClassOnDate(dateStr, classData),
        slotHolidayDetail: t('syllabusSlotHolidayDetail'),
        slotEventDetail: t('syllabusSlotEventDetail'),
        overflowIntro: t('syllabusOverflowIntro'),
        overflowNote: t('syllabusOverflowNote'),
        extraPeriodTitle: t('syllabusExtraPeriodTitle'),
        extraPeriodDetail: t('syllabusExtraPeriodDetail'),
        extraPeriodNote: t('syllabusExtraPeriodNote'),
        getEventColors: getSyllabusEventColors
    };
}

function lessonsForSyllabusBuild(classData) {
    const { slots, unscheduledLessonNumbers } = buildSyllabusTimelineForClass(classData);
    const items = [];

    slots.forEach(slot => {
        if (slot.kind === 'holiday') {
            items.push({
                date: slot.date,
                monthKey: slot.monthKey,
                label: '',
                __syllabusHoliday: true
            });
            return;
        }
        if (slot.kind === 'extra') {
            items.push({
                date: slot.date,
                monthKey: slot.monthKey,
                label: '',
                __syllabusExtraPeriod: true
            });
            return;
        }
        const lesson = slot.lesson || {};
        const dateStr = slot.date || (lesson.date instanceof Date ? formatDateISO(lesson.date) : lesson.date);
        items.push({
            ...lesson,
            date: dateStr,
            monthKey: slot.monthKey || lesson.monthKey || (dateStr ? dateStr.slice(0, 7) : ''),
            label: slot.label || lesson.label
        });
    });

    if (unscheduledLessonNumbers.length > 0) {
        items.push({ __syllabusOverflowIntro: true });
        unscheduledLessonNumbers.forEach(lessonNum => {
            items.push({
                __syllabusUnscheduled: true,
                lessonNum,
                label: getSequentialLessonLabel(classData, lessonNum)
            });
        });
    }

    return items;
}

function getSyllabusRowTemplatesForClass(classData) {
    if (!classData) {
        return [];
    }
    const def = getClassTypeDefinitionById(classData.classTypeId);
    return def && Array.isArray(def.defaultSyllabusRowTemplates)
        ? def.defaultSyllabusRowTemplates
        : [];
}

function buildGeneratedSyllabusRows(classData) {
    const mod = getSyllabusModule();
    if (!mod) {
        return [];
    }
    const rowTemplates = getSyllabusRowTemplatesForClass(classData);
    const hooks = {
        ...syllabusScheduleHooks(),
        rowTemplates
    };
    if (rowTemplates.length && window.CCPSyllabusTemplates) {
        hooks.templateIndexes = window.CCPSyllabusTemplates.buildTemplateIndexes(rowTemplates);
    }
    return mod.buildSyllabusRowsFromSchedule(
        classData,
        lessonsForSyllabusBuild(classData),
        hooks
    );
}

function localizeSyllabusRowsForCurrentLanguage(rows) {
    const mod = getSyllabusModule();
    return (rows || []).map((row) => {
        if (row.kind === 'holiday' && row.date) {
            const hol = getHolidayForDate(row.date);
            if (!hol || !hol.name) {
                return row;
            }
            const d = parseISODateLocal(row.date);
            let shortDate = '';
            if (!Number.isNaN(d.getTime())) {
                shortDate = mod && typeof mod.formatSyllabusShortDate === 'function'
                    ? mod.formatSyllabusShortDate(d)
                    : formatDateDisplay(row.date);
            }
            return { ...row, planTitle: `${shortDate} ${hol.name}`.trim() };
        }
        return row;
    });
}

function getSyllabusRowsForClass(classData, options = {}) {
    const generated = buildGeneratedSyllabusRows(classData);
    const saved = Array.isArray(classData.syllabusRows) ? classData.syllabusRows : [];
    let rows;
    if (options.preferMerged && saved.length > 0) {
        const mod = getSyllabusModule();
        if (mod) {
            rows = mod.mergeSyllabusRows(saved, generated);
        } else {
            rows = saved;
        }
    } else if (saved.length > 0 && !options.preferFresh) {
        rows = saved;
    } else {
        rows = generated;
    }
    return enrichSyllabusRowColors(
        localizeSyllabusRowsForCurrentLanguage(rows),
        classData
    );
}

/** Rows for syllabus print: form edits + calendar colors. */
function resolveSyllabusRowsForPrint(snapshot) {
    const mod = getSyllabusModule();
    if (!mod) {
        return [];
    }
    if (elements.syllabusTableBody) {
        const formRows = collectSyllabusRowsFromForm();
        const generated = buildGeneratedSyllabusRows(snapshot);
        return enrichSyllabusRowColors(mod.mergeSyllabusRows(formRows, generated), snapshot);
    }
    return getSyllabusRowsForClass(snapshot, { preferMerged: true });
}

function buildClassSnapshotFromRecord(classData) {
    if (!classData) {
        return {};
    }
    return { ...classData };
}

function buildClassSnapshotForSyllabusContext() {
    if (getActiveTab() === 'syllabus' && syllabusEditorMode === 'class') {
        const classData = getSelectedSyllabusClass();
        if (classData) {
            return buildClassSnapshotFromRecord(classData);
        }
    }
    if (elements.classId && elements.className) {
        return buildClassSnapshotFromForm();
    }
    const classData = getSelectedSyllabusClass();
    if (classData) {
        return buildClassSnapshotFromRecord(classData);
    }
    return buildClassSnapshotFromForm();
}

function buildClassSnapshotFromForm() {
    const id = elements.classId && elements.classId.value;
    const existing = id ? appData.classes.find(c => c.id === id) : null;
    const scheduleModel = getScheduleModelFromForm();
    const isDebateSchedule = scheduleModel === SCHEDULE_MODEL_DEBATE_MONTHLY;
    const isCustomSchedule = elements.customScheduleEnabled.checked;
    const totalLessons = getTotalLessonsValue();
    const meetingDays = readMeetingDaysFromFormScope('#classForm', MEETING_DAY_INPUT_CLASS);
    const normalizedMeetings = isCustomSchedule ? [] : normalizeMeetingDaysArray(meetingDays);
    return {
        ...(existing || {}),
        id: id || 'draft-syllabus',
        name: (elements.className.value || '').trim() || 'Class',
        classTypeId: elements.classTypeSelect ? elements.classTypeSelect.value : '',
        scheduleModel,
        startDate: elements.classStartDate.value,
        endDate: elements.classEndDate.value,
        totalLessons,
        meetingDays: normalizedMeetings,
        dayOfWeek: !isCustomSchedule && normalizedMeetings.length === 1 ? normalizedMeetings[0] : null,
        compressionMode: isDebateSchedule ? getCompressionModeFromForm() : 'sequentialTerm',
        compressionMerges: isDebateSchedule ? getSelectedCompressionMerges() : [],
        compressionMergesByMonth: existing?.compressionMergesByMonth,
        customSchedule: isCustomSchedule ? {
            enabled: true,
            days: getCustomLessonDatesFromInputs(totalLessons)
        } : (existing?.customSchedule || null),
        syllabusUnits: collectSyllabusUnitsFromForm(),
        booksByMonth: collectBooksByMonthFromForm(),
        book: elements.classBook.value,
        grade: (elements.classGrade.value || '').trim(),
        levelPreset: elements.classLevel.value,
        levelCustom: (elements.classLevelCustom.value || '').trim(),
        lessonLabelMode: getLessonLabelModeForSave(),
        homeworkImportMode: getHomeworkImportModeForSave()
    };
}

function escapeAttr(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeHtml(s) {
    if (window.CCPUtils && window.CCPUtils.escapeHtml) {
        return window.CCPUtils.escapeHtml(s);
    }
    return escapeAttr(s).replace(/>/g, '&gt;');
}

function renderSyllabusEditorTable(rows) {
    if (!elements.syllabusTableBody) {
        return;
    }
    const mod = getSyllabusModule();
    const normalized = mod ? mod.normalizeRows(rows) : (rows || []);
    elements.syllabusTableBody.innerHTML = '';
    normalized.forEach(row => {
        const tr = document.createElement('tr');
        const rowKind = row.kind || 'lesson';
        const eventTypeClass = row.eventType ? ` syllabus-row-${row.eventType}` : '';
        tr.className = `syllabus-row syllabus-row-${rowKind}${eventTypeClass}`;
        tr.dataset.rowId = row.id;
        tr.dataset.rowKind = rowKind;
        tr.dataset.rowSource = row.source || 'generated';
        if (row.rowBg) {
            tr.dataset.rowBg = row.rowBg;
        }
        if (row.rowColor) {
            tr.dataset.rowColor = row.rowColor;
        }
        if (row.eventType) {
            tr.dataset.eventType = row.eventType;
        }
        if (row.date) {
            tr.dataset.rowDate = row.date;
        }
        if (row.monthKey) {
            tr.dataset.rowMonthKey = row.monthKey;
        }
        if (row.sessionNumber != null) {
            tr.dataset.rowSession = String(row.sessionNumber);
        }
        const weekDisplay = row.weekLabel || (row.date && mod ? mod.getSchoolWeekLabel(row.date) : '');
        const isNote = row.kind === 'note';
        const titleReadonly = !isNote;
        tr.innerHTML = `
            <td class="syllabus-ed-week syllabus-col-week">${escapeHtml(weekDisplay)}</td>
            <td class="syllabus-ed-num syllabus-col-num">${row.sessionNumber > 0 ? row.sessionNumber : ''}</td>
            <td class="syllabus-col-plan"><input type="text" class="syllabus-ed-title" value="${escapeAttr(row.planTitle || '')}" ${titleReadonly ? 'readonly' : ''}></td>
            <td class="syllabus-col-pages"><textarea class="syllabus-ed-detail" rows="4"></textarea></td>
            <td class="syllabus-col-note"><textarea class="syllabus-ed-note" rows="2"></textarea></td>
            <td class="syllabus-col-actions"><button type="button" class="btn btn-outline btn-small syllabus-row-remove" aria-label="Remove">×</button></td>
        `;
        const detailEl = tr.querySelector('.syllabus-ed-detail');
        if (detailEl) {
            detailEl.value = row.planDetail || '';
        }
        const noteEl = tr.querySelector('.syllabus-ed-note');
        if (noteEl) {
            noteEl.value = row.note || '';
        }
        tr.querySelector('.syllabus-row-remove').addEventListener('click', () => tr.remove());
        if (row.rowBg || row.rowColor) {
            let cellStyle = '';
            if (row.rowBg) {
                cellStyle += `background-color:${row.rowBg};`;
            }
            if (row.rowColor) {
                cellStyle += `color:${row.rowColor};`;
            }
            tr.querySelectorAll('td').forEach(td => {
                td.style.cssText = cellStyle;
            });
        }
        elements.syllabusTableBody.appendChild(tr);
    });
    if (elements.syllabusTableEmptyHint) {
        elements.syllabusTableEmptyHint.style.display = normalized.length === 0 ? 'block' : 'none';
    }
}

/** Syllabus rows for save: merge stored edits with calendar-generated schedule. */
function resolveSyllabusRowsForSave() {
    const mod = getSyllabusModule();
    const snapshot = buildClassSnapshotFromForm();
    const generated = buildGeneratedSyllabusRows(snapshot);
    const classId = elements.classId && elements.classId.value;
    const existing = classId
        ? (appData.classes.find(c => c.id === classId)?.syllabusRows || [])
        : [];
    if (mod && existing.length) {
        return mod.mergeSyllabusRows(existing, generated);
    }
    return generated;
}

function collectSyllabusRowsFromForm() {
    if (!elements.syllabusTableBody) {
        return resolveSyllabusRowsForSave();
    }
    const mod = getSyllabusModule();
    return Array.from(elements.syllabusTableBody.querySelectorAll('tr')).map(tr => {
        const kind = tr.dataset.rowKind || 'lesson';
        const planTitle = (tr.querySelector('.syllabus-ed-title')?.value || '').trim();
        const planDetail = tr.querySelector('.syllabus-ed-detail')?.value || '';
        const noteEl = tr.querySelector('.syllabus-ed-note');
        const note = noteEl ? (noteEl.value || '') : '';
        let source = tr.dataset.rowSource || 'generated';
        if (kind === 'note') {
            source = 'manual';
        } else if (planDetail.trim() && source === 'generated') {
            source = 'manual';
        }
        const sessionNumber = parseInt(tr.dataset.rowSession, 10);
        const row = {
            id: tr.dataset.rowId || (mod ? mod.newRowId() : generateId()),
            kind,
            date: tr.dataset.rowDate || '',
            monthKey: tr.dataset.rowMonthKey || (tr.dataset.rowDate ? tr.dataset.rowDate.slice(0, 7) : ''),
            weekLabel: (tr.querySelector('.syllabus-ed-week')?.textContent || '').trim(),
            sessionNumber: Number.isNaN(sessionNumber) ? 0 : sessionNumber,
            planTitle,
            planDetail,
            note,
            source
        };
        if (mod && row.date && !row.weekLabel) {
            row.weekLabel = mod.getSchoolWeekLabel(row.date);
        }
        if (tr.dataset.rowBg) {
            row.rowBg = tr.dataset.rowBg;
        }
        if (tr.dataset.rowColor) {
            row.rowColor = tr.dataset.rowColor;
        }
        if (tr.dataset.eventType) {
            row.eventType = tr.dataset.eventType;
        }
        return row;
    });
}

/**
 * Build syllabus rows from each class calendar schedule and save on the class record.
 */
function syncAllClassSyllabusRowsFromCalendar() {
    const mod = getSyllabusModule();
    if (!mod) {
        return false;
    }
    syncHolidaysFromEvents();
    let changed = false;
    getClassesInDisplayOrder().forEach(classData => {
        const generated = buildGeneratedSyllabusRows(classData);
        if (!generated.length) {
            return;
        }
        const saved = Array.isArray(classData.syllabusRows) ? classData.syllabusRows : [];
        const merged = saved.length > 0
            ? mod.mergeSyllabusRows(saved, generated)
            : generated;
        classData.syllabusRows = merged;
        changed = true;
    });
    if (changed) {
        saveData();
    }
    return true;
}

function refreshSyllabusFromCalendar() {
    const mod = getSyllabusModule();
    if (!mod) {
        alert(t('syllabusModuleMissing'));
        return;
    }
    let snapshot;
    let classId;
    if (getActiveTab() === 'syllabus' && syllabusEditorMode === 'class') {
        const classData = getSelectedSyllabusClass();
        if (!classData) {
            return;
        }
        snapshot = buildClassSnapshotFromRecord(classData);
        classId = classData.id;
    } else {
        snapshot = buildClassSnapshotFromForm();
        classId = elements.classId && elements.classId.value;
    }
    const existing = collectSyllabusRowsFromForm();
    const generated = buildGeneratedSyllabusRows(snapshot);
    const merged = mod.mergeSyllabusRows(existing, generated);
    renderSyllabusEditorTable(merged);

    if (classId) {
        const index = appData.classes.findIndex(c => c.id === classId);
        if (index !== -1) {
            appData.classes[index].syllabusRows = merged;
            saveData();
            updateClassSyllabusSummary(appData.classes[index]);
        }
    }
}

function addSyllabusNoteRow() {
    const mod = getSyllabusModule();
    const rows = collectSyllabusRowsFromForm();
    rows.unshift({
        id: mod ? mod.newRowId() : generateId(),
        kind: 'note',
        planTitle: '',
        planDetail: '',
        note: '',
        source: 'manual',
        sessionNumber: 0,
        weekLabel: '',
        monthKey: '',
        date: ''
    });
    renderSyllabusEditorTable(rows);
}

function getSelectedClassTypeDefinitionFromForm() {
    const hidden = document.getElementById('classTypeIdHidden');
    const typeId = (hidden && hidden.value)
        ? hidden.value
        : (elements.classTypeSelect ? elements.classTypeSelect.value : '');
    return getClassTypeDefinitionById(typeId);
}

function getHomeworkImportModeForForm() {
    const syllabusForm = getSyllabusEditorFormEl();
    if (syllabusForm && syllabusForm.dataset.homeworkImportMode) {
        return syllabusForm.dataset.homeworkImportMode;
    }
    const def = getSelectedClassTypeDefinitionFromForm();
    if (def && def.homeworkImportMode) {
        return def.homeworkImportMode;
    }
    const form = elements.classForm;
    if (form && form.dataset.homeworkImportMode) {
        return form.dataset.homeworkImportMode;
    }
    const snapshot = buildClassSnapshotForSyllabusContext();
    if (classUsesDebateCompression(snapshot)) {
        return 'debate';
    }
    if (classUsesGrWeeklyUnitLabels(snapshot)) {
        return 'grUnit';
    }
    if (classUsesUnitPairLessonLabels(snapshot)) {
        return 'unitPair';
    }
    return 'unitPair';
}

function applyPresetSyllabusRowsToTable(options = {}) {
    const silent = !!options.silent;
    let def;
    if (getActiveTab() === 'syllabus' && syllabusEditorMode === 'class') {
        def = getClassTypeDefinitionForSyllabusClass(getSelectedSyllabusClass());
    } else {
        def = getSelectedClassTypeDefinitionFromForm();
    }
    const templates = def && Array.isArray(def.defaultSyllabusRowTemplates)
        ? def.defaultSyllabusRowTemplates
        : [];
    if (!templates.length) {
        if (!silent) {
            alert(t('applyPresetSyllabus') + ': ' + (currentLanguage === 'ko'
                ? '이 클래스 유형에 저장된 페이지 템플릿이 없습니다.'
                : 'No page templates for this class type.'));
        }
        return;
    }
    const rows = collectSyllabusRowsFromForm();
    if (!rows.length) {
        if (!silent) {
            alert(t('homeworkImportNoRows'));
        }
        return;
    }
    const api = getSyllabusTemplatesApi();
    const result = api
        ? api.applyRowTemplatesToSyllabusRows(rows, templates)
        : { rows, applied: 0 };
    renderSyllabusEditorTable(result.rows);
    if (!result.applied && !silent) {
        alert(currentLanguage === 'ko'
            ? '매칭된 수업 번호가 없습니다. 먼저 캘린더에서 새로고침하세요.'
            : 'No matching session numbers. Refresh from calendar first.');
    }
}

function fillSyllabusPagesFromUnits() {
    const mod = getSyllabusModule();
    if (!mod || !mod.planDetailFromUnits) {
        return;
    }
    const units = collectSyllabusUnitsFromForm();
    if (!units.length) {
        alert(currentLanguage === 'ko'
            ? '먼저 단원(말하기/쓰기 페이지)을 추가하세요.'
            : 'Add syllabus units with speaking/writing pages first.');
        return;
    }
    const rows = collectSyllabusRowsFromForm();
    if (!rows.length) {
        alert(t('homeworkImportNoRows'));
        return;
    }
    let applied = 0;
    rows.forEach(row => {
        if (row.kind !== 'lesson') {
            return;
        }
        const lessonNum = mod.getCurriculumLessonNumber
            ? mod.getCurriculumLessonNumber(row)
            : row.sessionNumber;
        if (!lessonNum) {
            return;
        }
        const detail = mod.planDetailFromUnits(lessonNum, units, row.planTitle);
        if (detail) {
            row.planDetail = detail;
            row.source = 'manual';
            applied += 1;
        }
    });
    renderSyllabusEditorTable(rows);
    if (!applied) {
        alert(currentLanguage === 'ko'
            ? '채울 페이지가 없습니다. 홀수=말하기, 짝수=쓰기 단원 번호를 확인하세요.'
            : 'No pages filled. Check odd=speaking / even=writing unit rows.');
    }
}

function previewHomeworkImport() {
    const pasteEl = elements.homeworkImportPaste;
    const previewEl = elements.homeworkImportPreview;
    if (!pasteEl || !previewEl || !window.CCPHomeworkImport) {
        return;
    }
    const text = pasteEl.value;
    if (!text.trim()) {
        alert(t('homeworkImportNoPaste'));
        return;
    }
    const rows = collectSyllabusRowsFromForm();
    if (!rows.length) {
        alert(t('homeworkImportNoRows'));
        return;
    }
    const snapshot = buildClassSnapshotForSyllabusContext();
    const mode = window.CCPHomeworkImport.detectImportMode(text, snapshot);
    const blocks = window.CCPHomeworkImport.parseByMode(text, mode);
    const result = window.CCPHomeworkImport.mapBlocksToSyllabusTargets(blocks, rows, mode);
    const header = t('homeworkImportPreviewHeader')
        .replace('{matched}', String(result.mappings.length))
        .replace('{unmatched}', String(result.unmatched.length));
    const lines = [header, `Mode: ${mode}`, ''];
    result.mappings.forEach(m => {
        lines.push(`✓ #${m.sessionNumber} ${m.planTitle || m.blockTitle}`);
        lines.push(m.planDetail.split('\n').slice(0, 3).join('\n'));
        lines.push('');
    });
    result.unmatched.forEach(u => {
        lines.push(`? ${u.blockTitle}`);
    });
    previewEl.textContent = lines.join('\n');
    previewEl.dataset.importMode = mode;
    previewEl.dataset.importPayload = JSON.stringify(result.mappings);
}

function applyHomeworkImport() {
    const previewEl = elements.homeworkImportPreview;
    if (!previewEl || !previewEl.dataset.importPayload) {
        previewHomeworkImport();
        if (!previewEl || !previewEl.dataset.importPayload) {
            return;
        }
    }
    let mappings = [];
    try {
        mappings = JSON.parse(previewEl.dataset.importPayload);
    } catch (e) {
        previewHomeworkImport();
        try {
            mappings = JSON.parse(previewEl.dataset.importPayload);
        } catch (err) {
            return;
        }
    }
    const rows = collectSyllabusRowsFromForm();
    const byId = new Map(rows.map(r => [r.id, r]));
    let applied = 0;
    mappings.forEach(m => {
        const row = byId.get(m.rowId);
        if (row && m.planDetail) {
            row.planDetail = m.planDetail;
            row.source = 'imported';
            applied += 1;
        }
    });
    renderSyllabusEditorTable(rows);
    alert(t('homeworkImportApplied').replace('{n}', String(applied)));
}

function getLessonLabelModeForSave() {
    const def = getSelectedClassTypeDefinitionFromForm();
    if (def && def.lessonLabelMode) {
        return def.lessonLabelMode;
    }
    const existingId = elements.classId && elements.classId.value;
    if (existingId) {
        const existing = appData.classes.find(c => c.id === existingId);
        if (existing && existing.lessonLabelMode) {
            return existing.lessonLabelMode;
        }
    }
    return '';
}

function getHomeworkImportModeForSave() {
    const def = getSelectedClassTypeDefinitionFromForm();
    if (def && def.homeworkImportMode) {
        return def.homeworkImportMode;
    }
    const existingId = elements.classId && elements.classId.value;
    if (existingId) {
        const existing = appData.classes.find(c => c.id === existingId);
        if (existing && existing.homeworkImportMode) {
            return existing.homeworkImportMode;
        }
    }
    return '';
}

function getSyllabusSectionMeta(classData) {
    return {
        classData,
        classTitle: formatSyllabusPdfClassTitle(classData),
        tableYear: getSyllabusYearForClass(classData),
        subtitle: '',
        termRange: ''
    };
}

function getSyllabusRenderLabels(classData) {
    const meta = getSyllabusSectionMeta(classData);
    return {
        ...getSyllabusTableLabels(classData),
        classTitle: meta.classTitle,
        tableYear: meta.tableYear,
        subtitle: meta.subtitle,
        termRange: meta.termRange,
        generalNotes: (classData && classData.syllabusGeneralNotes) ? String(classData.syllabusGeneralNotes).trim() : ''
    };
}

function renderSyllabusTablesIntoSummary(classIds = null) {
    if (!elements.syllabusTablesSummary) {
        return false;
    }
    const mod = getSyllabusModule();
    if (!mod) {
        return false;
    }
    const sections = buildSyllabusExportSections(classIds);
    if (!sections.length) {
        elements.syllabusTablesSummary.innerHTML = '';
        return false;
    }
    const labels = { ...getSyllabusTableLabels(), pdfLayout: true, a4Pdf: true };
    const body = mod.renderSyllabusDocumentBody({ title: '', subtitle: '' }, sections, labels);
    elements.syllabusTablesSummary.innerHTML = `<div class="syllabus-pdf-export-root">${body}</div>`;
    return true;
}

function renderAllSyllabusTables() {
    renderSyllabusTablesIntoSummary(getVisibleClassIdsForLessonFilter());
}

function buildSyllabusExportSections(classIds = null) {
    syncHolidaysFromEvents();
    const idSet = Array.isArray(classIds) && classIds.length
        ? new Set(classIds)
        : null;
    const sections = [];
    getClassesForCalendarAndPrintSummary().forEach(classData => {
        if (idSet && !idSet.has(classData.id)) {
            return;
        }
        const rows = getSyllabusRowsForClass(classData, { preferMerged: true });
        if (!rows.length) {
            return;
        }
        const meta = getSyllabusSectionMeta(classData);
        sections.push({
            classData,
            rows,
            classTitle: meta.classTitle,
            tableYear: meta.tableYear,
            subtitle: meta.subtitle,
            termRange: meta.termRange
        });
    });
    return sections;
}

/** A4 content area (mm) inside 15 mm margins. */
const SYLLABUS_PDF_A4 = {
    pageW: 210,
    pageH: 297,
    margin: 15,
    fitSafety: 6,
    get contentW() {
        return this.pageW - this.margin * 2;
    },
    get contentH() {
        return this.pageH - this.margin * 2;
    },
    get fitContentH() {
        return this.contentH - this.fitSafety;
    }
};

function buildSyllabusExportDocument(classIds) {
    const mod = getSyllabusModule();
    if (!mod) {
        return null;
    }
    const sections = buildSyllabusExportSections(classIds);
    if (sections.length === 0) {
        return null;
    }
    const meta = {
        title: (appData.calendarName && appData.calendarName.trim()) || t('syllabusTables'),
        subtitle: appData.termStart ? appData.termStart : ''
    };
    const labels = {
        ...getSyllabusTableLabels(),
        pdfLayout: true,
        a4Pdf: true
    };
    return {
        docHtml: mod.renderSyllabusDocumentHtml(meta, sections, labels)
    };
}

function getSyllabusClassIdFromClassModal() {
    const classId = elements.classId && elements.classId.value;
    if (!classId) {
        alert(t('syllabusTableEmptyHint'));
        return null;
    }
    const classData = appData.classes.find(c => c.id === classId);
    if (!classData) {
        return null;
    }
    const rows = getSyllabusRowsForClass(classData, { preferMerged: true });
    if (!rows.length) {
        alert(t('syllabusTableEmptyHint'));
        return null;
    }
    return classId;
}

function printSyllabusDocument(docHtml, windowTitle) {
    const printWin = window.open('', '_blank');
    if (!printWin) {
        alert(t('printSyllabusBlocked'));
        return;
    }
    printWin.document.open();
    printWin.document.write(docHtml);
    printWin.document.close();
    printWin.document.title = windowTitle || t('printClassSyllabusTitle');
    printWin.focus();

    const mod = getSyllabusModule();
    const runPrint = () => {
        if (mod && typeof mod.fitSyllabusPagesToA4 === 'function'
            && printWin.document.querySelector('.syllabus-a4-sheet')) {
            mod.fitSyllabusPagesToA4(printWin.document, SYLLABUS_PDF_A4);
        }
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                try {
                    printWin.print();
                } catch (e) {
                    /* user can print manually from the new tab */
                }
            });
        });
    };

    setTimeout(runPrint, 400);
}

function printClassSyllabusFromModal() {
    let classId = elements.classId && elements.classId.value;
    if (getActiveTab() === 'syllabus' && syllabusEditorMode === 'class') {
        classId = appData.ui.syllabusTabClassId || classId;
    }
    if (!classId) {
        alert(t('syllabusTableEmptyHint'));
        return;
    }
    const mod = getSyllabusModule();
    if (!mod) {
        alert(t('syllabusModuleMissing'));
        return;
    }
    const saved = appData.classes.find(c => c.id === classId);
    const snapshot = {
        ...(saved || {}),
        id: classId,
        syllabusUnits: collectSyllabusUnitsFromForm(),
        syllabusGeneralNotes: getSyllabusGeneralNotesFromForm() || saved?.syllabusGeneralNotes || ''
    };
    const syllabusRows = resolveSyllabusRowsForPrint(snapshot);
    if (!syllabusRows.length) {
        alert(t('syllabusTableEmptyHint'));
        return;
    }
    const sectionMeta = getSyllabusSectionMeta(snapshot);
    const sections = [{
        classData: snapshot,
        rows: syllabusRows,
        classTitle: sectionMeta.classTitle,
        tableYear: sectionMeta.tableYear,
        subtitle: sectionMeta.subtitle,
        termRange: sectionMeta.termRange
    }];
    const meta = {
        title: (appData.calendarName && appData.calendarName.trim()) || t('syllabusTables'),
        subtitle: appData.termStart ? appData.termStart : ''
    };
    const labels = {
        ...getSyllabusTableLabels(),
        pdfLayout: true,
        a4Pdf: true
    };
    printSyllabusDocument(
        mod.renderSyllabusDocumentHtml(meta, sections, labels),
        sectionMeta.classTitle
    );
}

function applyEventTypeDefaultColors() {
    if (!elements.eventType) return;
    const type = normalizeEventType(elements.eventType.value);
    const defaults = EVENT_TYPE_DEFAULT_COLORS[type] || EVENT_TYPE_DEFAULT_COLORS.other;
    elements.holidayBgColor.value = defaults.bg;
    elements.holidayTextColor.value = defaults.text;
    if (type === EVENT_TYPES.EVALUATION_PERIOD) {
        elements.holidayIsRange.checked = true;
        elements.holidaySingleDate.style.display = 'none';
        elements.holidayDateRange.style.display = 'grid';
        syncHolidayRangeEndFromStart();
    }
}

function populateClassForm(classData = null, options = {}) {
    ensureClassModalLayout();
    ensureClassPeriodMarkup();
    if (classData) {
        // Edit mode
        elements.classModalTitle.textContent = t('editClass');
        elements.classId.value = classData.id;
        elements.className.value = classData.name;
        applyPeriodFieldsToClassForm(classData);
        elements.classLevel.value = resolveLevelPresetForForm(classData);
        elements.classLevelCustom.value = resolveLevelCustomForForm(classData);
        elements.classGrade.value = classData.grade;
        elements.classBook.value = classData.book;
        elements.classNotes.value = classData.notes || '';
        elements.classStartDate.value = classData.startDate;
        elements.classEndDate.value = classData.endDate;
        const monthSpan = enumerateMonthKeysBetween(classData.startDate || '', classData.endDate || '').length;
        elements.classTermMonths.value = classData.termCalendarMonths > 0
            ? classData.termCalendarMonths
            : (monthSpan > 0 ? monthSpan : SCHEDULE_CONFIG.defaultTermCalendarMonths);
        elements.classUseAutoTermEnd.checked = classData.useAutoTermEnd === true;
        applyClassTermEndUiState();
        elements.classTotalLessons.value = sanitizeTotalLessons(classData.totalLessons || 4);
        elements.classColor.value = classData.color;
        elements.classTextColor.value = classData.textColor || DEFAULT_CLASS_TEXT_COLOR;

        populateClassTypeSelect();
        let savedTypeId = classData.classTypeId || '';
        if (savedTypeId && getClassTypeDefinitionById(savedTypeId)) {
            savedTypeId = resolveClassTypeId(savedTypeId);
        } else {
            savedTypeId = '';
        }
        if (savedTypeId === CLASS_TYPE_EARLY_WRITER_ID) {
            savedTypeId = 'preset-early-writers-navy';
        }
        if (elements.classTypeSelect) {
            elements.classTypeSelect.value = savedTypeId;
        }
        const hiddenType = document.getElementById('classTypeIdHidden');
        if (hiddenType) {
            hiddenType.value = savedTypeId;
        }
        syncClassCurriculumPickersFromClass(classData);
        syncDeleteCustomClassTypeButtonVisibility();

        if (classUsesDebateCompression(classData)) {
            const compressionMode = classData.compressionMode === 'manual' ? 'manual' : 'autoWhenNeeded';
            const modeAuto = document.getElementById('compressionModeAuto');
            const modeManual = document.getElementById('compressionModeManual');
            if (compressionMode === 'manual' && modeManual) {
                modeManual.checked = true;
            } else if (modeAuto) {
                modeAuto.checked = true;
            }
        }

        renderBooksByMonthRows(classData.booksByMonth || {});
        if (classData.useAutoTermEnd === true && classData.startDate) {
            syncClassTermEndAndBooks();
        }
        
        // Handle custom schedule
        const hasCustom = classData.customSchedule && classData.customSchedule.enabled;
        elements.customScheduleEnabled.checked = hasCustom;
        elements.customScheduleSection.style.display = hasCustom ? 'block' : 'none';

        const totalLessons = sanitizeTotalLessons(classData.totalLessons || 4);
        writeMeetingDaysInFormScope('#classForm', MEETING_DAY_INPUT_CLASS, hasCustom ? [] : getMeetingDaysFromClass(classData));
        updateMeetingDayChipLabels();
        const customDates = getCustomScheduleDaysFromClass(classData, totalLessons);
        const compressionMerges = getCompressionMergesFromClass(classData, totalLessons);
        renderCustomLessonDates(totalLessons, customDates);
        renderCompressionOptions(totalLessons, compressionMerges);
        updateClassSyllabusSummary(classData);

        syncClassDeleteButtonVisibility(true);
    } else {
        // Add mode
        elements.classModalTitle.textContent = t('addNewClass');
        elements.classForm.reset();
        elements.classId.value = '';
        if (elements.classPeriod) {
            elements.classPeriod.value = String(getNextSuggestedClassPeriod());
        }
        elements.classColor.value = getNextColor();
        elements.classTextColor.value = DEFAULT_CLASS_TEXT_COLOR;
        elements.classTotalLessons.value = 4;
        elements.customScheduleEnabled.checked = false;
        elements.customScheduleSection.style.display = 'none';
        document.getElementById('compressionModeAuto').checked = true;
        elements.classTermMonths.value = SCHEDULE_CONFIG.defaultTermCalendarMonths;
        elements.classUseAutoTermEnd.checked = true;
        applyClassTermEndUiState();
        renderCustomLessonDates(4, []);
        renderCompressionOptions(4, []);
        renderBooksByMonthRows({});
        updateClassSyllabusSummary(null);
        syncClassDeleteButtonVisibility(false);
        applyDefaultClassDatesForNewClass(options.defaultStartDate);
    }
    populateClassTypeSelect();
    if (!classData) {
        applyDefaultClassTypeToNewClassForm();
        updateMeetingDayChipLabels();
    } else {
        syncClassTypeHint();
    }
    updateCompressionUiForScheduleModel();
    syncDeleteCustomClassTypeButtonVisibility();
    syncPeriodByDayUi();
    syncClassOpenEditorButton();
}

function openClassModal(classData = null, options = {}) {
    openClassEditor(classData, options.context || 'calendar-popout', options);
}

function populateHolidayForm(holidayData = null, options = {}) {
    closeEventApplicabilityPopover();

    if (elements.eventType) {
        elements.eventType.value = holidayData
            ? normalizeEventType(holidayData.type)
            : EVENT_TYPES.HOLIDAY;
    }
    if (elements.eventNotes) {
        elements.eventNotes.value = holidayData ? (holidayData.notes || '') : '';
    }

    if (holidayData) {
        elements.holidayModalTitle.textContent = t('editEvent');
        elements.holidayId.value = holidayData.id;
        elements.holidayName.value = getEventDisplayName(holidayData);
        
        // Handle date range
        const isRange = holidayData.isRange || false;
        elements.holidayIsRange.checked = isRange;
        elements.holidaySingleDate.style.display = isRange ? 'none' : 'block';
        elements.holidayDateRange.style.display = isRange ? 'grid' : 'none';
        
        if (isRange) {
            elements.holidayStartDate.value = holidayData.startDate || '';
            elements.holidayEndDate.value = holidayData.endDate || '';
            elements.holidayDate.value = '';
        } else {
            elements.holidayDate.value = holidayData.date || '';
            elements.holidayStartDate.value = '';
            elements.holidayEndDate.value = '';
        }
        
        // Handle colors
        elements.holidayBgColor.value = holidayData.bgColor || '#fef3c7';
        elements.holidayTextColor.value = holidayData.textColor || '#b45309';
        
        const isAllClasses = !holidayHasAnyTargetFilter(holidayData);
        elements.holidayAllClasses.checked = isAllClasses;
        loadEventApplicabilityDraftFromHoliday(holidayData);

        elements.deleteHolidayBtn.style.display = 'block';
    } else {
        elements.holidayModalTitle.textContent = t('addEventTitle');
        elements.holidayForm.reset();
        elements.holidayId.value = '';
        if (elements.eventType) elements.eventType.value = EVENT_TYPES.HOLIDAY;
        if (elements.eventNotes) elements.eventNotes.value = '';
        elements.holidayIsRange.checked = false;
        elements.holidaySingleDate.style.display = 'block';
        elements.holidayDateRange.style.display = 'none';
        elements.holidayAllClasses.checked = true;
        eventApplicabilityDraft = { ...EMPTY_EVENT_APPLICABILITY };
        elements.deleteHolidayBtn.style.display = 'none';
        applyEventTypeDefaultColors();
        if (options.defaultDate) {
            elements.holidayDate.value = options.defaultDate;
            elements.holidayStartDate.value = options.defaultDate;
            elements.holidayEndDate.value = addOneDayISO(options.defaultDate);
        }
    }
    syncEventApplicabilityUiFromDraft();
    syncEventOpenEditorButton();
}

function openHolidayModal(holidayData = null, options = {}) {
    openEventEditor(holidayData, options.context || 'calendar-popout', options);
}

// ============================================
// Color Management
// ============================================
function getNextColor() {
    const color = colorPalette[colorIndex % colorPalette.length];
    colorIndex++;
    return color;
}

// ============================================
// Autocomplete / Auto-Populate Feature
// ============================================
let selectedSuggestionIndex = -1;

function showClassNameSuggestions() {
    const dropdown = document.getElementById('classNameSuggestions');
    const inputValue = elements.className.value.trim().toLowerCase();
    
    // Only show suggestions when adding a new class (not editing)
    if (elements.classId.value) {
        hideClassNameSuggestions();
        return;
    }
    
    // Get unique class names that match the input
    const uniqueClasses = [];
    const seenNames = new Set();
    
    getClassesInDisplayOrder().forEach(c => {
        const nameLower = c.name.toLowerCase();
        if (!seenNames.has(nameLower) && (inputValue === '' || nameLower.includes(inputValue))) {
            seenNames.add(nameLower);
            uniqueClasses.push(c);
        }
    });
    
    // Don't show if no matches or input is empty and no classes exist
    if (uniqueClasses.length === 0) {
        hideClassNameSuggestions();
        return;
    }
    
    // Build dropdown HTML
    let html = `<div class="autocomplete-hint" data-i18n="selectToAutofill">${t('selectToAutofill') || 'Select to auto-fill fields:'}</div>`;
    
    uniqueClasses.forEach((classData, index) => {
        const displayName = highlightMatch(classData.name, inputValue);
        const details = `${getClassLevelDisplay(classData) || '-'} | ${classData.grade || '-'} | ${classData.book || '-'}`;
        html += `
            <div class="autocomplete-item" data-index="${index}" data-class-id="${classData.id}">
                <div class="item-name">${displayName}</div>
                <div class="item-details">${details}</div>
            </div>
        `;
    });
    
    dropdown.innerHTML = html;
    dropdown.classList.add('active');
    selectedSuggestionIndex = -1;
    
    // Add click handlers to suggestions
    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent blur from firing first
            const classId = item.dataset.classId;
            selectClassSuggestion(classId);
        });
    });
}

function hideClassNameSuggestions() {
    const dropdown = document.getElementById('classNameSuggestions');
    dropdown.classList.remove('active');
    selectedSuggestionIndex = -1;
}

function applyLevelFieldsFromClassTemplate(classData) {
    if (!classData) {
        return;
    }
    elements.classLevel.value = resolveLevelPresetForForm(classData);
    elements.classLevelCustom.value = resolveLevelCustomForForm(classData);
    handleClassLevelPresetChange();
}

function autoFillLevelPresetFromCustomLevelInput() {
    if (elements.classId.value) {
        return;
    }
    const raw = (elements.classLevelCustom.value || '').trim();
    if (!raw) {
        return;
    }
    const customLower = raw.toLowerCase();
    const direct = getAllSimsonLevels().find(l =>
        l.name.toLowerCase() === customLower || l.id.toLowerCase() === customLower
    );
    if (direct) {
        elements.classLevel.value = direct.id;
        handleClassLevelPresetChange();
        return;
    }

    let best = null;
    let bestScore = 0;

    appData.classes.forEach(c => {
        const lc = (c.levelCustom || '').trim();
        const lcLower = lc.toLowerCase();
        const disp = getClassLevelDisplay(c).trim().toLowerCase();
        let score = 0;
        if (lcLower && lcLower === customLower) {
            score = 4;
        } else if (lcLower && (lcLower.startsWith(customLower) || customLower.startsWith(lcLower))) {
            score = 3;
        } else if (lcLower && (lcLower.includes(customLower) || customLower.includes(lcLower))) {
            score = 2;
        } else if (!lc && disp && disp === customLower) {
            score = 3;
        }
        if (score > bestScore) {
            bestScore = score;
            best = c;
        } else if (score === bestScore && score > 0 && best) {
            const lenL = (c.levelCustom || '').length;
            const lenB = (best.levelCustom || '').length;
            if (lenL > lenB) {
                best = c;
            }
        }
    });

    if (best && bestScore >= 2) {
        const preset = resolveLevelPresetForForm(best);
        if (preset) {
            elements.classLevel.value = preset;
            handleClassLevelPresetChange();
        }
    }
}

function autoFillLevelsFromExactClassNameMatch() {
    if (elements.classId.value) {
        return;
    }
    const name = elements.className.value.trim();
    if (!name) {
        return;
    }
    const lower = name.toLowerCase();
    const matches = appData.classes.filter(c => c.name.trim().toLowerCase() === lower);
    if (matches.length !== 1) {
        return;
    }
    applyLevelFieldsFromClassTemplate(matches[0]);
}

function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<span class="item-match">$1</span>');
}

function selectClassSuggestion(classId) {
    const existingClass = appData.classes.find(c => c.id === classId);
    
    if (existingClass) {
        // Fill the class name
        elements.className.value = existingClass.name;
        applyPeriodFieldsToClassForm(existingClass);
        
        // Auto-fill other fields (except dates)
        applyLevelFieldsFromClassTemplate(existingClass);
        elements.classGrade.value = existingClass.grade || '';
        elements.classBook.value = existingClass.book || '';
        elements.classNotes.value = existingClass.notes || '';
        elements.classStartDate.value = existingClass.startDate || '';
        const sugMonthSpan = enumerateMonthKeysBetween(
            existingClass.startDate || '',
            existingClass.endDate || ''
        ).length;
        elements.classTermMonths.value = existingClass.termCalendarMonths > 0
            ? existingClass.termCalendarMonths
            : (sugMonthSpan > 0 ? sugMonthSpan : SCHEDULE_CONFIG.defaultTermCalendarMonths);
        elements.classUseAutoTermEnd.checked = existingClass.useAutoTermEnd === true;
        elements.classEndDate.value = existingClass.endDate || '';
        applyClassTermEndUiState();
        if (existingClass.useAutoTermEnd === true && elements.classStartDate.value) {
            syncClassTermEndAndBooks();
        } else {
            renderBooksByMonthRows(existingClass.booksByMonth || {});
        }
        populateClassTypeSelect();
        const tid = (existingClass.classTypeId && getClassTypeDefinitionById(existingClass.classTypeId))
            ? existingClass.classTypeId
            : '';
        if (elements.classTypeSelect) {
            elements.classTypeSelect.value = tid;
        }
        syncDeleteCustomClassTypeButtonVisibility();
        writeMeetingDaysInFormScope('#classForm', MEETING_DAY_INPUT_CLASS, getMeetingDaysFromClass(existingClass));
        updateMeetingDayChipLabels();
        elements.classColor.value = existingClass.color || getNextColor();
        elements.classTextColor.value = existingClass.textColor || DEFAULT_CLASS_TEXT_COLOR;
        const mode = existingClass.compressionMode === 'manual' ? 'manual' : 'autoWhenNeeded';
        document.getElementById(mode === 'manual' ? 'compressionModeManual' : 'compressionModeAuto').checked = true;
        const totalLessons = sanitizeTotalLessons(existingClass.totalLessons || 4);
        elements.classTotalLessons.value = totalLessons;
        renderCustomLessonDates(totalLessons, []);
        renderCompressionOptions(totalLessons, getCompressionMergesFromClass(existingClass, totalLessons));
    }
    
    hideClassNameSuggestions();
}

function handleAutocompleteKeydown(e) {
    const dropdown = document.getElementById('classNameSuggestions');
    if (!dropdown.classList.contains('active')) return;
    
    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;
    
    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, items.length - 1);
            updateSelectedSuggestion(items);
            break;
        case 'ArrowUp':
            e.preventDefault();
            selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
            updateSelectedSuggestion(items);
            break;
        case 'Enter':
            if (selectedSuggestionIndex >= 0) {
                e.preventDefault();
                const classId = items[selectedSuggestionIndex].dataset.classId;
                selectClassSuggestion(classId);
            }
            break;
        case 'Escape':
            hideClassNameSuggestions();
            break;
    }
}

function updateSelectedSuggestion(items) {
    items.forEach((item, index) => {
        item.classList.toggle('selected', index === selectedSuggestionIndex);
    });
    
    // Scroll selected item into view
    if (selectedSuggestionIndex >= 0) {
        items[selectedSuggestionIndex].scrollIntoView({ block: 'nearest' });
    }
}

// ============================================
// Class Management
// ============================================
function handleClassSubmit(e) {
    e.preventDefault();

    const scheduleModel = getScheduleModelFromForm();
    const isDebateSchedule = scheduleModel === SCHEDULE_MODEL_DEBATE_MONTHLY;
    const isCustomSchedule = elements.customScheduleEnabled.checked;
    const totalLessons = getTotalLessonsValue();
    const compressionMerges = isDebateSchedule ? getSelectedCompressionMerges() : [];
    const levelPreset = elements.classLevel.value;
    const levelCustom = (elements.classLevelCustom.value || '').trim();
    if (!levelPreset && !levelCustom) {
        alert(t('levelRequired'));
        return;
    }
    const compressionMode = isDebateSchedule ? getCompressionModeFromForm() : 'sequentialTerm';
    const levelDisplay = getClassLevelDisplayFromParts(levelPreset, levelCustom);
    
    let termCalendarMonths = parseInt(elements.classTermMonths.value, 10);
    if (Number.isNaN(termCalendarMonths) || termCalendarMonths < 1) {
        termCalendarMonths = SCHEDULE_CONFIG.defaultTermCalendarMonths;
    }
    const useAutoTermEnd = elements.classUseAutoTermEnd.checked;
    let startDate = elements.classStartDate.value;
    let endDate = elements.classEndDate.value;
    if (useAutoTermEnd && startDate) {
        const endD = computeTermEndDateFromStart(startDate, termCalendarMonths);
        if (endD) {
            endDate = formatDateForInput(endD);
            elements.classEndDate.value = endDate;
        }
        refreshBookRowsForTermRange();
    }
    const booksByMonth = collectBooksByMonthFromForm();

    const meetingDays = readMeetingDaysFromFormScope('#classForm', MEETING_DAY_INPUT_CLASS);
    if (!isCustomSchedule && meetingDays.length === 0) {
        alert(t('meetingDaysRequired'));
        return;
    }
    const normalizedMeetings = isCustomSchedule ? [] : normalizeMeetingDaysArray(meetingDays);
    const singleDow = normalizedMeetings.length === 1 ? normalizedMeetings[0] : null;
    const hiddenType = document.getElementById('classTypeIdHidden');
    const rawClassTypeId = (hiddenType && hiddenType.value)
        ? hiddenType.value
        : (elements.classTypeSelect ? (elements.classTypeSelect.value || '') : '');
    const classTypeId = resolveClassTypeId(rawClassTypeId) || rawClassTypeId;
    const curriculumBookSel = document.getElementById('classCurriculumBook');
    let curriculumId = (curriculumBookSel && curriculumBookSel.value)
        ? curriculumBookSel.value.trim()
        : (classTypeId && window.CCPBooksEditor ? getBookIdForClass({ classTypeId }) : '');
    if (window.CCPBooksEditor) {
        if (window.CCPBooksEditor.isNoBookCurriculum(curriculumId)) {
            curriculumId = '';
        }
    }
    const { period, periodByWeekday } = collectPeriodFieldsForSave();
    const existingId = elements.classId.value;
    const existingClass = existingId ? appData.classes.find((c) => c.id === existingId) : null;

    const classData = {
        id: elements.classId.value || generateId(),
        name: elements.className.value,
        period: period,
        periodByWeekday: periodByWeekday,
        levelPreset: levelPreset,
        levelCustom: levelCustom,
        level: levelDisplay,
        grade: (elements.classGrade.value || '').trim(),
        book: elements.classBook.value,
        booksByMonth: booksByMonth,
        compressionMode: compressionMode,
        notes: elements.classNotes.value,
        termCalendarMonths: termCalendarMonths,
        useAutoTermEnd: useAutoTermEnd,
        startDate: startDate,
        endDate: endDate,
        totalLessons: totalLessons,
        meetingDays: normalizedMeetings,
        dayOfWeek: isCustomSchedule ? null : singleDow,
        classTypeId: classTypeId,
        curriculumId: curriculumId || '',
        scheduleModel: scheduleModel,
        color: elements.classColor.value,
        textColor: elements.classTextColor.value || DEFAULT_CLASS_TEXT_COLOR,
        compressionMerges: compressionMerges,
        customSchedule: isCustomSchedule ? {
            enabled: true,
            days: getCustomLessonDatesFromInputs(totalLessons)
        } : null,
        syllabusUnits: elements.syllabusUnitsRows
            ? collectSyllabusUnitsFromForm()
            : (existingClass?.syllabusUnits || []),
        syllabusGeneralNotes: elements.syllabusGeneralNotes
            ? getSyllabusGeneralNotesFromForm()
            : (existingClass?.syllabusGeneralNotes || ''),
        syllabusRows: elements.syllabusTableBody
            ? collectSyllabusRowsFromForm()
            : resolveSyllabusRowsForSave(),
        lessonLabelMode: getLessonLabelModeForSave(),
        homeworkImportMode: getHomeworkImportModeForSave()
    };
    
    if (elements.classId.value) {
        // Update existing
        const index = appData.classes.findIndex(c => c.id === classData.id);
        if (index !== -1) {
            appData.classes[index] = classData;
        }
    } else {
        // Add new
        appData.classes.push(classData);
    }
    
    const isUpdate = Boolean(existingId);
    saveData();
    renderCalendar();
    renderClassList();
    updateClassSyllabusSummary(classData);
    if (isUpdate) {
        setAppStatusMessage(t('classSaved'), false);
    }
    if (classEditorMount === 'tab') {
        updateClassEditorEmptyState();
    } else {
        closeModal(elements.classModal);
    }
}

function deleteClass() {
    const id = elements.classId.value;
    if (id && confirm(t('confirmDeleteClass'))) {
        appData.classes = appData.classes.filter(c => c.id !== id);
        saveData();
        renderCalendar();
        renderClassList();
        if (classEditorMount === 'tab') {
            elements.classForm.reset();
            elements.classId.value = '';
            updateClassEditorEmptyState();
        } else {
            closeModal(elements.classModal);
        }
    }
}

// ============================================
// Holiday Management
// ============================================
function handleHolidaySubmit(e) {
    e.preventDefault();
    
    // Get selected grades, sections, bands, class names
    let grades = [];
    let classNames = [];
    let sectionLevels = [];
    let allElementary = false;
    let allMiddleSchool = false;
    
    if (!elements.holidayAllClasses.checked) {
        if (isEventApplicabilityPopoverOpen()) {
            commitEventApplicabilityFromPopover();
        }
        grades = [...(eventApplicabilityDraft.grades || [])];
        classNames = [...(eventApplicabilityDraft.classNames || [])];
        sectionLevels = [...(eventApplicabilityDraft.sectionLevels || [])];
        allElementary = eventApplicabilityDraft.allElementary === true;
        allMiddleSchool = eventApplicabilityDraft.allMiddleSchool === true;

        if (!holidayHasAnyTargetFilter(eventApplicabilityDraft)) {
            alert(t('holidayFilterRequired'));
            return;
        }
    }
    
    const eventType = normalizeEventType(elements.eventType ? elements.eventType.value : EVENT_TYPES.HOLIDAY);
    const isRange = elements.holidayIsRange.checked || eventType === EVENT_TYPES.EVALUATION_PERIOD;

    const existingId = elements.holidayId.value;
    const existingEv = existingId
        ? (appData.events || []).find(ev => ev.id === existingId)
        : null;
    const editedName = elements.holidayName.value.trim();
    const savePayload = {
        id: existingId || generateId(),
        type: eventType,
        name: editedName,
        notes: elements.eventNotes ? elements.eventNotes.value : '',
        isRange,
        date: isRange ? null : elements.holidayDate.value,
        startDate: isRange ? elements.holidayStartDate.value : null,
        endDate: isRange ? elements.holidayEndDate.value : null,
        bgColor: elements.holidayBgColor.value,
        textColor: elements.holidayTextColor.value,
        grades,
        classNames,
        sectionLevels,
        allElementary,
        allMiddleSchool
    };
    if (existingEv && existingEv.nameKo && existingEv.nameEn) {
        savePayload.nameKo = existingEv.nameKo;
        savePayload.nameEn = existingEv.nameEn;
        if (currentLanguage === 'ko') {
            savePayload.nameKo = editedName;
        } else {
            savePayload.nameEn = editedName;
        }
        savePayload.name = currentLanguage === 'ko' ? savePayload.nameKo : savePayload.nameEn;
    }
    const eventData = normalizeEvent(savePayload);

    if (!Array.isArray(appData.events)) {
        appData.events = [];
    }

    if (elements.holidayId.value) {
        const index = appData.events.findIndex(ev => ev.id === eventData.id);
        if (index !== -1) {
            appData.events[index] = eventData;
        }
    } else {
        appData.events.push(eventData);
    }

    syncHolidaysFromEvents();
    saveData();
    renderCalendar();
    renderEventList();
    if (eventEditorMount === 'tab') {
        updateEventEditorEmptyState();
    } else {
        closeModal(elements.holidayModal);
    }
}

function deleteHoliday() {
    const id = elements.holidayId.value;
    if (id && confirm(t('confirmDeleteEvent') || t('confirmDeleteHoliday'))) {
        appData.events = (appData.events || []).filter(ev => ev.id !== id);
        syncHolidaysFromEvents();
        saveData();
        renderCalendar();
        renderEventList();
        if (eventEditorMount === 'tab') {
            elements.holidayForm.reset();
            elements.holidayId.value = '';
            updateEventEditorEmptyState();
        } else {
            closeModal(elements.holidayModal);
        }
    }
}

// ============================================
// Lesson Configuration Helpers
// ============================================
function sanitizeTotalLessons(value) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
        return 1;
    }
    return parsed;
}

function getTotalLessonsValue() {
    return sanitizeTotalLessons(elements.classTotalLessons.value || 4);
}

function formatLessonDayLabel(n) {
    return t('lessonDayLabel').replace('{n}', n);
}

function formatMergeLabel(start, end) {
    return t('mergeDaysLabel').replace('{start}', start).replace('{end}', end);
}

function normalizeCompressionMerges(mergeStarts, totalLessons) {
    if (!Array.isArray(mergeStarts)) return [];
    const uniqueSorted = [...new Set(mergeStarts.map(Number))]
        .filter(n => Number.isInteger(n) && n >= 1 && n < totalLessons)
        .sort((a, b) => a - b);
    const normalized = [];
    uniqueSorted.forEach(start => {
        const prev = normalized[normalized.length - 1];
        if (prev === start - 1) return; // overlapping merge
        normalized.push(start);
    });
    return normalized;
}

function buildLessonGroups(totalLessons, mergeStarts) {
    const normalizedMerges = normalizeCompressionMerges(mergeStarts, totalLessons);
    const groups = [];
    for (let day = 1; day <= totalLessons; day++) {
        if (normalizedMerges.includes(day)) {
            groups.push({
                start: day,
                end: day + 1,
                days: [day, day + 1],
                label: formatMergeLabel(day, day + 1),
                compressed: true
            });
            day += 1;
        } else {
            groups.push({
                start: day,
                end: day,
                days: [day],
                label: formatLessonDayLabel(day),
                compressed: false
            });
        }
    }
    return { groups, merges: normalizedMerges };
}

function getCustomLessonDatesFromInputs() {
    const inputs = elements.customLessonDates.querySelectorAll('input[data-lesson-index]');
    const dates = [];
    inputs.forEach(input => {
        const index = parseInt(input.dataset.lessonIndex, 10);
        dates[index] = input.value || null;
    });
    return dates;
}

function renderCustomLessonDates(totalLessons, existingDates = []) {
    elements.customLessonDates.innerHTML = '';
    for (let i = 1; i <= totalLessons; i++) {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';

        const label = document.createElement('label');
        label.setAttribute('for', `customDay_${i}`);
        label.textContent = formatLessonDayLabel(i);

        const input = document.createElement('input');
        input.type = 'date';
        input.id = `customDay_${i}`;
        input.dataset.lessonIndex = i - 1;
        input.value = existingDates[i - 1] || '';

        formGroup.appendChild(label);
        formGroup.appendChild(input);
        elements.customLessonDates.appendChild(formGroup);
    }
}

function renderCompressionOptions(totalLessons, selectedMerges = []) {
    const normalizedMerges = normalizeCompressionMerges(selectedMerges, totalLessons);
    elements.compressionCheckboxes.innerHTML = '';

    for (let i = 1; i < totalLessons; i++) {
        const label = document.createElement('label');
        label.className = 'checkbox-label';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.mergeStart = i;
        input.checked = normalizedMerges.includes(i);
        input.addEventListener('change', updateCompressionCheckboxStates);

        const span = document.createElement('span');
        span.textContent = formatMergeLabel(i, i + 1);

        label.appendChild(input);
        label.appendChild(span);
        elements.compressionCheckboxes.appendChild(label);
    }

    updateCompressionCheckboxStates();
}

function updateCompressionCheckboxStates() {
    const checkboxes = elements.compressionCheckboxes.querySelectorAll('input[type="checkbox"]');
    const selected = new Set(
        Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => parseInt(cb.dataset.mergeStart, 10))
    );

    checkboxes.forEach(cb => {
        const start = parseInt(cb.dataset.mergeStart, 10);
        const hasConflict = selected.has(start - 1) || selected.has(start + 1);
        cb.disabled = !cb.checked && hasConflict;
    });
}

function getSelectedCompressionMerges() {
    const checkboxes = elements.compressionCheckboxes.querySelectorAll('input[type="checkbox"]');
    return Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.dataset.mergeStart, 10))
        .sort((a, b) => a - b);
}

function getCustomScheduleDaysFromClass(classData, totalLessons) {
    const days = [];
    if (classData.customSchedule && Array.isArray(classData.customSchedule.days)) {
        classData.customSchedule.days.forEach((value, index) => {
            days[index] = value || null;
        });
    } else if (classData.customSchedule) {
        days[0] = classData.customSchedule.day1 || null;
        days[1] = classData.customSchedule.day2 || null;
        days[2] = classData.customSchedule.day3 || null;
        days[3] = classData.customSchedule.day4 || null;
    }

    for (let i = 0; i < totalLessons; i++) {
        if (typeof days[i] === 'undefined') {
            days[i] = null;
        }
    }

    return days;
}

function getCompressionMergesFromClass(classData, totalLessons) {
    if (Array.isArray(classData.compressionMerges)) {
        return normalizeCompressionMerges(classData.compressionMerges, totalLessons);
    }

    const legacyMerges = [];
    if (classData.customSchedule) {
        if (classData.customSchedule.compressDay12) legacyMerges.push(1);
        if (classData.customSchedule.compressDay34) legacyMerges.push(3);
    }

    return normalizeCompressionMerges(legacyMerges, totalLessons);
}

// ============================================
// Smart Scheduling Logic
// ============================================
function calculateLessonDates(classData) {
    const key = computeScheduleCacheKey();
    if (key !== scheduleCacheKey) {
        scheduleCacheKey = key;
        scheduleCacheMap.clear();
    }
    if (!scheduleCacheMap.has(classData.id)) {
        scheduleCacheMap.set(classData.id, computeLessonScheduleForClass(classData));
    }
    return scheduleCacheMap.get(classData.id);
}

function computeLessonScheduleForClass(classData) {
    if (classData.customSchedule && classData.customSchedule.enabled) {
        return calculateCustomLessonDates(classData);
    }
    return calculateAutoLessonDates(classData);
}

function calculateCustomLessonDates(classData) {
    const totalLessons = sanitizeTotalLessons(classData.totalLessons || 4);
    const customDays = getCustomScheduleDaysFromClass(classData, totalLessons);
    const merges = getCompressionMergesFromClass(classData, totalLessons);
    const { groups, merges: normalizedMerges } = buildLessonGroups(totalLessons, merges);
    const lessons = [];

    groups.forEach(group => {
        const dateValue = customDays[group.start - 1];
        if (dateValue) {
            const d = parseISODateLocal(dateValue);
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            lessons.push({
                date: d,
                label: group.label,
                compressed: group.compressed,
                group,
                monthKey,
                book: getBookForMonthKey(classData, monthKey)
            });
        }
    });

    return {
        lessons,
        compressed: groups.some(group => group.compressed),
        availableCount: lessons.length,
        isCustom: true,
        groups,
        totalGroups: groups.length,
        scheduledCount: lessons.length,
        selectedMerges: normalizedMerges,
        monthlyDetails: null
    };
}

function calculateSequentialTermLessonDates(classData) {
    const meetingDays = getMeetingDaysFromClass(classData);
    const totalLessons = sanitizeTotalLessons(classData.totalLessons || 8);

    if (meetingDays.length === 0) {
        return {
            lessons: [],
            compressed: false,
            availableCount: 0,
            isCustom: false,
            scheduleModel: SCHEDULE_MODEL_SEQUENTIAL_TERM,
            groups: [],
            totalGroups: totalLessons,
            scheduledCount: 0,
            selectedMerges: [],
            monthlyDetails: []
        };
    }

    const classStart = parseISODateLocal(classData.startDate);
    const classEnd = parseISODateLocal(classData.endDate);
    if (Number.isNaN(classStart.getTime()) || Number.isNaN(classEnd.getTime())) {
        return {
            lessons: [],
            compressed: false,
            availableCount: 0,
            isCustom: false,
            scheduleModel: SCHEDULE_MODEL_SEQUENTIAL_TERM,
            groups: [],
            totalGroups: totalLessons,
            scheduledCount: 0,
            selectedMerges: [],
            monthlyDetails: []
        };
    }

    const allEligible = collectEligibleMeetingDatesInMonth(
        classStart,
        classEnd,
        meetingDays,
        classData
    );
    const monthKeys = enumerateMonthKeysBetween(classData.startDate, classData.endDate);
    const monthlyDetails = monthKeys.map(monthKey => ({
        monthKey,
        eligibleCount: 0,
        mergesUsed: [],
        autoAdjusted: false,
        scheduledInMonth: 0,
        totalGroups: 0
    }));
    const monthIndex = {};
    monthlyDetails.forEach(d => {
        monthIndex[d.monthKey] = d;
    });

    const lessons = [];
    const scheduleCount = Math.min(totalLessons, allEligible.length);
    for (let i = 0; i < scheduleCount; i += 1) {
        const d = allEligible[i];
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const lessonNum = i + 1;
        const group = {
            start: lessonNum,
            end: lessonNum,
            days: [lessonNum],
            label: getSequentialLessonLabel(classData, lessonNum),
            compressed: false
        };
        lessons.push({
            date: d,
            label: group.label,
            compressed: false,
            group,
            monthKey,
            book: getBookForMonthKey(classData, monthKey)
        });
        if (monthIndex[monthKey]) {
            monthIndex[monthKey].scheduledInMonth += 1;
        }
    }

    monthKeys.forEach(monthKey => {
        const y = parseInt(monthKey.slice(0, 4), 10);
        const m = parseInt(monthKey.slice(5, 7), 10);
        const firstOfMonth = new Date(y, m - 1, 1);
        const lastOfMonth = new Date(y, m, 0);
        const rangeStart = maxDate(firstOfMonth, classStart);
        const rangeEnd = minDate(lastOfMonth, classEnd);
        if (rangeStart > rangeEnd) {
            return;
        }
        const eligible = collectEligibleMeetingDatesInMonth(
            rangeStart,
            rangeEnd,
            meetingDays,
            classData
        );
        if (monthIndex[monthKey]) {
            monthIndex[monthKey].eligibleCount = eligible.length;
        }
    });

    const groups = [];
    for (let n = 1; n <= totalLessons; n += 1) {
        groups.push({
            start: n,
            end: n,
            days: [n],
            label: getSequentialLessonLabel(classData, n),
            compressed: false
        });
    }

    return {
        lessons,
        compressed: false,
        availableCount: allEligible.length,
        isCustom: false,
        scheduleModel: SCHEDULE_MODEL_SEQUENTIAL_TERM,
        groups,
        totalGroups: totalLessons,
        scheduledCount: lessons.length,
        selectedMerges: [],
        monthlyDetails
    };
}

function calculateAutoLessonDates(classData) {
    if (!classUsesDebateCompression(classData)) {
        return calculateSequentialTermLessonDates(classData);
    }
    const meetingDays = getMeetingDaysFromClass(classData);
    const totalLessons = sanitizeTotalLessons(classData.totalLessons || 4);
    const userMerges = getCompressionMergesFromClass(classData, totalLessons);
    const mode = classData.compressionMode === 'manual' ? 'manual' : 'autoWhenNeeded';

    if (meetingDays.length === 0) {
        const emptyGroups = buildLessonGroups(totalLessons, userMerges).groups;
        return {
            lessons: [],
            compressed: false,
            availableCount: 0,
            isCustom: false,
            groups: emptyGroups,
            totalGroups: emptyGroups.length,
            scheduledCount: 0,
            selectedMerges: userMerges,
            monthlyDetails: []
        };
    }

    const classStart = parseISODateLocal(classData.startDate);
    const classEnd = parseISODateLocal(classData.endDate);
    if (Number.isNaN(classStart.getTime()) || Number.isNaN(classEnd.getTime())) {
        const emptyGroups = buildLessonGroups(totalLessons, userMerges).groups;
        return {
            lessons: [],
            compressed: false,
            availableCount: 0,
            isCustom: false,
            groups: emptyGroups,
            totalGroups: emptyGroups.length,
            scheduledCount: 0,
            selectedMerges: userMerges,
            monthlyDetails: []
        };
    }

    const monthKeys = enumerateMonthKeysBetween(classData.startDate, classData.endDate);
    const lessons = [];
    const monthlyDetails = [];

    monthKeys.forEach(monthKey => {
        const y = parseInt(monthKey.slice(0, 4), 10);
        const m = parseInt(monthKey.slice(5, 7), 10);
        const firstOfMonth = new Date(y, m - 1, 1);
        const lastOfMonth = new Date(y, m, 0);
        const rangeStart = maxDate(firstOfMonth, classStart);
        const rangeEnd = minDate(lastOfMonth, classEnd);
        if (rangeStart > rangeEnd) {
            return;
        }

        const eligible = collectEligibleMeetingDatesInMonth(
            rangeStart,
            rangeEnd,
            meetingDays,
            classData
        );

        const A = eligible.length;
        const mergesForMonth = mergePlanToFit(A, totalLessons, userMerges, mode);
        const { groups, merges: appliedMerges } = buildLessonGroups(totalLessons, mergesForMonth);
        const autoAdjusted = mode === 'autoWhenNeeded' && appliedMerges.length > 0;
        const scheduleCount = Math.min(groups.length, A);
        const book = getBookForMonthKey(classData, monthKey);

        for (let i = 0; i < scheduleCount; i += 1) {
            const group = groups[i];
            lessons.push({
                date: eligible[i],
                label: group.label,
                compressed: group.compressed,
                group,
                monthKey,
                book
            });
        }

        monthlyDetails.push({
            monthKey,
            eligibleCount: A,
            mergesUsed: appliedMerges,
            autoAdjusted,
            scheduledInMonth: scheduleCount,
            totalGroups: groups.length
        });
    });

    const templateMerges = mode === 'autoWhenNeeded' ? [] : userMerges;
    const templateGroups = buildLessonGroups(totalLessons, templateMerges).groups;

    return {
        lessons,
        compressed: lessons.some(l => l.compressed),
        availableCount: monthlyDetails.reduce((sum, d) => sum + d.eligibleCount, 0),
        isCustom: false,
        groups: templateGroups,
        totalGroups: templateGroups.length,
        scheduledCount: lessons.length,
        selectedMerges: userMerges,
        monthlyDetails
    };
}

/** Calendar events shown inline in syllabus rows (on lesson days), after holidays. */
const SYLLABUS_INLINE_EVENT_TYPE_ORDER = [
    EVENT_TYPES.EVALUATION_PERIOD,
    EVENT_TYPES.EVALUATION_DEADLINE,
    EVENT_TYPES.OTHER
];

function targetFilterAppliesToClass(target, classData) {
    if (!target || !classData) {
        return false;
    }
    if (!holidayHasAnyTargetFilter(target)) {
        return true;
    }

    const hasClassNames = target.classNames && target.classNames.length > 0;
    const hasGrades = target.grades && target.grades.length > 0;
    const hasSections = target.sectionLevels && target.sectionLevels.length > 0;

    if (hasClassNames && target.classNames.includes(classData.name)) {
        return true;
    }
    if (hasGrades && target.grades.includes(classData.grade)) {
        return true;
    }
    if (target.allElementary === true && isElementaryGrade(classData.grade)) {
        return true;
    }
    if (target.allMiddleSchool === true && isMiddleSchoolGrade(classData.grade)) {
        return true;
    }
    if (hasSections) {
        const sec = getClassSectionPreset(classData);
        if (sec && target.sectionLevels.includes(sec)) {
            return true;
        }
    }

    return false;
}

function eventAppliesToClass(event, classData) {
    return targetFilterAppliesToClass(event, classData);
}

function getEventsForClassOnDate(dateStr, classData) {
    syncHolidaysFromEvents();
    return getCalendarEvents().filter(ev => {
        if (!getEventDates(ev).includes(dateStr)) {
            return false;
        }
        return eventAppliesToClass(ev, classData);
    });
}

function getInlineScheduleEventForClassOnDate(dateStr, classData) {
    const onDay = getEventsForClassOnDate(dateStr, classData);
    for (const type of SYLLABUS_INLINE_EVENT_TYPE_ORDER) {
        const hit = onDay.find(ev => normalizeEventType(ev.type) === type);
        if (hit) {
            return { ...hit, name: getEventDisplayName(hit) };
        }
    }
    return null;
}

function getClassLevelPresetName(classData) {
    const presetId = resolveLevelPresetForForm(classData);
    if (!presetId) {
        return '';
    }
    const def = getSimsonLevelById(presetId);
    return def ? def.name : presetId;
}

/** Unique textbook titles used during this class term (for print/PDF headings). */
function getBooksUsedForClassTitle(classData) {
    const seen = new Set();
    const list = [];
    const add = (raw) => {
        const book = String(raw || '').trim();
        if (book && !seen.has(book)) {
            seen.add(book);
            list.push(book);
        }
    };
    try {
        const { lessons } = calculateLessonDates(classData);
        if (lessons && lessons.length) {
            lessons.forEach(l => {
                const mk = l.monthKey || formatDateISO(l.date).slice(0, 7);
                const bk = l.book != null && l.book !== '' ? l.book : getBookForMonthKey(classData, mk);
                add(bk);
            });
        }
    } catch (_) {
        /* fall through to static book fields */
    }
    if (list.length === 0) {
        const map = classData.booksByMonth && typeof classData.booksByMonth === 'object'
            ? classData.booksByMonth
            : {};
        Object.keys(map).sort().forEach(k => add(map[k]));
        add(classData.book);
    }
    return list;
}

function formatSyllabusPdfClassTitle(classData) {
    const subject = (classData.name || '').trim();
    const levelPreset = getClassLevelPresetName(classData);
    const levelCustom = resolveLevelCustomForForm(classData);
    const gradeRaw = (classData.grade || '').trim();
    const norm = (s) => String(s || '').trim().toLowerCase();

    const parts = [];
    if (subject) {
        parts.push(subject);
    }
    if (levelPreset && norm(levelPreset) !== norm(subject)) {
        parts.push(levelPreset);
    } else if (levelPreset && !subject) {
        parts.push(levelPreset);
    }
    if (levelCustom && norm(levelCustom) !== norm(levelPreset) && norm(levelCustom) !== norm(subject)) {
        parts.push(`[${levelCustom}]`);
    }
    if (gradeRaw) {
        const gradePart = /\bclass\b/i.test(gradeRaw) ? gradeRaw : `${gradeRaw} Class`;
        parts.push(`[${gradePart}]`);
    }

    let title = parts.length ? parts.join(' ') : subject || levelPreset || 'Class';
    const books = getBooksUsedForClassTitle(classData);
    if (books.length) {
        title += ` · ${books.join('; ')}`;
    }
    const termLabel = formatClassTermLabel(classData);
    if (termLabel) {
        title = `${termLabel} · ${title}`;
    }
    return title;
}

/** YYYY-MM from class start date, or calendar term start month as fallback. */
function getClassScheduleStartMonthKey(classData) {
    const start = (classData.startDate || '').trim();
    if (/^\d{4}-\d{2}/.test(start)) {
        return start.slice(0, 7);
    }
    const term = (appData.termStart || '').trim();
    if (/^\d{4}-\d{2}/.test(term)) {
        return term;
    }
    return null;
}

function getTermSeasonI18nKeyForMonth(monthNum) {
    if (monthNum >= 3 && monthNum <= 5) {
        return 'termSeasonSpring';
    }
    if (monthNum >= 6 && monthNum <= 8) {
        return 'termSeasonSummer';
    }
    if (monthNum >= 9 && monthNum <= 11) {
        return 'termSeasonFall';
    }
    if (monthNum === 12 || monthNum === 1 || monthNum === 2) {
        return 'termSeasonWinter';
    }
    return null;
}

/** e.g. "Spring 2026" from class start month (Mar–May → Spring, etc.). */
function formatClassTermLabel(classData) {
    const monthKey = getClassScheduleStartMonthKey(classData);
    if (!monthKey) {
        return '';
    }
    const [yearStr, monthStr] = monthKey.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (!year || !month) {
        return '';
    }
    const seasonKey = getTermSeasonI18nKeyForMonth(month);
    if (!seasonKey) {
        return '';
    }
    return `${t(seasonKey)} ${year}`;
}

function getSyllabusYearForClass(classData) {
    const start = (classData.startDate || '').trim();
    if (start && /^\d{4}/.test(start)) {
        return start.slice(0, 4);
    }
    const term = (appData.termStart || '').trim();
    if (term && /^\d{4}/.test(term)) {
        return term.slice(0, 4);
    }
    return String(new Date().getFullYear());
}

// Check if a date is a holiday for a specific class
function isHolidayForClass(dateStr, classData) {
    const holiday = getHolidayForDate(dateStr);
    if (!holiday) {
        return false;
    }
    return eventAppliesToClass(holiday, classData);
}

// Get holiday that covers a specific date (handles both single dates and ranges)
function getHolidayForDate(dateStr) {
    syncHolidaysFromEvents();
    if (!Array.isArray(appData.holidays)) {
        return null;
    }
    const checkDate = parseISODateLocal(dateStr);
    if (Number.isNaN(checkDate.getTime())) {
        return null;
    }

    for (const holiday of appData.holidays) {
        if (holiday.isRange) {
            const start = parseISODateLocal(holiday.startDate);
            const end = parseISODateLocal(holiday.endDate);
            if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
                && checkDate >= start && checkDate <= end) {
                return getLocalizedHolidayRecord(holiday);
            }
        } else if (holiday.date === dateStr) {
            return getLocalizedHolidayRecord(holiday);
        }
    }

    return null;
}

// Get all dates covered by a holiday (for display purposes)
function getHolidayDates(holiday) {
    const dates = [];
    
    if (holiday.isRange) {
        const current = new Date(holiday.startDate);
        const end = new Date(holiday.endDate);
        
        while (current <= end) {
            dates.push(formatDateISO(current));
            current.setDate(current.getDate() + 1);
        }
    } else {
        dates.push(holiday.date);
    }
    
    return dates;
}

// ============================================
// Calendar Rendering
// ============================================
function renderCalendar() {
    if (!elements.calendarContainer) {
        return;
    }
    if (!appData.termStart) return;

    syncHolidaysFromEvents();
    if (pruneLessonFiltersToScheduledOptions()) {
        saveData();
    }
    const dayIndex = buildDayIndex();

    elements.calendarContainer.innerHTML = '';

    for (let i = 0; i < dayIndex.monthCount; i++) {
        const monthDate = new Date(dayIndex.startDate);
        monthDate.setMonth(monthDate.getMonth() + i);
        renderMonth(monthDate, dayIndex);
    }

    updatePrintSummary();
    updateLessonFilterButtonLabel();
    updatePrintLessonFilterHint();
    if (isLessonFilterPopoverOpen()) {
        renderLessonFilterPopoverBody();
        updateLessonFilterStatusText();
    }
    if (getActiveTab() === 'classes') {
        renderClassList();
    }
    if (getActiveTab() === 'events') {
        renderEventList();
    }
}

function renderMonth(date, dayIndex) {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const monthNames = t('monthNames');
    const dayNames = t('dayNamesShort');
    
    // Create month container
    const monthDiv = document.createElement('div');
    monthDiv.className = 'month-calendar';
    
    // Month header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'month-header';
    headerDiv.innerHTML = `<h2>${monthNames[month]} ${year}</h2>`;
    monthDiv.appendChild(headerDiv);
    
    // Calendar grid
    const gridDiv = document.createElement('div');
    gridDiv.className = 'calendar-grid';
    
    // Day headers
    dayNames.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day-header';
        dayHeader.textContent = day;
        gridDiv.appendChild(dayHeader);
    });
    
    // Get first day of month and total days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    
    const scheduledLessons = dayIndex.scheduledLessons;
    const eventsByDate = dayIndex.eventsByDate;
    
    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        const dayDiv = createDayCell(prevMonthDays - i, true);
        gridDiv.appendChild(dayDiv);
    }
    
    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayEvents = eventsByDate[dateStr] || [];
        const lessons = scheduledLessons[dateStr] || [];
        
        const dayDiv = createDayCell(day, false, dayEvents, lessons, dateStr);
        gridDiv.appendChild(dayDiv);
    }
    
    // Next month days (fill to complete last row)
    const totalCells = firstDay + daysInMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remainingCells; i++) {
        const dayDiv = createDayCell(i, true);
        gridDiv.appendChild(dayDiv);
    }

    const weekRows = (firstDay + daysInMonth + remainingCells) / 7;
    monthDiv.style.setProperty('--calendar-week-rows', String(weekRows));
    monthDiv.dataset.weekRows = String(weekRows);
    
    monthDiv.appendChild(gridDiv);
    elements.calendarContainer.appendChild(monthDiv);
}

function createDayCell(dayNumber, isOtherMonth, dayEvents = [], lessons = [], dateStr = '') {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day';
    
    if (isOtherMonth) {
        dayDiv.classList.add('other-month');
    }
    
    const visibleEvents = (dayEvents || []).filter(ev => {
        const type = normalizeEventType(ev.type);
        if (type === EVENT_TYPES.HOLIDAY) return isCalendarItemVisible('holiday');
        return isCalendarItemVisible(type);
    });
    const blockingHoliday = visibleEvents.find(ev => normalizeEventType(ev.type) === EVENT_TYPES.HOLIDAY);
    let holidayBg = '';
    let holidayText = '';
    if (blockingHoliday) {
        holidayBg = blockingHoliday.bgColor || '#fef3c7';
        holidayText = blockingHoliday.textColor || '#b45309';
        dayDiv.classList.add('holiday', 'cal-item-holiday');
        dayDiv.dataset.eventId = blockingHoliday.id;
        dayDiv.style.backgroundColor = holidayBg;
        dayDiv.addEventListener('click', (e) => {
            if (e.target === dayDiv || e.target.classList.contains('day-number') || e.target.classList.contains('holiday-name') || e.target.classList.contains('calendar-event-chip')) {
                openEventEditor(blockingHoliday, 'calendar-popout');
            }
        });
    }
    if (visibleEvents.some(ev => normalizeEventType(ev.type) === EVENT_TYPES.EVALUATION_PERIOD)) {
        dayDiv.classList.add('has-eval-period');
    }

    // Day number
    const numberDiv = document.createElement('div');
    numberDiv.className = 'day-number';
    numberDiv.textContent = dayNumber;
    if (blockingHoliday) {
        numberDiv.style.color = getReadableTextOnBackground(holidayBg, holidayText);
    }
    dayDiv.appendChild(numberDiv);
    
    if (blockingHoliday) {
        const holidayDiv = document.createElement('div');
        holidayDiv.className = 'holiday-name cal-item-holiday';
        holidayDiv.dataset.eventId = blockingHoliday.id;
        holidayDiv.style.color = getReadableTextOnBackground(holidayBg, holidayText);
        let appliesText = '';
        if (eventHasAnyTargetFilter(blockingHoliday)) {
            appliesText = ` (${getEventAppliesToDescriptionParts(blockingHoliday).join('; ')})`;
        }
        const holidayLabel = getEventDisplayName(blockingHoliday) + appliesText;
        holidayDiv.textContent = holidayLabel;
        holidayDiv.title = holidayLabel;
        dayDiv.appendChild(holidayDiv);
    }

    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'calendar-event-chips';
    visibleEvents.filter(ev => normalizeEventType(ev.type) !== EVENT_TYPES.HOLIDAY).forEach(ev => {
        const type = normalizeEventType(ev.type);
        const chip = document.createElement('div');
        chip.className = `calendar-event-chip cal-item-${type} event-type-${type}`;
        chip.dataset.eventId = ev.id;
        chip.style.backgroundColor = ev.bgColor || EVENT_TYPE_DEFAULT_COLORS[type].bg;
        chip.style.color = ev.textColor || EVENT_TYPE_DEFAULT_COLORS[type].text;
        const chipLabel = getEventDisplayName(ev);
        chip.textContent = chipLabel;
        chip.title = chipLabel || getEventTypeLabel(type);
        chip.addEventListener('click', (e) => { e.stopPropagation(); openEventEditor(ev, 'calendar-popout'); });
        chipsWrap.appendChild(chip);
    });
    if (chipsWrap.children.length > 0) dayDiv.appendChild(chipsWrap);

    const visibleLessons = lessons.filter(({ classData }) => classPassesLessonFilters(classData));
    if (isCalendarItemVisible('lessons') && visibleLessons.length > 0) {
        const eventsDiv = document.createElement('div');
        eventsDiv.className = 'day-events';
        
        visibleLessons.forEach(({ classData, lesson }) => {
            const eventBar = document.createElement('div');
            eventBar.className = 'event-bar cal-item-lessons';
            eventBar.style.backgroundColor = classData.color;
            eventBar.style.color = classData.textColor || DEFAULT_CLASS_TEXT_COLOR;
            const bookLabel = lesson.book != null && lesson.book !== ''
                ? lesson.book
                : getBookForMonthKey(classData, lesson.monthKey || formatDateISO(lesson.date).slice(0, 7));
            eventBar.innerHTML = `
                <span class="event-title">${escapeHtml(classData.name)} - ${escapeHtml(lesson.label)}</span>
                <span class="event-book">${escapeHtml(bookLabel)}</span>
            `;
            
            // Store data for popup
            eventBar.dataset.classId = classData.id;
            eventBar.dataset.className = classData.name;
            eventBar.dataset.classLevel = getClassLevelDisplay(classData);
            eventBar.dataset.classGrade = classData.grade;
            eventBar.dataset.classBook = bookLabel;
            eventBar.dataset.lessonLabel = lesson.label;
            
            // Click to edit class
            eventBar.addEventListener('click', (e) => {
                e.stopPropagation();
                openClassEditor(classData, 'calendar-popout');
            });
            
            // Hover for popup
            eventBar.addEventListener('mouseenter', showPopup);
            eventBar.addEventListener('mouseleave', hidePopup);
            
            eventsDiv.appendChild(eventBar);
        });
        
        dayDiv.appendChild(eventsDiv);
    }

    if (!isOtherMonth && dateStr) {
        dayDiv.dataset.date = dateStr;
        dayDiv.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showCalendarContextMenu(e.clientX, e.clientY, dateStr);
        });
    }
    
    return dayDiv;
}

// ============================================
// Popup Functions
// ============================================
function showPopup(e) {
    const bar = e.currentTarget;
    const popup = elements.classPopup;
    
    popup.querySelector('.popup-title').textContent = bar.dataset.className;
    popup.querySelector('.popup-level').textContent = bar.dataset.classLevel;
    popup.querySelector('.popup-grade').textContent = bar.dataset.classGrade;
    popup.querySelector('.popup-book').textContent = bar.dataset.classBook;
    popup.querySelector('.popup-lesson').textContent = bar.dataset.lessonLabel;
    
    popup.classList.add('active');
}

function hidePopup() {
    elements.classPopup.classList.remove('active');
}

function handlePopupPosition(e) {
    const popup = elements.classPopup;
    if (popup.classList.contains('active')) {
        const x = e.clientX + 15;
        const y = e.clientY + 15;
        
        // Keep popup in viewport
        const rect = popup.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width - 20;
        const maxY = window.innerHeight - rect.height - 20;
        
        popup.style.left = Math.min(x, maxX) + 'px';
        popup.style.top = Math.min(y, maxY) + 'px';
    }
}

// ============================================
// Print Functions
// ============================================
function applyPrintCalendarVisibilityClasses() {
    const printMap = {
        lessons: 'printCalLessons',
        holidays: 'printCalHolidays',
        evaluation_deadline: 'printCalEvalDeadline',
        homework_deadline: 'printCalHomeworkDeadline',
        evaluation_period: 'printCalEvalPeriod',
        other: 'printCalOther'
    };
    Object.keys(printMap).forEach(key => {
        const el = document.getElementById(printMap[key]);
        const on = el ? el.checked : true;
        document.body.classList.toggle(`print-hide-cal-${key}`, !on);
    });
}

function getAppStylesheetHref() {
    const link = document.querySelector('link[rel="stylesheet"][href]');
    if (link) {
        try {
            return new URL(link.getAttribute('href'), document.baseURI).href;
        } catch (e) { /* fall through */ }
    }
    try {
        return new URL('styles.css', document.baseURI).href;
    } catch (e) {
        return 'styles.css';
    }
}

function getAppPrintCalendarName() {
    return (appData.calendarName && appData.calendarName.trim()) || document.title;
}

function collectAppPrintCalendarBodyClasses() {
    const classes = [];
    document.body.classList.forEach(c => {
        if (c.startsWith('print-hide-cal-')) {
            classes.push(c);
        }
    });
    return classes;
}

function collectAppPrintSummaryBodyClasses(opts) {
    const classes = [];
    if (opts.syllabusOnly) {
        classes.push('print-syllabus-only');
    }
    return classes;
}

/** Warn before calendar print when the grid is likely too crowded for the fixed print layout. */
const CALENDAR_PRINT_DENSITY = {
    maxVisibilityTypes: 3,
    warnVisibleClasses: 10
};

const PRINT_CALENDAR_VISIBILITY_KEYS = [
    'lessons',
    'holidays',
    'evaluation_deadline',
    'homework_deadline',
    'evaluation_period',
    'other'
];

function readPrintCalendarVisibilityFromForm() {
    return {
        lessons: document.getElementById('printCalLessons')?.checked !== false,
        holidays: document.getElementById('printCalHolidays')?.checked !== false,
        evaluation_deadline: document.getElementById('printCalEvalDeadline')?.checked !== false,
        homework_deadline: document.getElementById('printCalHomeworkDeadline')?.checked !== false,
        evaluation_period: document.getElementById('printCalEvalPeriod')?.checked !== false,
        other: document.getElementById('printCalOther')?.checked !== false
    };
}

function countPrintCalendarVisibilityTypesEnabled(visibility) {
    return PRINT_CALENDAR_VISIBILITY_KEYS.filter((key) => visibility[key] !== false).length;
}

function getCalendarPrintDensityWarnings() {
    const visibility = readPrintCalendarVisibilityFromForm();
    const typeCount = countPrintCalendarVisibilityTypesEnabled(visibility);
    const visibleClasses = isLessonFilterActive()
        ? countVisibleClassesForLessonFilter()
        : countScheduledClassesOnCalendar();
    const warnings = [];

    if (typeCount > CALENDAR_PRINT_DENSITY.maxVisibilityTypes) {
        warnings.push(t('printCalendarWarnManyTypes')
            .replace('{count}', String(typeCount))
            .replace('{max}', String(CALENDAR_PRINT_DENSITY.maxVisibilityTypes)));
    }
    if (visibility.lessons !== false
        && visibleClasses > CALENDAR_PRINT_DENSITY.warnVisibleClasses) {
        warnings.push(t('printCalendarWarnManyClasses')
            .replace('{count}', String(visibleClasses)));
    }
    return warnings;
}

/** If the calendar print would be crowded, confirm before continuing. */
function confirmCalendarPrintDespiteDensityWarnings() {
    const warnings = getCalendarPrintDensityWarnings();
    if (!warnings.length) {
        return true;
    }
    const message = `${warnings.join('\n\n')}\n\n${t('printCalendarWarnContinue')}`;
    return window.confirm(message);
}

/** Landscape A4 — one month per printed page (matches @page in APP_PRINT_CALENDAR_INLINE_CSS). */
const CALENDAR_PRINT_LANDSCAPE = {
    pageW: 297,
    pageH: 210,
    margin: 10,
    fitSafety: 2,
    get contentW() {
        return this.pageW - this.margin * 2;
    },
    get contentH() {
        return this.pageH - this.margin * 2;
    },
    get fitContentH() {
        return this.contentH - this.fitSafety;
    }
};

const APP_PRINT_CALENDAR_INLINE_CSS = `
@page {
    size: A4 landscape;
    margin: 0;
}
@page calendar-landscape {
    size: A4 landscape;
    margin: 0;
}
@media print {
    @page {
        size: A4 landscape;
        margin: 0;
    }
    @page calendar-landscape {
        size: A4 landscape;
        margin: 0;
    }
    * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
}
html.app-print-calendar-root,
body.app-print-calendar-doc {
    width: ${CALENDAR_PRINT_LANDSCAPE.pageW}mm;
    min-width: ${CALENDAR_PRINT_LANDSCAPE.pageW}mm;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111;
}
body.app-print-calendar-doc { margin: 0; background: #fff; color: #111; }
.app-print-document--calendar { max-width: 100%; padding: 0; }
.app-print-document--calendar .calendar-container {
    display: flex !important;
    flex-direction: column !important;
    flex-wrap: nowrap !important;
    grid-template-columns: unset !important;
    gap: 0 !important;
    width: 100%;
    max-width: 100%;
}
.app-print-document--calendar .calendar-print-sheet {
    page: calendar-landscape;
    width: ${CALENDAR_PRINT_LANDSCAPE.pageW}mm;
    height: ${CALENDAR_PRINT_LANDSCAPE.pageH}mm;
    max-height: ${CALENDAR_PRINT_LANDSCAPE.pageH}mm;
    box-sizing: border-box;
    padding: ${CALENDAR_PRINT_LANDSCAPE.margin}mm;
    margin: 0 auto;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    page-break-inside: avoid;
    break-inside: avoid;
    position: relative;
    display: block;
}
.app-print-document--calendar .calendar-print-fit-wrap {
    box-sizing: border-box;
    overflow: hidden;
    margin: 0 auto;
}
.app-print-document--calendar .calendar-print-fit-wrap > .month-calendar {
    display: flex;
    flex-direction: column;
    width: 100% !important;
    max-width: 100% !important;
    height: 100%;
    box-sizing: border-box;
}
.app-print-document--calendar .calendar-print-fit-wrap .calendar-grid {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
}
.app-print-document--calendar .calendar-grid {
    width: 100%;
    grid-template-columns: repeat(7, minmax(0, 1fr));
}
.app-print-document--calendar .month-calendar,
.app-print-document--calendar .calendar-grid {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
}
.app-print-document--calendar .calendar-day {
    min-height: 6mm !important;
    height: auto;
    overflow: hidden;
    padding: 1px !important;
}
.app-print-document--calendar .calendar-day-header {
    padding: 2px 1px !important;
    font-size: 5.5pt !important;
    letter-spacing: 0.02em;
}
.app-print-document--calendar .day-number {
    font-size: 6pt !important;
    padding: 0 2px !important;
    line-height: 1.1;
}
.app-print-document--calendar .holiday-name {
    font-size: 5.5pt !important;
    padding: 0 2px 1px !important;
    line-height: 1.1;
}
.app-print-document--calendar .calendar-event-chips {
    gap: 0 !important;
    margin-top: 0;
    padding: 0 1px;
}
.app-print-document--calendar .day-events {
    max-height: 16mm;
    overflow: hidden;
    gap: 0 !important;
    padding: 0 1px !important;
    margin-top: 0;
}
.app-print-document--calendar .event-bar {
    font-size: 5.5pt;
    padding: 0 2px;
    line-height: 1.05;
    gap: 0;
    border-radius: 2px;
}
.app-print-document--calendar .event-bar .event-title,
.app-print-document--calendar .event-bar .event-book {
    font-size: inherit;
    line-height: 1.05;
}
.app-print-document--calendar .event-bar .event-book {
    font-size: 5pt;
    font-weight: 500;
    opacity: 0.95;
}
.app-print-document--calendar .calendar-event-chip {
    font-size: 5pt;
    padding: 0 2px;
    line-height: 1.05;
    border-radius: 2px;
}
.app-print-document--calendar .calendar-print-sheet:last-child {
    page-break-after: auto;
    break-after: auto;
}
.app-print-document--calendar .month-calendar {
    width: auto;
    max-width: none;
    box-shadow: none;
    border: 1px solid #000;
    page-break-inside: avoid;
    break-inside: avoid;
}
.app-print-document--calendar .month-header {
    position: static !important;
    top: auto !important;
    z-index: auto !important;
    box-shadow: none !important;
    padding: 3mm 4mm !important;
    background: var(--primary) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}
.app-print-document--calendar .month-header h2 {
    font-size: 11pt !important;
    line-height: 1.15;
}
`;

/** Portrait summary tab: overrides rules meant for calendar+summary in one document. */
const APP_PRINT_SUMMARY_INLINE_CSS = `
@page { size: A4 portrait; margin: 10mm; }
@media print {
    @page { size: A4 portrait; margin: 10mm; }
    @page syllabus-a4 {
        size: A4 portrait;
        margin: 0;
    }
    * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
    .app-print-document--summary .print-summary {
        page-break-before: avoid !important;
        padding: 0 !important;
    }
    .app-print-document--summary .summary-section.summary-syllabus-tables .syllabus-a4-sheet:first-child {
        page-break-before: avoid !important;
        break-before: avoid !important;
    }
    body.print-syllabus-only .app-print-document--summary .print-summary > h2,
    body.print-syllabus-only .app-print-document--summary .summary-section.summary-syllabus-tables > h3 {
        display: none !important;
    }
    body.print-syllabus-only .app-print-document--summary #syllabusTablesSummary .syllabus-a4-sheet:first-child {
        page-break-before: avoid !important;
        break-before: avoid !important;
    }
}
body.app-print-summary-doc { margin: 0; background: #fff; color: #111; }
.app-print-document--summary { max-width: 100%; padding: 0; }
.app-print-document--summary .print-summary { display: block !important; }
.app-print-document--summary #syllabusTablesSummary .syllabus-pdf-export-root {
    display: block;
    margin: 0;
    padding: 0;
}
.app-print-document--summary #syllabusTablesSummary .syllabus-a4-sheet {
    display: block;
    clear: both;
    position: relative;
    width: 210mm;
    height: 297mm;
    max-height: 297mm;
    box-sizing: border-box;
    padding: 15mm;
    margin: 0 auto 16px;
    overflow: hidden;
    background: #fff;
    page-break-after: always;
    break-after: page;
}
.app-print-document--summary #syllabusTablesSummary .syllabus-a4-sheet:last-child {
    margin-bottom: 0;
    page-break-after: auto;
    break-after: auto;
}
.app-print-document--summary #syllabusTablesSummary .syllabus-a4-page {
    width: 100%;
    height: 267mm;
    max-height: 267mm;
    min-height: 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
@media print {
    .app-print-document--summary #syllabusTablesSummary .syllabus-a4-sheet {
        page: auto;
        margin: 0 auto;
        overflow: hidden !important;
    }
}
#syllabusTablesSummary.syllabus-print-measure {
    position: absolute !important;
    left: -99999px !important;
    top: 0 !important;
    width: 210mm !important;
    max-width: 210mm !important;
    visibility: hidden !important;
    pointer-events: none !important;
    z-index: -1 !important;
    overflow: visible !important;
}
`;

/** Landscape print tab: calendar grid only. */
function buildAppPrintCalendarDocumentHtml() {
    if (!elements.calendarContainer) {
        return '';
    }
    const title = escapeHtml(`Calendar — ${getAppPrintCalendarName()}`);
    const bodyClass = collectAppPrintCalendarBodyClasses().join(' ');
    const cssHref = escapeHtml(getAppStylesheetHref());
    const lang = escapeHtml(document.documentElement.lang || 'en');
    const calendarHtml = elements.calendarContainer.innerHTML;
    const bodyClasses = ['app-print-calendar-doc', bodyClass].filter(Boolean).join(' ');
    return `<!DOCTYPE html>
<html lang="${lang}" data-theme="light" class="print-color-mode-light app-print-calendar-root">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<link rel="stylesheet" href="${cssHref}">
<style>
${APP_PRINT_CALENDAR_INLINE_CSS}
</style>
</head>
<body class="${bodyClasses}">
<div class="app-print-document app-print-document--calendar">
<div class="calendar-container">${calendarHtml}</div>
</div>
</body>
</html>`;
}

/** Portrait print tab: summary sections and syllabi only. */
function buildAppPrintSummaryDocumentHtml(opts) {
    if (!elements.printSummary) {
        return '';
    }
    const summary = elements.printSummary;
    const summaryClasses = Array.from(summary.classList)
        .filter(c => c !== 'syllabus-print-measure')
        .join(' ');
    const mod = getSyllabusModule();
    const syllabusExportCss = (opts.printSyllabusTables && mod
        && typeof mod.getSyllabusExportStyles === 'function')
        ? mod.getSyllabusExportStyles(true)
        : '';
    const title = escapeHtml(`Summary — ${getAppPrintCalendarName()}`);
    const bodyClass = collectAppPrintSummaryBodyClasses(opts).join(' ');
    const cssHref = escapeHtml(getAppStylesheetHref());
    const lang = escapeHtml(document.documentElement.lang || 'en');
    return `<!DOCTYPE html>
<html lang="${lang}" data-theme="light" class="print-color-mode-light">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<link rel="stylesheet" href="${cssHref}">
<style>
${syllabusExportCss}
${APP_PRINT_SUMMARY_INLINE_CSS}
</style>
</head>
<body class="app-print-summary-doc ${bodyClass}">
<div class="app-print-document app-print-document--summary">
<div id="printSummary" class="${summaryClasses}">${summary.innerHTML}</div>
</div>
</body>
</html>`;
}

/** Run fn after the print window stylesheet is ready (or after a short fallback). */
function measureMmToPxForPrint(doc) {
    const mod = getSyllabusModule();
    if (mod && typeof mod.measureMmToPx === 'function') {
        return mod.measureMmToPx(doc);
    }
    const probe = doc.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:100mm;height:1mm;';
    doc.body.appendChild(probe);
    const px = probe.offsetWidth / 100;
    doc.body.removeChild(probe);
    return px;
}

function computeCalendarMonthScale(naturalH, naturalW, contentWpx, contentHpx) {
    if (!naturalH || naturalH < 1 || !naturalW || naturalW < 1) {
        return 1;
    }
    const scaleW = contentWpx / naturalW;
    const scaleH = contentHpx / naturalH;
    return Math.min(scaleW, scaleH);
}

/** Grow week rows so the grid uses the full landscape printable height (A4 content box). */
function layoutCalendarMonthForLandscapePrint(month, contentWpx, contentHpx) {
    month.style.width = `${contentWpx}px`;
    month.style.maxWidth = `${contentWpx}px`;
    month.style.boxSizing = 'border-box';

    month.querySelectorAll('.calendar-day').forEach((day) => {
        day.style.minHeight = '';
        day.style.height = '';
        const dayEvents = day.querySelector('.day-events');
        if (dayEvents) {
            dayEvents.style.maxHeight = '';
        }
    });

    const header = month.querySelector('.month-header');
    const grid = month.querySelector('.calendar-grid');
    if (!grid) {
        return;
    }

    grid.style.width = '100%';
    grid.style.boxSizing = 'border-box';

    void month.offsetHeight;
    const headerH = header ? header.offsetHeight : 0;
    const gridBudget = Math.max(1, contentHpx - headerH);

    const cells = Array.from(grid.children);
    const rowCount = Math.max(1, Math.ceil(cells.length / 7));
    let headerRowH = 0;
    cells.slice(0, 7).forEach((el) => {
        if (el.classList.contains('calendar-day-header')) {
            headerRowH = Math.max(headerRowH, el.offsetHeight);
        }
    });
    const bodyRowCount = Math.max(1, rowCount - 1);
    const bodyBudget = Math.max(1, gridBudget - headerRowH);
    const rowMinPx = Math.floor(bodyBudget / bodyRowCount);

    cells.forEach((el) => {
        if (!el.classList.contains('calendar-day')) {
            return;
        }
        el.style.minHeight = `${rowMinPx}px`;
        el.style.boxSizing = 'border-box';

        let topH = 2;
        const num = el.querySelector('.day-number');
        const hol = el.querySelector('.holiday-name');
        const chips = el.querySelector('.calendar-event-chips');
        if (num) {
            topH += num.offsetHeight;
        }
        if (hol) {
            topH += hol.offsetHeight;
        }
        if (chips) {
            topH += chips.offsetHeight;
        }
        const dayEvents = el.querySelector('.day-events');
        if (dayEvents) {
            dayEvents.style.maxHeight = `${Math.max(10, rowMinPx - topH - 2)}px`;
        }
    });

    void month.offsetHeight;
}

/** Wrap each month in a landscape sheet and scale to fit one page (like syllabus A4 fit). */
function fitCalendarMonthsForPrint(doc) {
    const a4 = CALENDAR_PRINT_LANDSCAPE;
    doc.querySelectorAll('.calendar-print-fit-wrap').forEach((wrap) => {
        const month = wrap.querySelector('.month-calendar');
        if (!month) {
            wrap.remove();
            return;
        }
        const sheet = wrap.closest('.calendar-print-sheet');
        wrap.replaceWith(month);
        if (sheet && !sheet.querySelector('.month-calendar')) {
            sheet.remove();
        }
    });
    doc.querySelectorAll('.calendar-print-sheet').forEach((sheet) => {
        const month = sheet.querySelector('.month-calendar');
        if (month) {
            sheet.replaceWith(month);
        } else {
            sheet.remove();
        }
    });

    const months = Array.from(
        doc.querySelectorAll('.app-print-document--calendar .month-calendar')
    );
    if (!months.length) {
        return 0;
    }

    const mmPx = measureMmToPxForPrint(doc);
    const contentWpx = Math.round(a4.contentW * mmPx);
    const contentHpx = Math.round(a4.fitContentH * mmPx);

    months.forEach((month, index) => {
        month.style.transform = '';
        month.style.transformOrigin = '';
        month.style.width = '';
        month.style.height = '';
        month.style.margin = '';

        const sheet = doc.createElement('div');
        sheet.className = 'calendar-print-sheet';
        sheet.style.page = 'calendar-landscape';
        month.parentNode.insertBefore(sheet, month);
        sheet.appendChild(month);

        layoutCalendarMonthForLandscapePrint(month, contentWpx, contentHpx);

        void doc.body.offsetHeight;

        const naturalH = month.scrollHeight;
        const naturalW = month.scrollWidth || month.offsetWidth;
        const scale = computeCalendarMonthScale(naturalH, naturalW, contentWpx, contentHpx);
        const scaledH = Math.ceil(naturalH * scale);

        const wrap = doc.createElement('div');
        wrap.className = 'calendar-print-fit-wrap';
        wrap.style.width = `${contentWpx}px`;
        wrap.style.height = `${contentHpx}px`;
        wrap.style.maxHeight = `${contentHpx}px`;
        wrap.style.overflow = 'hidden';
        wrap.style.boxSizing = 'border-box';

        sheet.insertBefore(wrap, month);
        wrap.appendChild(month);

        if (scale < 0.999) {
            month.style.transformOrigin = 'top center';
            month.style.transform = `scale(${scale})`;
            month.style.width = `${naturalW}px`;
            month.style.maxWidth = `${naturalW}px`;
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'flex-start';
            wrap.style.justifyContent = 'center';
            wrap.style.paddingTop = scaledH < contentHpx
                ? `${Math.floor((contentHpx - scaledH) / 2)}px`
                : '0';
        } else {
            month.style.transform = '';
            month.style.width = '100%';
            month.style.maxWidth = '100%';
            month.style.height = '100%';
            wrap.style.paddingTop = '0';
        }

        if (index < months.length - 1) {
            sheet.style.pageBreakAfter = 'always';
            sheet.style.breakAfter = 'page';
        }
    });

    return months.length;
}

function whenPrintWindowReady(printWin, fn) {
    const link = printWin.document.querySelector('link[rel="stylesheet"]');
    let ran = false;
    const run = () => {
        if (ran) {
            return;
        }
        ran = true;
        fn();
    };
    if (!link) {
        setTimeout(run, 50);
        return;
    }
    if (link.sheet) {
        setTimeout(run, 50);
        return;
    }
    link.addEventListener('load', () => setTimeout(run, 50), { once: true });
    link.addEventListener('error', () => setTimeout(run, 50), { once: true });
    setTimeout(run, 800);
}

function fitSyllabusInPrintWindow(printWin, opts) {
    if (!opts.printSyllabusTables) {
        return;
    }
    const mod = getSyllabusModule();
    if (!mod || typeof mod.fitSyllabusPagesToA4 !== 'function') {
        return;
    }
    if (!printWin.document.querySelector('.syllabus-a4-sheet')) {
        return;
    }
    mod.fitSyllabusPagesToA4(printWin.document, SYLLABUS_PDF_A4);
}

function cleanupAfterAppPrint(opts) {
    document.body.classList.remove(
        'hide-calendar-print',
        'hide-summary-print',
        'print-syllabus-only'
    );
    Object.keys(EVENT_TYPE_DEFAULT_COLORS).concat(['lessons']).forEach(key => {
        document.body.classList.remove(`print-hide-cal-${key}`);
    });
    endPrintColorMode();
}

function isMainPrintPrepActive() {
    return document.documentElement.classList.contains('print-color-mode-light')
        || document.body.classList.contains('hide-calendar-print')
        || document.body.classList.contains('hide-summary-print')
        || document.body.classList.contains('print-syllabus-only');
}

function restoreMainUiAfterPrintCapture() {
    cleanupAfterAppPrint(null);
}

function setupAppPrintOpenerSafeties() {
    if (window.__appPrintOpenerSafetiesBound) {
        return;
    }
    window.__appPrintOpenerSafetiesBound = true;
    window.addEventListener('focus', () => {
        if (isMainPrintPrepActive()) {
            restoreMainUiAfterPrintCapture();
        }
    });
}

/**
 * Run one or more print jobs (calendar landscape tab, then summary portrait tab).
 * Opens all windows synchronously on the Print click to avoid popup blockers.
 */
function runAppPrintJobs(jobs, opts) {
    if (!jobs.length) {
        cleanupAfterAppPrint(opts);
        return;
    }

    const prepared = jobs.map(job => {
        const printWin = window.open('', '_blank');
        if (!printWin) {
            return { ok: false };
        }
        printWin.document.open();
        printWin.document.write(job.html);
        printWin.document.close();
        printWin.document.title = job.title;
        printWin.document.documentElement.classList.add('print-color-mode-light');
        return { ok: true, printWin, job };
    });

    if (prepared.some(entry => !entry.ok)) {
        alert(t('printSyllabusBlocked'));
        prepared.forEach(entry => {
            if (entry.ok) {
                try {
                    entry.printWin.close();
                } catch (e) { /* ignore */ }
            }
        });
        cleanupAfterAppPrint(opts);
        return;
    }

    let jobIndex = 0;

    function printOneJob() {
        if (jobIndex >= prepared.length) {
            cleanupAfterAppPrint(opts);
            return;
        }
        const { printWin, job } = prepared[jobIndex];
        jobIndex += 1;
        printWin.focus();

        whenPrintWindowReady(printWin, () => {
            if (job.kind === 'summary') {
                fitSyllabusInPrintWindow(printWin, opts);
            } else if (job.kind === 'calendar') {
                fitCalendarMonthsForPrint(printWin.document);
                const orient = printWin.document.createElement('style');
                orient.setAttribute('data-calendar-print-orient', '1');
                orient.textContent = '@page { size: A4 landscape; margin: 0; }';
                printWin.document.head.appendChild(orient);
            }
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    let finished = false;
                    let closedPoll = null;
                    const finish = () => {
                        if (finished) {
                            return;
                        }
                        finished = true;
                        if (closedPoll !== null) {
                            clearInterval(closedPoll);
                            closedPoll = null;
                        }
                        try {
                            printWin.close();
                        } catch (e) { /* user may have closed the tab */ }
                        printOneJob();
                    };
                    printWin.addEventListener('afterprint', finish, { once: true });
                    printWin.addEventListener('pagehide', finish, { once: true });
                    closedPoll = setInterval(() => {
                        if (finished) {
                            return;
                        }
                        let closed = false;
                        try {
                            closed = printWin.closed;
                        } catch (e) {
                            closed = true;
                        }
                        if (closed) {
                            finish();
                        }
                    }, 250);
                    try {
                        printWin.print();
                    } catch (e) {
                        /* user can print manually from the new tab */
                    }
                    setTimeout(finish, 120000);
                });
            });
        });
    }

    printOneJob();
}

function getPrintOptionsFromForm() {
    const printClassList = document.getElementById('printClassList')?.checked !== false;
    const printLessonSchedule = document.getElementById('printLessonSchedule')?.checked !== false;
    const printCompressionNotes = document.getElementById('printCompressionNotes')?.checked !== false;
    const printSyllabusTables = document.getElementById('printSyllabusTables')?.checked !== false;
    const printEventsList = document.getElementById('printEventsList')?.checked !== false;
    const wantAnySummarySection = printClassList || printEventsList
        || printLessonSchedule || printCompressionNotes || printSyllabusTables;
    const syllabusOnly = wantAnySummarySection && printSyllabusTables && !printClassList
        && !printEventsList && !printLessonSchedule && !printCompressionNotes;
    return {
        printClassList,
        printLessonSchedule,
        printCompressionNotes,
        printSyllabusTables,
        printEventsList,
        wantAnySummarySection,
        syllabusOnly
    };
}

/** @param {'all'|'calendar'|'summary'} mode */
function setPrintFormSectionMode(mode) {
    const form = document.getElementById('printForm');
    if (!form) {
        return;
    }
    const resolved = mode === 'calendar' || mode === 'summary' ? mode : 'all';
    form.dataset.printFormMode = resolved;
    const calSection = form.querySelector('.print-form-section--calendar');
    const sumSection = form.querySelector('.print-form-section--summary');
    if (calSection) {
        calSection.hidden = resolved === 'summary';
    }
    if (sumSection) {
        sumSection.hidden = resolved === 'calendar';
    }
    const titleEl = document.getElementById('printOptionsModalTitle');
    if (titleEl) {
        titleEl.textContent = resolved === 'calendar'
            ? t('printSectionCalendar')
            : resolved === 'summary'
                ? t('printSectionSummary')
                : t('printOptions');
    }
}

function openPrintOptionsDialog() {
    syncPrintVisibilityFromUi();
    updatePrintLessonFilterHint();
    mountPrintForm();
    setPrintFormSectionMode('all');
    if (elements.printOptionsModal) {
        openModal(elements.printOptionsModal);
    }
}

function closePrintOptionsModal() {
    if (elements.printOptionsModal) {
        closeModal(elements.printOptionsModal);
    }
}

function handlePrint(e) {
    e.preventDefault();
    const includeCalendar = document.getElementById('printIncludeCalendar')?.checked !== false;
    const includeSummary = document.getElementById('printIncludeSummary')?.checked !== false;
    if (!includeCalendar && !includeSummary) {
        alert(t('printNothingSelected'));
        return;
    }
    const modalWasOpen = elements.printOptionsModal
        && elements.printOptionsModal.classList.contains('active');
    if (modalWasOpen) {
        closePrintOptionsModal();
    }
    if (includeSummary) {
        syncPrintVisibilityFromUi();
        updatePrintLessonFilterHint();
    }
    if (includeCalendar) {
        runAppPrint('calendar');
    }
    if (includeSummary) {
        runAppPrint('summary');
    }
}

/**
 * Print calendar or summary in separate preview tabs (never both in one run).
 * @param {'calendar'|'summary'} printMode
 */
function runAppPrint(printMode) {
    beginPrintColorMode();
    refreshLocalizedEventDisplayNames();
    const formOpts = getPrintOptionsFromForm();
    const printCalendar = printMode === 'calendar';
    const showSummary = printMode === 'summary' && formOpts.wantAnySummarySection;

    if (printCalendar && !appData.termStart) {
        alert(t('printCalendarNeedsTerm'));
        endPrintColorMode();
        return;
    }
    if (printCalendar && !confirmCalendarPrintDespiteDensityWarnings()) {
        endPrintColorMode();
        return;
    }
    if (printMode === 'summary' && !formOpts.wantAnySummarySection) {
        alert(t('printNothingSelectedSummary'));
        endPrintColorMode();
        return;
    }

    const opts = {
        ...formOpts,
        printCalendar,
        showSummary,
        syllabusOnly: showSummary && formOpts.syllabusOnly
    };

    ensureUiState();
    appData.ui.printVisibility = readPrintCalendarVisibilityFromForm();
    saveData();

    calendarRenderForPrint = printCalendar;
    try {
        if (printCalendar && appData.termStart) {
            renderCalendar();
        } else {
            updatePrintSummary();
        }
        if (showSummary && opts.printSyllabusTables) {
            renderAllSyllabusTables();
        }
    } finally {
        calendarRenderForPrint = false;
    }

    document.body.classList.toggle('hide-calendar-print', !printCalendar);
    document.body.classList.toggle('hide-summary-print', !showSummary);
    document.body.classList.toggle('print-syllabus-only', opts.syllabusOnly && !printCalendar);

    const summary = elements.printSummary;
    summary.classList.toggle('hide-classes', !opts.printClassList);
    summary.classList.toggle('hide-events', !opts.printEventsList);
    summary.classList.toggle('hide-schedule', !opts.printLessonSchedule);
    summary.classList.toggle('hide-compression', !opts.printCompressionNotes);
    summary.classList.toggle('hide-syllabus-tables', !opts.printSyllabusTables);

    applyPrintCalendarVisibilityClasses();

    if (opts.printSyllabusTables && elements.syllabusTablesSummary
        && !elements.syllabusTablesSummary.querySelector('.syllabus-a4-sheet')) {
        alert(t('syllabusTableEmptyHint'));
        restoreMainUiAfterPrintCapture();
        return;
    }

    const runPrint = () => {
        try {
            const jobs = [];
            const calName = getAppPrintCalendarName();
            if (opts.printCalendar) {
                const html = buildAppPrintCalendarDocumentHtml();
                if (html) {
                    jobs.push({
                        kind: 'calendar',
                        html,
                        title: `Calendar — ${calName}`
                    });
                }
            }
            if (opts.showSummary) {
                const html = buildAppPrintSummaryDocumentHtml(opts);
                if (html) {
                    jobs.push({
                        kind: 'summary',
                        html,
                        title: `Summary — ${calName}`
                    });
                }
            }
            runAppPrintJobs(jobs, opts);
        } finally {
            restoreMainUiAfterPrintCapture();
        }
    };

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            setTimeout(runPrint, 50);
        });
    });
}

function ensureClassSummaryPeriodColumn() {
    const row = elements.classSummaryTable?.querySelector('thead tr');
    if (!row || row.querySelector('th[data-period-col]')) {
        return;
    }
    const th = document.createElement('th');
    th.dataset.periodCol = '1';
    th.setAttribute('data-i18n', 'classPeriod');
    th.textContent = t('classPeriod');
    const nameTh = row.querySelector('th[data-i18n="className"]') || row.cells[0];
    if (nameTh) {
        nameTh.insertAdjacentElement('afterend', th);
    } else {
        row.insertBefore(th, row.firstChild);
    }
}

function updatePrintSummary() {
    // Update Class Summary Table
    ensureClassSummaryPeriodColumn();
    const classTableBody = elements.classSummaryTable.querySelector('tbody');
    classTableBody.innerHTML = '';
    
    getClassesForCalendarAndPrintSummary().forEach(classData => {
        const row = document.createElement('tr');
        const dayText = formatMeetingDaysSummary(classData);
        const booksSummary = formatBooksByMonthSummary(classData);
        const periodText = formatClassPeriodSummary(classData) || null;
        row.innerHTML = `
            <td>${escapeHtml(classData.name)}</td>
            <td>${escapeHtml(periodText ? periodText : '—')}</td>
            <td>${escapeHtml(getClassLevelDisplay(classData))}</td>
            <td>${escapeHtml(classData.grade || '—')}</td>
            <td>${escapeHtml(classData.book || '')}</td>
            <td>${escapeHtml(booksSummary)}</td>
            <td>${escapeHtml(formatDateDisplay(classData.startDate))}</td>
            <td>${escapeHtml(formatDateDisplay(classData.endDate))}</td>
            <td>${escapeHtml(dayText)}</td>
        `;
        classTableBody.appendChild(row);
    });
    
    if (elements.eventSummaryTable) {
        const eventTableBody = elements.eventSummaryTable.querySelector('tbody');
        eventTableBody.innerHTML = '';
        const sortedEvents = [...getCalendarEvents()].sort((a, b) => {
            const dateA = parseISODateLocal(a.isRange ? a.startDate : a.date);
            const dateB = parseISODateLocal(b.isRange ? b.startDate : b.date);
            return dateA - dateB;
        });
        sortedEvents.forEach(ev => {
            let appliesToText = t('allClassesLabel');
            if (eventHasAnyTargetFilter(ev)) {
                appliesToText = getEventAppliesToDescriptionParts(ev).join('; ');
            }
            let dateText;
            if (ev.isRange) {
                dateText = `${formatDateDisplay(ev.startDate)} - ${formatDateDisplay(ev.endDate)}`;
            } else {
                dateText = formatDateDisplay(ev.date);
            }
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(getEventTypeLabel(ev.type))}</td>
                <td>${escapeHtml(getEventDisplayName(ev))}</td>
                <td>${escapeHtml(dateText)}</td>
                <td>${escapeHtml(appliesToText)}</td>
            `;
            eventTableBody.appendChild(row);
        });
    }

    // Update Lesson Schedule Summary
    elements.lessonScheduleSummary.innerHTML = '';
    
    getClassesForCalendarAndPrintSummary().forEach(classData => {
        const { lessons } = calculateLessonDates(classData);
        
        const itemDiv = document.createElement('d' + 'iv');
        itemDiv.className = 'lesson-schedule-item';
        itemDiv.style.borderLeftColor = classData.color;
        itemDiv.style.color = classData.textColor || DEFAULT_CLASS_TEXT_COLOR;
        
        let lessonsHtml = lessons.map(l => {
            const mk = l.monthKey || formatDateISO(l.date).slice(0, 7);
            const bk = l.book != null && l.book !== '' ? l.book : getBookForMonthKey(classData, mk);
            return `<li>${escapeHtml(l.label)}: ${escapeHtml(formatDateDisplay(formatDateISO(l.date)))} — ${escapeHtml(bk)}</li>`;
        }).join('');
        
        itemDiv.innerHTML = `
            <h4>${escapeHtml(formatClassLabelWithPeriod(classData))} (${escapeHtml(getClassLevelDisplay(classData))})</h4>
            <ul>${lessonsHtml}</ul>
        `;
        
        elements.lessonScheduleSummary.appendChild(itemDiv);
    });
    
    // Update Compression Notes
    elements.compressionNotes.innerHTML = '';
    
    getClassesForCalendarAndPrintSummary().forEach(classData => {
        const schedule = calculateLessonDates(classData);
        const {
            groups,
            scheduledCount,
            totalGroups,
            availableCount,
            isCustom,
            monthlyDetails
        } = schedule;

        if (schedule.scheduleModel === SCHEDULE_MODEL_SEQUENTIAL_TERM) {
            if (scheduledCount < totalGroups) {
                const li = document.createElement('li');
                li.textContent = t('termLessonsIncompleteHint')
                    .replace('{name}', formatClassLabelWithPeriod(classData))
                    .replace('{scheduled}', scheduledCount)
                    .replace('{total}', totalGroups);
                elements.compressionNotes.appendChild(li);
            }
            return;
        }

        if (!isCustom && monthlyDetails && monthlyDetails.length > 0 && classUsesDebateCompression(classData)) {
            const monthLines = [];
            monthlyDetails.forEach(d => {
                if (d.autoAdjusted) {
                    monthLines.push(
                        t('monthAutoMergeHint')
                            .replace('{month}', d.monthKey)
                            .replace('{merges}', d.mergesUsed.join(', '))
                    );
                }
                if (d.scheduledInMonth < d.totalGroups) {
                    monthLines.push(
                        t('monthIncompleteHint')
                            .replace('{month}', d.monthKey)
                            .replace('{scheduled}', d.scheduledInMonth)
                            .replace('{total}', d.totalGroups)
                    );
                }
            });
            if (monthLines.length > 0) {
                const li = document.createElement('li');
                li.textContent = `${formatClassLabelWithPeriod(classData)}: ${monthLines.join(' | ')}`;
                elements.compressionNotes.appendChild(li);
            }
            return;
        }

        const mergedGroups = groups.filter(group => group.compressed).map(group => group.label);
        const hasMerges = mergedGroups.length > 0;
        const isIncomplete = scheduledCount < totalGroups;

        if (hasMerges || isIncomplete) {
            const li = document.createElement('li');
            const parts = [];

            if (hasMerges) {
                parts.push(
                    t('mergedGroupsLabel').replace('{groups}', mergedGroups.join(', '))
                );
            }

            if (isIncomplete) {
                parts.push(
                    t('scheduledGroupsLabel')
                        .replace('{scheduled}', scheduledCount)
                        .replace('{total}', totalGroups)
                );
            }

            const suffix = isCustom
                ? t('compressionNoteCustomSuffix')
                : t('compressionNoteAutoSuffix').replace('{available}', availableCount);

            li.textContent = `${formatClassLabelWithPeriod(classData)}: ${parts.join(' | ')} ${suffix}`;
            elements.compressionNotes.appendChild(li);
        }
    });
    
    // Show message if no compressions
    if (elements.compressionNotes.children.length === 0) {
        const li = document.createElement('li');
        li.textContent = t('noCompressedDays');
        li.className = 'compression-note-empty';
        elements.compressionNotes.appendChild(li);
    }

    renderAllSyllabusTables();
}

// ============================================
// Data Persistence
// ============================================
let teamSyncEnabled = false;
let teamLockPreviousCalendarId = null;
let lastLockNotifySignature = '';

function formatLockParty(party) {
    if (!party) {
        return t('teamLockUnknownUser');
    }
    const display = party.displayName || party.holderName || party.name;
    if (display && String(display).trim()) {
        return String(display).trim();
    }
    const email = party.email || party.holderEmail;
    if (email && String(email).trim()) {
        return String(email).trim();
    }
    const id = party.userId || party.holderUserId;
    if (id) {
        return String(id);
    }
    return t('teamLockUnknownUser');
}

function showLockFlash(message, isError) {
    setAppStatusMessage(message, isError, 7000);
}

function setTeamLockBarVisible(visible) {
    const el = document.getElementById('teamLockStatus');
    if (el) {
        el.hidden = !visible;
    }
}

function getTeamLockUiMode() {
    const statusBar = document.getElementById('teamLockStatus');
    if (!statusBar) {
        return 'unknown';
    }
    const modes = ['free', 'held', 'blocked', 'pending', 'waiting'];
    for (let i = 0; i < modes.length; i++) {
        if (statusBar.classList.contains('team-lock-status--' + modes[i])) {
            return modes[i];
        }
    }
    return 'none';
}

function isTeamLockDebugEnabled() {
    return typeof CalendarSync !== 'undefined' && CalendarSync.isLockDebugEnabled && CalendarSync.isLockDebugEnabled();
}

function refreshTeamLockDebugPanel(extra) {
    if (!isTeamLockDebugEnabled()) {
        return;
    }
    const panel = document.getElementById('teamLockDebugPanel');
    const stateEl = document.getElementById('teamLockDebugState');
    const logEl = document.getElementById('teamLockDebugLog');
    const hintEl = document.getElementById('teamLockDebugHint');
    const toggleBtn = document.getElementById('teamLockDebugToggle');
    if (!panel || !stateEl || !logEl) {
        return;
    }
    panel.hidden = false;
    if (toggleBtn) {
        toggleBtn.hidden = false;
        toggleBtn.setAttribute('aria-pressed', 'true');
    }
    if (hintEl) {
        hintEl.textContent = 'Add ?lockDebug=1 to URL or CalendarSync.setLockDebugEnabled(true)';
    }
    const snap = CalendarSync.getLockDebugSnapshot(
        Object.assign(
            {
                teamSyncEnabled,
                uiMode: getTeamLockUiMode(),
                teamLockPreviousCalendarId,
                pollIntervalMs: 3000
            },
            extra || {}
        )
    );
    stateEl.textContent = JSON.stringify(snap, null, 2);
    const lines = CalendarSync.getLockDebugLog();
    logEl.textContent = lines
        .slice(-40)
        .map((e) => {
            const t = e.at ? e.at.slice(11, 23) : '';
            const d = e.detail != null ? ' ' + JSON.stringify(e.detail) : '';
            return t + ' [' + e.kind + '] ' + e.message + d;
        })
        .join('\n');
    logEl.scrollTop = logEl.scrollHeight;
}

function setupTeamLockDebugPanel() {
    const toggleBtn = document.getElementById('teamLockDebugToggle');
    const panel = document.getElementById('teamLockDebugPanel');
    if (!toggleBtn || !panel || toggleBtn.dataset.bound === '1') {
        return;
    }
    toggleBtn.dataset.bound = '1';

    const showDebugUi = isTeamLockDebugEnabled();
    toggleBtn.hidden = !showDebugUi;
    if (!showDebugUi) {
        panel.hidden = true;
        return;
    }

    toggleBtn.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        toggleBtn.setAttribute('aria-pressed', panel.hidden ? 'false' : 'true');
        if (!panel.hidden) {
            refreshTeamLockDebugPanel({ action: 'panel-opened' });
        }
    });

    document.getElementById('teamLockDebugCloseBtn')?.addEventListener('click', () => {
        panel.hidden = true;
        toggleBtn.setAttribute('aria-pressed', 'false');
    });

    document.getElementById('teamLockDebugClearBtn')?.addEventListener('click', () => {
        if (typeof CalendarSync !== 'undefined') {
            CalendarSync.clearLockDebugLog();
            refreshTeamLockDebugPanel({ action: 'log-cleared' });
        }
    });

    document.getElementById('teamLockDebugCopyBtn')?.addEventListener('click', async () => {
        if (typeof CalendarSync === 'undefined') {
            return;
        }
        const payload = {
            snapshot: CalendarSync.getLockDebugSnapshot({
                teamSyncEnabled,
                uiMode: getTeamLockUiMode(),
                teamLockPreviousCalendarId
            }),
            log: CalendarSync.getLockDebugLog()
        };
        const text = JSON.stringify(payload, null, 2);
        try {
            await navigator.clipboard.writeText(text);
            showLockFlash('Lock debug copied to clipboard.', false);
        } catch (_) {
            window.prompt('Copy lock debug:', text);
        }
    });

    document.getElementById('teamLockDebugRefreshBtn')?.addEventListener('click', async () => {
        if (!teamSyncEnabled || typeof CalendarSync === 'undefined') {
            return;
        }
        const id = CalendarSync.getActiveCalendarId();
        if (!id) {
            return;
        }
        try {
            await CalendarSync.refreshLockMeta(id);
            applyTeamLockAccessState({
                readOnly: CalendarSync.state.readOnly,
                lock: CalendarSync.state.lock,
                holdsLock: CalendarSync.state.holdsLock,
                pendingEditRequest: CalendarSync.state.pendingEditRequest
            });
            refreshTeamLockDebugPanel({ action: 'manual-poll' });
        } catch (err) {
            refreshTeamLockDebugPanel({ action: 'manual-poll-failed', error: err.message });
        }
    });

    refreshTeamLockDebugPanel({ action: 'panel-init' });
}

function notifyLockStateChange(lockState) {
    const uiMode = getTeamLockUiMode();
    const sig =
        uiMode +
        '|' +
        Boolean(lockState && lockState.readOnly) +
        '|' +
        Boolean(lockState && lockState.holdsLock) +
        '|' +
        Boolean(lockState && lockState.pendingEditRequest);
    if (sig !== lastLockNotifySignature) {
        lastLockNotifySignature = sig;
        if (
            typeof CalendarSync !== 'undefined' &&
            CalendarSync.logLockDebug &&
            CalendarSync.isLockDebugEnabled()
        ) {
            CalendarSync.logLockDebug('ui', 'Lock bar mode → ' + uiMode, {
                readOnly: lockState && lockState.readOnly,
                holdsLock: lockState && lockState.holdsLock,
                pendingEditRequest: lockState && lockState.pendingEditRequest
            });
        }
    }
    refreshTeamLockDebugPanel({ uiMode });
}

function applyTeamLockAccessState(lockState) {
    const readOnly = Boolean(lockState && lockState.readOnly);
    const lock = lockState && lockState.lock;
    const holdsLock = Boolean(lockState && lockState.holdsLock);
    const pendingEditRequest = Boolean(
        lockState && lockState.pendingEditRequest != null
            ? lockState.pendingEditRequest
            : typeof CalendarSync !== 'undefined' && CalendarSync.state.pendingEditRequest
    );
    const main = document.getElementById('appMain');
    const statusBar = document.getElementById('teamLockStatus');
    const labelEl = document.getElementById('teamLockStatusLabel');
    const btn = document.getElementById('teamLockStatusBtn');
    const pendingActions = document.getElementById('teamLockPendingActions');
    const allowBtn = document.getElementById('teamLockAllowBtn');
    const dismissBtn = document.getElementById('teamLockDismissBtn');
    const iconOpen = statusBar && statusBar.querySelector('.team-lock-icon--open');
    const iconClosed = statusBar && statusBar.querySelector('.team-lock-icon--closed');

    if (main) {
        main.classList.toggle('app-main--team-readonly', readOnly);
        main.removeAttribute('inert');
    }

    const calId =
        typeof CalendarSync !== 'undefined' && CalendarSync.getActiveCalendarId
            ? CalendarSync.getActiveCalendarId()
            : null;
    setTeamLockBarVisible(teamSyncEnabled && Boolean(calId));

    if (!statusBar || !labelEl || !btn) {
        notifyLockStateChange(lockState);
        return;
    }

    statusBar.classList.remove(
        'team-lock-status--free',
        'team-lock-status--held',
        'team-lock-status--blocked',
        'team-lock-status--pending',
        'team-lock-status--waiting'
    );

    const pending = holdsLock && lock && lock.pendingRequester;
    let mode = 'free';
    let labelText = t('teamLockStatusFree');
    let actionLabel = t('teamLockActionAcquire');
    let lockBtnDisabled = false;

    if (pendingEditRequest && readOnly && lock) {
        mode = 'waiting';
        labelText = t('teamLockStatusWaiting').replace('{name}', formatLockParty(lock));
        actionLabel = t('teamLockActionWaiting');
        lockBtnDisabled = true;
    } else if (readOnly && lock) {
        mode = 'blocked';
        labelText = t('teamLockStatusBlocked').replace('{name}', formatLockParty(lock));
        actionLabel = t('teamLockActionRequest');
    } else if (holdsLock) {
        if (pending) {
            mode = 'pending';
            labelText = t('teamLockStatusPending').replace('{name}', formatLockParty(pending));
        } else {
            mode = 'held';
            labelText = t('teamLockStatusHeld');
        }
        actionLabel = t('teamLockActionRelease');
    }

    statusBar.classList.add('team-lock-status--' + mode);
    labelEl.textContent = labelText;
    btn.title = actionLabel;
    btn.setAttribute('aria-label', labelText + '. ' + actionLabel);
    btn.disabled = lockBtnDisabled;

    if (allowBtn) {
        allowBtn.textContent = t('teamLockAllow');
    }
    if (dismissBtn) {
        dismissBtn.textContent = t('teamLockDismiss');
    }
    if (pendingActions) {
        pendingActions.hidden = mode !== 'pending';
    }

    if (iconOpen && iconClosed) {
        const showOpen = mode === 'free';
        iconOpen.hidden = !showOpen;
        iconClosed.hidden = showOpen;
    }

    notifyLockStateChange(lockState);
}

async function maybeAutoReloadTeamCalendar(meta, lockState) {
    if (!teamSyncEnabled || typeof CalendarSync === 'undefined') {
        return;
    }
    if (CalendarSync.state.holdsLock || CalendarSync.state.saving) {
        return;
    }
    const serverRev = meta && meta.revision;
    if (!serverRev || serverRev <= CalendarSync.state.revision) {
        return;
    }
    const wasReadOnly = lockState && lockState.wasReadOnly;
    const unlocked = wasReadOnly && !CalendarSync.state.readOnly;
    const lockCleared = !(meta && meta.lock);
    const hadRemoteNewer = CalendarSync.state.remoteNewer;
    if (unlocked || lockCleared || hadRemoteNewer) {
        refreshTeamLockDebugPanel({
            autoReload: true,
            unlocked,
            lockCleared,
            hadRemoteNewer,
            serverRev,
            clientRev: CalendarSync.state.revision
        });
        try {
            await reloadActiveCalendarFromServer();
        } catch (err) {
            console.error('Auto-reload failed:', err);
            refreshTeamLockDebugPanel({ autoReloadFailed: err.message });
        }
    }
}

function setupTeamLockButtons() {
    const btn = document.getElementById('teamLockStatusBtn');
    if (!btn || btn.dataset.teamLockBound === '1') {
        return;
    }
    btn.dataset.teamLockBound = '1';

    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!teamSyncEnabled || typeof CalendarSync === 'undefined') {
            return;
        }

        const id = CalendarSync.getActiveCalendarId();
        if (!id) {
            showLockFlash(t('teamCalendarEmpty'), true);
            return;
        }

        const statusBar = document.getElementById('teamLockStatus');
        const mode = statusBar
            ? statusBar.classList.contains('team-lock-status--waiting')
                ? 'waiting'
                : statusBar.classList.contains('team-lock-status--held') ||
                    statusBar.classList.contains('team-lock-status--pending')
                  ? 'held'
                  : statusBar.classList.contains('team-lock-status--blocked')
                    ? 'blocked'
                    : 'free'
            : 'free';

        if (mode === 'waiting') {
            return;
        }

        btn.disabled = true;

        try {
            if (mode === 'held') {
                await CalendarSync.flushPendingSave().catch(() => {});
                await CalendarSync.releaseLock(id);
                teamLockPreviousCalendarId = null;
                showLockFlash(t('teamLockReleasedFlash'), false);
            } else if (mode === 'blocked') {
                const holder = CalendarSync.state.lock;
                const result = await CalendarSync.acquireLock(id);
                applyTeamLockAccessState({
                    readOnly: CalendarSync.state.readOnly,
                    lock: CalendarSync.state.lock,
                    holdsLock: CalendarSync.state.holdsLock,
                    pendingEditRequest: CalendarSync.state.pendingEditRequest
                });
                if (result && result.editRequestRecorded) {
                    showLockFlash(
                        t('teamLockRequestSentFlash').replace('{name}', formatLockParty(holder)),
                        false
                    );
                } else if (CalendarSync.state.holdsLock) {
                    showLockFlash(t('teamLockHeldFlash'), false);
                }
                return;
            } else {
                await CalendarSync.acquireLock(id);
                if (CalendarSync.state.holdsLock) {
                    showLockFlash(t('teamLockHeldFlash'), false);
                }
            }
            applyTeamLockAccessState({
                readOnly: CalendarSync.state.readOnly,
                lock: CalendarSync.state.lock,
                holdsLock: CalendarSync.state.holdsLock,
                pendingEditRequest: CalendarSync.state.pendingEditRequest
            });
        } catch (err) {
            try {
                await CalendarSync.refreshLockMeta(id);
                applyTeamLockAccessState({
                    readOnly: CalendarSync.state.readOnly,
                    lock: CalendarSync.state.lock,
                    holdsLock: CalendarSync.state.holdsLock,
                    pendingEditRequest: CalendarSync.state.pendingEditRequest
                });
            } catch (_) {
                /* ignore */
            }
            const msg =
                mode === 'held'
                    ? t('teamLockReleaseFailed')
                    : mode === 'blocked'
                      ? err && err.message
                          ? err.message
                          : t('teamLockRequestFailed')
                      : t('teamLockRequestFailed');
            showLockFlash(msg, true);
        } finally {
            const statusBarAfter = document.getElementById('teamLockStatus');
            const stillWaiting =
                statusBarAfter && statusBarAfter.classList.contains('team-lock-status--waiting');
            btn.disabled = stillWaiting;
        }
    });
}

function setupTeamLockPendingButtons() {
    const allowBtn = document.getElementById('teamLockAllowBtn');
    const dismissBtn = document.getElementById('teamLockDismissBtn');
    if (!allowBtn || !dismissBtn) {
        return;
    }
    if (allowBtn.dataset.teamLockBound !== '1') {
        allowBtn.dataset.teamLockBound = '1';
        allowBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!teamSyncEnabled || typeof CalendarSync === 'undefined') {
                return;
            }
            const id = CalendarSync.getActiveCalendarId();
            if (!id) {
                return;
            }
            const pending = CalendarSync.state.lock && CalendarSync.state.lock.pendingRequester;
            allowBtn.disabled = true;
            dismissBtn.disabled = true;
            try {
                await CalendarSync.grantLockToPending(id);
                applyTeamLockAccessState({
                    readOnly: CalendarSync.state.readOnly,
                    lock: CalendarSync.state.lock,
                    holdsLock: CalendarSync.state.holdsLock,
                    pendingEditRequest: CalendarSync.state.pendingEditRequest
                });
                showLockFlash(
                    t('teamLockAllowedOtherFlash').replace('{name}', formatLockParty(pending)),
                    false
                );
            } catch (err) {
                showLockFlash(err.message || t('teamLockGrantFailed'), true);
            } finally {
                allowBtn.disabled = false;
                dismissBtn.disabled = false;
            }
        });
    }
    if (dismissBtn.dataset.teamLockBound !== '1') {
        dismissBtn.dataset.teamLockBound = '1';
        dismissBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!teamSyncEnabled || typeof CalendarSync === 'undefined') {
                return;
            }
            const id = CalendarSync.getActiveCalendarId();
            if (!id) {
                return;
            }
            allowBtn.disabled = true;
            dismissBtn.disabled = true;
            try {
                await CalendarSync.dismissLockRequest(id);
                applyTeamLockAccessState({
                    readOnly: CalendarSync.state.readOnly,
                    lock: CalendarSync.state.lock,
                    holdsLock: CalendarSync.state.holdsLock,
                    pendingEditRequest: CalendarSync.state.pendingEditRequest
                });
                showLockFlash(t('teamLockDismissedFlash'), false);
            } catch (err) {
                showLockFlash(err.message || t('teamLockDismissFailed'), true);
            } finally {
                allowBtn.disabled = false;
                dismissBtn.disabled = false;
            }
        });
    }
}

function setupEditDisplayNameModal() {
    if (document.body.dataset.editDisplayNameModalBound === '1') {
        return;
    }
    const modal = document.getElementById('editDisplayNameModal');
    const form = document.getElementById('editDisplayNameForm');
    if (!modal || !form) {
        return;
    }

    function closeEditDisplayNameModal() {
        closeModal(modal);
        form.reset();
    }

    document.getElementById('closeEditDisplayNameModal')?.addEventListener('click', closeEditDisplayNameModal);
    document.getElementById('cancelEditDisplayNameBtn')?.addEventListener('click', closeEditDisplayNameModal);
    bindModalBackdropClose(modal);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = (document.getElementById('editDisplayNameInput')?.value || '').trim();
        if (!name) {
            showSyncToast(t('displayNameRequired'), true);
            return;
        }
        if (name.length > 120) {
            showSyncToast(t('displayNameTooLong'), true);
            return;
        }
        const submitBtn = document.getElementById('submitEditDisplayNameBtn');
        const prevText = submitBtn ? submitBtn.textContent : '';
        try {
            if (submitBtn) {
                submitBtn.disabled = true;
            }
            const res = await fetch('/api/auth/profile', {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: name })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                showSyncToast(json.error || t('displayNameSaveFailed'), true);
                return;
            }
            closeEditDisplayNameModal();
            showSyncToast(t('displayNameSaved'), false);
            if (typeof TeamAuth !== 'undefined' && TeamAuth.refresh) {
                await TeamAuth.refresh();
            }
            setupTeamUserBar();
        } catch (err) {
            showSyncToast(t('displayNameSaveFailed'), true);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = prevText || t('saveDisplayName');
            }
        }
    });

    document.body.dataset.editDisplayNameModalBound = '1';
}

function openEditDisplayNameModal(prefill) {
    const modal = document.getElementById('editDisplayNameModal');
    const input = document.getElementById('editDisplayNameInput');
    if (!modal || !input) {
        return;
    }
    const user = typeof TeamAuth !== 'undefined' ? TeamAuth.getUser() : null;
    input.value = prefill != null ? String(prefill) : user ? user.displayName || user.email || '' : '';
    openModal(modal);
    input.focus();
    input.select();
}

function setupChangePasswordModal() {
    if (document.body.dataset.changePasswordModalBound === '1') {
        return;
    }
    const modal = document.getElementById('changePasswordModal');
    const form = document.getElementById('changePasswordForm');
    if (!modal || !form) {
        return;
    }

    function closeChangePasswordModal() {
        closeModal(modal);
        form.reset();
    }

    document.getElementById('closeChangePasswordModal')?.addEventListener('click', closeChangePasswordModal);
    document.getElementById('cancelChangePasswordBtn')?.addEventListener('click', closeChangePasswordModal);
    bindModalBackdropClose(modal);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const current = document.getElementById('changePasswordCurrent')?.value || '';
        const newPwd = document.getElementById('changePasswordNew')?.value || '';
        const confirmPwd = document.getElementById('changePasswordConfirm')?.value || '';
        if (newPwd.length < 8) {
            showSyncToast(t('passwordTooShort'), true);
            return;
        }
        if (newPwd !== confirmPwd) {
            showSyncToast(t('passwordMismatch'), true);
            return;
        }
        const submitBtn = document.getElementById('submitChangePasswordBtn');
        const prevText = submitBtn ? submitBtn.textContent : '';
        try {
            if (submitBtn) {
                submitBtn.disabled = true;
            }
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword: current, newPassword: newPwd })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg =
                    json.error ||
                    (res.status === 400 ? t('noPasswordSet') : t('passwordChangeFailed'));
                showSyncToast(msg, true);
                return;
            }
            closeChangePasswordModal();
            showSyncToast(t('passwordChanged'), false);
            if (typeof TeamAuth !== 'undefined' && TeamAuth.refresh) {
                await TeamAuth.refresh();
            }
        } catch (err) {
            showSyncToast(t('passwordChangeFailed'), true);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = prevText || t('changePassword');
            }
        }
    });

    document.body.dataset.changePasswordModalBound = '1';
}

function setupTeamUserBar() {
    const accountGroup = document.getElementById('teamAccountGroup');
    const label = document.getElementById('teamUserLabel');
    const logoutBtn = document.getElementById('teamLogoutBtn');
    const logoutAllBtn = document.getElementById('teamLogoutAllBtn');
    const changePwdBtn = document.getElementById('teamChangePasswordBtn');
    const editNameBtn = document.getElementById('teamEditDisplayNameBtn');
    const adminLink = document.getElementById('teamAdminLink');
    const deleteCalBtn = document.getElementById('teamDeleteCalendarBtn');
    const user = typeof TeamAuth !== 'undefined' ? TeamAuth.getUser() : null;
    const isAdmin = Boolean(user && user.role === 'admin');

    if (!user) {
        if (accountGroup) {
            accountGroup.hidden = true;
        }
        if (label) {
            label.hidden = true;
        }
        if (logoutBtn) {
            logoutBtn.hidden = true;
        }
        if (logoutAllBtn) {
            logoutAllBtn.hidden = true;
        }
        if (changePwdBtn) {
            changePwdBtn.hidden = true;
        }
        if (editNameBtn) {
            editNameBtn.hidden = true;
        }
        if (adminLink) {
            adminLink.hidden = true;
        }
    if (deleteCalBtn) {
        deleteCalBtn.hidden = true;
    }
        return;
    }

    const newCalBtn = document.getElementById('teamNewCalendarBtn');
    if (newCalBtn) {
        newCalBtn.hidden = !isAdmin;
    }

    if (accountGroup) {
        accountGroup.hidden = false;
    }
    if (label) {
        label.hidden = false;
        label.textContent = user.displayName || user.email || '';
    }
    if (editNameBtn) {
        editNameBtn.hidden = false;
        if (editNameBtn.dataset.bound !== '1') {
            editNameBtn.dataset.bound = '1';
            editNameBtn.addEventListener('click', () => openEditDisplayNameModal());
        }
    }
    if (changePwdBtn) {
        changePwdBtn.hidden = false;
        if (changePwdBtn.dataset.bound !== '1') {
            changePwdBtn.dataset.bound = '1';
            changePwdBtn.addEventListener('click', () => {
                const modal = document.getElementById('changePasswordModal');
                if (modal) {
                    document.getElementById('changePasswordForm')?.reset();
                    openModal(modal);
                    document.getElementById('changePasswordCurrent')?.focus();
                }
            });
        }
    }
    if (logoutBtn) {
        logoutBtn.hidden = false;
        logoutBtn.onclick = () => TeamAuth.logout();
    }
    if (logoutAllBtn) {
        logoutAllBtn.hidden = false;
        if (logoutAllBtn.dataset.bound !== '1') {
            logoutAllBtn.dataset.bound = '1';
            logoutAllBtn.addEventListener('click', () => {
                if (
                    !confirm(
                        'Sign out on every browser and device where you used this calendar? You will need to sign in again here too.'
                    )
                ) {
                    return;
                }
                TeamAuth.logoutAll();
            });
        }
    }
    if (adminLink) {
        adminLink.hidden = !isAdmin;
    }
    if (deleteCalBtn) {
        deleteCalBtn.hidden = !isAdmin;
        if (!isAdmin) {
            deleteCalBtn.disabled = true;
        }
    }
}

function saveDataToLocalCache() {
    ensureUiState();
    appData.schemaVersion = SCHEMA_VERSION;
    appData.termMonthCount = getTermMonthCount();
    syncHolidaysFromEvents();
    localStorage.setItem('classCalendarData', JSON.stringify(appData));
}

function saveData() {
    saveDataToLocalCache();
    if (teamSyncEnabled && typeof CalendarSync !== 'undefined' && CalendarSync.isReadOnly()) {
        showLockFlash(t('teamReadOnlySave'), true);
        return;
    }
    if (teamSyncEnabled && typeof CalendarSync !== 'undefined') {
        CalendarSync.scheduleSave(() => {
            saveDataToLocalCache();
            return JSON.parse(JSON.stringify(appData));
        });
    }
}

function applyLoadedAppData(data) {
    invalidateScheduleCache();
    appData = data;
    const migrated = migrateData(appData);
    ensureUiState();
    refreshLocalizedEventDisplayNames();
    if (migrated) {
        saveData();
    }
}

function loadDataFromLocalCache() {
    const saved = localStorage.getItem('classCalendarData');
    if (saved) {
        try {
            applyLoadedAppData(JSON.parse(saved));
        } catch (e) {
            console.error('Error loading saved data:', e);
            appData = getDefaultAppData();
        }
    } else {
        appData = getDefaultAppData();
    }
}

function loadData() {
    loadDataFromLocalCache();
}

function applyServerDocument(doc) {
    if (!doc || !doc.data) {
        return;
    }
    const data = Object.assign({}, doc.data);
    const serverName = doc.name && String(doc.name).trim();
    if (serverName) {
        data.calendarName = serverName;
    }
    applyLoadedAppData(data);
    if (elements.calendarName) {
        elements.calendarName.value = appData.calendarName || '';
    }
    if (typeof CalendarSync !== 'undefined') {
        CalendarSync.state.revision = doc.revision;
    }
    updateActiveTeamCalendarOptionLabel();
    updateCalendarTitle();
    updateTopBarCalendarLabel();
}

function updateActiveTeamCalendarOptionLabel() {
    const sel = document.getElementById('teamCalendarSelect');
    if (!sel || !sel.value) {
        return;
    }
    const label = (appData.calendarName && appData.calendarName.trim()) || sel.selectedOptions[0]?.textContent || '';
    const opt = sel.querySelector('option[value="' + CSS.escape(sel.value) + '"]');
    if (opt && label) {
        opt.textContent = label;
    }
}

function setTeamCalendarRowVisible(visible) {
    const row = document.getElementById('teamCalendarRow');
    if (row) {
        row.hidden = !visible;
    }
    refreshCalendarNameLabel();
}

// ============================================
// Team sync (NAS server)
// ============================================
let conflictResolver = null;

function showConflictModal(serverDoc, localData) {
    return new Promise((resolve) => {
        const modal = document.getElementById('conflictModal');
        if (!modal) {
            resolve('mine');
            return;
        }
        conflictResolver = resolve;
        modal.style.display = 'flex';

        const close = () => {
            modal.style.display = 'none';
            conflictResolver = null;
        };

        document.getElementById('conflictUseTheirs').onclick = () => {
            close();
            resolve('theirs');
        };
        document.getElementById('conflictUseMine').onclick = () => {
            close();
            resolve('mine');
        };
        document.getElementById('conflictSmartMerge').onclick = () => {
            close();
            resolve('merge');
        };
        document.getElementById('conflictModalClose').onclick = () => {
            close();
            resolve('cancel');
        };
    });
}

function updateTeamSyncStatus(status, detail) {
    const el = document.getElementById('teamSyncStatus');
    if (!el) {
        return;
    }
    const map = {
        connecting: 'syncConnecting',
        connected: 'syncConnected',
        offline: 'syncOffline',
        saving: 'syncSaving',
        saved: 'syncSaved',
        error: 'syncError',
        conflict: 'syncConflictTitle'
    };
    el.textContent = detail || t(map[status] || 'syncConnecting');
    el.className = 'team-sync-status status-' + (status || 'connecting');
}

let syncToastTimer = null;

function dismissSyncToast(el, onDone) {
    if (!el || !el.classList.contains('sync-toast--visible')) {
        if (onDone) {
            onDone();
        }
        return;
    }
    el.classList.remove('sync-toast--visible');
    afterNotificationTransition(el, () => {
        el.setAttribute('aria-hidden', 'true');
        el.textContent = '';
        if (onDone) {
            onDone();
        }
    });
}

function showSyncToast(message, isError) {
    const el = document.getElementById('syncToast');
    if (!el) {
        return;
    }
    if (syncToastTimer) {
        clearTimeout(syncToastTimer);
        syncToastTimer = null;
    }
    const present = () => {
        el.setAttribute('aria-hidden', 'false');
        el.textContent = message;
        el.className = 'sync-toast' + (isError ? ' sync-toast-error' : ' sync-toast-success');
        requestAnimationFrame(() => {
            el.classList.add('sync-toast--visible');
        });
        syncToastTimer = setTimeout(() => dismissSyncToast(el), 7000);
    };
    if (el.classList.contains('sync-toast--visible')) {
        dismissSyncToast(el, present);
        return;
    }
    present();
}

function highlightCalendarSelect() {
    const sel = document.getElementById('teamCalendarSelect');
    if (!sel) {
        return;
    }
    sel.classList.add('team-sync-select--highlight');
    sel.focus();
    sel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => sel.classList.remove('team-sync-select--highlight'), 3000);
}

function populateCalendarSelect(calendars, activeId) {
    const sel = document.getElementById('teamCalendarSelect');
    const delBtn = document.getElementById('teamDeleteCalendarBtn');
    if (!sel) {
        return;
    }
    sel.innerHTML = '';
    const list = calendars || [];
    if (list.length === 0) {
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = t('teamCalendarEmpty');
        empty.disabled = true;
        empty.selected = true;
        sel.appendChild(empty);
        if (delBtn) {
            delBtn.disabled = true;
            const user = typeof TeamAuth !== 'undefined' ? TeamAuth.getUser() : null;
            delBtn.hidden = !(user && user.role === 'admin');
        }
        return;
    }
    list.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name || c.id;
        sel.appendChild(opt);
    });
    if (activeId && list.some((c) => c.id === activeId)) {
        sel.value = activeId;
    } else {
        sel.value = list[0].id;
    }
    if (delBtn) {
        const user = typeof TeamAuth !== 'undefined' ? TeamAuth.getUser() : null;
        const isAdmin = Boolean(user && user.role === 'admin');
        delBtn.hidden = !isAdmin;
        delBtn.disabled = !isAdmin;
    }
}

async function switchToTeamCalendar(id, calendarsOptional) {
    if (teamLockPreviousCalendarId && teamLockPreviousCalendarId !== id) {
        await CalendarSync.releaseLock(teamLockPreviousCalendarId);
    }
    const list = calendarsOptional || (await CalendarSync.listCalendars());
    populateCalendarSelect(list, id);
    if (!id || !list.some((c) => c.id === id)) {
        CalendarSync.setActiveCalendarId(null);
        if (list.length === 0) {
            appData = getDefaultAppData();
            initializeTermStart();
            renderCalendar();
        }
        return;
    }
    CalendarSync.setActiveCalendarId(id);
    try {
        const doc = await CalendarSync.loadCalendar(id);
        if (CalendarSync.state.readOnly) {
            teamLockPreviousCalendarId = null;
        } else {
            await CalendarSync.acquireLock(id);
            teamLockPreviousCalendarId = CalendarSync.state.holdsLock ? id : null;
        }
        applyTeamLockAccessState({
            readOnly: CalendarSync.state.readOnly,
            lock: CalendarSync.state.lock,
            holdsLock: CalendarSync.state.holdsLock,
            pendingEditRequest: CalendarSync.state.pendingEditRequest
        });
        applyServerDocument(doc);
        initializeTermStart();
        renderCalendar();
        updateTeamSyncStatus('saved');
        if (CalendarSync.state.pendingEditRequest && CalendarSync.state.readOnly) {
            showLockFlash(
                t('teamLockWaitingFlash').replace('{name}', formatLockParty(CalendarSync.state.lock)),
                false
            );
        }
    } catch (err) {
        if (err.status === 404) {
            showSyncToast(t('teamCalendarAccessLost'), true);
            const freshList = await CalendarSync.listCalendars();
            if (freshList.length > 0) {
                await switchToTeamCalendar(freshList[0].id, freshList);
            } else {
                populateCalendarSelect([], null);
                CalendarSync.setActiveCalendarId(null);
                appData = getDefaultAppData();
                initializeTermStart();
                renderCalendar();
            }
            return;
        }
        throw err;
    }
}

function renderAccessCheckboxList(container, items, inputName, options) {
    if (!container) {
        return;
    }
    const opts = options || {};
    container.innerHTML = '';
    if (!items || items.length === 0) {
        const p = document.createElement('p');
        p.className = 'section-hint';
        p.textContent = opts.emptyText || '';
        container.appendChild(p);
        return;
    }
    items.forEach((item) => {
        const label = document.createElement('label');
        label.className = 'access-checkbox-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = inputName;
        cb.value = item.id;
        if (opts.checkedIds && opts.checkedIds.includes(item.id)) {
            cb.checked = true;
        }
        if (opts.disabledIds && opts.disabledIds.includes(item.id)) {
            cb.disabled = true;
            cb.checked = true;
        }
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + (item.displayName || item.name || item.email || item.id)));
        container.appendChild(label);
    });
}

function getNewCalendarAccessSelections() {
    const memberUserIds = [];
    document.querySelectorAll('#newCalendarTeachersList input[type="checkbox"]:checked').forEach((el) => {
        if (el.value && !el.disabled) {
            memberUserIds.push(el.value);
        }
    });
    const groupIds = [];
    document.querySelectorAll('#newCalendarGroupsList input[type="checkbox"]:checked').forEach((el) => {
        if (el.value) {
            groupIds.push(el.value);
        }
    });
    return { memberUserIds, groupIds };
}

async function populateCalendarAccessPicker(options) {
    const opts = options || {};
    const teachersEl = document.getElementById(opts.teachersListId || 'newCalendarTeachersList');
    const groupsEl = document.getElementById(opts.groupsListId || 'newCalendarGroupsList');
    const groupsLabel = opts.groupsLabelEl
        ? document.querySelector(opts.groupsLabelEl)
        : document.querySelector('.access-groups-label');
    const teacherInputName = opts.teacherInputName || 'newCalTeacher';
    const groupInputName = opts.groupInputName || 'newCalGroup';
    const me = typeof TeamAuth !== 'undefined' ? TeamAuth.getUser() : null;
    if (!teachersEl) {
        return;
    }
    let teachers = [];
    let groups = [];
    try {
        teachers = await CalendarSync.fetchTeachers();
        groups = await CalendarSync.fetchGroups();
    } catch (_) {
        teachers = [];
        groups = [];
    }
    const otherTeachers = (teachers || []).filter((u) => !me || u.id !== me.id);
    const disabledIds = me ? [me.id] : [];
    renderAccessCheckboxList(teachersEl, otherTeachers, teacherInputName, {
        emptyText: t('newCalendarNoAccessList'),
        disabledIds
    });
    if (groupsEl) {
        if (groups.length > 0) {
            if (groupsLabel) {
                groupsLabel.hidden = false;
            }
            renderAccessCheckboxList(groupsEl, groups, groupInputName, { emptyText: '' });
        } else {
            groupsEl.innerHTML = '';
            if (groupsLabel) {
                groupsLabel.hidden = true;
            }
        }
    }
}

async function populateNewCalendarAccessPicker() {
    return populateCalendarAccessPicker({});
}

async function populateImportNewCalendarAccessPicker() {
    return populateCalendarAccessPicker({
        teachersListId: 'importNewCalendarTeachersList',
        groupsListId: 'importNewCalendarGroupsList',
        groupsLabelEl: '#importDestinationModal .import-access-groups-label',
        teacherInputName: 'importNewCalTeacher',
        groupInputName: 'importNewCalGroup'
    });
}

function getImportCalendarAccessSelections() {
    const memberUserIds = [];
    document.querySelectorAll('#importNewCalendarTeachersList input[type="checkbox"]:checked').forEach((el) => {
        if (el.value && !el.disabled) {
            memberUserIds.push(el.value);
        }
    });
    const groupIds = [];
    document.querySelectorAll('#importNewCalendarGroupsList input[type="checkbox"]:checked').forEach((el) => {
        if (el.value) {
            groupIds.push(el.value);
        }
    });
    return { memberUserIds, groupIds };
}

function normalizeImportedAppData(imported) {
    const data = Object.assign({}, imported);
    if (!data.events && data.holidays) {
        data.events = data.holidays.map((h) => Object.assign({}, h, { type: EVENT_TYPES.HOLIDAY }));
    }
    return data;
}

async function assertTeamCalendarNameAvailable(name, excludeCalendarId) {
    if (!teamSyncEnabled || typeof CalendarSync === 'undefined') {
        return;
    }
    const trimmed = String(name || '').trim();
    if (!trimmed) {
        return;
    }
    const list = await CalendarSync.listCalendars();
    const lower = trimmed.toLowerCase();
    const exclude = excludeCalendarId ? String(excludeCalendarId) : '';
    const clash = list.find(
        (c) =>
            c.id !== exclude &&
            String(c.name || '')
                .trim()
                .toLowerCase() === lower
    );
    if (clash) {
        const err = new Error(t('duplicateCalendarName').replace('{name}', trimmed));
        err.code = 'DUPLICATE_NAME';
        throw err;
    }
}

async function revertTeamCalendarNameFromServer() {
    const id =
        typeof CalendarSync !== 'undefined' && CalendarSync.getActiveCalendarId
            ? CalendarSync.getActiveCalendarId()
            : null;
    if (!id) {
        return;
    }
    const list = await CalendarSync.listCalendars();
    const row = list.find((c) => c.id === id);
    if (!row || !row.name) {
        return;
    }
    appData.calendarName = String(row.name).trim();
    if (elements.calendarName) {
        elements.calendarName.value = appData.calendarName;
    }
    updateCalendarTitle();
    updateTopBarCalendarLabel();
    updateActiveTeamCalendarOptionLabel();
}

async function createTeamCalendarFromName(name, accessOptions) {
    CalendarSync.cancelPendingSave();
    const trimmed = name.trim();
    if (!trimmed) {
        throw new Error(t('newCalendarFailed'));
    }
    const freshData = getDefaultAppData();
    freshData.calendarName = trimmed;
    return createTeamCalendarFromImport(trimmed, freshData, accessOptions);
}

async function createTeamCalendarFromImport(name, importedData, accessOptions, successToastKey) {
    CalendarSync.cancelPendingSave();
    const trimmed = (name || '').trim();
    if (!trimmed) {
        throw new Error(t('newCalendarFailed'));
    }
    const payload = normalizeImportedAppData(importedData);
    payload.calendarName = trimmed;
    migrateData(payload);
    await assertTeamCalendarNameAvailable(trimmed);
    const opts = accessOptions || getNewCalendarAccessSelections();
    const created = await CalendarSync.createCalendar(payload, trimmed, {
        memberUserIds: opts.memberUserIds,
        groupIds: opts.groupIds
    });
    const list = await CalendarSync.listCalendars();
    const id = created.id;
    await switchToTeamCalendar(id, list);
    showSyncToast(t(successToastKey || 'newCalendarCreated').replace('{name}', trimmed), false);
    highlightCalendarSelect();
    return created;
}

async function openNewCalendarModal() {
    const modal = document.getElementById('newCalendarModal');
    const input = document.getElementById('newCalendarNameInput');
    if (!modal || !input) {
        return;
    }
    input.value = '';
    const submitBtn = document.getElementById('submitNewCalendarBtn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = t('newCalendarCreate');
    }
    await populateNewCalendarAccessPicker();
    openModal(modal);
    setTimeout(() => input.focus(), 100);
}

let pendingDeleteCalendarId = null;

async function refreshTeamCalendarsAfterDelete(deletedId) {
    teamLockPreviousCalendarId = null;
    CalendarSync.cancelPendingSave();
    const list = await CalendarSync.listCalendars();
    populateCalendarSelect(list, null);
    if (list.length === 0) {
        CalendarSync.setActiveCalendarId(null);
        appData = getDefaultAppData();
        initializeTermStart();
        renderCalendar();
        applyTeamLockAccessState({ readOnly: false, lock: null, holdsLock: false });
        setTeamLockBarVisible(teamSyncEnabled);
        updateCalendarTitle();
        updateTopBarCalendarLabel();
        return list;
    }
    const prevActive = CalendarSync.getActiveCalendarId();
    let nextId = null;
    if (prevActive && prevActive !== deletedId && list.some((c) => c.id === prevActive)) {
        nextId = prevActive;
    } else {
        nextId = list[0].id;
    }
    await switchToTeamCalendar(nextId, list);
    highlightCalendarSelect();
    return list;
}

async function openDeleteCalendarModal() {
    if (!teamSyncEnabled || typeof CalendarSync === 'undefined') {
        showSyncToast(t('teamSyncOffline'), true);
        return;
    }
    let list = [];
    try {
        list = await CalendarSync.listCalendars();
        const activeId = CalendarSync.getActiveCalendarId();
        populateCalendarSelect(list, activeId);
    } catch (err) {
        showSyncToast(t('syncError') + ': ' + err.message, true);
        return;
    }
    if (list.length === 0) {
        showSyncToast(t('teamCalendarEmpty'), true);
        return;
    }
    const sel = document.getElementById('teamCalendarSelect');
    const id = CalendarSync.getActiveCalendarId() || sel?.value;
    if (!id) {
        showSyncToast(t('teamCalendarEmpty'), true);
        return;
    }
    const row = list.find((c) => c.id === id);
    const label = row?.name || sel?.selectedOptions?.[0]?.textContent || id;
    pendingDeleteCalendarId = id;
    const msg = document.getElementById('deleteCalendarMessage');
    if (msg) {
        msg.textContent = t('deleteCalendarPrompt').replace('{name}', label);
    }
    openModal(document.getElementById('deleteCalendarModal'));
}

async function confirmDeleteTeamCalendar() {
    const id = pendingDeleteCalendarId;
    if (!id) {
        return;
    }
    const confirmBtn = document.getElementById('confirmDeleteCalendarBtn');
    const label =
        document.getElementById('teamCalendarSelect')?.selectedOptions?.[0]?.textContent || id;
    const prevConfirmText = confirmBtn ? confirmBtn.textContent : '';
    try {
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = t('deleteCalendarRemoving');
        }
        CalendarSync.cancelPendingSave();
        await CalendarSync.deleteCalendar(id);
        pendingDeleteCalendarId = null;
        closeModal(document.getElementById('deleteCalendarModal'));
        await refreshTeamCalendarsAfterDelete(id);
        showSyncToast(t('deleteCalendarDone').replace('{name}', label), false);
    } catch (err) {
        showSyncToast(t('syncError') + ': ' + err.message, true);
        try {
            await refreshTeamCalendarsAfterDelete(null);
        } catch (_) {
            /* ignore refresh errors */
        }
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = prevConfirmText || t('deleteCalendarConfirm');
        }
    }
}

function setupTeamCalendarModals() {
    if (document.body.dataset.teamCalendarModalsBound === '1') {
        return;
    }

    const newModal = document.getElementById('newCalendarModal');
    const delModal = document.getElementById('deleteCalendarModal');
    const newForm = document.getElementById('newCalendarForm');

    function requireTeamSync(action) {
        if (!teamSyncEnabled || typeof CalendarSync === 'undefined') {
            updateTeamSyncStatus('offline', t('teamSyncOffline'));
            showSyncToast(t('teamSyncOffline'), true);
            return false;
        }
        return true;
    }

    document.getElementById('teamNewCalendarBtn')?.addEventListener('click', () => {
        if (!requireTeamSync('new')) {
            return;
        }
        openNewCalendarModal().catch((err) => showSyncToast(t('newCalendarFailed') + ': ' + err.message, true));
    });
    document.getElementById('teamDeleteCalendarBtn')?.addEventListener('click', () => {
        if (!requireTeamSync('delete')) {
            return;
        }
        openDeleteCalendarModal().catch((err) =>
            showSyncToast(t('syncError') + ': ' + err.message, true)
        );
    });

    document.getElementById('closeNewCalendarModal')?.addEventListener('click', () => closeModal(newModal));
    document.getElementById('cancelNewCalendarBtn')?.addEventListener('click', () => closeModal(newModal));
    document.getElementById('closeDeleteCalendarModal')?.addEventListener('click', () => closeModal(delModal));
    document.getElementById('cancelDeleteCalendarBtn')?.addEventListener('click', () => closeModal(delModal));
    document.getElementById('confirmDeleteCalendarBtn')?.addEventListener('click', () => {
        if (!requireTeamSync('delete')) {
            return;
        }
        confirmDeleteTeamCalendar();
    });

    if (newModal) {
        bindModalBackdropClose(newModal);
    }
    if (delModal) {
        bindModalBackdropClose(delModal);
    }

    newForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!requireTeamSync('new')) {
            return;
        }
        const input = document.getElementById('newCalendarNameInput');
        const submitBtn = document.getElementById('submitNewCalendarBtn');
        if (!input?.value.trim()) {
            input?.focus();
            return;
        }
        const prevSubmitText = submitBtn ? submitBtn.textContent : '';
        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = t('newCalendarCreating');
            }
            await createTeamCalendarFromName(input.value);
            closeModal(newModal);
        } catch (err) {
            showSyncToast(t('newCalendarFailed') + ': ' + err.message, true);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = prevSubmitText || t('newCalendarCreate');
            }
        }
    });

    document.body.dataset.teamCalendarModalsBound = '1';
}

/** True when team server runs on this LAN (not Cloudflare / public HTTPS). */
function isLocalTeamServerUrl(url) {
    if (!url) {
        return false;
    }
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            return false;
        }
        if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
            return true;
        }
        if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) {
            return true;
        }
        if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
            return true;
        }
        return false;
    } catch (_) {
        return false;
    }
}

async function setupHostEnginePanel() {
    const panel = document.getElementById('hostEnginePanel');
    const input = document.getElementById('hostTeamUrlInput');
    const copyBtn = document.getElementById('hostCopyTeamUrlBtn');
    if (!panel || !input) {
        return;
    }
    try {
        const info = await CalendarSync.fetchHostInfo();
        const url = info.primaryTeamUrl || info.localhostUrl;
        if (!url || !isLocalTeamServerUrl(url)) {
            panel.style.display = 'none';
            return;
        }
        input.value = url;
        panel.style.display = 'block';
        copyBtn?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(url);
                showSyncToast(t('hostLinkCopied'), false);
            } catch (_) {
                input.select();
                document.execCommand('copy');
                showSyncToast(t('hostLinkCopied'), false);
            }
        });
    } catch (_) {
        /* ignore */
    }
}

async function reloadActiveCalendarFromServer() {
    const id = CalendarSync.getActiveCalendarId();
    if (!id) {
        return;
    }
    const doc = await CalendarSync.loadCalendar(id);
    applyServerDocument(doc);
    if (document.body.classList.contains('workspace-page')) {
        if (typeof renderHomeworkClassList === 'function') {
            renderHomeworkClassList();
        }
        if (typeof renderHomeworkEditor === 'function') {
            renderHomeworkEditor();
        }
        const wsBanner = document.getElementById('workspaceRemoteBanner');
        if (wsBanner) {
            wsBanner.hidden = true;
        }
        const label = document.getElementById('workspaceCalendarLabel');
        if (label) {
            label.textContent = appData.calendarName || '';
        }
        CalendarSync.state.remoteNewer = false;
        return;
    }
    initializeTermStart();
    renderCalendar();
    const remoteBanner = document.getElementById('remoteNewerBanner');
    const teamReloadBtn = document.getElementById('teamReloadBtn');
    if (remoteBanner) {
        remoteBanner.style.display = 'none';
    }
    if (teamReloadBtn) {
        teamReloadBtn.style.display = 'none';
    }
    CalendarSync.state.remoteNewer = false;
}

async function initTeamSync() {
    if (typeof CalendarSync === 'undefined') {
        return;
    }

    setupTeamCalendarModals();
    setupTeamUserBar();

    CalendarSync.setHandlers({
        onStatusChange: updateTeamSyncStatus,
        onPrepareLogout() {
            saveDataToLocalCache();
            if (CalendarSync.isReadOnly()) {
                return;
            }
            CalendarSync.scheduleSave(() => {
                saveDataToLocalCache();
                return JSON.parse(JSON.stringify(appData));
            });
        },
        onSaved(doc) {
            if (doc && doc.name && String(doc.name).trim()) {
                appData.calendarName = String(doc.name).trim();
                if (elements.calendarName) {
                    elements.calendarName.value = appData.calendarName;
                }
            }
            updateActiveTeamCalendarOptionLabel();
            updateCalendarTitle();
            updateTopBarCalendarLabel();
        },
        onLockChange(lockState) {
            applyTeamLockAccessState(lockState);
        },
        onLockDebugChange() {
            refreshTeamLockDebugPanel();
        },
        onDuplicateName(message) {
            showSyncToast(message, true);
            revertTeamCalendarNameFromServer().catch(() => {});
        },
        async onLockOrRevisionChange(meta, lockState) {
            await maybeAutoReloadTeamCalendar(meta, lockState);
        },
        onRemoteNewer(meta) {
            if (document.body.classList.contains('workspace-page')) {
                const wsBanner = document.getElementById('workspaceRemoteBanner');
                if (wsBanner) {
                    wsBanner.hidden = false;
                }
                return;
            }
            const remoteBanner = document.getElementById('remoteNewerBanner');
            const teamReloadBtn = document.getElementById('teamReloadBtn');
            if (remoteBanner) {
                remoteBanner.style.display = 'flex';
            }
            if (teamReloadBtn) {
                teamReloadBtn.style.display = 'inline-flex';
            }
        },
        async onConflict(serverDocument, localData) {
            const choice = await showConflictModal(serverDocument, localData);
            if (choice === 'theirs') {
                applyServerDocument(serverDocument);
                initializeTermStart();
                renderCalendar();
                return;
            }
            if (choice === 'merge') {
                const merged = CalendarSync.smartMergeData(localData, serverDocument.data);
                applyLoadedAppData(merged);
                initializeTermStart();
                renderCalendar();
                await CalendarSync.saveCalendar(merged, { force: true });
                return;
            }
            if (choice === 'mine') {
                await CalendarSync.saveCalendar(localData, { force: true });
            }
        }
    });

    const connected = await CalendarSync.checkHealth();

    if (!connected) {
        teamSyncEnabled = false;
        setTeamCalendarRowVisible(false);
        setTeamLockBarVisible(false);
        updateTeamSyncStatus('offline');
        return;
    }

    teamSyncEnabled = true;
    setTeamCalendarRowVisible(true);
    updateTeamSyncStatus('connected');
    setupTeamUserBar();
    setupTeamLockButtons();
    setupTeamLockPendingButtons();
    setupTeamLockDebugPanel();

    await setupHostEnginePanel();

    const teamUser = typeof TeamAuth !== 'undefined' ? TeamAuth.getUser() : null;
    const isTeamAdmin = Boolean(teamUser && teamUser.role === 'admin');

    let calendars = await CalendarSync.listCalendars();
    let activeId = CalendarSync.getActiveCalendarId();

    if (calendars.length === 0 && !isTeamAdmin) {
        location.replace('/pending-access.html');
        return;
    }

    if (calendars.length === 0) {
        const local = localStorage.getItem('classCalendarData');
        if (local && confirm(t('uploadLocalPrompt'))) {
            const data = JSON.parse(local);
            await createTeamCalendarFromName(data.calendarName || 'Imported Calendar');
            calendars = await CalendarSync.listCalendars();
            activeId = CalendarSync.getActiveCalendarId();
        } else {
            populateCalendarSelect([], null);
            setTeamLockBarVisible(false);
            showSyncToast(t('teamCalendarEmpty'), false);
            openNewCalendarModal().catch((err) =>
                showSyncToast(t('newCalendarFailed') + ': ' + err.message, true)
            );
        }
    }

    if (calendars.length > 0) {
        if (!activeId || !calendars.some((c) => c.id === activeId)) {
            activeId = calendars[0].id;
        }
        await switchToTeamCalendar(activeId, calendars);
    }

    document.getElementById('teamCalendarSelect')?.addEventListener('change', async (e) => {
        const id = e.target.value;
        if (!id) {
            return;
        }
        try {
            CalendarSync.cancelPendingSave();
            await switchToTeamCalendar(id);
        } catch (err) {
            showSyncToast(t('syncError') + ': ' + err.message, true);
        }
    });

    document.getElementById('teamReloadBtn')?.addEventListener('click', reloadActiveCalendarFromServer);
    document.getElementById('remoteNewerReloadBtn')?.addEventListener('click', reloadActiveCalendarFromServer);
    document.getElementById('remoteNewerDismissBtn')?.addEventListener('click', () => {
        document.getElementById('remoteNewerBanner').style.display = 'none';
    });

    document.getElementById('teamBackupBtn')?.addEventListener('click', async () => {
        try {
            const result = await CalendarSync.runBackup();
            if (result.skipped) {
                alert(t('syncBackupSkipped'));
            } else {
                alert(t('syncBackupOk'));
            }
        } catch (err) {
            alert(t('syncError') + ': ' + err.message);
        }
    });

    CalendarSync.startPolling();
}

// ============================================
// Data Migration
// ============================================
const OLD_LEVEL_TO_GRADE_MAP = {
    '1st-year': '중1',
    '2nd-year': '중2',
    '3rd-year': '중3',
    '4th-year': '',
    'Beginner': '',
    'Intermediate': '',
    'Advanced': ''
};

function migrateData(data) {
    let migrated = false;
    let migratedClasses = 0;
    let migratedHolidays = 0;

    if (!data.classes) data.classes = [];
    if (!data.holidays) data.holidays = [];

    if (!Array.isArray(data.events) || data.events.length === 0) {
        if (data.holidays.length > 0) {
            data.events = data.holidays.map(h => normalizeEvent({ ...h, type: EVENT_TYPES.HOLIDAY }));
            migrated = true;
            migratedHolidays = data.events.length;
        } else {
            data.events = [];
        }
    } else {
        data.events = data.events.map(normalizeEvent);
    }

    if (Array.isArray(data.events)) {
        data.events.forEach(ev => {
            if (backfillKrPublicHolidayBilingualNames(ev)) {
                migrated = true;
                migratedHolidays += 1;
            }
        });
    }

    if (!data.termMonthCount) {
        data.termMonthCount = SCHEDULE_CONFIG.defaultTermCalendarMonths;
        migrated = true;
    }

    if (!data.schemaVersion || data.schemaVersion < SCHEMA_VERSION) {
        data.schemaVersion = SCHEMA_VERSION;
        migrated = true;
    }

    ensureUiState();
    if (!data.ui) {
        data.ui = {
            visibilityFilters: { ...DEFAULT_VISIBILITY_FILTERS },
            printVisibility: { ...DEFAULT_VISIBILITY_FILTERS },
            lessonFilters: { ...DEFAULT_LESSON_FILTERS }
        };
        migrated = true;
    }
    
    if (!Array.isArray(data.customClassTypes)) {
        data.customClassTypes = [];
        migrated = true;
    }
    if (!Array.isArray(data.customSyllabusTemplates)) {
        data.customSyllabusTemplates = [];
        migrated = true;
    }

    if (!data.defaultClassTypeOverrides || typeof data.defaultClassTypeOverrides !== 'object') {
        data.defaultClassTypeOverrides = {};
        migrated = true;
    }
    if (!data.bookOverrides || typeof data.bookOverrides !== 'object') {
        data.bookOverrides = {};
        migrated = true;
    }
    if (!data.curriculumOverrides || typeof data.curriculumOverrides !== 'object') {
        data.curriculumOverrides = {};
        migrated = true;
    }
    migrateCurriculumData(data);

    // Migrate classes
    if (data.classes && data.classes.length > 0) {
        data.classes.forEach(classData => {
            // Check if this is old format (level has old values like "1st-year")
            if (classData.level && OLD_LEVEL_TO_GRADE_MAP.hasOwnProperty(classData.level)) {
                // Map old level to new grade
                const newGrade = OLD_LEVEL_TO_GRADE_MAP[classData.level];
                classData.grade = newGrade;
                classData.level = ''; // Clear level for user to re-select A/B/C
                migrated = true;
                migratedClasses++;
            }

            // Ensure total lessons and compression settings exist
            if (!classData.totalLessons || classData.totalLessons < 1) {
                classData.totalLessons = 4;
            }

            if (!Array.isArray(classData.compressionMerges)) {
                classData.compressionMerges = getCompressionMergesFromClass(
                    classData,
                    sanitizeTotalLessons(classData.totalLessons)
                );
            }

            if (!classData.scheduleModel) {
                classData.scheduleModel = inferScheduleModelFromClassFields(classData);
                migrated = true;
            }
            if (classData.scheduleModel === SCHEDULE_MODEL_SEQUENTIAL_TERM) {
                if (classData.compressionMode === 'manualPerMonth'
                    || classData.compressionMode === 'manual'
                    || classData.compressionMode === 'autoWhenNeeded') {
                    classData.compressionMode = 'sequentialTerm';
                    migrated = true;
                }
            } else if (!classData.compressionMode) {
                classData.compressionMode = 'autoWhenNeeded';
                migrated = true;
            }
            if (classData.classTypeId === CLASS_TYPE_EARLY_WRITER_ID) {
                classData.classTypeId = 'preset-early-writers-navy';
                migrated = true;
            }

            // Migrate legacy custom schedule fields to array format
            if (classData.customSchedule && classData.customSchedule.enabled) {
                if (!Array.isArray(classData.customSchedule.days)) {
                    const days = getCustomScheduleDaysFromClass(
                        classData,
                        sanitizeTotalLessons(classData.totalLessons)
                    );
                    classData.customSchedule.days = days;
                }
            }

            if (classData.levelPreset === undefined && classData.levelCustom === undefined) {
                const L = (classData.level || '').trim();
                if (isLegacySectionPreset(L)) {
                    classData.levelPreset = '';
                    classData.levelCustom = L;
                } else if (isSimsonLevelPreset(L)) {
                    classData.levelPreset = L;
                    classData.levelCustom = '';
                } else if (L) {
                    classData.levelPreset = '';
                    classData.levelCustom = L;
                } else {
                    classData.levelPreset = '';
                    classData.levelCustom = '';
                }
            }

            if (isLegacySectionPreset(classData.levelPreset)) {
                if (!(classData.levelCustom || '').trim()) {
                    classData.levelCustom = classData.levelPreset;
                }
                classData.levelPreset = '';
                migrated = true;
            }

            if (!classData.booksByMonth || typeof classData.booksByMonth !== 'object') {
                classData.booksByMonth = {};
            }

            if (!classData.compressionMode) {
                classData.compressionMode = 'manual';
            }

            const spanKeys = enumerateMonthKeysBetween(classData.startDate || '', classData.endDate || '');
            if (!classData.termCalendarMonths || classData.termCalendarMonths < 1) {
                classData.termCalendarMonths = spanKeys.length > 0
                    ? spanKeys.length
                    : SCHEDULE_CONFIG.defaultTermCalendarMonths;
            }
            if (classData.useAutoTermEnd === undefined) {
                classData.useAutoTermEnd = false;
            }

            if (!classData.textColor || !String(classData.textColor).trim()) {
                classData.textColor = DEFAULT_CLASS_TEXT_COLOR;
            }

            classData.level = getClassLevelDisplay(classData);

            if (!Array.isArray(classData.syllabusUnits)) {
                classData.syllabusUnits = [];
                migrated = true;
            }
            if (!Array.isArray(classData.syllabusRows)) {
                classData.syllabusRows = [];
            }

            if (!Array.isArray(classData.meetingDays) || classData.meetingDays.length === 0) {
                const d = classData.dayOfWeek;
                if (d !== null && d !== undefined && d !== '' && !Number.isNaN(parseInt(d, 10))) {
                    classData.meetingDays = [parseInt(d, 10)];
                } else {
                    classData.meetingDays = [];
                }
            }
            classData.meetingDays = normalizeMeetingDaysArray(classData.meetingDays);
            const md = classData.meetingDays;
            if (md.length === 1) {
                classData.dayOfWeek = md[0];
            } else if (md.length > 1) {
                classData.dayOfWeek = null;
            }
            if (classData.classTypeId === undefined || classData.classTypeId === null) {
                classData.classTypeId = '';
            }
        });
    }
    
    // Migrate holidays
    if (data.holidays && data.holidays.length > 0) {
        data.holidays.forEach(holiday => {
            // Check if this is old format (has 'levels' instead of 'grades')
            if (holiday.levels && !holiday.grades) {
                // Convert old levels to new grades
                const newGrades = [];
                holiday.levels.forEach(level => {
                    if (OLD_LEVEL_TO_GRADE_MAP.hasOwnProperty(level)) {
                        const grade = OLD_LEVEL_TO_GRADE_MAP[level];
                        if (grade && !newGrades.includes(grade)) {
                            newGrades.push(grade);
                        }
                    }
                });
                
                holiday.grades = newGrades;
                holiday.classNames = holiday.classNames || [];
                delete holiday.levels; // Remove old format
                migrated = true;
                migratedHolidays++;
            }
            
            // Ensure new format fields exist
            if (!holiday.grades) holiday.grades = [];
            if (!holiday.classNames) holiday.classNames = [];
            if (!Array.isArray(holiday.sectionLevels)) holiday.sectionLevels = [];
            if (holiday.allElementary === undefined) holiday.allElementary = false;
            if (holiday.allMiddleSchool === undefined) holiday.allMiddleSchool = false;
        });
    }

    data.events = (data.events || []).map(ev => {
        const normalized = normalizeEvent(ev);
        const legacy = data.holidays.find(h => h.id === normalized.id);
        if (legacy && normalizeEventType(normalized.type) === EVENT_TYPES.HOLIDAY) {
            return normalizeEvent({ ...legacy, ...normalized, type: EVENT_TYPES.HOLIDAY });
        }
        return normalized;
    });
    syncHolidaysFromEvents();
    
    // Show migration notice
    if (migrated) {
        const msg = t('migrationNotice')
            .replace('{classes}', migratedClasses)
            .replace('{holidays}', migratedHolidays);
        setTimeout(() => alert(msg), 500);
    }
    
    return migrated;
}

const SYLLABUS_PACK_KIND = 'ccp-syllabus-pack';
const SYLLABUS_PACK_VERSION = 1;

function countDefaultClassTypeOverrides() {
    const overrides = appData.defaultClassTypeOverrides;
    if (!overrides || typeof overrides !== 'object') {
        return 0;
    }
    return Object.keys(overrides).filter((k) => overrides[k] && typeof overrides[k] === 'object').length;
}

function buildSyllabusPackPayload() {
    return {
        kind: SYLLABUS_PACK_KIND,
        schemaVersion: SYLLABUS_PACK_VERSION,
        exportedAt: new Date().toISOString(),
        customSyllabusTemplates: JSON.parse(JSON.stringify(getCustomSyllabusTemplates())),
        defaultClassTypeOverrides: JSON.parse(JSON.stringify(appData.defaultClassTypeOverrides || {})),
        bookOverrides: JSON.parse(JSON.stringify(appData.bookOverrides || {})),
        curriculumOverrides: JSON.parse(JSON.stringify(appData.curriculumOverrides || {}))
    };
}

function exportSyllabusPack() {
    const payload = buildSyllabusPackPayload();
    const dataStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const baseName = (appData.calendarName && appData.calendarName.trim())
        ? appData.calendarName.trim().replace(/[^a-zA-Z0-9가-힣\s-]/g, '').replace(/\s+/g, '-')
        : 'class-calendar';
    const filename = `${baseName}_lesson-plans-books_${dateStr}.json`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setAppStatusMessage(t('printSyllabusPackExported'), false);
}

function mergeImportedSyllabusPack(imported) {
    let templateCount = 0;
    let overrideCount = 0;
    if (Array.isArray(imported.customSyllabusTemplates)) {
        if (!Array.isArray(appData.customSyllabusTemplates)) {
            appData.customSyllabusTemplates = [];
        }
        imported.customSyllabusTemplates.forEach((tpl) => {
            if (!tpl || !tpl.id) {
                return;
            }
            const idx = appData.customSyllabusTemplates.findIndex((x) => x.id === tpl.id);
            const copy = JSON.parse(JSON.stringify(tpl));
            if (idx === -1) {
                appData.customSyllabusTemplates.push(copy);
            } else {
                appData.customSyllabusTemplates[idx] = copy;
            }
            templateCount += 1;
        });
    }
    if (imported.defaultClassTypeOverrides && typeof imported.defaultClassTypeOverrides === 'object') {
        if (!appData.defaultClassTypeOverrides || typeof appData.defaultClassTypeOverrides !== 'object') {
            appData.defaultClassTypeOverrides = {};
        }
        Object.keys(imported.defaultClassTypeOverrides).forEach((presetId) => {
            const patch = imported.defaultClassTypeOverrides[presetId];
            if (!patch || typeof patch !== 'object') {
                return;
            }
            appData.defaultClassTypeOverrides[presetId] = {
                ...(appData.defaultClassTypeOverrides[presetId] || {}),
                ...JSON.parse(JSON.stringify(patch))
            };
            overrideCount += 1;
        });
    }
    let bookCount = 0;
    if (imported.curriculumOverrides && typeof imported.curriculumOverrides === 'object') {
        if (!appData.curriculumOverrides || typeof appData.curriculumOverrides !== 'object') {
            appData.curriculumOverrides = {};
        }
        Object.keys(imported.curriculumOverrides).forEach((cid) => {
            const patch = imported.curriculumOverrides[cid];
            if (!patch || typeof patch !== 'object') {
                return;
            }
            appData.curriculumOverrides[cid] = JSON.parse(JSON.stringify(patch));
            bookCount += 1;
        });
        migrateCurriculumData(appData);
    }
    if (imported.bookOverrides && typeof imported.bookOverrides === 'object') {
        if (!appData.bookOverrides || typeof appData.bookOverrides !== 'object') {
            appData.bookOverrides = {};
        }
        Object.keys(imported.bookOverrides).forEach((bookId) => {
            const patch = imported.bookOverrides[bookId];
            if (!patch || typeof patch !== 'object') {
                return;
            }
            appData.bookOverrides[bookId] = JSON.parse(JSON.stringify(patch));
            if (!bookCount) {
                bookCount += 1;
            }
        });
        migrateCurriculumData(appData);
    }
    return { templateCount, overrideCount, bookCount };
}

function isValidSyllabusPack(imported) {
    if (!imported || typeof imported !== 'object') {
        return false;
    }
    if (imported.kind === SYLLABUS_PACK_KIND) {
        return Array.isArray(imported.customSyllabusTemplates)
            || (imported.defaultClassTypeOverrides && typeof imported.defaultClassTypeOverrides === 'object')
            || (imported.curriculumOverrides && typeof imported.curriculumOverrides === 'object')
            || (imported.bookOverrides && typeof imported.bookOverrides === 'object');
    }
    if (Array.isArray(imported.customSyllabusTemplates)) {
        return true;
    }
    return false;
}

function importSyllabusPackFromFile(e) {
    const file = e.target.files[0];
    if (!file) {
        return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            if (!isValidSyllabusPack(imported)) {
                alert(t('printSyllabusPackInvalid'));
                return;
            }
            const { templateCount, overrideCount, bookCount } = mergeImportedSyllabusPack(imported);
            saveData();
            renderSyllabusTemplateList();
            renderPrintSyllabusManager();
            const msg = t('printSyllabusPackImported')
                .replace('{templates}', String(templateCount))
                .replace('{books}', String(bookCount || 0))
                .replace('{overrides}', String(overrideCount));
            setAppStatusMessage(msg, false);
        } catch (err) {
            alert(t('printSyllabusPackInvalid'));
            console.error('Syllabus pack import error:', err);
        }
        e.target.value = '';
    };
    reader.readAsText(file);
}

function renderPrintSyllabusManager() {
    if (window.CCPBooksEditor) {
        window.CCPBooksEditor.renderPrintBooksList();
    }
    const statsEl = document.getElementById('printSyllabusStats');
    const listEl = document.getElementById('printSyllabusTemplateList');
    if (!statsEl && !listEl) {
        return;
    }
    const templates = getCustomSyllabusTemplates();
    const overrideCount = countDefaultClassTypeOverrides();
    if (statsEl) {
        statsEl.textContent = t('printSyllabusStats')
            .replace('{templates}', String(templates.length))
            .replace('{overrides}', String(overrideCount));
    }
    if (!listEl) {
        return;
    }
    listEl.innerHTML = '';
    if (templates.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'section-hint';
        empty.textContent = t('printSyllabusNoTemplates');
        listEl.appendChild(empty);
        return;
    }
    templates.forEach((tpl) => {
        const row = document.createElement('div');
        row.className = 'print-syllabus-template-item';
        const label = document.createElement('span');
        label.textContent = tpl.name || tpl.id;
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-outline btn-small';
        editBtn.textContent = t('printSyllabusManageTemplate');
        editBtn.addEventListener('click', () => {
            navigateToTab('syllabus', { templateId: tpl.id });
        });
        row.appendChild(label);
        row.appendChild(editBtn);
        listEl.appendChild(row);
    });
}

function setupPrintSyllabusControls() {
    const exportBtn = document.getElementById('printExportSyllabusBtn');
    const importBtn = document.getElementById('printImportSyllabusBtn');
    const importFile = document.getElementById('printImportSyllabusFile');
    const openTabBtn = document.getElementById('printOpenSyllabusTabBtn');
    const openPrintBtn = document.getElementById('openPrintBtn');
    if (openPrintBtn && !openPrintBtn.dataset.bound) {
        openPrintBtn.dataset.bound = '1';
        openPrintBtn.addEventListener('click', openPrintOptionsDialog);
    }
    if (exportBtn && !exportBtn.dataset.bound) {
        exportBtn.dataset.bound = '1';
        exportBtn.addEventListener('click', exportSyllabusPack);
    }
    if (importBtn && importFile && !importBtn.dataset.bound) {
        importBtn.dataset.bound = '1';
        importBtn.addEventListener('click', () => importFile.click());
        importFile.addEventListener('change', importSyllabusPackFromFile);
    }
    if (openTabBtn && !openTabBtn.dataset.bound) {
        openTabBtn.dataset.bound = '1';
        openTabBtn.addEventListener('click', () => {
            syllabusListSegment = 'templates';
            navigateToTab('syllabus');
        });
    }
}

function exportData() {
    const dataStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Generate filename with calendar name and date/time
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const baseName = appData.calendarName && appData.calendarName.trim() 
        ? appData.calendarName.trim().replace(/[^a-zA-Z0-9가-힣\s-]/g, '').replace(/\s+/g, '-')
        : 'class-calendar';
    const filename = `${baseName}_${dateStr}_${timeStr}.json`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

let pendingImportPayload = null;
let pendingImportFileName = '';

function isValidCalendarImportPayload(imported) {
    return Boolean(imported && imported.classes && (imported.holidays || imported.events));
}

function finishImportUiAfterApply(migrated) {
    refreshLocalizedEventDisplayNames();
    syncHolidaysFromEvents();
    resetCalendarClassVisibilityAfterImport();
    if (appData.termStart && elements.termStart) {
        elements.termStart.value = appData.termStart;
    }
    if (elements.termMonthCount) {
        elements.termMonthCount.value = String(getTermMonthCount());
    }
    applyVisibilityFiltersToDom();
    renderCalendar();
    updateCalendarTitle();
    updateTopBarCalendarLabel();
    if (!migrated && !teamSyncEnabled) {
        alert(t('importSuccess'));
    }
}

function applyImportToLocalData(imported) {
    invalidateScheduleCache();
    appData = normalizeImportedAppData(imported);
    const migrated = migrateData(appData);
    finishImportUiAfterApply(migrated);
    saveData();
    return migrated;
}

async function applyImportToCurrentTeamCalendar(imported) {
    const calId = CalendarSync.getActiveCalendarId();
    if (!calId) {
        showSyncToast(t('importNoActiveCalendar'), true);
        return;
    }
    if (CalendarSync.isReadOnly()) {
        showSyncToast(t('importReadOnlyHint'), true);
        return;
    }
    const calName =
        appData.calendarName ||
        document.getElementById('teamCalendarSelect')?.selectedOptions?.[0]?.textContent ||
        'Calendar';
    if (!confirm(t('importOverwriteConfirm').replace('{name}', calName))) {
        return;
    }
    CalendarSync.cancelPendingSave();
    invalidateScheduleCache();
    appData = normalizeImportedAppData(imported);
    appData.calendarName = calName;
    const migrated = migrateData(appData);
    finishImportUiAfterApply(migrated);
    await CalendarSync.saveCalendar(JSON.parse(JSON.stringify(appData)), { force: true });
    showSyncToast(t('importToCurrentDone').replace('{name}', calName), false);
    return migrated;
}

function updateImportDestinationModalState() {
    const modal = document.getElementById('importDestinationModal');
    if (!modal) {
        return;
    }
    const currentRadio = document.getElementById('importDestCurrent');
    const newRadio = document.getElementById('importDestNew');
    const newSection = document.getElementById('importNewCalendarSection');
    const readOnlyHint = document.getElementById('importDestReadOnlyHint');
    const currentLabel = document.getElementById('importDestCurrentLabel');
    const calId = teamSyncEnabled && typeof CalendarSync !== 'undefined' ? CalendarSync.getActiveCalendarId() : null;
    const readOnly = teamSyncEnabled && typeof CalendarSync !== 'undefined' && CalendarSync.isReadOnly();
    const calName =
        appData.calendarName ||
        document.getElementById('teamCalendarSelect')?.selectedOptions?.[0]?.textContent ||
        t('calendarName');
    if (currentLabel) {
        currentLabel.textContent = t('importToCurrent') + ': “' + calName + '”';
    }
    const noCurrent = !calId;
    if (currentRadio) {
        currentRadio.disabled = noCurrent || readOnly;
    }
    if (readOnlyHint) {
        readOnlyHint.hidden = !readOnly;
    }
    if (noCurrent || readOnly) {
        if (newRadio) {
            newRadio.checked = true;
        }
        if (currentRadio) {
            currentRadio.checked = false;
        }
    } else if (currentRadio && !currentRadio.disabled) {
        currentRadio.checked = true;
        if (newRadio) {
            newRadio.checked = false;
        }
    }
    const showNew = newRadio && newRadio.checked;
    if (newSection) {
        newSection.hidden = !showNew;
    }
}

async function openImportDestinationModal(imported, fileName) {
    pendingImportPayload = imported;
    pendingImportFileName = fileName || '';
    const modal = document.getElementById('importDestinationModal');
    const fileLabel = document.getElementById('importDestinationFileLabel');
    if (fileLabel) {
        fileLabel.textContent = fileName ? 'File: ' + fileName : '';
    }
    const nameInput = document.getElementById('importNewCalendarNameInput');
    if (nameInput) {
        const suggested =
            (imported.calendarName && String(imported.calendarName).trim()) || 'Imported Calendar';
        nameInput.value = suggested;
    }
    await populateImportNewCalendarAccessPicker();
    updateImportDestinationModalState();
    const newRadio = document.getElementById('importDestNew');
    const newSection = document.getElementById('importNewCalendarSection');
    if (newRadio) {
        newRadio.onchange = () => {
            if (newSection) {
                newSection.hidden = !newRadio.checked;
            }
        };
    }
    const currentRadio = document.getElementById('importDestCurrent');
    if (currentRadio) {
        currentRadio.onchange = updateImportDestinationModalState;
    }
    openModal(modal);
}

function closeImportDestinationModal() {
    pendingImportPayload = null;
    pendingImportFileName = '';
    closeModal(document.getElementById('importDestinationModal'));
}

async function confirmImportDestination() {
    const imported = pendingImportPayload;
    if (!imported) {
        return;
    }
    const btn = document.getElementById('confirmImportDestinationBtn');
    const prevText = btn ? btn.textContent : '';
    const useNew = document.getElementById('importDestNew')?.checked;
    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = t('importImporting');
        }
        if (useNew) {
            const nameInput = document.getElementById('importNewCalendarNameInput');
            const name = nameInput?.value.trim() || imported.calendarName || 'Imported Calendar';
            if (!name) {
                nameInput?.focus();
                return;
            }
            await createTeamCalendarFromImport(
                name,
                imported,
                getImportCalendarAccessSelections(),
                'importNewCreated'
            );
        } else {
            if (teamSyncEnabled && typeof CalendarSync !== 'undefined') {
                await applyImportToCurrentTeamCalendar(imported);
            } else {
                applyImportToLocalData(imported);
            }
        }
        closeImportDestinationModal();
    } catch (err) {
        showSyncToast((err && err.message) || t('errorReadingFile'), true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = prevText || t('importConfirm');
        }
    }
}

function setupImportDestinationModal() {
    if (document.body.dataset.importDestinationModalBound === '1') {
        return;
    }
    const modal = document.getElementById('importDestinationModal');
    document.getElementById('closeImportDestinationModal')?.addEventListener('click', closeImportDestinationModal);
    document.getElementById('cancelImportDestinationBtn')?.addEventListener('click', closeImportDestinationModal);
    document.getElementById('confirmImportDestinationBtn')?.addEventListener('click', () => {
        confirmImportDestination();
    });
    if (modal) {
        bindModalBackdropClose(modal);
    }
    document.body.dataset.importDestinationModalBound = '1';
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            if (!isValidCalendarImportPayload(imported)) {
                alert(t('invalidFile'));
                return;
            }
            if (teamSyncEnabled && typeof CalendarSync !== 'undefined') {
                openImportDestinationModal(imported, file.name).catch((err) => {
                    showSyncToast((err && err.message) || t('errorReadingFile'), true);
                });
                return;
            }
            if (!confirm(t('importOverwriteWarning'))) {
                return;
            }
            applyImportToLocalData(imported);
        } catch (err) {
            alert(t('errorReadingFile'));
            console.error('Import error:', err);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

function clearAllData() {
    // Show confirmation dialog
    if (!confirm(t('confirmClearAllData'))) {
        return;
    }
    
    invalidateScheduleCache();
    // Clear localStorage
    localStorage.removeItem('classCalendarData');
    
    appData = getDefaultAppData();
    initializeTermStart();
    saveData();
    
    // Re-render calendar
    renderCalendar();
    
    // Update calendar title
    updateCalendarTitle();
    
    // Show success message
    alert(t('clearDataSuccess'));
}

// ============================================
// Utility Functions
// ============================================
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================
// Color contrast (calendar / dark theme)
// ============================================
function parseCssColorToRgb(cssColor) {
    if (!cssColor || typeof cssColor !== 'string') {
        return null;
    }
    const s = cssColor.trim();
    const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (hexMatch) {
        let h = hexMatch[1];
        if (h.length === 3) {
            h = h.split('').map((c) => c + c).join('');
        }
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16)
        };
    }
    const rgbMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s);
    if (rgbMatch) {
        return { r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] };
    }
    return null;
}

function getRelativeLuminance(rgb) {
    const channel = (v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Pick text color that reads on a user-chosen background (holiday cells, etc.). */
function getReadableTextOnBackground(backgroundColor, preferredColor) {
    const bgRgb = parseCssColorToRgb(backgroundColor);
    if (!bgRgb) {
        return preferredColor || '';
    }
    const bgLum = getRelativeLuminance(bgRgb);
    if (preferredColor) {
        const prefRgb = parseCssColorToRgb(preferredColor);
        if (prefRgb) {
            const prefLum = getRelativeLuminance(prefRgb);
            const contrast = (Math.max(bgLum, prefLum) + 0.05) / (Math.min(bgLum, prefLum) + 0.05);
            if (contrast >= 4.5) {
                return preferredColor;
            }
        }
    }
    return bgLum > 0.45 ? '#1e293b' : '#f8fafc';
}

function beginPrintColorMode() {
    document.documentElement.classList.add('print-color-mode-light');
}

function endPrintColorMode() {
    document.documentElement.classList.remove('print-color-mode-light');
}

function setupPrintColorModeIsolation() {
    let nativePrintColorMode = false;
    window.addEventListener('beforeprint', () => {
        nativePrintColorMode = true;
        beginPrintColorMode();
    });
    window.addEventListener('afterprint', () => {
        nativePrintColorMode = false;
        endPrintColorMode();
    });
    window.addEventListener('focus', () => {
        if (!nativePrintColorMode) {
            return;
        }
        window.setTimeout(() => {
            if (nativePrintColorMode) {
                nativePrintColorMode = false;
                endPrintColorMode();
            }
        }, 0);
    });
}

function formatDateISO(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(dateStr) {
    const date = parseISODateLocal(dateStr);
    if (Number.isNaN(date.getTime())) {
        return dateStr || '';
    }
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    const locale = currentLanguage === 'ko' ? 'ko-KR' : 'en-US';
    return date.toLocaleDateString(locale, options);
}

