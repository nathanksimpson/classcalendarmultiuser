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
let editUserTriggerEl = null;
let resetPasswordTriggerEl = null;
let sessionStatusText = '';
let refreshInFlight = 0;

function setSessionStatus(msg, loading) {
    sessionStatusText = msg || '';
    const el = document.getElementById('adminStatus');
    if (!el) {
        return;
    }
    if (refreshInFlight > 0) {
        el.textContent = t('updating');
        el.className = 'admin-status-line admin-status-line--loading';
        return;
    }
    el.textContent = sessionStatusText;
    el.className = 'admin-status-line' + (loading ? ' admin-status-line--loading' : '');
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

function showAuthError(msg) {
    const full = msg + ' ' + t('mustBeAdminHint');
    showAdminSaveNotice(full.trim(), true);
    setSessionStatus('');
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function humanizeLabel(value) {
    if (value == null) {
        return '';
    }
    const raw = String(value).trim();
    if (!raw) {
        return '';
    }
    let spaced = raw
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
    if (spaced && spaced === spaced.toUpperCase()) {
        spaced = spaced.toLowerCase();
    }
    return spaced
        .split(' ')
        .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
        .join(' ');
}

function closeAllActionMenus(except) {
    document.querySelectorAll('.admin-actions-menu[open]').forEach((menu) => {
        if (except && menu === except) {
            return;
        }
        menu.removeAttribute('open');
    });
}

function positionActionMenu(menu) {
    if (!menu || !menu.open) {
        return;
    }
    const summary = menu.querySelector('summary');
    const dropdown = menu.querySelector('.admin-actions-dropdown');
    if (!summary || !dropdown) {
        return;
    }

    // Ensure we can measure it.
    const prevVisibility = dropdown.style.visibility;
    const prevDisplay = dropdown.style.display;
    dropdown.style.display = 'block';
    dropdown.style.visibility = 'hidden';

    const margin = 8;
    const gap = 6;
    const summaryRect = summary.getBoundingClientRect();
    const ddWidth = Math.min(dropdown.offsetWidth || 220, window.innerWidth - margin * 2);
    const ddHeight = dropdown.offsetHeight || 200;

    const spaceBelow = window.innerHeight - summaryRect.bottom - margin;
    const spaceAbove = summaryRect.top - margin;
    const openUp = spaceBelow < ddHeight && spaceAbove > spaceBelow;

    let top = openUp ? summaryRect.top - ddHeight - gap : summaryRect.bottom + gap;
    top = Math.max(margin, Math.min(top, window.innerHeight - ddHeight - margin));

    let left = summaryRect.right - ddWidth;
    left = Math.max(margin, Math.min(left, window.innerWidth - ddWidth - margin));

    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';
    dropdown.style.minWidth = Math.max(176, Math.min(ddWidth, 320)) + 'px';
    dropdown.style.maxHeight = Math.max(140, window.innerHeight - margin * 2) + 'px';
    dropdown.style.overflowY = 'auto';

    dropdown.style.visibility = prevVisibility;
    dropdown.style.display = prevDisplay;
}

function setupActionMenuCloseOnOutside() {
    if (document.body.dataset.adminActionMenusBound === '1') {
        return;
    }
    document.body.dataset.adminActionMenusBound = '1';
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.admin-actions-menu')) {
            closeAllActionMenus();
        }
    });
    document.addEventListener('toggle', (e) => {
        const menu = e.target;
        if (!menu.classList || !menu.classList.contains('admin-actions-menu')) {
            return;
        }
        if (menu.open) {
            closeAllActionMenus(menu);
            // After the <details> opens and the dropdown becomes visible, position it.
            requestAnimationFrame(() => positionActionMenu(menu));
        }
    }, true);

    window.addEventListener('scroll', () => closeAllActionMenus(), true);
    window.addEventListener('resize', () => closeAllActionMenus());
}

