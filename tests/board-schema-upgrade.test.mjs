/**
 * An older database has calendars but no Notes tables.
 * Opening Notes must add the tables and leave the calendar row in place.
 * Run: node tests/board-schema-upgrade.test.mjs
 */
import { createRequire } from 'node:module';
import { makeEnv, loadWorker, addUser, client } from './support/worker-rig.mjs';

const require = createRequire(import.meta.url);
const { applyBoardSchemaSync } = require('../shared/board-schema.cjs');

let failures = 0;
function check(name, ok, detail) {
    if (!ok) {
        failures += 1;
        console.error(`FAIL ${name}${detail ? ` (${detail})` : ''}`);
    }
}

function dropBoardTables(env) {
    [
        'board_read_state',
        'board_revisions',
        'board_reactions',
        'board_replies',
        'board_post_mentions',
        'board_post_students',
        'board_posts'
    ].forEach((name) => {
        env.DB.raw.exec(`DROP TABLE IF EXISTS ${name}`);
    });
}

function hasSourceColumn(env) {
    return env.DB.raw
        .prepare("SELECT name FROM pragma_table_info('board_posts') WHERE name='source_ref'")
        .get();
}

const worker = await loadWorker();

{
    const env = makeEnv();
    env.DATA_ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 4).toString('base64');
    const token = addUser(env, 'ua', 'Teacher Alpha', 'admin');
    const A = client(worker, env, token);
    const created = await A('POST', '/api/calendars', {
        name: 'Old Term',
        data: { classes: [{ id: 'c1', name: 'Class One' }], cohorts: [], events: [], dayNotes: [] }
    });
    check('calendar still creates on the old database', created.status === 201, `status=${created.status}`);
    const calendarId = created.body && created.body.id;
    dropBoardTables(env);
    check(
        'previous database has no notes tables',
        !env.DB.raw.prepare("SELECT name FROM sqlite_master WHERE name='board_posts'").get()
    );
    const posted = await A('POST', `/api/calendars/${calendarId}/board/posts`, {
        boardKind: 'class',
        boardRef: 'c1',
        body: 'Note after the upgrade'
    });
    check('first note creates the missing tables', posted.status === 201, `status=${posted.status} ${JSON.stringify(posted.body)}`);
    check('source column was added', Boolean(hasSourceColumn(env)));
    const kept = env.DB.raw.prepare('SELECT name FROM calendars WHERE id = ?').get(calendarId);
    check('existing calendar row was kept', kept && kept.name === 'Old Term', JSON.stringify(kept));
}

{
    const env = makeEnv();
    env.DATA_ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 5).toString('base64');
    const token = addUser(env, 'ub', 'Teacher Beta', 'teacher');
    const B = client(worker, env, token);
    const created = await B('POST', '/api/calendars', {
        name: 'Half Upgraded',
        data: { classes: [], cohorts: [], events: [] }
    });
    const calendarId = created.body.id;
    env.DB.raw.exec('DROP INDEX IF EXISTS idx_board_posts_source');
    env.DB.raw.exec('ALTER TABLE board_posts DROP COLUMN source_ref');
    check('column starts missing', !hasSourceColumn(env));
    const feed = await B('GET', `/api/calendars/${calendarId}/board/feed?scope=mine`);
    check('feed opens on a half-upgraded database', feed.status === 200, `status=${feed.status}`);
    check('missing source column is added', Boolean(hasSourceColumn(env)));
}

{
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.exec(
        `CREATE TABLE calendars (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL,
            updated_by TEXT NOT NULL DEFAULT ''
        )`
    );
    db.prepare('INSERT INTO calendars (id, name, data, revision, updated_at) VALUES (?, ?, ?, 1, ?)').run(
        'cal-old',
        'Kept',
        '{}',
        '2026-01-01T00:00:00.000Z'
    );
    applyBoardSchemaSync(db);
    applyBoardSchemaSync(db);
    const row = db.prepare('SELECT name FROM calendars WHERE id = ?').get('cal-old');
    const posts = db.prepare("SELECT name FROM sqlite_master WHERE name='board_posts'").get();
    check('local startup upgrade keeps the old calendar', row && row.name === 'Kept');
    check('local startup upgrade creates notes tables', Boolean(posts));
    check(
        'local startup upgrade adds source_ref',
        Boolean(db.prepare("SELECT name FROM pragma_table_info('board_posts') WHERE name='source_ref'").get())
    );
}

if (failures) {
    console.error(`\n${failures} board-schema-upgrade check(s) failed`);
    process.exit(1);
}
console.log('board-schema-upgrade.test.mjs: all passed');
