/**
 * Classroom → Debate Teams (v2 sidebar UI with team-sync persistence).
 */
(function (global) {
    let hooks = null;
    let classId = '';
    let sessionDate = '';
    let panelRef = null;
    let mountReady = false;
    let autosave = null;
    let contextSubscribed = false;
    let renderGeneration = 0;
    let hydratedSessionKey = '';
    let studentsListTouchedByUser = false;
    let rosterAutoImported = false;
    let nameToStudentId = Object.create(null);
    const DEBATE_AUTOSAVE_DELAY_MS = 800;

    function sessionKey() {
        return classId && sessionDate ? `${classId}|${sessionDate}` : '';
    }

    function domain() {
        return global.CCPClassroomDomain;
    }

    function access() {
        return global.CCPClassroomAccess;
    }

    function engine() {
        return global.CCPDebateTeamsV2;
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

    function rebuildNameMap() {
        nameToStudentId = Object.create(null);
        const d = domain();
        const data = getAppData();
        const classData = getClassData();
        if (!d || !classData) {
            return;
        }
        d.resolveStudentsForClass(classData, data.cohorts).forEach((entry) => {
            const student = unwrapStudentEntry(entry);
            const name = studentDisplayName(student);
            if (name && student.id) {
                nameToStudentId[name] = student.id;
            }
        });
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

    function getDebateBookChip() {
        const classData = getClassData();
        if (!classData || !global.CCPDebatePeriods || !global.CCPDebatePeriods.getBookForDate) {
            return '';
        }
        const book = global.CCPDebatePeriods.getBookForDate(classData, sessionDate);
        return book ? String(book).trim() : '';
    }

    function canEdit() {
        const classData = getClassData();
        const a = access();
        if (a && classData && a.canEditClass && a.canEditClass(classData)) {
            return true;
        }
        if (a && a.canBypass && a.canBypass()) {
            return true;
        }
        if (global.TeamAuth && global.TeamAuth.getUser) {
            const user = global.TeamAuth.getUser();
            const role = user && user.role ? String(user.role) : '';
            if (role === 'admin' || role === 'super_admin') {
                return true;
            }
        }
        return false;
    }

    function ensureAutosave(panel) {
        if (autosave || !global.CCPClassroomAutosave) {
            return;
        }
        autosave = global.CCPClassroomAutosave.create({
            delayMs: DEBATE_AUTOSAVE_DELAY_MS,
            debounce: hooks && hooks.debounce ? hooks.debounce : null,
            t,
            getStatusEl: () => (panelRef || panel).querySelector('#classroomDebateSaveStatus'),
            saveAsync: () => persistSession()
        });
    }

    function scheduleSave() {
        if (autosave) {
            autosave.scheduleSave();
        }
    }

    async function flushStudentsListSave() {
        if (autosave && autosave.flushBeforeLeave) {
            await autosave.flushBeforeLeave();
        }
    }

    function resetSessionEditFlags() {
        studentsListTouchedByUser = false;
        rosterAutoImported = false;
    }

    function findStoredSession() {
        const d = domain();
        const data = getAppData();
        if (!d || !classId || !sessionDate) {
            return null;
        }
        return d.findDebateTeamSession(data.debateTeamSessions, classId, sessionDate);
    }

    function rosterStudentNames() {
        rebuildNameMap();
        const d = domain();
        const data = getAppData();
        const classData = getClassData();
        if (!d || !classData) {
            return [];
        }
        return d
            .resolveStudentsForClass(classData, data.cohorts)
            .map(studentDisplayName)
            .filter(Boolean);
    }

    function importRosterToEngine(options) {
        options = options || {};
        const eng = engine();
        if (!eng || !eng.importRoster) {
            return { ok: false, reason: 'core' };
        }
        const names = rosterStudentNames();
        if (!names.length) {
            return { ok: false, reason: 'empty' };
        }
        return eng.importRoster(names, options);
    }

    async function ensureCoreReady() {
        if (engine() && engine().collectState) {
            return true;
        }
        if (global.CCPTabScripts && global.CCPTabScripts.ensureDebateCoreScripts) {
            const ready = await global.CCPTabScripts.ensureDebateCoreScripts();
            if (!ready) {
                console.error('Debate v2 failed to initialize');
            }
            return ready;
        }
        if (global.CCPTabScripts && global.CCPTabScripts.ensureTabScripts) {
            try {
                await global.CCPTabScripts.ensureTabScripts('debate-teams');
            } catch (err) {
                console.error('Debate tab scripts failed to load', err);
                return false;
            }
        }
        return !!(engine() && engine().collectState);
    }

    async function importFromRoster(options) {
        if (!classId || !sessionDate) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomDebateSelectClassDate'), true);
            }
            return false;
        }
        if (!canEdit() && !(options && options.allowViewOnly)) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomDebateViewOnly'), true);
            }
            return false;
        }
        if (!(await ensureCoreReady())) {
            if (hooks && hooks.showToast) {
                hooks.showToast(t('classroomDebateModuleNotReady'), true);
            }
            return false;
        }
        const outcome = importRosterToEngine(options || {});
        if (!outcome.ok) {
            if (hooks && hooks.showToast) {
                if (outcome.reason === 'empty') {
                    hooks.showToast(t('classroomDebateImportRosterEmpty'), true);
                } else if (outcome.reason === 'core') {
                    hooks.showToast(t('classroomDebateModuleNotReady'), true);
                }
            }
            return false;
        }
        applyMetadataDefaults();
        rosterAutoImported = true;
        studentsListTouchedByUser = false;
        scheduleSave();
        if (outcome.debatesCleared && autosave && autosave.flushBeforeLeave) {
            await autosave.flushBeforeLeave();
        }
        updateSidebarMeta();
        if (hooks && hooks.showToast) {
            if (outcome.reason === 'unchanged') {
                hooks.showToast(t('classroomDebateImportRosterUpToDate'), false);
            } else {
                hooks.showToast(
                    t('classroomDebateImportRosterSuccess').replace('{count}', String(outcome.count)),
                    false
                );
            }
            if (outcome.debatesCleared) {
                hooks.showToast(t('classroomDebateRosterRefreshedAssignmentsCleared'), false);
            }
        }
        return true;
    }

    function applyMetadataDefaults() {
        const classData = getClassData();
        const eng = engine();
        if (!eng || !eng.applyMetadataDefaults) {
            return;
        }
        const title = classData ? String(classData.name || classData.displayName || '').trim() : '';
        eng.applyMetadataDefaults(title, getHomeroomLabel());
    }

    function bootstrapStudentsFromRosterIfEmpty() {
        return syncStudentsFromRosterIfNeeded();
    }

    function syncStudentsFromRosterIfNeeded() {
        if (studentsListTouchedByUser || rosterAutoImported) {
            return false;
        }
        const eng = engine();
        if (!eng || !eng.collectState || !eng.importRoster) {
            return false;
        }
        const students = eng.collectState().students || [];
        const names = rosterStudentNames();
        if (students.length > 0 || names.length === 0) {
            if (students.length > 0) {
                rosterAutoImported = true;
            }
            return false;
        }
        const outcome = eng.importRoster(names, { confirm: false, clearDebates: false });
        if (outcome && outcome.ok) {
            rosterAutoImported = true;
            scheduleSave();
            if (hooks && hooks.showToast && outcome.reason === 'imported') {
                hooks.showToast(
                    t('classroomDebateImportRosterSuccess').replace('{count}', String(outcome.count)),
                    false
                );
            }
            return true;
        }
        return false;
    }

    function canMarkSessionHydrated() {
        const eng = engine();
        if (!eng || !eng.collectState) {
            return false;
        }
        const students = eng.collectState().students || [];
        const roster = rosterStudentNames();
        if (students.length > 0) {
            return true;
        }
        if (roster.length === 0) {
            return true;
        }
        if (studentsListTouchedByUser) {
            return true;
        }
        return false;
    }

    function hydrateSessionIfNeeded(options) {
        options = options || {};
        const eng = engine();
        if (!eng || !eng.loadState) {
            return;
        }
        const key = sessionKey();
        if (!key) {
            return;
        }
        if (!options.force && key === hydratedSessionKey) {
            syncStudentsFromRosterIfNeeded();
            return;
        }
        const stored = findStoredSession();
        if (stored && stored.sessionState) {
            eng.loadState(stored.sessionState);
            if (stored.sessionState.studentsManual) {
                studentsListTouchedByUser = true;
            }
            if ((eng.collectState().students || []).length > 0) {
                rosterAutoImported = true;
            }
        } else {
            const outcome = importRosterToEngine({ confirm: false, clearDebates: false });
            if (outcome && outcome.ok) {
                rosterAutoImported = true;
            }
        }
        syncStudentsFromRosterIfNeeded();
        applyMetadataDefaults();
        if (canMarkSessionHydrated()) {
            hydratedSessionKey = key;
        }
    }

    async function reloadSessionFromStore(options) {
        options = options || {};
        if (autosave && autosave.flushBeforeLeave && !options.skipFlush) {
            await autosave.flushBeforeLeave();
        }
        hydratedSessionKey = '';
        hydrateSessionIfNeeded({ force: true });
        const panel = panelRef || document.getElementById('panel-debate-teams');
        if (panel) {
            updateSidebarMeta();
            const hasDebates = !!(engine() && engine().collectState && engine().collectState().debates.length);
            syncShellToolbar(hasDebates);
            setEditEnabled(panel, canEdit());
        }
    }

    async function persistSession() {
        const eng = engine();
        const d = domain();
        if (!eng || !d || !hooks || !classId || !sessionDate) {
            return;
        }
        const appState = eng.collectState ? eng.collectState() : null;
        if (!appState) {
            return;
        }
        const sessionState = Object.assign({}, appState, {
            studentsManual: studentsListTouchedByUser
        });
        rebuildNameMap();
        const studentIds = (appState.students || [])
            .map((name) => nameToStudentId[name])
            .filter(Boolean);
        const data = getAppData();
        const existing = d.findDebateTeamSession(data.debateTeamSessions, classId, sessionDate);
        const entry = {
            id: existing && existing.id ? existing.id : d.newId('dts'),
            classId,
            date: sessionDate,
            sessionState: sessionState,
            studentIds,
            authorUserId: hooks.getCurrentUserId ? hooks.getCurrentUserId() : '',
            updatedAt: new Date().toISOString()
        };
        const nextSessions = d.upsertDebateTeamSession(data.debateTeamSessions, entry);
        const fields = { debateTeamSessions: nextSessions };
        if (hooks.saveClassroom) {
            await hooks.saveClassroom(fields);
        }
    }

    function updateRosterHint(count) {
        const panel = panelRef || document.getElementById('panel-debate-teams');
        const elNode = panel && panel.querySelector('#debateV2RosterHint');
        if (!elNode) {
            return;
        }
        const n = Number.isFinite(count) ? count : rosterStudentNames().length;
        if (n > 0) {
            elNode.textContent = t('classroomDebateRosterHint').replace('{count}', String(n));
            elNode.hidden = false;
        } else {
            elNode.textContent = '';
            elNode.hidden = true;
        }
    }

    function updateSidebarMeta() {
        const panel = panelRef || document.getElementById('panel-debate-teams');
        if (!panel) {
            return;
        }
        updateRosterHint();
        const bookEl = panel.querySelector('#debateV2BookChip');
        if (bookEl) {
            const book = getDebateBookChip();
            if (book) {
                bookEl.textContent = book;
                bookEl.hidden = false;
            } else {
                bookEl.textContent = '';
                bookEl.hidden = true;
            }
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
                elNode.placeholder = t(key);
            }
        });
        root.querySelectorAll('[data-i18n-aria-label]').forEach((elNode) => {
            const key = elNode.getAttribute('data-i18n-aria-label');
            if (key) {
                elNode.setAttribute('aria-label', t(key));
            }
        });
    }

    function syncShellToolbar(hasResults) {
        const panel = panelRef || document.getElementById('panel-debate-teams');
        if (!panel) {
            return;
        }
        const saveBtn = panel.querySelector('#classroomDebateSaveBtn');
        if (saveBtn) {
            saveBtn.disabled = !canEdit();
        }
        if (typeof hasResults === 'boolean' && engine() && engine().render) {
            // toolbar state only; results visibility handled via bridge
        }
    }

    function setEditEnabled(panel, enabled) {
        const eng = engine();
        if (eng && eng.setEditEnabled) {
            eng.setEditEnabled(enabled);
        }
    }

    function installSessionBridge() {
        global.CCPDebateSessionBridge = {
            onSave() {
                scheduleSave();
            },
            onStudentsEdited() {
                studentsListTouchedByUser = true;
                scheduleSave();
                void flushStudentsListSave();
            },
            t(key) {
                return t(key);
            },
            canEdit() {
                return canEdit();
            },
            onResultsVisibility(visible) {
                syncShellToolbar(!!visible);
            }
        };
    }

    async function ensureMount(panel) {
        const mount = panel.querySelector('#classroomDebateTeamsMount');
        if (!mount) {
            return false;
        }
        if (mountReady && engine() && engine().collectState && mount.querySelector('.classroom-debate-v2')) {
            installSessionBridge();
            const eng = engine();
            if (eng && eng.setBridge) {
                eng.setBridge(global.CCPDebateSessionBridge);
            }
            if (eng && eng.hasLiveDom && !eng.hasLiveDom() && eng.init) {
                eng.init(mount, global.CCPDebateSessionBridge);
            }
            return true;
        }
        mountReady = false;
        if (!(await ensureCoreReady())) {
            mount.innerHTML = `<p class="section-hint">${escapeHtml(t('classroomDebateMountError'))}</p>`;
            return false;
        }
        const hasExistingPanel = !!mount.querySelector('.classroom-debate-v2');
        if (!hasExistingPanel) {
            try {
                const res = await fetch('templates/classroom-debate-teams-body.html', { cache: 'no-store' });
                if (res.ok) {
                    mount.innerHTML = await res.text();
                } else {
                    mount.innerHTML = `<p class="section-hint">${escapeHtml(t('classroomDebateMountError'))}</p>`;
                    return false;
                }
            } catch (err) {
                console.error('Debate template load failed', err);
                mount.innerHTML = `<p class="section-hint">${escapeHtml(t('classroomDebateMountError'))}</p>`;
                return false;
            }
        }
        installSessionBridge();
        applyPanelI18n(mount);
        const eng = engine();
        if (eng && eng.init && mount.querySelector('.classroom-debate-v2')) {
            try {
                eng.init(mount, global.CCPDebateSessionBridge);
            } catch (err) {
                console.error('Debate v2 init failed', err);
                mount.innerHTML = `<p class="section-hint">${escapeHtml(t('classroomDebateMountError'))}</p>`;
                return false;
            }
        } else if (!mount.querySelector('.classroom-debate-v2')) {
            mount.innerHTML = `<p class="section-hint">${escapeHtml(t('classroomDebateMountError'))}</p>`;
            return false;
        }
        mountReady = true;
        return true;
    }

    function bindToolbar(panel) {
        const refreshBtn = panel.querySelector('#classroomDebateRefreshRosterBtn');
        if (refreshBtn && !refreshBtn.dataset.bound) {
            refreshBtn.dataset.bound = '1';
            refreshBtn.addEventListener('click', () => {
                void importFromRoster({ confirm: false, allowViewOnly: true, clearDebates: true });
            });
        }
        const saveBtn = panel.querySelector('#classroomDebateSaveBtn');
        if (saveBtn && !saveBtn.dataset.bound) {
            saveBtn.dataset.bound = '1';
            saveBtn.addEventListener('click', () => {
                if (autosave && autosave.invokeSave) {
                    void autosave.invokeSave({ silent: false });
                }
            });
        }
    }

    async function render(panel) {
        const gen = ++renderGeneration;
        panelRef = panel;
        if (!classId || !sessionDate) {
            const mount = panel.querySelector('#classroomDebateTeamsMount');
            if (mount) {
                mount.innerHTML = `<p class="section-hint">${escapeHtml(t('classroomDebateSelectClassDate'))}</p>`;
            }
            mountReady = false;
            hydratedSessionKey = '';
            resetSessionEditFlags();
            return;
        }
        const mounted = await ensureMount(panel);
        if (!mounted || gen !== renderGeneration) {
            return;
        }
        bindToolbar(panel);
        ensureAutosave(panel);
        hydrateSessionIfNeeded();
        syncStudentsFromRosterIfNeeded();
        updateSidebarMeta();
        if (gen !== renderGeneration) {
            return;
        }
        const hasDebates = !!(engine() && engine().collectState && engine().collectState().debates.length);
        syncShellToolbar(hasDebates);
        setEditEnabled(panel, canEdit());
    }

    function syncActiveContext(options) {
        options = options || {};
        const data = getAppData();
        const d = domain();
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

        sessionDate =
            options.date ||
            (typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.get().sessionDate) ||
            (data.ui && data.ui.classroomTabDate) ||
            (d ? d.todayISO() : '');
    }

    function subscribeContext() {
        if (contextSubscribed || !global.CCPActiveContext) {
            return;
        }
        contextSubscribed = true;
        global.CCPActiveContext.subscribe((detail) => {
            const prevClass = classId;
            const prevDate = sessionDate;
            syncActiveContext({});
            if (detail && detail.sessionDate !== undefined && !sessionDate) {
                const d = domain();
                sessionDate = d ? d.todayISO() : '';
            }
            if (prevClass !== classId || prevDate !== sessionDate) {
                void flushBeforeLeave().then(() => {
                    hydratedSessionKey = '';
                    resetSessionEditFlags();
                    mountReady = false;
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
        const panel = document.getElementById('panel-debate-teams');
        if (!panel) {
            return;
        }
        if (typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.resolveDefaults) {
            global.CCPActiveContext.resolveDefaults(getAppData());
        }
        subscribeContext();
        syncActiveContext(options);
        await render(panel);
    }

    async function flushBeforeLeave() {
        if (autosave && autosave.flushBeforeLeave) {
            await autosave.flushBeforeLeave();
        }
    }

    async function refreshIfActive() {
        const panel = document.getElementById('panel-debate-teams');
        if (!panel || panel.hidden || !hooks) {
            return;
        }
        ensureAutosave(panel);
        syncStudentsFromRosterIfNeeded();
        updateSidebarMeta();
        setEditEnabled(panel, canEdit());
        syncShellToolbar(
            !!(engine() && engine().collectState && engine().collectState().debates.length)
        );
    }

    global.CCPClassroomDebateTeams = {
        initTab,
        render,
        flushBeforeLeave,
        importFromRoster,
        refreshIfActive,
        reloadSessionFromStore
    };
})(typeof window !== 'undefined' ? window : globalThis);
