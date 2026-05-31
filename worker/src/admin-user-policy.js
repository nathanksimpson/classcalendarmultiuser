/**
 * Admin user create/update policy (mirror server/admin-user-policy.js).
 */
import * as Auth from './auth-permissions.js';

export function assertSuperAdminActor(actor) {
    if (!Auth.isSuperAdminRole(actor)) {
        const err = new Error('Only a super admin can perform this action');
        err.status = 403;
        throw err;
    }
}

export async function assertConfirmPassword(actor, confirmPassword, deps) {
    const row = await deps.getActorRow(actor.id);
    if (!row || !row.password_hash) {
        const err = new Error(
            'Set a password on your account before granting super admin access'
        );
        err.status = 400;
        throw err;
    }
    if (
        !confirmPassword ||
        !(await deps.verifyUserPassword(actor.id, String(confirmPassword)))
    ) {
        const err = new Error('Invalid confirmation password');
        err.status = 401;
        throw err;
    }
}

export async function assertElevationConfirmed(actor, opts, deps) {
    if (!Auth.requiresSuperAdminConfirmation(opts)) {
        return;
    }
    assertSuperAdminActor(actor);
    await assertConfirmPassword(actor, opts.confirmPassword, deps);
}

export function assertRoleAssignmentAllowed(actor, nextRole) {
    const role = Auth.normalizeAssignableRole(nextRole);
    if (role === 'super_admin' && !Auth.isSuperAdminRole(actor)) {
        const err = new Error('Only a super admin can assign the super admin role');
        err.status = 403;
        throw err;
    }
    return role;
}

export function assertCanManageTargetUser(actor, targetRow) {
    if (!targetRow) {
        return;
    }
    if (Auth.isSuperAdminRole(targetRow) && !Auth.isSuperAdminRole(actor)) {
        const err = new Error('Only a super admin can manage another super admin account');
        err.status = 403;
        throw err;
    }
}

export async function permissionsFieldForUpdate(actor, targetRow, body, nextRole, deps) {
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
    await assertElevationConfirmed(
        actor,
        {
            confirmPassword: body.confirmPassword,
            nextRole,
            previousRole,
            nextPermissions: nextPerms !== null ? nextPerms : Auth.getRolePreset(nextRole)
        },
        deps
    );
    if (body.permissions !== undefined) {
        return Auth.resolvePermissionsForSave(nextRole, nextPerms);
    }
    if (Auth.isPromotingToSuperAdmin(previousRole, nextRole)) {
        return null;
    }
    return undefined;
}

export async function permissionsFieldForCreate(actor, body, nextRole, deps) {
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
    await assertElevationConfirmed(
        actor,
        {
            confirmPassword: body.confirmPassword,
            nextRole,
            previousRole: 'teacher',
            nextPermissions: nextPerms
        },
        deps
    );
    if (body.permissions !== undefined) {
        return Auth.resolvePermissionsForSave(nextRole, nextPerms);
    }
    return null;
}
