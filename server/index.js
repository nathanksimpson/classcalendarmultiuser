const path = require('path');
const crypto = require('crypto');
const express = require('express');
const calendars = require('./calendars');
const users = require('./users');
const appSettings = require('./app-settings');
const kakao = require('./kakao');
const CalAccess = require('./calendar-access');
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
app.use(express.json({ limit: '25mb' }));
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

function setSessionCookie(res, token) {
    const maxAge = 14 * 86400;
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
    res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
    const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
    if (COOKIE_SECURE) {
        parts.push('Secure');
    }
    res.setHeader('Set-Cookie', parts.join('; '));
}

function optionalUser(req, _res, next) {
    const token = getSessionToken(req);
    req.user = users.getSessionUser(token) || null;
    next();
}

function requireUser(req, res, next) {
    if (ALLOW_OPEN_ACCESS && !KAKAO_CLIENT_ID) {
        req.user = DEV_USER;
        next();
        return;
    }
    const token = getSessionToken(req);
    const user = users.getSessionUser(token);
    if (!user) {
        res.status(401).json({ error: 'Not signed in' });
        return;
    }
    req.user = user;
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        res.status(403).json({ error: 'Admin only' });
        return;
    }
    next();
}

function kakaoRedirectUri(req) {
    if (process.env.KAKAO_REDIRECT_URI) {
        return process.env.KAKAO_REDIRECT_URI.replace(/\/$/, '');
    }
    return `${PUBLIC_URL}/api/auth/kakao/callback`;
}

app.get('/api/health', (_req, res) => {
    res.json({
        ok: true,
        time: new Date().toISOString(),
        auth: Boolean(KAKAO_CLIENT_ID) || ALLOW_OPEN_ACCESS,
        kakaoConfigured: Boolean(KAKAO_CLIENT_ID),
        openAccess: ALLOW_OPEN_ACCESS && !KAKAO_CLIENT_ID
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
    res.json({
        id: req.user.id,
        email: req.user.email,
        displayName: req.user.displayName,
        role: req.user.role
    });
});

app.post('/api/auth/logout', (req, res) => {
    const token = getSessionToken(req);
    const user = token ? users.getSessionUser(token) : null;
    if (user) {
        users.releaseAllLocksHeldByUser(user.id);
    }
    users.deleteSession(token);
    clearSessionCookie(res);
    res.json({ ok: true });
});

app.post('/api/auth/password', (req, res) => {
    const { email, password } = req.body || {};
    const user = users.findUserByEmailPassword(email, password);
    if (!user) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
    }
    const session = users.createSession(user.id);
    setSessionCookie(res, session.token);
    res.json({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role
    });
});

app.post('/api/auth/change-password', requireUser, (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};
        const session = users.changeOwnPassword(req.user.id, currentPassword, newPassword);
        setSessionCookie(res, session.token);
        res.json({ ok: true });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Password change failed' });
    }
});

app.get('/api/auth/kakao', (req, res) => {
    if (!KAKAO_CLIENT_ID) {
        res.status(503).send('Kakao login is not configured on this server.');
        return;
    }
    const returnTo = typeof req.query.return === 'string' ? req.query.return : '/';
    const state = crypto.randomBytes(16).toString('hex') + '.' + Buffer.from(returnTo).toString('base64url');
    const url = kakao.buildAuthorizeUrl(KAKAO_CLIENT_ID, kakaoRedirectUri(req), state);
    res.redirect(url);
});

app.get('/api/auth/kakao/callback', async (req, res) => {
    const code = req.query.code;
    const state = req.query.state || '';
    let returnTo = '/';
    if (state.includes('.')) {
        try {
            returnTo = Buffer.from(state.split('.').slice(1).join('.'), 'base64url').toString('utf8') || '/';
        } catch (_) {
            returnTo = '/';
        }
    }
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
        const matched = users.findUserForKakaoLogin(profile.kakaoUserId, profile.email);
        if (!matched) {
            const q = new URLSearchParams({
                denied: '1',
                email: profile.email || '',
                kakaoId: profile.kakaoUserId,
                nickname: profile.nickname || ''
            });
            res.redirect('/login.html?' + q.toString());
            return;
        }
        const session = users.createSession(matched.id);
        setSessionCookie(res, session.token);
        const safeReturn = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
        res.redirect(safeReturn);
    } catch (err) {
        console.error('Kakao callback error:', err);
        res.redirect('/login.html?error=oauth_failed');
    }
});

