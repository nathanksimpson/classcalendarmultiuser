/**
 * Classroom points ledger — participation / behavior points per student.
 */
(function (global) {
    let hooks = null;
    let classId = '';
    let dateStr = '';

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

    function renderHeader(panel) {
        const headerMount = panel.querySelector('#classroomPointsHeader');
        if (!headerMount || !global.CCPClassroomHeader) {
            return;
        }
        global.CCPClassroomHeader.setMode('points');
        const data = getAppData();
        const classes = (data.classes || []).filter(
            (c) => c && (!access() || access().canEditClass(c) || access().canBypass())
        );
        global.CCPClassroomHeader.render(
            headerMount,
            {
                classId,
                classData: getClassData(),
                classes,
                date: dateStr,
                studentCount: getStudents().length
            },
            {
                mode: 'points',
                onClassChange: (id) => {
                    classId = id;
                    if (hooks && hooks.setUiPref) {
                        hooks.setUiPref('classroomTabClassId', id);
                    }
                    render(panel);
                },
                onDateChange: (d) => {
                    dateStr = d;
                    if (hooks && hooks.setUiPref) {
                        hooks.setUiPref('classroomPointsDate', d);
                    }
                    render(panel);
                }
            }
        );
    }

    function renderRows(panel) {
        const rowsMount = panel.querySelector('#classroomPointsRows');
        const ledgerMount = panel.querySelector('#classroomPointsLedger');
        if (!rowsMount) {
            return;
        }
        const d = domain();
        const data = getAppData();
        const editable = access() && access().canEditClass(getClassData());
        const students = getStudents();
        const rowApi = global.CCPClassroomStudentRow;
        const points = d ? d.listPointsForClass(data.studentPoints, classId) : [];

        if (!students.length) {
            rowsMount.innerHTML = `<tr><td colspan="4" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomNoStudentsHint'))}</p></td></tr>`;
            if (ledgerMount) {
                ledgerMount.innerHTML = '';
            }
            return;
        }

        rowsMount.innerHTML = students
            .map((entry) => {
                const sid = entry.student.id;
                const total = d ? d.sumPointsForStudent(data.studentPoints, classId, sid) : 0;
                const identity = rowApi
                    ? rowApi.formatStudentIdentityColumn(entry, t)
                    : escapeHtml(entry.student.name);
                const disabled = editable ? '' : ' disabled';
                return `<tr class="classroom-sheet-row" data-student-id="${escapeHtml(sid)}">
                <td class="classroom-sheet-col-student">${identity}</td>
                <td class="classroom-sheet-col-points-total"><strong>${escapeHtml(String(total))}</strong></td>
                <td class="classroom-sheet-col-points-delta">
                    <input type="number" class="field-input field-control--compact classroom-point-delta" data-student-id="${escapeHtml(sid)}" step="1" value="1" aria-label="${escapeHtml(t('classroomPointDelta'))}"${disabled} />
                </td>
                <td class="classroom-sheet-col-notes">
                    <input type="text" class="field-input field-control--compact classroom-point-reason" data-student-id="${escapeHtml(sid)}" placeholder="${escapeHtml(t('classroomPointReasonPlaceholder'))}" aria-label="${escapeHtml(t('classroomPointReason'))}"${disabled} />
                    <button type="button" class="btn btn-outline btn-compact classroom-point-add-btn" data-student-id="${escapeHtml(sid)}"${disabled ? ' disabled' : ''}>${escapeHtml(t('classroomPointAdd'))}</button>
                </td>
            </tr>`;
            })
            .join('');

        rowsMount.querySelectorAll('.classroom-point-add-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const sid = btn.getAttribute('data-student-id');
                const row = rowsMount.querySelector(`tr[data-student-id="${sid}"]`);
                if (!row || !d) {
                    return;
                }
                const delta = Number(row.querySelector('.classroom-point-delta')?.value);
                const reason = row.querySelector('.classroom-point-reason')?.value || '';
                if (!Number.isFinite(delta) || delta === 0) {
                    hooks.showToast(t('classroomPointInvalid'), true);
                    return;
                }
                const appData = getAppData();
                const entry = {
                    id: d.newId('pt'),
                    classId,
                    studentId: sid,
                    date: dateStr,
                    delta: Math.round(delta),
                    reason: String(reason).trim()
                };
                const next = d.appendPointEntry(appData.studentPoints, entry);
                try {
                    await hooks.saveClassroom({ studentPoints: next });
                    hooks.showToast(t('saved'));
                    render(panel);
                } catch (err) {
                    hooks.showToast(err.message || String(err), true);
                }
            });
        });

        if (ledgerMount) {
            const recent = points.slice(0, 20);
            if (!recent.length) {
                ledgerMount.innerHTML = `<p class="section-hint">${escapeHtml(t('classroomPointsLedgerEmpty'))}</p>`;
                return;
            }
            ledgerMount.innerHTML = `<ul class="classroom-points-ledger-list">${recent
                .map((p) => {
                    const student = students.find((e) => e.student.id === p.studentId);
                    const name = student ? student.student.name : p.studentId;
                    const sign = p.delta > 0 ? '+' : '';
                    return `<li><span class="classroom-points-ledger-date">${escapeHtml(p.date)}</span> <strong>${escapeHtml(name)}</strong> ${escapeHtml(sign + String(p.delta))}${p.reason ? ` — ${escapeHtml(p.reason)}` : ''}</li>`;
                })
                .join('')}</ul>`;
        }
    }

    function render(panel) {
        if (!panel) {
            return;
        }
        renderHeader(panel);
        renderRows(panel);
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
        dateStr =
            (options && options.date) ||
            (data.ui && data.ui.classroomPointsDate) ||
            (d ? d.todayISO() : '');
        render(document.getElementById('panel-points'));
    }

    global.CCPClassroomPoints = {
        initTab,
        render
    };
})(typeof window !== 'undefined' ? window : globalThis);
