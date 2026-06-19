/**
 * Classroom Ledger — attendance, homework grade, and points on one grid.
 */
(function (global) {
    let hooks = null;
    let bridge = null;
    let classId = '';
    let dateStr = '';
    let syllabusRowId = '';
    let lessonDate = '';
    let draftAttendance = null;
    let draftHomework = null;
    let dirty = false;
    const ROW_HEIGHT = 48;
    const OVERSCAN = 6;

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
        if (hooks && hooks.escapeHtml) {
            return hooks.escapeHtml(s);
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
        return (getAppData().classes || []).find((c) => c && c.id === classId) || null;
    }

    function getEditableClasses() {
        const data = getAppData();
        const cohortId =
            typeof global.CCPCohortSidebarFilter !== 'undefined'
                ? global.CCPCohortSidebarFilter.getActiveCohortId()
                : '';
        let classes = (data.classes || []).filter(
            (c) => c && (!access() || access().canEditClass(c) || access().canBypass())
        );
        if (cohortId && global.CCPCohortSidebarFilter) {
            classes = global.CCPCohortSidebarFilter.filterClassesByCohort(classes, cohortId);
        }
        return classes;
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

    function ensureClassId() {
        const classes = getEditableClasses();
        if (classId && classes.some((c) => c.id === classId)) {
            return;
        }
        classId = classes[0] ? classes[0].id : '';
    }

    function pickDefaultSyllabusRow() {
        const d = domain();
        const classData = getClassData();
        if (!classData || !d) {
            return null;
        }
        const row = d.pickDefaultSyllabusRow(classData, dateStr || d.todayISO());
        if (row) {
            syllabusRowId = d.getSyllabusRowKey(row);
            lessonDate = row.date || '';
        }
        return row;
    }

    function loadDrafts() {
        const d = domain();
        if (!bridge || !d) {
            return;
        }
        const existing = bridge.getAttendanceSession(classId, dateStr);
        draftAttendance = existing
            ? JSON.parse(JSON.stringify(existing))
            : {
                id: d.newId('att'),
                classId,
                date: dateStr,
                records: []
            };
        if (!syllabusRowId) {
            pickDefaultSyllabusRow();
        }
        const data = getAppData();
        const hwExisting = d.findHomeworkCompletion(data.homeworkCompletions, classId, syllabusRowId);
        draftHomework = hwExisting
            ? JSON.parse(JSON.stringify(hwExisting))
            : {
                id: d.newId('hw'),
                classId,
                syllabusRowId,
                lessonDate,
                records: []
            };
        dirty = false;
    }

    function getStudents() {
        if (!bridge) {
            return [];
        }
        return bridge.getRoster(classId);
    }

    function renderHeader(panel) {
        const mount = panel.querySelector('#classroomLedgerHeader');
        if (!mount) {
            return;
        }
        const classes = getEditableClasses();
        const classOptions = classes
            .map((c) => {
                const sel = c.id === classId ? ' selected' : '';
                return `<option value="${escapeHtml(c.id)}"${sel}>${escapeHtml(c.name || c.id)}</option>`;
            })
            .join('');
        const d = domain();
        const today = d ? d.todayISO() : '';
        mount.innerHTML = `
            <div class="classroom-ledger-header">
                <label class="classroom-header-field"><span>${escapeHtml(t('classroomClassLabel'))}</span>
                <select id="classroomLedgerClassSelect" class="field-select field-control--compact">${classOptions}</select></label>
                <label class="classroom-header-field"><span>${escapeHtml(t('classroomDateLabel'))}</span>
                <input type="date" id="classroomLedgerDate" class="field-input field-control--compact" value="${escapeHtml(dateStr)}" /></label>
                <button type="button" class="btn btn-outline btn-compact" id="classroomLedgerToday">${escapeHtml(t('classroomToday'))}</button>
            </div>`;
        mount.querySelector('#classroomLedgerClassSelect')?.addEventListener('change', (e) => {
            classId = e.target.value;
            if (typeof global.CCPActiveContext !== 'undefined') {
                global.CCPActiveContext.set({ classId }, { source: 'ledger-header' });
            }
            loadDrafts();
            render(panel);
        });
        mount.querySelector('#classroomLedgerDate')?.addEventListener('change', (e) => {
            dateStr = e.target.value;
            if (typeof global.CCPActiveContext !== 'undefined') {
                global.CCPActiveContext.set({ sessionDate: dateStr }, { source: 'ledger-header' });
            }
            loadDrafts();
            render(panel);
        });
        mount.querySelector('#classroomLedgerToday')?.addEventListener('click', () => {
            dateStr = today;
            if (typeof global.CCPActiveContext !== 'undefined') {
                global.CCPActiveContext.set({ sessionDate: dateStr }, { source: 'ledger-header' });
            }
            loadDrafts();
            render(panel);
        });
    }

    function buildAttendanceToggles(studentId, editable) {
        const d = domain();
        const statuses = ['present', 'late', 'absent'];
        const labels = { present: 'P', late: 'L', absent: 'A' };
        const current = bridge.getAttendanceStatus(classId, dateStr, studentId);
        const recSession = draftAttendance;
        let status = current;
        if (recSession && Array.isArray(recSession.records)) {
            const rec = recSession.records.find((r) => r.studentId === studentId);
            if (rec) {
                status = rec.status;
            }
        }
        return statuses
            .map((st) => {
                const active = status === st ? ' classroom-ledger-toggle--active' : '';
                const dis = editable ? '' : ' disabled';
                return `<button type="button" class="classroom-ledger-toggle classroom-ledger-toggle--att${active}" data-student-id="${escapeHtml(studentId)}" data-status="${st}"${dis} aria-label="${escapeHtml(t('classroomStatus_' + st))}">${labels[st]}</button>`;
            })
            .join('');
    }

    function buildHomeworkToggles(studentId, editable) {
        const d = domain();
        const grades = d ? d.HOMEWORK_GRADES.filter((g) => ['A', 'B', 'C', 'N', 'F'].includes(g)) : ['A', 'B', 'C', 'N', 'F'];
        let current = '';
        if (draftHomework && Array.isArray(draftHomework.records)) {
            const rec = draftHomework.records.find((r) => r.studentId === studentId);
            current = rec && rec.grade ? rec.grade : '';
        }
        return grades
            .map((g) => {
                const active = current === g ? ' classroom-ledger-toggle--active' : '';
                const dis = editable ? '' : ' disabled';
                return `<button type="button" class="classroom-ledger-toggle classroom-ledger-toggle--hw${active}" data-student-id="${escapeHtml(studentId)}" data-grade="${g}"${dis}>${g}</button>`;
            })
            .join('');
    }

    function buildPointsControls(studentId, editable) {
        const sum = bridge.getPointsSum(classId, studentId);
        const dis = editable ? '' : ' disabled';
        return `<div class="classroom-ledger-points" data-student-id="${escapeHtml(studentId)}">
            <span class="classroom-ledger-points-sum">${sum}</span>
            <button type="button" class="classroom-ledger-toggle classroom-ledger-toggle--pt" data-delta="-1"${dis}>−</button>
            <button type="button" class="classroom-ledger-toggle classroom-ledger-toggle--pt" data-delta="1"${dis}>+</button>
        </div>`;
    }

    function renderVirtualRows(panel, students, editable) {
        const scroll = panel.querySelector('#classroomLedgerScroll');
        const body = panel.querySelector('#classroomLedgerBody');
        if (!scroll || !body) {
            return;
        }
        if (!students.length) {
            body.innerHTML = `<tr><td colspan="4" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomNoStudentsHint'))}</p></td></tr>`;
            return;
        }
        const viewHeight = scroll.clientHeight || 400;
        const scrollTop = scroll.scrollTop || 0;
        const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
        const visibleCount = Math.ceil(viewHeight / ROW_HEIGHT) + OVERSCAN * 2;
        const end = Math.min(students.length, start + visibleCount);
        const topPad = start * ROW_HEIGHT;
        const bottomPad = Math.max(0, students.length - end) * ROW_HEIGHT;
        const slice = students.slice(start, end);
        const rowsHtml = slice
            .map((entry) => {
                const sid = entry.student.id;
                const name = escapeHtml(entry.student.name || sid);
                return `<tr class="classroom-ledger-row" data-student-id="${escapeHtml(sid)}" style="height:${ROW_HEIGHT}px">
                <td class="classroom-ledger-col-student">${name}</td>
                <td class="classroom-ledger-col-att"><div class="classroom-ledger-toggles">${buildAttendanceToggles(sid, editable)}</div></td>
                <td class="classroom-ledger-col-hw"><div class="classroom-ledger-toggles">${buildHomeworkToggles(sid, editable)}</div></td>
                <td class="classroom-ledger-col-pt">${buildPointsControls(sid, editable)}</td>
            </tr>`;
            })
            .join('');
        body.innerHTML = `${topPad ? `<tr class="classroom-ledger-spacer" aria-hidden="true"><td colspan="4" style="height:${topPad}px;padding:0;border:0;"></td></tr>` : ''}${rowsHtml}${bottomPad ? `<tr class="classroom-ledger-spacer" aria-hidden="true"><td colspan="4" style="height:${bottomPad}px;padding:0;border:0;"></td></tr>` : ''}`;
        bindRowHandlers(panel, editable);
    }

    function bindRowHandlers(panel, editable) {
        const body = panel.querySelector('#classroomLedgerBody');
        if (!body || !editable) {
            return;
        }
        body.querySelectorAll('.classroom-ledger-toggle--att').forEach((btn) => {
            btn.addEventListener('click', () => {
                const sid = btn.getAttribute('data-student-id');
                const status = btn.getAttribute('data-status');
                draftAttendance = bridge.setAttendanceStatus(classId, dateStr, sid, status, draftAttendance);
                dirty = true;
                render(panel);
            });
        });
        body.querySelectorAll('.classroom-ledger-toggle--hw').forEach((btn) => {
            btn.addEventListener('click', () => {
                const sid = btn.getAttribute('data-student-id');
                const grade = btn.getAttribute('data-grade');
                draftHomework = bridge.setHomeworkGrade(
                    classId,
                    syllabusRowId,
                    lessonDate,
                    sid,
                    grade,
                    draftHomework
                );
                dirty = true;
                render(panel);
            });
        });
        body.querySelectorAll('.classroom-ledger-points').forEach((wrap) => {
            const sid = wrap.getAttribute('data-student-id');
            wrap.querySelectorAll('.classroom-ledger-toggle--pt').forEach((btn) => {
                btn.addEventListener('click', () => {
                    void applyPointDelta(panel, sid, Number(btn.getAttribute('data-delta') || 0));
                });
            });
        });
    }

    async function applyPointDelta(panel, studentId, delta) {
        if (!delta || !access() || !access().canEditClass(getClassData())) {
            return;
        }
        const entry = bridge.buildPointEntry(classId, dateStr, studentId, delta, 'ledger');
        const data = getAppData();
        const d = domain();
        const next = d.appendPointEntry(data.studentPoints, entry);
        try {
            await hooks.saveClassroom({ studentPoints: next }, { skipPointsNoteReconcile: true });
            if (typeof hooks.syncPointsDayNote === 'function') {
                await hooks.syncPointsDayNote(classId, dateStr);
            }
            render(panel);
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
        }
    }

    async function saveAll(panel) {
        const editable = access() && access().canEditClass(getClassData());
        if (!editable || !dirty) {
            return;
        }
        const d = domain();
        const data = getAppData();
        const fields = {};
        if (draftAttendance) {
            const sessions = d.upsertAttendanceSession(data.attendanceSessions, draftAttendance);
            fields.attendanceSessions = sessions;
        }
        if (draftHomework && syllabusRowId) {
            draftHomework.syllabusRowId = syllabusRowId;
            draftHomework.lessonDate = lessonDate;
            fields.homeworkCompletions = d.upsertHomeworkCompletion(data.homeworkCompletions, draftHomework);
        }
        if (!Object.keys(fields).length) {
            return;
        }
        try {
            await hooks.saveClassroom(fields);
            hooks.showToast(t('saved'));
            dirty = false;
            loadDrafts();
            render(panel);
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
        }
    }

    function render(panel) {
        if (!panel) {
            return;
        }
        syncFromActiveContext();
        ensureClassId();
        const d = domain();
        if (!dateStr && d) {
            dateStr = d.todayISO();
        }
        if (!bridge) {
            bridge = global.CCPLedgerBridge.createBridge(hooks);
        }
        loadDrafts();
        renderHeader(panel);
        const editable = access() && access().canEditClass(getClassData());
        const students = getStudents();
        renderVirtualRows(panel, students, editable);
        const scroll = panel.querySelector('#classroomLedgerScroll');
        if (scroll && !scroll.dataset.ledgerBound) {
            scroll.dataset.ledgerBound = '1';
            scroll.addEventListener('scroll', () => renderVirtualRows(panel, getStudents(), editable));
        }
        panel.querySelector('#classroomLedgerSaveBtn')?.addEventListener('click', () => saveAll(panel), {
            once: true
        });
    }

    function initTab(h, options) {
        hooks = h;
        bridge = global.CCPLedgerBridge.createBridge(hooks, options);
        syncFromActiveContext();
        if (options && options.classId) {
            classId = options.classId;
        }
        const panel = document.getElementById('panel-ledger');
        render(panel);
        if (typeof global.CCPActiveContext !== 'undefined' && !initTab._subscribed) {
            initTab._subscribed = true;
            global.CCPActiveContext.subscribe(() => {
                if (panel && !panel.hidden) {
                    render(panel);
                }
            });
        }
    }

    global.CCPClassroomLedger = {
        initTab,
        render
    };
})(typeof window !== 'undefined' ? window : globalThis);
