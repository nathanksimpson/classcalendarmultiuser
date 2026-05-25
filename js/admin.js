function t(key, vars) {
    return typeof AdminI18n !== 'undefined' ? AdminI18n.t(key, vars) : key;
}

function getStoredTheme() {
    const saved = localStorage.getItem('calendarTheme');
    if (saved === 'light' || saved === 'dark') {
        return saved;
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

function applyAdminTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    localStorage.setItem('calendarTheme', next);
    const btn = document.getElementById('adminThemeToggle');
    if (btn) {
        btn.textContent = next === 'dark' ? t('themeLight') : t('themeDark');
        btn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
        btn.title = t('themeToggleTitle');
    }
}

function loadAdminTheme() {
    applyAdminTheme(getStoredTheme());
}

function setupAdminThemeToggle() {
    const btn = document.getElementById('adminThemeToggle');
    if (!btn || btn.dataset.bound === '1') {
        return;
    }
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        applyAdminTheme(current === 'dark' ? 'light' : 'dark');
    });
}

function apiAllowsWithoutSession(path, method) {
    const m = (method || 'GET').toUpperCase();
    if (path === '/admin/bootstrap' && m === 'POST') {
        return true;
    }
    if (path === '/auth/password' && m === 'POST') {
        return true;
    }
    return false;
}

async function api(path, options) {
    const opts = options || {};
    const isAuthMe = path === '/auth/me' || path.startsWith('/auth/me?');
    if (
        !isAuthMe &&
        !apiAllowsWithoutSession(path, opts.method) &&
        typeof TeamAuth !== 'undefined' &&
        TeamAuth.isSignedIn &&
        !TeamAuth.isSignedIn()
    ) {
        throw new Error('Not signed in');
    }
    const res = await fetch('/api' + path, Object.assign({ credentials: 'same-origin' }, options || {}));
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(json.error || res.statusText);
    }
    return json;
}

let adminNoticeTimer = null;
let resetPasswordTargetId = null;
let editUserTargetId = null;

function openAdminModal(modal) {
    if (!modal) {
        return;
    }
    modal.style.removeProperty('display');
    modal.classList.add('active');
}

function closeAdminModal(modal) {
    if (!modal) {
        return;
    }
    modal.classList.remove('active');
    modal.style.removeProperty('display');
}

function openResetPasswordModal(user) {
    resetPasswordTargetId = user.id;
    const modal = document.getElementById('resetPasswordModal');
    const label = document.getElementById('resetPasswordUserLabel');
    const newInput = document.getElementById('resetPasswordNew');
    const confirmInput = document.getElementById('resetPasswordConfirm');
    if (label) {
        label.textContent = t('resetPasswordFor', {
            name: user.displayName || user.email || user.id
        });
    }
    if (newInput) {
        newInput.value = '';
    }
    if (confirmInput) {
        confirmInput.value = '';
    }
    openAdminModal(modal);
    newInput?.focus();
}

async function clearUserPassword(u) {
    const label = u.email || u.displayName || u.id;
    if (!confirm(t('confirmClearPassword', { label }))) {
        return;
    }
    await api('/admin/users/' + encodeURIComponent(u.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearPassword: true })
    });
    await refreshAll();
    showAdminSaveNotice(t('savedPasswordCleared', { label }), false);
}

function setupResetPasswordModal() {
    const modal = document.getElementById('resetPasswordModal');
    if (!modal || modal.dataset.bound === '1') {
        return;
    }
    modal.dataset.bound = '1';
    document.getElementById('closeResetPasswordModal')?.addEventListener('click', () => {
        resetPasswordTargetId = null;
        closeAdminModal(modal);
    });
    document.getElementById('cancelResetPasswordBtn')?.addEventListener('click', () => {
        resetPasswordTargetId = null;
        closeAdminModal(modal);
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            resetPasswordTargetId = null;
            closeAdminModal(modal);
        }
    });
    document.getElementById('resetPasswordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = resetPasswordTargetId;
        if (!id) {
            return;
        }
        const newPwd = document.getElementById('resetPasswordNew')?.value || '';
        const confirmPwd = document.getElementById('resetPasswordConfirm')?.value || '';
        if (newPwd.length < 8) {
            showAdminSaveNotice(t('passwordTooShort'), true);
            return;
        }
        if (newPwd !== confirmPwd) {
            showAdminSaveNotice(t('passwordMismatch'), true);
            return;
        }
        const submitBtn = document.getElementById('submitResetPasswordBtn');
        const prevText = submitBtn ? submitBtn.textContent : '';
        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = t('saving');
            }
            await api('/admin/users/' + encodeURIComponent(id), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: newPwd })
            });
            resetPasswordTargetId = null;
            closeAdminModal(modal);
            showAdminSaveNotice(t('savedPasswordUpdated'), false);
        } catch (ex) {
            showAdminSaveNotice(ex.message, true);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = prevText || t('savePassword');
            }
        }
    });
}

