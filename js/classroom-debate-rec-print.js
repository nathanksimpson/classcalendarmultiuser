/**
 * Tools → Debate Rec class summary: printable HTML + plain-text copy.
 *
 * Same layout and print styles as the Essays class summary
 * (CCPClassroomEssayClassSummaryPrint): homeroom heading (new page per
 * homeroom) → class → Day 4 table with #, Student, Status chip, TMS, HR notified, Notes.
 * Input comes from CCPClassroomDomain.buildDebateRecClassSummary().
 */
(function (global) {
    'use strict';

    /** Debate Rec status → Essays status chip colour. */
    const CHIP_CLASS = {
        not_recorded: 'essay-status--resubmit',
        needs_confirmation: 'essay-status--demerit',
        present: 'essay-status--complete',
        recorded: 'essay-status--complete',
        received: 'essay-status--complete',
        exempt: 'essay-status--exempt',
        not_checked: 'essay-status--not'
    };

    function escapeHtml(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fill(template, vars) {
        let s = String(template || '');
        Object.keys(vars || {}).forEach((k) => {
            s = s.split(`{${k}}`).join(String(vars[k] == null ? '' : vars[k]));
        });
        return s;
    }

    function shortDate(iso) {
        const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${Number(m[2])}/${Number(m[3])}` : String(iso || '');
    }

    function confirmReasonText(row, labels) {
        const r = row || {};
        const L = labels || {};
        if (r.confirmReason === 'late') {
            return L.confirmLate || '';
        }
        if (r.confirmReason === 'early_leave') {
            return L.confirmEarly || '';
        }
        if (r.confirmReason === 'new_student') {
            return L.confirmNew || '';
        }
        if (r.confirmReason === 'other') {
            return r.confirmReasonDetail || '';
        }
        return '';
    }

    function statusLabel(status, labels, row) {
        const base = (labels && labels.statusLabels && labels.statusLabels[status]) || status || '';
        if (status !== 'needs_confirmation') {
            return base;
        }
        const reason = confirmReasonText(row, labels);
        return reason ? `${base} — ${reason}` : base;
    }

    function displayName(row) {
        const r = row || {};
        return r.nameEn ? `${r.studentName} (${r.nameEn})` : String(r.studentName || '');
    }

    function tmsText(row, labels) {
        const r = row || {};
        const reason = r.reason && labels && labels.reasonLabels ? labels.reasonLabels[r.reason] || '' : '';
        const raw = r.tmsStatus ? (r.tmsMemo ? `${r.tmsStatus} (${r.tmsMemo})` : r.tmsStatus) : '';
        // Reason already says "Absent" / "Late arrival"…; keep the raw TMS text for the memo.
        return [reason, raw].filter(Boolean).join(' · ');
    }

    function hrText(row, labels) {
        const L = labels || {};
        return row && row.hrNotified ? (L.hrYes || 'Yes') : (L.hrNo || 'No');
    }

    function notesText(row, labels) {
        const r = row || {};
        const parts = [];
        if (r.note) {
            parts.push(r.note);
        }
        if (r.source === 'teacher' && r.updatedByName) {
            parts.push(fill(labels.setBy || '{name} · {date}', { name: r.updatedByName, date: shortDate(r.updatedAt) }));
        }
        return parts.join(' · ');
    }

    function classTitle(c, labels) {
        const meta = [[c.grade, c.levelLabel].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
        return meta ? `${c.className || ''} (${meta})` : c.className || '';
    }

    function dayTitle(a, labels) {
        const counts = (a.students || []).reduce((acc, r) => {
            if (r.status === 'not_recorded' || r.status === 'needs_confirmation') {
                acc.open += 1;
            } else if (r.status !== 'not_checked') {
                acc.done += 1;
            }
            return acc;
        }, { open: 0, done: 0 });
        const src = a.dateSource === 'tms' ? labels.dateFromTms : labels.dateFromSyllabus;
        const unchecked = a.checked === false && labels.notCheckedNote ? ` · ${labels.notCheckedNote}` : '';
        return `${fill(labels.dayHeading, { date: shortDate(a.date) })} (${src}) · ${fill(labels.dayCounts, { done: counts.done, open: counts.open })}${unchecked}`;
    }

    function homeroomHeading(g, labels) {
        const name = g.homeroomUserId ? g.homeroomLabel : (labels.noHomeroom || 'No homeroom');
        return labels.hrHeading ? String(labels.hrHeading).replace('{name}', name) : `HR Teacher: ${name}`;
    }

    function renderStudentRow(r, labels) {
        const chip = CHIP_CLASS[r.status] || 'essay-status--not';
        return `<tr class="essay-class-summary-row">
            <td class="essay-class-summary-col-index">${escapeHtml(String(r.rosterIndex || ''))}</td>
            <td class="essay-class-summary-col-student">${escapeHtml(displayName(r))}</td>
            <td class="essay-class-summary-col-status"><span class="essay-class-summary-status-chip ${chip}">${escapeHtml(statusLabel(r.status, labels, r))}</span></td>
            <td class="essay-class-summary-col-due">${escapeHtml(tmsText(r, labels)) || '—'}</td>
            <td class="essay-class-summary-col-due">${escapeHtml(hrText(r, labels))}</td>
            <td class="essay-class-summary-col-notes">${escapeHtml(notesText(r, labels)) || '—'}</td>
        </tr>`;
    }

    function renderDay(a, labels) {
        const rows = (a.students || []).map((r) => renderStudentRow(r, labels)).join('');
        return `<div class="essay-class-summary-assignment-block">
            <h3 class="essay-class-summary-assignment-title">${escapeHtml(dayTitle(a, labels))}</h3>
            <table class="essay-class-summary-table">
                <thead><tr>
                    <th scope="col">#</th>
                    <th scope="col">${escapeHtml(labels.colStudent || 'Student')}</th>
                    <th scope="col">${escapeHtml(labels.colStatus || 'Status')}</th>
                    <th scope="col">${escapeHtml(labels.colTms || 'TMS')}</th>
                    <th scope="col">${escapeHtml(labels.colHr || 'HR notified')}</th>
                    <th scope="col">${escapeHtml(labels.colNotes || 'Notes')}</th>
                </tr></thead>
                <tbody>${rows || `<tr><td colspan="6" class="essay-class-summary-empty">${escapeHtml(labels.noStudentsInSection || '')}</td></tr>`}</tbody>
            </table>
        </div>`;
    }

    function renderClass(c, labels) {
        return `<section class="essay-class-summary-class-block">
            <h2 class="essay-class-summary-class-title">${escapeHtml(classTitle(c, labels))}</h2>
            ${(c.assignments || []).map((a) => renderDay(a, labels)).join('')}
        </section>`;
    }

    function renderHomeroom(g, labels) {
        return `<section class="essay-class-summary-hr-block">
            <h2 class="essay-class-summary-hr-title">${escapeHtml(homeroomHeading(g, labels))}</h2>
            ${(g.classes || []).map((c) => renderClass(c, labels)).join('')}
        </section>`;
    }

    /**
     * @param {{ title?: string, calendarName?: string, generatedAt?: string, scopeNote?: string, groups: object[] }} payload
     */
    function renderDocumentHtml(payload, labels) {
        const p = payload || {};
        const L = labels || {};
        const groups = Array.isArray(p.groups) ? p.groups : [];
        const sections = groups.map((g) => renderHomeroom(g, L)).join('');
        return `<div class="essay-class-summary-root">
            <header class="essay-class-summary-header">
                <h1 class="essay-class-summary-doc-title">${escapeHtml(p.title || L.title || '')}</h1>
                ${p.calendarName ? `<p class="essay-class-summary-meta">${escapeHtml(p.calendarName)}</p>` : ''}
                ${p.scopeNote ? `<p class="essay-class-summary-meta">${escapeHtml(p.scopeNote)}</p>` : ''}
                ${p.generatedAt ? `<p class="essay-class-summary-meta">${escapeHtml(L.generatedAt || 'Generated')}: ${escapeHtml(p.generatedAt)}</p>` : ''}
            </header>
            ${sections || `<p class="essay-class-summary-empty">${escapeHtml(L.noStudents || '')}</p>`}
        </div>`;
    }

    function plain(text) {
        return String(text == null ? '' : text).replace(/[—–−]/g, '-');
    }

    /** Plain text in the Essays class summary copy format. */
    function formatCopyText(groups, labels) {
        const L = labels || {};
        const lines = [];
        const list = Array.isArray(groups) ? groups : [];
        if (!list.length) {
            return plain(L.noStudents || '');
        }
        list.forEach((g, gi) => {
            if (gi > 0) {
                lines.push('');
            }
            lines.push(homeroomHeading(g, L));
            (g.classes || []).forEach((c, ci) => {
                (c.assignments || []).forEach((a, ai) => {
                    if (ci > 0 || ai > 0) {
                        lines.push('');
                    }
                    lines.push(`-- ${classTitle(c, L)} - ${dayTitle(a, L)} --`);
                    (a.students || []).forEach((r) => {
                        let line = `${r.rosterIndex}. ${displayName(r)}\t${statusLabel(r.status, L, r)}`;
                        const tms = tmsText(r, L);
                        const notes = notesText(r, L);
                        if (tms) {
                            line += ` - TMS ${tms}`;
                        }
                        if (notes) {
                            line += ` - ${notes}`;
                        }
                        line += ` - ${L.colHr || 'HR notified'} ${hrText(r, L)}`;
                        lines.push(line);
                    });
                });
            });
        });
        return plain(lines.join('\n').trimEnd());
    }

    /** Parent text for a missed Debate Day 4 recording (see classroom-parent-messages.js). */
    function buildParentMessage(info, lang) {
        const api = global.CCPParentMessages;
        return api ? api.debateRecording(info, lang) : '';
    }

    global.CCPClassroomDebateRecPrint = {
        CHIP_CLASS,
        buildParentMessage,
        renderDocumentHtml,
        formatCopyText,
        get PRINT_STYLES() {
            const api = global.CCPClassroomEssayClassSummaryPrint;
            return api ? api.PRINT_STYLES : '';
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
