/**
 * Homework tab: previous week (grading) and this week (assignment) from syllabus rows.
 * Row N planDetail = homework assigned at class N; row N-1 planDetail = homework graded at class N.
 * Due date = next in-person class after the assignment lesson (skips holidays).
 */
(function (global) {
    function parseLocal(dateStr) {
        if (global.CCPUtils && global.CCPUtils.parseISODateLocal) {
            return global.CCPUtils.parseISODateLocal(dateStr);
        }
        if (!dateStr || typeof dateStr !== 'string') {
            return new Date(NaN);
        }
        const parts = dateStr.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function formatISO(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function compareDateStr(a, b) {
        return String(a || '').localeCompare(String(b || ''));
    }

    /** Lesson syllabus rows with a scheduled date, in chronological order. */
    function getLessonRowsFromSyllabus(rows) {
        return (rows || [])
            .filter((r) => r && r.kind === 'lesson' && r.date)
            .sort((a, b) => compareDateStr(a.date, b.date));
    }

    /**
     * Index of the lesson on or after refDateStr (upcoming class cycle).
     * If all lessons are before ref, returns last index.
     */
    function findTargetLessonIndex(lessons, refDateStr) {
        if (!lessons.length) {
            return -1;
        }
        for (let i = 0; i < lessons.length; i += 1) {
            if (compareDateStr(lessons[i].date, refDateStr) >= 0) {
                return i;
            }
        }
        return lessons.length - 1;
    }

    /**
     * Regular meeting days strictly between afterDateStr and beforeDateStr that have no class (e.g. holiday).
     * @param {object} hooks { getMeetingDays, isHolidayForClass, getHolidayForClass? }
     * @returns {Array<{ date: string, reason: string, label: string }>}
     */
    function collectSkippedRegularClassMeetings(classData, afterDateStr, beforeDateStr, hooks) {
        if (!classData || !afterDateStr || !beforeDateStr || !hooks) {
            return [];
        }
        if (compareDateStr(beforeDateStr, afterDateStr) <= 0) {
            return [];
        }
        const meetingDays = hooks.getMeetingDays(classData);
        if (!meetingDays || meetingDays.length === 0) {
            return [];
        }
        const daySet = new Set(meetingDays);
        const start = parseLocal(afterDateStr);
        const end = parseLocal(beforeDateStr);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return [];
        }
        const cur = new Date(start);
        cur.setDate(cur.getDate() + 1);
        cur.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        const skipped = [];
        while (cur < end) {
            const ds = formatISO(cur);
            if (daySet.has(cur.getDay()) && hooks.isHolidayForClass(ds, classData)) {
                let label = '';
                if (typeof hooks.getHolidayForClass === 'function') {
                    const hol = hooks.getHolidayForClass(ds, classData);
                    label = hol && hol.name ? String(hol.name).trim() : '';
                }
                skipped.push({ date: ds, reason: 'holiday', label });
            }
            cur.setDate(cur.getDate() + 1);
        }
        return skipped;
    }

    /**
     * First class meeting strictly after afterDateStr through class end, skipping holidays.
     * Uses the same occurs-on-date check as the Homework copy Today list.
     * @param {object} classData
     * @param {string} afterDateStr ISO date (assignment lesson day)
     * @param {object} hooks { getMeetingDays, isHolidayForClass, classOccursOnIsoDate? }
     */
    function getNextClassMeetingAfter(classData, afterDateStr, hooks) {
        if (!classData || !afterDateStr || !hooks) {
            return '';
        }
        const start = parseLocal(afterDateStr);
        const end = parseLocal(classData.endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return '';
        }
        const cur = new Date(start);
        cur.setDate(cur.getDate() + 1);
        cur.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        while (cur <= end) {
            const ds = formatISO(cur);
            if (classOccursOnIsoDateWithHooks(classData, ds, hooks)) {
                return ds;
            }
            cur.setDate(cur.getDate() + 1);
        }
        return '';
    }

    function classOccursOnIsoDateWithHooks(classData, isoDate, hooks) {
        if (!classData || !isoDate || !hooks) {
            return false;
        }
        if (typeof hooks.classOccursOnIsoDate === 'function') {
            return hooks.classOccursOnIsoDate(classData, isoDate);
        }
        const meetingDays = hooks.getMeetingDays(classData);
        if (!meetingDays || meetingDays.length === 0) {
            return false;
        }
        const daySet = new Set(meetingDays);
        const d = parseLocal(isoDate);
        if (Number.isNaN(d.getTime())) {
            return false;
        }
        const start = classData.startDate || '';
        const end = classData.endDate || '';
        if (start && isoDate < start) {
            return false;
        }
        if (end && isoDate > end) {
            return false;
        }
        return daySet.has(d.getDay()) && !hooks.isHolidayForClass(isoDate, classData);
    }

    /**
     * Last class meeting strictly before beforeDateStr back through class start.
     * @param {object} classData
     * @param {string} beforeDateStr ISO date
     * @param {object} hooks { getMeetingDays, isHolidayForClass, classOccursOnIsoDate? }
     */
    function getPreviousClassMeetingBefore(classData, beforeDateStr, hooks) {
        if (!classData || !beforeDateStr || !hooks) {
            return '';
        }
        const startBound = parseLocal(classData.startDate);
        const before = parseLocal(beforeDateStr);
        if (Number.isNaN(startBound.getTime()) || Number.isNaN(before.getTime())) {
            return '';
        }
        const cur = new Date(before);
        cur.setDate(cur.getDate() - 1);
        cur.setHours(0, 0, 0, 0);
        startBound.setHours(0, 0, 0, 0);
        while (cur >= startBound) {
            const ds = formatISO(cur);
            if (classOccursOnIsoDateWithHooks(classData, ds, hooks)) {
                return ds;
            }
            cur.setDate(cur.getDate() - 1);
        }
        return '';
    }

    function findFirstLessonIndexOnDate(lessons, dateStr) {
        for (let i = 0; i < lessons.length; i += 1) {
            if (compareDateStr(lessons[i].date, dateStr) === 0) {
                return i;
            }
        }
        return -1;
    }

    function findLastLessonIndexBefore(lessons, dateStr) {
        let found = -1;
        for (let i = 0; i < lessons.length; i += 1) {
            if (compareDateStr(lessons[i].date, dateStr) < 0) {
                found = i;
            }
        }
        return found;
    }

    /**
     * Date that counts as “this class” for Grade/Assign/due.
     * Meeting days use the working-from date even when no lesson row exists.
     * Off days keep upcoming / last-lesson targeting.
     */
    function resolveHomeworkThisClass(classData, lessons, ref, hooks) {
        const onDateIdx = findFirstLessonIndexOnDate(lessons, ref);
        if (onDateIdx >= 0) {
            return { thisClassDate: ref, assignIdx: onDateIdx };
        }
        if (classOccursOnIsoDateWithHooks(classData, ref, hooks)) {
            return { thisClassDate: ref, assignIdx: -1 };
        }
        const idx = findTargetLessonIndex(lessons, ref);
        if (idx < 0) {
            return { thisClassDate: '', assignIdx: -1 };
        }
        return { thisClassDate: lessons[idx].date, assignIdx: idx };
    }

    function dueDateFromNextLessonAfter(lessons, thisClassDate) {
        for (let i = 0; i < lessons.length; i += 1) {
            if (compareDateStr(lessons[i].date, thisClassDate) > 0) {
                return {
                    dueDate: lessons[i].date,
                    dueSessionNumber: lessons[i].sessionNumber || 0
                };
            }
        }
        return { dueDate: '', dueSessionNumber: 0 };
    }

    /**
     * @param {object} opts
     * @param {object} opts.classData
     * @param {Array} opts.syllabusRows merged syllabus rows
     * @param {string} opts.referenceDate ISO date (usually today)
     * @param {object} opts.hooks { getMeetingDays, isHolidayForClass, classOccursOnIsoDate? }
     */
    function computeHomeworkForClass(opts) {
        const { classData, syllabusRows, referenceDate, hooks } = opts || {};
        const ref = referenceDate || formatISO(new Date());
        const lessons = getLessonRowsFromSyllabus(syllabusRows);

        if (!lessons.length) {
            return {
                referenceDate: ref,
                targetLessonIndex: -1,
                targetSessionNumber: 0,
                targetLessonDate: '',
                targetLessonTitle: '',
                gradingHomework: '',
                gradingSourceRowId: '',
                gradingSessionNumber: 0,
                gradingLessonTitle: '',
                gradingLessonDate: '',
                assignHomework: '',
                assignSourceRowId: '',
                assignSourceSessionNumber: 0,
                assignSourceTitle: '',
                dueDate: '',
                dueSessionNumber: 0,
                skippedClassDates: [],
                hasSyllabusLessons: false,
                messageKey: 'homeworkTabNoLessons'
            };
        }

        const resolved = resolveHomeworkThisClass(classData, lessons, ref, hooks);
        const thisClassDate = resolved.thisClassDate;
        const assignIdx = resolved.assignIdx;
        const assignRow = assignIdx >= 0 ? lessons[assignIdx] : null;
        const gradingIdx = thisClassDate ? findLastLessonIndexBefore(lessons, thisClassDate) : -1;
        const gradingRow = gradingIdx >= 0 ? lessons[gradingIdx] : null;

        let dueDate = '';
        let dueSessionNumber = 0;
        if (thisClassDate && hooks) {
            dueDate = getNextClassMeetingAfter(classData, thisClassDate, hooks);
        } else if (thisClassDate) {
            const fromRows = dueDateFromNextLessonAfter(lessons, thisClassDate);
            dueDate = fromRows.dueDate;
            dueSessionNumber = fromRows.dueSessionNumber;
        }
        if (dueDate && thisClassDate && compareDateStr(dueDate, thisClassDate) <= 0) {
            dueDate = '';
            dueSessionNumber = 0;
        }
        if (dueDate) {
            const dueLessonIdx = findFirstLessonIndexOnDate(lessons, dueDate);
            if (dueLessonIdx >= 0) {
                dueSessionNumber = lessons[dueLessonIdx].sessionNumber || 0;
            }
        }

        const detailFrom = (row) => (row && row.planDetail ? String(row.planDetail).trim() : '');

        // Grade homework from the previous session (empty on first lesson of term).
        const gradingSourceRowId = gradingRow ? (gradingRow.id || '') : '';
        const gradingText = detailFrom(gradingRow);

        // Assign homework from this class’s lesson row (empty on extra/unscheduled meetings).
        const assignSourceRowId = assignRow ? (assignRow.id || '') : '';
        const assignText = detailFrom(assignRow);

        let messageKey = '';
        if (!assignText && !gradingText) {
            messageKey = 'homeworkTabNoHomeworkText';
        } else if (!assignText) {
            messageKey = 'homeworkTabNoAssignText';
        } else if (!gradingText) {
            messageKey = 'homeworkTabNoGradingText';
        }
        if (!dueDate && assignText) {
            messageKey = messageKey || 'homeworkTabNoDueDate';
        }

        const skippedClassDates = dueDate && thisClassDate && hooks
            ? collectSkippedRegularClassMeetings(classData, thisClassDate, dueDate, hooks)
            : [];

        return {
            referenceDate: ref,
            targetLessonIndex: assignIdx >= 0 ? assignIdx : gradingIdx,
            targetSessionNumber: assignRow ? (assignRow.sessionNumber || 0) : 0,
            targetLessonDate: assignRow ? assignRow.date : thisClassDate,
            targetLessonTitle: assignRow ? (assignRow.planTitle || '') : '',
            gradingHomework: gradingText,
            gradingSourceRowId,
            gradingSessionNumber: gradingRow ? (gradingRow.sessionNumber || 0) : 0,
            gradingLessonTitle: gradingRow ? (gradingRow.planTitle || '') : '',
            gradingLessonDate: gradingRow ? (gradingRow.date || '') : '',
            assignHomework: assignText,
            assignSourceRowId,
            assignSourceSessionNumber: assignRow ? (assignRow.sessionNumber || 0) : 0,
            assignSourceTitle: assignRow ? (assignRow.planTitle || '') : '',
            dueDate,
            dueSessionNumber,
            skippedClassDates,
            hasSyllabusLessons: true,
            messageKey
        };
    }

    function formatDueDateLabel(isoDate, formatDisplay) {
        if (!isoDate) {
            return '';
        }
        if (typeof formatDisplay === 'function') {
            return formatDisplay(isoDate);
        }
        return isoDate;
    }

    /**
     * Optional header lines for paste into external systems.
     */
    function formatHomeworkBlock(text, options) {
        const lines = [];
        const o = options || {};
        if (o.includeHeader && o.className) {
            lines.push(o.className);
        }
        if (o.includeHeader && o.sessionLabel && o.sessionNumber > 0) {
            lines.push(`${o.sessionLabel} ${o.sessionNumber}`);
        }
        if (lines.length) {
            lines.push('');
        }
        lines.push((text || '').trim());
        return lines.join('\n').trim();
    }

    global.CCPHomeworkTab = {
        parseLocal,
        formatISO,
        compareDateStr,
        getLessonRowsFromSyllabus,
        findTargetLessonIndex,
        getNextClassMeetingAfter,
        getPreviousClassMeetingBefore,
        classOccursOnIsoDateWithHooks,
        collectSkippedRegularClassMeetings,
        computeHomeworkForClass,
        formatDueDateLabel,
        formatHomeworkBlock
    };
})(typeof window !== 'undefined' ? window : globalThis);
