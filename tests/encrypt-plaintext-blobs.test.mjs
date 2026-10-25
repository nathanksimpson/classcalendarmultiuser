/**
 * Run: node tests/encrypt-plaintext-blobs.test.mjs
 * Cron backfill: encrypts legacy plaintext calendar/suggestion rows in place, and never
 * overwrites a row whose revision changed between read and write.
 */
import crypto from 'crypto';
import { encryptPlaintextBlobs, parseDataObjectFromRow } from '../worker/src/calendar-storage.js';

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

/**
 * Tiny in-memory stand-in for the D1 calls encryptPlaintextBlobs makes (works on Node 18/20 —
 * no node:sqlite). Tables are plain arrays of row objects.
 */
function fakeDb() {
    return { calendars: [], calendar_suggestions: [] };
}

function d1(db, hooks = {}) {
    const tableOf = (sql) => (sql.includes('calendar_suggestions') ? 'calendar_suggestions' : 'calendars');
    const plain = (r) => (r.data_enc_version || 0) < 1;
    return {
        prepare(sql) {
            let args = [];
            const t = tableOf(sql);
            const stmt = {
                bind(...a) {
                    args = a;
                    return stmt;
                },
                async all() {
                    return { results: db[t].filter(plain).map((r) => ({ id: r.id })) };
                },
                async first() {
                    const r = db[t].find((x) => x.id === args[0] && plain(x));
                    const row = r ? { id: r.id, data: r.data, revision: r.revision } : null;
                    if (hooks.afterFirst) {
                        hooks.afterFirst(sql, row);
                    }
                    return row;
                },
                async run() {
                    const [data, wrapped, id, revision] = args;
                    const r = db[t].find(
                        (x) => x.id === id && plain(x) && (t === 'calendar_suggestions' || x.revision === revision)
                    );
                    if (!r) {
                        return { meta: { changes: 0 } };
                    }
                    Object.assign(r, { data, data_key_wrapped: wrapped, data_enc_version: 1 });
                    return { meta: { changes: 1 } };
                }
            };
            return stmt;
        }
    };
}

const asRow = (r) => ({ id: r.id, data: r.data, dataEncVersion: r.data_enc_version, dataKeyWrapped: r.data_key_wrapped });

const key = crypto.randomBytes(32).toString('base64');
const doc = { schemaVersion: 3, cohorts: [{ students: [{ name: '김테가', nameEn: 'Stuaa' }] }] };

// 1. No key → no-op
{
    const db = fakeDb();
    db.calendars.push({ id: 'c1', data: JSON.stringify(doc), revision: 1, data_enc_version: 0 });
    const r = await encryptPlaintextBlobs({ DB: d1(db) });
    assert(r.calendars === 0, 'no key → nothing encrypted');
    assert(db.calendars[0].data_enc_version === 0, 'row untouched without key');
}

// 2. Encrypts calendars + suggestions; decrypts back to the same object; second run is a no-op
{
    const db = fakeDb();
    db.calendars.push({ id: 'c1', data: JSON.stringify(doc), revision: 7, data_enc_version: 0 });
    db.calendar_suggestions.push({ id: 's1', data: JSON.stringify(doc), data_enc_version: 0 });
    const env = { DB: d1(db), DATA_ENCRYPTION_MASTER_KEY: key };
    const r = await encryptPlaintextBlobs(env);
    assert(r.calendars === 1 && r.suggestions === 1, `encrypted both: ${JSON.stringify(r)}`);
    const row = Object.assign(asRow(db.calendars[0]), { revision: db.calendars[0].revision });
    assert(row.data.startsWith('enc1$') && !row.data.includes('김테가'), 'calendar ciphertext stored');
    assert(row.revision === 7, 'revision unchanged (no spurious conflict for teachers)');
    assert(JSON.stringify(parseDataObjectFromRow(row, row.id, env)) === JSON.stringify(doc), 'calendar round-trips');
    const sug = asRow(db.calendar_suggestions[0]);
    assert(JSON.stringify(parseDataObjectFromRow(sug, sug.id, env)) === JSON.stringify(doc), 'suggestion round-trips');
    const again = await encryptPlaintextBlobs(env);
    assert(again.calendars === 0 && again.suggestions === 0, 'idempotent');
}

// 3. A save that lands between read and write is not clobbered
{
    const db = fakeDb();
    db.calendars.push({ id: 'c1', data: JSON.stringify(doc), revision: 1, data_enc_version: 0 });
    const newer = JSON.stringify({ ...doc, edited: true });
    const hooks = {
        afterFirst(sql) {
            if (sql.includes('FROM calendars')) {
                Object.assign(db.calendars[0], { data: newer, revision: 2 });
            }
        }
    };
    const r = await encryptPlaintextBlobs({ DB: d1(db, hooks), DATA_ENCRYPTION_MASTER_KEY: key });
    assert(r.calendars === 0 && r.skipped === 1, 'concurrent save → skipped');
    const row = db.calendars[0];
    assert(row.data === newer && row.revision === 2, 'teacher save preserved');
}

console.log('encrypt-plaintext-blobs.test.mjs: all passed');
