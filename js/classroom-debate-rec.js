/**
 * Tools → Debate Rec — Debate Day 4 recording check.
 *
 * Cross-references TMS attendance with the date the Debate Day 4 homework was
 * assigned and warns when a student was absent (결석 → Not recorded) or had
 * another non-present status (지각 / 조퇴 / 미참석 → Needs confirmation).
 *
 * READ-ONLY TOWARD TMS. This module never calls TMS itself. "Check TMS attendance"
 * opens the shared TMS Sync window with only the Briefing attendance scrape
 * selected (GET requests + the standard sign-in), then reads the scraped
 * attendance from CCPClassroomBriefing's cache. All writes go to ClassManager's
 * own calendar data (essaySubmissions) through hooks.saveClassroom().
 *
 * Teacher decisions (debateRecSource === 'teacher') are never changed by a TMS
 * check. "Reset to TMS" hands a student back to the automatic check.
 */
(function (global) {
    'use strict';

    let hooks = null;
    let classId = '';
    let selectedRowId = null; // null = pick the latest past Day 4, '' = all Day 4 dates
    let panelRef = null;
    let mountEventsBound = false;
    let contextSubscribed = false;
    let contextSeq = 0;
    let checkRunning = false;
    let focusStudentId = '';
    let attendanceByStudent = new Map();
    let reportsMenuOpen = false;
    let reportModalBound = false;
    let reportFilters = null;
    const reportDeselected = new Set(); // `${classId}|${rowId}` entries unticked in the class summary
    const REPORT_FILTER_DEFAULTS = {
        homeroomUserId: '',
        month: '',
        classScope: 'mine',
        show: 'all'
    };
    let docClickBound = false;
    const selectedKeys = new Set(); // `${rowId}|${studentId}`

    /** Why a student is flagged (debateRecReason). */
    const REASON_META = {
        absent: { key: 'debateRecReasonAbsent', cls: 'debate-rec-reason--absent' },
        late: { key: 'debateRecReasonLate', cls: 'debate-rec-reason--late' },
        early_leave: { key: 'debateRecReasonEarlyLeave', cls: 'debate-rec-reason--early' },
        other: { key: 'debateRecReasonOther', cls: 'debate-rec-reason--other' },
        new_student: { key: 'debateRecReasonNewStudent', cls: 'debate-rec-reason--new' }
    };

    const STATUS_META = {
        not_recorded: { cls: 'debate-rec-status--not-recorded', key: 'debateRecStatusNotRecorded' },
        needs_confirmation: { cls: 'debate-rec-status--confirm', key: 'debateRecStatusNeedsConfirmation' },
        recorded: { cls: 'debate-rec-status--recorded', key: 'debateRecStatusRecorded' },
        received: { cls: 'debate-rec-status--received', key: 'debateRecStatusReceived' },
        exempt: { cls: 'debate-rec-status--exempt', key: 'debateRecStatusExempt' },
        present: { cls: 'debate-rec-status--recorded', key: 'debateRecStatusPresent' },
        not_checked: { cls: 'debate-rec-status--not-checked', key: 'debateRecStatusNotChecked' }
    };

    const MSG_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    /** Teacher choices offered per current status. */
    const CHOICES_FOR = {
        not_recorded: ['received', 'exempt'],
        needs_confirmation: ['recorded', 'not_recorded'],
        recorded: ['recorded', 'not_recorded', 'exempt'],
        received: ['received', 'not_recorded', 'exempt'],
        exempt: ['exempt', 'not_recorded', 'received'],
        present: ['not_recorded', 'exempt'],
        not_checked: ['recorded', 'not_recorded', 'exempt']
    };

    function domain() {
        return global.CCPClassroomDomain;
    }

    function access() {
        return global.CCPClassroomAccess;
    }

    function briefing() {
        return global.CCPClassroomBriefing;
    }

    function t(key) {
        return hooks && hooks.t ? hooks.t(key) : key;
    }

    function tf(key, vars) {
        let s = t(key);
        Object.keys(vars || {}).forEach((name) => {
            s = s.replace(new RegExp(`\\{${name}\\}`, 'g'), String(vars[name] == null ? '' : vars[name]));
        });
        return s;
    }

    function escapeHtml(s) {
        if (typeof CCPUtils !== 'undefined' && CCPUtils.escapeHtml) {
            return CCPUtils.escapeHtml(s);
        }
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escapeAttr(s) {
        return escapeHtml(s).replace(/"/g, '&quot;');
    }

    function getAppData() {
        return hooks && hooks.getAppData ? hooks.getAppData() : {};
    }

    function getClassData() {
        return (getAppData().classes || []).find((c) => c && c.id === classId) || null;
    }

    function currentUserId() {
        return hooks && hooks.getCurrentUserId ? String(hooks.getCurrentUserId() || '') : '';
    }

    function canEdit(classData) {
        return Boolean(access() && access().canEditClass(classData || getClassData()));
    }

    function formatShortDate(iso) {
        const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${Number(m[2])}/${Number(m[3])}` : String(iso || '');
    }

    function teacherName(userId) {
        if (!userId) {
            return '';
        }
        if (hooks && hooks.getUserDisplayName) {
            return hooks.getUserDisplayName(userId) || '';
        }
        return '';
    }

    function resolveClassId(options) {
        const data = getAppData();
        const visible =
            global.CCPClassroomZoneContext && global.CCPClassroomZoneContext.getVisibleClasses
                ? global.CCPClassroomZoneContext.getVisibleClasses()
                : data.classes || [];
        if (typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.resolveActiveClassId) {
            return global.CCPActiveContext.resolveActiveClassId(data, {
                classId: options && options.classId,
                visibleClasses: visible
            });
        }
        if (global.CCPClassroomZoneContext && global.CCPClassroomZoneContext.getActiveClassId) {
            const fromZone = global.CCPClassroomZoneContext.getActiveClassId();
            if (fromZone) {
                return fromZone;
            }
        }
        return (options && options.classId) || (visible[0] && visible[0].id) || '';
    }

    async function loadAttendance() {
        attendanceByStudent = new Map();
        const api = briefing();
        if (!api || !api.getCachedAttendanceByStudent || !classId) {
            return;
        }
        try {
            attendanceByStudent = await api.getCachedAttendanceByStudent(classId);
        } catch (_) {
            attendanceByStudent = new Map();
        }
    }

    function getView() {
        const d = domain();
        if (!d || !classId) {
            return { days: [], rows: [], counts: {}, dayCounts: {} };
        }
        return d.computeDebateRecView(getAppData(), classId, attendanceByStudent);
    }

    // ── Persist ─────────────────────────────────────────────────────────

    /**
     * Upsert mutations for only the submissions that changed, each carrying the
     * students whose records changed (the server merges just those students).
     */
    function buildSubmissionMutations(prevList, nextList) {
        const prevById = new Map();
        (prevList || []).forEach((sub) => {
            if (sub && sub.id != null) {
                prevById.set(String(sub.id), sub);
            }
        });
        const ts = Date.now();
        const mutations = [];
        (nextList || []).forEach((sub) => {
            if (!sub || sub.id == null) {
                return;
            }
            const prev = prevById.get(String(sub.id));
            if (prev === sub || (prev && JSON.stringify(prev) === JSON.stringify(sub))) {
                return;
            }
            const payload = Object.assign({}, sub);
            if (prev) {
                const prevRecs = new Map((prev.records || []).filter(Boolean).map((r) => [String(r.studentId), JSON.stringify(r)]));
                const touched = (sub.records || [])
                    .filter((r) => r && JSON.stringify(r) !== prevRecs.get(String(r.studentId)))
                    .map((r) => String(r.studentId));
                if (touched.length) {
                    payload.touchedStudentIds = touched;
                }
            }
            mutations.push({ entity: 'essaySubmissions', action: 'upsert', payload: { submission: payload }, timestamp: ts });
        });
        return mutations;
    }

    /**
     * Apply locally and re-render right away, then wait for the server. Only the
     * changed submissions/students are sent.
     */
    async function saveSubmissions(list, options) {
        const skipRender = Boolean(options && options.skipRender);
        const prevList = getAppData().essaySubmissions || [];
        const mutations = buildSubmissionMutations(prevList, list);
        if (!mutations.length) {
            setSaveStatus('saved');
            return true;
        }
        let pending;
        try {
            // saveClassroom updates appData synchronously before its first await.
            pending = hooks.saveClassroom({ essaySubmissions: list, mutations });
        } catch (err) {
            pending = Promise.reject(err);
        }
        if (!skipRender) {
            render();
        }
        refreshZoneContextBar();
        try {
            await pending;
            setSaveStatus('saved');
            refreshZoneContextBar();
            if (typeof hooks.refreshTabWarnings === 'function') {
                hooks.refreshTabWarnings();
            }
            return true;
        } catch (err) {
            setSaveStatus('error');
            if (hooks.showToast) {
                hooks.showToast((err && err.message) || String(err), true);
            }
            render();
            return false;
        }
    }

    /** Re-render the class list so its Debate Rec pills match the saved data. */
    function refreshZoneContextBar() {
        const zone = global.CCPClassroomZoneContext;
        const mount = typeof document !== 'undefined' ? document.getElementById('classroomZoneContextBar') : null;
        if (!zone || !zone.render || !mount || mount.hidden) {
            return;
        }
        zone.render(mount);
    }

    function setSaveStatus(state) {
        const el = panelRef && panelRef.querySelector('#classroomDebateRecSaveStatus');
        if (!el) {
            return;
        }
        el.classList.remove('classroom-save-status--saved', 'classroom-save-status--saving', 'classroom-save-status--error');
        if (state === 'saving') {
            el.textContent = t('classroomSaveSaving');
            el.classList.add('classroom-save-status--saving');
        } else if (state === 'error') {
            el.textContent = t('classroomSaveError');
            el.classList.add('classroom-save-status--error');
        } else {
            el.textContent = t('classroomSaveSaved');
            el.classList.add('classroom-save-status--saved');
        }
    }

    function rowContext(rowId) {
        const view = getView();
        return view.days.find((day) => day.rowId === rowId) || null;
    }

    async function applyTeacherStatus(entries, status) {
        const d = domain();
        if (!d || !entries.length || !canEdit()) {
            return;
        }
        setSaveStatus('saving');
        let list = getAppData().essaySubmissions || [];
        const nowIso = new Date().toISOString();
        entries.forEach(({ rowId, studentId }) => {
            const day = rowContext(rowId);
            const res = d.setDebateRecTeacherStatus(list, {
                classId,
                syllabusRowId: rowId,
                studentId,
                status,
                date: day ? day.date : '',
                lessonDate: day && day.row ? day.row.date : '',
                userId: currentUserId(),
                nowIso
            });
            if (!res.error) {
                list = res.submissions;
            }
        });
        if (await saveSubmissions(list)) {
            render();
        }
    }

    async function resetToTms(rowId, studentId) {
        const d = domain();
        if (!d || !canEdit()) {
            return;
        }
        setSaveStatus('saving');
        const day = rowContext(rowId);
        let tmsRecords = null;
        try {
            const briefing = global.CCPClassroomBriefing;
            if (briefing && typeof briefing.getCachedAttendanceByStudent === 'function') {
                const byStudent = await briefing.getCachedAttendanceByStudent(classId);
                tmsRecords = byStudent.get(String(studentId)) || null;
            }
        } catch (_) {
            tmsRecords = null;
        }
        const viewRow = getView().rows.find((r) => r.day.rowId === rowId && r.student.id === studentId);
        const res = d.resetDebateRecToTms(getAppData().essaySubmissions || [], {
            classId,
            syllabusRowId: rowId,
            studentId,
            date: day ? day.date : '',
            tmsRecords,
            isNewStudent: Boolean(viewRow && viewRow.isNewStudent)
        });
        if (!res.error && (await saveSubmissions(res.submissions))) {
            if (hooks.showToast) {
                hooks.showToast(t('debateRecResetDone'));
            }
            render();
        }
    }

    async function saveHrNotified(rowId, studentId, notified) {
        const d = domain();
        if (!d || !canEdit()) {
            return;
        }
        setSaveStatus('saving');
        const res = d.setDebateRecHrNotified(getAppData().essaySubmissions || [], {
            classId,
            syllabusRowId: rowId,
            studentId,
            notified: notified === true
        });
        if (!res.error) {
            await saveSubmissions(res.submissions);
        }
    }

    async function saveNote(rowId, studentId, note) {
        const d = domain();
        if (!d || !canEdit()) {
            return;
        }
        setSaveStatus('saving');
        const res = d.setDebateRecNote(getAppData().essaySubmissions || [], {
            classId,
            syllabusRowId: rowId,
            studentId,
            note
        });
        if (!res.error) {
            await saveSubmissions(res.submissions, { skipRender: true });
        }
    }

    // ── TMS check (read-only toward TMS) ────────────────────────────────

    function listCheckClassIds(scope) {
        const d = domain();
        const data = getAppData();
        if (scope !== 'all') {
            return classId ? [classId] : [];
        }
        return (data.classes || [])
            .filter((c) => c && c.id && d.classUsesDebateTeamAssignments(c) && canEdit(c))
            .map((c) => c.id);
    }

    /** True when a Day 4 is inside the class term and already on or before today. */
    function recordingDateInTerm(classData, date, today) {
        if (!date || date > today) {
            return false;
        }
        const start = classData && classData.startDate ? String(classData.startDate).slice(0, 10) : '';
        const end = classData && classData.endDate ? String(classData.endDate).slice(0, 10) : '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(start) && date < start) {
            return false;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(end) && date > end) {
            return false;
        }
        return true;
    }

    /**
     * Earliest past Day 4 inside the class term for this check.
     * TMS is asked for every month from that date through today, not one example month.
     */
    function earliestCheckDate(scope) {
        const d = domain();
        const data = getAppData();
        if (!d || typeof d.listDebateRecordingDays !== 'function' || typeof d.todayISO !== 'function') {
            return '';
        }
        const today = d.todayISO();
        let earliest = '';
        listCheckClassIds(scope).forEach((cid) => {
            const classData = (data.classes || []).find((c) => c && c.id === cid);
            d.listDebateRecordingDays(data, classData).forEach((day) => {
                const date = day && day.date;
                if (!recordingDateInTerm(classData, date, today)) {
                    return;
                }
                if (!earliest || date < earliest) {
                    earliest = date;
                }
            });
        });
        return earliest;
    }

    async function runTmsCheck() {
        if (checkRunning) {
            return;
        }
        const d = domain();
        const center = global.CCPTmsSyncCenter;
        if (!d || !center || !center.open) {
            if (hooks.showToast) {
                hooks.showToast(t('debateRecCheckUnavailable'), true);
            }
            return;
        }
        if (!canEdit()) {
            return;
        }
        const scopeSel = panelRef && panelRef.querySelector('#classroomDebateRecCheckScope');
        const scope = scopeSel && scopeSel.value === 'all' ? 'all' : 'class';
        checkRunning = true;
        renderToolbarState();
        const startedAt = Date.now();
        const earliest = earliestCheckDate(scope);
        try {
            // Fresh scrape: attendance only. attendanceThroughDate walks months back
            // to the earliest past Day 4; counseling notes are not re-fetched.
            await center.open({
                kinds: ['attendance'],
                attendanceThroughDate: earliest,
                scope: scope === 'all' ? { mode: 'all' } : { mode: 'class', classId }
            });
            const api = briefing();
            const lastAt = api && api.getLastSyncAppliedAt ? api.getLastSyncAppliedAt() : 0;
            if (!lastAt || lastAt < startedAt) {
                if (hooks.showToast) {
                    hooks.showToast(t('debateRecCheckNotRun'), true);
                }
                return;
            }
            const classIds = listCheckClassIds(scope);
            let data = getAppData();
            const totals = { flagged: 0, needsConfirmation: 0, cleared: 0, skippedTeacher: 0, noTmsData: 0 };
            const nowIso = new Date().toISOString();
            for (const cid of classIds) {
                const byStudent = await api.getCachedAttendanceByStudent(cid);
                if (!byStudent.size) {
                    continue;
                }
                const res = d.applyDebateRecTmsCheck(data, cid, byStudent, { nowIso });
                data = Object.assign({}, data, { essaySubmissions: res.submissions });
                Object.keys(totals).forEach((k) => {
                    totals[k] += res.summary[k] || 0;
                });
            }
            setSaveStatus('saving');
            const saved = await saveSubmissions(data.essaySubmissions || []);
            if (saved && hooks.showToast) {
                hooks.showToast(tf('debateRecCheckDone', {
                    classes: classIds.length,
                    flagged: totals.flagged,
                    confirm: totals.needsConfirmation,
                    kept: totals.skippedTeacher
                }));
            }
            persistLastChecked(nowIso);
            await loadAttendance();
        } finally {
            checkRunning = false;
            render();
        }
    }

    function lastCheckedStorageKey() {
        return 'ccp:debateRec:lastChecked';
    }

    function persistLastChecked(iso) {
        try {
            const map = JSON.parse(global.localStorage.getItem(lastCheckedStorageKey()) || '{}');
            map[classId] = iso;
            global.localStorage.setItem(lastCheckedStorageKey(), JSON.stringify(map));
        } catch (_) {
            /* per-viewer convenience only */
        }
    }

    function readLastChecked() {
        try {
            const map = JSON.parse(global.localStorage.getItem(lastCheckedStorageKey()) || '{}');
            return map[classId] || '';
        } catch (_) {
            return '';
        }
    }

    // ── Reports (print / copy) — Essays class summary layout ─────────────

    function printApi() {
        return global.CCPClassroomDebateRecPrint;
    }

    function reportLabels() {
        return {
            title: t('debateRecReportTitle'),
            generatedAt: t('debateRecReportPrinted'),
            hrHeading: t('debateRecReportHrHeading'),
            noHomeroom: t('debateRecReportNoHomeroom'),
            dayHeading: t('debateRecReportDayHeading'),
            dayCounts: t('debateRecReportDayCounts'),
            dateFromTms: t('debateRecDateFromTms'),
            dateFromSyllabus: t('debateRecDateFromSyllabus'),
            colStudent: t('classroomColStudent'),
            colStatus: t('debateRecColRecording'),
            colTms: t('debateRecColTms'),
            colHr: t('debateRecColHr'),
            hrYes: t('debateRecHrYes'),
            hrNo: t('debateRecHrNo'),
            colNotes: t('classroomColNotes'),
            setBy: t('debateRecSetBy'),
            noStudents: t('debateRecReportNoRows'),
            noStudentsInSection: t('debateRecReportNoRowsClass'),
            notCheckedNote: t('debateRecReportNotCheckedNote'),
            reasonLabels: {
                absent: t('debateRecReasonAbsent'),
                late: t('debateRecReasonLate'),
                early_leave: t('debateRecReasonEarlyLeave'),
                other: t('debateRecReasonOther'),
                new_student: t('debateRecReasonNewStudent')
            },
            confirmLate: t('debateRecConfirmLate'),
            confirmEarly: t('debateRecConfirmEarly'),
            confirmNew: t('debateRecNewStudentHint'),
            statusLabels: {
                not_checked: t('debateRecStatusNotChecked'),
                not_recorded: t('debateRecStatusNotRecorded'),
                needs_confirmation: t('debateRecStatusNeedsConfirmation'),
                present: t('debateRecStatusPresent'),
                recorded: t('debateRecStatusRecorded'),
                received: t('debateRecStatusReceived'),
                exempt: t('debateRecStatusExempt')
            }
        };
    }

    function calendarName() {
        if (hooks && hooks.getCalendarName) {
            return hooks.getCalendarName() || '';
        }
        return getAppData().calendarName || '';
    }

    function openPrintDocument(title, bodyHtml, css) {
        if (hooks && typeof hooks.openPrintDocument === 'function') {
            hooks.openPrintDocument(title, bodyHtml, css);
            return;
        }
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
            <style>${css || ''}</style></head><body class="print-color-mode-light">${bodyHtml}</body></html>`;
        const win = global.open('', '_blank');
        if (!win) {
            if (hooks.showToast) {
                hooks.showToast(t('printSyllabusBlocked'), true);
            }
            return;
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.document.title = title;
        const go = () => {
            try {
                win.focus();
                win.print();
            } catch (_) {
                /* ignore */
            }
        };
        if (win.document.readyState === 'complete') {
            setTimeout(go, 50);
        } else {
            win.addEventListener('load', () => setTimeout(go, 50));
            setTimeout(go, 300);
        }
    }

    function summaryGroups(keys, show) {
        return domain().buildDebateRecClassSummary(getAppData(), keys, {
            show: show || 'all',
            nameForUser: teacherName
        });
    }

    /** All past Day 4 keys for the current class. */
    function currentClassKeys() {
        const d = domain();
        const classData = getClassData();
        if (!classData) {
            return [];
        }
        return d.listDebateRecReportEntries(getAppData(), [classData], { show: 'all' }, {})
            .reduce((keys, c) => keys.concat(c.entries.map((e) => e.key)), []);
    }

    function printGroups(title, groups, scopeNote) {
        const api = printApi();
        if (!api) {
            return;
        }
        if (!groups.length) {
            if (hooks.showToast) {
                hooks.showToast(t('debateRecReportNoRows'), true);
            }
            return;
        }
        openPrintDocument(title, api.renderDocumentHtml({
            title,
            calendarName: calendarName(),
            generatedAt: domain().todayISO(),
            scopeNote,
            groups
        }, reportLabels()), api.PRINT_STYLES);
    }

    function printClassReport() {
        const classData = getClassData();
        printGroups(
            tf('debateRecReportTitleClass', { name: classData ? classData.name : '' }),
            summaryGroups(currentClassKeys(), 'all'),
            ''
        );
    }

    async function copyGroups(groups) {
        const api = printApi();
        if (!api) {
            return;
        }
        const count = (groups || []).reduce((n, g) => n + g.classes.reduce((m, c) =>
            m + c.assignments.reduce((k, a) => k + a.students.length, 0), 0), 0);
        if (!count) {
            if (hooks.showToast) {
                hooks.showToast(t('debateRecReportNoRows'), true);
            }
            return;
        }
        const text = api.formatCopyText(groups, reportLabels());
        try {
            if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
                await global.navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            if (hooks.showToast) {
                hooks.showToast(tf('debateRecReportCopied', { count }));
            }
        } catch (_) {
            if (hooks.showToast) {
                hooks.showToast(t('classroomEssayWarnCopyFailed'), true);
            }
        }
    }

    function copyClassList() {
        return copyGroups(summaryGroups(currentClassKeys(), 'all'));
    }

    // ── Class summary window (same as the Essays class summary) ─────────

    function loadReportFilters() {
        if (reportFilters) {
            return reportFilters;
        }
        const ui = getAppData().ui || {};
        const saved = ui.debateRecReportFilters && typeof ui.debateRecReportFilters === 'object'
            ? ui.debateRecReportFilters
            : {};
        reportFilters = Object.assign({}, REPORT_FILTER_DEFAULTS, saved);
        delete reportFilters.deselected;
        reportDeselected.clear();
        (Array.isArray(saved.deselected) ? saved.deselected : []).forEach((k) => reportDeselected.add(k));
        return reportFilters;
    }

    function saveReportFilters() {
        if (hooks && typeof hooks.setUiPref === 'function') {
            hooks.setUiPref('debateRecReportFilters', Object.assign({}, reportFilters, {
                deselected: Array.from(reportDeselected)
            }));
        }
    }

    function reportVisibleClasses() {
        const d = domain();
        return (getAppData().classes || []).filter((c) => c && d.classUsesDebateTeamAssignments(c));
    }

    function reportEntries() {
        return domain().listDebateRecReportEntries(getAppData(), reportVisibleClasses(), loadReportFilters(), {
            isMine: (c) => canEdit(c)
        });
    }

    function selectedReportKeys() {
        return reportEntries()
            .reduce((keys, c) => keys.concat(c.entries.map((e) => e.key)), [])
            .filter((k) => !reportDeselected.has(k));
    }

    function formatMonthLabel(ym) {
        const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
        if (!m) {
            return ym;
        }
        try {
            const lang = hooks && hooks.getLang ? hooks.getLang() : 'en';
            return new Date(Number(m[1]), Number(m[2]) - 1, 1)
                .toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long' });
        } catch (_) {
            return ym;
        }
    }

    function fillSelect(sel, options, value) {
        if (!sel) {
            return;
        }
        sel.innerHTML = options
            .map((o) => `<option value="${escapeAttr(o.value)}"${o.value === value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`)
            .join('');
        if (!options.some((o) => o.value === value)) {
            sel.value = options.length ? options[0].value : '';
        }
    }

    function reportScopeNote() {
        const f = loadReportFilters();
        const parts = [f.month ? formatMonthLabel(f.month) : t('debateRecReportAllMonths')];
        parts.push(f.show === 'open' ? t('debateRecReportShowOpen') : f.show === 'completed' ? t('debateRecReportShowCompleted') : t('debateRecReportShowAll'));
        return parts.join(' · ');
    }

    function renderReportModal() {
        const modal = document.getElementById('debateRecReportModal');
        if (!modal) {
            return;
        }
        const f = loadReportFilters();
        const opts = domain().debateRecReportFilterOptions(getAppData(), reportVisibleClasses());
        const homerooms = opts.homerooms
            .map((id) => ({ value: id, label: teacherName(id) || id }))
            .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
        if (opts.noHomeroom) {
            homerooms.push({ value: '__none__', label: t('debateRecReportNoHomeroom') });
        }
        fillSelect(modal.querySelector('#debateRecReportHomeroom'),
            [{ value: '', label: t('debateRecReportFilterAll') }].concat(homerooms), f.homeroomUserId);
        fillSelect(modal.querySelector('#debateRecReportMonth'),
            [{ value: '', label: t('debateRecReportAllMonths') }].concat(opts.months.map((m) => ({ value: m, label: formatMonthLabel(m) }))), f.month);
        fillSelect(modal.querySelector('#debateRecReportScope'), [
            { value: 'mine', label: t('debateRecReportScopeMine') },
            { value: 'all', label: t('debateRecReportScopeAllClasses') },
            { value: 'other', label: t('debateRecReportScopeOther') }
        ], f.classScope);
        fillSelect(modal.querySelector('#debateRecReportShow'), [
            { value: 'all', label: t('debateRecReportShowAll') },
            { value: 'open', label: t('debateRecReportShowOpen') },
            { value: 'completed', label: t('debateRecReportShowCompleted') }
        ], f.show);
        renderReportList();
    }

    function renderReportList() {
        const modal = document.getElementById('debateRecReportModal');
        if (!modal) {
            return;
        }
        const listEl = modal.querySelector('#debateRecReportClassList');
        const grouped = reportEntries();
        if (listEl) {
            listEl.innerHTML = grouped.length
                ? grouped.map((c) => {
                    const rows = c.entries.map((e) => {
                        const checked = reportDeselected.has(e.key) ? '' : ' checked';
                        const src = e.dateSource === 'tms' ? t('debateRecDateFromTms') : t('debateRecDateFromSyllabus');
                        const label = `${formatMonthLabel(e.month)} · ${tf('debateRecReportDayHeading', { date: formatShortDate(e.date) })} (${src})`;
                        const hint = tf('debateRecReportEntryHint', { complete: e.completed, total: e.total, open: e.open });
                        return `<label class="classroom-essay-progress-assignment-row">
                            <input type="checkbox" data-report-key="${escapeAttr(e.key)}"${checked} />
                            <span>${escapeHtml(label)} <span class="section-hint">(${escapeHtml(hint)})</span></span>
                        </label>`;
                    }).join('');
                    return `<div class="classroom-essay-progress-class-group">
                        <h4 class="classroom-essay-progress-class-name">${escapeHtml(c.className)}</h4>
                        ${rows}
                    </div>`;
                }).join('')
                : `<p class="section-hint">${escapeHtml(t('debateRecReportNoClasses'))}</p>`;
        }
        const groups = summaryGroups(selectedReportKeys(), loadReportFilters().show);
        const previewEl = modal.querySelector('#debateRecReportPreview');
        if (previewEl) {
            const api = printApi();
            previewEl.innerHTML = groups.length && api
                ? api.renderDocumentHtml({ groups }, reportLabels())
                : `<p class="section-hint">${escapeHtml(t('debateRecReportNoRows'))}</p>`;
        }
        ['#debateRecReportPrintBtn', '#debateRecReportCopyBtn'].forEach((sel) => {
            const btn = modal.querySelector(sel);
            if (btn) {
                btn.disabled = !groups.length;
            }
        });
    }

    function openReportModal() {
        const modal = document.getElementById('debateRecReportModal');
        if (!modal) {
            return;
        }
        bindReportModal(modal);
        loadReportFilters();
        renderReportModal();
        if (hooks && typeof hooks.openModal === 'function') {
            hooks.openModal(modal);
        } else {
            modal.hidden = false;
            modal.classList.add('active');
        }
    }

    function closeReportModal() {
        const modal = document.getElementById('debateRecReportModal');
        if (!modal) {
            return;
        }
        if (hooks && typeof hooks.closeModal === 'function') {
            hooks.closeModal(modal);
        } else {
            modal.classList.remove('active');
            modal.hidden = true;
        }
    }

    function bindReportModal(modal) {
        if (reportModalBound) {
            return;
        }
        reportModalBound = true;
        const val = (id) => {
            const el = modal.querySelector(id);
            return el ? el.value : '';
        };
        const onFilter = () => {
            const f = loadReportFilters();
            f.homeroomUserId = val('#debateRecReportHomeroom');
            f.month = val('#debateRecReportMonth');
            f.classScope = val('#debateRecReportScope') || 'mine';
            f.show = val('#debateRecReportShow') || 'all';
            saveReportFilters();
            renderReportList();
        };
        ['#debateRecReportHomeroom', '#debateRecReportMonth', '#debateRecReportScope', '#debateRecReportShow'].forEach((id) => {
            const el = modal.querySelector(id);
            if (el) {
                el.addEventListener('change', onFilter);
            }
        });
        modal.addEventListener('change', (event) => {
            const box = event.target instanceof Element ? event.target.closest('[data-report-key]') : null;
            if (!box) {
                return;
            }
            const key = box.getAttribute('data-report-key');
            if (box.checked) {
                reportDeselected.delete(key);
            } else {
                reportDeselected.add(key);
            }
            saveReportFilters();
            renderReportList();
        });
        const on = (id, fn) => {
            const el = modal.querySelector(id);
            if (el) {
                el.addEventListener('click', fn);
            }
        };
        const visibleKeys = () => reportEntries().reduce((keys, c) => keys.concat(c.entries.map((e) => e.key)), []);
        on('#debateRecReportSelectAll', () => {
            visibleKeys().forEach((k) => reportDeselected.delete(k));
            saveReportFilters();
            renderReportList();
        });
        on('#debateRecReportClearAll', () => {
            visibleKeys().forEach((k) => reportDeselected.add(k));
            saveReportFilters();
            renderReportList();
        });
        on('#debateRecReportClose', closeReportModal);
        on('#debateRecReportPrintBtn', () => {
            printGroups(t('debateRecReportTitleAll'), summaryGroups(selectedReportKeys(), loadReportFilters().show), reportScopeNote());
        });
        on('#debateRecReportCopyBtn', () => {
            void copyGroups(summaryGroups(selectedReportKeys(), loadReportFilters().show));
        });
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeReportModal();
            }
        });
    }

    function renderReportsMenu() {
        const mount = panelRef && panelRef.querySelector('#classroomDebateRecReportsWrap');
        if (!mount) {
            return;
        }
        const icon = '<svg class="classroom-essay-reports-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
        mount.innerHTML = `
            <div class="classroom-essay-reports-menu${reportsMenuOpen ? ' is-open' : ''}">
                <button type="button" id="classroomDebateRecReportsBtn" class="btn btn-outline btn-compact classroom-essay-reports-btn" aria-expanded="${reportsMenuOpen ? 'true' : 'false'}" aria-haspopup="menu">${icon}${escapeHtml(t('debateRecReportsBtn'))} ▾</button>
                <div class="classroom-essay-reports-dropdown" role="menu"${reportsMenuOpen ? '' : ' hidden'}>
                    <button type="button" class="classroom-essay-reports-item" data-report-action="print-class" role="menuitem"${classId ? '' : ' disabled'}>${escapeHtml(t('debateRecReportPrintClass'))}</button>
                    <button type="button" class="classroom-essay-reports-item" data-report-action="all-report" role="menuitem">${escapeHtml(t('debateRecReportAllClasses'))}</button>
                    <button type="button" class="classroom-essay-reports-item" data-report-action="copy-class" role="menuitem"${classId ? '' : ' disabled'}>${escapeHtml(t('debateRecReportCopy'))}</button>
                </div>
            </div>`;
    }

    // ── Parent message ──────────────────────────────────────────────────

    function copyText(text, doneMessage) {
        const fallback = () => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try {
                ok = document.execCommand('copy');
            } catch (_) {
                ok = false;
            }
            document.body.removeChild(ta);
            return ok;
        };
        const done = (ok) => {
            if (hooks.showToast) {
                hooks.showToast(ok ? doneMessage : t('classroomEssayWarnCopyFailed'), !ok);
            }
        };
        // Called straight from the click so the browser allows the clipboard write.
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
            global.navigator.clipboard.writeText(text).then(() => done(true), () => done(fallback()));
        } else {
            done(fallback());
        }
    }

    function copyParentMessage(rowId, studentId, lang) {
        const api = printApi();
        const view = getView();
        const row = view.rows.find((r) => r.day.rowId === rowId && r.student.id === studentId);
        const classData = getClassData();
        if (!api || !row) {
            return;
        }
        const text = api.buildParentMessage({
            studentName: row.student.name,
            nameEn: row.student.nameEn,
            className: classData ? classData.name : '',
            date: row.day.date,
            teacherName: teacherName(currentUserId())
        }, lang === 'ko' ? 'ko' : 'en');
        copyText(text, tf('debateRecParentMsgCopied', { name: row.student.nameEn || row.student.name }));
    }

    // ── Render ─────────────────────────────────────────────────────────

    function renderContextBar(view) {
        const mount = panelRef.querySelector('#classroomDebateRecContextBar');
        if (!mount) {
            return;
        }
        const classData = getClassData();
        if (!classData) {
            mount.innerHTML = `<p class="section-hint">${escapeHtml(t('debateRecPickClass'))}</p>`;
            return;
        }
        if (!domain().classUsesDebateTeamAssignments(classData)) {
            mount.innerHTML = `<p class="section-hint">${escapeHtml(t('debateRecNotDebateClass'))}</p>`;
            return;
        }
        if (!view.days.length) {
            mount.innerHTML = `<p class="section-hint">${escapeHtml(t('debateRecNoDay4'))}</p>`;
            return;
        }
        const chip = (rowId, label, badge, extraCls) => {
            const active = selectedRowId === rowId;
            return `<button type="button" class="btn btn-small selection-chip debate-rec-day-chip${active ? ' is-active' : ''}${extraCls || ''}" data-row-id="${escapeAttr(rowId)}" aria-pressed="${active ? 'true' : 'false'}">${escapeHtml(label)}${badge}</button>`;
        };
        const dayChips = view.days.map((day) => {
            const c = view.dayCounts[day.rowId] || {};
            let badge = '';
            let cls = '';
            if (!c.past) {
                cls = ' debate-rec-day-chip--future';
            } else if (c.open || c.notChecked) {
                // Red: absent (Not recorded) or not verified yet; amber: needs confirmation.
                if (c.notRecorded) {
                    badge += ` <span class="debate-rec-day-badge debate-rec-day-badge--high" title="${escapeAttr(t('debateRecStatusNotRecorded'))}">${c.notRecorded}</span>`;
                }
                if (c.notChecked) {
                    badge += ` <span class="debate-rec-day-badge debate-rec-day-badge--high" title="${escapeAttr(t('debateRecAlertNcTitle'))}">?${c.notChecked}</span>`;
                }
                if (c.needsConfirmation) {
                    badge += ` <span class="debate-rec-day-badge debate-rec-day-badge--medium" title="${escapeAttr(t('debateRecStatusNeedsConfirmation'))}">${c.needsConfirmation}</span>`;
                }
                cls = c.notRecorded || c.notChecked ? ' debate-rec-day-chip--open' : ' debate-rec-day-chip--confirm';
            } else {
                badge = ' <span class="debate-rec-day-badge debate-rec-day-badge--ok" aria-hidden="true">✓</span>';
            }
            const src = day.dateSource === 'tms' ? t('debateRecDateFromTms') : t('debateRecDateFromSyllabus');
            return chip(day.rowId, `${formatShortDate(day.date)} (${src})`, badge, cls);
        }).join('');
        mount.innerHTML = `
            <div class="classroom-essay-context-field classroom-essay-context-field--grow">
                <span class="classroom-essay-context-label">${escapeHtml(t('debateRecDay4Dates'))}</span>
                <div class="debate-rec-day-chips" role="group" aria-label="${escapeAttr(t('debateRecDay4Dates'))}">
                    ${chip('', t('debateRecAllDates'), '', '')}
                    ${dayChips}
                </div>
            </div>`;
    }

    function renderStats(view) {
        const mount = panelRef.querySelector('#classroomDebateRecStatsBar');
        if (!mount) {
            return;
        }
        const c = view.counts || {};
        if (!view.days || !view.days.length) {
            mount.innerHTML = '';
            return;
        }
        const tile = (key, labelKey, mod) =>
            `<span class="debate-rec-stat debate-rec-stat--${mod}">${escapeHtml(t(labelKey))}: <strong>${Number(c[key] || 0)}</strong></span>`;
        mount.innerHTML = `
            <div class="debate-rec-stats">
                ${tile('not_recorded', 'debateRecStatusNotRecorded', 'not-recorded')}
                ${tile('needs_confirmation', 'debateRecStatusNeedsConfirmation', 'confirm')}
                ${tile('received', 'debateRecStatusReceived', 'received')}
                ${tile('present', 'debateRecStatusPresent', 'recorded')}
                ${tile('recorded', 'debateRecStatusRecorded', 'recorded')}
                ${tile('exempt', 'debateRecStatusExempt', 'exempt')}
                ${tile('not_checked', 'debateRecStatusNotChecked', 'not-checked')}
                ${tile('hrUnnotified', 'debateRecHrPending', 'hr-needed')}
            </div>`;
    }

    function renderToolbarState() {
        const btn = panelRef && panelRef.querySelector('#classroomDebateRecCheckBtn');
        const editable = canEdit();
        if (btn) {
            btn.disabled = checkRunning || !editable || !classId;
            btn.textContent = checkRunning ? t('debateRecChecking') : t('debateRecCheckTms');
        }
        const scope = panelRef && panelRef.querySelector('#classroomDebateRecCheckScope');
        if (scope) {
            scope.disabled = checkRunning || !editable;
        }
        const last = panelRef && panelRef.querySelector('#classroomDebateRecLastChecked');
        if (last) {
            const iso = readLastChecked();
            last.textContent = iso
                ? tf('debateRecLastChecked', { time: new Date(iso).toLocaleString() })
                : t('debateRecNeverChecked');
        }
    }

    function statusChip(status) {
        const meta = STATUS_META[status];
        if (!meta) {
            return '';
        }
        return `<span class="debate-rec-status ${meta.cls}">${escapeHtml(t(meta.key))}</span>`;
    }

    function reasonChip(reason) {
        const meta = REASON_META[reason];
        if (!meta) {
            return '';
        }
        return `<span class="debate-rec-reason ${meta.cls}">${escapeHtml(t(meta.key))}</span>`;
    }

    function choiceButtons(rowId, studentId, rec, editable, displayStatus) {
        const status = displayStatus || rec.debateRecStatus;
        const choices = CHOICES_FOR[status] || [];
        const disabled = editable ? '' : ' disabled';
        return choices.map((choice) => {
            const meta = STATUS_META[choice];
            const isCurrent = choice === status && rec.debateRecSource === 'teacher';
            return `<button type="button" class="btn btn-small selection-chip classroom-status-chip debate-rec-choice ${meta.cls}${isCurrent ? ' is-active' : ''}" data-action="set-status" data-row-id="${escapeAttr(rowId)}" data-student-id="${escapeAttr(studentId)}" data-status="${escapeAttr(choice)}" aria-pressed="${isCurrent ? 'true' : 'false'}"${disabled}>${escapeHtml(t(meta.key))}</button>`;
        }).join('');
    }

    function renderRows(view) {
        const mount = panelRef.querySelector('#classroomDebateRecRows');
        if (!mount) {
            return;
        }
        const editable = canEdit();
        const rows = view.rows.filter((r) => !selectedRowId || r.day.rowId === selectedRowId);
        if (!rows.length) {
            const msg = view.days.length ? t('debateRecEmptyNoPastDay4') : '';
            mount.innerHTML = msg
                ? `<tr><td colspan="7" class="section-hint debate-rec-empty">${escapeHtml(msg)}</td></tr>`
                : '';
            return;
        }
        mount.innerHTML = rows.map((r) => {
            const sid = r.student.id;
            const rowId = r.day.rowId;
            const key = `${rowId}|${sid}`;
            const rec = r.rec;
            const nameText = r.student.nameEn
                ? `${escapeHtml(r.student.name)} <span class="classroom-student-name-en">${escapeHtml(r.student.nameEn)}</span>`
                : escapeHtml(r.student.name);
            const shown = r.displayStatus || rec.debateRecStatus;
            const msgLangBtn = (lang, label) => `<button type="button" class="btn btn-outline btn-small debate-rec-msg-btn" data-action="copy-parent-msg" data-lang="${lang}" data-row-id="${escapeAttr(rowId)}" data-student-id="${escapeAttr(sid)}" title="${escapeAttr(t(lang === 'ko' ? 'parentMsgTitleKo' : 'parentMsgTitleEn'))}" aria-label="${escapeAttr(tf(lang === 'ko' ? 'parentMsgAriaKo' : 'parentMsgAriaEn', { name: r.student.nameEn || r.student.name }))}">${lang === 'en' ? MSG_ICON : ''}${escapeHtml(label)}</button>`;
            const msgBtn = shown === 'not_recorded'
                ? ` <span class="debate-rec-msg-group" role="group" aria-label="${escapeAttr(t('debateRecParentMsgTitle'))}">${msgLangBtn('en', 'English')}${msgLangBtn('ko', '한국어')}</span>`
                : '';
            const name = `<div class="debate-rec-student-cell"><span>${nameText}</span>${msgBtn}</div>`;
            const tmsRaw = rec.debateRecTmsStatus
                ? `${escapeHtml(rec.debateRecTmsStatus)}${rec.debateRecTmsMemo ? ` · <span class="debate-rec-tms-memo">${escapeHtml(rec.debateRecTmsMemo)}</span>` : ''}`
                : '';
            const reasonHtml = reasonChip(r.reason);
            const tmsLine = reasonHtml || tmsRaw
                ? `${reasonHtml}${reasonHtml && tmsRaw ? ' ' : ''}${tmsRaw ? `<span class="debate-rec-tms-raw">${tmsRaw}</span>` : ''}`
                : '—';
            const isTeacher = rec.debateRecSource === 'teacher';
            const statusHint = shown === 'needs_confirmation'
                ? confirmReasonHint(r)
                : (shown === 'not_checked' ? t('debateRecNotCheckedHint') : t('debateRecFromTmsHint'));
            const who = isTeacher
                ? `<div class="debate-rec-setby section-hint">${escapeHtml(tf('debateRecSetBy', {
                    name: teacherName(rec.debateRecUpdatedBy) || t('debateRecTeacher'),
                    date: formatShortDate(String(rec.debateRecUpdatedAt || '').slice(0, 10))
                }))}</div>`
                : `<div class="debate-rec-setby section-hint">${escapeHtml(statusHint)}</div>`;
            const resetBtn = isTeacher
                ? `<button type="button" class="btn btn-outline btn-small debate-rec-reset" data-action="reset" data-row-id="${escapeAttr(rowId)}" data-student-id="${escapeAttr(sid)}" title="${escapeAttr(t('debateRecResetHint'))}"${editable ? '' : ' disabled'}>↺ ${escapeHtml(t('debateRecResetToTms'))}</button>`
                : '';
            const hrNeeded = shown === 'not_recorded' && !rec.debateRecHrNotified;
            const focus = focusStudentId && focusStudentId === sid ? ' debate-rec-row--focus' : '';
            const hrClass = hrNeeded ? ' debate-rec-row--hr-needed' : '';
            const day = r.day;
            const dateSrc = day.dateSource === 'tms' ? t('debateRecDateFromTms') : t('debateRecDateFromSyllabus');
            return `<tr class="debate-rec-row debate-rec-row--${escapeAttr(shown)}${hrClass}${focus}" data-row-id="${escapeAttr(rowId)}" data-student-id="${escapeAttr(sid)}">
                <td class="classroom-sheet-col-select"><input type="checkbox" class="debate-rec-select" data-key="${escapeAttr(key)}" ${selectedKeys.has(key) ? 'checked' : ''}${editable ? '' : ' disabled'} aria-label="${escapeAttr(r.student.name)}" /></td>
                <td class="classroom-sheet-col-student">${name}</td>
                <td class="debate-rec-col-date">${escapeHtml(formatShortDate(day.date))} <span class="section-hint">(${escapeHtml(dateSrc)})</span></td>
                <td class="debate-rec-col-tms">${tmsLine}</td>
                <td class="classroom-sheet-col-status debate-rec-col-status">
                    <div class="debate-rec-status-line">${statusChip(shown)}</div>
                    <div class="debate-rec-choices" role="group" aria-label="${escapeAttr(t('debateRecColRecording'))}">${choiceButtons(rowId, sid, rec, editable, shown)}${resetBtn}</div>
                    ${who}
                </td>
                <td class="debate-rec-col-hr"><input type="checkbox" class="debate-rec-hr" data-row-id="${escapeAttr(rowId)}" data-student-id="${escapeAttr(sid)}"${rec.debateRecHrNotified ? ' checked' : ''}${editable ? '' : ' disabled'} aria-label="${escapeAttr(tf('debateRecHrAria', { name: r.student.name || '' }))}" /></td>
                <td class="classroom-sheet-col-notes"><input type="text" class="field-control debate-rec-note" data-row-id="${escapeAttr(rowId)}" data-student-id="${escapeAttr(sid)}" value="${escapeAttr(rec.debateRecNote || '')}" placeholder="${escapeAttr(t('debateRecNotePlaceholder'))}"${editable ? '' : ' disabled'} /></td>
            </tr>`;
        }).join('');
        if (focusStudentId) {
            const el = mount.querySelector('.debate-rec-row--focus');
            if (el && el.scrollIntoView) {
                el.scrollIntoView({ block: 'center' });
            }
            focusStudentId = '';
        }
    }

    /** Line under Needs confirmation: arrived late, left early, new student, or the TMS word. */
    function confirmReasonHint(row) {
        if (row && row.confirmReason === 'late') {
            return t('debateRecConfirmLate');
        }
        if (row && row.confirmReason === 'early_leave') {
            return t('debateRecConfirmEarly');
        }
        if (row && row.confirmReason === 'new_student') {
            return t('debateRecNewStudentHint');
        }
        if (row && row.confirmReason === 'other' && row.confirmReasonDetail) {
            return row.confirmReasonDetail;
        }
        return t('debateRecFromTmsHint');
    }

    /** Warn when a shown Day 4 has not been checked against TMS yet. */
    function renderSyncWarning(view) {
        const el = panelRef.querySelector('#classroomDebateRecSyncWarn');
        if (!el) {
            return;
        }
        const unchecked = view.days.filter((day) => {
            const c = view.dayCounts[day.rowId] || {};
            return c.past && !c.checked && (!selectedRowId || selectedRowId === day.rowId);
        });
        if (!unchecked.length) {
            el.hidden = true;
            el.textContent = '';
            return;
        }
        const gapDates = [];
        const freshDates = [];
        unchecked.forEach((day) => {
            const c = view.dayCounts[day.rowId] || {};
            (c.coverageGap ? gapDates : freshDates).push(formatShortDate(day.date));
        });
        const parts = [];
        if (freshDates.length) {
            parts.push(tf('debateRecSyncWarn', { dates: freshDates.join(', ') }));
        }
        if (gapDates.length) {
            parts.push(tf('debateRecSyncWarnGap', { dates: gapDates.join(', ') }));
        }
        el.hidden = false;
        el.textContent = parts.join(' ');
    }

    function renderBatch() {
        const mount = panelRef.querySelector('#classroomDebateRecBatchActions');
        if (!mount) {
            return;
        }
        if (!selectedKeys.size) {
            mount.innerHTML = '';
            mount.hidden = true;
            return;
        }
        const disabled = canEdit() ? '' : ' disabled';
        const btn = (status) => `<button type="button" class="btn btn-small debate-rec-batch-btn ${STATUS_META[status].cls}" data-batch-status="${status}"${disabled}>${escapeHtml(t(STATUS_META[status].key))}</button>`;
        mount.hidden = false;
        mount.innerHTML = `
            <div class="classroom-essay-batch-row classroom-batch-row">
                <span class="classroom-essay-batch-label">${escapeHtml(tf('debateRecBatchSelected', { count: selectedKeys.size }))}</span>
                ${btn('received')}${btn('recorded')}${btn('exempt')}${btn('not_recorded')}
                <button type="button" id="classroomDebateRecBatchClearBtn" class="btn btn-outline btn-compact btn-small">${escapeHtml(t('debateRecBatchClear'))}</button>
            </div>`;
    }

    function render() {
        const panel = panelRef || document.getElementById('panel-debate-rec');
        if (!panel) {
            return;
        }
        panelRef = panel;
        const view = getView();
        if (selectedRowId && !view.days.some((day) => day.rowId === selectedRowId)) {
            selectedRowId = null;
        }
        if (selectedRowId === null) {
            const past = view.days.filter((day) => (view.dayCounts[day.rowId] || {}).past);
            selectedRowId = past.length ? past[past.length - 1].rowId : '';
        }
        const validKeys = new Set(view.rows.map((r) => `${r.day.rowId}|${r.student.id}`));
        Array.from(selectedKeys).forEach((k) => {
            if (!validKeys.has(k)) {
                selectedKeys.delete(k);
            }
        });
        renderContextBar(view);
        renderStats(view);
        renderToolbarState();
        renderReportsMenu();
        renderRows(view);
        renderSyncWarning(view);
        renderBatch();
        const selectAll = panel.querySelector('#classroomDebateRecSelectAll');
        if (selectAll) {
            const visible = view.rows.filter((r) => !selectedRowId || r.day.rowId === selectedRowId);
            selectAll.disabled = !visible.length || !canEdit();
            selectAll.checked = visible.length > 0 && visible.every((r) => selectedKeys.has(`${r.day.rowId}|${r.student.id}`));
        }
    }

    // ── Events ─────────────────────────────────────────────────────────

    function bindMountEvents(panel) {
        if (mountEventsBound) {
            return;
        }
        mountEventsBound = true;
        if (!docClickBound && typeof document !== 'undefined' && document.addEventListener) {
            docClickBound = true;
            document.addEventListener('click', (event) => {
                const target = event.target instanceof Element ? event.target : null;
                if (reportsMenuOpen && !(target && target.closest && target.closest('#classroomDebateRecReportsWrap'))) {
                    reportsMenuOpen = false;
                    renderReportsMenu();
                }
            });
        }
        panel.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) {
                return;
            }
            if (target.closest('#classroomDebateRecReportsBtn')) {
                event.stopPropagation();
                reportsMenuOpen = !reportsMenuOpen;
                renderReportsMenu();
                return;
            }
            const reportItem = target.closest('[data-report-action]');
            if (reportItem) {
                const action = reportItem.getAttribute('data-report-action');
                reportsMenuOpen = false;
                renderReportsMenu();
                if (action === 'print-class') {
                    printClassReport();
                } else if (action === 'all-report') {
                    openReportModal();
                } else if (action === 'copy-class') {
                    void copyClassList();
                }
                return;
            }
            const dayChip = target.closest('.debate-rec-day-chip');
            if (dayChip) {
                selectedRowId = dayChip.getAttribute('data-row-id') || '';
                render();
                return;
            }
            if (target.closest('#classroomDebateRecCheckBtn')) {
                void runTmsCheck();
                return;
            }
            const setBtn = target.closest('[data-action="set-status"]');
            if (setBtn) {
                void applyTeacherStatus([{
                    rowId: setBtn.getAttribute('data-row-id'),
                    studentId: setBtn.getAttribute('data-student-id')
                }], setBtn.getAttribute('data-status'));
                return;
            }
            const msgBtn = target.closest('[data-action="copy-parent-msg"]');
            if (msgBtn) {
                copyParentMessage(msgBtn.getAttribute('data-row-id'), msgBtn.getAttribute('data-student-id'), msgBtn.getAttribute('data-lang'));
                return;
            }
            const resetBtn = target.closest('[data-action="reset"]');
            if (resetBtn) {
                void resetToTms(resetBtn.getAttribute('data-row-id'), resetBtn.getAttribute('data-student-id'));
                return;
            }
            const batchBtn = target.closest('[data-batch-status]');
            if (batchBtn) {
                const entries = Array.from(selectedKeys).map((k) => {
                    const i = k.indexOf('|');
                    return { rowId: k.slice(0, i), studentId: k.slice(i + 1) };
                });
                selectedKeys.clear();
                void applyTeacherStatus(entries, batchBtn.getAttribute('data-batch-status'));
                return;
            }
            if (target.closest('#classroomDebateRecBatchClearBtn')) {
                selectedKeys.clear();
                render();
            }
        });
        panel.addEventListener('change', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) {
                return;
            }
            if (target.classList.contains('debate-rec-select')) {
                const key = target.getAttribute('data-key');
                if (target.checked) {
                    selectedKeys.add(key);
                } else {
                    selectedKeys.delete(key);
                }
                renderBatch();
                return;
            }
            if (target.id === 'classroomDebateRecSelectAll') {
                const view = getView();
                view.rows
                    .filter((r) => !selectedRowId || r.day.rowId === selectedRowId)
                    .forEach((r) => {
                        const key = `${r.day.rowId}|${r.student.id}`;
                        if (target.checked) {
                            selectedKeys.add(key);
                        } else {
                            selectedKeys.delete(key);
                        }
                    });
                render();
                return;
            }
            if (target.classList.contains('debate-rec-hr')) {
                void saveHrNotified(
                    target.getAttribute('data-row-id'),
                    target.getAttribute('data-student-id'),
                    target.checked
                );
                return;
            }
            if (target.classList.contains('debate-rec-note')) {
                void saveNote(
                    target.getAttribute('data-row-id'),
                    target.getAttribute('data-student-id'),
                    target.value
                );
            }
        });
    }

    function subscribeContext() {
        if (contextSubscribed || typeof global.CCPActiveContext === 'undefined' || !global.CCPActiveContext.subscribe) {
            return;
        }
        contextSubscribed = true;
        global.CCPActiveContext.subscribe(async (detail) => {
            const seq = (contextSeq += 1);
            const panel = panelRef || document.getElementById('panel-debate-rec');
            if (!panel || panel.hidden || !detail || detail.classId === undefined) {
                return;
            }
            const nextClassId = resolveClassId({ classId: detail.classId });
            if (nextClassId === classId) {
                return;
            }
            classId = nextClassId;
            selectedRowId = null;
            selectedKeys.clear();
            await loadAttendance();
            if (seq !== contextSeq) {
                return;
            }
            render();
        });
    }

    async function initTab(nextHooks, options) {
        hooks = nextHooks || hooks;
        const panel = document.getElementById('panel-debate-rec');
        if (!panel) {
            return;
        }
        panelRef = panel;
        bindMountEvents(panel);
        subscribeContext();
        if (options && options.classId && typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.setFromClass) {
            global.CCPActiveContext.setFromClass(getAppData(), options.classId, undefined, 'debate-rec-nav');
        } else if (options && options.classId && global.CCPClassroomZoneContext && global.CCPClassroomZoneContext.setActiveClassId) {
            global.CCPClassroomZoneContext.setActiveClassId(options.classId);
        }
        const nextClassId = resolveClassId(options);
        if (nextClassId !== classId) {
            selectedRowId = null;
        }
        classId = nextClassId;
        focusStudentId = (options && options.focusStudentId) || '';
        selectedKeys.clear();
        render();
        await loadAttendance();
        render();
    }

    async function refreshIfActive() {
        const panel = document.getElementById('panel-debate-rec');
        if (!panel || panel.hidden) {
            return;
        }
        classId = resolveClassId({ classId });
        render();
    }

    global.CCPClassroomDebateRec = {
        initTab,
        buildSubmissionMutations,
        render,
        refreshIfActive
    };
})(typeof window !== 'undefined' ? window : globalThis);
