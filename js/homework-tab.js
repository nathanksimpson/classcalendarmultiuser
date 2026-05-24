/**
 * Homework tab: previous week (grading) and this week (assignment) from syllabus rows.
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
     * @param {object} classData
     * @param {string} afterDateStr ISO date (assignment lesson day)
     * @param {object} hooks { getMeetingDays, isHolidayForClass }
     */
    function getNextClassMeetingAfter(classData, afterDateStr, hooks) {
        if (!classData || !afterDateStr || !hooks) {
            return '';
        }
        const meetingDays = hooks.getMeetingDays(classData);
        if (!meetingDays || meetingDays.length === 0) {
            return '';
        }
        const daySet = new Set(meetingDays);
        const start = parseLocal(afterDateStr);
        const end = parseLocal(classData.endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return '';
        }
        const cur = new Date(start);
        cur.setDate(cur.getDate() + 1);
        cur.setHours(0, 0, 0, 0);
        while (cur <= end) {
            const ds = formatISO(cur);
            if (daySet.has(cur.getDay()) && !hooks.isHolidayForClass(ds, classData)) {
                return ds;
            }
            cur.setDate(cur.getDate() + 1);
        }
        return '';
    }

    /**
     * @param {object} opts
     * @param {object} opts.classData
     * @param {Array} opts.syllabusRows merged syllabus rows
     * @param {string} opts.referenceDate ISO date (usually today)
     * @param {object} opts.hooks { getMeetingDays, isHolidayForClass }
     */
    function computeHomeworkForClass(opts) {
        const { classData, syllabusRows, referenceDate, hooks } = opts || {};
        const ref = referenceDate || formatISO(new Date());
        const lessons = getLessonRowsFromSyllabus(syllabusRows);
        const idx = findTargetLessonIndex(lessons, ref);

        if (idx < 0) {
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

        const assignRow = lessons[idx];
        const gradingRow = idx > 0 ? lessons[idx - 1] : null;
        const nextLessonRow = idx + 1 < lessons.length ? lessons[idx + 1] : null;

        let dueDate = '';
        let dueSessionNumber = 0;
        if (nextLessonRow) {
            dueDate = nextLessonRow.date;
            dueSessionNumber = nextLessonRow.sessionNumber || 0;
        } else if (hooks) {
            dueDate = getNextClassMeetingAfter(classData, assignRow.date, hooks);
        }

        const detailFrom = (row) => (row && row.planDetail ? String(row.planDetail).trim() : '');

        // Grade homework due at this class (usually on this session's syllabus row).
        let gradingSourceRowId = assignRow.id || '';
        let gradingText = detailFrom(assignRow);
        if (!gradingText && gradingRow) {
            gradingText = detailFrom(gradingRow);
            gradingSourceRowId = gradingRow.id || gradingSourceRowId;
        }

        // Assign homework due at the following class (usually on the next session row).
        let assignSourceRowId = nextLessonRow ? (nextLessonRow.id || '') : (assignRow.id || '');
        let assignText = detailFrom(nextLessonRow);
        if (!assignText) {
            assignText = detailFrom(assignRow);
            if (!nextLessonRow) {
                assignSourceRowId = assignRow.id || '';
            }
        }

        let messageKey = '';
        if (!assignText && !gradingText) {
            messageKey = 'homeworkTabNoHomeworkText';
        } else if (!assignText) {
            messageKey = 'homeworkTabNoAssignText';
        } else if (!gradingText && idx > 0) {
            messageKey = 'homeworkTabNoGradingText';
        }
        if (!dueDate && assignText) {
            messageKey = messageKey || 'homeworkTabNoDueDate';
        }

        const skippedClassDates = dueDate && assignRow.date && hooks
            ? collectSkippedRegularClassMeetings(classData, assignRow.date, dueDate, hooks)
            : [];

        return {
            referenceDate: ref,
            targetLessonIndex: idx,
            targetSessionNumber: assignRow.sessionNumber || 0,
            targetLessonDate: assignRow.date,
            targetLessonTitle: assignRow.planTitle || '',
            gradingHomework: gradingText,
            gradingSourceRowId,
            gradingSessionNumber: assignRow.sessionNumber || 0,
            gradingLessonTitle: assignRow.planTitle || '',
            gradingLessonDate: assignRow.date || '',
            assignHomework: assignText,
            assignSourceRowId,
            assignSourceSessionNumber: nextLessonRow
                ? (nextLessonRow.sessionNumber || 0)
                : (assignRow.sessionNumber || 0),
            assignSourceTitle: nextLessonRow
                ? (nextLessonRow.planTitle || '')
                : (assignRow.planTitle || ''),
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
        if (o.includeHeader && o.dueDateLabel) {
            lines.push(o.dueLabel ? `${o.dueLabel}: ${o.dueDateLabel}` : o.dueDateLabel);
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
        collectSkippedRegularClassMeetings,
        computeHomeworkForClass,
        formatDueDateLabel,
        formatHomeworkBlock
    };
})(typeof window !== 'undefined' ? window : globalThis);
