/**
 * Classroom test scores — mock tests / listening scores per class.
 */
(function (global) {
    let hooks = null;
    let classId = '';
    let testName = '';
    let testDate = '';
    let draftTest = null;

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
        const data = getAppData();
        const classes = (data.classes || []).filter(
            (c) => c && (!access() || access().canEditClass(c) || access().canBypass())
        );
        const d = domain();
        const tests = d ? d.listTestsForClass(data.studentTests, classId) : [];
        global.CCPClassroomHeader.render(
            headerMount,
            {
                classId,
                classData: getClassData(),
                classes,
                testName,
                testDate,
                studentTests: tests,
                studentCount: getStudents().length
            },
            {
                mode: 'tests',
                onClassChange: (id) => {
                    classId = id;
                    if (hooks && hooks.setUiPref) {
                        hooks.setUiPref('classroomTabClassId', id);
                    }
                    ensureDraftTest();
                    render(panel);
                },
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
            });
        });
    }

    async function saveAll(panel) {
        const editable = access() && access().canEditClass(getClassData());
        if (!editable || !draftTest) {
            return;
        }
        const d = domain();
        const data = getAppData();
        draftTest.testName = testName;
        draftTest.testDate = testDate;
        const tests = d.upsertStudentTest(data.studentTests, draftTest);
        try {
            await hooks.saveClassroom({ studentTests: tests });
            hooks.showToast(t('saved'));
            ensureDraftTest();
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
        panel.querySelector('#classroomTestsSaveBtn')?.addEventListener('click', () => saveAll(panel), {
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
        testName =
            (options && options.testName) ||
            (data.ui && data.ui.classroomTestName) ||
            t('classroomTestDefaultName');
        testDate =
            (options && options.testDate) ||
            (data.ui && data.ui.classroomTestDate) ||
            (d ? d.todayISO() : '');
        ensureDraftTest();
        render(document.getElementById('panel-tests'));
    }

    global.CCPClassroomTests = {
        initTab,
        render
    };
})(typeof window !== 'undefined' ? window : globalThis);
