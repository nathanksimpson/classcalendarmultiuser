import * as Auth from './auth-permissions.js';

export const VIEW_AS_SESSION_HEADER = 'x-view-as-session';
export const EXCHANGE_TTL_MS = 60 * 1000;

export function getViewAsSessionHeader(request) {
    const raw = request.headers.get(VIEW_AS_SESSION_HEADER);
    return raw ? String(raw).trim() : '';
}

export async function purgeExpiredExchanges(env) {
    await env.DB.prepare('DELETE FROM view_as_exchanges WHERE expires_at < ?').bind(nowIso()).run();
}

function nowIso() {
    return new Date().toISOString();
}

export async function createExchange(env, sessionToken) {
    await purgeExpiredExchanges(env);
    const exchangeToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + EXCHANGE_TTL_MS).toISOString();
    await env.DB.prepare(
        'INSERT INTO view_as_exchanges (token, session_token, expires_at) VALUES (?, ?, ?)'
    )
        .bind(exchangeToken, sessionToken, expiresAt)
        .run();
    return exchangeToken;
}

export async function redeemExchange(env, exchangeToken) {
    if (!exchangeToken) {
        return null;
    }
    await purgeExpiredExchanges(env);
    const row = await env.DB.prepare(
        'SELECT session_token AS sessionToken FROM view_as_exchanges WHERE token = ? AND expires_at >= ?'
    )
        .bind(String(exchangeToken), nowIso())
        .first();
    if (!row) {
        return null;
    }
    await env.DB.prepare('DELETE FROM view_as_exchanges WHERE token = ?').bind(String(exchangeToken)).run();
    return row.sessionToken;
}

export function assertViewAsTargetAllowed(actor, targetUser) {
    if (!Auth.isSuperAdminRole(actor)) {
        const err = new Error('Super admin only');
        err.status = 403;
        throw err;
    }
    if (!targetUser || !targetUser.active) {
        const err = new Error('User not found or inactive');
        err.status = 404;
        throw err;
    }
    if (targetUser.id === actor.id) {
        const err = new Error('Cannot view as yourself');
        err.status = 400;
        throw err;
    }
    if (Auth.isSuperAdminRole(targetUser)) {
        const err = new Error('Cannot view as another super admin');
        err.status = 400;
        throw err;
    }
    return targetUser;
}

export async function exitViewAsSession(env, viewAsToken) {
    if (!viewAsToken) {
        return false;
    }
    const row = await env.DB.prepare('SELECT view_as_user_id FROM sessions WHERE token = ?')
        .bind(viewAsToken)
        .first();
    if (!row || !row.view_as_user_id) {
        return false;
    }
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(viewAsToken).run();
    return true;
}

export function buildAuthMeViewAs(user, actorUser) {
    if (!user || !user.viewAsActive || !actorUser) {
        return null;
    }
    return {
        active: true,
        targetDisplayName: user.displayName || user.email || 'User',
        targetEmail: user.email || null,
        actorId: actorUser.id,
        actorDisplayName: actorUser.displayName || actorUser.email || 'Admin'
    };
}

export function rejectViewAsResponse(viewAsSession) {
    if (!viewAsSession) {
        return null;
    }
    return new Response(
        JSON.stringify({ error: 'Changes are not saved in View As mode', code: 'VIEW_AS_MODE' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
}
