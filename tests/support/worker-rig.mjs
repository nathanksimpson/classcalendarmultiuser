/**
 * Test rig: runs the real Worker fetch handler in Node against an in-memory SQLite
 * database built from worker/migrations, standing in for D1. Each query yields once
 * (like a real D1 round trip), so requests started together interleave and races show up.
 * Not a test file itself (no .test.mjs suffix).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const Database = require('better-sqlite3');

const tick = () => new Promise((resolve) => setImmediate(resolve));
const clean = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

class Stmt {
    constructor(db, sql, params = []) {
        this.db = db;
        this.sql = sql;
        this.params = params;
    }
    bind(...p) {
        return new Stmt(this.db, this.sql, p.map(clean));
    }
    async first(col) {
        await tick();
        const r = this.db.prepare(this.sql).get(...this.params);
        return r ? (col ? r[col] : Object.assign({}, r)) : null;
    }
    async all() {
        await tick();
        return { results: this.db.prepare(this.sql).all(...this.params).map((r) => Object.assign({}, r)) };
    }
    async run() {
        await tick();
        const r = this.db.prepare(this.sql).run(...this.params);
        return { meta: { changes: Number(r.changes) } };
    }
    runNow() {
        return this.db.prepare(this.sql).run(...this.params);
    }
}

export function makeEnv() {
    const db = new Database(':memory:');
    const dir = path.join(ROOT, 'worker', 'migrations');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
        const sql = fs.readFileSync(path.join(dir, f), 'utf8');
        try {
            db.exec(sql);
        } catch (_) {
            for (const part of sql.split(/;\s*\n/)) {
                try {
                    if (part.trim()) db.exec(part);
                } catch (_) {
                    /* column already added by an earlier file */
                }
            }
        }
    }
    const DB = {
        raw: db,
        prepare: (sql) => new Stmt(db, sql),
        async batch(stmts) {
            await tick();
            const run = db.transaction(() => stmts.map((s) => ({ meta: { changes: Number(s.runNow().changes) } })));
            return run();
        }
    };
    return { DB, ASSETS: { fetch: async () => new Response('asset', { status: 200 }) } };
}

export async function loadWorker() {
    const mod = await import(path.join(ROOT, 'worker', 'src', 'index.js'));
    return mod.default;
}

/** Invented test users only (see AGENTS.md: no real names in fixtures). */
export function addUser(env, id, name, role = 'teacher') {
    const now = new Date().toISOString();
    env.DB.raw
        .prepare('INSERT INTO users (id, email, display_name, role, active, created_at) VALUES (?,?,?,?,1,?)')
        .run(id, `${id}@example.test`, name, role, now);
    const token = `tok-${id}`;
    const cols = env.DB.raw.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
    const vals = {
        token,
        user_id: id,
        expires_at: new Date(Date.now() + 864e5).toISOString(),
        created_at: now,
        last_seen_at: now
    };
    const use = cols.filter((c) => c in vals);
    env.DB.raw
        .prepare(`INSERT INTO sessions (${use.join(',')}) VALUES (${use.map(() => '?').join(',')})`)
        .run(...use.map((c) => vals[c]));
    return token;
}

export function grant(env, calendarId, userId, level) {
    env.DB.raw
        .prepare("INSERT INTO calendar_members (calendar_id, user_id, granted_at, access_level) VALUES (?,?,?,?)")
        .run(calendarId, userId, new Date().toISOString(), level);
}

export function client(worker, env, token) {
    return async (method, p, body) => {
        const init = {
            method,
            headers: {
                cookie: `cal_session=${token}`,
                'content-type': 'application/json',
                origin: 'https://classmanager.live'
            }
        };
        if (body !== undefined) init.body = JSON.stringify(body);
        const res = await worker.fetch(new Request(`https://classmanager.live${p}`, init), env, {
            waitUntil() {},
            passThroughOnException() {}
        });
        let json = null;
        try {
            json = await res.json();
        } catch (_) {
            json = null;
        }
        return { status: res.status, body: json };
    };
}
