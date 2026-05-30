/**
 * Admin user create/update policy: permissions + super-admin elevation confirmation.
 */
const Auth = require('./auth-permissions');
const users = require('./users');
const { getDb } = require('./schema');

function assertSuperAdminActor(actor) {
    if (!Auth.isSuperAdminRole(actor)) {
        const err = new Error('Only a super admin can perform this action');
        err.status = 403;
        throw err;
    }
}

function assertConfirmPassword(actor, confirmPassword) {
    const row = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(actor.id);
    if (!row || !row.password_hash) {
        const err = new Error(
            'Set a password on your account before granting super admin access'
        );
        err.status = 400;
        throw err;
    }
    if (!confirmPassword || !users.verifyUserPassword(actor.id, String(confirmPassword))) {
        const err = new Error('Invalid confirmation password');
        err.status = 401;
        throw err;
    }
}

function assertRoleAssignmentAllowed(actor, nextRole) {
    const role = Auth.normalizeAssignableRole(nextRole);
    if (role === 'super_admin' && !Auth.isSuperAdminRole(actor)) {
        const err = new Error('Only a super admin can assign the super admin role');
        err.status = 403;
        throw err;
    }
    return role;
}

function assertElevationConfirmed(actor, opts) {
    if (!Auth.requiresSuperAdminConfirmation(opts)) {
        return;
    }
    assertSuperAdminActor(actor);
    assertConfirmPassword(actor, opts.confirmPassword);
}

function permissionsFieldForUpdate(actor, targetRow, body, nextRole) {
    if (!Auth.isSuperAdminRole(actor)) {
        if (body.permissions !== undefined) {
            const err = new Error('Only a super admin can set custom permissions');
            err.status = 403;
            throw err;
        }
        return undefined;
    }
    if (Auth.isSuperAdminRole(targetRow)) {
        return undefined;
    }
    const previousRole = targetRow.role;
    let nextPerms = null;
    if (body.permissions !== undefined) {
        nextPerms = Auth.sanitizePermissions(body.permissions);
    }
    assertElevationConfirmed(actor, {
        confirmPassword: body.confirmPassword,
        nextRole,
        previousRole,
        nextPermissions: nextPerms !== null ? nextPerms : Auth.getRolePreset(nextRole)
    });
    if (body.permissions !== undefined) {
        return Auth.resolvePermissionsForSave(nextRole, nextPerms);
    }
    if (Auth.isPromotingToSuperAdmin(previousRole, nextRole)) {
        return null;
    }
    return undefined;
}

function permissionsFieldForCreate(actor, body, nextRole) {
    if (!Auth.isSuperAdminRole(actor)) {
        if (body.permissions !== undefined) {
            const err = new Error('Only a super admin can set custom permissions');
            err.status = 403;
            throw err;
        }
        return undefined;
    }
    const nextPerms =
        body.permissions !== undefined
            ? Auth.sanitizePermissions(body.permissions)
            : Auth.getRolePreset(nextRole);
    assertElevationConfirmed(actor, {
        confirmPassword: body.confirmPassword,
        nextRole,
        previousRole: 'teacher',
        nextPermissions: nextPerms
    });
    if (body.permissions !== undefined) {
        return Auth.resolvePermissionsForSave(nextRole, nextPerms);
    }
    return null;
}

module.exports = {
    assertRoleAssignmentAllowed,
    permissionsFieldForUpdate,
    permissionsFieldForCreate
};
