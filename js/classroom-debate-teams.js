/**
 * Classroom → Debate Teams (port of Debate Team Randomizer with team-sync persistence).
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
    let nameToStudentId = Object.create(null);
    const DEBATE_AUTOSAVE_DELAY_MS = 800;

    function domain() {
        return global.CCPClassroomDomain;
    }

    function access() {
        return global.CCPClassroomAccess;
    }

    function core() {
        return global.CCPDebateRandomizerCore;
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
        return !!(a && classData && a.canEditClass && a.canEditClass(classData));
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
            autosave.schedule();
        }
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
        const c = core();
        if (!c || !c.importStudentsFromNames) {
            return { ok: false, reason: 'core' };
        }
        const names = rosterStudentNames();
        if (!names.length) {
            return { ok: false, reason: 'empty' };
        }
        const current = c.collectAppState ? (c.collectAppState().students || []) : [];
        const unchanged = names.length === current.length && names.every((name, idx) => name === current[idx]);
        if (unchanged) {
            if (c.updateStudentList) {
                c.updateStudentList();
            }
            updateRosterHint(names.length);
            return { ok: true, reason: 'unchanged', count: names.length };
        }
        if (options.confirm && current.length > 0) {
            if (!confirm(t('classroomDebateImportRosterConfirm'))) {
                return { ok: false, reason: 'cancelled' };
            }
        }
        const result = c.importStudentsFromNames(names, { mode: 'replace' });
        updateRosterHint(result.count);
        return { ok: true, reason: 'imported', count: result.count };
    }

    async function ensureCoreReady() {
        if (core() && core().importStudentsFromNames) {
            return true;
        }
        if (global.CCPTabScripts && global.CCPTabScripts.ensureDebateCoreScripts) {
            const ready = await global.CCPTabScripts.ensureDebateCoreScripts();
            if (!ready) {
                console.error('Debate core failed to initialize: importStudentsFromNames missing');
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
        return !!(core() && core().importStudentsFromNames);
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
        scheduleSave();
        if (hooks && hooks.showToast) {
            if (outcome.reason === 'unchanged') {
                hooks.showToast(t('classroomDebateImportRosterUpToDate'), false);
            } else {
                hooks.showToast(
                    t('classroomDebateImportRosterSuccess').replace('{count}', String(outcome.count)),
                    false
                );
            }
        }
        return true;
    }

    function applyMetadataDefaults() {
        const classData = getClassData();
        const titleEl = document.getElementById('class-title');
        const hrEl = document.getElementById('hr-teacher');
        if (titleEl && classData && !titleEl.value.trim()) {
            titleEl.value = String(classData.name || classData.displayName || '').trim();
        }
        if (hrEl && !hrEl.value.trim()) {
            hrEl.value = getHomeroomLabel();
        }
    }

    function loadSessionIntoEngine() {
        const c = core();
        if (!c || !c.importStateFromJson) {
            return;
        }
        const stored = findStoredSession();
        if (stored && stored.sessionState) {
            c.importStateFromJson(stored.sessionState, { silent: true });
            if (stored.sessionState.debates && stored.sessionState.debates.length && c.displayResults) {
                c.displayResults({ scroll: false });
            }
            return;
        }
        importRosterToEngine({ confirm: false });
        applyMetadataDefaults();
    }

    async function persistSession() {
        const c = core();
        const d = domain();
        if (!c || !d || !hooks || !classId || !sessionDate) {
            return;
        }
        const appState = c.collectAppState ? c.collectAppState() : null;
        if (!appState) {
            return;
        }
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
            sessionState: appState,
            studentIds,
            authorUserId: hooks.getCurrentUserId ? hooks.getCurrentUserId() : '',
            updatedAt: new Date().toISOString()
        };
        const nextSessions = d.upsertDebateTeamSession(data.debateTeamSessions, entry);
        const fields = { debateTeamSessions: nextSessions };
        if (Array.isArray(appState.savedCustomFormats)) {
            fields.debateCustomFormats = appState.savedCustomFormats.map((fmt) =>
                d.normalizeDebateCustomFormat(
                    Object.assign({}, fmt, {
                        id: fmt.id || d.newId('dcf'),
                        authorUserId: hooks.getCurrentUserId ? hooks.getCurrentUserId() : '',
                        updatedAt: new Date().toISOString()
                    })
                )
            ).filter(Boolean);
        }
        if (hooks.saveClassroom) {
            await hooks.saveClassroom(fields);
        }
    }

    function updateRosterHint(count) {
        const el = panelRef && panelRef.querySelector('#classroomDebateRosterHint');
        if (!el) {
            return;
        }
        const n = Number.isFinite(count) ? count : rosterStudentNames().length;
        el.textContent = t('classroomDebateRosterHint').replace('{count}', String(n));
    }

    function renderHeader(panel) {
        const mount = panel.querySelector('#classroomDebateTeamsHeader');
        if (!mount) {
            return;
        }
        const book = getDebateBookChip();
        const bookHtml = book
            ? `<span class="lesson-filter-chip classroom-debate-book-chip">${escapeHtml(book)}</span>`
            : '';
        mount.innerHTML = `
            <div class="classroom-debate-header-meta">
                <p id="classroomDebateRosterHint" class="section-hint"></p>
                ${bookHtml}
            </div>`;
        updateRosterHint();
    }

    function applyPanelI18n(root) {
        if (!root) {
            return;
        }
        root.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                el.textContent = t(key);
            }
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) {
                el.placeholder = t(key);
            }
        });
        root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
            const key = el.getAttribute('data-i18n-aria-label');
            if (key) {
                el.setAttribute('aria-label', t(key));
            }
        });
    }

    function syncShellToolbar(hasResults) {
        const panel = panelRef || document.getElementById('panel-debate-teams');
        if (!panel) {
            return;
        }
        const regenBtn = panel.querySelector('#classroomDebateRegenerateBtn');
        const copyBtn = panel.querySelector('#classroomDebateCopyBtn');
        const printBtn = panel.querySelector('#classroomDebatePrintBtn');
        [regenBtn, copyBtn, printBtn].forEach((btn) => {
            if (btn) {
                btn.classList.toggle('hidden', !hasResults);
            }
        });
    }

    function setEditEnabled(panel, enabled) {
        panel.querySelectorAll('input, textarea, select, button').forEach((el) => {
            if (el.id === 'classroomDebateRefreshRosterBtn') {
                return;
            }
            if (el.closest('.classroom-tab-toolbar')) {
                return;
            }
            el.disabled = !enabled;
        });
    }

    function installSessionBridge() {
        global.CCPDebateSessionBridge = {
            getCustomFormats() {
                const data = getAppData();
                return Array.isArray(data.debateCustomFormats) ? data.debateCustomFormats : [];
            },
            saveCustomFormats(formats) {
                const d = domain();
                if (!d || !hooks || !hooks.saveClassroom) {
                    return;
                }
                const normalized = (Array.isArray(formats) ? formats : [])
                    .map((fmt) =>
                        d.normalizeDebateCustomFormat(
                            Object.assign({}, fmt, {
                                id: fmt.id || d.newId('dcf'),
                                authorUserId: hooks.getCurrentUserId ? hooks.getCurrentUserId() : '',
                                updatedAt: new Date().toISOString()
                            })
                        )
                    )
                    .filter(Boolean);
                void hooks.saveClassroom({ debateCustomFormats: normalized });
            },
            onRosterChange() {
                scheduleSave();
            },
            onSave(state) {
                const c = core();
                if (c && c.collectAppState) {
                    scheduleSave();
                } else if (state) {
                    scheduleSave();
                }
            },
            t(key) {
                return t(key);
            },
            onResultsVisibility(visible) {
                syncShellToolbar(!!visible);
            }
        };
    }

    async function ensureMount(panel) {
        if (mountReady && core() && core().importStudentsFromNames) {
            return true;
        }
        mountReady = false;
        const mount = panel.querySelector('#classroomDebateTeamsMount');
        if (!mount) {
            return false;
        }
        if (!(await ensureCoreReady())) {
            mount.innerHTML = `<p class="section-hint">${escapeHtml(t('classroomDebateMountError'))}</p>`;
            return false;
        }
        if (!mount.querySelector('.classroom-debate-panel')) {
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
        const c = core();
        if (c && c.initDebateRandomizerDom) {
            try {
                c.initDebateRandomizerDom();
            } catch (err) {
                console.error('Debate randomizer init failed', err);
                mount.innerHTML = `<p class="section-hint">${escapeHtml(t('classroomDebateMountError'))}</p>`;
                return false;
            }
        }
        mountReady = true;
        return true;
    }

    function ensureMountDelegatedEvents(panel) {
        const mount = panel.querySelector('#classroomDebateTeamsMount');
        if (!mount || mount.dataset.debateBound === '1') {
            return;
        }
        mount.dataset.debateBound = '1';
        mount.addEventListener('click', (e) => {
            const importBtn = e.target.closest('#classroomDebateImportRosterBtn');
            if (!importBtn) {
                return;
            }
            e.preventDefault();
            if (!canEdit()) {
                if (hooks && hooks.showToast) {
                    hooks.showToast(t('classroomDebateViewOnly'), true);
                }
                return;
            }
            void importFromRoster({ confirm: true });
        });
    }

    function bindToolbar(panel) {
        const generateBtn = panel.querySelector('#classroomDebateGenerateBtn');
        if (generateBtn && !generateBtn.dataset.bound) {
            generateBtn.dataset.bound = '1';
            generateBtn.addEventListener('click', () => {
                if (!canEdit() || typeof global.generateDebates !== 'function') {
                    return;
                }
                global.generateDebates();
            });
        }
        const regenBtn = panel.querySelector('#classroomDebateRegenerateBtn');
        if (regenBtn && !regenBtn.dataset.bound) {
            regenBtn.dataset.bound = '1';
            regenBtn.addEventListener('click', () => {
                if (!canEdit() || typeof global.regenerateDebates !== 'function') {
                    return;
                }
                global.regenerateDebates();
            });
        }
        const copyBtn = panel.querySelector('#classroomDebateCopyBtn');
        if (copyBtn && !copyBtn.dataset.bound) {
            copyBtn.dataset.bound = '1';
            copyBtn.addEventListener('click', () => {
                if (typeof global.copyResults === 'function') {
                    global.copyResults();
                }
            });
        }
        const printBtn = panel.querySelector('#classroomDebatePrintBtn');
        if (printBtn && !printBtn.dataset.bound) {
            printBtn.dataset.bound = '1';
            printBtn.addEventListener('click', () => {
                global.print();
            });
        }
        const refreshBtn = panel.querySelector('#classroomDebateRefreshRosterBtn');
        if (refreshBtn && !refreshBtn.dataset.bound) {
            refreshBtn.dataset.bound = '1';
            refreshBtn.addEventListener('click', () => {
                void importFromRoster({ confirm: false, allowViewOnly: true });
            });
        }
        const saveBtn = panel.querySelector('#classroomDebateSaveBtn');
        if (saveBtn && !saveBtn.dataset.bound) {
            saveBtn.dataset.bound = '1';
            saveBtn.addEventListener('click', () => {
                if (autosave) {
                    void autosave.flush({ reason: 'manual' });
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
            return;
        }
        const mounted = await ensureMount(panel);
        if (!mounted || gen !== renderGeneration) {
            return;
        }
        ensureMountDelegatedEvents(panel);
        renderHeader(panel);
        bindToolbar(panel);
        loadSessionIntoEngine();
        if (gen !== renderGeneration) {
            return;
        }
        const resultsEl = panel.querySelector('#results-section');
        syncShellToolbar(!!(resultsEl && !resultsEl.classList.contains('hidden')));
        setEditEnabled(panel, canEdit());
        ensureAutosave(panel);
    }

    function syncActiveContext(options) {
        options = options || {};
        const data = getAppData();
        const d = domain();
        const visible = global.CCPClassroomZoneContext
            ? global.CCPClassroomZoneContext.getVisibleClasses()
            : (data.classes || []);

        if (typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.resolveActiveClassId) {
            classId = global.CCPActiveContext.resolveActiveClassId(data, {
                classId: options.classId,
                visibleClasses: visible
            });
        } else {
            classId =
                (options.classId) ||
                (data.ui && data.ui.classroomTabClassId) ||
                (visible[0] && visible[0].id) ||
                '';
        }

        sessionDate =
            (options.date) ||
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
        if (autosave && autosave.flush) {
            await autosave.flush({ reason: 'tab-leave' });
        }
    }

    global.CCPClassroomDebateTeams = {
        initTab,
        render,
        flushBeforeLeave,
        importFromRoster
    };
})(typeof window !== 'undefined' ? window : globalThis);
