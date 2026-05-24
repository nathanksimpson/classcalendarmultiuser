/**
 * Scheduling helpers (lesson groups + compression). Loaded before app.js.
 * Used by tests and the main app (window.CCPSchedule).
 */
(function (global) {
    const SCHEDULE_CONFIG = {
        maxMergeIterations: 48,
        autoMergePreferredPairStart: 2
    };

    function sanitizeTotalLessons(value) {
        const parsed = parseInt(value, 10);
        if (Number.isNaN(parsed) || parsed < 1) return 1;
        return parsed;
    }

    function normalizeCompressionMerges(mergeStarts, totalLessons) {
        if (!Array.isArray(mergeStarts)) return [];
        const uniqueSorted = [...new Set(mergeStarts.map(Number))]
            .filter(n => Number.isInteger(n) && n >= 1 && n < totalLessons)
            .sort((a, b) => a - b);
        const normalized = [];
        uniqueSorted.forEach(start => {
            const prev = normalized[normalized.length - 1];
            if (prev === start - 1) return;
            normalized.push(start);
        });
        return normalized;
    }

    function formatLessonDayLabel(n) {
        return `Day ${n}`;
    }

    function formatMergeLabel(start, end) {
        return `Day ${start}+${end}`;
    }

    function buildLessonGroups(totalLessons, mergeStarts) {
        const normalizedMerges = normalizeCompressionMerges(mergeStarts, totalLessons);
        const groups = [];
        for (let day = 1; day <= totalLessons; day++) {
            if (normalizedMerges.includes(day)) {
                groups.push({
                    start: day,
                    end: day + 1,
                    days: [day, day + 1],
                    label: formatMergeLabel(day, day + 1),
                    compressed: true
                });
                day += 1;
            } else {
                groups.push({
                    start: day,
                    end: day,
                    days: [day],
                    label: formatLessonDayLabel(day),
                    compressed: false
                });
            }
        }
        return { groups, merges: normalizedMerges };
    }

    function getAutoMergeStartPreferenceOrder(totalLessons) {
        const starts = [];
        for (let s = 1; s < totalLessons; s += 1) starts.push(s);
        const preferred = SCHEDULE_CONFIG.autoMergePreferredPairStart;
        if (typeof preferred === 'number' && starts.includes(preferred)) {
            return [preferred, ...starts.filter(s => s !== preferred)];
        }
        return starts;
    }

    function mergePlanToFit(availableSlots, totalLessons, userMerges, mode) {
        const normalizedUser = normalizeCompressionMerges(userMerges, totalLessons);
        if (mode !== 'autoWhenNeeded') return normalizedUser;
        let merges = [];
        let { groups } = buildLessonGroups(totalLessons, merges);
        if (groups.length <= availableSlots) return merges;
        let guard = 0;
        while (groups.length > availableSlots && guard < SCHEDULE_CONFIG.maxMergeIterations) {
            guard += 1;
            const startOrder = getAutoMergeStartPreferenceOrder(totalLessons);
            const startRank = {};
            startOrder.forEach((s, i) => { startRank[s] = i; });
            let bestTrial = null;
            let bestCount = groups.length;
            let bestRank = 9999;
            for (const start of startOrder) {
                if (merges.includes(start)) continue;
                const trial = normalizeCompressionMerges([...merges, start], totalLessons);
                const cnt = buildLessonGroups(totalLessons, trial).groups.length;
                const rnk = startRank[start];
                if (cnt < bestCount || (cnt === bestCount && rnk < bestRank)) {
                    bestCount = cnt;
                    bestTrial = trial;
                    bestRank = rnk;
                }
            }
            if (!bestTrial) break;
            merges = bestTrial;
            ({ groups } = buildLessonGroups(totalLessons, merges));
        }
        return merges;
    }

    global.CCPSchedule = {
        SCHEDULE_CONFIG,
        sanitizeTotalLessons,
        normalizeCompressionMerges,
        buildLessonGroups,
        getAutoMergeStartPreferenceOrder,
        mergePlanToFit
    };
})(typeof window !== 'undefined' ? window : globalThis);
