/**
 * Calendar meta payload helpers (local server).
 */
const users = require('./users');
const CalAccess = require('./calendar-access');
const appSettings = require('./app-settings');
const Presence = require('./presence');
const Suggestions = require('./suggestions');

function calendarMetaExtras(user, calendarId, meta) {
    const lock = users.lockStatusForClient(calendarId, user.id, user);
    const perms = CalAccess.resolveCalendarPermissions(user, calendarId);
    const permissionReadOnly = !perms.canEdit;
    const lockReadOnly = Boolean(lock.readOnly);
    return Object.assign({}, meta, {
        lock: lock.lock,
        readOnly: permissionReadOnly || lockReadOnly,
        permissionReadOnly,
        holdsLock: Boolean(lock.holdsLock),
        pendingEditRequest: lock.pendingEditRequest,
        lockStaleMinutes: lock.lockStaleMinutes,
        lockExpiresAt: lock.lockExpiresAt != null ? lock.lockExpiresAt : null,
        lockTimedOut: Boolean(lock.lockTimedOut),
        bypassLock: Boolean(lock.bypassLock),
        viewers: Presence.listViewersForCalendar(calendarId, user.id),
        accessLevel: perms.accessLevel,
        canEdit: perms.canEdit,
        canSuggest: perms.canSuggest,
        pendingSuggestions: Suggestions.countPendingSuggestions(calendarId),
        navNotificationActiveDays: appSettings.getNavNotificationActiveDays(),
        navNotificationDismissedDays: appSettings.getNavNotificationDismissedDays(),
        createdByUserId: meta.createdByUserId || null,
        canManageAccess: CalAccess.canManageCalendarAccess(
            user,
            calendarId,
            meta.createdByUserId
        ),
        canDeleteCalendar: CalAccess.canDeleteCalendar(user, calendarId, meta.createdByUserId)
    });
}

function enrichAdminUserRow(u) {
    const summary = CalAccess.getCalendarSummaryForUser(u);
    const hasCalendarAccess =
        Boolean(u.active) &&
        (summary.calendarAccessMode === 'all' || summary.calendarAccessMode === 'some');
    const Auth = require('./auth-permissions');
    const stored = Auth.parseStoredPermissions(u);
    return Object.assign({}, u, {
        hasCalendarAccess,
        calendarAccessMode: summary.calendarAccessMode,
        calendarSummary: summary.calendarSummary,
        permissions: Auth.getEffectivePermissions(u),
        customPermissions: stored,
        role: Auth.normalizeRole(u.role)
    });
}

module.exports = {
    calendarMetaExtras,
    enrichAdminUserRow
};
