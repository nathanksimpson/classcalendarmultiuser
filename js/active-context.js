/**
 * Unified teaching context: active class, cohort, and session date per user.
 */
(function (global) {
    const EVENT_NAME = 'ccp:activeContextChanged';
    const MIGRATE_FLAG_PREFIX = 'ccpActiveContextMigrated:';
    /** Clears cohort filters that were auto-set from class picks (pre-opt-in era). */
    const CLEAR_AUTO_COHORT_FLAG_PREFIX = 'ccpClearedAutoCohortFilter:';
    const subscribers = new Set();
    let storageListenerBound = false;

    function isFileProtocol() {
        return typeof location !== 'undefined' && location.protocol === 'file:';
    }

    function getUserId() {
        if (isFileProtocol()) {
            return null;
        }
        if (typeof global.CCPSessionRestore !== 'undefined' && global.CCPSessionRestore.getSessionUserId) {
            return global.CCPSessionRestore.getSessionUserId();
        }
        return null;
    }

    function storageKeys(userId) {
        return {
            classId: `ccpActiveClassId:${userId}`,
            cohortId: `ccpActiveCohortId:${userId}`,
            sessionDate: `ccpActiveSessionDate:${userId}`
        };
    }

    function emptyContext() {
        return { classId: '', cohortId: '', sessionDate: '' };
    }

    function readStorage(userId) {
        if (!userId || typeof localStorage === 'undefined') {
            return emptyContext();
        }
        const k = storageKeys(userId);
        return {
            classId: localStorage.getItem(k.classId) || '',
            cohortId: localStorage.getItem(k.cohortId) || '',
            sessionDate: localStorage.getItem(k.sessionDate) || ''
        };
    }

    function writeStorage(userId, ctx) {
        if (!userId || typeof localStorage === 'undefined') {
            return;
        }
        const k = storageKeys(userId);
        ['classId', 'cohortId', 'sessionDate'].forEach((field) => {
            const val = ctx[field] == null ? '' : String(ctx[field]).trim();
            if (val) {
                localStorage.setItem(k[field], val);
            } else {
                localStorage.removeItem(k[field]);
            }
        });
    }

    function syncUiMirror(ctx, patch) {
        if (typeof global.appData === 'undefined' || !global.appData.ui) {
            return;
        }
        if (typeof global.ensureUiState === 'function') {
            global.ensureUiState();
        }
        const ui = global.appData.ui;
        const fullMirror = !patch;
        if (fullMirror || patch.classId !== undefined) {
            ui.homeworkTabClassId = ctx.classId || '';
            ui.classroomTabClassId = ctx.classId || '';
        }
        if (fullMirror || patch.cohortId !== undefined) {
            ui.cohortsTabSelectedId = ctx.cohortId || '';
        }
        const mirrorSessionDate = fullMirror || patch.sessionDate !== undefined;
        if (mirrorSessionDate && ctx.sessionDate !== undefined) {
            ui.classroomTabDate = ctx.sessionDate || '';
            ui.homeworkReferenceDate = ctx.sessionDate || '';
        }
    }

    function dispatch(detail) {
        if (typeof global.dispatchEvent === 'function') {
            global.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
        }
        subscribers.forEach((fn) => {
            try {
                fn(detail);
            } catch (_) {
                /* ignore subscriber errors */
            }
        });
    }

    function get() {
        return readStorage(getUserId());
    }

    function set(patch, options) {
        options = options || {};
        const userId = getUserId();
        const prev = readStorage(userId);
        const next = {
            classId: patch.classId !== undefined ? String(patch.classId || '').trim() : prev.classId,
            cohortId: patch.cohortId !== undefined ? String(patch.cohortId || '').trim() : prev.cohortId,
            sessionDate:
                patch.sessionDate !== undefined ? String(patch.sessionDate || '').trim() : prev.sessionDate
        };
        writeStorage(userId, next);
        syncUiMirror(next, patch);
        if (typeof global.saveUiStateToLocalStorage === 'function') {
            global.saveUiStateToLocalStorage();
        }
        const detail = Object.assign({}, next, { source: options.source || '', prev });
        dispatch(detail);
        return next;
    }

    function migrateLegacy(ui) {
        const userId = getUserId();
        if (!userId || typeof localStorage === 'undefined') {
            return;
        }
        const flag = MIGRATE_FLAG_PREFIX + userId;
        if (localStorage.getItem(flag) === '1') {
            return;
        }
        const current = readStorage(userId);
        const legacy = {
            classId: (ui && ui.homeworkTabClassId) || (ui && ui.classroomTabClassId) || '',
            cohortId: (ui && ui.cohortsTabSelectedId) || '',
            sessionDate: (ui && ui.classroomTabDate) || (ui && ui.homeworkReferenceDate) || ''
        };
        const merged = {
            classId: current.classId || legacy.classId || '',
            cohortId: current.cohortId || legacy.cohortId || '',
            sessionDate: current.sessionDate || legacy.sessionDate || ''
        };
        writeStorage(userId, merged);
        localStorage.setItem(flag, '1');
    }

    /**
     * One-time: drop mystery cohort filters left by older setFromClass behavior.
     * Intentional Cohorts-board filters set after this flag still persist.
     */
    function clearStaleAutoCohortFilter() {
        const userId = getUserId();
        if (!userId || typeof localStorage === 'undefined') {
            return;
        }
        const flag = CLEAR_AUTO_COHORT_FLAG_PREFIX + userId;
        if (localStorage.getItem(flag) === '1') {
            return;
        }
        const ctx = readStorage(userId);
        if (ctx.cohortId) {
            writeStorage(userId, Object.assign({}, ctx, { cohortId: '' }));
            if (typeof global.appData !== 'undefined' && global.appData.ui) {
                global.appData.ui.cohortsTabSelectedId = '';
            }
        }
        localStorage.setItem(flag, '1');
    }

    function hydrateUiFromStorage(ui) {
        if (!ui || typeof ui !== 'object') {
            return get();
        }
        migrateLegacy(ui);
        clearStaleAutoCohortFilter();
        const ctx = get();
        if (ctx.classId) {
            ui.homeworkTabClassId = ctx.classId;
            ui.classroomTabClassId = ctx.classId;
        }
        if (ctx.cohortId) {
            ui.cohortsTabSelectedId = ctx.cohortId;
        } else {
            ui.cohortsTabSelectedId = '';
        }
        if (ctx.sessionDate) {
            ui.classroomTabDate = ctx.sessionDate;
            ui.homeworkReferenceDate = ctx.sessionDate;
        }
        return ctx;
    }

    function formatTodayIso() {
        if (typeof global.CCPClassroomDomain !== 'undefined' && global.CCPClassroomDomain.todayISO) {
            return global.CCPClassroomDomain.todayISO();
        }
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function resolveDefaults(appData) {
        const ctx = get();
        const today = formatTodayIso();
        const patch = {};
        // Always land on today at boot so Homework / Classroom / Command Center
        // open on the current working day after login or full reload.
        if (ctx.sessionDate !== today) {
            patch.sessionDate = today;
        }
        if (!ctx.classId && appData && Array.isArray(appData.classes) && appData.classes.length === 1) {
            patch.classId = appData.classes[0].id;
        }
        if (Object.keys(patch).length) {
            return set(patch, { source: 'resolveDefaults' });
        }
        return ctx;
    }

    function subscribe(fn) {
        if (typeof fn !== 'function') {
            return () => {};
        }
        subscribers.add(fn);
        bindStorageListener();
        return () => subscribers.delete(fn);
    }

    function bindStorageListener() {
        if (storageListenerBound || typeof global.addEventListener !== 'function') {
            return;
        }
        storageListenerBound = true;
        global.addEventListener('storage', (e) => {
            const userId = getUserId();
            if (!userId || !e.key || !String(e.key).includes(userId)) {
                return;
            }
            const ctx = get();
            syncUiMirror(ctx);
            dispatch(Object.assign({}, ctx, { source: 'storage' }));
        });
    }

    function deriveCohortIdFromClass(appData, classId) {
        if (!classId || !appData) {
            return '';
        }
        const cls = (appData.classes || []).find((c) => c && c.id === classId);
        if (!cls) {
            return '';
        }
        if (Array.isArray(cls.cohortIds) && cls.cohortIds.length) {
            return cls.cohortIds[0];
        }
        return cls.cohortId || '';
    }

    /**
     * Select a class (and optional session date) without enabling a cohort list filter.
     * Cohort filter is opt-in via Cohorts board / explicit set({ cohortId }).
     */
    function setFromClass(appData, classId, sessionDate, source) {
        void appData;
        const patch = { classId };
        if (sessionDate !== undefined) {
            patch.sessionDate = sessionDate;
        }
        return set(patch, { source: source || 'class' });
    }

    function resolveActiveClassId(appData, options) {
        options = options || {};
        const visible = Array.isArray(options.visibleClasses) ? options.visibleClasses : null;
        const fromOptions = options.classId != null ? String(options.classId || '').trim() : '';
        if (fromOptions && (!visible || visible.some((c) => c && c.id === fromOptions))) {
            return fromOptions;
        }
        const ctxId = get().classId || '';
        if (ctxId && (!visible || visible.some((c) => c && c.id === ctxId))) {
            return ctxId;
        }
        const ui = appData && appData.ui ? appData.ui : {};
        const uiId = ui.classroomTabClassId || ui.homeworkTabClassId || '';
        if (uiId && (!visible || visible.some((c) => c && c.id === uiId))) {
            return uiId;
        }
        if (visible && visible.length) {
            return visible[0].id || '';
        }
        const classes = appData && Array.isArray(appData.classes) ? appData.classes : [];
        return classes[0] && classes[0].id ? classes[0].id : '';
    }

    global.CCPActiveContext = {
        EVENT_NAME,
        get,
        set,
        subscribe,
        migrateLegacy,
        clearStaleAutoCohortFilter,
        hydrateUiFromStorage,
        resolveDefaults,
        resolveActiveClassId,
        deriveCohortIdFromClass,
        setFromClass,
        getActiveClassId() {
            return get().classId;
        },
        getActiveCohortId() {
            return get().cohortId;
        },
        getActiveSessionDate() {
            return get().sessionDate;
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
