/**
 * @mention helpers for class day notes — roster lookup, autocomplete, parse, render.
 */
(function (global) {
    const DISAMBIG_SEP = ' · ';

    function isCoarsePointerDevice() {
        return typeof global.matchMedia === 'function'
            && global.matchMedia('(pointer: coarse)').matches;
    }

    function tuneDayNoteTextareaForTouchInput(textarea) {
        if (!textarea) {
            return;
        }
        textarea.setAttribute('autocomplete', 'off');
        if (!isCoarsePointerDevice()) {
            return;
        }
        textarea.spellcheck = false;
        textarea.setAttribute('autocorrect', 'off');
        textarea.setAttribute('autocapitalize', 'sentences');
    }

    /**
     * Keep keyboard highlight when the filtered candidate list changes.
     * @returns {number} index in nextCandidates, or -1
     */
    function preserveMentionActiveIndex(prevIndex, prevCandidates, nextCandidates) {
        if (prevIndex < 0 || !Array.isArray(prevCandidates) || !Array.isArray(nextCandidates)) {
            return -1;
        }
        const picked = prevCandidates[prevIndex];
        if (!picked || !picked.studentId) {
            return -1;
        }
        const nextIdx = nextCandidates.findIndex((c) => c && c.studentId === picked.studentId);
        return nextIdx >= 0 ? nextIdx : -1;
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getDomain() {
        return typeof global.CCPClassroomDomain !== 'undefined' ? global.CCPClassroomDomain : null;
    }

    function findClassById(classId, classes) {
        const cid = String(classId || '').trim();
        if (!cid) {
            return null;
        }
        return (classes || []).find((c) => c && c.id === cid) || null;
    }

    function getAllActiveStudentRows(cohorts) {
        const domain = getDomain();
        if (!domain) {
            return [];
        }
        const byId = new Map();
        (cohorts || []).forEach((cohort) => {
            if (!cohort || domain.isArchiveCohort(cohort)) {
                return;
            }
            domain.normalizeCohortStudents(cohort)
                .filter((s) => s && s.active !== false)
                .forEach((student) => {
                    if (!byId.has(student.id)) {
                        byId.set(student.id, {
                            student,
                            cohortId: cohort.id,
                            cohortName: domain.normalizeStr(cohort.name)
                        });
                    }
                });
        });
        return Array.from(byId.values()).sort((a, b) => {
            if (domain.compareStudentNames) {
                return domain.compareStudentNames(a.student, b.student);
            }
            return String(a.student.name || '').localeCompare(String(b.student.name || ''), 'ko', {
                sensitivity: 'base'
            });
        });
    }

    function buildCohortInsertLabel(cohortName, baseName) {
        const cohort = String(cohortName || '').trim();
        const name = String(baseName || '').trim();
        if (cohort && name) {
            return `${cohort}: ${name}`;
        }
        return name || cohort;
    }

    function buildLegacyCohortLabel(cohortName, baseName) {
        const cohort = String(cohortName || '').trim();
        const name = String(baseName || '').trim();
        if (cohort && name) {
            return `${cohort} ${name}`;
        }
        return '';
    }

    function buildMentionEntry(row, nameCounts, tier) {
        const student = row.student || {};
        const name = String(student.name || '').trim();
        const nameEn = String(student.nameEn || '').trim();
        const baseName = name || nameEn;
        const cohortName = String(row.cohortName || '').trim();
        const insertLabel = buildCohortInsertLabel(cohortName, baseName);
        const legacyLabel = buildLegacyCohortLabel(cohortName, baseName);
        const searchParts = [name, nameEn, insertLabel, legacyLabel, cohortName].filter(Boolean);
        if (cohortName && baseName) {
            searchParts.push(`${baseName}${DISAMBIG_SEP}${cohortName}`);
        }
        return {
            studentId: student.id,
            name,
            nameEn,
            insertLabel,
            cohortName,
            tier,
            searchHay: searchParts.join(' ').toLowerCase()
        };
    }

    const studentsForMentionsCache = new Map();

    function rosterFingerprint(classId, cohorts, classes) {
        const cid = String(classId || '').trim();
        let fp = `${cid}|`;
        (cohorts || []).forEach((cohort) => {
            if (!cohort) {
                return;
            }
            const activeCount = (cohort.students || []).filter((s) => s && s.active !== false).length;
            fp += `${cohort.id}:${activeCount};`;
        });
        const classData = findClassById(cid, classes);
        fp += `|${(classData && classData.cohortIds) || []}`;
        return fp;
    }

    function computeStudentsForMentions(classId, cohorts, classes) {
        const domain = getDomain();
        if (!domain) {
            return [];
        }
        const classData = findClassById(classId, classes);
        const classRows = classData ? domain.resolveStudentsForClass(classData, cohorts) : [];
        const classIdSet = new Set(classRows.map((row) => row.student && row.student.id).filter(Boolean));
        const allRows = getAllActiveStudentRows(cohorts);
        const nameCounts = new Map();
        allRows.forEach((row) => {
            const student = row.student || {};
            [student.name, student.nameEn].forEach((n) => {
                const key = String(n || '').trim();
                if (key) {
                    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
                }
            });
        });
        const tier0 = classRows.map((row) => buildMentionEntry(row, nameCounts, 0));
        const tier1 = allRows
            .filter((row) => row.student && !classIdSet.has(row.student.id))
            .map((row) => buildMentionEntry(row, nameCounts, 1));
        return tier0.concat(tier1);
    }

    /**
     * @returns {Array<{ studentId, name, nameEn, insertLabel, searchHay, cohortName, tier }>}
     */
    function getStudentsForMentions(classId, cohorts, classes) {
        const fp = rosterFingerprint(classId, cohorts, classes);
        const cached = studentsForMentionsCache.get(fp);
        if (cached) {
            return cached;
        }
        const result = computeStudentsForMentions(classId, cohorts, classes);
        studentsForMentionsCache.set(fp, result);
        return result;
    }

    function sortMentionCandidates(list) {
        return [...(list || [])].sort((a, b) => {
            const tierDiff = (a.tier || 0) - (b.tier || 0);
            if (tierDiff !== 0) {
                return tierDiff;
            }
            return String(a.insertLabel || '').localeCompare(String(b.insertLabel || ''));
        });
    }

    /**
     * Higher score = better autocomplete match within the same roster tier.
     * @returns {number}
     */
    function scoreMentionCandidate(entry, query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q || !entry) {
            return 0;
        }
        const insertLabel = String(entry.insertLabel || '').toLowerCase();
        const name = String(entry.name || '').toLowerCase();
        const nameEn = String(entry.nameEn || '').toLowerCase();
        let score = 0;
        if (insertLabel === q) {
            score = 100;
        } else if (insertLabel.startsWith(q)) {
            score = 90;
        } else if (name.startsWith(q) || nameEn.startsWith(q)) {
            score = 80;
        } else if (entry.searchHay && entry.searchHay.includes(q)) {
            score = 50;
        } else {
            return 0;
        }
        const lenBonus = Math.max(0, 10 - Math.min(10, String(entry.insertLabel || '').length / 5));
        return score + lenBonus;
    }

    /**
     * Gray inline completion suffix shown after the typed @query.
     * @returns {string}
     */
    function getMentionCompletionSuffix(query, candidate) {
        if (!candidate) {
            return '';
        }
        const q = String(query || '');
        const ql = q.toLowerCase();
        const insertLabel = String(candidate.insertLabel || '');
        const il = insertLabel.toLowerCase();
        if (il.startsWith(ql)) {
            return `${insertLabel.slice(q.length)} `;
        }
        const name = String(candidate.name || '');
        const nameEn = String(candidate.nameEn || '');
        if (name.toLowerCase().startsWith(ql) || nameEn.toLowerCase().startsWith(ql)) {
            return `${insertLabel} `;
        }
        return '';
    }

    function filterMentionCandidates(students, query) {
        const q = String(query || '').trim().toLowerCase();
        const list = students || [];
        const filtered = !q
            ? list.slice()
            : list.filter((s) => s.searchHay.includes(q));
        return [...filtered].sort((a, b) => {
            const tierDiff = (a.tier || 0) - (b.tier || 0);
            if (tierDiff !== 0) {
                return tierDiff;
            }
            if (q) {
                const scoreDiff = scoreMentionCandidate(b, q) - scoreMentionCandidate(a, q);
                if (scoreDiff !== 0) {
                    return scoreDiff;
                }
            }
            return String(a.insertLabel || '').localeCompare(String(b.insertLabel || ''));
        });
    }

    /**
     * @returns {Array<{ start, end, studentId, label }>}
     */
    function mentionMatchLabels(studentEntry) {
        const seen = new Set();
        const out = [];
        const cohortName = String(studentEntry.cohortName || '').trim();
        const baseName = String(studentEntry.name || studentEntry.nameEn || '').trim();
        const labels = [
            studentEntry.insertLabel,
            studentEntry.name,
            studentEntry.nameEn
        ];
        if (cohortName && baseName) {
            labels.push(buildCohortInsertLabel(cohortName, baseName));
            labels.push(buildLegacyCohortLabel(cohortName, baseName));
            labels.push(`${baseName}${DISAMBIG_SEP}${cohortName}`);
        }
        labels.forEach((label) => {
            const key = String(label || '').trim();
            if (!key || seen.has(key)) {
                return;
            }
            seen.add(key);
            out.push(key);
        });
        return out;
    }

    /** Cohort-qualified labels only — used for bare (no @) scanning to limit false positives. */
    function mentionBareMatchLabels(studentEntry) {
        const seen = new Set();
        const out = [];
        const cohortName = String(studentEntry.cohortName || '').trim();
        const baseName = String(studentEntry.name || studentEntry.nameEn || '').trim();
        const labels = [studentEntry.insertLabel];
        if (cohortName && baseName) {
            labels.push(buildCohortInsertLabel(cohortName, baseName));
            labels.push(buildLegacyCohortLabel(cohortName, baseName));
        }
        labels.forEach((label) => {
            const key = String(label || '').trim();
            if (!key || seen.has(key)) {
                return;
            }
            seen.add(key);
            out.push(key);
        });
        return out;
    }

    function isMentionLabelBoundary(next) {
        return next === undefined || next === ' ' || next === '\n' || next === '\r' || next === '\t';
    }

    function isBareLabelStart(str, index) {
        if (index <= 0) {
            return true;
        }
        const prev = str[index - 1];
        return prev === ' ' || prev === '\n' || prev === '\r' || prev === '\t';
    }

    function rangesOverlap(a, b) {
        return a.start < b.end && b.start < a.end;
    }

    function findLongestMentionLabelAt(rest, labels) {
        let best = null;
        (labels || []).forEach((entry) => {
            const label = String(entry.label || '').trim();
            if (!label || !rest.startsWith(label)) {
                return;
            }
            const next = rest[label.length];
            if (!isMentionLabelBoundary(next)) {
                return;
            }
            if (!best || label.length > best.label.length) {
                best = { studentId: entry.studentId, label };
            }
        });
        return best;
    }

    function collectInsertLabelsForClass(classId, cohorts, classes) {
        const seen = new Set();
        const out = [];
        getStudentsForMentions(classId, cohorts, classes).forEach((s) => {
            mentionMatchLabels(s).forEach((label) => {
                if (!label || seen.has(label)) {
                    return;
                }
                seen.add(label);
                out.push({ studentId: s.studentId, label });
            });
        });
        return out;
    }

    function findAtMentionsInText(str, labels) {
        const found = [];
        let i = 0;
        while (i < str.length) {
            const at = str.indexOf('@', i);
            if (at < 0) {
                break;
            }
            const rest = str.slice(at + 1);
            const matched = findLongestMentionLabelAt(rest, labels);
            if (matched) {
                const end = at + 1 + matched.label.length;
                found.push({
                    start: at,
                    end,
                    studentId: matched.studentId,
                    label: matched.label
                });
                i = end;
            } else {
                i = at + 1;
            }
        }
        return found;
    }

    function findBareMentionsInText(str, labels, occupied) {
        const found = [];
        const occupiedRanges = occupied || [];
        let i = 0;
        while (i < str.length) {
            if (occupiedRanges.some((r) => i >= r.start && i < r.end)) {
                i += 1;
                continue;
            }
            if (!isBareLabelStart(str, i)) {
                i += 1;
                continue;
            }
            const rest = str.slice(i);
            const matched = findLongestMentionLabelAt(rest, labels);
            if (matched) {
                const end = i + matched.label.length;
                const span = {
                    start: i,
                    end,
                    studentId: matched.studentId,
                    label: matched.label
                };
                if (!occupiedRanges.some((r) => rangesOverlap(r, span))
                    && !found.some((r) => rangesOverlap(r, span))) {
                    found.push(span);
                    i = end;
                    continue;
                }
            }
            i += 1;
        }
        return found;
    }

    function findMentionsInText(text, classId, cohorts, classes) {
        const students = getStudentsForMentions(classId, cohorts, classes);
        const atLabels = [];
        const bareLabels = [];
        students.forEach((s) => {
            mentionMatchLabels(s).forEach((label) => {
                atLabels.push({ studentId: s.studentId, label });
            });
            mentionBareMatchLabels(s).forEach((label) => {
                bareLabels.push({ studentId: s.studentId, label });
            });
        });
        const str = String(text || '');
        const atMentions = findAtMentionsInText(str, atLabels);
        const bareMentions = findBareMentionsInText(str, bareLabels, atMentions);
        return atMentions.concat(bareMentions).sort((a, b) => a.start - b.start);
    }

    function syncTaggedStudentIdsFromText(text, classId, cohorts, classes) {
        const mentions = findMentionsInText(text, classId, cohorts, classes);
        const seen = new Set();
        const out = [];
        mentions.forEach((m) => {
            if (!seen.has(m.studentId)) {
                seen.add(m.studentId);
                out.push(m.studentId);
            }
        });
        return out;
    }

    function insertMentionAtCursor(textarea, label, range) {
        if (!textarea || !label) {
            return;
        }
        const token = `${label} `;
        const value = textarea.value || '';
        let atIdx;
        let end;
        if (range && range.atIndex != null) {
            atIdx = range.atIndex;
            end = range.end != null ? range.end : value.length;
        } else {
            const endPos = textarea.selectionEnd != null
                ? textarea.selectionEnd
                : (textarea.selectionStart != null ? textarea.selectionStart : value.length);
            const before = value.slice(0, endPos);
            atIdx = before.lastIndexOf('@');
            if (atIdx < 0) {
                atIdx = endPos;
            }
            end = endPos;
        }
        const prefix = value.slice(0, atIdx);
        const after = value.slice(end);
        textarea.value = `${prefix}${token}${after}`;
        const pos = prefix.length + token.length;
        textarea.selectionStart = pos;
        textarea.selectionEnd = pos;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
    }

    function resolveStudentDisplay(studentId, cohorts) {
        const domain = getDomain();
        if (!domain || !studentId) {
            return null;
        }
        const found = domain.findStudentInCohorts(studentId, cohorts);
        if (!found || !found.student) {
            return null;
        }
        const student = found.student;
        const cohort = found.cohort;
        return {
            id: student.id,
            name: String(student.name || '').trim(),
            nameEn: String(student.nameEn || '').trim(),
            cohortName: cohort && cohort.name ? String(cohort.name).trim() : ''
        };
    }

    function collectRenderMentionLabels(taggedStudentIds, resolveStudent) {
        const labels = [];
        const idSet = Array.isArray(taggedStudentIds) ? taggedStudentIds : [];
        idSet.forEach((sid) => {
            const st = typeof resolveStudent === 'function' ? resolveStudent(sid) : null;
            if (!st) {
                return;
            }
            const cohortName = String(st.cohortName || '').trim();
            const baseName = st.name || st.nameEn || '';
            const primary = buildCohortInsertLabel(cohortName, baseName);
            const legacy = buildLegacyCohortLabel(cohortName, baseName);
            [primary, legacy, st.name, st.nameEn]
                .concat(cohortName && baseName ? [`${baseName}${DISAMBIG_SEP}${cohortName}`] : [])
                .filter(Boolean)
                .forEach((label) => {
                    labels.push({ studentId: sid, label: String(label).trim() });
                });
        });
        labels.sort((a, b) => b.label.length - a.label.length);
        return labels;
    }

    function collectRenderBareMentionLabels(taggedStudentIds, resolveStudent) {
        const labels = [];
        const idSet = Array.isArray(taggedStudentIds) ? taggedStudentIds : [];
        idSet.forEach((sid) => {
            const st = typeof resolveStudent === 'function' ? resolveStudent(sid) : null;
            if (!st) {
                return;
            }
            const cohortName = String(st.cohortName || '').trim();
            const baseName = st.name || st.nameEn || '';
            const primary = buildCohortInsertLabel(cohortName, baseName);
            const legacy = buildLegacyCohortLabel(cohortName, baseName);
            [primary, legacy].filter(Boolean).forEach((label) => {
                labels.push({ studentId: sid, label: String(label).trim() });
            });
        });
        labels.sort((a, b) => b.label.length - a.label.length);
        return labels;
    }

    function scanMentionSpans(text, labels, bareLabels) {
        const str = String(text || '');
        const atMentions = findAtMentionsInText(str, labels).map((m) => ({
            start: m.start,
            end: m.end,
            studentId: m.studentId
        }));
        const bare = findBareMentionsInText(str, bareLabels || labels, atMentions).map((m) => ({
            start: m.start,
            end: m.end,
            studentId: m.studentId
        }));
        return atMentions.concat(bare).sort((a, b) => a.start - b.start);
    }

    /**
     * @param {function} [resolveStudent] (studentId) => { name, nameEn } | null
     */
    function renderMentionHtml(text, taggedStudentIds, resolveStudent) {
        const str = String(text || '');
        if (!str) {
            return '';
        }
        const labels = collectRenderMentionLabels(taggedStudentIds, resolveStudent);
        if (!labels.length) {
            return escapeHtml(str);
        }
        const bareLabels = collectRenderBareMentionLabels(taggedStudentIds, resolveStudent);
        const classMentions = scanMentionSpans(str, labels, bareLabels);
        if (!classMentions.length) {
            return escapeHtml(str);
        }
        const knownIds = new Set(Array.isArray(taggedStudentIds) ? taggedStudentIds : []);
        const parts = [];
        let cursor = 0;
        classMentions.forEach((m) => {
            if (m.start > cursor) {
                parts.push(escapeHtml(str.slice(cursor, m.start)));
            }
            const segment = str.slice(m.start, m.end);
            const isKnown = !knownIds.size || (m.studentId && knownIds.has(m.studentId));
            if (isKnown) {
                parts.push(`<span class="day-note-mention">${escapeHtml(segment)}</span>`);
            } else {
                parts.push(escapeHtml(segment));
            }
            cursor = m.end;
        });
        if (cursor < str.length) {
            parts.push(escapeHtml(str.slice(cursor)));
        }
        return parts.join('');
    }

    function isCaretAfterCompletedMention(value, at, pos, classId, cohorts, classes) {
        const between = value.slice(at + 1, pos);
        if (!between) {
            return false;
        }
        const trimmed = between.replace(/\s+$/, '');
        const insertLabels = collectInsertLabelsForClass(classId, cohorts, classes);
        const sorted = [...insertLabels].sort((a, b) => b.label.length - a.label.length);
        for (const entry of sorted) {
            const label = entry.label;
            if (!between.startsWith(label)) {
                continue;
            }
            const rest = between.slice(label.length);
            if (rest === '' || /^\s+$/.test(rest)) {
                const hasLongerPrefix = insertLabels.some(
                    (e) => e.label !== label && e.label.startsWith(`${trimmed} `)
                );
                if (hasLongerPrefix) {
                    return false;
                }
                return true;
            }
            if (/^\s+\S/.test(rest)) {
                return true;
            }
            return false;
        }
        const exact = insertLabels.find((entry) => entry.label === trimmed);
        if (!exact) {
            return false;
        }
        const hasLongerPrefix = insertLabels.some(
            (entry) => entry.label !== trimmed && entry.label.startsWith(`${trimmed} `)
        );
        if (hasLongerPrefix) {
            return false;
        }
        const mentionEnd = at + 1 + exact.label.length;
        const gap = value.slice(mentionEnd, pos);
        return /^\s*$/.test(gap);
    }

    function resolveMentionInsertRange(textarea, opts) {
        if (!textarea) {
            return null;
        }
        const value = textarea.value || '';
        const end = textarea.selectionEnd != null
            ? textarea.selectionEnd
            : (textarea.selectionStart != null ? textarea.selectionStart : value.length);
        const before = value.slice(0, end);
        const at = before.lastIndexOf('@');
        if (at < 0) {
            return null;
        }
        const between = before.slice(at + 1);
        if (/[\n\r]/.test(between)) {
            return null;
        }
        return { atIndex: at, end };
    }

    function getMentionQueryAtCursor(textarea, opts) {
        const value = textarea.value || '';
        const pos = textarea.selectionStart != null ? textarea.selectionStart : value.length;
        const before = value.slice(0, pos);
        const at = before.lastIndexOf('@');
        if (at < 0) {
            return null;
        }
        const between = before.slice(at + 1);
        if (/[\n\r]/.test(between)) {
            return null;
        }
        if (opts && opts.classId != null && !opts.forInsert) {
            const classId = opts.classId;
            const cohorts = opts.cohorts || [];
            const classes = opts.classes || [];
            if (isCaretAfterCompletedMention(value, at, pos, classId, cohorts, classes)) {
                return null;
            }
        }
        return { atIndex: at, query: between, end: pos };
    }

    /**
     * @param {HTMLTextAreaElement} textarea
     * @param {function} getClassId () => string
     * @param {object} deps
     * @param {function} deps.getCohorts () => array
     * @param {function} deps.getClasses () => array
     * @param {function} deps.t (key) => string
     */
    function attachMentionAutocomplete(textarea, getClassId, deps) {
        if (!textarea || textarea.dataset.mentionBound === '1') {
            return;
        }
        if (!textarea.parentNode) {
            return;
        }
        textarea.dataset.mentionBound = '1';
        tuneDayNoteTextareaForTouchInput(textarea);
        const getCohorts = deps && typeof deps.getCohorts === 'function' ? deps.getCohorts : () => [];
        const getClasses = deps && typeof deps.getClasses === 'function' ? deps.getClasses : () => [];
        const t = deps && typeof deps.t === 'function' ? deps.t : (k) => k;

        function mentionQueryOpts() {
            return {
                classId: typeof getClassId === 'function' ? getClassId() : '',
                cohorts: getCohorts(),
                classes: getClasses()
            };
        }

        let wrap = null;
        let dropdown = null;
        let ghost = null;
        let fullUiReady = false;
        let activeIndex = -1;
        let visibleCandidates = [];
        let mentionCaret = null;
        let mentionQuery = '';
        let suppressMentionRefresh = false;
        let isComposing = false;

        function ensureFullMentionUi() {
            if (fullUiReady || !textarea.parentNode) {
                return;
            }
            fullUiReady = true;
            wrap = textarea.closest('.day-note-mention-wrap');
            if (!wrap) {
                wrap = document.createElement('div');
                wrap.className = 'autocomplete-wrapper day-note-mention-wrap';
                textarea.parentNode.insertBefore(wrap, textarea);
                wrap.appendChild(textarea);
            }
            ghost = wrap.querySelector('.day-note-mention-ghost');
            if (!ghost) {
                ghost = document.createElement('div');
                ghost.className = 'day-note-mention-ghost';
                ghost.setAttribute('aria-hidden', 'true');
                wrap.insertBefore(ghost, textarea);
            }
            dropdown = wrap.querySelector('.day-note-mention-dropdown');
            if (!dropdown) {
                dropdown = document.createElement('div');
                dropdown.className = 'autocomplete-dropdown day-note-mention-dropdown';
                dropdown.setAttribute('role', 'listbox');
                wrap.appendChild(dropdown);
            }
            textarea.addEventListener('keydown', onMentionKeydown);
            textarea.addEventListener('blur', onMentionBlur);
            textarea.addEventListener('scroll', syncGhostScroll);
            textarea.addEventListener('compositionstart', onMentionCompositionStart);
        }

        function syncGhostScroll() {
            if (!ghost) {
                return;
            }
            ghost.scrollTop = textarea.scrollTop;
            ghost.scrollLeft = textarea.scrollLeft;
        }

        function clearMentionGhost() {
            if (!ghost || !wrap) {
                return;
            }
            ghost.replaceChildren();
            ghost.textContent = '';
            wrap.classList.remove('day-note-mention-wrap--ghost-active');
        }

        function syncMentionGhost(query) {
            if (!ghost || !wrap) {
                return;
            }
            if (isComposing) {
                clearMentionGhost();
                return;
            }
            const q = String(query || '').trim();
            if (!q || activeIndex < 0 || !visibleCandidates.length) {
                clearMentionGhost();
                return;
            }
            const picked = visibleCandidates[activeIndex];
            const suffix = getMentionCompletionSuffix(query, picked);
            if (!suffix) {
                clearMentionGhost();
                return;
            }
            const value = textarea.value || '';
            const end = textarea.selectionEnd != null ? textarea.selectionEnd : value.length;
            ghost.innerHTML = `${escapeHtml(value.slice(0, end))}<span class="day-note-mention-ghost-suffix">${escapeHtml(suffix)}</span>`;
            wrap.classList.add('day-note-mention-wrap--ghost-active');
            syncGhostScroll();
        }

        function hideDropdown() {
            mentionCaret = null;
            mentionQuery = '';
            clearMentionGhost();
            if (!dropdown || !dropdown.classList.contains('active')) {
                activeIndex = -1;
                visibleCandidates = [];
                return;
            }
            dropdown.classList.remove('active');
            dropdown.replaceChildren();
            activeIndex = -1;
            visibleCandidates = [];
        }

        function appendDivider(label) {
            const div = document.createElement('div');
            div.className = 'autocomplete-hint day-note-mention-tier-label';
            div.textContent = label;
            dropdown.appendChild(div);
        }

        function restoreTextareaFocusIfNeeded(hadFocus, selStart, selEnd) {
            if (!hadFocus) {
                return;
            }
            textarea.focus();
            if (selStart != null) {
                textarea.selectionStart = selStart;
                textarea.selectionEnd = selEnd != null ? selEnd : selStart;
            }
        }

        function renderDropdown(candidates, query) {
            ensureFullMentionUi();
            if (!dropdown) {
                return;
            }
            const hadFocus = document.activeElement === textarea;
            const selStart = textarea.selectionStart;
            const selEnd = textarea.selectionEnd;
            const prevCandidates = visibleCandidates;
            const prevIndex = activeIndex;
            visibleCandidates = candidates;
            const preserved = preserveMentionActiveIndex(prevIndex, prevCandidates, candidates);
            if (preserved >= 0) {
                activeIndex = preserved;
            } else if (String(query || '').trim() && candidates.length) {
                activeIndex = 0;
            } else {
                activeIndex = -1;
            }
            mentionQuery = String(query || '');
            dropdown.replaceChildren();
            if (!candidates.length) {
                activeIndex = -1;
                mentionQuery = String(query || '');
                const empty = document.createElement('div');
                empty.className = 'autocomplete-item autocomplete-item--empty';
                empty.textContent = t('dayNoteMentionNoMatch');
                dropdown.appendChild(empty);
                dropdown.classList.add('active');
                restoreTextareaFocusIfNeeded(hadFocus, selStart, selEnd);
                clearMentionGhost();
                return;
            }
            const showDividers = !String(query || '').trim();
            let lastTier = null;
            candidates.forEach((c, idx) => {
                if (showDividers && c.tier !== lastTier) {
                    if (c.tier === 0) {
                        appendDivider(t('dayNoteMentionClassStudents'));
                    } else if (c.tier === 1 && lastTier !== 1) {
                        appendDivider(t('dayNoteMentionOtherStudents'));
                    }
                    lastTier = c.tier;
                }
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.setAttribute('role', 'option');
                item.dataset.index = String(idx);
                item.dataset.insertLabel = c.insertLabel || '';
                const primary = c.insertLabel || c.name || c.nameEn;
                const secondaryParts = [];
                if (c.name && c.name !== primary) {
                    secondaryParts.push(c.name);
                }
                if (c.nameEn && c.nameEn !== primary && c.nameEn !== c.name) {
                    secondaryParts.push(c.nameEn);
                }
                const secondary = secondaryParts.join(' · ');
                item.innerHTML = secondary
                    ? `<span class="item-name">${escapeHtml(primary)}</span><span class="item-details">${escapeHtml(secondary)}</span>`
                    : `<span class="item-name">${escapeHtml(primary)}</span>`;
                if (idx === activeIndex) {
                    item.classList.add('selected');
                }
                item.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    const label = ev.currentTarget.dataset.insertLabel || c.insertLabel;
                    const range = resolveMentionInsertRange(textarea, mentionQueryOpts());
                    insertSelectedLabel(label, range);
                });
                dropdown.appendChild(item);
            });
            dropdown.classList.add('active');
            restoreTextareaFocusIfNeeded(hadFocus, selStart, selEnd);
            syncMentionGhost(query);
        }

        function syncActiveItem() {
            if (!dropdown) {
                return;
            }
            dropdown.querySelectorAll('.autocomplete-item').forEach((el, idx) => {
                el.classList.toggle('selected', idx === activeIndex);
            });
            syncMentionGhost(mentionQuery);
        }

        function insertSelectedLabel(label, rangeOverride) {
            const range = rangeOverride
                || (mentionCaret
                    ? { atIndex: mentionCaret.atIndex, end: mentionCaret.end }
                    : resolveMentionInsertRange(textarea, mentionQueryOpts()));
            suppressMentionRefresh = true;
            insertMentionAtCursor(textarea, label, range);
            mentionCaret = null;
            hideDropdown();
            setTimeout(() => {
                suppressMentionRefresh = false;
            }, 0);
        }

        function refreshDropdown() {
            ensureFullMentionUi();
            const opts = mentionQueryOpts();
            const ctx = getMentionQueryAtCursor(textarea, opts);
            if (!ctx) {
                mentionCaret = null;
                hideDropdown();
                return;
            }
            mentionCaret = { atIndex: ctx.atIndex, end: ctx.end };
            const students = getStudentsForMentions(opts.classId, opts.cohorts, opts.classes);
            if (!students.length) {
                hideDropdown();
                return;
            }
            const candidates = filterMentionCandidates(students, ctx.query);
            renderDropdown(candidates.slice(0, 20), ctx.query);
        }

        function caretHasMentionTrigger() {
            const value = textarea.value || '';
            const pos = textarea.selectionStart != null ? textarea.selectionStart : value.length;
            return value.slice(0, pos).lastIndexOf('@') >= 0;
        }

        function onMentionInput(ev) {
            if (suppressMentionRefresh || (ev && ev.isComposing)) {
                if (ev && ev.isComposing) {
                    isComposing = true;
                    clearMentionGhost();
                }
                return;
            }
            isComposing = false;
            if (!caretHasMentionTrigger()) {
                if (dropdown && dropdown.classList.contains('active')) {
                    mentionCaret = null;
                    hideDropdown();
                }
                return;
            }
            refreshDropdown();
        }

        function onMentionCompositionStart() {
            isComposing = true;
            clearMentionGhost();
        }

        function onMentionCompositionEnd() {
            isComposing = false;
            if (suppressMentionRefresh) {
                return;
            }
            if (caretHasMentionTrigger()) {
                refreshDropdown();
            }
        }

        function acceptMentionSelection(ev) {
            if (activeIndex < 0 || !visibleCandidates.length) {
                return false;
            }
            ev.preventDefault();
            const picked = visibleCandidates[activeIndex];
            const range = resolveMentionInsertRange(textarea, mentionQueryOpts());
            insertSelectedLabel(picked.insertLabel, range);
            return true;
        }

        function onMentionKeydown(ev) {
            if (!dropdown || !dropdown.classList.contains('active') || !visibleCandidates.length) {
                if (ev.key === 'Escape') {
                    hideDropdown();
                }
                return;
            }
            if (ev.key === 'ArrowDown') {
                ev.preventDefault();
                activeIndex = Math.min(activeIndex + 1, visibleCandidates.length - 1);
                syncActiveItem();
            } else if (ev.key === 'ArrowUp') {
                ev.preventDefault();
                activeIndex = Math.max(activeIndex - 1, -1);
                syncActiveItem();
            } else if ((ev.key === 'Enter' || ev.key === 'Tab') && activeIndex >= 0) {
                acceptMentionSelection(ev);
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                hideDropdown();
            }
        }

        function onMentionBlur() {
            setTimeout(hideDropdown, 150);
        }

        textarea.addEventListener('input', onMentionInput);
        textarea.addEventListener('compositionend', onMentionCompositionEnd);
        ensureFullMentionUi();
    }

    function syncTaggedStudentIdsForNote(text, classId, cohorts, classes) {
        return syncTaggedStudentIdsFromText(text, classId, cohorts, classes);
    }

    global.CCPDayNoteMentions = {
        DISAMBIG_SEP,
        escapeHtml,
        getAllActiveStudentRows,
        getStudentsForMentions,
        sortMentionCandidates,
        scoreMentionCandidate,
        getMentionCompletionSuffix,
        filterMentionCandidates,
        findMentionsInText,
        syncTaggedStudentIdsFromText,
        syncTaggedStudentIdsForNote,
        insertMentionAtCursor,
        resolveStudentDisplay,
        renderMentionHtml,
        getMentionQueryAtCursor,
        resolveMentionInsertRange,
        attachMentionAutocomplete,
        preserveMentionActiveIndex,
        isCoarsePointerDevice,
        tuneDayNoteTextareaForTouchInput
    };
})(typeof window !== 'undefined' ? window : global);
