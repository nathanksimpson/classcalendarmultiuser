/**
 * Shared Classroom zone class bar — searchable picker + quick toggles.
 */
(function (global) {
    const CLASS_SCOPED_TABS = new Set([
        'attendance',
        'ledger',
        'homework-tracking',
        'points',
        'tests',
        'debate-teams'
    ]);

    let hooks = null;
    let activeTabId = '';
    let classSearchQuery = '';
    let comboboxOpen = false;
    let comboboxHighlight = -1;
    let outsideBound = false;
    let mountEventsBound = false;
    let contextSubscribed = false;

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
        return hooks && hooks.getAppData ? hooks.getAppData() : global.appData || {};
    }

    function access() {
        return global.CCPClassroomAccess;
    }

    function domain() {
        return global.CCPClassroomDomain;
    }

    function getFilterDeps() {
        return {
            classIsMine:
                hooks && hooks.classIsMine
                    ? (c, userId) => hooks.classIsMine(c, userId)
                    : undefined
        };
    }

    function getFilterCtx() {
        const data = getAppData();
        return {
            domain: domain(),
            currentUserId: hooks && hooks.getCurrentUserId ? hooks.getCurrentUserId() : '',
            deps: getFilterDeps()
        };
    }

    function getUiToggles() {
        const ui = getAppData().ui || {};
        const essaysPref = ui.classroomZoneEssaysOnly;
        let essaysOnly = essaysPref === true || essaysPref === '1';
        if (
            activeTabId === 'essays' &&
            essaysPref !== true &&
            essaysPref !== '1' &&
            essaysPref !== false &&
            essaysPref !== '0'
        ) {
            essaysOnly = true;
        }
        return {
            myClassesOnly: ui.classroomZoneMyClassesOnly === true || ui.classroomZoneMyClassesOnly === '1',
            essaysOnly
        };
    }

    function getBaseAccessibleClasses() {
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

    function getVisibleClasses() {
        const base = getBaseAccessibleClasses();
        const toggles = getUiToggles();
        const opts = { myClassesOnly: toggles.myClassesOnly };
        if (activeTabId === 'essays') {
            opts.essaysOnly = toggles.essaysOnly;
        }
        const api = global.CCPEssayClassFilter;
        if (!api || !api.filterClassesForZoneContext) {
            return base;
        }
        return api.filterClassesForZoneContext(base, opts, getFilterCtx());
    }

    function getActiveClassId() {
        if (typeof global.CCPActiveContext !== 'undefined') {
            return global.CCPActiveContext.getActiveClassId() || '';
        }
        const ui = getAppData().ui || {};
        return ui.classroomTabClassId || '';
    }

    function getSessionDate() {
        if (typeof global.CCPActiveContext !== 'undefined') {
            const ctx = global.CCPActiveContext.get();
            return ctx.sessionDate || '';
        }
        const ui = getAppData().ui || {};
        return ui.classroomTabDate || '';
    }

    function setSessionDate(dateStr) {
        const val = dateStr == null ? '' : String(dateStr).trim();
        if (typeof global.CCPActiveContext !== 'undefined') {
            global.CCPActiveContext.set({ sessionDate: val }, { source: 'classroom-zone-context' });
            return;
        }
        if (hooks && hooks.setUiPref) {
            hooks.setUiPref('classroomTabDate', val);
        }
    }

    function todayISO() {
        const d = domain();
        if (d && d.todayISO) {
            return d.todayISO();
        }
        return new Date().toISOString().slice(0, 10);
    }

    function setActiveClassId(classId) {
        if (hooks && hooks.setUiPref) {
            hooks.setUiPref('classroomTabClassId', classId);
        } else if (typeof global.CCPActiveContext !== 'undefined') {
            global.CCPActiveContext.set({ classId }, { source: 'zone-context-bar' });
        }
    }

    function getEssayClassDisplayLabel(classData) {
        if (!classData) {
            return '';
        }
        let label = classData.name || classData.id || '';
        if (domain()) {
            const data = getAppData();
            const counts = domain().essayAlertCountsForClass(
                data.essaySubmissions,
                classData,
                data.cohorts || []
            );
            label += domain().formatEssayClassAlertSuffix(counts);
        }
        return label;
    }

    function getClassDisplayLabel(classData) {
        if (!classData) {
            return '';
        }
        let label = classData.name || classData.id || '';
        if (activeTabId === 'essays') {
            return getEssayClassDisplayLabel(classData);
        }
        return label;
    }

    function classSearchHaystack(classData) {
        if (!classData) {
            return '';
        }
        const teachers = (classData.classTeachers || [])
            .filter((row) => row && (row.name || row.userId))
            .map((row) => row.name || row.userId)
            .join(', ');
        return [
            classData.name,
            classData.id,
            classData.grade,
            classData.levelPreset,
            classData.levelCustom,
            classData.subject,
            teachers
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
    }

    function filterClassesForSearch(classes, query, selectedClassId) {
        const header = global.CCPClassroomHeader;
        if (header && header.filterClassesForSearch) {
            return header.filterClassesForSearch(classes, query, selectedClassId);
        }
        const q = (query || '').trim().toLowerCase();
        let filtered = classes;
        if (q) {
            filtered = classes.filter((c) => classSearchHaystack(c).includes(q));
        }
        if (selectedClassId && !filtered.some((c) => c.id === selectedClassId)) {
            const selected = classes.find((c) => c.id === selectedClassId);
            if (selected) {
                filtered = [selected, ...filtered];
            }
        }
        return filtered;
    }

    function buildComboboxListHtml(state) {
        const s = state || {};
        const classes = Array.isArray(s.classes) ? s.classes : [];
        const filtered = filterClassesForSearch(classes, s.classSearchQuery, s.classId);
        if (!filtered.length) {
            return `<p class="classroom-zone-combobox-empty section-hint">${escapeHtml(t('classroomEssayClassComboboxEmpty'))}</p>`;
        }
        return filtered
            .map((c, index) => {
                const selected = c.id === s.classId ? ' is-selected' : '';
                const highlighted = index === comboboxHighlight ? ' is-highlighted' : '';
                const label = getClassDisplayLabel(c);
                return `<button type="button" class="module-list-item classroom-zone-combobox-item${selected}${highlighted}" role="option" data-class-id="${escapeAttr(c.id)}" aria-selected="${c.id === s.classId ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
            })
            .join('');
    }

    function getSelectedClassName(state) {
        const s = state || {};
        const classes = Array.isArray(s.classes) ? s.classes : [];
        const selected = classes.find((c) => c && c.id === s.classId);
        return selected ? getClassDisplayLabel(selected) : '';
    }

    function getMountEl() {
        return document.getElementById('classroomZoneContextBar');
    }

    function getComboboxState() {
        return {
            classId: getActiveClassId(),
            classes: getVisibleClasses(),
            classSearchQuery
        };
    }

    function updateComboboxListDom(mountEl, state, options) {
        const list = mountEl && mountEl.querySelector('#classroomZoneClassList');
        if (!list) {
            return;
        }
        list.innerHTML = buildComboboxListHtml(state);
        const highlighted = list.querySelector('.classroom-zone-combobox-item.is-highlighted');
        if (highlighted && typeof highlighted.scrollIntoView === 'function') {
            highlighted.scrollIntoView({ block: 'nearest' });
        }
    }

    function syncComboboxOpenUi(mountEl, state, options) {
        const wrap = mountEl && mountEl.querySelector('.classroom-zone-class-combobox');
        const list = mountEl && mountEl.querySelector('#classroomZoneClassList');
        const input = mountEl && mountEl.querySelector('#classroomZoneClassInput');
        if (wrap) {
            wrap.classList.toggle('is-open', comboboxOpen);
        }
        if (list) {
            list.hidden = !comboboxOpen;
        }
        if (input) {
            input.setAttribute('aria-expanded', comboboxOpen ? 'true' : 'false');
            input.value = comboboxOpen ? classSearchQuery : getSelectedClassName(state);
        }
        if (comboboxOpen) {
            updateComboboxListDom(mountEl, state, options);
        }
    }

    function selectClassId(classId, mountEl) {
        if (!classId || !mountEl) {
            return;
        }
        setActiveClassId(classId);
        classSearchQuery = '';
        comboboxOpen = false;
        comboboxHighlight = -1;
        const input = mountEl.querySelector('#classroomZoneClassInput');
        if (input) {
            input.blur();
        }
        render(mountEl);
    }

    function bindMountEventsOnce() {
        const mountEl = getMountEl();
        if (!mountEl || mountEventsBound) {
            return;
        }
        mountEventsBound = true;

        mountEl.addEventListener('focusin', (e) => {
            if (e.target.id !== 'classroomZoneClassInput') {
                return;
            }
            comboboxOpen = true;
            if (comboboxHighlight < 0) {
                comboboxHighlight = -1;
            }
            syncComboboxOpenUi(mountEl, getComboboxState(), {});
            e.target.select();
        });

        mountEl.addEventListener('input', (e) => {
            if (e.target.id !== 'classroomZoneClassInput') {
                return;
            }
            classSearchQuery = e.target.value;
            comboboxHighlight = -1;
            comboboxOpen = true;
            syncComboboxOpenUi(mountEl, getComboboxState(), {});
        });

        mountEl.addEventListener('keydown', (e) => {
            if (e.target.id !== 'classroomZoneClassInput') {
                return;
            }
            const list = mountEl.querySelector('#classroomZoneClassList');
            const items = list ? Array.from(list.querySelectorAll('[data-class-id]')) : [];
            const state = getComboboxState();

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!items.length) {
                    return;
                }
                if (!comboboxOpen) {
                    comboboxOpen = true;
                }
                comboboxHighlight = Math.min(comboboxHighlight + 1, items.length - 1);
                syncComboboxOpenUi(
                    mountEl,
                    Object.assign({}, state, { classSearchQuery: e.target.value }),
                    {}
                );
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (!items.length) {
                    return;
                }
                if (!comboboxOpen) {
                    comboboxOpen = true;
                }
                comboboxHighlight = Math.max(comboboxHighlight - 1, 0);
                syncComboboxOpenUi(
                    mountEl,
                    Object.assign({}, state, { classSearchQuery: e.target.value }),
                    {}
                );
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                if (!items.length) {
                    comboboxOpen = false;
                    classSearchQuery = '';
                    syncComboboxOpenUi(mountEl, state, {});
                    e.target.blur();
                    return;
                }
                const index = comboboxHighlight >= 0 ? comboboxHighlight : 0;
                const pick = items[index];
                const id = pick && pick.getAttribute('data-class-id');
                if (id) {
                    selectClassId(id, mountEl);
                }
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                comboboxOpen = false;
                classSearchQuery = '';
                comboboxHighlight = -1;
                syncComboboxOpenUi(mountEl, state, {});
                e.target.blur();
            }
        });

        mountEl.addEventListener('mousedown', (e) => {
            const item = e.target.closest('.classroom-zone-combobox-item[data-class-id]');
            if (item) {
                e.preventDefault();
            }
        });

        mountEl.addEventListener('click', (e) => {
            const item = e.target.closest('.classroom-zone-combobox-item[data-class-id]');
            if (!item) {
                return;
            }
            const id = item.getAttribute('data-class-id');
            if (id) {
                selectClassId(id, mountEl);
            }
        });

        if (!outsideBound) {
            outsideBound = true;
            document.addEventListener('mousedown', (e) => {
                if (!comboboxOpen || !mountEl || mountEl.hidden) {
                    return;
                }
                const wrap = mountEl.querySelector('.classroom-zone-class-combobox');
                if (wrap && !wrap.contains(e.target)) {
                    comboboxOpen = false;
                    classSearchQuery = '';
                    comboboxHighlight = -1;
                    syncComboboxOpenUi(mountEl, getComboboxState(), {});
                }
            });
        }
    }

    function renderComboboxList(mountEl, state, options) {
        updateComboboxListDom(mountEl, state, options);
    }

    function setComboboxOpen(mountEl, state, options, open) {
        comboboxOpen = open;
        if (!open) {
            comboboxHighlight = -1;
        }
        syncComboboxOpenUi(mountEl, state, options);
    }

    function bindCombobox(mountEl, state, options) {
        syncComboboxOpenUi(mountEl, state, options);
    }

    function ensureActiveClassVisible() {
        const visible = getVisibleClasses();
        const current = getActiveClassId();
        if (!visible.length) {
            if (current) {
                setActiveClassId('');
            }
            return false;
        }
        if (!current || !visible.some((c) => c.id === current)) {
            setActiveClassId(visible[0].id);
            return true;
        }
        return false;
    }

    function render(mountEl) {
        if (!mountEl) {
            return;
        }
        const classId = getActiveClassId();
        const classes = getVisibleClasses();
        const toggles = getUiToggles();
        const classData = (getAppData().classes || []).find((c) => c && c.id === classId) || null;
        const teachers = classData && Array.isArray(classData.classTeachers)
            ? classData.classTeachers
                .filter((row) => row && (row.name || row.userId))
                .map((row) => {
                    const cat = row.category ? ` (${row.category})` : '';
                    return `${row.name || row.userId}${cat}`;
                })
                .join(', ')
            : '';
        const showEssaysToggle = activeTabId === 'essays';
        const comboboxValue = comboboxOpen ? classSearchQuery : getSelectedClassName({ classId, classes });
        const sessionDate = getSessionDate() || todayISO();

        const inputEl = mountEl.querySelector('#classroomZoneClassInput');
        const restoreFocus = inputEl && document.activeElement === inputEl;
        const selStart = restoreFocus ? inputEl.selectionStart : null;
        const selEnd = restoreFocus ? inputEl.selectionEnd : null;
        const wasOpen = comboboxOpen;

        mountEl.innerHTML = `
            <div class="classroom-zone-context-inner">
                <div class="classroom-zone-class-combobox${comboboxOpen ? ' is-open' : ''}" data-class-combobox>
                    <label class="classroom-zone-field classroom-zone-class-field">
                        <span>${escapeHtml(t('classroomClassLabel'))}</span>
                        <input type="search" id="classroomZoneClassInput" class="module-list-search classroom-zone-class-input" role="combobox" autocomplete="off" spellcheck="false" aria-autocomplete="list" aria-controls="classroomZoneClassList" aria-expanded="${comboboxOpen ? 'true' : 'false'}" placeholder="${escapeAttr(t('classListSearchPlaceholder'))}" value="${escapeAttr(comboboxValue)}" />
                    </label>
                    <div id="classroomZoneClassList" class="classroom-zone-class-list module-list" role="listbox"${comboboxOpen ? '' : ' hidden'}>${buildComboboxListHtml({ classId, classes, classSearchQuery })}</div>
                </div>
                <label class="classroom-zone-field classroom-zone-date-field">
                    <span>${escapeHtml(t('classroomDateLabel'))}</span>
                    <input type="date" id="classroomZoneSessionDate" class="field-input field-control--compact" value="${escapeAttr(sessionDate)}" />
                </label>
                <button type="button" class="btn btn-outline btn-compact" id="classroomZoneTodayBtn">${escapeHtml(t('classroomToday'))}</button>
                <div class="classroom-zone-toggles">
                    <label class="checkbox-label classroom-zone-toggle">
                        <input type="checkbox" id="classroomZoneMyClassesOnly"${toggles.myClassesOnly ? ' checked' : ''} />
                        <span>${escapeHtml(t('classroomZoneMyClassesOnly'))}</span>
                    </label>
                    ${showEssaysToggle ? `<label class="checkbox-label classroom-zone-toggle">
                        <input type="checkbox" id="classroomZoneEssaysOnly"${toggles.essaysOnly ? ' checked' : ''} />
                        <span>${escapeHtml(t('classroomZoneEssaysOnly'))}</span>
                    </label>` : ''}
                </div>
                ${teachers ? `<span class="classroom-zone-teachers section-hint">${escapeHtml(t('classroomTeachersLabel'))}: ${escapeHtml(teachers)}</span>` : ''}
            </div>`;

        const state = { classId, classes, classSearchQuery };
        bindCombobox(mountEl, state, {});
        if (wasOpen) {
            syncComboboxOpenUi(mountEl, state, {});
        }
        if (restoreFocus) {
            const newInput = mountEl.querySelector('#classroomZoneClassInput');
            if (newInput) {
                newInput.focus();
                if (selStart != null && typeof newInput.setSelectionRange === 'function') {
                    try {
                        newInput.setSelectionRange(selStart, selEnd);
                    } catch (_) {
                        /* ignore */
                    }
                }
            }
        }

        mountEl.querySelector('#classroomZoneMyClassesOnly')?.addEventListener('change', (e) => {
            if (hooks && hooks.setUiPref) {
                hooks.setUiPref('classroomZoneMyClassesOnly', e.target.checked ? '1' : '');
            }
            ensureActiveClassVisible();
            render(mountEl);
        });
        mountEl.querySelector('#classroomZoneEssaysOnly')?.addEventListener('change', (e) => {
            if (hooks && hooks.setUiPref) {
                hooks.setUiPref('classroomZoneEssaysOnly', e.target.checked ? '1' : '');
            }
            ensureActiveClassVisible();
            render(mountEl);
        });
        mountEl.querySelector('#classroomZoneSessionDate')?.addEventListener('change', (e) => {
            setSessionDate(e.target.value);
        });
        mountEl.querySelector('#classroomZoneTodayBtn')?.addEventListener('click', () => {
            setSessionDate(todayISO());
            render(mountEl);
        });
    }

    function syncVisibility(tabId) {
        activeTabId = tabId || '';
        const mountEl = getMountEl();
        if (!mountEl) {
            return;
        }
        const show = CLASS_SCOPED_TABS.has(activeTabId);
        mountEl.hidden = !show;
        if (show) {
            ensureActiveClassVisible();
            render(mountEl);
        }
    }

    function init(h) {
        hooks = h;
        bindMountEventsOnce();
        if (!contextSubscribed && typeof global.CCPActiveContext !== 'undefined') {
            contextSubscribed = true;
            global.CCPActiveContext.subscribe((detail) => {
                if (!getMountEl()?.hidden && detail && (detail.classId !== undefined || detail.sessionDate !== undefined)) {
                    render(getMountEl());
                }
            });
        }
    }

    function isClassScopedTab(tabId) {
        return CLASS_SCOPED_TABS.has(tabId);
    }

    global.CCPClassroomZoneContext = {
        CLASS_SCOPED_TABS,
        init,
        syncVisibility,
        render,
        getVisibleClasses,
        getBaseAccessibleClasses,
        ensureActiveClassVisible,
        isClassScopedTab,
        getActiveClassId,
        getSessionDate,
        setSessionDate,
        getEssayClassDisplayLabel,
        filterClassesForSearch
    };
})(typeof window !== 'undefined' ? window : globalThis);
