/**
 * Team calendar sync — talks to /api on the same host as this page.
 */
(function (global) {
    const API = '/api';
    const STORAGE_ACTIVE = 'teamCalendarActiveId';
    const SAVE_DEBOUNCE_MS = 1500;
    const POLL_INTERVAL_ACTIVE_MS = 3000;
    const POLL_INTERVAL_IDLE_MS = 15000;
    const POLL_INTERVAL_HIDDEN_MS = 60000;
    const POLL_INTERVAL_MAX_MS = 60000;
    const POLL_BACKOFF_FACTOR = 1.5;
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
        saving: false,
        pendingGetData: null,
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
        notificationMeta: {}
    };

    let handlers = {
        onStatusChange: null,
        onRemoteNewer: null,
        onConflict: null,
        onLockChange: null,
        onLockOrRevisionChange: null,
        onLockDebugChange: null,
        onDuplicateName: null,
        onSaved: null,
        onPrepareLogout: null,
        onNotificationMetaLoaded: null
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
        state.readOnly = Boolean(json && json.readOnly);
        if (state.canEdit === false) {
            state.readOnly = true;
        }
        state.lock = (json && json.lock) || null;
        if (json && typeof json.holdsLock === 'boolean') {
            state.holdsLock = json.holdsLock;
        } else if (json && json.lock && json.lock.holderUserId && typeof TeamAuth !== 'undefined' && TeamAuth.getUser()) {
            const me = TeamAuth.getUser();
            state.holdsLock = json.lock.holderUserId === me.id;
        } else {
            state.holdsLock = false;
        }
        state.pendingEditRequest = Boolean(json && json.pendingEditRequest);
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

    function setStatus(status, detail) {
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
        merged.studentPoints = mergeArrayById(local.studentPoints, server.studentPoints, 'id');
        merged.studentTests = mergeArrayById(local.studentTests, server.studentTests);
        if (local.ui || server.ui) {
            merged.ui = Object.assign({}, server.ui || {}, local.ui || {});
        }
        merged.calendarName = local.calendarName || server.calendarName;
        merged.termStart = local.termStart || server.termStart;
        merged.termMonthCount = local.termMonthCount != null ? local.termMonthCount : server.termMonthCount;
        merged.schemaVersion =
            Math.max(local.schemaVersion || 0, server.schemaVersion || 0) ||
            local.schemaVersion ||
            server.schemaVersion;
        return merged;
    }

    const CalendarSync = {
        state,

        setHandlers(h) {
            handlers = Object.assign({}, handlers, h || {});
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
        },

        isReadOnly() {
            return state.readOnly;
        },

        async checkHealth() {
            try {
                const res = await apiFetch('/health', { timeoutMs: 8000 });
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
            const meta = await apiFetch('/calendars/' + encodeURIComponent(calId) + '/meta');
            applyLockFromResponse(tagLockDebugSource(meta, 'refreshLockMeta'));
            return meta;
        },

        async acquireLock(id, opts) {
            if (state.canEdit === false) {
                const err = new Error('You do not have edit access to this calendar');
                err.status = 403;
                throw err;
            }
            if (isViewAsMode()) {
                const calId = id || CalendarSync.getActiveCalendarId();
                const meta = await apiFetch('/calendars/' + encodeURIComponent(calId) + '/meta');
                if (meta.readOnly && !meta.holdsLock) {
                    const err = new Error(
                        meta.permissionReadOnly
                            ? 'You do not have edit access to this calendar'
                            : 'Calendar is locked by another teacher'
                    );
                    err.status = meta.permissionReadOnly ? 403 : 423;
                    throw err;
                }
                state.simulatedLock = true;
                state.holdsLock = true;
                state.readOnly = false;
                applyLockFromResponse(
                    tagLockDebugSource(
                        Object.assign({}, meta, { holdsLock: true, readOnly: false, simulatedLock: true }),
                        'acquireLockSimulated'
                    )
                );
                return { acquired: true, simulated: true };
            }
            const force = Boolean(opts && opts.force);
            debugLog('api', 'POST /lock (acquire)', { calendarId: id, force });
            const result = await apiFetch('/calendars/' + encodeURIComponent(id) + '/lock', {
                method: 'POST',
                body: { force }
            });
            applyLockFromResponse(tagLockDebugSource(result, 'acquireLock'));
            debugLog('api', 'POST /lock result', {
                editRequestRecorded: result && result.editRequestRecorded,
                acquired: result && result.acquired
            });
            return result;
        },

        async grantLockToPending(id) {
            const calId = id || CalendarSync.getActiveCalendarId();
            if (!calId) {
                throw new Error('No active team calendar');
            }
            await CalendarSync.flushPendingSave();
            debugLog('api', 'POST /lock/grant', { calendarId: calId });
            const result = await apiFetch('/calendars/' + encodeURIComponent(calId) + '/lock/grant', {
                method: 'POST',
                body: {}
            });
            applyLockFromResponse(tagLockDebugSource(result, 'grantLock'));
            return result;
        },

        async dismissLockRequest(id) {
            const calId = id || CalendarSync.getActiveCalendarId();
            if (!calId) {
                throw new Error('No active team calendar');
            }
            debugLog('api', 'POST /lock/dismiss', { calendarId: calId });
            const result = await apiFetch('/calendars/' + encodeURIComponent(calId) + '/lock/dismiss', {
                method: 'POST',
                body: {}
            });
            applyLockFromResponse(tagLockDebugSource(result, 'dismissLock'));
            return result;
        },

        hasPendingSave() {
            return Boolean(state.saveTimer || state.pendingGetData || state.saving);
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
            if (!fn || state.readOnly || !CalendarSync.getActiveCalendarId()) {
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

        async touchLock(id) {
            if (isViewAsMode() && state.simulatedLock) {
                return { touched: true, simulated: true };
            }
            const calId = id || CalendarSync.getActiveCalendarId();
            if (!calId || !state.holdsLock) {
                return { touched: false };
            }
            try {
                const result = await apiFetch('/calendars/' + encodeURIComponent(calId) + '/lock/touch', {
                    method: 'POST',
                    body: {}
                });
                applyLockFromResponse(tagLockDebugSource(result, 'touchLock'));
                return result;
            } catch (err) {
                debugLog('error', 'POST /lock/touch failed', { message: err && err.message });
                return { touched: false };
            }
        },

        async releaseLock(id) {
            if (isViewAsMode() && state.simulatedLock) {
                state.simulatedLock = false;
                state.holdsLock = false;
                const calId = id || CalendarSync.getActiveCalendarId();
                if (calId) {
                    await CalendarSync.refreshLockMeta(calId);
                }
                return { released: true, simulated: true };
            }
            const calId = id || CalendarSync.getActiveCalendarId();
            if (!calId) {
                return { released: false };
            }
            debugLog('api', 'DELETE /lock (release)', { calendarId: calId });
            const result = await apiFetch('/calendars/' + encodeURIComponent(calId) + '/lock', {
                method: 'DELETE'
            });
            debugLog('api', 'DELETE /lock result', result);
            await CalendarSync.refreshLockMeta(calId);
            return result;
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

        async loadCalendar(id) {
            debugLog('api', 'GET /calendars/:id (load)', { calendarId: id });
            const doc = await apiFetch('/calendars/' + encodeURIComponent(id));
            state.revision = doc.revision || 0;
            state.remoteNewer = false;
            applyLockFromResponse(tagLockDebugSource(doc, 'loadCalendar'));
            return doc;
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
            const id = CalendarSync.getActiveCalendarId();
            if (!id) {
                throw new Error('No active team calendar');
            }
            const opts = options || {};
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
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'studentPoints')) {
                body.studentPoints = fields.studentPoints;
            }
            if (fields && Object.prototype.hasOwnProperty.call(fields, 'studentTests')) {
                body.studentTests = fields.studentTests;
            }
            setStatus('saving');
            state.saving = true;
            try {
                const doc = await apiFetch('/calendars/' + encodeURIComponent(id), {
                    method: 'PUT',
                    body
                });
                state.revision = doc.revision || state.revision;
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
            setStatus('saving');
            state.saving = true;
            try {
                const doc = await apiFetch('/calendars/' + encodeURIComponent(id), {
                    method: 'PUT',
                    body: {
                        dayNotesOnly: true,
                        dayNotes: Array.isArray(dayNotes) ? dayNotes : [],
                        revision: opts.force ? undefined : state.revision,
                        force: Boolean(opts.force)
                    }
                });
                state.revision = doc.revision || state.revision;
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
                const err = new Error(
                    state.permissionReadOnly
                        ? 'You do not have edit access to this calendar'
                        : 'Calendar is locked by another teacher'
                );
                err.status = state.permissionReadOnly ? 403 : 423;
                throw err;
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
                state.revision = doc.revision || state.revision;
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
            if (state.readOnly || state.canEdit === false) {
                return;
            }
            state.pendingGetData = getDataFn;
            if (state.saveTimer) {
                clearTimeout(state.saveTimer);
            }
            state.saveTimer = setTimeout(async () => {
                state.saveTimer = null;
                const fn = state.pendingGetData;
                if (!fn || !CalendarSync.getActiveCalendarId() || state.readOnly) {
                    return;
                }
                let data;
                try {
                    data = fn();
                } catch (e) {
                    setStatus('error', e.message);
                    return;
                }
                try {
                    await CalendarSync.saveCalendar(data);
                } catch (err) {
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

        async deleteCalendar(id) {
            await apiFetch('/calendars/' + encodeURIComponent(id), { method: 'DELETE' });
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
            try {
                if (typeof document !== 'undefined' && document.body) {
                    if (
                        document.body.classList.contains('notes-page')
                        || document.body.classList.contains('workspace-page')
                    ) {
                        return 1000;
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
                        CalendarSync.stopPolling();
                        CalendarSync.startPolling();
                    }
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
                    const meta = await apiFetch('/calendars/' + encodeURIComponent(id) + '/meta');
                    state.pollBackoffFactor = 1;
                    if (!isViewAsMode()) {
                        const hbHeaders = { 'Content-Type': 'application/json' };
                        if (typeof TeamAuth !== 'undefined' && TeamAuth.authHeaders) {
                            Object.assign(hbHeaders, TeamAuth.authHeaders());
                        }
                        fetch('/api/presence/heartbeat', {
                            method: 'POST',
                            credentials: 'same-origin',
                            headers: hbHeaders,
                            body: JSON.stringify({
                                calendarId: id,
                                calendarName: meta.name || ''
                            })
                        }).catch(() => {});
                    }
                    const lockState = applyLockFromResponse(tagLockDebugSource(meta, 'poll'));
                    if (state.holdsLock) {
                        await CalendarSync.touchLock(id);
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
            state.pollTimer = setTimeout(runPollTick, CalendarSync.getPollDelayMs());
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
