/**
 * Calendar term date helpers (pure functions for app + tests).
 */
(function (global) {
    const ISO_MONTH = /^\d{4}-\d{2}$/;
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

    function parseISODateLocal(dateStr) {
        const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) {
            return null;
        }
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function formatDateForInput(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function normalizeTermStartDate(value) {
        const raw = String(value || '').trim();
        if (!raw) {
            return '';
        }
        if (ISO_DATE.test(raw)) {
            return raw;
        }
        if (ISO_MONTH.test(raw)) {
            return `${raw}-01`;
        }
        return raw;
    }

    function computeTermEndDateFromStart(startDateStr, monthCount) {
        const d = parseISODateLocal(startDateStr);
        if (!d) {
            return null;
        }
        const n = parseInt(monthCount, 10);
        if (Number.isNaN(n) || n < 1) {
            return null;
        }
        const m0 = d.getMonth();
        const lastMonthIndex = m0 + n - 1;
        const endY = d.getFullYear() + Math.floor(lastMonthIndex / 12);
        const endM = ((lastMonthIndex % 12) + 12) % 12;
        return new Date(endY, endM + 1, 0);
    }

    function computeTermEndDateExactMonths(startDateStr, monthCount) {
        const d = parseISODateLocal(startDateStr);
        if (!d) {
            return null;
        }
        const n = parseInt(monthCount, 10);
        if (Number.isNaN(n) || n < 1) {
            return null;
        }
        const end = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
        end.setDate(end.getDate() - 1);
        return end;
    }

    function getTermMonthCount(termMonthCount, config) {
        const cfg = config || {};
        const def = cfg.defaultTermCalendarMonths != null ? cfg.defaultTermCalendarMonths : 3;
        const min = cfg.minTermMonthCount != null ? cfg.minTermMonthCount : 3;
        const max = cfg.maxTermMonthCount != null ? cfg.maxTermMonthCount : 6;
        const n = parseInt(termMonthCount, 10);
        if (Number.isNaN(n)) {
            return def;
        }
        return Math.min(max, Math.max(min, n));
    }

    function getResolvedTermEndISO(appData, config) {
        const data = appData || {};
        const start = normalizeTermStartDate(data.termStart);
        if (!start) {
            return '';
        }
        const useAuto = data.useAutoTermEnd !== false;
        if (!useAuto && data.termEnd && ISO_DATE.test(String(data.termEnd).trim())) {
            return String(data.termEnd).trim();
        }
        const endD = computeTermEndDateFromStart(start, getTermMonthCount(data.termMonthCount, config));
        return endD ? formatDateForInput(endD) : start;
    }

    function getTermDateRangeISO(appData, config) {
        const data = appData || {};
        const start = normalizeTermStartDate(data.termStart);
        if (!start) {
            return { start: '', end: '' };
        }
        const end = getResolvedTermEndISO(data, config);
        return { start, end: end || start };
    }

    function getTermCalendarMonthSpan(appData, config) {
        const { start, end } = getTermDateRangeISO(appData, config);
        if (!start || !end) {
            return getTermMonthCount(appData && appData.termMonthCount, config);
        }
        const startD = parseISODateLocal(start);
        const endD = parseISODateLocal(end);
        if (!startD || !endD) {
            return getTermMonthCount(appData && appData.termMonthCount, config);
        }
        return (endD.getFullYear() - startD.getFullYear()) * 12 + (endD.getMonth() - startD.getMonth()) + 1;
    }

    function isDateInTermRange(isoDate, appData, config) {
        const { start, end } = getTermDateRangeISO(appData, config);
        if (!start || !end || !isoDate) {
            return true;
        }
        return isoDate >= start && isoDate <= end;
    }

    function migrateTermFields(data, config) {
        const out = data || {};
        let migrated = false;
        if (out.termStart && ISO_MONTH.test(String(out.termStart).trim())) {
            out.termStart = normalizeTermStartDate(out.termStart);
            migrated = true;
        }
        if (!out.termMonthCount) {
            out.termMonthCount = (config && config.defaultTermCalendarMonths) || 3;
            migrated = true;
        }
        if (out.useAutoTermEnd !== true && out.useAutoTermEnd !== false) {
            out.useAutoTermEnd = true;
            migrated = true;
        }
        if ((!out.termEnd || !ISO_DATE.test(String(out.termEnd).trim())) && out.termStart) {
            out.termEnd = getResolvedTermEndISO(out, config);
            migrated = true;
        }
        return migrated;
    }

    global.CCPTermDates = {
        ISO_MONTH,
        ISO_DATE,
        normalizeTermStartDate,
        computeTermEndDateFromStart,
        computeTermEndDateExactMonths,
        getTermMonthCount,
        getResolvedTermEndISO,
        getTermDateRangeISO,
        getTermCalendarMonthSpan,
        isDateInTermRange,
        migrateTermFields,
        parseISODateLocal,
        formatDateForInput
    };
}(typeof window !== 'undefined' ? window : globalThis));