app.post('/api/admin/bootstrap', (req, res) => {
    const { secret, email, displayName, password } = req.body || {};
    if (users.countAdmins() > 0) {
        res.status(403).json({ error: 'Bootstrap already completed' });
        return;
    }
    if (!BOOTSTRAP_SECRET || secret !== BOOTSTRAP_SECRET) {
        res.status(403).json({ error: 'Invalid bootstrap secret' });
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
        role: 'admin',
        passwordHash: password ? users.hashPassword(password) : null
    });
    const session = users.createSession(user.id);
    setSessionCookie(res, session.token);
    res.status(201).json({ ok: true, userId: user.id });
});

app.get('/api/admin/users', requireUser, requireAdmin, (_req, res) => {
    res.json(users.listUsers());
});

app.post('/api/admin/users', requireUser, requireAdmin, (req, res) => {
    const { email, displayName, role, password, kakaoUserId } = req.body || {};
    const em = users.normalizeEmail(email);
    if (!em && !kakaoUserId) {
        res.status(400).json({ error: 'email or kakaoUserId is required' });
        return;
    }
    const user = users.createUser({
        email: em,
        displayName: displayName || em || 'Teacher',
        role: role === 'admin' ? 'admin' : 'teacher',
        kakaoUserId: kakaoUserId || null,
        passwordHash: password ? users.hashPassword(password) : null
    });
    res.status(201).json(user);
});

