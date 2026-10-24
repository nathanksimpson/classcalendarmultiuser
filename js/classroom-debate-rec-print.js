/**
 * Tools → Debate Rec reports: printable HTML and plain-text copy.
 * Pure rendering — input comes from CCPClassroomDomain.listDebateRecReportGroups().
 */
(function (global) {
    'use strict';

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

    function statusLabel(status, labels) {
        const L = labels || {};
        return (L.status && L.status[status]) || status || '';
    }

    function tmsText(row) {
        const r = row || {};
        if (!r.tmsStatus) {
            return '';
        }
        return r.tmsMemo ? `${r.tmsStatus} · ${r.tmsMemo}` : r.tmsStatus;
    }

    function setByText(row, labels) {
        const r = row || {};
        if (r.source !== 'teacher') {
            return (labels && labels.fromTms) || '';
        }
        return fill((labels && labels.setBy) || '{name} · {date}', {
            name: r.updatedByName || (labels && labels.teacher) || '',
            date: shortDate(r.updatedAt)
        });
    }

    function renderCounts(counts, labels) {
        const c = counts || {};
        const order = ['not_recorded', 'needs_confirmation', 'received', 'recorded', 'exempt'];
        return order
            .filter((k) => Number(c[k] || 0) > 0)
            .map((k) => `<span class="dr-print-count dr-print-count--${k}">${escapeHtml(statusLabel(k, labels))} ${Number(c[k])}</span>`)
            .join('');
    }

    function renderDay(day, labels) {
        const d = day || {};
        const src = d.dateSource === 'tms' ? labels.dateFromTms : labels.dateFromSyllabus;
        const rows = (d.rows || []).map((r) => `<tr class="dr-print-row dr-print-row--${escapeHtml(r.status)}">
                <td class="dr-print-check" aria-hidden="true"></td>
                <td><strong>${escapeHtml(r.studentName)}</strong>${r.nameEn ? ` <span class="dr-print-en">${escapeHtml(r.nameEn)}</span>` : ''}</td>
                <td>${escapeHtml(tmsText(r)) || '—'}</td>
                <td><span class="dr-print-status dr-print-status--${escapeHtml(r.status)}">${escapeHtml(statusLabel(r.status, labels))}</span><div class="dr-print-setby">${escapeHtml(setByText(r, labels))}</div></td>
                <td>${escapeHtml(r.note || '')}</td>
            </tr>`).join('');
        return `<div class="dr-print-day">
            <h3 class="dr-print-day-title">${escapeHtml(fill(labels.dayHeading, { date: shortDate(d.date) }))} <span class="dr-print-src">(${escapeHtml(src || '')})</span></h3>
            <table class="dr-print-table">
                <thead><tr>
                    <th class="dr-print-check" scope="col"><span class="dr-print-sr">${escapeHtml(labels.colDone)}</span></th>
                    <th scope="col">${escapeHtml(labels.colStudent)}</th>
                    <th scope="col">${escapeHtml(labels.colTms)}</th>
                    <th scope="col">${escapeHtml(labels.colRecording)}</th>
                    <th scope="col">${escapeHtml(labels.colNote)}</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    }

    function renderClass(group, labels) {
        const g = group || {};
        const days = (g.days || []).map((day) => renderDay(day, labels)).join('');
        return `<section class="dr-print-class">
            <h2 class="dr-print-class-title">${escapeHtml(g.className)}${g.homeroomName ? ` <span class="dr-print-hr">${escapeHtml(fill(labels.homeroom, { name: g.homeroomName }))}</span>` : ''}</h2>
            <p class="dr-print-counts">${renderCounts(g.counts, labels)}</p>
            ${days || `<p class="dr-print-empty">${escapeHtml(labels.noRowsClass)}</p>`}
        </section>`;
    }

    /**
     * @param {{ title: string, calendarName?: string, generatedAt?: string, scopeNote?: string, groups: object[] }} payload
     * @param {object} labels
     */
    function renderDocumentHtml(payload, labels) {
        const p = payload || {};
        const L = labels || {};
        const groups = (Array.isArray(p.groups) ? p.groups : []).filter((g) => g && (g.days || []).length);
        const sections = groups.map((g) => renderClass(g, L)).join('');
        const meta = [p.calendarName, p.generatedAt ? `${L.generatedAt}: ${p.generatedAt}` : '', p.scopeNote]
            .filter(Boolean)
            .map((m) => `<p class="dr-print-meta">${escapeHtml(m)}</p>`)
            .join('');
        return `<div class="dr-print-root">
            <header class="dr-print-header">
                <h1 class="dr-print-title">${escapeHtml(p.title || L.title || '')}</h1>
                ${meta}
                <p class="dr-print-legend">${escapeHtml(L.legend || '')}</p>
            </header>
            ${sections || `<p class="dr-print-empty">${escapeHtml(L.noRows)}</p>`}
        </div>`;
    }

    /** Plain text grouped by class → Day 4 date (for KakaoTalk / email paste). */
    function formatCopyText(groups, labels) {
        const L = labels || {};
        const lines = [];
        (Array.isArray(groups) ? groups : [])
            .filter((g) => g && (g.days || []).length)
            .forEach((g, gi) => {
                if (gi > 0) {
                    lines.push('');
                }
                lines.push(g.className || '');
                (g.days || []).forEach((day) => {
                    lines.push(`  ${fill(L.dayHeading, { date: shortDate(day.date) })}`);
                    (day.rows || []).forEach((r) => {
                        const tms = tmsText(r);
                        const note = r.note ? ` — ${r.note}` : '';
                        lines.push(`  - ${r.studentName || ''}: ${statusLabel(r.status, L)}${tms ? ` (${tms})` : ''}${note}`);
                    });
                });
            });
        return lines.join('\n').trim();
    }

    const PRINT_STYLES = `
.dr-print-root { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif; color: #111; font-size: 10.5pt; }
.dr-print-header { margin-bottom: 12pt; border-bottom: 1.5pt solid #111; padding-bottom: 6pt; }
.dr-print-title { margin: 0 0 3pt; font-size: 16pt; }
.dr-print-meta { margin: 1pt 0; color: #444; font-size: 9.5pt; }
.dr-print-legend { margin: 4pt 0 0; color: #555; font-size: 9pt; }
.dr-print-class { margin: 0 0 14pt; break-inside: avoid-page; }
.dr-print-class-title { margin: 0 0 3pt; font-size: 12.5pt; }
.dr-print-hr { font-weight: 400; color: #555; font-size: 10pt; margin-left: 6pt; }
.dr-print-counts { margin: 0 0 6pt; display: flex; flex-wrap: wrap; gap: 4pt; }
.dr-print-count { border: 0.75pt solid #999; border-radius: 3pt; padding: 0 4pt; font-size: 9pt; }
.dr-print-count--not_recorded { border-color: #b91c1c; color: #b91c1c; font-weight: 700; }
.dr-print-count--needs_confirmation { border-color: #b45309; color: #b45309; font-weight: 700; }
.dr-print-day { margin: 0 0 8pt; break-inside: avoid; }
.dr-print-day-title { margin: 0 0 3pt; font-size: 10.5pt; }
.dr-print-src { color: #666; font-weight: 400; font-size: 9pt; }
.dr-print-table { width: 100%; border-collapse: collapse; }
.dr-print-table th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.04em; color: #555; border-bottom: 0.75pt solid #999; padding: 2pt 4pt; }
.dr-print-table td { border-bottom: 0.5pt solid #ccc; padding: 4pt; vertical-align: top; }
.dr-print-check { width: 14pt; }
td.dr-print-check::before { content: ''; display: inline-block; width: 9pt; height: 9pt; border: 0.75pt solid #333; }
.dr-print-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.dr-print-en { color: #666; font-size: 9pt; }
.dr-print-status { font-weight: 700; }
.dr-print-status--not_recorded { color: #b91c1c; }
.dr-print-status--needs_confirmation { color: #b45309; }
.dr-print-status--received, .dr-print-status--recorded { color: #15803d; }
.dr-print-status--exempt { color: #555; }
.dr-print-setby { color: #666; font-size: 8.5pt; font-weight: 400; }
.dr-print-empty { color: #666; }
@page { size: A4; margin: 14mm; }
`;

    global.CCPClassroomDebateRecPrint = {
        renderDocumentHtml,
        formatCopyText,
        PRINT_STYLES
    };
})(typeof window !== 'undefined' ? window : globalThis);
