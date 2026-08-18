/**
 * Tools → Speaking Test (Navy speaking score tracker with team sync).
 */
(function (global) {
    'use strict';

    let hooks = null;
    let classId = '';
    let panelRef = null;
    let mountReady = false;
    let autosave = null;
    let contextSubscribed = false;
    let draftRecord = null;
    let editingStudentId = null;
    let editingAssignmentId = null;
    let parsedPastePlan = null;
    let localImportDismissed = false;
    const AUTOSAVE_DELAY_MS = 800;

    function domain() {
        return global.CCPClassroomDomain;
    }

    function access() {
        return global.CCPClassroomAccess;
    }

    function core() {
        return global.CCPSpeakingTestCore;
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

    function escapeAttr(s) {
        return escapeHtml(s).replace(/"/g, '&quot;');
    }

    function getAppData() {
        return hooks && hooks.getAppData ? hooks.getAppData() : {};
    }

    function getClassData() {
        const data = getAppData();
        return (data.classes || []).find((c) => c && c.id === classId) || null;
    }

    function canEdit() {
        return !!(access() && access().canEditClass(getClassData()));
    }

    function studentDisplayName(student) {
        if (!student) {
            return '';
        }
        const name = String(student.name || '').trim();
        const en = String(student.nameEn || '').trim();
        if (name && en && !name.includes('(')) {
            return `${name} (${en})`;
        }
        return name || en || student.id || '';
    }

    function getRosterEntries() {
        const d = domain();
        const data = getAppData();
        if (!d || !classId) {
            return [];
        }
        return d.resolveStudentsForClass(getClassData(), data.cohorts) || [];
    }

    function getRosterStudentsForSort() {
        return getRosterEntries().map((entry, index) => {
            const s = entry.student || {};
            return {
                id: s.id,
                name: studentDisplayName(s),
                entryOrder: Number.isFinite(s.sortOrder) ? s.sortOrder : index,
                pasteOrder: Number.isFinite(s.sortOrder) ? s.sortOrder : index
            };
        });
    }

    function getSortedRoster() {
        const c = core();
        const mode =
            (draftRecord && draftRecord.settings && draftRecord.settings.studentSortMode) ||
            'alphabetical';
        if (!c) {
            return getRosterStudentsForSort();
        }
        return c.getSortedStudents(getRosterStudentsForSort(), mode);
    }

    function ensureDraftRecord() {
        const d = domain();
        const data = getAppData();
        if (!d || !classId) {
            draftRecord = null;
            return;
        }
        const existing = d.findSpeakingTestRecord(data.speakingTestRecords, classId);
        if (existing) {
            draftRecord = JSON.parse(JSON.stringify(existing));
        } else {
            draftRecord = {
                id: d.newId('spk'),
                classId,
                settings: { studentSortMode: 'alphabetical' },
                assignments: [],
                scores: {}
            };
        }
        if (!draftRecord.settings) {
            draftRecord.settings = { studentSortMode: 'alphabetical' };
        }
        if (!Array.isArray(draftRecord.assignments)) {
            draftRecord.assignments = [];
        }
        if (!draftRecord.scores || typeof draftRecord.scores !== 'object') {
            draftRecord.scores = {};
        }
    }

    function ensureAutosave(panel) {
        if (autosave || !global.CCPClassroomAutosave) {
            return;
        }
        autosave = global.CCPClassroomAutosave.create({
            delayMs: AUTOSAVE_DELAY_MS,
            debounce: hooks && hooks.debounce ? hooks.debounce : null,
            t,
            getStatusEl: () => (panelRef || panel).querySelector('#speakingTestSaveStatus'),
            saveAsync: (opts) => persistRecord(panelRef || panel, opts)
        });
    }

    function scheduleSave() {
        ensureAutosave(panelRef);
        if (autosave) {
            autosave.scheduleSave();
        }
    }

    async function persistRecord(panel, options) {
        const opt = options || {};
        if (!canEdit() || !draftRecord || !classId) {
            return;
        }
        const saveBtn = panel && panel.querySelector('#speakingTestSaveBtn');
        if (saveBtn) {
            saveBtn.disabled = true;
        }
        const d = domain();
        const data = getAppData();
        if (!Array.isArray(data.speakingTestRecords)) {
            data.speakingTestRecords = [];
        }
        const next = d.upsertSpeakingTestRecord(data.speakingTestRecords, draftRecord);
        try {
            await hooks.saveClassroom({ speakingTestRecords: next });
            data.speakingTestRecords = next;
            draftRecord = JSON.parse(
                JSON.stringify(d.findSpeakingTestRecord(next, classId) || draftRecord)
            );
            if (!opt.silent && hooks.showToast) {
                hooks.showToast(t('classroomSaveSaved'), false);
            }
        } catch (err) {
            console.error('Speaking test save failed', err);
            if (hooks && hooks.showToast) {
                hooks.showToast(err && err.message ? err.message : t('classroomSaveError'), true);
            }
            throw err;
        } finally {
            if (saveBtn) {
                saveBtn.disabled = !canEdit();
            }
        }
    }

    async function flushBeforeLeave() {
        ensureAutosave(panelRef || document.getElementById('panel-speaking-test'));
        if (autosave && autosave.flushBeforeLeave) {
            await autosave.flushBeforeLeave();
        }
    }

    function applyPanelI18n(root) {
        if (!root) {
            return;
        }
        root.querySelectorAll('[data-i18n]').forEach((elNode) => {
            const key = elNode.getAttribute('data-i18n');
            if (key) {
                elNode.textContent = t(key);
            }
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach((elNode) => {
            const key = elNode.getAttribute('data-i18n-placeholder');
            if (key) {
                elNode.setAttribute('placeholder', t(key));
            }
        });
        root.querySelectorAll('[data-i18n-aria-label]').forEach((elNode) => {
            const key = elNode.getAttribute('data-i18n-aria-label');
            if (key) {
                elNode.setAttribute('aria-label', t(key));
            }
        });
    }

    async function ensureMount(panel) {
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        if (!mount) {
            return false;
        }
        if (mount.querySelector('.speaking-test-layout')) {
            mountReady = true;
            return true;
        }
        try {
            const res = await fetch('templates/classroom-speaking-test-body.html', {
                cache: 'no-store'
            });
            if (!res.ok) {
                mount.innerHTML = `<p class="section-hint">${escapeHtml(t('speakingTestMountError'))}</p>`;
                return false;
            }
            mount.innerHTML = await res.text();
        } catch (err) {
            console.error('Speaking test template load failed', err);
            mount.innerHTML = `<p class="section-hint">${escapeHtml(t('speakingTestMountError'))}</p>`;
            return false;
        }
        applyPanelI18n(mount);
        bindMount(panel);
        mountReady = true;
        return true;
    }

    function setModalOpen(modal, open) {
        if (!modal) {
            return;
        }
        if (open) {
            modal.hidden = false;
            modal.classList.add('active');
        } else {
            modal.hidden = true;
            modal.classList.remove('active');
        }
    }

    function bindMount(panel) {
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        if (!mount || mount.dataset.bound === '1') {
            return;
        }
        mount.dataset.bound = '1';

        const sortSelect = mount.querySelector('#speakingTestSortMode');
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                if (!draftRecord) {
                    return;
                }
                draftRecord.settings.studentSortMode = sortSelect.value;
                scheduleSave();
                renderTable(panel);
            });
        }

        const form = mount.querySelector('#speakingTestAddAssignmentForm');
        if (form) {
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                addAssignment(panel);
            });
        }

        const openStudentsBtn = mount.querySelector('#speakingTestOpenStudentsBtn');
        if (openStudentsBtn) {
            openStudentsBtn.addEventListener('click', () => {
                if (hooks && hooks.navigateToZone) {
                    hooks.navigateToZone('classroom', 'students');
                }
            });
        }

        const parseBtn = mount.querySelector('#speakingTestPasteParseBtn');
        if (parseBtn) {
            parseBtn.addEventListener('click', () => previewPasteImport(panel));
        }
        const importBtn = mount.querySelector('#speakingTestPasteImportBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => openImportConfirm(panel));
        }

        const table = mount.querySelector('#speakingTestTable');
        if (table) {
            table.addEventListener('click', (event) => handleTableClick(event, panel));
        }

        const scorerModal = mount.querySelector('#speakingTestScorerModal');
        if (scorerModal && !scorerModal.dataset.bound) {
            scorerModal.dataset.bound = '1';
            const prevBtn = mount.querySelector('#speakingTestScorerPrevBtn');
            const nextBtn = mount.querySelector('#speakingTestScorerNextBtn');
            const closeBtn = mount.querySelector('#speakingTestScorerCloseBtn');
            const questions = mount.querySelector('#speakingTestScorerQuestions');
            if (prevBtn) {
                prevBtn.addEventListener('click', () => stepScorerStudent(panel, -1));
            }
            if (nextBtn) {
                nextBtn.addEventListener('click', () => stepScorerStudent(panel, 1));
            }
            if (closeBtn) {
                closeBtn.addEventListener('click', () => closeScorer(panel));
            }
            scorerModal.addEventListener('click', (event) => {
                if (event.target === scorerModal) {
                    closeScorer(panel);
                }
            });
            scorerModal.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    closeScorer(panel);
                }
            });
            if (questions) {
                questions.addEventListener('click', (event) => {
                    const btn = event.target.closest('.speaking-test-grade-btn');
                    if (!btn || btn.disabled || !questions.contains(btn)) {
                        return;
                    }
                    const group = btn.closest('.speaking-test-grade-segments');
                    if (!group) {
                        return;
                    }
                    group.querySelectorAll('.speaking-test-grade-btn').forEach((el) => {
                        const active = el === btn;
                        el.classList.toggle('is-active', active);
                        el.setAttribute('aria-checked', active ? 'true' : 'false');
                    });
                    applyScorerScoresLive(panel);
                });
                questions.addEventListener('input', (event) => {
                    if (event.target && event.target.classList.contains('speaking-test-note-input')) {
                        applyScorerScoresLive(panel);
                    }
                });
            }
        }

        const importModal = mount.querySelector('#speakingTestImportConfirmModal');
        if (importModal) {
            importModal.addEventListener('click', (event) => {
                if (event.target === importModal) {
                    setModalOpen(importModal, false);
                }
            });
            const mergeBtn = mount.querySelector('#speakingTestImportMergeBtn');
            const replaceBtn = mount.querySelector('#speakingTestImportReplaceBtn');
            const cancelBtn = mount.querySelector('#speakingTestImportCancelBtn');
            if (mergeBtn) {
                mergeBtn.addEventListener('click', () => void confirmPasteImport(panel, 'merge'));
            }
            if (replaceBtn) {
                replaceBtn.addEventListener('click', () => void confirmPasteImport(panel, 'replace'));
            }
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => setModalOpen(importModal, false));
            }
        }
    }

    function bindToolbar(panel) {
        const saveBtn = panel.querySelector('#speakingTestSaveBtn');
        if (saveBtn && !saveBtn.dataset.bound) {
            saveBtn.dataset.bound = '1';
            saveBtn.addEventListener('click', () => {
                if (autosave && autosave.invokeSave) {
                    void autosave.invokeSave({ silent: false });
                }
            });
        }
        const printBlank = panel.querySelector('#speakingTestPrintBlankBtn');
        if (printBlank && !printBlank.dataset.bound) {
            printBlank.dataset.bound = '1';
            printBlank.addEventListener('click', () => {
                const c = core();
                if (!c) {
                    return;
                }
                const classData = getClassData();
                c.printBlankScoreSheets(
                    getSortedRoster(),
                    classData ? classData.name : ''
                );
            });
        }
        const printAll = panel.querySelector('#speakingTestPrintAllBtn');
        if (printAll && !printAll.dataset.bound) {
            printAll.dataset.bound = '1';
            printAll.addEventListener('click', () => {
                const c = core();
                if (!c || !draftRecord) {
                    return;
                }
                const students = getSortedRoster().map((s) => ({
                    id: s.id,
                    name: s.name,
                    scores: (draftRecord.scores && draftRecord.scores[s.id]) || {}
                }));
                c.printAllSummaries(students, draftRecord.assignments || []);
            });
        }
        const localImportBtn = panel.querySelector('#speakingTestLocalImportBtn');
        if (localImportBtn && !localImportBtn.dataset.bound) {
            localImportBtn.dataset.bound = '1';
            localImportBtn.addEventListener('click', () => void importFromLocalStorage(panel));
        }
        const localDismiss = panel.querySelector('#speakingTestLocalImportDismissBtn');
        if (localDismiss && !localDismiss.dataset.bound) {
            localDismiss.dataset.bound = '1';
            localDismiss.addEventListener('click', () => {
                localImportDismissed = true;
                const c = core();
                if (c) {
                    c.markLocalStorageImported();
                }
                updateLocalImportBanner(panel);
            });
        }
    }

    function updateLocalImportBanner(panel) {
        const banner = panel.querySelector('#speakingTestLocalImportBanner');
        if (!banner) {
            return;
        }
        const c = core();
        const show =
            !localImportDismissed &&
            classId &&
            canEdit() &&
            c &&
            !c.wasLocalStorageImported() &&
            c.readLocalStorageTracker() &&
            draftRecord &&
            (!draftRecord.assignments || !draftRecord.assignments.length);
        banner.hidden = !show;
    }

    function importFromLocalStorage(panel) {
        const c = core();
        const d = domain();
        if (!c || !d || !draftRecord) {
            return;
        }
        const local = c.readLocalStorageTracker();
        const mapped = c.mapLocalStorageToRecord(local, getSortedRoster());
        if (!mapped) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('speakingTestLocalImportNone'), true);
            }
            return;
        }
        draftRecord.assignments = mapped.assignments;
        draftRecord.scores = Object.assign({}, draftRecord.scores || {}, mapped.scores);
        if (mapped.settings && mapped.settings.studentSortMode) {
            draftRecord.settings.studentSortMode = mapped.settings.studentSortMode;
        }
        c.markLocalStorageImported();
        localImportDismissed = true;
        scheduleSave();
        renderTable(panel);
        updateLocalImportBanner(panel);
        if (hooks && hooks.showToast) {
            const msg = t('speakingTestLocalImportDone')
                .replace('{matched}', String(mapped.matched))
                .replace('{unmatched}', String(mapped.unmatched.length));
            hooks.showToast(msg, false);
        }
    }

    function getPrimaryCohortId() {
        const d = domain();
        const classData = getClassData();
        if (!d || !classData) {
            return '';
        }
        const ids = d.getCohortIdsForClass(classData);
        return ids && ids.length ? ids[0] : '';
    }

    function previewPasteImport(panel) {
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        const textarea = mount && mount.querySelector('#speakingTestPasteText');
        const errEl = mount && mount.querySelector('#speakingTestPasteError');
        const preview = mount && mount.querySelector('#speakingTestPastePreview');
        const countEl = mount && mount.querySelector('#speakingTestPasteCount');
        const listEl = mount && mount.querySelector('#speakingTestPasteList');
        const importBtn = mount && mount.querySelector('#speakingTestPasteImportBtn');
        const ri = global.CCPRosterImport;
        if (!ri || !textarea) {
            return;
        }
        parsedPastePlan = null;
        if (errEl) {
            errEl.hidden = true;
            errEl.textContent = '';
        }
        if (preview) {
            preview.hidden = true;
        }
        if (importBtn) {
            importBtn.disabled = true;
        }
        const cohortId = getPrimaryCohortId();
        if (!cohortId) {
            if (errEl) {
                errEl.textContent = t('speakingTestPasteNoCohort');
                errEl.hidden = false;
            }
            return;
        }
        const data = getAppData();
        const cohort = (data.cohorts || []).find((c) => c && c.id === cohortId);
        const parsed = ri.parseRosterPasteSingle(textarea.value, {
            fallbackCohortName: cohort ? cohort.name : getClassData().name || 'Class'
        });
        if (parsed.error) {
            if (errEl) {
                errEl.textContent =
                    parsed.error === 'emptyPaste'
                        ? t('speakingTestPasteEmpty')
                        : parsed.error === 'noStudents'
                          ? t('speakingTestPasteEmpty')
                          : parsed.error;
                errEl.hidden = false;
            }
            return;
        }
        const students = (parsed.cohort && parsed.cohort.students) || [];
        if (!students.length) {
            if (errEl) {
                errEl.textContent = t('speakingTestPasteEmpty');
                errEl.hidden = false;
            }
            return;
        }
        parsedPastePlan = {
            importKey: ri.importCohortKey({ cohortName: parsed.cohort.cohortName }),
            importCohortName: parsed.cohort.cohortName,
            importCohortId: null,
            studentCount: students.length,
            students: students.slice(),
            matchStatus: 'exact',
            suggestedTargetId: cohortId,
            candidateTargetIds: [cohortId],
            userAction: 'map',
            userTargetId: cohortId,
            mergeMode: 'merge',
            mergeByName: true
        };
        if (countEl) {
            countEl.textContent = String(parsedPastePlan.students.length);
        }
        if (listEl) {
            listEl.innerHTML = parsedPastePlan.students
                .map((s, i) => {
                    const en = s.nameEn ? ` (${s.nameEn})` : '';
                    return `<li>${escapeHtml(String(i + 1))}. ${escapeHtml(s.name || '')}${escapeHtml(en)}</li>`;
                })
                .join('');
        }
        if (preview) {
            preview.hidden = false;
        }
        if (importBtn) {
            importBtn.disabled = !canEdit();
        }
    }

    function openImportConfirm(panel) {
        if (!parsedPastePlan) {
            return;
        }
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        const modal = mount && mount.querySelector('#speakingTestImportConfirmModal');
        const countEl = mount && mount.querySelector('#speakingTestImportConfirmCount');
        if (countEl) {
            countEl.textContent = String(parsedPastePlan.students.length);
        }
        setModalOpen(modal, true);
    }

    async function confirmPasteImport(panel, mode) {
        const ri = global.CCPRosterImport;
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        const modal = mount && mount.querySelector('#speakingTestImportConfirmModal');
        if (!ri || !parsedPastePlan || !canEdit()) {
            setModalOpen(modal, false);
            return;
        }
        const data = getAppData();
        const planRow = Object.assign({}, parsedPastePlan, {
            userAction: 'map',
            userTargetId: parsedPastePlan.userTargetId,
            mergeMode: mode === 'replace' ? 'replace' : 'merge',
            mergeByName: true
        });
        const result = ri.applyRosterImport(data.cohorts, [planRow], {
            newId: () => {
                const d = domain();
                return d ? d.newId('cohort') : `cohort_${Date.now()}`;
            },
            newStudentId: () => {
                const d = domain();
                return d ? d.newId('stu') : `stu_${Date.now()}`;
            },
            homeroomTeacherUserId: hooks.getCurrentUserId ? hooks.getCurrentUserId() : ''
        });
        if (result.error) {
            if (hooks && hooks.showToast) {
                hooks.showToast(result.error, true);
            }
            setModalOpen(modal, false);
            return;
        }
        try {
            await hooks.saveClassroom({ cohorts: result.cohorts });
            data.cohorts = result.cohorts;
            if (hooks && hooks.showToast) {
                hooks.showToast(t('speakingTestPasteImportDone'), false);
            }
        } catch (err) {
            console.error('Speaking test roster import failed', err);
            if (hooks && hooks.showToast) {
                hooks.showToast(t('speakingTestPasteImportFailed'), true);
            }
        }
        setModalOpen(modal, false);
        parsedPastePlan = null;
        renderTable(panel);
    }

    function addAssignment(panel) {
        if (!draftRecord || !canEdit()) {
            return;
        }
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        const titleInput = mount.querySelector('#speakingTestAssignmentTitle');
        const dateInput = mount.querySelector('#speakingTestAssignmentDate');
        const title = titleInput ? titleInput.value.trim() : '';
        const date = dateInput ? dateInput.value : '';
        if (!title || !date) {
            return;
        }
        const d = domain();
        draftRecord.assignments.push({
            id: d.newId('spa'),
            title,
            date
        });
        draftRecord.assignments.sort((a, b) => String(b.date).localeCompare(String(a.date)));
        if (titleInput) {
            titleInput.value = '';
        }
        if (dateInput) {
            dateInput.value = d.todayISO();
        }
        scheduleSave();
        renderTable(panel);
    }

    function deleteAssignment(panel, assignmentId) {
        if (!draftRecord || !canEdit()) {
            return;
        }
        draftRecord.assignments = draftRecord.assignments.filter((a) => a.id !== assignmentId);
        Object.keys(draftRecord.scores || {}).forEach((sid) => {
            if (draftRecord.scores[sid] && draftRecord.scores[sid][assignmentId]) {
                delete draftRecord.scores[sid][assignmentId];
            }
        });
        scheduleSave();
        renderTable(panel);
    }

    function handleTableClick(event, panel) {
        const button = event.target.closest('button');
        if (!button) {
            return;
        }
        const action = button.dataset.action;
        const assignmentId = button.dataset.assignmentId;
        const studentId = button.dataset.studentId;
        switch (action) {
            case 'delete-assignment':
                deleteAssignment(panel, assignmentId);
                break;
            case 'open-scorer':
                openScorer(panel, studentId, assignmentId);
                break;
            case 'report-student':
                reportStudent(studentId);
                break;
            default:
                break;
        }
    }

    function reportStudent(studentId) {
        const c = core();
        if (!c || !draftRecord) {
            return;
        }
        const student = getSortedRoster().find((s) => s.id === studentId);
        if (!student) {
            return;
        }
        c.printStudentReport(
            student,
            draftRecord.assignments || [],
            (draftRecord.scores && draftRecord.scores[studentId]) || {}
        );
    }

    function openScorer(panel, studentId, assignmentId) {
        if (!draftRecord) {
            return;
        }
        const c = core();
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        const scorerModal = mount && mount.querySelector('#speakingTestScorerModal');
        const student = getSortedRoster().find((s) => s.id === studentId);
        const assignment = (draftRecord.assignments || []).find((a) => a.id === assignmentId);
        if (!c || !student || !assignment || !scorerModal) {
            return;
        }
        editingStudentId = studentId;
        editingAssignmentId = assignmentId;
        const title = mount.querySelector('#speakingTestScorerTitle');
        const assignmentEl = mount.querySelector('#speakingTestScorerAssignment');
        const questions = mount.querySelector('#speakingTestScorerQuestions');
        const existing =
            (draftRecord.scores[studentId] && draftRecord.scores[studentId][assignmentId]) || [];
        if (title) {
            title.textContent = t('speakingTestScorerHeading').replace('{name}', student.name);
        }
        if (assignmentEl) {
            assignmentEl.textContent = `${assignment.title} · ${assignment.date}`;
        }
        const editable = canEdit();
        if (questions) {
            let html = '';
            for (let i = 0; i < c.QUESTION_COUNT; i += 1) {
                const score = existing[i]
                    ? Object.assign(c.createDefaultScoreBreakdown(), existing[i])
                    : c.createDefaultScoreBreakdown();
                const noteVal = score.note || '';
                html += `<section class="speaking-test-question-block" data-q="${i}">
                  <div class="speaking-test-question-label">Q${i + 1}</div>
                  <div class="speaking-test-question-fields">`;
                c.RUBRIC_CATEGORIES.forEach((cat) => {
                    const current = String(score[cat.key] || 'A').toUpperCase();
                    html += `<div class="speaking-test-grade-row" data-category="${cat.key}">
                      <span class="speaking-test-grade-label">${escapeHtml(cat.label)} (${cat.max})</span>
                      <div class="speaking-test-grade-segments" role="radiogroup" aria-label="${escapeAttr(cat.label)}">
                        ${c.GRADE_OPTIONS.map((g) => {
                            const active = current === g;
                            return `<button type="button" class="btn btn-outline btn-compact speaking-test-grade-btn${active ? ' is-active' : ''}" role="radio" aria-checked="${active ? 'true' : 'false'}" data-grade="${g}" ${editable ? '' : 'disabled'}>${g}</button>`;
                        }).join('')}
                      </div>
                    </div>`;
                });
                html += `<label class="form-group speaking-test-question-note">
                      <span>${escapeHtml(t('speakingTestQuestionNote'))}</span>
                      <textarea class="field-input field-control speaking-test-note-input" rows="2" data-i18n-placeholder="speakingTestQuestionNotePlaceholder" placeholder="${escapeAttr(t('speakingTestQuestionNotePlaceholder'))}" ${editable ? '' : 'disabled'}>${escapeHtml(noteVal)}</textarea>
                    </label>`;
                html += `</div>
                  <div class="speaking-test-question-total">
                    <span class="section-hint">${escapeHtml(t('speakingTestQTotal'))}</span>
                    <strong class="question-total">0.0</strong>
                  </div>
                </section>`;
            }
            questions.innerHTML = html;
        }
        setModalOpen(scorerModal, true);
        updateScorerTotals(panel);
        syncScorerNav(panel);
        highlightActiveCell(panel);
    }

    function getScorerScores(panel) {
        const c = core();
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        const blocks = mount
            ? mount.querySelectorAll('#speakingTestScorerQuestions .speaking-test-question-block')
            : [];
        const scores = [];
        blocks.forEach((block) => {
            const score = {};
            c.RUBRIC_CATEGORIES.forEach((cat) => {
                const row = block.querySelector(`.speaking-test-grade-row[data-category="${cat.key}"]`);
                const active = row && row.querySelector('.speaking-test-grade-btn.is-active');
                score[cat.key] = active ? active.getAttribute('data-grade') || 'A' : 'A';
            });
            const noteEl = block.querySelector('.speaking-test-note-input');
            score.note = noteEl ? String(noteEl.value || '') : '';
            scores.push(score);
        });
        return scores;
    }

    function updateScorerTotals(panel) {
        const c = core();
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        if (!c || !mount) {
            return;
        }
        const scores = getScorerScores(panel);
        const blocks = mount.querySelectorAll(
            '#speakingTestScorerQuestions .speaking-test-question-block'
        );
        blocks.forEach((block, index) => {
            const totalEl = block.querySelector('.question-total');
            if (totalEl) {
                totalEl.textContent = c.calculateQuestionTotal(scores[index]).toFixed(1);
            }
        });
        const { averages, totalSum } = c.calculateCategoryAverages(scores);
        const summary = mount.querySelector('#speakingTestScorerSummaryAverages');
        if (summary) {
            summary.innerHTML = c.RUBRIC_CATEGORIES.map(
                (cat) =>
                    `<p>${escapeHtml(cat.label)}: <strong>${averages[cat.key].toFixed(1)}</strong> / ${cat.max}</p>`
            ).join('');
        }
        const totalEl = mount.querySelector('#speakingTestScorerSummaryTotal');
        if (totalEl) {
            totalEl.textContent = `${t('speakingTestTotalAverage')}: ${totalSum.toFixed(1)} / 10`;
        }
        const headerAvg = mount.querySelector('#speakingTestScorerAverage');
        if (headerAvg) {
            headerAvg.textContent = `${t('speakingTestAverageScore')}: ${totalSum.toFixed(1)} / 10`;
        }
    }

    function applyScorerScoresLive(panel) {
        if (!draftRecord || !editingStudentId || !editingAssignmentId || !canEdit()) {
            updateScorerTotals(panel);
            return;
        }
        const scores = getScorerScores(panel);
        if (!draftRecord.scores[editingStudentId]) {
            draftRecord.scores[editingStudentId] = {};
        }
        draftRecord.scores[editingStudentId][editingAssignmentId] = scores;
        updateScorerTotals(panel);
        scheduleSave();
        updateActiveCellSummary(panel);
    }

    function escapeAttrSelector(value) {
        const s = String(value == null ? '' : value);
        if (typeof CSS !== 'undefined' && CSS.escape) {
            return CSS.escape(s);
        }
        return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function findScoreCell(mount, studentId, assignmentId) {
        if (!mount) {
            return null;
        }
        return mount.querySelector(
            `.speaking-test-score-cell[data-student-id="${escapeAttrSelector(studentId)}"][data-assignment-id="${escapeAttrSelector(assignmentId)}"]`
        );
    }

    function updateActiveCellSummary(panel) {
        const c = core();
        if (!c || !editingStudentId || !editingAssignmentId) {
            return;
        }
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        const btn = findScoreCell(mount, editingStudentId, editingAssignmentId);
        if (!btn) {
            return;
        }
        const scores =
            draftRecord.scores[editingStudentId] &&
            draftRecord.scores[editingStudentId][editingAssignmentId];
        const { totalSum } = c.calculateCategoryAverages(scores);
        const hasScores = !!(scores && scores.length);
        btn.innerHTML = `<span class="speaking-test-score-total-main">${hasScores ? totalSum.toFixed(1) : '—'} <span class="speaking-test-score-max">/ 10</span></span>
          <span class="section-hint speaking-test-score-cell-hint">${escapeHtml(hasScores ? t('speakingTestTapToEdit') : t('speakingTestTapToScore'))}</span>`;
        btn.title = c.generateScoreTooltip(scores);
        btn.classList.add('is-active');
    }

    function highlightActiveCell(panel) {
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        if (!mount) {
            return;
        }
        mount.querySelectorAll('.speaking-test-score-cell.is-active').forEach((el) => {
            el.classList.remove('is-active');
        });
        mount.querySelectorAll('tr.is-scoring').forEach((el) => {
            el.classList.remove('is-scoring');
        });
        if (!editingStudentId || !editingAssignmentId) {
            return;
        }
        const btn = findScoreCell(mount, editingStudentId, editingAssignmentId);
        if (btn) {
            btn.classList.add('is-active');
            const row = btn.closest('tr');
            if (row) {
                row.classList.add('is-scoring');
            }
        }
    }

    function syncScorerNav(panel) {
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        const prevBtn = mount && mount.querySelector('#speakingTestScorerPrevBtn');
        const nextBtn = mount && mount.querySelector('#speakingTestScorerNextBtn');
        const students = getSortedRoster();
        const idx = students.findIndex((s) => s.id === editingStudentId);
        if (prevBtn) {
            prevBtn.disabled = idx <= 0;
        }
        if (nextBtn) {
            nextBtn.disabled = idx < 0 || idx >= students.length - 1;
        }
    }

    function stepScorerStudent(panel, delta) {
        const students = getSortedRoster();
        const idx = students.findIndex((s) => s.id === editingStudentId);
        const next = students[idx + delta];
        if (!next || !editingAssignmentId) {
            return;
        }
        openScorer(panel, next.id, editingAssignmentId);
    }

    function closeScorer(panel) {
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        const scorerModal = mount && mount.querySelector('#speakingTestScorerModal');
        if (scorerModal) {
            setModalOpen(scorerModal, false);
        }
        if (mount) {
            const questions = mount.querySelector('#speakingTestScorerQuestions');
            if (questions) {
                questions.innerHTML = '';
            }
        }
        editingStudentId = null;
        editingAssignmentId = null;
        highlightActiveCell(panel);
    }

    function renderRosterList(panel) {
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        const list = mount && mount.querySelector('#speakingTestRosterList');
        if (!list) {
            return;
        }
        const students = getSortedRoster();
        if (!students.length) {
            list.innerHTML = `<li class="section-hint">${escapeHtml(t('speakingTestRosterEmpty'))}</li>`;
            return;
        }
        list.innerHTML = students
            .map((s) => {
                const active = s.id === editingStudentId ? ' is-active' : '';
                return `<li class="speaking-test-roster-item${active}">${escapeHtml(s.name)}</li>`;
            })
            .join('');
    }

    function renderTable(panel) {
        const mount = panel.querySelector('#classroomSpeakingTestMount');
        if (!mount || !draftRecord) {
            return;
        }
        const c = core();
        const empty = mount.querySelector('#speakingTestEmptyState');
        const scroll = mount.querySelector('#speakingTestSheetScroll');
        const sortSelect = mount.querySelector('#speakingTestSortMode');
        const dateInput = mount.querySelector('#speakingTestAssignmentDate');
        const printBlank = panel.querySelector('#speakingTestPrintBlankBtn');
        const printAll = panel.querySelector('#speakingTestPrintAllBtn');
        const editable = canEdit();

        if (sortSelect) {
            sortSelect.value = draftRecord.settings.studentSortMode || 'alphabetical';
            sortSelect.disabled = !editable;
        }
        if (dateInput && !dateInput.value && domain()) {
            dateInput.value = domain().todayISO();
        }

        renderRosterList(panel);

        const students = getSortedRoster();
        const assignments = draftRecord.assignments || [];

        if (printBlank) {
            printBlank.disabled = !students.length;
        }
        if (printAll) {
            printAll.disabled = !students.length || !assignments.length;
        }

        if (!classId) {
            if (empty) {
                empty.hidden = false;
                empty.textContent = t('speakingTestSelectClass');
            }
            if (scroll) {
                scroll.hidden = true;
            }
            closeScorer(panel);
            return;
        }

        if (!students.length) {
            if (empty) {
                empty.hidden = false;
                empty.textContent = t('speakingTestRosterEmpty');
            }
            if (scroll) {
                scroll.hidden = true;
            }
            closeScorer(panel);
            return;
        }

        if (!assignments.length) {
            if (empty) {
                empty.hidden = false;
                empty.textContent = t('speakingTestAddAssignmentHint');
            }
            if (scroll) {
                scroll.hidden = true;
            }
            closeScorer(panel);
            return;
        }

        if (empty) {
            empty.hidden = true;
        }
        if (scroll) {
            scroll.hidden = false;
        }

        const headerRow = mount.querySelector('#speakingTestHeaderRow');
        const body = mount.querySelector('#speakingTestBody');
        if (!headerRow || !body || !c) {
            return;
        }

        let headerHtml = `<th scope="col" class="speaking-test-sticky-col classroom-sheet-col-student">${escapeHtml(t('speakingTestColStudent'))}</th>`;
        assignments.forEach((a) => {
            headerHtml += `<th scope="col">
              <div class="speaking-test-assignment-head">
                <div>
                  <span>${escapeHtml(a.title)}</span>
                  <span class="section-hint">${escapeHtml(a.date)}</span>
                </div>
                ${
                    editable
                        ? `<button type="button" class="btn btn-outline btn-compact" data-action="delete-assignment" data-assignment-id="${escapeHtml(a.id)}" aria-label="${escapeHtml(t('speakingTestDeleteAssignment'))}">×</button>`
                        : ''
                }
              </div>
            </th>`;
        });
        headerHtml += `<th scope="col">${escapeHtml(t('speakingTestColActions'))}</th>`;
        headerRow.innerHTML = headerHtml;

        body.innerHTML = '';
        students.forEach((student) => {
            const tr = document.createElement('tr');
            if (student.id === editingStudentId) {
                tr.classList.add('is-scoring');
            }
            let rowHtml = `<td class="speaking-test-sticky-col classroom-sheet-col-student"><strong>${escapeHtml(student.name)}</strong></td>`;
            assignments.forEach((assignment) => {
                const scores =
                    draftRecord.scores[student.id] && draftRecord.scores[student.id][assignment.id];
                const { totalSum } = c.calculateCategoryAverages(scores);
                const tooltip = c.generateScoreTooltip(scores);
                const hasScores = !!(scores && scores.length);
                const isActive =
                    student.id === editingStudentId && assignment.id === editingAssignmentId;
                rowHtml += `<td>
                  <button type="button" class="speaking-test-score-cell btn btn-outline${isActive ? ' is-active' : ''}"
                    data-action="open-scorer"
                    data-student-id="${escapeHtml(student.id)}"
                    data-assignment-id="${escapeHtml(assignment.id)}"
                    title="${escapeHtml(tooltip)}">
                    <span class="speaking-test-score-total-main">${hasScores ? totalSum.toFixed(1) : '—'} <span class="speaking-test-score-max">/ 10</span></span>
                    <span class="section-hint speaking-test-score-cell-hint">${escapeHtml(hasScores ? t('speakingTestTapToEdit') : t('speakingTestTapToScore'))}</span>
                  </button>
                </td>`;
            });
            rowHtml += `<td>
              <button type="button" class="btn btn-primary btn-compact" data-action="report-student" data-student-id="${escapeHtml(student.id)}">${escapeHtml(t('speakingTestReport'))}</button>
            </td>`;
            tr.innerHTML = rowHtml;
            body.appendChild(tr);
        });

        const form = mount.querySelector('#speakingTestAddAssignmentForm');
        if (form) {
            form.querySelectorAll('input, button').forEach((el) => {
                el.disabled = !editable;
            });
        }
        const pasteImportBtn = mount.querySelector('#speakingTestPasteImportBtn');
        if (pasteImportBtn && !parsedPastePlan) {
            pasteImportBtn.disabled = true;
        }
        const saveBtn = panel.querySelector('#speakingTestSaveBtn');
        if (saveBtn) {
            saveBtn.disabled = !editable;
        }

        if (editingStudentId && editingAssignmentId) {
            const stillExists = students.some((s) => s.id === editingStudentId);
            const assignmentExists = assignments.some((a) => a.id === editingAssignmentId);
            const scorerModal = mount.querySelector('#speakingTestScorerModal');
            if (stillExists && assignmentExists && scorerModal && scorerModal.classList.contains('active')) {
                highlightActiveCell(panel);
                syncScorerNav(panel);
                renderRosterList(panel);
            } else if (!stillExists || !assignmentExists) {
                closeScorer(panel);
            }
        }
    }

    async function render(panel) {
        panelRef = panel;
        bindToolbar(panel);
        ensureAutosave(panel);
        if (!classId) {
            const mount = panel.querySelector('#classroomSpeakingTestMount');
            if (mount) {
                mount.innerHTML = `<p class="section-hint">${escapeHtml(t('speakingTestSelectClass'))}</p>`;
            }
            mountReady = false;
            draftRecord = null;
            updateLocalImportBanner(panel);
            return;
        }
        const mounted = await ensureMount(panel);
        if (!mounted) {
            return;
        }
        ensureDraftRecord();
        renderTable(panel);
        updateLocalImportBanner(panel);
    }

    function syncActiveContext(options) {
        options = options || {};
        const data = getAppData();
        const visible = global.CCPClassroomZoneContext
            ? global.CCPClassroomZoneContext.getVisibleClasses()
            : data.classes || [];
        if (typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.resolveActiveClassId) {
            classId = global.CCPActiveContext.resolveActiveClassId(data, {
                classId: options.classId,
                visibleClasses: visible
            });
        } else {
            classId =
                options.classId ||
                (data.ui && data.ui.classroomTabClassId) ||
                (visible[0] && visible[0].id) ||
                '';
        }
    }

    function subscribeContext() {
        if (contextSubscribed || typeof global.CCPActiveContext === 'undefined') {
            return;
        }
        contextSubscribed = true;
        global.CCPActiveContext.subscribe((detail) => {
            const prevClass = classId;
            if (detail && detail.classId !== undefined) {
                classId = detail.classId || '';
            } else {
                syncActiveContext();
            }
            if (prevClass !== classId) {
                void flushBeforeLeave().then(() => {
                    mountReady = false;
                    draftRecord = null;
                    editingStudentId = null;
                    editingAssignmentId = null;
                    if (panelRef) {
                        void render(panelRef);
                    }
                });
            }
        });
    }

    async function initTab(h, options) {
        hooks = h;
        options = options || {};
        const panel = document.getElementById('panel-speaking-test');
        if (!panel) {
            return;
        }
        subscribeContext();
        syncActiveContext(options);
        await render(panel);
    }

    async function refreshIfActive() {
        const panel = document.getElementById('panel-speaking-test');
        if (!panel || panel.hidden || !hooks) {
            return;
        }
        ensureDraftRecord();
        if (mountReady) {
            renderTable(panel);
            updateLocalImportBanner(panel);
        } else {
            await render(panel);
        }
    }

    global.CCPClassroomSpeakingTest = {
        initTab,
        render,
        flushBeforeLeave,
        refreshIfActive
    };
})(typeof window !== 'undefined' ? window : globalThis);
