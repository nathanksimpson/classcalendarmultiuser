/**
 * Daily summary print: teacher prep sheet + student homework handouts (bulk by reference date).
 */
(function (global) {
    const A4 = {
        pageW: 210,
        pageH: 297,
        margin: 10,
        padding: 7,
        minTeacherScale: 0.55,
        minStudentScale: 0.55,
        get contentW() {
            return this.pageW - this.margin * 2;
        },
        get contentH() {
            return this.pageH - this.margin * 2;
        }
    };

    const COPY_COUNT_OPTIONS = [1, 2, 4, 6, 9];

    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function textToHtml(text) {
        return escapeHtml(text).replace(/\n/g, '<br>');
    }

    function gridDimensionsForCopies(copiesPerPage) {
        const n = Math.max(1, Math.min(12, Number(copiesPerPage) || 1));
        if (n === 1) {
            return { cols: 1, rows: 1 };
        }
        if (n === 2) {
            return { cols: 1, rows: 2 };
        }
        if (n === 4) {
            return { cols: 2, rows: 2 };
        }
        if (n === 6) {
            return { cols: 2, rows: 3 };
        }
        if (n === 9) {
            return { cols: 3, rows: 3 };
        }
        const cols = Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);
        return { cols, rows };
    }

    function resolveClassesForDailyPrint(classes, options) {
        const opts = options || {};
        const referenceDate = String(opts.referenceDate || '').trim();
        const myClassesOnly = opts.myClassesOnly === true;
        const assignedIds = opts.assignedClassIds;
        const occursOnDate = typeof opts.classOccursOnIsoDate === 'function'
            ? opts.classOccursOnIsoDate
            : null;
        if (!referenceDate || !Array.isArray(classes)) {
            return [];
        }
        let list = classes.filter((c) => c && c.id);
        if (occursOnDate) {
            list = list.filter((c) => {
                try {
                    return !!occursOnDate(c, referenceDate);
                } catch (err) {
                    return false;
                }
            });
        }
        if (myClassesOnly) {
            if (!assignedIds || !assignedIds.size) {
                return [];
            }
            list = list.filter((c) => assignedIds.has(c.id));
        }
        return list;
    }

    function extractStudentHomework(assignHomework, splitFn) {
        const raw = String(assignHomework ?? '').trim();
        if (!raw) {
            return '';
        }
        if (typeof splitFn === 'function') {
            const parts = splitFn(raw);
            if (parts && parts.homework) {
                return String(parts.homework).trim();
            }
        }
        return raw;
    }

    function extractTodayCovered(assignHomework, splitFn) {
        const raw = String(assignHomework ?? '').trim();
        if (!raw) {
            return '';
        }
        if (typeof splitFn === 'function') {
            const parts = splitFn(raw);
            if (parts && parts.covered) {
                return String(parts.covered).trim();
            }
            if (parts && !parts.homework) {
                return raw;
            }
            return parts && parts.covered ? String(parts.covered).trim() : '';
        }
        return raw;
    }

    function buildDailySummaryPayload(input) {
        const classData = input.classData || {};
        const packet = input.packet || {};
        const prep = input.prep || { previousMeetingDate: '', notes: [] };
        const splitFn = input.splitPlanDetailSections;
        const assignHomework = packet.assignHomework || '';
        return {
            classId: classData.id || '',
            className: String(classData.name || '').trim(),
            classMeta: String(input.classMeta || '').trim(),
            calendarName: String(input.calendarName || '').trim(),
            referenceDate: String(input.referenceDate || packet.targetLessonDate || '').trim(),
            referenceDateLabel: String(input.referenceDateLabel || input.referenceDate || '').trim(),
            sessionNumber: packet.targetSessionNumber || 0,
            lessonTitle: String(packet.targetLessonTitle || '').trim(),
            previousMeetingDate: prep.previousMeetingDate || '',
            previousMeetingDateLabel: String(input.previousMeetingDateLabel || prep.previousMeetingDate || '').trim(),
            prepNotes: (prep.notes || []).map((n) => ({
                text: String(n.text || '').trim(),
                date: n.date || prep.previousMeetingDate || ''
            })).filter((n) => n.text),
            gradingHomework: String(packet.gradingHomework || '').trim(),
            todayCovered: extractTodayCovered(assignHomework, splitFn),
            assignHomework,
            studentHomework: extractStudentHomework(assignHomework, splitFn),
            dueDate: String(packet.dueDate || '').trim(),
            dueDateLabel: String(input.dueDateLabel || packet.dueDate || '').trim()
        };
    }

    function renderCompactSection(title, bodyText, emptyHint) {
        const body = String(bodyText || '').trim();
        const inner = body
            ? `<div class="daily-summary-compact-body">${textToHtml(body)}</div>`
            : `<p class="daily-summary-empty">${escapeHtml(emptyHint)}</p>`;
        return `<div class="daily-summary-compact-section">
<h4 class="daily-summary-compact-title">${escapeHtml(title)}</h4>
${inner}
</div>`;
    }

    function renderTeacherClassBlock(payload, labels) {
        const sessionLine = payload.sessionNumber > 0
            ? `${labels.sessionLabel} ${payload.sessionNumber}`
            : '';
        const titleParts = [sessionLine, payload.lessonTitle].filter(Boolean).join(' · ');
        const metaParts = [payload.classMeta, titleParts].filter(Boolean).join(' · ');

        let prepText = '';
        if (!payload.previousMeetingDate) {
            prepText = '';
        } else if (payload.prepNotes.length) {
            prepText = payload.prepNotes.map((n) => n.text).join('\n');
        }

        const prepTitle = payload.previousMeetingDateLabel
            ? `${labels.fromLastClass} (${payload.previousMeetingDateLabel})`
            : labels.fromLastClass;
        const prepHint = !payload.previousMeetingDate
            ? labels.noPriorClass
            : labels.noPrepNotes;

        return `<section class="daily-summary-class-block" data-class-id="${escapeHtml(payload.classId)}">
<h3 class="daily-summary-class-block-name">${escapeHtml(payload.className)}</h3>
${metaParts ? `<p class="daily-summary-class-block-meta">${escapeHtml(metaParts)}</p>` : ''}
<div class="daily-summary-class-block-sections">
${renderCompactSection(prepTitle, prepText, prepHint)}
${renderCompactSection(labels.gradingHomework, payload.gradingHomework, labels.noGradingHomework)}
${renderCompactSection(
    labels.todaySection,
    [payload.lessonTitle, payload.todayCovered].filter(Boolean).join('\n'),
    labels.noTodayContent
)}
</div>
</section>`;
    }

    function renderTeacherSummaryCombinedSheet(payloads, labels, options) {
        const opts = options || {};
        const list = payloads || [];
        if (!list.length) {
            return '';
        }
        const first = list[0];
        const headerMeta = [
            first.calendarName,
            first.referenceDateLabel,
            opts.classCountLabel || `${list.length}`
        ].filter(Boolean).join(' · ');
        const blocks = list.map((p) => renderTeacherClassBlock(p, labels)).join('');
        const multiColumn = list.length >= 4 ? ' daily-summary-sheet--teacher-multi-col' : '';
        return `<article class="daily-summary-sheet daily-summary-sheet--teacher-combined${multiColumn}" data-teacher-combined="1">
<header class="daily-summary-combined-header">
<h2 class="daily-summary-combined-title">${escapeHtml(labels.teacherDocTitle)}</h2>
<p class="daily-summary-combined-meta">${escapeHtml(headerMeta)}</p>
</header>
<div class="daily-summary-class-blocks">${blocks}</div>
</article>`;
    }

    /** @deprecated Per-class full page; kept for tests */
    function renderTeacherSummarySheet(payload, labels) {
        const sessionLine = payload.sessionNumber > 0
            ? `${labels.sessionLabel} ${payload.sessionNumber}`
            : '';
        const titleParts = [sessionLine, payload.lessonTitle].filter(Boolean).join(' · ');
        const headerMeta = [payload.calendarName, payload.referenceDateLabel].filter(Boolean).join(' · ');
        const gradingBody = payload.gradingHomework
            ? `<div class="daily-summary-block">${textToHtml(payload.gradingHomework)}</div>`
            : '';
        const todayBody = payload.lessonTitle || payload.todayCovered
            ? `<div class="daily-summary-block">${payload.lessonTitle
                ? `<p class="daily-summary-lesson-title">${escapeHtml(payload.lessonTitle)}</p>`
                : ''}${payload.todayCovered
                ? `<div class="daily-summary-covered">${textToHtml(payload.todayCovered)}</div>`
                : ''}</div>`
            : '';

        return `<article class="daily-summary-sheet daily-summary-sheet--teacher">
<header class="daily-summary-header">
<p class="daily-summary-meta">${escapeHtml(headerMeta)}</p>
<h2 class="daily-summary-class-name">${escapeHtml(payload.className)}</h2>
${payload.classMeta ? `<p class="daily-summary-class-meta">${escapeHtml(payload.classMeta)}</p>` : ''}
${titleParts ? `<p class="daily-summary-lesson-line">${escapeHtml(titleParts)}</p>` : ''}
</header>
${renderCompactSection(
    payload.previousMeetingDateLabel
        ? `${labels.fromLastClass} (${payload.previousMeetingDateLabel})`
        : labels.fromLastClass,
    payload.prepNotes.map((n) => n.text).join('\n'),
    !payload.previousMeetingDate ? labels.noPriorClass : labels.noPrepNotes
)}
${renderCompactSection(labels.gradingHomework, payload.gradingHomework, labels.noGradingHomework)}
${renderCompactSection(
    labels.todaySection,
    [payload.lessonTitle, payload.todayCovered].filter(Boolean).join('\n'),
    labels.noTodayContent
)}
</article>`;
    }

    function renderStudentSlip(payload, labels) {
        const hw = payload.studentHomework || payload.assignHomework || '';
        return `<div class="daily-summary-student-slip">
<p class="daily-summary-slip-heading">${escapeHtml(labels.studentSheetTitle)}</p>
<p class="daily-summary-slip-class">${escapeHtml(payload.className)}</p>
<p class="daily-summary-slip-date">${escapeHtml(labels.dateLabel)}: ${escapeHtml(payload.referenceDateLabel)}</p>
<p class="daily-summary-slip-due">${escapeHtml(labels.dueLabel)}: ${escapeHtml(payload.dueDateLabel || '—')}</p>
<div class="daily-summary-slip-homework">${hw ? textToHtml(hw) : `<span class="daily-summary-empty">${escapeHtml(labels.noHomework)}</span>`}</div>
</div>`;
    }

    function renderStudentHandoutSheet(payload, labels, options) {
        const opts = options || {};
        const copies = Math.max(1, Number(opts.copiesPerPage) || 1);
        const grid = gridDimensionsForCopies(copies);
        const slips = Array.from({ length: copies }, () => renderStudentSlip(payload, labels)).join('');
        const pageHeader = `${payload.className} · ${payload.referenceDateLabel}`;
        return `<article class="daily-summary-sheet daily-summary-sheet--student" data-copies="${copies}" data-class-id="${escapeHtml(payload.classId)}" style="--daily-summary-cols:${grid.cols};--daily-summary-rows:${grid.rows};">
<p class="daily-summary-student-page-header">${escapeHtml(pageHeader)}</p>
<div class="daily-summary-student-grid-wrap">
<div class="daily-summary-student-grid">${slips}</div>
</div>
</article>`;
    }

    function renderTeacherSummaryCombinedDocumentHtml(payloads, labels, options) {
        const opts = options || {};
        const sheet = renderTeacherSummaryCombinedSheet(payloads, labels, opts);
        return buildPrintDocumentHtml(sheet, opts.title || labels.teacherDocTitle, labels);
    }

    function renderTeacherSummaryDocumentHtml(payloads, labels, options) {
        return renderTeacherSummaryCombinedDocumentHtml(payloads, labels, options);
    }

    function renderStudentHandoutDocumentHtml(payloads, labels, options) {
        const opts = options || {};
        const copies = opts.copiesPerPage || 4;
        const sheets = (payloads || []).map((p) =>
            renderStudentHandoutSheet(p, labels, { copiesPerPage: copies })
        ).join('');
        return buildPrintDocumentHtml(sheets, opts.title || labels.studentDocTitle, labels);
    }

    function getDailySummaryPrintStyles() {
        const innerH = A4.pageH - A4.padding * 2;
        return `
@page daily-summary-a4 {
    size: A4 portrait;
    margin: 0;
}
*, *::before, *::after { box-sizing: border-box; }
html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111;
    font-family: "Segoe UI", Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}
.app-print-document--daily-summary {
    width: 100%;
}
.daily-summary-sheet {
    width: ${A4.pageW}mm;
    min-height: ${A4.pageH}mm;
    padding: ${A4.padding}mm;
    margin: 0 auto;
    page-break-after: always;
    break-after: page;
    overflow: hidden;
}
.daily-summary-sheet:last-child {
    page-break-after: auto;
    break-after: auto;
}
.daily-summary-sheet--teacher-combined {
    display: flex;
    flex-direction: column;
}
.daily-summary-combined-header {
    margin-bottom: 3mm;
    padding-bottom: 2mm;
    border-bottom: 0.35mm solid #333;
}
.daily-summary-combined-title {
    margin: 0 0 1mm;
    font-size: 12pt;
    line-height: 1.2;
}
.daily-summary-combined-meta {
    margin: 0;
    font-size: 8.5pt;
    color: #444;
}
.daily-summary-class-blocks {
    flex: 1 1 auto;
}
.daily-summary-sheet--teacher-multi-col .daily-summary-class-blocks {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2mm 4mm;
    align-content: start;
}
.daily-summary-class-block {
    margin-bottom: 3mm;
    padding-bottom: 2.5mm;
    border-bottom: 0.2mm solid #ccc;
    break-inside: avoid;
    page-break-inside: avoid;
}
.daily-summary-class-block:last-child {
    border-bottom: none;
    margin-bottom: 0;
}
.daily-summary-class-block-name {
    margin: 0 0 0.5mm;
    font-size: 10pt;
    line-height: 1.2;
}
.daily-summary-class-block-meta {
    margin: 0 0 1.5mm;
    font-size: 8pt;
    color: #444;
}
.daily-summary-class-block-sections {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1.5mm;
}
.daily-summary-compact-section {
    margin: 0;
}
.daily-summary-compact-title {
    margin: 0 0 0.5mm;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: #333;
}
.daily-summary-compact-body {
    margin: 0;
    font-size: 8pt;
    line-height: 1.25;
}
.daily-summary-empty {
    margin: 0;
    color: #666;
    font-style: italic;
    font-size: 8pt;
}
.daily-summary-sheet--teacher-combined[data-fit-scale] {
    transform-origin: top center;
}
.daily-summary-class-block.daily-summary-page-break-before {
    page-break-before: always;
    break-before: page;
    padding-top: 2mm;
}
.daily-summary-sheet--student {
    page: daily-summary-a4;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
}
.daily-summary-student-page-header {
    margin: 0 0 3mm;
    width: 100%;
    font-size: 9pt;
    font-weight: 600;
    text-align: center;
}
.daily-summary-student-grid-wrap {
    width: 100%;
    flex: 0 0 auto;
}
.daily-summary-student-grid {
    display: grid;
    grid-template-columns: repeat(var(--daily-summary-cols, 2), 1fr);
    grid-auto-rows: auto;
    align-content: start;
    gap: 0;
    width: 100%;
    border: 0.35mm solid #000;
}
.daily-summary-student-slip {
    border: 0.35mm solid #000;
    margin: -0.35mm 0 0 -0.35mm;
    padding: 2mm;
    overflow: hidden;
    font-size: 8pt;
    line-height: 1.25;
    min-height: 0;
    height: auto;
}
.daily-summary-slip-heading {
    margin: 0 0 1mm;
    font-size: 9pt;
    font-weight: 700;
    text-align: center;
}
.daily-summary-slip-class {
    margin: 0 0 0.5mm;
    font-weight: 600;
    font-size: 8pt;
}
.daily-summary-slip-date,
.daily-summary-slip-due {
    margin: 0 0 0.5mm;
    font-size: 7.5pt;
}
.daily-summary-slip-homework {
    margin-top: 1mm;
    overflow: hidden;
    font-size: 8pt;
}
.daily-summary-sheet--student[data-fit-scale] {
    transform-origin: top center;
}
@media print {
    html, body { background: #fff !important; }
    .daily-summary-sheet {
        page: daily-summary-a4;
        max-height: none;
    }
}
`;
    }

    function buildPrintDocumentHtml(bodyHtml, title) {
        const safeTitle = escapeHtml(title || 'Daily summary');
        const styles = getDailySummaryPrintStyles();
        return `<!DOCTYPE html>
<html lang="en" class="print-color-mode-light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>${styles}</style>
</head>
<body class="app-print-daily-summary-doc">
<div class="app-print-document app-print-document--daily-summary">
${bodyHtml || ''}
</div>
</body>
</html>`;
    }

    function measureMmToPx(doc) {
        const probe = doc.createElement('div');
        probe.style.cssText = 'position:absolute;visibility:hidden;width:100mm;height:1mm;';
        doc.body.appendChild(probe);
        const px = probe.offsetWidth / 100;
        doc.body.removeChild(probe);
        return px;
    }

    function applySheetScale(sheet, doc, minScale) {
        const mmPx = measureMmToPx(doc);
        const pageHpx = Math.round(A4.pageH * mmPx);
        sheet.style.transform = '';
        sheet.removeAttribute('data-fit-scale');
        sheet.style.marginBottom = '';
        void doc.body.offsetHeight;
        const naturalH = sheet.scrollHeight;
        const budget = pageHpx - 2;
        if (naturalH <= budget) {
            return false;
        }
        const scale = Math.max(minScale, budget / naturalH);
        sheet.style.transform = `scale(${scale})`;
        sheet.style.transformOrigin = 'top center';
        sheet.setAttribute('data-fit-scale', String(scale.toFixed(3)));
        const scaledH = Math.ceil(naturalH * scale);
        sheet.style.marginBottom = `${Math.max(0, naturalH - scaledH)}px`;
        return scale > minScale + 0.001;
    }

    /**
     * Fit combined teacher summary on one page via scale, or split across two pages.
     * @param {Document} doc
     * @param {{ maxPages?: number }} options
     */
    function fitTeacherSummaryToPages(doc, options) {
        if (!doc) {
            return;
        }
        const maxPages = (options && options.maxPages) || 2;
        const sheet = doc.querySelector('.daily-summary-sheet--teacher-combined');
        if (!sheet) {
            return;
        }
        const blocks = Array.from(sheet.querySelectorAll('.daily-summary-class-block'));
        blocks.forEach((b) => b.classList.remove('daily-summary-page-break-before'));

        if (applySheetScale(sheet, doc, A4.minTeacherScale)) {
            return;
        }

        if (maxPages < 2 || blocks.length < 2) {
            applySheetScale(sheet, doc, A4.minTeacherScale);
            return;
        }

        sheet.style.transform = '';
        sheet.removeAttribute('data-fit-scale');
        sheet.style.marginBottom = '';
        const splitAt = Math.ceil(blocks.length / 2);
        blocks[splitAt].classList.add('daily-summary-page-break-before');
    }

    /**
     * Scale each student handout sheet to fit one A4 page when content overflows.
     * @param {Document} doc
     */
    function fitStudentHandoutToSinglePage(doc) {
        if (!doc) {
            return;
        }
        const sheets = doc.querySelectorAll('.daily-summary-sheet--student');
        sheets.forEach((sheet) => {
            applySheetScale(sheet, doc, A4.minStudentScale);
        });
    }

    const api = {
        A4,
        COPY_COUNT_OPTIONS,
        escapeHtml,
        gridDimensionsForCopies,
        resolveClassesForDailyPrint,
        extractStudentHomework,
        extractTodayCovered,
        buildDailySummaryPayload,
        renderTeacherSummarySheet,
        renderTeacherClassBlock,
        renderTeacherSummaryCombinedSheet,
        renderStudentHandoutSheet,
        renderTeacherSummaryCombinedDocumentHtml,
        renderTeacherSummaryDocumentHtml,
        renderStudentHandoutDocumentHtml,
        getDailySummaryPrintStyles,
        buildPrintDocumentHtml,
        fitTeacherSummaryToPages,
        fitStudentHandoutToSinglePage
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.CCPDailySummaryPrint = api;
}(typeof window !== 'undefined' ? window : globalThis));
