/**
 * Per-item change tracking inside a calendar document, used by both servers.
 *
 * A calendar is one JSON document with one revision number, so any save bumps the
 * revision. Before this module, a save sent against an older revision was refused
 * (409) even when the other change touched something unrelated: teacher B marking
 * a different student, or a classroom save landing while the schedule editor works.
 *
 * Now the server records, for each item it writes, the revision that last changed
 * it (data._syncRevs.keys). A save from an older base revision is applied on top of
 * the latest document unless one of the items it touches was changed after that
 * base revision. Only then is it a real conflict.
 *
 * Keys:
 *   classes:<id>, events:<id>, timetableTimeSlots:<id>, …   whole schedule item
 *   periodSlotMap:<slotKey>                                  one map entry
 *   attendanceSessions:<id>@<studentId>                      one student's record
 *   attendanceSessions:<id>                                  session fields other than records
 *   <entity>:<id>#rm                                         item removed
 *   dayNotes:<noteId>
 *   field:<topLevelKey>                                      any other top-level setting
 */

const Mutations = require('./calendar-mutations.cjs');

const SYNC_REVS_KEY = '_syncRevs';
/** Keep change marks for this many revisions; older bases fall back to a plain 409. */
const KEEP_REVISIONS = 150;
/** Hard cap on stored marks so the document cannot grow without limit. */
const MAX_KEYS = 1500;

/** Last-write-wins maps with no per-item conflicts (same as the client rule). */
const UNTRACKED_ENTITIES = new Set(['tmsRosterLinks', 'tmsEssayLinks']);

const SCHEDULE_PAYLOAD_KEY = {
    classes: 'class',
    events: 'event',
    timetableTimeSlots: 'slot'
};
const SCHEDULE_REMOVE_ID_KEY = {
    classes: 'classId',
    events: 'eventId',
    timetableTimeSlots: 'slotId'
};
const CLASSROOM_PAYLOAD_KEY = {
    cohorts: 'cohort',
    attendanceSessions: 'session',
    homeworkCompletions: 'completion',
    essaySubmissions: 'submission',
    essayGroups: 'group',
    studentPoints: 'entry',
    studentTests: 'test',
    debateTeamSessions: 'session',
    debateScores: 'score',
    debateCustomFormats: 'format',
    speakingTestRecords: 'record',
    debateBookDistributions: 'distribution',
    pendingDebateBookChecks: 'check'
};
const CLASSROOM_REMOVE_ID_KEY = {
    cohorts: 'cohortId',
    attendanceSessions: 'sessionId',
    homeworkCompletions: 'completionId',
    essaySubmissions: 'submissionId',
    essayGroups: 'groupId',
    studentPoints: 'entryId',
    studentTests: 'testId',
    debateTeamSessions: 'sessionId',
    debateScores: 'scoreId',
    debateCustomFormats: 'formatId',
    speakingTestRecords: 'recordId',
    debateBookDistributions: 'distributionId',
    pendingDebateBookChecks: 'checkId'
};

/** Entities stored as arrays of { id, … } that get per-item keys when diffing full saves. */
const ID_ARRAY_ENTITIES = new Set([
    'classes',
    'events',
    'timetableTimeSlots',
    'customClassTypes',
    'customSyllabusTemplates',
    'dayNotes',
    ...Object.keys(CLASSROOM_PAYLOAD_KEY)
]);

function emptyRevs() {
    return { since: 0, keys: {} };
}

function readRevs(data) {
    const raw = data && data[SYNC_REVS_KEY];
    if (!raw || typeof raw !== 'object' || !raw.keys || typeof raw.keys !== 'object') {
        return null;
    }
    return { since: Number(raw.since) || 0, keys: Object.assign({}, raw.keys) };
}

function upsertItem(entity, payload) {
    const body = payload || {};
    const key = SCHEDULE_PAYLOAD_KEY[entity] || CLASSROOM_PAYLOAD_KEY[entity];
    if (key && body[key] && typeof body[key] === 'object') {
        return body[key];
    }
    return body.id != null ? body : null;
}

