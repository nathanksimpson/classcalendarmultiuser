/**
 * Team calendar sync — talks to /api on the same host as this page.
 */
(function (global) {
    const API = '/api';
    const STORAGE_ACTIVE = 'teamCalendarActiveId';
    const SAVE_DEBOUNCE_MS = 1500;
    const POLL_INTERVAL_MS = 5000;

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
        holdsLock: false
    };

    let handlers = {
        onStatusChange: null,
        onRemoteNewer: null,
        onConflict: null,
        onLockChange: null
    };

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
        state.readOnly = Boolean(json && json.readOnly);
        state.lock = (json && json.lock) || null;
        state.holdsLock = Boolean(state.lock && !state.readOnly);
        if (typeof handlers.onLockChange === 'function') {
            handlers.onLockChange({
                readOnly: state.readOnly,
                lock: state.lock,
                holdsLock: state.holdsLock
            });
        }
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

        async acquireLock(id, force) {
            const result = await apiFetch('/calendars/' + encodeURIComponent(id) + '/lock', {
                method: 'POST',
                body: { force: Boolean(force) }
            });
            applyLockFromResponse(result);
            return result;
        },

        async releaseLock(id) {
            const calId = id || CalendarSync.getActiveCalendarId();
            if (!calId) {
                return;
            }
            try {
                await apiFetch('/calendars/' + encodeURIComponent(calId) + '/lock', {
                    method: 'DELETE'
                });
            } catch (_) {
                /* ignore */
            }
            state.readOnly = false;
            state.lock = null;
            state.holdsLock = false;
            if (typeof handlers.onLockChange === 'function') {
                handlers.onLockChange({ readOnly: false, lock: null, holdsLock: false });
            }
        },

        async loadCalendar(id) {
            const doc = await apiFetch('/calendars/' + encodeURIComponent(id));
            state.revision = doc.revision || 0;
            state.remoteNewer = false;
            applyLockFromResponse(doc);
            return doc;
        },

        async createCalendar(data, name) {
            const doc = await apiFetch('/calendars', {
                method: 'POST',
                body: { name, data }
            });
            state.revision = doc.revision || 1;
            await CalendarSync.acquireLock(doc.id, true);
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
                return doc;
            } catch (err) {
                if (err.status === 409 && err.body && err.body.document) {
                    setStatus('conflict');
                    if (typeof handlers.onConflict === 'function') {
                        await handlers.onConflict(err.body.document, data);
                    }
                    throw err;
                }
                if (err.status === 423) {
                    applyLockFromResponse(err.body || { readOnly: true, lock: err.body && err.body.lock });
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
                if (!id || state.saving) {
                    return;
                }
                try {
                    const meta = await apiFetch('/calendars/' + encodeURIComponent(id) + '/meta');
                    if (meta.revision > state.revision) {
                        state.remoteNewer = true;
                        if (typeof handlers.onRemoteNewer === 'function') {
                            handlers.onRemoteNewer(meta);
                        }
                    }
                    applyLockFromResponse(meta);
                } catch (_) {
                    /* ignore poll errors */
                }
            }, POLL_INTERVAL_MS);
        },

        stopPolling() {
            if (state.pollTimer) {
                clearInterval(state.pollTimer);
                state.pollTimer = null;
            }
        }
    };

    global.CalendarSync = CalendarSync;
})(typeof window !== 'undefined' ? window : globalThis);
