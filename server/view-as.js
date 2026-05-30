const crypto = require('crypto');
const { getDb, nowIso } = require('./schema');
const Auth = require('./auth-permissions');
const users = require('./users');

const EXCHANGE_TTL_MS = 60 * 1000;
const VIEW_AS_SESSION_HEADER = 'x-view-as-session';

function assertViewAsTargetAllowed(actor, targetUserId) {
    if (!Auth.isSuperAdminRole(actor)) {
        const err = new Error('Super admin only');
        err.status = 403;
        throw err;
    }
    if (!targetUserId || targetUserId === actor.id) {
        const err = new Error('Cannot view as yourself');
        err.status = 400;
        throw err;
    }
    const target = users.getUserById(targetUserId);
    if (!target || !target.active) {
        const err = new Error('User not found or inactive');
        err.status = 404;
        throw err;
    }
    if (Auth.isSuperAdminRole(target)) {
        const err = new Error('Cannot view as another super admin');
        err.status = 400;
        throw err;
    }
    return target;
}

function createExchange(sessionToken) {
    const db = getDb();
    const exchangeToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + EXCHANGE_TTL_MS).toISOString();
    db.prepare('INSERT INTO view_as_exchanges (token, session_token, expires_at) VALUES (?, ?, ?)').run(
        exchangeToken,
        sessionToken,
        expiresAt
    );
    purgeExpiredExchanges();
    return exchangeToken;
}

function purgeExpiredExchanges() {
    getDb()
        .prepare('DELETE FROM view_as_exchanges WHERE expires_at < ?')
        .run(nowIso());
}

function redeemExchange(exchangeToken) {
    if (!exchangeToken) {
        return null;
    }
    const db = getDb();
    purgeExpiredExchanges();
    const row = db
        .prepare('SELECT session_token AS sessionToken FROM view_as_exchanges WHERE token = ? AND expires_at >= ?')
        .get(String(exchangeToken), nowIso());
    if (!row) {
        return null;
    }
    db.prepare('DELETE FROM view_as_exchanges WHERE token = ?').run(String(exchangeToken));
    return row.sessionToken;
}

function startViewAs(actor, targetUserId, deviceContext) {
    const target = assertViewAsTargetAllowed(actor, targetUserId);
    const session = users.createViewAsSession(actor.id, target.id, deviceContext);
    const exchangeToken = createExchange(session.token);
    return {
        exchangeToken,
        target: {
            id: target.id,
            displayName: target.displayName,
            email: target.email
        }
    };
}

function exitViewAsSession(viewAsToken) {
    if (!viewAsToken) {
        return false;
    }
    const db = getDb();
    const row = db
        .prepare('SELECT view_as_user_id FROM sessions WHERE token = ?')
        .get(viewAsToken);
    if (!row || !row.view_as_user_id) {
        return false;
    }
    users.deleteSession(viewAsToken);
    return true;
}

module.exports = {
    VIEW_AS_SESSION_HEADER,
    EXCHANGE_TTL_MS,
    assertViewAsTargetAllowed,
    createExchange,
    redeemExchange,
    startViewAs,
    exitViewAsSession
};
