/**
 * Tools → Books — monthly (debate) or term (other) distribution checklist.
 * Roster from cohorts via resolveStudentsForClass; batch select + status.
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
    const selectedStudentIds = new Set();
    let reportsMenuOpen = false;
    let classSummarySelectedKeys = new Set();
    let classSummaryFilters = {
        homeroomKey: '',
        month: '',
        warnMode: 'all',
        myClassesOnly: false,
        debateOnly: false
    };
    let classSummaryModalBound = false;
    const STATUS_AUTOSAVE_MS = 400;
    let focusStudentId = '';

    const DEBATE_BOOK_STATUS_META = {
        not_issued: { cls: 'debate-book-status--not_issued' },
        issued: { cls: 'debate-book-status--issued' },
        missing: { cls: 'debate-book-status--missing' }
    };

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
            Object.keys(vars).forEach((name) => {
                s = s.replace(
                    new RegExp(`\\{${name}\\}`, 'g'),
                    String(vars[name] == null ? '' : vars[name])
                );
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

    function isMonthlyMode() {
        const d = domain();
        return !!(d && d.classUsesMonthlyDebateBooks(getClassData()));
    }

    /** Active on-roster students for the selected class (same source as Attendance / Essays). */
    function getStudents() {
        const d = domain();
        const data = getAppData();
        if (!d || !classId) {
            return [];
        }
        return d.resolveStudentsForClass(getClassData(), data.cohorts) || [];
    }

    function getPendingTransferChecks(role) {
        const d = domain();
        if (!d || !d.listPendingDebateBookChecks || !classId) {
            return [];
        }
        return d.listPendingDebateBookChecks(getAppData(), {
            classId,
            role: role || undefined,
            unresolvedOnly: true
        });
    }

    function getPendingTransferStudentIds() {
        const ids = new Set();
        getPendingTransferChecks('to').forEach((ev) => {
            if (ev && ev.studentId) {
                ids.add(ev.studentId);
            }
        });
        return ids;
    }

    function formatPriorStatusLabel(ev) {
        const prior = ev && ev.priorStatusByClassId ? ev.priorStatusByClassId : {};
        const firstKey = Object.keys(prior)[0];
        const snap = firstKey ? prior[firstKey] : null;
        if (!snap) {
            return t('classroomDebateBookStatus_not_issued');
        }
        const statusKey = `classroomDebateBookStatus_${snap.status || 'not_issued'}`;
        const statusLabel = t(statusKey);
        if (snap.status === 'issued' && snap.bookTitle) {
            return tf('debateBookCheckPriorIssuedBook', {
                status: statusLabel,
                book: snap.bookTitle
            });
        }
        return statusLabel;
    }

    async function persistPendingChecks(list) {
        if (!hooks || !hooks.saveClassroom) {
            return;
        }
        await hooks.saveClassroom({ pendingDebateBookChecks: list });
        if (typeof hooks.refreshTabWarnings === 'function') {
            hooks.refreshTabWarnings();
        }
    }

    async function resolveTransferCheck(eventId) {
        const d = domain();
        if (!d || !d.resolveDebateBookCheck || !eventId) {
            return;
        }
        const userId = hooks.getCurrentUserId ? hooks.getCurrentUserId() : '';
        const next = d.resolveDebateBookCheck(getAppData(), eventId, { userId });
        await persistPendingChecks(next.pendingDebateBookChecks || []);
    }

    async function resolveTransfersForStudent(studentId) {
        const d = domain();
        if (!d || !d.resolveDebateBookChecksForStudentOnClass || !studentId || !classId) {
            return;
        }
        const userId = hooks.getCurrentUserId ? hooks.getCurrentUserId() : '';
        const result = d.resolveDebateBookChecksForStudentOnClass(getAppData(), studentId, classId, {
            role: 'any',
            userId
        });
        if (result.resolvedIds && result.resolvedIds.length) {
            await persistPendingChecks(result.appData.pendingDebateBookChecks || []);
        }
    }

    function renderTransferBanner(panel) {
        const mount =
            (panel && panel.querySelector('#classroomDebateBooksTransferBanner')) ||
            document.getElementById('classroomDebateBooksTransferBanner');
        if (!mount) {
            return;
        }
        const toChecks = getPendingTransferChecks('to');
        const fromChecks = getPendingTransferChecks('from').filter(
            (ev) => !(ev.toClassIds || []).includes(classId)
        );
        if (!toChecks.length && !fromChecks.length) {
            mount.innerHTML = '';
            mount.hidden = true;
            return;
        }
        mount.hidden = false;
        const editable = access() && access().canEditClass(getClassData());
        const disabled = editable ? '' : ' disabled';
        let html = '';
        if (toChecks.length) {
            const items = toChecks
                .map((ev) => {
                    return `<li class="classroom-debate-books-transfer-item" data-check-id="${escapeAttr(ev.id)}">
                        <div class="classroom-debate-books-transfer-item-meta">
                            <strong>${escapeHtml(ev.studentName || ev.studentId)}</strong>
                            <span class="section-hint">${escapeHtml(formatPriorStatusLabel(ev))}</span>
                        </div>
                        <div class="classroom-debate-books-transfer-item-actions">
                            <button type="button" class="btn btn-primary btn-compact btn-small classroom-debate-books-transfer-mark-issued" data-check-id="${escapeAttr(ev.id)}" data-student-id="${escapeAttr(ev.studentId)}"${disabled}>${escapeHtml(t('classroomDebateBookStatus_issued'))}</button>
                            <button type="button" class="btn btn-outline btn-compact btn-small classroom-debate-books-transfer-mark-missing" data-check-id="${escapeAttr(ev.id)}" data-student-id="${escapeAttr(ev.studentId)}"${disabled}>${escapeHtml(t('classroomDebateBookStatus_missing'))}</button>
                            <button type="button" class="btn btn-outline btn-compact btn-small classroom-debate-books-transfer-dismiss" data-check-id="${escapeAttr(ev.id)}"${disabled}>${escapeHtml(t('debateBookCheckDismiss'))}</button>
                        </div>
                    </li>`;
                })
                .join('');
            html += `<p class="classroom-debate-books-transfer-banner-title">${escapeHtml(
                tf('debateBookCheckBannerTo', { count: toChecks.length })
            )}</p><ul class="classroom-debate-books-transfer-list">${items}</ul>`;
        }
        if (fromChecks.length) {
            const leftItems = fromChecks
                .map((ev) => {
                    return `<li class="classroom-debate-books-transfer-item">
                        <div class="classroom-debate-books-transfer-item-meta">
                            <strong>${escapeHtml(ev.studentName || ev.studentId)}</strong>
                            <span class="section-hint">${escapeHtml(
                                tf('debateBookCheckBannerFromPrior', {
                                    status: formatPriorStatusLabel(ev)
                                })
                            )}</span>
                        </div>
                        <div class="classroom-debate-books-transfer-item-actions">
                            <button type="button" class="btn btn-outline btn-compact btn-small classroom-debate-books-transfer-dismiss" data-check-id="${escapeAttr(ev.id)}"${disabled}>${escapeHtml(t('debateBookCheckDismiss'))}</button>
                        </div>
                    </li>`;
                })
                .join('');
            html += `<p class="classroom-debate-books-transfer-banner-title">${escapeHtml(
                tf('debateBookCheckBannerFrom', { count: fromChecks.length })
            )}</p><ul class="classroom-debate-books-transfer-list">${leftItems}</ul>`;
        }
        mount.innerHTML = html;
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
        return (
            (options && options.classId) ||
            (data.ui && data.ui.classroomTabClassId) ||
            (visible[0] && visible[0].id) ||
            ''
        );
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
        getPeriodPreferenceMap()[nextClassId] = nextPeriodKey;
        if (typeof global.saveUiStateToLocalStorage === 'function') {
            global.saveUiStateToLocalStorage();
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
                label: d.formatDebateBookOptionLabel(
                    periodKey,
                    '',
                    d.resolveClassLevelLabel(classData)
                )
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
            return { studentId, status: 'not_issued', note: '', issuedAt: '' };
        }
        return (
            d.getDebateBookRecordForStudent(draftDistribution, studentId) || {
                studentId,
                status: 'not_issued',
                note: '',
                issuedAt: ''
            }
        );
    }

    function getSessionDate() {
        if (global.CCPClassroomZoneContext && global.CCPClassroomZoneContext.getSessionDate) {
            return global.CCPClassroomZoneContext.getSessionDate() || '';
        }
        if (typeof global.CCPActiveContext !== 'undefined') {
            const ctx = global.CCPActiveContext.get();
            return (ctx && ctx.sessionDate) || '';
        }
        const ui = getAppData().ui || {};
        return ui.classroomTabDate || '';
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
            idx >= 0 ? records[idx] : { studentId, status: 'not_issued', note: '', issuedAt: '' };
        const next = d.applyDebateBookRecordPatch
            ? d.applyDebateBookRecordPatch(prev, Object.assign({}, patch, { studentId }), getSessionDate())
            : Object.assign({}, prev, patch, { studentId });
        if (idx >= 0) {
            records[idx] = next;
        } else {
            records.push(next);
        }
        draftDistribution.records = records;
    }

    function pruneSelectedStudentIds(students) {
        const allowed = new Set(
            (students || []).map((e) => e && e.student && e.student.id).filter(Boolean)
        );
        Array.from(selectedStudentIds).forEach((id) => {
            if (!allowed.has(id)) {
                selectedStudentIds.delete(id);
            }
        });
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
            draftDistribution = d.findDebateBookDistribution(
                getAppData().debateBookDistributions,
                classId,
                periodKey
            );
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

    function refreshZoneContextBar() {
        const zone = global.CCPClassroomZoneContext;
        const mount = document.getElementById('classroomZoneContextBar');
        if (!zone || !zone.render || !mount || mount.hidden) {
            return;
        }
        zone.render(mount);
    }

    function booksSummaryApi() {
        return global.CCPClassroomDebateBooksSummary;
    }

    function booksSummaryPrintApi() {
        return global.CCPClassroomDebateBooksSummaryPrint;
    }

    function closeReportsMenu() {
        reportsMenuOpen = false;
    }

    function listAllSummaryEntries() {
        const d = domain();
        if (!d || !d.listDebateBookSummaryEntries) {
            return [];
        }
        return d.listDebateBookSummaryEntries(getAppData(), { skipEmptyRoster: true });
    }

    function loadClassSummarySelection() {
        const data = getAppData();
        classSummarySelectedKeys.clear();
        const raw = data.ui && data.ui.debateBookClassSummarySelection;
        if (typeof raw === 'string' && raw.trim()) {
            raw.split(',').forEach((key) => {
                const trimmed = key.trim();
                if (trimmed) {
                    classSummarySelectedKeys.add(trimmed);
                }
            });
        }
        const filtersRaw = data.ui && data.ui.debateBookClassSummaryFilters;
        classSummaryFilters = {
            homeroomKey: '',
            month: '',
            warnMode: 'all',
            myClassesOnly: false,
            debateOnly: false
        };
        const summaryApi = booksSummaryApi();
        const normalizeWarn =
            summaryApi && summaryApi.normalizeWarnMode
                ? summaryApi.normalizeWarnMode.bind(summaryApi)
                : (mode) => mode;
        if (typeof filtersRaw === 'string' && filtersRaw.trim()) {
            try {
                const parsed = JSON.parse(filtersRaw);
                if (parsed && typeof parsed === 'object') {
                    classSummaryFilters = {
                        homeroomKey:
                            typeof parsed.homeroomKey === 'string' ? parsed.homeroomKey : '',
                        month: typeof parsed.month === 'string' ? parsed.month : '',
                        warnMode: normalizeWarn(parsed.warnMode),
                        myClassesOnly: parsed.myClassesOnly === true,
                        debateOnly: parsed.debateOnly === true
                    };
                }
            } catch (_err) {
                classSummaryFilters = {
                    homeroomKey: '',
                    month: '',
                    warnMode: 'all',
                    myClassesOnly: false,
                    debateOnly: false
                };
            }
        } else if (filtersRaw && typeof filtersRaw === 'object') {
            classSummaryFilters = {
                homeroomKey:
                    typeof filtersRaw.homeroomKey === 'string' ? filtersRaw.homeroomKey : '',
                month: typeof filtersRaw.month === 'string' ? filtersRaw.month : '',
                warnMode: normalizeWarn(filtersRaw.warnMode),
                myClassesOnly: filtersRaw.myClassesOnly === true,
                debateOnly: filtersRaw.debateOnly === true
            };
        }
    }

    function saveClassSummarySelection() {
        if (hooks && hooks.setUiPref) {
            hooks.setUiPref(
                'debateBookClassSummarySelection',
                Array.from(classSummarySelectedKeys).join(',')
            );
        }
    }

    function saveClassSummaryFilters() {
        if (hooks && hooks.setUiPref) {
            hooks.setUiPref(
                'debateBookClassSummaryFilters',
                JSON.stringify({
                    homeroomKey: classSummaryFilters.homeroomKey || '',
                    month: classSummaryFilters.month || '',
                    warnMode: classSummaryFilters.warnMode || 'all',
                    myClassesOnly: classSummaryFilters.myClassesOnly === true,
                    debateOnly: classSummaryFilters.debateOnly === true
                })
            );
        }
    }

    function getClassSummaryFilterContext() {
        return {
            currentUserId: hooks && hooks.getCurrentUserId ? hooks.getCurrentUserId() : '',
            deps: {
                classIsMine:
                    hooks && hooks.classIsMine
                        ? (classData, userId) => hooks.classIsMine(classData, userId)
                        : undefined
            }
        };
    }

    function syncClassSummaryFilterCheckboxesFromState() {
        const myCb = document.getElementById('debateBookClassSummaryMyClassesOnly');
        const debateCb = document.getElementById('debateBookClassSummaryDebateOnly');
        if (myCb) {
            myCb.checked = classSummaryFilters.myClassesOnly === true;
        }
        if (debateCb) {
            debateCb.checked = classSummaryFilters.debateOnly === true;
        }
    }

    function syncClassSummaryFiltersFromDom() {
        const hrEl = document.getElementById('debateBookClassSummaryHomeroomFilter');
        const monthEl = document.getElementById('debateBookClassSummaryMonthFilter');
        const warnEl = document.getElementById('debateBookClassSummaryWarnModeFilter');
        const myCb = document.getElementById('debateBookClassSummaryMyClassesOnly');
        const debateCb = document.getElementById('debateBookClassSummaryDebateOnly');
        const summaryApi = booksSummaryApi();
        const normalizeWarn =
            summaryApi && summaryApi.normalizeWarnMode
                ? summaryApi.normalizeWarnMode.bind(summaryApi)
                : (mode) => mode;
        classSummaryFilters = {
            homeroomKey: hrEl ? String(hrEl.value || '') : classSummaryFilters.homeroomKey || '',
            month: monthEl ? String(monthEl.value || '') : classSummaryFilters.month || '',
            warnMode: normalizeWarn(warnEl ? warnEl.value : classSummaryFilters.warnMode),
            myClassesOnly: myCb ? myCb.checked : classSummaryFilters.myClassesOnly === true,
            debateOnly: debateCb ? debateCb.checked : classSummaryFilters.debateOnly === true
        };
        saveClassSummaryFilters();
    }

    function listScopeClassSummaryEntries() {
        const all = listAllSummaryEntries();
        const summaryApi = booksSummaryApi();
        if (!summaryApi || !summaryApi.filterEntriesByHrAndMonth) {
            return all;
        }
        return summaryApi.filterEntriesByHrAndMonth(
            all,
            getAppData(),
            {
                homeroomKey: '',
                month: '',
                myClassesOnly: classSummaryFilters.myClassesOnly === true,
                debateOnly: classSummaryFilters.debateOnly === true
            },
            getClassSummaryFilterContext()
        );
    }

    function listFilteredClassSummaryEntries() {
        const scoped = listScopeClassSummaryEntries();
        const summaryApi = booksSummaryApi();
        if (!summaryApi || !summaryApi.filterEntriesByHrAndMonth) {
            return scoped;
        }
        return summaryApi.filterEntriesByHrAndMonth(
            scoped,
            getAppData(),
            classSummaryFilters,
            getClassSummaryFilterContext()
        );
    }

    function getClassSummaryLabels() {
        const mode = classSummaryFilters.warnMode || 'all';
        let title = t('classroomDebateBooksClassSummaryTitle');
        if (mode === 'attention') {
            title = t('classroomDebateBooksClassSummaryTitleAttention');
        } else if (mode === 'not_issued') {
            title = t('classroomDebateBooksClassSummaryTitleNotIssued');
        } else if (mode === 'missing') {
            title = t('classroomDebateBooksClassSummaryTitleMissing');
        }
        return {
            title,
            noStudents: t('classroomDebateBooksClassSummaryNoStudents'),
            noStudentsInSection: t('classroomDebateBooksClassSummaryNoStudentsInSection'),
            generatedAt: t('classroomDebateBooksClassSummaryGeneratedAt'),
            noHomeroom: t('classroomDebateBooksClassSummaryNoHomeroom'),
            hrHeading: t('classroomDebateBooksClassSummaryHrHeading'),
            colStudent: t('classroomColStudent'),
            colStatus: t('classroomDebateBooksColStatus'),
            colIssuedDate: t('classroomDebateBooksColIssuedDate'),
            colNotes: t('classroomColNotes'),
            statusLabels: {
                not_issued: t('classroomDebateBookStatus_not_issued'),
                issued: t('classroomDebateBookStatus_issued'),
                missing: t('classroomDebateBookStatus_missing')
            }
        };
    }

    function getSelectedClassSummaryEntries() {
        const filtered = listFilteredClassSummaryEntries();
        if (!classSummarySelectedKeys.size) {
            return [];
        }
        return filtered.filter((entry) => entry && classSummarySelectedKeys.has(entry.key));
    }

    function getClassSummaryHrGroups(entries) {
        const summaryApi = booksSummaryApi();
        if (!summaryApi || !summaryApi.listRowsForEntries || !summaryApi.groupRowsByHomeroom) {
            return [];
        }
        const rows = summaryApi.listRowsForEntries(getAppData(), entries);
        const filteredRows = summaryApi.filterRowsByWarnMode
            ? summaryApi.filterRowsByWarnMode(rows, classSummaryFilters.warnMode)
            : rows;
        return summaryApi.groupRowsByHomeroom(filteredRows, getAppData(), {
            warnMode: classSummaryFilters.warnMode
        });
    }

    function renderClassSummaryPreviewHtml(entries) {
        const printApi = booksSummaryPrintApi();
        const labels = getClassSummaryLabels();
        if (!printApi || !entries.length) {
            return '';
        }
        const groups = getClassSummaryHrGroups(entries);
        const d = domain();
        return printApi.renderDocumentHtml(
            {
                calendarName: getAppData().calendarName || '',
                generatedAt: d && d.todayISO ? d.todayISO() : '',
                groups
            },
            labels
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
            } catch (_err) {
                /* ignore */
            }
        };
        if (printWin.document.readyState === 'complete') {
            setTimeout(triggerPrint, 50);
        } else {
            printWin.addEventListener('load', () => setTimeout(triggerPrint, 50));
        }
        return printWin;
    }

    function openBooksClassSummaryPrint(entries) {
        const printApi = booksSummaryPrintApi();
        if (!printApi || !entries.length) {
            return;
        }
        const groups = getClassSummaryHrGroups(entries);
        if (!groups.length) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomDebateBooksClassSummaryNoStudents'), true);
            }
            return;
        }
        const labels = getClassSummaryLabels();
        const bodyHtml = printApi.renderDocumentHtml(
            {
                calendarName: getAppData().calendarName || '',
                generatedAt: domain() && domain().todayISO ? domain().todayISO() : '',
                groups
            },
            labels
        );
        openInlinePrintDocument(labels.title, bodyHtml, printApi.PRINT_STYLES || '');
    }

    async function copyBooksClassSummary(entries) {
        const summaryApi = booksSummaryApi();
        if (!summaryApi || !entries.length) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomDebateBooksClassSummaryNoEntries'), true);
            }
            return;
        }
        const groups = getClassSummaryHrGroups(entries);
        const labels = getClassSummaryLabels();
        const text = summaryApi.formatCopyText(groups, labels);
        if (!text || text === labels.noStudents) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomDebateBooksClassSummaryNoStudents'), true);
            }
            return;
        }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                throw new Error('clipboard unavailable');
            }
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomDebateBooksClassSummaryCopyDone'));
            }
        } catch (_err) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomDebateBooksClassSummaryCopyFailed'), true);
            }
        }
    }

    function populateClassSummaryFilterSelects(allEntries) {
        const summaryApi = booksSummaryApi();
        const hrEl = document.getElementById('debateBookClassSummaryHomeroomFilter');
        const monthEl = document.getElementById('debateBookClassSummaryMonthFilter');
        const warnEl = document.getElementById('debateBookClassSummaryWarnModeFilter');
        const appData = getAppData();
        if (hrEl && summaryApi && summaryApi.listHomeroomFilterOptions) {
            const options = summaryApi.listHomeroomFilterOptions(allEntries, appData);
            const prev = classSummaryFilters.homeroomKey || '';
            const parts = [
                `<option value="">${escapeHtml(t('classroomDebateBooksClassSummaryFilterAllHomerooms'))}</option>`
            ];
            options.forEach((opt) => {
                if (!opt || !opt.key) {
                    return;
                }
                const label =
                    opt.key === summaryApi.NO_HOMEROOM_KEY
                        ? t('classroomDebateBooksClassSummaryNoHomeroom')
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
            const months = summaryApi.listMonthFilterOptions(allEntries);
            const prev = classSummaryFilters.month || '';
            const parts = [
                `<option value="">${escapeHtml(t('classroomDebateBooksClassSummaryFilterAllMonths'))}</option>`
            ];
            months.forEach((month) => {
                parts.push(`<option value="${escapeAttr(month)}">${escapeHtml(month)}</option>`);
            });
            monthEl.innerHTML = parts.join('');
            const valid = !prev || months.includes(prev);
            monthEl.value = valid ? prev : '';
            classSummaryFilters.month = monthEl.value || '';
        }
        if (warnEl && summaryApi && summaryApi.normalizeWarnMode) {
            const mode = summaryApi.normalizeWarnMode(classSummaryFilters.warnMode);
            warnEl.innerHTML = [
                ['all', 'classroomDebateBooksClassSummaryWarnAll'],
                ['attention', 'classroomDebateBooksClassSummaryWarnAttention'],
                ['not_issued', 'classroomDebateBooksClassSummaryWarnNotIssued'],
                ['missing', 'classroomDebateBooksClassSummaryWarnMissing']
            ]
                .map(
                    ([value, key]) =>
                        `<option value="${escapeAttr(value)}">${escapeHtml(t(key))}</option>`
                )
                .join('');
            warnEl.value = mode;
            classSummaryFilters.warnMode = mode;
        }
    }

    function formatClassSummaryEntryHint(entry) {
        const summaryApi = booksSummaryApi();
        const hint =
            summaryApi && summaryApi.formatEntryHint
                ? summaryApi.formatEntryHint(entry)
                : { issued: 0, total: entry.totalStudents || 0 };
        return tf('classroomDebateBooksClassSummaryEntryHint', {
            issued: hint.issued,
            total: hint.total
        });
    }

    function renderClassSummaryModal() {
        const listEl = document.getElementById('debateBookClassSummaryEntryList');
        const previewEl = document.getElementById('debateBookClassSummaryPreview');
        if (!listEl || !previewEl) {
            return;
        }
        syncClassSummaryFilterCheckboxesFromState();
        populateClassSummaryFilterSelects(listScopeClassSummaryEntries());
        const entries = listFilteredClassSummaryEntries();
        const savedSelection = getAppData().ui && getAppData().ui.debateBookClassSummarySelection;
        const neverSavedSelection = savedSelection == null || savedSelection === '';
        if (neverSavedSelection && !classSummarySelectedKeys.size && entries.length) {
            entries.forEach((row) => classSummarySelectedKeys.add(row.key));
        }
        listEl.innerHTML =
            entries
                .map((row) => {
                    const checked = classSummarySelectedKeys.has(row.key) ? ' checked' : '';
                    const hint = formatClassSummaryEntryHint(row);
                    return `<label class="selection-chip classroom-debate-books-summary-entry">
                    <input type="checkbox" class="debate-book-class-summary-entry-check" data-entry-key="${escapeAttr(row.key)}"${checked} />
                    <span class="classroom-debate-books-summary-entry-label">${escapeHtml(row.className)} — ${escapeHtml(row.periodLabel)}</span>
                    <span class="section-hint">${escapeHtml(hint)}</span>
                </label>`;
                })
                .join('') ||
            `<p class="section-hint">${escapeHtml(t('classroomDebateBooksClassSummaryNoEntries'))}</p>`;
        listEl.querySelectorAll('.debate-book-class-summary-entry-check').forEach((input) => {
            input.addEventListener('change', () => {
                const key = input.getAttribute('data-entry-key');
                if (!key) {
                    return;
                }
                if (input.checked) {
                    classSummarySelectedKeys.add(key);
                } else {
                    classSummarySelectedKeys.delete(key);
                }
                saveClassSummarySelection();
                previewEl.innerHTML = renderClassSummaryPreviewHtml(
                    getSelectedClassSummaryEntries()
                );
            });
        });
        previewEl.innerHTML = renderClassSummaryPreviewHtml(getSelectedClassSummaryEntries());
    }

    function openClassSummaryModal() {
        const modal = document.getElementById('debateBookClassSummaryModal');
        if (!modal) {
            return;
        }
        loadClassSummarySelection();
        renderClassSummaryModal();
        modal.hidden = false;
        modal.classList.add('active');
    }

    function bindClassSummaryModal() {
        if (classSummaryModalBound) {
            return;
        }
        classSummaryModalBound = true;
        const modal = document.getElementById('debateBookClassSummaryModal');
        if (!modal) {
            return;
        }
        document.getElementById('debateBookClassSummaryClose')?.addEventListener('click', () => {
            if (hooks && hooks.closeModal) {
                hooks.closeModal(modal);
            } else {
                modal.hidden = true;
                modal.classList.remove('active');
            }
        });
        document
            .getElementById('debateBookClassSummaryHomeroomFilter')
            ?.addEventListener('change', () => {
                syncClassSummaryFiltersFromDom();
                renderClassSummaryModal();
            });
        document.getElementById('debateBookClassSummaryMonthFilter')?.addEventListener('change', () => {
            syncClassSummaryFiltersFromDom();
            renderClassSummaryModal();
        });
        document
            .getElementById('debateBookClassSummaryWarnModeFilter')
            ?.addEventListener('change', () => {
                syncClassSummaryFiltersFromDom();
                renderClassSummaryModal();
            });
        document
            .getElementById('debateBookClassSummaryMyClassesOnly')
            ?.addEventListener('change', () => {
                syncClassSummaryFiltersFromDom();
                renderClassSummaryModal();
            });
        document
            .getElementById('debateBookClassSummaryDebateOnly')
            ?.addEventListener('change', () => {
                syncClassSummaryFiltersFromDom();
                renderClassSummaryModal();
            });
        document.getElementById('debateBookClassSummarySelectAll')?.addEventListener('click', () => {
            listFilteredClassSummaryEntries().forEach((row) =>
                classSummarySelectedKeys.add(row.key)
            );
            saveClassSummarySelection();
            renderClassSummaryModal();
        });
        document.getElementById('debateBookClassSummaryClearAll')?.addEventListener('click', () => {
            listFilteredClassSummaryEntries().forEach((row) => {
                classSummarySelectedKeys.delete(row.key);
            });
            saveClassSummarySelection();
            renderClassSummaryModal();
        });
        document.getElementById('debateBookClassSummaryCopyBtn')?.addEventListener('click', () => {
            const selected = getSelectedClassSummaryEntries();
            if (!selected.length) {
                if (hooks && hooks.showToast) {
                    hooks.showToast(t('classroomDebateBooksClassSummaryNoEntries'), true);
                }
                return;
            }
            void copyBooksClassSummary(selected);
        });
        document.getElementById('debateBookClassSummaryPrintBtn')?.addEventListener('click', () => {
            const selected = getSelectedClassSummaryEntries();
            if (!selected.length) {
                if (hooks && hooks.showToast) {
                    hooks.showToast(t('classroomDebateBooksClassSummaryNoEntries'), true);
                }
                return;
            }
            openBooksClassSummaryPrint(selected);
        });
    }

    function renderReportsMenu(panel) {
        const mount = panel.querySelector('#classroomDebateBooksReportsWrap');
        if (!mount) {
            return;
        }
        const openCls = reportsMenuOpen ? ' is-open' : '';
        const menuHidden = reportsMenuOpen ? '' : ' hidden';
        const reportsIcon = `<svg class="classroom-essay-reports-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`;
        mount.innerHTML = `
            <div class="classroom-essay-reports-menu${openCls}">
                <button type="button" id="classroomDebateBooksReportsBtn" class="btn btn-outline btn-compact classroom-essay-reports-btn" aria-expanded="${reportsMenuOpen ? 'true' : 'false'}" aria-haspopup="menu">
                    ${reportsIcon}${escapeHtml(t('classroomDebateBooksReportsBtn'))} ▾
                </button>
                <div id="classroomDebateBooksReportsDropdown" class="classroom-essay-reports-dropdown"${menuHidden} role="menu">
                    <button type="button" class="classroom-essay-reports-item" data-report-action="class-summary" role="menuitem">${escapeHtml(t('classroomDebateBooksClassSummaryBtn'))}</button>
                </div>
            </div>`;
        mount.querySelector('#classroomDebateBooksReportsBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            reportsMenuOpen = !reportsMenuOpen;
            renderReportsMenu(panel);
        });
        mount.querySelector('[data-report-action="class-summary"]')?.addEventListener('click', () => {
            closeReportsMenu();
            renderReportsMenu(panel);
            openClassSummaryModal();
        });
    }

    function buildStatusButton(studentId, statusKey, curStatus, editable) {
        const meta = DEBATE_BOOK_STATUS_META[statusKey] || DEBATE_BOOK_STATUS_META.not_issued;
        const disabled = editable ? '' : ' disabled';
        const stateMod = statusKey === curStatus ? '--active' : '--available';
        const pressed = statusKey === curStatus ? 'true' : 'false';
        const labelKey = `classroomDebateBookStatus_${statusKey}`;
        return `<button type="button" class="btn btn-small selection-chip classroom-status-chip classroom-debate-book-stage ${meta.cls} classroom-debate-book-stage${stateMod}" data-student-id="${escapeAttr(studentId)}" data-status="${escapeAttr(statusKey)}" aria-pressed="${pressed}"${disabled}>${escapeHtml(t(labelKey))}</button>`;
    }

    function buildStatusCell(studentId, editable) {
        const d = domain();
        const rec = getRecord(studentId);
        const current = rec.status || 'not_issued';
        const statuses = d && Array.isArray(d.DEBATE_BOOK_STATUSES) ? d.DEBATE_BOOK_STATUSES : [];
        const buttons = statuses
            .map((status) => buildStatusButton(studentId, status, current, editable))
            .join('');
        return `<div class="classroom-debate-book-status-selector" role="group" aria-label="${escapeAttr(t('classroomDebateBooksColStatus'))}">${buttons}</div>`;
    }

    function applyBatchStatus(panel, status) {
        const d = domain();
        if (!d || !d.DEBATE_BOOK_STATUSES.includes(status) || !selectedStudentIds.size) {
            return;
        }
        if (!access() || !access().canEditClass(getClassData())) {
            return;
        }
        const sids = Array.from(selectedStudentIds);
        sids.forEach((sid) => {
            setRecord(sid, { status });
        });
        selectedStudentIds.clear();
        render(panel);
        scheduleStatusSave();
        if (status === 'issued' || status === 'missing') {
            void (async () => {
                for (const sid of sids) {
                    await resolveTransfersForStudent(sid);
                }
                render(panel);
            })();
        }
    }

    function renderBatchActions(panel) {
        const mount = panel.querySelector('#classroomDebateBooksBatchActions');
        if (!mount) {
            return;
        }
        if (!draftDistribution || !selectedStudentIds.size) {
            mount.innerHTML = '';
            mount.hidden = true;
            return;
        }
        mount.hidden = false;
        const editable = access() && access().canEditClass(getClassData());
        const disabled = editable ? '' : ' disabled';
        const batchBtn = (status) => {
            const meta = DEBATE_BOOK_STATUS_META[status] || DEBATE_BOOK_STATUS_META.not_issued;
            return `<button type="button" class="btn btn-small classroom-debate-book-batch-status-btn ${meta.cls}" data-batch-status="${escapeAttr(status)}"${disabled}>${escapeHtml(t(`classroomDebateBookStatus_${status}`))}</button>`;
        };
        mount.innerHTML = `
            <div class="classroom-essay-batch-row classroom-batch-row classroom-debate-books-batch-row">
                <span class="classroom-essay-batch-label">${escapeHtml(tf('classroomDebateBooksBatchSelected', { count: selectedStudentIds.size }))}</span>
                ${batchBtn('not_issued')}
                ${batchBtn('issued')}
                ${batchBtn('missing')}
                <button type="button" id="classroomDebateBooksBatchClearBtn" class="btn btn-outline btn-compact btn-small"${disabled}>${escapeHtml(t('classroomDebateBooksBatchClear'))}</button>
            </div>`;
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

        const meta = resolveBookMeta();
        const missingBook = !meta.bookTitle && !String(classData.book || '').trim();
        const missingHint = missingBook
            ? `<p class="section-hint classroom-debate-books-missing-book">${escapeHtml(t('classroomDebateBooksNoBook'))}</p>`
            : '';

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
                </div>${missingHint}`;
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
            </div>${missingHint}`;
    }

    function renderStatsBar(panel) {
        const mount = panel.querySelector('#classroomDebateBooksStatsBar');
        if (!mount) {
            return;
        }
        const d = domain();
        if (!d || !draftDistribution || !classId) {
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

    function bindSelectionControls(panel, rowsMount, students) {
        const selectAll = panel.querySelector('#classroomDebateBooksSelectAll');
        const allIds = students.map((e) => e.student.id);
        const allSelected = allIds.length > 0 && allIds.every((id) => selectedStudentIds.has(id));

        if (selectAll) {
            selectAll.checked = allSelected;
            selectAll.indeterminate = !allSelected && allIds.some((id) => selectedStudentIds.has(id));
            selectAll.disabled = !allIds.length;
            selectAll.onchange = () => {
                if (selectAll.checked) {
                    allIds.forEach((id) => selectedStudentIds.add(id));
                } else {
                    allIds.forEach((id) => selectedStudentIds.delete(id));
                }
                renderRows(panel);
                renderBatchActions(panel);
            };
        }

        rowsMount.querySelectorAll('.classroom-debate-book-select').forEach((input) => {
            const sid = input.getAttribute('data-student-id');
            input.checked = selectedStudentIds.has(sid);
            input.addEventListener('change', () => {
                if (input.checked) {
                    selectedStudentIds.add(sid);
                } else {
                    selectedStudentIds.delete(sid);
                }
                const headerCb = panel.querySelector('#classroomDebateBooksSelectAll');
                if (headerCb) {
                    const every = allIds.every((id) => selectedStudentIds.has(id));
                    headerCb.checked = every;
                    headerCb.indeterminate = !every && selectedStudentIds.size > 0;
                }
                renderBatchActions(panel);
            });
        });
    }

    function renderRows(panel) {
        const rowsMount = panel.querySelector('#classroomDebateBooksRows');
        if (!rowsMount) {
            return;
        }
        const editable = access() && access().canEditClass(getClassData());
        const students = getStudents();
        pruneSelectedStudentIds(students);
        const rowApi = global.CCPClassroomStudentRow;
        const classData = getClassData();

        if (!classData) {
            rowsMount.innerHTML = `<tr><td colspan="5" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomDebateBooksPickClass'))}</p></td></tr>`;
            return;
        }

        if (!periodKey) {
            rowsMount.innerHTML = `<tr><td colspan="5" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomDebateBooksNoMonths'))}</p></td></tr>`;
            return;
        }

        if (!students.length) {
            rowsMount.innerHTML = `<tr><td colspan="5" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomNoStudentsHint'))}</p></td></tr>`;
            bindSelectionControls(panel, rowsMount, students);
            return;
        }

        rowsMount.innerHTML = students
            .map((entry) => {
                const sid = entry.student.id;
                const rec = getRecord(sid);
                const status = rec.status || 'not_issued';
                const note = rec.note || '';
                const issuedAt = rec.issuedAt || '';
                const identity = rowApi
                    ? rowApi.formatStudentIdentityColumn(entry, t)
                    : escapeHtml(entry.student.name);
                const railCls = ` classroom-sheet-row--status-rail classroom-sheet-row--status-debate-book-${escapeAttr(status)}`;
                const disabled = editable ? '' : ' disabled';
                const checked = selectedStudentIds.has(sid) ? ' checked' : '';
                const issuedCell =
                    status === 'issued'
                        ? `<input type="date" class="field-input field-control field-control--compact classroom-debate-book-issued-at" data-student-id="${escapeAttr(sid)}" value="${escapeAttr(issuedAt)}" aria-label="${escapeAttr(t('classroomDebateBooksColIssuedDate'))}"${disabled} />`
                        : `<span class="section-hint classroom-debate-book-issued-at-empty">—</span>`;
                const transferIds = getPendingTransferStudentIds();
                const transferCls = transferIds.has(sid) ? ' is-transfer-check' : '';
                const focusCls = focusStudentId && focusStudentId === sid ? ' is-transfer-focus' : '';
                return `<tr class="classroom-sheet-row${railCls}${transferCls}${focusCls}" data-student-id="${escapeAttr(sid)}">
                <td class="classroom-sheet-col-select"><input type="checkbox" class="classroom-debate-book-select" data-student-id="${escapeAttr(sid)}" aria-label="${escapeAttr(t('classroomDebateBooksSelectStudent'))}"${checked}${disabled} /></td>
                <td class="classroom-sheet-col-student">${identity}</td>
                <td class="classroom-sheet-col-status">${buildStatusCell(sid, editable)}</td>
                <td class="classroom-sheet-col-issued-date">${issuedCell}</td>
                <td class="classroom-sheet-col-notes"><input type="text" class="field-input field-control classroom-debate-book-note" data-student-id="${escapeAttr(sid)}" value="${escapeAttr(note)}"${disabled} /></td>
            </tr>`;
            })
            .join('');
        bindSelectionControls(panel, rowsMount, students);
        if (focusStudentId) {
            const focusRow = rowsMount.querySelector(
                `tr[data-student-id="${CSS.escape ? CSS.escape(focusStudentId) : focusStudentId}"]`
            );
            if (focusRow && focusRow.scrollIntoView) {
                focusRow.scrollIntoView({ block: 'nearest' });
            }
        }
    }

    function render(panel) {
        if (!panel) {
            return;
        }
        panelRef = panel;
        ensureAutosave(panel);
        renderTransferBanner(panel);
        renderReportsMenu(panel);
        renderContextBar(panel);
        renderStatsBar(panel);
        renderBatchActions(panel);
        renderRows(panel);
        const saveBtn = panel.querySelector('#classroomDebateBooksSaveBtn');
        if (saveBtn) {
            saveBtn.disabled = !(access() && access().canEditClass(getClassData()));
        }
        refreshZoneContextBar();
    }

    async function selectPeriod(panel, nextPeriodKey) {
        await flushBeforeLeave();
        periodKey = nextPeriodKey || '';
        if (classId && periodKey) {
            persistPeriodPreference(classId, periodKey);
        }
        selectedStudentIds.clear();
        loadDistribution();
        render(panel);
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
        panel.addEventListener('mousedown', (e) => {
            const reports = panel.querySelector('#classroomDebateBooksReportsWrap');
            if (reportsMenuOpen && reports && !reports.contains(e.target)) {
                closeReportsMenu();
                renderReportsMenu(panel);
            }
        });
        panel.addEventListener('change', (event) => {
            const target = event.target;
            if (!target) {
                return;
            }
            if (target.id === 'classroomDebateBooksPeriodSelect') {
                void selectPeriod(panel, target.value);
                return;
            }
            if (target.classList.contains('classroom-debate-book-issued-at')) {
                const sid = target.getAttribute('data-student-id');
                if (!sid) {
                    return;
                }
                setRecord(sid, { issuedAt: target.value, status: 'issued' });
                scheduleStatusSave();
            }
        });
        panel.addEventListener('input', (event) => {
            const target = event.target;
            if (!target) {
                return;
            }
            if (target.classList.contains('classroom-debate-book-issued-at')) {
                const sid = target.getAttribute('data-student-id');
                if (!sid) {
                    return;
                }
                setRecord(sid, { issuedAt: target.value, status: 'issued' });
                scheduleStatusSave();
                return;
            }
            if (!target.classList.contains('classroom-debate-book-note')) {
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
            const statusBtn = event.target && event.target.closest('.classroom-debate-book-stage');
            if (statusBtn && panel.contains(statusBtn)) {
                if (statusBtn.disabled) {
                    return;
                }
                const sid = statusBtn.getAttribute('data-student-id');
                const status = statusBtn.getAttribute('data-status');
                if (!sid || !status) {
                    return;
                }
                setRecord(sid, { status });
                renderStatsBar(panel);
                renderRows(panel);
                scheduleStatusSave();
                if (status === 'issued' || status === 'missing') {
                    void resolveTransfersForStudent(sid).then(() => {
                        renderTransferBanner(panel);
                        renderRows(panel);
                    });
                }
                return;
            }
            const transferIssued = event.target && event.target.closest('.classroom-debate-books-transfer-mark-issued');
            if (transferIssued && (panel.contains(transferIssued) || document.body.contains(transferIssued))) {
                if (transferIssued.disabled) {
                    return;
                }
                const sid = transferIssued.getAttribute('data-student-id');
                const checkId = transferIssued.getAttribute('data-check-id');
                if (sid) {
                    setRecord(sid, { status: 'issued' });
                    scheduleStatusSave();
                }
                void (async () => {
                    if (checkId) {
                        await resolveTransferCheck(checkId);
                    } else if (sid) {
                        await resolveTransfersForStudent(sid);
                    }
                    render(panel);
                })();
                return;
            }
            const transferMissing = event.target && event.target.closest('.classroom-debate-books-transfer-mark-missing');
            if (transferMissing && (panel.contains(transferMissing) || document.body.contains(transferMissing))) {
                if (transferMissing.disabled) {
                    return;
                }
                const sid = transferMissing.getAttribute('data-student-id');
                const checkId = transferMissing.getAttribute('data-check-id');
                if (sid) {
                    setRecord(sid, { status: 'missing' });
                    scheduleStatusSave();
                }
                void (async () => {
                    if (checkId) {
                        await resolveTransferCheck(checkId);
                    } else if (sid) {
                        await resolveTransfersForStudent(sid);
                    }
                    render(panel);
                })();
                return;
            }
            const transferDismiss = event.target && event.target.closest('.classroom-debate-books-transfer-dismiss');
            if (transferDismiss && (panel.contains(transferDismiss) || document.body.contains(transferDismiss))) {
                if (transferDismiss.disabled) {
                    return;
                }
                const checkId = transferDismiss.getAttribute('data-check-id');
                if (checkId) {
                    void resolveTransferCheck(checkId).then(() => render(panel));
                }
                return;
            }
            const batchBtn = event.target && event.target.closest('[data-batch-status]');
            if (batchBtn && panel.contains(batchBtn)) {
                applyBatchStatus(panel, batchBtn.getAttribute('data-batch-status'));
                return;
            }
            const clearBtn = event.target && event.target.closest('#classroomDebateBooksBatchClearBtn');
            if (clearBtn) {
                selectedStudentIds.clear();
                renderRows(panel);
                renderBatchActions(panel);
                return;
            }
            const saveBtn = event.target && event.target.closest('#classroomDebateBooksSaveBtn');
            if (saveBtn) {
                void persistDistribution(panel, { silent: false });
            }
        });
    }

    function subscribeContext() {
        if (contextSubscribed || typeof global.CCPActiveContext === 'undefined') {
            return;
        }
        contextSubscribed = true;
        global.CCPActiveContext.subscribe(async (detail) => {
            const panel = panelRef || document.getElementById('panel-debate-books');
            if (!panel || panel.hidden) {
                return;
            }
            if (!detail || detail.classId === undefined) {
                return;
            }
            const nextClassId = resolveClassId({ classId: detail.classId });
            if (nextClassId === classId) {
                return;
            }
            await flushBeforeLeave();
            classId = nextClassId;
            selectedStudentIds.clear();
            ensurePeriodForClass();
            loadDistribution();
            render(panel);
        });
    }

    async function initTab(nextHooks, options) {
        hooks = nextHooks || hooks;
        await flushBeforeLeave();
        const panel = document.getElementById('panel-debate-books');
        if (!panel) {
            return;
        }
        panelRef = panel;
        bindMountEvents(panel);
        bindClassSummaryModal();
        subscribeContext();
        if (options && options.classId && typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.setFromClass) {
            global.CCPActiveContext.setFromClass(getAppData(), options.classId, undefined, 'debate-books-nav');
        } else if (options && options.classId && global.CCPClassroomZoneContext && global.CCPClassroomZoneContext.setActiveClassId) {
            global.CCPClassroomZoneContext.setActiveClassId(options.classId);
        }
        classId = resolveClassId(options);
        focusStudentId = (options && options.focusStudentId) || '';
        selectedStudentIds.clear();
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
        classId = resolveClassId({ classId });
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
