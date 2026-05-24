/**
 * Simson Junior Rainbow / Senior Waterflow schedule matrix.
 * Suggests meeting days for a subject track at a level — never overrides teacher choice.
 */
(function (global) {
    const MATRIX = {
        version: 1,
        patterns: {
            mwf: { meetingDays: [1, 3, 5], label: { en: 'Mon / Wed / Fri', ko: '월 / 수 / 금' } },
            tth: { meetingDays: [2, 4], label: { en: 'Tue / Thu', ko: '화 / 목' } }
        },
        builtinSubjectTracks: {
            spkWr: { classTypeId: 'builtin-wr-sp', builtin: true },
            debate: { classTypeId: 'builtin-debate', builtin: true }
        },
        slots: []
    };

    function loadSlotsFromReference() {
        if (global.CCPScheduleMatrixData && Array.isArray(global.CCPScheduleMatrixData.slots)) {
            MATRIX.slots = global.CCPScheduleMatrixData.slots;
            if (global.CCPScheduleMatrixData.patterns) {
                MATRIX.patterns = global.CCPScheduleMatrixData.patterns;
            }
            if (global.CCPScheduleMatrixData.builtinSubjectTracks) {
                MATRIX.builtinSubjectTracks = global.CCPScheduleMatrixData.builtinSubjectTracks;
            }
        }
    }

    function meetingDaysKey(days) {
        if (!Array.isArray(days) || !days.length) {
            return '';
        }
        return days.slice().sort((a, b) => a - b).join(',');
    }

    function patternIdFromMeetingDays(days) {
        const key = meetingDaysKey(days);
        if (key === '1,3,5') {
            return 'mwf';
        }
        if (key === '2,4') {
            return 'tth';
        }
        if (key === '1,3') {
            return 'mw';
        }
        if (key === '3,5') {
            return 'wf';
        }
        if (key === '1,5') {
            return 'mf';
        }
        return null;
    }

    function findSlots(query) {
        const { programTrack, levelGroup, level, subjectTrack, patternId } = query;
        return MATRIX.slots.filter(slot => {
            if (programTrack && slot.programTrack !== programTrack) {
                return false;
            }
            if (levelGroup && slot.levelGroup !== levelGroup) {
                return false;
            }
            if (level && slot.level !== level) {
                return false;
            }
            if (patternId && slot.patternId !== patternId) {
                return false;
            }
            if (!subjectTrack) {
                return true;
            }
            return Object.values(slot.byWeekday || {}).includes(subjectTrack);
        });
    }

    function suggestPeriodsByWeekdayForPreset(presetDef, meetingDays, patternId) {
        if (!presetDef || !presetDef.subjectTrack || !Array.isArray(meetingDays) || !meetingDays.length) {
            return null;
        }
        const subjectTrack = presetDef.subjectTrack;
        const programTrack = presetDef.programTrack;
        const levelGroup = presetDef.levelGroup;
        const level = presetDef.level;
        const pid = patternId || patternIdFromMeetingDays(meetingDays) || 'mwf';
        const slots = findSlots({
            programTrack,
            levelGroup,
            level,
            subjectTrack,
            patternId: pid
        });
        if (!slots.length) {
            return null;
        }
        const periodByWeekday = {};
        meetingDays.forEach(dow => {
            const match = slots.find(slot => slot.byWeekday && slot.byWeekday[dow] === subjectTrack);
            if (match && match.period != null) {
                periodByWeekday[String(dow)] = match.period;
            }
        });
        const vals = Object.values(periodByWeekday);
        if (!vals.length) {
            return null;
        }
        return {
            periodByWeekday,
            period: Math.min(...vals),
            periodSummary: [...new Set(vals)].sort((a, b) => a - b).join(', ')
        };
    }

    function suggestMeetingDaysForPreset(presetDef, options) {
        if (!presetDef || presetDef.builtinSubjectTrack) {
            return null;
        }
        const subjectTrack = presetDef.subjectTrack;
        const programTrack = presetDef.programTrack;
        const levelGroup = presetDef.levelGroup;
        const level = presetDef.level;
        if (!subjectTrack || !programTrack || !levelGroup) {
            return null;
        }
        const currentDays = options && options.currentMeetingDays;
        let patternId = patternIdFromMeetingDays(currentDays);
        if (!patternId) {
            patternId = 'mwf';
        }
        const slots = findSlots({ programTrack, levelGroup, level, subjectTrack, patternId });
        if (!slots.length) {
            const altPattern = patternId === 'mwf' ? 'tth' : 'mwf';
            const altSlots = findSlots({ programTrack, levelGroup, level, subjectTrack, patternId: altPattern });
            if (altSlots.length) {
                patternId = altPattern;
            }
        }
        const finalSlots = findSlots({ programTrack, levelGroup, level, subjectTrack, patternId });
        if (!finalSlots.length) {
            return null;
        }
        const pat = MATRIX.patterns[patternId];
        const meetingDays = pat ? pat.meetingDays.slice() : [];
        const periodInfo = suggestPeriodsByWeekdayForPreset(
            presetDef,
            meetingDays,
            patternId
        );
        const period = periodInfo ? periodInfo.period : finalSlots[0].period;
        const periodSummary = periodInfo ? periodInfo.periodSummary : String(period);
        return {
            patternId,
            period,
            periodSummary,
            periodByWeekday: periodInfo ? periodInfo.periodByWeekday : null,
            meetingDays,
            label: pat ? pat.label : null,
            hintKey: 'scheduleMatrixSuggestHint'
        };
    }

    function getBuiltinClassTypeIdForSubjectTrack(subjectTrack) {
        const entry = MATRIX.builtinSubjectTracks[subjectTrack];
        return entry && entry.classTypeId ? entry.classTypeId : null;
    }

    loadSlotsFromReference();

    global.CCPScheduleMatrix = {
        getMatrix() {
            return MATRIX;
        },
        getPatterns() {
            return MATRIX.patterns;
        },
        findSlots,
        suggestMeetingDaysForPreset,
        suggestPeriodsByWeekdayForPreset,
        patternIdFromMeetingDays,
        getBuiltinClassTypeIdForSubjectTrack
    };
})(typeof window !== 'undefined' ? window : globalThis);
