/**
 * Printable HTML for essay student progress report.
 */
(function (global) {
    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderNotSubmittedLine(row, labels) {
        const r = row || {};
        const overdueLabel =
            r.ssOverdue &&
            (r.ssOverdueKind === 'received_late' || r.submissionLate
                ? labels.receivedLate || labels.overdue
                : labels.overdue);
        const overdue = overdueLabel
            ? ` <span class="essay-progress-overdue">(${escapeHtml(overdueLabel)})</span>`
            : '';
        return `<li class="essay-progress-student-line">${escapeHtml(r.studentName || '')}${overdue}</li>`;
    }

    function renderResubmitLine(row, labels) {
        const r = row || {};
        const note = String(r.note || '').trim() || labels.noReason;
        const retest = r.submittedRetest
            ? ` <span class="essay-progress-retest">[${escapeHtml(labels.retestReceived)}]</span>`
            : '';
        return `<li class="essay-progress-student-line"><strong>${escapeHtml(r.studentName || '')}</strong> — ${escapeHtml(note)}${retest}</li>`;
    }

    function renderStudentSection(title, lines, emptyLabel) {
        if (!lines) {
            return '';
        }
        const body = lines || `<li class="essay-progress-student-line essay-progress-student-line--empty">${escapeHtml(emptyLabel)}</li>`;
        return `<div class="essay-progress-student-section">
            <h4 class="essay-progress-student-section-title">${escapeHtml(title)}</h4>
            <ul class="essay-progress-student-list">${body}</ul>
        </div>`;
    }

    function renderAssignmentBlock(assignment, labels) {
        const a = assignment || {};
        const notSubmitted = (a.notSubmitted || [])
            .map((row) => renderNotSubmittedLine(row, labels))
            .join('');
        const resubmit = (a.resubmit || [])
            .map((row) => renderResubmitLine(row, labels))
            .join('');
        const sections = [
            renderStudentSection(
                labels.sectionNotSubmitted,
                notSubmitted,
                labels.noStudentsInSection
            ),
            renderStudentSection(labels.sectionResubmit, resubmit, labels.noStudentsInSection)
        ].join('');
        return `<div class="essay-progress-assignment-block">
            <h3 class="essay-progress-assignment-title">${escapeHtml(a.assignmentLabel || '')}</h3>
            ${sections}
        </div>`;
    }

    function renderClassSection(group, labels) {
        const g = group || {};
        const meta = [g.classTypeLabel, g.levelLabel].filter(Boolean).join(' · ');
        const title = meta ? `${g.className || ''} (${meta})` : g.className || '';
        const assignments = (g.assignments || [])
            .map((a) => renderAssignmentBlock(a, labels))
            .join('');
        return `<section class="essay-progress-class-block">
            <h2 class="essay-progress-class-title">${escapeHtml(title)}</h2>
            ${assignments}
        </section>`;
    }

    function renderDocumentHtml(payload, labels) {
        const p = payload || {};
        const groups = Array.isArray(p.groups) ? p.groups : [];
        const generatedAt = p.generatedAt || '';
        const title = labels.title || 'Essay student progress';
        const sections = groups.map((g) => renderClassSection(g, labels)).join('');
        return `<div class="essay-progress-root">
            <header class="essay-progress-header">
                <h1 class="essay-progress-title">${escapeHtml(title)}</h1>
                ${p.calendarName ? `<p class="essay-progress-meta">${escapeHtml(p.calendarName)}</p>` : ''}
                ${generatedAt ? `<p class="essay-progress-meta">${escapeHtml(labels.generatedAt)}: ${escapeHtml(generatedAt)}</p>` : ''}
            </header>
            ${sections || `<p class="essay-progress-empty">${escapeHtml(labels.noStudents)}</p>`}
        </div>`;
    }

    const PRINT_STYLES = `
.essay-progress-root { font-family: system-ui, sans-serif; color: #111; font-size: 11pt; }
.essay-progress-header { margin-bottom: 1rem; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
.essay-progress-title { margin: 0 0 0.25rem; font-size: 16pt; }
.essay-progress-meta { margin: 0.15rem 0; color: #444; font-size: 10pt; }
.essay-progress-class-block { margin: 0 0 1.25rem; page-break-inside: avoid; }
.essay-progress-class-title { margin: 0 0 0.5rem; font-size: 12pt; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; }
.essay-progress-assignment-block { margin: 0 0 0.75rem 0.5rem; }
.essay-progress-assignment-title { margin: 0 0 0.35rem; font-size: 10.5pt; color: #333; }
.essay-progress-student-section { margin: 0 0 0.5rem 0.25rem; }
.essay-progress-student-section-title { margin: 0 0 0.15rem; font-size: 10pt; color: #444; }
.essay-progress-student-list { margin: 0; padding-left: 1.25rem; }
.essay-progress-student-line { margin: 0.15rem 0; }
.essay-progress-student-line--empty { color: #666; font-style: italic; list-style: none; margin-left: -1.25rem; }
.essay-progress-overdue { color: #c92a2a; font-weight: 600; }
.essay-progress-retest { color: #555; font-weight: 600; }
.essay-progress-empty { color: #666; }
`;

    global.CCPClassroomEssayProgressPrint = {
        renderDocumentHtml,
        PRINT_STYLES
    };
})(typeof window !== 'undefined' ? window : globalThis);
