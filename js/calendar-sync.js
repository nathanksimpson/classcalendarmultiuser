/**
 * Team calendar sync — talks to /api on the same host as this page.
 */
(function (global) {
    const API = '/api';
    const STORAGE_ACTIVE = 'teamCalendarActiveId';
    const SAVE_DEBOUNCE_MS = 1500;
    const POLL_INTERVAL_MS = 3000;
    const LOCK_DEBUG_STORAGE = 'teamLockDebug';
    const LOCK_DEBUG_LOG_MAX = 100;

    const state = {
        revision: 0,
        remoteNewer: false,
        activeCalendarId: null,
        saveTimer: null,
        pollTimer: null,
        saving: false,
        pendingGetData: null,
        readOnly: false,
        lock: null,
        holdsLock: false,
        pendingEditRequest: false,
        lockStaleMinutes: 20
    };

    let handlers = {
        onStatusChange: null,
        onRemoteNewer: null,
        onConflict: null,
        onLockChange: null,
        onLockOrRevisionChange: null,
        onLockDebugChange: null,
        onDuplicateName: null,
        onSaved: null
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
        const ret = encodeURIComponent(location.pathname + location.search);
        location.replace('/login.html?return=' + ret);
    }

    async function apiFetch(path, options) {
        const opts = Object.assign({ credentials: 'same-origin' }, options || {});
        const headers = Object.assign({}, opts.headers || {});
        if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(opts.body);
        }
        opts.headers = headers;
        const res = await fetch(API + path, opts);
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

    function applyLockFromResponse(json) {
        const wasReadOnly = state.readOnly;
        const wasHoldsLock = state.holdsLock;
        state.readOnly = Boolean(json && json.readOnly);
        state.lock = (json && json.lock) || null;
        if (json && typeof json.holdsLock === 'boolean') {
            state.holdsLock = json.holdsLock;
        } else if (json && json.lock && json.lock.holderUserId && typeof TeamAuth !== 'undefined' && TeamAuth.getUser()) {
            const me = TeamAuth.getUser();
            state.holdsLock = json.lock.holderUserId === me.id && !state.readOnly;
        } else {
            state.holdsLock = Boolean(state.lock && !state.readOnly);
        }
        state.pendingEditRequest = Boolean(json && json.pendingEditRequest);
        if (json && json.lockStaleMinutes != null) {
            state.lockStaleMinutes = json.lockStaleMinutes;
        }
        const lockState = {
            readOnly: state.readOnly,
            lock: state.lock,
            holdsLock: state.holdsLock,
            pendingEditRequest: state.pendingEditRequest,
            lockStaleMinutes: state.lockStaleMinutes,
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
            handlers.onStatusChange(status, detail);
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

        getEditorName() {
            if (typeof TeamAuth !== 'undefined' && TeamAuth.getUser()) {
                const u = TeamAuth.getUser();
                return u.displayName || u.email || 'Teacher';
            }
            return 'Teacher';
        },

        getActiveCalendarId() {
            if (state.activeCalendarId) {
                return state.activeCalendarId;
            }
            try {
                return localStorage.getItem(STORAGE_ACTIVE);
            } catch (_) {
                return null;
            }
        },

        setActiveCalendarId(id) {
            state.activeCalendarId = id;
            try {
                if (id) {
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
                const res = await apiFetch('/health');
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

        async acquireLock(id) {
            debugLog('api', 'POST /lock (acquire)', { calendarId: id });
            const result = await apiFetch('/calendars/' + encodeURIComponent(id) + '/lock', {
                method: 'POST',
                body: {}
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

        async flushPendingSave() {
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
        },

        async touchLock(id) {
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

        async saveCalendar(data, options) {
            if (state.readOnly) {
                const err = new Error('Calendar is locked by another teacher');
                err.status = 423;
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
            if (state.readOnly) {
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
        },

        async runBackup() {
            return apiFetch('/backup', { method: 'POST' });
        },

        smartMergeData,

        startPolling() {
            if (state.pollTimer) {
                clearInterval(state.pollTimer);
            }
            state.pollTimer = setInterval(async () => {
                const id = CalendarSync.getActiveCalendarId();
                if (!id) {
                    return;
                }
                try {
                    const meta = await apiFetch('/calendars/' + encodeURIComponent(id) + '/meta');
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
                        holderUserId: meta.lock && meta.lock.holderUserId
                    });
                    if (!state.saving) {
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
                        debugLog('poll', 'Skipped revision/reload handlers (saving=true)');
                    }
                } catch (pollErr) {
                    debugLog('error', 'Poll failed', { message: pollErr && pollErr.message });
                }
            }, POLL_INTERVAL_MS);
        },

        stopPolling() {
            if (state.pollTimer) {
                clearInterval(state.pollTimer);
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
