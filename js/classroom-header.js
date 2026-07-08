/**
 * Collapsible classroom context header (class picker, stats, date/HW controls).
 */
(function (global) {
    let hooks = null;
    let collapsed = false;
    let collapseOverridden = false;
    let resizeBound = false;
    let mode = 'attendance';

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
            const data =
                hooks && hooks.getAppData
                    ? hooks.getAppData()
                    : typeof global.appData !== 'undefined'
                        ? global.appData
                        : {};
            const submissions = essaySubmissions || data.essaySubmissions;
            const counts = domain().essayAlertCountsForClass(
                submissions,
                classData,
                data.cohorts || []
            );
            label += domain().formatEssayClassAlertSuffix(counts);
        }
        return label;
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
        const stats = renderStats(s.attendanceSession, s.studentCount);
        const teachers = getTeacherLine(classData);
        const collapsedClass = collapsed ? ' classroom-header--collapsed' : '';
        const essaysClass = mode === 'essays' ? ' classroom-header--essays' : '';
        let body = '';
        body += `<div class="classroom-header${collapsedClass}${essaysClass}" id="classroomContextHeader">`;
        body += '<div class="classroom-header-top">';
        body += `<button type="button" class="btn btn-outline btn-compact classroom-header-toggle" id="classroomHeaderToggle" aria-expanded="${collapsed ? 'false' : 'true'}">${escapeHtml(collapsed ? t('classroomHeaderExpand') : t('classroomHeaderCollapse'))}</button>`;
        if (teachers) {
            body += `<span class="classroom-header-teachers section-hint">${escapeHtml(t('classroomTeachersLabel'))}: ${escapeHtml(teachers)}</span>`;
        }
        body += '</div>';

        body += `<div class="classroom-header-body${mode === 'essays' ? ' classroom-header-body--essays' : ''}">`;
        if (mode !== 'essays') {
            body += '<div class="classroom-header-stats">';
            body += `<span class="classroom-stat">${escapeHtml(t('classroomStatTotal'))}: <strong>${stats.total}</strong></span>`;
            body += `<span class="classroom-stat classroom-stat--present">${escapeHtml(t('classroomStatPresent'))}: <strong>${stats.present}</strong></span>`;
            body += `<span class="classroom-stat classroom-stat--late">${escapeHtml(t('classroomStatLate'))}: <strong>${stats.late}</strong></span>`;
            body += `<span class="classroom-stat classroom-stat--absent">${escapeHtml(t('classroomStatAbsent'))}: <strong>${stats.absent}</strong></span>`;
            body += `<span class="classroom-stat">${escapeHtml(t('classroomStatEarlyLeave'))}: <strong>${stats.early}</strong></span>`;
            body += '</div>';
        }

        if (mode === 'attendance') {
            /* session date lives in #classroomZoneContextBar */
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
            /* assignment + due dates render in #classroomEssaysAssignmentBar */
        } else if (mode === 'points') {
            /* session date lives in #classroomZoneContextBar */
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

        mountEl.innerHTML = body;

        mountEl.querySelector('#classroomHeaderToggle')?.addEventListener('click', () => {
            collapseOverridden = true;
            collapsed = !collapsed;
            render(mountEl, state, options);
        });

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
        filterClassesForSearch,
        classSearchHaystack,
        getClassDisplayLabel,
        setCollapsed(value) {
            collapseOverridden = true;
            collapsed = Boolean(value);
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
