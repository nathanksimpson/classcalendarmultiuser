/**
 * Cohort Management Area — admin setup for student groups, schedules, and subject class generation.
 */
(function (global) {
    let hooks = null;
    /** @type {string|null} */
    let selectedCohortId = null;
    /** @type {Set<string>} */
    let draftClassIds = new Set();
    let catalogDirty = false;

    const PATTERN_IDS = ['mwf', 'tth', 'mw', 'wf', 'mf', 'custom'];
    const DOW_LABELS = { en: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], ko: ['', '월', '화', '수', '목', '금'] };

    const SUBJECT_TRACK_LABELS = {
        phonics: { en: 'Phonics', ko: '파닉스' },
        handInHand: { en: 'Hand in Hand', ko: 'Hand in Hand' },
        spkWr: { en: 'Speaking & Writing', ko: '말하기 & 쓰기' },
        animation: { en: 'Animation', ko: '애니메이션' },
        reading: { en: 'Reading', ko: '리딩' },
        debate: { en: 'Debate', ko: '토론' },
        writeNow: { en: 'Write Now', ko: 'Write Now' },
        writeRight: { en: 'Write Right', ko: 'Write Right' }
    };

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function getTeamLockBlockedMessage() {
        if (hooks && typeof hooks.getTeamLockSaveBlockedMessage === 'function') {
            return hooks.getTeamLockSaveBlockedMessage();
        }
        return hooks && hooks.t ? hooks.t('teamNeedLockToSave') : '';
    }

    function showTeamLockBlockedMessage() {
        if (!hooks || !hooks.showMessage) {
            return;
        }
        hooks.showMessage(getTeamLockBlockedMessage(), true);
        if (typeof hooks.highlightTeamLockBar === 'function') {
            hooks.highlightTeamLockBar();
        }
    }

    function getLang() {
        try {
            if (hooks && hooks.getLang) {
                const lang = hooks.getLang();
                return lang === 'ko' ? 'ko' : 'en';
            }
        } catch (_err) {
            /* hooks.getLang may throw if app language state is unavailable */
        }
        return 'en';
    }

    function t(key) {
        return hooks ? hooks.t(key) : key;
    }

    function escapeHtml(s) {
        if (hooks && hooks.escapeHtml) {
            return hooks.escapeHtml(s);
        }
        if (typeof CCPUtils !== 'undefined' && CCPUtils.escapeHtml) {
            return CCPUtils.escapeHtml(s);
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

    function inferBlankCohortSchedulesIfNeeded(appData) {
        const api = getTimetableApi();
        if (!api || !api.inferBlankCohortSchedules) {
            return 0;
        }
        return api.inferBlankCohortSchedules(appData);
    }

    function getEffectiveCohortPattern(cohort, appData) {
        const api = getTimetableApi();
        if (api && api.getEffectiveCohortPattern) {
            return api.getEffectiveCohortPattern(cohort, appData);
        }
        const pat = normalizeStr(cohort.schedulePattern);
        if (pat === 'tth') {
            return 'tth';
        }
        return 'mwf';
    }

    function formatCohortPatternListMeta(cohort, appData) {
        const stored = normalizeStr(cohort.schedulePattern);
        const api = getTimetableApi();
        if (stored) {
            const inferred = api && api.getEffectiveCohortPattern
                ? api.getEffectiveCohortPattern(cohort, appData)
                : '';
            const bucket = api && api.patternBucketForFilter
                ? api.patternBucketForFilter(stored)
                : '';
            if (inferred && bucket && bucket !== stored && stored !== 'custom') {
                return stored.toUpperCase();
            }
            if (!stored && inferred) {
                return inferred.toUpperCase() + ' (' + t('cohortsPatternInferred') + ')';
            }
            return stored.toUpperCase();
        }
        const effective = getEffectiveCohortPattern(cohort, appData);
        if (effective) {
            return effective.toUpperCase() + ' (' + t('cohortsPatternInferred') + ')';
        }
        return '—';
    }

    const SCHEDULE_CHIP_MWF = 'M/W/F';
    const SCHEDULE_CHIP_TTH = 'T/T';
    const DOW_CHIP_LETTER = { 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F' };
    const COHORT_DAYS_SUFFIX_RE = /\s*(?:[-·]\s*)?days\s+[\d,\s]+$/i;

    function formatCohortDisplayTitle(cohort) {
        const raw = normalizeStr(cohort && cohort.name);
        if (!raw) {
            return '';
        }
        const stripped = raw.replace(COHORT_DAYS_SUFFIX_RE, '').replace(/\s*[-·]\s*$/, '').trim();
        return stripped || raw;
    }

    /**
     * Compact schedule label for cohort board title chip (M/W/F, T/T, or custom M/T/W).
     */
    function cohortMatchesSearchQuery(cohort, appData, query) {
        const q = normalizeStr(query).toLowerCase();
        if (!q || !cohort) {
            return true;
        }
        const scheduleChip = formatCohortScheduleChipLabel(cohort, appData);
        const displayTitle = formatCohortDisplayTitle(cohort);
        const hay = [
            cohort.name,
            displayTitle,
            cohortLevelDisplay(cohort),
            cohort.grade,
            cohort.schedulePattern,
            getEffectiveCohortPattern(cohort, appData),
            scheduleChip
        ]
            .join(' ')
            .toLowerCase();
        return hay.includes(q);
    }

    function formatCohortScheduleChipLabel(cohort, appData) {
        if (!cohort) {
            return '';
        }
        const api = getTimetableApi();
        const stored = normalizeStr(cohort.schedulePattern);
        if (api && api.patternBucketForFilter && stored) {
            const bucket = api.patternBucketForFilter(stored);
            if (bucket === 'tth') {
                return SCHEDULE_CHIP_TTH;
            }
            if (bucket === 'mwf') {
                return SCHEDULE_CHIP_MWF;
            }
        }
        const effective = getEffectiveCohortPattern(cohort, appData);
        if (effective === 'tth') {
            return SCHEDULE_CHIP_TTH;
        }
        const days = getCohortMeetingDays(cohort)
            .filter((d) => d >= 1 && d <= 5)
            .sort((a, b) => a - b);
        if (days.length === 3 && days[0] === 1 && days[1] === 3 && days[2] === 5) {
            return SCHEDULE_CHIP_MWF;
        }
        if (days.length === 2 && days[0] === 2 && days[1] === 4) {
            return SCHEDULE_CHIP_TTH;
        }
        if (days.length) {
            return days.map((d) => DOW_CHIP_LETTER[d] || '?').join('/');
        }
        if (effective === 'mwf' || !effective) {
            return SCHEDULE_CHIP_MWF;
        }
        return '';
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
        if (!matrix || !hooks || !hooks.generateId) {
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
        const entry = SUBJECT_TRACK_LABELS[track];
        if (!entry) {
            return track;
        }
        const lang = getLang();
        return entry[lang] || entry.en || track;
    }

    function formatCohortClassCountMeta(n) {
        const key = n === 1 ? 'setupBoardCohortClassCountOne' : 'setupBoardCohortClassCount';
        return t(key).replace('{n}', String(n));
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
        let text = t('cohortsSummaryStrip')
            .replace('{cohorts}', String(cohorts.length))
            .replace('{classes}', String(classes.length));
        if (unlinked > 0) {
            text += ' ' + t('cohortsSummaryUnlinked').replace('{n}', String(unlinked));
        }
        const api = getTimetableApi();
        if (api && api.findPossibleDuplicatePairsAcrossCohorts) {
            const dupPairs = api.findPossibleDuplicatePairsAcrossCohorts(appData);
            if (dupPairs.length) {
                text += ' ' + t('cohortsReviewDuplicates').replace('{n}', String(dupPairs.length));
            }
        }
        el.textContent = text;
        if (typeof hooks.onSummaryRendered === 'function') {
            hooks.onSummaryRendered();
        } else {
            el.hidden = false;
        }
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
        if (typeof global.CCPActiveContext !== 'undefined') {
            global.CCPActiveContext.set({ cohortId: selectedCohortId || '' }, { source: 'cohort-board' });
        }
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

    function sortCohortsForList(cohorts) {
        return cohorts.slice().sort((a, b) =>
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
            if (global.CCPClassColorTile) {
                chip.dataset.classId = classData.id;
                global.CCPClassColorTile.apply(chip, classData, { checked });
            }
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
            showTeamLockBlockedMessage();
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
        syncCohortLinksForIds(touchedCohortIds);
        catalogDirty = false;
        hooks.saveData();
        if (hooks.invalidateScheduleCache) {
            hooks.invalidateScheduleCache();
        }
        if (hooks.refreshClassEditorCohortUiIfOpen) {
            hooks.refreshClassEditorCohortUiIfOpen();
        } else if (hooks.populateClassCohortSelect) {
            hooks.populateClassCohortSelect();
        }
        hooks.showMessage(
            t('cohortsClassApplySummary').replace('{linked}', String(linked)).replace('{unlinked}', String(unlinked)),
            false
        );
        renderAll();
    }

    function syncCohortLinksForIds(cohortIdSet) {
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
                showTeamLockBlockedMessage();
                return;
            }
            persistCohortEditorChanges(cohort);
            hooks.showMessage(t('cohortsHomeroomSaved'), false);
        });
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'btn btn-outline btn-small';
        clearBtn.textContent = t('cohortsHomeroomClear');
        clearBtn.addEventListener('click', () => {
            if (hooks.isViewOnly && hooks.isViewOnly()) {
                showTeamLockBlockedMessage();
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
        const appData = hooks.getAppData();
        const linkApi = getTimetableApi();
        const classCount = linkApi
            ? linkApi.getCohortClassIds(appData, cohort).length
            : (cohort.classIds || []).length;

        const details = document.createElement('details');
        details.className = 'cohort-class-assignment-details';

        const summary = document.createElement('summary');
        summary.className = 'cohort-class-assignment-summary';
        summary.textContent = t('cohortsClassAssignmentSummary').replace('{n}', String(classCount));

        const inner = document.createElement('div');
        inner.className = 'cohort-class-assignment-inner';
        inner.innerHTML = `<p class="section-hint">${escapeHtml(t('cohortsClassAssignmentHint'))}</p>
            <p class="section-hint cohort-combined-callout">${escapeHtml(t('cohortsCombinedCallout'))}</p>`;

        const actions = document.createElement('div');
        actions.className = 'lesson-filter-actions cohort-class-catalog-actions cohort-class-catalog-compact-row';
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
            ['all', 'cohortsFilterAll'],
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
        search.className = 'module-list-search cohort-class-catalog-search field-control--compact';
        search.placeholder = t('classListSearchPlaceholder') || 'Search classes…';
        search.addEventListener('input', () => renderClassCatalog(cohort));
        toolbar.appendChild(search);

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

        inner.appendChild(actions);
        inner.appendChild(toolbar);
        inner.appendChild(body);
        inner.appendChild(applyRow);
        details.appendChild(summary);
        details.appendChild(inner);
        return details;
    }

    function cohortDisplayName(cohort) {
        return normalizeStr(cohort.name) || t('timetableAddCohort');
    }

    /** Read identity fields from the open editor DOM into appData (uses mount dataset, not selectedCohortId). */
    function flushCohortEditorFields() {
        if (!hooks) {
            return null;
        }
        const mount = document.getElementById('cohortsEditorMount');
        if (!mount || mount.hidden) {
            return null;
        }
        const cohortId = normalizeStr(mount.dataset.editorCohortId);
        if (!cohortId) {
            return null;
        }
        const appData = hooks.getAppData();
        const cohort = (appData.cohorts || []).find((c) => c.id === cohortId);
        if (!cohort) {
            return null;
        }
        const nameEl = mount.querySelector('.cohort-field-name');
        const levelEl = mount.querySelector('.cohort-field-level');
        const gradeEl = mount.querySelector('.cohort-field-grade');
        const blockEl = mount.querySelector('.cohort-field-block');
        if (nameEl) {
            const trimmed = nameEl.value.trim();
            cohort.name = trimmed || cohort.name;
        }
        if (levelEl) {
            cohort.levelPreset = levelEl.value;
            cohort.level = cohort.levelPreset;
        }
        if (gradeEl) {
            cohort.grade = gradeEl.value.trim();
        }
        if (blockEl) {
            cohort.scheduleBlock = blockEl.value;
        }
        return cohort;
    }

    /** Read homeroom fields from the open editor DOM into appData. */
    function flushHomeroomEditorFields() {
        if (!hooks) {
            return null;
        }
        const mount = document.getElementById('cohortsEditorMount');
        if (!mount || mount.hidden) {
            return null;
        }
        const cohortId = normalizeStr(mount.dataset.editorCohortId);
        if (!cohortId) {
            return null;
        }
        const appData = hooks.getAppData();
        const cohort = (appData.cohorts || []).find((c) => c.id === cohortId);
        if (!cohort) {
            return null;
        }
        const homeroomSel = mount.querySelector('.cohort-field-homeroom-select');
        const homeroomNameInput = mount.querySelector('.cohort-field-homeroom-name');
        const suffixInput = mount.querySelector('.cohort-field-suffix');
        if (homeroomSel && homeroomNameInput && suffixInput) {
            collectHomeroomFromUi(cohort, homeroomSel, homeroomNameInput, suffixInput);
        }
        return cohort;
    }

    function persistCohortEditorChanges(cohort) {
        if (!cohort || !hooks) {
            return false;
        }
        flushCohortEditorFields();
        flushHomeroomEditorFields();
        cohort.meetingDays = getCohortMeetingDays(cohort);
        hooks.syncClassCohortLinks(cohort);
        hooks.saveData();
        if (hooks.invalidateScheduleCache) {
            hooks.invalidateScheduleCache();
        }
        if (hooks.refreshClassEditorCohortUiIfOpen) {
            hooks.refreshClassEditorCohortUiIfOpen();
        } else if (hooks.populateClassCohortSelect) {
            hooks.populateClassCohortSelect();
        }
        persistSelectedCohortId();
        updateCohortEditorModalTitle(cohort);
        renderAll();
        return true;
    }

    function setCohortEditorToolbarVisible(visible) {
        const toolbar = document.getElementById('cohortEditorToolbar');
        if (!toolbar) {
            return;
        }
        toolbar.hidden = !visible;
    }

    function renderCohortEditorToolbar(cohort, appData) {
        const toolbar = document.getElementById('cohortEditorToolbar');
        if (!toolbar || !cohort || !hooks) {
            setCohortEditorToolbarVisible(false);
            return;
        }
        toolbar.innerHTML = '';
        setCohortEditorToolbarVisible(true);

        const ro = !!(hooks.isViewOnly && hooks.isViewOnly());

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-primary btn-small';
        saveBtn.textContent = t('timetableSaveCohort');
        saveBtn.disabled = ro;
        saveBtn.addEventListener('click', () => {
            if (ro) {
                showTeamLockBlockedMessage();
                return;
            }
            persistCohortEditorChanges(cohort);
            hooks.showMessage(t('timetableCohortSaved'), false);
        });

        const combineBtn = document.createElement('button');
        combineBtn.type = 'button';
        combineBtn.className = 'btn btn-outline btn-small';
        combineBtn.textContent = t('cohortsCombineBtn');
        combineBtn.disabled = ro;
        combineBtn.addEventListener('click', () => {
            if (ro) {
                showTeamLockBlockedMessage();
                return;
            }
            flushCohortEditorFields();
            openCombineCohortsModal(cohort);
        });

        const genBtn = document.createElement('button');
        genBtn.type = 'button';
        genBtn.className = 'btn btn-outline btn-small';
        genBtn.textContent = t('cohortsGenerateSubjects');
        genBtn.disabled = ro;
        genBtn.addEventListener('click', () => {
            if (ro) {
                showTeamLockBlockedMessage();
                return;
            }
            flushCohortEditorFields();
            const hasExisting = (cohort.subjectSlots || []).some((s) => s.classId);
            if (hasExisting && !global.confirm(t('cohortsRegenerateConfirm'))) {
                return;
            }
            cohort.meetingDays = getCohortMeetingDays(cohort);
            const result = generateClassesForCohort(cohort, { overwrite: hasExisting });
            hooks.saveData();
            hooks.invalidateScheduleCache();
            if (hooks.refreshClassEditorCohortUiIfOpen) {
            hooks.refreshClassEditorCohortUiIfOpen();
        } else if (hooks.populateClassCohortSelect) {
            hooks.populateClassCohortSelect();
        }
            let msg = t('cohortsGenerateDone').replace('{created}', String(result.created)).replace('{updated}', String(result.updated));
            const ttApi = getTimetableApi();
            if (ttApi && ttApi.findPossibleDuplicatePairsAcrossCohorts) {
                const dupCount = ttApi.findPossibleDuplicatePairsAcrossCohorts(hooks.getAppData()).length;
                if (dupCount > 0) {
                    msg += ' ' + t('cohortsReviewDuplicates').replace('{n}', String(dupCount));
                }
            }
            hooks.showMessage(msg, false);
            updateCohortEditorModalTitle(cohort);
            renderAll();
        });

        const dupBtn = document.createElement('button');
        dupBtn.type = 'button';
        dupBtn.className = 'btn btn-outline btn-small';
        dupBtn.textContent = t('cohortsDuplicate');
        dupBtn.disabled = ro;
        dupBtn.addEventListener('click', () => {
            if (ro) {
                showTeamLockBlockedMessage();
                return;
            }
            flushCohortEditorFields();
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
            persistSelectedCohortId();
            hooks.saveData();
            renderAll();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-danger btn-small';
        deleteBtn.textContent = t('cohortsDeleteBtn');
        deleteBtn.disabled = ro;
        deleteBtn.addEventListener('click', () => deleteCohort(cohort));

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

        const moreMenu = document.createElement('details');
        moreMenu.className = 'header-dropdown cohort-editor-more-menu';
        const moreSummary = document.createElement('summary');
        moreSummary.className = 'btn btn-outline btn-small header-dropdown-trigger';
        moreSummary.textContent = t('cohortsEditorMore');
        const morePanel = document.createElement('div');
        morePanel.className = 'header-dropdown-panel cohort-editor-more-panel';
        [dupBtn, teachersBtn, ttBtn].forEach((btn) => {
            btn.classList.add('header-dropdown-item');
            morePanel.appendChild(btn);
        });
        moreMenu.appendChild(moreSummary);
        moreMenu.appendChild(morePanel);

        toolbar.appendChild(saveBtn);
        toolbar.appendChild(combineBtn);
        toolbar.appendChild(genBtn);
        toolbar.appendChild(deleteBtn);
        toolbar.appendChild(moreMenu);
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
            showTeamLockBlockedMessage();
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
        if (hooks.refreshClassEditorCohortUiIfOpen) {
            hooks.refreshClassEditorCohortUiIfOpen();
        } else if (hooks.populateClassCohortSelect) {
            hooks.populateClassCohortSelect();
        }
        hooks.showMessage(t('cohortsDeleted').replace('{name}', cohortDisplayName(cohort)), false);
        closeCohortEditor();
        renderAll();
    }

    function getCohortEditorModal() {
        return document.getElementById('cohortEditorModal');
    }

    function updateCohortEditorModalTitle(cohort) {
        const titleEl = document.getElementById('cohortEditorModalTitle');
        if (!titleEl) {
            return;
        }
        if (cohort) {
            const name = cohortDisplayName(cohort);
            titleEl.textContent = name === t('timetableAddCohort')
                ? t('cohortEditorModalTitleNew')
                : t('cohortEditorModalTitle').replace('{name}', name);
        } else {
            titleEl.textContent = t('cohortEditorModalTitleNew');
        }
    }

    function openCohortEditor() {
        const modal = getCohortEditorModal();
        if (!modal || !hooks) {
            return;
        }
        const appData = hooks.getAppData();
        const cohort = selectedCohortId
            ? (appData.cohorts || []).find((c) => c.id === selectedCohortId)
            : null;
        if (!cohort) {
            return;
        }
        renderEditor();
        updateCohortEditorModalTitle(cohort);
        if (hooks.openModal) {
            hooks.openModal(modal);
        } else {
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
        }
    }

    function closeCohortEditor() {
        flushCohortEditorFields();
        flushHomeroomEditorFields();
        const modal = getCohortEditorModal();
        if (!modal) {
            return;
        }
        if (hooks && hooks.closeModal) {
            hooks.closeModal(modal);
        } else {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        }
    }

    function buildCohortSummaryStrip(cohort, appData) {
        const status = computeCohortStatus(cohort, appData);
        const api = getTimetableApi();
        const classCount = api ? api.getCohortClassIds(appData, cohort).length : (cohort.classIds || []).length;
        const hr = normalizeStr(cohort.homeroomTeacherName) || normalizeStr(cohort.homeroomTeacherUserId);
        const wrap = document.createElement('div');
        wrap.className = 'cohort-editor-summary';
        const draftHint = status === 'draft'
            ? `<p class="cohort-editor-draft-hint section-hint">${escapeHtml(t('cohortsDraftEditHint'))}</p>`
            : '';
        wrap.innerHTML = `
            <div class="cohort-editor-summary-title">
                <strong>${escapeHtml(cohortDisplayName(cohort))}</strong>
                <span class="cohort-status-chip cohort-status-chip--${statusClass(status)}">${escapeHtml(statusLabel(status))}</span>
            </div>
            ${draftHint}
            <p class="cohort-editor-summary-meta">${escapeHtml(
                [
                    cohortLevelDisplay(cohort),
                    cohort.grade,
                    formatCohortPatternListMeta(cohort, appData),
                    t('cohortsSummaryClassCount').replace('{n}', String(classCount)),
                    hr ? `${t('timetableHomeroomLabel')}: ${hr}` : t('cohortsNoHomeroom')
                ].filter(Boolean).join(' · ')
            )}</p>`;
        return wrap;
    }

    function syncCohortsToolbarActionBtns() {
        if (!hooks) {
            return;
        }
        const appData = hooks.getAppData();
        const cohort = selectedCohortId
            ? (appData.cohorts || []).find((c) => c.id === selectedCohortId)
            : null;
        const ro = !!(hooks.isViewOnly && hooks.isViewOnly());

        const editBtn = document.getElementById('cohortsEditBtn');
        if (editBtn) {
            editBtn.hidden = !cohort;
            editBtn.disabled = ro || !cohort;
            editBtn.title = editBtn.disabled && ro ? getTeamLockBlockedMessage() : '';
            if (!editBtn.dataset.cohortsEditBound) {
                editBtn.dataset.cohortsEditBound = '1';
                editBtn.addEventListener('click', () => {
                    if (selectedCohortId) {
                        openCohortEditor();
                    }
                });
            }
        }

        const contextualRow = document.getElementById('cohortsContextualActions');
        if (contextualRow) {
            contextualRow.hidden = !cohort;
        }

        const deleteBtn = document.getElementById('cohortsDeleteBtn');
        if (!deleteBtn) {
            return;
        }
        deleteBtn.hidden = !cohort;
        deleteBtn.disabled = ro;
        deleteBtn.title = deleteBtn.disabled ? getTeamLockBlockedMessage() : '';
        if (!deleteBtn.dataset.cohortsDeleteBound) {
            deleteBtn.dataset.cohortsDeleteBound = '1';
            deleteBtn.addEventListener('click', () => {
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

    function renderCohortList() {
        const list = document.getElementById('cohortsList');
        if (!list || !hooks) {
            return;
        }
        const appData = hooks.getAppData();
        inferBlankCohortSchedulesIfNeeded(appData);
        const q = normalizeStr(document.getElementById('cohortsListSearch')?.value).toLowerCase();
        const allCohorts = appData.cohorts || [];
        list.innerHTML = '';
        let cohorts = sortCohortsForList(allCohorts.slice());
        cohorts = cohorts.filter((cohort) => cohortMatchesSearchQuery(cohort, appData, q));
        if (!cohorts.length) {
            const empty = document.createElement('p');
            empty.className = 'module-list-empty';
            if (q) {
                empty.textContent = t('lessonFilterSearchEmpty');
            } else {
                empty.textContent = t('timetableCohortsEmpty');
            }
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
            const pat = formatCohortPatternListMeta(cohort, appData);
            btn.innerHTML = `<span>${escapeHtml(cohort.name || t('timetableAddCohort'))}<span class="cohort-status-chip cohort-status-chip--${statusClass(status)}">${escapeHtml(statusLabel(status))}</span></span><span class="cohort-list-item-meta">${escapeHtml([cohortLevelDisplay(cohort), cohort.grade, pat, formatCohortClassCountMeta(classCount)].filter(Boolean).join(' · '))}</span>`;
            btn.addEventListener('click', () => {
                selectCohort(cohort.id);
                if (global.CCPSetupBoard && global.CCPSetupBoard.scrollToCohort) {
                    global.CCPSetupBoard.scrollToCohort(cohort.id);
                }
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
        const classIds = catalogDirty
            ? Array.from(draftClassIds)
            : (api ? api.getCohortClassIds(appData, cohort) : (cohort.classIds || []));
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
                hooks.navigateToTab('classes', { classId: cls.id, host: 'setup' });
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
        flushCohortEditorFields();
        const appData = hooks.getAppData();
        const cohort = selectedCohortId
            ? (appData.cohorts || []).find((c) => c.id === selectedCohortId)
            : null;
        if (!cohort) {
            mount.hidden = true;
            mount.removeAttribute('data-editor-cohort-id');
            empty.hidden = false;
            setCohortEditorToolbarVisible(false);
            const toolbar = document.getElementById('cohortEditorToolbar');
            if (toolbar) {
                toolbar.innerHTML = '';
            }
            renderLinkedPanel(null);
            return;
        }
        empty.hidden = true;
        mount.hidden = false;
        mount.innerHTML = '';
        mount.dataset.editorCohortId = cohort.id;
        renderCohortEditorToolbar(cohort, appData);

        if (!catalogDirty) {
            syncDraftFromData(cohort);
        }
        mount.appendChild(buildCohortSummaryStrip(cohort, appData));

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

        mount.appendChild(identity);
        mount.appendChild(schedule);
        mount.appendChild(subjects);
        mount.appendChild(buildClassAssignmentSection(cohort));
        const homeroom = buildHomeroomSection(cohort);
        mount.appendChild(homeroom.section);
        const linkedSection = document.createElement('section');
        linkedSection.className = 'cohort-linked-section';
        linkedSection.innerHTML = `<h3 class="form-section-title">${escapeHtml(t('cohortsLinkedHeading'))}</h3><div id="cohortsLinkedList" class="cohort-linked-list"></div>`;
        mount.appendChild(linkedSection);

        renderClassCatalog(cohort);
        updateClassApplyButtonState();
        renderLinkedPanel(cohort);

        if (global.__ccpFocusCohortName) {
            global.__ccpFocusCohortName = false;
            const nameEl = mount.querySelector('.cohort-field-name');
            if (nameEl) {
                nameEl.focus();
                const scrollHost = document.querySelector('#cohortEditorModal .modal-body-scroll');
                if (scrollHost) {
                    scrollHost.scrollTop = 0;
                }
            }
        }
    }

    function onBoardChanged() {
        const appData = hooks.getAppData();
        const cohort = selectedCohortId
            ? (appData.cohorts || []).find((c) => c.id === selectedCohortId)
            : null;
        if (cohort) {
            catalogDirty = false;
            syncDraftFromData(cohort);
        }
        renderSummary();
        renderCohortList();
        renderEditor();
    }

    function renderAll() {
        renderSummary();
        renderCohortList();
        syncCohortsToolbarActionBtns();
        renderEditor();
        if (global.CCPSetupBoard && global.CCPSetupBoard.renderBoard && global.CCPSetupBoard.isReady()) {
            global.CCPSetupBoard.renderBoard();
        }
        const scopeHint = document.getElementById('cohortsCalendarExclusivityHint');
        if (scopeHint) {
            scopeHint.textContent = t('timetableCohortsScopeHint');
            scopeHint.hidden = false;
        }
        const calName = document.getElementById('cohortsTabCalendarName');
        if (calName && hooks.getCalendarName) {
            const name = hooks.getCalendarName();
            if (name) {
                calName.hidden = false;
                calName.textContent = `${t('dataCalendarNameLabel')}: ${name}`;
            } else {
                calName.hidden = true;
                calName.textContent = '';
            }
        }
    }

    function addCohort() {
        const appData = hooks.getAppData();
        if (!Array.isArray(appData.cohorts)) {
            appData.cohorts = [];
        }
        const defaultPattern = global.CCPSetupBoard && global.CCPSetupBoard.getDefaultSchedulePatternForNewCohort
            ? global.CCPSetupBoard.getDefaultSchedulePatternForNewCohort()
            : 'mwf';
        const defaultDays = defaultPattern === 'tth' ? [2, 4] : [1, 3, 5];
        const cohort = {
            id: hooks.generateId(),
            name: '',
            level: '',
            levelPreset: '',
            grade: '',
            schedulePattern: defaultPattern,
            meetingDays: defaultDays.slice(),
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
        if (global.CCPSetupBoard && global.CCPSetupBoard.setActiveBoardView) {
            global.CCPSetupBoard.setActiveBoardView(defaultPattern === 'tth' ? 'tth' : 'mwf');
        }
        global.__ccpFocusCohortName = true;
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
                    const cls = (appData.classes || []).find((c) => c.id === classId);
                    if (cls) {
                        api.addClassCohortId(cls, existing.id);
                    }
                });
                hooks.syncClassCohortLinks(existing);
                if (api.syncCohortScheduleFromLinkedClasses) {
                    api.syncCohortScheduleFromLinkedClasses(existing, appData, { force: true });
                }
                return;
            }
            const sched = api.inferCohortScheduleFromMeetingDays
                ? api.inferCohortScheduleFromMeetingDays(sug.meetingDays)
                : { schedulePattern: 'mwf', meetingDays: sug.meetingDays || [1, 3, 5] };
            const cohort = {
                id: hooks.generateId(),
                name: sug.name,
                level: sug.level,
                levelPreset: sug.levelPreset || sug.level,
                grade: sug.grade,
                schedulePattern: sched.schedulePattern,
                meetingDays: sched.meetingDays.slice(),
                classIds: sug.classIds.slice(),
                subjectSlots: [],
                homeroomTeacherUserId: '',
                homeroomTeacherName: '',
                homeroomDaySuffix: api.inferHomeroomDaySuffix(sug, {})
            };
            appData.cohorts.push(cohort);
            sug.classIds.forEach((classId) => {
                const cls = (appData.classes || []).find((c) => c.id === classId);
                if (cls) {
                    api.addClassCohortId(cls, cohort.id);
                }
            });
            hooks.syncClassCohortLinks(cohort);
            added += 1;
        });
        (appData.cohorts || []).forEach((c) => hooks.syncClassCohortLinks(c));
        hooks.saveData();
        if (hooks.refreshClassEditorCohortUiIfOpen) {
            hooks.refreshClassEditorCohortUiIfOpen();
        } else if (hooks.populateClassCohortSelect) {
            hooks.populateClassCohortSelect();
        }
        hooks.showMessage(t('timetableCohortsSuggested').replace('{n}', String(added)), false);
        renderAll();
    }

    let combineModalEl = null;

    function ensureCombineModal() {
        if (combineModalEl) {
            return combineModalEl;
        }
        const wrap = document.createElement('div');
        wrap.id = 'cohortsCombineModal';
        wrap.className = 'modal';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.innerHTML = `
            <div class="modal-content modal-small">
                <div class="modal-header">
                    <h2 id="cohortsCombineModalTitle"></h2>
                    <button type="button" class="modal-close" id="cohortsCombineModalClose" data-i18n-aria-label="closeAria" aria-label="Close">&times;</button>
                </div>
                <div class="cohorts-combine-body"></div>
                <div class="form-actions">
                    <button type="button" class="btn btn-outline" id="cohortsCombineCancel"></button>
                    <button type="button" class="btn btn-primary" id="cohortsCombineApply"></button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
        wrap.querySelector('#cohortsCombineModalClose').addEventListener('click', () => closeCombineModal());
        wrap.querySelector('#cohortsCombineCancel').addEventListener('click', () => closeCombineModal());
        wrap.addEventListener('click', (e) => {
            if (e.target === wrap) {
                closeCombineModal();
            }
        });
        combineModalEl = wrap;
        return wrap;
    }

    function closeCombineModal() {
        const el = combineModalEl || document.getElementById('cohortsCombineModal');
        if (el) {
            el.classList.remove('active', 'is-open');
            el.hidden = true;
            el.setAttribute('aria-hidden', 'true');
        }
        if (hooks && hooks.closeModal) {
            hooks.closeModal(el);
        }
    }

    function openCombineCohortsModal(cohortA) {
        const api = getTimetableApi();
        if (!api || !cohortA || !hooks) {
            return;
        }
        const modal = ensureCombineModal();
        const appData = hooks.getAppData();
        const titleEl = modal.querySelector('#cohortsCombineModalTitle');
        const body = modal.querySelector('.cohorts-combine-body');
        const applyBtn = modal.querySelector('#cohortsCombineApply');
        const cancelBtn = modal.querySelector('#cohortsCombineCancel');
        if (titleEl) {
            titleEl.textContent = t('cohortsCombineTitle');
        }
        if (cancelBtn) {
            cancelBtn.textContent = t('cancel') || 'Cancel';
        }
        if (applyBtn) {
            applyBtn.textContent = t('cohortsCombineApply');
        }
        body.innerHTML = '';

        const withLabel = document.createElement('label');
        withLabel.className = 'form-group';
        withLabel.innerHTML = `<span>${escapeHtml(t('cohortsCombineWith'))}</span>`;
        const withSel = document.createElement('select');
        withSel.className = 'field-select cohort-combine-with-select';
        const optPh = document.createElement('option');
        optPh.value = '';
        optPh.textContent = '—';
        withSel.appendChild(optPh);
        (appData.cohorts || []).forEach((c) => {
            if (!c || c.id === cohortA.id) {
                return;
            }
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name || c.id;
            withSel.appendChild(opt);
        });
        withLabel.appendChild(withSel);
        body.appendChild(withLabel);

        const pairSection = document.createElement('div');
        pairSection.className = 'cohorts-combine-pairs';
        body.appendChild(pairSection);

        const optionsSection = document.createElement('div');
        optionsSection.className = 'cohorts-combine-options';
        body.appendChild(optionsSection);

        let selectedPairIndex = 0;
        let pairs = [];

        function defaultRenameLabel(otherCohort, classData) {
            const aName = cohortDisplayName(cohortA);
            const bName = cohortDisplayName(otherCohort);
            const subject = normalizeStr(classData.name).replace(/^[^·]+·\s*/i, '').trim()
                || normalizeStr(classData.name);
            return `${aName} + ${bName} · ${subject}`;
        }

        function renderPairUi() {
            pairSection.innerHTML = '';
            optionsSection.innerHTML = '';
            const cohortBId = withSel.value;
            if (!cohortBId) {
                pairSection.innerHTML = `<p class="section-hint">${escapeHtml(t('cohortsCombineWith'))}</p>`;
                applyBtn.disabled = true;
                return;
            }
            const cohortB = (appData.cohorts || []).find((c) => c.id === cohortBId);
            pairs = api.findDuplicateClassPairsForCohorts(appData, cohortA.id, cohortBId);
            if (!pairs.length) {
                pairSection.innerHTML = `<p class="section-hint">${escapeHtml(t('cohortsCombineNoPairs'))}</p>`;
                applyBtn.disabled = true;
                return;
            }
            applyBtn.disabled = false;
            const pairLabel = document.createElement('p');
            pairLabel.className = 'section-hint';
            pairLabel.textContent = t('cohortsCombinePickPair');
            pairSection.appendChild(pairLabel);
            pairs.forEach((pair, idx) => {
                const row = document.createElement('label');
                row.className = 'checkbox-label selection-chip cohort-combine-pair-chip';
                const nameA = pair.classA.name || pair.classA.id;
                const nameB = pair.classB.name || pair.classB.id;
                row.innerHTML = `<input type="radio" name="cohortCombinePair" value="${idx}" ${idx === selectedPairIndex ? 'checked' : ''}>
                    <span><strong>${escapeHtml(nameA)}</strong> + <strong>${escapeHtml(nameB)}</strong></span>`;
                row.querySelector('input').addEventListener('change', () => {
                    selectedPairIndex = idx;
                    renderKeeperOptions();
                });
                pairSection.appendChild(row);
            });

            function renderKeeperOptions() {
                const pair = pairs[selectedPairIndex];
                if (!pair) {
                    return;
                }
                optionsSection.innerHTML = '';
                const keeperFieldset = document.createElement('fieldset');
                keeperFieldset.className = 'cohorts-combine-keeper';
                const leg = document.createElement('legend');
                leg.textContent = t('cohortsCombinePickPair');
                keeperFieldset.appendChild(leg);
                [
                    ['a', t('cohortsCombineKeeperA'), pair.classA.id],
                    ['b', t('cohortsCombineKeeperB'), pair.classB.id]
                ].forEach(([val, label, id], i) => {
                    const lab = document.createElement('label');
                    lab.className = 'checkbox-label selection-chip';
                    lab.innerHTML = `<input type="radio" name="cohortCombineKeeper" value="${val}" ${i === 0 ? 'checked' : ''}>
                        <span>${escapeHtml(label)}: ${escapeHtml(val === 'a' ? pair.classA.name : pair.classB.name)}</span>`;
                    keeperFieldset.appendChild(lab);
                });
                optionsSection.appendChild(keeperFieldset);

                const delLab = document.createElement('label');
                delLab.className = 'checkbox-label selection-chip';
                delLab.innerHTML = `<input type="checkbox" id="cohortCombineDeleteDup" checked>
                    <span>${escapeHtml(t('cohortsCombineDeleteDuplicate'))}</span>`;
                optionsSection.appendChild(delLab);

                const renameLab = document.createElement('label');
                renameLab.className = 'form-group';
                renameLab.innerHTML = `<span>${escapeHtml(t('cohortsCombineRename'))}</span>`;
                const renameInput = document.createElement('input');
                renameInput.type = 'text';
                renameInput.className = 'field-input cohort-combine-rename';
                renameInput.value = defaultRenameLabel(cohortB, pair.classA);
                renameLab.appendChild(renameInput);
                optionsSection.appendChild(renameLab);
            }
            renderKeeperOptions();
        }

        withSel.addEventListener('change', () => {
            selectedPairIndex = 0;
            renderPairUi();
        });
        renderPairUi();

        applyBtn.onclick = () => {
            if (hooks.isViewOnly && hooks.isViewOnly()) {
                showTeamLockBlockedMessage();
                return;
            }
            const cohortBId = withSel.value;
            if (!cohortBId || !pairs.length) {
                return;
            }
            const pair = pairs[selectedPairIndex];
            if (!pair) {
                return;
            }
            const keeperChoice = optionsSection.querySelector('input[name="cohortCombineKeeper"]:checked');
            const keeperId = keeperChoice && keeperChoice.value === 'b' ? pair.classB.id : pair.classA.id;
            const duplicateId = keeperId === pair.classA.id ? pair.classB.id : pair.classA.id;
            const deleteDup = optionsSection.querySelector('#cohortCombineDeleteDup')?.checked === true;
            const renameInput = optionsSection.querySelector('.cohort-combine-rename');
            const renameLabel = renameInput ? renameInput.value.trim() : '';
            api.combineCohortClassPair(appData, keeperId, duplicateId, cohortA.id, cohortBId, {
                deleteDuplicate: false,
                renameKeeper: Boolean(renameLabel),
                renameLabel
            });
            if (deleteDup && hooks.deleteClassById) {
                hooks.deleteClassById(duplicateId);
            } else if (deleteDup) {
                const idx = (appData.classes || []).findIndex((c) => c.id === duplicateId);
                if (idx >= 0) {
                    appData.classes.splice(idx, 1);
                }
            }
            if (hooks.syncAllClassCohortLinks) {
                hooks.syncAllClassCohortLinks();
            } else {
                hooks.syncClassCohortLinks(cohortA);
                const cohortB = (appData.cohorts || []).find((c) => c.id === cohortBId);
                if (cohortB) {
                    hooks.syncClassCohortLinks(cohortB);
                }
            }
            hooks.saveData();
            if (hooks.invalidateScheduleCache) {
                hooks.invalidateScheduleCache();
            }
            if (hooks.refreshClassEditorCohortUiIfOpen) {
                hooks.refreshClassEditorCohortUiIfOpen();
            }
            hooks.showMessage(t('cohortsCombineDone').replace('{n}', '1'), false);
            closeCombineModal();
            renderAll();
        };

        modal.hidden = false;
        if (hooks.openModal) {
            hooks.openModal(modal);
        } else {
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
        }
    }

    function bindOnce() {
        if (document.body.dataset.cohortsTabBound === '1') {
            return;
        }
        document.body.dataset.cohortsTabBound = '1';
        document.getElementById('cohortsAddBtn')?.addEventListener('click', () => addCohort());
        document.getElementById('cohortsImportBtn')?.addEventListener('click', () => importFromClasses());
        document.getElementById('cohortsListSearch')?.addEventListener('input', () => {
            renderCohortList();
            if (global.CCPSetupBoard && global.CCPSetupBoard.renderBoard) {
                global.CCPSetupBoard.renderBoard();
            }
        });
        document.getElementById('closeCohortEditorModal')?.addEventListener('click', () => closeCohortEditor());
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
        const inferred = inferBlankCohortSchedulesIfNeeded(appData);
        if (inferred > 0) {
            hooks.saveData();
        }
        const cohort = selectedCohortId
            ? (appData.cohorts || []).find((c) => c.id === selectedCohortId)
            : null;
        if (cohort) {
            syncDraftFromData(cohort);
        }
        renderAll();
    }

    function setCohortNameFromBoard(cohortId, name) {
        if (!hooks) {
            return false;
        }
        flushCohortEditorFields();
        const appData = hooks.getAppData();
        const cohort = (appData.cohorts || []).find((c) => c && c.id === cohortId);
        if (!cohort) {
            return false;
        }
        const trimmed = normalizeStr(name);
        if (trimmed) {
            cohort.name = trimmed;
        }
        if (hooks.saveData) {
            hooks.saveData();
        }
        if (selectedCohortId === cohortId) {
            syncDraftFromData(cohort);
        }
        renderSummary();
        syncCohortsToolbarActionBtns();
        if (global.CCPSetupBoard && global.CCPSetupBoard.renderBoard) {
            global.CCPSetupBoard.renderBoard();
        }
        const mount = document.getElementById('cohortsEditorMount');
        if (mount && !mount.hidden && normalizeStr(mount.dataset.editorCohortId) === cohortId) {
            renderEditor();
        }
        return true;
    }

    function selectCohort(cohortId) {
        flushCohortEditorFields();
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
            closeCohortEditor();
        }
        renderAll();
    }

    global.CCPCohortManagement = {
        initTab,
        selectCohort,
        openCohortEditor,
        onBoardChanged,
        computeCohortStatus,
        statusLabel,
        getCohortMeetingDays,
        getEffectiveCohortPattern,
        formatCohortScheduleChipLabel,
        formatCohortDisplayTitle,
        cohortMatchesSearchQuery,
        setCohortNameFromBoard,
        buildSubjectSlotsFromMatrix,
        generateClassesForCohort,
        importFromClasses,
        inferBlankCohortSchedulesIfNeeded
    };
})(typeof window !== 'undefined' ? window : globalThis);
