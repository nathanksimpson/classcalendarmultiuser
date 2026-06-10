/**
 * @mention helpers for class day notes — roster lookup, autocomplete, parse, render.
 */
(function (global) {
    const DISAMBIG_SEP = ' · ';

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
        return Array.from(byId.values()).sort(
            (a, b) => a.student.sortOrder - b.student.sortOrder
                || String(a.student.name || '').localeCompare(String(b.student.name || ''))
        );
    }

    function buildMentionEntry(row, nameCounts, tier) {
        const student = row.student || {};
        const name = String(student.name || '').trim();
        const nameEn = String(student.nameEn || '').trim();
        const baseName = name || nameEn;
        const cohortName = String(row.cohortName || '').trim();
        const insertLabel = cohortName ? `${cohortName} ${baseName}` : baseName;
        const searchParts = [name, nameEn, insertLabel, cohortName].filter(Boolean);
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

    /**
     * @returns {Array<{ studentId, name, nameEn, insertLabel, searchHay, cohortName, tier }>}
     */
    function getStudentsForMentions(classId, cohorts, classes) {
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

    function sortMentionCandidates(list) {
        return [...(list || [])].sort((a, b) => {
            const tierDiff = (a.tier || 0) - (b.tier || 0);
            if (tierDiff !== 0) {
                return tierDiff;
            }
            return String(a.insertLabel || '').localeCompare(String(b.insertLabel || ''));
        });
    }

    function filterMentionCandidates(students, query) {
        const q = String(query || '').trim().toLowerCase();
        const list = students || [];
        const filtered = !q
            ? list.slice()
            : list.filter((s) => s.searchHay.includes(q));
        return sortMentionCandidates(filtered);
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
            labels.push(`${baseName}${DISAMBIG_SEP}${cohortName}`);
            labels.push(`${cohortName} ${baseName}`);
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
            const label = String(s.insertLabel || '').trim();
            if (!label || seen.has(label)) {
                return;
            }
            seen.add(label);
            out.push({ studentId: s.studentId, label });
        });
        return out;
    }

    function findMentionsInText(text, classId, cohorts, classes) {
        const students = getStudentsForMentions(classId, cohorts, classes);
        const labels = [];
        students.forEach((s) => {
            mentionMatchLabels(s).forEach((label) => {
                labels.push({ studentId: s.studentId, label });
            });
        });
        const str = String(text || '');
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
        const token = `@${label} `;
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
            const primary = cohortName && baseName ? `${cohortName} ${baseName}` : baseName;
            [primary, st.name, st.nameEn]
                .concat(cohortName && baseName ? [`${baseName}${DISAMBIG_SEP}${cohortName}`] : [])
                .filter(Boolean)
                .forEach((label) => {
                    labels.push({ studentId: sid, label: String(label).trim() });
                });
        });
        labels.sort((a, b) => b.label.length - a.label.length);
        return labels;
    }

    function scanMentionSpans(text, labels) {
        const str = String(text || '');
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
                found.push({ start: at, end, studentId: matched.studentId });
                i = end;
            } else {
                i = at + 1;
            }
        }
        return found;
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
        const classMentions = scanMentionSpans(str, labels);
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
        const between = value.slice(at + 1, pos).replace(/\s+$/, '');
        if (!between) {
            return false;
        }
        const insertLabels = collectInsertLabelsForClass(classId, cohorts, classes);
        const exact = insertLabels.find((entry) => entry.label === between);
        if (!exact) {
            return false;
        }
        const hasLongerPrefix = insertLabels.some(
            (entry) => entry.label !== between && entry.label.startsWith(`${between} `)
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

        let wrap = textarea.closest('.day-note-mention-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'autocomplete-wrapper day-note-mention-wrap';
            textarea.parentNode.insertBefore(wrap, textarea);
            wrap.appendChild(textarea);
        }

        let dropdown = wrap.querySelector('.day-note-mention-dropdown');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'autocomplete-dropdown day-note-mention-dropdown';
            dropdown.setAttribute('role', 'listbox');
            wrap.appendChild(dropdown);
        }

        let activeIndex = -1;
        let visibleCandidates = [];
        let mentionCaret = null;
        let suppressMentionRefresh = false;

        function hideDropdown() {
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

        function renderDropdown(candidates, query) {
            visibleCandidates = candidates;
            activeIndex = candidates.length ? 0 : -1;
            dropdown.replaceChildren();
            if (!candidates.length) {
                const empty = document.createElement('div');
                empty.className = 'autocomplete-item autocomplete-item--empty';
                empty.textContent = t('dayNoteMentionNoMatch');
                dropdown.appendChild(empty);
                dropdown.classList.add('active');
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
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'autocomplete-item';
                btn.setAttribute('role', 'option');
                btn.dataset.index = String(idx);
                btn.dataset.insertLabel = c.insertLabel || '';
                const primary = c.insertLabel || c.name || c.nameEn;
                const secondaryParts = [];
                if (c.name && c.name !== primary) {
                    secondaryParts.push(c.name);
                }
                if (c.nameEn && c.nameEn !== primary && c.nameEn !== c.name) {
                    secondaryParts.push(c.nameEn);
                }
                const secondary = secondaryParts.join(' · ');
                btn.innerHTML = secondary
                    ? `<span class="item-name">${escapeHtml(primary)}</span><span class="item-details">${escapeHtml(secondary)}</span>`
                    : `<span class="item-name">${escapeHtml(primary)}</span>`;
                if (idx === activeIndex) {
                    btn.classList.add('selected');
                }
                btn.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    const label = ev.currentTarget.dataset.insertLabel || c.insertLabel;
                    const range = resolveMentionInsertRange(textarea, mentionQueryOpts());
                    insertSelectedLabel(label, range);
                });
                dropdown.appendChild(btn);
            });
            dropdown.classList.add('active');
        }

        function syncActiveItem() {
            dropdown.querySelectorAll('.autocomplete-item').forEach((el, idx) => {
                el.classList.toggle('selected', idx === activeIndex);
            });
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
            const opts = mentionQueryOpts();
            const classId = opts.classId;
            const students = getStudentsForMentions(classId, opts.cohorts, opts.classes);
            const ctx = getMentionQueryAtCursor(textarea, opts);
            if (!ctx) {
                mentionCaret = null;
                hideDropdown();
                return;
            }
            mentionCaret = { atIndex: ctx.atIndex, end: ctx.end };
            if (!students.length) {
                hideDropdown();
                return;
            }
            const candidates = filterMentionCandidates(students, ctx.query);
            renderDropdown(candidates.slice(0, 20), ctx.query);
        }

        textarea.addEventListener('input', () => {
            if (suppressMentionRefresh) {
                return;
            }
            refreshDropdown();
        });

        textarea.addEventListener('keydown', (ev) => {
            if (ev.key === '@' && !ev.isComposing) {
                setTimeout(refreshDropdown, 0);
            }
            if (!dropdown.classList.contains('active') || !visibleCandidates.length) {
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
                activeIndex = Math.max(activeIndex - 1, 0);
                syncActiveItem();
            } else if (ev.key === 'Enter' && activeIndex >= 0) {
                ev.preventDefault();
                const picked = visibleCandidates[activeIndex];
                const range = resolveMentionInsertRange(textarea, mentionQueryOpts());
                insertSelectedLabel(picked.insertLabel, range);
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                hideDropdown();
            }
        });

        textarea.addEventListener('blur', () => {
            setTimeout(hideDropdown, 150);
        });
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
        filterMentionCandidates,
        findMentionsInText,
        syncTaggedStudentIdsFromText,
        syncTaggedStudentIdsForNote,
        insertMentionAtCursor,
        resolveStudentDisplay,
        renderMentionHtml,
        getMentionQueryAtCursor,
        resolveMentionInsertRange,
        attachMentionAutocomplete
    };
})(typeof window !== 'undefined' ? window : global);
