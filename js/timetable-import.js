/**
 * Timetable import — shared grid parser, xlsx path, apply plan (Excel / PDF / OCR converge here).
 */
(function (global) {
    const DOW_ALIASES = {
        mon: 1,
        monday: 1,
        tue: 2,
        tues: 2,
        tuesday: 2,
        wed: 3,
        weds: 3,
        wednesday: 3,
        thu: 4,
        thur: 4,
        thurs: 4,
        thursday: 4,
        fri: 5,
        friday: 5,
        월: 1,
        화: 2,
        수: 3,
        목: 4,
        금: 5
    };

    const SUBJECT_TRACK_ALIASES = [
        { track: 'phonics', patterns: [/phonics/i, /파닉스/] },
        { track: 'animation', patterns: [/animation/i, /애니메이션/, /\bani\b/i] },
        { track: 'spkWr', patterns: [/spk\s*&\s*wr/i, /spk&wr/i, /speaking/i, /writing/i, /말하기/] },
        { track: 'reading', patterns: [/reading/i, /리딩/, /\brc\b/i] },
        { track: 'debate', patterns: [/debate/i, /토론/] },
        { track: 'handInHand', patterns: [/hand\s*in\s*hand/i] },
        { track: 'writeNow', patterns: [/write\s*now/i] },
        { track: 'writeRight', patterns: [/write\s*right/i, /wr\s*&\s*sp/i] }
    ];

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function cellToText(cell) {
        if (cell == null) {
            return '';
        }
        if (typeof cell === 'object' && cell.w != null) {
            return normalizeStr(cell.w);
        }
        return normalizeStr(cell);
    }

    function aoaFromSheet(sheet, XLSX) {
        if (!sheet || !XLSX || !XLSX.utils) {
            return [];
        }
        return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    }

    /**
     * Parse one timetable cell (export format or OCR text).
     * @returns {{ className: string, category: string, cohortLabel: string, homeroomSuffix: string }}
     */
    function parseTimetableCellText(raw) {
        const lines = String(raw || '')
            .split(/\r?\n/)
            .map((l) => normalizeStr(l))
            .filter(Boolean);
        const out = {
            className: '',
            category: '',
            cohortLabel: '',
            homeroomSuffix: ''
        };
        if (!lines.length) {
            return out;
        }
        lines.forEach((line, idx) => {
            const hr = line.match(/^(?:담임|HR)\s*[:：]\s*(.+)$/i);
            if (hr) {
                out.homeroomSuffix = normalizeStr(hr[1]);
                return;
            }
            const paren = line.match(/^\(([^)]+)\)\s*$/);
            if (paren && idx > 0) {
                out.category = normalizeStr(paren[1]);
                return;
            }
            if (!out.className) {
                out.className = line;
                const dot = line.split('·').map((s) => normalizeStr(s));
                if (dot.length >= 2) {
                    out.cohortLabel = dot[0];
                    if (!out.category) {
                        out.category = dot.slice(1).join(' · ');
                    }
                } else {
                    out.cohortLabel = line;
                }
            } else if (!out.category) {
                out.category = line.replace(/^\(|\)$/g, '');
            }
        });
        return out;
    }

    function normalizeCohortLabel(name) {
        return normalizeStr(name)
            .replace(/^\[[^\]]+\]\s*/u, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function cohortLabelKey(name) {
        const core = normalizeCohortLabel(name).split('^')[0] || normalizeCohortLabel(name);
        return core.toLowerCase().replace(/[^a-z0-9\uac00-\ud7a3]/g, '');
    }

    function parseHomeroomLabels(line) {
        const text = normalizeStr(line);
        if (!text) {
            return [];
        }
        const stripped = text.replace(/^(?:homeroom|담임)\s*[:：]\s*/i, '');
        return stripped
            .split(/[\s,，/]+/)
            .map((t) => normalizeStr(t))
            .filter(Boolean);
    }

    function headerDow(cell) {
        const key = normalizeStr(cell).toLowerCase().replace(/\./g, '');
        if (DOW_ALIASES[key] != null) {
            return DOW_ALIASES[key];
        }
        const ko = normalizeStr(cell);
        if (DOW_ALIASES[ko] != null) {
            return DOW_ALIASES[ko];
        }
        return null;
    }

    function isTimeHeader(cell) {
        const s = normalizeStr(cell).toLowerCase();
        return s === 'time' || s === '시간' || s === 'time slot' || s.includes('시간');
    }

    function parseTimeRangeFromLabel(label) {
        const m = String(label || '').match(
            /(\d{1,2})\s*:\s*(\d{2})\s*[~～\-–—]\s*(\d{1,2})\s*:\s*(\d{2})/
        );
        if (!m) {
            return null;
        }
        const pad = (n) => String(Number(n)).padStart(2, '0');
        return {
            start: `${pad(m[1])}:${pad(m[2])}`,
            end: `${pad(m[3])}:${pad(m[4])}`
        };
    }

    /**
     * Map a time-column label to period + timeSlotId.
     */
    function matchTimeLabelToSlot(timeLabel, timetableTimeSlots, periodSlotMap) {
        const range = parseTimeRangeFromLabel(timeLabel);
        const domain = global.CCPClassroomDomain;
        if (range && domain && typeof domain.mapTmsBlockToPeriod === 'function') {
            return domain.mapTmsBlockToPeriod(range, timetableTimeSlots, periodSlotMap);
        }
        const slots = Array.isArray(timetableTimeSlots) ? timetableTimeSlots : [];
        const label = normalizeStr(timeLabel).toLowerCase();
        for (let i = 0; i < slots.length; i += 1) {
            const slot = slots[i];
            const start = normalizeStr(slot.start);
            if (start && label.includes(start)) {
                const map = periodSlotMap && typeof periodSlotMap === 'object' ? periodSlotMap : {};
                let period = null;
                Object.keys(map).forEach((p) => {
                    if (map[p] === slot.id) {
                        period = parseInt(p, 10);
                    }
                });
                return {
                    period,
                    timeSlotId: slot.id,
                    start: slot.start,
                    end: slot.end,
                    ambiguous: false
                };
            }
        }
        return { period: null, timeSlotId: '', start: '', end: '', ambiguous: false };
    }

    function findHeaderRowIndex(aoa) {
        for (let r = 0; r < Math.min(aoa.length, 20); r += 1) {
            const row = aoa[r] || [];
            let timeCol = -1;
            let dowCount = 0;
            row.forEach((cell, c) => {
                if (isTimeHeader(cell)) {
                    timeCol = c;
                }
                if (headerDow(cell) != null) {
                    dowCount += 1;
                }
            });
            if (timeCol >= 0 && dowCount >= 3) {
                return r;
            }
            if (dowCount >= 4 && row.some((cell) => parseTimeRangeFromLabel(cell))) {
                return r;
            }
        }
        return -1;
    }

    /**
     * Build TimetableImportDraft from a 2D array (Excel or reconstructed PDF grid).
     */
    function parseGridFromAoA(aoa, options) {
        options = options || {};
        const rows = Array.isArray(aoa) ? aoa : [];
        const warnings = [];
        let teacherName = normalizeStr(options.teacherName);
        let homeroomLabels = [];
        let headerIdx = findHeaderRowIndex(rows);

        if (!teacherName && rows[0] && rows[0][0]) {
            teacherName = normalizeStr(rows[0][0]);
        }
        if (headerIdx > 1 && rows[1]) {
            const hrLine = rows[1].map((c) => cellToText(c)).join(' ');
            homeroomLabels = parseHomeroomLabels(hrLine);
        } else if (headerIdx === 2 && rows[1]) {
            homeroomLabels = parseHomeroomLabels(cellToText(rows[1][0]));
        }

        if (headerIdx < 0) {
            return {
                teacherName,
                homeroomLabels,
                block: options.block || 'primary',
                sourceType: options.sourceType || 'xlsx',
                rows: [],
                warnings: ['header_not_found']
            };
        }

        const header = rows[headerIdx] || [];
        let timeCol = 0;
        const dowByCol = [];
        header.forEach((cell, c) => {
            if (isTimeHeader(cell)) {
                timeCol = c;
            }
            const dow = headerDow(cell);
            if (dow != null) {
                dowByCol[c] = dow;
            }
        });

        const dataRows = [];
        for (let r = headerIdx + 1; r < rows.length; r += 1) {
            const row = rows[r] || [];
            const timeLabel = cellToText(row[timeCol]);
            if (!timeLabel && !row.some((c, ci) => ci !== timeCol && cellToText(c))) {
                continue;
            }
            if (!parseTimeRangeFromLabel(timeLabel) && !row.some((c, ci) => ci !== timeCol && cellToText(c))) {
                continue;
            }
            const slotMatch = matchTimeLabelToSlot(
                timeLabel,
                options.timetableTimeSlots,
                options.periodSlotMap
            );
            const cells = [];
            Object.keys(dowByCol).forEach((colKey) => {
                const c = parseInt(colKey, 10);
                const dow = dowByCol[c];
                const rawText = cellToText(row[c]);
                if (!rawText) {
                    return;
                }
                cells.push({
                    dow,
                    rawText,
                    parsed: parseTimetableCellText(rawText),
                    confidence: options.defaultConfidence != null ? options.defaultConfidence : 1
                });
            });
            if (timeLabel || cells.length) {
                dataRows.push({
                    timeLabel,
                    timeSlotMatch: slotMatch,
                    cells
                });
            }
        }

        if (!dataRows.length) {
            warnings.push('no_data_rows');
        }

        return {
            teacherName,
            homeroomLabels,
            block: options.block || 'primary',
            sourceType: options.sourceType || 'xlsx',
            rows: dataRows,
            warnings
        };
    }

    function mapCategoryToSubjectTrack(category) {
        const label = normalizeStr(category);
        if (!label) {
            return null;
        }
        for (let i = 0; i < SUBJECT_TRACK_ALIASES.length; i += 1) {
            const entry = SUBJECT_TRACK_ALIASES[i];
            if (entry.patterns.some((re) => re.test(label))) {
                return entry.track;
            }
        }
        return null;
    }

    function matchTeacherAccount(name, accounts) {
        const tmsName = normalizeStr(name);
        const list = Array.isArray(accounts) ? accounts : [];
        if (!tmsName) {
            return { matchedBy: 'unmatched', userId: '', displayName: '', candidates: [] };
        }
        const exact = list.find(
            (r) =>
                normalizeStr(r.displayName) === tmsName ||
                normalizeStr(r.name) === tmsName
        );
        if (exact) {
            return {
                matchedBy: 'exact',
                userId: normalizeStr(exact.userId),
                displayName: normalizeStr(exact.displayName || exact.name),
                candidates: []
            };
        }
        const lower = tmsName.toLowerCase();
        const fuzzy = list.filter((r) => {
            const dn = normalizeStr(r.displayName || r.name).toLowerCase();
            return dn && (dn.includes(lower) || lower.includes(dn));
        });
        if (fuzzy.length === 1) {
            return {
                matchedBy: 'fuzzy',
                userId: normalizeStr(fuzzy[0].userId),
                displayName: normalizeStr(fuzzy[0].displayName || fuzzy[0].name),
                candidates: []
            };
        }
        if (fuzzy.length > 1) {
            return {
                matchedBy: 'unclear',
                userId: '',
                displayName: tmsName,
                candidates: fuzzy.map((r) => ({
                    userId: normalizeStr(r.userId),
                    displayName: normalizeStr(r.displayName || r.name)
                }))
            };
        }
        return { matchedBy: 'unmatched', userId: '', displayName: tmsName, candidates: [] };
    }

    function findCohortForLabel(cohorts, label) {
        const list = (Array.isArray(cohorts) ? cohorts : []).filter(
            (c) => c && !global.CCPClassroomDomain?.isArchiveCohort?.(c)
        );
        const key = cohortLabelKey(label);
        if (!key) {
            return null;
        }
        const exact = list.filter((c) => cohortLabelKey(c.name) === key);
        if (exact.length === 1) {
            return exact[0];
        }
        const partial = list.filter((c) => {
            const ck = cohortLabelKey(c.name);
            return ck && (ck.includes(key) || key.includes(ck));
        });
        if (partial.length === 1) {
            return partial[0];
        }
        return null;
    }

    function findClassForCohortSubject(appData, cohortId, category, subjectTrack) {
        const classes = Array.isArray(appData.classes) ? appData.classes : [];
        const cat = normalizeStr(category).toLowerCase();
        return (
            classes.find((cls) => {
                const domain = global.CCPClassroomDomain;
                const cohortIds =
                    domain && domain.getCohortIdsForClass
                        ? domain.getCohortIdsForClass(cls)
                        : cls.cohortIds || (cls.cohortId ? [cls.cohortId] : []);
                if (!cohortIds.includes(cohortId)) {
                    return false;
                }
                const teachers = Array.isArray(cls.classTeachers) ? cls.classTeachers : [];
                if (cat && teachers.some((t) => normalizeStr(t.category).toLowerCase() === cat)) {
                    return true;
                }
                if (subjectTrack && normalizeStr(cls.classTypeId).includes(subjectTrack)) {
                    return true;
                }
                const name = normalizeStr(cls.name).toLowerCase();
                return cat && name.includes(cat);
            }) || null
        );
    }

    /**
     * Flatten draft into placement entries for review/apply.
     */
    function buildTimetableApplyPlan(draft, appData, teacherAccounts) {
        const d = draft || { rows: [] };
        const teacherMatch = matchTeacherAccount(d.teacherName, teacherAccounts);
        const entries = [];
        const warnings = (d.warnings || []).slice();

        (d.rows || []).forEach((row) => {
            const period = row.timeSlotMatch && row.timeSlotMatch.period != null ? row.timeSlotMatch.period : null;
            const timeSlotId =
                row.timeSlotMatch && row.timeSlotMatch.timeSlotId
                    ? row.timeSlotMatch.timeSlotId
                    : '';
            (row.cells || []).forEach((cell) => {
                const parsed = cell.parsed || parseTimetableCellText(cell.rawText);
                const cohortLabel = parsed.cohortLabel || parsed.className;
                const cohort = findCohortForLabel(appData.cohorts, cohortLabel);
                const subjectTrack = mapCategoryToSubjectTrack(parsed.category);
                const classData =
                    cohort && findClassForCohortSubject(appData, cohort.id, parsed.category, subjectTrack);
                entries.push({
                    dow: cell.dow,
                    period,
                    timeSlotId,
                    timeLabel: row.timeLabel,
                    rawText: cell.rawText,
                    parsed,
                    confidence: cell.confidence != null ? cell.confidence : 1,
                    cohortId: cohort ? cohort.id : '',
                    cohortLabel,
                    classId: classData ? classData.id : '',
                    subjectTrack: subjectTrack || '',
                    category: parsed.category,
                    createClass: Boolean(cohort && !classData),
                    warnings: []
                });
                const entry = entries[entries.length - 1];
                if (!cohort) {
                    entry.warnings.push('cohort_unmatched');
                }
                if (!period && !timeSlotId) {
                    entry.warnings.push('period_unmatched');
                }
                if (cell.confidence != null && cell.confidence < 0.75) {
                    entry.warnings.push('low_confidence');
                }
            });
        });

        return {
            teacherName: d.teacherName,
            teacherMatch,
            sourceType: d.sourceType || 'xlsx',
            entries,
            warnings
        };
    }

    function newId(prefix) {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    }

    function applyTimetableImportPlan(appData, plan, options) {
        options = options || {};
        const makeId = typeof options.newId === 'function' ? options.newId : newId;
        const teacherUserId = normalizeStr(plan.teacherMatch && plan.teacherMatch.userId);
        const teacherName =
            normalizeStr(plan.teacherMatch && plan.teacherMatch.displayName) ||
            normalizeStr(plan.teacherName);
        let classes = Array.isArray(appData.classes) ? appData.classes.map((c) => Object.assign({}, c)) : [];
        const cohorts = Array.isArray(appData.cohorts) ? appData.cohorts : [];
        let applied = 0;
        let created = 0;

        (plan.entries || []).forEach((entry) => {
            if (options.entryFilter && !options.entryFilter(entry)) {
                return;
            }
            if (!entry.cohortId || entry.dow == null) {
                return;
            }
            const period = entry.period != null ? Number(entry.period) : null;
            const timeSlotId = normalizeStr(entry.timeSlotId);
            if (period == null && !timeSlotId) {
                return;
            }

            let classId = normalizeStr(entry.classId);
            let cls = classId ? classes.find((c) => c && c.id === classId) : null;

            if (!cls && entry.createClass) {
                const cohort = cohorts.find((c) => c && c.id === entry.cohortId);
                const cohortName = cohort ? normalizeStr(cohort.name) : entry.cohortLabel;
                const cat = normalizeStr(entry.category) || 'Subject';
                cls = {
                    id: makeId('class'),
                    name: `${cohortName} · ${cat}`,
                    cohortId: entry.cohortId,
                    cohortIds: [entry.cohortId],
                    meetingDays: [entry.dow],
                    classTeachers: [],
                    generatedFromCohort: true,
                    classTypeId: entry.subjectTrack || '',
                    syllabusRows: []
                };
                classes.push(cls);
                classId = cls.id;
                created += 1;
                if (cohort && Array.isArray(cohort.classIds) && !cohort.classIds.includes(classId)) {
                    cohort.classIds.push(classId);
                }
            }

            if (!cls) {
                return;
            }

            if (!Array.isArray(cls.classTeachers)) {
                cls.classTeachers = [];
            }

            let teacherRow = cls.classTeachers.find(
                (r) => teacherUserId && normalizeStr(r.userId) === teacherUserId
            );
            if (!teacherRow && teacherUserId) {
                teacherRow = {
                    id: makeId('ct'),
                    userId: teacherUserId,
                    name: teacherName,
                    category: normalizeStr(entry.category),
                    placements: []
                };
                cls.classTeachers.push(teacherRow);
            } else if (!teacherRow && teacherName) {
                teacherRow = cls.classTeachers.find(
                    (r) => normalizeStr(r.name).toLowerCase() === teacherName.toLowerCase()
                );
                if (!teacherRow) {
                    teacherRow = {
                        id: makeId('ct'),
                        userId: '',
                        name: teacherName,
                        category: normalizeStr(entry.category),
                        placements: []
                    };
                    cls.classTeachers.push(teacherRow);
                }
            }
            if (!teacherRow) {
                return;
            }

            if (!Array.isArray(teacherRow.placements)) {
                teacherRow.placements = [];
            }
            const placement = {
                dow: entry.dow,
                period: period != null ? period : undefined,
                timeSlotId: timeSlotId || undefined
            };
            const dup = teacherRow.placements.some(
                (p) => p.dow === placement.dow && p.period === placement.period
            );
            if (!dup) {
                teacherRow.placements.push(placement);
                applied += 1;
            }

            if (!cls.meetingDays) {
                cls.meetingDays = [];
            }
            if (!cls.meetingDays.includes(entry.dow)) {
                cls.meetingDays.push(entry.dow);
            }
            if (teacherUserId) {
                cls.assignedTeacherUserId = teacherUserId;
                cls.assignedTeacherName = teacherName;
            }
        });

        return { classes, applied, created };
    }

    const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const marker = src.split('?')[0];
            const existing = document.querySelector(`script[data-cc-src="${marker}"]`);
            if (existing && existing.dataset.ccLoaded === '1') {
                resolve();
                return;
            }
            if (existing) {
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error('Failed to load ' + src)), {
                    once: true
                });
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.defer = true;
            script.dataset.ccSrc = marker;
            script.onload = () => {
                script.dataset.ccLoaded = '1';
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load ' + src));
            document.head.appendChild(script);
        });
    }

    function ensureXlsx() {
        if (global.XLSX) {
            return Promise.resolve(global.XLSX);
        }
        return loadScript(SHEETJS_URL).then(() => {
            if (!global.XLSX) {
                throw new Error('SheetJS failed to load');
            }
            return global.XLSX;
        });
    }

    function parseXlsxArrayBuffer(buffer, options) {
        return ensureXlsx().then((XLSX) => {
            let wb;
            try {
                wb = XLSX.read(buffer, { type: 'array' });
            } catch (firstErr) {
                try {
                    const text = new TextDecoder('utf-8').decode(buffer);
                    if (/<table|<html/i.test(text)) {
                        wb = XLSX.read(text, { type: 'string' });
                    } else {
                        throw firstErr;
                    }
                } catch (secondErr) {
                    throw firstErr;
                }
            }
            const sheetName = wb.SheetNames[0];
            const sheet = wb.Sheets[sheetName];
            const aoa = aoaFromSheet(sheet, XLSX);
            return parseGridFromAoA(aoa, Object.assign({ sourceType: 'xlsx' }, options || {}));
        });
    }

    function preloadImportLibraries() {
        return ensureXlsx();
    }

    const api = {
        DOW_ALIASES,
        parseTimetableCellText,
        parseHomeroomLabels,
        parseTimeRangeFromLabel,
        matchTimeLabelToSlot,
        findHeaderRowIndex,
        parseGridFromAoA,
        aoaFromSheet,
        mapCategoryToSubjectTrack,
        matchTeacherAccount,
        findCohortForLabel,
        buildTimetableApplyPlan,
        applyTimetableImportPlan,
        parseXlsxArrayBuffer,
        ensureXlsx,
        preloadImportLibraries,
        cohortLabelKey,
        normalizeCohortLabel
    };

    global.CCPTimetableImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