function appendResetPasswordActions(actions, u) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn btn-outline btn-small';
    reset.textContent = t('resetPassword');
    reset.title = t('resetPasswordTitleBtn');
    reset.onclick = () => openResetPasswordModal(u);
    actions.appendChild(reset);

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn btn-outline btn-small';
    clear.textContent = t('clearPassword');
    clear.title = t('clearPasswordTitle');
    clear.onclick = () => clearUserPassword(u).catch((ex) => showAdminSaveNotice(ex.message, true));
    actions.appendChild(clear);
}

function setStatus(msg, isError) {
    const el = document.getElementById('adminStatus');
    if (!el) {
        return;
    }
    el.textContent = msg;
    el.style.color = isError ? 'var(--status-error-color)' : '';
    if (isError && msg) {
        showAdminSaveNotice(msg, true);
    }
}

function showAdminSaveNotice(msg, isError) {
    const el = document.getElementById('adminNotice');
    if (!el || !msg) {
        return;
    }
    if (adminNoticeTimer) {
        clearTimeout(adminNoticeTimer);
        adminNoticeTimer = null;
    }
    el.textContent = msg;
    el.hidden = false;
    el.className =
        'admin-notice admin-notice--visible ' + (isError ? 'admin-notice--error' : 'admin-notice--success');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (!isError) {
        adminNoticeTimer = setTimeout(() => {
            el.hidden = true;
            el.className = 'admin-notice';
            adminNoticeTimer = null;
        }, 6000);
    }
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

let cachedTeachers = [];
let cachedGroups = [];
let cachedAdminCalendars = [];
let currentAdminId = null;

function countActiveAdmins(users) {
    return (users || []).filter((u) => u.active && u.role === 'admin').length;
}

function renderCheckboxGrid(container, items, name, selectedIds, labelKey) {
    container.innerHTML = '';
    const key = labelKey || 'displayName';
    (items || []).forEach((item) => {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = name;
        cb.value = item.id;
        if (selectedIds && selectedIds.includes(item.id)) {
            cb.checked = true;
        }
        label.appendChild(cb);
        label.appendChild(
            document.createTextNode(' ' + (item[key] || item.name || item.email || item.id))
        );
        container.appendChild(label);
    });
}

function getCheckedIds(container) {
    const ids = [];
    container.querySelectorAll('input[type="checkbox"]:checked').forEach((el) => {
        if (el.value) {
            ids.push(el.value);
        }
    });
    return ids;
}

async function loadTeachersCache() {
    cachedTeachers = await api('/admin/users');
    cachedTeachers = cachedTeachers.filter((u) => u.active && u.role === 'teacher');
    return cachedTeachers;
}

async function permanentlyDeleteUser(u) {
    const label = u.email || u.displayName || u.id;
    if (!confirm(t('confirmPermanentDelete', { label }))) {
        return;
    }
    await api('/admin/users/' + encodeURIComponent(u.id), { method: 'DELETE' });
    await refreshAll();
    showAdminSaveNotice(t('permanentlyDeleted', { label }), false);
}

async function deactivateUser(u) {
    const label = u.email || u.displayName || u.id;
    if (!confirm(t('confirmDeactivate', { label }))) {
        return;
    }
    await api('/admin/users/' + encodeURIComponent(u.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false })
    });
    await refreshAll();
    showAdminSaveNotice(t('savedDeactivated', { label }), false);
}

