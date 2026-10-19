/**
 * Shared assignment selection for Classroom tabs (CCPAssignments).
 * Kinds: 'debate' (Debate Teams + Debate Scores, one per month/book period) and 'essay'.
 * Selection lives in appData.ui.assignmentByKindClass[kind][classId] = assignment id.
 */
(function (global) {
    const KINDS = ['debate', 'essay'];
    const CHANGE_EVENT = 'ccp:assignmentChanged';
    const MIGRATED_FLAG = 'assignmentByKindClassMigrated';

    function domain() {
        return global.CCPClassroomDomain;
    }

    function str(v) {
        return v == null ? '' : String(v).trim();
    }

    function getAppData(appData) {
        if (appData && typeof appData === 'object') {
            return appData;
        }
        return typeof global.appData !== 'undefined' && global.appData ? global.appData : {};
    }

    /** Store + one-time copy from the old per-tab maps (debate dates, essay row ids). */
    function ensureStore(appData) {
        const data = getAppData(appData);
        if (!data.ui || typeof data.ui !== 'object') {
            data.ui = {};
        }
        const ui = data.ui;
        if (!ui.assignmentByKindClass || typeof ui.assignmentByKindClass !== 'object') {
            ui.assignmentByKindClass = {};
        }
        const store = ui.assignmentByKindClass;
        KINDS.forEach((kind) => {
            if (!store[kind] || typeof store[kind] !== 'object') {
                store[kind] = {};
            }
        });
        if (!ui[MIGRATED_FLAG]) {
            const legacy = [
                ['debate', ui.debateAssignmentByClassId],
                ['essay', ui.essayAssignmentByClassId]
            ];
            legacy.forEach(([kind, map]) => {
                if (!map || typeof map !== 'object') {
                    return;
                }
                Object.keys(map).forEach((classId) => {
                    const value = str(map[classId]);
                    if (value && !store[kind][classId]) {
                        store[kind][classId] = value;
                    }
                });
            });
            ui[MIGRATED_FLAG] = true;
        }
        return store;
    }

    function findSyllabusRow(classData, rowId) {
        const d = domain();
        const rows = Array.isArray(classData && classData.syllabusRows) ? classData.syllabusRows : [];
        return (
            rows.find((r) => r && (d && d.getSyllabusRowKey ? d.getSyllabusRowKey(r) : r.id) === rowId) ||
            null
        );
    }

    /** Custom essay assignments are trackEssay rows added by hand (no syllabus session number). */
    function isCustomEssayRow(row) {
        return !!(row && row.trackEssay === true && !row.sessionNumber && !row.lessonNumber);
    }

    function listDebate(classData, appData, opts) {
        const d = domain();
        if (!d || !classData || !d.listDebateTeamAssignmentsForClass) {
            return [];
        }
        return d.listDebateTeamAssignmentsForClass(classData, {
            scheduledLessons: Array.isArray(opts.scheduledLessons) ? opts.scheduledLessons : [],
            debateTeamSessions: appData.debateTeamSessions
        });
    }

    function listEssay(classData, appData) {
        const d = domain();
        if (!d || !classData || !d.listEssayAssignmentsForClass) {
            return [];
        }
        return d.listEssayAssignmentsForClass(classData, appData).map((row) => {
            const syllabusRow = findSyllabusRow(classData, row.syllabusRowId);
            return Object.assign({}, row, {
                id: row.syllabusRowId,
                date: row.lessonDate || '',
                label: row.assignmentLabel || '',
                custom: isCustomEssayRow(syllabusRow)
            });
        });
    }

    /**
     * @param {'debate'|'essay'} kind
     * @param {object} classData
     * @param {object} [appData]
     * @param {{ scheduledLessons?: object[] }} [opts]
     */
    function list(kind, classData, appData, opts) {
        const data = getAppData(appData);
        if (kind === 'debate') {
            return listDebate(classData, data, opts || {});
        }
        if (kind === 'essay') {
            return listEssay(classData, data);
        }
        return [];
    }

    function getSelected(kind, classId, appData) {
        const store = ensureStore(appData);
        return str(store[kind] && store[kind][str(classId)]);
    }

    function persistUi() {
        if (typeof global.saveUiStateToLocalStorage === 'function') {
            global.saveUiStateToLocalStorage();
        }
    }

    /**
     * Remember the assignment for kind+class and tell listeners.
     * @param {{ silent?: boolean, source?: string, appData?: object }} [options]
     */
    function select(kind, classId, id, options) {
        const opts = options || {};
        const cId = str(classId);
        const nextId = str(id);
        if (!KINDS.includes(kind) || !cId || !nextId) {
            return false;
        }
        const store = ensureStore(opts.appData);
        const changed = store[kind][cId] !== nextId;
        store[kind][cId] = nextId;
        if (changed) {
            persistUi();
        }
        if (changed && !opts.silent && typeof global.dispatchEvent === 'function') {
            const detail = { kind, classId: cId, id: nextId, source: opts.source || 'select' };
            try {
                global.dispatchEvent(new global.CustomEvent(CHANGE_EVENT, { detail }));
            } catch (_) {
                /* CustomEvent unavailable (tests) */
            }
        }
        return changed;
    }

    /** Current period (debate) or month (essay), else nearest. */
    function resolveDefault(kind, classData, appData, opts) {
        const d = domain();
        const o = opts || {};
        const data = getAppData(appData);
        if (!d || !classData) {
            return null;
        }
        const ref = str(o.refDate) || (d.todayISO ? d.todayISO() : '');
        if (kind === 'debate') {
            return d.pickDefaultDebateAssignment
                ? d.pickDefaultDebateAssignment(classData, ref, {
                      scheduledLessons: o.scheduledLessons || [],
                      debateTeamSessions: data.debateTeamSessions
                  })
                : null;
        }
        if (kind === 'essay') {
            const row = d.pickDefaultEssaySyllabusRow ? d.pickDefaultEssaySyllabusRow(classData, ref) : null;
            if (!row) {
                return null;
            }
            const rowId = d.getSyllabusRowKey(row);
            return list('essay', classData, data, o).find((a) => a.id === rowId) || null;
        }
        return null;
    }

    /**
     * The assignment a tab should show: saved choice when it still exists, else the default.
     * A legacy debate date maps to the assignment of its period.
     */
    function resolve(kind, classData, appData, opts) {
        const data = getAppData(appData);
        const o = opts || {};
        if (!classData || !classData.id) {
            return null;
        }
        const items = list(kind, classData, data, o);
        if (!items.length) {
            return null;
        }
        const saved = getSelected(kind, classData.id, data);
        let hit = saved ? items.find((a) => a.id === saved) || null : null;
        if (!hit && saved && kind === 'debate' && /^\d{4}-\d{2}-\d{2}$/.test(saved)) {
            const d = domain();
            hit = d && d.findDebateAssignmentForDate
                ? d.findDebateAssignmentForDate(classData, saved, {
                      scheduledLessons: o.scheduledLessons || [],
                      debateTeamSessions: data.debateTeamSessions
                  })
                : null;
        }
        if (!hit && o.preferDate && kind === 'debate') {
            const d = domain();
            hit = d && d.findDebateAssignmentForDate
                ? d.findDebateAssignmentForDate(classData, o.preferDate, {
                      scheduledLessons: o.scheduledLessons || [],
                      debateTeamSessions: data.debateTeamSessions
                  })
                : null;
        }
        if (!hit) {
            hit = resolveDefault(kind, classData, data, o) || items[items.length - 1];
        }
        if (hit && hit.id !== saved) {
            select(kind, classData.id, hit.id, { silent: true, appData: data });
        }
        return hit;
    }

    function subscribe(fn) {
        if (typeof fn !== 'function' || typeof global.addEventListener !== 'function') {
            return () => {};
        }
        const handler = (e) => fn((e && e.detail) || {});
        global.addEventListener(CHANGE_EVENT, handler);
        return () => {
            if (typeof global.removeEventListener === 'function') {
                global.removeEventListener(CHANGE_EVENT, handler);
            }
        };
    }

    global.CCPAssignments = {
        KINDS,
        CHANGE_EVENT,
        ensureStore,
        list,
        getSelected,
        select,
        resolve,
        resolveDefault,
        subscribe,
        isCustomEssayRow
    };
})(typeof window !== 'undefined' ? window : globalThis);
