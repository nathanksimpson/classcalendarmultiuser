/**
 * Lock-free live sync, end to end in Node: two browser tabs (each running the real
 * js/calendar-sync.js in its own context) edit one calendar through a fake server that
 * applies PATCHes with the real server code (calendar-mutations + sync-revs).
 * Run: node tests/live-sync-tabs.test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const Mutations = require('../shared/calendar-mutations.cjs');
const SyncRevs = require('../shared/sync-revs.cjs');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Fake Worker: GET / PATCH / meta on one calendar, same rules as worker/src/index.js. */
function createServer(initial) {
    const server = { revision: 5, name: 'Fall 2026', data: clone(initial), patches: 0, offline: false };
    function doc() {
        const data = clone(server.data);
        delete data._syncRevs;
        return { id: 'cal1', name: server.name, revision: server.revision, data, canEdit: true, readOnly: false };
    }
    server.handle = (url, opts) => {
        if (server.offline) {
            return Promise.reject(new TypeError('Failed to fetch'));
        }
        const method = (opts && opts.method) || 'GET';
        const body = opts && opts.body ? JSON.parse(opts.body) : null;
        let status = 200;
        let json;
        if (url === '/api/calendars/cal1/meta') {
            json = { id: 'cal1', revision: server.revision, canEdit: true, readOnly: false, viewers: [] };
        } else if (url === '/api/calendars/cal1' && method === 'GET') {
            json = doc();
        } else if (url === '/api/calendars/cal1' && method === 'PATCH') {
            server.patches += 1;
            let overwritten = [];
            if (body.baseRevision != null && body.baseRevision !== server.revision) {
                const check = SyncRevs.canRebase(server.data, body.mutations, body.baseRevision, server.revision);
                if (!check.ok && check.reason === 'conflict') {
                    overwritten = check.keys;
                }
            }
            const merged = Mutations.applyCalendarMutations(server.data, body.mutations);
            server.data = SyncRevs.stampMutations(server.data, server.revision, merged, body.mutations, server.revision + 1);
            server.revision += 1;
            json = Object.assign(doc(), { overwritten });
        } else {
            status = 404;
            json = { error: 'not found' };
        }
        return Promise.resolve({
            status,
            ok: status < 400,
            statusText: '',
            text: () => Promise.resolve(JSON.stringify(json))
        });
    };
    return server;
}

/** One browser tab: its own CalendarSync, localStorage and page data. */
function createTab(server, name, opts = {}) {
    const storage = new Map();
    const tab = { name, data: null, notices: [], applied: 0 };
    const context = {
        console,
        setTimeout,
        clearTimeout,
        AbortController,
        FormData: class {},
        fetch: (url, opts) => server.handle(url, opts),
        localStorage: {
            getItem: (k) => (storage.has(k) ? storage.get(k) : null),
            setItem: (k, v) => storage.set(k, String(v)),
            removeItem: (k) => storage.delete(k)
        },
        addEventListener() {}
    };
    if (opts.perms) {
        context.TeamAuth = {
            getUser: () => ({ id: 'u1' }),
            isSignedIn: () => true,
            isViewAsMode: () => false,
            hasPermission: (p) => opts.perms.includes(p)
        };
    }
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);
    for (const f of ['js/sync-diff.js', 'js/calendar-mutations.js', 'js/calendar-sync.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
    }
    const CS = context.CalendarSync;
    CS.setActiveCalendarId('cal1');
    CS.setHandlers({
        onOverwritten: (keys, kind) => tab.notices.push({ keys, kind }),
        onDenied: (fields) => tab.notices.push({ denied: fields })
    });
    CS.setLiveSource({
        getData: () => tab.data,
        applyData(merged) {
            tab.applied += 1;
            tab.data = merged;
        }
    });
    tab.CS = CS;
    tab.storage = storage;
    tab.open = async () => {
        const doc = await CS.loadCalendar('cal1');
        CS.adoptServerDoc(doc);
        tab.data = CS.replayPendingChanges('cal1', clone(doc.data));
        tab.data.calendarName = doc.name;
    };
    tab.save = () => CS.saveNow();
    tab.pull = async () => {
        // What the poll does when meta says the server is newer.
        const doc = await CS.loadCalendar('cal1');
        CS.mergeServerDoc(doc);
    };
    return tab;
}

const initial = {
    calendarName: 'Fall 2026',
    classes: [
        { id: 'c1', name: 'Rainbow 1', period: 1, note: '' },
        { id: 'c2', name: 'Waterflow', period: 2 }
    ],
    events: [],
    attendanceSessions: [
        { id: 'a1', classId: 'c1', date: '2026-11-11', records: [{ studentId: 's1', status: 'present' }, { studentId: 's2', status: 'present' }] }
    ],
    meta: { versions: { lessons: 1, syllabus: 1, roster: 1 } }
};

