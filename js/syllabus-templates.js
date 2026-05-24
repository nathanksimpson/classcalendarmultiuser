/**
 * Custom syllabus templates — reusable units + session row templates.
 * Lesson plan titles (e.g. "Unit 1 Part 1") are the canonical link to page blocks.
 */
(function (global) {
    function normalizePlanTitleKey(title) {
        return (title || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    /**
     * Stable key for matching unit/part and project rows across title variants.
     * @returns {string|null} e.g. unit:1:part:1, project:2
     */
    function parseCurriculumBlockKey(title) {
        const t = (title || '').trim();
        if (!t) {
            return null;
        }
        let m = /^unit\s*(\d+)\s*part\s*(\d+)/i.exec(t);
        if (m) {
            return `unit:${m[1]}:part:${m[2]}`;
        }
        m = /^project\s*(\d+)/i.exec(t);
        if (m) {
            return `project:${m[1]}`;
        }
        m = /unit\s*(\d+)\s*\[\s*(\d)\s*\/\s*2\s*\]/i.exec(t);
        if (m) {
            return `unit:${m[1]}:part:${m[2]}`;
        }
        m = /unit\s*(\d+)\s*[-–]\s*(\d)/i.exec(t);
        if (m) {
            return `unit:${m[1]}:part:${m[2]}`;
        }
        return null;
    }

    function buildTemplateIndexes(templates) {
        const bySession = new Map();
        const byTitle = new Map();
        const byBlockKey = new Map();
        (templates || []).forEach((tpl) => {
            const n = parseInt(tpl.sessionNumber, 10);
            if (!Number.isNaN(n) && n > 0) {
                bySession.set(n, tpl);
            }
            if (tpl.planTitle) {
                byTitle.set(normalizePlanTitleKey(tpl.planTitle), tpl);
                const blockKey = parseCurriculumBlockKey(tpl.planTitle);
                if (blockKey) {
                    byBlockKey.set(blockKey, tpl);
                }
            }
        });
        return { bySession, byTitle, byBlockKey };
    }

    /**
     * Find preset row: plan title / unit block first, then curriculum lesson #.
     */
    function resolveRowTemplate(indexes, row) {
        if (!indexes || !row) {
            return null;
        }
        const title = (row.planTitle || '').trim();
        if (title) {
            const byExactTitle = indexes.byTitle.get(normalizePlanTitleKey(title));
            if (byExactTitle) {
                return byExactTitle;
            }
            const blockKey = parseCurriculumBlockKey(title);
            if (blockKey && indexes.byBlockKey.has(blockKey)) {
                return indexes.byBlockKey.get(blockKey);
            }
        }
        const lessonNum = (row.lessonNumber != null && row.lessonNumber > 0)
            ? row.lessonNumber
            : row.sessionNumber;
        if (lessonNum > 0 && indexes.bySession.has(lessonNum)) {
            return indexes.bySession.get(lessonNum);
        }
        return null;
    }

    function applyTemplateToRow(row, tpl, options) {
        if (!row || !tpl) {
            return false;
        }
        const opts = options || {};
        let applied = false;
        if (opts.syncTitle !== false && tpl.planTitle) {
            row.planTitle = tpl.planTitle;
        }
        if (tpl.planDetail) {
            row.planDetail = tpl.planDetail;
            applied = true;
        }
        if (tpl.note && !row.note) {
            row.note = tpl.note;
        }
        return applied;
    }

    function applyRowTemplatesToSyllabusRows(rows, templates) {
        if (!Array.isArray(rows) || !Array.isArray(templates) || templates.length === 0) {
            return { rows: rows || [], applied: 0 };
        }
        const indexes = buildTemplateIndexes(templates);
        let applied = 0;
        (rows || []).forEach((row) => {
            if (row.kind !== 'lesson' && row.kind !== 'overflow') {
                return;
            }
            const tpl = resolveRowTemplate(indexes, row);
            if (!tpl) {
                return;
            }
            if (applyTemplateToRow(row, tpl, { syncTitle: row.kind === 'lesson' })) {
                if (row.kind === 'lesson') {
                    row.source = 'manual';
                }
                applied += 1;
            }
        });
        return { rows, applied };
    }

    function planDetailFromRowTemplates(row, templates) {
        if (!row || !templates || !templates.length) {
            return '';
        }
        const tpl = resolveRowTemplate(buildTemplateIndexes(templates), row);
        return tpl && tpl.planDetail ? tpl.planDetail : '';
    }

    function lessonRowsToRowTemplates(rows) {
        return (rows || [])
            .filter((r) => r.kind === 'lesson' && r.sessionNumber)
            .map((r) => ({
                sessionNumber: r.sessionNumber,
                planTitle: r.planTitle || '',
                planDetail: r.planDetail || '',
                note: r.note || ''
            }));
    }

    function noteRowsFromSyllabusRows(rows) {
        return (rows || [])
            .filter((r) => r.kind === 'note')
            .map((r) => ({
                planTitle: r.planTitle || '',
                planDetail: r.planDetail || '',
                note: r.note || ''
            }));
    }

    function expandTemplateToEditorRows(template, hooks) {
        const h = hooks || {};
        const newRowId = h.newRowId || (() => 'row-' + Math.random().toString(36).slice(2, 11));
        const rows = [];
        (template.noteRows || []).forEach((n) => {
            rows.push({
                id: newRowId(),
                kind: 'note',
                planTitle: n.planTitle || '',
                planDetail: n.planDetail || '',
                note: n.note || '',
                source: 'manual',
                sessionNumber: 0,
                weekLabel: '',
                monthKey: '',
                date: ''
            });
        });
        const templates = template.rowTemplates || [];
        const maxSession = templates.reduce((m, t) => Math.max(m, t.sessionNumber || 0), 0);
        for (let s = 1; s <= maxSession; s += 1) {
            const tpl = templates.find((t) => t.sessionNumber === s);
            rows.push({
                id: newRowId(),
                kind: 'lesson',
                sessionNumber: s,
                planTitle: tpl ? (tpl.planTitle || '') : '',
                planDetail: tpl ? (tpl.planDetail || '') : '',
                note: tpl ? (tpl.note || '') : '',
                source: 'manual',
                weekLabel: '',
                monthKey: '',
                date: ''
            });
        }
        return rows;
    }

    function collectTemplateFromEditor(units, rows) {
        return {
            syllabusUnits: Array.isArray(units) ? units.map((u) => ({ ...u })) : [],
            rowTemplates: lessonRowsToRowTemplates(rows),
            noteRows: noteRowsFromSyllabusRows(rows)
        };
    }

    global.CCPSyllabusTemplates = {
        normalizePlanTitleKey,
        parseCurriculumBlockKey,
        buildTemplateIndexes,
        resolveRowTemplate,
        applyTemplateToRow,
        applyRowTemplatesToSyllabusRows,
        planDetailFromRowTemplates,
        lessonRowsToRowTemplates,
        noteRowsFromSyllabusRows,
        expandTemplateToEditorRows,
        collectTemplateFromEditor
    };
})(typeof window !== 'undefined' ? window : globalThis);
