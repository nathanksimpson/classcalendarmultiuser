/**
 * Level progression — where a cohort goes next term, by default.
 * Pure tables + helpers; no DOM, no app state.
 * window.CCPLevelProgression
 *
 * Elementary: one step up the ladder each term (Red -> ... -> Mirinae).
 * Middle school (flyer "Simson Middle school"): each level tier has one cohort
 * per school year (중1, 중2, 중3). By default a cohort moves to the next school
 * year of the SAME tier (유마 -> 홉스 -> 안나). Moving to a higher tier is a
 * decision based on test scores, so it is an override, never a default.
 * 중3 finishes the academy's middle school.
 *
 * Every result carries a `source` so the screen can show "default" or "changed".
 */
(function (global) {
    /** Elementary ladder, lowest first. Purple sits before the Waterflow levels. */
    const ELEMENTARY_ORDER = [
        'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Navy', 'Purple',
        'Saemmul', 'Yeoul', 'Garam', 'Bada', 'Byeolmaru', 'Mirinae'
    ];

    /** Middle-school tiers, lowest first; each lists its 중1, 중2, 중3 cohort. */
    const MIDDLE_TIERS = [
        { id: 'basic', label: 'Basic', cohorts: ['유마', '홉스', '안나'] },
        { id: 'inter-low', label: 'Inter-low', cohorts: ['레오', '티카', '낭가'] },
        { id: 'inter-high', label: 'Inter-high', cohorts: ['파보', '빅키', '로체'] },
        // 바이컬 is the spelling already stored in data for the 중2 Advanced cohort; 바이칼 is the display name.
        { id: 'advanced', label: 'Advanced', cohorts: ['폴라', '바이컬', '캉첸'] }
    ];

    const SPELLING = { '바이칼': '바이컬' };

    function str(v) {
        return v == null ? '' : String(v).trim();
    }

    function canon(id) {
        const v = str(id);
        return SPELLING[v] || v;
    }

    function middlePosition(id) {
        const v = canon(id);
        for (let t = 0; t < MIDDLE_TIERS.length; t += 1) {
            const g = MIDDLE_TIERS[t].cohorts.indexOf(v);
            if (g >= 0) return { tier: t, grade: g };
        }
        return null;
    }

    /**
     * The default next level.
     * @returns {{ to: string, reason: 'next'|'graduate'|'choose'|'unknown' }}
     *   next      – `to` is the level.
     *   graduate  – finished middle school (`to` is '').
     *   choose    – a person must pick (elementary -> middle school depends on the score).
     *   unknown   – the level is not in the table.
     */
    function defaultNext(levelId) {
        const id = canon(levelId);
        const e = ELEMENTARY_ORDER.indexOf(id);
        if (e >= 0) {
            if (e < ELEMENTARY_ORDER.length - 1) return { to: ELEMENTARY_ORDER[e + 1], reason: 'next' };
            return { to: '', reason: 'choose' };
        }
        const m = middlePosition(id);
        if (m) {
            if (m.grade >= 2) return { to: '', reason: 'graduate' };
            return { to: MIDDLE_TIERS[m.tier].cohorts[m.grade + 1], reason: 'next' };
        }
        return { to: '', reason: 'unknown' };
    }

    /** Levels a person may pick instead of the default (for the override list). */
    function optionsFor(levelId) {
        const id = canon(levelId);
        if (ELEMENTARY_ORDER.includes(id)) {
            return ELEMENTARY_ORDER.concat(MIDDLE_TIERS.map((t) => t.cohorts[0]));
        }
        const m = middlePosition(id);
        if (m) {
            const nextGrade = Math.min(2, m.grade + 1);
            return MIDDLE_TIERS.map((t) => t.cohorts[nextGrade]);
        }
        return [];
    }

    /**
     * Plan the next term for a list of cohorts.
     * @param {Array<{id: string, level: string}>} cohorts
     * @param {Object<string,string>} overrides cohort id -> chosen level, or '' to stay, or '__stay__'
     * @returns {Array<{id, from, to, reason, source: 'default'|'override'}>}
     */
    function planProgression(cohorts, overrides) {
        const ov = overrides || {};
        return (cohorts || []).map((c) => {
            const from = canon(c.level);
            if (Object.prototype.hasOwnProperty.call(ov, c.id)) {
                const pick = ov[c.id];
                return {
                    id: c.id,
                    from,
                    to: pick === '__stay__' ? from : canon(pick),
                    reason: pick === '__stay__' ? 'stay' : 'next',
                    source: 'override'
                };
            }
            const d = defaultNext(from);
            return { id: c.id, from, to: d.to, reason: d.reason, source: 'default' };
        });
    }

    global.CCPLevelProgression = {
        ELEMENTARY_ORDER: ELEMENTARY_ORDER.slice(),
        MIDDLE_TIERS,
        defaultNext,
        optionsFor,
        planProgression
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = global.CCPLevelProgression;
})(typeof window !== 'undefined' ? window : globalThis);
