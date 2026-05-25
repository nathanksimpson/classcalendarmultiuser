/**
 * Login device context — personal (my computer) vs shared (public PC / terminal).
 */
export const LOGIN_CONTEXT_PERSONAL = 'personal';
export const LOGIN_CONTEXT_SHARED = 'shared';

const SHARED_SESSION_MAX_DAYS = 1;
const SHARED_IDLE_LOGOUT_MINUTES = 15;
const SHARED_IDLE_WARNING_MINUTES = 2;

export function sanitizeLoginContext(value) {
    const v = value && String(value).trim().toLowerCase();
    if (v === 'shared' || v === 'public') {
        return LOGIN_CONTEXT_SHARED;
    }
    return LOGIN_CONTEXT_PERSONAL;
}

export function resolveLoginProfile(loginContext, adminSettings) {
    const ctx = sanitizeLoginContext(loginContext);
    const admin = adminSettings || {};
    if (ctx === LOGIN_CONTEXT_SHARED) {
        const idleLogoutMinutes = SHARED_IDLE_LOGOUT_MINUTES;
        let idleWarningMinutes = SHARED_IDLE_WARNING_MINUTES;
        if (idleWarningMinutes >= idleLogoutMinutes) {
            idleWarningMinutes = Math.max(1, idleLogoutMinutes - 1);
        }
        return {
            loginContext: LOGIN_CONTEXT_SHARED,
            sessionMaxDays: SHARED_SESSION_MAX_DAYS,
            sessionMaxAgeSec: SHARED_SESSION_MAX_DAYS * 86400,
            idleLogoutMinutes,
            idleWarningMinutes,
            kakaoPrompt: 'login'
        };
    }
    const sessionMaxDays = Math.max(1, Math.floor(Number(admin.sessionMaxDays) || 14));
    return {
        loginContext: LOGIN_CONTEXT_PERSONAL,
        sessionMaxDays,
        sessionMaxAgeSec: sessionMaxDays * 86400,
        idleLogoutMinutes: Math.max(5, Math.floor(Number(admin.idleLogoutMinutes) || 30)),
        idleWarningMinutes: Math.max(1, Math.floor(Number(admin.idleWarningMinutes) || 2)),
        kakaoPrompt: null
    };
}

export function sessionPolicyFromRow(row, adminSettings) {
    const ctx = sanitizeLoginContext(row && row.login_context);
    const logoutRaw = row && row.idle_logout_minutes;
    const warnRaw = row && row.idle_warning_minutes;
    if (logoutRaw != null && warnRaw != null) {
        let idleLogoutMinutes = Math.floor(Number(logoutRaw));
        let idleWarningMinutes = Math.floor(Number(warnRaw));
        if (!Number.isFinite(idleLogoutMinutes)) {
            return resolveLoginProfile(ctx, adminSettings);
        }
        if (!Number.isFinite(idleWarningMinutes) || idleWarningMinutes >= idleLogoutMinutes) {
            idleWarningMinutes = Math.max(1, idleLogoutMinutes - 1);
        }
        const profile = resolveLoginProfile(ctx, adminSettings);
        return {
            loginContext: ctx,
            idleLogoutMinutes,
            idleWarningMinutes,
            sessionMaxAgeSec: profile.sessionMaxAgeSec
        };
    }
    const profile = resolveLoginProfile(ctx, adminSettings);
    return {
        loginContext: profile.loginContext,
        idleLogoutMinutes: profile.idleLogoutMinutes,
        idleWarningMinutes: profile.idleWarningMinutes,
        sessionMaxAgeSec: profile.sessionMaxAgeSec
    };
}