function createActionsMenu(items) {
    const details = document.createElement('details');
    details.className = 'admin-actions-menu';
    const summary = document.createElement('summary');
    summary.className = 'btn btn-outline btn-small';
    summary.textContent = t('actionsMenu');
    summary.setAttribute('aria-label', t('actionsMenuAria'));
    details.appendChild(summary);
    const list = document.createElement('div');
    list.className = 'admin-actions-dropdown';
    list.setAttribute('role', 'menu');
    (items || []).forEach((item) => {
        if (item.separator) {
            const sep = document.createElement('div');
            sep.className = 'admin-actions-sep';
            sep.setAttribute('role', 'separator');
            list.appendChild(sep);
            return;
        }
        if (item.groupLabel) {
            const label = document.createElement('div');
            label.className = 'admin-actions-group-label';
            label.textContent = item.groupLabel;
            list.appendChild(label);
            return;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'menuitem');
        btn.textContent = item.label;
        if (item.title) {
            btn.title = item.title;
        }
        if (item.danger) {
            btn.className = 'btn-danger-text';
        }
        if (item.disabled) {
            btn.disabled = true;
        }
        btn.addEventListener('click', () => {
            details.removeAttribute('open');
            if (typeof item.onClick === 'function') {
                item.onClick();
            }
        });
        list.appendChild(btn);
    });
    details.appendChild(list);
    return details;
}

function getModalFocusables(modal) {
    if (!modal) {
        return [];
    }
    return Array.from(
        modal.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
    ).filter((el) => el.offsetParent !== null || modal.contains(el));
}

function bindAdminModalA11y(modal, onClose) {
    if (!modal || modal.dataset.a11yBound === '1') {
        return;
    }
    modal.dataset.a11yBound = '1';
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
        if (e.key === 'Tab') {
            const focusables = getModalFocusables(modal);
            if (focusables.length < 2) {
                return;
            }
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });
}

function openAdminModal(modal, triggerEl) {
    if (!modal) {
        return;
    }
    modal.hidden = false;
    modal.style.removeProperty('display');
    modal.classList.add('active');
    if (triggerEl) {
        modal.dataset.triggerId = triggerEl.id || '';
        if (!triggerEl.id) {
            triggerEl.id = 'admin-modal-trigger-' + Math.random().toString(36).slice(2, 9);
            modal.dataset.triggerId = triggerEl.id;
        }
    }
    const focusables = getModalFocusables(modal);
    if (focusables.length) {
        focusables[0].focus();
    }
}

function closeAdminModal(modal, triggerEl) {
    if (!modal) {
        return;
    }
    modal.classList.remove('active');
    modal.hidden = true;
    modal.style.removeProperty('display');
    const tid = modal.dataset.triggerId;
    const restore =
        triggerEl || (tid ? document.getElementById(tid) : null);
    if (restore && typeof restore.focus === 'function') {
        restore.focus();
    }
    delete modal.dataset.triggerId;
}

let cachedTeachers = [];
let cachedGroups = [];
let cachedAdminCalendars = [];
let currentAdminId = null;
let currentAdminDisplayName = '';

function adminHasPerm(perm) {
    if (typeof TeamAuth !== 'undefined' && TeamAuth.hasPermission) {
        return TeamAuth.hasPermission(perm);
    }
    const me = typeof TeamAuth !== 'undefined' ? TeamAuth.getUser() : null;
    return Boolean(me && (me.role === 'admin' || me.role === 'super_admin'));
}

function countActiveSuperAdmins(users) {
    return (users || []).filter((u) => {
        if (!u.active) {
            return false;
        }
        const role = u.role === 'admin' ? 'super_admin' : u.role;
        return role === 'super_admin';
    }).length;
}

function roleDisplayLabel(role) {
    const r = role === 'admin' ? 'super_admin' : (role || 'teacher');
    const map = {
        teacher: 'roleTeacher',
        viewer: 'roleViewer',
        head_teacher: 'roleHeadTeacher',
        user_admin: 'roleUserAdmin',
        settings_admin: 'roleSettingsAdmin',
        super_admin: 'roleSuperAdmin'
    };
    const key = map[r] || null;
    if (key) {
        const translated = t(key);
        if (translated && translated !== key) {
            return translated;
        }
    }
    // Fallback: readable slug
    return String(r).replace(/_/g, ' ');
}

