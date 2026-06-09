/**
 * Students roster segment — cohort picker + student CRUD.
 */
(function (global) {
    let hooks = null;
    let selectedCohortId = null;
    let selectedStudentId = null;
    let dirty = false;
    let importPack = null;
    let importPlan = [];
    let importWizardStep = 1;
    let importFileLabel = '';

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
        return checked && checked.value === 'merge' ? 'merge' : 'replace';
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
            hint.textContent = importFileLabel;
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
        importPlan = ri.matchImportCohorts(pack.cohorts, getCohorts());
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
                const parsed = ri.parseRosterPack(json);
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

    function setupRosterImportExport(panel) {
        if (!panel || panel.dataset.rosterIoBound === '1') {
            return;
        }
        panel.dataset.rosterIoBound = '1';

        panel.querySelector('#classroomRosterImportBtn')?.addEventListener('click', () => {
            document.getElementById('classroomRosterImportFile')?.click();
        });
        panel.querySelector('#classroomRosterImportFile')?.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            readImportFile(file);
            e.target.value = '';
        });
        panel.querySelector('#classroomRosterExportAllBtn')?.addEventListener('click', () => exportRoster('all'));
        panel.querySelector('#classroomRosterExportSelectedBtn')?.addEventListener('click', () => exportRoster('selected'));

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
        students.forEach((student) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'module-list-item' + (student.id === selectedStudentId ? ' is-selected' : '');
            if (!student.active) {
                btn.classList.add('is-inactive');
            }
            if (isArchiveCohort(cohort) && d && d.isPastArchiveRetention(student, retentionDays)) {
                btn.classList.add('is-past-retention');
            }
            const en = student.nameEn ? ` (${student.nameEn})` : '';
            let label = `${student.name}${en}`;
            if (student.expectedStartDate && student.archiveReason === 'starting_soon') {
                label += ` · ${student.expectedStartDate}`;
            }
            btn.textContent = label;
            btn.addEventListener('click', () => {
                selectedStudentId = student.id;
                renderStudentEditor(mountEl);
                renderStudentList(mountEl);
            });
            listEl.appendChild(btn);
        });
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
            <h3 class="form-section-title">${escapeHtml(student ? t('classroomEditStudent') : t('classroomAddStudent'))}</h3>
            ${!cohort ? `<p class="section-hint">${escapeHtml(t('classroomPickCohort'))}</p>` : ''}
            ${cohort && !editable ? `<p class="section-hint">${escapeHtml(t('classroomRosterReadOnly'))}</p>` : ''}
            ${inArchive ? `<p class="section-hint">${escapeHtml(t('studentArchiveCohortHint'))}</p>` : ''}
            ${retentionHint}
            <div class="form-group"><label for="classroomStudentName">${escapeHtml(t('classroomStudentName'))}</label>
            <input type="text" id="classroomStudentName" class="field-input" ${editable ? '' : 'disabled'} /></div>
            <div class="form-group"><label for="classroomStudentNameEn">${escapeHtml(t('classroomStudentNameEn'))}</label>
            <input type="text" id="classroomStudentNameEn" class="field-input" ${editable ? '' : 'disabled'} /></div>
            <div class="form-group"><label for="classroomStudentLocation">${escapeHtml(t('classroomStudentLocation'))}</label>
            <input type="text" id="classroomStudentLocation" class="field-input" ${editable ? '' : 'disabled'} /></div>
            <div class="form-group"><label for="classroomStudentMemo">${escapeHtml(t('classroomStudentMemo'))}</label>
            <textarea id="classroomStudentMemo" class="field-input" rows="2" ${editable ? '' : 'disabled'}></textarea></div>
            <div class="form-group"><label class="checkbox-label"><input type="checkbox" id="classroomStudentActive" ${editable ? '' : 'disabled'} /> ${escapeHtml(t('classroomStudentActive'))}</label></div>
            <fieldset class="form-group"><legend>${escapeHtml(t('classroomStudentTags'))}</legend>
            <label class="checkbox-label selection-chip"><input type="checkbox" id="classroomStudentTagNew" ${editable ? '' : 'disabled'} /> ${escapeHtml(t('classroomTagNew'))}</label>
            <label class="checkbox-label selection-chip"><input type="checkbox" id="classroomStudentTagEnding" ${editable ? '' : 'disabled'} /> ${escapeHtml(t('classroomTagEndingSoon'))}</label>
            <label class="checkbox-label selection-chip"><input type="checkbox" id="classroomStudentTagInterested" ${editable ? '' : 'disabled'} /> ${escapeHtml(t('classroomTagInterested'))}</label>
            </fieldset>
            <div class="form-actions classroom-student-actions">
            ${editable && !inArchive ? `<button type="button" class="btn btn-primary" id="classroomStudentSave">${escapeHtml(t('save'))}</button>` : ''}
            ${editable && student && !inArchive ? `<button type="button" class="btn btn-outline" id="classroomStudentDeactivate">${escapeHtml(student.active ? t('classroomDeactivateStudent') : t('classroomActivateStudent'))}</button>` : ''}
            ${canArchive ? `<button type="button" class="btn btn-outline" id="classroomStudentArchive">${escapeHtml(t('studentArchiveBtn'))}</button>` : ''}
            ${canRestore ? `<button type="button" class="btn btn-outline" id="classroomStudentRestore">${escapeHtml(t('studentRestoreBtn'))}</button>` : ''}
            ${canDelete ? `<button type="button" class="btn btn-outline btn-danger-outline" id="classroomStudentDelete">${escapeHtml(t('studentDeleteBtn'))}</button>` : ''}
            </div>`;

        fillStudentForm(student);

        editor.querySelector('#classroomStudentSave')?.addEventListener('click', () => saveStudent(mountEl));
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
            cohort.students = students;
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

    function openArchiveModal() {
        syncArchiveStartDateVisibility();
        if (hooks && hooks.openModal) {
            hooks.openModal(document.getElementById('studentArchiveModal'));
        }
    }

    function closeArchiveModal() {
        if (hooks && hooks.closeModal) {
            hooks.closeModal(document.getElementById('studentArchiveModal'));
        }
    }

    async function confirmArchiveStudent() {
        const d = domain();
        if (!d || !selectedStudentId || !selectedCohortId) {
            return;
        }
        const reason = document.getElementById('studentArchiveReason')?.value || 'break';
        const expectedStartDate = document.getElementById('studentArchiveStartDate')?.value || '';
        if (reason === 'starting_soon' && !expectedStartDate) {
            hooks.showToast(t('studentArchiveStartDateRequired'), true);
            return;
        }
        const result = d.archiveStudent(getCohorts(), selectedStudentId, selectedCohortId, {
            archiveReason: reason,
            expectedStartDate,
            homeroomTeacherUserId: hooks.getCurrentUserId ? hooks.getCurrentUserId() : ''
        });
        if (result.error) {
            hooks.showToast(t('studentArchiveFailed'), true);
            return;
        }
        try {
            await saveCohorts(result.cohorts);
            selectedCohortId = result.archiveCohortId;
            closeArchiveModal();
            hooks.showToast(t('studentArchiveDone'));
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
                homeworkCompletions: purged.homeworkCompletions
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
        }, { once: true });

        panel.querySelector('#classroomRosterCohortSearch')?.addEventListener('input', () => {
            renderCohortList(panel);
        }, { once: true });

        setupRosterImportExport(panel);
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
        setupArchiveModals();
        syncRetentionSettingsUi(panel);
        render(panel);
    }

    global.CCPClassroomRoster = {
        initTab,
        render
    };
})(typeof window !== 'undefined' ? window : globalThis);
