/**
 * Teachers waiting for calendar access — activity log + admin inbox.
 */
const { getDb } = require('./schema');
const CalAccess = require('./calendar-access');
const ActivityLog = require('./activity-log');

function userHasCalendarAccess(user) {
    if (!user || !user.active) {
        return false;
    }
    if (CalAccess.canViewAllCalendars(user)) {
        return true;
    }
    return CalAccess.listCalendarsForUser(user).length > 0;
}

function hasRecentNeedsAccessLog(userId, withinHours) {
    const db = getDb();
    const hours = withinHours == null ? 24 : Number(withinHours);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const row = db
        .prepare(
            `SELECT 1 FROM activity_log
             WHERE action = 'user_needs_access' AND detail_json LIKE ?
             AND created_at >= ?
             LIMIT 1`
        )
        .get('%"userId":"' + String(userId) + '"%', since);
    return Boolean(row);
}

function notifyUserNeedsAccess(user, options) {
    const opts = options || {};
    if (!user || !user.id || !user.active) {
        return false;
    }
    if (userHasCalendarAccess(user)) {
        return false;
    }
    if (hasRecentNeedsAccessLog(user.id)) {
        return false;
    }
    const source = opts.source || 'unknown';
    const label = user.displayName || user.email || user.kakaoUserId || user.id;
    ActivityLog.recordActivity(
        Object.assign(
            {
                action: 'user_needs_access',
                actorUserId: opts.actorUserId || user.id,
                actorName: opts.actorName || label,
                summary: `Teacher waiting for access: ${label}`
            },
            {
                detail: {
                    userId: user.id,
                    displayName: user.displayName || '',
                    email: user.email || null,
                    kakaoUserId: user.kakaoUserId || null,
                    source,
                    createdAt: user.createdAt || null
                }
            }
        )
    );
    return true;
}

function listAccessRequests() {
    const db = getDb();
    const rows = db
        .prepare(
            `SELECT id, email, display_name AS displayName, kakao_user_id AS kakaoUserId,
                    role, active, created_at AS createdAt
             FROM users WHERE active = 1 ORDER BY created_at DESC`
        )
        .all();
    const waiting = [];
    for (const row of rows) {
        const user = {
            id: row.id,
            email: row.email,
            displayName: row.displayName,
            kakaoUserId: row.kakaoUserId,
            role: row.role,
            active: row.active,
            createdAt: row.createdAt
        };
        if (!userHasCalendarAccess(user)) {
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

module.exports = {
    userHasCalendarAccess,
    notifyUserNeedsAccess,
    listAccessRequests
};
