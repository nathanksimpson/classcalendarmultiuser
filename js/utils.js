/**
 * Shared DOM/string utilities (window.CCPUtils).
 */
(function (global) {
    function escapeHtml(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    function escapeRegExp(s) {
        return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function parseISODateLocal(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') {
            return new Date(NaN);
        }
        const parts = dateStr.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function formatDateISO(date) {
        const d = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(d.getTime())) {
            return '';
        }
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    global.CCPUtils = { escapeHtml, escapeAttr, escapeRegExp, parseISODateLocal, formatDateISO };
})(typeof window !== 'undefined' ? window : globalThis);
