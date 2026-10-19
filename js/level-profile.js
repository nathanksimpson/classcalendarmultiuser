/**
 * Level profile — every "if the level is X, the default is Y" rule in one place.
 * Pure tables + resolver; no DOM, no app state. Lazy data (curricula, schedule
 * matrix, cohorts) is passed in through `deps`.
 * window.CCPLevelProfile
 */
(function (global) {
    const VERSION = 1;

    function deepFreeze(obj) {
        if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
            Object.freeze(obj);
            Object.keys(obj).forEach((k) => deepFreeze(obj[k]));
        }
        return obj;
    }

    const MID = '\uC911';
    const MID1 = MID + '1';
    const MID2 = MID + '2';
    const MID3 = MID + '3';

    /** Middle-school level ids with their school grade (중1–중3). */
    const MIDDLE_LEVELS = [
        ['\uC720\uB9C8', MID1], ['\uB808\uC624', MID1], ['\uD30C\uBCF4', MID1], ['\uD3F4\uB77C', MID1],
        ['\uD649\uC2A4', MID2], ['\uD2F0\uCE74', MID2], ['\uBE45\uD0A4', MID2], ['\uBC14\uC774\uCEEC', MID2],
        ['\uC548\uB098', MID3], ['\uB0AD\uAC00', MID3], ['\uB85C\uCCB4', MID3], ['\uCE89\uCCB8', MID3]
    ];

    const ELEMENTARY_IDS = [
        'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Navy', 'Purple',
        'Yeoul', 'Saemmul', 'Garam', 'Bada', 'Byeolmaru', 'Mirinae'
    ];

    /** Simson standard levels (stored in class.levelPreset and holiday.sectionLevels). */
    const LEVEL_GROUPS = deepFreeze([
        {
            id: 'elementary',
            labelKey: 'simsonLevelsElementary',
            fallbackLabel: 'Elementary',
            levels: ELEMENTARY_IDS.map((id) => ({ id, name: id, grade: null }))
        },
        {
            id: 'pre-middle',
            labelKey: 'simsonLevelsPreMiddle',
            fallbackLabel: 'Pre middle school',
            levels: MIDDLE_LEVELS.map(([id]) => ({ id: `Pre ${id}`, name: `Pre ${id}`, grade: null, preOf: id }))
        },
        {
            id: 'middle',
            labelKey: 'simsonLevelsMiddleSchool',
            fallbackLabel: 'Middle school',
            levels: MIDDLE_LEVELS.map(([id, grade]) => ({ id, name: id, grade }))
        }
    ]);

    /** Class strip default colors (user data defaults, not UI tokens). */
    const LEVEL_COLORS = deepFreeze({
        byLevel: {
            Red: '#dc2626',
            Orange: '#ea580c',
            Yellow: '#facc15',
            Green: '#16a34a',
            Blue: '#2563eb',
            Navy: '#1e3a8a',
            Purple: '#9333ea',
            Yeoul: '#e8b8c4',
            Saemmul: '#d9a3a3',
            Garam: '#16a34a',
            Bada: '#16a34a',
            Byeolmaru: '#2563eb',
            Mirinae: '#2563eb'
        },
        byGrade: {
            [MID1]: '#fef08a',
            [MID2]: '#bbf7d0',
            [MID3]: '#bfdbfe'
        }
    });

    /** Debate homework bands. Pre-middle levels are intentionally not listed. */
    const DEBATE_BAND_LEVELS = deepFreeze({
        purple: ['Purple'],
        yeoulSaemmul: ['Yeoul', 'Saemmul'],
        senior: ['Garam', 'Bada', 'Byeolmaru', 'Mirinae', ...MIDDLE_LEVELS.map(([id]) => id)]
    });

    /**
     * New-session debate defaults per band. teamSize is the base size; the engine
     * derives the live maxTeamSize (purple mode → 1, includeReply → teamSize + 1).
     * Changing a value here changes debate behavior: update the golden snapshot on purpose.
     */
    const DEBATE_BAND_DEFAULTS = deepFreeze({
        purple: { purpleMode: true, formatId: 'ap', includeReply: false, teamSize: 3, sheetTemplate: 'yeoul' },
        yeoulSaemmul: { purpleMode: false, formatId: 'ap', includeReply: false, teamSize: 3, sheetTemplate: 'yeoul' },
        senior: { purpleMode: false, formatId: 'ap', includeReply: false, teamSize: 3, sheetTemplate: 'garam' },
        none: { purpleMode: false, formatId: 'ap', includeReply: false, teamSize: 3, sheetTemplate: 'garam' }
    });

    const DEBATE_PRESET_IDS = deepFreeze({
        purple: 'preset-debate-purple',
        yeoulSaemmul: 'preset-debate-yeoul-saemmul',
        senior: 'preset-debate-senior'
    });

    const SCHEDULE_PATTERN_IDS = ['mwf', 'tth'];

    /** Settings that follow the level automatically until the teacher sets them by hand. */
    const AUTO_FIELDS = Object.freeze(['grade', 'colors']);

    const ALL_LEVELS = Object.freeze(LEVEL_GROUPS.reduce((acc, g) => acc.concat(g.levels), []));
    const GROUP_BY_LEVEL = new Map();
    LEVEL_GROUPS.forEach((g) => g.levels.forEach((l) => GROUP_BY_LEVEL.set(l.id, g.id)));

    function str(v) {
        return v == null ? '' : String(v).trim();
    }

    function getAllLevels() {
        return ALL_LEVELS.slice();
    }

    function getLevelById(id) {
        const v = str(id);
        if (!v) {
            return null;
        }
        return ALL_LEVELS.find((l) => l.id === v) || null;
    }

    /** levelPreset when it is a known level, else level when known, else ''. */
    function resolveLevelId(classData) {
        if (!classData || typeof classData !== 'object') {
            return '';
        }
        const preset = str(classData.levelPreset);
        if (getLevelById(preset)) {
            return preset;
        }
        const legacy = str(classData.level);
        if (getLevelById(legacy)) {
            return legacy;
        }
        return '';
    }

    /** @returns {'purple'|'yeoulSaemmul'|'senior'|null} */
    function debateBandForLevel(id) {
        const v = str(id);
        if (!v) {
            return null;
        }
        const bands = Object.keys(DEBATE_BAND_LEVELS);
        for (let i = 0; i < bands.length; i += 1) {
            if (DEBATE_BAND_LEVELS[bands[i]].includes(v)) {
                return bands[i];
            }
        }
        return null;
    }

    function debateDefaultsForBand(band) {
        const key = band && Object.prototype.hasOwnProperty.call(DEBATE_BAND_DEFAULTS, band) && band !== 'none'
            ? band
            : 'none';
        return Object.freeze({ ...DEBATE_BAND_DEFAULTS[key], band: key === 'none' ? null : key });
    }

    function getDebateBandLevels(band) {
        return (DEBATE_BAND_LEVELS[band] || []).slice();
    }

    function levelColorHex(def) {
        if (!def) {
            return '';
        }
        if (def.preOf) {
            const linked = getLevelById(def.preOf);
            if (linked && linked.grade) {
                return levelColorHex(linked);
            }
        }
        if (def.grade && LEVEL_COLORS.byGrade[def.grade]) {
            return LEVEL_COLORS.byGrade[def.grade];
        }
        return LEVEL_COLORS.byLevel[def.id] || '';
    }

    /** @returns {({ color: string, textColor: string }) | null} */
    function defaultColorsForLevel(id, readableTextOn) {
        const hex = levelColorHex(getLevelById(id));
        if (!hex) {
            return null;
        }
        let textColor = '';
        if (typeof readableTextOn === 'function') {
            try {
                textColor = str(readableTextOn(hex));
            } catch (_) {
                textColor = '';
            }
        }
        return { color: hex, textColor };
    }

    function safeCall(fn, args, fallback) {
        if (typeof fn !== 'function') {
            return fallback;
        }
        try {
            const out = fn.apply(null, args);
            return out == null ? fallback : out;
        } catch (_) {
            return fallback;
        }
    }

    function curriculumCandidates(levelId, deps) {
        const list = safeCall(deps.listCurriculaForLevel, [levelId], []);
        if (!Array.isArray(list)) {
            return [];
        }
        return list
            .filter((c) => c && str(c.id))
            .map((c) => ({
                id: str(c.id),
                displayName: str(c.displayName) || str(c.name) || str(c.id),
                programTrack: str(c.programTrack),
                subjectTrack: str(c.subjectTrack)
            }));
    }

    function schedulePatternsForLevel(levelId, matrix) {
        const slots = matrix && Array.isArray(matrix.slots) ? matrix.slots : [];
        const seen = new Set();
        slots.forEach((slot) => {
            if (slot && slot.level === levelId && SCHEDULE_PATTERN_IDS.includes(slot.patternId)) {
                seen.add(slot.patternId);
            }
        });
        return SCHEDULE_PATTERN_IDS.filter((p) => seen.has(p));
    }

    function cohortPattern(classData, deps) {
        const raw = str(safeCall(deps.cohortPatternForClass, [classData], '')).toLowerCase();
        return SCHEDULE_PATTERN_IDS.includes(raw) ? raw : null;
    }

    function neutralProfile(classData, deps) {
        return {
            levelId: '',
            known: false,
            groupId: '',
            grade: '',
            colors: null,
            debate: debateDefaultsForBand(null),
            debatePresetId: null,
            curriculum: { candidates: [], single: null },
            schedule: { fromCohort: cohortPattern(classData, deps), patterns: [] }
        };
    }

    /**
     * Every level-dependent default for a class. Pure; never throws.
     * @param {object} classData  class or form draft (levelPreset / level)
     * @param {object} [deps]     { listCurriculaForLevel, matrix, cohortPatternForClass, readableTextOn }
     */
    function resolve(classData, deps) {
        const d = deps && typeof deps === 'object' ? deps : {};
        try {
            const levelId = resolveLevelId(classData);
            const def = getLevelById(levelId);
            if (!def) {
                return neutralProfile(classData, d);
            }
            const band = debateBandForLevel(levelId);
            const candidates = curriculumCandidates(levelId, d);
            return {
                levelId,
                known: true,
                groupId: GROUP_BY_LEVEL.get(levelId) || '',
                grade: str(def.grade),
                colors: defaultColorsForLevel(levelId, d.readableTextOn),
                debate: debateDefaultsForBand(band),
                debatePresetId: band ? DEBATE_PRESET_IDS[band] : null,
                curriculum: {
                    candidates,
                    single: candidates.length === 1 ? candidates[0].id : null
                },
                schedule: {
                    fromCohort: cohortPattern(classData, d),
                    patterns: schedulePatternsForLevel(levelId, d.matrix)
                }
            };
        } catch (_) {
            return neutralProfile(null, {});
        }
    }

    // ---- Auto / Custom (grade + colors only) ----

    function sameHex(a, b) {
        return str(a).toLowerCase() === str(b).toLowerCase();
    }

    function fieldMatchesProfile(field, values, profile) {
        if (field === 'grade') {
            return str(values && values.grade) === str(profile.grade);
        }
        if (field === 'colors') {
            return !!(profile.colors && sameHex(values && values.color, profile.colors.color));
        }
        return false;
    }

    function fieldAvailable(field, profile) {
        if (!profile || !profile.known) {
            return false;
        }
        return field === 'colors' ? !!profile.colors : true;
    }

    /**
     * Auto / Custom per field for a saved class (computed in memory; never written).
     * @returns {{ grade: 'auto'|'custom'|'none', colors: 'auto'|'custom'|'none' }}
     */
    function deriveAutoState(classData, profile) {
        const out = {};
        const migrated = !!(classData && classData.levelProfileMigrated);
        const overrides = classData && classData.levelOverrides && typeof classData.levelOverrides === 'object'
            ? classData.levelOverrides
            : {};
        AUTO_FIELDS.forEach((field) => {
            if (!fieldAvailable(field, profile)) {
                out[field] = 'none';
            } else if (migrated) {
                out[field] = overrides[field] === true ? 'custom' : 'auto';
            } else {
                out[field] = fieldMatchesProfile(field, classData, profile) ? 'auto' : 'custom';
            }
        });
        return out;
    }

    /**
     * Level changed: Auto fields take the new profile's values; Custom fields stay.
     * Never touches anything outside AUTO_FIELDS.
     * @param {{ grade?: string, color?: string, textColor?: string }} formValues
     * @returns {{ values: object, autoState: object, changed: string[] }}
     */
    function applyLevelChange(formValues, autoState, nextProfile) {
        const values = { ...(formValues || {}) };
        const prev = autoState || {};
        const state = {};
        const changed = [];
        AUTO_FIELDS.forEach((field) => {
            const cur = prev[field] || 'none';
            if (!fieldAvailable(field, nextProfile)) {
                state[field] = cur;
                return;
            }
            if (cur === 'auto') {
                if (field === 'grade') {
                    if (str(values.grade) !== nextProfile.grade) {
                        changed.push(field);
                    }
                    values.grade = nextProfile.grade;
                } else {
                    if (!sameHex(values.color, nextProfile.colors.color)) {
                        changed.push(field);
                    }
                    values.color = nextProfile.colors.color;
                    if (nextProfile.colors.textColor) {
                        values.textColor = nextProfile.colors.textColor;
                    }
                }
                state[field] = 'auto';
            } else if (cur === 'custom') {
                state[field] = 'custom';
            } else {
                state[field] = fieldMatchesProfile(field, values, nextProfile) ? 'auto' : 'custom';
            }
        });
        return { values, autoState: state, changed };
    }

    /**
     * Fields written by a normal class save.
     * @param {object} formValues   { grade, color }
     * @param {object} profile      resolve() result for the saved level
     * @param {object} [autoState]  form Auto/Custom state (wins over value comparison)
     * @param {object} [previous]   class before save (keeps markers for unknown levels)
     * @returns {{ levelOverrides?: object, levelProfileMigrated?: number }}
     */
    function buildLevelOverridesForSave(formValues, profile, autoState, previous) {
        const prev = previous && typeof previous === 'object' ? previous : {};
        if (!profile || !profile.known) {
            const out = {};
            if (prev.levelOverrides && typeof prev.levelOverrides === 'object') {
                out.levelOverrides = { ...prev.levelOverrides };
            }
            if (prev.levelProfileMigrated) {
                out.levelProfileMigrated = prev.levelProfileMigrated;
            }
            return out;
        }
        const overrides = {};
        AUTO_FIELDS.forEach((field) => {
            let custom;
            const st = autoState && autoState[field];
            if (st === 'custom' || st === 'auto') {
                custom = st === 'custom';
            } else if (!fieldAvailable(field, profile)) {
                custom = !!(prev.levelOverrides && prev.levelOverrides[field] === true);
            } else {
                custom = !fieldMatchesProfile(field, formValues, profile);
            }
            if (custom) {
                overrides[field] = true;
            }
        });
        return { levelOverrides: overrides, levelProfileMigrated: VERSION };
    }

    const api = {
        VERSION,
        LEVEL_GROUPS,
        LEVEL_COLORS,
        DEBATE_BAND_LEVELS,
        DEBATE_BAND_DEFAULTS,
        DEBATE_PRESET_IDS,
        AUTO_FIELDS,
        getAllLevels,
        getLevelById,
        resolveLevelId,
        debateBandForLevel,
        debateDefaultsForBand,
        getDebateBandLevels,
        defaultColorsForLevel,
        resolve,
        /** Replaced by app.js with real deps; falls back to the pure resolver. */
        resolveForClass: (classData) => resolve(classData, {}),
        deriveAutoState,
        applyLevelChange,
        buildLevelOverridesForSave
    };

    global.CCPLevelProfile = api;
})(typeof window !== 'undefined' ? window : globalThis);
