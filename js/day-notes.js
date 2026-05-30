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

    function compareDateStr(a, b) {
        return String(a || '').localeCompare(String(b || ''));
    }

    function compareCreatedAtDesc(a, b) {
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    }

    function compareChronological(a, b) {
        const byDate = compareDateStr(a.date, b.date);
        if (byDate !== 0) {
            return byDate;
        }
        return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    }

    function sortNewestFirst(notes) {
        return [...(notes || [])].sort(compareCreatedAtDesc);
    }

    function sortChronological(notes) {
        return [...(notes || [])].sort(compareChronological);
    }

    /**
     * @param {Array} dayNotes
     * @param {object} filters
     * @param {string} [filters.dateFrom] YYYY-MM-DD inclusive
     * @param {string} [filters.dateTo] YYYY-MM-DD inclusive
     * @param {string[]} [filters.classIds] empty = all classes
     * @param {function} [filters.matchesMeta] (classId) => boolean for subject/grade/etc.
     */
    function filterNotes(dayNotes, filters) {
        const f = filters || {};
        const classSet = Array.isArray(f.classIds) && f.classIds.length
            ? new Set(f.classIds.map((id) => String(id)))
            : null;
        return (dayNotes || []).filter((note) => {
            if (!note || !note.date) {
                return false;
            }
            if (f.dateFrom && compareDateStr(note.date, f.dateFrom) < 0) {
                return false;
            }
            if (f.dateTo && compareDateStr(note.date, f.dateTo) > 0) {
                return false;
            }
            if (classSet && !classSet.has(note.classId)) {
                return false;
            }
            if (typeof f.matchesMeta === 'function' && !f.matchesMeta(note.classId)) {
                return false;
            }
            return true;
        });
    }

    /**
     * @param {Array} notes filtered notes
     * @param {string[]} classOrderIds display order for class groups
     */
    function groupNotesByClass(notes, classOrderIds) {
        const map = new Map();
        (notes || []).forEach((note) => {
            if (!map.has(note.classId)) {
                map.set(note.classId, []);
            }
            map.get(note.classId).push(note);
        });
        const order = Array.isArray(classOrderIds) && classOrderIds.length
            ? classOrderIds.filter((id) => map.has(id))
            : [...map.keys()].sort();
        const extra = [...map.keys()].filter((id) => !order.includes(id));
        return [...order, ...extra].map((classId) => ({
            classId,
            notes: sortChronological(map.get(classId))
        }));
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

    /**
     * Export notes grouped by class; within each class, chronological by date then time.
     * @param {object} opts
     * @param {string} opts.dateFrom
     * @param {string} opts.dateTo
     * @param {Array} opts.notes filtered normalized notes
     * @param {string[]} opts.classOrderIds
     * @param {function} opts.resolveMeta (classId) => { className, subject, grade? }
     * @param {function} [opts.formatDate] (isoDate) => string
     * @param {string} opts.locale
     * @param {string} opts.headerTitle
     * @param {string} [opts.rangeLabel] e.g. "2026-01-01 – 2026-06-30"
     */
    function formatRangeExportByClass(opts) {
        const {
            notes,
            classOrderIds,
            resolveMeta,
            formatDate,
            locale,
            headerTitle,
            rangeLabel
        } = opts || {};
        const lines = [];
        const title = headerTitle || 'Class notes export';
        if (rangeLabel) {
            lines.push(`${rangeLabel} — ${title}`);
        } else {
            lines.push(title);
        }
        lines.push('════════════════════════════════');
        const groups = groupNotesByClass(notes, classOrderIds);
        if (!groups.length) {
            return lines.join('\n').trimEnd();
        }
        const fmtDate = typeof formatDate === 'function'
            ? formatDate
            : (d) => d;
        groups.forEach((group, gi) => {
            const meta = typeof resolveMeta === 'function'
                ? resolveMeta(group.classId)
                : null;
            const className = meta && meta.className ? meta.className : group.classId;
            const subject = meta && meta.subject ? meta.subject : '';
            const heading = subject ? `${className} — ${subject}` : className;
            if (gi > 0) {
                lines.push('');
            }
            lines.push(`── ${heading} ──`);
            let lastDate = '';
            group.notes.forEach((note) => {
                if (note.date !== lastDate) {
                    lastDate = note.date;
                    lines.push('');
                    lines.push(fmtDate(note.date));
                }
                const time = formatTimeLabel(note.createdAt, locale);
                if (time) {
                    lines.push(`[${time}]`);
                }
                lines.push(String(note.text || '').trim());
            });
        });
        return lines.join('\n').trimEnd();
    }

    global.CCPDayNotes = {
        normalizeDayNote,
        normalizeDayNotesList,
        sortNewestFirst,
        sortChronological,
        getNotesForDate,
        getNotesForClassOnDate,
        hasNotesForClassOnDate,
        filterNotes,
        groupNotesByClass,
        formatTimeLabel,
        formatExportText,
        formatRangeExportByClass
    };
})(typeof window !== 'undefined' ? window : globalThis);
