/**
 * Unified teaching context: active class, cohort, and session date per user.
 */
(function (global) {
    const EVENT_NAME = 'ccp:activeContextChanged';
    const MIGRATE_FLAG_PREFIX = 'ccpActiveContextMigrated:';
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

    function syncUiMirror(ctx) {
        if (typeof global.appData === 'undefined' || !global.appData.ui) {
            return;
        }
        if (typeof global.ensureUiState === 'function') {
            global.ensureUiState();
        }
        const ui = global.appData.ui;
        if (ctx.classId !== undefined) {
            ui.homeworkTabClassId = ctx.classId || '';
            ui.classroomTabClassId = ctx.classId || '';
        }
        if (ctx.cohortId !== undefined) {
            ui.cohortsTabSelectedId = ctx.cohortId || '';
        }
        if (ctx.sessionDate !== undefined) {
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
        syncUiMirror(next);
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

    function hydrateUiFromStorage(ui) {
        if (!ui || typeof ui !== 'object') {
            return get();
        }
        migrateLegacy(ui);
        const ctx = get();
        if (ctx.classId) {
            ui.homeworkTabClassId = ctx.classId;
            ui.classroomTabClassId = ctx.classId;
        }
        if (ctx.cohortId) {
            ui.cohortsTabSelectedId = ctx.cohortId;
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
        const patch = {};
        if (!ctx.sessionDate) {
            patch.sessionDate = formatTodayIso();
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

    function setFromClass(appData, classId, sessionDate, source) {
        const cohortId = deriveCohortIdFromClass(appData, classId);
        const patch = { classId, sessionDate };
        if (cohortId) {
            patch.cohortId = cohortId;
        }
        return set(patch, { source: source || 'class' });
    }

    global.CCPActiveContext = {
        EVENT_NAME,
        get,
        set,
        subscribe,
        migrateLegacy,
        hydrateUiFromStorage,
        resolveDefaults,
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
