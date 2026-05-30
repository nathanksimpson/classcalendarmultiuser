/**
 * Teachers waiting for calendar access (Worker / D1).
 */
import * as CalAccess from './calendar-access.js';
import * as ActivityLog from './activity-log.js';

export function userHasCalendarAccess(user) {
    if (!user || !user.active) {
        return false;
    }
    if (CalAccess.canViewAllCalendars(user)) {
        return true;
    }
    return false;
}

export async function userHasCalendarAccessAsync(env, user) {
    if (!user || !user.active) {
        return false;
    }
    if (CalAccess.canViewAllCalendars(user)) {
        return true;
    }
    const cals = await CalAccess.listCalendarsForUser(env, user);
    return (cals && cals.length) > 0;
}

async function hasRecentNeedsAccessLog(env, userId, withinHours = 24) {
    const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
    const row = await env.DB.prepare(
        `SELECT 1 FROM activity_log
         WHERE action = 'user_needs_access' AND detail_json LIKE ?
         AND created_at >= ?
         LIMIT 1`
    )
        .bind('%"userId":"' + String(userId) + '"%', since)
        .first();
    return Boolean(row);
}

export async function notifyUserNeedsAccess(env, user, options = {}) {
    if (!user || !user.id || !user.active) {
        return false;
    }
    if (await userHasCalendarAccessAsync(env, user)) {
        return false;
    }
    if (await hasRecentNeedsAccessLog(env, user.id)) {
        return false;
    }
    const source = options.source || 'unknown';
    const label = user.displayName || user.email || user.kakaoUserId || user.id;
    await ActivityLog.recordActivity(env, {
        action: 'user_needs_access',
        actorUserId: options.actorUserId || user.id,
        actorName: options.actorName || label,
        summary: `Teacher waiting for access: ${label}`,
        detail: {
            userId: user.id,
            displayName: user.displayName || '',
            email: user.email || null,
            kakaoUserId: user.kakaoUserId || null,
            source,
            createdAt: user.createdAt || null
        }
    });
    return true;
}

export async function listAccessRequests(env) {
    const r = await env.DB.prepare(
        `SELECT id, email, display_name AS displayName, kakao_user_id AS kakaoUserId,
                role, active, created_at AS createdAt
         FROM users WHERE active = 1 ORDER BY created_at DESC`
    ).all();
    const waiting = [];
    for (const row of r.results || []) {
        const user = {
            id: row.id,
            email: row.email,
            displayName: row.displayName,
            kakaoUserId: row.kakaoUserId,
            role: row.role,
            active: row.active,
            createdAt: row.createdAt
        };
        if (!(await userHasCalendarAccessAsync(env, user))) {
            waiting.push(
                Object.assign({}, user, {
                    calendarAccessMode: 'none',
                    calendarSummary: []
                })
            );
        }
    }
    return { count: waiting.length, users: waiting };
}
