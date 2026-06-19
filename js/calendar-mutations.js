/**
 * Browser port of shared/calendar-mutations.cjs — keep logic in sync.
 */
(function (global) {
    function deepClone(data) {
        return JSON.parse(JSON.stringify(data || {}));
    }

    function upsertById(arr, item, idKey) {
        const list = Array.isArray(arr) ? arr.slice() : [];
        const key = idKey || 'id';
        const id = item && item[key];
        if (id == null) {
            return list;
        }
        const idx = list.findIndex((row) => row && String(row[key]) === String(id));
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], item);
        } else {
            list.push(Object.assign({}, item));
        }
        return list;
    }

    function removeById(arr, id, idKey) {
        const key = idKey || 'id';
        if (id == null) {
            return Array.isArray(arr) ? arr.slice() : [];
        }
        return (Array.isArray(arr) ? arr : []).filter((row) => !row || String(row[key]) !== String(id));
    }

    function applyDayNoteMutation(dayNotes, payload) {
        const list = Array.isArray(dayNotes) ? dayNotes.slice() : [];
        const op = payload && payload.op;
        if (op === 'remove') {
            const noteId = payload.noteId || (payload.note && payload.note.id);
            if (!noteId) {
                return list;
            }
            return list.filter((n) => !n || String(n.id) !== String(noteId));
        }
        if (op === 'upsert' && payload.note && payload.note.id) {
            return upsertById(list, payload.note, 'id');
        }
        if (Array.isArray(payload && payload.dayNotes)) {
            return payload.dayNotes.slice();
        }
        return list;
    }

    function applyCalendarMutations(data, mutations) {
        const next = deepClone(data);
        const list = Array.isArray(mutations) ? mutations : [];
        for (const m of list) {
            if (!m || !m.entity || !m.action) {
                continue;
            }
            const key = `${m.entity}/${m.action}`;
            const payload = m.payload || {};
            switch (key) {
                case 'classes/upsert': {
                    const classObj = payload.class || payload;
                    if (classObj && classObj.id) {
                        next.classes = upsertById(next.classes, classObj, 'id');
                    }
                    break;
                }
                case 'classes/remove': {
                    const classId = payload.classId || payload.id;
                    next.classes = removeById(next.classes, classId, 'id');
                    break;
                }
                case 'events/upsert': {
                    const eventObj = payload.event || payload;
                    if (eventObj && eventObj.id) {
                        next.events = upsertById(next.events, eventObj, 'id');
                    }
                    break;
                }
                case 'events/remove': {
                    const eventId = payload.eventId || payload.id;
                    next.events = removeById(next.events, eventId, 'id');
                    break;
                }
                case 'dayNotes/mutate': {
                    next.dayNotes = applyDayNoteMutation(next.dayNotes, payload);
                    break;
                }
                default:
                    break;
            }
        }
        return next;
    }

    global.CCPCalendarMutations = {
        applyCalendarMutations,
        applyDayNoteMutation,
        upsertById,
        removeById
    };
})(typeof window !== 'undefined' ? window : globalThis);
