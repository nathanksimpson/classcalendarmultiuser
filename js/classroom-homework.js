/**
 * Homework completion segment — full-width 3-column table layout.
 */
(function (global) {
    let hooks = null;
    let classId = '';
    let syllabusRowId = '';
    let lessonDate = '';
    let draftCompletion = null;

    function domain() {
        return global.CCPClassroomDomain;
    }

    function access() {
        return global.CCPClassroomAccess;
    }

    function t(key) {
        return hooks && hooks.t ? hooks.t(key) : key;
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
        const row = d.pickDefaultSyllabusRow(classData, lessonDate || d.todayISO());
        if (row) {
            syllabusRowId = d.getSyllabusRowKey(row);
            lessonDate = row.date || '';
        }
        return row;
    }

    function loadCompletion() {
        const d = domain();
        const data = getAppData();
        if (!syllabusRowId) {
            pickDefaultRow();
        }
        const existing = d.findHomeworkCompletion(data.homeworkCompletions, classId, syllabusRowId);
        draftCompletion = existing
            ? JSON.parse(JSON.stringify(existing))
            : {
                id: d.newId('hw'),
                classId,
                syllabusRowId,
                lessonDate,
                records: []
            };
    }

    function getRecord(studentId) {
        if (!draftCompletion || !Array.isArray(draftCompletion.records)) {
            return null;
        }
        return draftCompletion.records.find((r) => r.studentId === studentId) || null;
    }

    function setRecord(studentId, patch) {
        if (!draftCompletion) {
            return;
        }
        const records = Array.isArray(draftCompletion.records) ? draftCompletion.records.slice() : [];
        const idx = records.findIndex((r) => r.studentId === studentId);
        const base = idx >= 0
            ? records[idx]
            : { studentId, grade: 'X', selfCheck: 'none', parentCheck: false, note: '' };
        const next = Object.assign({}, base, patch);
        if (idx >= 0) {
            records[idx] = next;
        } else {
            records.push(next);
        }
        draftCompletion.records = records;
    }

    function renderHeader(panel) {
        const headerMount = panel.querySelector('#classroomHomeworkHeader');
        if (!headerMount || !global.CCPClassroomHeader) {
            return;
        }
        global.CCPClassroomHeader.setMode('homework');
        const data = getAppData();
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
                studentCount: getStudents().length
            },
            {
                mode: 'homework',
                onClassChange: (id) => {
                    classId = id;
                    if (hooks && hooks.setUiPref) {
                        hooks.setUiPref('classroomTabClassId', id);
                    }
                    syllabusRowId = '';
                    loadCompletion();
                    render(panel);
                },
                onAssignmentChange: (rowId, date) => {
                    syllabusRowId = rowId;
                    lessonDate = date || '';
                    if (hooks && hooks.setUiPref) {
                        hooks.setUiPref('classroomTabSyllabusRowId', rowId);
                    }
                    loadCompletion();
                    render(panel);
                }
            }
        );
    }

    function buildGradeChips(studentId, editable) {
        const d = domain();
        const rec = getRecord(studentId);
        const current = rec ? rec.grade : 'X';
        return d.HOMEWORK_GRADES.map((grade) => {
            const checked = current === grade ? ' checked' : '';
            const disabled = editable ? '' : ' disabled';
            return `<label class="checkbox-label selection-chip"><input type="radio" name="hw_${escapeHtml(studentId)}" value="${grade}"${checked}${disabled} data-student-id="${escapeHtml(studentId)}" /> ${grade}</label>`;
        }).join('');
    }

    function renderRows(panel) {
        const rowsMount = panel.querySelector('#classroomHomeworkRows');
        if (!rowsMount) {
            return;
        }
        const editable = access() && access().canEditClass(getClassData());
        const students = getStudents();
        const d = domain();
        const rowApi = global.CCPClassroomStudentRow;

        if (!syllabusRowId) {
            rowsMount.innerHTML = `<tr><td colspan="4" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomNoAssignment'))}</p></td></tr>`;
            return;
        }

        if (!students.length) {
            rowsMount.innerHTML = `<tr><td colspan="4" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomNoStudentsHint'))}</p></td></tr>`;
            return;
        }

        rowsMount.innerHTML = students
            .map((entry) => {
                const sid = entry.student.id;
                const rec = getRecord(sid);
                const selfCheck = rec ? rec.selfCheck : 'none';
                const parentCheck = rec ? rec.parentCheck : false;
                const note = rec ? rec.note || '' : '';
                const identity = rowApi
                    ? rowApi.formatStudentIdentityColumn(entry, t)
                    : escapeHtml(entry.student.name);
                const selfOptions = d.HOMEWORK_SELF_CHECKS.map((sc) => {
                    const sel = selfCheck === sc ? ' selected' : '';
                    return `<option value="${sc}"${sel}>${escapeHtml(t('classroomSelfCheck_' + sc))}</option>`;
                }).join('');
                const disabled = editable ? '' : ' disabled';
                return `<tr class="classroom-sheet-row" data-student-id="${escapeHtml(sid)}">
                <td class="classroom-sheet-col-student">${identity}</td>
                <td class="classroom-sheet-col-homework">
                    <div class="classroom-student-row-grades" role="radiogroup" aria-label="${escapeHtml(t('classroomColHomework'))}">${buildGradeChips(sid, editable)}</div>
                </td>
                <td class="classroom-sheet-col-checks">
                    <div class="classroom-homework-checks">
                        <label class="classroom-homework-self-check-label"><span class="classroom-homework-meta-label">${escapeHtml(t('classroomSelfCheck'))}</span>
                        <select class="field-select field-control--compact classroom-self-check" data-student-id="${escapeHtml(sid)}"${disabled}>${selfOptions}</select></label>
                        <label class="checkbox-label classroom-homework-parent-label"><input type="checkbox" class="classroom-parent-check" data-student-id="${escapeHtml(sid)}" ${parentCheck ? 'checked' : ''}${disabled} /> ${escapeHtml(t('classroomParentCheck'))}</label>
                    </div>
                </td>
                <td class="classroom-sheet-col-notes">
                    <input type="text" class="field-input field-control--compact classroom-hw-note" data-student-id="${escapeHtml(sid)}" value="${escapeHtml(note)}" placeholder="${escapeHtml(t('classroomHomeworkNote'))}" aria-label="${escapeHtml(t('classroomHomeworkNote'))}"${disabled} />
                </td>
            </tr>`;
            })
            .join('');

        rowsMount.querySelectorAll('input[type="radio"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                setRecord(radio.getAttribute('data-student-id'), { grade: radio.value });
            });
        });
        rowsMount.querySelectorAll('.classroom-self-check').forEach((sel) => {
            sel.addEventListener('change', () => {
                setRecord(sel.getAttribute('data-student-id'), { selfCheck: sel.value });
            });
        });
        rowsMount.querySelectorAll('.classroom-parent-check').forEach((cb) => {
            cb.addEventListener('change', () => {
                setRecord(cb.getAttribute('data-student-id'), { parentCheck: cb.checked });
            });
        });
        rowsMount.querySelectorAll('.classroom-hw-note').forEach((input) => {
            input.addEventListener('input', () => {
                setRecord(input.getAttribute('data-student-id'), { note: input.value });
            });
        });
    }

    async function saveAll(panel) {
        const editable = access() && access().canEditClass(getClassData());
        if (!editable || !draftCompletion) {
            return;
        }
        const d = domain();
        const data = getAppData();
        draftCompletion.syllabusRowId = syllabusRowId;
        draftCompletion.lessonDate = lessonDate;
        const completions = d.upsertHomeworkCompletion(data.homeworkCompletions, draftCompletion);
        try {
            await hooks.saveClassroom({ homeworkCompletions: completions });
            hooks.showToast(t('saved'));
            loadCompletion();
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
        renderRows(panel);
        panel.querySelector('#classroomHomeworkSaveBtn')?.addEventListener('click', () => saveAll(panel), {
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
        syllabusRowId = (options && options.syllabusRowId) || (data.ui && data.ui.classroomTabSyllabusRowId) || '';
        lessonDate = (data.ui && data.ui.classroomTabDate) || (d ? d.todayISO() : '');
        if (!syllabusRowId) {
            pickDefaultRow();
        }
        loadCompletion();
        render(document.getElementById('panel-homework-tracking'));
    }

    global.CCPClassroomHomework = {
        initTab,
        render
    };
})(typeof window !== 'undefined' ? window : globalThis);
