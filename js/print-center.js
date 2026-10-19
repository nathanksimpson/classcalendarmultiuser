/**
 * Print Center (header Print → #printCenterModal) and Data → Import & export index.
 * window.CCPPrintCenter, window.CCPDataTransfer
 *
 * Feature modules are lazy-loaded per tab, so the defaults below do not call their
 * print code directly: `openVia` opens the owning tab, waits for it, then clicks the
 * tab's own button. A module may `register()` the same id later to supply a richer run.
 */
(function (global) {
    const PRINT_GROUPS = ['schedule', 'classes', 'classroom', 'tools', 'term'];
    const PRINT_GROUP_LABEL_KEYS = {
        thisTab: 'printCenterGroupThisTab',
        schedule: 'printCenterGroupSchedule',
        classes: 'printCenterGroupClasses',
        classroom: 'printCenterGroupClassroom',
        tools: 'printCenterGroupTools',
        term: 'printCenterGroupTerm'
    };
    const TARGET_WAIT_MS = 2500;
    const HIGHLIGHT_MS = 2000;
    const HIGHLIGHT_CLASS = 'data-io-highlight';

    let hooks = {};
    const entries = new Map();

    function t(key) {
        return typeof hooks.t === 'function' ? hooks.t(key) : key;
    }

    function escapeHtml(value) {
        if (typeof hooks.escapeHtml === 'function') {
            return hooks.escapeHtml(value);
        }
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function hasActiveClass() {
        return Boolean(typeof hooks.getActiveClassId === 'function' && hooks.getActiveClassId());
    }

    function activeClassUsesDebate() {
        if (!hasActiveClass() || typeof hooks.classUsesDebate !== 'function') {
            return false;
        }
        return Boolean(hooks.classUsesDebate(hooks.getActiveClassId()));
    }

    function canAccess(zoneId, segmentId) {
        return typeof hooks.canAccessSegment === 'function' ? hooks.canAccessSegment(zoneId, segmentId) : true;
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /** `target` is an element id, or a CSS selector when it starts with `#`, `.` or `[`. */
    function findTarget(target) {
        if (typeof document === 'undefined' || !target) {
            return null;
        }
        if (/^[#.[]/.test(target)) {
            return document.querySelector(target);
        }
        return document.getElementById(target);
    }

    async function waitForTarget(target) {
        const started = Date.now();
        let el = findTarget(target);
        while (!el && Date.now() - started < TARGET_WAIT_MS) {
            await sleep(60);
            el = findTarget(target);
        }
        return el;
    }

    async function navigate(zoneId, segmentId) {
        if (typeof hooks.navigateToZone === 'function') {
            await hooks.navigateToZone(zoneId, segmentId);
        }
    }

    function notifyOpenedTab() {
        if (typeof hooks.showToast === 'function') {
            hooks.showToast(t('printCenterOpenedTab'), false);
        }
    }

    /** Run helper: open the owning tab, then click its existing control. */
    function openVia(zoneId, segmentId, target) {
        const run = async () => {
            await navigate(zoneId, segmentId);
            const el = await waitForTarget(target);
            if (!el || el.disabled) {
                notifyOpenedTab();
                return;
            }
            el.click();
        };
        run.via = { zone: zoneId, segment: segmentId, target };
        return run;
    }

    function normalizeEntry(entry) {
        if (!entry || typeof entry !== 'object' || !entry.id) {
            throw new Error('CCPPrintCenter.register: entry.id is required');
        }
        if (!PRINT_GROUPS.includes(entry.group)) {
            throw new Error(`CCPPrintCenter.register: unknown group "${entry.group}" for ${entry.id}`);
        }
        if (typeof entry.run !== 'function') {
            throw new Error(`CCPPrintCenter.register: run() is required for ${entry.id}`);
        }
        return {
            id: String(entry.id),
            group: entry.group,
            labelKey: entry.labelKey || entry.id,
            tabs: Array.isArray(entry.tabs) ? entry.tabs.slice() : [],
            available: typeof entry.available === 'function' ? entry.available : () => true,
            unavailableKey: entry.unavailableKey || 'printCenterNeedsClass',
            run: entry.run,
            via: entry.via || entry.run.via || null
        };
    }

    function register(entry) {
        const normalized = normalizeEntry(entry);
        entries.set(normalized.id, normalized);
        return normalized;
    }

    function unregister(id) {
        return entries.delete(String(id || ''));
    }

    function isAvailable(entry) {
        try {
            return Boolean(entry.available());
        } catch (_) {
            return false;
        }
    }

    /** All entries; those whose `tabs` include `activeTab` come first, then group order. */
    function list(activeTab) {
        const tab = activeTab || (typeof hooks.getActiveTab === 'function' ? hooks.getActiveTab() : '');
        const all = Array.from(entries.values());
        const byGroup = (a, b) => PRINT_GROUPS.indexOf(a.group) - PRINT_GROUPS.indexOf(b.group);
        const current = all.filter((e) => tab && e.tabs.includes(tab));
        const rest = all.filter((e) => !current.includes(e)).sort(byGroup);
        return current.concat(rest).map((e) => Object.assign({}, e, { isAvailable: isAvailable(e) }));
    }

    function buildSections(activeTab) {
        const tab = activeTab || (typeof hooks.getActiveTab === 'function' ? hooks.getActiveTab() : '');
        const items = list(tab);
        const thisTab = items.filter((e) => tab && e.tabs.includes(tab));
        const sections = [];
        if (thisTab.length) {
            sections.push({ id: 'thisTab', entries: thisTab });
        }
        PRINT_GROUPS.forEach((group) => {
            const groupEntries = items.filter((e) => e.group === group && !thisTab.includes(e));
            if (groupEntries.length) {
                sections.push({ id: group, entries: groupEntries });
            }
        });
        return sections;
    }

    function describeLocation(zoneId, segmentId) {
        if (typeof document === 'undefined' || !zoneId) {
            return '';
        }
        const zoneBtn = document.querySelector(`.app-zone-btn[data-zone="${zoneId}"]`);
        const segBtn = segmentId
            ? document.querySelector(`.app-zone-segment-btn[data-tab="${segmentId}"]`)
            : null;
        const zoneLabel = zoneBtn ? (zoneBtn.textContent || '').trim() : '';
        const segLabel = segBtn ? (segBtn.textContent || '').trim() : '';
        if (zoneLabel && segLabel && zoneLabel !== segLabel) {
            return `${zoneLabel} · ${segLabel}`;
        }
        return zoneLabel || segLabel;
    }

    function buildRowHtml({ label, hint, buttonLabel, dataAttr, id, disabled }) {
        return `<li class="print-center-row">
            <span class="print-center-row__text">
                <span class="print-center-row__label">${escapeHtml(label)}</span>
                ${hint ? `<span class="section-hint print-center-row__hint">${escapeHtml(hint)}</span>` : ''}
            </span>
            <button type="button" class="btn btn-outline btn-small print-center-row__btn" ${dataAttr}="${escapeHtml(id)}"${disabled ? ' disabled' : ''}>${escapeHtml(buttonLabel)}</button>
        </li>`;
    }

    function renderList(mount, activeTab) {
        if (!mount) {
            return;
        }
        const sections = buildSections(activeTab);
        mount.innerHTML = sections
            .map((section) => {
                const rows = section.entries
                    .map((entry) => {
                        const via = entry.via;
                        const hint = entry.isAvailable
                            ? (via ? describeLocation(via.zone, via.segment) : '')
                            : t(entry.unavailableKey);
                        return buildRowHtml({
                            label: t(entry.labelKey),
                            hint,
                            buttonLabel: t('printBtn'),
                            dataAttr: 'data-print-entry',
                            id: entry.id,
                            disabled: !entry.isAvailable
                        });
                    })
                    .join('');
                return `<section class="print-center-group" aria-label="${escapeHtml(t(PRINT_GROUP_LABEL_KEYS[section.id]))}">
                    <h3 class="lesson-filter-section-title print-center-group__title">${escapeHtml(t(PRINT_GROUP_LABEL_KEYS[section.id]))}</h3>
                    <ul class="print-center-rows">${rows}</ul>
                </section>`;
            })
            .join('');
    }

    async function runEntry(id) {
        const entry = entries.get(id);
        if (!entry || !isAvailable(entry)) {
            return;
        }
        close();
        try {
            await entry.run();
        } catch (err) {
            console.error(`Print Center entry "${id}" failed`, err);
        }
    }

    function getModal() {
        return typeof document !== 'undefined' ? document.getElementById('printCenterModal') : null;
    }

    function bindModal(modal) {
        if (!modal || modal.dataset.printCenterBound === '1') {
            return;
        }
        modal.dataset.printCenterBound = '1';
        modal.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-print-entry]');
            if (btn && !btn.disabled) {
                void runEntry(btn.getAttribute('data-print-entry'));
            }
        });
        modal.querySelector('#closePrintCenterModal')?.addEventListener('click', () => close());
        modal.querySelector('#printCenterPlannerLink')?.addEventListener('click', () => {
            close();
            if (typeof hooks.openPlanner === 'function') {
                hooks.openPlanner();
            }
        });
    }

    function open(triggerEl) {
        const modal = getModal();
        if (!modal) {
            return;
        }
        bindModal(modal);
        renderList(modal.querySelector('#printCenterList'));
        if (typeof hooks.openModal === 'function') {
            hooks.openModal(modal, triggerEl);
        }
    }

    function close() {
        const modal = getModal();
        if (modal && typeof hooks.closeModal === 'function') {
            hooks.closeModal(modal);
        }
    }

    function init(nextHooks) {
        hooks = Object.assign({}, hooks, nextHooks || {});
    }

    function registerDefaults() {
        const needsClass = () => hasActiveClass();
        const defaults = [
            {
                id: 'calendar',
                group: 'schedule',
                labelKey: 'printCenterEntryCalendar',
                tabs: ['calendar', 'events'],
                run: () => (typeof hooks.openCalendarPrint === 'function' ? hooks.openCalendarPrint() : undefined)
            },
            {
                id: 'timetable',
                group: 'schedule',
                labelKey: 'timetablePrint',
                tabs: ['timetable'],
                run: openVia('schedule', 'timetable', 'timetablePrintBtn')
            },
            {
                id: 'homework-daily-summary',
                group: 'schedule',
                labelKey: 'dailySummaryPrintBtn',
                tabs: ['homework'],
                run: openVia('schedule', 'homework', 'homeworkDailySummaryPrintBtn')
            },
            {
                id: 'syllabus-teacher',
                group: 'classes',
                labelKey: 'printClassSyllabus',
                tabs: ['syllabus', 'cohorts', 'command-center'],
                run: openVia('classes', 'syllabus', 'syllabusPrintHeaderBtn')
            },
            {
                id: 'syllabus-student',
                group: 'classes',
                labelKey: 'printStudentSyllabus',
                tabs: ['syllabus'],
                run: openVia('classes', 'syllabus', 'syllabusPrintStudentBtn')
            },
            {
                id: 'cohorts-hr-list',
                group: 'classes',
                labelKey: 'cohortsPrintHrListBtn',
                tabs: ['cohorts'],
                available: () => canAccess('classes', 'cohorts'),
                unavailableKey: 'printCenterNoAccess',
                run: openVia('classes', 'cohorts', 'cohortsPrintHrListBtn')
            },
            {
                id: 'term-summary-student',
                group: 'term',
                labelKey: 'termSummaryPrintStudent',
                tabs: ['students'],
                available: needsClass,
                run: openVia('classroom', 'students', 'classroomStudentPrintTermSummary')
            },
            {
                id: 'essays-class-summary',
                group: 'tools',
                labelKey: 'classroomEssayClassSummaryBtn',
                tabs: ['essays'],
                available: needsClass,
                run: openVia('tools', 'essays', '#classroomEssaysReportsWrap [data-report-action="class-summary"]')
            },
            {
                id: 'essays-progress',
                group: 'tools',
                labelKey: 'classroomEssayProgressReportBtn',
                tabs: ['essays'],
                available: needsClass,
                run: openVia('tools', 'essays', '#classroomEssaysReportsWrap [data-report-action="progress"]')
            },
            {
                id: 'essays-resubmit-summary',
                group: 'tools',
                labelKey: 'classroomEssayResubmitSummaryBtn',
                tabs: ['essays'],
                available: needsClass,
                run: openVia('tools', 'essays', '#classroomEssaysReportsWrap [data-report-action="resubmit-summary"]')
            },
            {
                id: 'essays-overdue',
                group: 'tools',
                labelKey: 'classroomEssayOverduePrintBtn',
                tabs: ['essays'],
                available: needsClass,
                run: openVia('tools', 'essays', '#classroomEssaysReportsWrap [data-report-action="overdue-print"]')
            },
            {
                id: 'essays-resubmits',
                group: 'tools',
                labelKey: 'classroomEssayResubmitPrintBtn',
                tabs: ['essays'],
                available: needsClass,
                run: openVia('tools', 'essays', '#classroomEssaysReportsWrap [data-report-action="resubmit-print"]')
            },
            {
                id: 'debate-teams-cards',
                group: 'tools',
                labelKey: 'classroomDebateV2PrintCards',
                tabs: ['debate-teams'],
                available: needsClass,
                run: openVia('tools', 'debate-teams', 'debateV2PrintCards')
            },
            {
                id: 'debate-teams-sheets',
                group: 'tools',
                labelKey: 'classroomDebatePrintScoreSheets',
                tabs: ['debate-teams'],
                available: needsClass,
                run: openVia('tools', 'debate-teams', 'debateV2PrintSheets')
            },
            {
                id: 'debate-scores',
                group: 'tools',
                labelKey: 'classroomDebateScoresPrint',
                tabs: ['debate-scores'],
                available: activeClassUsesDebate,
                unavailableKey: 'printCenterNeedsDebateClass',
                run: openVia('tools', 'debate-scores', 'classroomDebateScoresPrintBtn')
            },
            {
                id: 'debate-books-class-summary',
                group: 'tools',
                labelKey: 'classroomDebateBooksClassSummaryBtn',
                tabs: ['debate-books'],
                available: needsClass,
                run: openVia('tools', 'debate-books', '#classroomDebateBooksReportsWrap [data-report-action="class-summary"]')
            },
            {
                id: 'speaking-blank',
                group: 'tools',
                labelKey: 'speakingTestPrintBlank',
                tabs: ['speaking-test'],
                available: needsClass,
                run: openVia('tools', 'speaking-test', 'speakingTestPrintBlankBtn')
            },
            {
                id: 'speaking-all',
                group: 'tools',
                labelKey: 'speakingTestPrintAll',
                tabs: ['speaking-test'],
                available: needsClass,
                run: openVia('tools', 'speaking-test', 'speakingTestPrintAllBtn')
            },
            {
                id: 'term-summary-class',
                group: 'term',
                labelKey: 'termSummaryPrintClass',
                tabs: ['data'],
                run: openVia('more', 'data', 'dataPrintClassTermSummaryBtn')
            },
            {
                id: 'term-summary-all',
                group: 'term',
                labelKey: 'termSummaryPrintAllClasses',
                tabs: ['data'],
                run: openVia('more', 'data', 'dataPrintAllClassTermSummariesBtn')
            }
        ];
        defaults.forEach(register);
    }

    registerDefaults();

    global.CCPPrintCenter = {
        GROUPS: PRINT_GROUPS.slice(),
        init,
        register,
        unregister,
        list,
        buildSections,
        open,
        close,
        openVia
    };

    // ------------------------------------------------------------------
    // Data → Import & export (D6: Run when the action needs no tab context, else Go)
    // ------------------------------------------------------------------
    const IO_GROUP_LABEL_KEYS = {
        calendar: 'dataIoGroupCalendar',
        lessonPlans: 'dataIoGroupLessonPlans',
        classes: 'dataIoGroupClasses',
        students: 'dataIoGroupStudents',
        classroom: 'dataIoGroupClassroom',
        timetable: 'dataIoGroupTimetable',
        notes: 'dataIoGroupNotes',
        debate: 'dataIoGroupDebate',
        tools: 'dataIoGroupTools',
        sync: 'dataIoGroupSync'
    };
    const IO_GROUP_ORDER = Object.keys(IO_GROUP_LABEL_KEYS);

    const DATA_TRANSFER_ROWS = [
        { code: 'I1', direction: 'import', group: 'calendar', labelKey: 'dataImportCalendar', mode: 'run', zone: 'more', segment: 'data', targetId: 'dataImportCalendarBtn' },
        { code: 'I2', direction: 'import', group: 'lessonPlans', labelKey: 'printImportSyllabusPack', mode: 'run', zone: 'more', segment: 'data', targetId: 'printImportSyllabusBtn' },
        { code: 'I3', direction: 'import', group: 'students', labelKey: 'rosterImportBtn', mode: 'jump', zone: 'classroom', segment: 'students', targetId: 'classroomRosterImportBtn' },
        { code: 'I4', direction: 'import', group: 'students', labelKey: 'essayTrackerImportBtn', mode: 'jump', zone: 'classroom', segment: 'students', targetId: 'classroomRosterEssayTrackerImportBtn' },
        { code: 'I5', direction: 'import', group: 'students', labelKey: 'rosterPasteBtn', mode: 'jump', zone: 'classroom', segment: 'students', targetId: 'classroomRosterPasteBtn' },
        { code: 'I6', direction: 'import', group: 'timetable', labelKey: 'timetableImportExcel', mode: 'jump', zone: 'schedule', segment: 'timetable', targetId: 'timetableImportXlsBtn' },
        { code: 'I7', direction: 'import', group: 'timetable', labelKey: 'timetableImportPdf', mode: 'jump', zone: 'schedule', segment: 'timetable', targetId: 'timetableImportPdfBtn' },
        { code: 'I8', direction: 'import', group: 'timetable', labelKey: 'timetableImportPhoto', mode: 'jump', zone: 'schedule', segment: 'timetable', targetId: 'timetableImportPhotoBtn' },
        { code: 'I9', direction: 'import', group: 'debate', labelKey: 'classroomDebateImportBackup', mode: 'jump', zone: 'tools', segment: 'debate-teams', targetId: 'debateV2ImportFile' },
        { code: 'I10', direction: 'import', group: 'tools', labelKey: 'speakingTestLocalImport', mode: 'jump', zone: 'tools', segment: 'speaking-test', targetId: 'speakingTestLocalImportBtn' },
        { code: 'I11', direction: 'import', group: 'classes', labelKey: 'cohortsImportFromClasses', mode: 'jump', zone: 'classes', segment: 'cohorts', targetId: 'cohortsImportBtn' },
        { code: 'I12', direction: 'import', group: 'calendar', labelKey: 'fetchKrHolidays', mode: 'jump', zone: 'schedule', segment: 'events', targetId: 'fetchKrHolidaysBtn' },
        { code: 'I13', direction: 'import', group: 'calendar', labelKey: 'dataTermMigrateOpen', mode: 'run', zone: 'more', segment: 'data', targetId: 'dataTermMigrateBtn' },
        { code: 'tms-sync', direction: 'import', group: 'sync', labelKey: 'dataIoSyncTms', mode: 'run', zone: '', segment: '', targetId: 'tmsSyncCenterBtn', runKind: 'sync-center' },
        { code: 'E1', direction: 'export', group: 'calendar', labelKey: 'dataExportCalendar', mode: 'run', zone: 'more', segment: 'data', targetId: 'dataExportCalendarBtn' },
        { code: 'E2', direction: 'export', group: 'calendar', labelKey: 'dataServerBackupBtn', mode: 'run', zone: 'more', segment: 'data', targetId: 'teamBackupBtn' },
        { code: 'E3', direction: 'export', group: 'lessonPlans', labelKey: 'printExportSyllabusPack', mode: 'run', zone: 'more', segment: 'data', targetId: 'printExportSyllabusBtn' },
        { code: 'E4', direction: 'export', group: 'classroom', labelKey: 'dataExportAttendance', mode: 'run', zone: 'more', segment: 'data', targetId: 'dataExportAttendanceBtn' },
        { code: 'E5', direction: 'export', group: 'classroom', labelKey: 'dataExportHomework', mode: 'run', zone: 'more', segment: 'data', targetId: 'dataExportHomeworkBtn' },
        { code: 'E6', direction: 'export', group: 'students', labelKey: 'rosterExportAllBtn', mode: 'jump', zone: 'classroom', segment: 'students', targetId: 'classroomRosterExportAllBtn' },
        { code: 'E7', direction: 'export', group: 'students', labelKey: 'rosterExportSelectedBtn', mode: 'jump', zone: 'classroom', segment: 'students', targetId: 'classroomRosterExportSelectedBtn' },
        { code: 'E8', direction: 'export', group: 'timetable', labelKey: 'timetableExportExcel', mode: 'jump', zone: 'schedule', segment: 'timetable', targetId: 'timetableExportXlsBtn' },
        { code: 'E9', direction: 'export', group: 'debate', labelKey: 'classroomDebateScoresDownloadWord', mode: 'jump', zone: 'tools', segment: 'debate-scores', targetId: 'classroomDebateScoresWordBtn' },
        { code: 'E10', direction: 'export', group: 'debate', labelKey: 'classroomDebateScoresDownloadPdf', mode: 'jump', zone: 'tools', segment: 'debate-scores', targetId: 'classroomDebateScoresPdfBtn' },
        { code: 'E11', direction: 'export', group: 'debate', labelKey: 'classroomDebateExportBackup', mode: 'jump', zone: 'tools', segment: 'debate-teams', targetId: 'debateV2ExportJson' },
        { code: 'E12', direction: 'export', group: 'debate', labelKey: 'classroomDebateDownloadWord', mode: 'jump', zone: 'tools', segment: 'debate-teams', targetId: 'debateV2Word' },
        { code: 'E13', direction: 'export', group: 'debate', labelKey: 'classroomDebateDownloadPdf', mode: 'jump', zone: 'tools', segment: 'debate-teams', targetId: 'debateV2Pdf' },
        { code: 'E14', direction: 'export', group: 'notes', labelKey: 'classNotesExportDownload', mode: 'jump', zone: 'classroom', segment: 'notes', targetId: 'classNotesExportDownloadBtn' },
        { code: 'E15', direction: 'export', group: 'notes', labelKey: 'classNotesExportCopy', mode: 'jump', zone: 'classroom', segment: 'notes', targetId: 'classNotesExportCopyBtn' },
        { code: 'E16', direction: 'export', group: 'notes', labelKey: 'dataIoDayNotesSummary', mode: 'jump', zone: 'classroom', segment: 'notes', targetId: 'classNotesDaySummaryBtn' },
        { code: 'E17', direction: 'export', group: 'debate', labelKey: 'dataIoHomeworkDebateFiles', mode: 'jump', zone: 'schedule', segment: 'homework', targetId: 'panel-homework' }
    ];

    function rows() {
        return DATA_TRANSFER_ROWS.map((row) => Object.assign({}, row));
    }

    function findRow(code) {
        return DATA_TRANSFER_ROWS.find((row) => row.code === code) || null;
    }

    function highlight(el) {
        if (!el) {
            return;
        }
        let visible = el;
        if (el.tagName === 'INPUT' && (el.hidden || el.type === 'file')) {
            visible = el.closest('label') || el.parentElement || el;
        }
        if (typeof visible.scrollIntoView === 'function') {
            visible.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (typeof visible.focus === 'function') {
            try {
                visible.focus({ preventScroll: true });
            } catch (_) {
                /* ignore */
            }
        }
        visible.classList.add(HIGHLIGHT_CLASS);
        setTimeout(() => visible.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
    }

    async function runRow(code) {
        const row = findRow(code);
        if (!row) {
            return;
        }
        if (row.mode === 'run') {
            if (row.runKind === 'sync-center') {
                if (typeof hooks.openSyncCenter === 'function') {
                    hooks.openSyncCenter();
                }
                return;
            }
            const target = findTarget(row.targetId);
            if (target && !target.disabled) {
                target.click();
            }
            return;
        }
        await navigate(row.zone, row.segment);
        const target = await waitForTarget(row.targetId);
        if (!target) {
            notifyOpenedTab();
            return;
        }
        highlight(target);
    }

    function renderDataTransfer(mount) {
        const host = mount || (typeof document !== 'undefined' ? document.getElementById('dataImportExportList') : null);
        if (!host) {
            return;
        }
        const columns = ['import', 'export'].map((direction) => {
            const groups = IO_GROUP_ORDER.map((group) => {
                const groupRows = DATA_TRANSFER_ROWS.filter((r) => r.direction === direction && r.group === group);
                if (!groupRows.length) {
                    return '';
                }
                const html = groupRows
                    .map((row) => {
                        const target = row.mode === 'run' ? findTarget(row.targetId) : null;
                        const disabled = Boolean(target && target.disabled);
                        return buildRowHtml({
                            label: t(row.labelKey),
                            hint: row.zone ? describeLocation(row.zone, row.segment) : '',
                            buttonLabel: t(row.mode === 'run' ? 'dataIoRun' : 'dataIoGo'),
                            dataAttr: 'data-io-row',
                            id: row.code,
                            disabled
                        });
                    })
                    .join('');
                return `<h4 class="lesson-filter-section-title print-center-group__title">${escapeHtml(t(IO_GROUP_LABEL_KEYS[group]))}</h4>
                    <ul class="print-center-rows">${html}</ul>`;
            }).join('');
            const headingKey = direction === 'import' ? 'dataIoImports' : 'dataIoExports';
            return `<div class="data-io-column">
                <h3 class="data-io-column__title">${escapeHtml(t(headingKey))}</h3>
                ${groups}
            </div>`;
        });
        host.innerHTML = columns.join('');
        if (host.dataset.dataIoBound !== '1') {
            host.dataset.dataIoBound = '1';
            host.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-io-row]');
                if (btn && !btn.disabled) {
                    void runRow(btn.getAttribute('data-io-row')).catch((err) => {
                        console.error('Import & export row failed', err);
                    });
                }
            });
        }
    }

    function syncRunStates(mount) {
        const host = mount || (typeof document !== 'undefined' ? document.getElementById('dataImportExportList') : null);
        if (!host) {
            return;
        }
        host.querySelectorAll('[data-io-row]').forEach((btn) => {
            const row = findRow(btn.getAttribute('data-io-row'));
            if (!row || row.mode !== 'run' || row.runKind) {
                return;
            }
            const target = findTarget(row.targetId);
            btn.disabled = Boolean(target && target.disabled);
        });
    }

    global.CCPDataTransfer = {
        rows,
        render: renderDataTransfer,
        syncRunStates,
        run: runRow,
        HIGHLIGHT_CLASS
    };
})(typeof window !== 'undefined' ? window : globalThis);