function removeId(entity, payload) {
    const body = payload || {};
    const key = SCHEDULE_REMOVE_ID_KEY[entity] || CLASSROOM_REMOVE_ID_KEY[entity];
    if (key && body[key] != null) {
        return body[key];
    }
    return body.id != null ? body.id : null;
}

/**
 * Keys a mutation writes, and keys whose later change would make it a conflict.
 * Returns { stamp: string[], check: string[] } or null when the mutation is untracked.
 */
function mutationKeys(m) {
    if (!m || !m.entity) {
        return null;
    }
    const entity = String(m.entity);
    const action = String(m.action || '');
    const payload = m.payload || {};
    if (UNTRACKED_ENTITIES.has(entity)) {
        return null;
    }
    if (entity === 'dayNotes') {
        const id = payload.noteId || (payload.note && payload.note.id);
        if (id == null) {
            return null;
        }
        const k = `dayNotes:${id}`;
        return { stamp: [k], check: [k] };
    }
    if (entity === 'periodSlotMap') {
        const map = payload.periodSlotMap || payload.map || payload;
        const keys = Object.keys(map || {}).map((slot) => `periodSlotMap:${slot}`);
        return { stamp: keys, check: keys };
    }
    if (action === 'replace') {
        const k = `field:${entity}`;
        return { stamp: [k], check: [k] };
    }
    if (action === 'remove') {
        const id = removeId(entity, payload);
        if (id == null) {
            return null;
        }
        const whole = `${entity}:${id}`;
        // A remove conflicts with any change to the item, including one student's record.
        return { stamp: [whole, `${whole}#rm`], check: [whole, `${whole}#rm`], prefix: `${whole}@` };
    }
    if (action !== 'upsert') {
        return null;
    }
    const item = upsertItem(entity, payload);
    if (!item || item.id == null) {
        return null;
    }
    const whole = `${entity}:${item.id}`;
    const touched = Array.isArray(item.touchedStudentIds) ? item.touchedStudentIds.map(String) : null;
    if (Mutations.SESSION_RECORD_ENTITIES.has(entity)) {
        if (touched && touched.length) {
            // Only these students' records change; other teachers may mark other students.
            const perStudent = touched.map((sid) => `${whole}@${sid}`);
            return { stamp: perStudent, check: perStudent.concat([`${whole}#rm`]), touched };
        }
        // Whole session sent: it can overwrite any student's record.
        const all = (item.records || [])
            .filter((r) => r && r.studentId != null)
            .map((r) => `${whole}@${r.studentId}`);
        return { stamp: [whole].concat(all), check: [whole, `${whole}#rm`], prefix: `${whole}@` };
    }
    return { stamp: [whole], check: [whole, `${whole}#rm`] };
}

/**
 * Can these mutations be applied on top of `data` (now at currentRevision) when the
 * client built them against baseRevision?
 * Returns { ok: true } or { ok: false, reason: 'conflict' | 'unknown', keys }.
 */
function canRebase(data, mutations, baseRevision, currentRevision) {
    const base = Number(baseRevision);
    const current = Number(currentRevision);
    if (!Number.isFinite(base) || base >= current) {
        return { ok: true };
    }
    const revs = readRevs(data);
    // No marks yet, or the marks no longer reach back to the client's base.
    if (!revs || revs.since > base) {
        return { ok: false, reason: 'unknown', keys: [] };
    }
    const hits = [];
    const markKeys = Object.keys(revs.keys);
    for (const m of mutations || []) {
        const keys = mutationKeys(m);
        if (!keys || isNoOp(data, m, keys)) {
            continue;
        }
        keys.check.forEach((k) => {
            if (Number(revs.keys[k]) > base) {
                hits.push(k);
            }
        });
        if (keys.prefix) {
            markKeys.forEach((k) => {
                if (k.startsWith(keys.prefix) && Number(revs.keys[k]) > base) {
                    hits.push(k);
                }
            });
        }
    }
    return hits.length ? { ok: false, reason: 'conflict', keys: hits } : { ok: true };
}

