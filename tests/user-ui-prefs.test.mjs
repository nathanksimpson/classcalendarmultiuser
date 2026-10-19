/**
 * Per-teacher UI prefs (/api/me/ui-prefs): worker + server sanitizers and route contract.
 * Run: node tests/user-ui-prefs.test.mjs
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

/** In-memory stand-in for user_ui_prefs keyed by user_id + calendar_id. */
function makeTable() {
    const rows = new Map();
    const key = (u, c) => `${u}\u0000${c}`;
    return {
        rows,
        get: (u, c) => rows.get(key(u, c)) || null,
        put: (u, c, prefsJson, updatedAt) => rows.set(key(u, c), { prefs_json: prefsJson, updated_at: updatedAt })
    };
}

function loadWorker(table) {
    const src = readFileSync(path.join(root, 'worker', 'src', 'ui-prefs.js'), 'utf8')
        .replace(/^import[^\n]*\n/m, '')
        .replace(/^export /gm, '');
    const sandbox = {
        dbOne: async (_env, _sql, userId, calendarId) => table.get(userId, calendarId),
        dbRun: async (_env, _sql, userId, calendarId, prefsJson, updatedAt) =>
            table.put(userId, calendarId, prefsJson, updatedAt),
        nowIso: () => '2026-10-14T00:00:00.000Z',
        JSON
    };
    vm.runInNewContext(
        `${src}\n;globalThis.__api = { USER_PREFS_CALENDAR_ID, isReservedCalendarId, sanitizeUserPrefsBody, getUserPrefs, putUserPrefs };`,
        sandbox
    );
    return sandbox.__api;
}

function loadServer(table) {
    const schemaPath = require.resolve(path.join(root, 'server', 'schema.js'));
    const prefsPath = require.resolve(path.join(root, 'server', 'ui-prefs.js'));
    delete require.cache[prefsPath];
    require.cache[schemaPath] = {
        id: schemaPath,
        filename: schemaPath,
        loaded: true,
        exports: {
            nowIso: () => '2026-10-14T00:00:00.000Z',
            getDb: () => ({
                prepare: () => ({
                    get: (userId, calendarId) => table.get(userId, calendarId),
                    run: (userId, calendarId, prefsJson, updatedAt) => table.put(userId, calendarId, prefsJson, updatedAt)
                })
            })
        }
    };
    return require(prefsPath);
}

const workerTable = makeTable();
const serverTable = makeTable();
const worker = loadWorker(workerTable);
const server = loadServer(serverTable);

const cases = [
    [{ classScope: 'mine' }, { classScope: 'mine' }],
    [{ classScope: 'all' }, { classScope: 'all' }],
    [{ classScope: 'MINE' }, { classScope: null }],
    [{ classScope: 'mine', navZoneOrder: ['x'], evil: 1 }, { classScope: 'mine' }],
    [{ navZoneOrder: ['x'] }, {}],
    [null, {}],
    [['mine'], {}]
];
for (const [input, expected] of cases) {
    const w = JSON.stringify(worker.sanitizeUserPrefsBody(input));
    const s = JSON.stringify(server.sanitizeUserPrefsBody(input));
    assert(w === JSON.stringify(expected), `worker sanitize ${JSON.stringify(input)} → ${w}`);
    assert(s === w, `server sanitize matches worker for ${JSON.stringify(input)}`);
}

assert(worker.USER_PREFS_CALENDAR_ID === '__user__' && server.USER_PREFS_CALENDAR_ID === '__user__', 'reserved id');
assert(worker.isReservedCalendarId('__user__') && server.isReservedCalendarId('__user__'), 'reserved id detected');
assert(!worker.isReservedCalendarId('cal-1') && !server.isReservedCalendarId('cal-1'), 'real ids pass');

{
    const empty = await worker.getUserPrefs({}, 'u1');
    assert(empty.classScope === null && empty.updatedAt === null, 'worker GET empty → null scope');
    const saved = await worker.putUserPrefs({}, 'u1', { classScope: 'mine', junk: true });
    assert(saved.classScope === 'mine' && saved.updatedAt, 'worker PUT returns saved scope');
    const stored = JSON.parse(workerTable.get('u1', '__user__').prefs_json);
    assert(JSON.stringify(stored) === '{"classScope":"mine"}', 'worker stores sanitized prefs only');
    const kept = await worker.putUserPrefs({}, 'u1', {});
    assert(kept.classScope === 'mine', 'PUT without classScope keeps the previous value');
}

{
    assert(server.getUserPrefs('u1').classScope === null, 'server GET empty → null scope');
    const saved = server.putUserPrefs('u1', { classScope: 'all', navTabOrder: {} });
    assert(saved.classScope === 'all', 'server PUT returns saved scope');
    assert(serverTable.get('u1', '__user__').prefs_json === '{"classScope":"all"}', 'server stores sanitized prefs only');
}

const workerIndex = readFileSync(path.join(root, 'worker', 'src', 'index.js'), 'utf8');
const serverIndex = readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
assert(workerIndex.includes("path === '/api/me/ui-prefs'"), 'worker has /api/me/ui-prefs');
assert(/UiPrefs\.getUserPrefs\(env, user\.id\)/.test(workerIndex), 'worker GET handler');
assert(/UiPrefs\.putUserPrefs\(env, user\.id/.test(workerIndex), 'worker PUT handler');
assert(serverIndex.includes("app.get('/api/me/ui-prefs', requireUser"), 'server GET route');
assert(serverIndex.includes("app.put('/api/me/ui-prefs', requireUser, rejectViewAsWrites"), 'server PUT route rejects view-as');
assert(
    /\/api\/me\/ui-prefs'\) \{[\s\S]{0,400}rejectViewAsJson\(\)/.test(workerIndex),
    'worker PUT rejects view-as'
);

const workerCalRoute = workerIndex.slice(workerIndex.indexOf('const uiPrefsMatch'), workerIndex.indexOf('const uiPrefsMatch') + 400);
assert(workerCalRoute.includes('UiPrefs.isReservedCalendarId(calId)'), 'worker rejects __user__ on calendar route');
const serverCalRoutes = serverIndex.match(/app\.(get|put)\('\/api\/calendars\/:id\/ui-prefs'[\s\S]*?\n\}\);/g) || [];
assert(serverCalRoutes.length === 2, 'server has both calendar ui-prefs routes');
serverCalRoutes.forEach((block) => {
    assert(block.includes('UiPrefs.isReservedCalendarId(calId)'), 'server rejects __user__ on calendar route');
});

const serverCalendars = readFileSync(path.join(root, 'server', 'calendars.js'), 'utf8');
assert(
    workerIndex.includes("'DELETE FROM user_ui_prefs WHERE calendar_id = ?', calId"),
    'worker calendar delete only removes rows for that calendar id'
);
assert(
    serverCalendars.includes("DELETE FROM user_ui_prefs WHERE calendar_id = ?').run(id)"),
    'server calendar delete only removes rows for that calendar id'
);
assert(!/DELETE FROM user_ui_prefs WHERE (user_id|calendar_id NOT)/.test(workerIndex + serverCalendars), 'no broad prefs delete');

const sync = readFileSync(path.join(root, 'js', 'calendar-sync.js'), 'utf8');
assert(sync.includes('async loadUserUiPrefs()') && sync.includes("apiFetch('/me/ui-prefs'"), 'client loadUserUiPrefs');
assert(sync.includes('async putUserUiPrefs(body)'), 'client putUserUiPrefs');

console.log('user-ui-prefs.test.mjs: all passed');
