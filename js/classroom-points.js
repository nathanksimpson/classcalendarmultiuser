/**
 * Classroom points ledger — participation / behavior points per student.
 */
(function (global) {
    let hooks = null;
    let classId = '';
    let dateStr = '';
    const selectedStudentIds = new Set();
    /** @type {Promise<unknown>} */
    let pointsSaveChain = Promise.resolve();

    function enqueuePointsSave(task) {
        const run = pointsSaveChain.then(task, task);
        pointsSaveChain = run.catch(() => {});
        return run;
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

    function getAppData() {
        return hooks && hooks.getAppData ? hooks.getAppData() : {};
    }

    function getEditableClasses() {
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

    function getClassData() {
        const data = getAppData();
        return (data.classes || []).find((c) => c && c.id === classId) || null;
    }

    function getStudents() {
        const d = domain();
        const data = getAppData();
        return d ? d.resolveStudentsForClass(getClassData(), data.cohorts) : [];
    }

    function ensureClassId() {
        const classes = getEditableClasses();
        if (classId && classes.some((c) => c.id === classId)) {
            return;
        }
        classId = classes[0] ? classes[0].id : '';
    }

    function setClassId(id) {
        classId = String(id || '').trim();
        if (hooks && hooks.setUiPref) {
            hooks.setUiPref('classroomTabClassId', classId);
        }
    }

    function setDateStr(d) {
        dateStr = String(d || '').trim();
        if (hooks && hooks.setUiPref) {
            hooks.setUiPref('classroomPointsDate', dateStr);
        }
    }

    function rollPointsDateToTodayIfStale() {
        const d = domain();
        if (!d) {
            return false;
        }
        const today = d.todayISO();
        if (!dateStr || d.compareDateStr(dateStr, today) < 0) {
            setDateStr(today);
            return true;
        }
        return false;
    }

    let dateRollListenersBound = false;

    function bindPointsDateRollListeners() {
        if (dateRollListenersBound) {
            return;
        }
        dateRollListenersBound = true;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') {
                return;
            }
            const panel = document.getElementById('panel-points');
            if (!panel || panel.hidden) {
                return;
            }
            if (rollPointsDateToTodayIfStale()) {
                render(panel);
            }
        });
    }

    function pruneSelectedStudentIds(students) {
        const valid = new Set((students || []).map((e) => e.student.id));
        Array.from(selectedStudentIds).forEach((id) => {
            if (!valid.has(id)) {
                selectedStudentIds.delete(id);
            }
        });
    }

    function reasonsApi() {
        return global.CCPClassroomPointReasons;
    }

    function buildReasonSelectHtml(scope, disabled) {
        const api = reasonsApi();
        const defaultId = api ? api.DEFAULT_PRESET_ID : 'homework';
        const presets = api ? api.getPointReasonPresets(t) : [];
        const options = presets
            .map((preset) => {
                const sel = preset.id === defaultId ? ' selected' : '';
                return `<option value="${escapeHtml(preset.id)}"${sel}>${escapeHtml(preset.label)}</option>`;
            })
            .join('');
        const isBatch = scope === 'batch';
        const selectClass = isBatch
            ? 'classroom-points-batch-reason-select'
            : 'classroom-point-reason-select';
        const otherClass = isBatch
            ? 'classroom-points-batch-reason-other'
            : 'classroom-point-reason-other';
        const studentAttr = isBatch ? '' : ` data-student-id="${escapeHtml(scope)}"`;
        return `<div class="classroom-point-reason-wrap">
            <select class="field-select field-control--compact ${selectClass}"${studentAttr} aria-label="${escapeHtml(t('classroomPointReason'))}"${disabled}>
                ${options}
            </select>
            <input type="text" class="field-input field-control--compact ${otherClass}"${studentAttr} placeholder="${escapeHtml(t('classroomPointReasonOtherPlaceholder'))}" aria-label="${escapeHtml(t('classroomPointReasonOtherPlaceholder'))}" hidden${disabled} />
        </div>`;
    }

    function syncReasonOtherVisibility(root) {
        const api = reasonsApi();
        if (!root || !api) {
            return;
        }
        const select = root.querySelector(
            '.classroom-point-reason-select, .classroom-points-batch-reason-select'
        );
        const otherInput = root.querySelector(
            '.classroom-point-reason-other, .classroom-points-batch-reason-other'
        );
        if (!select || !otherInput) {
            return;
        }
        const showOther = api.isOtherReasonPreset(select.value);
        otherInput.hidden = !showOther;
        if (!showOther) {
            otherInput.value = '';
        }
    }

    function resolveReasonFromRoot(root) {
        const api = reasonsApi();
        if (!root || !api) {
            return '';
        }
        const select = root.querySelector(
            '.classroom-point-reason-select, .classroom-points-batch-reason-select'
        );
        const otherInput = root.querySelector(
            '.classroom-point-reason-other, .classroom-points-batch-reason-other'
        );
        const presetId = select?.value || api.DEFAULT_PRESET_ID;
        const customText = otherInput?.value || '';
        return api.resolvePointReason({
            presetId,
            customText,
            translate: t
        });
    }

    function validateReasonRoot(root) {
        const api = reasonsApi();
        if (!root || !api) {
            return { ok: true, reason: '' };
        }
        const select = root.querySelector(
            '.classroom-point-reason-select, .classroom-points-batch-reason-select'
        );
        const presetId = select?.value || '';
        const reason = resolveReasonFromRoot(root);
        if (api.isOtherReasonPreset(presetId) && !reason) {
            return { ok: false, reason: '' };
        }
        return { ok: true, reason };
    }

    function buildPointEntry(studentId, delta, reason) {
        const d = domain();
        return {
            id: d.newId('pt'),
            classId,
            studentId,
            date: dateStr,
            delta: Math.round(delta),
            reason: String(reason || '').trim()
        };
    }

    function resolveSignedDelta(rawValue, mode) {
        const n = Number(rawValue);
        if (!Number.isFinite(n) || n === 0) {
            return null;
        }
        return mode === 'subtract' ? -Math.abs(n) : Math.abs(n);
    }

    async function savePointEntries(panel, entries, options) {
        return enqueuePointsSave(() => savePointEntriesNow(panel, entries, options));
    }

    async function savePointEntriesNow(panel, entries, options) {
        const d = domain();
        const appData = getAppData();
        if (!d || !entries.length) {
            return;
        }
        const next = d.appendPointEntries
            ? d.appendPointEntries(appData.studentPoints, entries)
            : entries.reduce((list, entry) => d.appendPointEntry(list, entry), appData.studentPoints);
        // #region agent log
        const _dbgRevBefore = typeof CalendarSync !== 'undefined' && CalendarSync.state ? CalendarSync.state.revision : null;
        fetch('http://127.0.0.1:7819/ingest/66f5e2ef-d4bf-4b46-be19-67f9a9ebf548',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'72a155'},body:JSON.stringify({sessionId:'72a155',runId:'pre-fix',hypothesisId:'H1-H4',location:'classroom-points.js:savePointEntries:start',message:'points save start',data:{entryCount:entries.length,classId,dateStr,clientRevision:_dbgRevBefore},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        try {
            await hooks.saveClassroom({ studentPoints: next }, { skipPointsNoteReconcile: true });
            // #region agent log
            const _dbgRevAfterClassroom = typeof CalendarSync !== 'undefined' && CalendarSync.state ? CalendarSync.state.revision : null;
            fetch('http://127.0.0.1:7819/ingest/66f5e2ef-d4bf-4b46-be19-67f9a9ebf548',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'72a155'},body:JSON.stringify({sessionId:'72a155',runId:'pre-fix',hypothesisId:'H1',location:'classroom-points.js:savePointEntries:afterClassroom',message:'classroom save ok',data:{clientRevision:_dbgRevAfterClassroom},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            if (typeof hooks.syncPointsDayNote === 'function') {
                await hooks.syncPointsDayNote(classId, dateStr);
            }
            // #region agent log
            const _dbgRevAfterDayNote = typeof CalendarSync !== 'undefined' && CalendarSync.state ? CalendarSync.state.revision : null;
            fetch('http://127.0.0.1:7819/ingest/66f5e2ef-d4bf-4b46-be19-67f9a9ebf548',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'72a155'},body:JSON.stringify({sessionId:'72a155',runId:'pre-fix',hypothesisId:'H2-H5',location:'classroom-points.js:savePointEntries:afterDayNote',message:'day note sync ok',data:{clientRevision:_dbgRevAfterDayNote},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
        } catch (err) {
            // #region agent log
            fetch('http://127.0.0.1:7819/ingest/66f5e2ef-d4bf-4b46-be19-67f9a9ebf548',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'72a155'},body:JSON.stringify({sessionId:'72a155',runId:'pre-fix',hypothesisId:'H1-H5',location:'classroom-points.js:savePointEntries:error',message:'points save failed',data:{status:err&&err.status,errMessage:err&&err.message,hasConflictDoc:!!(err&&err.body&&err.body.document),clientRevision:typeof CalendarSync!=='undefined'&&CalendarSync.state?CalendarSync.state.revision:null,serverRevision:err&&err.body&&err.body.document?err.body.document.revision:null},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            throw err;
        }
        const batchMode = options && options.batchMode;
        hooks.showToast(
            entries.length > 1
                ? t(batchMode === 'subtract' ? 'classroomPointsBatchSubtracted' : 'classroomPointsBatchApplied').replace(
                      '{n}',
                      String(entries.length)
                  )
                : t('classroomPointsNoteSynced')
        );
        if (entries.length > 1) {
            selectedStudentIds.clear();
        }
        render(panel);
    }

    function renderToolbar(panel) {
        const mount = panel.querySelector('#classroomPointsToolbar');
        if (!mount) {
            return;
        }
        ensureClassId();
        const classes = getEditableClasses();
        const students = getStudents();
        pruneSelectedStudentIds(students);
        const d = domain();
        const today = d ? d.todayISO() : '';
        const editable = access() && access().canEditClass(getClassData());
        const disabled = editable ? '' : ' disabled';

        if (!classes.length) {
            mount.innerHTML = `<p class="classroom-points-empty-msg section-hint">${escapeHtml(t('classroomPointsEmptyNoClass'))}</p>`;
            return;
        }

        const classOptions = classes
            .map((c) => {
                const sel = c.id === classId ? ' selected' : '';
                return `<option value="${escapeHtml(c.id)}"${sel}>${escapeHtml(c.name || c.id)}</option>`;
            })
            .join('');

        const studentLine = students.length
            ? t('classroomPointsStudentCount').replace('{n}', String(students.length))
            : t('classroomPointsEmptyNoStudents');

        mount.innerHTML = `
            <div class="classroom-points-toolbar-row">
                <label class="classroom-points-toolbar-field">
                    <span class="classroom-points-toolbar-label">${escapeHtml(t('classroomPointsClassLabel'))}</span>
                    <select id="classroomPointsClassSelect" class="field-select field-control--compact">${classOptions}</select>
                </label>
                <label class="classroom-points-toolbar-field">
                    <span class="classroom-points-toolbar-label">${escapeHtml(t('classroomPointsDateLabel'))}</span>
                    <input type="date" id="classroomPointsDateInput" class="field-input field-control--compact" value="${escapeHtml(dateStr)}" />
                </label>
                <button type="button" class="btn btn-outline btn-compact" id="classroomPointsTodayBtn">${escapeHtml(t('classroomPointsToday'))}</button>
            </div>
            <div class="classroom-points-batch-row">
                <label class="classroom-points-toolbar-field classroom-points-batch-delta-field">
                    <span class="classroom-points-toolbar-label">${escapeHtml(t('classroomPointsBatchDelta'))}</span>
                    <input type="number" id="classroomPointsBatchDelta" class="field-input field-control--compact" step="1" value="1" aria-label="${escapeHtml(t('classroomPointsBatchDelta'))}"${disabled} />
                </label>
                <div class="classroom-points-batch-reason-field">${buildReasonSelectHtml('batch', disabled)}</div>
                <button type="button" class="btn btn-primary btn-compact" id="classroomPointsBatchApplyBtn"${editable ? '' : ' disabled'}>${escapeHtml(t('classroomPointsBatchApply'))}</button>
                <button type="button" class="btn btn-outline btn-compact" id="classroomPointsBatchSubtractBtn"${editable ? '' : ' disabled'}>${escapeHtml(t('classroomPointsBatchSubtract'))}</button>
            </div>
            <p class="classroom-points-toolbar-meta section-hint">${escapeHtml(studentLine)}</p>`;

        const batchReasonWrap = mount.querySelector('.classroom-points-batch-reason-field');
        if (batchReasonWrap) {
            syncReasonOtherVisibility(batchReasonWrap);
            batchReasonWrap.querySelector('.classroom-points-batch-reason-select')?.addEventListener('change', () => {
                syncReasonOtherVisibility(batchReasonWrap);
            });
        }

        mount.querySelector('#classroomPointsClassSelect')?.addEventListener('change', (e) => {
            setClassId(e.target.value);
            render(panel);
        });
        mount.querySelector('#classroomPointsDateInput')?.addEventListener('change', (e) => {
            setDateStr(e.target.value);
            render(panel);
        });
        mount.querySelector('#classroomPointsTodayBtn')?.addEventListener('click', () => {
            setDateStr(today);
            render(panel);
        });
        mount.querySelector('#classroomPointsBatchApplyBtn')?.addEventListener('click', () => {
            void applyPointsToSelected(panel, 'add');
        });
        mount.querySelector('#classroomPointsBatchSubtractBtn')?.addEventListener('click', () => {
            void applyPointsToSelected(panel, 'subtract');
        });
    }

    async function applyPointToStudent(panel, studentId, mode) {
        const d = domain();
        if (!d || !access() || !access().canEditClass(getClassData())) {
            return;
        }
        const rowsMount = panel.querySelector('#classroomPointsRows');
        const row = rowsMount?.querySelector(`tr[data-student-id="${studentId}"]`);
        if (!row) {
            return;
        }
        const delta = resolveSignedDelta(row.querySelector('.classroom-point-delta')?.value, mode);
        const reasonWrap = row.querySelector('.classroom-point-reason-wrap');
        const reasonCheck = validateReasonRoot(reasonWrap);
        if (delta === null) {
            hooks.showToast(t('classroomPointInvalid'), true);
            return;
        }
        if (!reasonCheck.ok) {
            hooks.showToast(t('classroomPointReasonOtherRequired'), true);
            return;
        }
        try {
            await savePointEntries(panel, [buildPointEntry(studentId, delta, reasonCheck.reason)]);
        } catch (err) {
            const msg =
                err && err.status === 409
                    ? t('classroomPointsConflictToast')
                    : err.message || String(err);
            hooks.showToast(msg, true);
        }
    }

    async function applyPointsToSelected(panel, mode) {
        const d = domain();
        const students = getStudents();
        if (!d || !access() || !access().canEditClass(getClassData())) {
            return;
        }
        if (!selectedStudentIds.size) {
            hooks.showToast(t('classroomPointsBatchNoneSelected'), true);
            return;
        }
        const delta = resolveSignedDelta(panel.querySelector('#classroomPointsBatchDelta')?.value, mode || 'add');
        if (delta === null) {
            hooks.showToast(t('classroomPointInvalid'), true);
            return;
        }
        const batchReasonRoot = panel.querySelector('.classroom-points-batch-reason-field');
        const reasonCheck = validateReasonRoot(batchReasonRoot);
        if (!reasonCheck.ok) {
            hooks.showToast(t('classroomPointReasonOtherRequired'), true);
            return;
        }
        const entries = Array.from(selectedStudentIds)
            .filter((sid) => students.some((e) => e.student.id === sid))
            .map((sid) => buildPointEntry(sid, delta, reasonCheck.reason));
        if (!entries.length) {
            hooks.showToast(t('classroomPointsBatchNoneSelected'), true);
            return;
        }
        try {
            await savePointEntries(panel, entries, { batchMode: mode || 'add' });
        } catch (err) {
            const msg =
                err && err.status === 409
                    ? t('classroomPointsConflictToast')
                    : err.message || String(err);
            hooks.showToast(msg, true);
        }
    }

    function renderIntro(panel) {
        const mount = panel.querySelector('#classroomPointsIntro');
        if (!mount) {
            return;
        }
        mount.innerHTML = `<p class="section-hint classroom-points-intro">${escapeHtml(t('classroomPointsIntro'))}</p>`;
    }

    function renderEmptyStudents(panel, rowsMount, ledgerMount) {
        rowsMount.innerHTML = `<tr><td colspan="5" class="classroom-sheet-empty">
            <p class="classroom-points-empty-msg">${escapeHtml(t('classroomPointsEmptyNoStudents'))}</p>
            <button type="button" class="btn btn-outline btn-compact classroom-points-go-students-btn">${escapeHtml(t('classroomPointsGoStudents'))}</button>
        </td></tr>`;
        if (ledgerMount) {
            ledgerMount.innerHTML = '';
        }
        panel.querySelector('.classroom-points-go-students-btn')?.addEventListener('click', () => {
            if (hooks && typeof hooks.navigateToTab === 'function') {
                hooks.navigateToTab('students');
            }
        });
    }

    function bindReasonControls(rowsMount) {
        rowsMount.querySelectorAll('.classroom-point-reason-select').forEach((select) => {
            const row = select.closest('tr');
            const wrap = select.closest('.classroom-point-reason-wrap');
            syncReasonOtherVisibility(wrap || row);
            select.addEventListener('change', () => {
                syncReasonOtherVisibility(wrap || row);
            });
        });
    }

    function bindSelectionControls(panel, rowsMount, students) {
        const selectAll = panel.querySelector('#classroomPointsSelectAll');
        const allIds = students.map((e) => e.student.id);
        const allSelected = allIds.length > 0 && allIds.every((id) => selectedStudentIds.has(id));

        if (selectAll) {
            selectAll.checked = allSelected;
            selectAll.indeterminate = !allSelected && selectedStudentIds.size > 0;
            selectAll.onchange = () => {
                if (selectAll.checked) {
                    allIds.forEach((id) => selectedStudentIds.add(id));
                } else {
                    allIds.forEach((id) => selectedStudentIds.delete(id));
                }
                renderRows(panel);
            };
        }

        rowsMount.querySelectorAll('.classroom-point-select').forEach((input) => {
            const sid = input.getAttribute('data-student-id');
            input.checked = selectedStudentIds.has(sid);
            input.addEventListener('change', () => {
                if (input.checked) {
                    selectedStudentIds.add(sid);
                } else {
                    selectedStudentIds.delete(sid);
                }
                const headerCb = panel.querySelector('#classroomPointsSelectAll');
                if (headerCb) {
                    const every = allIds.every((id) => selectedStudentIds.has(id));
                    headerCb.checked = every;
                    headerCb.indeterminate = !every && selectedStudentIds.size > 0;
                }
            });
        });
    }

    function renderRows(panel) {
        const rowsMount = panel.querySelector('#classroomPointsRows');
        const ledgerMount = panel.querySelector('#classroomPointsLedger');
        if (!rowsMount) {
            return;
        }
        const d = domain();
        const data = getAppData();
        const editable = access() && access().canEditClass(getClassData());
        const students = getStudents();
        pruneSelectedStudentIds(students);
        const rowApi = global.CCPClassroomStudentRow;
        const points = d ? d.listPointsForClass(data.studentPoints, classId) : [];

        if (!getEditableClasses().length) {
            rowsMount.innerHTML = '';
            if (ledgerMount) {
                ledgerMount.innerHTML = '';
            }
            return;
        }

        if (!students.length) {
            renderEmptyStudents(panel, rowsMount, ledgerMount);
            return;
        }

        rowsMount.innerHTML = students
            .map((entry) => {
                const sid = entry.student.id;
                const total = d ? d.sumPointsForStudent(data.studentPoints, classId, sid) : 0;
                const identity = rowApi
                    ? rowApi.formatStudentIdentityColumn(entry, t)
                    : escapeHtml(entry.student.name);
                const disabled = editable ? '' : ' disabled';
                const checked = selectedStudentIds.has(sid) ? ' checked' : '';
                return `<tr class="classroom-sheet-row" data-student-id="${escapeHtml(sid)}">
                <td class="classroom-sheet-col-select">
                    <input type="checkbox" class="classroom-point-select" data-student-id="${escapeHtml(sid)}" aria-label="${escapeHtml(t('classroomPointsBatchCol'))}"${checked}${disabled} />
                </td>
                <td class="classroom-sheet-col-student">${identity}</td>
                <td class="classroom-sheet-col-points-total"><strong>${escapeHtml(String(total))}</strong></td>
                <td class="classroom-sheet-col-points-delta">
                    <input type="number" class="field-input field-control--compact classroom-point-delta" data-student-id="${escapeHtml(sid)}" step="1" value="1" aria-label="${escapeHtml(t('classroomPointDelta'))}"${disabled} />
                </td>
                <td class="classroom-sheet-col-notes">
                    <div class="classroom-point-action-wrap">
                        ${buildReasonSelectHtml(sid, disabled)}
                        <div class="classroom-point-btn-row">
                            <button type="button" class="btn btn-primary btn-compact classroom-point-add-btn" data-student-id="${escapeHtml(sid)}"${disabled ? ' disabled' : ''}>${escapeHtml(t('classroomPointAdd'))}</button>
                            <button type="button" class="btn btn-outline btn-compact classroom-point-subtract-btn" data-student-id="${escapeHtml(sid)}"${disabled ? ' disabled' : ''}>${escapeHtml(t('classroomPointSubtract'))}</button>
                        </div>
                    </div>
                </td>
            </tr>`;
            })
            .join('');

        bindReasonControls(rowsMount);
        bindSelectionControls(panel, rowsMount, students);

        rowsMount.querySelectorAll('.classroom-point-add-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                void applyPointToStudent(panel, btn.getAttribute('data-student-id'), 'add');
            });
        });
        rowsMount.querySelectorAll('.classroom-point-subtract-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                void applyPointToStudent(panel, btn.getAttribute('data-student-id'), 'subtract');
            });
        });

        if (ledgerMount) {
            const dayEntries = global.CCPClassroomPointsDayNote
                ? global.CCPClassroomPointsDayNote.listPointsForClassOnDate(
                    data.studentPoints,
                    classId,
                    dateStr
                )
                : points.filter((p) => p.date === dateStr);
            const recent = dayEntries.length
                ? dayEntries
                : points.slice(0, 20);
            if (!recent.length) {
                ledgerMount.innerHTML = `<p class="section-hint">${escapeHtml(t('classroomPointsLedgerEmpty'))}</p>`;
                return;
            }
            const title = dayEntries.length
                ? t('classroomPointsLedgerToday').replace('{date}', dateStr)
                : t('classroomPointsLedgerRecent');
            ledgerMount.innerHTML = `<p class="classroom-points-ledger-title section-hint">${escapeHtml(title)}</p><ul class="classroom-points-ledger-list">${recent
                .map((p) => {
                    const student = students.find((e) => e.student.id === p.studentId);
                    const name = student ? student.student.name : p.studentId;
                    const sign = p.delta > 0 ? '+' : '';
                    return `<li><span class="classroom-points-ledger-date">${escapeHtml(p.date)}</span> <strong>${escapeHtml(name)}</strong> ${escapeHtml(sign + String(p.delta))}${p.reason ? ` — ${escapeHtml(p.reason)}` : ''}</li>`;
                })
                .join('')}</ul>`;
        }
    }

    function render(panel) {
        if (!panel) {
            return;
        }
        bindPointsDateRollListeners();
        rollPointsDateToTodayIfStale();
        renderToolbar(panel);
        renderIntro(panel);
        renderRows(panel);
    }

    function initTab(h, options) {
        hooks = h;
        const data = getAppData();
        const d = domain();
        classId =
            (options && options.classId) ||
            (data.ui && data.ui.classroomTabClassId) ||
            '';
        dateStr =
            (options && options.date) ||
            (data.ui && data.ui.classroomPointsDate) ||
            (d ? d.todayISO() : '');
        ensureClassId();
        rollPointsDateToTodayIfStale();
        if (!dateStr && d) {
            dateStr = d.todayISO();
        }
        bindPointsDateRollListeners();
        render(document.getElementById('panel-points'));
    }

    global.CCPClassroomPoints = {
        initTab,
        render
    };
})(typeof window !== 'undefined' ? window : globalThis);