function applyAdminSectionVisibility() {
    const map = {
        usersSection: 'manage_users',
        groupsSection: 'manage_groups',
        calendarAccessSection: 'manage_calendar_access',
        lockSettingsSection: 'manage_settings',
        presenceSection: 'view_presence',
        activitySection: 'view_audit'
    };
    Object.keys(map).forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.hidden = !adminHasPerm(map[id]);
        }
    });
}

function renderEmptyRow(body, colSpan, messageKey) {
    const tr = document.createElement('tr');
    tr.className = 'admin-table-empty';
    const td = document.createElement('td');
    td.colSpan = colSpan;
    td.textContent = t(messageKey);
    tr.appendChild(td);
    body.appendChild(tr);
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

function openEditUserModal(user, triggerEl) {
    editUserTargetId = user.id;
    editUserTriggerEl = triggerEl || null;
    const modal = document.getElementById('editUserModal');
    const roleEl = document.getElementById('editUserRole');
    if (roleEl) {
        roleEl.value = user.role === 'admin' ? 'super_admin' : user.role || 'teacher';
    }
    document.getElementById('editUserDisplayName').value = user.displayName || '';
    document.getElementById('editUserEmail').value = user.email || '';
    document.getElementById('editUserKakaoId').value = user.kakaoUserId || '';
    openAdminModal(modal, editUserTriggerEl);
    document.getElementById('editUserDisplayName')?.focus();
}

function setupEditUserModal() {
    const modal = document.getElementById('editUserModal');
    if (!modal || modal.dataset.bound === '1') {
        return;
    }
    modal.dataset.bound = '1';
    const close = () => {
        editUserTargetId = null;
        closeAdminModal(modal, editUserTriggerEl);
        editUserTriggerEl = null;
    };
    bindAdminModalA11y(modal, close);
    document.getElementById('closeEditUserModal')?.addEventListener('click', close);
    document.getElementById('cancelEditUserBtn')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            close();
        }
    });
    document.getElementById('editUserForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = editUserTargetId;
        if (!id) {
            return;
        }
        const displayName = document.getElementById('editUserDisplayName')?.value.trim() || '';
        if (!displayName) {
            showAdminSaveNotice(t('editUserNameRequired'), true);
            return;
        }
        const submitBtn = document.getElementById('submitEditUserBtn');
        const prevText = submitBtn ? submitBtn.textContent : '';
        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = t('saving');
            }
            await api('/admin/users/' + encodeURIComponent(id), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    displayName,
                    email: document.getElementById('editUserEmail')?.value.trim() || null,
                    kakaoUserId: document.getElementById('editUserKakaoId')?.value.trim() || null,
                    role: document.getElementById('editUserRole')?.value || 'teacher'
                })
            });
            editUserTargetId = null;
            close();
            await refreshAll();
            showAdminSaveNotice(t('savedUserUpdated'), false);
        } catch (ex) {
            showAdminSaveNotice(ex.message, true);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = prevText || t('saveUser');
            }
        }
    });
}

