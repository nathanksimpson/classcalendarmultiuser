/**

 * Classroom test scores — mock tests / listening scores per class.

 */

(function (global) {

    let hooks = null;

    let classId = '';

    let testName = '';

    let testDate = '';

    let draftTest = null;

    let panelRef = null;

    let autosave = null;

    const TESTS_AUTOSAVE_DELAY_MS = 600;



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

            delayMs: TESTS_AUTOSAVE_DELAY_MS,

            debounce: hooks && hooks.debounce ? hooks.debounce : null,

            t,

            getStatusEl: () => (panelRef || panel).querySelector('#classroomTestsSaveStatus'),

            saveAsync: (opts) => persistTests(panelRef || panel, opts)

        });

    }



    function scheduleSave() {

        ensureAutosave(panelRef);

        if (autosave) {

            autosave.scheduleSave();

        }

    }



    async function flushBeforeLeave() {

        ensureAutosave(panelRef || document.getElementById('panel-tests'));

        if (autosave) {

            await autosave.flushBeforeLeave();

        }

    }



    function ensureDraftTest() {

        const d = domain();

        const data = getAppData();

        if (!testName) {

            testName = t('classroomTestDefaultName');

        }

        if (!testDate && d) {

            testDate = d.todayISO();

        }

        const existing = d.findStudentTest(data.studentTests, classId, testName, testDate);

        draftTest = existing

            ? JSON.parse(JSON.stringify(existing))

            : {

                  id: d.newId('tst'),

                  classId,

                  testName,

                  testDate,

                  records: []

              };

    }



    function getRecord(studentId) {

        if (!draftTest || !Array.isArray(draftTest.records)) {

            return null;

        }

        return draftTest.records.find((r) => r.studentId === studentId) || null;

    }



    function setRecord(studentId, patch) {

        if (!draftTest) {

            return;

        }

        const records = Array.isArray(draftTest.records) ? draftTest.records.slice() : [];

        const idx = records.findIndex((r) => r.studentId === studentId);

        const base = idx >= 0 ? records[idx] : { studentId, score: null, maxScore: 100, note: '' };

        const next = Object.assign({}, base, patch);

        if (idx >= 0) {

            records[idx] = next;

        } else {

            records.push(next);

        }

        draftTest.records = records;

    }



    function renderHeader(panel) {

        const headerMount = panel.querySelector('#classroomTestsHeader');

        if (!headerMount || !global.CCPClassroomHeader) {

            return;

        }

        global.CCPClassroomHeader.setMode('tests');

        const d = domain();

        const tests = d ? d.listTestsForClass(data.studentTests, classId) : [];

        global.CCPClassroomHeader.render(

            headerMount,

            {

                classId,

                classData: getClassData(),

                testName,

                testDate,

                studentTests: tests,

                studentCount: getStudents().length

            },

            {

                mode: 'tests',

                onTestNameChange: (name) => {

                    testName = name;

                    if (hooks && hooks.setUiPref) {

                        hooks.setUiPref('classroomTestName', name);

                    }

                    ensureDraftTest();

                    render(panel);

                },

                onTestDateChange: (d) => {

                    testDate = d;

                    if (hooks && hooks.setUiPref) {

                        hooks.setUiPref('classroomTestDate', d);

                    }

                    ensureDraftTest();

                    render(panel);

                },

                onTestPick: (name, date) => {

                    testName = name;

                    testDate = date;

                    ensureDraftTest();

                    render(panel);

                }

            }

        );

    }



    function renderRows(panel) {

        const rowsMount = panel.querySelector('#classroomTestsRows');

        if (!rowsMount) {

            return;

        }

        const editable = access() && access().canEditClass(getClassData());

        const students = getStudents();

        const rowApi = global.CCPClassroomStudentRow;



        if (!students.length) {

            rowsMount.innerHTML = `<tr><td colspan="4" class="classroom-sheet-empty"><p class="section-hint">${escapeHtml(t('classroomNoStudentsHint'))}</p></td></tr>`;

            return;

        }



        rowsMount.innerHTML = students

            .map((entry) => {

                const sid = entry.student.id;

                const rec = getRecord(sid);

                const score = rec && rec.score != null ? rec.score : '';

                const maxScore = rec && rec.maxScore != null ? rec.maxScore : 100;

                const note = rec ? rec.note || '' : '';

                const identity = rowApi

                    ? rowApi.formatStudentIdentityColumn(entry, t)

                    : escapeHtml(entry.student.name);

                const disabled = editable ? '' : ' disabled';

                return `<tr class="classroom-sheet-row" data-student-id="${escapeHtml(sid)}">

                <td class="classroom-sheet-col-student">${identity}</td>

                <td class="classroom-sheet-col-test-score">

                    <input type="number" class="field-input field-control--compact classroom-test-score" data-student-id="${escapeHtml(sid)}" min="0" step="0.5" value="${escapeHtml(String(score))}" aria-label="${escapeHtml(t('classroomTestScore'))}"${disabled} />

                </td>

                <td class="classroom-sheet-col-test-max">

                    <input type="number" class="field-input field-control--compact classroom-test-max" data-student-id="${escapeHtml(sid)}" min="1" step="1" value="${escapeHtml(String(maxScore))}" aria-label="${escapeHtml(t('classroomTestMax'))}"${disabled} />

                </td>

                <td class="classroom-sheet-col-notes">

                    <input type="text" class="field-input field-control--compact classroom-test-note" data-student-id="${escapeHtml(sid)}" value="${escapeHtml(note)}" placeholder="${escapeHtml(t('classroomColNotes'))}"${disabled} />

                </td>

            </tr>`;

            })

            .join('');



        rowsMount.querySelectorAll('.classroom-test-score, .classroom-test-max, .classroom-test-note').forEach((input) => {

            input.addEventListener('input', () => {

                const sid = input.getAttribute('data-student-id');

                const row = rowsMount.querySelector(`tr[data-student-id="${sid}"]`);

                if (!row) {

                    return;

                }

                const scoreRaw = row.querySelector('.classroom-test-score')?.value;

                const maxRaw = row.querySelector('.classroom-test-max')?.value;

                const note = row.querySelector('.classroom-test-note')?.value || '';

                setRecord(sid, {

                    score: scoreRaw === '' ? null : Number(scoreRaw),

                    maxScore: maxRaw === '' ? null : Number(maxRaw),

                    note

                });

                scheduleSave();

            });

        });

    }



    async function persistTests(panel, options) {

        const opt = options || {};

        const editable = access() && access().canEditClass(getClassData());

        if (!editable || !draftTest) {

            return;

        }

        const saveBtn = panel?.querySelector('#classroomTestsSaveBtn');

        if (saveBtn) {

            saveBtn.disabled = true;

        }

        const d = domain();

        const data = getAppData();

        draftTest.testName = testName;

        draftTest.testDate = testDate;

        const tests = d.upsertStudentTest(data.studentTests, draftTest);

        try {

            await hooks.saveClassroom({ studentTests: tests });

            if (!opt.silent) {

                hooks.showToast(t('saved'));

            }

            ensureDraftTest();

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

        renderRows(panel);



        ensureAutosave(panel);

        if (autosave) {

            autosave.syncStatusDisplay();

            autosave.bindManualSaveBtn(panel, '#classroomTestsSaveBtn', () =>

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

        testName =

            (options && options.testName) ||

            (data.ui && data.ui.classroomTestName) ||

            t('classroomTestDefaultName');

        testDate =

            (options && options.testDate) ||

            (data.ui && data.ui.classroomTestDate) ||

            (d ? d.todayISO() : '');

        ensureDraftTest();

        const panel = document.getElementById('panel-tests');

        render(panel);

        if (typeof global.CCPActiveContext !== 'undefined' && !initTab._subscribed) {

            initTab._subscribed = true;

            global.CCPActiveContext.subscribe(async (detail) => {

                if (panel && !panel.hidden && detail && detail.classId !== undefined) {

                    await flushBeforeLeave();

                    syncFromActiveContext();

                    ensureDraftTest();

                    render(panel);

                }

            });

        }

    }



    global.CCPClassroomTests = {

        initTab,

        render,

        flushBeforeLeave

    };

})(typeof window !== 'undefined' ? window : globalThis);


