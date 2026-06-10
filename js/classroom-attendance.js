/**
 * Attendance segment — full-width 3-column table layout.
 */
(function (global) {
    let hooks = null;
    let classId = '';
    let dateStr = '';
    let draftSession = null;
    let draftMemos = {};

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

    function loadSession() {
        const d = domain();
        const data = getAppData();
        const existing = d.findAttendanceSession(data.attendanceSessions, classId, dateStr);
        draftSession = existing
            ? JSON.parse(JSON.stringify(existing))
            : {
                id: d.newId('att'),
                classId,
                date: dateStr,
                records: []
            };
        draftMemos = {};
        getStudents().forEach((entry) => {
            draftMemos[entry.student.id] = entry.student.memo || '';
        });
    }

    function getRecord(studentId) {
        if (!draftSession || !Array.isArray(draftSession.records)) {
            return null;
        }
        return draftSession.records.find((r) => r.studentId === studentId) || null;
    }

    function setRecord(studentId, patch) {
        if (!draftSession) {
            return;
        }
        const records = Array.isArray(draftSession.records) ? draftSession.records.slice() : [];
        const idx = records.findIndex((r) => r.studentId === studentId);
        const base = idx >= 0 ? records[idx] : { studentId, status: 'present', sessionNote: '' };
        const next = Object.assign({}, base, patch);
        if (idx >= 0) {
            records[idx] = next;
        } else {
            records.push(next);
        }
        draftSession.records = records;
    }

    function renderHeader(panel) {
        const headerMount = panel.querySelector('#classroomAttendanceHeader');
        if (!headerMount || !global.CCPClassroomHeader) {
            return;
        }
        global.CCPClassroomHeader.setMode('attendance');
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
                attendanceSession: draftSession,
                studentCount: getStudents().length
            },
            {
                mode: 'attendance',
                onClassChange: (id) => {
                    classId = id;
                    if (hooks && hooks.setUiPref) {
                        hooks.setUiPref('classroomTabClassId', id);
                    }
                    loadSession();
                    render(panel);
                },
                onDateChange: (d) => {
                    dateStr = d;
                    if (hooks && hooks.setUiPref) {
                        hooks.setUiPref('classroomTabDate', d);
                    }
                    loadSession();
                    render(panel);
                }
            }
        );
    }

    function buildStatusChips(studentId, editable) {
        const d = domain();
        const rec = getRecord(studentId);
        const current = rec ? rec.status : 'present';
        return d.ATTENDANCE_STATUSES.map((status) => {
            const labelKey = `classroomStatus_${status}`;
            const checked = current === status ? ' checked' : '';
            const disabled = editable ? '' : ' disabled';
            return `<label class="checkbox-label selection-chip classroom-status-chip"><input type="radio" name="att_${escapeHtml(studentId)}" value="${status}"${checked}${disabled} data-student-id="${escapeHtml(studentId)}" /> ${escapeHtml(t(labelKey))}</label>`;
        }).join('');
    }

    function renderRows(panel) {
        const rowsMount = panel.querySelector('#classroomAttendanceRows');
        if (!rowsMount) {
            return;
        }
        const editable = access() && access().canEditClass(getClassData());
        const students = getStudents();
        const d = domain();
        const data = getAppData();
        const rowApi = global.CCPClassroomStudentRow;

        if (!students.length) {
            rowsMount.innerHTML = `<tr><td colspan="3" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomNoStudentsHint'))}</p></td></tr>`;
            return;
        }

        const html = students.map((entry) => {
            const sid = entry.student.id;
            const rec = getRecord(sid);
            const recent = d.countRecentAbsences(data.attendanceSessions, sid, classId, dateStr, 30);
            const recentHint =
                recent > 0
                    ? `<span class="classroom-recent-absence">${escapeHtml(t('classroomRecentAbsent').replace('{n}', String(recent)))}</span>`
                    : '';
            const sessionNote = rec ? rec.sessionNote || '' : '';
            const memo = draftMemos[sid] != null ? draftMemos[sid] : entry.student.memo || '';
            const identity = rowApi
                ? rowApi.formatStudentIdentityColumn(entry, t, { extraHtml: recentHint })
                : escapeHtml(entry.student.name);
            const disabled = editable ? '' : ' disabled';
            return `<tr class="classroom-sheet-row" data-student-id="${escapeHtml(sid)}">
                <td class="classroom-sheet-col-student">${identity}</td>
                <td class="classroom-sheet-col-attendance"><div class="classroom-student-row-status">${buildStatusChips(sid, editable)}</div></td>
                <td class="classroom-sheet-col-notes">
                    <div class="classroom-notes-stack">
                        <input type="text" class="field-input field-control--compact classroom-session-note" data-student-id="${escapeHtml(sid)}" value="${escapeHtml(sessionNote)}" placeholder="${escapeHtml(t('classroomSessionNotePlaceholder'))}" aria-label="${escapeHtml(t('classroomSessionNote'))}"${disabled} />
                        <input type="text" class="field-input field-control--compact classroom-student-memo classroom-student-memo--secondary" data-student-id="${escapeHtml(sid)}" value="${escapeHtml(memo)}" placeholder="${escapeHtml(t('classroomStudentMemoPlaceholder'))}" aria-label="${escapeHtml(t('classroomStudentMemo'))}"${disabled} />
                    </div>
                </td>
            </tr>`;
        });
        rowsMount.innerHTML = html.join('');

        rowsMount.querySelectorAll('input[type="radio"]').forEach((radio) => {
            radio.addEventListener('change', () => {
                setRecord(radio.getAttribute('data-student-id'), { status: radio.value });
                renderHeader(panel);
            });
        });
        rowsMount.querySelectorAll('.classroom-session-note').forEach((input) => {
            input.addEventListener('input', () => {
                setRecord(input.getAttribute('data-student-id'), { sessionNote: input.value });
            });
        });
        rowsMount.querySelectorAll('.classroom-student-memo').forEach((input) => {
            input.addEventListener('input', () => {
                draftMemos[input.getAttribute('data-student-id')] = input.value;
            });
        });
    }

    async function saveAll(panel) {
        const editable = access() && access().canEditClass(getClassData());
        if (!editable) {
            return;
        }
        const d = domain();
        const data = getAppData();
        let cohorts = JSON.parse(JSON.stringify(data.cohorts || []));
        getStudents().forEach((entry) => {
            const sid = entry.student.id;
            const memo = draftMemos[sid];
            if (memo == null || memo === entry.student.memo) {
                return;
            }
            cohorts = cohorts.map((c) => {
                if (c.id !== entry.cohortId) {
                    return c;
                }
                const students = (c.students || []).map((s) =>
                    s.id === sid ? Object.assign({}, s, { memo }) : s
                );
                return Object.assign({}, c, { students });
            });
        });
        const sessions = d.upsertAttendanceSession(data.attendanceSessions, draftSession);
        try {
            await hooks.saveClassroom({
                cohorts,
                attendanceSessions: sessions
            });
            hooks.showToast(t('saved'));
            loadSession();
            render(panel);
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
        }
    }

    function markAllPresent() {
        getStudents().forEach((entry) => {
            setRecord(entry.student.id, { status: 'present' });
        });
        render(document.getElementById('panel-attendance'));
    }

    function render(panel) {
        if (!panel) {
            return;
        }
        renderHeader(panel);
        renderRows(panel);

        panel.querySelector('#classroomAttendanceSaveBtn')?.addEventListener('click', () => saveAll(panel), {
            once: true
        });
        panel.querySelector('#classroomAttendanceAllPresentBtn')?.addEventListener('click', markAllPresent, {
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
        dateStr =
            (options && options.date) ||
            (data.ui && data.ui.classroomTabDate) ||
            (d ? d.todayISO() : '');
        loadSession();
        render(document.getElementById('panel-attendance'));
    }

    global.CCPClassroomAttendance = {
        initTab,
        render,
        markAllPresent
    };
})(typeof window !== 'undefined' ? window : globalThis);
