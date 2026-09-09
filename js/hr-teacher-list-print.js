/**
 * Printable HTML for the Cohorts HR teacher list (level × MWF × TT).
 * window.CCPHrTeacherListPrint
 */
(function (global) {
    const DEFAULT_ACCENT = '#356a9e';
    const PRINT_TEXT = '#243244';

    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function hexToRgba(hex, alpha) {
        const n = String(hex || DEFAULT_ACCENT).replace('#', '');
        if (n.length < 6) {
            return 'rgba(53,106,158,' + alpha + ')';
        }
        const r = parseInt(n.slice(0, 2), 16);
        const g = parseInt(n.slice(2, 4), 16);
        const b = parseInt(n.slice(4, 6), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function rowStyle(row) {
        const accent = (row && row.accent) || DEFAULT_ACCENT;
        const bg = hexToRgba(accent, 0.14);
        return `background-color:${bg};border-left:3px solid ${accent};color:${PRINT_TEXT}`;
    }

    function dash(value) {
        const s = String(value == null ? '' : value).trim();
        return s || '—';
    }

    function renderTable(rows, labels) {
        const list = Array.isArray(rows) ? rows : [];
        const body = list.map((row) => `<tr class="hr-teacher-list-row" data-level-id="${escapeHtml(row.levelId || '')}" style="${rowStyle(row)}">
            <td class="hr-teacher-list-col-cohort">${escapeHtml(dash(row.cohortLabel))}</td>
            <td class="hr-teacher-list-col-m">${escapeHtml(dash(row.mHrTeacher))}</td>
            <td class="hr-teacher-list-col-t">${escapeHtml(dash(row.tHrTeacher))}</td>
        </tr>`).join('');
        return `<table class="hr-teacher-list-table">
<thead><tr>
<th>${escapeHtml(labels.colCohort || 'Cohort')}</th>
<th>${escapeHtml(labels.colMHrt || 'MWF')}</th>
<th>${escapeHtml(labels.colTHrt || 'TT')}</th>
</tr></thead>
<tbody>${body}</tbody>
</table>`;
    }

    function renderDocumentHtml(rows, labels, options) {
        const opts = options || {};
        const title = labels && labels.title ? labels.title : 'HR Teacher List';
        const calendarName = opts.calendarName ? String(opts.calendarName).trim() : '';
        const meta = calendarName
            ? `<p class="hr-teacher-list-meta">${escapeHtml(calendarName)}</p>`
            : '';
        return `<article class="hr-teacher-list-root">
<header class="hr-teacher-list-header">
<h1 class="hr-teacher-list-title">${escapeHtml(title)}</h1>
${meta}
</header>
${renderTable(rows, labels || {})}
</article>`;
    }

    function getPrintStyles() {
        return `
.hr-teacher-list-root {
    font-family: "IBM Plex Sans", "Noto Sans KR", system-ui, sans-serif;
    color: ${PRINT_TEXT};
    font-size: 11pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}
.hr-teacher-list-header { margin: 0 0 0.75rem; }
.hr-teacher-list-title { margin: 0 0 0.25rem; font-size: 16pt; }
.hr-teacher-list-meta { margin: 0; font-size: 10pt; color: #444; }
.hr-teacher-list-table { width: 100%; border-collapse: collapse; }
.hr-teacher-list-table th,
.hr-teacher-list-table td {
    border: 1px solid #ccc;
    padding: 0.4rem 0.55rem;
    text-align: left;
    vertical-align: middle;
    color: ${PRINT_TEXT};
}
.hr-teacher-list-table th { background: #f3f3f3; font-weight: 600; }
.hr-teacher-list-row td { color: ${PRINT_TEXT}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print {
    .hr-teacher-list-root { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .hr-teacher-list-row { page-break-inside: avoid; }
}`;
    }

    function buildPrintDocumentHtml(bodyHtml, title, cssHref, inlineCss) {
        const safeTitle = escapeHtml(title || 'HR Teacher List');
        return `<!DOCTYPE html>
<html lang="en" data-theme="light" class="print-color-mode-light">
<head>
<meta charset="UTF-8">
<title>${safeTitle}</title>
${cssHref ? `<link rel="stylesheet" href="${escapeHtml(cssHref)}">` : ''}
<style>${inlineCss || getPrintStyles()}</style>
</head>
<body class="app-print-hr-teacher-list-doc">
<div class="app-print-document app-print-document--hr-teacher-list">${bodyHtml || ''}</div>
</body>
</html>`;
    }

    global.CCPHrTeacherListPrint = {
        escapeHtml,
        hexToRgba,
        renderTable,
        renderDocumentHtml,
        getPrintStyles,
        buildPrintDocumentHtml
    };
})(typeof window !== 'undefined' ? window : globalThis);
