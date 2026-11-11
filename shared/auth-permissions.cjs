/**
 * Global role presets and permission checks (mirror in worker/src/auth-permissions.js).
 * Keep ROLE_PRESETS in sync with js/help-guide.js for the Help roles matrix.
 */
const PERMS = {
    MANAGE_USERS: 'manage_users',
    MANAGE_GROUPS: 'manage_groups',
    MANAGE_CALENDAR_ACCESS: 'manage_calendar_access',
    MANAGE_SETTINGS: 'manage_settings',
    CREATE_CALENDARS: 'create_calendars',
    DELETE_CALENDARS: 'delete_calendars',
    VIEW_CALENDARS: 'view_calendars',
    VIEW_ALL_CALENDARS: 'view_all_calendars',
    FORCE_SAVE: 'force_save',
    BYPASS_COLLABORATIVE_LOCK: 'bypass_collaborative_lock',
    VIEW_PRESENCE: 'view_presence',
    VIEW_AUDIT: 'view_audit',
    APPLY_SUGGESTIONS: 'apply_suggestions',
    ACCESS_ADMIN_PAGE: 'access_admin_page',
    // Edit areas (what a calendar editor may change). Classroom data and day notes keep
    // their own per-class rules.
    EDIT_CURRICULUM: 'edit_curriculum',
    EDIT_CLASSES: 'edit_classes',
    EDIT_EVENTS: 'edit_events',
    EDIT_PLANNER: 'edit_planner'
};

/**
 * Stored on custom permission lists saved after edit areas existed. Lists without it
 * predate edit areas and get the role's default areas, so nobody loses editing on deploy.
 */
const EDIT_AREAS_MARKER = 'edit_areas_set';

const EDIT_AREA_PERMS = [PERMS.EDIT_CURRICULUM, PERMS.EDIT_CLASSES, PERMS.EDIT_EVENTS, PERMS.EDIT_PLANNER];

const ALL_PERMS = Object.values(PERMS);

const PERM_DEFINITIONS = [
    { id: PERMS.MANAGE_USERS, labelKey: 'permManageUsers' },
    { id: PERMS.MANAGE_GROUPS, labelKey: 'permManageGroups' },
    { id: PERMS.MANAGE_CALENDAR_ACCESS, labelKey: 'permManageCalendarAccess' },
    { id: PERMS.MANAGE_SETTINGS, labelKey: 'permManageSettings' },
    { id: PERMS.CREATE_CALENDARS, labelKey: 'permCreateCalendars' },
    { id: PERMS.DELETE_CALENDARS, labelKey: 'permDeleteCalendars' },
    { id: PERMS.VIEW_CALENDARS, labelKey: 'permViewCalendars' },
    { id: PERMS.VIEW_ALL_CALENDARS, labelKey: 'permViewAllCalendars' },
    { id: PERMS.EDIT_CURRICULUM, labelKey: 'permEditCurriculum' },
    { id: PERMS.EDIT_CLASSES, labelKey: 'permEditClasses' },
    { id: PERMS.EDIT_EVENTS, labelKey: 'permEditEvents' },
    { id: PERMS.EDIT_PLANNER, labelKey: 'permEditPlanner' },
    { id: PERMS.VIEW_PRESENCE, labelKey: 'permViewPresence' },
    { id: PERMS.VIEW_AUDIT, labelKey: 'permViewAudit' },
    { id: PERMS.APPLY_SUGGESTIONS, labelKey: 'permApplySuggestions' },
    { id: PERMS.ACCESS_ADMIN_PAGE, labelKey: 'permAccessAdminPage' }
];

