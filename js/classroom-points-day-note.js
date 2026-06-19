/**
 * Sync studentPoints ledger entries to auto-managed day notes (category class-points).
 */
(function (global) {
    const POINTS_DAY_NOTE_CATEGORY_ID = 'class-points';

    function getCategoriesApi() {
        return typeof global.CCPDayNoteCategories !== 'undefined' ? global.CCPDayNoteCategories : null;
    }

    function getDomainApi() {
        return typeof global.CCPClassroomDomain !== 'undefined' ? global.CCPClassroomDomain : null;
    }

    function normalizeCategoryId(raw) {
        const api = getCategoriesApi();
        if (api && api.normalizeCategoryId) {
            return api.normalizeCategoryId(raw);
        }
        const id = String(raw || '').trim();
        return id || 'class-notes';
    }

    function normalizePointEntry(raw) {
        const d = getDomainApi();
        if (d && d.normalizePointEntry) {
            return d.normalizePointEntry(raw);
        }
        return raw && raw.id ? raw : null;
    }

    function listPointsForClassOnDate(points, classId, dateStr) {
        const cid = String(classId || '').trim();
        const date = String(dateStr || '').trim();
        if (!cid || !date) {
            return [];
        }
        return (Array.isArray(points) ? points : [])
            .map(normalizePointEntry)
            .filter(Boolean)
            .filter((p) => p.classId === cid && p.date === date);
    }

    function buildStudentNameMap(students) {
        const map = new Map();
        (students || []).forEach((entry) => {
            if (entry && entry.student && entry.student.id) {
                map.set(entry.student.id, String(entry.student.name || entry.student.id).trim());
            }
        });
        return map;
    }

    function normalizeReasonLabel(raw, translate) {
        const reason = String(raw || '').trim();
        if (reason) {
            return reason;
        }
        const t = typeof translate === 'function' ? translate : (k) => k;
        return t('classroomPointsNoteNoReason');
    }

    function formatDelta(net) {
        const sign = net > 0 ? '+' : '';
        return `${sign}${net}`;
    }

    /**
     * @param {{ entries: object[], students: object[], translate?: function }} opts
     * @returns {string}
     */
    function buildPointsDayNoteText(opts) {
        const options = opts || {};
        const entries = options.entries || [];
        const translate = options.translate;
        const nameMap = buildStudentNameMap(options.students);
        const byStudent = new Map();

        entries.forEach((e) => {
            if (!e || !e.studentId) {
                return;
            }
            const sid = String(e.studentId).trim();
            const reasonLabel = normalizeReasonLabel(e.reason, translate);
            if (!byStudent.has(sid)) {
                byStudent.set(sid, new Map());
            }
            const reasonMap = byStudent.get(sid);
            const prev = reasonMap.get(reasonLabel) || 0;
            reasonMap.set(reasonLabel, prev + (Number(e.delta) || 0));
        });

        const lines = [];
        Array.from(byStudent.entries())
            .sort((a, b) => {
                const nameA = nameMap.get(a[0]) || a[0];
                const nameB = nameMap.get(b[0]) || b[0];
                return String(nameA).localeCompare(String(nameB));
            })
            .forEach(([sid, reasonMap]) => {
                const name = nameMap.get(sid) || sid;
                const fragments = Array.from(reasonMap.entries())
                    .filter(([, net]) => net !== 0)
                    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
                    .map(([reasonLabel, net]) => `${formatDelta(net)} — ${reasonLabel}`);
                if (!fragments.length) {
                    return;
                }
                lines.push(`${name}: ${fragments.join('; ')}`);
            });

        return lines.join('\n').trim();
    }

    function findPointsDayNote(dayNotes, classId, dateStr) {
        const cid = String(classId || '').trim();
        const date = String(dateStr || '').trim();
        if (!cid || !date) {
            return null;
        }
        const matches = (dayNotes || []).filter(
            (n) =>
                n
                && n.classId === cid
                && n.date === date
                && normalizeCategoryId(n.categoryId) === POINTS_DAY_NOTE_CATEGORY_ID
        );
        if (!matches.length) {
            return null;
        }
        matches.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
        return matches[0] || null;
    }

    function defaultNoteId() {
        return `dn_pts_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    /**
     * @returns {object[]} new dayNotes array (same reference if unchanged)
     */
    function syncPointsDayNote(opts) {
        const options = opts || {};
        const classId = String(options.classId || '').trim();
        const dateStr = String(options.dateStr || '').trim();
        const dayNotes = Array.isArray(options.dayNotes) ? options.dayNotes : [];
        if (!classId || !dateStr) {
            return dayNotes;
        }

        const entries = listPointsForClassOnDate(options.studentPoints, classId, dateStr);
        const text = buildPointsDayNoteText({
            entries,
            students: options.students,
            translate: options.translate
        });

        const normalizeDayNote =
            options.normalizeDayNote
            || (global.CCPDayNotes && global.CCPDayNotes.normalizeDayNote)
            || null;

        let list = dayNotes.slice();
        const existing = findPointsDayNote(list, classId, dateStr);

        const duplicateIds = new Set();
        list.forEach((n) => {
            if (
                n
                && n.classId === classId
                && n.date === dateStr
                && normalizeCategoryId(n.categoryId) === POINTS_DAY_NOTE_CATEGORY_ID
                && (!existing || n.id !== existing.id)
            ) {
                duplicateIds.add(n.id);
            }
        });
        if (duplicateIds.size) {
            list = list.filter((n) => !n || !duplicateIds.has(n.id));
        }

        if (!text) {
            if (!existing) {
                return dayNotes;
            }
            return list.filter((n) => n && n.id !== existing.id);
        }

        const idFn = typeof options.generateId === 'function' ? options.generateId : defaultNoteId;
        const noteRaw = existing
            ? Object.assign({}, existing, { text, categoryId: POINTS_DAY_NOTE_CATEGORY_ID })
            : {
                id: idFn(),
                classId,
                date: dateStr,
                text,
                createdAt: new Date().toISOString(),
                categoryId: POINTS_DAY_NOTE_CATEGORY_ID,
                authorUserId: options.authorUserId || undefined
            };

        if (!normalizeDayNote) {
            return dayNotes;
        }
        const normalized = normalizeDayNote(noteRaw);
        if (!normalized) {
            return dayNotes;
        }

        if (existing) {
            const idx = list.findIndex((n) => n && n.id === existing.id);
            if (idx < 0) {
                return dayNotes;
            }
            if (list[idx].text === normalized.text && list[idx].categoryId === normalized.categoryId) {
                return dayNotes;
            }
            const out = list.slice();
            out[idx] = normalized;
            return out;
        }

        return list.concat([normalized]);
    }

    function collectClassDatePairsFromPoints(studentPoints) {
        const seen = new Set();
        const pairs = [];
        (studentPoints || []).forEach((raw) => {
            const p = normalizePointEntry(raw);
            if (!p || !p.classId || !p.date) {
                return;
            }
            const key = `${p.classId}|${p.date}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            pairs.push({ classId: p.classId, dateStr: p.date });
        });
        return pairs;
    }

    global.CCPClassroomPointsDayNote = {
        POINTS_DAY_NOTE_CATEGORY_ID,
        listPointsForClassOnDate,
        buildPointsDayNoteText,
        findPointsDayNote,
        syncPointsDayNote,
        collectClassDatePairsFromPoints
    };
})(typeof window !== 'undefined' ? window : globalThis);
