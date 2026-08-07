/**
 * Tools → Debate Books — monthly (debate) or term (other) distribution checklist.
 */
(function (global) {
    'use strict';

    let hooks = null;
    let classId = '';
    let periodKey = '';
    let panelRef = null;
    let draftDistribution = null;
    let autosave = null;
    let contextSubscribed = false;
    let mountEventsBound = false;
    const STATUS_AUTOSAVE_MS = 400;

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

    function isMonthlyMode() {
        const d = domain();
        return !!(d && d.classUsesMonthlyDebateBooks(getClassData()));
    }

    function getStudents() {
        const d = domain();
        const data = getAppData();
        if (!d || !classId) {
            return [];
        }
        return d.resolveStudentsForClass(getClassData(), data.cohorts) || [];
    }

    function getPeriodPreferenceMap() {
        const data = getAppData();
        if (!data.ui) {
            data.ui = {};
        }
        if (!data.ui.debateBookPeriodByClassId || typeof data.ui.debateBookPeriodByClassId !== 'object') {
            data.ui.debateBookPeriodByClassId = {};
        }
        return data.ui.debateBookPeriodByClassId;
    }

    function persistPeriodPreference(nextClassId, nextPeriodKey) {
        if (!nextClassId || !nextPeriodKey) {
            return;
        }
        const map = getPeriodPreferenceMap();
        map[nextClassId] = nextPeriodKey;
        if (typeof global.saveUiStateToLocalStorage === 'function') {
            global.saveUiStateToLocalStorage();
        } else if (hooks && typeof hooks.saveUiState === 'function') {
            hooks.saveUiState();
        }
    }

    function resolveBookMeta() {
        const d = domain();
        const classData = getClassData();
        if (!d || !classData) {
            return { bookTitle: '', bookLevel: '', label: '' };
        }
        if (isMonthlyMode()) {
            const options = d.listDebateBookMonthOptions(classData);
            const match = options.find((opt) => opt.periodKey === periodKey);
            if (match) {
                return match;
            }
            return {
                periodKey,
                bookTitle: '',
                bookLevel: d.resolveClassLevelLabel(classData),
                label: d.formatDebateBookOptionLabel(periodKey, '', d.resolveClassLevelLabel(classData))
            };
        }
        return d.getDebateBookTermOption(classData);
    }

    function ensureAutosave(panel) {
        if (autosave || !global.CCPClassroomAutosave) {
            return;
        }
        autosave = global.CCPClassroomAutosave.create({
            delayMs: STATUS_AUTOSAVE_MS,
            debounce: hooks && hooks.debounce ? hooks.debounce : null,
            t,
            getStatusEl: () => (panelRef || panel).querySelector('#classroomDebateBooksSaveStatus'),
            saveAsync: (opts) => persistDistribution(panelRef || panel, opts)
        });
    }

    function scheduleStatusSave() {
        ensureAutosave(panelRef);
        if (autosave) {
            autosave.scheduleSave();
        }
    }

    function scheduleNoteSave() {
        scheduleStatusSave();
    }

    async function flushBeforeLeave() {
        ensureAutosave(panelRef || document.getElementById('panel-debate-books'));
        if (autosave) {
            await autosave.flushBeforeLeave();
        }
    }

    function loadDistribution() {
        const d = domain();
        const data = getAppData();
        const classData = getClassData();
        if (!d || !classId || !periodKey) {
            draftDistribution = null;
            return;
        }
        const meta = resolveBookMeta();
        const existing = d.findDebateBookDistribution(data.debateBookDistributions, classId, periodKey);
        const base = existing
            ? JSON.parse(JSON.stringify(existing))
            : {
                id: d.newId('dbd'),
                classId,
                periodKey,
                bookTitle: meta.bookTitle || '',
                bookLevel: meta.bookLevel || '',
                records: []
            };
        if (meta.bookTitle) {
            base.bookTitle = meta.bookTitle;
        } else if (!base.bookTitle && classData) {
            base.bookTitle = String(classData.book || '').trim();
        }
        if (meta.bookLevel) {
            base.bookLevel = meta.bookLevel;
        }
        draftDistribution = d.ensureDebateBookRecordsForStudents(base, getStudents());
    }

    function getRecord(studentId) {
        const d = domain();
        if (!d || !draftDistribution) {
            return { studentId, status: 'not_issued', note: '' };
        }
        return (
            d.getDebateBookRecordForStudent(draftDistribution, studentId) || {
                studentId,
                status: 'not_issued',
                note: ''
            }
        );
    }

    function setRecord(studentId, patch) {
        const d = domain();
        if (!d || !draftDistribution || !studentId) {
            return;
        }
        const records = Array.isArray(draftDistribution.records)
            ? draftDistribution.records.slice()
            : [];
        const idx = records.findIndex((r) => r && r.studentId === studentId);
        const prev =
            idx >= 0
                ? records[idx]
                : { studentId, status: 'not_issued', note: '' };
        const next = Object.assign({}, prev, patch, { studentId });
        const status = String(next.status || '').trim();
        next.status = d.DEBATE_BOOK_STATUSES.includes(status) ? status : 'not_issued';
        next.note = String(next.note || '').trim();
        if (idx >= 0) {
            records[idx] = next;
        } else {
            records.push(next);
        }
        draftDistribution.records = records;
    }

    async function persistDistribution(panel, options) {
        const opt = options || {};
        const d = domain();
        if (!d || !draftDistribution || !classId || !periodKey) {
            return;
        }
        if (!access() || !access().canEditClass(getClassData())) {
            return;
        }
        const saveBtn = panel && panel.querySelector('#classroomDebateBooksSaveBtn');
        if (saveBtn) {
            saveBtn.disabled = true;
        }
        const data = getAppData();
        const meta = resolveBookMeta();
        const entry = Object.assign({}, draftDistribution, {
            classId,
            periodKey,
            bookTitle: meta.bookTitle || draftDistribution.bookTitle || '',
            bookLevel: meta.bookLevel || draftDistribution.bookLevel || '',
            updatedAt: new Date().toISOString()
        });
        const list = d.upsertDebateBookDistribution(data.debateBookDistributions, entry);
        try {
            await hooks.saveClassroom({ debateBookDistributions: list });
            draftDistribution = d.findDebateBookDistribution(getAppData().debateBookDistributions, classId, periodKey);
            draftDistribution = d.ensureDebateBookRecordsForStudents(
                draftDistribution || entry,
                getStudents()
            );
            if (!opt.silent && hooks.showToast) {
                hooks.showToast(t('saved'));
            }
        } catch (err) {
            if (hooks.showToast) {
                hooks.showToast(err.message || String(err), true);
            }
            throw err;
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
            }
        }
    }

    function buildStatusChips(studentId, editable) {
        const d = domain();
        const rec = getRecord(studentId);
        const current = rec.status || 'not_issued';
        return d.DEBATE_BOOK_STATUSES.map((status) => {
            const labelKey = `classroomDebateBookStatus_${status}`;
            const checked = current === status ? ' checked' : '';
            const disabled = editable ? '' : ' disabled';
            return `<label class="checkbox-label selection-chip classroom-status-chip classroom-debate-book-status-chip classroom-debate-book-status-chip--${escapeAttr(status)}"><input type="radio" name="dbook_${escapeAttr(studentId)}" value="${escapeAttr(status)}"${checked}${disabled} data-student-id="${escapeAttr(studentId)}" /> ${escapeHtml(t(labelKey))}</label>`;
        }).join('');
    }

    function renderContextBar(panel) {
        const mount = panel.querySelector('#classroomDebateBooksContextBar');
        if (!mount) {
            return;
        }
        const d = domain();
        const classData = getClassData();
        const editable = access() && access().canEditClass(classData);
        const monthly = isMonthlyMode();

        if (!classData) {
            mount.innerHTML = `<p class="section-hint">${escapeHtml(t('classroomDebateBooksPickClass'))}</p>`;
            return;
        }

        if (monthly) {
            const options = d.listDebateBookMonthOptions(classData);
            const optsHtml = options.length
                ? options
                    .map((opt) => {
                        const sel = opt.periodKey === periodKey ? ' selected' : '';
                        return `<option value="${escapeAttr(opt.periodKey)}"${sel}>${escapeHtml(opt.label)}</option>`;
                    })
                    .join('')
                : `<option value="">${escapeHtml(t('classroomDebateBooksNoMonths'))}</option>`;
            mount.innerHTML = `
                <div class="classroom-debate-books-context-inner">
                    <div class="classroom-essay-context-field classroom-essay-context-field--grow">
                        <span class="classroom-essay-context-label">${escapeHtml(t('classroomDebateBooksMonthLabel'))}</span>
                        <select id="classroomDebateBooksPeriodSelect" class="field-select field-control classroom-essay-datefield" aria-label="${escapeAttr(t('classroomDebateBooksMonthLabel'))}"${editable && options.length ? '' : ' disabled'}>${optsHtml}</select>
                    </div>
                </div>`;
            return;
        }

        const term = d.getDebateBookTermOption(classData);
        const display = term.label || t('classroomDebateBooksNoBook');
        mount.innerHTML = `
            <div class="classroom-debate-books-context-inner">
                <div class="classroom-essay-context-field classroom-essay-context-field--grow">
                    <span class="classroom-essay-context-label">${escapeHtml(t('classroomDebateBooksTermLabel'))}</span>
                    <p id="classroomDebateBooksTermBanner" class="classroom-debate-books-term-banner">${escapeHtml(display)}</p>
                </div>
            </div>`;
    }

    function renderStatsBar(panel) {
        const mount = panel.querySelector('#classroomDebateBooksStatsBar');
        if (!mount) {
            return;
        }
        const d = domain();
        if (!d || !draftDistribution) {
            mount.innerHTML = '';
            return;
        }
        const students = getStudents();
        const counts = d.countDebateBookByStatus(
            draftDistribution,
            students.map((e) => e && e.student && e.student.id).filter(Boolean)
        );
        mount.innerHTML = `
            <div class="classroom-debate-books-stats" role="group" aria-label="${escapeAttr(t('classroomDebateBooksStatsLabel'))}">
                <span class="classroom-debate-books-stat classroom-debate-books-stat--issued">${escapeHtml(t('classroomDebateBookStatus_issued'))}: <strong>${counts.issued}</strong></span>
                <span class="classroom-debate-books-stat classroom-debate-books-stat--not-issued">${escapeHtml(t('classroomDebateBookStatus_not_issued'))}: <strong>${counts.not_issued}</strong></span>
                <span class="classroom-debate-books-stat classroom-debate-books-stat--missing">${escapeHtml(t('classroomDebateBookStatus_missing'))}: <strong>${counts.missing}</strong></span>
            </div>`;
    }

    function renderRows(panel) {
        const rowsMount = panel.querySelector('#classroomDebateBooksRows');
        if (!rowsMount) {
            return;
        }
        const editable = access() && access().canEditClass(getClassData());
        const students = getStudents();
        const rowApi = global.CCPClassroomStudentRow;
        const classData = getClassData();

        if (!classData) {
            rowsMount.innerHTML = `<tr><td colspan="3" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomDebateBooksPickClass'))}</p></td></tr>`;
            return;
        }

        if (!periodKey) {
            rowsMount.innerHTML = `<tr><td colspan="3" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomDebateBooksNoMonths'))}</p></td></tr>`;
            return;
        }

        const meta = resolveBookMeta();
        if (!meta.bookTitle && !String(classData.book || '').trim()) {
            rowsMount.innerHTML = `<tr><td colspan="3" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomDebateBooksNoBook'))}</p></td></tr>`;
            return;
        }

        if (!students.length) {
            rowsMount.innerHTML = `<tr><td colspan="3" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomNoStudentsHint'))}</p></td></tr>`;
            return;
        }

        rowsMount.innerHTML = students
            .map((entry) => {
                const sid = entry.student.id;
                const rec = getRecord(sid);
                const status = rec.status || 'not_issued';
                const note = rec.note || '';
                const identity = rowApi
                    ? rowApi.formatStudentIdentityColumn(entry, t)
                    : escapeHtml(entry.student.name);
                const railCls = ` classroom-sheet-row--status-rail classroom-sheet-row--status-debate-book-${escapeAttr(status)}`;
                const disabled = editable ? '' : ' disabled';
                return `<tr class="classroom-sheet-row${railCls}" data-student-id="${escapeAttr(sid)}">
                <td class="classroom-sheet-col-student">${identity}</td>
                <td class="classroom-sheet-col-status"><div class="classroom-student-row-status classroom-debate-book-status" role="radiogroup" aria-label="${escapeAttr(t('classroomDebateBooksColStatus'))}">${buildStatusChips(sid, editable)}</div></td>
                <td class="classroom-sheet-col-notes"><input type="text" class="field-input field-control classroom-debate-book-note" data-student-id="${escapeAttr(sid)}" value="${escapeAttr(note)}"${disabled} /></td>
            </tr>`;
            })
            .join('');
    }

    function render(panel) {
        if (!panel) {
            return;
        }
        panelRef = panel;
        ensureAutosave(panel);
        renderContextBar(panel);
        renderStatsBar(panel);
        renderRows(panel);
        const saveBtn = panel.querySelector('#classroomDebateBooksSaveBtn');
        if (saveBtn) {
            saveBtn.disabled = !(access() && access().canEditClass(getClassData()));
        }
    }

    async function selectPeriod(panel, nextPeriodKey) {
        await flushBeforeLeave();
        periodKey = nextPeriodKey || '';
        if (classId && periodKey) {
            persistPeriodPreference(classId, periodKey);
        }
        loadDistribution();
        render(panel);
    }

    function syncClassFromContext() {
        if (!global.CCPClassroomZoneContext || !global.CCPClassroomZoneContext.getState) {
            return;
        }
        const state = global.CCPClassroomZoneContext.getState();
        if (state && state.classId && state.classId !== classId) {
            classId = state.classId;
        }
    }

    function ensurePeriodForClass() {
        const d = domain();
        const classData = getClassData();
        if (!d || !classData) {
            periodKey = '';
            return;
        }
        if (!isMonthlyMode()) {
            periodKey = d.DEBATE_BOOK_TERM_PERIOD_KEY;
            return;
        }
        const map = getPeriodPreferenceMap();
        const preferred = map[classId] || '';
        const options = d.listDebateBookMonthOptions(classData);
        if (preferred && options.some((opt) => opt.periodKey === preferred)) {
            periodKey = preferred;
            return;
        }
        periodKey = d.pickDefaultDebateBookPeriodKey(classData) || '';
    }

    function bindMountEvents(panel) {
        if (mountEventsBound || !panel) {
            return;
        }
        mountEventsBound = true;
        panel.addEventListener('change', (event) => {
            const target = event.target;
            if (!target) {
                return;
            }
            if (target.id === 'classroomDebateBooksPeriodSelect') {
                void selectPeriod(panel, target.value);
                return;
            }
            if (target.matches('input[type="radio"][name^="dbook_"]')) {
                const sid = target.getAttribute('data-student-id');
                if (!sid) {
                    return;
                }
                setRecord(sid, { status: target.value });
                renderStatsBar(panel);
                const row = target.closest('tr');
                if (row) {
                    row.className = row.className.replace(
                        /classroom-sheet-row--status-debate-book-\w+/g,
                        ''
                    );
                    row.classList.add(`classroom-sheet-row--status-debate-book-${target.value}`);
                }
                scheduleStatusSave();
            }
        });
        panel.addEventListener('input', (event) => {
            const target = event.target;
            if (!target || !target.classList.contains('classroom-debate-book-note')) {
                return;
            }
            const sid = target.getAttribute('data-student-id');
            if (!sid) {
                return;
            }
            setRecord(sid, { note: target.value });
            scheduleNoteSave();
        });
        panel.addEventListener('click', (event) => {
            const btn = event.target && event.target.closest('#classroomDebateBooksSaveBtn');
            if (!btn) {
                return;
            }
            void persistDistribution(panel, { silent: false });
        });
    }

    function subscribeContext() {
        if (contextSubscribed || !global.CCPClassroomZoneContext || !global.CCPClassroomZoneContext.subscribe) {
            return;
        }
        contextSubscribed = true;
        global.CCPClassroomZoneContext.subscribe(async (state) => {
            const panel = panelRef || document.getElementById('panel-debate-books');
            if (!panel || panel.hidden) {
                return;
            }
            const nextClassId = state && state.classId ? state.classId : '';
            if (nextClassId === classId) {
                return;
            }
            await flushBeforeLeave();
            classId = nextClassId;
            ensurePeriodForClass();
            loadDistribution();
            render(panel);
        });
    }

    async function initTab(nextHooks, options) {
        hooks = nextHooks || hooks;
        const panel = document.getElementById('panel-debate-books');
        if (!panel) {
            return;
        }
        panelRef = panel;
        bindMountEvents(panel);
        subscribeContext();
        syncClassFromContext();
        if (options && options.classId) {
            classId = options.classId;
        }
        if (!classId && global.CCPClassroomZoneContext && global.CCPClassroomZoneContext.getState) {
            const state = global.CCPClassroomZoneContext.getState();
            if (state && state.classId) {
                classId = state.classId;
            }
        }
        ensurePeriodForClass();
        loadDistribution();
        render(panel);
        ensureAutosave(panel);
    }

    async function refreshIfActive() {
        const panel = document.getElementById('panel-debate-books');
        if (!panel || panel.hidden) {
            return;
        }
        syncClassFromContext();
        ensurePeriodForClass();
        loadDistribution();
        render(panel);
    }

    global.CCPClassroomDebateBooks = {
        initTab,
        render,
        flushBeforeLeave,
        refreshIfActive
    };
})(typeof window !== 'undefined' ? window : globalThis);
