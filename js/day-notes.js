/**
 * Daily class notes: normalize, query, and plain-text export.
 */
(function (global) {
    const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    function normalizeDayNote(raw) {
        if (!raw || typeof raw !== 'object') {
            return null;
        }
        const date = String(raw.date || '').trim();
        const classId = String(raw.classId || '').trim();
        const text = String(raw.text || '').trim();
        if (!date || !ISO_DATE_RE.test(date) || !classId || !text) {
            return null;
        }
        let createdAt = String(raw.createdAt || '').trim();
        if (!createdAt) {
            createdAt = new Date().toISOString();
        }
        return {
            id: String(raw.id || '').trim() || `dn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            classId,
            date,
            text,
            createdAt
        };
    }

    function normalizeDayNotesList(list) {
        if (!Array.isArray(list)) {
            return [];
        }
        const out = [];
        const seen = new Set();
        list.forEach((raw) => {
            const n = normalizeDayNote(raw);
            if (!n || seen.has(n.id)) {
                return;
            }
            seen.add(n.id);
            out.push(n);
        });
        return out;
    }

    function compareCreatedAtDesc(a, b) {
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    }

    function sortNewestFirst(notes) {
        return [...(notes || [])].sort(compareCreatedAtDesc);
    }

    function getNotesForDate(dayNotes, dateStr) {
        const date = String(dateStr || '').trim();
        if (!date) {
            return [];
        }
        return sortNewestFirst((dayNotes || []).filter((n) => n && n.date === date));
    }

    function getNotesForClassOnDate(dayNotes, classId, dateStr) {
        const cid = String(classId || '').trim();
        const date = String(dateStr || '').trim();
        if (!cid || !date) {
            return [];
        }
        return sortNewestFirst(
            (dayNotes || []).filter((n) => n && n.classId === cid && n.date === date)
        );
    }

    function hasNotesForClassOnDate(dayNotes, classId, dateStr) {
        return getNotesForClassOnDate(dayNotes, classId, dateStr).length > 0;
    }

    function formatTimeLabel(iso, locale) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) {
            return '';
        }
        const loc = locale === 'ko' ? 'ko-KR' : 'en-US';
        return d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
    }

    /**
     * @param {object} opts
     * @param {string} opts.dateStr
     * @param {Array} opts.notes normalized entries for one date
     * @param {function} opts.resolveMeta (classId) => { className, subject } | null
     * @param {string} opts.locale 'en' | 'ko'
     * @param {string} opts.headerTitle e.g. "Daily class notes"
     */
    function formatExportText(opts) {
        const {
            dateStr,
            notes,
            resolveMeta,
            locale,
            headerTitle
        } = opts || {};
        const lines = [];
        const title = headerTitle || 'Daily class notes';
        lines.push(`${dateStr} — ${title}`);
        lines.push('────────────────────────────────');
        const sorted = sortNewestFirst(notes);
        if (!sorted.length) {
            lines.push('');
            return lines.join('\n').trimEnd();
        }
        sorted.forEach((note) => {
            const meta = typeof resolveMeta === 'function' ? resolveMeta(note.classId) : null;
            const className = meta && meta.className ? meta.className : note.classId;
            const subject = meta && meta.subject ? meta.subject : '';
            const time = formatTimeLabel(note.createdAt, locale);
            const head = subject
                ? `[${time}] ${className} — ${subject}`
                : `[${time}] ${className}`;
            lines.push(head);
            lines.push(String(note.text || '').trim());
            lines.push('');
        });
        return lines.join('\n').trimEnd();
    }

    global.CCPDayNotes = {
        normalizeDayNote,
        normalizeDayNotesList,
        sortNewestFirst,
        getNotesForDate,
        getNotesForClassOnDate,
        hasNotesForClassOnDate,
        formatTimeLabel,
        formatExportText
    };
})(typeof window !== 'undefined' ? window : globalThis);
