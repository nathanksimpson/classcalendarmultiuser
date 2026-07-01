/**
 * Essay submission tracking — status workflow per class + syllabus row.
 */
(function (global) {
    let hooks = null;
    let classId = '';
    let syllabusRowId = '';
    let lessonDate = '';
    let draftSubmission = null;
    let currentFilter = 'all';

    function domain() {
        return global.CCPClassroomDomain;
    }

    function access() {
        return global.CCPClassroomAccess;
    }

    function t(key) {
        return hooks && hooks.t ? hooks.t(key) : key;
    }

    function tf(key, vars) {
        let s = t(key);
        if (vars && typeof vars === 'object') {
            Object.entries(vars).forEach(([name, value]) => {
                s = s.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value ?? ''));
            });
        }
        return s;
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

    function getAppData() {
        return hooks && hooks.getAppData ? hooks.getAppData() : {};
    }

    function getClassData() {
        const data = getAppData();
        return (data.classes || []).find((c) => c && c.id === classId) || null;
    }

    function getStudents() {
        const d = domain();
        const data = getAppData();
        return d ? d.resolveStudentsForClass(getClassData(), data.cohorts) : [];
    }

    function pickDefaultRow() {
        const d = domain();
        const classData = getClassData();
        if (!classData || !d) {
            return null;
        }
        const row = d.pickDefaultEssaySyllabusRow(classData, lessonDate || d.todayISO());
        if (row) {
            syllabusRowId = d.getSyllabusRowKey(row);
            lessonDate = row.date || '';
        }
        return row;
    }

    function defaultDueDatesFromRow(row) {
        const d = domain();
        if (!row || !d) {
            return { ssDueDate: '', teacherEvalDueDate: '' };
        }
        const lesson = normalizeStr(row.date);
        return {
            ssDueDate: lesson,
            teacherEvalDueDate: lesson ? d.addDaysISO(lesson, 2) : ''
        };
    }

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function loadSubmission() {
        const d = domain();
        const data = getAppData();
        if (!syllabusRowId) {
            pickDefaultRow();
        }
        const students = getStudents();
        const existing = d.findEssaySubmission(data.essaySubmissions, classId, syllabusRowId);
        const classData = getClassData();
        const row =
            classData &&
            d.getEssayRowsFromSyllabus(classData.syllabusRows).find((r) => d.getSyllabusRowKey(r) === syllabusRowId);
        const defaults = defaultDueDatesFromRow(row);
        const base = existing
            ? JSON.parse(JSON.stringify(existing))
            : {
                id: d.newId('essay'),
                classId,
                syllabusRowId,
                lessonDate,
                ssDueDate: defaults.ssDueDate,
                teacherEvalDueDate: defaults.teacherEvalDueDate,
                records: []
            };
        if (!base.ssDueDate && defaults.ssDueDate) {
            base.ssDueDate = defaults.ssDueDate;
        }
        if (!base.teacherEvalDueDate && defaults.teacherEvalDueDate) {
            base.teacherEvalDueDate = defaults.teacherEvalDueDate;
        }
        draftSubmission = d.ensureEssayRecordsForStudents(base, students);
    }

    function getRecord(studentId) {
        if (!draftSubmission || !Array.isArray(draftSubmission.records)) {
            return null;
        }
        return draftSubmission.records.find((r) => r.studentId === studentId) || null;
    }

    function setRecord(studentId, patch) {
        if (!draftSubmission) {
            return;
        }
        const records = Array.isArray(draftSubmission.records) ? draftSubmission.records.slice() : [];
        const idx = records.findIndex((r) => r.studentId === studentId);
        const base = idx >= 0
            ? records[idx]
            : { studentId, status: 'not_submitted', submittedRetest: false, note: '' };
        const next = Object.assign({}, base, patch);
        if (idx >= 0) {
            records[idx] = next;
        } else {
            records.push(next);
        }
        draftSubmission.records = records;
    }

    function formatDeadlineHint(labelKey, isoDate) {
        const d = domain();
        if (!d || !isoDate) {
            return '';
        }
        const days = d.daysUntilISO(isoDate);
        if (days == null) {
            return '';
        }
        const lang = hooks && hooks.getLang ? hooks.getLang() : 'en';
        const formatted = new Date(isoDate + 'T00:00:00').toLocaleDateString(lang === 'ko' ? 'ko-KR' : undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const label = t(labelKey);
        let hintKey = 'classroomEssayDeadlineLeft';
        let vars = { label, date: formatted, days };
        if (days < 0) {
            hintKey = 'classroomEssayDeadlineOverdue';
            vars = { label, date: formatted, days: Math.abs(days) };
        } else if (days === 0) {
            hintKey = 'classroomEssayDeadlineToday';
            vars = { label, date: formatted };
        }
        const cls = days < 0 || days === 0 ? 'classroom-essay-deadline--overdue' : 'classroom-essay-deadline--ok';
        return `<p class="classroom-essay-deadline ${cls}">${escapeHtml(tf(hintKey, vars))}</p>`;
    }

    function renderDeadlines(panel) {
        const mount = panel.querySelector('#classroomEssaysDeadlines');
        if (!mount || !draftSubmission) {
            return;
        }
        const editable = access() && access().canEditClass(getClassData());
        const disabled = editable ? '' : ' disabled';
        const ss = draftSubmission.ssDueDate || '';
        const te = draftSubmission.teacherEvalDueDate || '';
        mount.innerHTML = `
            <div class="classroom-essay-deadlines">
                <label class="classroom-header-field"><span>${escapeHtml(t('classroomEssaySsDue'))}</span>
                <input type="date" id="classroomEssaySsDue" class="field-input field-control--compact" value="${escapeHtml(ss)}"${disabled} /></label>
                <label class="classroom-header-field"><span>${escapeHtml(t('classroomEssayTeacherEvalDue'))}</span>
                <input type="date" id="classroomEssayTeacherEvalDue" class="field-input field-control--compact" value="${escapeHtml(te)}"${disabled} /></label>
            </div>
            <div class="classroom-essay-deadline-hints">
                ${formatDeadlineHint('classroomEssaySsDueShort', ss)}
                ${formatDeadlineHint('classroomEssayTeacherEvalDueShort', te)}
            </div>`;

        mount.querySelector('#classroomEssaySsDue')?.addEventListener('change', (e) => {
            if (draftSubmission) {
                draftSubmission.ssDueDate = e.target.value;
            }
            renderDeadlines(panel);
        });
        mount.querySelector('#classroomEssayTeacherEvalDue')?.addEventListener('change', (e) => {
            if (draftSubmission) {
                draftSubmission.teacherEvalDueDate = e.target.value;
            }
            renderDeadlines(panel);
        });
    }

    function renderFilters(panel) {
        const mount = panel.querySelector('#classroomEssaysFilters');
        if (!mount || !draftSubmission) {
            return;
        }
        const d = domain();
        const counts = d.countEssayByStatus(draftSubmission);
        mount.innerHTML = `
            <div class="classroom-essay-filter-group" role="group" aria-label="${escapeHtml(t('classroomEssayFilterLabel'))}">
                <button type="button" class="btn btn-outline btn-compact classroom-essay-filter${currentFilter === 'all' ? ' is-active' : ''}" data-filter="all">${escapeHtml(t('classroomEssayFilterAll'))}</button>
                <button type="button" class="btn btn-outline btn-compact classroom-essay-filter${currentFilter === 'not_submitted' ? ' is-active' : ''}" data-filter="not_submitted">${escapeHtml(t('classroomEssayStatusNotSubmitted'))} (${counts.not_submitted})</button>
                <button type="button" class="btn btn-outline btn-compact classroom-essay-filter${currentFilter === 'submitted' ? ' is-active' : ''}" data-filter="submitted">${escapeHtml(t('classroomEssayStatusSubmitted'))} (${counts.submitted})</button>
                <button type="button" class="btn btn-outline btn-compact classroom-essay-filter${currentFilter === 'complete' ? ' is-active' : ''}" data-filter="complete">${escapeHtml(t('classroomEssayStatusComplete'))} (${counts.complete})</button>
                <button type="button" class="btn btn-outline btn-compact classroom-essay-filter${currentFilter === 'resubmit_required' ? ' is-active' : ''}" data-filter="resubmit_required">${escapeHtml(t('classroomEssayStatusResubmit'))} (${counts.resubmit_required})</button>
            </div>
            <p class="section-hint classroom-essay-summary">${escapeHtml(
                tf('classroomEssayStatusSummary', {
                    submitted: counts.submitted,
                    complete: counts.complete,
                    resubmit: counts.resubmit_required,
                    notSubmitted: counts.not_submitted
                })
            )}</p>`;

        mount.querySelectorAll('.classroom-essay-filter').forEach((btn) => {
            btn.addEventListener('click', () => {
                currentFilter = btn.getAttribute('data-filter') || 'all';
                renderFilters(panel);
                renderRows(panel);
            });
        });
    }

    function renderHeader(panel) {
        const headerMount = panel.querySelector('#classroomEssaysHeader');
        if (!headerMount || !global.CCPClassroomHeader) {
            return;
        }
        global.CCPClassroomHeader.setMode('essays');
        const data = getAppData();
        const d = domain();
        let classes = (data.classes || []).filter(
            (c) => c && (!access() || access().canEditClass(c) || access().canBypass())
        );
        if (global.CCPCohortSidebarFilter) {
            classes = global.CCPCohortSidebarFilter.filterClassesByCohort(
                classes,
                global.CCPCohortSidebarFilter.getActiveCohortId()
            );
        }
        global.CCPClassroomHeader.render(
            headerMount,
            {
                classId,
                classData: getClassData(),
                classes,
                syllabusRowId,
                studentCount: getStudents().length,
                essaySubmissions: data.essaySubmissions
            },
            {
                mode: 'essays',
                onClassChange: (id) => {
                    classId = id;
                    if (hooks && hooks.setUiPref) {
                        hooks.setUiPref('classroomTabClassId', id);
                    }
                    syllabusRowId = '';
                    loadSubmission();
                    render(panel);
                },
                onAssignmentChange: (rowId, date) => {
                    syllabusRowId = rowId;
                    lessonDate = date || '';
                    if (hooks && hooks.setUiPref) {
                        hooks.setUiPref('classroomTabEssaySyllabusRowId', rowId);
                    }
                    loadSubmission();
                    render(panel);
                }
            }
        );
    }

    function statusOptions() {
        return [
            { status: 'not_submitted', label: t('classroomEssayStatusNotSubmitted'), cls: 'essay-status--not' },
            { status: 'submitted', label: t('classroomEssayStatusSubmitted'), cls: 'essay-status--submitted' },
            { status: 'complete', label: t('classroomEssayStatusComplete'), cls: 'essay-status--complete' },
            { status: 'resubmit_required', label: t('classroomEssayStatusResubmit'), cls: 'essay-status--resubmit' }
        ];
    }

    function buildStatusChips(studentId, editable) {
        const rec = getRecord(studentId);
        const current = rec ? rec.status : 'not_submitted';
        const disabled = editable ? '' : ' disabled';
        return statusOptions()
            .map((opt) => {
                const active = current === opt.status ? ` essay-status-btn--active ${opt.cls}` : '';
                return `<button type="button" class="essay-status-btn${active}" data-student-id="${escapeHtml(studentId)}" data-status="${escapeHtml(opt.status)}"${disabled}>${escapeHtml(opt.label)}</button>`;
            })
            .join('');
    }

    function renderRows(panel) {
        const rowsMount = panel.querySelector('#classroomEssaysRows');
        if (!rowsMount) {
            return;
        }
        const editable = access() && access().canEditClass(getClassData());
        const students = getStudents();
        const rowApi = global.CCPClassroomStudentRow;

        if (!syllabusRowId) {
            rowsMount.innerHTML = `<tr><td colspan="5" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomEssayNoAssignment'))}</p></td></tr>`;
            return;
        }

        if (!students.length) {
            rowsMount.innerHTML = `<tr><td colspan="5" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomNoStudentsHint'))}</p></td></tr>`;
            return;
        }

        const filtered =
            currentFilter === 'all'
                ? students
                : students.filter((entry) => {
                    const rec = getRecord(entry.student.id);
                    const status = rec ? rec.status : 'not_submitted';
                    return status === currentFilter;
                });

        if (!filtered.length) {
            rowsMount.innerHTML = `<tr><td colspan="5" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomEssayNoStudentsFilter'))}</p></td></tr>`;
            return;
        }

        rowsMount.innerHTML = filtered
            .map((entry, index) => {
                const sid = entry.student.id;
                const rec = getRecord(sid);
                const retest = rec ? rec.submittedRetest : false;
                const note = rec ? rec.note || '' : '';
                const identity = rowApi
                    ? rowApi.formatStudentIdentityColumn(entry, t)
                    : escapeHtml(entry.student.name);
                const disabled = editable ? '' : ' disabled';
                return `<tr class="classroom-sheet-row" data-student-id="${escapeHtml(sid)}">
                <td class="classroom-sheet-col-index">${index + 1}</td>
                <td class="classroom-sheet-col-student">${identity}</td>
                <td class="classroom-sheet-col-essay-status">
                    <div class="classroom-essay-status-group" role="group" aria-label="${escapeHtml(t('classroomColEssayStatus'))}">${buildStatusChips(sid, editable)}</div>
                </td>
                <td class="classroom-sheet-col-retest">
                    <input type="checkbox" class="classroom-essay-retest" data-student-id="${escapeHtml(sid)}" ${retest ? 'checked' : ''}${disabled} aria-label="${escapeHtml(t('classroomEssayRetest'))}" />
                </td>
                <td class="classroom-sheet-col-notes">
                    <input type="text" class="field-input field-control--compact classroom-essay-note" data-student-id="${escapeHtml(sid)}" value="${escapeHtml(note)}" placeholder="${escapeHtml(t('classroomEssayNote'))}" aria-label="${escapeHtml(t('classroomEssayNote'))}"${disabled} />
                </td>
            </tr>`;
            })
            .join('');

        rowsMount.querySelectorAll('.essay-status-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.disabled) {
                    return;
                }
                setRecord(btn.getAttribute('data-student-id'), { status: btn.getAttribute('data-status') });
                renderFilters(panel);
                renderRows(panel);
            });
        });
        rowsMount.querySelectorAll('.classroom-essay-retest').forEach((cb) => {
            cb.addEventListener('change', () => {
                setRecord(cb.getAttribute('data-student-id'), { submittedRetest: cb.checked });
            });
        });
        rowsMount.querySelectorAll('.classroom-essay-note').forEach((input) => {
            input.addEventListener('input', () => {
                setRecord(input.getAttribute('data-student-id'), { note: input.value });
            });
        });
    }

    async function saveAll(panel) {
        const editable = access() && access().canEditClass(getClassData());
        if (!editable || !draftSubmission) {
            return;
        }
        const d = domain();
        const data = getAppData();
        draftSubmission.syllabusRowId = syllabusRowId;
        draftSubmission.lessonDate = lessonDate;
        const submissions = d.upsertEssaySubmission(data.essaySubmissions, draftSubmission);
        try {
            await hooks.saveClassroom({ essaySubmissions: submissions });
            hooks.showToast(t('saved'));
            loadSubmission();
            render(panel);
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
        }
    }

    function render(panel) {
        if (!panel) {
            return;
        }
        renderHeader(panel);
        renderDeadlines(panel);
        renderFilters(panel);
        renderRows(panel);
        panel.querySelector('#classroomEssaysSaveBtn')?.addEventListener('click', () => saveAll(panel), {
            once: true
        });
    }

    function initTab(h, options) {
        hooks = h;
        const data = getAppData();
        const d = domain();
        classId =
            (options && options.classId) ||
            (data.ui && data.ui.classroomTabClassId) ||
            (data.classes && data.classes[0] && data.classes[0].id) ||
            '';
        syllabusRowId =
            (options && options.syllabusRowId) ||
            (data.ui && data.ui.classroomTabEssaySyllabusRowId) ||
            '';
        lessonDate = (data.ui && data.ui.classroomTabDate) || (d ? d.todayISO() : '');
        currentFilter = 'all';
        if (!syllabusRowId) {
            pickDefaultRow();
        }
        loadSubmission();
        render(document.getElementById('panel-essays'));
    }

    global.CCPClassroomEssays = {
        initTab,
        render
    };
})(typeof window !== 'undefined' ? window : globalThis);
