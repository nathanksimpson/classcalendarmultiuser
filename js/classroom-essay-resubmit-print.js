/**
 * Printable HTML for essay resubmit summary.
 */
(function (global) {
    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderStudentLine(row, labels) {
        const r = row || {};
        const note = String(r.note || '').trim() || labels.noReason;
        const retest = r.submittedRetest ? ` [${labels.retestReceived}]` : '';
        return `<li class="essay-resubmit-student-line"><strong>${escapeHtml(r.studentName || '')}</strong> — ${escapeHtml(note)}${retest ? `<span class="essay-resubmit-retest">${escapeHtml(retest)}</span>` : ''}</li>`;
    }

    function renderAssignmentBlock(assignment, labels) {
        const a = assignment || {};
        const students = (a.students || []).map((row) => renderStudentLine(row, labels)).join('');
        return `<div class="essay-resubmit-assignment-block">
            <h3 class="essay-resubmit-assignment-title">${escapeHtml(a.assignmentLabel || '')}</h3>
            <ul class="essay-resubmit-student-list">${students || `<li>${escapeHtml(labels.noRows)}</li>`}</ul>
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
        const title = labels.title || 'Essay resubmit summary';
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
.essay-resubmit-student-list { margin: 0; padding-left: 1.25rem; }
.essay-resubmit-student-line { margin: 0.15rem 0; }
.essay-resubmit-retest { color: #555; font-weight: 600; }
.essay-resubmit-empty { color: #666; }
`;

    global.CCPClassroomEssayResubmitPrint = {
        renderDocumentHtml,
        PRINT_STYLES
    };
})(typeof window !== 'undefined' ? window : globalThis);
