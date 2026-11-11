/**
 * Run: node tests/sync-diff.test.mjs
 * Lock-free sync: diff → mutations → apply must reproduce the local copy, and
 * replaying unsaved edits on top of another device's save must keep both.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const SyncDiff = require('../js/sync-diff.js');
const Mutations = require('../shared/calendar-mutations.cjs');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const clone = (v) => JSON.parse(JSON.stringify(v));
const apply = (data, muts) => Mutations.applyCalendarMutations(data, muts, { bumpVersions: false });
const same = (a, b) => {
    const strip = (d) => {
        const c = clone(d);
        delete c.ui;
        if (c.meta) {
            delete c.meta.versions;
        }
        return c;
    };
    return SyncDiff.deepEqual(strip(a), strip(b));
};

function baseDoc() {
    return {
        schemaVersion: 3,
        calendarName: 'Fall 2026',
        termStart: '2026-09-01',
        meta: { versions: { lessons: 3, syllabus: 1, roster: 2 }, syllabusCompressedDayRetconV: 2 },
        classes: [
            { id: 'c1', name: 'Rainbow 1', period: 1, meetingDays: [1, 3], note: 'old', syllabusRows: [{ id: 'r1', planDetail: 'HW 1' }] },
            { id: 'c2', name: 'Waterflow', period: 2, meetingDays: [2, 4] },
            { id: 'c3', name: 'Debate', period: 3 }
        ],
        events: [{ id: 'e1', name: 'Chuseok', date: '2026-09-24' }],
        periodSlotMap: { 1: 's1', 2: 's2' },
        timetableTimeSlots: [{ id: 's1', start: '15:00' }, { id: 's2', start: '16:00' }],
        attendanceSessions: [
            {
                id: 'a1',
                classId: 'c1',
                date: '2026-09-02',
                records: [
                    { studentId: 'st1', status: 'present' },
                    { studentId: 'st2', status: 'absent' }
                ]
            }
        ],
        dayNotes: [{ id: 'n1', text: 'Quiz', classId: 'c1' }],
        curriculumRemovedIds: ['x', 'y'],
        ui: { theme: 'dark' }
    };
}

// 1. No change → no mutations
{
    const b = baseDoc();
    assert(SyncDiff.diffCalendar(b, clone(b)).length === 0, 'identical docs give no mutations');
    const reordered = clone(b);
    reordered.classes[0] = Object.fromEntries(Object.entries(reordered.classes[0]).reverse());
    assert(SyncDiff.diffCalendar(b, reordered).length === 0, 'key order does not count as a change');
    const uiOnly = clone(b);
    uiOnly.ui.theme = 'light';
    uiOnly.meta.versions.lessons = 99;
    assert(SyncDiff.diffCalendar(b, uiOnly).length === 0, 'ui and meta.versions are never sent');
}

// 2. Round trip: every kind of change
{
    const b = baseDoc();
    const l = clone(b);
    l.calendarName = 'Fall 2026 (v2)';
    l.classes[0].note = 'new';
    delete l.classes[0].period;
    l.classes[0].syllabusRows[0].planDetail = 'HW 1 edited';
    l.classes.splice(1, 1);
    l.classes.push({ id: 'c4', name: 'New class' });
    l.classes.reverse();
    l.events.push({ id: 'e2', name: 'Sports day' });
    l.periodSlotMap[3] = 's2';
    delete l.periodSlotMap[1];
    l.attendanceSessions[0].records[1].status = 'late';
    l.attendanceSessions[0].records.push({ studentId: 'st3', status: 'present' });
    l.attendanceSessions[0].records.splice(0, 1);
    l.curriculumRemovedIds = ['y'];
    l.meta.syllabusCompressedDayRetconV = 3;
    delete l.termStart;
    l.dayNotes[0].text = 'Quiz moved';
    const muts = SyncDiff.diffCalendar(b, l);
    const out = apply(b, muts);
    assert(same(out, l), 'apply(base, diff(base, local)) equals local');
    assert(SyncDiff.diffCalendar(out, l).length === 0, 'no leftover diff after apply (no save loop)');
    assert(muts.some((m) => m.entity === 'classes' && m.action === 'order'), 'reorder sent');
    assert(!muts.some((m) => m.entity === 'meta' && m.payload.key === 'versions'), 'versions not sent');
}

// 3. Two devices, different fields of the same class: both kept
{
    const b = baseDoc();
    const phone = clone(b);
    phone.classes[0].note = 'from phone';
    const pc = clone(b);
    pc.classes[0].meetingDays = [1, 3, 5];
    const server = apply(b, SyncDiff.diffCalendar(b, phone));
    const pending = SyncDiff.diffCalendar(b, pc);
    const rebased = apply(server, pending);
    assert(rebased.classes[0].note === 'from phone', 'phone field kept');
    assert(rebased.classes[0].meetingDays.length === 3, 'pc field kept');
    assert(SyncDiff.overlappingTargets(SyncDiff.diffCalendar(b, server), pending).length === 0,
        'different fields are not reported as overwritten');
}

// 4. Same field on both: latest wins and the overlap is reported
{
    const b = baseDoc();
    const phone = clone(b);
    phone.classes[0].note = 'phone';
    const pc = clone(b);
    pc.classes[0].note = 'pc';
    const server = apply(b, SyncDiff.diffCalendar(b, phone));
    const pending = SyncDiff.diffCalendar(b, pc);
    const rebased = apply(server, pending);
    assert(rebased.classes[0].note === 'pc', 'later save wins');
    const hits = SyncDiff.overlappingTargets(SyncDiff.diffCalendar(b, server), pending);
    assert(hits.includes('classes:c1.note'), 'overwrite reported: ' + hits.join(','));
}

// 5. Attendance: two teachers marking different students both kept
{
    const b = baseDoc();
    const t1 = clone(b);
    t1.attendanceSessions[0].records[0].status = 'late';
    const t2 = clone(b);
    t2.attendanceSessions[0].records[1].status = 'present';
    const server = apply(b, SyncDiff.diffCalendar(b, t1));
    const rebased = apply(server, SyncDiff.diffCalendar(b, t2));
    const recs = Object.fromEntries(rebased.attendanceSessions[0].records.map((r) => [r.studentId, r.status]));
    assert(recs.st1 === 'late' && recs.st2 === 'present', 'both students kept: ' + JSON.stringify(recs));
}

// 6. Patch on an item deleted elsewhere: delete stands, no half item
{
    const b = baseDoc();
    const a = clone(b);
    a.classes = a.classes.filter((c) => c.id !== 'c2');
    const other = clone(b);
    other.classes[1].name = 'Renamed';
    const server = apply(b, SyncDiff.diffCalendar(b, a));
    const rebased = apply(server, SyncDiff.diffCalendar(b, other));
    assert(!rebased.classes.some((c) => c.id === 'c2'), 'deleted class not resurrected');
}

// 7. Additions on both devices: both present, nothing duplicated
{
    const b = baseDoc();
    const a = clone(b);
    a.events.push({ id: 'ea', name: 'A' });
    const c = clone(b);
    c.events.push({ id: 'ec', name: 'C' });
    const server = apply(b, SyncDiff.diffCalendar(b, a));
    const rebased = apply(server, SyncDiff.diffCalendar(b, c));
    const ids = rebased.events.map((e) => e.id);
    assert(ids.length === 3 && ids.includes('ea') && ids.includes('ec'), 'both events: ' + ids);
}

// 8. Randomised round trips
{
    let seed = 7;
    const rnd = (n) => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed % n;
    };
    for (let i = 0; i < 300; i += 1) {
        const b = baseDoc();
        const l = clone(b);
        const ops = 1 + rnd(6);
        for (let k = 0; k < ops; k += 1) {
            switch (rnd(8)) {
                case 0: l.classes.push({ id: 'n' + i + k, name: 'x' + rnd(9) }); break;
                case 1: if (l.classes.length) { l.classes.splice(rnd(l.classes.length), 1); } break;
                case 2: if (l.classes.length) { l.classes[rnd(l.classes.length)].name = 'r' + rnd(99); } break;
                case 3: l.classes.reverse(); break;
                case 4: l.periodSlotMap[rnd(5)] = 's' + rnd(3); break;
                case 5: l.attendanceSessions[0].records.push({ studentId: 'z' + i + k, status: 'present' }); break;
                case 6: l.events = []; break;
                default: l.calendarName = 'n' + rnd(50);
            }
        }
        const out = apply(b, SyncDiff.diffCalendar(b, l));
        assert(same(out, l), 'random round trip ' + i);
    }
}

// 9. Old-style mutations from cached clients still work
{
    const b = baseDoc();
    const out = Mutations.applyCalendarMutations(b, [
        { entity: 'classes', action: 'remove', payload: { classId: 'c2' } },
        { entity: 'events', action: 'upsert', payload: { event: { id: 'e1', name: 'Chuseok!' } } }
    ]);
    assert(!out.classes.some((c) => c.id === 'c2'), 'legacy remove by classId');
    assert(out.events[0].name === 'Chuseok!', 'legacy upsert');
}

// 10. Server-side version bumps still happen for generic class changes
{
    const b = baseDoc();
    const l = clone(b);
    l.classes[0].meetingDays = [2];
    const out = Mutations.applyCalendarMutations(b, SyncDiff.diffCalendar(b, l));
    assert(out.meta.versions.lessons === 4, 'lessons version bumped on schedule field patch');
}

// 11. Browser port applies the same way as the server copy
{
    await import(new URL('../js/sync-diff.js', import.meta.url).href);
    await import(new URL('../js/calendar-mutations.js', import.meta.url).href);
    const Browser = globalThis.CCPCalendarMutations;
    const b = baseDoc();
    const l = clone(b);
    l.classes[0].note = 'browser';
    l.classes.reverse();
    l.attendanceSessions[0].records[0].status = 'late';
    const muts = SyncDiff.diffCalendar(b, l);
    const server = Mutations.applyCalendarMutations(b, muts);
    const browser = Browser.applyCalendarMutations(b, muts);
    assert(SyncDiff.deepEqual(server, browser), 'browser and server appliers agree');
}

// 12. Server flow (same steps as the PATCH handlers): stamp, then latest-wins + report
{
    const SyncRevs = require('../shared/sync-revs.cjs');
    const server = { revision: 10, data: baseDoc() };
    delete server.data.ui;
    function serverPatch(baseRevision, mutations) {
        let overwritten = [];
        if (baseRevision !== server.revision) {
            const check = SyncRevs.canRebase(server.data, mutations, baseRevision, server.revision);
            if (!check.ok && check.reason === 'conflict') {
                overwritten = check.keys;
            }
        }
        const merged = Mutations.applyCalendarMutations(server.data, mutations);
        server.data = SyncRevs.stampMutations(server.data, server.revision, merged, mutations, server.revision + 1);
        server.revision += 1;
        return { revision: server.revision, data: clone(server.data), overwritten };
    }
    // Both devices start from revision 10.
    const startData = clone(server.data);
    const phone = clone(startData);
    phone.classes[0].note = 'phone';
    phone.events.push({ id: 'ep', name: 'Phone event' });
    const pc = clone(startData);
    pc.classes[0].meetingDays = [5];
    pc.classes[1].name = 'PC rename';

    const r1 = serverPatch(10, SyncDiff.diffCalendar(startData, phone));
    assert(r1.overwritten.length === 0, 'first save overwrites nothing');
    // PC saves from the old base: different fields → nothing reported, all kept.
    const r2 = serverPatch(10, SyncDiff.diffCalendar(startData, pc));
    assert(r2.overwritten.length === 0, 'different fields: no overwrite notice, got ' + r2.overwritten);
    assert(server.data.classes[0].note === 'phone' && server.data.classes[0].meetingDays[0] === 5,
        'both field edits on class c1 kept');
    assert(server.data.events.some((e) => e.id === 'ep'), 'phone event kept');
    assert(server.data.classes[1].name === 'PC rename', 'pc rename kept');

    // Phone (still on revision 11) edits the same field PC changed: latest wins, reported.
    const phone2 = clone(r1.data);
    delete phone2._syncRevs;
    const phoneBase = clone(phone2);
    phone2.classes[1].name = 'Phone rename';
    const r3 = serverPatch(11, SyncDiff.diffCalendar(phoneBase, phone2));
    assert(server.data.classes[1].name === 'Phone rename', 'latest save wins');
    assert(r3.overwritten.some((k) => k.startsWith('classes:c2')), 'overwrite reported: ' + r3.overwritten);
}

console.log('sync-diff.test.mjs: all passed');
