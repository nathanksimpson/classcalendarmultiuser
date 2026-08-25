/**
 * Tab warning notifications — nav badges (dismissable) + persistent in-tab surfaces.
 */
(function (global) {
    'use strict';

    const hooks = {
        getAppData: null,
        t: (key) => key,
        escapeHtml: (s) => String(s || ''),
        escapeAttr: (s) => String(s || ''),
        getViewerContext: () => ({}),
        canAccessZoneSegment: () => true,
        getZoneInfoForTab: () => ({ zone: 'schedule', segment: 'calendar' }),
        getTabIdForZoneSegment: () => 'calendar',
        getActiveTab: () => 'calendar',
        navigateToZone: () => {},
        navigateToTab: () => {},
        clearActiveCohortFilter: () => {},
        openClassEditor: () => {},
        focusScheduleAdjustmentForClass: () => {},
        saveUiStateToLocalStorage: () => {},
        saveNavNotificationMeta: () => {},
        readNavNotificationMeta: () => ({}),
        getNotificationTtlSettings: () => ({ activeDays: 14, dismissedDays: 3 }),
        canPruneNotificationMeta: () => true,
        persistNotificationDismissals: () => {},
        ensureUiState: () => {},
        getClassesInDisplayOrder: () => [],
        getClassScheduleGapStatus: () => ({ incomplete: false }),
        getClassCurriculumWarningKindForClass: () => null,
        listTimetableTeachers: () => [],
        getTimetableApi: () => null,
        countClassEmptySyllabusLessons: () => 0,
        classHasNoMeetingDaysWarning: () => false,
        classNeedsDebateBookPeriodsWarning: () => false,
        getPerfEvalScheduleWarningsForClass: () => [],
        previewPerfEvalCloseCompression: () => {},
        getSyncNavWarningsForBell: () => [],
        getUiInboxWarningsForBell: () => [],
        onNotificationDismissed: () => {},
        focusDayNoteInNotesTab: () => {},
        reloadActiveCalendarFromServer: () => {},
        showNavWarningToast: () => {}
    };

    let refreshTimer = null;
    let ttlRefreshTimer = null;
    let popoverAnchor = null;
    let popoverTabId = null;
    let popoverZoneId = null;
    let popoverSegmentId = null;
    let bound = false;
    let cachedWarnings = [];
    let notificationSnapshot = {
        valid: false,
        all: [],
        active: [],
        history: [],
        meta: {},
        stamp: 0
    };

    const CLASS_TAB_IDS = ['classes', 'syllabus'];
    const MS_PER_DAY = 86400000;

    function getTtlMs() {
        const ttl = typeof hooks.getNotificationTtlSettings === 'function'
            ? hooks.getNotificationTtlSettings()
            : { activeDays: 14, dismissedDays: 3 };
        const activeDays = Number(ttl.activeDays) > 0 ? Number(ttl.activeDays) : 14;
        const dismissedDays = Number(ttl.dismissedDays) > 0 ? Number(ttl.dismissedDays) : 3;
        return {
            activeMs: activeDays * MS_PER_DAY,
            dismissedMs: dismissedDays * MS_PER_DAY
        };
    }

    function normalizeMetaEntry(entry, nowMs) {
        const now = nowMs != null ? nowMs : Date.now();
        if (!entry || typeof entry !== 'object') {
            return { firstSeenAt: now, dismissedAt: null };
        }
        const firstSeenAt = Number(entry.firstSeenAt);
        const dismissedAt = entry.dismissedAt == null ? null : Number(entry.dismissedAt);
        return {
            firstSeenAt: Number.isFinite(firstSeenAt) && firstSeenAt > 0 ? firstSeenAt : now,
            dismissedAt: Number.isFinite(dismissedAt) && dismissedAt > 0 ? dismissedAt : null
        };
    }

    function getNotificationMeta(appData) {
        hooks.ensureUiState();
        const ui = appData && appData.ui;
        const merged = {};
        if (ui && ui.navNotificationMeta && typeof ui.navNotificationMeta === 'object') {
            Object.keys(ui.navNotificationMeta).forEach((key) => {
                const id = normalizeDismissedId(key);
                if (id) {
                    merged[id] = normalizeMetaEntry(ui.navNotificationMeta[key]);
                }
            });
        }
        return merged;
    }

    function persistNotificationMeta(appData, meta) {
        if (appData && appData.ui) {
            appData.ui.navNotificationMeta = meta;
            appData.ui.dismissedNavTabWarnings = Object.keys(meta).filter((id) => meta[id].dismissedAt != null);
        }
        if (typeof hooks.saveNavNotificationMeta === 'function') {
            hooks.saveNavNotificationMeta(meta);
        } else {
            hooks.saveUiStateToLocalStorage();
        }
    }

    function syncNotificationMetaForWarnings(appData, warnings) {
        const now = Date.now();
        const meta = getNotificationMeta(appData);
        const activeIds = new Set(warnings.map((w) => normalizeDismissedId(w.id)).filter(Boolean));
        let dirty = false;
        warnings.forEach((w) => {
            const id = normalizeDismissedId(w.id);
            if (!id) {
                return;
            }
            if (!meta[id]) {
                meta[id] = { firstSeenAt: now, dismissedAt: null };
                dirty = true;
            }
        });
        const canPrune =
            typeof hooks.canPruneNotificationMeta === 'function'
                ? hooks.canPruneNotificationMeta()
                : true;
        if (canPrune) {
            Object.keys(meta).forEach((id) => {
                if (activeIds.has(id)) {
                    return;
                }
                const entry = meta[id];
                if (entry && entry.dismissedAt != null) {
                    return;
                }
                delete meta[id];
                dirty = true;
            });
        }
        if (appData && appData.ui) {
            appData.ui.navNotificationMeta = meta;
            appData.ui.dismissedNavTabWarnings = Object.keys(meta).filter((id) => meta[id].dismissedAt != null);
        }
        if (dirty) {
            persistNotificationMeta(appData, meta);
        }
        return meta;
    }

    function isActiveBellEntry(entry, activeMs, nowMs) {
        const now = nowMs != null ? nowMs : Date.now();
        if (!entry || entry.dismissedAt != null) {
            return false;
        }
        return now - entry.firstSeenAt < activeMs;
    }

    function isHistoryBellEntry(entry, dismissedMs, nowMs) {
        const now = nowMs != null ? nowMs : Date.now();
        if (!entry || entry.dismissedAt == null) {
            return false;
        }
        return now - entry.dismissedAt < dismissedMs;
    }

    function invalidateNotificationSnapshot() {
        notificationSnapshot.valid = false;
    }

    function splitWarningsByBellState(all, meta) {
        const { activeMs, dismissedMs } = getTtlMs();
        const now = Date.now();
        const active = [];
        const history = [];
        all.forEach((w) => {
            const id = normalizeDismissedId(w.id);
            const entry = meta[id];
            if (isActiveBellEntry(entry, activeMs, now)) {
                active.push(w);
            } else if (isHistoryBellEntry(entry, dismissedMs, now)) {
                history.push(w);
            }
        });
        return { active, history };
    }

    function recomputeNotificationSnapshot() {
        const appData = hooks.getAppData();
        const ctx = hooks.getViewerContext();
        const all = dedupeWarningsById(collectTabWarnings(appData, ctx));
        cachedWarnings = all;
        const meta = syncNotificationMetaForWarnings(appData, all);
        const split = splitWarningsByBellState(all, meta);
        notificationSnapshot = {
            valid: true,
            all,
            active: split.active,
            history: split.history,
            meta,
            stamp: Date.now()
        };
        return notificationSnapshot;
    }

    function refreshNotificationSnapshotTtlSplit() {
        if (!notificationSnapshot.valid) {
            return recomputeNotificationSnapshot();
        }
        const split = splitWarningsByBellState(notificationSnapshot.all, notificationSnapshot.meta);
        notificationSnapshot.active = split.active;
        notificationSnapshot.history = split.history;
        notificationSnapshot.stamp = Date.now();
        return notificationSnapshot;
    }

    function ensureNotificationSnapshot() {
        if (!notificationSnapshot.valid) {
            recomputeNotificationSnapshot();
        }
        return notificationSnapshot;
    }

    function pushClassExtraWarnings(out, classData, ctx) {
        if (!classData || !classData.id || !classAppliesToViewer(classData.id, ctx)) {
            return;
        }
        const name = classData.name || '';
        if (hooks.classHasNoMeetingDaysWarning(classData)) {
            const warningBase = {
                id: `class:${classData.id}:no_meeting_days`,
                severity: 'warn',
                messageKey: 'tabWarnNoMeetingDays',
                params: { name },
                navigate: { type: 'class', classId: classData.id }
            };
            CLASS_TAB_IDS.forEach((tabId) => {
                out.push(Object.assign({}, warningBase, {
                    tabId,
                    navigate: { type: 'class', tabId, classId: classData.id }
                }));
            });
        }
        if (hooks.classNeedsDebateBookPeriodsWarning(classData)) {
            const warningBase = {
                id: `class:${classData.id}:debate_book_periods`,
                severity: 'warn',
                messageKey: 'tabWarnDebateBookPeriods',
                params: { name },
                navigate: { type: 'class', classId: classData.id }
            };
            CLASS_TAB_IDS.forEach((tabId) => {
                out.push(Object.assign({}, warningBase, {
                    tabId,
                    navigate: { type: 'class', tabId, classId: classData.id }
                }));
            });
        }
        const perfEvalWarnings = typeof hooks.getPerfEvalScheduleWarningsForClass === 'function'
            ? hooks.getPerfEvalScheduleWarningsForClass(classData)
            : [];
        (perfEvalWarnings || []).forEach((warningBase) => {
            CLASS_TAB_IDS.forEach((tabId) => {
                out.push(Object.assign({}, warningBase, {
                    tabId,
                    navigate: Object.assign({}, warningBase.navigate || {}, {
                        type: 'class',
                        tabId,
                        classId: classData.id
                    })
                }));
            });
        });
        const emptyCount = hooks.countClassEmptySyllabusLessons(classData);
        if (emptyCount > 0) {
            const warningBase = {
                id: `class:${classData.id}:empty_syllabus`,
                severity: 'warn',
                messageKey: 'tabWarnEmptySyllabus',
                params: { name, count: emptyCount },
                navigate: { type: 'class', tabId: 'syllabus', classId: classData.id }
            };
            out.push(Object.assign({}, warningBase, { tabId: 'syllabus' }));
        }
        if (typeof CCPTermDates !== 'undefined' && CCPTermDates.getTermDateRangeISO) {
            const appData = hooks.getAppData();
            const termRange = CCPTermDates.getTermDateRangeISO(appData, {
                defaultTermCalendarMonths: 3,
                minTermMonthCount: 3,
                maxTermMonthCount: 6
            });
            const clsStart = String(classData.startDate || '').trim();
            const clsEnd = String(classData.endDate || '').trim();
            if (termRange.start && termRange.end && clsStart && clsEnd
                && (clsStart < termRange.start || clsEnd > termRange.end)) {
                const warningBase = {
                    id: `class:${classData.id}:outside_term`,
                    severity: 'warn',
                    messageKey: 'tabWarnClassOutsideTerm',
                    params: {
                        name,
                        start: clsStart,
                        end: clsEnd,
                        termStart: termRange.start,
                        termEnd: termRange.end
                    },
                    navigate: { type: 'class', classId: classData.id }
                };
                CLASS_TAB_IDS.forEach((tabId) => {
                    out.push(Object.assign({}, warningBase, {
                        tabId,
                        navigate: { type: 'class', tabId, classId: classData.id }
                    }));
                });
            }
        }
    }

    function pushCohortWarningsForCohort(out, cohort, appData, cohortApi) {
        if (!cohort || !cohort.id || !cohortApi || !cohortApi.collectCohortSetupWarnings) {
            return;
        }
        cohortApi.collectCohortSetupWarnings(cohort, appData).forEach((w) => {
            if (w.severity === 'info') {
                return;
            }
            const suffix = w.classId ? `:${w.classId}` : '';
            out.push({
                id: `cohorts:${cohort.id}:${w.code}${suffix}`,
                tabId: 'cohorts',
                severity: w.severity || 'warn',
                messageKey: w.messageKey,
                params: Object.assign({ cohort: cohort.name || '' }, w.params || {}),
                navigate: { type: 'cohort', cohortId: cohort.id, classId: w.classId || '' }
            });
        });
    }

    function formatMessage(warning) {
        let text = hooks.t(warning.messageKey);
        const params = warning.params || {};
        Object.keys(params).forEach((key) => {
            text = text.replace(new RegExp('\\{' + key + '\\}', 'g'), String(params[key]));
        });
        return text;
    }

    function normalizeDismissedId(id) {
        if (typeof id !== 'string' || !id) {
            return '';
        }
        if (id === 'calendar:term:not_set' || id === 'events:term:not_set') {
            return 'term:not_set';
        }
        const legacyClass = id.match(/^(classes|syllabus):([^:]+):(.+)$/);
        if (legacyClass) {
            return `class:${legacyClass[2]}:${legacyClass[3]}`;
        }
        return id;
    }

    function classAppliesToViewer(classId, ctx) {
        if (!classId) {
            return false;
        }
        if (ctx.isAdmin) {
            return true;
        }
        if (!ctx.viewerClassIds || !ctx.viewerClassIds.length) {
            return false;
        }
        return ctx.viewerClassIds.includes(classId);
    }

    function pushClassWarnings(out, classData, ctx) {
        if (!classData || !classData.id || !classAppliesToViewer(classData.id, ctx)) {
            return;
        }
        const gap = hooks.getClassScheduleGapStatus(classData);
        if (gap.incomplete) {
            const warningBase = {
                id: `class:${classData.id}:schedule_gap`,
                severity: 'warn',
                messageKey: 'scheduleGapWarning',
                params: {
                    name: classData.name || '',
                    unplaced: gap.unplacedLessonNumbers.length,
                    total: gap.totalLessons
                },
                navigate: { type: 'class', classId: classData.id }
            };
            CLASS_TAB_IDS.forEach((tabId) => {
                out.push(Object.assign({}, warningBase, {
                    tabId,
                    navigate: { type: 'class', tabId, classId: classData.id }
                }));
            });
        }
        const curWarn = hooks.getClassCurriculumWarningKindForClass(classData);
        if (curWarn) {
            const warningBase = {
                id: `class:${classData.id}:curriculum:${curWarn}`,
                severity: 'warn',
                messageKey: curWarn === 'missing' ? 'classCurriculumWarningListMissing' : 'classCurriculumWarningList',
                params: {},
                navigate: { type: 'class', classId: classData.id }
            };
            CLASS_TAB_IDS.forEach((tabId) => {
                out.push(Object.assign({}, warningBase, {
                    tabId,
                    navigate: { type: 'class', tabId, classId: classData.id }
                }));
            });
        }
    }

    function collectTabWarnings(appData, viewerContext) {
        const ctx = viewerContext || hooks.getViewerContext();
        const warnings = [];
        if (!appData) {
            return warnings;
        }

        if (ctx.isSetupHost && !appData.termStart) {
            ['calendar', 'events'].forEach((tabId) => {
                warnings.push({
                    id: 'term:not_set',
                    tabId,
                    severity: 'warn',
                    messageKey: 'tabWarnTermNotSet',
                    params: {},
                    navigate: { type: 'term' }
                });
            });
        }

        hooks.getClassesInDisplayOrder().forEach((cls) => {
            pushClassWarnings(warnings, cls, ctx);
            pushClassExtraWarnings(warnings, cls, ctx);
        });

        const cohortApi = hooks.getTimetableApi();
        if (ctx.isAdmin) {
            const cohorts = Array.isArray(appData.cohorts) ? appData.cohorts : [];
            cohorts.forEach((cohort) => {
                pushCohortWarningsForCohort(warnings, cohort, appData, cohortApi);
            });
        } else if (ctx.viewerSelector && cohortApi && cohortApi.getHomeroomCohortsForTeacher) {
            cohortApi.getHomeroomCohortsForTeacher(appData, ctx.viewerSelector).forEach((cohort) => {
                pushCohortWarningsForCohort(warnings, cohort, appData, cohortApi);
            });
        }

        const ttApi = cohortApi;
        if (ttApi && ttApi.buildTeacherWeeklyGrid) {
            const teachers = ctx.isAdmin
                ? hooks.listTimetableTeachers()
                : (ctx.viewerSelector ? [ctx.viewerSelector] : []);
            teachers.forEach((teacher) => {
                if (!teacher || (!teacher.userId && !teacher.displayName)) {
                    return;
                }
                const grid = ttApi.buildTeacherWeeklyGrid(appData, teacher, { lang: 'en' });
                if (grid && grid.hasConflicts) {
                    const uid = teacher.userId || teacher.displayName || 'unknown';
                    const count = grid.conflicts ? grid.conflicts.conflictCount : 1;
                    warnings.push({
                        id: `timetable:${uid}:conflicts`,
                        tabId: 'timetable',
                        severity: 'warn',
                        messageKey: 'tabWarnTimetableConflicts',
                        params: {
                            teacher: grid.teacherName || teacher.displayName || uid,
                            count
                        },
                        navigate: { type: 'timetable', userId: teacher.userId || '', displayName: teacher.displayName || '' }
                    });
                }
            });
        }

        if (ctx.isCurriculumManager && global.CCPBooksEditor && global.CCPBooksEditor.bookHasSessionCountMismatch) {
            const books = global.CCPBooksEditor.discoverBooks
                ? global.CCPBooksEditor.discoverBooks(appData)
                : [];
            books.forEach((book) => {
                if (!book || !book.id) {
                    return;
                }
                if (!global.CCPBooksEditor.bookHasSessionCountMismatch(book.id, appData)) {
                    return;
                }
                const rows = global.CCPBooksEditor.getTemplatesForBookId
                    ? global.CCPBooksEditor.getTemplatesForBookId(book.id, appData)
                    : [];
                const baselineCount = book.baselineSessionCount != null
                    ? book.baselineSessionCount
                    : (global.CCPBooksEditor.getEffectiveSessionBaselineCount
                        ? global.CCPBooksEditor.getEffectiveSessionBaselineCount(book.id, appData, book.factorySessionCount)
                        : book.factorySessionCount);
                warnings.push({
                    id: `curriculum:${book.id}:session_mismatch`,
                    tabId: 'curriculum',
                    severity: 'warn',
                    messageKey: 'booksEditorSessionCountWarn',
                    params: {
                        n: rows.length,
                        factory: baselineCount
                    },
                    navigate: { type: 'curriculum', curriculumId: book.id }
                });
            });
        }

        if (typeof hooks.getSyncNavWarningsForBell === 'function') {
            hooks.getSyncNavWarningsForBell().forEach((w) => warnings.push(w));
        }

        if (typeof hooks.getUiInboxWarningsForBell === 'function') {
            hooks.getUiInboxWarningsForBell().forEach((w) => warnings.push(w));
        }

        return warnings;
    }

    function getNavVisibleWarnings(tabId) {
        const visible = getActiveNotifications();
        if (tabId) {
            return visible.filter((w) => w.tabId === tabId);
        }
        return visible;
    }

    function dedupeWarningsById(warnings) {
        const seen = new Set();
        const out = [];
        warnings.forEach((w) => {
            if (seen.has(w.id)) {
                return;
            }
            seen.add(w.id);
            out.push(w);
        });
        return out;
    }

    function getWarningsForTab(tabId) {
        const appData = hooks.getAppData();
        const ctx = hooks.getViewerContext();
        return collectTabWarnings(appData, ctx).filter((w) => w.tabId === tabId);
    }

    function resolvePopoverAnchorContext(btn) {
        if (!btn) {
            return { zone: null, segment: null, tabId: null };
        }
        let zone = btn.dataset.zone || null;
        const segment = btn.dataset.segment || null;
        if (!zone) {
            const panel = btn.closest('.app-zone-segment-panel');
            zone = panel && panel.dataset.zone ? panel.dataset.zone : null;
        }
        let tabId = null;
        if (zone && segment) {
            tabId = hooks.getTabIdForZoneSegment(zone, segment);
        }
        return { zone, segment, tabId };
    }

    function getAllCurrentWarnings() {
        return ensureNotificationSnapshot().all.slice();
    }

    function getActiveNotifications() {
        return ensureNotificationSnapshot().active.slice();
    }

    function getHistoryNotifications() {
        return ensureNotificationSnapshot().history.slice();
    }

    function getPopoverVisibleWarnings() {
        return getActiveNotifications();
    }

    function getClassWarningFlags(classData) {
        const ctx = hooks.getViewerContext();
        if (!classData || !classAppliesToViewer(classData.id, ctx)) {
            return { scheduleGap: false, curriculumWarn: null };
        }
        const gap = hooks.getClassScheduleGapStatus(classData);
        return {
            scheduleGap: !!gap.incomplete,
            curriculumWarn: hooks.getClassCurriculumWarningKindForClass(classData)
        };
    }

    function clearNavTabBadges() {
        /* Nav tab badges retired — notifications use header bell only. */
    }

    function updateNavBadges() {
        clearNavTabBadges();
    }

    function updateLockBarRowVisibility(activeCount, historyCount) {
        const row = document.getElementById('teamLockSyncBar') || document.getElementById('teamLockBarRow');
        const lock = document.getElementById('teamLockStatus');
        if (!row) {
            return;
        }
        const lockVisible = lock && !lock.hidden;
        const hasNotifications = activeCount > 0 || historyCount > 0;
        row.hidden = false;
    }

    function updateLockBarNotificationsFromSnapshot(snap) {
        const snapshot = snap || ensureNotificationSnapshot();
        const activeCount = snapshot.active.length;
        const historyCount = snapshot.history.length;

        updateLockBarRowVisibility(activeCount, historyCount);

        const btn = document.getElementById('appWarningsBtn');
        const countEl = document.getElementById('appWarningsCount');
        const notifyWrap = document.getElementById('appWarningsNotify');
        if (!btn || !notifyWrap) {
            return;
        }

        const lock = document.getElementById('teamLockStatus');
        const lockVisible = lock && !lock.hidden;
        notifyWrap.hidden = !lockVisible && activeCount === 0 && historyCount === 0;
        btn.hidden = notifyWrap.hidden;

        if (countEl) {
            countEl.textContent = activeCount > 9 ? '9+' : String(activeCount);
            countEl.hidden = activeCount === 0;
        }

        let ariaLabel = hooks.t('appNotificationsBtnAriaEmpty');
        if (activeCount > 0) {
            ariaLabel = hooks.t('appNotificationsBtnAria').replace('{count}', String(activeCount));
        } else if (historyCount > 0) {
            ariaLabel = hooks.t('appNotificationsBtnAriaHistory').replace('{count}', String(historyCount));
        }
        btn.setAttribute('aria-label', ariaLabel);
    }

    function updateLockBarNotifications() {
        updateLockBarNotificationsFromSnapshot(ensureNotificationSnapshot());
    }

    function openLockBarWarningsPopover() {
        const btn = document.getElementById('appWarningsBtn');
        if (!btn || btn.hidden) {
            return;
        }
        const popover = document.getElementById('tabWarningsPopover');
        if (popoverAnchor === btn && popover && !popover.hidden) {
            closeNavWarningsPopover();
            return;
        }
        openNavWarningsPopover(btn, null, null, null);
    }

    function setWarningsBtnExpanded(expanded) {
        const btn = document.getElementById('appWarningsBtn');
        if (btn) {
            btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        }
    }

    function openPopoverForActiveWarning(warningId) {
        const normalizedId = normalizeDismissedId(warningId);
        if (!normalizedId) {
            return;
        }
        const snap = ensureNotificationSnapshot();
        const isActive = snap.active.some((w) => normalizeDismissedId(w.id) === normalizedId);
        if (!isActive) {
            return;
        }
        openLockBarWarningsPopover();
    }

    function navigateWarning(warning) {
        if (!warning || !warning.navigate) {
            return;
        }
        const nav = warning.navigate;
        closeNavWarningsPopover();
        if (nav.type === 'term') {
            hooks.navigateToZone('classes', 'events');
            requestAnimationFrame(() => {
                const termStart = document.getElementById('termStart');
                if (termStart) {
                    termStart.focus();
                }
            });
            return;
        }
        if (nav.type === 'class') {
            if (typeof hooks.clearActiveCohortFilter === 'function') {
                hooks.clearActiveCohortFilter('notification-class-nav');
            }
            hooks.navigateToTab(nav.tabId || 'classes', { classId: nav.classId });
            const cls = hooks.getAppData().classes.find((c) => c.id === nav.classId);
            if (cls && nav.tabId === 'classes') {
                hooks.openClassEditor(cls, 'tab');
            }
            if (warning.id.includes('schedule_gap') || (nav && nav.perfEvalCompress)) {
                if (nav.perfEvalCompress && typeof hooks.previewPerfEvalCloseCompression === 'function') {
                    hooks.previewPerfEvalCloseCompression(nav.classId, {
                        periodId: nav.periodId || '',
                        closeDate: nav.closeDate || ''
                    });
                } else {
                    hooks.focusScheduleAdjustmentForClass(nav.classId);
                }
            }
            return;
        }
        if (nav.type === 'cohort') {
            const appData = hooks.getAppData();
            if (appData.ui) {
                appData.ui.cohortsTabSelectedId = nav.cohortId || '';
            }
            hooks.saveUiStateToLocalStorage();
            hooks.navigateToTab('cohorts', nav.classId ? { classId: nav.classId } : {});
            return;
        }
        if (nav.type === 'timetable') {
            const appData = hooks.getAppData();
            if (appData.ui) {
                appData.ui.timetableTabTeacherUserId = nav.userId || '';
                appData.ui.timetableTabTeacherName = nav.displayName || '';
            }
            hooks.saveUiStateToLocalStorage();
            hooks.navigateToTab('timetable');
            return;
        }
        if (nav.type === 'curriculum') {
            hooks.navigateToTab('curriculum', { curriculumId: nav.curriculumId });
            return;
        }
        if (nav.type === 'day_note') {
            if (typeof hooks.focusDayNoteInNotesTab === 'function') {
                hooks.focusDayNoteInNotesTab({
                    noteId: nav.noteId,
                    classId: nav.classId,
                    date: nav.date
                });
            }
            return;
        }
        if (nav.type === 'remote_reload') {
            if (typeof hooks.reloadActiveCalendarFromServer === 'function') {
                hooks.reloadActiveCalendarFromServer();
            }
            return;
        }
        if (nav.type === 'pending_suggestions') {
            const user = typeof TeamAuth !== 'undefined' && TeamAuth.getUser ? TeamAuth.getUser() : null;
            if (user && user.role === 'admin') {
                global.location.href = 'admin.html';
            } else if (typeof hooks.showNavWarningToast === 'function') {
                hooks.showNavWarningToast(hooks.t('tabWarnPendingSuggestionsAction'));
            }
            hooks.navigateToTab('data');
            return;
        }
        if (nav.type === 'setup_guide') {
            hooks.navigateToZone('classes', 'cohorts');
            return;
        }
        if (nav.type === 'setup_checklist') {
            if (nav.zone && nav.segment) {
                hooks.navigateToZone(nav.zone, nav.segment);
            }
            return;
        }
        if (nav.type === 'curriculum_syllabi_update') {
            if (typeof hooks.runCurriculumSyllabiBatchUpdate === 'function') {
                hooks.runCurriculumSyllabiBatchUpdate(nav.curriculumId);
            }
            return;
        }
        if (nav.type === 'event_syllabi_update') {
            if (typeof hooks.runEventSyllabiBatchUpdate === 'function') {
                hooks.runEventSyllabiBatchUpdate(nav.eventId);
            }
            return;
        }
        if (nav.type === 'debate_book_check') {
            if (typeof hooks.clearActiveCohortFilter === 'function') {
                hooks.clearActiveCohortFilter('notification-debate-book-check');
            }
            hooks.navigateToTab('debate-books', {
                classId: nav.classId || '',
                focusStudentId: nav.studentId || ''
            });
        }
    }

    function dismissNavWarning(warningId) {
        const appData = hooks.getAppData();
        hooks.ensureUiState();
        const normalizedId = normalizeDismissedId(warningId);
        if (!normalizedId) {
            return;
        }
        const meta = getNotificationMeta(appData);
        const now = Date.now();
        if (!meta[normalizedId]) {
            meta[normalizedId] = { firstSeenAt: now, dismissedAt: now };
        } else {
            meta[normalizedId].dismissedAt = now;
        }
        persistNotificationMeta(appData, meta);
        if (typeof hooks.persistNotificationDismissals === 'function') {
            hooks.persistNotificationDismissals([normalizedId], now);
        }
        if (typeof hooks.onNotificationDismissed === 'function') {
            hooks.onNotificationDismissed(normalizedId);
        }
        invalidateNotificationSnapshot();
        recomputeNotificationSnapshot();
        clearNavTabBadges();
        updateLockBarNotificationsFromSnapshot();
        if (popoverAnchor) {
            renderPopoverList();
        }
    }

    function dismissAllNavWarnings() {
        const snap = ensureNotificationSnapshot();
        const warnings = snap.active.slice();
        if (!warnings.length) {
            closeNavWarningsPopover();
            return;
        }
        const appData = hooks.getAppData();
        hooks.ensureUiState();
        const meta = getNotificationMeta(appData);
        const now = Date.now();
        warnings.forEach((w) => {
            const id = normalizeDismissedId(w.id);
            if (!id) {
                return;
            }
            if (!meta[id]) {
                meta[id] = { firstSeenAt: now, dismissedAt: now };
            } else {
                meta[id].dismissedAt = now;
            }
        });
        const dismissedIds = warnings
            .map((w) => normalizeDismissedId(w.id))
            .filter(Boolean);
        persistNotificationMeta(appData, meta);
        if (typeof hooks.persistNotificationDismissals === 'function' && dismissedIds.length) {
            hooks.persistNotificationDismissals(dismissedIds, now);
        }
        if (typeof hooks.onNotificationDismissed === 'function') {
            dismissedIds.forEach((id) => hooks.onNotificationDismissed(id));
        }
        invalidateNotificationSnapshot();
        recomputeNotificationSnapshot();
        clearNavTabBadges();
        updateLockBarNotificationsFromSnapshot();
        renderPopoverList();
    }

    function createWarningListItem(warning, options) {
        const opts = options || {};
        const li = document.createElement('li');
        li.className = 'tab-warnings-item' + (opts.isHistory ? ' tab-warnings-item--history' : '');

        const msgRow = document.createElement('div');
        msgRow.className = 'tab-warnings-item-head';

        const msg = document.createElement('p');
        msg.className = 'tab-warnings-item-msg';
        msg.textContent = formatMessage(warning);
        msgRow.appendChild(msg);

        if (opts.isHistory) {
            const badge = document.createElement('span');
            badge.className = 'tab-warnings-history-badge';
            badge.textContent = hooks.t('tabWarningsHistoryBadge');
            msgRow.appendChild(badge);
        }

        const actions = document.createElement('div');
        actions.className = 'tab-warnings-item-actions';
        const goBtn = document.createElement('button');
        goBtn.type = 'button';
        goBtn.className = 'btn btn-outline btn-small';
        goBtn.textContent = hooks.t(warning.actionLabelKey || 'tabWarningsGo');
        goBtn.addEventListener('click', () => navigateWarning(warning));
        actions.appendChild(goBtn);

        if (!opts.isHistory) {
            const dismissBtn = document.createElement('button');
            dismissBtn.type = 'button';
            dismissBtn.className = 'btn btn-outline btn-small';
            dismissBtn.textContent = hooks.t('tabWarningsDismiss');
            dismissBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dismissNavWarning(warning.id);
            });
            actions.appendChild(dismissBtn);
        }

        li.appendChild(msgRow);
        li.appendChild(actions);
        return li;
    }

    function renderPopoverList() {
        const popover = document.getElementById('tabWarningsPopover');
        const activeSection = document.getElementById('tabWarningsActiveSection');
        const historySection = document.getElementById('tabWarningsHistorySection');
        const activeList = document.getElementById('tabWarningsActiveList');
        const historyList = document.getElementById('tabWarningsHistoryList');
        const emptyEl = document.getElementById('tabWarningsEmpty');
        if (!popover || !activeList || !historyList) {
            return;
        }

        const snap = ensureNotificationSnapshot();
        const active = snap.active;
        const history = snap.history;
        const dismissAllBtn = document.getElementById('tabWarningsDismissAll');
        if (dismissAllBtn) {
            dismissAllBtn.hidden = !active.length;
        }

        activeList.innerHTML = '';
        historyList.innerHTML = '';

        active.forEach((warning) => {
            activeList.appendChild(createWarningListItem(warning, { isHistory: false }));
        });
        history.forEach((warning) => {
            historyList.appendChild(createWarningListItem(warning, { isHistory: true }));
        });

        if (activeSection) {
            activeSection.hidden = !active.length;
        }
        if (historySection) {
            historySection.hidden = !history.length;
        }
        if (emptyEl) {
            emptyEl.hidden = active.length > 0 || history.length > 0;
        }
    }

    function positionPopover(anchor, popover) {
        const rect = anchor.getBoundingClientRect();
        const margin = 8;
        const gap = 6;
        const viewportH = global.innerHeight || document.documentElement.clientHeight;
        const viewportW = global.innerWidth || document.documentElement.clientWidth;
        const spaceBelow = viewportH - rect.bottom - margin;
        const spaceAbove = rect.top - margin;
        const preferBelow = spaceBelow >= spaceAbove;
        const available = Math.max(120, preferBelow ? spaceBelow - gap : spaceAbove - gap);
        const maxHeight = Math.min(available, viewportH - margin * 2);

        popover.style.position = 'fixed';
        popover.style.maxHeight = `${Math.round(maxHeight)}px`;
        popover.style.left = `${Math.round(Math.max(margin, Math.min(rect.left, viewportW - margin - popover.offsetWidth)))}px`;
        popover.style.right = 'auto';
        popover.style.zIndex = getComputedStyle(document.documentElement).getPropertyValue('--z-tab-warnings').trim() || '950';

        popover.hidden = false;
        const popoverHeight = popover.offsetHeight;
        let top = preferBelow ? rect.bottom + gap : rect.top - gap - popoverHeight;
        top = Math.max(margin, Math.min(top, viewportH - margin - popoverHeight));
        popover.style.top = `${Math.round(top)}px`;
    }

    function openNavWarningsPopover(anchor, tabId, zoneId, segmentId) {
        const popover = document.getElementById('tabWarningsPopover');
        if (!popover || !anchor) {
            return;
        }
        if (popoverAnchor === anchor && !popover.hidden) {
            closeNavWarningsPopover();
            return;
        }
        popoverAnchor = anchor;
        popoverTabId = tabId || null;
        popoverZoneId = zoneId || null;
        popoverSegmentId = segmentId || null;
        if (popover.parentElement !== document.body) {
            document.body.appendChild(popover);
        }
        renderPopoverList();
        popover.hidden = false;
        positionPopover(anchor, popover);
        if (anchor.id === 'appWarningsBtn') {
            setWarningsBtnExpanded(true);
        }
    }

    function closeNavWarningsPopover() {
        const popover = document.getElementById('tabWarningsPopover');
        if (popover) {
            popover.hidden = true;
        }
        setWarningsBtnExpanded(false);
        popoverAnchor = null;
        popoverTabId = null;
        popoverZoneId = null;
        popoverSegmentId = null;
    }

    function refreshAll() {
        recomputeNotificationSnapshot();
        clearNavTabBadges();
        updateLockBarNotificationsFromSnapshot();
    }

    function renderPersistentTabWarnings() {
        refreshAll();
    }

    let pendingOpenPopoverWarningId = null;

    function scheduleRefresh(options) {
        const opts = options || {};
        if (opts.openPopoverForWarningId) {
            pendingOpenPopoverWarningId = opts.openPopoverForWarningId;
        }
        if (refreshTimer) {
            clearTimeout(refreshTimer);
        }
        refreshTimer = setTimeout(() => {
            refreshTimer = null;
            const openId = pendingOpenPopoverWarningId;
            pendingOpenPopoverWarningId = null;
            invalidateNotificationSnapshot();
            refreshAll();
            if (openId) {
                openPopoverForActiveWarning(openId);
            }
        }, 150);
    }

    function scheduleDeferredRefresh() {
        const run = () => {
            const canPrune =
                typeof hooks.canPruneNotificationMeta === 'function'
                    ? hooks.canPruneNotificationMeta()
                    : true;
            if (!canPrune) {
                global.setTimeout(scheduleDeferredRefresh, 200);
                return;
            }
            refreshAll();
        };
        if (typeof global.requestIdleCallback === 'function') {
            global.requestIdleCallback(run, { timeout: 500 });
        } else {
            global.setTimeout(run, 0);
        }
    }

    function bindPopoverUi() {
        if (bound) {
            return;
        }
        bound = true;
        document.addEventListener('click', (e) => {
            const popover = document.getElementById('tabWarningsPopover');
            if (!popover || popover.hidden) {
                return;
            }
            if (popover.contains(e.target) || (popoverAnchor && popoverAnchor.contains(e.target))) {
                return;
            }
            closeNavWarningsPopover();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeNavWarningsPopover();
            }
        });
        window.addEventListener('resize', () => {
            if (popoverAnchor) {
                const popover = document.getElementById('tabWarningsPopover');
                if (popover && !popover.hidden) {
                    positionPopover(popoverAnchor, popover);
                }
            }
        });
        const dismissAllBtn = document.getElementById('tabWarningsDismissAll');
        if (dismissAllBtn) {
            dismissAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dismissAllNavWarnings();
            });
        }
        const lockBarBtn = document.getElementById('appWarningsBtn');
        if (lockBarBtn) {
            lockBarBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openLockBarWarningsPopover();
            });
        }
    }

    function startTtlRefreshTimer() {
        if (ttlRefreshTimer) {
            return;
        }
        ttlRefreshTimer = global.setInterval(() => {
            refreshNotificationSnapshotTtlSplit();
            updateLockBarNotificationsFromSnapshot();
            if (popoverAnchor) {
                renderPopoverList();
            }
        }, 60000);
    }

    function init(nextHooks) {
        Object.assign(hooks, nextHooks || {});
        bindPopoverUi();
        startTtlRefreshTimer();
        scheduleDeferredRefresh();
    }

    global.CCPTabWarnings = {
        init,
        collectTabWarnings,
        getNavVisibleWarnings,
        getWarningsForTab,
        getClassWarningFlags,
        updateNavBadges,
        clearNavTabBadges,
        updateLockBarNotifications,
        renderPersistentTabWarnings,
        openNavWarningsPopover,
        openLockBarWarningsPopover,
        openPopoverForActiveWarning,
        closeNavWarningsPopover,
        dismissNavWarning,
        dismissAllNavWarnings,
        scheduleRefresh,
        refreshAll
    };
})(typeof window !== 'undefined' ? window : globalThis);
