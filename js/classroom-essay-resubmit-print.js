/**
 * Printable HTML for essay overdue + resubmit summary.
 */
(function (global) {
    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderOverdueStudentLine(row, labels) {
        const r = row || {};
        const dueMeta =
            r.ssDueDate && r.ssOverdue
                ? ` <span class="essay-resubmit-overdue-meta">(${escapeHtml(labels.overdue)}: ${escapeHtml(r.ssDueDate)})</span>`
                : '';
        return `<li class="essay-resubmit-student-line"><strong>${escapeHtml(r.studentName || '')}</strong>${dueMeta}</li>`;
    }

    function renderResubmitStudentLine(row, labels) {
        const r = row || {};
        const note = String(r.note || '').trim() || labels.noReason;
        const retest = r.submittedRetest ? ` [${labels.retestReceived}]` : '';
        return `<li class="essay-resubmit-student-line"><strong>${escapeHtml(r.studentName || '')}</strong> — ${escapeHtml(note)}${retest ? `<span class="essay-resubmit-retest">${escapeHtml(retest)}</span>` : ''}</li>`;
    }

    function renderSection(title, students, labels, renderer) {
        const lines = (students || []).map((row) => renderer(row, labels)).join('');
        return `<div class="essay-resubmit-assignment-section">
            <h4 class="essay-resubmit-section-title">${escapeHtml(title)}</h4>
            <ul class="essay-resubmit-student-list">${lines || `<li>${escapeHtml(labels.noStudentsInSection)}</li>`}</ul>
        </div>`;
    }

    function renderAssignmentBlock(assignment, labels) {
        const a = assignment || {};
        const overdueSection = renderSection(
            labels.sectionOverdue,
            a.notSubmitted || [],
            labels,
            renderOverdueStudentLine
        );
        const resubmitSection = renderSection(
            labels.sectionResubmit,
            a.resubmit || [],
            labels,
            renderResubmitStudentLine
        );
        return `<div class="essay-resubmit-assignment-block">
            <h3 class="essay-resubmit-assignment-title">${escapeHtml(a.assignmentLabel || '')}</h3>
            ${overdueSection}
            ${resubmitSection}
        </div>`;
    }

    function renderClassSection(group, labels) {
        const g = group || {};
        const meta = [g.classTypeLabel, g.levelLabel].filter(Boolean).join(' · ');
        const title = meta ? `${g.className || ''} (${meta})` : g.className || '';
        const assignments = (g.assignments || [])
            .map((a) => renderAssignmentBlock(a, labels))
            .join('');
        return `<section class="essay-resubmit-class-block">
            <h2 class="essay-resubmit-class-title">${escapeHtml(title)}</h2>
            ${assignments}
        </section>`;
    }

    function renderDocumentHtml(payload, labels) {
        const p = payload || {};
        const groups = Array.isArray(p.groups) ? p.groups : [];
        const generatedAt = p.generatedAt || '';
        const title = labels.title || 'Essay OD-RS report';
        const sections = groups.map((g) => renderClassSection(g, labels)).join('');
        return `<div class="essay-resubmit-root">
            <header class="essay-resubmit-header">
                <h1 class="essay-resubmit-title">${escapeHtml(title)}</h1>
                ${p.calendarName ? `<p class="essay-resubmit-meta">${escapeHtml(p.calendarName)}</p>` : ''}
                ${generatedAt ? `<p class="essay-resubmit-meta">${escapeHtml(labels.generatedAt)}: ${escapeHtml(generatedAt)}</p>` : ''}
            </header>
            ${sections || `<p class="essay-resubmit-empty">${escapeHtml(labels.noRows)}</p>`}
        </div>`;
    }

    const PRINT_STYLES = `
.essay-resubmit-root { font-family: system-ui, sans-serif; color: #111; font-size: 11pt; }
.essay-resubmit-header { margin-bottom: 1rem; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
.essay-resubmit-title { margin: 0 0 0.25rem; font-size: 16pt; }
.essay-resubmit-meta { margin: 0.15rem 0; color: #444; font-size: 10pt; }
.essay-resubmit-class-block { margin: 0 0 1.25rem; page-break-inside: avoid; }
.essay-resubmit-class-title { margin: 0 0 0.5rem; font-size: 12pt; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
.essay-resubmit-assignment-block { margin: 0 0 0.75rem 0.5rem; }
.essay-resubmit-assignment-title { margin: 0 0 0.25rem; font-size: 10.5pt; color: #333; }
.essay-resubmit-assignment-section { margin: 0 0 0.5rem 0; }
.essay-resubmit-section-title { margin: 0 0 0.2rem; font-size: 9.5pt; color: #555; text-transform: uppercase; letter-spacing: 0.04em; }
.essay-resubmit-student-list { margin: 0; padding-left: 1.25rem; }
.essay-resubmit-student-line { margin: 0.15rem 0; }
.essay-resubmit-retest { color: #555; font-weight: 600; }
.essay-resubmit-overdue-meta { color: #555; font-weight: 500; }
.essay-resubmit-empty { color: #666; }
`;

    global.CCPClassroomEssayResubmitPrint = {
        renderDocumentHtml,
        PRINT_STYLES
    };
})(typeof window !== 'undefined' ? window : globalThis);
