async function api(path, options) {
    const res = await fetch('/api' + path, Object.assign({ credentials: 'same-origin' }, options || {}));
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(json.error || res.statusText);
    }
    return json;
}

function setStatus(msg, isError) {
    const el = document.getElementById('adminStatus');
    el.textContent = msg;
    el.style.color = isError ? '#b91c1c' : '';
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

async function loadUsers() {
    const users = await api('/admin/users');
    const body = document.getElementById('usersBody');
    body.innerHTML = '';
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
            (u.active ? 'Active' : '<span class="badge-inactive">Off</span>') +
            '</td><td class="admin-actions"></td>';
        const actions = tr.querySelector('.admin-actions');
        if (u.active) {
            const deact = document.createElement('button');
            deact.type = 'button';
            deact.className = 'btn btn-outline btn-small';
            deact.textContent = 'Deactivate';
            deact.onclick = async () => {
                if (!confirm('Deactivate ' + (u.email || u.displayName) + '?')) {
                    return;
                }
                await api('/admin/users/' + encodeURIComponent(u.id), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ active: false })
                });
                await refreshAll();
            };
            actions.appendChild(deact);
            if (u.role === 'teacher') {
                const promote = document.createElement('button');
                promote.type = 'button';
                promote.className = 'btn btn-outline btn-small';
                promote.textContent = 'Make admin';
                promote.onclick = async () => {
                    if (!confirm('Make ' + (u.displayName || u.email) + ' an admin?')) {
                        return;
                    }
                    await api('/admin/users/' + encodeURIComponent(u.id), {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ role: 'admin' })
                    });
                    await refreshAll();
                };
                actions.appendChild(promote);
            } else if (users.filter((x) => x.role === 'admin' && x.active).length > 1) {
                const demote = document.createElement('button');
                demote.type = 'button';
                demote.className = 'btn btn-outline btn-small';
                demote.textContent = 'Make teacher';
                demote.onclick = async () => {
                    if (!confirm('Demote ' + (u.displayName || u.email) + ' to teacher?')) {
                        return;
                    }
                    await api('/admin/users/' + encodeURIComponent(u.id), {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ role: 'teacher' })
                    });
                    await refreshAll();
                };
                actions.appendChild(demote);
            }
        } else {
            const react = document.createElement('button');
            react.type = 'button';
            react.className = 'btn btn-outline btn-small';
            react.textContent = 'Reactivate';
            react.onclick = async () => {
                await api('/admin/users/' + encodeURIComponent(u.id), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ active: true })
                });
                await refreshAll();
            };
            actions.appendChild(react);
        }
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
            if (!confirm('Delete group "' + g.name + '"? Calendars will lose this group assignment.')) {
                return;
            }
            await api('/admin/groups/' + encodeURIComponent(g.id), { method: 'DELETE' });
            await refreshAll();
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
            setStatus('Group updated.');
        } catch (ex) {
            setStatus(ex.message, true);
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
    ['usersSection', 'groupsSection', 'calendarAccessSection'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.hidden = !visible;
        }
    });
}

async function init() {
    try {
        const me = await api('/auth/me');
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
            setStatus('User added.');
        } catch (ex) {
            setStatus(ex.message, true);
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
            setStatus('Group created.');
        } catch (ex) {
            setStatus(ex.message, true);
        }
    });

    document.getElementById('accessCalendarSelect').addEventListener('change', () => {
        loadCalendarAccessForSelected().catch((ex) => setStatus(ex.message, true));
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
            setStatus('Calendar access saved.');
            await loadCalendarAccessUI();
        } catch (ex) {
            setStatus(ex.message, true);
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
