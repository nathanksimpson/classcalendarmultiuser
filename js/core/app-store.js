/**
 * Lightweight mutable store for appData — dispatch actions, middleware, slice snapshots.
 */
(function (global) {
    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function actionToMutation(action) {
        if (!action || !action.type) {
            return null;
        }
        const ts = Date.now();
        switch (action.type) {
            case 'classes/upsert':
                if (!action.classData || !action.classData.id) {
                    return null;
                }
                return {
                    entity: 'classes',
                    action: 'upsert',
                    payload: { class: deepClone(action.classData) },
                    timestamp: ts
                };
            case 'classes/remove':
                if (!action.id) {
                    return null;
                }
                return {
                    entity: 'classes',
                    action: 'remove',
                    payload: { classId: action.id },
                    timestamp: ts
                };
            case 'events/upsert':
                if (!action.event || !action.event.id) {
                    return null;
                }
                return {
                    entity: 'events',
                    action: 'upsert',
                    payload: { event: deepClone(action.event) },
                    timestamp: ts
                };
            case 'events/remove':
                if (!action.id) {
                    return null;
                }
                return {
                    entity: 'events',
                    action: 'remove',
                    payload: { eventId: action.id },
                    timestamp: ts
                };
            case 'dayNotes/upsert':
                if (!action.note || !action.note.id) {
                    return null;
                }
                return {
                    entity: 'dayNotes',
                    action: 'mutate',
                    payload: { op: 'upsert', note: deepClone(action.note) },
                    timestamp: ts
                };
            case 'dayNotes/remove':
                if (!action.id) {
                    return null;
                }
                return {
                    entity: 'dayNotes',
                    action: 'mutate',
                    payload: { op: 'remove', noteId: action.id },
                    timestamp: ts
                };
            case 'dayNotes/mutate':
                if (action.op === 'upsert' && action.note && action.note.id) {
                    return {
                        entity: 'dayNotes',
                        action: 'mutate',
                        payload: { op: 'upsert', note: deepClone(action.note) },
                        timestamp: ts
                    };
                }
                if (action.op === 'remove' && action.id) {
                    return {
                        entity: 'dayNotes',
                        action: 'mutate',
                        payload: { op: 'remove', noteId: action.id },
                        timestamp: ts
                    };
                }
                return null;
            default:
                return null;
        }
    }

    function createAppStore(initialState, options) {
        let stateRef = initialState;
        const middleware = [];
        let mutationQueue = [];
        let mutationCalendarId = null;
        let shouldEnqueueMutations = null;

        const opts = options || {};
        if (typeof opts.shouldEnqueue === 'function') {
            shouldEnqueueMutations = opts.shouldEnqueue;
        }

        function persistMutationQueue() {
            if (
                !mutationCalendarId ||
                typeof global.CCPSessionRestore === 'undefined' ||
                !global.CCPSessionRestore.saveOfflineQueue
            ) {
                return;
            }
            global.CCPSessionRestore.saveOfflineQueue(mutationCalendarId, mutationQueue);
        }

        function setMutationCalendarId(calendarId) {
            mutationCalendarId = calendarId ? String(calendarId) : null;
            if (
                mutationCalendarId &&
                typeof global.CCPSessionRestore !== 'undefined' &&
                global.CCPSessionRestore.loadOfflineQueue
            ) {
                mutationQueue = global.CCPSessionRestore.loadOfflineQueue(mutationCalendarId);
            } else {
                mutationQueue = [];
            }
        }

        function configureMutationSync(config) {
            if (config && typeof config.shouldEnqueue === 'function') {
                shouldEnqueueMutations = config.shouldEnqueue;
            }
        }

        function enqueueMutation(mutation) {
            if (!mutation) {
                return;
            }
            mutationQueue.push(mutation);
            persistMutationQueue();
        }

        function enqueueFromAction(action) {
            if (action && action.meta && action.meta.skipSyncQueue) {
                return;
            }
            if (shouldEnqueueMutations && !shouldEnqueueMutations(action)) {
                return;
            }
            const mutation = actionToMutation(action);
            if (mutation) {
                enqueueMutation(mutation);
            }
        }

        function getMutationQueue() {
            return mutationQueue.slice();
        }

        function flushMutationQueue(acknowledgedCount) {
            const n = Math.max(0, Math.min(Number(acknowledgedCount) || 0, mutationQueue.length));
            if (n > 0) {
                mutationQueue.splice(0, n);
                persistMutationQueue();
            }
            return getMutationQueue();
        }

        function clearMutationQueue() {
            mutationQueue = [];
            if (
                mutationCalendarId &&
                typeof global.CCPSessionRestore !== 'undefined' &&
                global.CCPSessionRestore.clearOfflineQueue
            ) {
                global.CCPSessionRestore.clearOfflineQueue(mutationCalendarId);
            }
        }

        function applyMutationLocally(state, mutation) {
            if (
                typeof global.CCPCalendarMutations !== 'undefined' &&
                global.CCPCalendarMutations.applyCalendarMutations
            ) {
                return global.CCPCalendarMutations.applyCalendarMutations(state, [mutation]);
            }
            return state;
        }

        function getState() {
            return stateRef;
        }

        function setStateRef(nextRef) {
            stateRef = nextRef;
        }

        function use(fn) {
            if (typeof fn === 'function') {
                middleware.push(fn);
            }
        }

        function notify(action) {
            middleware.forEach((fn) => {
                try {
                    fn(action);
                } catch (err) {
                    console.error('CCPAppStore middleware error:', err);
                }
            });
        }

        function dispatch(action) {
            const state = getState();
            if (!action || !action.type) {
                return action;
            }

            switch (action.type) {
                case 'ui/set': {
                    if (!state.ui || typeof state.ui !== 'object') {
                        state.ui = {};
                    }
                    state.ui[action.key] = action.value;
                    break;
                }
                case 'ui/merge': {
                    if (!state.ui || typeof state.ui !== 'object') {
                        state.ui = {};
                    }
                    Object.assign(state.ui, action.partial || {});
                    break;
                }
                case 'calendar/replace': {
                    Object.keys(state).forEach((key) => {
                        delete state[key];
                    });
                    Object.assign(state, action.data || {});
                    break;
                }
                case 'sync/remote': {
                    Object.keys(action.data || {}).forEach((key) => {
                        if (key !== 'ui') {
                            state[key] = action.data[key];
                        }
                    });
                    break;
                }
                case 'classes/upsert': {
                    if (!Array.isArray(state.classes)) {
                        state.classes = [];
                    }
                    const classData = action.classData;
                    if (!classData || !classData.id) {
                        break;
                    }
                    const idx = state.classes.findIndex((c) => c && c.id === classData.id);
                    if (idx >= 0) {
                        state.classes[idx] = classData;
                    } else {
                        state.classes.push(classData);
                    }
                    break;
                }
                case 'classes/remove': {
                    if (!Array.isArray(state.classes)) {
                        state.classes = [];
                        break;
                    }
                    const id = action.id;
                    state.classes = state.classes.filter((c) => c && c.id !== id);
                    break;
                }
                case 'events/upsert': {
                    if (!Array.isArray(state.events)) {
                        state.events = [];
                    }
                    const event = action.event;
                    if (!event || !event.id) {
                        break;
                    }
                    const idx = state.events.findIndex((e) => e && e.id === event.id);
                    if (idx >= 0) {
                        state.events[idx] = event;
                    } else {
                        state.events.push(event);
                    }
                    break;
                }
                case 'events/remove': {
                    if (!Array.isArray(state.events)) {
                        state.events = [];
                        break;
                    }
                    const id = action.id;
                    state.events = state.events.filter((e) => e && e.id !== id);
                    break;
                }
                case 'dayNotes/upsert': {
                    if (!Array.isArray(state.dayNotes)) {
                        state.dayNotes = [];
                    }
                    const note = action.note;
                    if (!note || !note.id) {
                        break;
                    }
                    const idx = state.dayNotes.findIndex((n) => n && n.id === note.id);
                    if (idx >= 0) {
                        state.dayNotes[idx] = note;
                    } else {
                        state.dayNotes.push(note);
                    }
                    break;
                }
                case 'dayNotes/remove': {
                    if (!Array.isArray(state.dayNotes)) {
                        state.dayNotes = [];
                        break;
                    }
                    state.dayNotes = state.dayNotes.filter((n) => n && n.id !== action.id);
                    break;
                }
                case 'dayNotes/mutate': {
                    if (action.op === 'upsert' && action.note && action.note.id) {
                        if (!Array.isArray(state.dayNotes)) {
                            state.dayNotes = [];
                        }
                        const idx = state.dayNotes.findIndex((n) => n && n.id === action.note.id);
                        if (idx >= 0) {
                            state.dayNotes[idx] = action.note;
                        } else {
                            state.dayNotes.push(action.note);
                        }
                    } else if (action.op === 'remove' && action.id) {
                        state.dayNotes = (state.dayNotes || []).filter((n) => n && n.id !== action.id);
                    } else {
                        state.dayNotes = Array.isArray(action.dayNotes) ? action.dayNotes : [];
                    }
                    break;
                }
                default:
                    break;
            }

            enqueueFromAction(action);
            notify(action);
            return action;
        }

        return {
            getState,
            setStateRef,
            use,
            dispatch,
            setMutationCalendarId,
            configureMutationSync,
            getMutationQueue,
            flushMutationQueue,
            clearMutationQueue,
            enqueueMutation,
            applyMutationLocally,
            actionToMutation
        };
    }

    function snapshotSlice(store, slice) {
        const state = store.getState();
        if (slice === 'ui') {
            return deepClone(state.ui || {});
        }
        if (slice === 'classes') {
            return deepClone(state.classes || []);
        }
        if (slice === 'events') {
            return deepClone(state.events || []);
        }
        if (slice === 'dayNotes') {
            return deepClone(state.dayNotes || []);
        }
        if (Object.prototype.hasOwnProperty.call(state, slice)) {
            return deepClone(state[slice]);
        }
        return undefined;
    }

    function restoreSlice(store, slice, snapshot) {
        const state = store.getState();
        if (slice === 'ui') {
            state.ui = deepClone(snapshot);
            return;
        }
        if (slice === 'classes') {
            state.classes = deepClone(snapshot);
            return;
        }
        if (slice === 'events') {
            state.events = deepClone(snapshot);
            return;
        }
        if (slice === 'dayNotes') {
            state.dayNotes = deepClone(snapshot);
            return;
        }
        if (snapshot !== undefined) {
            state[slice] = deepClone(snapshot);
        }
    }

    global.CCPAppStore = {
        createAppStore,
        snapshotSlice,
        restoreSlice,
        actionToMutation
    };
})(typeof window !== 'undefined' ? window : globalThis);
