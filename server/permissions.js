/**
 * Admin RBAC — roles and permissions (mirrored in worker/src/permissions.js).
 */
function normalizeRole(role) {
    if (!role || role === 'teacher') {
        return 'teacher';
    }
    if (role === 'admin') {
        return 'super_admin';
    }
    return role;
}

function isSuperAdminRole(role) {
    return normalizeRole(role) === 'super_admin';
}

function canForceUnlock(user) {
    if (!user) {
        return false;
    }
    const r = normalizeRole(user.role);
    return r === 'super_admin' || r === 'head_teacher';
}

function canAccessAdmin(user) {
    if (!user) {
        return false;
    }
    if (isSuperAdminRole(user.role)) {
        return true;
    }
    const r = normalizeRole(user.role);
    return r === 'user_admin' || r === 'settings_admin' || r === 'head_teacher' || r === 'viewer';
}

function isCalendarSuperAdmin(user) {
    return isSuperAdminRole(user && user.role);
}

function enrichUserForClient(user) {
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

module.exports = {
    normalizeRole,
    isSuperAdminRole,
    canForceUnlock,
    canAccessAdmin,
    isCalendarSuperAdmin,
    enrichUserForClient
};
