const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'calendars.db');

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

let dbInstance = null;

function getDb() {
    if (!dbInstance) {
        ensureDataDir();
        dbInstance = new Database(DB_PATH);
        dbInstance.pragma('journal_mode = WAL');
        migrate(dbInstance);
    }
    return dbInstance;
}

function migrate(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS calendars (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            revision INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL,
            updated_by TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT,
            display_name TEXT NOT NULL DEFAULT '',
            kakao_user_id TEXT,
            password_hash TEXT,
            role TEXT NOT NULL DEFAULT 'teacher',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL AND email != '';
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_kakao ON users(kakao_user_id) WHERE kakao_user_id IS NOT NULL AND kakao_user_id != '';
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS calendar_locks (
            calendar_id TEXT PRIMARY KEY,
            holder_user_id TEXT NOT NULL,
            holder_name TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (calendar_id) REFERENCES calendars(id)
        );
        CREATE TABLE IF NOT EXISTS calendar_history (
            id TEXT PRIMARY KEY,
            calendar_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            data TEXT NOT NULL,
            saved_by_user_id TEXT,
            saved_by_name TEXT NOT NULL,
            saved_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_history_calendar ON calendar_history(calendar_id, revision DESC);
    `);
    migrateLockPendingColumns(db);
    migrateCalendarAccessTables(db);
    migrateAppSettings(db);
    migrateSessionLoginContext(db);
    migrateAuthPermissions(db);
    migrateSuggestionsPresence(db);
    migrateActivityLog(db);
}

function migrateSessionLoginContext(db) {
    const cols = db.prepare('PRAGMA table_info(sessions)').all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('login_context')) {
        db.exec("ALTER TABLE sessions ADD COLUMN login_context TEXT NOT NULL DEFAULT 'personal'");
    }
    if (!names.has('idle_logout_minutes')) {
        db.exec('ALTER TABLE sessions ADD COLUMN idle_logout_minutes INTEGER');
    }
    if (!names.has('idle_warning_minutes')) {
        db.exec('ALTER TABLE sessions ADD COLUMN idle_warning_minutes INTEGER');
    }
}

function migrateAppSettings(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        INSERT OR IGNORE INTO app_settings (key, value) VALUES ('lock_stale_minutes', '20');
        INSERT OR IGNORE INTO app_settings (key, value) VALUES ('session_max_days', '14');
    `);
}

function migrateCalendarAccessTables(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS calendar_members (
            calendar_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            granted_at TEXT NOT NULL,
            granted_by_user_id TEXT,
            PRIMARY KEY (calendar_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_calendar_members_user ON calendar_members(user_id);
        CREATE TABLE IF NOT EXISTS teacher_groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            created_by_user_id TEXT
        );
        CREATE TABLE IF NOT EXISTS group_members (
            group_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            PRIMARY KEY (group_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
        CREATE TABLE IF NOT EXISTS calendar_groups (
            calendar_id TEXT NOT NULL,
            group_id TEXT NOT NULL,
            granted_at TEXT NOT NULL,
            granted_by_user_id TEXT,
            PRIMARY KEY (calendar_id, group_id)
        );
        CREATE INDEX IF NOT EXISTS idx_calendar_groups_group ON calendar_groups(group_id);
    `);
    const memberCount = db.prepare('SELECT COUNT(*) AS n FROM calendar_members').get();
    if (memberCount && memberCount.n === 0) {
        db.exec(`
            INSERT OR IGNORE INTO calendar_members (calendar_id, user_id, granted_at, granted_by_user_id)
            SELECT c.id, u.id, datetime('now'), NULL
            FROM calendars c
            CROSS JOIN users u
            WHERE u.active = 1;
        `);
    }
}

function migrateAuthPermissions(db) {
    const userCols = db.prepare('PRAGMA table_info(users)').all();
    if (!new Set(userCols.map((c) => c.name)).has('permissions')) {
        db.exec('ALTER TABLE users ADD COLUMN permissions TEXT');
    }
    const memberCols = db.prepare('PRAGMA table_info(calendar_members)').all();
    if (!new Set(memberCols.map((c) => c.name)).has('access_level')) {
        db.exec(
            "ALTER TABLE calendar_members ADD COLUMN access_level TEXT NOT NULL DEFAULT 'editor'"
        );
    }
    const groupCols = db.prepare('PRAGMA table_info(calendar_groups)').all();
    if (!new Set(groupCols.map((c) => c.name)).has('access_level')) {
        db.exec(
            "ALTER TABLE calendar_groups ADD COLUMN access_level TEXT NOT NULL DEFAULT 'editor'"
        );
    }
}

function migrateSuggestionsPresence(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS calendar_suggestions (
            id TEXT PRIMARY KEY,
            calendar_id TEXT NOT NULL,
            base_revision INTEGER NOT NULL,
            data TEXT NOT NULL,
            summary TEXT,
            created_by_user_id TEXT NOT NULL,
            created_by_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending'
        );
        CREATE INDEX IF NOT EXISTS idx_suggestions_calendar ON calendar_suggestions(calendar_id, status);
        CREATE TABLE IF NOT EXISTS user_presence (
            user_id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            calendar_id TEXT,
            calendar_name TEXT,
            last_seen_at TEXT NOT NULL
        );
    `);
}

function migrateActivityLog(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS activity_log (
            id TEXT PRIMARY KEY,
            action TEXT NOT NULL,
            actor_user_id TEXT,
            actor_name TEXT NOT NULL,
            calendar_id TEXT,
            calendar_name TEXT,
            summary TEXT NOT NULL,
            detail_json TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activity_log_calendar ON activity_log(calendar_id, created_at DESC);
    `);
}

function migrateLockPendingColumns(db) {
    const cols = db.prepare('PRAGMA table_info(calendar_locks)').all();
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('pending_requester_id')) {
        db.exec('ALTER TABLE calendar_locks ADD COLUMN pending_requester_id TEXT');
    }
    if (!names.has('pending_requester_name')) {
        db.exec('ALTER TABLE calendar_locks ADD COLUMN pending_requester_name TEXT');
    }
    if (!names.has('pending_requested_at')) {
        db.exec('ALTER TABLE calendar_locks ADD COLUMN pending_requested_at TEXT');
    }
}

function newId() {
    return crypto.randomUUID();
}

function nowIso() {
    return new Date().toISOString();
}

module.exports = {
    getDb,
    newId,
    nowIso,
    DATA_DIR,
    DB_PATH
};