async function loadUsers() {
    const users = await api('/admin/users');
    const body = document.getElementById('usersBody');
    body.innerHTML = '';
    const activeAdminCount = countActiveAdmins(users);

    users.forEach((u) => {
        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td>' +
            escapeHtml(u.displayName) +
            '</td><td>' +
            escapeHtml(u.email || '—') +
            '</td><td>' +
            escapeHtml(u.role) +
            '</td><td>' +
            (u.hasCalendarAccess
                ? escapeHtml(t('calendarsHasAccess'))
                : '<span class="badge-inactive">' + escapeHtml(t('calendarsNoAccess')) + '</span>') +
            '</td><td>' +
            (u.active ? t('statusActive') : '<span class="badge-inactive">' + escapeHtml(t('statusDeactivated')) + '</span>') +
            '</td><td class="admin-actions"></td>';
        const actions = tr.querySelector('.admin-actions');
        const isSelf = currentAdminId && u.id === currentAdminId;

        if (u.active) {
            if (!isSelf) {
                const deact = document.createElement('button');
                deact.type = 'button';
                deact.className = 'btn btn-outline btn-small';
                deact.textContent = t('deactivate');
                deact.title = t('deactivateTitle');
                deact.onclick = () => deactivateUser(u).catch((ex) => showAdminSaveNotice(ex.message, true));
                if (u.role === 'admin' && activeAdminCount <= 1) {
                    deact.disabled = true;
                    deact.title = t('onlyAdminDeactivate');
                }
                actions.appendChild(deact);
            }
            if (u.role === 'teacher') {
                const promote = document.createElement('button');
                promote.type = 'button';
                promote.className = 'btn btn-outline btn-small';
                promote.textContent = t('makeAdmin');
                promote.onclick = async () => {
                    try {
                        const name = u.displayName || u.email;
                        if (!confirm(t('confirmMakeAdmin', { name }))) {
                            return;
                        }
                        await api('/admin/users/' + encodeURIComponent(u.id), {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ role: 'admin' })
                        });
                        await refreshAll();
                        showAdminSaveNotice(t('savedNowAdmin', { name: u.displayName || u.email }), false);
                    } catch (ex) {
                        showAdminSaveNotice(ex.message, true);
                    }
                };
                actions.appendChild(promote);
            } else if (activeAdminCount > 1 && !isSelf) {
                const demote = document.createElement('button');
                demote.type = 'button';
                demote.className = 'btn btn-outline btn-small';
                demote.textContent = t('makeTeacher');
                demote.onclick = async () => {
                    try {
                        const name = u.displayName || u.email;
                        if (!confirm(t('confirmDemote', { name }))) {
                            return;
                        }
                        await api('/admin/users/' + encodeURIComponent(u.id), {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ role: 'teacher' })
                        });
                        await refreshAll();
                        showAdminSaveNotice(t('savedNowTeacher', { name: u.displayName || u.email }), false);
                    } catch (ex) {
                        showAdminSaveNotice(ex.message, true);
                    }
                };
                actions.appendChild(demote);
            }
        } else {
            const react = document.createElement('button');
            react.type = 'button';
            react.className = 'btn btn-outline btn-small';
            react.textContent = t('reactivate');
            react.title = t('reactivateTitle');
            react.onclick = async () => {
                try {
                    await api('/admin/users/' + encodeURIComponent(u.id), {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ active: true })
                    });
                    await refreshAll();
                    showAdminSaveNotice(t('savedReactivated', { label: u.email || u.displayName }), false);
                } catch (ex) {
                    showAdminSaveNotice(ex.message, true);
                }
            };
            actions.appendChild(react);
            if (!isSelf) {
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'btn btn-outline btn-small btn-danger-text';
                del.textContent = t('deletePermanently');
                del.title = t('deletePermanentlyTitle');
                del.onclick = () => permanentlyDeleteUser(u).catch((ex) => showAdminSaveNotice(ex.message, true));
                actions.appendChild(del);
            }
        }
        appendResetPasswordActions(actions, u);
        body.appendChild(tr);
    });
}

async function loadGroups() {
    cachedGroups = await api('/admin/groups');
    const body = document.getElementById('groupsBody');
    body.innerHTML = '';
    const allUsers = await api('/admin/users');
    const activeTeachers = allUsers.filter((u) => u.active);
    cachedGroups.forEach((g) => {
        const tr = document.createElement('tr');
        const memberNames = (g.memberIds || [])
            .map((id) => {
                const u = allUsers.find((x) => x.id === id);
                return u ? u.displayName || u.email : id;
            })
            .join(', ');
        tr.innerHTML =
            '<td>' +
            escapeHtml(g.name) +
            '</td><td>' +
            escapeHtml(memberNames || '—') +
            '</td><td class="admin-actions"></td>';
        const actions = tr.querySelector('.admin-actions');
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-outline btn-small';
        editBtn.textContent = t('editMembers');
        editBtn.onclick = () => openEditGroupMembers(g, activeTeachers);
        actions.appendChild(editBtn);
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-outline btn-small btn-danger-text';
        delBtn.textContent = t('deleteGroup');
        delBtn.onclick = async () => {
            try {
                if (!confirm(t('confirmDeleteGroup', { name: g.name }))) {
                    return;
                }
                await api('/admin/groups/' + encodeURIComponent(g.id), { method: 'DELETE' });
                await refreshAll();
                showAdminSaveNotice(t('savedGroupDeleted', { name: g.name }), false);
            } catch (ex) {
                showAdminSaveNotice(ex.message, true);
            }
        };
        actions.appendChild(delBtn);
        body.appendChild(tr);
    });
    renderCheckboxGrid(document.getElementById('newGroupMembers'), activeTeachers, 'newGroupMember', [], 'displayName');
}

