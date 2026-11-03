/**
 * Per-teacher batch draft: sanitize, encrypt, conflict, and route contract.
 * Run: node tests/essay-batch-draft.test.mjs
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

if (!process.env.ESSAY_DRAFT_TEST_QUIET) {
    const child = spawnSync(process.execPath, ['--no-warnings', fileURLToPath(import.meta.url)], {
        stdio: 'inherit',
        env: Object.assign({}, process.env, { ESSAY_DRAFT_TEST_QUIET: '1' }),
        cwd: root
    });
    process.exit(child.status == null ? 1 : child.status);
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const core = require(path.join(root, 'shared', 'essay-batch-draft-core.cjs'));
const KEY = Buffer.alloc(32, 7).toString('base64');
process.env.DATA_ENCRYPTION_MASTER_KEY = KEY;

function makeTable() {
    const rows = new Map();
    const key = (userId, calendarId) => `${userId}\u0000${calendarId}`;
    return {
        get(userId, calendarId) {
            return rows.get(key(userId, calendarId)) || null;
        },
        put(userId, calendarId, row) {
            rows.set(key(userId, calendarId), row);
        }
    };
}

function loadServer(table) {
    const schemaPath = require.resolve(path.join(root, 'server', 'schema.js'));
    const draftsPath = require.resolve(path.join(root, 'server', 'essay-batch-drafts.js'));
    delete require.cache[draftsPath];
    let tick = 0;
    require.cache[schemaPath] = {
        id: schemaPath,
        filename: schemaPath,
        loaded: true,
        exports: {
            nowIso: () => {
                tick += 1;
                return `2026-10-28T00:00:0${tick}.000Z`;
            },
            getDb: () => ({
                prepare: (sql) => ({
                    get: (userId, calendarId) => (String(sql).includes('SELECT') ? table.get(userId, calendarId) : null),
                    run: (userId, calendarId, data, dataEncVersion, dataKeyWrapped, updatedAt) =>
                        table.put(userId, calendarId, {
                            data,
                            dataEncVersion,
                            dataKeyWrapped,
                            updatedAt
                        })
                })
            })
        }
    };
    return require(draftsPath);
}

function makeWorkerEnv(table) {
    return {
        DATA_ENCRYPTION_MASTER_KEY: KEY,
        DB: {
            prepare(sql) {
                return {
                    bind(...params) {
                        return {
                            first: async () =>
                                String(sql).includes('SELECT') ? table.get(params[0], params[1]) : null,
                            run: async () => {
                                table.put(params[0], params[1], {
                                    data: params[2],
                                    dataEncVersion: params[3],
                                    dataKeyWrapped: params[4],
                                    updatedAt: params[5]
                                });
                                return { meta: { changes: 1 } };
                            }
                        };
                    }
                };
            }
        }
    };
}

const sample = {
    essayType: 'opinion',
    textInput: 'Hello essay',
    openaiApiKey: 'sk-secret',
    rules: [{ id: 'do-not-keep' }],
    promptBlocks: { feedbackStyle: 'nope' },
    results: [
        { resultId: 'pending', _pending: true, essayText: 'skip me' },
        {
            resultId: 'ok',
            essayText: 'kept',
            analysis: { teacherFeedback: 'Clear opinion.', openaiApiKey: 'sk-nested' }
        }
    ],
    batchTeachingNotes: { totalStudents: 1, openaiApiKey: 'sk-notes' },
    listLinks: [{ studentName: 'Kim', className: 'Leo', classId: 'c1', syllabusRowId: 'row1', studentId: 'st1' }]
};

{
    const sanitized = core.sanitizeDraft(sample);
    assert(!sanitized.error, 'sample draft is within the size cap');
    const packed = JSON.stringify(sanitized.draft);
    assert(!packed.includes('sk-secret') && !packed.includes('sk-nested') && !packed.includes('sk-notes'), 'api keys stripped');
    assert(!packed.includes('do-not-keep'), 'grader rules are not part of the draft');
    assert(sanitized.draft.essayType === 'opinion', 'essay type kept');
    assert(sanitized.draft.results.length === 1, 'pending results dropped');
    assert(sanitized.draft.results[0].analysis.teacherFeedback === 'Clear opinion.', 'grades kept');
    assert(!sanitized.draft.results[0].analysis.openaiApiKey, 'nested api key dropped');
    assert(sanitized.draft.batchTeachingNotes.totalStudents === 1, 'teaching notes kept');
    assert(sanitized.draft.listLinks[0].studentId === 'st1', 'list link kept');
    const tooBig = core.sanitizeDraft({ textInput: 'a'.repeat(core.MAX_DRAFT_BYTES + 1) });
    assert(tooBig.status === 413 && tooBig.code === 'DRAFT_TOO_LARGE', 'size cap');
    assert(core.draftConflict('', null) === false, 'first save is not a conflict');
    assert(core.draftConflict('2026-10-28T00:00:00.000Z', null) === true, 'missing base is stale');
    assert(core.draftConflict('2026-10-28T00:00:00.000Z', '2026-10-28T00:00:00.000Z') === false, 'matching base is current');
    assert(core.draftConflict('2026-10-28T00:00:00.000Z', '2026-10-27T00:00:00.000Z') === true, 'old base is stale');
}

const worker = await import(pathToFileURL(path.join(root, 'worker', 'src', 'essay-batch-drafts.js')).href);
const workerTable = makeTable();
const workerEnv = makeWorkerEnv(workerTable);
const server = loadServer(makeTable());

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

{
    const saved = await worker.putDraft(workerEnv, 'u1', 'cal1', { baseUpdatedAt: null, draft: sample });
    assert(saved.draft.textInput === 'Hello essay', 'worker keeps essay text');
    assert(!JSON.stringify(saved.draft).includes('sk-secret'), 'worker response has no api key');
    const stored = workerTable.get('u1', 'cal1');
    assert(String(stored.data).startsWith('enc1$'), 'worker stores an encrypted blob');
    assert(!String(stored.data).includes('Hello essay'), 'essay text is not plaintext in the row');
    assert(!String(stored.data).includes('sk-secret'), 'api key is not stored');
    const loaded = await worker.getDraft(workerEnv, 'u1', 'cal1');
    assert(loaded.draft.results[0].analysis.teacherFeedback === 'Clear opinion.', 'worker decrypts grades');
    assert(loaded.updatedAt === saved.updatedAt, 'worker get returns the saved time');

    await wait(5);
    const second = await worker.putDraft(workerEnv, 'u1', 'cal1', {
        baseUpdatedAt: saved.updatedAt,
        draft: { textInput: 'Second draft', essayType: 'speech' }
    });
    assert(second.draft.textInput === 'Second draft', 'worker updates when base matches');

    let conflict = null;
    try {
        await worker.putDraft(workerEnv, 'u1', 'cal1', {
            baseUpdatedAt: saved.updatedAt,
            draft: { textInput: 'Stale overwrite' }
        });
    } catch (err) {
        conflict = err;
    }
    assert(conflict && conflict.status === 409 && conflict.code === 'DRAFT_CONFLICT', 'worker 409 when baseUpdatedAt is old');
    assert(conflict.draft.textInput === 'Second draft', 'worker 409 returns the newer draft');
    assert(conflict.updatedAt === second.updatedAt, 'worker 409 returns the newer time');
}

{
    const saved = server.putDraft('u1', 'cal1', { baseUpdatedAt: null, draft: sample });
    assert(!JSON.stringify(saved.draft).includes('sk-secret'), 'server response has no api key');
    const stored = server.putDraft && saved;
    assert(stored.draft.essayType === 'opinion', 'server keeps essay type');
    const again = server.putDraft('u1', 'cal1', {
        baseUpdatedAt: saved.updatedAt,
        draft: { textInput: 'Server second' }
    });
    let conflict = null;
    try {
        server.putDraft('u1', 'cal1', { baseUpdatedAt: saved.updatedAt, draft: { textInput: 'Stale' } });
    } catch (err) {
        conflict = err;
    }
    assert(conflict && conflict.status === 409 && conflict.draft.textInput === 'Server second', 'server 409 when baseUpdatedAt is old');
    assert(again.draft.textInput === 'Server second', 'server matching base saved');

    let tooBig = null;
    try {
        server.putDraft('u1', 'cal1', {
            baseUpdatedAt: again.updatedAt,
            draft: { textInput: 'b'.repeat(core.MAX_DRAFT_BYTES + 50) }
        });
    } catch (err) {
        tooBig = err;
    }
    assert(tooBig && tooBig.status === 413 && tooBig.code === 'DRAFT_TOO_LARGE', 'server rejects an oversized draft');
    const still = server.getDraft('u1', 'cal1');
    assert(still.draft.textInput === 'Server second', 'rejected save does not replace the draft');
}

const workerIndex = readFileSync(path.join(root, 'worker', 'src', 'index.js'), 'utf8');
const serverIndex = readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
const serverCalendars = readFileSync(path.join(root, 'server', 'calendars.js'), 'utf8');
const schema = readFileSync(path.join(root, 'server', 'schema.js'), 'utf8');
const migration = readFileSync(path.join(root, 'worker', 'migrations', '0020_essay_batch_drafts.sql'), 'utf8');
const sync = readFileSync(path.join(root, 'js', 'calendar-sync.js'), 'utf8');
const editor = readFileSync(path.join(root, 'tools', 'essay-batch-editor.html'), 'utf8');

assert(migration.includes('CREATE TABLE IF NOT EXISTS essay_batch_drafts'), 'migration creates the draft table');
assert(schema.includes('CREATE TABLE IF NOT EXISTS essay_batch_drafts'), 'local schema creates the draft table');
assert(schema.includes('migrateEssayBatchDrafts(db)'), 'local schema runs the draft migration');
assert(
    workerIndex.includes("'DELETE FROM essay_batch_drafts WHERE calendar_id = ?', calId"),
    'worker calendar delete removes drafts for that calendar only'
);
assert(
    serverCalendars.includes("DELETE FROM essay_batch_drafts WHERE calendar_id = ?').run(id)"),
    'server calendar delete removes drafts for that calendar only'
);
assert(!/DELETE FROM essay_batch_drafts WHERE user_id/.test(workerIndex + serverCalendars), 'no user-wide draft delete');

assert(workerIndex.includes("path.match(/^\\/api\\/calendars\\/([^/]+)\\/essay-batch-draft$/)"), 'worker draft route');
assert(workerIndex.includes('EssayBatchDrafts.getDraft(env, user.id, calId)'), 'worker GET handler');
assert(workerIndex.includes('EssayBatchDrafts.putDraft(env, user.id, calId, body || {})'), 'worker PUT handler');
assert(workerIndex.includes('UiPrefs.isReservedCalendarId(calId)'), 'worker rejects the reserved prefs id');
const workerRoute = workerIndex.slice(
    workerIndex.indexOf('essayBatchDraftMatch'),
    workerIndex.indexOf('essayBatchDraftMatch') + 1600
);
assert(workerRoute.includes('CalAccess.canAccessCalendar'), 'worker draft route checks calendar access');
assert(workerRoute.includes('rejectViewAsJson()'), 'worker PUT rejects view-as');

assert(
    serverIndex.includes("app.get('/api/calendars/:id/essay-batch-draft', requireUser"),
    'server GET route requires sign-in'
);
assert(
    serverIndex.includes("app.put('/api/calendars/:id/essay-batch-draft', requireUser, rejectViewAsWrites"),
    'server PUT route rejects view-as'
);
const serverRoutes = serverIndex.match(/app\.(get|put)\('\/api\/calendars\/:id\/essay-batch-draft'[\s\S]*?\n\}\);/g) || [];
assert(serverRoutes.length === 2, 'server has both draft routes');
serverRoutes.forEach((block) => {
    assert(block.includes('CalAccess.canAccessCalendar'), 'server draft route checks calendar access');
    assert(block.includes('UiPrefs.isReservedCalendarId(calId)'), 'server rejects the reserved prefs id');
});

assert(sync.includes('async loadEssayBatchDraft(calendarId)') && sync.includes("'/essay-batch-draft'"), 'client loads the draft');
assert(sync.includes('async putEssayBatchDraft(calendarId, body)'), 'client saves the draft');
assert(sync.includes('VIEW_AS_MODE'), 'client refuses view-as writes');
assert(editor.includes('essay-batch-draft-sync.js'), 'batch editor loads the draft sync script');
assert(editor.includes('scheduleDraftCloudSave'), 'batch editor saves the current batch');

console.log('essay-batch-draft.test.mjs: all passed');
