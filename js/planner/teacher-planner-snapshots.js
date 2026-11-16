/**
 * Planner snapshots — named, restorable versions of a planner draft.
 *
 * A snapshot is a deep copy of a draft saved under a name, so a schedule can be
 * kept as a working file and rolled back to any earlier version until it is
 * applied to the calendar. Stored on appData.plannerSnapshots, which syncs with
 * the calendar (edit_planner area — see js/sync-diff.js) like plannerDrafts.
 *
 * This module never writes to the calendar schedule; restore only swaps the
 * active planner draft. Applying a draft stays the explicit "Apply" step.
 */
(function (global) {
    'use strict';

    // Snapshots are full draft copies inside the calendar document (2 MB D1 cap),
    // so keep the history bounded.
    const MAX_SNAPSHOTS = 20;

    function ensure(appData) {
        if (!appData || typeof appData !== 'object') {
            return [];
        }
        if (!Array.isArray(appData.plannerSnapshots)) {
            appData.plannerSnapshots = [];
        }
        return appData.plannerSnapshots;
    }

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function newId(prefix) {
        return (
            (prefix || 'snap') +
            '_' +
            Date.now().toString(36) +
            Math.random().toString(36).slice(2, 6)
        );
    }

    function activeDraft(appData) {
        const list = Array.isArray(appData && appData.plannerDrafts) ? appData.plannerDrafts : [];
        const id = appData && appData.plannerState && appData.plannerState.activeDraftId;
        return list.find((d) => d && d.id === id) || list[0] || null;
    }

    /**
     * Save a named snapshot of a draft (the active draft unless opts.draft given).
     * @returns {{ok:boolean, snapshot?:object, reason?:string}}
     */
    function save(appData, name, opts) {
        const options = opts || {};
        const draft = options.draft || activeDraft(appData);
        if (!draft) {
            return { ok: false, reason: 'no_draft' };
        }
        ensure(appData);
        const stamp = new Date().toISOString();
        const snapshot = {
            id: newId('snap'),
            name: String(name || '').trim() || 'Snapshot ' + stamp.slice(0, 16).replace('T', ' '),
            note: String(options.note || ''),
            createdAt: stamp,
            fromDraftId: draft.id || '',
            draft: clone(draft)
        };
        appData.plannerSnapshots.unshift(snapshot);
        if (appData.plannerSnapshots.length > MAX_SNAPSHOTS) {
            appData.plannerSnapshots = appData.plannerSnapshots.slice(0, MAX_SNAPSHOTS);
        }
        return { ok: true, snapshot };
    }

    /** Lightweight list for a history panel (no full draft payload). */
    function list(appData) {
        return ensure(appData).map((s) => ({
            id: s.id,
            name: s.name,
            note: s.note || '',
            createdAt: s.createdAt,
            assignmentCount: (s.draft && s.draft.assignments && s.draft.assignments.length) || 0
        }));
    }

    function get(appData, id) {
        return ensure(appData).find((s) => s && s.id === id) || null;
    }

    /**
     * Restore a snapshot into the planner drafts and make it the active draft.
     * A fresh draft id is assigned (unless opts.keepId) so it never clobbers an
     * existing draft; the calendar is not touched.
     * @returns {{ok:boolean, draft?:object, reason?:string}}
     */
    function restore(appData, id, opts) {
        const options = opts || {};
        const snap = get(appData, id);
        if (!snap || !snap.draft) {
            return { ok: false, reason: 'not_found' };
        }
        const draft = clone(snap.draft);
        draft.id = options.keepId && draft.id ? draft.id : newId('draft');
        draft.restoredFromSnapshotId = snap.id;
        draft.status = 'draft';
        draft.updatedAt = new Date().toISOString();
        if (!Array.isArray(appData.plannerDrafts)) {
            appData.plannerDrafts = [];
        }
        const idx = appData.plannerDrafts.findIndex((d) => d && d.id === draft.id);
        if (idx >= 0) {
            appData.plannerDrafts[idx] = draft;
        } else {
            appData.plannerDrafts.unshift(draft);
        }
        if (!appData.plannerState || typeof appData.plannerState !== 'object') {
            appData.plannerState = {};
        }
        appData.plannerState.activeDraftId = draft.id;
        appData.plannerState.updatedAt = draft.updatedAt;
        return { ok: true, draft };
    }

    function rename(appData, id, name) {
        const snap = get(appData, id);
        if (!snap) {
            return { ok: false, reason: 'not_found' };
        }
        const next = String(name || '').trim();
        if (next) {
            snap.name = next;
        }
        return { ok: true, snapshot: snap };
    }

    function remove(appData, id) {
        const l = ensure(appData);
        const idx = l.findIndex((s) => s && s.id === id);
        if (idx < 0) {
            return { ok: false, reason: 'not_found' };
        }
        const [removed] = l.splice(idx, 1);
        return { ok: true, removed };
    }

    global.CCPTeacherPlannerSnapshots = {
        MAX_SNAPSHOTS,
        ensure,
        activeDraft,
        save,
        list,
        get,
        restore,
        rename,
        remove
    };
})(typeof window !== 'undefined' ? window : globalThis);
