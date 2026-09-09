/**
 * HR teacher list rows — one Simson level per row, MWF and Tue/Thu homeroom teachers.
 * window.CCPHrTeacherList
 */
(function (global) {
    const DEFAULT_ACCENT = '#356a9e';
    const PRINT_TEXT = '#243244';

    const SIMSON_LEVEL_ORDER = [
        'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Navy', 'Purple',
        'Yeoul', 'Saemmul', 'Garam', 'Bada', 'Byeolmaru', 'Mirinae'
    ];

    const NAMED_LEVEL_COLORS = {
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
    };

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function fallbackLevelColor(levelId) {
        const id = normalizeStr(levelId);
        const hex = NAMED_LEVEL_COLORS[id];
        return {
            color: hex || DEFAULT_ACCENT,
            textColor: PRINT_TEXT
        };
    }

    function levelKey(cohort) {
        return normalizeStr(cohort && cohort.levelPreset)
            || normalizeStr(cohort && cohort.level)
            || '__none__';
    }

    function levelOrderIndex(id, orderIds) {
        const idx = orderIds.indexOf(id);
        return idx === -1 ? 1000 + id.charCodeAt(0) : idx;
    }

    function sortCohortsInBucket(list, formatTitle) {
        return list.slice().sort((a, b) => {
            const na = formatTitle(a) || a.name || a.id || '';
            const nb = formatTitle(b) || b.name || b.id || '';
            return na.localeCompare(nb, undefined, { sensitivity: 'base' });
        });
    }

    function cohortLabelForPair(levelName, mwf, tth, formatTitle) {
        const level = normalizeStr(levelName);
        const mwfTitle = mwf ? normalizeStr(formatTitle(mwf)) : '';
        const tthTitle = tth ? normalizeStr(formatTitle(tth)) : '';
        if (mwf && tth) {
            if (mwfTitle && mwfTitle === tthTitle) {
                return mwfTitle;
            }
            return level || mwfTitle || tthTitle || '—';
        }
        const only = mwfTitle || tthTitle;
        if (only && only !== level) {
            return only;
        }
        return level || only || '—';
    }

    /**
     * @param {object} appData
     * @param {object} [helpers]
     * @returns {Array<{ levelId: string, cohortLabel: string, mHrTeacher: string, tHrTeacher: string, accent: string, textColor: string }>}
     */
    function buildRows(appData, helpers) {
        const h = helpers || {};
        const formatTitle = typeof h.formatCohortDisplayTitle === 'function'
            ? h.formatCohortDisplayTitle
            : (c) => normalizeStr(c && c.name);
        const getPattern = typeof h.getEffectiveCohortPattern === 'function'
            ? h.getEffectiveCohortPattern
            : (c) => (normalizeStr(c && c.schedulePattern) === 'tth' ? 'tth' : 'mwf');
        const getHr = typeof h.getHomeroomLabel === 'function'
            ? h.getHomeroomLabel
            : (c) => normalizeStr(c && c.homeroomTeacherName) || normalizeStr(c && c.homeroomTeacherUserId);
        const getColors = typeof h.getDefaultSimsonLevelColors === 'function'
            ? (id) => h.getDefaultSimsonLevelColors(id) || fallbackLevelColor(id)
            : fallbackLevelColor;

        const levelDefs = typeof h.getAllSimsonLevels === 'function' ? h.getAllSimsonLevels() : null;
        const orderIds = Array.isArray(levelDefs) && levelDefs.length
            ? levelDefs.map((l) => l && l.id).filter(Boolean)
            : SIMSON_LEVEL_ORDER.slice();
        const nameById = new Map();
        if (Array.isArray(levelDefs)) {
            levelDefs.forEach((l) => {
                if (l && l.id) {
                    nameById.set(l.id, l.name || l.id);
                }
            });
        }
        SIMSON_LEVEL_ORDER.forEach((id) => {
            if (!nameById.has(id)) {
                nameById.set(id, id);
            }
        });

        const byLevel = new Map();
        (appData && appData.cohorts ? appData.cohorts : []).forEach((cohort) => {
            if (!cohort || !cohort.id || cohort.isArchiveCohort) {
                return;
            }
            const key = levelKey(cohort);
            if (!byLevel.has(key)) {
                byLevel.set(key, { mwf: [], tth: [] });
            }
            const bucket = getPattern(cohort, appData) === 'tth' ? 'tth' : 'mwf';
            byLevel.get(key)[bucket].push(cohort);
        });

        const keys = [...byLevel.keys()].sort((a, b) => {
            const ia = levelOrderIndex(a, orderIds);
            const ib = levelOrderIndex(b, orderIds);
            if (ia !== ib) {
                return ia - ib;
            }
            return a.localeCompare(b, undefined, { sensitivity: 'base' });
        });

        const rows = [];
        keys.forEach((key) => {
            const group = byLevel.get(key);
            group.mwf = sortCohortsInBucket(group.mwf, formatTitle);
            group.tth = sortCohortsInBucket(group.tth, formatTitle);
            const n = Math.max(group.mwf.length, group.tth.length, 1);
            const levelName = key === '__none__' ? '' : (nameById.get(key) || key);
            const levelColors = getColors(key === '__none__' ? '' : key);
            const levelAccent = (levelColors && levelColors.color) || DEFAULT_ACCENT;
            const textColor = (levelColors && levelColors.textColor) || PRINT_TEXT;
            for (let i = 0; i < n; i += 1) {
                const mwf = group.mwf[i] || null;
                const tth = group.tth[i] || null;
                // Prefer cohort picker color (MWF, else TT); level defaults only when unset.
                const accent = normalizeStr(mwf && mwf.color)
                    || normalizeStr(tth && tth.color)
                    || levelAccent;
                rows.push({
                    levelId: key,
                    cohortLabel: cohortLabelForPair(levelName, mwf, tth, formatTitle),
                    mHrTeacher: mwf ? getHr(mwf) : '',
                    tHrTeacher: tth ? getHr(tth) : '',
                    accent,
                    textColor
                });
            }
        });
        return rows;
    }

    global.CCPHrTeacherList = {
        buildRows,
        fallbackLevelColor,
        SIMSON_LEVEL_ORDER,
        NAMED_LEVEL_COLORS,
        DEFAULT_ACCENT
    };
})(typeof window !== 'undefined' ? window : globalThis);
