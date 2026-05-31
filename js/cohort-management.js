/**
 * Cohort Management Area — admin setup for student groups, schedules, and subject class generation.
 */
(function (global) {
    let hooks = null;
    /** @type {string|null} */
    let selectedCohortId = null;
    let patternFilter = 'all';
    /** @type {Set<string>} */
    let draftClassIds = new Set();
    let catalogDirty = false;

    const PATTERN_IDS = ['mwf', 'tth', 'mw', 'wf', 'mf', 'custom'];
    const DOW_LABELS = { en: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], ko: ['', '월', '화', '수', '목', '금'] };

    const SUBJECT_TRACK_LABELS = {
        phonics: 'Phonics',
        handInHand: 'Hand in Hand',
        spkWr: 'Speaking & Writing',
        animation: 'Animation',
        reading: 'Reading',
        debate: 'Debate',
        writeNow: 'Write Now',
        writeRight: 'Write Right'
    };

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function getLang() {
        return hooks && hooks.getLang ? hooks.getLang() : 'en';
    }

    function t(key) {
        return hooks ? hooks.t(key) : key;
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

    function getMatrixApi() {
        return global.CCPScheduleMatrix || null;
    }

    function getTimetableApi() {
        return global.CCPTeacherTimetable || null;
    }

    function cohortLevelDisplay(cohort) {
        const preset = normalizeStr(cohort.levelPreset);
        if (preset && hooks.getSimsonLevelById) {
            const def = hooks.getSimsonLevelById(preset);
            if (def && def.name) {
                return def.name;
            }
        }
        return normalizeStr(cohort.level);
    }

    function resolveMatrixLevel(cohort) {
        const display = cohortLevelDisplay(cohort);
        if (display) {
            return display;
        }
        return '';
    }

    function resolveMatrixQuery(cohort) {
        const level = resolveMatrixLevel(cohort);
        const patternId = normalizeStr(cohort.schedulePattern) || 'mwf';
        let programTrack = '';
        let levelGroup = '';
        if (hooks.findCurriculumPresetForLevel) {
            const preset = hooks.findCurriculumPresetForLevel(cohort.levelPreset, level);
            if (preset) {
                programTrack = preset.programTrack || '';
                levelGroup = preset.levelGroup || '';
            }
        }
        if (!programTrack && global.CCPScheduleMatrixData && level) {
            const slot = (global.CCPScheduleMatrixData.slots || []).find((s) => s.level === level);
            if (slot) {
                programTrack = slot.programTrack || '';
                levelGroup = slot.levelGroup || '';
            }
        }
        return { programTrack, levelGroup, level, patternId };
    }

    function getCohortMeetingDays(cohort) {
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

    function computeCohortStatus(cohort, appData) {
        const name = normalizeStr(cohort.name);
        const level = normalizeStr(cohort.levelPreset) || normalizeStr(cohort.level);
        const pattern = normalizeStr(cohort.schedulePattern);
        const days = getCohortMeetingDays(cohort);
        const api = getTimetableApi();
        const classIds = api ? api.getCohortClassIds(appData, cohort) : (cohort.classIds || []);
        const hasHomeroom = !!(normalizeStr(cohort.homeroomTeacherUserId) || normalizeStr(cohort.homeroomTeacherName));
        const hasGenerated = classIds.length > 0;

        if (!name && !level) {
            return 'draft';
        }
        if (!pattern && !days.length) {
            return 'draft';
        }
        if (!hasGenerated) {
            return 'subjects_pending';
        }
        if (!hasHomeroom) {
            return 'incomplete';
        }
        if (pattern || days.length) {
            return 'ready';
        }
        return 'schedule_set';
    }

    function statusLabel(status) {
        const map = {
            draft: 'cohortStatusDraft',
            schedule_set: 'cohortStatusSchedule',
            subjects_pending: 'cohortStatusPending',
            ready: 'cohortStatusReady',
            incomplete: 'cohortStatusIncomplete'
        };
        return t(map[status] || 'cohortStatusDraft');
    }

    function statusClass(status) {
        const map = {
            draft: 'draft',
            schedule_set: 'schedule',
            subjects_pending: 'pending',
            ready: 'ready',
            incomplete: 'incomplete'
        };
        return map[status] || 'draft';
    }

    function buildSubjectSlotsFromMatrix(cohort) {
        const matrix = getMatrixApi();
        if (!matrix) {
            return [];
        }
        const query = resolveMatrixQuery(cohort);
        if (!query.level) {
            return [];
        }
        const slots = matrix.findSlots(query);
        const trackMap = new Map();
        slots.forEach((slot) => {
            Object.entries(slot.byWeekday || {}).forEach(([dow, track]) => {
                if (!trackMap.has(track)) {
                    trackMap.set(track, {
                        id: hooks.generateId(),
                        subjectTrack: track,
                        classId: '',
                        enabled: true,
                        period: slot.period,
                        periodByWeekday: {},
                        placements: []
                    });
                }
                const row = trackMap.get(track);
                row.periodByWeekday[String(dow)] = slot.period;
                const p = slot.period;
                if (p != null && (row.period == null || p < row.period)) {
                    row.period = p;
                }
            });
        });
        return Array.from(trackMap.values());
    }

    function mergeSubjectSlots(existing, fromMatrix) {
        const byTrack = new Map((existing || []).map((s) => [s.subjectTrack, s]));
        fromMatrix.forEach((slot) => {
            if (byTrack.has(slot.subjectTrack)) {
                const prev = byTrack.get(slot.subjectTrack);
                prev.period = slot.period;
                prev.periodByWeekday = { ...slot.periodByWeekday };
            } else {
                byTrack.set(slot.subjectTrack, slot);
            }
        });
        return Array.from(byTrack.values());
    }

    function subjectTrackLabel(track) {
        return SUBJECT_TRACK_LABELS[track] || track;
    }

    function generateClassesForCohort(cohort, options) {
        options = options || {};
        const appData = hooks.getAppData();
        if (!appData || !cohort) {
            return { created: 0, updated: 0 };
        }
        const meetingDays = getCohortMeetingDays(cohort);
        cohort.meetingDays = meetingDays;
        if (!Array.isArray(cohort.subjectSlots)) {
            cohort.subjectSlots = buildSubjectSlotsFromMatrix(cohort);
        }
        let created = 0;
        let updated = 0;
        const scheduleBlock = normalizeStr(cohort.scheduleBlock) || 'primary';
        const levelPreset = normalizeStr(cohort.levelPreset) || normalizeStr(cohort.level);
        const grade = normalizeStr(cohort.grade);
        const matrix = getMatrixApi();

        (cohort.subjectSlots || []).forEach((slot) => {
            if (!slot.enabled) {
                return;
            }
            const track = slot.subjectTrack;
            const classTypeId = matrix ? matrix.getBuiltinClassTypeIdForSubjectTrack(track) : '';
            let cls = slot.classId ? appData.classes.find((c) => c.id === slot.classId) : null;
            const baseName = `${normalizeStr(cohort.name) || 'Cohort'} · ${subjectTrackLabel(track)}`;
            const periodByWeekday = slot.periodByWeekday || {};
            const periodVals = Object.values(periodByWeekday).filter((v) => v != null);
            const period = slot.period != null ? slot.period : (periodVals.length ? Math.min(...periodVals) : undefined);

            if (!cls) {
                cls = {
                    id: hooks.generateId(),
                    name: baseName,
                    levelPreset,
                    level: levelPreset,
                    grade,
                    meetingDays: meetingDays.slice(),
                    period,
                    periodByWeekday: { ...periodByWeekday },
                    classTypeId: classTypeId || '',
                    cohortId: cohort.id,
                    cohortIds: [cohort.id],
                    scheduleBlock,
                    classTeachers: [],
                    generatedFromCohort: true
                };
                if (!Array.isArray(appData.classes)) {
                    appData.classes = [];
                }
                appData.classes.push(cls);
                slot.classId = cls.id;
                created += 1;
            } else if (options.overwrite || cls.generatedFromCohort) {
                if (options.overwrite || !normalizeStr(cls.name)) {
                    cls.name = baseName;
                }
                cls.levelPreset = levelPreset;
                cls.level = levelPreset;
                cls.grade = grade;
                cls.meetingDays = meetingDays.slice();
                cls.period = period;
                cls.periodByWeekday = { ...periodByWeekday };
                const linkApi = getTimetableApi();
                if (linkApi) {
                    linkApi.addClassCohortId(cls, cohort.id);
                } else {
                    cls.cohortId = cohort.id;
                }
                cls.scheduleBlock = scheduleBlock;
                if (classTypeId && !cls.classTypeId) {
                    cls.classTypeId = classTypeId;
                }
                updated += 1;
            }
        });

        hooks.syncClassCohortLinks(cohort);
        return { created, updated };
    }

    function renderSummary() {
        const el = document.getElementById('cohortManagementSummary');
        if (!el || !hooks) {
            return;
        }
        const appData = hooks.getAppData();
        const cohorts = appData.cohorts || [];
        const classes = appData.classes || [];
        const linkApi = getTimetableApi();
        const unlinked = classes.filter((c) => {
            if (linkApi) {
                return linkApi.getClassCohortIds(c).length === 0;
            }
            return !normalizeStr(c.cohortId);
        }).length;
        el.hidden = false;
        let text = t('cohortsSummaryStrip')
            .replace('{cohorts}', String(cohorts.length))
            .replace('{classes}', String(classes.length));
        if (unlinked > 0) {
            text += ' ' + t('cohortsSummaryUnlinked').replace('{n}', String(unlinked));
        }
        el.textContent = text;
    }

    function persistSelectedCohortId() {
        if (!hooks) {
            return;
        }
        const appData = hooks.getAppData();
        if (!appData.ui) {
            appData.ui = {};
        }
        appData.ui.cohortsTabSelectedId = selectedCohortId || '';
    }

    function loadSelectedCohortIdFromUi() {
        if (!hooks) {
            return;
        }
        const appData = hooks.getAppData();
        const saved = normalizeStr(appData.ui && appData.ui.cohortsTabSelectedId);
        if (saved && (appData.cohorts || []).some((c) => c.id === saved)) {
            selectedCohortId = saved;
        }
    }

    function getCohortListSortMode() {
        const sel = document.getElementById('cohortsListSort');
        const mode = sel ? sel.value : '';
        if (mode) {
            return mode;
        }
        const appData = hooks && hooks.getAppData();
        return (appData && appData.ui && appData.ui.cohortsListSort) || 'name';
    }

    function persistCohortListSort() {
        if (!hooks) {
            return;
        }
        const sel = document.getElementById('cohortsListSort');
        const appData = hooks.getAppData();
        if (!appData.ui) {
            appData.ui = {};
        }
        appData.ui.cohortsListSort = sel ? sel.value : 'name';
    }

    function getClassCatalogSortMode() {
        const sel = document.getElementById('cohortsClassCatalogSort');
        if (sel && sel.value) {
            return sel.value;
        }
        const appData = hooks && hooks.getAppData();
        return (appData && appData.ui && appData.ui.cohortsClassCatalogSort) || 'display';
    }

    function persistClassCatalogSort() {
        if (!hooks) {
            return;
        }
        const sel = document.getElementById('cohortsClassCatalogSort');
        const appData = hooks.getAppData();
        if (!appData.ui) {
            appData.ui = {};
        }
        appData.ui.cohortsClassCatalogSort = sel ? sel.value : 'display';
    }

    function syncDraftFromData(cohort) {
        draftClassIds = new Set();
        catalogDirty = false;
        if (!cohort || !hooks) {
            return;
        }
        const appData = hooks.getAppData();
        const api = getTimetableApi();
        const classIds = api ? api.getCohortClassIds(appData, cohort) : (cohort.classIds || []);
        classIds.forEach((id) => draftClassIds.add(id));
    }

    function sortCohortsForList(cohorts, appData) {
        const sort = getCohortListSortMode();
        const list = cohorts.slice();
        const api = getTimetableApi();
        if (sort === 'grade') {
            return list.sort((a, b) =>
                (a.grade || '').localeCompare(b.grade || '', undefined, { sensitivity: 'base' })
                || (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
            );
        }
        if (sort === 'level') {
            return list.sort((a, b) =>
                cohortLevelDisplay(a).localeCompare(cohortLevelDisplay(b), undefined, { sensitivity: 'base' })
                || (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
            );
        }
        if (sort === 'status') {
            return list.sort((a, b) => {
                const sa = computeCohortStatus(a, appData);
                const sb = computeCohortStatus(b, appData);
                const cmp = sa.localeCompare(sb);
                if (cmp !== 0) {
                    return cmp;
                }
                return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
            });
        }
        if (sort === 'classCount') {
            return list.sort((a, b) => {
                const ca = api ? api.getCohortClassIds(appData, a).length : (a.classIds || []).length;
                const cb = api ? api.getCohortClassIds(appData, b).length : (b.classIds || []).length;
                if (cb !== ca) {
                    return cb - ca;
                }
                return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
            });
        }
        if (sort === 'pattern') {
            return list.sort((a, b) =>
                (a.schedulePattern || '').localeCompare(b.schedulePattern || '', undefined, { sensitivity: 'base' })
                || (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
            );
        }
        return list.sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
        );
    }

    function sortClassesForCatalog(classes) {
        if (!hooks) {
            return classes.slice();
        }
        const sort = getClassCatalogSortMode();
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

    function classHasAnyCohort(classData) {
        const api = getTimetableApi();
        if (api) {
            return api.getClassCohortIds(classData).length > 0;
        }
        return !!normalizeStr(classData.cohortId);
    }

    function otherCohortLabels(classData, currentCohortId) {
        const appData = hooks.getAppData();
        const api = getTimetableApi();
        const ids = api ? api.getClassCohortIds(classData) : [];
        const names = ids
            .filter((id) => id !== currentCohortId)
            .map((id) => {
                const c = (appData.cohorts || []).find((x) => x.id === id);
                return c ? (c.name || id) : id;
            })
            .filter(Boolean);
        return names;
    }

    function classCatalogMeta(classData, currentCohortId) {
        const parts = [];
        if (hooks.getClassCatalogCategory) {
            const category = hooks.getClassCatalogCategory(classData);
            if (category) {
                parts.push(category);
            }
        }
        if (hooks.getClassLevelDisplay) {
            const level = hooks.getClassLevelDisplay(classData);
            if (level) {
                parts.push(level);
            }
        }
        if (classData.grade) {
            parts.push(classData.grade);
        }
        const others = otherCohortLabels(classData, currentCohortId);
        if (others.length) {
            parts.push(t('cohortsClassAlsoLinked').replace('{names}', others.join(', ')));
        }
        return parts.join(' · ');
    }

    function classPassesCategoryFilter(classData) {
        const filterEl = document.getElementById('cohortsClassCatalogCategoryFilter');
        const filter = filterEl ? filterEl.value : 'all';
        if (filter === 'all' || !hooks.getClassCatalogCategory) {
            return true;
        }
        const cat = hooks.getClassCatalogCategory(classData);
        if (filter === '__none__') {
            return !cat;
        }
        return cat === filter;
    }

    function renderClassCatalog(cohort) {
        const body = document.getElementById('cohortsClassCatalogBody');
        if (!body || !hooks || !cohort) {
            return;
        }
        const appData = hooks.getAppData();
        const q = normalizeStr(document.getElementById('cohortsClassCatalogSearch')?.value).toLowerCase();
        const unassignedOnly = document.getElementById('cohortsClassUnassignedOnly')?.checked === true;
        body.innerHTML = '';
        const classes = hooks.getClassesInDisplayOrder();
        const filtered = [];
        classes.forEach((classData) => {
            const label = hooks.formatClassLabel(classData);
            const meta = classCatalogMeta(classData, cohort.id);
            const hay = [label, meta, classData.name, classData.grade].join(' ').toLowerCase();
            if (q && !hay.includes(q)) {
                return;
            }
            if (!classPassesCategoryFilter(classData)) {
                return;
            }
            if (unassignedOnly && draftClassIds.has(classData.id)) {
                return;
            }
            filtered.push(classData);
        });
        const sorted = sortClassesForCatalog(filtered);
        sorted.forEach((classData) => {
            const meta = classCatalogMeta(classData, cohort.id);
            const chip = document.createElement('label');
            chip.className = 'checkbox-label selection-chip teachers-tab-catalog-chip cohort-class-catalog-chip';
            const idAttr = hooks.escapeAttr ? hooks.escapeAttr(classData.id) : classData.id;
            const checked = draftClassIds.has(classData.id);
            chip.innerHTML = `
                <input type="checkbox" data-class-id="${idAttr}" ${checked ? 'checked' : ''}>
                <span><strong>${escapeHtml(classData.name || hooks.formatClassLabel(classData))}</strong><br><span class="teachers-tab-catalog-meta">${escapeHtml(meta)}</span></span>`;
            chip.querySelector('input').addEventListener('change', (e) => {
                catalogDirty = true;
                if (e.target.checked) {
                    draftClassIds.add(classData.id);
                } else {
                    draftClassIds.delete(classData.id);
                }
                updateClassApplyButtonState();
                renderLinkedPanel(cohort);
            });
            body.appendChild(chip);
        });
        if (!sorted.length) {
            body.innerHTML = `<p class="module-list-empty">${escapeHtml(t('lessonFilterSearchEmpty'))}</p>`;
        }
    }

    function setVisibleCatalogChecks(checked) {
        const body = document.getElementById('cohortsClassCatalogBody');
        if (!body) {
            return;
        }
        body.querySelectorAll('.cohort-class-catalog-chip input[data-class-id]').forEach((cb) => {
            cb.checked = checked;
            const id = cb.getAttribute('data-class-id');
            if (!id) {
                return;
            }
            catalogDirty = true;
            if (checked) {
                draftClassIds.add(id);
            } else {
                draftClassIds.delete(id);
            }
        });
        updateClassApplyButtonState();
        const appData = hooks.getAppData();
        const cohort = selectedCohortId
            ? (appData.cohorts || []).find((c) => c.id === selectedCohortId)
            : null;
        if (cohort) {
            renderLinkedPanel(cohort);
        }
    }

    function updateClassApplyButtonState() {
        const btn = document.getElementById('cohortsClassApplyBtn');
        if (!btn || !hooks) {
            return;
        }
        const ro = hooks.isViewOnly && hooks.isViewOnly();
        btn.disabled = !!ro || !selectedCohortId;
    }

    function applyClassAssignments(cohort) {
        if (!hooks || !cohort) {
            return;
        }
        if (hooks.isViewOnly && hooks.isViewOnly()) {
            hooks.showMessage(hooks.t('teamReadOnlySave'), true);
            return;
        }
        const api = getTimetableApi();
        const appData = hooks.getAppData();
        let linked = 0;
        let unlinked = 0;
        const touchedCohortIds = new Set([cohort.id]);
        (appData.classes || []).forEach((classData) => {
            const want = draftClassIds.has(classData.id);
            const has = api ? api.classHasCohortId(classData, cohort.id) : normalizeStr(classData.cohortId) === cohort.id;
            if (want && !has) {
                if (api) {
                    api.addClassCohortId(classData, cohort.id);
                } else {
                    classData.cohortId = cohort.id;
                }
                linked += 1;
            } else if (!want && has) {
                if (api) {
                    api.removeClassCohortId(classData, cohort.id);
                    api.getClassCohortIds(classData).forEach((cid) => touchedCohortIds.add(cid));
                } else {
                    classData.cohortId = '';
                }
                unlinked += 1;
            }
        });
        syncAllCohortClassLinks(touchedCohortIds);
        catalogDirty = false;
        hooks.saveData();
        if (hooks.invalidateScheduleCache) {
            hooks.invalidateScheduleCache();
        }
        hooks.populateClassCohortSelect();
        hooks.showMessage(
            t('cohortsClassApplySummary').replace('{linked}', String(linked)).replace('{unlinked}', String(unlinked)),
            false
        );
        renderAll();
    }

    function syncAllCohortClassLinks(cohortIdSet) {
        const appData = hooks.getAppData();
        (appData.cohorts || []).forEach((c) => {
            if (cohortIdSet.has(c.id)) {
                hooks.syncClassCohortLinks(c);
            }
        });
    }

    function collectHomeroomFromUi(cohort, homeroomSel, homeroomNameInput, suffixInput) {
        const parsed = hooks.parseTeacherPickerValue(homeroomSel.value);
        cohort.homeroomTeacherUserId = parsed.userId;
        cohort.homeroomTeacherName = homeroomNameInput.value.trim() || parsed.displayName;
        cohort.homeroomDaySuffix = suffixInput.value.trim();
    }

    function syncHomeroomNameFromSelect(homeroomSel, homeroomNameInput) {
        const parsed = hooks.parseTeacherPickerValue(homeroomSel.value);
        if (!parsed.userId) {
            return;
        }
        const teachers = hooks.listTeachers ? hooks.listTeachers() : [];
        const row = teachers.find((r) => r.userId === parsed.userId);
        if (row) {
            homeroomNameInput.value = row.displayName || parsed.displayName;
        } else if (parsed.displayName) {
            homeroomNameInput.value = parsed.displayName;
        }
    }

    function buildHomeroomSection(cohort) {
        const section = document.createElement('section');
        section.className = 'cohort-homeroom-section';
        section.innerHTML = `<h3 class="form-section-title">${escapeHtml(t('cohortsSectionHomeroom'))}</h3>
            <p class="section-hint">${escapeHtml(t('timetableHomeroomRoleHint'))}</p>`;

        const teacherLabel = document.createElement('label');
        teacherLabel.className = 'cohort-homeroom-teacher-label';
        teacherLabel.textContent = t('timetableHomeroomTeacher');
        const homeroomSel = hooks.buildTeacherSelect(
            cohort.homeroomTeacherUserId,
            cohort.homeroomTeacherName
        );
        homeroomSel.className = 'cohort-field-homeroom-select field-select';
        teacherLabel.appendChild(homeroomSel);

        const homeroomNameLabel = document.createElement('label');
        homeroomNameLabel.textContent = t('classAssignedTeacherName');
        const homeroomNameInput = document.createElement('input');
        homeroomNameInput.type = 'text';
        homeroomNameInput.className = 'cohort-field-homeroom-name field-input';
        homeroomNameInput.value = cohort.homeroomTeacherName || '';
        homeroomNameInput.placeholder = t('classAssignedTeacherName');
        homeroomNameLabel.appendChild(homeroomNameInput);

        const suffixLabel = document.createElement('label');
        suffixLabel.textContent = t('timetableHomeroomDaySuffix');
        const suffixInput = document.createElement('input');
        suffixInput.type = 'text';
        suffixInput.maxLength = 3;
        suffixInput.className = 'cohort-field-suffix field-input';
        suffixInput.value = cohort.homeroomDaySuffix || '';
        suffixLabel.appendChild(suffixInput);

        homeroomSel.addEventListener('change', () => syncHomeroomNameFromSelect(homeroomSel, homeroomNameInput));

        const actionRow = document.createElement('div');
        actionRow.className = 'cohort-homeroom-actions';
        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'btn btn-primary btn-small';
        applyBtn.textContent = t('cohortsHomeroomApply');
        applyBtn.addEventListener('click', () => {
            if (hooks.isViewOnly && hooks.isViewOnly()) {
                hooks.showMessage(hooks.t('teamReadOnlySave'), true);
                return;
            }
            collectHomeroomFromUi(cohort, homeroomSel, homeroomNameInput, suffixInput);
            hooks.saveData();
            if (hooks.invalidateScheduleCache) {
                hooks.invalidateScheduleCache();
            }
            hooks.showMessage(t('cohortsHomeroomSaved'), false);
            renderAll();
        });
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'btn btn-outline btn-small';
        clearBtn.textContent = t('cohortsHomeroomClear');
        clearBtn.addEventListener('click', () => {
            if (hooks.isViewOnly && hooks.isViewOnly()) {
                hooks.showMessage(hooks.t('teamReadOnlySave'), true);
                return;
            }
            homeroomSel.value = '';
            homeroomNameInput.value = '';
            cohort.homeroomTeacherUserId = '';
            cohort.homeroomTeacherName = '';
            hooks.saveData();
            renderAll();
        });
        const ro = hooks.isViewOnly && hooks.isViewOnly();
        if (ro) {
            applyBtn.disabled = true;
            clearBtn.disabled = true;
            homeroomSel.disabled = true;
            homeroomNameInput.disabled = true;
            suffixInput.disabled = true;
        }
        actionRow.appendChild(applyBtn);
        actionRow.appendChild(clearBtn);

        section.appendChild(teacherLabel);
        section.appendChild(homeroomNameLabel);
        section.appendChild(suffixLabel);
        section.appendChild(actionRow);

        return { section, homeroomSel, homeroomNameInput, suffixInput };
    }

    function buildClassAssignmentSection(cohort) {
        const section = document.createElement('section');
        section.className = 'cohort-class-assignment-section';
        section.innerHTML = `<h3 class="form-section-title">${escapeHtml(t('cohortsSectionClassAssignment'))}</h3>
            <p class="section-hint">${escapeHtml(t('cohortsClassAssignmentHint'))}</p>`;

        const actions = document.createElement('div');
        actions.className = 'lesson-filter-actions cohort-class-catalog-actions';
        actions.innerHTML = `
            <button type="button" class="btn btn-outline btn-small" data-cohort-catalog="selectAll">${escapeHtml(t('filterSelectAll'))}</button>
            <button type="button" class="btn btn-outline btn-small" data-cohort-catalog="clearAll">${escapeHtml(t('filterClearAll'))}</button>
            <label class="checkbox-label selection-chip">
                <input type="checkbox" id="cohortsClassUnassignedOnly">
                <span>${escapeHtml(t('cohortsClassUnassignedOnly'))}</span>
            </label>`;
        actions.querySelector('[data-cohort-catalog="selectAll"]').addEventListener('click', () => setVisibleCatalogChecks(true));
        actions.querySelector('[data-cohort-catalog="clearAll"]').addEventListener('click', () => setVisibleCatalogChecks(false));
        actions.querySelector('#cohortsClassUnassignedOnly').addEventListener('change', () => renderClassCatalog(cohort));

        const toolbar = document.createElement('div');
        toolbar.className = 'teachers-tab-catalog-toolbar cohort-class-catalog-toolbar';
        const sortLabel = document.createElement('label');
        sortLabel.className = 'teachers-tab-catalog-control';
        sortLabel.innerHTML = `<span>${escapeHtml(t('teachersTabCatalogSortLabel'))}</span>`;
        const sortSel = document.createElement('select');
        sortSel.id = 'cohortsClassCatalogSort';
        sortSel.className = 'teachers-tab-catalog-select field-select field-control--compact';
        [
            ['display', 'teachersTabSortDisplay'],
            ['name', 'teachersTabSortName'],
            ['category', 'teachersTabSortCategory'],
            ['level', 'teachersTabSortLevel'],
            ['period', 'teachersTabSortPeriod']
        ].forEach(([val, key]) => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = t(key);
            sortSel.appendChild(opt);
        });
        const appData = hooks.getAppData();
        sortSel.value = (appData.ui && appData.ui.cohortsClassCatalogSort) || 'display';
        sortSel.addEventListener('change', () => {
            persistClassCatalogSort();
            renderClassCatalog(cohort);
        });
        sortLabel.appendChild(sortSel);

        const catLabel = document.createElement('label');
        catLabel.className = 'teachers-tab-catalog-control';
        catLabel.innerHTML = `<span>${escapeHtml(t('teachersTabCatalogCategoryLabel'))}</span>`;
        const catSel = document.createElement('select');
        catSel.id = 'cohortsClassCatalogCategoryFilter';
        catSel.className = 'teachers-tab-catalog-select field-select field-control--compact';
        const catOpts = [
            ['all', 'filterAll'],
            ['__none__', 'teachersTabCategoryNone']
        ];
        (hooks.getTeacherCategoryPresets ? hooks.getTeacherCategoryPresets() : []).forEach((cat) => {
            catOpts.push([cat, null]);
        });
        catOpts.forEach(([val, key]) => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = key ? t(key) : val;
            catSel.appendChild(opt);
        });
        catSel.value = (appData.ui && appData.ui.cohortsClassCatalogCategoryFilter) || 'all';
        catSel.addEventListener('change', () => {
            if (!appData.ui) {
                appData.ui = {};
            }
            appData.ui.cohortsClassCatalogCategoryFilter = catSel.value;
            renderClassCatalog(cohort);
        });
        catLabel.appendChild(catSel);
        toolbar.appendChild(sortLabel);
        toolbar.appendChild(catLabel);

        const search = document.createElement('input');
        search.type = 'search';
        search.id = 'cohortsClassCatalogSearch';
        search.className = 'module-list-search';
        search.placeholder = t('classListSearchPlaceholder') || 'Search classes…';
        search.addEventListener('input', () => renderClassCatalog(cohort));

        const body = document.createElement('div');
        body.id = 'cohortsClassCatalogBody';
        body.className = 'lesson-filter-chip-grid teachers-tab-catalog-body cohort-class-catalog-body';

        const applyRow = document.createElement('div');
        applyRow.className = 'cohort-class-apply-row teachers-tab-apply-row';
        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.id = 'cohortsClassApplyBtn';
        applyBtn.className = 'btn btn-primary btn-small';
        applyBtn.textContent = t('cohortsClassApply');
        applyBtn.addEventListener('click', () => applyClassAssignments(cohort));
        applyRow.appendChild(applyBtn);

        section.appendChild(actions);
        section.appendChild(toolbar);
        section.appendChild(search);
        section.appendChild(body);
        section.appendChild(applyRow);
        return section;
    }

    function cohortDisplayName(cohort) {
        return normalizeStr(cohort.name) || t('timetableAddCohort');
    }

    function confirmDeleteCohort(cohort) {
        const label = cohortDisplayName(cohort);
        const msg = t('cohortsDeleteConfirm').replace(/\{name\}/g, label);
        return global.confirm(msg);
    }

    function deleteCohort(cohort) {
        if (!hooks || !cohort || !cohort.id) {
            return;
        }
        if (hooks.isViewOnly && hooks.isViewOnly()) {
            hooks.showMessage(hooks.t('teamReadOnlySave'), true);
            return;
        }
        if (!confirmDeleteCohort(cohort)) {
            return;
        }
        const appData = hooks.getAppData();
        const unlinkApi = getTimetableApi();
        appData.cohorts = (appData.cohorts || []).filter((c) => c.id !== cohort.id);
        (appData.classes || []).forEach((cls) => {
            if (unlinkApi) {
                if (unlinkApi.classHasCohortId(cls, cohort.id)) {
                    unlinkApi.removeClassCohortId(cls, cohort.id);
                }
            } else if (normalizeStr(cls.cohortId) === cohort.id) {
                cls.cohortId = '';
            }
        });
        selectedCohortId = null;
        persistSelectedCohortId();
        draftClassIds = new Set();
        catalogDirty = false;
        hooks.saveData();
        hooks.populateClassCohortSelect();
        hooks.showMessage(t('cohortsDeleted').replace('{name}', cohortDisplayName(cohort)), false);
        renderAll();
    }

    function buildCohortSummaryStrip(cohort, appData) {
        const status = computeCohortStatus(cohort, appData);
        const api = getTimetableApi();
        const classCount = api ? api.getCohortClassIds(appData, cohort).length : (cohort.classIds || []).length;
        const hr = normalizeStr(cohort.homeroomTeacherName) || normalizeStr(cohort.homeroomTeacherUserId);
        const wrap = document.createElement('div');
        wrap.className = 'cohort-editor-summary';
        wrap.innerHTML = `
            <div class="cohort-editor-summary-title">
                <strong>${escapeHtml(cohortDisplayName(cohort))}</strong>
                <span class="cohort-status-chip cohort-status-chip--${statusClass(status)}">${escapeHtml(statusLabel(status))}</span>
            </div>
            <p class="cohort-editor-summary-meta">${escapeHtml(
                [
                    cohortLevelDisplay(cohort),
                    cohort.grade,
                    (cohort.schedulePattern || '').toUpperCase(),
                    t('cohortsSummaryClassCount').replace('{n}', String(classCount)),
                    hr ? `${t('timetableHomeroomLabel')}: ${hr}` : t('cohortsNoHomeroom')
                ].filter(Boolean).join(' · ')
            )}</p>`;
        return wrap;
    }

    function syncCohortsToolbarDeleteBtn() {
        const btn = document.getElementById('cohortsDeleteBtn');
        if (!btn || !hooks) {
            return;
        }
        const appData = hooks.getAppData();
        const cohort = selectedCohortId
            ? (appData.cohorts || []).find((c) => c.id === selectedCohortId)
            : null;
        btn.hidden = !cohort;
        btn.disabled = !!(hooks.isViewOnly && hooks.isViewOnly());
        btn.title = btn.disabled ? t('teamReadOnlySave') : '';
        if (!btn.dataset.cohortsDeleteBound) {
            btn.dataset.cohortsDeleteBound = '1';
            btn.addEventListener('click', () => {
                const data = hooks.getAppData();
                const selected = selectedCohortId
                    ? (data.cohorts || []).find((c) => c.id === selectedCohortId)
                    : null;
                if (selected) {
                    deleteCohort(selected);
                }
            });
        }
    }

    function renderCohortListSortControl() {
        const host = document.getElementById('cohortsListSortMount');
        if (!host || !hooks) {
            return;
        }
        host.innerHTML = '';
        const label = document.createElement('label');
        label.className = 'cohort-list-sort-control teachers-tab-catalog-control';
        label.innerHTML = `<span>${escapeHtml(t('cohortsListSortLabel'))}</span>`;
        const sel = document.createElement('select');
        sel.id = 'cohortsListSort';
        sel.className = 'teachers-tab-catalog-select field-select field-control--compact';
        [
            ['name', 'cohortsListSortName'],
            ['grade', 'cohortsListSortGrade'],
            ['level', 'cohortsListSortLevel'],
            ['status', 'cohortsListSortStatus'],
            ['classCount', 'cohortsListSortClassCount'],
            ['pattern', 'cohortsListSortPattern']
        ].forEach(([val, key]) => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = t(key);
            sel.appendChild(opt);
        });
        const appData = hooks.getAppData();
        sel.value = (appData.ui && appData.ui.cohortsListSort) || 'name';
        sel.addEventListener('change', () => {
            persistCohortListSort();
            renderCohortList();
        });
        label.appendChild(sel);
        host.appendChild(label);
    }

    function renderFilterChips() {
        const mount = document.getElementById('cohortsListFilterChips');
        if (!mount) {
            return;
        }
        mount.innerHTML = '';
        const filters = [
            { id: 'all', label: t('cohortsFilterAll') },
            { id: 'mwf', label: 'MWF' },
            { id: 'tth', label: 'T/Th' }
        ];
        filters.forEach((f) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cohort-filter-chip' + (patternFilter === f.id ? ' is-active' : '');
            btn.textContent = f.label;
            btn.addEventListener('click', () => {
                patternFilter = f.id;
                renderFilterChips();
                renderCohortList();
            });
            mount.appendChild(btn);
        });
    }

    function renderCohortList() {
        const list = document.getElementById('cohortsList');
        if (!list || !hooks) {
            return;
        }
        const appData = hooks.getAppData();
        const q = normalizeStr(document.getElementById('cohortsListSearch')?.value).toLowerCase();
        list.innerHTML = '';
        let cohorts = sortCohortsForList(appData.cohorts || [], appData);
        cohorts = cohorts.filter((cohort) => {
            if (patternFilter !== 'all') {
                const pat = normalizeStr(cohort.schedulePattern) || 'custom';
                if (pat !== patternFilter) {
                    return false;
                }
            }
            if (!q) {
                return true;
            }
            const hay = [
                cohort.name,
                cohortLevelDisplay(cohort),
                cohort.grade,
                cohort.schedulePattern
            ].join(' ').toLowerCase();
            return hay.includes(q);
        });
        if (!cohorts.length) {
            const empty = document.createElement('p');
            empty.className = 'module-list-empty';
            empty.textContent = q ? t('lessonFilterSearchEmpty') : t('timetableCohortsEmpty');
            list.appendChild(empty);
            return;
        }
        const api = getTimetableApi();
        cohorts.forEach((cohort) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const status = computeCohortStatus(cohort, appData);
            const selected = cohort.id === selectedCohortId;
            btn.className = 'module-list-item' + (selected ? ' is-selected' : '');
            btn.setAttribute('role', 'option');
            btn.setAttribute('aria-selected', String(selected));
            const classCount = api ? api.getCohortClassIds(appData, cohort).length : (cohort.classIds || []).length;
            const pat = normalizeStr(cohort.schedulePattern).toUpperCase() || '—';
            btn.innerHTML = `<span>${escapeHtml(cohort.name || t('timetableAddCohort'))}<span class="cohort-status-chip cohort-status-chip--${statusClass(status)}">${escapeHtml(statusLabel(status))}</span></span><span class="cohort-list-item-meta">${escapeHtml([cohortLevelDisplay(cohort), cohort.grade, pat, `${classCount} classes`].filter(Boolean).join(' · '))}</span>`;
            btn.addEventListener('click', () => {
                selectedCohortId = cohort.id;
                persistSelectedCohortId();
                syncDraftFromData(cohort);
                renderAll();
            });
            list.appendChild(btn);
        });
    }

    function renderLinkedPanel(cohort) {
        const mount = document.getElementById('cohortsLinkedList');
        if (!mount) {
            return;
        }
        mount.innerHTML = '';
        if (!cohort || !hooks) {
            mount.innerHTML = `<p class="section-hint">${escapeHtml(t('cohortsLinkedEmpty'))}</p>`;
            return;
        }
        const appData = hooks.getAppData();
        const api = getTimetableApi();
        const classIds = api ? api.getCohortClassIds(appData, cohort) : (cohort.classIds || []);
        if (!classIds.length) {
            mount.innerHTML = `<p class="section-hint">${escapeHtml(t('cohortsLinkedNone'))}</p>`;
            return;
        }
        classIds.forEach((classId) => {
            const cls = appData.classes.find((c) => c.id === classId);
            if (!cls) {
                return;
            }
            const item = document.createElement('div');
            item.className = 'cohort-linked-item';
            const teachers = (cls.classTeachers || []).map((r) => r.name || r.userId).filter(Boolean).join(', ');
            const days = (cls.meetingDays || []).join(',');
            const period = cls.period != null ? `P${cls.period}` : '';
            const others = otherCohortLabels(cls, cohort.id);
            const sharedNote = others.length
                ? t('cohortsClassAlsoLinked').replace('{names}', others.join(', '))
                : '';
            item.innerHTML = `
                <div class="cohort-linked-item-title">${escapeHtml(cls.name || classId)}</div>
                <div class="cohort-linked-item-meta">${escapeHtml([period, days ? `days ${days}` : '', teachers || t('cohortsNoTeacher'), sharedNote].filter(Boolean).join(' · '))}</div>
                <div class="cohort-linked-item-actions">
                    <button type="button" class="btn btn-outline btn-small" data-action="class">${escapeHtml(t('cohortsOpenClass'))}</button>
                    <button type="button" class="btn btn-outline btn-small" data-action="syllabus">${escapeHtml(t('cohortsOpenSyllabus'))}</button>
                    <button type="button" class="btn btn-outline btn-small" data-action="teacher">${escapeHtml(t('cohortsAssignTeacher'))}</button>
                </div>`;
            item.querySelector('[data-action="class"]').addEventListener('click', () => {
                hooks.navigateToTab('classes', { classId: cls.id });
            });
            item.querySelector('[data-action="syllabus"]').addEventListener('click', () => {
                hooks.navigateToTab('syllabus', { classId: cls.id });
            });
            item.querySelector('[data-action="teacher"]').addEventListener('click', () => {
                hooks.navigateToTab('teachers', { segment: 'classes' });
            });
            mount.appendChild(item);
        });
    }

    function renderSubjectGrid(cohort, container) {
        container.innerHTML = '';
        const matrix = getMatrixApi();
        if (!matrix || !resolveMatrixLevel(cohort)) {
            const p = document.createElement('p');
            p.className = 'section-hint';
            p.textContent = t('cohortsMatrixNoMatch');
            container.appendChild(p);
            return;
        }
        if (!Array.isArray(cohort.subjectSlots) || !cohort.subjectSlots.length) {
            cohort.subjectSlots = buildSubjectSlotsFromMatrix(cohort);
        }
        const lang = getLang();
        const dayLabels = DOW_LABELS[lang] || DOW_LABELS.en;
        const meetingDays = getCohortMeetingDays(cohort);
        const wrap = document.createElement('div');
        wrap.className = 'cohort-subject-grid-wrap';
        const table = document.createElement('table');
        table.className = 'cohort-subject-grid';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        headRow.innerHTML = `<th>${escapeHtml(t('cohortsSubjectCol'))}</th><th>${escapeHtml(t('cohortsEnabledCol'))}</th>`;
        meetingDays.forEach((dow) => {
            const th = document.createElement('th');
            th.textContent = dayLabels[dow] || String(dow);
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        (cohort.subjectSlots || []).forEach((slot, idx) => {
            const tr = document.createElement('tr');
            const nameTd = document.createElement('td');
            nameTd.textContent = subjectTrackLabel(slot.subjectTrack);
            tr.appendChild(nameTd);
            const enTd = document.createElement('td');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = slot.enabled !== false;
            cb.addEventListener('change', () => {
                slot.enabled = cb.checked;
            });
            enTd.appendChild(cb);
            tr.appendChild(enTd);
            meetingDays.forEach((dow) => {
                const td = document.createElement('td');
                const val = slot.periodByWeekday && slot.periodByWeekday[String(dow)];
                td.textContent = val != null ? `P${val}` : '—';
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        container.appendChild(wrap);
        const periodCount = new Set(
            (cohort.subjectSlots || []).flatMap((s) => Object.values(s.periodByWeekday || {}))
        ).size;
        const hint = document.createElement('p');
        hint.className = 'section-hint';
        hint.textContent = t('cohortsPeriodCountHint').replace('{n}', String(periodCount || '—'));
        container.appendChild(hint);
    }

    function renderEditor() {
        const mount = document.getElementById('cohortsEditorMount');
        const empty = document.getElementById('cohortsEditorEmpty');
        if (!mount || !empty || !hooks) {
            return;
        }
        const appData = hooks.getAppData();
        const cohort = selectedCohortId
            ? (appData.cohorts || []).find((c) => c.id === selectedCohortId)
            : null;
        if (!cohort) {
            mount.hidden = true;
            empty.hidden = false;
            renderLinkedPanel(null);
            return;
        }
        empty.hidden = true;
        mount.hidden = false;
        mount.innerHTML = '';

        if (!catalogDirty) {
            syncDraftFromData(cohort);
        }
        mount.appendChild(buildCohortSummaryStrip(cohort, appData));
        const homeroomBlock = buildHomeroomSection(cohort);
        mount.appendChild(homeroomBlock.section);
        mount.appendChild(buildClassAssignmentSection(cohort));

        const identity = document.createElement('section');
        identity.innerHTML = `<h3 class="form-section-title">${escapeHtml(t('cohortsSectionIdentity'))}</h3>`;
        const nameLabel = document.createElement('label');
        nameLabel.textContent = t('timetableCohortName');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'cohort-field-name field-input';
        nameInput.value = cohort.name || '';
        nameLabel.appendChild(nameInput);

        const levelLabel = document.createElement('label');
        levelLabel.textContent = t('classCurriculumLevel');
        const levelSel = document.createElement('select');
        levelSel.className = 'cohort-field-level field-select';
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '—';
        levelSel.appendChild(emptyOpt);
        (hooks.getAllSimsonLevels ? hooks.getAllSimsonLevels() : []).forEach((lv) => {
            const opt = document.createElement('option');
            opt.value = lv.id;
            opt.textContent = lv.name || lv.id;
            if (cohort.levelPreset === lv.id || cohort.level === lv.id) {
                opt.selected = true;
            }
            levelSel.appendChild(opt);
        });
        levelLabel.appendChild(levelSel);

        const gradeLabel = document.createElement('label');
        gradeLabel.textContent = t('classGrade') || 'Grade';
        const gradeInput = document.createElement('input');
        gradeInput.type = 'text';
        gradeInput.className = 'cohort-field-grade field-input';
        gradeInput.value = cohort.grade || '';
        gradeLabel.appendChild(gradeInput);

        identity.appendChild(nameLabel);
        identity.appendChild(levelLabel);
        identity.appendChild(gradeLabel);

        const schedule = document.createElement('section');
        schedule.innerHTML = `<h3 class="form-section-title">${escapeHtml(t('cohortsSectionSchedule'))}</h3>`;
        const patternPicker = document.createElement('div');
        patternPicker.className = 'cohort-pattern-picker';
        const matrix = getMatrixApi();
        const patterns = matrix ? matrix.getPatterns() : {};
        PATTERN_IDS.forEach((pid) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cohort-pattern-btn' + ((cohort.schedulePattern || 'mwf') === pid ? ' is-active' : '');
            if (pid === 'custom') {
                btn.textContent = t('cohortsPatternCustom');
            } else {
                const pat = patterns[pid];
                btn.textContent = pat && pat.label ? (pat.label[getLang()] || pat.label.en || pid.toUpperCase()) : pid.toUpperCase();
            }
            btn.addEventListener('click', () => {
                cohort.schedulePattern = pid;
                if (pid !== 'custom' && patterns[pid]) {
                    cohort.meetingDays = patterns[pid].meetingDays.slice();
                }
                cohort.subjectSlots = buildSubjectSlotsFromMatrix(cohort);
                renderEditor();
            });
            patternPicker.appendChild(btn);
        });
        schedule.appendChild(patternPicker);

        const blockLabel = document.createElement('label');
        blockLabel.textContent = t('classScheduleBlock') || 'Schedule block';
        const blockSel = document.createElement('select');
        blockSel.className = 'cohort-field-block field-select';
        ['primary', 'secondary'].forEach((val) => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val === 'primary' ? t('classScheduleBlockPrimary') : t('classScheduleBlockSecondary');
            if ((cohort.scheduleBlock || 'primary') === val) {
                opt.selected = true;
            }
            blockSel.appendChild(opt);
        });
        blockLabel.appendChild(blockSel);
        schedule.appendChild(blockLabel);

        const subjects = document.createElement('section');
        subjects.innerHTML = `<h3 class="form-section-title">${escapeHtml(t('cohortsSectionSubjects'))}</h3>`;
        const gridMount = document.createElement('div');
        renderSubjectGrid(cohort, gridMount);
        subjects.appendChild(gridMount);

        const actions = document.createElement('div');
        actions.className = 'cohort-management-actions';
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-primary btn-small';
        saveBtn.textContent = t('timetableSaveCohort');
        saveBtn.addEventListener('click', () => {
            cohort.name = nameInput.value.trim() || cohort.name;
            cohort.levelPreset = levelSel.value;
            cohort.level = cohort.levelPreset;
            cohort.grade = gradeInput.value.trim();
            cohort.scheduleBlock = blockSel.value;
            collectHomeroomFromUi(
                cohort,
                homeroomBlock.homeroomSel,
                homeroomBlock.homeroomNameInput,
                homeroomBlock.suffixInput
            );
            cohort.meetingDays = getCohortMeetingDays(cohort);
            hooks.syncClassCohortLinks(cohort);
            hooks.saveData();
            hooks.populateClassCohortSelect();
            persistSelectedCohortId();
            hooks.showMessage(t('timetableCohortSaved'), false);
            renderAll();
        });

        const genBtn = document.createElement('button');
        genBtn.type = 'button';
        genBtn.className = 'btn btn-outline btn-small';
        genBtn.textContent = t('cohortsGenerateSubjects');
        genBtn.addEventListener('click', () => {
            const hasExisting = (cohort.subjectSlots || []).some((s) => s.classId);
            if (hasExisting && !global.confirm(t('cohortsRegenerateConfirm'))) {
                return;
            }
            cohort.levelPreset = levelSel.value;
            cohort.level = cohort.levelPreset;
            cohort.scheduleBlock = blockSel.value;
            cohort.meetingDays = getCohortMeetingDays(cohort);
            const result = generateClassesForCohort(cohort, { overwrite: hasExisting });
            hooks.saveData();
            hooks.invalidateScheduleCache();
            hooks.populateClassCohortSelect();
            hooks.showMessage(
                t('cohortsGenerateDone').replace('{created}', String(result.created)).replace('{updated}', String(result.updated)),
                false
            );
            renderAll();
        });

        const dupBtn = document.createElement('button');
        dupBtn.type = 'button';
        dupBtn.className = 'btn btn-outline btn-small';
        dupBtn.textContent = t('cohortsDuplicate');
        dupBtn.addEventListener('click', () => {
            const copy = JSON.parse(JSON.stringify(cohort));
            copy.id = hooks.generateId();
            copy.name = (cohort.name || 'Cohort') + ' (copy)';
            copy.classIds = [];
            (copy.subjectSlots || []).forEach((s) => {
                s.id = hooks.generateId();
                s.classId = '';
            });
            appData.cohorts.push(copy);
            selectedCohortId = copy.id;
            hooks.saveData();
            renderAll();
        });

        const teachersBtn = document.createElement('button');
        teachersBtn.type = 'button';
        teachersBtn.className = 'btn btn-outline btn-small';
        teachersBtn.textContent = t('cohortsOpenTeachers');
        teachersBtn.addEventListener('click', () => hooks.navigateToTab('teachers'));

        const ttBtn = document.createElement('button');
        ttBtn.type = 'button';
        ttBtn.className = 'btn btn-outline btn-small';
        ttBtn.textContent = t('cohortsOpenTimetable');
        ttBtn.addEventListener('click', () => hooks.navigateToTab('timetable'));

        actions.appendChild(saveBtn);
        actions.appendChild(genBtn);
        actions.appendChild(dupBtn);
        actions.appendChild(teachersBtn);
        actions.appendChild(ttBtn);

        mount.appendChild(identity);
        mount.appendChild(schedule);
        mount.appendChild(subjects);
        mount.appendChild(actions);

        renderClassCatalog(cohort);
        updateClassApplyButtonState();
        renderLinkedPanel(cohort);
    }

    function renderAll() {
        renderSummary();
        renderFilterChips();
        renderCohortListSortControl();
        renderCohortList();
        syncCohortsToolbarDeleteBtn();
        renderEditor();
        const calName = document.getElementById('cohortsTabCalendarName');
        if (calName && hooks.getCalendarName) {
            const name = hooks.getCalendarName();
            if (name) {
                calName.hidden = false;
                calName.textContent = t('timetableCohortsScopeHint').split('.')[0] + ': ' + name;
            }
        }
    }

    function addCohort() {
        const appData = hooks.getAppData();
        if (!Array.isArray(appData.cohorts)) {
            appData.cohorts = [];
        }
        const cohort = {
            id: hooks.generateId(),
            name: '',
            level: '',
            levelPreset: '',
            grade: '',
            schedulePattern: 'mwf',
            meetingDays: [1, 3, 5],
            periodCount: 0,
            scheduleBlock: 'primary',
            subjectSlots: [],
            classIds: [],
            homeroomTeacherUserId: '',
            homeroomTeacherName: '',
            homeroomDaySuffix: ''
        };
        appData.cohorts.push(cohort);
        selectedCohortId = cohort.id;
        persistSelectedCohortId();
        hooks.saveData();
        renderAll();
    }

    function importFromClasses() {
        const api = getTimetableApi();
        if (!api || !hooks) {
            return;
        }
        const appData = hooks.getAppData();
        const suggestions = api.suggestCohortsFromClasses(appData.classes || []);
        if (!suggestions.length) {
            hooks.showMessage(t('cohortsImportNone'), true);
            return;
        }
        const preview = suggestions.map((s) => s.name).join('\n');
        if (!global.confirm(t('cohortsImportConfirm').replace('{n}', String(suggestions.length)) + '\n\n' + preview)) {
            return;
        }
        let added = 0;
        suggestions.forEach((sug) => {
            const existing = (appData.cohorts || []).find((c) =>
                c.levelPreset === sug.levelPreset
                && c.grade === sug.grade
                && api.meetingDaysKey(c.meetingDays) === api.meetingDaysKey(sug.meetingDays)
            );
            if (existing) {
                sug.classIds.forEach((classId) => {
                    if (!existing.classIds.includes(classId)) {
                        existing.classIds.push(classId);
                    }
                });
                hooks.syncClassCohortLinks(existing);
                return;
            }
            const cohort = {
                id: hooks.generateId(),
                name: sug.name,
                level: sug.level,
                levelPreset: sug.levelPreset || sug.level,
                grade: sug.grade,
                schedulePattern: (global.CCPScheduleMatrix && global.CCPScheduleMatrix.patternIdFromMeetingDays
                    ? global.CCPScheduleMatrix.patternIdFromMeetingDays(sug.meetingDays)
                    : null) || 'custom',
                meetingDays: sug.meetingDays,
                classIds: sug.classIds.slice(),
                subjectSlots: [],
                homeroomTeacherUserId: '',
                homeroomTeacherName: '',
                homeroomDaySuffix: api.inferHomeroomDaySuffix(sug, {})
            };
            appData.cohorts.push(cohort);
            hooks.syncClassCohortLinks(cohort);
            added += 1;
        });
        (appData.cohorts || []).forEach((c) => hooks.syncClassCohortLinks(c));
        hooks.saveData();
        hooks.populateClassCohortSelect();
        hooks.showMessage(t('timetableCohortsSuggested').replace('{n}', String(added)), false);
        renderAll();
    }

    function bindOnce() {
        if (document.body.dataset.cohortsTabBound === '1') {
            return;
        }
        document.body.dataset.cohortsTabBound = '1';
        document.getElementById('cohortsAddBtn')?.addEventListener('click', () => addCohort());
        document.getElementById('cohortsImportBtn')?.addEventListener('click', () => importFromClasses());
        document.getElementById('cohortsListSearch')?.addEventListener('input', () => renderCohortList());
    }

    function initTab(tabHooks, options) {
        hooks = tabHooks;
        bindOnce();
        if (hooks.ensureTeacherAccounts) {
            void hooks.ensureTeacherAccounts();
        }
        if (options && options.cohortId) {
            selectedCohortId = options.cohortId;
            persistSelectedCohortId();
        } else {
            loadSelectedCohortIdFromUi();
        }
        if (!hooks) {
            return;
        }
        const appData = hooks.getAppData();
        const cohort = selectedCohortId
            ? (appData.cohorts || []).find((c) => c.id === selectedCohortId)
            : null;
        if (cohort) {
            syncDraftFromData(cohort);
        }
        renderAll();
    }

    function selectCohort(cohortId) {
        selectedCohortId = cohortId || null;
        persistSelectedCohortId();
        const appData = hooks && hooks.getAppData();
        const cohort = selectedCohortId && appData
            ? (appData.cohorts || []).find((c) => c.id === selectedCohortId)
            : null;
        if (cohort) {
            syncDraftFromData(cohort);
        } else {
            draftClassIds = new Set();
            catalogDirty = false;
        }
        renderAll();
    }

    global.CCPCohortManagement = {
        initTab,
        selectCohort,
        computeCohortStatus,
        buildSubjectSlotsFromMatrix,
        generateClassesForCohort,
        importFromClasses
    };
})(typeof window !== 'undefined' ? window : globalThis);
