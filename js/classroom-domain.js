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
    const DEBATE_BOOK_STATUSES = ['not_issued', 'issued', 'missing'];
    const DEBATE_BOOK_TERM_PERIOD_KEY = 'term';
    const DEBATE_BOOK_MONTH_NAMES_EN = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec'
    ];
    const STUDENT_TAGS = ['interested', 'new', 'ending_soon', 'starting_soon', 'off_roster', 'shuttle', 'transfer_in'];
    const OFF_ROSTER_TAG = 'off_roster';
    const SYNC_MANAGED_STUDENT_TAGS = ['new', 'shuttle', 'transfer_in'];
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
            expectedStartDate: normalizeStr(raw.expectedStartDate),
            tmsMpidx: normalizeStr(raw.tmsMpidx || raw.mpidx)
        };
    }

    /** Status marks pasted from TMS (transfer / new / shuttle / etc.) — not identity. */
    const NAME_TRANSFER_SYMBOL_RE = /[◆◇♦♢⬥⬦◈]/;
    const NAME_NEW_SYMBOL_RE = /[★☆✦✧]/;
    const NAME_STATUS_SYMBOL_RE = /[◆◇♦♢⬥⬦◈＊★☆✦✧●○■□▲△▼▽※]/g;
    const NAME_IDENTITY_SUFFIX_RE = /^([\uac00-\ud7a3]{2,6})([A-D]?)(S?)([◆◇♦♢⬥⬦◈＊★☆✦✧●○■□▲△▼▽※]*)$/u;

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
        // Separators often pasted from TMS / SMS
        s = s.replace(/[·•ㆍ\-–—_./]/g, '');
        // Fullwidth ASCII → halfwidth (Hangul syllables / geometric marks unchanged)
        s = s.replace(/[\uFF01-\uFF5E]/g, (ch) =>
            String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
        );
        // TMS roster often formats Korean as "Name(English)" or "Name()".
        // Identity matching should ignore that parenthesized suffix.
        s = s.replace(/\([^)]*\)/g, '');
        s = s.replace(/（[^）]*）/g, '');
        // TMS roster sometimes formats Korean as "Name[]" or "Name[English]".
        // Ignore bracketed suffix content for identity matching.
        s = s.replace(/\[[^\]]*\]/g, '');
        s = s.replace(/［[^］]*］/g, '');
        // Some TMS roster layouts append a trailing label like "...[] 학생".
        // After removing brackets/whitespace, this becomes "...학생" and would
        // otherwise pollute the identity match key.
        s = s.replace(/학생$/u, '');
        return s;
    }

    /**
     * Identity key for TMS roster/essay matching.
     * Strips status symbols and digits; keeps Hangul + Latin letters so 김민수A ≠ 김민수.
     * 권이안◆ and 권이안 share the same match key.
     */
    function koreanMatchKey(name) {
        const parsed = parseKoreanNameMarks(name);
        if (parsed.identityKey) {
            return parsed.identityKey;
        }
        let s = koreanNameDisplayKey(name);
        s = s.replace(NAME_STATUS_SYMBOL_RE, '');
        s = s.replace(/[0-9]/g, '');
        s = s.replace(/[^\uac00-\ud7a3A-Za-z]/g, '');
        return s;
    }

    /**
     * @deprecated Prefer koreanMatchKey for identity matching.
     * Alias of koreanMatchKey (symbols ignored for match).
     */
    function koreanNameKey(name) {
        return koreanMatchKey(name);
    }

    function koreanMarkAgnosticKey(name) {
        return koreanMatchKey(name);
    }

    function parseKoreanNameMarks(name) {
        const displayKey = koreanNameDisplayKey(name);
        const match = displayKey.match(NAME_IDENTITY_SUFFIX_RE);
        if (!match) {
            return {
                displayKey,
                identityKey: '',
                identityLetter: '',
                shuttle: false,
                isNew: false,
                transferIn: false,
                statusSuffix: '',
                symbolSuffix: ''
            };
        }
        const hangul = match[1] || '';
        const identityLetter = match[2] || '';
        const shuttle = match[3] === 'S';
        const symbolSuffix = match[4] || '';
        return {
            displayKey,
            identityKey: `${hangul}${identityLetter}`,
            identityLetter,
            shuttle,
            isNew: NAME_NEW_SYMBOL_RE.test(symbolSuffix),
            transferIn: NAME_TRANSFER_SYMBOL_RE.test(symbolSuffix),
            statusSuffix: `${shuttle ? 'S' : ''}${symbolSuffix}`,
            symbolSuffix
        };
    }

    /**
     * Exact TMS / roster UI status labels — never person names.
     * Exact-token only (never startsWith / prefix). Real names like 신규학, 신규생, 신선우 must pass.
     * 신규 and 신규학생 are the same status phrase ("New student"); both are listed as exact forms.
     */
    const ROSTER_STATUS_NOISE_NAMES = new Set([
        '신규',
        '신규학생',
        '관심',
        '종료예정',
        '전체선택',
        '학생'
    ]);

    function isRosterStatusNoiseName(name) {
        // Exact forms only — do not treat 신규학 / 신규생 as noise via prefix matching.
        const raw = normalizeStr(name).replace(/\s+/g, '');
        if (raw && ROSTER_STATUS_NOISE_NAMES.has(raw)) {
            return true;
        }
        // koreanNameDisplayKey strips a trailing 학생 for match keys (TMS "…[] 학생" layout).
        // That maps exact status phrase 신규학생 → 신규; both are already in the set above.
        // Do NOT rebuild `${display}학생` — that pattern is easy to misread as fuzzy matching.
        const display = koreanNameDisplayKey(name);
        return Boolean(display && ROSTER_STATUS_NOISE_NAMES.has(display));
    }

    /**
     * Canonical stored Korean name: Hangul + optional A–D only.
     * Unlike koreanNameDisplayKey / identityKey, does NOT strip a trailing 학생
     * (that cleanup is match-only for TMS "…[] 학생" labels).
     */
    function canonicalKoreanStoredName(name) {
        let s = String(name == null ? '' : name).normalize('NFC').trim();
        s = s.replace(/[\s\u00A0\u2000-\u200B\u202F\u205F\u3000]+/g, '');
        s = s.replace(/[\u200C\u200D\uFEFF\u2060]/g, '');
        s = s.replace(/[·•ㆍ\-–—_./]/g, '');
        s = s.replace(/[\uFF01-\uFF5E]/g, (ch) =>
            String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
        );
        s = s.replace(/\([^)]*\)/g, '');
        s = s.replace(/（[^）]*）/g, '');
        s = s.replace(/\[[^\]]*\]/g, '');
        s = s.replace(/［[^］]*］/g, '');
        const match = s.match(NAME_IDENTITY_SUFFIX_RE);
        if (!match) {
            return normalizeStr(s);
        }
        return `${match[1] || ''}${match[2] || ''}`;
    }

    /** Trailing status symbol after Hangul core, if any (e.g. ◆ on 권이안◆). */
    function nameStatusSymbolSuffix(name) {
        const parsed = parseKoreanNameMarks(name);
        return parsed.statusSuffix || '';
    }

    /** Trailing Latin letter used to disambiguate same Hangul names (e.g. A on 김민수A). */
    function nameLatinDisambiguatorSuffix(name) {
        const parsed = parseKoreanNameMarks(name);
        return parsed.identityLetter || '';
    }

    /** Trailing mark after Hangul: status symbol or Latin/digit (legacy helper). */
    function nameDisambiguatorSuffix(name) {
        const status = nameStatusSymbolSuffix(name);
        if (status) {
            return status;
        }
        const latin = nameLatinDisambiguatorSuffix(name);
        if (latin) {
            return latin;
        }
        const key = koreanNameDisplayKey(name);
        const m = key.match(/[\uac00-\ud7a3]+([0-9]+)$/);
        return m ? m[1] : '';
    }

    function hangulCoreKey(name) {
        return hangulSyllables(name).join('');
    }

    /**
     * Display compare key: Hangul + status marks + Latin/digits after cleanup.
     * Unlike koreanMatchKey, keeps ★/◆ so gain/loss of a mark is visible.
     */
    function koreanDisplayCompareKey(name) {
        const s = koreanNameDisplayKey(name);
        return s.replace(
            /[^\uac00-\ud7a3A-Za-z0-9◆◇♦♢⬥⬦◈＊★☆✦✧●○■□▲△▼▽※]/g,
            ''
        );
    }

    /** True when Hangul identity matches but visible mark/letter form differs. */
    function koreanDisplaysDiffer(nameA, nameB) {
        const a = koreanDisplayCompareKey(nameA);
        const b = koreanDisplayCompareKey(nameB);
        return Boolean(a && b && a !== b);
    }

    function marksToStudentTags(statusMarks) {
        const tags = [];
        if (statusMarks && statusMarks.isNew) {
            tags.push('new');
        }
        if (statusMarks && statusMarks.shuttle) {
            tags.push('shuttle');
        }
        if (statusMarks && statusMarks.transferIn) {
            tags.push('transfer_in');
        }
        return tags;
    }

    function applySyncManagedStudentTags(student, statusMarks) {
        const s = normalizeStudent(student);
        if (!s) {
            return s;
        }
        const tags = (Array.isArray(s.tags) ? s.tags : []).filter(
            (tag) => !SYNC_MANAGED_STUDENT_TAGS.includes(tag)
        );
        marksToStudentTags(statusMarks).forEach((tag) => {
            if (!tags.includes(tag)) {
                tags.push(tag);
            }
        });
        return Object.assign({}, s, { tags });
    }

    function hasLatinNameDisambiguator(name) {
        return Boolean(nameLatinDisambiguatorSuffix(name));
    }

    function hasNameDisambiguator(name) {
        return Boolean(nameDisambiguatorSuffix(name));
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
     * True when two Hangul names share identity match keys, or one is a contiguous
     * Hangul variant of the other (e.g. 김민수 ↔ 김민수아).
     * Status symbols are ignored (권이안 ≡ 권이안◆). Latin suffixes still block fuzzy
     * (김민수A is not auto-fuzzy with 김민수).
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

    /**
     * Match a scraped TMS student against archive-cohort students (mpidx, then Korean key).
     */
    function findArchivedStudentForTmsMatch(archiveStudents, tmsStudent) {
        const archive = (Array.isArray(archiveStudents) ? archiveStudents : [])
            .map(normalizeStudent)
            .filter(Boolean);
        if (!archive.length || !tmsStudent) {
            return null;
        }
        const mp = normalizeStr(tmsStudent.mpidx || tmsStudent.tmsMpidx);
        if (mp) {
            const byMp = archive.find((s) => normalizeStr(s.tmsMpidx) === mp);
            if (byMp) {
                return byMp;
            }
        }
        const key = koreanMatchKey(tmsStudent.name);
        if (!key) {
            return null;
        }
        const byKey = archive.filter((s) => koreanMatchKey(s.name) === key);
        return byKey.length === 1 ? byKey[0] : null;
    }

    /**
     * TMS names that need user review (map / add / skip / restore) before sync applies:
     * - Same Hangul core with Latin letter difference → shared_hangul_core
     * - Contiguous Hangul variant → fuzzy_variant
     * - Multiple CM students share the match key → duplicate_existing
     * - No active match but archive hit → restore_from_archive
     * Identical Hangul+mark display is not unclear (silent match).
     * TMS display name is source of truth when the user maps.
     */
    function listUnclearTmsStudentMatches(existingStudents, tmsStudents, options) {
        const opts = options || {};
        const archiveStudents = Array.isArray(opts.archiveStudents) ? opts.archiveStudents : [];
        const existing = (Array.isArray(existingStudents) ? existingStudents : [])
            .map(normalizeStudent)
            .filter(Boolean);
        const incoming = (Array.isArray(tmsStudents) ? tmsStudents : [])
            .map((raw) => {
                if (!raw) {
                    return null;
                }
                const name = normalizeStr(raw.name);
                if (!name || isRosterStatusNoiseName(name)) {
                    return null;
                }
                const parsedMarks = parseKoreanNameMarks(name);
                return {
                    name: normalizeStr(canonicalKoreanStoredName(name) || parsedMarks.identityKey || name),
                    nameEn: normalizeStr(raw.nameEn),
                    mpidx: normalizeStr(raw.mpidx || raw.tmsMpidx),
                    statusMarks: raw.statusMarks || {
                        isNew: parsedMarks.isNew,
                        shuttle: parsedMarks.shuttle,
                        transferIn: parsedMarks.transferIn
                    },
                    parseUncertain: raw.parseUncertain === true
                };
            })
            .filter(Boolean);

        const existingByKey = new Map();
        const duplicateKeys = new Set();
        const existingByMpidx = new Map();
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
            if (s.tmsMpidx && !existingByMpidx.has(s.tmsMpidx)) {
                existingByMpidx.set(s.tmsMpidx, s);
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
            if (imp.mpidx && existingByMpidx.has(imp.mpidx)) {
                return;
            }
            const sameKeyStudents = existing.filter((s) => koreanMatchKey(s.name) === k);
            if (sameKeyStudents.length > 1 || duplicateKeys.has(k)) {
                unclear.push({
                    tmsName: imp.name,
                    tmsNameEn: imp.nameEn,
                    tmsKey: k,
                    tmsMpidx: imp.mpidx || '',
                    parseUncertain: imp.parseUncertain,
                    reason: 'duplicate_existing',
                    candidates: sameKeyStudents.map((s) => ({
                        id: s.id,
                        name: s.name,
                        nameEn: s.nameEn || ''
                    }))
                });
                return;
            }
            const exact = existingByKey.get(k);
            if (exact) {
                return;
            }
            const candidates = existing
                .filter((s) => sharesHangulCoreOrVariant(s.name, imp.name))
                .map((s) => ({ id: s.id, name: s.name, nameEn: s.nameEn || '' }));
            if (candidates.length) {
                const reason =
                    candidates.some((c) => hangulCoreKey(c.name) === hangulCoreKey(imp.name))
                        ? 'shared_hangul_core'
                        : 'fuzzy_variant';
                unclear.push({
                    tmsName: imp.name,
                    tmsNameEn: imp.nameEn,
                    tmsKey: k,
                    tmsMpidx: imp.mpidx || '',
                    parseUncertain: imp.parseUncertain,
                    reason,
                    candidates
                });
                return;
            }
            const archived = findArchivedStudentForTmsMatch(archiveStudents, imp);
            if (archived) {
                unclear.push({
                    tmsName: imp.name,
                    tmsNameEn: imp.nameEn,
                    tmsKey: k,
                    tmsMpidx: imp.mpidx || '',
                    parseUncertain: imp.parseUncertain,
                    reason: 'restore_from_archive',
                    candidates: [
                        {
                            id: archived.id,
                            name: archived.name,
                            nameEn: archived.nameEn || '',
                            archived: true
                        }
                    ]
                });
            }
        });
        return unclear;
    }

    /**
     * Merge a TMS (or similar) Korean-name roster into an existing cohort student list.
     * - Match by koreanMatchKey (Hangul + Latin; status symbols ignored for identity).
     * - ★/◆ gain/loss or Latin letter differences require studentResolutions (map/add/skip).
     * - On confirmed map (or identical display), adopt TMS display name / nameEn / mpidx.
     * - Add students whose match key is not in the cohort (and not unclear).
     * - Flag existing students missing from TMS with off_roster (never delete),
     *   unless options.suppressMissing is true for an unreliable partial roster.
     *   Preview `flagged` includes students who already had the tag (still missing).
     * - Clear off_roster when they reappear on TMS (always strip on match).
     * - options.studentResolutions: { [tmsKey]: { action:'map'|'add'|'skip', studentId? } }
     */
    function mergeRosterByKoreanName(existingStudents, tmsStudents, options) {
        const opts = options || {};
        const makeId =
            typeof opts.newStudentId === 'function'
                ? opts.newStudentId
                : () => newId('stu');
        const resolutions =
            opts.studentResolutions && typeof opts.studentResolutions === 'object'
                ? opts.studentResolutions
                : {};
        const archiveStudents = Array.isArray(opts.archiveStudents)
            ? opts.archiveStudents.map(normalizeStudent).filter(Boolean)
            : [];
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
                if (!name || isRosterStatusNoiseName(name)) {
                    return null;
                }
                const parsedMarks = parseKoreanNameMarks(name);
                return {
                    name: normalizeStr(canonicalKoreanStoredName(name) || parsedMarks.identityKey || name),
                    nameEn: normalizeStr(raw.nameEn),
                    locationTag: normalizeStr(raw.locationTag),
                    memo: normalizeStr(raw.memo),
                    mpidx: normalizeStr(raw.mpidx || raw.tmsMpidx),
                    statusMarks: raw.statusMarks || {
                        isNew: parsedMarks.isNew,
                        shuttle: parsedMarks.shuttle,
                        transferIn: parsedMarks.transferIn
                    },
                    parseUncertain: raw.parseUncertain === true
                };
            })
            .filter(Boolean);

        const existingByKey = new Map();
        const duplicateKeys = new Set();
        const existingByMpidx = new Map();
        existing.forEach((s) => {
            const k = koreanMatchKey(s.name);
            if (k) {
                if (existingByKey.has(k)) {
                    duplicateKeys.add(k);
                } else {
                    existingByKey.set(k, s);
                }
            }
            if (s.tmsMpidx && !existingByMpidx.has(s.tmsMpidx)) {
                existingByMpidx.set(s.tmsMpidx, s);
            }
        });

        const tmsKeys = new Set();
        const added = [];
        const matched = [];
        const warnings = [];
        const exactMatchedIds = new Set();
        const resolutionMatchedIds = new Set();
        const skipTmsKeys = new Set();
        /** @type {Map<string, { name: string, nameEn: string, tmsMpidx?: string }>} */
        const mapNameUpdates = new Map();

        function adoptTmsIdentity(target, imp, extra) {
            const previousName = target.name;
            const nameUpdated = normalizeStr(previousName) !== normalizeStr(imp.name);
            mapNameUpdates.set(target.id, {
                name: nameUpdated ? imp.name : target.name,
                // TMS scrape (상담) supplies full English; empty keeps existing CM name.
                nameEn: imp.nameEn || target.nameEn || '',
                tmsMpidx: imp.mpidx || target.tmsMpidx || '',
                statusMarks: imp.statusMarks || { isNew: false, shuttle: false, transferIn: false }
            });
            matched.push(
                Object.assign(
                    {
                        id: target.id,
                        name: imp.name,
                        previousName,
                        nameUpdated,
                        matchedBy: imp.mpidx && target.tmsMpidx === imp.mpidx ? 'mpidx' : 'name'
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
            // Wizard resolutions win over auto exact-match (fixes duplicate_existing Map).
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
                    tags: marksToStudentTags(imp.statusMarks),
                    memo: imp.memo,
                    archivedAt: '',
                    archiveReason: '',
                    expectedStartDate: '',
                    tmsMpidx: imp.mpidx || ''
                });
                return;
            }
            if (resolution && resolution.action === 'restore') {
                // Applied earlier in applyTmsRosterPlan (student already in cohort as map).
                const targetId = normalizeStr(resolution.studentId);
                const target = existingById.get(targetId);
                if (target) {
                    adoptTmsIdentity(target, imp, { resolved: true, restored: true });
                    resolutionMatchedIds.add(target.id);
                    return;
                }
                warnings.push({
                    code: 'resolution_restore_missing',
                    name: imp.name,
                    studentId: targetId
                });
            }

            // Prefer stable TMS student id when both sides have it.
            if (imp.mpidx && existingByMpidx.has(imp.mpidx)) {
                const byMpidx = existingByMpidx.get(imp.mpidx);
                adoptTmsIdentity(byMpidx, imp, { matchedBy: 'mpidx' });
                return;
            }

            const match = existingByKey.get(k);
            if (match) {
                const sameKeyStudents = existing.filter((s) => koreanMatchKey(s.name) === k);
                const needsReview =
                    duplicateKeys.has(k) ||
                    sameKeyStudents.length > 1;
                if (needsReview) {
                    if (duplicateKeys.has(k) || sameKeyStudents.length > 1) {
                        warnings.push({
                            code: 'duplicate_existing_name',
                            name: imp.name,
                            matchedId: match.id
                        });
                    }
                    warnings.push({
                        code: 'unresolved_unclear_name',
                        name: imp.name,
                        candidates: sameKeyStudents.map((s) => s.id)
                    });
                    skipTmsKeys.add(k);
                    if (opts.softUnclear) {
                        sameKeyStudents.forEach((s) => {
                            if (s && s.id) {
                                exactMatchedIds.add(s.id);
                            }
                        });
                    }
                    return;
                }
                adoptTmsIdentity(match, imp, { matchedBy: 'name' });
                return;
            }
            // Unclear without resolution: do not auto-add (wizard must decide).
            const unclearCandidates = existing.filter((s) =>
                sharesHangulCoreOrVariant(s.name, imp.name)
            );
            if (unclearCandidates.length) {
                warnings.push({
                    code: 'unresolved_unclear_name',
                    name: imp.name,
                    candidates: unclearCandidates.map((s) => s.id)
                });
                skipTmsKeys.add(k);
                unclearCandidates.forEach((s) => {
                    if (s && s.id) {
                        // Soft-hold: do not Off-roster candidates while review is pending.
                        if (opts.softUnclear) {
                            exactMatchedIds.add(s.id);
                        }
                    }
                });
                return;
            }
            const archivedHit = findArchivedStudentForTmsMatch(archiveStudents, imp);
            if (archivedHit) {
                warnings.push({
                    code: 'needs_archive_restore',
                    name: imp.name,
                    studentId: archivedHit.id
                });
                skipTmsKeys.add(k);
                return;
            }
            added.push({
                id: makeId(),
                name: imp.name,
                nameEn: imp.nameEn,
                locationTag: imp.locationTag,
                sortOrder: existing.length + added.length,
                active: true,
                tags: marksToStudentTags(imp.statusMarks),
                memo: imp.memo,
                archivedAt: '',
                archiveReason: '',
                expectedStartDate: '',
                tmsMpidx: imp.mpidx || ''
            });
        });

        const fuzzyMatchedIds = new Set();
        const fuzzyCleared = [];
        // Shared Hangul-core / variant leftovers are not auto-fuzzy merged.
        // They must be resolved via listUnclearTmsStudentMatches + studentResolutions.

        // Treat resolution-mapped + exact + fuzzy as on TMS for Off roster.
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
                if (nameUpdate.tmsMpidx) {
                    patch.tmsMpidx = nameUpdate.tmsMpidx;
                }
                next = applySyncManagedStudentTags(Object.assign({}, s, patch), nameUpdate.statusMarks);
            }
            // Only explicitly matched IDs count as on TMS — not every student who
            // shares a duplicate Korean key with a matched row.
            const onTms = exactMatchedIds.has(s.id) || fuzzyMatchedIds.has(s.id);
            const hadOff = (next.tags || []).includes(OFF_ROSTER_TAG);
            if (onTms) {
                // Always strip Off roster when Korean name is on this TMS scrape (exact or fuzzy).
                if (hadOff) {
                    const entry = { id: next.id, name: next.name };
                    cleared.push(entry);
                    if (fuzzyMatchedIds.has(s.id)) {
                        fuzzyCleared.push(entry);
                    }
                }
                return withoutStudentTag(next, OFF_ROSTER_TAG);
            }
            if (opts.suppressMissing) {
                return next;
            }
            // Count every student missing from TMS in flagged (including ones already tagged),
            // so preview "0 off roster" means no Off roster tags will remain after Apply.
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
     * Normalize cohort.tmsStudentResolutions map (remembered Sync wizard choices).
     * @returns {Object<string, { action: string, studentId?: string }>}
     */
    function normalizeTmsStudentResolutions(raw) {
        const out = {};
        if (!raw || typeof raw !== 'object') {
            return out;
        }
        Object.keys(raw).forEach((key) => {
            const k = koreanMatchKey(key) || normalizeStr(key);
            const entry = raw[key];
            if (!k || !entry || typeof entry !== 'object') {
                return;
            }
            const action = entry.action;
            if (action !== 'skip' && action !== 'map' && action !== 'add' && action !== 'restore') {
                return;
            }
            const next = { action };
            if (action === 'map' || action === 'restore') {
                const sid = normalizeStr(entry.studentId);
                if (!sid) {
                    return;
                }
                next.studentId = sid;
            }
            out[k] = next;
        });
        return out;
    }

    /**
     * Merge session wizard resolutions into a cohort's remembered map.
     */
    function mergeTmsStudentResolutions(existing, sessionResolutions) {
        const next = normalizeTmsStudentResolutions(existing);
        const session = normalizeTmsStudentResolutions(sessionResolutions);
        Object.keys(session).forEach((k) => {
            next[k] = session[k];
        });
        return next;
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
            if (remembered.action === 'restore') {
                // Restore targets live in the archive cohort, not the mapped class.
                row.studentResolutions[key] = {
                    action: 'restore',
                    studentId: remembered.studentId
                };
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

    function matchHomeroomTeacherByName(tmsName, teachers) {
        const name = String(tmsName || '').trim();
        if (!name) {
            return { userId: '', name: '' };
        }
        const list = Array.isArray(teachers) ? teachers : [];
        const exact = list.find(
            (r) =>
                String(r.displayName || '').trim() === name || String(r.name || '').trim() === name
        );
        if (exact) {
            return {
                userId: normalizeStr(exact.userId),
                name: String(exact.displayName || name).trim()
            };
        }
        const lower = name.toLowerCase();
        const fuzzy = list.find((r) => {
            const dn = String(r.displayName || '').toLowerCase();
            return dn && (dn.includes(lower) || lower.includes(dn));
        });
        if (fuzzy) {
            return {
                userId: normalizeStr(fuzzy.userId),
                name: String(fuzzy.displayName || name).trim()
            };
        }
        return { userId: '', name };
    }

    function cohortHomeroomSnapshot(cohort) {
        if (!cohort) {
            return { userId: '', name: '' };
        }
        return {
            userId: normalizeStr(cohort.homeroomTeacherUserId),
            name: normalizeStr(cohort.homeroomTeacherName)
        };
    }

    function resolveTmsHomeroomForRow(row, teachers, existingCohort) {
        const tmsHomeroomName = normalizeStr(row && row.tmsHomeroomName);
        const matched = matchHomeroomTeacherByName(tmsHomeroomName, teachers);
        const current = cohortHomeroomSnapshot(existingCohort);
        const matchedUserId = matched.userId;
        const matchedName = matchedUserId
            ? matched.name || tmsHomeroomName
            : tmsHomeroomName || matched.name;
        let willChange = false;
        if (tmsHomeroomName) {
            if (matchedUserId) {
                willChange = matchedUserId !== current.userId;
            } else if (matchedName) {
                willChange = matchedName !== current.name;
            }
        }
        const defaultApplyHomeroom = Boolean(tmsHomeroomName) && !current.userId && !current.name;
        return {
            tmsHomeroomName,
            matchedUserId,
            matchedName,
            currentUserId: current.userId,
            currentName: current.name,
            willChange,
            defaultApplyHomeroom
        };
    }

    function applyTmsHomeroomToCohort(cohort, row) {
        if (!cohort || !row || !row.applyHomeroomFromTms) {
            return cohort;
        }
        const uid = normalizeStr(row.homeroomTeacherUserId);
        const name = normalizeStr(row.homeroomTeacherName) || normalizeStr(row.tmsHomeroomName);
        if (!uid && !name) {
            return cohort;
        }
        const out = Object.assign({}, cohort);
        if (uid) {
            out.homeroomTeacherUserId = uid;
        } else {
            delete out.homeroomTeacherUserId;
        }
        out.homeroomTeacherName = name;
        return out;
    }

    function createTmsRosterCohort(row, options) {
        const opts = options || {};
        const newCohortId =
            typeof opts.newCohortId === 'function' ? opts.newCohortId : () => newId('cohort');
        const applyHr = Boolean(row && row.applyHomeroomFromTms);
        const rowHrUid = applyHr ? normalizeStr(row.homeroomTeacherUserId) : '';
        const rowHrName = applyHr
            ? normalizeStr(row.homeroomTeacherName) || normalizeStr(row.tmsHomeroomName)
            : '';
        return {
            id: newCohortId(),
            name: normalizeStr(row && row.importCohortName),
            classIds: [],
            students: [],
            level: normalizeStr(row && row.level),
            levelPreset: normalizeStr(row && row.levelPreset),
            grade: normalizeStr(row && row.grade),
            schedulePattern: row && row.schedulePattern === 'tth' ? 'tth' : 'mwf',
            meetingDays:
                Array.isArray(row && row.meetingDays) && row.meetingDays.length
                    ? row.meetingDays.slice()
                    : row && row.schedulePattern === 'tth'
                      ? [2, 4]
                      : [1, 3, 5],
            periodCount: 0,
            scheduleBlock: normalizeStr(row && row.scheduleBlock) || 'primary',
            subjectSlots: [],
            homeroomTeacherUserId: applyHr
                ? rowHrUid
                : normalizeStr(opts.homeroomTeacherUserId),
            homeroomTeacherName: rowHrName,
            homeroomDaySuffix: '',
            tmsBlockStart: normalizeStr(row && row.tmsBlockStart),
            tmsBlockEnd: normalizeStr(row && row.tmsBlockEnd),
            tmsSuggestedPeriod:
                row && row.tmsSuggestedPeriod != null && row.tmsSuggestedPeriod !== ''
                    ? Number(row.tmsSuggestedPeriod)
                    : null,
            tmsSuggestedTimeSlotId: normalizeStr(row && row.tmsSuggestedTimeSlotId)
        };
    }

    /**
     * Apply Korean-name TMS merges across cohorts using a mapping plan.
     * plan rows: { userAction: 'map'|'create'|'skip', userTargetId, importCohortName, students: [{name,nameEn?}] }
     */
    function applyTmsRosterPlan(calendarCohorts, plan, options) {
        const opts = options || {};
        let cohorts = (Array.isArray(calendarCohorts) ? calendarCohorts : []).map((c) =>
            Object.assign({}, c, {
                students: Array.isArray(c.students) ? c.students.map((s) => Object.assign({}, s)) : [],
                tmsStudentResolutions: normalizeTmsStudentResolutions(c && c.tmsStudentResolutions)
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
            if (row.userAction !== 'map' && row.userAction !== 'create') {
                return;
            }

            let targetId = normalizeStr(row.userTargetId);
            let idx = cohorts.findIndex((c) => c && c.id === targetId);
            if (row.userAction === 'create') {
                const created = createTmsRosterCohort(row, {
                    newCohortId: opts.newCohortId,
                    homeroomTeacherUserId: opts.homeroomTeacherUserId
                });
                cohorts.push(created);
                targetId = created.id;
                idx = cohorts.length - 1;
            }
            if (idx < 0) {
                results.push({
                    importCohortName: row.importCohortName,
                    error: 'target_not_found',
                    summary: null
                });
                return;
            }
            const target = cohorts[idx];
            const archiveCohort = findArchiveCohort(cohorts);
            const archiveStudents = archiveCohort
                ? normalizeCohortStudents(archiveCohort).filter((s) => s && s.active !== false)
                : [];
            let sessionResolutions = Object.assign(
                {},
                row.studentResolutions || opts.studentResolutions || {}
            );
            // Restore archived students into the target cohort before merge so map/mpidx can adopt.
            Object.keys(sessionResolutions).forEach((key) => {
                const res = sessionResolutions[key];
                if (!res || res.action !== 'restore' || !res.studentId) {
                    return;
                }
                const restored = restoreStudentFromArchive(cohorts, res.studentId, targetId);
                if (!restored.error) {
                    cohorts = restored.cohorts;
                    sessionResolutions[key] = {
                        action: 'map',
                        studentId: res.studentId
                    };
                }
            });
            const targetAfterRestore = cohorts[idx] || target;
            const merged = mergeRosterByKoreanName(targetAfterRestore.students, row.students, {
                newStudentId: opts.newStudentId,
                studentResolutions: sessionResolutions,
                softUnclear: Boolean(opts.softUnclear),
                suppressMissing: Boolean(row && row.suppressMissingReview),
                archiveStudents
            });
            cohorts[idx] = applyTmsHomeroomToCohort(
                Object.assign({}, targetAfterRestore, {
                    students: merged.students,
                    tmsStudentResolutions: mergeTmsStudentResolutions(
                        targetAfterRestore.tmsStudentResolutions,
                        sessionResolutions
                    )
                }),
                row
            );
            results.push({
                importCohortName: row.importCohortName,
                targetId,
                targetName: targetAfterRestore.name,
                created: row.userAction === 'create',
                summary: merged.summary
            });
        });
        return { cohorts, results };
    }

    /**
     * Detect students missing from one mapped TMS class who would be added on another
     * mapped class in the same sync plan (cross-cohort moves).
     * Uses koreanMatchKey. Ambiguous (2+ sources or destinations) → omitted.
     * @returns {Array<{ studentId: string, name: string, nameEn: string, tmsKey: string, fromCohortId: string, toCohortId: string, fromRowIdx: number, toRowIdx: number, fromCohortName: string, toCohortName: string, tmsName: string }>}
     */
    function detectTmsRosterTransfers(cohorts, plan) {
        const list = Array.isArray(cohorts) ? cohorts : [];
        const planRows = Array.isArray(plan) ? plan : [];
        /** @type {Map<string, Array<{ rowIdx: number, cohortId: string, cohortName: string, studentId: string, name: string, nameEn: string }>>} */
        const missingByKey = new Map();
        /** @type {Map<string, Array<{ rowIdx: number, cohortId: string, cohortName: string, tmsName: string, tmsNameEn: string }>>} */
        const addByKey = new Map();

        planRows.forEach((row, rowIdx) => {
            if (!row || row.userAction !== 'map' || !row.userTargetId) {
                return;
            }
            const targetId = normalizeStr(row.userTargetId);
            const target = list.find((c) => c && normalizeStr(c.id) === targetId);
            if (!target || isArchiveCohort(target)) {
                return;
            }
            const summary = mergeRosterByKoreanName(target.students, row.students, {
                studentResolutions: row.studentResolutions || {},
                softUnclear: true,
                suppressMissing: Boolean(row && row.suppressMissingReview),
                archiveStudents: (() => {
                    const archive = findArchiveCohort(list);
                    return archive ? normalizeCohortStudents(archive) : [];
                })()
            }).summary;
            if (
                Array.isArray(summary.warnings) &&
                summary.warnings.some((w) => w && w.code === 'incomplete_tms_scrape')
            ) {
                return;
            }
            const cohortName = normalizeStr(target.name) || targetId;
            (Array.isArray(summary.flagged) ? summary.flagged : []).forEach((f) => {
                if (!f || !f.id) {
                    return;
                }
                const student = (target.students || []).find((s) => s && s.id === f.id);
                if (!student || student.active === false) {
                    return;
                }
                const k = koreanMatchKey(student.name);
                if (!k) {
                    return;
                }
                if (!missingByKey.has(k)) {
                    missingByKey.set(k, []);
                }
                missingByKey.get(k).push({
                    rowIdx,
                    cohortId: targetId,
                    cohortName,
                    studentId: student.id,
                    name: student.name || f.name || '',
                    nameEn: student.nameEn || ''
                });
            });
            (Array.isArray(summary.added) ? summary.added : []).forEach((a) => {
                if (!a || !a.name) {
                    return;
                }
                const k = koreanMatchKey(a.name);
                if (!k) {
                    return;
                }
                // Destination already has this match key → not a clean add/transfer.
                const existingOnTarget = normalizeCohortStudents(target).some(
                    (s) => s.active !== false && koreanMatchKey(s.name) === k
                );
                if (existingOnTarget) {
                    return;
                }
                if (!addByKey.has(k)) {
                    addByKey.set(k, []);
                }
                addByKey.get(k).push({
                    rowIdx,
                    cohortId: targetId,
                    cohortName,
                    tmsName: a.name,
                    tmsNameEn: a.nameEn || ''
                });
            });
        });

        const transfers = [];
        missingByKey.forEach((sources, k) => {
            const destinations = addByKey.get(k) || [];
            if (sources.length !== 1 || destinations.length !== 1) {
                return;
            }
            const from = sources[0];
            const to = destinations[0];
            if (from.cohortId === to.cohortId) {
                return;
            }
            transfers.push({
                studentId: from.studentId,
                name: from.name,
                nameEn: from.nameEn,
                tmsKey: k,
                fromCohortId: from.cohortId,
                toCohortId: to.cohortId,
                fromRowIdx: from.rowIdx,
                toRowIdx: to.rowIdx,
                fromCohortName: from.cohortName,
                toCohortName: to.cohortName,
                tmsName: to.tmsName
            });
        });
        return transfers;
    }

    /**
     * Apply confirmed cross-cohort transfers (preserves student ids).
     * transfers: [{ studentId, fromCohortId, toCohortId }]
     */
    function applyTmsRosterTransfers(cohorts, transfers) {
        let list = cloneCohorts(cohorts);
        const applied = [];
        const errors = [];
        (Array.isArray(transfers) ? transfers : []).forEach((tr) => {
            if (!tr) {
                return;
            }
            const fromId = normalizeStr(tr.fromCohortId);
            const toId = normalizeStr(tr.toCohortId);
            const sid = normalizeStr(tr.studentId);
            if (!fromId || !toId || !sid) {
                return;
            }
            const result = moveStudentsBetweenCohorts(list, fromId, toId, [sid]);
            if (result.error) {
                errors.push({ studentId: sid, error: result.error, fromCohortId: fromId, toCohortId: toId });
                return;
            }
            list = result.cohorts;
            applied.push({ studentId: sid, fromCohortId: fromId, toCohortId: toId });
        });
        return { cohorts: list, applied, errors };
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
                return;
            }
            if (row.userAction === 'create') {
                const cohortId = normalizeStr(row.createdCohortId || row.userTargetId || row.cohortId);
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

    function restoreStudentsFromArchive(cohorts, studentIds, toCohortId) {
        const ids = Array.isArray(studentIds)
            ? studentIds.map((id) => normalizeStr(id)).filter(Boolean)
            : [];
        if (!ids.length) {
            return { error: 'missing_student', cohorts, restoredCount: 0 };
        }
        let list = cohorts;
        let restoredCount = 0;
        for (const sid of ids) {
            const result = restoreStudentFromArchive(list, sid, toCohortId);
            if (result.error) {
                return { error: result.error, cohorts: result.cohorts, restoredCount };
            }
            list = result.cohorts;
            restoredCount += 1;
        }
        return { error: null, cohorts: list, restoredCount };
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
        if (Array.isArray(next.debateBookDistributions)) {
            next.debateBookDistributions = next.debateBookDistributions.map((dist) => {
                if (!dist || !Array.isArray(dist.records)) {
                    return dist;
                }
                return Object.assign({}, dist, {
                    records: dist.records.filter((r) => normalizeStr(r.studentId) !== sid)
                });
            });
        }
        if (Array.isArray(next.pendingDebateBookChecks)) {
            next.pendingDebateBookChecks = next.pendingDebateBookChecks.filter(
                (ev) => !ev || normalizeStr(ev.studentId) !== sid
            );
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

    const ESSAY_STATUS_MERGE_RANK = {
        not_submitted: 0,
        incomplete: 1,
        submitted: 2,
        resubmit_required: 3,
        complete: 4,
        exempt: 4
    };

    function essayStatusMergeRank(status) {
        const s = normalizeStr(status);
        return Object.prototype.hasOwnProperty.call(ESSAY_STATUS_MERGE_RANK, s)
            ? ESSAY_STATUS_MERGE_RANK[s]
            : 0;
    }

    function pickRicherEssayRecord(keepRec, dropRec) {
        if (!keepRec) {
            return dropRec ? Object.assign({}, dropRec) : null;
        }
        if (!dropRec) {
            return Object.assign({}, keepRec);
        }
        const keepRank = essayStatusMergeRank(keepRec.status);
        const dropRank = essayStatusMergeRank(dropRec.status);
        const base = dropRank > keepRank ? Object.assign({}, dropRec) : Object.assign({}, keepRec);
        const other = dropRank > keepRank ? keepRec : dropRec;
        if (!normalizeStr(base.note) && normalizeStr(other.note)) {
            base.note = other.note;
        }
        if (!base.submittedRetest && other.submittedRetest) {
            base.submittedRetest = true;
        }
        if (!base.debateVideoMissing && other.debateVideoMissing) {
            base.debateVideoMissing = true;
        }
        if (!base.submissionLate && other.submissionLate) {
            base.submissionLate = true;
        }
        if (!base.overdueDismissed && other.overdueDismissed) {
            base.overdueDismissed = true;
        }
        return base;
    }

    const DEBATE_BOOK_STATUS_MERGE_RANK = {
        not_issued: 0,
        missing: 1,
        issued: 2
    };

    function debateBookStatusMergeRank(status) {
        const s = normalizeStr(status);
        return Object.prototype.hasOwnProperty.call(DEBATE_BOOK_STATUS_MERGE_RANK, s)
            ? DEBATE_BOOK_STATUS_MERGE_RANK[s]
            : 0;
    }

    function pickRicherDebateBookRecord(keepRec, dropRec) {
        if (!keepRec) {
            return dropRec ? Object.assign({}, dropRec) : null;
        }
        if (!dropRec) {
            return Object.assign({}, keepRec);
        }
        const keepRank = debateBookStatusMergeRank(keepRec.status);
        const dropRank = debateBookStatusMergeRank(dropRec.status);
        const base = dropRank > keepRank ? Object.assign({}, dropRec) : Object.assign({}, keepRec);
        const other = dropRank > keepRank ? keepRec : dropRec;
        if (!normalizeStr(base.note) && normalizeStr(other.note)) {
            base.note = other.note;
        }
        return base;
    }

    function pickRicherAttendanceRecord(keepRec, dropRec) {
        if (!keepRec) {
            return dropRec ? Object.assign({}, dropRec) : null;
        }
        if (!dropRec) {
            return Object.assign({}, keepRec);
        }
        const keepStatus = normalizeStr(keepRec.status);
        const dropStatus = normalizeStr(dropRec.status);
        const base =
            !keepStatus && dropStatus
                ? Object.assign({}, dropRec)
                : Object.assign({}, keepRec);
        const other = base === keepRec || normalizeStr(base.status) === keepStatus ? dropRec : keepRec;
        if (!normalizeStr(base.sessionNote) && normalizeStr(other.sessionNote)) {
            base.sessionNote = other.sessionNote;
        }
        return base;
    }

    function pickRicherHomeworkRecord(keepRec, dropRec) {
        if (!keepRec) {
            return dropRec ? Object.assign({}, dropRec) : null;
        }
        if (!dropRec) {
            return Object.assign({}, keepRec);
        }
        const keepGrade = normalizeStr(keepRec.grade);
        const dropGrade = normalizeStr(dropRec.grade);
        const keepIdx = HOMEWORK_GRADES.indexOf(keepGrade);
        const dropIdx = HOMEWORK_GRADES.indexOf(dropGrade);
        // Lower index = better grade (A before F); empty loses.
        let base;
        if (!keepGrade && dropGrade) {
            base = Object.assign({}, dropRec);
        } else if (keepGrade && dropGrade && dropIdx >= 0 && (keepIdx < 0 || dropIdx < keepIdx)) {
            base = Object.assign({}, dropRec);
        } else {
            base = Object.assign({}, keepRec);
        }
        const other = normalizeStr(base.grade) === keepGrade ? dropRec : keepRec;
        if (!normalizeStr(base.note) && normalizeStr(other.note)) {
            base.note = other.note;
        }
        if (
            (!base.selfCheck || base.selfCheck === 'none') &&
            other.selfCheck &&
            other.selfCheck !== 'none'
        ) {
            base.selfCheck = other.selfCheck;
        }
        return base;
    }

    function pickRicherTestRecord(keepRec, dropRec) {
        if (!keepRec) {
            return dropRec ? Object.assign({}, dropRec) : null;
        }
        if (!dropRec) {
            return Object.assign({}, keepRec);
        }
        const keepScore = normalizeStr(keepRec.score != null ? keepRec.score : keepRec.grade);
        const dropScore = normalizeStr(dropRec.score != null ? dropRec.score : dropRec.grade);
        const base =
            !keepScore && dropScore ? Object.assign({}, dropRec) : Object.assign({}, keepRec);
        const other = base === keepRec || normalizeStr(base.score || base.grade) === keepScore
            ? dropRec
            : keepRec;
        if (!normalizeStr(base.note) && normalizeStr(other.note)) {
            base.note = other.note;
        }
        return base;
    }

    function rekeyRecordList(records, keepId, dropId, picker) {
        const list = Array.isArray(records) ? records : [];
        const keep = normalizeStr(keepId);
        const drop = normalizeStr(dropId);
        const keepRec = list.find((r) => r && normalizeStr(r.studentId) === keep) || null;
        const dropRec = list.find((r) => r && normalizeStr(r.studentId) === drop) || null;
        const others = list.filter(
            (r) =>
                r &&
                normalizeStr(r.studentId) !== keep &&
                normalizeStr(r.studentId) !== drop
        );
        if (!dropRec) {
            return list.slice();
        }
        const merged = picker(keepRec, dropRec);
        if (!merged) {
            return others;
        }
        merged.studentId = keep;
        return others.concat([merged]);
    }

    /**
     * Merge two local student records: keep keepId, rekey dropId history, remove drop shell.
     * @param {object} appData
     * @param {{ keepId: string, dropId: string, profileFrom?: 'keep'|'drop', clearOffRoster?: boolean }} options
     */
    function mergeStudentRecords(appData, options) {
        const opts = options || {};
        const keepId = normalizeStr(opts.keepId);
        const dropId = normalizeStr(opts.dropId);
        const data = appData && typeof appData === 'object' ? appData : {};
        if (!keepId || !dropId || keepId === dropId) {
            return { error: 'invalid_ids', appData: data };
        }
        const cohortsIn = Array.isArray(data.cohorts) ? data.cohorts : [];
        let keepStudent = null;
        let dropStudent = null;
        let keepCohortId = '';
        let dropCohortId = '';
        cohortsIn.forEach((c) => {
            if (!c || !Array.isArray(c.students)) {
                return;
            }
            c.students.forEach((s) => {
                if (!s) {
                    return;
                }
                if (normalizeStr(s.id) === keepId) {
                    keepStudent = s;
                    keepCohortId = normalizeStr(c.id);
                }
                if (normalizeStr(s.id) === dropId) {
                    dropStudent = s;
                    dropCohortId = normalizeStr(c.id);
                }
            });
        });
        if (!keepStudent || !dropStudent) {
            return { error: 'student_not_found', appData: data };
        }
        if (keepCohortId && dropCohortId && keepCohortId !== dropCohortId) {
            return { error: 'cross_cohort', appData: data };
        }

        const profileFrom = opts.profileFrom === 'drop' ? 'drop' : 'keep';
        const keepNorm = normalizeStudent(keepStudent) || keepStudent;
        const dropNorm = normalizeStudent(dropStudent) || dropStudent;
        const srcNorm = profileFrom === 'drop' ? dropNorm : keepNorm;
        const otherNorm = profileFrom === 'drop' ? keepNorm : dropNorm;
        const tagSet = new Set([...(keepNorm.tags || []), ...(dropNorm.tags || [])]);
        const clearOffRoster = opts.clearOffRoster !== false;
        if (clearOffRoster) {
            tagSet.delete(OFF_ROSTER_TAG);
        }
        const mergedProfile = Object.assign({}, keepNorm, {
            name: normalizeStr(srcNorm.name) || normalizeStr(otherNorm.name),
            nameEn: preferLongerNameEn(keepNorm.nameEn, dropNorm.nameEn),
            tmsMpidx:
                normalizeStr(srcNorm.tmsMpidx) ||
                normalizeStr(otherNorm.tmsMpidx) ||
                '',
            locationTag: normalizeStr(srcNorm.locationTag) || normalizeStr(otherNorm.locationTag),
            memo: normalizeStr(srcNorm.memo) || normalizeStr(otherNorm.memo),
            tags: Array.from(tagSet),
            active: keepNorm.active !== false || dropNorm.active !== false
        });
        if (profileFrom === 'drop') {
            mergedProfile.name = normalizeStr(dropNorm.name) || mergedProfile.name;
            if (normalizeStr(dropNorm.nameEn)) {
                mergedProfile.nameEn = preferLongerNameEn(keepNorm.nameEn, dropNorm.nameEn);
            }
            if (normalizeStr(dropNorm.tmsMpidx)) {
                mergedProfile.tmsMpidx = normalizeStr(dropNorm.tmsMpidx);
            }
        }

        let next = Object.assign({}, data);

        if (Array.isArray(next.attendanceSessions)) {
            next.attendanceSessions = next.attendanceSessions.map((session) => {
                if (!session || !Array.isArray(session.records)) {
                    return session;
                }
                return Object.assign({}, session, {
                    records: rekeyRecordList(
                        session.records,
                        keepId,
                        dropId,
                        pickRicherAttendanceRecord
                    )
                });
            });
        }
        if (Array.isArray(next.homeworkCompletions)) {
            next.homeworkCompletions = next.homeworkCompletions.map((hw) => {
                if (!hw || !Array.isArray(hw.records)) {
                    return hw;
                }
                return Object.assign({}, hw, {
                    records: rekeyRecordList(hw.records, keepId, dropId, pickRicherHomeworkRecord)
                });
            });
        }
        if (Array.isArray(next.essaySubmissions)) {
            next.essaySubmissions = next.essaySubmissions.map((essay) => {
                if (!essay || !Array.isArray(essay.records)) {
                    return essay;
                }
                return Object.assign({}, essay, {
                    records: rekeyRecordList(essay.records, keepId, dropId, pickRicherEssayRecord)
                });
            });
        }
        if (Array.isArray(next.debateBookDistributions)) {
            next.debateBookDistributions = next.debateBookDistributions.map((dist) => {
                if (!dist || !Array.isArray(dist.records)) {
                    return dist;
                }
                return Object.assign({}, dist, {
                    records: rekeyRecordList(dist.records, keepId, dropId, pickRicherDebateBookRecord)
                });
            });
        }
        if (Array.isArray(next.pendingDebateBookChecks)) {
            next.pendingDebateBookChecks = next.pendingDebateBookChecks.map((ev) => {
                if (!ev || normalizeStr(ev.studentId) !== dropId) {
                    return ev;
                }
                return Object.assign({}, ev, { studentId: keepId });
            });
        }
        if (Array.isArray(next.studentPoints)) {
            next.studentPoints = next.studentPoints.map((p) => {
                if (!p || normalizeStr(p.studentId) !== dropId) {
                    return p;
                }
                return Object.assign({}, p, { studentId: keepId });
            });
        }
        if (Array.isArray(next.studentTests)) {
            next.studentTests = next.studentTests.map((test) => {
                if (!test || !Array.isArray(test.records)) {
                    return test;
                }
                return Object.assign({}, test, {
                    records: rekeyRecordList(test.records, keepId, dropId, pickRicherTestRecord)
                });
            });
        }
        if (Array.isArray(next.debateScores)) {
            next.debateScores = next.debateScores.map((session) => {
                if (!session || !Array.isArray(session.records)) {
                    return session;
                }
                return Object.assign({}, session, {
                    records: rekeyRecordList(session.records, keepId, dropId, (a, b) => {
                        if (!a) {
                            return b ? Object.assign({}, b) : null;
                        }
                        if (!b) {
                            return Object.assign({}, a);
                        }
                        return Object.assign({}, a);
                    })
                });
            });
        }
        if (Array.isArray(next.debateTeamSessions)) {
            next.debateTeamSessions = next.debateTeamSessions.map((session) => {
                if (!session) {
                    return session;
                }
                let changed = false;
                const patch = {};
                if (Array.isArray(session.studentIds)) {
                    const ids = session.studentIds.map((id) =>
                        normalizeStr(id) === dropId ? keepId : id
                    );
                    const dedup = [];
                    ids.forEach((id) => {
                        if (id && !dedup.includes(id)) {
                            dedup.push(id);
                        }
                    });
                    if (dedup.join('|') !== (session.studentIds || []).join('|')) {
                        patch.studentIds = dedup;
                        changed = true;
                    }
                }
                if (session.sessionState && typeof session.sessionState === 'object') {
                    const state = Object.assign({}, session.sessionState);
                    let stateChanged = false;
                    Object.keys(state).forEach((k) => {
                        if (normalizeStr(k) === dropId) {
                            if (!Object.prototype.hasOwnProperty.call(state, keepId)) {
                                state[keepId] = state[k];
                            }
                            delete state[k];
                            stateChanged = true;
                        }
                    });
                    if (stateChanged) {
                        patch.sessionState = state;
                        changed = true;
                    }
                }
                return changed ? Object.assign({}, session, patch) : session;
            });
        }
        if (Array.isArray(next.speakingTestRecords)) {
            next.speakingTestRecords = next.speakingTestRecords.map((rec) => {
                if (!rec || !rec.scores || typeof rec.scores !== 'object') {
                    return rec;
                }
                const scores = Object.assign({}, rec.scores);
                if (!Object.prototype.hasOwnProperty.call(scores, dropId)) {
                    return rec;
                }
                if (!Object.prototype.hasOwnProperty.call(scores, keepId)) {
                    scores[keepId] = scores[dropId];
                }
                delete scores[dropId];
                return Object.assign({}, rec, { scores });
            });
        }
        if (Array.isArray(next.dayNotes)) {
            next.dayNotes = next.dayNotes.map((note) => {
                if (!note || !Array.isArray(note.taggedStudentIds)) {
                    return note;
                }
                const ids = note.taggedStudentIds.map((id) =>
                    normalizeStr(id) === dropId ? keepId : id
                );
                const dedup = [];
                ids.forEach((id) => {
                    const n = normalizeStr(id);
                    if (n && !dedup.includes(n)) {
                        dedup.push(n);
                    }
                });
                return Object.assign({}, note, { taggedStudentIds: dedup });
            });
        }

        next.cohorts = cohortsIn.map((c) => {
            if (!c || !Array.isArray(c.students)) {
                return c;
            }
            const students = [];
            let touched = false;
            const resolutions = normalizeTmsStudentResolutions(c.tmsStudentResolutions);
            let resChanged = false;
            Object.keys(resolutions).forEach((key) => {
                const r = resolutions[key];
                if (r && r.action === 'map' && normalizeStr(r.studentId) === dropId) {
                    resolutions[key] = Object.assign({}, r, { studentId: keepId });
                    resChanged = true;
                }
            });
            c.students.forEach((s) => {
                if (!s) {
                    return;
                }
                if (normalizeStr(s.id) === dropId) {
                    touched = true;
                    return;
                }
                if (normalizeStr(s.id) === keepId) {
                    touched = true;
                    students.push(Object.assign({}, s, mergedProfile, { id: keepId }));
                    return;
                }
                students.push(s);
            });
            if (!touched && !resChanged) {
                return c;
            }
            const patch = { students };
            if (resChanged) {
                patch.tmsStudentResolutions = resolutions;
            }
            return Object.assign({}, c, patch);
        });

        return {
            error: null,
            appData: next,
            keepId,
            dropId,
            mergedProfile
        };
    }

    /**
     * Suspected duplicate pairs in a cohort (same koreanMatchKey or same tmsMpidx).
     * @returns {Array<{ reason: string, students: object[] }>}
     */
    function listSuspectedDuplicateStudents(cohort) {
        const students = normalizeCohortStudents(cohort).filter((s) => s && s.active !== false);
        const byKey = new Map();
        const byMpidx = new Map();
        students.forEach((s) => {
            const k = koreanMatchKey(s.name);
            if (k) {
                if (!byKey.has(k)) {
                    byKey.set(k, []);
                }
                byKey.get(k).push(s);
            }
            const mp = normalizeStr(s.tmsMpidx);
            if (mp) {
                if (!byMpidx.has(mp)) {
                    byMpidx.set(mp, []);
                }
                byMpidx.get(mp).push(s);
            }
        });
        const out = [];
        const seen = new Set();
        byMpidx.forEach((list, mp) => {
            if (list.length < 2) {
                return;
            }
            const ids = list
                .map((s) => s.id)
                .sort()
                .join('|');
            if (seen.has(ids)) {
                return;
            }
            seen.add(ids);
            out.push({ reason: 'duplicate_tms_mpidx', tmsMpidx: mp, students: list });
        });
        byKey.forEach((list, key) => {
            if (list.length < 2) {
                return;
            }
            const ids = list
                .map((s) => s.id)
                .sort()
                .join('|');
            if (seen.has(ids)) {
                return;
            }
            seen.add(ids);
            out.push({ reason: 'duplicate_existing', tmsKey: key, students: list });
        });
        return out;
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

    function deleteStudentsPermanently(cohorts, studentIds, cohortId) {
        const ids = Array.isArray(studentIds)
            ? studentIds.map((id) => normalizeStr(id)).filter(Boolean)
            : [];
        if (!ids.length) {
            return { error: 'missing_student', cohorts, deletedIds: [] };
        }
        let list = cohorts;
        const deletedIds = [];
        for (const sid of ids) {
            const result = deleteStudentPermanently(list, sid, cohortId);
            if (result.error) {
                return { error: result.error, cohorts: result.cohorts, deletedIds };
            }
            list = result.cohorts;
            deletedIds.push(sid);
        }
        return { error: null, cohorts: list, deletedIds };
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
     * Active on-roster students for a class (union of linked cohorts, deduped by id).
     * Excludes off_roster-tagged students (still visible on Students tab).
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
                .filter((s) => s.active && !(s.tags || []).includes(OFF_ROSTER_TAG))
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

    function isCustomEssayAssignmentRow(row) {
        return Boolean(row && row.trackEssay === true && !isEssaySyllabusRow(row));
    }

    function getEssayRowsForTerm(syllabusRows, termStart, termEnd) {
        const rows = getEssayRowsFromSyllabus(syllabusRows);
        const ts = normalizeStr(termStart);
        const te = normalizeStr(termEnd);
        if (!ts && !te) {
            return rows;
        }
        const inTerm = rows.filter((r) => {
            const d = normalizeStr(r.date);
            if (!d) {
                return true;
            }
            if (ts && d < ts) {
                return false;
            }
            if (te && d > te) {
                return false;
            }
            return true;
        });
        return inTerm;
    }

    function getEssayRowsForAssignedMonth(syllabusRows, assignedDate, termStart, termEnd) {
        const rows =
            termStart || termEnd
                ? getEssayRowsForTerm(syllabusRows, termStart, termEnd)
                : getEssayRowsFromSyllabus(syllabusRows);
        const assignedMonth = yearMonthKey(assignedDate);
        if (!assignedMonth) {
            return rows;
        }
        return rows.filter((row) => {
            const rowMonth = yearMonthKey(row && row.date);
            if (!rowMonth) {
                return true;
            }
            return rowMonth === assignedMonth;
        });
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
            debateVideoMissing: Boolean(raw.debateVideoMissing),
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
                debateVideoMissing: false,
                note: '',
                submissionLate: false,
                overdueDismissed: false
            });
            seen.add(sid);
        });
        base.records = records;
        return base;
    }

    function filterEssayRecordsToStudentIds(submission, activeStudentIds) {
        const rosterIds = Array.isArray(activeStudentIds)
            ? activeStudentIds.map(normalizeStr).filter(Boolean)
            : null;
        // Empty roster (unresolved class/cohort) must not zero out counts — same as "no filter".
        if (!rosterIds || !rosterIds.length) {
            return Array.isArray(submission && submission.records) ? submission.records : [];
        }
        const allowed = new Set(rosterIds);
        return Array.isArray(submission && submission.records)
            ? submission.records.filter((r) => r && allowed.has(normalizeStr(r.studentId)))
            : [];
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

    function countEssayByStatus(submission, activeStudentIds) {
        const counts = emptyEssayStatusCounts();
        const records = filterEssayRecordsToStudentIds(submission, activeStudentIds);
        if (!records.length) {
            return counts;
        }
        records.forEach((r) => {
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

    function essayResubmitCount(submission, activeStudentIds) {
        return countEssayByStatus(submission, activeStudentIds).resubmit_required;
    }

    function essayDebateVideoMissingCount(submission, activeStudentIds) {
        const records = filterEssayRecordsToStudentIds(submission, activeStudentIds);
        if (!records.length) {
            return 0;
        }
        let total = 0;
        records.forEach((rec) => {
            if (rec && rec.debateVideoMissing) {
                total += 1;
            }
        });
        return total;
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
     * If SS due is not past (future or missing), never overdue — extending the deadline
     * clears OD including prior "received late" until the new due passes.
     */
    function isEssaySubmissionOverdue(record, ssDueDate) {
        if (!record || record.overdueDismissed) {
            return false;
        }
        if (!isEssaySsOverdueISO(ssDueDate)) {
            return false;
        }
        if (isEssayReceivedLate(record)) {
            return true;
        }
        const status = ESSAY_STATUSES.includes(record.status) ? record.status : 'not_submitted';
        return status === 'not_submitted';
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
     * Not submitted, not overdue, and SS due is in the current calendar month.
     * Matches due-cell Awaiting submission (other months stay quiet / not AS).
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
        if (!sameCalendarMonth(ssDueDate, todayISO())) {
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
            if (
                !isEssayAwaitingSubmission(
                    {
                        status: 'not_submitted',
                        submissionLate: false,
                        overdueDismissed: false
                    },
                    ssDueDate
                )
            ) {
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

    function essayPendingTeacherEvalCount(submission, activeStudentIds) {
        return countEssayByStatus(submission, activeStudentIds).submitted || 0;
    }

    function isEssayTeacherEvalOverdue(submission, teacherEvalDueDate, activeStudentIds) {
        if (!isEssaySsOverdueISO(teacherEvalDueDate)) {
            return false;
        }
        return essayPendingTeacherEvalCount(submission, activeStudentIds) > 0;
    }

    function essayAlertCountsForAssignment(submission, ssDueDate, studentCount, activeStudentIds) {
        const rosterIds = Array.isArray(activeStudentIds)
            ? activeStudentIds.map(normalizeStr).filter(Boolean)
            : null;
        const counts = submission
            ? countEssayByStatus(submission, rosterIds || undefined)
            : Object.assign(emptyEssayStatusCounts(), {
                not_submitted: Math.max(0, studentCount || 0)
            });
        return {
            rs: counts.resubmit_required || 0,
            as: essayAwaitingSubmissionCount(
                submission,
                ssDueDate,
                studentCount,
                rosterIds || undefined
            ),
            od: essayOverdueNotSubmittedCount(
                submission,
                ssDueDate,
                studentCount,
                rosterIds || undefined
            ),
            ae: essayPendingTeacherEvalCount(submission, rosterIds || undefined),
            nv: essayDebateVideoMissingCount(submission, rosterIds || undefined),
            counts
        };
    }

    /**
     * Sum RS/NS/OD/AE/NV across essay syllabus rows for a class.
     * Optional options.month (YYYY-MM) limits to assignments whose effective SS due
     * (submission.ssDueDate || row.date) falls in that month. Empty = all rows.
     */
    function essayAlertCountsForClass(submissions, classData, cohorts, options) {
        if (!classData || !classData.id) {
            return { rs: 0, as: 0, od: 0, ae: 0, nv: 0 };
        }
        const monthFilter = yearMonthKey((options && options.month) || '');
        const students = resolveStudentsForClass(classData, cohorts);
        const totalStudents = students.length;
        const activeStudentIds = students
            .map((entry) => entry && entry.student && entry.student.id)
            .filter(Boolean);
        let rs = 0;
        let asCount = 0;
        let od = 0;
        let ae = 0;
        let nv = 0;
        getEssayRowsFromSyllabus(classData.syllabusRows).forEach((row) => {
            const syllabusRowId = getSyllabusRowKey(row);
            if (!syllabusRowId) {
                return;
            }
            const submission = findEssaySubmission(submissions, classData.id, syllabusRowId);
            const ssDue =
                submission && submission.ssDueDate ? submission.ssDueDate : row.date || '';
            if (monthFilter && yearMonthKey(ssDue) !== monthFilter) {
                return;
            }
            const alerts = essayAlertCountsForAssignment(
                submission,
                ssDue,
                totalStudents,
                activeStudentIds
            );
            rs += alerts.rs;
            asCount += alerts.as;
            od += alerts.od;
            ae += alerts.ae;
            nv += alerts.nv;
        });
        return { rs, as: asCount, od, ae, nv };
    }

    function formatEssayClassAlertSuffix(counts) {
        const c = counts || {};
        const parts = [];
        if (c.rs > 0) {
            parts.push(`RS:${c.rs}`);
        }
        if (c.as > 0) {
            parts.push(`NS:${c.as}`);
        }
        if (c.od > 0) {
            parts.push(`OD:${c.od}`);
        }
        if (c.ae > 0) {
            parts.push(`AE:${c.ae}`);
        }
        if (c.nv > 0) {
            parts.push(`NV:${c.nv}`);
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
            const alerts = essayAlertCountsForAssignment(
                submission,
                ssDue,
                totalStudents,
                students.map((entry) => entry && entry.student && entry.student.id).filter(Boolean)
            );
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
                as: alerts.as,
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
                const activeStudentIds = students
                    .map((entry) => entry && entry.student && entry.student.id)
                    .filter(Boolean);
                const activeStudentSet = new Set(activeStudentIds.map(normalizeStr));
                submission.records.forEach((rec) => {
                    if (!rec || rec.status !== 'resubmit_required') {
                        return;
                    }
                    const studentId = normalizeStr(rec.studentId);
                    // Empty roster: still list submission records (same as alert counts).
                    if (!studentId || (activeStudentSet.size > 0 && !activeStudentSet.has(studentId))) {
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
                        submittedRetest: Boolean(rec.submittedRetest),
                        debateVideoMissing: Boolean(rec.debateVideoMissing)
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
     * Per-student overdue rows for print/copy warns (not_submitted past SS due, or received late).
     * Uses the current class roster so archived students do not appear.
     */
    function listEssayOverdueRows(appData, options) {
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
                    const rec = getEssayRecordForStudent(submission, studentId) || {
                        studentId,
                        status: 'not_submitted',
                        submissionLate: false,
                        overdueDismissed: false
                    };
                    if (!isEssaySubmissionOverdue(rec, ssDue)) {
                        return;
                    }
                    const receivedLate = isEssayReceivedLate(rec);
                    const status =
                        ESSAY_STATUSES.includes(rec.status) ? rec.status : 'not_submitted';
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
                        // Detail line uses ssOverdueKind (overdue / received late), not feedback notes.
                        note: '',
                        submittedRetest: false,
                        debateVideoMissing: Boolean(rec.debateVideoMissing),
                        status,
                        submissionLate: Boolean(rec.submissionLate),
                        overdueDismissed: Boolean(rec.overdueDismissed),
                        ssDueDate: ssDue,
                        ssOverdue: true,
                        ssOverdueKind: receivedLate ? 'received_late' : 'not_submitted'
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
                        debateVideoMissing: rec ? Boolean(rec.debateVideoMissing) : false,
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

    function classUsesMonthlyDebateBooks(classData) {
        if (!classData) {
            return false;
        }
        return normalizeStr(classData.scheduleModel) === 'debateMonthly';
    }

    function normalizeDebateBookPeriodKey(raw) {
        const key = normalizeStr(raw);
        if (key === DEBATE_BOOK_TERM_PERIOD_KEY) {
            return DEBATE_BOOK_TERM_PERIOD_KEY;
        }
        if (/^\d{4}-\d{2}$/.test(key)) {
            return key;
        }
        return '';
    }

    function formatDebateBookOptionLabel(periodKey, bookTitle, bookLevel) {
        const key = normalizeDebateBookPeriodKey(periodKey);
        const title = normalizeStr(bookTitle);
        const level = normalizeStr(bookLevel);
        const bookBit = [title, level].filter(Boolean).join(' · ');
        if (key === DEBATE_BOOK_TERM_PERIOD_KEY) {
            return bookBit || key;
        }
        let monthLabel = key;
        if (/^\d{4}-\d{2}$/.test(key)) {
            const year = key.slice(0, 4);
            const monthNum = Number(key.slice(5, 7));
            const monthName = DEBATE_BOOK_MONTH_NAMES_EN[monthNum - 1] || key.slice(5);
            monthLabel = `${monthName} ${year}`;
        }
        return bookBit ? `${monthLabel} — ${bookBit}` : monthLabel;
    }

    function enumerateDebateBookMonthKeys(classData) {
        const start = normalizeStr(classData && classData.startDate);
        const end = normalizeStr(classData && classData.endDate);
        if (global.CCPDebatePeriods && typeof global.CCPDebatePeriods.enumerateMonthKeysBetween === 'function') {
            return global.CCPDebatePeriods.enumerateMonthKeysBetween(start, end);
        }
        const keys = [];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
            return keys;
        }
        let y = Number(start.slice(0, 4));
        let mo = Number(start.slice(5, 7)) - 1;
        const endY = Number(end.slice(0, 4));
        const endMo = Number(end.slice(5, 7)) - 1;
        while (y < endY || (y === endY && mo <= endMo)) {
            keys.push(`${y}-${String(mo + 1).padStart(2, '0')}`);
            mo += 1;
            if (mo > 11) {
                mo = 0;
                y += 1;
            }
        }
        return keys;
    }

    function resolveDebateBookTitleForMonth(classData, monthKey) {
        const key = normalizeDebateBookPeriodKey(monthKey);
        if (!key || key === DEBATE_BOOK_TERM_PERIOD_KEY) {
            return normalizeStr(classData && classData.book);
        }
        const midDate = `${key}-15`;
        if (global.CCPDebatePeriods && typeof global.CCPDebatePeriods.getBookForDate === 'function') {
            return (
                normalizeStr(global.CCPDebatePeriods.getBookForDate(classData, midDate)) ||
                normalizeStr(classData && classData.book)
            );
        }
        const periods = Array.isArray(classData && classData.debateBookPeriods)
            ? classData.debateBookPeriods.slice()
            : [];
        periods.sort((a, b) => compareDateStr(a && a.startDate, b && b.startDate));
        let book = normalizeStr(classData && classData.book);
        periods.forEach((period) => {
            const start = normalizeStr(period && period.startDate);
            if (start && start <= midDate && normalizeStr(period.book)) {
                book = normalizeStr(period.book);
            }
        });
        return book;
    }

    function listDebateBookMonthOptions(classData) {
        if (!classData) {
            return [];
        }
        const bookLevel = resolveClassLevelLabel(classData);
        return enumerateDebateBookMonthKeys(classData).map((monthKey) => {
            const bookTitle = resolveDebateBookTitleForMonth(classData, monthKey);
            return {
                periodKey: monthKey,
                bookTitle,
                bookLevel,
                label: formatDebateBookOptionLabel(monthKey, bookTitle, bookLevel)
            };
        });
    }

    function getDebateBookTermOption(classData) {
        const bookTitle = normalizeStr(classData && classData.book);
        const bookLevel = resolveClassLevelLabel(classData);
        return {
            periodKey: DEBATE_BOOK_TERM_PERIOD_KEY,
            bookTitle,
            bookLevel,
            label: formatDebateBookOptionLabel(DEBATE_BOOK_TERM_PERIOD_KEY, bookTitle, bookLevel)
        };
    }

    function pickDefaultDebateBookPeriodKey(classData, refDate) {
        if (!classUsesMonthlyDebateBooks(classData)) {
            return DEBATE_BOOK_TERM_PERIOD_KEY;
        }
        const options = listDebateBookMonthOptions(classData);
        if (!options.length) {
            return '';
        }
        const refMonth = yearMonthKey(refDate) || yearMonthKey(todayISO());
        const exact = options.find((opt) => opt.periodKey === refMonth);
        if (exact) {
            return exact.periodKey;
        }
        let bestPast = null;
        options.forEach((opt) => {
            if (opt.periodKey <= refMonth) {
                bestPast = opt.periodKey;
            }
        });
        return bestPast || options[0].periodKey;
    }

    function normalizeDebateBookRecord(raw) {
        if (!raw || !raw.studentId) {
            return null;
        }
        const status = normalizeStr(raw.status);
        const normalizedStatus = DEBATE_BOOK_STATUSES.includes(status) ? status : 'not_issued';
        const issuedAtRaw = normalizeStr(raw.issuedAt);
        const issuedAt =
            normalizedStatus === 'issued' && /^\d{4}-\d{2}-\d{2}$/.test(issuedAtRaw) ? issuedAtRaw : '';
        return {
            studentId: normalizeStr(raw.studentId),
            status: normalizedStatus,
            note: normalizeStr(raw.note),
            issuedAt
        };
    }

    function resolveDebateBookIssuedDate(refDate) {
        const ref = normalizeStr(refDate);
        if (/^\d{4}-\d{2}-\d{2}$/.test(ref)) {
            return ref;
        }
        return todayISO();
    }

    function applyDebateBookRecordPatch(prev, patch, refDate) {
        const base = normalizeDebateBookRecord(prev) || {
            studentId: normalizeStr(patch && patch.studentId),
            status: 'not_issued',
            note: '',
            issuedAt: ''
        };
        const p = patch && typeof patch === 'object' ? patch : {};
        const prevStatus = base.status || 'not_issued';
        let nextStatus = p.status !== undefined ? normalizeStr(p.status) : prevStatus;
        nextStatus = DEBATE_BOOK_STATUSES.includes(nextStatus) ? nextStatus : 'not_issued';
        let issuedAt = base.issuedAt || '';
        if (p.issuedAt !== undefined) {
            const candidate = normalizeStr(p.issuedAt);
            issuedAt =
                nextStatus === 'issued' && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : '';
        }
        if (p.status !== undefined) {
            if (nextStatus === 'issued' && prevStatus !== 'issued') {
                issuedAt = resolveDebateBookIssuedDate(refDate);
            } else if (nextStatus !== 'issued') {
                issuedAt = '';
            }
        }
        if (nextStatus === 'issued' && !issuedAt) {
            issuedAt = resolveDebateBookIssuedDate(refDate);
        }
        return {
            studentId: normalizeStr(p.studentId) || base.studentId,
            status: nextStatus,
            note: p.note !== undefined ? normalizeStr(p.note) : base.note,
            issuedAt
        };
    }

    function normalizeDebateBookDistribution(raw) {
        if (!raw || !raw.id || !raw.classId) {
            return null;
        }
        const periodKey = normalizeDebateBookPeriodKey(raw.periodKey);
        if (!periodKey) {
            return null;
        }
        const records = Array.isArray(raw.records)
            ? raw.records.map(normalizeDebateBookRecord).filter(Boolean)
            : [];
        return {
            id: normalizeStr(raw.id),
            classId: normalizeStr(raw.classId),
            periodKey,
            bookTitle: normalizeStr(raw.bookTitle),
            bookLevel: normalizeStr(raw.bookLevel),
            records,
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function findDebateBookDistribution(distributions, classId, periodKey) {
        const list = Array.isArray(distributions) ? distributions : [];
        const cid = normalizeStr(classId);
        const key = normalizeDebateBookPeriodKey(periodKey);
        if (!cid || !key) {
            return null;
        }
        return list.find((e) => e && e.classId === cid && e.periodKey === key) || null;
    }

    function upsertDebateBookDistribution(distributions, entry) {
        const normalized = normalizeDebateBookDistribution(entry);
        if (!normalized) {
            return Array.isArray(distributions) ? distributions.slice() : [];
        }
        const list = Array.isArray(distributions) ? distributions.filter(Boolean).slice() : [];
        const idx = list.findIndex(
            (e) => e && e.classId === normalized.classId && e.periodKey === normalized.periodKey
        );
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], normalized, { id: list[idx].id || normalized.id });
        } else {
            list.push(normalized);
        }
        return list;
    }

    function getDebateBookRecordForStudent(distribution, studentId) {
        if (!distribution || !Array.isArray(distribution.records)) {
            return null;
        }
        const sid = normalizeStr(studentId);
        return distribution.records.find((r) => r && r.studentId === sid) || null;
    }

    function ensureDebateBookRecordsForStudents(distribution, studentEntries) {
        const base = distribution
            ? Object.assign({}, distribution, {
                records: Array.isArray(distribution.records) ? distribution.records.slice() : []
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
                status: 'not_issued',
                note: '',
                issuedAt: ''
            });
            seen.add(sid);
        });
        base.records = records;
        return base;
    }

    function emptyDebateBookStatusCounts() {
        return {
            not_issued: 0,
            issued: 0,
            missing: 0
        };
    }

    function countDebateBookByStatus(distribution, activeStudentIds) {
        const counts = emptyDebateBookStatusCounts();
        const rosterIds = Array.isArray(activeStudentIds)
            ? activeStudentIds.map(normalizeStr).filter(Boolean)
            : null;
        const allowed = rosterIds ? new Set(rosterIds) : null;
        const records = Array.isArray(distribution && distribution.records) ? distribution.records : [];
        const byStudent = new Map();
        records.forEach((rec) => {
            if (!rec) {
                return;
            }
            const sid = normalizeStr(rec.studentId);
            if (!sid || (allowed && !allowed.has(sid))) {
                return;
            }
            byStudent.set(sid, DEBATE_BOOK_STATUSES.includes(rec.status) ? rec.status : 'not_issued');
        });
        if (allowed) {
            allowed.forEach((sid) => {
                const status = byStudent.get(sid) || 'not_issued';
                counts[status] += 1;
            });
        } else {
            byStudent.forEach((status) => {
                counts[status] += 1;
            });
        }
        return counts;
    }

    function resolveDebateBookPeriodKeyForClass(classData, uiPeriodByClassId) {
        if (!classData) {
            return '';
        }
        if (!classUsesMonthlyDebateBooks(classData)) {
            return DEBATE_BOOK_TERM_PERIOD_KEY;
        }
        const map =
            uiPeriodByClassId && typeof uiPeriodByClassId === 'object' ? uiPeriodByClassId : {};
        const preferred = normalizeDebateBookPeriodKey(map[classData.id]);
        const options = listDebateBookMonthOptions(classData);
        if (preferred && options.some((opt) => opt.periodKey === preferred)) {
            return preferred;
        }
        return pickDefaultDebateBookPeriodKey(classData);
    }

    function debateBookAlertCountsForClass(distributions, classData, cohorts, uiPeriodByClassId) {
        if (!classData || !classData.id) {
            return { ni: 0, ms: 0 };
        }
        const periodKey = resolveDebateBookPeriodKeyForClass(classData, uiPeriodByClassId);
        if (!periodKey) {
            return { ni: 0, ms: 0 };
        }
        const students = resolveStudentsForClass(classData, cohorts);
        const activeStudentIds = students
            .map((entry) => entry && entry.student && entry.student.id)
            .filter(Boolean);
        if (!activeStudentIds.length) {
            return { ni: 0, ms: 0 };
        }
        const dist = findDebateBookDistribution(distributions, classData.id, periodKey);
        const ensured = ensureDebateBookRecordsForStudents(
            dist || { classId: classData.id, periodKey, records: [] },
            students
        );
        const counts = countDebateBookByStatus(ensured, activeStudentIds);
        return { ni: counts.not_issued, ms: counts.missing };
    }

    function normalizeDebateBookSummaryKey(classId, periodKey) {
        const cid = normalizeStr(classId);
        const key = normalizeDebateBookPeriodKey(periodKey);
        if (!cid || !key) {
            return '';
        }
        return `${cid}|${key}`;
    }

    function listDebateBookSummaryEntries(appData, options) {
        const opts = options || {};
        const data = appData && typeof appData === 'object' ? appData : {};
        const classes = Array.isArray(opts.classes) ? opts.classes : data.classes || [];
        const cohorts = data.cohorts || [];
        const distributions = data.debateBookDistributions || [];
        const uiPeriodMap =
            opts.uiPeriodByClassId ||
            (data.ui && data.ui.debateBookPeriodByClassId) ||
            {};
        const entries = [];
        classes.forEach((classData) => {
            if (!classData || !classData.id) {
                return;
            }
            const students = resolveStudentsForClass(classData, cohorts);
            const studentIds = students
                .map((entry) => entry && entry.student && entry.student.id)
                .filter(Boolean);
            if (opts.skipEmptyRoster && !studentIds.length) {
                return;
            }
            const className = normalizeStr(classData.name) || classData.id;
            const classTypeLabel = resolveClassTypeLabel(classData, data);
            const levelLabel = resolveClassLevelLabel(classData);
            const pushEntry = (periodOpt) => {
                if (!periodOpt || !periodOpt.periodKey) {
                    return;
                }
                const dist = findDebateBookDistribution(
                    distributions,
                    classData.id,
                    periodOpt.periodKey
                );
                const ensured = ensureDebateBookRecordsForStudents(
                    dist || {
                        classId: classData.id,
                        periodKey: periodOpt.periodKey,
                        records: []
                    },
                    students
                );
                const counts = countDebateBookByStatus(ensured, studentIds);
                entries.push({
                    key: normalizeDebateBookSummaryKey(classData.id, periodOpt.periodKey),
                    classId: classData.id,
                    className,
                    classTypeLabel,
                    levelLabel,
                    periodKey: periodOpt.periodKey,
                    periodLabel: periodOpt.label || periodOpt.periodKey,
                    bookTitle: periodOpt.bookTitle || '',
                    bookLevel: periodOpt.bookLevel || '',
                    monthKey:
                        periodOpt.periodKey === DEBATE_BOOK_TERM_PERIOD_KEY
                            ? ''
                            : periodOpt.periodKey,
                    counts,
                    totalStudents: studentIds.length
                });
            };
            if (classUsesMonthlyDebateBooks(classData)) {
                listDebateBookMonthOptions(classData).forEach(pushEntry);
            } else {
                pushEntry(getDebateBookTermOption(classData));
            }
        });
        return entries.sort((a, b) => {
            const byClass = String(a.className || '').localeCompare(
                String(b.className || ''),
                undefined,
                { sensitivity: 'base' }
            );
            if (byClass !== 0) {
                return byClass;
            }
            return String(a.periodKey || '').localeCompare(String(b.periodKey || ''));
        });
    }

    function listDebateBookSummaryRows(appData, options) {
        const opts = options || {};
        const keySet = opts.entryKeys instanceof Set ? opts.entryKeys : null;
        const selectedKeys = Array.isArray(opts.selectedKeys)
            ? new Set(opts.selectedKeys.map(normalizeStr).filter(Boolean))
            : keySet;
        const entries = listDebateBookSummaryEntries(appData, opts).filter((entry) => {
            if (!entry || !entry.key) {
                return false;
            }
            if (selectedKeys && selectedKeys.size && !selectedKeys.has(entry.key)) {
                return false;
            }
            return true;
        });
        const cohorts = (appData && appData.cohorts) || [];
        const distributions = (appData && appData.debateBookDistributions) || [];
        const rows = [];
        entries.forEach((entry) => {
            const classData = (appData.classes || []).find((c) => c && c.id === entry.classId);
            if (!classData) {
                return;
            }
            const students = resolveStudentsForClass(classData, cohorts);
            const dist = findDebateBookDistribution(
                distributions,
                entry.classId,
                entry.periodKey
            );
            const ensured = ensureDebateBookRecordsForStudents(
                dist || {
                    classId: entry.classId,
                    periodKey: entry.periodKey,
                    records: []
                },
                students
            );
            students.forEach((studentEntry) => {
                const student = studentEntry && studentEntry.student;
                if (!student || !student.id) {
                    return;
                }
                const rec =
                    getDebateBookRecordForStudent(ensured, student.id) || {
                        studentId: student.id,
                        status: 'not_issued',
                        note: ''
                    };
                rows.push({
                    key: entry.key,
                    classId: entry.classId,
                    className: entry.className,
                    classTypeLabel: entry.classTypeLabel,
                    levelLabel: entry.levelLabel,
                    periodKey: entry.periodKey,
                    periodLabel: entry.periodLabel,
                    bookTitle: entry.bookTitle,
                    bookLevel: entry.bookLevel,
                    studentId: student.id,
                    studentName: student.name || '',
                    studentNameEn: normalizeStr(student.nameEn),
                    studentTags: Array.isArray(student.tags) ? student.tags.slice() : [],
                    status: rec.status || 'not_issued',
                    note: rec.note || '',
                    issuedAt: rec.issuedAt || ''
                });
            });
        });
        return rows;
    }

    /**
     * Classes that use Tools → Debate Books handout tracking for a cohort.
     * Monthly debate classes always qualify; other classes qualify when a book is set.
     */
    function classTracksDebateBookDelivery(classData) {
        if (!classData || !classData.id) {
            return false;
        }
        if (classUsesMonthlyDebateBooks(classData)) {
            return true;
        }
        return Boolean(normalizeStr(classData.book));
    }

    function listDebateBookClassesForCohort(classes, cohortId) {
        const cid = normalizeStr(cohortId);
        if (!cid) {
            return [];
        }
        return (Array.isArray(classes) ? classes : []).filter((c) => {
            if (!c || !classTracksDebateBookDelivery(c)) {
                return false;
            }
            return getCohortIdsForClass(c).includes(cid);
        });
    }

    function snapshotPriorDebateBookStatus(appData, studentId, classData) {
        const sid = normalizeStr(studentId);
        const uiPeriodMap =
            (appData && appData.ui && appData.ui.debateBookPeriodByClassId) || {};
        const periodKey = resolveDebateBookPeriodKeyForClass(classData, uiPeriodMap);
        if (!periodKey || !sid || !classData || !classData.id) {
            return {
                periodKey: periodKey || '',
                status: 'not_issued',
                bookTitle: normalizeStr(classData && classData.book),
                issuedAt: ''
            };
        }
        const dist = findDebateBookDistribution(
            (appData && appData.debateBookDistributions) || [],
            classData.id,
            periodKey
        );
        const rec = getDebateBookRecordForStudent(dist, sid);
        let bookTitle = normalizeStr(dist && dist.bookTitle);
        if (!bookTitle) {
            bookTitle = classUsesMonthlyDebateBooks(classData)
                ? resolveDebateBookTitleForMonth(classData, periodKey)
                : normalizeStr(classData.book);
        }
        const status =
            rec && DEBATE_BOOK_STATUSES.includes(rec.status) ? rec.status : 'not_issued';
        return {
            periodKey,
            status,
            bookTitle,
            issuedAt: rec && rec.issuedAt ? normalizeStr(rec.issuedAt) : ''
        };
    }

    function normalizePendingDebateBookCheck(raw) {
        if (!raw || !raw.id || !raw.studentId) {
            return null;
        }
        const priorRaw =
            raw.priorStatusByClassId && typeof raw.priorStatusByClassId === 'object'
                ? raw.priorStatusByClassId
                : {};
        const priorStatusByClassId = {};
        Object.keys(priorRaw).forEach((cid) => {
            const p = priorRaw[cid];
            if (!p || typeof p !== 'object') {
                return;
            }
            const status = normalizeStr(p.status);
            priorStatusByClassId[normalizeStr(cid)] = {
                periodKey:
                    normalizeDebateBookPeriodKey(p.periodKey) || normalizeStr(p.periodKey),
                status: DEBATE_BOOK_STATUSES.includes(status) ? status : 'not_issued',
                bookTitle: normalizeStr(p.bookTitle),
                issuedAt: normalizeStr(p.issuedAt)
            };
        });
        const resolvedAt = normalizeStr(raw.resolvedAt);
        return {
            id: normalizeStr(raw.id),
            studentId: normalizeStr(raw.studentId),
            studentName: normalizeStr(raw.studentName),
            fromCohortId: normalizeStr(raw.fromCohortId),
            toCohortId: normalizeStr(raw.toCohortId),
            fromClassIds: (Array.isArray(raw.fromClassIds) ? raw.fromClassIds : [])
                .map(normalizeStr)
                .filter(Boolean),
            toClassIds: (Array.isArray(raw.toClassIds) ? raw.toClassIds : [])
                .map(normalizeStr)
                .filter(Boolean),
            priorStatusByClassId,
            createdAt: normalizeStr(raw.createdAt) || new Date().toISOString(),
            resolvedAt: resolvedAt || null,
            resolvedByUserId: normalizeStr(raw.resolvedByUserId) || null
        };
    }

    /**
     * Build pending book-check events for students moving between cohorts.
     * Call with calendar data that still has prior distributions (move does not rekey them).
     */
    function buildDebateBookCheckEventsForMove(appData, options) {
        const opts = options || {};
        const data = appData && typeof appData === 'object' ? appData : {};
        const fromCohortId = normalizeStr(opts.fromCohortId);
        const toCohortId = normalizeStr(opts.toCohortId);
        const studentIds = (Array.isArray(opts.studentIds) ? opts.studentIds : [])
            .map(normalizeStr)
            .filter(Boolean);
        if (!fromCohortId || !toCohortId || fromCohortId === toCohortId || !studentIds.length) {
            return [];
        }
        const fromCohort = (data.cohorts || []).find((c) => c && normalizeStr(c.id) === fromCohortId);
        const toCohort = (data.cohorts || []).find((c) => c && normalizeStr(c.id) === toCohortId);
        if (!fromCohort || !toCohort) {
            return [];
        }
        if (isArchiveCohort(fromCohort) || isArchiveCohort(toCohort)) {
            return [];
        }
        const fromClasses = listDebateBookClassesForCohort(data.classes, fromCohortId);
        const toClasses = listDebateBookClassesForCohort(data.classes, toCohortId);
        if (!fromClasses.length && !toClasses.length) {
            return [];
        }
        const fromClassIds = fromClasses.map((c) => c.id);
        const toClassIds = toClasses.map((c) => c.id);
        const studentsById = new Map();
        normalizeCohortStudents(fromCohort).forEach((s) => {
            if (s && s.id) {
                studentsById.set(s.id, s);
            }
        });
        normalizeCohortStudents(toCohort).forEach((s) => {
            if (s && s.id && !studentsById.has(s.id)) {
                studentsById.set(s.id, s);
            }
        });
        (Array.isArray(opts.students) ? opts.students : []).forEach((s) => {
            if (s && s.id) {
                studentsById.set(normalizeStr(s.id), s);
            }
        });
        const createdAt = normalizeStr(opts.createdAt) || new Date().toISOString();
        const makeId =
            typeof opts.newId === 'function' ? opts.newId : () => newId('dbc');
        return studentIds.map((sid) => {
            const student = studentsById.get(sid);
            const priorStatusByClassId = {};
            fromClasses.forEach((cls) => {
                priorStatusByClassId[cls.id] = snapshotPriorDebateBookStatus(data, sid, cls);
            });
            return {
                id: makeId(),
                studentId: sid,
                studentName: normalizeStr(student && student.name) || sid,
                fromCohortId,
                toCohortId,
                fromClassIds: fromClassIds.slice(),
                toClassIds: toClassIds.slice(),
                priorStatusByClassId,
                createdAt,
                resolvedAt: null,
                resolvedByUserId: null
            };
        });
    }

    function appendPendingDebateBookChecks(existing, events) {
        const list = (Array.isArray(existing) ? existing : [])
            .map(normalizePendingDebateBookCheck)
            .filter(Boolean);
        const byId = new Map(list.map((ev) => [ev.id, ev]));
        (Array.isArray(events) ? events : []).forEach((raw) => {
            const ev = normalizePendingDebateBookCheck(raw);
            if (!ev) {
                return;
            }
            byId.set(ev.id, ev);
        });
        return Array.from(byId.values());
    }

    function listPendingDebateBookChecks(appData, options) {
        const opts = options || {};
        const list = (
            Array.isArray(appData && appData.pendingDebateBookChecks)
                ? appData.pendingDebateBookChecks
                : []
        )
            .map(normalizePendingDebateBookCheck)
            .filter(Boolean);
        const unresolvedOnly = opts.unresolvedOnly !== false;
        const classId = normalizeStr(opts.classId);
        const studentId = normalizeStr(opts.studentId);
        const role = normalizeStr(opts.role);
        return list.filter((ev) => {
            if (unresolvedOnly && ev.resolvedAt) {
                return false;
            }
            if (studentId && ev.studentId !== studentId) {
                return false;
            }
            if (classId) {
                const inTo = ev.toClassIds.includes(classId);
                const inFrom = ev.fromClassIds.includes(classId);
                if (role === 'to' && !inTo) {
                    return false;
                }
                if (role === 'from' && !inFrom) {
                    return false;
                }
                if (!role && !inTo && !inFrom) {
                    return false;
                }
            }
            return true;
        });
    }

    function resolveDebateBookCheck(appData, eventId, options) {
        const opts = options || {};
        const id = normalizeStr(eventId);
        const next = Object.assign({}, appData || {});
        const list = Array.isArray(next.pendingDebateBookChecks)
            ? next.pendingDebateBookChecks.slice()
            : [];
        if (!id) {
            next.pendingDebateBookChecks = list;
            return next;
        }
        const resolvedAt = normalizeStr(opts.resolvedAt) || new Date().toISOString();
        const userId = normalizeStr(opts.userId);
        next.pendingDebateBookChecks = list.map((raw) => {
            const ev = normalizePendingDebateBookCheck(raw);
            if (!ev || ev.id !== id) {
                return raw;
            }
            if (ev.resolvedAt) {
                return ev;
            }
            return Object.assign({}, ev, {
                resolvedAt,
                resolvedByUserId: userId || null
            });
        });
        return next;
    }

    /**
     * Resolve unresolved book-check events for a student on a destination (or source) class.
     */
    function resolveDebateBookChecksForStudentOnClass(appData, studentId, classId, options) {
        const opts = options || {};
        const sid = normalizeStr(studentId);
        const cid = normalizeStr(classId);
        const next = Object.assign({}, appData || {});
        const list = Array.isArray(next.pendingDebateBookChecks)
            ? next.pendingDebateBookChecks.slice()
            : [];
        if (!sid || !cid) {
            next.pendingDebateBookChecks = list;
            return { appData: next, resolvedIds: [] };
        }
        const role = normalizeStr(opts.role) || 'to';
        const resolvedAt = normalizeStr(opts.resolvedAt) || new Date().toISOString();
        const userId = normalizeStr(opts.userId);
        const resolvedIds = [];
        next.pendingDebateBookChecks = list.map((raw) => {
            const ev = normalizePendingDebateBookCheck(raw);
            if (!ev || ev.resolvedAt || ev.studentId !== sid) {
                return raw;
            }
            const match =
                role === 'from'
                    ? ev.fromClassIds.includes(cid)
                    : role === 'any'
                      ? ev.toClassIds.includes(cid) || ev.fromClassIds.includes(cid)
                      : ev.toClassIds.includes(cid);
            if (!match) {
                return raw;
            }
            resolvedIds.push(ev.id);
            return Object.assign({}, ev, {
                resolvedAt,
                resolvedByUserId: userId || null
            });
        });
        return { appData: next, resolvedIds };
    }

    /**
     * transfers: [{ studentId, fromCohortId, toCohortId }]
     * Appends pendingDebateBookChecks onto a copy of appData.
     */
    function recordDebateBookChecksForMoves(appData, transfers, options) {
        const opts = options || {};
        const data = appData && typeof appData === 'object' ? appData : {};
        const byPair = new Map();
        (Array.isArray(transfers) ? transfers : []).forEach((tr) => {
            if (!tr || !tr.studentId) {
                return;
            }
            const fromCohortId = normalizeStr(tr.fromCohortId);
            const toCohortId = normalizeStr(tr.toCohortId);
            const studentId = normalizeStr(tr.studentId);
            if (!fromCohortId || !toCohortId || !studentId) {
                return;
            }
            const key = `${fromCohortId}|${toCohortId}`;
            if (!byPair.has(key)) {
                byPair.set(key, {
                    fromCohortId,
                    toCohortId,
                    studentIds: []
                });
            }
            byPair.get(key).studentIds.push(studentId);
        });
        let events = [];
        byPair.forEach((group) => {
            events = events.concat(
                buildDebateBookCheckEventsForMove(data, {
                    fromCohortId: group.fromCohortId,
                    toCohortId: group.toCohortId,
                    studentIds: group.studentIds,
                    students: opts.students,
                    newId: opts.newId,
                    createdAt: opts.createdAt
                })
            );
        });
        const next = Object.assign({}, data);
        next.pendingDebateBookChecks = appendPendingDebateBookChecks(
            data.pendingDebateBookChecks,
            events
        );
        return { appData: next, events };
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
        if (!Array.isArray(data.debateBookDistributions)) {
            data.debateBookDistributions = [];
            migrated = true;
        }
        if (!Array.isArray(data.pendingDebateBookChecks)) {
            data.pendingDebateBookChecks = [];
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

    /**
     * Normalize TMS subject / syllabus planTitle for fuzzy contains matching.
     */
    function normalizeEssayTitleKey(title) {
        return normalizeStr(title)
            .toLowerCase()
            .replace(/[\s\u00A0._\-–—/\\()[\]{}'"`]+/g, '')
            .replace(/에세이|essay/g, '');
    }

    function findCohortIdForTmsClass(appData, tmsClassId, className) {
        const links = normalizeTmsRosterLinks(appData && appData.tmsRosterLinks);
        const key = normalizeTmsClassKey(className, tmsClassId);
        const byId = key && links[key] ? links[key] : null;
        if (byId && byId.action === 'map' && byId.cohortId) {
            return byId.cohortId;
        }
        // Fallback: scan links by tmsClassId or cleaned class name
        const id = normalizeStr(tmsClassId);
        const cleaned = cleanCohortNameForEssayMatch(className);
        let found = '';
        Object.keys(links).forEach((k) => {
            if (found) {
                return;
            }
            const entry = links[k];
            if (!entry || entry.action !== 'map' || !entry.cohortId) {
                return;
            }
            if (id && normalizeStr(entry.tmsClassId) === id) {
                found = entry.cohortId;
                return;
            }
            if (
                cleaned &&
                cleanCohortNameForEssayMatch(entry.tmsClassName) === cleaned
            ) {
                found = entry.cohortId;
            }
        });
        return found;
    }

    function cleanCohortNameForEssayMatch(name) {
        return normalizeStr(name)
            .replace(/^\[[^\]]+\]\s*/u, '')
            .toLowerCase()
            .replace(/\s+/g, '');
    }

    function listClassesForCohort(appData, cohortId) {
        const cid = normalizeStr(cohortId);
        if (!cid) {
            return [];
        }
        return (Array.isArray(appData && appData.classes) ? appData.classes : []).filter((c) => {
            if (!c || !c.id) {
                return false;
            }
            return getCohortIdsForClass(c).some((id) => normalizeStr(id) === cid);
        });
    }

    function findStudentInCohortByKoreanName(cohort, tmsName) {
        const students = normalizeCohortStudents(cohort);
        const key = koreanMatchKey(tmsName);
        if (!key) {
            return null;
        }
        const exactMatches = students.filter((s) => koreanMatchKey(s.name) === key);
        if (exactMatches.length === 1) {
            return exactMatches[0];
        }
        if (exactMatches.length > 1) {
            return null;
        }
        // Contiguous Hangul variant (same rules as roster fuzzy) — only when unique
        const fuzzy = students.filter((s) => hangulNameVariantPair(s.name, tmsName));
        if (fuzzy.length === 1) {
            return fuzzy[0];
        }
        return null;
    }

    /** Unique roster hit by stored TMS student id (tmsMpidx). */
    function findStudentByTmsMpidx(students, mpidx) {
        const id = normalizeStr(mpidx);
        if (!id) {
            return null;
        }
        const list = Array.isArray(students) ? students : [];
        const matches = list.filter((s) => s && normalizeStr(s.tmsMpidx || s.mpidx) === id);
        return matches.length === 1 ? matches[0] : null;
    }

    /** Prefer non-empty English; never replace a longer CCMU name with a shorter TMS paren hint. */
    function preferLongerNameEn(existing, incoming) {
        const a = normalizeStr(existing);
        const b = normalizeStr(incoming);
        if (!b) {
            return a;
        }
        if (!a) {
            return b;
        }
        return b.length >= a.length ? b : a;
    }

    /**
     * Pick best essay syllabus row for a TMS subject title (+ optional lesson date).
     */
    /**
     * @param {{ termStart?: string, termEnd?: string }} [options]
     */
    function matchEssayAssignmentRow(classData, tmsTitle, lessonDate, options) {
        const opts = options || {};
        const tStart = normalizeStr(opts.termStart);
        const tEnd = normalizeStr(opts.termEnd);
        const want = normalizeStr(opts.assignedDate || lessonDate);
        const wantMonth = yearMonthKey(want);
        const rows = getEssayRowsForAssignedMonth(
            classData && classData.syllabusRows,
            want,
            tStart,
            tEnd
        );
        if (!rows.length) {
            return null;
        }
        const titleKey = normalizeEssayTitleKey(tmsTitle);
        if (!titleKey) {
            return null;
        }
        const scored = [];
        rows.forEach((row) => {
            const isCustom = isCustomEssayAssignmentRow(row);
            if (isCustom && !wantMonth) {
                return;
            }
            const planKey = normalizeEssayTitleKey(row.planTitle || '');
            const detailKey = normalizeEssayTitleKey(row.planDetail || '');
            const hwKey = normalizeEssayTitleKey(row.homework || '');
            let score = 0;
            if (planKey === titleKey) {
                score = 100;
            } else if (planKey.includes(titleKey) || titleKey.includes(planKey)) {
                score = 80;
            } else if (
                (detailKey && titleKey && (detailKey.includes(titleKey) || titleKey.includes(detailKey))) ||
                (hwKey && titleKey && (hwKey.includes(titleKey) || titleKey.includes(hwKey)))
            ) {
                score = 50;
            } else {
                return;
            }
            const rowDate = normalizeStr(row.date);
            if (want && rowDate === want) {
                score += 25;
            } else if (want && rowDate) {
                if (wantMonth && rowDate.slice(0, 7) === wantMonth) {
                    score += 20;
                }
                const diff = Math.abs(
                    (Date.parse(`${rowDate}T12:00:00`) || 0) - (Date.parse(`${want}T12:00:00`) || 0)
                );
                const days = diff / 86400000;
                if (days <= 7) {
                    score += Math.max(0, 15 - Math.floor(days));
                }
            }
            const dateDist = want && rowDate
                ? Math.abs((Date.parse(`${rowDate}T12:00:00`) || 0) - (Date.parse(`${want}T12:00:00`) || 0))
                : Infinity;
            scored.push({ row, score, syllabusRowId: getSyllabusRowKey(row), dateDist });
        });
        scored.sort((a, b) => b.score - a.score || a.dateDist - b.dateDist);
        if (!scored.length) {
            return null;
        }
        if (scored.length > 1 && scored[0].score === scored[1].score && scored[0].dateDist === scored[1].dateDist) {
            return null;
        }
        return scored[0];
    }

    function isEssaySubmissionLate(dueDate, submittedAt) {
        const due = normalizeStr(dueDate);
        const at = normalizeStr(submittedAt);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !/^\d{4}-\d{2}-\d{2}$/.test(at)) {
            return null;
        }
        return compareDateStr(at, due) > 0;
    }

    /** Stable key for one TMS Writing assignment (prefer homeworkitemidx). */
    function normalizeTmsEssayAssignmentKey(assign) {
        if (!assign || typeof assign !== 'object') {
            return '';
        }
        const hw = normalizeStr(assign.homeworkItemIdx);
        if (hw) {
            return `hw:${hw}`;
        }
        const cls = normalizeStr(assign.tmsClassId) || cleanCohortNameForEssayMatch(assign.className);
        const title = normalizeEssayTitleKey(assign.title);
        const date = normalizeStr(assign.lessonDate);
        if (!cls && !title) {
            return '';
        }
        return `n:${cls}|${title}|${date}`;
    }

    function normalizeTmsEssayLinkEntry(raw, keyHint) {
        if (!raw || typeof raw !== 'object') {
            return null;
        }
        const action = raw.action === 'skip' ? 'skip' : raw.action === 'map' ? 'map' : '';
        if (!action) {
            return null;
        }
        const classId = action === 'map' ? normalizeStr(raw.classId) : '';
        const syllabusRowId = action === 'map' ? normalizeStr(raw.syllabusRowId) : '';
        if (action === 'map' && (!classId || !syllabusRowId)) {
            return null;
        }
        return {
            action,
            classId,
            syllabusRowId,
            tmsClassId: normalizeStr(raw.tmsClassId),
            className: normalizeStr(raw.className) || normalizeStr(keyHint),
            title: normalizeStr(raw.title),
            lessonDate: normalizeStr(raw.lessonDate),
            homeworkItemIdx: normalizeStr(raw.homeworkItemIdx)
        };
    }

    function normalizeTmsEssayLinks(raw) {
        const out = {};
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return out;
        }
        Object.keys(raw).forEach((key) => {
            const entry = normalizeTmsEssayLinkEntry(raw[key], key);
            if (!entry) {
                return;
            }
            const k =
                normalizeStr(key) ||
                normalizeTmsEssayAssignmentKey({
                    homeworkItemIdx: entry.homeworkItemIdx,
                    tmsClassId: entry.tmsClassId,
                    className: entry.className,
                    title: entry.title,
                    lessonDate: entry.lessonDate
                });
            if (!k) {
                return;
            }
            out[k] = entry;
        });
        return out;
    }

    function upsertTmsEssayLinks(existingLinks, planRows, classes) {
        const next = normalizeTmsEssayLinks(existingLinks);
        const validClassIds = new Set(
            (Array.isArray(classes) ? classes : [])
                .filter((c) => c && normalizeStr(c.id))
                .map((c) => normalizeStr(c.id))
        );

        (Array.isArray(planRows) ? planRows : []).forEach((row) => {
            if (!row) {
                return;
            }
            const key = normalizeStr(row.key) || normalizeTmsEssayAssignmentKey(row);
            if (!key) {
                return;
            }
            if (row.userAction === 'skip') {
                next[key] = {
                    action: 'skip',
                    classId: '',
                    syllabusRowId: '',
                    tmsClassId: normalizeStr(row.tmsClassId),
                    className: normalizeStr(row.className),
                    title: normalizeStr(row.title),
                    lessonDate: normalizeStr(row.lessonDate),
                    homeworkItemIdx: normalizeStr(row.homeworkItemIdx)
                };
                return;
            }
            if (row.userAction === 'map') {
                const classId = normalizeStr(row.userClassId || row.classId);
                const syllabusRowId = normalizeStr(row.userSyllabusRowId || row.syllabusRowId);
                if (!classId || !syllabusRowId || !validClassIds.has(classId)) {
                    return;
                }
                next[key] = {
                    action: 'map',
                    classId,
                    syllabusRowId,
                    tmsClassId: normalizeStr(row.tmsClassId),
                    className: normalizeStr(row.className),
                    title: normalizeStr(row.title),
                    lessonDate: normalizeStr(row.lessonDate),
                    homeworkItemIdx: normalizeStr(row.homeworkItemIdx)
                };
            }
        });

        Object.keys(next).forEach((k) => {
            const entry = next[k];
            if (entry.action === 'map' && entry.classId && !validClassIds.has(entry.classId)) {
                delete next[k];
            }
        });
        return next;
    }

    function listEssayClasses(appData) {
        return (Array.isArray(appData && appData.classes) ? appData.classes : []).filter((c) => {
            if (!c || !c.id) {
                return false;
            }
            return getEssayRowsFromSyllabus(c.syllabusRows).length > 0;
        });
    }

    function suggestTmsEssayMapping(appData, assign, options) {
        const data = appData || {};
        const key = normalizeTmsEssayAssignmentKey(assign);
        const links = normalizeTmsEssayLinks(data.tmsEssayLinks);
        const saved = key && links[key] ? links[key] : null;
        const suggestOpts = options || {};
        const assignedDate = normalizeStr(assign && (assign.assignedDate || assign.lessonDate));
        const assignedMonth = yearMonthKey(assignedDate);
        const classExists = (id) =>
            (Array.isArray(data.classes) ? data.classes : []).some(
                (c) => c && normalizeStr(c.id) === normalizeStr(id)
            );
        const rowExists = (classId, syllabusRowId) => {
            const classData = (Array.isArray(data.classes) ? data.classes : []).find(
                (c) => c && normalizeStr(c.id) === normalizeStr(classId)
            );
            if (!classData) {
                return false;
            }
            return getEssayRowsForAssignedMonth(
                classData.syllabusRows,
                assignedDate,
                suggestOpts.termStart,
                suggestOpts.termEnd
            ).some(
                (r) => getSyllabusRowKey(r) === normalizeStr(syllabusRowId)
            );
        };

        if (saved && saved.action === 'skip') {
            return {
                key,
                source: 'saved',
                remembered: true,
                userAction: 'skip',
                userClassId: '',
                userSyllabusRowId: '',
                suggestedClassId: '',
                suggestedSyllabusRowId: ''
            };
        }
        if (
            saved &&
            saved.action === 'map' &&
            (!assignedMonth || !yearMonthKey(saved.lessonDate) || yearMonthKey(saved.lessonDate) === assignedMonth) &&
            classExists(saved.classId) &&
            rowExists(saved.classId, saved.syllabusRowId)
        ) {
            return {
                key,
                source: 'saved',
                remembered: true,
                userAction: 'map',
                userClassId: saved.classId,
                userSyllabusRowId: saved.syllabusRowId,
                suggestedClassId: saved.classId,
                suggestedSyllabusRowId: saved.syllabusRowId
            };
        }

        let suggestedClassId = '';
        let suggestedSyllabusRowId = '';
        const cohortId = findCohortIdForTmsClass(data, assign.tmsClassId, assign.className);
        const classes = cohortId ? listClassesForCohort(data, cohortId) : listEssayClasses(data);
        let best = null;
        classes.forEach((classData) => {
            const hit = matchEssayAssignmentRow(classData, assign.title, assignedDate, {
                assignedDate,
                termStart: suggestOpts.termStart,
                termEnd: suggestOpts.termEnd
            });
            if (!hit) {
                return;
            }
            if (!best || hit.score > best.score) {
                best = {
                    classId: normalizeStr(classData.id),
                    syllabusRowId: hit.syllabusRowId,
                    score: hit.score
                };
            }
        });
        if (best) {
            suggestedClassId = best.classId;
            suggestedSyllabusRowId = best.syllabusRowId;
        }

        return {
            key,
            source: 'none',
            remembered: false,
            // Do not auto-map — teacher confirms (like roster sync)
            userAction: 'choose',
            userClassId: '',
            userSyllabusRowId: '',
            suggestedClassId,
            suggestedSyllabusRowId
        };
    }

    /**
     * Build editable plan rows (one per TMS Writing assignment) for confirm/correct UI.
     */
    function buildTmsEssaySyncPlan(appData, scrapeResult, options) {
        const planOpts = options || {};
        const assignments = Array.isArray(scrapeResult && scrapeResult.assignments)
            ? scrapeResult.assignments
            : [];
        const filterClassId = normalizeStr(planOpts.filterClassId);
        const tStart = normalizeStr(planOpts.termStart);
        const tEnd = normalizeStr(planOpts.termEnd);
        const rows = [];
        let filteredOutOfTermCount = 0;
        assignments.forEach((assign) => {
            if (!assign || !assign.title) {
                return;
            }
            const lessonDate = normalizeStr(assign.assignedDate || assign.lessonDate);
            if (
                lessonDate &&
                ((tStart && lessonDate < tStart) || (tEnd && lessonDate > tEnd))
            ) {
                filteredOutOfTermCount += 1;
                return;
            }
            const resolved = suggestTmsEssayMapping(appData, assign, {
                termStart: tStart,
                termEnd: tEnd
            });
            if (filterClassId) {
                const mappedClass = resolved.userClassId || resolved.suggestedClassId || '';
                if (mappedClass && normalizeStr(mappedClass) !== filterClassId) {
                    return;
                }
                if (!mappedClass) {
                    const cohortId = findCohortIdForTmsClass(appData, assign.tmsClassId, assign.className);
                    if (!cohortId) {
                        return;
                    }
                    const matchClasses = listClassesForCohort(appData, cohortId);
                    if (!matchClasses.some((c) => normalizeStr(c.id) === filterClassId)) {
                        return;
                    }
                }
            }
            rows.push({
                key: resolved.key || normalizeTmsEssayAssignmentKey(assign),
                tmsClassId: normalizeStr(assign.tmsClassId),
                className: normalizeStr(assign.className),
                title: normalizeStr(assign.title),
                lessonDate: normalizeStr(assign.lessonDate),
                assignedDate: normalizeStr(assign.assignedDate || assign.lessonDate),
                assignedMonth: yearMonthKey(assign.assignedDate || assign.lessonDate),
                portfolioTitle: normalizeStr(assign.portfolioTitle),
                homeworkItemIdx: normalizeStr(assign.homeworkItemIdx),
                studentCount: Array.isArray(assign.students) ? assign.students.length : 0,
                students: Array.isArray(assign.students)
                    ? assign.students.map((s) => ({
                          name: normalizeStr(s && s.name),
                          nameEn: normalizeStr(s && s.nameEn),
                          mpidx: normalizeStr(s && (s.mpidx || s.tmsMpidx)),
                          submitted: Boolean(s && s.submitted),
                          submittedAt: normalizeStr(s && s.submittedAt)
                      }))
                    : [],
                userAction: resolved.userAction,
                userClassId: resolved.userClassId || '',
                userSyllabusRowId: resolved.userSyllabusRowId || '',
                suggestedClassId: resolved.suggestedClassId || '',
                suggestedSyllabusRowId: resolved.suggestedSyllabusRowId || '',
                remembered: Boolean(resolved.remembered),
                linkSource: resolved.source || 'none'
            });
        });
        rows.sort((a, b) => {
            const byDate = compareDateStr(b.lessonDate, a.lessonDate);
            if (byDate !== 0) {
                return byDate;
            }
            return normalizeStr(a.className).localeCompare(normalizeStr(b.className));
        });
        return { rows, filteredOutOfTermCount };
    }

    /**
     * Expand user-confirmed plan rows into Received updates (not_submitted → submitted only).
     * Honors row.studentResolutions: { [koreanMatchKey]: { action:'map'|'add'|'skip', studentId? } }.
     * Status symbols are ignored for matching; Latin letters still disambiguate.
     */
    function previewTmsEssaySyncPlan(appData, planRows, options) {
        const data = appData || {};
        const opts = options || {};
        const updates = [];
        const skipped = [];
        const unmatched = [];
        const makeId =
            typeof opts.newStudentId === 'function' ? opts.newStudentId : () => newId('stu');

        (Array.isArray(planRows) ? planRows : []).forEach((row, rowIdx) => {
            if (!row) {
                return;
            }
            if (row.userAction === 'skip') {
                skipped.push({
                    reason: 'skipped_by_user',
                    className: row.className || '',
                    title: row.title || '',
                    lessonDate: row.lessonDate || '',
                    studentCount: row.studentCount || 0
                });
                return;
            }
            if (row.userAction !== 'map') {
                unmatched.push({
                    reason: 'unresolved',
                    className: row.className || '',
                    title: row.title || '',
                    lessonDate: row.lessonDate || '',
                    studentCount: row.studentCount || 0
                });
                return;
            }
            const classId = normalizeStr(row.userClassId);
            const syllabusRowId = normalizeStr(row.userSyllabusRowId);
            if (!classId || !syllabusRowId) {
                unmatched.push({
                    reason: 'unresolved',
                    className: row.className || '',
                    title: row.title || '',
                    lessonDate: row.lessonDate || '',
                    studentCount: row.studentCount || 0
                });
                return;
            }
            const classData = (Array.isArray(data.classes) ? data.classes : []).find(
                (c) => c && normalizeStr(c.id) === classId
            );
            if (!classData) {
                unmatched.push({
                    reason: 'class_missing',
                    className: row.className || '',
                    title: row.title || '',
                    classId,
                    syllabusRowId
                });
                return;
            }
            const essayRow = getEssayRowsFromSyllabus(classData.syllabusRows).find(
                (r) => getSyllabusRowKey(r) === syllabusRowId
            );
            if (!essayRow) {
                unmatched.push({
                    reason: 'assignment_missing',
                    className: classData.name || row.className || '',
                    title: row.title || '',
                    classId,
                    syllabusRowId
                });
                return;
            }
            const rowAssignedDate = normalizeStr(row.assignedDate || row.lessonDate);
            if (
                yearMonthKey(essayRow.date) &&
                yearMonthKey(rowAssignedDate) &&
                yearMonthKey(essayRow.date) !== yearMonthKey(rowAssignedDate)
            ) {
                unmatched.push({
                    reason: 'assignment_month_mismatch',
                    className: classData.name || row.className || '',
                    title: row.title || '',
                    classId,
                    syllabusRowId,
                    lessonDate: row.lessonDate || '',
                    assignedDate: rowAssignedDate,
                    assignmentDate: normalizeStr(essayRow.date)
                });
                return;
            }

            const cohortIds = getCohortIdsForClass(classData);
            const cohortList = Array.isArray(data.cohorts) ? data.cohorts : [];
            const primaryCohortId = cohortIds[0] || '';
            const existing = findEssaySubmission(data.essaySubmissions, classId, syllabusRowId);
            const due =
                (existing && existing.ssDueDate) ||
                normalizeStr(essayRow.date) ||
                normalizeStr(row.lessonDate);
            const rememberedResolutions = {};
            cohortIds.forEach((cid) => {
                const cohort = cohortList.find((c) => c && normalizeStr(c.id) === normalizeStr(cid));
                Object.assign(
                    rememberedResolutions,
                    normalizeTmsStudentResolutions(cohort && cohort.tmsStudentResolutions)
                );
            });
            // Session wizard choices override remembered roster/essay resolutions.
            const resolutions = Object.assign(
                {},
                rememberedResolutions,
                normalizeTmsStudentResolutions(row.studentResolutions)
            );
            const rosterStudents = [];
            cohortIds.forEach((cid) => {
                const cohort = cohortList.find((c) => c && normalizeStr(c.id) === normalizeStr(cid));
                normalizeCohortStudents(cohort).forEach((s) => {
                    if (s && s.active !== false) {
                        rosterStudents.push(Object.assign({ cohortId: normalizeStr(cid) }, s));
                    }
                });
            });

            (Array.isArray(row.students) ? row.students : []).forEach((stu) => {
                if (!stu || !stu.submitted || !stu.name) {
                    return;
                }
                // Status labels like 신규학생 ("New student") are never person names.
                if (isRosterStatusNoiseName(stu.name)) {
                    return;
                }
                const tmsKey = koreanMatchKey(stu.name);
                if (!tmsKey) {
                    return;
                }
                const resolution = resolutions[tmsKey];
                if (resolution && resolution.action === 'skip') {
                    skipped.push({
                        reason: 'student_skipped',
                        className: classData.name || row.className || '',
                        title: row.title || '',
                        studentName: stu.name,
                        classId,
                        syllabusRowId,
                        tmsKey,
                        rowIdx
                    });
                    return;
                }

                let student = null;
                let addNew = false;
                if (resolution && resolution.action === 'map') {
                    student = rosterStudents.find(
                        (s) => normalizeStr(s.id) === normalizeStr(resolution.studentId)
                    );
                    if (!student) {
                        unmatched.push({
                            reason: 'student_unmatched',
                            className: classData.name || row.className || '',
                            title: row.title || '',
                            studentName: stu.name,
                            classId,
                            syllabusRowId,
                            tmsKey,
                            rowIdx,
                            needsReview: true
                        });
                        return;
                    }
                } else if (resolution && resolution.action === 'add') {
                    addNew = true;
                } else {
                    student = findStudentByTmsMpidx(rosterStudents, stu.mpidx || stu.tmsMpidx);
                    if (!student) {
                        student = findStudentInCohortByKoreanName(
                            { students: rosterStudents },
                            stu.name
                        );
                    }
                    if (!student) {
                        const unclear = listUnclearTmsStudentMatches(rosterStudents, [stu]);
                        if (unclear.length) {
                            unmatched.push({
                                reason: 'student_unclear',
                                className: classData.name || row.className || '',
                                title: row.title || '',
                                studentName: stu.name,
                                studentNameEn: stu.nameEn || '',
                                classId,
                                syllabusRowId,
                                tmsKey,
                                rowIdx,
                                needsReview: true,
                                candidates: unclear[0].candidates || [],
                                unclearReason: unclear[0].reason
                            });
                            return;
                        }
                        unmatched.push({
                            reason: 'student_unmatched',
                            className: classData.name || row.className || '',
                            title: row.title || '',
                            studentName: stu.name,
                            studentNameEn: stu.nameEn || '',
                            classId,
                            syllabusRowId,
                            tmsKey,
                            rowIdx,
                            needsReview: true,
                            candidates: rosterStudents.map((s) => ({
                                id: s.id,
                                name: s.name,
                                nameEn: s.nameEn || ''
                            }))
                        });
                        return;
                    }
                }

                const studentId = addNew ? `pending_add_${rowIdx}_${tmsKey}` : student.id;
                const parsedIncoming = parseKoreanNameMarks(stu.name);
                const canonicalTmsName = normalizeStr(
                    canonicalKoreanStoredName(stu.name) || parsedIncoming.identityKey || stu.name
                );
                const statusMarks = stu.statusMarks || {
                    isNew: parsedIncoming.isNew,
                    shuttle: parsedIncoming.shuttle,
                    transferIn: parsedIncoming.transferIn
                };
                const studentName = addNew ? canonicalTmsName : student.name;
                const nameUpdated =
                    !addNew && normalizeStr(student.name) !== canonicalTmsName;
                const nameEnToWrite = addNew
                    ? normalizeStr(stu.nameEn)
                    : preferLongerNameEn(student.nameEn, stu.nameEn);
                const nameEnUpdated =
                    !addNew && nameEnToWrite !== normalizeStr(student.nameEn);
                const mpidxToWrite =
                    normalizeStr(stu.mpidx || stu.tmsMpidx) ||
                    (!addNew ? normalizeStr(student.tmsMpidx) : '');
                const mpidxUpdated =
                    !addNew &&
                    Boolean(mpidxToWrite) &&
                    mpidxToWrite !== normalizeStr(student.tmsMpidx);
                const rec = addNew ? null : getEssayRecordForStudent(existing, studentId);
                const prevStatus =
                    rec && ESSAY_STATUSES.includes(rec.status) ? rec.status : 'not_submitted';
                if (!addNew && prevStatus !== 'not_submitted') {
                    skipped.push({
                        reason: 'already_set',
                        classId,
                        className: classData.name || row.className || '',
                        syllabusRowId,
                        assignmentLabel: getEssayAssignmentLabel(essayRow),
                        studentId,
                        studentName,
                        tmsName: canonicalTmsName,
                        prevStatus,
                        tmsTitle: row.title
                    });
                    return;
                }
                const late = isEssaySubmissionLate(due, stu.submittedAt);
                updates.push({
                    classId,
                    className: classData.name || row.className || '',
                    syllabusRowId,
                    assignmentLabel: getEssayAssignmentLabel(essayRow),
                    lessonDate: normalizeStr(essayRow.date) || row.lessonDate || '',
                    studentId,
                    studentName: addNew || nameUpdated ? canonicalTmsName : studentName,
                    tmsName: canonicalTmsName,
                    tmsNameEn: nameEnToWrite,
                    tmsMpidx: mpidxToWrite,
                    statusMarks,
                    prevStatus: 'not_submitted',
                    nextStatus: 'submitted',
                    submittedAt: stu.submittedAt || '',
                    submissionLate: late === true,
                    tmsTitle: row.title,
                    tmsClassId: row.tmsClassId || '',
                    tmsLessonDate: row.lessonDate || '',
                    addStudent: addNew,
                    addCohortId: addNew ? primaryCohortId : '',
                    nameUpdated: Boolean(nameUpdated),
                    nameEnUpdated: Boolean(nameEnUpdated),
                    mpidxUpdated: Boolean(mpidxUpdated),
                    tmsKey,
                    rowIdx
                });
            });
        });

        return {
            updates,
            skipped,
            unmatched,
            summary: {
                updateCount: updates.length,
                skipCount: skipped.length,
                unmatchedCount: unmatched.length,
                assignmentCount: Array.isArray(planRows) ? planRows.length : 0,
                needsReviewCount: unmatched.filter((u) => u && u.needsReview).length
            }
        };
    }

    /**
     * Pending essay TMS student rows that still need map/add/skip.
     */
    function listEssayTmsStudentReviewQueue(appData, planRows) {
        const preview = previewTmsEssaySyncPlan(appData, planRows);
        return (preview.unmatched || []).filter((u) => u && u.needsReview);
    }

    /**
     * Auto-build plan with suggestions applied as provisional maps (for tests / quick path).
     * UI should use buildTmsEssaySyncPlan + user edits + previewTmsEssaySyncPlan instead.
     */
    function previewTmsEssaySync(appData, scrapeResult) {
        const built = buildTmsEssaySyncPlan(appData, scrapeResult);
        const rows = (built.rows || []).map((row) => {
            if (row.userAction === 'skip') {
                return row;
            }
            if (row.userAction === 'map' && row.userClassId && row.userSyllabusRowId) {
                return row;
            }
            // Provisional: use suggestions so unit tests still exercise match path
            if (row.suggestedClassId && row.suggestedSyllabusRowId) {
                return Object.assign({}, row, {
                    userAction: 'map',
                    userClassId: row.suggestedClassId,
                    userSyllabusRowId: row.suggestedSyllabusRowId
                });
            }
            return row;
        });
        const preview = previewTmsEssaySyncPlan(appData, rows);
        preview.planRows = rows;
        return preview;
    }

    /**
     * Apply preview plan rows (only not_submitted → submitted).
     * Also adds new cohort students and adopts TMS display names when requested by updates.
     * @param {Array} essaySubmissions
     * @param {{ updates?: Array }} plan — from previewTmsEssaySyncPlan
     * @param {{ appData?: object, newSubmissionId?: function, newStudentId?: function }} options
     */
    function applyTmsEssaySync(essaySubmissions, plan, options) {
        const opts = options || {};
        const data = opts.appData || {};
        let list = Array.isArray(essaySubmissions) ? essaySubmissions.slice() : [];
        let cohorts = cloneCohorts(data.cohorts);
        const updates = Array.isArray(plan && plan.updates) ? plan.updates : [];
        const applied = [];
        const ignored = [];
        const makeStudentId =
            typeof opts.newStudentId === 'function' ? opts.newStudentId : () => newId('stu');

        // Materialize add-student updates + adopt TMS display names / mpidx before essay records.
        const idRemap = new Map();
        updates.forEach((u) => {
            if (!u) {
                return;
            }
            if (u.addStudent && u.addCohortId) {
                const newIdVal = makeStudentId();
                idRemap.set(u.studentId, newIdVal);
                const idx = cohorts.findIndex(
                    (c) => c && normalizeStr(c.id) === normalizeStr(u.addCohortId)
                );
                if (idx >= 0) {
                    const students = normalizeCohortStudents(cohorts[idx]).slice();
                    const parsedMarks = parseKoreanNameMarks(u.tmsName || u.studentName);
                    const canonicalName = normalizeStr(
                        canonicalKoreanStoredName(u.tmsName || u.studentName) ||
                            parsedMarks.identityKey ||
                            u.tmsName ||
                            u.studentName
                    );
                    students.push(
                        applySyncManagedStudentTags(
                            {
                                id: newIdVal,
                                name: canonicalName,
                                nameEn: normalizeStr(u.tmsNameEn),
                                locationTag: '',
                                sortOrder: students.length,
                                active: true,
                                tags: [],
                                memo: '',
                                archivedAt: '',
                                archiveReason: '',
                                expectedStartDate: '',
                                tmsMpidx: normalizeStr(u.tmsMpidx)
                            },
                            u.statusMarks || {
                                isNew: parsedMarks.isNew,
                                shuttle: parsedMarks.shuttle,
                                transferIn: parsedMarks.transferIn
                            }
                        )
                    );
                    cohorts[idx] = Object.assign({}, cohorts[idx], { students });
                }
                u.studentId = newIdVal;
            } else if (
                u.studentId &&
                (u.nameUpdated || u.nameEnUpdated || u.mpidxUpdated || u.statusMarks)
            ) {
                cohorts = cohorts.map((c) => {
                    if (!c || !Array.isArray(c.students)) {
                        return c;
                    }
                    let changed = false;
                    const students = c.students.map((s) => {
                        if (!s || normalizeStr(s.id) !== normalizeStr(u.studentId)) {
                            return s;
                        }
                        changed = true;
                        const patch = {};
                        if (u.nameUpdated && u.tmsName) {
                            patch.name = normalizeStr(
                                canonicalKoreanStoredName(u.tmsName) || u.tmsName
                            );
                        }
                        if (u.nameEnUpdated || u.tmsNameEn) {
                            patch.nameEn = preferLongerNameEn(s.nameEn, u.tmsNameEn);
                        }
                        if (u.mpidxUpdated || u.tmsMpidx) {
                            const mp = normalizeStr(u.tmsMpidx);
                            if (mp) {
                                patch.tmsMpidx = mp;
                            }
                        }
                        let next = Object.assign({}, s, patch);
                        if (u.statusMarks || u.nameUpdated) {
                            const parsed = parseKoreanNameMarks(u.tmsName || next.name);
                            next = applySyncManagedStudentTags(
                                next,
                                u.statusMarks || {
                                    isNew: parsed.isNew,
                                    shuttle: parsed.shuttle,
                                    transferIn: parsed.transferIn
                                }
                            );
                        }
                        return next;
                    });
                    return changed ? Object.assign({}, c, { students }) : c;
                });
            }
        });

        // Persist essay/session studentResolutions onto mapped class cohorts (same as roster sync).
        const planRows = Array.isArray(opts.planRows) ? opts.planRows : [];
        planRows.forEach((row) => {
            if (!row || !row.studentResolutions) {
                return;
            }
            const sessionResolutions = normalizeTmsStudentResolutions(row.studentResolutions);
            if (!Object.keys(sessionResolutions).length) {
                return;
            }
            const classId = normalizeStr(row.userClassId || row.suggestedClassId);
            if (!classId) {
                return;
            }
            const classData = (Array.isArray(data.classes) ? data.classes : []).find(
                (c) => c && normalizeStr(c.id) === classId
            );
            const cohortIds = getCohortIdsForClass(classData);
            if (!cohortIds.length) {
                return;
            }
            cohorts = cohorts.map((c) => {
                if (!c || !cohortIds.some((id) => normalizeStr(id) === normalizeStr(c.id))) {
                    return c;
                }
                return Object.assign({}, c, {
                    tmsStudentResolutions: mergeTmsStudentResolutions(
                        c.tmsStudentResolutions,
                        sessionResolutions
                    )
                });
            });
        });

        // Group by classId+syllabusRowId
        const byKey = new Map();
        updates.forEach((u) => {
            if (!u || !u.classId || !u.syllabusRowId || !u.studentId) {
                return;
            }
            const key = `${u.classId}\0${u.syllabusRowId}`;
            if (!byKey.has(key)) {
                byKey.set(key, []);
            }
            byKey.get(key).push(u);
        });

        byKey.forEach((rows, key) => {
            const [classId, syllabusRowId] = key.split('\0');
            let submission = findEssaySubmission(list, classId, syllabusRowId);
            if (!submission) {
                const classData = (Array.isArray(data.classes) ? data.classes : []).find(
                    (c) => c && normalizeStr(c.id) === normalizeStr(classId)
                );
                const row =
                    classData &&
                    getEssayRowsFromSyllabus(classData.syllabusRows).find(
                        (r) => getSyllabusRowKey(r) === syllabusRowId
                    );
                submission = {
                    id: opts.newSubmissionId ? opts.newSubmissionId() : newId('essay'),
                    classId,
                    syllabusRowId,
                    lessonDate: (row && row.date) || (rows[0] && rows[0].lessonDate) || '',
                    ssDueDate: (row && row.date) || '',
                    teacherEvalDueDate: row && row.date ? addDaysISO(row.date, 2) : '',
                    records: []
                };
            } else {
                submission = Object.assign({}, submission, {
                    records: Array.isArray(submission.records) ? submission.records.slice() : []
                });
            }

            rows.forEach((u) => {
                const idx = submission.records.findIndex(
                    (r) => r && normalizeStr(r.studentId) === normalizeStr(u.studentId)
                );
                const prev = idx >= 0 ? submission.records[idx] : null;
                const prevStatus =
                    prev && ESSAY_STATUSES.includes(prev.status) ? prev.status : 'not_submitted';
                if (prevStatus !== 'not_submitted') {
                    ignored.push(Object.assign({}, u, { reason: 'already_set', prevStatus }));
                    return;
                }
                const next = Object.assign({}, prev || { studentId: u.studentId, note: '' }, {
                    studentId: u.studentId,
                    status: 'submitted',
                    submittedRetest: false,
                    debateVideoMissing: prev ? Boolean(prev.debateVideoMissing) : false,
                    submissionLate: Boolean(u.submissionLate),
                    overdueDismissed: prev ? Boolean(prev.overdueDismissed) : false
                });
                if (idx >= 0) {
                    submission.records[idx] = next;
                } else {
                    submission.records.push(next);
                }
                applied.push(u);
            });

            list = upsertEssaySubmission(list, submission);
        });

        return {
            essaySubmissions: list,
            cohorts,
            applied,
            ignored,
            summary: { appliedCount: applied.length, ignoredCount: ignored.length }
        };
    }

    function newId(prefix) {
        if (global.CCPUtils && global.CCPUtils.newId) {
            return global.CCPUtils.newId(prefix);
        }
        return `${prefix || 'id'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    }

    /**
     * Map a TMS cohort block { start, end } to a CCMU period using timetable slots.
     * Prefers exact start match, then maximum overlap with [start, end).
     * @returns {{ period: number|null, timeSlotId: string, start: string, end: string, ambiguous: boolean }}
     */
    function mapTmsBlockToPeriod(block, timetableTimeSlots, periodSlotMap) {
        const empty = { period: null, timeSlotId: '', start: '', end: '', ambiguous: false };
        if (!block || !block.start) {
            return empty;
        }
        const start = normalizeStr(block.start);
        const end = normalizeStr(block.end);
        const slots = Array.isArray(timetableTimeSlots) ? timetableTimeSlots.slice() : [];
        if (!slots.length) {
            return Object.assign({}, empty, { start, end });
        }

        function toMinutes(hhmm) {
            const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
            if (!m) {
                return null;
            }
            return Number(m[1]) * 60 + Number(m[2]);
        }

        const startMin = toMinutes(start);
        const endMin = toMinutes(end) != null ? toMinutes(end) : startMin != null ? startMin + 50 : null;
        if (startMin == null) {
            return Object.assign({}, empty, { start, end });
        }

        const scored = slots
            .map((slot) => {
                const sMin = toMinutes(slot && slot.start);
                const eMin = toMinutes(slot && slot.end);
                if (sMin == null || eMin == null) {
                    return null;
                }
                const exactStart = sMin === startMin;
                const overlap = Math.max(0, Math.min(eMin, endMin) - Math.max(sMin, startMin));
                return {
                    slot,
                    exactStart,
                    overlap,
                    startDelta: Math.abs(sMin - startMin)
                };
            })
            .filter(Boolean)
            .sort((a, b) => {
                if (a.exactStart !== b.exactStart) {
                    return a.exactStart ? -1 : 1;
                }
                if (b.overlap !== a.overlap) {
                    return b.overlap - a.overlap;
                }
                return a.startDelta - b.startDelta;
            });

        if (!scored.length || (scored[0].overlap === 0 && !scored[0].exactStart)) {
            return Object.assign({}, empty, { start, end });
        }

        const best = scored[0];
        const tie =
            scored.length > 1 &&
            scored[1].exactStart === best.exactStart &&
            scored[1].overlap === best.overlap &&
            scored[1].startDelta === best.startDelta;
        const timeSlotId = normalizeStr(best.slot.id);
        let period = null;
        const map = periodSlotMap && typeof periodSlotMap === 'object' ? periodSlotMap : {};
        Object.keys(map).forEach((p) => {
            if (map[p] === timeSlotId) {
                const n = parseInt(p, 10);
                if (!Number.isNaN(n)) {
                    period = n;
                }
            }
        });
        if (period == null && global.CCPTeacherTimetable && global.CCPTeacherTimetable.getPeriodNumberForTimeSlot) {
            period = global.CCPTeacherTimetable.getPeriodNumberForTimeSlot(timeSlotId, {
                periodSlotMap: map
            });
        }
        return {
            period,
            timeSlotId,
            start,
            end,
            ambiguous: Boolean(tie)
        };
    }

    /**
     * Propose student placements for a new-term migrate:
     * previous CCMU cohorts → TMS seats on target cohorts.
     * Matching: tmsMpidx, then unique Hangul koreanMatchKey.
     *
     * @param {object[]} previousCohorts
     * @param {Array<{ cohortId: string, cohortName?: string, levelPreset?: string, students: Array<{name,nameEn?,mpidx?}> }>} tmsTargets
     * @returns {{ moves: object[], adds: object[], unmatchedPrevious: object[], unclear: object[] }}
     */
    function buildTermMigrateTransferPlan(previousCohorts, tmsTargets) {
        const prevList = Array.isArray(previousCohorts) ? previousCohorts : [];
        const targets = Array.isArray(tmsTargets) ? tmsTargets : [];

        /** @type {Array<{ studentId: string, name: string, nameEn: string, tmsMpidx: string, fromCohortId: string, fromCohortName: string, previousLevel: string, student: object }>} */
        const prevStudents = [];
        prevList.forEach((cohort) => {
            if (!cohort || isArchiveCohort(cohort)) {
                return;
            }
            const level =
                normalizeStr(cohort.levelPreset) || normalizeStr(cohort.level) || '';
            (Array.isArray(cohort.students) ? cohort.students : []).forEach((raw) => {
                const s = normalizeStudent(raw);
                if (!s || s.active === false) {
                    return;
                }
                prevStudents.push({
                    studentId: s.id,
                    name: s.name,
                    nameEn: s.nameEn,
                    tmsMpidx: s.tmsMpidx,
                    fromCohortId: normalizeStr(cohort.id),
                    fromCohortName: normalizeStr(cohort.name),
                    previousLevel: level,
                    student: s
                });
            });
        });

        const usedPrevIds = new Set();
        const moves = [];
        const adds = [];
        const unclear = [];

        function findByMpidx(mpidx) {
            if (!mpidx) {
                return [];
            }
            return prevStudents.filter((p) => p.tmsMpidx === mpidx && !usedPrevIds.has(p.studentId));
        }

        function findByNameKey(name) {
            const k = koreanMatchKey(name);
            if (!k) {
                return [];
            }
            return prevStudents.filter(
                (p) => !usedPrevIds.has(p.studentId) && koreanMatchKey(p.name) === k
            );
        }

        targets.forEach((target) => {
            if (!target || !target.cohortId) {
                return;
            }
            const toCohortId = normalizeStr(target.cohortId);
            const toCohortName = normalizeStr(target.cohortName) || toCohortId;
            const toLevel = normalizeStr(target.levelPreset) || normalizeStr(target.level) || '';
            (Array.isArray(target.students) ? target.students : []).forEach((raw) => {
                if (!raw || !normalizeStr(raw.name)) {
                    return;
                }
                const tmsName = normalizeStr(raw.name);
                const tmsNameEn = normalizeStr(raw.nameEn);
                const mpidx = normalizeStr(raw.mpidx || raw.tmsMpidx);
                const byMpidx = findByMpidx(mpidx);
                if (byMpidx.length === 1) {
                    const prev = byMpidx[0];
                    usedPrevIds.add(prev.studentId);
                    moves.push({
                        action: 'move',
                        studentId: prev.studentId,
                        name: prev.name,
                        nameEn: tmsNameEn || prev.nameEn,
                        tmsName,
                        tmsMpidx: mpidx,
                        fromCohortId: prev.fromCohortId,
                        fromCohortName: prev.fromCohortName,
                        toCohortId,
                        toCohortName,
                        previousLevel: prev.previousLevel,
                        nextLevel: toLevel,
                        matchedBy: 'mpidx',
                        likelyLevelUp: Boolean(
                            prev.previousLevel && toLevel && prev.previousLevel !== toLevel
                        ),
                        student: prev.student
                    });
                    return;
                }
                const byName = findByNameKey(tmsName);
                if (byName.length === 1) {
                    const prev = byName[0];
                    usedPrevIds.add(prev.studentId);
                    moves.push({
                        action: 'move',
                        studentId: prev.studentId,
                        name: prev.name,
                        nameEn: tmsNameEn || prev.nameEn,
                        tmsName,
                        tmsMpidx: mpidx || prev.tmsMpidx,
                        fromCohortId: prev.fromCohortId,
                        fromCohortName: prev.fromCohortName,
                        toCohortId,
                        toCohortName,
                        previousLevel: prev.previousLevel,
                        nextLevel: toLevel,
                        matchedBy: 'name',
                        likelyLevelUp: Boolean(
                            prev.previousLevel && toLevel && prev.previousLevel !== toLevel
                        ),
                        student: prev.student
                    });
                    return;
                }
                if (byName.length > 1 || byMpidx.length > 1) {
                    unclear.push({
                        action: 'unclear',
                        tmsName,
                        tmsNameEn,
                        tmsMpidx: mpidx,
                        toCohortId,
                        toCohortName,
                        candidates: (byMpidx.length > 1 ? byMpidx : byName).map((p) => ({
                            studentId: p.studentId,
                            name: p.name,
                            nameEn: p.nameEn,
                            fromCohortId: p.fromCohortId,
                            fromCohortName: p.fromCohortName,
                            previousLevel: p.previousLevel
                        }))
                    });
                    return;
                }
                adds.push({
                    action: 'add',
                    tmsName,
                    tmsNameEn,
                    tmsMpidx: mpidx,
                    toCohortId,
                    toCohortName,
                    name: tmsName,
                    nameEn: tmsNameEn
                });
            });
        });

        const unmatchedPrevious = prevStudents
            .filter((p) => !usedPrevIds.has(p.studentId))
            .map((p) => ({
                action: 'unmatched_previous',
                studentId: p.studentId,
                name: p.name,
                nameEn: p.nameEn,
                tmsMpidx: p.tmsMpidx,
                fromCohortId: p.fromCohortId,
                fromCohortName: p.fromCohortName,
                previousLevel: p.previousLevel
            }));

        return { moves, adds, unmatchedPrevious, unclear };
    }

    /**
     * Match a TMS class to a previous-term cohort via saved tmsRosterLinks or name.
     * @returns {{ cohort: object|null, matchedBy: string }}
     */
    function matchPreviousCohortForTmsClass(previousCohorts, tmsLinks, tmsClassId, tmsName) {
        const list = Array.isArray(previousCohorts) ? previousCohorts : [];
        const resolved = resolveTmsRosterLink(tmsLinks, tmsName, list, { tmsClassId });
        if (resolved && resolved.userAction === 'map' && resolved.userTargetId) {
            const cohort = list.find((c) => c && normalizeStr(c.id) === normalizeStr(resolved.userTargetId));
            if (cohort) {
                return { cohort, matchedBy: 'link' };
            }
        }
        if (resolved && resolved.suggestedTargetId) {
            const cohort = list.find(
                (c) => c && normalizeStr(c.id) === normalizeStr(resolved.suggestedTargetId)
            );
            if (cohort) {
                return { cohort, matchedBy: 'name' };
            }
        }
        const cleaned = normalizeStr(tmsName)
            .replace(/^\[[^\]]*\]\s*/u, '')
            .split('^')[0]
            .trim();
        if (cleaned) {
            const hits = list.filter((c) => {
                if (!c || isArchiveCohort(c)) {
                    return false;
                }
                const cn = normalizeStr(c.name);
                return cn === cleaned || normalizeTmsClassKey(c.name) === normalizeTmsClassKey(cleaned);
            });
            if (hits.length === 1) {
                return { cohort: hits[0], matchedBy: 'name' };
            }
        }
        return { cohort: null, matchedBy: '' };
    }

    function classBelongsToCohort(classData, cohortId) {
        const cid = normalizeStr(cohortId);
        if (!classData || !cid) {
            return false;
        }
        if (normalizeStr(classData.cohortId) === cid) {
            return true;
        }
        return (Array.isArray(classData.cohortIds) ? classData.cohortIds : []).some(
            (id) => normalizeStr(id) === cid
        );
    }

    function classHasTeacherUser(classData, userId) {
        const uid = normalizeStr(userId);
        if (!classData || !uid) {
            return false;
        }
        const rows = Array.isArray(classData.classTeachers) ? classData.classTeachers : [];
        if (rows.some((r) => r && normalizeStr(r.userId) === uid)) {
            return true;
        }
        return normalizeStr(classData.assignedTeacherUserId) === uid;
    }

    /**
     * Previous classes the user taught in a cohort (for carry-forward picker).
     */
    function findPreviousClassesForUser(appData, previousCohortId, userId) {
        const classes = (appData && Array.isArray(appData.classes) ? appData.classes : []).filter(
            (cls) =>
                cls &&
                classBelongsToCohort(cls, previousCohortId) &&
                classHasTeacherUser(cls, userId)
        );
        return classes.map((cls) => ({
            id: cls.id,
            name: normalizeStr(cls.name) || cls.id,
            period: cls.period != null ? cls.period : null,
            classTypeId: normalizeStr(cls.classTypeId),
            levelPreset: normalizeStr(cls.levelPreset) || normalizeStr(cls.level)
        }));
    }

    /**
     * Shift class dates / syllabus / debate periods for term migrate carry-forward.
     * Does not remap id — caller assigns new id and cohort links.
     */
    function shiftClassDatesForTerm(classData, monthShift, shiftIsoFn) {
        const cls = classData ? JSON.parse(JSON.stringify(classData)) : null;
        if (!cls) {
            return null;
        }
        const shift =
            typeof shiftIsoFn === 'function'
                ? shiftIsoFn
                : (d, delta) => {
                      const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
                      if (!m) {
                          return d;
                      }
                      let month = Number(m[2]) + Number(delta || 0);
                      let year = Number(m[1]);
                      while (month > 12) {
                          month -= 12;
                          year += 1;
                      }
                      while (month < 1) {
                          month += 12;
                          year -= 1;
                      }
                      return `${year}-${String(month).padStart(2, '0')}-${m[3]}`;
                  };
        const delta = Number(monthShift) || 0;
        if (cls.startDate) {
            cls.startDate = shift(cls.startDate, delta);
        }
        if (cls.endDate) {
            cls.endDate = shift(cls.endDate, delta);
        }
        (cls.syllabusRows || []).forEach((row) => {
            if (row && row.date) {
                row.date = shift(row.date, delta);
            }
        });
        (cls.debateBookPeriods || []).forEach((p) => {
            if (p && p.startDate) {
                p.startDate = shift(p.startDate, delta);
            }
            if (p && p.date) {
                p.date = shift(p.date, delta);
            }
        });
        return cls;
    }

    /**
     * Carry forward one previous class for the current user into a new cohort.
     */
    function carryForwardClassForTerm(prevClass, newCohort, monthShift, userId, options) {
        const opts = options || {};
        const shiftIso = opts.shiftIsoDate;
        const newIdFn = typeof opts.newClassId === 'function' ? opts.newClassId : () => newId('cls');
        if (!prevClass || !newCohort) {
            return null;
        }
        const uid = normalizeStr(userId);
        let cls = shiftClassDatesForTerm(prevClass, monthShift, shiftIso);
        if (!cls) {
            return null;
        }
        cls.id = newIdFn();
        cls.cohortId = newCohort.id;
        cls.cohortIds = [newCohort.id];
        if (opts.startDate) {
            cls.startDate = opts.startDate;
        }
        if (opts.endDate) {
            cls.endDate = opts.endDate;
        }
        if (opts.period != null && opts.period !== '') {
            cls.period = Number(opts.period);
        }
        const rows = Array.isArray(cls.classTeachers) ? cls.classTeachers : [];
        cls.classTeachers = rows
            .filter((r) => r && normalizeStr(r.userId) === uid)
            .map((r) => Object.assign({}, r, { id: newId('ct') }));
        if (uid && !cls.classTeachers.length) {
            cls.classTeachers = [
                {
                    id: newId('ct'),
                    userId: uid,
                    name: normalizeStr(opts.teacherName) || normalizeStr(prevClass.assignedTeacherName),
                    category: normalizeStr(prevClass.teacherCategory) || ''
                }
            ];
        }
        if (uid) {
            cls.assignedTeacherUserId = uid;
            cls.assignedTeacherName =
                (cls.classTeachers[0] && cls.classTeachers[0].name) ||
                normalizeStr(opts.teacherName) ||
                '';
        }
        cls.generatedFromCohort = false;
        return cls;
    }

    /**
     * Prefill iTeachHere / classMode / previousClassId defaults for migrate step 5.
     */
    function buildPerCohortTeachingDefaults(previousAppData, createdCohortMap, userId, options) {
        const opts = options || {};
        const monthShift = Number(opts.monthShift) || 0;
        const shiftIso = opts.shiftIsoDate;
        const termStart = normalizeStr(opts.termStart);
        const termEnd = normalizeStr(opts.termEnd);
        const uid = normalizeStr(userId);
        return (Array.isArray(createdCohortMap) ? createdCohortMap : []).map((row) => {
            const next = Object.assign({}, row);
            const prevId = normalizeStr(row.matchedPreviousCohortId);
            const prevClasses = prevId
                ? findPreviousClassesForUser(previousAppData, prevId, uid)
                : [];
            next.iTeachHere = prevClasses.length > 0;
            next.classMode = prevClasses.length ? 'carry' : next.iTeachHere ? 'new' : null;
            next.previousClassId = prevClasses.length ? prevClasses[0].id : '';
            next.subjectTrack = next.subjectTrack || '';
            next.period =
                next.tmsSuggestedPeriod != null
                    ? next.tmsSuggestedPeriod
                    : prevClasses.length && prevClasses[0].period != null
                      ? prevClasses[0].period
                      : null;
            next.startDate = termStart;
            next.endDate = termEnd;
            if (!next.startDate && previousAppData && previousAppData.termStart && shiftIso) {
                next.startDate = shiftIso(previousAppData.termStart, monthShift);
            }
            if (!next.endDate && previousAppData && previousAppData.termEnd && shiftIso) {
                next.endDate = shiftIso(previousAppData.termEnd, monthShift);
            }
            next.previousClassOptions = prevClasses;
            return next;
        });
    }

    /**
     * Shift calendar events[] by month delta (new ids).
     */
    function shiftCalendarEvents(events, monthShift, options) {
        const opts = options || {};
        const shift =
            typeof opts.shiftIsoDate === 'function'
                ? opts.shiftIsoDate
                : (d, delta) => d;
        const newEventId =
            typeof opts.newEventId === 'function' ? opts.newEventId : () => newId('evt');
        const delta = Number(monthShift) || 0;
        return (Array.isArray(events) ? events : [])
            .filter(Boolean)
            .map((ev) => {
                const copy = JSON.parse(JSON.stringify(ev));
                copy.id = newEventId();
                if (copy.date) {
                    copy.date = shift(copy.date, delta);
                }
                if (copy.startDate) {
                    copy.startDate = shift(copy.startDate, delta);
                }
                if (copy.endDate) {
                    copy.endDate = shift(copy.endDate, delta);
                }
                return copy;
            });
    }

    /**
     * Apply confirmed term-migrate moves into target cohorts (preserves stu_* ids).
     * moves: buildTermMigrateTransferPlan().moves (or subset with optional studentId override for unclear).
     * adds: new TMS-only students.
     * Clears students from previous non-archive cohorts that were moved (via moveStudentsBetweenCohorts
     * when both cohorts exist on the same list; otherwise injects into target and strips from source).
     */
    function applyTermMigrateTransferPlan(cohorts, plan, options) {
        const opts = options || {};
        let list = cloneCohorts(cohorts);
        const makeId =
            typeof opts.newStudentId === 'function' ? opts.newStudentId : () => newId('stu');
        const moves = Array.isArray(plan && plan.moves) ? plan.moves : [];
        const adds = Array.isArray(plan && plan.adds) ? plan.adds : [];
        const applied = [];
        const errors = [];

        moves.forEach((tr) => {
            if (!tr || tr.action === 'skip') {
                return;
            }
            const fromId = normalizeStr(tr.fromCohortId);
            const toId = normalizeStr(tr.toCohortId);
            const sid = normalizeStr(tr.studentId);
            if (!toId || !sid) {
                return;
            }
            if (fromId && fromId !== toId) {
                const result = moveStudentsBetweenCohorts(list, fromId, toId, [sid]);
                if (result.error) {
                    // Target may be a brand-new empty cohort on a cloned doc — inject manually.
                    const from = list.find((c) => c && c.id === fromId);
                    const to = list.find((c) => c && c.id === toId);
                    if (!to) {
                        errors.push({ studentId: sid, error: result.error });
                        return;
                    }
                    const student = (from && (from.students || []).find((s) => s && s.id === sid)) ||
                        (tr.student ? normalizeStudent(Object.assign({}, tr.student, { id: sid })) : null);
                    if (!student) {
                        errors.push({ studentId: sid, error: 'student_missing' });
                        return;
                    }
                    if (from) {
                        from.students = (from.students || []).filter((s) => s && s.id !== sid);
                    }
                    const next = Object.assign({}, student, {
                        name: normalizeStr(tr.tmsName) || student.name,
                        nameEn: normalizeStr(tr.nameEn) || student.nameEn,
                        tmsMpidx: normalizeStr(tr.tmsMpidx) || student.tmsMpidx || ''
                    });
                    to.students = (to.students || []).filter((s) => s && s.id !== sid).concat([next]);
                    applied.push({ studentId: sid, fromCohortId: fromId, toCohortId: toId });
                    return;
                }
                list = result.cohorts;
                const to = list.find((c) => c && c.id === toId);
                if (to) {
                    to.students = (to.students || []).map((s) => {
                        if (!s || s.id !== sid) {
                            return s;
                        }
                        return Object.assign({}, s, {
                            name: normalizeStr(tr.tmsName) || s.name,
                            nameEn: normalizeStr(tr.nameEn) || s.nameEn,
                            tmsMpidx: normalizeStr(tr.tmsMpidx) || s.tmsMpidx || ''
                        });
                    });
                }
                applied.push({ studentId: sid, fromCohortId: fromId, toCohortId: toId });
                return;
            }
            // Same cohort or no from: ensure student exists on target with TMS fields.
            const to = list.find((c) => c && c.id === toId);
            if (!to) {
                errors.push({ studentId: sid, error: 'target_missing' });
                return;
            }
            const existing = (to.students || []).find((s) => s && s.id === sid);
            if (existing) {
                Object.assign(existing, {
                    name: normalizeStr(tr.tmsName) || existing.name,
                    nameEn: normalizeStr(tr.nameEn) || existing.nameEn,
                    tmsMpidx: normalizeStr(tr.tmsMpidx) || existing.tmsMpidx || ''
                });
            } else if (tr.student) {
                to.students = (to.students || []).concat([
                    normalizeStudent(
                        Object.assign({}, tr.student, {
                            id: sid,
                            name: normalizeStr(tr.tmsName) || tr.student.name,
                            nameEn: normalizeStr(tr.nameEn) || tr.student.nameEn,
                            tmsMpidx: normalizeStr(tr.tmsMpidx) || ''
                        })
                    )
                ]);
            }
            applied.push({ studentId: sid, fromCohortId: fromId, toCohortId: toId });
        });

        adds.forEach((row) => {
            if (!row || row.action === 'skip') {
                return;
            }
            const toId = normalizeStr(row.toCohortId);
            const to = list.find((c) => c && c.id === toId);
            if (!to) {
                errors.push({ name: row.tmsName || row.name, error: 'target_missing' });
                return;
            }
            const name = normalizeStr(row.tmsName || row.name);
            if (!name) {
                return;
            }
            const student = {
                id: makeId(),
                name,
                nameEn: normalizeStr(row.tmsNameEn || row.nameEn),
                locationTag: '',
                sortOrder: (to.students || []).length,
                active: true,
                tags: [],
                memo: '',
                archivedAt: '',
                archiveReason: '',
                expectedStartDate: '',
                tmsMpidx: normalizeStr(row.tmsMpidx || row.mpidx)
            };
            to.students = (to.students || []).concat([student]);
            applied.push({ studentId: student.id, fromCohortId: '', toCohortId: toId, added: true });
        });

        return { cohorts: list, applied, errors };
    }

    const api = {
        ATTENDANCE_STATUSES,
        HOMEWORK_GRADES,
        HOMEWORK_SELF_CHECKS,
        ESSAY_STATUSES,
        DEBATE_BOOK_STATUSES,
        DEBATE_BOOK_TERM_PERIOD_KEY,
        STUDENT_TAGS,
        OFF_ROSTER_TAG,
        ARCHIVE_REASONS,
        ARCHIVE_COHORT_ID,
        DEFAULT_ARCHIVE_RETENTION_DAYS,
        koreanNameKey,
        koreanMarkAgnosticKey,
        koreanMatchKey,
        koreanNameDisplayKey,
        parseKoreanNameMarks,
        canonicalKoreanStoredName,
        isRosterStatusNoiseName,
        nameDisambiguatorSuffix,
        nameStatusSymbolSuffix,
        nameLatinDisambiguatorSuffix,
        hangulCoreKey,
        koreanDisplayCompareKey,
        koreanDisplaysDiffer,
        hasNameDisambiguator,
        hasLatinNameDisambiguator,
        hangulSyllables,
        hangulCoreKey,
        koreanDisplayCompareKey,
        koreanDisplaysDiffer,
        hangulNameVariantPair,
        shareThreeHangulSyllables,
        pairFuzzyRosterMatches,
        listUnclearTmsStudentMatches,
        findArchivedStudentForTmsMatch,
        normalizeTmsStudentResolutions,
        mergeTmsStudentResolutions,
        applyRememberedTmsStudentResolutions,
        withStudentTag,
        withoutStudentTag,
        mergeRosterByKoreanName,
        matchHomeroomTeacherByName,
        resolveTmsHomeroomForRow,
        applyTmsHomeroomToCohort,
        applyTmsRosterPlan,
        detectTmsRosterTransfers,
        applyTmsRosterTransfers,
        mapTmsBlockToPeriod,
        buildTermMigrateTransferPlan,
        applyTermMigrateTransferPlan,
        matchPreviousCohortForTmsClass,
        findPreviousClassesForUser,
        carryForwardClassForTerm,
        shiftClassDatesForTerm,
        buildPerCohortTeachingDefaults,
        shiftCalendarEvents,
        classBelongsToCohort,
        classHasTeacherUser,
        buildTmsEssaySyncPlan,
        previewTmsEssaySyncPlan,
        listEssayTmsStudentReviewQueue,
        previewTmsEssaySync,
        applyTmsEssaySync,
        matchEssayAssignmentRow,
        normalizeEssayTitleKey,
        normalizeTmsEssayAssignmentKey,
        normalizeTmsEssayLinks,
        upsertTmsEssayLinks,
        suggestTmsEssayMapping,
        listEssayClasses,
        findCohortIdForTmsClass,
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
        restoreStudentsFromArchive,
        moveStudentsBetweenCohorts,
        deleteStudentPermanently,
        deleteStudentsPermanently,
        purgeStudentRecords,
        mergeStudentRecords,
        listSuspectedDuplicateStudents,
        preferLongerNameEn,
        findStudentByTmsMpidx,
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
        essayDebateVideoMissingCount,
        essayResubmitCountForClass,
        isEssaySsOverdueISO,
        isEssayReceivedStatus,
        isEssayReceivedLate,
        isEssaySubmissionOverdue,
        isEssayAwaitingSubmission,
        isEssaySyllabusRow,
        isEssayAssignmentRow,
        isCustomEssayAssignmentRow,
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
        listEssayOverdueRows,
        listEssayOutstandingStudentRows,
        listEssayClassSummaryRows,
        groupEssayStudentRowsByClass,
        daysUntilISO,
        yearMonthKey,
        sameCalendarMonth,
        getEssayRowsFromSyllabus,
        getEssayRowsForTerm,
        getEssayRowsForAssignedMonth,
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
        classUsesMonthlyDebateBooks,
        normalizeDebateBookPeriodKey,
        formatDebateBookOptionLabel,
        listDebateBookMonthOptions,
        getDebateBookTermOption,
        pickDefaultDebateBookPeriodKey,
        normalizeDebateBookRecord,
        normalizeDebateBookDistribution,
        findDebateBookDistribution,
        upsertDebateBookDistribution,
        getDebateBookRecordForStudent,
        ensureDebateBookRecordsForStudents,
        emptyDebateBookStatusCounts,
        countDebateBookByStatus,
        applyDebateBookRecordPatch,
        resolveDebateBookIssuedDate,
        resolveDebateBookPeriodKeyForClass,
        debateBookAlertCountsForClass,
        normalizeDebateBookSummaryKey,
        listDebateBookSummaryEntries,
        listDebateBookSummaryRows,
        classTracksDebateBookDelivery,
        listDebateBookClassesForCohort,
        snapshotPriorDebateBookStatus,
        normalizePendingDebateBookCheck,
        buildDebateBookCheckEventsForMove,
        appendPendingDebateBookChecks,
        listPendingDebateBookChecks,
        resolveDebateBookCheck,
        resolveDebateBookChecksForStudentOnClass,
        recordDebateBookChecksForMoves,
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
