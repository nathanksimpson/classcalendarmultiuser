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

    function escapeRegExp(s) {
        return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function parseISODateLocal(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return new Date(NaN);
        const parts = dateStr.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    global.CCPUtils = { escapeHtml, escapeRegExp, parseISODateLocal };
})(typeof window !== 'undefined' ? window : globalThis);
