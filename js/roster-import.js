/**
 * SMS roster paste parser (window.CCPRosterImport).
 */
(function (global) {
    const COHORT_HEADER_RE = /^.+\s+[TM]$/;
    const STUDENT_NUM_RE = /^\d+\.\s+/;
    const SKIP_LINES = new Set(['Test Point', '촬영 알림', 'SMS', '전체선택']);
    const EN_LINE_RE = /^(?:수호[OX]\s*)?\(([^)]*)\)\s*$/;
    const SUHO_LINE_RE = /^수호[OX]$/;
    const SUHO_PREFIX_RE = /^수호([OX])\s*/;
    const ATTENDANCE_RE = /^출석\s/;
    const LEGEND_RE = /^:\s*관심/;
    const START_DATE_RE = /^\d{4}-\d{2}-\d{2}\s+부터\s+수업시작/;
    const ROSTER_TAIL_START_RES = [
        /^전숙제/,
        /^\[숙제확인\]/,
        /^시험종류/,
        /^숙제미확인/,
        /^미참석/,
        /^셀프체크/,
        /^학부모확인/,
        /^No Check$/i,
        /^Wr&Spk$/i,
        /^Covered in Class/,
        /^Homework \(if not finished/,
        /^Workbook[：:]/
    ];
    const SHOOTING_NAME_RE = /^촬영 알림(?:\t+|\s{2,})(.+)$/;
    const EN_WITH_SMS_RE = /^(?:수호[OX]\s*)?\(([^)]*)\)(?:\t+|\s+)*SMS\s*$/i;

    function normalizePasteText(text) {
        return String(text ?? '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .trim();
    }

    function slugifyCohort(name) {
        return String(name || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
    }

    function stableStudentId(cohortName, index) {
        const slug = slugifyCohort(cohortName);
        const nn = String(index + 1).padStart(2, '0');
        return `stu-${slug}-${nn}`;
    }

    function shouldSkipLine(line) {
        const t = line.trim();
        if (!t) {
            return true;
        }
        if (SKIP_LINES.has(t)) {
            return true;
        }
        if (/^\d+$/.test(t)) {
            return true;
        }
        if (ATTENDANCE_RE.test(t)) {
            return true;
        }
        if (LEGEND_RE.test(t)) {
            return true;
        }
        if (/^신규\s*:/.test(t) || /^종료예정/.test(t)) {
            return true;
        }
        return false;
    }

    function trimRosterPasteTail(text) {
        const lines = normalizePasteText(text).split('\n');
        const cutAt = lines.findIndex((raw) => {
            const t = raw.trim();
            if (!t) {
                return false;
            }
            return ROSTER_TAIL_START_RES.some((re) => re.test(t));
        });
        const kept = cutAt < 0 ? lines : lines.slice(0, cutAt);
        return kept.join('\n').trim();
    }

    function expandPasteLines(lines) {
        const out = [];
        (Array.isArray(lines) ? lines : []).forEach((raw) => {
            if (raw == null) {
                return;
            }
            const text = String(raw);
            if (!text.includes('\t')) {
                out.push(text);
                return;
            }
            text.split('\t').forEach((part) => {
                const t = part.trim();
                if (t) {
                    out.push(t);
                }
            });
        });
        return out;
    }

    function parseStudentBlock(lines, cohortName, sortOrder) {
        let locationTag = '';
        let name = '';
        let nameEn = '';
        const memoParts = [];

        for (const raw of lines) {
            const line = raw.trim();
            if (!line || shouldSkipLine(line)) {
                continue;
            }

            const numMatch = line.match(/^\d+\.\s+(.+)$/);
            if (numMatch) {
                locationTag = numMatch[1].trim();
                continue;
            }

            const shootingName = line.match(SHOOTING_NAME_RE);
            if (shootingName) {
                name = shootingName[1].trim();
                continue;
            }

            if (START_DATE_RE.test(line)) {
                memoParts.push(line);
                continue;
            }

            const enSmsMatch = line.match(EN_WITH_SMS_RE);
            if (enSmsMatch) {
                const suhoPrefix = line.match(SUHO_PREFIX_RE);
                if (suhoPrefix) {
                    memoParts.push(`수호${suhoPrefix[1]}`);
                }
                nameEn = enSmsMatch[1].trim();
                continue;
            }

            const enMatch = line.match(EN_LINE_RE);
            if (enMatch) {
                const suhoPrefix = line.match(SUHO_PREFIX_RE);
                if (suhoPrefix) {
                    memoParts.push(`수호${suhoPrefix[1]}`);
                }
                nameEn = enMatch[1].trim();
                continue;
            }

            if (SUHO_LINE_RE.test(line)) {
                memoParts.push(line);
                continue;
            }

            if (line.startsWith('수호') && line.includes('(')) {
                const suhoEn = line.match(/^(수호[OX])\s*\(([^)]*)\)\s*$/);
                if (suhoEn) {
                    memoParts.push(suhoEn[1]);
                    nameEn = suhoEn[2].trim();
                    continue;
                }
            }

            if (!name && !line.startsWith('(')) {
                name = line;
            }
        }

        if (!name) {
            return null;
        }

        return {
            id: stableStudentId(cohortName, sortOrder),
            name,
            nameEn,
            locationTag,
            sortOrder,
            active: true,
            tags: [],
            memo: memoParts.join('; ')
        };
    }

    function parseUnnumberedStudent(lines, cohortName, sortOrder) {
        const meaningful = lines.map((l) => l.trim()).filter((l) => l && !shouldSkipLine(l));
        if (meaningful.length < 2) {
            return null;
        }
        const name = meaningful[0];
        let nameEn = '';
        const second = meaningful[1];
        const paren = second.match(/^\(([^)]*)\)$/);
        if (paren) {
            nameEn = paren[1].trim();
        } else if (!second.startsWith('(') && /^[A-Za-z]/.test(second)) {
            nameEn = second;
        }
        return {
            id: stableStudentId(cohortName, sortOrder),
            name,
            nameEn,
            locationTag: '',
            sortOrder,
            active: true,
            tags: [],
            memo: ''
        };
    }

    function splitCohortSections(text) {
        const lines = normalizePasteText(text).split('\n');
        const sections = [];
        const preamble = [];
        let current = null;

        for (const raw of lines) {
            const line = raw.trim();
            if (COHORT_HEADER_RE.test(line)) {
                if (current) {
                    sections.push(current);
                }
                current = { cohortName: line, lines: [] };
                continue;
            }
            if (current) {
                current.lines.push(raw);
            } else {
                preamble.push(raw);
            }
        }
        if (current) {
            sections.push(current);
        }
        return { preamble, sections };
    }

    function preambleHasStudentRows(preamble) {
        return (Array.isArray(preamble) ? preamble : []).some((raw) => STUDENT_NUM_RE.test(String(raw).trim()));
    }

    function splitStudentBlocks(cohortLines) {
        const blocks = [];
        let current = null;

        for (const raw of cohortLines) {
            const line = raw.trim();
            if (STUDENT_NUM_RE.test(line)) {
                if (current) {
                    blocks.push(current);
                }
                current = [raw];
                continue;
            }
            if (current) {
                if (!line) {
                    if (current.length > 1) {
                        blocks.push(current);
                        current = null;
                    }
                    continue;
                }
                if (ATTENDANCE_RE.test(line) || LEGEND_RE.test(line)) {
                    blocks.push(current);
                    current = null;
                    continue;
                }
                current.push(raw);
            }
        }
        if (current) {
            blocks.push(current);
        }
        return blocks;
    }

    function parseCohortSection(section) {
        const cohortName = section.cohortName;
        const studentBlocks = splitStudentBlocks(expandPasteLines(section.lines));
        const students = [];

        studentBlocks.forEach((block, i) => {
            const student = parseStudentBlock(block, cohortName, i);
            if (student) {
                students.push(student);
            }
        });

        if (!students.length) {
            const tail = section.lines
                .map((l) => l.trim())
                .filter((l) => l && !shouldSkipLine(l) && !COHORT_HEADER_RE.test(l));
            const unnumbered = parseUnnumberedStudent(tail, cohortName, 0);
            if (unnumbered) {
                students.push(unnumbered);
            }
        }

        return { cohortName, students };
    }

    function parseRosterPaste(text) {
        const trimmed = trimRosterPasteTail(text);
        const { sections } = splitCohortSections(trimmed);
        const cohorts = sections
            .map(parseCohortSection)
            .filter((c) => c.students.length > 0);
        return { cohorts };
    }

    function parseRosterPasteSingle(text, options) {
        const opts = options || {};
        const trimmed = trimRosterPasteTail(text);
        if (!trimmed) {
            return { error: 'emptyPaste', cohort: null };
        }
        const { preamble, sections } = splitCohortSections(trimmed);
        const fallbackName = normalizeStr(opts.fallbackCohortName) || 'Import';
        const hasPreambleStudents = preambleHasStudentRows(preamble);
        let cohort = null;

        if (sections.length > 1) {
            return { error: 'multipleCohorts', cohort: null };
        }
        if (hasPreambleStudents) {
            cohort = parseCohortSection({ cohortName: fallbackName, lines: preamble });
        } else if (sections.length === 1) {
            cohort = parseCohortSection(sections[0]);
        } else {
            cohort = parseCohortSection({ cohortName: fallbackName, lines: trimmed.split('\n') });
        }
        if (!cohort || !cohort.students.length) {
            return { error: 'noStudents', cohort: null };
        }
        return { error: null, cohort };
    }

    const STUDENT_TAGS = ['interested', 'new', 'ending_soon', 'off_roster'];

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function normalizeStudent(raw) {
        if (global.CCPClassroomDomain && global.CCPClassroomDomain.normalizeStudent) {
            return global.CCPClassroomDomain.normalizeStudent(raw);
        }
        if (!raw || !raw.id) {
            return null;
        }
        const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag) => STUDENT_TAGS.includes(tag)) : [];
        return {
            id: normalizeStr(raw.id),
            name: normalizeStr(raw.name),
            nameEn: normalizeStr(raw.nameEn),
            locationTag: normalizeStr(raw.locationTag),
            sortOrder: Number.isFinite(raw.sortOrder) ? raw.sortOrder : 0,
            active: raw.active !== false,
            tags,
            memo: normalizeStr(raw.memo)
        };
    }

    function normalizeCohortLabel(s) {
        return normalizeStr(s)
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[^a-z0-9\uac00-\ud7a3]/g, '');
    }

    function importCohortKey(cohort) {
        const name = cohort && cohort.cohortName != null ? cohort.cohortName : '';
        const id = cohort && cohort.cohortId != null ? cohort.cohortId : '';
        return id ? `id:${id}` : `name:${name}`;
    }

    function parseRosterPack(json) {
        if (!json || typeof json !== 'object') {
            return { error: 'Invalid roster file: not an object', pack: null };
        }
        if (Number(json.version) !== 1) {
            return { error: 'Unsupported roster version (expected 1)', pack: null };
        }
        if (!Array.isArray(json.cohorts)) {
            return { error: 'Invalid roster file: missing cohorts array', pack: null };
        }
        const cohorts = [];
        for (const raw of json.cohorts) {
            if (!raw || typeof raw !== 'object') {
                continue;
            }
            const cohortName = normalizeStr(raw.cohortName);
            if (!cohortName) {
                continue;
            }
            const students = (Array.isArray(raw.students) ? raw.students : [])
                .map(normalizeStudent)
                .filter(Boolean);
            cohorts.push({
                cohortId: normalizeStr(raw.cohortId) || null,
                cohortName,
                students
            });
        }
        if (!cohorts.length) {
            return { error: 'No cohorts with students found in file', pack: null };
        }
        return {
            error: null,
            pack: {
                version: 1,
                source: normalizeStr(json.source) || '',
                exportedAt: normalizeStr(json.exportedAt) || '',
                calendarName: normalizeStr(json.calendarName) || '',
                cohorts
            }
        };
    }

    function buildRosterPack(cohorts, meta) {
        const opts = meta || {};
        const list = Array.isArray(cohorts) ? cohorts : [];
        const exportCohorts = list
            .map((cohort) => {
                if (!cohort) {
                    return null;
                }
                const students = (Array.isArray(cohort.students) ? cohort.students : [])
                    .map(normalizeStudent)
                    .filter(Boolean);
                if (!students.length && opts.includeEmpty !== true) {
                    return null;
                }
                return {
                    cohortId: cohort.id || '',
                    cohortName: normalizeStr(cohort.name) || cohort.id || '',
                    students
                };
            })
            .filter(Boolean);
        return {
            version: 1,
            source: normalizeStr(opts.source) || 'Class Calendar export',
            exportedAt: opts.exportedAt || new Date().toISOString(),
            calendarName: normalizeStr(opts.calendarName) || '',
            cohorts: exportCohorts
        };
    }

    function findCalendarCohortById(calendarCohorts, id) {
        const cid = normalizeStr(id);
        if (!cid) {
            return null;
        }
        return (calendarCohorts || []).find((c) => c && c.id === cid) || null;
    }

    function matchImportCohorts(importCohorts, calendarCohorts) {
        const calendar = Array.isArray(calendarCohorts) ? calendarCohorts.filter(Boolean) : [];
        const calById = new Map(calendar.map((c) => [c.id, c]));
        const calByNorm = new Map();
        calendar.forEach((c) => {
            const norm = normalizeCohortLabel(c.name || c.id);
            if (!norm) {
                return;
            }
            if (!calByNorm.has(norm)) {
                calByNorm.set(norm, []);
            }
            calByNorm.get(norm).push(c);
        });

        return (Array.isArray(importCohorts) ? importCohorts : []).map((imp) => {
            const importKey = importCohortKey(imp);
            const importCohortName = imp.cohortName || '';
            const importCohortId = imp.cohortId || null;
            const studentCount = Array.isArray(imp.students) ? imp.students.length : 0;
            let matchStatus = 'unmatched';
            let suggestedTargetId = '';
            let candidateTargetIds = [];

            if (importCohortId && calById.has(importCohortId)) {
                matchStatus = 'byId';
                suggestedTargetId = importCohortId;
                candidateTargetIds = [importCohortId];
            } else {
                const exact = calendar.filter((c) => normalizeStr(c.name) === importCohortName);
                if (exact.length === 1) {
                    matchStatus = 'exact';
                    suggestedTargetId = exact[0].id;
                    candidateTargetIds = [exact[0].id];
                } else if (exact.length > 1) {
                    matchStatus = 'ambiguous';
                    candidateTargetIds = exact.map((c) => c.id);
                } else {
                    const norm = normalizeCohortLabel(importCohortName);
                    const normMatches = norm ? calByNorm.get(norm) || [] : [];
                    if (normMatches.length === 1) {
                        matchStatus = 'normalized';
                        suggestedTargetId = normMatches[0].id;
                        candidateTargetIds = [normMatches[0].id];
                    } else if (normMatches.length > 1) {
                        matchStatus = 'ambiguous';
                        candidateTargetIds = normMatches.map((c) => c.id);
                    }
                }
            }

            const autoMap = matchStatus === 'byId' || matchStatus === 'exact' || matchStatus === 'normalized';
            return {
                importKey,
                importCohortName,
                importCohortId,
                studentCount,
                students: Array.isArray(imp.students) ? imp.students.slice() : [],
                matchStatus,
                suggestedTargetId,
                candidateTargetIds,
                userAction: autoMap ? 'map' : 'choose',
                userTargetId: autoMap ? suggestedTargetId : '',
                mergeMode: 'merge'
            };
        });
    }

    function validateImportPlan(plan) {
        const rows = Array.isArray(plan) ? plan : [];
        const mappedTargets = new Map();
        for (const row of rows) {
            if (row.userAction === 'skip' || row.userAction === 'choose') {
                if (row.userAction === 'choose') {
                    return { ok: false, error: 'cohortMappingRequired' };
                }
                continue;
            }
            if (row.userAction === 'map') {
                const tid = normalizeStr(row.userTargetId);
                if (!tid) {
                    return { ok: false, error: 'cohortMappingRequired' };
                }
                if (mappedTargets.has(tid)) {
                    return { ok: false, error: 'duplicateTargetCohort' };
                }
                mappedTargets.set(tid, row.importCohortName);
            }
        }
        return { ok: true, error: null };
    }

    function computeRowPreview(row, targetCohort) {
        if (row.mergeByName) {
            return computeRowPreviewByIdentity(row, targetCohort);
        }
        const imported = (Array.isArray(row.students) ? row.students : [])
            .map(normalizeStudent)
            .filter(Boolean);
        const existing = targetCohort
            ? (Array.isArray(targetCohort.students) ? targetCohort.students : [])
                  .map(normalizeStudent)
                  .filter(Boolean)
            : [];
        const existingById = new Map(existing.map((s) => [s.id, s]));
        const importIds = new Set(imported.map((s) => s.id));
        let added = 0;
        let updated = 0;
        imported.forEach((s) => {
            if (existingById.has(s.id)) {
                updated += 1;
            } else {
                added += 1;
            }
        });
        const kept = row.mergeMode === 'merge' ? existing.filter((s) => !importIds.has(s.id)).length : 0;
        const removed = row.mergeMode === 'replace' ? existing.filter((s) => !importIds.has(s.id)).length : 0;
        return { added, updated, kept, removed, total: imported.length };
    }

    function studentIdentityKey(s) {
        if (global.CCPClassroomDomain && typeof global.CCPClassroomDomain.koreanMarkAgnosticKey === 'function') {
            return global.CCPClassroomDomain.koreanMarkAgnosticKey(s && s.name) || '';
        }
        if (global.CCPClassroomDomain && typeof global.CCPClassroomDomain.koreanNameKey === 'function') {
            return String(global.CCPClassroomDomain.koreanNameKey(s && s.name) || '').replace(
                /[◆◇♦♢⬥⬦◈＊★☆✦✧●○■□▲△▼▽※]/g,
                ''
            );
        }
        const n = normalizeCohortLabel(s && s.name);
        return n || '';
    }

    function computeRowPreviewByIdentity(row, targetCohort) {
        const imported = (Array.isArray(row.students) ? row.students : [])
            .map(normalizeStudent)
            .filter(Boolean);
        const existing = targetCohort
            ? (Array.isArray(targetCohort.students) ? targetCohort.students : [])
                  .map(normalizeStudent)
                  .filter(Boolean)
            : [];
        const existingByKey = new Map();
        existing.forEach((s) => {
            const k = studentIdentityKey(s);
            if (k && !existingByKey.has(k)) {
                existingByKey.set(k, s);
            }
        });
        const importKeys = new Set(
            imported.map((s) => studentIdentityKey(s)).filter(Boolean)
        );
        let added = 0;
        let updated = 0;
        imported.forEach((s) => {
            if (existingByKey.has(studentIdentityKey(s))) {
                updated += 1;
            } else {
                added += 1;
            }
        });
        const kept =
            row.mergeMode === 'merge'
                ? existing.filter((s) => !importKeys.has(studentIdentityKey(s))).length
                : 0;
        const removed =
            row.mergeMode === 'replace'
                ? existing.filter((s) => !importKeys.has(studentIdentityKey(s))).length
                : 0;
        return { added, updated, kept, removed, total: imported.length };
    }

    function assignImportIdsByIdentity(existing, imported, newStudentId) {
        const existingByKey = new Map();
        (Array.isArray(existing) ? existing : []).forEach((s) => {
            const k = studentIdentityKey(s);
            if (k && !existingByKey.has(k)) {
                existingByKey.set(k, s);
            }
        });
        const makeId =
            typeof newStudentId === 'function'
                ? newStudentId
                : () => `stu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        return (Array.isArray(imported) ? imported : []).map((imp) => {
            const k = studentIdentityKey(imp);
            const match = k ? existingByKey.get(k) : null;
            if (match) {
                return Object.assign({}, imp, { id: match.id });
            }
            const id = normalizeStr(imp.id) || makeId();
            return Object.assign({}, imp, { id });
        });
    }

    function mergeStudentListsByIdentity(existing, imported, mode, newStudentId) {
        const assigned = assignImportIdsByIdentity(existing, imported, newStudentId)
            .map(normalizeStudent)
            .filter(Boolean);
        return mergeStudentLists(existing, assigned, mode);
    }

    function computeImportPreview(plan, calendarCohorts) {
        const calendar = Array.isArray(calendarCohorts) ? calendarCohorts : [];
        return (Array.isArray(plan) ? plan : []).map((row) => {
            if (row.userAction === 'skip') {
                return Object.assign({}, row, { preview: { added: 0, updated: 0, kept: 0, removed: 0, total: 0 } });
            }
            if (row.userAction === 'create') {
                const n = Array.isArray(row.students) ? row.students.length : 0;
                return Object.assign({}, row, {
                    preview: { added: n, updated: 0, kept: 0, removed: 0, total: n }
                });
            }
            const target =
                row.userAction === 'map'
                    ? findCalendarCohortById(calendar, row.userTargetId)
                    : null;
            return Object.assign({}, row, {
                preview: computeRowPreview(row, target)
            });
        });
    }

    function mergeStudentLists(existing, imported, mode) {
        const normExisting = (Array.isArray(existing) ? existing : []).map(normalizeStudent).filter(Boolean);
        const normImported = (Array.isArray(imported) ? imported : []).map(normalizeStudent).filter(Boolean);
        if (mode === 'replace') {
            return normImported.slice();
        }
        const byId = new Map(normExisting.map((s) => [s.id, s]));
        normImported.forEach((s) => {
            byId.set(s.id, s);
        });
        return Array.from(byId.values()).sort((a, b) => {
            if (global.CCPClassroomDomain && global.CCPClassroomDomain.compareStudentNames) {
                return global.CCPClassroomDomain.compareStudentNames(a, b);
            }
            return String(a.name || '').localeCompare(String(b.name || ''), 'ko', { sensitivity: 'base' });
        });
    }

    function applyRosterImport(calendarCohorts, plan, options) {
        const opts = options || {};
        const newId =
            typeof opts.newId === 'function'
                ? opts.newId
                : () => `cohort_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        const homeroomUserId = normalizeStr(opts.homeroomTeacherUserId);
        const newStudentId =
            typeof opts.newStudentId === 'function'
                ? opts.newStudentId
                : () => `stu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        const validation = validateImportPlan(plan);
        if (!validation.ok) {
            return { error: validation.error, cohorts: null };
        }

        let cohorts = (Array.isArray(calendarCohorts) ? calendarCohorts : []).map((c) =>
            Object.assign({}, c, {
                students: Array.isArray(c.students) ? c.students.map((s) => Object.assign({}, s)) : []
            })
        );

        (Array.isArray(plan) ? plan : []).forEach((row) => {
            if (row.userAction === 'skip') {
                return;
            }
            const mergeMode = row.mergeMode === 'merge' ? 'merge' : 'replace';

            if (row.userAction === 'create') {
                const id = newId('cohort');
                const shell = {
                    id,
                    name: row.importCohortName,
                    classIds: [],
                    students: mergeStudentLists([], row.students, 'replace')
                };
                if (homeroomUserId) {
                    shell.homeroomTeacherUserId = homeroomUserId;
                }
                cohorts.push(shell);
                return;
            }

            if (row.userAction !== 'map') {
                return;
            }
            const targetId = normalizeStr(row.userTargetId);
            const idx = cohorts.findIndex((c) => c && c.id === targetId);
            if (idx < 0) {
                return;
            }
            const target = cohorts[idx];
            const merged = row.mergeByName
                ? mergeStudentListsByIdentity(target.students, row.students, mergeMode, newStudentId)
                : mergeStudentLists(target.students, row.students, mergeMode);
            cohorts[idx] = Object.assign({}, target, { students: merged });
        });

        return { error: null, cohorts };
    }

    global.CCPRosterImport = {
        parseRosterPaste,
        parseRosterPasteSingle,
        trimRosterPasteTail,
        expandPasteLines,
        slugifyCohort,
        stableStudentId,
        normalizeCohortLabel,
        normalizeStudent,
        parseRosterPack,
        buildRosterPack,
        matchImportCohorts,
        validateImportPlan,
        computeImportPreview,
        applyRosterImport,
        importCohortKey,
        studentIdentityKey,
        mergeStudentListsByIdentity,
        parseImportFile(json) {
            const roster = parseRosterPack(json);
            if (!roster.error) {
                return roster;
            }
            if (global.CCPEssayTrackerImport && global.CCPEssayTrackerImport.isEssayTrackerPack(json)) {
                return global.CCPEssayTrackerImport.parseEssayTrackerPack(json);
            }
            return roster;
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