const ROLE_PRESETS = {
    super_admin: ALL_PERMS,
    admin: ALL_PERMS,
    user_admin: [PERMS.MANAGE_USERS, PERMS.MANAGE_GROUPS, PERMS.ACCESS_ADMIN_PAGE],
    head_teacher: [
        PERMS.MANAGE_GROUPS,
        PERMS.MANAGE_CALENDAR_ACCESS,
        PERMS.VIEW_ALL_CALENDARS,
        PERMS.CREATE_CALENDARS,
        PERMS.VIEW_CALENDARS,
        PERMS.FORCE_SAVE,
        PERMS.BYPASS_COLLABORATIVE_LOCK,
        PERMS.VIEW_PRESENCE,
        PERMS.APPLY_SUGGESTIONS,
        PERMS.ACCESS_ADMIN_PAGE,
        ...EDIT_AREA_PERMS
    ],
    settings_admin: [PERMS.MANAGE_SETTINGS, PERMS.ACCESS_ADMIN_PAGE],
    // Teachers edit classes, events/timetable/term and the planner; curriculum and default
    // syllabi are for admins and head teachers unless an admin allows it.
    teacher: [PERMS.VIEW_CALENDARS, PERMS.CREATE_CALENDARS, PERMS.EDIT_CLASSES, PERMS.EDIT_EVENTS, PERMS.EDIT_PLANNER],
    viewer: [PERMS.VIEW_CALENDARS]
};

const ASSIGNABLE_ROLES = [
    'super_admin',
    'user_admin',
    'head_teacher',
    'settings_admin',
    'teacher',
    'viewer'
];

function normalizeRole(role) {
    const r = String(role || 'teacher').trim();
    if (r === 'admin') {
        return 'super_admin';
    }
    return r;
}

function parseStoredPermissions(user) {
    if (!user || user.permissions == null || user.permissions === '') {
        return null;
    }
    if (Array.isArray(user.permissions)) {
        return user.permissions;
    }
    try {
        const parsed = JSON.parse(user.permissions);
        return Array.isArray(parsed) ? parsed : null;
    } catch (_) {
        return null;
    }
}

function getEffectivePermissions(user) {
    if (!user) {
        return [];
    }
    const stored = parseStoredPermissions(user);
    if (stored) {
        if (stored.includes(EDIT_AREAS_MARKER)) {
            return stored.filter((p) => p !== EDIT_AREAS_MARKER);
        }
        // Saved before edit areas: keep editing what the role allows.
        const rolePreset = ROLE_PRESETS[normalizeRole(user.role)] || ROLE_PRESETS.teacher;
        const areas = rolePreset.filter((p) => EDIT_AREA_PERMS.includes(p) && !stored.includes(p));
        return stored.concat(areas);
    }
    const role = normalizeRole(user.role);
    return ROLE_PRESETS[role] || ROLE_PRESETS.teacher;
}

function hasPermission(user, perm) {
    return getEffectivePermissions(user).includes(perm);
}

function hasAnyPermission(user, perms) {
    return (perms || []).some((p) => hasPermission(user, p));
}

function canAccessAdminPage(user) {
    if (hasPermission(user, PERMS.ACCESS_ADMIN_PAGE)) {
        return true;
    }
    return hasAnyPermission(user, [
        PERMS.MANAGE_USERS,
        PERMS.MANAGE_GROUPS,
        PERMS.MANAGE_CALENDAR_ACCESS,
        PERMS.MANAGE_SETTINGS,
        PERMS.VIEW_PRESENCE,
        PERMS.VIEW_AUDIT
    ]);
}

function isSuperAdminRole(user) {
    const role = normalizeRole(user && user.role);
    return role === 'super_admin';
}

function canManageUsers(user) {
    return hasPermission(user, PERMS.MANAGE_USERS);
}

function canForceUnlock(user) {
    if (!user) {
        return false;
    }
    const r = normalizeRole(user.role);
    return r === 'super_admin' || r === 'head_teacher';
}

function normalizeAssignableRole(role) {
    const r = normalizeRole(role);
    if (ASSIGNABLE_ROLES.includes(r)) {
        return r;
    }
    if (r === 'admin') {
        return 'super_admin';
    }
    return 'teacher';
}

function getRolePreset(role) {
    const r = normalizeRole(role);
    const preset = ROLE_PRESETS[r] || ROLE_PRESETS.teacher;
    return [...preset].sort();
}

function sanitizePermissions(input) {
    if (!Array.isArray(input)) {
        return [];
    }
    const allowed = new Set(ALL_PERMS.concat([EDIT_AREAS_MARKER]));
    const out = [];
    for (const item of input) {
        const id = String(item || '').trim();
        if (id && allowed.has(id) && !out.includes(id)) {
            out.push(id);
        }
    }
    return out.sort();
}

