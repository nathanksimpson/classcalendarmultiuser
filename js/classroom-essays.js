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
    const progressReportSelectedKeys = new Set();
    let progressReportPendingOnly = false;
    let resubmitDayNoteDirty = false;
    let resubmitDayNoteSyncInFlight = false;
    let deadlinesStripOpen = true;

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

    function scheduleSave() {
        ensureAutosave(panelRef);
        if (autosave) {
            autosave.scheduleSave();
        }
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
        if (global.CCPClassroomZoneContext && global.CCPClassroomZoneContext.getVisibleClasses) {
            return global.CCPClassroomZoneContext.getVisibleClasses();
        }
        return getAccessibleClasses();
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
            colAssignment: t('classroomEssayProgressColAssignment'),
            colLessonDate: t('classroomEssayProgressColLessonDate'),
            colTotal: t('classroomEssayProgressColTotal'),
            colNotSubmitted: t('classroomEssayProgressColNotSubmitted'),
            colSubmitted: t('classroomEssayProgressColSubmitted'),
            colComplete: t('classroomEssayProgressColComplete'),
            colResubmit: t('classroomEssayProgressColResubmit'),
            colSsDue: t('classroomEssayProgressColSsDue'),
            colTeDue: t('classroomEssayProgressColTeDue'),
            colPercentComplete: t('classroomEssayProgressColPercentComplete'),
            noAssignments: t('classroomEssayProgressNoAssignments'),
            generatedAt: t('classroomEssayProgressGeneratedAt'),
            overdue: t('classroomEssayProgressOverdue')
        };
    }

    function renderProgressPreviewHtml(assignments) {
        const groups = global.CCPClassroomEssayProgress
            ? global.CCPClassroomEssayProgress.groupAssignmentsByClass(assignments)
            : [];
        if (!groups.length) {
            return `<p class="section-hint">${escapeHtml(t('classroomEssayProgressNoAssignments'))}</p>`;
        }
        return groups
            .map((group) => {
                const rows = (group.rows || [])
                    .map(
                        (row) => `<tr>
                        <td>${escapeHtml(row.assignmentLabel || '')}</td>
                        <td>${escapeHtml(String(row.totalStudents || 0))}</td>
                        <td>${escapeHtml(String(row.counts && row.counts.complete != null ? row.counts.complete : 0))}</td>
                        <td>${escapeHtml(String(row.counts && row.counts.submitted != null ? row.counts.submitted : 0))}</td>
                        <td>${escapeHtml(String(row.percentComplete != null ? row.percentComplete : 0))}%</td>
                    </tr>`
                    )
                    .join('');
                return `<div class="classroom-essay-progress-class-group">
                    <h4 class="classroom-essay-progress-class-name">${escapeHtml(group.className || '')}</h4>
                    <table class="classroom-essay-progress-preview-table">
                        <thead><tr>
                            <th>${escapeHtml(t('classroomEssayProgressColAssignment'))}</th>
                            <th>${escapeHtml(t('classroomEssayProgressColTotal'))}</th>
                            <th>${escapeHtml(t('classroomEssayProgressColComplete'))}</th>
                            <th>${escapeHtml(t('classroomEssayProgressColSubmitted'))}</th>
                            <th>${escapeHtml(t('classroomEssayProgressColPercentComplete'))}</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
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
            return progressApi.filterAssignments(all, { pendingOnly: progressReportPendingOnly });
        }
        return progressApi.filterAssignments(all, {
            selectedKeys: progressReportSelectedKeys,
            pendingOnly: progressReportPendingOnly
        });
    }

    function openEssayProgressPrint(assignments) {
        const printApi = global.CCPClassroomEssayProgressPrint;
        const progressApi = global.CCPClassroomEssayProgress;
        if (!printApi || !progressApi || !assignments.length) {
            return;
        }
        const data = getAppData();
        const d = domain();
        const labels = getProgressPrintLabels();
        const groups = progressApi.groupAssignmentsByClass(assignments);
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
        const pendingCb = document.getElementById('essayProgressPendingOnly');
        if (!listEl) {
            return;
        }
        if (pendingCb) {
            pendingCb.checked = progressReportPendingOnly;
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
                        return `<label class="classroom-essay-progress-assignment-row">
                            <input type="checkbox" data-assignment-key="${escapeAttr(row.key)}"${checked} />
                            <span>${escapeHtml(row.assignmentLabel || '')} <span class="section-hint">(${escapeHtml(String(row.percentComplete || 0))}% ${escapeHtml(t('classroomEssayProgressColComplete'))})</span></span>
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
            progressReportPendingOnly = !!e.target.checked;
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

    function buildOverduePill(isoDate) {
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
            active && panel && panel.contains(active) && active.classList.contains('classroom-essay-note')
        );
    }

    function blurActiveEssayNote(panel) {
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        if (
            active
            && panel
            && panel.contains(active)
            && active.classList.contains('classroom-essay-note')
            && typeof active.blur === 'function'
        ) {
            active.blur();
        }
    }

    async function flushBeforeLeave() {
        const panel = panelRef || document.getElementById('panel-essays');
        blurActiveEssayNote(panel);
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
        const segments = essayStatsSegmentFlex(counts);
        const trackHtml = segments
            .filter((seg) => seg.count > 0)
            .map((seg) => {
                const meta = statusFilterSegments().find((s) => s.filter === seg.key);
                const cls = meta ? meta.cls : '';
                const flex = seg.flex > 0 ? seg.flex : 0.001;
                const active = currentFilter === seg.key ? ' is-active' : '';
                const pressed = currentFilter === seg.key ? 'true' : 'false';
                const label = meta ? t(meta.labelKey) : seg.key;
                return `<button type="button" class="classroom-essay-stats-segment ${cls}${active}" style="flex-grow:${flex}" data-filter="${escapeAttr(seg.key)}" aria-pressed="${pressed}" aria-label="${escapeAttr(label)}"></button>`;
            })
            .join('');
        const allActive = currentFilter === 'all' ? ' is-active' : '';
        const chipHtml = [
            `<button type="button" class="classroom-essay-filter-chip${allActive}" data-filter="all" aria-pressed="${currentFilter === 'all' ? 'true' : 'false'}"><span class="classroom-essay-filter-count">${counts.total || 0}</span> ${escapeHtml(t('classroomEssayFilterAll'))}</button>`
        ]
            .concat(
                statusFilterSegments().map((seg) => {
                    const count = counts[seg.filter] || 0;
                    const active = currentFilter === seg.filter ? ' is-active' : '';
                    const pressed = currentFilter === seg.filter ? 'true' : 'false';
                    return `<button type="button" class="classroom-essay-filter-chip ${seg.cls}${active}" data-filter="${escapeAttr(seg.filter)}" aria-pressed="${pressed}"><span class="classroom-essay-filter-dot" aria-hidden="true"></span>${escapeHtml(t(seg.labelKey))} <span class="classroom-essay-filter-count">${count}</span></button>`;
                })
            )
            .join('');
        mount.innerHTML = `
            <div class="classroom-essay-stats-track" role="group" aria-label="${escapeAttr(t('classroomEssayFilterLabel'))}">${trackHtml}</div>
            <div class="classroom-essay-filter-chips" role="group" aria-label="${escapeAttr(t('classroomEssayFilterLabel'))}">${chipHtml}</div>`;

        const onSegmentClick = (filter) => {
            currentFilter = currentFilter === filter ? 'all' : filter;
            renderStatsBar(panel);
            renderRows(panel);
            renderFooterHint(panel);
        };

        mount.querySelectorAll('[data-filter]').forEach((btn) => {
            btn.addEventListener('click', () => {
                onSegmentClick(btn.getAttribute('data-filter') || 'all');
            });
        });
    }

    function renderFooterHint(panel) {
        const mount = panel.querySelector('#classroomEssaysFooterHint');
        if (!mount) {
            return;
        }
        const students = getStudents();
        const filtered =
            currentFilter === 'all'
                ? students
                : students.filter((entry) => {
                    const rec = getRecord(entry.student.id);
                    const status = rec ? rec.status : 'not_submitted';
                    return status === currentFilter;
                });
        mount.textContent = tf('classroomEssayFilterFooter', {
            shown: String(filtered.length),
            total: String(students.length)
        });
    }

    function applyStagedBatchToRecord(rec, action, status, setRetest) {
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
        renderStatsBar(panel);
        renderFilters(panel);
        renderRows(panel);
        scheduleSave();
    }

    function syncBatchRetestVisibility(mount) {
        const evalSelect = mount.querySelector('#classroomEssaysBatchEvaluation');
        const retestLabel = mount.querySelector('.classroom-essay-batch-retest');
        if (!evalSelect || !retestLabel) {
            return;
        }
        const show = evalSelect.value === 'resubmit_required';
        retestLabel.hidden = !show;
        if (!show) {
            const cb = retestLabel.querySelector('input');
            if (cb) {
                cb.checked = false;
            }
        }
    }

    function renderFilters(panel) {
        const mount = panel.querySelector('#classroomEssaysBatchActions');
        if (!mount || !draftSubmission) {
            return;
        }
        const editable = access() && access().canEditClass(getClassData());
        const disabled = editable ? '' : ' disabled';
        const noChange = escapeHtml(t('classroomEssayBatchNoChange'));

        mount.innerHTML = `
            <div class="classroom-essay-batch-row classroom-batch-row">
                <label class="classroom-essay-batch-field">
                    <span class="section-hint">${escapeHtml(t('classroomEssayBatchSubmissionLabel'))}</span>
                    <select id="classroomEssaysBatchSubmission" class="field-select field-control--compact"${disabled}>
                        <option value="no_change">${noChange}</option>
                        <option value="submitted">${escapeHtml(t('classroomEssayMarkReceived'))}</option>
                        <option value="not_submitted">${escapeHtml(t('classroomEssayBatchSubmissionMarkNot'))}</option>
                    </select>
                </label>
                <label class="classroom-essay-batch-field">
                    <span class="section-hint">${escapeHtml(t('classroomEssayBatchEvaluationLabel'))}</span>
                    <select id="classroomEssaysBatchEvaluation" class="field-select field-control--compact"${disabled}>
                        <option value="no_change">${noChange}</option>
                        <option value="complete">${escapeHtml(t('classroomEssayStatusComplete'))}</option>
                        <option value="resubmit_required">${escapeHtml(t('classroomEssayStatusResubmit'))}</option>
                    </select>
                </label>
                <label class="checkbox-label classroom-essay-batch-retest" hidden>
                    <input type="checkbox" id="classroomEssaysBatchRetest"${disabled} />
                    <span>${escapeHtml(t('classroomEssayResubmissionReceived'))}</span>
                </label>
                <button type="button" id="classroomEssaysBatchApplyBtn" class="btn btn-primary btn-compact"${disabled}>${escapeHtml(t('classroomEssayBatchApply'))}</button>
                <button type="button" id="classroomEssaysProgressReportBtn" class="btn btn-outline btn-compact">${escapeHtml(t('classroomEssayProgressReportBtn'))}</button>
            </div>`;

        mount.querySelector('#classroomEssaysProgressReportBtn')?.addEventListener('click', () => {
            openProgressReportModal();
        });

        mount.querySelector('#classroomEssaysBatchEvaluation')?.addEventListener('change', () => {
            syncBatchRetestVisibility(mount);
        });

        mount.querySelector('#classroomEssaysBatchApplyBtn')?.addEventListener('click', () => {
            const submissionStatus = mount.querySelector('#classroomEssaysBatchSubmission')?.value || 'no_change';
            const evaluationStatus = mount.querySelector('#classroomEssaysBatchEvaluation')?.value || 'no_change';
            const retestCb = mount.querySelector('#classroomEssaysBatchRetest');
            const setRetest =
                evaluationStatus === 'resubmit_required' && retestCb && retestCb.checked ? true : null;
            applyBatchActions(panel, submissionStatus, evaluationStatus, setRetest);
        });
    }

    function renderAssignmentBar(panel) {
        const mount = panel.querySelector('#classroomEssaysAssignmentBar');
        if (!mount) {
            return;
        }
        const classData = getClassData();
        const d = domain();
        const editable = access() && access().canEditClass(classData);
        const deadlineDisabled = editable ? '' : ' disabled';
        const rows = classData && d ? d.getEssayRowsFromSyllabus(classData.syllabusRows) : [];
        const rowOpts = rows
            .map((row) => {
                const key = d.getSyllabusRowKey(row);
                const sel = key === syllabusRowId ? ' selected' : '';
                const label = `${row.date || ''} — ${row.planTitle || row.planDetail || ''}`.trim();
                return `<option value="${escapeHtml(key)}" data-date="${escapeHtml(row.date || '')}"${sel}>${escapeHtml(label)}</option>`;
            })
            .join('');
        const ss = draftSubmission ? draftSubmission.ssDueDate || '' : '';
        const te = draftSubmission ? draftSubmission.teacherEvalDueDate || '' : '';
        const toggleLabel = deadlinesStripOpen
            ? t('classroomEssayHideDeadlines')
            : t('classroomEssayShowDeadlines');
        mount.innerHTML = `
            <div class="classroom-essays-assignment-inner">
                <label class="classroom-header-field classroom-header-field--assignment">
                    <span>${escapeHtml(t('classroomEssayAssignmentLabel'))}</span>
                    <select id="classroomEssaysAssignmentSelect" class="field-select field-control--compact">${rowOpts}</select>
                </label>
                <button type="button" class="btn btn-outline btn-compact" id="classroomEssaysDeadlinesToggle">${escapeHtml(toggleLabel)}</button>
            </div>
            <div id="classroomEssaysDeadlinesStrip" class="classroom-essay-deadlines-strip"${deadlinesStripOpen ? '' : ' hidden'}>
                <div class="classroom-essay-deadline-field">
                    <span class="classroom-essay-deadline-label">${escapeHtml(t('classroomEssaySsDue'))}</span>
                    <div class="classroom-essay-deadline-control">
                        <input type="date" id="classroomEssaysSsDue" class="field-input field-control--compact" value="${escapeHtml(ss)}"${deadlineDisabled} />
                        ${buildOverduePill(ss)}
                    </div>
                </div>
                <div class="classroom-essay-deadline-field">
                    <span class="classroom-essay-deadline-label">${escapeHtml(t('classroomEssayTeacherEvalDue'))}</span>
                    <div class="classroom-essay-deadline-control">
                        <input type="date" id="classroomEssaysTeacherEvalDue" class="field-input field-control--compact" value="${escapeHtml(te)}"${deadlineDisabled} />
                        ${buildOverduePill(te)}
                    </div>
                </div>
            </div>`;

        mount.querySelector('#classroomEssaysDeadlinesToggle')?.addEventListener('click', () => {
            deadlinesStripOpen = !deadlinesStripOpen;
            renderAssignmentBar(panel);
        });

        mount.querySelector('#classroomEssaysAssignmentSelect')?.addEventListener('change', async (e) => {
            await flushBeforeLeave();
            const opt = e.target.selectedOptions[0];
            syllabusRowId = e.target.value;
            lessonDate = opt ? opt.getAttribute('data-date') || '' : '';
            if (classId && syllabusRowId) {
                persistEssayAssignmentForClass(classId, syllabusRowId);
            }
            selectedStudentIds.clear();
            loadSubmission();
            render(panel);
        });
        mount.querySelector('#classroomEssaysSsDue')?.addEventListener('change', (e) => {
            if (draftSubmission) {
                draftSubmission.ssDueDate = e.target.value;
            }
            scheduleSave();
            renderAssignmentBar(panel);
        });
        mount.querySelector('#classroomEssaysTeacherEvalDue')?.addEventListener('change', (e) => {
            if (draftSubmission) {
                draftSubmission.teacherEvalDueDate = e.target.value;
            }
            scheduleSave();
            renderAssignmentBar(panel);
        });
    }

    function renderHeader(panel) {
        const headerMount = panel.querySelector('#classroomEssaysHeader');
        if (!headerMount || !global.CCPClassroomHeader) {
            return;
        }
        global.CCPClassroomHeader.setMode('essays');
        global.CCPClassroomHeader.render(
            headerMount,
            {
                classId,
                classData: getClassData(),
                studentCount: getStudents().length
            },
            { mode: 'essays' }
        );
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

    function buildSubmissionCell(studentId, editable) {
        const rec = getRecord(studentId);
        const status = rec ? rec.status : 'not_submitted';
        const received = isReceivedStatus(status);
        const disabled = editable ? '' : ' disabled';
        if (received) {
            return `<button type="button" class="btn btn-primary btn-compact btn-small classroom-essay-submission-btn classroom-essay-submission-btn--received" data-student-id="${escapeAttr(studentId)}" data-action="toggle-received"${disabled}>
                <span class="classroom-essay-submission-check" aria-hidden="true"></span>
                ${escapeHtml(t('classroomEssayStatusReceived'))}
            </button>`;
        }
        return `<button type="button" class="btn btn-outline btn-compact btn-small classroom-essay-submission-btn classroom-essay-submission-btn--pending" data-student-id="${escapeAttr(studentId)}" data-action="mark-received"${disabled}>
            <span class="classroom-essay-submission-box" aria-hidden="true"></span>
            ${escapeHtml(t('classroomEssayMarkReceived'))}
        </button>`;
    }

    function buildEvaluationCell(studentId, editable) {
        const rec = getRecord(studentId);
        const status = rec ? rec.status : 'not_submitted';
        const received = isReceivedStatus(status);
        const disabledAttr = editable && received ? '' : ' disabled';
        const completeActive = status === 'complete' ? ' is-active' : '';
        const resubmitActive = status === 'resubmit_required' ? ' is-active' : '';
        const retestHtml =
            status === 'resubmit_required'
                ? `<label class="classroom-essay-retest-toggle">
                    <input type="checkbox" class="classroom-essay-retest" data-student-id="${escapeAttr(studentId)}" ${rec && rec.submittedRetest ? 'checked' : ''}${editable ? '' : ' disabled'} />
                    <span>${escapeHtml(t('classroomEssayResubmissionReceived'))}</span>
                </label>`
                : '';
        const hintHtml = received
            ? ''
            : `<span class="classroom-essay-eval-hint">${escapeHtml(t('classroomEssayGradingOpensOnceReceived'))}</span>`;
        return `<div class="classroom-essay-evaluation-cell">
            <div class="classroom-essay-eval-segments" role="group" aria-label="${escapeAttr(t('classroomColEvaluation'))}">
                <button type="button" class="btn btn-small classroom-essay-eval-btn${completeActive}" data-student-id="${escapeAttr(studentId)}" data-status="complete"${disabledAttr}>${escapeHtml(t('classroomEssayStatusComplete'))}</button>
                <button type="button" class="btn btn-small classroom-essay-eval-btn${resubmitActive}" data-student-id="${escapeAttr(studentId)}" data-status="resubmit_required"${disabledAttr}>${escapeHtml(t('classroomEssayStatusResubmit'))}</button>
            </div>
            ${retestHtml}
            ${hintHtml}
        </div>`;
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

        const filtered =
            currentFilter === 'all'
                ? students
                : students.filter((entry) => {
                    const rec = getRecord(entry.student.id);
                    const status = rec ? rec.status : 'not_submitted';
                    return status === currentFilter;
                });

        if (!filtered.length) {
            rowsMount.innerHTML = `<tr><td colspan="6" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomEssayNoStudentsFilter'))}</p></td></tr>`;
            renderFooterHint(panel);
            return;
        }

        rowsMount.innerHTML = filtered
            .map((entry, index) => {
                const sid = entry.student.id;
                const rec = getRecord(sid);
                const note = rec ? rec.note || '' : '';
                const identity = rowApi
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
                <td class="classroom-sheet-col-submission">${buildSubmissionCell(sid, editable)}</td>
                <td class="classroom-sheet-col-evaluation">${buildEvaluationCell(sid, editable)}</td>
                <td class="classroom-sheet-col-notes">
                    <input type="text" class="field-input field-control--compact classroom-essay-note" data-student-id="${escapeHtml(sid)}" value="${escapeHtml(note)}" placeholder="${escapeHtml(t('classroomEssayNote'))}" aria-label="${escapeHtml(t('classroomEssayNote'))}"${disabled} />
                </td>
            </tr>`;
            })
            .join('');

        bindSelectionControls(panel, rowsMount, filtered);

        rowsMount.querySelectorAll('[data-action="mark-received"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.disabled) {
                    return;
                }
                const sid = btn.getAttribute('data-student-id');
                const result = setRecord(sid, { status: 'submitted' });
                if (recordAffectsResubmitDayNote(result.prev, result.next)) {
                    markResubmitDayNoteDirty();
                }
                renderStatsBar(panel);
                renderRows(panel);
                scheduleSave();
            });
        });
        rowsMount.querySelectorAll('[data-action="toggle-received"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.disabled) {
                    return;
                }
                const sid = btn.getAttribute('data-student-id');
                const result = setRecord(sid, { status: 'not_submitted', submittedRetest: false });
                if (recordAffectsResubmitDayNote(result.prev, result.next)) {
                    markResubmitDayNoteDirty();
                }
                renderStatsBar(panel);
                renderRows(panel);
                scheduleSave();
            });
        });
        rowsMount.querySelectorAll('.classroom-essay-eval-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.disabled) {
                    return;
                }
                const status = btn.getAttribute('data-status');
                const sid = btn.getAttribute('data-student-id');
                const patch = { status };
                if (status !== 'resubmit_required') {
                    patch.submittedRetest = false;
                }
                const result = setRecord(sid, patch);
                if (recordAffectsResubmitDayNote(result.prev, result.next)) {
                    markResubmitDayNoteDirty();
                }
                renderStatsBar(panel);
                renderRows(panel);
                scheduleSave();
            });
        });
        rowsMount.querySelectorAll('.classroom-essay-retest').forEach((cb) => {
            cb.addEventListener('change', () => {
                setRecord(cb.getAttribute('data-student-id'), { submittedRetest: cb.checked });
                scheduleSave();
            });
        });
        rowsMount.querySelectorAll('.classroom-essay-note').forEach((input) => {
            input.addEventListener('input', () => {
                const result = setRecord(input.getAttribute('data-student-id'), { note: input.value });
                if (recordAffectsResubmitDayNote(result.prev, result.next)) {
                    markResubmitDayNoteDirty();
                }
                scheduleSave();
            });
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
        const preSaveRenderSignature = opt.silent ? getDraftRenderSignature() : '';
        const saveBtn = panel && panel.querySelector('#classroomEssaysSaveBtn');

        if (saveBtn) {
            saveBtn.disabled = true;
        }
        try {
            await hooks.saveClassroom({ essaySubmissions: submissions });
            if (!opt.silent) {
                hooks.showToast(t('saved'));
            }
            loadSubmission();
            if (!opt.skipRender && !opt.silent) {
                render(panel);
            } else if (opt.silent && panel && !panel.hidden && !isTypingInEssayNote(panel)) {
                if (preSaveRenderSignature !== getDraftRenderSignature()) {
                    renderStatsBar(panel);
                    renderRows(panel);
                }
            }
            syncResubmitDayNoteIfNeeded();
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
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
        renderAssignmentBar(panel);
        renderStatsBar(panel);
        renderFilters(panel);
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
        persistEssayAssignmentForClass
    };
})(typeof window !== 'undefined' ? window : globalThis);
