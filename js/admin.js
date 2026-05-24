async function api(path, options) {
    const res = await fetch('/api' + path, Object.assign({ credentials: 'same-origin' }, options || {}));
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(json.error || res.statusText);
    }
    return json;
}

let adminNoticeTimer = null;
let resetPasswordTargetId = null;

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
        label.textContent = 'Set a new password for ' + (user.displayName || user.email || user.id) + '.';
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
    if (
        !confirm(
            'Clear password for ' +
                label +
                '?\n\nThey can only sign in with Kakao (if linked). Any password sessions will end.'
        )
    ) {
        return;
    }
    await api('/admin/users/' + encodeURIComponent(u.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearPassword: true })
    });
    await refreshAll();
    showAdminSaveNotice('Saved: password cleared for ' + label + '.', false);
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
            showAdminSaveNotice('Password must be at least 8 characters.', true);
            return;
        }
        if (newPwd !== confirmPwd) {
            showAdminSaveNotice('Passwords do not match.', true);
            return;
        }
        const submitBtn = document.getElementById('submitResetPasswordBtn');
        const prevText = submitBtn ? submitBtn.textContent : '';
        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Saving…';
            }
            await api('/admin/users/' + encodeURIComponent(id), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: newPwd })
            });
            resetPasswordTargetId = null;
            closeAdminModal(modal);
            showAdminSaveNotice('Saved: password updated. They must sign in again with the new password.', false);
        } catch (ex) {
            showAdminSaveNotice(ex.message, true);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = prevText || 'Save password';
            }
        }
    });
}

function appendResetPasswordActions(actions, u) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn btn-outline btn-small';
    reset.textContent = 'Reset password';
    reset.title = 'Set a new password; signs them out everywhere';
    reset.onclick = () => openResetPasswordModal(u);
    actions.appendChild(reset);

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn btn-outline btn-small';
    clear.textContent = 'Clear password';
    clear.title = 'Remove password login (Kakao only if linked)';
    clear.onclick = () => clearUserPassword(u).catch((ex) => showAdminSaveNotice(ex.message, true));
    actions.appendChild(clear);
}

function setStatus(msg, isError) {
    const el = document.getElementById('adminStatus');
    if (!el) {
        return;
    }
    el.textContent = msg;
    el.style.color = isError ? '#b91c1c' : '';
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
    if (
        !confirm(
            'Permanently delete ' +
                label +
                '?\n\nThis removes their account from the database. This cannot be undone.'
        )
    ) {
        return;
    }
    await api('/admin/users/' + encodeURIComponent(u.id), { method: 'DELETE' });
    await refreshAll();
    showAdminSaveNotice('Permanently deleted ' + label + '.', false);
}

