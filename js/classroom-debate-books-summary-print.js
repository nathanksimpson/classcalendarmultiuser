/**
 * Printable HTML for Books class summary sheets.
 */
(function (global) {
    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function statusLabel(status, labels) {
        const map = (labels && labels.statusLabels) || {};
        return map[status] || status || '';
    }

    function statusCssClass(status) {
        const api = global.CCPClassroomDebateBooksSummary;
        if (api && typeof api.statusCssClass === 'function') {
            return api.statusCssClass(status);
        }
        const map = {
            not_issued: 'debate-book-summary-status--not-issued',
            issued: 'debate-book-summary-status--issued',
            missing: 'debate-book-summary-status--missing'
        };
        return map[status] || map.not_issued;
    }

    function formatStudentName(row) {
        const api = global.CCPClassroomDebateBooksSummary;
        if (api && typeof api.formatStudentDisplayName === 'function') {
            return api.formatStudentDisplayName(row);
        }
        return String(row.studentName || '').trim();
    }

    function renderStudentRow(row, labels) {
        const r = row || {};
        const chipCls = statusCssClass(r.status);
        const label = statusLabel(r.status, labels);
        const note = String(r.note || '').trim();
        return `<tr class="debate-book-class-summary-row">
            <td class="debate-book-class-summary-col-index">${escapeHtml(String(r.rosterIndex || ''))}</td>
            <td class="debate-book-class-summary-col-student">${escapeHtml(formatStudentName(r))}</td>
            <td class="debate-book-class-summary-col-status">
                <span class="debate-book-class-summary-status-chip ${escapeHtml(chipCls)}">${escapeHtml(label)}</span>
            </td>
            <td class="debate-book-class-summary-col-notes">${escapeHtml(note || '—')}</td>
        </tr>`;
    }

    function renderPeriodTable(period, labels) {
        const p = period || {};
        const students = (p.students || []).map((row) => renderStudentRow(row, labels)).join('');
        const empty = `<tr><td colspan="4" class="debate-book-class-summary-empty">${escapeHtml(labels.noStudentsInSection || '')}</td></tr>`;
        return `<div class="debate-book-class-summary-period-block">
            <h3 class="debate-book-class-summary-period-title">${escapeHtml(p.periodLabel || p.periodKey || '')}</h3>
            <table class="debate-book-class-summary-table">
                <thead>
                    <tr>
                        <th scope="col">#</th>
                        <th scope="col">${escapeHtml(labels.colStudent || 'Student')}</th>
                        <th scope="col">${escapeHtml(labels.colStatus || 'Status')}</th>
                        <th scope="col">${escapeHtml(labels.colNotes || 'Notes')}</th>
                    </tr>
                </thead>
                <tbody>${students || empty}</tbody>
            </table>
        </div>`;
    }

    function renderClassSection(classGroup, labels) {
        const g = classGroup || {};
        const meta = [g.classTypeLabel, g.levelLabel].filter(Boolean).join(' · ');
        const title = meta ? `${g.className || ''} (${meta})` : g.className || '';
        const periods = (g.periods || []).map((p) => renderPeriodTable(p, labels)).join('');
        return `<section class="debate-book-class-summary-class-block">
            <h2 class="debate-book-class-summary-class-title">${escapeHtml(title)}</h2>
            ${periods}
        </section>`;
    }

    function renderHomeroomSection(hrGroup, labels) {
        const g = hrGroup || {};
        const noKey =
            (global.CCPClassroomDebateBooksSummary &&
                global.CCPClassroomDebateBooksSummary.NO_HOMEROOM_KEY) ||
            '__no_homeroom__';
        const hrLabel =
            g.homeroomKey === noKey
                ? labels.noHomeroom || 'No homeroom'
                : g.homeroomLabel || g.homeroomKey || labels.noHomeroom || 'No homeroom';
        const heading = labels.hrHeading
            ? String(labels.hrHeading).replace('{name}', hrLabel)
            : `HR Teacher: ${hrLabel}`;
        const classes = (g.classes || []).map((c) => renderClassSection(c, labels)).join('');
        return `<section class="debate-book-class-summary-hr-block">
            <h2 class="debate-book-class-summary-hr-title">${escapeHtml(heading)}</h2>
            ${classes}
        </section>`;
    }

    function renderDocumentHtml(payload, labels) {
        const p = payload || {};
        const L = labels || {};
        const groups = Array.isArray(p.groups) ? p.groups : [];
        const generatedAt = p.generatedAt || '';
        const title = L.title || 'Books class summary';
        const sections = groups.map((g) => renderHomeroomSection(g, L)).join('');
        return `<div class="debate-book-class-summary-root">
            <header class="debate-book-class-summary-header">
                <h1 class="debate-book-class-summary-doc-title">${escapeHtml(title)}</h1>
                ${p.calendarName ? `<p class="debate-book-class-summary-meta">${escapeHtml(p.calendarName)}</p>` : ''}
                ${generatedAt ? `<p class="debate-book-class-summary-meta">${escapeHtml(L.generatedAt || 'Generated')}: ${escapeHtml(generatedAt)}</p>` : ''}
            </header>
            ${sections || `<p class="debate-book-class-summary-empty">${escapeHtml(L.noStudents || '')}</p>`}
        </div>`;
    }

    const PRINT_STYLES = `
.debate-book-class-summary-root { font-family: system-ui, sans-serif; color: #111; font-size: 10.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.debate-book-class-summary-header { margin-bottom: 1rem; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
.debate-book-class-summary-doc-title { margin: 0 0 0.25rem; font-size: 16pt; }
.debate-book-class-summary-meta { margin: 0.15rem 0; color: #444; font-size: 10pt; }
.debate-book-class-summary-hr-block { margin: 0 0 1.5rem; }
.debate-book-class-summary-hr-block + .debate-book-class-summary-hr-block { page-break-before: always; break-before: page; }
.debate-book-class-summary-hr-title { margin: 0 0 0.75rem; font-size: 14pt; border-bottom: 2px solid #333; padding-bottom: 0.25rem; }
.debate-book-class-summary-class-block { margin: 0 0 1rem 0.25rem; }
.debate-book-class-summary-class-title { margin: 0 0 0.5rem; font-size: 12pt; }
.debate-book-class-summary-period-block { margin: 0 0 0.75rem 0.35rem; page-break-inside: avoid; break-inside: avoid; }
.debate-book-class-summary-period-title { margin: 0 0 0.35rem; font-size: 10.5pt; color: #333; }
.debate-book-class-summary-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 0.5rem; }
.debate-book-class-summary-table th, .debate-book-class-summary-table td { border: 1px solid #ccc; padding: 0.2rem 0.35rem; text-align: left; vertical-align: top; }
.debate-book-class-summary-table th { background: #f1f4f8; font-weight: 600; }
.debate-book-class-summary-col-index { width: 2rem; text-align: right; }
.debate-book-class-summary-status-chip { display: inline-block; padding: 0.1rem 0.45rem; border-radius: 4px; font-size: 8.5pt; font-weight: 600; color: #fff; border: 1px solid transparent; }
.debate-book-class-summary-status-chip.debate-book-summary-status--not-issued { background: #b6c0cf; border-color: #b6c0cf; color: #1f2937; }
.debate-book-class-summary-status-chip.debate-book-summary-status--issued { background: #14b98f; border-color: #14b98f; }
.debate-book-class-summary-status-chip.debate-book-summary-status--missing { background: #dc2626; border-color: #dc2626; }
.debate-book-class-summary-empty { color: #666; font-style: italic; }
@media print {
    .debate-book-class-summary-header { page-break-after: avoid; break-after: avoid; }
    .debate-book-class-summary-hr-title { page-break-after: avoid; break-after: avoid-page; }
    .debate-book-class-summary-class-title { page-break-after: avoid; break-after: avoid-page; }
    .debate-book-class-summary-period-title { page-break-after: avoid; break-after: avoid-page; }
}
`;

    global.CCPClassroomDebateBooksSummaryPrint = {
        renderDocumentHtml,
        PRINT_STYLES
    };
})(typeof window !== 'undefined' ? window : globalThis);
