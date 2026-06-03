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

    function templateByTitle(indexes, title) {
        if (!indexes || !title) {
            return null;
        }
        return indexes.byTitle.get(normalizePlanTitleKey(title)) || null;
    }

    function debateDayTitle(dayNum) {
        if (dayNum === 4) {
            return 'Day 4 / Preview';
        }
        return `Day ${dayNum}`;
    }

    function mergeTemplatesBySessionRange(indexes, start, end, combinedPlanTitle) {
        if (!indexes || start == null || end == null || end <= start) {
            return null;
        }
        const parts = [];
        for (let n = start; n <= end; n += 1) {
            const tpl = indexes.bySession.get(n);
            if (tpl) {
                parts.push(tpl);
            }
        }
        if (!parts.length) {
            return null;
        }
        return {
            planTitle: combinedPlanTitle || parts.map((p) => p.planTitle).filter(Boolean).join(' + '),
            planDetail: parts.map((p) => (p.planDetail || '').trim()).filter(Boolean).join('\n\n'),
            note: parts.map((p) => (p.note || '').trim()).filter(Boolean).join(' ')
        };
    }

    function mergeDebateTemplates(indexes, titles, combinedPlanTitle) {
        const parts = (titles || []).map((t) => templateByTitle(indexes, t)).filter(Boolean);
        if (!parts.length) {
            return null;
        }
        return {
            planTitle: combinedPlanTitle || parts.map((p) => p.planTitle).filter(Boolean).join(' & '),
            planDetail: parts.map((p) => (p.planDetail || '').trim()).filter(Boolean).join('\n\n'),
            note: parts.map((p) => (p.note || '').trim()).filter(Boolean).join(' ')
        };
    }

    /**
     * Debate monthly: merged calendar slots and month-bridge days use combined templates.
     */
    function resolveDebateRowTemplate(indexes, row) {
        if (!indexes || !row) {
            return null;
        }
        const key = row.debateTemplateKey;
        if (key === 'day2and3combined') {
            return templateByTitle(indexes, 'Day 2 & 3 Combined')
                || mergeDebateTemplates(indexes, ['Day 2', 'Day 3'], 'Day 2 & 3 Combined');
        }
        if (key === 'day4and1bridge') {
            return mergeDebateTemplates(
                indexes,
                ['Day 4 / Preview', 'Day 1'],
                'Day 4 / Preview & Day 1 (month bridge)'
            );
        }
        if (row.debateCompressed && row.debateGroupStart != null && row.debateGroupEnd != null) {
            const start = row.debateGroupStart;
            const end = row.debateGroupEnd;
            if (start === 2 && end === 3) {
                return templateByTitle(indexes, 'Day 2 & 3 Combined')
                    || mergeDebateTemplates(indexes, ['Day 2', 'Day 3'], 'Day 2 & 3 Combined');
            }
            const dayTitles = [];
            for (let d = start; d <= end; d += 1) {
                dayTitles.push(debateDayTitle(d));
            }
            return mergeDebateTemplates(indexes, dayTitles);
        }
        const title = (row.planTitle || '').trim().toLowerCase();
        if (/combined/.test(title) || (/day\s*2/.test(title) && /day\s*3/.test(title))
            || (/merge/.test(title) && /2/.test(title) && /3/.test(title))) {
            return templateByTitle(indexes, 'Day 2 & 3 Combined')
                || mergeDebateTemplates(indexes, ['Day 2', 'Day 3'], 'Day 2 & 3 Combined');
        }
        return resolveRowTemplate(indexes, row, { skipDebate: true });
    }

    /**
     * Find preset row: plan title / unit block first, then curriculum lesson #.
     */
    function resolveRowTemplate(indexes, row, options) {
        options = options || {};
        if (!indexes || !row) {
            return null;
        }
        const isDebate = row.scheduleModel === 'debateMonthly';
        if (!options.skipDebate && (row.debateTemplateKey || (row.debateCompressed && isDebate))) {
            const debateTpl = resolveDebateRowTemplate(indexes, row);
            if (debateTpl) {
                return debateTpl;
            }
        }
        if (row.scheduleCompressed
            && row.compressedGroupStart != null
            && row.compressedGroupEnd != null
            && row.compressedGroupEnd > row.compressedGroupStart) {
            const merged = mergeTemplatesBySessionRange(
                indexes,
                row.compressedGroupStart,
                row.compressedGroupEnd,
                row.planTitle
            );
            if (merged) {
                return merged;
            }
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
        const force = opts.force === true;
        let applied = false;
        if (opts.syncTitle !== false && tpl.planTitle) {
            row.planTitle = tpl.planTitle;
            if (force) {
                applied = true;
            }
        }
        if (tpl.planDetail) {
            row.planDetail = tpl.planDetail;
            applied = true;
        }
        if (force) {
            row.note = tpl.note || '';
            if (tpl.note) {
                applied = true;
            }
        } else if (tpl.note && !row.note) {
            row.note = tpl.note;
            applied = true;
        }
        return applied;
    }

    function applyRowTemplatesToSyllabusRows(rows, templates, options) {
        if (!Array.isArray(rows) || !Array.isArray(templates) || templates.length === 0) {
            return { rows: rows || [], applied: 0 };
        }
        const opts = options || {};
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
            if (applyTemplateToRow(row, tpl, {
                syncTitle: row.kind === 'lesson',
                force: opts.force === true
            })) {
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
        templateByTitle,
        mergeTemplatesBySessionRange,
        mergeDebateTemplates,
        resolveDebateRowTemplate,
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