async function deactivateUser(u) {
    const label = u.email || u.displayName || u.id;
    if (
        !confirm(
            'Deactivate ' +
                label +
                '?\n\nThey will not be able to sign in until you Reactivate them. You can permanently delete the account later (deactivated users only).'
        )
    ) {
        return;
    }
    await api('/admin/users/' + encodeURIComponent(u.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false })
    });
    await refreshAll();
    showAdminSaveNotice('Saved: deactivated ' + label + '.', false);
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
            (u.active ? 'Active' : '<span class="badge-inactive">Deactivated</span>') +
            '</td><td class="admin-actions"></td>';
        const actions = tr.querySelector('.admin-actions');
        const isSelf = currentAdminId && u.id === currentAdminId;

        if (u.active) {
            if (!isSelf) {
                const deact = document.createElement('button');
                deact.type = 'button';
                deact.className = 'btn btn-outline btn-small';
                deact.textContent = 'Deactivate';
                deact.title = 'Block sign-in (account is kept; use Reactivate later)';
                deact.onclick = () => deactivateUser(u).catch((ex) => showAdminSaveNotice(ex.message, true));
                if (u.role === 'admin' && activeAdminCount <= 1) {
                    deact.disabled = true;
                    deact.title = 'Cannot deactivate the only admin';
                }
                actions.appendChild(deact);
            }
            if (u.role === 'teacher') {
                const promote = document.createElement('button');
                promote.type = 'button';
                promote.className = 'btn btn-outline btn-small';
                promote.textContent = 'Make admin';
                promote.onclick = async () => {
                    try {
                        if (!confirm('Make ' + (u.displayName || u.email) + ' an admin?')) {
                            return;
                        }
                        await api('/admin/users/' + encodeURIComponent(u.id), {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ role: 'admin' })
                        });
                        await refreshAll();
                        showAdminSaveNotice('Saved: ' + (u.displayName || u.email) + ' is now an admin.', false);
                    } catch (ex) {
                        showAdminSaveNotice(ex.message, true);
                    }
                };
                actions.appendChild(promote);
            } else if (activeAdminCount > 1 && !isSelf) {
                const demote = document.createElement('button');
                demote.type = 'button';
                demote.className = 'btn btn-outline btn-small';
                demote.textContent = 'Make teacher';
                demote.onclick = async () => {
                    try {
                        if (!confirm('Demote ' + (u.displayName || u.email) + ' to teacher?')) {
                            return;
                        }
                        await api('/admin/users/' + encodeURIComponent(u.id), {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ role: 'teacher' })
                        });
                        await refreshAll();
                        showAdminSaveNotice('Saved: ' + (u.displayName || u.email) + ' is now a teacher.', false);
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
            react.textContent = 'Reactivate';
            react.title = 'Allow sign-in again';
            react.onclick = async () => {
                try {
                    await api('/admin/users/' + encodeURIComponent(u.id), {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ active: true })
                    });
                    await refreshAll();
                    showAdminSaveNotice('Saved: reactivated ' + (u.email || u.displayName) + '.', false);
                } catch (ex) {
                    showAdminSaveNotice(ex.message, true);
                }
            };
            actions.appendChild(react);
            if (!isSelf) {
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'btn btn-outline btn-small btn-danger-text';
                del.textContent = 'Delete permanently';
                del.title = 'Remove this account from the database (cannot be undone)';
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
        editBtn.textContent = 'Edit members';
        editBtn.onclick = () => openEditGroupMembers(g, activeTeachers);
        actions.appendChild(editBtn);
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-outline btn-small btn-danger-text';
        delBtn.textContent = 'Delete';
        delBtn.onclick = async () => {
            try {
                if (!confirm('Delete group "' + g.name + '"? Calendars will lose this group assignment.')) {
                    return;
                }
                await api('/admin/groups/' + encodeURIComponent(g.id), { method: 'DELETE' });
                await refreshAll();
                showAdminSaveNotice('Saved: deleted group "' + g.name + '".', false);
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
    wrap.innerHTML = '<h3 style="margin:0">Edit: ' + escapeHtml(group.name) + '</h3>';
    const grid = document.createElement('div');
    grid.className = 'admin-checkbox-grid';
    wrap.appendChild(grid);
    renderCheckboxGrid(grid, activeTeachers, 'editGroupMember', group.memberIds || [], 'displayName');
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = 'Save members';
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
            showAdminSaveNotice('Saved: updated members for group "' + group.name + '".', false);
        } catch (ex) {
            showAdminSaveNotice(ex.message, true);
        }
    };
    wrap.appendChild(saveBtn);
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-outline';
    cancelBtn.textContent = 'Cancel';
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
            logoutBtn.textContent = 'Sign out';
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
    const input = document.getElementById('lockStaleMinutesInput');
    if (input && settings.lockStaleMinutes != null) {
        input.value = String(settings.lockStaleMinutes);
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
        const input = document.getElementById('lockStaleMinutesInput');
        const minutes = Number(input && input.value);
        try {
            const saved = await api('/admin/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lockStaleMinutes: minutes })
            });
            if (input && saved.lockStaleMinutes != null) {
                input.value = String(saved.lockStaleMinutes);
            }
            showAdminSaveNotice('Saved: lock expires after ' + saved.lockStaleMinutes + ' minutes.', false);
        } catch (err) {
            showAdminSaveNotice(err.message || 'Could not save lock settings.', true);
        }
    });
}

async function init() {
    setupResetPasswordModal();
    setupLockSettingsForm();
    try {
        const me = await api('/auth/me');
        currentAdminId = me.id;
        if (typeof TeamAuth !== 'undefined' && TeamAuth.refresh) {
            await TeamAuth.refresh();
        }
        if (me.role !== 'admin') {
            setupAdminNav(false);
            showAdminSections(false);
            setStatus('You must sign in as an admin.', true);
            return;
        }
        setupAdminNav(true);
        showAdminSections(true);
        setStatus('Signed in as ' + (me.displayName || me.email));
        document.getElementById('bootstrapBox').style.display = 'none';
        await refreshAll();
    } catch (err) {
        setupAdminNav(false);
        showAdminSections(false);
        if (err.message.includes('Not signed in') || err.message.includes('401')) {
            setStatus('Sign in first, then return here.', true);
            document.getElementById('bootstrapBox').style.display = 'block';
        } else {
            setStatus(err.message, true);
            document.getElementById('bootstrapBox').style.display = 'block';
        }
    }

    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api('/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    displayName: document.getElementById('newDisplayName').value.trim(),
                    email: document.getElementById('newEmail').value.trim(),
                    role: document.getElementById('newRole').value,
                    password: document.getElementById('newPassword').value || undefined
                })
            });
            document.getElementById('newDisplayName').value = '';
            document.getElementById('newEmail').value = '';
            document.getElementById('newPassword').value = '';
            await refreshAll();
            showAdminSaveNotice('Saved: new user added.', false);
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
            showAdminSaveNotice('Saved: group created.', false);
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
            showAdminSaveNotice('Saved: calendar access for "' + calLabel + '".', false);
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
            setStatus('Admin created — you are signed in. Refreshing…');
            location.reload();
        } catch (ex) {
            setStatus(ex.message, true);
        }
    });
}

init();
