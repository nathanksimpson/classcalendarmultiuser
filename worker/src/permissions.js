/**
 * Admin RBAC — roles and permissions (mirrored in server/permissions.js).
 */
export function normalizeRole(role) {
    if (!role || role === 'teacher') {
        return 'teacher';
    }
    if (role === 'admin') {
        return 'super_admin';
    }
    return role;
}

export function isSuperAdminRole(role) {
    return normalizeRole(role) === 'super_admin';
}

export function canForceUnlock(user) {
    if (!user) {
        return false;
    }
    const r = normalizeRole(user.role);
    return r === 'super_admin' || r === 'head_teacher';
}

export function canAccessAdmin(user) {
    if (!user) {
        return false;
    }
    if (isSuperAdminRole(user.role)) {
        return true;
    }
    const r = normalizeRole(user.role);
    return r === 'user_admin' || r === 'settings_admin' || r === 'head_teacher' || r === 'viewer';
}

export function isCalendarSuperAdmin(user) {
    return isSuperAdminRole(user && user.role);
}

export function enrichUserForClient(user) {
    if (!user) {
        return user;
    }
    const role = normalizeRole(user.role);
    return Object.assign({}, user, {
        role,
        canAccessAdmin: canAccessAdmin({ role }),
        canForceUnlock: canForceUnlock({ role })
    });
}
