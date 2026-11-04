/**
 * shared/sync-revs.cjs: per-item change marks used to merge saves from older revisions.
 * Run: node tests/sync-revs.test.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const SyncRevs = require('../shared/sync-revs.cjs');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const base = {
    classes: [{ id: 'c1', name: 'One' }],
    attendanceSessions: [{ id: 's1', records: [{ studentId: 'k1', status: 'present' }, { studentId: 'k2', status: 'present' }] }],
    termStart: '2026-09-01'
};
const markK1 = [{ entity: 'attendanceSessions', action: 'upsert', payload: { session: { id: 's1', records: [{ studentId: 'k1', status: 'late' }], touchedStudentIds: ['k1'] } } }];
const markK2 = [{ entity: 'attendanceSessions', action: 'upsert', payload: { session: { id: 's1', records: [{ studentId: 'k2', status: 'absent' }], touchedStudentIds: ['k2'] } } }];

// Untracked document: an older base is refused as before.
assert(!SyncRevs.canRebase(base, markK1, 4, 5).ok, 'no marks: refuse');
assert(SyncRevs.canRebase(base, markK1, 5, 5).ok, 'same revision: always fine');

// First tracked save at revision 5 → 6.
const r6 = SyncRevs.stampMutations(base, 5, base, markK1, 6);
assert(r6._syncRevs.since === 5, 'marks start at the stored revision');
assert(r6._syncRevs.keys['attendanceSessions:s1@k1'] === 6, 'student mark stamped');
assert(SyncRevs.canRebase(r6, markK2, 5, 6).ok, 'other student from base 5: fine');
assert(!SyncRevs.canRebase(r6, markK1, 5, 6).ok, 'same student from base 5: conflict');
assert(!SyncRevs.canRebase(r6, markK1, 4, 6).ok, 'base older than marks: refuse');

// Removing a session conflicts with any student change inside it.
const removeS1 = [{ entity: 'attendanceSessions', action: 'remove', payload: { sessionId: 's1' } }];
assert(!SyncRevs.canRebase(r6, removeS1, 5, 6).ok, 'remove after a student change: conflict');

// Full-document diff marks only what changed.
const after = Object.assign({}, base, { classes: [{ id: 'c1', name: 'One renamed' }], termStart: '2026-09-02' });
const keys = SyncRevs.diffKeys(base, after);
assert(keys.includes('classes:c1') && keys.includes('field:termStart') && keys.length === 2, `diff keys ${keys}`);
const r7 = SyncRevs.stampDiff(r6, 6, after, 7);
assert(r7._syncRevs.keys['classes:c1'] === 7, 'diff stamped');
assert(r7._syncRevs.keys['attendanceSessions:s1@k1'] === 6, 'older marks kept');

// A client echoing stale marks in a full save cannot overwrite the server's.
const echoed = Object.assign({}, after, { _syncRevs: { since: 0, keys: {} } });
const r8 = SyncRevs.stampDiff(r7, 7, echoed, 8);
assert(r8._syncRevs.keys['classes:c1'] === 7 && r8._syncRevs.since === 5, 'server marks win');

// Old marks are pruned and the window moves forward.
const far = SyncRevs.stampMutations(r7, 7, r7, markK2, 7 + SyncRevs.KEEP_REVISIONS + 10);
assert(!far._syncRevs.keys['classes:c1'], 'old mark pruned');
assert(far._syncRevs.since >= 7, 'window moved');

// Suggestion: schedule from suggestion, classroom from now.
const now = Object.assign({}, r6);
const sug = Object.assign({}, base, { events: [{ id: 'e1' }], attendanceSessions: [] });
const applied = SyncRevs.applySuggestion(now, 6, sug, 5);
assert(applied.ok, 'attendance-only change since suggestion: applies');
assert(applied.data.events.length === 1, 'suggested events');
assert(applied.data.attendanceSessions[0].records[0].studentId === 'k1', 'attendance from now');
assert(!SyncRevs.applySuggestion(r7, 7, sug, 5).ok, 'schedule changed since suggestion: refused');

console.log('sync-revs.test.mjs: all passed');
