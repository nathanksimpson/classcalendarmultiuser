/**
 * TMS class name parsing (browser) — keep in sync with shared/tms-roster-core.cjs.
 */
(function (global) {
    function cleanTmsCohortDisplayName(name) {
        return String(name || '')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^\[[^\]]*\]\s*/, '')
            .trim();
    }

    function inferScheduleFromTmsClassName(name) {
        const s = cleanTmsCohortDisplayName(name);
        if (/T\^/i.test(s) || /(?:^|[^A-Za-z])T(?:\d|$)/.test(s)) {
            return { schedulePattern: 'tth', meetingDays: [2, 4] };
        }
        if (/M\^/i.test(s) || /(?:^|[^A-Za-z])M(?:\d|$)/.test(s)) {
            return { schedulePattern: 'mwf', meetingDays: [1, 3, 5] };
        }
        return { schedulePattern: '', meetingDays: [] };
    }

    function parseTmsClassNameMeta(name) {
        const raw = cleanTmsCohortDisplayName(name);
        let termCode = '';
        let termYymm = '';
        let termKind = '';

        const caretInline = raw.match(/\^(\d{4})(?:_|[^\d]|$)/);
        const caretEnd = raw.match(/\^(\d{4})$/);
        if (caretInline) {
            termCode = caretInline[1];
            termYymm = caretInline[1];
            termKind = 'yymm';
        } else if (caretEnd) {
            termCode = caretEnd[1];
            termYymm = caretEnd[1];
            termKind = 'yymm';
        }

        if (!termCode) {
            const seasonInline = raw.match(/_(\d{2}[A-Za-z]{2})(?:_|[^\dA-Za-z]|$)/);
            const seasonEnd = raw.match(/_(\d{2}[A-Za-z]{2})$/);
            if (seasonInline) {
                termCode = seasonInline[1];
                termKind = 'season';
            } else if (seasonEnd) {
                termCode = seasonEnd[1];
                termKind = 'season';
            }
        }

        let dayPattern = '';
        const dayCaret = raw.match(/([MT])\^/i);
        if (dayCaret) {
            dayPattern = dayCaret[1].toUpperCase();
        } else {
            const daySeason = raw.match(/([MT])_(\d{2}[A-Za-z]{2})/i);
            if (daySeason) {
                dayPattern = daySeason[1].toUpperCase();
            }
        }

        let baseName = raw;
        if (raw.includes('^')) {
            baseName = raw.split('^')[0];
        } else if (termCode) {
            const idx = raw.indexOf('_' + termCode);
            if (idx >= 0) {
                baseName = raw.slice(0, idx);
            }
        }
        if (dayPattern && baseName.endsWith(dayPattern)) {
            baseName = baseName.slice(0, -1);
        }
        baseName = String(baseName || '').trim();

        const schedule = inferScheduleFromTmsClassName(raw);
        return {
            raw,
            baseName,
            dayPattern,
            termCode,
            termYymm,
            termKind,
            schedulePattern: schedule.schedulePattern,
            meetingDays: schedule.meetingDays.slice()
        };
    }

    function cohortMatchesTermFilter(cohortName, filterCode) {
        const f = String(filterCode || '').trim();
        if (!f) {
            return true;
        }
        const meta = parseTmsClassNameMeta(cohortName);
        if (!meta.termCode) {
            return false;
        }
        return meta.termCode === f || meta.termYymm === f;
    }

    function listTermCodesFromNames(names) {
        const counts = new Map();
        (Array.isArray(names) ? names : []).forEach((name) => {
            const meta = parseTmsClassNameMeta(name);
            if (meta.termCode) {
                counts.set(meta.termCode, (counts.get(meta.termCode) || 0) + 1);
            }
        });
        return Array.from(counts.entries())
            .map(([code, count]) => ({
                code,
                count,
                kind: /^\d{4}$/.test(code) ? 'yymm' : 'season'
            }))
            .sort((a, b) => {
                if (a.kind === 'yymm' && b.kind === 'yymm') {
                    return b.code.localeCompare(a.code);
                }
                if (a.kind === 'yymm') {
                    return -1;
                }
                if (b.kind === 'yymm') {
                    return 1;
                }
                return a.code.localeCompare(b.code);
            });
    }

    function pickDefaultTermCode(codeRows) {
        const list = Array.isArray(codeRows) ? codeRows : [];
        const yymm = list.filter((r) => r && r.kind === 'yymm');
        if (yymm.length) {
            return yymm[0].code;
        }
        return list.length ? list[0].code : '';
    }

    /** TMS name without "[HR] " and "^term", keeping the M/T day letter (what roster sync shows and matches on). */
    function stripTmsClassName(name) {
        const stripped = String(name || '')
            .replace(/^\[[^\]]+\]\s*/u, '')
            .replace(/\s+/g, ' ')
            .trim();
        return (stripped.split('^')[0] || stripped).trim();
    }

    /** Calendar cohort name for a TMS class: also drops the M/T day letter and the term code. */
    function cohortNameFromTms(name) {
        const meta = parseTmsClassNameMeta(name);
        return meta.baseName || stripTmsClassName(name);
    }

    /**
     * Meeting pattern for a new cohort made from a TMS class: the M/T day letter when TMS has one,
     * otherwise a trailing T (or T_term) means Tue/Thu, and anything else Mon/Wed/Fri.
     */
    function scheduleForNewCohort(name) {
        const meta = parseTmsClassNameMeta(name);
        if (meta.schedulePattern) {
            return { schedulePattern: meta.schedulePattern, meetingDays: meta.meetingDays.slice() };
        }
        const core = stripTmsClassName(name);
        if (/T\s*$/i.test(core) || /T_\d/i.test(core)) {
            return { schedulePattern: 'tth', meetingDays: [2, 4] };
        }
        return { schedulePattern: 'mwf', meetingDays: [1, 3, 5] };
    }

    global.CCPTmsClassName = {
        stripTmsClassName,
        cohortNameFromTms,
        scheduleForNewCohort,
        cleanTmsCohortDisplayName,
        inferScheduleFromTmsClassName,
        parseTmsClassNameMeta,
        cohortMatchesTermFilter,
        listTermCodesFromNames,
        pickDefaultTermCode
    };
})(typeof window !== 'undefined' ? window : globalThis);
