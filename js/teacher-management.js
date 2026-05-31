/**
 * Head-teacher Teachers tab: bulk class + homeroom assignment and timetable preview.
 */
(function (global) {
    let hooks = null;
    let catalogSegment = 'cohorts';
    /** @type {Set<string>} */
    let draftClassIds = new Set();
    /** @type {Set<string>} */
    let draftCohortIds = new Set();
    let catalogDirty = false;

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function getApi() {
        return global.CCPTeacherTimetable || null;
    }

    function canAccessTeacherManagementTab() {
        if (typeof global.TeamAuth === 'undefined' || !global.TeamAuth.getUser) {
            return false;
        }
        const user = global.TeamAuth.getUser();
        if (!user) {
            return false;
        }
        if (global.TeamAuth.canAccessAdmin && global.TeamAuth.canAccessAdmin()) {
            return true;
        }
        const role = user.role === 'admin' ? 'super_admin' : (user.role || 'teacher');
        if (role === 'super_admin' || role === 'head_teacher') {
            return true;
        }
        return global.TeamAuth.hasPermission('manage_calendar_access');
    }

    function syncTabVisibility() {
        const btn = document.getElementById('tabBtn-teachers');
        if (!btn) {
            return;
        }
        const show = canAccessTeacherManagementTab();
        btn.hidden = !show;
        btn.style.display = show ? '' : 'none';
        if (!show && hooks && hooks.getActiveTab() === 'teachers') {
            hooks.navigateToTab('calendar');
        }
    }

    function getSelector() {
        if (!hooks) {
            return null;
        }
        return hooks.getTeacherSelector();
    }

    function syncDraftFromData() {
        const api = getApi();
        const selector = getSelector();
        const appData = hooks.getAppData();
        draftClassIds = new Set();
        draftCohortIds = new Set();
        catalogDirty = false;
        if (!api || !selector || !appData) {
            return;
        }
        (appData.classes || []).forEach((c) => {
            if (api.classHasTeacherAssignment(c, selector)) {
                draftClassIds.add(c.id);
            }
        });
        (appData.cohorts || []).forEach((cohort) => {
            if (api.cohortHasHomeroom(cohort, selector)) {
                draftCohortIds.add(cohort.id);
            }
        });
    }

    function escapeHtml(s) {
        if (hooks && hooks.escapeHtml) {
            return hooks.escapeHtml(s);
        }
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function renderTeacherList() {
        const list = document.getElementById('teachersTabTeacherList');
        if (!list || !hooks) {
            return;
        }
        const q = normalizeStr(document.getElementById('teachersTabTeacherSearch')?.value).toLowerCase();
        const active = getSelector();
        list.innerHTML = '';
        const teachers = hooks.listTeachers();
        const filtered = teachers.filter((row) => {
            if (!q) {
                return true;
            }
            const hay = [row.displayName, row.userId, row.email].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
        if (!filtered.length) {
            const empty = document.createElement('p');
            empty.className = 'module-list-empty';
            empty.textContent = q ? hooks.t('lessonFilterSearchEmpty') : hooks.t('timetableTeachersListEmpty');
            list.appendChild(empty);
            return;
        }
        filtered.forEach((row) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const api = getApi();
            const isSelected = active && api && api.teacherMatchesTeacherRef(
                { userId: row.userId, displayName: row.displayName },
                active
            );
            btn.className = 'module-list-item' + (isSelected ? ' is-selected' : '');
            btn.setAttribute('role', 'option');
            btn.setAttribute('aria-selected', String(isSelected));
            btn.innerHTML = `<span>${escapeHtml(hooks.formatTeacherLabel(row))}</span>`;
            btn.addEventListener('click', () => {
                hooks.selectTeacher({ userId: row.userId, displayName: row.displayName });
                syncDraftFromData();
                renderAll();
            });
            list.appendChild(btn);
        });
    }

    function getCatalogSortMode() {
        return document.getElementById('teachersTabCatalogSort')?.value || 'display';
    }

    function getCatalogCategoryFilter() {
        return document.getElementById('teachersTabCatalogCategoryFilter')?.value || 'all';
    }

    function classPassesCategoryFilter(classData) {
        const filter = getCatalogCategoryFilter();
        if (filter === 'all') {
            return true;
        }
        const cat = hooks.getClassCatalogCategory(classData);
        if (filter === '__none__') {
            return !cat;
        }
        return cat === filter;
    }

    function sortClassesForCatalog(classes) {
        const sort = getCatalogSortMode();
        const list = classes.slice();
        if (sort === 'display') {
            const order = hooks.getClassesInDisplayOrder();
            const rank = new Map(order.map((c, i) => [c.id, i]));
            return list.sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999));
        }
        if (sort === 'name') {
            return list.sort((a, b) =>
                (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
            );
        }
        if (sort === 'category') {
            return list.sort((a, b) => {
                const ca = hooks.getClassCatalogCategory(a) || '\uffff';
                const cb = hooks.getClassCatalogCategory(b) || '\uffff';
                const cmp = ca.localeCompare(cb, undefined, { sensitivity: 'base' });
                if (cmp !== 0) {
                    return cmp;
                }
                return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
            });
        }
        if (sort === 'level') {
            return list.sort((a, b) => {
                const la = [hooks.getClassLevelDisplay(a), a.grade].filter(Boolean).join(' ');
                const lb = [hooks.getClassLevelDisplay(b), b.grade].filter(Boolean).join(' ');
                const cmp = la.localeCompare(lb, undefined, { sensitivity: 'base' });
                if (cmp !== 0) {
                    return cmp;
                }
                return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
            });
        }
        if (sort === 'period') {
            return list.sort((a, b) => hooks.compareClassesForDisplayOrder(a, b));
        }
        return list;
    }

    function categoryGroupLabel(categoryKey) {
        if (!categoryKey) {
            return hooks.t('teachersTabCategoryNone');
        }
        return categoryKey;
    }

    function appendClassCatalogChip(body, classData) {
        const label = hooks.formatClassLabel(classData);
        const meta = classCatalogMeta(classData);
        const assigned = draftClassIds.has(classData.id);
        const chip = document.createElement('label');
        chip.className = 'checkbox-label selection-chip teachers-tab-catalog-chip';
        const idAttr = hooks.escapeAttr ? hooks.escapeAttr(classData.id) : classData.id;
        chip.innerHTML = `
            <input type="checkbox" data-class-id="${idAttr}" ${assigned ? 'checked' : ''}>
            <span><strong>${escapeHtml(classData.name || label)}</strong><br><span class="teachers-tab-catalog-meta">${escapeHtml(meta)}</span></span>`;
        chip.querySelector('input').addEventListener('change', (e) => {
            catalogDirty = true;
            if (e.target.checked) {
                draftClassIds.add(classData.id);
            } else {
                draftClassIds.delete(classData.id);
            }
            updateApplyButtonState();
        });
        body.appendChild(chip);
    }

    function classCatalogMeta(classData) {
        const parts = [];
        const category = hooks.getClassCatalogCategory(classData);
        if (category) {
            parts.push(category);
        }
        const level = hooks.getClassLevelDisplay(classData);
        if (level) {
            parts.push(level);
        }
        if (classData.grade) {
            parts.push(classData.grade);
        }
        if (classData.book) {
            parts.push(classData.book);
        }
        const rows = Array.isArray(classData.syllabusRows) ? classData.syllabusRows.length : 0;
        if (rows > 0) {
            parts.push(hooks.t('teachersTabBadgeSyllabus').replace('{n}', String(rows)));
        }
        if (hooks.classHasLessonsInTerm(classData)) {
            parts.push(hooks.t('teachersTabBadgeOnCalendar'));
        }
        return parts.join(' · ');
    }

    function renderCatalog() {
        const body = document.getElementById('teachersTabCatalogBody');
        const emptyEl = document.getElementById('teachersTabCatalogEmpty');
        if (!body || !hooks) {
            return;
        }
        const selector = getSelector();
        const appData = hooks.getAppData();
        const q = normalizeStr(document.getElementById('teachersTabCatalogSearch')?.value).toLowerCase();
        const unassignedOnly = document.getElementById('teachersTabUnassignedOnly')?.checked === true;
        body.innerHTML = '';
        if (!selector) {
            if (emptyEl) {
                emptyEl.hidden = false;
                emptyEl.textContent = hooks.t('timetablePickTeacher');
            }
            return;
        }
        if (emptyEl) {
            emptyEl.hidden = true;
        }

        if (catalogSegment === 'classes') {
            const classes = hooks.getClassesInDisplayOrder();
            const filtered = [];
            classes.forEach((classData) => {
                const label = hooks.formatClassLabel(classData);
                const meta = classCatalogMeta(classData);
                const category = hooks.getClassCatalogCategory(classData);
                const hay = [label, meta, category, classData.name, classData.grade].join(' ').toLowerCase();
                if (q && !hay.includes(q)) {
                    return;
                }
                if (!classPassesCategoryFilter(classData)) {
                    return;
                }
                const assigned = draftClassIds.has(classData.id);
                if (unassignedOnly && assigned) {
                    return;
                }
                filtered.push(classData);
            });
            const sorted = sortClassesForCatalog(filtered);
            let lastCohortGroup = null;
            sorted.forEach((classData) => {
                const groupKey = getCohortGroupLabel(classData);
                if (groupKey !== lastCohortGroup) {
                    lastCohortGroup = groupKey;
                    const heading = document.createElement('h4');
                    heading.className = 'teachers-tab-catalog-group-title';
                    heading.textContent = groupKey;
                    body.appendChild(heading);
                }
                appendClassCatalogChip(body, classData);
            });
            if (sorted.length === 0) {
                body.innerHTML = `<p class="module-list-empty">${escapeHtml(hooks.t('lessonFilterSearchEmpty'))}</p>`;
            }
        } else {
            const cohorts = (appData.cohorts || []).slice().sort((a, b) =>
                (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
            );
            let visible = 0;
            cohorts.forEach((cohort) => {
                const hr = cohort.homeroomTeacherName || cohort.homeroomTeacherUserId || '';
                const label = cohort.name || cohort.level || cohort.id;
                const meta = [cohort.level, cohort.grade, hr ? `${hooks.t('timetableHomeroomLabel')}: ${hr}` : '']
                    .filter(Boolean)
                    .join(' · ');
                const hay = [label, meta].join(' ').toLowerCase();
                if (q && !hay.includes(q)) {
                    return;
                }
                const assigned = draftCohortIds.has(cohort.id);
                if (unassignedOnly && assigned) {
                    return;
                }
                visible += 1;
                const chip = document.createElement('label');
                chip.className = 'checkbox-label selection-chip teachers-tab-catalog-chip';
                const cohortIdAttr = hooks.escapeAttr ? hooks.escapeAttr(cohort.id) : cohort.id;
                chip.innerHTML = `
                    <input type="checkbox" data-cohort-id="${cohortIdAttr}" ${assigned ? 'checked' : ''}>
                    <span><strong>${escapeHtml(label)}</strong><br><span class="teachers-tab-catalog-meta">${escapeHtml(meta)}</span></span>`;
                chip.querySelector('input').addEventListener('change', (e) => {
                    catalogDirty = true;
                    if (e.target.checked) {
                        draftCohortIds.add(cohort.id);
                    } else {
                        draftCohortIds.delete(cohort.id);
                    }
                    updateApplyButtonState();
                });
                body.appendChild(chip);
            });
            if (visible === 0) {
                body.innerHTML = `<p class="module-list-empty">${escapeHtml(hooks.t('teachersTabCohortsEmpty'))}</p>`;
            }
        }
    }

    function updateApplyButtonState() {
        const btn = document.getElementById('teachersTabApplyBtn');
        if (!btn || !hooks) {
            return;
        }
        const ro = hooks.isViewOnly();
        btn.disabled = ro || !getSelector();
        btn.title = ro ? hooks.t('teamReadOnlySave') : '';
    }

    function updateJumpPreviewButton() {
        const btn = document.getElementById('teachersTabScrollToPreviewBtn');
        if (btn) {
            btn.hidden = !getSelector();
        }
    }

    function renderPreview() {
        const mount = document.getElementById('teachersTabPreviewMount');
        const hint = document.getElementById('teachersTabPreviewHint');
        if (!mount || !hooks) {
            return;
        }
        const selector = getSelector();
        const api = getApi();
        if (!selector || !api) {
            mount.innerHTML = '';
            if (hint) {
                hint.hidden = false;
            }
            return;
        }
        if (hint) {
            hint.hidden = true;
        }
        hooks.renderTimetablePreviewInto(mount, selector);
    }

    function renderSegmentUi() {
        const isClasses = catalogSegment === 'classes';
        const btnClass = document.getElementById('teachersTabSegmentClasses');
        const btnCohort = document.getElementById('teachersTabSegmentCohorts');
        if (btnClass) {
            btnClass.classList.toggle('is-active', isClasses);
            btnClass.setAttribute('aria-selected', String(isClasses));
        }
        if (btnCohort) {
            btnCohort.classList.toggle('is-active', !isClasses);
            btnCohort.setAttribute('aria-selected', String(!isClasses));
        }
        const catLabel = document.getElementById('teachersTabCatalogHeading');
        if (catLabel) {
            catLabel.textContent = hooks.t(isClasses ? 'teachersTabCatalogClasses' : 'teachersTabCatalogCohorts');
        }
        const defaultCat = document.getElementById('teachersTabDefaultCategoryWrap');
        if (defaultCat) {
            defaultCat.hidden = !isClasses;
        }
        const homeroomHint = document.querySelector('.teachers-tab-homeroom-hint');
        if (homeroomHint) {
            homeroomHint.hidden = isClasses;
        }
        const toolbar = document.getElementById('teachersTabCatalogToolbar');
        if (toolbar) {
            toolbar.hidden = !isClasses;
        }
    }

    function getCohortGroupLabel(classData) {
        const appData = hooks.getAppData();
        const api = getApi();
        const ids = api && api.getClassCohortIds
            ? api.getClassCohortIds(classData)
            : (normalizeStr(classData.cohortId) ? [classData.cohortId] : []);
        if (!ids.length) {
            return hooks.t('teachersTabUnassignedCohort');
        }
        const names = ids.map((id) => {
            const cohort = (appData.cohorts || []).find((c) => c.id === id);
            return cohort ? (cohort.name || id) : id;
        });
        return names.join(' + ');
    }

    function renderAll() {
        renderTeacherList();
        renderSegmentUi();
        renderCatalog();
        renderPreview();
        updateJumpPreviewButton();
        updateApplyButtonState();
    }

    function setCatalogCheckboxes(checked) {
        const body = document.getElementById('teachersTabCatalogBody');
        if (!body) {
            return;
        }
        catalogDirty = true;
        if (catalogSegment === 'classes') {
            body.querySelectorAll('input[data-class-id]').forEach((cb) => {
                if (!cb.closest('.teachers-tab-catalog-chip')?.hidden) {
                    cb.checked = checked;
                    if (checked) {
                        draftClassIds.add(cb.getAttribute('data-class-id'));
                    } else {
                        draftClassIds.delete(cb.getAttribute('data-class-id'));
                    }
                }
            });
        } else {
            body.querySelectorAll('input[data-cohort-id]').forEach((cb) => {
                if (!cb.closest('.teachers-tab-catalog-chip')?.hidden) {
                    cb.checked = checked;
                    if (checked) {
                        draftCohortIds.add(cb.getAttribute('data-cohort-id'));
                    } else {
                        draftCohortIds.delete(cb.getAttribute('data-cohort-id'));
                    }
                }
            });
        }
        updateApplyButtonState();
    }

    async function applyAssignments() {
        if (!hooks || hooks.isViewOnly()) {
            hooks.showMessage(hooks.t('teamReadOnlySave'), true);
            return;
        }
        const api = getApi();
        const selector = getSelector();
        const appData = hooks.getAppData();
        if (!api || !selector) {
            return;
        }
        const defaultCategory = normalizeStr(document.getElementById('teachersTabDefaultCategory')?.value);
        let addedClasses = 0;
        let removedClasses = 0;
        let setCohorts = 0;
        let clearedCohorts = 0;
        const replaceCohorts = [];

        (appData.classes || []).forEach((classData) => {
            const want = draftClassIds.has(classData.id);
            const has = api.classHasTeacherAssignment(classData, selector);
            if (want && !has) {
                if (api.addTeacherRowToClass(classData, selector, {
                    appData,
                    category: defaultCategory,
                    generateId: hooks.generateId
                })) {
                    addedClasses += 1;
                }
            } else if (!want && has) {
                removedClasses += api.removeTeacherFromClass(classData, selector);
            }
        });

        (appData.cohorts || []).forEach((cohort) => {
            const want = draftCohortIds.has(cohort.id);
            const has = api.cohortHasHomeroom(cohort, selector);
            if (want && !has) {
                const prevUid = normalizeStr(cohort.homeroomTeacherUserId);
                const prevName = normalizeStr(cohort.homeroomTeacherName);
                if ((prevUid || prevName) && !api.teacherMatchesTeacherRef(
                    { userId: prevUid, displayName: prevName },
                    selector
                )) {
                    replaceCohorts.push(cohort.name || cohort.id);
                }
            }
        });

        if (replaceCohorts.length) {
            const msg = hooks.t('teachersTabReplaceHomeroomConfirm')
                .replace('{n}', String(replaceCohorts.length))
                .replace('{names}', replaceCohorts.slice(0, 5).join(', '));
            if (!global.confirm(msg)) {
                return;
            }
        }

        (appData.cohorts || []).forEach((cohort) => {
            const want = draftCohortIds.has(cohort.id);
            const has = api.cohortHasHomeroom(cohort, selector);
            if (want && !has) {
                api.setCohortHomeroom(cohort, selector);
                setCohorts += 1;
            } else if (!want && has) {
                api.clearCohortHomeroom(cohort);
                clearedCohorts += 1;
            }
        });

        catalogDirty = false;
        hooks.saveData();
        hooks.invalidateScheduleCache();
        hooks.refreshTimetablePanels();
        renderAll();
        const summary = hooks.t('teachersTabApplySummary')
            .replace('{added}', String(addedClasses))
            .replace('{removed}', String(removedClasses))
            .replace('{homeroom}', String(setCohorts))
            .replace('{cleared}', String(clearedCohorts));
        hooks.showMessage(summary, false);
    }

    function bindOnce() {
        if (document.body.dataset.teachersTabBound === '1') {
            return;
        }
        document.body.dataset.teachersTabBound = '1';

        document.getElementById('teachersTabTeacherSearch')?.addEventListener('input', () => renderTeacherList());
        document.getElementById('teachersTabCatalogSearch')?.addEventListener('input', () => renderCatalog());
        document.getElementById('teachersTabUnassignedOnly')?.addEventListener('change', () => renderCatalog());
        document.getElementById('teachersTabCatalogSort')?.addEventListener('change', () => {
            if (hooks && hooks.persistTeachersTabCatalogUi) {
                hooks.persistTeachersTabCatalogUi();
            }
            renderCatalog();
        });
        document.getElementById('teachersTabCatalogCategoryFilter')?.addEventListener('change', () => {
            if (hooks && hooks.persistTeachersTabCatalogUi) {
                hooks.persistTeachersTabCatalogUi();
            }
            renderCatalog();
        });

        document.getElementById('teachersTabSegmentClasses')?.addEventListener('click', () => {
            catalogSegment = 'classes';
            renderSegmentUi();
            renderCatalog();
        });
        document.getElementById('teachersTabSegmentCohorts')?.addEventListener('click', () => {
            catalogSegment = 'cohorts';
            renderSegmentUi();
            renderCatalog();
        });
        document.getElementById('teachersTabManageCohortsLink')?.addEventListener('click', (e) => {
            e.preventDefault();
            hooks.navigateToTab('cohorts');
        });

        document.getElementById('teachersTabCatalogSelectAll')?.addEventListener('click', () => setCatalogCheckboxes(true));
        document.getElementById('teachersTabCatalogClearAll')?.addEventListener('click', () => setCatalogCheckboxes(false));
        document.getElementById('teachersTabApplyBtn')?.addEventListener('click', () => {
            void applyAssignments();
        });

        document.getElementById('teachersTabOpenTimetableBtn')?.addEventListener('click', () => {
            const sel = getSelector();
            if (sel && hooks) {
                hooks.openInTimetableTab(sel);
            }
        });
        document.getElementById('teachersTabFilterCalendarBtn')?.addEventListener('click', () => {
            const sel = getSelector();
            if (sel && hooks) {
                hooks.filterCalendarToTeacher(sel);
            }
        });

        document.getElementById('teachersTabScrollToPreviewBtn')?.addEventListener('click', () => {
            document.getElementById('teachersTabPreviewSection')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        });
    }

    function initTab(h) {
        hooks = h;
        bindOnce();
        syncTabVisibility();
    }

    function onTabActivated() {
        if (!hooks) {
            return;
        }
        void hooks.ensureTeacherAccounts().then(() => {
            syncDraftFromData();
            renderAll();
        });
    }

    function onCalendarDataChanged() {
        if (hooks && hooks.getActiveTab() === 'teachers') {
            if (!catalogDirty) {
                syncDraftFromData();
            }
            renderAll();
        }
    }

    function setCatalogSegment(segment) {
        if (segment === 'classes' || segment === 'cohorts') {
            catalogSegment = segment;
            renderSegmentUi();
            renderCatalog();
        }
    }

    global.CCPTeacherManagement = {
        canAccessTeacherManagementTab,
        syncTabVisibility,
        initTab,
        onTabActivated,
        onCalendarDataChanged,
        setCatalogSegment
    };
})(typeof window !== 'undefined' ? window : globalThis);
