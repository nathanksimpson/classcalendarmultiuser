/**

 * Attendance segment — full-width 3-column table layout.

 */

(function (global) {

    let hooks = null;

    let classId = '';

    let dateStr = '';

    let draftSession = null;

    let draftMemos = {};

    let panelRef = null;

    let autosave = null;

    const ATTENDANCE_AUTOSAVE_DELAY_MS = 500;



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



    function ensureAutosave(panel) {

        if (autosave || !global.CCPClassroomAutosave) {

            return;

        }

        autosave = global.CCPClassroomAutosave.create({

            delayMs: ATTENDANCE_AUTOSAVE_DELAY_MS,

            debounce: hooks && hooks.debounce ? hooks.debounce : null,

            t,

            getStatusEl: () => (panelRef || panel).querySelector('#classroomAttendanceSaveStatus'),

            saveAsync: (opts) => persistAttendance(panelRef || panel, opts)

        });

    }



    function scheduleSave() {

        ensureAutosave(panelRef);

        if (autosave) {

            autosave.scheduleSave();

        }

    }



    async function flushBeforeLeave() {

        ensureAutosave(panelRef || document.getElementById('panel-attendance'));

        if (autosave) {

            await autosave.flushBeforeLeave();

        }

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

        global.CCPClassroomHeader.render(

            headerMount,

            {

                classId,

                classData: getClassData(),

                date: dateStr,

                attendanceSession: draftSession,

                studentCount: getStudents().length

            },

            {

                mode: 'attendance'

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

            const status = rec ? rec.status : 'present';
            const railCls = ` classroom-sheet-row--status-rail classroom-sheet-row--status-${status}`;

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

            return `<tr class="classroom-sheet-row${railCls}" data-student-id="${escapeHtml(sid)}">

                <td class="classroom-sheet-col-student">${identity}</td>

                <td class="classroom-sheet-col-attendance"><div class="classroom-student-row-status" role="radiogroup" aria-label="${escapeHtml(t('classroomColAttendance'))}">${buildStatusChips(sid, editable)}</div></td>

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

                scheduleSave();

            });

        });

        rowsMount.querySelectorAll('.classroom-session-note').forEach((input) => {

            input.addEventListener('input', () => {

                setRecord(input.getAttribute('data-student-id'), { sessionNote: input.value });

                scheduleSave();

            });

        });

        rowsMount.querySelectorAll('.classroom-student-memo').forEach((input) => {

            input.addEventListener('input', () => {

                draftMemos[input.getAttribute('data-student-id')] = input.value;

                scheduleSave();

            });

        });

    }



    async function persistAttendance(panel, options) {

        const opt = options || {};

        const editable = access() && access().canEditClass(getClassData());

        if (!editable) {

            return;

        }

        const saveBtn = panel?.querySelector('#classroomAttendanceSaveBtn');

        if (saveBtn) {

            saveBtn.disabled = true;

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

            if (!opt.silent) {

                hooks.showToast(t('saved'));

            }

            loadSession();

            if (!opt.silent) {

                render(panel);

            } else {

                renderHeader(panel);

            }

        } catch (err) {

            hooks.showToast(err.message || String(err), true);

            throw err;

        } finally {

            if (saveBtn) {

                saveBtn.disabled = false;

            }

        }

    }



    function markAllPresent() {

        getStudents().forEach((entry) => {

            setRecord(entry.student.id, { status: 'present' });

        });

        render(document.getElementById('panel-attendance'));

        scheduleSave();

    }



    function render(panel) {

        if (!panel) {

            return;

        }

        panelRef = panel;

        renderHeader(panel);

        renderRows(panel);



        ensureAutosave(panel);

        if (autosave) {

            autosave.syncStatusDisplay();

            autosave.bindManualSaveBtn(panel, '#classroomAttendanceSaveBtn', () =>

                access() && access().canEditClass(getClassData())

            );

        }



        panel.querySelector('#classroomAttendanceAllPresentBtn')?.addEventListener('click', markAllPresent, {

            once: true

        });

    }



    function syncFromActiveContext() {

        if (typeof global.CCPActiveContext === 'undefined') {

            return;

        }

        const ctx = global.CCPActiveContext.get();

        if (ctx.classId) {

            classId = ctx.classId;

        }

        if (ctx.sessionDate) {

            dateStr = ctx.sessionDate;

        }

    }



    async function initTab(h, options) {

        hooks = h;

        await flushBeforeLeave();

        const data = getAppData();

        const d = domain();

        const visible = global.CCPClassroomZoneContext

            ? global.CCPClassroomZoneContext.getVisibleClasses()

            : (data.classes || []);

        if (typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.resolveActiveClassId) {

            classId = global.CCPActiveContext.resolveActiveClassId(data, {

                classId: options && options.classId,

                visibleClasses: visible

            });

        } else {

            classId =

                (options && options.classId) ||

                (data.ui && data.ui.classroomTabClassId) ||

                (visible[0] && visible[0].id) ||

                '';

        }

        dateStr =
            (options && options.date) ||
            (typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.get().sessionDate) ||
            (data.ui && data.ui.classroomTabDate) ||
            (d ? d.todayISO() : '');

        loadSession();

        const panel = document.getElementById('panel-attendance');

        render(panel);

        if (typeof global.CCPActiveContext !== 'undefined' && !initTab._subscribed) {

            initTab._subscribed = true;

            global.CCPActiveContext.subscribe(async (detail) => {

                if (panel && !panel.hidden && detail && (detail.classId !== undefined || detail.sessionDate !== undefined)) {
                    await flushBeforeLeave();
                    syncFromActiveContext();
                    if (detail.sessionDate !== undefined) {
                        const d = domain();
                        dateStr = detail.sessionDate || (d ? d.todayISO() : '');
                    }
                    loadSession();
                    render(panel);
                }

            });

        }

    }



    global.CCPClassroomAttendance = {

        initTab,

        render,

        markAllPresent,

        flushBeforeLeave

    };

})(typeof window !== 'undefined' ? window : globalThis);