function permissionsMatchRole(role, perms) {
    const a = sanitizePermissions(perms);
    const b = getRolePreset(role);
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function permissionsEquivalentToSuperAdmin(perms) {
    return permissionsMatchRole('super_admin', perms);
}

function isPromotingToSuperAdmin(previousRole, nextRole) {
    const prev = normalizeRole(previousRole);
    const next = normalizeRole(nextRole);
    return next === 'super_admin' && prev !== 'super_admin';
}

function requiresSuperAdminConfirmation(opts) {
    const options = opts || {};
    const nextRole = normalizeRole(options.nextRole);
    const previousRole = normalizeRole(options.previousRole);
    if (isPromotingToSuperAdmin(previousRole, nextRole)) {
        return true;
    }
    if (nextRole === 'super_admin') {
        return false;
    }
    const nextPerms =
        options.nextPermissions !== undefined
            ? sanitizePermissions(options.nextPermissions)
            : null;
    if (nextPerms === null) {
        return false;
    }
    return permissionsEquivalentToSuperAdmin(nextPerms);
}

function getPermissionMetaForAdmin() {
    const rolePresets = {};
    for (const role of Object.keys(ROLE_PRESETS)) {
        if (role === 'admin') {
            continue;
        }
        rolePresets[role] = getRolePreset(role);
    }
    return {
        permissions: PERM_DEFINITIONS,
        rolePresets,
        superAdminPermissionIds: getRolePreset('super_admin')
    };
}

function resolvePermissionsForSave(role, permissionsInput) {
    const sanitized = sanitizePermissions(permissionsInput).filter((p) => p !== EDIT_AREAS_MARKER);
    const r = normalizeRole(role);
    if (permissionsEquivalentToSuperAdmin(sanitized)) {
        return sanitized.concat([EDIT_AREAS_MARKER]).sort();
    }
    if (permissionsMatchRole(r, sanitized)) {
        return null;
    }
    // Custom list chosen with edit areas visible: its areas are exactly what was ticked.
    return sanitized.concat([EDIT_AREAS_MARKER]).sort();
}

/** Field → edit area map lives with the sync code (shared with the browser). */
const SyncDiff = require('../js/sync-diff.js');

function hasEditArea(user, area) {
    return !area || hasPermission(user, area);
}

/** Mutations this user may apply, and the fields they may not change. */
function filterMutationsByEditArea(user, mutations) {
    return SyncDiff.splitByEditArea(mutations, (area) => hasEditArea(user, area));
}

/** Top-level fields that differ between two calendars and need an area this user lacks. */
function deniedFieldsForWholeSave(user, before, after) {
    const a = before || {};
    const b = after || {};
    const fields = new Set(Object.keys(a).concat(Object.keys(b)));
    const denied = [];
    fields.forEach((f) => {
        const area = SyncDiff.editAreaForField(f);
        if (area && !hasEditArea(user, area) && !SyncDiff.deepEqual(a[f], b[f])) {
            denied.push(f);
        }
    });
    return denied;
}

module.exports = {
    PERMS,
    hasEditArea,
    filterMutationsByEditArea,
    deniedFieldsForWholeSave,
    EDIT_AREAS_MARKER,
    EDIT_AREA_PERMS,
    ALL_PERMS,
    PERM_DEFINITIONS,
    ROLE_PRESETS,
    ASSIGNABLE_ROLES,
    normalizeRole,
    normalizeAssignableRole,
    parseStoredPermissions,
    getEffectivePermissions,
    hasPermission,
    hasAnyPermission,
    canAccessAdminPage,
    isSuperAdminRole,
    canManageUsers,
    canForceUnlock,
    getRolePreset,
    sanitizePermissions,
    permissionsMatchRole,
    permissionsEquivalentToSuperAdmin,
    isPromotingToSuperAdmin,
    requiresSuperAdminConfirmation,
    getPermissionMetaForAdmin,
    resolvePermissionsForSave
};
