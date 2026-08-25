/**
 * 수행평가 Open/Close/Reopen/Finalized windows — pure helpers (no DOM).
 * Used by debate schedule warnings, essay due caps, and tests.
 */
(function (global) {
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

    const PERF_EVAL_TYPES = {
        OPEN: 'perf_eval_open',
        CLOSE: 'perf_eval_close',
        REOPEN: 'perf_eval_reopen',
        FINALIZED: 'perf_eval_finalized'
    };

    const PERF_EVAL_TYPE_SET = new Set(Object.values(PERF_EVAL_TYPES));

    function isPerfEvalEventType(type) {
        return PERF_EVAL_TYPE_SET.has(String(type || '').trim());
    }

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function minDateStr(a, b) {
        const left = normalizeStr(a);
        const right = normalizeStr(b);
        if (!left) {
            return right;
        }
        if (!right) {
            return left;
        }
        return left < right ? left : right;
    }

    function maxDateStr(a, b) {
        const left = normalizeStr(a);
        const right = normalizeStr(b);
        if (!left) {
            return right;
        }
        if (!right) {
            return left;
        }
        return left > right ? left : right;
    }

    /**
     * Single-day marker date, or range end (Close/Finalized ceiling) / start (Open).
     * @param {object} event
     * @param {'start'|'end'} prefer
     */
    function getEventAnchorDate(event, prefer) {
        if (!event || typeof event !== 'object') {
            return '';
        }
        const preferEnd = prefer === 'end';
        if (event.isRange === true) {
            const start = normalizeStr(event.startDate);
            const end = normalizeStr(event.endDate);
            if (preferEnd) {
                return ISO_DATE.test(end) ? end : (ISO_DATE.test(start) ? start : '');
            }
            return ISO_DATE.test(start) ? start : (ISO_DATE.test(end) ? end : '');
        }
        const date = normalizeStr(event.date);
        if (ISO_DATE.test(date)) {
            return date;
        }
        const start = normalizeStr(event.startDate);
        return ISO_DATE.test(start) ? start : '';
    }

    /**
     * Minimal applicability (mirrors app targetFilterAppliesToClass for tests).
     * Prefer passing options.eventAppliesToClass from the app.
     */
    function defaultEventAppliesToClass(event, classData) {
        if (!event || !classData) {
            return false;
        }
        const classId = normalizeStr(classData.id);
        const excludedClassIds = Array.isArray(event.excludedClassIds) ? event.excludedClassIds : [];
        if (classId && excludedClassIds.includes(classId)) {
            return false;
        }
        const classIds = Array.isArray(event.classIds) ? event.classIds : [];
        const hasClassNames = event.classNames && event.classNames.length > 0;
        const hasClassIds = classIds.length > 0;
        const hasGrades = event.grades && event.grades.length > 0;
        const hasSections = event.sectionLevels && event.sectionLevels.length > 0;
        const hasBroadFilters = hasGrades || hasSections
            || event.allElementary === true
            || event.allMiddleSchool === true;
        if (!hasClassIds && !hasClassNames && !hasBroadFilters) {
            return true;
        }
        if (hasClassIds && classId && classIds.includes(classId)) {
            return true;
        }
        if (!hasClassIds && hasClassNames && event.classNames.includes(classData.name)) {
            return true;
        }
        if (!hasBroadFilters) {
            return false;
        }
        if (hasGrades && event.grades.includes(classData.grade)) {
            return true;
        }
        return false;
    }

    /**
     * Resolve earliest Open/Close/Reopen/Finalized dates that apply to a class.
     * @returns {{ open: string, close: string, reopen: string, finalized: string }}
     */
    function resolvePerfEvalWindow(events, classData, options) {
        const opts = options || {};
        const applies = typeof opts.eventAppliesToClass === 'function'
            ? opts.eventAppliesToClass
            : defaultEventAppliesToClass;
        const out = { open: '', close: '', reopen: '', finalized: '' };
        const list = Array.isArray(events) ? events : [];
        list.forEach((ev) => {
            if (!ev || !isPerfEvalEventType(ev.type)) {
                return;
            }
            if (!applies(ev, classData)) {
                return;
            }
            const type = normalizeStr(ev.type);
            const prefer = (type === PERF_EVAL_TYPES.CLOSE || type === PERF_EVAL_TYPES.FINALIZED)
                ? 'end'
                : 'start';
            const date = getEventAnchorDate(ev, prefer);
            if (!ISO_DATE.test(date)) {
                return;
            }
            if (type === PERF_EVAL_TYPES.OPEN) {
                out.open = out.open ? minDateStr(out.open, date) : date;
            } else if (type === PERF_EVAL_TYPES.CLOSE) {
                out.close = out.close ? minDateStr(out.close, date) : date;
            } else if (type === PERF_EVAL_TYPES.REOPEN) {
                out.reopen = out.reopen ? minDateStr(out.reopen, date) : date;
            } else if (type === PERF_EVAL_TYPES.FINALIZED) {
                out.finalized = out.finalized ? minDateStr(out.finalized, date) : date;
            }
        });
        return out;
    }

    /**
     * Essay due caps: SS capped by class/term end; teacher eval also by Close/Finalized.
     * @returns {{ maxSsDue: string, maxTeacherEvalDue: string }}
     */
    function essayDueLimits(classData, termEnd, window) {
        const classEnd = normalizeStr(classData && classData.endDate);
        const term = normalizeStr(termEnd);
        let maxSsDue = '';
        if (classEnd && term) {
            maxSsDue = minDateStr(classEnd, term);
        } else {
            maxSsDue = classEnd || term || '';
        }
        const win = window || {};
        let maxTeacherEvalDue = maxSsDue;
        if (win.close) {
            maxTeacherEvalDue = maxTeacherEvalDue
                ? minDateStr(maxTeacherEvalDue, win.close)
                : win.close;
        }
        if (win.finalized) {
            maxTeacherEvalDue = maxTeacherEvalDue
                ? minDateStr(maxTeacherEvalDue, win.finalized)
                : win.finalized;
        }
        return { maxSsDue, maxTeacherEvalDue };
    }

    function debateScoringDateAfterClose(lastLessonDate, closeDate) {
        const last = normalizeStr(lastLessonDate);
        const close = normalizeStr(closeDate);
        if (!ISO_DATE.test(last) || !ISO_DATE.test(close)) {
            return false;
        }
        return last > close;
    }

    /**
     * Count meeting dates on or before Close (caller already excluded holidays).
     */
    function slotsBeforeClose(meetingDates, closeDate) {
        const close = normalizeStr(closeDate);
        if (!ISO_DATE.test(close)) {
            return 0;
        }
        let count = 0;
        (meetingDates || []).forEach((d) => {
            const iso = normalizeStr(d);
            if (ISO_DATE.test(iso) && iso <= close) {
                count += 1;
            }
        });
        return count;
    }

    /**
     * Last lesson ISO date within an inclusive range.
     */
    function lastLessonDateInRange(lessonDates, rangeStart, rangeEnd) {
        const start = normalizeStr(rangeStart);
        const end = normalizeStr(rangeEnd);
        let last = '';
        (lessonDates || []).forEach((d) => {
            const iso = normalizeStr(d);
            if (!ISO_DATE.test(iso)) {
                return;
            }
            if (start && iso < start) {
                return;
            }
            if (end && iso > end) {
                return;
            }
            last = last ? maxDateStr(last, iso) : iso;
        });
        return last;
    }

    /**
     * Debate periods whose last placed lesson falls after Close.
     * @param {Array<{ id?: string, startDate?: string, rangeStartDate?: string, rangeEndDate?: string, book?: string }>} periods
     * @param {string[]} lessonDates
     * @param {string} closeDate
     * @returns {Array<{ periodId: string, periodStart: string, book: string, lastLessonDate: string, closeDate: string }>}
     */
    function debatePeriodsPastClose(periods, lessonDates, closeDate) {
        const close = normalizeStr(closeDate);
        if (!ISO_DATE.test(close)) {
            return [];
        }
        const issues = [];
        (periods || []).forEach((period) => {
            if (!period) {
                return;
            }
            const rangeStart = normalizeStr(period.rangeStartDate || period.startDate);
            const rangeEnd = normalizeStr(period.rangeEndDate || '');
            const last = lastLessonDateInRange(lessonDates, rangeStart, rangeEnd || undefined);
            if (debateScoringDateAfterClose(last, close)) {
                issues.push({
                    periodId: normalizeStr(period.id),
                    periodStart: rangeStart,
                    book: normalizeStr(period.book),
                    lastLessonDate: last,
                    closeDate: close
                });
            }
        });
        return issues;
    }

    /**
     * Clamp a due date to max (empty max = no clamp). Returns { date, clamped }.
     */
    function clampDueDate(dateStr, maxDue) {
        const date = normalizeStr(dateStr);
        const max = normalizeStr(maxDue);
        if (!ISO_DATE.test(date)) {
            return { date: '', clamped: false };
        }
        if (!ISO_DATE.test(max)) {
            return { date, clamped: false };
        }
        if (date > max) {
            return { date: max, clamped: true };
        }
        return { date, clamped: false };
    }

    /**
     * True when the writing lesson itself is after the SS due cap (cannot set a valid due).
     */
    function essayLessonPastSsCap(lessonDate, maxSsDue) {
        const lesson = normalizeStr(lessonDate);
        const max = normalizeStr(maxSsDue);
        if (!ISO_DATE.test(lesson) || !ISO_DATE.test(max)) {
            return false;
        }
        return lesson > max;
    }

    /**
     * True when the writing lesson is after Close (essay grading timeline missed).
     */
    function essayLessonPastClose(lessonDate, closeDate) {
        return debateScoringDateAfterClose(lessonDate, closeDate);
    }

    const api = {
        PERF_EVAL_TYPES,
        isPerfEvalEventType,
        getEventAnchorDate,
        defaultEventAppliesToClass,
        resolvePerfEvalWindow,
        essayDueLimits,
        debateScoringDateAfterClose,
        slotsBeforeClose,
        lastLessonDateInRange,
        debatePeriodsPastClose,
        clampDueDate,
        essayLessonPastSsCap,
        essayLessonPastClose,
        minDateStr,
        maxDateStr
    };

    global.CCPPerfEvalWindows = api;
})(typeof window !== 'undefined' ? window : globalThis);
