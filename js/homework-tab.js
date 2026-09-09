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

    function isValidHomeworkDueIso(value) {
        const s = String(value || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            return false;
        }
        const d = parseLocal(s);
        return !Number.isNaN(d.getTime());
    }

    function curriculumLessonNumberOfRow(row) {
        if (!row) {
            return 0;
        }
        if (row.lessonNumber != null && Number(row.lessonNumber) > 0) {
            return Number(row.lessonNumber);
        }
        if (row.sessionNumber != null && Number(row.sessionNumber) > 0) {
            return Number(row.sessionNumber);
        }
        return 0;
    }

    function compressedGroupEndOfRow(row) {
        if (!row) {
            return 0;
        }
        if (row.debateGroupEnd != null && Number(row.debateGroupEnd) > 0) {
            return Number(row.debateGroupEnd);
        }
        if (row.compressedGroupEnd != null && Number(row.compressedGroupEnd) > 0) {
            return Number(row.compressedGroupEnd);
        }
        return 0;
    }

    function isCompressedSyllabusLessonRow(row) {
        if (!row || row.kind !== 'lesson') {
            return false;
        }
        if (row.scheduleCompressed === true || row.debateCompressed === true) {
            return true;
        }
        const start = row.compressedGroupStart != null
            ? Number(row.compressedGroupStart)
            : (row.debateGroupStart != null ? Number(row.debateGroupStart) : 0);
        const end = compressedGroupEndOfRow(row);
        return start > 0 && end > start;
    }

    /**
     * Next syllabus lesson date after a compressed assign: curriculum day after group end
     * (skips weekday gaps and stale lessons still inside the compressed range).
     */
    function dueDateAfterCompressedAssign(lessons, assignRow) {
        if (!assignRow || !isCompressedSyllabusLessonRow(assignRow)) {
            return '';
        }
        const groupEnd = compressedGroupEndOfRow(assignRow);
        const assignDate = String(assignRow.date || '').trim();
        if (!groupEnd || !assignDate) {
            return '';
        }
        for (let i = 0; i < lessons.length; i += 1) {
            const lesson = lessons[i];
            if (!lesson || !lesson.date) {
                continue;
            }
            if (compareDateStr(lesson.date, assignDate) <= 0) {
                continue;
            }
            const curr = curriculumLessonNumberOfRow(lesson);
            if (curr > 0 && curr <= groupEnd) {
                continue;
            }
            return lesson.date;
        }
        return '';
    }

    /**
     * Effective homework due for a lesson: optional syllabus override, else next class meeting.
     * Compressed assign rows prefer the next syllabus lesson past compressedGroupEnd.
     * @param {object} classData
     * @param {object|string} lessonDateOrRow syllabus lesson row (preferred) or ISO lesson date
     * @param {object} [hooks]
     * @param {Array} [syllabusRows] used when hooks are missing (next syllabus lesson fallback)
     * @returns {{ dueDate: string, dueDateAutomatic: string, dueDateOverridden: boolean }}
     */
    function resolveHomeworkDueDate(classData, lessonDateOrRow, hooks, syllabusRows) {
        const row = lessonDateOrRow && typeof lessonDateOrRow === 'object' ? lessonDateOrRow : null;
        const lessonDate = row
            ? String(row.date || '').trim()
            : String(lessonDateOrRow || '').trim();
        const overrideRaw = row ? String(row.homeworkDueDate || '').trim() : '';
        const override = isValidHomeworkDueIso(overrideRaw) ? overrideRaw : '';

        const rows = Array.isArray(syllabusRows)
            ? syllabusRows
            : (classData && Array.isArray(classData.syllabusRows) ? classData.syllabusRows : []);
        const lessons = getLessonRowsFromSyllabus(rows);

        let dueDateAutomatic = '';
        if (row && isCompressedSyllabusLessonRow(row)) {
            dueDateAutomatic = dueDateAfterCompressedAssign(lessons, row) || '';
        }
        if (!dueDateAutomatic && lessonDate && hooks) {
            dueDateAutomatic = getNextClassMeetingAfter(classData, lessonDate, hooks) || '';
        } else if (!dueDateAutomatic && lessonDate) {
            dueDateAutomatic = dueDateFromNextLessonAfter(lessons, lessonDate).dueDate || '';
        }
        if (dueDateAutomatic && lessonDate && compareDateStr(dueDateAutomatic, lessonDate) <= 0) {
            dueDateAutomatic = '';
        }

        const dueDateOverridden = Boolean(override);
        return {
            dueDate: dueDateOverridden ? override : dueDateAutomatic,
            dueDateAutomatic,
            dueDateOverridden
        };
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
                dueDateAutomatic: '',
                dueDateOverridden: false,
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

        // Due is tied to the assign lesson when present; otherwise to this class date (extra meeting).
        const dueBasisRow = assignRow || (thisClassDate ? { date: thisClassDate } : null);
        const dueResolved = dueBasisRow
            ? resolveHomeworkDueDate(classData, dueBasisRow, hooks, syllabusRows)
            : { dueDate: '', dueDateAutomatic: '', dueDateOverridden: false };
        let dueDate = dueResolved.dueDate || '';
        const dueDateAutomatic = dueResolved.dueDateAutomatic || '';
        const dueDateOverridden = dueResolved.dueDateOverridden === true;
        let dueSessionNumber = 0;
        if (dueDate) {
            const dueLessonIdx = findFirstLessonIndexOnDate(lessons, dueDate);
            if (dueLessonIdx >= 0) {
                dueSessionNumber = lessons[dueLessonIdx].sessionNumber || 0;
            } else if (!hooks && thisClassDate) {
                const fromRows = dueDateFromNextLessonAfter(lessons, thisClassDate);
                if (fromRows.dueDate === dueDate) {
                    dueSessionNumber = fromRows.dueSessionNumber;
                }
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
            dueDateAutomatic,
            dueDateOverridden,
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

    const DEBATE_TEAMS_BLOCK_START = '--- Debate teams ---';
    const DEBATE_TEAMS_BLOCK_END = '--- End debate teams ---';

    function normalizeTitleForDay3(s) {
        return String(s || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    /** True when title/detail marks Day 3, Alt Day 3, or Day 2 & 3 Combined. */
    function textIncludesDebateDay3(text) {
        const title = normalizeTitleForDay3(text);
        if (!title) {
            return false;
        }
        if (/alt\s*day\s*3/.test(title)) {
            return true;
        }
        if (/day\s*2\s*(?:&|and)\s*3/.test(title)) {
            return true;
        }
        if (/combined/.test(title) && /day\s*[23]/.test(title)) {
            return true;
        }
        if (/day\s*2/.test(title) && /day\s*3/.test(title)) {
            return true;
        }
        return /\bday\s*3\b/.test(title);
    }

    function isDebateHomeworkClass(classData) {
        if (!classData) {
            return false;
        }
        return String(classData.scheduleModel || '').trim() === 'debateMonthly';
    }

    /**
     * True when Copy assign should run Day 3 team automation for this class + packet.
     */
    function assignHomeworkIncludesDebateDay3(classData, packet) {
        if (!isDebateHomeworkClass(classData) || !packet) {
            return false;
        }
        if (textIncludesDebateDay3(packet.assignSourceTitle)) {
            return true;
        }
        if (textIncludesDebateDay3(packet.targetLessonTitle)) {
            return true;
        }
        if (textIncludesDebateDay3(packet.assignHomework)) {
            return true;
        }
        const sessionNum = Number(packet.assignSourceSessionNumber || packet.targetSessionNumber || 0);
        if (sessionNum === 3) {
            const titleBlob = `${packet.assignSourceTitle || ''} ${packet.targetLessonTitle || ''}`;
            // After Day 2+3 merge, Day 4 must not be treated as Day 3 via a stale session counter.
            if (!/\bday\s*4\b/i.test(titleBlob) && !/preview/i.test(titleBlob)) {
                return true;
            }
        }
        return false;
    }

    function stripDebateTeamsBlock(text) {
        const raw = String(text || '');
        const start = raw.indexOf(DEBATE_TEAMS_BLOCK_START);
        if (start < 0) {
            return raw;
        }
        const end = raw.indexOf(DEBATE_TEAMS_BLOCK_END, start);
        if (end < 0) {
            return (raw.slice(0, start) + raw.slice(start + DEBATE_TEAMS_BLOCK_START.length)).trimEnd();
        }
        const after = end + DEBATE_TEAMS_BLOCK_END.length;
        return (raw.slice(0, start) + raw.slice(after)).replace(/\n{3,}/g, '\n\n').trimEnd();
    }

    /** Append (or replace) the auto-inserted speaking-order block. */
    function injectDebateTeamsIntoAssignText(text, teamsBlock) {
        const cleaned = stripDebateTeamsBlock(text).trimEnd();
        const block = String(teamsBlock || '').trim();
        if (!block) {
            return cleaned;
        }
        const wrapped = `${DEBATE_TEAMS_BLOCK_START}\n${block}\n${DEBATE_TEAMS_BLOCK_END}`;
        return cleaned ? `${cleaned}\n\n${wrapped}` : wrapped;
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
        isValidHomeworkDueIso,
        resolveHomeworkDueDate,
        dueDateAfterCompressedAssign,
        isCompressedSyllabusLessonRow,
        computeHomeworkForClass,
        formatDueDateLabel,
        formatHomeworkBlock,
        DEBATE_TEAMS_BLOCK_START,
        DEBATE_TEAMS_BLOCK_END,
        textIncludesDebateDay3,
        isDebateHomeworkClass,
        assignHomeworkIncludesDebateDay3,
        stripDebateTeamsBlock,
        injectDebateTeamsIntoAssignText
    };
})(typeof window !== 'undefined' ? window : globalThis);
