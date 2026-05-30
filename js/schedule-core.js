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

    function normalizeSkippedLessons(skipped, totalLessons) {
        if (!Array.isArray(skipped)) return [];
        return [...new Set(skipped.map(Number))]
            .filter(n => Number.isInteger(n) && n >= 1 && n <= totalLessons)
            .sort((a, b) => a - b);
    }

    /** Contiguous ranges from sorted lesson numbers, e.g. [11,12,13,15] → [{start:11,end:13},{start:15,end:15}] */
    function skippedLessonsToRanges(skipped) {
        const list = Array.isArray(skipped) ? skipped : [];
        if (!list.length) return [];
        const ranges = [];
        let start = list[0];
        let end = list[0];
        for (let i = 1; i < list.length; i += 1) {
            if (list[i] === end + 1) {
                end = list[i];
            } else {
                ranges.push({ start, end });
                start = list[i];
                end = list[i];
            }
        }
        ranges.push({ start, end });
        return ranges;
    }

    function formatLessonDayLabel(n) {
        return `Day ${n}`;
    }

    function formatMergeLabel(start, end) {
        return `Day ${start}+${end}`;
    }

    function buildLessonGroups(totalLessons, mergeStarts) {
        return buildScheduleGroups(totalLessons, mergeStarts, [], null);
    }

    /**
     * Build placable groups honoring skips (omitted) and merges (adjacent pairs).
     * mergeStarts use original lesson numbers 1…N.
     */
    function buildScheduleGroups(totalLessons, mergeStarts, skippedLessons, labelFn) {
        const skippedSet = new Set(normalizeSkippedLessons(skippedLessons, totalLessons));
        const normalizedMerges = normalizeCompressionMerges(mergeStarts, totalLessons)
            .filter(s => !skippedSet.has(s) && !skippedSet.has(s + 1));
        const groups = [];
        const labelFor = typeof labelFn === 'function'
            ? labelFn
            : (group) => (group.compressed
                ? formatMergeLabel(group.start, group.end)
                : formatLessonDayLabel(group.start));

        for (let day = 1; day <= totalLessons; day += 1) {
            if (skippedSet.has(day)) {
                continue;
            }
            if (normalizedMerges.includes(day) && day < totalLessons && !skippedSet.has(day + 1)) {
                const group = {
                    start: day,
                    end: day + 1,
                    days: [day, day + 1],
                    label: '',
                    compressed: true
                };
                group.label = labelFor(group);
                groups.push(group);
                day += 1;
            } else {
                const group = {
                    start: day,
                    end: day,
                    days: [day],
                    label: '',
                    compressed: false
                };
                group.label = labelFor(group);
                groups.push(group);
            }
        }
        return {
            groups,
            merges: normalizedMerges,
            skipped: [...skippedSet].sort((a, b) => a - b)
        };
    }

    function getAutoMergeStartPreferenceOrder(totalLessons, preferredStart) {
        const starts = [];
        for (let s = 1; s < totalLessons; s += 1) starts.push(s);
        const preferred = preferredStart != null
            ? preferredStart
            : SCHEDULE_CONFIG.autoMergePreferredPairStart;
        if (typeof preferred === 'number' && starts.includes(preferred)) {
            return [preferred, ...starts.filter(s => s !== preferred)];
        }
        return starts;
    }

    /** Unit-pair classes: prefer merging 1+2, 3+4 (speaking+writing within unit). */
    function getUnitPairMergeStartPreferenceOrder(totalLessons) {
        const odd = [];
        const even = [];
        for (let s = 1; s < totalLessons; s += 1) {
            if (s % 2 === 1) odd.push(s);
            else even.push(s);
        }
        return [...odd, ...even];
    }

    function mergePlanToFit(availableSlots, totalLessons, userMerges, mode, startOrder) {
        const normalizedUser = normalizeCompressionMerges(userMerges, totalLessons);
        if (mode !== 'autoWhenNeeded') return normalizedUser;
        let merges = [];
        let { groups } = buildScheduleGroups(totalLessons, merges, [], null);
        if (groups.length <= availableSlots) return merges;
        let guard = 0;
        const orderFn = Array.isArray(startOrder)
            ? () => startOrder
            : (typeof startOrder === 'function'
                ? startOrder
                : (tl) => getAutoMergeStartPreferenceOrder(tl));
        while (groups.length > availableSlots && guard < SCHEDULE_CONFIG.maxMergeIterations) {
            guard += 1;
            const startOrderList = orderFn(totalLessons);
            const startRank = {};
            startOrderList.forEach((s, i) => { startRank[s] = i; });
            let bestTrial = null;
            let bestCount = groups.length;
            let bestRank = 9999;
            for (const start of startOrderList) {
                if (merges.includes(start)) continue;
                const trial = normalizeCompressionMerges([...merges, start], totalLessons);
                const cnt = buildScheduleGroups(totalLessons, trial, [], null).groups.length;
                const rnk = startRank[start];
                if (cnt < bestCount || (cnt === bestCount && rnk < bestRank)) {
                    bestCount = cnt;
                    bestTrial = trial;
                    bestRank = rnk;
                }
            }
            if (!bestTrial) break;
            merges = bestTrial;
            ({ groups } = buildScheduleGroups(totalLessons, merges, [], null));
        }
        return merges;
    }

    /**
     * Auto-propose merges then trailing skips to fit availableSlots.
     * @returns {{ merges: number[], skipped: number[], canFullyFit: boolean }}
     */
    function proposeScheduleFit(availableSlots, totalLessons, options) {
        options = options || {};
        const mergeOrder = options.mergeStartOrder || null;
        let merges = mergePlanToFit(
            availableSlots,
            totalLessons,
            [],
            'autoWhenNeeded',
            mergeOrder
        );
        let { groups } = buildScheduleGroups(totalLessons, merges, [], null);
        let skipped = [];
        if (groups.length > availableSlots) {
            let need = groups.length - availableSlots;
            for (let n = totalLessons; n >= 1 && need > 0; n -= 1) {
                if (!skipped.includes(n)) {
                    skipped.unshift(n);
                    need -= 1;
                }
            }
            skipped = normalizeSkippedLessons(skipped, totalLessons);
            ({ groups } = buildScheduleGroups(totalLessons, merges, skipped, null));
        }
        return {
            merges,
            skipped,
            canFullyFit: groups.length <= availableSlots
        };
    }

    /**
     * When the schedule-adjustment table is shown, use only its merges (including []).
     * Otherwise fall back to legacy compression checkboxes.
     */
    function resolveCompressionMergesFromSources(hasScheduleAdjustmentTable, adjustmentTableMerges, legacyMerges, totalLessons) {
        const total = sanitizeTotalLessons(totalLessons);
        if (hasScheduleAdjustmentTable) {
            return normalizeCompressionMerges(adjustmentTableMerges, total);
        }
        return normalizeCompressionMerges(legacyMerges, total);
    }

    global.CCPSchedule = {
        SCHEDULE_CONFIG,
        sanitizeTotalLessons,
        normalizeCompressionMerges,
        normalizeSkippedLessons,
        skippedLessonsToRanges,
        resolveCompressionMergesFromSources,
        buildLessonGroups,
        buildScheduleGroups,
        getAutoMergeStartPreferenceOrder,
        getUnitPairMergeStartPreferenceOrder,
        mergePlanToFit,
        proposeScheduleFit,
        formatLessonDayLabel,
        formatMergeLabel
    };
})(typeof window !== 'undefined' ? window : globalThis);
