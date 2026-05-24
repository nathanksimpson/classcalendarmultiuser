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

    /** A4 page margins and printable content area (mm). */
    const SYLLABUS_A4_MARGIN_MM = 15;
    /** Extra inset so table borders are not clipped by print/overflow (bottom especially). */
    const SYLLABUS_A4_FIT_SAFETY_MM = 6;
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

    /** Reference layout matched to fixed syllabus PDF sample (26 SP Navy). */
    const SYLLABUS_A4_COL_WIDTHS = ['7%', '14%', '5%', '48%', '26%'];
    const SYLLABUS_A4_REFERENCE = {
        titlePt: 11,
        tablePt: 9,
        thPt: 8.5,
        sublinePt: 8,
        titleMarginMm: 2,
        cellPadY: 3,
        cellPadX: 4,
        lineHeight: 1.2
    };

    function formatSyllabusShortDate(d) {
        if (!d || Number.isNaN(d.getTime())) {
            return '';
        }
        return `(${d.getMonth() + 1}/${d.getDate()})`;
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
            if (item.__syllabusOverflowIntro || item.__syllabusUnscheduled) {
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
            let planTitle = lesson.label || `Lesson ${lessonNumber}`;
            const rowForTemplate = { planTitle, lessonNumber, sessionNumber: lessonNumber };
            let planDetail = planDetailFromUnits(lessonNumber, units, planTitle);
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
                lessonNumber,
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

    function mergeSyllabusRows(existing, generated) {
        const existingList = Array.isArray(existing) ? existing : [];
        const noteRows = existingList.filter(r => r.kind === 'note' && !r.overflowIntro);
        const byKey = new Map();
        existingList.forEach(r => {
            if (r.kind === 'lesson' || r.kind === 'holiday' || r.kind === 'event'
                || r.kind === 'extra' || r.kind === 'overflow') {
                byKey.set(rowKey(r), r);
            }
        });

        const isTailRow = g => g.kind === 'overflow' || g.kind === 'extra' || g.overflowIntro === true;
        const mainGenerated = generated.filter(g => !isTailRow(g));
        const tailGenerated = generated.filter(isTailRow);

        const mergedLessons = mainGenerated.map(gen => {
            const key = rowKey(gen);
            const prev = byKey.get(key);
            if (!prev) {
                return { ...gen };
            }
            const keepEdits = prev.source === 'manual' || prev.source === 'imported';
            return {
                ...gen,
                id: prev.id || gen.id,
                planTitle: keepEdits && (prev.planTitle || '').trim()
                    ? prev.planTitle
                    : gen.planTitle,
                planDetail: preserveText(prev.planDetail, gen.planDetail, keepEdits),
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

    function renderPlanCell(row) {
        const title = escapeHtml(row.planTitle || '');
        const detail = (row.planDetail || '').trim();
        const kind = row.kind || 'lesson';
        const detailClass = kind === 'holiday' || kind === 'event' || kind === 'extra' || kind === 'overflow'
            ? 'syllabus-plan-subline syllabus-plan-subline-emphasis'
            : 'syllabus-plan-detail';
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

    function getRowWeekDisplay(row, useFullMonth, carryWeek) {
        const week = (row.weekLabel || '').trim()
            || (row.date ? getSchoolWeekLabel(row.date, useFullMonth) : '');
        if (week) {
            return week;
        }
        return carryWeek || '';
    }

    /**
     * Month/week rowspan groups (PDF-style: one merged cell per month, one per school week).
     */
    function computeSyllabusCellMerges(rows, useFullMonth) {
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
            const week = getRowWeekDisplay(row, useFullMonth, carryWeek);
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
        const normalized = normalizeRows(rows);
        const useFullMonth = pdfLayout;
        const merge = computeSyllabusCellMerges(normalized, useFullMonth);

        let headerBlock = '';
        if (L.generalNotes) {
            const notesHtml = escapeHtml(L.generalNotes).replace(/\n/g, '<br>');
            headerBlock += `<div class="syllabus-general-notes-print">${notesHtml}</div>`;
        }
        if (L.classTitle) {
            if (pdfLayout) {
                headerBlock += `<h2 class="syllabus-pdf-title">${escapeHtml(L.classTitle)}</h2>`;
            } else {
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

        let html = `${headerBlock}<table class="syllabus-table${pdfLayout ? ' syllabus-table-pdf' : ''}">`;
        if (pdfLayout) {
            html += '<colgroup>';
            SYLLABUS_A4_COL_WIDTHS.forEach(w => {
                html += `<col style="width:${w}">`;
            });
            html += '</colgroup>';
        }
        html += '<thead><tr>';
        if (pdfLayout) {
            const year = L.tableYear || '';
            html += `<th class="syllabus-col-year">${escapeHtml(year)}</th>`;
            html += `<th>${escapeHtml(L.colWeek || 'Week')}</th>`;
            html += `<th>${escapeHtml(L.colClass || 'Class')}</th>`;
            html += `<th>${escapeHtml(L.colPlan || 'Weekly Lesson Plan')}</th>`;
            html += `<th>${escapeHtml(L.colNote || 'Note')}</th>`;
        } else {
            html += `<th>${escapeHtml(L.colMonth || 'Month')}</th>`;
            html += `<th>${escapeHtml(L.colWeek || 'Week')}</th>`;
            html += `<th>${escapeHtml(L.colClass || 'Class')}</th>`;
            html += `<th>${escapeHtml(L.colPlan || 'Weekly Lesson Plan')}</th>`;
            html += `<th>${escapeHtml(L.colNote || 'Note')}</th>`;
        }
        html += `</tr></thead><tbody>`;

        normalized.forEach((row, i) => {
            const sessionDisplay = row.kind !== 'note' && row.sessionNumber > 0
                ? String(row.sessionNumber)
                : '';
            const trClass = syllabusRowClass(row);
            const cellStyle = syllabusCellStyleAttr(row);
            html += `<tr class="${trClass}">`;
            html += renderMergedMonthWeekCells(i, merge, pdfLayout, cellStyle);
            html += `<td class="syllabus-col-class"${cellStyle}>${escapeHtml(sessionDisplay)}</td>`;
            html += `<td class="syllabus-col-plan"${cellStyle}>${renderPlanCell(row)}</td>`;
            html += `<td class="syllabus-col-note"${cellStyle}>${escapeHtml(row.note || '')}</td>`;
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
.syllabus-table th, .syllabus-table td { border: 1px solid #333; padding: 6px 8px; vertical-align: top; }
.syllabus-table th { background: #f3f4f6; font-weight: 600; }
.syllabus-table-pdf .syllabus-col-year { width: 4.5em; }
.syllabus-col-month { width: 4.5em; }
.syllabus-col-week { width: 8.5em; }
.syllabus-col-class { width: 2.5em; text-align: center; }
.syllabus-cell-merged { vertical-align: middle; text-align: center; background: transparent; }
.syllabus-col-month.syllabus-cell-merged { font-weight: 600; }
.syllabus-col-week.syllabus-cell-merged { font-weight: 500; font-size: 0.95em; }
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
  height: ${SYLLABUS_A4_PAGE.contentH}mm;
  min-height: 0;
  max-height: ${SYLLABUS_A4_PAGE.contentH}mm;
  box-sizing: border-box;
  margin: 0;
  padding: 0 0 ${SYLLABUS_A4_FIT_SAFETY_MM}mm 0;
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
  font-size: 11pt;
  font-weight: 700;
  text-align: center;
  margin: 0 0 2mm;
  line-height: 1.2;
}
.syllabus-a4-page .syllabus-table { font-size: 9pt; line-height: 1.2; }
.syllabus-a4-page .syllabus-table th,
.syllabus-a4-page .syllabus-table td { padding: 3px 4px; border: 1px solid #333; vertical-align: top; }
.syllabus-a4-page .syllabus-table th { background: #f3f4f6; font-size: 8.5pt; font-weight: 600; }
.syllabus-a4-page .syllabus-plan-detail,
.syllabus-a4-page .syllabus-plan-subline { font-size: 8pt; margin-top: 1px; line-height: 1.15; }
.syllabus-a4-page .syllabus-col-class,
.syllabus-a4-page .syllabus-cell-merged { vertical-align: middle; text-align: center; }
.syllabus-a4-page .syllabus-col-class { text-align: center; }
.syllabus-a4-page .syllabus-col-plan,
.syllabus-a4-page .syllabus-col-note { vertical-align: top; word-break: break-word; }
.syllabus-a4-page.syllabus-a4-dense .syllabus-pdf-title { font-size: 10.25pt; margin-bottom: 1.75mm; }
.syllabus-a4-page.syllabus-a4-dense .syllabus-table { font-size: 8.25pt; line-height: 1.15; }
.syllabus-a4-page.syllabus-a4-dense .syllabus-table th { font-size: 7.75pt; }
.syllabus-a4-page.syllabus-a4-dense .syllabus-table th,
.syllabus-a4-page.syllabus-a4-dense .syllabus-table td { padding: 2px 3px; }
.syllabus-a4-page.syllabus-a4-dense .syllabus-plan-detail,
.syllabus-a4-page.syllabus-a4-dense .syllabus-plan-subline { font-size: 7.25pt; }
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-pdf-title { font-size: 9.5pt; margin-bottom: 1.5mm; }
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-table { font-size: 7.25pt; line-height: 1.1; }
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-table th { font-size: 6.75pt; }
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-table th,
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-table td { padding: 2px 2px; }
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-plan-detail,
.syllabus-a4-page.syllabus-a4-extra-dense .syllabus-plan-subline { font-size: 6.25pt; }
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
                    tableYear: sec.tableYear || labels.tableYear,
                    subtitle: sec.subtitle,
                    termRange: sec.termRange
                }
            );
            body += `</section>`;
            if (a4Pdf) {
                body += `</div></div>`;
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

        pageEl.querySelectorAll('.syllabus-plan-detail, .syllabus-plan-subline').forEach(el => {
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

    function stretchSyllabusTableRows(pageEl, contentHpx) {
        const title = pageEl.querySelector('.syllabus-pdf-title');
        const table = pageEl.querySelector('.syllabus-table');
        const tbody = table?.querySelector('tbody');
        const thead = table?.querySelector('thead');
        if (!table || !tbody) {
            return;
        }

        const titleH = title ? title.offsetHeight : 0;
        const tableTarget = contentHpx - titleH;
        table.style.height = `${tableTarget}px`;
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

        tbody.style.height = `${tbodyTarget}px`;
        tbody.style.display = 'table-row-group';
        const rowH = tbodyTarget / rows.length;
        rows.forEach(tr => {
            tr.style.height = `${rowH}px`;
            tr.dataset.syllabusScaled = '1';
        });
    }

    function scaleSyllabusPageToFit(pageEl, doc, contentWpx, contentHpx) {
        resetSyllabusPageLayout(pageEl);
        void doc.body.offsetHeight;

        let scale = 1;
        applySyllabusTypographyScale(pageEl, scale);
        stretchSyllabusTableRows(pageEl, contentHpx);
        void doc.body.offsetHeight;

        for (let pass = 0; pass < 8 && pageEl.scrollHeight > contentHpx + 1; pass += 1) {
            const step = contentHpx / pageEl.scrollHeight;
            scale *= step;
            applySyllabusTypographyScale(pageEl, scale);
            stretchSyllabusTableRows(pageEl, contentHpx);
            void doc.body.offsetHeight;
        }

        pageEl.style.height = `${SYLLABUS_A4_PAGE.contentH}mm`;
        pageEl.style.minHeight = '0';
        pageEl.style.maxHeight = `${SYLLABUS_A4_PAGE.contentH}mm`;
        pageEl.style.boxSizing = 'border-box';
        pageEl.style.overflow = 'hidden';
        pageEl.style.paddingBottom = `${SYLLABUS_A4_FIT_SAFETY_MM}mm`;

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
            scaleSyllabusPageToFit(pageEl, doc, contentWpx, contentHpx);
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
        getSchoolWeekMonday,
        formatMonthShortFromKey,
        buildSyllabusRowsFromSchedule,
        getCurriculumLessonNumber,
        planDetailFromUnits,
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
        SYLLABUS_A4_REFERENCE,
        fitSyllabusPagesToA4,
        fitSyllabusPrintClassBlocks,
        resetAllSyllabusFit,
        prepareSyllabusPagesForPdfCapture,
        newRowId,
        rowKey
    };
})(typeof window !== 'undefined' ? window : globalThis);
