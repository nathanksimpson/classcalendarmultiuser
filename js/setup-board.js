/**
 * Visual cohort setup board — drag classes into cohorts, teachers onto classes, homeroom host.
 */
(function (global) {
    let hooks = null;
    let boardView = 'mwf';
    let dragPayload = null;

    const PATTERN_IDS = ['mwf', 'tth', 'mw', 'wf', 'mf', 'custom'];
    const COHORT_DOW = { en: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], ko: ['', '월', '화', '수', '목', '금'] };
    const MWF_SET = new Set([1, 3, 5]);
    const TTH_SET = new Set([2, 4]);

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function t(key) {
        return hooks && hooks.t ? hooks.t(key) : key;
    }

    function escapeHtml(s) {
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

    function setCohortPattern(cohort, patternId) {
        const matrix = getMatrixApi();
        cohort.schedulePattern = patternId;
        if (patternId !== 'custom' && matrix) {
            const pat = matrix.getPatterns()[patternId];
            if (pat && Array.isArray(pat.meetingDays)) {
                cohort.meetingDays = pat.meetingDays.slice();
            }
        }
        if (global.CCPCohortManagement && global.CCPCohortManagement.buildSubjectSlotsFromMatrix) {
            try {
                cohort.subjectSlots = global.CCPCohortManagement.buildSubjectSlotsFromMatrix(cohort) || [];
            } catch (slotErr) {
                console.warn('CCPSetupBoard: subject slots skipped', slotErr);
            }
        }
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

    function getClassMeetingDaysArray(classData) {
        if (hooks && hooks.getMeetingDaysFromClass) {
            return hooks.getMeetingDaysFromClass(classData).slice();
        }
        const raw = classData && classData.meetingDays;
        return Array.isArray(raw) ? raw.filter((d) => d >= 1 && d <= 5) : [];
    }

    /** True only when class meets on a weekday outside this cohort's schedule (subset days are OK). */
    function classDaysOutsideCohort(classData, cohort) {
        const classDays = getClassMeetingDaysArray(classData);
        const cohortDays = getCohortMeetingDays(cohort);
        if (!classDays.length || !cohortDays.length) {
            return false;
        }
        const cohortSet = new Set(cohortDays);
        return classDays.some((d) => !cohortSet.has(d));
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

    function setActiveBoardView(view) {
        boardView = normalizeBoardView(view);
        ensureUiBoardView();
        persistBoardView();
        syncViewSwitcherUi();
        const mwf = document.getElementById('setupBoardViewMwf');
        const tth = document.getElementById('setupBoardViewTth');
        if (mwf) {
            mwf.hidden = boardView === 'tth';
        }
        if (tth) {
            tth.hidden = boardView !== 'tth';
        }
    }

    function syncViewSwitcherUi() {
        const mwfBtn = document.getElementById('setupBoardViewBtnMwf');
        const tthBtn = document.getElementById('setupBoardViewBtnTth');
        const allBtn = document.getElementById('setupBoardViewBtnAll');
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
        if (api) {
            return api.getClassCohortIds(classData);
        }
        const ids = [];
        if (Array.isArray(classData.cohortIds)) {
            classData.cohortIds.forEach((id) => {
                const cid = normalizeStr(id);
                if (cid) {
                    ids.push(cid);
                }
            });
        }
        const legacy = normalizeStr(classData.cohortId);
        if (legacy && !ids.includes(legacy)) {
            ids.push(legacy);
        }
        return ids;
    }

    function isClassUnassigned(classData) {
        return getClassCohortIdsForBoard(classData).length === 0;
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

    function cohortNamesForClass(classData) {
        const appData = hooks.getAppData();
        return getClassCohortIdsForBoard(classData).map((id) => {
            const cohort = (appData.cohorts || []).find((c) => c.id === id);
            return cohort ? (cohort.name || id) : id;
        });
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

    function firstTeacherOnClass(classData) {
        const rows = getTeachersOnClass(classData);
        if (!rows.length) {
            return null;
        }
        const row = rows[0];
        const userId = normalizeStr(row.userId || row.assignedTeacherUserId);
        const displayName = teacherRowLabel(row);
        if (!userId && !displayName) {
            return null;
        }
        return { userId, displayName };
    }

    function classHasHomeroomTeacher(classData) {
        return !!firstTeacherOnClass(classData);
    }

    function stopCohortCardEventBubble(el) {
        if (!el) {
            return;
        }
        el.addEventListener('click', (e) => e.stopPropagation());
    }

    function applyHomeroomFromHostClass(cohort, classData) {
        const api = getApi();
        const teacher = firstTeacherOnClass(classData);
        if (!teacher || (!teacher.userId && !teacher.displayName)) {
            cohort.homeroomHostClassId = '';
            if (api) {
                api.clearCohortHomeroom(cohort);
            } else {
                cohort.homeroomTeacherUserId = '';
                cohort.homeroomTeacherName = '';
            }
            return;
        }
        cohort.homeroomHostClassId = classData.id;
        if (api) {
            api.setCohortHomeroom(cohort, teacher);
        } else {
            cohort.homeroomTeacherUserId = teacher.userId;
            cohort.homeroomTeacherName = teacher.displayName;
        }
    }

    function setHomeroomHost(cohort, classData, checked) {
        if (checked) {
            if (!classHasHomeroomTeacher(classData)) {
                hooks.showMessage(t('setupBoardAssignTeacherFirst'), true);
                return;
            }
            cohort.homeroomHostClassId = classData.id;
            applyHomeroomFromHostClass(cohort, classData);
        } else {
            if (normalizeStr(cohort.homeroomHostClassId) === classData.id) {
                cohort.homeroomHostClassId = '';
                const api = getApi();
                if (api) {
                    api.clearCohortHomeroom(cohort);
                } else {
                    cohort.homeroomTeacherUserId = '';
                    cohort.homeroomTeacherName = '';
                }
            }
        }
        persistAndRefresh();
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

    /**
     * Assign or move a class onto a cohort (rearrange). From pool + already linked → move to this cohort only.
     * From another cohort → move from that cohort. Already on this cohort → no-op.
     */
    function assignClassToCohort(classData, cohort, payload) {
        if (!classData || !cohort) {
            return;
        }
        const targetId = cohort.id;
        const existing = getClassCohortIdsForBoard(classData);
        const fromId = payload && payload.fromCohortId ? payload.fromCohortId : '';
        const fromPool = !!(payload && payload.fromPool);

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
        if (fromPool && existing.length) {
            existing.forEach((id) => toRemove.add(id));
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

    function assignTeacherToClass(classData, selector) {
        const api = getApi();
        const appData = hooks.getAppData();
        if (!selector) {
            return;
        }
        if (!api) {
            hooks.showMessage(t('setupBoardTeachersApiMissing'), true);
            return;
        }
        const added = api.addTeacherRowToClass(classData, selector, {
            appData,
            category: '',
            generateId: hooks.generateId
        });
        if (!added) {
            hooks.showMessage(t('setupBoardTeacherAlreadyAssigned'), false);
            return;
        }
        const cohorts = (appData.cohorts || []).filter((coh) =>
            normalizeStr(coh.homeroomHostClassId) === classData.id
        );
        cohorts.forEach((coh) => applyHomeroomFromHostClass(coh, classData));
        persistAndRefresh();
    }

    function removeTeacherFromClass(classData, selector) {
        const api = getApi();
        if (!api) {
            return;
        }
        api.removeTeacherFromClass(classData, selector);
        const appData = hooks.getAppData();
        (appData.cohorts || []).forEach((coh) => {
            if (normalizeStr(coh.homeroomHostClassId) === classData.id) {
                applyHomeroomFromHostClass(coh, classData);
            }
        });
        persistAndRefresh();
    }

    function isReadOnly() {
        return hooks.isViewOnly && hooks.isViewOnly();
    }

    function setupDragSource(el, payload) {
        if (isReadOnly()) {
            el.draggable = false;
            return;
        }
        el.draggable = true;
        el.addEventListener('dragstart', (e) => {
            dragPayload = payload;
            el.classList.add('is-dragging');
            try {
                e.dataTransfer.setData('application/x-ccp-setup', JSON.stringify(payload));
                e.dataTransfer.effectAllowed = 'move';
            } catch (_) {
                /* ignore */
            }
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('is-dragging');
            dragPayload = null;
            document.querySelectorAll('.is-drag-over').forEach((n) => n.classList.remove('is-drag-over'));
        });
    }

    function setupDropZone(el, onDrop) {
        if (isReadOnly()) {
            return;
        }
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            el.classList.add('is-drag-over');
        });
        el.addEventListener('dragleave', () => {
            el.classList.remove('is-drag-over');
        });
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.classList.remove('is-drag-over');
            let payload = dragPayload;
            try {
                const raw = e.dataTransfer.getData('application/x-ccp-setup');
                if (raw) {
                    payload = JSON.parse(raw);
                }
            } catch (_) {
                /* use dragPayload */
            }
            if (payload) {
                onDrop(payload);
            }
        });
    }

    function renderClassCard(classData, cohort) {
        const card = document.createElement('article');
        card.className = 'setup-board-class-card';
        card.dataset.classId = classData.id;

        const head = document.createElement('div');
        head.className = 'setup-board-class-card-head';
        const dragHandle = document.createElement('button');
        dragHandle.type = 'button';
        dragHandle.className = 'setup-board-card-drag-handle';
        dragHandle.textContent = '⠿';
        dragHandle.setAttribute('aria-label', t('setupBoardDragClass') || 'Drag class');
        dragHandle.title = t('setupBoardDragClass') || 'Drag to move class';
        stopCohortCardEventBubble(dragHandle);
        const title = document.createElement('strong');
        title.className = 'setup-board-class-card-title';
        let cardTitle = classData.name || '';
        if (!cardTitle && hooks.formatClassLabel) {
            try {
                cardTitle = hooks.formatClassLabel(classData) || '';
            } catch (_) {
                cardTitle = classData.id || '';
            }
        }
        title.textContent = cardTitle || classData.id || '?';
        head.appendChild(dragHandle);
        head.appendChild(title);

        const menuBtn = document.createElement('button');
        menuBtn.type = 'button';
        menuBtn.className = 'btn btn-outline btn-small setup-board-class-menu-btn';
        menuBtn.textContent = '⋯';
        menuBtn.setAttribute('aria-label', t('setupBoardClassMenu'));
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = global.prompt(
                t('setupBoardClassMenuPrompt'),
                '1=' + t('setupBoardOpenClass') + ', 2=' + t('setupBoardRemoveFromCohort')
            );
            if (action === '1' || action === '1.') {
                hooks.navigateToTab('classes', { classId: classData.id, host: 'setup' });
            } else if (action === '2' || action === '2.') {
                unlinkClassFromCohort(classData, cohort.id);
            }
        });
        head.appendChild(menuBtn);
        card.appendChild(head);

        const meta = document.createElement('p');
        meta.className = 'setup-board-class-card-meta section-hint';
        const metaParts = [];
        if (hooks.getClassCatalogCategory) {
            const cat = hooks.getClassCatalogCategory(classData);
            if (cat) {
                metaParts.push(cat);
            }
        }
        if (hooks.getClassLevelDisplay) {
            const lv = hooks.getClassLevelDisplay(classData);
            if (lv) {
                metaParts.push(lv);
            }
        }
        meta.textContent = metaParts.join(' · ');
        if (meta.textContent) {
            card.appendChild(meta);
        }

        const daysMount = document.createElement('div');
        daysMount.className = 'setup-board-class-days';
        const mdc = global.CCPMeetingDaysControl;
        const classDays = hooks.getMeetingDaysFromClass
            ? hooks.getMeetingDaysFromClass(classData)
            : (classData.meetingDays || []);
        if (mdc) {
            mdc.renderCompactMeetingDays(daysMount, {
                days: classDays,
                t,
                readOnly: isReadOnly(),
                onChange: (days) => {
                    classData.meetingDays = days.slice();
                    if (classData.dayOfWeek != null && days.length === 1) {
                        classData.dayOfWeek = days[0];
                    }
                    persistAndRefresh();
                }
            });
        }
        card.appendChild(daysMount);

        if (classDaysOutsideCohort(classData, cohort)) {
            const hint = document.createElement('p');
            hint.className = 'setup-board-class-days-outside section-hint';
            hint.textContent = t('setupBoardClassDaysOutside');
            card.appendChild(hint);
        }

        const teachersLabel = document.createElement('p');
        teachersLabel.className = 'setup-board-teacher-drop-label';
        teachersLabel.textContent = t('setupBoardTeacherDropLabel');
        card.appendChild(teachersLabel);

        const teachersWrap = document.createElement('div');
        teachersWrap.className = 'setup-board-class-teachers setup-board-teacher-drop-zone';
        teachersWrap.dataset.dropZone = 'class-teachers';
        setupDropZone(teachersWrap, (payload) => {
            if (payload.type === 'teacher') {
                assignTeacherToClass(classData, payload.selector);
            }
        });

        const teacherRows = getTeachersOnClass(classData);
        teacherRows.forEach((row) => {
            const sel = {
                userId: normalizeStr(row.userId || row.assignedTeacherUserId),
                displayName: teacherRowLabel(row)
            };
            const chip = document.createElement('span');
            chip.className = 'setup-board-teacher-chip';
            chip.textContent = sel.displayName || sel.userId || '?';
            if (!isReadOnly()) {
                const rm = document.createElement('button');
                rm.type = 'button';
                rm.className = 'setup-board-teacher-chip-remove';
                rm.textContent = '×';
                rm.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeTeacherFromClass(classData, sel);
                });
                chip.appendChild(rm);
            }
            teachersWrap.appendChild(chip);
        });
        if (!teacherRows.length) {
            const empty = document.createElement('span');
            empty.className = 'setup-board-class-teachers-empty';
            empty.textContent = t('setupBoardDropTeacherHere');
            teachersWrap.appendChild(empty);
        }
        card.appendChild(teachersWrap);

        const hostWrap = document.createElement('div');
        hostWrap.className = 'setup-board-homeroom-host-wrap';
        const hostLabel = document.createElement('label');
        hostLabel.className = 'setup-board-homeroom-host checkbox-label';
        const hostCb = document.createElement('input');
        hostCb.type = 'checkbox';
        hostCb.className = 'setup-board-homeroom-host-cb';
        const isHost = normalizeStr(cohort.homeroomHostClassId) === classData.id;
        hostCb.checked = isHost;
        const canHost = classHasHomeroomTeacher(classData);
        hostCb.disabled = isReadOnly() || !canHost;
        hostCb.title = hostCb.disabled && !isReadOnly()
            ? t('setupBoardAssignTeacherFirst')
            : t('setupBoardHomeroomHostHint');
        const onHostToggle = () => {
            const wantChecked = hostCb.checked;
            if (wantChecked) {
                setHomeroomHost(cohort, classData, true);
            } else {
                setHomeroomHost(cohort, classData, false);
            }
            if (wantChecked && normalizeStr(cohort.homeroomHostClassId) !== classData.id) {
                hostCb.checked = false;
            }
        };
        hostCb.addEventListener('change', onHostToggle);
        const hostSpan = document.createElement('span');
        hostSpan.textContent = t('setupBoardHomeroomHost');
        hostLabel.appendChild(hostCb);
        hostLabel.appendChild(hostSpan);
        hostWrap.appendChild(hostLabel);
        stopCohortCardEventBubble(hostWrap);
        card.appendChild(hostWrap);

        stopCohortCardEventBubble(teachersWrap);
        stopCohortCardEventBubble(daysMount);

        setupDragSource(dragHandle, {
            type: 'class',
            classId: classData.id,
            fromCohortId: cohort.id,
            fromPool: false
        });

        return card;
    }

    function renderCohortScheduleHeader(cohort, headerEl) {
        const wrap = document.createElement('div');
        wrap.className = 'setup-board-cohort-schedule';

        const mwfBtn = document.createElement('button');
        mwfBtn.type = 'button';
        mwfBtn.className = 'btn btn-outline btn-small setup-board-pattern-btn';
        mwfBtn.textContent = t('setupBoardPatternMwf');
        mwfBtn.classList.toggle('is-active', cohort.schedulePattern === 'mwf' || getCohortBoardView(cohort) === 'mwf' && cohort.schedulePattern !== 'tth');

        const tthBtn = document.createElement('button');
        tthBtn.type = 'button';
        tthBtn.className = 'btn btn-outline btn-small setup-board-pattern-btn';
        tthBtn.textContent = t('setupBoardPatternTth');
        tthBtn.classList.toggle('is-active', cohort.schedulePattern === 'tth');

        const applyPattern = (pid) => {
            if (isReadOnly()) {
                return;
            }
            setCohortPattern(cohort, pid);
            const active = getActiveBoardView();
            if (active !== 'all') {
                const newView = getCohortBoardView(cohort);
                if (newView !== active) {
                    setActiveBoardView(newView);
                }
            }
            persistAndRefresh();
        };

        mwfBtn.addEventListener('click', () => applyPattern('mwf'));
        tthBtn.addEventListener('click', () => applyPattern('tth'));

        wrap.appendChild(mwfBtn);
        wrap.appendChild(tthBtn);

        const patStr = normalizeStr(cohort.schedulePattern);
        if (patStr === 'custom' || (getCohortBoardView(cohort) === 'mwf' && patStr !== 'mwf' && patStr !== 'tth')) {
            const badge = document.createElement('span');
            badge.className = 'setup-board-custom-days-badge';
            const lang = hooks.getLang ? hooks.getLang() : 'en';
            const labels = COHORT_DOW[lang] || COHORT_DOW.en;
            badge.textContent = getCohortMeetingDays(cohort)
                .map((d) => labels[d] || d)
                .join(' ') || t('cohortsPatternCustom');
            wrap.appendChild(badge);
        }

        headerEl.appendChild(wrap);
    }

    function renderCohortContainer(cohort, appData) {
        if (!cohort || !cohort.id) {
            return document.createDocumentFragment();
        }
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
        const title = document.createElement('h3');
        title.className = 'setup-board-cohort-title';
        title.textContent = cohort.name || t('timetableAddCohort');
        titleRow.appendChild(title);

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

        renderCohortScheduleHeader(cohort, header);
        box.appendChild(header);

        const body = document.createElement('div');
        body.className = 'setup-board-cohort-body';
        body.dataset.dropZone = 'cohort';
        body.dataset.cohortId = cohort.id;

        setupDropZone(body, (payload) => {
            if (payload.type !== 'class') {
                return;
            }
            const cls = (appData.classes || []).find((c) => c.id === payload.classId);
            if (!cls) {
                return;
            }
            assignClassToCohort(cls, cohort, payload);
        });

        const classes = getClassesInCohort(cohort.id);
        if (!classes.length) {
            const empty = document.createElement('p');
            empty.className = 'setup-board-cohort-empty section-hint';
            empty.textContent = t('setupBoardEmptyCohort');
            body.appendChild(empty);
        } else {
            classes.forEach((cls) => {
                if (!cls || !cls.id) {
                    return;
                }
                try {
                    body.appendChild(renderClassCard(cls, cohort));
                } catch (cardErr) {
                    console.error('CCPSetupBoard: class card failed', cls.id, cardErr);
                }
            });
        }

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

    function renderPoolClassCard(classData) {
        const card = document.createElement('article');
        const linkedIds = getClassCohortIdsForBoard(classData);
        const unassigned = linkedIds.length === 0;
        card.className = 'setup-board-pool-card' + (unassigned ? '' : ' setup-board-pool-card--linked');
        card.dataset.classId = classData.id;
        const label = document.createElement('span');
        label.className = 'setup-board-pool-card-label';
        label.textContent = classData.name || (hooks.formatClassLabel ? hooks.formatClassLabel(classData) : classData.id);
        card.appendChild(label);
        if (!unassigned) {
            const sub = document.createElement('span');
            sub.className = 'setup-board-pool-card-linked section-hint';
            sub.textContent = cohortNamesForClass(classData).join(', ');
            card.appendChild(sub);
        }
        setupDragSource(card, {
            type: 'class',
            classId: classData.id,
            fromCohortId: linkedIds[0] || '',
            fromPool: true
        });
        if (!isReadOnly()) {
            card.addEventListener('dblclick', () => {
                hooks.navigateToTab('classes', { classId: classData.id, host: 'setup' });
            });
        }
        return card;
    }

    function syncAllCohortClassLinks() {
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

    function ensureBoardDom() {
        const main = document.querySelector('.setup-board-main');
        if (!main) {
            return false;
        }
        if (!document.getElementById('setupBoardPool')) {
            return false;
        }
        let mwf = document.getElementById('setupBoardViewMwf');
        let tth = document.getElementById('setupBoardViewTth');
        if (!mwf || !tth) {
            if (!mwf) {
                mwf = document.createElement('div');
                mwf.id = 'setupBoardViewMwf';
                mwf.className = 'setup-board-canvas';
                mwf.dataset.boardCanvas = 'mwf';
                main.appendChild(mwf);
            }
            if (!tth) {
                tth = document.createElement('div');
                tth.id = 'setupBoardViewTth';
                tth.className = 'setup-board-canvas';
                tth.dataset.boardCanvas = 'tth';
                tth.hidden = true;
                main.appendChild(tth);
            }
        }
        return true;
    }

    function renderPool() {
        const pool = document.getElementById('setupBoardPool');
        if (!pool) {
            return;
        }
        pool.innerHTML = '';
        const appData = hooks.getAppData();
        const classes = (appData.classes || []).slice();
        if (!classes.length) {
            pool.innerHTML = `<p class="module-list-empty">${escapeHtml(t('setupBoardPoolNoClasses'))}</p>`;
            return;
        }
        classes.sort((a, b) => {
            const au = isClassUnassigned(a) ? 0 : 1;
            const bu = isClassUnassigned(b) ? 0 : 1;
            if (au !== bu) {
                return au - bu;
            }
            return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
        });
        classes.forEach((cls) => {
            pool.appendChild(renderPoolClassCard(cls));
        });
        setupDropZone(pool, (payload) => {
            if (payload.type === 'class' && payload.fromCohortId) {
                const cls = (appData.classes || []).find((c) => c.id === payload.classId);
                if (cls) {
                    unlinkClassFromCohort(cls, payload.fromCohortId);
                }
            }
        });
    }

    function renderCohortCanvas(canvasId, viewKey) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            return;
        }
        canvas.innerHTML = '';
        const appData = hooks.getAppData();
        const cohorts = (appData.cohorts || []).filter((c) => {
            if (!c || !c.id) {
                return false;
            }
            if (viewKey === 'all') {
                return true;
            }
            return getCohortBoardView(c) === viewKey;
        });
        if (!cohorts.length) {
            const empty = document.createElement('p');
            empty.className = 'module-empty-hint setup-board-view-empty';
            if (viewKey === 'all') {
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

    function renderTeacherPalette() {
        const mount = document.getElementById('setupBoardTeacherPalette');
        if (!mount) {
            return;
        }
        const q = normalizeStr(document.getElementById('setupBoardTeacherSearch')?.value).toLowerCase();
        mount.innerHTML = '';
        const teachers = hooks.listTeachers ? hooks.listTeachers() : [];
        const filtered = teachers.filter((row) => {
            if (!q) {
                return true;
            }
            const hay = [row.displayName, row.userId, row.email].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
        if (!filtered.length) {
            mount.innerHTML = `<p class="module-list-empty">${escapeHtml(t('timetableTeachersListEmpty'))}</p>`;
            return;
        }
        filtered.forEach((row) => {
            const chip = document.createElement('div');
            chip.className = 'setup-board-palette-teacher';
            chip.textContent = hooks.formatTeacherLabel
                ? hooks.formatTeacherLabel(row)
                : (row.displayName || row.userId);
            setupDragSource(chip, {
                type: 'teacher',
                selector: { userId: row.userId, displayName: row.displayName }
            });
            mount.appendChild(chip);
        });
    }

    function clearBoardRenderError() {
        const main = document.querySelector('.setup-board-main');
        const alert = main && main.querySelector('.setup-board-render-error');
        if (alert) {
            alert.remove();
        }
    }

    function showBoardRenderError(err) {
        console.error('CCPSetupBoard.renderBoard failed:', err);
        const main = document.querySelector('.setup-board-main');
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

    function renderBoard() {
        if (!hooks) {
            return;
        }
        let inferredCount = 0;
        let boardError = null;
        try {
            const appData = hooks.getAppData();
            if (!appData) {
                return;
            }
            if (!ensureBoardDom()) {
                showBoardRenderError(new Error('setup board DOM missing — hard refresh (Ctrl+F5)'));
                return;
            }
            inferredCount = syncAllCohortClassLinks();
            if (appData.ui && appData.ui.cohortsBoardView) {
                boardView = normalizeBoardView(appData.ui.cohortsBoardView);
            }
            setActiveBoardView(boardView);
            renderPool();
        } catch (err) {
            boardError = err;
            console.error('CCPSetupBoard.renderBoard (setup phase) failed:', err);
        }
        try {
            if (boardView === 'all') {
                renderCohortCanvas('setupBoardViewMwf', 'all');
                const tthCanvas = document.getElementById('setupBoardViewTth');
                if (tthCanvas) {
                    tthCanvas.innerHTML = '';
                }
            } else {
                renderCohortCanvas('setupBoardViewMwf', 'mwf');
                renderCohortCanvas('setupBoardViewTth', 'tth');
            }
        } catch (err) {
            boardError = boardError || err;
            console.error('CCPSetupBoard.renderBoard (cohort canvas) failed:', err);
        }
        try {
            renderTeacherPalette();
        } catch (err) {
            boardError = boardError || err;
            console.error('CCPSetupBoard.renderBoard (teachers) failed:', err);
        }
        if (boardError) {
            showBoardRenderError(boardError);
        } else {
            clearBoardRenderError();
            if (inferredCount > 0 && hooks.saveData) {
                hooks.saveData();
            }
        }
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
        const canvasKey = getActiveBoardView() === 'tth' ? 'setupBoardViewTth' : 'setupBoardViewMwf';
        const canvas = document.getElementById(canvasKey);
        const el = canvas && canvas.querySelector(`[data-cohort-id="${cohortId}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            el.classList.add('is-highlighted');
            setTimeout(() => el.classList.remove('is-highlighted'), 2000);
        }
    }

    function bindOnce() {
        if (document.body.dataset.setupBoardBound === '1') {
            return;
        }
        document.body.dataset.setupBoardBound = '1';

        document.getElementById('setupBoardViewBtnMwf')?.addEventListener('click', () => {
            setActiveBoardView('mwf');
            renderBoard();
        });
        document.getElementById('setupBoardViewBtnTth')?.addEventListener('click', () => {
            setActiveBoardView('tth');
            renderBoard();
        });
        document.getElementById('setupBoardViewBtnAll')?.addEventListener('click', () => {
            setActiveBoardView('all');
            renderBoard();
        });
        document.getElementById('setupBoardTeacherSearch')?.addEventListener('input', () => renderTeacherPalette());
    }

    function initTab(tabHooks) {
        hooks = tabHooks;
        bindOnce();
        ensureUiBoardView();
        document.body.dataset.setupBoardInitialized = '1';
        renderBoard();
    }

    function onCalendarDataChanged() {
        renderBoard();
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
        onCalendarDataChanged,
        getCohortBoardView,
        getActiveBoardView,
        setActiveBoardView,
        getDefaultSchedulePatternForNewCohort,
        scrollToCohort,
        migrateHomeroomHosts
    };
})(typeof window !== 'undefined' ? window : globalThis);