app.delete('/api/admin/users/:id', requireUser, requireAdmin, (req, res) => {
    try {
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

app.patch('/api/admin/users/:id', requireUser, requireAdmin, (req, res) => {
    const targetId = req.params.id;
    const targetRow = getDb().prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!targetRow) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const nextRole = req.body.role !== undefined ? req.body.role : targetRow.role;
    const nextActive = req.body.active !== undefined ? (req.body.active ? 1 : 0) : targetRow.active;
    if (targetId === req.user.id && nextActive === 0) {
        res.status(403).json({ error: 'You cannot deactivate your own account' });
        return;
    }
    if (targetRow.role === 'admin' && nextActive === 0 && users.countAdmins() <= 1) {
        res.status(403).json({ error: 'Cannot deactivate the last admin' });
        return;
    }
    if (targetRow.role === 'admin' && nextRole !== 'admin' && users.countAdmins() <= 1) {
        res.status(403).json({ error: 'Cannot demote the last admin' });
        return;
    }
    const updated = users.updateUser(targetId, {
        email: req.body.email,
        displayName: req.body.displayName,
        role: req.body.role,
        active: req.body.active,
        kakaoUserId: req.body.kakaoUserId
    });
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
    res.json(users.getUserById(targetId));
});

app.get('/api/admin/settings', requireUser, requireAdmin, (_req, res) => {
    res.json(appSettings.getAdminSettings());
});

app.patch('/api/admin/settings', requireUser, requireAdmin, (req, res) => {
    if (req.body.lockStaleMinutes === undefined) {
        res.json(appSettings.getAdminSettings());
        return;
    }
    res.json(appSettings.setLockStaleMinutes(req.body.lockStaleMinutes));
});

app.get('/api/teachers', requireUser, (req, res) => {
    const teachers = CalAccess.listTeachers();
    if (!CalAccess.isAdmin(req.user)) {
        const me = teachers.find((t) => t.id === req.user.id);
        if (me) {
            res.json([me]);
            return;
        }
        res.json([
            {
                id: req.user.id,
                email: req.user.email,
                displayName: req.user.displayName,
                role: req.user.role
            }
        ]);
        return;
    }
    res.json(teachers);
});

app.get('/api/groups', requireUser, (req, res) => {
    res.json(CalAccess.listGroups());
});

app.get('/api/admin/groups', requireUser, requireAdmin, (req, res) => {
    const groups = CalAccess.listGroups();
    res.json(
        groups.map((g) => Object.assign({}, g, { memberIds: CalAccess.getGroupMemberIds(g.id) }))
    );
});

app.post('/api/admin/groups', requireUser, requireAdmin, (req, res) => {
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

app.put('/api/admin/groups/:id/members', requireUser, requireAdmin, (req, res) => {
    const groupId = req.params.id;
    if (!CalAccess.getGroup(groupId)) {
        res.status(404).json({ error: 'Group not found' });
        return;
    }
    const memberIds = CalAccess.setGroupMembers(groupId, req.body.memberIds || []);
    res.json({ id: groupId, memberIds });
});

app.patch('/api/admin/groups/:id', requireUser, requireAdmin, (req, res) => {
    const groupId = req.params.id;
    const existing = CalAccess.getGroup(groupId);
    if (!existing) {
        res.status(404).json({ error: 'Group not found' });
        return;
    }
    const updated = CalAccess.updateGroupName(groupId, req.body.name || existing.name);
    res.json(Object.assign({}, updated, { memberIds: CalAccess.getGroupMemberIds(groupId) }));
});

app.delete('/api/admin/groups/:id', requireUser, requireAdmin, (req, res) => {
    const groupId = req.params.id;
    if (!CalAccess.getGroup(groupId)) {
        res.status(404).json({ error: 'Group not found' });
        return;
    }
    CalAccess.deleteGroup(groupId);
    res.json({ ok: true });
});

app.get('/api/admin/calendars', requireUser, requireAdmin, (req, res) => {
    res.json(CalAccess.listAdminCalendarsWithAccess());
});

app.get('/api/admin/calendars/:id/access', requireUser, requireAdmin, (req, res) => {
    const meta = calendars.getCalendarMeta(req.params.id);
    if (!meta) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    res.json(CalAccess.getCalendarAccess(req.params.id));
});

app.put('/api/admin/calendars/:id/access', requireUser, requireAdmin, (req, res) => {
    const calId = req.params.id;
    const meta = calendars.getCalendarMeta(calId);
    if (!meta) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const result = CalAccess.setCalendarAccess(
        calId,
        req.body.userIds || [],
        req.body.groupIds || [],
        req.user.id
    );
    res.json(result);
});

app.post('/api/backup', requireUser, (_req, res) => {
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
    const lock = users.lockStatusForClient(req.params.id, req.user.id);
    res.json(
        Object.assign({}, meta, {
            lock: lock.lock,
            readOnly: lock.readOnly,
            holdsLock: Boolean(lock.holdsLock),
            pendingEditRequest: lock.pendingEditRequest,
            lockStaleMinutes: lock.lockStaleMinutes
        })
    );
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
    const lock = users.lockStatusForClient(req.params.id, req.user.id);
    res.json(
        Object.assign({}, doc, {
            lock: lock.lock,
            readOnly: lock.readOnly,
            holdsLock: Boolean(lock.holdsLock),
            pendingEditRequest: lock.pendingEditRequest,
            lockStaleMinutes: lock.lockStaleMinutes
        })
    );
});

app.post('/api/calendars/:id/lock/touch', requireUser, (req, res) => {
    if (!CalAccess.canAccessCalendar(req.user, req.params.id)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    if (!users.touchLock(req.params.id, req.user.id)) {
        res.status(403).json({ error: 'Only the current editor can refresh the lock', touched: false });
        return;
    }
    res.json(Object.assign(users.lockPayloadForClient(req.params.id, req.user.id), { touched: true }));
});

app.post('/api/calendars/:id/lock', requireUser, (req, res) => {
    if (!CalAccess.canAccessCalendar(req.user, req.params.id)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const cal = calendars.getCalendarMeta(req.params.id);
    if (!cal) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const name = req.user.displayName || req.user.email || 'Teacher';
    const result = users.acquireLock(req.params.id, req.user.id, name);
    const payload = users.lockPayloadForClient(req.params.id, req.user.id);
    payload.editRequestRecorded = Boolean(result.editRequestRecorded);
    if (result.acquired) {
        payload.acquired = true;
    }
    res.json(payload);
});

app.post('/api/calendars/:id/lock/grant', requireUser, (req, res) => {
    if (!CalAccess.canAccessCalendar(req.user, req.params.id)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    try {
        users.grantLockToPending(req.params.id, req.user.id);
        res.json(users.lockPayloadForClient(req.params.id, req.user.id));
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Grant failed' });
    }
});

app.post('/api/calendars/:id/lock/dismiss', requireUser, (req, res) => {
    if (!CalAccess.canAccessCalendar(req.user, req.params.id)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    try {
        users.dismissLockRequest(req.params.id, req.user.id);
        res.json(users.lockPayloadForClient(req.params.id, req.user.id));
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Dismiss failed' });
    }
});

app.delete('/api/calendars/:id/lock', requireUser, (req, res) => {
    if (!CalAccess.canAccessCalendar(req.user, req.params.id)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const result = users.releaseLock(req.params.id, req.user.id);
    if (result.reason === 'not_holder') {
        const status = users.lockStatusForClient(req.params.id, req.user.id);
        res.status(403).json({ error: 'Only the current editor can release this lock', lock: status.lock });
        return;
    }
    res.json({ ok: true, released: Boolean(result.released) });
});

app.post('/api/calendars', requireUser, (req, res) => {
    const { name, data, memberUserIds, groupIds } = req.body || {};
    if (!name || !data) {
        res.status(400).json({ error: 'name and data are required' });
        return;
    }
    const id = calendars.newId();
    const label = req.user.displayName || req.user.email || 'Teacher';
    const doc = calendars.createCalendar(id, String(name).trim(), data, label);
    const memberIds = Array.isArray(memberUserIds) ? memberUserIds.map(String) : [];
    if (!memberIds.includes(req.user.id)) {
        memberIds.push(req.user.id);
    }
    const gids = Array.isArray(groupIds) ? groupIds.map(String) : [];
    CalAccess.setCalendarAccess(id, memberIds, gids, req.user.id);
    users.assignLockHolder(id, req.user.id, label);
    res.status(201).json(doc);
});

app.put('/api/calendars/:id', requireUser, (req, res) => {
    if (!CalAccess.canAccessCalendar(req.user, req.params.id)) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    const { data, revision, force, name } = req.body || {};
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
    const label = req.user.displayName || req.user.email || 'Teacher';
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

app.delete('/api/calendars/:id', requireUser, (req, res) => {
    if (req.user.role !== 'admin') {
        res.status(403).json({ error: 'Only admins can delete team calendars' });
        return;
    }
    const removed = calendars.deleteCalendar(req.params.id);
    if (!removed) {
        res.status(404).json({ error: 'Calendar not found' });
        return;
    }
    CalAccess.deleteCalendarAccess(req.params.id);
    res.json({ ok: true });
});

const staticRoot = path.join(__dirname, '..');
app.use(express.static(staticRoot, { index: false }));

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const file = req.path === '/' || req.path === '' ? 'index.html' : req.path.replace(/^\//, '');
    const safe = path.normalize(file).replace(/^(\.\.(\/|\\|$))+/, '');
    const target = path.join(staticRoot, safe);
    if (target.startsWith(staticRoot) && require('fs').existsSync(target) && require('fs').statSync(target).isFile()) {
        res.sendFile(target);
        return;
    }
    res.sendFile(path.join(staticRoot, 'index.html'));
});

app.listen(PORT, () => {
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