function stripTouched(item) {
    const copy = Object.assign({}, item);
    delete copy.touchedStudentIds;
    return copy;
}

/** True when an upsert would leave the stored item exactly as it is (nothing to conflict on). */
function isNoOp(data, m, keys) {
    if (!m || m.action !== 'upsert' || !Array.isArray((data || {})[m.entity])) {
        return false;
    }
    const item = upsertItem(m.entity, m.payload);
    if (!item || item.id == null) {
        return false;
    }
    const current = data[m.entity].find((row) => row && String(row.id) === String(item.id));
    if (!current) {
        return false;
    }
    if (keys.touched) {
        const want = new Map((item.records || []).filter(Boolean).map((r) => [String(r.studentId), r]));
        const have = new Map((current.records || []).filter(Boolean).map((r) => [String(r.studentId), r]));
        return keys.touched.every((sid) => {
            const w = want.get(sid);
            const h = have.get(sid);
            // Merge copies fields over the stored record, so compare only the fields sent.
            return w && h && Object.keys(w).every((f) => sameJson(w[f], h[f]));
        });
    }
    return sameJson(stripTouched(item), current);
}

function prune(revs, revision) {
    const floor = Number(revision) - KEEP_REVISIONS;
    let since = revs.since;
    Object.keys(revs.keys).forEach((k) => {
        if (Number(revs.keys[k]) <= floor) {
            delete revs.keys[k];
            since = Math.max(since, floor);
        }
    });
    const entries = Object.entries(revs.keys);
    if (entries.length > MAX_KEYS) {
        entries.sort((a, b) => Number(a[1]) - Number(b[1]));
        const drop = entries.slice(0, entries.length - MAX_KEYS);
        drop.forEach(([k, r]) => {
            delete revs.keys[k];
            since = Math.max(since, Number(r));
        });
    }
    revs.since = since;
    return revs;
}

/**
 * The server's own marks, carried from the stored document. Clients may echo an old
 * copy back in a full save; that copy is always ignored.
 */
function startingRevs(storedData, storedRevision) {
    const revs = readRevs(storedData);
    if (revs) {
        return revs;
    }
    // First tracked save: nothing is known about revisions up to this one.
    const fresh = emptyRevs();
    fresh.since = Number(storedRevision) || 0;
    return fresh;
}

/** Return nextData with marks for the mutations' items set to nextRevision. */
function stampMutations(storedData, storedRevision, nextData, mutations, nextRevision) {
    const revs = startingRevs(storedData, storedRevision);
    (mutations || []).forEach((m) => {
        const keys = mutationKeys(m);
        if (keys) {
            keys.stamp.forEach((k) => {
                revs.keys[k] = Number(nextRevision);
            });
        }
    });
    return Object.assign({}, nextData, { [SYNC_REVS_KEY]: prune(revs, nextRevision) });
}

function sameJson(a, b) {
    return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}

function byId(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach((row) => {
        if (row && row.id != null) {
            map.set(String(row.id), row);
        }
    });
    return map;
}

