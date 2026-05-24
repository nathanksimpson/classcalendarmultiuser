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

async function loadUsers() {
    const users = await api('/admin/users');
    const table = document.getElementById('usersTable');
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
            '</td><td></td>';
        const actions = tr.lastElementChild;
        if (u.active) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-outline btn-small';
            btn.textContent = 'Deactivate';
            btn.onclick = async () => {
                if (!confirm('Deactivate ' + (u.email || u.displayName) + '?')) {
                    return;
                }
                await api('/admin/users/' + encodeURIComponent(u.id), {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ active: false })
                });
                await loadUsers();
            };
            actions.appendChild(btn);
        }
        body.appendChild(tr);
    });
    table.hidden = users.length === 0;
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
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

async function init() {
    try {
        const me = await api('/auth/me');
        if (typeof TeamAuth !== 'undefined' && TeamAuth.refresh) {
            await TeamAuth.refresh();
        }
        if (me.role !== 'admin') {
            setupAdminNav(false);
            setStatus('You must sign in as an admin.', true);
            return;
        }
        setupAdminNav(true);
        setStatus('Signed in as ' + (me.displayName || me.email));
        document.getElementById('bootstrapBox').style.display = 'none';
        await loadUsers();
    } catch (err) {
        setupAdminNav(false);
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
            await loadUsers();
            setStatus('User added.');
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
