/**
 * Printable HTML for essay class summary sheets (full roster, status chips).
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
        const api = global.CCPClassroomEssayClassSummary;
        if (api && typeof api.statusCssClass === 'function') {
            return api.statusCssClass(status);
        }
        const map = {
            not_submitted: 'essay-status--not',
            submitted: 'essay-status--submitted',
            complete: 'essay-status--complete',
            resubmit_required: 'essay-status--resubmit',
            incomplete: 'essay-status--incomplete',
            exempt: 'essay-status--exempt'
        };
        return map[status] || map.not_submitted;
    }

    function renderNotesCell(row, labels) {
        const r = row || {};
        const parts = [];
        const note = String(r.note || '').trim();
        if (note) {
            parts.push(escapeHtml(note));
        }
        if (r.submittedRetest && labels.retestReceived) {
            parts.push(
                `<span class="essay-class-summary-retest">[${escapeHtml(labels.retestReceived)}]</span>`
            );
        }
        return parts.join(' ') || '—';
    }

    function renderDueCell(row, labels) {
        const r = row || {};
        const due = String(r.ssDueDate || '').trim();
        if (!due) {
            return '—';
        }
        const overdue =
            r.ssOverdue && labels.overdue
                ? ` <span class="essay-class-summary-overdue">(${escapeHtml(labels.overdue)})</span>`
                : '';
        return `${escapeHtml(due)}${overdue}`;
    }

    function renderStudentRow(row, labels) {
        const r = row || {};
        const chipCls = statusCssClass(r.status);
        const label = statusLabel(r.status, labels);
        return `<tr class="essay-class-summary-row">
            <td class="essay-class-summary-col-index">${escapeHtml(String(r.rosterIndex || ''))}</td>
            <td class="essay-class-summary-col-student">${escapeHtml(r.studentName || '')}</td>
            <td class="essay-class-summary-col-status">
                <span class="essay-class-summary-status-chip ${escapeHtml(chipCls)}">${escapeHtml(label)}</span>
            </td>
            <td class="essay-class-summary-col-due">${renderDueCell(r, labels)}</td>
            <td class="essay-class-summary-col-notes">${renderNotesCell(r, labels)}</td>
        </tr>`;
    }

    function renderAssignmentTable(assignment, labels) {
        const a = assignment || {};
        const students = (a.students || []).map((row) => renderStudentRow(row, labels)).join('');
        const empty = `<tr><td colspan="5" class="essay-class-summary-empty">${escapeHtml(labels.noStudentsInSection || '')}</td></tr>`;
        return `<div class="essay-class-summary-assignment-block">
            <h3 class="essay-class-summary-assignment-title">${escapeHtml(a.assignmentLabel || '')}</h3>
            <table class="essay-class-summary-table">
                <thead>
                    <tr>
                        <th scope="col">#</th>
                        <th scope="col">${escapeHtml(labels.colStudent || 'Student')}</th>
                        <th scope="col">${escapeHtml(labels.colStatus || 'Status')}</th>
                        <th scope="col">${escapeHtml(labels.colDue || 'Due')}</th>
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
        const assignments = (g.assignments || [])
            .map((a) => renderAssignmentTable(a, labels))
            .join('');
        return `<section class="essay-class-summary-class-block">
            <h2 class="essay-class-summary-class-title">${escapeHtml(title)}</h2>
            ${assignments}
        </section>`;
    }

    function renderHomeroomSection(hrGroup, labels) {
        const g = hrGroup || {};
        const noKey =
            (global.CCPClassroomEssayClassSummary &&
                global.CCPClassroomEssayClassSummary.NO_HOMEROOM_KEY) ||
            '__no_homeroom__';
        const hrLabel =
            g.homeroomKey === noKey
                ? labels.noHomeroom || 'No homeroom'
                : g.homeroomLabel || g.homeroomKey || labels.noHomeroom || 'No homeroom';
        const heading = labels.hrHeading
            ? String(labels.hrHeading).replace('{name}', hrLabel)
            : `HR Teacher: ${hrLabel}`;
        const classes = (g.classes || []).map((c) => renderClassSection(c, labels)).join('');
        return `<section class="essay-class-summary-hr-block">
            <h1 class="essay-class-summary-hr-title">${escapeHtml(heading)}</h1>
            ${classes}
        </section>`;
    }

    function renderDocumentHtml(payload, labels) {
        const p = payload || {};
        const L = labels || {};
        const groups = Array.isArray(p.groups) ? p.groups : [];
        const generatedAt = p.generatedAt || '';
        const title = L.title || 'Essay class summary';
        const sections = groups.map((g) => renderHomeroomSection(g, L)).join('');
        return `<div class="essay-class-summary-root">
            <header class="essay-class-summary-header">
                <h1 class="essay-class-summary-doc-title">${escapeHtml(title)}</h1>
                ${p.calendarName ? `<p class="essay-class-summary-meta">${escapeHtml(p.calendarName)}</p>` : ''}
                ${generatedAt ? `<p class="essay-class-summary-meta">${escapeHtml(L.generatedAt || 'Generated')}: ${escapeHtml(generatedAt)}</p>` : ''}
            </header>
            ${sections || `<p class="essay-class-summary-empty">${escapeHtml(L.noStudents || '')}</p>`}
        </div>`;
    }

    const PRINT_STYLES = `
.essay-class-summary-root { font-family: system-ui, sans-serif; color: #111; font-size: 10.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.essay-class-summary-header { margin-bottom: 1rem; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
.essay-class-summary-doc-title { margin: 0 0 0.25rem; font-size: 16pt; }
.essay-class-summary-meta { margin: 0.15rem 0; color: #444; font-size: 10pt; }
.essay-class-summary-hr-block { margin: 0 0 1.5rem; page-break-inside: avoid; }
.essay-class-summary-hr-title { margin: 0 0 0.75rem; font-size: 14pt; border-bottom: 2px solid #333; padding-bottom: 0.25rem; }
.essay-class-summary-class-block { margin: 0 0 1rem 0.25rem; }
.essay-class-summary-class-title { margin: 0 0 0.5rem; font-size: 12pt; }
.essay-class-summary-assignment-block { margin: 0 0 0.75rem 0.35rem; }
.essay-class-summary-assignment-title { margin: 0 0 0.35rem; font-size: 10.5pt; color: #333; }
.essay-class-summary-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 0.5rem; }
.essay-class-summary-table th, .essay-class-summary-table td { border: 1px solid #ccc; padding: 0.2rem 0.35rem; text-align: left; vertical-align: top; }
.essay-class-summary-table th { background: #f1f4f8; font-weight: 600; }
.essay-class-summary-col-index { width: 2rem; text-align: right; }
.essay-class-summary-status-chip { display: inline-block; padding: 0.1rem 0.45rem; border-radius: 4px; font-size: 8.5pt; font-weight: 600; color: #fff; border: 1px solid transparent; }
.essay-class-summary-status-chip.essay-status--not { background: #b6c0cf; border-color: #b6c0cf; }
.essay-class-summary-status-chip.essay-status--submitted { background: #3b82f6; border-color: #3b82f6; }
.essay-class-summary-status-chip.essay-status--complete { background: #14b98f; border-color: #14b98f; }
.essay-class-summary-status-chip.essay-status--resubmit { background: #e0863b; border-color: #e0863b; }
.essay-class-summary-status-chip.essay-status--incomplete { background: #64748b; border-color: #64748b; }
.essay-class-summary-status-chip.essay-status--exempt { background: #8b9aab; border-color: #8b9aab; }
.essay-class-summary-overdue { color: #c92a2a; font-weight: 600; }
.essay-class-summary-retest { color: #555; font-weight: 600; }
.essay-class-summary-empty { color: #666; font-style: italic; }
`;

    global.CCPClassroomEssayClassSummaryPrint = {
        renderDocumentHtml,
        PRINT_STYLES
    };
})(typeof window !== 'undefined' ? window : globalThis);
