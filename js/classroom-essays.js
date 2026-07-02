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
    let classSearchQuery = '';
    const selectedStudentIds = new Set();
    let saveStatus = 'saved';
    let saveInFlight = null;
    let debouncedSaveEssays = null;
    let panelRef = null;
    const progressReportSelectedKeys = new Set();
    let progressReportPendingOnly = false;

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
        return hooks && hooks.getAppData ? hooks.getAppData() : {};
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
            classes: getAccessibleClasses(),
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
        const d = domain();
        const classData = getClassData();
        if (!classData || !d) {
            return null;
        }
        const row = d.pickDefaultEssaySyllabusRow(classData, lessonDate || d.todayISO());
        if (row) {
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
        if (!syllabusRowId) {
            pickDefaultRow();
        }
        const students = getStudents();
        const existing = d.findEssaySubmission(data.essaySubmissions, classId, syllabusRowId);
        const classData = getClassData();
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
            return;
        }
        const records = Array.isArray(draftSubmission.records) ? draftSubmission.records.slice() : [];
        const idx = records.findIndex((r) => r.studentId === studentId);
        const base = idx >= 0
            ? records[idx]
            : { studentId, status: 'not_submitted', submittedRetest: false, note: '' };
        const next = Object.assign({}, base, patch);
        if (idx >= 0) {
            records[idx] = next;
        } else {
            records.push(next);
        }
        draftSubmission.records = records;
    }

    function getEssayStatusCounts() {
        const d = domain();
        const students = getStudents();
        const counts = d && draftSubmission
            ? d.countEssayByStatus(draftSubmission)
            : { not_submitted: 0, submitted: 0, complete: 0, resubmit_required: 0 };
        return Object.assign({ total: students.length }, counts);
    }

    function formatDeadlineHint(labelKey, isoDate) {
        const d = domain();
        if (!d || !isoDate) {
            return '';
        }
        const days = d.daysUntilISO(isoDate);
        if (days == null) {
            return '';
        }
        const lang = hooks && hooks.getLang ? hooks.getLang() : 'en';
        const formatted = new Date(isoDate + 'T00:00:00').toLocaleDateString(lang === 'ko' ? 'ko-KR' : undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const label = t(labelKey);
        let hintKey = 'classroomEssayDeadlineLeft';
        let vars = { label, date: formatted, days };
        if (days < 0) {
            hintKey = 'classroomEssayDeadlineOverdue';
            vars = { label, date: formatted, days: Math.abs(days) };
        } else if (days === 0) {
            hintKey = 'classroomEssayDeadlineToday';
            vars = { label, date: formatted };
        }
        const cls = days < 0 || days === 0 ? 'classroom-essay-deadline--overdue' : 'classroom-essay-deadline--ok';
        return `<p class="classroom-essay-deadline ${cls}">${escapeHtml(tf(hintKey, vars))}</p>`;
    }

    function buildDeadlineHintsHtml() {
        if (!draftSubmission) {
            return '';
        }
        const ss = draftSubmission.ssDueDate || '';
        const te = draftSubmission.teacherEvalDueDate || '';
        return formatDeadlineHint('classroomEssaySsDueShort', ss)
            + formatDeadlineHint('classroomEssayTeacherEvalDueShort', te);
    }

    function updateSaveStatus(next) {
        saveStatus = next;
        const el = panelRef && panelRef.querySelector('#classroomEssaysSaveStatus');
        if (!el) {
            return;
        }
        let key = 'classroomEssaySaveSaved';
        let cls = 'classroom-essay-save-status--saved';
        if (next === 'saving') {
            key = 'classroomEssaySaveSaving';
            cls = 'classroom-essay-save-status--saving';
        } else if (next === 'pending') {
            key = 'classroomEssaySavePending';
            cls = 'classroom-essay-save-status--pending';
        } else if (next === 'error') {
            key = 'classroomEssaySaveError';
            cls = 'classroom-essay-save-status--error';
        }
        el.textContent = t(key);
        el.className = `classroom-essay-save-status section-hint ${cls}`;
    }

    function ensureDebouncedSave() {
        if (debouncedSaveEssays) {
            return;
        }
        const debounceFn = hooks && hooks.debounce ? hooks.debounce : null;
        if (debounceFn) {
            debouncedSaveEssays = debounceFn(() => {
                void saveAll(panelRef, { silent: true });
            }, 600);
        }
    }

    function scheduleSave() {
        ensureDebouncedSave();
        if (debouncedSaveEssays) {
            updateSaveStatus('pending');
            debouncedSaveEssays();
        } else {
            void saveAll(panelRef, { silent: true });
        }
    }

    async function flushPendingSave() {
        if (debouncedSaveEssays && debouncedSaveEssays.flush) {
            debouncedSaveEssays.flush();
        }
        if (saveInFlight) {
            await saveInFlight;
        }
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

    function syncPanelAfterSilentSave(panel) {
        if (!panel || panel.hidden || isTypingInEssayNote(panel)) {
            return;
        }
        renderStatsBar(panel);
        renderRows(panel);
        renderSaveStatus(panel);
    }

    async function flushBeforeLeave() {
        const panel = panelRef || document.getElementById('panel-essays');
        blurActiveEssayNote(panel);
        await flushPendingSave();
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

    function statusFilterSegments() {
        return [
            { filter: 'not_submitted', labelKey: 'classroomEssayStatusNotSubmitted', cls: 'essay-status--not' },
            { filter: 'submitted', labelKey: 'classroomEssayStatusSubmitted', cls: 'essay-status--submitted' },
            { filter: 'complete', labelKey: 'classroomEssayStatusComplete', cls: 'essay-status--complete' },
            { filter: 'resubmit_required', labelKey: 'classroomEssayStatusResubmit', cls: 'essay-status--resubmit' }
        ];
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
            .map((seg) => {
                const meta = statusFilterSegments().find((s) => s.filter === seg.key);
                const cls = meta ? meta.cls : '';
                const pressed = currentFilter === seg.key ? 'true' : 'false';
                const title = meta ? t(meta.labelKey) : seg.key;
                const flex = seg.flex > 0 ? seg.flex : 0.001;
                return `<button type="button" class="classroom-essay-stats-segment ${cls}${currentFilter === seg.key ? ' is-active' : ''}" data-filter="${escapeAttr(seg.key)}" style="flex-grow:${flex}" aria-pressed="${pressed}" title="${escapeAttr(title)} (${seg.count})"></button>`;
            })
            .join('');
        const legendHtml = statusFilterSegments()
            .map((seg) => {
                const count = counts[seg.filter] || 0;
                const active = currentFilter === seg.filter ? ' is-active' : '';
                return `<button type="button" class="classroom-essay-stats-legend-item ${seg.cls}${active}" data-filter="${escapeAttr(seg.filter)}">${escapeHtml(t(seg.labelKey))} (${count})</button>`;
            })
            .join('');
        mount.innerHTML = `
            <div class="classroom-essay-stats-track">${trackHtml}</div>
            <div class="classroom-essay-stats-legend">${legendHtml}</div>`;

        const onSegmentClick = (filter) => {
            currentFilter = currentFilter === filter ? 'all' : filter;
            renderStatsBar(panel);
            renderRows(panel);
        };

        mount.querySelectorAll('[data-filter]').forEach((btn) => {
            btn.addEventListener('click', () => {
                onSegmentClick(btn.getAttribute('data-filter') || 'all');
            });
        });
    }

    function applyBatchStatus(panel, status, setRetest) {
        const editable = access() && access().canEditClass(getClassData());
        if (!editable || !draftSubmission || !selectedStudentIds.size) {
            return;
        }
        selectedStudentIds.forEach((sid) => {
            const patch = { status };
            if (setRetest != null) {
                patch.submittedRetest = !!setRetest;
            }
            setRecord(sid, patch);
        });
        renderHeader(panel);
        renderStatsBar(panel);
        renderFilters(panel);
        renderRows(panel);
        scheduleSave();
        void syncResubmitDayNote();
    }

    function renderFilters(panel) {
        const mount = panel.querySelector('#classroomEssaysFilters');
        if (!mount || !draftSubmission) {
            return;
        }
        const editable = access() && access().canEditClass(getClassData());
        const disabled = editable ? '' : ' disabled';
        const statusOpts = statusOptions()
            .map((opt) => `<option value="${escapeAttr(opt.status)}">${escapeHtml(opt.label)}</option>`)
            .join('');

        mount.innerHTML = `
            <div class="classroom-essay-batch-row">
                <label class="classroom-essay-batch-field">
                    <span class="section-hint">${escapeHtml(t('classroomEssayBatchStatusLabel'))}</span>
                    <select id="classroomEssaysBatchStatus" class="field-select field-control--compact"${disabled}>
                        ${statusOpts}
                    </select>
                </label>
                <label class="checkbox-label classroom-essay-batch-retest">
                    <input type="checkbox" id="classroomEssaysBatchRetest"${disabled} />
                    <span>${escapeHtml(t('classroomEssayBatchRetest'))}</span>
                </label>
                <button type="button" id="classroomEssaysBatchApplyBtn" class="btn btn-primary btn-compact"${disabled}>${escapeHtml(t('classroomEssayBatchApply'))}</button>
                <button type="button" id="classroomEssaysProgressReportBtn" class="btn btn-outline btn-compact">${escapeHtml(t('classroomEssayProgressReportBtn'))}</button>
            </div>`;

        mount.querySelector('#classroomEssaysProgressReportBtn')?.addEventListener('click', () => {
            openProgressReportModal();
        });

        mount.querySelector('#classroomEssaysBatchApplyBtn')?.addEventListener('click', () => {
            const status = mount.querySelector('#classroomEssaysBatchStatus')?.value || 'not_submitted';
            const retestCb = mount.querySelector('#classroomEssaysBatchRetest');
            const setRetest = retestCb && retestCb.checked ? true : null;
            applyBatchStatus(panel, status, setRetest);
        });
    }

    function renderHeader(panel) {
        const headerMount = panel.querySelector('#classroomEssaysHeader');
        if (!headerMount || !global.CCPClassroomHeader) {
            return;
        }
        global.CCPClassroomHeader.setMode('essays');
        const data = getAppData();
        const editable = access() && access().canEditClass(getClassData());
        let classes = getAccessibleClasses();
        global.CCPClassroomHeader.render(
            headerMount,
            {
                classId,
                classData: getClassData(),
                classes,
                syllabusRowId,
                studentCount: getStudents().length,
                essaySubmissions: data.essaySubmissions,
                classSearchQuery,
                essayStatusCounts: getEssayStatusCounts(),
                essayDeadlines: draftSubmission
                    ? {
                        ssDueDate: draftSubmission.ssDueDate || '',
                        teacherEvalDueDate: draftSubmission.teacherEvalDueDate || ''
                    }
                    : {},
                essayDeadlinesReadOnly: !editable,
                essayDeadlineHintsHtml: buildDeadlineHintsHtml()
            },
            {
                mode: 'essays',
                onClassSearchChange: (query) => {
                    classSearchQuery = query || '';
                    if (hooks && hooks.setUiPref) {
                        hooks.setUiPref('classroomEssayClassSearch', classSearchQuery);
                    }
                    global.CCPClassroomHeader.renderClassComboboxList(
                        headerMount,
                        {
                            classId,
                            classes,
                            classSearchQuery,
                            essaySubmissions: data.essaySubmissions
                        },
                        { onClassChange: async (id) => {
                            await flushPendingSave();
                            classId = id;
                            classSearchQuery = '';
                            if (hooks && hooks.setUiPref) {
                                hooks.setUiPref('classroomTabClassId', id);
                                hooks.setUiPref('classroomEssayClassSearch', '');
                            }
                            syllabusRowId = '';
                            selectedStudentIds.clear();
                            loadSubmission();
                            render(panel);
                        } }
                    );
                },
                onClassChange: async (id) => {
                    await flushPendingSave();
                    classId = id;
                    classSearchQuery = '';
                    if (hooks && hooks.setUiPref) {
                        hooks.setUiPref('classroomTabClassId', id);
                        hooks.setUiPref('classroomEssayClassSearch', '');
                    }
                    syllabusRowId = '';
                    selectedStudentIds.clear();
                    loadSubmission();
                    render(panel);
                },
                onAssignmentChange: async (rowId, date) => {
                    await flushPendingSave();
                    syllabusRowId = rowId;
                    lessonDate = date || '';
                    if (hooks && hooks.setUiPref) {
                        hooks.setUiPref('classroomTabEssaySyllabusRowId', rowId);
                    }
                    selectedStudentIds.clear();
                    loadSubmission();
                    render(panel);
                },
                onEssaySsDueChange: (value) => {
                    if (draftSubmission) {
                        draftSubmission.ssDueDate = value;
                    }
                    renderHeader(panel);
                    scheduleSave();
                },
                onEssayTeacherEvalDueChange: (value) => {
                    if (draftSubmission) {
                        draftSubmission.teacherEvalDueDate = value;
                    }
                    renderHeader(panel);
                    scheduleSave();
                }
            }
        );
    }

    function statusOptions() {
        return [
            { status: 'not_submitted', label: t('classroomEssayStatusNotSubmitted'), cls: 'essay-status--not' },
            { status: 'submitted', label: t('classroomEssayStatusSubmitted'), cls: 'essay-status--submitted' },
            { status: 'complete', label: t('classroomEssayStatusComplete'), cls: 'essay-status--complete' },
            { status: 'resubmit_required', label: t('classroomEssayStatusResubmit'), cls: 'essay-status--resubmit' }
        ];
    }

    function buildStatusPills(studentId, editable) {
        const rec = getRecord(studentId);
        const current = rec ? rec.status : 'not_submitted';
        const disabled = editable ? '' : ' disabled';
        const pills = statusOptions()
            .map((opt) => {
                const active = current === opt.status ? ' essay-status-btn--active' : '';
                const pressed = current === opt.status ? 'true' : 'false';
                return `<button type="button" class="essay-status-btn ${opt.cls}${active}" data-student-id="${escapeAttr(studentId)}" data-status="${escapeAttr(opt.status)}" aria-pressed="${pressed}"${disabled}>${escapeHtml(opt.label)}</button>`;
            })
            .join('');
        return `<div class="classroom-essay-status-group" role="group" aria-label="${escapeAttr(t('classroomColEssayStatus'))}">${pills}</div>`;
    }

    function updateRowStatusUi(row, status) {
        if (!row) {
            return;
        }
        statusOptions().forEach((opt) => {
            row.classList.remove(opt.cls);
        });
        const match = statusOptions().find((o) => o.status === status);
        if (match) {
            row.classList.add(match.cls);
        }
        const group = row.querySelector('.classroom-essay-status-group');
        if (group) {
            group.querySelectorAll('.essay-status-btn').forEach((btn) => {
                const active = btn.getAttribute('data-status') === status;
                btn.classList.toggle('essay-status-btn--active', active);
                btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
        }
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
            return;
        }

        if (!students.length) {
            rowsMount.innerHTML = `<tr><td colspan="6" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomNoStudentsHint'))}</p></td></tr>`;
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
            return;
        }

        rowsMount.innerHTML = filtered
            .map((entry, index) => {
                const sid = entry.student.id;
                const rec = getRecord(sid);
                const retest = rec ? rec.submittedRetest : false;
                const note = rec ? rec.note || '' : '';
                const identity = rowApi
                    ? rowApi.formatStudentIdentityColumn(entry, t)
                    : escapeHtml(entry.student.name);
                const disabled = editable ? '' : ' disabled';
                const checked = selectedStudentIds.has(sid) ? ' checked' : '';
                const status = rec ? rec.status : 'not_submitted';
                const statusCls = statusOptions().find((o) => o.status === status);
                const rowStatusCls = statusCls ? statusCls.cls : 'essay-status--not';
                return `<tr class="classroom-sheet-row classroom-essay-row ${rowStatusCls}" data-student-id="${escapeHtml(sid)}">
                <td class="classroom-sheet-col-select">
                    <input type="checkbox" class="classroom-essay-select" data-student-id="${escapeHtml(sid)}" aria-label="${escapeHtml(t('classroomEssayBatchSelectCol'))}"${checked}${disabled} />
                </td>
                <td class="classroom-sheet-col-index">${index + 1}</td>
                <td class="classroom-sheet-col-student">${identity}</td>
                <td class="classroom-sheet-col-essay-status">${buildStatusPills(sid, editable)}</td>
                <td class="classroom-sheet-col-retest">
                    <input type="checkbox" class="classroom-essay-retest" data-student-id="${escapeHtml(sid)}" ${retest ? 'checked' : ''}${disabled} aria-label="${escapeHtml(t('classroomEssayRetest'))}" />
                </td>
                <td class="classroom-sheet-col-notes">
                    <input type="text" class="field-input field-control--compact classroom-essay-note" data-student-id="${escapeHtml(sid)}" value="${escapeHtml(note)}" placeholder="${escapeHtml(t('classroomEssayNote'))}" aria-label="${escapeHtml(t('classroomEssayNote'))}"${disabled} />
                </td>
            </tr>`;
            })
            .join('');

        bindSelectionControls(panel, rowsMount, filtered);

        rowsMount.querySelectorAll('.essay-status-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.disabled) {
                    return;
                }
                const status = btn.getAttribute('data-status');
                const sid = btn.getAttribute('data-student-id');
                setRecord(sid, { status });
                renderStatsBar(panel);
                if (currentFilter === 'all' || currentFilter === status) {
                    updateRowStatusUi(btn.closest('tr'), status);
                } else {
                    renderRows(panel);
                }
                scheduleSave();
                void syncResubmitDayNote();
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
                setRecord(input.getAttribute('data-student-id'), { note: input.value });
            });
            input.addEventListener('blur', () => {
                scheduleSave();
                void syncResubmitDayNote();
            });
        });
    }

    async function saveAll(panel, options) {
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

        const run = async () => {
            updateSaveStatus('saving');
            try {
                await hooks.saveClassroom({ essaySubmissions: submissions });
                saveStatus = 'saved';
                updateSaveStatus('saved');
                if (!opt.silent) {
                    hooks.showToast(t('saved'));
                }
                loadSubmission();
                if (!opt.skipRender && !opt.silent) {
                    render(panel);
                } else if (opt.silent) {
                    syncPanelAfterSilentSave(panel);
                }
                void syncResubmitDayNote();
            } catch (err) {
                saveStatus = 'error';
                updateSaveStatus('error');
                hooks.showToast(err.message || String(err), true);
            }
        };

        saveInFlight = run();
        try {
            await saveInFlight;
        } finally {
            saveInFlight = null;
        }
    }

    function renderSaveStatus(panel) {
        const mount = panel.querySelector('#classroomEssaysSaveStatus');
        if (!mount) {
            return;
        }
        updateSaveStatus(saveStatus === 'pending' ? 'pending' : saveStatus);
    }

    function render(panel) {
        if (!panel) {
            return;
        }
        panelRef = panel;
        renderHeader(panel);
        const deadlinesWrap = panel.querySelector('#classroomEssaysDeadlines');
        if (deadlinesWrap) {
            deadlinesWrap.innerHTML = '';
            deadlinesWrap.hidden = true;
        }
        renderStatsBar(panel);
        renderFilters(panel);
        renderRows(panel);
        renderSaveStatus(panel);
    }

    async function initTab(h, options) {
        hooks = h;
        ensureDebouncedSave();
        await flushBeforeLeave();
        const data = getAppData();
        const d = domain();
        classId =
            (options && options.classId) ||
            (data.ui && data.ui.classroomTabClassId) ||
            (data.classes && data.classes[0] && data.classes[0].id) ||
            '';
        syllabusRowId =
            (options && options.syllabusRowId) ||
            (data.ui && data.ui.classroomTabEssaySyllabusRowId) ||
            '';
        classSearchQuery = (data.ui && data.ui.classroomEssayClassSearch) || '';
        lessonDate = (data.ui && data.ui.classroomTabDate) || (d ? d.todayISO() : '');
        currentFilter = 'all';
        selectedStudentIds.clear();
        saveStatus = 'saved';
        if (!syllabusRowId) {
            pickDefaultRow();
        }
        loadSubmission();
        bindProgressReportModal();
        render(document.getElementById('panel-essays'));
    }

    function applyBatchStatusToRecords(records, studentIds, status, setRetest) {
        const idSet = new Set(studentIds);
        return records.map((rec) => {
            if (!idSet.has(rec.studentId)) {
                return rec;
            }
            const next = Object.assign({}, rec, { status });
            if (setRetest != null) {
                next.submittedRetest = !!setRetest;
            }
            return next;
        });
    }

    global.CCPClassroomEssays = {
        initTab,
        render,
        flushBeforeLeave,
        applyBatchStatusToRecords,
        essayStatsSegmentFlex
    };
})(typeof window !== 'undefined' ? window : globalThis);
