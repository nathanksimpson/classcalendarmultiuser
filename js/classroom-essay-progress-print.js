/**
 * Printable HTML for essay grading progress report.
 */
(function (global) {
    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderAssignmentRow(row, labels) {
        const r = row || {};
        const c = r.counts || {};
        const ssFlag = r.ssOverdue ? labels.overdue : '';
        const teFlag = r.teOverdue ? labels.overdue : '';
        return `<tr>
            <td>${escapeHtml(r.assignmentLabel || '')}</td>
            <td>${escapeHtml(r.lessonDate || '')}</td>
            <td>${escapeHtml(String(r.totalStudents || 0))}</td>
            <td>${escapeHtml(String(c.not_submitted || 0))}</td>
            <td>${escapeHtml(String(c.submitted || 0))}</td>
            <td>${escapeHtml(String(c.complete || 0))}</td>
            <td>${escapeHtml(String(c.resubmit_required || 0))}</td>
            <td>${escapeHtml(r.ssDueDate || '')}${ssFlag ? ` <span class="essay-progress-overdue">${escapeHtml(ssFlag)}</span>` : ''}</td>
            <td>${escapeHtml(r.teacherEvalDueDate || '')}${teFlag ? ` <span class="essay-progress-overdue">${escapeHtml(teFlag)}</span>` : ''}</td>
            <td>${escapeHtml(String(r.percentComplete != null ? r.percentComplete : 0))}%</td>
        </tr>`;
    }

    function renderClassSection(group, labels) {
        const rows = (group.rows || []).map((row) => renderAssignmentRow(row, labels)).join('');
        return `<section class="essay-progress-class-block">
            <h2 class="essay-progress-class-title">${escapeHtml(group.className || '')}</h2>
            <table class="essay-progress-table">
                <thead><tr>
                    <th>${escapeHtml(labels.colAssignment)}</th>
                    <th>${escapeHtml(labels.colLessonDate)}</th>
                    <th>${escapeHtml(labels.colTotal)}</th>
                    <th>${escapeHtml(labels.colNotSubmitted)}</th>
                    <th>${escapeHtml(labels.colSubmitted)}</th>
                    <th>${escapeHtml(labels.colComplete)}</th>
                    <th>${escapeHtml(labels.colResubmit)}</th>
                    <th>${escapeHtml(labels.colSsDue)}</th>
                    <th>${escapeHtml(labels.colTeDue)}</th>
                    <th>${escapeHtml(labels.colPercentComplete)}</th>
                </tr></thead>
                <tbody>${rows || `<tr><td colspan="10">${escapeHtml(labels.noAssignments)}</td></tr>`}</tbody>
            </table>
        </section>`;
    }

    function renderDocumentHtml(payload, labels) {
        const p = payload || {};
        const groups = Array.isArray(p.groups) ? p.groups : [];
        const generatedAt = p.generatedAt || '';
        const title = labels.title || 'Essay grading progress';
        const sections = groups.map((g) => renderClassSection(g, labels)).join('');
        return `<div class="essay-progress-root">
            <header class="essay-progress-header">
                <h1 class="essay-progress-title">${escapeHtml(title)}</h1>
                ${p.calendarName ? `<p class="essay-progress-meta">${escapeHtml(p.calendarName)}</p>` : ''}
                ${generatedAt ? `<p class="essay-progress-meta">${escapeHtml(labels.generatedAt)}: ${escapeHtml(generatedAt)}</p>` : ''}
            </header>
            ${sections || `<p class="essay-progress-empty">${escapeHtml(labels.noAssignments)}</p>`}
        </div>`;
    }

    const PRINT_STYLES = `
.essay-progress-root { font-family: system-ui, sans-serif; color: #111; font-size: 11pt; }
.essay-progress-header { margin-bottom: 1rem; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
.essay-progress-title { margin: 0 0 0.25rem; font-size: 16pt; }
.essay-progress-meta { margin: 0.15rem 0; color: #444; font-size: 10pt; }
.essay-progress-class-block { margin: 0 0 1.25rem; page-break-inside: avoid; }
.essay-progress-class-title { margin: 0 0 0.35rem; font-size: 12pt; }
.essay-progress-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
.essay-progress-table th, .essay-progress-table td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
.essay-progress-table th { background: #f4f4f4; }
.essay-progress-overdue { color: #c92a2a; font-weight: 600; }
.essay-progress-empty { color: #666; }
`;

    global.CCPClassroomEssayProgressPrint = {
        renderDocumentHtml,
        PRINT_STYLES
    };
})(typeof window !== 'undefined' ? window : globalThis);
