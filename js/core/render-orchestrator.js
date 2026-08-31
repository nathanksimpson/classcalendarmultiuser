/**
 * Debounced render registry — maps store actions to UI refresh handlers.
 */
(function (global) {
    const handlers = new Map();
    const pending = new Set();
    let flushRaf = 0;

    function register(name, fn) {
        if (!name || typeof fn !== 'function') {
            return;
        }
        handlers.set(name, fn);
    }

    function requestRender(name) {
        if (!name || !handlers.has(name)) {
            return;
        }
        pending.add(name);
        if (flushRaf) {
            return;
        }
        flushRaf = requestAnimationFrame(() => {
            flushRaf = 0;
            const names = [...pending];
            pending.clear();
            names.forEach((key) => {
                const fn = handlers.get(key);
                if (fn) {
                    try {
                        fn();
                    } catch (err) {
                        console.error('CCPRenderOrchestrator render error:', key, err);
                    }
                }
            });
        });
    }

    function requestMany(names) {
        (names || []).forEach((name) => requestRender(name));
    }

    function uiActionAffectsCalendar(action) {
        if (!action || action.meta && action.meta.silent) {
            return false;
        }
        if (action.type === 'ui/set') {
            return action.key === 'lessonFilters'
                || action.key === 'visibilityFilters'
                || action.key === 'calendarViewMode'
                || action.key === 'showAllClassCurricula';
        }
        if (action.type === 'ui/merge') {
            const partial = action.partial || {};
            return partial.lessonFilters !== undefined
                || partial.visibilityFilters !== undefined
                || partial.calendarViewMode !== undefined
                || partial.showAllClassCurricula !== undefined;
        }
        return false;
    }

    function subscribeToStore(store) {
        if (!store || typeof store.use !== 'function') {
            return;
        }
        store.use((action) => {
            if (!action || (action.meta && action.meta.silent)) {
                return;
            }

            if (uiActionAffectsCalendar(action)) {
                if (typeof global.invalidateScheduleCache === 'function') {
                    global.invalidateScheduleCache();
                }
                requestRender('calendar');
                return;
            }

            const type = action.type || '';
            if (type === 'classes/upsert' || type === 'classes/remove') {
                requestMany(['calendar', 'classList', 'syllabus', 'timetable', 'cohorts', 'homework', 'setupBoard']);
                return;
            }
            if (type === 'events/upsert' || type === 'events/remove') {
                requestMany(['calendar', 'eventList', 'syllabus']);
                return;
            }
            if (type === 'dayNotes/upsert' || type === 'dayNotes/remove' || type === 'dayNotes/mutate') {
                requestMany(['calendar', 'classNotes']);
                return;
            }
            if (type === 'calendar/replace' || type === 'sync/remote') {
                requestMany([
                    'calendar',
                    'classList',
                    'eventList',
                    'classNotes',
                    'syllabus',
                    'timetable',
                    'cohorts',
                    'homework',
                    'setupBoard'
                ]);
            }
        });
    }

    global.CCPRenderOrchestrator = {
        register,
        requestRender,
        requestMany,
        subscribeToStore
    };
})(typeof window !== 'undefined' ? window : globalThis);
