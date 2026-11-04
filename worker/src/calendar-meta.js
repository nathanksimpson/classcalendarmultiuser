/**
 * Calendar meta payload helpers (worker).
 */
import * as Auth from './auth-permissions.js';
import * as CalAccess from './calendar-access.js';
import * as AppSettings from './app-settings.js';
import * as Presence from './presence.js';
import * as Suggestions from './suggestions.js';
import * as Lock from './lock.js';

export async function calendarMetaExtras(env, user, calendarId, meta) {
    // Independent reads: run them together (this runs on every client poll).
    const [lock, perms, viewers, pendingSuggestions, navNotificationActiveDays, navNotificationDismissedDays] =
        await Promise.all([
            Lock.lockStatus(env, calendarId, user.id, user),
            CalAccess.resolveCalendarPermissions(env, user, calendarId),
            Presence.listViewersForCalendar(env, calendarId, user.id),
            Suggestions.countPendingSuggestions(env, calendarId),
            AppSettings.getNavNotificationActiveDays(env),
            AppSettings.getNavNotificationDismissedDays(env)
        ]);
    const permissionReadOnly = !perms.canEdit;
    const lockReadOnly = Boolean(lock.readOnly);
    return Object.assign({}, meta, {
        lock: lock.lock,
        readOnly: permissionReadOnly || lockReadOnly,
        permissionReadOnly,
        holdsLock: Boolean(lock.holdsLock),
        pendingEditRequest: lock.pendingEditRequest,
        lockStaleMinutes: lock.lockStaleMinutes,
        bypassLock: Boolean(lock.bypassLock),
        viewers,
        accessLevel: perms.accessLevel,
        canEdit: perms.canEdit,
        canSuggest: perms.canSuggest,
        pendingSuggestions,
        navNotificationActiveDays,
        navNotificationDismissedDays,
        createdByUserId: meta.createdByUserId || null,
        canManageAccess: CalAccess.canManageCalendarAccess(
            user,
            calendarId,
            meta.createdByUserId
        ),
        canDeleteCalendar: CalAccess.canDeleteCalendar(user, calendarId, meta.createdByUserId)
    });
}

export async function enrichAdminUserRow(env, u) {
    const summary = await CalAccess.getCalendarSummaryForUser(env, u);
    const hasCalendarAccess =
        Boolean(u.active) &&
        (summary.calendarAccessMode === 'all' || summary.calendarAccessMode === 'some');
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
