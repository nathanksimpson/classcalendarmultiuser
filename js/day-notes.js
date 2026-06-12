/**
 * Daily class notes: normalize, query, and plain-text export.
 */
(function (global) {
    const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const DEFAULT_CATEGORY_ID = 'class-notes';
    const NEXT_CLASS_NOTES_CATEGORY_ID = 'next-class-notes';

    function getHomeworkTabApi() {
        return typeof global.CCPHomeworkTab !== 'undefined' ? global.CCPHomeworkTab : null;
    }

    function getCategoriesApi() {
        return typeof global.CCPDayNoteCategories !== 'undefined' ? global.CCPDayNoteCategories : null;
    }

    function normalizeCategoryId(raw) {
        const api = getCategoriesApi();
        if (api && api.normalizeCategoryId) {
            return api.normalizeCategoryId(raw);
        }
        const id = String(raw || '').trim();
        return id || DEFAULT_CATEGORY_ID;
    }

    function normalizeTaggedStudentIds(raw) {
        if (!Array.isArray(raw)) {
            return [];
        }
        const seen = new Set();
        const out = [];
        raw.forEach((id) => {
            const sid = String(id || '').trim();
            if (!sid || seen.has(sid)) {
                return;
            }
            seen.add(sid);
            out.push(sid);
        });
        return out;
    }

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
        const out = {
            id: String(raw.id || '').trim() || `dn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            classId,
            date,
            text,
            createdAt
        };
        const authorUserId = String(raw.authorUserId || '').trim();
        if (authorUserId) {
            out.authorUserId = authorUserId;
        }
        const homeroomNotifyUserId = String(raw.homeroomNotifyUserId || '').trim();
        if (homeroomNotifyUserId) {
            out.homeroomNotifyUserId = homeroomNotifyUserId;
        }
        const taggedStudentIds = normalizeTaggedStudentIds(raw.taggedStudentIds);
        if (taggedStudentIds.length) {
            out.taggedStudentIds = taggedStudentIds;
        }
        out.categoryId = normalizeCategoryId(raw.categoryId);
        return out;
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

    /** Union multiple dayNotes arrays; on duplicate id keep entry with later createdAt. */
    function mergeDayNotesById(...lists) {
        const map = new Map();
        lists.forEach((list) => {
            (list || []).forEach((raw) => {
                const n = normalizeDayNote(raw);
                if (!n) {
                    return;
                }
                const existing = map.get(n.id);
                if (
                    !existing
                    || String(n.createdAt || '').localeCompare(String(existing.createdAt || '')) > 0
                ) {
                    map.set(n.id, n);
                }
            });
        });
        return normalizeDayNotesList(Array.from(map.values()));
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

    function compareCreatedAtAsc(a, b) {
        return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    }

    function sortOldestFirst(notes) {
        return [...(notes || [])].sort(compareCreatedAtAsc);
    }

    function compareDateDescThenCreatedDesc(a, b) {
        const byDate = compareDateStr(b.date, a.date);
        if (byDate !== 0) {
            return byDate;
        }
        return compareCreatedAtDesc(a, b);
    }

    function sortByDateDesc(notes) {
        return [...(notes || [])].sort(compareDateDescThenCreatedDesc);
    }

    const NO_HOMEROOM_KEY = '__no_homeroom__';

    const CLASS_NOTES_SORT_MODES = new Set([
        'classGroup',
        'homeroomGroup',
        'newest',
        'oldest',
        'dateAsc',
        'dateDesc'
    ]);

    function normalizeClassNotesSortMode(mode) {
        const m = String(mode || '').trim();
        return CLASS_NOTES_SORT_MODES.has(m) ? m : 'classGroup';
    }

    function sortNotesForDisplay(notes, sortMode, classOrderIds, opts) {
        const mode = normalizeClassNotesSortMode(sortMode);
        const list = notes || [];
        if (mode === 'classGroup') {
            return {
                mode,
                groups: groupNotesByClass(list, classOrderIds)
            };
        }
        if (mode === 'homeroomGroup') {
            const resolveHomeroomMeta = opts && typeof opts.resolveHomeroomMeta === 'function'
                ? opts.resolveHomeroomMeta
                : null;
            return {
                mode,
                homeroomGroups: groupNotesByHomeroom(
                    list,
                    opts && opts.homeroomOrderKeys,
                    resolveHomeroomMeta,
                    classOrderIds
                )
            };
        }
        if (mode === 'newest') {
            return { mode, notes: sortNewestFirst(list) };
        }
        if (mode === 'oldest') {
            return { mode, notes: sortOldestFirst(list) };
        }
        if (mode === 'dateDesc') {
            return { mode, notes: sortByDateDesc(list) };
        }
        return { mode: 'dateAsc', notes: sortChronological(list) };
    }

    function findNoteById(dayNotes, id) {
        const nid = String(id || '').trim();
        if (!nid) {
            return null;
        }
        return (dayNotes || []).find((n) => n && n.id === nid) || null;
    }

    function updateDayNote(dayNotes, id, patch) {
        const nid = String(id || '').trim();
        if (!nid || !Array.isArray(dayNotes)) {
            return dayNotes || [];
        }
        const idx = dayNotes.findIndex((n) => n && n.id === nid);
        if (idx < 0) {
            return dayNotes;
        }
        const safePatch = Object.assign({}, patch || {});
        delete safePatch.authorUserId;
        delete safePatch.id;
        const merged = Object.assign({}, dayNotes[idx], safePatch, { id: nid });
        const normalized = normalizeDayNote(merged);
        if (!normalized) {
            return dayNotes;
        }
        const out = dayNotes.slice();
        out[idx] = normalized;
        return out;
    }

    function removeDayNote(dayNotes, id) {
        const nid = String(id || '').trim();
        if (!nid || !Array.isArray(dayNotes)) {
            return dayNotes || [];
        }
        return dayNotes.filter((n) => n && n.id !== nid);
    }

    /**
     * @param {object} note
     * @param {string} query lowercased trimmed query
     * @param {function} [resolveClassHay] (classId) => string
     * @param {function} [resolveTaggedStudentHay] (note) => string
     */
    function noteMatchesTextQuery(note, query, resolveClassHay, resolveTaggedStudentHay) {
        if (!query) {
            return true;
        }
        const parts = [String(note.text || '')];
        if (typeof resolveClassHay === 'function') {
            parts.push(String(resolveClassHay(note.classId) || ''));
        }
        if (typeof resolveTaggedStudentHay === 'function') {
            parts.push(String(resolveTaggedStudentHay(note) || ''));
        }
        const hay = parts.join(' ').toLowerCase();
        return hay.includes(query);
    }

    /**
     * @param {Array} dayNotes
     * @param {object} filters
     * @param {string} [filters.dateFrom] YYYY-MM-DD inclusive
     * @param {string} [filters.dateTo] YYYY-MM-DD inclusive
     * @param {string[]} [filters.classIds] empty = all classes
     * @param {function} [filters.matchesMeta] (classId) => boolean for subject/grade/etc.
     * @param {string} [filters.textQuery] case-insensitive substring on note text + class hay
     * @param {function} [filters.resolveClassHay] (classId) => string for text search
     * @param {function} [filters.resolveTaggedStudentHay] (note) => string for tagged student names
     * @param {function} [filters.matchesNote] (note) => boolean for per-note rules (e.g. schedule)
     * @param {Set<string>} [filters.categorySet] when set, note categoryId must be in set
     */
    function filterNotes(dayNotes, filters) {
        const f = filters || {};
        const classSet = Array.isArray(f.classIds) && f.classIds.length
            ? new Set(f.classIds.map((id) => String(id)))
            : null;
        const categorySet = f.categorySet && typeof f.categorySet.has === 'function' && f.categorySet.size
            ? f.categorySet
            : null;
        const textQuery = String(f.textQuery || '').trim().toLowerCase();
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
            if (categorySet && !categorySet.has(normalizeCategoryId(note.categoryId))) {
                return false;
            }
            if (textQuery && !noteMatchesTextQuery(
                note,
                textQuery,
                f.resolveClassHay,
                f.resolveTaggedStudentHay
            )) {
                return false;
            }
            if (typeof f.matchesNote === 'function' && !f.matchesNote(note)) {
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

    function compareHomeroomKeys(a, b, labelForKey) {
        if (a === NO_HOMEROOM_KEY) {
            return 1;
        }
        if (b === NO_HOMEROOM_KEY) {
            return -1;
        }
        const la = typeof labelForKey === 'function' ? labelForKey(a) : a;
        const lb = typeof labelForKey === 'function' ? labelForKey(b) : b;
        return String(la || '').localeCompare(String(lb || ''), undefined, { sensitivity: 'base' });
    }

    /**
     * @param {Array} notes filtered notes
     * @param {string[]} [homeroomOrderKeys] display order for homeroom groups
     * @param {function} [resolveHomeroomMeta] (classId) => { key, label }
     * @param {string[]} [classOrderIds] display order for class groups within each homeroom
     */
    function groupNotesByHomeroom(notes, homeroomOrderKeys, resolveHomeroomMeta, classOrderIds) {
        const hrMap = new Map();
        (notes || []).forEach((note) => {
            const meta = typeof resolveHomeroomMeta === 'function'
                ? resolveHomeroomMeta(note.classId)
                : { key: NO_HOMEROOM_KEY, label: '' };
            const hrKey = meta && meta.key ? meta.key : NO_HOMEROOM_KEY;
            if (!hrMap.has(hrKey)) {
                hrMap.set(hrKey, {
                    homeroomKey: hrKey,
                    homeroomLabel: meta && meta.label ? meta.label : '',
                    classMap: new Map()
                });
            }
            const bucket = hrMap.get(hrKey);
            if (!bucket.classMap.has(note.classId)) {
                bucket.classMap.set(note.classId, []);
            }
            bucket.classMap.get(note.classId).push(note);
        });
        const labelForKey = (key) => {
            const bucket = hrMap.get(key);
            return bucket ? bucket.homeroomLabel : key;
        };
        const order = Array.isArray(homeroomOrderKeys) && homeroomOrderKeys.length
            ? homeroomOrderKeys.filter((k) => hrMap.has(k))
            : [...hrMap.keys()].sort((a, b) => compareHomeroomKeys(a, b, labelForKey));
        const extra = [...hrMap.keys()].filter((k) => !order.includes(k));
        const classOrder = Array.isArray(classOrderIds) && classOrderIds.length
            ? classOrderIds
            : [];
        return [...order, ...extra].map((hrKey) => {
            const bucket = hrMap.get(hrKey);
            const classMap = bucket.classMap;
            const classKeys = classOrder.filter((id) => classMap.has(id));
            const extraClasses = [...classMap.keys()].filter((id) => !classKeys.includes(id)).sort();
            return {
                homeroomKey: hrKey,
                homeroomLabel: bucket.homeroomLabel,
                groups: [...classKeys, ...extraClasses].map((classId) => ({
                    classId,
                    notes: sortChronological(classMap.get(classId))
                }))
            };
        });
    }

    function getNotesForDate(dayNotes, dateStr) {
        const date = String(dateStr || '').trim();
        if (!date) {
            return [];
        }
        return sortNewestFirst((dayNotes || []).filter((n) => n && n.date === date));
    }

    /**
     * Notes where studentId appears in taggedStudentIds.
     * @param {object} [opts]
     * @param {string} [opts.categoryId]
     * @param {string} [opts.dateFrom] YYYY-MM-DD inclusive
     * @param {string} [opts.dateTo] YYYY-MM-DD inclusive
     */
    function getNotesForStudent(dayNotes, studentId, opts) {
        const sid = String(studentId || '').trim();
        if (!sid) {
            return [];
        }
        const f = opts || {};
        const categoryId = f.categoryId ? normalizeCategoryId(f.categoryId) : '';
        return sortByDateDesc((dayNotes || []).filter((note) => {
            if (!note || !Array.isArray(note.taggedStudentIds)) {
                return false;
            }
            if (!note.taggedStudentIds.includes(sid)) {
                return false;
            }
            if (categoryId && normalizeCategoryId(note.categoryId) !== categoryId) {
                return false;
            }
            if (f.dateFrom && compareDateStr(note.date, f.dateFrom) < 0) {
                return false;
            }
            if (f.dateTo && compareDateStr(note.date, f.dateTo) > 0) {
                return false;
            }
            return true;
        }));
    }

    function resolveDayNoteCategoryLabel(categoryId, customCategories, translate) {
        const api = getCategoriesApi();
        if (api && api.resolveCategoryLabel) {
            return api.resolveCategoryLabel(categoryId, customCategories, translate);
        }
        return normalizeCategoryId(categoryId);
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

    /**
     * Prep notes left at the previous class meeting (category next-class-notes).
     * @param {Array} dayNotes
     * @param {string} classId
     * @param {string} beforeDateStr anchor ISO date (exclusive when finding prior meeting)
     * @param {object} classData class record for schedule hooks
     * @param {object} hooks passed to getPreviousClassMeetingBefore
     * @returns {{ previousMeetingDate: string, notes: Array }}
     */
    function getNextClassPrepNotes(dayNotes, classId, beforeDateStr, classData, hooks) {
        const hw = getHomeworkTabApi();
        const previousMeetingDate = hw && typeof hw.getPreviousClassMeetingBefore === 'function'
            ? hw.getPreviousClassMeetingBefore(classData, beforeDateStr, hooks)
            : '';
        if (!previousMeetingDate) {
            return { previousMeetingDate: '', notes: [] };
        }
        const notes = getNotesForClassOnDate(dayNotes, classId, previousMeetingDate).filter(
            (note) => normalizeCategoryId(note.categoryId) === NEXT_CLASS_NOTES_CATEGORY_ID
        );
        return { previousMeetingDate, notes };
    }

    function formatTimeLabel(iso, locale) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) {
            return '';
        }
        const loc = locale === 'ko' ? 'ko-KR' : 'en-US';
        return d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
    }

    function sanitizeExportText(text) {
        const utils = typeof global.CCPUtils !== 'undefined' ? global.CCPUtils : null;
        if (utils && utils.sanitizeExportText) {
            return utils.sanitizeExportText(text);
        }
        if (utils && utils.normalizeClipboardText) {
            return utils.normalizeClipboardText(text);
        }
        return String(text ?? '')
            .replace(/\u2014/g, '-')
            .replace(/\u2013/g, '-')
            .replace(/\u2212/g, '-')
            .replace(/\u2026/g, '...')
            .replace(/\u00B7/g, ' - ')
            .replace(/[\u2500-\u2503\u2508-\u250B\u2550-\u2551]/g, (ch) => (ch === '\u2550' || ch === '\u2551' ? '=' : '-'));
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
        lines.push(`${dateStr} - ${title}`);
        lines.push('--------------------------------');
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
                ? `[${time}] ${className} - ${subject}`
                : `[${time}] ${className}`;
            lines.push(head);
            lines.push(sanitizeExportText(String(note.text || '').trim()));
            lines.push('');
        });
        return sanitizeExportText(lines.join('\n').trimEnd());
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
            lines.push(`${rangeLabel} - ${title}`);
        } else {
            lines.push(title);
        }
        lines.push('========================================');
        const groups = groupNotesByClass(notes, classOrderIds);
        if (!groups.length) {
            return sanitizeExportText(lines.join('\n').trimEnd());
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
            const heading = subject ? `${className} - ${subject}` : className;
            if (gi > 0) {
                lines.push('');
            }
            lines.push(`-- ${heading} --`);
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
                lines.push(sanitizeExportText(String(note.text || '').trim()));
            });
        });
        return sanitizeExportText(lines.join('\n').trimEnd());
    }

    /**
     * Export notes grouped by homeroom teacher, then class; within each class, chronological.
     * @param {object} opts
     * @param {string} opts.dateFrom
     * @param {string} opts.dateTo
     * @param {Array} opts.notes filtered normalized notes
     * @param {string[]} opts.classOrderIds
     * @param {string[]} [opts.homeroomOrderKeys]
     * @param {function} opts.resolveMeta (classId) => { className, subject }
     * @param {function} opts.resolveHomeroomMeta (classId) => { key, label }
     * @param {function} [opts.formatDate] (isoDate) => string
     * @param {string} opts.locale
     * @param {string} opts.headerTitle
     * @param {string} [opts.rangeLabel]
     * @param {function} [opts.resolveCategoryLabel] (categoryId) => string
     */
    function formatRangeExportByHomeroom(opts) {
        const {
            notes,
            classOrderIds,
            homeroomOrderKeys,
            resolveMeta,
            resolveHomeroomMeta,
            resolveCategoryLabel,
            formatDate,
            locale,
            headerTitle,
            rangeLabel
        } = opts || {};
        const exportCategoryIds = new Set();
        (notes || []).forEach((note) => {
            exportCategoryIds.add(normalizeCategoryId(note && note.categoryId));
        });
        const showCategoryInExport = exportCategoryIds.size > 1
            && typeof resolveCategoryLabel === 'function';
        const lines = [];
        const title = headerTitle || 'Class notes export';
        if (rangeLabel) {
            lines.push(`${rangeLabel} - ${title}`);
        } else {
            lines.push(title);
        }
        lines.push('========================================');
        const hrGroups = groupNotesByHomeroom(
            notes,
            homeroomOrderKeys,
            resolveHomeroomMeta,
            classOrderIds
        );
        if (!hrGroups.length) {
            return sanitizeExportText(lines.join('\n').trimEnd());
        }
        const fmtDate = typeof formatDate === 'function'
            ? formatDate
            : (d) => d;
        hrGroups.forEach((hrGroup, hi) => {
            if (hi > 0) {
                lines.push('');
            }
            lines.push(`== ${sanitizeExportText(hrGroup.homeroomLabel || hrGroup.homeroomKey)} ==`);
            (hrGroup.groups || []).forEach((group, gi) => {
                const meta = typeof resolveMeta === 'function'
                    ? resolveMeta(group.classId)
                    : null;
                const className = meta && meta.className ? meta.className : group.classId;
                const subject = meta && meta.subject ? meta.subject : '';
                const heading = subject ? `${className} - ${subject}` : className;
                if (gi > 0) {
                    lines.push('');
                }
                lines.push(`-- ${heading} --`);
                let lastDate = '';
                group.notes.forEach((note) => {
                    if (note.date !== lastDate) {
                        lastDate = note.date;
                        lines.push('');
                        lines.push(fmtDate(note.date));
                    }
                    const time = formatTimeLabel(note.createdAt, locale);
                    if (time) {
                        if (showCategoryInExport) {
                            const catLabel = sanitizeExportText(
                                resolveCategoryLabel(note.categoryId) || ''
                            );
                            lines.push(catLabel ? `[${catLabel}] [${time}]` : `[${time}]`);
                        } else {
                            lines.push(`[${time}]`);
                        }
                    }
                    lines.push(sanitizeExportText(String(note.text || '').trim()));
                });
            });
        });
        return sanitizeExportText(lines.join('\n').trimEnd());
    }

    global.CCPDayNotes = {
        DEFAULT_CATEGORY_ID,
        NEXT_CLASS_NOTES_CATEGORY_ID,
        normalizeDayNote,
        normalizeCategoryId,
        normalizeTaggedStudentIds,
        normalizeDayNotesList,
        mergeDayNotesById,
        sortNewestFirst,
        sortOldestFirst,
        sortChronological,
        sortByDateDesc,
        sortNotesForDisplay,
        normalizeClassNotesSortMode,
        CLASS_NOTES_SORT_MODES,
        getNotesForDate,
        getNotesForStudent,
        resolveDayNoteCategoryLabel,
        getNotesForClassOnDate,
        hasNotesForClassOnDate,
        getNextClassPrepNotes,
        noteMatchesTextQuery,
        filterNotes,
        groupNotesByClass,
        groupNotesByHomeroom,
        NO_HOMEROOM_KEY,
        findNoteById,
        updateDayNote,
        removeDayNote,
        formatTimeLabel,
        sanitizeExportText,
        formatExportText,
        formatRangeExportByClass,
        formatRangeExportByHomeroom
    };
})(typeof window !== 'undefined' ? window : globalThis);
