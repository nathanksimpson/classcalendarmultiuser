/**
 * Essay submission tracking — status workflow per class + syllabus row.
 */
(function (global) {
    let hooks = null;
    let classId = '';
    let syllabusRowId = '';
    let lessonDate = '';
    let draftSubmission = null;
    let currentFilter = 'all';
    const selectedStudentIds = new Set();
    let panelRef = null;
    let autosave = null;
    const ESSAY_AUTOSAVE_DELAY_MS = 400;
    const ESSAY_NOTE_AUTOSAVE_DELAY_MS = 900;
    const progressReportSelectedKeys = new Set();
    let progressReportOutstandingOnly = false;
    let progressReportFilters = {
        essaySubject: '',
        classScope: 'all'
    };
    const classSummarySelectedKeys = new Set();
    let classSummaryFilters = {
        homeroomKey: '',
        month: '',
        warnMode: 'all',
        essaySubject: '',
        classScope: 'all'
    };
    let resubmitDayNoteDirty = false;
    let resubmitDayNoteSyncInFlight = false;
    let reportsMenuOpen = false;
    const resubmitSummarySelectedClassIds = new Set();
    let resubmitSummaryFilters = {
        search: '',
        classTypeId: '',
        grade: '',
        levelLabel: '',
        subject: '',
        essaySubject: '',
        classScope: 'all',
        myClassesOnly: false,
        hasResubmitsOnly: true
    };
    let noteDebouncedSave = null;
    const ESSAY_TMS_USERNAME_KEY = 'ccp.tmsRosterUsername';
    const ESSAY_TMS_BRIDGE_TIMEOUT_MS = 120000;
    const ESSAY_TMS_BRIDGE_STILL_LOADING_MS = 15000;
    let essayTmsPreview = null;
    let essayTmsPlan = [];
    let essayTmsLoading = false;
    let essayTmsApplying = false;
    let essayTmsBound = false;
    let essayTmsHasFetched = false;
    let essayTmsFilterClassId = '';
    let essayTmsFilteredOutOfTermCount = 0;
    let essayTmsStudentQueue = [];
    let essayTmsStudentIndex = 0;
    let essayTmsWizardStep = 1;

    const ESSAY_STATUS_META = {
        not_submitted: { order: 0, cls: 'essay-status--not' },
        submitted: { order: 1, cls: 'essay-status--submitted' },
        complete: { order: 2, cls: 'essay-status--complete' },
        resubmit_required: { order: 2, cls: 'essay-status--resubmit' },
        demerit: { order: 2, cls: 'essay-status--demerit' },
        incomplete: { order: 3, cls: 'essay-status--incomplete' },
        exempt: { order: 3, cls: 'essay-status--exempt' }
    };

    function essayStatusLabelKey(statusKey) {
        if (statusKey === 'submitted') {
            return 'classroomEssayStatusReceived';
        }
        if (statusKey === 'not_submitted') {
            return 'classroomEssayStatusNotSubmitted';
        }
        if (statusKey === 'complete') {
            return 'classroomEssayStatusComplete';
        }
        if (statusKey === 'resubmit_required') {
            return 'classroomEssayStatusResubmit';
        }
        if (statusKey === 'demerit') {
            return 'classroomEssayStatusDemerit';
        }
        if (statusKey === 'incomplete') {
            return 'classroomEssayStatusIncomplete';
        }
        if (statusKey === 'exempt') {
            return 'classroomEssayStatusExempt';
        }
        return 'classroomEssayStatusNotSubmitted';
    }

    function isEssayOutcomeStatus(status) {
        return status === 'incomplete' || status === 'exempt';
    }

    function ensureAutosave(panel) {
        if (autosave || !global.CCPClassroomAutosave) {
            return;
        }
        autosave = global.CCPClassroomAutosave.create({
            delayMs: ESSAY_AUTOSAVE_DELAY_MS,
            debounce: hooks && hooks.debounce ? hooks.debounce : null,
            t,
            i18nPrefix: 'classroomEssaySave',
            getStatusEl: () => (panelRef || panel).querySelector('#classroomEssaysSaveStatus'),
            saveAsync: (opts) => persistEssays(panelRef || panel, opts)
        });
    }

    function scheduleStatusSave() {
        ensureAutosave(panelRef);
        if (autosave) {
            autosave.scheduleSave();
        }
    }

    function ensureNoteDebouncedSave() {
        if (noteDebouncedSave || !hooks || !hooks.debounce) {
            return;
        }
        noteDebouncedSave = hooks.debounce(() => {
            scheduleStatusSave();
        }, ESSAY_NOTE_AUTOSAVE_DELAY_MS);
    }

    function scheduleNoteSave() {
        ensureAutosave(panelRef);
        ensureNoteDebouncedSave();
        if (autosave) {
            autosave.updateStatus('pending');
        }
        if (noteDebouncedSave) {
            noteDebouncedSave();
        } else {
            scheduleStatusSave();
        }
    }

    function flushNoteSave() {
        if (noteDebouncedSave && noteDebouncedSave.flush) {
            noteDebouncedSave.flush();
        }
    }

    function scheduleSave() {
        scheduleStatusSave();
    }

    function domain() {
        return global.CCPClassroomDomain;
    }

    function access() {
        return global.CCPClassroomAccess;
    }

    function t(key) {
        return hooks && hooks.t ? hooks.t(key) : key;
    }

    function tf(key, vars) {
        let s = t(key);
        if (vars && typeof vars === 'object') {
            Object.entries(vars).forEach(([name, value]) => {
                s = s.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value ?? ''));
            });
        }
        return s;
    }

    function escapeHtml(s) {
        if (typeof CCPUtils !== 'undefined' && CCPUtils.escapeHtml) {
            return CCPUtils.escapeHtml(s);
        }
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escapeAttr(s) {
        return escapeHtml(s).replace(/"/g, '&quot;');
    }

    function getAppData() {
        if (hooks && hooks.getAppData) {
            return hooks.getAppData();
        }
        if (typeof global.appData !== 'undefined') {
            return global.appData;
        }
        return {};
    }

    function getClassData() {
        const data = getAppData();
        const d = domain();
        if (d && typeof d.resolveEssayTarget === 'function') {
            return d.resolveEssayTarget(data, classId);
        }
        const fromClasses = (data.classes || []).find((c) => c && c.id === classId) || null;
        if (fromClasses) {
            return fromClasses;
        }
        if (d && typeof d.findEssayGroup === 'function' && typeof d.essayGroupAsClassView === 'function') {
            const group = d.findEssayGroup(data, classId);
            return group ? d.essayGroupAsClassView(group) : null;
        }
        return null;
    }

    function isCurrentEssayGroup() {
        const classData = getClassData();
        return Boolean(classData && classData.isEssayGroup);
    }

    function getStudents() {
        const d = domain();
        const data = getAppData();
        return d ? d.resolveStudentsForClass(getClassData(), data.cohorts) : [];
    }

    function getAccessibleClasses() {
        const data = getAppData();
        const cohorts = data.cohorts || [];
        // Classroom essays must list every editable class (no active-cohort trap).
        return (data.classes || []).filter(
            (c) => c && (!access() || access().canEditClass(c, cohorts) || access().canBypass())
        );
    }

    function getAccessibleEssayGroups() {
        const data = getAppData();
        const d = domain();
        const cohorts = data.cohorts || [];
        if (!d || !d.essayGroupAsClassView) {
            return [];
        }
        return (data.essayGroups || [])
            .map((g) => d.essayGroupAsClassView(g))
            .filter(
                (g) =>
                    g &&
                    (!access() ||
                        (access().canEditEssayGroup && access().canEditEssayGroup(g, cohorts)) ||
                        access().canEditClass(g, cohorts) ||
                        access().canBypass())
            );
    }

    function getEssayVisibleClasses(options) {
        // Do NOT rely on CCPClassroomZoneContext here.
        // In production the zone context is not active for Essays, so its internal activeTabId
        // may not be 'essays' and non-essay classes can leak into the Essays tab/report flows.
        const opts = options || {};
        const essaysOnly = Object.prototype.hasOwnProperty.call(opts, 'essaysOnly')
            ? Boolean(opts.essaysOnly)
            : true;
        // Access (canEdit/bypass) already scopes regular teachers to assigned classes.
        // Do not force "mine" here — graders who can edit other teachers' classes (e.g. Yuma/Leo)
        // must still see them. Optional Mine chip narrows in the picker UI.
        const myClassesOnly = Object.prototype.hasOwnProperty.call(opts, 'myClassesOnly')
            ? Boolean(opts.myClassesOnly)
            : false;
        const includeGroups = Object.prototype.hasOwnProperty.call(opts, 'includeGroups')
            ? Boolean(opts.includeGroups)
            : true;
        const base = getAccessibleClasses().concat(includeGroups ? getAccessibleEssayGroups() : []);
        const api = global.CCPEssayClassFilter;
        const d = domain();
        const ctx = {
            domain: d,
            currentUserId: hooks && hooks.getCurrentUserId ? hooks.getCurrentUserId() : '',
            deps: {
                classIsMine:
                    hooks && hooks.classIsMine
                        ? (c, userId) => hooks.classIsMine(c, userId)
                        : undefined
            }
        };
        if (api && typeof api.filterClassesForZoneContext === 'function') {
            return api.filterClassesForZoneContext(base, { myClassesOnly, essaysOnly }, ctx);
        }
        let filtered = base;
        if (essaysOnly) {
            if (api && typeof api.classHasEssayAssignments === 'function') {
                filtered = base.filter((c) => api.classHasEssayAssignments(c, d));
            } else if (d && typeof d.getEssayRowsFromSyllabus === 'function') {
                filtered = base.filter(
                    (c) =>
                        d.getEssayRowsFromSyllabus(c && c.syllabusRows, { classData: c }).length > 0
                );
            }
        }
        return myClassesOnly && ctx.deps.classIsMine
            ? filtered.filter((c) => ctx.deps.classIsMine(c, ctx.currentUserId))
            : filtered;
    }

    /** Class picker: all editable classes + essay groups (so Add assignment works before any essays exist). */
    function getEssayPickerClasses() {
        return getEssayVisibleClasses({ essaysOnly: false, includeGroups: true });
    }

    function syncClassIdFromContext() {
        if (typeof global.CCPActiveContext !== 'undefined') {
            const ctxId = global.CCPActiveContext.getActiveClassId();
            if (ctxId) {
                classId = ctxId;
            }
        } else {
            const ui = getAppData().ui || {};
            if (ui.classroomTabClassId) {
                classId = ui.classroomTabClassId;
            }
        }
    }

    function getSavedEssayAssignmentId(cId) {
        const api = global.CCPAssignments;
        if (api && api.getSelected) {
            return api.getSelected('essay', cId, getAppData());
        }
        const ui = getAppData().ui || {};
        const map = ui.essayAssignmentByClassId || {};
        return map[cId] || '';
    }

    function rowExistsInClass(classData, rowId) {
        const d = domain();
        if (!classData || !d || !rowId) {
            return false;
        }
        return d
            .getEssayRowsFromSyllabus(classData.syllabusRows, { classData })
            .some((r) => d.getSyllabusRowKey(r) === rowId);
    }

    function resolveEssayAssignmentForClass(classData, preferredDate) {
        const d = domain();
        if (!classData || !d) {
            return null;
        }
        const today = d.todayISO ? d.todayISO() : '';
        const preferred = String(preferredDate || '').trim();
        const refDate = preferred || today;
        const savedId = getSavedEssayAssignmentId(classData.id);
        if (savedId && rowExistsInClass(classData, savedId)) {
            const saved = d
                .getEssayRowsFromSyllabus(classData.syllabusRows, { classData })
                .find((r) => d.getSyllabusRowKey(r) === savedId);
            if (saved) {
                if (!preferred) {
                    return saved;
                }
                if (typeof d.sameCalendarMonth !== 'function' || d.sameCalendarMonth(saved.date, preferred)) {
                    return saved;
                }
            }
        }
        return d.pickDefaultEssaySyllabusRow(classData, refDate);
    }

    function persistEssayAssignmentForClass(cId, rowId) {
        const api = global.CCPAssignments;
        if (api && api.select) {
            api.select('essay', cId, rowId, { silent: true, appData: getAppData() });
        }
        if (hooks && hooks.setUiPref) {
            hooks.setUiPref('classroomTabEssaySyllabusRowId', rowId);
        }
        if (typeof global.saveUiStateToLocalStorage === 'function') {
            global.saveUiStateToLocalStorage();
        }
    }

    function applyResolvedAssignment(classData, preferredDate) {
        const d = domain();
        const row = resolveEssayAssignmentForClass(classData, preferredDate);
        if (row && d) {
            syllabusRowId = d.getSyllabusRowKey(row);
            lessonDate = row.date || '';
            if (classData && classData.id && syllabusRowId) {
                persistEssayAssignmentForClass(classData.id, syllabusRowId);
            }
        } else {
            syllabusRowId = '';
        }
    }

    function ensureClassVisibleAfterFilter(panel, options) {
        const silent = options && options.silent;
        // Use picker list (includes classes with no essays yet) so Add assignment stays usable.
        const visible = getEssayPickerClasses();
        if (!visible.length) {
            return false;
        }
        if (classId && visible.some((c) => c && c.id === classId)) {
            return false;
        }
        const preferredDate = lessonDate;
        const nextId = visible[0].id;
        if (typeof global.CCPActiveContext !== 'undefined') {
            global.CCPActiveContext.setFromClass(getAppData(), nextId, undefined, 'essays-class-filter');
        } else if (hooks && hooks.setUiPref) {
            hooks.setUiPref('classroomTabClassId', nextId);
            classId = nextId;
        } else {
            classId = nextId;
        }
        syncClassIdFromContext();
        applyResolvedAssignment(getClassData(), preferredDate);
        selectedStudentIds.clear();
        loadSubmission();
        if (!silent && panel && hooks && hooks.showToast) {
            const cls = getClassData();
            hooks.showToast(tf('essayClassFilterSwitchedClass', { name: (cls && cls.name) || classId }));
        }
        return true;
    }

    function getAssignmentLabelForCurrent() {
        const classData = getClassData();
        const d = domain();
        if (!classData || !d || !syllabusRowId) {
            return '';
        }
        const row = d
            .getEssayRowsFromSyllabus(classData.syllabusRows, { classData })
            .find((r) => d.getSyllabusRowKey(r) === syllabusRowId);
        if (!row) {
            return '';
        }
        return `${row.date || ''} — ${row.planTitle || row.planDetail || ''}`.trim();
    }

    /** Which parent reminder (if any) fits this student right now: 'overdue', 'resubmit' or ''. */
    function parentMessageKind(rec) {
        const d = domain();
        if (!d || !draftSubmission) {
            return '';
        }
        const r = rec || { status: 'not_submitted', submissionLate: false, overdueDismissed: false };
        if (r.status === 'resubmit_required' && !r.submittedRetest) {
            return 'resubmit';
        }
        if (r.status === 'not_submitted' && !r.overdueDismissed
            && d.isEssaySubmissionOverdue(r, draftSubmission.ssDueDate || '')) {
            return 'overdue';
        }
        return '';
    }

    function buildParentMessageButton(entry, kind) {
        if (!kind || !global.CCPParentMessages) {
            return '';
        }
        const name = entry.student.nameEn || entry.student.name;
        const icon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
        const btn = (lang, label) => `<button type="button" class="btn btn-outline btn-small classroom-essay-msg-btn" data-action="copy-essay-parent-msg" data-lang="${lang}" data-student-id="${escapeAttr(entry.student.id)}" data-kind="${escapeAttr(kind)}" title="${escapeAttr(t(lang === 'ko' ? 'parentMsgTitleKo' : 'parentMsgTitleEn'))}" aria-label="${escapeAttr(tf(lang === 'ko' ? 'parentMsgAriaKo' : 'parentMsgAriaEn', { name }))}">${lang === 'en' ? icon : ''}${escapeHtml(label)}</button>`;
        return `<span class="classroom-essay-msg-group" role="group" aria-label="${escapeAttr(t(kind === 'resubmit' ? 'classroomEssayParentMsgTitleResubmit' : 'classroomEssayParentMsgTitleOverdue'))}">${btn('en', 'English')}${btn('ko', '한국어')}</span>`;
    }

    function copyEssayParentMessage(studentId, kind, lang) {
        const api = global.CCPParentMessages;
        const d = domain();
        const entry = getStudents().find((e) => e && e.student && e.student.id === studentId);
        if (!api || !d || !entry) {
            return;
        }
        const classData = getClassData();
        const row = classData
            ? d.getEssayRowsFromSyllabus(classData.syllabusRows, { classData }).find((r) => d.getSyllabusRowKey(r) === syllabusRowId)
            : null;
        const userId = hooks && hooks.getCurrentUserId ? hooks.getCurrentUserId() : '';
        const text = api.essay({
            kind,
            studentName: entry.student.name,
            nameEn: entry.student.nameEn,
            className: classData ? classData.name : '',
            assignedDate: row ? row.date : '',
            teacherName: hooks && hooks.getUserDisplayName ? hooks.getUserDisplayName(userId) : ''
        }, lang === 'ko' ? 'ko' : 'en');
        void copyTextToClipboard(text, 'classroomEssayParentMsgCopied');
    }

    async function syncResubmitDayNote() {
        const d = domain();
        const today = d ? d.todayISO() : '';
        if (!hooks || !hooks.syncEssayResubmitDayNote || !classId || !today) {
            return;
        }
        await hooks.syncEssayResubmitDayNote(classId, today, {
            syllabusRowId,
            essaySubmission: draftSubmission,
            assignmentLabel: getAssignmentLabelForCurrent()
        });
    }

    function syncResubmitDayNoteIfNeeded() {
        if (!resubmitDayNoteDirty || resubmitDayNoteSyncInFlight) {
            return;
        }
        resubmitDayNoteDirty = false;
        resubmitDayNoteSyncInFlight = true;
        Promise.resolve(syncResubmitDayNote())
            .catch(() => {
                resubmitDayNoteDirty = true;
                if (hooks && hooks.showToast) {
                    hooks.showToast(t('classroomEssayResubmitNoteSyncError'), true);
                }
            })
            .finally(() => {
                resubmitDayNoteSyncInFlight = false;
                if (resubmitDayNoteDirty) {
                    syncResubmitDayNoteIfNeeded();
                }
            });
    }

    function loadProgressReportSelection() {
        const data = getAppData();
        progressReportSelectedKeys.clear();
        const raw = data.ui && data.ui.essayProgressReportSelection;
        if (typeof raw === 'string' && raw.trim()) {
            raw.split(',').forEach((key) => {
                const trimmed = key.trim();
                if (trimmed) {
                    progressReportSelectedKeys.add(trimmed);
                }
            });
        }
    }

    function saveProgressReportSelection() {
        if (hooks && hooks.setUiPref) {
            hooks.setUiPref(
                'essayProgressReportSelection',
                Array.from(progressReportSelectedKeys).join(',')
            );
        }
    }

    function loadProgressReportFilters() {
        const raw = getAppData().ui && getAppData().ui.essayProgressReportFilters;
        progressReportFilters = { essaySubject: '', classScope: 'all' };
        let parsed = raw;
        if (typeof raw === 'string' && raw.trim()) {
            try {
                parsed = JSON.parse(raw);
            } catch (_err) {
                parsed = null;
            }
        }
        if (parsed && typeof parsed === 'object') {
            progressReportFilters.essaySubject =
                typeof parsed.essaySubject === 'string' ? parsed.essaySubject : '';
            progressReportFilters.classScope = normalizeReportClassScope(parsed.classScope);
        }
    }

    function saveProgressReportFilters() {
        if (hooks && hooks.setUiPref) {
            hooks.setUiPref('essayProgressReportFilters', {
                essaySubject: progressReportFilters.essaySubject || '',
                classScope: progressReportFilters.classScope || 'all'
            });
        }
    }

    function listProgressAssignments() {
        const progressApi = global.CCPClassroomEssayProgress;
        if (!progressApi) {
            return [];
        }
        return progressApi.listEssayAssignments(getAppData(), {
            classes: getEssayVisibleClasses(),
            access: access()
        });
    }

    function getProgressPrintLabels() {
        return {
            title: t('classroomEssayProgressReportTitle'),
            sectionNotSubmitted: t('classroomEssayProgressSectionNotSubmitted'),
            sectionResubmit: t('classroomEssayProgressSectionResubmit'),
            noStudents: t('classroomEssayProgressNoStudents'),
            noStudentsInSection: t('classroomEssayProgressNoStudentsInSection'),
            noReason: t('classroomEssayResubmitNoReason'),
            retestReceived: t('classroomEssayResubmitRetestReceived'),
            debateVideoNv: t('classroomEssayDebateVideoNv'),
            generatedAt: t('classroomEssayProgressGeneratedAt'),
            overdue: t('classroomEssayProgressOverdue'),
            receivedLate: t('classroomEssayProgressReceivedLate')
        };
    }

    function formatProgressOverdueChip(row) {
        if (!row || !row.ssOverdue) {
            return '';
        }
        const label =
            row.ssOverdueKind === 'received_late' || row.submissionLate
                ? t('classroomEssayProgressReceivedLate')
                : t('classroomEssayProgressOverdue');
        return ` <span class="classroom-essay-progress-overdue-chip">${escapeHtml(label)}</span>`;
    }

    function formatDebateVideoNvChip(row) {
        if (!row || !row.debateVideoMissing) {
            return '';
        }
        return ` <span class="classroom-essay-progress-overdue-chip">${escapeHtml(t('classroomEssayDebateVideoNv'))}</span>`;
    }

    function formatProgressAssignmentHint(row) {
        const counts = (row && row.counts) || {};
        const notSubmitted = counts.not_submitted || 0;
        const resubmit = counts.resubmit_required || 0;
        return tf('classroomEssayProgressAssignmentHint', { notSubmitted, resubmit });
    }

    function getStudentProgressGroups(assignments) {
        const progressApi = global.CCPClassroomEssayProgress;
        if (!progressApi || !assignments.length) {
            return [];
        }
        const rows = progressApi.listStudentProgressForAssignments(getAppData(), assignments);
        return progressApi.groupStudentProgressForReport(rows);
    }

    function renderProgressStudentSection(title, students, options) {
        const opts = options || {};
        if (!students || !students.length) {
            if (opts.omitEmpty) {
                return '';
            }
            return `<div class="classroom-essay-resubmit-preview-assignment-section">
                <h6 class="classroom-essay-progress-preview-section-title">${escapeHtml(title)}</h6>
                <p class="section-hint">${escapeHtml(t('classroomEssayProgressNoStudentsInSection'))}</p>
            </div>`;
        }
        const lines = students
            .map((row) => {
                if (row.status === 'resubmit_required') {
                    const note = String(row.note || '').trim() || t('classroomEssayResubmitNoReason');
                    const retest = row.submittedRetest
                        ? escapeHtml(t('classroomEssayResubmitRetestReceived'))
                        : '—';
                    const nv = row.debateVideoMissing
                        ? escapeHtml(t('classroomEssayDebateVideoNv'))
                        : '—';
                    return `<tr>
                        <td>${escapeHtml(row.studentName || '')}</td>
                        <td>${escapeHtml(note)}</td>
                        <td>${retest}</td>
                        <td>${nv}</td>
                    </tr>`;
                }
                const overdue = formatProgressOverdueChip(row);
                const nv = formatDebateVideoNvChip(row);
                return `<tr><td colspan="3">${escapeHtml(row.studentName || '')}${overdue}${nv}</td></tr>`;
            })
            .join('');
        const isResubmit = students[0] && students[0].status === 'resubmit_required';
        const tableHead = isResubmit
            ? `<thead><tr>
                <th>${escapeHtml(t('classroomEssayResubmitColStudent'))}</th>
                <th>${escapeHtml(t('classroomEssayResubmitColNote'))}</th>
                <th>${escapeHtml(t('classroomEssayResubmitColRetest'))}</th>
                <th>${escapeHtml(t('classroomEssayDebateVideoNv'))}</th>
            </tr></thead>`
            : '';
        return `<div class="classroom-essay-resubmit-preview-assignment-section">
            <h6 class="classroom-essay-progress-preview-section-title">${escapeHtml(title)}</h6>
            <table class="classroom-essay-resubmit-preview-table">${tableHead}<tbody>${lines}</tbody></table>
        </div>`;
    }

    function renderProgressPreviewHtml(assignments) {
        const groups = getStudentProgressGroups(assignments);
        if (!groups.length) {
            return `<p class="section-hint">${escapeHtml(t('classroomEssayProgressNoStudents'))}</p>`;
        }
        return groups
            .map((group) => {
                const meta = [group.classTypeLabel, group.levelLabel].filter(Boolean).join(' · ');
                const title = meta ? `${group.className} (${meta})` : group.className || '';
                const assignmentBlocks = (group.assignments || [])
                    .map((assign) => {
                        const sections = [
                            renderProgressStudentSection(
                                t('classroomEssayProgressSectionNotSubmitted'),
                                assign.notSubmitted,
                                { omitEmpty: true }
                            ),
                            renderProgressStudentSection(
                                t('classroomEssayProgressSectionResubmit'),
                                assign.resubmit,
                                { omitEmpty: true }
                            )
                        ].join('');
                        return `<div class="classroom-essay-resubmit-preview-assignment">
                            <h5 class="classroom-essay-resubmit-preview-assignment-title">${escapeHtml(assign.assignmentLabel || '')}</h5>
                            ${sections || `<p class="section-hint">${escapeHtml(t('classroomEssayProgressNoStudentsInSection'))}</p>`}
                        </div>`;
                    })
                    .join('');
                return `<div class="classroom-essay-resubmit-preview-class">
                    <h4 class="classroom-essay-resubmit-preview-class-title">${escapeHtml(title)}</h4>
                    ${assignmentBlocks}
                </div>`;
            })
            .join('');
    }

    function progressReportFilterPayload(extra) {
        return Object.assign(
            {
                essaySubject: progressReportFilters.essaySubject || '',
                classScope: progressReportFilters.classScope || 'all',
                currentUserId: reportCurrentUserId(),
                outstandingOnly: progressReportOutstandingOnly
            },
            extra || {}
        );
    }

    function listVisibleProgressAssignments() {
        const progressApi = global.CCPClassroomEssayProgress;
        const all = listProgressAssignments();
        if (!progressApi || !progressApi.filterAssignments) {
            return all;
        }
        return progressApi.filterAssignments(all, {
            essaySubject: progressReportFilters.essaySubject || '',
            classScope: progressReportFilters.classScope || 'all',
            currentUserId: reportCurrentUserId()
        });
    }

    function getSelectedProgressAssignments() {
        const progressApi = global.CCPClassroomEssayProgress;
        if (!progressApi) {
            return [];
        }
        const all = listProgressAssignments();
        if (!progressReportSelectedKeys.size) {
            return progressApi.filterAssignments(all, progressReportFilterPayload());
        }
        return progressApi.filterAssignments(
            all,
            progressReportFilterPayload({ selectedKeys: progressReportSelectedKeys })
        );
    }

    function openInlinePrintDocument(title, bodyHtml, inlineCss) {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
            <style>${inlineCss || ''}</style>
        </head><body class="print-color-mode-light">${bodyHtml}</body></html>`;
        const printWin = window.open('', '_blank');
        if (!printWin) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('printSyllabusBlocked'), true);
            }
            return null;
        }
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.document.title = title;
        printWin.focus();
        const triggerPrint = () => {
            try {
                printWin.focus();
                printWin.print();
            } catch (err) {
                /* ignore */
            }
        };
        // Wait a tick so the popup paints before the print dialog snapshots.
        if (printWin.document.readyState === 'complete') {
            setTimeout(triggerPrint, 50);
        } else {
            printWin.addEventListener('load', () => setTimeout(triggerPrint, 50));
            setTimeout(triggerPrint, 300);
        }
        return printWin;
    }

    function openEssayProgressPrint(assignments) {
        const printApi = global.CCPClassroomEssayProgressPrint;
        if (!printApi || !assignments.length) {
            return;
        }
        const groups = getStudentProgressGroups(assignments);
        if (!groups.length) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayProgressNoStudents'), true);
            }
            return;
        }
        const data = getAppData();
        const d = domain();
        const labels = getProgressPrintLabels();
        const bodyHtml = printApi.renderDocumentHtml(
            {
                calendarName: data.calendarName || '',
                generatedAt: d ? d.todayISO() : '',
                groups
            },
            labels
        );
        openInlinePrintDocument(labels.title, bodyHtml, printApi.PRINT_STYLES || '');
    }

    function renderProgressReportModal() {
        const listEl = document.getElementById('essayProgressAssignmentList');
        const previewEl = document.getElementById('essayProgressPreview');
        const outstandingCb = document.getElementById('essayProgressPendingOnly');
        if (!listEl) {
            return;
        }
        if (outstandingCb) {
            outstandingCb.checked = progressReportOutstandingOnly;
        }
        fillEssayReportSubjectSelect(
            document.getElementById('essayProgressEssaySubjectFilter'),
            progressReportFilters.essaySubject,
            listProgressAssignments()
        );
        fillEssayReportClassScopeSelect(
            document.getElementById('essayProgressClassScopeFilter'),
            progressReportFilters.classScope
        );
        const assignments = listVisibleProgressAssignments();
        const grouped = global.CCPClassroomEssayProgress
            ? global.CCPClassroomEssayProgress.groupAssignmentsByClass(assignments)
            : [];
        const savedSelection = getAppData().ui && getAppData().ui.essayProgressReportSelection;
        const neverSavedSelection = savedSelection === undefined || savedSelection === null;
        if (neverSavedSelection && !progressReportSelectedKeys.size && assignments.length) {
            assignments.forEach((row) => progressReportSelectedKeys.add(row.key));
        }
        listEl.innerHTML = grouped
            .map((group) => {
                const rows = (group.rows || [])
                    .map((row) => {
                        const checked = progressReportSelectedKeys.has(row.key) ? ' checked' : '';
                        const hint = formatProgressAssignmentHint(row);
                        return `<label class="classroom-essay-progress-assignment-row">
                            <input type="checkbox" data-assignment-key="${escapeAttr(row.key)}"${checked} />
                            <span>${escapeHtml(row.assignmentLabel || '')} <span class="section-hint">(${escapeHtml(hint)})</span></span>
                        </label>`;
                    })
                    .join('');
                return `<div class="classroom-essay-progress-class-group">
                    <h4 class="classroom-essay-progress-class-name">${escapeHtml(group.className || '')}</h4>
                    ${rows}
                </div>`;
            })
            .join('');
        listEl.querySelectorAll('input[data-assignment-key]').forEach((input) => {
            input.addEventListener('change', () => {
                const key = input.getAttribute('data-assignment-key');
                if (!key) {
                    return;
                }
                if (input.checked) {
                    progressReportSelectedKeys.add(key);
                } else {
                    progressReportSelectedKeys.delete(key);
                }
                saveProgressReportSelection();
                if (previewEl) {
                    previewEl.innerHTML = renderProgressPreviewHtml(getSelectedProgressAssignments());
                }
            });
        });
        if (previewEl) {
            previewEl.innerHTML = renderProgressPreviewHtml(getSelectedProgressAssignments());
        }
    }

    function openProgressReportModal() {
        const modal = document.getElementById('essayProgressReportModal');
        if (!modal) {
            return;
        }
        loadProgressReportSelection();
        loadProgressReportFilters();
        renderProgressReportModal();
        if (hooks && hooks.openModal) {
            hooks.openModal(modal);
        } else {
            modal.classList.add('active');
            modal.hidden = false;
        }
    }

    function bindProgressReportModal() {
        const modal = document.getElementById('essayProgressReportModal');
        if (!modal || modal.dataset.bound === '1') {
            return;
        }
        modal.dataset.bound = '1';
        document.getElementById('essayProgressReportClose')?.addEventListener('click', () => {
            if (hooks && hooks.closeModal) {
                hooks.closeModal(modal);
            }
        });
        document.getElementById('essayProgressSelectAll')?.addEventListener('click', () => {
            listVisibleProgressAssignments().forEach((row) => {
                if (row && row.key) {
                    progressReportSelectedKeys.add(row.key);
                }
            });
            saveProgressReportSelection();
            renderProgressReportModal();
        });
        document.getElementById('essayProgressClearAll')?.addEventListener('click', () => {
            listVisibleProgressAssignments().forEach((row) => {
                if (row && row.key) {
                    progressReportSelectedKeys.delete(row.key);
                }
            });
            saveProgressReportSelection();
            renderProgressReportModal();
        });
        document.getElementById('essayProgressPendingOnly')?.addEventListener('change', (e) => {
            progressReportOutstandingOnly = !!e.target.checked;
            renderProgressReportModal();
        });
        document.getElementById('essayProgressEssaySubjectFilter')?.addEventListener('change', (e) => {
            progressReportFilters.essaySubject = e.target.value || '';
            saveProgressReportFilters();
            renderProgressReportModal();
        });
        document.getElementById('essayProgressClassScopeFilter')?.addEventListener('change', (e) => {
            progressReportFilters.classScope = normalizeReportClassScope(e.target.value);
            saveProgressReportFilters();
            renderProgressReportModal();
        });
        document.getElementById('essayProgressPreviewBtn')?.addEventListener('click', () => {
            const previewEl = document.getElementById('essayProgressPreview');
            if (previewEl) {
                previewEl.innerHTML = renderProgressPreviewHtml(getSelectedProgressAssignments());
            }
        });
        document.getElementById('essayProgressPrintBtn')?.addEventListener('click', () => {
            const selected = getSelectedProgressAssignments();
            if (!selected.length) {
                if (hooks && hooks.showToast) {
                    hooks.showToast(t('classroomEssayProgressNoAssignments'), true);
                }
                return;
            }
            openEssayProgressPrint(selected);
        });
    }

    function loadClassSummarySelection() {
        const data = getAppData();
        classSummarySelectedKeys.clear();
        const raw = data.ui && data.ui.essayClassSummarySelection;
        if (typeof raw === 'string' && raw.trim()) {
            raw.split(',').forEach((key) => {
                const trimmed = key.trim();
                if (trimmed) {
                    classSummarySelectedKeys.add(trimmed);
                }
            });
        }
        const filtersRaw = data.ui && data.ui.essayClassSummaryFilters;
        classSummaryFilters = {
            homeroomKey: '',
            month: '',
            warnMode: 'all',
            essaySubject: '',
            classScope: 'all'
        };
        const summaryApi = global.CCPClassroomEssayClassSummary;
        const normalizeWarn =
            summaryApi && typeof summaryApi.normalizeWarnMode === 'function'
                ? summaryApi.normalizeWarnMode
                : (mode) => (mode === 'attention' || mode === 'overdue' || mode === 'resubmit' ? mode : 'all');
        if (typeof filtersRaw === 'string' && filtersRaw.trim()) {
            try {
                const parsed = JSON.parse(filtersRaw);
                if (parsed && typeof parsed === 'object') {
                    classSummaryFilters = {
                        homeroomKey:
                            typeof parsed.homeroomKey === 'string' ? parsed.homeroomKey : '',
                        month: typeof parsed.month === 'string' ? parsed.month : '',
                        warnMode: normalizeWarn(parsed.warnMode),
                        essaySubject: typeof parsed.essaySubject === 'string' ? parsed.essaySubject : '',
                        classScope: normalizeReportClassScope(parsed.classScope)
                    };
                }
            } catch (_err) {
                classSummaryFilters = {
                    homeroomKey: '',
                    month: '',
                    warnMode: 'all',
                    essaySubject: '',
                    classScope: 'all'
                };
            }
        } else if (filtersRaw && typeof filtersRaw === 'object') {
            classSummaryFilters = {
                homeroomKey:
                    typeof filtersRaw.homeroomKey === 'string' ? filtersRaw.homeroomKey : '',
                month: typeof filtersRaw.month === 'string' ? filtersRaw.month : '',
                warnMode: normalizeWarn(filtersRaw.warnMode),
                essaySubject: typeof filtersRaw.essaySubject === 'string' ? filtersRaw.essaySubject : '',
                classScope: normalizeReportClassScope(filtersRaw.classScope)
            };
        }
    }

    function saveClassSummarySelection() {
        if (hooks && hooks.setUiPref) {
            hooks.setUiPref(
                'essayClassSummarySelection',
                Array.from(classSummarySelectedKeys).join(',')
            );
        }
    }

    function saveClassSummaryFilters() {
        if (hooks && hooks.setUiPref) {
            hooks.setUiPref(
                'essayClassSummaryFilters',
                JSON.stringify({
                    homeroomKey: classSummaryFilters.homeroomKey || '',
                    month: classSummaryFilters.month || '',
                    warnMode: classSummaryFilters.warnMode || 'all',
                    essaySubject: classSummaryFilters.essaySubject || '',
                    classScope: classSummaryFilters.classScope || 'all'
                })
            );
        }
    }

    function syncClassSummaryFiltersFromDom() {
        const hrEl = document.getElementById('essayClassSummaryHomeroomFilter');
        const monthEl = document.getElementById('essayClassSummaryMonthFilter');
        const warnEl = document.getElementById('essayClassSummaryWarnModeFilter');
        const summaryApi = global.CCPClassroomEssayClassSummary;
        const normalizeWarn =
            summaryApi && typeof summaryApi.normalizeWarnMode === 'function'
                ? summaryApi.normalizeWarnMode
                : (mode) => (mode === 'attention' || mode === 'overdue' || mode === 'resubmit' ? mode : 'all');
        const subjectEl = document.getElementById('essayClassSummaryEssaySubjectFilter');
        const scopeEl = document.getElementById('essayClassSummaryClassScopeFilter');
        classSummaryFilters = {
            homeroomKey: hrEl ? String(hrEl.value || '') : classSummaryFilters.homeroomKey || '',
            month: monthEl ? String(monthEl.value || '') : classSummaryFilters.month || '',
            warnMode: normalizeWarn(warnEl ? warnEl.value : classSummaryFilters.warnMode),
            essaySubject: subjectEl ? String(subjectEl.value || '') : classSummaryFilters.essaySubject || '',
            classScope: normalizeReportClassScope(
                scopeEl ? scopeEl.value : classSummaryFilters.classScope
            )
        };
        saveClassSummaryFilters();
    }

    function listFilteredClassSummaryAssignments() {
        const all = listProgressAssignments();
        const summaryApi = global.CCPClassroomEssayClassSummary;
        if (!summaryApi || !summaryApi.filterAssignmentsByHrAndMonth) {
            return all;
        }
        return summaryApi.filterAssignmentsByHrAndMonth(all, getAppData(), classSummaryFilters, {
            currentUserId: reportCurrentUserId()
        });
    }

    function formatClassSummaryAssignmentHint(row) {
        const complete = (row.counts && row.counts.complete) || 0;
        const total = row.totalStudents || 0;
        return tf('classroomEssayClassSummaryAssignmentHint', { complete, total });
    }

    function getClassSummaryLabels() {
        const mode = classSummaryFilters.warnMode || 'all';
        let title = t('classroomEssayClassSummaryTitle');
        if (mode === 'attention') {
            title = t('classroomEssayClassSummaryTitleAttention');
        } else if (mode === 'overdue') {
            title = t('classroomEssayClassSummaryTitleOverdue');
        } else if (mode === 'resubmit') {
            title = t('classroomEssayClassSummaryTitleResubmit');
        }
        return {
            title,
            noStudents: t('classroomEssayClassSummaryNoStudents'),
            noStudentsInSection: t('classroomEssayClassSummaryNoStudentsInSection'),
            generatedAt: t('classroomEssayClassSummaryGeneratedAt'),
            overdue: t('classroomEssayClassSummaryOverdue'),
            receivedLate: t('classroomEssayClassSummaryReceivedLate'),
            noHomeroom: t('classroomEssayClassSummaryNoHomeroom'),
            hrHeading: t('classroomEssayClassSummaryHrHeading'),
            retestReceived: t('classroomEssayResubmitRetestReceived'),
            colStudent: t('classroomColStudent'),
            colStatus: t('classroomEssayColStatus'),
            colDue: t('classroomEssayColDue'),
            colNotes: t('classroomEssayColFeedback'),
            statusLabels: {
                not_submitted: t('classroomEssayStatusNotSubmitted'),
                submitted: t('classroomEssayStatusReceived'),
                complete: t('classroomEssayStatusComplete'),
                resubmit_required: t('classroomEssayStatusResubmit'),
                demerit: t('classroomEssayStatusDemerit'),
                incomplete: t('classroomEssayStatusIncomplete'),
                exempt: t('classroomEssayStatusExempt')
            }
        };
    }

    function getSelectedClassSummaryAssignments() {
        const progressApi = global.CCPClassroomEssayProgress;
        if (!progressApi) {
            return [];
        }
        const filtered = listFilteredClassSummaryAssignments();
        if (!classSummarySelectedKeys.size) {
            return [];
        }
        return progressApi.filterAssignments(filtered, {
            selectedKeys: classSummarySelectedKeys,
            outstandingOnly: false
        });
    }

    function getClassSummaryHrGroups(assignments) {
        const summaryApi = global.CCPClassroomEssayClassSummary;
        if (!summaryApi || !assignments.length) {
            return [];
        }
        const appData = getAppData();
        let rows = summaryApi.listRowsForAssignments(appData, assignments);
        if (typeof summaryApi.filterRowsByWarnMode === 'function') {
            rows = summaryApi.filterRowsByWarnMode(rows, classSummaryFilters.warnMode);
        }
        return summaryApi.groupRowsByHomeroom(rows, appData);
    }

    function renderClassSummaryPreviewHtml(assignments) {
        const printApi = global.CCPClassroomEssayClassSummaryPrint;
        const labels = getClassSummaryLabels();
        if (!printApi) {
            return `<p class="section-hint">${escapeHtml(labels.noStudents)}</p>`;
        }
        const groups = getClassSummaryHrGroups(assignments);
        if (!groups.length) {
            return `<p class="section-hint">${escapeHtml(labels.noStudents)}</p>`;
        }
        return printApi.renderDocumentHtml(
            {
                calendarName: '',
                generatedAt: '',
                groups
            },
            labels
        );
    }

    function openEssayClassSummaryPrint(assignments) {
        const printApi = global.CCPClassroomEssayClassSummaryPrint;
        if (!printApi || !assignments.length) {
            return;
        }
        const groups = getClassSummaryHrGroups(assignments);
        if (!groups.length) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayClassSummaryNoStudents'), true);
            }
            return;
        }
        const data = getAppData();
        const d = domain();
        const labels = getClassSummaryLabels();
        const bodyHtml = printApi.renderDocumentHtml(
            {
                calendarName: data.calendarName || '',
                generatedAt: d ? d.todayISO() : '',
                groups
            },
            labels
        );
        openInlinePrintDocument(labels.title, bodyHtml, printApi.PRINT_STYLES || '');
    }

    async function copyEssayClassSummary(assignments) {
        const summaryApi = global.CCPClassroomEssayClassSummary;
        if (!summaryApi || !assignments.length) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayClassSummaryNoAssignments'), true);
            }
            return;
        }
        const groups = getClassSummaryHrGroups(assignments);
        const labels = getClassSummaryLabels();
        const text = summaryApi.formatCopyText(groups, labels);
        if (!text || text === labels.noStudents) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayClassSummaryNoStudents'), true);
            }
            return;
        }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
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
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayClassSummaryCopyDone'));
            }
        } catch (err) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayClassSummaryCopyFailed'), true);
            }
        }
    }

    function populateClassSummaryFilterSelects(allAssignments) {
        const summaryApi = global.CCPClassroomEssayClassSummary;
        const hrEl = document.getElementById('essayClassSummaryHomeroomFilter');
        const monthEl = document.getElementById('essayClassSummaryMonthFilter');
        const warnEl = document.getElementById('essayClassSummaryWarnModeFilter');
        const appData = getAppData();
        if (hrEl && summaryApi && summaryApi.listHomeroomFilterOptions) {
            const options = summaryApi.listHomeroomFilterOptions(allAssignments, appData);
            const prev = classSummaryFilters.homeroomKey || '';
            const parts = [
                `<option value="">${escapeHtml(t('classroomEssayClassSummaryFilterAllHomerooms'))}</option>`
            ];
            options.forEach((opt) => {
                if (!opt || !opt.key) {
                    return;
                }
                const label =
                    opt.key === summaryApi.NO_HOMEROOM_KEY
                        ? t('classroomEssayClassSummaryNoHomeroom')
                        : opt.label || opt.key;
                parts.push(
                    `<option value="${escapeAttr(opt.key)}">${escapeHtml(label)}</option>`
                );
            });
            hrEl.innerHTML = parts.join('');
            const valid = !prev || options.some((o) => o && o.key === prev);
            hrEl.value = valid ? prev : '';
            classSummaryFilters.homeroomKey = hrEl.value || '';
        }
        if (monthEl && summaryApi && summaryApi.listMonthFilterOptions) {
            const months = summaryApi.listMonthFilterOptions(allAssignments);
            const prev = classSummaryFilters.month || '';
            const parts = [
                `<option value="">${escapeHtml(t('classroomEssayClassSummaryFilterAllMonths'))}</option>`
            ];
            months.forEach((month) => {
                parts.push(
                    `<option value="${escapeAttr(month)}">${escapeHtml(month)}</option>`
                );
            });
            monthEl.innerHTML = parts.join('');
            const valid = !prev || months.includes(prev);
            monthEl.value = valid ? prev : '';
            classSummaryFilters.month = monthEl.value || '';
        }
        if (warnEl) {
            const normalizeWarn =
                summaryApi && typeof summaryApi.normalizeWarnMode === 'function'
                    ? summaryApi.normalizeWarnMode
                    : (mode) =>
                          mode === 'attention' || mode === 'overdue' || mode === 'resubmit'
                              ? mode
                              : 'all';
            const mode = normalizeWarn(classSummaryFilters.warnMode);
            warnEl.value = mode;
            classSummaryFilters.warnMode = mode;
        }
        fillEssayReportSubjectSelect(
            document.getElementById('essayClassSummaryEssaySubjectFilter'),
            classSummaryFilters.essaySubject,
            allAssignments
        );
        fillEssayReportClassScopeSelect(
            document.getElementById('essayClassSummaryClassScopeFilter'),
            classSummaryFilters.classScope
        );
    }

    function renderClassSummaryModal() {
        const listEl = document.getElementById('essayClassSummaryAssignmentList');
        const previewEl = document.getElementById('essayClassSummaryPreview');
        if (!listEl) {
            return;
        }
        const allAssignments = listProgressAssignments();
        populateClassSummaryFilterSelects(allAssignments);
        const assignments = listFilteredClassSummaryAssignments();
        const grouped = global.CCPClassroomEssayProgress
            ? global.CCPClassroomEssayProgress.groupAssignmentsByClass(assignments)
            : [];
        const savedSelection = getAppData().ui && getAppData().ui.essayClassSummarySelection;
        const neverSavedSelection = savedSelection === undefined || savedSelection === null;
        if (neverSavedSelection && !classSummarySelectedKeys.size && assignments.length) {
            assignments.forEach((row) => classSummarySelectedKeys.add(row.key));
        }
        listEl.innerHTML = grouped
            .map((group) => {
                const rows = (group.rows || [])
                    .map((row) => {
                        const checked = classSummarySelectedKeys.has(row.key) ? ' checked' : '';
                        const hint = formatClassSummaryAssignmentHint(row);
                        return `<label class="classroom-essay-progress-assignment-row">
                            <input type="checkbox" data-assignment-key="${escapeAttr(row.key)}"${checked} />
                            <span>${escapeHtml(row.assignmentLabel || '')} <span class="section-hint">(${escapeHtml(hint)})</span></span>
                        </label>`;
                    })
                    .join('');
                return `<div class="classroom-essay-progress-class-group">
                    <h4 class="classroom-essay-progress-class-name">${escapeHtml(group.className || '')}</h4>
                    ${rows}
                </div>`;
            })
            .join('') || `<p class="section-hint">${escapeHtml(t('classroomEssayClassSummaryNoAssignments'))}</p>`;
        listEl.querySelectorAll('input[data-assignment-key]').forEach((input) => {
            input.addEventListener('change', () => {
                const key = input.getAttribute('data-assignment-key');
                if (!key) {
                    return;
                }
                if (input.checked) {
                    classSummarySelectedKeys.add(key);
                } else {
                    classSummarySelectedKeys.delete(key);
                }
                saveClassSummarySelection();
                if (previewEl) {
                    previewEl.innerHTML = renderClassSummaryPreviewHtml(
                        getSelectedClassSummaryAssignments()
                    );
                }
            });
        });
        if (previewEl) {
            previewEl.innerHTML = renderClassSummaryPreviewHtml(getSelectedClassSummaryAssignments());
        }
    }

    function openClassSummaryModal() {
        const modal = document.getElementById('essayClassSummaryModal');
        if (!modal) {
            return;
        }
        loadClassSummarySelection();
        renderClassSummaryModal();
        if (hooks && hooks.openModal) {
            hooks.openModal(modal);
        } else {
            modal.classList.add('active');
            modal.hidden = false;
        }
    }

    function bindClassSummaryModal() {
        const modal = document.getElementById('essayClassSummaryModal');
        if (!modal || modal.dataset.bound === '1') {
            return;
        }
        modal.dataset.bound = '1';
        document.getElementById('essayClassSummaryClose')?.addEventListener('click', () => {
            if (hooks && hooks.closeModal) {
                hooks.closeModal(modal);
            }
        });
        document.getElementById('essayClassSummaryHomeroomFilter')?.addEventListener('change', () => {
            syncClassSummaryFiltersFromDom();
            renderClassSummaryModal();
        });
        document.getElementById('essayClassSummaryMonthFilter')?.addEventListener('change', () => {
            syncClassSummaryFiltersFromDom();
            renderClassSummaryModal();
        });
        document.getElementById('essayClassSummaryWarnModeFilter')?.addEventListener('change', () => {
            syncClassSummaryFiltersFromDom();
            renderClassSummaryModal();
        });
        document.getElementById('essayClassSummaryEssaySubjectFilter')?.addEventListener('change', () => {
            syncClassSummaryFiltersFromDom();
            renderClassSummaryModal();
        });
        document.getElementById('essayClassSummaryClassScopeFilter')?.addEventListener('change', () => {
            syncClassSummaryFiltersFromDom();
            renderClassSummaryModal();
        });
        document.getElementById('essayClassSummarySelectAll')?.addEventListener('click', () => {
            listFilteredClassSummaryAssignments().forEach((row) => classSummarySelectedKeys.add(row.key));
            saveClassSummarySelection();
            renderClassSummaryModal();
        });
        document.getElementById('essayClassSummaryClearAll')?.addEventListener('click', () => {
            listFilteredClassSummaryAssignments().forEach((row) => {
                if (row && row.key) {
                    classSummarySelectedKeys.delete(row.key);
                }
            });
            saveClassSummarySelection();
            renderClassSummaryModal();
        });
        document.getElementById('essayClassSummaryCopyBtn')?.addEventListener('click', () => {
            const selected = getSelectedClassSummaryAssignments();
            if (!selected.length) {
                if (hooks && hooks.showToast) {
                    hooks.showToast(t('classroomEssayClassSummaryNoAssignments'), true);
                }
                return;
            }
            void copyEssayClassSummary(selected);
        });
        document.getElementById('essayClassSummaryPrintBtn')?.addEventListener('click', () => {
            const selected = getSelectedClassSummaryAssignments();
            if (!selected.length) {
                if (hooks && hooks.showToast) {
                    hooks.showToast(t('classroomEssayClassSummaryNoAssignments'), true);
                }
                return;
            }
            openEssayClassSummaryPrint(selected);
        });
    }

    function getResubmitPrintLabels() {
        return {
            title: t('classroomEssayResubmitSummaryTitle'),
            noRows: t('classroomEssayResubmitNoRows'),
            noReason: t('classroomEssayResubmitNoReason'),
            retestReceived: t('classroomEssayResubmitRetestReceived'),
            debateVideoNv: t('classroomEssayDebateVideoNv'),
            generatedAt: t('classroomEssayResubmitGeneratedAt'),
            overdue: t('classroomEssayProgressOverdue'),
            receivedLate: t('classroomEssayProgressReceivedLate')
        };
    }

    function getOverduePrintLabels() {
        return {
            title: t('classroomEssayOverduePrintTitle'),
            noRows: t('classroomEssayOverdueNoRows'),
            noReason: t('classroomEssayProgressOverdue'),
            retestReceived: t('classroomEssayResubmitRetestReceived'),
            debateVideoNv: t('classroomEssayDebateVideoNv'),
            generatedAt: t('classroomEssayResubmitGeneratedAt'),
            overdue: t('classroomEssayProgressOverdue'),
            receivedLate: t('classroomEssayProgressReceivedLate')
        };
    }

    function openResubmitPrint(rows, labelsOverride) {
        const printApi = global.CCPClassroomEssayResubmitPrint;
        const d = domain();
        if (!printApi || !d || !d.groupEssayStudentRowsByClass) {
            return;
        }
        const labels = labelsOverride || getResubmitPrintLabels();
        if (!rows.length) {
            if (hooks && hooks.showToast) {
                hooks.showToast(labels.noRows, true);
            }
            return;
        }
        const groups = d.groupEssayStudentRowsByClass(rows);
        const data = getAppData();
        const bodyHtml = printApi.renderDocumentHtml(
            {
                calendarName: data.calendarName || '',
                generatedAt: d ? d.todayISO() : '',
                groups
            },
            labels
        );
        const title = labels.title;
        const inlineCss = printApi.PRINT_STYLES || '';
        openInlinePrintDocument(title, bodyHtml, inlineCss);
    }

    function listCurrentClassAttentionRows(kind) {
        const d = domain();
        if (!d || !classId) {
            return [];
        }
        const opts = {
            classes: getAccessibleClasses(),
            classId
        };
        if (kind === 'overdue' && d.listEssayOverdueRows) {
            return d.listEssayOverdueRows(getAppData(), opts);
        }
        if (kind === 'resubmit' && d.listEssayResubmitRows) {
            return d.listEssayResubmitRows(getAppData(), opts);
        }
        return [];
    }

    async function copyTextToClipboard(text, doneKey, failKey) {
        const value = String(text || '').trim();
        if (!value) {
            return false;
        }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(value);
            } else {
                const ta = document.createElement('textarea');
                ta.value = value;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            if (hooks && hooks.showToast) {
                hooks.showToast(t(doneKey || 'classroomEssayWarnCopyDone'));
            }
            return true;
        } catch (err) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t(failKey || 'classroomEssayWarnCopyFailed'), true);
            }
            return false;
        }
    }

    async function copyAttentionRows(rows, labels) {
        const printApi = global.CCPClassroomEssayResubmitPrint;
        const d = domain();
        if (!printApi || !printApi.formatCopyText || !d || !d.groupEssayStudentRowsByClass) {
            if (hooks && hooks.showToast) {
                hooks.showToast(labels.noRows, true);
            }
            return;
        }
        if (!rows.length) {
            if (hooks && hooks.showToast) {
                hooks.showToast(labels.noRows, true);
            }
            return;
        }
        const groups = d.groupEssayStudentRowsByClass(rows);
        const text = printApi.formatCopyText(groups, labels);
        if (!text || text === labels.noRows) {
            if (hooks && hooks.showToast) {
                hooks.showToast(labels.noRows, true);
            }
            return;
        }
        await copyTextToClipboard(text);
    }

    function printCurrentClassResubmits() {
        openResubmitPrint(listCurrentClassAttentionRows('resubmit'), getResubmitPrintLabels());
    }

    function printCurrentClassOverdues() {
        openResubmitPrint(listCurrentClassAttentionRows('overdue'), getOverduePrintLabels());
    }

    function copyCurrentClassResubmits() {
        void copyAttentionRows(listCurrentClassAttentionRows('resubmit'), getResubmitPrintLabels());
    }

    function copyCurrentClassOverdues() {
        void copyAttentionRows(listCurrentClassAttentionRows('overdue'), getOverduePrintLabels());
    }

    function loadResubmitSummaryFilters() {
        const ui = getAppData().ui || {};
        const saved = ui.essayResubmitSummaryFilters;
        if (saved && typeof saved === 'object') {
            resubmitSummaryFilters = Object.assign(resubmitSummaryFilters, {
                search: saved.search || '',
                classTypeId: saved.classTypeId || '',
                grade: saved.grade || '',
                levelLabel: saved.levelLabel || '',
                subject: saved.subject || '',
                essaySubject: saved.essaySubject || '',
                classScope: normalizeReportClassScope(saved.classScope, saved.myClassesOnly),
                myClassesOnly: saved.myClassesOnly === true || saved.myClassesOnly === '1',
                hasResubmitsOnly: saved.hasResubmitsOnly !== false && saved.hasResubmitsOnly !== '0'
            });
        }
        resubmitSummarySelectedClassIds.clear();
        if (saved && Array.isArray(saved.selectedClassIds)) {
            saved.selectedClassIds.forEach((id) => {
                if (id) {
                    resubmitSummarySelectedClassIds.add(id);
                }
            });
        }
    }

    function saveResubmitSummaryFilters() {
        if (hooks && hooks.setUiPref) {
            hooks.setUiPref('essayResubmitSummaryFilters', {
                search: resubmitSummaryFilters.search,
                classTypeId: resubmitSummaryFilters.classTypeId,
                grade: resubmitSummaryFilters.grade,
                levelLabel: resubmitSummaryFilters.levelLabel,
                subject: resubmitSummaryFilters.subject,
                essaySubject: resubmitSummaryFilters.essaySubject,
                classScope: resubmitSummaryFilters.classScope || 'all',
                myClassesOnly: resubmitSummaryFilters.classScope === 'mine',
                hasResubmitsOnly: resubmitSummaryFilters.hasResubmitsOnly,
                selectedClassIds: Array.from(resubmitSummarySelectedClassIds)
            });
        }
    }

    function getResubmitSummaryApi() {
        return global.CCPClassroomEssayResubmitSummary;
    }

    function getResubmitSummaryFilterPayload() {
        return Object.assign({}, resubmitSummaryFilters, {
            currentUserId: hooks && hooks.getCurrentUserId ? hooks.getCurrentUserId() : ''
        });
    }

    function getFilteredResubmitClasses() {
        const api = getResubmitSummaryApi();
        if (!api) {
            return [];
        }
        return api.filterClassesForSummary(
            getEssayVisibleClasses(),
            getAppData(),
            getResubmitSummaryFilterPayload()
        );
    }

    function getSelectedResubmitRows() {
        const api = getResubmitSummaryApi();
        if (!api) {
            return [];
        }
        const allowed = new Set(getFilteredResubmitClasses().map((classData) => classData && classData.id).filter(Boolean));
        const selected = new Set();
        resubmitSummarySelectedClassIds.forEach((id) => {
            if (allowed.has(id)) {
                selected.add(id);
            }
        });
        if (!selected.size) {
            return [];
        }
        const allRows = api.listResubmitRows(getAppData(), { classes: getEssayVisibleClasses() });
        return api.filterResubmitRows(allRows, {
            selectedClassIds: selected,
            essaySubject: resubmitSummaryFilters.essaySubject || ''
        });
    }

    function renderResubmitPreviewHtml(rows) {
        const api = getResubmitSummaryApi();
        if (!api) {
            return '';
        }
        if (!rows.length) {
            return `<p class="section-hint">${escapeHtml(t('classroomEssayResubmitNoRows'))}</p>`;
        }
        const groups = api.groupResubmitRowsByClass(rows);
        return groups
            .map((group) => {
                const meta = [group.classTypeLabel, group.levelLabel].filter(Boolean).join(' · ');
                const title = meta ? `${group.className} (${meta})` : group.className || '';
                const assignmentBlocks = (group.assignments || [])
                    .map((assign) => {
                        const studentRows = (assign.students || [])
                            .map((row) => {
                                const note =
                                    String(row.note || '').trim() || t('classroomEssayResubmitNoReason');
                                return `<tr>
                                    <td>${escapeHtml(row.studentName || '')}</td>
                                    <td>${escapeHtml(note)}</td>
                                    <td>${row.submittedRetest ? escapeHtml(t('classroomEssayResubmitRetestReceived')) : '—'}</td>
                                    <td>${row.debateVideoMissing ? escapeHtml(t('classroomEssayDebateVideoNv')) : '—'}</td>
                                </tr>`;
                            })
                            .join('');
                        return `<div class="classroom-essay-resubmit-preview-assignment">
                            <h5 class="classroom-essay-resubmit-preview-assignment-title">${escapeHtml(assign.assignmentLabel || '')}</h5>
                            <table class="classroom-essay-resubmit-preview-table">
                                <thead><tr>
                                    <th>${escapeHtml(t('classroomEssayResubmitColStudent'))}</th>
                                    <th>${escapeHtml(t('classroomEssayResubmitColNote'))}</th>
                                    <th>${escapeHtml(t('classroomEssayResubmitColRetest'))}</th>
                                    <th>${escapeHtml(t('classroomEssayDebateVideoNv'))}</th>
                                </tr></thead>
                                <tbody>${studentRows}</tbody>
                            </table>
                        </div>`;
                    })
                    .join('');
                return `<div class="classroom-essay-resubmit-preview-class">
                    <h4 class="classroom-essay-resubmit-preview-class-title">${escapeHtml(title)}</h4>
                    ${assignmentBlocks}
                </div>`;
            })
            .join('');
    }

    function populateResubmitFilterSelects(modal) {
        const api = getResubmitSummaryApi();
        const classes = getEssayVisibleClasses();
        const appData = getAppData();
        const d = domain();
        if (!api || !modal) {
            return;
        }
        const allOpt = `<option value="">${escapeHtml(t('classroomEssayResubmitFilterAll'))}</option>`;
        const typeSelect = modal.querySelector('#essayResubmitClassTypeFilter');
        const gradeSelect = modal.querySelector('#essayResubmitGradeFilter');
        const levelSelect = modal.querySelector('#essayResubmitLevelFilter');
        const subjectSelect = modal.querySelector('#essayResubmitSubjectFilter');

        if (typeSelect) {
            const types = api.uniqueClassTypeOptions(classes, appData);
            typeSelect.innerHTML =
                allOpt +
                types
                    .map(
                        (typeRow) =>
                            `<option value="${escapeAttr(typeRow.id)}"${typeRow.id === resubmitSummaryFilters.classTypeId ? ' selected' : ''}>${escapeHtml(typeRow.label)}</option>`
                    )
                    .join('');
        }
        if (gradeSelect) {
            const grades = new Set();
            classes.forEach((classData) => {
                const grade = normalizeStr(classData && classData.grade);
                if (grade) {
                    grades.add(grade);
                }
            });
            gradeSelect.innerHTML =
                allOpt +
                Array.from(grades)
                    .sort((a, b) => String(a).localeCompare(String(b)))
                    .map(
                        (grade) =>
                            `<option value="${escapeAttr(grade)}"${grade === resubmitSummaryFilters.grade ? ' selected' : ''}>${escapeHtml(grade)}</option>`
                    )
                    .join('');
        }
        if (levelSelect) {
            const levels = new Set();
            classes.forEach((classData) => {
                const level = d && d.resolveClassLevelLabel ? d.resolveClassLevelLabel(classData) : '';
                if (level) {
                    levels.add(level);
                }
            });
            levelSelect.innerHTML =
                allOpt +
                Array.from(levels)
                    .sort((a, b) => String(a).localeCompare(String(b)))
                    .map(
                        (level) =>
                            `<option value="${escapeAttr(level)}"${level === resubmitSummaryFilters.levelLabel ? ' selected' : ''}>${escapeHtml(level)}</option>`
                    )
                    .join('');
        }
        if (subjectSelect) {
            const subjects = new Set();
            classes.forEach((classData) => {
                const subject = normalizeStr(classData && classData.subject);
                if (subject) {
                    subjects.add(subject);
                }
            });
            subjectSelect.innerHTML =
                allOpt +
                Array.from(subjects)
                    .sort((a, b) => String(a).localeCompare(String(b)))
                    .map(
                        (subject) =>
                            `<option value="${escapeAttr(subject)}"${subject === resubmitSummaryFilters.subject ? ' selected' : ''}>${escapeHtml(subject)}</option>`
                    )
                    .join('');
        }
    }

    function syncResubmitFiltersFromModal() {
        const modal = document.getElementById('essayResubmitSummaryModal');
        if (!modal) {
            return;
        }
        const searchInput = modal.querySelector('#essayResubmitClassSearch');
        resubmitSummaryFilters.search = searchInput ? searchInput.value : '';
        resubmitSummaryFilters.classTypeId =
            modal.querySelector('#essayResubmitClassTypeFilter')?.value || '';
        resubmitSummaryFilters.grade = modal.querySelector('#essayResubmitGradeFilter')?.value || '';
        resubmitSummaryFilters.levelLabel =
            modal.querySelector('#essayResubmitLevelFilter')?.value || '';
        resubmitSummaryFilters.subject = modal.querySelector('#essayResubmitSubjectFilter')?.value || '';
        resubmitSummaryFilters.essaySubject =
            modal.querySelector('#essayResubmitEssaySubjectFilter')?.value || '';
        resubmitSummaryFilters.classScope = normalizeReportClassScope(
            modal.querySelector('#essayResubmitClassScopeFilter')?.value
        );
        resubmitSummaryFilters.myClassesOnly = resubmitSummaryFilters.classScope === 'mine';
        resubmitSummaryFilters.hasResubmitsOnly = !!modal.querySelector(
            '#essayResubmitHasResubmitsOnly'
        )?.checked;
        saveResubmitSummaryFilters();
    }

    function renderResubmitSummaryModal() {
        const modal = document.getElementById('essayResubmitSummaryModal');
        const listEl = document.getElementById('essayResubmitClassList');
        const previewEl = document.getElementById('essayResubmitPreview');
        if (!listEl) {
            return;
        }
        populateResubmitFilterSelects(modal);
        const filteredClasses = getFilteredResubmitClasses();
        const saved = getAppData().ui && getAppData().ui.essayResubmitSummaryFilters;
        const neverSavedSelection =
            !saved ||
            !Array.isArray(saved.selectedClassIds) ||
            !saved.selectedClassIds.length;
        if (neverSavedSelection && !resubmitSummarySelectedClassIds.size && filteredClasses.length) {
            filteredClasses.forEach((classData) => resubmitSummarySelectedClassIds.add(classData.id));
        }

        listEl.innerHTML = filteredClasses.length
            ? filteredClasses
                .map((classData) => {
                    const checked = resubmitSummarySelectedClassIds.has(classData.id) ? ' checked' : '';
                    const d = domain();
                    const typeLabel = d ? d.resolveClassTypeLabel(classData, getAppData()) : '';
                    const meta = [
                        typeLabel,
                        classData.grade,
                        d ? d.resolveClassLevelLabel(classData) : ''
                    ]
                        .filter(Boolean)
                        .join(' · ');
                    return `<label class="classroom-essay-resubmit-class-row checkbox-label">
                        <input type="checkbox" data-class-id="${escapeAttr(classData.id)}"${checked} />
                        <span>${escapeHtml(classData.name || classData.id)}${meta ? ` <span class="section-hint">(${escapeHtml(meta)})</span>` : ''}</span>
                    </label>`;
                })
                .join('')
            : `<p class="section-hint">${escapeHtml(t('classroomEssayResubmitNoRows'))}</p>`;

        listEl.querySelectorAll('input[data-class-id]').forEach((input) => {
            input.addEventListener('change', () => {
                const id = input.getAttribute('data-class-id');
                if (!id) {
                    return;
                }
                if (input.checked) {
                    resubmitSummarySelectedClassIds.add(id);
                } else {
                    resubmitSummarySelectedClassIds.delete(id);
                }
                saveResubmitSummaryFilters();
                if (previewEl) {
                    previewEl.innerHTML = renderResubmitPreviewHtml(getSelectedResubmitRows());
                }
            });
        });

        if (modal) {
            const searchInput = modal.querySelector('#essayResubmitClassSearch');
            if (searchInput && searchInput.value !== resubmitSummaryFilters.search) {
                searchInput.value = resubmitSummaryFilters.search;
            }
            fillEssayReportSubjectSelect(
                modal.querySelector('#essayResubmitEssaySubjectFilter'),
                resubmitSummaryFilters.essaySubject,
                getResubmitSummaryApi()
                    ? getResubmitSummaryApi().listResubmitRows(getAppData(), {
                        classes: getEssayVisibleClasses()
                    })
                    : []
            );
            fillEssayReportClassScopeSelect(
                modal.querySelector('#essayResubmitClassScopeFilter'),
                resubmitSummaryFilters.classScope
            );
            const hasCb = modal.querySelector('#essayResubmitHasResubmitsOnly');
            if (hasCb) {
                hasCb.checked = resubmitSummaryFilters.hasResubmitsOnly;
            }
        }
        if (previewEl) {
            previewEl.innerHTML = renderResubmitPreviewHtml(getSelectedResubmitRows());
        }
    }

    function openResubmitSummaryModal() {
        const modal = document.getElementById('essayResubmitSummaryModal');
        if (!modal) {
            return;
        }
        loadResubmitSummaryFilters();
        renderResubmitSummaryModal();
        if (hooks && hooks.openModal) {
            hooks.openModal(modal);
        } else {
            modal.classList.add('active');
            modal.hidden = false;
        }
    }

    function bindResubmitSummaryModal() {
        const modal = document.getElementById('essayResubmitSummaryModal');
        if (!modal || modal.dataset.bound === '1') {
            return;
        }
        modal.dataset.bound = '1';
        document.getElementById('essayResubmitSummaryClose')?.addEventListener('click', () => {
            if (hooks && hooks.closeModal) {
                hooks.closeModal(modal);
            }
        });
        document.getElementById('essayResubmitSelectAll')?.addEventListener('click', () => {
            getFilteredResubmitClasses().forEach((classData) =>
                resubmitSummarySelectedClassIds.add(classData.id)
            );
            saveResubmitSummaryFilters();
            renderResubmitSummaryModal();
        });
        document.getElementById('essayResubmitClearAll')?.addEventListener('click', () => {
            getFilteredResubmitClasses().forEach((classData) => {
                if (classData && classData.id) {
                    resubmitSummarySelectedClassIds.delete(classData.id);
                }
            });
            saveResubmitSummaryFilters();
            renderResubmitSummaryModal();
        });
        modal.querySelector('#essayResubmitClassSearch')?.addEventListener('input', (e) => {
            resubmitSummaryFilters.search = e.target.value;
            saveResubmitSummaryFilters();
            renderResubmitSummaryModal();
        });
        ['#essayResubmitClassTypeFilter', '#essayResubmitGradeFilter', '#essayResubmitLevelFilter', '#essayResubmitSubjectFilter', '#essayResubmitEssaySubjectFilter', '#essayResubmitClassScopeFilter'].forEach(
            (selector) => {
                modal.querySelector(selector)?.addEventListener('change', () => {
                    syncResubmitFiltersFromModal();
                    renderResubmitSummaryModal();
                });
            }
        );
        modal.querySelector('#essayResubmitHasResubmitsOnly')?.addEventListener('change', () => {
            syncResubmitFiltersFromModal();
            renderResubmitSummaryModal();
        });
        document.getElementById('essayResubmitPrintBtn')?.addEventListener('click', () => {
            openResubmitPrint(getSelectedResubmitRows());
        });
    }

    function getAttentionCounts() {
        const d = domain();
        const students = getStudents();
        if (!d || !draftSubmission) {
            return { awaitingSub: 0, overdueSub: 0, evalOverdue: 0, resubmit: 0, debateVideo: 0 };
        }
        const ssDue = draftSubmission.ssDueDate || '';
        const teDue = draftSubmission.teacherEvalDueDate || '';
        const activeStudentIds = students
            .map((entry) => entry && entry.student && entry.student.id)
            .filter(Boolean);
        const awaitingSub = d.essayAwaitingSubmissionCount
            ? d.essayAwaitingSubmissionCount(
                draftSubmission,
                ssDue,
                students.length,
                activeStudentIds
            )
            : 0;
        const overdueSub = d.essayOverdueNotSubmittedCount(
            draftSubmission,
            ssDue,
            students.length,
            activeStudentIds
        );
        let evalOverdue = 0;
        if (d.isEssayTeacherEvalOverdue(draftSubmission, teDue, activeStudentIds)) {
            evalOverdue = d.essayPendingTeacherEvalCount(draftSubmission, activeStudentIds);
        }
        const resubmit = d.essayResubmitCount(draftSubmission, activeStudentIds);
        const debateVideo = d.essayDebateVideoMissingCount
            ? d.essayDebateVideoMissingCount(draftSubmission, activeStudentIds)
            : 0;
        return { awaitingSub, overdueSub, evalOverdue, resubmit, debateVideo };
    }

    function studentMatchesFilter(studentId) {
        const d = domain();
        const rec = getRecord(studentId);
        const status = rec ? rec.status : 'not_submitted';
        if (currentFilter === 'all') {
            return true;
        }
        if (currentFilter === 'debate_video_missing') {
            return !!(rec && rec.debateVideoMissing);
        }
        if (currentFilter === 'awaiting_sub') {
            const ssDue = draftSubmission ? draftSubmission.ssDueDate || '' : '';
            const record = rec || {
                status: 'not_submitted',
                submissionLate: false,
                overdueDismissed: false
            };
            return !!(d && d.isEssayAwaitingSubmission && d.isEssayAwaitingSubmission(record, ssDue));
        }
        if (currentFilter === 'overdue_sub') {
            const ssDue = draftSubmission ? draftSubmission.ssDueDate || '' : '';
            const record = rec || {
                status: 'not_submitted',
                submissionLate: false,
                overdueDismissed: false
            };
            return !!(d && d.isEssaySubmissionOverdue(record, ssDue));
        }
        if (currentFilter === 'eval_overdue') {
            const teDue = draftSubmission ? draftSubmission.teacherEvalDueDate || '' : '';
            return status === 'submitted' && d && d.isEssaySsOverdueISO(teDue);
        }
        return status === currentFilter;
    }

    function getEssaySubmissionsForAlerts() {
        const data = getAppData();
        const list = Array.isArray(data.essaySubmissions) ? data.essaySubmissions.slice() : [];
        const d = domain();
        if (!draftSubmission || !d || !d.upsertEssaySubmission) {
            return list;
        }
        return d.upsertEssaySubmission(list, draftSubmission);
    }

    function closeReportsMenu() {
        reportsMenuOpen = false;
    }

    function pruneSelectedStudentIds(students) {
        const ids = new Set(students.map((e) => e.student.id));
        selectedStudentIds.forEach((id) => {
            if (!ids.has(id)) {
                selectedStudentIds.delete(id);
            }
        });
    }

    function pickDefaultRow() {
        const classData = getClassData();
        const row = resolveEssayAssignmentForClass(classData);
        const d = domain();
        if (row && d) {
            syllabusRowId = d.getSyllabusRowKey(row);
            lessonDate = row.date || '';
        }
        return row;
    }

    function defaultDueDatesFromRow(row) {
        const d = domain();
        if (!row || !d) {
            return { ssDueDate: '', teacherEvalDueDate: '' };
        }
        const classData = getClassData();
        const ss = d.resolveEssayStudentDueDate
            ? d.resolveEssayStudentDueDate(row, classData, null)
            : normalizeStr(row.date);
        return {
            ssDueDate: ss,
            teacherEvalDueDate: ss ? d.addDaysISO(ss, 2) : ''
        };
    }

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function loadSubmission() {
        const d = domain();
        const data = getAppData();
        const classData = getClassData();
        if (!classData || !d) {
            draftSubmission = null;
            return;
        }
        if (!syllabusRowId || !rowExistsInClass(classData, syllabusRowId)) {
            applyResolvedAssignment(classData);
        }
        if (!syllabusRowId) {
            pickDefaultRow();
        }
        const students = getStudents();
        const existing = d.findEssaySubmission(data.essaySubmissions, classId, syllabusRowId);
        const row =
            classData &&
            d.getEssayRowsFromSyllabus(classData.syllabusRows, { classData }).find((r) => d.getSyllabusRowKey(r) === syllabusRowId);
        const defaults = defaultDueDatesFromRow(row);
        const base = existing
            ? JSON.parse(JSON.stringify(existing))
            : {
                id: d.newId('essay'),
                classId,
                syllabusRowId,
                lessonDate,
                ssDueDate: defaults.ssDueDate,
                teacherEvalDueDate: defaults.teacherEvalDueDate,
                records: []
            };
        if (!existing && !base.ssDueDate && defaults.ssDueDate) {
            base.ssDueDate = defaults.ssDueDate;
        }
        if (!base.teacherEvalDueDate && defaults.teacherEvalDueDate) {
            base.teacherEvalDueDate = defaults.teacherEvalDueDate;
        } else if (base.ssDueDate && defaults.teacherEvalDueDate) {
            const prevLesson = normalizeStr(row && row.date);
            const prevTe = normalizeStr(base.teacherEvalDueDate);
            const legacyTe = prevLesson ? d.addDaysISO(prevLesson, 2) : '';
            if (prevTe === legacyTe && base.ssDueDate !== prevLesson) {
                base.teacherEvalDueDate = d.addDaysISO(base.ssDueDate, 2);
            }
        }
        draftSubmission = d.ensureEssayRecordsForStudents(base, students);
    }

    function getRecord(studentId) {
        if (!draftSubmission || !Array.isArray(draftSubmission.records)) {
            return null;
        }
        return draftSubmission.records.find((r) => r.studentId === studentId) || null;
    }

    function setRecord(studentId, patch) {
        if (!draftSubmission) {
            return { changed: false, prev: null, next: null };
        }
        const records = Array.isArray(draftSubmission.records) ? draftSubmission.records.slice() : [];
        const idx = records.findIndex((r) => r.studentId === studentId);
        const base = idx >= 0
            ? records[idx]
            : {
                studentId,
                status: 'not_submitted',
                submittedRetest: false,
                retestAssigned: false,
                retestPassed: false,
                debateVideoMissing: false,
                note: '',
                submissionLate: false,
                overdueDismissed: false
            };
        const next = Object.assign({}, base, patch);
        const changed = JSON.stringify(base) !== JSON.stringify(next);
        if (!changed) {
            return { changed: false, prev: base, next };
        }
        if (idx >= 0) {
            records[idx] = next;
        } else {
            records.push(next);
        }
        draftSubmission.records = records;
        return { changed: true, prev: base, next };
    }

    function recordAffectsResubmitDayNote(prev, next) {
        const before = prev || { status: 'not_submitted', note: '' };
        const after = next || { status: 'not_submitted', note: '' };
        const beforeResubmit = before.status === 'resubmit_required';
        const afterResubmit = after.status === 'resubmit_required';
        if (before.status !== after.status && (beforeResubmit || afterResubmit)) {
            return true;
        }
        if ((beforeResubmit || afterResubmit) && String(before.note || '') !== String(after.note || '')) {
            return true;
        }
        return false;
    }

    function markResubmitDayNoteDirty() {
        resubmitDayNoteDirty = true;
    }

    function getDraftRenderSignature() {
        if (!draftSubmission) {
            return 'no-draft';
        }
        return JSON.stringify({
            filter: currentFilter,
            ssDueDate: draftSubmission.ssDueDate || '',
            teacherEvalDueDate: draftSubmission.teacherEvalDueDate || '',
            records: (draftSubmission.records || []).map((rec) => ({
                studentId: rec.studentId || '',
                status: rec.status || 'not_submitted',
                submittedRetest: !!rec.submittedRetest,
                retestAssigned: !!rec.retestAssigned,
                retestPassed: !!rec.retestPassed,
                debateVideoMissing: !!rec.debateVideoMissing,
                note: rec.note || '',
                submissionLate: !!rec.submissionLate,
                overdueDismissed: !!rec.overdueDismissed,
                submittedAt: rec.submittedAt || ''
            }))
        });
    }

    function getEssayStatusCounts() {
        const d = domain();
        const students = getStudents();
        const activeStudentIds = students
            .map((entry) => entry && entry.student && entry.student.id)
            .filter(Boolean);
        const counts = d && draftSubmission
            ? d.countEssayByStatus(draftSubmission, activeStudentIds)
            : { not_submitted: 0, submitted: 0, complete: 0, resubmit_required: 0, demerit: 0, incomplete: 0, exempt: 0 };
        return Object.assign({ total: students.length }, counts);
    }

    function isReceivedStatus(status) {
        return (
            status === 'submitted' ||
            status === 'complete' ||
            status === 'resubmit_required' ||
            status === 'demerit'
        );
    }

    function isEnteringReceivedStatus(prevStatus, nextStatus) {
        return !isReceivedStatus(prevStatus) && isReceivedStatus(nextStatus);
    }

    function shouldPromptReceiveTiming(prevStatus, nextStatus) {
        const d = domain();
        if (!d || !draftSubmission) {
            return false;
        }
        if (!isEnteringReceivedStatus(prevStatus, nextStatus)) {
            return false;
        }
        return d.isEssaySsOverdueISO(draftSubmission.ssDueDate || '');
    }

    /**
     * Ask On time vs Late when marking received after the due date.
     * Resolves 'on_time' | 'late' | null (cancel).
     */
    function promptReceiveTiming() {
        return new Promise((resolve) => {
            let settled = false;
            const modalApi = global.CCPModal;
            const finish = (value) => {
                if (settled) {
                    return;
                }
                settled = true;
                if (modalApi && typeof modalApi.close === 'function') {
                    modalApi.close(modal);
                }
                if (modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
                resolve(value);
            };
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', 'essayReceiveTimingTitle');
            modal.innerHTML = `<div class="modal-content classroom-essay-receive-timing-modal">
                <div class="modal-header">
                    <h3 id="essayReceiveTimingTitle">${escapeHtml(t('classroomEssayReceiveTimingTitle'))}</h3>
                    <button type="button" class="modal-close" data-receive-timing="cancel" aria-label="${escapeAttr(t('classroomEssayReceiveTimingCancel'))}">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="section-hint">${escapeHtml(t('classroomEssayReceiveTimingHint'))}</p>
                    <div class="toolbar-actions classroom-essay-receive-timing-actions">
                        <button type="button" class="btn btn-primary" data-receive-timing="on_time">${escapeHtml(t('classroomEssayReceiveOnTime'))}</button>
                        <button type="button" class="btn btn-outline" data-receive-timing="late">${escapeHtml(t('classroomEssayReceiveLate'))}</button>
                        <button type="button" class="btn btn-secondary" data-receive-timing="cancel">${escapeHtml(t('classroomEssayReceiveTimingCancel'))}</button>
                    </div>
                </div>
            </div>`;
            document.body.appendChild(modal);
            if (modalApi && typeof modalApi.open === 'function') {
                modalApi.open(modal);
            }
            if (modalApi && typeof modalApi.bindBackdropClose === 'function') {
                modalApi.bindBackdropClose(modal, () => finish(null));
            }
            modal.querySelectorAll('[data-receive-timing]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const choice = btn.getAttribute('data-receive-timing');
                    if (choice === 'on_time' || choice === 'late') {
                        finish(choice);
                        return;
                    }
                    finish(null);
                });
            });
            modal.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    finish(null);
                }
            });
            const primary = modal.querySelector('[data-receive-timing="on_time"]');
            if (primary && typeof primary.focus === 'function') {
                primary.focus();
            }
        });
    }

    function buildStatusPatch(prevStatus, nextStatus, timing) {
        const patch = { status: nextStatus };
        if (nextStatus !== 'resubmit_required') {
            patch.submittedRetest = false;
        }
        if (nextStatus !== 'demerit' || prevStatus !== 'demerit') {
            patch.retestAssigned = false;
            patch.retestPassed = false;
        }
        if (isEnteringReceivedStatus(prevStatus, nextStatus)) {
            patch.submissionLate = timing === 'late';
            if (timing === 'late') {
                patch.overdueDismissed = false;
            }
        } else if (nextStatus === 'not_submitted') {
            patch.submissionLate = false;
        } else if (!isReceivedStatus(nextStatus)) {
            patch.submissionLate = false;
        }
        return patch;
    }

    async function applyStatusChange(panel, studentId, nextStatus) {
        const rec = getRecord(studentId);
        const prevStatus = rec ? rec.status : 'not_submitted';
        if (prevStatus === nextStatus) {
            return;
        }
        let timing = 'on_time';
        if (shouldPromptReceiveTiming(prevStatus, nextStatus)) {
            const choice = await promptReceiveTiming();
            if (choice == null) {
                return;
            }
            timing = choice;
        }
        const patch = buildStatusPatch(prevStatus, nextStatus, timing);
        const result = setRecord(studentId, patch);
        if (recordAffectsResubmitDayNote(result.prev, result.next)) {
            markResubmitDayNoteDirty();
        }
        afterEssayStatusChange(panel, studentId);
    }

    function clearEssayOverdue(panel, studentId) {
        const result = setRecord(studentId, {
            overdueDismissed: true,
            submissionLate: false
        });
        if (recordAffectsResubmitDayNote(result.prev, result.next)) {
            markResubmitDayNoteDirty();
        }
        afterEssayStatusChange(panel, studentId);
    }

    function markEssaySubmissionLate(panel, studentId) {
        const result = setRecord(studentId, {
            submissionLate: true,
            overdueDismissed: false
        });
        if (recordAffectsResubmitDayNote(result.prev, result.next)) {
            markResubmitDayNoteDirty();
        }
        afterEssayStatusChange(panel, studentId);
    }

    function restoreEssayOverdue(panel, studentId) {
        const result = setRecord(studentId, {
            overdueDismissed: false
        });
        if (recordAffectsResubmitDayNote(result.prev, result.next)) {
            markResubmitDayNoteDirty();
        }
        afterEssayStatusChange(panel, studentId);
    }

    function getEssaysOnlyToggle() {
        const ui = getAppData().ui || {};
        if (ui.classroomZoneEssaysOnly === true || ui.classroomZoneEssaysOnly === '1') {
            return true;
        }
        if (ui.classroomZoneEssaysOnly === false || ui.classroomZoneEssaysOnly === '0') {
            return false;
        }
        return true;
    }

    function buildSsOverduePill(isoDate) {
        const d = domain();
        if (!d || !isoDate) {
            return '';
        }
        const days = d.daysUntilISO(isoDate);
        if (days == null || days > 0) {
            return '';
        }
        const overdueDays = days === 0 ? 0 : Math.abs(days);
        const label =
            days === 0
                ? t('classroomEssayOverdueToday')
                : tf('classroomEssayOverdueDays', { days: overdueDays });
        return `<span class="classroom-essay-overdue-pill" role="status"><span class="classroom-essay-overdue-pill-dot" aria-hidden="true"></span>${escapeHtml(label)}</span>`;
    }

    function buildTeacherEvalOverduePill(submission, isoDate) {
        const d = domain();
        if (!d || !isoDate || !d.isEssayTeacherEvalOverdue) {
            return '';
        }
        const activeStudentIds = getStudents()
            .map((entry) => entry && entry.student && entry.student.id)
            .filter(Boolean);
        if (!d.isEssayTeacherEvalOverdue(submission, isoDate, activeStudentIds)) {
            return '';
        }
        const days = d.daysUntilISO(isoDate);
        if (days == null) {
            return '';
        }
        const overdueDays = days === 0 ? 0 : Math.abs(days);
        const label =
            days === 0
                ? t('classroomEssayOverdueToday')
                : tf('classroomEssayOverdueDays', { days: overdueDays });
        return `<span class="classroom-essay-overdue-pill classroom-essay-overdue-pill--teacher" role="status"><span class="classroom-essay-overdue-pill-dot" aria-hidden="true"></span>${escapeHtml(label)}</span>`;
    }

    async function rescanEssayAssignments(panel) {
        const d = domain();
        if (!d || !d.reparseEssayFlagsForClass || !d.pruneOrphanEssaySubmissions) {
            return;
        }
        if (typeof global.confirm === 'function' && !global.confirm(t('classroomEssayRescanConfirm'))) {
            return;
        }
        const data = getAppData();
        let classesUpdated = 0;
        let removed = 0;
        getAccessibleClasses().forEach((classData) => {
            if (!classData || !classData.id) {
                return;
            }
            if (access() && !access().canEditClass(classData) && !access().canBypass()) {
                return;
            }
            const idx = (data.classes || []).findIndex((c) => c && c.id === classData.id);
            if (idx < 0) {
                return;
            }
            const result = d.reparseEssayFlagsForClass(data.classes[idx]);
            if (result.rowsUpdated > 0) {
                classesUpdated += 1;
            }
            data.classes[idx].syllabusRows = result.rows;
            removed += d.pruneOrphanEssaySubmissions(data, data.classes[idx]);
        });
        if (typeof global.saveData === 'function') {
            global.saveData();
        }
        ensureClassVisibleAfterFilter(panel);
        applyResolvedAssignment(getClassData());
        selectedStudentIds.clear();
        loadSubmission();
        render(panel);
        if (hooks && hooks.showToast) {
            hooks.showToast(tf('classroomEssayRescanDone', { classes: classesUpdated, removed }));
        }
    }

    function refreshZoneContextBar() {
        const zone = global.CCPClassroomZoneContext;
        const mount = document.getElementById('classroomZoneContextBar');
        if (!zone || !zone.render || !mount) {
            return;
        }
        const submissions = getEssaySubmissionsForAlerts();
        if (typeof zone.withEssayAlertSubmissions === 'function') {
            zone.withEssayAlertSubmissions(submissions, () => zone.render(mount));
            return;
        }
        zone.render(mount);
    }

    function buildAlertBadgesHtml(rs, od, ae, asCount, nv) {
        const parts = [];
        if (rs > 0) {
            parts.push(
                `<span class="classroom-essay-alert-badge classroom-essay-alert-rs">${escapeHtml(tf('classroomEssayAlertRs', { count: rs }))}</span>`
            );
        }
        if (asCount > 0) {
            parts.push(
                `<span class="classroom-essay-alert-badge classroom-essay-alert-as">${escapeHtml(tf('classroomEssayAlertAs', { count: asCount }))}</span>`
            );
        }
        if (od > 0) {
            parts.push(
                `<span class="classroom-essay-alert-badge classroom-essay-alert-od">${escapeHtml(tf('classroomEssayAlertOd', { count: od }))}</span>`
            );
        }
        if (ae > 0) {
            parts.push(
                `<span class="classroom-essay-alert-badge classroom-essay-alert-ae">${escapeHtml(tf('classroomEssayAlertAe', { count: ae }))}</span>`
            );
        }
        if (nv > 0) {
            parts.push(
                `<span class="classroom-essay-alert-badge classroom-essay-alert-nv" title="${escapeAttr(t('classroomEssayDebateVideoMissing'))}">${escapeHtml(tf('classroomEssayAlertNv', { count: nv }))}</span>`
            );
        }
        return parts.length
            ? `<span class="classroom-essay-alert-badges">${parts.join('')}</span>`
            : '';
    }

    function buildMiniTrackHtml(counts) {
        const segments = essayStatsSegmentFlex(counts || {});
        return segments
            .filter((seg) => seg.count > 0)
            .map((seg) => {
                const meta = statusFilterSegments().find((s) => s.filter === seg.key);
                const cls = meta ? meta.cls : '';
                const flex = seg.flex > 0 ? seg.flex : 0.001;
                return `<span class="classroom-essay-stats-segment ${cls}" style="flex-grow:${flex}" aria-hidden="true"></span>`;
            })
            .join('');
    }

    function getCurrentAssignmentSummary() {
        const d = domain();
        const classData = getClassData();
        if (!classData || !d || !syllabusRowId) {
            return null;
        }
        const assignments = d.listEssayAssignmentsForClass(classData, getAppData());
        return assignments.find((row) => row.syllabusRowId === syllabusRowId) || null;
    }

    /** Local class picker removed — shared #classroomZoneContextBar drives class selection + Essays warn pills. */
    async function selectClass(panel, nextClassId) {
        if (!nextClassId || nextClassId === classId) {
            return;
        }
        await flushBeforeLeave();
        if (typeof global.CCPActiveContext !== 'undefined') {
            global.CCPActiveContext.setFromClass(getAppData(), nextClassId, undefined, 'essays-zone-context');
        } else if (hooks && hooks.setUiPref) {
            hooks.setUiPref('classroomTabClassId', nextClassId);
            classId = nextClassId;
            applyResolvedAssignment(getClassData());
            selectedStudentIds.clear();
            loadSubmission();
            render(panel);
        }
    }

    function renderClassPickerPopover() {
        /* no-op: zone bar owns the class picker */
    }

    function bindContextBarOutsideClick(panel) {
        if (panel.dataset.essayOutsideBound === '1') {
            return;
        }
        panel.dataset.essayOutsideBound = '1';
        document.addEventListener('click', (e) => {
            if (!panel || panel.hidden) {
                return;
            }
            const reports = panel.querySelector('.classroom-essay-reports-menu');
            if (reportsMenuOpen && reports && !reports.contains(e.target)) {
                closeReportsMenu();
                renderReportsMenu(panel);
            }
        });
    }

    const ESSAY_SUBJECT_ADD = '__add__';

    function reportCurrentUserId() {
        return hooks && hooks.getCurrentUserId ? hooks.getCurrentUserId() : '';
    }

    function normalizeReportClassScope(value, legacyMyClassesOnly) {
        const d = domain();
        if (d && d.normalizeEssayReportClassScope) {
            return d.normalizeEssayReportClassScope(value, legacyMyClassesOnly);
        }
        if (value === 'all' || value === 'mine' || value === 'other') {
            return value;
        }
        return legacyMyClassesOnly ? 'mine' : 'all';
    }

    function fillEssayReportSubjectSelect(select, selected, rows) {
        if (!select) {
            return;
        }
        const d = domain();
        const names = ['Debate', 'News'];
        const seen = new Set(['debate', 'news']);
        (rows || []).forEach((row) => {
            const raw = (row && (row.displaySubject || row.essaySubject)) || '';
            const canonical = d && d.canonicalEssaySubjectName
                ? d.canonicalEssaySubjectName(raw)
                : String(raw || '').trim();
            if (!canonical) {
                return;
            }
            const id = canonical.toLowerCase();
            if (seen.has(id)) {
                return;
            }
            seen.add(id);
            names.push(canonical);
        });
        const current = d && d.canonicalEssaySubjectName
            ? d.canonicalEssaySubjectName(selected) || ''
            : String(selected || '').trim();
        const options = [
            `<option value="">${escapeHtml(t('classroomEssayReportFilterAllSubjects'))}</option>`
        ];
        names.forEach((name) => {
            const sel = name === current ? ' selected' : '';
            options.push(
                `<option value="${escapeAttr(name)}"${sel}>${escapeHtml(essaySubjectLabel(name))}</option>`
            );
        });
        if (current && !names.includes(current)) {
            options.push(
                `<option value="${escapeAttr(current)}" selected>${escapeHtml(essaySubjectLabel(current))}</option>`
            );
        }
        select.innerHTML = options.join('');
    }

    function fillEssayReportClassScopeSelect(select, selected) {
        if (!select) {
            return;
        }
        const scope = normalizeReportClassScope(selected);
        const options = [
            ['all', t('classroomEssayReportFilterAllClasses')],
            ['mine', t('classroomEssayReportFilterMyClasses')],
            ['other', t('classroomEssayReportFilterOtherClasses')]
        ];
        select.innerHTML = options
            .map(([value, label]) => {
                const sel = value === scope ? ' selected' : '';
                return `<option value="${escapeAttr(value)}"${sel}>${escapeHtml(label)}</option>`;
            })
            .join('');
    }

    function essaySubjectLabel(name) {
        const id = String(name || '').trim().toLowerCase();
        if (id === 'debate' || id === '토론') {
            return t('classroomEssaySubjectDebate');
        }
        if (id === 'news' || id === '뉴스') {
            return t('classroomEssaySubjectNews');
        }
        return String(name || '').trim();
    }

    function formatEssayRowLabel(row) {
        const base = `${(row && row.date) || ''} — ${(row && (row.planTitle || row.planDetail)) || ''}`.trim();
        const d = domain();
        const subject = d && d.displayEssaySubject ? d.displayEssaySubject(row) : '';
        const label = essaySubjectLabel(subject);
        return label ? `${base} · ${label}` : base;
    }

    function currentEssayRow() {
        const d = domain();
        const classData = getClassData();
        if (!d || !classData || !syllabusRowId) {
            return null;
        }
        return (
            d.getEssayRowsFromSyllabus(classData.syllabusRows, { classData }).find(
                (r) => d.getSyllabusRowKey(r) === syllabusRowId
            ) || null
        );
    }

    function essaySubjectOptionsHtml(selectedName) {
        const d = domain();
        const names =
            d && d.listEssaySubjectChoices
                ? d.listEssaySubjectChoices(getAppData(), getClassData())
                : ['Debate', 'News'];
        const selected = String(selectedName || '').trim();
        const opts = [
            `<option value=""${selected ? '' : ' selected'}>${escapeHtml(t('classroomEssaySubjectChoose'))}</option>`
        ];
        names.forEach((name) => {
            const sel = selected === name ? ' selected' : '';
            opts.push(
                `<option value="${escapeAttr(name)}"${sel}>${escapeHtml(essaySubjectLabel(name))}</option>`
            );
        });
        if (selected && !names.includes(selected)) {
            opts.push(
                `<option value="${escapeAttr(selected)}" selected>${escapeHtml(essaySubjectLabel(selected))}</option>`
            );
        }
        opts.push(
            `<option value="${ESSAY_SUBJECT_ADD}">${escapeHtml(t('classroomEssaySubjectAdd'))}</option>`
        );
        return opts.join('');
    }

    function setSubjectOtherVisible(select, wrap) {
        if (!wrap) {
            return;
        }
        const show = select && select.value === ESSAY_SUBJECT_ADD;
        wrap.hidden = !show;
    }

    async function persistEssaySubject(name) {
        const d = domain();
        const classData = getClassData();
        const panel = panelRef || document.getElementById('panel-essays');
        if (!d || !classData || !syllabusRowId || !d.setEssayAssignmentSubject) {
            return;
        }
        if (access() && !access().canEditClass(classData) && !access().canBypass()) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayAddAssignmentNoPermission'), true);
            }
            return;
        }
        const canonical = d.canonicalEssaySubjectName ? d.canonicalEssaySubjectName(name) : String(name || '').trim();
        const already = d.savedEssaySubject ? d.savedEssaySubject(currentEssayRow()) : '';
        if (!canonical || already === canonical) {
            return;
        }
        const result = d.setEssayAssignmentSubject(classData, syllabusRowId, canonical);
        if (result.error === 'missing_subject') {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayAddAssignmentNeedSubject'), true);
            }
            return;
        }
        if (result.error || !result.classData) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayAddAssignmentFailed'), true);
            }
            return;
        }
        const data = getAppData();
        const nextLinks = d.clearTmsEssayLinksForAssignment
            ? d.clearTmsEssayLinksForAssignment(data.tmsEssayLinks, classData.id, syllabusRowId)
            : data.tmsEssayLinks;
        data.tmsEssayLinks = nextLinks;
        if (classData.isEssayGroup) {
            const existing = d.findEssayGroup(data, classData.id);
            if (!existing) {
                return;
            }
            const nextGroup = Object.assign({}, existing, {
                assignments: result.classData.syllabusRows,
                updatedAt: new Date().toISOString()
            });
            const authorUserId = hooks && hooks.getCurrentUserId ? hooks.getCurrentUserId() : '';
            const upserted = d.upsertEssayGroup(data, nextGroup, { authorUserId });
            if (upserted.error) {
                return;
            }
            if (hooks && hooks.saveClassroom) {
                await hooks.saveClassroom({
                    essayGroups: data.essayGroups,
                    tmsEssayLinks: nextLinks
                });
            }
        } else {
            const idx = (data.classes || []).findIndex((c) => c && c.id === result.classData.id);
            if (idx >= 0) {
                data.classes[idx] = result.classData;
            }
            if (typeof global.saveData === 'function') {
                await Promise.resolve(global.saveData());
            }
            if (hooks && hooks.saveClassroom) {
                await hooks.saveClassroom({ tmsEssayLinks: nextLinks });
            }
        }
        if (panel) {
            render(panel);
        }
        refreshZoneContextBar();
    }

    async function persistEssayListMonth(value) {
        const d = domain();
        const classData = getClassData();
        const panel = panelRef || document.getElementById('panel-essays');
        if (!d || !classData || !syllabusRowId || !d.setEssayAssignmentListMonth) {
            return;
        }
        if (access() && !access().canEditClass(classData) && !access().canBypass()) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayAddAssignmentNoPermission'), true);
            }
            return;
        }
        const month = /^\d{4}-\d{2}$/.test(String(value || '')) ? String(value) : '';
        const row = currentEssayRow();
        const saved = row && /^\d{4}-\d{2}$/.test(String(row.essayListMonth || '')) ? row.essayListMonth : '';
        const fallback = d.essayAssignmentListMonth
            ? d.essayAssignmentListMonth(Object.assign({}, row || {}, { essayListMonth: '' }))
            : '';
        if (month === saved || (!saved && month === fallback)) {
            return;
        }
        const result = d.setEssayAssignmentListMonth(classData, syllabusRowId, month);
        if (result.error || !result.classData) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayAddAssignmentFailed'), true);
            }
            return;
        }
        const data = getAppData();
        if (classData.isEssayGroup) {
            const existing = d.findEssayGroup(data, classData.id);
            if (!existing) {
                return;
            }
            const nextGroup = Object.assign({}, existing, {
                assignments: result.classData.syllabusRows,
                updatedAt: new Date().toISOString()
            });
            const authorUserId = hooks && hooks.getCurrentUserId ? hooks.getCurrentUserId() : '';
            const upserted = d.upsertEssayGroup(data, nextGroup, { authorUserId });
            if (upserted.error) {
                return;
            }
            if (hooks && hooks.saveClassroom) {
                await hooks.saveClassroom({ essayGroups: data.essayGroups });
            }
        } else {
            const idx = (data.classes || []).findIndex((c) => c && c.id === result.classData.id);
            if (idx >= 0) {
                data.classes[idx] = result.classData;
            }
            if (typeof global.saveData === 'function') {
                await Promise.resolve(global.saveData());
            }
        }
        if (panel) {
            render(panel);
        }
        refreshZoneContextBar();
    }

    async function retconCheckedCompletions(panel) {
        const d = domain();
        const classData = getClassData();
        if (!d || !classData || !syllabusRowId || !d.retconEssayCompletions) {
            return;
        }
        if (!selectedStudentIds.size) {
            return;
        }
        const saved = d.savedEssaySubject ? d.savedEssaySubject(currentEssayRow()) : '';
        if (!saved) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayRetconNeedSubject'), true);
            }
            return;
        }
        if (access() && !access().canEditClass(classData) && !access().canBypass()) {
            return;
        }
        if (typeof global.confirm === 'function' && !global.confirm(t('classroomEssayRetconConfirm'))) {
            return;
        }
        await flushBeforeLeave();
        const data = getAppData();
        const result = d.retconEssayCompletions(data, {
            classId: classData.id,
            syllabusRowId,
            studentIds: Array.from(selectedStudentIds)
        });
        if (result.error === 'missing_subject') {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayRetconNeedSubject'), true);
            }
            return;
        }
        if (result.error) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayAddAssignmentFailed'), true);
            }
            return;
        }
        data.essaySubmissions = result.essaySubmissions;
        data.tmsEssayLinks = result.tmsEssayLinks;
        loadSubmission();
        try {
            if (hooks && hooks.saveClassroom) {
                await hooks.saveClassroom({
                    essaySubmissions: result.essaySubmissions,
                    tmsEssayLinks: result.tmsEssayLinks
                });
            }
        } catch (err) {
            if (hooks && hooks.showToast) {
                hooks.showToast((err && err.message) || t('classroomEssayAddAssignmentFailed'), true);
            }
            return;
        }
        selectedStudentIds.clear();
        if (panel) {
            render(panel);
        }
        if (hooks && hooks.showToast) {
            const count = result.resetCount || 0;
            hooks.showToast(
                count
                    ? tf('classroomEssayRetconDone', { count })
                    : t('classroomEssayRetconNone')
            );
        }
    }

    function bindContextBarEvents(panel) {
        const mount = panel.querySelector('#classroomEssaysContextBar');
        if (!mount || mount.dataset.bound === '1') {
            return;
        }
        mount.dataset.bound = '1';
        mount.addEventListener('change', (e) => {
            const target = e.target;
            if (!target || !mount.contains(target)) {
                return;
            }
            if (target.id === 'classroomEssaysSsDue' && draftSubmission) {
                draftSubmission.ssDueDate = target.value;
                const dueDomain = domain();
                if (dueDomain && typeof dueDomain.applyEssayLateForDueDate === 'function') {
                    draftSubmission = dueDomain.applyEssayLateForDueDate(draftSubmission, target.value);
                }
                scheduleSave();
                renderStatsBar(panel);
                renderRows(panel);
                refreshZoneContextBar();
            }
            if (target.id === 'classroomEssaysTeacherEvalDue' && draftSubmission) {
                draftSubmission.teacherEvalDueDate = target.value;
                scheduleSave();
                renderStatsBar(panel);
                renderRows(panel);
                refreshZoneContextBar();
            }
            if (target.id === 'classroomEssaysListMonth') {
                void persistEssayListMonth(target.value || '');
            }
            if (target.id === 'classroomEssaysSubjectSelect') {
                const wrap = mount.querySelector('#classroomEssaysSubjectOtherWrap');
                setSubjectOtherVisible(target, wrap);
                if (target.value && target.value !== ESSAY_SUBJECT_ADD) {
                    void persistEssaySubject(target.value);
                }
            }
        });
        mount.addEventListener('keydown', (e) => {
            const input = e.target;
            if (!input || input.id !== 'classroomEssaysSubjectOtherInput' || e.key !== 'Enter') {
                return;
            }
            e.preventDefault();
            const name = (input.value || '').trim();
            if (name) {
                void persistEssaySubject(name);
            }
        });
        mount.addEventListener('focusout', (e) => {
            const input = e.target;
            if (!input || input.id !== 'classroomEssaysSubjectOtherInput') {
                return;
            }
            const name = (input.value || '').trim();
            if (name) {
                void persistEssaySubject(name);
            }
        });
    }

    function renderContextBar(panel) {
        const mount = panel.querySelector('#classroomEssaysContextBar');
        if (!mount) {
            return;
        }
        bindContextBarOutsideClick(panel);
        bindContextBarEvents(panel);

        const classData = getClassData();
        const d = domain();
        const editable = access() && access().canEditClass(classData);
        const deadlineDisabled = editable ? '' : ' disabled';
        const summary = getCurrentAssignmentSummary();
        const ss = draftSubmission
            ? draftSubmission.ssDueDate || (summary && summary.ssDueDate) || ''
            : '';
        const te = draftSubmission
            ? draftSubmission.teacherEvalDueDate || (summary && summary.teacherEvalDueDate) || ''
            : '';

        // Rebuild if missing inner shell, still holding the old local assignment picker, or leftover local class picker.
        const needsShell =
            !mount.querySelector('.classroom-essays-context-bar-inner') ||
            !!mount.querySelector('#classroomEssaysAssignmentSelect') ||
            !mount.querySelector('#classroomEssaysSubjectSelect') ||
            !mount.querySelector('#classroomEssaysListMonth') ||
            !!mount.querySelector('.classroom-essay-class-picker');
        const savedSubject = domain() && domain().savedEssaySubject
            ? domain().savedEssaySubject(currentEssayRow())
            : '';
        const subjectOpts = essaySubjectOptionsHtml(savedSubject);
        const subjectDisabled = editable && classData && syllabusRowId ? '' : ' disabled';
        const listMonth = domain() && domain().essayAssignmentListMonth
            ? domain().essayAssignmentListMonth(currentEssayRow())
            : '';
        const listMonthDisabled = editable && classData && syllabusRowId ? '' : ' disabled';
        if (needsShell) {
            mount.innerHTML = `
                <div class="classroom-essays-context-bar-inner">
                    <label class="classroom-essay-context-field classroom-essay-context-field--subject">
                        <span class="classroom-essay-context-label">${escapeHtml(t('classroomEssaySubjectLabel'))}</span>
                        <select id="classroomEssaysSubjectSelect" class="field-select field-control classroom-essay-datefield" aria-label="${escapeAttr(t('classroomEssaySubjectLabel'))}"${subjectDisabled}>${subjectOpts}</select>
                    </label>
                    <label class="classroom-essay-context-field classroom-essay-context-field--subject" id="classroomEssaysSubjectOtherWrap" hidden>
                        <span class="classroom-essay-context-label">${escapeHtml(t('classroomEssaySubjectNewLabel'))}</span>
                        <input type="text" id="classroomEssaysSubjectOtherInput" class="field-input field-control classroom-essay-datefield" maxlength="80" placeholder="${escapeAttr(t('classroomEssaySubjectNewPlaceholder'))}" aria-label="${escapeAttr(t('classroomEssaySubjectNewLabel'))}"${subjectDisabled} />
                    </label>
                    <label class="classroom-essay-context-field">
                        <span class="classroom-essay-context-label">${escapeHtml(t('classroomEssayListMonthLabel'))}</span>
                        <input type="month" id="classroomEssaysListMonth" class="field-input field-control classroom-essay-datefield" value="${escapeHtml(listMonth)}" aria-label="${escapeAttr(t('classroomEssayListMonthLabel'))}"${listMonthDisabled} />
                    </label>
                    <label class="classroom-essay-context-field">
                        <span class="classroom-essay-context-label">${escapeHtml(t('classroomEssaySsDueShort'))}</span>
                        <input type="date" id="classroomEssaysSsDue" class="field-input field-control classroom-essay-datefield" value="${escapeHtml(ss)}"${deadlineDisabled} />
                    </label>
                    <label class="classroom-essay-context-field">
                        <span class="classroom-essay-context-label">${escapeHtml(t('classroomEssayTeacherEvalDueShort'))}</span>
                        <input type="date" id="classroomEssaysTeacherEvalDue" class="field-input field-control classroom-essay-datefield" value="${escapeHtml(te)}"${deadlineDisabled} />
                    </label>
                </div>`;
        } else {
            const ssInput = mount.querySelector('#classroomEssaysSsDue');
            if (ssInput) {
                if (ssInput.value !== ss) {
                    ssInput.value = ss;
                }
                ssInput.disabled = !editable;
            }
            const teInput = mount.querySelector('#classroomEssaysTeacherEvalDue');
            if (teInput) {
                if (teInput.value !== te) {
                    teInput.value = te;
                }
                teInput.disabled = !editable;
            }
            const listMonthInput = mount.querySelector('#classroomEssaysListMonth');
            if (listMonthInput && document.activeElement !== listMonthInput) {
                if (listMonthInput.value !== listMonth) {
                    listMonthInput.value = listMonth;
                }
                listMonthInput.disabled = !editable || !classData || !syllabusRowId;
            }
            const subjectSelect = mount.querySelector('#classroomEssaysSubjectSelect');
            if (subjectSelect && document.activeElement !== subjectSelect) {
                subjectSelect.innerHTML = subjectOpts;
                subjectSelect.value = savedSubject || '';
                subjectSelect.disabled = !editable || !classData || !syllabusRowId;
            }
            const subjectOther = mount.querySelector('#classroomEssaysSubjectOtherWrap');
            if (subjectOther && subjectSelect && subjectSelect.value !== ESSAY_SUBJECT_ADD) {
                subjectOther.hidden = true;
            }
        }

        renderClassPickerPopover();
    }

    async function selectAssignment(panel, nextSyllabusRowId, nextLessonDate) {
        await flushBeforeLeave();
        syllabusRowId = nextSyllabusRowId;
        lessonDate = nextLessonDate || '';
        if (classId && syllabusRowId) {
            persistEssayAssignmentForClass(classId, syllabusRowId);
        }
        selectedStudentIds.clear();
        currentFilter = 'all';
        loadSubmission();
        render(panel);
    }

    function setAddAssignmentError(message) {
        const el = document.getElementById('essayAddAssignmentError');
        if (!el) {
            return;
        }
        if (message) {
            el.hidden = false;
            el.textContent = message;
        } else {
            el.hidden = true;
            el.textContent = '';
        }
    }

    function closeAddAssignmentModal() {
        const modal = document.getElementById('essayAddAssignmentModal');
        if (!modal) {
            return;
        }
        if (hooks && hooks.closeModal) {
            hooks.closeModal(modal);
        } else {
            modal.classList.remove('active');
            modal.hidden = true;
        }
    }

    function updateAddAssignmentConfirmLabel() {
        const confirmBtn = document.getElementById('essayAddAssignmentConfirm');
        const list = document.getElementById('essayAddAssignmentClassList');
        if (!confirmBtn) {
            return;
        }
        if (isCurrentEssayGroup()) {
            confirmBtn.textContent = t('classroomEssayAddAssignmentConfirm');
            return;
        }
        const checked = list
            ? list.querySelectorAll('input[type="checkbox"][data-class-id]:checked').length
            : 1;
        if (checked > 1) {
            confirmBtn.textContent = tf('classroomEssayAddAssignmentConfirmMany', { count: checked });
        } else {
            confirmBtn.textContent = t('classroomEssayAddAssignmentConfirm');
        }
    }

    function renderAddAssignmentClassList(preselectedId) {
        const list = document.getElementById('essayAddAssignmentClassList');
        const wrap = document.getElementById('essayAddAssignmentClassListWrap');
        const classLabel = document.getElementById('essayAddAssignmentClassLabel');
        if (!list) {
            return;
        }
        if (isCurrentEssayGroup()) {
            if (wrap) {
                wrap.hidden = true;
            }
            if (classLabel) {
                const classData = getClassData();
                classLabel.hidden = false;
                classLabel.textContent = tf('classroomEssayAddAssignmentForGroup', {
                    name: (classData && classData.name) || classId
                });
            }
            list.innerHTML = '';
            return;
        }
        if (wrap) {
            wrap.hidden = false;
        }
        if (classLabel) {
            classLabel.hidden = true;
            classLabel.textContent = '';
        }
        const classes = getAccessibleClasses().slice().sort((a, b) =>
            String(a.name || a.id).localeCompare(String(b.name || b.id))
        );
        list.innerHTML = classes
            .map((c) => {
                const checked = c.id === preselectedId ? ' checked' : '';
                return `<label class="selection-chip checkbox-label">
                    <input type="checkbox" data-class-id="${escapeAttr(c.id)}"${checked} />
                    <span>${escapeHtml(c.name || c.id)}</span>
                </label>`;
            })
            .join('');
        list.querySelectorAll('input[type="checkbox"]').forEach((input) => {
            input.addEventListener('change', () => updateAddAssignmentConfirmLabel());
        });
        updateAddAssignmentConfirmLabel();
    }

    function syncAddAssignmentMonthFromDate(force) {
        const dateInput = document.getElementById('essayAddAssignmentDateInput');
        const monthInput = document.getElementById('essayAddAssignmentMonthInput');
        if (!dateInput || !monthInput) {
            return;
        }
        if (!force && monthInput.dataset.userSet === '1') {
            return;
        }
        const date = dateInput.value || '';
        monthInput.value = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : '';
    }

    function openAddAssignmentModal(panel) {
        const classData = getClassData();
        const d = domain();
        if (!classData || !d || !d.createCustomEssayAssignment) {
            return;
        }
        if (access() && !access().canEditClass(classData) && !access().canBypass()) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayAddAssignmentNoPermission'), true);
            }
            return;
        }
        const modal = document.getElementById('essayAddAssignmentModal');
        if (!modal) {
            return;
        }
        renderAddAssignmentClassList(classData.id);
        const titleInput = document.getElementById('essayAddAssignmentTitleInput');
        const dateInput = document.getElementById('essayAddAssignmentDateInput');
        const monthInput = document.getElementById('essayAddAssignmentMonthInput');
        const subjectSelect = document.getElementById('essayAddAssignmentSubjectInput');
        const subjectOtherWrap = document.getElementById('essayAddAssignmentSubjectOtherWrap');
        const subjectOtherInput = document.getElementById('essayAddAssignmentSubjectOtherInput');
        if (titleInput) {
            titleInput.value = '';
        }
        if (dateInput) {
            dateInput.value = (d.todayISO && d.todayISO()) || '';
        }
        if (monthInput) {
            delete monthInput.dataset.userSet;
            syncAddAssignmentMonthFromDate(true);
        }
        if (subjectSelect) {
            subjectSelect.innerHTML = essaySubjectOptionsHtml('');
            subjectSelect.value = '';
        }
        if (subjectOtherWrap) {
            subjectOtherWrap.hidden = true;
        }
        if (subjectOtherInput) {
            subjectOtherInput.value = '';
        }
        setAddAssignmentError('');
        updateAddAssignmentConfirmLabel();
        if (hooks && hooks.openModal) {
            hooks.openModal(modal);
        } else {
            modal.classList.add('active');
            modal.hidden = false;
        }
        if (titleInput) {
            titleInput.focus();
        }
    }

    async function confirmAddAssignment() {
        const d = domain();
        const classData = getClassData();
        const panel = panelRef || document.getElementById('panel-essays');
        if (!d || !classData) {
            return;
        }
        if (access() && !access().canEditClass(classData) && !access().canBypass()) {
            setAddAssignmentError(t('classroomEssayAddAssignmentNoPermission'));
            return;
        }
        const title = (document.getElementById('essayAddAssignmentTitleInput')?.value || '').trim();
        const date = (document.getElementById('essayAddAssignmentDateInput')?.value || '').trim();
        const essayListMonth = (document.getElementById('essayAddAssignmentMonthInput')?.value || '').trim();
        const subjectSelect = document.getElementById('essayAddAssignmentSubjectInput');
        const subjectChoice = subjectSelect ? subjectSelect.value : '';
        const subjectOther = (document.getElementById('essayAddAssignmentSubjectOtherInput')?.value || '').trim();
        const essaySubject = subjectChoice === ESSAY_SUBJECT_ADD ? subjectOther : subjectChoice;
        if (!essaySubject) {
            setAddAssignmentError(t('classroomEssayAddAssignmentNeedSubject'));
            return;
        }

        if (classData.isEssayGroup) {
            if (!d.createCustomEssayAssignmentOnGroup || !d.upsertEssayGroup || !d.findEssayGroup) {
                setAddAssignmentError(t('classroomEssayAddAssignmentFailed'));
                return;
            }
            const data = getAppData();
            const existing = d.findEssayGroup(data, classData.id);
            if (!existing) {
                setAddAssignmentError(t('classroomEssayAddAssignmentFailed'));
                return;
            }
            const result = d.createCustomEssayAssignmentOnGroup(existing, { title, date, essaySubject, essayListMonth });
            if (result.error === 'missing_title') {
                setAddAssignmentError(t('classroomEssayAddAssignmentNeedTitle'));
                return;
            }
            if (result.error === 'invalid_date') {
                setAddAssignmentError(t('classroomEssayAddAssignmentNeedDate'));
                return;
            }
            if (result.error || !result.group || !result.syllabusRowId) {
                setAddAssignmentError(t('classroomEssayAddAssignmentFailed'));
                return;
            }
            const authorUserId = hooks && hooks.getCurrentUserId ? hooks.getCurrentUserId() : '';
            const upserted = d.upsertEssayGroup(data, result.group, { authorUserId });
            if (upserted.error) {
                setAddAssignmentError(t('classroomEssayAddAssignmentFailed'));
                return;
            }
            try {
                if (hooks && hooks.saveClassroom) {
                    await hooks.saveClassroom({ essayGroups: data.essayGroups });
                }
            } catch (err) {
                setAddAssignmentError(
                    (err && err.message) || t('classroomEssayAddAssignmentFailed')
                );
                return;
            }
            closeAddAssignmentModal();
            syllabusRowId = result.syllabusRowId;
            lessonDate = date;
            persistEssayAssignmentForClass(classData.id, result.syllabusRowId);
            selectedStudentIds.clear();
            currentFilter = 'all';
            loadSubmission();
            if (panel) {
                render(panel);
            }
            refreshZoneContextBar();
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayAddAssignmentDone'));
            }
            return;
        }

        const list = document.getElementById('essayAddAssignmentClassList');
        const selectedIds = list
            ? Array.from(list.querySelectorAll('input[type="checkbox"][data-class-id]:checked')).map(
                  (el) => el.getAttribute('data-class-id')
              )
            : [classData.id];
        const data = getAppData();
        const cohorts = data.cohorts || [];
        const targets = selectedIds
            .map((id) => (data.classes || []).find((c) => c && c.id === id))
            .filter(
                (c) =>
                    c &&
                    (!access() || access().canEditClass(c, cohorts) || access().canBypass())
            );
        if (!targets.length) {
            setAddAssignmentError(t('classroomEssayAddAssignmentNeedClass'));
            return;
        }
        const batch =
            targets.length === 1
                ? (() => {
                      const one = d.createCustomEssayAssignment(targets[0], { title, date, essaySubject, essayListMonth });
                      return {
                          error: one.error,
                          results: one.error ? [] : [one],
                          updatedClasses: one.error ? [] : [one.classData]
                      };
                  })()
                : d.createCustomEssayAssignmentsForClasses
                  ? d.createCustomEssayAssignmentsForClasses(targets, { title, date, essaySubject, essayListMonth })
                  : { error: 'missing_helper', results: [], updatedClasses: [] };

        if (batch.error === 'missing_title') {
            setAddAssignmentError(t('classroomEssayAddAssignmentNeedTitle'));
            return;
        }
        if (batch.error === 'invalid_date') {
            setAddAssignmentError(t('classroomEssayAddAssignmentNeedDate'));
            return;
        }
        if (batch.error || !batch.updatedClasses.length) {
            setAddAssignmentError(t('classroomEssayAddAssignmentFailed'));
            return;
        }
        batch.updatedClasses.forEach((updated) => {
            const idx = (data.classes || []).findIndex((c) => c && c.id === updated.id);
            if (idx >= 0) {
                data.classes[idx] = updated;
            }
        });
        try {
            if (typeof global.saveData === 'function') {
                await Promise.resolve(global.saveData());
            }
        } catch (err) {
            setAddAssignmentError(
                (err && err.message) || t('classroomEssayAddAssignmentFailed')
            );
            return;
        }
        closeAddAssignmentModal();
        const stayId = selectedIds.includes(classId) ? classId : selectedIds[0];
        const stayResult =
            batch.results.find((r) => r && r.classData && r.classData.id === stayId) ||
            batch.results[0];
        if (stayId && stayId !== classId) {
            classId = stayId;
            if (hooks && hooks.setUiPref) {
                hooks.setUiPref('classroomTabClassId', classId);
            }
        }
        syllabusRowId = stayResult ? stayResult.syllabusRowId : '';
        lessonDate = date;
        if (syllabusRowId) {
            persistEssayAssignmentForClass(classId, syllabusRowId);
        }
        selectedStudentIds.clear();
        currentFilter = 'all';
        loadSubmission();
        if (panel) {
            render(panel);
        }
        refreshZoneContextBar();
        if (hooks && hooks.showToast) {
            hooks.showToast(
                batch.results.length > 1
                    ? tf('classroomEssayAddAssignmentDoneMany', { count: batch.results.length })
                    : t('classroomEssayAddAssignmentDone')
            );
        }
    }

    function bindAddAssignmentModal() {
        const modal = document.getElementById('essayAddAssignmentModal');
        if (!modal || modal.dataset.bound === '1') {
            return;
        }
        modal.dataset.bound = '1';
        document.getElementById('essayAddAssignmentClose')?.addEventListener('click', () => {
            closeAddAssignmentModal();
        });
        document.getElementById('essayAddAssignmentCancel')?.addEventListener('click', () => {
            closeAddAssignmentModal();
        });
        document.getElementById('essayAddAssignmentConfirm')?.addEventListener('click', () => {
            void confirmAddAssignment();
        });
        document.getElementById('essayAddAssignmentTitleInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void confirmAddAssignment();
            }
        });
        document.getElementById('essayAddAssignmentDateInput')?.addEventListener('change', () => {
            syncAddAssignmentMonthFromDate(false);
        });
        document.getElementById('essayAddAssignmentMonthInput')?.addEventListener('change', (e) => {
            if (e.target) {
                e.target.dataset.userSet = '1';
            }
        });
        document.getElementById('essayAddAssignmentSubjectInput')?.addEventListener('change', (e) => {
            const wrap = document.getElementById('essayAddAssignmentSubjectOtherWrap');
            setSubjectOtherVisible(e.target, wrap);
            if (e.target && e.target.value !== ESSAY_SUBJECT_ADD) {
                const other = document.getElementById('essayAddAssignmentSubjectOtherInput');
                if (other) {
                    other.value = '';
                }
            }
        });
    }

    let essayGroupModalEditId = '';

    function setEssayGroupModalError(message) {
        const el = document.getElementById('essayGroupModalError');
        if (!el) {
            return;
        }
        if (message) {
            el.hidden = false;
            el.textContent = message;
        } else {
            el.hidden = true;
            el.textContent = '';
        }
    }

    function closeEssayGroupModal() {
        const modal = document.getElementById('essayGroupModal');
        if (!modal) {
            return;
        }
        essayGroupModalEditId = '';
        if (hooks && hooks.closeModal) {
            hooks.closeModal(modal);
        } else {
            modal.classList.remove('active');
            modal.hidden = true;
        }
    }

    function renderEssayGroupStudentList(sourceClassId, selectedIds) {
        const list = document.getElementById('essayGroupStudentList');
        const d = domain();
        if (!list || !d) {
            return;
        }
        const data = getAppData();
        const classData = (data.classes || []).find((c) => c && c.id === sourceClassId) || null;
        const students = classData
            ? d.resolveStudentsForClass(classData, data.cohorts)
            : [];
        const selected = new Set((selectedIds || []).map(String));
        if (!students.length) {
            list.innerHTML = `<p class="section-hint">${escapeHtml(t('classroomEssayGroupNoStudents'))}</p>`;
            return;
        }
        list.innerHTML = students
            .map((entry) => {
                const student = entry.student;
                const checked = selected.has(String(student.id)) ? ' checked' : '';
                const name = student.name || student.nameEn || student.id;
                return `<label class="selection-chip checkbox-label">
                    <input type="checkbox" data-student-id="${escapeAttr(student.id)}"${checked} />
                    <span>${escapeHtml(name)}</span>
                </label>`;
            })
            .join('');
    }

    function fillEssayGroupSourceClassSelect(preferredId) {
        const select = document.getElementById('essayGroupSourceClassSelect');
        if (!select) {
            return;
        }
        const classes = getAccessibleClasses().slice().sort((a, b) =>
            String(a.name || a.id).localeCompare(String(b.name || b.id))
        );
        select.innerHTML = classes
            .map((c) => {
                const sel = c.id === preferredId ? ' selected' : '';
                return `<option value="${escapeAttr(c.id)}"${sel}>${escapeHtml(c.name || c.id)}</option>`;
            })
            .join('');
        if (!select.value && classes[0]) {
            select.value = classes[0].id;
        }
    }

    function openEssayGroupModal(editGroupId) {
        const d = domain();
        const data = getAppData();
        const modal = document.getElementById('essayGroupModal');
        if (!modal || !d) {
            return;
        }
        essayGroupModalEditId = editGroupId || '';
        const titleEl = document.getElementById('essayGroupModalTitle');
        const deleteBtn = document.getElementById('essayGroupModalDelete');
        const nameInput = document.getElementById('essayGroupNameInput');
        const existing = essayGroupModalEditId
            ? d.findEssayGroup(data, essayGroupModalEditId)
            : null;
        if (titleEl) {
            titleEl.textContent = existing
                ? t('classroomEssayGroupModalEditTitle')
                : t('classroomEssayGroupModalCreateTitle');
        }
        if (deleteBtn) {
            deleteBtn.hidden = !existing;
        }
        if (nameInput) {
            nameInput.value = existing ? existing.name : '';
        }
        const sourcePreferred =
            (existing && existing.sourceClassId) ||
            (!isCurrentEssayGroup() ? classId : '') ||
            (getAccessibleClasses()[0] && getAccessibleClasses()[0].id) ||
            '';
        fillEssayGroupSourceClassSelect(sourcePreferred);
        const sourceSelect = document.getElementById('essayGroupSourceClassSelect');
        const sourceId = sourceSelect ? sourceSelect.value : sourcePreferred;
        renderEssayGroupStudentList(sourceId, existing ? existing.studentIds : []);
        setEssayGroupModalError('');
        if (hooks && hooks.openModal) {
            hooks.openModal(modal);
        } else {
            modal.classList.add('active');
            modal.hidden = false;
        }
        if (nameInput) {
            nameInput.focus();
        }
    }

    async function confirmEssayGroupModal() {
        const d = domain();
        const data = getAppData();
        if (!d || !d.upsertEssayGroup) {
            return;
        }
        const name = (document.getElementById('essayGroupNameInput')?.value || '').trim();
        const sourceClassId =
            (document.getElementById('essayGroupSourceClassSelect')?.value || '').trim();
        const studentIds = Array.from(
            document.querySelectorAll('#essayGroupStudentList input[type="checkbox"][data-student-id]:checked')
        ).map((el) => el.getAttribute('data-student-id'));
        if (!name) {
            setEssayGroupModalError(t('classroomEssayGroupNeedName'));
            return;
        }
        if (!studentIds.length) {
            setEssayGroupModalError(t('classroomEssayGroupNeedStudents'));
            return;
        }
        const existing = essayGroupModalEditId
            ? d.findEssayGroup(data, essayGroupModalEditId)
            : null;
        const payload = {
            id: essayGroupModalEditId || undefined,
            name,
            studentIds,
            sourceClassId,
            assignments: existing && Array.isArray(existing.assignments) ? existing.assignments : []
        };
        const authorUserId = hooks && hooks.getCurrentUserId ? hooks.getCurrentUserId() : '';
        const result = d.upsertEssayGroup(data, payload, { authorUserId });
        if (result.error === 'missing_students') {
            setEssayGroupModalError(t('classroomEssayGroupNeedStudents'));
            return;
        }
        if (result.error || !result.group) {
            setEssayGroupModalError(t('classroomEssayGroupSaveFailed'));
            return;
        }
        try {
            if (hooks && hooks.saveClassroom) {
                await hooks.saveClassroom({ essayGroups: data.essayGroups });
            }
        } catch (err) {
            setEssayGroupModalError((err && err.message) || t('classroomEssayGroupSaveFailed'));
            return;
        }
        closeEssayGroupModal();
        classId = result.group.id;
        if (hooks && hooks.setUiPref) {
            hooks.setUiPref('classroomTabClassId', classId);
        }
        applyResolvedAssignment(getClassData());
        selectedStudentIds.clear();
        loadSubmission();
        const panel = panelRef || document.getElementById('panel-essays');
        if (panel) {
            render(panel);
        }
        refreshZoneContextBar();
        if (hooks && hooks.showToast) {
            hooks.showToast(t('classroomEssayGroupSaved'));
        }
    }

    async function deleteEssayGroupFromModal() {
        const d = domain();
        const data = getAppData();
        if (!d || !d.deleteEssayGroup || !essayGroupModalEditId) {
            return;
        }
        if (
            typeof global.confirm === 'function' &&
            !global.confirm(t('classroomEssayGroupDeleteConfirm'))
        ) {
            return;
        }
        const result = d.deleteEssayGroup(data, essayGroupModalEditId);
        if (result.error) {
            setEssayGroupModalError(t('classroomEssayGroupDeleteFailed'));
            return;
        }
        try {
            if (hooks && hooks.saveClassroom) {
                await hooks.saveClassroom({
                    essayGroups: data.essayGroups,
                    essaySubmissions: data.essaySubmissions
                });
            }
        } catch (err) {
            setEssayGroupModalError((err && err.message) || t('classroomEssayGroupDeleteFailed'));
            return;
        }
        const deletedId = essayGroupModalEditId;
        closeEssayGroupModal();
        if (classId === deletedId) {
            const next = getEssayPickerClasses()[0];
            classId = next ? next.id : '';
            if (hooks && hooks.setUiPref) {
                hooks.setUiPref('classroomTabClassId', classId);
            }
        }
        applyResolvedAssignment(getClassData());
        selectedStudentIds.clear();
        loadSubmission();
        const panel = panelRef || document.getElementById('panel-essays');
        if (panel) {
            render(panel);
        }
        refreshZoneContextBar();
        if (hooks && hooks.showToast) {
            hooks.showToast(t('classroomEssayGroupDeleted'));
        }
    }

    function bindEssayGroupModal() {
        const modal = document.getElementById('essayGroupModal');
        if (!modal || modal.dataset.bound === '1') {
            return;
        }
        modal.dataset.bound = '1';
        document.getElementById('essayGroupModalClose')?.addEventListener('click', () => {
            closeEssayGroupModal();
        });
        document.getElementById('essayGroupModalCancel')?.addEventListener('click', () => {
            closeEssayGroupModal();
        });
        document.getElementById('essayGroupModalConfirm')?.addEventListener('click', () => {
            void confirmEssayGroupModal();
        });
        document.getElementById('essayGroupModalDelete')?.addEventListener('click', () => {
            void deleteEssayGroupFromModal();
        });
        document.getElementById('essayGroupSourceClassSelect')?.addEventListener('change', (e) => {
            const selected = Array.from(
                document.querySelectorAll(
                    '#essayGroupStudentList input[type="checkbox"][data-student-id]:checked'
                )
            ).map((el) => el.getAttribute('data-student-id'));
            renderEssayGroupStudentList(e.target.value, selected);
        });
    }

    function syncEssayGroupToolbarButtons(panel) {
        const root = panel || panelRef || document.getElementById('panel-essays');
        if (!root) {
            return;
        }
        const editBtn = root.querySelector('#classroomEssaysEditGroupBtn');
        if (editBtn) {
            editBtn.hidden = !isCurrentEssayGroup();
        }
        const tmsThis = root.querySelector('#classroomEssaysTmsSyncBtn');
        if (tmsThis) {
            tmsThis.disabled = isCurrentEssayGroup();
        }
        const scrapeBtn = root.querySelector('#classroomEssaysScrapeEditorBtn');
        if (scrapeBtn) {
            scrapeBtn.disabled = isCurrentEssayGroup();
        }
    }

    function bindEssayGroupToolbar(panel) {
        const root = panel || document.getElementById('panel-essays');
        if (!root || root.dataset.essayGroupToolbarBound === '1') {
            return;
        }
        root.dataset.essayGroupToolbarBound = '1';
        root.querySelector('#classroomEssaysNewGroupBtn')?.addEventListener('click', () => {
            openEssayGroupModal('');
        });
        root.querySelector('#classroomEssaysEditGroupBtn')?.addEventListener('click', () => {
            if (isCurrentEssayGroup()) {
                openEssayGroupModal(classId);
            }
        });
    }

    function statusFilterSegments() {
        return [
            { filter: 'not_submitted', labelKey: 'classroomEssayStatusNotSubmitted', cls: 'essay-status--not' },
            { filter: 'submitted', labelKey: 'classroomEssayStatusReceived', cls: 'essay-status--submitted' },
            { filter: 'complete', labelKey: 'classroomEssayStatusComplete', cls: 'essay-status--complete' },
            { filter: 'resubmit_required', labelKey: 'classroomEssayStatusResubmit', cls: 'essay-status--resubmit' },
            { filter: 'demerit', labelKey: 'classroomEssayStatusDemerit', cls: 'essay-status--demerit' },
            { filter: 'incomplete', labelKey: 'classroomEssayStatusIncomplete', cls: 'essay-status--incomplete' },
            { filter: 'exempt', labelKey: 'classroomEssayStatusExempt', cls: 'essay-status--exempt' }
        ];
    }

    function isTypingInEssayNote(panel) {
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        return Boolean(
            active
            && panel
            && panel.contains(active)
            && (active.classList.contains('classroom-essay-note')
                || active.classList.contains('classroom-essay-feedback'))
        );
    }

    function blurActiveEssayNote(panel) {
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        if (
            active
            && panel
            && panel.contains(active)
            && (active.classList.contains('classroom-essay-note')
                || active.classList.contains('classroom-essay-feedback'))
            && typeof active.blur === 'function'
        ) {
            active.blur();
        }
    }

    async function flushBeforeLeave() {
        const panel = panelRef || document.getElementById('panel-essays');
        blurActiveEssayNote(panel);
        flushNoteSave();
        ensureAutosave(panel);
        if (autosave) {
            await autosave.flushBeforeLeave();
        }
    }

    function essayStatsSegmentFlex(counts) {
        const keys = [
            'not_submitted',
            'submitted',
            'complete',
            'resubmit_required',
            'demerit',
            'incomplete',
            'exempt'
        ];
        const total = keys.reduce((sum, key) => sum + (counts[key] || 0), 0);
        if (total === 0) {
            return keys.map((key) => ({ key, flex: 1, count: 0 }));
        }
        return keys.map((key) => ({
            key,
            flex: counts[key] || 0,
            count: counts[key] || 0
        }));
    }

    function clearEssayFilter(panel) {
        currentFilter = 'all';
        renderStatsBar(panel);
        renderToolbarHint(panel);
        renderRows(panel);
        renderFooterHint(panel);
    }

    function renderStatsBar(panel) {
        const mount = panel.querySelector('#classroomEssaysStatsBar');
        if (!mount) {
            return;
        }
        if (!draftSubmission) {
            mount.innerHTML = '';
            mount.hidden = true;
            return;
        }
        mount.hidden = false;
        const d = domain();
        const activeStudentIds = getStudents()
            .map((entry) => entry && entry.student && entry.student.id)
            .filter(Boolean);
        const counts = d.countEssayByStatus(draftSubmission, activeStudentIds);
        const attention = getAttentionCounts();
        const progressKeys = [
            'complete',
            'submitted',
            'resubmit_required',
            'demerit',
            'not_submitted',
            'incomplete',
            'exempt'
        ];
        const progressTotal = progressKeys.reduce((sum, key) => sum + (counts[key] || 0), 0);
        const trackHtml = progressKeys
            .map((key) => {
                const meta = statusFilterSegments().find((s) => s.filter === key);
                const cls = meta ? meta.cls : '';
                const count = counts[key] || 0;
                const widthPct = progressTotal > 0 ? (count / progressTotal) * 100 : 100 / progressKeys.length;
                const flex = count > 0 ? count : 0.001;
                return `<span class="classroom-essay-stats-segment ${cls}" style="flex: ${flex} 1 0; width: ${widthPct.toFixed(2)}%;" aria-hidden="true"></span>`;
            })
            .join('');
        const complete = counts.complete || 0;
        const rosterTotal = getStudents().length;
        const total =
            d.essayProgressDenominator
                ? d.essayProgressDenominator(counts, rosterTotal)
                : Math.max(0, rosterTotal - (counts.exempt || 0));

        const tile = (filter, count, titleKey, subtitleKey, modifier) => {
            const active = currentFilter === filter ? ' is-active' : '';
            return `<button type="button" class="classroom-essay-attention-tile classroom-essay-attention-tile--${modifier}${active}" data-filter="${escapeAttr(filter)}" aria-pressed="${currentFilter === filter ? 'true' : 'false'}">
                <span class="classroom-essay-attention-tile__count">${count}</span>
                <span class="classroom-essay-attention-tile__text">
                    <span class="classroom-essay-attention-tile__title">${escapeHtml(t(titleKey))}</span>
                    <span class="classroom-essay-attention-tile__subtitle section-hint">${escapeHtml(t(subtitleKey))}</span>
                </span>
            </button>`;
        };

        // Keep warning tiles visible even when counts are zero so filters stay discoverable.
        const tilesHtml = `<div class="classroom-essay-attention-tiles">
                ${tile('awaiting_sub', attention.awaitingSub, 'classroomEssayAttentionAwaitingSub', 'classroomEssayAttentionAwaitingSubHint', 'awaiting')}
                ${tile('overdue_sub', attention.overdueSub, 'classroomEssayAttentionOverdueSub', 'classroomEssayAttentionOverdueSubHint', 'overdue')}
                ${tile('eval_overdue', attention.evalOverdue, 'classroomEssayAttentionEvalOverdue', 'classroomEssayAttentionEvalOverdueHint', 'eval')}
                ${tile('resubmit_required', attention.resubmit, 'classroomEssayAttentionResubmits', 'classroomEssayAttentionResubmitsHint', 'resubmit')}
                ${tile('debate_video_missing', attention.debateVideo || 0, 'classroomEssayAttentionDebateVideo', 'classroomEssayAttentionDebateVideoHint', 'nv')}
            </div>`;

        mount.innerHTML = `
            <div class="classroom-essay-attention-strip-inner">
                <span class="classroom-essay-attention-label">${escapeHtml(t('classroomEssayAttentionLabel'))}</span>
                ${tilesHtml}
                <div class="classroom-essay-attention-progress">
                    <div class="classroom-essay-stats-track" aria-hidden="true">${trackHtml}</div>
                    <div class="classroom-essay-attention-progress-label section-hint">${escapeHtml(tf('classroomEssayProgressSummary', { complete, total }))}</div>
                </div>
            </div>`;

        mount.querySelectorAll('[data-filter]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter') || 'all';
                currentFilter = currentFilter === filter ? 'all' : filter;
                renderStatsBar(panel);
                renderToolbarHint(panel);
                renderRows(panel);
                renderFooterHint(panel);
            });
        });
    }

    function renderToolbarHint(panel) {
        const mount = panel.querySelector('#classroomEssaysToolbarHint');
        if (!mount) {
            return;
        }
        if (selectedStudentIds.size > 0) {
            mount.textContent = '';
            mount.hidden = true;
            return;
        }
        mount.hidden = false;
        if (currentFilter === 'all') {
            mount.textContent = t('classroomEssayToolbarAllStudents');
            return;
        }
        const labels = {
            awaiting_sub: t('classroomEssayAttentionAwaitingSub'),
            overdue_sub: t('classroomEssayAttentionOverdueSub'),
            eval_overdue: t('classroomEssayAttentionEvalOverdue'),
            resubmit_required: t('classroomEssayAttentionResubmits'),
            debate_video_missing: t('classroomEssayAttentionDebateVideo'),
            not_submitted: t('classroomEssayStatusNotSubmitted'),
            submitted: t('classroomEssayStatusReceived'),
            complete: t('classroomEssayStatusComplete'),
            demerit: t('classroomEssayStatusDemerit'),
            incomplete: t('classroomEssayStatusIncomplete'),
            exempt: t('classroomEssayStatusExempt')
        };
        mount.textContent = tf('classroomEssayToolbarFilterActive', {
            label: labels[currentFilter] || currentFilter
        });
    }

    function renderFooterHint(panel) {
        const mount = panel.querySelector('#classroomEssaysFooterHint');
        if (!mount) {
            return;
        }
        const students = getStudents();
        const filtered = students.filter((entry) => studentMatchesFilter(entry.student.id));
        const summary = tf('classroomEssayFilterFooterShort', {
            shown: String(filtered.length),
            total: String(students.length)
        });
        if (currentFilter !== 'all') {
            mount.innerHTML = `${escapeHtml(summary)} <button type="button" class="classroom-essay-clear-filter" data-action="clear-essay-filter">${escapeHtml(t('classroomEssayClearFilter'))}</button>`;
            mount.querySelector('[data-action="clear-essay-filter"]')?.addEventListener('click', () => {
                clearEssayFilter(panel);
            });
            return;
        }
        mount.textContent = summary;
    }

    function applyStagedBatchToRecord(rec, action, status, setRetest) {
        if (action === 'status' && status) {
            const next = Object.assign({}, rec, { status });
            if (status !== 'resubmit_required') {
                next.submittedRetest = false;
            } else if (setRetest != null) {
                next.submittedRetest = !!setRetest;
            }
            if (status !== 'demerit' || rec.status !== 'demerit') {
                next.retestAssigned = false;
                next.retestPassed = false;
            }
            return next;
        }
        if (action === 'submission') {
            if (status === 'submitted') {
                return Object.assign({}, rec, { status: 'submitted' });
            }
            if (status === 'not_submitted') {
                return Object.assign({}, rec, {
                    status: 'not_submitted',
                    submittedRetest: false,
                    retestAssigned: false,
                    retestPassed: false
                });
            }
            return rec;
        }
        if (action === 'evaluation') {
            if (!isReceivedStatus(rec.status)) {
                return rec;
            }
            const next = Object.assign({}, rec, { status });
            if (status !== 'resubmit_required') {
                next.submittedRetest = false;
            } else if (setRetest != null) {
                next.submittedRetest = !!setRetest;
            }
            if (status !== 'demerit' || rec.status !== 'demerit') {
                next.retestAssigned = false;
                next.retestPassed = false;
            }
            return next;
        }
        return rec;
    }

    function recordPatchFromBatch(prev, next) {
        const patch = {};
        if (next.status !== prev.status) {
            patch.status = next.status;
        }
        if (next.submittedRetest !== prev.submittedRetest) {
            patch.submittedRetest = next.submittedRetest;
        }
        if (!!next.retestAssigned !== !!prev.retestAssigned) {
            patch.retestAssigned = !!next.retestAssigned;
        }
        if (!!next.retestPassed !== !!prev.retestPassed) {
            patch.retestPassed = !!next.retestPassed;
        }
        if (!!next.submissionLate !== !!prev.submissionLate) {
            patch.submissionLate = !!next.submissionLate;
        }
        if (!!next.overdueDismissed !== !!prev.overdueDismissed) {
            patch.overdueDismissed = !!next.overdueDismissed;
        }
        return patch;
    }

    async function applyBatchStatus(panel, targetStatus) {
        const editable = access() && access().canEditClass(getClassData());
        if (!editable || !draftSubmission || !selectedStudentIds.size || !targetStatus) {
            return;
        }
        const selected = Array.from(selectedStudentIds);
        const needsPrompt = selected.some((sid) => {
            const rec = getRecord(sid);
            const prevStatus = rec ? rec.status : 'not_submitted';
            return shouldPromptReceiveTiming(prevStatus, targetStatus);
        });
        let timing = 'on_time';
        if (needsPrompt) {
            const choice = await promptReceiveTiming();
            if (choice == null) {
                return;
            }
            timing = choice;
        }
        selected.forEach((sid) => {
            const rec = getRecord(sid);
            const prevStatus = rec ? rec.status : 'not_submitted';
            const patch = buildStatusPatch(prevStatus, targetStatus, timing);
            const result = setRecord(sid, patch);
            if (recordAffectsResubmitDayNote(result.prev, result.next)) {
                markResubmitDayNoteDirty();
            }
        });
        selectedStudentIds.clear();
        renderHeader(panel);
        renderContextBar(panel);
        renderStatsBar(panel);
        renderFilters(panel);
        renderToolbarHint(panel);
        renderRows(panel);
        refreshZoneContextBar();
        scheduleSave();
    }

    async function applyBatchActions(panel, submissionStatus, evaluationStatus, setRetest) {
        const editable = access() && access().canEditClass(getClassData());
        if (!editable || !draftSubmission || !selectedStudentIds.size) {
            return;
        }
        const hasSubmission = submissionStatus && submissionStatus !== 'no_change';
        const hasEvaluation = evaluationStatus && evaluationStatus !== 'no_change';
        if (!hasSubmission && !hasEvaluation) {
            return;
        }
        const selected = Array.from(selectedStudentIds);
        let timing = 'on_time';
        if (hasSubmission && submissionStatus === 'submitted') {
            const needsPrompt = selected.some((sid) => {
                const rec = getRecord(sid);
                const prevStatus = rec ? rec.status : 'not_submitted';
                return shouldPromptReceiveTiming(prevStatus, 'submitted');
            });
            if (needsPrompt) {
                const choice = await promptReceiveTiming();
                if (choice == null) {
                    return;
                }
                timing = choice;
            }
        }
        let skippedEvaluation = 0;
        selected.forEach((sid) => {
            const rec = getRecord(sid);
            if (!rec) {
                return;
            }
            let next = Object.assign({}, rec);
            if (hasSubmission) {
                if (submissionStatus === 'submitted' || submissionStatus === 'not_submitted') {
                    const prevStatus = next.status;
                    const patch = buildStatusPatch(prevStatus, submissionStatus, timing);
                    next = Object.assign({}, next, patch);
                } else {
                    next = applyStagedBatchToRecord(next, 'submission', submissionStatus, null);
                }
            }
            if (hasEvaluation) {
                const beforeEval = next;
                next = applyStagedBatchToRecord(next, 'evaluation', evaluationStatus, setRetest);
                if (next === beforeEval && !isReceivedStatus(beforeEval.status)) {
                    skippedEvaluation += 1;
                }
            }
            const patch = recordPatchFromBatch(rec, next);
            if (!Object.keys(patch).length) {
                return;
            }
            const result = setRecord(sid, patch);
            if (recordAffectsResubmitDayNote(result.prev, result.next)) {
                markResubmitDayNoteDirty();
            }
        });
        if (skippedEvaluation > 0 && hooks && hooks.showToast) {
            hooks.showToast(tf('classroomEssayBatchSkippedNotice', { count: skippedEvaluation }));
        }
        renderHeader(panel);
        renderContextBar(panel);
        renderStatsBar(panel);
        renderFilters(panel);
        renderToolbarHint(panel);
        renderRows(panel);
        refreshZoneContextBar();
        scheduleSave();
    }

    function renderReportsMenu(panel) {
        const mount = panel.querySelector('#classroomEssaysReportsWrap');
        if (!mount) {
            return;
        }
        const openCls = reportsMenuOpen ? ' is-open' : '';
        const menuHidden = reportsMenuOpen ? '' : ' hidden';
        const reportsIcon = `<svg class="classroom-essay-reports-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`;
        mount.innerHTML = `
            <div class="classroom-essay-reports-menu${openCls}">
                <button type="button" id="classroomEssaysReportsBtn" class="btn btn-outline btn-compact classroom-essay-reports-btn" aria-expanded="${reportsMenuOpen ? 'true' : 'false'}" aria-haspopup="menu">
                    ${reportsIcon}${escapeHtml(t('classroomEssayReportsBtn'))} ▾
                </button>
                <div id="classroomEssaysReportsDropdown" class="classroom-essay-reports-dropdown"${menuHidden} role="menu">
                    <button type="button" class="classroom-essay-reports-item" data-report-action="class-summary" role="menuitem">${escapeHtml(t('classroomEssayClassSummaryBtn'))}</button>
                    <button type="button" class="classroom-essay-reports-item" data-report-action="progress" role="menuitem">${escapeHtml(t('classroomEssayProgressReportBtn'))}</button>
                    <button type="button" class="classroom-essay-reports-item" data-report-action="resubmit-summary" role="menuitem">${escapeHtml(t('classroomEssayResubmitSummaryBtn'))}</button>
                    <button type="button" class="classroom-essay-reports-item" data-report-action="overdue-print" role="menuitem">${escapeHtml(t('classroomEssayOverduePrintBtn'))}</button>
                    <button type="button" class="classroom-essay-reports-item" data-report-action="overdue-copy" role="menuitem">${escapeHtml(t('classroomEssayOverdueCopyBtn'))}</button>
                    <button type="button" class="classroom-essay-reports-item" data-report-action="resubmit-print" role="menuitem">${escapeHtml(t('classroomEssayResubmitPrintBtn'))}</button>
                    <button type="button" class="classroom-essay-reports-item" data-report-action="resubmit-copy" role="menuitem">${escapeHtml(t('classroomEssayResubmitCopyBtn'))}</button>
                    <button type="button" class="classroom-essay-reports-item" data-report-action="rescan" role="menuitem">${escapeHtml(t('classroomEssayRescanBtn'))}</button>
                </div>
            </div>`;

        mount.querySelector('#classroomEssaysReportsBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            reportsMenuOpen = !reportsMenuOpen;
            renderReportsMenu(panel);
        });

        mount.querySelector('[data-report-action="class-summary"]')?.addEventListener('click', () => {
            closeReportsMenu();
            renderReportsMenu(panel);
            openClassSummaryModal();
        });
        mount.querySelector('[data-report-action="progress"]')?.addEventListener('click', () => {
            closeReportsMenu();
            renderReportsMenu(panel);
            openProgressReportModal();
        });
        mount.querySelector('[data-report-action="resubmit-summary"]')?.addEventListener('click', () => {
            closeReportsMenu();
            renderReportsMenu(panel);
            openResubmitSummaryModal();
        });
        mount.querySelector('[data-report-action="overdue-print"]')?.addEventListener('click', () => {
            closeReportsMenu();
            renderReportsMenu(panel);
            printCurrentClassOverdues();
        });
        mount.querySelector('[data-report-action="overdue-copy"]')?.addEventListener('click', () => {
            closeReportsMenu();
            renderReportsMenu(panel);
            copyCurrentClassOverdues();
        });
        mount.querySelector('[data-report-action="resubmit-print"]')?.addEventListener('click', () => {
            closeReportsMenu();
            renderReportsMenu(panel);
            printCurrentClassResubmits();
        });
        mount.querySelector('[data-report-action="resubmit-copy"]')?.addEventListener('click', () => {
            closeReportsMenu();
            renderReportsMenu(panel);
            copyCurrentClassResubmits();
        });
        mount.querySelector('[data-report-action="rescan"]')?.addEventListener('click', () => {
            closeReportsMenu();
            renderReportsMenu(panel);
            void rescanEssayAssignments(panel);
        });
    }

    function renderFilters(panel) {
        const mount = panel.querySelector('#classroomEssaysBatchActions');
        if (!mount) {
            return;
        }
        renderReportsMenu(panel);
        if (!draftSubmission || !selectedStudentIds.size) {
            mount.innerHTML = '';
            mount.hidden = true;
            renderToolbarHint(panel);
            return;
        }
        mount.hidden = false;
        const editable = access() && access().canEditClass(getClassData());
        const disabled = editable ? '' : ' disabled';
        const d = domain();
        const savedSubject = d && d.savedEssaySubject ? d.savedEssaySubject(currentEssayRow()) : '';
        const retconDisabled = editable && savedSubject ? '' : ' disabled';
        const retconTitle = savedSubject
            ? ''
            : ` title="${escapeAttr(t('classroomEssayRetconNeedSubject'))}"`;
        const batchBtn = (status, labelKey, cls) =>
            `<button type="button" class="btn btn-small classroom-essay-batch-status-btn ${cls}" data-batch-status="${escapeAttr(status)}"${disabled}>${escapeHtml(t(labelKey))}</button>`;

        mount.innerHTML = `
            <div class="classroom-essay-batch-row classroom-batch-row">
                <span class="classroom-essay-batch-label">${escapeHtml(tf('classroomEssayBatchSelected', { count: selectedStudentIds.size }))}</span>
                ${batchBtn('not_submitted', 'classroomEssayStatusNotSubmitted', 'essay-status--not')}
                ${batchBtn('submitted', 'classroomEssayStatusReceived', 'essay-status--submitted')}
                ${batchBtn('complete', 'classroomEssayStatusComplete', 'essay-status--complete')}
                ${batchBtn('resubmit_required', 'classroomEssayStatusResubmit', 'essay-status--resubmit')}
                ${batchBtn('demerit', 'classroomEssayStatusDemerit', 'essay-status--demerit')}
                ${batchBtn('incomplete', 'classroomEssayStatusIncomplete', 'essay-status--incomplete')}
                ${batchBtn('exempt', 'classroomEssayStatusExempt', 'essay-status--exempt')}
                <button type="button" id="classroomEssaysRetconBtn" class="btn btn-outline btn-compact btn-small"${retconDisabled}${retconTitle}>${escapeHtml(t('classroomEssayRetconBtn'))}</button>
                <button type="button" id="classroomEssaysBatchClearBtn" class="btn btn-outline btn-compact btn-small"${disabled}>${escapeHtml(t('classroomEssayBatchClear'))}</button>
            </div>`;

        mount.querySelectorAll('[data-batch-status]').forEach((btn) => {
            btn.addEventListener('click', () => {
                void applyBatchStatus(panel, btn.getAttribute('data-batch-status'));
            });
        });
        mount.querySelector('#classroomEssaysBatchClearBtn')?.addEventListener('click', () => {
            selectedStudentIds.clear();
            renderFilters(panel);
            renderRows(panel);
        });
        mount.querySelector('#classroomEssaysRetconBtn')?.addEventListener('click', () => {
            void retconCheckedCompletions(panel);
        });
        renderToolbarHint(panel);
    }

    function renderHeader(panel) {
        const headerMount = panel.querySelector('#classroomEssaysHeader');
        if (!headerMount) {
            return;
        }
        // Essays uses its own context + stats bars; the shared classroom header renders
        // an empty collapsible shell in essays mode, so keep it removed.
        headerMount.innerHTML = '';
        headerMount.hidden = true;
    }

    function statusOptions() {
        return [
            { status: 'not_submitted', label: t('classroomEssayStatusNotSubmitted'), cls: 'essay-status--not' },
            { status: 'submitted', label: t('classroomEssayStatusReceived'), cls: 'essay-status--submitted' },
            { status: 'complete', label: t('classroomEssayStatusComplete'), cls: 'essay-status--complete' },
            { status: 'resubmit_required', label: t('classroomEssayStatusResubmit'), cls: 'essay-status--resubmit' },
            { status: 'demerit', label: t('classroomEssayStatusDemerit'), cls: 'essay-status--demerit' },
            { status: 'incomplete', label: t('classroomEssayStatusIncomplete'), cls: 'essay-status--incomplete' },
            { status: 'exempt', label: t('classroomEssayStatusExempt'), cls: 'essay-status--exempt' }
        ];
    }

    function essayRowRailCls(status) {
        const map = {
            not_submitted: 'classroom-sheet-row--status-essay-not',
            submitted: 'classroom-sheet-row--status-essay-received',
            complete: 'classroom-sheet-row--status-essay-complete',
            resubmit_required: 'classroom-sheet-row--status-essay-resubmit',
            demerit: 'classroom-sheet-row--status-essay-demerit',
            incomplete: 'classroom-sheet-row--status-essay-incomplete',
            exempt: 'classroom-sheet-row--status-essay-exempt'
        };
        const modifier = map[status] || map.not_submitted;
        return `classroom-sheet-row--status-rail ${modifier}`;
    }

    function buildStageButton(studentId, statusKey, curStatus, editable) {
        const meta = ESSAY_STATUS_META[statusKey];
        const curMeta = ESSAY_STATUS_META[curStatus] || ESSAY_STATUS_META.not_submitted;
        const disabled = editable ? '' : ' disabled';
        let stateMod = '--available';
        if (statusKey === curStatus) {
            stateMod = '--active';
        } else if (
            !isEssayOutcomeStatus(curStatus) &&
            (statusKey === 'not_submitted' || statusKey === 'submitted') &&
            meta &&
            meta.order < curMeta.order
        ) {
            stateMod = '--done';
        }
        const labelKey = essayStatusLabelKey(statusKey);
        const pressed = statusKey === curStatus ? 'true' : 'false';
        return `<button type="button" class="btn btn-outline btn-small selection-chip classroom-status-chip classroom-essay-stage ${meta.cls} classroom-essay-stage${stateMod}" data-student-id="${escapeAttr(studentId)}" data-status="${escapeAttr(statusKey)}" aria-pressed="${pressed}"${disabled}>${escapeHtml(t(labelKey))}</button>`;
    }

    function buildStatusCell(studentId, editable) {
        const rec = getRecord(studentId);
        const status = rec ? rec.status : 'not_submitted';
        const retestHtml =
            status === 'resubmit_required'
                ? `<label class="classroom-essay-retest-toggle">
                    <input type="checkbox" class="classroom-essay-retest" data-student-id="${escapeAttr(studentId)}" ${rec && rec.submittedRetest ? 'checked' : ''}${editable ? '' : ' disabled'} />
                    <span class="classroom-essay-retest-toggle__box" aria-hidden="true"><svg class="classroom-essay-retest-toggle__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg></span>
                    <span>${escapeHtml(t('classroomEssayResubmissionReceived'))}</span>
                </label>`
                : '';
        const assignedChecked = !!(rec && rec.retestAssigned);
        const passedDisabled = editable && assignedChecked ? '' : ' disabled';
        const demeritHtml =
            status === 'demerit'
                ? `<label class="classroom-essay-retest-toggle classroom-essay-demerit-toggle">
                    <input type="checkbox" class="classroom-essay-retest-assigned" data-student-id="${escapeAttr(studentId)}" ${assignedChecked ? 'checked' : ''}${editable ? '' : ' disabled'} />
                    <span class="classroom-essay-retest-toggle__box" aria-hidden="true"><svg class="classroom-essay-retest-toggle__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg></span>
                    <span>${escapeHtml(t('classroomEssayRetestAssigned'))}</span>
                </label>
                <label class="classroom-essay-retest-toggle classroom-essay-demerit-toggle">
                    <input type="checkbox" class="classroom-essay-retest-passed" data-student-id="${escapeAttr(studentId)}" ${rec && rec.retestPassed ? 'checked' : ''}${passedDisabled} />
                    <span class="classroom-essay-retest-toggle__box" aria-hidden="true"><svg class="classroom-essay-retest-toggle__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg></span>
                    <span>${escapeHtml(t('classroomEssayRetestPassed'))}</span>
                </label>`
                : '';
        const debateVideoHtml = `<label class="classroom-essay-retest-toggle classroom-essay-debate-video-toggle">
                    <input type="checkbox" class="classroom-essay-debate-video" data-student-id="${escapeAttr(studentId)}" ${rec && rec.debateVideoMissing ? 'checked' : ''}${editable ? '' : ' disabled'} />
                    <span class="classroom-essay-retest-toggle__box" aria-hidden="true"><svg class="classroom-essay-retest-toggle__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg></span>
                    <span>${escapeHtml(t('classroomEssayDebateVideoMissing'))}</span>
                </label>`;
        return `<div class="classroom-essay-status-selector">
            <div class="classroom-essay-status-selector__row" role="group" aria-label="${escapeAttr(t('classroomEssayColStatus'))}">
                <div class="classroom-essay-status-selector__group">
                    ${buildStageButton(studentId, 'not_submitted', status, editable)}
                    ${buildStageButton(studentId, 'submitted', status, editable)}
                </div>
                <span class="classroom-essay-status-selector__arrow" aria-hidden="true">→</span>
                <div class="classroom-essay-status-selector__group">
                    ${buildStageButton(studentId, 'complete', status, editable)}
                    ${buildStageButton(studentId, 'resubmit_required', status, editable)}
                    ${buildStageButton(studentId, 'demerit', status, editable)}
                </div>
            </div>
            <div class="classroom-essay-status-selector__row classroom-essay-status-selector__row--outcomes" role="group" aria-label="${escapeAttr(t('classroomEssayOutcomesLabel'))}">
                <div class="classroom-essay-status-selector__group">
                    ${buildStageButton(studentId, 'incomplete', status, editable)}
                    ${buildStageButton(studentId, 'exempt', status, editable)}
                </div>
            </div>
            ${retestHtml}
            ${demeritHtml}
            ${debateVideoHtml}
        </div>`;
    }

    function buildDueCell(studentId) {
        const d = domain();
        const rec = getRecord(studentId);
        const status = rec ? rec.status : 'not_submitted';
        const ssDue = draftSubmission ? draftSubmission.ssDueDate || '' : '';
        const teDue = draftSubmission ? draftSubmission.teacherEvalDueDate || '' : '';
        const editable = access() && access().canEditClass(getClassData());
        if (!d) {
            return '';
        }
        const clearBtn = editable
            ? `<button type="button" class="classroom-essay-due-action btn btn-small btn-outline" data-essay-due-action="clear-overdue" data-student-id="${escapeAttr(studentId)}" title="${escapeAttr(t('classroomEssayClearOverdue'))}">${escapeHtml(t('classroomEssayClearOverdue'))}</button>`
            : '';
        const markLateBtn = editable
            ? `<button type="button" class="classroom-essay-due-action btn btn-small btn-outline" data-essay-due-action="mark-late" data-student-id="${escapeAttr(studentId)}" title="${escapeAttr(t('classroomEssayMarkLate'))}">${escapeHtml(t('classroomEssayMarkLate'))}</button>`
            : '';
        const restoreOverdueBtn = editable
            ? `<button type="button" class="classroom-essay-due-action btn btn-small btn-outline" data-essay-due-action="restore-overdue" data-student-id="${escapeAttr(studentId)}" title="${escapeAttr(t('classroomEssayRestoreOverdue'))}">${escapeHtml(t('classroomEssayRestoreOverdue'))}</button>`
            : '';
        let main = '';
        if (status === 'incomplete') {
            main = `<span class="classroom-essay-due-pill classroom-essay-due-pill--incomplete">${escapeHtml(t('classroomEssayStatusIncomplete'))}</span>`;
        } else if (status === 'exempt') {
            main = `<span class="classroom-essay-due-pill classroom-essay-due-pill--exempt">${escapeHtml(t('classroomEssayStatusExempt'))}</span>`;
        } else {
            const recordForOverdue = rec || {
                status: 'not_submitted',
                submissionLate: false,
                overdueDismissed: false
            };
            if (d.isEssayReceivedLate(recordForOverdue)) {
                main = `<div class="classroom-essay-due-cell">
                <span class="classroom-essay-due-pill classroom-essay-due-pill--danger classroom-essay-due-pill--received-late">${escapeHtml(t('classroomEssayDueReceivedLate'))}</span>
                ${clearBtn}
            </div>`;
            } else if (status === 'not_submitted') {
                if (rec && rec.overdueDismissed && d.isEssaySsOverdueISO(ssDue)) {
                    main = `<div class="classroom-essay-due-cell">
                    <span class="classroom-essay-due-pill classroom-essay-due-pill--muted">${escapeHtml(t('classroomEssayDueCleared'))}</span>
                    ${restoreOverdueBtn}
                </div>`;
                } else if (d.isEssaySubmissionOverdue(recordForOverdue, ssDue)) {
                    const days = d.daysUntilISO(ssDue);
                    const n = days == null ? 0 : Math.abs(days);
                    main = `<div class="classroom-essay-due-cell">
                    <span class="classroom-essay-due-pill classroom-essay-due-pill--danger">${escapeHtml(tf('classroomEssayDueOverdueDays', { days: n }))}</span>
                    ${clearBtn}
                </div>`;
                } else if (d.isEssayAwaitingSubmission && d.isEssayAwaitingSubmission(recordForOverdue, ssDue)) {
                    main = `<span class="classroom-essay-due-pill classroom-essay-due-pill--awaiting-sub">${escapeHtml(t('classroomEssayDueAwaitingSubmission'))}</span>`;
                } else {
                    main = `<span class="classroom-essay-due-pill classroom-essay-due-pill--muted">${escapeHtml(t('classroomEssayDueNotInYet'))}</span>`;
                }
            } else if (isReceivedStatus(status) && !recordForOverdue.submissionLate) {
                const canMarkLate = editable && (d.isEssaySsOverdueISO(ssDue) || recordForOverdue.overdueDismissed);
                const markLate = canMarkLate ? markLateBtn : '';
                if (status === 'submitted') {
                    if (d.isEssaySsOverdueISO(teDue)) {
                        const days = d.daysUntilISO(teDue);
                        const n = days == null ? 0 : Math.abs(days);
                        main = `<div class="classroom-essay-due-cell">
                        <span class="classroom-essay-due-pill classroom-essay-due-pill--danger">${escapeHtml(tf('classroomEssayDueEvalLateDays', { days: n }))}</span>
                        ${markLate}
                    </div>`;
                    } else {
                        main = `<div class="classroom-essay-due-cell">
                    <span class="classroom-essay-due-pill classroom-essay-due-pill--submitted">${escapeHtml(t('classroomEssayDueAwaitingEval'))}</span>
                    ${markLate}
                </div>`;
                    }
                } else if (status === 'complete') {
                    main = `<div class="classroom-essay-due-cell">
                    <span class="classroom-essay-due-pill classroom-essay-due-pill--complete">${escapeHtml(t('classroomEssayStatusComplete'))}</span>
                    ${markLate}
                </div>`;
                } else if (status === 'resubmit_required') {
                    main = `<div class="classroom-essay-due-cell">
                    <span class="classroom-essay-due-pill classroom-essay-due-pill--resubmit">${escapeHtml(t('classroomEssayStatusResubmit'))}</span>
                    ${markLate}
                </div>`;
                } else if (status === 'demerit') {
                    main = `<div class="classroom-essay-due-cell">
                    <span class="classroom-essay-due-pill classroom-essay-due-pill--demerit">${escapeHtml(t('classroomEssayStatusDemerit'))}</span>
                    ${markLate}
                </div>`;
                }
            } else if (status === 'submitted') {
                if (d.isEssaySsOverdueISO(teDue)) {
                    const days = d.daysUntilISO(teDue);
                    const n = days == null ? 0 : Math.abs(days);
                    main = `<span class="classroom-essay-due-pill classroom-essay-due-pill--danger">${escapeHtml(tf('classroomEssayDueEvalLateDays', { days: n }))}</span>`;
                } else {
                    main = `<span class="classroom-essay-due-pill classroom-essay-due-pill--submitted">${escapeHtml(t('classroomEssayDueAwaitingEval'))}</span>`;
                }
            } else if (status === 'complete') {
                main = `<span class="classroom-essay-due-pill classroom-essay-due-pill--complete">${escapeHtml(t('classroomEssayStatusComplete'))}</span>`;
            } else if (status === 'resubmit_required') {
                main = `<span class="classroom-essay-due-pill classroom-essay-due-pill--resubmit">${escapeHtml(t('classroomEssayStatusResubmit'))}</span>`;
            } else if (status === 'demerit') {
                main = `<span class="classroom-essay-due-pill classroom-essay-due-pill--demerit">${escapeHtml(t('classroomEssayStatusDemerit'))}</span>`;
            }
        }
        return main;
    }

    function afterEssayStatusChange(panel, studentId) {
        renderStatsBar(panel);
        renderContextBar(panel);
        if (!studentMatchesFilter(studentId)) {
            renderRows(panel);
        } else {
            updateEssayRow(panel, studentId);
        }
        refreshZoneContextBar();
        pingEssayStatus(studentId);
        scheduleStatusSave();
    }

    function pingEssayStatus(studentId) {
        if (!draftSubmission || !studentId) {
            return;
        }
        const rec = getRecord(studentId);
        if (!rec) {
            return;
        }
        try {
            localStorage.setItem(ESSAY_STATUS_PING_KEY, JSON.stringify({
                classId: draftSubmission.classId,
                syllabusRowId: draftSubmission.syllabusRowId,
                studentId,
                status: rec.status,
                retestAssigned: rec.retestAssigned,
                retestPassed: rec.retestPassed,
                submittedRetest: rec.submittedRetest,
                submissionLate: rec.submissionLate,
                overdueDismissed: rec.overdueDismissed,
                at: Date.now()
            }));
        } catch (_) {
            /* ignore */
        }
    }

    function bindDueCellActions(panel, row) {
        row.querySelectorAll('[data-essay-due-action]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const sid = btn.getAttribute('data-student-id');
                const action = btn.getAttribute('data-essay-due-action');
                if (!sid || !action) {
                    return;
                }
                if (action === 'clear-overdue') {
                    clearEssayOverdue(panel, sid);
                    return;
                }
                if (action === 'mark-late') {
                    markEssaySubmissionLate(panel, sid);
                    return;
                }
                if (action === 'restore-overdue') {
                    restoreEssayOverdue(panel, sid);
                }
            });
        });
    }

    function bindEssayRowHandlers(panel, row, studentId) {
        const sid = studentId || row.getAttribute('data-student-id');
        if (!sid || !row) {
            return;
        }

        row.querySelectorAll('.classroom-essay-stage').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.disabled) {
                    return;
                }
                const status = btn.getAttribute('data-status');
                if (!status) {
                    return;
                }
                void applyStatusChange(panel, sid, status);
            });
        });
        bindDueCellActions(panel, row);
        row.querySelector('.classroom-essay-retest')?.addEventListener('change', (event) => {
            setRecord(sid, { submittedRetest: event.currentTarget.checked });
            scheduleStatusSave();
        });
        row.querySelector('.classroom-essay-retest-assigned')?.addEventListener('change', (event) => {
            const checked = event.currentTarget.checked;
            const patch = { retestAssigned: checked };
            if (!checked) {
                patch.retestPassed = false;
            }
            setRecord(sid, patch);
            afterEssayStatusChange(panel, sid);
        });
        row.querySelector('.classroom-essay-retest-passed')?.addEventListener('change', (event) => {
            const rec = getRecord(sid);
            if (!rec || !rec.retestAssigned) {
                event.currentTarget.checked = false;
                return;
            }
            setRecord(sid, { retestPassed: event.currentTarget.checked });
            scheduleStatusSave();
        });
        row.querySelector('.classroom-essay-debate-video')?.addEventListener('change', (event) => {
            const checked = event.currentTarget.checked;
            const d = domain();
            // A manual NV choice is a teacher decision: Tools → Debate Rec TMS checks keep it.
            const patch = d && d.debateRecPatchForNvToggle
                ? d.debateRecPatchForNvToggle(
                    checked,
                    hooks && hooks.getCurrentUserId ? hooks.getCurrentUserId() : ''
                )
                : { debateVideoMissing: checked };
            setRecord(sid, patch);
            afterEssayStatusChange(panel, sid);
        });
        const noteInput = row.querySelector('.classroom-essay-note');
        if (noteInput) {
            noteInput.addEventListener('input', () => {
                const result = setRecord(sid, { note: noteInput.value });
                if (recordAffectsResubmitDayNote(result.prev, result.next)) {
                    markResubmitDayNoteDirty();
                }
                scheduleNoteSave();
                scheduleEssayNotePing(sid);
            });
            noteInput.addEventListener('blur', () => {
                flushEssayNotePing();
                flushNoteSave();
                ensureAutosave(panel);
                if (autosave) {
                    void autosave.flushPendingSave();
                }
            });
        }
    }

    function updateEssayRow(panel, studentId) {
        const rowsMount = panel.querySelector('#classroomEssaysRows');
        if (!rowsMount || !studentId) {
            return;
        }
        const safeId =
            typeof CSS !== 'undefined' && CSS.escape
                ? CSS.escape(studentId)
                : String(studentId).replace(/"/g, '\\"');
        const row = rowsMount.querySelector(`tr.classroom-essay-row[data-student-id="${safeId}"]`);
        if (!row) {
            return;
        }
        const editable = access() && access().canEditClass(getClassData());
        const rec = getRecord(studentId);
        const status = rec ? rec.status : 'not_submitted';
        const statusCls = statusOptions().find((o) => o.status === status);
        const rowStatusCls = statusCls ? statusCls.cls : 'essay-status--not';
        const railCls = essayRowRailCls(status);
        row.className = `classroom-sheet-row classroom-essay-row ${rowStatusCls} ${railCls}`;

        const submissionCell = row.querySelector('.classroom-sheet-col-status');
        const dueCell = row.querySelector('.classroom-sheet-col-due');
        if (submissionCell) {
            submissionCell.innerHTML = buildStatusCell(studentId, editable);
        }
        if (dueCell) {
            dueCell.innerHTML = buildDueCell(studentId);
        }
        const submittedCell = row.querySelector('.classroom-sheet-col-submitted');
        if (submittedCell) {
            submittedCell.innerHTML = formatSubmittedAtCell(rec);
        }
        refreshParentMessageButton(row, studentId, rec);
        bindEssayRowHandlers(panel, row, studentId);
    }

    /** Add, update or remove the parent Message button after a status change. */
    function refreshParentMessageButton(row, studentId, rec) {
        const cell = row.querySelector('.classroom-essay-student-cell');
        if (!cell) {
            return;
        }
        const old = cell.querySelector('.classroom-essay-msg-group');
        if (old) {
            old.remove();
        }
        const entry = getStudents().find((e) => e && e.student && e.student.id === studentId);
        const html = entry ? buildParentMessageButton(entry, parentMessageKind(rec)) : '';
        if (!html) {
            return;
        }
        cell.insertAdjacentHTML('beforeend', html);
        cell.querySelectorAll('[data-action="copy-essay-parent-msg"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                copyEssayParentMessage(studentId, btn.getAttribute('data-kind'), btn.getAttribute('data-lang'));
            });
        });
    }

    function bindSelectionControls(panel, rowsMount, visibleStudents) {
        const selectAll = panel.querySelector('#classroomEssaysSelectAll');
        const allIds = visibleStudents.map((e) => e.student.id);
        const allSelected = allIds.length > 0 && allIds.every((id) => selectedStudentIds.has(id));

        if (selectAll) {
            selectAll.checked = allSelected;
            selectAll.indeterminate = !allSelected && allIds.some((id) => selectedStudentIds.has(id));
            selectAll.onchange = () => {
                if (selectAll.checked) {
                    allIds.forEach((id) => selectedStudentIds.add(id));
                } else {
                    allIds.forEach((id) => selectedStudentIds.delete(id));
                }
                renderRows(panel);
                renderFilters(panel);
            };
        }

        rowsMount.querySelectorAll('.classroom-essay-select').forEach((input) => {
            const sid = input.getAttribute('data-student-id');
            input.checked = selectedStudentIds.has(sid);
            input.addEventListener('change', () => {
                if (input.checked) {
                    selectedStudentIds.add(sid);
                } else {
                    selectedStudentIds.delete(sid);
                }
                const headerCb = panel.querySelector('#classroomEssaysSelectAll');
                if (headerCb) {
                    const every = allIds.every((id) => selectedStudentIds.has(id));
                    headerCb.checked = every;
                    headerCb.indeterminate = !every && selectedStudentIds.size > 0;
                }
                renderFilters(panel);
            });
        });
    }

    function formatSubmittedAtCell(rec) {
        const at = rec && rec.submittedAt ? String(rec.submittedAt).trim() : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) {
            return `<span class="classroom-essay-submitted-empty">—</span>`;
        }
        return `<time class="classroom-essay-submitted-date" datetime="${escapeAttr(at)}">${escapeHtml(at)}</time>`;
    }

    function renderRows(panel) {
        const rowsMount = panel.querySelector('#classroomEssaysRows');
        if (!rowsMount) {
            return;
        }
        const editable = access() && access().canEditClass(getClassData());
        const students = getStudents();
        pruneSelectedStudentIds(students);
        const rowApi = global.CCPClassroomStudentRow;

        if (!syllabusRowId) {
            const classData = getClassData();
            const canAdd = Boolean(editable && classData);
            const emptyCta = canAdd
                ? `<button type="button" class="btn btn-primary btn-compact" data-action="add-essay-assignment">${escapeHtml(t('classroomEssayAddAssignmentTitle'))}</button>`
                : '';
            rowsMount.innerHTML = `<tr><td colspan="7" class="classroom-sheet-empty"><div class="classroom-sheet-empty--essay-add"><p class="section-hint">${escapeHtml(t('classroomEssayNoAssignment'))}</p>${emptyCta}</div></td></tr>`;
            rowsMount.querySelector('[data-action="add-essay-assignment"]')?.addEventListener('click', () => {
                openAddAssignmentModal(panel);
            });
            renderFooterHint(panel);
            return;
        }

        if (!students.length) {
            rowsMount.innerHTML = `<tr><td colspan="7" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomNoStudentsHint'))}</p></td></tr>`;
            renderFooterHint(panel);
            return;
        }

        const filtered = students.filter((entry) => studentMatchesFilter(entry.student.id));

        if (!filtered.length) {
            rowsMount.innerHTML = `<tr><td colspan="7" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomEssayNoStudentsFilter'))} <button type="button" class="classroom-essay-clear-filter" data-action="clear-essay-filter">${escapeHtml(t('classroomEssayClearFilter'))}</button></p></td></tr>`;
            rowsMount.querySelector('[data-action="clear-essay-filter"]')?.addEventListener('click', () => {
                clearEssayFilter(panel);
            });
            renderFooterHint(panel);
            return;
        }

        rowsMount.innerHTML = filtered
            .map((entry, index) => {
                const sid = entry.student.id;
                const rec = getRecord(sid);
                const note = rec ? rec.note || '' : '';
                const identity = rowApi && rowApi.formatEssayStudentCell
                    ? rowApi.formatEssayStudentCell(entry, t)
                    : rowApi
                        ? rowApi.formatStudentIdentityColumn(entry, t)
                        : escapeHtml(entry.student.name);
                const disabled = editable ? '' : ' disabled';
                const checked = selectedStudentIds.has(sid) ? ' checked' : '';
                const status = rec ? rec.status : 'not_submitted';
                const statusCls = statusOptions().find((o) => o.status === status);
                const rowStatusCls = statusCls ? statusCls.cls : 'essay-status--not';
                const railCls = essayRowRailCls(status);
                return `<tr class="classroom-sheet-row classroom-essay-row ${rowStatusCls} ${railCls}" data-student-id="${escapeHtml(sid)}">
                <td class="classroom-sheet-col-select">
                    <input type="checkbox" class="classroom-essay-select" data-student-id="${escapeHtml(sid)}" aria-label="${escapeHtml(t('classroomEssayBatchSelectCol'))}"${checked}${disabled} />
                </td>
                <td class="classroom-sheet-col-index">${index + 1}</td>
                <td class="classroom-sheet-col-student"><div class="classroom-essay-student-cell">${identity}${buildParentMessageButton(entry, parentMessageKind(rec))}</div></td>
                <td class="classroom-sheet-col-status">${buildStatusCell(sid, editable)}</td>
                <td class="classroom-sheet-col-due">${buildDueCell(sid)}</td>
                <td class="classroom-sheet-col-submitted">${formatSubmittedAtCell(rec)}</td>
                <td class="classroom-sheet-col-feedback">
                    <textarea rows="2" class="field-input classroom-essay-note classroom-essay-feedback" data-student-id="${escapeHtml(sid)}" placeholder="${escapeHtml(t('classroomEssayFeedbackPlaceholder'))}" aria-label="${escapeHtml(t('classroomEssayColFeedback'))}"${disabled}>${escapeHtml(note)}</textarea>
                </td>
            </tr>`;
            })
            .join('');

        rowsMount.querySelectorAll('[data-action="copy-essay-parent-msg"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                copyEssayParentMessage(btn.getAttribute('data-student-id'), btn.getAttribute('data-kind'), btn.getAttribute('data-lang'));
            });
        });

        bindSelectionControls(panel, rowsMount, filtered);

        rowsMount.querySelectorAll('tr.classroom-essay-row').forEach((row) => {
            bindEssayRowHandlers(panel, row);
        });
        renderFooterHint(panel);
    }

    async function persistEssays(panel, options) {
        const opt = options || {};
        const editable = access() && access().canEditClass(getClassData());
        if (!editable || !draftSubmission) {
            return;
        }
        const d = domain();
        const data = getAppData();
        draftSubmission.syllabusRowId = syllabusRowId;
        draftSubmission.lessonDate = lessonDate;
        const submissions = d.upsertEssaySubmission(data.essaySubmissions, draftSubmission);
        const preSaveSignature = getDraftRenderSignature();
        const saveBtn = panel && panel.querySelector('#classroomEssaysSaveBtn');

        if (saveBtn) {
            saveBtn.disabled = true;
        }
        try {
            await hooks.saveClassroom({ essaySubmissions: submissions });
            if (!opt.silent) {
                hooks.showToast(t('saved'));
            }
            const draftUnchanged = preSaveSignature === getDraftRenderSignature();
            if (draftUnchanged) {
                loadSubmission();
            }
            const panelVisible = panel && !panel.hidden && !isTypingInEssayNote(panel);
            if (!opt.skipRender && !opt.silent) {
                if (panel && isTypingInEssayNote(panel)) {
                    if (autosave) {
                        autosave.syncStatusDisplay();
                    }
                } else if (draftUnchanged && panelVisible) {
                    if (autosave) {
                        autosave.syncStatusDisplay();
                    }
                    renderContextBar(panel);
                    refreshZoneContextBar();
                } else {
                    render(panel);
                }
            } else if (opt.silent && panelVisible) {
                renderContextBar(panel);
                if (!draftUnchanged) {
                    renderStatsBar(panel);
                    renderRows(panel);
                }
                refreshZoneContextBar();
            }
            syncResubmitDayNoteIfNeeded();
            if (!(opt.silent && panelVisible)) {
                refreshZoneContextBar();
            }
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
            if (autosave && preSaveSignature !== getDraftRenderSignature()) {
                autosave.updateStatus('pending');
                scheduleStatusSave();
            }
            throw err;
        } finally {
            if (saveBtn) {
                saveBtn.disabled = !(access() && access().canEditClass(getClassData()));
            }
        }
    }

    function render(panel) {
        if (!panel) {
            return;
        }
        panelRef = panel;
        syncClassIdFromContext();
        bindEssayGroupToolbar(panel);
        renderHeader(panel);
        renderContextBar(panel);
        renderStatsBar(panel);
        renderFilters(panel);
        renderToolbarHint(panel);
        renderRows(panel);
        renderFooterHint(panel);
        syncEssayGroupToolbarButtons(panel);

        ensureAutosave(panel);
        if (autosave) {
            autosave.syncStatusDisplay();
            autosave.bindManualSaveBtn(panel, '#classroomEssaysSaveBtn', () =>
                access() && access().canEditClass(getClassData())
            );
        }
    }

    async function onActiveContextChange() {
        const panel = document.getElementById('panel-essays');
        if (!panel || panel.hidden) {
            return;
        }
        await flushBeforeLeave();
        const preferredDate = lessonDate;
        syncClassIdFromContext();
        applyResolvedAssignment(getClassData(), preferredDate);
        selectedStudentIds.clear();
        loadSubmission();
        render(panel);
    }

    function setEssayTmsError(msg) {
        const el = document.getElementById('essayTmsSyncError');
        if (!el) {
            return;
        }
        if (msg) {
            el.textContent = msg;
            el.hidden = false;
        } else {
            el.textContent = '';
            el.hidden = true;
        }
    }

    function setEssayTmsStatus(msg) {
        const el = document.getElementById('essayTmsSyncStatus');
        if (el) {
            el.textContent = msg || '';
        }
    }

    function hydrateEssayTmsCredForm() {
        const userEl = document.getElementById('essayTmsUsername');
        const rememberEl = document.getElementById('essayTmsRememberUser');
        let saved = '';
        try {
            saved = String(localStorage.getItem(ESSAY_TMS_USERNAME_KEY) || '');
        } catch (_) {
            saved = '';
        }
        if (userEl && !userEl.value && saved) {
            userEl.value = saved;
        }
        if (rememberEl) {
            rememberEl.checked = Boolean(saved);
        }
    }

    function readEssayTmsCreds() {
        const userEl = document.getElementById('essayTmsUsername');
        const passEl = document.getElementById('essayTmsPassword');
        const rememberEl = document.getElementById('essayTmsRememberUser');
        const dom = {
            username: userEl ? String(userEl.value || '').trim() : '',
            password: passEl ? String(passEl.value || '') : '',
            rememberUser: Boolean(rememberEl && rememberEl.checked)
        };
        if ((userEl || passEl) && (dom.username || dom.password)) {
            return dom;
        }
        if (global.CCPTmsSyncCenter && global.CCPTmsSyncCenter.getCredentials) {
            return global.CCPTmsSyncCenter.getCredentials();
        }
        return dom;
    }

    function persistEssayTmsUsername(username, remember) {
        try {
            if (remember && username) {
                localStorage.setItem(ESSAY_TMS_USERNAME_KEY, username);
            } else if (!remember) {
                localStorage.removeItem(ESSAY_TMS_USERNAME_KEY);
            }
        } catch (_) {
            /* ignore */
        }
    }

    function essayTmsUnmatchedReason(row) {
        const reason = row && row.reason;
        if (reason === 'class_unlinked' || reason === 'class_missing') {
            return t('classroomEssayTmsSyncReasonClassUnlinked');
        }
        if (reason === 'no_class_for_cohort') {
            return t('classroomEssayTmsSyncReasonNoClass');
        }
        if (reason === 'assignment_subject_mismatch') {
            return t('classroomEssayTmsSyncReasonSubject');
        }
        if (reason === 'assignment_unmatched' || reason === 'assignment_missing' || reason === 'assignment_month_mismatch') {
            return t('classroomEssayTmsSyncReasonAssignment');
        }
        if (reason === 'student_unmatched') {
            return t('classroomEssayTmsSyncReasonStudent');
        }
        if (reason === 'student_unclear') {
            return t('classroomEssayTmsSyncReasonStudentUnclear');
        }
        if (reason === 'student_skipped') {
            return t('classroomEssayTmsSyncReasonStudentSkipped');
        }
        if (reason === 'unresolved') {
            return t('classroomEssayTmsSyncReasonUnresolved');
        }
        if (reason === 'skipped_by_user') {
            return t('classroomEssayTmsSyncReasonSkipped');
        }
        if (reason === 'already_set') {
            return t('classroomEssayTmsSyncReasonAlready').replace(
                '{status}',
                t(essayStatusLabelKey(row.prevStatus || 'not_submitted'))
            );
        }
        return reason || '';
    }

    function ensureEssayPlanStudentResolutions(row) {
        if (!row.studentResolutions || typeof row.studentResolutions !== 'object') {
            row.studentResolutions = {};
        }
        return row.studentResolutions;
    }

    function collectEssayTmsStudentQueue() {
        const d = domain();
        if (!d || !d.listEssayTmsStudentReviewQueue) {
            refreshEssayTmsPreviewFromPlan();
            return (essayTmsPreview && essayTmsPreview.unmatched
                ? essayTmsPreview.unmatched
                : []
            ).filter((u) => u && u.needsReview);
        }
        return d.listEssayTmsStudentReviewQueue(getAppData(), essayTmsPlan);
    }

    function essayTmsStudentsResolved() {
        return collectEssayTmsStudentQueue().length === 0;
    }

    function getCurrentEssayStudentResolution() {
        const entry = essayTmsStudentQueue[essayTmsStudentIndex];
        if (!entry || entry.rowIdx == null) {
            return null;
        }
        const row = essayTmsPlan[entry.rowIdx];
        const key = entry.tmsKey;
        if (!row || !key) {
            return null;
        }
        ensureEssayPlanStudentResolutions(row);
        return row.studentResolutions[key] || null;
    }

    function setCurrentEssayStudentResolution(action, studentId) {
        const entry = essayTmsStudentQueue[essayTmsStudentIndex];
        if (!entry || entry.rowIdx == null || !entry.tmsKey) {
            return;
        }
        const row = essayTmsPlan[entry.rowIdx];
        if (!row) {
            return;
        }
        ensureEssayPlanStudentResolutions(row);
        if (action === 'map') {
            row.studentResolutions[entry.tmsKey] = {
                action: 'map',
                studentId: String(studentId || '')
            };
        } else if (action === 'add') {
            row.studentResolutions[entry.tmsKey] = { action: 'add' };
        } else {
            row.studentResolutions[entry.tmsKey] = { action: 'skip' };
        }
    }

    function syncEssayTmsWizardPanels() {
        const review = document.getElementById('essayTmsStudentReview');
        const mapping = document.getElementById('essayTmsSyncPreviewTable');
        const batchBar = document.getElementById('essayTmsSyncBatchBar');
        const credForm = document.getElementById('essayTmsCredForm');
        const confirmBtn = document.getElementById('essayTmsSyncConfirmBtn');
        const onReview = essayTmsWizardStep === 2 && essayTmsStudentQueue.length > 0;
        if (review) {
            review.hidden = !onReview;
        }
        if (mapping) {
            mapping.hidden = onReview;
        }
        if (batchBar) {
            batchBar.hidden =
                onReview || Boolean(essayTmsLoading) || !essayTmsHasFetched || essayTmsPlan.length === 0;
        }
        if (credForm) {
            credForm.hidden = onReview;
        }
        if (confirmBtn) {
            confirmBtn.hidden = onReview;
        }
        if (onReview) {
            renderEssayTmsStudentReview();
        }
    }

    function renderEssayTmsStudentReview() {
        const entry = essayTmsStudentQueue[essayTmsStudentIndex];
        if (!entry) {
            return;
        }
        const progress = document.getElementById('essayTmsStudentReviewProgress');
        const reasonEl = document.getElementById('essayTmsStudentReviewReason');
        const nameEl = document.getElementById('essayTmsStudentReviewName');
        const labelEl = document.getElementById('essayTmsStudentReviewNameLabel');
        const optionsEl = document.getElementById('essayTmsStudentReviewOptions');
        const backBtn = document.getElementById('essayTmsStudentReviewBackBtn');
        const nextBtn = document.getElementById('essayTmsStudentReviewNextBtn');
        if (progress) {
            progress.textContent = t('classroomEssayTmsStudentProgress')
                .replace('{current}', String(essayTmsStudentIndex + 1))
                .replace('{total}', String(essayTmsStudentQueue.length))
                .replace('{class}', entry.className || '');
        }
        if (reasonEl) {
            reasonEl.textContent = essayTmsUnmatchedReason(entry);
        }
        if (labelEl) {
            labelEl.textContent = t('classroomEssayTmsStudentNameLabel');
        }
        if (nameEl) {
            const en = entry.studentNameEn ? ` (${entry.studentNameEn})` : '';
            nameEl.textContent = `${entry.studentName || ''}${en}`;
        }
        const res = getCurrentEssayStudentResolution();
        const selected = (res && res.action) || '';
        const selectedId = (res && res.studentId) || '';
        const candidates = Array.isArray(entry.candidates) ? entry.candidates : [];
        if (optionsEl) {
            const mapOptions = candidates
                .map((c) => {
                    const en = c.nameEn ? ` (${c.nameEn})` : '';
                    const sel =
                        selected === 'map' && selectedId === c.id ? ' selected' : '';
                    return `<option value="${escapeAttr(c.id)}"${sel}>${escapeHtml(
                        `${c.name || ''}${en}`
                    )}</option>`;
                })
                .join('');
            optionsEl.innerHTML = [
                `<label class="checkbox-label selection-chip"><input type="radio" name="essayTmsStudentChoice" value="map"${
                    selected === 'map' ? ' checked' : ''
                }><span>${escapeHtml(t('classroomEssayTmsStudentMap'))}</span></label>`,
                `<select id="essayTmsStudentMapSelect" class="field-select"${
                    selected === 'map' ? '' : ' disabled'
                }><option value="">${escapeHtml(
                    t('classroomEssayTmsStudentMapChoose')
                )}</option>${mapOptions}</select>`,
                `<label class="checkbox-label selection-chip"><input type="radio" name="essayTmsStudentChoice" value="add"${
                    selected === 'add' ? ' checked' : ''
                }><span>${escapeHtml(t('classroomEssayTmsStudentAdd'))}</span></label>`,
                `<label class="checkbox-label selection-chip"><input type="radio" name="essayTmsStudentChoice" value="skip"${
                    selected === 'skip' ? ' checked' : ''
                }><span>${escapeHtml(t('classroomEssayTmsStudentSkip'))}</span></label>`
            ].join('');
            optionsEl.querySelectorAll('input[name="essayTmsStudentChoice"]').forEach((input) => {
                input.addEventListener('change', () => {
                    const mapSel = document.getElementById('essayTmsStudentMapSelect');
                    if (input.value === 'map') {
                        if (mapSel) {
                            mapSel.disabled = false;
                        }
                        setCurrentEssayStudentResolution('map', mapSel ? mapSel.value : '');
                    } else {
                        if (mapSel) {
                            mapSel.disabled = true;
                        }
                        setCurrentEssayStudentResolution(input.value);
                    }
                    updateEssayTmsStudentNavButtons();
                });
            });
            optionsEl
                .querySelector('#essayTmsStudentMapSelect')
                ?.addEventListener('change', (e) => {
                    setCurrentEssayStudentResolution('map', e.target.value);
                    const mapRadio = optionsEl.querySelector(
                        'input[name="essayTmsStudentChoice"][value="map"]'
                    );
                    if (mapRadio) {
                        mapRadio.checked = true;
                    }
                    updateEssayTmsStudentNavButtons();
                });
        }
        if (backBtn) {
            backBtn.disabled = false;
            backBtn.textContent =
                essayTmsStudentIndex === 0
                    ? t('rosterTmsMissingBackToPrior')
                    : t('rosterTmsReviewBack');
        }
        if (nextBtn) {
            nextBtn.textContent =
                essayTmsStudentIndex >= essayTmsStudentQueue.length - 1
                    ? t('rosterTmsReviewFinish')
                    : t('rosterTmsReviewNext');
        }
        updateEssayTmsStudentNavButtons();
    }

    function updateEssayTmsStudentNavButtons() {
        const nextBtn = document.getElementById('essayTmsStudentReviewNextBtn');
        const res = getCurrentEssayStudentResolution();
        const ok =
            res &&
            (res.action === 'add' ||
                res.action === 'skip' ||
                (res.action === 'map' && res.studentId));
        if (nextBtn) {
            nextBtn.disabled = !ok;
        }
    }

    function enterEssayTmsStudentReview() {
        essayTmsStudentQueue = collectEssayTmsStudentQueue();
        if (!essayTmsStudentQueue.length) {
            essayTmsWizardStep = 1;
            syncEssayTmsWizardPanels();
            void finishEssayTmsSyncApply();
            return;
        }
        essayTmsWizardStep = 2;
        essayTmsStudentIndex = 0;
        syncEssayTmsWizardPanels();
    }

    function essayTmsStudentReviewBack() {
        if (essayTmsStudentIndex > 0) {
            essayTmsStudentIndex -= 1;
            renderEssayTmsStudentReview();
            return;
        }
        essayTmsWizardStep = 1;
        essayTmsStudentQueue = [];
        syncEssayTmsWizardPanels();
        renderEssayTmsPreview();
    }

    function essayTmsStudentReviewNext() {
        const res = getCurrentEssayStudentResolution();
        const ok =
            res &&
            (res.action === 'add' ||
                res.action === 'skip' ||
                (res.action === 'map' && res.studentId));
        if (!ok) {
            setEssayTmsError(t('classroomEssayTmsStudentChoiceRequired'));
            return;
        }
        setEssayTmsError('');
        if (essayTmsStudentIndex < essayTmsStudentQueue.length - 1) {
            essayTmsStudentIndex += 1;
            renderEssayTmsStudentReview();
            return;
        }
        essayTmsWizardStep = 1;
        essayTmsStudentQueue = [];
        syncEssayTmsWizardPanels();
        void finishEssayTmsSyncApply();
    }

    function refreshEssayTmsPreviewFromPlan() {
        const d = domain();
        if (!d || !d.previewTmsEssaySyncPlan) {
            essayTmsPreview = null;
            return;
        }
        essayTmsPreview = d.previewTmsEssaySyncPlan(getAppData(), essayTmsPlan);
    }

    function getTermRange() {
        if (hooks && hooks.getTermDateRange) {
            return hooks.getTermDateRange();
        }
        return { start: '', end: '' };
    }

    function essayAssignmentOptionsHtml(classId, selectedRowId, suggestedRowId, assignedDate) {
        const d = domain();
        const data = getAppData();
        const classData = (data.classes || []).find((c) => c && c.id === classId);
        const rows = classData && d
            ? d.getEssayRowsFromSyllabus(classData.syllabusRows, { classData })
            : [];
        const placeholderKey = rows.length
            ? 'classroomEssayTmsSyncChooseAssignment'
            : 'classroomEssayTmsSyncNoAssignment';
        const opts = [
            `<option value=""${ !selectedRowId ? ' selected' : ''}>${escapeHtml(t(placeholderKey))}</option>`
        ];
        const byMonth = new Map();
        rows.forEach((row) => {
            const month = (row.date || '').slice(0, 7) || '—';
            if (!byMonth.has(month)) {
                byMonth.set(month, []);
            }
            byMonth.get(month).push(row);
        });
        const assignedMonth = String(assignedDate || '').slice(0, 7);
        const months = Array.from(byMonth.keys()).sort().reverse();
        if (assignedMonth && months.includes(assignedMonth)) {
            months.splice(months.indexOf(assignedMonth), 1);
            months.unshift(assignedMonth);
        }
        months.forEach((month) => {
            const groupRows = byMonth.get(month);
            if (months.length > 1) {
                opts.push(`<optgroup label="${escapeAttr(month)}">`);
            }
            groupRows.forEach((row) => {
                const rid = d.getSyllabusRowKey ? d.getSyllabusRowKey(row) : row.id;
                const label = formatEssayRowLabel(row);
                const sug =
                    suggestedRowId && rid === suggestedRowId && !selectedRowId
                        ? ` (${t('classroomEssayTmsSyncSuggested')})`
                        : '';
                opts.push(
                    `<option value="${escapeAttr(rid)}"${selectedRowId === rid ? ' selected' : ''}>${escapeHtml(label + sug)}</option>`
                );
            });
            if (months.length > 1) {
                opts.push('</optgroup>');
            }
        });
        return opts.join('');
    }

    function essayClassOptionsHtml(selectedClassId, suggestedClassId) {
        const d = domain();
        const classes = d && d.listEssayClasses ? d.listEssayClasses(getAppData()) : [];
        const opts = [
            `<option value="__skip__"${selectedClassId === '__skip__' ? ' selected' : ''}>${escapeHtml(t('classroomEssayTmsSyncSkip'))}</option>`,
            `<option value=""${ !selectedClassId || selectedClassId === '' ? ' selected' : ''}>${escapeHtml(t('classroomEssayTmsSyncChooseClass'))}</option>`
        ];
        classes.forEach((c) => {
            const sug =
                suggestedClassId && c.id === suggestedClassId && !selectedClassId
                    ? ` (${t('classroomEssayTmsSyncSuggested')})`
                    : '';
            opts.push(
                `<option value="${escapeAttr(c.id)}"${selectedClassId === c.id ? ' selected' : ''}>${escapeHtml((c.name || c.id) + sug)}</option>`
            );
        });
        return opts.join('');
    }

    function syncEssayTmsBatchBar() {
        const bar = document.getElementById('essayTmsSyncBatchBar');
        if (bar) {
            bar.hidden = Boolean(essayTmsLoading) || !essayTmsHasFetched || essayTmsPlan.length === 0;
        }
    }

    function planRowResolved(row) {
        if (!row) {
            return false;
        }
        if (row.userAction === 'skip') {
            return true;
        }
        return (
            row.userAction === 'map' &&
            Boolean(row.userClassId) &&
            Boolean(row.userSyllabusRowId)
        );
    }

    function renderEssayTmsPreview() {
        const mount = document.getElementById('essayTmsSyncPreviewTable');
        const confirmBtn = document.getElementById('essayTmsSyncConfirmBtn');
        if (!mount) {
            return;
        }
        syncEssayTmsBatchBar();

        if (!essayTmsHasFetched) {
            mount.innerHTML = `<p class="section-hint">${escapeHtml(t('classroomEssayTmsSyncIdle'))}</p>`;
            if (confirmBtn) {
                confirmBtn.disabled = true;
            }
            return;
        }

        refreshEssayTmsPreviewFromPlan();
        const preview = essayTmsPreview || { updates: [], skipped: [], unmatched: [] };
        const updates = preview.updates || [];
        const skipped = preview.skipped || [];
        const unmatched = preview.unmatched || [];

        const summary = t('classroomEssayTmsSyncPreviewSummary')
            .replace('{updates}', String(updates.length))
            .replace('{skipped}', String(skipped.length))
            .replace('{unmatched}', String(unmatched.length));

        const mapRows = essayTmsPlan
            .map((row, idx) => {
                const selectedClass =
                    row.userAction === 'skip' ? '__skip__' : row.userClassId || '';
                const assignDisabled = row.userAction === 'skip' || !row.userClassId ? ' disabled' : '';
                const rememberHint = row.remembered
                    ? `<div class="section-hint">${escapeHtml(t('classroomEssayTmsSyncRemembered'))}</div>`
                    : '';
                const sugHint =
                    !row.remembered && row.suggestedClassId
                        ? `<div class="section-hint">${escapeHtml(t('classroomEssayTmsSyncSuggestionHint'))}</div>`
                        : '';
                const tmsDate = row.assignedDate || row.lessonDate || '';
                const tmsLabel = `${row.className || ''}${tmsDate ? ` · ${tmsDate}` : ''}`;
                return `<tr data-essay-tms-row="${idx}">
                    <td>${escapeHtml(tmsLabel)}${rememberHint}${sugHint}</td>
                    <td>${escapeHtml(row.title || '')}</td>
                    <td>${row.studentCount || 0}</td>
                    <td><select class="field-select essay-tms-class" data-essay-tms-row="${idx}">${essayClassOptionsHtml(selectedClass, row.suggestedClassId)}</select></td>
                    <td><select class="field-select essay-tms-assignment" data-essay-tms-row="${idx}"${assignDisabled}>${essayAssignmentOptionsHtml(row.userClassId, row.userSyllabusRowId, row.suggestedSyllabusRowId, row.assignedDate || row.lessonDate)}</select></td>
                </tr>`;
            })
            .join('');

        let html = `<p class="section-hint">${escapeHtml(summary)}</p>`;
        if (essayTmsFilteredOutOfTermCount > 0) {
            html += `<p class="section-hint">${escapeHtml(
                t('classroomEssayTmsSyncFilteredOutOfTerm').replace(
                    '{count}',
                    String(essayTmsFilteredOutOfTermCount)
                )
            )}</p>`;
        }
        if (essayTmsPlan.length) {
            html += `<table class="roster-import-table"><thead><tr>
                <th>${escapeHtml(t('classroomEssayTmsSyncColTms'))}</th>
                <th>${escapeHtml(t('classroomEssayTmsSyncColSubject'))}</th>
                <th>${escapeHtml(t('classroomEssayTmsSyncColStudents'))}</th>
                <th>${escapeHtml(t('classroomEssayTmsSyncColCcmuClass'))}</th>
                <th>${escapeHtml(t('classroomEssayTmsSyncColCcmuAssignment'))}</th>
            </tr></thead><tbody>${mapRows}</tbody></table>`;
        } else if (!essayTmsLoading) {
            html += `<p class="section-hint">${escapeHtml(
                essayTmsFilteredOutOfTermCount > 0
                    ? t('classroomEssayTmsSyncAllOutOfTerm')
                    : t('classroomEssayTmsSyncEmpty')
            )}</p>`;
        }

        if (updates.length) {
            const updateRows = updates
                .slice(0, 120)
                .map((u) => {
                    const late = u.submissionLate
                        ? ` <span class="section-hint">(${escapeHtml(t('classroomEssayTmsSyncLate'))})</span>`
                        : '';
                    return `<tr>
                        <td>${escapeHtml(u.className || '')}</td>
                        <td>${escapeHtml(u.assignmentLabel || u.tmsTitle || '')}</td>
                        <td>${escapeHtml(u.studentName || u.tmsName || '')}</td>
                        <td>${escapeHtml(t('classroomEssayTmsSyncChangeLine'))}${late}</td>
                    </tr>`;
                })
                .join('');
            html += `<p class="section-hint">${escapeHtml(t('classroomEssayTmsSyncUpdatesTitle'))}</p>`;
            html += `<table class="roster-import-table"><thead><tr>
                <th>${escapeHtml(t('classroomEssayTmsSyncColClass'))}</th>
                <th>${escapeHtml(t('classroomEssayTmsSyncColAssignment'))}</th>
                <th>${escapeHtml(t('classroomEssayTmsSyncColStudent'))}</th>
                <th>${escapeHtml(t('classroomEssayTmsSyncColChange'))}</th>
            </tr></thead><tbody>${updateRows}</tbody></table>`;
        }

        const issueRows = skipped
            .concat(unmatched)
            .filter((r) => r && r.reason !== 'skipped_by_user')
            .slice(0, 60);
        if (issueRows.length) {
            html += `<p class="section-hint">${escapeHtml(t('classroomEssayTmsSyncUnmatchedTitle'))}</p>`;
            html += `<table class="roster-import-table"><thead><tr>
                <th>${escapeHtml(t('classroomEssayTmsSyncColClass'))}</th>
                <th>${escapeHtml(t('classroomEssayTmsSyncColAssignment'))}</th>
                <th>${escapeHtml(t('classroomEssayTmsSyncColStudent'))}</th>
                <th>${escapeHtml(t('classroomEssayTmsSyncColChange'))}</th>
            </tr></thead><tbody>${issueRows
                .map((row) => {
                    const label = row.assignmentLabel || row.title || row.tmsTitle || '';
                    const who = row.studentName || row.tmsName || '';
                    return `<tr>
                        <td>${escapeHtml(row.className || '')}</td>
                        <td>${escapeHtml(label)}</td>
                        <td>${escapeHtml(who)}</td>
                        <td>${escapeHtml(essayTmsUnmatchedReason(row))}</td>
                    </tr>`;
                })
                .join('')}</tbody></table>`;
        }

        mount.innerHTML = html;

        mount.querySelectorAll('select.essay-tms-class').forEach((sel) => {
            sel.addEventListener('change', () => {
                const idx = Number(sel.getAttribute('data-essay-tms-row'));
                const row = essayTmsPlan[idx];
                if (!row) {
                    return;
                }
                const val = sel.value;
                if (val === '__skip__') {
                    row.userAction = 'skip';
                    row.userClassId = '';
                    row.userSyllabusRowId = '';
                } else if (!val) {
                    row.userAction = 'choose';
                    row.userClassId = '';
                    row.userSyllabusRowId = '';
                } else {
                    row.userAction = 'map';
                    row.userClassId = val;
                    // Prefer remembered/suggested assignment for this class when switching
                    if (
                        row.suggestedClassId === val &&
                        row.suggestedSyllabusRowId &&
                        !row.userSyllabusRowId
                    ) {
                        row.userSyllabusRowId = row.suggestedSyllabusRowId;
                    } else if (row.userSyllabusRowId) {
                        // keep if still valid for new class
                        const d = domain();
                        const classData = (getAppData().classes || []).find((c) => c && c.id === val);
                        const ok =
                            classData &&
                            d
                                .getEssayRowsFromSyllabus(classData.syllabusRows, { classData })
                                .some((r) => d.getSyllabusRowKey(r) === row.userSyllabusRowId);
                        if (!ok) {
                            row.userSyllabusRowId =
                                row.suggestedClassId === val ? row.suggestedSyllabusRowId || '' : '';
                        }
                    } else if (row.suggestedClassId === val) {
                        row.userSyllabusRowId = row.suggestedSyllabusRowId || '';
                    } else {
                        row.userSyllabusRowId = '';
                    }
                }
                row.remembered = false;
                renderEssayTmsPreview();
            });
        });

        mount.querySelectorAll('select.essay-tms-assignment').forEach((sel) => {
            sel.addEventListener('change', () => {
                const idx = Number(sel.getAttribute('data-essay-tms-row'));
                const row = essayTmsPlan[idx];
                if (!row) {
                    return;
                }
                row.userSyllabusRowId = sel.value || '';
                if (row.userClassId && row.userSyllabusRowId) {
                    row.userAction = 'map';
                } else if (row.userAction !== 'skip') {
                    row.userAction = 'choose';
                }
                row.remembered = false;
                renderEssayTmsPreview();
            });
        });

        const allResolved =
            essayTmsPlan.length > 0 && essayTmsPlan.every((r) => planRowResolved(r));
        const needsStudentReview = allResolved && !essayTmsStudentsResolved();
        if (confirmBtn) {
            // Allow Apply when assignment rows are resolved — even with 0 updates —
            // so skip-only / already-received paths can succeed with warnings.
            confirmBtn.disabled = essayTmsLoading || !allResolved;
            confirmBtn.textContent = needsStudentReview
                ? t('classroomEssayTmsSyncReviewStudents')
                : t('classroomEssayTmsSyncConfirm');
        }
        syncEssayTmsWizardPanels();
    }

    function openEssayTmsSyncModal(filterClassId) {
        if (!hooks || !hooks.openModal) {
            return;
        }
        if (hooks.isViewOnly && hooks.isViewOnly()) {
            hooks.showToast(t('rosterImportReadOnly') || 'Read only', true);
            return;
        }
        essayTmsPreview = null;
        essayTmsPlan = [];
        essayTmsHasFetched = false;
        essayTmsLoading = false;
        essayTmsApplying = false;
        essayTmsFilterClassId = filterClassId || '';
        essayTmsFilteredOutOfTermCount = 0;
        essayTmsStudentQueue = [];
        essayTmsStudentIndex = 0;
        essayTmsWizardStep = 1;
        setEssayTmsError('');
        setEssayTmsStatus('');
        hydrateEssayTmsCredForm();
        renderEssayTmsPreview();
        hooks.openModal(document.getElementById('essayTmsSyncModal'));
        const userEl = document.getElementById('essayTmsUsername');
        const passEl = document.getElementById('essayTmsPassword');
        if (userEl && !userEl.value) {
            userEl.focus();
        } else if (passEl) {
            passEl.focus();
        }
    }

    function isEssayTmsStaleBridgeError(err, res, body) {
        const msg = String((err && err.message) || '').toLowerCase();
        if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) {
            return true;
        }
        if (err && err.name === 'TypeError' && !res) {
            return true;
        }
        if (res && (res.status === 404 || res.status === 405)) {
            return true;
        }
        if (res && res.ok === false && !body) {
            return true;
        }
        return false;
    }

    async function loadEssayTmsPreview() {
        if (!hooks) {
            return;
        }
        if (hooks.isViewOnly && hooks.isViewOnly()) {
            setEssayTmsError(t('rosterImportReadOnly') || 'Read only');
            return;
        }
        const creds = readEssayTmsCreds();
        persistEssayTmsUsername(creds.username, creds.rememberUser);
        essayTmsPreview = null;
        essayTmsPlan = [];
        essayTmsHasFetched = false;
        essayTmsFilteredOutOfTermCount = 0;
        essayTmsLoading = true;
        setEssayTmsError('');
        setEssayTmsStatus(t('classroomEssayTmsSyncLoading'));
        renderEssayTmsPreview();
        const loadBtn = document.getElementById('essayTmsLoadBtn');
        if (loadBtn) {
            loadBtn.disabled = true;
        }

        let stillTimer = null;
        let abortTimer = null;
        const controller =
            typeof AbortController !== 'undefined' ? new AbortController() : null;

        const finishLoadUi = () => {
            if (stillTimer) {
                clearTimeout(stillTimer);
                stillTimer = null;
            }
            if (abortTimer) {
                clearTimeout(abortTimer);
                abortTimer = null;
            }
            essayTmsLoading = false;
            if (loadBtn) {
                loadBtn.disabled = false;
            }
            renderEssayTmsPreview();
        };

        try {
            const payload = {};
            if (creds.username || creds.password) {
                payload.username = creds.username;
                payload.password = creds.password;
            }
            const bridgeState = global.CCPTmsSync ? await global.CCPTmsSync.detectBridge() : { status: 'missing' };
            const usedBridge = bridgeState.status === 'ready' || bridgeState.status === 'same-origin';
            if (bridgeState.status === 'ready') {
                setEssayTmsStatus(t('classroomEssayTmsBridgeLoading'));
            }
            stillTimer = setTimeout(() => {
                if (essayTmsLoading) {
                    setEssayTmsStatus(t('classroomEssayTmsBridgeStillLoading'));
                }
            }, ESSAY_TMS_BRIDGE_STILL_LOADING_MS);
            const body = await global.CCPTmsSync.run('essays', payload, {
                timeoutMs: ESSAY_TMS_BRIDGE_TIMEOUT_MS,
                signal: controller ? controller.signal : undefined
            });
            if (!body || !Array.isArray(body.assignments)) {
                setEssayTmsError(
                    usedBridge
                        ? t('classroomEssayTmsBridgeStaleHint')
                        : t('rosterTmsSyncUnavailable')
                );
                setEssayTmsStatus('');
                finishLoadUi();
                return;
            }

            const d = domain();
            const term = getTermRange();
            const built = d.buildTmsEssaySyncPlan(getAppData(), body, {
                filterClassId: essayTmsFilterClassId,
                termStart: term.start,
                termEnd: term.end
            });
            essayTmsPlan = built.rows || [];
            essayTmsFilteredOutOfTermCount = Number(built.filteredOutOfTermCount || 0);
            essayTmsHasFetched = true;
            const meta = body.meta || {};
            const loadedMsg = t('classroomEssayTmsSyncLoaded')
                .replace('{assignments}', String(essayTmsPlan.length))
                .replace('{rows}', String(meta.studentRowCount != null ? meta.studentRowCount : 0));
            setEssayTmsStatus(
                essayTmsFilteredOutOfTermCount > 0
                    ? `${loadedMsg} ${t('classroomEssayTmsSyncFilteredOutOfTerm').replace('{count}', String(essayTmsFilteredOutOfTermCount))}`
                    : loadedMsg
            );
            finishLoadUi();
        } catch (err) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('[TMS essay bridge] load failed', err);
            }
            const aborted = err && err.name === 'AbortError';
            const code = err && err.code;
            if (aborted) {
                setEssayTmsError(t('classroomEssayTmsBridgeTimeout'));
            } else if (code === 'TMS_CREDS_MISSING') {
                setEssayTmsError(t('rosterTmsSyncCredsMissing'));
            } else if (code === 'TMS_LOGIN_FAILED' || (err && err.status === 401)) {
                setEssayTmsError(t('rosterTmsSyncLoginFailed'));
            } else if (code === 'TMS_BRIDGE_OUTDATED') {
                setEssayTmsError(t('tmsSyncOutdatedHint'));
            } else if (code === 'TMS_BRIDGE_REQUIRED') {
                setEssayTmsError(t('tmsSyncMissingHint'));
            } else if (isEssayTmsStaleBridgeError(err, null, null)) {
                setEssayTmsError(t('classroomEssayTmsBridgeStaleHint'));
            } else {
                setEssayTmsError((err && err.message) || t('rosterTmsSyncError'));
            }
            setEssayTmsStatus('');
            finishLoadUi();
        }
    }

    async function confirmEssayTmsSync() {
        if (!hooks || !essayTmsPlan.length || essayTmsApplying) {
            return;
        }
        if (hooks.isViewOnly && hooks.isViewOnly()) {
            setEssayTmsError(t('rosterImportReadOnly') || 'Read only');
            return;
        }
        if (!essayTmsPlan.every((r) => planRowResolved(r))) {
            setEssayTmsError(t('classroomEssayTmsSyncUnresolved'));
            return;
        }
        refreshEssayTmsPreviewFromPlan();
        if (!essayTmsStudentsResolved()) {
            enterEssayTmsStudentReview();
            return;
        }
        await finishEssayTmsSyncApply();
    }

    async function finishEssayTmsSyncApply() {
        if (!hooks || !essayTmsPlan.length || essayTmsApplying) {
            return;
        }
        const d = domain();
        const data = getAppData();
        refreshEssayTmsPreviewFromPlan();
        const unmatchedPending = (essayTmsPreview.unmatched || []).filter((u) => u && u.needsReview);
        if (unmatchedPending.length) {
            enterEssayTmsStudentReview();
            return;
        }
        const updates = (essayTmsPreview && essayTmsPreview.updates) || [];
        const dateRefreshes = (essayTmsPreview && essayTmsPreview.dateRefreshes) || [];
        const skipped = (essayTmsPreview && essayTmsPreview.skipped) || [];
        const unmatchedLeft = (essayTmsPreview && essayTmsPreview.unmatched) || [];
        const skippedStudents = skipped.filter((s) => s && s.reason === 'student_skipped').length;

        if (!updates.length && !dateRefreshes.length) {
            setEssayTmsError('');
            const warnMsg =
                skippedStudents > 0 || unmatchedLeft.length > 0
                    ? t('classroomEssayTmsSyncDoneWithWarns')
                          .replace('{updates}', '0')
                          .replace('{skipped}', String(skippedStudents || skipped.length))
                    : t('classroomEssayTmsSyncAlreadyReceived');
            setEssayTmsStatus(warnMsg);
            if (hooks.showToast) {
                hooks.showToast(warnMsg, skippedStudents > 0 || unmatchedLeft.length > 0);
            }
            if (hooks.closeModal) {
                hooks.closeModal(document.getElementById('essayTmsSyncModal'));
            }
            return;
        }

        const result = d.applyTmsEssaySync(data.essaySubmissions, essayTmsPreview, {
            appData: data,
            newStudentId: () => d.newId('stu'),
            planRows: essayTmsPlan
        });
        const refreshedCount = (result.summary && result.summary.refreshedCount) || 0;
        if (!result.summary.appliedCount && !refreshedCount) {
            setEssayTmsError('');
            setEssayTmsStatus(t('classroomEssayTmsSyncAlreadyReceived'));
            if (hooks.showToast) {
                hooks.showToast(t('classroomEssayTmsSyncAlreadyReceived'));
            }
            if (hooks.closeModal) {
                hooks.closeModal(document.getElementById('essayTmsSyncModal'));
            }
            return;
        }
        const nextLinks = d.upsertTmsEssayLinks(data.tmsEssayLinks, essayTmsPlan, data.classes);
        essayTmsApplying = true;
        setEssayTmsStatus(t('classroomEssayTmsSyncSaving'));
        const confirmBtn = document.getElementById('essayTmsSyncConfirmBtn');
        if (confirmBtn) {
            confirmBtn.disabled = true;
        }
        let stillTimer = null;
        try {
            stillTimer = setTimeout(() => {
                if (essayTmsApplying) {
                    setEssayTmsStatus(t('classroomEssayTmsSyncSavingStill'));
                }
            }, ESSAY_TMS_BRIDGE_STILL_LOADING_MS);
            const savePayload = {
                essaySubmissions: result.essaySubmissions,
                tmsEssayLinks: nextLinks
            };
            if (result.cohorts) {
                savePayload.cohorts = result.cohorts;
            }
            const saveResult = await hooks.saveClassroom(savePayload);
            if (hooks.hasTeamSync && hooks.hasTeamSync() && saveResult == null) {
                setEssayTmsError(t('classroomEssayTmsSyncSaveFailed'));
                return;
            }
            let toast = t('classroomEssayTmsSyncAlreadyReceived');
            if (result.summary.appliedCount) {
                toast = t('classroomEssayTmsSyncApplied').replace(
                    '{count}',
                    String(result.summary.appliedCount)
                );
                if (skippedStudents > 0) {
                    toast = t('classroomEssayTmsSyncAppliedWithWarns')
                        .replace('{count}', String(result.summary.appliedCount))
                        .replace('{skipped}', String(skippedStudents));
                }
            }
            if (hooks.showToast) {
                hooks.showToast(toast, skippedStudents > 0);
            }
            if (hooks.closeModal) {
                hooks.closeModal(document.getElementById('essayTmsSyncModal'));
            }
            loadSubmission();
            const panel = document.getElementById('panel-essays');
            render(panel);
        } catch (err) {
            setEssayTmsError((err && err.message) || t('classroomEssaySaveError'));
        } finally {
            if (stillTimer) {
                clearTimeout(stillTimer);
                stillTimer = null;
            }
            essayTmsApplying = false;
            setEssayTmsStatus('');
            if (confirmBtn) {
                confirmBtn.disabled = false;
            }
            renderEssayTmsPreview();
        }
    }

    function essayTmsSkipAll() {
        essayTmsPlan.forEach((row) => {
            row.userAction = 'skip';
            row.userClassId = '';
            row.userSyllabusRowId = '';
            row.remembered = false;
        });
        renderEssayTmsPreview();
    }

    function essayTmsSkipUnmapped() {
        essayTmsPlan.forEach((row) => {
            if (!planRowResolved(row) || row.userAction === 'choose') {
                row.userAction = 'skip';
                row.userClassId = '';
                row.userSyllabusRowId = '';
                row.remembered = false;
            }
        });
        renderEssayTmsPreview();
    }

    function essayTmsAcceptSuggested() {
        essayTmsPlan.forEach((row) => {
            if (row.userAction === 'skip') {
                return;
            }
            if (row.suggestedClassId && row.suggestedSyllabusRowId) {
                row.userAction = 'map';
                row.userClassId = row.suggestedClassId;
                row.userSyllabusRowId = row.suggestedSyllabusRowId;
                row.remembered = false;
            }
        });
        renderEssayTmsPreview();
    }

    function bindEssayTmsSyncUi() {
        if (essayTmsBound) {
            return;
        }
        essayTmsBound = true;
        document.getElementById('classroomEssaysTmsSyncBtn')?.addEventListener('click', () => {
            if (global.CCPTmsSyncCenter && global.CCPTmsSyncCenter.open) {
                void global.CCPTmsSyncCenter.open({
                    kinds: ['essays'],
                    scope: { mode: 'class', classId: classId }
                });
                return;
            }
            openEssayTmsSyncModal(classId);
        });
        document.getElementById('classroomEssaysTmsSyncAllBtn')?.addEventListener('click', () => {
            if (global.CCPTmsSyncCenter && global.CCPTmsSyncCenter.open) {
                void global.CCPTmsSyncCenter.open({ kinds: ['essays'], scope: {} });
                return;
            }
            openEssayTmsSyncModal('');
        });
        document.getElementById('essayTmsLoadBtn')?.addEventListener('click', () => {
            void loadEssayTmsPreview();
        });
        document.getElementById('essayTmsPassword')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void loadEssayTmsPreview();
            }
        });
        document.getElementById('essayTmsSyncConfirmBtn')?.addEventListener('click', () => {
            void confirmEssayTmsSync();
        });
        document.getElementById('essayTmsStudentReviewBackBtn')?.addEventListener('click', () => {
            essayTmsStudentReviewBack();
        });
        document.getElementById('essayTmsStudentReviewNextBtn')?.addEventListener('click', () => {
            essayTmsStudentReviewNext();
        });
        document.getElementById('essayTmsSyncSkipAllBtn')?.addEventListener('click', () => {
            essayTmsSkipAll();
        });
        document.getElementById('essayTmsSyncSkipUnmappedBtn')?.addEventListener('click', () => {
            essayTmsSkipUnmapped();
        });
        document.getElementById('essayTmsSyncAcceptSuggestedBtn')?.addEventListener('click', () => {
            essayTmsAcceptSuggested();
        });
        document.getElementById('cancelEssayTmsSyncBtn')?.addEventListener('click', () => {
            if (hooks && hooks.closeModal) {
                hooks.closeModal(document.getElementById('essayTmsSyncModal'));
            }
        });
        document.getElementById('closeEssayTmsSyncModal')?.addEventListener('click', () => {
            if (hooks && hooks.closeModal) {
                hooks.closeModal(document.getElementById('essayTmsSyncModal'));
            }
        });
    }

    async function initTab(h, options) {
        hooks = h;
        await flushBeforeLeave();
        bindEssayTmsSyncUi();
        if (global.CCPClassroomEssayScrapeEditor && typeof global.CCPClassroomEssayScrapeEditor.init === 'function') {
            global.CCPClassroomEssayScrapeEditor.init(
                Object.assign({}, hooks, {
                    refreshEssaysSheet() {
                        loadSubmission();
                        const panel = document.getElementById('panel-essays');
                        if (panel) {
                            render(panel);
                        }
                    }
                })
            );
        }
        const data = getAppData();
        const d = domain();
        const visible = getEssayPickerClasses();
        if (typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.resolveActiveClassId) {
            classId = global.CCPActiveContext.resolveActiveClassId(data, {
                classId: options && options.classId,
                visibleClasses: visible
            });
        } else {
            classId =
                (options && options.classId) ||
                (data.ui && data.ui.classroomTabClassId) ||
                (visible[0] && visible[0].id) ||
                '';
        }
        lessonDate = (data.ui && data.ui.classroomTabDate) || (d ? d.todayISO() : '');
        currentFilter = 'all';
        selectedStudentIds.clear();
        resubmitDayNoteDirty = false;
        applyResolvedAssignment(getClassData());
        loadSubmission();
        bindProgressReportModal();
        bindClassSummaryModal();
        bindAddAssignmentModal();
        bindEssayGroupModal();
        bindResubmitSummaryModal();
        ensureClassVisibleAfterFilter(document.getElementById('panel-essays'), { silent: true });
        const panel = document.getElementById('panel-essays');
        render(panel);
        if (typeof global.CCPActiveContext !== 'undefined' && !initTab._subscribed) {
            initTab._subscribed = true;
            global.CCPActiveContext.subscribe((detail) => {
                if (detail && detail.classId !== undefined) {
                    void onActiveContextChange();
                }
            });
        }
        if (!initTab._assignmentSubscribed) {
            initTab._assignmentSubscribed = true;
            if (global.CCPAssignments && global.CCPAssignments.subscribe) {
                global.CCPAssignments.subscribe(onSharedAssignmentChanged);
            }
            if (typeof global.addEventListener === 'function') {
                global.addEventListener('ccp:essayNewCustomAssignment', () => {
                    const essaysPanel = panelRef || document.getElementById('panel-essays');
                    if (essaysPanel && !essaysPanel.hidden) {
                        openAddAssignmentModal(essaysPanel);
                    }
                });
            }
        }
    }

    function onSharedAssignmentChanged(detail) {
        if (!detail || detail.kind !== 'essay' || !detail.id || detail.classId !== classId) {
            return;
        }
        const essaysPanel = panelRef || document.getElementById('panel-essays');
        if (!essaysPanel || essaysPanel.hidden || detail.id === syllabusRowId) {
            return;
        }
        const d = domain();
        const classData = getClassData();
        const row = classData && d
            ? d.getEssayRowsFromSyllabus(classData.syllabusRows, { classData }).find(
                  (r) => d.getSyllabusRowKey(r) === detail.id
              )
            : null;
        void selectAssignment(essaysPanel, detail.id, row ? row.date || '' : '');
    }

    const ESSAY_STATUS_PING_KEY = 'ccp-essay-status-ping';

    function applyEssayStatusPing(raw) {
        let ping = raw;
        if (typeof raw === 'string') {
            try {
                ping = JSON.parse(raw);
            } catch (_) {
                return;
            }
        }
        if (!ping || !ping.classId || !ping.syllabusRowId || !ping.studentId || !ping.status) {
            return;
        }
        const d = domain();
        const data = getAppData();
        if (d && data && Array.isArray(data.essaySubmissions) && typeof d.setEssayStudentStatus === 'function') {
            const result = d.setEssayStudentStatus(data.essaySubmissions, {
                classId: ping.classId,
                syllabusRowId: ping.syllabusRowId,
                studentId: ping.studentId,
                status: ping.status,
                timing: ping.submissionLate ? 'late' : 'on_time',
                retestAssigned: ping.retestAssigned,
                retestPassed: ping.retestPassed,
                submittedRetest: ping.submittedRetest
            });
            if (!result.error) {
                data.essaySubmissions = result.submissions;
            }
        }
        if (ping.noteUpdated && d && data && typeof d.setEssayStudentNote === 'function') {
            const noted = d.setEssayStudentNote(data.essaySubmissions, {
                classId: ping.classId,
                syllabusRowId: ping.syllabusRowId,
                studentId: ping.studentId,
                note: ping.note
            });
            if (!noted.error) {
                data.essaySubmissions = noted.submissions;
            }
        }
        if (
            !draftSubmission ||
            draftSubmission.classId !== ping.classId ||
            draftSubmission.syllabusRowId !== ping.syllabusRowId
        ) {
            return;
        }
        const patch = {
            status: ping.status,
            retestAssigned: ping.status === 'demerit' && Boolean(ping.retestAssigned),
            retestPassed: ping.status === 'demerit' && Boolean(ping.retestPassed),
            submittedRetest: ping.status === 'resubmit_required' && Boolean(ping.submittedRetest),
            submissionLate: Boolean(ping.submissionLate)
        };
        if (ping.overdueDismissed != null) {
            patch.overdueDismissed = Boolean(ping.overdueDismissed);
        }
        if (ping.noteUpdated) {
            patch.note = ping.note == null ? '' : String(ping.note);
        }
        setRecord(ping.studentId, patch);
        const panel = document.getElementById('panel-essays');
        if (!panel) {
            return;
        }
        renderStatsBar(panel);
        renderContextBar(panel);
        if (studentMatchesFilter(ping.studentId)) {
            updateEssayRow(panel, ping.studentId);
        } else {
            renderRows(panel);
        }
        if (ping.noteUpdated) {
            applyEssayNotePingToField(panel, ping.studentId, patch.note);
        }
        refreshZoneContextBar();
    }

    function applyEssayNotePingToField(panel, studentId, note) {
        const rowsMount = panel && panel.querySelector('#classroomEssaysRows');
        if (!rowsMount || !studentId) {
            return;
        }
        const safeId =
            typeof CSS !== 'undefined' && CSS.escape
                ? CSS.escape(studentId)
                : String(studentId).replace(/"/g, '\\"');
        const noteInput = rowsMount.querySelector(
            `tr.classroom-essay-row[data-student-id="${safeId}"] .classroom-essay-note`
        );
        if (!noteInput || document.activeElement === noteInput) {
            return;
        }
        noteInput.value = note == null ? '' : String(note);
    }

    let essayNotePingTimer = null;
    let essayNotePingStudentId = '';

    function pingEssayNote(studentId) {
        if (!draftSubmission || !studentId) {
            return;
        }
        const rec = getRecord(studentId);
        if (!rec) {
            return;
        }
        try {
            localStorage.setItem(ESSAY_STATUS_PING_KEY, JSON.stringify({
                classId: draftSubmission.classId,
                syllabusRowId: draftSubmission.syllabusRowId,
                studentId,
                status: rec.status,
                retestAssigned: rec.retestAssigned,
                retestPassed: rec.retestPassed,
                submittedRetest: rec.submittedRetest,
                submissionLate: rec.submissionLate,
                overdueDismissed: rec.overdueDismissed,
                noteUpdated: true,
                note: rec.note || '',
                at: Date.now()
            }));
        } catch (_) {
            /* ignore */
        }
    }

    function scheduleEssayNotePing(studentId) {
        essayNotePingStudentId = studentId;
        if (essayNotePingTimer) {
            clearTimeout(essayNotePingTimer);
        }
        essayNotePingTimer = setTimeout(() => {
            essayNotePingTimer = null;
            pingEssayNote(essayNotePingStudentId);
        }, 400);
    }

    function flushEssayNotePing() {
        if (!essayNotePingTimer) {
            return;
        }
        clearTimeout(essayNotePingTimer);
        essayNotePingTimer = null;
        pingEssayNote(essayNotePingStudentId);
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('storage', (event) => {
            if (!event || event.key !== ESSAY_STATUS_PING_KEY || !event.newValue) {
                return;
            }
            applyEssayStatusPing(event.newValue);
        });
    }

    function applyBatchStatusToRecords(records, studentIds, action, status, setRetest) {
        const idSet = new Set(studentIds);
        return records.map((rec) => {
            if (!idSet.has(rec.studentId)) {
                return rec;
            }
            return applyStagedBatchToRecord(rec, action, status, setRetest);
        });
    }

    function ensureSyncUi(h) {
        if (h) {
            hooks = h;
        }
        bindEssayTmsSyncUi();
    }

    async function loadTmsPreview(creds, options) {
        if (options && Object.prototype.hasOwnProperty.call(options, 'classId')) {
            essayTmsFilterClassId = options.classId || '';
        }
        if (creds && (creds.username || creds.password)) {
            /* Center credentials are read by readEssayTmsCreds. */
        }
        return loadEssayTmsPreview();
    }

    global.CCPClassroomEssays = {
        initTab,
        render,
        ensureSyncUi,
        loadTmsPreview,
        flushBeforeLeave,
        isReceivedStatus,
        applyStagedBatchToRecord,
        applyBatchStatusToRecords,
        essayStatsSegmentFlex,
        recordAffectsResubmitDayNote,
        ESSAY_AUTOSAVE_DELAY_MS,
        resolveEssayAssignmentForClass,
        rowExistsInClass,
        getSavedEssayAssignmentId,
        persistEssayAssignmentForClass,
        studentMatchesFilter,
        buildDueCell,
        buildStatusCell,
        getAttentionCounts
    };
})(typeof window !== 'undefined' ? window : globalThis);
