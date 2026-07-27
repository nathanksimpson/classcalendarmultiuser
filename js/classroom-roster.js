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
    const selectedStudentIds = new Set();

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

    function canEditRoster() {
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
        if (hooks.isViewOnly && hooks.isViewOnly()) {
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
            mergeMode: getPasteMergeMode()
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
        if (hooks.isViewOnly && hooks.isViewOnly()) {
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

    function updateBulkActionsUi() {
        const wrap = document.getElementById('classroomRosterBulkActions');
        const moveBtn = document.getElementById('classroomRosterMoveBtn');
        const statusBtn = document.getElementById('classroomRosterBulkStatusBtn');
        const archiveBtn = document.getElementById('classroomRosterBulkArchiveBtn');
        const cohort = getSelectedCohort();
        const editable = cohort && canEditRoster() && !isArchiveCohort(cohort);
        if (wrap) {
            wrap.hidden = !editable;
        }
        const hasSel = selectedStudentIds.size > 0;
        if (moveBtn) {
            moveBtn.disabled = !hasSel;
        }
        if (statusBtn) {
            statusBtn.disabled = !hasSel;
        }
        if (archiveBtn) {
            archiveBtn.disabled = !hasSel;
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
        if (hooks && hooks.isViewOnly && hooks.isViewOnly()) {
            hooks.showToast(t('rosterImportReadOnly'), true);
            return;
        }
        const cohort = getSelectedCohort();
        if (!cohort || !canEditRoster() || isArchiveCohort(cohort)) {
            hooks.showToast(t('studentMoveNoPermission'), true);
            return;
        }
        if (!selectedStudentIds.size) {
            hooks.showToast(t('studentMoveNoSelection'), true);
            return;
        }
        const hint = document.getElementById('studentMoveHint');
        if (hint) {
            hint.textContent = t('studentMoveHint')
                .replace('{count}', String(selectedStudentIds.size))
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
        if (hooks && hooks.openModal) {
            hooks.openModal(document.getElementById('studentMoveModal'));
        }
    }

    function closeMoveModal() {
        setMoveError('');
        if (hooks && hooks.closeModal) {
            hooks.closeModal(document.getElementById('studentMoveModal'));
        }
    }

    async function confirmMoveStudents() {
        const d = domain();
        const fromCohort = getSelectedCohort();
        const toId = document.getElementById('studentMoveCohortSelect')?.value;
        if (!d || !fromCohort || !toId || !selectedStudentIds.size) {
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
            Array.from(selectedStudentIds)
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
            await saveCohorts(result.cohorts);
            const targetName = target?.name || toId;
            hooks.showToast(
                t('studentMoveSuccess')
                    .replace('{count}', String(result.movedCount || selectedStudentIds.size))
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
        tmsSyncPlan = [];
        tmsSyncLoading = false;
        tmsSyncHasFetched = false;
        tmsSyncWizardStep = 1;
        tmsReviewQueue = [];
        tmsReviewIndex = 0;
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
        });
        setTmsSyncError('');
        renderTmsSyncTable();
    }

    function skipUnmappedTmsSyncRows() {
        tmsSyncPlan.forEach((row) => {
            if (row.userAction === 'choose' || (!row.userTargetId && row.userAction !== 'skip' && row.userAction !== 'map')) {
                row.userAction = 'skip';
                row.userTargetId = '';
                row.remembered = false;
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
            studentResolutions: {},
            userAction: resolved.userAction,
            userTargetId: resolved.userTargetId || '',
            suggestedTargetId: resolved.suggestedTargetId || '',
            remembered: Boolean(resolved.remembered),
            linkSource: resolved.source || 'none'
        };
    }

    function buildTmsPreviewLine(summary) {
        const s = summary || {};
        return t('rosterTmsSyncPreviewLine')
            .replace('{added}', String((s.added && s.added.length) || 0))
            .replace('{matched}', String((s.matched && s.matched.length) || 0))
            .replace('{flagged}', String((s.flagged && s.flagged.length) || 0))
            .replace('{cleared}', String((s.cleared && s.cleared.length) || 0));
    }

    function buildTmsPreviewExtraHint(summary) {
        const s = summary || {};
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

    function previewTmsRow(row) {
        if (!row || row.userAction !== 'map' || !row.userTargetId) {
            return { added: [], matched: [], flagged: [], cleared: [], warnings: [], unclear: [] };
        }
        const target = getCohorts().find((c) => c && c.id === row.userTargetId);
        if (!target || !domain().mergeRosterByKoreanName) {
            return { added: [], matched: [], flagged: [], cleared: [], warnings: [], unclear: [] };
        }
        const unclear = domain().listUnclearTmsStudentMatches
            ? domain().listUnclearTmsStudentMatches(target.students, row.students)
            : [];
        const summary = domain().mergeRosterByKoreanName(target.students, row.students, {
            studentResolutions: row.studentResolutions || {},
            softUnclear: true
        }).summary;
        summary.unclear = unclear;
        return summary;
    }

    function collectTmsReviewQueue() {
        const queue = [];
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
            const unclear = domain().listUnclearTmsStudentMatches(target.students, row.students);
            unclear.forEach((item) => {
                queue.push({
                    rowIdx,
                    importCohortName: row.importCohortName,
                    targetName: target.name || row.userTargetId,
                    item
                });
            });
        });
        return queue;
    }

    function tmsReviewReasonText(reason) {
        if (reason === 'duplicate_existing') {
            return t('rosterTmsReviewReasonDuplicate');
        }
        if (reason === 'fuzzy_variant') {
            return t('rosterTmsReviewReasonFuzzy');
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

    function setCurrentReviewResolution(action, studentId) {
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
        const key = entry.item.tmsKey;
        if (action === 'map') {
            row.studentResolutions[key] = { action: 'map', studentId: String(studentId || '') };
        } else if (action === 'add') {
            row.studentResolutions[key] = { action: 'add' };
        } else {
            row.studentResolutions[key] = { action: 'skip' };
        }
    }

    function renderTmsStudentReview() {
        const review = document.getElementById('rosterTmsStudentReview');
        const mapping = document.getElementById('rosterTmsSyncMappingTable');
        const batchBar = document.getElementById('rosterTmsSyncBatchBar');
        const credForm = document.getElementById('rosterTmsCredForm');
        const confirmBtn = document.getElementById('rosterTmsSyncConfirmBtn');
        if (!review) {
            return;
        }
        const onReview = tmsSyncWizardStep === 2 && tmsReviewQueue.length > 0;
        review.hidden = !onReview;
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
                confirmBtn.textContent = t('rosterTmsSyncConfirm');
            }
            return;
        }
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
        const backBtn = document.getElementById('rosterTmsStudentReviewBackBtn');
        const nextBtn = document.getElementById('rosterTmsStudentReviewNextBtn');
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
        const existing = getCurrentReviewResolution();
        const selected =
            existing && existing.action === 'map'
                ? `map:${existing.studentId}`
                : existing && existing.action === 'add'
                  ? 'add'
                  : existing && existing.action === 'skip'
                    ? 'skip'
                    : '';
        const opts = [];
        (item.candidates || []).forEach((c) => {
            const en = c.nameEn ? ` (${c.nameEn})` : '';
            const val = `map:${c.id}`;
            opts.push(
                `<label class="checkbox-label selection-chip"><input type="radio" name="rosterTmsReviewChoice" value="${escapeHtml(val)}"${
                    selected === val ? ' checked' : ''
                }><span>${escapeHtml(t('rosterTmsReviewMapTo').replace('{name}', `${c.name}${en}`))}</span></label>`
            );
        });
        opts.push(
            `<label class="checkbox-label selection-chip"><input type="radio" name="rosterTmsReviewChoice" value="add"${
                selected === 'add' ? ' checked' : ''
            }><span>${escapeHtml(t('rosterTmsReviewAddNew'))}</span></label>`
        );
        opts.push(
            `<label class="checkbox-label selection-chip"><input type="radio" name="rosterTmsReviewChoice" value="skip"${
                selected === 'skip' ? ' checked' : ''
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
                    ? t('rosterTmsReviewFinish')
                    : t('rosterTmsReviewNext');
        }
        updateTmsReviewNavButtons();
        if (confirmBtn) {
            confirmBtn.hidden = true;
        }
    }

    function updateTmsReviewNavButtons() {
        const nextBtn = document.getElementById('rosterTmsStudentReviewNextBtn');
        const res = getCurrentReviewResolution();
        const ok =
            res &&
            (res.action === 'add' ||
                res.action === 'skip' ||
                (res.action === 'map' && res.studentId));
        if (nextBtn) {
            nextBtn.disabled = !ok;
        }
    }

    function enterTmsStudentReview() {
        tmsReviewQueue = collectTmsReviewQueue();
        if (!tmsReviewQueue.length) {
            tmsSyncWizardStep = 1;
            void confirmTmsSync();
            return;
        }
        tmsSyncWizardStep = 2;
        tmsReviewIndex = 0;
        setTmsSyncError('');
        renderTmsStudentReview();
    }

    function leaveTmsStudentReviewToMapping() {
        tmsSyncWizardStep = 1;
        const confirmBtn = document.getElementById('rosterTmsSyncConfirmBtn');
        if (confirmBtn) {
            confirmBtn.hidden = false;
        }
        renderTmsSyncTable();
        renderTmsStudentReview();
    }

    function advanceTmsStudentReview() {
        const res = getCurrentReviewResolution();
        if (
            !res ||
            !(
                res.action === 'add' ||
                res.action === 'skip' ||
                (res.action === 'map' && res.studentId)
            )
        ) {
            setTmsSyncError(t('rosterTmsReviewChoiceRequired'));
            return;
        }
        setTmsSyncError('');
        if (tmsReviewIndex < tmsReviewQueue.length - 1) {
            tmsReviewIndex += 1;
            renderTmsStudentReview();
            return;
        }
        tmsSyncWizardStep = 1;
        const confirmBtn = document.getElementById('rosterTmsSyncConfirmBtn');
        if (confirmBtn) {
            confirmBtn.hidden = false;
        }
        void confirmTmsSync();
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
                `<option value=""${ !selectedId || selectedId === '' ? ' selected' : ''}>${escapeHtml(t('rosterTmsSyncChoose'))}</option>`
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
                    row.userAction === 'skip' ? '__skip__' : row.userTargetId || '';
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
                    row.remembered = false;
                    row.studentResolutions = {};
                } else if (!val) {
                    row.userAction = 'choose';
                    row.userTargetId = '';
                    row.remembered = false;
                    row.studentResolutions = {};
                } else {
                    row.userAction = 'map';
                    row.userTargetId = val;
                    row.remembered = false;
                    row.studentResolutions = {};
                }
                renderTmsSyncTable();
            });
        });

        const canApply =
            !tmsSyncLoading &&
            tmsSyncPlan.length > 0 &&
            tmsSyncPlan.every((r) => r.userAction === 'skip' || (r.userAction === 'map' && r.userTargetId));
        let unclearCount = 0;
        if (canApply) {
            tmsSyncPlan.forEach((row) => {
                if (row.userAction !== 'map' || !row.userTargetId) {
                    return;
                }
                const target = getCohorts().find((c) => c && c.id === row.userTargetId);
                if (!target || !domain().listUnclearTmsStudentMatches) {
                    return;
                }
                unclearCount += domain().listUnclearTmsStudentMatches(target.students, row.students).length;
            });
        }
        if (confirmBtn) {
            confirmBtn.hidden = tmsSyncWizardStep === 2;
            confirmBtn.disabled = !canApply;
            confirmBtn.textContent = unclearCount
                ? t('rosterTmsSyncContinueReview').replace('{count}', String(unclearCount))
                : t('rosterTmsSyncConfirm');
            confirmBtn.dataset.needsReview = unclearCount ? '1' : '0';
        }
        syncTmsBatchBarVisibility();
        if (tmsSyncWizardStep === 2) {
            renderTmsStudentReview();
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
        if (hooks.isViewOnly && hooks.isViewOnly()) {
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
                const summary = `${meta.cohortCount || tmsSyncPlan.length} classes · ${meta.studentCount || 0} students · ${remembered} remembered · ${needChoose} new`;
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

    async function confirmTmsSync() {
        setTmsSyncError('');
        const mappedTargets = new Set();
        for (const row of tmsSyncPlan) {
            if (row.userAction === 'choose') {
                setTmsSyncError(t('rosterTmsSyncMappingRequired'));
                return;
            }
            if (row.userAction === 'map') {
                if (!row.userTargetId) {
                    setTmsSyncError(t('rosterTmsSyncMappingRequired'));
                    return;
                }
                if (mappedTargets.has(row.userTargetId)) {
                    setTmsSyncError(t('rosterTmsSyncDuplicateTarget'));
                    return;
                }
                mappedTargets.add(row.userTargetId);
                const target = getCohorts().find((c) => c && c.id === row.userTargetId);
                if (!canEditCohort(target)) {
                    setTmsSyncError(t('rosterTmsSyncNoPermission'));
                    return;
                }
            }
        }
        if (!tmsSyncPlan.some((r) => r.userAction === 'map') && !tmsSyncPlan.some((r) => r.userAction === 'skip')) {
            closeTmsSyncModal();
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
                    (res.action === 'map' && res.studentId))
            );
        });
        if (pendingUnclear.length) {
            setTmsSyncError(t('rosterTmsReviewIncomplete'));
            enterTmsStudentReview();
            return;
        }
        const applied = domain().applyTmsRosterPlan(getCohorts(), tmsSyncPlan, {
            newStudentId: () => domain().newId('stu')
        });
        const nextLinks = domain().upsertTmsRosterLinks
            ? domain().upsertTmsRosterLinks(getTmsRosterLinks(), tmsSyncPlan, applied.cohorts)
            : getTmsRosterLinks();
        try {
            await hooks.saveClassroom({ cohorts: applied.cohorts, tmsRosterLinks: nextLinks });
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
            const btn = document.getElementById('rosterTmsSyncConfirmBtn');
            if (btn && btn.dataset.needsReview === '1') {
                enterTmsStudentReview();
                return;
            }
            void confirmTmsSync();
        });
        document.getElementById('rosterTmsStudentReviewBackBtn')?.addEventListener('click', () => {
            if (tmsReviewIndex <= 0) {
                leaveTmsStudentReviewToMapping();
                return;
            }
            tmsReviewIndex -= 1;
            setTmsSyncError('');
            renderTmsStudentReview();
        });
        document.getElementById('rosterTmsStudentReviewNextBtn')?.addEventListener('click', () => {
            advanceTmsStudentReview();
        });
        document.getElementById('rosterTmsSyncSkipAllBtn')?.addEventListener('click', () => {
            skipAllTmsSyncRows();
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
        const bulkEditable = canEditRoster() && !isArchiveCohort(cohort);
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
              </fieldset>
            </section>
            <div class="form-actions classroom-student-actions classroom-roster-student-actions">
            ${student ? `<button type="button" class="btn btn-outline" id="classroomStudentPrintTermSummary">${escapeHtml(t('termSummaryPrintStudent'))}</button>` : ''}
            ${editable && !inArchive ? `<button type="button" class="btn btn-primary btn-small" id="classroomStudentSave">${escapeHtml(t('save'))}</button>` : ''}
            ${editable && student && !inArchive ? `<button type="button" class="btn btn-outline" id="classroomStudentDeactivate">${escapeHtml(student.active ? t('classroomDeactivateStudent') : t('classroomActivateStudent'))}</button>` : ''}
            ${canArchive ? `<button type="button" class="btn btn-outline" id="classroomStudentArchive">${escapeHtml(t('studentArchiveBtn'))}</button>` : ''}
            ${canRestore ? `<button type="button" class="btn btn-outline" id="classroomStudentRestore">${escapeHtml(t('studentRestoreBtn'))}</button>` : ''}
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
        editor.querySelector('#classroomStudentDeactivate')?.addEventListener('click', () => toggleActive(mountEl));
        editor.querySelector('#classroomStudentArchive')?.addEventListener('click', () => openArchiveModal());
        editor.querySelector('#classroomStudentRestore')?.addEventListener('click', () => openRestoreModal());
        editor.querySelector('#classroomStudentDelete')?.addEventListener('click', () => openDeleteModal());
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
                    String(selectedStudentIds.size)
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
            if (!selectedStudentIds.size) {
                hooks.showToast(t('studentMoveNoSelection'), true);
                return;
            }
            result = d.archiveStudents
                ? d.archiveStudents(getCohorts(), Array.from(selectedStudentIds), selectedCohortId, meta)
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
        if (hooks && hooks.isViewOnly && hooks.isViewOnly()) {
            hooks.showToast(t('rosterImportReadOnly'), true);
            return;
        }
        const cohort = getSelectedCohort();
        if (!cohort || !canEditRoster() || isArchiveCohort(cohort)) {
            hooks.showToast(t('studentMoveNoPermission'), true);
            return;
        }
        if (!selectedStudentIds.size) {
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
            'studentBulkRemoveTagNew',
            'studentBulkRemoveTagEnding',
            'studentBulkRemoveTagInterested',
            'studentBulkRemoveTagOffRoster'
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.checked = false;
            }
        });
    }

    function openBulkStatusModal() {
        if (hooks && hooks.isViewOnly && hooks.isViewOnly()) {
            hooks.showToast(t('rosterImportReadOnly'), true);
            return;
        }
        const cohort = getSelectedCohort();
        if (!cohort || !canEditRoster() || isArchiveCohort(cohort)) {
            hooks.showToast(t('studentMoveNoPermission'), true);
            return;
        }
        if (!selectedStudentIds.size) {
            hooks.showToast(t('studentMoveNoSelection'), true);
            return;
        }
        const hint = document.getElementById('studentBulkStatusHint');
        if (hint) {
            hint.textContent = t('studentBulkStatusHint').replace(
                '{count}',
                String(selectedStudentIds.size)
            );
        }
        resetBulkStatusForm();
        if (hooks && hooks.openModal) {
            hooks.openModal(document.getElementById('studentBulkStatusModal'));
        }
    }

    function closeBulkStatusModal() {
        if (hooks && hooks.closeModal) {
            hooks.closeModal(document.getElementById('studentBulkStatusModal'));
        }
    }

    function collectBulkTagIds(prefix) {
        const map = [
            [`${prefix}New`, 'new'],
            [`${prefix}Ending`, 'ending_soon'],
            [`${prefix}Interested`, 'interested'],
            [`${prefix}OffRoster`, 'off_roster']
        ];
        return map
            .filter(([id]) => document.getElementById(id)?.checked)
            .map(([, tag]) => tag);
    }

    async function confirmBulkStatus() {
        const d = domain();
        const cohort = getSelectedCohort();
        if (!d || !cohort || !selectedStudentIds.size || !d.updateStudentsInCohort) {
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
            Array.from(selectedStudentIds),
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
        if (!d || !selectedStudentId || !toId) {
            return;
        }
        const result = d.restoreStudentFromArchive(getCohorts(), selectedStudentId, toId);
        if (result.error) {
            hooks.showToast(t('studentRestoreFailed'), true);
            return;
        }
        try {
            await saveCohorts(result.cohorts);
            selectedCohortId = toId;
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

    async function confirmDeleteStudent() {
        const d = domain();
        const pwd = document.getElementById('studentDeletePassword')?.value || '';
        const errEl = document.getElementById('studentDeleteError');
        if (!d || !selectedStudentId || !selectedCohortId || !pwd) {
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
        const del = d.deleteStudentPermanently(getCohorts(), selectedStudentId, selectedCohortId);
        if (del.error) {
            hooks.showToast(t('studentDeleteFailed'), true);
            return;
        }
        const appData = hooks.getAppData ? hooks.getAppData() : {};
        const purged = d.purgeStudentRecords(
            Object.assign({}, appData, { cohorts: del.cohorts }),
            selectedStudentId
        );
        try {
            await hooks.saveClassroom({
                cohorts: del.cohorts,
                attendanceSessions: purged.attendanceSessions,
                homeworkCompletions: purged.homeworkCompletions,
                essaySubmissions: purged.essaySubmissions,
                studentPoints: purged.studentPoints,
                studentTests: purged.studentTests
            });
            selectedStudentId = null;
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

    function setupStudentMoveModal() {
        if (document.body.dataset.studentMoveModalBound === '1') {
            return;
        }
        document.body.dataset.studentMoveModalBound = '1';
        document.getElementById('classroomRosterSelectAllBtn')?.addEventListener('click', () => {
            selectAllStudentsInCohort();
            render(document.getElementById('panel-students'));
        });
        document.getElementById('classroomRosterClearSelectionBtn')?.addEventListener('click', () => {
            clearStudentBulkSelection();
            render(document.getElementById('panel-students'));
        });
        document.getElementById('classroomRosterMoveBtn')?.addEventListener('click', () => openMoveModal());
        document.getElementById('classroomRosterBulkStatusBtn')?.addEventListener('click', () =>
            openBulkStatusModal()
        );
        document.getElementById('classroomRosterBulkArchiveBtn')?.addEventListener('click', () =>
            openBulkArchiveModal()
        );
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
