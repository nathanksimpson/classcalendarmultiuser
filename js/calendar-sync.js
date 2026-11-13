/**
 * Team calendar sync — talks to /api on the same host as this page.
 */
(function (global) {
    const API = '/api';
    const STORAGE_ACTIVE = 'teamCalendarActiveId';
    const SAVE_DEBOUNCE_MS = 1500;
    // Editing poll. Was 3000; each poll runs several database reads on the Worker.
    const POLL_INTERVAL_ACTIVE_MS = 8000;
    const POLL_INTERVAL_IDLE_MS = 15000;
    const POLL_INTERVAL_NOTES_MS = 6000;
    /** No click, tap, key or scroll for this long = poll at the idle rate. */
    const POLL_USER_IDLE_AFTER_MS = 2 * 60 * 1000;
    /** First poll after the person comes back from idle. */
    const POLL_RESUME_DELAY_MS = 500;
    const POLL_INTERVAL_HIDDEN_MS = 60000;
    const POLL_INTERVAL_MAX_MS = 60000;
    const POLL_BACKOFF_FACTOR = 1.5;
    const SAVE_RETRY_BASE_MS = 2000;
    const SAVE_RETRY_MAX_MS = 60000;
    const SAVE_RETRY_FACTOR = 2;
    const LOCK_DEBUG_STORAGE = 'teamLockDebug';
    const LOCK_DEBUG_LOG_MAX = 100;
    const API_FETCH_TIMEOUT_MS = 30000;

    const state = {
        revision: 0,
        remoteNewer: false,
        activeCalendarId: null,
        saveTimer: null,
        pollTimer: null,
        pollBackoffFactor: 1,
        pollVisibilityBound: false,
        pollInputBound: false,
        pollResumeSoon: false,
        lastUserInputAt: Date.now(),
        saving: false,
        pendingGetData: null,
        saveRetryTimer: null,
        saveRetryBackoffMs: SAVE_RETRY_BASE_MS,
        mutationSource: null,
        readOnly: false,
        canEdit: true,
        canSuggest: false,
        accessLevel: 'editor',
        permissionReadOnly: false,
        lock: null,
        holdsLock: false,
        simulatedLock: false,
        pendingEditRequest: false,
        lockStaleMinutes: 20,
        lockExpiresAt: null,
        viewers: [],
        pendingSuggestions: 0,
        navNotificationActiveDays: 14,
        navNotificationDismissedDays: 3,
        notificationMeta: {},
        syncStatus: 'idle',
        // Live sync (see "Live sync" below)
        base: null,
        baseCalendarId: null,
        liveSource: null,
        saveAgain: false,
        pulling: false,
        deferredPull: false,
        livePagehideBound: false
    };

    let handlers = {
        onStatusChange: null,
        onRemoteNewer: null,
        onConflict: null,
        onClassroomConflict: null,
        onLockChange: null,
        onLockOrRevisionChange: null,
        onLockDebugChange: null,
        onDuplicateName: null,
        onSaved: null,
        onPrepareLogout: null,
        onNotificationMetaLoaded: null,
        onQueueChange: null,
        onOfflineQueued: null,
        // Live sync: (keys, 'save' | 'incoming') when the same thing changed in two places.
        onOverwritten: null,
        // Live sync: (fields) changes to areas this person may not edit were put back.
        onDenied: null,
        // Live sync: () => { key, label } — what this page is editing right now.
        getEditFocus: null,
        onLiveTick: null
    };

    const lockDebug = {
        enabled: false,
        log: []
    };

    function initLockDebugFromUrl() {
        try {
            const params = new URLSearchParams(location.search);
            if (params.get('lockDebug') === '1' || params.get('lockDebug') === 'true') {
                localStorage.setItem(LOCK_DEBUG_STORAGE, '1');
            }
            lockDebug.enabled = localStorage.getItem(LOCK_DEBUG_STORAGE) === '1';
        } catch (_) {
            lockDebug.enabled = false;
        }
    }

    initLockDebugFromUrl();

    function lockDebugEnabled() {
        return lockDebug.enabled;
    }

    function setLockDebugEnabled(on) {
        lockDebug.enabled = Boolean(on);
        try {
            if (lockDebug.enabled) {
                localStorage.setItem(LOCK_DEBUG_STORAGE, '1');
            } else {
                localStorage.removeItem(LOCK_DEBUG_STORAGE);
            }
        } catch (_) {
            /* ignore */
        }
        debugLog('debug', lockDebug.enabled ? 'Lock debug enabled' : 'Lock debug disabled');
        notifyLockDebugChange();
    }

    function clearLockDebugLog() {
        lockDebug.log = [];
        notifyLockDebugChange();
    }

    function notifyLockDebugChange() {
        if (typeof handlers.onLockDebugChange === 'function') {
            handlers.onLockDebugChange();
        }
    }

    function debugLog(kind, message, detail) {
        if (!lockDebug.enabled) {
            return;
        }
        const entry = {
            at: new Date().toISOString(),
            kind: kind || 'info',
            message: message || '',
            detail: detail != null ? detail : undefined
        };
        lockDebug.log.push(entry);
        if (lockDebug.log.length > LOCK_DEBUG_LOG_MAX) {
            lockDebug.log.splice(0, lockDebug.log.length - LOCK_DEBUG_LOG_MAX);
        }
        const line = '[LockSync] ' + entry.kind + ': ' + entry.message;
        if (detail !== undefined) {
            console.log(line, detail);
        } else {
            console.log(line);
        }
        notifyLockDebugChange();
    }

    function lockSnapshot(extra) {
        const me =
            typeof TeamAuth !== 'undefined' && TeamAuth.getUser && TeamAuth.getUser()
                ? TeamAuth.getUser()
                : null;
        const snap = {
            at: new Date().toISOString(),
            calendarId: state.activeCalendarId || (function () {
                try {
                    return localStorage.getItem(STORAGE_ACTIVE);
                } catch (_) {
                    return null;
                }
            })(),
            userId: me && me.id,
            userEmail: me && me.email,
            userRole: me && me.role,
            revision: state.revision,
            remoteNewer: state.remoteNewer,
            saving: state.saving,
            readOnly: state.readOnly,
            holdsLock: state.holdsLock,
            pendingEditRequest: state.pendingEditRequest,
            lockStaleMinutes: state.lockStaleMinutes,
            lock: state.lock
                ? {
                      holderUserId: state.lock.holderUserId,
                      holderName: state.lock.holderName,
                      holderEmail: state.lock.holderEmail,
                      updatedAt: state.lock.updatedAt,
                      pendingRequester: state.lock.pendingRequester
                          ? {
                                userId: state.lock.pendingRequester.userId,
                                displayName: state.lock.pendingRequester.displayName
                            }
                          : null
                  }
                : null
        };
        if (extra) {
            Object.assign(snap, extra);
        }
        return snap;
    }

    function redirectToLogin() {
        if (typeof CCPApi !== 'undefined' && CCPApi.redirectToLogin) {
            CCPApi.redirectToLogin();
            return;
        }
        const ret = encodeURIComponent(location.pathname + location.search);
        location.replace('/login.html?return=' + ret);
    }

    function assertSignedIn() {
        if (typeof TeamAuth !== 'undefined' && TeamAuth.isSignedIn && !TeamAuth.isSignedIn()) {
            const err = new Error('Not signed in');
            err.status = 401;
            throw err;
        }
    }

    function isViewAsMode() {
        return typeof TeamAuth !== 'undefined' && TeamAuth.isViewAsMode && TeamAuth.isViewAsMode();
    }

    function localizeError(message) {
        if (typeof handlers.translateError === 'function') {
            return handlers.translateError(message);
        }
        return message;
    }

    function viewAsNotice(message) {
        const raw = message || 'View As: change not saved';
        setStatus('error', localizeError(raw));
        if (typeof handlers.onViewAsBlocked === 'function') {
            handlers.onViewAsBlocked(raw);
        }
    }

    async function apiFetch(path, options) {
        assertSignedIn();
        const raw = options || {};
        const timeoutMs =
            raw.timeoutMs != null && Number.isFinite(Number(raw.timeoutMs))
                ? Number(raw.timeoutMs)
                : API_FETCH_TIMEOUT_MS;
        const opts = Object.assign({ credentials: 'same-origin' }, raw);
        delete opts.timeoutMs;
        const headers = Object.assign({}, opts.headers || {});
        if (typeof TeamAuth !== 'undefined' && TeamAuth.authHeaders) {
            Object.assign(headers, TeamAuth.authHeaders());
        } else if (typeof ViewAsBanner !== 'undefined' && ViewAsBanner.authFetchHeaders) {
            Object.assign(headers, ViewAsBanner.authFetchHeaders());
        }
        if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(opts.body);
        }
        opts.headers = headers;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        if (opts.signal) {
            opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
        }
        opts.signal = controller.signal;
        let res;
        try {
            res = await fetch(API + path, opts);
        } catch (fetchErr) {
            if (fetchErr && fetchErr.name === 'AbortError') {
                const err = new Error('Request timed out');
                err.status = 408;
                throw err;
            }
            throw fetchErr;
        } finally {
            clearTimeout(timer);
        }
        let json = null;
        const text = await res.text();
        if (text) {
            try {
                json = JSON.parse(text);
            } catch (_) {
                json = { raw: text };
            }
        }
        if (res.status === 401) {
            redirectToLogin();
            const err = new Error('Not signed in');
            err.status = 401;
            throw err;
        }
        if (!res.ok) {
            const err = new Error((json && json.error) || res.statusText || 'Request failed');
            err.status = res.status;
            err.body = json;
            throw err;
        }
        return json;
    }

    function applyCalendarAccessFromMeta(json) {
        if (!json || typeof json !== 'object') {
            return;
        }
        if (typeof json.canEdit === 'boolean') {
            state.canEdit = json.canEdit;
        }
        if (typeof json.canSuggest === 'boolean') {
            state.canSuggest = json.canSuggest;
        }
        if (json.accessLevel) {
            state.accessLevel = String(json.accessLevel);
        }
        state.permissionReadOnly =
            typeof json.permissionReadOnly === 'boolean' ? json.permissionReadOnly : !state.canEdit;
    }

    function applyLockFromResponse(json) {
        const wasReadOnly = state.readOnly;
        const wasHoldsLock = state.holdsLock;
        applyCalendarAccessFromMeta(json);
        // No edit lock: anyone with edit access edits at the same time (live sync merges
        // changes). Read-only comes from permissions only. holdsLock stays as "may edit"
        // for the page code that still asks.
        state.readOnly = state.canEdit === false || Boolean(state.permissionReadOnly);
        state.lock = null;
        state.holdsLock = !state.readOnly;
        state.pendingEditRequest = false;
        if (json && json.lockStaleMinutes != null) {
            state.lockStaleMinutes = json.lockStaleMinutes;
        }
        if (json && json.navNotificationActiveDays != null) {
            state.navNotificationActiveDays = json.navNotificationActiveDays;
        }
        if (json && json.navNotificationDismissedDays != null) {
            state.navNotificationDismissedDays = json.navNotificationDismissedDays;
        }
        if (json && json.pendingSuggestions != null) {
            state.pendingSuggestions = json.pendingSuggestions;
        }
        if (json && json.lockExpiresAt !== undefined) {
            state.lockExpiresAt = json.lockExpiresAt;
        }
        if (json && Array.isArray(json.viewers)) {
            state.viewers = json.viewers;
        }
        const lockState = {
            readOnly: state.readOnly,
            canEdit: state.canEdit,
            canSuggest: state.canSuggest,
            accessLevel: state.accessLevel,
            permissionReadOnly: state.permissionReadOnly,
            lock: state.lock,
            holdsLock: state.holdsLock,
            pendingEditRequest: state.pendingEditRequest,
            lockStaleMinutes: state.lockStaleMinutes,
            navNotificationActiveDays: state.navNotificationActiveDays,
            navNotificationDismissedDays: state.navNotificationDismissedDays,
            pendingSuggestions: state.pendingSuggestions,
            lockExpiresAt: state.lockExpiresAt,
            viewers: state.viewers,
            wasReadOnly,
            wasHoldsLock
        };
        if (typeof handlers.onLockChange === 'function') {
            handlers.onLockChange(lockState);
        }
        debugLog('apply', 'Lock state from server', {
            source: (json && json._lockDebugSource) || 'response',
            wasReadOnly,
            wasHoldsLock,
            now: {
                readOnly: state.readOnly,
                holdsLock: state.holdsLock,
                pendingEditRequest: state.pendingEditRequest
            },
            serverLock: json && json.lock ? json.lock.holderUserId : null
        });
        return lockState;
    }

    function tagLockDebugSource(json, source) {
        if (!json || typeof json !== 'object') {
            return json;
        }
        json._lockDebugSource = source;
        return json;
    }

    /**
     * Quietly acquire when lock is free or held by this user on another session,
     * so schedule saves can proceed without an explicit Start editing click.
     * @returns {Promise<boolean>} true when this session may write schedule data
     */
    async function ensureLockForScheduleWrite() {
        // No edit lock: edit access is all a schedule write needs.
        return !(state.permissionReadOnly || state.canEdit === false);
    }

    function setStatus(status, detail) {
        state.syncStatus = status || 'idle';
        if (typeof handlers.onStatusChange === 'function') {
            const resolved =
                status === 'error' && detail ? localizeError(detail) : detail;
            handlers.onStatusChange(status, resolved);
        }
    }

    function mergeArrayById(localArr, serverArr, idKey) {
        const key = idKey || 'id';
        const map = new Map();
        (serverArr || []).forEach((item) => {
            if (item && item[key] != null) {
                map.set(String(item[key]), Object.assign({}, item));
            }
        });
        (localArr || []).forEach((item) => {
            if (!item || item[key] == null) {
                return;
            }
            const id = String(item[key]);
            const existing = map.get(id);
            if (!existing) {
                map.set(id, Object.assign({}, item));
                return;
            }
            map.set(id, Object.assign({}, existing, item));
        });
        return Array.from(map.values());
    }

    function smartMergeData(localData, serverData) {
        const local = localData || {};
        const server = serverData || {};
        const merged = Object.assign({}, server, local);
        merged.classes = mergeArrayById(local.classes, server.classes);
        merged.events = mergeArrayById(local.events, server.events);
        merged.customClassTypes = mergeArrayById(local.customClassTypes, server.customClassTypes);
        merged.customSyllabusTemplates = mergeArrayById(
            local.customSyllabusTemplates,
            server.customSyllabusTemplates
        );
        merged.cohorts = mergeArrayById(local.cohorts, server.cohorts);
        merged.timetableTimeSlots = mergeArrayById(local.timetableTimeSlots, server.timetableTimeSlots);
        merged.periodSlotMap = Object.assign({}, server.periodSlotMap || {}, local.periodSlotMap || {});
        if (typeof global.CCPDayNotes !== 'undefined' && global.CCPDayNotes.mergeDayNotesById) {
            merged.dayNotes = global.CCPDayNotes.mergeDayNotesById(local.dayNotes, server.dayNotes);
        } else if (Array.isArray(local.dayNotes) && local.dayNotes.length) {
            merged.dayNotes = local.dayNotes;
        }
        merged.attendanceSessions = mergeArrayById(local.attendanceSessions, server.attendanceSessions);
        merged.homeworkCompletions = mergeArrayById(local.homeworkCompletions, server.homeworkCompletions);
        merged.essaySubmissions = mergeArrayById(local.essaySubmissions, server.essaySubmissions);
        merged.essayGroups = mergeArrayById(local.essayGroups, server.essayGroups);
        merged.studentPoints = mergeArrayById(local.studentPoints, server.studentPoints, 'id');
        merged.studentTests = mergeArrayById(local.studentTests, server.studentTests);
        merged.debateTeamSessions = mergeArrayById(local.debateTeamSessions, server.debateTeamSessions);
        merged.debateScores = mergeArrayById(local.debateScores, server.debateScores);
        merged.debateCustomFormats = mergeArrayById(local.debateCustomFormats, server.debateCustomFormats);
        if (local.essayGraderSettings || server.essayGraderSettings) {
            const localAt = local.essayGraderSettings && local.essayGraderSettings.updatedAt;
            const serverAt = server.essayGraderSettings && server.essayGraderSettings.updatedAt;
            if (localAt && serverAt && String(localAt) >= String(serverAt)) {
                merged.essayGraderSettings = local.essayGraderSettings;
            } else if (local.essayGraderSettings && !server.essayGraderSettings) {
                merged.essayGraderSettings = local.essayGraderSettings;
            } else {
                merged.essayGraderSettings = server.essayGraderSettings || local.essayGraderSettings;
            }
        }
        merged.speakingTestRecords = mergeArrayById(local.speakingTestRecords, server.speakingTestRecords);
        merged.debateBookDistributions = mergeArrayById(
            local.debateBookDistributions,
            server.debateBookDistributions
        );
        merged.pendingDebateBookChecks = mergeArrayById(
            local.pendingDebateBookChecks,
            server.pendingDebateBookChecks
        );
        merged.homeworkSavedMarks = mergeArrayById(
            local.homeworkSavedMarks,
            server.homeworkSavedMarks
        );
        if (local.ui || server.ui) {
            merged.ui = Object.assign({}, server.ui || {}, local.ui || {});
        }
        merged.calendarName = local.calendarName || server.calendarName;
        merged.termStart = local.termStart || server.termStart;
        merged.termEnd = local.termEnd || server.termEnd;
        merged.useAutoTermEnd = local.useAutoTermEnd != null ? local.useAutoTermEnd : server.useAutoTermEnd;
        merged.termMonthCount = local.termMonthCount != null ? local.termMonthCount : server.termMonthCount;
        merged.schemaVersion =
            Math.max(local.schemaVersion || 0, server.schemaVersion || 0) ||
            local.schemaVersion ||
            server.schemaVersion;
        return merged;
    }

    function getMutationSource() {
        return state.mutationSource;
    }

    function getPendingMutations() {
        const src = getMutationSource();
        if (!src || typeof src.getMutationQueue !== 'function') {
            return [];
        }
        const queue = src.getMutationQueue();
        return Array.isArray(queue) ? queue : [];
    }

    function notifyQueueChange() {
        const queue = getPendingMutations();
        if (typeof handlers.onQueueChange === 'function') {
            handlers.onQueueChange(queue.length);
        }
    }

    function clearSaveRetryTimer() {
        if (state.saveRetryTimer) {
            clearTimeout(state.saveRetryTimer);
            state.saveRetryTimer = null;
        }
    }

    function scheduleSaveRetry(reason) {
        clearSaveRetryTimer();
        if (!getPendingMutations().length && !(liveSyncActive() && computeLocalChanges().length)) {
            return;
        }
        const delay = state.saveRetryBackoffMs || SAVE_RETRY_BASE_MS;
        state.saveRetryTimer = setTimeout(async () => {
            state.saveRetryTimer = null;
            try {
                await CalendarSync.saveNow();
                state.saveRetryBackoffMs = SAVE_RETRY_BASE_MS;
            } catch (err) {
                if (err && err.queuedOffline) {
                    return;
                }
                state.saveRetryBackoffMs = Math.min(
                    SAVE_RETRY_MAX_MS,
                    Math.max(SAVE_RETRY_BASE_MS, delay * SAVE_RETRY_FACTOR)
                );
                scheduleSaveRetry(reason || 'retry');
            }
        }, delay);
        debugLog('debug', 'Scheduled save retry', { delay, reason: reason || '' });
    }

    function adoptServerRevision(doc) {
        if (doc && doc.revision != null && doc.revision !== '') {
            state.revision = doc.revision;
        }
    }

    function mutationsOverlapWithServer(mutations, serverData) {
        if (typeof global.CCPConflictMerge !== 'undefined' && global.CCPConflictMerge.mutationsOverlap) {
            return global.CCPConflictMerge.mutationsOverlap(mutations, serverData);
        }
        return true;
    }

    /*
     * ---- Live sync (no edit lock) ----------------------------------------------------
     * state.base is the last calendar data this page received from the server. A save
     * sends diffCalendar(base, local): only what this page changed, as per-item / per-field
     * mutations. Any newer server copy (another tab, device or teacher) is merged by
     * replaying those same local changes on top of it, so nothing unsaved is lost.
     * The page registers its data with setLiveSource({ getData, applyData }).
     */
    const LIVE_PENDING_PREFIX = 'classCalendarLivePending:';
    /** Don't swap in another device's changes while the person is typing in a field. */
    const LIVE_TYPING_GRACE_MS = 4000;

    /**
     * Meta poll URL, carrying what this page is working on (handlers.getEditFocus →
     * { key, label }) so other accounts can be told they're editing the same thing.
     */
    function metaPath(calId) {
        let path = '/calendars/' + encodeURIComponent(calId) + '/meta';
        let focus = null;
        try {
            focus = typeof handlers.getEditFocus === 'function' ? handlers.getEditFocus() : null;
        } catch (_) {
            focus = null;
        }
        const key = focus && focus.key ? String(focus.key).slice(0, 120) : '';
        state.sentFocusKey = key;
        if (key) {
            path += '?focus=' + encodeURIComponent(key);
            if (focus.label) {
                path += '&focusLabel=' + encodeURIComponent(String(focus.label).slice(0, 80));
            }
        }
        return path;
    }

    function syncDiffApi() {
        return global.CCPSyncDiff || null;
    }

    function mutationsApi() {
        return global.CCPCalendarMutations || null;
    }

    function liveSyncActive() {
        return Boolean(
            state.liveSource &&
                state.base &&
                syncDiffApi() &&
                mutationsApi() &&
                typeof mutationsApi().applyCalendarMutations === 'function'
        );
    }

    function baseFromDoc(doc) {
        const data = JSON.parse(JSON.stringify((doc && doc.data) || {}));
        delete data._syncRevs;
        delete data.ui;
        const name = doc && doc.name && String(doc.name).trim();
        if (name) {
            // The page shows the calendar's own name (applyServerDocument does the same).
            data.calendarName = name;
        }
        return data;
    }

    function localData() {
        try {
            return state.liveSource && typeof state.liveSource.getData === 'function'
                ? state.liveSource.getData() || {}
                : {};
        } catch (_) {
            return {};
        }
    }

    /** Everything this page changed since state.base. */
    function computeLocalChanges() {
        if (!liveSyncActive()) {
            return [];
        }
        return syncDiffApi().diffCalendar(state.base, localData());
    }

    /** Changes this account may send (suggesters / classroom-only editors skip schedule). */
    function sendableChanges(mutations) {
        if (state.canEdit !== false) {
            return mutations;
        }
        const api = mutationsApi();
        return mutations.filter(
            (m) => api.CLASSROOM_ENTITIES.has(m.entity) || api.DAYNOTES_ENTITIES.has(m.entity)
        );
    }

    /** Edit areas (Admin → Accounts). Unknown user → let the server decide. */
    function userHasEditArea(area) {
        if (!area) {
            return true;
        }
        if (typeof TeamAuth === 'undefined' || !TeamAuth.getUser || !TeamAuth.getUser()) {
            return true;
        }
        if (typeof TeamAuth.hasPermission === 'function') {
            return TeamAuth.hasPermission(area);
        }
        return true;
    }

    /**
     * Put fields this person may not edit back to the server copy (on screen too),
     * so a blocked change isn't resent forever. Returns the fields reverted.
     */
    function revertDeniedFields(fields) {
        const list = (fields || []).filter(Boolean);
        if (!list.length || !liveSyncActive()) {
            return [];
        }
        const local = localData();
        const merged = JSON.parse(JSON.stringify(Object.assign({}, local, { ui: undefined })));
        list.forEach((f) => {
            if (Object.prototype.hasOwnProperty.call(state.base, f)) {
                merged[f] = JSON.parse(JSON.stringify(state.base[f]));
            } else {
                delete merged[f];
            }
        });
        merged.ui = local.ui;
        try {
            state.liveSource.applyData(merged, {
                id: state.baseCalendarId,
                name: state.base.calendarName,
                revision: state.revision,
                data: state.base
            }, { denied: list });
        } catch (err) {
            debugLog('error', 'Reverting blocked changes failed', { message: err && err.message });
        }
        if (typeof handlers.onDenied === 'function') {
            handlers.onDenied(list);
        }
        return list;
    }

    function livePendingKey(calId) {
        return LIVE_PENDING_PREFIX + String(calId || '');
    }

    /** Keep unsaved changes across a closed tab or lost connection. */
    function persistLivePending(calId, mutations) {
        if (!calId) {
            return;
        }
        try {
            if (mutations && mutations.length) {
                localStorage.setItem(
                    livePendingKey(calId),
                    JSON.stringify({ revision: state.revision, savedAt: Date.now(), mutations })
                );
            } else {
                localStorage.removeItem(livePendingKey(calId));
            }
        } catch (_) {
            /* storage full or blocked: the in-page copy still saves on reconnect */
        }
    }

    function readLivePending(calId) {
        try {
            const raw = localStorage.getItem(livePendingKey(calId));
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && Array.isArray(parsed.mutations) ? parsed.mutations : [];
        } catch (_) {
            return [];
        }
    }

    function userIsTyping() {
        if (typeof document === 'undefined') {
            return false;
        }
        const el = document.activeElement;
        if (!el) {
            return false;
        }
        const tag = String(el.tagName || '').toUpperCase();
        const textInput =
            tag === 'TEXTAREA' ||
            el.isContentEditable ||
            (tag === 'INPUT' &&
                !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/i.test(el.type || ''));
        return Boolean(textInput) && Date.now() - (state.lastUserInputAt || 0) < LIVE_TYPING_GRACE_MS;
    }

    /**
     * Merge a server copy into this page: replay local changes on top of it.
     * opts.ownSave: the response to this page's save (no "changed elsewhere" notice).
     * Returns { applied, overlaps }.
     */
    function rebaseOnto(doc, opts) {
        const o = opts || {};
        if (!doc || !doc.data) {
            return { applied: false, overlaps: [] };
        }
        if (!liveSyncActive()) {
            adoptServerRevision(doc);
            return { applied: false, overlaps: [] };
        }
        if (doc.id != null && state.baseCalendarId && String(doc.id) !== String(state.baseCalendarId)) {
            return { applied: false, overlaps: [] };
        }
        if (doc.revision != null && Number(doc.revision) < Number(state.revision)) {
            // An older answer arriving late: the page already has something newer.
            return { applied: false, overlaps: [] };
        }
        const SyncDiff = syncDiffApi();
        const local = localData();
        const oldBase = state.base;
        const nextBase = baseFromDoc(doc);
        const pending = SyncDiff.diffCalendar(oldBase, local);
        const merged = mutationsApi().applyCalendarMutations(nextBase, pending, { bumpVersions: false });
        let overlaps = [];
        if (!o.ownSave && pending.length) {
            overlaps = SyncDiff.overlappingTargets(SyncDiff.diffCalendar(oldBase, nextBase), pending);
        }
        state.base = nextBase;
        state.revision = doc.revision;
        state.remoteNewer = false;
        state.deferredPull = false;
        // Only touch the page when something it shows actually changed.
        const changed = SyncDiff.diffCalendar(merged, local).length > 0;
        if (changed) {
            merged.ui = local.ui;
            try {
                state.liveSource.applyData(merged, doc, { overlaps, ownSave: Boolean(o.ownSave) });
            } catch (err) {
                debugLog('error', 'Applying merged calendar failed', { message: err && err.message });
            }
        }
        if (overlaps.length && typeof handlers.onOverwritten === 'function') {
            handlers.onOverwritten(overlaps, 'incoming');
        }
        debugLog('apply', 'Merged server copy', {
            revision: doc.revision,
            pending: pending.length,
            changed,
            overlaps: overlaps.length,
            ownSave: Boolean(o.ownSave)
        });
        return { applied: changed, overlaps };
    }

    /** Responses from any save carry the latest calendar: fold them in. */
    function adoptSavedDoc(doc) {
        if (!doc) {
            return;
        }
        if (liveSyncActive() && doc.data) {
            rebaseOnto(doc, { ownSave: true });
        } else {
            adoptServerRevision(doc);
        }
    }

    function flushLegacyQueue(calId) {
        const src = getMutationSource();
        const queued = getPendingMutations().length;
        if (queued && src && typeof src.flushMutationQueue === 'function') {
            src.flushMutationQueue(queued);
        }
        if (
            calId &&
            typeof global.CCPSessionRestore !== 'undefined' &&
            global.CCPSessionRestore.clearOfflineQueue
        ) {
            global.CCPSessionRestore.clearOfflineQueue(calId);
        }
        notifyQueueChange();
    }

    function isNetworkError(err) {
        return (
            !err ||
            !err.status ||
            err.status === 0 ||
            err.message === 'Failed to fetch' ||
            err.message === 'Request timed out'
        );
    }

    /** Send this page's changes. Safe to call any time; overlapping calls coalesce. */
    async function saveLiveChanges() {
        if (!liveSyncActive()) {
            return null;
        }
        if (state.saving) {
            state.saveAgain = true;
            return null;
        }
        // Changes belong to the calendar the base came from; never send them anywhere else
        // (e.g. mid-way through switching calendars).
        const calId = state.baseCalendarId;
        if (!calId || calId !== String(CalendarSync.getActiveCalendarId() || '')) {
            return null;
        }
        if (isViewAsMode()) {
            return { simulated: true, revision: state.revision };
        }
        let mutations = sendableChanges(computeLocalChanges());
        // Areas this person may not edit (curriculum, …): don't send, put them back.
        const areaSplit = syncDiffApi().splitByEditArea(mutations, userHasEditArea);
        if (areaSplit.deniedFields.length) {
            revertDeniedFields(areaSplit.deniedFields);
            mutations = areaSplit.allowed;
        }
        if (!mutations.length) {
            flushLegacyQueue(calId);
            persistLivePending(calId, []);
            return null;
        }
        clearSaveRetryTimer();
        setStatus('saving');
        state.saving = true;
        try {
            const doc = await apiFetch('/calendars/' + encodeURIComponent(calId), {
                method: 'PATCH',
                body: { baseRevision: state.revision, mutations }
            });
            flushLegacyQueue(calId);
            rebaseOnto(doc, { ownSave: true });
            if (doc && Array.isArray(doc.denied) && doc.denied.length) {
                // The server blocked these (permissions changed since the page loaded).
                revertDeniedFields(doc.denied);
            }
            // Anything still different was changed while this save was in flight.
            persistLivePending(calId, sendableChanges(computeLocalChanges()));
            state.saveRetryBackoffMs = SAVE_RETRY_BASE_MS;
            setStatus('saved');
            if (doc && Array.isArray(doc.overwritten) && doc.overwritten.length &&
                typeof handlers.onOverwritten === 'function') {
                handlers.onOverwritten(doc.overwritten, 'save');
            }
            if (typeof handlers.onSaved === 'function') {
                handlers.onSaved(doc);
            }
            return doc;
        } catch (err) {
            persistLivePending(calId, mutations);
            if (err && err.status === 409 && err.body && err.body.code === 'DUPLICATE_NAME') {
                setStatus('error', err.message);
                if (typeof handlers.onDuplicateName === 'function') {
                    handlers.onDuplicateName(err.message);
                }
                throw err;
            }
            if (isNetworkError(err)) {
                setStatus('queued');
                if (typeof handlers.onOfflineQueued === 'function') {
                    handlers.onOfflineQueued(mutations.length);
                }
                scheduleSaveRetry('offline');
                const queuedErr = new Error((err && err.message) || 'Offline');
                queuedErr.queuedOffline = true;
                queuedErr.status = err && err.status;
                throw queuedErr;
            }
            if (err.status === 429 || err.status >= 500) {
                setStatus('queued');
                scheduleSaveRetry('busy');
            } else {
                setStatus('error', err.message);
            }
            throw err;
        } finally {
            state.saving = false;
            if (state.saveAgain) {
                state.saveAgain = false;
                CalendarSync.scheduleSave();
            }
        }
    }

    /** Fetch the newest calendar and merge it in (skipped while the person is typing). */
    async function pullLatest(reason) {
        if (!liveSyncActive() || state.saving || state.pulling) {
            return false;
        }
        if (userIsTyping()) {
            state.deferredPull = true;
            state.remoteNewer = true;
            return false;
        }
        const calId = state.baseCalendarId;
        if (!calId || calId !== String(CalendarSync.getActiveCalendarId() || '')) {
            return false;
        }
        state.pulling = true;
        try {
            debugLog('api', 'GET /calendars/:id (live pull)', { calendarId: calId, reason: reason || '' });
            const doc = await apiFetch('/calendars/' + encodeURIComponent(calId));
            applyLockFromResponse(tagLockDebugSource(doc, 'livePull'));
            if (state.saving) {
                // A save started meanwhile; its answer carries the same or newer copy.
                return false;
            }
            rebaseOnto(doc, { ownSave: false });
            return true;
        } finally {
            state.pulling = false;
        }
    }

    /**
     * Startup asks for the same small things from several places at once.
     * Calls with the same key share one request while it runs, and the answer
     * is reused for ttlMs afterwards. A failed request is not reused.
     */
    const sharedGets = new Map();
    function sharedGet(key, ttlMs, run) {
        const hit = sharedGets.get(key);
        if (hit && (hit.pending || Date.now() - hit.at < ttlMs)) {
            return hit.promise;
        }
        const entry = { pending: true, at: 0, promise: null };
        entry.promise = Promise.resolve()
            .then(run)
            .then(
                (value) => {
                    entry.pending = false;
                    entry.at = Date.now();
                    return value;
                },
                (err) => {
                    sharedGets.delete(key);
                    throw err;
                }
            );
        sharedGets.set(key, entry);
        return entry.promise;
    }
    function forgetSharedGet(key) {
        sharedGets.delete(key);
    }

    const CalendarSync = {
        state,

        setHandlers(h) {
            handlers = Object.assign({}, handlers, h || {});
        },

        setMutationSource(source) {
            state.mutationSource = source || null;
            notifyQueueChange();
        },

        getPendingMutationCount() {
            return getPendingMutations().length;
        },

        hasPendingMutations() {
            return getPendingMutations().length > 0;
        },

        getActiveCalendarId() {
            if (state.activeCalendarId) {
                return state.activeCalendarId;
            }
            try {
                if (typeof CCPSessionRestore !== 'undefined' && CCPSessionRestore.getActiveCalendarIdFromStorage) {
                    return CCPSessionRestore.getActiveCalendarIdFromStorage();
                }
                return localStorage.getItem(STORAGE_ACTIVE);
            } catch (_) {
                return null;
            }
        },

        setActiveCalendarId(id) {
            const prev = state.activeCalendarId;
            state.activeCalendarId = id;
            try {
                if (typeof CCPSessionRestore !== 'undefined' && CCPSessionRestore.setActiveCalendarIdInStorage) {
                    CCPSessionRestore.setActiveCalendarIdInStorage(id);
                } else if (id) {
                    localStorage.setItem(STORAGE_ACTIVE, id);
                } else {
                    localStorage.removeItem(STORAGE_ACTIVE);
                }
            } catch (_) { /* ignore */ }
            if (prev !== id && typeof CCPActiveContext !== 'undefined' && CCPActiveContext.reload) {
                CCPActiveContext.reload();
            }
        },

        isReadOnly() {
            return state.readOnly;
        },

        async checkHealth() {
            try {
                const res = await sharedGet('health', 10000, () => apiFetch('/health', { timeoutMs: 8000 }));
                return Boolean(res && res.ok);
            } catch (_) {
                return false;
            }
        },

        async fetchHostInfo() {
            return apiFetch('/host-info');
        },

        async listCalendars() {
            return apiFetch('/calendars');
        },

        async fetchTeachers() {
            return apiFetch('/teachers');
        },

        async fetchGroups() {
            return apiFetch('/groups');
        },

        async refreshLockMeta(id) {
            const calId = id || CalendarSync.getActiveCalendarId();
            if (!calId) {
                return null;
            }
            debugLog('api', 'GET /meta (refreshLockMeta)', { calendarId: calId });
            const meta = await apiFetch(metaPath(calId));
            applyLockFromResponse(tagLockDebugSource(meta, 'refreshLockMeta'));
            return meta;
        },

        /** Edit lock retired: editing never waits for anyone. Kept for older callers. */
        async acquireLock() {
            if (state.canEdit === false) {
                const err = new Error('You do not have edit access to this calendar');
                err.status = 403;
                throw err;
            }
            return { acquired: true, holdsLock: true, readOnly: false };
        },

        async grantLockToPending() {
            await CalendarSync.flushPendingSave();
            return { ok: true };
        },

        async dismissLockRequest() {
            return { ok: true };
        },

        hasPendingSave() {
            return Boolean(
                state.saveTimer ||
                    state.pendingGetData ||
                    state.saving ||
                    (liveSyncActive() && computeLocalChanges().length > 0)
            );
        },

        /**
         * Live sync: the page registers its calendar data here.
         * source = { getData(): calendar data, applyData(mergedData, serverDoc, info) }
         */
        setLiveSource(source) {
            state.liveSource = source && typeof source.getData === 'function' &&
                typeof source.applyData === 'function' ? source : null;
            if (!state.livePagehideBound && typeof global.addEventListener === 'function') {
                state.livePagehideBound = true;
                // Closing the tab inside the save delay: keep the edit for next time.
                global.addEventListener('pagehide', () => {
                    if (liveSyncActive()) {
                        persistLivePending(
                            state.baseCalendarId,
                            sendableChanges(computeLocalChanges())
                        );
                    }
                });
            }
        },

        isLiveSync() {
            return liveSyncActive();
        },

        /**
         * The page just replaced its data with this server copy (load / switch / reload).
         * It becomes the base that local changes are measured against.
         */
        adoptServerDoc(doc) {
            if (!doc || !doc.data) {
                return;
            }
            state.base = baseFromDoc(doc);
            state.baseCalendarId = doc.id != null ? String(doc.id) : CalendarSync.getActiveCalendarId();
            state.revision = doc.revision;
            state.remoteNewer = false;
            state.deferredPull = false;
        },

        /**
         * Unsaved changes from a closed tab or lost connection, replayed onto freshly
         * loaded data so the next save sends them. Returns the data to show.
         */
        replayPendingChanges(calId, data) {
            const api = mutationsApi();
            if (!api || !data) {
                return data;
            }
            const live = readLivePending(calId);
            let queued = [];
            try {
                if (typeof global.CCPSessionRestore !== 'undefined' &&
                    global.CCPSessionRestore.loadOfflineQueue) {
                    queued = global.CCPSessionRestore.loadOfflineQueue(calId) || [];
                }
            } catch (_) {
                queued = [];
            }
            const all = (Array.isArray(queued) ? queued : []).concat(live);
            if (!all.length) {
                return data;
            }
            debugLog('apply', 'Replaying unsaved changes', { count: all.length });
            const ui = data.ui;
            const replayed = api.applyCalendarMutations(data, all, { bumpVersions: false });
            if (ui !== undefined) {
                replayed.ui = ui;
            }
            return replayed;
        },

        /** Save now (live sync) — used by flush, retries and the poll. */
        async saveNow() {
            if (liveSyncActive()) {
                return saveLiveChanges();
            }
            if (CalendarSync.hasPendingMutations()) {
                return CalendarSync.saveCalendarMutations();
            }
            return null;
        },

        async waitForSaveComplete(timeoutMs) {
            const limit = timeoutMs != null ? timeoutMs : 20000;
            const start = Date.now();
            while (state.saving && Date.now() - start < limit) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
            return !state.saving;
        },

        async flushPendingSave() {
            await CalendarSync.waitForSaveComplete();
            if (state.saveTimer) {
                clearTimeout(state.saveTimer);
                state.saveTimer = null;
            }
            const fn = state.pendingGetData;
            state.pendingGetData = null;
            if (!CalendarSync.getActiveCalendarId()) {
                return;
            }
            if (liveSyncActive()) {
                await saveLiveChanges();
                await CalendarSync.waitForSaveComplete();
                return;
            }
            if (state.readOnly) {
                const acquired = await ensureLockForScheduleWrite();
                if (!acquired || state.readOnly) {
                    return;
                }
            }
            if (CalendarSync.hasPendingMutations()) {
                await CalendarSync.saveCalendarMutations();
                await CalendarSync.waitForSaveComplete();
                return;
            }
            if (!fn) {
                return;
            }
            let data;
            try {
                data = fn();
            } catch (e) {
                setStatus('error', e.message);
                throw e;
            }
            await CalendarSync.saveCalendar(data);
            await CalendarSync.waitForSaveComplete();
        },

        async prepareForLogout() {
            if (state.readOnly || !CalendarSync.getActiveCalendarId()) {
                return { saved: false, skipped: true };
            }
            if (typeof handlers.onPrepareLogout === 'function') {
                try {
                    await handlers.onPrepareLogout();
                } catch (err) {
                    console.warn('onPrepareLogout failed:', err);
                }
            }
            try {
                if (CalendarSync.hasPendingSave()) {
                    setStatus('saving');
                }
                await CalendarSync.flushPendingSave();
                return { saved: true };
            } catch (err) {
                if (err.status !== 409) {
                    console.warn('prepareForLogout save failed:', err);
                }
                return { saved: false, error: err };
            }
        },

        /**
         * Skip redundant lock/touch while the holder's updated_at is still in the
         * fresher half of the stale window (cuts poll cost; policy unchanged).
         */
        shouldTouchLock() {
            return false;
        },

        async touchLock() {
            return { touched: true };
        },

        async releaseLock() {
            return { released: true };
        },

        async loadNotificationMeta(calendarId) {
            const calId = calendarId || CalendarSync.getActiveCalendarId();
            if (!calId) {
                state.notificationMeta = {};
                return { meta: {} };
            }
            debugLog('api', 'GET /notification-meta', { calendarId: calId });
            const result = await apiFetch(
                '/calendars/' + encodeURIComponent(calId) + '/notification-meta'
            );
            state.notificationMeta =
                result && result.meta && typeof result.meta === 'object' ? result.meta : {};
            if (typeof handlers.onNotificationMetaLoaded === 'function') {
                handlers.onNotificationMetaLoaded(state.notificationMeta);
            }
            return result || { meta: {} };
        },

        async loadUiPrefs(calendarId) {
            const calId = calendarId || CalendarSync.getActiveCalendarId();
            if (!calId) {
                return {
                    navZoneOrder: null,
                    navTabZone: null,
                    navTabOrder: null,
                    updatedAt: null
                };
            }
            debugLog('api', 'GET /ui-prefs', { calendarId: calId });
            const result = await sharedGet('ui-prefs:' + calId, 5000, () =>
                apiFetch('/calendars/' + encodeURIComponent(calId) + '/ui-prefs')
            );
            return result && typeof result === 'object'
                ? result
                : { navZoneOrder: null, navTabZone: null, navTabOrder: null, updatedAt: null };
        },

        async putUiPrefs(calendarId, body) {
            const calId = calendarId || CalendarSync.getActiveCalendarId();
            if (!calId) {
                return null;
            }
            debugLog('api', 'PUT /ui-prefs', { calendarId: calId });
            forgetSharedGet('ui-prefs:' + calId);
            return apiFetch('/calendars/' + encodeURIComponent(calId) + '/ui-prefs', {
                method: 'PUT',
                body: body && typeof body === 'object' ? body : {}
            });
        },

        async loadEssayBatchDraft(calendarId) {
            const calId = calendarId || CalendarSync.getActiveCalendarId();
            if (!calId) {
                return { draft: null, updatedAt: null };
            }
            debugLog('api', 'GET /essay-batch-draft', { calendarId: calId });
            const result = await apiFetch(
                '/calendars/' + encodeURIComponent(calId) + '/essay-batch-draft'
            );
            return result && typeof result === 'object' ? result : { draft: null, updatedAt: null };
        },

        async putEssayBatchDraft(calendarId, body) {
            if (isViewAsMode()) {
                const err = new Error('View As: change not saved');
                err.status = 403;
                err.code = 'VIEW_AS_MODE';
                throw err;
            }
            const calId = calendarId || CalendarSync.getActiveCalendarId();
            if (!calId) {
                const err = new Error('No active team calendar');
                err.status = 400;
                throw err;
            }
            debugLog('api', 'PUT /essay-batch-draft', { calendarId: calId });
            return apiFetch('/calendars/' + encodeURIComponent(calId) + '/essay-batch-draft', {
                method: 'PUT',
                body: body && typeof body === 'object' ? body : {}
            });
        },

        async loadUserUiPrefs() {
            debugLog('api', 'GET /me/ui-prefs');
            const result = await sharedGet('me-ui-prefs', 5000, () => apiFetch('/me/ui-prefs'));
            return result && typeof result === 'object'
                ? result
                : { classScope: null, updatedAt: null };
        },

        async putUserUiPrefs(body) {
            debugLog('api', 'PUT /me/ui-prefs');
            forgetSharedGet('me-ui-prefs');
            return apiFetch('/me/ui-prefs', {
                method: 'PUT',
                body: body && typeof body === 'object' ? body : {}
            });
        },

        async dismissNotification(calendarId, notificationId, dismissedAt) {
            const calId = calendarId || CalendarSync.getActiveCalendarId();
            const nid = String(notificationId || '').trim();
            if (!calId || !nid) {
                return { meta: state.notificationMeta || {} };
            }
            const body = dismissedAt != null ? { dismissedAt } : {};
            debugLog('api', 'PATCH /notification-meta/dismiss', { calendarId: calId, notificationId: nid });
            const result = await apiFetch(
                '/calendars/'
                    + encodeURIComponent(calId)
                    + '/notification-meta/'
                    + encodeURIComponent(nid)
                    + '/dismiss',
                { method: 'PATCH', body }
            );
            if (result && result.meta && typeof result.meta === 'object') {
                state.notificationMeta = result.meta;
            } else if (!state.notificationMeta || typeof state.notificationMeta !== 'object') {
                state.notificationMeta = {};
            }
            const at = dismissedAt != null ? Number(dismissedAt) : Date.now();
            const prev = state.notificationMeta[nid];
            state.notificationMeta[nid] = {
                firstSeenAt: prev && prev.firstSeenAt ? prev.firstSeenAt : at,
                dismissedAt: at
            };
            return result || { meta: state.notificationMeta };
        },

        async dismissNotifications(calendarId, notificationIds, dismissedAt) {
            const ids = Array.isArray(notificationIds) ? notificationIds : [];
            const at = dismissedAt != null ? dismissedAt : Date.now();
            const results = await Promise.all(
                ids.map((id) => CalendarSync.dismissNotification(calendarId, id, at).catch(() => null))
            );
            const last = results.filter(Boolean).pop();
            return last || { meta: state.notificationMeta || {} };
        },

        /** Read another calendar (e.g. last term) without touching this page's sync state. */
        async fetchCalendarCopy(id) {
            const doc = await apiFetch('/calendars/' + encodeURIComponent(id));
            return doc && doc.data ? doc.data : doc;
        },

        async loadCalendar(id) {
            debugLog('api', 'GET /calendars/:id (load)', { calendarId: id });
            const doc = await apiFetch('/calendars/' + encodeURIComponent(id));
            if (!liveSyncActive() || String(id) !== String(state.baseCalendarId || '')) {
                state.revision = doc.revision || 0;
                state.remoteNewer = false;
            }
            // Live sync: the revision moves only when the page merges this copy
            // (adoptServerDoc / mergeServerDoc), so nothing in it is skipped.
            applyLockFromResponse(tagLockDebugSource(doc, 'loadCalendar'));
            return doc;
        },

        /**
         * Same calendar, newer copy: merge it in, keeping this page's unsaved changes.
         * Returns false when it can't (no live sync or a different calendar).
         */
        mergeServerDoc(doc) {
            if (!liveSyncActive() || !doc || String(doc.id || '') !== String(state.baseCalendarId || '')) {
                return false;
            }
            rebaseOnto(doc, { ownSave: false });
            return true;
        },

        /** The page's edit focus changed: tell the server soon (one meta request). */
        reportFocusSoon() {
            if (state.focusTimer) {
                clearTimeout(state.focusTimer);
            }
            state.focusTimer = setTimeout(async () => {
                state.focusTimer = null;
                const calId = CalendarSync.getActiveCalendarId();
                if (!calId || isViewAsMode()) {
                    return;
                }
                try {
                    const meta = await apiFetch(metaPath(calId));
                    applyLockFromResponse(tagLockDebugSource(meta, 'focus'));
                    if (typeof handlers.onLiveTick === 'function') {
                        handlers.onLiveTick(meta);
                    }
                } catch (_) {
                    /* presence is best-effort */
                }
            }, 800);
        },

        lastSentFocusKey() {
            return state.sentFocusKey || '';
        },

        hasUnsavedLiveChanges() {
            return liveSyncActive() && computeLocalChanges().length > 0;
        },

        async createCalendar(data, name, options) {
            const opts = options || {};
            const body = { name, data };
            if (Array.isArray(opts.memberUserIds)) {
                body.memberUserIds = opts.memberUserIds;
            }
            if (Array.isArray(opts.groupIds)) {
                body.groupIds = opts.groupIds;
            }
            const doc = await apiFetch('/calendars', {
                method: 'POST',
                body
            });
            state.revision = doc.revision || 1;
            await CalendarSync.refreshLockMeta(doc.id);
            return doc;
        },

        async saveClassroomData(fields, options) {
            assertSignedIn();
            if (isViewAsMode()) {
                viewAsNotice('View As: change not saved');
                setStatus('saved');
                return { simulated: true, revision: state.revision };
            }
            if (state.canEdit === false && state.accessLevel !== 'suggester') {
                const err = new Error('You do not have edit access to this calendar');
                err.status = 403;
                throw err;
            }
            const opts = options || {};
            // Live sync: the page already holds these fields, so send the per-student /
            // per-field diff (never a whole session that could undo another teacher's marks).
            if (liveSyncActive() && !opts.force && !opts.forcePut) {
                return saveLiveChanges();
            }
            // Prefer granular PATCH mutations (no schedule lock) when available.
            if (
                !opts.forcePut &&
                typeof global.CCPCalendarMutations !== 'undefined' &&
                global.CCPCalendarMutations.classroomFieldsToMutations
            ) {
                const mutations = global.CCPCalendarMutations.classroomFieldsToMutations(fields);
                if (mutations.length) {
                    return CalendarSync.saveClassroomMutations(mutations, opts);
                }
            }
            const id = CalendarSync.getActiveCalendarId();
            if (!id) {
                throw new Error('No active team calendar');
            }
            const body = {
                classroomOnly: true,
                revision: opts.force ? undefined : state.revision,
                force: Boolean(opts.force)
            };
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'cohorts')) {
                body.cohorts = fields.cohorts;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'attendanceSessions')) {
                body.attendanceSessions = fields.attendanceSessions;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'homeworkCompletions')) {
                body.homeworkCompletions = fields.homeworkCompletions;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'essaySubmissions')) {
                body.essaySubmissions = fields.essaySubmissions;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'essayGroups')) {
                body.essayGroups = fields.essayGroups;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'studentPoints')) {
                body.studentPoints = fields.studentPoints;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'studentTests')) {
                body.studentTests = fields.studentTests;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'debateTeamSessions')) {
                body.debateTeamSessions = fields.debateTeamSessions;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'debateScores')) {
                body.debateScores = fields.debateScores;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'debateCustomFormats')) {
                body.debateCustomFormats = fields.debateCustomFormats;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'speakingTestRecords')) {
                body.speakingTestRecords = fields.speakingTestRecords;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'debateBookDistributions')) {
                body.debateBookDistributions = fields.debateBookDistributions;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'pendingDebateBookChecks')) {
                body.pendingDebateBookChecks = fields.pendingDebateBookChecks;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'tmsRosterLinks')) {
                body.tmsRosterLinks = fields.tmsRosterLinks;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'tmsEssayLinks')) {
                body.tmsEssayLinks = fields.tmsEssayLinks;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'essayGraderSettings')) {
                body.essayGraderSettings = fields.essayGraderSettings;
            }
            setStatus('saving');
            state.saving = true;
            let retried409 = false;
            try {
                const doc = await apiFetch('/calendars/' + encodeURIComponent(id), {
                    method: 'PUT',
                    body
                });
                adoptSavedDoc(doc);
                setStatus('saved');
                if (typeof handlers.onSaved === 'function') {
                    handlers.onSaved(doc);
                }
                return doc;
            } catch (err) {
                if (err.status === 409 && err.body && err.body.document && !retried409) {
                    retried409 = true;
                    state.revision = err.body.document.revision;
                    setStatus('saving');
                    const serverData = err.body.document.data || {};
                    const retryBody = Object.assign({}, body, { revision: state.revision });
                    if (Array.isArray(body.essaySubmissions) && Array.isArray(serverData.essaySubmissions)) {
                        retryBody.essaySubmissions = mergeArrayById(
                            body.essaySubmissions,
                            serverData.essaySubmissions
                        );
                    }
                    if (Array.isArray(body.essayGroups) && Array.isArray(serverData.essayGroups)) {
                        retryBody.essayGroups = mergeArrayById(
                            body.essayGroups,
                            serverData.essayGroups
                        );
                    }
                    if (Array.isArray(body.debateTeamSessions) && Array.isArray(serverData.debateTeamSessions)) {
                        retryBody.debateTeamSessions = mergeArrayById(
                            body.debateTeamSessions,
                            serverData.debateTeamSessions
                        );
                    }
                    if (Array.isArray(body.debateScores) && Array.isArray(serverData.debateScores)) {
                        retryBody.debateScores = mergeArrayById(
                            body.debateScores,
                            serverData.debateScores
                        );
                    }
                    if (Array.isArray(body.debateCustomFormats) && Array.isArray(serverData.debateCustomFormats)) {
                        retryBody.debateCustomFormats = mergeArrayById(
                            body.debateCustomFormats,
                            serverData.debateCustomFormats
                        );
                    }
                    if (Array.isArray(body.speakingTestRecords) && Array.isArray(serverData.speakingTestRecords)) {
                        retryBody.speakingTestRecords = mergeArrayById(
                            body.speakingTestRecords,
                            serverData.speakingTestRecords
                        );
                    }
                    if (
                        Array.isArray(body.debateBookDistributions) &&
                        Array.isArray(serverData.debateBookDistributions)
                    ) {
                        retryBody.debateBookDistributions = mergeArrayById(
                            body.debateBookDistributions,
                            serverData.debateBookDistributions
                        );
                    }
                    if (
                        Array.isArray(body.pendingDebateBookChecks) &&
                        Array.isArray(serverData.pendingDebateBookChecks)
                    ) {
                        retryBody.pendingDebateBookChecks = mergeArrayById(
                            body.pendingDebateBookChecks,
                            serverData.pendingDebateBookChecks
                        );
                    }
                    if (Array.isArray(body.attendanceSessions) && Array.isArray(serverData.attendanceSessions)) {
                        retryBody.attendanceSessions = mergeArrayById(
                            body.attendanceSessions,
                            serverData.attendanceSessions
                        );
                    }
                    if (Array.isArray(body.homeworkCompletions) && Array.isArray(serverData.homeworkCompletions)) {
                        retryBody.homeworkCompletions = mergeArrayById(
                            body.homeworkCompletions,
                            serverData.homeworkCompletions
                        );
                    }
                    if (Array.isArray(body.studentPoints) && Array.isArray(serverData.studentPoints)) {
                        retryBody.studentPoints = mergeArrayById(
                            body.studentPoints,
                            serverData.studentPoints
                        );
                    }
                    try {
                        const retryDoc = await apiFetch('/calendars/' + encodeURIComponent(id), {
                            method: 'PUT',
                            body: retryBody
                        });
                        adoptSavedDoc(retryDoc);
                        setStatus('saved');
                        if (typeof handlers.onSaved === 'function') {
                            handlers.onSaved(retryDoc);
                        }
                        return retryDoc;
                    } catch (retryErr) {
                        if (retryErr.status === 409 && retryErr.body && retryErr.body.document) {
                            adoptServerRevision(retryErr.body.document);
                            setStatus('conflict');
                            throw retryErr;
                        }
                        setStatus('error', retryErr.message);
                        throw retryErr;
                    }
                }
                if (err.status === 409 && err.body && err.body.document) {
                    adoptServerRevision(err.body.document);
                    setStatus('conflict');
                    throw err;
                }
                setStatus('error', err.message);
                throw err;
            } finally {
                state.saving = false;
            }
        },

        /**
         * Classroom / day-notes domain PATCH — no schedule edit lock.
         * Auto-retries non-overlapping 409s; overlaps surface via onConflict / throw.
         */
        async saveClassroomMutations(mutations, options) {
            assertSignedIn();
            if (isViewAsMode()) {
                viewAsNotice('View As: change not saved');
                setStatus('saved');
                return { simulated: true, revision: state.revision };
            }
            if (state.canEdit === false && state.accessLevel !== 'suggester') {
                const err = new Error('You do not have edit access to this calendar');
                err.status = 403;
                throw err;
            }
            const id = CalendarSync.getActiveCalendarId();
            if (!id) {
                throw new Error('No active team calendar');
            }
            const list = Array.isArray(mutations) ? mutations : [];
            if (!list.length) {
                return null;
            }
            const opts = options || {};
            if (liveSyncActive() && !opts.force && state.liveSource && opts.pageAlreadyApplied !== false) {
                // The page applied these already (saveClassroomPartial / day notes): diff covers them.
                return saveLiveChanges();
            }
            setStatus('saving');
            state.saving = true;
            try {
                const doc = await apiFetch('/calendars/' + encodeURIComponent(id), {
                    method: 'PATCH',
                    body: {
                        baseRevision: opts.force ? undefined : state.revision,
                        mutations: list,
                        force: Boolean(opts.force)
                    }
                });
                adoptSavedDoc(doc);
                setStatus('saved');
                if (typeof handlers.onSaved === 'function') {
                    handlers.onSaved(doc);
                }
                return doc;
            } catch (err) {
                if (err.status === 409 && err.body && err.body.document) {
                    const serverDoc = err.body.document;
                    adoptServerRevision(serverDoc);
                    const serverData = serverDoc.data || serverDoc;
                    if (!mutationsOverlapWithServer(list, serverData)) {
                        setStatus('saving');
                        try {
                            const retryDoc = await apiFetch('/calendars/' + encodeURIComponent(id), {
                                method: 'PATCH',
                                body: {
                                    baseRevision: serverDoc.revision,
                                    mutations: list,
                                    force: Boolean(opts.force)
                                }
                            });
                            adoptSavedDoc(retryDoc);
                            setStatus('saved');
                            if (typeof handlers.onSaved === 'function') {
                                handlers.onSaved(retryDoc);
                            }
                            return retryDoc;
                        } catch (retryErr) {
                            if (retryErr.status === 409 && retryErr.body && retryErr.body.document) {
                                adoptServerRevision(retryErr.body.document);
                                setStatus('conflict');
                                if (typeof handlers.onClassroomConflict === 'function') {
                                    await handlers.onClassroomConflict(
                                        retryErr.body.document,
                                        list
                                    );
                                }
                                throw retryErr;
                            }
                            throw retryErr;
                        }
                    }
                    setStatus('conflict');
                    if (typeof handlers.onClassroomConflict === 'function') {
                        await handlers.onClassroomConflict(serverDoc, list);
                    }
                    throw err;
                }
                setStatus('error', err.message);
                throw err;
            } finally {
                state.saving = false;
            }
        },

        async verifyPassword(password) {
            assertSignedIn();
            return apiFetch('/auth/verify-password', {
                method: 'POST',
                body: { password: String(password || '') }
            });
        },

        async saveDayNotesOnly(dayNotes, options) {
            assertSignedIn();
            if (isViewAsMode()) {
                viewAsNotice('View As: change not saved');
                setStatus('saved');
                return { simulated: true, revision: state.revision };
            }
            if (state.canEdit === false && state.accessLevel !== 'suggester') {
                const err = new Error('You do not have edit access to this calendar');
                err.status = 403;
                throw err;
            }
            const id = CalendarSync.getActiveCalendarId();
            if (!id) {
                throw new Error('No active team calendar');
            }
            const opts = options || {};
            const notes = Array.isArray(dayNotes) ? dayNotes : [];
            // Prefer PATCH mutations when not forcing a full replace.
            if (!opts.forcePut && !opts.force) {
                const mutations = notes
                    .filter((n) => n && n.id)
                    .map((note) => ({
                        entity: 'dayNotes',
                        action: 'mutate',
                        payload: { op: 'upsert', note },
                        timestamp: Date.now()
                    }));
                if (mutations.length) {
                    try {
                        return await CalendarSync.saveClassroomMutations(mutations, opts);
                    } catch (err) {
                        if (err && err.status === 409 && err.body && err.body.document) {
                            const serverList =
                                err.body.document.data && Array.isArray(err.body.document.data.dayNotes)
                                    ? err.body.document.data.dayNotes
                                    : [];
                            let merged = notes;
                            if (
                                typeof global.CCPDayNotes !== 'undefined' &&
                                global.CCPDayNotes.mergeDayNotesById
                            ) {
                                merged = global.CCPDayNotes.mergeDayNotesById(notes, serverList);
                            }
                            const retryMutations = (merged || [])
                                .filter((n) => n && n.id)
                                .map((note) => ({
                                    entity: 'dayNotes',
                                    action: 'mutate',
                                    payload: { op: 'upsert', note },
                                    timestamp: Date.now()
                                }));
                            if (retryMutations.length) {
                                state.revision = err.body.document.revision || state.revision;
                                return await CalendarSync.saveClassroomMutations(retryMutations, {
                                    force: true
                                });
                            }
                        }
                        throw err;
                    }
                }
            }
            setStatus('saving');
            state.saving = true;
            try {
                const doc = await apiFetch('/calendars/' + encodeURIComponent(id), {
                    method: 'PUT',
                    body: {
                        dayNotesOnly: true,
                        dayNotes: notes,
                        revision: opts.force ? undefined : state.revision,
                        force: Boolean(opts.force)
                    }
                });
                adoptSavedDoc(doc);
                setStatus('saved');
                if (typeof handlers.onSaved === 'function') {
                    handlers.onSaved(doc);
                }
                return doc;
            } catch (err) {
                if (err.status === 409 && err.body && err.body.document) {
                    setStatus('conflict');
                    throw err;
                }
                setStatus('error', err.message);
                throw err;
            } finally {
                state.saving = false;
            }
        },

        async saveCalendarMutations(options) {
            assertSignedIn();
            if (liveSyncActive()) {
                // The queued changes are already in the page data; the live diff sends them.
                return saveLiveChanges();
            }
            if (isViewAsMode()) {
                viewAsNotice('View As: change not saved');
                setStatus('saved');
                return { simulated: true, revision: state.revision };
            }
            if (state.canEdit === false) {
                const err = new Error('You do not have edit access to this calendar');
                err.status = 403;
                throw err;
            }
            if (state.readOnly) {
                const acquired = await ensureLockForScheduleWrite();
                if (!acquired) {
                    const err = new Error(
                        state.permissionReadOnly
                            ? 'You do not have edit access to this calendar'
                            : 'Calendar is locked by another teacher'
                    );
                    err.status = state.permissionReadOnly ? 403 : 423;
                    throw err;
                }
            }
            const id = CalendarSync.getActiveCalendarId();
            if (!id) {
                throw new Error('No active team calendar');
            }
            const mutations = getPendingMutations();
            if (!mutations.length) {
                return null;
            }
            const opts = options || {};
            setStatus('saving');
            state.saving = true;
            clearSaveRetryTimer();
            try {
                const doc = await apiFetch('/calendars/' + encodeURIComponent(id), {
                    method: 'PATCH',
                    body: {
                        baseRevision: opts.force ? undefined : state.revision,
                        mutations,
                        force: Boolean(opts.force)
                    }
                });
                const src = getMutationSource();
                if (src && typeof src.flushMutationQueue === 'function') {
                    src.flushMutationQueue(mutations.length);
                }
                if (
                    typeof global.CCPSessionRestore !== 'undefined' &&
                    global.CCPSessionRestore.clearOfflineQueue
                ) {
                    global.CCPSessionRestore.clearOfflineQueue(id);
                }
                state.revision = doc.revision || state.revision;
                state.saveRetryBackoffMs = SAVE_RETRY_BASE_MS;
                setStatus('saved');
                notifyQueueChange();
                if (typeof handlers.onSaved === 'function') {
                    handlers.onSaved(doc);
                }
                return doc;
            } catch (err) {
                if (err.status === 409 && err.body && err.body.document) {
                    const serverDoc = err.body.document;
                    const serverData = serverDoc.data || serverDoc;
                    if (!mutationsOverlapWithServer(mutations, serverData)) {
                        setStatus('saving');
                        try {
                            const retryDoc = await apiFetch('/calendars/' + encodeURIComponent(id), {
                                method: 'PATCH',
                                body: {
                                    baseRevision: serverDoc.revision,
                                    mutations,
                                    force: Boolean(opts.force)
                                }
                            });
                            const src = getMutationSource();
                            if (src && typeof src.flushMutationQueue === 'function') {
                                src.flushMutationQueue(mutations.length);
                            }
                            if (
                                typeof global.CCPSessionRestore !== 'undefined' &&
                                global.CCPSessionRestore.clearOfflineQueue
                            ) {
                                global.CCPSessionRestore.clearOfflineQueue(id);
                            }
                            state.revision = retryDoc.revision || state.revision;
                            state.saveRetryBackoffMs = SAVE_RETRY_BASE_MS;
                            setStatus('saved');
                            notifyQueueChange();
                            if (typeof handlers.onSaved === 'function') {
                                handlers.onSaved(retryDoc);
                            }
                            return retryDoc;
                        } catch (retryErr) {
                            if (retryErr.status === 409 && retryErr.body && retryErr.body.document) {
                                setStatus('conflict');
                                if (typeof handlers.onConflict === 'function') {
                                    const localSnapshot =
                                        typeof global.CCPCalendarMutations !== 'undefined'
                                            ? global.CCPCalendarMutations.applyCalendarMutations(
                                                  serverData,
                                                  mutations
                                              )
                                            : serverData;
                                    await handlers.onConflict(retryErr.body.document, localSnapshot);
                                }
                                throw retryErr;
                            }
                            throw retryErr;
                        }
                    }
                    setStatus('conflict');
                    if (typeof handlers.onConflict === 'function') {
                        const localSnapshot =
                            typeof global.CCPCalendarMutations !== 'undefined'
                                ? global.CCPCalendarMutations.applyCalendarMutations(
                                      serverData,
                                      mutations
                                  )
                                : serverData;
                        await handlers.onConflict(serverDoc, localSnapshot);
                    }
                    throw err;
                }
                if (err.status === 423) {
                    debugLog('error', 'PATCH rejected (423 locked)', err.body);
                    applyLockFromResponse(
                        tagLockDebugSource(err.body || { readOnly: true, lock: err.body && err.body.lock }, 'patch423')
                    );
                    setStatus('error', err.message);
                    scheduleSaveRetry('locked');
                    throw err;
                }
                const isNetwork =
                    !err.status ||
                    err.status === 0 ||
                    err.message === 'Failed to fetch' ||
                    err.message === 'Request timed out';
                if (isNetwork) {
                    setStatus('queued');
                    if (typeof handlers.onOfflineQueued === 'function') {
                        handlers.onOfflineQueued(getPendingMutations().length);
                    }
                    notifyQueueChange();
                    scheduleSaveRetry('offline');
                    const queuedErr = new Error(err.message || 'Offline');
                    queuedErr.queuedOffline = true;
                    queuedErr.status = err.status;
                    throw queuedErr;
                }
                setStatus('error', err.message);
                throw err;
            } finally {
                state.saving = false;
            }
        },

        async saveCalendar(data, options) {
            assertSignedIn();
            if (isViewAsMode()) {
                viewAsNotice('View As: change not saved');
                setStatus('saved');
                return { simulated: true, data, revision: state.revision };
            }
            if (state.canEdit === false) {
                const err = new Error('You do not have edit access to this calendar');
                err.status = 403;
                throw err;
            }
            if (state.readOnly) {
                const acquired = await ensureLockForScheduleWrite();
                if (!acquired) {
                    const err = new Error(
                        state.permissionReadOnly
                            ? 'You do not have edit access to this calendar'
                            : 'Calendar is locked by another teacher'
                    );
                    err.status = state.permissionReadOnly ? 403 : 423;
                    throw err;
                }
            }
            const id = CalendarSync.getActiveCalendarId();
            if (!id) {
                throw new Error('No active team calendar');
            }
            const opts = options || {};
            const name = (data && data.calendarName) || 'Calendar';
            setStatus('saving');
            state.saving = true;
            const putBody = {
                data,
                name,
                revision: opts.force ? undefined : state.revision,
                force: Boolean(opts.force)
            };
            try {
                const doc = await apiFetch('/calendars/' + encodeURIComponent(id), {
                    method: 'PUT',
                    body: putBody
                });
                adoptSavedDoc(doc);
                setStatus('saved');
                if (typeof handlers.onSaved === 'function') {
                    handlers.onSaved(doc);
                }
                return doc;
            } catch (err) {
                if (err.status === 409 && err.body && err.body.document) {
                    setStatus('conflict');
                    if (typeof handlers.onConflict === 'function') {
                        await handlers.onConflict(err.body.document, data);
                    }
                    throw err;
                }
                if (err.status === 409 && err.body && err.body.code === 'DUPLICATE_NAME') {
                    setStatus('error', err.message);
                    if (typeof handlers.onDuplicateName === 'function') {
                        handlers.onDuplicateName(err.message);
                    }
                    throw err;
                }
                if (err.status === 423) {
                    debugLog('error', 'Save rejected (423 locked)', err.body);
                    applyLockFromResponse(
                        tagLockDebugSource(err.body || { readOnly: true, lock: err.body && err.body.lock }, 'save423')
                    );
                    setStatus('error', err.message);
                } else {
                    setStatus('error', err.message);
                }
                throw err;
            } finally {
                state.saving = false;
            }
        },

        scheduleSave(getDataFn) {
            if (typeof TeamAuth !== 'undefined' && TeamAuth.isSignedIn && !TeamAuth.isSignedIn()) {
                return;
            }
            if (state.canEdit === false && state.accessLevel !== 'suggester') {
                return;
            }
            if (liveSyncActive()) {
                // Live sync reads the page data itself when the timer fires.
                state.pendingGetData = null;
                if (state.saveTimer) {
                    clearTimeout(state.saveTimer);
                }
                state.saveTimer = setTimeout(() => {
                    state.saveTimer = null;
                    saveLiveChanges().catch((err) => {
                        if (err && !err.queuedOffline) {
                            console.error('Team save failed:', err);
                        }
                    });
                }, SAVE_DEBOUNCE_MS);
                return;
            }
            if (state.canEdit === false) {
                return;
            }
            state.pendingGetData = getDataFn;
            if (state.saveTimer) {
                clearTimeout(state.saveTimer);
            }
            state.saveTimer = setTimeout(async () => {
                state.saveTimer = null;
                const fn = state.pendingGetData;
                if (!fn || !CalendarSync.getActiveCalendarId()) {
                    return;
                }
                if (state.readOnly) {
                    const acquired = await ensureLockForScheduleWrite();
                    if (!acquired || state.readOnly) {
                        return;
                    }
                }
                try {
                    if (CalendarSync.hasPendingMutations()) {
                        await CalendarSync.saveCalendarMutations();
                        return;
                    }
                    let data;
                    try {
                        data = fn();
                    } catch (e) {
                        setStatus('error', e.message);
                        return;
                    }
                    await CalendarSync.saveCalendar(data);
                } catch (err) {
                    if (err && err.queuedOffline) {
                        return;
                    }
                    if (err.status !== 409) {
                        console.error('Team save failed:', err);
                    }
                }
            }, SAVE_DEBOUNCE_MS);
        },

        cancelPendingSave() {
            if (state.saveTimer) {
                clearTimeout(state.saveTimer);
                state.saveTimer = null;
            }
            state.pendingGetData = null;
        },

        async deleteCalendar(id, password) {
            await apiFetch('/calendars/' + encodeURIComponent(id), {
                method: 'DELETE',
                body: { password: String(password || '') }
            });
            if (state.activeCalendarId === id) {
                state.activeCalendarId = null;
            }
            try {
                if (localStorage.getItem(STORAGE_ACTIVE) === id) {
                    localStorage.removeItem(STORAGE_ACTIVE);
                }
            } catch (_) {
                /* ignore */
            }
        },

        async runBackup() {
            return apiFetch('/backup', { method: 'POST' });
        },

        smartMergeData,

        getPollDelayMs() {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                return POLL_INTERVAL_HIDDEN_MS;
            }
            if (Date.now() - (state.lastUserInputAt || 0) > POLL_USER_IDLE_AFTER_MS) {
                const idleFactor = state.pollBackoffFactor || 1;
                return Math.min(POLL_INTERVAL_MAX_MS, Math.round(POLL_INTERVAL_IDLE_MS * idleFactor));
            }
            try {
                if (typeof document !== 'undefined' && document.body) {
                    if (
                        document.body.classList.contains('notes-page')
                        || document.body.classList.contains('workspace-page')
                    ) {
                        return POLL_INTERVAL_NOTES_MS;
                    }
                }
            } catch (_) {
                /* ignore */
            }
            let base = POLL_INTERVAL_IDLE_MS;
            if (
                state.holdsLock ||
                state.pendingEditRequest ||
                state.remoteNewer ||
                !state.readOnly
            ) {
                base = POLL_INTERVAL_ACTIVE_MS;
            }
            const factor = state.pollBackoffFactor || 1;
            return Math.min(POLL_INTERVAL_MAX_MS, Math.round(base * factor));
        },

        startPolling() {
            CalendarSync.stopPolling();
            if (
                typeof document !== 'undefined' &&
                !state.pollVisibilityBound &&
                typeof document.addEventListener === 'function'
            ) {
                state.pollVisibilityBound = true;
                document.addEventListener('visibilitychange', () => {
                    if (state.pollTimer && document.visibilityState === 'visible') {
                        state.pollResumeSoon = true;
                        CalendarSync.stopPolling();
                        CalendarSync.startPolling();
                    }
                });
            }
            if (
                typeof document !== 'undefined' &&
                !state.pollInputBound &&
                typeof document.addEventListener === 'function'
            ) {
                state.pollInputBound = true;
                const onUserInput = () => {
                    const wasIdle = Date.now() - (state.lastUserInputAt || 0) > POLL_USER_IDLE_AFTER_MS;
                    state.lastUserInputAt = Date.now();
                    if (wasIdle && state.pollTimer) {
                        // Back from idle: check for others' changes right away.
                        state.pollResumeSoon = true;
                        CalendarSync.stopPolling();
                        CalendarSync.startPolling();
                    }
                };
                ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach((type) => {
                    document.addEventListener(type, onUserInput, { passive: true, capture: true });
                });
            }
            const runPollTick = async () => {
                if (typeof TeamAuth !== 'undefined' && TeamAuth.isSignedIn && !TeamAuth.isSignedIn()) {
                    CalendarSync.stopPolling();
                    return;
                }
                const id = CalendarSync.getActiveCalendarId();
                if (!id) {
                    state.pollTimer = setTimeout(runPollTick, CalendarSync.getPollDelayMs());
                    return;
                }
                try {
                    const meta = await apiFetch(metaPath(id));
                    state.pollBackoffFactor = 1;
                    // Presence is stamped server-side as a side effect of this meta
                    // poll (skipped in View As there), so no separate heartbeat request
                    // is needed per tick.
                    const lockState = applyLockFromResponse(tagLockDebugSource(meta, 'poll'));
                    if (liveSyncActive() && !isViewAsMode()) {
                        // Live sync: send what this page changed, pull what others changed.
                        const idle = !state.saving && !state.saveTimer;
                        if (idle && Number(meta.revision) > Number(state.revision)) {
                            await pullLatest('poll').catch((err) => {
                                debugLog('error', 'Live pull failed', { message: err && err.message });
                            });
                        }
                        if (!state.saving && !state.saveTimer && !state.saveRetryTimer &&
                            sendableChanges(computeLocalChanges()).length) {
                            saveLiveChanges().catch(() => {});
                        }
                        if (typeof handlers.onLiveTick === 'function') {
                            handlers.onLiveTick(meta, lockState);
                        }
                        state.pollTimer = setTimeout(runPollTick, CalendarSync.getPollDelayMs());
                        return;
                    }
                    debugLog('poll', 'Meta poll', {
                        revision: meta.revision,
                        clientRevision: state.revision,
                        saving: state.saving,
                        readOnly: state.readOnly,
                        holdsLock: state.holdsLock,
                        pollDelayMs: CalendarSync.getPollDelayMs(),
                        holderUserId: meta.lock && meta.lock.holderUserId
                    });
                    const pendingSave = CalendarSync.hasPendingSave();
                    const viewAsSkipReload = isViewAsMode();
                    if (!state.saving && !pendingSave && !viewAsSkipReload) {
                        if (
                            CalendarSync.hasPendingMutations() &&
                            state.holdsLock &&
                            !state.readOnly
                        ) {
                            CalendarSync.saveCalendarMutations().catch((drainErr) => {
                                if (!drainErr || !drainErr.queuedOffline) {
                                    debugLog('debug', 'Poll mutation drain failed', {
                                        message: drainErr && drainErr.message
                                    });
                                }
                            });
                        }
                        if (meta.revision > state.revision) {
                            state.remoteNewer = true;
                            if (typeof handlers.onRemoteNewer === 'function') {
                                handlers.onRemoteNewer(meta);
                            }
                        }
                        if (typeof handlers.onLockOrRevisionChange === 'function') {
                            await handlers.onLockOrRevisionChange(meta, lockState);
                        }
                    } else {
                        debugLog('poll', 'Skipped revision/reload handlers (saving or pending save)', {
                            saving: state.saving,
                            pendingSave
                        });
                    }
                } catch (pollErr) {
                    const status = pollErr && pollErr.status;
                    if (status === 429 || (status >= 500 && status < 600)) {
                        state.pollBackoffFactor = Math.min(
                            4,
                            (state.pollBackoffFactor || 1) * POLL_BACKOFF_FACTOR
                        );
                    }
                    debugLog('error', 'Poll failed', {
                        message: pollErr && pollErr.message,
                        status,
                        pollBackoffFactor: state.pollBackoffFactor
                    });
                }
                state.pollTimer = setTimeout(runPollTick, CalendarSync.getPollDelayMs());
            };
            const firstDelay = state.pollResumeSoon ? POLL_RESUME_DELAY_MS : CalendarSync.getPollDelayMs();
            state.pollResumeSoon = false;
            state.pollTimer = setTimeout(runPollTick, firstDelay);
        },

        stopPolling() {
            if (state.pollTimer) {
                clearTimeout(state.pollTimer);
                state.pollTimer = null;
            }
        },

        isLockDebugEnabled: lockDebugEnabled,
        setLockDebugEnabled,
        logLockDebug: debugLog,
        clearLockDebugLog,
        getLockDebugLog() {
            return lockDebug.log.slice();
        },
        getLockDebugSnapshot(extra) {
            return lockSnapshot(extra);
        }
    };

    global.CalendarSync = CalendarSync;
})(typeof window !== 'undefined' ? window : globalThis);