function openEditGroupMembers(group, activeTeachers) {
    const wrap = document.createElement('div');
    wrap.className = 'admin-form';
    wrap.innerHTML = '<h3 style="margin:0">' + escapeHtml(t('editGroupPrefix')) + ' ' + escapeHtml(group.name) + '</h3>';
    const grid = document.createElement('div');
    grid.className = 'admin-checkbox-grid';
    wrap.appendChild(grid);
    renderCheckboxGrid(grid, activeTeachers, 'editGroupMember', group.memberIds || [], 'displayName');
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = t('saveMembers');
    saveBtn.onclick = async () => {
        try {
            const memberIds = getCheckedIds(grid);
            await api('/admin/groups/' + encodeURIComponent(group.id) + '/members', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ memberIds })
            });
            wrap.remove();
            await refreshAll();
            showAdminSaveNotice(t('savedGroupMembers', { name: group.name }), false);
        } catch (ex) {
            showAdminSaveNotice(ex.message, true);
        }
    };
    wrap.appendChild(saveBtn);
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-outline';
    cancelBtn.textContent = t('cancel');
    cancelBtn.onclick = () => wrap.remove();
    wrap.appendChild(cancelBtn);
    document.getElementById('groupsSection').appendChild(wrap);
}

async function loadCalendarAccessUI() {
    cachedAdminCalendars = await api('/admin/calendars');
    const sel = document.getElementById('accessCalendarSelect');
    const prev = sel.value;
    sel.innerHTML = '';
    cachedAdminCalendars.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name || c.id;
        sel.appendChild(opt);
    });
    if (prev && cachedAdminCalendars.some((c) => c.id === prev)) {
        sel.value = prev;
    }
    await loadCalendarAccessForSelected();
}

async function loadCalendarAccessForSelected() {
    const calId = document.getElementById('accessCalendarSelect').value;
    if (!calId) {
        return;
    }
    const access = await api('/admin/calendars/' + encodeURIComponent(calId) + '/access');
    const allUsers = await api('/admin/users');
    const teachers = allUsers.filter((u) => u.active);
    renderCheckboxGrid(
        document.getElementById('accessTeachersGrid'),
        teachers,
        'accessTeacher',
        access.userIds || [],
        'displayName'
    );
    renderCheckboxGrid(
        document.getElementById('accessGroupsGrid'),
        cachedGroups.length ? cachedGroups : await api('/admin/groups'),
        'accessGroup',
        access.groupIds || [],
        'name'
    );
}

async function refreshAll() {
    await loadLockSettings();
    await loadUsers();
    await loadTeachersCache();
    await loadGroups();
    await loadCalendarAccessUI();
}

function setupAdminNav(signedIn) {
    const nav = document.getElementById('adminNav');
    const signInLink = document.getElementById('adminSignInLink');
    if (!nav) {
        return;
    }
    let logoutBtn = document.getElementById('adminLogoutBtn');
    if (signedIn) {
        if (signInLink) {
            signInLink.hidden = true;
        }
        if (!logoutBtn) {
            logoutBtn = document.createElement('button');
            logoutBtn.type = 'button';
            logoutBtn.id = 'adminLogoutBtn';
            logoutBtn.className = 'btn btn-outline btn-small';
            logoutBtn.textContent = t('signOut');
            logoutBtn.style.marginLeft = '0.35rem';
            logoutBtn.onclick = () => {
                if (typeof TeamAuth !== 'undefined') {
                    TeamAuth.logout();
                }
            };
            nav.appendChild(document.createTextNode(' '));
            nav.appendChild(logoutBtn);
        }
        logoutBtn.hidden = false;
    } else {
        if (signInLink) {
            signInLink.hidden = false;
        }
        if (logoutBtn) {
            logoutBtn.hidden = true;
        }
    }
}

