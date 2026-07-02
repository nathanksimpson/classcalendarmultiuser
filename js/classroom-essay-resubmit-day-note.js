/**
 * Sync essay resubmit students to auto-managed class day notes (category essay-resubmit).
 */
(function (global) {
    const ESSAY_RESUBMIT_DAY_NOTE_CATEGORY_ID = 'essay-resubmit';

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

    function buildStudentNameMap(students) {
        const map = new Map();
        (students || []).forEach((entry) => {
            if (entry && entry.student && entry.student.id) {
                map.set(entry.student.id, String(entry.student.name || entry.student.id).trim());
            }
        });
        return map;
    }

    function listResubmitRecords(submission) {
        if (!submission || !Array.isArray(submission.records)) {
            return [];
        }
        return submission.records.filter((rec) => rec && rec.status === 'resubmit_required');
    }

    /**
     * @param {{ records: object[], students: object[], assignmentLabel?: string, translate?: function }} opts
     */
    function buildEssayResubmitDayNoteText(opts) {
        const options = opts || {};
        const translate = options.translate;
        const t = typeof translate === 'function' ? translate : (k) => k;
        const nameMap = buildStudentNameMap(options.students);
        const assignmentLabel = String(options.assignmentLabel || '').trim();
        const header = assignmentLabel
            ? `${t('classroomEssayResubmitNoteHeader')}: ${assignmentLabel}`
            : t('classroomEssayResubmitNoteHeader');
        const lines = [header];
        const records = listResubmitRecords({ records: options.records || [] });
        records
            .slice()
            .sort((a, b) => {
                const nameA = nameMap.get(a.studentId) || a.studentId;
                const nameB = nameMap.get(b.studentId) || b.studentId;
                return String(nameA).localeCompare(String(nameB));
            })
            .forEach((rec) => {
                const name = nameMap.get(rec.studentId) || rec.studentId;
                const reason = String(rec.note || '').trim();
                const reasonText = reason || t('classroomEssayResubmitNoteNoReason');
                lines.push(`@${name} — ${reasonText}`);
            });
        return lines.join('\n').trim();
    }

    function collectTaggedStudentIds(records) {
        return listResubmitRecords({ records: records || [] })
            .map((rec) => String(rec.studentId || '').trim())
            .filter(Boolean);
    }

    function findEssayResubmitDayNote(dayNotes, classId, dateStr) {
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
                && normalizeCategoryId(n.categoryId) === ESSAY_RESUBMIT_DAY_NOTE_CATEGORY_ID
        );
        if (!matches.length) {
            return null;
        }
        matches.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
        return matches[0] || null;
    }

    function defaultNoteId() {
        return `dn_essay_rs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    /**
     * @returns {object[]} new dayNotes array (same reference if unchanged)
     */
    function syncEssayResubmitDayNote(opts) {
        const options = opts || {};
        const classId = String(options.classId || '').trim();
        const dateStr = String(options.dateStr || '').trim();
        const dayNotes = Array.isArray(options.dayNotes) ? options.dayNotes : [];
        if (!classId || !dateStr) {
            return dayNotes;
        }

        const submission = options.essaySubmission || null;
        const records = submission && Array.isArray(submission.records) ? submission.records : [];
        const text = buildEssayResubmitDayNoteText({
            records,
            students: options.students,
            assignmentLabel: options.assignmentLabel,
            translate: options.translate
        });
        const taggedStudentIds = collectTaggedStudentIds(records);

        const normalizeDayNote =
            options.normalizeDayNote
            || (global.CCPDayNotes && global.CCPDayNotes.normalizeDayNote)
            || null;

        let list = dayNotes.slice();
        const existing = findEssayResubmitDayNote(list, classId, dateStr);

        const duplicateIds = new Set();
        list.forEach((n) => {
            if (
                n
                && n.classId === classId
                && n.date === dateStr
                && normalizeCategoryId(n.categoryId) === ESSAY_RESUBMIT_DAY_NOTE_CATEGORY_ID
                && (!existing || n.id !== existing.id)
            ) {
                duplicateIds.add(n.id);
            }
        });
        if (duplicateIds.size) {
            list = list.filter((n) => !n || !duplicateIds.has(n.id));
        }

        const hasResubmit = listResubmitRecords({ records }).length > 0;
        if (!hasResubmit) {
            if (!existing) {
                return dayNotes;
            }
            return list.filter((n) => n && n.id !== existing.id);
        }

        const idFn = typeof options.generateId === 'function' ? options.generateId : defaultNoteId;
        const noteRaw = existing
            ? Object.assign({}, existing, {
                text,
                categoryId: ESSAY_RESUBMIT_DAY_NOTE_CATEGORY_ID,
                taggedStudentIds
            })
            : {
                id: idFn(),
                classId,
                date: dateStr,
                text,
                createdAt: new Date().toISOString(),
                categoryId: ESSAY_RESUBMIT_DAY_NOTE_CATEGORY_ID,
                taggedStudentIds,
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
            const prevTags = JSON.stringify(existing.taggedStudentIds || []);
            const nextTags = JSON.stringify(normalized.taggedStudentIds || []);
            if (list[idx].text === normalized.text && prevTags === nextTags) {
                return dayNotes;
            }
            const out = list.slice();
            out[idx] = normalized;
            return out;
        }

        return list.concat([normalized]);
    }

    global.CCPClassroomEssayResubmitDayNote = {
        ESSAY_RESUBMIT_DAY_NOTE_CATEGORY_ID,
        buildEssayResubmitDayNoteText,
        collectTaggedStudentIds,
        findEssayResubmitDayNote,
        syncEssayResubmitDayNote,
        listResubmitRecords
    };
})(typeof window !== 'undefined' ? window : globalThis);
