/**
 * Level progression: where a cohort goes next term, by default.
 * Pure tables + helpers; no DOM, no app state.
 * window.CCPLevelProgression
 *
 * Elementary: Red -> ... -> Purple -> Saemmul -> Yeoul -> Garam -> Bada -> Mirinae -> Byeolmaru.
 *   Cohorts usually move up after two terms, but not all together, so the
 *   default only suggests a move once the cohort has had two terms at its
 *   level; a person can always override one cohort.
 * Middle school (flyer "Simson Middle school"): each level group (Pre-Basic,
 *   Basic, Inter-low, Inter-high, Advanced) has one cohort per school year
 *   (중1, 중2, 중3): the same English ability, different year requirements.
 *   The school year changes in December, so only terms starting in December
 *   move a cohort to the next year of its own group. Moving to a higher group
 *   is a person's decision (test scores), never a default. 중3 finishes.
 * Sixth graders leave elementary for 중1 of the matching group (MIDDLE_ENTRY).
 *
 * Every result carries a `source` so the screen can show "default" or "changed".
 */
(function (global) {
    /** Elementary ladder, lowest first. Purple sits before the Waterflow levels. */
    const ELEMENTARY_ORDER = [
        'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Navy', 'Purple',
        'Saemmul', 'Yeoul', 'Garam', 'Bada', 'Mirinae', 'Byeolmaru'
    ];

    /** Middle-school level groups, lowest first; each lists its 중1, 중2, 중3 cohort. */
    const MIDDLE_TIERS = [
        { id: 'pre-basic', label: 'Pre-Basic', cohorts: ['S1', 'S2', 'S3'] },
        { id: 'basic', label: 'Basic', cohorts: ['\uC720\uB9C8', '\uD649\uC2A4', '\uC548\uB098'] },
        { id: 'inter-low', label: 'Inter-low', cohorts: ['\uB808\uC624', '\uD2F0\uCE74', '\uB0AD\uAC00'] },
        { id: 'inter-high', label: 'Inter-high', cohorts: ['\uD30C\uBCF4', '\uBE45\uD0A4', '\uB85C\uCCB4'] },
        // 바이컬 is the spelling already stored in data for the 중2 Advanced cohort; 바이칼 is the display name.
        { id: 'advanced', label: 'Advanced', cohorts: ['\uD3F4\uB77C', '\uBC14\uC774\uCEEC', '\uCE89\uCCB8'] }
    ];

    /** The 중1 cohort a sixth grader joins from each senior level (its middle-school analogue). */
    const MIDDLE_ENTRY = {
        Saemmul: '\uC720\uB9C8',
        Yeoul: '\uC720\uB9C8',
        Garam: '\uB808\uC624',
        Bada: '\uD30C\uBCF4',
        Mirinae: '\uD3F4\uB77C',
        Byeolmaru: '\uD3F4\uB77C'
    };

    const SPELLING = { '\uBC14\uC774\uCE7C': '\uBC14\uC774\uCEEC' };

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
     * @param {string} levelId
     * @param {{ termStartMonth?: number, termsAtLevel?: number }} [ctx]
     *   termStartMonth: 1-12, month the new term starts (middle school moves up in December).
     *   termsAtLevel: terms this cohort has already had at its level (elementary moves after two).
     * @returns {{ to: string, reason: 'next'|'stay'|'ask'|'graduate'|'unknown', askLevelUp?: boolean }}
     *   next      - `to` is the level.
     *   stay      - the cohort keeps its level this term.
     *   ask       - elementary: a move is likely but the term count is unknown; `to` is the suggestion.
     *   graduate  - finished middle school (`to` is '').
     *   askLevelUp - December middle-school term: also ask whether to go up a group.
     */
    function defaultNext(levelId, ctx) {
        const id = canon(levelId);
        const c = ctx || {};
        const e = ELEMENTARY_ORDER.indexOf(id);
        if (e >= 0) {
            const top = e === ELEMENTARY_ORDER.length - 1;
            const next = top ? '' : ELEMENTARY_ORDER[e + 1];
            if (top) return { to: id, reason: 'stay' };
            if (c.termsAtLevel == null) return { to: next, reason: 'ask' };
            return Number(c.termsAtLevel) >= 2 ? { to: next, reason: 'next' } : { to: id, reason: 'stay' };
        }
        const m = middlePosition(id);
        if (m) {
            if (Number(c.termStartMonth) !== 12) return { to: id, reason: 'stay' };
            if (m.grade >= 2) return { to: '', reason: 'graduate' };
            return { to: MIDDLE_TIERS[m.tier].cohorts[m.grade + 1], reason: 'next', askLevelUp: true };
        }
        return { to: '', reason: 'unknown' };
    }

    /** The 중1 cohort a sixth grader from this senior level joins ('' if the level has none). */
    function middleFor(levelId) {
        return MIDDLE_ENTRY[canon(levelId)] || '';
    }

    /** The English-ability group a level belongs to. 유마, 홉스, 안나 are all 'basic': same ability, different school year. */
    function levelGroup(levelId) {
        const id = canon(levelId);
        const m = middlePosition(id);
        if (m) return MIDDLE_TIERS[m.tier].id;
        return ELEMENTARY_ORDER.includes(id) ? id : '';
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
     * @param {Array<{id: string, level: string, termsAtLevel?: number}>} cohorts
     * @param {Object<string,string>} overrides cohort id -> chosen level, or '' to stay, or '__stay__'
     * @returns {Array<{id, from, to, reason, source: 'default'|'override'}>}
     */
    function planProgression(cohorts, overrides, ctx) {
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
            const d = defaultNext(from, Object.assign({}, ctx, c.termsAtLevel != null ? { termsAtLevel: c.termsAtLevel } : {}));
            return { id: c.id, from, to: d.to, reason: d.reason, source: 'default' };
        });
    }

    /**
     * Students are what actually move: a cohort's plan is only where its students go by default.
     * @param {Array<{id: string, cohortId: string}>} students
     * @param {Array<{id, to}>} cohortPlan result of planProgression
     * @param {Object<string,string>} studentOverrides student id -> level (e.g. moved by test score)
     * @returns {Array<{id, cohortId, to, source: 'cohort'|'override'}>}
     */
    function planStudents(students, cohortPlan, studentOverrides) {
        const byCohort = new Map((cohortPlan || []).map((p) => [p.id, p]));
        const ov = studentOverrides || {};
        return (students || []).map((st) => {
            if (Object.prototype.hasOwnProperty.call(ov, st.id)) {
                return { id: st.id, cohortId: st.cohortId, to: canon(ov[st.id]), source: 'override' };
            }
            const c = byCohort.get(st.cohortId);
            return { id: st.id, cohortId: st.cohortId, to: c ? c.to : '', source: 'cohort' };
        });
    }

    /** Levels whose next-term headcount is below the minimum, so the person can merge or move students. */
    function belowMinimum(studentPlan, minimum) {
        const counts = new Map();
        (studentPlan || []).forEach((p) => {
            if (p.to) counts.set(p.to, (counts.get(p.to) || 0) + 1);
        });
        const min = Number(minimum) || 0;
        return Array.from(counts.entries()).filter(([, n]) => n < min).map(([level, count]) => ({ level, count }));
    }

    /**
     * Cohorts follow the students: next term's cohort at a level exists only if students land there.
     * @param {Array<{id, to}>} studentPlan result of planStudents
     * @param {Array<{id: string, level: string}>} currentCohorts this term's cohorts
     * @param {number} [minimum] smallest cohort worth running (0 = no limit)
     * @returns {Array<{level, studentIds, status: 'continues'|'new'|'empty'|'small', fromCohortIds}>}
     *   continues - had a cohort at this level and still has enough students
     *   new       - students arrive at a level with no cohort this term
     *   empty     - had a cohort at this level and nobody lands there (it ends)
     *   small     - students land there but fewer than the minimum (merge or move them)
     */
    function deriveCohorts(studentPlan, currentCohorts, minimum) {
        const min = Number(minimum) || 0;
        const landing = new Map();
        (studentPlan || []).forEach((p) => {
            if (!p.to) return;
            if (!landing.has(p.to)) landing.set(p.to, []);
            landing.get(p.to).push(p.id);
        });
        const had = new Map();
        (currentCohorts || []).forEach((c) => {
            const lv = canon(c.level);
            if (!had.has(lv)) had.set(lv, []);
            had.get(lv).push(c.id);
        });
        const out = [];
        landing.forEach((ids, level) => {
            const from = had.get(level) || [];
            const status = ids.length < min ? 'small' : from.length ? 'continues' : 'new';
            out.push({ level, studentIds: ids, status, fromCohortIds: from });
        });
        had.forEach((from, level) => {
            if (!landing.has(level)) out.push({ level, studentIds: [], status: 'empty', fromCohortIds: from });
        });
        return out;
    }

    global.CCPLevelProgression = {
        deriveCohorts,
        planStudents,
        belowMinimum,
        ELEMENTARY_ORDER: ELEMENTARY_ORDER.slice(),
        MIDDLE_TIERS,
        MIDDLE_ENTRY,
        defaultNext,
        middleFor,
        levelGroup,
        optionsFor,
        planProgression
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = global.CCPLevelProgression;
})(typeof window !== 'undefined' ? window : globalThis);
