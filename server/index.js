require('./load-env');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const calendars = require('./calendars');
const users = require('./users');
const appSettings = require('./app-settings');
const kakao = require('./kakao');
const oauthState = require('./oauth-state');
const loginContext = require('./login-context');
const rateLimit = require('./rate-limit');
const CalAccess = require('./calendar-access');
const Auth = require('./auth-permissions');
const ActivityLog = require('./activity-log');
const Presence = require('./presence');
const Suggestions = require('./suggestions');
const CalendarMeta = require('./calendar-meta');
const AccessRequests = require('./access-requests');
const AdminUserPolicy = require('./admin-user-policy');
const ViewAs = require('./view-as');
const { getDb } = require('./schema');

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SESSION_COOKIE = 'cal_session';
const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID || process.env.KAKAO_REST_API_KEY || '';
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET || '';
const BOOTSTRAP_SECRET = process.env.BOOTSTRAP_ADMIN_SECRET || '';
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1' || PUBLIC_URL.startsWith('https://');
const ALLOW_OPEN_ACCESS = process.env.ALLOW_OPEN_ACCESS === '1';

getDb();

const DEV_USER = {
    id: 'dev-open',
    email: 'dev@local',
    displayName: 'Dev Teacher',
    role: 'admin',
    active: true
};

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.set('trust proxy', 1);

function parseCookies(req) {
    const out = {};
    const raw = req.headers.cookie || '';
    raw.split(';').forEach((part) => {
        const idx = part.indexOf('=');
        if (idx < 0) {
            return;
        }
        const key = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        if (key) {
            out[key] = decodeURIComponent(val);
        }
    });
    return out;
}

function getSessionToken(req) {
    return parseCookies(req)[SESSION_COOKIE] || '';
}

function setSessionCookie(res, token, maxAgeSec) {
    const maxAge = Number(maxAgeSec) > 0 ? Number(maxAgeSec) : 14 * 86400;
    const parts = [
        `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${maxAge}`
    ];
    if (COOKIE_SECURE) {
        parts.push('Secure');
    }
    res.append('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
    const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
    if (COOKIE_SECURE) {
        parts.push('Secure');
    }
    res.append('Set-Cookie', parts.join('; '));
}

function getViewAsSessionHeader(req) {
    const raw = req.headers['x-view-as-session'];
    return raw ? String(raw).trim() : '';
}

function resolveUserContext(req) {
    const viewAsToken = getViewAsSessionHeader(req);
    if (viewAsToken) {
        return users.getSessionContext(viewAsToken);
    }
    return users.getSessionContext(getSessionToken(req));
}

function applyUserContext(req, ctx) {
    if (!ctx || !ctx.effective) {
        req.user = null;
        req.actorUser = null;
        req.viewAsSession = false;
        req.sessionToken = null;
        return;
    }
    req.user = ctx.effective;
    req.actorUser = ctx.actor;
    req.viewAsSession = Boolean(ctx.viewAsActive);
    req.sessionToken = ctx.token;
}

function buildAuthMePayload(user, actorUser) {
    const calendars = CalAccess.listCalendarsForUser(user);
    const hasCalendarAccess = CalAccess.canViewAllCalendars(user) || calendars.length > 0;
    const permissions = Auth.getEffectivePermissions(user);
    const payload = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: Auth.normalizeRole(user.role),
        roleRaw: user.role,
        permissions,
        canAccessAdmin: Auth.canAccessAdminPage(user),
        canForceUnlock: Auth.canForceUnlock(user),
        hasCalendarAccess,
        loginContext: user.loginContext || loginContext.LOGIN_CONTEXT_PERSONAL,
        idleLogoutMinutes: user.idleLogoutMinutes,
        idleWarningMinutes: user.idleWarningMinutes
    };
    if (user.viewAsActive && actorUser) {
        payload.viewAs = {
            active: true,
            targetDisplayName: user.displayName || user.email || 'User',
            targetEmail: user.email || null,
            actorId: actorUser.id,
            actorDisplayName: actorUser.displayName || actorUser.email || 'Admin'
        };
    }
    return payload;
}

function optionalUser(req, _res, next) {
    applyUserContext(req, resolveUserContext(req));
    next();
}

function requireUser(req, res, next) {
    if (!getViewAsSessionHeader(req)) {
        const ctx = resolveUserContext(req);
        if (ctx && ctx.effective) {
            applyUserContext(req, ctx);
            next();
            return;
        }
    }
    if (ALLOW_OPEN_ACCESS && !KAKAO_CLIENT_ID && !getViewAsSessionHeader(req)) {
        req.user = DEV_USER;
        req.actorUser = DEV_USER;
        req.viewAsSession = false;
        next();
        return;
    }
    const ctx = resolveUserContext(req);
    if (!ctx || !ctx.effective) {
        res.status(401).json({ error: 'Not signed in' });
        return;
    }
    applyUserContext(req, ctx);
    next();
}

function requireCookieUser(req, res, next) {
    const ctx = users.getSessionContext(getSessionToken(req));
    if (ctx && ctx.effective && !ctx.viewAsActive) {
        applyUserContext(req, ctx);
        next();
        return;
    }
    if (ALLOW_OPEN_ACCESS && !KAKAO_CLIENT_ID) {
        req.user = DEV_USER;
        req.actorUser = DEV_USER;
        req.viewAsSession = false;
        next();
        return;
    }
    if (!ctx || !ctx.effective || ctx.viewAsActive) {
        res.status(401).json({ error: 'Not signed in' });
        return;
    }
    applyUserContext(req, ctx);
    next();
}

function requireAdminUser(req, res, next) {
    requireCookieUser(req, res, () => {
        if (!req.user || !Auth.canAccessAdminPage(req.user)) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        next();
    });
}

