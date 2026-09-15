/**

 * Homework completion segment — full-width 3-column table layout.

 */

(function (global) {

    let hooks = null;

    let classId = '';

    let syllabusRowId = '';

    let lessonDate = '';

    let draftCompletion = null;

    let skipFilterActive = false;

    let panelRef = null;

    let autosave = null;

    const HOMEWORK_AUTOSAVE_DELAY_MS = 500;



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

            delayMs: HOMEWORK_AUTOSAVE_DELAY_MS,

            debounce: hooks && hooks.debounce ? hooks.debounce : null,

            t,

            getStatusEl: () => (panelRef || panel).querySelector('#classroomHomeworkSaveStatus'),

            saveAsync: (opts) => persistHomework(panelRef || panel, opts)

        });

    }



    function scheduleSave() {

        ensureAutosave(panelRef);

        if (autosave) {

            autosave.scheduleSave();

        }

    }



    async function flushBeforeLeave() {

        ensureAutosave(panelRef || document.getElementById('panel-homework-tracking'));

        if (autosave) {

            await autosave.flushBeforeLeave();

        }

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



    function tf(key, params) {
        let text = t(key);
        const map = params || {};
        Object.keys(map).forEach((name) => {
            text = String(text).replace(new RegExp('\\{' + name + '\\}', 'g'), String(map[name]));
        });
        return text;
    }

    function homeworkRefDate() {
        const d = domain();
        return lessonDate || (d && d.todayISO ? d.todayISO() : '');
    }

    function listSkippers() {
        const d = domain();
        if (!d || !d.listHomeworkChronicSkippers || !classId) {
            return [];
        }
        return d.listHomeworkChronicSkippers(getAppData(), classId, homeworkRefDate());
    }

    function renderAttentionStrip(panel) {
        const mount = panel && panel.querySelector('#classroomHomeworkAttentionStrip');
        if (!mount) {
            return;
        }
        const skippers = listSkippers();
        if (!skippers.length) {
            skipFilterActive = false;
            mount.hidden = true;
            mount.innerHTML = '';
            return;
        }
        mount.hidden = false;
        const count = skippers.length;
        const label =
            count === 1 ? t('classroomHomeworkSkipAttentionOne') : tf('classroomHomeworkSkipAttention', { n: count });
        const pressed = skipFilterActive ? 'true' : 'false';
        const active = skipFilterActive ? ' is-active' : '';
        const filterHint = skipFilterActive
            ? `<span class="section-hint">${escapeHtml(t('classroomHomeworkSkipFilterAll'))}</span>`
            : '';
        mount.innerHTML = `<div class="classroom-essay-attention-strip-inner">
            <span class="classroom-essay-attention-label">${escapeHtml(t('classroomHomeworkSkipAttentionLabel'))}</span>
            <div class="classroom-essay-attention-tiles">
                <button type="button" class="classroom-essay-attention-tile classroom-essay-attention-tile--overdue${active}" data-homework-skip-filter="1" aria-pressed="${pressed}">
                    <span class="classroom-essay-attention-tile__count">${count}</span>
                    <span class="classroom-essay-attention-tile__text">
                        <span class="classroom-essay-attention-tile__title">${escapeHtml(label)}</span>
                    </span>
                </button>
            </div>
            ${filterHint}
        </div>`;
        const btn = mount.querySelector('[data-homework-skip-filter]');
        if (btn) {
            btn.addEventListener('click', () => {
                skipFilterActive = !skipFilterActive;
                render(panel);
            });
        }
    }

    function renderHeader(panel) {

        const headerMount = panel.querySelector('#classroomHomeworkHeader');

        if (!headerMount || !global.CCPClassroomHeader) {

            return;

        }

        global.CCPClassroomHeader.setMode('homework');

        global.CCPClassroomHeader.render(

            headerMount,

            {

                classId,

                classData: getClassData(),

                syllabusRowId,

                studentCount: getStudents().length

            },

            {

                mode: 'homework',

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

            return `<label class="checkbox-label selection-chip classroom-status-chip"><input type="radio" name="hw_${escapeHtml(studentId)}" value="${grade}"${checked}${disabled} data-student-id="${escapeHtml(studentId)}" /> ${grade}</label>`;

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

        const skipperIds = new Set(listSkippers().map((s) => s.studentId));

        const visibleStudents = skipFilterActive
            ? students.filter((entry) => entry && entry.student && skipperIds.has(entry.student.id))
            : students;



        if (!syllabusRowId) {

            rowsMount.innerHTML = `<tr><td colspan="4" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomNoAssignment'))}</p></td></tr>`;

            return;

        }



        if (!visibleStudents.length) {

            rowsMount.innerHTML = `<tr><td colspan="4" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomNoStudentsHint'))}</p></td></tr>`;

            return;

        }



        rowsMount.innerHTML = visibleStudents

            .map((entry) => {

                const sid = entry.student.id;

                const rec = getRecord(sid);

                const grade = rec ? rec.grade : 'X';
                const hwRail =
                    grade === 'A' || grade === 'B' || grade === 'C'
                        ? ' classroom-sheet-row--status-homework-done'
                        : ' classroom-sheet-row--status-homework-missing';
                const railCls = ` classroom-sheet-row--status-rail${hwRail}`;

                const selfCheck = rec ? rec.selfCheck : 'none';

                const parentCheck = rec ? rec.parentCheck : false;

                const note = rec ? rec.note || '' : '';

                const missCount =
                    d && d.countRecentHomeworkMisses
                        ? d.countRecentHomeworkMisses(
                            getAppData().homeworkCompletions,
                            sid,
                            classId,
                            homeworkRefDate()
                        )
                        : 0;
                const missHint =
                    missCount > 0
                        ? `<span class="classroom-recent-absence">${escapeHtml(
                            t('classroomRecentHomeworkMiss').replace('{n}', String(missCount))
                        )}</span>`
                        : '';

                const identity = rowApi

                    ? rowApi.formatStudentIdentityColumn(entry, t, { extraHtml: missHint })

                    : escapeHtml(entry.student.name);

                const selfOptions = d.HOMEWORK_SELF_CHECKS.map((sc) => {

                    const sel = selfCheck === sc ? ' selected' : '';

                    return `<option value="${sc}"${sel}>${escapeHtml(t('classroomSelfCheck_' + sc))}</option>`;

                }).join('');

                const disabled = editable ? '' : ' disabled';

                return `<tr class="classroom-sheet-row${railCls}" data-student-id="${escapeHtml(sid)}">

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

                scheduleSave();

            });

        });

        rowsMount.querySelectorAll('.classroom-self-check').forEach((sel) => {

            sel.addEventListener('change', () => {

                setRecord(sel.getAttribute('data-student-id'), { selfCheck: sel.value });

                scheduleSave();

            });

        });

        rowsMount.querySelectorAll('.classroom-parent-check').forEach((cb) => {

            cb.addEventListener('change', () => {

                setRecord(cb.getAttribute('data-student-id'), { parentCheck: cb.checked });

                scheduleSave();

            });

        });

        rowsMount.querySelectorAll('.classroom-hw-note').forEach((input) => {

            input.addEventListener('input', () => {

                setRecord(input.getAttribute('data-student-id'), { note: input.value });

                scheduleSave();

            });

        });

    }



    async function persistHomework(panel, options) {

        const opt = options || {};

        const editable = access() && access().canEditClass(getClassData());

        if (!editable || !draftCompletion) {

            return;

        }

        const saveBtn = panel?.querySelector('#classroomHomeworkSaveBtn');

        if (saveBtn) {

            saveBtn.disabled = true;

        }

        const d = domain();

        const data = getAppData();

        draftCompletion.syllabusRowId = syllabusRowId;

        draftCompletion.lessonDate = lessonDate;

        const completions = d.upsertHomeworkCompletion(data.homeworkCompletions, draftCompletion);

        try {

            await hooks.saveClassroom({ homeworkCompletions: completions });

            if (global.CCPTabWarnings && global.CCPTabWarnings.scheduleRefresh) {
                global.CCPTabWarnings.scheduleRefresh();
            }

            if (!opt.silent) {

                hooks.showToast(t('saved'));

            }

            loadCompletion();

            if (!opt.silent) {

                render(panel);

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



    function render(panel) {

        if (!panel) {

            return;

        }

        panelRef = panel;

        renderHeader(panel);

        renderAttentionStrip(panel);

        renderRows(panel);

        const syncBtn = panel.querySelector('#classroomHomeworkTmsSyncBtn');
        if (syncBtn) {
            syncBtn.hidden = !(access() && access().canEditClass(getClassData()));
        }



        ensureAutosave(panel);

        if (autosave) {

            autosave.syncStatusDisplay();

            autosave.bindManualSaveBtn(panel, '#classroomHomeworkSaveBtn', () =>

                access() && access().canEditClass(getClassData())

            );

        }

    }



    function syncFromActiveContext() {

        if (typeof global.CCPActiveContext === 'undefined') {

            return;

        }

        const ctx = global.CCPActiveContext.get();

        if (ctx.classId) {

            if (classId !== ctx.classId) {
                skipFilterActive = false;
            }

            classId = ctx.classId;

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

        skipFilterActive = false;

        syllabusRowId = (options && options.syllabusRowId) || (data.ui && data.ui.classroomTabSyllabusRowId) || '';

        lessonDate = (data.ui && data.ui.classroomTabDate) || (d ? d.todayISO() : '');

        if (!syllabusRowId) {

            pickDefaultRow();

        }

        loadCompletion();

        const panel = document.getElementById('panel-homework-tracking');

        render(panel);

        if (global.CCPClassroomHomeworkTms && global.CCPClassroomHomeworkTms.init) {
            global.CCPClassroomHomeworkTms.init(hooks, {
                getClassId: () => classId,
                getClassName: () => {
                    const data = hooks && hooks.getAppData ? hooks.getAppData() : {};
                    const cls = (Array.isArray(data.classes) ? data.classes : []).find(
                        (c) => c && String(c.id) === String(classId)
                    );
                    return cls && cls.name ? String(cls.name) : '';
                },
                getSyllabusRowId: () => syllabusRowId,
                getLessonDate: () => lessonDate,
                afterApply: () => {
                    loadCompletion();
                    render(panel);
                }
            });
        }

        if (typeof global.CCPActiveContext !== 'undefined' && !initTab._subscribed) {

            initTab._subscribed = true;

            global.CCPActiveContext.subscribe(async (detail) => {

                if (panel && !panel.hidden && detail && detail.classId !== undefined) {

                    await flushBeforeLeave();

                    syncFromActiveContext();

                    syllabusRowId = '';

                    pickDefaultRow();

                    loadCompletion();

                    render(panel);

                }

            });

        }

    }



    global.CCPClassroomHomework = {

        initTab,

        render,

        flushBeforeLeave

    };

})(typeof window !== 'undefined' ? window : globalThis);


