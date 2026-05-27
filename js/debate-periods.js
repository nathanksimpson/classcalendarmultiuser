/**
 * Debate book periods: start-date granularity (book + Day 1–4 cycle boundaries).
 * Pure helpers — no DOM. Used by app.js and tests.
 */
(function () {
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

    function parseISODateLocal(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') {
            return new Date(NaN);
        }
        const parts = dateStr.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function formatDateISO(d) {
        if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
            return '';
        }
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function addDays(dateStr, delta) {
        const d = parseISODateLocal(dateStr);
        if (Number.isNaN(d.getTime())) {
            return '';
        }
        d.setDate(d.getDate() + delta);
        return formatDateISO(d);
    }

    function maxDateStr(a, b) {
        if (!a) {
            return b || '';
        }
        if (!b) {
            return a;
        }
        return a > b ? a : b;
    }

    function minDateStr(a, b) {
        if (!a) {
            return b || '';
        }
        if (!b) {
            return a;
        }
        return a < b ? a : b;
    }

    function generatePeriodId() {
        return `dbp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function ensurePeriodId(period) {
        if (period && period.id) {
            return period.id;
        }
        return generatePeriodId();
    }

    /**
     * Calendar months between two dates (inclusive), YYYY-MM keys.
     */
    function enumerateMonthKeysBetween(startDateStr, endDateStr) {
        const keys = [];
        const start = parseISODateLocal(startDateStr);
        const end = parseISODateLocal(endDateStr);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return keys;
        }
        let y = start.getFullYear();
        let mo = start.getMonth();
        const endY = end.getFullYear();
        const endMo = end.getMonth();
        while (y < endY || (y === endY && mo <= endMo)) {
            keys.push(`${y}-${String(mo + 1).padStart(2, '0')}`);
            mo += 1;
            if (mo > 11) {
                mo = 0;
                y += 1;
            }
        }
        return keys;
    }

    function monthKeyToFirstDay(monthKey) {
        if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
            return '';
        }
        return `${monthKey}-01`;
    }

    function normalizeDebateBookPeriods(classData) {
        const raw = Array.isArray(classData && classData.debateBookPeriods)
            ? classData.debateBookPeriods
            : [];
        const termStart = (classData && classData.startDate) || '';
        const termEnd = (classData && classData.endDate) || '';
        const defaultBook = String((classData && classData.book) || '').trim();

        const byDate = new Map();
        raw.forEach((entry) => {
            if (!entry || typeof entry !== 'object') {
                return;
            }
            const startDate = String(entry.startDate || '').trim();
            if (!ISO_DATE.test(startDate)) {
                return;
            }
            if (termStart && startDate < termStart) {
                return;
            }
            if (termEnd && startDate > termEnd) {
                return;
            }
            const book = String(entry.book || '').trim();
            byDate.set(startDate, {
                id: ensurePeriodId(entry),
                startDate,
                book
            });
        });

        let periods = [...byDate.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));

        if (periods.length === 0 && termStart && ISO_DATE.test(termStart)) {
            periods = [{
                id: generatePeriodId(),
                startDate: termStart,
                book: defaultBook
            }];
        }

        return periods;
    }

    function migrateBooksByMonthToPeriods(classData) {
        if (!classData || typeof classData !== 'object') {
            return false;
        }
        if (classData.debateBookPeriodsMigrated) {
            return false;
        }
        const existing = Array.isArray(classData.debateBookPeriods) ? classData.debateBookPeriods : [];
        if (existing.length > 0) {
            classData.debateBookPeriodsMigrated = true;
            return false;
        }

        const map = classData.booksByMonth && typeof classData.booksByMonth === 'object'
            ? classData.booksByMonth
            : {};
        const keys = Object.keys(map).sort();
        if (keys.length === 0) {
            return false;
        }

        const termStart = classData.startDate || '';
        const periods = keys.map((monthKey) => {
            const firstOfMonth = monthKeyToFirstDay(monthKey);
            const startDate = maxDateStr(termStart, firstOfMonth);
            return {
                id: generatePeriodId(),
                startDate,
                book: String(map[monthKey] || '').trim()
            };
        }).filter((p) => ISO_DATE.test(p.startDate));

        if (periods.length) {
            classData.debateBookPeriods = periods;
            classData.debateBookPeriodsMigrated = true;
            migrateCompressionMergesByMonth(classData, periods);
            return true;
        }
        return false;
    }

    function migrateCompressionMergesByMonth(classData, periods) {
        const byMonth = classData.compressionMergesByMonth;
        if (!byMonth || typeof byMonth !== 'object') {
            return;
        }
        if (!classData.compressionMergesByPeriod) {
            classData.compressionMergesByPeriod = {};
        }
        const target = classData.compressionMergesByPeriod;
        periods.forEach((period) => {
            const monthKey = period.startDate.slice(0, 7);
            if (Array.isArray(byMonth[monthKey]) && !target[period.id]) {
                target[period.id] = byMonth[monthKey].slice();
            }
        });
    }

    function ensureDebateBookPeriodsForClass(classData) {
        if (!classData || typeof classData !== 'object') {
            return [];
        }
        migrateBooksByMonthToPeriods(classData);
        const periods = normalizeDebateBookPeriods(classData);
        classData.debateBookPeriods = periods;
        if (!classData.debateBookPeriodsMigrated && periods.length > 0) {
            classData.debateBookPeriodsMigrated = true;
        }
        if (!classData.compressionMergesByPeriod) {
            classData.compressionMergesByPeriod = {};
        }
        return periods;
    }

    function getDebatePeriodForDate(periods, dateStr) {
        if (!ISO_DATE.test(dateStr) || !Array.isArray(periods) || !periods.length) {
            return null;
        }
        let hit = null;
        periods.forEach((p) => {
            if (p.startDate && p.startDate <= dateStr) {
                if (!hit || p.startDate > hit.startDate) {
                    hit = p;
                }
            }
        });
        return hit;
    }

    function getBookForDate(classData, dateStr) {
        const defaultBook = String((classData && classData.book) || '').trim();
        if (!ISO_DATE.test(dateStr)) {
            return defaultBook;
        }
        const periods = normalizeDebateBookPeriods(classData);
        const period = getDebatePeriodForDate(periods, dateStr);
        if (period && period.book) {
            return period.book;
        }
        return defaultBook;
    }

    /**
     * Periods in term with scheduling range ends (inclusive rangeEndDate).
     */
    function enumerateDebatePeriodsInTerm(classData) {
        const periods = normalizeDebateBookPeriods(classData);
        const termStart = (classData && classData.startDate) || '';
        const termEnd = (classData && classData.endDate) || '';
        if (!ISO_DATE.test(termStart) || !ISO_DATE.test(termEnd)) {
            return [];
        }

        const inTerm = periods.filter((p) => p.startDate <= termEnd);
        return inTerm.map((period, index) => {
            const next = inTerm[index + 1];
            const rangeStartDate = maxDateStr(period.startDate, termStart);
            let rangeEndDate = termEnd;
            if (next && next.startDate) {
                const dayBefore = addDays(next.startDate, -1);
                rangeEndDate = minDateStr(dayBefore, termEnd);
            }
            const book = period.book || String((classData && classData.book) || '').trim();
            return {
                ...period,
                book,
                rangeStartDate,
                rangeEndDate
            };
        }).filter((p) => p.rangeStartDate <= p.rangeEndDate);
    }

    function suggestPeriodsFromCalendarMonths(startDateStr, endDateStr, defaultBook) {
        const book = String(defaultBook || '').trim();
        const monthKeys = enumerateMonthKeysBetween(startDateStr, endDateStr);
        return monthKeys.map((monthKey) => ({
            id: generatePeriodId(),
            startDate: maxDateStr(startDateStr, monthKeyToFirstDay(monthKey)),
            book
        })).filter((p) => ISO_DATE.test(p.startDate));
    }

    function formatDebatePeriodsSummary(classData) {
        const periods = normalizeDebateBookPeriods(classData);
        if (!periods.length) {
            return '—';
        }
        return periods.map((p) => {
            const title = p.book || (classData && classData.book) || '—';
            return `${p.startDate}: ${title}`;
        }).join('; ');
    }

    const api = {
        parseISODateLocal,
        formatDateISO,
        addDays,
        maxDateStr,
        minDateStr,
        generatePeriodId,
        enumerateMonthKeysBetween,
        normalizeDebateBookPeriods,
        migrateBooksByMonthToPeriods,
        ensureDebateBookPeriodsForClass,
        getDebatePeriodForDate,
        getBookForDate,
        enumerateDebatePeriodsInTerm,
        suggestPeriodsFromCalendarMonths,
        formatDebatePeriodsSummary
    };

    if (typeof globalThis !== 'undefined') {
        globalThis.CCPDebatePeriods = api;
    }
})();
