/**
 * Visual cohort setup board — assign classes and teachers via buttons and pickers.
 */
(function (global) {
    let hooks = null;
    let boardView = 'mwf';
    let activePickerDialog = null;
    let activeTitleEdit = null;

    const DEFAULT_BOARD_SCOPE = {
        panelId: 'panel-cohorts',
        mwfId: 'setupBoardViewMwf',
        tthId: 'setupBoardViewTth',
        searchId: 'cohortsListSearch',
        mwfBtnId: 'setupBoardViewBtnMwf',
        tthBtnId: 'setupBoardViewBtnTth',
        allBtnId: 'setupBoardViewBtnAll'
    };

    /** @type {Map<string, object>} */
    const scopeHooksByPanel = new Map();
    const registeredScopes = [];

    const COHORT_DOW = { en: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], ko: ['', '월', '화', '수', '목', '금'] };
    const TTH_SET = new Set([2, 4]);

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function t(key) {
        return hooks && hooks.t ? hooks.t(key) : key;
    }

    function escapeHtml(s) {
        if (typeof CCPUtils !== 'undefined' && CCPUtils.escapeHtml) {
            return CCPUtils.escapeHtml(s);
        }
        return hooks && hooks.escapeHtml
            ? hooks.escapeHtml(s)
            : String(s || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
    }

    function getApi() {
        return global.CCPTeacherTimetable || null;
    }

    function getMatrixApi() {
        return global.CCPScheduleMatrix || null;
    }

    function getCohortMeetingDays(cohort) {
        if (global.CCPCohortManagement && global.CCPCohortManagement.getCohortMeetingDays) {
            return global.CCPCohortManagement.getCohortMeetingDays(cohort);
        }
        const matrix = getMatrixApi();
        const patternId = normalizeStr(cohort.schedulePattern);
        if (patternId && patternId !== 'custom' && matrix) {
            const pat = matrix.getPatterns()[patternId];
            if (pat && Array.isArray(pat.meetingDays)) {
                return pat.meetingDays.slice();
            }
        }
        return Array.isArray(cohort.meetingDays) ? cohort.meetingDays.slice() : [];
    }

    function getCohortBoardView(cohort) {
        if (!cohort) {
            return 'mwf';
        }
        const pat = normalizeStr(cohort.schedulePattern);
        if (pat === 'tth') {
            return 'tth';
        }
        if (pat === 'mwf' || pat === 'mw' || pat === 'wf' || pat === 'mf') {
            return 'mwf';
        }
        const api = getApi();
        if (!pat && hooks && api && api.getEffectiveCohortPattern) {
            return api.getEffectiveCohortPattern(cohort, hooks.getAppData());
        }
        const days = getCohortMeetingDays(cohort);
        if (days.length && days.every((d) => TTH_SET.has(d))) {
            return 'tth';
        }
        return 'mwf';
    }

    function normalizeBoardView(view) {
        if (view === 'tth' || view === 'all') {
            return view;
        }
        return 'mwf';
    }

    function ensureUiBoardView() {
        const appData = hooks.getAppData();
        if (!appData.ui) {
            appData.ui = {};
        }
        if (boardView !== 'mwf' && boardView !== 'tth' && boardView !== 'all') {
            boardView = normalizeBoardView(appData.ui.cohortsBoardView);
        }
        appData.ui.cohortsBoardView = boardView;
    }

    function persistBoardView() {
        ensureUiBoardView();
        if (hooks.saveUiStateToLocalStorage) {
            hooks.saveUiStateToLocalStorage();
        }
    }

    function getActiveBoardView() {
        ensureUiBoardView();
        return boardView;
    }

    function getScopeConfig(scopeHooks) {
        const h = scopeHooks || hooks;
        if (h && typeof h.getBoardScope === 'function') {
            return h.getBoardScope();
        }
        return DEFAULT_BOARD_SCOPE;
    }

    function registerScope(scope) {
        if (!scope || !scope.panelId) {
            return;
        }
        if (!registeredScopes.some((s) => s.panelId === scope.panelId)) {
            registeredScopes.push(scope);
        }
    }

    function setActiveBoardView(view) {
        boardView = normalizeBoardView(view);
        ensureUiBoardView();
        persistBoardView();
        registeredScopes.forEach((scope) => {
            syncViewSwitcherUiForScope(scope);
            const mwf = document.getElementById(scope.mwfId);
            const tth = document.getElementById(scope.tthId);
            if (mwf) {
                mwf.hidden = boardView === 'tth';
            }
            if (tth) {
                tth.hidden = boardView !== 'tth';
            }
        });
    }

    function syncViewSwitcherUiForScope(scope) {
        const mwfBtn = document.getElementById(scope.mwfBtnId);
        const tthBtn = document.getElementById(scope.tthBtnId);
        const allBtn = document.getElementById(scope.allBtnId);
        if (mwfBtn) {
            mwfBtn.classList.toggle('is-active', boardView === 'mwf');
        }
        if (tthBtn) {
            tthBtn.classList.toggle('is-active', boardView === 'tth');
        }
        if (allBtn) {
            allBtn.classList.toggle('is-active', boardView === 'all');
        }
    }

    function syncViewSwitcherUi() {
        registeredScopes.forEach(syncViewSwitcherUiForScope);
    }

    function getDefaultSchedulePatternForNewCohort() {
        return boardView === 'tth' ? 'tth' : 'mwf';
    }

    function persistAndRefresh() {
        hooks.saveData();
        if (hooks.invalidateScheduleCache) {
            hooks.invalidateScheduleCache();
        }
        if (hooks.refreshTimetablePanels) {
            hooks.refreshTimetablePanels();
        }
        if (global.CCPCohortManagement && global.CCPCohortManagement.onBoardChanged) {
            global.CCPCohortManagement.onBoardChanged();
        }
        renderBoard();
    }

    function getClassCohortIdsForBoard(classData) {
        const api = getApi();
        return api ? api.getClassCohortIds(classData) : [];
    }

    function getClassesInCohort(cohortId) {
        const appData = hooks.getAppData();
        const api = getApi();
        const list = [];
        (appData.classes || []).forEach((c) => {
            const inCohort = api
                ? api.classHasCohortId(c, cohortId)
                : normalizeStr(c.cohortId) === cohortId;
            if (inCohort) {
                list.push(c);
            }
        });
        return list;
    }

    function classDisplayLabel(classData) {
        let label = classData.name || '';
        if (!label && hooks.formatClassLabel) {
            try {
                label = hooks.formatClassLabel(classData) || '';
            } catch (_) {
                label = classData.id || '';
            }
        }
        return label || classData.id || '?';
    }

    function getTeachersOnClass(classData) {
        const api = getApi();
        if (api && api.getClassTeachersList) {
            return api.getClassTeachersList(classData);
        }
        const rows = Array.isArray(classData.classTeachers) ? classData.classTeachers : [];
        if (rows.length) {
            return rows;
        }
        const userId = normalizeStr(classData.assignedTeacherUserId);
        const name = normalizeStr(classData.assignedTeacherName);
        if (userId || name) {
            return [{ userId, name, displayName: name }];
        }
        return [];
    }

    function teacherRowLabel(row) {
        return normalizeStr(
            row.displayName || row.assignedTeacherName || row.name || row.userId || row.assignedTeacherUserId
        );
    }

    function unlinkClassFromCohortQuiet(classData, cohortId) {
        const appData = hooks.getAppData();
        const cohort = (appData.cohorts || []).find((c) => c.id === cohortId);
        const api = getApi();
        if (api) {
            api.removeClassCohortId(classData, cohortId);
            if (cohort) {
                hooks.syncClassCohortLinks(cohort);
            }
        } else if (normalizeStr(classData.cohortId) === cohortId) {
            classData.cohortId = '';
        }
        if (cohort && normalizeStr(cohort.homeroomHostClassId) === classData.id) {
            cohort.homeroomHostClassId = '';
            if (api) {
                api.clearCohortHomeroom(cohort);
            }
        }
    }

    function linkClassToCohortQuiet(classData, cohort) {
        const api = getApi();
        if (api) {
            api.addClassCohortId(classData, cohort.id);
            hooks.syncClassCohortLinks(cohort);
        } else {
            classData.cohortId = cohort.id;
            if (!Array.isArray(classData.cohortIds)) {
                classData.cohortIds = [cohort.id];
            } else if (!classData.cohortIds.includes(cohort.id)) {
                classData.cohortIds.push(cohort.id);
            }
        }
    }

    function assignClassToCohort(classData, cohort, payload) {
        if (!classData || !cohort) {
            return;
        }
        const targetId = cohort.id;
        const existing = getClassCohortIdsForBoard(classData);
        const fromId = payload && payload.fromCohortId ? payload.fromCohortId : '';
        const fromPool = !!(payload && payload.fromPool);
        const moveOnly = !!(payload && payload.moveOnly);

        if (existing.includes(targetId) && !fromId) {
            return;
        }
        if (fromId === targetId) {
            return;
        }

        const toRemove = new Set();
        if (fromId && fromId !== targetId) {
            toRemove.add(fromId);
        }
        if (fromPool && existing.length && moveOnly) {
            existing.forEach((id) => toRemove.add(id));
        }
        if (moveOnly && !fromPool && existing.length) {
            existing.forEach((id) => {
                if (id !== targetId) {
                    toRemove.add(id);
                }
            });
        }

        toRemove.forEach((cid) => unlinkClassFromCohortQuiet(classData, cid));
        if (!getClassCohortIdsForBoard(classData).includes(targetId)) {
            linkClassToCohortQuiet(classData, cohort);
        }
        const api = getApi();
        const appData = hooks.getAppData();
        if (api && api.inferCohortScheduleFromLinkedClasses) {
            api.inferCohortScheduleFromLinkedClasses(cohort, appData);
        }
        persistAndRefresh();
    }

    function unlinkClassFromCohort(classData, cohortId) {
        unlinkClassFromCohortQuiet(classData, cohortId);
        persistAndRefresh();
    }

    function formatWarningMessage(warning) {
        let msg = t(warning.messageKey);
        const params = warning.params || {};
        Object.keys(params).forEach((key) => {
            msg = msg.replace(new RegExp(`\\{${key}\\}`, 'g'), String(params[key]));
        });
        return msg;
    }

    function homeroomDisplayName(cohort) {
        const name = normalizeStr(cohort.homeroomTeacherName);
        if (name) {
            return name;
        }
        const uid = normalizeStr(cohort.homeroomTeacherUserId);
        return uid || '';
    }

    function otherCohortNamesForClass(classData, currentCohortId, appData) {
        return getClassCohortIdsForBoard(classData)
            .filter((id) => id !== currentCohortId)
            .map((id) => {
                const c = (appData.cohorts || []).find((x) => x && x.id === id);
                return c ? (c.name || id) : id;
            })
            .filter(Boolean);
    }

    function renderCohortClassSummaryRow(classData, cohort, appData) {
        const li = document.createElement('li');
        li.className = 'setup-board-cohort-class-row';
        li.dataset.classId = classData.id;

        const main = document.createElement('div');
        main.className = 'setup-board-cohort-class-row-main';
        main.dataset.classId = classData.id;

        const nameBtn = document.createElement('button');
        nameBtn.type = 'button';
        nameBtn.className = 'setup-board-cohort-class-name';
        nameBtn.textContent = classDisplayLabel(classData);
        nameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof hooks.onSelectClass === 'function') {
                hooks.onSelectClass(classData.id, cohort.id);
                return;
            }
            hooks.navigateToTab('classes', { classId: classData.id, host: 'setup' });
        });
        main.appendChild(nameBtn);

        const teachersEl = document.createElement('span');
        teachersEl.className = 'setup-board-cohort-class-teachers';
        const rows = getTeachersOnClass(classData);
        teachersEl.textContent = rows.length
            ? rows.map(teacherRowLabel).filter(Boolean).join(', ')
            : t('cohortsNoTeacher');
        main.appendChild(teachersEl);

        const api = getApi();
        if (api && rows.length && api.formatTeacherRowScheduleSummary) {
            const scheduleHint = api.formatTeacherRowScheduleSummary(classData, rows[0], appData);
            if (scheduleHint) {
                const sched = document.createElement('span');
                sched.className = 'setup-board-cohort-class-schedule section-hint';
                sched.textContent = scheduleHint;
                main.appendChild(sched);
            }
        }

        const others = otherCohortNamesForClass(classData, cohort.id, appData);
        if (others.length) {
            const also = document.createElement('span');
            also.className = 'setup-board-cohort-class-also section-hint';
            also.textContent = t('cohortsClassAlsoLinked').replace('{names}', others.join(', '));
            main.appendChild(also);
        }

        li.appendChild(main);

        if (global.CCPClassColorTile) {
            global.CCPClassColorTile.apply(main, classData, {});
        }

        const editLink = document.createElement('button');
        editLink.type = 'button';
        editLink.className = 'btn btn-outline btn-small setup-board-cohort-class-edit';
        editLink.textContent = t('setupBoardOpenClass');
        editLink.addEventListener('click', (e) => {
            e.stopPropagation();
            hooks.navigateToTab('classes', { classId: classData.id, host: 'setup' });
        });
        li.appendChild(editLink);

        return li;
    }

    function renderCohortWarningsList(cohort, appData) {
        const api = getApi();
        const frag = document.createDocumentFragment();
        if (!api || !api.collectCohortSetupWarnings) {
            return frag;
        }
        const warnings = api.collectCohortSetupWarnings(cohort, appData);
        if (!warnings.length) {
            return frag;
        }

        const heading = document.createElement('p');
        heading.className = 'setup-board-cohort-warnings-heading';
        heading.textContent = t('setupBoardCohortWarningsHeading');
        frag.appendChild(heading);

        const ul = document.createElement('ul');
        ul.className = 'setup-board-cohort-warnings';
        const hasError = warnings.some((w) => w.severity === 'error');
        if (hasError) {
            ul.setAttribute('role', 'alert');
        }

        warnings.forEach((w) => {
            const li = document.createElement('li');
            li.className = 'setup-board-cohort-warning';
            if (w.severity === 'error') {
                li.classList.add('is-error');
            } else if (w.severity === 'warn') {
                li.classList.add('is-warn');
            } else {
                li.classList.add('is-info');
            }
            li.textContent = formatWarningMessage(w);
            ul.appendChild(li);
        });
        frag.appendChild(ul);
        return frag;
    }

    function isReadOnly() {
        return hooks.isViewOnly && hooks.isViewOnly();
    }

    function closeActivePicker() {
        if (activePickerDialog) {
            if (activePickerDialog.open) {
                activePickerDialog.close();
            }
            activePickerDialog.remove();
            activePickerDialog = null;
        }
    }

    function openPickerDialog(title, bodyEl) {
        closeActivePicker();
        const dialog = document.createElement('dialog');
        dialog.className = 'setup-board-picker-dialog';
        const header = document.createElement('div');
        header.className = 'setup-board-picker-header';
        const h = document.createElement('h3');
        h.className = 'setup-board-picker-title';
        h.textContent = title;
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn btn-outline btn-small setup-board-picker-close';
        closeBtn.textContent = t('setupBoardPickerClose');
        closeBtn.addEventListener('click', () => closeActivePicker());
        header.appendChild(h);
        header.appendChild(closeBtn);
        dialog.appendChild(header);
        dialog.appendChild(bodyEl);
        dialog.addEventListener('cancel', () => closeActivePicker());
        document.body.appendChild(dialog);
        activePickerDialog = dialog;
        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
    }

    function buildPickerActionBtn(label, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline btn-small';
        btn.textContent = label;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
            closeActivePicker();
        });
        return btn;
    }

    function showAddClassToCohortPicker(cohort) {
        const appData = hooks.getAppData();
        const body = document.createElement('div');
        body.className = 'setup-board-picker-body';
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'module-list-search';
        search.placeholder = t('classListSearchPlaceholder') || 'Search classes…';
        const list = document.createElement('div');
        list.className = 'setup-board-picker-list';

        function renderList() {
            const q = normalizeStr(search.value).toLowerCase();
            list.innerHTML = '';
            const classes = (appData.classes || []).filter((cls) => {
                if (!cls || !cls.id) {
                    return false;
                }
                if (getClassCohortIdsForBoard(cls).includes(cohort.id)) {
                    return false;
                }
                if (!q) {
                    return true;
                }
                return classDisplayLabel(cls).toLowerCase().includes(q);
            });
            classes.sort((a, b) =>
                classDisplayLabel(a).localeCompare(classDisplayLabel(b), undefined, { sensitivity: 'base' })
            );
            if (!classes.length) {
                list.innerHTML = `<p class="module-list-empty">${escapeHtml(t('setupBoardPickerNoClasses'))}</p>`;
                return;
            }
            classes.forEach((cls) => {
                const row = document.createElement('div');
                row.className = 'setup-board-picker-row';
                row.dataset.classId = cls.id;
                const label = document.createElement('span');
                label.className = 'setup-board-picker-row-label';
                label.textContent = classDisplayLabel(cls);
                const actions = document.createElement('div');
                actions.className = 'setup-board-picker-row-actions';
                const linked = getClassCohortIdsForBoard(cls);
                actions.appendChild(
                    buildPickerActionBtn(t('setupBoardLinkToCohort'), () => {
                        assignClassToCohort(cls, cohort, { fromPool: true, moveOnly: false });
                    })
                );
                if (linked.length) {
                    actions.appendChild(
                        buildPickerActionBtn(t('setupBoardMoveToCohortOnly'), () => {
                            assignClassToCohort(cls, cohort, { fromPool: true, moveOnly: true });
                        })
                    );
                }
                row.appendChild(label);
                row.appendChild(actions);
                if (global.CCPClassColorTile) {
                    global.CCPClassColorTile.apply(row, cls, {});
                }
                list.appendChild(row);
            });
        }

        search.addEventListener('input', renderList);
        body.appendChild(search);
        body.appendChild(list);
        renderList();
        openPickerDialog(t('setupBoardAddClass'), body);
    }

    function openCohortEditorFor(cohortId) {
        if (global.CCPCohortManagement) {
            if (global.CCPCohortManagement.selectCohort) {
                global.CCPCohortManagement.selectCohort(cohortId);
            }
            if (global.CCPCohortManagement.openCohortEditor) {
                global.CCPCohortManagement.openCohortEditor();
            }
        }
    }

    function formatCohortClassCountMeta(n) {
        const key = n === 1 ? 'setupBoardCohortClassCountOne' : 'setupBoardCohortClassCount';
        return t(key).replace('{n}', String(n));
    }

    function getCohortDisplayTitle(cohort) {
        if (global.CCPCohortManagement && global.CCPCohortManagement.formatCohortDisplayTitle) {
            const label = global.CCPCohortManagement.formatCohortDisplayTitle(cohort);
            if (label) {
                return label;
            }
        }
        return normalizeStr(cohort.name) || t('timetableAddCohort');
    }

    function finishCohortTitleEdit(commit) {
        if (!activeTitleEdit) {
            return;
        }
        const edit = activeTitleEdit;
        activeTitleEdit = null;
        const value = edit.input.value;
        if (commit && global.CCPCohortManagement && global.CCPCohortManagement.setCohortNameFromBoard) {
            global.CCPCohortManagement.setCohortNameFromBoard(edit.cohortId, value);
            return;
        }
        edit.input.replaceWith(edit.titleBtn);
    }

    function beginCohortTitleEdit(cohort, titleBtn) {
        if (isReadOnly() || !cohort || !cohort.id) {
            return;
        }
        finishCohortTitleEdit(true);
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'setup-board-cohort-title-input field-input';
        input.value = cohort.name || '';
        input.setAttribute('aria-label', t('cohortsSectionIdentity'));
        const commit = () => finishCohortTitleEdit(true);
        const cancel = () => finishCohortTitleEdit(false);
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('blur', () => {
            window.setTimeout(() => {
                if (activeTitleEdit && activeTitleEdit.input === input) {
                    commit();
                }
            }, 0);
        });
        activeTitleEdit = {
            cohortId: cohort.id,
            input,
            titleBtn
        };
        titleBtn.replaceWith(input);
        input.focus();
        input.select();
    }

    function renderCohortContainer(cohort, appData) {
        if (!cohort || !cohort.id) {
            return document.createDocumentFragment();
        }
        const ro = isReadOnly();
        const box = document.createElement('article');
        box.className = 'setup-board-cohort';
        box.dataset.cohortId = cohort.id;
        if (global.CCPCohortManagement && global.CCPCohortManagement.selectCohort) {
            const selected = appData.ui && appData.ui.cohortsTabSelectedId === cohort.id;
            box.classList.toggle('is-selected', selected);
        }

        const header = document.createElement('header');
        header.className = 'setup-board-cohort-header';

        const titleRow = document.createElement('div');
        titleRow.className = 'setup-board-cohort-title-row';
        const title = document.createElement('button');
        title.type = 'button';
        title.className = 'setup-board-cohort-title';
        title.textContent = getCohortDisplayTitle(cohort);
        title.title = isReadOnly() ? '' : t('setupBoardCohortRenameHint');
        title.disabled = isReadOnly();
        title.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isReadOnly()) {
                beginCohortTitleEdit(cohort, title);
            }
        });
        titleRow.appendChild(title);

        if (global.CCPCohortManagement && global.CCPCohortManagement.formatCohortScheduleChipLabel) {
            const scheduleLabel = global.CCPCohortManagement.formatCohortScheduleChipLabel(cohort, appData);
            if (scheduleLabel) {
                const scheduleChip = document.createElement('span');
                scheduleChip.className = 'cohort-schedule-chip';
                scheduleChip.textContent = scheduleLabel;
                scheduleChip.setAttribute('aria-label', t('setupBoardCohortScheduleChipAria').replace('{days}', scheduleLabel));
                titleRow.appendChild(scheduleChip);
            }
        }

        if (global.CCPCohortManagement && global.CCPCohortManagement.computeCohortStatus) {
            const status = global.CCPCohortManagement.computeCohortStatus(cohort, appData) || 'draft';
            const chip = document.createElement('span');
            chip.className = 'cohort-status-chip cohort-status-chip--' + String(status).replace(/_/g, '-');
            chip.textContent = global.CCPCohortManagement.statusLabel
                ? global.CCPCohortManagement.statusLabel(status)
                : status;
            titleRow.appendChild(chip);
        }
        header.appendChild(titleRow);

        const api = getApi();
        const classCount = api
            ? api.getCohortClassIds(appData, cohort).length
            : (cohort.classIds || []).length;
        const meta = document.createElement('p');
        meta.className = 'setup-board-cohort-meta section-hint';
        meta.textContent = formatCohortClassCountMeta(classCount);
        header.appendChild(meta);

        const headerActions = document.createElement('div');
        headerActions.className = 'setup-board-cohort-header-actions';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-outline btn-small';
        editBtn.textContent = t('cohortsEditBtn');
        editBtn.disabled = ro;
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openCohortEditorFor(cohort.id);
        });
        headerActions.appendChild(editBtn);

        if (!ro) {
            const addClassBtn = document.createElement('button');
            addClassBtn.type = 'button';
            addClassBtn.className = 'btn btn-primary btn-small';
            addClassBtn.textContent = t('setupBoardAddClass');
            addClassBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (global.CCPCohortManagement && global.CCPCohortManagement.selectCohort) {
                    global.CCPCohortManagement.selectCohort(cohort.id);
                }
                showAddClassToCohortPicker(cohort);
            });
            headerActions.appendChild(addClassBtn);
        }
        header.appendChild(headerActions);

        box.appendChild(header);

        const body = document.createElement('div');
        body.className = 'setup-board-cohort-body';
        body.dataset.cohortId = cohort.id;

        const homeroomLine = document.createElement('p');
        homeroomLine.className = 'setup-board-cohort-homeroom';
        const hrName = homeroomDisplayName(cohort);
        homeroomLine.textContent = `${t('timetableHomeroomLabel')}: ${hrName || t('cohortsNoHomeroom')}`;
        body.appendChild(homeroomLine);

        const classes = getClassesInCohort(cohort.id);
        if (!classes.length) {
            const empty = document.createElement('p');
            empty.className = 'setup-board-cohort-empty section-hint';
            empty.textContent = t('setupBoardEmptyCohort');
            body.appendChild(empty);
        } else {
            const classesHeading = document.createElement('p');
            classesHeading.className = 'setup-board-cohort-classes-heading';
            classesHeading.textContent = t('setupBoardCohortClassesHeading');
            body.appendChild(classesHeading);

            const classList = document.createElement('ul');
            classList.className = 'setup-board-cohort-class-list';
            classes.forEach((cls) => {
                if (!cls || !cls.id) {
                    return;
                }
                try {
                    classList.appendChild(renderCohortClassSummaryRow(cls, cohort, appData));
                } catch (rowErr) {
                    console.error('CCPSetupBoard: class summary row failed', cls.id, rowErr);
                }
            });
            body.appendChild(classList);
        }

        body.appendChild(renderCohortWarningsList(cohort, appData));

        box.appendChild(body);

        header.style.cursor = 'pointer';
        header.addEventListener('click', (e) => {
            if (e.target.closest('button')) {
                return;
            }
            if (global.CCPCohortManagement && global.CCPCohortManagement.selectCohort) {
                global.CCPCohortManagement.selectCohort(cohort.id);
            }
        });

        return box;
    }

    function syncAllCohortLinksAndInferSchedules() {
        const appData = hooks.getAppData();
        if (!appData) {
            return 0;
        }
        if (hooks.syncClassCohortLinks) {
            (appData.cohorts || []).forEach((cohort) => {
                if (cohort && cohort.id) {
                    hooks.syncClassCohortLinks(cohort);
                }
            });
        }
        const api = getApi();
        if (api && api.inferBlankCohortSchedules) {
            return api.inferBlankCohortSchedules(appData);
        }
        return 0;
    }

    function ensureBoardDom(scope) {
        const cfg = scope || getScopeConfig();
        const panel = document.getElementById(cfg.panelId);
        const main = panel && panel.querySelector('.setup-board-main');
        if (!main) {
            return false;
        }
        let mwf = document.getElementById(cfg.mwfId);
        let tth = document.getElementById(cfg.tthId);
        if (!mwf || !tth) {
            if (!mwf) {
                mwf = document.createElement('div');
                mwf.id = cfg.mwfId;
                mwf.className = 'setup-board-canvas';
                mwf.dataset.boardCanvas = 'mwf';
                main.appendChild(mwf);
            }
            if (!tth) {
                tth = document.createElement('div');
                tth.id = cfg.tthId;
                tth.className = 'setup-board-canvas';
                tth.dataset.boardCanvas = 'tth';
                tth.hidden = true;
                main.appendChild(tth);
            }
        }
        return true;
    }

    function getBoardSearchQuery(scope) {
        const cfg = scope || getScopeConfig();
        return normalizeStr(document.getElementById(cfg.searchId)?.value).toLowerCase();
    }

    function cohortPassesBoardSearch(cohort, appData, query) {
        if (!query) {
            return true;
        }
        if (global.CCPCohortManagement && global.CCPCohortManagement.cohortMatchesSearchQuery) {
            return global.CCPCohortManagement.cohortMatchesSearchQuery(cohort, appData, query);
        }
        const hay = [cohort.name, cohort.grade, cohort.schedulePattern].join(' ').toLowerCase();
        return hay.includes(query);
    }

    function renderCohortCanvas(canvasId, viewKey) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            return;
        }
        canvas.innerHTML = '';
        const appData = hooks.getAppData();
        const searchQ = getBoardSearchQuery();
        const viewCohorts = (appData.cohorts || []).filter((c) => {
            if (!c || !c.id) {
                return false;
            }
            if (viewKey === 'all') {
                return true;
            }
            return getCohortBoardView(c) === viewKey;
        });
        const cohorts = viewCohorts.filter((c) => cohortPassesBoardSearch(c, appData, searchQ));
        if (!cohorts.length) {
            const empty = document.createElement('p');
            empty.className = 'module-empty-hint setup-board-view-empty';
            if (searchQ) {
                empty.textContent = t('lessonFilterSearchEmpty');
            } else if (viewKey === 'all') {
                empty.textContent = t('setupBoardEmptyAll');
            } else {
                empty.textContent = viewKey === 'tth' ? t('setupBoardEmptyTth') : t('setupBoardEmptyMwf');
            }
            canvas.appendChild(empty);
            return;
        }
        const grid = document.createElement('div');
        grid.className = 'setup-board-cohort-grid';
        let rendered = 0;
        cohorts.forEach((cohort) => {
            try {
                const node = renderCohortContainer(cohort, appData);
                if (node) {
                    grid.appendChild(node);
                    rendered += 1;
                }
            } catch (cohortErr) {
                console.error('CCPSetupBoard: cohort card failed', cohort.id, cohortErr);
            }
        });
        if (!rendered) {
            const fail = document.createElement('p');
            fail.className = 'module-empty-hint setup-board-view-empty';
            fail.textContent = t('setupBoardCohortRenderPartial');
            canvas.appendChild(fail);
        } else {
            canvas.appendChild(grid);
        }
    }

    function getBoardMain(scope) {
        const cfg = scope || getScopeConfig();
        const panel = document.getElementById(cfg.panelId);
        return panel ? panel.querySelector('.setup-board-main') : null;
    }

    function clearBoardRenderError(scope) {
        const main = getBoardMain(scope);
        const alert = main && main.querySelector('.setup-board-render-error');
        if (alert) {
            alert.remove();
        }
    }

    function showBoardRenderError(err, scope) {
        console.error('CCPSetupBoard.renderBoard failed:', err);
        const main = getBoardMain(scope);
        if (!main) {
            return;
        }
        let alert = main.querySelector('.setup-board-render-error');
        if (!alert) {
            alert = document.createElement('p');
            alert.className = 'module-list-empty setup-board-render-error';
            alert.setAttribute('role', 'alert');
            main.insertBefore(alert, main.firstChild);
        }
        alert.textContent = t('setupBoardRenderError');
    }

    function renderBoardForScope(panelId) {
        const scopeHooks = scopeHooksByPanel.get(panelId) || hooks;
        if (!scopeHooks) {
            return;
        }
        const prevHooks = hooks;
        hooks = scopeHooks;
        const scope = getScopeConfig(scopeHooks);
        let inferredCount = 0;
        let boardError = null;
        try {
            const appData = scopeHooks.getAppData();
            if (!appData) {
                return;
            }
            if (!ensureBoardDom(scope)) {
                showBoardRenderError(new Error('setup board DOM missing — hard refresh (Ctrl+F5)'), scope);
                return;
            }
            inferredCount = syncAllCohortLinksAndInferSchedules();
            if (appData.ui && appData.ui.cohortsBoardView) {
                boardView = normalizeBoardView(appData.ui.cohortsBoardView);
            }
            setActiveBoardView(boardView);
        } catch (err) {
            boardError = err;
            console.error('CCPSetupBoard.renderBoard (setup phase) failed:', err);
        }
        try {
            if (boardView === 'all') {
                renderCohortCanvas(scope.mwfId, 'all');
                const tthCanvas = document.getElementById(scope.tthId);
                if (tthCanvas) {
                    tthCanvas.innerHTML = '';
                }
            } else {
                renderCohortCanvas(scope.mwfId, 'mwf');
                renderCohortCanvas(scope.tthId, 'tth');
            }
        } catch (err) {
            boardError = boardError || err;
            console.error('CCPSetupBoard.renderBoard (cohort canvas) failed:', err);
        }
        if (boardError) {
            showBoardRenderError(boardError, scope);
        } else {
            clearBoardRenderError(scope);
            if (inferredCount > 0 && scopeHooks.saveData) {
                scopeHooks.saveData();
            }
        }
        hooks = prevHooks;
    }

    function renderBoard() {
        if (!hooks) {
            return;
        }
        const scope = getScopeConfig();
        renderBoardForScope(scope.panelId);
    }

    function isReady() {
        return !!hooks;
    }

    function scrollToCohort(cohortId) {
        const cohort = (hooks.getAppData().cohorts || []).find((c) => c.id === cohortId);
        if (!cohort) {
            return;
        }
        const active = getActiveBoardView();
        if (active !== 'all') {
            setActiveBoardView(getCohortBoardView(cohort));
        }
        const scope = getScopeConfig();
        const canvasKey = getActiveBoardView() === 'tth' ? scope.tthId : scope.mwfId;
        const canvas = document.getElementById(canvasKey);
        const el = canvas && canvas.querySelector(`[data-cohort-id="${cohortId}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            el.classList.add('is-highlighted');
            setTimeout(() => el.classList.remove('is-highlighted'), 2000);
        }
    }

    function bindScopeControls(scope) {
        const panel = document.getElementById(scope.panelId);
        if (!panel || panel.dataset.setupBoardBound === '1') {
            return;
        }
        panel.dataset.setupBoardBound = '1';
        const rerender = () => renderBoardForScope(scope.panelId);
        document.getElementById(scope.mwfBtnId)?.addEventListener('click', () => {
            setActiveBoardView('mwf');
            rerender();
        });
        document.getElementById(scope.tthBtnId)?.addEventListener('click', () => {
            setActiveBoardView('tth');
            rerender();
        });
        document.getElementById(scope.allBtnId)?.addEventListener('click', () => {
            setActiveBoardView('all');
            rerender();
        });
        document.getElementById(scope.searchId)?.addEventListener('input', rerender);
    }

    function initTab(tabHooks) {
        hooks = tabHooks;
        const scope = getScopeConfig(tabHooks);
        registerScope(scope);
        scopeHooksByPanel.set(scope.panelId, tabHooks);
        bindScopeControls(scope);
        ensureUiBoardView();
        document.body.dataset.setupBoardInitialized = '1';
        renderBoardForScope(scope.panelId);
    }

    function onCalendarDataChanged() {
        registeredScopes.forEach((scope) => renderBoardForScope(scope.panelId));
    }

    function migrateHomeroomHosts() {
        const appData = hooks && hooks.getAppData();
        if (!appData) {
            return;
        }
        (appData.cohorts || []).forEach((cohort) => {
            if (normalizeStr(cohort.homeroomHostClassId)) {
                return;
            }
            const hrUid = normalizeStr(cohort.homeroomTeacherUserId);
            const hrName = normalizeStr(cohort.homeroomTeacherName);
            if (!hrUid && !hrName) {
                return;
            }
            const classes = getClassesInCohort(cohort.id);
            const match = classes.find((cls) => {
                const rows = cls.classTeachers || [];
                return rows.some((row) => {
                    const uid = normalizeStr(row.userId || row.assignedTeacherUserId);
                    const name = normalizeStr(row.displayName || row.assignedTeacherName);
                    return (hrUid && uid === hrUid) || (hrName && name === hrName);
                });
            });
            if (match) {
                cohort.homeroomHostClassId = match.id;
            }
        });
    }

    global.CCPSetupBoard = {
        initTab,
        isReady,
        renderBoard,
        renderBoardForScope,
        onCalendarDataChanged,
        getCohortBoardView,
        getActiveBoardView,
        setActiveBoardView,
        getDefaultSchedulePatternForNewCohort,
        scrollToCohort,
        migrateHomeroomHosts
    };
})(typeof window !== 'undefined' ? window : globalThis);