function openResetPasswordModal(user, triggerEl) {
    resetPasswordTargetId = user.id;
    resetPasswordTriggerEl = triggerEl || null;
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
    openAdminModal(modal, resetPasswordTriggerEl);
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
    const close = () => {
        resetPasswordTargetId = null;
        closeAdminModal(modal, resetPasswordTriggerEl);
        resetPasswordTriggerEl = null;
    };
    bindAdminModalA11y(modal, close);
    document.getElementById('closeResetPasswordModal')?.addEventListener('click', close);
    document.getElementById('cancelResetPasswordBtn')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            close();
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
            close();
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

function buildUserActionItems(u, activeSuperAdminCount, isSelf) {
    const items = [
        {
            label: t('editUser'),
            title: t('editUserTitle'),
            onClick: () => {
                const trigger = document.activeElement;
                openEditUserModal(u, trigger);
            }
        }
    ];
    if (u.active) {
        if (!isSelf) {
            const isSuper = u.role === 'admin' || u.role === 'super_admin';
            const deactDisabled = isSuper && activeSuperAdminCount <= 1;
            items.push({
                label: t('deactivate'),
                title: deactDisabled ? t('onlyAdminDeactivate') : t('deactivateTitle'),
                disabled: deactDisabled,
                onClick: () => deactivateUser(u).catch((ex) => showAdminSaveNotice(ex.message, true))
            });
        }
        if (!isSelf && adminHasPerm('manage_users')) {
            items.push({
                label: t('forceLogout'),
                title: t('forceLogoutTitle'),
                onClick: async () => {
                    try {
                        const name = u.displayName || u.email || u.id;
                        if (!confirm(t('confirmForceLogout', { name }))) {
                            return;
                        }
                        await api('/admin/users/' + encodeURIComponent(u.id) + '/force-logout', {
                            method: 'POST'
                        });
                        showAdminSaveNotice(t('savedForceLogout'), false);
                    } catch (ex) {
                        showAdminSaveNotice(ex.message, true);
                    }
                }
            });
        }
    } else {
        items.push({
            label: t('reactivate'),
            title: t('reactivateTitle'),
            onClick: async () => {
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
            }
        });
        if (!isSelf) {
            items.push({
                label: t('deletePermanently'),
                title: t('deletePermanentlyTitle'),
                danger: true,
                onClick: () => permanentlyDeleteUser(u).catch((ex) => showAdminSaveNotice(ex.message, true))
            });
        }
    }
    items.push({ separator: true });
    items.push({ groupLabel: t('passwordActionsLabel') });
    items.push({
        label: t('resetPassword'),
        title: t('resetPasswordTitleBtn'),
        onClick: () => {
            const trigger = document.activeElement;
            openResetPasswordModal(u, trigger);
        }
    });
    items.push({
        label: t('clearPassword'),
        title: t('clearPasswordTitle'),
        onClick: () => clearUserPassword(u).catch((ex) => showAdminSaveNotice(ex.message, true))
    });
    return items;
}

async function loadUsers() {
    const users = await api('/admin/users');
    const body = document.getElementById('usersBody');
    body.innerHTML = '';
    const activeSuperAdminCount = countActiveSuperAdmins(users);

    if (!users.length) {
        renderEmptyRow(body, 7, 'emptyUsers');
        return;
    }

    users.forEach((u) => {
        const tr = document.createElement('tr');
        const roleLabel = roleDisplayLabel(u.role);
        tr.innerHTML =
            '<td>' +
            escapeHtml(u.displayName) +
            '</td><td>' +
            escapeHtml(u.email || '—') +
            '</td><td>' +
            escapeHtml(u.kakaoUserId || '—') +
            '</td><td>' +
            escapeHtml(roleLabel) +
            '</td><td>' +
            (u.hasCalendarAccess
                ? escapeHtml(t('calendarsHasAccess'))
                : '<span class="badge-inactive">' + escapeHtml(t('calendarsNoAccess')) + '</span>') +
            '</td><td>' +
            (u.active ? t('statusActive') : '<span class="badge-inactive">' + escapeHtml(t('statusDeactivated')) + '</span>') +
            '</td><td class="admin-actions-cell"></td>';
        const cell = tr.querySelector('.admin-actions-cell');
        const isSelf = currentAdminId && u.id === currentAdminId;
        cell.appendChild(createActionsMenu(buildUserActionItems(u, activeSuperAdminCount, isSelf)));
        body.appendChild(tr);
    });
}

async function loadGroups() {
    cachedGroups = await api('/admin/groups');
    const body = document.getElementById('groupsBody');
    body.innerHTML = '';
    const allUsers = await api('/admin/users');
    const activeTeachers = allUsers.filter((u) => u.active);

    if (!cachedGroups.length) {
        renderEmptyRow(body, 3, 'emptyGroups');
    }

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
            '</td><td class="admin-actions-cell"></td>';
        const cell = tr.querySelector('.admin-actions-cell');
        const menuItems = [
            {
                label: t('editMembers'),
                onClick: () => openEditGroupMembers(g, activeTeachers)
            },
            { separator: true },
            {
                label: t('deleteGroup'),
                danger: true,
                onClick: async () => {
                    try {
                        if (!confirm(t('confirmDeleteGroup', { name: g.name }))) {
                            return;
                        }
                        await api('/admin/groups/' + encodeURIComponent(g.id), { method: 'DELETE' });
                        closeGroupEditPanel();
                        await refreshAll();
                        showAdminSaveNotice(t('savedGroupDeleted', { name: g.name }), false);
                    } catch (ex) {
                        showAdminSaveNotice(ex.message, true);
                    }
                }
            }
        ];
        cell.appendChild(createActionsMenu(menuItems));
        body.appendChild(tr);
    });
    renderCheckboxGrid(document.getElementById('newGroupMembers'), activeTeachers, 'newGroupMember', [], 'displayName');
}

