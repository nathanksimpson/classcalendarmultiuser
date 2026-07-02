/**
 * Collapsible classroom context header (class picker, stats, date/HW controls).
 */
(function (global) {
    let hooks = null;
    let collapsed = false;
    let collapseOverridden = false;
    let resizeBound = false;
    let mode = 'attendance';
    let classComboboxOpen = false;
    let classComboboxHighlight = -1;
    let classComboboxOutsideBound = false;

    const NARROW_HEADER_MQ = '(max-width: 1024px)';

    function syncCollapsedForViewport() {
        if (collapseOverridden || typeof window === 'undefined' || !window.matchMedia) {
            return;
        }
        collapsed = window.matchMedia(NARROW_HEADER_MQ).matches;
    }

    function bindViewportCollapseListener() {
        if (resizeBound || typeof window === 'undefined' || !window.matchMedia) {
            return;
        }
        resizeBound = true;
        const mq = window.matchMedia(NARROW_HEADER_MQ);
        const onChange = () => syncCollapsedForViewport();
        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', onChange);
        } else if (typeof mq.addListener === 'function') {
            mq.addListener(onChange);
        }
    }

    function domain() {
        return global.CCPClassroomDomain;
    }

    function t(key) {
        if (hooks && hooks.t) {
            return hooks.t(key);
        }
        if (typeof global.t === 'function') {
            return global.t(key);
        }
        return key;
    }

    function escapeHtml(s) {
        if (typeof CCPUtils !== 'undefined' && CCPUtils.escapeHtml) {
            return CCPUtils.escapeHtml(s);
        }
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escapeAttr(s) {
        return escapeHtml(s).replace(/"/g, '&quot;');
    }

    function getTeacherLine(classData) {
        if (!classData || !Array.isArray(classData.classTeachers)) {
            return '';
        }
        return classData.classTeachers
            .filter((row) => row && (row.name || row.userId))
            .map((row) => {
                const cat = row.category ? ` (${row.category})` : '';
                return `${row.name || row.userId}${cat}`;
            })
            .join(', ');
    }

    function classSearchHaystack(classData) {
        if (!classData) {
            return '';
        }
        const teachers = getTeacherLine(classData);
        return [
            classData.name,
            classData.id,
            classData.grade,
            classData.levelPreset,
            classData.levelCustom,
            classData.subject,
            teachers
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
    }

    function filterClassesForSearch(classes, query, selectedClassId) {
        const q = (query || '').trim().toLowerCase();
        let filtered = classes;
        if (q) {
            filtered = classes.filter((c) => classSearchHaystack(c).includes(q));
        }
        if (selectedClassId && !filtered.some((c) => c.id === selectedClassId)) {
            const selected = classes.find((c) => c.id === selectedClassId);
            if (selected) {
                filtered = [selected, ...filtered];
            }
        }
        return filtered;
    }

    function renderStats(session, studentCount) {
        const d = domain();
        const counts = d && session ? d.countAttendanceStatuses(session) : null;
        const total = studentCount || 0;
        const present = counts ? counts.present + counts.late : 0;
        const absent = counts ? counts.absent : 0;
        const late = counts ? counts.late : 0;
        const early = counts ? counts.early_leave : 0;
        return {
            total,
            present,
            absent,
            late,
            early
        };
    }

    function getClassDisplayLabel(classData, essaySubmissions) {
        if (!classData) {
            return '';
        }
        let label = classData.name || classData.id || '';
        if (mode === 'essays' && domain()) {
            const resubmitBadge = domain().essayResubmitCountForClass(essaySubmissions, classData.id);
            if (resubmitBadge > 0) {
                label += ` (${resubmitBadge} ${t('classroomEssayResubmitBadge')})`;
            }
        }
        return label;
    }

    function buildClassOptions(classes, selectedClassId, essaySubmissions) {
        return classes
            .map((c) => {
                const sel = c.id === selectedClassId ? ' selected' : '';
                const label = getClassDisplayLabel(c, essaySubmissions);
                return `<option value="${escapeHtml(c.id)}"${sel}>${escapeHtml(label)}</option>`;
            })
            .join('');
    }

    function buildClassComboboxListHtml(state) {
        const s = state || {};
        const classes = Array.isArray(s.classes) ? s.classes : [];
        const classSearchQuery = s.classSearchQuery != null ? String(s.classSearchQuery) : '';
        const filtered = filterClassesForSearch(classes, classSearchQuery, s.classId);
        if (!filtered.length) {
            return `<p class="classroom-header-class-combobox-empty section-hint">${escapeHtml(t('classroomEssayClassComboboxEmpty'))}</p>`;
        }
        return filtered
            .map((c, index) => {
                const selected = c.id === s.classId ? ' is-selected' : '';
                const highlighted = index === classComboboxHighlight ? ' is-highlighted' : '';
                const label = getClassDisplayLabel(c, s.essaySubmissions);
                return `<button type="button" class="module-list-item classroom-header-class-combobox-item${selected}${highlighted}" role="option" data-class-id="${escapeAttr(c.id)}" aria-selected="${c.id === s.classId ? 'true' : 'false'}">${escapeHtml(label)}</button>`;
            })
            .join('');
    }

    function getSelectedClassName(state) {
        const s = state || {};
        const classes = Array.isArray(s.classes) ? s.classes : [];
        const selected = classes.find((c) => c && c.id === s.classId);
        return selected ? getClassDisplayLabel(selected, s.essaySubmissions) : '';
    }

    function setComboboxInputDisplay(mountEl, state, open) {
        const input = mountEl && mountEl.querySelector('#classroomHeaderClassComboboxInput');
        if (!input) {
            return;
        }
        const s = state || {};
        if (open) {
            input.value = s.classSearchQuery != null ? String(s.classSearchQuery) : '';
        } else {
            input.value = getSelectedClassName(s);
        }
    }

    function setComboboxOpen(mountEl, state, options, open) {
        classComboboxOpen = open;
        if (!open) {
            classComboboxHighlight = -1;
        }
        const wrap = mountEl && mountEl.querySelector('.classroom-header-class-combobox');
        const list = mountEl && mountEl.querySelector('#classroomHeaderClassComboboxList');
        const input = mountEl && mountEl.querySelector('#classroomHeaderClassComboboxInput');
        if (wrap) {
            wrap.classList.toggle('is-open', open);
        }
        if (list) {
            list.hidden = !open;
        }
        if (input) {
            input.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        setComboboxInputDisplay(mountEl, state, open);
        if (open) {
            renderClassComboboxList(mountEl, state, options);
        }
    }

    function renderClassComboboxList(mountEl, state, options) {
        const list = mountEl && mountEl.querySelector('#classroomHeaderClassComboboxList');
        if (!list) {
            return;
        }
        list.innerHTML = buildClassComboboxListHtml(state);
        list.querySelectorAll('[data-class-id]').forEach((btn, index) => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
            });
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-class-id');
                if (typeof options.onClassChange === 'function' && id) {
                    options.onClassChange(id);
                }
                if (typeof options.onClassSearchChange === 'function') {
                    options.onClassSearchChange('');
                }
                setComboboxOpen(mountEl, Object.assign({}, state, { classSearchQuery: '' }), options, false);
            });
            if (index === classComboboxHighlight) {
                btn.classList.add('is-highlighted');
            }
        });
    }

    function bindClassComboboxOutsideClose(mountEl, state, options) {
        if (classComboboxOutsideBound || typeof document === 'undefined') {
            return;
        }
        classComboboxOutsideBound = true;
        document.addEventListener('mousedown', (e) => {
            if (!classComboboxOpen || !mountEl) {
                return;
            }
            const wrap = mountEl.querySelector('.classroom-header-class-combobox');
            if (wrap && !wrap.contains(e.target)) {
                setComboboxOpen(mountEl, state, options, false);
            }
        });
    }

    function bindClassCombobox(mountEl, state, options) {
        const input = mountEl.querySelector('#classroomHeaderClassComboboxInput');
        const list = mountEl.querySelector('#classroomHeaderClassComboboxList');
        if (!input || !list) {
            return;
        }
        bindClassComboboxOutsideClose(mountEl, state, options);
        setComboboxOpen(mountEl, state, options, false);

        input.addEventListener('focus', () => {
            setComboboxOpen(mountEl, state, options, true);
            input.select();
        });

        input.addEventListener('input', () => {
            classComboboxHighlight = -1;
            if (typeof options.onClassSearchChange === 'function') {
                options.onClassSearchChange(input.value);
            }
            const nextState = Object.assign({}, state, { classSearchQuery: input.value });
            renderClassComboboxList(mountEl, nextState, options);
            if (!classComboboxOpen) {
                setComboboxOpen(mountEl, nextState, options, true);
            }
        });

        input.addEventListener('keydown', (e) => {
            const items = Array.from(list.querySelectorAll('[data-class-id]'));
            if (!items.length) {
                if (e.key === 'Escape') {
                    setComboboxOpen(mountEl, state, options, false);
                    input.blur();
                }
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                classComboboxHighlight = Math.min(classComboboxHighlight + 1, items.length - 1);
                renderClassComboboxList(
                    mountEl,
                    Object.assign({}, state, { classSearchQuery: input.value }),
                    options
                );
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                classComboboxHighlight = Math.max(classComboboxHighlight - 1, 0);
                renderClassComboboxList(
                    mountEl,
                    Object.assign({}, state, { classSearchQuery: input.value }),
                    options
                );
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const pick = items[Math.max(classComboboxHighlight, 0)];
                if (pick) {
                    pick.click();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setComboboxOpen(mountEl, state, options, false);
                input.blur();
            }
        });
    }

    function updateClassSelectForSearch(mountEl, state) {
        if (!mountEl || mode !== 'essays') {
            return;
        }
        renderClassComboboxList(mountEl, state, {});
    }

    function buildEssayStatsHtml(essayStatusCounts, fallbackTotal) {
        const ec = essayStatusCounts || {};
        const total = ec.total != null ? ec.total : fallbackTotal;
        return [
            `<span class="classroom-stat">${escapeHtml(t('classroomStatTotal'))}: <strong>${total}</strong></span>`,
            `<span class="classroom-stat classroom-stat--essay-not">${escapeHtml(t('classroomEssayStatusNotSubmitted'))}: <strong>${ec.not_submitted || 0}</strong></span>`,
            `<span class="classroom-stat classroom-stat--essay-submitted">${escapeHtml(t('classroomEssayStatusSubmitted'))}: <strong>${ec.submitted || 0}</strong></span>`,
            `<span class="classroom-stat classroom-stat--essay-complete">${escapeHtml(t('classroomEssayStatusComplete'))}: <strong>${ec.complete || 0}</strong></span>`,
            `<span class="classroom-stat classroom-stat--essay-resubmit">${escapeHtml(t('classroomEssayStatusResubmit'))}: <strong>${ec.resubmit_required || 0}</strong></span>`
        ].join('');
    }

    function render(mountEl, state, options) {
        if (!mountEl) {
            return;
        }
        syncCollapsedForViewport();
        const opts = options || {};
        const s = state || {};
        mode = opts.mode || mode;
        const classData = s.classData;
        const classes = Array.isArray(s.classes) ? s.classes : [];
        const stats = renderStats(s.attendanceSession, s.studentCount);
        const teachers = getTeacherLine(classData);
        const classSearchQuery = s.classSearchQuery != null ? String(s.classSearchQuery) : '';
        const classesForSelect =
            mode === 'essays'
                ? filterClassesForSearch(classes, classSearchQuery, s.classId)
                : classes;
        const classOptions = buildClassOptions(classesForSelect, s.classId, s.essaySubmissions);
        const selectedClassName = getSelectedClassName(s);
        const comboboxInputValue = classComboboxOpen ? classSearchQuery : selectedClassName;

        const collapsedClass = collapsed ? ' classroom-header--collapsed' : '';
        const essaysClass = mode === 'essays' ? ' classroom-header--essays' : '';
        let body = '';
        body += `<div class="classroom-header${collapsedClass}${essaysClass}" id="classroomContextHeader">`;
        body += '<div class="classroom-header-top">';
        body += `<button type="button" class="btn btn-outline btn-compact classroom-header-toggle" id="classroomHeaderToggle" aria-expanded="${collapsed ? 'false' : 'true'}">${escapeHtml(collapsed ? t('classroomHeaderExpand') : t('classroomHeaderCollapse'))}</button>`;
        if (mode === 'essays') {
            body += `<div class="classroom-header-class-combobox" data-class-combobox>`;
            body += `<label class="classroom-header-field classroom-header-class-combobox-field"><span>${escapeHtml(t('classroomClassLabel'))}</span>`;
            body += `<input type="search" id="classroomHeaderClassComboboxInput" class="module-list-search classroom-header-class-combobox-input" role="combobox" autocomplete="off" spellcheck="false" aria-autocomplete="list" aria-controls="classroomHeaderClassComboboxList" aria-expanded="false" placeholder="${escapeAttr(t('classListSearchPlaceholder'))}" value="${escapeAttr(comboboxInputValue)}" />`;
            body += `<div id="classroomHeaderClassComboboxList" class="classroom-header-class-combobox-list module-list" role="listbox" hidden>${buildClassComboboxListHtml(s)}</div>`;
            body += '</label></div>';
        } else {
            body += `<label class="classroom-header-field"><span>${escapeHtml(t('classroomClassLabel'))}</span>`;
            body += `<select id="classroomHeaderClassSelect" class="field-select field-control--compact">${classOptions}</select></label>`;
        }
        if (teachers) {
            body += `<span class="classroom-header-teachers section-hint">${escapeHtml(t('classroomTeachersLabel'))}: ${escapeHtml(teachers)}</span>`;
        }
        body += '</div>';

        body += `<div class="classroom-header-body${mode === 'essays' ? ' classroom-header-body--essays' : ''}">`;
        body += '<div class="classroom-header-stats">';
        if (mode === 'essays') {
            body += buildEssayStatsHtml(s.essayStatusCounts, stats.total);
        } else {
            body += `<span class="classroom-stat">${escapeHtml(t('classroomStatTotal'))}: <strong>${stats.total}</strong></span>`;
            body += `<span class="classroom-stat classroom-stat--present">${escapeHtml(t('classroomStatPresent'))}: <strong>${stats.present}</strong></span>`;
            body += `<span class="classroom-stat classroom-stat--late">${escapeHtml(t('classroomStatLate'))}: <strong>${stats.late}</strong></span>`;
            body += `<span class="classroom-stat classroom-stat--absent">${escapeHtml(t('classroomStatAbsent'))}: <strong>${stats.absent}</strong></span>`;
            body += `<span class="classroom-stat">${escapeHtml(t('classroomStatEarlyLeave'))}: <strong>${stats.early}</strong></span>`;
        }
        body += '</div>';

        if (mode === 'attendance') {
            body += '<div class="classroom-header-controls">';
            body += `<label class="classroom-header-field"><span>${escapeHtml(t('classroomDateLabel'))}</span>`;
            body += `<input type="date" id="classroomHeaderDate" class="field-input field-control--compact" value="${escapeHtml(s.date || '')}" /></label>`;
            body += `<button type="button" class="btn btn-outline btn-compact" id="classroomHeaderToday">${escapeHtml(t('classroomToday'))}</button>`;
            body += '</div>';
        } else if (mode === 'homework') {
            const rows = classData && domain() ? domain().getLessonRowsFromSyllabus(classData.syllabusRows) : [];
            const rowOpts = rows
                .map((row) => {
                    const key = domain().getSyllabusRowKey(row);
                    const sel = key === s.syllabusRowId ? ' selected' : '';
                    const label = `${row.date || ''} — ${row.planTitle || row.planDetail || ''}`.trim();
                    return `<option value="${escapeHtml(key)}" data-date="${escapeHtml(row.date || '')}"${sel}>${escapeHtml(label)}</option>`;
                })
                .join('');
            body += '<div class="classroom-header-controls">';
            body += `<label class="classroom-header-field"><span>${escapeHtml(t('classroomAssignmentLabel'))}</span>`;
            body += `<select id="classroomHeaderAssignment" class="field-select field-control--compact">${rowOpts}</select></label>`;
            body += `<p class="section-hint classroom-grade-legend">${escapeHtml(t('classroomGradeLegend'))}</p>`;
            body += '</div>';
        } else if (mode === 'essays') {
            const rows = classData && domain() ? domain().getEssayRowsFromSyllabus(classData.syllabusRows) : [];
            const rowOpts = rows
                .map((row) => {
                    const key = domain().getSyllabusRowKey(row);
                    const sel = key === s.syllabusRowId ? ' selected' : '';
                    const label = `${row.date || ''} — ${row.planTitle || row.planDetail || ''}`.trim();
                    return `<option value="${escapeHtml(key)}" data-date="${escapeHtml(row.date || '')}"${sel}>${escapeHtml(label)}</option>`;
                })
                .join('');
            const deadlines = s.essayDeadlines || {};
            const ss = deadlines.ssDueDate || '';
            const te = deadlines.teacherEvalDueDate || '';
            const deadlineDisabled = s.essayDeadlinesReadOnly ? ' disabled' : '';
            body += '<div class="classroom-header-controls classroom-header-controls--essays">';
            body += `<label class="classroom-header-field classroom-header-field--assignment"><span>${escapeHtml(t('classroomEssayAssignmentLabel'))}</span>`;
            body += `<select id="classroomHeaderAssignment" class="field-select field-control--compact">${rowOpts}</select></label>`;
            body += `<label class="classroom-header-field classroom-header-field--date"><span>${escapeHtml(t('classroomEssaySsDue'))}</span>`;
            body += `<input type="date" id="classroomHeaderEssaySsDue" class="field-input field-control--compact" value="${escapeHtml(ss)}"${deadlineDisabled} /></label>`;
            body += `<label class="classroom-header-field classroom-header-field--date"><span>${escapeHtml(t('classroomEssayTeacherEvalDue'))}</span>`;
            body += `<input type="date" id="classroomHeaderEssayTeacherEvalDue" class="field-input field-control--compact" value="${escapeHtml(te)}"${deadlineDisabled} /></label>`;
            if (s.essayDeadlineHintsHtml) {
                body += `<div class="classroom-essay-deadline-hints classroom-header-essay-deadline-hints">${s.essayDeadlineHintsHtml}</div>`;
            }
            body += '</div>';
        } else if (mode === 'points') {
            body += '<div class="classroom-header-controls">';
            body += `<label class="classroom-header-field"><span>${escapeHtml(t('classroomDateLabel'))}</span>`;
            body += `<input type="date" id="classroomHeaderDate" class="field-input field-control--compact" value="${escapeHtml(s.date || '')}" /></label>`;
            body += `<button type="button" class="btn btn-outline btn-compact" id="classroomHeaderToday">${escapeHtml(t('classroomToday'))}</button>`;
            body += '</div>';
        } else if (mode === 'tests') {
            const tests = Array.isArray(s.studentTests) ? s.studentTests : [];
            const testOpts = tests
                .map((test) => {
                    const sel =
                        test.testName === s.testName && test.testDate === s.testDate ? ' selected' : '';
                    const label = `${test.testDate || ''} — ${test.testName || ''}`.trim();
                    return `<option value="${escapeHtml(test.testName)}" data-date="${escapeHtml(test.testDate || '')}"${sel}>${escapeHtml(label)}</option>`;
                })
                .join('');
            body += '<div class="classroom-header-controls">';
            body += `<label class="classroom-header-field"><span>${escapeHtml(t('classroomTestNameLabel'))}</span>`;
            body += `<input type="text" id="classroomHeaderTestName" class="field-input field-control--compact" value="${escapeHtml(s.testName || '')}" /></label>`;
            body += `<label class="classroom-header-field"><span>${escapeHtml(t('classroomDateLabel'))}</span>`;
            body += `<input type="date" id="classroomHeaderTestDate" class="field-input field-control--compact" value="${escapeHtml(s.testDate || '')}" /></label>`;
            if (testOpts) {
                body += `<label class="classroom-header-field"><span>${escapeHtml(t('classroomTestPickLabel'))}</span>`;
                body += `<select id="classroomHeaderTestPick" class="field-select field-control--compact"><option value="">${escapeHtml(t('classroomTestPickNew'))}</option>${testOpts}</select></label>`;
            }
            body += '</div>';
        }
        body += '</div></div>';

        const comboboxInputEl = mountEl.querySelector('#classroomHeaderClassComboboxInput');
        const restoreComboboxFocus =
            comboboxInputEl
            && typeof document !== 'undefined'
            && document.activeElement === comboboxInputEl;
        const selStart = restoreComboboxFocus ? comboboxInputEl.selectionStart : null;
        const selEnd = restoreComboboxFocus ? comboboxInputEl.selectionEnd : null;
        const wasComboboxOpen = classComboboxOpen;

        mountEl.innerHTML = body;

        mountEl.querySelector('#classroomHeaderToggle')?.addEventListener('click', () => {
            collapseOverridden = true;
            collapsed = !collapsed;
            render(mountEl, state, options);
        });

        if (mode === 'essays') {
            bindClassCombobox(mountEl, s, opts);
            if (wasComboboxOpen) {
                setComboboxOpen(mountEl, s, opts, true);
            }
            if (restoreComboboxFocus) {
                const newInput = mountEl.querySelector('#classroomHeaderClassComboboxInput');
                if (newInput) {
                    newInput.focus();
                    if (selStart != null && typeof newInput.setSelectionRange === 'function') {
                        try {
                            newInput.setSelectionRange(selStart, selEnd);
                        } catch (_) {
                            /* ignore */
                        }
                    }
                }
            }
        } else {
            mountEl.querySelector('#classroomHeaderClassSelect')?.addEventListener('change', (e) => {
                if (typeof opts.onClassChange === 'function') {
                    opts.onClassChange(e.target.value);
                }
            });
        }

        mountEl.querySelector('#classroomHeaderDate')?.addEventListener('change', (e) => {
            if (typeof opts.onDateChange === 'function') {
                opts.onDateChange(e.target.value);
            }
        });

        mountEl.querySelector('#classroomHeaderToday')?.addEventListener('click', () => {
            const today = domain() ? domain().todayISO() : '';
            if (typeof opts.onDateChange === 'function') {
                opts.onDateChange(today);
            }
        });

        mountEl.querySelector('#classroomHeaderAssignment')?.addEventListener('change', (e) => {
            const opt = e.target.selectedOptions[0];
            if (typeof opts.onAssignmentChange === 'function') {
                opts.onAssignmentChange(e.target.value, opt ? opt.getAttribute('data-date') : '');
            }
        });

        mountEl.querySelector('#classroomHeaderEssaySsDue')?.addEventListener('change', (e) => {
            if (typeof opts.onEssaySsDueChange === 'function') {
                opts.onEssaySsDueChange(e.target.value);
            }
        });

        mountEl.querySelector('#classroomHeaderEssayTeacherEvalDue')?.addEventListener('change', (e) => {
            if (typeof opts.onEssayTeacherEvalDueChange === 'function') {
                opts.onEssayTeacherEvalDueChange(e.target.value);
            }
        });

        mountEl.querySelector('#classroomHeaderTestName')?.addEventListener('change', (e) => {
            if (typeof opts.onTestNameChange === 'function') {
                opts.onTestNameChange(e.target.value);
            }
        });

        mountEl.querySelector('#classroomHeaderTestDate')?.addEventListener('change', (e) => {
            if (typeof opts.onTestDateChange === 'function') {
                opts.onTestDateChange(e.target.value);
            }
        });

        mountEl.querySelector('#classroomHeaderTestPick')?.addEventListener('change', (e) => {
            const opt = e.target.selectedOptions[0];
            if (!opt || !opt.value) {
                return;
            }
            if (typeof opts.onTestPick === 'function') {
                opts.onTestPick(opt.value, opt.getAttribute('data-date') || '');
            }
        });
    }

    function setMode(nextMode) {
        mode = nextMode;
    }

    function initTab(h) {
        hooks = h;
        bindViewportCollapseListener();
        syncCollapsedForViewport();
    }

    global.CCPClassroomHeader = {
        initTab,
        render,
        setMode,
        updateClassSelectForSearch,
        renderClassComboboxList,
        buildClassComboboxListHtml,
        filterClassesForSearch,
        classSearchHaystack,
        getClassDisplayLabel,
        setCollapsed(value) {
            collapseOverridden = true;
            collapsed = Boolean(value);
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
