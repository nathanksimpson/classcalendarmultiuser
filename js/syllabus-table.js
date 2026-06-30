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
    /** Main grid only (notes table is a sibling; widths match 진도표 PDF proportions). */
    const SYLLABUS_JINDO_NOTES_COL_WIDTH = '15%';
    const SYLLABUS_JINDO_MAIN_GRID_WIDTH = '85%';
    /** month | week | date | plan — % of main grid (85% page); plan gets the rest */
    const SYLLABUS_JINDO_MAIN_COL_WIDTHS = ['11%', '9%', '10%', '70%'];
    /** Modern A4 main grid: Month | Week | Date | Lesson plan | Pages/detail */
    /** Modern teacher A4: main table columns (within flex main); note aside is separate. */
    const SYLLABUS_MODERN_NOTE_COL_WIDTH = '14%';
    const SYLLABUS_MODERN_MAIN_COL_WIDTHS = ['9%', '8%', '8%', '34%', '31%'];
    /** Reference row font for Print Styles A4 div layout (matches css/syllabus-print-a4.css). */
    const SYLLABUS_MODERN_PRINT_ROW_PX = 12.5;
    const SYLLABUS_MODERN_PRINT_HEAD_PX = 11;
    /** Extra px reserved so modern print footer + bottom border are not clipped. */
    const SYLLABUS_MODERN_PRINT_BOTTOM_FUDGE_PX = 10;
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
    /** 진도표 overview: single-line plan titles in the main table. */
    const SYLLABUS_JINDO_PLAN_LINE_CLAMP = 1;

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

    function formatModernPrintDate(dateStr) {
        return formatJindoDateMd(dateStr);
    }

    function renderModernPrintTitleBlock(L) {
        const title = escapeHtml(L.classTitle || '');
        const metaParts = [];
        if (L.subtitle) {
            metaParts.push(escapeHtml(L.subtitle));
        }
        if (L.termRange) {
            metaParts.push(`Term: ${escapeHtml(L.termRange)}`);
        }
        if (L.programLine) {
            metaParts.push(escapeHtml(L.programLine));
        }
        const metaHtml = metaParts.join(' · ');
        const pageLabel = L.pageLabel ? escapeHtml(L.pageLabel) : '';
        return '<div class="syllabus-print-title-block">'
            + '<div class="syllabus-print-title-block__main">'
            + `<div class="syllabus-print-title-block__name">${title} · Syllabus</div>`
            + (metaHtml ? `<div class="syllabus-print-title-block__meta">${metaHtml}</div>` : '')
            + '</div>'
            + (pageLabel ? `<div class="syllabus-print-title-block__page">${pageLabel}</div>` : '')
            + '</div>';
    }

    function renderModernPrintNoteAside(noteHeader, notesInnerHtml) {
        const header = escapeHtml(noteHeader || 'Notes');
        const body = notesInnerHtml || '';
        return '<aside class="syllabus-a4-print-note syllabus-modern-print-note" aria-label="' + header + '">'
            + `<div class="syllabus-a4-print-note__head syllabus-modern-print-note__head syllabus-th-note">${header}</div>`
            + `<div class="syllabus-a4-print-note__body syllabus-modern-print-note__body">${body}</div>`
            + '</aside>';
    }

    /** Modern A4 plan column: lesson title only (pages/detail is a separate column). */
    function renderModernPrintPlanCell(row) {
        const title = escapeHtml(row.planTitle || '');
        if (!title) {
            return '';
        }
        const kind = row.kind || 'lesson';
        if (kind === 'note') {
            return '';
        }
        return `<span class="syllabus-print-title">${title}</span>`;
    }

    /** Print Styles (A4) div rows — flat month/week (no rowspan). */
    function renderModernPrintDivRows(normalized, merge, labels) {
        const L = labels || {};
        const showDate = L.showDateColumn !== false;
        let html = '';
        normalized.forEach((row, i) => {
            const rowClass = syllabusRowClass(row);
            const rowStyleAttr = syllabusCellStyleAttr(row);
            const monthText = merge.monthRowspan[i] > 0 ? escapeHtml(merge.monthDisplays[i]) : '';
            const weekText = merge.weekRowspan[i] > 0 ? escapeHtml(merge.weekDisplays[i] || '') : '';
            const dateOrSessionDisplay = row.date
                ? formatModernPrintDate(row.date)
                : (row.kind !== 'note' && row.sessionNumber > 0 ? String(row.sessionNumber) : '');
            html += `<div class="syllabus-a4-print-row ${rowClass}"${rowStyleAttr}>`;
            html += `<div class="syllabus-a4-print-col-month">${monthText}</div>`;
            html += `<div class="syllabus-a4-print-col-week">${weekText}</div>`;
            if (showDate) {
                html += `<div class="syllabus-a4-print-col-date">${escapeHtml(dateOrSessionDisplay)}</div>`;
            }
            html += `<div class="syllabus-a4-print-col-plan">${renderModernPrintPlanCell(row)}</div>`;
            html += `<div class="syllabus-a4-print-col-pages">${renderPagesDetailCell(row)}</div>`;
            html += '</div>';
        });
        return html;
    }

    /** Print Styles (A4) standalone mockup layout (flex grid + note aside). */
    function renderModernPrintDivLayout(L, normalized, merge, modernNotesHtml) {
        const weekFormat = L.weekFormat || 'abbrev';
        const showDate = L.showDateColumn !== false;
        const weekFormatCls = weekFormat === 'index'
            ? ' syllabus-a4-print-week--index'
            : ' syllabus-a4-print-week--abbrev';
        const dateCls = showDate ? '' : ' syllabus-a4-print--no-date';
        let html = `<div class="syllabus-a4-print-grid syllabus-modern-print-shell${weekFormatCls}${dateCls}">`;
        html += '<div class="syllabus-a4-print-main syllabus-modern-print-main">';
        html += '<div class="syllabus-a4-print-head">';
        html += `<div class="syllabus-a4-print-col-month">${escapeHtml(L.colMonth || 'Month')}</div>`;
        html += `<div class="syllabus-a4-print-col-week">${escapeHtml(L.colWeek || 'Week')}</div>`;
        if (showDate) {
            html += `<div class="syllabus-a4-print-col-date">${escapeHtml(L.colDate || 'Date')}</div>`;
        }
        html += `<div class="syllabus-a4-print-col-plan">${escapeHtml(L.colPlanPrint || L.colPlan || 'Lesson plan')}</div>`;
        html += `<div class="syllabus-a4-print-col-pages">${escapeHtml(L.colPagesDetail || 'Pages / detail')}</div>`;
        html += '</div>';
        html += '<div class="syllabus-a4-print-body">';
        html += renderModernPrintDivRows(normalized, merge, L);
        html += '</div></div>';
        html += renderModernPrintNoteAside(L.colNote || 'Notes', modernNotesHtml);
        html += '</div>';
        html += '<div class="syllabus-print-footer">'
            + '<span>ClassManager · Header repeats on every page · rows never split across pages</span>'
            + '</div>';
        return html;
    }

    function renderPagesDetailCell(row) {
        const detail = String(row.planDetail || '').trim();
        if (!detail) {
            return '';
        }
        const sections = splitPlanDetailSections(detail);
        let covered = sections.covered || detail;
        covered = stripRedundantPlanDetailLines(row.planTitle, covered);
        return escapeHtml(covered);
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

    function resolvePrintGeneralNotes(classData, labels) {
        if (labels && labels.studentSyllabus === true) {
            return '';
        }
        const fromClass = classData && String(classData.syllabusGeneralNotes || '').trim();
        if (fromClass) {
            return fromClass;
        }
        if (global.CCPBooksEditor && typeof global.CCPBooksEditor.resolveSyllabusGeneralNotesForClass === 'function') {
            return global.CCPBooksEditor.resolveSyllabusGeneralNotesForClass(classData) || '';
        }
        return labels && labels.generalNotes ? String(labels.generalNotes).trim() : '';
    }

    /** General notes only for print (curriculum / class 비고). Per-lesson row notes are not printed. */
    function buildPrintGeneralNotesHtml(generalNotes) {
        const general = String(generalNotes ?? '').trim();
        if (!general) {
            return '';
        }
        return escapeHtml(general);
    }

    function buildPrintNotesColumnHtml(generalNotes) {
        const text = buildPrintGeneralNotesHtml(generalNotes);
        if (!text) {
            return '';
        }
        return `<div class="syllabus-jindo-note-body">${text}</div>`;
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

    /**
     * Drop syllabus editor note rows and empty placeholders from print/PDF tables.
     * General notes print in the 비고 column only; per-lesson row notes are for homework.
     */
    function filterRowsForPdfPrint(rows) {
        return (rows || []).filter((row) => {
            const kind = row.kind || 'lesson';
            if (kind === 'note' || row.overflowIntro === true) {
                return false;
            }
            const planTitle = String(row.planTitle || '').trim();
            const hasDate = Boolean(row.date);
            if (kind === 'holiday' || kind === 'event' || kind === 'extra' || kind === 'overflow') {
                return hasDate || Boolean(planTitle);
            }
            return hasDate || Boolean(planTitle);
        });
    }

    /**
     * Debate book-period print: keep dated rows within [rangeStartDate, rangeEndDate].
     * Drops editor notes, overflow intros, and undated skipped/unscheduled rows.
     */
    function filterRowsForDebatePeriod(rows, rangeStartDate, rangeEndDate) {
        const start = String(rangeStartDate || '');
        const end = String(rangeEndDate || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
            return [];
        }
        return (rows || []).filter((row) => {
            const kind = row.kind || 'lesson';
            if (kind === 'note' || row.overflowIntro === true) {
                return false;
            }
            if (!row.date) {
                return false;
            }
            const d = row.date;
            return d >= start && d <= end;
        });
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

    /** @deprecated rows ignored — print uses general notes only */
    function buildMergedNotesHtml(generalNotes) {
        return buildPrintGeneralNotesHtml(generalNotes);
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

    function getRowWeekDisplay(row, useFullMonth, carryWeek, useCompactWeek, options) {
        const opts = options || {};
        const weekFormat = opts.weekFormat || 'stored';
        if (weekFormat === 'abbrev' && row.date) {
            return getSchoolWeekLabel(row.date, false);
        }
        if (weekFormat === 'compact' && row.date) {
            return getSchoolWeekLabelCompact(row.date);
        }
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
     * @param {object} [options] - weekFormat: 'stored' | 'abbrev' | 'index' | 'compact'; useKoreanWeek for index
     */
    function computeSyllabusCellMerges(rows, useFullMonth, useCompactWeek, options) {
        const opts = options || {};
        const weekFormat = opts.weekFormat || 'stored';
        const n = rows.length;
        const monthDisplays = [];
        const weekDisplays = [];
        const monthRowspan = new Array(n).fill(0);
        const weekRowspan = new Array(n).fill(0);
        let carryMonth = '';
        let carryWeek = '';
        const indexWeekDisplays = weekFormat === 'index'
            ? computeJindoWeekDisplays(rows, opts.useKoreanWeek === true)
            : null;

        for (let i = 0; i < n; i += 1) {
            const row = rows[i];
            const month = getRowMonthDisplay(row, useFullMonth, carryMonth);
            let week;
            if (indexWeekDisplays) {
                week = indexWeekDisplays[i] || carryWeek;
            } else {
                week = getRowWeekDisplay(row, useFullMonth, carryWeek, useCompactWeek, opts);
            }
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

    function renderMergedMonthWeekCells(i, merge, usePdfMonthHeader, cellStyle, skipMonthColumn) {
        let html = '';
        if (!skipMonthColumn && merge.monthRowspan[i] > 0) {
            const cls = usePdfMonthHeader
                ? 'syllabus-col-month syllabus-col-year syllabus-cell-merged'
                : 'syllabus-col-month syllabus-cell-merged';
            html += `<td rowspan="${merge.monthRowspan[i]}" class="${cls}"${cellStyle}>${escapeHtml(merge.monthDisplays[i])}</td>`;
        }
        if (merge.weekRowspan[i] > 0) {
            const weekText = merge.weekDisplays[i] || '';
            const weekHtml = escapeHtml(weekText).replace(/\n/g, '<br>');
            html += `<td rowspan="${merge.weekRowspan[i]}" class="syllabus-col-week syllabus-cell-merged"${cellStyle}>${weekHtml}</td>`;
        }
        return html;
    }

    function renderJindoNotesSideTableHtml(noteHeader, notesInnerHtml) {
        const header = escapeHtml(noteHeader || 'Note');
        const body = notesInnerHtml || '';
        return `<table class="syllabus-table syllabus-table-pdf syllabus-table-jindo-notes" aria-label="${header}">`
            + '<colgroup><col></colgroup>'
            + '<thead><tr>'
            + `<th class="syllabus-th-note syllabus-jindo-notes-th">${header}</th>`
            + '</tr></thead><tbody><tr>'
            + `<td class="syllabus-jindo-notes-body-cell">${body}</td>`
            + '</tr></tbody></table>';
    }

    function renderSyllabusClassSectionHtml(classData, rows, scheduleAdjustments, labels) {
        return renderSyllabusTableHtml(classData, rows, labels);
    }

    function renderSyllabusTableHtml(classData, rows, labels) {
        const L = labels || {};
        const pdfLayout = L.pdfLayout === true;
        const jindoLayout = pdfLayout && isJindoPdfLayout(L);
        const studentLayout = jindoLayout && L.studentSyllabus === true;
        const modernPdf = jindoLayout && !studentLayout;
        const printRows = pdfLayout ? filterRowsForPdfPrint(rows) : rows;
        const normalized = normalizeRows(printRows);
        const useFullMonth = !pdfLayout;
        const useCompactWeek = pdfLayout && !jindoLayout;
        const weekFormat = L.weekFormat || (modernPdf ? 'abbrev' : 'stored');
        const merge = modernPdf
            ? computeSyllabusCellMerges(normalized, false, false, {
                weekFormat,
                useKoreanWeek: L.useKoreanJindo === true
            })
            : jindoLayout
                ? computeJindoCellMerges(normalized, L)
                : computeSyllabusCellMerges(normalized, useFullMonth, useCompactWeek);
        const jindoNotesHtml = jindoLayout && !studentLayout && !modernPdf
            ? buildPrintNotesColumnHtml(L.generalNotes)
            : '';
        const modernNotesHtml = modernPdf
            ? buildPrintGeneralNotesHtml(L.generalNotes)
            : '';

        let headerBlock = '';
        if (L.generalNotes && !pdfLayout) {
            const notesHtml = escapeHtml(L.generalNotes).replace(/\n/g, '<br>');
            headerBlock += `<div class="syllabus-general-notes-print">${notesHtml}</div>`;
        }
        if (L.classTitle || L.jindoTitle) {
            if (pdfLayout) {
                if (modernPdf && (L.classTitle || L.jindoTitle)) {
                    headerBlock += renderModernPrintTitleBlock({
                        ...L,
                        classTitle: L.classTitle || L.jindoTitle
                    });
                } else {
                    const titleText = (jindoLayout && L.jindoTitle) ? L.jindoTitle : L.classTitle;
                    const titleCls = jindoLayout
                        ? 'syllabus-pdf-title syllabus-jindo-title'
                        : 'syllabus-pdf-title';
                    headerBlock += `<h2 class="${titleCls}">${escapeHtml(titleText || '')}</h2>`;
                }
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
            jindoLayout ? 'syllabus-table-jindo syllabus-table-jindo-main' : ''
        ].filter(Boolean).join(' ');
        const gridStudentClass = studentLayout ? ' syllabus-jindo-print-grid--student' : '';
        const gridOpen = pdfLayout && jindoLayout && !modernPdf
            ? `<div class="syllabus-jindo-print-grid${gridStudentClass}">`
            : '';
        const gridClose = pdfLayout && jindoLayout && !modernPdf ? '</div>' : '';

        if (modernPdf) {
            return headerBlock + renderModernPrintDivLayout(L, normalized, merge, modernNotesHtml);
        }

        let html = `${headerBlock}${gridOpen}<table class="${tableClass}">`;
        if (pdfLayout) {
            html += '<colgroup>';
            const colWidths = jindoLayout ? SYLLABUS_JINDO_MAIN_COL_WIDTHS : SYLLABUS_A4_COL_WIDTHS;
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
            if (!jindoLayout) {
                html += `<th class="syllabus-th-note">${escapeHtml(L.colNote || 'Note')}</th>`;
            }
        } else {
            html += `<th>${escapeHtml(L.colMonth || 'Month')}</th>`;
            html += `<th>${escapeHtml(L.colWeek || 'Week')}</th>`;
            html += `<th>${escapeHtml(L.colClass || 'Class')}</th>`;
            html += `<th>${escapeHtml(L.colPlan || 'Weekly Lesson Plan')}</th>`;
            html += `<th>${escapeHtml(L.colNote || 'Note')}</th>`;
        }
        html += `</tr></thead><tbody>`;

        const rowCount = normalized.length;
        const legacyPrintNotesHtml = pdfLayout && !jindoLayout
            ? buildPrintGeneralNotesHtml(L.generalNotes)
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
            html += renderMergedMonthWeekCells(i, merge, pdfLayout, cellStyle, false);
            const dateColClass = jindoLayout
                ? 'syllabus-col-date syllabus-col-class'
                : 'syllabus-col-class';
            html += `<td class="${dateColClass}"${cellStyle}>${escapeHtml(dateOrSessionDisplay)}</td>`;
            html += `<td class="syllabus-col-plan"${cellStyle}>${renderPlanCell(row, {
                printMode: pdfLayout && !jindoLayout,
                jindoMode: jindoLayout
            })}</td>`;
            if (pdfLayout && !jindoLayout) {
                if (i === 0 && rowCount > 0) {
                    html += `<td rowspan="${rowCount}" class="syllabus-col-note syllabus-note-merged"${cellStyle}>${legacyPrintNotesHtml}</td>`;
                }
            } else if (!pdfLayout) {
                html += `<td class="syllabus-col-note"${cellStyle}>${escapeHtml(row.note || '')}</td>`;
            }
            html += '</tr>';
        });

        html += '</tbody></table>';
        if (pdfLayout && jindoLayout && !studentLayout && !modernPdf) {
            html += renderJindoNotesSideTableHtml(L.colNote || 'Note', jindoNotesHtml);
        }
        html += gridClose;
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
.syllabus-table-jindo-main .syllabus-col-week.syllabus-cell-merged,
.syllabus-table-jindo-main .syllabus-col-month.syllabus-cell-merged {
  white-space: nowrap;
  word-break: keep-all;
  overflow-wrap: normal;
  hyphens: none;
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

    const SYLLABUS_PRINT_A4_CSS = `
/* SYLLABUS_PRINT_A4_CSS_START */
/**

 * Syllabus A4 portrait print — source of truth from Print Styles (A4) standalone mockup.

 * Synced into js/syllabus-table.js export CSS via npm run css:split.

 */



/* Page shell (screen preview + export) */

.syllabus-a4-print-page {

  width: 100%;

  box-sizing: border-box;

  display: flex;

  flex-direction: column;

}



/* Title block */

.syllabus-print-title-block {

  display: flex;

  align-items: flex-end;

  justify-content: space-between;

  padding-bottom: 12px;

  border-bottom: 2px solid #1c2430;

  margin-bottom: 14px;

  flex-shrink: 0;

}

.syllabus-print-title-block__name {

  font-size: 20px;

  font-weight: 700;

  color: #1c2430;

  line-height: 1.15;

}

.syllabus-print-title-block__meta {

  font-size: 12px;

  color: #5a6a80;

  margin-top: 2px;

}

.syllabus-print-title-block__page {

  font-size: 11px;

  color: #8893a3;

  white-space: nowrap;

}



/* Main grid: lesson table + note aside */

.syllabus-a4-print-grid,

.syllabus-modern-print-shell {

  border: 1px solid #c9d2dd;

  border-radius: 6px;

  overflow: hidden;

  flex: 0 0 auto;

  display: flex;

  flex-direction: row;

  align-items: stretch;

  min-height: 0;

  box-sizing: border-box;

  width: 100%;

}



.syllabus-a4-print-main,

.syllabus-modern-print-main {

  flex: 1 1 0;

  min-width: 0;

  display: flex;

  flex-direction: column;

  border-right: 1px solid #c9d2dd;

}



/* Header row */

.syllabus-a4-print-head {

  display: flex;

  background: #f4f6f9;

  border-bottom: 1px solid #c9d2dd;

  font-size: 11px;

  font-weight: 700;

  letter-spacing: 0.04em;

  color: #5a6a80;

  text-transform: uppercase;

  flex-shrink: 0;

}

.syllabus-a4-print-head .syllabus-a4-print-col-month {

  width: 44px;

  padding: 8px 4px;

  border-right: 1px solid #e3e8ef;

  box-sizing: border-box;

  letter-spacing: 0.02em;

  white-space: nowrap;

  overflow: visible;

  text-overflow: clip;

}

.syllabus-a4-print-head .syllabus-a4-print-col-week {

  width: 58px;

  padding: 8px 4px;

  border-right: 1px solid #e3e8ef;

  box-sizing: border-box;

  letter-spacing: 0.02em;

  white-space: nowrap;

  overflow: visible;

  text-overflow: clip;

}

.syllabus-a4-print-week--index .syllabus-a4-print-head .syllabus-a4-print-col-week {

  width: 36px;

}

.syllabus-a4-print-head .syllabus-a4-print-col-date {

  width: 62px;

  padding: 8px 4px;

  border-right: 1px solid #e3e8ef;

  box-sizing: border-box;

  letter-spacing: 0.02em;

}

.syllabus-a4-print-head .syllabus-a4-print-col-plan {

  flex: 1 1 0;

  padding: 8px 10px;

  border-right: 1px solid #e3e8ef;

  box-sizing: border-box;

  min-width: 0;

}

.syllabus-a4-print-head .syllabus-a4-print-col-pages {

  flex: 1 1 0;

  padding: 8px 10px;

  box-sizing: border-box;

  min-width: 0;

}



/* Body rows */

.syllabus-a4-print-body {

  display: flex;

  flex-direction: column;

  flex: 1 1 auto;

  min-height: 0;

}

.syllabus-a4-print-row {

  flex: 1 1 0;

  display: flex;

  border-bottom: 1px solid #eef1f5;

  font-size: 12.5px;

  line-height: 1.25;

  align-items: center;

  min-height: 0;

  box-sizing: border-box;

}

.syllabus-a4-print-row:last-child {

  border-bottom: none;

}

.syllabus-a4-page .syllabus-a4-print-row:last-child {

  border-bottom: 1px solid #eef1f5;

}

.syllabus-a4-print-row .syllabus-a4-print-col-month {

  width: 40px;

  padding: 6px 4px;

  border-right: 1px solid #eef1f5;

  font-weight: 700;

  font-size: 11px;

  color: #5a6a80;

  box-sizing: border-box;

  flex-shrink: 0;

}

.syllabus-a4-print-row .syllabus-a4-print-col-week {

  width: 58px;

  padding: 6px 4px;

  border-right: 1px solid #eef1f5;

  color: #5a6a80;

  box-sizing: border-box;

  flex-shrink: 0;

}

.syllabus-a4-print-week--index .syllabus-a4-print-row .syllabus-a4-print-col-week {

  width: 36px;

}

.syllabus-a4-print-week--abbrev .syllabus-a4-print-row .syllabus-a4-print-col-week {

  white-space: nowrap;

  overflow: hidden;

  text-overflow: ellipsis;

}

.syllabus-a4-print-row .syllabus-a4-print-col-date {

  width: 62px;

  padding: 6px 4px;

  border-right: 1px solid #eef1f5;

  color: #33414f;

  font-weight: 600;

  box-sizing: border-box;

  flex-shrink: 0;

}

.syllabus-a4-print-row .syllabus-a4-print-col-plan {

  flex: 1 1 0;

  padding: 8px 10px;

  border-right: 1px solid #eef1f5;

  color: #1c2430;

  font-weight: 600;

  box-sizing: border-box;

  min-width: 0;

  overflow: hidden;

  line-height: 1.25;

  white-space: nowrap;

  text-overflow: ellipsis;

}

.syllabus-a4-print-row .syllabus-a4-print-col-pages {

  flex: 1 1 0;

  padding: 8px 10px;

  color: #33414f;

  box-sizing: border-box;

  min-width: 0;

  overflow: hidden;

  line-height: 1.25;

  white-space: nowrap;

  text-overflow: ellipsis;

}



/* Row kinds (Print Styles mockup) */

.syllabus-a4-print-row.syllabus-row-holiday {

  background: #fef3c7;

}

.syllabus-a4-print-row.syllabus-row-holiday .syllabus-a4-print-col-date,

.syllabus-a4-print-row.syllabus-row-holiday .syllabus-a4-print-col-plan {

  color: #b07d18;

  font-weight: 700;

}

.syllabus-a4-print-row.syllabus-row-holiday .syllabus-a4-print-col-plan,

.syllabus-a4-print-row.syllabus-row-holiday .syllabus-a4-print-col-pages {

  white-space: normal;

  text-overflow: clip;

  display: -webkit-box;

  -webkit-line-clamp: 2;

  -webkit-box-orient: vertical;

}

.syllabus-a4-print-row.syllabus-row-test td,

.syllabus-a4-print-row.syllabus-row-evaluation_deadline {

  box-shadow: inset 4px 0 0 #c0392b;

}

.syllabus-a4-print-row.syllabus-row-test .syllabus-a4-print-col-date,

.syllabus-a4-print-row.syllabus-row-test .syllabus-a4-print-col-plan,

.syllabus-a4-print-row.syllabus-row-evaluation_deadline .syllabus-a4-print-col-date,

.syllabus-a4-print-row.syllabus-row-evaluation_deadline .syllabus-a4-print-col-plan {

  color: #c0392b;

  font-weight: 700;

}



/* Note aside */

.syllabus-a4-print-note,

.syllabus-modern-print-note {

  width: 200px;

  flex: 0 0 200px;

  max-width: 200px;

  display: flex;

  flex-direction: column;

  background: #fcfdfe;

  box-sizing: border-box;

}

.syllabus-a4-print-note__head,

.syllabus-modern-print-note__head {

  padding: 8px 10px;

  background: #f4f6f9;

  border-bottom: 1px solid #c9d2dd;

  font-size: 11px;

  font-weight: 700;

  letter-spacing: 0.04em;

  color: #5a6a80;

  text-transform: uppercase;

  box-sizing: border-box;

  display: flex;

  align-items: center;

  flex-shrink: 0;

}

.syllabus-a4-print-note__body,

.syllabus-modern-print-note__body {

  flex: 1 1 auto;

  padding: 11px 12px;

  font-size: 12px;

  color: #33414f;

  line-height: 1.55;

  white-space: pre-line;

  overflow: hidden;

  box-sizing: border-box;

}



.syllabus-print-footer {

  display: flex;

  justify-content: space-between;

  padding-top: 10px;

  font-size: 10px;

  color: #8893a3;

  flex-shrink: 0;

}



.syllabus-print-plan-brief {

  display: -webkit-box;

  -webkit-line-clamp: 2;

  -webkit-box-orient: vertical;

  overflow: hidden;
  line-height: 1.2;
  word-break: break-word;
}

/* A4 fitted page overrides */
.syllabus-a4-page .syllabus-a4-print-grid,
.syllabus-a4-page .syllabus-modern-print-shell {
  border: 1px solid #c9d2dd;
  border-radius: 0;
  width: 100%;
  max-width: 100%;
  overflow: visible;
  flex: 0 0 auto;
}
.syllabus-a4-page .syllabus-a4-print-main,
.syllabus-a4-page .syllabus-modern-print-main {
  border-right: 0;
  flex: 1 1 0;
  min-width: 0;
  overflow: visible;
}
.syllabus-a4-page .syllabus-a4-print-note,
.syllabus-a4-page .syllabus-modern-print-note {
  position: relative;
  flex: 0 0 200px;
  width: 200px;
  max-width: 200px;
  overflow: hidden;
}
.syllabus-a4-page .syllabus-a4-print-note__body,
.syllabus-a4-page .syllabus-modern-print-note__body {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  border-right: 1px solid #c9d2dd;
  border-bottom: 1px solid #c9d2dd;
  flex: none;
}
.syllabus-a4-page .syllabus-class-block:has(.syllabus-a4-print-grid),
.syllabus-a4-page .syllabus-class-block:has(.syllabus-modern-print-shell) {
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.syllabus-a4-page .syllabus-print-footer {
  flex: 0 0 auto;
  flex-shrink: 0;
}
/* SYLLABUS_PRINT_A4_CSS_END */
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
  padding: 0 0 5mm 0;
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
.syllabus-jindo-print-grid {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  gap: 0;
  box-sizing: border-box;
  border: 2px solid #111;
  overflow: hidden;
}
.syllabus-jindo-print-grid .syllabus-table-jindo-main,
.syllabus-jindo-print-grid .syllabus-table-jindo-notes {
  border-collapse: collapse !important;
  border-spacing: 0 !important;
  border: 0 !important;
  margin: 0;
  table-layout: fixed;
}
.syllabus-jindo-print-grid .syllabus-table-jindo-main {
  flex: 0 0 ${SYLLABUS_JINDO_MAIN_GRID_WIDTH};
  width: ${SYLLABUS_JINDO_MAIN_GRID_WIDTH};
  max-width: ${SYLLABUS_JINDO_MAIN_GRID_WIDTH};
  min-width: 0;
}
.syllabus-jindo-print-grid--student .syllabus-table-jindo-main {
  flex: 0 0 100%;
  width: 100%;
  max-width: 100%;
}
.syllabus-jindo-print-grid .syllabus-table-jindo-notes {
  flex: 0 0 ${SYLLABUS_JINDO_NOTES_COL_WIDTH};
  width: ${SYLLABUS_JINDO_NOTES_COL_WIDTH};
  max-width: ${SYLLABUS_JINDO_NOTES_COL_WIDTH};
  min-width: 0;
  height: 100%;
}
.syllabus-jindo-print-grid .syllabus-table-jindo-main th,
.syllabus-jindo-print-grid .syllabus-table-jindo-main td,
.syllabus-jindo-print-grid .syllabus-table-jindo-notes th,
.syllabus-jindo-print-grid .syllabus-table-jindo-notes td {
  border: 1px solid #333;
  box-sizing: border-box;
}
.syllabus-jindo-print-grid .syllabus-table-jindo-notes th,
.syllabus-jindo-print-grid .syllabus-table-jindo-notes td {
  border-left-width: 0;
}
.syllabus-jindo-print-grid .syllabus-table-jindo-main thead tr:first-child th {
  border-top-width: 0;
}
.syllabus-jindo-print-grid .syllabus-table-jindo-notes thead tr:first-child th {
  border-top-width: 0;
}
.syllabus-jindo-print-grid .syllabus-table-jindo-main tbody tr:last-child td {
  border-bottom-width: 0;
}
.syllabus-jindo-print-grid .syllabus-table-jindo-notes tbody tr:last-child td {
  border-bottom-width: 0;
}
.syllabus-jindo-print-grid .syllabus-table-jindo-main th:first-child,
.syllabus-jindo-print-grid .syllabus-table-jindo-main td:first-child {
  border-left-width: 0;
}
.syllabus-jindo-print-grid .syllabus-table-jindo-notes th,
.syllabus-jindo-print-grid .syllabus-table-jindo-notes td {
  border-right-width: 0;
}
.syllabus-table-jindo-notes .syllabus-jindo-notes-th {
  background: #f3f4f6;
  font-weight: 600;
  text-align: left;
  vertical-align: middle;
  border: 1px solid #333;
  box-sizing: border-box;
}
.syllabus-table-jindo-notes .syllabus-jindo-notes-body-cell {
  position: relative;
  vertical-align: top;
  padding: 0;
  overflow: hidden;
  border: 1px solid #333;
  box-sizing: border-box;
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
.syllabus-jindo-print-grid .syllabus-table-jindo-main,
.syllabus-jindo-print-grid .syllabus-table-jindo-notes {
  font-size: 10pt;
  line-height: 1.2;
}
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
.syllabus-table-jindo-main .syllabus-th-year,
.syllabus-table-jindo-main .syllabus-th-week,
.syllabus-table-jindo-main .syllabus-th-date,
.syllabus-table-jindo-main .syllabus-th-class {
  white-space: nowrap;
  word-break: keep-all;
  overflow-wrap: normal;
}
.syllabus-table-jindo-main .syllabus-col-month,
.syllabus-table-jindo-main .syllabus-col-year,
.syllabus-table-jindo-main .syllabus-col-week,
.syllabus-table-jindo-main .syllabus-col-date,
.syllabus-table-jindo-main .syllabus-col-class {
  white-space: nowrap;
  word-break: keep-all;
  overflow-wrap: normal;
}
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
.syllabus-table-jindo .syllabus-col-plan { overflow: hidden; }
.syllabus-table-jindo .syllabus-col-plan .syllabus-print-title {
  font-weight: 600;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.syllabus-a4-page .syllabus-note-merged,
.syllabus-a4-page .syllabus-col-note.syllabus-note-merged,
.syllabus-a4-page .syllabus-jindo-note {
  font-size: 8.5pt;
  line-height: 1.25;
}
.syllabus-table-jindo-main,
.syllabus-table-jindo-notes {
  border-collapse: collapse;
  border-spacing: 0;
}
.syllabus-table-jindo:not(.syllabus-table-jindo-main):not(.syllabus-table-jindo-notes) {
  border-collapse: separate;
  border-spacing: 0;
}
.syllabus-table-jindo th,
.syllabus-table-jindo td {
  border: 1px solid #333;
  box-sizing: border-box;
}
.syllabus-table-jindo td.syllabus-jindo-note.syllabus-note-merged {
  font-size: 8.5pt;
  vertical-align: top;
  word-break: break-word;
  overflow: hidden;
  background: #fff;
  padding: 0;
  position: relative;
}
.syllabus-jindo-note-body {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  box-sizing: border-box;
  padding: 4px 5px;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  line-height: 1.35;
  text-align: left;
  overflow: hidden;
}
.syllabus-table-jindo .syllabus-jindo-note-span {
  border-bottom: 1px solid #333;
}
.syllabus-a4-page .syllabus-table-jindo .syllabus-note-merged,
.syllabus-a4-page .syllabus-table-jindo td.syllabus-jindo-note {
  -webkit-line-clamp: unset !important;
  max-height: none !important;
  vertical-align: top !important;
  overflow: hidden !important;
}
.syllabus-a4-page .syllabus-table-jindo tbody tr td.syllabus-col-plan,
.syllabus-a4-page .syllabus-table-jindo tbody tr td.syllabus-col-date,
.syllabus-a4-page .syllabus-table-jindo tbody tr td.syllabus-col-class {
  border-bottom: 1px solid #333;
  vertical-align: middle;
}
.syllabus-a4-page .syllabus-table-jindo tbody tr td.syllabus-cell-merged {
  vertical-align: middle;
}
.syllabus-a4-page .syllabus-table-jindo tbody tr:last-child td.syllabus-col-plan,
.syllabus-a4-page .syllabus-table-jindo tbody tr:last-child td.syllabus-col-date,
.syllabus-a4-page .syllabus-table-jindo tbody tr:last-child td.syllabus-cell-merged {
  border-bottom: 1px solid #333;
}
.syllabus-table-jindo .syllabus-col-date { text-align: center; white-space: nowrap; font-size: 9pt; }
.syllabus-table-jindo-main .syllabus-col-week.syllabus-cell-merged { font-size: 8.5pt; }
.syllabus-table-jindo td.syllabus-jindo-year-span {
  vertical-align: top;
  background: #fff;
  padding: 0;
}
.syllabus-table-jindo-main .syllabus-col-month.syllabus-cell-merged,
.syllabus-table-jindo-main .syllabus-col-year.syllabus-cell-merged {
  font-size: 9pt;
  font-weight: 600;
  white-space: nowrap;
  padding-left: 4px;
  padding-right: 4px;
}
.syllabus-a4-page .syllabus-table-jindo-main .syllabus-th-year {
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
        return a4Pdf ? `${EXPORT_CSS}\n${SYLLABUS_PRINT_A4_CSS}\n${A4_PDF_CSS}` : EXPORT_CSS;
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

    function isSyllabusNoteCell(el) {
        if (!el || !el.classList) {
            return false;
        }
        return el.classList.contains('syllabus-col-note')
            || el.classList.contains('syllabus-note-merged')
            || el.classList.contains('syllabus-jindo-note')
            || el.classList.contains('syllabus-modern-print-note__body');
    }

    function normalizeSyllabusPrintScales(lessonGroupScale, noteScale) {
        let lesson = lessonGroupScale;
        let note = noteScale;
        if (note === undefined || note === null) {
            note = lesson;
        }
        if (lesson === undefined || lesson === null) {
            lesson = note;
        }
        return { lessonGroupScale: lesson, noteScale: note };
    }

    function clearSyllabusTypographyScale(pageEl) {
        pageEl.style.height = '';
        pageEl.style.minHeight = '';
        pageEl.style.maxHeight = '';
        pageEl.style.paddingBottom = '';
        pageEl.style.boxSizing = '';
        pageEl.style.overflow = '';
        pageEl.removeAttribute('data-syllabus-scale');
        pageEl.removeAttribute('data-syllabus-lesson-scale');
        pageEl.removeAttribute('data-syllabus-note-scale');
        const grid = pageEl.querySelector('.syllabus-jindo-print-grid');
        if (grid) {
            grid.style.height = '';
            grid.style.display = '';
            grid.style.flex = '';
            grid.style.minHeight = '';
            grid.style.alignItems = '';
        }
        const modernShell = pageEl.querySelector('.syllabus-modern-print-shell');
        if (modernShell) {
            modernShell.style.height = '';
            modernShell.style.display = '';
            modernShell.style.flex = '';
            modernShell.style.minHeight = '';
            modernShell.style.overflow = '';
        }
        pageEl.querySelectorAll('[data-syllabus-scaled]').forEach(el => {
            el.style.fontSize = '';
            el.style.lineHeight = '';
            el.style.padding = '';
            el.style.marginBottom = '';
            el.style.marginTop = '';
            el.style.height = '';
            el.style.minHeight = '';
            el.style.maxHeight = '';
            el.style.flexShrink = '';
            el.style.overflow = '';
            el.style.verticalAlign = '';
            el.style.position = '';
            el.style.top = '';
            el.style.right = '';
            el.style.bottom = '';
            el.style.left = '';
            el.style.flex = '';
            el.style.flexGrow = '';
            el.style.flexShrink = '';
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
        pageEl.querySelectorAll('.syllabus-table tbody tr').forEach(tr => {
            tr.style.height = '';
            tr.style.maxHeight = '';
        });
    }

    function applySyllabusTypographyScale(pageEl, lessonGroupScale, noteScale) {
        const scales = normalizeSyllabusPrintScales(lessonGroupScale, noteScale);
        const lessonScale = scales.lessonGroupScale;
        const noteScaleFinal = scales.noteScale;
        const base = getSyllabusTypographyBase(pageEl);
        pageEl.setAttribute('data-syllabus-lesson-scale', String(lessonScale));
        pageEl.setAttribute('data-syllabus-note-scale', String(noteScaleFinal));
        pageEl.setAttribute('data-syllabus-scale', String(lessonScale));

        const title = pageEl.querySelector('.syllabus-pdf-title');
        const titleBlock = pageEl.querySelector('.syllabus-print-title-block');
        if (titleBlock) {
            const nameEl = titleBlock.querySelector('.syllabus-print-title-block__name');
            const metaEl = titleBlock.querySelector('.syllabus-print-title-block__meta');
            const pageEl2 = titleBlock.querySelector('.syllabus-print-title-block__page');
            if (nameEl) {
                nameEl.style.fontSize = `${(base.title + 2) * lessonScale}pt`;
                nameEl.dataset.syllabusScaled = '1';
            }
            if (metaEl) {
                metaEl.style.fontSize = `${base.table * lessonScale}pt`;
                metaEl.dataset.syllabusScaled = '1';
            }
            if (pageEl2) {
                pageEl2.style.fontSize = `${(base.table - 1) * lessonScale}pt`;
                pageEl2.dataset.syllabusScaled = '1';
            }
            titleBlock.dataset.syllabusScaled = '1';
        } else if (title) {
            title.style.fontSize = `${base.title * lessonScale}pt`;
            title.style.marginBottom = `${base.titleMarginMm * lessonScale}mm`;
            title.style.textAlign = 'center';
            title.dataset.syllabusScaled = '1';
        }

        const table = pageEl.querySelector('.syllabus-table');
        if (table) {
            table.style.fontSize = `${base.table * lessonScale}pt`;
            table.style.lineHeight = String(base.lineHeight);
            table.dataset.syllabusScaled = '1';
        }

        const modernMain = pageEl.querySelector('.syllabus-a4-print-main');
        if (modernMain) {
            const rowPx = SYLLABUS_MODERN_PRINT_ROW_PX * lessonScale;
            const headPx = SYLLABUS_MODERN_PRINT_HEAD_PX * lessonScale;
            modernMain.querySelectorAll('.syllabus-a4-print-head').forEach((head) => {
                head.style.fontSize = `${headPx}px`;
                head.style.lineHeight = '1.2';
                head.dataset.syllabusScaled = '1';
            });
            modernMain.querySelectorAll('.syllabus-a4-print-row').forEach((row) => {
                row.style.fontSize = `${rowPx}px`;
                row.style.lineHeight = '1.25';
                row.dataset.syllabusScaled = '1';
            });
        }

        pageEl.querySelectorAll('.syllabus-table th, .syllabus-a4-print-head, .syllabus-a4-print-note__head, .syllabus-modern-print-note__head.syllabus-th-note').forEach(th => {
            if (modernMain && th.closest('.syllabus-a4-print-main')) {
                return;
            }
            const scale = th.classList.contains('syllabus-th-note') ? noteScaleFinal : lessonScale;
            th.style.fontSize = `${base.th * scale}pt`;
            const padScale = th.classList.contains('syllabus-th-note') ? noteScaleFinal : lessonScale;
            th.style.padding = `${base.cellPadY * padScale}px ${base.cellPadX * padScale}px`;
            th.dataset.syllabusScaled = '1';
        });

        pageEl.querySelectorAll('.syllabus-table td').forEach(td => {
            const scale = isSyllabusNoteCell(td) ? noteScaleFinal : lessonScale;
            td.style.fontSize = `${base.table * scale}pt`;
            td.style.padding = `${base.cellPadY * scale}px ${base.cellPadX * scale}px`;
            td.dataset.syllabusScaled = '1';
        });

        pageEl.querySelectorAll(
            '.syllabus-col-month, .syllabus-col-year, .syllabus-col-week, '
            + '.syllabus-col-date, .syllabus-col-class, .syllabus-col-plan, '
            + '.syllabus-a4-print-head, .syllabus-a4-print-row, '
            + '.syllabus-a4-print-col-month, .syllabus-a4-print-col-week, '
            + '.syllabus-a4-print-col-date, .syllabus-a4-print-col-plan, .syllabus-a4-print-col-pages'
        ).forEach(el => {
            if (modernMain && el.closest('.syllabus-a4-print-main')) {
                return;
            }
            el.style.fontSize = `${base.table * lessonScale}pt`;
            el.dataset.syllabusScaled = '1';
        });

        pageEl.querySelectorAll(
            '.syllabus-print-title, .syllabus-print-plan-brief, .syllabus-print-lesson-num, '
            + '.syllabus-plan-detail, .syllabus-plan-subline, .syllabus-print-covered, '
            + '.syllabus-print-homework-full'
        ).forEach(el => {
            if (modernMain && el.closest('.syllabus-a4-print-main')) {
                return;
            }
            if (el.closest('.syllabus-col-note, .syllabus-note-merged, .syllabus-jindo-note')) {
                return;
            }
            const subline = el.classList.contains('syllabus-plan-detail')
                || el.classList.contains('syllabus-plan-subline')
                || el.classList.contains('syllabus-print-covered')
                || el.classList.contains('syllabus-print-homework-full');
            const pt = subline ? base.subline : base.table;
            el.style.fontSize = `${pt * lessonScale}pt`;
            el.style.marginTop = subline ? `${1 * lessonScale}px` : '';
            el.dataset.syllabusScaled = '1';
        });

        pageEl.querySelectorAll('.syllabus-continuation-item-body').forEach(el => {
            el.style.fontSize = `${base.subline * lessonScale}pt`;
            el.style.marginTop = `${1 * lessonScale}px`;
            el.dataset.syllabusScaled = '1';
        });

        pageEl.querySelectorAll(
            '.syllabus-table-jindo-notes .syllabus-jindo-notes-th, '
            + '.syllabus-table-jindo-notes .syllabus-jindo-notes-body-cell, '
            + '.syllabus-jindo-note-body, '
            + '.syllabus-col-note, .syllabus-note-merged, '
            + '.syllabus-a4-print-note__body, .syllabus-modern-print-note__body'
        ).forEach(el => {
            el.style.fontSize = `${base.table * noteScaleFinal}pt`;
            el.style.lineHeight = '1.35';
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

    function measureModernPrintGridHeight(mainTable) {
        if (!mainTable) {
            return 0;
        }
        void mainTable.offsetHeight;
        const scrollH = mainTable.scrollHeight || 0;
        const offsetH = mainTable.offsetHeight || 0;
        return Math.max(scrollH, offsetH);
    }

    function getModernPrintPageContentHeightPx(pageEl) {
        const title = pageEl.querySelector('.syllabus-print-title-block, .syllabus-pdf-title');
        const footer = pageEl.querySelector('.syllabus-print-footer');
        const main = pageEl.querySelector('.syllabus-a4-print-main, .syllabus-table-modern');
        const titleH = title ? title.offsetHeight : 0;
        const footerH = footer ? footer.offsetHeight : 0;
        const tableH = main ? measureModernPrintGridHeight(main) : 0;
        return titleH + tableH + footerH;
    }

    function distributeStretchRowHeights(rows, tbodyFit) {
        const n = rows.length;
        if (!n || tbodyFit <= 0) {
            return [];
        }
        const base = Math.floor(tbodyFit / n);
        let remainder = tbodyFit - base * n;
        return rows.map(() => {
            const extra = remainder > 0 ? 1 : 0;
            if (remainder > 0) {
                remainder -= 1;
            }
            return base + extra;
        });
    }

    function applyStretchRowHeights(rows, rowHeights, tdSelector) {
        rows.forEach((tr, idx) => {
            const rowH = rowHeights[idx];
            tr.style.height = `${rowH}px`;
            tr.style.minHeight = `${rowH}px`;
            tr.style.maxHeight = '';
            tr.dataset.syllabusScaled = '1';
            tr.querySelectorAll(tdSelector).forEach((td) => {
                if (isSyllabusNoteCell(td)) {
                    return;
                }
                td.style.height = `${rowH}px`;
                td.style.minHeight = `${rowH}px`;
                td.style.maxHeight = '';
                td.style.verticalAlign = 'middle';
                td.dataset.syllabusScaled = '1';
            });
        });
    }

    function applyLessonGroupCellOverflow(td) {
        if (isSyllabusNoteCell(td)) {
            return;
        }
        td.style.overflow = 'hidden';
        td.dataset.syllabusScaled = '1';
    }

    function stretchSyllabusTableRows(pageEl, contentHpx, mmPx) {
        if (isContinuationPrintPage(pageEl)) {
            return;
        }
        if (pageEl.querySelector('.syllabus-modern-print-shell')) {
            return;
        }
        const title = pageEl.querySelector('.syllabus-pdf-title, .syllabus-print-title-block');
        const table = pageEl.querySelector('.syllabus-table');
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
                applyLessonGroupCellOverflow(td);
            });
        });
    }

    function stretchJindoMainTable(mainTable, layoutTargetPx, options) {
        const opts = options || {};
        const tbodyFill = opts.tbodyFill != null ? opts.tbodyFill : 0.992;
        const tbody = mainTable.querySelector('tbody');
        const thead = mainTable.querySelector('thead');
        if (!tbody) {
            return 0;
        }
        mainTable.style.height = `${Math.floor(layoutTargetPx)}px`;
        mainTable.dataset.syllabusScaled = '1';

        const theadH = thead ? thead.offsetHeight : 0;
        const tbodyTarget = layoutTargetPx - theadH;
        if (tbodyTarget <= 0) {
            return theadH;
        }

        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (!rows.length) {
            return theadH;
        }

        const tbodyFit = Math.floor(tbodyTarget * tbodyFill);
        tbody.style.height = `${tbodyFit}px`;
        tbody.style.display = 'table-row-group';
        const rowHeights = distributeStretchRowHeights(rows, tbodyFit);
        const tdSelector = 'td.syllabus-col-plan, td.syllabus-col-pages, td.syllabus-col-date, '
            + 'td.syllabus-col-class, td.syllabus-cell-merged, td.syllabus-col-month, td.syllabus-col-week';
        applyStretchRowHeights(rows, rowHeights, tdSelector);
        return theadH;
    }

    function syncJindoNotesTableHeight(mainTable, notesTable) {
        if (!mainTable || !notesTable) {
            return;
        }
        const mainH = mainTable.offsetHeight;
        const theadH = mainTable.querySelector('thead')?.offsetHeight || 0;
        const bodyH = Math.max(0, mainH - theadH);

        notesTable.style.height = `${mainH}px`;
        notesTable.dataset.syllabusScaled = '1';

        const notesThead = notesTable.querySelector('thead');
        const notesTh = notesTable.querySelector('.syllabus-jindo-notes-th');
        if (notesThead) {
            notesThead.style.height = `${theadH}px`;
            notesThead.dataset.syllabusScaled = '1';
        }
        if (notesTh) {
            notesTh.style.height = `${theadH}px`;
            notesTh.dataset.syllabusScaled = '1';
        }

        const notesTbody = notesTable.querySelector('tbody');
        const notesTr = notesTbody?.querySelector('tr');
        const notesTd = notesTable.querySelector('.syllabus-jindo-notes-body-cell');
        if (notesTbody) {
            notesTbody.style.height = `${bodyH}px`;
            notesTbody.dataset.syllabusScaled = '1';
        }
        if (notesTr) {
            notesTr.style.height = `${bodyH}px`;
            notesTr.dataset.syllabusScaled = '1';
        }
        if (notesTd) {
            notesTd.style.height = `${bodyH}px`;
            notesTd.style.verticalAlign = 'top';
            notesTd.dataset.syllabusScaled = '1';
        }
    }

    function stretchModernPrintBody(mainEl, layoutTargetPx, options) {
        const opts = options || {};
        const tbodyFill = opts.tbodyFill != null ? opts.tbodyFill : 1;
        const head = mainEl.querySelector('.syllabus-a4-print-head');
        const body = mainEl.querySelector('.syllabus-a4-print-body');
        if (!body) {
            return 0;
        }
        mainEl.style.height = `${Math.floor(layoutTargetPx)}px`;
        mainEl.dataset.syllabusScaled = '1';

        const headH = head ? head.offsetHeight : 0;
        const bodyTarget = layoutTargetPx - headH;
        if (bodyTarget <= 0) {
            return headH;
        }

        const rows = Array.from(body.querySelectorAll('.syllabus-a4-print-row'));
        if (!rows.length) {
            return headH;
        }

        const bodyFit = Math.floor(bodyTarget * tbodyFill);
        body.style.height = `${bodyFit}px`;
        body.style.display = 'flex';
        body.style.flexDirection = 'column';
        body.style.flex = '1 1 auto';
        body.style.minHeight = '0';
        body.dataset.syllabusScaled = '1';

        const rowHeights = distributeStretchRowHeights(rows, bodyFit);
        rows.forEach((row, idx) => {
            const rowH = rowHeights[idx];
            row.style.height = `${rowH}px`;
            row.style.minHeight = `${rowH}px`;
            row.style.maxHeight = '';
            row.style.flex = '0 0 auto';
            row.style.alignItems = 'center';
            row.dataset.syllabusScaled = '1';
            row.querySelectorAll('.syllabus-a4-print-col-plan, .syllabus-a4-print-col-pages').forEach((cell) => {
                cell.style.height = '';
                cell.style.minHeight = '';
                cell.style.maxHeight = '';
                cell.style.overflow = 'hidden';
                cell.dataset.syllabusScaled = '1';
            });
        });
        return headH;
    }

    function syncModernPrintNoteHeight(mainEl, noteAside) {
        if (!mainEl || !noteAside) {
            return 0;
        }
        const gridH = measureModernPrintGridHeight(mainEl);
        if (gridH <= 0) {
            return 0;
        }

        const head = mainEl.querySelector('.syllabus-a4-print-head, thead');
        const theadH = head ? head.offsetHeight : 0;

        mainEl.style.height = `${gridH}px`;
        mainEl.style.minHeight = `${gridH}px`;
        mainEl.style.maxHeight = '';
        mainEl.dataset.syllabusScaled = '1';

        noteAside.style.display = 'block';
        noteAside.style.position = 'relative';
        noteAside.style.height = `${gridH}px`;
        noteAside.style.minHeight = `${gridH}px`;
        noteAside.style.maxHeight = '';
        noteAside.style.alignSelf = 'flex-start';
        noteAside.style.boxSizing = 'border-box';
        noteAside.style.overflow = 'visible';
        noteAside.dataset.syllabusScaled = '1';

        const noteHead = noteAside.querySelector('.syllabus-a4-print-note__head, .syllabus-modern-print-note__head');
        if (noteHead) {
            noteHead.style.height = `${theadH}px`;
            noteHead.style.minHeight = `${theadH}px`;
            noteHead.style.maxHeight = `${theadH}px`;
            noteHead.style.boxSizing = 'border-box';
            noteHead.style.display = 'flex';
            noteHead.style.alignItems = 'center';
            noteHead.style.flexShrink = '0';
            noteHead.dataset.syllabusScaled = '1';
        }

        void noteAside.offsetHeight;
        const headH = noteHead ? noteHead.offsetHeight : theadH;

        const noteBody = noteAside.querySelector('.syllabus-a4-print-note__body, .syllabus-modern-print-note__body');
        if (noteBody) {
            noteBody.style.position = 'absolute';
            noteBody.style.top = `${headH}px`;
            noteBody.style.left = '0';
            noteBody.style.right = '0';
            noteBody.style.bottom = '0';
            noteBody.style.height = '';
            noteBody.style.minHeight = '';
            noteBody.style.maxHeight = '';
            noteBody.style.flex = 'none';
            noteBody.style.flexShrink = '0';
            noteBody.style.boxSizing = 'border-box';
            noteBody.style.overflow = 'hidden';
            noteBody.dataset.syllabusScaled = '1';
        }

        return gridH;
    }

    /**
     * Modern A4: Print Styles div grid + side Note column share height; lesson rows split evenly.
     */
    function stretchModernPrintLayout(pageEl, contentHpx, mmPx) {
        if (isContinuationPrintPage(pageEl)) {
            return;
        }
        const title = pageEl.querySelector('.syllabus-print-title-block');
        const footer = pageEl.querySelector('.syllabus-print-footer');
        const shell = pageEl.querySelector('.syllabus-modern-print-shell, .syllabus-a4-print-grid');
        const mainEl = shell?.querySelector('.syllabus-a4-print-main, .syllabus-table-modern');
        if (!shell || !mainEl) {
            return;
        }

        const noteWidth = '200px';
        const fitHpx = getSyllabusStretchHeightPx(pageEl, contentHpx, mmPx);
        const titleH = title ? title.offsetHeight : 0;
        const footerH = footer ? footer.offsetHeight : 0;
        const layoutTarget = fitHpx - titleH - footerH - SYLLABUS_MODERN_PRINT_BOTTOM_FUDGE_PX;
        if (layoutTarget <= 0) {
            return;
        }

        shell.style.display = 'flex';
        shell.style.flexDirection = 'row';
        shell.style.alignItems = 'flex-start';
        shell.style.flex = '0 0 auto';
        shell.style.flexGrow = '0';
        shell.style.flexShrink = '0';
        shell.style.minHeight = '0';
        shell.style.width = '100%';
        shell.style.maxWidth = '100%';
        shell.style.boxSizing = 'border-box';
        shell.style.overflow = 'visible';
        shell.dataset.syllabusScaled = '1';

        const mainWrap = shell.querySelector('.syllabus-a4-print-main, .syllabus-modern-print-main');
        if (mainWrap) {
            mainWrap.style.flex = '1 1 0';
            mainWrap.style.minWidth = '0';
            mainWrap.style.maxWidth = `calc(100% - ${noteWidth})`;
            mainWrap.style.overflow = 'visible';
            mainWrap.style.display = 'flex';
            mainWrap.style.flexDirection = 'column';
            mainWrap.style.alignSelf = 'flex-start';
            mainWrap.dataset.syllabusScaled = '1';
        }

        const noteAside = shell.querySelector('.syllabus-a4-print-note, .syllabus-modern-print-note');
        if (noteAside) {
            noteAside.style.flex = `0 0 ${noteWidth}`;
            noteAside.style.width = noteWidth;
            noteAside.style.maxWidth = noteWidth;
            noteAside.style.minWidth = '0';
            noteAside.dataset.syllabusScaled = '1';
        }

        const printBody = mainEl.querySelector('.syllabus-a4-print-body');
        if (printBody) {
            stretchModernPrintBody(mainEl, layoutTarget, { tbodyFill: 1 });
        } else {
            stretchJindoMainTable(mainEl, layoutTarget, { tbodyFill: 1 });
        }
        mainEl.style.width = '100%';
        mainEl.style.maxWidth = '100%';
        mainEl.dataset.syllabusScaled = '1';

        const gridH = syncModernPrintNoteHeight(mainEl, noteAside);
        if (gridH > 0) {
            shell.style.height = `${gridH}px`;
            shell.style.minHeight = `${gridH}px`;
            shell.style.maxHeight = '';
            shell.dataset.syllabusScaled = '1';
            if (mainWrap) {
                mainWrap.style.height = `${gridH}px`;
                mainWrap.style.minHeight = `${gridH}px`;
                mainWrap.style.maxHeight = '';
                mainWrap.dataset.syllabusScaled = '1';
            }
            if (noteAside) {
                noteAside.style.height = `${gridH}px`;
                noteAside.style.minHeight = `${gridH}px`;
                noteAside.style.maxHeight = '';
                noteAside.dataset.syllabusScaled = '1';
            }
        }
    }

    /**
     * 진도표: main + side notes tables share height; lesson rows split evenly in main table.
     */
    function stretchJindoPrintLayout(pageEl, contentHpx, mmPx) {
        if (isContinuationPrintPage(pageEl)) {
            return;
        }
        const title = pageEl.querySelector('.syllabus-pdf-title');
        const grid = pageEl.querySelector('.syllabus-jindo-print-grid');
        const mainTable = grid
            ? grid.querySelector('.syllabus-table-jindo-main')
            : pageEl.querySelector('.syllabus-table-jindo');
        if (!mainTable) {
            return;
        }

        const fitHpx = getSyllabusStretchHeightPx(pageEl, contentHpx, mmPx);
        const titleH = title ? title.offsetHeight : 0;
        const layoutTarget = fitHpx - titleH;
        if (layoutTarget <= 0) {
            return;
        }

        if (grid) {
            grid.style.display = 'flex';
            grid.style.alignItems = 'stretch';
            grid.style.flex = '1 1 auto';
            grid.style.minHeight = '0';
            grid.style.height = `${Math.floor(layoutTarget)}px`;
            grid.style.overflow = 'hidden';
            grid.dataset.syllabusScaled = '1';
        }

        stretchJindoMainTable(mainTable, layoutTarget);

        const notesTable = grid?.querySelector('.syllabus-table-jindo-notes');
        if (notesTable) {
            syncJindoNotesTableHeight(mainTable, notesTable);
        }
    }

    function applyStretchForPrint(pageEl, contentHpx, mmPx) {
        if (pageEl.querySelector('.syllabus-modern-print-shell')) {
            stretchModernPrintLayout(pageEl, contentHpx, mmPx);
        } else {
            const grid = pageEl.querySelector('.syllabus-jindo-print-grid');
            const jindoMain = pageEl.querySelector('.syllabus-table-jindo-main, .syllabus-table-jindo');
            if (grid || jindoMain?.classList.contains('syllabus-table-jindo')) {
                stretchJindoPrintLayout(pageEl, contentHpx, mmPx);
            } else {
                stretchSyllabusTableRows(pageEl, contentHpx, mmPx);
            }
        }
    }

    function pageExceedsFitHeight(pageEl, fitHpx) {
        if (pageEl.querySelector('.syllabus-modern-print-shell')) {
            return getModernPrintPageContentHeightPx(pageEl) > fitHpx + 2;
        }
        return pageEl.scrollHeight > fitHpx + 2;
    }

    function scaleSyllabusPageToFit(pageEl, doc, contentWpx, contentHpx, mmPx) {
        resetSyllabusPageLayout(pageEl);
        pageEl.style.maxHeight = `${SYLLABUS_A4_PAGE.fitContentH}mm`;
        pageEl.style.paddingBottom = isContinuationPrintPage(pageEl) ? '4mm' : '4mm';
        void doc.body.offsetHeight;

        const isContinuation = isContinuationPrintPage(pageEl);
        let lessonGroupScale = 1;
        let noteScale = 1;
        const maxPasses = 10;

        const applyFitPass = () => {
            applySyllabusTypographyScale(pageEl, lessonGroupScale, noteScale);
            if (!isContinuation) {
                applyStretchForPrint(pageEl, contentHpx, mmPx);
            }
            void doc.body.offsetHeight;
        };

        applyFitPass();

        const fitHpx = getSyllabusStretchHeightPx(pageEl, contentHpx, mmPx);

        for (let pass = 0; pass < maxPasses && pageExceedsFitHeight(pageEl, fitHpx); pass += 1) {
            const step = fitHpx / pageEl.scrollHeight;
            lessonGroupScale *= step;
            if (lessonGroupScale < SYLLABUS_PRINT_SCALE_FLOOR) {
                lessonGroupScale = SYLLABUS_PRINT_SCALE_FLOOR;
            }
            applyFitPass();
            if (lessonGroupScale <= SYLLABUS_PRINT_SCALE_FLOOR) {
                break;
            }
        }

        for (let pass = 0; pass < maxPasses && pageExceedsFitHeight(pageEl, fitHpx); pass += 1) {
            const step = fitHpx / pageEl.scrollHeight;
            noteScale *= step;
            if (noteScale < SYLLABUS_PRINT_SCALE_FLOOR) {
                noteScale = SYLLABUS_PRINT_SCALE_FLOOR;
            }
            applyFitPass();
            if (noteScale <= SYLLABUS_PRINT_SCALE_FLOOR) {
                break;
            }
        }

        if (pageExceedsFitHeight(pageEl, fitHpx)
            && lessonGroupScale <= SYLLABUS_PRINT_SCALE_FLOOR
            && noteScale <= SYLLABUS_PRINT_SCALE_FLOOR) {
            const emergency = Math.max(0.65, fitHpx / pageEl.scrollHeight);
            pageEl.style.transformOrigin = 'top left';
            pageEl.style.transform = `scale(${emergency})`;
            pageEl.dataset.syllabusScaled = '1';
            void doc.body.offsetHeight;
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

        return { lessonGroupScale, noteScale };
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
        filterRowsForPdfPrint,
        filterRowsForDebatePeriod,
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
        SYLLABUS_JINDO_MAIN_COL_WIDTHS,
        SYLLABUS_JINDO_MAIN_GRID_WIDTH,
        SYLLABUS_JINDO_NOTES_COL_WIDTH,
        SYLLABUS_A4_REFERENCE,
        isJindoPdfLayout,
        shouldIncludeDetailAppendix,
        computeJindoCellMerges,
        computeJindoWeekDisplays,
        formatJindoDateMd,
        formatJindoMonthFromKey,
        buildPrintGeneralNotesHtml,
        buildPrintNotesColumnHtml,
        renderJindoNotesSideTableHtml,
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
        SYLLABUS_JINDO_PLAN_LINE_CLAMP,
        normalizeSyllabusPrintScales,
        isSyllabusNoteCell,
        fitSyllabusPagesToA4,
        fitSyllabusPrintClassBlocks,
        resetAllSyllabusFit,
        newRowId,
        rowKey
    };
})(typeof window !== 'undefined' ? window : globalThis);