function closeGroupEditPanel() {
    const panel = document.getElementById('groupEditPanel');
    if (panel) {
        panel.innerHTML = '';
    }
}

function openEditGroupMembers(group, activeTeachers) {
    closeGroupEditPanel();
    const panel = document.getElementById('groupEditPanel');
    if (!panel) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'admin-form';
    wrap.id = 'groupEditForm';
    const heading = document.createElement('h3');
    heading.textContent = t('editGroupPrefix') + ' ' + (group.name || '');
    wrap.appendChild(heading);
    const grid = document.createElement('div');
    grid.className = 'admin-checkbox-grid';
    wrap.appendChild(grid);
    renderCheckboxGrid(grid, activeTeachers, 'editGroupMember', group.memberIds || [], 'displayName');
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.flexWrap = 'wrap';
    btnRow.style.gap = '0.5rem';
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
            closeGroupEditPanel();
            await refreshAll();
            showAdminSaveNotice(t('savedGroupMembers', { name: group.name }), false);
        } catch (ex) {
            showAdminSaveNotice(ex.message, true);
        }
    };
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-outline';
    cancelBtn.textContent = t('cancel');
    cancelBtn.onclick = () => closeGroupEditPanel();
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    wrap.appendChild(btnRow);
    panel.appendChild(wrap);
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function loadCalendarAccessUI() {
    cachedAdminCalendars = await api('/admin/calendars');
    const sel = document.getElementById('accessCalendarSelect');
    const prev = sel.value;
    sel.innerHTML = '';
    if (!cachedAdminCalendars.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = t('emptyCalendars');
        opt.disabled = true;
        sel.appendChild(opt);
        document.getElementById('accessTeachersGrid').innerHTML = '';
        document.getElementById('accessGroupsGrid').innerHTML = '';
        return;
    }
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

async function loadPresence() {
    if (!adminHasPerm('view_presence')) {
        return;
    }
    const list = document.getElementById('presenceList');
    if (!list) {
        return;
    }
    const rows = await api('/admin/presence');
    list.innerHTML = '';
    if (!rows.length) {
        const li = document.createElement('li');
        li.textContent = t('presenceEmpty') || 'No one online right now';
        list.appendChild(li);
        return;
    }
    rows.forEach((row) => {
        const li = document.createElement('li');
        const where = row.calendarName ? ' — ' + row.calendarName : '';
        li.textContent = (row.displayName || row.userId) + where;
        list.appendChild(li);
    });
}

async function loadActivity() {
    if (!adminHasPerm('view_audit')) {
        return;
    }
    const body = document.getElementById('activityBody');
    if (!body) {
        return;
    }
    const rows = await api('/admin/activity?limit=80');
    body.innerHTML = '';
    if (!rows.length) {
        renderEmptyRow(body, 4, 'emptyActivity');
        return;
    }
    rows.forEach((row) => {
        const tr = document.createElement('tr');
        const when = row.createdAt ? new Date(row.createdAt).toLocaleString() : '—';
        const actionLabel = row.action ? humanizeLabel(row.action) : '—';
        tr.innerHTML =
            '<td>' +
            escapeHtml(when) +
            '</td><td>' +
            escapeHtml(row.actorName || '—') +
            '</td><td>' +
            escapeHtml(actionLabel) +
            '</td><td>' +
            escapeHtml(row.summary || '—') +
            '</td>';
        body.appendChild(tr);
    });
}

async function refreshAll() {
    refreshInFlight += 1;
    setSessionStatus(sessionStatusText);
    try {
        if (adminHasPerm('manage_settings')) {
            await loadLockSettings();
        }
        if (adminHasPerm('manage_users')) {
            await loadUsers();
            await loadTeachersCache();
        }
        if (adminHasPerm('manage_groups')) {
            await loadGroups();
        }
        if (adminHasPerm('manage_calendar_access')) {
            await loadCalendarAccessUI();
        }
        await loadPresence();
        await loadActivity();
    } finally {
        refreshInFlight -= 1;
        setSessionStatus(sessionStatusText);
    }
}

function setupAdminNav(signedIn) {
    const nav = document.getElementById('adminNav');
    const signInLink = document.getElementById('adminSignInLink');
    const sectionNav = document.getElementById('adminSectionNav');
    if (sectionNav) {
        sectionNav.hidden = !signedIn;
    }
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
    if (!visible) {
        [
            'usersSection',
            'groupsSection',
            'calendarAccessSection',
            'lockSettingsSection',
            'presenceSection',
            'activitySection'
        ].forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.hidden = true;
            }
        });
        return;
    }
    applyAdminSectionVisibility();
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

