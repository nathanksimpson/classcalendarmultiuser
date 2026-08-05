/**
 * Classroom domain helpers — students, attendance, homework (pure, no DOM).
 */
(function (global) {
    const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'early_leave'];
    const HOMEWORK_GRADES = ['A', 'B', 'C', 'N', 'F', 'X'];
    const HOMEWORK_SELF_CHECKS = ['none', 'not_checked', 'satisfied'];
    const ESSAY_STATUSES = [
        'not_submitted',
        'submitted',
        'complete',
        'resubmit_required',
        'incomplete',
        'exempt'
    ];
    const STUDENT_TAGS = ['interested', 'new', 'ending_soon', 'starting_soon', 'off_roster'];
    const OFF_ROSTER_TAG = 'off_roster';
    const ARCHIVE_REASONS = ['break', 'new', 'left', 'starting_soon'];
    const ARCHIVE_COHORT_ID = 'cohort-student-archive';
    const DEFAULT_ARCHIVE_RETENTION_DAYS = 90;

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function compareDateStr(a, b) {
        return normalizeStr(a).localeCompare(normalizeStr(b));
    }

    /** Korean-name (가나다) order; English name then id as stable tie-breaks. */
    function compareStudentNames(a, b) {
        const byKo = normalizeStr(a && a.name).localeCompare(normalizeStr(b && b.name), 'ko', {
            sensitivity: 'base'
        });
        if (byKo !== 0) {
            return byKo;
        }
        const byEn = normalizeStr(a && a.nameEn).localeCompare(normalizeStr(b && b.nameEn), 'en', {
            sensitivity: 'base'
        });
        if (byEn !== 0) {
            return byEn;
        }
        return normalizeStr(a && a.id).localeCompare(normalizeStr(b && b.id));
    }

    function parseISODateLocal(dateStr) {
        if (global.CCPUtils && global.CCPUtils.parseISODateLocal) {
            return global.CCPUtils.parseISODateLocal(dateStr);
        }
        if (!dateStr || typeof dateStr !== 'string') {
            return new Date(NaN);
        }
        const parts = dateStr.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function formatISODate(d) {
        if (global.CCPUtils && global.CCPUtils.formatISODate) {
            return global.CCPUtils.formatISODate(d);
        }
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function todayISO() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return formatISODate(d);
    }

    function addDaysISO(dateStr, days) {
        const d = parseISODateLocal(dateStr);
        if (Number.isNaN(d.getTime())) {
            return dateStr;
        }
        d.setDate(d.getDate() + days);
        return formatISODate(d);
    }

    function getCohortIdsForClass(classData) {
        if (!classData) {
            return [];
        }
        const ids = [];
        if (Array.isArray(classData.cohortIds)) {
            classData.cohortIds.forEach((id) => {
                const s = normalizeStr(id);
                if (s && !ids.includes(s)) {
                    ids.push(s);
                }
            });
        }
        const legacy = normalizeStr(classData.cohortId);
        if (legacy && !ids.includes(legacy)) {
            ids.push(legacy);
        }
        return ids;
    }

    function normalizeStudent(raw) {
        if (!raw || !raw.id) {
            return null;
        }
        const tags = Array.isArray(raw.tags)
            ? raw.tags.filter((t) => STUDENT_TAGS.includes(t))
            : [];
        let archiveReason = normalizeStr(raw.archiveReason);
        if (archiveReason && !ARCHIVE_REASONS.includes(archiveReason)) {
            archiveReason = '';
        }
        return {
            id: normalizeStr(raw.id),
            name: normalizeStr(raw.name),
            nameEn: normalizeStr(raw.nameEn),
            locationTag: normalizeStr(raw.locationTag),
            sortOrder: Number.isFinite(raw.sortOrder) ? raw.sortOrder : 0,
            active: raw.active !== false,
            tags,
            memo: normalizeStr(raw.memo),
            archivedAt: normalizeStr(raw.archivedAt),
            archiveReason,
            expectedStartDate: normalizeStr(raw.expectedStartDate)
        };
    }

    /**
     * Display-oriented cleanup (NFC, spaces, separators, fullwidth ASCII).
     * Keeps status symbols and Latin letters on the stored/display name.
     */
    function koreanNameDisplayKey(name) {
        let s = String(name == null ? '' : name).normalize('NFC').trim();
        // Whitespace incl. NBSP, ideographic space, thin spaces
        s = s.replace(/[\s\u00A0\u2000-\u200B\u202F\u205F\u3000]+/g, '');
        // Zero-width / BOM (ZWJ/ZWNJ may remain after the range above)
        s = s.replace(/[\u200C\u200D\uFEFF\u2060]/g, '');
        // Separators often pasted from TMS / SMS (not identity marks like ◆)
        s = s.replace(/[·•ㆍ\-–—_./]/g, '');
        // Fullwidth ASCII → halfwidth (Hangul syllables / geometric marks unchanged)
        s = s.replace(/[\uFF01-\uFF5E]/g, (ch) =>
            String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
        );
        return s;
    }

    /** Status marks pasted from TMS (transfer / new / etc.) — not identity. */
    const NAME_STATUS_SYMBOL_RE = /[◆◇♦♢⬥⬦◈＊★☆✦✧●○■□▲△▼▽※]/g;

    /**
     * Identity match key for TMS sync. Ignores English and status symbols.
     * Keeps Latin/digit suffixes so 김민수A ≠ 김민수.
     */
    function koreanMatchKey(name) {
        let s = koreanNameDisplayKey(name);
        s = s.replace(NAME_STATUS_SYMBOL_RE, '');
        s = s.replace(/[0-9]/g, '');
        return s;
    }

    /**
     * @deprecated Prefer koreanMatchKey for identity matching.
     * Alias of koreanMatchKey (symbols ignored for match).
     */
    function koreanNameKey(name) {
        return koreanMatchKey(name);
    }

    /** Trailing Latin letter used to disambiguate same Hangul names (e.g. A on 김민수A). */
    function nameLatinDisambiguatorSuffix(name) {
        const key = koreanMatchKey(name);
        const m = key.match(/[\uac00-\ud7a3]+([A-Za-z])$/);
        return m ? m[1] : '';
    }

    /** Trailing mark after Hangul: status symbol or Latin/digit (legacy helper). */
    function nameDisambiguatorSuffix(name) {
        const display = koreanNameDisplayKey(name);
        const sym = display.match(/[\uac00-\ud7a3]+([◆◇♦♢⬥⬦◈＊★☆✦✧●○■□▲△▼▽※])$/);
        if (sym) {
            return sym[1];
        }
        const latin = nameLatinDisambiguatorSuffix(name);
        if (latin) {
            return latin;
        }
        const digit = koreanNameDisplayKey(name).match(/[\uac00-\ud7a3]+([0-9])$/);
        return digit ? digit[1] : '';
    }

    function nameStatusSymbolSuffix(name) {
        const display = koreanNameDisplayKey(name);
        const m = display.match(/[\uac00-\ud7a3]+([◆◇♦♢⬥⬦◈＊★☆✦✧●○■□▲△▼▽※])$/);
        return m ? m[1] : '';
    }

    function hangulCoreKey(name) {
        return hangulSyllables(name).join('');
    }

    function hasNameDisambiguator(name) {
        return Boolean(nameDisambiguatorSuffix(name));
    }

    function hasLatinNameDisambiguator(name) {
        return Boolean(nameLatinDisambiguatorSuffix(name));
    }

    function withStudentTag(student, tag) {
        const s = normalizeStudent(student);
        if (!s || !STUDENT_TAGS.includes(tag)) {
            return s;
        }
        const tags = Array.isArray(s.tags) ? s.tags.slice() : [];
        if (!tags.includes(tag)) {
            tags.push(tag);
        }
        return Object.assign({}, s, { tags });
    }

    function withoutStudentTag(student, tag) {
        const s = normalizeStudent(student);
        if (!s) {
            return s;
        }
        const tags = (Array.isArray(s.tags) ? s.tags : []).filter((t) => t !== tag);
        return Object.assign({}, s, { tags });
    }

    /** Hangul syllabic blocks (음절) from a Korean name after display cleanup. */
    function hangulSyllables(name) {
        const key = koreanNameDisplayKey(name);
        const out = [];
        for (let i = 0; i < key.length; i += 1) {
            const ch = key[i];
            const code = ch.charCodeAt(0);
            if (code >= 0xac00 && code <= 0xd7a3) {
                out.push(ch);
            }
        }
        return out;
    }

    /**
     * True when two Hangul names are equal by match key, or one is a contiguous Hangul variant
     * of the other (e.g. 김민수 ↔ 김민수아). Status symbols are ignored (권이안 ≡ 권이안◆).
     * Latin suffixes still block fuzzy (김민수A is not auto-fuzzy with 김민수).
     */
    function hangulNameVariantPair(nameA, nameB) {
        const keyA = koreanMatchKey(nameA);
        const keyB = koreanMatchKey(nameB);
        if (!keyA || !keyB) {
            return false;
        }
        if (keyA === keyB) {
            return true;
        }
        if (hasLatinNameDisambiguator(nameA) || hasLatinNameDisambiguator(nameB)) {
            return false;
        }
        const a = hangulSyllables(nameA).join('');
        const b = hangulSyllables(nameB).join('');
        if (!a || !b || a.length < 3 || b.length < 3) {
            return false;
        }
        if (a === b) {
            // Same Hangul core but different match keys (extra Latin etc.) → unclear, not fuzzy.
            return false;
        }
        return (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b));
    }

    /** @deprecated Prefer hangulNameVariantPair — kept for tests/back-compat. */
    function shareThreeHangulSyllables(nameA, nameB) {
        return hangulNameVariantPair(nameA, nameB);
    }

    /**
     * Unique 1:1 fuzzy pairs among leftover CM students and leftover TMS rows.
     * Drops any name that has 2+ syllable candidates on the other side.
     * leftoverCm: [{ id, name, ... }], leftoverTms: [{ name, nameEn?, ... }]
     */
    function pairFuzzyRosterMatches(leftoverCm, leftoverTms) {
        const cmList = Array.isArray(leftoverCm) ? leftoverCm : [];
        const tmsList = Array.isArray(leftoverTms) ? leftoverTms : [];
        if (!cmList.length || !tmsList.length) {
            return [];
        }
        const cmToTms = new Map();
        const tmsToCm = new Map();
        cmList.forEach((cm, cmIdx) => {
            tmsList.forEach((tms, tmsIdx) => {
                if (!hangulNameVariantPair(cm && cm.name, tms && tms.name)) {
                    return;
                }
                if (!cmToTms.has(cmIdx)) {
                    cmToTms.set(cmIdx, []);
                }
                cmToTms.get(cmIdx).push(tmsIdx);
                if (!tmsToCm.has(tmsIdx)) {
                    tmsToCm.set(tmsIdx, []);
                }
                tmsToCm.get(tmsIdx).push(cmIdx);
            });
        });
        const pairs = [];
        cmToTms.forEach((tmsIdxs, cmIdx) => {
            if (tmsIdxs.length !== 1) {
                return;
            }
            const tmsIdx = tmsIdxs[0];
            const cmIdxs = tmsToCm.get(tmsIdx) || [];
            if (cmIdxs.length !== 1) {
                return;
            }
            pairs.push({
                cm: cmList[cmIdx],
                tms: tmsList[tmsIdx],
                cmIndex: cmIdx,
                tmsIndex: tmsIdx
            });
        });
        return pairs;
    }

    function sharesHangulCoreOrVariant(nameA, nameB) {
        const coreA = hangulCoreKey(nameA);
        const coreB = hangulCoreKey(nameB);
        if (!coreA || !coreB) {
            return false;
        }
        if (coreA === coreB) {
            return true;
        }
        return hangulNameVariantPair(nameA, nameB);
    }

    function cohortStudentsForMapCandidates(existingStudents) {
        return (Array.isArray(existingStudents) ? existingStudents : [])
            .map(normalizeStudent)
            .filter((s) => s && s.active !== false);
    }

    function buildFullCohortMapCandidates(existing, preferIds) {
        const prefer = new Set(
            (Array.isArray(preferIds) ? preferIds : []).map((id) => normalizeStr(id)).filter(Boolean)
        );
        const list = cohortStudentsForMapCandidates(existing);
        const primary = [];
        const rest = [];
        list.forEach((s) => {
            const row = { id: s.id, name: s.name, nameEn: s.nameEn || '' };
            if (prefer.has(s.id)) {
                primary.push(row);
            } else {
                rest.push(row);
            }
        });
        return primary.concat(rest);
    }

    /**
     * TMS names that need user review (map / add / skip):
     * - not an exact match-key hit but share Hangul with CM students
     * - duplicate exact keys in the cohort
     * - unmatched (no Hangul peer) — Map to any active cohort student, Add, or Skip
     * Candidates: Hangul peers first (when any), then the rest of the active/off_roster cohort.
     */
    function listUnclearTmsStudentMatches(existingStudents, tmsStudents) {
        const existing = cohortStudentsForMapCandidates(existingStudents);
        const incoming = (Array.isArray(tmsStudents) ? tmsStudents : [])
            .map((raw) => {
                if (!raw) {
                    return null;
                }
                const name = normalizeStr(raw.name);
                if (!name) {
                    return null;
                }
                return {
                    name,
                    nameEn: normalizeStr(raw.nameEn)
                };
            })
            .filter(Boolean);

        const existingByKey = new Map();
        const duplicateKeys = new Set();
        existing.forEach((s) => {
            const k = koreanMatchKey(s.name);
            if (!k) {
                return;
            }
            if (existingByKey.has(k)) {
                duplicateKeys.add(k);
            } else {
                existingByKey.set(k, s);
            }
        });

        const seenTmsKeys = new Set();
        const unclear = [];
        incoming.forEach((imp) => {
            const k = koreanMatchKey(imp.name);
            if (!k || seenTmsKeys.has(k)) {
                return;
            }
            seenTmsKeys.add(k);
            const exact = existingByKey.get(k);
            if (exact) {
                if (duplicateKeys.has(k)) {
                    const peerIds = existing
                        .filter((s) => koreanMatchKey(s.name) === k)
                        .map((s) => s.id);
                    unclear.push({
                        tmsName: imp.name,
                        tmsNameEn: imp.nameEn,
                        tmsKey: k,
                        reason: 'duplicate_existing',
                        candidates: buildFullCohortMapCandidates(existing, peerIds)
                    });
                }
                return;
            }
            const peers = existing.filter((s) => sharesHangulCoreOrVariant(s.name, imp.name));
            if (!peers.length) {
                // No Hangul peer — still review so user can Map onto any cohort student.
                unclear.push({
                    tmsName: imp.name,
                    tmsNameEn: imp.nameEn,
                    tmsKey: k,
                    reason: 'unmatched',
                    candidates: buildFullCohortMapCandidates(existing, [])
                });
                return;
            }
            const reason =
                peers.some((c) => hangulCoreKey(c.name) === hangulCoreKey(imp.name))
                    ? 'shared_hangul_core'
                    : 'fuzzy_variant';
            unclear.push({
                tmsName: imp.name,
                tmsNameEn: imp.nameEn,
                tmsKey: k,
                reason,
                candidates: buildFullCohortMapCandidates(
                    existing,
                    peers.map((s) => s.id)
                )
            });
        });
        return unclear;
    }

    /**
     * Normalize cohort.tmsStudentResolutions map (remembered Sync wizard choices).
     */
    function normalizeTmsStudentResolutions(raw) {
        const out = {};
        if (!raw || typeof raw !== 'object') {
            return out;
        }
        Object.keys(raw).forEach((key) => {
            const k = koreanMatchKey(key) || normalizeStr(key);
            if (!k) {
                return;
            }
            const r = raw[key];
            if (!r || typeof r !== 'object') {
                return;
            }
            if (r.action === 'skip') {
                out[k] = { action: 'skip' };
                return;
            }
            if (r.action === 'add') {
                out[k] = { action: 'add' };
                return;
            }
            if (r.action === 'map' && normalizeStr(r.studentId)) {
                out[k] = { action: 'map', studentId: normalizeStr(r.studentId) };
            }
        });
        return out;
    }

    function mergeTmsStudentResolutions(base, extra) {
        return Object.assign(
            {},
            normalizeTmsStudentResolutions(base),
            normalizeTmsStudentResolutions(extra)
        );
    }

    /**
     * Remembered reverse-match choices: CM student missing from TMS → pick TMS name or keep Off roster.
     * { [studentId]: { action:'skip' } | { action:'map', tmsKey } }
     * Map always writes TMS identity onto CCMU (never the reverse — we cannot update TMS).
     */
    function normalizeTmsReverseResolutions(raw) {
        const out = {};
        if (!raw || typeof raw !== 'object') {
            return out;
        }
        Object.keys(raw).forEach((studentId) => {
            const sid = normalizeStr(studentId);
            if (!sid) {
                return;
            }
            const r = raw[studentId];
            if (!r || typeof r !== 'object') {
                return;
            }
            if (r.action === 'skip') {
                out[sid] = { action: 'skip' };
                return;
            }
            if (r.action === 'map') {
                const tmsKey = koreanMatchKey(r.tmsKey) || normalizeStr(r.tmsKey);
                if (tmsKey) {
                    out[sid] = { action: 'map', tmsKey };
                }
            }
        });
        return out;
    }

    function mergeTmsReverseResolutions(base, extra) {
        return Object.assign(
            {},
            normalizeTmsReverseResolutions(base),
            normalizeTmsReverseResolutions(extra)
        );
    }

    /**
     * CM students who are (or will be) missing from TMS — offer reverse Map to an unmatched TMS name.
     * Choosing Map stores studentResolutions[tmsKey]={map,studentId} so merge writes TMS name/nameEn onto CCMU.
     */
    function listReverseTmsStudentMatches(existingStudents, tmsStudents, options) {
        const opts = options || {};
        const forwardRes = normalizeTmsStudentResolutions(
            opts.studentResolutions && typeof opts.studentResolutions === 'object'
                ? opts.studentResolutions
                : {}
        );
        const reverseRes = normalizeTmsReverseResolutions(
            opts.reverseResolutions && typeof opts.reverseResolutions === 'object'
                ? opts.reverseResolutions
                : {}
        );
        const existing = cohortStudentsForMapCandidates(existingStudents);
        const incoming = (Array.isArray(tmsStudents) ? tmsStudents : [])
            .map((raw) => {
                if (!raw) {
                    return null;
                }
                const name = normalizeStr(raw.name);
                if (!name) {
                    return null;
                }
                return { name, nameEn: normalizeStr(raw.nameEn) };
            })
            .filter(Boolean);
        if (!incoming.length || !existing.length) {
            return [];
        }

        const existingByKey = new Map();
        const duplicateKeys = new Set();
        existing.forEach((s) => {
            const k = koreanMatchKey(s.name);
            if (!k) {
                return;
            }
            if (existingByKey.has(k)) {
                duplicateKeys.add(k);
            } else {
                existingByKey.set(k, s);
            }
        });

        const exactMatchedStudentIds = new Set();
        const claimedTmsKeys = new Set();
        const seenTms = new Set();
        incoming.forEach((imp) => {
            const k = koreanMatchKey(imp.name);
            if (!k || seenTms.has(k)) {
                return;
            }
            seenTms.add(k);
            const exact = existingByKey.get(k);
            if (exact && !duplicateKeys.has(k)) {
                exactMatchedStudentIds.add(exact.id);
                claimedTmsKeys.add(k);
            }
        });

        const mappedStudentIds = new Set();
        Object.keys(forwardRes).forEach((k) => {
            const r = forwardRes[k];
            if (!r) {
                return;
            }
            if (r.action === 'map' && r.studentId) {
                mappedStudentIds.add(r.studentId);
                claimedTmsKeys.add(k);
            } else if (r.action === 'skip' || r.action === 'add') {
                claimedTmsKeys.add(k);
            }
        });

        const tmsCandidates = [];
        const seenCand = new Set();
        incoming.forEach((imp) => {
            const k = koreanMatchKey(imp.name);
            if (!k || seenCand.has(k) || claimedTmsKeys.has(k)) {
                return;
            }
            seenCand.add(k);
            tmsCandidates.push({ tmsKey: k, name: imp.name, nameEn: imp.nameEn || '' });
        });
        if (!tmsCandidates.length) {
            return [];
        }

        const missing = existing
            .filter((s) => {
                if (exactMatchedStudentIds.has(s.id) || mappedStudentIds.has(s.id)) {
                    return false;
                }
                const rev = reverseRes[s.id];
                if (rev && rev.action === 'skip') {
                    return false;
                }
                if (rev && rev.action === 'map' && rev.tmsKey && claimedTmsKeys.has(rev.tmsKey)) {
                    return false;
                }
                return true;
            })
            .sort((a, b) => {
                const aOff = (a.tags || []).includes(OFF_ROSTER_TAG) ? 0 : 1;
                const bOff = (b.tags || []).includes(OFF_ROSTER_TAG) ? 0 : 1;
                if (aOff !== bOff) {
                    return aOff - bOff;
                }
                return compareStudentNames(a, b);
            });

        return missing.map((s) => ({
            direction: 'reverse',
            reason: 'missing_from_tms',
            studentId: s.id,
            studentName: s.name,
            studentNameEn: s.nameEn || '',
            cmKey: koreanMatchKey(s.name),
            reviewKey: `cm:${s.id}`,
            alreadyOffRoster: (s.tags || []).includes(OFF_ROSTER_TAG),
            candidates: tmsCandidates.map((c) => Object.assign({}, c))
        }));
    }

    /**
     * Apply remembered reverse resolutions. Mutates row.reverseResolutions and row.studentResolutions.
     * Map copies TMS → CCMU via the same studentResolutions path as forward Map.
     */
    function applyRememberedTmsReverseResolutions(cohort, reverseItems, row) {
        const mem = normalizeTmsReverseResolutions(cohort && cohort.tmsReverseResolutions);
        if (!row.reverseResolutions || typeof row.reverseResolutions !== 'object') {
            row.reverseResolutions = {};
        }
        if (!row.studentResolutions || typeof row.studentResolutions !== 'object') {
            row.studentResolutions = {};
        }
        const still = [];
        (Array.isArray(reverseItems) ? reverseItems : []).forEach((item) => {
            if (!item || !item.studentId) {
                return;
            }
            const sid = item.studentId;
            const remembered = mem[sid];
            if (!remembered) {
                still.push(item);
                return;
            }
            if (remembered.action === 'skip') {
                row.reverseResolutions[sid] = { action: 'skip' };
                return;
            }
            if (remembered.action === 'map' && remembered.tmsKey) {
                const stillAvailable = (item.candidates || []).some(
                    (c) => c && c.tmsKey === remembered.tmsKey
                );
                if (!stillAvailable) {
                    still.push(item);
                    return;
                }
                row.reverseResolutions[sid] = {
                    action: 'map',
                    tmsKey: remembered.tmsKey
                };
                row.studentResolutions[remembered.tmsKey] = {
                    action: 'map',
                    studentId: sid
                };
                return;
            }
            still.push(item);
        });
        return still;
    }

    /**
     * Apply remembered resolutions onto a Sync row and return unclear items still needing UI.
     * Mutates row.studentResolutions.
     */
    function applyRememberedTmsStudentResolutions(cohort, unclearItems, row) {
        const mem = normalizeTmsStudentResolutions(cohort && cohort.tmsStudentResolutions);
        if (!row.studentResolutions || typeof row.studentResolutions !== 'object') {
            row.studentResolutions = {};
        }
        const students = Array.isArray(cohort && cohort.students) ? cohort.students : [];
        const byId = new Map(students.filter((s) => s && s.id).map((s) => [s.id, s]));
        const still = [];
        (Array.isArray(unclearItems) ? unclearItems : []).forEach((item) => {
            if (!item || !item.tmsKey) {
                return;
            }
            const key = item.tmsKey;
            const remembered = mem[key];
            if (!remembered) {
                still.push(item);
                return;
            }
            if (remembered.action === 'skip') {
                row.studentResolutions[key] = { action: 'skip' };
                return;
            }
            if (remembered.action === 'add') {
                row.studentResolutions[key] = { action: 'add' };
                return;
            }
            if (remembered.action === 'map') {
                if (!byId.has(remembered.studentId)) {
                    still.push(item);
                    return;
                }
                row.studentResolutions[key] = {
                    action: 'map',
                    studentId: remembered.studentId
                };
                return;
            }
            still.push(item);
        });
        return still;
    }

    /**
     * Merge a TMS (or similar) Korean-name roster into an existing cohort student list.
     * - Match by koreanMatchKey (Hangul + Latin; status symbols ignored).
     * - On exact match or confirmed map, adopt TMS display name when it differs, and nameEn when set.
     * - Add students only via resolution action 'add' (or exact-new when no review needed —
     *   unmatched / unclear without Map/Add/Skip never auto-add).
     * - Flag existing students missing from TMS with off_roster (never delete).
     * - Clear off_roster when they reappear on TMS (Korean match / map only — English never affects this).
     * - options.studentResolutions: { [tmsKey]: { action:'map'|'add'|'skip', studentId? } }
     */
    function mergeRosterByKoreanName(existingStudents, tmsStudents, options) {
        const opts = options || {};
        const makeId =
            typeof opts.newStudentId === 'function'
                ? opts.newStudentId
                : () => newId('stu');
        const resolutions = normalizeTmsStudentResolutions(
            opts.studentResolutions && typeof opts.studentResolutions === 'object'
                ? opts.studentResolutions
                : {}
        );
        const existing = (Array.isArray(existingStudents) ? existingStudents : [])
            .map(normalizeStudent)
            .filter(Boolean);
        const existingById = new Map(existing.map((s) => [s.id, s]));
        const incoming = (Array.isArray(tmsStudents) ? tmsStudents : [])
            .map((raw) => {
                if (!raw) {
                    return null;
                }
                const name = normalizeStr(raw.name);
                if (!name) {
                    return null;
                }
                return {
                    name,
                    nameEn: normalizeStr(raw.nameEn),
                    locationTag: normalizeStr(raw.locationTag),
                    memo: normalizeStr(raw.memo)
                };
            })
            .filter(Boolean);

        const existingByKey = new Map();
        const duplicateKeys = new Set();
        existing.forEach((s) => {
            const k = koreanMatchKey(s.name);
            if (!k) {
                return;
            }
            if (existingByKey.has(k)) {
                duplicateKeys.add(k);
            } else {
                existingByKey.set(k, s);
            }
        });

        const tmsKeys = new Set();
        const added = [];
        const matched = [];
        const warnings = [];
        const exactMatchedIds = new Set();
        const resolutionMatchedIds = new Set();
        const skipTmsKeys = new Set();
        /** @type {Map<string, { name: string, nameEn: string }>} */
        const mapNameUpdates = new Map();

        function adoptTmsIdentity(target, imp, extra) {
            const previousName = target.name;
            const nameUpdated = normalizeStr(previousName) !== normalizeStr(imp.name);
            mapNameUpdates.set(target.id, {
                name: nameUpdated ? imp.name : target.name,
                // Empty TMS English keeps existing CM English.
                nameEn: imp.nameEn || target.nameEn || ''
            });
            matched.push(
                Object.assign(
                    {
                        id: target.id,
                        name: imp.name,
                        previousName,
                        nameUpdated
                    },
                    extra || {}
                )
            );
            exactMatchedIds.add(target.id);
        }

        incoming.forEach((imp) => {
            const k = koreanMatchKey(imp.name);
            if (!k) {
                return;
            }
            if (tmsKeys.has(k)) {
                warnings.push({ code: 'duplicate_tms_name', name: imp.name });
                return;
            }
            tmsKeys.add(k);
            const resolution = resolutions[k];
            // Resolution-first so duplicate_existing Map sticks (exact key would otherwise win first).
            if (resolution && resolution.action === 'skip') {
                skipTmsKeys.add(k);
                return;
            }
            if (resolution && resolution.action === 'map') {
                const targetId = normalizeStr(resolution.studentId);
                const target = existingById.get(targetId);
                if (target) {
                    adoptTmsIdentity(target, imp, { resolved: true });
                    resolutionMatchedIds.add(target.id);
                    return;
                }
                warnings.push({ code: 'resolution_target_missing', name: imp.name, studentId: targetId });
            }
            if (resolution && resolution.action === 'add') {
                added.push({
                    id: makeId(),
                    name: imp.name,
                    nameEn: imp.nameEn,
                    locationTag: imp.locationTag,
                    sortOrder: existing.length + added.length,
                    active: true,
                    tags: [],
                    memo: imp.memo,
                    archivedAt: '',
                    archiveReason: '',
                    expectedStartDate: ''
                });
                return;
            }
            const match = existingByKey.get(k);
            if (match) {
                if (duplicateKeys.has(k)) {
                    warnings.push({
                        code: 'duplicate_existing_name',
                        name: imp.name,
                        matchedId: match.id
                    });
                    // Without a resolution, do not auto-pick among duplicates.
                    const unclearCandidates = existing.filter((s) => koreanMatchKey(s.name) === k);
                    if (unclearCandidates.length && !resolution) {
                        warnings.push({
                            code: 'unresolved_unclear_name',
                            name: imp.name,
                            candidates: unclearCandidates.map((s) => s.id)
                        });
                        skipTmsKeys.add(k);
                        if (opts.softUnclear) {
                            unclearCandidates.forEach((s) => {
                                if (s && s.id) {
                                    exactMatchedIds.add(s.id);
                                }
                            });
                        }
                        return;
                    }
                }
                adoptTmsIdentity(match, imp, { matchedBy: 'name' });
                return;
            }
            // Unclear / unmatched without resolution: do not auto-add (wizard must decide).
            const unclearCandidates = existing.filter((s) =>
                sharesHangulCoreOrVariant(s.name, imp.name)
            );
            if (!resolution) {
                if (unclearCandidates.length) {
                    warnings.push({
                        code: 'unresolved_unclear_name',
                        name: imp.name,
                        candidates: unclearCandidates.map((s) => s.id)
                    });
                    skipTmsKeys.add(k);
                    unclearCandidates.forEach((s) => {
                        if (s && s.id && opts.softUnclear) {
                            exactMatchedIds.add(s.id);
                        }
                    });
                    return;
                }
                // Unmatched (no Hangul peer) — require Map / Add / Skip.
                warnings.push({
                    code: 'unresolved_unmatched_name',
                    name: imp.name,
                    candidates: existing.map((s) => s.id)
                });
                skipTmsKeys.add(k);
                return;
            }
            // Fallback: resolution was present but invalid (e.g. map target missing already warned).
            warnings.push({
                code: 'unresolved_unmatched_name',
                name: imp.name
            });
            skipTmsKeys.add(k);
        });

        const fuzzyMatchedIds = new Set();
        const fuzzyCleared = [];
        // Shared Hangul-core / Latin leftovers are not auto-fuzzy merged.
        // They must be resolved via listUnclearTmsStudentMatches + studentResolutions.

        // Treat resolution-mapped + exact as on TMS for Off roster.
        resolutionMatchedIds.forEach((id) => exactMatchedIds.add(id));

        const flagged = [];
        const cleared = [];
        if (incoming.length === 0 && existing.some((s) => s.active !== false)) {
            return {
                students: existing.slice().sort(compareStudentNames),
                summary: {
                    added: [],
                    matched,
                    flagged: [],
                    cleared: [],
                    fuzzyCleared,
                    warnings: [{ code: 'incomplete_tms_scrape' }],
                    totalTms: 0,
                    totalAfter: existing.length
                }
            };
        }
        const nextExisting = existing.map((s) => {
            const nameUpdate = mapNameUpdates.get(s.id);
            let next = s;
            if (nameUpdate) {
                const patch = { name: nameUpdate.name };
                if (nameUpdate.nameEn) {
                    patch.nameEn = nameUpdate.nameEn;
                }
                next = Object.assign({}, s, patch);
            }
            // Off roster is Korean-name only: exact match, map resolution, or fuzzy consume.
            // nameEn differences never block clearing off_roster.
            const k = koreanMatchKey(next.name);
            const onTms =
                (k && tmsKeys.has(k) && !skipTmsKeys.has(k)) ||
                fuzzyMatchedIds.has(s.id) ||
                exactMatchedIds.has(s.id);
            const hadOff = (next.tags || []).includes(OFF_ROSTER_TAG);
            if (onTms) {
                if (hadOff) {
                    const entry = { id: next.id, name: next.name };
                    cleared.push(entry);
                    if (fuzzyMatchedIds.has(s.id)) {
                        fuzzyCleared.push(entry);
                    }
                }
                return withoutStudentTag(next, OFF_ROSTER_TAG);
            }
            flagged.push({ id: next.id, name: next.name });
            return hadOff ? next : withStudentTag(next, OFF_ROSTER_TAG);
        });

        const students = nextExisting.concat(added).sort(compareStudentNames);
        return {
            students,
            summary: {
                added: added.map((s) => ({ id: s.id, name: s.name })),
                matched,
                flagged,
                cleared,
                fuzzyCleared,
                warnings,
                totalTms: tmsKeys.size,
                totalAfter: students.length
            }
        };
    }

    /**
     * Apply Korean-name TMS merges across cohorts using a mapping plan.
     * plan rows: { userAction: 'map'|'skip', userTargetId, importCohortName, students: [{name,nameEn?}] }
     */
    function applyTmsRosterPlan(calendarCohorts, plan, options) {
        const opts = options || {};
        let cohorts = (Array.isArray(calendarCohorts) ? calendarCohorts : []).map((c) =>
            Object.assign({}, c, {
                students: Array.isArray(c.students) ? c.students.map((s) => Object.assign({}, s)) : [],
                tmsStudentResolutions: normalizeTmsStudentResolutions(c && c.tmsStudentResolutions),
                tmsReverseResolutions: normalizeTmsReverseResolutions(c && c.tmsReverseResolutions)
            })
        );
        const results = [];
        (Array.isArray(plan) ? plan : []).forEach((row) => {
            if (!row || row.userAction === 'skip') {
                results.push({
                    importCohortName: row && row.importCohortName,
                    skipped: true,
                    summary: null
                });
                return;
            }
            if (row.userAction !== 'map') {
                return;
            }
            const targetId = normalizeStr(row.userTargetId);
            const idx = cohorts.findIndex((c) => c && c.id === targetId);
            if (idx < 0) {
                results.push({
                    importCohortName: row.importCohortName,
                    error: 'target_not_found',
                    summary: null
                });
                return;
            }
            const target = cohorts[idx];
            const sessionResolutions = row.studentResolutions || opts.studentResolutions || {};
            const sessionReverse = row.reverseResolutions || opts.reverseResolutions || {};
            // Reverse Map choices are also written into studentResolutions[tmsKey] → adoptTmsIdentity.
            const merged = mergeRosterByKoreanName(target.students, row.students, {
                newStudentId: opts.newStudentId,
                studentResolutions: sessionResolutions,
                softUnclear: Boolean(opts.softUnclear)
            });
            cohorts[idx] = Object.assign({}, target, {
                students: merged.students,
                tmsStudentResolutions: mergeTmsStudentResolutions(
                    target.tmsStudentResolutions,
                    sessionResolutions
                ),
                tmsReverseResolutions: mergeTmsReverseResolutions(
                    target.tmsReverseResolutions,
                    sessionReverse
                )
            });
            results.push({
                importCohortName: row.importCohortName,
                targetId,
                targetName: target.name,
                summary: merged.summary
            });
        });
        return { cohorts, results };
    }

    /** Stable key for a TMS class — prefer id when present, else normalized name. */
    function normalizeTmsClassKey(tmsClassName, tmsClassId) {
        const id = normalizeStr(tmsClassId);
        if (id) {
            return `id:${id}`;
        }
        return normalizeStr(tmsClassName)
            .toLowerCase()
            .replace(/\s+/g, '');
    }

    function normalizeTmsRosterLinkEntry(raw, keyHint) {
        if (!raw || typeof raw !== 'object') {
            return null;
        }
        const action = raw.action === 'skip' ? 'skip' : raw.action === 'map' ? 'map' : '';
        if (!action) {
            return null;
        }
        const cohortId = action === 'map' ? normalizeStr(raw.cohortId) : '';
        if (action === 'map' && !cohortId) {
            return null;
        }
        const tmsClassName = normalizeStr(raw.tmsClassName) || normalizeStr(keyHint);
        const tmsClassId = normalizeStr(raw.tmsClassId);
        return {
            action,
            cohortId,
            tmsClassName,
            tmsClassId
        };
    }

    function normalizeTmsRosterLinks(raw) {
        const out = {};
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return out;
        }
        Object.keys(raw).forEach((key) => {
            const entry = normalizeTmsRosterLinkEntry(raw[key], key);
            if (!entry) {
                return;
            }
            const k =
                normalizeTmsClassKey(entry.tmsClassName, entry.tmsClassId) ||
                normalizeStr(key).toLowerCase().replace(/\s+/g, '');
            if (!k) {
                return;
            }
            out[k] = entry;
        });
        return out;
    }

    /**
     * Resolve UI defaults for one TMS class against saved links + live cohorts.
     * Saved map/skip wins. Missing/stale links → choose (no auto-map).
     */
    function resolveTmsRosterLink(links, tmsClassName, cohorts, options) {
        const opts = options || {};
        const tmsClassId = normalizeStr(opts.tmsClassId);
        const key = normalizeTmsClassKey(tmsClassName, tmsClassId);
        const map = normalizeTmsRosterLinks(links);
        const entry = key ? map[key] : null;
        const list = Array.isArray(cohorts) ? cohorts : [];
        const cohortExists = (id) => list.some((c) => c && normalizeStr(c.id) === normalizeStr(id));

        if (entry && entry.action === 'skip') {
            return {
                key,
                source: 'saved',
                remembered: true,
                userAction: 'skip',
                userTargetId: '',
                suggestedTargetId: '',
                tmsClassName: entry.tmsClassName || normalizeStr(tmsClassName),
                tmsClassId: entry.tmsClassId || tmsClassId
            };
        }
        if (entry && entry.action === 'map' && cohortExists(entry.cohortId)) {
            return {
                key,
                source: 'saved',
                remembered: true,
                userAction: 'map',
                userTargetId: entry.cohortId,
                suggestedTargetId: entry.cohortId,
                tmsClassName: entry.tmsClassName || normalizeStr(tmsClassName),
                tmsClassId: entry.tmsClassId || tmsClassId
            };
        }

        // Soft name hint only (does not auto-select — names often mismatch).
        let suggestedTargetId = '';
        const exact = list.filter(
            (c) =>
                c &&
                !isArchiveCohort(c) &&
                normalizeStr(c.name) === normalizeStr(tmsClassName)
        );
        if (exact.length === 1) {
            suggestedTargetId = exact[0].id;
        } else {
            const norm = normalizeTmsClassKey(tmsClassName);
            const normHits = list.filter(
                (c) => c && !isArchiveCohort(c) && normalizeTmsClassKey(c.name) === norm
            );
            if (normHits.length === 1) {
                suggestedTargetId = normHits[0].id;
            }
        }

        return {
            key,
            source: entry ? 'stale' : 'none',
            remembered: false,
            userAction: 'choose',
            userTargetId: '',
            suggestedTargetId,
            tmsClassName: normalizeStr(tmsClassName),
            tmsClassId
        };
    }

    /**
     * Merge plan row choices into tmsRosterLinks; drop map links to deleted cohorts.
     * plan rows: { importCohortName, tmsClassId?, userAction, userTargetId }
     */
    function upsertTmsRosterLinks(existingLinks, planRows, cohorts) {
        const next = normalizeTmsRosterLinks(existingLinks);
        const validIds = new Set(
            (Array.isArray(cohorts) ? cohorts : [])
                .filter((c) => c && normalizeStr(c.id))
                .map((c) => normalizeStr(c.id))
        );

        (Array.isArray(planRows) ? planRows : []).forEach((row) => {
            if (!row) {
                return;
            }
            const name = normalizeStr(row.importCohortName || row.tmsClassName);
            const tmsClassId = normalizeStr(row.tmsClassId);
            const key = normalizeTmsClassKey(name, tmsClassId);
            if (!key) {
                return;
            }
            if (row.userAction === 'skip') {
                next[key] = {
                    action: 'skip',
                    cohortId: '',
                    tmsClassName: name,
                    tmsClassId
                };
                return;
            }
            if (row.userAction === 'map') {
                const cohortId = normalizeStr(row.userTargetId || row.cohortId);
                if (!cohortId || !validIds.has(cohortId)) {
                    return;
                }
                next[key] = {
                    action: 'map',
                    cohortId,
                    tmsClassName: name,
                    tmsClassId
                };
            }
        });

        Object.keys(next).forEach((k) => {
            const entry = next[k];
            if (entry.action === 'map' && entry.cohortId && !validIds.has(entry.cohortId)) {
                delete next[k];
            }
        });

        return next;
    }

    function isArchiveCohort(cohort) {
        if (!cohort) {
            return false;
        }
        if (cohort.isArchiveCohort === true) {
            return true;
        }
        return normalizeStr(cohort.id) === ARCHIVE_COHORT_ID;
    }

    function findArchiveCohort(cohorts) {
        return (Array.isArray(cohorts) ? cohorts : []).find((c) => isArchiveCohort(c)) || null;
    }

    function ensureArchiveCohort(cohorts, options) {
        const opts = options || {};
        const list = Array.isArray(cohorts) ? cohorts.filter(Boolean).slice() : [];
        const existing = findArchiveCohort(list);
        if (existing) {
            return { cohorts: list, archiveCohort: existing, created: false };
        }
        const archive = {
            id: ARCHIVE_COHORT_ID,
            name: normalizeStr(opts.name) || 'Student archive',
            isArchiveCohort: true,
            classIds: [],
            students: []
        };
        if (opts.homeroomTeacherUserId) {
            archive.homeroomTeacherUserId = normalizeStr(opts.homeroomTeacherUserId);
        }
        list.push(archive);
        return { cohorts: list, archiveCohort: archive, created: true };
    }

    function findStudentCohort(studentId, cohorts) {
        const sid = normalizeStr(studentId);
        if (!sid) {
            return null;
        }
        for (const cohort of cohorts || []) {
            if (!cohort || isArchiveCohort(cohort)) {
                continue;
            }
            const students = normalizeCohortStudents(cohort);
            if (students.some((s) => s.id === sid)) {
                return cohort;
            }
        }
        return null;
    }

    function cloneCohorts(cohorts) {
        return (Array.isArray(cohorts) ? cohorts : []).map((c) =>
            Object.assign({}, c, {
                students: Array.isArray(c.students) ? c.students.map((s) => Object.assign({}, s)) : []
            })
        );
    }

    function removeStudentFromCohort(cohorts, cohortId, studentId) {
        const cid = normalizeStr(cohortId);
        const sid = normalizeStr(studentId);
        return cohorts.map((c) => {
            if (!c || c.id !== cid) {
                return c;
            }
            return Object.assign({}, c, {
                students: (c.students || []).filter((s) => s && normalizeStr(s.id) !== sid)
            });
        });
    }

    function archiveStudent(cohorts, studentId, fromCohortId, meta) {
        const opts = meta || {};
        const sid = normalizeStr(studentId);
        const fromId = normalizeStr(fromCohortId);
        if (!sid || !fromId) {
            return { error: 'missing_student', cohorts };
        }
        let list = cloneCohorts(cohorts);
        const fromCohort = list.find((c) => c && c.id === fromId);
        if (!fromCohort || isArchiveCohort(fromCohort)) {
            return { error: 'invalid_source', cohorts: list };
        }
        const student = normalizeCohortStudents(fromCohort).find((s) => s.id === sid);
        if (!student) {
            return { error: 'student_not_found', cohorts: list };
        }
        const ensured = ensureArchiveCohort(list, { homeroomTeacherUserId: opts.homeroomTeacherUserId });
        list = ensured.cohorts;
        const archiveId = ensured.archiveCohort.id;
        list = removeStudentFromCohort(list, fromId, sid);
        const reason = ARCHIVE_REASONS.includes(opts.archiveReason) ? opts.archiveReason : 'break';
        const tags = Array.isArray(student.tags) ? student.tags.filter((t) => t !== 'starting_soon') : [];
        if (reason === 'starting_soon') {
            tags.push('starting_soon');
        }
        const archived = Object.assign({}, student, {
            active: false,
            archivedAt: opts.archivedAt || new Date().toISOString(),
            archiveReason: reason,
            expectedStartDate: reason === 'starting_soon' ? normalizeStr(opts.expectedStartDate) : '',
            tags
        });
        list = list.map((c) => {
            if (!c || c.id !== archiveId) {
                return c;
            }
            const students = normalizeCohortStudents(c).filter((s) => s.id !== sid);
            students.push(archived);
            return Object.assign({}, c, { students });
        });
        return { error: null, cohorts: list, archiveCohortId: archiveId };
    }

    /**
     * Archive many students from one cohort with the same reason metadata.
     * @returns {{ error: string|null, cohorts, archiveCohortId?: string, archivedCount: number }}
     */
    function archiveStudents(cohorts, studentIds, fromCohortId, meta) {
        const ids = Array.isArray(studentIds)
            ? studentIds.map((id) => normalizeStr(id)).filter(Boolean)
            : [];
        if (!ids.length) {
            return { error: 'missing_student', cohorts, archivedCount: 0 };
        }
        let list = cohorts;
        let archiveCohortId = '';
        let archivedCount = 0;
        for (const sid of ids) {
            const result = archiveStudent(list, sid, fromCohortId, meta);
            if (result.error) {
                return {
                    error: result.error,
                    cohorts: result.cohorts,
                    archiveCohortId,
                    archivedCount
                };
            }
            list = result.cohorts;
            archiveCohortId = result.archiveCohortId || archiveCohortId;
            archivedCount += 1;
        }
        return { error: null, cohorts: list, archiveCohortId, archivedCount };
    }

    /**
     * Bulk update tags and/or active for students in one cohort.
     * opts.addTags / opts.removeTags: tag arrays; opts.active: true|false|null (null = leave).
     */
    function updateStudentsInCohort(cohorts, cohortId, studentIds, opts) {
        const options = opts || {};
        const cid = normalizeStr(cohortId);
        const idSet = new Set(
            (Array.isArray(studentIds) ? studentIds : []).map((id) => normalizeStr(id)).filter(Boolean)
        );
        if (!cid || !idSet.size) {
            return { error: 'missing_student', cohorts, updatedCount: 0 };
        }
        const list = cloneCohorts(cohorts);
        const cohort = list.find((c) => c && c.id === cid);
        if (!cohort || isArchiveCohort(cohort)) {
            return { error: 'invalid_source', cohorts: list, updatedCount: 0 };
        }
        const addTags = (Array.isArray(options.addTags) ? options.addTags : []).filter((t) =>
            STUDENT_TAGS.includes(t)
        );
        const removeTags = (Array.isArray(options.removeTags) ? options.removeTags : []).filter((t) =>
            STUDENT_TAGS.includes(t)
        );
        const setActive = options.active === true || options.active === false ? options.active : null;
        let updatedCount = 0;
        const students = normalizeCohortStudents(cohort).map((s) => {
            if (!s || !idSet.has(s.id)) {
                return s;
            }
            let tags = Array.isArray(s.tags) ? s.tags.slice() : [];
            removeTags.forEach((tag) => {
                tags = tags.filter((t) => t !== tag);
            });
            addTags.forEach((tag) => {
                if (!tags.includes(tag)) {
                    tags.push(tag);
                }
            });
            tags = tags.filter((t) => STUDENT_TAGS.includes(t));
            const next = Object.assign({}, s, { tags });
            if (setActive !== null) {
                next.active = setActive;
            }
            updatedCount += 1;
            return next;
        });
        const nextList = list.map((c) => (c && c.id === cid ? Object.assign({}, c, { students }) : c));
        return { error: null, cohorts: nextList, updatedCount };
    }

    function restoreStudentFromArchive(cohorts, studentId, toCohortId) {
        const sid = normalizeStr(studentId);
        const toId = normalizeStr(toCohortId);
        let list = cloneCohorts(cohorts);
        const archive = findArchiveCohort(list);
        if (!archive || !sid || !toId) {
            return { error: 'invalid_restore', cohorts: list };
        }
        const student = normalizeCohortStudents(archive).find((s) => s.id === sid);
        const target = list.find((c) => c && c.id === toId);
        if (!student || !target || isArchiveCohort(target)) {
            return { error: 'invalid_restore', cohorts: list };
        }
        list = removeStudentFromCohort(list, archive.id, sid);
        const restored = Object.assign({}, student, {
            active: true,
            archivedAt: '',
            archiveReason: '',
            expectedStartDate: '',
            tags: (student.tags || []).filter((t) => t !== 'starting_soon')
        });
        list = list.map((c) => {
            if (!c || c.id !== toId) {
                return c;
            }
            const students = normalizeCohortStudents(c).filter((s) => s.id !== sid);
            students.push(restored);
            return Object.assign({}, c, { students });
        });
        return { error: null, cohorts: list };
    }

    function moveStudentsBetweenCohorts(cohorts, fromCohortId, toCohortId, studentIds) {
        const fromId = normalizeStr(fromCohortId);
        const toId = normalizeStr(toCohortId);
        const ids = (Array.isArray(studentIds) ? studentIds : []).map(normalizeStr).filter(Boolean);
        const list = cloneCohorts(cohorts);
        if (!fromId || !toId) {
            return { error: 'missing_cohort', cohorts: list, duplicates: [] };
        }
        if (!ids.length) {
            return { error: 'no_students', cohorts: list, duplicates: [] };
        }
        if (fromId === toId) {
            return { error: 'same_cohort', cohorts: list, duplicates: [] };
        }
        const fromCohort = list.find((c) => c && c.id === fromId);
        const toCohort = list.find((c) => c && c.id === toId);
        if (!fromCohort || !toCohort) {
            return { error: 'cohort_not_found', cohorts: list, duplicates: [] };
        }
        if (isArchiveCohort(fromCohort) || isArchiveCohort(toCohort)) {
            return { error: 'archive_cohort', cohorts: list, duplicates: [] };
        }
        const fromStudents = normalizeCohortStudents(fromCohort);
        const toStudents = normalizeCohortStudents(toCohort);
        const toIdSet = new Set(toStudents.map((s) => s.id));
        const duplicates = ids.filter((id) => toIdSet.has(id));
        if (duplicates.length) {
            return { error: 'duplicate_in_target', cohorts: list, duplicates };
        }
        const moveSet = new Set(ids);
        const moving = [];
        for (const sid of ids) {
            const student = fromStudents.find((s) => s.id === sid);
            if (!student) {
                return { error: 'student_not_found', cohorts: list, duplicates: [] };
            }
            moving.push(Object.assign({}, student));
        }
        let next = list.map((c) => {
            if (!c || c.id !== fromId) {
                return c;
            }
            return Object.assign({}, c, {
                students: fromStudents.filter((s) => !moveSet.has(s.id))
            });
        });
        const targetStudents = normalizeCohortStudents(toCohort);
        let sortOrder = targetStudents.length;
        const appended = moving.map((s) =>
            Object.assign({}, s, {
                sortOrder: sortOrder++
            })
        );
        next = next.map((c) => {
            if (!c || c.id !== toId) {
                return c;
            }
            return Object.assign({}, c, {
                students: targetStudents.concat(appended)
            });
        });
        return { error: null, cohorts: next, movedCount: moving.length, duplicates: [] };
    }

    function purgeStudentRecords(data, studentId) {
        const sid = normalizeStr(studentId);
        if (!sid || !data) {
            return data;
        }
        const next = Object.assign({}, data);
        if (Array.isArray(next.attendanceSessions)) {
            next.attendanceSessions = next.attendanceSessions.map((session) => {
                if (!session || !Array.isArray(session.records)) {
                    return session;
                }
                return Object.assign({}, session, {
                    records: session.records.filter((r) => normalizeStr(r.studentId) !== sid)
                });
            });
        }
        if (Array.isArray(next.homeworkCompletions)) {
            next.homeworkCompletions = next.homeworkCompletions.map((hw) => {
                if (!hw || !Array.isArray(hw.records)) {
                    return hw;
                }
                return Object.assign({}, hw, {
                    records: hw.records.filter((r) => normalizeStr(r.studentId) !== sid)
                });
            });
        }
        if (Array.isArray(next.essaySubmissions)) {
            next.essaySubmissions = next.essaySubmissions.map((essay) => {
                if (!essay || !Array.isArray(essay.records)) {
                    return essay;
                }
                return Object.assign({}, essay, {
                    records: essay.records.filter((r) => normalizeStr(r.studentId) !== sid)
                });
            });
        }
        if (Array.isArray(next.studentPoints)) {
            next.studentPoints = next.studentPoints.filter(
                (p) => !p || normalizeStr(p.studentId) !== sid
            );
        }
        if (Array.isArray(next.studentTests)) {
            next.studentTests = next.studentTests.map((test) => {
                if (!test || !Array.isArray(test.records)) {
                    return test;
                }
                return Object.assign({}, test, {
                    records: test.records.filter((r) => normalizeStr(r.studentId) !== sid)
                });
            });
        }
        if (Array.isArray(next.debateScores)) {
            next.debateScores = next.debateScores.map((session) => {
                if (!session || !Array.isArray(session.records)) {
                    return session;
                }
                return Object.assign({}, session, {
                    records: session.records.filter((r) => normalizeStr(r.studentId) !== sid)
                });
            });
        }
        return next;
    }

    function deleteStudentPermanently(cohorts, studentId, cohortId) {
        const sid = normalizeStr(studentId);
        const cid = normalizeStr(cohortId);
        if (!sid || !cid) {
            return { error: 'missing_student', cohorts };
        }
        let list = cloneCohorts(cohorts);
        const cohort = list.find((c) => c && c.id === cid);
        if (!cohort) {
            return { error: 'cohort_not_found', cohorts: list };
        }
        if (!normalizeCohortStudents(cohort).some((s) => s.id === sid)) {
            return { error: 'student_not_found', cohorts: list };
        }
        list = removeStudentFromCohort(list, cid, sid);
        return { error: null, cohorts: list, studentId: sid };
    }

    function isPastArchiveRetention(student, retentionDays, refDate) {
        const days = Number(retentionDays);
        if (!student || !student.archivedAt || !Number.isFinite(days) || days <= 0) {
            return false;
        }
        const archivedDate = normalizeStr(student.archivedAt).slice(0, 10);
        if (!archivedDate) {
            return false;
        }
        const ref = normalizeStr(refDate) || todayISO();
        const cutoff = addDaysISO(archivedDate, days);
        return compareDateStr(ref, cutoff) > 0;
    }

    function listStudentsPastRetention(cohort, retentionDays, refDate) {
        if (!cohort || !isArchiveCohort(cohort)) {
            return [];
        }
        return normalizeCohortStudents(cohort).filter((s) =>
            isPastArchiveRetention(s, retentionDays, refDate)
        );
    }

    function normalizeCohortStudents(cohort) {
        if (!cohort) {
            return [];
        }
        const list = Array.isArray(cohort.students) ? cohort.students : [];
        return list
            .map(normalizeStudent)
            .filter(Boolean)
            .sort(compareStudentNames);
    }

    /**
     * Active students for a class (union of linked cohorts, deduped by id).
     * @returns {Array<{ student, cohortId, cohortName }>}
     */
    function resolveStudentsForClass(classData, cohorts) {
        if (!classData) {
            return [];
        }
        const cohortList = Array.isArray(cohorts) ? cohorts : [];
        const cohortIds = getCohortIdsForClass(classData);
        const byId = new Map();
        cohortIds.forEach((cohortId) => {
            const cohort = cohortList.find((c) => c && c.id === cohortId);
            if (!cohort) {
                return;
            }
            normalizeCohortStudents(cohort)
                .filter((s) => s.active)
                .forEach((student) => {
                    if (!byId.has(student.id)) {
                        byId.set(student.id, {
                            student,
                            cohortId: cohort.id,
                            cohortName: normalizeStr(cohort.name)
                        });
                    }
                });
        });
        return Array.from(byId.values()).sort((a, b) =>
            compareStudentNames(a.student, b.student)
        );
    }

    function findStudentInCohorts(studentId, cohorts) {
        const sid = normalizeStr(studentId);
        if (!sid) {
            return null;
        }
        for (const cohort of cohorts || []) {
            const students = normalizeCohortStudents(cohort);
            const found = students.find((s) => s.id === sid);
            if (found) {
                return { student: found, cohort };
            }
        }
        return null;
    }

    function attendanceSessionKey(classId, date) {
        return `${normalizeStr(classId)}|${normalizeStr(date)}`;
    }

    function normalizeAttendanceRecord(raw) {
        if (!raw || !raw.studentId) {
            return null;
        }
        const status = ATTENDANCE_STATUSES.includes(raw.status) ? raw.status : 'present';
        return {
            studentId: normalizeStr(raw.studentId),
            status,
            sessionNote: normalizeStr(raw.sessionNote)
        };
    }

    function normalizeAttendanceSession(raw) {
        if (!raw || !raw.id || !raw.classId || !raw.date) {
            return null;
        }
        const records = Array.isArray(raw.records)
            ? raw.records.map(normalizeAttendanceRecord).filter(Boolean)
            : [];
        return {
            id: normalizeStr(raw.id),
            classId: normalizeStr(raw.classId),
            date: normalizeStr(raw.date),
            records,
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function findAttendanceSession(sessions, classId, date) {
        const list = Array.isArray(sessions) ? sessions : [];
        const cid = normalizeStr(classId);
        const d = normalizeStr(date);
        return list.find((s) => s && s.classId === cid && s.date === d) || null;
    }

    function upsertAttendanceSession(sessions, session) {
        const normalized = normalizeAttendanceSession(session);
        if (!normalized) {
            return Array.isArray(sessions) ? sessions.slice() : [];
        }
        const list = Array.isArray(sessions) ? sessions.filter(Boolean).slice() : [];
        const idx = list.findIndex(
            (s) => s.classId === normalized.classId && s.date === normalized.date
        );
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], normalized, { id: list[idx].id || normalized.id });
        } else {
            list.push(normalized);
        }
        return list;
    }

    function getAttendanceRecordForStudent(session, studentId) {
        if (!session || !Array.isArray(session.records)) {
            return null;
        }
        const sid = normalizeStr(studentId);
        return session.records.find((r) => r.studentId === sid) || null;
    }

    function countAttendanceStatuses(session) {
        const counts = { present: 0, late: 0, absent: 0, early_leave: 0, total: 0 };
        if (!session || !Array.isArray(session.records)) {
            return counts;
        }
        session.records.forEach((r) => {
            if (!r || !r.studentId) {
                return;
            }
            counts.total += 1;
            if (counts[r.status] != null) {
                counts[r.status] += 1;
            }
        });
        return counts;
    }

    function countRecentAbsences(sessions, studentId, classId, refDate, windowDays) {
        const days = windowDays == null ? 30 : windowDays;
        const ref = normalizeStr(refDate) || todayISO();
        const cutoff = addDaysISO(ref, -days);
        const sid = normalizeStr(studentId);
        const cid = normalizeStr(classId);
        let count = 0;
        (sessions || []).forEach((session) => {
            if (!session || session.classId !== cid) {
                return;
            }
            if (compareDateStr(session.date, cutoff) < 0 || compareDateStr(session.date, ref) > 0) {
                return;
            }
            const rec = getAttendanceRecordForStudent(session, sid);
            if (rec && rec.status === 'absent') {
                count += 1;
            }
        });
        return count;
    }

    function normalizeHomeworkRecord(raw) {
        if (!raw || !raw.studentId) {
            return null;
        }
        let grade = normalizeStr(raw.grade).toUpperCase();
        if (!HOMEWORK_GRADES.includes(grade)) {
            grade = 'X';
        }
        let selfCheck = normalizeStr(raw.selfCheck);
        if (!HOMEWORK_SELF_CHECKS.includes(selfCheck)) {
            selfCheck = 'none';
        }
        return {
            studentId: normalizeStr(raw.studentId),
            grade,
            selfCheck,
            parentCheck: Boolean(raw.parentCheck),
            note: normalizeStr(raw.note)
        };
    }

    function normalizeHomeworkCompletion(raw) {
        if (!raw || !raw.id || !raw.classId) {
            return null;
        }
        const syllabusRowId = normalizeStr(raw.syllabusRowId);
        if (!syllabusRowId) {
            return null;
        }
        const records = Array.isArray(raw.records)
            ? raw.records.map(normalizeHomeworkRecord).filter(Boolean)
            : [];
        return {
            id: normalizeStr(raw.id),
            classId: normalizeStr(raw.classId),
            syllabusRowId,
            lessonDate: normalizeStr(raw.lessonDate),
            records,
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function findHomeworkCompletion(completions, classId, syllabusRowId) {
        const list = Array.isArray(completions) ? completions : [];
        const cid = normalizeStr(classId);
        const rid = normalizeStr(syllabusRowId);
        return list.find((h) => h && h.classId === cid && h.syllabusRowId === rid) || null;
    }

    function upsertHomeworkCompletion(completions, entry) {
        const normalized = normalizeHomeworkCompletion(entry);
        if (!normalized) {
            return Array.isArray(completions) ? completions.slice() : [];
        }
        const list = Array.isArray(completions) ? completions.filter(Boolean).slice() : [];
        const idx = list.findIndex(
            (h) => h.classId === normalized.classId && h.syllabusRowId === normalized.syllabusRowId
        );
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], normalized, { id: list[idx].id || normalized.id });
        } else {
            list.push(normalized);
        }
        return list;
    }

    function getHomeworkRecordForStudent(completion, studentId) {
        if (!completion || !Array.isArray(completion.records)) {
            return null;
        }
        const sid = normalizeStr(studentId);
        return completion.records.find((r) => r.studentId === sid) || null;
    }

    function isEssaySyllabusRow(row) {
        if (!row) {
            return false;
        }
        const hay = `${normalizeStr(row.planTitle)} ${normalizeStr(row.planDetail)} ${normalizeStr(row.homework)}`.toLowerCase();
        return hay.includes('essay') || hay.includes('에세이');
    }

    function isEssayTrackableSyllabusRow(row) {
        if (!row) {
            return false;
        }
        const kind = normalizeStr(row.kind) || 'lesson';
        return kind === 'lesson' || kind === 'overflow';
    }

    function isEssayAssignmentRow(row) {
        if (!row || !isEssayTrackableSyllabusRow(row)) {
            return false;
        }
        if (row.trackEssay === true) {
            return true;
        }
        if (row.trackEssay === false) {
            return false;
        }
        return isEssaySyllabusRow(row);
    }

    function getEssayRowsFromSyllabus(rows) {
        const lessons = getLessonRowsFromSyllabus(rows);
        return lessons.filter(isEssayAssignmentRow);
    }

    function reparseEssayFlagsForClass(classData) {
        if (!classData || !Array.isArray(classData.syllabusRows)) {
            return { rows: [], rowsUpdated: 0, essayRowsFound: 0 };
        }
        let rowsUpdated = 0;
        let essayRowsFound = 0;
        const rows = classData.syllabusRows.map((row) => {
            if (!row || !isEssayTrackableSyllabusRow(row)) {
                return row;
            }
            // Keep manually tracked essays (trackEssay true) even without keyword text.
            const nextFlag = row.trackEssay === true ? true : isEssaySyllabusRow(row);
            if (nextFlag) {
                essayRowsFound += 1;
            }
            if (row.trackEssay === nextFlag) {
                return row;
            }
            rowsUpdated += 1;
            return Object.assign({}, row, { trackEssay: nextFlag });
        });
        return { rows, rowsUpdated, essayRowsFound };
    }

    /**
     * Add a custom essay assignment as a syllabus lesson with trackEssay: true.
     * @returns {{ error: string|null, classData, row, syllabusRowId }}
     */
    function createCustomEssayAssignment(classData, options) {
        const opts = options || {};
        if (!classData || !normalizeStr(classData.id)) {
            return { error: 'missing_class', classData: classData || null, row: null, syllabusRowId: '' };
        }
        const title = normalizeStr(opts.title);
        const date = normalizeStr(opts.date);
        if (!title) {
            return { error: 'missing_title', classData, row: null, syllabusRowId: '' };
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return { error: 'invalid_date', classData, row: null, syllabusRowId: '' };
        }
        const id = normalizeStr(opts.id) || newId('syl');
        const row = {
            id,
            kind: 'lesson',
            date,
            planTitle: title,
            planDetail: '',
            homework: '',
            note: '',
            trackEssay: true
        };
        const rows = Array.isArray(classData.syllabusRows) ? classData.syllabusRows.slice() : [];
        rows.push(row);
        rows.sort((a, b) => {
            const byDate = compareDateStr(a && a.date, b && b.date);
            if (byDate !== 0) {
                return byDate;
            }
            return normalizeStr(a && a.planTitle).localeCompare(normalizeStr(b && b.planTitle));
        });
        const nextClass = Object.assign({}, classData, { syllabusRows: rows });
        return {
            error: null,
            classData: nextClass,
            row,
            syllabusRowId: getSyllabusRowKey(row)
        };
    }

    function pruneOrphanEssaySubmissions(appData, classData) {
        if (!appData || !classData || !classData.id) {
            return 0;
        }
        const essayRowIds = new Set(
            getEssayRowsFromSyllabus(classData.syllabusRows)
                .map((row) => getSyllabusRowKey(row))
                .filter(Boolean)
        );
        const cid = normalizeStr(classData.id);
        const list = Array.isArray(appData.essaySubmissions) ? appData.essaySubmissions : [];
        const before = list.length;
        appData.essaySubmissions = list.filter((entry) => {
            if (!entry || normalizeStr(entry.classId) !== cid) {
                return true;
            }
            return essayRowIds.has(normalizeStr(entry.syllabusRowId));
        });
        return before - appData.essaySubmissions.length;
    }

    function normalizeEssayRecord(raw) {
        if (!raw || !raw.studentId) {
            return null;
        }
        const status = normalizeStr(raw.status);
        const validStatus = ESSAY_STATUSES.includes(status) ? status : 'not_submitted';
        return {
            studentId: normalizeStr(raw.studentId),
            status: validStatus,
            submittedRetest: Boolean(raw.submittedRetest),
            note: normalizeStr(raw.note),
            submissionLate: Boolean(raw.submissionLate),
            overdueDismissed: Boolean(raw.overdueDismissed)
        };
    }

    function normalizeEssaySubmission(raw) {
        if (!raw || !raw.id || !raw.classId) {
            return null;
        }
        const syllabusRowId = normalizeStr(raw.syllabusRowId);
        if (!syllabusRowId) {
            return null;
        }
        const records = Array.isArray(raw.records)
            ? raw.records.map(normalizeEssayRecord).filter(Boolean)
            : [];
        return {
            id: normalizeStr(raw.id),
            classId: normalizeStr(raw.classId),
            syllabusRowId,
            lessonDate: normalizeStr(raw.lessonDate),
            ssDueDate: normalizeStr(raw.ssDueDate),
            teacherEvalDueDate: normalizeStr(raw.teacherEvalDueDate),
            records,
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function findEssaySubmission(submissions, classId, syllabusRowId) {
        const list = Array.isArray(submissions) ? submissions : [];
        const cid = normalizeStr(classId);
        const rid = normalizeStr(syllabusRowId);
        return list.find((e) => e && e.classId === cid && e.syllabusRowId === rid) || null;
    }

    function upsertEssaySubmission(submissions, entry) {
        const normalized = normalizeEssaySubmission(entry);
        if (!normalized) {
            return Array.isArray(submissions) ? submissions.slice() : [];
        }
        const list = Array.isArray(submissions) ? submissions.filter(Boolean).slice() : [];
        const idx = list.findIndex(
            (e) => e.classId === normalized.classId && e.syllabusRowId === normalized.syllabusRowId
        );
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], normalized, { id: list[idx].id || normalized.id });
        } else {
            list.push(normalized);
        }
        return list;
    }

    function getEssayRecordForStudent(submission, studentId) {
        if (!submission || !Array.isArray(submission.records)) {
            return null;
        }
        const sid = normalizeStr(studentId);
        return submission.records.find((r) => r.studentId === sid) || null;
    }

    function ensureEssayRecordsForStudents(submission, studentEntries) {
        const base = submission
            ? Object.assign({}, submission, {
                records: Array.isArray(submission.records) ? submission.records.slice() : []
            })
            : { records: [] };
        const records = base.records.slice();
        const seen = new Set(records.map((r) => normalizeStr(r.studentId)));
        (Array.isArray(studentEntries) ? studentEntries : []).forEach((entry) => {
            const sid = entry && entry.student && normalizeStr(entry.student.id);
            if (!sid || seen.has(sid)) {
                return;
            }
            records.push({
                studentId: sid,
                status: 'not_submitted',
                submittedRetest: false,
                note: '',
                submissionLate: false,
                overdueDismissed: false
            });
            seen.add(sid);
        });
        base.records = records;
        return base;
    }

    function emptyEssayStatusCounts() {
        return {
            not_submitted: 0,
            submitted: 0,
            complete: 0,
            resubmit_required: 0,
            incomplete: 0,
            exempt: 0
        };
    }

    function countEssayByStatus(submission) {
        const counts = emptyEssayStatusCounts();
        if (!submission || !Array.isArray(submission.records)) {
            return counts;
        }
        submission.records.forEach((r) => {
            const status = r && ESSAY_STATUSES.includes(r.status) ? r.status : 'not_submitted';
            counts[status] += 1;
        });
        return counts;
    }

    /** Denominator for % complete: roster size minus exempt students. */
    function essayProgressDenominator(counts, studentCount) {
        const total = Math.max(0, studentCount || 0);
        const exempt = counts && counts.exempt ? counts.exempt : 0;
        return Math.max(0, total - exempt);
    }

    function essayPercentComplete(counts, studentCount) {
        const denom = essayProgressDenominator(counts, studentCount);
        if (denom <= 0) {
            return 0;
        }
        return Math.round(((counts && counts.complete ? counts.complete : 0) / denom) * 100);
    }

    function essayResubmitCount(submission) {
        return countEssayByStatus(submission).resubmit_required;
    }

    function essayResubmitCountForClass(submissions, classId) {
        const cid = normalizeStr(classId);
        let total = 0;
        (Array.isArray(submissions) ? submissions : []).forEach((raw) => {
            const essay = normalizeEssaySubmission(raw);
            if (essay && essay.classId === cid) {
                total += essayResubmitCount(essay);
            }
        });
        return total;
    }

    function isEssaySsOverdueISO(isoDate) {
        const days = daysUntilISO(isoDate);
        return days != null && days < 0;
    }

    function isEssayReceivedStatus(status) {
        return status === 'submitted' || status === 'complete' || status === 'resubmit_required';
    }

    /** Teacher marked submission late (explicit); not the same as checking after the due date. */
    function isEssayReceivedLate(record) {
        if (!record || record.overdueDismissed) {
            return false;
        }
        if (!record.submissionLate) {
            return false;
        }
        return isEssayReceivedStatus(record.status);
    }

    /**
     * Per-student submission overdue: not_submitted past due, or explicitly late received.
     * Cleared when overdueDismissed; received-on-time is never overdue from due date alone.
     */
    function isEssaySubmissionOverdue(record, ssDueDate) {
        if (!record || record.overdueDismissed) {
            return false;
        }
        if (isEssayReceivedLate(record)) {
            return true;
        }
        const status = ESSAY_STATUSES.includes(record.status) ? record.status : 'not_submitted';
        return status === 'not_submitted' && isEssaySsOverdueISO(ssDueDate);
    }

    function essayOverdueNotSubmittedCount(submission, ssDueDate, studentCount, activeStudentIds) {
        const rosterIds = Array.isArray(activeStudentIds)
            ? activeStudentIds.map(normalizeStr).filter(Boolean)
            : null;
        // Prefer current class roster so archived / removed students do not keep OD warnings.
        if (rosterIds) {
            let count = 0;
            rosterIds.forEach((sid) => {
                const rec = getEssayRecordForStudent(submission, sid) || {
                    studentId: sid,
                    status: 'not_submitted',
                    submissionLate: false,
                    overdueDismissed: false
                };
                if (isEssaySubmissionOverdue(rec, ssDueDate)) {
                    count += 1;
                }
            });
            return count;
        }
        if (!submission || !Array.isArray(submission.records)) {
            if (!isEssaySsOverdueISO(ssDueDate)) {
                return 0;
            }
            return Math.max(0, studentCount || 0);
        }
        let count = 0;
        submission.records.forEach((rec) => {
            if (isEssaySubmissionOverdue(rec, ssDueDate)) {
                count += 1;
            }
        });
        return count;
    }

    /**
     * Not submitted and not overdue (and not "overdue cleared"): matches due-cell Awaiting submission.
     */
    function isEssayAwaitingSubmission(record, ssDueDate) {
        const rec = record || {
            status: 'not_submitted',
            submissionLate: false,
            overdueDismissed: false
        };
        const status = ESSAY_STATUSES.includes(rec.status) ? rec.status : 'not_submitted';
        if (status !== 'not_submitted') {
            return false;
        }
        if (isEssaySubmissionOverdue(rec, ssDueDate)) {
            return false;
        }
        if (rec.overdueDismissed && isEssaySsOverdueISO(ssDueDate)) {
            return false;
        }
        return true;
    }

    function essayAwaitingSubmissionCount(submission, ssDueDate, studentCount, activeStudentIds) {
        const rosterIds = Array.isArray(activeStudentIds)
            ? activeStudentIds.map(normalizeStr).filter(Boolean)
            : null;
        if (rosterIds) {
            let count = 0;
            rosterIds.forEach((sid) => {
                const rec = getEssayRecordForStudent(submission, sid) || {
                    studentId: sid,
                    status: 'not_submitted',
                    submissionLate: false,
                    overdueDismissed: false
                };
                if (isEssayAwaitingSubmission(rec, ssDueDate)) {
                    count += 1;
                }
            });
            return count;
        }
        if (!submission || !Array.isArray(submission.records)) {
            if (isEssaySsOverdueISO(ssDueDate)) {
                return 0;
            }
            return Math.max(0, studentCount || 0);
        }
        let count = 0;
        submission.records.forEach((rec) => {
            if (isEssayAwaitingSubmission(rec, ssDueDate)) {
                count += 1;
            }
        });
        return count;
    }

    function essayPendingTeacherEvalCount(submission) {
        return countEssayByStatus(submission).submitted || 0;
    }

    function isEssayTeacherEvalOverdue(submission, teacherEvalDueDate) {
        if (!isEssaySsOverdueISO(teacherEvalDueDate)) {
            return false;
        }
        return essayPendingTeacherEvalCount(submission) > 0;
    }

    function essayAlertCountsForAssignment(submission, ssDueDate, studentCount, activeStudentIds) {
        const rosterIds = Array.isArray(activeStudentIds)
            ? activeStudentIds.map(normalizeStr).filter(Boolean)
            : null;
        const counts = submission
            ? countEssayByStatus(submission)
            : Object.assign(emptyEssayStatusCounts(), {
                not_submitted: Math.max(0, studentCount || 0)
            });
        return {
            rs: counts.resubmit_required || 0,
            od: essayOverdueNotSubmittedCount(
                submission,
                ssDueDate,
                studentCount,
                rosterIds || undefined
            ),
            ae: essayPendingTeacherEvalCount(submission),
            counts
        };
    }

    function essayAlertCountsForClass(submissions, classData, cohorts) {
        if (!classData || !classData.id) {
            return { rs: 0, od: 0, ae: 0 };
        }
        const students = resolveStudentsForClass(classData, cohorts);
        const totalStudents = students.length;
        const activeStudentIds = students
            .map((entry) => entry && entry.student && entry.student.id)
            .filter(Boolean);
        let rs = 0;
        let od = 0;
        let ae = 0;
        getEssayRowsFromSyllabus(classData.syllabusRows).forEach((row) => {
            const syllabusRowId = getSyllabusRowKey(row);
            if (!syllabusRowId) {
                return;
            }
            const submission = findEssaySubmission(submissions, classData.id, syllabusRowId);
            const ssDue =
                submission && submission.ssDueDate ? submission.ssDueDate : row.date || '';
            const alerts = essayAlertCountsForAssignment(
                submission,
                ssDue,
                totalStudents,
                activeStudentIds
            );
            rs += alerts.rs;
            od += alerts.od;
            ae += alerts.ae;
        });
        return { rs, od, ae };
    }

    function formatEssayClassAlertSuffix(counts) {
        const c = counts || {};
        const parts = [];
        if (c.rs > 0) {
            parts.push(`RS:${c.rs}`);
        }
        if (c.od > 0) {
            parts.push(`OD:${c.od}`);
        }
        if (c.ae > 0) {
            parts.push(`AE:${c.ae}`);
        }
        return parts.length ? ` ${parts.join(' ')}` : '';
    }

    function getEssayAssignmentLabel(row) {
        if (!row) {
            return '';
        }
        return `${row.date || ''} — ${row.planTitle || row.planDetail || ''}`.trim();
    }

    function resolveClassTypeLabel(classData, appData) {
        if (!classData) {
            return '';
        }
        const typeId = normalizeStr(classData.classTypeId);
        const editor = global.CCPDefaultClassEditor;
        if (typeId && editor && typeof editor.getById === 'function') {
            const def = editor.getById(typeId, appData);
            if (def && typeof editor.getOptionLabel === 'function') {
                return editor.getOptionLabel(def);
            }
            if (def && def.name) {
                return normalizeStr(def.name);
            }
        }
        if (typeId) {
            const custom = (appData && Array.isArray(appData.customClassTypes) ? appData.customClassTypes : [])
                .find((ct) => ct && ct.id === typeId);
            if (custom && custom.name) {
                return normalizeStr(custom.name);
            }
        }
        return typeId;
    }

    function resolveClassLevelLabel(classData) {
        if (!classData) {
            return '';
        }
        return normalizeStr(classData.levelCustom) || normalizeStr(classData.levelPreset);
    }

    function listEssayAssignmentsForClass(classData, appData) {
        if (!classData || !classData.id) {
            return [];
        }
        const submissions = Array.isArray(appData && appData.essaySubmissions)
            ? appData.essaySubmissions
            : [];
        const cohorts = Array.isArray(appData && appData.cohorts) ? appData.cohorts : [];
        const students = resolveStudentsForClass(classData, cohorts);
        const totalStudents = students.length;
        return getEssayRowsFromSyllabus(classData.syllabusRows).map((row) => {
            const syllabusRowId = getSyllabusRowKey(row);
            const submission = findEssaySubmission(submissions, classData.id, syllabusRowId);
            const ssDue =
                submission && submission.ssDueDate ? submission.ssDueDate : row.date || '';
            const teDue =
                submission && submission.teacherEvalDueDate
                    ? submission.teacherEvalDueDate
                    : ssDue && addDaysISO
                        ? addDaysISO(ssDue, 2)
                        : '';
            const alerts = essayAlertCountsForAssignment(submission, ssDue, totalStudents);
            return {
                key: `${classData.id}|${syllabusRowId}`,
                classId: classData.id,
                syllabusRowId,
                lessonDate: row.date || '',
                assignmentLabel: getEssayAssignmentLabel(row),
                planTitle: normalizeStr(row.planTitle || row.planDetail || ''),
                totalStudents,
                counts: alerts.counts,
                rs: alerts.rs,
                od: alerts.od,
                ssDueDate: ssDue,
                teacherEvalDueDate: teDue,
                ssOverdue: isEssaySsOverdueISO(ssDue),
                percentComplete:
                    totalStudents > 0
                        ? Math.round(((alerts.counts.complete || 0) / totalStudents) * 100)
                        : 0
            };
        });
    }

    function listEssayResubmitRows(appData, options) {
        const opts = options || {};
        const data = appData || {};
        let classes = Array.isArray(opts.classes)
            ? opts.classes
            : Array.isArray(data.classes)
                ? data.classes
                : [];
        const classIdFilter = normalizeStr(opts.classId);
        if (classIdFilter) {
            classes = classes.filter((c) => c && c.id === classIdFilter);
        }
        const submissions = Array.isArray(data.essaySubmissions) ? data.essaySubmissions : [];
        const cohorts = Array.isArray(data.cohorts) ? data.cohorts : [];
        const rows = [];

        classes.forEach((classData) => {
            if (!classData || !classData.id) {
                return;
            }
            const students = resolveStudentsForClass(classData, cohorts);
            const nameMap = new Map();
            students.forEach((entry) => {
                if (entry && entry.student && entry.student.id) {
                    nameMap.set(entry.student.id, String(entry.student.name || entry.student.id).trim());
                }
            });
            const classTypeLabel = resolveClassTypeLabel(classData, data);
            const levelLabel = resolveClassLevelLabel(classData);
            getEssayRowsFromSyllabus(classData.syllabusRows).forEach((row) => {
                const syllabusRowId = getSyllabusRowKey(row);
                if (!syllabusRowId) {
                    return;
                }
                const submission = findEssaySubmission(submissions, classData.id, syllabusRowId);
                if (!submission || !Array.isArray(submission.records)) {
                    return;
                }
                const assignmentLabel = getEssayAssignmentLabel(row);
                submission.records.forEach((rec) => {
                    if (!rec || rec.status !== 'resubmit_required') {
                        return;
                    }
                    const studentId = normalizeStr(rec.studentId);
                    if (!studentId) {
                        return;
                    }
                    rows.push({
                        key: `${classData.id}|${syllabusRowId}|${studentId}`,
                        classId: classData.id,
                        className: classData.name || classData.id,
                        classTypeId: normalizeStr(classData.classTypeId),
                        classTypeLabel,
                        grade: normalizeStr(classData.grade),
                        levelLabel,
                        subject: normalizeStr(classData.subject),
                        syllabusRowId,
                        assignmentLabel,
                        lessonDate: row.date || '',
                        studentId,
                        studentName: nameMap.get(studentId) || studentId,
                        note: normalizeStr(rec.note),
                        submittedRetest: Boolean(rec.submittedRetest)
                    });
                });
            });
        });

        rows.sort((a, b) => {
            const byClass = String(a.className).localeCompare(String(b.className));
            if (byClass !== 0) {
                return byClass;
            }
            const byAssignment = String(a.lessonDate).localeCompare(String(b.lessonDate));
            if (byAssignment !== 0) {
                return byAssignment;
            }
            return String(a.studentName).localeCompare(String(b.studentName));
        });
        return rows;
    }

    function listEssayOutstandingStudentRows(appData, options) {
        const opts = options || {};
        const data = appData || {};
        let classes = Array.isArray(opts.classes)
            ? opts.classes
            : Array.isArray(data.classes)
                ? data.classes
                : [];
        const classIdFilter = normalizeStr(opts.classId);
        if (classIdFilter) {
            classes = classes.filter((c) => c && c.id === classIdFilter);
        }
        const statusFilter = Array.isArray(opts.statuses) && opts.statuses.length
            ? opts.statuses.filter((s) => ESSAY_STATUSES.includes(s))
            : ['not_submitted', 'resubmit_required'];
        const submissions = Array.isArray(data.essaySubmissions) ? data.essaySubmissions : [];
        const cohorts = Array.isArray(data.cohorts) ? data.cohorts : [];
        const rows = [];

        classes.forEach((classData) => {
            if (!classData || !classData.id) {
                return;
            }
            const students = resolveStudentsForClass(classData, cohorts);
            const classTypeLabel = resolveClassTypeLabel(classData, data);
            const levelLabel = resolveClassLevelLabel(classData);
            getEssayRowsFromSyllabus(classData.syllabusRows).forEach((row) => {
                const syllabusRowId = getSyllabusRowKey(row);
                if (!syllabusRowId) {
                    return;
                }
                const submission = findEssaySubmission(submissions, classData.id, syllabusRowId);
                const assignmentLabel = getEssayAssignmentLabel(row);
                const ssDue =
                    submission && submission.ssDueDate
                        ? submission.ssDueDate
                        : row.date || '';
                students.forEach((entry) => {
                    const studentId = entry && entry.student && normalizeStr(entry.student.id);
                    if (!studentId) {
                        return;
                    }
                    const rec = getEssayRecordForStudent(submission, studentId);
                    const status =
                        rec && ESSAY_STATUSES.includes(rec.status) ? rec.status : 'not_submitted';
                    if (!statusFilter.includes(status)) {
                        return;
                    }
                    const recordForOverdue = rec || {
                        studentId,
                        status: 'not_submitted',
                        submissionLate: false,
                        overdueDismissed: false
                    };
                    const receivedLate = isEssayReceivedLate(recordForOverdue);
                    const ssOverdue = isEssaySubmissionOverdue(recordForOverdue, ssDue);
                    rows.push({
                        key: `${classData.id}|${syllabusRowId}|${studentId}`,
                        classId: classData.id,
                        className: classData.name || classData.id,
                        classTypeId: normalizeStr(classData.classTypeId),
                        classTypeLabel,
                        grade: normalizeStr(classData.grade),
                        levelLabel,
                        subject: normalizeStr(classData.subject),
                        syllabusRowId,
                        assignmentLabel,
                        lessonDate: row.date || '',
                        studentId,
                        studentName: String(
                            (entry.student && entry.student.name) || studentId
                        ).trim(),
                        studentNameEn: normalizeStr(
                            entry.student && entry.student.nameEn
                        ),
                        studentTags: Array.isArray(entry.student && entry.student.tags)
                            ? entry.student.tags.slice()
                            : [],
                        status,
                        note: rec ? normalizeStr(rec.note) : '',
                        submittedRetest: rec ? Boolean(rec.submittedRetest) : false,
                        submissionLate: rec ? Boolean(rec.submissionLate) : false,
                        overdueDismissed: rec ? Boolean(rec.overdueDismissed) : false,
                        ssDueDate: ssDue,
                        ssOverdue,
                        ssOverdueKind: receivedLate
                            ? 'received_late'
                            : ssOverdue
                                ? 'not_submitted'
                                : ''
                    });
                });
            });
        });

        rows.sort((a, b) => {
            const byClass = String(a.className).localeCompare(String(b.className));
            if (byClass !== 0) {
                return byClass;
            }
            const byAssignment = String(a.lessonDate).localeCompare(String(b.lessonDate));
            if (byAssignment !== 0) {
                return byAssignment;
            }
            return String(a.studentName).localeCompare(String(b.studentName));
        });
        return rows;
    }

    /**
     * Full roster rows for class summary sheets (every status, including complete / exempt).
     * @param {object} appData
     * @param {object} [options] — same filters as listEssayOutstandingStudentRows; statuses default to all.
     */
    function listEssayClassSummaryRows(appData, options) {
        const opts = Object.assign({}, options || {}, {
            statuses: ESSAY_STATUSES.slice()
        });
        return listEssayOutstandingStudentRows(appData, opts);
    }

    function groupEssayStudentRowsByClass(rows) {
        const groups = new Map();
        (rows || []).forEach((row) => {
            if (!row || !row.classId) {
                return;
            }
            if (!groups.has(row.classId)) {
                groups.set(row.classId, {
                    classId: row.classId,
                    className: row.className || row.classId,
                    classTypeLabel: row.classTypeLabel || '',
                    levelLabel: row.levelLabel || '',
                    assignments: new Map()
                });
            }
            const group = groups.get(row.classId);
            const assignKey = row.syllabusRowId || row.assignmentLabel || '';
            if (!group.assignments.has(assignKey)) {
                group.assignments.set(assignKey, {
                    syllabusRowId: row.syllabusRowId,
                    assignmentLabel: row.assignmentLabel || '',
                    lessonDate: row.lessonDate || '',
                    students: []
                });
            }
            group.assignments.get(assignKey).students.push(row);
        });
        return Array.from(groups.values()).map((group) => ({
            classId: group.classId,
            className: group.className,
            classTypeLabel: group.classTypeLabel,
            levelLabel: group.levelLabel,
            assignments: Array.from(group.assignments.values()).sort((a, b) =>
                String(a.lessonDate).localeCompare(String(b.lessonDate))
            )
        }));
    }

    function daysUntilISO(dateStr) {
        const due = normalizeStr(dateStr);
        if (!due) {
            return null;
        }
        const today = todayISO();
        const tParts = today.split('-').map(Number);
        const dParts = due.split('-').map(Number);
        const tMs = Date.UTC(tParts[0], tParts[1] - 1, tParts[2]);
        const dMs = Date.UTC(dParts[0], dParts[1] - 1, dParts[2]);
        return Math.round((dMs - tMs) / 86400000);
    }

    /** YYYY-MM prefix for calendar-month comparisons. */
    function yearMonthKey(dateStr) {
        const s = normalizeStr(dateStr);
        return s.length >= 7 ? s.slice(0, 7) : '';
    }

    function sameCalendarMonth(a, b) {
        const ma = yearMonthKey(a);
        const mb = yearMonthKey(b);
        return Boolean(ma && mb && ma === mb);
    }

    /**
     * Prefer an essay in refDate's calendar month (nearest on/after ref, else latest past
     * in that month). If none, first essay on/after ref, else last essay.
     */
    function pickDefaultEssaySyllabusRow(classData, refDate) {
        const rows = getEssayRowsFromSyllabus(classData && classData.syllabusRows);
        if (!rows.length) {
            return null;
        }
        const ref = normalizeStr(refDate) || todayISO();
        const monthRows = rows
            .filter((row) => sameCalendarMonth(row && row.date, ref))
            .slice()
            .sort((a, b) => compareDateStr(a.date, b.date));
        if (monthRows.length) {
            for (let i = 0; i < monthRows.length; i += 1) {
                if (compareDateStr(monthRows[i].date, ref) >= 0) {
                    return monthRows[i];
                }
            }
            return monthRows[monthRows.length - 1];
        }
        const sorted = rows.slice().sort((a, b) => compareDateStr(a.date, b.date));
        for (let i = 0; i < sorted.length; i += 1) {
            if (compareDateStr(sorted[i].date, ref) >= 0) {
                return sorted[i];
            }
        }
        return sorted[sorted.length - 1];
    }

    function isDebateDayFourTitle(title) {
        const text = normalizeStr(title).toLowerCase();
        if (!text) {
            return false;
        }
        return /\bday\s*4\b/.test(text);
    }

    function isDebateTeamAssignmentRow(row) {
        if (!row || !isEssayTrackableSyllabusRow(row)) {
            return false;
        }
        const sessionNum = Number(row.sessionNumber || row.lessonNumber || 0);
        if (sessionNum === 4) {
            return true;
        }
        return isDebateDayFourTitle(row.planTitle || row.label || '');
    }

    function getDebateTeamRowsFromSyllabus(rows) {
        const lessons = getLessonRowsFromSyllabus(rows);
        return lessons.filter(isDebateTeamAssignmentRow);
    }

    function getDebateTeamAssignmentLabel(rowOrLesson) {
        if (!rowOrLesson) {
            return '';
        }
        const date = normalizeStr(rowOrLesson.date);
        const title = normalizeStr(
            rowOrLesson.planTitle || rowOrLesson.label || rowOrLesson.planDetail || 'Day 4'
        );
        return `${date} — ${title}`.trim();
    }

    function isDebateTeamScheduledLesson(lesson) {
        if (!lesson || !normalizeStr(lesson.date)) {
            return false;
        }
        const group = lesson.group;
        if (group && Array.isArray(group.days) && group.days.map(Number).includes(4)) {
            return true;
        }
        return isDebateDayFourTitle(lesson.label || '');
    }

    function classUsesDebateTeamAssignments(classData) {
        if (!classData) {
            return false;
        }
        return normalizeStr(classData.scheduleModel) === 'debateMonthly';
    }

    function listDebateTeamAssignmentsForClass(classData, options) {
        if (!classData || !classData.id) {
            return [];
        }
        const opts = options || {};
        const seenDates = new Set();
        const out = [];

        function pushAssignment(date, planTitle, syllabusRowId, labelSource) {
            const dateStr = normalizeStr(date);
            if (!dateStr || seenDates.has(dateStr)) {
                return;
            }
            seenDates.add(dateStr);
            out.push({
                key: `${classData.id}|${dateStr}`,
                classId: classData.id,
                date: dateStr,
                syllabusRowId: normalizeStr(syllabusRowId),
                assignmentLabel: getDebateTeamAssignmentLabel(labelSource || { date: dateStr, planTitle }),
                planTitle: normalizeStr(planTitle) || 'Day 4'
            });
        }

        getDebateTeamRowsFromSyllabus(classData.syllabusRows).forEach((row) => {
            pushAssignment(
                row.date,
                row.planTitle || row.planDetail || 'Day 4',
                getSyllabusRowKey(row),
                row
            );
        });

        if (!out.length) {
            const lessons = Array.isArray(opts.scheduledLessons) ? opts.scheduledLessons : [];
            lessons.filter(isDebateTeamScheduledLesson).forEach((lesson) => {
                pushAssignment(
                    lesson.date,
                    lesson.label || 'Day 4',
                    '',
                    { date: lesson.date, planTitle: lesson.label || 'Day 4' }
                );
            });
        }

        out.sort((a, b) => compareDateStr(a.date, b.date));
        return out;
    }

    function pickDefaultDebateTeamDate(classData, refDate, options) {
        const assignments = listDebateTeamAssignmentsForClass(classData, options);
        if (!assignments.length) {
            return null;
        }
        const ref = normalizeStr(refDate) || todayISO();
        for (let i = 0; i < assignments.length; i += 1) {
            if (compareDateStr(assignments[i].date, ref) >= 0) {
                return assignments[i].date;
            }
        }
        return assignments[assignments.length - 1].date;
    }

    function getLessonRowsFromSyllabus(rows) {
        if (global.CCPHomeworkTab && global.CCPHomeworkTab.getLessonRowsFromSyllabus) {
            return global.CCPHomeworkTab.getLessonRowsFromSyllabus(rows);
        }
        return (rows || [])
            .filter((r) => r && r.kind === 'lesson' && r.date)
            .sort((a, b) => compareDateStr(a.date, b.date));
    }

    function getSyllabusRowKey(row) {
        if (!row) {
            return '';
        }
        const id = normalizeStr(row.id);
        if (id) {
            return id;
        }
        return `${normalizeStr(row.date)}|${row.sessionNumber || 0}|${normalizeStr(row.planTitle)}`;
    }

    function pickDefaultSyllabusRow(classData, refDate) {
        const rows = getLessonRowsFromSyllabus(classData && classData.syllabusRows);
        if (!rows.length) {
            return null;
        }
        const ref = normalizeStr(refDate) || todayISO();
        if (global.CCPHomeworkTab && global.CCPHomeworkTab.findTargetLessonIndex) {
            const idx = global.CCPHomeworkTab.findTargetLessonIndex(rows, ref);
            if (idx >= 0 && idx < rows.length) {
                return rows[idx];
            }
        }
        for (let i = 0; i < rows.length; i += 1) {
            if (compareDateStr(rows[i].date, ref) >= 0) {
                return rows[i];
            }
        }
        return rows[rows.length - 1];
    }

    function normalizePointEntry(raw) {
        if (!raw || !raw.id || !raw.classId || !raw.studentId) {
            return null;
        }
        const delta = Number(raw.delta);
        if (!Number.isFinite(delta) || delta === 0) {
            return null;
        }
        return {
            id: normalizeStr(raw.id),
            classId: normalizeStr(raw.classId),
            studentId: normalizeStr(raw.studentId),
            date: normalizeStr(raw.date) || todayISO(),
            delta: Math.round(delta),
            reason: normalizeStr(raw.reason),
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function listPointsForClass(points, classId) {
        const cid = normalizeStr(classId);
        return (Array.isArray(points) ? points : [])
            .map(normalizePointEntry)
            .filter(Boolean)
            .filter((p) => p.classId === cid)
            .sort((a, b) => compareDateStr(b.date, a.date) || b.updatedAt.localeCompare(a.updatedAt));
    }

    function sumPointsForStudent(points, classId, studentId) {
        const sid = normalizeStr(studentId);
        const cid = normalizeStr(classId);
        let total = 0;
        (Array.isArray(points) ? points : []).forEach((raw) => {
            const p = normalizePointEntry(raw);
            if (p && p.classId === cid && p.studentId === sid) {
                total += p.delta;
            }
        });
        return total;
    }

    function appendPointEntry(points, entry) {
        const normalized = normalizePointEntry(entry);
        if (!normalized) {
            return Array.isArray(points) ? points.slice() : [];
        }
        const list = Array.isArray(points) ? points.filter(Boolean).slice() : [];
        list.push(normalized);
        return list;
    }

    function appendPointEntries(points, entries) {
        let list = Array.isArray(points) ? points.filter(Boolean).slice() : [];
        (Array.isArray(entries) ? entries : []).forEach((raw) => {
            list = appendPointEntry(list, raw);
        });
        return list;
    }

    function studentTestKey(classId, testName, testDate) {
        return `${normalizeStr(classId)}|${normalizeStr(testName)}|${normalizeStr(testDate)}`;
    }

    function normalizeTestRecord(raw) {
        if (!raw || !raw.studentId) {
            return null;
        }
        const score = raw.score == null || raw.score === '' ? null : Number(raw.score);
        const maxScore = raw.maxScore == null || raw.maxScore === '' ? null : Number(raw.maxScore);
        return {
            studentId: normalizeStr(raw.studentId),
            score: Number.isFinite(score) ? score : null,
            maxScore: Number.isFinite(maxScore) ? maxScore : null,
            note: normalizeStr(raw.note)
        };
    }

    function normalizeStudentTest(raw) {
        if (!raw || !raw.id || !raw.classId) {
            return null;
        }
        const testName = normalizeStr(raw.testName);
        const testDate = normalizeStr(raw.testDate);
        if (!testName || !testDate) {
            return null;
        }
        const records = Array.isArray(raw.records)
            ? raw.records.map(normalizeTestRecord).filter(Boolean)
            : [];
        return {
            id: normalizeStr(raw.id),
            classId: normalizeStr(raw.classId),
            testName,
            testDate,
            records,
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function findStudentTest(tests, classId, testName, testDate) {
        const list = Array.isArray(tests) ? tests : [];
        const key = studentTestKey(classId, testName, testDate);
        return (
            list.find((t) => t && studentTestKey(t.classId, t.testName, t.testDate) === key) || null
        );
    }

    function upsertStudentTest(tests, entry) {
        const normalized = normalizeStudentTest(entry);
        if (!normalized) {
            return Array.isArray(tests) ? tests.slice() : [];
        }
        const list = Array.isArray(tests) ? tests.filter(Boolean).slice() : [];
        const key = studentTestKey(normalized.classId, normalized.testName, normalized.testDate);
        const idx = list.findIndex(
            (t) => t && studentTestKey(t.classId, t.testName, t.testDate) === key
        );
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], normalized, { id: list[idx].id || normalized.id });
        } else {
            list.push(normalized);
        }
        return list;
    }

    function getTestRecordForStudent(test, studentId) {
        if (!test || !Array.isArray(test.records)) {
            return null;
        }
        const sid = normalizeStr(studentId);
        return test.records.find((r) => r.studentId === sid) || null;
    }

    function listTestsForClass(tests, classId) {
        const cid = normalizeStr(classId);
        return (Array.isArray(tests) ? tests : [])
            .map(normalizeStudentTest)
            .filter(Boolean)
            .filter((t) => t.classId === cid)
            .sort((a, b) => compareDateStr(b.testDate, a.testDate) || a.testName.localeCompare(b.testName));
    }

    function debateTeamSessionKey(classId, date) {
        return `${normalizeStr(classId)}|${normalizeStr(date)}`;
    }

    const DEBATE_SCORE_CRITERIA = {
        garam: ['eyeContact', 'voice', 'fluency', 'content', 'logic', 'confidence'],
        yeoul: ['eyeContact', 'voice', 'fluency', 'confidence']
    };

    const DEBATE_SCORE_MAX = 5;

    function normalizeDebateSheetTemplate(raw) {
        return normalizeStr(raw) === 'yeoul' ? 'yeoul' : 'garam';
    }

    function normalizeDebateScoreValue(raw) {
        if (raw == null || raw === '') {
            return null;
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) {
            return null;
        }
        // Snap to nearest 0.5, then clamp 0–5.
        const snapped = Math.round(n * 2) / 2;
        return Math.max(0, Math.min(DEBATE_SCORE_MAX, snapped));
    }

    function emptyDebateScoresObject() {
        return {
            eyeContact: null,
            voice: null,
            fluency: null,
            content: null,
            logic: null,
            confidence: null
        };
    }

    function computeDebateScoreTotal(scores, sheetTemplate) {
        const tpl = normalizeDebateSheetTemplate(sheetTemplate);
        const keys = DEBATE_SCORE_CRITERIA[tpl] || DEBATE_SCORE_CRITERIA.garam;
        const src = scores && typeof scores === 'object' ? scores : {};
        let sum = 0;
        let any = false;
        keys.forEach((key) => {
            const v = normalizeDebateScoreValue(src[key]);
            if (v != null) {
                sum += v;
                any = true;
            }
        });
        return any ? Math.round(sum * 10) / 10 : null;
    }

    function normalizeDebateScoreRecord(raw, sheetTemplate) {
        if (!raw || !raw.studentId) {
            return null;
        }
        const tpl = normalizeDebateSheetTemplate(sheetTemplate);
        const srcScores = raw.scores && typeof raw.scores === 'object' ? raw.scores : {};
        const scores = emptyDebateScoresObject();
        Object.keys(scores).forEach((key) => {
            scores[key] = normalizeDebateScoreValue(srcScores[key]);
        });
        const debateNumberRaw = raw.debateNumber;
        const debateNumber =
            debateNumberRaw == null || debateNumberRaw === ''
                ? null
                : Number(debateNumberRaw);
        return {
            studentId: normalizeStr(raw.studentId),
            roleAbbr: normalizeStr(raw.roleAbbr),
            roleName: normalizeStr(raw.roleName),
            debateNumber: Number.isFinite(debateNumber) ? debateNumber : null,
            bench: normalizeStr(raw.bench),
            scores,
            total: computeDebateScoreTotal(scores, tpl),
            note: normalizeStr(raw.note)
        };
    }

    function normalizeDebateScoreSession(raw) {
        if (!raw || !raw.id || !raw.classId) {
            return null;
        }
        const date = normalizeStr(raw.date);
        if (!date) {
            return null;
        }
        const sheetTemplate = normalizeDebateSheetTemplate(raw.sheetTemplate);
        const records = Array.isArray(raw.records)
            ? raw.records.map((r) => normalizeDebateScoreRecord(r, sheetTemplate)).filter(Boolean)
            : [];
        return {
            id: normalizeStr(raw.id),
            classId: normalizeStr(raw.classId),
            date,
            sheetTemplate,
            sessionId: normalizeStr(raw.sessionId) || null,
            records,
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function findDebateScoreSession(sessions, classId, date) {
        const list = Array.isArray(sessions) ? sessions : [];
        const key = debateTeamSessionKey(classId, date);
        return list.find((s) => s && debateTeamSessionKey(s.classId, s.date) === key) || null;
    }

    function upsertDebateScoreSession(sessions, entry) {
        const normalized = normalizeDebateScoreSession(entry);
        if (!normalized) {
            return Array.isArray(sessions) ? sessions.slice() : [];
        }
        const list = Array.isArray(sessions) ? sessions.filter(Boolean).slice() : [];
        const key = debateTeamSessionKey(normalized.classId, normalized.date);
        const idx = list.findIndex((s) => s && debateTeamSessionKey(s.classId, s.date) === key);
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], normalized, { id: list[idx].id || normalized.id });
        } else {
            list.push(normalized);
        }
        return list;
    }

    function getDebateScoreCriteria(sheetTemplate) {
        const tpl = normalizeDebateSheetTemplate(sheetTemplate);
        return (DEBATE_SCORE_CRITERIA[tpl] || DEBATE_SCORE_CRITERIA.garam).slice();
    }

    function getDebateScoreMaxTotal(sheetTemplate) {
        return normalizeDebateSheetTemplate(sheetTemplate) === 'yeoul' ? 20 : 30;
    }

    function normalizeDebateCustomFormat(raw) {
        if (!raw || !raw.id) {
            return null;
        }
        const govRoles = Array.isArray(raw.govRoles) ? raw.govRoles.filter(Boolean) : [];
        const oppRoles = Array.isArray(raw.oppRoles) ? raw.oppRoles.filter(Boolean) : [];
        return {
            id: normalizeStr(raw.id),
            name: normalizeStr(raw.name) || 'Custom Format',
            govName: normalizeStr(raw.govName) || 'Government',
            oppName: normalizeStr(raw.oppName) || 'Opposition',
            govRoles,
            oppRoles,
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function normalizeDebateTeamSession(raw) {
        if (!raw || !raw.id || !raw.classId) {
            return null;
        }
        const date = normalizeStr(raw.date);
        if (!date) {
            return null;
        }
        return {
            id: normalizeStr(raw.id),
            classId: normalizeStr(raw.classId),
            date,
            sessionState: raw.sessionState && typeof raw.sessionState === 'object' ? raw.sessionState : null,
            studentIds: Array.isArray(raw.studentIds)
                ? raw.studentIds.map((id) => normalizeStr(id)).filter(Boolean)
                : [],
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function findDebateTeamSession(sessions, classId, date) {
        const list = Array.isArray(sessions) ? sessions : [];
        const key = debateTeamSessionKey(classId, date);
        return list.find((s) => s && debateTeamSessionKey(s.classId, s.date) === key) || null;
    }

    function upsertDebateTeamSession(sessions, entry) {
        const normalized = normalizeDebateTeamSession(entry);
        if (!normalized) {
            return Array.isArray(sessions) ? sessions.slice() : [];
        }
        const list = Array.isArray(sessions) ? sessions.filter(Boolean).slice() : [];
        const key = debateTeamSessionKey(normalized.classId, normalized.date);
        const idx = list.findIndex((s) => s && debateTeamSessionKey(s.classId, s.date) === key);
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], normalized, { id: list[idx].id || normalized.id });
        } else {
            list.push(normalized);
        }
        return list;
    }

    const SPEAKING_TEST_SORT_MODES = new Set(['alphabetical', 'pasteOrder', 'entryOrder']);
    const SPEAKING_TEST_GRADES = new Set(['A', 'B', 'C', 'D']);
    const SPEAKING_TEST_RUBRIC_KEYS = ['pronunciation', 'speed', 'intonation', 'grammar', 'content'];

    function normalizeSpeakingTestSortMode(raw) {
        const mode = normalizeStr(raw);
        return SPEAKING_TEST_SORT_MODES.has(mode) ? mode : 'alphabetical';
    }

    function normalizeSpeakingTestGrade(raw) {
        const g = normalizeStr(raw).toUpperCase();
        return SPEAKING_TEST_GRADES.has(g) ? g : 'A';
    }

    function normalizeSpeakingTestQuestion(raw) {
        const src = raw && typeof raw === 'object' ? raw : {};
        const out = {};
        SPEAKING_TEST_RUBRIC_KEYS.forEach((key) => {
            out[key] = normalizeSpeakingTestGrade(src[key]);
        });
        out.note = normalizeStr(src.note);
        return out;
    }

    function normalizeSpeakingTestAssignment(raw) {
        if (!raw || !raw.id) {
            return null;
        }
        const title = normalizeStr(raw.title);
        const date = normalizeStr(raw.date);
        if (!title || !date) {
            return null;
        }
        return {
            id: normalizeStr(raw.id),
            title,
            date
        };
    }

    function normalizeSpeakingTestScores(raw) {
        const out = {};
        if (!raw || typeof raw !== 'object') {
            return out;
        }
        Object.keys(raw).forEach((studentId) => {
            const sid = normalizeStr(studentId);
            if (!sid) {
                return;
            }
            const byAssignment = raw[studentId];
            if (!byAssignment || typeof byAssignment !== 'object') {
                return;
            }
            const studentScores = {};
            Object.keys(byAssignment).forEach((assignmentId) => {
                const aid = normalizeStr(assignmentId);
                if (!aid) {
                    return;
                }
                const questions = Array.isArray(byAssignment[assignmentId])
                    ? byAssignment[assignmentId].map(normalizeSpeakingTestQuestion)
                    : [];
                studentScores[aid] = questions;
            });
            out[sid] = studentScores;
        });
        return out;
    }

    function normalizeSpeakingTestRecord(raw) {
        if (!raw || !raw.id || !raw.classId) {
            return null;
        }
        const settingsRaw = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
        const assignments = Array.isArray(raw.assignments)
            ? raw.assignments.map(normalizeSpeakingTestAssignment).filter(Boolean)
            : [];
        return {
            id: normalizeStr(raw.id),
            classId: normalizeStr(raw.classId),
            settings: {
                studentSortMode: normalizeSpeakingTestSortMode(settingsRaw.studentSortMode)
            },
            assignments,
            scores: normalizeSpeakingTestScores(raw.scores),
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function findSpeakingTestRecord(records, classId) {
        const list = Array.isArray(records) ? records : [];
        const cid = normalizeStr(classId);
        return list.find((r) => r && normalizeStr(r.classId) === cid) || null;
    }

    function upsertSpeakingTestRecord(records, entry) {
        const normalized = normalizeSpeakingTestRecord(entry);
        if (!normalized) {
            return Array.isArray(records) ? records.slice() : [];
        }
        const list = Array.isArray(records) ? records.filter(Boolean).slice() : [];
        const cid = normalized.classId;
        const idx = list.findIndex((r) => r && normalizeStr(r.classId) === cid);
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], normalized, { id: list[idx].id || normalized.id });
        } else {
            list.push(normalized);
        }
        return list;
    }

    function migrateClassroomData(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }
        let migrated = false;
        if (!Array.isArray(data.attendanceSessions)) {
            data.attendanceSessions = [];
            migrated = true;
        }
        if (!Array.isArray(data.homeworkCompletions)) {
            data.homeworkCompletions = [];
            migrated = true;
        }
        if (!Array.isArray(data.essaySubmissions)) {
            data.essaySubmissions = [];
            migrated = true;
        }
        if (!Array.isArray(data.studentPoints)) {
            data.studentPoints = [];
            migrated = true;
        }
        if (!Array.isArray(data.studentTests)) {
            data.studentTests = [];
            migrated = true;
        }
        if (!Array.isArray(data.debateTeamSessions)) {
            data.debateTeamSessions = [];
            migrated = true;
        }
        if (!Array.isArray(data.debateScores)) {
            data.debateScores = [];
            migrated = true;
        }
        if (!Array.isArray(data.debateCustomFormats)) {
            data.debateCustomFormats = [];
            migrated = true;
        }
        if (!Array.isArray(data.speakingTestRecords)) {
            data.speakingTestRecords = [];
            migrated = true;
        }
        if (!Array.isArray(data.portfolioRecordings)) {
            data.portfolioRecordings = [];
            migrated = true;
        }
        if (!Array.isArray(data.portfolioEntries)) {
            data.portfolioEntries = [];
            migrated = true;
        }
        if (!Array.isArray(data.smsLog)) {
            data.smsLog = [];
            migrated = true;
        }
        if (Array.isArray(data.cohorts)) {
            data.cohorts.forEach((cohort) => {
                if (!cohort || typeof cohort !== 'object') {
                    return;
                }
                if (!Array.isArray(cohort.students)) {
                    cohort.students = [];
                    migrated = true;
                }
            });
            const ensured = ensureArchiveCohort(data.cohorts);
            if (ensured.created) {
                data.cohorts = ensured.cohorts;
                migrated = true;
            }
        }
        if (!data.ui || typeof data.ui !== 'object') {
            data.ui = {};
        }
        if (!Number.isFinite(data.ui.studentArchiveRetentionDays)) {
            data.ui.studentArchiveRetentionDays = DEFAULT_ARCHIVE_RETENTION_DAYS;
            migrated = true;
        }
        return migrated;
    }

    function newId(prefix) {
        if (global.CCPUtils && global.CCPUtils.newId) {
            return global.CCPUtils.newId(prefix);
        }
        return `${prefix || 'id'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    }

    const api = {
        ATTENDANCE_STATUSES,
        HOMEWORK_GRADES,
        HOMEWORK_SELF_CHECKS,
        ESSAY_STATUSES,
        STUDENT_TAGS,
        OFF_ROSTER_TAG,
        ARCHIVE_REASONS,
        ARCHIVE_COHORT_ID,
        DEFAULT_ARCHIVE_RETENTION_DAYS,
        koreanNameKey,
        koreanMatchKey,
        koreanNameDisplayKey,
        nameDisambiguatorSuffix,
        nameStatusSymbolSuffix,
        nameLatinDisambiguatorSuffix,
        hangulCoreKey,
        hasNameDisambiguator,
        hasLatinNameDisambiguator,
        hangulSyllables,
        hangulNameVariantPair,
        shareThreeHangulSyllables,
        pairFuzzyRosterMatches,
        listUnclearTmsStudentMatches,
        listReverseTmsStudentMatches,
        normalizeTmsStudentResolutions,
        mergeTmsStudentResolutions,
        normalizeTmsReverseResolutions,
        mergeTmsReverseResolutions,
        applyRememberedTmsStudentResolutions,
        applyRememberedTmsReverseResolutions,
        withStudentTag,
        withoutStudentTag,
        mergeRosterByKoreanName,
        applyTmsRosterPlan,
        normalizeTmsClassKey,
        normalizeTmsRosterLinks,
        resolveTmsRosterLink,
        upsertTmsRosterLinks,
        isArchiveCohort,
        findArchiveCohort,
        ensureArchiveCohort,
        findStudentCohort,
        archiveStudent,
        archiveStudents,
        updateStudentsInCohort,
        restoreStudentFromArchive,
        moveStudentsBetweenCohorts,
        deleteStudentPermanently,
        purgeStudentRecords,
        isPastArchiveRetention,
        listStudentsPastRetention,
        normalizeStr,
        compareDateStr,
        todayISO,
        addDaysISO,
        getCohortIdsForClass,
        normalizeStudent,
        compareStudentNames,
        normalizeCohortStudents,
        resolveStudentsForClass,
        findStudentInCohorts,
        attendanceSessionKey,
        normalizeAttendanceSession,
        findAttendanceSession,
        upsertAttendanceSession,
        getAttendanceRecordForStudent,
        countAttendanceStatuses,
        countRecentAbsences,
        normalizeHomeworkCompletion,
        findHomeworkCompletion,
        upsertHomeworkCompletion,
        getHomeworkRecordForStudent,
        normalizeEssaySubmission,
        findEssaySubmission,
        upsertEssaySubmission,
        getEssayRecordForStudent,
        ensureEssayRecordsForStudents,
        countEssayByStatus,
        emptyEssayStatusCounts,
        essayProgressDenominator,
        essayPercentComplete,
        essayResubmitCount,
        essayResubmitCountForClass,
        isEssaySsOverdueISO,
        isEssayReceivedStatus,
        isEssayReceivedLate,
        isEssaySubmissionOverdue,
        isEssayAwaitingSubmission,
        isEssaySyllabusRow,
        isEssayAssignmentRow,
        essayOverdueNotSubmittedCount,
        essayAwaitingSubmissionCount,
        essayPendingTeacherEvalCount,
        isEssayTeacherEvalOverdue,
        reparseEssayFlagsForClass,
        createCustomEssayAssignment,
        pruneOrphanEssaySubmissions,
        essayAlertCountsForAssignment,
        essayAlertCountsForClass,
        formatEssayClassAlertSuffix,
        getEssayAssignmentLabel,
        resolveClassTypeLabel,
        resolveClassLevelLabel,
        listEssayAssignmentsForClass,
        listEssayResubmitRows,
        listEssayOutstandingStudentRows,
        listEssayClassSummaryRows,
        groupEssayStudentRowsByClass,
        daysUntilISO,
        yearMonthKey,
        sameCalendarMonth,
        getEssayRowsFromSyllabus,
        pickDefaultEssaySyllabusRow,
        isDebateDayFourTitle,
        isDebateTeamAssignmentRow,
        getDebateTeamRowsFromSyllabus,
        getDebateTeamAssignmentLabel,
        isDebateTeamScheduledLesson,
        classUsesDebateTeamAssignments,
        listDebateTeamAssignmentsForClass,
        pickDefaultDebateTeamDate,
        getLessonRowsFromSyllabus,
        getSyllabusRowKey,
        pickDefaultSyllabusRow,
        normalizePointEntry,
        listPointsForClass,
        sumPointsForStudent,
        appendPointEntry,
        appendPointEntries,
        normalizeStudentTest,
        findStudentTest,
        upsertStudentTest,
        getTestRecordForStudent,
        listTestsForClass,
        studentTestKey,
        normalizeDebateTeamSession,
        normalizeDebateCustomFormat,
        findDebateTeamSession,
        upsertDebateTeamSession,
        debateTeamSessionKey,
        normalizeSpeakingTestRecord,
        findSpeakingTestRecord,
        upsertSpeakingTestRecord,
        normalizeSpeakingTestSortMode,
        DEBATE_SCORE_CRITERIA,
        DEBATE_SCORE_MAX,
        normalizeDebateSheetTemplate,
        normalizeDebateScoreValue,
        emptyDebateScoresObject,
        computeDebateScoreTotal,
        normalizeDebateScoreRecord,
        normalizeDebateScoreSession,
        findDebateScoreSession,
        upsertDebateScoreSession,
        getDebateScoreCriteria,
        getDebateScoreMaxTotal,
        migrateClassroomData,
        newId
    };

    global.CCPClassroomDomain = api;
})(typeof window !== 'undefined' ? window : globalThis);