function rejectViewAsWrites(req, res, next) {
    if (req.viewAsSession) {
        res.status(403).json({ error: 'Changes are not saved in View As mode', code: 'VIEW_AS_MODE' });
        return;
    }
    next();
}

function requirePermission(perm) {
    return (req, res, next) => {
        if (!req.user || !Auth.hasPermission(req.user, perm)) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        next();
    };
}

function requireAnyPermission(perms) {
    return (req, res, next) => {
        if (!req.user || !Auth.hasAnyPermission(req.user, perms)) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        next();
    };
}

function kakaoRedirectUri(req) {
    if (process.env.KAKAO_REDIRECT_URI) {
        return process.env.KAKAO_REDIRECT_URI.replace(/\/$/, '');
    }
    return `${PUBLIC_URL}/api/auth/kakao/callback`;
}

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        time: new Date().toISOString(),
        auth: Boolean(KAKAO_CLIENT_ID) || ALLOW_OPEN_ACCESS,
        kakaoConfigured: Boolean(KAKAO_CLIENT_ID),
        kakaoClientSecretConfigured: Boolean(KAKAO_CLIENT_ID && KAKAO_CLIENT_SECRET),
        kakaoRedirectUri: KAKAO_CLIENT_ID ? kakaoRedirectUri(req) : null,
        openAccess: ALLOW_OPEN_ACCESS && !KAKAO_CLIENT_ID,
        needsBootstrap: users.countAdmins() === 0
    });
});

app.get('/api/auth/kakao/config', (req, res) => {
    res.json({
        configured: Boolean(KAKAO_CLIENT_ID),
        redirectUri: KAKAO_CLIENT_ID ? kakaoRedirectUri(req) : null,
        scopes: kakao.oauthScopesFromEnv() || null
    });
});

app.get('/api/host-info', (_req, res) => {
    res.json({
        primaryTeamUrl: PUBLIC_URL,
        localhostUrl: PUBLIC_URL,
        authMode: KAKAO_CLIENT_ID ? 'kakao' : 'open'
    });
});

app.get('/api/auth/me', optionalUser, (req, res) => {
    if (!req.user) {
        res.status(401).json({ error: 'Not signed in' });
        return;
    }
    res.json(buildAuthMePayload(req.user, req.actorUser));
});

app.post('/api/auth/logout', (req, res) => {
    const token = getSessionToken(req);
    const user = token ? users.getSessionUser(token) : null;
    if (user) {
        users.releaseAllLocksHeldByUser(user.id);
        Presence.removePresence(user.id);
    }
    users.deleteSession(token);
    clearSessionCookie(res);
    res.json({ ok: true });
});

app.post('/api/auth/logout-all', requireUser, (req, res) => {
    users.deleteAllSessionsForUser(req.user.id);
    clearSessionCookie(res);
    res.json({ ok: true });
});

function wantsPasswordFormRedirect(req) {
    const ct = (req.headers['content-type'] || '').toLowerCase();
    return ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data');
}

function passwordLoginErrorRedirect(res, returnTo, code) {
    const q = new URLSearchParams({ error: code });
    if (returnTo && returnTo !== '/') {
        q.set('return', returnTo);
    }
    res.redirect(302, `/login.html?${q.toString()}`);
}

function escapeHtmlAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;');
}

