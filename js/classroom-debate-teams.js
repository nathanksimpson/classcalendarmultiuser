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
        if (!classId || !sessionDate) {
            return '';
        }
        return `${classId}|${currentPeriodKey() || sessionDate}`;
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

    function getScheduledLessonsForClass(classData) {
        if (!classData || !hooks || typeof hooks.getLessonDates !== 'function') {
            return [];
        }
        try {
            const schedule = hooks.getLessonDates(classData);
            return schedule && Array.isArray(schedule.lessons) ? schedule.lessons : [];
        } catch (err) {
            console.warn('Debate assignment lesson dates failed', err);
            return [];
        }
    }

    /** Date of the shared debate assignment (CCPAssignments) for classData; local to this tab. */
    function resolveDebateAssignmentDate(classData, preferredDate) {
        const d = domain();
        const api = global.CCPAssignments;
        if (!d || !api || !classData || !d.classUsesDebateTeamAssignments || !d.classUsesDebateTeamAssignments(classData)) {
            return preferredDate || '';
        }
        const assignment = api.resolve('debate', classData, getAppData(), {
            refDate: preferredDate,
            scheduledLessons: getScheduledLessonsForClass(classData)
        });
        return assignment ? assignment.date : preferredDate || '';
    }

    function onSharedAssignmentChanged(detail) {
        if (!detail || detail.kind !== 'debate' || !hooks || detail.classId !== classId) {
            return;
        }
        const panel = panelRef || document.getElementById('panel-debate-teams');
        if (!panel || panel.hidden) {
            return;
        }
        const classData = getClassData();
        const nextDate = resolveDebateAssignmentDate(classData, sessionDate);
        if (!nextDate || nextDate === sessionDate) {
            return;
        }
        void flushBeforeLeave().then(() => {
            sessionDate = nextDate;
            hydratedSessionKey = '';
            resetSessionEditFlags();
            if (panelRef) {
                void render(panelRef);
            }
        });
    }

    function unwrapStudentEntry(entry) {
        return entry && entry.student ? entry.student : entry;
    }

    /**
     * English name, with Korean in parentheses when both exist.
     * Example: Minsu (김민수). Used so duplicate English names can be told apart.
     */
    function formatDebateStudentLabel(student) {
        const source = unwrapStudentEntry(student);
        if (!source) {
            return '';
        }
        const en = String(source.nameEn || '').trim();
        const ko = String(source.name || '').trim();
        if (en && ko && en !== ko) {
            return `${en} (${ko})`;
        }
        return en || ko;
    }

    function studentDisplayName(studentOrEntry) {
        return formatDebateStudentLabel(studentOrEntry);
    }

    function rosterRecordFromStudent(student) {
        const source = unwrapStudentEntry(student);
        if (!source || !source.id) {
            return null;
        }
        const en = String(source.nameEn || '').trim();
        const ko = String(source.name || '').trim();
        const display = formatDebateStudentLabel(source);
        if (!display) {
            return null;
        }
        return {
            id: String(source.id),
            en,
            ko,
            display,
            alt: en && ko && en !== ko ? `${ko} (${en})` : ''
        };
    }

    function rosterRecordsFromStudents(students) {
        return (Array.isArray(students) ? students : []).map(rosterRecordFromStudent).filter(Boolean);
    }

    function classRosterStudents(classData) {
        const d = domain();
        const data = getAppData();
        if (!d || !classData || typeof d.resolveStudentsForClass !== 'function') {
            return [];
        }
        return d.resolveStudentsForClass(classData, data.cohorts) || [];
    }

    function recordsForSavedName(name, records) {
        const trimmed = String(name || '').trim();
        if (!trimmed) {
            return [];
        }
        return records.filter((record) => {
            return (
                trimmed === record.en ||
                trimmed === record.ko ||
                trimmed === record.display ||
                trimmed === record.alt
            );
        });
    }

    function recordByStudentId(studentId, records) {
        const sid = String(studentId || '').trim();
        if (!sid) {
            return null;
        }
        return records.find((record) => record.id === sid) || null;
    }

    function applyRecordToMember(member, record) {
        let changed = false;
        if (record.display && member.name !== record.display) {
            member.name = record.display;
            changed = true;
        }
        if (record.id && member.studentId !== record.id) {
            member.studentId = record.id;
            changed = true;
        }
        return changed;
    }

    /**
     * Add each student's own Korean name.
     * A role is matched by its student id, so two students named Kai stay on
     * their own seats. Roles, benches, and duties are not moved.
     * A saved seat with no student id is labeled only when the English name
     * belongs to exactly one student.
     */
    function applyDisambiguatedNames(sessionState, rosterStudents) {
        const records = rosterRecordsFromStudents(rosterStudents);
        if (!sessionState || !records.length) {
            return { sessionState: sessionState, changed: false };
        }
        const next = JSON.parse(JSON.stringify(sessionState));
        let changed = false;
        const usedIds = Object.create(null);

        function takeRecord(record) {
            if (!record || usedIds[record.id]) {
                return null;
            }
            usedIds[record.id] = true;
            return record;
        }

        if (Array.isArray(next.students)) {
            const nextIds = Array.isArray(next.studentIds) ? next.studentIds.slice() : [];
            next.students = next.students.map((rawName, index) => {
                const savedId = String(nextIds[index] || '').trim();
                const byId = takeRecord(recordByStudentId(savedId, records));
                if (byId) {
                    if (byId.display !== rawName) {
                        changed = true;
                    }
                    nextIds[index] = byId.id;
                    return byId.display;
                }
                const name = String(rawName || '').trim();
                const matches = recordsForSavedName(name, records).filter((record) => !usedIds[record.id]);
                const record = matches[0];
                if (!record) {
                    return rawName;
                }
                takeRecord(record);
                nextIds[index] = record.id;
                if (record.display !== rawName) {
                    changed = true;
                    return record.display;
                }
                return rawName;
            });
            next.studentIds = nextIds;
        }

        const members = [];
        (Array.isArray(next.debates) ? next.debates : []).forEach((debate) => {
            (debate && Array.isArray(debate.benches) ? debate.benches : []).forEach((bench) => {
                (bench && Array.isArray(bench.members) ? bench.members : []).forEach((member) => {
                    if (member) {
                        members.push(member);
                    }
                });
            });
        });

        members.forEach((member) => {
            const record = recordByStudentId(member.studentId, records);
            if (!record) {
                return;
            }
            member._debateNameResolved = true;
            if (applyRecordToMember(member, record)) {
                changed = true;
            }
        });

        const unresolvedByName = Object.create(null);
        members.forEach((member) => {
            if (member._debateNameResolved) {
                return;
            }
            const name = String(member.name || '').trim();
            if (!unresolvedByName[name]) {
                unresolvedByName[name] = [];
            }
            unresolvedByName[name].push(member);
        });

        const takenMemberIds = Object.create(null);
        members.forEach((member) => {
            if (member._debateNameResolved && member.studentId) {
                takenMemberIds[String(member.studentId)] = true;
            }
        });

        Object.keys(unresolvedByName).forEach((name) => {
            const group = unresolvedByName[name];
            const matches = recordsForSavedName(name, records).filter(
                (record) => !takenMemberIds[record.id]
            );
            if (!matches.length || group.length !== matches.length) {
                return;
            }
            group.forEach((member, index) => {
                if (applyRecordToMember(member, matches[index])) {
                    changed = true;
                }
            });
        });

        members.forEach((member) => {
            delete member._debateNameResolved;
        });

        return { sessionState: next, changed };
    }

    function buildNameMap(classData) {
        const map = Object.create(null);
        const counts = Object.create(null);
        const pairs = [];
        rosterRecordsFromStudents(classRosterStudents(classData)).forEach((record) => {
            const seen = new Set();
            [record.en, record.ko, record.display, record.alt].forEach((key) => {
                const k = String(key || '').trim();
                if (!k || seen.has(k)) {
                    return;
                }
                seen.add(k);
                counts[k] = (counts[k] || 0) + 1;
                pairs.push([k, record.id]);
            });
        });
        pairs.forEach(([key, id]) => {
            if (counts[key] === 1) {
                map[key] = id;
            }
        });
        return map;
    }

    function rebuildNameMap() {
        nameToStudentId = buildNameMap(getClassData());
    }

    function stampStudentIdsOnSessionState(sessionState, classData) {
        if (!sessionState || !Array.isArray(sessionState.debates)) {
            return sessionState;
        }
        const nameMap = buildNameMap(classData !== undefined ? classData : getClassData());
        sessionState.debates.forEach((debate) => {
            (debate && Array.isArray(debate.benches) ? debate.benches : []).forEach((bench) => {
                (bench && Array.isArray(bench.members) ? bench.members : []).forEach((member) => {
                    if (!member) {
                        return;
                    }
                    if (member.studentId) {
                        return;
                    }
                    const name = String(member.name || '').trim();
                    const sid = name ? nameMap[name] : '';
                    if (sid) {
                        member.studentId = sid;
                    }
                });
            });
        });
        return sessionState;
    }

    function getHomeroomLabel(forClass) {
        const classData = forClass !== undefined ? forClass : getClassData();
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
        return bookForClassDate(classData, sessionDate);
    }

    function bookForClassDate(classData, dateStr) {
        if (
            !classData ||
            !dateStr ||
            !global.CCPDebatePeriods ||
            typeof global.CCPDebatePeriods.getBookForDate !== 'function'
        ) {
            return '';
        }
        const book = global.CCPDebatePeriods.getBookForDate(classData, dateStr);
        return book ? String(book).trim() : '';
    }

    /**
     * Resolve yeoul vs garam score sheet from live class level + debate book for a date.
     * Does not depend on Debate Teams UI module state.
     */
    function resolveSheetTemplateForClass(classData, dateStr) {
        const d = domain();
        if (!d || typeof d.defaultDebateSheetTemplate !== 'function') {
            return 'garam';
        }
        let book = '';
        if (
            classData &&
            dateStr &&
            global.CCPDebatePeriods &&
            typeof global.CCPDebatePeriods.getBookForDate === 'function'
        ) {
            const raw = global.CCPDebatePeriods.getBookForDate(classData, dateStr);
            book = raw ? String(raw).trim() : '';
        }
        return d.normalizeDebateSheetTemplate
            ? d.normalizeDebateSheetTemplate(d.defaultDebateSheetTemplate(classData, book))
            : d.defaultDebateSheetTemplate(classData, book) === 'yeoul'
              ? 'yeoul'
              : 'garam';
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

    function currentPeriodKey() {
        const d = domain();
        if (!d || !classId || !sessionDate || typeof d.debateAssignmentPeriodKey !== 'function') {
            return '';
        }
        return d.debateAssignmentPeriodKey(getClassData() || { id: classId }, sessionDate);
    }

    function findStoredSession() {
        const d = domain();
        const data = getAppData();
        if (!d || !classId || !sessionDate) {
            return null;
        }
        return d.findDebateTeamSession(data.debateTeamSessions, classId, sessionDate, getClassData());
    }

    function rosterStudentEntriesForClass(classData) {
        return classRosterStudents(classData)
            .map((student) => {
                const source = unwrapStudentEntry(student);
                const name = studentDisplayName(source);
                if (!source || !source.id || !name) {
                    return null;
                }
                return { name: name, studentId: String(source.id) };
            })
            .filter(Boolean);
    }

    function rosterStudentNames() {
        rebuildNameMap();
        return rosterStudentEntriesForClass(getClassData()).map((entry) => entry.name);
    }

    function importRosterToEngine(options) {
        options = options || {};
        const eng = engine();
        if (!eng || !eng.importRoster) {
            return { ok: false, reason: 'core' };
        }
        const entries = rosterStudentEntriesForClass(getClassData());
        if (!entries.length) {
            return { ok: false, reason: 'empty' };
        }
        return eng.importRoster(entries, options);
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
        applyMetadataDefaults({ force: true });
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

    function applyMetadataDefaults(options) {
        const classData = getClassData();
        const eng = engine();
        if (!eng || !eng.applyMetadataDefaults) {
            return;
        }
        const title = classData ? String(classData.name || classData.displayName || '').trim() : '';
        eng.applyMetadataDefaults(title, getHomeroomLabel(), options || {});
        if (eng.applyClassFormatDefaults) {
            const stored = findStoredSession();
            // Auto-enable purple only for brand-new sessions; stored purpleMode wins.
            if (!(stored && stored.sessionState)) {
                eng.applyClassFormatDefaults(classData, {
                    debateBook: getDebateBookChip(),
                    onlyIfPristine: true
                });
            }
        }
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
            applyDisambiguatedNamesToOpenSession();
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
        applyDisambiguatedNamesToOpenSession();
        applyMetadataDefaults();
        if (canMarkSessionHydrated()) {
            hydratedSessionKey = key;
        }
    }

    /**
     * Rewrite the open session's names to include Korean, then save.
     * Team benches and roles stay as they are.
     */
    function applyDisambiguatedNamesToOpenSession() {
        const eng = engine();
        const classData = getClassData();
        if (!eng || !eng.collectState || !eng.loadState || !classData) {
            return false;
        }
        let renamed;
        try {
            renamed = applyDisambiguatedNames(eng.collectState(), classRosterStudents(classData));
        } catch (err) {
            console.error('Debate team name update failed', err);
            return false;
        }
        if (!renamed.changed || !renamed.sessionState) {
            return false;
        }
        eng.loadState(renamed.sessionState);
        if (canEdit()) {
            scheduleSave();
        }
        if (hooks && hooks.showToast) {
            hooks.showToast(t('classroomDebateNamesDisambiguated'), false);
        }
        return true;
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

    function canEditClassData(classData) {
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

    function ensureHooks(h) {
        if (h) {
            hooks = h;
        }
        return !!hooks;
    }

    /**
     * Generate (or reuse) debate teams for a class+date and persist like the Debate Teams tab.
     * Used by Homework Copy assign when Day 3 homework is present.
     */
    async function buildAndPersistForHomework(options) {
        options = options || {};
        if (options.hooks) {
            ensureHooks(options.hooks);
        }
        const targetClassId = String(options.classId || '').trim();
        const targetDate = String(options.date || '').trim();
        if (!targetClassId || !targetDate) {
            return { ok: false, reason: 'missing' };
        }
        if (!hooks) {
            return { ok: false, reason: 'hooks' };
        }
        if (!(await ensureCoreReady())) {
            return { ok: false, reason: 'core' };
        }
        const eng = engine();
        const d = domain();
        if (!eng || !d || !eng.collectState || !eng.loadState || !eng.importRoster) {
            return { ok: false, reason: 'core' };
        }
        if (!eng.generateDebatesSilent) {
            return { ok: false, reason: 'core' };
        }

        const data = getAppData();
        const classData = (data.classes || []).find((c) => c && c.id === targetClassId) || null;
        if (!classData) {
            return { ok: false, reason: 'class' };
        }
        if (!canEditClassData(classData)) {
            return { ok: false, reason: 'readonly' };
        }

        const periodKey =
            typeof d.debateAssignmentPeriodKey === 'function'
                ? d.debateAssignmentPeriodKey(classData, targetDate)
                : '';
        const liveShowsPeriod = () =>
            classId === targetClassId &&
            !!sessionKey() &&
            hydratedSessionKey === sessionKey() &&
            (currentPeriodKey() || sessionDate) === (periodKey || targetDate);

        // Unsaved edits in the open tab for this period go to the store first, so the copy sees them.
        if (liveShowsPeriod()) {
            await flushBeforeLeave();
        }

        const lookupPeriodSession = () => {
            const sessions = getAppData().debateTeamSessions;
            if (periodKey && typeof d.findDebateTeamSessionForAssignment === 'function') {
                return d.findDebateTeamSessionForAssignment(sessions, classData, periodKey);
            }
            return d.findDebateTeamSession(sessions, targetClassId, targetDate, classData);
        };
        const periodSession = lookupPeriodSession();

        if (
            periodSession &&
            periodSession.sessionState &&
            Array.isArray(periodSession.sessionState.debates) &&
            periodSession.sessionState.debates.length > 0
        ) {
            const sourceDate = String(periodSession.date || targetDate).trim();
            const expectedTpl = resolveSheetTemplateForClass(classData, sourceDate);
            const currentTpl = d.normalizeDebateSheetTemplate
                ? d.normalizeDebateSheetTemplate(periodSession.sessionState.sheetTemplate)
                : periodSession.sessionState.sheetTemplate === 'yeoul'
                  ? 'yeoul'
                  : 'garam';
            let sessionState = periodSession.sessionState;
            const renamed = applyDisambiguatedNames(sessionState, classRosterStudents(classData));
            const namesChanged = !!(renamed.changed && renamed.sessionState);
            if (namesChanged) {
                sessionState = renamed.sessionState;
            }
            const tplChanged = expectedTpl !== currentTpl;
            if (tplChanged) {
                sessionState = Object.assign({}, sessionState, { sheetTemplate: expectedTpl });
            }
            let entry = periodSession;
            if (namesChanged || tplChanged) {
                entry = Object.assign({}, periodSession, {
                    sessionState,
                    periodKey: periodKey || periodSession.periodKey || undefined,
                    updatedAt: new Date().toISOString()
                });
                const nextSessions = d.upsertDebateTeamSession(getAppData().debateTeamSessions, entry);
                if (hooks.saveClassroom) {
                    await hooks.saveClassroom({ debateTeamSessions: nextSessions });
                }
                if (liveShowsPeriod()) {
                    await reloadSessionFromStore({ skipFlush: true });
                }
            }
            return {
                ok: true,
                reused: true,
                entry,
                sessionState
            };
        }

        const names = rosterStudentEntriesForClass(classData);
        if (!names.length) {
            return { ok: false, reason: 'empty' };
        }
        if (!eng.runDetached) {
            return { ok: false, reason: 'core' };
        }

        let built;
        try {
            // Synchronous: the live tab's engine state is restored before any await.
            built = eng.runDetached(() => {
                const imported = eng.importRoster(names, { confirm: false, clearDebates: true });
                if (!imported || !imported.ok) {
                    return { ok: false, reason: (imported && imported.reason) || 'import' };
                }
                const title = String(classData.name || classData.displayName || '').trim();
                if (eng.applyMetadataDefaults) {
                    eng.applyMetadataDefaults(title, getHomeroomLabel(classData), { force: true });
                }
                if (eng.applyClassFormatDefaults) {
                    eng.applyClassFormatDefaults(classData, {
                        debateBook: bookForClassDate(classData, targetDate),
                        forceForNewSession: true
                    });
                }
                const gen = eng.generateDebatesSilent({ replace: true, notify: false, render: false });
                if (!gen.ok) {
                    return { ok: false, reason: gen.reason || 'generate', detail: gen };
                }
                return { ok: true, appState: eng.collectState() };
            });
        } catch (err) {
            console.error('buildAndPersistForHomework failed', err);
            return { ok: false, reason: 'error', error: err };
        }
        if (!built || !built.ok) {
            return built || { ok: false, reason: 'generate' };
        }

        const appState = built.appState;
        const sessionState = Object.assign({}, appState, { studentsManual: false });
        stampStudentIdsOnSessionState(sessionState, classData);
        const nameMap = buildNameMap(classData);
        const studentIds = (appState.students || []).map((name) => nameMap[name]).filter(Boolean);

        const assignment =
            typeof d.findDebateAssignmentForDate === 'function'
                ? d.findDebateAssignmentForDate(classData, targetDate, {
                      scheduledLessons: getScheduledLessonsForClass(classData),
                      debateTeamSessions: getAppData().debateTeamSessions
                  })
                : null;
        // A period row may exist without teams (e.g. opened but never generated); fill it in place.
        const emptyPeriodSession = lookupPeriodSession();
        const entry = {
            id: emptyPeriodSession && emptyPeriodSession.id ? emptyPeriodSession.id : d.newId('dts'),
            classId: targetClassId,
            date:
                (emptyPeriodSession && emptyPeriodSession.date) ||
                (assignment && assignment.date) ||
                targetDate,
            periodKey: periodKey || undefined,
            sessionState: sessionState,
            studentIds: studentIds,
            authorUserId: hooks.getCurrentUserId ? hooks.getCurrentUserId() : '',
            updatedAt: new Date().toISOString()
        };
        const nextSessions = d.upsertDebateTeamSession(getAppData().debateTeamSessions, entry);
        if (hooks.saveClassroom) {
            await hooks.saveClassroom({ debateTeamSessions: nextSessions });
        }
        if (liveShowsPeriod()) {
            await reloadSessionFromStore({ skipFlush: true });
        }
        return { ok: true, reused: false, entry: entry, sessionState: sessionState };
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
        stampStudentIdsOnSessionState(sessionState);
        rebuildNameMap();
        const studentIds = (appState.students || [])
            .map((name) => nameToStudentId[name])
            .filter(Boolean);
        const data = getAppData();
        const existing = findStoredSession();
        const periodKey = currentPeriodKey();
        const entry = {
            id: existing && existing.id ? existing.id : d.newId('dts'),
            classId,
            date: existing && existing.date ? existing.date : sessionDate,
            periodKey: periodKey || undefined,
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
                void importFromRoster({ confirm: false, allowViewOnly: true, clearDebates: true }).then(() => {
                    const data = hooks && hooks.getAppData ? hooks.getAppData() : global.appData;
                    if (!data) {
                        return;
                    }
                    if (!data.meta || typeof data.meta !== 'object') {
                        data.meta = {};
                    }
                    if (!data.meta.versions) {
                        data.meta.versions = { lessons: 0, syllabus: 0, roster: 0 };
                    }
                    data.meta.debateRosterBuiltFrom = Number(data.meta.versions.roster) || 0;
                });
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

        let nextDate =
            options.date ||
            (typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.get().sessionDate) ||
            (data.ui && data.ui.classroomTabDate) ||
            (d ? d.todayISO() : '');

        const classData = getClassData();
        if (d && classData && d.classUsesDebateTeamAssignments && d.classUsesDebateTeamAssignments(classData)) {
            const resolved = resolveDebateAssignmentDate(classData, nextDate);
            if (resolved) {
                // Assignment date stays local to the debate tabs — never pushed into the
                // global sessionDate (that jumped Attendance/Homework dates).
                nextDate = resolved;
            }
        }
        sessionDate = nextDate;
    }

    function subscribeContext() {
        if (contextSubscribed || !global.CCPActiveContext) {
            return;
        }
        contextSubscribed = true;
        if (global.CCPAssignments && global.CCPAssignments.subscribe) {
            global.CCPAssignments.subscribe(onSharedAssignmentChanged);
        }
        global.CCPActiveContext.subscribe((detail) => {
            const panel = panelRef || document.getElementById('panel-debate-teams');
            if (!panel || panel.hidden) {
                return;
            }
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
        applyDisambiguatedNamesToOpenSession();
        updateSidebarMeta();
        setEditEnabled(panel, canEdit());
        syncShellToolbar(
            !!(engine() && engine().collectState && engine().collectState().debates.length)
        );
    }

    function rosterHasAssignments() {
        return studentsListTouchedByUser === true;
    }

    function getContext() {
        return { classId, sessionDate, periodKey: currentPeriodKey() };
    }

    global.CCPClassroomDebateTeams = {
        initTab,
        getContext,
        render,
        flushBeforeLeave,
        importFromRoster,
        refreshIfActive,
        reloadSessionFromStore,
        ensureHooks,
        buildAndPersistForHomework,
        rosterHasAssignments,
        resolveSheetTemplateForClass,
        formatDebateStudentLabel,
        applyDisambiguatedNames
    };
})(typeof window !== 'undefined' ? window : globalThis);
