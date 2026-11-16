/**
 * Startup prefetch (js/boot-prefetch.js) with the real js/calendar-sync.js:
 * the app's startup reads are answered from the prefetch, nothing is fetched twice,
 * failures fall back to the normal request, and View As / focus paths are never served
 * from it. Run: node tests/boot-prefetch.test.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

function makeResponse(status, json) {
    return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        text: () => Promise.resolve(json == null ? '' : JSON.stringify(json))
    });
}

function createPage(opts = {}) {
    const storage = new Map(Object.entries(opts.storage || {}));
    const session = new Map(Object.entries(opts.session || {}));
    const calls = [];
    const routes = Object.assign(
        {
            '/api/health': () => [200, { ok: true }],
            '/api/auth/me': () => [200, { id: 'u1', role: 'teacher', permissions: [] }],
            '/api/calendars': () => [200, [{ id: 'calA', name: 'A' }, { id: 'calB', name: 'B' }]],
            '/api/teachers': () => [200, [{ id: 'u1' }]],
            '/api/host-info': () => [200, { primaryTeamUrl: 'https://classmanager.live' }],
            '/api/me/ui-prefs': () => [200, { classScope: null, updatedAt: null }],
            '/api/calendars/calB': () => [200, { id: 'calB', revision: 3, data: { classes: [] }, canEdit: true }],
            '/api/calendars/calB/meta': () => [200, { id: 'calB', revision: 3, canEdit: true, viewers: [] }],
            '/api/calendars/calB/notification-meta': () => [200, { meta: { n1: 1 } }],
            '/api/calendars/calB/ui-prefs': () => [200, { navZoneOrder: null }]
        },
        opts.routes || {}
    );
    const context = {
        console,
        setTimeout,
        clearTimeout,
        AbortController,
        Promise,
        FormData: class {},
        location: { protocol: 'https:', search: opts.search || '', pathname: '/' },
        fetch: (url) => {
            calls.push(url);
            const route = routes[url];
            if (!route) {
                return makeResponse(404, { error: 'not found' });
            }
            const r = route();
            if (r === 'network') {
                return Promise.reject(new TypeError('Failed to fetch'));
            }
            return makeResponse(r[0], r[1]);
        },
        localStorage: {
            getItem: (k) => (storage.has(k) ? storage.get(k) : null),
            setItem: (k, v) => storage.set(k, String(v)),
            removeItem: (k) => storage.delete(k)
        },
        sessionStorage: {
            getItem: (k) => (session.has(k) ? session.get(k) : null),
            setItem: (k, v) => session.set(k, String(v)),
            removeItem: (k) => session.delete(k)
        },
        addEventListener() {}
    };
    context.TeamAuth = {
        getUser: () => ({ id: 'u1' }),
        isSignedIn: () => true,
        isViewAsMode: () => Boolean(opts.viewAs),
        hasPermission: () => true
    };
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);
    const files = opts.noPrefetch
        ? ['js/sync-diff.js', 'js/calendar-mutations.js', 'js/calendar-sync.js']
        : ['js/boot-prefetch.js', 'js/sync-diff.js', 'js/calendar-mutations.js', 'js/calendar-sync.js'];
    for (const f of files) {
        vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
    }
    return { context, calls, CS: context.CalendarSync, count: (u) => calls.filter((c) => c === u).length };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

async function runBoot(page) {
    const { CS } = page;
    assert(await CS.checkHealth(), 'health ok');
    await CS.fetchTeachers();
    await CS.fetchHostInfo();
    assert(await CS.checkHealth(), 'second health ok');
    const list = await CS.listCalendars();
    assert(Array.isArray(list) && list.length === 2, 'calendar list');
    const doc = await CS.loadCalendar('calB');
    assert(doc && doc.id === 'calB' && doc.revision === 3, 'calendar doc');
    await CS.loadUserUiPrefs();
    await CS.loadUiPrefs('calB');
    await CS.refreshLockMeta('calB');
    const nm = await CS.loadNotificationMeta('calB');
    assert(nm.meta && nm.meta.n1 === 1, 'notification meta');
}

const tests = {
    async 'every startup read is fetched once and served from the prefetch'() {
        const page = createPage({ storage: { 'teamCalendarActiveId:u1': 'calB' } });
        await settle();
        const before = page.calls.length;
        assert(before === 10, 'prefetch started 10 reads, got ' + before + ': ' + page.calls.join(', '));
        await runBoot(page);
        assert(page.calls.length === before, 'no extra requests after prefetch: ' + page.calls.slice(before).join(', '));
        page.calls.forEach((u) => assert(page.count(u) === 1, 'fetched once: ' + u));
    },

    async 'without the prefetch script the same reads go out normally'() {
        const page = createPage({ noPrefetch: true, storage: { 'teamCalendarActiveId:u1': 'calB' } });
        await runBoot(page);
        assert(page.count('/api/calendars/calB') === 1, 'calendar fetched');
        assert(page.count('/api/health') === 1, 'health shared');
    },

    async 'prefetch answers are used once: a later calendar load fetches a fresh copy'() {
        const page = createPage({ storage: { 'teamCalendarActiveId:u1': 'calB' } });
        await settle();
        await page.CS.loadCalendar('calB');
        await page.CS.loadCalendar('calB');
        assert(page.count('/api/calendars/calB') === 2, 'second load is a real request');
    },

    async 'stored calendar not in the list: prefetch picks the first calendar, like the app'() {
        const page = createPage({
            storage: { 'teamCalendarActiveId:u1': 'gone' },
            routes: { '/api/calendars/calA': () => [200, { id: 'calA', revision: 1, data: {} }] }
        });
        await settle();
        assert(page.count('/api/calendars/calA') === 1, 'calA prefetched');
        assert(page.count('/api/calendars/gone') === 0, 'stale id not fetched');
    },

    async 'a failed prefetch falls back to the normal request (and its error handling)'() {
        let n = 0;
        const page = createPage({
            storage: { 'teamCalendarActiveId:u1': 'calB' },
            routes: { '/api/teachers': () => (++n === 1 ? [500, { error: 'boom' }] : [200, [{ id: 'u2' }]]) }
        });
        await settle();
        const teachers = await page.CS.fetchTeachers();
        assert(teachers[0].id === 'u2', 'fallback answer used');
        assert(page.count('/api/teachers') === 2, 'retried once');
    },

    async 'signed out: no calendar-level prefetch, app requests run as before'() {
        const page = createPage({ routes: { '/api/auth/me': () => [401, { error: 'no' }], '/api/calendars': () => [401, { error: 'no' }] } });
        await settle();
        assert(page.count('/api/calendars/calB') === 0, 'no calendar prefetch when signed out');
    },

    async 'View As: nothing is prefetched and nothing is taken'() {
        const page = createPage({ session: { cal_view_as_session: 'tok' }, viewAs: true });
        await settle();
        assert(page.calls.length === 0, 'no prefetch in View As');
        const linkPage = createPage({ search: '?viewAsExchange=abc' });
        await settle();
        assert(linkPage.calls.length === 0, 'no prefetch on a View As link');
    },

    async 'meta with an edit focus is never served from the prefetch'() {
        const page = createPage({
            storage: { 'teamCalendarActiveId:u1': 'calB' },
            routes: { '/api/calendars/calB/meta?focus=classes%3Ac1': () => [200, { id: 'calB', revision: 3 }] }
        });
        await settle();
        page.CS.setHandlers({ getEditFocus: () => ({ key: 'classes:c1' }) });
        await page.CS.refreshLockMeta('calB');
        assert(page.count('/api/calendars/calB/meta?focus=classes%3Ac1') === 1, 'focus meta fetched for real');
    }
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
    try {
        await fn();
        console.log('ok -', name);
    } catch (err) {
        failed += 1;
        console.error('FAIL -', name, '\n ', err && err.message);
    }
}
if (failed) {
    process.exit(1);
}
console.log('boot-prefetch.test.mjs: all passed');
