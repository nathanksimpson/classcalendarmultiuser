/**
 * Header "All classes / My classes" scope (per teacher, follows across calendars).
 *
 * - Source of truth: server pref `classScope` (GET/PUT /api/me/ui-prefs).
 * - Local cache: localStorage['ccp.classScope.v1:<userId>'] for instant first paint.
 * - Per-screen overrides live in appData.ui.classScopeOverrides (UI-only, no lock).
 *   A screen's effective value is its override when set, otherwise header === 'mine'.
 *   Any header change clears every override.
 */
(function (global) {
    'use strict';

    const SCOPE_ALL = 'all';
    const SCOPE_MINE = 'mine';
    const SCOPES = [SCOPE_ALL, SCOPE_MINE];
    const SCREENS = ['classroom', 'homework', 'notes', 'debateBooksSummary'];
    const CACHE_PREFIX = 'ccp.classScope.v1:';
    const CHANGE_EVENT = 'ccp:classScopeChanged';
    const PUT_DEBOUNCE_MS = 500;

    let hooks = {};
    let scope = SCOPE_ALL;
    let putTimer = null;
    const listeners = new Set();

    function normalizeScope(value) {
        return SCOPES.includes(value) ? value : null;
    }

    function cacheKey(userId) {
        return CACHE_PREFIX + String(userId || '');
    }

    function getUserId() {
        try {
            return typeof hooks.getUserId === 'function' ? String(hooks.getUserId() || '') : '';
        } catch (_) {
            return '';
        }
    }

    function getStorage() {
        if (hooks.storage) {
            return hooks.storage;
        }
        try {
            return global.localStorage || null;
        } catch (_) {
            return null;
        }
    }

    function readCache(userId) {
        const store = getStorage();
        if (!store) {
            return null;
        }
        try {
            return normalizeScope(store.getItem(cacheKey(userId)));
        } catch (_) {
            return null;
        }
    }

    function writeCache(userId, value) {
        const store = getStorage();
        if (!store) {
            return;
        }
        try {
            store.setItem(cacheKey(userId), value);
        } catch (_) {
            /* quota / private mode */
        }
    }

    function getUi() {
        const data = typeof hooks.getAppData === 'function' ? hooks.getAppData() : null;
        if (!data || typeof data !== 'object') {
            return null;
        }
        if (!data.ui || typeof data.ui !== 'object') {
            data.ui = {};
        }
        return data.ui;
    }

    function readOverrides() {
        const ui = getUi();
        const raw = ui && ui.classScopeOverrides;
        return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    }

    function persistUi() {
        if (typeof hooks.persistUi === 'function') {
            try {
                hooks.persistUi();
            } catch (err) {
                console.warn('class scope: persistUi failed', err);
            }
        }
    }

    function emit(detail) {
        listeners.forEach((fn) => {
            try {
                fn(detail);
            } catch (err) {
                console.error('class scope listener failed', err);
            }
        });
        if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
            global.dispatchEvent(new global.CustomEvent(CHANGE_EVENT, { detail }));
        }
    }

    function schedulePut() {
        if (typeof hooks.saveRemote !== 'function') {
            return;
        }
        if (putTimer) {
            clearTimeout(putTimer);
        }
        putTimer = setTimeout(() => {
            putTimer = null;
            flushPut();
        }, PUT_DEBOUNCE_MS);
    }

    function flushPut() {
        if (typeof hooks.saveRemote !== 'function') {
            return Promise.resolve(null);
        }
        try {
            return Promise.resolve(hooks.saveRemote({ classScope: scope })).catch((err) => {
                console.warn('class scope: save failed', err);
                return null;
            });
        } catch (err) {
            console.warn('class scope: save failed', err);
            return Promise.resolve(null);
        }
    }

    function legacyFlagIsMine(value) {
        return value === true || value === '1';
    }

    function readDebateBooksLegacy(ui) {
        const raw = ui.debateBookClassSummaryFilters;
        let parsed = raw;
        if (typeof raw === 'string' && raw.trim()) {
            try {
                parsed = JSON.parse(raw);
            } catch (_) {
                parsed = null;
            }
        }
        return Boolean(parsed && typeof parsed === 'object' && parsed.myClassesOnly === true);
    }

    function readLegacyScreenValues(ui) {
        return {
            classroom: legacyFlagIsMine(ui.classroomZoneMyClassesOnly),
            homework: Boolean(ui.homeworkFilters && ui.homeworkFilters.myClassesOnly === true),
            notes: Boolean(ui.classNotesFilters && ui.classNotesFilters.myClassesOnly === true),
            debateBooksSummary: readDebateBooksLegacy(ui)
        };
    }

    /**
     * First load of a calendar under Phase 6: a screen whose saved "My classes only"
     * box was on while the header says All becomes an override for that screen.
     */
    function seedOverrides() {
        const ui = getUi();
        if (!ui || readOverrides()) {
            return false;
        }
        const headerMine = scope === SCOPE_MINE;
        const legacy = readLegacyScreenValues(ui);
        const seeded = {};
        SCREENS.forEach((screenId) => {
            if (legacy[screenId] === true && !headerMine) {
                seeded[screenId] = true;
            }
        });
        ui.classScopeOverrides = seeded;
        persistUi();
        return true;
    }

    function get() {
        return scope;
    }

    function set(value, options = {}) {
        const next = normalizeScope(value);
        if (!next) {
            return false;
        }
        const previous = scope;
        const overrides = readOverrides();
        const hadOverrides = Boolean(overrides && Object.keys(overrides).length);
        scope = next;
        writeCache(getUserId(), next);
        clearOverrides();
        schedulePut();
        if (previous !== next || hadOverrides) {
            emit({ scope: next, previous, source: options.source || 'user' });
        }
        return previous !== next;
    }

    function subscribe(fn) {
        if (typeof fn !== 'function') {
            return () => {};
        }
        listeners.add(fn);
        return () => listeners.delete(fn);
    }

    function getAssignedClassIds() {
        if (typeof hooks.getClassIdsAssignedToViewer !== 'function') {
            return null;
        }
        const ids = hooks.getClassIdsAssignedToViewer();
        return Array.isArray(ids) ? ids : null;
    }

    function hasAssignedClasses() {
        const ids = getAssignedClassIds();
        return Boolean(ids && ids.length);
    }

    function isMine(classData) {
        const id = classData && typeof classData === 'object' ? classData.id : classData;
        if (id == null || id === '') {
            return false;
        }
        const ids = getAssignedClassIds();
        return Boolean(ids && ids.some((x) => String(x) === String(id)));
    }

    function hasOverride(screenId) {
        const overrides = readOverrides();
        return Boolean(overrides && typeof overrides[screenId] === 'boolean');
    }

    function effectiveMine(screenId) {
        const overrides = readOverrides();
        if (overrides && typeof overrides[screenId] === 'boolean') {
            return overrides[screenId];
        }
        return scope === SCOPE_MINE;
    }

    function setOverride(screenId, value) {
        const ui = getUi();
        if (!ui || !screenId) {
            return;
        }
        const overrides = Object.assign({}, readOverrides() || {});
        const mine = value === true;
        if (mine === (scope === SCOPE_MINE)) {
            delete overrides[screenId];
        } else {
            overrides[screenId] = mine;
        }
        ui.classScopeOverrides = overrides;
        persistUi();
    }

    function clearOverrides() {
        const ui = getUi();
        if (!ui) {
            return;
        }
        ui.classScopeOverrides = {};
        persistUi();
    }

    /** Shows "differs from header" next to a local My-classes checkbox while its override is active. */
    function syncOverrideHint(inputEl, screenId, text) {
        const anchor = inputEl ? inputEl.closest('label') || inputEl : null;
        const parent = anchor && anchor.parentElement;
        if (!parent) {
            return;
        }
        let hint = parent.querySelector(`[data-class-scope-hint="${screenId}"]`);
        if (!hasOverride(screenId)) {
            if (hint) {
                hint.remove();
            }
            return;
        }
        if (!hint) {
            hint = anchor.ownerDocument.createElement('span');
            hint.className = 'section-hint classroom-zone-override-hint';
            hint.setAttribute('data-class-scope-hint', screenId);
            anchor.insertAdjacentElement('afterend', hint);
        }
        hint.textContent = text || '';
    }

    /** Reads the local cache for the signed-in teacher. Call again after sign-in changes. */
    function init(nextHooks) {
        hooks = Object.assign({}, hooks, nextHooks || {});
        const cached = readCache(getUserId());
        if (cached) {
            scope = cached;
        }
        return scope;
    }

    /**
     * Reconcile with the server. Server wins when it has a value; when it is null,
     * migrate once from the current calendar's classroomZoneMyClassesOnly.
     */
    async function syncFromServer() {
        if (typeof hooks.loadRemote !== 'function') {
            seedOverrides();
            return scope;
        }
        let remote = null;
        try {
            remote = await hooks.loadRemote();
        } catch (err) {
            console.warn('class scope: load failed', err);
            return scope;
        }
        if (!remote || typeof remote !== 'object') {
            seedOverrides();
            return scope;
        }
        const previous = scope;
        const serverScope = normalizeScope(remote.classScope);
        if (serverScope) {
            scope = serverScope;
        } else {
            const ui = getUi();
            scope = ui && legacyFlagIsMine(ui.classroomZoneMyClassesOnly) ? SCOPE_MINE : SCOPE_ALL;
            await flushPut();
        }
        writeCache(getUserId(), scope);
        seedOverrides();
        if (previous !== scope) {
            emit({ scope, previous, source: serverScope ? 'server' : 'migration' });
        }
        return scope;
    }

    global.CCPClassScope = {
        SCOPES: SCOPES.slice(),
        SCREENS: SCREENS.slice(),
        CACHE_PREFIX,
        CHANGE_EVENT,
        cacheKey,
        init,
        syncFromServer,
        seedOverrides,
        get,
        set,
        subscribe,
        isMine,
        hasAssignedClasses,
        effectiveMine,
        hasOverride,
        setOverride,
        clearOverrides,
        syncOverrideHint
    };
})(typeof window !== 'undefined' ? window : globalThis);