/** Keys that differ between two whole documents (for full and partial PUT saves). */
function diffKeys(before, after) {
    const a = before || {};
    const b = after || {};
    const out = [];
    const top = new Set(Object.keys(a).concat(Object.keys(b)));
    top.delete(SYNC_REVS_KEY);
    top.forEach((field) => {
        if (UNTRACKED_ENTITIES.has(field)) {
            return;
        }
        if (field === 'periodSlotMap') {
            const pa = a.periodSlotMap || {};
            const pb = b.periodSlotMap || {};
            new Set(Object.keys(pa).concat(Object.keys(pb))).forEach((slot) => {
                if (!sameJson(pa[slot], pb[slot])) {
                    out.push(`periodSlotMap:${slot}`);
                }
            });
            return;
        }
        if (!ID_ARRAY_ENTITIES.has(field) || !Array.isArray(a[field] || []) || !Array.isArray(b[field] || [])) {
            if (!sameJson(a[field], b[field])) {
                out.push(`field:${field}`);
            }
            return;
        }
        const ma = byId(a[field]);
        const mb = byId(b[field]);
        new Set([...ma.keys(), ...mb.keys()]).forEach((id) => {
            const ra = ma.get(id);
            const rb = mb.get(id);
            const whole = `${field}:${id}`;
            if (!rb) {
                out.push(whole, `${whole}#rm`);
                return;
            }
            if (!ra) {
                out.push(whole);
                return;
            }
            if (sameJson(ra, rb)) {
                return;
            }
            if (Mutations.SESSION_RECORD_ENTITIES.has(field)) {
                const restA = Object.assign({}, ra, { records: null });
                const restB = Object.assign({}, rb, { records: null });
                if (!sameJson(restA, restB)) {
                    out.push(whole);
                }
                const recA = new Map((ra.records || []).filter(Boolean).map((r) => [String(r.studentId), r]));
                const recB = new Map((rb.records || []).filter(Boolean).map((r) => [String(r.studentId), r]));
                new Set([...recA.keys(), ...recB.keys()]).forEach((sid) => {
                    if (!sameJson(recA.get(sid), recB.get(sid))) {
                        out.push(`${whole}@${sid}`);
                    }
                });
                return;
            }
            out.push(whole);
        });
    });
    return out;
}

/** Return nextData with marks for everything that differs from storedData. */
function stampDiff(storedData, storedRevision, nextData, nextRevision) {
    const revs = startingRevs(storedData, storedRevision);
    diffKeys(storedData, nextData).forEach((k) => {
        revs.keys[k] = Number(nextRevision);
    });
    return Object.assign({}, nextData, { [SYNC_REVS_KEY]: prune(revs, nextRevision) });
}

/** Top-level fields owned by classroom and day-notes saves (never part of a suggestion). */
function isNonScheduleField(field) {
    return (
        field === SYNC_REVS_KEY ||
        field === 'dayNotes' ||
        Mutations.CLASSROOM_ENTITIES.has(field)
    );
}

/**
 * Apply a suggestion (a whole document written against baseRevision) onto the latest
 * document. Schedule fields come from the suggestion; classroom data and day notes stay
 * as they are now. Refused when a schedule item changed after the suggestion was written.
 * Returns { ok: true, data } or { ok: false, reason, keys }.
 */
function applySuggestion(currentData, currentRevision, suggestionData, baseRevision) {
    const current = currentData || {};
    const base = Number(baseRevision);
    if (Number.isFinite(base) && base < Number(currentRevision)) {
        const revs = readRevs(current);
        if (!revs || revs.since > base) {
            return { ok: false, reason: 'unknown', keys: [] };
        }
        const hits = Object.keys(revs.keys).filter((k) => {
            if (Number(revs.keys[k]) <= base) {
                return false;
            }
            const field = k.startsWith('field:') ? k.slice(6) : k.split(/[:@#]/)[0];
            return !isNonScheduleField(field);
        });
        if (hits.length) {
            return { ok: false, reason: 'conflict', keys: hits };
        }
    }
    const next = {};
    Object.keys(suggestionData || {}).forEach((field) => {
        if (!isNonScheduleField(field)) {
            next[field] = suggestionData[field];
        }
    });
    Object.keys(current).forEach((field) => {
        if (isNonScheduleField(field)) {
            next[field] = current[field];
        }
    });
    return { ok: true, data: next };
}

module.exports = {
    SYNC_REVS_KEY,
    KEEP_REVISIONS,
    mutationKeys,
    canRebase,
    stampMutations,
    stampDiff,
    diffKeys,
    applySuggestion
};
