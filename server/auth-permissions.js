/**
 * Global role presets and permission checks (mirror in worker/src/auth-permissions.js).
 */
const PERMS = {
    MANAGE_USERS: 'manage_users',
    MANAGE_GROUPS: 'manage_groups',
    MANAGE_CALENDAR_ACCESS: 'manage_calendar_access',
    MANAGE_SETTINGS: 'manage_settings',
    CREATE_CALENDARS: 'create_calendars',
    DELETE_CALENDARS: 'delete_calendars',
    VIEW_ALL_CALENDARS: 'view_all_calendars',
    FORCE_SAVE: 'force_save',
    BYPASS_COLLABORATIVE_LOCK: 'bypass_collaborative_lock',
    VIEW_PRESENCE: 'view_presence',
    VIEW_AUDIT: 'view_audit',
    APPLY_SUGGESTIONS: 'apply_suggestions',
    ACCESS_ADMIN_PAGE: 'access_admin_page'
};

const ALL_PERMS = Object.values(PERMS);

const ROLE_PRESETS = {
    super_admin: ALL_PERMS,
    admin: ALL_PERMS,
    user_admin: [PERMS.MANAGE_USERS, PERMS.MANAGE_GROUPS, PERMS.ACCESS_ADMIN_PAGE],
    head_teacher: [
        PERMS.VIEW_ALL_CALENDARS,
        PERMS.CREATE_CALENDARS,
        PERMS.MANAGE_CALENDAR_ACCESS,
        PERMS.BYPASS_COLLABORATIVE_LOCK,
        PERMS.FORCE_SAVE,
        PERMS.VIEW_PRESENCE,
        PERMS.APPLY_SUGGESTIONS,
        PERMS.VIEW_AUDIT,
        PERMS.ACCESS_ADMIN_PAGE
    ],
    settings_admin: [PERMS.MANAGE_SETTINGS, PERMS.ACCESS_ADMIN_PAGE],
    teacher: [],
    viewer: []
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
        return stored;
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

module.exports = {
    PERMS,
    ROLE_PRESETS,
    ASSIGNABLE_ROLES,
    normalizeRole,
    normalizeAssignableRole,
    getEffectivePermissions,
    hasPermission,
    hasAnyPermission,
    canAccessAdminPage,
    isSuperAdminRole,
    canManageUsers,
    canForceUnlock
};
