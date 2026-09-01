/**
 * Printable HTML for the Classes / MWF / T/T homeroom directory.
 */
(function (global) {
    function escapeHtml(text) {
        if (typeof CCPUtils !== 'undefined' && CCPUtils.escapeHtml) {
            return CCPUtils.escapeHtml(text);
        }
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function cellText(value, emptyLabel) {
        const s = String(value || '').trim();
        return s || emptyLabel || '—';
    }

    function renderDocumentHtml(payload, labels) {
        const p = payload || {};
        const L = labels || {};
        const rows = Array.isArray(p.rows) ? p.rows : [];
        const empty = L.empty || '—';
        const title = L.title || 'Homeroom list';
        const body = rows.length
            ? rows
                  .map((row) => {
                      const r = row || {};
                      return `<tr>
<td class="homeroom-directory-col-class">${escapeHtml(r.familyName || r.familyKey || '')}</td>
<td class="homeroom-directory-col-mwf">${escapeHtml(cellText(r.mwf, empty))}</td>
<td class="homeroom-directory-col-tth">${escapeHtml(cellText(r.tth, empty))}</td>
</tr>`;
                  })
                  .join('')
            : `<tr><td colspan="3" class="homeroom-directory-empty">${escapeHtml(L.noRows || '')}</td></tr>`;
        return `<div class="homeroom-directory-root">
<header class="homeroom-directory-header">
<h1 class="homeroom-directory-doc-title">${escapeHtml(title)}</h1>
${p.calendarName ? `<p class="homeroom-directory-meta">${escapeHtml(p.calendarName)}</p>` : ''}
</header>
<table class="homeroom-directory-table">
<thead>
<tr>
<th scope="col">${escapeHtml(L.colClasses || 'Classes')}</th>
<th scope="col">${escapeHtml(L.colMwf || 'MWF')}</th>
<th scope="col">${escapeHtml(L.colTth || 'T/T')}</th>
</tr>
</thead>
<tbody>${body}</tbody>
</table>
</div>`;
    }

    const PRINT_STYLES = `
@page { size: A4 portrait; margin: 12mm; }
html, body { margin: 0; padding: 0; background: #fff; }
body { color: #111; }
.homeroom-directory-root {
    font-family: "IBM Plex Sans", "Noto Sans KR", system-ui, sans-serif;
    color: #111;
    font-size: 11pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}
.homeroom-directory-header { margin: 0 0 1rem; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
.homeroom-directory-doc-title { margin: 0 0 0.25rem; font-size: 16pt; font-weight: 700; }
.homeroom-directory-meta { margin: 0.15rem 0 0; color: #444; font-size: 10.5pt; }
.homeroom-directory-table { width: 100%; border-collapse: collapse; font-size: 11pt; }
.homeroom-directory-table th,
.homeroom-directory-table td {
    border: 1px solid #bbb;
    padding: 0.4rem 0.55rem;
    text-align: left;
    vertical-align: top;
}
.homeroom-directory-table th {
    background: #f1f4f8;
    font-weight: 600;
}
.homeroom-directory-col-class { width: 34%; font-weight: 600; }
.homeroom-directory-col-mwf,
.homeroom-directory-col-tth { width: 33%; }
.homeroom-directory-empty { color: #666; font-style: italic; text-align: center; }
@media print {
    .homeroom-directory-header { page-break-after: avoid; break-after: avoid; }
    .homeroom-directory-table thead { display: table-header-group; }
    .homeroom-directory-table tr { page-break-inside: avoid; break-inside: avoid; }
}
`;

    function openPrintDocument(title, bodyHtml, inlineCss) {
        const docTitle = String(title || 'Homeroom list');
        const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(docTitle)}</title>
<style>${inlineCss || PRINT_STYLES}</style>
</head><body class="print-color-mode-light">${bodyHtml || ''}</body></html>`;
        if (typeof window === 'undefined' || typeof window.open !== 'function') {
            return null;
        }
        const printWin = window.open('', '_blank');
        if (!printWin) {
            return null;
        }
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.document.title = docTitle;
        printWin.focus();
        const triggerPrint = () => {
            try {
                printWin.focus();
                printWin.print();
            } catch (_err) {
                /* ignore */
            }
        };
        if (printWin.document.readyState === 'complete') {
            setTimeout(triggerPrint, 50);
        } else {
            printWin.addEventListener('load', () => setTimeout(triggerPrint, 50));
            setTimeout(triggerPrint, 300);
        }
        return printWin;
    }

    global.CCPHomeroomDirectoryPrint = {
        renderDocumentHtml,
        openPrintDocument,
        PRINT_STYLES
    };
})(typeof window !== 'undefined' ? window : globalThis);
