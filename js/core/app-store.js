/**
 * Lightweight mutable store for appData — dispatch actions, middleware, slice snapshots.
 */
(function (global) {
    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function createAppStore(initialState) {
        let stateRef = initialState;
        const middleware = [];

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
                case 'dayNotes/mutate': {
                    state.dayNotes = Array.isArray(action.dayNotes) ? action.dayNotes : [];
                    break;
                }
                default:
                    break;
            }

            notify(action);
            return action;
        }

        return {
            getState,
            setStateRef,
            use,
            dispatch
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
        restoreSlice
    };
})(typeof window !== 'undefined' ? window : globalThis);