function setupAdminLanguageToggleFallback() {
    const btn = document.getElementById('adminLangToggle');
    if (!btn || btn.dataset.boundFallback === '1') {
        return;
    }
    btn.dataset.boundFallback = '1';
    btn.addEventListener('click', () => {
        if (typeof AdminI18n !== 'undefined' && typeof AdminI18n.toggleAdminLang === 'function') {
            AdminI18n.toggleAdminLang();
        } else {
            // Last-resort: flip the stored key and reload labels.
            try {
                const saved = localStorage.getItem('calendarLanguage');
                localStorage.setItem('calendarLanguage', saved === 'ko' ? 'en' : 'ko');
            } catch (_) {
                /* ignore */
            }
            if (typeof AdminI18n !== 'undefined' && typeof AdminI18n.applyAdminLanguage === 'function') {
                AdminI18n.applyAdminLanguage();
            }
        }

        if (currentAdminDisplayName) {
            setSessionStatus(t('signedInAs', { name: currentAdminDisplayName }));
        }
        if (currentAdminId) {
            refreshAll().catch(() => {});
        }
    });
}

async function init() {
    setupActionMenuCloseOnOutside();
    setupEditUserModal();
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
        currentAdminDisplayName = me.displayName || me.email || me.id;
        if (!me.canAccessAdmin && me.role !== 'admin' && me.role !== 'super_admin') {
            setupAdminNav(false);
            showAdminSections(false);
            showAuthError(t('mustBeAdmin'));
            return;
        }
        setupAdminNav(true);
        showAdminSections(true);
        applyAdminSectionVisibility();
        setSessionStatus(t('signedInAs', { name: currentAdminDisplayName }));
        document.getElementById('bootstrapBox').style.display = 'none';
        if (typeof AdminI18n !== 'undefined' && AdminI18n.applyAdminLanguage) {
            AdminI18n.applyAdminLanguage();
        }
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
                showAdminSaveNotice(t('signInFirst'), true);
                setSessionStatus('');
                document.getElementById('bootstrapBox').style.display = 'block';
            } else {
                location.replace(
                    '/login.html?return=' + encodeURIComponent('/admin.html')
                );
                return;
            }
        } else if (err.message.includes('Admin only') || err.message.includes('admin')) {
            showAuthError(err.message);
            document.getElementById('bootstrapBox').style.display = 'none';
        } else {
            showAdminSaveNotice(err.message, true);
            setSessionStatus('');
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
            if (!calId) {
                showAdminSaveNotice(t('emptyCalendars'), true);
                return;
            }
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
            showAdminSaveNotice(t('adminCreated'), false);
            location.reload();
        } catch (ex) {
            showAdminSaveNotice(ex.message, true);
        }
    });
}

loadAdminTheme();
setupAdminThemeToggle();
setupAdminLanguageToggleFallback();
if (typeof AdminI18n !== 'undefined') {
    AdminI18n.setupAdminLanguageToggle(() => {
        if (typeof AdminI18n.applyAdminLanguage === 'function') {
            AdminI18n.applyAdminLanguage();
        }
        if (currentAdminDisplayName) {
            setSessionStatus(t('signedInAs', { name: currentAdminDisplayName }));
        }
        if (currentAdminId) {
            refreshAll().catch(() => {});
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
