/**
 * Lock-free team sync: turn "what changed since the last server copy" into small
 * per-item mutations, and apply them on top of any newer server copy.
 *
 * Used by the browser (CalendarSync) and by both servers (shared/calendar-mutations.cjs).
 *
 *   diffCalendar(base, local)  → mutations that turn base into local
 *   applyGenericMutation(doc, m) → applies the generic actions below (true when handled)
 *
 * Generic actions (any top-level field):
 *   { entity, action: 'set',      payload: { item } }                 add or replace one { id } item
 *   { entity, action: 'patch',    payload: { id, set, unset, records, recordsRemoved } }
 *                                                                      change some fields of one item
 *   { entity, action: 'remove',   payload: { id } }                   delete one item
 *   { entity, action: 'order',    payload: { ids } }                  reorder items
 *   { entity, action: 'mapSet',   payload: { key, value } }           one key of an object field
 *   { entity, action: 'mapUnset', payload: { key } }
 *   { entity, action: 'replace',  payload: { value } | { deleted: true } }  whole field
 *
 * A patch only touches the fields that changed, so two devices editing different fields
 * of the same class both keep their change. The same field edited on both: latest save wins.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.CCPSyncDiff = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    /** Never synced: per-viewer UI state, server bookkeeping, export-only metadata. */
    const SKIP_FIELDS = new Set(['ui', '_syncRevs', 'exportMeta']);
    /** Keys inside object fields the server owns (bumped on its side). */
    const SKIP_MAP_KEYS = { meta: new Set(['versions']) };
    /** Items carrying per-student records[] merged by studentId. */
    const RECORD_ENTITIES = new Set(['attendanceSessions', 'homeworkCompletions', 'essaySubmissions']);

    const GENERIC_ACTIONS = new Set(['set', 'patch', 'order', 'mapSet', 'mapUnset']);

    /**
     * Which edit-area permission (shared/auth-permissions.cjs) a top-level field needs.
     * Fields not listed (classroom data, day notes, bookkeeping) follow their own rules.
     */
    const EDIT_AREA_BY_FIELD = {
        curriculumOverrides: 'edit_curriculum',
        curriculumRemovedIds: 'edit_curriculum',
        bookOverrides: 'edit_curriculum',
        customSyllabusTemplates: 'edit_curriculum',
        defaultClassTypeOverrides: 'edit_curriculum',
        customClassTypes: 'edit_curriculum',
        classes: 'edit_classes',
        events: 'edit_events',
        holidays: 'edit_events',
        timetableTimeSlots: 'edit_events',
        periodSlotMap: 'edit_events',
        calendarName: 'edit_events',
        termStart: 'edit_events',
        termEnd: 'edit_events',
        useAutoTermEnd: 'edit_events',
        termMonthCount: 'edit_events',
        dayNoteCategories: 'edit_events',
        rooms: 'edit_planner',
        teacherProfiles: 'edit_planner',
        plannerDrafts: 'edit_planner',
        plannerState: 'edit_planner'
    };

    function editAreaForField(field) {
        return Object.prototype.hasOwnProperty.call(EDIT_AREA_BY_FIELD, field)
            ? EDIT_AREA_BY_FIELD[field]
            : null;
    }

    /**
     * Split mutations by whether this person may edit each field's area.
     * hasArea(perm) → boolean. Returns { allowed, deniedFields }.
     */
    function splitByEditArea(mutations, hasArea) {
        const allowed = [];
        const denied = new Set();
        (mutations || []).forEach((m) => {
            const area = m && m.entity ? editAreaForField(String(m.entity)) : null;
            if (area && !hasArea(area)) {
                denied.add(String(m.entity));
            } else {
                allowed.push(m);
            }
        });
        return { allowed, deniedFields: Array.from(denied) };
    }

    function isPlainObject(v) {
        return v !== null && typeof v === 'object' && !Array.isArray(v);
    }

    /** Deep equality that ignores object key order (undefined keys count as missing). */
    function deepEqual(a, b) {
        if (a === b) {
            return true;
        }
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
            // Treat undefined/null alike only when both are "empty"; otherwise strict.
            return false;
        }
        const arrA = Array.isArray(a);
        if (arrA !== Array.isArray(b)) {
            return false;
        }
        if (arrA) {
            if (a.length !== b.length) {
                return false;
            }
            for (let i = 0; i < a.length; i += 1) {
                if (!deepEqual(a[i], b[i])) {
                    return false;
                }
            }
            return true;
        }
        const ka = Object.keys(a).filter((k) => a[k] !== undefined);
        const kb = Object.keys(b).filter((k) => b[k] !== undefined);
        if (ka.length !== kb.length) {
            return false;
        }
        for (const k of ka) {
            if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k])) {
                return false;
            }
        }
        return true;
    }

    function clone(v) {
        return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    }

    function idOf(item) {
        return item && typeof item === 'object' && item.id != null && item.id !== '' ? String(item.id) : null;
    }

    /** Array of objects that each have a distinct id (empty counts). */
    function isIdArray(arr) {
        if (!Array.isArray(arr)) {
            return false;
        }
        const seen = new Set();
        for (const item of arr) {
            const id = idOf(item);
            if (id == null || seen.has(id)) {
                return false;
            }
            seen.add(id);
        }
        return true;
    }

    function byId(arr) {
        const map = new Map();
        (arr || []).forEach((item) => {
            const id = idOf(item);
            if (id != null) {
                map.set(id, item);
            }
        });
        return map;
    }

    function recordsById(records) {
        const map = new Map();
        (Array.isArray(records) ? records : []).forEach((r) => {
            if (r && r.studentId != null) {
                map.set(String(r.studentId), r);
            }
        });
        return map;
    }

    function recordsKeyed(records) {
        if (!Array.isArray(records)) {
            return false;
        }
        const seen = new Set();
        for (const r of records) {
            if (!r || r.studentId == null || seen.has(String(r.studentId))) {
                return false;
            }
            seen.add(String(r.studentId));
        }
        return true;
    }

    /** Field-level changes from one item to another; null when equal. */
    function itemPatch(entity, before, after) {
        const set = {};
        const unset = [];
        let records = null;
        let recordsRemoved = null;
        const keys = new Set(Object.keys(before).concat(Object.keys(after)));
        keys.forEach((k) => {
            if (k === 'id') {
                return;
            }
            const a = before[k];
            const b = after[k];
            if (deepEqual(a, b)) {
                return;
            }
            if (b === undefined) {
                unset.push(k);
                return;
            }
            if (
                k === 'records' &&
                RECORD_ENTITIES.has(entity) &&
                recordsKeyed(a) &&
                recordsKeyed(b)
            ) {
                // Per-student: another teacher marking other students is kept.
                const ma = recordsById(a);
                const mb = recordsById(b);
                const changed = [];
                mb.forEach((rec, sid) => {
                    if (!deepEqual(ma.get(sid), rec)) {
                        changed.push(clone(rec));
                    }
                });
                const removed = [];
                ma.forEach((_, sid) => {
                    if (!mb.has(sid)) {
                        removed.push(sid);
                    }
                });
                if (changed.length) {
                    records = changed;
                }
                if (removed.length) {
                    recordsRemoved = removed;
                }
                return;
            }
            set[k] = clone(b);
        });
        if (!Object.keys(set).length && !unset.length && !records && !recordsRemoved) {
            return null;
        }
        const payload = { id: after.id };
        if (Object.keys(set).length) {
            payload.set = set;
        }
        if (unset.length) {
            payload.unset = unset;
        }
        if (records) {
            payload.records = records;
        }
        if (recordsRemoved) {
            payload.recordsRemoved = recordsRemoved;
        }
        return payload;
    }

    function diffIdArray(entity, before, after, out) {
        const ma = byId(before);
        const mb = byId(after);
        (after || []).forEach((item) => {
            const id = idOf(item);
            const prev = ma.get(id);
            if (!prev) {
                out.push({ entity, action: 'set', payload: { item: clone(item) } });
                return;
            }
            const patch = itemPatch(entity, prev, item);
            if (patch) {
                out.push({ entity, action: 'patch', payload: patch });
            }
        });
        ma.forEach((_, id) => {
            if (!mb.has(id)) {
                out.push({ entity, action: 'remove', payload: { id: ma.get(id).id } });
            }
        });
        // Order: kept items in base order, then new items in local order. Anything else
        // means the user reordered (drag), so send the full order.
        const expected = (before || [])
            .map(idOf)
            .filter((id) => mb.has(id))
            .concat((after || []).map(idOf).filter((id) => !ma.has(id)));
        const actual = (after || []).map(idOf);
        if (expected.join('\u0000') !== actual.join('\u0000')) {
            out.push({ entity, action: 'order', payload: { ids: (after || []).map((it) => it.id) } });
        }
    }

    function diffObject(entity, before, after, out) {
        const skip = SKIP_MAP_KEYS[entity];
        const keys = new Set(Object.keys(before).concat(Object.keys(after)));
        keys.forEach((key) => {
            if (skip && skip.has(key)) {
                return;
            }
            const a = before[key];
            const b = after[key];
            if (deepEqual(a, b)) {
                return;
            }
            if (b === undefined) {
                out.push({ entity, action: 'mapUnset', payload: { key } });
            } else {
                out.push({ entity, action: 'mapSet', payload: { key, value: clone(b) } });
            }
        });
    }

    /**
     * Mutations that turn `base` (last server copy) into `local`.
     * Both are calendar data objects; neither is modified.
     */
    function diffCalendar(base, local) {
        const a = base || {};
        const b = local || {};
        const out = [];
        const fields = new Set(Object.keys(a).concat(Object.keys(b)));
        fields.forEach((field) => {
            if (SKIP_FIELDS.has(field)) {
                return;
            }
            const before = a[field];
            const after = b[field];
            if (deepEqual(before, after)) {
                return;
            }
            if (after === undefined) {
                out.push({ entity: field, action: 'replace', payload: { deleted: true } });
                return;
            }
            const beforeList = before === undefined ? [] : before;
            if (isIdArray(beforeList) && isIdArray(after)) {
                diffIdArray(field, beforeList, after, out);
                return;
            }
            const beforeObj = before === undefined ? {} : before;
            if (isPlainObject(beforeObj) && isPlainObject(after)) {
                diffObject(field, beforeObj, after, out);
                return;
            }
            out.push({ entity: field, action: 'replace', payload: { value: clone(after) } });
        });
        return out;
    }

    function applyPatchToItem(entity, item, p) {
        const next = Object.assign({}, item);
        if (p.set && typeof p.set === 'object') {
            Object.keys(p.set).forEach((k) => {
                if (k !== 'id') {
                    next[k] = clone(p.set[k]);
                }
            });
        }
        if (Array.isArray(p.unset)) {
            p.unset.forEach((k) => {
                if (k !== 'id') {
                    delete next[k];
                }
            });
        }
        if (Array.isArray(p.records) || Array.isArray(p.recordsRemoved)) {
            const list = Array.isArray(next.records) ? next.records.slice() : [];
            const removed = new Set((p.recordsRemoved || []).map(String));
            let merged = list.filter((r) => !(r && r.studentId != null && removed.has(String(r.studentId))));
            (p.records || []).forEach((rec) => {
                if (!rec || rec.studentId == null) {
                    return;
                }
                const sid = String(rec.studentId);
                const idx = merged.findIndex((r) => r && r.studentId != null && String(r.studentId) === sid);
                if (idx >= 0) {
                    merged[idx] = clone(rec);
                } else {
                    merged = merged.concat([clone(rec)]);
                }
            });
            next.records = merged;
        }
        return next;
    }

    /**
     * Apply one generic mutation to `doc` in place. Returns true when handled.
     * Unknown actions (old-style upsert/mutate) return false for the caller's own switch.
     */
    function applyGenericMutation(doc, m) {
        if (!m || !m.entity || !doc || typeof doc !== 'object') {
            return false;
        }
        const field = String(m.entity);
        if (SKIP_FIELDS.has(field)) {
            return GENERIC_ACTIONS.has(m.action);
        }
        const p = m.payload || {};
        switch (m.action) {
            case 'set': {
                const item = p.item;
                const id = idOf(item);
                if (id == null) {
                    return true;
                }
                const list = Array.isArray(doc[field]) ? doc[field].slice() : [];
                const idx = list.findIndex((row) => idOf(row) === id);
                if (idx >= 0) {
                    list[idx] = clone(item);
                } else {
                    list.push(clone(item));
                }
                doc[field] = list;
                return true;
            }
            case 'patch': {
                const id = p.id != null ? String(p.id) : null;
                if (id == null || !Array.isArray(doc[field])) {
                    return true;
                }
                const list = doc[field].slice();
                const idx = list.findIndex((row) => idOf(row) === id);
                // Deleted elsewhere: the delete stands (a half item would be worse).
                if (idx < 0) {
                    return true;
                }
                list[idx] = applyPatchToItem(field, list[idx], p);
                doc[field] = list;
                return true;
            }
            case 'remove': {
                // Generic only for { id } payloads; legacy { classId } etc. fall through.
                if (p.id == null || Object.keys(p).length !== 1) {
                    return false;
                }
                if (Array.isArray(doc[field])) {
                    doc[field] = doc[field].filter((row) => idOf(row) !== String(p.id));
                } else if (isPlainObject(doc[field])) {
                    // Not an id list: nothing to remove.
                }
                return true;
            }
            case 'order': {
                if (!Array.isArray(p.ids) || !Array.isArray(doc[field])) {
                    return true;
                }
                const rank = new Map();
                p.ids.forEach((id, i) => rank.set(String(id), i));
                const listed = [];
                const others = [];
                doc[field].forEach((row) => {
                    const id = idOf(row);
                    if (id != null && rank.has(id)) {
                        listed.push(row);
                    } else {
                        others.push(row);
                    }
                });
                listed.sort((x, y) => rank.get(idOf(x)) - rank.get(idOf(y)));
                doc[field] = listed.concat(others);
                return true;
            }
            case 'mapSet': {
                if (p.key == null) {
                    return true;
                }
                const obj = isPlainObject(doc[field]) ? Object.assign({}, doc[field]) : {};
                obj[String(p.key)] = clone(p.value);
                doc[field] = obj;
                return true;
            }
            case 'mapUnset': {
                if (p.key == null || !isPlainObject(doc[field])) {
                    return true;
                }
                const obj = Object.assign({}, doc[field]);
                delete obj[String(p.key)];
                doc[field] = obj;
                return true;
            }
            case 'replace': {
                // Generic only for { value } / { deleted } payloads.
                if (p.deleted === true) {
                    delete doc[field];
                    return true;
                }
                if (Object.prototype.hasOwnProperty.call(p, 'value')) {
                    doc[field] = clone(p.value);
                    return true;
                }
                return false;
            }
            default:
                return false;
        }
    }

    /** Stable key for "which thing does this mutation change" (used for overwrite notices). */
    function mutationTargets(m) {
        if (!m || !m.entity) {
            return [];
        }
        const e = String(m.entity);
        const p = m.payload || {};
        switch (m.action) {
            case 'set':
                return idOf(p.item) != null ? [`${e}:${idOf(p.item)}`] : [];
            case 'patch': {
                const base = `${e}:${p.id}`;
                const out = Object.keys(p.set || {}).concat(p.unset || []).map((f) => `${base}.${f}`);
                (p.records || []).forEach((r) => r && r.studentId != null && out.push(`${base}@${r.studentId}`));
                (p.recordsRemoved || []).forEach((sid) => out.push(`${base}@${sid}`));
                return out;
            }
            case 'remove':
                return p.id != null ? [`${e}:${p.id}`] : [];
            case 'mapSet':
            case 'mapUnset':
                return p.key != null ? [`${e}:${p.key}`] : [];
            case 'replace':
                return [`field:${e}`];
            default:
                return [];
        }
    }

    /**
     * Targets changed both by `remote` and by `pending` with different results.
     * Used when pulling another device's save while this one still has unsaved edits.
     */
    function overlappingTargets(remote, pending) {
        const remoteTargets = new Map();
        (remote || []).forEach((m) => {
            mutationTargets(m).forEach((t) => remoteTargets.set(t, m));
        });
        const hits = new Set();
        (pending || []).forEach((m) => {
            mutationTargets(m).forEach((t) => {
                const r = remoteTargets.get(t);
                if (r && !deepEqual(r, m)) {
                    hits.add(t);
                }
                // Item-level remote change (set/remove) vs field-level local patch.
                const itemKey = t.split(/[.@]/)[0];
                const ri = itemKey !== t ? remoteTargets.get(itemKey) : null;
                if (ri && !deepEqual(ri, m)) {
                    hits.add(itemKey);
                }
            });
        });
        return Array.from(hits);
    }

    return {
        SKIP_FIELDS,
        GENERIC_ACTIONS,
        EDIT_AREA_BY_FIELD,
        editAreaForField,
        splitByEditArea,
        deepEqual,
        isIdArray,
        diffCalendar,
        applyGenericMutation,
        mutationTargets,
        overlappingTargets
    };
});