function showAdminSections(visible) {
    ['lockSettingsSection', 'usersSection', 'groupsSection', 'calendarAccessSection'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.hidden = !visible;
        }
    });
}

async function loadLockSettings() {
    const settings = await api('/admin/settings');
    const lockInput = document.getElementById('lockStaleMinutesInput');
    const idleLogoutInput = document.getElementById('idleLogoutMinutesInput');
    const idleWarningInput = document.getElementById('idleWarningMinutesInput');
    const sessionMaxDaysInput = document.getElementById('sessionMaxDaysInput');
    if (lockInput && settings.lockStaleMinutes != null) {
        lockInput.value = String(settings.lockStaleMinutes);
    }
    if (idleLogoutInput && settings.idleLogoutMinutes != null) {
        idleLogoutInput.value = String(settings.idleLogoutMinutes);
    }
    if (idleWarningInput && settings.idleWarningMinutes != null) {
        idleWarningInput.value = String(settings.idleWarningMinutes);
    }
    if (sessionMaxDaysInput && settings.sessionMaxDays != null) {
        sessionMaxDaysInput.value = String(settings.sessionMaxDays);
    }
}

function setupLockSettingsForm() {
    const form = document.getElementById('lockSettingsForm');
    if (!form || form.dataset.bound === '1') {
        return;
    }
    form.dataset.bound = '1';
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const lockInput = document.getElementById('lockStaleMinutesInput');
        const idleLogoutInput = document.getElementById('idleLogoutMinutesInput');
        const idleWarningInput = document.getElementById('idleWarningMinutesInput');
        const sessionMaxDaysInput = document.getElementById('sessionMaxDaysInput');
        try {
            const saved = await api('/admin/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lockStaleMinutes: Number(lockInput && lockInput.value),
                    idleLogoutMinutes: Number(idleLogoutInput && idleLogoutInput.value),
                    idleWarningMinutes: Number(idleWarningInput && idleWarningInput.value),
                    sessionMaxDays: Number(sessionMaxDaysInput && sessionMaxDaysInput.value)
                })
            });
            if (lockInput && saved.lockStaleMinutes != null) {
                lockInput.value = String(saved.lockStaleMinutes);
            }
            if (idleLogoutInput && saved.idleLogoutMinutes != null) {
                idleLogoutInput.value = String(saved.idleLogoutMinutes);
            }
            if (idleWarningInput && saved.idleWarningMinutes != null) {
                idleWarningInput.value = String(saved.idleWarningMinutes);
            }
            if (sessionMaxDaysInput && saved.sessionMaxDays != null) {
                sessionMaxDaysInput.value = String(saved.sessionMaxDays);
            }
            if (typeof TeamAuth !== 'undefined' && TeamAuth.refresh) {
                await TeamAuth.refresh();
            }
            showAdminSaveNotice(
                t('savedLockSettings', {
                    lock: saved.lockStaleMinutes,
                    idle: saved.idleLogoutMinutes,
                    warn: saved.idleWarningMinutes,
                    sessionDays: saved.sessionMaxDays
                }),
                false
            );
        } catch (err) {
            showAdminSaveNotice(err.message || t('couldNotSaveSettings'), true);
        }
    });
}

