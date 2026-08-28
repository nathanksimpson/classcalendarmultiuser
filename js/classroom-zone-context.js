/**
 * Shared Classroom zone class bar — searchable picker + quick toggles.
 */
(function (global) {
    const CLASS_SCOPED_TABS = new Set([
        'briefing',
        'attendance',
        'ledger',
        'homework-tracking',
        'points',
        'tests',
        'essays',
        'debate-teams',
        'debate-scores',
        'debate-books',
        'speaking-test'
    ]);

    let hooks = null;
    let activeTabId = '';
    let classSearchQuery = '';
    let comboboxOpen = false;
    let comboboxHighlight = -1;
    let outsideBound = false;
    let mountEventsBound = false;
    let contextSubscribed = false;
    let essayAlertSubmissionsOverride = null;

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
        const warnMonthRaw = String(ui.classroomZoneEssayWarnMonth || '').trim();
        const essayWarnMonth = /^\d{4}-\d{2}$/.test(warnMonthRaw) ? warnMonthRaw : '';
        return {
            myClassesOnly: ui.classroomZoneMyClassesOnly === true || ui.classroomZoneMyClassesOnly === '1',
            essaysOnly,
            essayWarnMonth
        };
    }

    /** Distinct YYYY-MM keys from essay SS due dates across accessible classes (newest first). */
    function listEssayWarnMonthOptions() {
        const d = domain();
        if (!d || !d.getEssayRowsFromSyllabus || !d.yearMonthKey) {
            return [];
        }
        const data = getAppData();
        const submissions = getEssayAlertSubmissions();
        const months = new Set();
        getBaseAccessibleClasses().forEach((classData) => {
            if (!classData || !classData.id) {
                return;
            }
            d.getEssayRowsFromSyllabus(classData.syllabusRows).forEach((row) => {
                const syllabusRowId = d.getSyllabusRowKey
                    ? d.getSyllabusRowKey(row)
                    : row && (row.id || row.date);
                if (!syllabusRowId) {
                    return;
                }
                const submission =
                    d.findEssaySubmission &&
                    d.findEssaySubmission(submissions, classData.id, syllabusRowId);
                const ssDue =
                    submission && submission.ssDueDate ? submission.ssDueDate : (row && row.date) || '';
                const month = d.yearMonthKey(ssDue);
                if (month) {
                    months.add(month);
                }
            });
        });
        return Array.from(months).sort((a, b) => String(b).localeCompare(String(a)));
    }

    function getBaseAccessibleClasses() {
        const data = getAppData();
        const cohorts = data.cohorts || [];
        // Do not apply active-cohort filter here — Classroom must list every editable class.
        // Cohort filter is for Class Setup sidebars after an intentional Cohorts-board pick.
        return (data.classes || []).filter(
            (c) => c && (!access() || access().canEditClass(c, cohorts) || access().canBypass())
        );
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

    function getEssayAlertSubmissions() {
        if (Array.isArray(essayAlertSubmissionsOverride)) {
            return essayAlertSubmissionsOverride;
        }
        const data = getAppData();
        return Array.isArray(data.essaySubmissions) ? data.essaySubmissions : [];
    }

    function withEssayAlertSubmissions(submissions, fn) {
        const prev = essayAlertSubmissionsOverride;
        essayAlertSubmissionsOverride = Array.isArray(submissions) ? submissions : null;
        try {
            return typeof fn === 'function' ? fn() : undefined;
        } finally {
            essayAlertSubmissionsOverride = prev;
        }
    }

    function tf(key, vars) {
        let s = t(key);
        if (vars && typeof vars === 'object') {
            Object.keys(vars).forEach((name) => {
                s = s.replace(new RegExp(`\\{${name}\\}`, 'g'), String(vars[name] == null ? '' : vars[name]));
            });
        }
        return s;
    }

    function getEssayAlertCounts(classData) {
        if (!classData || !domain() || !domain().essayAlertCountsForClass) {
            return { rs: 0, as: 0, od: 0, ae: 0, nv: 0 };
        }
        const data = getAppData();
        const month = getUiToggles().essayWarnMonth || '';
        return domain().essayAlertCountsForClass(
            getEssayAlertSubmissions(),
            classData,
            data.cohorts || [],
            month ? { month } : undefined
        );
    }

    /** Essays-tab warn pills (RS/NS/OD/AE/NV) — same chrome as essays sheet badges. */
    function buildEssayAlertBadgesHtml(counts) {
        const c = counts || {};
        const parts = [];
        if (c.rs > 0) {
            parts.push(
                `<span class="classroom-essay-alert-badge classroom-essay-alert-rs">${escapeHtml(tf('classroomEssayAlertRs', { count: c.rs }))}</span>`
            );
        }
        if ((c.as || 0) > 0) {
            parts.push(
                `<span class="classroom-essay-alert-badge classroom-essay-alert-as">${escapeHtml(tf('classroomEssayAlertAs', { count: c.as }))}</span>`
            );
        }
        if (c.od > 0) {
            parts.push(
                `<span class="classroom-essay-alert-badge classroom-essay-alert-od">${escapeHtml(tf('classroomEssayAlertOd', { count: c.od }))}</span>`
            );
        }
        if (c.ae > 0) {
            parts.push(
                `<span class="classroom-essay-alert-badge classroom-essay-alert-ae">${escapeHtml(tf('classroomEssayAlertAe', { count: c.ae }))}</span>`
            );
        }
        if (c.nv > 0) {
            parts.push(
                `<span class="classroom-essay-alert-badge classroom-essay-alert-nv" title="${escapeAttr(t('classroomEssayDebateVideoMissing'))}">${escapeHtml(tf('classroomEssayAlertNv', { count: c.nv }))}</span>`
            );
        }
        return parts.length
            ? `<span class="classroom-essay-alert-badges">${parts.join('')}</span>`
            : '';
    }

    function getDebateBookPeriodPreferenceMap() {
        const ui = getAppData().ui || {};
        return ui.debateBookPeriodByClassId && typeof ui.debateBookPeriodByClassId === 'object'
            ? ui.debateBookPeriodByClassId
            : {};
    }

    function getDebateBookAlertCounts(classData) {
        if (!classData || !domain() || !domain().debateBookAlertCountsForClass) {
            return { ni: 0, ms: 0 };
        }
        const data = getAppData();
        return domain().debateBookAlertCountsForClass(
            data.debateBookDistributions,
            classData,
            data.cohorts || [],
            getDebateBookPeriodPreferenceMap()
        );
    }

    /** Books-tab warn pills (NI/MS) for the class default or saved period. */
    function buildDebateBookAlertBadgesHtml(counts) {
        const c = counts || {};
        const parts = [];
        if ((c.ni || 0) > 0) {
            parts.push(
                `<span class="classroom-debate-book-alert-badge classroom-debate-book-alert-ni">${escapeHtml(tf('classroomDebateBookAlertNi', { count: c.ni }))}</span>`
            );
        }
        if ((c.ms || 0) > 0) {
            parts.push(
                `<span class="classroom-debate-book-alert-badge classroom-debate-book-alert-ms">${escapeHtml(tf('classroomDebateBookAlertMs', { count: c.ms }))}</span>`
            );
        }
        return parts.length
            ? `<span class="classroom-debate-book-alert-badges">${parts.join('')}</span>`
            : '';
    }

    function buildTabAlertBadgesHtml(classData) {
        if (!classData) {
            return '';
        }
        if (activeTabId === 'essays') {
            return buildEssayAlertBadgesHtml(getEssayAlertCounts(classData));
        }
        if (activeTabId === 'debate-books') {
            return buildDebateBookAlertBadgesHtml(getDebateBookAlertCounts(classData));
        }
        return '';
    }

    function usesTabAlertBadges() {
        return activeTabId === 'essays' || activeTabId === 'debate-books';
    }

    function getEssayClassDisplayLabel(classData) {
        if (!classData) {
            return '';
        }
        return classData.name || classData.id || '';
    }

    function getClassDisplayLabel(classData) {
        if (!classData) {
            return '';
        }
        return classData.name || classData.id || '';
    }

    function getClassPickerItemHtml(classData) {
        const label = escapeHtml(getClassDisplayLabel(classData));
        if (!usesTabAlertBadges()) {
            return label;
        }
        const badges = buildTabAlertBadgesHtml(classData);
        if (!badges) {
            return `<span class="classroom-zone-combobox-item__label">${label}</span>`;
        }
        return `<span class="classroom-zone-combobox-item__label">${label}</span>${badges}`;
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

    function findClassData(classId, classes) {
        if (!classId) {
            return null;
        }
        const fromList = Array.isArray(classes)
            ? classes.find((c) => c && c.id === classId)
            : null;
        if (fromList) {
            return fromList;
        }
        return (getAppData().classes || []).find((c) => c && c.id === classId) || null;
    }

    function applyComboboxClassColors(mountEl, state) {
        const tile = global.CCPClassColorTile;
        if (!tile || !mountEl) {
            return;
        }
        const s = state || {};
        const list = mountEl.querySelector('#classroomZoneClassList');
        if (list) {
            list.querySelectorAll('.classroom-zone-combobox-item[data-class-id]').forEach((btn) => {
                const id = btn.getAttribute('data-class-id');
                const classData = findClassData(id, s.classes);
                if (!classData) {
                    tile.clear(btn);
                    delete btn.dataset.classId;
                    return;
                }
                btn.dataset.classId = classData.id;
                tile.apply(btn, classData, { selected: btn.classList.contains('is-selected') });
            });
        }
        const input = mountEl.querySelector('#classroomZoneClassInput');
        if (!input) {
            return;
        }
        if (!comboboxOpen && s.classId) {
            const classData = findClassData(s.classId, s.classes);
            if (classData) {
                input.dataset.classId = classData.id;
                tile.apply(input, classData, { selected: true });
                return;
            }
        }
        tile.clear(input);
        delete input.dataset.classId;
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
                return `<button type="button" class="module-list-item classroom-zone-combobox-item${selected}${highlighted}" role="option" data-class-id="${escapeAttr(c.id)}" aria-selected="${c.id === s.classId ? 'true' : 'false'}">${getClassPickerItemHtml(c)}</button>`;
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
        applyComboboxClassColors(mountEl, state);
        const highlighted = list.querySelector('.classroom-zone-combobox-item.is-highlighted');
        if (highlighted && typeof highlighted.scrollIntoView === 'function') {
            highlighted.scrollIntoView({ block: 'nearest' });
        }
    }

    function syncComboboxOpenUi(mountEl, state, options) {
        const wrap = mountEl && mountEl.querySelector('.classroom-zone-class-combobox');
        const list = mountEl && mountEl.querySelector('#classroomZoneClassList');
        const input = mountEl && mountEl.querySelector('#classroomZoneClassInput');
        const inputWrap = mountEl && mountEl.querySelector('.classroom-zone-class-input-wrap');
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
        if (inputWrap) {
            let badgesHost = inputWrap.querySelector('.classroom-zone-class-input-badges');
            if (usesTabAlertBadges() && !comboboxOpen && state && state.classId) {
                const classData = findClassData(state.classId, state.classes);
                const html = classData ? buildTabAlertBadgesHtml(classData) : '';
                if (html) {
                    if (!badgesHost) {
                        badgesHost = document.createElement('span');
                        badgesHost.className = 'classroom-zone-class-input-badges';
                        badgesHost.setAttribute('aria-hidden', 'true');
                        inputWrap.appendChild(badgesHost);
                    }
                    badgesHost.innerHTML = html;
                } else if (badgesHost) {
                    badgesHost.remove();
                }
            } else if (badgesHost) {
                badgesHost.remove();
            }
        }
        if (comboboxOpen) {
            updateComboboxListDom(mountEl, state, options);
        } else {
            applyComboboxClassColors(mountEl, state);
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
            classSearchQuery = '';
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

            function listItems() {
                const list = mountEl.querySelector('#classroomZoneClassList');
                return list ? Array.from(list.querySelectorAll('[data-class-id]')) : [];
            }

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!comboboxOpen) {
                    comboboxOpen = true;
                    classSearchQuery = '';
                }
                syncComboboxOpenUi(mountEl, getComboboxState(), {});
                const itemsAfter = listItems();
                if (!itemsAfter.length) {
                    return;
                }
                if (e.key === 'ArrowDown') {
                    comboboxHighlight = Math.min(comboboxHighlight + 1, itemsAfter.length - 1);
                } else {
                    comboboxHighlight = Math.max(comboboxHighlight - 1, 0);
                }
                syncComboboxOpenUi(mountEl, getComboboxState(), {});
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const items = listItems();
                if (!items.length) {
                    comboboxOpen = false;
                    classSearchQuery = '';
                    syncComboboxOpenUi(mountEl, getComboboxState(), {});
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
                syncComboboxOpenUi(mountEl, getComboboxState(), {});
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
        const essayWarnMonths = showEssaysToggle ? listEssayWarnMonthOptions() : [];
        const essayWarnMonth = toggles.essayWarnMonth || '';
        if (essayWarnMonth && !essayWarnMonths.includes(essayWarnMonth)) {
            essayWarnMonths.unshift(essayWarnMonth);
        }
        const essayWarnMonthOptionsHtml = showEssaysToggle
            ? [
                  `<option value="">${escapeHtml(t('classroomEssayClassSummaryFilterAllMonths'))}</option>`,
                  ...essayWarnMonths.map(
                      (m) =>
                          `<option value="${escapeAttr(m)}"${m === essayWarnMonth ? ' selected' : ''}>${escapeHtml(m)}</option>`
                  )
              ].join('')
            : '';
        const comboboxValue = comboboxOpen ? classSearchQuery : getSelectedClassName({ classId, classes });
        const sessionDate = getSessionDate() || todayISO();
        const closedTabBadges =
            usesTabAlertBadges() && !comboboxOpen && classData
                ? buildTabAlertBadgesHtml(classData)
                : '';

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
                        <div class="classroom-zone-class-input-wrap">
                            <input type="search" id="classroomZoneClassInput" class="module-list-search classroom-zone-class-input" role="combobox" autocomplete="off" spellcheck="false" aria-autocomplete="list" aria-controls="classroomZoneClassList" aria-expanded="${comboboxOpen ? 'true' : 'false'}" placeholder="${escapeAttr(t('classListSearchPlaceholder'))}" value="${escapeAttr(comboboxValue)}" />
                            ${closedTabBadges ? `<span class="classroom-zone-class-input-badges" aria-hidden="true">${closedTabBadges}</span>` : ''}
                        </div>
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
                    ${showEssaysToggle ? `<label class="classroom-essay-resubmit-filter-field classroom-zone-essay-warn-month">
                        <span class="section-hint">${escapeHtml(t('classroomEssayClassSummaryFilterMonth'))}</span>
                        <select id="classroomZoneEssayWarnMonth" class="field-select field-control--compact">${essayWarnMonthOptionsHtml}</select>
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
        mountEl.querySelector('#classroomZoneEssayWarnMonth')?.addEventListener('change', (e) => {
            const raw = String(e.target.value || '').trim();
            const value = /^\d{4}-\d{2}$/.test(raw) ? raw : '';
            if (hooks && hooks.setUiPref) {
                hooks.setUiPref('classroomZoneEssayWarnMonth', value);
            }
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
        buildEssayAlertBadgesHtml,
        buildDebateBookAlertBadgesHtml,
        getDebateBookAlertCounts,
        getEssayAlertCounts,
        withEssayAlertSubmissions,
        filterClassesForSearch
    };
})(typeof window !== 'undefined' ? window : globalThis);