// Scenario A: same account, two tabs, edits to different things → both kept, no notices.
{
    const server = createServer(initial);
    const pc = createTab(server, 'pc');
    const phone = createTab(server, 'phone');
    await pc.open();
    await phone.open();
    assert(pc.CS.isLiveSync() && phone.CS.isLiveSync(), 'live sync active in both tabs');
    assert(pc.CS.state.readOnly === false && phone.CS.state.readOnly === false, 'neither tab is view-only');

    pc.data.classes[0].note = 'PC note';
    phone.data.events.push({ id: 'e1', name: 'Field trip' });
    phone.data.attendanceSessions[0].records[1].status = 'absent';
    await pc.save();
    await phone.save(); // phone's base is stale: server merges, nothing lost
    await pc.pull();
    await phone.pull();
    for (const tab of [pc, phone]) {
        assert(tab.data.classes[0].note === 'PC note', tab.name + ' sees PC note');
        assert(tab.data.events.some((e) => e.id === 'e1'), tab.name + ' sees phone event');
        assert(tab.data.attendanceSessions[0].records.find((r) => r.studentId === 's2').status === 'absent',
            tab.name + ' sees attendance');
        assert(!tab.CS.hasUnsavedLiveChanges(), tab.name + ' has nothing left to save');
    }
    assert(pc.notices.length === 0 && phone.notices.length === 0, 'no overwrite notices for unrelated edits');
}

// Scenario B: unsaved edit survives an incoming change (pull while editing).
{
    const server = createServer(initial);
    const pc = createTab(server, 'pc');
    const phone = createTab(server, 'phone');
    await pc.open();
    await phone.open();
    phone.data.classes[1].name = 'Waterflow A';
    await phone.save();
    pc.data.classes[0].period = 3; // not saved yet
    await pc.pull();
    assert(pc.data.classes[1].name === 'Waterflow A', 'pc got phone rename');
    assert(pc.data.classes[0].period === 3, 'pc kept its unsaved edit through the pull');
    await pc.save();
    assert(server.data.classes[0].period === 3 && server.data.classes[1].name === 'Waterflow A', 'server has both');
}

// Scenario C: same field on both → latest wins, a notice appears.
{
    const server = createServer(initial);
    const pc = createTab(server, 'pc');
    const phone = createTab(server, 'phone');
    await pc.open();
    await phone.open();
    phone.data.classes[0].note = 'from phone';
    await phone.save();
    pc.data.classes[0].note = 'from pc';
    await pc.save();
    assert(server.data.classes[0].note === 'from pc', 'latest save wins');
    assert(pc.notices.some((n) => n.kind === 'save' && n.keys.some((k) => k.startsWith('classes:c1'))),
        'pc told it replaced a newer edit: ' + JSON.stringify(pc.notices));
    await phone.pull();
    assert(phone.data.classes[0].note === 'from pc', 'phone converges');
}

// Scenario D: offline save keeps the change; it is sent on reconnect and survives a reload.
{
    const server = createServer(initial);
    const pc = createTab(server, 'pc');
    await pc.open();
    pc.data.classes[0].name = 'Rainbow 1 (offline)';
    server.offline = true;
    let queued = false;
    try {
        await pc.save();
    } catch (err) {
        queued = Boolean(err && err.queuedOffline);
    }
    pc.CS.state.saveRetryTimer && clearTimeout(pc.CS.state.saveRetryTimer);
    pc.CS.state.saveRetryTimer = null;
    assert(queued, 'offline save is queued, not dropped');
    // Tab reloads while still offline-ish: new page, same storage.
    server.offline = false;
    const reopened = createTab(server, 'pc-reload');
    for (const [k, v] of pc.storage) {
        reopened.storage.set(k, v);
    }
    await reopened.open();
    assert(reopened.data.classes[0].name === 'Rainbow 1 (offline)', 'offline edit replayed after reload');
    await reopened.save();
    assert(server.data.classes[0].name === 'Rainbow 1 (offline)', 'offline edit reached the server');
    assert(!reopened.storage.has('classCalendarLivePending:cal1'), 'pending cleared after save');
}

// Scenario E: own save echo does not re-render the page.
{
    const server = createServer(initial);
    const pc = createTab(server, 'pc');
    await pc.open();
    pc.data.classes[1].period = 4;
    await pc.save();
    assert(pc.applied === 0, 'own save does not re-apply data (no flicker), applied=' + pc.applied);
    const before = server.patches;
    await pc.save();
    assert(server.patches === before, 'nothing to save → no request');
}

// Scenario F: teacher without curriculum rights — blocked change put back, not resent.
{
    const server = createServer(Object.assign({}, initial, { curriculumOverrides: { book1: { note: 'admin' } } }));
    const t = createTab(server, 'teacher', { perms: ['edit_classes', 'edit_events', 'edit_planner'] });
    await t.open();
    t.data.curriculumOverrides.book1.note = 'teacher tried';
    t.data.classes[0].note = 'allowed';
    await t.save();
    assert(server.data.classes[0].note === 'allowed', 'allowed change saved');
    assert(server.data.curriculumOverrides.book1.note === 'admin', 'curriculum untouched on server');
    assert(t.data.curriculumOverrides.book1.note === 'admin', 'blocked change put back on screen');
    assert(t.notices.some((n) => n.denied && n.denied.includes('curriculumOverrides')), 'teacher told');
    const before = server.patches;
    await t.save();
    assert(server.patches === before, 'blocked change not resent');
}

console.log('live-sync-tabs.test.mjs: all passed');