async function init() {
    setupResetPasswordModal();
    setupLockSettingsForm();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && currentAdminId) {
            refreshAll().catch(() => {});
        }
    });
    try {
        let me;
        if (typeof TeamAuth !== 'undefined' && TeamAuth.ensure) {
            me = await TeamAuth.ensure();
        } else {
            me = await api('/auth/me');
        }
        currentAdminId = me.id;
        if (me.role !== 'admin') {
            setupAdminNav(false);
            showAdminSections(false);
            setStatus(t('mustBeAdmin'), true);
            return;
        }
        setupAdminNav(true);
        showAdminSections(true);
        setStatus(t('signedInAs', { name: me.displayName || me.email }));
        document.getElementById('bootstrapBox').style.display = 'none';
        if (typeof TeamAuth !== 'undefined' && TeamAuth.startIdleWatch) {
            TeamAuth.startIdleWatch();
        }
        await refreshAll();
    } catch (err) {
        if (err && err.message === 'redirect') {
            return;
        }
        setupAdminNav(false);
        showAdminSections(false);
        if (err.message.includes('Not signed in') || err.message.includes('401')) {
            let needsBootstrap = false;
            try {
                const healthRes = await fetch('/api/health', { credentials: 'same-origin' });
                if (healthRes.ok) {
                    const health = await healthRes.json();
                    needsBootstrap = Boolean(health.needsBootstrap);
                }
            } catch (_) {
                /* ignore */
            }
            if (needsBootstrap) {
                setStatus(t('signInFirst'), true);
                document.getElementById('bootstrapBox').style.display = 'block';
            } else {
                location.replace(
                    '/login.html?return=' + encodeURIComponent('/admin.html')
                );
                return;
            }
        } else if (err.message.includes('Admin only') || err.message.includes('admin')) {
            setStatus(err.message, true);
            document.getElementById('bootstrapBox').style.display = 'none';
        } else {
            setStatus(err.message, true);
            document.getElementById('bootstrapBox').style.display = 'none';
        }
    }

    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('newEmail').value.trim();
        const kakaoUserId = document.getElementById('newKakaoUserId').value.trim();
        if (!email && !kakaoUserId) {
            showAdminSaveNotice(t('addTeacherNeedEmailOrKakao'), true);
            return;
        }
        try {
            await api('/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    displayName: document.getElementById('newDisplayName').value.trim(),
                    email: email || undefined,
                    kakaoUserId: kakaoUserId || undefined,
                    role: document.getElementById('newRole').value,
                    password: document.getElementById('newPassword').value || undefined
                })
            });
            document.getElementById('newDisplayName').value = '';
            document.getElementById('newEmail').value = '';
            document.getElementById('newKakaoUserId').value = '';
            document.getElementById('newPassword').value = '';
            await refreshAll();
            showAdminSaveNotice(t('noticedNewUser'), false);
        } catch (ex) {
            showAdminSaveNotice(ex.message, true);
        }
    });

    document.getElementById('addGroupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const memberIds = getCheckedIds(document.getElementById('newGroupMembers'));
            await api('/admin/groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: document.getElementById('newGroupName').value.trim(),
                    memberIds
                })
            });
            document.getElementById('newGroupName').value = '';
            await refreshAll();
            showAdminSaveNotice(t('noticedGroupCreated'), false);
        } catch (ex) {
            showAdminSaveNotice(ex.message, true);
        }
    });

    document.getElementById('accessCalendarSelect').addEventListener('change', () => {
        loadCalendarAccessForSelected().catch((ex) => showAdminSaveNotice(ex.message, true));
    });

    document.getElementById('calendarAccessForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const calId = document.getElementById('accessCalendarSelect').value;
            const userIds = getCheckedIds(document.getElementById('accessTeachersGrid'));
            const groupIds = getCheckedIds(document.getElementById('accessGroupsGrid'));
            await api('/admin/calendars/' + encodeURIComponent(calId) + '/access', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userIds, groupIds })
            });
            const calLabel =
                document.getElementById('accessCalendarSelect')?.selectedOptions?.[0]?.textContent || calId;
            await loadCalendarAccessUI();
            showAdminSaveNotice(t('savedCalendarAccess', { name: calLabel }), false);
        } catch (ex) {
            showAdminSaveNotice(ex.message, true);
        }
    });

    document.getElementById('bootstrapBtn').addEventListener('click', async () => {
        try {
            await api('/admin/bootstrap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    secret: document.getElementById('bootstrapSecret').value,
                    email: document.getElementById('bootstrapEmail').value.trim(),
                    displayName: document.getElementById('bootstrapName').value.trim(),
                    password: document.getElementById('bootstrapPassword').value || undefined
                })
            });
            setStatus(t('adminCreated'));
            location.reload();
        } catch (ex) {
            setStatus(ex.message, true);
        }
    });
}

loadAdminTheme();
setupAdminThemeToggle();
if (typeof AdminI18n !== 'undefined') {
    AdminI18n.setupAdminLanguageToggle(() => {
        if (currentAdminId) {
            refreshAll().catch(() => {});
        } else if (typeof AdminI18n.applyAdminLanguage === 'function') {
            AdminI18n.applyAdminLanguage();
        }
    });
    const bootstrapName = document.getElementById('bootstrapName');
    if (bootstrapName) {
        bootstrapName.addEventListener('input', () => {
            bootstrapName.dataset.userEdited = '1';
        });
    }
}
init();
