/**
 * Tools → Debate Scores — numeric rubric entry + filled score-sheet export.
 */
(function (global) {
    let hooks = null;
    let classId = '';
    let sessionDate = '';
    let panelRef = null;
    let autosave = null;
    let contextSubscribed = false;
    let draftSession = null;
    let applyingAssignment = false;
    let boundPanel = null;
    let draftEpoch = 0;
    let scoreNumpadEl = null;
    let scoreNumpadAnchor = null;
    let scoreNumpadDocBound = false;
    let suppressScoreNavUntil = 0;
    const SCORES_AUTOSAVE_DELAY_MS = 700;
    const SCORE_NAV_SUPPRESS_MS = 400;
    const TOOLBAR_COLLAPSE_STORAGE_KEY = 'ccp.debateScores.toolbarCollapsed';
    const TOOLBAR_NARROW_MQ = '(max-width: 1024px)';
    const TOOLBAR_LANDSCAPE_SHORT_MQ = '(orientation: landscape) and (max-height: 900px)';
    const SCORE_NUMPAD_KEYS = [
        { digit: '1' },
        { digit: '2' },
        { digit: '3' },
        { digit: '4' },
        { digit: '5' },
        { digit: '6' },
        { digit: '7' },
        { digit: '8' },
        { digit: '9' },
        { digit: '.', label: '.' },
        { digit: '0' },
        { action: 'backspace', label: '⌫' }
    ];
    let toolbarCollapseBound = false;
    let toolbarCollapsed = null;

    const CRITERION_I18N = {
        eyeContact: 'classroomDebateScoresCriterionEye',
        voice: 'classroomDebateScoresCriterionVoice',
        fluency: 'classroomDebateScoresCriterionFluency',
        content: 'classroomDebateScoresCriterionContent',
        logic: 'classroomDebateScoresCriterionLogic',
        confidence: 'classroomDebateScoresCriterionConfidence'
    };

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

    function getStudentsForSheet() {
        const d = domain();
        const students = getStudents();
        if (d && d.sortStudentsByDebateOrder) {
            return d.sortStudentsByDebateOrder(students, buildRoleMapFromTeams());
        }
        return students;
    }

    function unwrapStudentEntry(entry) {
        return entry && entry.student ? entry.student : entry;
    }

    function studentDisplayName(studentOrEntry) {
        const student = unwrapStudentEntry(studentOrEntry);
        if (!student) {
            return '';
        }
        const en = String(student.nameEn || '').trim();
        const ko = String(student.name || '').trim();
        return en || ko;
    }

    function canEdit() {
        if (hooks && hooks.isViewOnly && hooks.isViewOnly()) {
            return false;
        }
        // Local / no active team calendar: allow score entry for device testing.
        if (!hooks || typeof hooks.hasTeamSync !== 'function' || !hooks.hasTeamSync()) {
            return true;
        }
        const classData = getClassData();
        const a = access();
        if (a && classData && a.canEditClass && a.canEditClass(classData)) {
            return true;
        }
        if (a && a.canBypass && a.canBypass()) {
            return true;
        }
        return false;
    }

    function getDebateAssignmentMap() {
        const data = getAppData();
        if (!data.ui) {
            data.ui = {};
        }
        if (!data.ui.debateAssignmentByClassId || typeof data.ui.debateAssignmentByClassId !== 'object') {
            data.ui.debateAssignmentByClassId = {};
        }
        return data.ui.debateAssignmentByClassId;
    }

    function getScheduledLessonsForClass(classData) {
        if (!classData || !hooks || typeof hooks.getLessonDates !== 'function') {
            return [];
        }
        try {
            const schedule = hooks.getLessonDates(classData);
            return schedule && Array.isArray(schedule.lessons) ? schedule.lessons : [];
        } catch (err) {
            console.warn('Debate scores lesson dates failed', err);
            return [];
        }
    }

    function listAssignmentsForClass(classData) {
        const d = domain();
        if (!d || !classData || !d.listDebateTeamAssignmentsForClass) {
            return [];
        }
        return d.listDebateTeamAssignmentsForClass(classData, {
            scheduledLessons: getScheduledLessonsForClass(classData)
        });
    }

    function persistDebateAssignmentDate(cId, dateStr) {
        if (!cId || !dateStr) {
            return;
        }
        const map = getDebateAssignmentMap();
        map[cId] = dateStr;
        if (typeof global.saveUiStateToLocalStorage === 'function') {
            global.saveUiStateToLocalStorage();
        }
    }

    function pushSessionDateToContext(dateStr, source) {
        const next = String(dateStr || '').trim();
        if (!next) {
            return;
        }
        applyingAssignment = true;
        try {
            if (typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.set) {
                global.CCPActiveContext.set({ sessionDate: next }, { source: source || 'debate-scores-assignment' });
            } else if (hooks && hooks.setUiPref) {
                hooks.setUiPref('classroomTabDate', next);
            }
        } finally {
            applyingAssignment = false;
        }
    }

    function resolveDebateAssignmentDate(classData, preferredDate) {
        const d = domain();
        if (!d || !classData || !d.classUsesDebateTeamAssignments || !d.classUsesDebateTeamAssignments(classData)) {
            return preferredDate || '';
        }
        const assignments = listAssignmentsForClass(classData);
        if (!assignments.length) {
            return preferredDate || '';
        }
        const map = getDebateAssignmentMap();
        const saved = map[classData.id] || '';
        if (saved && assignments.some((a) => a.date === saved)) {
            return saved;
        }
        const preferred = String(preferredDate || '').trim();
        if (preferred && assignments.some((a) => a.date === preferred)) {
            return preferred;
        }
        return (
            d.pickDefaultDebateTeamDate(classData, preferred || d.todayISO(), {
                scheduledLessons: getScheduledLessonsForClass(classData)
            }) || assignments[assignments.length - 1].date
        );
    }

    function defaultSheetTemplate(classData) {
        if (global.CCPDebateTeamsV2 && global.CCPDebateTeamsV2.isPurpleDebateClass) {
            const book = getDebateBookChip();
            if (global.CCPDebateTeamsV2.isPurpleDebateClass(classData, book)) {
                return 'yeoul';
            }
        }
        const preset = String((classData && classData.levelPreset) || '').trim();
        const custom = String((classData && (classData.levelCustom || classData.level)) || '').trim();
        if (preset === 'Purple' || custom === 'Purple' || /purple|yeoul/i.test(custom)) {
            return 'yeoul';
        }
        return 'garam';
    }

    function getDebateBookChip() {
        const classData = getClassData();
        if (!classData || !global.CCPDebatePeriods || !global.CCPDebatePeriods.getBookForDate) {
            return '';
        }
        const book = global.CCPDebatePeriods.getBookForDate(classData, sessionDate);
        return book ? String(book).trim() : '';
    }

    function getHomeroomLabel() {
        const classData = getClassData();
        const data = getAppData();
        if (!classData) {
            return '';
        }
        if (global.CCPTeacherTimetable && global.CCPTeacherTimetable.resolveHomeroomLabel) {
            const cohortsById = {};
            (data.cohorts || []).forEach((c) => {
                if (c && c.id) {
                    cohortsById[c.id] = c;
                }
            });
            return global.CCPTeacherTimetable.resolveHomeroomLabel(classData, cohortsById, data) || '';
        }
        return '';
    }

    function buildRoleMapFromTeams() {
        const d = domain();
        const data = getAppData();
        if (!d || !d.buildDebateRoleMapFromTeamSession || !classId || !sessionDate) {
            return Object.create(null);
        }
        const teamSession = d.findDebateTeamSession(data.debateTeamSessions, classId, sessionDate);
        return d.buildDebateRoleMapFromTeamSession(teamSession, getStudents());
    }

    function readToolbarCollapsedPref() {
        try {
            if (typeof localStorage === 'undefined') {
                return null;
            }
            const raw = localStorage.getItem(TOOLBAR_COLLAPSE_STORAGE_KEY);
            if (raw === '1') {
                return true;
            }
            if (raw === '0') {
                return false;
            }
        } catch (err) {
            /* ignore storage errors */
        }
        return null;
    }

    function writeToolbarCollapsedPref(collapsed) {
        try {
            if (typeof localStorage === 'undefined') {
                return;
            }
            localStorage.setItem(TOOLBAR_COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0');
        } catch (err) {
            /* ignore storage errors */
        }
    }

    function prefersCompactChrome() {
        if (typeof window === 'undefined' || !window.matchMedia) {
            return false;
        }
        return (
            window.matchMedia(TOOLBAR_NARROW_MQ).matches ||
            window.matchMedia(TOOLBAR_LANDSCAPE_SHORT_MQ).matches
        );
    }

    function resolveToolbarCollapsed() {
        const pref = readToolbarCollapsedPref();
        if (pref != null) {
            return pref;
        }
        return prefersCompactChrome();
    }

    function syncChromeMetrics() {
        try {
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new Event('resize'));
            }
        } catch (err) {
            /* ignore */
        }
    }

    function updateChromeCompactClass(panel) {
        if (!panel) {
            return;
        }
        const collapsed = toolbarClassListHasCollapsed(panel);
        const compact = collapsed && prefersCompactChrome();
        panel.classList.toggle('classroom-debate-scores--chrome-compact', compact);
    }

    function templateLabelForSummary(templateId) {
        const d = domain();
        const tpl = d ? d.normalizeDebateSheetTemplate(templateId) : 'garam';
        if (tpl === 'yeoul') {
            return t('classroomDebateTemplateYeoul');
        }
        return t('classroomDebateTemplateGaram');
    }

    function updateToolbarSummary(panel) {
        const summary = panel && panel.querySelector('#classroomDebateScoresToolbarSummary');
        if (!summary) {
            return;
        }
        const collapsed = !!(
            panel.querySelector('.classroom-debate-scores-toolbar') &&
            panel
                .querySelector('.classroom-debate-scores-toolbar')
                .classList.contains('classroom-debate-scores-toolbar--collapsed')
        );
        summary.hidden = !collapsed;
        if (!collapsed) {
            summary.textContent = '';
            return;
        }
        const templateId =
            (draftSession && draftSession.sheetTemplate) ||
            (panel.querySelector('#classroomDebateScoresTemplate') &&
                panel.querySelector('#classroomDebateScoresTemplate').value) ||
            'garam';
        const templateName = templateLabelForSummary(templateId);
        const dateStr = String(sessionDate || '').trim();
        if (dateStr) {
            summary.textContent = t('classroomDebateScoresToolbarSummary')
                .replace('{date}', dateStr)
                .replace('{template}', templateName);
        } else {
            summary.textContent = t('classroomDebateScoresToolbarSummaryNoDate').replace(
                '{template}',
                templateName
            );
        }
    }

    function applyToolbarCollapsed(panel, collapsed) {
        if (!panel) {
            return;
        }
        const toolbar = panel.querySelector('.classroom-debate-scores-toolbar');
        const toggle = panel.querySelector('#classroomDebateScoresToolbarToggle');
        if (!toolbar || !toggle) {
            return;
        }
        toolbarCollapsed = !!collapsed;
        toolbar.classList.toggle('classroom-debate-scores-toolbar--collapsed', toolbarCollapsed);
        toggle.setAttribute('aria-expanded', toolbarCollapsed ? 'false' : 'true');
        toggle.textContent = t(
            toolbarCollapsed
                ? 'classroomDebateScoresToolbarExpand'
                : 'classroomDebateScoresToolbarCollapse'
        );
        updateToolbarSummary(panel);
        updateChromeCompactClass(panel);
        updateHint(panel);
        syncChromeMetrics();
    }

    function ensureToolbarCollapsedState(panel) {
        if (toolbarCollapsed == null) {
            toolbarCollapsed = resolveToolbarCollapsed();
        }
        applyToolbarCollapsed(panel, toolbarCollapsed);
    }

    function bindToolbarCollapse(panel) {
        const toggle = panel && panel.querySelector('#classroomDebateScoresToolbarToggle');
        if (!toggle || toggle.dataset.boundCollapse) {
            return;
        }
        toggle.dataset.boundCollapse = '1';
        toggle.addEventListener('click', () => {
            const next = !toolbarClassListHasCollapsed(panel);
            writeToolbarCollapsedPref(next);
            applyToolbarCollapsed(panel, next);
        });
        if (!toolbarCollapseBound && typeof window !== 'undefined' && window.matchMedia) {
            toolbarCollapseBound = true;
            const narrowMq = window.matchMedia(TOOLBAR_NARROW_MQ);
            const landscapeMq = window.matchMedia(TOOLBAR_LANDSCAPE_SHORT_MQ);
            const onChange = () => {
                if (readToolbarCollapsedPref() != null) {
                    const p = panelRef || document.getElementById('panel-debate-scores');
                    if (p) {
                        updateChromeCompactClass(p);
                        updateHint(p);
                        syncChromeMetrics();
                    }
                    return;
                }
                const p = panelRef || document.getElementById('panel-debate-scores');
                if (p) {
                    applyToolbarCollapsed(p, prefersCompactChrome());
                }
            };
            [narrowMq, landscapeMq].forEach((mq) => {
                if (typeof mq.addEventListener === 'function') {
                    mq.addEventListener('change', onChange);
                } else if (typeof mq.addListener === 'function') {
                    mq.addListener(onChange);
                }
            });
        }
    }

    function toolbarClassListHasCollapsed(panel) {
        const toolbar = panel && panel.querySelector('.classroom-debate-scores-toolbar');
        return !!(toolbar && toolbar.classList.contains('classroom-debate-scores-toolbar--collapsed'));
    }

    function ensureDraftSession() {
        const d = domain();
        if (!d || !classId || !sessionDate) {
            draftSession = null;
            return;
        }
        const data = getAppData();
        const existing = d.findDebateScoreSession(data.debateScores, classId, sessionDate);
        const classData = getClassData();
        const sameDraft =
            draftSession &&
            draftSession.classId === classId &&
            draftSession.date === sessionDate;
        const scoreSource = sameDraft ? draftSession : existing;
        const sheetTemplate =
            (scoreSource && scoreSource.sheetTemplate) ||
            (existing && existing.sheetTemplate) ||
            defaultSheetTemplate(classData);
        const roleMap = buildRoleMapFromTeams();
        const teamSession = d.findDebateTeamSession(data.debateTeamSessions, classId, sessionDate);
        const byId = Object.create(null);
        if (scoreSource && Array.isArray(scoreSource.records)) {
            scoreSource.records.forEach((r) => {
                if (r && r.studentId) {
                    byId[r.studentId] = r;
                }
            });
        }
        const records = getStudents().map((entry) => {
            const student = unwrapStudentEntry(entry);
            const sid = student && student.id ? String(student.id) : '';
            const prev = byId[sid] || {};
            const fromTeams = Object.prototype.hasOwnProperty.call(roleMap, sid);
            const role = fromTeams ? roleMap[sid] : {};
            const scores = Object.assign(d.emptyDebateScoresObject(), prev.scores || {});
            return d.normalizeDebateScoreRecord(
                {
                    studentId: sid,
                    roleAbbr: fromTeams ? role.roleAbbr || '' : prev.roleAbbr || '',
                    roleName: fromTeams ? role.roleName || '' : prev.roleName || '',
                    debateNumber: fromTeams
                        ? role.debateNumber != null
                            ? role.debateNumber
                            : null
                        : prev.debateNumber != null
                          ? prev.debateNumber
                          : null,
                    bench: fromTeams ? role.bench || '' : prev.bench || '',
                    scores,
                    note: prev.note || ''
                },
                sheetTemplate
            );
        });
        draftSession = {
            id:
                (sameDraft && draftSession.id) ||
                (existing && existing.id) ||
                d.newId('dbs'),
            classId,
            date: sessionDate,
            sheetTemplate: d.normalizeDebateSheetTemplate(sheetTemplate),
            sessionId: teamSession && teamSession.id ? teamSession.id : null,
            records: records.filter(Boolean),
            authorUserId: hooks && hooks.getCurrentUserId ? hooks.getCurrentUserId() : '',
            updatedAt: new Date().toISOString()
        };
    }

    function ensureAutosave(panel) {
        if (autosave || !global.CCPClassroomAutosave) {
            return;
        }
        autosave = global.CCPClassroomAutosave.create({
            delayMs: SCORES_AUTOSAVE_DELAY_MS,
            debounce: hooks && hooks.debounce ? hooks.debounce : null,
            t,
            getStatusEl: () => (panelRef || panel).querySelector('#classroomDebateScoresSaveStatus'),
            saveAsync: (opts) => persistScores(panelRef || panel, opts)
        });
    }

    function scheduleSave() {
        ensureAutosave(panelRef);
        if (autosave) {
            autosave.scheduleSave();
        }
    }

    async function flushBeforeLeave() {
        ensureAutosave(panelRef || document.getElementById('panel-debate-scores'));
        if (autosave) {
            await autosave.flushBeforeLeave();
        }
    }

    async function persistScores(panel, options) {
        const opt = options || {};
        if (!canEdit() || !draftSession || !hooks || !hooks.saveClassroom) {
            return;
        }
        const d = domain();
        if (!d) {
            return;
        }
        const saveBtn = panel && panel.querySelector('#classroomDebateScoresSaveBtn');
        if (saveBtn) {
            saveBtn.disabled = true;
        }
        const epochAtStart = draftEpoch;
        draftSession.updatedAt = new Date().toISOString();
        draftSession.authorUserId = hooks.getCurrentUserId ? hooks.getCurrentUserId() : '';
        const data = getAppData();
        // Snapshot current draft at save start (do not rebuild draft from appData after).
        const next = d.upsertDebateScoreSession(data.debateScores, draftSession);
        try {
            await hooks.saveClassroom({ debateScores: next });
            if (!opt.silent) {
                hooks.showToast(t('saved'));
            }
            // Edits during the await must not be wiped — schedule another save instead.
            if (draftEpoch !== epochAtStart) {
                scheduleSave();
            }
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
            throw err;
        } finally {
            if (saveBtn) {
                saveBtn.disabled = !canEdit();
            }
        }
    }

    function syncAssignmentPicker(panel) {
        const wrap = panel && panel.querySelector('#classroomDebateScoresAssignmentWrap');
        const select = panel && panel.querySelector('#classroomDebateScoresAssignmentSelect');
        const emptyEl = panel && panel.querySelector('#classroomDebateScoresAssignmentEmpty');
        if (!wrap || !select) {
            return;
        }
        const d = domain();
        const classData = getClassData();
        const isDebate =
            !!(d && classData && d.classUsesDebateTeamAssignments && d.classUsesDebateTeamAssignments(classData));
        if (!isDebate) {
            wrap.hidden = true;
            if (emptyEl) {
                emptyEl.hidden = true;
            }
            return;
        }
        const assignments = listAssignmentsForClass(classData);
        if (!assignments.length) {
            wrap.hidden = true;
            if (emptyEl) {
                emptyEl.hidden = false;
                emptyEl.textContent = t('classroomDebateAssignmentEmpty');
            }
            return;
        }
        if (emptyEl) {
            emptyEl.hidden = true;
        }
        wrap.hidden = false;
        const current = sessionDate;
        select.innerHTML = assignments
            .map((a) => {
                const selected = a.date === current ? ' selected' : '';
                return `<option value="${escapeHtml(a.date)}"${selected}>${escapeHtml(a.assignmentLabel)}</option>`;
            })
            .join('');
        if (current && !assignments.some((a) => a.date === current)) {
            select.value = assignments[0].date;
        } else {
            select.value = current;
        }
    }

    function onAssignmentSelectChange(e) {
        const nextDate = e && e.target ? String(e.target.value || '').trim() : '';
        if (!nextDate || nextDate === sessionDate) {
            return;
        }
        void flushBeforeLeave().then(() => {
            sessionDate = nextDate;
            persistDebateAssignmentDate(classId, nextDate);
            pushSessionDateToContext(nextDate, 'debate-scores-assignment-select');
            ensureDraftSession();
            if (panelRef) {
                render(panelRef);
            }
        });
    }

    function updateBookChip(panel) {
        const el = panel && panel.querySelector('#classroomDebateScoresBookChip');
        if (!el) {
            return;
        }
        const book = getDebateBookChip();
        if (book) {
            el.textContent = book;
            el.hidden = false;
        } else {
            el.textContent = '';
            el.hidden = true;
        }
    }

    function bumpDraftEpoch() {
        draftEpoch += 1;
    }

    function setRecordScore(studentId, criterion, value) {
        if (!draftSession || !Array.isArray(draftSession.records)) {
            return;
        }
        const d = domain();
        const rec = draftSession.records.find((r) => r.studentId === studentId);
        if (!rec) {
            return;
        }
        if (!rec.scores) {
            rec.scores = d.emptyDebateScoresObject();
        }
        rec.scores[criterion] = d.normalizeDebateScoreValue(value);
        rec.total = d.computeDebateScoreTotal(rec.scores, draftSession.sheetTemplate);
        bumpDraftEpoch();
    }

    function setRecordNote(studentId, note) {
        if (!draftSession || !Array.isArray(draftSession.records)) {
            return;
        }
        const rec = draftSession.records.find((r) => r.studentId === studentId);
        if (!rec) {
            return;
        }
        rec.note = String(note || '');
        bumpDraftEpoch();
    }

    function prefersScoreNumpad() {
        try {
            return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        } catch (err) {
            return false;
        }
    }

    function formatScoreDisplay(value) {
        if (value == null || value === '') {
            return '';
        }
        const n = Number(value);
        if (!Number.isFinite(n)) {
            return '';
        }
        return String(n);
    }

    function parseScoreInputValue(input, opts) {
        const allowClear = !!(opts && opts.allowClear);
        if (!input) {
            return { skip: true };
        }
        const raw = String(input.value || '').trim();
        if (raw === '') {
            if (allowClear) {
                return { value: null };
            }
            return { skip: true };
        }
        // Still typing a decimal (e.g. "3.") — do not commit or rewrite the field.
        if (raw.endsWith('.')) {
            return { skip: true };
        }
        const n = Number(raw);
        if (!Number.isFinite(n)) {
            if (allowClear) {
                return { value: null };
            }
            return { skip: true };
        }
        return { value: n };
    }

    function updateRowTotalDisplay(rowsMount, studentId) {
        if (!rowsMount || !studentId || !draftSession) {
            return;
        }
        const row = rowsMount.querySelector(`tr[data-student-id="${studentId}"]`);
        const totalEl = row && row.querySelector('.classroom-debate-score-total');
        const rec = (draftSession.records || []).find((r) => r.studentId === studentId);
        if (totalEl) {
            totalEl.textContent = rec && rec.total != null ? String(rec.total) : '';
        }
    }

    function applyScoreFromInput(input, opts) {
        if (!input || input.disabled) {
            return false;
        }
        const parsed = parseScoreInputValue(input, opts);
        if (parsed.skip) {
            return false;
        }
        const sid = input.getAttribute('data-student-id');
        const criterion = input.getAttribute('data-criterion');
        if (!sid || !criterion) {
            return false;
        }
        const d = domain();
        const normalized = d ? d.normalizeDebateScoreValue(parsed.value) : parsed.value;
        setRecordScore(sid, criterion, parsed.value);
        // Snap display only on commit/clear (Done, change, Clear) — not mid-keystroke.
        if (opts && opts.allowClear) {
            input.value = formatScoreDisplay(normalized);
        }
        const rowsMount = input.closest('tbody') || (panelRef && panelRef.querySelector('#classroomDebateScoresRows'));
        updateRowTotalDisplay(rowsMount, sid);
        scheduleSave();
        return true;
    }

    function closeScoreNumpad() {
        if (scoreNumpadEl) {
            scoreNumpadEl.hidden = true;
        }
        scoreNumpadAnchor = null;
    }

    function getVisibleViewportRect() {
        const margin = 8;
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        if (vv && typeof vv.width === 'number' && vv.width > 0) {
            return {
                left: (vv.offsetLeft || 0) + margin,
                top: (vv.offsetTop || 0) + margin,
                right: (vv.offsetLeft || 0) + vv.width - margin,
                bottom: (vv.offsetTop || 0) + vv.height - margin,
                width: Math.max(0, vv.width - margin * 2),
                height: Math.max(0, vv.height - margin * 2)
            };
        }
        const w = window.innerWidth || document.documentElement.clientWidth || 0;
        const h = window.innerHeight || document.documentElement.clientHeight || 0;
        return {
            left: margin,
            top: margin,
            right: w - margin,
            bottom: h - margin,
            width: Math.max(0, w - margin * 2),
            height: Math.max(0, h - margin * 2)
        };
    }

    function repositionOpenScoreNumpad() {
        if (scoreNumpadAnchor && scoreNumpadEl && !scoreNumpadEl.hidden) {
            positionScoreNumpad(scoreNumpadAnchor);
        }
    }

    function positionScoreNumpad(anchor) {
        if (!scoreNumpadEl || !anchor) {
            return;
        }
        const gap = 6;
        scoreNumpadEl.hidden = false;
        // Cap height to the visible area so keys stay reachable (scroll inside if needed).
        const view = getVisibleViewportRect();
        scoreNumpadEl.style.maxHeight = `${Math.max(120, Math.floor(view.height))}px`;
        const popW = scoreNumpadEl.offsetWidth || 240;
        const popH = scoreNumpadEl.offsetHeight || 200;
        const rect = anchor.getBoundingClientRect();

        // Horizontal: prefer align to cell left; shift only as needed; keep overlap with cell.
        let left = rect.left;
        const maxLeft = view.right - popW;
        if (left > maxLeft) {
            left = maxLeft;
        }
        if (left < view.left) {
            left = view.left;
        }
        // If still wider than view, pin to view.left (overflow:auto on pad handles the rest).
        if (popW > view.width) {
            left = view.left;
        } else {
            // Prefer keeping the pad overlapping the anchor horizontally.
            const padRight = left + popW;
            if (padRight < rect.left) {
                left = Math.min(rect.left, maxLeft);
            } else if (left > rect.right) {
                left = Math.max(view.left, Math.min(rect.right - popW, maxLeft));
            }
        }

        const spaceBelow = view.bottom - (rect.bottom + gap);
        const spaceAbove = rect.top - gap - view.top;
        let top;
        if (spaceBelow >= popH) {
            top = rect.bottom + gap;
        } else if (spaceAbove >= popH) {
            top = rect.top - gap - popH;
        } else if (spaceBelow >= spaceAbove) {
            top = rect.bottom + gap;
            top = Math.min(top, view.bottom - Math.min(popH, view.height));
            top = Math.max(view.top, top);
        } else {
            top = rect.top - gap - popH;
            top = Math.max(view.top, top);
            top = Math.min(top, view.bottom - Math.min(popH, view.height));
        }

        scoreNumpadEl.style.left = `${Math.round(left)}px`;
        scoreNumpadEl.style.top = `${Math.round(top)}px`;
    }

    function isScoreNavSuppressed() {
        return Date.now() < suppressScoreNavUntil;
    }

    function armScoreNavSuppress() {
        suppressScoreNavUntil = Date.now() + SCORE_NAV_SUPPRESS_MS;
    }

    function isLastScoreCriterion(fromInput) {
        if (!fromInput || !draftSession) {
            return false;
        }
        const d = domain();
        if (!d || !d.getDebateScoreCriteria) {
            return false;
        }
        const criteria = d.getDebateScoreCriteria(draftSession.sheetTemplate) || [];
        if (!criteria.length) {
            return false;
        }
        const criterion = fromInput.getAttribute('data-criterion');
        return criterion === criteria[criteria.length - 1];
    }

    function focusScoreField(input, opts) {
        if (!input || input.disabled) {
            return;
        }
        const force = !!(opts && opts.force);
        if (!force && isScoreNavSuppressed()) {
            return;
        }
        input.focus();
        if (prefersScoreNumpad()) {
            openScoreNumpad(input, opts);
        } else {
            closeScoreNumpad();
        }
    }

    function focusNoteForStudent(studentId) {
        if (!panelRef || !studentId) {
            closeScoreNumpad();
            return;
        }
        const note = Array.from(panelRef.querySelectorAll('.classroom-debate-score-note')).find(
            (el) => el.getAttribute('data-student-id') === studentId
        );
        armScoreNavSuppress();
        closeScoreNumpad();
        // Defer focus so the Done tap does not fall through onto the next score cell.
        window.setTimeout(() => {
            if (!note || note.disabled) {
                return;
            }
            note.focus();
            if (typeof note.scrollIntoView === 'function') {
                note.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
        }, 0);
    }

    function focusFirstScoreForStudent(studentId, opts) {
        if (!panelRef || !studentId) {
            return;
        }
        const force = !!(opts && opts.force);
        if (!force && isScoreNavSuppressed()) {
            return;
        }
        const first = Array.from(panelRef.querySelectorAll('.classroom-debate-score-input:not([disabled])')).find(
            (el) => el.getAttribute('data-student-id') === studentId
        );
        if (first) {
            focusScoreField(first, opts);
        }
    }

    function focusNextAfterScore(fromInput) {
        if (!fromInput || !panelRef) {
            closeScoreNumpad();
            return;
        }
        const sid = fromInput.getAttribute('data-student-id');
        if (isLastScoreCriterion(fromInput)) {
            focusNoteForStudent(sid);
            return;
        }
        const row = fromInput.closest('tr');
        if (row) {
            const rowScores = Array.from(row.querySelectorAll('.classroom-debate-score-input:not([disabled])'));
            const idx = rowScores.indexOf(fromInput);
            if (idx >= 0 && idx < rowScores.length - 1) {
                focusScoreField(rowScores[idx + 1], { force: true });
                return;
            }
            // Fallback: last score in the row → Notes.
            focusNoteForStudent(sid);
            return;
        }
        closeScoreNumpad();
    }

    function listStudentIdsInSheetOrder() {
        return getStudentsForSheet()
            .map((entry) => {
                const student = unwrapStudentEntry(entry);
                return student && student.id ? String(student.id) : '';
            })
            .filter(Boolean);
    }

    function focusNextAfterNote(fromNote) {
        if (!fromNote || !panelRef) {
            return;
        }
        // Intentional Enter must always advance — clear ghost-click suppress from Done→Notes.
        suppressScoreNavUntil = 0;
        const sid = String(fromNote.getAttribute('data-student-id') || '');
        const ids = listStudentIdsInSheetOrder();
        const idx = ids.indexOf(sid);
        const nextSid = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : '';
        if (!nextSid) {
            fromNote.blur();
            closeScoreNumpad();
            return;
        }
        focusFirstScoreForStudent(nextSid, { force: true });
    }

    function ensureScoreNumpad() {
        if (scoreNumpadEl) {
            return scoreNumpadEl;
        }
        const el = document.createElement('div');
        el.id = 'classroomDebateScoreNumpad';
        el.className = 'classroom-debate-score-numpad';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', t('classroomDebateScoresNumpadLabel'));
        el.hidden = true;
        const keysHtml = SCORE_NUMPAD_KEYS.map((key) => {
            if (key.action === 'backspace') {
                return `<button type="button" class="btn btn-outline btn-compact classroom-debate-score-numpad__key" data-score-action="backspace" aria-label="${escapeHtml(t('classroomDebateScoresNumpadBackspace'))}">${key.label}</button>`;
            }
            return `<button type="button" class="btn btn-outline btn-compact classroom-debate-score-numpad__key" data-score-digit="${key.digit}">${key.label != null ? key.label : key.digit}</button>`;
        }).join('');
        el.innerHTML = `
            <div class="classroom-debate-score-numpad__grid">${keysHtml}</div>
            <div class="classroom-debate-score-numpad__actions">
                <button type="button" class="btn btn-secondary btn-compact classroom-debate-score-numpad__clear" data-score-action="clear">${escapeHtml(t('classroomDebateScoresNumpadClear'))}</button>
                <button type="button" class="btn btn-primary btn-compact classroom-debate-score-numpad__done" data-score-action="done">${escapeHtml(t('classroomDebateScoresNumpadDone'))}</button>
            </div>`;
        el.addEventListener('mousedown', (e) => {
            // Keep focus on the score field; avoid iOS keyboard flicker.
            e.preventDefault();
        });
        el.addEventListener('click', (e) => {
            const btn =
                e.target && e.target.closest
                    ? e.target.closest('button[data-score-digit], button[data-score-action]')
                    : null;
            if (!btn || !scoreNumpadAnchor) {
                return;
            }
            const action = btn.getAttribute('data-score-action');
            if (action === 'done') {
                e.preventDefault();
                e.stopPropagation();
                applyScoreFromInput(scoreNumpadAnchor, { allowClear: true });
                focusNextAfterScore(scoreNumpadAnchor);
                return;
            }
            if (action === 'clear') {
                scoreNumpadAnchor.value = '';
                applyScoreFromInput(scoreNumpadAnchor, { allowClear: true });
                return;
            }
            if (action === 'backspace') {
                const cur = String(scoreNumpadAnchor.value || '');
                scoreNumpadAnchor.value = cur.slice(0, -1);
                applyScoreFromInput(scoreNumpadAnchor, { allowClear: true });
                return;
            }
            const digit = btn.getAttribute('data-score-digit');
            if (digit == null) {
                return;
            }
            let next = String(scoreNumpadAnchor.value || '');
            if (digit === '.') {
                if (next.includes('.')) {
                    return;
                }
                if (next === '') {
                    next = '0.';
                } else {
                    next += '.';
                }
            } else {
                // Cap length so scores stay within 0–5 (e.g. "3.5", "5").
                if (next.replace('.', '').length >= 3) {
                    return;
                }
                next += digit;
            }
            scoreNumpadAnchor.value = next;
            // Live total only when the typed value is a complete number (not "3.").
            applyScoreFromInput(scoreNumpadAnchor, { allowClear: false });
        });
        document.body.appendChild(el);
        scoreNumpadEl = el;
        if (!scoreNumpadDocBound) {
            scoreNumpadDocBound = true;
            document.addEventListener('pointerdown', (e) => {
                if (!scoreNumpadEl || scoreNumpadEl.hidden) {
                    return;
                }
                const target = e.target;
                if (scoreNumpadEl.contains(target)) {
                    return;
                }
                if (scoreNumpadAnchor && scoreNumpadAnchor === target) {
                    return;
                }
                if (target && target.classList && target.classList.contains('classroom-debate-score-input')) {
                    return;
                }
                if (scoreNumpadAnchor) {
                    applyScoreFromInput(scoreNumpadAnchor, { allowClear: true });
                }
                closeScoreNumpad();
            });
            window.addEventListener('resize', repositionOpenScoreNumpad);
            document.addEventListener('scroll', repositionOpenScoreNumpad, true);
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', repositionOpenScoreNumpad);
                window.visualViewport.addEventListener('scroll', repositionOpenScoreNumpad);
            }
        }
        return scoreNumpadEl;
    }

    function openScoreNumpad(input, opts) {
        if (!input || input.disabled || !prefersScoreNumpad()) {
            return;
        }
        const force = !!(opts && opts.force);
        if (!force && isScoreNavSuppressed()) {
            return;
        }
        ensureScoreNumpad();
        scoreNumpadEl.setAttribute('aria-label', t('classroomDebateScoresNumpadLabel'));
        const clearBtn = scoreNumpadEl.querySelector('[data-score-action="clear"]');
        const doneBtn = scoreNumpadEl.querySelector('[data-score-action="done"]');
        if (clearBtn) {
            clearBtn.textContent = t('classroomDebateScoresNumpadClear');
        }
        if (doneBtn) {
            doneBtn.textContent = t('classroomDebateScoresNumpadDone');
        }
        scoreNumpadAnchor = input;
        positionScoreNumpad(input);
    }

    function renderHeader(panel) {
        const d = domain();
        const criteria = d && draftSession ? d.getDebateScoreCriteria(draftSession.sheetTemplate) : [];
        const head = panel.querySelector('#classroomDebateScoresHeadRow');
        if (!head) {
            return;
        }
        const maxTotal = d && draftSession ? d.getDebateScoreMaxTotal(draftSession.sheetTemplate) : 30;
        let cells = `<th scope="col" class="classroom-sheet-col-student">${escapeHtml(t('classroomColStudent'))}</th>`;
        cells += `<th scope="col">${escapeHtml(t('classroomDebateScoresColRole'))}</th>`;
        criteria.forEach((key) => {
            const label = t(CRITERION_I18N[key] || key);
            cells += `<th scope="col" class="classroom-sheet-col-test-score">${escapeHtml(label)}</th>`;
        });
        cells += `<th scope="col" class="classroom-sheet-col-test-max">${escapeHtml(t('classroomDebateScoresColTotal'))} (/${maxTotal})</th>`;
        cells += `<th scope="col" class="classroom-sheet-col-notes">${escapeHtml(t('classroomColNotes'))}</th>`;
        head.innerHTML = cells;
    }

    function renderRows(panel) {
        const rowsMount = panel.querySelector('#classroomDebateScoresRows');
        if (!rowsMount) {
            return;
        }
        const d = domain();
        if (!classId || !sessionDate || !draftSession) {
            rowsMount.innerHTML = '';
            return;
        }
        const criteria = d.getDebateScoreCriteria(draftSession.sheetTemplate);
        const disabled = canEdit() ? '' : ' disabled';
        const students = getStudentsForSheet();
        const byId = Object.create(null);
        (draftSession.records || []).forEach((r) => {
            if (r && r.studentId) {
                byId[r.studentId] = r;
            }
        });
        const useNumpad = prefersScoreNumpad();
        rowsMount.innerHTML = students
            .map((entry) => {
                const student = unwrapStudentEntry(entry);
                const sid = student && student.id ? String(student.id) : '';
                const name = studentDisplayName(student);
                const rec = byId[sid] || {};
                const roleLabel =
                    d && d.formatDebateScoreRoleLabel
                        ? d.formatDebateScoreRoleLabel(rec)
                        : rec.roleAbbr || rec.roleName || '';
                const scoreCells = criteria
                    .map((key) => {
                        const val = rec.scores && rec.scores[key] != null ? rec.scores[key] : '';
                        return `<td class="classroom-sheet-col-test-score"><input type="text" inputmode="decimal" autocomplete="off" class="field-input field-control--compact classroom-debate-score-input" data-student-id="${escapeHtml(sid)}" data-criterion="${escapeHtml(key)}" value="${escapeHtml(formatScoreDisplay(val))}"${disabled} /></td>`;
                    })
                    .join('');
                const total = rec.total != null ? rec.total : '';
                return `<tr data-student-id="${escapeHtml(sid)}">
                    <td class="classroom-sheet-col-student">${escapeHtml(name)}</td>
                    <td>${escapeHtml(roleLabel)}</td>
                    ${scoreCells}
                    <td class="classroom-sheet-col-test-max classroom-debate-score-total">${escapeHtml(total)}</td>
                    <td class="classroom-sheet-col-notes"><input type="text" class="field-input field-control--compact classroom-debate-score-note" data-student-id="${escapeHtml(sid)}" value="${escapeHtml(rec.note || '')}" placeholder="${escapeHtml(t('classroomColNotes'))}"${disabled} /></td>
                </tr>`;
            })
            .join('');

        rowsMount.querySelectorAll('.classroom-debate-score-input').forEach((input) => {
            input.addEventListener('input', () => {
                // System keyboard and numpad share this field — update totals while typing.
                applyScoreFromInput(input, { allowClear: false });
            });
            input.addEventListener('change', () => {
                applyScoreFromInput(input, { allowClear: true });
            });
            input.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') {
                    return;
                }
                e.preventDefault();
                applyScoreFromInput(input, { allowClear: true });
                focusNextAfterScore(input);
            });
            input.addEventListener('focus', () => {
                if (isScoreNavSuppressed()) {
                    return;
                }
                if (useNumpad) {
                    openScoreNumpad(input);
                }
            });
            input.addEventListener('click', () => {
                if (isScoreNavSuppressed()) {
                    return;
                }
                if (useNumpad) {
                    openScoreNumpad(input);
                }
            });
        });
        rowsMount.querySelectorAll('.classroom-debate-score-note').forEach((input) => {
            input.addEventListener('input', () => {
                // User is editing notes — allow Enter to advance (clear Done→Notes suppress).
                suppressScoreNavUntil = 0;
                setRecordNote(input.getAttribute('data-student-id'), input.value);
                scheduleSave();
            });
            input.addEventListener('keydown', (e) => {
                const isEnter = e.key === 'Enter' || e.keyCode === 13;
                if (!isEnter) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                setRecordNote(input.getAttribute('data-student-id'), input.value);
                scheduleSave();
                focusNextAfterNote(input);
            });
            input.addEventListener('focus', () => {
                closeScoreNumpad();
            });
        });
    }

    function updateHint(panel) {
        const hint = panel.querySelector('#classroomDebateScoresHint');
        if (!hint) {
            return;
        }
        if (panel.classList.contains('classroom-debate-scores--chrome-compact')) {
            hint.hidden = true;
            return;
        }
        if (!classId || !sessionDate) {
            hint.hidden = false;
            hint.textContent = t('classroomDebateScoresSelectClassDate');
            return;
        }
        const d = domain();
        const data = getAppData();
        const teamSession = d.findDebateTeamSession(data.debateTeamSessions, classId, sessionDate);
        if (!teamSession || !teamSession.sessionState || !Array.isArray(teamSession.sessionState.debates) || !teamSession.sessionState.debates.length) {
            hint.hidden = false;
            hint.textContent = t('classroomDebateScoresNoTeamsHint');
            return;
        }
        hint.hidden = true;
        hint.textContent = '';
    }

    function buildExportSpeakers() {
        if (!draftSession) {
            return [];
        }
        const ordered = getStudentsForSheet();
        const byId = Object.create(null);
        ordered.forEach((entry) => {
            const student = unwrapStudentEntry(entry);
            if (student && student.id) {
                byId[String(student.id)] = studentDisplayName(student);
            }
        });
        return ordered
            .map((entry) => {
                const student = unwrapStudentEntry(entry);
                const sid = student && student.id ? String(student.id) : '';
                return (draftSession.records || []).find((r) => r && r.studentId === sid);
            })
            .filter((r) => r && r.studentId)
            .map((r) => ({
                name: byId[r.studentId] || r.studentId,
                roleAbbr: r.roleAbbr || '',
                roleName: r.roleName || '',
                debate: r.debateNumber != null ? r.debateNumber : '',
                bench: r.bench || '',
                scores: r.scores || {},
                total: r.total,
                note: r.note || ''
            }));
    }

    function buildExportContext() {
        const exp = global.CCPDebateScoresheetExport;
        if (!exp || !exp.buildExportContext) {
            throw new Error(t('classroomDebateModuleNotReady'));
        }
        const classData = getClassData();
        const title =
            (classData && (classData.displayName || classData.name || classData.title)) || '';
        return exp.buildExportContext({
            sheetTemplate: draftSession ? draftSession.sheetTemplate : 'garam',
            classTitle: title,
            hrTeacher: getHomeroomLabel(),
            dateStr: sessionDate,
            speakers: buildExportSpeakers()
        });
    }

    async function runExport(kind) {
        const exp = global.CCPDebateScoresheetExport;
        if (!exp) {
            hooks.showToast(t('classroomDebateModuleNotReady'), true);
            return;
        }
        const speakers = buildExportSpeakers();
        if (!speakers.length) {
            hooks.showToast(t('classroomDebateScoresExportEmpty'), true);
            return;
        }
        try {
            await flushBeforeLeave();
            const ctx = buildExportContext();
            if (kind === 'word') {
                await exp.exportWord(ctx);
            } else if (kind === 'pdf') {
                await exp.exportPdf(ctx, { mountId: 'debate-scores-sheet-mount' });
            } else {
                exp.printSheets(ctx);
            }
        } catch (err) {
            hooks.showToast(err.message || String(err), true);
        }
    }

    function bindToolbar(panel) {
        if (!panel) {
            return;
        }
        bindToolbarCollapse(panel);
        if (boundPanel === panel) {
            return;
        }
        boundPanel = panel;
        const assignmentSelect = panel.querySelector('#classroomDebateScoresAssignmentSelect');
        if (assignmentSelect && !assignmentSelect.dataset.bound) {
            assignmentSelect.dataset.bound = '1';
            assignmentSelect.addEventListener('change', onAssignmentSelectChange);
        }
        const templateSelect = panel.querySelector('#classroomDebateScoresTemplate');
        if (templateSelect && !templateSelect.dataset.bound) {
            templateSelect.dataset.bound = '1';
            templateSelect.addEventListener('change', () => {
                if (!draftSession) {
                    return;
                }
                const d = domain();
                draftSession.sheetTemplate = d.normalizeDebateSheetTemplate(templateSelect.value);
                draftSession.records = (draftSession.records || []).map((r) =>
                    d.normalizeDebateScoreRecord(r, draftSession.sheetTemplate)
                );
                updateToolbarSummary(panel);
                render(panel);
                scheduleSave();
            });
        }
        const saveBtn = panel.querySelector('#classroomDebateScoresSaveBtn');
        if (saveBtn && !saveBtn.dataset.bound) {
            saveBtn.dataset.bound = '1';
            saveBtn.addEventListener('click', () => {
                if (autosave && autosave.invokeSave) {
                    void autosave.invokeSave({ silent: false });
                }
            });
        }
        const wordBtn = panel.querySelector('#classroomDebateScoresWordBtn');
        if (wordBtn && !wordBtn.dataset.bound) {
            wordBtn.dataset.bound = '1';
            wordBtn.addEventListener('click', () => {
                void runExport('word');
            });
        }
        const pdfBtn = panel.querySelector('#classroomDebateScoresPdfBtn');
        if (pdfBtn && !pdfBtn.dataset.bound) {
            pdfBtn.dataset.bound = '1';
            pdfBtn.addEventListener('click', () => {
                void runExport('pdf');
            });
        }
        const printBtn = panel.querySelector('#classroomDebateScoresPrintBtn');
        if (printBtn && !printBtn.dataset.bound) {
            printBtn.dataset.bound = '1';
            printBtn.addEventListener('click', () => {
                void runExport('print');
            });
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
    }

    function render(panel) {
        if (!panel) {
            return;
        }
        panelRef = panel;
        ensureAutosave(panel);
        bindToolbar(panel);
        applyPanelI18n(panel);
        ensureToolbarCollapsedState(panel);
        syncAssignmentPicker(panel);
        updateBookChip(panel);
        ensureDraftSession();
        const templateSelect = panel.querySelector('#classroomDebateScoresTemplate');
        if (templateSelect && draftSession) {
            templateSelect.value = draftSession.sheetTemplate;
            templateSelect.disabled = !canEdit();
        }
        const saveBtn = panel.querySelector('#classroomDebateScoresSaveBtn');
        if (saveBtn) {
            saveBtn.disabled = !canEdit();
        }
        updateHint(panel);
        renderHeader(panel);
        renderRows(panel);
        updateToolbarSummary(panel);
        updateChromeCompactClass(panel);
        syncChromeMetrics();
    }

    function resolveContext() {
        let nextClassId = '';
        let nextDate = '';
        if (typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.get) {
            const ctx = global.CCPActiveContext.get() || {};
            nextClassId = String(ctx.classId || '').trim();
            nextDate = String(ctx.sessionDate || '').trim();
        }
        const data = getAppData();
        if (!nextClassId && data.ui) {
            nextClassId = String(data.ui.classroomTabClassId || '').trim();
        }
        if (!nextDate && data.ui) {
            nextDate = String(data.ui.classroomTabDate || '').trim();
        }
        const classData = (data.classes || []).find((c) => c && c.id === nextClassId) || null;
        if (classData) {
            nextDate = resolveDebateAssignmentDate(classData, nextDate) || nextDate;
        }
        return { classId: nextClassId, sessionDate: nextDate };
    }

    function subscribeContext() {
        if (contextSubscribed || typeof global.CCPActiveContext === 'undefined' || !global.CCPActiveContext.subscribe) {
            return;
        }
        contextSubscribed = true;
        global.CCPActiveContext.subscribe(() => {
            if (applyingAssignment) {
                return;
            }
            const panel = panelRef || document.getElementById('panel-debate-scores');
            if (!panel || panel.hidden) {
                return;
            }
            void flushBeforeLeave().then(() => {
                const next = resolveContext();
                classId = next.classId;
                sessionDate = next.sessionDate;
                if (classId && sessionDate) {
                    persistDebateAssignmentDate(classId, sessionDate);
                }
                ensureDraftSession();
                render(panel);
            });
        });
    }

    async function initTab(h, options) {
        hooks = h || hooks;
        const panel = document.getElementById('panel-debate-scores');
        if (!panel) {
            return;
        }
        panelRef = panel;
        subscribeContext();
        const next = resolveContext();
        classId = next.classId;
        sessionDate = next.sessionDate;
        if (options && options.classId) {
            classId = String(options.classId);
        }
        if (options && options.sessionDate) {
            sessionDate = String(options.sessionDate);
        }
        if (classId && sessionDate) {
            persistDebateAssignmentDate(classId, sessionDate);
            if (!applyingAssignment) {
                pushSessionDateToContext(sessionDate, 'debate-scores-init');
            }
        }
        ensureDraftSession();
        render(panel);
    }

    global.CCPClassroomDebateScores = {
        initTab,
        flushBeforeLeave,
        render
    };
})(typeof window !== 'undefined' ? window : globalThis);
