/**
 * Students roster segment — cohort picker + student CRUD.
 * TMS sync: unclear-name review wizard + disambiguator marks (권이안◆).
 */
(function (global) {
    let hooks = null;
    let selectedCohortId = null;
    let selectedStudentId = null;
    let archiveBulkMode = false;
    let dirty = false;
    let importPack = null;
    let importPlan = [];
    let importWizardStep = 1;
    let importFileLabel = '';
    let importPackSource = '';
    let pastePlanRow = null;
    let pastePreviewTimer = null;
    let tmsSyncPlan = [];
    let tmsSyncLoading = false;
    let tmsSyncHasFetched = false;
    let tmsSyncWizardStep = 1;
    let tmsReviewQueue = [];
    let tmsReviewIndex = 0;
    let tmsMissingQueue = [];
    let tmsMissingIndex = 0;
    let tmsCohortConflictQueue = [];
    let tmsCohortConflictIndex = 0;
    let tmsCreateEditorUnsub = null;
    const selectedStudentIds = new Set();
    const TMS_CREATE_VALUE = '__create__';

    function cleanTmsSyncCohortName(name) {
        const stripped = String(name || '')
            .replace(/^\[[^\]]+\]\s*/u, '')
            .replace(/\s+/g, ' ')
            .trim();
        return (stripped.split('^')[0] || stripped).trim();
    }

    function inferScheduleFromTmsSyncName(name) {
        const core = cleanTmsSyncCohortName(name).split('^')[0] || '';
        if (/T\s*$/i.test(core) || /T_\d/i.test(core)) {
            return { schedulePattern: 'tth', meetingDays: [2, 4] };
        }
        return { schedulePattern: 'mwf', meetingDays: [1, 3, 5] };
    }

    function cohortManagement() {
        return global.CCPCohortManagement || null;
    }

    function cleanupTmsCreateEditorListener() {
        if (typeof tmsCreateEditorUnsub === 'function') {
            tmsCreateEditorUnsub();
        }
        tmsCreateEditorUnsub = null;
    }

    function finishTmsCreateCohortEditor(row) {
        cleanupTmsCreateEditorListener();
        if (!row) {
            renderTmsSyncTable();
            return;
        }
        const draftId = row.tmsCreatedCohortId || row.userTargetId;
        const cm = cohortManagement();
        const cohort = getCohorts().find((c) => c && c.id === draftId);
        const stillDraft = !!(cohort && cohort.isDraft);
        if (!cohort || stillDraft || !String(cohort.name || '').trim()) {
            if (cm && cm.removeNamelessCohortDraft && draftId) {
                cm.removeNamelessCohortDraft(draftId);
            }
            row.userAction = 'choose';
            row.userTargetId = '';
            row.tmsCreatedCohortId = '';
            row.remembered = false;
        } else {
            row.userAction = 'map';
            row.userTargetId = cohort.id;
            row.tmsCreatedCohortId = cohort.id;
            row.remembered = false;
        }
        renderTmsSyncTable();
    }

    async function beginTmsCreateCohort(row) {
        if (isRosterReadOnly()) {
            setTmsSyncError(t('rosterImportReadOnly'));
            row.userAction = 'choose';
            row.userTargetId = '';
            renderTmsSyncTable();
            return;
        }
        if (typeof global.CCPEnsureCohortManagementReady === 'function') {
            const ready = await global.CCPEnsureCohortManagementReady();
            if (!ready) {
                setTmsSyncError(t('rosterTmsSyncCreateUnavailable'));
                row.userAction = 'choose';
                row.userTargetId = '';
                renderTmsSyncTable();
                return;
            }
        }
        const cm = cohortManagement();
        if (!cm || !cm.createCohortDraftFromTms || !cm.openCohortEditorForId) {
            setTmsSyncError(t('rosterTmsSyncCreateUnavailable'));
            row.userAction = 'choose';
            row.userTargetId = '';
            renderTmsSyncTable();
            return;
        }
        cleanupTmsCreateEditorListener();
        if (row.tmsCreatedCohortId) {
            const prev = getCohorts().find((c) => c && c.id === row.tmsCreatedCohortId);
            if (prev && (prev.isDraft || !String(prev.name || '').trim()) && cm.removeNamelessCohortDraft) {
                cm.removeNamelessCohortDraft(row.tmsCreatedCohortId);
            }
        }
        const sched = inferScheduleFromTmsSyncName(row.importCohortName);
        const appData = hooks && hooks.getAppData ? hooks.getAppData() : null;
        const mapped =
            row.schedule && domain().mapTmsBlockToPeriod
                ? domain().mapTmsBlockToPeriod(
                      row.schedule,
                      appData && appData.timetableTimeSlots,
                      appData && appData.periodSlotMap
                  )
                : null;
        const draft = cm.createCohortDraftFromTms({
            name: cleanTmsSyncCohortName(row.importCohortName),
            schedulePattern: sched.schedulePattern,
            meetingDays: sched.meetingDays,
            tmsBlockStart: mapped && mapped.start ? mapped.start : '',
            tmsBlockEnd: mapped && mapped.end ? mapped.end : '',
            tmsSuggestedPeriod: mapped && mapped.period != null ? mapped.period : null,
            tmsSuggestedTimeSlotId: mapped && mapped.timeSlotId ? mapped.timeSlotId : ''
        });
        if (!draft || !draft.id) {
            setTmsSyncError(t('rosterTmsSyncCreateUnavailable'));
            row.userAction = 'choose';
            row.userTargetId = '';
            renderTmsSyncTable();
            return;
        }
        row.userAction = 'map';
        row.userTargetId = draft.id;
        row.tmsCreatedCohortId = draft.id;
        row.remembered = false;
        setTmsSyncError('');
        setTmsSyncStatus(t('rosterTmsSyncCreateEditorHint'));
        if (cm.onCohortEditorClosed) {
            tmsCreateEditorUnsub = cm.onCohortEditorClosed(() => finishTmsCreateCohortEditor(row));
        }
        cm.openCohortEditorForId(draft.id);
        renderTmsSyncTable();
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

    function escapeHtml(s) {
        if (typeof CCPUtils !== 'undefined' && CCPUtils.escapeHtml) {
            return CCPUtils.escapeHtml(s);
        }
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function getCohorts() {
        return hooks && hooks.getCohorts ? hooks.getCohorts() : [];
    }

    function getSelectedCohort() {
        return getCohorts().find((c) => c && c.id === selectedCohortId) || null;
    }

    function studentSearchHaystack(student) {
        if (!student) {
            return '';
        }
        return [
            student.name,
            student.nameEn,
            student.locationTag,
            student.memo,
            student.id
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
    }

    function studentInitial(student) {
        const name = (student && (student.nameEn || student.name)) || '';
        const trimmed = String(name).trim();
        if (!trimmed) {
            return '?';
        }
        return trimmed.charAt(0).toUpperCase();
    }

    function isRosterReadOnly() {
        if (!hooks) {
            return true;
        }
        // Classroom roster must not follow the calendar lock (Start editing).
        if (typeof hooks.isClassroomReadOnly === 'function') {
            return hooks.isClassroomReadOnly();
        }
        return false;
    }

    let rosterModalGuardUntil = 0;

    function isRosterModalGuarded() {
        return Date.now() < rosterModalGuardUntil;
    }

    /** Open after the current click so the overlay / close (×) does not eat the same pointer event. */
    function openRosterModal(el) {
        if (!el) {
            return;
        }
        if (el.parentElement !== document.body) {
            document.body.appendChild(el);
        }
        el.removeAttribute('hidden');
        rosterModalGuardUntil = Date.now() + 500;
        window.setTimeout(() => {
            el.removeAttribute('hidden');
            el.setAttribute('aria-hidden', 'false');
            if (hooks && typeof hooks.openModal === 'function') {
                hooks.openModal(el);
            } else if (global.CCPModal && typeof global.CCPModal.open === 'function') {
                global.CCPModal.open(el);
            } else {
                el.classList.add('active');
            }
        }, 50);
    }

    function canEditRoster() {
        if (isRosterReadOnly()) {
            return false;
        }
        const cohort = getSelectedCohort();
        return cohort && access() && access().canEditCohortRoster(cohort);
    }

    function canEditCohort(cohort) {
        return cohort && access() && access().canEditCohortRoster(cohort);
    }

    function rosterImport() {
        return global.CCPRosterImport;
    }

    function matchStatusLabel(status) {
        const key = {
            byId: 'rosterImportMatchById',
            exact: 'rosterImportMatchExact',
            normalized: 'rosterImportMatchNormalized',
            ambiguous: 'rosterImportMatchAmbiguous',
            unmatched: 'rosterImportMatchUnmatched'
        }[status];
        return key ? t(key) : status;
    }

    function matchBadgeClass(status) {
        if (status === 'ambiguous') {
            return 'roster-import-badge roster-import-badge--ambiguous';
        }
        if (status === 'unmatched') {
            return 'roster-import-badge roster-import-badge--unmatched';
        }
        return 'roster-import-badge';
    }

    function selectValueForRow(row) {
        if (row.userAction === 'skip') {
            return '__skip__';
        }
        if (row.userAction === 'create') {
            return '__create__';
        }
        if (row.userAction === 'map' && row.userTargetId) {
            return row.userTargetId;
        }
        return '__choose__';
    }

    function applySelectValue(row, value) {
        if (value === '__skip__') {
            row.userAction = 'skip';
            row.userTargetId = '';
            return;
        }
        if (value === '__create__') {
            row.userAction = 'create';
            row.userTargetId = '';
            return;
        }
        if (value === '__choose__') {
            row.userAction = 'choose';
            row.userTargetId = '';
            return;
        }
        row.userAction = 'map';
        row.userTargetId = value;
    }

    function buildTargetSelectOptions(row) {
        const cohorts = getCohorts();
        const parts = [];
        const selected = selectValueForRow(row);
        parts.push(
            `<option value="__choose__"${selected === '__choose__' ? ' selected' : ''}>${escapeHtml(t('rosterImportChoose'))}</option>`
        );
        cohorts.forEach((c) => {
            if (domain() && domain().isArchiveCohort(c)) {
                return;
            }
            const editable = canEditCohort(c);
            const label = `${c.name || c.id}${editable ? '' : ` (${t('classroomRosterReadOnly')})`}`;
            const sel = selected === c.id ? ' selected' : '';
            const dis = editable ? '' : ' disabled';
            parts.push(
                `<option value="${escapeHtml(c.id)}"${sel}${dis}>${escapeHtml(label)}</option>`
            );
        });
        const createLabel = t('rosterImportCreate').replace('{name}', row.importCohortName);
        parts.push(
            `<option value="__create__"${selected === '__create__' ? ' selected' : ''}>${escapeHtml(createLabel)}</option>`
        );
        parts.push(
            `<option value="__skip__"${selected === '__skip__' ? ' selected' : ''}>${escapeHtml(t('rosterImportSkip'))}</option>`
        );
        return parts.join('');
    }

    function suggestedMatchLabel(row) {
        const cohorts = getCohorts();
        if (row.suggestedTargetId) {
            const c = cohorts.find((x) => x.id === row.suggestedTargetId);
            if (c) {
                return c.name || c.id;
            }
        }
        return '—';
    }

    function renderImportMappingTable() {
        const mount = document.getElementById('rosterImportMappingTable');
        if (!mount) {
            return;
        }
        const rows = importPlan
            .map((row, idx) => {
                return `<tr data-row-idx="${idx}">
                <td>${escapeHtml(row.importCohortName)}</td>
                <td>${row.studentCount}</td>
                <td><span class="${matchBadgeClass(row.matchStatus)}">${escapeHtml(matchStatusLabel(row.matchStatus))}</span>
                <span class="section-hint">${escapeHtml(suggestedMatchLabel(row))}</span></td>
                <td><select class="field-select roster-import-target-select" data-row-idx="${idx}">${buildTargetSelectOptions(row)}</select></td>
            </tr>`;
            })
            .join('');
        mount.innerHTML = `<table class="roster-import-table">
            <thead><tr>
            <th>${escapeHtml(t('rosterImportColImport'))}</th>
            <th>${escapeHtml(t('rosterImportColStudents'))}</th>
            <th>${escapeHtml(t('rosterImportColMatch'))}</th>
            <th>${escapeHtml(t('rosterImportColTarget'))}</th>
            </tr></thead>
            <tbody>${rows}</tbody></table>`;
        mount.querySelectorAll('.roster-import-target-select').forEach((sel) => {
            sel.addEventListener('change', () => {
                const idx = Number(sel.getAttribute('data-row-idx'));
                if (importPlan[idx]) {
                    applySelectValue(importPlan[idx], sel.value);
                }
            });
        });
    }

    function getGlobalMergeMode() {
        const checked = document.querySelector('input[name="rosterImportMergeGlobal"]:checked');
        return checked && checked.value === 'replace' ? 'replace' : 'merge';
    }

    function formatPreviewLine(preview) {
        return t('rosterImportPreviewLine')
            .replace('{added}', String(preview.added))
            .replace('{updated}', String(preview.updated))
            .replace('{kept}', String(preview.kept))
            .replace('{removed}', String(preview.removed));
    }

    function renderImportPreviewTable() {
        const mount = document.getElementById('rosterImportPreviewTable');
        const ri = rosterImport();
        if (!mount || !ri) {
            return;
        }
        const globalMode = getGlobalMergeMode();
        importPlan.forEach((row) => {
            if (row.userAction === 'skip') {
                return;
            }
            if (!row.perMergeMode) {
                row.mergeMode = globalMode;
            }
        });
        const previewPlan = ri.computeImportPreview(importPlan, getCohorts());
        const rows = previewPlan
            .filter((row) => row.userAction !== 'skip')
            .map((row, idx) => {
                const mode = row.mergeMode === 'merge' ? 'merge' : 'replace';
                const targetLabel =
                    row.userAction === 'create'
                        ? t('rosterImportCreate').replace('{name}', row.importCohortName)
                        : (getCohorts().find((c) => c.id === row.userTargetId)?.name || row.userTargetId);
                return `<tr data-preview-idx="${idx}">
                <td>${escapeHtml(row.importCohortName)} → ${escapeHtml(targetLabel)}</td>
                <td>
                <select class="field-select field-control--compact roster-import-row-merge" data-import-key="${escapeHtml(row.importKey)}">
                <option value="replace"${mode === 'replace' ? ' selected' : ''}>${escapeHtml(t('rosterImportMergeReplace'))}</option>
                <option value="merge"${mode === 'merge' ? ' selected' : ''}>${escapeHtml(t('rosterImportMergeMerge'))}</option>
                </select></td>
                <td>${escapeHtml(formatPreviewLine(row.preview || { added: 0, updated: 0, kept: 0, removed: 0 }))}</td>
            </tr>`;
            })
            .join('');
        mount.innerHTML = `<table class="roster-import-table">
            <thead><tr>
            <th>${escapeHtml(t('rosterImportColImport'))}</th>
            <th>${escapeHtml(t('rosterImportMergeLegend'))}</th>
            <th>${escapeHtml(t('rosterImportColPreview'))}</th>
            </tr></thead>
            <tbody>${rows || `<tr><td colspan="3">${escapeHtml(t('rosterImportChoose'))}</td></tr>`}</tbody></table>`;
        mount.querySelectorAll('.roster-import-row-merge').forEach((sel) => {
            sel.addEventListener('change', () => {
                const key = sel.getAttribute('data-import-key');
                const row = importPlan.find((r) => r.importKey === key);
                if (row) {
                    row.mergeMode = sel.value === 'merge' ? 'merge' : 'replace';
                    row.perMergeMode = true;
                    renderImportPreviewTable();
                }
            });
        });
    }

    function setImportError(msg) {
        const el = document.getElementById('rosterImportError');
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

    function updateImportWizardUi() {
        const step1 = document.getElementById('rosterImportStep1');
        const step2 = document.getElementById('rosterImportStep2');
        const backBtn = document.getElementById('rosterImportBackBtn');
        const continueBtn = document.getElementById('rosterImportContinueBtn');
        const confirmBtn = document.getElementById('rosterImportConfirmBtn');
        const hint = document.getElementById('rosterImportFileHint');
        if (hint && importFileLabel) {
            const sourceHint =
                importPackSource === 'essay-homework-tracker' ? t('essayTrackerImportHint') : '';
            hint.textContent = sourceHint
                ? `${importFileLabel} — ${sourceHint}`
                : importFileLabel;
            hint.hidden = false;
        }
        if (step1) {
            step1.hidden = importWizardStep !== 1;
        }
        if (step2) {
            step2.hidden = importWizardStep !== 2;
        }
        if (backBtn) {
            backBtn.hidden = importWizardStep !== 2;
        }
        if (continueBtn) {
            continueBtn.hidden = importWizardStep !== 1;
        }
        if (confirmBtn) {
            confirmBtn.hidden = importWizardStep !== 2;
            if (importWizardStep === 2) {
                const active = importPlan.filter((r) => r.userAction === 'map' || r.userAction === 'create');
                const students = active.reduce((n, r) => n + (r.studentCount || 0), 0);
                confirmBtn.textContent = t('rosterImportConfirm')
                    .replace('{students}', String(students))
                    .replace('{cohorts}', String(active.length));
            }
        }
        if (importWizardStep === 1) {
            renderImportMappingTable();
        } else {
            renderImportPreviewTable();
        }
    }

    function closeImportModal() {
        importPack = null;
        importPlan = [];
        importWizardStep = 1;
        importFileLabel = '';
        importPackSource = '';
        setImportError('');
        if (hooks && hooks.closeModal) {
            hooks.closeModal(document.getElementById('rosterImportModal'));
        }
    }

    function openImportWizard(pack, fileLabel) {
        const ri = rosterImport();
        if (!ri) {
            hooks.showToast(t('classroomModuleMissing'), true);
            return;
        }
        importPack = pack;
        importFileLabel = fileLabel || '';
        importPackSource = String(pack.source || '').trim();
        importPlan = ri.matchImportCohorts(pack.cohorts, getCohorts());
        if (pack.mergeByName) {
            importPlan.forEach((row) => {
                row.mergeByName = true;
            });
        }
        importWizardStep = 1;
        setImportError('');
        updateImportWizardUi();
        if (hooks && hooks.openModal) {
            hooks.openModal(document.getElementById('rosterImportModal'));
        }
    }

    function readImportFile(file) {
        if (!file) {
            return;
        }
        if (!hooks) {
            console.error('CCPClassroomRoster: import called before initTab');
            return;
        }
        if (isRosterReadOnly()) {
            hooks.showToast(t('rosterImportReadOnly'), true);
            return;
        }
        const ri = rosterImport();
        if (!ri) {
            hooks.showToast(t('classroomModuleMissing'), true);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const json = JSON.parse(String(reader.result || ''));
                const parsed =
                    typeof ri.parseImportFile === 'function'
                        ? ri.parseImportFile(json)
                        : ri.parseRosterPack(json);
                if (parsed.error) {
                    hooks.showToast(t('rosterImportParseError') + ' ' + parsed.error, true);
                    return;
                }
                openImportWizard(parsed.pack, file.name);
            } catch (_err) {
                hooks.showToast(t('rosterImportInvalidFile'), true);
            }
        };
        reader.onerror = () => hooks.showToast(t('rosterImportInvalidFile'), true);
        reader.readAsText(file);
    }

    function importErrorMessage(code) {
        const map = {
            cohortMappingRequired: t('rosterImportMappingRequired'),
            duplicateTargetCohort: t('rosterImportDuplicateTarget')
        };
        return map[code] || code;
    }

    async function confirmRosterImport() {
        const ri = rosterImport();
        if (!ri || !importPlan.length) {
            return;
        }
        setImportError('');
        const globalMode = getGlobalMergeMode();
        importPlan.forEach((row) => {
            if (row.userAction === 'skip' || row.userAction === 'choose') {
                return;
            }
            if (!row.perMergeMode) {
                row.mergeMode = globalMode;
            }
        });
        const validation = ri.validateImportPlan(importPlan);
        if (!validation.ok) {
            setImportError(importErrorMessage(validation.error));
            return;
        }
        const active = importPlan.filter((r) => r.userAction === 'map' || r.userAction === 'create');
        for (const row of active) {
            if (row.userAction === 'map') {
                const cohort = getCohorts().find((c) => c.id === row.userTargetId);
                if (!canEditCohort(cohort)) {
                    setImportError(t('rosterImportNoPermission'));
                    return;
                }
            }
        }
        const newId = () => (domain() ? domain().newId('cohort') : `cohort_${Date.now()}`);
        const result = ri.applyRosterImport(getCohorts(), importPlan, {
            newId,
            newStudentId: () => (domain() ? domain().newId('stu') : `stu_${Date.now()}`),
            homeroomTeacherUserId: hooks.getCurrentUserId ? hooks.getCurrentUserId() : ''
        });
        if (result.error) {
            setImportError(importErrorMessage(result.error));
            return;
        }
        try {
            await saveCohorts(result.cohorts);
            hooks.showToast(t('rosterImportSuccess'));
            closeImportModal();
            render(document.getElementById('panel-students'));
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
        }
    }

    function downloadJson(filename, obj) {
        const blob = new Blob([JSON.stringify(obj, null, 2) + '\n'], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function slugForFilename(name) {
        return String(name || 'calendar')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .slice(0, 40) || 'calendar';
    }

    function exportRoster(scope) {
        const ri = rosterImport();
        if (!ri) {
            hooks.showToast(t('classroomModuleMissing'), true);
            return;
        }
        let cohorts = getCohorts();
        if (scope === 'selected') {
            const c = getSelectedCohort();
            if (!c) {
                hooks.showToast(t('classroomPickCohort'), true);
                return;
            }
            cohorts = [c];
        }
        const pack = ri.buildRosterPack(cohorts, {
            calendarName: hooks.getCalendarName ? hooks.getCalendarName() : '',
            source: 'Class Calendar export'
        });
        if (!pack.cohorts.length) {
            hooks.showToast(t('rosterExportEmpty'), true);
            return;
        }
        const date = new Date().toISOString().slice(0, 10);
        const cal = slugForFilename(hooks.getCalendarName ? hooks.getCalendarName() : '');
        const suffix = scope === 'selected' ? 'cohort' : 'all';
        downloadJson(`roster-export-${cal}-${suffix}-${date}.json`, pack);
    }

    function setPasteError(msg) {
        const el = document.getElementById('rosterPasteError');
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

    function getPasteMergeMode() {
        const checked = document.querySelector('input[name="rosterPasteMergeMode"]:checked');
        return checked && checked.value === 'replace' ? 'replace' : 'merge';
    }

    function syncPasteMergeSwitchUi() {
        document.querySelectorAll('.roster-paste-merge-option').forEach((label) => {
            const input = label.querySelector('input[name="rosterPasteMergeMode"]');
            const btn = label.querySelector('.roster-paste-merge-btn');
            if (!input || !btn) {
                return;
            }
            btn.classList.toggle('is-active', input.checked);
        });
    }

    function setPasteConfirmEnabled(enabled, studentCount) {
        const btn = document.getElementById('rosterPasteConfirmBtn');
        if (!btn) {
            return;
        }
        btn.disabled = !enabled;
        if (enabled && studentCount != null) {
            btn.textContent = t('rosterPasteConfirm').replace('{count}', String(studentCount));
        } else {
            btn.textContent = t('rosterPasteConfirm').replace('{count}', '0');
        }
    }

    function showPastePreviewIdle() {
        pastePlanRow = null;
        const preview = document.getElementById('rosterPastePreview');
        if (preview) {
            preview.innerHTML = `<p class="section-hint">${escapeHtml(t('rosterPastePreviewIdle'))}</p>`;
            preview.hidden = false;
        }
        setPasteConfirmEnabled(false);
    }

    function clearPastePreview() {
        showPastePreviewIdle();
    }

    function schedulePastePreview(immediate) {
        if (pastePreviewTimer) {
            clearTimeout(pastePreviewTimer);
            pastePreviewTimer = null;
        }
        const textarea = document.getElementById('rosterPasteText');
        if (!textarea) {
            return;
        }
        if (!String(textarea.value || '').trim()) {
            setPasteError('');
            showPastePreviewIdle();
            return;
        }
        if (immediate) {
            previewRosterPaste();
            return;
        }
        pastePreviewTimer = setTimeout(() => {
            pastePreviewTimer = null;
            previewRosterPaste();
        }, 400);
    }

    function closePasteModal() {
        if (pastePreviewTimer) {
            clearTimeout(pastePreviewTimer);
            pastePreviewTimer = null;
        }
        pastePlanRow = null;
        setPasteError('');
        clearPastePreview();
        const textarea = document.getElementById('rosterPasteText');
        if (textarea) {
            textarea.value = '';
        }
        if (hooks && hooks.closeModal) {
            hooks.closeModal(document.getElementById('rosterPasteModal'));
        }
    }

    function pasteErrorMessage(code) {
        const map = {
            emptyPaste: t('rosterPasteEmpty'),
            noStudents: t('rosterPasteNoStudents'),
            multipleCohorts: t('rosterPasteMultipleCohorts')
        };
        return map[code] || code;
    }

    function buildPastePlanRow(cohort) {
        const ri = rosterImport();
        if (!ri || !cohort) {
            return null;
        }
        return {
            importKey: ri.importCohortKey({ cohortName: cohort.cohortName }),
            importCohortName: cohort.cohortName,
            importCohortId: null,
            studentCount: cohort.students.length,
            students: cohort.students.slice(),
            matchStatus: 'exact',
            suggestedTargetId: selectedCohortId,
            candidateTargetIds: [selectedCohortId],
            userAction: 'map',
            userTargetId: selectedCohortId,
            mergeMode: getPasteMergeMode(),
            mergeByName: true
        };
    }

    function renderPastePreview(cohort, preview) {
        const mount = document.getElementById('rosterPastePreview');
        if (!mount) {
            return;
        }
        const sourceName = cohort.cohortName || '';
        const summary = t('rosterPasteFound')
            .replace('{count}', String(cohort.students.length))
            .replace('{name}', sourceName);
        const stats = formatPreviewLine(preview || { added: 0, updated: 0, kept: 0, removed: 0 });
        const rows = cohort.students
            .map((s, i) => {
                const en = s.nameEn ? ` (${s.nameEn})` : '';
                const loc = s.locationTag ? ` — ${s.locationTag}` : '';
                return `<tr><td>${i + 1}</td><td>${escapeHtml(s.name)}${escapeHtml(en)}${escapeHtml(loc)}</td></tr>`;
            })
            .join('');
        mount.innerHTML = `
            <p class="section-hint">${escapeHtml(summary)}</p>
            <p class="section-hint">${escapeHtml(stats)}</p>
            <div class="roster-import-table-wrap">
            <table class="roster-import-table roster-paste-preview-table">
            <thead><tr><th>#</th><th>${escapeHtml(t('classroomStudentName'))}</th></tr></thead>
            <tbody>${rows}</tbody></table></div>`;
        mount.hidden = false;
    }

    function previewRosterPaste() {
        const ri = rosterImport();
        const textarea = document.getElementById('rosterPasteText');
        if (!ri || !textarea) {
            return;
        }
        setPasteError('');
        pastePlanRow = null;
        setPasteConfirmEnabled(false);
        if (!String(textarea.value || '').trim()) {
            showPastePreviewIdle();
            return;
        }
        const cohort = getSelectedCohort();
        if (!cohort) {
            setPasteError(t('rosterPasteNoCohort'));
            showPastePreviewIdle();
            return;
        }
        const parsed = ri.parseRosterPasteSingle(textarea.value, {
            fallbackCohortName: cohort.name || cohort.id
        });
        if (parsed.error) {
            setPasteError(pasteErrorMessage(parsed.error));
            showPastePreviewIdle();
            return;
        }
        const row = buildPastePlanRow(parsed.cohort);
        if (!row) {
            return;
        }
        const previewPlan = ri.computeImportPreview([row], getCohorts());
        pastePlanRow = previewPlan[0];
        renderPastePreview(parsed.cohort, pastePlanRow.preview);
        setPasteConfirmEnabled(true, parsed.cohort.students.length);
    }

    async function confirmRosterPaste() {
        const ri = rosterImport();
        if (!ri || !pastePlanRow) {
            previewRosterPaste();
            if (!pastePlanRow) {
                return;
            }
        }
        setPasteError('');
        const cohort = getSelectedCohort();
        if (!cohort || !canEditRoster()) {
            setPasteError(t('rosterImportNoPermission'));
            return;
        }
        if (isArchiveCohort(cohort)) {
            setPasteError(t('rosterPasteNoCohort'));
            return;
        }
        pastePlanRow.mergeMode = getPasteMergeMode();
        pastePlanRow.userAction = 'map';
        pastePlanRow.userTargetId = selectedCohortId;
        const newId = () => (domain() ? domain().newId('cohort') : `cohort_${Date.now()}`);
        const result = ri.applyRosterImport(getCohorts(), [pastePlanRow], {
            newId,
            homeroomTeacherUserId: hooks.getCurrentUserId ? hooks.getCurrentUserId() : ''
        });
        if (result.error) {
            setPasteError(importErrorMessage(result.error));
            return;
        }
        try {
            await saveCohorts(result.cohorts);
            hooks.showToast(t('rosterPasteSuccess'));
            closePasteModal();
            render(document.getElementById('panel-students'));
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
        }
    }

    function openPasteModal() {
        if (!hooks) {
            return;
        }
        if (isRosterReadOnly()) {
            hooks.showToast(t('rosterImportReadOnly'), true);
            return;
        }
        const cohort = getSelectedCohort();
        if (!cohort) {
            hooks.showToast(t('rosterPasteNoCohort'), true);
            return;
        }
        if (isArchiveCohort(cohort)) {
            hooks.showToast(t('rosterPasteNoCohort'), true);
            return;
        }
        if (!canEditRoster()) {
            hooks.showToast(t('classroomRosterReadOnly'), true);
            return;
        }
        const ri = rosterImport();
        if (!ri) {
            hooks.showToast(t('classroomModuleMissing'), true);
            return;
        }
        const targetLabel = document.getElementById('rosterPasteTargetLabel');
        if (targetLabel) {
            const cohortName = cohort.name || cohort.id;
            targetLabel.textContent = `${t('rosterPasteHint')} ${t('rosterPasteTarget').replace('{name}', cohortName)}`;
        }
        const textarea = document.getElementById('rosterPasteText');
        if (textarea) {
            textarea.value = '';
        }
        setPasteError('');
        showPastePreviewIdle();
        document.querySelectorAll('input[name="rosterPasteMergeMode"]').forEach((radio) => {
            radio.checked = radio.value === 'merge';
        });
        syncPasteMergeSwitchUi();
        if (hooks.openModal) {
            hooks.openModal(document.getElementById('rosterPasteModal'));
        }
        textarea?.focus();
    }

    /** Checkboxes win; otherwise the student open in the editor (same as restore/delete). */
    function targetStudentIds() {
        if (selectedStudentIds.size > 0) {
            return Array.from(selectedStudentIds);
        }
        if (selectedStudentId) {
            return [selectedStudentId];
        }
        return [];
    }

    function armActionButton(el, armed) {
        if (!el) {
            return;
        }
        el.disabled = false;
        el.setAttribute('aria-disabled', armed ? 'false' : 'true');
    }

    function updateBulkActionsUi() {
        const wrap = document.getElementById('classroomRosterBulkActions');
        const moveBtn = document.getElementById('classroomRosterMoveBtn');
        const statusBtn = document.getElementById('classroomRosterBulkStatusBtn');
        const archiveBtn = document.getElementById('classroomRosterBulkArchiveBtn');
        const restoreBtn = document.getElementById('classroomRosterBulkRestoreBtn');
        const deleteBtn = document.getElementById('classroomRosterBulkDeleteBtn');
        const cohort = getSelectedCohort();
        const inArchive = cohort && isArchiveCohort(cohort);
        const editable = cohort && canEditRoster();
        if (wrap) {
            wrap.hidden = !editable;
        }
        const hasSel = targetStudentIds().length > 0;
        if (moveBtn) {
            moveBtn.hidden = Boolean(inArchive);
            armActionButton(moveBtn, hasSel);
        }
        if (statusBtn) {
            statusBtn.hidden = Boolean(inArchive);
            armActionButton(statusBtn, hasSel);
        }
        if (archiveBtn) {
            archiveBtn.hidden = Boolean(inArchive);
            armActionButton(archiveBtn, hasSel);
        }
        if (restoreBtn) {
            restoreBtn.hidden = !inArchive;
            armActionButton(restoreBtn, hasSel);
        }
        if (deleteBtn) {
            armActionButton(deleteBtn, hasSel);
        }
    }

    function clearStudentBulkSelection() {
        selectedStudentIds.clear();
        updateBulkActionsUi();
    }

    function selectAllStudentsInCohort() {
        const cohort = getSelectedCohort();
        const d = domain();
        if (!cohort || !d) {
            return;
        }
        d.normalizeCohortStudents(cohort).forEach((student) => {
            if (student && student.id) {
                selectedStudentIds.add(student.id);
            }
        });
        updateBulkActionsUi();
    }

    function setMoveError(msg) {
        const el = document.getElementById('studentMoveError');
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

    function openMoveModal() {
        if (isRosterReadOnly()) {
            hooks.showToast(t('rosterImportReadOnly'), true);
            return;
        }
        const cohort = getSelectedCohort();
        if (!cohort || !canEditRoster() || isArchiveCohort(cohort)) {
            hooks.showToast(t('studentMoveNoPermission'), true);
            return;
        }
        const ids = targetStudentIds();
        if (!ids.length) {
            hooks.showToast(t('studentMoveNoSelection'), true);
            return;
        }
        const hint = document.getElementById('studentMoveHint');
        if (hint) {
            hint.textContent = t('studentMoveHint')
                .replace('{count}', String(ids.length))
                .replace('{source}', cohort.name || cohort.id);
        }
        const sel = document.getElementById('studentMoveCohortSelect');
        if (sel) {
            sel.innerHTML = '';
            const d = domain();
            sortCohortsForList(getCohorts())
                .filter((c) => c && c.id !== cohort.id && !d.isArchiveCohort(c))
                .forEach((c) => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    const editable = canEditCohort(c);
                    opt.textContent = `${c.name || c.id}${editable ? '' : ` (${t('classroomRosterReadOnly')})`}`;
                    opt.disabled = !editable;
                    sel.appendChild(opt);
                });
        }
        setMoveError('');
        openRosterModal(document.getElementById('studentMoveModal'));
    }

    function closeMoveModal() {
        if (isRosterModalGuarded()) {
            return;
        }
        setMoveError('');
        if (hooks && hooks.closeModal) {
            hooks.closeModal(document.getElementById('studentMoveModal'));
        }
    }

    async function confirmMoveStudents() {
        const d = domain();
        const fromCohort = getSelectedCohort();
        const toId = document.getElementById('studentMoveCohortSelect')?.value;
        const studentIds = targetStudentIds();
        if (!d || !fromCohort || !toId || !studentIds.length) {
            hooks.showToast(t('studentMoveNoSelection'), true);
            return;
        }
        if (toId === fromCohort.id) {
            setMoveError(t('studentMoveSameCohort'));
            return;
        }
        const target = getCohorts().find((c) => c && c.id === toId);
        if (!canEditCohort(fromCohort) || !canEditCohort(target)) {
            setMoveError(t('studentMoveNoPermission'));
            return;
        }
        const result = d.moveStudentsBetweenCohorts(
            getCohorts(),
            fromCohort.id,
            toId,
            studentIds
        );
        if (result.error === 'duplicate_in_target') {
            setMoveError(t('studentMoveDuplicate'));
            return;
        }
        if (result.error === 'same_cohort') {
            setMoveError(t('studentMoveSameCohort'));
            return;
        }
        if (result.error) {
            setMoveError(t('studentMoveNoPermission'));
            return;
        }
        try {
            const studentsSnap = (fromCohort.students || []).filter(
                (s) => s && studentIds.includes(s.id)
            );
            let pendingChecks = hooks.getAppData
                ? hooks.getAppData().pendingDebateBookChecks
                : [];
            if (d.recordDebateBookChecksForMoves && hooks.getAppData) {
                const recorded = d.recordDebateBookChecksForMoves(
                    Object.assign({}, hooks.getAppData(), { cohorts: result.cohorts }),
                    studentIds.map((sid) => ({
                        studentId: sid,
                        fromCohortId: fromCohort.id,
                        toCohortId: toId
                    })),
                    {
                        students: studentsSnap,
                        newId: () => d.newId('dbc')
                    }
                );
                pendingChecks = recorded.appData.pendingDebateBookChecks;
            }
            await hooks.saveClassroom({
                cohorts: result.cohorts,
                pendingDebateBookChecks: pendingChecks
            });
            if (typeof hooks.refreshTabWarnings === 'function') {
                hooks.refreshTabWarnings();
            }
            const targetName = target?.name || toId;
            hooks.showToast(
                t('studentMoveSuccess')
                    .replace('{count}', String(result.movedCount || studentIds.length))
                    .replace('{target}', targetName)
            );
            clearStudentBulkSelection();
            selectedCohortId = toId;
            selectedStudentId = null;
            closeMoveModal();
            render(document.getElementById('panel-students'));
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
        }
    }

    const TMS_USERNAME_STORAGE_KEY = 'ccp.tmsRosterUsername';

    function clearTmsPasswordField() {
        const pwd = document.getElementById('rosterTmsPassword');
        if (pwd) {
            pwd.value = '';
        }
    }

    function readTmsCredFields() {
        const userEl = document.getElementById('rosterTmsUsername');
        const passEl = document.getElementById('rosterTmsPassword');
        const rememberEl = document.getElementById('rosterTmsRememberUser');
        return {
            username: userEl ? String(userEl.value || '').trim() : '',
            password: passEl ? String(passEl.value || '') : '',
            rememberUser: Boolean(rememberEl && rememberEl.checked)
        };
    }

    function persistTmsUsernamePreference(username, remember) {
        try {
            if (remember && username) {
                localStorage.setItem(TMS_USERNAME_STORAGE_KEY, username);
            } else {
                localStorage.removeItem(TMS_USERNAME_STORAGE_KEY);
            }
        } catch (_) {
            /* ignore quota / private mode */
        }
    }

    function hydrateTmsCredForm() {
        const userEl = document.getElementById('rosterTmsUsername');
        const rememberEl = document.getElementById('rosterTmsRememberUser');
        clearTmsPasswordField();
        let saved = '';
        try {
            saved = String(localStorage.getItem(TMS_USERNAME_STORAGE_KEY) || '').trim();
        } catch (_) {
            saved = '';
        }
        if (userEl) {
            userEl.value = saved;
        }
        if (rememberEl) {
            rememberEl.checked = Boolean(saved);
        }
    }

    function setTmsSyncError(msg) {
        const el = document.getElementById('rosterTmsSyncError');
        if (!el) {
            return;
        }
        if (msg) {
            el.hidden = false;
            el.textContent = msg;
        } else {
            el.hidden = true;
            el.textContent = '';
        }
    }

    function setTmsSyncStatus(msg) {
        const el = document.getElementById('rosterTmsSyncStatus');
        if (el) {
            el.textContent = msg || '';
        }
    }

    function getTmsRosterLinks() {
        const app = hooks && hooks.getAppData ? hooks.getAppData() : null;
        const raw = app && app.tmsRosterLinks;
        if (domain().normalizeTmsRosterLinks) {
            return domain().normalizeTmsRosterLinks(raw);
        }
        return raw && typeof raw === 'object' ? raw : {};
    }

    function closeTmsSyncModal() {
        cleanupTmsCreateEditorListener();
        tmsSyncPlan.forEach((row) => {
            if (row && row.tmsCreatedCohortId) {
                const c = getCohorts().find((x) => x && x.id === row.tmsCreatedCohortId);
                if (c && (c.isDraft || !String(c.name || '').trim())) {
                    const cm = cohortManagement();
                    if (cm && cm.removeNamelessCohortDraft) {
                        cm.removeNamelessCohortDraft(row.tmsCreatedCohortId);
                    }
                }
            }
        });
        tmsSyncPlan = [];
        tmsSyncLoading = false;
        tmsSyncHasFetched = false;
        tmsSyncWizardStep = 1;
        tmsReviewQueue = [];
        tmsReviewIndex = 0;
        tmsMissingQueue = [];
        tmsMissingIndex = 0;
        tmsCohortConflictQueue = [];
        tmsCohortConflictIndex = 0;
        setTmsSyncError('');
        setTmsSyncStatus('');
        clearTmsPasswordField();
        const confirmBtn = document.getElementById('rosterTmsSyncConfirmBtn');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = t('rosterTmsSyncConfirm');
        }
        const loadBtn = document.getElementById('rosterTmsLoadBtn');
        if (loadBtn) {
            loadBtn.disabled = false;
        }
        const batchBar = document.getElementById('rosterTmsSyncBatchBar');
        if (batchBar) {
            batchBar.hidden = true;
        }
        const mapping = document.getElementById('rosterTmsSyncMappingTable');
        if (mapping) {
            mapping.hidden = false;
        }
        const review = document.getElementById('rosterTmsStudentReview');
        if (review) {
            review.hidden = true;
        }
        const credForm = document.getElementById('rosterTmsCredForm');
        if (credForm) {
            credForm.hidden = false;
        }
        if (hooks && hooks.closeModal) {
            hooks.closeModal(document.getElementById('rosterTmsSyncModal'));
        }
    }

    function syncTmsBatchBarVisibility() {
        const batchBar = document.getElementById('rosterTmsSyncBatchBar');
        if (!batchBar) {
            return;
        }
        batchBar.hidden = Boolean(tmsSyncLoading) || tmsSyncPlan.length === 0;
    }

    function skipAllTmsSyncRows() {
        tmsSyncPlan.forEach((row) => {
            row.userAction = 'skip';
            row.userTargetId = '';
            row.remembered = false;
            row.cohortConflictChoice = '';
        });
        setTmsSyncError('');
        renderTmsSyncTable();
    }

    function createAllTmsSyncRows() {
        tmsSyncPlan.forEach((row) => {
            if (!row) {
                return;
            }
            row.userAction = 'create';
            row.userTargetId = '';
            row.createdCohortId = '';
            row.tmsCreatedCohortId = '';
            row.remembered = false;
            row.studentResolutions = {};
            row.missingStudentActions = {};
            row.cohortConflictChoice = '';
        });
        setTmsSyncError('');
        renderTmsSyncTable();
    }

    function skipUnmappedTmsSyncRows() {
        tmsSyncPlan.forEach((row) => {
            if (row.userAction === 'choose' || (!row.userTargetId && row.userAction !== 'skip' && row.userAction !== 'map' && row.userAction !== 'create')) {
                row.userAction = 'skip';
                row.userTargetId = '';
                row.remembered = false;
                row.cohortConflictChoice = '';
            }
        });
        setTmsSyncError('');
        renderTmsSyncTable();
    }

    function normalizeCohortLabelLocal(s) {
        return String(s || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[^a-z0-9\uac00-\ud7a3]/g, '');
    }

    function suggestTmsTargetId(tmsName, calendarCohorts) {
        const list = (Array.isArray(calendarCohorts) ? calendarCohorts : []).filter(
            (c) => c && !domain().isArchiveCohort(c)
        );
        const exact = list.filter((c) => String(c.name || '').trim() === String(tmsName || '').trim());
        if (exact.length === 1) {
            return exact[0].id;
        }
        const norm = normalizeCohortLabelLocal(tmsName);
        const normHits = list.filter((c) => normalizeCohortLabelLocal(c.name) === norm);
        if (normHits.length === 1) {
            return normHits[0].id;
        }
        return '';
    }

    function buildTmsPlanRowFromScrape(c, calendar, links) {
        const name = (c && c.cohortName) || '';
        const tmsClassId = (c && (c.tmsClassId || c.cohortId)) || '';
        const scrapeSource = (c && c.source) || '';
        const suppressMissingReview =
            !Array.isArray(c && c.students) ||
            !c.students.length ||
            scrapeSource === 'class-popup-get-unverified' ||
            scrapeSource === 'class-popup-get-fallback';
        const resolved = domain().resolveTmsRosterLink
            ? domain().resolveTmsRosterLink(links, name, calendar, { tmsClassId })
            : {
                  key: '',
                  source: 'none',
                  remembered: false,
                  userAction: 'choose',
                  userTargetId: '',
                  suggestedTargetId: suggestTmsTargetId(name, calendar),
                  tmsClassName: name,
                  tmsClassId: ''
              };
        return {
            importCohortName: name,
            tmsClassId: resolved.tmsClassId || tmsClassId || '',
            tmsLinkKey: resolved.key || '',
            studentCount: Array.isArray(c.students) ? c.students.length : 0,
            students: Array.isArray(c.students) ? c.students.slice() : [],
            scrapeSource,
            suppressMissingReview,
            schedule: c && c.schedule ? Object.assign({}, c.schedule) : null,
            studentResolutions: {},
            missingStudentActions: {},
            userAction: resolved.userAction,
            userTargetId: resolved.userTargetId || '',
            suggestedTargetId: resolved.suggestedTargetId || '',
            remembered: Boolean(resolved.remembered),
            linkSource: resolved.source || 'none'
        };
    }

    function buildTmsPreviewLine(summary) {
        const s = summary || {};
        const review = Array.isArray(s.unclear) ? s.unclear.length : 0;
        const base = t('rosterTmsSyncPreviewLine')
            .replace('{added}', String((s.added && s.added.length) || 0))
            .replace('{matched}', String((s.matched && s.matched.length) || 0))
            .replace('{flagged}', String((s.flagged && s.flagged.length) || 0))
            .replace('{cleared}', String((s.cleared && s.cleared.length) || 0));
        if (!review) {
            return base;
        }
        return t('rosterTmsSyncPreviewLineWithReview')
            .replace('{added}', String((s.added && s.added.length) || 0))
            .replace('{review}', String(review))
            .replace('{matched}', String((s.matched && s.matched.length) || 0))
            .replace('{flagged}', String((s.flagged && s.flagged.length) || 0))
            .replace('{cleared}', String((s.cleared && s.cleared.length) || 0));
    }

    function buildTmsPreviewExtraHint(summary) {
        const s = summary || {};
        if (s.suppressMissingReview) {
            return t('rosterTmsSyncMissingSuppressedHint');
        }
        const added = Array.isArray(s.added) ? s.added : [];
        const fuzzyCleared = Array.isArray(s.fuzzyCleared) ? s.fuzzyCleared : [];
        const cleared = Array.isArray(s.cleared) ? s.cleared : [];
        const flagged = Array.isArray(s.flagged) ? s.flagged : [];
        const matched = Array.isArray(s.matched) ? s.matched : [];
        const incomplete = Array.isArray(s.warnings)
            ? s.warnings.some((w) => w && w.code === 'incomplete_tms_scrape')
            : false;
        if (incomplete) {
            return t('rosterTmsSyncIncompleteHint');
        }
        const unclear = Array.isArray(s.unclear) ? s.unclear : [];
        if (unclear.length) {
            const names = unclear
                .slice(0, 5)
                .map((row) => row && row.tmsName)
                .filter(Boolean);
            const extra =
                unclear.length > names.length ? ` (+${unclear.length - names.length})` : '';
            return t('rosterTmsSyncUnclearHint').replace('{names}', names.join(', ') + extra);
        }
        if (added.length) {
            const names = added
                .slice(0, 5)
                .map((row) => row && row.name)
                .filter(Boolean);
            const extra = added.length > names.length ? ` (+${added.length - names.length})` : '';
            return t('rosterTmsSyncAddedHint').replace('{names}', names.join(', ') + extra);
        }
        if (fuzzyCleared.length) {
            const names = fuzzyCleared
                .slice(0, 5)
                .map((row) => row && row.name)
                .filter(Boolean);
            const extra =
                fuzzyCleared.length > names.length
                    ? ` (+${fuzzyCleared.length - names.length})`
                    : '';
            return t('rosterTmsSyncFuzzyClearHint').replace('{names}', names.join(', ') + extra);
        }
        if (cleared.length) {
            const names = cleared
                .slice(0, 5)
                .map((row) => row && row.name)
                .filter(Boolean);
            const extra = cleared.length > names.length ? ` (+${cleared.length - names.length})` : '';
            return t('rosterTmsSyncClearHint').replace('{names}', names.join(', ') + extra);
        }
        if (flagged.length === 0 && matched.length > 0) {
            return t('rosterTmsSyncAllMatchedHint');
        }
        if (flagged.length) {
            const names = flagged
                .slice(0, 5)
                .map((row) => row && row.name)
                .filter(Boolean);
            const extra = flagged.length > names.length ? ` (+${flagged.length - names.length})` : '';
            return t('rosterTmsSyncFlaggedHint').replace('{names}', names.join(', ') + extra);
        }
        return '';
    }

    function getArchiveStudentsForSync() {
        const archive = getCohorts().find((c) => c && domain().isArchiveCohort && domain().isArchiveCohort(c));
        if (!archive) {
            return [];
        }
        return Array.isArray(archive.students) ? archive.students.slice() : [];
    }

    function previewTmsRow(row) {
        if (!row) {
            return { added: [], matched: [], flagged: [], cleared: [], warnings: [], unclear: [] };
        }
        const creating = row.userAction === 'create';
        if (!creating && (row.userAction !== 'map' || !row.userTargetId)) {
            return { added: [], matched: [], flagged: [], cleared: [], warnings: [], unclear: [] };
        }
        const target = creating
            ? {
                  id: '',
                  name: cleanTmsSyncCohortName(row.importCohortName),
                  students: [],
                  tmsStudentResolutions: {}
              }
            : getCohorts().find((c) => c && c.id === row.userTargetId);
        if (!target || !domain().mergeRosterByKoreanName) {
            return { added: [], matched: [], flagged: [], cleared: [], warnings: [], unclear: [] };
        }
        const archiveStudents = getArchiveStudentsForSync();
        const unclearRaw = domain().listUnclearTmsStudentMatches
            ? domain().listUnclearTmsStudentMatches(target.students, row.students, {
                  archiveStudents
              })
            : [];
        const unclear = domain().applyRememberedTmsStudentResolutions
            ? domain().applyRememberedTmsStudentResolutions(target, unclearRaw, row)
            : unclearRaw;
        const summary = domain().mergeRosterByKoreanName(target.students, row.students, {
            studentResolutions: row.studentResolutions || {},
            softUnclear: true,
            suppressMissing: Boolean(row.suppressMissingReview),
            archiveStudents
        }).summary;
        summary.suppressMissingReview = Boolean(row.suppressMissingReview);
        summary.unclear = unclear;
        return summary;
    }

    function collectTmsReviewQueue() {
        const queue = [];
        const archiveStudents = getArchiveStudentsForSync();
        const seenDupMpidx = new Set();
        tmsSyncPlan.forEach((row, rowIdx) => {
            if (!row || row.userAction !== 'map' || !row.userTargetId) {
                return;
            }
            const target = getCohorts().find((c) => c && c.id === row.userTargetId);
            if (!target || !domain().listUnclearTmsStudentMatches) {
                return;
            }
            if (!row.studentResolutions || typeof row.studentResolutions !== 'object') {
                row.studentResolutions = {};
            }
            const unclear = domain().listUnclearTmsStudentMatches(target.students, row.students, {
                archiveStudents
            });
            const stillUnclear =
                domain().applyRememberedTmsStudentResolutions
                    ? domain().applyRememberedTmsStudentResolutions(target, unclear, row)
                    : unclear;
            stillUnclear.forEach((item) => {
                queue.push({
                    rowIdx,
                    importCohortName: row.importCohortName,
                    targetName: target.name || row.userTargetId,
                    item
                });
            });
            if (domain().listSuspectedDuplicateStudents) {
                const dups = domain().listSuspectedDuplicateStudents(target) || [];
                dups.forEach((dup) => {
                    if (!dup || dup.reason !== 'duplicate_tms_mpidx' || !dup.tmsMpidx) {
                        return;
                    }
                    const dedupeKey = `${row.userTargetId}|${dup.tmsMpidx}`;
                    if (seenDupMpidx.has(dedupeKey)) {
                        return;
                    }
                    seenDupMpidx.add(dedupeKey);
                    const tmsKey = `dup_mpidx:${dup.tmsMpidx}`;
                    if (row.studentResolutions[tmsKey]) {
                        return;
                    }
                    queue.push({
                        rowIdx,
                        importCohortName: row.importCohortName,
                        targetName: target.name || row.userTargetId,
                        item: {
                            tmsName: (dup.students || []).map((s) => s.name).filter(Boolean).join(' / '),
                            tmsNameEn: '',
                            tmsKey,
                            tmsMpidx: dup.tmsMpidx,
                            reason: 'duplicate_tms_mpidx',
                            candidates: (dup.students || []).map((s) => ({
                                id: s.id,
                                name: s.name,
                                nameEn: s.nameEn || ''
                            }))
                        }
                    });
                });
            }
        });
        return queue;
    }

    function collectTmsMissingQueue() {
        const queue = [];
        const transfers =
            domain().detectTmsRosterTransfers
                ? domain().detectTmsRosterTransfers(getCohorts(), tmsSyncPlan)
                : [];
        const transferByStudentId = new Map();
        transfers.forEach((tr) => {
            if (tr && tr.studentId) {
                transferByStudentId.set(tr.studentId, tr);
            }
        });
        tmsSyncPlan.forEach((row, rowIdx) => {
            if (!row || row.userAction !== 'map' || !row.userTargetId) {
                return;
            }
            const target = getCohorts().find((c) => c && c.id === row.userTargetId);
            if (!target || !domain().mergeRosterByKoreanName) {
                return;
            }
            if (!row.missingStudentActions || typeof row.missingStudentActions !== 'object') {
                row.missingStudentActions = {};
            }
            const summary = domain().mergeRosterByKoreanName(target.students, row.students, {
                studentResolutions: row.studentResolutions || {},
                softUnclear: true,
                suppressMissing: Boolean(row.suppressMissingReview),
                archiveStudents: getArchiveStudentsForSync()
            }).summary;
            if (
                Array.isArray(summary.warnings) &&
                summary.warnings.some((w) => w && w.code === 'incomplete_tms_scrape')
            ) {
                return;
            }
            if (row.suppressMissingReview) {
                return;
            }
            const flagged = Array.isArray(summary.flagged) ? summary.flagged : [];
            flagged.forEach((f) => {
                if (!f || !f.id) {
                    return;
                }
                const student = (target.students || []).find((s) => s && s.id === f.id);
                if (!student || student.active === false) {
                    return;
                }
                const transfer = transferByStudentId.get(f.id);
                // Only treat as transfer when this row is the source cohort.
                const transferForRow =
                    transfer && transfer.fromRowIdx === rowIdx ? transfer : null;
                if (!row.missingStudentActions[f.id]) {
                    if (transferForRow) {
                        row.missingStudentActions[f.id] = {
                            action: 'move',
                            toCohortId: transferForRow.toCohortId
                        };
                    } else {
                        row.missingStudentActions[f.id] = { action: 'keep' };
                    }
                }
                queue.push({
                    rowIdx,
                    importCohortName: row.importCohortName,
                    targetName: target.name || row.userTargetId,
                    student: {
                        id: f.id,
                        name: student.name || f.name || '',
                        nameEn: student.nameEn || ''
                    },
                    transfer: transferForRow
                        ? {
                              toCohortId: transferForRow.toCohortId,
                              toCohortName: transferForRow.toCohortName,
                              tmsName: transferForRow.tmsName
                          }
                        : null
                });
            });
        });
        return queue;
    }

    function tmsReviewReasonText(reason) {
        if (reason === 'duplicate_existing') {
            return t('rosterTmsReviewReasonDuplicate');
        }
        if (reason === 'duplicate_tms_mpidx') {
            return t('rosterTmsReviewReasonDuplicateMpidx');
        }
        if (reason === 'restore_from_archive') {
            return t('rosterTmsReviewReasonRestoreArchive');
        }
        if (reason === 'fuzzy_variant') {
            return t('rosterTmsReviewReasonFuzzy');
        }
        if (reason === 'name_mark_change') {
            return t('rosterTmsReviewReasonMarkChange');
        }
        return t('rosterTmsReviewReasonSharedCore');
    }

    function getCurrentReviewResolution() {
        const entry = tmsReviewQueue[tmsReviewIndex];
        if (!entry) {
            return null;
        }
        const row = tmsSyncPlan[entry.rowIdx];
        const key = entry.item.tmsKey;
        return row && row.studentResolutions ? row.studentResolutions[key] : null;
    }

    function setCurrentReviewResolution(action, studentId, mergeDropIds) {
        const entry = tmsReviewQueue[tmsReviewIndex];
        if (!entry) {
            return;
        }
        const row = tmsSyncPlan[entry.rowIdx];
        if (!row) {
            return;
        }
        if (!row.studentResolutions) {
            row.studentResolutions = {};
        }
        if (!row.pendingStudentMerges) {
            row.pendingStudentMerges = [];
        }
        const key = entry.item.tmsKey;
        // Clear prior pending merge for this TMS key
        row.pendingStudentMerges = (row.pendingStudentMerges || []).filter(
            (m) => !m || m.tmsKey !== key
        );
        if (action === 'map') {
            row.studentResolutions[key] = { action: 'map', studentId: String(studentId || '') };
        } else if (action === 'restore') {
            row.studentResolutions[key] = {
                action: 'restore',
                studentId: String(studentId || '')
            };
        } else if (action === 'merge_map') {
            const keepId = String(studentId || '');
            const drops = Array.isArray(mergeDropIds)
                ? mergeDropIds.map((id) => String(id || '')).filter((id) => id && id !== keepId)
                : [];
            drops.forEach((dropId) => {
                row.pendingStudentMerges.push({
                    tmsKey: key,
                    keepId,
                    dropId,
                    profileFrom: 'keep'
                });
            });
            row.studentResolutions[key] = { action: 'map', studentId: keepId };
        } else if (action === 'add') {
            row.studentResolutions[key] = { action: 'add' };
        } else {
            row.studentResolutions[key] = { action: 'skip' };
        }
    }

    function getCurrentMissingAction() {
        const entry = tmsMissingQueue[tmsMissingIndex];
        if (!entry) {
            return null;
        }
        const row = tmsSyncPlan[entry.rowIdx];
        const sid = entry.student && entry.student.id;
        return row && row.missingStudentActions && sid ? row.missingStudentActions[sid] : null;
    }

    function setCurrentMissingAction(action, archiveReason, expectedStartDate, toCohortId) {
        const entry = tmsMissingQueue[tmsMissingIndex];
        if (!entry) {
            return;
        }
        const row = tmsSyncPlan[entry.rowIdx];
        const sid = entry.student && entry.student.id;
        if (!row || !sid) {
            return;
        }
        if (!row.missingStudentActions) {
            row.missingStudentActions = {};
        }
        if (action === 'archive') {
            row.missingStudentActions[sid] = {
                action: 'archive',
                archiveReason: archiveReason || 'left',
                expectedStartDate: expectedStartDate || ''
            };
        } else if (action === 'map') {
            row.missingStudentActions[sid] = {
                action: 'map',
                tmsName: archiveReason || '',
                tmsNameEn: expectedStartDate || '',
                tmsMpidx: toCohortId || ''
            };
        } else if (action === 'move') {
            const dest =
                toCohortId ||
                (entry.transfer && entry.transfer.toCohortId) ||
                '';
            row.missingStudentActions[sid] = {
                action: 'move',
                toCohortId: dest
            };
        } else {
            row.missingStudentActions[sid] = { action: 'keep' };
        }
    }

    function findEditableCohortsMatchingName(tmsName) {
        const cleaned = cleanTmsSyncCohortName(tmsName);
        const exact = String(cleaned || '').trim();
        const norm = normalizeCohortLabelLocal(cleaned);
        return getCohorts().filter((c) => {
            if (!c || domain().isArchiveCohort(c) || !canEditCohort(c)) {
                return false;
            }
            const name = String(c.name || '').trim();
            if (exact && name === exact) {
                return true;
            }
            return Boolean(norm) && normalizeCohortLabelLocal(c.name) === norm;
        });
    }

    function collectTmsCohortConflictQueue() {
        const queue = [];
        tmsSyncPlan.forEach((row, rowIdx) => {
            if (!row || row.userAction !== 'create') {
                return;
            }
            // Already resolved this session as create-anyway.
            if (row.cohortConflictChoice === 'create') {
                return;
            }
            const candidates = findEditableCohortsMatchingName(row.importCohortName);
            if (!candidates.length) {
                return;
            }
            queue.push({
                rowIdx,
                importCohortName: row.importCohortName,
                cleanedName: cleanTmsSyncCohortName(row.importCohortName),
                candidates,
                userChoice: row.cohortConflictChoice || ''
            });
        });
        return queue;
    }

    function getCurrentCohortConflictChoice() {
        const entry = tmsCohortConflictQueue[tmsCohortConflictIndex];
        if (!entry) {
            return null;
        }
        const row = tmsSyncPlan[entry.rowIdx];
        return row ? row.cohortConflictChoice || '' : '';
    }

    function setCurrentCohortConflictChoice(choice, mapTargetId) {
        const entry = tmsCohortConflictQueue[tmsCohortConflictIndex];
        if (!entry) {
            return;
        }
        const row = tmsSyncPlan[entry.rowIdx];
        if (!row) {
            return;
        }
        if (choice === 'map' && mapTargetId) {
            row.cohortConflictChoice = `map:${mapTargetId}`;
            row.userAction = 'map';
            row.userTargetId = String(mapTargetId);
            row.createdCohortId = '';
            row.tmsCreatedCohortId = '';
            row.remembered = false;
            row.studentResolutions = {};
            row.missingStudentActions = {};
            return;
        }
        row.cohortConflictChoice = 'create';
        row.userAction = 'create';
        row.userTargetId = '';
        row.createdCohortId = '';
        row.tmsCreatedCohortId = '';
        row.remembered = false;
        row.studentResolutions = {};
        row.missingStudentActions = {};
    }

    function renderTmsWizardPanel() {
        const review = document.getElementById('rosterTmsStudentReview');
        const mapping = document.getElementById('rosterTmsSyncMappingTable');
        const batchBar = document.getElementById('rosterTmsSyncBatchBar');
        const credForm = document.getElementById('rosterTmsCredForm');
        const confirmBtn = document.getElementById('rosterTmsSyncConfirmBtn');
        const onConflict = tmsSyncWizardStep === 4 && tmsCohortConflictQueue.length > 0;
        const onUnclear = tmsSyncWizardStep === 2 && tmsReviewQueue.length > 0;
        const onMissing = tmsSyncWizardStep === 3 && tmsMissingQueue.length > 0;
        const onReview = onConflict || onUnclear || onMissing;
        if (review) {
            review.hidden = !onReview;
        }
        if (mapping) {
            mapping.hidden = onReview;
        }
        if (batchBar) {
            batchBar.hidden = onReview || Boolean(tmsSyncLoading) || tmsSyncPlan.length === 0;
        }
        if (credForm) {
            credForm.hidden = onReview;
        }
        if (!onReview) {
            if (confirmBtn) {
                confirmBtn.hidden = false;
                confirmBtn.textContent = t('rosterTmsSyncConfirm');
            }
            return;
        }
        if (onConflict) {
            renderTmsCohortConflictReview();
        } else if (onUnclear) {
            renderTmsStudentReview();
        } else {
            renderTmsMissingReview();
        }
    }

    function updateTmsCohortConflictNavButtons() {
        const nextBtn = document.getElementById('rosterTmsStudentReviewNextBtn');
        const choice = getCurrentCohortConflictChoice();
        const ok = choice === 'create' || (typeof choice === 'string' && choice.startsWith('map:'));
        if (nextBtn) {
            nextBtn.disabled = !ok;
        }
    }

    function renderTmsCohortConflictReview() {
        const confirmBtn = document.getElementById('rosterTmsSyncConfirmBtn');
        const entry = tmsCohortConflictQueue[tmsCohortConflictIndex];
        if (!entry) {
            return;
        }
        const progress = document.getElementById('rosterTmsStudentReviewProgress');
        const reasonEl = document.getElementById('rosterTmsStudentReviewReason');
        const nameEl = document.getElementById('rosterTmsStudentReviewName');
        const labelEl = document.getElementById('rosterTmsStudentReviewNameLabel');
        const optionsEl = document.getElementById('rosterTmsStudentReviewOptions');
        const choicesLegend = document.querySelector('#rosterTmsStudentReviewChoices legend');
        const backBtn = document.getElementById('rosterTmsStudentReviewBackBtn');
        const nextBtn = document.getElementById('rosterTmsStudentReviewNextBtn');
        const archiveExtra = document.getElementById('rosterTmsMissingArchiveExtra');
        if (archiveExtra) {
            archiveExtra.hidden = true;
        }
        if (progress) {
            progress.textContent = t('rosterTmsCohortConflictProgress')
                .replace('{current}', String(tmsCohortConflictIndex + 1))
                .replace('{total}', String(tmsCohortConflictQueue.length));
        }
        if (reasonEl) {
            reasonEl.textContent = t('rosterTmsCohortConflictWarn');
        }
        if (labelEl) {
            labelEl.textContent = t('rosterTmsCohortConflictTmsLabel');
        }
        if (nameEl) {
            nameEl.textContent = entry.cleanedName || entry.importCohortName || '';
        }
        if (choicesLegend) {
            choicesLegend.textContent = t('rosterTmsCohortConflictChoicesLabel');
        }
        const selected = getCurrentCohortConflictChoice() || '';
        const opts = [];
        opts.push(
            `<label class="checkbox-label selection-chip"><input type="radio" name="rosterTmsCohortConflictChoice" value="create"${
                selected === 'create' ? ' checked' : ''
            }><span>${escapeHtml(t('rosterTmsCohortConflictCreateAnyway'))}</span></label>`
        );
        (entry.candidates || []).forEach((c) => {
            const val = `map:${c.id}`;
            opts.push(
                `<label class="checkbox-label selection-chip"><input type="radio" name="rosterTmsCohortConflictChoice" value="${escapeHtml(val)}"${
                    selected === val ? ' checked' : ''
                }><span>${escapeHtml(
                    t('rosterTmsCohortConflictMapTo').replace('{name}', c.name || c.id)
                )}</span></label>`
            );
        });
        if (optionsEl) {
            optionsEl.innerHTML = opts.join('');
            optionsEl.querySelectorAll('input[name="rosterTmsCohortConflictChoice"]').forEach((input) => {
                input.addEventListener('change', () => {
                    const val = input.value;
                    if (val === 'create') {
                        setCurrentCohortConflictChoice('create');
                    } else if (val.startsWith('map:')) {
                        setCurrentCohortConflictChoice('map', val.slice(4));
                    }
                    updateTmsCohortConflictNavButtons();
                });
            });
        }
        if (backBtn) {
            backBtn.disabled = false;
            backBtn.textContent =
                tmsCohortConflictIndex === 0
                    ? t('rosterTmsReviewBackToMapping')
                    : t('rosterTmsReviewBack');
        }
        if (nextBtn) {
            nextBtn.textContent =
                tmsCohortConflictIndex >= tmsCohortConflictQueue.length - 1
                    ? t('rosterTmsCohortConflictContinueReview')
                    : t('rosterTmsReviewNext');
        }
        updateTmsCohortConflictNavButtons();
        if (confirmBtn) {
            confirmBtn.hidden = true;
        }
    }

    function renderTmsStudentReview() {
        const confirmBtn = document.getElementById('rosterTmsSyncConfirmBtn');
        const entry = tmsReviewQueue[tmsReviewIndex];
        if (!entry) {
            return;
        }
        const item = entry.item;
        const progress = document.getElementById('rosterTmsStudentReviewProgress');
        const reasonEl = document.getElementById('rosterTmsStudentReviewReason');
        const nameEl = document.getElementById('rosterTmsStudentReviewName');
        const labelEl = document.getElementById('rosterTmsStudentReviewNameLabel');
        const optionsEl = document.getElementById('rosterTmsStudentReviewOptions');
        const choicesLegend = document.querySelector('#rosterTmsStudentReviewChoices legend');
        const backBtn = document.getElementById('rosterTmsStudentReviewBackBtn');
        const nextBtn = document.getElementById('rosterTmsStudentReviewNextBtn');
        const archiveExtra = document.getElementById('rosterTmsMissingArchiveExtra');
        if (archiveExtra) {
            archiveExtra.hidden = true;
        }
        if (progress) {
            progress.textContent = t('rosterTmsReviewProgress')
                .replace('{current}', String(tmsReviewIndex + 1))
                .replace('{total}', String(tmsReviewQueue.length))
                .replace('{class}', entry.targetName || entry.importCohortName || '');
        }
        if (reasonEl) {
            reasonEl.textContent = tmsReviewReasonText(item.reason);
        }
        if (labelEl) {
            labelEl.textContent = t('rosterTmsReviewTmsName');
        }
        if (nameEl) {
            const en = item.tmsNameEn ? ` (${item.tmsNameEn})` : '';
            nameEl.textContent = `${item.tmsName}${en}`;
        }
        if (choicesLegend) {
            choicesLegend.textContent = t('rosterTmsReviewChoicesLabel');
        }
        const existing = getCurrentReviewResolution();
        const selected =
            existing && existing.action === 'map'
                ? `map:${existing.studentId}`
                : existing && existing.action === 'restore'
                  ? `restore:${existing.studentId}`
                  : existing && existing.action === 'add'
                    ? 'add'
                    : existing && existing.action === 'skip'
                      ? 'skip'
                      : '';
        const pendingMerges =
            (tmsSyncPlan[entry.rowIdx] && tmsSyncPlan[entry.rowIdx].pendingStudentMerges) || [];
        const mergeForKey = pendingMerges.find((m) => m && m.tmsKey === item.tmsKey);
        const selectedMerge = mergeForKey ? `merge_map:${mergeForKey.keepId}` : '';
        const opts = [];
        const candidates = item.candidates || [];
        const isRestore = item.reason === 'restore_from_archive';
        const isDupMpidx = item.reason === 'duplicate_tms_mpidx';
        candidates.forEach((c) => {
            const en = c.nameEn ? ` (${c.nameEn})` : '';
            if (isRestore) {
                const val = `restore:${c.id}`;
                opts.push(
                    `<label class="checkbox-label selection-chip"><input type="radio" name="rosterTmsReviewChoice" value="${escapeHtml(val)}"${
                        selected === val && !selectedMerge ? ' checked' : ''
                    }><span>${escapeHtml(
                        t('rosterTmsReviewRestoreFromArchive').replace('{name}', `${c.name}${en}`)
                    )}</span></label>`
                );
                return;
            }
            const val = `map:${c.id}`;
            opts.push(
                `<label class="checkbox-label selection-chip"><input type="radio" name="rosterTmsReviewChoice" value="${escapeHtml(val)}"${
                    selected === val && !selectedMerge ? ' checked' : ''
                }><span>${escapeHtml(t('rosterTmsReviewMapTo').replace('{name}', `${c.name}${en}`))}</span></label>`
            );
        });
        if ((item.reason === 'duplicate_existing' || isDupMpidx) && candidates.length >= 2) {
            candidates.forEach((c) => {
                const en = c.nameEn ? ` (${c.nameEn})` : '';
                const val = `merge_map:${c.id}`;
                opts.push(
                    `<label class="checkbox-label selection-chip"><input type="radio" name="rosterTmsReviewChoice" value="${escapeHtml(val)}"${
                        selectedMerge === val ? ' checked' : ''
                    }><span>${escapeHtml(
                        t('rosterTmsReviewMergeMap').replace('{name}', `${c.name}${en}`)
                    )}</span></label>`
                );
            });
        }
        if (!isDupMpidx) {
            opts.push(
                `<label class="checkbox-label selection-chip"><input type="radio" name="rosterTmsReviewChoice" value="add"${
                    selected === 'add' && !selectedMerge ? ' checked' : ''
                }><span>${escapeHtml(t('rosterTmsReviewAddNew'))}</span></label>`
            );
        }
        opts.push(
            `<label class="checkbox-label selection-chip"><input type="radio" name="rosterTmsReviewChoice" value="skip"${
                selected === 'skip' && !selectedMerge ? ' checked' : ''
            }><span>${escapeHtml(t('rosterTmsReviewSkip'))}</span></label>`
        );
        if (optionsEl) {
            optionsEl.innerHTML = opts.join('');
            optionsEl.querySelectorAll('input[name="rosterTmsReviewChoice"]').forEach((input) => {
                input.addEventListener('change', () => {
                    const val = input.value;
                    if (val === 'add') {
                        setCurrentReviewResolution('add');
                    } else if (val === 'skip') {
                        setCurrentReviewResolution('skip');
                    } else if (val.startsWith('restore:')) {
                        setCurrentReviewResolution('restore', val.slice('restore:'.length));
                    } else if (val.startsWith('merge_map:')) {
                        const keepId = val.slice('merge_map:'.length);
                        const dropIds = candidates
                            .map((c) => c.id)
                            .filter((id) => id && id !== keepId);
                        setCurrentReviewResolution('merge_map', keepId, dropIds);
                    } else if (val.startsWith('map:')) {
                        setCurrentReviewResolution('map', val.slice(4));
                    }
                    updateTmsReviewNavButtons();
                });
            });
        }
        if (backBtn) {
            backBtn.disabled = false;
            backBtn.textContent =
                tmsReviewIndex === 0 ? t('rosterTmsReviewBackToMapping') : t('rosterTmsReviewBack');
        }
        if (nextBtn) {
            nextBtn.textContent =
                tmsReviewIndex >= tmsReviewQueue.length - 1
                    ? t('rosterTmsReviewContinueMissing')
                    : t('rosterTmsReviewNext');
        }
        updateTmsReviewNavButtons();
        if (confirmBtn) {
            confirmBtn.hidden = true;
        }
    }

    function archiveReasonOptionsHtml(selectedReason) {
        const reasons = [
            ['left', 'studentArchiveReasonLeft'],
            ['break', 'studentArchiveReasonBreak'],
            ['new', 'studentArchiveReasonNew'],
            ['starting_soon', 'studentArchiveReasonStartingSoon']
        ];
        return reasons
            .map(([val, key]) => {
                const sel = (selectedReason || 'left') === val ? ' selected' : '';
                return `<option value="${val}"${sel}>${escapeHtml(t(key))}</option>`;
            })
            .join('');
    }

    function renderTmsMissingReview() {
        const confirmBtn = document.getElementById('rosterTmsSyncConfirmBtn');
        const entry = tmsMissingQueue[tmsMissingIndex];
        if (!entry) {
            return;
        }
        const student = entry.student || {};
        const row = tmsSyncPlan[entry.rowIdx];
        const progress = document.getElementById('rosterTmsStudentReviewProgress');
        const reasonEl = document.getElementById('rosterTmsStudentReviewReason');
        const nameEl = document.getElementById('rosterTmsStudentReviewName');
        const labelEl = document.getElementById('rosterTmsStudentReviewNameLabel');
        const optionsEl = document.getElementById('rosterTmsStudentReviewOptions');
        const choicesLegend = document.querySelector('#rosterTmsStudentReviewChoices legend');
        const backBtn = document.getElementById('rosterTmsStudentReviewBackBtn');
        const nextBtn = document.getElementById('rosterTmsStudentReviewNextBtn');
        let archiveExtra = document.getElementById('rosterTmsMissingArchiveExtra');
        if (!archiveExtra) {
            const choices = document.getElementById('rosterTmsStudentReviewChoices');
            if (choices && choices.parentNode) {
                archiveExtra = document.createElement('div');
                archiveExtra.id = 'rosterTmsMissingArchiveExtra';
                archiveExtra.className = 'form-group';
                choices.parentNode.insertBefore(archiveExtra, choices.nextSibling);
            }
        }
        if (progress) {
            progress.textContent = t('rosterTmsMissingProgress')
                .replace('{current}', String(tmsMissingIndex + 1))
                .replace('{total}', String(tmsMissingQueue.length))
                .replace('{class}', entry.targetName || entry.importCohortName || '');
        }
        if (reasonEl) {
            reasonEl.textContent = t('rosterTmsMissingWarn');
        }
        if (labelEl) {
            labelEl.textContent = t('rosterTmsMissingStudentLabel');
        }
        if (nameEl) {
            const en = student.nameEn ? ` (${student.nameEn})` : '';
            nameEl.textContent = `${student.name || ''}${en}`;
        }
        if (choicesLegend) {
            choicesLegend.textContent = t('rosterTmsMissingChoicesLabel');
        }
        const existing = getCurrentMissingAction() || { action: 'keep' };
        const hasTransfer = Boolean(entry.transfer && entry.transfer.toCohortId);
        const tmsCandidates = Array.isArray(row && row.students)
            ? row.students
                  .filter((s) => s && s.name)
                  .map((s) => ({
                      name: String(s.name || ''),
                      nameEn: String(s.nameEn || ''),
                      mpidx: String(s.mpidx || ''),
                      parseUncertain: s.parseUncertain === true
                  }))
            : [];
        let selected = 'keep';
        if (existing.action === 'archive') {
            selected = 'archive';
        } else if (existing.action === 'move' && hasTransfer) {
            selected = 'move';
        } else if (existing.action === 'map' && existing.tmsName) {
            selected = `map:${existing.tmsName}|${existing.tmsNameEn || ''}|${existing.tmsMpidx || ''}`;
        }
        if (optionsEl) {
            const moveLabel = hasTransfer
                ? t('rosterTmsMissingMove').replace(
                      '{class}',
                      entry.transfer.toCohortName || entry.transfer.toCohortId || ''
                  )
                : '';
            const chips = [];
            if (hasTransfer) {
                chips.push(
                    `<label class="checkbox-label selection-chip"><input type="radio" name="rosterTmsMissingChoice" value="move"${
                        selected === 'move' ? ' checked' : ''
                    }><span>${escapeHtml(moveLabel)}</span></label>`
                );
            }
            tmsCandidates.forEach((cand) => {
                const en = cand.nameEn ? ` (${cand.nameEn})` : '';
                const uncertain = cand.parseUncertain
                    ? ` ${t('rosterTmsCandidateUncertain')}`
                    : '';
                const value = `map:${cand.name}|${cand.nameEn || ''}|${cand.mpidx || ''}`;
                const chipClass = cand.parseUncertain
                    ? 'checkbox-label selection-chip is-uncertain'
                    : 'checkbox-label selection-chip';
                chips.push(
                    `<label class="${chipClass}"><input type="radio" name="rosterTmsMissingChoice" value="${escapeHtml(
                        value
                    )}"${selected === value ? ' checked' : ''}><span>${escapeHtml(
                        t('rosterTmsReviewReverseMapTo').replace(
                            '{name}',
                            `${cand.name}${en}${uncertain}`
                        )
                    )}</span></label>`
                );
            });
            chips.push(
                `<label class="checkbox-label selection-chip"><input type="radio" name="rosterTmsMissingChoice" value="keep"${
                    selected === 'keep' ? ' checked' : ''
                }><span>${escapeHtml(t('rosterTmsMissingKeep'))}</span></label>`,
                `<label class="checkbox-label selection-chip"><input type="radio" name="rosterTmsMissingChoice" value="archive"${
                    selected === 'archive' ? ' checked' : ''
                }><span>${escapeHtml(t('rosterTmsMissingArchive'))}</span></label>`
            );
            optionsEl.innerHTML = chips.join('');
            optionsEl.querySelectorAll('input[name="rosterTmsMissingChoice"]').forEach((input) => {
                input.addEventListener('change', () => {
                    if (input.value === 'archive') {
                        const reason =
                            document.getElementById('rosterTmsMissingArchiveReason')?.value || 'left';
                        const start =
                            document.getElementById('rosterTmsMissingArchiveStart')?.value || '';
                        setCurrentMissingAction('archive', reason, start);
                    } else if (input.value === 'move') {
                        setCurrentMissingAction('move');
                    } else if (input.value.startsWith('map:')) {
                        const payload = input.value.slice('map:'.length).split('|');
                        setCurrentMissingAction(
                            'map',
                            payload[0] || '',
                            payload[1] || '',
                            payload[2] || ''
                        );
                    } else {
                        setCurrentMissingAction('keep');
                    }
                    syncTmsMissingArchiveExtra();
                    updateTmsMissingNavButtons();
                });
            });
        }
        if (archiveExtra) {
            archiveExtra.innerHTML = `
                <label for="rosterTmsMissingArchiveReason" class="form-label">${escapeHtml(
                    t('studentArchiveReasonLabel')
                )}</label>
                <select id="rosterTmsMissingArchiveReason" class="field-select">${archiveReasonOptionsHtml(
                    existing.archiveReason
                )}</select>
                <div id="rosterTmsMissingStartWrap" class="form-group" hidden>
                    <label for="rosterTmsMissingArchiveStart" class="form-label">${escapeHtml(
                        t('studentArchiveStartDateLabel')
                    )}</label>
                    <input type="date" id="rosterTmsMissingArchiveStart" class="field-input" value="${escapeHtml(
                        existing.expectedStartDate || ''
                    )}">
                </div>`;
            archiveExtra
                .querySelector('#rosterTmsMissingArchiveReason')
                ?.addEventListener('change', () => {
                    const reason =
                        document.getElementById('rosterTmsMissingArchiveReason')?.value || 'left';
                    const start =
                        document.getElementById('rosterTmsMissingArchiveStart')?.value || '';
                    setCurrentMissingAction('archive', reason, start);
                    syncTmsMissingArchiveExtra();
                    updateTmsMissingNavButtons();
                });
            archiveExtra
                .querySelector('#rosterTmsMissingArchiveStart')
                ?.addEventListener('change', () => {
                    const reason =
                        document.getElementById('rosterTmsMissingArchiveReason')?.value || 'left';
                    const start =
                        document.getElementById('rosterTmsMissingArchiveStart')?.value || '';
                    setCurrentMissingAction('archive', reason, start);
                    updateTmsMissingNavButtons();
                });
        }
        syncTmsMissingArchiveExtra();
        if (backBtn) {
            backBtn.disabled = false;
            backBtn.textContent =
                tmsMissingIndex === 0 ? t('rosterTmsMissingBackToPrior') : t('rosterTmsReviewBack');
        }
        if (nextBtn) {
            nextBtn.textContent =
                tmsMissingIndex >= tmsMissingQueue.length - 1
                    ? t('rosterTmsReviewFinish')
                    : t('rosterTmsReviewNext');
        }
        updateTmsMissingNavButtons();
        if (confirmBtn) {
            confirmBtn.hidden = true;
        }
    }

    function syncTmsMissingArchiveExtra() {
        const extra = document.getElementById('rosterTmsMissingArchiveExtra');
        const action = getCurrentMissingAction();
        const show = action && action.action === 'archive';
        if (extra) {
            extra.hidden = !show;
        }
        const wrap = document.getElementById('rosterTmsMissingStartWrap');
        const reason = document.getElementById('rosterTmsMissingArchiveReason')?.value;
        if (wrap) {
            wrap.hidden = reason !== 'starting_soon';
        }
    }

    function updateTmsReviewNavButtons() {
        const nextBtn = document.getElementById('rosterTmsStudentReviewNextBtn');
        const res = getCurrentReviewResolution();
        const ok =
            res &&
            (res.action === 'add' ||
                res.action === 'skip' ||
                (res.action === 'map' && res.studentId) ||
                (res.action === 'restore' && res.studentId));
        if (nextBtn) {
            nextBtn.disabled = !ok;
        }
    }

    function updateTmsMissingNavButtons() {
        const nextBtn = document.getElementById('rosterTmsStudentReviewNextBtn');
        const action = getCurrentMissingAction() || { action: 'keep' };
        let ok =
            action.action === 'keep' ||
            action.action === 'archive' ||
            (action.action === 'map' && Boolean(action.tmsName)) ||
            (action.action === 'move' && Boolean(action.toCohortId));
        if (action.action === 'archive' && action.archiveReason === 'starting_soon') {
            ok = Boolean(String(action.expectedStartDate || '').trim());
        }
        if (nextBtn) {
            nextBtn.disabled = !ok;
        }
    }

    function enterTmsCohortConflictReview() {
        tmsCohortConflictQueue = collectTmsCohortConflictQueue();
        if (!tmsCohortConflictQueue.length) {
            if (!validateTmsMappedTargets()) {
                return;
            }
            enterTmsStudentReview();
            return;
        }
        tmsSyncWizardStep = 4;
        tmsCohortConflictIndex = 0;
        setTmsSyncError('');
        renderTmsWizardPanel();
    }

    function enterTmsStudentReview() {
        tmsReviewQueue = collectTmsReviewQueue();
        if (!tmsReviewQueue.length) {
            enterTmsMissingReview();
            return;
        }
        tmsSyncWizardStep = 2;
        tmsReviewIndex = 0;
        setTmsSyncError('');
        renderTmsWizardPanel();
    }

    function enterTmsMissingReview() {
        tmsMissingQueue = collectTmsMissingQueue();
        if (!tmsMissingQueue.length) {
            tmsSyncWizardStep = 1;
            void finishTmsSyncApply();
            return;
        }
        tmsSyncWizardStep = 3;
        tmsMissingIndex = 0;
        setTmsSyncError('');
        renderTmsWizardPanel();
    }

    function leaveTmsStudentReviewToMapping() {
        tmsSyncWizardStep = 1;
        const confirmBtn = document.getElementById('rosterTmsSyncConfirmBtn');
        if (confirmBtn) {
            confirmBtn.hidden = false;
        }
        renderTmsSyncTable();
        renderTmsWizardPanel();
    }

    function advanceTmsCohortConflictReview() {
        const choice = getCurrentCohortConflictChoice();
        if (!(choice === 'create' || (typeof choice === 'string' && choice.startsWith('map:')))) {
            setTmsSyncError(t('rosterTmsCohortConflictChoiceRequired'));
            return;
        }
        setTmsSyncError('');
        if (tmsCohortConflictIndex < tmsCohortConflictQueue.length - 1) {
            tmsCohortConflictIndex += 1;
            renderTmsWizardPanel();
            return;
        }
        if (!validateTmsMappedTargets()) {
            leaveTmsStudentReviewToMapping();
            return;
        }
        enterTmsStudentReview();
    }

    function advanceTmsWizard() {
        if (tmsSyncWizardStep === 4) {
            advanceTmsCohortConflictReview();
            return;
        }
        if (tmsSyncWizardStep === 3) {
            advanceTmsMissingReview();
            return;
        }
        advanceTmsStudentReview();
    }

    function backTmsWizard() {
        if (tmsSyncWizardStep === 4) {
            if (tmsCohortConflictIndex === 0) {
                leaveTmsStudentReviewToMapping();
                return;
            }
            tmsCohortConflictIndex -= 1;
            renderTmsWizardPanel();
            return;
        }
        if (tmsSyncWizardStep === 3) {
            if (tmsMissingIndex === 0) {
                if (tmsReviewQueue.length) {
                    tmsSyncWizardStep = 2;
                    tmsReviewIndex = tmsReviewQueue.length - 1;
                    renderTmsWizardPanel();
                } else if (tmsCohortConflictQueue.length) {
                    tmsSyncWizardStep = 4;
                    tmsCohortConflictIndex = tmsCohortConflictQueue.length - 1;
                    renderTmsWizardPanel();
                } else {
                    leaveTmsStudentReviewToMapping();
                }
                return;
            }
            tmsMissingIndex -= 1;
            renderTmsWizardPanel();
            return;
        }
        if (tmsReviewIndex === 0) {
            if (tmsCohortConflictQueue.length) {
                tmsSyncWizardStep = 4;
                tmsCohortConflictIndex = tmsCohortConflictQueue.length - 1;
                renderTmsWizardPanel();
            } else {
                leaveTmsStudentReviewToMapping();
            }
            return;
        }
        tmsReviewIndex -= 1;
        renderTmsWizardPanel();
    }

    function advanceTmsStudentReview() {
        const res = getCurrentReviewResolution();
        if (
            !res ||
            !(
                res.action === 'add' ||
                res.action === 'skip' ||
                (res.action === 'map' && res.studentId) ||
                (res.action === 'restore' && res.studentId)
            )
        ) {
            setTmsSyncError(t('rosterTmsReviewChoiceRequired'));
            return;
        }
        setTmsSyncError('');
        if (tmsReviewIndex < tmsReviewQueue.length - 1) {
            tmsReviewIndex += 1;
            renderTmsWizardPanel();
            return;
        }
        enterTmsMissingReview();
    }

    function advanceTmsMissingReview() {
        const action = getCurrentMissingAction() || { action: 'keep' };
        if (action.action === 'archive' && action.archiveReason === 'starting_soon') {
            if (!String(action.expectedStartDate || '').trim()) {
                setTmsSyncError(t('studentArchiveStartDateRequired'));
                return;
            }
        }
        if (
            action.action !== 'keep' &&
            action.action !== 'archive' &&
            !(action.action === 'map' && action.tmsName) &&
            !(action.action === 'move' && action.toCohortId)
        ) {
            setTmsSyncError(t('rosterTmsMissingChoiceRequired'));
            return;
        }
        setTmsSyncError('');
        if (tmsMissingIndex < tmsMissingQueue.length - 1) {
            tmsMissingIndex += 1;
            renderTmsWizardPanel();
            return;
        }
        tmsSyncWizardStep = 1;
        const confirmBtn = document.getElementById('rosterTmsSyncConfirmBtn');
        if (confirmBtn) {
            confirmBtn.hidden = false;
        }
        void finishTmsSyncApply();
    }

    function renderTmsSyncTable() {
        const mount = document.getElementById('rosterTmsSyncMappingTable');
        const confirmBtn = document.getElementById('rosterTmsSyncConfirmBtn');
        if (!mount) {
            return;
        }
        const cohorts = getCohorts().filter((c) => c && !domain().isArchiveCohort(c));
        const optionsHtml = (selectedId) => {
            const opts = [
                `<option value="__skip__"${selectedId === '__skip__' ? ' selected' : ''}>${escapeHtml(t('rosterTmsSyncSkip'))}</option>`,
                `<option value=""${ !selectedId || selectedId === '' ? ' selected' : ''}>${escapeHtml(t('rosterTmsSyncChoose'))}</option>`,
                `<option value="${TMS_CREATE_VALUE}"${selectedId === TMS_CREATE_VALUE ? ' selected' : ''}>${escapeHtml(t('rosterTmsSyncCreate'))}</option>`
            ];
            cohorts.forEach((c) => {
                const disabled = !canEditCohort(c) ? ' disabled' : '';
                opts.push(
                    `<option value="${escapeHtml(c.id)}"${selectedId === c.id ? ' selected' : ''}${disabled}>${escapeHtml(c.name || c.id)}</option>`
                );
            });
            return opts.join('');
        };

        const rows = tmsSyncPlan
            .map((row, idx) => {
                const selected =
                    row.userAction === 'skip'
                        ? '__skip__'
                        : row.userAction === 'create'
                          ? TMS_CREATE_VALUE
                          : row.userTargetId || '';
                const summary = previewTmsRow(row);
                const warnList = Array.isArray(summary.warnings) ? summary.warnings : [];
                const dupNames = warnList
                    .filter((w) => w && w.code === 'duplicate_existing_name')
                    .map((w) => w.name)
                    .filter(Boolean);
                const fuzzyPairs = warnList
                    .filter((w) => w && w.code === 'fuzzy_syllable_match' && w.name && w.tmsName)
                    .map((w) => `${w.tmsName} -> ${w.name}`);
                const warn = [
                    dupNames.length
                        ? `<div class="section-hint">${escapeHtml(
                              t('rosterTmsSyncWarnDup').replace('{name}', dupNames.join(', '))
                          )}</div>`
                        : '',
                    fuzzyPairs.length
                        ? `<div class="section-hint">${escapeHtml(
                              t('rosterTmsSyncWarnFuzzy').replace('{pair}', fuzzyPairs.join(', '))
                          )}</div>`
                        : ''
                ].join('');
                const clearHintText = buildTmsPreviewExtraHint(summary);
                const clearHint = clearHintText
                    ? `<div class="section-hint">${escapeHtml(clearHintText)}</div>`
                    : '';
                let linkHint = '';
                if (row.remembered) {
                    linkHint = `<div class="section-hint">${escapeHtml(t('rosterTmsSyncRemembered'))}</div>`;
                } else if (row.userAction === 'choose') {
                    linkHint = `<div class="section-hint">${escapeHtml(t('rosterTmsSyncNewClass'))}</div>`;
                    if (row.suggestedTargetId) {
                        const sug = cohorts.find((c) => c.id === row.suggestedTargetId);
                        if (sug) {
                            linkHint += `<div class="section-hint">${escapeHtml(
                                t('rosterTmsSyncSuggested').replace('{name}', sug.name || sug.id)
                            )}</div>`;
                        }
                    }
                } else if (row.userAction === 'create') {
                    linkHint = `<div class="section-hint">${escapeHtml(t('rosterTmsSyncCreatedMapped'))}</div>`;
                }
                return `<tr data-tms-row="${idx}">
                    <td>${escapeHtml(row.importCohortName)}${linkHint}</td>
                    <td>${row.studentCount}</td>
                    <td><select class="field-select roster-tms-target" data-tms-row="${idx}">${optionsHtml(selected)}</select></td>
                    <td>${escapeHtml(buildTmsPreviewLine(summary))}${clearHint}${warn}</td>
                </tr>`;
            })
            .join('');

        mount.innerHTML = `<table class="roster-import-table"><thead><tr>
            <th>${escapeHtml(t('rosterTmsSyncColTms'))}</th>
            <th>${escapeHtml(t('rosterTmsSyncColStudents'))}</th>
            <th>${escapeHtml(t('rosterTmsSyncColTarget'))}</th>
            <th>${escapeHtml(t('rosterTmsSyncColPreview'))}</th>
        </tr></thead><tbody>${
            rows ||
            `<tr><td colspan="4">${escapeHtml(
                tmsSyncHasFetched ? t('rosterTmsSyncEmpty') : t('rosterTmsSyncIdle')
            )}</td></tr>`
        }</tbody></table>`;

        mount.querySelectorAll('select.roster-tms-target').forEach((sel) => {
            sel.addEventListener('change', () => {
                const idx = Number(sel.getAttribute('data-tms-row'));
                const row = tmsSyncPlan[idx];
                if (!row) {
                    return;
                }
                const val = sel.value;
                if (val === '__skip__') {
                    row.userAction = 'skip';
                    row.userTargetId = '';
                    row.createdCohortId = '';
                    row.remembered = false;
                    row.studentResolutions = {};
                    row.missingStudentActions = {};
                    row.cohortConflictChoice = '';
                } else if (val === TMS_CREATE_VALUE) {
                    row.userAction = 'create';
                    row.userTargetId = '';
                    row.createdCohortId = '';
                    row.remembered = false;
                    row.studentResolutions = {};
                    row.missingStudentActions = {};
                    row.cohortConflictChoice = '';
                } else if (!val) {
                    row.userAction = 'choose';
                    row.userTargetId = '';
                    row.createdCohortId = '';
                    row.remembered = false;
                    row.studentResolutions = {};
                    row.missingStudentActions = {};
                    row.cohortConflictChoice = '';
                } else {
                    row.userAction = 'map';
                    row.userTargetId = val;
                    row.createdCohortId = '';
                    row.remembered = false;
                    row.studentResolutions = {};
                    row.missingStudentActions = {};
                    row.cohortConflictChoice = '';
                }
                renderTmsSyncTable();
            });
        });

        const canApply =
            !tmsSyncLoading &&
            tmsSyncPlan.length > 0 &&
            tmsSyncPlan.every(
                (r) =>
                    r.userAction === 'skip' ||
                    r.userAction === 'create' ||
                    (r.userAction === 'map' && r.userTargetId)
            );
        let unclearCount = 0;
        if (canApply) {
            unclearCount = collectTmsReviewQueue().length;
        }
        if (confirmBtn) {
            confirmBtn.hidden =
                tmsSyncWizardStep === 2 || tmsSyncWizardStep === 3 || tmsSyncWizardStep === 4;
            confirmBtn.disabled = !canApply;
            confirmBtn.textContent = unclearCount
                ? t('rosterTmsSyncContinueReview').replace('{count}', String(unclearCount))
                : t('rosterTmsSyncConfirm');
            confirmBtn.dataset.needsReview = unclearCount ? '1' : '0';
        }
        syncTmsBatchBarVisibility();
        if (tmsSyncWizardStep === 2 || tmsSyncWizardStep === 3 || tmsSyncWizardStep === 4) {
            renderTmsWizardPanel();
        }
    }

    function openTmsSyncModal() {
        if (!hooks || !hooks.openModal) {
            return;
        }
        tmsSyncPlan = [];
        tmsSyncLoading = false;
        tmsSyncHasFetched = false;
        tmsSyncWizardStep = 1;
        tmsReviewQueue = [];
        tmsReviewIndex = 0;
        tmsMissingQueue = [];
        tmsMissingIndex = 0;
        tmsCohortConflictQueue = [];
        tmsCohortConflictIndex = 0;
        setTmsSyncError('');
        setTmsSyncStatus('');
        hydrateTmsCredForm();
        renderTmsSyncTable();
        hooks.openModal(document.getElementById('rosterTmsSyncModal'));
        const userEl = document.getElementById('rosterTmsUsername');
        const passEl = document.getElementById('rosterTmsPassword');
        if (userEl && !userEl.value) {
            userEl.focus();
        } else if (passEl) {
            passEl.focus();
        }
    }

    function isLocalClassManagerHost() {
        try {
            if (typeof location === 'undefined') {
                return false;
            }
            const host = String(location.hostname || '').toLowerCase();
            return host === 'localhost' || host === '127.0.0.1';
        } catch (_) {
            return false;
        }
    }

    function tmsBridgeFetchInit(extra) {
        const init = Object.assign(
            {
                credentials: 'omit',
                // Chrome Local Network Access: 127.0.0.1 / localhost are loopback
                // (not LAN "local") — mismatch causes silent block with no prompt.
                targetAddressSpace: 'loopback'
            },
            extra || {}
        );
        return init;
    }

    function getTmsBridgeBaseCandidates() {
        return ['http://127.0.0.1:8080', 'http://localhost:8080'];
    }

    async function probeTmsLocalBridge() {
        // Already on local server — use same-origin preview, not the cross-origin bridge.
        if (isLocalClassManagerHost()) {
            return null;
        }
        const bases = getTmsBridgeBaseCandidates();
        let lastErr = null;
        for (const base of bases) {
            const pingUrl = `${base}/api/tms/bridge/ping`;
            const controller =
                typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), 3000) : null;
            try {
                const res = await fetch(
                    pingUrl,
                    tmsBridgeFetchInit({
                        method: 'GET',
                        signal: controller ? controller.signal : undefined
                    })
                );
                if (timer) {
                    clearTimeout(timer);
                }
                if (!res.ok) {
                    lastErr = new Error(`bridge ping HTTP ${res.status} at ${base}`);
                    continue;
                }
                const body = await res.json().catch(() => null);
                if (!body || body.ok !== true || body.bridge !== true) {
                    lastErr = new Error(`bridge ping invalid JSON at ${base}`);
                    continue;
                }
                return {
                    base,
                    previewUrl: `${base}/api/tms/bridge/preview`
                };
            } catch (err) {
                if (timer) {
                    clearTimeout(timer);
                }
                lastErr = err;
            }
        }
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(
                '[TMS bridge] local probe failed — keep START TEAM CALENDAR.bat running and Allow local network access for classmanager.live',
                lastErr
            );
        }
        return null;
    }

    async function loadTmsSyncPreview() {
        if (!hooks) {
            return;
        }
        if (isRosterReadOnly()) {
            setTmsSyncError(t('rosterImportReadOnly'));
            return;
        }
        const creds = readTmsCredFields();
        persistTmsUsernamePreference(creds.username, creds.rememberUser);

        tmsSyncPlan = [];
        tmsSyncLoading = true;
        tmsSyncHasFetched = false;
        setTmsSyncError('');
        setTmsSyncStatus(t('rosterTmsSyncLoading'));
        renderTmsSyncTable();
        const loadBtn = document.getElementById('rosterTmsLoadBtn');
        if (loadBtn) {
            loadBtn.disabled = true;
        }
        try {
            const payload = {};
            if (creds.username || creds.password) {
                payload.username = creds.username;
                payload.password = creds.password;
            }

            const onLocalHost = isLocalClassManagerHost();
            const bridge = await probeTmsLocalBridge();
            let usedBridge = false;
            let res;

            if (bridge) {
                usedBridge = true;
                setTmsSyncStatus(t('rosterTmsBridgeLoading'));
                res = await fetch(
                    bridge.previewUrl,
                    tmsBridgeFetchInit({
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    })
                );
            } else if (onLocalHost) {
                // Local UI: scrape from this Node process (work IP).
                res = await fetch('/api/tms/roster/preview', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                // Live site without reachable bridge — do not fall back to Worker
                // (Cloudflare IPs are usually blocked by TMS).
                setTmsSyncError(
                    `${t('rosterTmsBridgeMissingHint')} ${t('rosterTmsBridgeLocalNetworkHint')}`
                );
                setTmsSyncStatus('');
                tmsSyncLoading = false;
                if (loadBtn) {
                    loadBtn.disabled = false;
                }
                renderTmsSyncTable();
                return;
            }

            const contentType = String(res.headers.get('content-type') || '').toLowerCase();
            const body = contentType.includes('application/json')
                ? await res.json().catch(() => null)
                : null;
            if (!res.ok) {
                const code = body && body.code;
                if (code === 'TMS_CREDS_MISSING') {
                    setTmsSyncError(t('rosterTmsSyncCredsMissing'));
                } else if (code === 'TMS_LOGIN_FAILED' || res.status === 401) {
                    setTmsSyncError(t('rosterTmsSyncLoginFailed'));
                } else if (res.status === 404 || !body) {
                    setTmsSyncError(t('rosterTmsSyncUnavailable'));
                } else {
                    setTmsSyncError((body && body.error) || t('rosterTmsSyncError'));
                }
                setTmsSyncStatus('');
                tmsSyncLoading = false;
                if (loadBtn) {
                    loadBtn.disabled = false;
                }
                renderTmsSyncTable();
                return;
            }
            if (!body || !Array.isArray(body.cohorts)) {
                setTmsSyncError(t('rosterTmsSyncUnavailable'));
                setTmsSyncStatus('');
                tmsSyncLoading = false;
                if (loadBtn) {
                    loadBtn.disabled = false;
                }
                renderTmsSyncTable();
                return;
            }
            tmsSyncHasFetched = true;
            clearTmsPasswordField();
            const cohorts = body.cohorts;
            const calendar = getCohorts();
            const links = getTmsRosterLinks();
            tmsSyncPlan = cohorts.map((c) => buildTmsPlanRowFromScrape(c, calendar, links));
            if (!tmsSyncPlan.length) {
                setTmsSyncStatus(
                    usedBridge
                        ? `${t('rosterTmsBridgeConnected')} ${t('rosterTmsSyncEmpty')}`
                        : t('rosterTmsSyncEmpty')
                );
            } else {
                const meta = body.meta || {};
                const remembered = tmsSyncPlan.filter((r) => r.remembered).length;
                const needChoose = tmsSyncPlan.filter((r) => r.userAction === 'choose').length;
                let summary = `${meta.cohortCount || tmsSyncPlan.length} classes · ${meta.studentCount || 0} students · ${remembered} remembered · ${needChoose} new`;
                if (meta.sidebarClassCount != null || meta.writingClassCount != null) {
                    const sourceCounts = t('rosterTmsSyncSourceCounts')
                        .replace('{sidebar}', String(meta.sidebarClassCount != null ? meta.sidebarClassCount : 0))
                        .replace('{writing}', String(meta.writingClassCount != null ? meta.writingClassCount : 0));
                    summary = `${summary} · ${sourceCounts}`;
                }
                setTmsSyncStatus(
                    usedBridge ? `${t('rosterTmsBridgeConnected')} ${summary}` : summary
                );
            }
        } catch (err) {
            setTmsSyncError((err && err.message) || t('rosterTmsSyncError'));
            setTmsSyncStatus('');
        }
        tmsSyncLoading = false;
        if (loadBtn) {
            loadBtn.disabled = false;
        }
        renderTmsSyncTable();
    }

    function validateTmsMappedTargets() {
        const mappedTargets = new Set();
        for (const row of tmsSyncPlan) {
            if (!row || row.userAction !== 'map') {
                continue;
            }
            if (!row.userTargetId) {
                setTmsSyncError(t('rosterTmsSyncMappingRequired'));
                return false;
            }
            if (mappedTargets.has(row.userTargetId)) {
                setTmsSyncError(t('rosterTmsSyncDuplicateTarget'));
                return false;
            }
            mappedTargets.add(row.userTargetId);
            const target = getCohorts().find((c) => c && c.id === row.userTargetId);
            if (!canEditCohort(target)) {
                setTmsSyncError(t('rosterTmsSyncNoPermission'));
                return false;
            }
        }
        return true;
    }

    async function confirmTmsSync() {
        setTmsSyncError('');
        for (const row of tmsSyncPlan) {
            if (row.userAction === 'choose') {
                setTmsSyncError(t('rosterTmsSyncMappingRequired'));
                return;
            }
            if (row.userAction === 'create') {
                row.userTargetId = '';
            }
        }
        if (
            !tmsSyncPlan.some((r) => r.userAction === 'map') &&
            !tmsSyncPlan.some((r) => r.userAction === 'skip') &&
            !tmsSyncPlan.some((r) => r.userAction === 'create')
        ) {
            closeTmsSyncModal();
            return;
        }
        // Resolve cohort-name collisions for create rows before map validation / student review.
        const conflicts = collectTmsCohortConflictQueue();
        if (conflicts.length) {
            enterTmsCohortConflictReview();
            return;
        }
        if (!validateTmsMappedTargets()) {
            return;
        }
        const pendingUnclear = collectTmsReviewQueue().filter((entry) => {
            const row = tmsSyncPlan[entry.rowIdx];
            const key = entry.item && entry.item.tmsKey;
            const res = row && row.studentResolutions && key ? row.studentResolutions[key] : null;
            return !(
                res &&
                (res.action === 'add' ||
                    res.action === 'skip' ||
                    (res.action === 'map' && res.studentId) ||
                    (res.action === 'restore' && res.studentId))
            );
        });
        if (pendingUnclear.length) {
            enterTmsStudentReview();
            return;
        }
        enterTmsMissingReview();
    }

    async function finishTmsSyncApply() {
        setTmsSyncError('');
        let cohorts = getCohorts();
        const appData = hooks.getAppData ? hooks.getAppData() : {};
        let mergedWorking = null;
        // Apply queued local duplicate merges before roster plan (TMS map targets keepId).
        if (domain().mergeStudentRecords) {
            let working = Object.assign({}, appData, { cohorts });
            let didMerge = false;
            for (const row of tmsSyncPlan) {
                const merges = (row && row.pendingStudentMerges) || [];
                for (const m of merges) {
                    if (!m || !m.keepId || !m.dropId) {
                        continue;
                    }
                    const merged = domain().mergeStudentRecords(working, {
                        keepId: m.keepId,
                        dropId: m.dropId,
                        profileFrom: m.profileFrom || 'keep',
                        clearOffRoster: true
                    });
                    if (merged.error) {
                        setTmsSyncError(t('studentMergeFailed'));
                        return;
                    }
                    working = merged.appData;
                    cohorts = working.cohorts;
                    didMerge = true;
                }
            }
            if (didMerge) {
                mergedWorking = working;
            }
        }
        const moveTransfers = [];
        for (const row of tmsSyncPlan) {
            if (!row || row.userAction !== 'map' || !row.userTargetId) {
                continue;
            }
            const actions = row.missingStudentActions || {};
            for (const sid of Object.keys(actions)) {
                const act = actions[sid];
                if (!act || act.action !== 'move' || !act.toCohortId) {
                    continue;
                }
                moveTransfers.push({
                    studentId: sid,
                    fromCohortId: row.userTargetId,
                    toCohortId: act.toCohortId
                });
            }
        }
        if (moveTransfers.length && domain().applyTmsRosterTransfers) {
            const moved = domain().applyTmsRosterTransfers(cohorts, moveTransfers);
            if (moved.errors && moved.errors.length) {
                setTmsSyncError(t('rosterTmsMissingMoveFailed'));
                return;
            }
            cohorts = moved.cohorts;
        }
        let pendingBookChecks = hooks.getAppData
            ? hooks.getAppData().pendingDebateBookChecks
            : [];
        let didRecordBookChecks = false;
        if (moveTransfers.length && domain().recordDebateBookChecksForMoves && hooks.getAppData) {
            const recorded = domain().recordDebateBookChecksForMoves(
                Object.assign({}, hooks.getAppData(), { cohorts }),
                moveTransfers,
                { newId: () => domain().newId('dbc') }
            );
            pendingBookChecks = recorded.appData.pendingDebateBookChecks;
            didRecordBookChecks = true;
        }
        const applied = domain().applyTmsRosterPlan(cohorts, tmsSyncPlan, {
            newStudentId: () => domain().newId('stu'),
            newCohortId: () => domain().newId('cohort'),
            homeroomTeacherUserId: hooks.getCurrentUserId ? hooks.getCurrentUserId() : ''
        });
        cohorts = applied.cohorts;
        (applied.results || []).forEach((result, idx) => {
            const row = tmsSyncPlan[idx];
            if (row && result && result.created && result.targetId) {
                row.createdCohortId = result.targetId;
            }
        });
        const hrId = hooks.getCurrentUserId ? hooks.getCurrentUserId() : '';
        const movedIds = new Set(moveTransfers.map((tr) => tr.studentId));
        for (const row of tmsSyncPlan) {
            if (!row || row.userAction !== 'map' || !row.userTargetId) {
                continue;
            }
            const actions = row.missingStudentActions || {};
            for (const sid of Object.keys(actions)) {
                if (movedIds.has(sid)) {
                    continue;
                }
                const act = actions[sid];
                if (act && act.action === 'map' && act.tmsName) {
                    const parsedMarks = domain().parseKoreanNameMarks
                        ? domain().parseKoreanNameMarks(act.tmsName)
                        : null;
                    const canonicalName =
                        (domain().canonicalKoreanStoredName &&
                            domain().canonicalKoreanStoredName(act.tmsName)) ||
                        (parsedMarks && parsedMarks.identityKey) ||
                        act.tmsName ||
                        '';
                    const syncedTags = [];
                    if (parsedMarks && parsedMarks.isNew) {
                        syncedTags.push('new');
                    }
                    if (parsedMarks && parsedMarks.shuttle) {
                        syncedTags.push('shuttle');
                    }
                    if (parsedMarks && parsedMarks.transferIn) {
                        syncedTags.push('transfer_in');
                    }
                    if (act.tmsMpidx && domain().mergeStudentRecords) {
                        let conflictingId = '';
                        cohorts.some((cohort) =>
                            (cohort && Array.isArray(cohort.students) ? cohort.students : []).some((stu) => {
                                if (!stu || stu.id === sid) {
                                    return false;
                                }
                                if (String(stu.tmsMpidx || '') !== String(act.tmsMpidx || '')) {
                                    return false;
                                }
                                conflictingId = stu.id;
                                return true;
                            })
                        );
                        if (conflictingId) {
                            const baseApp = mergedWorking || (hooks.getAppData ? hooks.getAppData() : {});
                            const merged = domain().mergeStudentRecords(
                                Object.assign({}, baseApp, { cohorts }),
                                {
                                    keepId: sid,
                                    dropId: conflictingId,
                                    profileFrom: 'keep',
                                    clearOffRoster: true
                                }
                            );
                            if (merged.error) {
                                setTmsSyncError(t('studentMergeFailed'));
                                return;
                            }
                            mergedWorking = merged.appData;
                            cohorts = merged.appData.cohorts;
                        }
                    }
                    cohorts = cohorts.map((cohort) => {
                        if (!cohort || cohort.id !== row.userTargetId) {
                            return cohort;
                        }
                        const students = (cohort.students || []).map((stu) => {
                            if (!stu || stu.id !== sid) {
                                return stu;
                            }
                            const tags = Array.isArray(stu.tags)
                                ? stu.tags.filter(
                                      (tag) =>
                                          tag !== 'off_roster' &&
                                          tag !== 'new' &&
                                          tag !== 'shuttle' &&
                                          tag !== 'transfer_in'
                                  )
                                : [];
                            syncedTags.forEach((tag) => {
                                if (!tags.includes(tag)) {
                                    tags.push(tag);
                                }
                            });
                            return Object.assign({}, stu, {
                                name: canonicalName || stu.name,
                                nameEn: act.tmsNameEn || stu.nameEn || '',
                                tmsMpidx: act.tmsMpidx || stu.tmsMpidx || '',
                                tags
                            });
                        });
                        return Object.assign({}, cohort, { students });
                    });
                    continue;
                }
                if (!act || act.action !== 'archive') {
                    continue;
                }
                if (!domain().archiveStudent) {
                    continue;
                }
                const result = domain().archiveStudent(cohorts, sid, row.userTargetId, {
                    archiveReason: act.archiveReason || 'left',
                    expectedStartDate: act.expectedStartDate || '',
                    homeroomTeacherUserId: hrId
                });
                if (result.error) {
                    setTmsSyncError(t('studentArchiveFailed'));
                    return;
                }
                cohorts = result.cohorts;
            }
        }
        const nextLinks = domain().upsertTmsRosterLinks
            ? domain().upsertTmsRosterLinks(getTmsRosterLinks(), tmsSyncPlan, cohorts)
            : getTmsRosterLinks();
        try {
            const savePayload = { cohorts, tmsRosterLinks: nextLinks };
            if (didRecordBookChecks) {
                savePayload.pendingDebateBookChecks = pendingBookChecks;
            }
            if (mergedWorking) {
                savePayload.attendanceSessions = mergedWorking.attendanceSessions;
                savePayload.homeworkCompletions = mergedWorking.homeworkCompletions;
                savePayload.essaySubmissions = mergedWorking.essaySubmissions;
                savePayload.studentPoints = mergedWorking.studentPoints;
                savePayload.studentTests = mergedWorking.studentTests;
                savePayload.debateScores = mergedWorking.debateScores;
                savePayload.debateTeamSessions = mergedWorking.debateTeamSessions;
                savePayload.speakingTestRecords = mergedWorking.speakingTestRecords;
                savePayload.dayNotes = mergedWorking.dayNotes;
                if (Array.isArray(mergedWorking.pendingDebateBookChecks) && !didRecordBookChecks) {
                    savePayload.pendingDebateBookChecks = mergedWorking.pendingDebateBookChecks;
                }
            }
            await hooks.saveClassroom(savePayload);
            if (typeof hooks.refreshTabWarnings === 'function') {
                hooks.refreshTabWarnings();
            }
            dirty = false;
            hooks.showToast(t('rosterTmsSyncSuccess'));
            closeTmsSyncModal();
            render(document.getElementById('panel-students'));
        } catch (err) {
            setTmsSyncError(err.message || String(err));
        }
    }

    function setupRosterImportExport(panel) {
        if (!panel || panel.dataset.rosterIoBound === '1') {
            return;
        }
        panel.dataset.rosterIoBound = '1';

        const importMenu = panel.querySelector('.classroom-roster-import-menu');
        const closeImportMenu = () => {
            if (importMenu) {
                importMenu.open = false;
            }
        };
        panel.querySelector('#classroomRosterImportBtn')?.addEventListener('click', () => {
            document.getElementById('classroomRosterImportFile')?.click();
            closeImportMenu();
        });
        panel.querySelector('#classroomRosterEssayTrackerImportBtn')?.addEventListener('click', () => {
            document.getElementById('classroomRosterImportFile')?.click();
            closeImportMenu();
        });
        panel.querySelector('#classroomRosterImportFile')?.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            readImportFile(file);
            e.target.value = '';
        });
        panel.querySelector('#classroomRosterExportAllBtn')?.addEventListener('click', () => exportRoster('all'));
        panel.querySelector('#classroomRosterExportSelectedBtn')?.addEventListener('click', () => exportRoster('selected'));
        panel.querySelector('#classroomRosterPasteBtn')?.addEventListener('click', () => {
            closeImportMenu();
            openPasteModal();
        });
        panel.querySelector('#classroomRosterTmsSyncBtn')?.addEventListener('click', () => {
            closeImportMenu();
            openTmsSyncModal();
        });

        document.getElementById('closeRosterPasteModal')?.addEventListener('click', closePasteModal);
        document.getElementById('cancelRosterPasteBtn')?.addEventListener('click', closePasteModal);
        document.getElementById('closeRosterTmsSyncModal')?.addEventListener('click', closeTmsSyncModal);
        document.getElementById('cancelRosterTmsSyncBtn')?.addEventListener('click', closeTmsSyncModal);
        document.getElementById('rosterTmsLoadBtn')?.addEventListener('click', () => {
            void loadTmsSyncPreview();
        });
        document.getElementById('rosterTmsBridgeTestBtn')?.addEventListener('click', () => {
            window.open('http://127.0.0.1:8080/api/tms/bridge/ping', '_blank', 'noopener,noreferrer');
        });
        document.getElementById('rosterTmsPassword')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void loadTmsSyncPreview();
            }
        });
        document.getElementById('rosterTmsSyncConfirmBtn')?.addEventListener('click', () => {
            void confirmTmsSync();
        });
        document.getElementById('rosterTmsStudentReviewBackBtn')?.addEventListener('click', () => {
            setTmsSyncError('');
            backTmsWizard();
        });
        document.getElementById('rosterTmsStudentReviewNextBtn')?.addEventListener('click', () => {
            advanceTmsWizard();
        });
        document.getElementById('rosterTmsSyncSkipAllBtn')?.addEventListener('click', () => {
            skipAllTmsSyncRows();
        });
        document.getElementById('rosterTmsSyncCreateAllBtn')?.addEventListener('click', () => {
            createAllTmsSyncRows();
        });
        document.getElementById('rosterTmsSyncSkipUnmappedBtn')?.addEventListener('click', () => {
            skipUnmappedTmsSyncRows();
        });
        document.getElementById('rosterPasteConfirmBtn')?.addEventListener('click', () => {
            void confirmRosterPaste();
        });
        document.getElementById('rosterPasteText')?.addEventListener('input', () => {
            setPasteError('');
            schedulePastePreview(false);
        });
        document.getElementById('rosterPasteText')?.addEventListener('paste', () => {
            setTimeout(() => schedulePastePreview(true), 0);
        });
        document.querySelectorAll('input[name="rosterPasteMergeMode"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                syncPasteMergeSwitchUi();
                schedulePastePreview(Boolean(pastePlanRow) || Boolean(document.getElementById('rosterPasteText')?.value.trim()));
            });
        });

        document.getElementById('closeRosterImportModal')?.addEventListener('click', closeImportModal);
        document.getElementById('cancelRosterImportBtn')?.addEventListener('click', closeImportModal);
        document.getElementById('rosterImportBackBtn')?.addEventListener('click', () => {
            importWizardStep = 1;
            setImportError('');
            updateImportWizardUi();
        });
        document.getElementById('rosterImportContinueBtn')?.addEventListener('click', () => {
            const ri = rosterImport();
            if (!ri) {
                return;
            }
            const validation = ri.validateImportPlan(importPlan);
            if (!validation.ok) {
                setImportError(importErrorMessage(validation.error));
                return;
            }
            setImportError('');
            importWizardStep = 2;
            updateImportWizardUi();
        });
        document.getElementById('rosterImportConfirmBtn')?.addEventListener('click', () => {
            void confirmRosterImport();
        });
        document.querySelectorAll('input[name="rosterImportMergeGlobal"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                if (importWizardStep === 2) {
                    importPlan.forEach((row) => {
                        row.perMergeMode = false;
                    });
                    renderImportPreviewTable();
                }
            });
        });
    }

    function isArchiveCohort(cohort) {
        const d = domain();
        return d && d.isArchiveCohort ? d.isArchiveCohort(cohort) : false;
    }

    function sortCohortsForList(cohorts) {
        const regular = [];
        const archive = [];
        (cohorts || []).forEach((c) => {
            if (isArchiveCohort(c)) {
                archive.push(c);
            } else {
                regular.push(c);
            }
        });
        return regular.concat(archive);
    }

    function getArchiveRetentionDays() {
        return hooks && hooks.getArchiveRetentionDays ? hooks.getArchiveRetentionDays() : 90;
    }

    function renderCohortList(mountEl) {
        const d = domain();
        let cohorts = getCohorts();
        if (d && d.ensureArchiveCohort) {
            const ensured = d.ensureArchiveCohort(cohorts, {
                homeroomTeacherUserId: hooks.getCurrentUserId ? hooks.getCurrentUserId() : ''
            });
            if (ensured.created) {
                cohorts = ensured.cohorts;
            }
        }
        const q = (mountEl.querySelector('#classroomRosterCohortSearch')?.value || '').toLowerCase();
        const listEl = mountEl.querySelector('#classroomRosterCohortList');
        if (!listEl) {
            return;
        }
        listEl.innerHTML = '';
        sortCohortsForList(cohorts)
            .filter((c) => !q || (c.name || '').toLowerCase().includes(q) || isArchiveCohort(c))
            .forEach((cohort) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                let cls = 'module-list-item' + (cohort.id === selectedCohortId ? ' is-selected' : '');
                if (isArchiveCohort(cohort)) {
                    cls += ' is-archive-cohort';
                }
                btn.className = cls;
                const count = d ? d.normalizeCohortStudents(cohort).length : 0;
                const label = isArchiveCohort(cohort) ? t('studentArchiveCohortName') : cohort.name || cohort.id;
                btn.textContent = `${label} (${count})`;
                btn.addEventListener('click', () => {
                    selectedCohortId = cohort.id;
                    selectedStudentId = null;
                    clearStudentBulkSelection();
                    render(mountEl.closest('#panel-students') || mountEl.parentElement);
                });
                listEl.appendChild(btn);
            });
        if (!selectedCohortId && cohorts.length) {
            const first = sortCohortsForList(cohorts).find((c) => !isArchiveCohort(c)) || cohorts[0];
            selectedCohortId = first.id;
        }
    }

    function renderStudentList(mountEl) {
        const cohort = getSelectedCohort();
        const listEl = mountEl.querySelector('#classroomRosterStudentList');
        if (!listEl) {
            return;
        }
        listEl.innerHTML = '';
        if (!cohort) {
            listEl.innerHTML = `<p class="section-hint">${escapeHtml(t('classroomPickCohort'))}</p>`;
            return;
        }
        const d = domain();
        const students = d ? d.normalizeCohortStudents(cohort) : [];
        const retentionDays = getArchiveRetentionDays();
        const bulkEditable = canEditRoster();
        const searchQ = (mountEl.querySelector('#classroomRosterStudentSearch')?.value || '').trim().toLowerCase();
        const visibleStudents = searchQ
            ? students.filter((student) => studentSearchHaystack(student).includes(searchQ))
            : students;
        if (searchQ && !visibleStudents.length) {
            listEl.innerHTML = `<p class="section-hint module-list-empty">${escapeHtml(t('studentListSearchEmpty'))}</p>`;
            updateBulkActionsUi();
            return;
        }
        visibleStudents.forEach((student) => {
            const row = document.createElement('div');
            let rowCls = 'classroom-roster-student-row';
            if (student.id === selectedStudentId) {
                rowCls += ' is-selected';
            }
            if (!student.active) {
                rowCls += ' is-inactive';
            }
            if (isArchiveCohort(cohort) && d && d.isPastArchiveRetention(student, retentionDays)) {
                rowCls += ' is-past-retention';
            }
            row.className = rowCls;

            if (bulkEditable) {
                const chkLabel = document.createElement('label');
                chkLabel.className = 'classroom-roster-student-check';
                const chk = document.createElement('input');
                chk.type = 'checkbox';
                chk.checked = selectedStudentIds.has(student.id);
                chk.addEventListener('change', () => {
                    if (chk.checked) {
                        selectedStudentIds.add(student.id);
                    } else {
                        selectedStudentIds.delete(student.id);
                    }
                    updateBulkActionsUi();
                });
                chk.addEventListener('click', (e) => e.stopPropagation());
                chkLabel.appendChild(chk);
                row.appendChild(chkLabel);
            }

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'module-list-item classroom-roster-student-name';
            const avatar = document.createElement('span');
            avatar.className = 'classroom-roster-student-avatar';
            avatar.setAttribute('aria-hidden', 'true');
            avatar.textContent = studentInitial(student);
            btn.appendChild(avatar);
            const textWrap = document.createElement('span');
            textWrap.className = 'classroom-roster-student-text';
            const primary = document.createElement('span');
            primary.className = 'classroom-roster-student-primary';
            primary.textContent = student.name || student.id;
            textWrap.appendChild(primary);
            if (student.nameEn) {
                const secondary = document.createElement('span');
                secondary.className = 'classroom-roster-student-secondary section-hint';
                secondary.textContent = student.nameEn;
                textWrap.appendChild(secondary);
            }
            if (student.expectedStartDate && student.archiveReason === 'starting_soon') {
                const meta = document.createElement('span');
                meta.className = 'classroom-roster-student-meta section-hint';
                meta.textContent = student.expectedStartDate;
                textWrap.appendChild(meta);
            }
            const rowApi = global.CCPClassroomStudentRow;
            if (rowApi && typeof rowApi.buildTagBadges === 'function') {
                const tagsHtml = rowApi.buildTagBadges(student, t);
                if (tagsHtml) {
                    const tagsMount = document.createElement('span');
                    tagsMount.className = 'classroom-roster-student-tags';
                    tagsMount.innerHTML = tagsHtml;
                    textWrap.appendChild(tagsMount);
                }
            }
            btn.appendChild(textWrap);
            btn.addEventListener('click', () => {
                selectedStudentId = student.id;
                renderStudentEditor(mountEl);
                renderStudentList(mountEl);
            });
            row.appendChild(btn);
            if (bulkEditable && !isArchiveCohort(cohort)) {
                const actions = document.createElement('div');
                actions.className = 'classroom-roster-student-row-actions';
                const moveBtn = document.createElement('button');
                moveBtn.type = 'button';
                moveBtn.className = 'btn btn-outline btn-compact';
                moveBtn.textContent = t('studentMoveConfirm');
                moveBtn.setAttribute('data-roster-action', 'move');
                moveBtn.setAttribute('data-student-id', student.id);
                const statusBtn = document.createElement('button');
                statusBtn.type = 'button';
                statusBtn.className = 'btn btn-outline btn-compact';
                statusBtn.textContent = t('studentBulkStatusTitle');
                statusBtn.setAttribute('data-roster-action', 'status');
                statusBtn.setAttribute('data-student-id', student.id);
                actions.appendChild(moveBtn);
                actions.appendChild(statusBtn);
                row.appendChild(actions);
            }
            listEl.appendChild(row);
        });
        updateBulkActionsUi();
    }

    function getStudentFromForm() {
        const name = (document.getElementById('classroomStudentName')?.value || '').trim();
        const nameEn = (document.getElementById('classroomStudentNameEn')?.value || '').trim();
        const locationTag = (document.getElementById('classroomStudentLocation')?.value || '').trim();
        const memo = (document.getElementById('classroomStudentMemo')?.value || '').trim();
        const active = document.getElementById('classroomStudentActive')?.checked !== false;
        const tags = [];
        if (document.getElementById('classroomStudentTagNew')?.checked) {
            tags.push('new');
        }
        if (document.getElementById('classroomStudentTagEnding')?.checked) {
            tags.push('ending_soon');
        }
        if (document.getElementById('classroomStudentTagInterested')?.checked) {
            tags.push('interested');
        }
        if (document.getElementById('classroomStudentTagOffRoster')?.checked) {
            tags.push('off_roster');
        }
        if (document.getElementById('classroomStudentTagShuttle')?.checked) {
            tags.push('shuttle');
        }
        if (document.getElementById('classroomStudentTagTransferIn')?.checked) {
            tags.push('transfer_in');
        }
        return { name, nameEn, locationTag, memo, active, tags };
    }

    function fillStudentForm(student) {
        const s = student || {};
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                el.value = val == null ? '' : val;
            }
        };
        const setChk = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                el.checked = Boolean(val);
            }
        };
        set('classroomStudentName', s.name);
        set('classroomStudentNameEn', s.nameEn);
        set('classroomStudentLocation', s.locationTag);
        set('classroomStudentMemo', s.memo);
        setChk('classroomStudentActive', s.active !== false);
        const tags = Array.isArray(s.tags) ? s.tags : [];
        setChk('classroomStudentTagNew', tags.includes('new'));
        setChk('classroomStudentTagEnding', tags.includes('ending_soon'));
        setChk('classroomStudentTagInterested', tags.includes('interested'));
        setChk('classroomStudentTagOffRoster', tags.includes('off_roster'));
        setChk('classroomStudentTagShuttle', tags.includes('shuttle'));
        setChk('classroomStudentTagTransferIn', tags.includes('transfer_in'));
    }

    function buildStudentTaggedNotesHtml(student) {
        if (!student || !hooks || typeof hooks.getStudentTaggedNotes !== 'function') {
            return '';
        }
        const notes = hooks.getStudentTaggedNotes(student.id) || [];
        const title = escapeHtml(t('studentProfileNotesTitle'));
        if (!notes.length) {
            return `<section class="student-profile-notes" aria-labelledby="studentProfileNotesHeading">
                <h4 id="studentProfileNotesHeading" class="form-section-subtitle">${title}</h4>
                <p class="section-hint">${escapeHtml(t('studentProfileNotesEmpty'))}</p>
            </section>`;
        }
        const items = notes.map((note) => {
            const meta = hooks.resolveDayNoteMeta
                ? hooks.resolveDayNoteMeta(note.classId)
                : { className: '' };
            const dateLabel = hooks.formatDateDisplay
                ? hooks.formatDateDisplay(note.date)
                : String(note.date || '');
            const catBadge = hooks.buildDayNoteCategoryBadgeHtml
                ? hooks.buildDayNoteCategoryBadgeHtml(note.categoryId)
                : '';
            const bodyHtml = hooks.renderDayNoteTextHtml
                ? hooks.renderDayNoteTextHtml(note)
                : escapeHtml(note.text || '');
            const metaLine = [dateLabel, meta.className].filter(Boolean).join(' · ');
            return `<article class="student-profile-note-item">
                <div class="student-profile-note-meta">${escapeHtml(metaLine)} ${catBadge}</div>
                <p class="student-profile-note-body">${bodyHtml}</p>
            </article>`;
        }).join('');
        return `<section class="student-profile-notes" aria-labelledby="studentProfileNotesHeading">
            <h4 id="studentProfileNotesHeading" class="form-section-subtitle">${title}</h4>
            <div class="student-profile-notes-list">${items}</div>
        </section>`;
    }

    function renderStudentEditor(mountEl) {
        const editor = mountEl.querySelector('#classroomRosterEditor');
        if (!editor) {
            return;
        }
        const cohort = getSelectedCohort();
        const editable = canEditRoster();
        const inArchive = cohort && isArchiveCohort(cohort);
        const d = domain();
        const students = cohort && d ? d.normalizeCohortStudents(cohort) : [];
        const student = students.find((s) => s.id === selectedStudentId) || null;
        const canArchive = cohort && student && !inArchive && access() && access().canArchiveStudent(cohort);
        const canRestore = cohort && student && inArchive && editable;
        const canDelete = student && hooks && hooks.canDeleteStudents && hooks.canDeleteStudents();
        let retentionHint = '';
        if (student && inArchive && d && d.isPastArchiveRetention(student, getArchiveRetentionDays())) {
            retentionHint = `<p class="section-hint roster-import-error">${escapeHtml(t('studentArchivePastRetention'))}</p>`;
        } else if (student && inArchive && student.archivedAt) {
            retentionHint = `<p class="section-hint">${escapeHtml(t('studentArchiveSince').replace('{date}', student.archivedAt.slice(0, 10)))}</p>`;
        }

        editor.innerHTML = `
            <div class="classroom-roster-student-card">
            <h3 class="form-section-title">${escapeHtml(student ? t('classroomEditStudent') : t('classroomAddStudent'))}</h3>
            ${!cohort ? `<div class="classroom-roster-empty-card"><p class="section-hint">${escapeHtml(t('classroomRosterPickCohortHint'))}</p></div>` : ''}
            ${cohort && !editable ? `<p class="section-hint">${escapeHtml(t('classroomRosterReadOnly'))}</p>` : ''}
            ${inArchive ? `<p class="section-hint">${escapeHtml(t('studentArchiveCohortHint'))}</p>` : ''}
            ${retentionHint}
            ${cohort ? `
            <section class="classroom-roster-form-section">
              <h4 class="form-section-subtitle">${escapeHtml(t('classroomRosterSectionIdentity'))}</h4>
              <div class="form-group"><label for="classroomStudentName">${escapeHtml(t('classroomStudentName'))}</label>
              <input type="text" id="classroomStudentName" class="field-input" ${editable ? '' : 'disabled'} /></div>
              <div class="form-group"><label for="classroomStudentNameEn">${escapeHtml(t('classroomStudentNameEn'))}</label>
              <input type="text" id="classroomStudentNameEn" class="field-input" ${editable ? '' : 'disabled'} /></div>
            </section>
            <section class="classroom-roster-form-section">
              <h4 class="form-section-subtitle">${escapeHtml(t('classroomRosterSectionDetails'))}</h4>
              <div class="form-group"><label for="classroomStudentLocation">${escapeHtml(t('classroomStudentLocation'))}</label>
              <input type="text" id="classroomStudentLocation" class="field-input" ${editable ? '' : 'disabled'} /></div>
              <div class="form-group"><label for="classroomStudentMemo">${escapeHtml(t('classroomStudentMemo'))}</label>
              <textarea id="classroomStudentMemo" class="field-input" rows="2" ${editable ? '' : 'disabled'}></textarea></div>
            </section>
            ${student ? buildStudentTaggedNotesHtml(student) : ''}
            <section class="classroom-roster-form-section">
              <h4 class="form-section-subtitle">${escapeHtml(t('classroomRosterSectionStatus'))}</h4>
              <div class="form-group"><label class="checkbox-label"><input type="checkbox" id="classroomStudentActive" ${editable ? '' : 'disabled'} /> ${escapeHtml(t('classroomStudentActive'))}</label></div>
              <fieldset class="form-group classroom-roster-tags-fieldset"><legend>${escapeHtml(t('classroomStudentTags'))}</legend>
              <label class="checkbox-label selection-chip"><input type="checkbox" id="classroomStudentTagNew" ${editable ? '' : 'disabled'} /> ${escapeHtml(t('classroomTagNew'))}</label>
              <label class="checkbox-label selection-chip"><input type="checkbox" id="classroomStudentTagEnding" ${editable ? '' : 'disabled'} /> ${escapeHtml(t('classroomTagEndingSoon'))}</label>
              <label class="checkbox-label selection-chip"><input type="checkbox" id="classroomStudentTagInterested" ${editable ? '' : 'disabled'} /> ${escapeHtml(t('classroomTagInterested'))}</label>
              <label class="checkbox-label selection-chip"><input type="checkbox" id="classroomStudentTagOffRoster" ${editable ? '' : 'disabled'} /> ${escapeHtml(t('classroomTagOffRoster'))}</label>
              <label class="checkbox-label selection-chip"><input type="checkbox" id="classroomStudentTagShuttle" ${editable ? '' : 'disabled'} /> ${escapeHtml(t('classroomTagShuttle'))}</label>
              <label class="checkbox-label selection-chip"><input type="checkbox" id="classroomStudentTagTransferIn" ${editable ? '' : 'disabled'} /> ${escapeHtml(t('classroomTagTransferIn'))}</label>
              </fieldset>
            </section>
            <div class="form-actions classroom-student-actions classroom-roster-student-actions">
            ${student ? `<button type="button" class="btn btn-outline" id="classroomStudentPrintTermSummary">${escapeHtml(t('termSummaryPrintStudent'))}</button>` : ''}
            ${editable && !inArchive ? `<button type="button" class="btn btn-primary btn-small" id="classroomStudentSave">${escapeHtml(t('save'))}</button>` : ''}
            ${editable && student && !inArchive ? `<button type="button" class="btn btn-outline" id="classroomStudentMove">${escapeHtml(t('studentMoveBtn'))}</button>` : ''}
            ${editable && student && !inArchive ? `<button type="button" class="btn btn-outline" id="classroomStudentStatus">${escapeHtml(t('studentBulkStatusBtn'))}</button>` : ''}
            ${editable && student && !inArchive ? `<button type="button" class="btn btn-outline" id="classroomStudentDeactivate">${escapeHtml(student.active ? t('classroomDeactivateStudent') : t('classroomActivateStudent'))}</button>` : ''}
            ${canArchive ? `<button type="button" class="btn btn-outline" id="classroomStudentArchive">${escapeHtml(t('studentArchiveBtn'))}</button>` : ''}
            ${canRestore ? `<button type="button" class="btn btn-outline" id="classroomStudentRestore">${escapeHtml(t('studentRestoreBtn'))}</button>` : ''}
            ${editable && student && !inArchive ? `<button type="button" class="btn btn-outline" id="classroomStudentMerge">${escapeHtml(t('studentMergeBtn'))}</button>` : ''}
            ${canDelete ? `<button type="button" class="btn btn-outline btn-danger-outline" id="classroomStudentDelete">${escapeHtml(t('studentDeleteBtn'))}</button>` : ''}
            </div>` : ''}
            </div>`;

        fillStudentForm(student);

        if (cohort && editable && !student) {
            editor.querySelector('#classroomStudentName')?.focus();
        }

        editor.querySelector('#classroomStudentSave')?.addEventListener('click', () => saveStudent(mountEl));
        editor.querySelector('#classroomStudentPrintTermSummary')?.addEventListener('click', () => {
            if (student && hooks && typeof hooks.printStudentTermSummary === 'function') {
                hooks.printStudentTermSummary(student.id);
            }
        });
        editor.querySelector('#classroomStudentMove')?.addEventListener('click', () => openMoveModal());
        editor.querySelector('#classroomStudentStatus')?.addEventListener('click', () => openBulkStatusModal());
        editor.querySelector('#classroomStudentDeactivate')?.addEventListener('click', () => toggleActive(mountEl));
        editor.querySelector('#classroomStudentArchive')?.addEventListener('click', () => openArchiveModal());
        editor.querySelector('#classroomStudentRestore')?.addEventListener('click', () => openRestoreModal());
        editor.querySelector('#classroomStudentMerge')?.addEventListener('click', () => openMergeModal());
        editor.querySelector('#classroomStudentDelete')?.addEventListener('click', () => openDeleteModal());
        updateBulkActionsUi();
    }

    async function saveCohorts(cohorts) {
        if (!hooks || !hooks.saveClassroom) {
            return;
        }
        await hooks.saveClassroom({ cohorts });
        dirty = false;
    }

    function applyStudentToCohort(mutator) {
        const cohorts = getCohorts().map((c) => {
            if (!c || c.id !== selectedCohortId) {
                return c;
            }
            const copy = Object.assign({}, c, {
                students: Array.isArray(c.students) ? c.students.map((s) => Object.assign({}, s)) : []
            });
            mutator(copy);
            return copy;
        });
        return cohorts;
    }

    async function saveStudent(mountEl) {
        const form = getStudentFromForm();
        if (!form.name) {
            hooks.showToast(t('classroomStudentNameRequired'), true);
            return;
        }
        const d = domain();
        const cohorts = applyStudentToCohort((cohort) => {
            let students = d.normalizeCohortStudents(cohort);
            if (selectedStudentId) {
                students = students.map((s) => {
                    if (s.id !== selectedStudentId) {
                        return s;
                    }
                    return Object.assign({}, s, form);
                });
            } else {
                const id = d.newId('stu');
                students.push(
                    Object.assign({}, form, {
                        id,
                        sortOrder: students.length
                    })
                );
                selectedStudentId = id;
            }
            cohort.students = d.normalizeCohortStudents({ students });
        });
        try {
            await saveCohorts(cohorts);
            hooks.showToast(t('saved'));
            render(mountEl.closest('#panel-students') || mountEl.parentElement);
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
        }
    }

    async function toggleActive(mountEl) {
        const cohorts = applyStudentToCohort((cohort) => {
            cohort.students = (cohort.students || []).map((s) => {
                if (s.id !== selectedStudentId) {
                    return s;
                }
                return Object.assign({}, s, { active: !s.active });
            });
        });
        try {
            await saveCohorts(cohorts);
            render(mountEl.closest('#panel-students') || mountEl.parentElement);
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
        }
    }

    function syncArchiveStartDateVisibility() {
        const reason = document.getElementById('studentArchiveReason')?.value;
        const wrap = document.getElementById('studentArchiveStartDateWrap');
        if (wrap) {
            wrap.hidden = reason !== 'starting_soon';
        }
    }

    function openArchiveModal(options) {
        const opts = options || {};
        archiveBulkMode = Boolean(opts.bulk);
        const titleEl = document.getElementById('studentArchiveModalTitle');
        const hintEl = document.getElementById('studentArchiveHint');
        if (archiveBulkMode) {
            if (titleEl) {
                titleEl.textContent = t('studentBulkArchiveTitle');
            }
            if (hintEl) {
                hintEl.textContent = t('studentBulkArchiveHint').replace(
                    '{count}',
                    String(targetStudentIds().length)
                );
            }
        } else {
            if (titleEl) {
                titleEl.textContent = t('studentArchiveTitle');
            }
            if (hintEl) {
                hintEl.textContent = t('studentArchiveHint');
            }
        }
        syncArchiveStartDateVisibility();
        if (hooks && hooks.openModal) {
            hooks.openModal(document.getElementById('studentArchiveModal'));
        }
    }

    function closeArchiveModal() {
        archiveBulkMode = false;
        if (hooks && hooks.closeModal) {
            hooks.closeModal(document.getElementById('studentArchiveModal'));
        }
    }

    async function confirmArchiveStudent() {
        const d = domain();
        if (!d || !selectedCohortId) {
            return;
        }
        const reason = document.getElementById('studentArchiveReason')?.value || 'break';
        const expectedStartDate = document.getElementById('studentArchiveStartDate')?.value || '';
        if (reason === 'starting_soon' && !expectedStartDate) {
            hooks.showToast(t('studentArchiveStartDateRequired'), true);
            return;
        }
        const meta = {
            archiveReason: reason,
            expectedStartDate,
            homeroomTeacherUserId: hooks.getCurrentUserId ? hooks.getCurrentUserId() : ''
        };

        let result;
        if (archiveBulkMode) {
            const ids = targetStudentIds();
            if (!ids.length) {
                hooks.showToast(t('studentMoveNoSelection'), true);
                return;
            }
            result = d.archiveStudents
                ? d.archiveStudents(getCohorts(), ids, selectedCohortId, meta)
                : { error: 'missing_helper' };
        } else {
            if (!selectedStudentId) {
                return;
            }
            result = d.archiveStudent(getCohorts(), selectedStudentId, selectedCohortId, meta);
            if (!result.error) {
                result.archivedCount = 1;
            }
        }
        if (result.error) {
            hooks.showToast(t('studentArchiveFailed'), true);
            return;
        }
        try {
            await saveCohorts(result.cohorts);
            selectedCohortId = result.archiveCohortId || selectedCohortId;
            selectedStudentId = null;
            clearStudentBulkSelection();
            closeArchiveModal();
            const count = result.archivedCount || 1;
            hooks.showToast(
                count > 1
                    ? t('studentBulkArchiveDone').replace('{count}', String(count))
                    : t('studentArchiveDone')
            );
            render(document.getElementById('panel-students'));
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
        }
    }

    function openBulkArchiveModal() {
        if (isRosterReadOnly()) {
            hooks.showToast(t('rosterImportReadOnly'), true);
            return;
        }
        const cohort = getSelectedCohort();
        if (!cohort || !canEditRoster() || isArchiveCohort(cohort)) {
            hooks.showToast(t('studentMoveNoPermission'), true);
            return;
        }
        if (!targetStudentIds().length) {
            hooks.showToast(t('studentMoveNoSelection'), true);
            return;
        }
        openArchiveModal({ bulk: true });
    }

    function resetBulkStatusForm() {
        const activeSel = document.getElementById('studentBulkStatusActive');
        if (activeSel) {
            activeSel.value = 'leave';
        }
        [
            'studentBulkAddTagNew',
            'studentBulkAddTagEnding',
            'studentBulkAddTagInterested',
            'studentBulkAddTagOffRoster',
            'studentBulkAddTagShuttle',
            'studentBulkAddTagTransferIn',
            'studentBulkRemoveTagNew',
            'studentBulkRemoveTagEnding',
            'studentBulkRemoveTagInterested',
            'studentBulkRemoveTagOffRoster',
            'studentBulkRemoveTagShuttle',
            'studentBulkRemoveTagTransferIn'
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.checked = false;
            }
        });
    }

    function openBulkStatusModal() {
        if (isRosterReadOnly()) {
            hooks.showToast(t('rosterImportReadOnly'), true);
            return;
        }
        const cohort = getSelectedCohort();
        if (!cohort || !canEditRoster() || isArchiveCohort(cohort)) {
            hooks.showToast(t('studentMoveNoPermission'), true);
            return;
        }
        const ids = targetStudentIds();
        if (!ids.length) {
            hooks.showToast(t('studentMoveNoSelection'), true);
            return;
        }
        const hint = document.getElementById('studentBulkStatusHint');
        if (hint) {
            hint.textContent = t('studentBulkStatusHint').replace(
                '{count}',
                String(ids.length)
            );
        }
        resetBulkStatusForm();
        openRosterModal(document.getElementById('studentBulkStatusModal'));
    }

    function closeBulkStatusModal() {
        if (isRosterModalGuarded()) {
            return;
        }
        if (hooks && hooks.closeModal) {
            hooks.closeModal(document.getElementById('studentBulkStatusModal'));
        }
    }

    function collectBulkTagIds(prefix) {
        const map = [
            [`${prefix}New`, 'new'],
            [`${prefix}Ending`, 'ending_soon'],
            [`${prefix}Interested`, 'interested'],
            [`${prefix}OffRoster`, 'off_roster'],
            [`${prefix}Shuttle`, 'shuttle'],
            [`${prefix}TransferIn`, 'transfer_in']
        ];
        return map
            .filter(([id]) => document.getElementById(id)?.checked)
            .map(([, tag]) => tag);
    }

    async function confirmBulkStatus() {
        const d = domain();
        const cohort = getSelectedCohort();
        const ids = targetStudentIds();
        if (!d || !cohort || !ids.length || !d.updateStudentsInCohort) {
            hooks.showToast(t('studentMoveNoSelection'), true);
            return;
        }
        const activeVal = document.getElementById('studentBulkStatusActive')?.value || 'leave';
        const addTags = collectBulkTagIds('studentBulkAddTag');
        const removeTags = collectBulkTagIds('studentBulkRemoveTag');
        let active = null;
        if (activeVal === 'yes') {
            active = true;
        } else if (activeVal === 'no') {
            active = false;
        }
        if (active === null && !addTags.length && !removeTags.length) {
            hooks.showToast(t('studentBulkStatusNoChange'), true);
            return;
        }
        const result = d.updateStudentsInCohort(
            getCohorts(),
            cohort.id,
            ids,
            { addTags, removeTags, active }
        );
        if (result.error) {
            hooks.showToast(t('studentBulkStatusFailed'), true);
            return;
        }
        try {
            await saveCohorts(result.cohorts);
            clearStudentBulkSelection();
            closeBulkStatusModal();
            hooks.showToast(
                t('studentBulkStatusDone').replace('{count}', String(result.updatedCount || 0))
            );
            render(document.getElementById('panel-students'));
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
        }
    }

    function openRestoreModal() {
        const sel = document.getElementById('studentRestoreCohortSelect');
        if (!sel) {
            return;
        }
        const d = domain();
        sel.innerHTML = '';
        sortCohortsForList(getCohorts())
            .filter((c) => c && !d.isArchiveCohort(c) && canEditCohort(c))
            .forEach((c) => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name || c.id;
                sel.appendChild(opt);
            });
        if (hooks && hooks.openModal) {
            hooks.openModal(document.getElementById('studentRestoreModal'));
        }
    }

    function closeRestoreModal() {
        if (hooks && hooks.closeModal) {
            hooks.closeModal(document.getElementById('studentRestoreModal'));
        }
    }

    async function confirmRestoreStudent() {
        const d = domain();
        const toId = document.getElementById('studentRestoreCohortSelect')?.value;
        const restoringIds = targetStudentIds();
        if (!d || !restoringIds.length || !toId) {
            return;
        }
        const result = restoringIds.length > 1 && d.restoreStudentsFromArchive
            ? d.restoreStudentsFromArchive(getCohorts(), restoringIds, toId)
            : d.restoreStudentFromArchive(getCohorts(), restoringIds[0], toId);
        if (result.error) {
            hooks.showToast(t('studentRestoreFailed'), true);
            return;
        }
        try {
            await saveCohorts(result.cohorts);
            selectedCohortId = toId;
            clearStudentBulkSelection();
            closeRestoreModal();
            hooks.showToast(t('studentRestoreDone'));
            render(document.getElementById('panel-students'));
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
        }
    }

    function openDeleteModal() {
        const err = document.getElementById('studentDeleteError');
        const pwd = document.getElementById('studentDeletePassword');
        if (err) {
            err.hidden = true;
            err.textContent = '';
        }
        if (pwd) {
            pwd.value = '';
        }
        if (hooks && hooks.openModal) {
            hooks.openModal(document.getElementById('studentDeleteModal'));
        }
    }

    function closeDeleteModal() {
        if (hooks && hooks.closeModal) {
            hooks.closeModal(document.getElementById('studentDeleteModal'));
        }
    }

    function fillMergeStudentSelects(preferDropId) {
        const d = domain();
        const cohort = getSelectedCohort();
        const keepSelect = document.getElementById('studentMergeKeepSelect');
        const dropSelect = document.getElementById('studentMergeDropSelect');
        if (!d || !cohort || !keepSelect || !dropSelect) {
            return;
        }
        const students = d.normalizeCohortStudents(cohort).filter((s) => s && s.active !== false);
        const options = students
            .map((s) => {
                const en = s.nameEn ? ` (${s.nameEn})` : '';
                const off = Array.isArray(s.tags) && s.tags.includes('off_roster') ? ' · off roster' : '';
                return `<option value="${escapeHtml(s.id)}">${escapeHtml(`${s.name}${en}${off}`)}</option>`;
            })
            .join('');
        keepSelect.innerHTML = options;
        dropSelect.innerHTML = options;
        if (selectedStudentId) {
            keepSelect.value = selectedStudentId;
        }
        const dropDefault =
            preferDropId && preferDropId !== keepSelect.value
                ? preferDropId
                : students.find((s) => s.id !== keepSelect.value)?.id || '';
        if (dropDefault) {
            dropSelect.value = dropDefault;
        }
        const summary = document.getElementById('studentMergeSummary');
        if (summary) {
            const suspects = d.listSuspectedDuplicateStudents
                ? d.listSuspectedDuplicateStudents(cohort)
                : [];
            summary.textContent = suspects.length
                ? t('studentMergeSuspectHint').replace('{count}', String(suspects.length))
                : t('studentMergePickHint');
        }
    }

    function openMergeModal(preferDropId) {
        const err = document.getElementById('studentMergeError');
        if (err) {
            err.hidden = true;
            err.textContent = '';
        }
        fillMergeStudentSelects(preferDropId);
        const keepSelect = document.getElementById('studentMergeKeepSelect');
        const dropSelect = document.getElementById('studentMergeDropSelect');
        if (!keepSelect || !dropSelect || !keepSelect.options.length) {
            hooks.showToast(t('studentMergeNeedTwo'), true);
            return;
        }
        if (hooks && hooks.openModal) {
            openRosterModal(document.getElementById('studentMergeModal'));
        }
    }

    function closeMergeModal() {
        if (isRosterModalGuarded()) {
            return;
        }
        if (hooks && hooks.closeModal) {
            hooks.closeModal(document.getElementById('studentMergeModal'));
        }
    }

    async function confirmMergeStudent() {
        const d = domain();
        const errEl = document.getElementById('studentMergeError');
        const keepId = document.getElementById('studentMergeKeepSelect')?.value || '';
        const dropId = document.getElementById('studentMergeDropSelect')?.value || '';
        const profileFrom =
            document.querySelector('input[name="studentMergeProfileFrom"]:checked')?.value || 'keep';
        if (!d || !d.mergeStudentRecords) {
            return;
        }
        if (!keepId || !dropId || keepId === dropId) {
            if (errEl) {
                errEl.textContent = t('studentMergeSameIds');
                errEl.hidden = false;
            }
            return;
        }
        const appData = hooks.getAppData ? hooks.getAppData() : {};
        const result = d.mergeStudentRecords(appData, {
            keepId,
            dropId,
            profileFrom,
            clearOffRoster: true
        });
        if (result.error) {
            if (errEl) {
                errEl.textContent =
                    result.error === 'cross_cohort'
                        ? t('studentMergeCrossCohort')
                        : t('studentMergeFailed');
                errEl.hidden = false;
            }
            return;
        }
        try {
            await hooks.saveClassroom({
                cohorts: result.appData.cohorts,
                attendanceSessions: result.appData.attendanceSessions,
                homeworkCompletions: result.appData.homeworkCompletions,
                essaySubmissions: result.appData.essaySubmissions,
                studentPoints: result.appData.studentPoints,
                studentTests: result.appData.studentTests,
                debateScores: result.appData.debateScores,
                debateTeamSessions: result.appData.debateTeamSessions,
                speakingTestRecords: result.appData.speakingTestRecords,
                dayNotes: result.appData.dayNotes
            });
            selectedStudentId = keepId;
            closeMergeModal();
            hooks.showToast(t('studentMergeDone'));
            render(document.getElementById('panel-students'));
        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message || String(err);
                errEl.hidden = false;
            }
        }
    }

    async function confirmDeleteStudent() {
        const d = domain();
        const pwd = document.getElementById('studentDeletePassword')?.value || '';
        const errEl = document.getElementById('studentDeleteError');
        const deletingIds = targetStudentIds();
        if (!d || !deletingIds.length || !selectedCohortId || !pwd) {
            if (errEl) {
                errEl.textContent = t('studentDeletePasswordRequired');
                errEl.hidden = false;
            }
            return;
        }
        try {
            await hooks.verifyAdminPassword(pwd);
        } catch (_err) {
            if (errEl) {
                errEl.textContent = t('studentDeletePasswordInvalid');
                errEl.hidden = false;
            }
            return;
        }
        const del = deletingIds.length > 1 && d.deleteStudentsPermanently
            ? d.deleteStudentsPermanently(getCohorts(), deletingIds, selectedCohortId)
            : d.deleteStudentPermanently(getCohorts(), deletingIds[0], selectedCohortId);
        if (del.error) {
            hooks.showToast(t('studentDeleteFailed'), true);
            return;
        }
        const appData = hooks.getAppData ? hooks.getAppData() : {};
        let purged = Object.assign({}, appData, { cohorts: del.cohorts });
        deletingIds.forEach((sid) => {
            purged = d.purgeStudentRecords(purged, sid);
        });
        try {
            await hooks.saveClassroom({
                cohorts: purged.cohorts,
                attendanceSessions: purged.attendanceSessions,
                homeworkCompletions: purged.homeworkCompletions,
                essaySubmissions: purged.essaySubmissions,
                studentPoints: purged.studentPoints,
                studentTests: purged.studentTests
            });
            selectedStudentId = null;
            clearStudentBulkSelection();
            closeDeleteModal();
            hooks.showToast(t('studentDeleteDone'));
            render(document.getElementById('panel-students'));
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
        }
    }

    function syncRetentionSettingsUi(panel) {
        const wrap = document.getElementById('classroomArchiveRetentionWrap');
        const input = document.getElementById('classroomArchiveRetentionDays');
        const canAdmin = hooks && hooks.canDeleteStudents && hooks.canDeleteStudents();
        if (wrap) {
            wrap.hidden = !canAdmin;
        }
        if (input && hooks && hooks.getArchiveRetentionDays) {
            input.value = String(hooks.getArchiveRetentionDays());
        }
        if (input && !input.dataset.bound) {
            input.dataset.bound = '1';
            input.addEventListener('change', () => {
                if (hooks.setArchiveRetentionDays) {
                    void hooks.setArchiveRetentionDays(Number(input.value));
                }
            });
        }
    }

    function setupStudentRowActions(panel) {
        const list = panel && panel.querySelector('#classroomRosterStudentList');
        if (!list || list.dataset.rowActionsBound === '1') {
            return;
        }
        list.dataset.rowActionsBound = '1';
        list.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('[data-roster-action]');
            if (!actionBtn || !list.contains(actionBtn)) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const sid = actionBtn.getAttribute('data-student-id');
            const action = actionBtn.getAttribute('data-roster-action');
            if (!sid) {
                return;
            }
            selectedStudentId = sid;
            selectedStudentIds.clear();
            selectedStudentIds.add(sid);
            updateBulkActionsUi();
            if (action === 'move') {
                openMoveModal();
            } else if (action === 'status') {
                openBulkStatusModal();
            }
        });
    }

    function setupStudentMoveModal() {
        if (document.body.dataset.studentMoveModalBound === '1') {
            return;
        }
        document.body.dataset.studentMoveModalBound = '1';
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn || !btn.id) {
                return;
            }
            if (btn.id === 'classroomRosterSelectAllBtn') {
                selectAllStudentsInCohort();
                render(document.getElementById('panel-students'));
                return;
            }
            if (btn.id === 'classroomRosterClearSelectionBtn') {
                clearStudentBulkSelection();
                render(document.getElementById('panel-students'));
                return;
            }
            if (btn.id === 'classroomRosterMoveBtn') {
                openMoveModal();
                return;
            }
            if (btn.id === 'classroomRosterBulkStatusBtn') {
                openBulkStatusModal();
                return;
            }
            if (btn.id === 'classroomRosterBulkArchiveBtn') {
                openBulkArchiveModal();
                return;
            }
            if (btn.id === 'classroomRosterBulkRestoreBtn') {
                openRestoreModal();
                return;
            }
            if (btn.id === 'classroomRosterBulkDeleteBtn') {
                openDeleteModal();
            }
        });
        document.getElementById('closeStudentMoveModal')?.addEventListener('click', closeMoveModal);
        document.getElementById('cancelStudentMoveBtn')?.addEventListener('click', closeMoveModal);
        document.getElementById('confirmStudentMoveBtn')?.addEventListener('click', () => {
            void confirmMoveStudents();
        });
        document.getElementById('closeStudentBulkStatusModal')?.addEventListener('click', closeBulkStatusModal);
        document.getElementById('cancelStudentBulkStatusBtn')?.addEventListener('click', closeBulkStatusModal);
        document.getElementById('confirmStudentBulkStatusBtn')?.addEventListener('click', () => {
            void confirmBulkStatus();
        });
    }

    function setupArchiveModals() {
        if (document.body.dataset.studentArchiveModalsBound === '1') {
            return;
        }
        document.body.dataset.studentArchiveModalsBound = '1';
        document.getElementById('closeStudentArchiveModal')?.addEventListener('click', closeArchiveModal);
        document.getElementById('cancelStudentArchiveBtn')?.addEventListener('click', closeArchiveModal);
        document.getElementById('confirmStudentArchiveBtn')?.addEventListener('click', () => {
            void confirmArchiveStudent();
        });
        document.getElementById('studentArchiveReason')?.addEventListener('change', syncArchiveStartDateVisibility);
        document.getElementById('closeStudentRestoreModal')?.addEventListener('click', closeRestoreModal);
        document.getElementById('cancelStudentRestoreBtn')?.addEventListener('click', closeRestoreModal);
        document.getElementById('confirmStudentRestoreBtn')?.addEventListener('click', () => {
            void confirmRestoreStudent();
        });
        document.getElementById('closeStudentDeleteModal')?.addEventListener('click', closeDeleteModal);
        document.getElementById('cancelStudentDeleteBtn')?.addEventListener('click', closeDeleteModal);
        document.getElementById('confirmStudentDeleteBtn')?.addEventListener('click', () => {
            void confirmDeleteStudent();
        });
        document.getElementById('closeStudentMergeModal')?.addEventListener('click', closeMergeModal);
        document.getElementById('cancelStudentMergeBtn')?.addEventListener('click', closeMergeModal);
        document.getElementById('confirmStudentMergeBtn')?.addEventListener('click', () => {
            void confirmMergeStudent();
        });
    }

    function render(panel) {
        if (!panel) {
            return;
        }
        renderCohortList(panel);
        renderStudentList(panel);
        renderStudentEditor(panel);

        panel.querySelector('#classroomRosterAddBtn')?.addEventListener('click', () => {
            selectedStudentId = null;
            renderStudentEditor(panel);
            const nameInput = panel.querySelector('#classroomStudentName');
            if (nameInput) {
                nameInput.focus();
            }
        }, { once: true });

        panel.querySelector('#classroomRosterCohortSearch')?.addEventListener('input', () => {
            renderCohortList(panel);
        }, { once: true });

        panel.querySelector('#classroomRosterStudentSearch')?.addEventListener('input', () => {
            renderStudentList(panel);
        }, { once: true });

        setupRosterImportExport(panel);
        setupStudentRowActions(panel);
        setupStudentMoveModal();
        setupArchiveModals();
        syncRetentionSettingsUi(panel);
    }

    function initTab(h, options) {
        hooks = h;
        const panel = document.getElementById('panel-students');
        if (options && options.cohortId) {
            selectedCohortId = options.cohortId;
        }
        setupRosterImportExport(panel);
        setupStudentRowActions(panel);
        setupStudentMoveModal();
        setupArchiveModals();
        syncRetentionSettingsUi(panel);
        render(panel);
    }

    global.CCPClassroomRoster = {
        initTab,
        render,
        studentSearchHaystack,
        studentInitial
    };
})(typeof window !== 'undefined' ? window : globalThis);
