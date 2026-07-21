/**
 * Curriculum — book sessions, class defaults, overrides (Write Now, Write Right, etc.)
 * window.CCPBooksEditor
 */
(function (global) {
    const MAX_SESSION_ROWS = 48;
    const MIN_SESSION_ROWS = 1;

    const SESSION_COLUMN_FIELDS = [
        { key: 'planTitle', selector: '.books-ed-title' },
        { key: 'planDetail', selector: '.books-ed-detail' },
        { key: 'note', selector: '.books-ed-note' }
    ];

    function getSessionColumnSelector(columnKey) {
        const col = SESSION_COLUMN_FIELDS.find((c) => c.key === columnKey);
        return col ? col.selector : '';
    }
    /** Book dropdown value when applying level defaults without a curriculum book. */
    const NO_BOOK_CURRICULUM_ID = '__no_book__';
    /** Class has no curriculum book or level-default plan assigned. */
    const NONE_CURRICULUM_ID = '__none__';
    const DEBATE_CURRICULUM_ID = '__debate__';
    const LEVEL_ONLY_PRESET_ID = 'builtin-korean-multiweekly';
    const DEBATE_PRESET_ID = 'builtin-debate';
    /** Simson middle-school level ids (중1–중3 sections). */
    const MIDDLE_SCHOOL_LEVEL_IDS = new Set([
        '\uC720\uB9C8', '\uB808\uC624', '\uD30C\uBCF4', '\uD3F4\uB77C',
        '\uD649\uC2A4', '\uD2F0\uCE74', '\uBE45\uD0A4', '\uBC14\uC774\uCEEC',
        '\uC548\uB098', '\uB0AD\uAC00', '\uB85C\uCCB4', '\uCE89\uCCB8'
    ]);
    /** Elementary Purple+ and all middle school — debate curriculum (schedule matrix). */
    const DEBATE_ELIGIBLE_LEVEL_IDS = new Set([
        'Purple', 'Yeoul', 'Saemmul', 'Garam', 'Bada', 'Byeolmaru', 'Mirinae',
        ...MIDDLE_SCHOOL_LEVEL_IDS
    ]);

    let hooks = {
        getAppData: () => ({}),
        saveData: () => {},
        t: (k) => k,
        getLang: () => 'en',
        applyLanguage: () => {},
        onBooksSaved: () => {},
        navigateToCurriculumTab: null,
        getSimsonLevelGroups: () => [],
        getSchoolGradeOptions: () => [],
        canAdoptTeamCurriculumDefault: () => false,
        canManageCurriculumCatalog: null,
        resolveBookIdForClass: null
    };

    function canManageCurriculumCatalog() {
        if (typeof hooks.canManageCurriculumCatalog === 'function') {
            return !!hooks.canManageCurriculumCatalog();
        }
        return typeof hooks.canAdoptTeamCurriculumDefault === 'function'
            && hooks.canAdoptTeamCurriculumDefault();
    }

    function ensureCurriculumRemovedIds(appData) {
        const data = appData || getAppData();
        if (!Array.isArray(data.curriculumRemovedIds)) {
            data.curriculumRemovedIds = [];
        }
        return data.curriculumRemovedIds;
    }

    function isCurriculumRemovedFromCalendar(curriculumId, appData) {
        const id = (curriculumId || '').trim();
        if (!id) {
            return false;
        }
        return ensureCurriculumRemovedIds(appData).includes(id);
    }

    function init(options = {}) {
        hooks = { ...hooks, ...options };
    }

    function getAppData() {
        return hooks.getAppData() || {};
    }

    function ensureBookOverrides(appData) {
        const data = appData || getAppData();
        if (!data.bookOverrides || typeof data.bookOverrides !== 'object') {
            data.bookOverrides = {};
        }
        return data.bookOverrides;
    }

    function ensureCurriculumOverrides(appData) {
        const data = appData || getAppData();
        if (!data.curriculumOverrides || typeof data.curriculumOverrides !== 'object') {
            data.curriculumOverrides = {};
        }
        return data.curriculumOverrides;
    }

    function slugifyBookKey(text) {
        return (text || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'book';
    }

    function bookSeriesBaseName(defaultBook, fallbackName) {
        const raw = (defaultBook || fallbackName || '').trim();
        if (!raw) {
            return fallbackName || 'Book';
        }
        return raw
            .replace(/\s+\d+\s*$/i, '')
            .replace(/\s*\((green|blue|navy|red|orange|yellow|purple)\)\s*$/i, '')
            .trim() || raw;
    }

    function deriveBookKey(preset) {
        const base = bookSeriesBaseName(preset.defaultBook, preset.fallbackName || preset.name);
        return slugifyBookKey(base);
    }

    function deepClone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function getFactoryPresetById(id) {
        if (global.CCPSyllabusPresets && global.CCPSyllabusPresets.getById) {
            return global.CCPSyllabusPresets.getById(id);
        }
        return null;
    }

    function getAllFactoryPresets() {
        if (global.CCPSyllabusPresets && global.CCPSyllabusPresets.getAll) {
            return global.CCPSyllabusPresets.getAll();
        }
        return [];
    }

    function presetIncludedInBookCatalog(preset) {
        if (!preset) {
            return false;
        }
        const templates = preset.defaultSyllabusRowTemplates;
        if (Array.isArray(templates) && templates.length > 0) {
            return true;
        }
        return !!preset.isStub;
    }

    function getFactoryPresetsForBookKey(bookKey) {
        const cid = (bookKey || '').trim();
        if (!cid) {
            return [];
        }
        return getAllFactoryPresets().filter((preset) => (
            presetIncludedInBookCatalog(preset) && deriveBookKey(preset) === cid
        ));
    }

    function normalizeRowTemplates(rows) {
        return (rows || []).map((r, i) => ({
            sessionNumber: r.sessionNumber != null ? r.sessionNumber : i + 1,
            planTitle: r.planTitle || '',
            planDetail: r.planDetail || '',
            note: r.note || ''
        }));
    }

    function getFactoryTemplatesForBook(book) {
        const ids = book && book.presetIds;
        if (!Array.isArray(ids) || !ids.length) {
            return [];
        }
        for (let i = 0; i < ids.length; i += 1) {
            const factory = getFactoryPresetById(ids[i]);
            const templates = factory && factory.defaultSyllabusRowTemplates;
            if (Array.isArray(templates) && templates.length) {
                return normalizeRowTemplates(templates);
            }
        }
        return [];
    }

    function factoryClassDefaultsFromPreset(preset) {
        if (!preset) {
            return {};
        }
        const out = {};
        if (preset.defaultTotalLessons != null) {
            out.defaultTotalLessons = preset.defaultTotalLessons;
        }
        if (preset.scheduleModel) {
            out.scheduleModel = preset.scheduleModel;
        }
        if (Array.isArray(preset.defaultMeetingDays) && preset.defaultMeetingDays.length) {
            out.defaultMeetingDays = [...preset.defaultMeetingDays];
        }
        if (preset.defaultCompressionMode) {
            out.defaultCompressionMode = preset.defaultCompressionMode;
        }
        if (preset.lessonLabelMode) {
            out.lessonLabelMode = preset.lessonLabelMode;
        }
        if (preset.homeworkImportMode) {
            out.homeworkImportMode = preset.homeworkImportMode;
        }
        if (preset.usesUnitPairLabels != null) {
            out.usesUnitPairLabels = !!preset.usesUnitPairLabels;
        }
        if (preset.level) {
            out.levelPreset = preset.level;
        }
        return out;
    }

    function mergeClassDefaults(base, patch) {
        const out = { ...(base || {}) };
        if (!patch || typeof patch !== 'object') {
            return out;
        }
        Object.keys(patch).forEach((key) => {
            const v = patch[key];
            if (v === undefined || v === null) {
                return;
            }
            if (typeof v === 'string' && v.trim() === '') {
                return;
            }
            out[key] = deepClone(v);
        });
        return out;
    }

    function getCurriculumRecord(curriculumId, appData) {
        const id = (curriculumId || '').trim();
        if (!id) {
            return null;
        }
        const overrides = ensureCurriculumOverrides(appData);
        const raw = overrides[id];
        if (!raw || typeof raw !== 'object') {
            return null;
        }
        const sessions = raw.sessions
            ? normalizeRowTemplates(raw.sessions)
            : (raw.defaultSyllabusRowTemplates
                ? normalizeRowTemplates(raw.defaultSyllabusRowTemplates)
                : []);
        const applicableLevels = Array.isArray(raw.applicableLevels)
            ? raw.applicableLevels
            : (Array.isArray(raw.levels) ? raw.levels : undefined);
        return {
            ...raw,
            sessions,
            applicableLevels,
            classDefaults: raw.classDefaults && typeof raw.classDefaults === 'object'
                ? raw.classDefaults
                : {},
            types: raw.types && typeof raw.types === 'object' ? raw.types : {}
        };
    }

    function getTeamDefaultRecord(curriculumId, appData) {
        const id = (curriculumId || '').trim();
        if (!id) {
            return null;
        }
        const raw = ensureCurriculumOverrides(appData)[id];
        if (!raw || !raw.teamDefault || typeof raw.teamDefault !== 'object') {
            return null;
        }
        const td = raw.teamDefault;
        const sessions = Array.isArray(td.sessions) ? normalizeRowTemplates(td.sessions) : [];
        if (!sessions.length) {
            return null;
        }
        return {
            sessions,
            classDefaults: td.classDefaults && typeof td.classDefaults === 'object'
                ? deepClone(td.classDefaults)
                : {},
            applicableLevels: Array.isArray(td.applicableLevels)
                ? td.applicableLevels.filter(Boolean)
                : undefined,
            bookTitle: td.bookTitle != null ? String(td.bookTitle).trim() : '',
            syllabusGeneralNotes: td.syllabusGeneralNotes != null ? String(td.syllabusGeneralNotes) : '',
            adoptedAt: td.adoptedAt || ''
        };
    }

    function getFactorySyllabusGeneralNotes(curriculumId, presetId) {
        const pid = (presetId || '').trim();
        if (pid) {
            const preset = getFactoryPresetById(pid);
            const notes = preset && preset.syllabusGeneralNotes;
            return notes ? String(notes).trim() : '';
        }
        const presets = getFactoryPresetsForBookKey(curriculumId);
        for (let i = 0; i < presets.length; i += 1) {
            const notes = presets[i] && presets[i].syllabusGeneralNotes;
            if (notes && String(notes).trim()) {
                return String(notes).trim();
            }
        }
        return '';
    }

    function getCurriculumSyllabusGeneralNotes(curriculumId, presetId, appData) {
        const id = (curriculumId || '').trim();
        if (!id) {
            return '';
        }
        const cur = getCurriculumRecord(id, appData);
        if (cur && cur.syllabusGeneralNotes != null && String(cur.syllabusGeneralNotes).trim()) {
            return String(cur.syllabusGeneralNotes).trim();
        }
        const team = getTeamDefaultRecord(id, appData);
        if (team && team.syllabusGeneralNotes && String(team.syllabusGeneralNotes).trim()) {
            return String(team.syllabusGeneralNotes).trim();
        }
        return getFactorySyllabusGeneralNotes(id, presetId);
    }

    function resolveSyllabusGeneralNotesForClass(classData, appData) {
        if (!classData) {
            return '';
        }
        const classNotes = String(classData.syllabusGeneralNotes ?? '').trim();
        if (classNotes) {
            return classNotes;
        }
        if (isNoCurriculum(classData.curriculumId)) {
            return '';
        }
        const data = appData || getAppData();
        let curriculumId = '';
        if (typeof hooks.resolveBookIdForClass === 'function') {
            curriculumId = String(hooks.resolveBookIdForClass(classData) || '').trim();
        }
        if (!curriculumId) {
            curriculumId = String(classData.curriculumId || '').trim();
            if (!curriculumId && classData.classTypeId) {
                const preset = getFactoryPresetById(classData.classTypeId);
                if (preset) {
                    curriculumId = deriveBookKey(preset);
                }
            }
        }
        if (!curriculumId) {
            return '';
        }
        const level = String(classData.levelPreset || classData.levelCustom || '').trim();
        const presetId = resolvePresetFromLevelAndBook(level, curriculumId, data);
        return getCurriculumSyllabusGeneralNotes(curriculumId, presetId, data);
    }

    function customCurriculumAdoptedAsTeamDefault(bookId, book, appData) {
        return !!(book && book.isCustom && !book.hasOverride && getTeamDefaultRecord(bookId, appData));
    }

    function getBaselineSessionRows(bookId, appData, shippedFactoryRows) {
        const team = getTeamDefaultRecord(bookId, appData);
        if (team && team.sessions.length) {
            return team.sessions;
        }
        return normalizeRowTemplates(shippedFactoryRows || []);
    }

    function sessionsDifferFromBaseline(effectiveRows, bookId, appData, shippedFactoryRows) {
        const baseline = getBaselineSessionRows(bookId, appData, shippedFactoryRows);
        const effective = normalizeRowTemplates(effectiveRows);
        return JSON.stringify(effective) !== JSON.stringify(baseline);
    }

    function getEffectiveSessionBaselineCount(bookId, appData, shippedFactoryCount) {
        const team = getTeamDefaultRecord(bookId, appData);
        if (team && team.sessions.length) {
            return team.sessions.length;
        }
        return shippedFactoryCount;
    }

    function formatTeamDefaultDate(iso) {
        if (!iso) {
            return '';
        }
        try {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) {
                return iso;
            }
            const lang = hooks.getLang();
            return d.toLocaleDateString(lang === 'ko' ? 'ko-KR' : undefined);
        } catch (_) {
            return iso;
        }
    }

    function syncLegacyBookOverride(curriculumId, sessions, appData) {
        const overrides = ensureBookOverrides(appData);
        const book = getBookById(curriculumId, appData);
        const factory = book ? getFactoryTemplatesForBook(book) : [];
        const normalized = normalizeRowTemplates(sessions);
        if (JSON.stringify(normalized) === JSON.stringify(factory)) {
            delete overrides[curriculumId];
        } else {
            overrides[curriculumId] = {
                defaultSyllabusRowTemplates: normalized,
                updatedAt: new Date().toISOString()
            };
        }
    }

    function migrateLegacyToCurriculum(appData) {
        const data = appData || getAppData();
        const curricula = ensureCurriculumOverrides(data);
        const books = ensureBookOverrides(data);
        Object.keys(books).forEach((id) => {
            const leg = books[id];
            if (!leg || typeof leg !== 'object') {
                return;
            }
            if (!curricula[id]) {
                curricula[id] = {
                    sessions: normalizeRowTemplates(leg.defaultSyllabusRowTemplates),
                    classDefaults: {},
                    types: {},
                    updatedAt: leg.updatedAt || new Date().toISOString()
                };
            } else if (!curricula[id].sessions?.length && leg.defaultSyllabusRowTemplates) {
                // Record exists without personal sessions (cleared or meta-only save).
                // Drop stale legacy so factory / teamDefault supply current templates.
                delete books[id];
            }
        });
        const typeOv = data.defaultClassTypeOverrides;
        if (typeOv && typeof typeOv === 'object') {
            getAllFactoryPresets().forEach((preset) => {
                const patch = typeOv[preset.id];
                if (!patch || !Array.isArray(patch.defaultSyllabusRowTemplates)) {
                    return;
                }
                const cid = deriveBookKey(preset);
                if (!curricula[cid]) {
                    curricula[cid] = { sessions: [], classDefaults: {}, types: {} };
                }
                if (!curricula[cid].sessions.length) {
                    curricula[cid].sessions = normalizeRowTemplates(patch.defaultSyllabusRowTemplates);
                }
                delete patch.defaultSyllabusRowTemplates;
            });
        }
    }

    function discoverBooks(appData) {
        migrateLegacyToCurriculum(appData);
        const api = global.CCPSyllabusPresets;
        if (!api || !api.getAll) {
            return [];
        }
        const bookOv = ensureBookOverrides(appData);
        const byKey = new Map();
        api.getAll().forEach((preset) => {
            if (!presetIncludedInBookCatalog(preset)) {
                return;
            }
            const key = deriveBookKey(preset);
            if (!byKey.has(key)) {
                byKey.set(key, {
                    id: key,
                    name: bookSeriesBaseName(preset.defaultBook, preset.fallbackName || preset.name),
                    presetIds: [],
                    levels: [],
                    defaultTotalLessons: preset.defaultTotalLessons,
                    lessonLabelMode: preset.lessonLabelMode || '',
                    programTrack: preset.programTrack || ''
                });
            }
            const book = byKey.get(key);
            book.presetIds.push(preset.id);
            if (preset.debateBand && global.CCPCurriculaData && global.CCPCurriculaData.getDebateBandLevels) {
                book.debateBand = preset.debateBand;
                book.programTrack = 'debate';
                book.levels = global.CCPCurriculaData.getDebateBandLevels(preset.debateBand);
            } else if (preset.level && !book.levels.includes(preset.level)) {
                book.levels.push(preset.level);
            }
            if (preset.defaultTotalLessons > (book.defaultTotalLessons || 0)) {
                book.defaultTotalLessons = preset.defaultTotalLessons;
            }
        });
        const curricula = ensureCurriculumOverrides(appData);
        Object.keys(curricula).forEach((id) => {
            const raw = curricula[id];
            if (!raw || typeof raw !== 'object' || !raw.isCustom || byKey.has(id)) {
                return;
            }
            const sessions = raw.sessions
                ? normalizeRowTemplates(raw.sessions)
                : [];
            const title = (raw.bookTitle || id).trim();
            const levels = Array.isArray(raw.applicableLevels)
                ? raw.applicableLevels.filter(Boolean)
                : (Array.isArray(raw.levels) ? raw.levels.filter(Boolean) : []);
            const applicable = getStoredApplicableLevels(id, appData, levels, false);
            const shippedFactoryRows = [];
            const hasOverride = sessions.length
                && sessionsDifferFromBaseline(sessions, id, appData, shippedFactoryRows);
            const baselineSessionCount = getEffectiveSessionBaselineCount(
                id,
                appData,
                sessions.length || (raw.classDefaults && raw.classDefaults.defaultTotalLessons) || 4
            );
            byKey.set(id, {
                id,
                name: title,
                displayName: title,
                presetIds: [],
                factoryPresetLevels: levels.slice(),
                levels: applicable.levels,
                applicableIsAllLevels: applicable.isAllLevels,
                isCustom: true,
                defaultTotalLessons: raw.classDefaults && raw.classDefaults.defaultTotalLessons != null
                    ? raw.classDefaults.defaultTotalLessons
                    : (sessions.length || 4),
                lessonLabelMode: (raw.classDefaults && raw.classDefaults.lessonLabelMode) || '',
                programTrack: '',
                sessionCount: sessions.length,
                factorySessionCount: 0,
                baselineSessionCount,
                hasOverride,
                levelsLabel: applicable.levelsLabel
            });
        });
        return [...byKey.values()]
            .map((book) => {
                if (book.isVirtualDebate) {
                    return { ...book };
                }
                if (book.isCustom) {
                    const cur = getCurriculumRecord(book.id, appData);
                    const effectiveSessions = cur && cur.sessions.length ? cur.sessions : [];
                    return {
                        ...book,
                        sessionCount: effectiveSessions.length || book.sessionCount,
                        hasOverride: effectiveSessions.length
                            ? sessionsDifferFromBaseline(
                                effectiveSessions,
                                book.id,
                                appData,
                                []
                            )
                            : book.hasOverride,
                        baselineSessionCount: getEffectiveSessionBaselineCount(
                            book.id,
                            appData,
                            effectiveSessions.length || book.sessionCount
                        )
                    };
                }
                const cur = getCurriculumRecord(book.id, appData);
                const legacySessions = bookOv[book.id] && bookOv[book.id].defaultSyllabusRowTemplates;
                const hasCurSessions = !!(cur && cur.sessions && cur.sessions.length);
                const hasLegacy = !!(legacySessions && legacySessions.length);
                const factoryRows = getFactoryTemplatesForBook(book);
                let effectiveRows = factoryRows;
                if (hasCurSessions) {
                    effectiveRows = cur.sessions;
                } else if (hasLegacy) {
                    effectiveRows = normalizeRowTemplates(legacySessions);
                }
                const hasOverride = (hasCurSessions || hasLegacy)
                    && sessionsDifferFromBaseline(effectiveRows, book.id, appData, factoryRows);
                const baselineSessionCount = getEffectiveSessionBaselineCount(
                    book.id,
                    appData,
                    factoryRows.length
                );
                const displayName = (cur && cur.bookTitle) || book.name;
                const factoryPresetLevels = book.levels.slice();
                const applicable = getStoredApplicableLevels(book.id, appData, factoryPresetLevels, false);
                return {
                    ...book,
                    name: displayName,
                    displayName,
                    factoryPresetLevels,
                    levels: applicable.levels,
                    applicableIsAllLevels: applicable.isAllLevels,
                    sessionCount: effectiveRows.length,
                    factorySessionCount: factoryRows.length,
                    baselineSessionCount,
                    hasOverride,
                    levelsLabel: applicable.levelsLabel
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name))
            .filter((book) => !isCurriculumRemovedFromCalendar(book.id, appData));
    }

    const discoverCurricula = discoverBooks;

    function isCustomCurriculum(curriculumId, appData) {
        const id = (curriculumId || '').trim();
        if (!id) {
            return false;
        }
        const raw = ensureCurriculumOverrides(appData)[id];
        return !!(raw && raw.isCustom);
    }

    function getBookById(bookId, appData) {
        return discoverBooks(appData).find((b) => b.id === bookId) || null;
    }

    function uniqueCurriculumId(baseTitle, appData) {
        const curricula = ensureCurriculumOverrides(appData);
        const base = slugifyBookKey(baseTitle) || 'curriculum';
        let candidate = base;
        let n = 2;
        while (curricula[candidate]) {
            candidate = `${base}-${n}`;
            n += 1;
        }
        return candidate;
    }

    function uniqueCurriculumTitle(baseTitle, appData) {
        const books = discoverBooks(appData || getAppData());
        const names = new Set(
            books.map((b) => (b.displayName || b.name || '').trim().toLowerCase()).filter(Boolean)
        );
        const base = (baseTitle || '').trim();
        if (!base) {
            return 'Curriculum';
        }
        if (!names.has(base.toLowerCase())) {
            return base;
        }
        let n = 2;
        while (names.has(`${base} (${n})`.toLowerCase())) {
            n += 1;
        }
        return `${base} (${n})`;
    }

    function createCurriculum(patch, appData) {
        const data = appData || getAppData();
        const title = (patch && (patch.bookTitle || patch.title) || '').trim();
        if (!title) {
            return null;
        }
        const id = uniqueCurriculumId(title, data);
        const sessions = patch && patch.sessions && patch.sessions.length
            ? normalizeRowTemplates(patch.sessions)
            : [{ sessionNumber: 1, planTitle: '', planDetail: '', note: '' }];
        const lessonCount = patch && patch.classDefaults && patch.classDefaults.defaultTotalLessons != null
            ? patch.classDefaults.defaultTotalLessons
            : sessions.length;
        const curricula = ensureCurriculumOverrides(data);
        const applicableLevels = Array.isArray(patch && patch.applicableLevels)
            ? patch.applicableLevels.filter(Boolean)
            : (Array.isArray(patch && patch.levels) ? patch.levels.filter(Boolean) : []);
        curricula[id] = {
            isCustom: true,
            bookTitle: title,
            applicableLevels,
            levels: applicableLevels,
            sessions,
            classDefaults: {
                defaultTotalLessons: lessonCount,
                defaultBook: title,
                ...(patch && patch.classDefaults ? patch.classDefaults : {})
            },
            types: {},
            updatedAt: new Date().toISOString()
        };
        hooks.saveData();
        hooks.onBooksSaved();
        return id;
    }

    function deleteCustomCurriculum(curriculumId, appData) {
        const id = (curriculumId || '').trim();
        if (!id || !isCustomCurriculum(id, appData)) {
            return false;
        }
        const curricula = ensureCurriculumOverrides(appData);
        delete curricula[id];
        const overrides = ensureBookOverrides(appData);
        delete overrides[id];
        hooks.saveData();
        hooks.onBooksSaved();
        return true;
    }

    function removeBuiltinCurriculumFromCalendar(curriculumId, appData) {
        const id = (curriculumId || '').trim();
        if (!id || !canManageCurriculumCatalog()) {
            return false;
        }
        if (isCustomCurriculum(id, appData) || isNoCurriculum(id) || isNoBookCurriculum(id)) {
            return false;
        }
        if (id === DEBATE_CURRICULUM_ID) {
            return false;
        }
        const removed = ensureCurriculumRemovedIds(appData);
        if (!removed.includes(id)) {
            removed.push(id);
        }
        const curricula = ensureCurriculumOverrides(appData);
        delete curricula[id];
        delete curricula[DEBATE_CURRICULUM_ID];
        const overrides = ensureBookOverrides(appData);
        delete overrides[id];
        hooks.saveData();
        hooks.onBooksSaved();
        return true;
    }

    function removeCurriculumFromCalendar(curriculumId, appData) {
        const id = (curriculumId || '').trim();
        if (!id) {
            return false;
        }
        if (isCustomCurriculum(id, appData)) {
            return deleteCustomCurriculum(id, appData);
        }
        return removeBuiltinCurriculumFromCalendar(id, appData);
    }

    function restoreRemovedFactoryCurricula(appData) {
        if (!canManageCurriculumCatalog()) {
            return false;
        }
        const data = appData || getAppData();
        if (!Array.isArray(data.curriculumRemovedIds) || !data.curriculumRemovedIds.length) {
            return true;
        }
        data.curriculumRemovedIds = [];
        hooks.saveData();
        hooks.onBooksSaved();
        return true;
    }

    function canDeleteCurriculumInEditor(curriculumId, appData) {
        const id = (curriculumId || '').trim();
        if (!id || isNoCurriculum(id) || isNoBookCurriculum(id) || id === DEBATE_CURRICULUM_ID) {
            return false;
        }
        const book = getBookById(id, appData);
        if (!book) {
            return false;
        }
        if (book.isCustom) {
            return true;
        }
        return canManageCurriculumCatalog();
    }

    function confirmAndDeleteCurriculum(curriculumId, appData) {
        const id = (curriculumId || '').trim();
        if (!canDeleteCurriculumInEditor(id, appData)) {
            return false;
        }
        const name = getCurriculumDisplayName(id, appData);
        const isCustom = isCustomCurriculum(id, appData);
        const msgKey = isCustom ? 'curriculumDeleteConfirm' : 'curriculumDeleteBuiltinConfirm';
        const template = hooks.t(msgKey);
        const msg = template.includes('{name}')
            ? template.replace('{name}', name)
            : template;
        if (!confirm(msg)) {
            return false;
        }
        return removeCurriculumFromCalendar(id, appData);
    }

    function duplicateCurriculum(sourceId, appData) {
        const data = appData || getAppData();
        const id = (sourceId || '').trim();
        if (!id) {
            return null;
        }
        const book = getBookById(id, data);
        if (!book) {
            return null;
        }
        const sessions = deepClone(getTemplatesForBookId(id, data));
        const cur = getCurriculumRecord(id, data);
        const classDefaults = deepClone(cur && cur.classDefaults ? cur.classDefaults : {});
        const isDebate = isDebateBookRecord(book) || book.isVirtualDebate;
        const factoryLevels = book.levels && book.levels.length
            ? book.levels
            : (isDebate ? getDebateDefaultApplicableLevels() : []);
        const applicable = getStoredApplicableLevels(id, data, factoryLevels, isDebate);
        const applicableLevels = applicable.isAllLevels ? [] : applicable.levels.slice();
        const baseTitle = (cur && cur.bookTitle) || book.displayName || book.name || id;
        const newTitle = uniqueCurriculumTitle(baseTitle, data);
        const newId = createCurriculum({
            bookTitle: newTitle,
            sessions,
            applicableLevels,
            classDefaults
        }, data);
        if (newId) {
            const rec = ensureCurriculumOverrides(data)[newId];
            if (rec) {
                rec.duplicatedFrom = id;
                const notes = getCurriculumSyllabusGeneralNotes(id, null, data);
                if (notes) {
                    rec.syllabusGeneralNotes = notes;
                }
                hooks.saveData();
            }
        }
        return newId;
    }

    function resolveDebatePresetIdForLevel(level) {
        const api = global.CCPCurriculaData;
        return api && api.resolveDebatePresetId
            ? api.resolveDebatePresetId(level)
            : null;
    }

    function resolveDebateBookIdForLevel(level, appData) {
        const presetId = resolveDebatePresetIdForLevel(level);
        if (!presetId) {
            return null;
        }
        const preset = getFactoryPresetById(presetId);
        if (!preset) {
            return null;
        }
        return deriveBookKey(preset);
    }

    function normalizeDebateCurriculumId(curriculumId, level, appData) {
        const cid = (curriculumId || '').trim();
        if (cid === DEBATE_CURRICULUM_ID || !cid) {
            return resolveDebateBookIdForLevel(level, appData) || cid;
        }
        return cid;
    }

    function isDebateBookRecord(book) {
        return !!(book && (book.programTrack === 'debate' || book.debateBand));
    }

    function getCurriculumDisplayName(curriculumId, appData) {
        const id = (curriculumId || '').trim();
        if (id === DEBATE_CURRICULUM_ID) {
            const label = hooks.t('classCurriculumDebate');
            return label && label !== 'classCurriculumDebate' ? label : 'Debate';
        }
        if (id === NO_BOOK_CURRICULUM_ID) {
            const label = hooks.t('classCurriculumNoBook');
            return label && label !== 'classCurriculumNoBook' ? label : 'No book';
        }
        if (id === NONE_CURRICULUM_ID) {
            const label = hooks.t('classCurriculumNone');
            return label && label !== 'classCurriculumNone' ? label : 'No curriculum';
        }
        const book = getBookById(curriculumId, appData);
        if (book) {
            return book.displayName || book.name;
        }
        const cur = getCurriculumRecord(curriculumId, appData);
        return (cur && cur.bookTitle) || curriculumId;
    }

    function stripTrailingParentheticals(label) {
        let s = String(label || '').trim();
        if (!s) {
            return '';
        }
        let prev;
        do {
            prev = s;
            s = s.replace(/\s*\([^)]*\)\s*$/g, '').trim();
        } while (s !== prev);
        return s;
    }

    /** Short label for calendar lesson bars (avoids long preset subtitles like “elem. & middle school”). */
    function getCurriculumCalendarLabel(curriculumId, appData) {
        const id = (curriculumId || '').trim();
        if (!id) {
            return '';
        }
        if (id === DEBATE_CURRICULUM_ID) {
            const label = hooks.t('classCurriculumDebate');
            return label && label !== 'classCurriculumDebate' ? label : 'Debate';
        }
        if (id === NO_BOOK_CURRICULUM_ID) {
            const label = hooks.t('classCurriculumNoBook');
            return label && label !== 'classCurriculumNoBook' ? label : 'No book';
        }
        const dataApi = global.CCPCurriculaData;
        if (dataApi && dataApi.getById) {
            const preset = dataApi.getById(id);
            if (preset && preset.fallbackName) {
                return stripTrailingParentheticals(preset.fallbackName);
            }
            if (preset && preset.name) {
                return stripTrailingParentheticals(preset.name);
            }
        }
        const factoryPresets = getFactoryPresetsForBookKey(id);
        if (factoryPresets.length) {
            const p = factoryPresets[0];
            if (p.fallbackName) {
                return stripTrailingParentheticals(p.fallbackName);
            }
            if (p.name) {
                return stripTrailingParentheticals(p.name);
            }
        }
        const full = getCurriculumDisplayName(id, appData);
        if (!full) {
            return '';
        }
        const stripped = stripTrailingParentheticals(full);
        return stripped || full;
    }

    function getTemplatesForBookId(bookId, appData) {
        migrateLegacyToCurriculum(appData);
        let templates = [];
        const cur = getCurriculumRecord(bookId, appData);
        if (cur && cur.sessions.length) {
            templates = cur.sessions;
        } else {
            const team = getTeamDefaultRecord(bookId, appData);
            if (team && team.sessions.length) {
                templates = team.sessions;
            } else if (isDebateCurriculum(bookId)) {
                const book = getBookById(bookId, appData);
                if (book && !book.isVirtualDebate) {
                    templates = getFactoryTemplatesForBook(book);
                } else {
                    const debateCur = getCurriculumRecord(DEBATE_CURRICULUM_ID, appData);
                    templates = debateCur && debateCur.sessions.length
                        ? debateCur.sessions
                        : getFactoryDebateSessions();
                }
            } else {
                const book = getBookById(bookId, appData);
                if (book && book.isCustom) {
                    templates = [];
                } else {
                    templates = getFactoryTemplatesForBook(book);
                }
            }
        }
        if (!templates.length) {
            const overrides = ensureBookOverrides(appData);
            if (overrides[bookId] && Array.isArray(overrides[bookId].defaultSyllabusRowTemplates)) {
                templates = normalizeRowTemplates(overrides[bookId].defaultSyllabusRowTemplates);
            }
        }
        return templates;
    }

    function getTemplatesForPresetId(presetId, appData) {
        const factory = getFactoryPresetById(presetId);
        if (!factory || !Array.isArray(factory.defaultSyllabusRowTemplates)) {
            return null;
        }
        const key = deriveBookKey(factory);
        const custom = getTemplatesForBookId(key, appData);
        return custom.length ? custom : normalizeRowTemplates(factory.defaultSyllabusRowTemplates);
    }

    function applyBookTemplatesToPreset(merged, appData) {
        if (!merged || !merged.id) {
            return merged;
        }
        const tpl = getTemplatesForPresetId(merged.id, appData);
        if (tpl && tpl.length) {
            merged.defaultSyllabusRowTemplates = deepClone(tpl);
        }
        return merged;
    }

    function isNoCurriculum(curriculumId) {
        const cid = (curriculumId || '').trim();
        return !cid || cid === NONE_CURRICULUM_ID;
    }

    function isNoBookCurriculum(curriculumId) {
        const cid = (curriculumId || '').trim();
        return cid === NO_BOOK_CURRICULUM_ID;
    }

    function normalizeCurriculumIdForStorage(curriculumId) {
        const cid = (curriculumId || '').trim();
        if (!cid || cid === NONE_CURRICULUM_ID) {
            return NONE_CURRICULUM_ID;
        }
        return cid;
    }

    function curriculumExists(curriculumId, appData) {
        const cid = (curriculumId || '').trim();
        if (!cid || isNoCurriculum(cid)) {
            return false;
        }
        if (isCurriculumRemovedFromCalendar(cid, appData)) {
            return false;
        }
        if (isNoBookCurriculum(cid) || cid === DEBATE_CURRICULUM_ID || isDebateCurriculum(cid)) {
            return true;
        }
        return !!getBookById(cid, appData);
    }

    function getClassCurriculumWarningKind(classData, appData) {
        if (!classData) {
            return null;
        }
        const stored = String(classData.curriculumId ?? '').trim();
        if (!stored || stored === NONE_CURRICULUM_ID) {
            return 'none';
        }
        if (isNoBookCurriculum(stored) || stored === DEBATE_CURRICULUM_ID) {
            return null;
        }
        if (isDebateCurriculum(stored)) {
            return null;
        }
        if (isCurriculumRemovedFromCalendar(stored, appData)) {
            return 'missing';
        }
        return curriculumExists(stored, appData) ? null : 'missing';
    }

    function isDebateCurriculum(curriculumId) {
        const cid = (curriculumId || '').trim();
        if (cid === DEBATE_CURRICULUM_ID) {
            return true;
        }
        const book = getBookById(cid, getAppData());
        return isDebateBookRecord(book);
    }

    function isMiddleSchoolSimsonLevel(level) {
        return MIDDLE_SCHOOL_LEVEL_IDS.has((level || '').trim());
    }

    function getDebateDefaultApplicableLevels() {
        return [...DEBATE_ELIGIBLE_LEVEL_IDS];
    }

    function getStoredApplicableLevels(curriculumId, appData, factoryLevels, isDebate) {
        const cur = getCurriculumRecord(curriculumId, appData);
        if (cur && Array.isArray(cur.applicableLevels)) {
            if (!cur.applicableLevels.length) {
                const allLabel = hooks.t('curriculumAllLevels');
                return {
                    levels: [],
                    levelsLabel: allLabel && allLabel !== 'curriculumAllLevels' ? allLabel : 'All levels',
                    isAllLevels: true
                };
            }
            const sorted = cur.applicableLevels.slice().sort();
            return { levels: sorted, levelsLabel: sorted.join(', '), isAllLevels: false };
        }
        if (isDebate) {
            const levels = getDebateDefaultApplicableLevels();
            const label = hooks.t('curriculumDebateLevelsLabel');
            return {
                levels,
                levelsLabel: label && label !== 'curriculumDebateLevelsLabel'
                    ? label
                    : 'Purple+, Yeoul–Mirinae, middle school',
                isAllLevels: false
            };
        }
        const levels = (factoryLevels || []).slice();
        return {
            levels,
            levelsLabel: levels.length ? levels.sort().join(', ') : '—',
            isAllLevels: false
        };
    }

    function levelAllowedByApplicableLevels(applicable, levelTrim) {
        if (!applicable) {
            return false;
        }
        return applicable.isAllLevels
            || !applicable.levels.length
            || applicable.levels.includes(levelTrim);
    }

    function getBookFactoryLevelsForApplicability(book, isDebate) {
        if (!book) {
            return [];
        }
        if (isDebate) {
            return book.levels && book.levels.length
                ? book.levels.slice()
                : getDebateDefaultApplicableLevels();
        }
        if (Array.isArray(book.factoryPresetLevels) && book.factoryPresetLevels.length) {
            return book.factoryPresetLevels.slice();
        }
        return Array.isArray(book.levels) ? book.levels.slice() : [];
    }

    function bookVisibleForLevel(book, level, appData) {
        const levelTrim = (level || '').trim();
        if (!levelTrim) {
            return true;
        }
        if (!book) {
            return false;
        }
        if (book.isVirtualDebate) {
            return levelSupportsDebateCurriculum(levelTrim, appData);
        }
        const isDebate = isDebateBookRecord(book);
        const factoryLevels = getBookFactoryLevelsForApplicability(book, isDebate);
        const applicable = getStoredApplicableLevels(book.id, appData, factoryLevels, isDebate);
        if (!levelAllowedByApplicableLevels(applicable, levelTrim)) {
            return false;
        }
        if (isDebate && global.CCPCurriculaData && global.CCPCurriculaData.resolveDebateHomeworkBand) {
            const band = global.CCPCurriculaData.resolveDebateHomeworkBand(levelTrim);
            return band != null && book.debateBand === band;
        }
        return true;
    }

    function levelSupportsDebateCurriculum(level, appData) {
        const levelTrim = (level || '').trim();
        if (!levelTrim) {
            return false;
        }
        if (resolveDebatePresetIdForLevel(levelTrim)) {
            return true;
        }
        const applicable = getStoredApplicableLevels(
            DEBATE_CURRICULUM_ID,
            appData || getAppData(),
            getDebateDefaultApplicableLevels(),
            true
        );
        return levelAllowedByApplicableLevels(applicable, levelTrim);
    }

    function curriculumAppliesToLevel(book, level, appData) {
        return bookVisibleForLevel(book, level, appData);
    }

    function getFactoryDebateSessions(level) {
        const api = global.CCPCurriculaData;
        const band = api && api.resolveDebateHomeworkBand
            ? api.resolveDebateHomeworkBand(level)
            : null;
        if (band && api.buildDebateRowTemplates) {
            return normalizeRowTemplates(api.buildDebateRowTemplates(band));
        }
        return [1, 2, 3, 4].map((n) => ({
            sessionNumber: n,
            planTitle: `Day ${n}`,
            planDetail: '',
            note: ''
        }));
    }

    function getLevelOnlyPresetId(level) {
        if (!((level || '').trim())) {
            return null;
        }
        return LEVEL_ONLY_PRESET_ID;
    }

    function buildDebateMergedDefaults(level, appData, curriculumId) {
        const levelTrim = (level || '').trim();
        const bookId = normalizeDebateCurriculumId(curriculumId, levelTrim, appData);
        const presetId = resolveDebatePresetIdForLevel(levelTrim);
        const preset = presetId ? getFactoryPresetById(presetId) : null;
        const base = {
            levelPreset: levelTrim,
            defaultTotalLessons: 4,
            scheduleModel: 'debateMonthly',
            defaultCompressionMode: 'autoWhenNeeded',
            homeworkImportMode: 'debate',
            defaultBook: preset
                ? (preset.defaultBook || preset.fallbackName || 'Debate')
                : 'Debate'
        };
        const cur = getCurriculumRecord(bookId, appData)
            || getCurriculumRecord(DEBATE_CURRICULUM_ID, appData)
            || getCurriculumRecord(`level:${levelTrim}`, appData);
        if (cur && cur.classDefaults) {
            return mergeClassDefaults(base, cur.classDefaults);
        }
        return base;
    }

    function buildLevelOnlyMergedDefaults(level, appData) {
        const levelTrim = (level || '').trim();
        const base = {
            levelPreset: levelTrim,
            defaultTotalLessons: 16,
            scheduleModel: 'sequentialTerm',
            defaultCompressionMode: 'sequentialTerm',
            homeworkImportMode: 'unitPair',
            usesUnitPairLabels: true,
            defaultBook: ''
        };
        const cur = getCurriculumRecord(`level:${levelTrim}`, appData);
        if (cur && cur.classDefaults) {
            return mergeClassDefaults(base, cur.classDefaults);
        }
        return base;
    }

    function resolvePresetFromLevelAndBook(level, curriculumId, appData) {
        const levelTrim = (level || '').trim();
        const cid = (curriculumId || '').trim();
        if (isDebateCurriculum(cid) || cid === DEBATE_CURRICULUM_ID) {
            if (!levelTrim) {
                return null;
            }
            const debateBook = getBookById(cid, appData);
            if (debateBook && isDebateBookRecord(debateBook)) {
                if (!bookVisibleForLevel(debateBook, levelTrim, appData)) {
                    return null;
                }
            } else if (!levelSupportsDebateCurriculum(levelTrim, appData)) {
                return null;
            }
            const presetId = resolveDebatePresetIdForLevel(levelTrim);
            if (!presetId) {
                return null;
            }
            const expectedBookId = deriveBookKey(getFactoryPresetById(presetId));
            const normalizedCid = normalizeDebateCurriculumId(cid, levelTrim, appData);
            if (normalizedCid && normalizedCid !== DEBATE_CURRICULUM_ID && normalizedCid !== expectedBookId) {
                return null;
            }
            return presetId;
        }
        if (isNoBookCurriculum(cid)) {
            return levelTrim ? getLevelOnlyPresetId(levelTrim) : null;
        }
        const customBook = getBookById(cid, appData);
        if (customBook && customBook.isCustom) {
            if (levelTrim && !bookVisibleForLevel(customBook, levelTrim, appData)) {
                return null;
            }
            return getLevelOnlyPresetId(levelTrim || 'custom');
        }
        const bookPresets = getFactoryPresetsForBookKey(cid);
        let matches = bookPresets.filter((preset) => {
            if (!levelTrim) {
                return true;
            }
            return (preset.level || '') === levelTrim;
        });
        if (!matches.length && levelTrim) {
            const book = getBookById(cid, appData);
            const factoryLevels = getBookFactoryLevelsForApplicability(book, false);
            const applicable = getStoredApplicableLevels(cid, appData, factoryLevels, false);
            if (levelAllowedByApplicableLevels(applicable, levelTrim)) {
                if (bookPresets.length === 1) {
                    matches = bookPresets;
                } else if (bookPresets.length > 1) {
                    const exact = bookPresets.filter((p) => (p.level || '') === levelTrim);
                    if (exact.length) {
                        matches = exact;
                    } else {
                        const cur = getCurriculumRecord(cid, appData);
                        const defaultLv = cur && cur.classDefaults && cur.classDefaults.levelPreset;
                        if (defaultLv) {
                            const byDefault = bookPresets.filter((p) => (p.level || '') === defaultLv);
                            matches = byDefault.length ? byDefault : bookPresets;
                        } else {
                            matches = bookPresets;
                        }
                    }
                }
            }
        }
        if (!matches.length) {
            return null;
        }
        matches.sort((a, b) => a.id.localeCompare(b.id));
        return matches[0].id;
    }

    function getCurriculaForLevel(level, appData) {
        const levelTrim = (level || '').trim();
        return discoverBooks(appData).filter((book) => curriculumAppliesToLevel(book, levelTrim, appData));
    }

    function presetHasSyllabusTemplatesForApply(curriculumId, presetId, appData) {
        const cid = (curriculumId || '').trim();
        const pid = (presetId || '').trim();
        if (!pid) {
            return false;
        }
        if (isNoBookCurriculum(cid)) {
            return false;
        }
        if (isDebateCurriculum(cid) || isCustomCurriculum(cid, appData)) {
            const tpl = getTemplatesForBookId(cid, appData);
            return Array.isArray(tpl) && tpl.length > 0;
        }
        const factory = getFactoryPresetById(pid);
        const fromPreset = factory && factory.defaultSyllabusRowTemplates;
        if (Array.isArray(fromPreset) && fromPreset.length > 0) {
            return true;
        }
        if (factory && factory.isStub) {
            const track = factory.subjectTrack || '';
            const siblings = getFactoryPresetsForBookKey(cid);
            const hasPeerContent = siblings.some((p) => (
                p.id !== pid
                && (p.subjectTrack || '') === track
                && Array.isArray(p.defaultSyllabusRowTemplates)
                && p.defaultSyllabusRowTemplates.length > 0
            ));
            if (!hasPeerContent) {
                return false;
            }
        }
        const tpl = getTemplatesForBookId(cid, appData);
        return Array.isArray(tpl) && tpl.length > 0;
    }

    /**
     * Whether Apply from curriculum can run and why not.
     * @returns {{ ok: boolean, presetId: string|null, bookCount: number, reason: string, hasSyllabusTemplates: boolean, needsConfirm: boolean }}
     */
    function getCurriculumApplyEligibility(level, curriculumId, appData) {
        const levelTrim = (level || '').trim();
        const cid = (curriculumId || '').trim();
        const bookCount = levelTrim ? getCurriculaForLevel(levelTrim, appData).length : 0;
        const base = {
            ok: false,
            presetId: null,
            bookCount,
            reason: 'noLevel',
            hasSyllabusTemplates: false,
            needsConfirm: false
        };

        if (!levelTrim) {
            return base;
        }
        if (!cid || isNoCurriculum(cid)) {
            return { ...base, reason: 'noCurriculum' };
        }

        if (isDebateCurriculum(cid) || cid === DEBATE_CURRICULUM_ID) {
            if (!levelSupportsDebateCurriculum(levelTrim, appData)) {
                return { ...base, reason: 'debateNotSupported' };
            }
        }

        const presetId = resolvePresetFromLevelAndBook(levelTrim, cid, appData);
        const noBook = isNoBookCurriculum(cid);

        if (noBook && bookCount === 0) {
            if (!presetId) {
                return {
                    ...base,
                    reason: 'noBooksForLevel',
                    needsConfirm: false
                };
            }
            return {
                ok: true,
                presetId,
                bookCount,
                reason: 'noBooksForLevel',
                hasSyllabusTemplates: false,
                needsConfirm: true
            };
        }

        if (!presetId) {
            return {
                ...base,
                presetId: null,
                reason: noBook ? 'noBooksForLevel' : 'bookLevelMismatch',
                needsConfirm: false
            };
        }

        const hasSyllabusTemplates = presetHasSyllabusTemplatesForApply(cid, presetId, appData);
        return {
            ok: true,
            presetId,
            bookCount,
            reason: hasSyllabusTemplates ? 'ok' : 'noSyllabusTemplates',
            hasSyllabusTemplates,
            needsConfirm: false
        };
    }

    function buildMergedClassDefaults(curriculumId, presetId, appData, level) {
        const levelTrim = (level || '').trim();
        if (isDebateCurriculum(curriculumId) && levelTrim) {
            return buildDebateMergedDefaults(level, appData, curriculumId);
        }
        if (isNoBookCurriculum(curriculumId) && levelTrim) {
            return buildLevelOnlyMergedDefaults(level, appData);
        }
        const book = getBookById(curriculumId, appData);
        if (book && book.isCustom) {
            const cur = getCurriculumRecord(curriculumId, appData);
            const base = {
                defaultTotalLessons: book.defaultTotalLessons || (cur && cur.sessions.length) || 4,
                defaultBook: (cur && cur.bookTitle) || book.displayName,
                scheduleModel: 'sequentialTerm',
                defaultCompressionMode: 'sequentialTerm',
                homeworkImportMode: 'unitPair',
                usesUnitPairLabels: true
            };
            if (levelTrim) {
                base.levelPreset = levelTrim;
            }
            if (cur && cur.classDefaults) {
                return mergeClassDefaults(base, cur.classDefaults);
            }
            return base;
        }
        const factory = getFactoryPresetById(presetId);
        let merged = factoryClassDefaultsFromPreset(factory);
        const cur = getCurriculumRecord(curriculumId, appData);
        if (cur && cur.classDefaults) {
            merged = mergeClassDefaults(merged, cur.classDefaults);
        }
        if (cur && cur.types && cur.types[presetId] && cur.types[presetId].classDefaults) {
            merged = mergeClassDefaults(merged, cur.types[presetId].classDefaults);
        }
        merged.defaultBook = getCurriculumDisplayName(curriculumId, appData);
        return merged;
    }

    function curriculumRecordHasMeta(record) {
        if (!record || typeof record !== 'object') {
            return false;
        }
        if (Array.isArray(record.applicableLevels)) {
            return true;
        }
        if (record.bookTitle && String(record.bookTitle).trim()) {
            return true;
        }
        if (record.classDefaults && typeof record.classDefaults === 'object'
            && Object.keys(record.classDefaults).length) {
            return true;
        }
        if (record.syllabusGeneralNotes != null && String(record.syllabusGeneralNotes).trim()) {
            return true;
        }
        return false;
    }

    function saveBookTemplates(bookId, rowTemplates, appData, options) {
        const book = getBookById(bookId, appData);
        if (!book) {
            return false;
        }
        const normalized = normalizeRowTemplates(rowTemplates);
        if (!normalized.length) {
            return false;
        }
        const saveId = bookId;
        const curricula = ensureCurriculumOverrides(appData);
        const prev = curricula[saveId] || {};
        const prevTeamDefault = prev.teamDefault;
        const factoryRows = isDebateBookRecord(book)
            ? getFactoryTemplatesForBook(book)
            : getFactoryTemplatesForBook(book);
        const sessionsMatchFactory = JSON.stringify(normalized) === JSON.stringify(factoryRows || []);
        const opt = options || {};
        let classDefaults = { ...(prev.classDefaults || {}) };
        if (opt.classDefaults && typeof opt.classDefaults === 'object') {
            classDefaults = mergeClassDefaults(classDefaults, opt.classDefaults);
        }
        if (classDefaults.defaultTotalLessons == null) {
            classDefaults.defaultTotalLessons = normalized.length;
        }
        const titlePatch = opt.bookTitle != null
            ? String(opt.bookTitle).trim()
            : (prev.bookTitle || book.displayName);
        classDefaults.defaultBook = titlePatch || classDefaults.defaultBook || book.displayName;
        const next = {
            ...prev,
            bookTitle: titlePatch || prev.bookTitle,
            classDefaults,
            types: prev.types || {},
            updatedAt: new Date().toISOString()
        };
        if (prevTeamDefault) {
            next.teamDefault = prevTeamDefault;
        }
        if (book.isCustom) {
            next.isCustom = true;
        }
        if (isDebateBookRecord(book)) {
            next.isBuiltinDebate = true;
        }
        if (opt.applicableLevels !== undefined) {
            next.applicableLevels = Array.isArray(opt.applicableLevels)
                ? opt.applicableLevels.filter(Boolean)
                : [];
            if (book.isCustom) {
                next.levels = next.applicableLevels;
            }
        } else if (book.isCustom && !next.applicableLevels) {
            next.applicableLevels = prev.applicableLevels || prev.levels || book.levels || [];
            next.levels = next.applicableLevels;
        }
        if (opt.syllabusGeneralNotes !== undefined) {
            const notesTrim = String(opt.syllabusGeneralNotes).trim();
            const factoryNotes = getFactorySyllabusGeneralNotes(saveId, null);
            if (!notesTrim || notesTrim === factoryNotes) {
                delete next.syllabusGeneralNotes;
            } else {
                next.syllabusGeneralNotes = notesTrim;
            }
        }
        const hasTeamDefault = !!(prev.teamDefault && Array.isArray(prev.teamDefault.sessions)
            && prev.teamDefault.sessions.length);
        if (!sessionsMatchFactory || book.isCustom || isDebateBookRecord(book) || hasTeamDefault) {
            next.sessions = normalized;
        } else {
            delete next.sessions;
        }
        const hasMeta = curriculumRecordHasMeta(next);
        if (!next.sessions && !hasMeta && !book.isCustom && !isDebateBookRecord(book)) {
            if (prev.teamDefault) {
                const kept = { teamDefault: prev.teamDefault };
                if (prev.classDefaults && Object.keys(prev.classDefaults).length) {
                    kept.classDefaults = prev.classDefaults;
                }
                if (prev.bookTitle) {
                    kept.bookTitle = prev.bookTitle;
                }
                if (Array.isArray(prev.applicableLevels)) {
                    kept.applicableLevels = prev.applicableLevels;
                }
                curricula[saveId] = kept;
            } else {
                delete curricula[saveId];
            }
        } else {
            curricula[saveId] = next;
        }
        if (!book.isCustom && !isDebateBookRecord(book)) {
            syncLegacyBookOverride(bookId, normalized, appData);
        }
        hooks.saveData();
        hooks.onBooksSaved();
        return true;
    }

    function restoreFromTeamDefault(bookId, appData) {
        const team = getTeamDefaultRecord(bookId, appData);
        if (!team || !team.sessions.length) {
            return false;
        }
        const opts = {
            classDefaults: team.classDefaults,
            applicableLevels: team.applicableLevels
        };
        if (team.bookTitle) {
            opts.bookTitle = team.bookTitle;
        }
        if (team.syllabusGeneralNotes != null) {
            opts.syllabusGeneralNotes = team.syllabusGeneralNotes;
        }
        return saveBookTemplates(bookId, team.sessions, appData, opts);
    }

    function adoptTeamDefault(bookId, rowTemplates, appData, options) {
        const book = getBookById(bookId, appData);
        if (!book) {
            return false;
        }
        const opt = options || {};
        if (!saveBookTemplates(bookId, rowTemplates, appData, opt)) {
            return false;
        }
        const normalized = normalizeRowTemplates(rowTemplates);
        const curricula = ensureCurriculumOverrides(appData);
        const prev = curricula[bookId] || {};
        const classDefaults = deepClone(prev.classDefaults || opt.classDefaults || {});
        if (classDefaults.defaultTotalLessons == null) {
            classDefaults.defaultTotalLessons = normalized.length;
        }
        const title = (prev.bookTitle || opt.bookTitle || book.displayName || '').trim();
        if (title) {
            classDefaults.defaultBook = title;
        }
        const applicableLevels = opt.applicableLevels !== undefined
            ? (Array.isArray(opt.applicableLevels) ? opt.applicableLevels.filter(Boolean) : [])
            : (Array.isArray(prev.applicableLevels) ? prev.applicableLevels.slice() : undefined);
        curricula[bookId] = {
            ...prev,
            sessions: deepClone(normalized),
            teamDefault: {
                sessions: deepClone(normalized),
                classDefaults,
                applicableLevels,
                bookTitle: title || prev.bookTitle,
                syllabusGeneralNotes: opt.syllabusGeneralNotes !== undefined
                    ? String(opt.syllabusGeneralNotes)
                    : (prev.syllabusGeneralNotes != null ? String(prev.syllabusGeneralNotes) : ''),
                adoptedAt: new Date().toISOString()
            },
            updatedAt: new Date().toISOString()
        };
        if (book.isCustom) {
            curricula[bookId].isCustom = true;
            if (applicableLevels !== undefined) {
                curricula[bookId].levels = curricula[bookId].applicableLevels;
            }
        }
        if (!book.isCustom && !isDebateBookRecord(book)) {
            syncLegacyBookOverride(bookId, normalized, appData);
        }
        hooks.saveData();
        hooks.onBooksSaved();
        return true;
    }

    function resetBookToFactory(bookId, appData) {
        const book = getBookById(bookId, appData);
        if (book && book.isCustom) {
            return deleteCustomCurriculum(bookId, appData);
        }
        const curricula = ensureCurriculumOverrides(appData);
        const raw = curricula[bookId];
        const teamSnapshot = raw && raw.teamDefault ? deepClone(raw.teamDefault) : null;
        if (book && (book.isVirtualDebate || isDebateBookRecord(book))) {
            delete curricula[bookId];
            delete curricula[DEBATE_CURRICULUM_ID];
            hooks.saveData();
            hooks.onBooksSaved();
            return true;
        }
        delete curricula[bookId];
        const overrides = ensureBookOverrides(appData);
        delete overrides[bookId];
        if (teamSnapshot) {
            curricula[bookId] = { teamDefault: teamSnapshot };
        }
        hooks.saveData();
        hooks.onBooksSaved();
        return true;
    }

    function countBookOverrides(appData) {
        migrateLegacyToCurriculum(appData);
        const curricula = ensureCurriculumOverrides(appData);
        return Object.keys(curricula).filter((k) => {
            const o = curricula[k];
            if (!o) {
                return false;
            }
            if (o.isCustom) {
                return true;
            }
            return Array.isArray(o.sessions) && o.sessions.length;
        }).length;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(str) {
        return escapeHtml(str).replace(/'/g, '&#39;');
    }

    function renumberSessionRows(tbody) {
        if (!tbody) {
            return;
        }
        Array.from(tbody.querySelectorAll('tr')).forEach((tr, i) => {
            const n = i + 1;
            tr.dataset.session = String(n);
            const numCell = tr.querySelector('.books-col-num');
            if (numCell) {
                numCell.textContent = String(n);
            }
        });
    }

    function createSessionRowEl(row, index) {
        const tr = document.createElement('tr');
        const sessionNumber = row && row.sessionNumber != null ? row.sessionNumber : index + 1;
        tr.dataset.session = String(sessionNumber);
        tr.innerHTML = `
              <td class="books-col-num">${sessionNumber}</td>
              <td><input type="text" class="books-ed-title" value="${escapeAttr(row && row.planTitle)}" maxlength="200"></td>
              <td><textarea class="books-ed-detail" rows="4">${escapeHtml(row && row.planDetail)}</textarea></td>
              <td><textarea class="books-ed-note" rows="2">${escapeHtml(row && row.note)}</textarea></td>
              <td class="books-col-actions"><button type="button" class="btn btn-outline btn-small books-row-remove" aria-label="Remove">&times;</button></td>
            `;
        tr.querySelector('.books-row-remove').addEventListener('click', () => {
            tr.remove();
            renumberSessionRows(tr.closest('tbody'));
        });
        return tr;
    }

    function collectEditorRowsFromTbody(tbody) {
        if (!tbody) {
            return [];
        }
        return Array.from(tbody.querySelectorAll('tr')).map((tr, i) => ({
            sessionNumber: i + 1,
            planTitle: (tr.querySelector('.books-ed-title')?.value || '').trim(),
            planDetail: tr.querySelector('.books-ed-detail')?.value || '',
            note: tr.querySelector('.books-ed-note')?.value || ''
        })).filter((r) => r.planTitle || r.planDetail || r.note);
    }

    function setColumnFieldValue(el, value) {
        if (!el) {
            return;
        }
        el.value = value;
        if (typeof Event === 'function') {
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function clearColumnInTbody(tbody, selector) {
        if (!tbody || !selector) {
            return;
        }
        tbody.querySelectorAll('tr').forEach((tr) => {
            setColumnFieldValue(tr.querySelector(selector), '');
        });
    }

    function fillColumnInTbody(tbody, selector, text) {
        if (!tbody || !selector) {
            return;
        }
        const value = text == null ? '' : String(text);
        tbody.querySelectorAll('tr').forEach((tr) => {
            setColumnFieldValue(tr.querySelector(selector), value);
        });
    }

    function fillColumnLinesInTbody(tbody, selector, lines) {
        if (!tbody || !selector || !Array.isArray(lines)) {
            return;
        }
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((tr, index) => {
            if (index >= lines.length) return;
            setColumnFieldValue(tr.querySelector(selector), lines[index]);
        });
    }

    function splitClipboardIntoColumnLines(text) {
        return String(text ?? '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .map((line) => line.replace(/\t/g, ' ').trimEnd())
            .filter((line, index, arr) => !(index === arr.length - 1 && line === ''));
    }

    async function pasteColumnInTbody(tbody, selector) {
        if (!tbody || !selector) {
            return;
        }
        let text = '';
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
                text = await navigator.clipboard.readText();
            }
        } catch (_) {
            text = '';
        }
        if (!text && typeof prompt === 'function') {
            const failedHint = hooks.t('booksEditorClipboardFailed');
            const promptLabel = hooks.t('booksEditorColPasteAll');
            const msg = failedHint && failedHint !== 'booksEditorClipboardFailed'
                ? failedHint
                : (promptLabel && promptLabel !== 'booksEditorColPasteAll' ? promptLabel : 'Paste column');
            const entered = prompt(msg, '');
            if (entered === null) {
                return;
            }
            text = entered;
        }
        if (global.CCPUtils && global.CCPUtils.normalizeClipboardText) {
            text = global.CCPUtils.normalizeClipboardText(text);
        } else {
            text = String(text ?? '')
                .replace(/\u2014/g, '-')
                .replace(/\u2013/g, '-')
                .replace(/\u2212/g, '-');
        }
        const lines = splitClipboardIntoColumnLines(text);
        if (!lines.length) {
            return;
        }
        if (lines.length === 1) {
            fillColumnInTbody(tbody, selector, lines[0]);
            return;
        }
        fillColumnLinesInTbody(tbody, selector, lines);
    }

    function renderEditableColumnHeader(columnKey, labelKey, labelDefault) {
        const clearLabel = hooks.t('booksEditorColClear');
        const pasteLabel = hooks.t('booksEditorColPasteAll');
        const colLabel = hooks.t(labelKey);
        const labelText = colLabel && colLabel !== labelKey ? colLabel : labelDefault;
        const clearText = clearLabel && clearLabel !== 'booksEditorColClear' ? clearLabel : 'Clear column';
        const pasteText = pasteLabel && pasteLabel !== 'booksEditorColPasteAll' ? pasteLabel : 'Paste to all';
        return `
                    <th class="books-col-header-editable">
                      <span class="books-col-header-label" data-i18n="${labelKey}">${escapeHtml(labelText)}</span>
                      <div class="books-col-header-actions">
                        <button type="button" class="btn btn-outline btn-small"
                          data-books-col-clear="${escapeAttr(columnKey)}"
                          data-i18n="booksEditorColClear">${escapeHtml(clearText)}</button>
                        <button type="button" class="btn btn-outline btn-small"
                          data-books-col-paste="${escapeAttr(columnKey)}"
                          data-i18n="booksEditorColPasteAll">${escapeHtml(pasteText)}</button>
                      </div>
                    </th>`;
    }

    function bindSessionsToolbar(toolbarEl, tbody) {
        if (!toolbarEl || toolbarEl.dataset.bound === '1') {
            return;
        }
        toolbarEl.dataset.bound = '1';
        const addBtn = toolbarEl.querySelector('[data-books-add-session]');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const count = tbody.querySelectorAll('tr').length;
                if (count >= MAX_SESSION_ROWS) {
                    return;
                }
                tbody.appendChild(createSessionRowEl({}, count));
                renumberSessionRows(tbody);
            });
        }
    }

    function bookHasSessionCountMismatch(bookId, appData) {
        const book = getBookById(bookId, appData);
        if (!book || book.isVirtualDebate) {
            return false;
        }
        const rows = getTemplatesForBookId(bookId, appData);
        const baselineCount = book.baselineSessionCount != null
            ? book.baselineSessionCount
            : getEffectiveSessionBaselineCount(bookId, appData, book.factorySessionCount);
        return rows.length !== baselineCount;
    }

    function renderEditorTableInto(bookId, tbody, meta, options) {
        if (!tbody || !meta) {
            return;
        }
        const appData = getAppData();
        const book = getBookById(bookId, appData);
        if (!book) {
            return;
        }
        const rows = getTemplatesForBookId(bookId, appData);
        const baselineCount = book.baselineSessionCount != null
            ? book.baselineSessionCount
            : getEffectiveSessionBaselineCount(bookId, appData, book.factorySessionCount);
        const countWarn = bookHasSessionCountMismatch(bookId, appData)
            ? `<p class="section-hint books-editor-count-warn">${escapeHtml(
                hooks.t('booksEditorSessionCountWarn')
                    .replace('{n}', String(rows.length))
                    .replace('{factory}', String(baselineCount))
            )}</p>`
            : '';
        let customBadge = '';
        if (book.isCustom) {
            if (book.hasOverride) {
                customBadge = `<p class="books-editor-custom-badge">${escapeHtml(hooks.t('booksEditorCustomBadge'))}</p>`;
            } else if (!customCurriculumAdoptedAsTeamDefault(bookId, book, appData)) {
                customBadge = `<p class="books-editor-custom-badge">${escapeHtml(hooks.t('curriculumCustomBadge'))}</p>`;
            }
        } else if (book.hasOverride) {
            customBadge = `<p class="books-editor-custom-badge">${escapeHtml(hooks.t('booksEditorCustomBadge'))}</p>`;
        }
        meta.innerHTML = `
          <p><strong>${escapeHtml(book.displayName || book.name)}</strong></p>
          <p class="section-hint">${escapeHtml(hooks.t('booksEditorMetaLevels').replace('{levels}', book.levelsLabel || '—'))}</p>
          <p class="section-hint">${escapeHtml(hooks.t('booksEditorMetaLessons').replace('{n}', String(book.defaultTotalLessons || rows.length)))}</p>
          ${customBadge}
          ${countWarn}
        `;
        tbody.innerHTML = '';
        rows.forEach((row, i) => {
            tbody.appendChild(createSessionRowEl(row, i));
        });
        const toolbar = options && options.toolbarEl;
        if (toolbar) {
            bindSessionsToolbar(toolbar, tbody);
        }
    }

    let fullPageEditingBookId = null;
    let fullPageAfterSave = null;
    let fullPageAfterDuplicate = null;

    function getCheckedApplicableLevelIds(prefix) {
        const root = document.getElementById(`${prefix}ApplicabilityLevels`);
        if (!root) {
            return null;
        }
        const allCb = document.getElementById(`${prefix}ApplicabilityAllLevels`);
        if (allCb && allCb.checked) {
            return [];
        }
        return Array.from(root.querySelectorAll('.curriculum-level-cb:checked'))
            .map((cb) => cb.value)
            .filter(Boolean);
    }

    function collectCurriculumEditorSaveOpts(prefix) {
        const out = collectApplicabilitySettings(prefix);
        const notesEl = document.getElementById(`${prefix}EditorGeneralNotes`);
        if (notesEl) {
            out.syllabusGeneralNotes = notesEl.value;
        }
        return out;
    }

    function collectApplicabilitySettings(prefix) {
        const lessonsEl = document.getElementById(`${prefix}DefaultTotalLessons`);
        const gradeEl = document.getElementById(`${prefix}DefaultGrade`);
        const levelEl = document.getElementById(`${prefix}DefaultLevelPreset`);
        const titleEl = document.getElementById(`${prefix}EditorBookTitle`);
        const classDefaults = {};
        if (lessonsEl && lessonsEl.value !== '') {
            const n = parseInt(lessonsEl.value, 10);
            if (!Number.isNaN(n) && n > 0) {
                classDefaults.defaultTotalLessons = n;
            }
        }
        if (gradeEl && gradeEl.value) {
            classDefaults.grade = gradeEl.value;
        }
        if (levelEl && levelEl.value) {
            classDefaults.levelPreset = levelEl.value;
        }
        const out = {
            bookTitle: titleEl ? titleEl.value : undefined,
            classDefaults
        };
        const applicableLevels = getCheckedApplicableLevelIds(prefix);
        if (applicableLevels !== null) {
            out.applicableLevels = applicableLevels;
        }
        return out;
    }

    function renderApplicabilityPanelHtml(prefix, book, curriculumId, appData) {
        const cur = getCurriculumRecord(curriculumId, appData) || {};
        const cd = cur.classDefaults || {};
        const isDebateBook = isDebateBookRecord(book) || book.isVirtualDebate;
        const factoryLevels = isDebateBook
            ? (book.levels && book.levels.length ? book.levels : getDebateDefaultApplicableLevels())
            : (book.levels || []);
        const applicable = getStoredApplicableLevels(curriculumId, appData, factoryLevels, isDebateBook);
        const checkedSet = applicable.isAllLevels
            ? null
            : new Set(applicable.levels);
        const groups = hooks.getSimsonLevelGroups ? hooks.getSimsonLevelGroups() : [];
        const grades = hooks.getSchoolGradeOptions ? hooks.getSchoolGradeOptions() : [];
        let levelChecks = '';
        groups.forEach((group) => {
            levelChecks += `<div class="curriculum-applicability-group"><strong>${escapeHtml(group.label || group.id)}</strong><div class="curriculum-applicability-levels">`;
            (group.levels || []).forEach((lv) => {
                const checked = applicable.isAllLevels || (checkedSet && checkedSet.has(lv.id));
                levelChecks += `<label class="curriculum-level-chip"><input type="checkbox" class="curriculum-level-cb" value="${escapeAttr(lv.id)}"${checked ? ' checked' : ''}> ${escapeHtml(lv.name || lv.id)}</label>`;
            });
            levelChecks += '</div></div>';
        });
        let gradeOpts = `<option value="">${escapeHtml(hooks.t('curriculumDefaultGradeNone'))}</option>`;
        grades.forEach((g) => {
            const sel = cd.grade === g ? ' selected' : '';
            gradeOpts += `<option value="${escapeAttr(g)}"${sel}>${escapeHtml(g)}</option>`;
        });
        const lessonsVal = cd.defaultTotalLessons != null
            ? cd.defaultTotalLessons
            : (book.defaultTotalLessons || '');
        const allChecked = applicable.isAllLevels ? ' checked' : '';
        const nameLabel = book.isCustom
            ? hooks.t('curriculumEditorNameLabel')
            : hooks.t('curriculumDisplayNameLabel');
        const nameVal = (cur.bookTitle || book.displayName || book.name || '').trim();
        return `
          <section class="curriculum-applicability-panel" id="${prefix}ApplicabilityPanel">
            <h3 class="curriculum-applicability-heading" data-i18n="curriculumApplicabilityHeading">Applicability &amp; class defaults</h3>
            <p class="section-hint" data-i18n="curriculumApplicabilityHint">Choose which levels see this book on the class form. Empty “all levels” applies everywhere. Defaults are used when you Apply from curriculum.</p>
            <div class="curriculum-editor-title-row">
              <label for="${prefix}EditorBookTitle">${escapeHtml(nameLabel)}</label>
              <input type="text" id="${prefix}EditorBookTitle" class="curriculum-editor-title-input" maxlength="120"
                value="${escapeAttr(nameVal)}">
            </div>
            <div class="curriculum-applicability-row">
              <label for="${prefix}DefaultTotalLessons" data-i18n="curriculumDefaultLessons">Default total lessons</label>
              <input type="number" id="${prefix}DefaultTotalLessons" class="curriculum-default-lessons-input" min="1" max="48" value="${escapeAttr(String(lessonsVal))}">
            </div>
            <div class="curriculum-applicability-row">
              <label for="${prefix}DefaultGrade" data-i18n="curriculumDefaultGrade">Default grade (optional)</label>
              <select id="${prefix}DefaultGrade" class="curriculum-default-grade-select">${gradeOpts}</select>
            </div>
            <div class="curriculum-applicability-row">
              <label for="${prefix}DefaultLevelPreset" data-i18n="curriculumDefaultLevel">Default section level (optional)</label>
              <select id="${prefix}DefaultLevelPreset" class="curriculum-default-level-select">
                <option value="">${escapeHtml(hooks.t('curriculumDefaultLevelNone'))}</option>
                ${groups.map((group) => {
                    const opts = (group.levels || []).map((lv) => {
                        const sel = cd.levelPreset === lv.id ? ' selected' : '';
                        return `<option value="${escapeAttr(lv.id)}"${sel}>${escapeHtml(lv.name || lv.id)}</option>`;
                    }).join('');
                    return `<optgroup label="${escapeAttr(group.label || group.id)}">${opts}</optgroup>`;
                }).join('')}
              </select>
            </div>
            <div class="curriculum-applicability-levels-wrap">
              <label class="curriculum-level-chip curriculum-level-chip-all">
                <input type="checkbox" id="${prefix}ApplicabilityAllLevels"${allChecked}>
                <span data-i18n="curriculumAllLevels">All levels</span>
              </label>
              <div id="${prefix}ApplicabilityLevels" class="curriculum-applicability-levels-grid">${levelChecks}</div>
            </div>
          </section>`;
    }

    function bindApplicabilityPanel(prefix) {
        const allCb = document.getElementById(`${prefix}ApplicabilityAllLevels`);
        const root = document.getElementById(`${prefix}ApplicabilityLevels`);
        if (!allCb || !root || root.dataset.bound === '1') {
            return;
        }
        root.dataset.bound = '1';
        const syncAll = () => {
            const on = allCb.checked;
            root.querySelectorAll('.curriculum-level-cb').forEach((cb) => {
                cb.disabled = on;
                if (on) {
                    cb.checked = false;
                }
            });
        };
        allCb.addEventListener('change', syncAll);
        root.querySelectorAll('.curriculum-level-cb').forEach((cb) => {
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    allCb.checked = false;
                    syncAll();
                }
            });
        });
        syncAll();
    }

    function bindCurriculumEditorMount(mountEl) {
        if (!mountEl || mountEl.dataset.curriculumEditorBound === '1') {
            return;
        }
        mountEl.dataset.curriculumEditorBound = '1';
        mountEl.addEventListener('click', (e) => {
            const prefix = mountEl.dataset.curriculumEditorPrefix || 'curriculum';
            const tbodyId = `${prefix}EditorTableBody`;
            const clearBtn = e.target.closest('[data-books-col-clear]');
            if (clearBtn) {
                const confirmMsg = hooks.t('booksEditorColClearConfirm');
                const msg = confirmMsg && confirmMsg !== 'booksEditorColClearConfirm'
                    ? confirmMsg
                    : 'Clear all cells in this column?';
                if (typeof confirm === 'function' && !confirm(msg)) {
                    return;
                }
                const selector = getSessionColumnSelector(clearBtn.getAttribute('data-books-col-clear'));
                const tbody = document.getElementById(tbodyId);
                if (selector && tbody) {
                    clearColumnInTbody(tbody, selector);
                }
                return;
            }
            const pasteBtn = e.target.closest('[data-books-col-paste]');
            if (pasteBtn) {
                const selector = getSessionColumnSelector(pasteBtn.getAttribute('data-books-col-paste'));
                const tbody = document.getElementById(tbodyId);
                if (selector && tbody) {
                    void pasteColumnInTbody(tbody, selector);
                }
                return;
            }
            const saveId = `${prefix}EditorSaveBtn`;
            const resetId = `${prefix}EditorResetBtn`;
            const deleteId = `${prefix}EditorDeleteBtn`;
            const adoptId = `${prefix}EditorAdoptDefaultBtn`;
            const duplicateId = `${prefix}EditorDuplicateBtn`;
            const metaId = `${prefix}EditorMeta`;
            const toolbarId = `${prefix}EditorToolbar`;
            if (e.target.id === saveId && fullPageEditingBookId) {
                const tbody = document.getElementById(tbodyId);
                const rows = collectEditorRowsFromTbody(tbody);
                if (rows.length < MIN_SESSION_ROWS) {
                    alert(hooks.t('booksEditorNoRows'));
                    return;
                }
                const saveOpts = collectCurriculumEditorSaveOpts(prefix);
                saveBookTemplates(fullPageEditingBookId, rows, getAppData(), saveOpts);
                renderEditorTableInto(
                    fullPageEditingBookId,
                    tbody,
                    document.getElementById(metaId),
                    { toolbarEl: document.getElementById(toolbarId) }
                );
                if (fullPageAfterSave) {
                    fullPageAfterSave(fullPageEditingBookId);
                }
            }
            if (e.target.id === deleteId && fullPageEditingBookId) {
                const appData = getAppData();
                if (!confirmAndDeleteCurriculum(fullPageEditingBookId, appData)) {
                    return;
                }
                fullPageEditingBookId = null;
                mountEl.innerHTML = `<p class="module-empty-hint">${escapeHtml(hooks.t('curriculumTabPick'))}</p>`;
                if (fullPageAfterSave) {
                    fullPageAfterSave(null);
                }
                return;
            }
            if (e.target.id === resetId && fullPageEditingBookId) {
                const appData = getAppData();
                const activeBook = getBookById(fullPageEditingBookId, appData);
                const teamTd = getTeamDefaultRecord(fullPageEditingBookId, appData);
                const canAdopt = hooks.canAdoptTeamCurriculumDefault();
                if (activeBook && activeBook.isCustom) {
                    if (teamTd && canAdopt) {
                        const dateLabel = formatTeamDefaultDate(teamTd.adoptedAt);
                        if (!confirm(hooks.t('booksEditorResetTeamDefaultConfirm').replace('{date}', dateLabel))) {
                            return;
                        }
                        restoreFromTeamDefault(fullPageEditingBookId, appData);
                        renderEditorTableInto(
                            fullPageEditingBookId,
                            document.getElementById(tbodyId),
                            document.getElementById(metaId),
                            { toolbarEl: document.getElementById(toolbarId) }
                        );
                        if (fullPageAfterSave) {
                            fullPageAfterSave(fullPageEditingBookId);
                        }
                        return;
                    }
                    if (!confirm(hooks.t('curriculumDeleteConfirm'))) {
                        return;
                    }
                    removeCurriculumFromCalendar(fullPageEditingBookId, appData);
                    fullPageEditingBookId = null;
                    mountEl.innerHTML = `<p class="module-empty-hint">${escapeHtml(hooks.t('curriculumTabPick'))}</p>`;
                    if (fullPageAfterSave) {
                        fullPageAfterSave(null);
                    }
                    return;
                }
                if (teamTd && canAdopt) {
                    const dateLabel = formatTeamDefaultDate(teamTd.adoptedAt);
                    if (!confirm(hooks.t('booksEditorResetTeamDefaultConfirm').replace('{date}', dateLabel))) {
                        return;
                    }
                    restoreFromTeamDefault(fullPageEditingBookId, appData);
                } else {
                    if (!confirm(hooks.t('booksEditorResetConfirm'))) {
                        return;
                    }
                    resetBookToFactory(fullPageEditingBookId, appData);
                }
                renderEditorTableInto(
                    fullPageEditingBookId,
                    document.getElementById(tbodyId),
                    document.getElementById(metaId),
                    { toolbarEl: document.getElementById(toolbarId) }
                );
                if (fullPageAfterSave) {
                    fullPageAfterSave(fullPageEditingBookId);
                }
            }
            if (e.target.id === adoptId && fullPageEditingBookId) {
                if (!hooks.canAdoptTeamCurriculumDefault()) {
                    return;
                }
                const tbody = document.getElementById(tbodyId);
                const rows = collectEditorRowsFromTbody(tbody);
                if (rows.length < MIN_SESSION_ROWS) {
                    alert(hooks.t('booksEditorNoRows'));
                    return;
                }
                const activeBook = getBookById(fullPageEditingBookId, getAppData());
                const confirmKey = activeBook && activeBook.isCustom
                    ? 'curriculumSaveToDefaultsConfirmCustom'
                    : 'curriculumSaveToDefaultsConfirm';
                if (!confirm(hooks.t(confirmKey))) {
                    return;
                }
                const saveOpts = collectCurriculumEditorSaveOpts(prefix);
                adoptTeamDefault(fullPageEditingBookId, rows, getAppData(), saveOpts);
                renderEditorTableInto(
                    fullPageEditingBookId,
                    tbody,
                    document.getElementById(metaId),
                    { toolbarEl: document.getElementById(toolbarId) }
                );
                if (fullPageAfterSave) {
                    fullPageAfterSave(fullPageEditingBookId);
                }
            }
            if (e.target.id === duplicateId && fullPageEditingBookId) {
                const newId = duplicateCurriculum(fullPageEditingBookId, getAppData());
                if (!newId) {
                    alert(hooks.t('curriculumDuplicateFailed'));
                    return;
                }
                if (fullPageAfterDuplicate) {
                    fullPageAfterDuplicate(newId);
                }
            }
        });
    }

    function renderCurriculumEditorMount(mountEl, curriculumId, options) {
        if (!mountEl || !curriculumId) {
            return;
        }
        fullPageEditingBookId = curriculumId;
        fullPageAfterSave = options && typeof options.onSaved === 'function' ? options.onSaved : null;
        fullPageAfterDuplicate = options && typeof options.onDuplicated === 'function' ? options.onDuplicated : null;
        const book = getBookById(curriculumId, getAppData());
        if (!book) {
            mountEl.innerHTML = '';
            return;
        }
        const prefix = options && options.idPrefix ? options.idPrefix : 'curriculum';
        mountEl.dataset.curriculumEditorPrefix = prefix;
        const metaId = `${prefix}EditorMeta`;
        const tbodyId = `${prefix}EditorTableBody`;
        const saveId = `${prefix}EditorSaveBtn`;
        const resetId = `${prefix}EditorResetBtn`;
        const deleteId = `${prefix}EditorDeleteBtn`;
        const adoptId = `${prefix}EditorAdoptDefaultBtn`;
        const duplicateId = `${prefix}EditorDuplicateBtn`;
        const toolbarId = `${prefix}EditorToolbar`;
        const isCustom = !!book.isCustom;
        const showDelete = canDeleteCurriculumInEditor(curriculumId, getAppData());
        const showAdopt = hooks.canAdoptTeamCurriculumDefault();
        const teamTd = getTeamDefaultRecord(curriculumId, getAppData());
        const applicabilityHtml = renderApplicabilityPanelHtml(prefix, book, curriculumId, getAppData());
        const generalNotesId = `${prefix}EditorGeneralNotes`;
        const generalNotesValue = getCurriculumSyllabusGeneralNotes(curriculumId, null, getAppData());
        const generalNotesHtml = `
            <div class="curriculum-editor-general-notes syllabus-editor-block">
              <h3 class="syllabus-block-title" data-i18n="curriculumGeneralNotes">General notes &amp; instructions</h3>
              <p class="section-hint" data-i18n="curriculumGeneralNotesHint">Printed in the Note column on the 진도표 overview for classes using this curriculum. A class can override these on its syllabus.</p>
              <textarea id="${generalNotesId}" class="syllabus-general-notes-input" rows="4" spellcheck="true" data-i18n-placeholder="curriculumGeneralNotesPlaceholder" placeholder="e.g., Bring workbook every class. Month 2 outlines may be blank…">${escapeHtml(generalNotesValue)}</textarea>
            </div>`;
        const showResetToTeam = isCustom && teamTd && showAdopt;
        const showResetToFactory = !isCustom;
        let resetLabelKey = 'booksEditorReset';
        let resetDefault = 'Reset sessions to factory';
        if (showResetToTeam) {
            resetLabelKey = 'curriculumResetToTeamDefault';
            resetDefault = hooks.t('curriculumResetToTeamDefault');
        }
        const deleteBtnHtml = showDelete
            ? `<button type="button" id="${deleteId}" class="btn btn-danger" data-i18n="curriculumDeleteBtn">${escapeHtml(hooks.t('curriculumDeleteBtn'))}</button>`
            : '';
        const resetBtnHtml = (showResetToFactory || showResetToTeam)
            ? `<button type="button" id="${resetId}" class="btn btn-outline" data-i18n="${resetLabelKey}">${escapeHtml(resetDefault)}</button>`
            : '';
        const adoptLabelKey = isCustom ? 'curriculumSaveToDefaultsCustom' : 'curriculumSaveToDefaults';
        const adoptDefault = hooks.t(adoptLabelKey);
        mountEl.innerHTML = `
          <div class="books-editor-fullpage curriculum-editor-panel">
            <div class="curriculum-editor-actions-bar form-actions books-editor-actions" role="toolbar" aria-label="Curriculum editor actions">
              ${deleteBtnHtml}
              ${resetBtnHtml}
              ${showAdopt
        ? `<button type="button" id="${adoptId}" class="btn btn-outline" data-i18n="${adoptLabelKey}">${escapeHtml(adoptDefault)}</button>`
        : ''}
              <button type="button" id="${duplicateId}" class="btn btn-outline" data-i18n="curriculumDuplicateBtn">Duplicate curriculum</button>
              <button type="button" id="${saveId}" class="btn btn-primary" data-i18n="booksEditorSaveCurriculum">Save curriculum</button>
            </div>
            <div class="curriculum-editor-body">
              ${applicabilityHtml}
              ${generalNotesHtml}
              <div id="${metaId}" class="books-editor-meta"></div>
              <p class="section-hint curriculum-editor-apply-hint" data-i18n="curriculumEditorApplyHint">On the class form, pick Level and Book, then Apply from curriculum.</p>
              ${showDelete || canManageCurriculumCatalog() ? '' : `<p class="section-hint curriculum-editor-builtin-hint" data-i18n="curriculumBuiltinNoDeleteHint">${escapeHtml(hooks.t('curriculumBuiltinNoDeleteHint'))}</p>`}
              ${showDelete && !isCustom && canManageCurriculumCatalog() ? `<p class="section-hint curriculum-editor-admin-delete-hint" data-i18n="curriculumAdminDeleteHint">${escapeHtml(hooks.t('curriculumAdminDeleteHint'))}</p>` : ''}
              <div id="${toolbarId}" class="books-editor-toolbar">
                <span data-i18n="booksEditorSessionsHeading">Sessions</span>
                <button type="button" class="btn btn-outline btn-small" data-books-add-session data-i18n="booksEditorAddSession">Add session</button>
              </div>
              <div class="books-editor-table-wrap">
                <table class="books-editor-table">
                  <thead><tr>
                    <th class="books-col-num">#</th>
                    ${renderEditableColumnHeader('planTitle', 'booksEditorColPlan', 'Lesson plan')}
                    ${renderEditableColumnHeader('planDetail', 'booksEditorColPages', 'Pages / detail')}
                    ${renderEditableColumnHeader('note', 'booksEditorColNote', 'Note')}
                    <th class="books-col-actions"><span class="sr-only">Remove</span></th>
                  </tr></thead>
                  <tbody id="${tbodyId}"></tbody>
                </table>
              </div>
            </div>
          </div>`;
        if (typeof hooks.applyLanguage === 'function') {
            hooks.applyLanguage();
        }
        bindApplicabilityPanel(prefix);
        renderEditorTableInto(
            curriculumId,
            document.getElementById(tbodyId),
            document.getElementById(metaId),
            { toolbarEl: document.getElementById(toolbarId) }
        );
        bindCurriculumEditorMount(mountEl);
    }

    function renderFullPageEditor(mountEl, bookId, options) {
        renderCurriculumEditorMount(mountEl, bookId, { ...options, idPrefix: 'workspaceBooks' });
    }

    function curriculumBookSearchHaystack(book) {
        const isDebate = book.programTrack === 'debate' || book.isVirtualDebate;
        const parts = [
            book.displayName,
            book.name,
            book.id,
            book.levelsLabel,
            Array.isArray(book.levels) ? book.levels.join(' ') : '',
            isDebate ? hooks.t('curriculumDebateListTag') : '',
            book.isCustom ? 'custom' : ''
        ];
        return parts.filter(Boolean).join(' ').toLowerCase();
    }

    function curriculumBookMatchesSearch(book, query) {
        const q = (query || '').trim().toLowerCase();
        if (!q) {
            return true;
        }
        return curriculumBookSearchHaystack(book).includes(q);
    }

    function renderCurriculumList(listEl, selectedId, options) {
        if (!listEl) {
            return;
        }
        const opts = options && typeof options === 'object' ? options : {};
        const searchQuery = (opts.searchQuery != null ? String(opts.searchQuery) : '').trim().toLowerCase();
        const appData = getAppData();
        const books = discoverBooks(appData).slice().sort((a, b) => {
            const aDebate = a.programTrack === 'debate' || a.isVirtualDebate;
            const bDebate = b.programTrack === 'debate' || b.isVirtualDebate;
            if (aDebate && !bDebate) {
                return -1;
            }
            if (bDebate && !aDebate) {
                return 1;
            }
            return (a.displayName || a.name).localeCompare(b.displayName || b.name);
        }).filter((book) => curriculumBookMatchesSearch(book, searchQuery));
        listEl.innerHTML = '';
        if (books.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'module-list-empty workspace-books-list-empty';
            empty.style.padding = '12px';
            empty.style.color = 'var(--text-secondary)';
            const emptyKey = searchQuery ? 'lessonFilterSearchEmpty' : 'curriculumTabPick';
            const emptyText = hooks.t(emptyKey);
            empty.textContent = emptyText && emptyText !== emptyKey ? emptyText : (
                searchQuery ? 'No matches. Try a different search.' : 'Select a curriculum to edit.'
            );
            listEl.appendChild(empty);
            return;
        }
        books.forEach((book) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'workspace-book-list-item'
                + (book.id === selectedId ? ' is-selected' : '')
                + (book.isCustom && !customCurriculumAdoptedAsTeamDefault(book.id, book, appData) ? ' is-custom' : '')
                + (book.programTrack === 'debate' || book.isVirtualDebate ? ' is-debate' : '');
            btn.dataset.curriculumId = book.id;
            btn.dataset.bookId = book.id;
            const title = document.createElement('span');
            title.className = 'workspace-book-list-title';
            title.textContent = book.programTrack === 'debate' || book.isVirtualDebate
                ? `${book.displayName || book.name} (${hooks.t('curriculumDebateListTag')})`
                : (book.displayName || book.name);
            const meta = document.createElement('span');
            meta.className = 'workspace-book-list-meta section-hint';
            meta.textContent = hooks.t('booksListSessions').replace('{n}', String(book.sessionCount));
            btn.appendChild(title);
            btn.appendChild(meta);
            if (book.hasOverride) {
                const badge = document.createElement('span');
                badge.className = 'print-books-edited-badge';
                badge.textContent = hooks.t('booksListEdited');
                btn.appendChild(badge);
            }
            if (bookHasSessionCountMismatch(book.id, appData)) {
                const rows = getTemplatesForBookId(book.id, appData);
                const baselineCount = book.baselineSessionCount != null
                    ? book.baselineSessionCount
                    : getEffectiveSessionBaselineCount(book.id, appData, book.factorySessionCount);
                const warnBadge = document.createElement('span');
                warnBadge.className = 'inline-warn-badge';
                warnBadge.textContent = '!';
                warnBadge.title = hooks.t('booksEditorSessionCountWarn')
                    .replace('{n}', String(rows.length))
                    .replace('{factory}', String(baselineCount));
                btn.appendChild(warnBadge);
            }
            listEl.appendChild(btn);
        });
    }

    const renderFullPageBookList = renderCurriculumList;

    function openBookEditor(bookId) {
        if (typeof hooks.navigateToCurriculumTab === 'function') {
            hooks.navigateToCurriculumTab(bookId);
        }
    }

    function bindEditorUI() {
        if (document.body.dataset.booksEditorBound === '1') {
            return;
        }
        document.body.dataset.booksEditorBound = '1';
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-open-book-editor],[data-open-curriculum-editor]');
            if (!btn) {
                return;
            }
            const bookId = btn.getAttribute('data-book-id') || btn.getAttribute('data-curriculum-id');
            if (bookId) {
                openBookEditor(bookId);
            }
        });
    }

    function renderPrintBooksList() {
        const listEl = document.getElementById('printBooksList');
        const statsEl = document.getElementById('printBooksStats');
        if (!listEl && !statsEl) {
            return;
        }
        const appData = getAppData();
        const books = discoverBooks(appData);
        const editedCount = countBookOverrides(appData);
        if (statsEl) {
            statsEl.textContent = hooks.t('printBooksStats')
                .replace('{books}', String(books.length))
                .replace('{edited}', String(editedCount));
        }
        if (!listEl) {
            return;
        }
        listEl.innerHTML = '';
        if (books.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'section-hint';
            empty.textContent = hooks.t('printBooksEmpty');
            listEl.appendChild(empty);
            return;
        }
        books.forEach((book) => {
            const row = document.createElement('div');
            row.className = 'print-books-item';
            const main = document.createElement('div');
            main.className = 'print-books-item-main';
            const title = document.createElement('span');
            title.className = 'print-books-item-title';
            title.textContent = book.displayName || book.name;
            const meta = document.createElement('span');
            meta.className = 'print-books-item-meta section-hint';
            const metaParts = [
                hooks.t('booksListSessions').replace('{n}', String(book.sessionCount)),
                book.levelsLabel || ''
            ].filter(Boolean);
            meta.textContent = metaParts.join(' · ');
            main.appendChild(title);
            main.appendChild(meta);
            if (book.hasOverride) {
                const badge = document.createElement('span');
                badge.className = 'print-books-edited-badge';
                badge.textContent = hooks.t('booksListEdited');
                main.appendChild(badge);
            }
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn btn-outline btn-small';
            editBtn.setAttribute('data-open-curriculum-editor', '');
            editBtn.setAttribute('data-book-id', book.id);
            editBtn.textContent = hooks.t('booksListEdit');
            row.appendChild(main);
            row.appendChild(editBtn);
            listEl.appendChild(row);
        });
    }

    global.CCPBooksEditor = {
        init,
        discoverBooks,
        discoverCurricula,
        getBookById,
        getTemplatesForBookId,
        getTemplatesForPresetId,
        applyBookTemplatesToPreset,
        saveBookTemplates,
        adoptTeamDefault,
        restoreFromTeamDefault,
        getTeamDefaultRecord,
        getEffectiveSessionBaselineCount,
        bookHasSessionCountMismatch,
        resetBookToFactory,
        countBookOverrides,
        renderPrintBooksList,
        bindEditorUI,
        openBookEditor,
        deriveBookKey,
        renderFullPageEditor,
        renderFullPageBookList,
        renderCurriculumEditorMount,
        renderCurriculumList,
        NO_BOOK_CURRICULUM_ID,
        NONE_CURRICULUM_ID,
        DEBATE_CURRICULUM_ID,
        isNoCurriculum,
        isNoBookCurriculum,
        normalizeCurriculumIdForStorage,
        curriculumExists,
        getClassCurriculumWarningKind,
        isDebateCurriculum,
        isMiddleSchoolSimsonLevel,
        levelSupportsDebateCurriculum,
        resolveDebateBookIdForLevel,
        resolveDebatePresetIdForLevel,
        normalizeDebateCurriculumId,
        DEBATE_ELIGIBLE_LEVEL_IDS,
        getLevelOnlyPresetId,
        buildLevelOnlyMergedDefaults,
        buildDebateMergedDefaults,
        getFactoryDebateSessions,
        getStoredApplicableLevels,
        resolvePresetFromLevelAndBook,
        getCurriculaForLevel,
        getCurriculumApplyEligibility,
        presetHasSyllabusTemplatesForApply,
        getCurriculumDisplayName,
        getCurriculumCalendarLabel,
        stripTrailingParentheticals,
        buildMergedClassDefaults,
        getCurriculumSyllabusGeneralNotes,
        resolveSyllabusGeneralNotesForClass,
        isCustomCurriculum,
        createCurriculum,
        duplicateCurriculum,
        deleteCustomCurriculum,
        removeCurriculumFromCalendar,
        removeBuiltinCurriculumFromCalendar,
        restoreRemovedFactoryCurricula,
        canManageCurriculumCatalog,
        isCurriculumRemovedFromCalendar,
        canDeleteCurriculumInEditor,
        confirmAndDeleteCurriculum,
        migrateLegacyToCurriculum,
        ensureCurriculumOverrides,
        collectEditorRowsFromTbody,
        clearColumnInTbody,
        fillColumnInTbody,
        fillColumnLinesInTbody,
        pasteColumnInTbody,
        getSessionColumnSelector,
        normalizeRowTemplates
    };
})(typeof window !== 'undefined' ? window : globalThis);
