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
    let resubmitDayNoteDirty = false;
    let resubmitDayNoteSyncInFlight = false;
    let essayClassSearchQuery = '';
    let essayClassAttentionFilter = 'all';
    let classPickerOpen = false;
    let reportsMenuOpen = false;
    const resubmitSummarySelectedClassIds = new Set();
    let resubmitSummaryFilters = {
        search: '',
        classTypeId: '',
        grade: '',
        levelLabel: '',
        subject: '',
        myClassesOnly: false,
        hasResubmitsOnly: true
    };
    let noteDebouncedSave = null;

    const ESSAY_STATUS_META = {
        not_submitted: { order: 0, cls: 'essay-status--not' },
        submitted: { order: 1, cls: 'essay-status--submitted' },
        complete: { order: 2, cls: 'essay-status--complete' },
        resubmit_required: { order: 2, cls: 'essay-status--resubmit' }
    };

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
        return (data.classes || []).find((c) => c && c.id === classId) || null;
    }

    function getStudents() {
        const d = domain();
        const data = getAppData();
        return d ? d.resolveStudentsForClass(getClassData(), data.cohorts) : [];
    }

    function getAccessibleClasses() {
        const data = getAppData();
        let classes = (data.classes || []).filter(
            (c) => c && (!access() || access().canEditClass(c) || access().canBypass())
        );
        if (global.CCPCohortSidebarFilter) {
            classes = global.CCPCohortSidebarFilter.filterClassesByCohort(
                classes,
                global.CCPCohortSidebarFilter.getActiveCohortId()
            );
        }
        return classes;
    }

    function getEssayVisibleClasses() {
        // Do NOT rely on CCPClassroomZoneContext here.
        // In production the zone context is not active for Essays, so its internal activeTabId
        // may not be 'essays' and non-essay classes can leak into the Essays tab/report flows.
        const base = getAccessibleClasses();
        const api = global.CCPEssayClassFilter;
        const d = domain();
        // Essays is always teacher-scoped: only the current teacher's classes should appear.
        const myClassesOnly = true;
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
            return api.filterClassesForZoneContext(base, { myClassesOnly, essaysOnly: true }, ctx);
        }
        if (api && typeof api.classHasEssayAssignments === 'function') {
            const filtered = base.filter((c) => api.classHasEssayAssignments(c, d));
            return myClassesOnly && ctx.deps.classIsMine
                ? filtered.filter((c) => ctx.deps.classIsMine(c, ctx.currentUserId))
                : filtered;
        }
        if (d && typeof d.getEssayRowsFromSyllabus === 'function') {
            const filtered = base.filter((c) => d.getEssayRowsFromSyllabus(c && c.syllabusRows).length > 0);
            return myClassesOnly && ctx.deps.classIsMine
                ? filtered.filter((c) => ctx.deps.classIsMine(c, ctx.currentUserId))
                : filtered;
        }
        return base;
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

    function getEssayAssignmentMap() {
        const data = getAppData();
        if (!data.ui) {
            data.ui = {};
        }
        if (!data.ui.essayAssignmentByClassId || typeof data.ui.essayAssignmentByClassId !== 'object') {
            data.ui.essayAssignmentByClassId = {};
        }
        return data.ui.essayAssignmentByClassId;
    }

    function rowExistsInClass(classData, rowId) {
        const d = domain();
        if (!classData || !d || !rowId) {
            return false;
        }
        return d
            .getEssayRowsFromSyllabus(classData.syllabusRows)
            .some((r) => d.getSyllabusRowKey(r) === rowId);
    }

    function resolveEssayAssignmentForClass(classData) {
        const d = domain();
        if (!classData || !d) {
            return null;
        }
        const map = getEssayAssignmentMap();
        const savedId = map[classData.id] || '';
        if (savedId && rowExistsInClass(classData, savedId)) {
            return d
                .getEssayRowsFromSyllabus(classData.syllabusRows)
                .find((r) => d.getSyllabusRowKey(r) === savedId);
        }
        return d.pickDefaultEssaySyllabusRow(classData, lessonDate || d.todayISO());
    }

    function persistEssayAssignmentForClass(cId, rowId) {
        const map = getEssayAssignmentMap();
        map[cId] = rowId;
        if (hooks && hooks.setUiPref) {
            hooks.setUiPref('classroomTabEssaySyllabusRowId', rowId);
        }
        if (typeof global.saveUiStateToLocalStorage === 'function') {
            global.saveUiStateToLocalStorage();
        }
    }

    function applyResolvedAssignment(classData) {
        const d = domain();
        const row = resolveEssayAssignmentForClass(classData);
        if (row && d) {
            syllabusRowId = d.getSyllabusRowKey(row);
            lessonDate = row.date || '';
        } else {
            syllabusRowId = '';
        }
    }

    function ensureClassVisibleAfterFilter(panel, options) {
        const silent = options && options.silent;
        const zone = global.CCPClassroomZoneContext;
        if (zone && zone.ensureActiveClassVisible) {
            const switched = zone.ensureActiveClassVisible();
            if (switched) {
                syncClassIdFromContext();
                applyResolvedAssignment(getClassData());
                selectedStudentIds.clear();
                loadSubmission();
                if (!silent && panel && hooks && hooks.showToast) {
                    const cls = getClassData();
                    hooks.showToast(tf('essayClassFilterSwitchedClass', { name: (cls && cls.name) || classId }));
                }
                return true;
            }
        }
        return false;
    }

    function getAssignmentLabelForCurrent() {
        const classData = getClassData();
        const d = domain();
        if (!classData || !d || !syllabusRowId) {
            return '';
        }
        const row = d
            .getEssayRowsFromSyllabus(classData.syllabusRows)
            .find((r) => d.getSyllabusRowKey(r) === syllabusRowId);
        if (!row) {
            return '';
        }
        return `${row.date || ''} — ${row.planTitle || row.planDetail || ''}`.trim();
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
            generatedAt: t('classroomEssayProgressGeneratedAt'),
            overdue: t('classroomEssayProgressOverdue')
        };
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
                    return `<tr>
                        <td>${escapeHtml(row.studentName || '')}</td>
                        <td>${escapeHtml(note)}</td>
                        <td>${retest}</td>
                    </tr>`;
                }
                const overdue =
                    row.ssOverdue
                        ? ` <span class="classroom-essay-progress-overdue-chip">${escapeHtml(t('classroomEssayProgressOverdue'))}</span>`
                        : '';
                return `<tr><td colspan="3">${escapeHtml(row.studentName || '')}${overdue}</td></tr>`;
            })
            .join('');
        const isResubmit = students[0] && students[0].status === 'resubmit_required';
        const tableHead = isResubmit
            ? `<thead><tr>
                <th>${escapeHtml(t('classroomEssayResubmitColStudent'))}</th>
                <th>${escapeHtml(t('classroomEssayResubmitColNote'))}</th>
                <th>${escapeHtml(t('classroomEssayResubmitColRetest'))}</th>
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

    function getSelectedProgressAssignments() {
        const progressApi = global.CCPClassroomEssayProgress;
        if (!progressApi) {
            return [];
        }
        const all = listProgressAssignments();
        if (!progressReportSelectedKeys.size) {
            return progressApi.filterAssignments(all, {
                outstandingOnly: progressReportOutstandingOnly
            });
        }
        return progressApi.filterAssignments(all, {
            selectedKeys: progressReportSelectedKeys,
            outstandingOnly: progressReportOutstandingOnly
        });
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
        const title = labels.title;
        const inlineCss = printApi.PRINT_STYLES || '';
        const appStyles =
            typeof document !== 'undefined'
                ? Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                    .map((link) => link.href)
                    .filter(Boolean)[0] || 'styles.css'
                : 'styles.css';
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
            <link rel="stylesheet" href="${escapeAttr(appStyles)}">
            <style>${inlineCss}</style>
        </head><body class="print-color-mode-light">${bodyHtml}</body></html>`;
        const printWin = window.open('', '_blank');
        if (!printWin) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('printSyllabusBlocked'), true);
            }
            return;
        }
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.document.title = title;
        printWin.focus();
        printWin.print();
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
        const assignments = listProgressAssignments();
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
            listProgressAssignments().forEach((row) => progressReportSelectedKeys.add(row.key));
            saveProgressReportSelection();
            renderProgressReportModal();
        });
        document.getElementById('essayProgressClearAll')?.addEventListener('click', () => {
            progressReportSelectedKeys.clear();
            saveProgressReportSelection();
            renderProgressReportModal();
        });
        document.getElementById('essayProgressPendingOnly')?.addEventListener('change', (e) => {
            progressReportOutstandingOnly = !!e.target.checked;
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

    function getResubmitPrintLabels() {
        return {
            title: t('classroomEssayResubmitSummaryTitle'),
            noRows: t('classroomEssayResubmitNoRows'),
            noReason: t('classroomEssayResubmitNoReason'),
            retestReceived: t('classroomEssayResubmitRetestReceived'),
            generatedAt: t('classroomEssayResubmitGeneratedAt')
        };
    }

    function openResubmitPrint(rows) {
        const printApi = global.CCPClassroomEssayResubmitPrint;
        const d = domain();
        if (!printApi || !d || !d.groupEssayStudentRowsByClass) {
            return;
        }
        if (!rows.length) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomEssayResubmitNoRows'), true);
            }
            return;
        }
        const groups = d.groupEssayStudentRowsByClass(rows);
        const labels = getResubmitPrintLabels();
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
        const appStyles =
            typeof document !== 'undefined'
                ? Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                    .map((link) => link.href)
                    .filter(Boolean)[0] || 'styles.css'
                : 'styles.css';
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
            <link rel="stylesheet" href="${escapeAttr(appStyles)}">
            <style>${inlineCss}</style>
        </head><body class="print-color-mode-light">${bodyHtml}</body></html>`;
        const printWin = window.open('', '_blank');
        if (!printWin) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('printSyllabusBlocked'), true);
            }
            return;
        }
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.document.title = title;
        printWin.focus();
        printWin.print();
    }

    function printCurrentClassResubmits() {
        const d = domain();
        if (!d || !classId) {
            return;
        }
        const rows = d.listEssayResubmitRows(getAppData(), {
            classes: getAccessibleClasses(),
            classId
        });
        openResubmitPrint(rows);
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
                myClassesOnly: resubmitSummaryFilters.myClassesOnly,
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
        const allRows = api.listResubmitRows(getAppData(), { classes: getEssayVisibleClasses() });
        return api.filterResubmitRows(allRows, { selectedClassIds: resubmitSummarySelectedClassIds });
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
        resubmitSummaryFilters.myClassesOnly = !!modal.querySelector('#essayResubmitMyClassesOnly')?.checked;
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
            const myCb = modal.querySelector('#essayResubmitMyClassesOnly');
            if (myCb) {
                myCb.checked = resubmitSummaryFilters.myClassesOnly;
            }
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
            resubmitSummarySelectedClassIds.clear();
            saveResubmitSummaryFilters();
            renderResubmitSummaryModal();
        });
        modal.querySelector('#essayResubmitClassSearch')?.addEventListener('input', (e) => {
            resubmitSummaryFilters.search = e.target.value;
            saveResubmitSummaryFilters();
            renderResubmitSummaryModal();
        });
        ['#essayResubmitClassTypeFilter', '#essayResubmitGradeFilter', '#essayResubmitLevelFilter', '#essayResubmitSubjectFilter'].forEach(
            (selector) => {
                modal.querySelector(selector)?.addEventListener('change', () => {
                    syncResubmitFiltersFromModal();
                    renderResubmitSummaryModal();
                });
            }
        );
        modal.querySelector('#essayResubmitMyClassesOnly')?.addEventListener('change', () => {
            syncResubmitFiltersFromModal();
            renderResubmitSummaryModal();
        });
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
            return { overdueSub: 0, evalOverdue: 0, resubmit: 0 };
        }
        const ssDue = draftSubmission.ssDueDate || '';
        const teDue = draftSubmission.teacherEvalDueDate || '';
        const overdueSub = d.essayOverdueNotSubmittedCount(draftSubmission, ssDue, students.length);
        let evalOverdue = 0;
        if (d.isEssayTeacherEvalOverdue(draftSubmission, teDue)) {
            evalOverdue = d.essayPendingTeacherEvalCount(draftSubmission);
        }
        const resubmit = d.essayResubmitCount(draftSubmission);
        return { overdueSub, evalOverdue, resubmit };
    }

    function studentMatchesFilter(studentId) {
        const d = domain();
        const rec = getRecord(studentId);
        const status = rec ? rec.status : 'not_submitted';
        if (currentFilter === 'all') {
            return true;
        }
        if (currentFilter === 'overdue_sub') {
            const ssDue = draftSubmission ? draftSubmission.ssDueDate || '' : '';
            return status === 'not_submitted' && d && d.isEssaySsOverdueISO(ssDue);
        }
        if (currentFilter === 'eval_overdue') {
            const teDue = draftSubmission ? draftSubmission.teacherEvalDueDate || '' : '';
            return status === 'submitted' && d && d.isEssaySsOverdueISO(teDue);
        }
        return status === currentFilter;
    }

    function filterClassesForAttention(classes) {
        const d = domain();
        const data = getAppData();
        const ui = getAppData().ui || {};
        const myClassesOnly =
            ui.classroomZoneMyClassesOnly === true || ui.classroomZoneMyClassesOnly === '1';
        const currentUserId = hooks && hooks.getCurrentUserId ? hooks.getCurrentUserId() : '';

        return (classes || []).filter((c) => {
            if (!c) {
                return false;
            }
            const counts =
                d && c
                    ? d.essayAlertCountsForClass(data.essaySubmissions, c, data.cohorts || [])
                    : { rs: 0, od: 0 };
            if (essayClassAttentionFilter === 'resubmits' && !(counts.rs > 0)) {
                return false;
            }
            if (essayClassAttentionFilter === 'overdue' && !(counts.od > 0)) {
                return false;
            }
            if (essayClassAttentionFilter === 'mine') {
                const teachers = Array.isArray(c.teacherIds) ? c.teacherIds : [];
                if (currentUserId && teachers.length && !teachers.includes(currentUserId)) {
                    return false;
                }
            }
            return true;
        });
    }

    function closeClassPicker() {
        classPickerOpen = false;
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
        const lesson = normalizeStr(row.date);
        return {
            ssDueDate: lesson,
            teacherEvalDueDate: lesson ? d.addDaysISO(lesson, 2) : ''
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
            d.getEssayRowsFromSyllabus(classData.syllabusRows).find((r) => d.getSyllabusRowKey(r) === syllabusRowId);
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
        if (!base.ssDueDate && defaults.ssDueDate) {
            base.ssDueDate = defaults.ssDueDate;
        }
        if (!base.teacherEvalDueDate && defaults.teacherEvalDueDate) {
            base.teacherEvalDueDate = defaults.teacherEvalDueDate;
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
            : { studentId, status: 'not_submitted', submittedRetest: false, note: '' };
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
                note: rec.note || ''
            }))
        });
    }

    function getEssayStatusCounts() {
        const d = domain();
        const students = getStudents();
        const counts = d && draftSubmission
            ? d.countEssayByStatus(draftSubmission)
            : { not_submitted: 0, submitted: 0, complete: 0, resubmit_required: 0 };
        return Object.assign({ total: students.length }, counts);
    }

    function isReceivedStatus(status) {
        return status === 'submitted' || status === 'complete' || status === 'resubmit_required';
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

    function ensureEssaysOnlyDefault() {
        const ui = getAppData().ui || {};
        if (
            ui.classroomZoneEssaysOnly !== true &&
            ui.classroomZoneEssaysOnly !== '1' &&
            ui.classroomZoneEssaysOnly !== false &&
            ui.classroomZoneEssaysOnly !== '0'
        ) {
            if (hooks && hooks.setUiPref) {
                hooks.setUiPref('classroomZoneEssaysOnly', '1');
            }
        }
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
        if (!d.isEssayTeacherEvalOverdue(submission, isoDate)) {
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
        if (zone && zone.render && mount) {
            zone.render(mount);
        }
    }

    function buildAlertBadgesHtml(rs, od) {
        const parts = [];
        if (rs > 0) {
            parts.push(
                `<span class="classroom-essay-alert-badge classroom-essay-alert-rs">${escapeHtml(tf('classroomEssayAlertRs', { count: rs }))}</span>`
            );
        }
        if (od > 0) {
            parts.push(
                `<span class="classroom-essay-alert-badge classroom-essay-alert-od">${escapeHtml(tf('classroomEssayAlertOd', { count: od }))}</span>`
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

    async function selectClass(panel, nextClassId) {
        if (!nextClassId || nextClassId === classId) {
            closeClassPicker();
            return;
        }
        await flushBeforeLeave();
        closeClassPicker();
        if (typeof global.CCPActiveContext !== 'undefined') {
            global.CCPActiveContext.set({ classId: nextClassId }, { source: 'essays-class-picker' });
        } else if (hooks && hooks.setUiPref) {
            hooks.setUiPref('classroomTabClassId', nextClassId);
            classId = nextClassId;
            applyResolvedAssignment(getClassData());
            selectedStudentIds.clear();
            loadSubmission();
            render(panel);
        }
    }

    function filterEssayClassesForSearch(classes, query, selectedClassId) {
        const zone = global.CCPClassroomZoneContext;
        if (zone && zone.filterClassesForSearch) {
            return zone.filterClassesForSearch(classes, query, selectedClassId);
        }
        const q = (query || '').trim().toLowerCase();
        if (!q) {
            return classes;
        }
        return classes.filter((c) => {
            const haystack = [
                c && c.name,
                c && c.id,
                c && c.grade,
                c && c.levelPreset,
                c && c.levelCustom,
                c && c.subject
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(q);
        });
    }

    function renderClassPickerPopover(panel) {
        const mount = panel.querySelector('#classroomEssaysContextBar');
        if (!mount) {
            return;
        }
        const classData = getClassData();
        const d = domain();
        const data = getAppData();
        const currentCounts =
            classData && d
                ? d.essayAlertCountsForClass(data.essaySubmissions, classData, data.cohorts || [])
                : { rs: 0, od: 0 };
        const currentName = classData ? classData.name || classData.id || '' : '';
        const currentBadges = buildAlertBadgesHtml(currentCounts.rs || 0, currentCounts.od || 0);

        const chip = (filter, labelKey) => {
            const active = essayClassAttentionFilter === filter ? ' is-active' : '';
            return `<button type="button" class="classroom-essay-class-filter-chip${active}" data-class-filter="${escapeAttr(filter)}">${escapeHtml(t(labelKey))}</button>`;
        };

        const classes = filterClassesForAttention(
            filterEssayClassesForSearch(getEssayVisibleClasses(), essayClassSearchQuery, classId)
        );

        const listHtml = classes.length
            ? classes
                .map((c) => {
                    const selected = c.id === classId ? ' is-selected' : '';
                    const label = c.name || c.id || '';
                    const counts =
                        d && c
                            ? d.essayAlertCountsForClass(data.essaySubmissions, c, data.cohorts || [])
                            : { rs: 0, od: 0 };
                    const rs = counts.rs || 0;
                    const od = counts.od || 0;
                    const badgeHtml =
                        rs > 0 || od > 0
                            ? buildAlertBadgesHtml(rs, od)
                            : `<span class="classroom-essay-class-clear section-hint">${escapeHtml(t('classroomEssayClassClear'))}</span>`;
                    return `<button type="button" class="module-list-item classroom-essay-class-picker-item${selected}" role="option" aria-selected="${c.id === classId ? 'true' : 'false'}" data-class-id="${escapeAttr(c.id)}">
                        <span class="classroom-essay-class-picker-item__label">${escapeHtml(label)}</span>
                        <span class="classroom-essay-class-picker-item__badges">${badgeHtml}</span>
                    </button>`;
                })
                .join('')
            : `<p class="section-hint classroom-essay-class-picker-empty">${escapeHtml(t('classroomEssayClassComboboxEmpty'))}</p>`;

        const pickerPopover = classPickerOpen
            ? `<div id="classroomEssaysClassPickerPopover" class="classroom-essay-class-picker__popover lesson-filter-popover lesson-filter-popover-panel" role="dialog" aria-label="${escapeAttr(t('classroomEssaySidebarClassTitle'))}">
                <input type="search" id="classroomEssaysClassSearch" class="field-input module-list-search" autocomplete="off" spellcheck="false" value="${escapeAttr(essayClassSearchQuery)}" placeholder="${escapeAttr(t('classListSearchPlaceholder'))}" data-i18n-placeholder="classListSearchPlaceholder" />
                <div class="classroom-essay-class-filter-chips" role="group">
                    ${chip('all', 'classroomEssayFilterAll')}
                    ${chip('resubmits', 'classroomEssayClassFilterResubmits')}
                    ${chip('overdue', 'classroomEssayClassFilterOverdue')}
                    ${chip('mine', 'classroomZoneMyClassesOnly')}
                </div>
                <div id="classroomEssaysClassList" class="module-list classroom-essay-class-picker-list" role="listbox">${listHtml}</div>
            </div>`
            : '';

        const pickerField = mount.querySelector('.classroom-essay-class-picker');
        if (pickerField) {
            const trigger = pickerField.querySelector('#classroomEssaysClassPickerTrigger');
            if (trigger) {
                trigger.querySelector('.classroom-essay-class-picker__name').textContent = currentName;
                const badgesEl = trigger.querySelector('.classroom-essay-class-picker__badges');
                if (badgesEl) {
                    badgesEl.innerHTML = currentBadges;
                }
                trigger.setAttribute('aria-expanded', classPickerOpen ? 'true' : 'false');
                if (!trigger.dataset.bound) {
                    trigger.dataset.bound = '1';
                    trigger.addEventListener('click', (e) => {
                        e.stopPropagation();
                        classPickerOpen = !classPickerOpen;
                        renderContextBar(panel);
                    });
                }
            }
            const existingPopover = pickerField.querySelector('#classroomEssaysClassPickerPopover');
            if (existingPopover) {
                existingPopover.remove();
            }
            if (pickerPopover) {
                pickerField.insertAdjacentHTML('beforeend', pickerPopover);
            }
        }

        mount.querySelector('#classroomEssaysClassSearch')?.addEventListener('input', (e) => {
            essayClassSearchQuery = e.target.value || '';
            renderClassPickerPopover(panel);
        });

        mount.querySelectorAll('[data-class-filter]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const next = btn.getAttribute('data-class-filter') || 'all';
                essayClassAttentionFilter = next;
                if (next === 'mine' && hooks && hooks.setUiPref) {
                    hooks.setUiPref('classroomZoneMyClassesOnly', '1');
                }
                renderClassPickerPopover(panel);
            });
        });

        mount.querySelectorAll('[data-class-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-class-id') || '';
                if (id) {
                    void selectClass(panel, id);
                }
            });
        });
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
            const picker = panel.querySelector('.classroom-essay-class-picker');
            const reports = panel.querySelector('.classroom-essay-reports-menu');
            if (classPickerOpen && picker && !picker.contains(e.target)) {
                closeClassPicker();
                renderContextBar(panel);
            }
            if (reportsMenuOpen && reports && !reports.contains(e.target)) {
                closeReportsMenu();
                renderReportsMenu(panel);
            }
        });
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
            if (target.id === 'classroomEssaysAssignmentSelect') {
                const opt = target.selectedOptions && target.selectedOptions[0];
                const rowId = target.value || '';
                const date = opt ? opt.getAttribute('data-lesson-date') || '' : '';
                if (rowId && rowId !== syllabusRowId) {
                    void selectAssignment(panel, rowId, date);
                }
            }
            if (target.id === 'classroomEssaysSsDue' && draftSubmission) {
                draftSubmission.ssDueDate = target.value;
                scheduleSave();
                renderStatsBar(panel);
                renderRows(panel);
            }
            if (target.id === 'classroomEssaysTeacherEvalDue' && draftSubmission) {
                draftSubmission.teacherEvalDueDate = target.value;
                scheduleSave();
                renderStatsBar(panel);
                renderRows(panel);
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

        const assignments =
            classData && d ? d.listEssayAssignmentsForClass(classData, getAppData()) : [];
        const assignmentOpts = assignments.length
            ? assignments
                .map((row) => {
                    const sel = row.syllabusRowId === syllabusRowId ? ' selected' : '';
                    const label = row.assignmentLabel || '';
                    return `<option value="${escapeAttr(row.syllabusRowId)}" data-lesson-date="${escapeAttr(row.lessonDate || '')}"${sel}>${escapeHtml(label)}</option>`;
                })
                .join('')
            : `<option value="">${escapeHtml(t('classroomEssayNoAssignment'))}</option>`;

        const needsShell = !mount.querySelector('.classroom-essays-context-bar-inner');
        if (needsShell) {
            mount.innerHTML = `
                <div class="classroom-essays-context-bar-inner">
                    <div class="classroom-essay-context-field classroom-essay-class-picker">
                        <span class="classroom-essay-context-label">${escapeHtml(t('classroomClassLabel'))}</span>
                        <button type="button" id="classroomEssaysClassPickerTrigger" class="classroom-essay-class-picker__trigger" aria-expanded="false" aria-haspopup="listbox">
                            <span class="classroom-essay-class-picker__name"></span>
                            <span class="classroom-essay-class-picker__badges"></span>
                            <span class="classroom-essay-class-picker__chevron" aria-hidden="true">▾</span>
                        </button>
                    </div>
                    <label class="classroom-essay-context-field classroom-essay-context-field--grow">
                        <span class="classroom-essay-context-label">${escapeHtml(t('classroomEssayAssignmentLabel'))}</span>
                        <select id="classroomEssaysAssignmentSelect" class="field-select field-control classroom-essay-datefield">${assignmentOpts}</select>
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
            const select = mount.querySelector('#classroomEssaysAssignmentSelect');
            if (select) {
                select.innerHTML = assignmentOpts;
                select.disabled = !assignments.length || !editable;
            }
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
        }

        renderClassPickerPopover(panel);
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

    function statusFilterSegments() {
        return [
            { filter: 'not_submitted', labelKey: 'classroomEssayStatusNotSubmitted', cls: 'essay-status--not' },
            { filter: 'submitted', labelKey: 'classroomEssayStatusReceived', cls: 'essay-status--submitted' },
            { filter: 'complete', labelKey: 'classroomEssayStatusComplete', cls: 'essay-status--complete' },
            { filter: 'resubmit_required', labelKey: 'classroomEssayStatusResubmit', cls: 'essay-status--resubmit' }
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
        const keys = ['not_submitted', 'submitted', 'complete', 'resubmit_required'];
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
        const counts = d.countEssayByStatus(draftSubmission);
        const attention = getAttentionCounts();
        const progressKeys = ['complete', 'submitted', 'resubmit_required', 'not_submitted'];
        const progressTotal = progressKeys.reduce((sum, key) => sum + (counts[key] || 0), 0);
        const trackHtml = progressKeys
            .map((key) => {
                const meta = statusFilterSegments().find((s) => s.filter === key);
                const cls = meta ? meta.cls : '';
                const count = counts[key] || 0;
                const widthPct = progressTotal > 0 ? (count / progressTotal) * 100 : 25;
                const flex = count > 0 ? count : 0.001;
                return `<span class="classroom-essay-stats-segment ${cls}" style="flex: ${flex} 1 0; width: ${widthPct.toFixed(2)}%;" aria-hidden="true"></span>`;
            })
            .join('');
        const complete = counts.complete || 0;
        const total = counts.total || getStudents().length;

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
                ${tile('overdue_sub', attention.overdueSub, 'classroomEssayAttentionOverdueSub', 'classroomEssayAttentionOverdueSubHint', 'overdue')}
                ${tile('eval_overdue', attention.evalOverdue, 'classroomEssayAttentionEvalOverdue', 'classroomEssayAttentionEvalOverdueHint', 'eval')}
                ${tile('resubmit_required', attention.resubmit, 'classroomEssayAttentionResubmits', 'classroomEssayAttentionResubmitsHint', 'resubmit')}
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
            overdue_sub: t('classroomEssayAttentionOverdueSub'),
            eval_overdue: t('classroomEssayAttentionEvalOverdue'),
            resubmit_required: t('classroomEssayAttentionResubmits'),
            not_submitted: t('classroomEssayStatusNotSubmitted'),
            submitted: t('classroomEssayStatusReceived'),
            complete: t('classroomEssayStatusComplete')
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
            return next;
        }
        if (action === 'submission') {
            if (status === 'submitted') {
                return Object.assign({}, rec, { status: 'submitted' });
            }
            if (status === 'not_submitted') {
                return Object.assign({}, rec, { status: 'not_submitted', submittedRetest: false });
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
        return patch;
    }

    function applyBatchStatus(panel, targetStatus) {
        const editable = access() && access().canEditClass(getClassData());
        if (!editable || !draftSubmission || !selectedStudentIds.size || !targetStatus) {
            return;
        }
        selectedStudentIds.forEach((sid) => {
            const rec = getRecord(sid);
            if (!rec) {
                return;
            }
            const patch = { status: targetStatus };
            if (targetStatus !== 'resubmit_required') {
                patch.submittedRetest = false;
            }
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

    function applyBatchActions(panel, submissionStatus, evaluationStatus, setRetest) {
        const editable = access() && access().canEditClass(getClassData());
        if (!editable || !draftSubmission || !selectedStudentIds.size) {
            return;
        }
        const hasSubmission = submissionStatus && submissionStatus !== 'no_change';
        const hasEvaluation = evaluationStatus && evaluationStatus !== 'no_change';
        if (!hasSubmission && !hasEvaluation) {
            return;
        }
        let skippedEvaluation = 0;
        selectedStudentIds.forEach((sid) => {
            const rec = getRecord(sid);
            if (!rec) {
                return;
            }
            let next = Object.assign({}, rec);
            if (hasSubmission) {
                next = applyStagedBatchToRecord(next, 'submission', submissionStatus, null);
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
                    <button type="button" class="classroom-essay-reports-item" data-report-action="progress" role="menuitem">${escapeHtml(t('classroomEssayProgressReportBtn'))}</button>
                    <button type="button" class="classroom-essay-reports-item" data-report-action="resubmit-summary" role="menuitem">${escapeHtml(t('classroomEssayResubmitSummaryBtn'))}</button>
                    <button type="button" class="classroom-essay-reports-item" data-report-action="resubmit-print" role="menuitem">${escapeHtml(t('classroomEssayResubmitPrintBtn'))}</button>
                    <button type="button" class="classroom-essay-reports-item" data-report-action="rescan" role="menuitem">${escapeHtml(t('classroomEssayRescanBtn'))}</button>
                </div>
            </div>`;

        mount.querySelector('#classroomEssaysReportsBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            reportsMenuOpen = !reportsMenuOpen;
            renderReportsMenu(panel);
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
        mount.querySelector('[data-report-action="resubmit-print"]')?.addEventListener('click', () => {
            closeReportsMenu();
            renderReportsMenu(panel);
            printCurrentClassResubmits();
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
        const batchBtn = (status, labelKey, cls) =>
            `<button type="button" class="btn btn-small classroom-essay-batch-status-btn ${cls}" data-batch-status="${escapeAttr(status)}"${disabled}>${escapeHtml(t(labelKey))}</button>`;

        mount.innerHTML = `
            <div class="classroom-essay-batch-row classroom-batch-row">
                <span class="classroom-essay-batch-label">${escapeHtml(tf('classroomEssayBatchSelected', { count: selectedStudentIds.size }))}</span>
                ${batchBtn('not_submitted', 'classroomEssayStatusNotSubmitted', 'essay-status--not')}
                ${batchBtn('submitted', 'classroomEssayStatusReceived', 'essay-status--submitted')}
                ${batchBtn('complete', 'classroomEssayStatusComplete', 'essay-status--complete')}
                ${batchBtn('resubmit_required', 'classroomEssayStatusResubmit', 'essay-status--resubmit')}
                <button type="button" id="classroomEssaysBatchClearBtn" class="btn btn-outline btn-compact btn-small"${disabled}>${escapeHtml(t('classroomEssayBatchClear'))}</button>
            </div>`;

        mount.querySelectorAll('[data-batch-status]').forEach((btn) => {
            btn.addEventListener('click', () => {
                applyBatchStatus(panel, btn.getAttribute('data-batch-status'));
            });
        });
        mount.querySelector('#classroomEssaysBatchClearBtn')?.addEventListener('click', () => {
            selectedStudentIds.clear();
            renderFilters(panel);
            renderRows(panel);
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
            { status: 'resubmit_required', label: t('classroomEssayStatusResubmit'), cls: 'essay-status--resubmit' }
        ];
    }

    function essayRowRailCls(status) {
        const map = {
            not_submitted: 'classroom-sheet-row--status-essay-not',
            submitted: 'classroom-sheet-row--status-essay-received',
            complete: 'classroom-sheet-row--status-essay-complete',
            resubmit_required: 'classroom-sheet-row--status-essay-resubmit'
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
            (statusKey === 'not_submitted' || statusKey === 'submitted') &&
            meta.order < curMeta.order
        ) {
            stateMod = '--done';
        }
        const labelKey =
            statusKey === 'submitted'
                ? 'classroomEssayStatusReceived'
                : statusKey === 'not_submitted'
                    ? 'classroomEssayStatusNotSubmitted'
                    : statusKey === 'complete'
                        ? 'classroomEssayStatusComplete'
                        : 'classroomEssayStatusResubmit';
        return `<button type="button" class="classroom-essay-stage ${meta.cls} classroom-essay-stage${stateMod}" data-student-id="${escapeAttr(studentId)}" data-status="${escapeAttr(statusKey)}"${disabled}>${escapeHtml(t(labelKey))}</button>`;
    }

    function buildStatusCell(studentId, editable) {
        const rec = getRecord(studentId);
        const status = rec ? rec.status : 'not_submitted';
        const retestHtml =
            status === 'resubmit_required'
                ? `<label class="classroom-essay-retest-toggle">
                    <input type="checkbox" class="classroom-essay-retest" data-student-id="${escapeAttr(studentId)}" ${rec && rec.submittedRetest ? 'checked' : ''}${editable ? '' : ' disabled'} />
                    <span class="classroom-essay-retest-toggle__box" aria-hidden="true"><svg class="classroom-essay-retest-toggle__check" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg></span>
                    <span>${escapeHtml(t('classroomEssayResubmissionReceived'))}</span>
                </label>`
                : '';
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
                </div>
            </div>
            ${retestHtml}
        </div>`;
    }

    function buildDueCell(studentId) {
        const d = domain();
        const rec = getRecord(studentId);
        const status = rec ? rec.status : 'not_submitted';
        const ssDue = draftSubmission ? draftSubmission.ssDueDate || '' : '';
        const teDue = draftSubmission ? draftSubmission.teacherEvalDueDate || '' : '';
        if (!d) {
            return '';
        }
        if (status === 'not_submitted') {
            if (d.isEssaySsOverdueISO(ssDue)) {
                const days = d.daysUntilISO(ssDue);
                const n = days == null ? 0 : Math.abs(days);
                return `<span class="classroom-essay-due-pill classroom-essay-due-pill--danger">${escapeHtml(tf('classroomEssayDueOverdueDays', { days: n }))}</span>`;
            }
            return `<span class="classroom-essay-due-pill classroom-essay-due-pill--muted">${escapeHtml(t('classroomEssayDueNotInYet'))}</span>`;
        }
        if (status === 'submitted') {
            if (d.isEssaySsOverdueISO(teDue)) {
                const days = d.daysUntilISO(teDue);
                const n = days == null ? 0 : Math.abs(days);
                return `<span class="classroom-essay-due-pill classroom-essay-due-pill--danger">${escapeHtml(tf('classroomEssayDueEvalLateDays', { days: n }))}</span>`;
            }
            return `<span class="classroom-essay-due-pill classroom-essay-due-pill--submitted">${escapeHtml(t('classroomEssayDueAwaitingEval'))}</span>`;
        }
        if (status === 'complete') {
            return `<span class="classroom-essay-due-pill classroom-essay-due-pill--complete">${escapeHtml(t('classroomEssayStatusComplete'))}</span>`;
        }
        if (status === 'resubmit_required') {
            return `<span class="classroom-essay-due-pill classroom-essay-due-pill--resubmit">${escapeHtml(t('classroomEssayStatusResubmit'))}</span>`;
        }
        return '';
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
        scheduleStatusSave();
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
                const patch = { status };
                if (status !== 'resubmit_required') {
                    patch.submittedRetest = false;
                }
                const result = setRecord(sid, patch);
                if (recordAffectsResubmitDayNote(result.prev, result.next)) {
                    markResubmitDayNoteDirty();
                }
                afterEssayStatusChange(panel, sid);
            });
        });
        row.querySelector('.classroom-essay-retest')?.addEventListener('change', (event) => {
            setRecord(sid, { submittedRetest: event.currentTarget.checked });
            scheduleStatusSave();
        });
        const noteInput = row.querySelector('.classroom-essay-note');
        if (noteInput) {
            noteInput.addEventListener('input', () => {
                const result = setRecord(sid, { note: noteInput.value });
                if (recordAffectsResubmitDayNote(result.prev, result.next)) {
                    markResubmitDayNoteDirty();
                }
                scheduleNoteSave();
            });
            noteInput.addEventListener('blur', () => {
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
        bindEssayRowHandlers(panel, row, studentId);
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
            rowsMount.innerHTML = `<tr><td colspan="6" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomEssayNoAssignment'))}</p></td></tr>`;
            renderFooterHint(panel);
            return;
        }

        if (!students.length) {
            rowsMount.innerHTML = `<tr><td colspan="6" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomNoStudentsHint'))}</p></td></tr>`;
            renderFooterHint(panel);
            return;
        }

        const filtered = students.filter((entry) => studentMatchesFilter(entry.student.id));

        if (!filtered.length) {
            rowsMount.innerHTML = `<tr><td colspan="6" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomEssayNoStudentsFilter'))} <button type="button" class="classroom-essay-clear-filter" data-action="clear-essay-filter">${escapeHtml(t('classroomEssayClearFilter'))}</button></p></td></tr>`;
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
                <td class="classroom-sheet-col-student">${identity}</td>
                <td class="classroom-sheet-col-status">${buildStatusCell(sid, editable)}</td>
                <td class="classroom-sheet-col-due">${buildDueCell(sid)}</td>
                <td class="classroom-sheet-col-feedback">
                    <textarea rows="2" class="field-input classroom-essay-note classroom-essay-feedback" data-student-id="${escapeHtml(sid)}" placeholder="${escapeHtml(t('classroomEssayFeedbackPlaceholder'))}" aria-label="${escapeHtml(t('classroomEssayColFeedback'))}"${disabled}>${escapeHtml(note)}</textarea>
                </td>
            </tr>`;
            })
            .join('');

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
            if (!opt.skipRender && !opt.silent) {
                if (panel && isTypingInEssayNote(panel)) {
                    if (autosave) {
                        autosave.syncStatusDisplay();
                    }
                } else {
                    render(panel);
                }
            } else if (opt.silent && panel && !panel.hidden && !isTypingInEssayNote(panel) && !draftUnchanged) {
                renderContextBar(panel);
                renderStatsBar(panel);
                renderRows(panel);
                refreshZoneContextBar();
            }
            syncResubmitDayNoteIfNeeded();
            refreshZoneContextBar();
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
        renderHeader(panel);
        renderContextBar(panel);
        renderStatsBar(panel);
        renderFilters(panel);
        renderToolbarHint(panel);
        renderRows(panel);
        renderFooterHint(panel);

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
        syncClassIdFromContext();
        applyResolvedAssignment(getClassData());
        selectedStudentIds.clear();
        loadSubmission();
        render(panel);
    }

    async function initTab(h, options) {
        hooks = h;
        await flushBeforeLeave();
        const data = getAppData();
        const d = domain();
        const visible = getEssayVisibleClasses();
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
        bindResubmitSummaryModal();
        ensureEssaysOnlyDefault();
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

    global.CCPClassroomEssays = {
        initTab,
        render,
        flushBeforeLeave,
        isReceivedStatus,
        applyStagedBatchToRecord,
        applyBatchStatusToRecords,
        essayStatsSegmentFlex,
        recordAffectsResubmitDayNote,
        ESSAY_AUTOSAVE_DELAY_MS,
        resolveEssayAssignmentForClass,
        rowExistsInClass,
        getEssayAssignmentMap,
        persistEssayAssignmentForClass,
        studentMatchesFilter,
        buildDueCell,
        buildStatusCell,
        getAttentionCounts
    };
})(typeof window !== 'undefined' ? window : globalThis);
