/**
 * One-time migration: encrypt legacy plaintext calendar/suggestion blobs (data_enc_version = 0).
 *
 * Usage:
 *   Set DATA_ENCRYPTION_MASTER_KEY (same as production/local .env).
 *   node scripts/encrypt-calendars-blob.mjs --local
 *   node scripts/encrypt-calendars-blob.mjs --remote
 */
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const blobAtRest = require(path.join(root, 'crypto/blob-at-rest.js'));

const args = new Set(process.argv.slice(2));
const useLocal = args.has('--local');
const useRemote = args.has('--remote');

if (!useLocal && !useRemote) {
    console.error('Pass --local and/or --remote');
    process.exit(1);
}

const masterKey = process.env.DATA_ENCRYPTION_MASTER_KEY || '';
if (!masterKey) {
    console.error('Set DATA_ENCRYPTION_MASTER_KEY before running this script.');
    process.exit(1);
}

function sqlQuote(value) {
    return String(value).replace(/'/g, "''");
}

function encryptPlainRow(id, plainData) {
    const enc = blobAtRest.encryptBlob(String(plainData), id, masterKey);
    if (!enc) {
        throw new Error('encryptBlob returned null — check DATA_ENCRYPTION_MASTER_KEY');
    }
    return enc;
}

function migrateTableLocal(db, table, idColumn) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('data_enc_version')) {
        console.log(`[local] ${table}: skip (no data_enc_version column — run app migrate first)`);
        return { encrypted: 0, skipped: 0 };
    }
    const rows = db
        .prepare(
            `SELECT ${idColumn} AS id, data, data_enc_version AS dataEncVersion FROM ${table} WHERE COALESCE(data_enc_version, 0) < 1`
        )
        .all();
    const update = db.prepare(
        `UPDATE ${table} SET data = ?, data_key_wrapped = ?, data_enc_version = 1 WHERE ${idColumn} = ?`
    );
    let encrypted = 0;
    let skipped = 0;
    for (const row of rows) {
        if (blobAtRest.isEncryptedRow(row) || String(row.data || '').startsWith('enc1$')) {
            skipped += 1;
            continue;
        }
        const enc = encryptPlainRow(row.id, row.data);
        update.run(enc.data, enc.dataKeyWrapped, row.id);
        encrypted += 1;
        console.log(`[local] ${table}: encrypted ${row.id}`);
    }
    return { encrypted, skipped };
}

function migrateLocal() {
    const { getDb } = require(path.join(root, 'server/schema.js'));
    const db = getDb();
    const cal = migrateTableLocal(db, 'calendars', 'id');
    const sug = migrateTableLocal(db, 'calendar_suggestions', 'id');
    console.log(
        `[local] done — calendars: ${cal.encrypted} encrypted; suggestions: ${sug.encrypted} encrypted`
    );
}

function migrateTableRemote(table, idColumn) {
    const listSql = `SELECT ${idColumn} AS id, data, data_enc_version AS dataEncVersion FROM ${table} WHERE COALESCE(data_enc_version, 0) < 1`;
    const listFile = path.join(root, 'scripts', `.encrypt-list-${table}.sql`);
    writeFileSync(listFile, listSql, 'utf8');
    let raw;
    try {
        raw = execSync(`npx wrangler d1 execute calendar-team --remote --command "${listSql}" --json`, {
            cwd: root,
            encoding: 'utf8'
        });
    } finally {
        try {
            unlinkSync(listFile);
        } catch (_) {
            /* ignore */
        }
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        console.error(`[remote] failed to parse wrangler output for ${table}:`, err.message);
        console.error(raw);
        process.exit(1);
    }
    const results = parsed[0] && parsed[0].results ? parsed[0].results : [];
    let encrypted = 0;
    let skipped = 0;
    for (const row of results) {
        if (blobAtRest.isEncryptedRow(row) || String(row.data || '').startsWith('enc1$')) {
            skipped += 1;
            continue;
        }
        const enc = encryptPlainRow(row.id, row.data);
        const updateSql = `UPDATE ${table} SET data = '${sqlQuote(enc.data)}', data_key_wrapped = '${sqlQuote(
            enc.dataKeyWrapped
        )}', data_enc_version = 1 WHERE ${idColumn} = '${sqlQuote(row.id)}';`;
        const updateFile = path.join(root, 'scripts', `.encrypt-update-${table}-${row.id}.sql`);
        writeFileSync(updateFile, updateSql, 'utf8');
        try {
            execSync(`npx wrangler d1 execute calendar-team --remote --file="${updateFile}"`, {
                cwd: root,
                stdio: 'inherit'
            });
            encrypted += 1;
            console.log(`[remote] ${table}: encrypted ${row.id}`);
        } finally {
            try {
                unlinkSync(updateFile);
            } catch (_) {
                /* ignore */
            }
        }
    }
    return { encrypted, skipped };
}

function migrateRemote() {
    if (!existsSync(path.join(root, 'wrangler.toml'))) {
        console.error('wrangler.toml not found');
        process.exit(1);
    }
    const cal = migrateTableRemote('calendars', 'id');
    const sug = migrateTableRemote('calendar_suggestions', 'id');
    console.log(
        `[remote] done — calendars: ${cal.encrypted} encrypted; suggestions: ${sug.encrypted} encrypted`
    );
}

if (useLocal) {
    migrateLocal();
}
if (useRemote) {
    migrateRemote();
}