function passwordLoginSuccessHtml(returnTo) {
    const safeUrl = escapeHtmlAttr(returnTo);
    const safeJs = String(returnTo).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Signing in…</title>
<meta http-equiv="refresh" content="0;url=${safeUrl}">
</head>
<body>
<p>Signing in…</p>
<script>location.replace('${safeJs}');</script>
</body>
</html>`;
}

function loginRedirectAfterAuth(user, returnTo, options) {
    const opts = options || {};
    if (!AccessRequests.userHasCalendarAccess(user)) {
        return opts.welcome ? '/pending-access.html?welcome=1' : '/pending-access.html';
    }
    return oauthState.sanitizeReturnTo(returnTo || '/');
}

function handlePasswordLogin(req, res, options) {
    const htmlSuccess = Boolean(options && options.htmlSuccess);
    const redirect = htmlSuccess || wantsPasswordFormRedirect(req);
    const returnTo = oauthState.sanitizeReturnTo(req.body.return || '/');
    const device = loginContext.sanitizeLoginContext(req.body.device || req.body.loginContext);
    const email = req.body.email || req.body.username;
    const password = req.body.password;
    if (users.activeUserHasNoPassword(email)) {
        if (redirect) {
            passwordLoginErrorRedirect(res, returnTo, 'password_not_set');
            return;
        }
        res.status(401).json({
            error:
                'No password is set for this account. Sign in with Kakao, or ask an admin to set a password for you.'
        });
        return;
    }
    const user = users.findUserByEmailPassword(email, password);
    if (!user) {
        if (redirect) {
            passwordLoginErrorRedirect(res, returnTo, 'invalid_password');
            return;
        }
        res.status(401).json({ error: 'Invalid email or password' });
        return;
    }
    const session = users.createLoginSession(user.id, device);
    setSessionCookie(res, session.token, session.maxAgeSec);
    const dest = loginRedirectAfterAuth(user, returnTo);
    if (htmlSuccess) {
        res.status(200).type('html').send(passwordLoginSuccessHtml(dest));
        return;
    }
    if (redirect) {
        res.redirect(302, dest);
        return;
    }
    res.json({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        loginContext: session.loginContext
    });
}

const passwordLoginRateLimit = rateLimit.rateLimitMiddleware('auth_password', 25, 15 * 60 * 1000);

app.post('/api/login', passwordLoginRateLimit, (req, res) => {
    handlePasswordLogin(req, res, { htmlSuccess: true });
});

app.post('/login', passwordLoginRateLimit, (req, res) => {
    handlePasswordLogin(req, res, { htmlSuccess: true });
});

app.post('/api/auth/password', passwordLoginRateLimit, (req, res) => {
    handlePasswordLogin(req, res, {});
});

app.post('/api/auth/change-password', requireUser, rejectViewAsWrites, (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};
        const session = users.changeOwnPassword(
            req.user.id,
            currentPassword,
            newPassword,
            req.user.loginContext
        );
        setSessionCookie(res, session.token, session.maxAgeSec);
        res.json({ ok: true });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Password change failed' });
    }
});

app.patch('/api/auth/profile', requireUser, rejectViewAsWrites, (req, res) => {
    try {
        const updated = users.updateOwnDisplayName(req.user.id, req.body && req.body.displayName);
        const calendars = CalAccess.listCalendarsForUser(updated);
        const hasCalendarAccess = CalAccess.canViewAllCalendars(updated) || calendars.length > 0;
        res.json({
            id: updated.id,
            email: updated.email,
            displayName: updated.displayName,
            role: updated.role,
            hasCalendarAccess,
            loginContext: req.user.loginContext || loginContext.LOGIN_CONTEXT_PERSONAL,
            idleLogoutMinutes: req.user.idleLogoutMinutes,
            idleWarningMinutes: req.user.idleWarningMinutes
        });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Profile update failed' });
    }
});

app.get('/api/access-request/me', requireUser, (req, res) => {
    res.json(AccessRequests.getAccessRequestStatus(req.user));
});

app.post('/api/access-request', requireUser, rejectViewAsWrites, (req, res) => {
    res.json(AccessRequests.registerAccessRequest(req.user));
});

app.get(
    '/api/auth/kakao',
    rateLimit.rateLimitMiddleware('auth_kakao_start', 40, 15 * 60 * 1000),
    (req, res) => {
        if (!KAKAO_CLIENT_ID) {
            res.status(503).send('Kakao login is not configured on this server.');
            return;
        }
        const returnTo = typeof req.query.return === 'string' ? req.query.return : '/';
        const device = loginContext.sanitizeLoginContext(req.query.device || req.query.loginContext);
        let prompt = kakao.sanitizeKakaoOAuthPrompt(req.query.prompt);
        const profile = loginContext.resolveLoginProfile(device, appSettings.getAdminSettings());
        if (!prompt && profile.kakaoPrompt) {
            prompt = profile.kakaoPrompt;
        }
        const oauthSecret = oauthState.oauthStateSecret();
        const created = oauthState.createKakaoOAuthState(returnTo, oauthSecret, COOKIE_SECURE, device);
        const url = kakao.buildAuthorizeUrl(KAKAO_CLIENT_ID, kakaoRedirectUri(req), created.state, {
            prompt
        });
        res.setHeader('Set-Cookie', created.setCookie);
        res.redirect(url);
    }
);

app.get(
    '/api/auth/kakao/callback',
    rateLimit.rateLimitMiddleware('auth_kakao_callback', 40, 15 * 60 * 1000),
    async (req, res) => {
        if (req.query.error) {
            res.redirect('/login.html?error=oauth_denied');
            return;
        }
        const code = req.query.code;
        const state = req.query.state || '';
        const oauthSecret = oauthState.oauthStateSecret();
        const verified = oauthState.verifyKakaoOAuthState(
            state,
            parseCookies(req)[oauthState.KAKAO_OAUTH_COOKIE],
            oauthSecret
        );
        if (!verified.ok) {
            res.redirect('/login.html?error=oauth_state_invalid');
            return;
        }
        const returnTo = verified.returnTo;
        if (!code) {
            res.redirect('/login.html?error=missing_code');
            return;
        }
        if (!KAKAO_CLIENT_ID) {
            res.redirect('/login.html?error=kakao_not_configured');
            return;
        }
        try {
            const tokenJson = await kakao.exchangeAuthorizationCode(
                code,
                kakaoRedirectUri(req),
                KAKAO_CLIENT_ID,
                KAKAO_CLIENT_SECRET
            );
            const me = await kakao.fetchUserProfile(tokenJson.access_token);
            const profile = kakao.profileFromKakaoMe(me);
            const resolved = users.resolveKakaoLoginUser(profile);
            if (resolved.disabled) {
                res.redirect('/login.html?error=account_disabled');
                return;
            }
            if (resolved.error) {
                res.redirect('/login.html?error=' + encodeURIComponent(resolved.error));
                return;
            }
            if (!resolved.user) {
                res.redirect('/login.html?error=missing_kakao_id');
                return;
            }
            const session = users.createLoginSession(resolved.user.id, verified.loginContext);
            res.append('Set-Cookie', oauthState.clearKakaoOAuthStateCookie(COOKIE_SECURE));
            setSessionCookie(res, session.token, session.maxAgeSec);
            const dest = loginRedirectAfterAuth(resolved.user, returnTo, {
                welcome: Boolean(resolved.created)
            });
            res.redirect(dest);
        } catch (err) {
            console.error('Kakao callback error:', kakao.kakaoErrorDetail(err));
            res.redirect(kakao.loginRedirectForKakaoError(err));
        }
    }
);

app.post('/api/admin/bootstrap', rateLimit.rateLimitMiddleware('admin_bootstrap', 15, 15 * 60 * 1000), (req, res) => {
    const { secret, email, displayName, password } = req.body || {};
    if (users.countAdmins() > 0) {
        res.status(403).json({ error: 'Bootstrap already completed' });
        return;
    }
    if (!BOOTSTRAP_SECRET || secret !== BOOTSTRAP_SECRET) {
        res.status(403).json({
            error: !BOOTSTRAP_SECRET
                ? 'Bootstrap secret is not configured. Copy .env.example to .env, set BOOTSTRAP_ADMIN_SECRET, and restart npm start.'
                : 'Invalid bootstrap secret'
        });
        return;
    }
    const em = users.normalizeEmail(email);
    if (!em) {
        res.status(400).json({ error: 'email is required' });
        return;
    }
    const user = users.createUser({
        email: em,
        displayName: displayName || 'Admin',
        role: 'super_admin',
        passwordHash: password ? users.hashPassword(password) : null
    });
    const session = users.createSession(user.id);
    setSessionCookie(res, session.token);
    res.status(201).json({ ok: true, userId: user.id });
});

app.post('/api/admin/view-as/activate', (req, res) => {
    const { exchangeToken } = req.body || {};
    const viewAsSessionToken = ViewAs.redeemExchange(exchangeToken);
    if (!viewAsSessionToken) {
        res.status(400).json({ error: 'Invalid or expired View As link' });
        return;
    }
    const ctx = users.getSessionContext(viewAsSessionToken);
    if (!ctx || !ctx.viewAsActive || !ctx.effective) {
        res.status(400).json({ error: 'Invalid View As session' });
        return;
    }
    res.json({ viewAsSessionToken });
});

app.post('/api/admin/view-as', requireCookieUser, (req, res) => {
    if (!Auth.isSuperAdminRole(req.user)) {
        res.status(403).json({ error: 'Super admin only' });
        return;
    }
    try {
        const { userId } = req.body || {};
        const device = loginContext.sanitizeLoginContext(
            (req.body && (req.body.device || req.body.loginContext)) || ''
        );
        const result = ViewAs.startViewAs(req.user, userId, device);
        ActivityLog.recordActivityForUser(req.user, {
            action: 'view_as_start',
            summary: `View as ${result.target.displayName || result.target.email || result.target.id}`,
            detail: { targetUserId: result.target.id }
        });
        res.json({ exchangeToken: result.exchangeToken, target: result.target });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'View As failed' });
    }
});

app.post('/api/admin/view-as/exit', (req, res) => {
    const viewAsToken = getViewAsSessionHeader(req);
    if (!viewAsToken) {
        res.status(400).json({ error: 'Not in View As mode' });
        return;
    }
    const ctx = users.getSessionContext(viewAsToken);
    if (!ctx || !ctx.viewAsActive) {
        res.status(400).json({ error: 'Not in View As mode' });
        return;
    }
    ViewAs.exitViewAsSession(viewAsToken);
    if (ctx.actor) {
        ActivityLog.recordActivityForUser(ctx.actor, {
            action: 'view_as_exit',
            summary: `Stopped viewing as ${ctx.effective.displayName || ctx.effective.email || ctx.effective.id}`,
            detail: { targetUserId: ctx.effective.id }
        });
    }
    res.json({ ok: true });
});

app.get(
    '/api/admin/permission-meta',
    requireAdminUser,
    requirePermission(Auth.PERMS.MANAGE_USERS),
    (req, res) => {
        if (!Auth.isSuperAdminRole(req.user)) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        res.json(Auth.getPermissionMetaForAdmin());
    }
);

app.get('/api/admin/users', requireAdminUser, requirePermission(Auth.PERMS.MANAGE_USERS), (_req, res) => {
    res.json(users.listUsers().map(CalendarMeta.enrichAdminUserRow));
});

app.get(
    '/api/admin/access-requests',
    requireAdminUser,
    (req, res, next) => {
        if (
            !Auth.hasPermission(req.user, Auth.PERMS.MANAGE_USERS) &&
            !Auth.hasPermission(req.user, Auth.PERMS.MANAGE_CALENDAR_ACCESS)
        ) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        next();
    },
    (_req, res) => {
        res.json(AccessRequests.listAccessRequests());
    }
);

app.post('/api/admin/users', requireAdminUser, rejectViewAsWrites, requirePermission(Auth.PERMS.MANAGE_USERS), (req, res) => {
    try {
        const { email, displayName, role, password, kakaoUserId } = req.body || {};
        const em = users.normalizeEmail(email);
        if (!em && !kakaoUserId) {
            res.status(400).json({ error: 'email or kakaoUserId is required' });
            return;
        }
        const nextRole = AdminUserPolicy.assertRoleAssignmentAllowed(
            req.user,
            role || 'teacher'
        );
        const permissionsField = AdminUserPolicy.permissionsFieldForCreate(
            req.user,
            req.body || {},
            nextRole
        );
        const user = users.createUser({
            email: em,
            displayName: displayName || em || 'Teacher',
            role: nextRole,
            kakaoUserId: kakaoUserId || null,
            passwordHash: password ? users.hashPassword(password) : null,
            permissions: permissionsField
        });
        if (user && req.user && user.id !== req.user.id) {
            AccessRequests.notifyUserNeedsAccess(user, {
                source: 'admin_preadd',
                actorUserId: req.user.id,
                actorName: req.user.displayName || req.user.email || 'Admin'
            });
        }
        res.status(201).json(CalendarMeta.enrichAdminUserRow(user));
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Create failed' });
    }
});

app.post(
    '/api/admin/users/:id/force-logout',
    requireAdminUser,
    rejectViewAsWrites,
    requirePermission(Auth.PERMS.MANAGE_USERS),
    (req, res) => {
        try {
        const target = users.getUserById(req.params.id);
        if (!target) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        AdminUserPolicy.assertCanManageTargetUser(req.user, target);
        users.forceLogoutUser(req.params.id);
        ActivityLog.recordActivityForUser(req.user, {
            action: 'force_logout',
            summary: `Forced logout for ${target.displayName || target.email || target.id}`,
            detail: { targetUserId: target.id }
        });
        res.json({ ok: true });
        } catch (err) {
            res.status(err.status || 500).json({ error: err.message || 'Force logout failed' });
        }
    }
);

app.delete('/api/admin/users/:id', requireAdminUser, rejectViewAsWrites, requirePermission(Auth.PERMS.MANAGE_USERS), (req, res) => {
    try {
        const targetRow = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
        if (!targetRow) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        AdminUserPolicy.assertCanManageTargetUser(req.user, targetRow);
        const ok = users.permanentlyDeleteUser(req.params.id, req.user.id);
        if (!ok) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Delete failed' });
    }
});

app.patch('/api/admin/users/:id', requireAdminUser, rejectViewAsWrites, requirePermission(Auth.PERMS.MANAGE_USERS), (req, res) => {
    try {
    const targetId = req.params.id;
    const targetRow = getDb().prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!targetRow) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    AdminUserPolicy.assertCanManageTargetUser(req.user, targetRow);
    const nextRole =
        req.body.role !== undefined
            ? AdminUserPolicy.assertRoleAssignmentAllowed(req.user, req.body.role)
            : targetRow.role;
    const nextActive = req.body.active !== undefined ? (req.body.active ? 1 : 0) : targetRow.active;
    if (targetId === req.user.id && nextActive === 0) {
        res.status(403).json({ error: 'You cannot deactivate your own account' });
        return;
    }
    if (users.isSuperAdminRole(targetRow) && nextActive === 0 && users.countSuperAdmins() <= 1) {
        res.status(403).json({ error: 'Cannot deactivate the last super admin' });
        return;
    }
    const demotingSuper =
        users.isSuperAdminRole(targetRow) &&
        !users.isSuperAdminRole({ role: nextRole }) &&
        nextActive === 1;
    if (demotingSuper && users.countSuperAdmins() <= 1) {
        res.status(403).json({ error: 'Cannot demote the last super admin' });
        return;
    }
    const permissionsField = AdminUserPolicy.permissionsFieldForUpdate(
        req.user,
        targetRow,
        req.body || {},
        nextRole
    );
    const updatePayload = {
        email: req.body.email,
        displayName: req.body.displayName,
        role: req.body.role != null ? nextRole : undefined,
        active: req.body.active,
        kakaoUserId: req.body.kakaoUserId
    };
    if (permissionsField !== undefined) {
        updatePayload.permissions = permissionsField;
    }
    const updated = users.updateUser(targetId, updatePayload);
    if (!updated) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    let passwordSecurityChange = false;
    if (req.body.password !== undefined) {
        const pwd = String(req.body.password || '');
        if (pwd.length < users.MIN_PASSWORD_LENGTH) {
            res.status(400).json({ error: 'Password must be at least 8 characters' });
            return;
        }
        if (!users.setUserPassword(targetId, users.hashPassword(pwd))) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        passwordSecurityChange = true;
    }
    if (req.body.clearPassword === true) {
        if (!users.setUserPassword(targetId, null)) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        passwordSecurityChange = true;
    }
    if (targetRow.active === 1 && nextActive === 0) {
        users.deleteAllSessionsForUser(targetId);
    } else if (passwordSecurityChange) {
        users.deleteAllSessionsForUser(targetId);
    }
    res.json(CalendarMeta.enrichAdminUserRow(users.getUserById(targetId)));
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Update failed' });
    }
});

app.get('/api/admin/settings', requireAdminUser, requirePermission(Auth.PERMS.MANAGE_SETTINGS), (_req, res) => {
    res.json(appSettings.getAdminSettings());
});

app.patch('/api/admin/settings', requireAdminUser, rejectViewAsWrites, requirePermission(Auth.PERMS.MANAGE_SETTINGS), (req, res) => {
    res.json(appSettings.patchAdminSettings(req.body || {}));
});

app.get('/api/admin/activity', requireAdminUser, requirePermission(Auth.PERMS.VIEW_AUDIT), (req, res) => {
    const limit = req.query.limit;
    const calendarId = req.query.calendarId;
    res.json(ActivityLog.listActivity({ limit, calendarId }));
});

app.get('/api/admin/presence', requireAdminUser, requirePermission(Auth.PERMS.VIEW_PRESENCE), (_req, res) => {
    res.json(Presence.listOnlinePresence());
});

app.post('/api/presence/heartbeat', requireUser, rejectViewAsWrites, (req, res) => {
    Presence.upsertPresence(req.user, req.body || {});
    res.json({ ok: true });
});

app.get('/api/teachers', requireUser, (req, res) => {
    const calendars = CalAccess.listCalendarsForUser(req.user);
    const hasCalendarAccess =
        CalAccess.canViewAllCalendars(req.user) || calendars.length > 0;
    if (!hasCalendarAccess) {
        res.status(403).json({ error: 'No calendar access' });
        return;
    }
    res.json(CalAccess.listTeachers());
});

app.get('/api/groups', requireUser, (req, res) => {
    const calendars = CalAccess.listCalendarsForUser(req.user);
    const hasCalendarAccess =
        CalAccess.canViewAllCalendars(req.user) || calendars.length > 0;
    if (!hasCalendarAccess) {
        res.status(403).json({ error: 'No calendar access' });
        return;
    }
    res.json(CalAccess.listGroups());
});

app.get('/api/admin/groups', requireAdminUser, requirePermission(Auth.PERMS.MANAGE_GROUPS), (req, res) => {
    const groups = CalAccess.listGroups();
    res.json(
        groups.map((g) => Object.assign({}, g, { memberIds: CalAccess.getGroupMemberIds(g.id) }))
    );
});

app.post('/api/admin/groups', requireAdminUser, rejectViewAsWrites, requirePermission(Auth.PERMS.MANAGE_GROUPS), (req, res) => {
    const name = req.body.name && String(req.body.name).trim();
    if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
    }
    const gid = calendars.newId();
    const created = CalAccess.createGroup(gid, name, req.user.id);
    if (Array.isArray(req.body.memberIds) && req.body.memberIds.length) {
        CalAccess.setGroupMembers(gid, req.body.memberIds);
    }
    res.status(201).json(Object.assign({}, created, { memberIds: CalAccess.getGroupMemberIds(gid) }));
});

app.put('/api/admin/groups/:id/members', requireAdminUser, rejectViewAsWrites, requirePermission(Auth.PERMS.MANAGE_GROUPS), (req, res) => {
    const groupId = req.params.id;
    if (!CalAccess.getGroup(groupId)) {
        res.status(404).json({ error: 'Group not found' });
        return;
    }
    const memberIds = CalAccess.setGroupMembers(groupId, req.body.memberIds || []);
    res.json({ id: groupId, memberIds });
});

app.patch('/api/admin/groups/:id', requireAdminUser, rejectViewAsWrites, requirePermission(Auth.PERMS.MANAGE_GROUPS), (req, res) => {
    const groupId = req.params.id;
    const existing = CalAccess.getGroup(groupId);
    if (!existing) {
        res.status(404).json({ error: 'Group not found' });
        return;
    }
    const updated = CalAccess.updateGroupName(groupId, req.body.name || existing.name);
    res.json(Object.assign({}, updated, { memberIds: CalAccess.getGroupMemberIds(groupId) }));
});

app.delete('/api/admin/groups/:id', requireAdminUser, rejectViewAsWrites, requirePermission(Auth.PERMS.MANAGE_GROUPS), (req, res) => {
    const groupId = req.params.id;
    if (!CalAccess.getGroup(groupId)) {
        res.status(404).json({ error: 'Group not found' });
        return;
    }
    CalAccess.deleteGroup(groupId);
    res.json({ ok: true });
});

app.get(
    '/api/admin/calendars',
    requireAdminUser,
    requireAnyPermission([
        Auth.PERMS.MANAGE_CALENDAR_ACCESS,
        Auth.PERMS.VIEW_ALL_CALENDARS,
        Auth.PERMS.CREATE_CALENDARS
    ]),
    (req, res) => {
        res.json(CalAccess.listAdminCalendarsForUser(req.user));
    }
);

app.get('/api/admin/calendars/:id/access', requireAdminUser, (req, res) => {
    if (!CalAccess.canManageCalendarAccess(req.user, req.params.id)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const meta = calendars.getCalendarMeta(req.params.id);
    if (!meta) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    res.json(CalAccess.getCalendarAccess(req.params.id));
});

app.put('/api/admin/calendars/:id/access', requireAdminUser, rejectViewAsWrites, (req, res) => {
    const calId = req.params.id;
    if (!CalAccess.canManageCalendarAccess(req.user, calId)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const meta = calendars.getCalendarMeta(calId);
    if (!meta) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const result = CalAccess.setCalendarAccess(calId, req.body, null, req.user.id);
    ActivityLog.recordActivityForUser(req.user, {
        action: 'calendar_access_update',
        calendarId: calId,
        calendarName: meta.name,
        summary: 'Updated calendar access'
    });
    res.json(result);
});

app.post('/api/backup', requireUser, rejectViewAsWrites, (_req, res) => {
    res.json({ skipped: true, reason: 'Use Synology or export from Print & data tab for backups' });
});

app.get('/api/calendars', requireUser, (req, res) => {
    res.json(CalAccess.listCalendarsForUser(req.user));
});

app.get('/api/calendars/:id/meta', requireUser, (req, res) => {
    if (!CalAccess.canAccessCalendar(req.user, req.params.id)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const meta = calendars.getCalendarMeta(req.params.id);
    if (!meta) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    res.json(CalendarMeta.calendarMetaExtras(req.user, req.params.id, meta));
});

app.get('/api/calendars/:id', requireUser, (req, res) => {
    if (!CalAccess.canAccessCalendar(req.user, req.params.id)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const doc = calendars.getCalendar(req.params.id);
    if (!doc) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    res.json(CalendarMeta.calendarMetaExtras(req.user, req.params.id, doc));
});

app.post('/api/calendars/:id/lock/touch', requireUser, rejectViewAsWrites, (req, res) => {
    if (!CalAccess.canAccessCalendar(req.user, req.params.id)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    if (!users.touchLock(req.params.id, req.user.id)) {
        res.status(403).json({ error: 'Only the current editor can refresh the lock', touched: false });
        return;
    }
    res.json(
        Object.assign(users.lockPayloadForClient(req.params.id, req.user.id, req.user), { touched: true })
    );
});

app.post('/api/calendars/:id/lock', requireUser, rejectViewAsWrites, (req, res) => {
    if (!CalAccess.canAccessCalendar(req.user, req.params.id)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    if (!CalAccess.canEditCalendar(req.user, req.params.id)) {
        res.status(403).json({
            error: 'You do not have edit access to this calendar',
            canEdit: false,
            accessLevel: CalAccess.getUserAccessLevel(req.user, req.params.id)
        });
        return;
    }
    const cal = calendars.getCalendarMeta(req.params.id);
    if (!cal) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const name = req.user.displayName || req.user.email || 'Teacher';
    const force = Boolean(req.body && req.body.force);
    const result = users.acquireLock(req.params.id, req.user, { force });
    const calId = req.params.id;
    const meta = calendars.getCalendarMeta(calId) || { id: calId };
    const payload = CalendarMeta.calendarMetaExtras(req.user, calId, meta);
    payload.editRequestRecorded = Boolean(result.editRequestRecorded);
    if (result.acquired) {
        payload.acquired = true;
    }
    res.json(payload);
});

app.post('/api/calendars/:id/lock/grant', requireUser, rejectViewAsWrites, (req, res) => {
    const calId = req.params.id;
    if (!CalAccess.canAccessCalendar(req.user, calId)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    try {
        const lock = users.getLock(calId);
        if (lock && lock.pending_requester_id) {
            const pendingUser = users.getUserById(lock.pending_requester_id);
            if (pendingUser && !CalAccess.canEditCalendar(pendingUser, calId)) {
                res.status(403).json({ error: 'That user cannot edit this calendar' });
                return;
            }
        }
        users.grantLockToPending(calId, req.user.id);
        const meta = calendars.getCalendarMeta(calId) || { id: calId };
        res.json(CalendarMeta.calendarMetaExtras(req.user, calId, meta));
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Grant failed' });
    }
});

app.post('/api/calendars/:id/lock/dismiss', requireUser, rejectViewAsWrites, (req, res) => {
    if (!CalAccess.canAccessCalendar(req.user, req.params.id)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    try {
        users.dismissLockRequest(req.params.id, req.user.id);
        res.json(users.lockPayloadForClient(req.params.id, req.user.id, req.user));
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Dismiss failed' });
    }
});

app.delete('/api/calendars/:id/lock', requireUser, rejectViewAsWrites, (req, res) => {
    if (!CalAccess.canAccessCalendar(req.user, req.params.id)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const result = users.releaseLock(req.params.id, req.user.id);
    if (result.reason === 'not_holder') {
        const status = users.lockStatusForClient(req.params.id, req.user.id, req.user);
        res.status(403).json({ error: 'Only the current editor can release this lock', lock: status.lock });
        return;
    }
    res.json({ ok: true, released: Boolean(result.released) });
});

app.post('/api/calendars', requireUser, rejectViewAsWrites, requirePermission(Auth.PERMS.CREATE_CALENDARS), (req, res) => {
    const { name, data, memberUserIds, groupIds } = req.body || {};
    if (!name || !data) {
        res.status(400).json({ error: 'name and data are required' });
        return;
    }
    const trimmed = String(name).trim();
    try {
        calendars.assertNameAvailable(trimmed);
    } catch (err) {
        res.status(err.status || 409).json({ error: err.message, code: err.code || 'DUPLICATE_NAME' });
        return;
    }
    const id = calendars.newId();
    const label = req.user.displayName || req.user.email || 'Teacher';
    const doc = calendars.createCalendar(id, trimmed, data, label, req.user.id);
    const memberIds = Array.isArray(memberUserIds) ? memberUserIds.map(String) : [];
    if (!memberIds.includes(req.user.id)) {
        memberIds.push(req.user.id);
    }
    const gids = Array.isArray(groupIds) ? groupIds.map(String) : [];
    CalAccess.setCalendarAccess(id, { userIds: memberIds, groupIds: gids }, null, req.user.id);
    users.assignLockHolder(id, req.user.id, label);
    ActivityLog.recordActivityForUser(req.user, {
        action: 'calendar_create',
        calendarId: id,
        calendarName: trimmed,
        summary: `Created calendar "${trimmed}"`
    });
    res.status(201).json(doc);
});

app.get('/api/calendars/:id/suggestions', requireUser, (req, res) => {
    const calId = req.params.id;
    if (!CalAccess.canAccessCalendar(req.user, calId)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    if (
        !Auth.hasPermission(req.user, Auth.PERMS.APPLY_SUGGESTIONS) &&
        !CalAccess.canSuggestChanges(req.user, calId)
    ) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    res.json(Suggestions.listPendingSuggestions(calId));
});

app.post('/api/calendars/:id/suggestions', requireUser, rejectViewAsWrites, (req, res) => {
    const calId = req.params.id;
    if (!CalAccess.canAccessCalendar(req.user, calId)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    if (!CalAccess.canSuggestChanges(req.user, calId)) {
        res.status(403).json({ error: 'You cannot submit suggestions for this calendar' });
        return;
    }
    if (CalAccess.canEditCalendar(req.user, calId)) {
        res.status(400).json({ error: 'Editors should save directly; use PUT /api/calendars/:id' });
        return;
    }
    const { data, revision, summary } = req.body || {};
    if (!data || revision == null) {
        res.status(400).json({ error: 'data and revision are required' });
        return;
    }
    const meta = calendars.getCalendarMeta(calId);
    if (!meta) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const created = Suggestions.createSuggestion(calId, req.user, revision, data, summary);
    ActivityLog.recordActivityForUser(req.user, {
        action: 'suggestion_submit',
        calendarId: calId,
        calendarName: meta.name,
        summary: summary || 'Submitted calendar suggestion',
        detail: { suggestionId: created.id, baseRevision: revision }
    });
    res.status(201).json(created);
});

app.post('/api/calendars/:id/suggestions/:suggestionId/apply', requireUser, rejectViewAsWrites, (req, res) => {
    const calId = req.params.id;
    const suggestionId = req.params.suggestionId;
    if (!Auth.hasPermission(req.user, Auth.PERMS.APPLY_SUGGESTIONS)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    if (!CalAccess.canAccessCalendar(req.user, calId)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const suggestion = Suggestions.getSuggestion(suggestionId);
    if (!suggestion || suggestion.calendarId !== calId || suggestion.status !== 'pending') {
        res.status(404).json({ error: 'Suggestion not found' });
        return;
    }
    const meta = calendars.getCalendarMeta(calId);
    const label = req.user.displayName || req.user.email || 'Teacher';
    const result = calendars.updateCalendar(
        calId,
        meta && meta.name,
        suggestion.data,
        suggestion.baseRevision,
        label,
        true,
        req.user
    );
    if (!result.ok) {
        res.status(result.status || 500).json({ error: result.error || 'Apply failed', document: result.document });
        return;
    }
    Suggestions.setSuggestionStatus(suggestionId, 'applied');
    ActivityLog.recordActivityForUser(req.user, {
        action: 'suggestion_apply',
        calendarId: calId,
        calendarName: meta && meta.name,
        summary: `Applied suggestion from ${suggestion.createdByName}`,
        detail: { suggestionId }
    });
    res.json(result.document);
});

app.post('/api/calendars/:id/suggestions/:suggestionId/dismiss', requireUser, rejectViewAsWrites, (req, res) => {
    const calId = req.params.id;
    const suggestionId = req.params.suggestionId;
    if (!Auth.hasPermission(req.user, Auth.PERMS.APPLY_SUGGESTIONS)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    if (!CalAccess.canAccessCalendar(req.user, calId)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const suggestion = Suggestions.getSuggestion(suggestionId);
    if (!suggestion || suggestion.calendarId !== calId || suggestion.status !== 'pending') {
        res.status(404).json({ error: 'Suggestion not found' });
        return;
    }
    Suggestions.setSuggestionStatus(suggestionId, 'dismissed');
    res.json({ ok: true });
});

app.put('/api/calendars/:id', requireUser, rejectViewAsWrites, (req, res) => {
    if (!CalAccess.canAccessCalendar(req.user, req.params.id)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const { data, revision, force, name, dayNotesOnly, dayNotes } = req.body || {};
    const label = req.user.displayName || req.user.email || 'Teacher';
    if (dayNotesOnly) {
        if (!Array.isArray(dayNotes)) {
            res.status(400).json({ error: 'dayNotes array is required' });
            return;
        }
        const result = calendars.updateCalendarDayNotes(
            req.params.id,
            dayNotes,
            revision,
            label,
            req.user
        );
        if (!result.ok) {
            if (result.status === 409) {
                res.status(409).json({ conflict: true, document: result.document });
                return;
            }
            res.status(result.status || 500).json({ error: result.error || 'Update failed' });
            return;
        }
        res.json(result.document);
        return;
    }
    if (!data) {
        res.status(400).json({ error: 'data is required' });
        return;
    }
    const existing = calendars.getCalendar(req.params.id);
    if (!existing) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const displayName = name != null ? String(name).trim() : existing.name;
    const result = calendars.updateCalendar(
        req.params.id,
        displayName,
        data,
        revision,
        label,
        Boolean(force),
        req.user
    );
    if (!result.ok) {
        if (result.status === 409 && result.code === 'DUPLICATE_NAME') {
            res.status(409).json({ error: result.error, code: 'DUPLICATE_NAME' });
            return;
        }
        if (result.status === 409) {
            res.status(409).json({ conflict: true, document: result.document });
            return;
        }
        if (result.status === 423) {
            res.status(423).json({ error: result.error, lock: result.lock });
            return;
        }
        res.status(result.status || 500).json({ error: result.error || 'Update failed' });
        return;
    }
    res.json(result.document);
});

app.delete('/api/calendars/:id', requireUser, rejectViewAsWrites, (req, res) => {
    if (!CalAccess.canDeleteCalendar(req.user, req.params.id)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const meta = calendars.getCalendarMeta(req.params.id);
    const removed = calendars.deleteCalendar(req.params.id);
    if (!removed) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    CalAccess.deleteCalendarAccess(req.params.id);
    ActivityLog.recordActivityForUser(req.user, {
        action: 'calendar_delete',
        calendarId: req.params.id,
        calendarName: meta && meta.name,
        summary: `Deleted calendar "${(meta && meta.name) || req.params.id}"`
    });
    res.json({ ok: true });
});

const staticRoot = path.join(__dirname, '..');
app.use(express.static(staticRoot, { index: false }));

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    if (req.path === '/admin' || req.path === '/admin/') {
        res.redirect('/admin.html');
        return;
    }
    const file = req.path === '/' || req.path === '' ? 'index.html' : req.path.replace(/^\//, '');
    const safe = path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, '');
    if (safe === 'admin.html') {
        let adminUser = null;
        const ctx = users.getSessionContext(getSessionToken(req));
        if (ctx && ctx.effective && !ctx.viewAsActive) {
            adminUser = ctx.effective;
        } else if (ALLOW_OPEN_ACCESS && !KAKAO_CLIENT_ID) {
            adminUser = DEV_USER;
        }
        if (!adminUser || !Auth.canAccessAdminPage(adminUser)) {
            const ret = encodeURIComponent('/admin.html');
            res.redirect(302, `/login.html?return=${ret}`);
            return;
        }
        const target = path.join(staticRoot, safe);
        if (require('fs').existsSync(target)) {
            res.sendFile(target);
        } else {
            res.status(404).send('Not found');
        }
        return;
    }
    const target = path.join(staticRoot, safe);
    if (target.startsWith(staticRoot) && require('fs').existsSync(target) && require('fs').statSync(target).isFile()) {
        res.sendFile(target);
        return;
    }
    res.sendFile(path.join(staticRoot, 'index.html'));
});

app.listen(PORT, () => {
    const isLocalhost =
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(PUBLIC_URL) ||
        PORT === 8080;
    if (ALLOW_OPEN_ACCESS && !isLocalhost) {
        console.error(
            'FATAL: ALLOW_OPEN_ACCESS=1 is only allowed on localhost. Unset it or set PUBLIC_URL to http://localhost:8080'
        );
        process.exit(1);
    }
    if (KAKAO_CLIENT_ID) {
        const oauthSecret = (process.env.OAUTH_STATE_SECRET || process.env.BOOTSTRAP_ADMIN_SECRET || '').trim();
        if (!oauthSecret || oauthSecret === 'dev-oauth-state-insecure-change-me') {
            console.error(
                'FATAL: Kakao login requires OAUTH_STATE_SECRET (or BOOTSTRAP_ADMIN_SECRET) — set a strong value in .env'
            );
            process.exit(1);
        }
    }
    console.log(`Calendar team server: ${PUBLIC_URL}`);
    console.log(`Listening on port ${PORT}`);
    if (KAKAO_CLIENT_ID) {
        console.log('Kakao login: enabled');
        console.log('Kakao redirect URI (register in Kakao Developers):', kakaoRedirectUri({}));
    } else {
        console.log('Kakao login: not configured (set KAKAO_CLIENT_ID)');
    }
    if (users.countAdmins() === 0 && BOOTSTRAP_SECRET) {
        console.log('No admin yet — POST /api/admin/bootstrap with BOOTSTRAP_ADMIN_SECRET');
    }
});
