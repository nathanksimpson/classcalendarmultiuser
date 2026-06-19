/**
 * Printable HTML for classroom term summaries.
 */
(function (global) {
    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatSigned(n) {
        const num = Number(n) || 0;
        const sign = num > 0 ? '+' : '';
        return `${sign}${num}`;
    }

    function formatDateRange(from, to, labels) {
        const parts = [];
        if (from) {
            parts.push(from);
        }
        if (to && to !== from) {
            parts.push(to);
        }
        if (!parts.length) {
            return labels.noDateRange || '—';
        }
        return parts.join(' – ');
    }

    function renderPointsCell(points, labels) {
        if (!points) {
            return `<td>0</td>`;
        }
        const reasonLines = (points.reasons || [])
            .map((r) => `${escapeHtml(r.reason)}: ${escapeHtml(formatSigned(r.net))}`)
            .join('<br>');
        const detail = reasonLines
            ? `<div class="classroom-term-summary-sub">${reasonLines}</div>`
            : '';
        return `<td><strong>${escapeHtml(formatSigned(points.total))}</strong>${detail}</td>`;
    }

    function renderAttendanceCell(attendance, labels) {
        const a = attendance || {};
        return `<td>${escapeHtml(String(a.present || 0))} / ${escapeHtml(String(a.late || 0))} / ${escapeHtml(String(a.absent || 0))} / ${escapeHtml(String(a.early_leave || 0))}<div class="classroom-term-summary-sub">${escapeHtml(labels.attendanceSessions)}: ${escapeHtml(String(a.sessions || 0))}</div></td>`;
    }

    function renderHomeworkCell(homework) {
        const h = homework || {};
        return `<td>A ${escapeHtml(String(h.A || 0))} · B ${escapeHtml(String(h.B || 0))} · C ${escapeHtml(String(h.C || 0))} · X ${escapeHtml(String(h.X || 0))}<div class="classroom-term-summary-sub">${escapeHtml(String(h.total || 0))} graded</div></td>`;
    }

    function renderTestsCell(tests) {
        const list = Array.isArray(tests) ? tests : [];
        if (!list.length) {
            return '<td>—</td>';
        }
        const lines = list
            .map((t) => {
                const score = t.score != null ? String(t.score) : '—';
                const max = t.maxScore != null ? ` / ${t.maxScore}` : '';
                return `${escapeHtml(t.testName)} (${escapeHtml(t.testDate)}): ${escapeHtml(score)}${escapeHtml(max)}`;
            })
            .join('<br>');
        return `<td>${lines}</td>`;
    }

    function renderStudentTable(students, labels) {
        const rows = (students || [])
            .map(
                (row) => `<tr>
                <td>${escapeHtml(row.studentName)}</td>
                ${renderPointsCell(row.points, labels)}
                ${renderAttendanceCell(row.attendance, labels)}
                ${renderHomeworkCell(row.homework)}
                ${renderTestsCell(row.tests)}
            </tr>`
            )
            .join('');
        return `<table class="classroom-term-summary-table">
            <thead><tr>
                <th>${escapeHtml(labels.colStudent)}</th>
                <th>${escapeHtml(labels.colPoints)}</th>
                <th>${escapeHtml(labels.colAttendance)}</th>
                <th>${escapeHtml(labels.colHomework)}</th>
                <th>${escapeHtml(labels.colTests)}</th>
            </tr></thead>
            <tbody>${rows || `<tr><td colspan="5">${escapeHtml(labels.noStudents)}</td></tr>`}</tbody>
        </table>`;
    }

    function renderClassTermSummaryArticle(payload, labels) {
        const p = payload || {};
        const meta = [
            p.calendarName,
            formatDateRange(p.termFrom, p.termTo, labels)
        ]
            .filter(Boolean)
            .join(' · ');
        return `<article class="classroom-term-summary-sheet classroom-term-summary-sheet--class">
            <header class="classroom-term-summary-header">
                <h2 class="classroom-term-summary-title">${escapeHtml(p.className || '')}</h2>
                <p class="classroom-term-summary-meta">${escapeHtml(meta)}</p>
            </header>
            ${renderStudentTable(p.students, labels)}
        </article>`;
    }

    function renderStudentClassSection(section, labels) {
        const s = section || {};
        const meta = formatDateRange(s.termFrom, s.termTo, labels);
        return `<section class="classroom-term-summary-class-block">
            <h3 class="classroom-term-summary-class-name">${escapeHtml(s.className || '')}</h3>
            <p class="classroom-term-summary-meta">${escapeHtml(meta)}</p>
            <table class="classroom-term-summary-table classroom-term-summary-table--compact">
                <thead><tr>
                    <th>${escapeHtml(labels.colPoints)}</th>
                    <th>${escapeHtml(labels.colAttendance)}</th>
                    <th>${escapeHtml(labels.colHomework)}</th>
                    <th>${escapeHtml(labels.colTests)}</th>
                </tr></thead>
                <tbody><tr>
                    ${renderPointsCell(s.points, labels)}
                    ${renderAttendanceCell(s.attendance, labels)}
                    ${renderHomeworkCell(s.homework)}
                    ${renderTestsCell(s.tests)}
                </tr></tbody>
            </table>
        </section>`;
    }

    function renderStudentTermSummaryArticle(payload, labels) {
        const p = payload || {};
        const sections = (p.classes || [])
            .map((section) => renderStudentClassSection(section, labels))
            .join('');
        return `<article class="classroom-term-summary-sheet classroom-term-summary-sheet--student">
            <header class="classroom-term-summary-header">
                <h2 class="classroom-term-summary-title">${escapeHtml(p.studentName || '')}</h2>
                <p class="classroom-term-summary-meta">${escapeHtml(p.calendarName || '')}</p>
            </header>
            ${sections || `<p class="classroom-term-summary-empty">${escapeHtml(labels.noClasses)}</p>`}
        </article>`;
    }

    function renderClassTermSummaryDocumentHtml(payloads, labels, options) {
        const opts = options || {};
        const articles = (payloads || [])
            .map((payload, index) => {
                const html = renderClassTermSummaryArticle(payload, labels);
                if (index > 0 && opts.pageBreakBetween) {
                    return `<div class="classroom-term-summary-page-break">${html}</div>`;
                }
                return html;
            })
            .join('');
        return `<div class="classroom-term-summary-root">${articles}</div>`;
    }

    function renderStudentTermSummaryDocumentHtml(payload, labels) {
        return `<div class="classroom-term-summary-root">${renderStudentTermSummaryArticle(payload, labels)}</div>`;
    }

    function getTermSummaryPrintStyles() {
        return `
.classroom-term-summary-root { font-family: system-ui, sans-serif; color: #111; }
.classroom-term-summary-sheet { margin: 0 0 1.5rem; }
.classroom-term-summary-page-break { page-break-before: always; }
.classroom-term-summary-header { margin-bottom: 0.75rem; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
.classroom-term-summary-title { margin: 0 0 0.25rem; font-size: 1.25rem; }
.classroom-term-summary-meta { margin: 0; font-size: 0.875rem; color: #444; }
.classroom-term-summary-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
.classroom-term-summary-table th,
.classroom-term-summary-table td { border: 1px solid #ccc; padding: 0.35rem 0.5rem; vertical-align: top; text-align: left; }
.classroom-term-summary-table th { background: #f3f3f3; }
.classroom-term-summary-sub { font-size: 0.75rem; color: #555; margin-top: 0.2rem; }
.classroom-term-summary-class-block { margin-bottom: 1rem; }
.classroom-term-summary-class-name { margin: 0 0 0.25rem; font-size: 1rem; }
.classroom-term-summary-empty { color: #666; }
@media print {
    .classroom-term-summary-page-break { page-break-before: always; }
    .classroom-term-summary-sheet { page-break-inside: avoid; }
}`;
    }

    function buildPrintDocumentHtml(bodyHtml, title, cssHref, inlineCss) {
        const safeTitle = escapeHtml(title || 'Term summary');
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${safeTitle}</title>
${cssHref ? `<link rel="stylesheet" href="${escapeHtml(cssHref)}">` : ''}
<style>${inlineCss || getTermSummaryPrintStyles()}</style>
</head>
<body class="app-print-term-summary-doc">
<div class="app-print-document app-print-document--term-summary">${bodyHtml || ''}</div>
</body>
</html>`;
    }

    global.CCPClassroomTermSummaryPrint = {
        escapeHtml,
        renderClassTermSummaryArticle,
        renderStudentTermSummaryArticle,
        renderClassTermSummaryDocumentHtml,
        renderStudentTermSummaryDocumentHtml,
        getTermSummaryPrintStyles,
        buildPrintDocumentHtml
    };
})(typeof window !== 'undefined' ? window : globalThis);
