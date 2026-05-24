const crypto = require('crypto');
const { getDb, newId, nowIso } = require('./schema');

const SESSION_DAYS = 14;
const LOCK_STALE_MS = 20 * 60 * 1000;

function normalizeEmail(email) {
    if (!email) {
        return null;
    }
    const t = String(email).trim().toLowerCase();
    return t || null;
}

function rowToUser(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        kakaoUserId: row.kakao_user_id,
        role: row.role,
        active: Boolean(row.active),
        createdAt: row.created_at
    };
}

function listUsers() {
    const db = getDb();
    const rows = db
        .prepare(
            `SELECT id, email, display_name, kakao_user_id, role, active, created_at
             FROM users ORDER BY display_name COLLATE NOCASE`
        )
        .all();
    return rows.map(rowToUser);
}

function getUserById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return rowToUser(row);
}

function findUserForKakaoLogin(kakaoUserId, email) {
    const db = getDb();
    const kid = kakaoUserId ? String(kakaoUserId) : null;
    const em = normalizeEmail(email);
    if (kid) {
        const byKid = db
            .prepare('SELECT * FROM users WHERE kakao_user_id = ? AND active = 1')
            .get(kid);
        if (byKid) {
            return rowToUser(byKid);
        }
    }
    if (em) {
        const byEmail = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(em);
        if (byEmail) {
            if (kid && !byEmail.kakao_user_id) {
                db.prepare('UPDATE users SET kakao_user_id = ? WHERE id = ?').run(kid, byEmail.id);
                byEmail.kakao_user_id = kid;
            }
            return rowToUser(byEmail);
        }
    }
    return null;
}

function createUser({ email, displayName, kakaoUserId, role, passwordHash }) {
    const db = getDb();
    const id = newId();
    const em = normalizeEmail(email);
    db.prepare(
        `INSERT INTO users (id, email, display_name, kakao_user_id, password_hash, role, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
        id,
        em,
        displayName || '',
        kakaoUserId ? String(kakaoUserId) : null,
        passwordHash || null,
        role || 'teacher',
        nowIso()
    );
    return getUserById(id);
}

function updateUser(id, fields) {
    const db = getDb();
    const u = getUserById(id);
    if (!u) {
        return null;
    }
    const displayName = fields.displayName != null ? fields.displayName : u.displayName;
    const email = fields.email !== undefined ? normalizeEmail(fields.email) : u.email;
    const active = fields.active !== undefined ? (fields.active ? 1 : 0) : u.active ? 1 : 0;
    const kakaoUserId =
        fields.kakaoUserId !== undefined
            ? fields.kakaoUserId
                ? String(fields.kakaoUserId)
                : null
            : u.kakaoUserId;
    const role = fields.role || u.role;
    db.prepare(
        `UPDATE users SET email = ?, display_name = ?, kakao_user_id = ?, role = ?, active = ? WHERE id = ?`
    ).run(email, displayName, kakaoUserId, role, active, id);
    return getUserById(id);
}

function countAdmins() {
    const db = getDb();
    return db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1`).get().c;
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    if (!stored || !password) {
        return false;
    }
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) {
        return false;
    }
    const attempt = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
}

function findUserByEmailPassword(email, password) {
    const em = normalizeEmail(email);
    if (!em || !password) {
        return null;
    }
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(em);
    if (!row || !row.password_hash) {
        return null;
    }
    if (!verifyPassword(password, row.password_hash)) {
        return null;
    }
    return rowToUser(row);
}

function createSession(userId) {
    const db = getDb();
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
        token,
        userId,
        expires
    );
    return { token, expires };
}

function getSessionUser(token) {
    if (!token) {
        return null;
    }
    const db = getDb();
    const row = db
        .prepare(
            `SELECT s.token, s.expires_at, u.*
             FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token = ? AND u.active = 1`
        )
        .get(token);
    if (!row) {
        return null;
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
        return null;
    }
    return rowToUser(row);
}

function deleteSession(token) {
    if (!token) {
        return;
    }
    getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function getLock(calendarId) {
    const db = getDb();
    return db.prepare('SELECT * FROM calendar_locks WHERE calendar_id = ?').get(calendarId);
}

function isLockStale(lock) {
    if (!lock) {
        return true;
    }
    return Date.now() - new Date(lock.updated_at).getTime() > LOCK_STALE_MS;
}

function acquireLock(calendarId, userId, displayName, force) {
    const db = getDb();
    const existing = getLock(calendarId);
    if (!existing || isLockStale(existing) || existing.holder_user_id === userId || force) {
        const at = nowIso();
        db.prepare(
            `INSERT INTO calendar_locks (calendar_id, holder_user_id, holder_name, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(calendar_id) DO UPDATE SET
               holder_user_id = excluded.holder_user_id,
               holder_name = excluded.holder_name,
               updated_at = excluded.updated_at`
        ).run(calendarId, userId, displayName, at);
        return { acquired: true, lock: getLock(calendarId) };
    }
    return { acquired: false, lock: existing };
}

function refreshLock(calendarId, userId) {
    const lock = getLock(calendarId);
    if (!lock || lock.holder_user_id !== userId) {
        return false;
    }
    getDb()
        .prepare('UPDATE calendar_locks SET updated_at = ? WHERE calendar_id = ?')
        .run(nowIso(), calendarId);
    return true;
}

function releaseLock(calendarId, userId) {
    const lock = getLock(calendarId);
    if (!lock) {
        return;
    }
    if (!userId || lock.holder_user_id === userId) {
        getDb().prepare('DELETE FROM calendar_locks WHERE calendar_id = ?').run(calendarId);
    }
}

function lockStatusForClient(calendarId, userId) {
    const lock = getLock(calendarId);
    if (!lock || isLockStale(lock)) {
        return { held: false, readOnly: false, lock: null };
    }
    const heldByMe = lock.holder_user_id === userId;
    return {
        held: true,
        readOnly: !heldByMe,
        lock: {
            holderUserId: lock.holder_user_id,
            holderName: lock.holder_name,
            updatedAt: lock.updated_at
        }
    };
}

function appendHistory(calendarId, revision, data, user) {
    const db = getDb();
    db.prepare(
        `INSERT INTO calendar_history (id, calendar_id, revision, data, saved_by_user_id, saved_by_name, saved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
        newId(),
        calendarId,
        revision,
        JSON.stringify(data),
        user.id,
        user.displayName || user.email || 'Teacher',
        nowIso()
    );
}

module.exports = {
    normalizeEmail,
    listUsers,
    getUserById,
    findUserForKakaoLogin,
    createUser,
    updateUser,
    countAdmins,
    hashPassword,
    findUserByEmailPassword,
    createSession,
    getSessionUser,
    deleteSession,
    getLock,
    acquireLock,
    refreshLock,
    releaseLock,
    lockStatusForClient,
    appendHistory,
    LOCK_STALE_MS
};
