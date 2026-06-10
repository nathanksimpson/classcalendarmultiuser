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
        const needsDisambig = tier === 1
            || (name && (nameCounts.get(name) || 0) > 1)
            || (nameEn && (nameCounts.get(nameEn) || 0) > 1);
        const insertLabel = needsDisambig && cohortName
            ? `${baseName}${DISAMBIG_SEP}${cohortName}`
            : baseName;
        const searchParts = [name, nameEn, insertLabel, cohortName].filter(Boolean);
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
        [studentEntry.insertLabel, studentEntry.name, studentEntry.nameEn].forEach((label) => {
            const key = String(label || '').trim();
            if (!key || seen.has(key)) {
                return;
            }
            seen.add(key);
            out.push(key);
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
        labels.sort((a, b) => b.label.length - a.label.length);
        const str = String(text || '');
        const found = [];
        let i = 0;
        while (i < str.length) {
            const at = str.indexOf('@', i);
            if (at < 0) {
                break;
            }
            const rest = str.slice(at + 1);
            let matched = null;
            for (const entry of labels) {
                if (!rest.startsWith(entry.label)) {
                    continue;
                }
                const next = rest[entry.label.length];
                if (next !== undefined && next !== ' ' && next !== '\n' && next !== '\r' && next !== '\t') {
                    continue;
                }
                matched = {
                    start: at,
                    end: at + 1 + entry.label.length,
                    studentId: entry.studentId,
                    label: entry.label
                };
                break;
            }
            if (matched) {
                found.push(matched);
                i = matched.end;
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

    function insertMentionAtCursor(textarea, label) {
        if (!textarea || !label) {
            return;
        }
        const token = `@${label} `;
        const start = textarea.selectionStart != null ? textarea.selectionStart : textarea.value.length;
        const end = textarea.selectionEnd != null ? textarea.selectionEnd : start;
        const before = textarea.value.slice(0, start);
        const after = textarea.value.slice(end);
        const atIdx = before.lastIndexOf('@');
        const prefix = atIdx >= 0 ? before.slice(0, atIdx) : before;
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
        return {
            id: student.id,
            name: String(student.name || '').trim(),
            nameEn: String(student.nameEn || '').trim()
        };
    }

    /**
     * @param {function} [resolveStudent] (studentId) => { name, nameEn } | null
     */
    function renderMentionHtml(text, taggedStudentIds, resolveStudent) {
        const str = String(text || '');
        if (!str) {
            return '';
        }
        const classMentions = [];
        let i = 0;
        while (i < str.length) {
            const at = str.indexOf('@', i);
            if (at < 0) {
                break;
            }
            let end = at + 1;
            while (end < str.length && str[end] !== ' ' && str[end] !== '\n' && str[end] !== '\r' && str[end] !== '\t') {
                end += 1;
            }
            if (end > at + 1) {
                classMentions.push({ start: at, end });
            }
            i = at + 1;
        }
        if (!classMentions.length) {
            return escapeHtml(str);
        }
        const parts = [];
        let cursor = 0;
        classMentions.forEach((m) => {
            if (m.start > cursor) {
                parts.push(escapeHtml(str.slice(cursor, m.start)));
            }
            const segment = str.slice(m.start, m.end);
            const isKnown = Array.isArray(taggedStudentIds) && taggedStudentIds.length
                ? (() => {
                    const label = segment.slice(1);
                    return taggedStudentIds.some((sid) => {
                        const st = typeof resolveStudent === 'function' ? resolveStudent(sid) : null;
                        if (!st) {
                            return false;
                        }
                        const names = [st.name, st.nameEn].filter(Boolean);
                        return names.some((n) => label === n || label.startsWith(`${n}${DISAMBIG_SEP}`));
                    });
                })()
                : true;
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

    function getMentionQueryAtCursor(textarea) {
        const value = textarea.value || '';
        const pos = textarea.selectionStart != null ? textarea.selectionStart : value.length;
        const before = value.slice(0, pos);
        const at = before.lastIndexOf('@');
        if (at < 0) {
            return null;
        }
        const between = before.slice(at + 1);
        if (/\s/.test(between)) {
            return null;
        }
        return { atIndex: at, query: between };
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
        textarea.dataset.mentionBound = '1';
        const getCohorts = deps && typeof deps.getCohorts === 'function' ? deps.getCohorts : () => [];
        const getClasses = deps && typeof deps.getClasses === 'function' ? deps.getClasses : () => [];
        const t = deps && typeof deps.t === 'function' ? deps.t : (k) => k;

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
                const primary = c.name || c.nameEn || c.insertLabel;
                const secondary = c.name && c.nameEn && c.name !== c.nameEn ? c.nameEn : '';
                btn.innerHTML = secondary
                    ? `<span class="item-name">${escapeHtml(primary)}</span><span class="item-details">${escapeHtml(secondary)}</span>`
                    : `<span class="item-name">${escapeHtml(primary)}</span>`;
                if (idx === activeIndex) {
                    btn.classList.add('selected');
                }
                btn.addEventListener('mousedown', (ev) => {
                    ev.preventDefault();
                    insertMentionAtCursor(textarea, c.insertLabel);
                    hideDropdown();
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

        function refreshDropdown() {
            const classId = typeof getClassId === 'function' ? getClassId() : '';
            const students = getStudentsForMentions(classId, getCohorts(), getClasses());
            const ctx = getMentionQueryAtCursor(textarea);
            if (!ctx) {
                hideDropdown();
                return;
            }
            if (!students.length) {
                hideDropdown();
                return;
            }
            const candidates = filterMentionCandidates(students, ctx.query);
            renderDropdown(candidates.slice(0, 20), ctx.query);
        }

        textarea.addEventListener('input', () => {
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
                insertMentionAtCursor(textarea, visibleCandidates[activeIndex].insertLabel);
                hideDropdown();
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
        attachMentionAutocomplete
    };
})(typeof window !== 'undefined' ? window : global);
