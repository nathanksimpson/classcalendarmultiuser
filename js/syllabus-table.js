/**
 * Syllabus table rows, merge, and HTML render (window.CCPSyllabus).
 * School week = Monday–Friday containing the lesson date.
 */
(function (global) {
    const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTH_FULL = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const MONTH_KO = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

    /** A4 page margins and printable content area (mm). Tighter = wider table, less line wrap. */
    const SYLLABUS_A4_MARGIN_MM = 7;
    /** Reserved inside content height so bottom border/last rows are not clipped. */
    const SYLLABUS_A4_FIT_SAFETY_MM = 8;
    /** Reserve space for table outer border + rounding when stretching rows. */
    const SYLLABUS_TABLE_FIT_FUDGE_PX = 10;
    /** Absolute minimum typography scale when content must shrink to avoid bottom clip. */
    const SYLLABUS_PRINT_SCALE_FLOOR = 0.78;
    const SYLLABUS_A4_PAGE = {
        pageW: 210,
        pageH: 297,
        margin: SYLLABUS_A4_MARGIN_MM,
        fitSafety: SYLLABUS_A4_FIT_SAFETY_MM,
        get contentW() {
            return this.pageW - this.margin * 2;
        },
        get contentH() {
            return this.pageH - this.margin * 2;
        },
        get fitContentH() {
            return this.contentH - this.fitSafety;
        }
    };

    function getSyllabusFitDimensions(a4, mmPx) {
        const safety = a4.fitSafety != null ? a4.fitSafety : SYLLABUS_A4_FIT_SAFETY_MM;
        return {
            contentWpx: Math.round(a4.contentW * mmPx),
            contentHpx: Math.round((a4.contentH - safety) * mmPx)
        };
    }

    /** Reference layout for printed syllabus (readable type, truncation over tiny fonts). */
    const SYLLABUS_A4_COL_WIDTHS = ['3.5%', '5.5%', '2.5em', '68%', '17%'];
    /** 진도표-style A4 columns: month | week | date | plan | note */
    /** Col 1 wide enough for header year (e.g. 2026년) and merged month (3월). */
    const SYLLABUS_JINDO_COL_WIDTHS = ['6.5%', '5.5%', '3.5em', '68%', '14%'];
    const MIN_SYLLABUS_PRINT_SCALE = 0.92;
    const SYLLABUS_A4_REFERENCE = {
        titlePt: 12,
        tablePt: 10,
        thPt: 9,
        sublinePt: 9,
        titleMarginMm: 2,
        cellPadY: 3,
        cellPadX: 4,
        lineHeight: 1.2
    };

    const COVERED_HEADING_RE = /^covered\s+in\s+class\s*:?\s*$/i;
    const HOMEWORK_HEADING_RE = /^homework\s*:?\s*$/i;
    /** Lesson rows per continuation print sheet (conservative for long homework). */
    const SYLLABUS_CONTINUATION_ITEMS_PER_PAGE = 14;
    const SYLLABUS_PRINT_PLAN_LINE_CLAMP = 2;

    function formatSyllabusShortDate(d) {
        if (!d || Number.isNaN(d.getTime())) {
            return '';
        }
        return `(${d.getMonth() + 1}/${d.getDate()})`;
    }

    /** 진도표 date column: 3/4 (no parentheses). */
    function formatJindoDateMd(dateStr) {
        const d = parseLocal(dateStr);
        if (Number.isNaN(d.getTime())) {
            return '';
        }
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    function formatJindoMonthFromKey(monthKey, useKorean) {
        if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
            return '';
        }
        const m = parseInt(monthKey.slice(5, 7), 10);
        if (useKorean) {
            return MONTH_KO[m - 1] || monthKey;
        }
        return formatSyllabusMonthFromKey(monthKey, false);
    }

    function isJindoPdfLayout(labels) {
        const L = labels || {};
        if (L.jindoTable === false) {
            return false;
        }
        return L.jindoTable === true || (L.pdfLayout === true && L.a4Pdf === true);
    }

    function shouldIncludeDetailAppendix(labels) {
        const L = labels || {};
        if (L.includeDetailAppendix === true || L.syllabusPrintContinuation === 'always') {
            return true;
        }
        if (L.syllabusPrintContinuation === 'never' || L.includeDetailAppendix === false) {
            return false;
        }
        return L.syllabusPrintContinuation === 'auto' && L.includeDetailAppendix === true;
    }

    /**
     * Week-of-month labels for 진도표 print (1주, 2주 … resets each calendar month).
     */
    function computeJindoWeekDisplays(rows, useKoreanWeek) {
        const n = rows.length;
        const weekDisplays = new Array(n).fill('');
        let monthKey = '';
        let weekIndex = 0;
        let lastWeekMon = '';

        for (let i = 0; i < n; i += 1) {
            const row = rows[i];
            const mk = row.monthKey || (row.date ? row.date.slice(0, 7) : '');
            if (mk && mk !== monthKey) {
                monthKey = mk;
                weekIndex = 0;
                lastWeekMon = '';
            }
            const mon = row.date ? getSchoolWeekMonday(row.date) : null;
            const weekKey = mon ? formatISO(mon) : '';
            if (weekKey && weekKey !== lastWeekMon) {
                weekIndex += 1;
                lastWeekMon = weekKey;
            }
            if (weekIndex > 0) {
                weekDisplays[i] = useKoreanWeek ? `${weekIndex}주` : `W${weekIndex}`;
            }
        }
        return weekDisplays;
    }

    function computeJindoCellMerges(rows, labels) {
        const L = labels || {};
        const useKo = L.useKoreanJindo === true;
        const n = rows.length;
        const monthDisplays = [];
        const weekDisplays = computeJindoWeekDisplays(rows, useKo);
        const monthRowspan = new Array(n).fill(0);
        const weekRowspan = new Array(n).fill(0);
        let carryMonth = '';

        for (let i = 0; i < n; i += 1) {
            const row = rows[i];
            let month = '';
            if (row.monthKey) {
                month = formatJindoMonthFromKey(row.monthKey, useKo);
            } else if (row.date) {
                month = formatJindoMonthFromKey(row.date.slice(0, 7), useKo);
            }
            if (month) {
                carryMonth = month;
            }
            monthDisplays.push(carryMonth);
        }

        let i = 0;
        while (i < n) {
            const key = monthDisplays[i];
            let j = i + 1;
            while (j < n && monthDisplays[j] === key && key) {
                j += 1;
            }
            if (key) {
                monthRowspan[i] = j - i;
            }
            i = j;
        }

        i = 0;
        while (i < n) {
            const key = weekDisplays[i];
            let j = i + 1;
            while (j < n && weekDisplays[j] === key && key) {
                j += 1;
            }
            if (key) {
                weekRowspan[i] = j - i;
            }
            i = j;
        }

        return { monthDisplays, weekDisplays, monthRowspan, weekRowspan };
    }

    function findFirstJindoNotesRowIndex(rows) {
        for (let i = 0; i < rows.length; i += 1) {
            const r = rows[i];
            const kind = r.kind || 'lesson';
            if ((kind === 'lesson' || kind === 'overflow') && r.date && (r.sessionNumber || 0) > 0) {
                return i;
            }
        }
        for (let i = 0; i < rows.length; i += 1) {
            if (rows[i].date && String(rows[i].planTitle || '').trim()) {
                return i;
            }
        }
        return 0;
    }

    function resolvePrintGeneralNotes(classData, labels) {
        const fromClass = classData && String(classData.syllabusGeneralNotes || '').trim();
        if (fromClass) {
            return fromClass;
        }
        if (global.CCPBooksEditor && typeof global.CCPBooksEditor.resolveSyllabusGeneralNotesForClass === 'function') {
            return global.CCPBooksEditor.resolveSyllabusGeneralNotesForClass(classData) || '';
        }
        return labels && labels.generalNotes ? String(labels.generalNotes).trim() : '';
    }

    /** Single 비고 block — general notes only (no per-row Note: labels). */
    function buildPrintNotesColumnHtml(generalNotes) {
        const general = String(generalNotes ?? '').trim();
        if (!general) {
            return '';
        }
        return escapeHtml(general).replace(/\n/g, '<br>');
    }

    function formatSyllabusMonthFromKey(monthKey, useFullMonth) {
        if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
            return '';
        }
        const m = parseInt(monthKey.slice(5, 7), 10);
        const names = useFullMonth ? MONTH_FULL : MONTH_SHORT;
        return names[m - 1] || monthKey;
    }

    function formatSyllabusMonthFromDate(dateStr, useFullMonth) {
        const d = parseLocal(dateStr);
        if (Number.isNaN(d.getTime())) {
            return '';
        }
        const names = useFullMonth ? MONTH_FULL : MONTH_SHORT;
        return names[d.getMonth()];
    }

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

    function escapeHtml(s) {
        if (global.CCPUtils && global.CCPUtils.escapeHtml) {
            return global.CCPUtils.escapeHtml(s);
        }
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** Monday of the Mon–Fri school week containing dateStr. */
    function getSchoolWeekMonday(dateStr) {
        const d = parseLocal(dateStr);
        if (Number.isNaN(d.getTime())) {
            return null;
        }
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        const mon = new Date(d);
        mon.setDate(d.getDate() + diff);
        mon.setHours(0, 0, 0, 0);
        return mon;
    }

    function getSchoolWeekFriday(monday) {
        const fri = new Date(monday);
        fri.setDate(monday.getDate() + 4);
        return fri;
    }

    function formatMonthShortFromKey(monthKey) {
        if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
            return '';
        }
        const m = parseInt(monthKey.slice(5, 7), 10);
        return MONTH_SHORT[m - 1] || monthKey;
    }

    function formatMonthShortFromDate(dateStr) {
        const d = parseLocal(dateStr);
        if (Number.isNaN(d.getTime())) {
            return '';
        }
        return MONTH_SHORT[d.getMonth()];
    }

    /**
     * e.g. "Mar 2–6" for the Mon–Fri week containing dateStr.
     */
    function getSchoolWeekLabel(dateStr, useFullMonth) {
        const mon = getSchoolWeekMonday(dateStr);
        if (!mon) {
            return '';
        }
        const fri = getSchoolWeekFriday(mon);
        const names = useFullMonth ? MONTH_FULL : MONTH_SHORT;
        const m0 = names[mon.getMonth()];
        const m1 = names[fri.getMonth()];
        if (mon.getMonth() === fri.getMonth()) {
            return `${m0} ${mon.getDate()}–${fri.getDate()}`;
        }
        return `${m0} ${mon.getDate()}–${m1} ${fri.getDate()}`;
    }

    /** Compact week for print, e.g. "3/2-6" — fits narrow column, fewer wrapped lines. */
    function getSchoolWeekLabelCompact(dateStr) {
        const mon = getSchoolWeekMonday(dateStr);
        if (!mon) {
            return '';
        }
        const fri = getSchoolWeekFriday(mon);
        const m0 = mon.getMonth() + 1;
        const m1 = fri.getMonth() + 1;
        if (mon.getMonth() === fri.getMonth()) {
            return `${m0}/${mon.getDate()}-${fri.getDate()}`;
        }
        return `${m0}/${mon.getDate()}-${m1}/${fri.getDate()}`;
    }

    /** 1-based curriculum index for preset pages / unit pairs (skips holidays). */
    function getCurriculumLessonNumber(row) {
        if (!row) {
            return 0;
        }
        if (row.lessonNumber != null && row.lessonNumber > 0) {
            return row.lessonNumber;
        }
        if (row.kind === 'lesson' || row.kind === 'overflow') {
            return row.sessionNumber || 0;
        }
        return 0;
    }

    function rowKey(row) {
        if (row.kind === 'note') {
            return `note:${row.id || row.planTitle || ''}`;
        }
        if (row.kind === 'overflow') {
            return `overflow:${getCurriculumLessonNumber(row)}`;
        }
        if (row.kind === 'lesson') {
            return `lesson:${row.date || ''}:${getCurriculumLessonNumber(row)}`;
        }
        return `${row.kind}:${row.date || ''}`;
    }

    function newRowId() {
        return `sr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function planDetailFromUnits(sessionNumber, syllabusUnits, planTitle) {
        if (!Array.isArray(syllabusUnits) || syllabusUnits.length === 0 || !sessionNumber) {
            return '';
        }
        const unitIndex = Math.ceil(sessionNumber / 2);
        const unit = syllabusUnits[unitIndex - 1];
        if (!unit) {
            return '';
        }
        const isSpeaking = sessionNumber % 2 === 1;
        if (isSpeaking && unit.speakingPages) {
            return unit.speakingPages;
        }
        if (!isSpeaking && unit.writingPages) {
            return unit.writingPages;
        }
        return '';
    }

    /** Combined pages for compressed merges (e.g. WR + SP on one row). */
    function planDetailFromUnitRange(start, end, syllabusUnits) {
        if (!start || start < 1) {
            return '';
        }
        const endNum = end != null && end >= start ? end : start;
        const parts = [];
        for (let n = start; n <= endNum; n += 1) {
            const detail = planDetailFromUnits(n, syllabusUnits, '');
            if (detail && String(detail).trim()) {
                parts.push(String(detail).trim());
            }
        }
        return parts.join('\n');
    }

    function lessonDateToISO(lesson, formatDateISO) {
        if (!lesson || lesson.date == null || lesson.date === '') {
            return '';
        }
        const fmt = typeof formatDateISO === 'function' ? formatDateISO : formatISO;
        if (lesson.date instanceof Date) {
            return fmt(lesson.date);
        }
        const s = String(lesson.date).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            return s.slice(0, 10);
        }
        const d = parseLocal(s);
        if (!Number.isNaN(d.getTime())) {
            return fmt(d);
        }
        return '';
    }

    /**
     * Place each scheduled lesson on its calendar date (not by slot index).
     * @param {Array} lessons from calculateLessonDates
     * @param {Array<Date|string>} meetingDates chronological meeting days in term
     * @param {object} options
     * @param {function(string): boolean} options.isHoliday
     * @param {function(Date): string} [options.formatDateISO]
     * @returns {Array<{ date: string, monthKey: string, kind: string, label?: string, lesson?: object }>}
     */
    function buildTimelineSlotsFromLessons(lessons, meetingDates, options) {
        options = options || {};
        const fmt = typeof options.formatDateISO === 'function' ? options.formatDateISO : formatISO;
        const isHolidayFn = options.isHoliday;
        const lessonsByDate = new Map();
        (lessons || []).forEach((lesson) => {
            const dateStr = lessonDateToISO(lesson, fmt);
            if (dateStr) {
                lessonsByDate.set(dateStr, lesson);
            }
        });
        const usedDates = new Set();
        const slots = [];

        (meetingDates || []).forEach((d) => {
            const dateStr = d instanceof Date ? fmt(d) : String(d).slice(0, 10);
            const monthKey = dateStr.slice(0, 7);
            const isHol = typeof isHolidayFn === 'function' && isHolidayFn(dateStr);
            if (isHol) {
                slots.push({ date: dateStr, monthKey, kind: 'holiday' });
            } else if (lessonsByDate.has(dateStr)) {
                const lesson = lessonsByDate.get(dateStr);
                usedDates.add(dateStr);
                slots.push({
                    date: dateStr,
                    monthKey: lesson.monthKey || monthKey,
                    kind: 'lesson',
                    label: lesson.label,
                    lesson
                });
            } else {
                slots.push({ date: dateStr, monthKey, kind: 'extra' });
            }
        });

        const orphans = [];
        lessonsByDate.forEach((lesson, dateStr) => {
            if (!usedDates.has(dateStr)) {
                orphans.push({ lesson, dateStr });
            }
        });
        orphans.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
        orphans.forEach(({ lesson, dateStr }) => {
            slots.push({
                date: dateStr,
                monthKey: lesson.monthKey || dateStr.slice(0, 7),
                kind: 'lesson',
                label: lesson.label,
                lesson
            });
        });

        slots.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
        return slots;
    }

    /**
     * @param {object} classData
     * @param {Array} lessons from calculateLessonDates
     * @param {object} hooks
     * @param {function(string, object): boolean} hooks.isHolidayForClass
     * @param {function(string, object): object|null} hooks.getHolidayForClass
     * @param {function(string, object): object|null} hooks.getInlineEventForClass
     */
    function applyRowColors(row, colors) {
        if (!colors) {
            return row;
        }
        return {
            ...row,
            rowBg: colors.bg || '',
            rowColor: colors.text || '',
            eventType: colors.type || ''
        };
    }

    function buildSyllabusRowsFromSchedule(classData, lessons, hooks) {
        const rows = [];
        const dated = [];
        const tail = [];
        (lessons || []).forEach(item => {
            if (item.__syllabusOverflowIntro || item.__syllabusUnscheduled || item.__syllabusSkipped) {
                tail.push(item);
            } else {
                dated.push(item);
            }
        });
        const sorted = dated.sort((a, b) => {
            const da = a.date instanceof Date ? a.date : parseLocal(a.date);
            const db = b.date instanceof Date ? b.date : parseLocal(b.date);
            return da - db;
        });
        let lessonNumber = 0;
        const units = classData.syllabusUnits || [];
        const rowTemplates = hooks && Array.isArray(hooks.rowTemplates) ? hooks.rowTemplates : [];
        const templateIndexes = rowTemplates.length && hooks.templateIndexes
            ? hooks.templateIndexes
            : (rowTemplates.length && global.CCPSyllabusTemplates
                ? global.CCPSyllabusTemplates.buildTemplateIndexes(rowTemplates)
                : null);
        const resolveRowTemplate = rowTemplates.length && global.CCPSyllabusTemplates
            ? (row) => global.CCPSyllabusTemplates.resolveRowTemplate(templateIndexes, row)
            : null;
        const useFullMonth = hooks && hooks.useFullMonthNames === true;
        const holidayDetail = (hooks && hooks.slotHolidayDetail) || 'No regular lesson — holiday / no class';
        const eventDetail = (hooks && hooks.slotEventDetail) || 'Special session — not a regular lesson';
        const extraTitle = (hooks && hooks.extraPeriodTitle) || 'Open class period';
        const extraDetail = (hooks && hooks.extraPeriodDetail) || 'No lesson scheduled — extra period at end of term';
        const extraNote = (hooks && hooks.extraPeriodNote) || '';
        const overflowIntro = (hooks && hooks.overflowIntro) || '';
        const overflowNote = (hooks && hooks.overflowNote) || '';
        const skippedDetail = (hooks && hooks.skippedDetail) || 'Skipped this term — not on calendar';
        const getColors = hooks && hooks.getEventColors;

        sorted.forEach(lesson => {
            const d = lesson.date instanceof Date ? lesson.date : parseLocal(lesson.date);
            if (Number.isNaN(d.getTime())) {
                return;
            }
            const dateStr = formatISO(d);
            const monthKey = lesson.monthKey || dateStr.slice(0, 7);
            const weekLabel = getSchoolWeekLabel(dateStr, useFullMonth);
            const shortDate = formatSyllabusShortDate(d);

            if (lesson.__syllabusExtraPeriod === true) {
                rows.push(applyRowColors({
                    id: newRowId(),
                    kind: 'extra',
                    date: dateStr,
                    monthKey,
                    weekLabel,
                    sessionNumber: 0,
                    lessonNumber: 0,
                    planTitle: extraTitle,
                    planDetail: extraDetail,
                    note: extraNote,
                    source: 'generated'
                }, getColors ? getColors(null, 'other') : null));
                return;
            }

            const forceHoliday = lesson.__syllabusHoliday === true;
            if (forceHoliday || (hooks && hooks.isHolidayForClass && hooks.isHolidayForClass(dateStr, classData))) {
                const hol = hooks.getHolidayForClass
                    ? hooks.getHolidayForClass(dateStr, classData)
                    : null;
                const holName = hol && hol.name ? hol.name : 'Holiday';
                const colors = getColors ? getColors(hol, 'holiday') : null;
                rows.push(applyRowColors({
                    id: newRowId(),
                    kind: 'holiday',
                    date: dateStr,
                    monthKey,
                    weekLabel,
                    sessionNumber: 0,
                    lessonNumber: 0,
                    planTitle: `${shortDate} ${holName}`.trim(),
                    planDetail: holidayDetail,
                    note: '',
                    source: 'generated'
                }, colors));
                return;
            }

            lessonNumber += 1;
            const curriculumLessonNumber = lesson.group && lesson.group.start != null
                ? lesson.group.start
                : lessonNumber;
            let planTitle = lesson.label || `Lesson ${lessonNumber}`;
            const isDebateSchedule = classData && classData.scheduleModel === 'debateMonthly';
            const isCompressed = lesson.compressed === true;
            const groupStart = lesson.group && lesson.group.start != null ? lesson.group.start : null;
            const groupEnd = lesson.group && lesson.group.end != null ? lesson.group.end : null;
            const rowForTemplate = {
                planTitle,
                lessonNumber: curriculumLessonNumber,
                sessionNumber: lessonNumber,
                scheduleModel: classData && classData.scheduleModel ? classData.scheduleModel : '',
                debateTemplateKey: lesson.__debateTemplateKey || '',
                debateCompressed: isDebateSchedule && isCompressed,
                debateGroupStart: isDebateSchedule ? groupStart : null,
                debateGroupEnd: isDebateSchedule ? groupEnd : null,
                scheduleCompressed: isCompressed,
                compressedGroupStart: groupStart,
                compressedGroupEnd: groupEnd
            };
            let planDetail = lesson.compressed === true
                && lesson.group
                && lesson.group.end != null
                && lesson.group.end > lesson.group.start
                ? planDetailFromUnitRange(lesson.group.start, lesson.group.end, units)
                : planDetailFromUnits(curriculumLessonNumber, units, planTitle);
            if (resolveRowTemplate) {
                const tpl = resolveRowTemplate(rowForTemplate);
                if (tpl) {
                    if (tpl.planTitle) {
                        planTitle = tpl.planTitle;
                    }
                    if (tpl.planDetail) {
                        planDetail = tpl.planDetail;
                    }
                }
            }
            let kind = 'lesson';
            let colors = null;

            const inlineEv = hooks && hooks.getInlineEventForClass
                ? hooks.getInlineEventForClass(dateStr, classData)
                : null;
            if (inlineEv && inlineEv.name) {
                planTitle = `${shortDate} ${inlineEv.name}`.trim();
                planDetail = eventDetail;
                kind = 'event';
                colors = getColors ? getColors(inlineEv, inlineEv.type) : null;
            }

            rows.push(applyRowColors({
                id: newRowId(),
                kind,
                date: dateStr,
                monthKey,
                weekLabel,
                sessionNumber: lessonNumber,
                lessonNumber: curriculumLessonNumber,
                scheduleCompressed: lesson.compressed === true,
                planTitle,
                planDetail,
                note: '',
                source: 'generated'
            }, colors));
        });

        let overflowIntroPlaced = false;
        tail.forEach(item => {
            if (item.__syllabusOverflowIntro) {
                if (!overflowIntroPlaced && overflowIntro) {
                    rows.push({
                        id: newRowId(),
                        kind: 'note',
                        overflowIntro: true,
                        date: '',
                        monthKey: '',
                        weekLabel: '',
                        sessionNumber: 0,
                        planTitle: overflowIntro,
                        planDetail: '',
                        note: '',
                        source: 'generated'
                    });
                    overflowIntroPlaced = true;
                }
                return;
            }
            if (item.__syllabusSkipped) {
                const lessonNum = item.lessonNum || 0;
                const skipTitle = item.label || `Lesson ${lessonNum}`;
                rows.push({
                    id: newRowId(),
                    kind: 'skipped',
                    date: '',
                    monthKey: '',
                    weekLabel: '',
                    sessionNumber: lessonNum,
                    lessonNumber: lessonNum,
                    planTitle: skipTitle,
                    planDetail: skippedDetail,
                    note: '',
                    source: 'generated'
                });
                return;
            }
            if (item.__syllabusUnscheduled) {
                const lessonNum = item.lessonNum || 0;
                const overflowTitle = item.label || `Lesson ${lessonNum}`;
                const overflowRow = {
                    planTitle: overflowTitle,
                    lessonNumber: lessonNum,
                    sessionNumber: lessonNum
                };
                let overflowDetail = planDetailFromUnits(lessonNum, units, overflowTitle);
                if (resolveRowTemplate) {
                    const tpl = resolveRowTemplate(overflowRow);
                    if (tpl && tpl.planDetail) {
                        overflowDetail = tpl.planDetail;
                    }
                }
                rows.push({
                    id: newRowId(),
                    kind: 'overflow',
                    date: '',
                    monthKey: '',
                    weekLabel: '',
                    sessionNumber: lessonNum,
                    lessonNumber: lessonNum,
                    planTitle: overflowTitle,
                    planDetail: overflowDetail,
                    note: overflowNote,
                    source: 'generated'
                });
            }
        });

        return rows;
    }

    function preserveText(prev, gen, isManual) {
        if (isManual) {
            return prev != null ? prev : gen;
        }
        const p = (prev || '').trim();
        if (p) {
            return prev;
        }
        return gen != null ? gen : '';
    }

    function mergeSyllabusRows(existing, generated, options) {
        options = options || {};
        const refreshScheduleTitles = options.refreshScheduleTitles === true;
        const existingList = Array.isArray(existing) ? existing : [];
        const isTailRow = g => g.kind === 'overflow' || g.kind === 'extra' || g.kind === 'skipped'
            || g.overflowIntro === true;
        const mainGenerated = generated.filter(g => !isTailRow(g));
        const tailGenerated = generated.filter(isTailRow);
        const overflowIntroTitle = tailGenerated.find(g => g.overflowIntro)?.planTitle || '';

        const noteRows = existingList.filter(r => {
            if (r.kind !== 'note' || r.overflowIntro) {
                return false;
            }
            if (overflowIntroTitle && (r.planTitle || '').trim() === overflowIntroTitle.trim()) {
                return false;
            }
            return true;
        });
        const byKey = new Map();
        existingList.forEach(r => {
            if (r.kind === 'lesson' || r.kind === 'holiday' || r.kind === 'event'
                || r.kind === 'extra' || r.kind === 'overflow' || r.kind === 'skipped') {
                byKey.set(rowKey(r), r);
            }
        });

        const mergedLessons = mainGenerated.map(gen => {
            const key = rowKey(gen);
            const prev = byKey.get(key);
            if (!prev) {
                return { ...gen };
            }
            const keepEdits = prev.source === 'manual' || prev.source === 'imported';
            const forceTitle = refreshScheduleTitles
                && (gen.kind === 'lesson' || gen.kind === 'holiday' || gen.kind === 'event');
            const forceDetail = refreshScheduleTitles
                && gen.scheduleCompressed === true
                && prev.source !== 'imported';
            return {
                ...gen,
                id: prev.id || gen.id,
                planTitle: forceTitle
                    ? gen.planTitle
                    : (keepEdits && (prev.planTitle || '').trim()
                        ? prev.planTitle
                        : gen.planTitle),
                planDetail: forceDetail
                    ? gen.planDetail
                    : preserveText(prev.planDetail, gen.planDetail, keepEdits),
                note: preserveText(prev.note, gen.note, keepEdits),
                weekLabel: gen.weekLabel || prev.weekLabel,
                source: keepEdits ? prev.source : 'generated',
                rowBg: gen.rowBg || prev.rowBg || '',
                rowColor: gen.rowColor || prev.rowColor || '',
                eventType: gen.eventType || prev.eventType || ''
            };
        });

        return [...noteRows, ...mergedLessons, ...tailGenerated];
    }

    function normalizeRows(rows) {
        return (rows || []).map(r => ({
            id: r.id || newRowId(),
            kind: r.kind || 'lesson',
            date: r.date || '',
            monthKey: r.monthKey || (r.date ? r.date.slice(0, 7) : ''),
            weekLabel: r.weekLabel || (r.date ? getSchoolWeekLabel(r.date) : ''),
            sessionNumber: r.sessionNumber != null ? r.sessionNumber : 0,
            lessonNumber: r.lessonNumber != null
                ? r.lessonNumber
                : (r.kind === 'lesson' || r.kind === 'overflow' ? (r.sessionNumber || 0) : 0),
            planTitle: r.planTitle || '',
            planDetail: r.planDetail || '',
            note: r.note || '',
            source: r.source || 'generated',
            rowBg: r.rowBg || '',
            rowColor: r.rowColor || '',
            eventType: r.eventType || ''
        }));
    }

    function syllabusRowClass(row) {
        const kind = row.kind || 'lesson';
        const type = row.eventType ? ` syllabus-row-${row.eventType}` : '';
        return `syllabus-row syllabus-row-${kind}${type}`;
    }

    function syllabusCellStyleAttr(row) {
        if (!row.rowBg && !row.rowColor) {
            return '';
        }
        let style = '';
        if (row.rowBg) {
            style += `background-color:${row.rowBg};`;
        }
        if (row.rowColor) {
            style += `color:${row.rowColor};`;
        }
        return style ? ` style="${style}"` : '';
    }

    /**
     * Split Pages / detail into covered vs homework sections (import/curriculum format).
     * @returns {{ covered: string, homework: string }}
     */
    function splitPlanDetailSections(planDetail) {
        const raw = String(planDetail ?? '').trim();
        if (!raw) {
            return { covered: '', homework: '' };
        }
        const lines = raw.split('\n');
        let mode = 'covered';
        let hasMarker = false;
        const coveredLines = [];
        const homeworkLines = [];

        lines.forEach((line) => {
            const trimmed = line.trim();
            const coveredInline = trimmed.match(/^covered\s+in\s+class\s*:?\s*(.*)$/i);
            if (COVERED_HEADING_RE.test(trimmed) || coveredInline) {
                mode = 'covered';
                hasMarker = true;
                if (coveredInline && coveredInline[1].trim()) {
                    coveredLines.push(coveredInline[1].trim());
                }
                return;
            }
            const homeworkInline = trimmed.match(/^homework\s*:?\s*(.*)$/i);
            if (HOMEWORK_HEADING_RE.test(trimmed) || homeworkInline) {
                mode = 'homework';
                hasMarker = true;
                if (homeworkInline && homeworkInline[1].trim()) {
                    homeworkLines.push(homeworkInline[1].trim());
                }
                return;
            }
            if (mode === 'homework') {
                homeworkLines.push(line);
            } else {
                coveredLines.push(line);
            }
        });

        if (!hasMarker) {
            return { covered: raw, homework: '' };
        }
        return {
            covered: coveredLines.join('\n').trim(),
            homework: homeworkLines.join('\n').trim()
        };
    }

    function extractCoveredLines(planDetail) {
        return splitPlanDetailSections(planDetail).covered;
    }

    /** Drop lines in covered/homework that repeat the plan title or empty section headers. */
    function stripRedundantPlanDetailLines(planTitle, text) {
        const title = String(planTitle || '').trim();
        if (!text) {
            return '';
        }
        const lines = String(text).split('\n');
        const filtered = lines.filter((line) => {
            const t = line.trim();
            if (!t) {
                return false;
            }
            if (/^covered\s+in\s+class\s*:?\s*$/i.test(t)) {
                return false;
            }
            if (/^homework\s*:?\s*$/i.test(t)) {
                return false;
            }
            if (title && t === title) {
                return false;
            }
            return true;
        });
        return filtered.join('\n').trim();
    }

    /** First non-empty homework line, truncated for print. */
    function truncateHomeworkForPrint(homeworkText, maxLen) {
        const limit = maxLen != null && maxLen > 0 ? maxLen : 80;
        const hw = String(homeworkText ?? '').trim();
        if (!hw) {
            return '';
        }
        const firstLine = hw.split('\n').map((l) => l.trim()).find((l) => l.length > 0) || '';
        if (!firstLine) {
            return '';
        }
        if (firstLine.length <= limit) {
            return firstLine;
        }
        return `${firstLine.slice(0, limit - 1)}…`;
    }

    function mergedNoteRowLabel(row) {
        if (!row) {
            return 'Note';
        }
        if (row.kind === 'note') {
            const t = String(row.planTitle || '').trim();
            return t || 'Note';
        }
        if (row.sessionNumber > 0) {
            return `#${row.sessionNumber}`;
        }
        return 'Note';
    }

    function buildMergedNotesHtml(generalNotes, rows) {
        const parts = [];
        const general = String(generalNotes ?? '').trim();
        if (general) {
            parts.push(escapeHtml(general).replace(/\n/g, '<br>'));
        }
        (rows || []).forEach((row) => {
            const note = String(row.note ?? '').trim();
            if (!note) {
                return;
            }
            const label = mergedNoteRowLabel(row);
            parts.push(
                `<div class="syllabus-merged-note-item"><strong>${escapeHtml(label)}:</strong> `
                + `${escapeHtml(note).replace(/\n/g, '<br>')}</div>`
            );
        });
        return parts.join('<br><br>');
    }

    function renderPrintPlanTitleLine(row) {
        const title = escapeHtml(row.planTitle || '');
        const kind = row.kind || 'lesson';
        if (kind === 'note') {
            return title ? `<span class="syllabus-print-title">${title}</span>` : '';
        }
        const lessonNum = getCurriculumLessonNumber(row);
        const sessionNum = row.sessionNumber > 0 ? row.sessionNumber : 0;
        let titleLine = `<span class="syllabus-print-title">${title}</span>`;
        if (lessonNum > 0 && lessonNum !== sessionNum) {
            titleLine += ` <span class="syllabus-print-lesson-num">L${lessonNum}</span>`;
        }
        return titleLine;
    }

    function renderPrintPlanCoveredHomework(row, options) {
        const opts = options || {};
        const detail = (row.planDetail || '').trim();
        const planTitle = (row.planTitle || '').trim();
        const kind = row.kind || 'lesson';
        const detailClass = kind === 'holiday' || kind === 'event' || kind === 'extra' || kind === 'overflow'
            ? 'syllabus-plan-subline syllabus-plan-subline-emphasis'
            : 'syllabus-plan-detail';
        const hwLabel = opts.homeworkLabel || 'Homework';

        if (!detail) {
            return '';
        }

        const isSpecial = kind === 'holiday' || kind === 'event' || kind === 'extra' || kind === 'overflow';
        if (isSpecial) {
            return `<span class="${detailClass}">${escapeHtml(detail).replace(/\n/g, '<br>')}</span>`;
        }

        const sections = splitPlanDetailSections(detail);
        let covered = sections.covered || (!sections.homework ? detail : '');
        let homework = sections.homework || '';
        covered = stripRedundantPlanDetailLines(planTitle, covered);
        homework = stripRedundantPlanDetailLines(planTitle, homework);
        let html = '';
        if (covered) {
            html += `<span class="syllabus-print-covered">`
                + `${escapeHtml(covered).replace(/\n/g, '<br>')}</span>`;
        }
        if (homework) {
            const hwHtml = escapeHtml(homework).replace(/\n/g, '<br>');
            html += `<span class="syllabus-print-homework-full"><strong>${escapeHtml(hwLabel)}:</strong> `
                + `${hwHtml}</span>`;
        }
        return html;
    }

    function wrapPrintPlanBrief(inner) {
        if (!inner || !String(inner).trim()) {
            return '';
        }
        return `<div class="syllabus-print-plan-brief">${inner}</div>`;
    }

    /** Main table: max 2 lines per plan cell (CSS line-clamp). */
    function renderPlanCellBrief(row) {
        const kind = row.kind || 'lesson';
        const titleLine = renderPrintPlanTitleLine(row);
        const body = renderPrintPlanCoveredHomework(row, {});
        if (!titleLine && !body) {
            return '';
        }
        let inner = titleLine;
        if (body) {
            inner += titleLine ? `<br>${body}` : body;
        }
        return wrapPrintPlanBrief(inner);
    }

    /** Continuation page: full plan text per lesson. */
    function renderPlanCellFull(row, labels, options) {
        const opts = options || {};
        const L = labels || {};
        const titleLine = opts.skipTitle ? '' : renderPrintPlanTitleLine(row);
        const body = renderPrintPlanCoveredHomework(row, {
            homeworkLabel: L.continuationHomeworkLabel || 'Homework'
        });
        if (!titleLine && !body) {
            return '';
        }
        let html = titleLine;
        if (body) {
            html += titleLine ? `<br>${body}` : body;
        }
        return html;
    }

    function getLessonRowsForPrintContinuation(rows) {
        return (rows || []).filter((r) => {
            const k = r.kind || 'lesson';
            return k === 'lesson' || k === 'overflow';
        });
    }

    function chunkContinuationItems(rows, perPage) {
        const size = perPage > 0 ? perPage : SYLLABUS_CONTINUATION_ITEMS_PER_PAGE;
        const chunks = [];
        for (let i = 0; i < rows.length; i += size) {
            chunks.push(rows.slice(i, i + size));
        }
        return chunks;
    }

    function formatContinuationPageLabel(labels, pageNum, totalPages) {
        const L = labels || {};
        const tpl = L.continuationPage || 'Page {n} of {total}';
        return tpl.replace('{n}', String(pageNum)).replace('{total}', String(totalPages));
    }

    function renderContinuationItemHtml(row, labels) {
        const L = labels || {};
        const sessionNum = row.sessionNumber > 0 ? row.sessionNumber : 0;
        const sessionPrefix = sessionNum > 0 ? `#${sessionNum}` : '';
        const title = escapeHtml((row.planTitle || '').trim());
        const heading = [sessionPrefix, title].filter(Boolean).join(' · ');
        const body = renderPlanCellFull(row, L, { skipTitle: true });
        return `<article class="syllabus-continuation-item">`
            + `<h3 class="syllabus-continuation-item-title">${escapeHtml(heading)}</h3>`
            + `<div class="syllabus-continuation-item-body">${body}</div>`
            + `</article>`;
    }

    /**
     * One or more A4 continuation sheets listing every lesson row in full.
     */
    function renderSyllabusContinuationSheets(classTitle, lessonRows, labels) {
        const L = labels || {};
        const rows = getLessonRowsForPrintContinuation(lessonRows);
        if (!rows.length) {
            return '';
        }
        const chunks = chunkContinuationItems(rows, SYLLABUS_CONTINUATION_ITEMS_PER_PAGE);
        const contTitle = L.continuationTitle || 'Lesson plan details';
        const hint = L.continuationHint
            || 'The overview table shows up to 2 lines per lesson. Full lesson text is below.';
        let html = '';
        chunks.forEach((chunk, pageIndex) => {
            const pageNum = pageIndex + 1;
            const totalPages = chunks.length;
            html += '<div class="syllabus-a4-sheet syllabus-a4-continuation-sheet syllabus-a4-sheet-break">';
            html += '<div class="syllabus-a4-page syllabus-a4-continuation-page">';
            html += `<h2 class="syllabus-pdf-title">${escapeHtml(classTitle)}`
                + ` — ${escapeHtml(contTitle)}</h2>`;
            if (pageIndex === 0) {
                html += `<p class="syllabus-continuation-hint">${escapeHtml(hint)}</p>`;
            }
            if (totalPages > 1) {
                html += `<p class="syllabus-continuation-page-num">`
                    + `${escapeHtml(formatContinuationPageLabel(L, pageNum, totalPages))}</p>`;
            }
            html += '<div class="syllabus-continuation-list">';
            chunk.forEach((row) => {
                html += renderContinuationItemHtml(row, L);
            });
            html += '</div></div></div>';
        });
        return html;
    }

    /** 진도표 overview: one short line (plan title). */
    function renderPlanCellJindo(row) {
        const title = String(row.planTitle || '').trim();
        if (!title) {
            return '';
        }
        return `<span class="syllabus-print-title">${escapeHtml(title)}</span>`;
    }

    function syllabusRowNeedsContinuation(row) {
        if (!row) {
            return false;
        }
        const kind = row.kind || 'lesson';
        if (kind !== 'lesson' && kind !== 'overflow') {
            return false;
        }
        const detail = String(row.planDetail || '').trim();
        if (!detail) {
            return false;
        }
        const sections = splitPlanDetailSections(detail);
        if (sections.homework) {
            return true;
        }
        const covered = stripRedundantPlanDetailLines(row.planTitle, sections.covered || detail);
        return covered.length > 0 && covered !== String(row.planTitle || '').trim();
    }

    function renderPlanCell(row, options) {
        const opts = options || {};
        const printMode = opts.printMode === true;
        const jindoMode = opts.jindoMode === true;
        const title = escapeHtml(row.planTitle || '');
        const detail = (row.planDetail || '').trim();
        const kind = row.kind || 'lesson';
        const detailClass = kind === 'holiday' || kind === 'event' || kind === 'extra' || kind === 'overflow'
            ? 'syllabus-plan-subline syllabus-plan-subline-emphasis'
            : 'syllabus-plan-detail';

        if (jindoMode) {
            return renderPlanCellJindo(row);
        }

        if (printMode) {
            return renderPlanCellBrief(row);
        }

        if (!detail) {
            return title;
        }
        return `${title}<br><span class="${detailClass}">${escapeHtml(detail)}</span>`;
    }

    /**
     * @param {object} classData
     * @param {Array} rows
     * @param {object} labels - column headers and title parts
     */
    function getRowMonthDisplay(row, useFullMonth, carryMonth) {
        let month = '';
        if (row.monthKey) {
            month = formatSyllabusMonthFromKey(row.monthKey, useFullMonth);
        } else if (row.date) {
            month = formatSyllabusMonthFromDate(row.date, useFullMonth);
        }
        if (month) {
            return month;
        }
        return carryMonth || '';
    }

    function getRowWeekDisplay(row, useFullMonth, carryWeek, useCompactWeek) {
        let week = (row.weekLabel || '').trim();
        if (!week && row.date) {
            week = useCompactWeek
                ? getSchoolWeekLabelCompact(row.date)
                : getSchoolWeekLabel(row.date, useFullMonth);
        }
        if (week) {
            return week;
        }
        return carryWeek || '';
    }

    /**
     * Month/week rowspan groups (PDF-style: one merged cell per month, one per school week).
     */
    function computeSyllabusCellMerges(rows, useFullMonth, useCompactWeek) {
        const n = rows.length;
        const monthDisplays = [];
        const weekDisplays = [];
        const monthRowspan = new Array(n).fill(0);
        const weekRowspan = new Array(n).fill(0);
        let carryMonth = '';
        let carryWeek = '';

        for (let i = 0; i < n; i += 1) {
            const row = rows[i];
            const month = getRowMonthDisplay(row, useFullMonth, carryMonth);
            const week = getRowWeekDisplay(row, useFullMonth, carryWeek, useCompactWeek);
            if (month) {
                carryMonth = month;
            }
            if (week) {
                carryWeek = week;
            }
            monthDisplays.push(carryMonth);
            weekDisplays.push(carryWeek);
        }

        let i = 0;
        while (i < n) {
            const key = monthDisplays[i];
            let j = i + 1;
            while (j < n && monthDisplays[j] === key && key) {
                j += 1;
            }
            if (key) {
                monthRowspan[i] = j - i;
            }
            i = j;
        }

        i = 0;
        while (i < n) {
            const key = weekDisplays[i];
            let j = i + 1;
            while (j < n && weekDisplays[j] === key && key) {
                j += 1;
            }
            if (key) {
                weekRowspan[i] = j - i;
            }
            i = j;
        }

        return { monthDisplays, weekDisplays, monthRowspan, weekRowspan };
    }

    function renderMergedMonthWeekCells(i, merge, usePdfMonthHeader, cellStyle) {
        let html = '';
        if (merge.monthRowspan[i] > 0) {
            const cls = usePdfMonthHeader
                ? 'syllabus-col-month syllabus-col-year syllabus-cell-merged'
                : 'syllabus-col-month syllabus-cell-merged';
            html += `<td rowspan="${merge.monthRowspan[i]}" class="${cls}"${cellStyle}>${escapeHtml(merge.monthDisplays[i])}</td>`;
        }
        if (merge.weekRowspan[i] > 0) {
            html += `<td rowspan="${merge.weekRowspan[i]}" class="syllabus-col-week syllabus-cell-merged"${cellStyle}>${escapeHtml(merge.weekDisplays[i])}</td>`;
        }
        return html;
    }

    function renderSyllabusClassSectionHtml(classData, rows, scheduleAdjustments, labels) {
        return renderSyllabusTableHtml(classData, rows, labels);
    }

    function renderSyllabusTableHtml(classData, rows, labels) {
        const L = labels || {};
        const pdfLayout = L.pdfLayout === true;
        const jindoLayout = pdfLayout && isJindoPdfLayout(L);
        const normalized = normalizeRows(rows);
        const useFullMonth = !pdfLayout;
        const useCompactWeek = pdfLayout && !jindoLayout;
        const merge = jindoLayout
            ? computeJindoCellMerges(normalized, L)
            : computeSyllabusCellMerges(normalized, useFullMonth, useCompactWeek);
        const jindoNotesHtml = jindoLayout ? buildPrintNotesColumnHtml(L.generalNotes) : '';

        let headerBlock = '';
        if (L.generalNotes && !pdfLayout) {
            const notesHtml = escapeHtml(L.generalNotes).replace(/\n/g, '<br>');
            headerBlock += `<div class="syllabus-general-notes-print">${notesHtml}</div>`;
        }
        if (L.classTitle || L.jindoTitle) {
            if (pdfLayout) {
                const titleText = (jindoLayout && L.jindoTitle) ? L.jindoTitle : L.classTitle;
                const titleCls = jindoLayout
                    ? 'syllabus-pdf-title syllabus-jindo-title'
                    : 'syllabus-pdf-title';
                headerBlock += `<h2 class="${titleCls}">${escapeHtml(titleText || '')}</h2>`;
            } else if (L.classTitle) {
                const titleParts = [escapeHtml(L.classTitle)];
                if (L.subtitle) {
                    titleParts.push(escapeHtml(L.subtitle));
                }
                if (L.termRange) {
                    titleParts.push(escapeHtml(L.termRange));
                }
                headerBlock += `<div class="syllabus-class-header">${titleParts.join(' · ')}</div>`;
            }
        }

        const tableClass = [
            'syllabus-table',
            pdfLayout ? 'syllabus-table-pdf' : '',
            jindoLayout ? 'syllabus-table-jindo' : ''
        ].filter(Boolean).join(' ');
        let html = `${headerBlock}<table class="${tableClass}">`;
        if (pdfLayout) {
            html += '<colgroup>';
            const colWidths = jindoLayout ? SYLLABUS_JINDO_COL_WIDTHS : SYLLABUS_A4_COL_WIDTHS;
            colWidths.forEach(w => {
                html += `<col style="width:${w}">`;
            });
            html += '</colgroup>';
        }
        html += '<thead><tr>';
        if (pdfLayout) {
            const year = L.tableYear || '';
            const yearHeader = L.colYear
                ? String(L.colYear).replace('{year}', year)
                : (L.useKoreanJindo && year ? `${year}년` : year);
            const planHeader = jindoLayout
                ? (L.colPlanJindo || L.colPlanPrint || L.colPlan || 'Lesson plan')
                : (L.colPlanShort || L.colPlanPrint || L.colPlan || 'Lesson plan');
            const dateHeader = jindoLayout
                ? (L.colDate || L.colClass || 'Date')
                : (L.colClass || 'Class');
            html += `<th class="syllabus-col-year syllabus-th-year">${escapeHtml(yearHeader)}</th>`;
            html += `<th class="syllabus-th-week">${escapeHtml(L.colWeek || 'Week')}</th>`;
            html += `<th class="syllabus-th-date syllabus-th-class">${escapeHtml(dateHeader)}</th>`;
            html += `<th class="syllabus-th-plan">${escapeHtml(planHeader)}</th>`;
            html += `<th class="syllabus-th-note">${escapeHtml(L.colNote || 'Note')}</th>`;
        } else {
            html += `<th>${escapeHtml(L.colMonth || 'Month')}</th>`;
            html += `<th>${escapeHtml(L.colWeek || 'Week')}</th>`;
            html += `<th>${escapeHtml(L.colClass || 'Class')}</th>`;
            html += `<th>${escapeHtml(L.colPlan || 'Weekly Lesson Plan')}</th>`;
            html += `<th>${escapeHtml(L.colNote || 'Note')}</th>`;
        }
        html += `</tr></thead><tbody>`;

        const rowCount = normalized.length;
        const mergedNotesHtml = pdfLayout && !jindoLayout
            ? buildMergedNotesHtml(L.generalNotes, normalized)
            : '';

        normalized.forEach((row, i) => {
            let dateOrSessionDisplay = '';
            if (jindoLayout) {
                dateOrSessionDisplay = row.date
                    ? formatJindoDateMd(row.date)
                    : (row.kind !== 'note' && row.sessionNumber > 0 ? String(row.sessionNumber) : '');
            } else {
                dateOrSessionDisplay = row.kind !== 'note' && row.sessionNumber > 0
                    ? String(row.sessionNumber)
                    : '';
            }
            const trClass = syllabusRowClass(row);
            const cellStyle = syllabusCellStyleAttr(row);
            html += `<tr class="${trClass}">`;
            html += renderMergedMonthWeekCells(i, merge, pdfLayout, cellStyle);
            const dateColClass = jindoLayout
                ? 'syllabus-col-date syllabus-col-class'
                : 'syllabus-col-class';
            html += `<td class="${dateColClass}"${cellStyle}>${escapeHtml(dateOrSessionDisplay)}</td>`;
            html += `<td class="syllabus-col-plan"${cellStyle}>${renderPlanCell(row, {
                printMode: pdfLayout && !jindoLayout,
                jindoMode: jindoLayout
            })}</td>`;
            if (pdfLayout && jindoLayout) {
                if (i === 0 && rowCount > 0) {
                    const noteRowspan = rowCount;
                    const noteCls = noteRowspan > 1
                        ? 'syllabus-col-note syllabus-note-merged syllabus-jindo-note syllabus-jindo-note-span'
                        : 'syllabus-col-note syllabus-note-merged syllabus-jindo-note';
                    html += `<td rowspan="${noteRowspan}" class="${noteCls}"${cellStyle}>${jindoNotesHtml}</td>`;
                }
            } else if (pdfLayout) {
                if (i === 0 && rowCount > 0) {
                    html += `<td rowspan="${rowCount}" class="syllabus-col-note syllabus-note-merged"${cellStyle}>${mergedNotesHtml}</td>`;
                }
            } else {
                html += `<td class="syllabus-col-note"${cellStyle}>${escapeHtml(row.note || '')}</td>`;
            }
            html += '</tr>';
        });

        html += '</tbody></table>';
        return html;
    }

    const EXPORT_CSS = `
*, *::before, *::after {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body { font-family: "DM Sans", Arial, sans-serif; font-size: 11pt; color: #111; margin: 24px; }
.syllabus-doc-cover { margin-bottom: 2rem; }
.syllabus-doc-cover h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
.syllabus-class-block { page-break-inside: avoid; margin-bottom: 2.5rem; }
.syllabus-pdf-title { font-size: 1.15rem; font-weight: 700; margin: 0 0 0.75rem; }
.syllabus-class-header { font-weight: 700; margin-bottom: 0.5rem; font-size: 1rem; }
.syllabus-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.syllabus-table-pdf { border: 2px solid #111; }
.syllabus-table th, .syllabus-table td { border: 1px solid #333; padding: 6px 8px; vertical-align: top; }
.syllabus-table th { background: #f3f4f6; font-weight: 600; }
.syllabus-table-pdf .syllabus-col-year { width: 4.5em; }
.syllabus-col-month { width: 4.5em; }
.syllabus-col-week { width: 8.5em; }
.syllabus-col-class { width: 2.5em; text-align: center; }
.syllabus-cell-merged { vertical-align: middle; text-align: center; background: transparent; }
.syllabus-col-month.syllabus-cell-merged { font-weight: 600; }
.syllabus-col-week.syllabus-cell-merged { font-weight: 500; font-size: 0.95em; }
.syllabus-a4-page .syllabus-col-month.syllabus-cell-merged {
  font-size: 0.82em;
  white-space: nowrap;
}
.syllabus-a4-page .syllabus-col-week.syllabus-cell-merged {
  font-size: 0.8em;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  line-height: 1.15;
  hyphens: auto;
}
.syllabus-print-title { font-weight: 700; }
.syllabus-print-lesson-num { font-weight: 600; font-size: 0.88em; opacity: 0.9; }
.syllabus-print-covered { display: block; margin-top: 2px; line-height: 1.2; }
.syllabus-print-homework-full { display: block; margin-top: 2px; line-height: 1.2; font-size: 0.92em; }
.syllabus-print-plan-brief {
  display: -webkit-box;
  -webkit-line-clamp: ${SYLLABUS_PRINT_PLAN_LINE_CLAMP};
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.2;
  word-break: break-word;
}
.syllabus-continuation-hint { margin: 0 0 3mm; font-size: 9pt; line-height: 1.25; color: #374151; }
.syllabus-continuation-page-num { margin: 0 0 2mm; font-size: 8.5pt; color: #64748b; text-align: right; }
.syllabus-continuation-list { display: flex; flex-direction: column; gap: 3mm; }
.syllabus-continuation-item {
  page-break-inside: avoid;
  break-inside: avoid;
  border-bottom: 1px solid #d1d5db;
  padding-bottom: 2.5mm;
}
.syllabus-continuation-item:last-child { border-bottom: none; padding-bottom: 0; }
.syllabus-continuation-item-title {
  margin: 0 0 1.5mm;
  font-size: 10pt;
  font-weight: 700;
  line-height: 1.2;
}
.syllabus-continuation-item-body { font-size: 9.5pt; line-height: 1.25; }
.syllabus-continuation-item-body .syllabus-print-covered,
.syllabus-continuation-item-body .syllabus-print-homework-full { margin-top: 1.5mm; }
.syllabus-note-merged { vertical-align: top; word-break: break-word; font-size: 0.92em; line-height: 1.25; overflow: hidden; }
.syllabus-merged-note-item { margin-top: 0.35em; }
.syllabus-merged-note-item:first-child { margin-top: 0; }
.syllabus-plan-detail { display: block; font-size: 0.95em; color: inherit; margin-top: 2px; }
.syllabus-plan-subline { display: block; font-size: 0.88em; margin-top: 3px; font-style: italic; opacity: 0.92; }
.syllabus-plan-subline-emphasis { font-style: normal; font-weight: 500; }
.syllabus-row-holiday td { border-color: #d97706; background-color: #fef3c7; color: #b45309; }
.syllabus-row-event td { border-color: #7c3aed; background-color: #e9d5ff; color: #6b21a1; }
.syllabus-row-event.syllabus-row-evaluation_deadline td { border-color: #991b1b; background-color: #fecaca; color: #991b1b; }
.syllabus-row-event.syllabus-row-homework_deadline td { border-color: #1e40af; background-color: #dbeafe; color: #1e40af; }
.syllabus-row-event.syllabus-row-evaluation_period td { border-color: #6b21a1; background-color: #e9d5ff; color: #6b21a1; }
.syllabus-row-event.syllabus-row-other td { border-color: #6b7280; background-color: #e5e7eb; color: #374151; }
.syllabus-row-extra td { border-color: #6b7280; border-style: dashed; background-color: #e5e7eb; color: #374151; }
.syllabus-row-overflow td { border-color: #9ca3af; }
.syllabus-row-note td { background: #fafafa; font-style: italic; }
`;

    const A4_PDF_CSS = `
@page { size: A4 portrait; margin: ${SYLLABUS_A4_MARGIN_MM}mm; }
html, body { margin: 0; padding: 0; }
body.syllabus-a4-export { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #111; background: #fff; width: 100%; margin: 0; padding: 0; }
.syllabus-pdf-export-root { width: 100%; margin: 0; padding: 0; display: block; }
.syllabus-a4-sheet {
  width: 210mm;
  height: 297mm;
  max-height: 297mm;
  box-sizing: border-box;
  padding: ${SYLLABUS_A4_MARGIN_MM}mm;
  page-break-after: always;
  break-after: page;
  page-break-inside: avoid;
  break-inside: avoid;
  margin: 0 auto;
  overflow: hidden;
  position: relative;
  display: block;
  clear: both;
  background: #fff;
}
.syllabus-a4-sheet:last-child { page-break-after: auto; break-after: auto; }
.syllabus-a4-sheet-break { page-break-before: always; break-before: page; }
.syllabus-a4-page {
  width: 100%;
  max-width: 100%;
  height: auto;
  min-height: 0;
  max-height: ${SYLLABUS_A4_PAGE.fitContentH}mm;
  box-sizing: border-box;
  margin: 0;
  padding: 0 0 4mm 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.syllabus-a4-page .syllabus-class-block {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  margin-bottom: 0;
  min-height: 0;
}
.syllabus-a4-page .syllabus-table {
  width: 100%;
  table-layout: fixed;
  flex: 1 1 auto;
  height: auto;
}
.syllabus-a4-page .syllabus-table tbody tr {
  height: auto;
}
.syllabus-a4-page .syllabus-pdf-title {
  font-size: 12pt;
  font-weight: 700;
  text-align: center;
  margin: 0 0 2mm;
  line-height: 1.2;
}
.syllabus-a4-page .syllabus-table { font-size: 10pt; line-height: 1.2; border: 2px solid #111; }
.syllabus-a4-page .syllabus-table th,
.syllabus-a4-page .syllabus-table td { padding: 3px 4px; border: 1px solid #333; vertical-align: top; }
.syllabus-a4-page .syllabus-table td { overflow: hidden; }
.syllabus-a4-page .syllabus-table-jindo td.syllabus-jindo-note,
.syllabus-a4-page .syllabus-table-jindo td.syllabus-note-merged {
  overflow: visible !important;
}
.syllabus-a4-page .syllabus-table th {
  background: #f3f4f6;
  font-size: 9pt;
  font-weight: 600;
  overflow: visible;
  white-space: normal;
  word-break: break-word;
  line-height: 1.2;
  vertical-align: middle;
}
.syllabus-a4-page .syllabus-th-year { font-size: 8.5pt; padding: 2px 2px; text-align: center; }
.syllabus-a4-page .syllabus-th-week { font-size: 8pt; padding: 2px 2px; text-align: center; line-height: 1.15; }
.syllabus-a4-page .syllabus-th-class { font-size: 8.5pt; padding: 2px 3px; text-align: center; white-space: nowrap; }
.syllabus-a4-page .syllabus-th-plan { font-size: 9pt; padding: 3px 4px; text-align: left; }
.syllabus-a4-page .syllabus-th-note { font-size: 9pt; padding: 3px 4px; text-align: left; }
.syllabus-a4-page .syllabus-plan-detail,
.syllabus-a4-page .syllabus-plan-subline { font-size: 9pt; margin-top: 1px; line-height: 1.15; }
.syllabus-a4-page .syllabus-print-covered {
  display: block;
  font-size: 9.5pt;
  line-height: 1.2;
  margin-top: 2px;
}
.syllabus-a4-page .syllabus-print-homework-full { font-size: 8.5pt; margin-top: 2px; }
.syllabus-a4-page .syllabus-print-plan-brief {
  display: -webkit-box;
  -webkit-line-clamp: ${SYLLABUS_PRINT_PLAN_LINE_CLAMP};
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.2;
}
.syllabus-a4-page.syllabus-a4-dense .syllabus-print-plan-brief { -webkit-line-clamp: ${SYLLABUS_PRINT_PLAN_LINE_CLAMP}; }
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-print-plan-brief { -webkit-line-clamp: ${SYLLABUS_PRINT_PLAN_LINE_CLAMP}; }
.syllabus-a4-continuation-page .syllabus-pdf-title { font-size: 11pt; margin-bottom: 2mm; }
.syllabus-a4-continuation-page .syllabus-continuation-list { flex: 1 1 auto; min-height: 0; overflow: hidden; }
.syllabus-a4-page .syllabus-note-merged {
  display: -webkit-box;
  -webkit-line-clamp: 28;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.syllabus-a4-page .syllabus-col-class,
.syllabus-a4-page .syllabus-cell-merged { vertical-align: middle; text-align: center; }
.syllabus-a4-page .syllabus-col-class { text-align: center; font-size: 9pt; }
.syllabus-a4-page .syllabus-col-plan { vertical-align: top; word-break: break-word; overflow: hidden; }
.syllabus-a4-page .syllabus-col-note { vertical-align: top; word-break: break-word; }
.syllabus-jindo-title { font-size: 11pt; font-weight: 700; text-align: center; margin: 0 0 2.5mm; line-height: 1.25; }
.syllabus-table-jindo .syllabus-col-plan { overflow: visible; }
.syllabus-table-jindo .syllabus-col-plan .syllabus-print-title { font-weight: 600; }
.syllabus-table-jindo {
  border-collapse: separate;
  border-spacing: 0;
}
.syllabus-table-jindo th,
.syllabus-table-jindo td {
  border: 1px solid #333;
  box-sizing: border-box;
}
.syllabus-table-jindo .syllabus-jindo-note.syllabus-note-merged {
  font-size: 8.5pt;
  line-height: 1.25;
  vertical-align: top;
  word-break: break-word;
  overflow: visible;
  display: block;
  background: #fff;
}
.syllabus-table-jindo .syllabus-jindo-note-span {
  border-bottom: 1px solid #333;
}
.syllabus-a4-page .syllabus-table-jindo .syllabus-note-merged,
.syllabus-a4-page .syllabus-table-jindo .syllabus-jindo-note {
  -webkit-line-clamp: unset !important;
  display: block !important;
  overflow: visible !important;
  max-height: none !important;
}
.syllabus-a4-page .syllabus-table-jindo tbody tr td.syllabus-col-plan,
.syllabus-a4-page .syllabus-table-jindo tbody tr td.syllabus-col-date,
.syllabus-a4-page .syllabus-table-jindo tbody tr td.syllabus-col-class {
  border-bottom: 1px solid #333;
}
.syllabus-a4-page .syllabus-table-jindo tbody tr:last-child td.syllabus-col-plan,
.syllabus-a4-page .syllabus-table-jindo tbody tr:last-child td.syllabus-col-date,
.syllabus-a4-page .syllabus-table-jindo tbody tr:last-child td.syllabus-cell-merged {
  border-bottom: 1px solid #333;
}
.syllabus-table-jindo .syllabus-col-date { text-align: center; white-space: nowrap; font-size: 9pt; }
.syllabus-table-jindo .syllabus-col-week.syllabus-cell-merged { font-size: 8.5pt; }
.syllabus-table-jindo .syllabus-col-month.syllabus-cell-merged,
.syllabus-table-jindo .syllabus-col-year.syllabus-cell-merged {
  font-size: 9pt;
  font-weight: 600;
  white-space: nowrap;
  min-width: 5.25em;
  padding-left: 5px;
  padding-right: 5px;
}
.syllabus-a4-page .syllabus-table-jindo .syllabus-th-year {
  min-width: 5.25em;
  white-space: nowrap;
  font-size: 9.5pt;
  font-weight: 700;
  padding: 3px 5px;
  vertical-align: middle;
  line-height: 1.2;
}
.syllabus-a4-page.syllabus-a4-dense .syllabus-pdf-title { font-size: 11pt; margin-bottom: 1.75mm; }
.syllabus-a4-page.syllabus-a4-dense .syllabus-table { font-size: 9.25pt; line-height: 1.15; }
.syllabus-a4-page.syllabus-a4-dense .syllabus-table th { font-size: 8.5pt; }
.syllabus-a4-page.syllabus-a4-dense .syllabus-table th,
.syllabus-a4-page.syllabus-a4-dense .syllabus-table td { padding: 2px 3px; }
.syllabus-a4-page.syllabus-a4-dense .syllabus-print-covered { font-size: 8.75pt; }
.syllabus-a4-page.syllabus-a4-dense .syllabus-plan-detail,
.syllabus-a4-page.syllabus-a4-dense .syllabus-plan-subline { font-size: 8.25pt; }
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-pdf-title { font-size: 10.5pt; margin-bottom: 1.5mm; }
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-table { font-size: 8.5pt; line-height: 1.1; }
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-table th { font-size: 8pt; }
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-table th,
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-table td { padding: 2px 2px; }
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-print-covered { font-size: 8pt; }
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-plan-detail,
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-plan-subline { font-size: 7.75pt; }
@media print {
  *, *::before, *::after {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body.syllabus-a4-export { margin: 0; }
  .syllabus-a4-sheet {
    page-break-after: always;
    break-after: page;
    width: 210mm;
    height: 297mm;
    overflow: visible;
  }
  .syllabus-a4-sheet:last-child { page-break-after: auto; }
}
`;

    const SYLLABUS_FONT_LINK = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap';

    function renderSyllabusDocumentBody(meta, sections, labels) {
        const L = labels || {};
        const pdfLayout = L.pdfLayout === true;
        const a4Pdf = L.a4Pdf === true;
        let body = '';

        if (!a4Pdf && (!pdfLayout || sections.length > 1)) {
            body += `<div class="syllabus-doc-cover"><h1>${escapeHtml(meta.title || 'Syllabus')}</h1>`;
            if (meta.subtitle) {
                body += `<p>${escapeHtml(meta.subtitle)}</p>`;
            }
            body += '</div>';
        }

        sections.forEach((sec, index) => {
            let densityClass = '';
            if (a4Pdf) {
                const rowCount = Array.isArray(sec.rows) ? sec.rows.length : 0;
                if (rowCount > 38) {
                    densityClass = ' syllabus-a4-extra-dense';
                } else if (rowCount > 32) {
                    densityClass = ' syllabus-a4-dense';
                }
            }
            const pageClass = a4Pdf
                ? `syllabus-a4-page${densityClass}`
                : '';
            if (a4Pdf) {
                const sheetBreak = index > 0 ? ' syllabus-a4-sheet-break' : '';
                body += `<div class="syllabus-a4-sheet${sheetBreak}"><div class="${pageClass}">`;
            }
            body += `<section class="syllabus-class-block">`;
            body += renderSyllabusClassSectionHtml(
                sec.classData,
                sec.rows,
                [],
                {
                    ...labels,
                    classTitle: sec.classTitle,
                    jindoTitle: sec.jindoTitle || labels.jindoTitle,
                    tableYear: sec.tableYear || labels.tableYear,
                    subtitle: sec.subtitle,
                    termRange: sec.termRange,
                    generalNotes: resolvePrintGeneralNotes(sec.classData, labels)
                }
            );
            body += `</section>`;
            if (a4Pdf) {
                body += `</div></div>`;
                const sectionLabels = {
                    ...labels,
                    classTitle: sec.classTitle,
                    tableYear: sec.tableYear || labels.tableYear,
                    subtitle: sec.subtitle,
                    termRange: sec.termRange,
                    generalNotes: resolvePrintGeneralNotes(sec.classData, labels)
                };
                if (shouldIncludeDetailAppendix(sectionLabels)) {
                    body += renderSyllabusContinuationSheets(
                        sec.classTitle || '',
                        sec.rows,
                        sectionLabels
                    );
                }
            }
        });

        return body;
    }

    function getSyllabusExportStyles(a4Pdf) {
        return a4Pdf ? `${EXPORT_CSS}\n${A4_PDF_CSS}` : EXPORT_CSS;
    }

    function measureMmToPx(doc) {
        const probe = doc.createElement('div');
        probe.style.cssText = 'position:absolute;visibility:hidden;height:10mm;width:10mm;pointer-events:none;';
        doc.body.appendChild(probe);
        const pxPerMm = probe.offsetHeight / 10;
        doc.body.removeChild(probe);
        return pxPerMm > 0 ? pxPerMm : 96 / 25.4;
    }

    /** Reference layout matched to fixed syllabus PDF sample (26 SP Navy). */
    function getSyllabusTypographyBase(pageEl) {
        const ref = SYLLABUS_A4_REFERENCE;
        if (pageEl.classList.contains('syllabus-a4-extra-dense')) {
            return {
                title: ref.titlePt - 1.5,
                table: ref.tablePt - 1.75,
                th: ref.thPt - 1.75,
                subline: ref.sublinePt - 1.75,
                titleMarginMm: 1.5,
                cellPadY: 2,
                cellPadX: 3,
                lineHeight: 1.1
            };
        }
        if (pageEl.classList.contains('syllabus-a4-dense')) {
            return {
                title: ref.titlePt - 0.75,
                table: ref.tablePt - 0.75,
                th: ref.thPt - 0.75,
                subline: ref.sublinePt - 0.75,
                titleMarginMm: 1.75,
                cellPadY: 2,
                cellPadX: 3,
                lineHeight: 1.15
            };
        }
        return {
            title: ref.titlePt,
            table: ref.tablePt,
            th: ref.thPt,
            subline: ref.sublinePt,
            titleMarginMm: ref.titleMarginMm,
            cellPadY: ref.cellPadY,
            cellPadX: ref.cellPadX,
            lineHeight: ref.lineHeight
        };
    }

    function clearSyllabusTypographyScale(pageEl) {
        pageEl.style.height = '';
        pageEl.style.minHeight = '';
        pageEl.style.maxHeight = '';
        pageEl.style.paddingBottom = '';
        pageEl.style.boxSizing = '';
        pageEl.style.overflow = '';
        pageEl.removeAttribute('data-syllabus-scale');
        pageEl.querySelectorAll('[data-syllabus-scaled]').forEach(el => {
            el.style.fontSize = '';
            el.style.lineHeight = '';
            el.style.padding = '';
            el.style.marginBottom = '';
            el.style.marginTop = '';
            el.style.height = '';
            el.style.display = '';
            el.removeAttribute('data-syllabus-scaled');
        });
        const tbody = pageEl.querySelector('.syllabus-table tbody');
        const table = pageEl.querySelector('.syllabus-table');
        if (tbody) {
            tbody.style.height = '';
            tbody.style.display = '';
        }
        if (table) {
            table.style.height = '';
        }
    }

    function applySyllabusTypographyScale(pageEl, scale) {
        const base = getSyllabusTypographyBase(pageEl);
        pageEl.setAttribute('data-syllabus-scale', String(scale));

        const title = pageEl.querySelector('.syllabus-pdf-title');
        if (title) {
            title.style.fontSize = `${base.title * scale}pt`;
            title.style.marginBottom = `${base.titleMarginMm * scale}mm`;
            title.style.textAlign = 'center';
            title.dataset.syllabusScaled = '1';
        }

        const table = pageEl.querySelector('.syllabus-table');
        if (table) {
            table.style.fontSize = `${base.table * scale}pt`;
            table.style.lineHeight = String(base.lineHeight);
            table.dataset.syllabusScaled = '1';
        }

        pageEl.querySelectorAll('.syllabus-table th').forEach(th => {
            th.style.fontSize = `${base.th * scale}pt`;
            th.style.padding = `${base.cellPadY * scale}px ${base.cellPadX * scale}px`;
            th.dataset.syllabusScaled = '1';
        });

        pageEl.querySelectorAll('.syllabus-table td').forEach(td => {
            td.style.padding = `${base.cellPadY * scale}px ${base.cellPadX * scale}px`;
            td.dataset.syllabusScaled = '1';
        });

        pageEl.querySelectorAll('.syllabus-plan-detail, .syllabus-plan-subline, .syllabus-print-covered, .syllabus-print-homework-full, .syllabus-continuation-item-body').forEach(el => {
            el.style.fontSize = `${base.subline * scale}pt`;
            el.style.marginTop = `${1 * scale}px`;
            el.dataset.syllabusScaled = '1';
        });
    }

    function unwrapSyllabusCaptureWrap(pageEl) {
        const oldWrap = pageEl.parentElement;
        if (oldWrap && oldWrap.classList.contains('syllabus-a4-capture-wrap')) {
            oldWrap.parentNode.insertBefore(pageEl, oldWrap);
            oldWrap.parentNode.removeChild(oldWrap);
        }
    }

    function resetSyllabusPageLayout(pageEl) {
        unwrapSyllabusCaptureWrap(pageEl);
        clearSyllabusTypographyScale(pageEl);
        pageEl.style.transform = '';
        pageEl.style.transformOrigin = '';
        pageEl.style.width = '100%';
        pageEl.style.maxWidth = '100%';
        pageEl.style.height = 'auto';
        pageEl.style.maxHeight = '';
        pageEl.style.overflow = 'visible';
        pageEl.style.margin = '0';
        pageEl.style.padding = '0';
    }

    function computeSyllabusPageScale(naturalH, naturalW, contentWpx, contentHpx) {
        if (!naturalH || naturalH < 1) {
            return 1;
        }
        let scale = contentHpx / naturalH;
        if (naturalW * scale > contentWpx) {
            scale = contentWpx / naturalW;
        }
        return scale;
    }

    function getSyllabusStretchHeightPx(pageEl, contentHpx, mmPx) {
        let padBottom = 0;
        if (pageEl && typeof getComputedStyle === 'function') {
            padBottom = parseFloat(getComputedStyle(pageEl).paddingBottom) || 0;
        }
        if (!padBottom && mmPx) {
            padBottom = Math.round(4 * mmPx);
        }
        return Math.max(0, contentHpx - padBottom - SYLLABUS_TABLE_FIT_FUDGE_PX);
    }

    function isContinuationPrintPage(pageEl) {
        return Boolean(pageEl && pageEl.classList.contains('syllabus-a4-continuation-page'));
    }

    function stretchSyllabusTableRows(pageEl, contentHpx, mmPx) {
        if (isContinuationPrintPage(pageEl)) {
            return;
        }
        const title = pageEl.querySelector('.syllabus-pdf-title');
        const table = pageEl.querySelector('.syllabus-table');
        /* 진도표: equal row heights + overflow on cells draws horizontal rules through rowspan note column */
        if (table?.classList.contains('syllabus-table-jindo')) {
            return;
        }
        const tbody = table?.querySelector('tbody');
        const thead = table?.querySelector('thead');
        if (!table || !tbody) {
            return;
        }

        const fitHpx = getSyllabusStretchHeightPx(pageEl, contentHpx, mmPx);
        const titleH = title ? title.offsetHeight : 0;
        const tableTarget = fitHpx - titleH;
        if (tableTarget <= 0) {
            return;
        }
        table.style.height = `${Math.floor(tableTarget)}px`;
        table.dataset.syllabusScaled = '1';

        const theadH = thead ? thead.offsetHeight : 0;
        const tbodyTarget = tableTarget - theadH;
        if (tbodyTarget <= 0) {
            return;
        }

        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (!rows.length) {
            return;
        }

        const tbodyFit = Math.floor(tbodyTarget * 0.992);
        tbody.style.height = `${tbodyFit}px`;
        tbody.style.display = 'table-row-group';
        const tableFontPt = parseFloat(getComputedStyle(table).fontSize) || 13;
        const compactCap = Math.ceil(tableFontPt * 1.22 * SYLLABUS_PRINT_PLAN_LINE_CLAMP + 6);
        const evenRowH = tbodyFit / rows.length;
        const rowH = Math.min(evenRowH, compactCap);
        rows.forEach(tr => {
            tr.style.height = `${rowH}px`;
            tr.style.maxHeight = `${rowH}px`;
            tr.dataset.syllabusScaled = '1';
            tr.querySelectorAll('td').forEach((td) => {
                td.style.overflow = 'hidden';
                td.dataset.syllabusScaled = '1';
            });
        });
    }

    function scaleSyllabusPageToFit(pageEl, doc, contentWpx, contentHpx, mmPx) {
        resetSyllabusPageLayout(pageEl);
        pageEl.style.maxHeight = `${SYLLABUS_A4_PAGE.fitContentH}mm`;
        pageEl.style.paddingBottom = isContinuationPrintPage(pageEl) ? '4mm' : '4mm';
        void doc.body.offsetHeight;

        const isContinuation = isContinuationPrintPage(pageEl);
        let scale = 1;
        applySyllabusTypographyScale(pageEl, scale);
        if (!isContinuation) {
            stretchSyllabusTableRows(pageEl, contentHpx, mmPx);
        }
        void doc.body.offsetHeight;

        const fitHpx = getSyllabusStretchHeightPx(pageEl, contentHpx, mmPx);
        for (let pass = 0; pass < 10 && pageEl.scrollHeight > fitHpx + 2; pass += 1) {
            const step = fitHpx / pageEl.scrollHeight;
            scale *= step;
            if (scale < SYLLABUS_PRINT_SCALE_FLOOR) {
                scale = SYLLABUS_PRINT_SCALE_FLOOR;
            }
            applySyllabusTypographyScale(pageEl, scale);
            if (!isContinuation) {
                stretchSyllabusTableRows(pageEl, contentHpx, mmPx);
            }
            void doc.body.offsetHeight;
            if (scale <= SYLLABUS_PRINT_SCALE_FLOOR) {
                break;
            }
        }

        pageEl.style.height = 'auto';
        pageEl.style.minHeight = '0';
        pageEl.style.maxHeight = `${SYLLABUS_A4_PAGE.fitContentH}mm`;
        pageEl.style.boxSizing = 'border-box';
        pageEl.style.overflow = 'hidden';
        pageEl.style.paddingBottom = '3mm';

        const sheet = pageEl.closest('.syllabus-a4-sheet');
        if (sheet) {
            sheet.style.height = `${SYLLABUS_A4_PAGE.pageH}mm`;
            sheet.style.maxHeight = `${SYLLABUS_A4_PAGE.pageH}mm`;
            sheet.style.overflow = 'hidden';
            sheet.style.position = 'relative';
            sheet.style.display = 'block';
            sheet.style.clear = 'both';
            sheet.style.boxSizing = 'border-box';
        }

        return scale;
    }

    /**
     * Fit each syllabus sheet to one A4 page (same layout as print preview).
     * @returns {{ captureEls: Element[], sheetWpx: number, sheetHpx: number }}
     */
    function fitSyllabusPagesToA4(doc, a4) {
        const sheetWmm = a4.pageW;
        const sheetHmm = a4.pageH;
        const contentWmm = a4.contentW;
        const contentHmm = a4.contentH;
        const mmPx = measureMmToPx(doc);
        const sheetWpx = Math.round(sheetWmm * mmPx);
        const sheetHpx = Math.round(sheetHmm * mmPx);
        const { contentWpx, contentHpx } = getSyllabusFitDimensions(a4, mmPx);
        const sheets = Array.from(doc.querySelectorAll('.syllabus-a4-sheet'));
        const captureEls = [];

        sheets.forEach(sheet => {
            const pageEl = sheet.querySelector('.syllabus-a4-page');
            if (!pageEl) {
                return;
            }
            resetSyllabusPageLayout(pageEl);
        });

        void doc.body.offsetHeight;

        sheets.forEach(sheet => {
            const pageEl = sheet.querySelector('.syllabus-a4-page');
            if (!pageEl) {
                return;
            }
            scaleSyllabusPageToFit(pageEl, doc, contentWpx, contentHpx, mmPx);
            sheet.dataset.pdfCaptureWidth = String(sheetWpx);
            sheet.dataset.pdfCaptureHeight = String(sheetHpx);
            captureEls.push(sheet);
        });

        return { captureEls, sheetWpx, sheetHpx, contentWpx, contentHpx, mmPx, sheets };
    }

    /** Fit in-app print syllabus blocks (Print dialog, syllabus-only mode). */
    function fitSyllabusPrintClassBlocks(doc, a4) {
        const contentHmm = a4 ? a4.contentH : SYLLABUS_A4_PAGE.contentH;
        const mmPx = measureMmToPx(doc);
        const maxHpx = Math.round(contentHmm * mmPx);
        const blocks = Array.from(doc.querySelectorAll('.syllabus-print-class-block'));

        blocks.forEach(block => {
            block.style.transform = '';
            block.style.transformOrigin = '';
            block.style.width = '';
            block.style.height = '';
            const oldWrap = block.querySelector('.syllabus-print-fit-wrap');
            if (oldWrap) {
                while (oldWrap.firstChild) {
                    block.insertBefore(oldWrap.firstChild, oldWrap);
                }
                oldWrap.parentNode.removeChild(oldWrap);
            }
        });

        void doc.body.offsetHeight;

        blocks.forEach(block => {
            const naturalH = block.scrollHeight;
            const naturalW = block.scrollWidth || block.offsetWidth;
            if (naturalH <= maxHpx) {
                return;
            }
            const scale = maxHpx / naturalH;
            const wrap = doc.createElement('div');
            wrap.className = 'syllabus-print-fit-wrap';
            wrap.style.height = `${Math.ceil(naturalH * scale)}px`;
            wrap.style.overflow = 'hidden';
            while (block.firstChild) {
                wrap.appendChild(block.firstChild);
            }
            block.appendChild(wrap);
            wrap.style.transformOrigin = 'top left';
            wrap.style.transform = `scale(${scale})`;
            wrap.style.width = `${Math.ceil(naturalW / scale)}px`;
            block.style.height = `${Math.ceil(naturalH * scale)}px`;
        });

        return blocks.length;
    }

    /** @deprecated use fitSyllabusPagesToA4 */
    function prepareSyllabusPagesForPdfCapture(doc, a4) {
        return fitSyllabusPagesToA4(doc, a4);
    }

    function resetAllSyllabusFit(doc) {
        doc.querySelectorAll('.syllabus-a4-page').forEach(pageEl => resetSyllabusPageLayout(pageEl));
    }

    function renderSyllabusDocumentHtml(meta, sections, labels) {
        const L = labels || {};
        const a4Pdf = L.a4Pdf === true;
        const inner = renderSyllabusDocumentBody(meta, sections, labels);
        const body = a4Pdf
            ? `<div class="syllabus-pdf-export-root">${inner}</div>`
            : inner;
        const css = getSyllabusExportStyles(a4Pdf);
        const bodyClass = a4Pdf ? ' class="syllabus-a4-export"' : '';
        /* System fonts only — avoids blocked CDN font loads breaking PDF preview on network shares. */
        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${escapeHtml(meta.title || 'Syllabus')}</title><style>${css}</style></head><body${bodyClass}>${body}</body></html>`;
    }

    global.CCPSyllabus = {
        getSchoolWeekLabel,
        getSchoolWeekLabelCompact,
        getSchoolWeekMonday,
        formatMonthShortFromKey,
        buildSyllabusRowsFromSchedule,
        buildTimelineSlotsFromLessons,
        lessonDateToISO,
        getCurriculumLessonNumber,
        planDetailFromUnits,
        planDetailFromUnitRange,
        mergeSyllabusRows,
        normalizeRows,
        formatSyllabusShortDate,
        computeSyllabusCellMerges,
        renderSyllabusClassSectionHtml,
        renderSyllabusTableHtml,
        renderSyllabusDocumentBody,
        renderSyllabusDocumentHtml,
        getSyllabusExportStyles,
        measureMmToPx,
        computeSyllabusPageScale,
        SYLLABUS_A4_MARGIN_MM,
        SYLLABUS_A4_FIT_SAFETY_MM,
        SYLLABUS_A4_PAGE,
        getSyllabusFitDimensions,
        SYLLABUS_A4_COL_WIDTHS,
        SYLLABUS_JINDO_COL_WIDTHS,
        SYLLABUS_A4_REFERENCE,
        isJindoPdfLayout,
        shouldIncludeDetailAppendix,
        computeJindoCellMerges,
        computeJindoWeekDisplays,
        formatJindoDateMd,
        formatJindoMonthFromKey,
        findFirstJindoNotesRowIndex,
        buildPrintNotesColumnHtml,
        renderPlanCellJindo,
        syllabusRowNeedsContinuation,
        MIN_SYLLABUS_PRINT_SCALE,
        SYLLABUS_PRINT_SCALE_FLOOR,
        splitPlanDetailSections,
        extractCoveredLines,
        truncateHomeworkForPrint,
        buildMergedNotesHtml,
        stripRedundantPlanDetailLines,
        getLessonRowsForPrintContinuation,
        renderSyllabusContinuationSheets,
        renderPlanCellBrief,
        renderPlanCellFull,
        chunkContinuationItems,
        SYLLABUS_CONTINUATION_ITEMS_PER_PAGE,
        SYLLABUS_PRINT_PLAN_LINE_CLAMP,
        fitSyllabusPagesToA4,
        fitSyllabusPrintClassBlocks,
        resetAllSyllabusFit,
        prepareSyllabusPagesForPdfCapture,
        newRowId,
        rowKey
    };
})(typeof window !== 'undefined' ? window : globalThis);
