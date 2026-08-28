/**
 * Timetable import UI — file pick, review grid, apply to calendar.
 */
(function (global) {
    let hooks = null;
    let currentDraft = null;
    let currentPlan = null;

    function t(key) {
        return hooks && hooks.t ? hooks.t(key) : key;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getImportApi() {
        return global.CCPTimetableImport;
    }

    function getPdfApi() {
        return global.CCPTimetableImportPdf;
    }

    function getOcrApi() {
        return global.CCPTimetableImportOcr;
    }

    function getModal() {
        return document.getElementById('timetableImportModal');
    }

    function setStatus(msg, isError) {
        const el = document.getElementById('timetableImportStatus');
        if (!el) {
            return;
        }
        el.textContent = msg || '';
        el.classList.toggle('is-error', Boolean(isError));
    }

    function renderReview() {
        const body = document.getElementById('timetableImportReviewBody');
        const summary = document.getElementById('timetableImportSummary');
        if (!body || !currentPlan) {
            return;
        }
        const entries = currentPlan.entries || [];
        const warnCount = entries.filter((e) => (e.warnings || []).length).length;
        if (summary) {
            summary.textContent = t('timetableImportSummary')
                .replace('{count}', String(entries.length))
                .replace('{warn}', String(warnCount))
                .replace('{source}', String(currentPlan.sourceType || ''));
        }
        const rows = entries
            .map((e, idx) => {
                const warns = (e.warnings || []).join(', ');
                return `<tr data-entry-idx="${idx}" class="${warns ? 'timetable-import-warn-row' : ''}">
          <td>${escapeHtml(String(e.dow))}</td>
          <td>${escapeHtml(e.timeLabel || '')}</td>
          <td>${escapeHtml(e.rawText || '')}</td>
          <td>${escapeHtml(e.cohortLabel || '')}</td>
          <td>${escapeHtml(e.category || '')}</td>
          <td>${escapeHtml(warns)}</td>
        </tr>`;
            })
            .join('');
        body.innerHTML = `<table class="classroom-sheet timetable-import-review-table">
          <thead><tr>
            <th>${escapeHtml(t('timetableImportColDow'))}</th>
            <th>${escapeHtml(t('timetableImportColTime'))}</th>
            <th>${escapeHtml(t('timetableImportColCell'))}</th>
            <th>${escapeHtml(t('timetableImportColCohort'))}</th>
            <th>${escapeHtml(t('timetableImportColSubject'))}</th>
            <th>${escapeHtml(t('timetableImportColWarnings'))}</th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="6">${escapeHtml(t('timetableImportEmpty'))}</td></tr>`}</tbody>
        </table>`;
    }

    function rebuildPlan() {
        const imp = getImportApi();
        const appData = hooks && hooks.getAppData ? hooks.getAppData() : null;
        const teachers = hooks && hooks.listTeachers ? hooks.listTeachers() : [];
        if (!imp || !currentDraft || !appData) {
            return;
        }
        currentPlan = imp.buildTimetableApplyPlan(currentDraft, appData, teachers);
        renderReview();
    }

    function formatImportError(err) {
        const msg = err && err.message ? String(err.message) : String(err || '');
        const code = msg.split(':')[0].trim();
        const keyMap = {
            'import_module_missing': 'timetableImportErrorModule',
            'pdf_module_missing': 'timetableImportErrorPdfModule',
            'ocr_module_missing': 'timetableImportErrorOcrModule',
            'pdf_ocr_unavailable': 'timetableImportErrorPdfOcr',
            'unsupported_file_type': 'timetableImportErrorUnsupported',
            'SheetJS failed to load': 'timetableImportErrorSheetjs',
            'pdf.js failed to load': 'timetableImportErrorPdfjs',
            'Failed to load': 'timetableImportErrorCdn'
        };
        let base = t('timetableImportFailed');
        Object.keys(keyMap).some((needle) => {
            if (msg.includes(needle)) {
                base = t(keyMap[needle]) || base;
                return true;
            }
            return false;
        });
        if (code && code !== msg && !base.includes(code)) {
            return `${base} (${code})`;
        }
        return base;
    }

    async function parseFile(file) {
        const imp = getImportApi();
        if (!imp) {
            throw new Error('import_module_missing');
        }
        const appData = hooks && hooks.getAppData ? hooks.getAppData() : {};
        const options = {
            timetableTimeSlots: appData.timetableTimeSlots,
            periodSlotMap: appData.periodSlotMap
        };
        const buffer = await file.arrayBuffer();
        const name = String(file.name || '').toLowerCase();
        if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
            return imp.parseXlsxArrayBuffer(buffer, options);
        }
        if (name.endsWith('.pdf')) {
            const pdf = getPdfApi();
            if (!pdf) {
                throw new Error('pdf_module_missing');
            }
            return pdf.parsePdfArrayBuffer(buffer, options);
        }
        if (/\.(png|jpe?g|webp)$/i.test(name)) {
            const ocr = getOcrApi();
            if (!ocr) {
                throw new Error('ocr_module_missing');
            }
            const blob = new Blob([buffer], { type: file.type || 'image/png' });
            const url = URL.createObjectURL(blob);
            try {
                return await ocr.parseImageToDraft(url, options);
            } finally {
                URL.revokeObjectURL(url);
            }
        }
        throw new Error('unsupported_file_type');
    }

    function openModal() {
        const modal = getModal();
        if (!modal) {
            return;
        }
        currentDraft = null;
        currentPlan = null;
        setStatus('');
        const body = document.getElementById('timetableImportReviewBody');
        if (body) {
            body.innerHTML = `<p class="section-hint">${escapeHtml(t('timetableImportPickFile'))}</p>`;
        }
        if (typeof hooks.showModal === 'function') {
            hooks.showModal(modal);
        } else {
            modal.hidden = false;
            modal.classList.add('active');
        }
    }

    function closeModal() {
        const modal = getModal();
        if (!modal) {
            return;
        }
        if (typeof hooks.hideModal === 'function') {
            hooks.hideModal(modal);
        } else {
            modal.hidden = true;
            modal.classList.remove('active');
        }
    }

    async function onFileSelected(file) {
        if (!file) {
            return;
        }
        setStatus(t('timetableImportLoading'));
        try {
            currentDraft = await parseFile(file);
            rebuildPlan();
            setStatus('');
        } catch (err) {
            console.error('[timetable import]', err);
            setStatus(formatImportError(err), true);
        }
    }

    function applyImport() {
        const imp = getImportApi();
        const appData = hooks && hooks.getAppData ? hooks.getAppData() : null;
        if (!imp || !currentPlan || !appData) {
            return;
        }
        const result = imp.applyTimetableImportPlan(appData, currentPlan, {
            newId: hooks.generateId || (() => `id_${Date.now()}`)
        });
        appData.classes = result.classes;
        if (hooks.saveAppData) {
            hooks.saveAppData();
        }
        if (hooks.renderAll) {
            hooks.renderAll();
        }
        if (hooks.showMessage) {
            hooks.showMessage(
                t('timetableImportApplied')
                    .replace('{applied}', String(result.applied))
                    .replace('{created}', String(result.created)),
                false
            );
        }
        closeModal();
    }

    function bindUi() {
        const excelBtn = document.getElementById('timetableImportXlsBtn');
        const pdfBtn = document.getElementById('timetableImportPdfBtn');
        const photoBtn = document.getElementById('timetableImportPhotoBtn');
        const fileInput = document.getElementById('timetableImportFileInput');
        const applyBtn = document.getElementById('timetableImportApplyBtn');
        const closeBtn = document.getElementById('timetableImportCloseBtn');

        function pick(accept) {
            if (!fileInput) {
                return;
            }
            openModal();
            fileInput.value = '';
            fileInput.accept = accept;
            fileInput.click();
        }

        if (excelBtn && !excelBtn.dataset.init) {
            excelBtn.dataset.init = '1';
            excelBtn.addEventListener('click', () => pick('.xlsx,.xls'));
        }
        if (pdfBtn && !pdfBtn.dataset.init) {
            pdfBtn.dataset.init = '1';
            pdfBtn.addEventListener('click', () => pick('.pdf'));
        }
        if (photoBtn && !photoBtn.dataset.init) {
            photoBtn.dataset.init = '1';
            photoBtn.addEventListener('click', () => pick('.png,.jpg,.jpeg,.webp'));
        }
        if (fileInput && !fileInput.dataset.init) {
            fileInput.dataset.init = '1';
            fileInput.addEventListener('change', () => {
                const file = fileInput.files && fileInput.files[0];
                onFileSelected(file);
            });
        }
        if (applyBtn && !applyBtn.dataset.init) {
            applyBtn.dataset.init = '1';
            applyBtn.addEventListener('click', applyImport);
        }
        if (closeBtn && !closeBtn.dataset.init) {
            closeBtn.dataset.init = '1';
            closeBtn.addEventListener('click', closeModal);
        }
    }

    function init(h) {
        hooks = h || null;
        bindUi();
    }

    /**
     * Programmatic import for term migrate (array of File/Blob).
     */
    async function importFilesForMigrate(files, appData, options) {
        const imp = getImportApi();
        const teachers = hooks && hooks.listTeachers ? hooks.listTeachers() : [];
        const opts = options || {};
        let totalApplied = 0;
        let totalCreated = 0;
        let classes = Array.isArray(appData.classes) ? appData.classes.slice() : [];

        for (let i = 0; i < files.length; i += 1) {
            const file = files[i];
            const draft = await parseFile(file);
            const plan = imp.buildTimetableApplyPlan(draft, Object.assign({}, appData, { classes }), teachers);
            const result = imp.applyTimetableImportPlan(
                Object.assign({}, appData, { classes }),
                plan,
                { newId: hooks.generateId || (() => `id_${Date.now()}`) }
            );
            classes = result.classes;
            totalApplied += result.applied;
            totalCreated += result.created;
        }

        return { classes, applied: totalApplied, created: totalCreated };
    }

    global.CCPTimetableImportUi = {
        init,
        openModal,
        closeModal,
        importFilesForMigrate,
        parseFile,
        rebuildPlan,
        formatImportError
    };
})(typeof window !== 'undefined' ? window : globalThis);
