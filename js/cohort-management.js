/**
 * Cohort Management Area — admin setup for student groups, schedules, and subject class generation.
 */
(function (global) {
    /** Class/cohort name with its level in the UI language (display only). */
    function displayName(name) {
        const lp = global.CCPLevelProfile;
        return lp && lp.localizeClassName ? lp.localizeClassName(name) : name == null ? '' : String(name);
    }

    let hooks = null;
    /** @type {string|null} */
    let selectedCohortId = null;
    /** @type {Set<string>} */
    let draftClassIds = new Set();
    let catalogDirty = false;
    /** Cohort whose "Link classes" section is expanded in the editor. */
    let classAssignmentOpenForCohortId = '';

    const PATTERN_IDS = ['mwf', 'tth', 'mon', 'mw', 'wf', 'mf', 'custom'];
    const DOW_LABELS = { en: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'], ko: ['', '월', '화', '수', '목', '금'] };

    const SUBJECT_TRACK_LABELS = {
        phonics: { en: 'Phonics', ko: '파닉스' },
        handInHand: { en: 'Hand in Hand', ko: 'Hand in Hand' },
        spkWr: { en: 'Speaking & Writing', ko: '말하기 & 쓰기' },
        animation: { en: 'Animation', ko: '애니메이션' },
        reading: { en: 'Reading', ko: '리딩' },
        debate: { en: 'Debate', ko: '토론' },
        writeNow: { en: 'Write Now', ko: 'Write Now' },
        writeRight: { en: 'Write Right', ko: 'Write Right' },
        news: { en: 'News', ko: '뉴스' },
        newsLc: { en: 'News (LC)', ko: '뉴스 (LC)' },
        ipkV: { en: 'Reading (V)', ko: '리딩 (V)' },
        ipeNative: { en: 'IPE', ko: 'IPE' },
        grammar: { en: 'Grammar', ko: '문법' },
        toeflRc: { en: 'TOEFL RC (V)', ko: 'TOEFL RC (V)' },
        rc: { en: 'RC', ko: 'RC' },
        lc: { en: 'LC', ko: 'LC' },
        voca: { en: 'Vocabulary', ko: '어휘' },
        rc2: { en: 'RC 2', ko: 'RC 2' },
        mentoring: { en: 'Mentoring', ko: '멘토링' }
    };

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function getCalmPalette() {
        if (global.CCPClassColorPalette && Array.isArray(global.CCPClassColorPalette.CALM_PALETTE)) {
            return global.CCPClassColorPalette.CALM_PALETTE;
        }
        return ['#356a9e', '#2f6fb0', '#2e9d5e', '#1f9d4d', '#36a06a', '#6f54a8',
            '#df641d', '#dd8a57', '#c96b8e', '#cfa23a', '#2e8b8b', '#5a6a80'];
    }

    function getDefaultAccent() {
        if (global.CCPClassColorTile && global.CCPClassColorTile.DEFAULT_ACCENT) {
            return global.CCPClassColorTile.DEFAULT_ACCENT;
        }
        return getCalmPalette()[0];
    }

    /** Next palette color for a new cohort (rotates by existing cohort count). */
    function getNextCohortColor(appData) {
        if (hooks && typeof hooks.getNextColor === 'function') {
            return hooks.getNextColor();
        }
        const palette = getCalmPalette();
        const n = (appData && Array.isArray(appData.cohorts) ? appData.cohorts.length : 0);
        return palette[n % palette.length] || getDefaultAccent();
    }

    function deriveTextColorForClass(hex) {
        if (hooks && typeof hooks.deriveClassTextColorForSave === 'function') {
            return hooks.deriveClassTextColorForSave(hex);
        }
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return isDark ? '#dde6f1' : '#243244';
    }

    /**
     * Assign missing cohort.color values from the calm palette (deterministic by list order).
     * @returns {boolean} true if any cohort was updated
     */
    function normalizeCohortColors(appData) {
        if (!appData || !Array.isArray(appData.cohorts)) {
            return false;
        }
        const palette = getCalmPalette();
        let dirty = false;
        let assignIndex = 0;
        appData.cohorts.forEach((cohort) => {
            if (!cohort || cohort.isArchiveCohort) {
                return;
            }
            if (normalizeStr(cohort.color)) {
                return;
            }
            cohort.color = palette[assignIndex % palette.length] || getDefaultAccent();
            assignIndex += 1;
            dirty = true;
        });
        return dirty;
    }

    function ensureCohortHasColor(cohort, appData) {
        if (!cohort) {
            return getDefaultAccent();
        }
        if (!normalizeStr(cohort.color)) {
            cohort.color = getNextCohortColor(appData || (hooks && hooks.getAppData ? hooks.getAppData() : null));
        }
        return cohort.color;
    }

    function classHasAnyCohortLink(classData) {
        if (!classData) {
            return false;
        }
        const api = getTimetableApi();
        if (api && api.getClassCohortIds) {
            return api.getClassCohortIds(classData).length > 0;
        }
        return !!(normalizeStr(classData.cohortId)
            || (Array.isArray(classData.cohortIds) && classData.cohortIds.some((id) => normalizeStr(id))));
    }

    /**
     * Inherit cohort parent color onto a class at first cohort assignment only.
     * Manual class colors and already-cohorted classes are left alone.
     */
    function inheritCohortColorOntoClass(classData, cohort, options) {
        const opts = options || {};
        if (!classData || !cohort) {
            return false;
        }
        if (!opts.force && classHasAnyCohortLink(classData) && !opts.wasUncohorted) {
            return false;
        }
        if (!opts.force && normalizeStr(classData.color)) {
            return false;
        }
        const accent = ensureCohortHasColor(cohort);
        classData.color = accent;
        classData.textColor = deriveTextColorForClass(accent);
        return true;
    }

    function refreshCohortColorPaletteUi(mount, selectedHex, previewLabel) {
        if (!mount || typeof global.CCPClassColorPalette === 'undefined') {
            return;
        }
        const grid = mount.querySelector('.cohort-color-palette-grid');
        const preview = mount.querySelector('.cohort-color-preview-host');
        const hidden = mount.querySelector('.cohort-field-color');
        if (!grid) {
            return;
        }
        const hex = selectedHex || (hidden && hidden.value) || getDefaultAccent();
        if (hidden) {
            hidden.value = hex;
        }
        global.CCPClassColorPalette.renderGrid(grid, hex, (picked) => {
            if (hidden) {
                hidden.value = picked;
            }
            refreshCohortColorPaletteUi(mount, picked, previewLabel);
        });
        if (preview) {
            global.CCPClassColorPalette.renderPreviewRow(preview, hex, previewLabel || 'Preview');
        }
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

    function matrixSlotForLevel(level) {
        const data = global.CCPScheduleMatrixData;
        if (!level || !data || !Array.isArray(data.slots)) {
            return null;
        }
        return data.slots.find((s) => s.level === level) || null;
    }

    /**
     * The level the schedule matrix knows this cohort by: its level setting, else its name
     * (TMS cohorts often arrive with only a name, e.g. "빅키T^2612", "Blue M", "S1T").
     */
    function resolveMatrixLevel(cohort) {
        const tries = [normalizeStr(cohort.levelPreset), normalizeStr(cohort.level), cohortLevelDisplay(cohort)];
        const lp = global.CCPLevelProfile;
        const bareName = normalizeStr(cohort.name).replace(/[\^_].*$/, '').trim();
        if (lp && lp.parseClassName) {
            tries.slice().forEach((v) => {
                const parsed = v ? lp.parseClassName(v) : null;
                if (parsed && !parsed.pre) {
                    tries.push(parsed.baseId);
                }
            });
            const fromName = lp.parseClassName(cohort.name);
            if (fromName && !fromName.pre) {
                tries.push(fromName.baseId);
            }
        }
        // Middle-school Pre-Basic cohorts are named S1, S2, S3 (중1–중3).
        const pre = /^S\s*([123])\s*[MT]?$/i.exec(bareName);
        if (pre) {
            tries.push('S' + pre[1]);
        }
        const hit = tries.find((v) => matrixSlotForLevel(v));
        if (hit) {
            return hit;
        }
        return cohortLevelDisplay(cohort);
    }

    function resolveMatrixPatternId(cohort) {
        const pid = normalizeStr(cohort.schedulePattern);
        if (pid && pid !== 'custom') {
            return pid;
        }
        const days = Array.isArray(cohort.meetingDays) ? cohort.meetingDays.map(Number).sort((a, b) => a - b) : [];
        const matrix = getMatrixApi();
        return (matrix && matrix.patternIdFromMeetingDays(days)) || pid || 'mwf';
    }

    function resolveMatrixQuery(cohort) {
        const level = resolveMatrixLevel(cohort);
        const patternId = resolveMatrixPatternId(cohort);
        let programTrack = '';
        let levelGroup = '';
        // The matrix's own row for the level first (a level appears in one program only).
        const own = matrixSlotForLevel(level);
        if (own) {
            return { programTrack: own.programTrack || '', levelGroup: own.levelGroup || '', level, patternId };
        }
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
                        // "debate|rc": either subject, picked per cohort in the Generate subjects preview.
                        ...(String(track).includes('|') ? { choices: String(track).split('|') } : {}),
                        classId: '',
                        enabled: true,
                        period: slot.period,
                        periodByWeekday: {},
                        placements: []
                    });
                }
                const row = trackMap.get(track);
                // Every period counts: a subject can meet twice in one day (Pre-Basic Tue Grammar P2 + P3).
                row.placements.push({ dow: Number(dow), period: slot.period });
                const prevP = row.periodByWeekday[String(dow)];
                if (prevP == null || slot.period < prevP) {
                    row.periodByWeekday[String(dow)] = slot.period;
                }
                const p = slot.period;
                if (p != null && (row.period == null || p < row.period)) {
                    row.period = p;
                }
            });
        });
        return Array.from(trackMap.values());
    }

    /**
     * Fresh subject rows (from the matrix or TMS) laid over the saved ones: a subject keeps its id, linked class
     * and on/off choice; its periods are replaced. A saved subject that is gone keeps its class link but is
     * switched off, so Generate leaves that class alone.
     */
    function mergeSubjectSlots(existing, fresh) {
        const byTrack = new Map((existing || []).map((s) => [s.subjectTrack, s]));
        const out = fresh.map((slot) => {
            const prev = byTrack.get(slot.subjectTrack);
            byTrack.delete(slot.subjectTrack);
            if (!prev) {
                return slot;
            }
            return Object.assign({}, slot, {
                id: prev.id || slot.id,
                classId: prev.classId || slot.classId || '',
                enabled: prev.enabled !== false
            });
        });
        byTrack.forEach((prev) => {
            if (prev.classId) {
                out.push(Object.assign({}, prev, { enabled: false }));
            }
        });
        return out;
    }

    function refreshSubjectSlotsFromMatrix(cohort) {
        const fresh = buildSubjectSlotsFromMatrix(cohort);
        if (fresh.length) {
            cohort.subjectSlots = mergeSubjectSlots(cohort.subjectSlots, fresh);
        }
        return fresh.length;
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

    /* ---------------------------------------------------------------- Generate subjects */

    /** TMS subjects that are built-in class types. */
    const BUILTIN_TYPE_BY_SUBJECT = { debate: 'builtin-debate', speakingwriting: 'builtin-wr-sp' };
    /** A schedule pull from TMS is reused for this long (it reads every teacher's timetable, which takes a while). */

    function plannerApi() {
        return global.CCPTeacherPlanner || null;
    }

    function subjectKeyOf(text) {
        const P = plannerApi();
        if (P && P.normalizeSubject) {
            return P.normalizeSubject(text);
        }
        return normalizeStr(text).toLowerCase().replace(/[^a-z0-9가-힣&]+/g, '');
    }

    function classSubjectKey(cls) {
        const name = normalizeStr(cls && cls.name);
        const P = plannerApi();
        if (P && P.subjectOfName) {
            return P.subjectOfName(name);
        }
        return subjectKeyOf(name.includes('·') ? name.split('·').pop() : name);
    }

    /** Every subject word a subject row answers to (its TMS subject, its matrix id and labels). */
    function slotSubjectKeys(slot) {
        const keys = new Set();
        const add = (v) => {
            const k = v ? subjectKeyOf(v) : '';
            if (k) {
                keys.add(k);
            }
        };
        if (slot.subjectKey) {
            keys.add(slot.subjectKey);
        }
        add(slot.subjectLabel);
        const tracks = Array.isArray(slot.choices) && slot.choices.length
            ? slot.choices
            : [normalizeStr(slot.subjectTrack).replace(/^tms:/, '')];
        tracks.forEach((track) => {
            add(track);
            const entry = SUBJECT_TRACK_LABELS[track];
            if (entry) {
                add(entry.en);
                add(entry.ko);
            }
        });
        return keys;
    }

    function slotLabel(slot) {
        if (Array.isArray(slot.choices) && slot.choices.length) {
            return slot.choices.map((c) => subjectTrackLabel(c)).join(t('cohortsGenOr'));
        }
        return normalizeStr(slot.subjectLabel) || subjectTrackLabel(slot.subjectTrack);
    }

    /**
     * Either/or rows ("Debate or RC") become the subject picked in the preview (row.choice). When that subject
     * already has a row, the periods join it (one RC class, one more period); otherwise the row becomes it.
     */
    function resolveChoiceRows(cohort, rows) {
        const appData = hooks.getAppData();
        const plain = rows.filter((r) => !(r.slot.choices && r.slot.choices.length));
        const out = plain.slice();
        rows.forEach((r) => {
            const choices = r.slot.choices;
            if (!choices || !choices.length) {
                return;
            }
            const track = choices.includes(r.choice) ? r.choice : choices[0];
            const host = plain.find((p) => p.slot.subjectTrack === track);
            if (host) {
                const pl = (host.slot.placements || []).concat(r.slot.placements || []);
                host.slot.placements = pl;
                const byWd = { ...(host.slot.periodByWeekday || {}) };
                Object.keys(r.slot.periodByWeekday || {}).forEach((d) => {
                    const p = r.slot.periodByWeekday[d];
                    if (byWd[d] == null || p < byWd[d]) {
                        byWd[d] = p;
                    }
                });
                host.slot.periodByWeekday = byWd;
                r.slot.enabled = false;
                r.slot.classId = '';
                return;
            }
            r.slot.subjectTrack = track;
            delete r.slot.choices;
            const taken = new Set(out.filter((x) => x.cls).map((x) => x.cls.id));
            const found = findExistingClassForSlot(appData, cohort, r.slot, [], taken);
            r.cls = found ? found.cls : null;
            r.how = found ? found.how : 'create';
            out.push(r);
        });
        return out;
    }

    /** "BlueT^2609" / "Blue T" -> "bluet": a cohort or class-name prefix compared without spaces or the TMS term. */
    function bareNameKey(name) {
        return normalizeStr(name).replace(/\^.*$/, '').replace(/\s+/g, '').toLowerCase();
    }

    function classCohortIdsOf(cls) {
        const api = getTimetableApi();
        if (api && api.getClassCohortIds) {
            return api.getClassCohortIds(cls);
        }
        return [normalizeStr(cls.cohortId)].filter(Boolean);
    }

    /**
     * The class a subject row should use, if one exists: the row's own class, a class of this cohort for the
     * subject, a partner cohort's class (taught together in TMS), or an unlinked class named for this cohort.
     */
    function findExistingClassForSlot(appData, cohort, slot, partnerIds, taken) {
        const classes = appData.classes || [];
        const keys = slotSubjectKeys(slot);
        const free = (k) => k && !taken.has(k.id) && k.plannerDraftClass !== true;
        const sameSubject = (k) => keys.has(classSubjectKey(k));
        if (slot.classId) {
            const own = classes.find((k) => k.id === slot.classId);
            if (free(own)) {
                return { cls: own, how: classCohortIdsOf(own).includes(cohort.id) ? 'update' : 'link' };
            }
        }
        let hit = classes.find((k) => free(k) && sameSubject(k) && classCohortIdsOf(k).includes(cohort.id));
        if (hit) {
            return { cls: hit, how: 'update' };
        }
        for (let i = 0; i < partnerIds.length; i += 1) {
            hit = classes.find((k) => free(k) && sameSubject(k) && classCohortIdsOf(k).includes(partnerIds[i]));
            if (hit) {
                return { cls: hit, how: 'share' };
            }
        }
        const mine = bareNameKey(cohort.name);
        hit = classes.find((k) => free(k) && sameSubject(k) && !classCohortIdsOf(k).length
            && bareNameKey(normalizeStr(k.name).split('·')[0]) === mine);
        if (hit) {
            return { cls: hit, how: 'link' };
        }
        return null;
    }

    /** Subject rows from a TMS plan (CCPTmsScheduleImport.planCohortSubjectsFromTms). */
    function subjectSlotsFromTmsPlan(plan) {
        return (plan.subjects || []).map((s) => {
            const periodByWeekday = {};
            s.placements.forEach((p) => {
                const k = String(p.dow);
                if (periodByWeekday[k] == null || p.period < periodByWeekday[k]) {
                    periodByWeekday[k] = p.period;
                }
            });
            return {
                id: hooks.generateId(),
                subjectTrack: 'tms:' + s.subjectKey,
                subjectKey: s.subjectKey,
                subjectLabel: s.subject,
                classId: '',
                enabled: true,
                period: Math.min(...s.placements.map((p) => p.period)),
                periodByWeekday,
                placements: s.placements.map((p) => ({ dow: p.dow, period: p.period })),
                source: 'tms',
                tmsTeacherName: s.teacher || '',
                tmsTeacherUserId: (s.teacherProfile && s.teacherProfile.userId) || '',
                partnerCohortIds: (s.partners || []).map((p) => p.cohortId),
                partnersNotInCalendar: (s.partnersNotInCalendar || []).slice()
            };
        });
    }

    /**
     * What Generate subjects would do, without changing anything.
     * @param {object} cohort
     * @param {{ kind: 'tms', plan: object } | { kind: 'matrix' }} source
     * @returns {{ source: object, slots: object[], rows: Array<{ slot, cls, how: 'create'|'update'|'link'|'share', partners: object[] }> }}
     */
    function planCohortGeneration(cohort, source) {
        const appData = hooks.getAppData();
        const fresh = source.kind === 'tms' ? subjectSlotsFromTmsPlan(source.plan) : buildSubjectSlotsFromMatrix(cohort);
        const slots = mergeSubjectSlots(cohort.subjectSlots, fresh);
        const taken = new Set();
        const rows = [];
        // Either/or rows last, so a plain subject keeps first claim on its own class.
        const isChoice = (sl) => !!(sl.choices && sl.choices.length);
        slots.filter((sl) => !isChoice(sl)).concat(slots.filter(isChoice)).forEach((slot) => {
            if (slot.enabled === false || !fresh.some((f) => f.subjectTrack === slot.subjectTrack)) {
                return;
            }
            const partnerIds = (slot.partnerCohortIds || []).filter((id) => id !== cohort.id);
            const partners = partnerIds.map((id) => (appData.cohorts || []).find((c) => c.id === id)).filter(Boolean);
            const found = findExistingClassForSlot(appData, cohort, slot, partnerIds, taken);
            if (found) {
                taken.add(found.cls.id);
            }
            rows.push({ slot, cls: found ? found.cls : null, how: found ? found.how : 'create', partners });
        });
        // A saved row whose class another row now uses would point twice at one class: drop it.
        const used = new Set(rows.filter((r) => r.cls).map((r) => r.cls.id));
        const kept = slots.filter((s) => s.enabled !== false || !s.classId || !used.has(s.classId)
            || rows.some((r) => r.slot === s));
        return { source, slots: kept, rows };
    }

    function teacherRowFor(cls, slot) {
        const name = normalizeStr(slot.tmsTeacherName);
        const userId = normalizeStr(slot.tmsTeacherUserId);
        if (!name && !userId) {
            return null;
        }
        const prev = Array.isArray(cls.classTeachers) ? cls.classTeachers[0] : null;
        const same = prev && ((userId && normalizeStr(prev.userId) === userId)
            || (!userId && normalizeStr(prev.name).toLowerCase() === name.toLowerCase()));
        if (same) {
            return prev;
        }
        return { id: hooks.generateId(), userId, name, category: slotLabel(slot) };
    }

    /** Apply the rows the person ticked in the preview. */
    function applyCohortGeneration(cohort, generation, chosenRows) {
        chosenRows = resolveChoiceRows(cohort, chosenRows);
        // An either/or row that joined another subject leaves no saved row of its own.
        generation.slots = generation.slots.filter((s) => s.enabled !== false || s.classId || !(s.choices && s.choices.length));
        const appData = hooks.getAppData();
        if (!Array.isArray(appData.classes)) {
            appData.classes = [];
        }
        const matrix = getMatrixApi();
        const linkApi = getTimetableApi();
        const meetingDays = getCohortMeetingDays(cohort);
        const scheduleBlock = normalizeStr(cohort.scheduleBlock) || 'primary';
        const levelPreset = normalizeStr(cohort.levelPreset) || normalizeStr(cohort.level) || resolveMatrixLevel(cohort);
        const grade = normalizeStr(cohort.grade);
        const touchedCohorts = new Set([cohort.id]);
        let created = 0;
        let updated = 0;
        let linked = 0;
        chosenRows.forEach((row) => {
            const slot = row.slot;
            const fromTms = slot.source === 'tms';
            const placements = (slot.placements || []).filter((p) => p && p.dow && p.period != null);
            const periodByWeekday = { ...(slot.periodByWeekday || {}) };
            const days = fromTms
                ? Array.from(new Set(placements.map((p) => Number(p.dow)))).sort((a, b) => a - b)
                : meetingDays.slice();
            const periodVals = Object.values(periodByWeekday).filter((v) => v != null);
            const period = slot.period != null ? slot.period : (periodVals.length ? Math.min(...periodVals) : undefined);
            const classTypeId = fromTms
                ? (BUILTIN_TYPE_BY_SUBJECT[slot.subjectKey] || '')
                : ((matrix && matrix.getBuiltinClassTypeIdForSubjectTrack(slot.subjectTrack)) || '');
            let cls = row.cls;
            if (!cls) {
                const accent = ensureCohortHasColor(cohort, appData);
                const names = [cohort].concat(row.partners).map((c) => normalizeStr(c.name).replace(/\^.*$/, '').trim() || 'Cohort');
                cls = {
                    id: hooks.generateId(),
                    name: `${names.join(' + ')} · ${slotLabel(slot)}`,
                    levelPreset,
                    level: levelPreset,
                    grade,
                    cohortId: cohort.id,
                    cohortIds: [cohort.id],
                    scheduleBlock,
                    classTeachers: [],
                    classTypeId,
                    generatedFromCohort: true,
                    color: accent,
                    textColor: deriveTextColorForClass(accent)
                };
                appData.classes.push(cls);
                created += 1;
            } else if (row.how === 'update') {
                updated += 1;
            } else {
                linked += 1;
            }
            const shared = classCohortIdsOf(cls).some((id) => id !== cohort.id) || row.partners.length > 0;
            if (!shared) {
                cls.levelPreset = levelPreset;
                cls.level = levelPreset;
                cls.grade = grade;
                cls.scheduleBlock = scheduleBlock;
            }
            cls.meetingDays = days;
            cls.period = period;
            cls.periodByWeekday = periodByWeekday;
            if (fromTms) {
                // TMS is the real timetable: its periods are the class's placements (two in a day stay two).
                cls.placements = placements.map((p) => ({ dow: Number(p.dow), period: Number(p.period) }));
                cls.weeklyFrequency = placements.length;
                const teacher = teacherRowFor(cls, slot);
                if (teacher) {
                    cls.classTeachers = [teacher];
                    if (teacher.userId) {
                        cls.assignedTeacherUserId = teacher.userId;
                        cls.assignedTeacherName = teacher.name;
                    }
                }
                cls.tmsSubject = slotLabel(slot);
            } else if (placements.length > days.length) {
                cls.weeklyFrequency = placements.length;
            }
            if (classTypeId && !cls.classTypeId) {
                cls.classTypeId = classTypeId;
            }
            [cohort.id].concat(row.partners.map((c) => c.id)).forEach((cid) => {
                if (linkApi) {
                    linkApi.addClassCohortId(cls, cid);
                } else if (!normalizeStr(cls.cohortId)) {
                    cls.cohortId = cid;
                }
                touchedCohorts.add(cid);
            });
            slot.classId = cls.id;
        });
        // Saved rows drop the per-pull details that only the preview needs.
        cohort.subjectSlots = generation.slots.map((s) => {
            const out = Object.assign({}, s);
            delete out.partnersNotInCalendar;
            delete out.tmsTeacherUserId;
            return out;
        });
        cohort.meetingDays = meetingDays;
        touchedCohorts.forEach((cid) => {
            const c = (appData.cohorts || []).find((x) => x.id === cid);
            if (c) {
                hooks.syncClassCohortLinks(c);
            }
        });
        return { created, updated, linked };
    }

    /** Older entry point (tests, scripts): generate from the level schedule without a preview. */
    function generateClassesForCohort(cohort, options) {
        if (!hooks || !hooks.getAppData() || !cohort) {
            return { created: 0, updated: 0 };
        }
        cohort.meetingDays = getCohortMeetingDays(cohort);
        const generation = planCohortGeneration(cohort, (options && options.source) || { kind: 'matrix' });
        const res = applyCohortGeneration(cohort, generation, generation.rows);
        return { created: res.created, updated: res.updated + res.linked };
    }

    /* ---- TMS schedule pull for Generate subjects ---- */

    let genModalEl = null;

    function ensureGenerateModal() {
        if (genModalEl) {
            return genModalEl;
        }
        const wrap = document.createElement('div');
        wrap.id = 'cohortsGenerateModal';
        wrap.className = 'modal';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.hidden = true;
        wrap.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="cohortsGenerateModalTitle"></h2>
                    <button type="button" class="modal-close" data-gen-cancel aria-label="Close">&times;</button>
                </div>
                <div class="cohorts-generate-body"></div>
                <div class="form-actions">
                    <button type="button" class="btn btn-outline" data-gen-cancel></button>
                    <button type="button" class="btn btn-primary" data-gen-ok></button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
        genModalEl = wrap;
        return wrap;
    }

    function showGenerateModal(title, bodyNode, okText, okWhen) {
        return new Promise((resolve) => {
            const modal = ensureGenerateModal();
            modal.querySelector('#cohortsGenerateModalTitle').textContent = title;
            const body = modal.querySelector('.cohorts-generate-body');
            body.innerHTML = '';
            body.appendChild(bodyNode);
            const ok = modal.querySelector('[data-gen-ok]');
            ok.textContent = okText;
            modal.querySelectorAll('[data-gen-cancel]').forEach((b) => {
                if (b.tagName === 'BUTTON' && !b.classList.contains('modal-close')) {
                    b.textContent = t('cancel') || 'Cancel';
                }
            });
            const close = (value) => {
                modal.classList.remove('active', 'is-open');
                modal.hidden = true;
                modal.setAttribute('aria-hidden', 'true');
                if (hooks && hooks.closeModal) {
                    hooks.closeModal(modal);
                }
                modal.removeEventListener('click', onClick);
                modal.removeEventListener('keydown', onKey);
                resolve(value);
            };
            function onClick(ev) {
                if (ev.target === modal || ev.target.closest('[data-gen-cancel]')) {
                    close(null);
                } else if (ev.target.closest('[data-gen-ok]')) {
                    close(okWhen ? okWhen() : true);
                }
            }
            function onKey(ev) {
                if (ev.key === 'Escape') {
                    ev.stopPropagation();
                    close(null);
                } else if (ev.key === 'Enter' && ev.target && ev.target.tagName === 'INPUT' && ev.target.type !== 'checkbox') {
                    ev.preventDefault();
                    close(okWhen ? okWhen() : true);
                }
            }
            modal.addEventListener('click', onClick);
            modal.addEventListener('keydown', onKey);
            modal.hidden = false;
            if (hooks.openModal) {
                hooks.openModal(modal);
            } else {
                modal.classList.add('active');
                modal.setAttribute('aria-hidden', 'false');
            }
            const first = body.querySelector('input:not([type=checkbox])');
            if (first) {
                first.focus();
            }
        });
    }

    /**
     * Every teacher's timetable from TMS (the Sync Helper reads it; nothing is written to TMS).
     * Uses the shared TMS pull: a pull from the last hour (here, the Planner or the term wizard) is reused,
     * and the tab's TMS sign-in is asked for only once.
     * @returns {Promise<{ body?: object, reason?: string, cancelled?: boolean }>}
     */
    async function pullTmsScheduleForGenerate() {
        const S = global.CCPTmsSync;
        if (!S || !S.pullSchedule) {
            return { reason: t('cohortsGenTmsNoSync') };
        }
        try {
            return await S.pullSchedule({
                signIn: {
                    title: t('cohortsGenTmsLoginTitle'),
                    hint: t('cohortsGenTmsLoginHint'),
                    note: t('cohortsGenTmsSkipHint'),
                    submitLabel: t('cohortsGenTmsSignIn')
                },
                onSignedIn: () => hooks.showMessage(t('cohortsGenTmsPulling'), false)
            });
        } catch (err) {
            // The reason fills "because {why}", so the missing-helper case keeps its short phrase.
            return { reason: S.isHelperMissingError(err) ? t('cohortsGenTmsNoHelper') : S.errorText(err, t('cohortsGenTmsFailed')) };
        }
    }

    function formatPlacementsShort(slot) {
        const lang = getLang();
        const labels = DOW_LABELS[lang] || DOW_LABELS.en;
        const list = (slot.placements && slot.placements.length)
            ? slot.placements
            : Object.keys(slot.periodByWeekday || {}).map((d) => ({ dow: Number(d), period: slot.periodByWeekday[d] }));
        return list.slice().sort((a, b) => a.dow - b.dow || a.period - b.period)
            .map((p) => `${labels[p.dow] || p.dow} P${p.period}`).join(', ');
    }

    /** The preview: one tickable row per subject, saying what will happen. Resolves to the ticked rows or null. */
    function confirmCohortGeneration(cohort, generation, note) {
        const box = document.createElement('div');
        box.className = 'cohorts-generate-preview';
        const head = document.createElement('p');
        head.className = 'section-hint';
        head.textContent = note;
        box.appendChild(head);
        if (!generation.rows.length) {
            const p = document.createElement('p');
            p.className = 'section-hint';
            p.textContent = t('cohortsGenNothing');
            box.appendChild(p);
        }
        const table = document.createElement('table');
        table.className = 'cohort-subject-grid';
        table.innerHTML = `<thead><tr><th></th><th>${escapeHtml(t('cohortsSubjectCol'))}</th><th>${escapeHtml(t('cohortsGenWhen'))}</th><th>${escapeHtml(t('cohortsGenTeacher'))}</th><th>${escapeHtml(t('cohortsGenWhat'))}</th></tr></thead>`;
        const tbody = document.createElement('tbody');
        const boxes = [];
        const selects = [];
        generation.rows.forEach((row) => {
            const tr = document.createElement('tr');
            const what = row.how === 'create'
                ? (row.partners.length
                    ? t('cohortsGenCreateShared').replace('{cohorts}', row.partners.map((c) => displayName(c.name)).join(', '))
                    : t('cohortsGenCreate'))
                : t(row.how === 'share' ? 'cohortsGenShare' : row.how === 'link' ? 'cohortsGenLink' : 'cohortsGenUpdate')
                    .replace('{name}', row.cls.name || row.cls.id);
            const outside = (row.slot.partnersNotInCalendar || []).length
                ? ' ' + t('cohortsGenOutside').replace('{names}', row.slot.partnersNotInCalendar.join(', '))
                : '';
            const choices = row.slot.choices || [];
            const picked = row.cls ? (choices.find((c) => slotSubjectKeys({ subjectTrack: c }).has(classSubjectKey(row.cls))) || choices[0]) : choices[0];
            const subjectCell = choices.length
                ? `<select class="field-select" data-gen-choice>${choices.map((c) => `<option value="${escapeHtml(c)}"${c === picked ? ' selected' : ''}>${escapeHtml(subjectTrackLabel(c))}</option>`).join('')}</select>`
                : escapeHtml(slotLabel(row.slot));
            tr.innerHTML = `<td><input type="checkbox" checked></td><td>${subjectCell}</td>
                <td>${escapeHtml(formatPlacementsShort(row.slot))}</td><td>${escapeHtml(row.slot.tmsTeacherName || '—')}</td>
                <td>${escapeHtml(what + outside)}</td>`;
            boxes.push(tr.querySelector('input'));
            selects.push(tr.querySelector('[data-gen-choice]'));
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        if (generation.rows.length) {
            const wrap = document.createElement('div');
            wrap.className = 'cohort-subject-grid-wrap';
            wrap.appendChild(table);
            box.appendChild(wrap);
        }
        return showGenerateModal(
            t('cohortsGenPreviewTitle').replace('{name}', cohortDisplayName(cohort)),
            box,
            t('cohortsGenApply'),
            () => generation.rows.filter((r, i) => {
                if (selects[i]) {
                    r.choice = selects[i].value;
                }
                return boxes[i].checked;
            })
        );
    }

    async function runGenerateSubjects(cohort) {
        flushCohortEditorFields();
        cohort.meetingDays = getCohortMeetingDays(cohort);
        let source = null;
        let note = '';
        const tmsApi = global.CCPTmsScheduleImport;
        if (!tmsApi || !tmsApi.planCohortSubjectsFromTms || !plannerApi()) {
            note = t('cohortsGenFromMatrixWhy').replace('{why}', t('cohortsGenTmsNoSync'));
        } else {
            const pulled = await pullTmsScheduleForGenerate();
            if (pulled.body) {
                const plan = tmsApi.planCohortSubjectsFromTms(hooks.getAppData(), pulled.body, cohort);
                if (plan.subjects.length) {
                    source = { kind: 'tms', plan };
                    note = t('cohortsGenFromTms').replace('{term}', plan.term || '–').replace('{n}', String(plan.subjects.length));
                } else {
                    note = t('cohortsGenFromMatrixWhy').replace('{why}', t('cohortsGenTmsNoCohort'));
                }
            } else {
                note = t('cohortsGenFromMatrixWhy').replace('{why}', pulled.cancelled ? t('cohortsGenTmsSkipped') : pulled.reason);
            }
        }
        if (!source) {
            source = { kind: 'matrix' };
            if (!resolveMatrixLevel(cohort) || !buildSubjectSlotsFromMatrix(cohort).length) {
                hooks.showMessage(t('cohortsMatrixNoMatch'), true);
                return;
            }
        }
        const generation = planCohortGeneration(cohort, source);
        const chosen = await confirmCohortGeneration(cohort, generation, note);
        if (!chosen) {
            return;
        }
        const result = applyCohortGeneration(cohort, generation, chosen);
        hooks.saveData();
        hooks.invalidateScheduleCache();
        if (hooks.refreshClassEditorCohortUiIfOpen) {
            hooks.refreshClassEditorCohortUiIfOpen();
        } else if (hooks.populateClassCohortSelect) {
            hooks.populateClassCohortSelect();
        }
        // Same subject in several cohorts is normal (each at its own level): no duplicate warning.
        hooks.showMessage(t('cohortsGenDone')
            .replace('{created}', String(result.created))
            .replace('{updated}', String(result.updated))
            .replace('{linked}', String(result.linked)), false);
        updateCohortEditorModalTitle(cohort);
        renderAll();
    }

    /* ---- Generate subjects for every cohort at once (after importing many cohorts) ---- */

    function isArchiveCohortForGenerate(cohort) {
        const D = global.CCPClassroomDomain;
        if (D && D.isArchiveCohort) {
            return D.isArchiveCohort(cohort);
        }
        return !!(cohort && cohort.isArchiveCohort === true);
    }

    /**
     * What the batch would do for each cohort, without changing anything.
     * @param {object[]} cohorts
     * @param {object|null} tmsBody  a TMS schedule pull, or null for the level schedule only
     * @returns {Array<{ cohort, generation: object|null, note: string, hasClasses: boolean }>}
     */
    function planBatchGeneration(cohorts, tmsBody, options) {
        const appData = hooks.getAppData();
        const tmsApi = global.CCPTmsScheduleImport;
        let term = normalizeStr(options && options.term);
        if (!term && tmsBody && tmsApi && tmsApi.buildDraftFromTms && plannerApi()) {
            term = tmsApi.buildDraftFromTms(appData, tmsBody).report.term || '';
        }
        return cohorts.map((cohort) => {
            cohort.meetingDays = getCohortMeetingDays(cohort);
            const hasClasses = (appData.classes || []).some((k) => classCohortIdsOf(k).includes(cohort.id));
            let source = null;
            let note = '';
            if (tmsBody && tmsApi && plannerApi()) {
                const plan = tmsApi.planCohortSubjectsFromTms(appData, tmsBody, cohort, { term });
                if (plan.subjects.length) {
                    source = { kind: 'tms', plan };
                    note = t('cohortsGenAllFromTms');
                }
            }
            if (!source && resolveMatrixLevel(cohort) && buildSubjectSlotsFromMatrix(cohort).length) {
                source = { kind: 'matrix' };
                note = t('cohortsGenAllFromMatrix');
            }
            if (!source) {
                return { cohort, generation: null, note: t('cohortsGenAllNoSource'), hasClasses };
            }
            return { cohort, generation: planCohortGeneration(cohort, source), note, hasClasses };
        });
    }

    /** The combined preview: a section per cohort (its own tick), a row per subject. Resolves to picks or null. */
    function confirmBatchGeneration(plans, why) {
        const preview = buildBatchPreviewNode(plans, why);
        return showGenerateModal(t('cohortsGenAllTitle'), preview.node, t('cohortsGenApply'), preview.getPicks);
    }

    /**
     * The combined preview as a node (the cohorts tab shows it in a dialog; the term wizard in its Classes step).
     * @returns {{ node: HTMLElement, getPicks: () => Array<{ cohort, rows: Array<{ track, choice }> }> }}
     */
    function buildBatchPreviewNode(plans, why) {
        const box = document.createElement('div');
        box.className = 'cohorts-generate-preview cohorts-generate-all';
        const head = document.createElement('p');
        head.className = 'section-hint';
        head.textContent = why;
        box.appendChild(head);
        const picks = [];
        // A class created for an earlier cohort in this batch is shared, not made twice.
        const madeFor = new Map();
        plans.forEach((p) => {
            const sec = document.createElement('section');
            sec.className = 'cohorts-generate-all-cohort';
            const h = document.createElement('label');
            h.className = 'checkbox-label';
            const title = cohortDisplayName(p.cohort);
            const cohortBox = document.createElement('input');
            cohortBox.type = 'checkbox';
            cohortBox.checked = !!p.generation && p.generation.rows.length > 0 && !p.hasClasses;
            cohortBox.disabled = !p.generation || !p.generation.rows.length;
            h.appendChild(cohortBox);
            const strong = document.createElement('strong');
            strong.textContent = ' ' + title;
            h.appendChild(strong);
            const small = document.createElement('span');
            small.className = 'section-hint';
            small.textContent = ' · ' + p.note + (p.hasClasses ? ' ' + t('cohortsGenAllHasClasses') : '');
            h.appendChild(small);
            sec.appendChild(h);
            const rowPicks = [];
            if (p.generation && p.generation.rows.length) {
                const table = document.createElement('table');
                table.className = 'cohort-subject-grid';
                const tbody = document.createElement('tbody');
                p.generation.rows.forEach((row) => {
                    const tr = document.createElement('tr');
                    const choices = row.slot.choices || [];
                    const picked = row.cls ? (choices.find((c) => slotSubjectKeys({ subjectTrack: c }).has(classSubjectKey(row.cls))) || choices[0]) : choices[0];
                    const subjectCell = choices.length
                        ? `<select class="field-select" data-gen-choice>${choices.map((c) => `<option value="${escapeHtml(c)}"${c === picked ? ' selected' : ''}>${escapeHtml(subjectTrackLabel(c))}</option>`).join('')}</select>`
                        : escapeHtml(slotLabel(row.slot));
                    const key = row.slot.subjectKey || row.slot.subjectTrack;
                    const earlier = row.how === 'create'
                        ? row.partners.find((c) => madeFor.has(`${c.id}|${key}`))
                        : null;
                    let what;
                    if (earlier) {
                        what = t('cohortsGenAllSharesNew').replace('{name}', displayName(earlier.name));
                    } else if (row.how === 'create') {
                        what = row.partners.length
                            ? t('cohortsGenCreateShared').replace('{cohorts}', row.partners.map((c) => displayName(c.name)).join(', '))
                            : t('cohortsGenCreate');
                        madeFor.set(`${p.cohort.id}|${key}`, true);
                    } else {
                        what = t(row.how === 'share' ? 'cohortsGenShare' : row.how === 'link' ? 'cohortsGenLink' : 'cohortsGenUpdate')
                            .replace('{name}', row.cls.name || row.cls.id);
                    }
                    tr.innerHTML = `<td><input type="checkbox" checked></td><td>${subjectCell}</td>
                        <td>${escapeHtml(formatPlacementsShort(row.slot))}</td><td>${escapeHtml(row.slot.tmsTeacherName || '—')}</td>
                        <td>${escapeHtml(what)}</td>`;
                    rowPicks.push({ track: row.slot.subjectTrack, box: tr.querySelector('input'), select: tr.querySelector('[data-gen-choice]') });
                    tbody.appendChild(tr);
                });
                table.appendChild(tbody);
                const wrap = document.createElement('div');
                wrap.className = 'cohort-subject-grid-wrap';
                wrap.appendChild(table);
                sec.appendChild(wrap);
                const sync = () => {
                    wrap.hidden = !cohortBox.checked;
                };
                cohortBox.addEventListener('change', sync);
                sync();
            }
            box.appendChild(sec);
            picks.push({ cohort: p.cohort, cohortBox, rowPicks });
        });
        return {
            node: box,
            getPicks: () => picks
                .filter((p) => p.cohortBox.checked)
                .map((p) => ({
                    cohort: p.cohort,
                    rows: p.rowPicks.filter((r) => r.box.checked).map((r) => ({ track: r.track, choice: r.select ? r.select.value : '' }))
                }))
                .filter((p) => p.rows.length)
        };
    }

    /**
     * Run the generator on another calendar's data (the term wizard's new calendar, before it is saved).
     * Synchronous only: the cohorts tab's own data is back in place when fn returns.
     * @param {object} data  { cohorts, classes, teacherProfiles, … }
     * @param {Function} fn
     * @param {object} [extraHooks]  t, getLang, generateId … when the cohorts tab has not been opened yet
     */
    function withAppData(data, fn, extraHooks) {
        const prev = hooks;
        let n = 0;
        hooks = Object.assign({
            t: (k) => k,
            getLang: () => 'en',
            generateId: () => `cls_${Date.now().toString(36)}_${(n += 1).toString(36)}`,
            showMessage: () => {}
        }, prev || {}, extraHooks || {}, {
            getAppData: () => data,
            getNextColor: undefined,
            syncClassCohortLinks: (cohort) => {
                cohort.classIds = (data.classes || []).filter((k) => classCohortIdsOf(k).includes(cohort.id)).map((k) => k.id);
            }
        });
        try {
            return fn();
        } finally {
            hooks = prev;
        }
    }

    /** Curriculum and term settings a new class takes from last term's class of the same subject. */
    const CARRY_CURRICULUM_FIELDS = ['curriculumId', 'book', 'scheduleModel', 'totalLessons', 'compressionMode',
        'syllabusUnits', 'syllabusGeneralNotes', 'termCalendarMonths', 'useAutoTermEnd', 'termEndMode',
        'debateBookPeriods', 'lessonLabelMode', 'homeworkImportMode', 'startDate', 'endDate', 'classTypeId'];

    /**
     * New classes take last term's curriculum: from the previous cohort's class of the same subject, else from any
     * class of the same level and subject. Dates are moved by the term shift.
     * @param {object[]} newClasses
     * @param {object} prevData  last term's calendar
     * @param {(cohortId: string) => string} prevCohortIdFor  new cohort id -> matched previous cohort id ('' = none)
     * @param {(cls: object) => object} shiftClass  copy of a previous class with its dates moved
     * @returns {number} classes that took a curriculum
     */
    function copyCurriculumFromPrevious(newClasses, prevData, prevCohortIdFor, shiftClass) {
        const prevClasses = ((prevData && prevData.classes) || []).filter((k) => k && k.plannerSpecial !== true);
        let copied = 0;
        (newClasses || []).forEach((cls) => {
            const subj = classSubjectKey(cls);
            if (!subj) {
                return;
            }
            const ids = classCohortIdsOf(cls);
            const prevCohortIds = ids.map((id) => prevCohortIdFor(id)).filter(Boolean);
            const level = normalizeStr(cls.levelPreset || cls.level);
            const same = (k) => classSubjectKey(k) === subj;
            const prev = prevClasses.find((k) => same(k) && classCohortIdsOf(k).some((id) => prevCohortIds.includes(id)))
                || (level ? prevClasses.find((k) => same(k) && normalizeStr(k.levelPreset || k.level) === level) : null);
            if (!prev) {
                return;
            }
            const moved = shiftClass ? shiftClass(prev) || prev : prev;
            CARRY_CURRICULUM_FIELDS.forEach((f) => {
                if (moved[f] === undefined || moved[f] === '' || moved[f] === null) {
                    return;
                }
                if (f === 'classTypeId' && cls.classTypeId) {
                    return;
                }
                cls[f] = JSON.parse(JSON.stringify(moved[f]));
            });
            cls.curriculumCarriedFrom = prev.id;
            copied += 1;
        });
        return copied;
    }

    /**
     * Apply the batch cohort by cohort. Each cohort is planned again just before it is applied, so a class made
     * for an earlier cohort (taught together in TMS) is found and shared instead of made twice.
     */
    function applyBatchGeneration(picks, tmsBody, options) {
        const total = { cohorts: 0, created: 0, updated: 0, linked: 0 };
        picks.forEach((pick) => {
            const plan = planBatchGeneration([pick.cohort], tmsBody, options)[0];
            if (!plan.generation) {
                return;
            }
            const wanted = new Map(pick.rows.map((r) => [r.track, r]));
            const rows = plan.generation.rows.filter((r) => wanted.has(r.slot.subjectTrack));
            rows.forEach((r) => {
                const w = wanted.get(r.slot.subjectTrack);
                if (w.choice) {
                    r.choice = w.choice;
                }
            });
            if (!rows.length) {
                return;
            }
            const res = applyCohortGeneration(pick.cohort, plan.generation, rows);
            total.cohorts += 1;
            total.created += res.created;
            total.updated += res.updated;
            total.linked += res.linked;
        });
        return total;
    }

    async function runGenerateSubjectsForAll() {
        if (!hooks || (hooks.isViewOnly && hooks.isViewOnly())) {
            showTeamLockBlockedMessage();
            return;
        }
        const appData = hooks.getAppData();
        const cohorts = (appData.cohorts || []).filter((c) => c && !isArchiveCohortForGenerate(c) && normalizeStr(c.name));
        if (!cohorts.length) {
            hooks.showMessage(t('cohortsGenAllNone'), true);
            return;
        }
        let tmsBody = null;
        let why = t('cohortsGenAllIntroTms');
        if (!global.CCPTmsScheduleImport || !plannerApi()) {
            why = t('cohortsGenAllIntroMatrix').replace('{why}', t('cohortsGenTmsNoSync'));
        } else {
            const pulled = await pullTmsScheduleForGenerate();
            if (pulled.body) {
                tmsBody = pulled.body;
            } else {
                why = t('cohortsGenAllIntroMatrix').replace('{why}', pulled.cancelled ? t('cohortsGenTmsSkipped') : pulled.reason);
            }
        }
        const plans = planBatchGeneration(cohorts, tmsBody);
        const picks = await confirmBatchGeneration(plans, why);
        if (!picks || !picks.length) {
            return;
        }
        const total = applyBatchGeneration(picks, tmsBody);
        hooks.saveData();
        if (hooks.invalidateScheduleCache) {
            hooks.invalidateScheduleCache();
        }
        if (hooks.refreshClassEditorCohortUiIfOpen) {
            hooks.refreshClassEditorCohortUiIfOpen();
        } else if (hooks.populateClassCohortSelect) {
            hooks.populateClassCohortSelect();
        }
        hooks.showMessage(t('cohortsGenAllDone')
            .replace('{cohorts}', String(total.cohorts))
            .replace('{created}', String(total.created))
            .replace('{updated}', String(total.updated))
            .replace('{linked}', String(total.linked)), false);
        renderAll();
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
        // Local to this page: selecting a cohort never filters class lists elsewhere.
        appData.ui.cohortsTabSelectedId = selectedCohortId || '';
        const saveUi = hooks.saveUiStateToLocalStorage || global.saveUiStateToLocalStorage;
        if (typeof saveUi === 'function') {
            saveUi();
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

    /**
     * Write the ticked classes in the editor's class list onto the data (both sides of the
     * link). Returns what changed, or null when nothing was pending. Does not save or re-render.
     */
    function applyPendingClassLinks(cohort) {
        if (!hooks || !cohort || !catalogDirty) {
            return null;
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
                const wasUncohorted = !classHasAnyCohortLink(classData);
                if (api) {
                    api.addClassCohortId(classData, cohort.id);
                } else {
                    classData.cohortId = cohort.id;
                    classData.cohortIds = [cohort.id];
                }
                if (wasUncohorted) {
                    inheritCohortColorOntoClass(classData, cohort, { wasUncohorted: true, force: true });
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
        return { linked, unlinked };
    }

    function showClassLinkSummary(result) {
        if (!result || (!result.linked && !result.unlinked)) {
            return;
        }
        hooks.showMessage(
            t('cohortsClassApplySummary')
                .replace('{linked}', String(result.linked))
                .replace('{unlinked}', String(result.unlinked)),
            false
        );
    }

    function applyClassAssignments(cohort) {
        if (!hooks || !cohort) {
            return;
        }
        if (hooks.isViewOnly && hooks.isViewOnly()) {
            showTeamLockBlockedMessage();
            return;
        }
        const result = applyPendingClassLinks(cohort) || { linked: 0, unlinked: 0 };
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
            t('cohortsClassApplySummary')
                .replace('{linked}', String(result.linked))
                .replace('{unlinked}', String(result.unlinked)),
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
        // Stay open across re-renders (each save redraws the editor) for the cohort being edited.
        details.open = classAssignmentOpenForCohortId === cohort.id;
        details.addEventListener('toggle', () => {
            classAssignmentOpenForCohortId = details.open ? cohort.id : '';
        });

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
        const colorEl = mount.querySelector('.cohort-field-color');
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
        if (colorEl && normalizeStr(colorEl.value)) {
            cohort.color = colorEl.value.trim();
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
        if (cohort.isDraft) {
            delete cohort.isDraft;
        }
        cohort.meetingDays = getCohortMeetingDays(cohort);
        // Ticked classes are part of the cohort: saving the cohort saves them. They used to be
        // shown as linked in this editor and then dropped unless "Apply class links" was pressed.
        const linkResult = applyPendingClassLinks(cohort);
        hooks.syncClassCohortLinks(cohort);
        hooks.saveData();
        showClassLinkSummary(linkResult);
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
            genBtn.disabled = true;
            runGenerateSubjects(cohort)
                .catch((err) => {
                    console.error(err);
                    hooks.showMessage(t('cohortsGenTmsFailed'), true);
                })
                .finally(() => {
                    genBtn.disabled = false;
                });
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
            copy.color = getNextCohortColor(appData);
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
        const ro = !!(hooks && hooks.isViewOnly && hooks.isViewOnly());
        const appDataNow = hooks ? hooks.getAppData() : null;
        const openCohort = appDataNow && selectedCohortId
            ? (appDataNow.cohorts || []).find((c) => c.id === selectedCohortId)
            : null;
        if (!ro && openCohort && catalogDirty) {
            // Same rule as Save cohort: class ticks are not thrown away on close.
            const linkResult = applyPendingClassLinks(openCohort);
            hooks.saveData();
            if (hooks.invalidateScheduleCache) {
                hooks.invalidateScheduleCache();
            }
            showClassLinkSummary(linkResult);
            renderAll();
        }
        const modal = getCohortEditorModal();
        if (!modal) {
            notifyCohortEditorClosed();
            return;
        }
        if (hooks && hooks.closeModal) {
            hooks.closeModal(modal);
        } else {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        }
        notifyCohortEditorClosed();
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
            // Always shown (disabled until a cohort is picked) so selecting one does not push
            // the board down under the pointer.
            editBtn.hidden = false;
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
            contextualRow.hidden = false;
            const timetableBtn = document.getElementById('cohortsOpenTimetableBtn');
            if (timetableBtn) {
                timetableBtn.disabled = !cohort;
            }
        }

        const deleteBtn = document.getElementById('cohortsDeleteBtn');
        if (!deleteBtn) {
            return;
        }
        deleteBtn.hidden = false;
        deleteBtn.disabled = ro || !cohort;
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
        if (normalizeCohortColors(appData) && hooks.saveData) {
            hooks.saveData();
        }
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
            btn.innerHTML = `<span>${escapeHtml(cohort.name ? displayName(cohort.name) : t('timetableAddCohort'))}<span class="cohort-status-chip cohort-status-chip--${statusClass(status)}">${escapeHtml(statusLabel(status))}</span></span><span class="cohort-list-item-meta">${escapeHtml([cohortLevelDisplay(cohort), cohort.grade, pat, formatCohortClassCountMeta(classCount)].filter(Boolean).join(' · '))}</span>`;
            btn.addEventListener('click', () => {
                selectCohort(cohort.id);
                if (global.CCPSetupBoard && global.CCPSetupBoard.scrollToCohort) {
                    global.CCPSetupBoard.scrollToCohort(cohort.id);
                }
            });
            if (global.CCPClassColorTile && normalizeStr(cohort.color)) {
                global.CCPClassColorTile.apply(btn, cohort, { selected });
            }
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
            if (global.CCPClassColorTile) {
                global.CCPClassColorTile.apply(item, cls, {});
            }
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
        } else if (!cohort.subjectSlots.some((s) => s.source === 'tms')) {
            // Saved rows from an older level schedule follow the current one (links and on/off are kept).
            refreshSubjectSlotsFromMatrix(cohort);
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
            nameTd.textContent = slotLabel(slot);
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

        const appearance = document.createElement('section');
        appearance.className = 'cohort-appearance-section';
        appearance.innerHTML = `<h3 class="form-section-title">${escapeHtml(t('cohortsSectionAppearance'))}</h3>`;
        const colorLabel = document.createElement('label');
        colorLabel.className = 'form-group';
        colorLabel.textContent = t('cohortsColorLabel');
        const colorHidden = document.createElement('input');
        colorHidden.type = 'hidden';
        colorHidden.className = 'cohort-field-color';
        colorHidden.value = ensureCohortHasColor(cohort, appData);
        const colorGrid = document.createElement('div');
        colorGrid.className = 'cohort-color-palette-grid class-color-palette-host';
        colorGrid.setAttribute('role', 'group');
        colorGrid.setAttribute('aria-label', t('cohortsColorLabel'));
        const colorPreview = document.createElement('div');
        colorPreview.className = 'cohort-color-preview-host class-color-preview-host';
        colorPreview.setAttribute('aria-live', 'polite');
        colorLabel.appendChild(colorHidden);
        appearance.appendChild(colorLabel);
        appearance.appendChild(colorGrid);
        appearance.appendChild(colorPreview);

        const schedule = document.createElement('section');
        schedule.innerHTML = `<h3 class="form-section-title">${escapeHtml(t('cohortsSectionSchedule'))}</h3>`;
        const patternPicker = document.createElement('div');
        patternPicker.className = 'cohort-pattern-picker';
        const matrix = getMatrixApi();
        const patterns = matrix ? matrix.getPatterns() : {};
        PATTERN_IDS.forEach((pid) => {
            // Mon-only is the once-a-week middle-school class: offered only to levels that have it.
            if (pid === 'mon' && cohort.schedulePattern !== 'mon') {
                const q = resolveMatrixQuery(cohort);
                if (!matrix || !q.level || !matrix.findSlots({ level: q.level, patternId: 'mon' }).length) {
                    return;
                }
            }
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
        // Picking a level sets the block that level normally uses (still changeable before saving).
        levelSel.addEventListener('change', () => {
            if (getLevelProfileLevel(levelSel.value)) {
                blockSel.value = defaultBlockForLevel(levelSel.value);
            }
        });

        const subjects = document.createElement('section');
        subjects.innerHTML = `<h3 class="form-section-title">${escapeHtml(t('cohortsSectionSubjects'))}</h3>`;
        const gridMount = document.createElement('div');
        renderSubjectGrid(cohort, gridMount);
        subjects.appendChild(gridMount);

        mount.appendChild(identity);
        mount.appendChild(appearance);
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
        refreshCohortColorPaletteUi(mount, cohort.color, cohort.name || t('timetableAddCohort'));

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
            color: getNextCohortColor(appData),
            schedulePattern: defaultPattern,
            meetingDays: defaultDays.slice(),
            periodCount: 0,
            scheduleBlock: 'primary',
            blockDefaultV: 1,
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
        if (hooks.refreshClassEditorCohortUiIfOpen) {
            hooks.refreshClassEditorCohortUiIfOpen();
        } else if (hooks.populateClassCohortSelect) {
            hooks.populateClassCohortSelect();
        }
        renderAll();
    }

    /**
     * Draft cohort for TMS Sync "Create" — prefilled name + M/T schedule.
     * @returns {object|null} new cohort
     */
    function getLevelProfileLevel(levelId) {
        const lp = global.CCPLevelProfile;
        return lp && lp.getLevelById ? lp.getLevelById(levelId) : null;
    }

    /** Red–Navy: primary block. Purple and above and (pre-)middle school: secondary. */
    function defaultBlockForLevel(levelId) {
        const lp = global.CCPLevelProfile;
        return lp && lp.defaultScheduleBlockForLevel ? lp.defaultScheduleBlockForLevel(levelId) : 'primary';
    }

    function createCohortDraftFromTms(options) {
        if (!hooks || (hooks.isViewOnly && hooks.isViewOnly())) {
            return null;
        }
        const opts = options || {};
        const appData = hooks.getAppData();
        if (!Array.isArray(appData.cohorts)) {
            appData.cohorts = [];
        }
        const schedulePattern = opts.schedulePattern === 'tth' ? 'tth' : 'mwf';
        const meetingDays =
            Array.isArray(opts.meetingDays) && opts.meetingDays.length
                ? opts.meetingDays.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6)
                : schedulePattern === 'tth'
                  ? [2, 4]
                  : [1, 3, 5];
        const cohort = {
            id: hooks.generateId(),
            // Prefill name for the editor UX, but mark draft so cancel can remove it.
            name: normalizeStr(opts.name),
            isDraft: true,
            level: normalizeStr(opts.level),
            levelPreset: normalizeStr(opts.levelPreset) || normalizeStr(opts.level),
            grade: normalizeStr(opts.grade),
            color: getNextCohortColor(appData),
            schedulePattern,
            meetingDays: meetingDays.length ? meetingDays : schedulePattern === 'tth' ? [2, 4] : [1, 3, 5],
            periodCount: 0,
            scheduleBlock: normalizeStr(opts.scheduleBlock) || defaultBlockForLevel(normalizeStr(opts.levelPreset) || normalizeStr(opts.level)),
            blockDefaultV: 1,
            subjectSlots: [],
            classIds: [],
            students: [],
            homeroomTeacherUserId: '',
            homeroomTeacherName: '',
            homeroomDaySuffix: '',
            tmsBlockStart: normalizeStr(opts.tmsBlockStart),
            tmsBlockEnd: normalizeStr(opts.tmsBlockEnd),
            tmsSuggestedPeriod:
                opts.tmsSuggestedPeriod != null && opts.tmsSuggestedPeriod !== ''
                    ? Number(opts.tmsSuggestedPeriod)
                    : null,
            tmsSuggestedTimeSlotId: normalizeStr(opts.tmsSuggestedTimeSlotId)
        };
        if (cohort.tmsSuggestedPeriod != null && Number.isNaN(cohort.tmsSuggestedPeriod)) {
            cohort.tmsSuggestedPeriod = null;
        }
        appData.cohorts.push(cohort);
        selectedCohortId = cohort.id;
        persistSelectedCohortId();
        hooks.saveData();
        if (global.CCPSetupBoard && global.CCPSetupBoard.setActiveBoardView) {
            global.CCPSetupBoard.setActiveBoardView(schedulePattern === 'tth' ? 'tth' : 'mwf');
        }
        global.__ccpFocusCohortName = true;
        renderAll();
        return cohort;
    }

    function openCohortEditorForId(cohortId) {
        const id = normalizeStr(cohortId);
        if (!id || !hooks) {
            return false;
        }
        const appData = hooks.getAppData();
        const cohort = (appData.cohorts || []).find((c) => c && c.id === id);
        if (!cohort) {
            return false;
        }
        selectedCohortId = id;
        persistSelectedCohortId();
        openCohortEditor();
        return true;
    }

    /**
     * Remove a Sync-created draft on cancel.
     * Removes when still flagged isDraft, or when nameless (legacy drafts).
     */
    function removeNamelessCohortDraft(cohortId) {
        const id = normalizeStr(cohortId);
        if (!id || !hooks) {
            return false;
        }
        const appData = hooks.getAppData();
        const idx = (appData.cohorts || []).findIndex((c) => c && c.id === id);
        if (idx < 0) {
            return false;
        }
        const cohort = appData.cohorts[idx];
        const isDraft = !!(cohort && cohort.isDraft);
        if (!isDraft && normalizeStr(cohort && cohort.name)) {
            return false;
        }
        appData.cohorts.splice(idx, 1);
        if (selectedCohortId === id) {
            selectedCohortId = '';
            persistSelectedCohortId();
        }
        hooks.saveData();
        renderAll();
        return true;
    }

    const cohortEditorCloseListeners = [];

    function onCohortEditorClosed(listener) {
        if (typeof listener !== 'function') {
            return () => {};
        }
        cohortEditorCloseListeners.push(listener);
        return () => {
            const i = cohortEditorCloseListeners.indexOf(listener);
            if (i >= 0) {
                cohortEditorCloseListeners.splice(i, 1);
            }
        };
    }

    function notifyCohortEditorClosed() {
        cohortEditorCloseListeners.slice().forEach((fn) => {
            try {
                fn();
            } catch (err) {
                console.error(err);
            }
        });
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
            opt.textContent = displayName(c.name || c.id);
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

    function resolveHomeroomLabel(cohort) {
        const name = normalizeStr(cohort && cohort.homeroomTeacherName);
        if (name) {
            return name;
        }
        const uid = normalizeStr(cohort && cohort.homeroomTeacherUserId);
        if (!uid) {
            return '';
        }
        const teachers = hooks && typeof hooks.listTeachers === 'function' ? hooks.listTeachers() : [];
        const match = teachers.find((row) => normalizeStr(row && row.userId) === uid);
        if (match) {
            return normalizeStr(match.displayName) || uid;
        }
        return uid;
    }

    function printHrTeacherList() {
        const dataApi = global.CCPHrTeacherList;
        const printApi = global.CCPHrTeacherListPrint;
        if (!dataApi || !printApi || typeof dataApi.buildRows !== 'function') {
            if (hooks && hooks.showMessage) {
                hooks.showMessage(t('cohortsModuleMissing'), true);
            }
            return;
        }
        const appData = hooks.getAppData();
        const cohorts = (appData.cohorts || []).filter((c) => c && c.id && !c.isArchiveCohort);
        if (!cohorts.length) {
            hooks.showMessage(t('cohortsPrintHrListEmpty'), true);
            return;
        }
        const rows = dataApi.buildRows(appData, {
            getAllSimsonLevels: hooks.getAllSimsonLevels,
            getDefaultSimsonLevelColors: hooks.getDefaultSimsonLevelColors,
            getEffectiveCohortPattern: (cohort, data) => getEffectiveCohortPattern(cohort, data),
            formatCohortDisplayTitle,
            getHomeroomLabel: resolveHomeroomLabel
        });
        const calendarName = hooks.getCalendarName ? hooks.getCalendarName() : '';
        const labels = {
            title: t('cohortsPrintHrListTitle'),
            colCohort: t('cohortsPrintHrListColCohort'),
            colMHrt: t('cohortsPrintHrListColMHrt'),
            colTHrt: t('cohortsPrintHrListColTHrt')
        };
        const bodyHtml = printApi.renderDocumentHtml(rows, labels, { calendarName });
        const title = calendarName ? `${labels.title} — ${calendarName}` : labels.title;
        const cssHref = hooks.getAppStylesheetHref ? hooks.getAppStylesheetHref() : '';
        const html = printApi.buildPrintDocumentHtml(bodyHtml, title, cssHref);
        if (hooks.beginPrintColorMode) {
            hooks.beginPrintColorMode();
        }
        const printWin = window.open('', '_blank');
        if (!printWin) {
            if (hooks.endPrintColorMode) {
                hooks.endPrintColorMode();
            }
            hooks.showMessage(t('printSyllabusBlocked'), true);
            return;
        }
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.document.title = title;
        printWin.document.documentElement.classList.add('print-color-mode-light');
        printWin.focus();
        const ready = typeof hooks.whenPrintWindowReady === 'function'
            ? hooks.whenPrintWindowReady
            : (_win, fn) => setTimeout(fn, 50);
        ready(printWin, () => {
            requestAnimationFrame(() => {
                printWin.addEventListener('afterprint', () => {
                    try {
                        printWin.close();
                    } catch (e) { /* ignore */ }
                    if (hooks.endPrintColorMode) {
                        hooks.endPrintColorMode();
                    }
                }, { once: true });
                printWin.print();
            });
        });
    }

    function bindOnce() {
        if (document.body.dataset.cohortsTabBound === '1') {
            return;
        }
        document.body.dataset.cohortsTabBound = '1';
        document.getElementById('cohortsAddBtn')?.addEventListener('click', () => addCohort());
        document.getElementById('cohortsPrintHrListBtn')?.addEventListener('click', () => printHrTeacherList());
        document.getElementById('cohortsGenerateAllBtn')?.addEventListener('click', (ev) => {
            const btn = ev.currentTarget;
            btn.disabled = true;
            runGenerateSubjectsForAll()
                .catch((err) => {
                    console.error(err);
                    hooks.showMessage(t('cohortsGenTmsFailed'), true);
                })
                .finally(() => {
                    btn.disabled = false;
                });
        });
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
        openCohortEditorForId,
        createCohortDraftFromTms,
        removeNamelessCohortDraft,
        onCohortEditorClosed,
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
        resolveMatrixLevel,
        planCohortGeneration,
        applyCohortGeneration,
        planBatchGeneration,
        applyBatchGeneration,
        buildBatchPreviewNode,
        withAppData,
        copyCurriculumFromPrevious,
        generateClassesForCohort,
        importFromClasses,
        inferBlankCohortSchedulesIfNeeded,
        printHrTeacherList,
        addCohort
    };
})(typeof window !== 'undefined' ? window : globalThis);
