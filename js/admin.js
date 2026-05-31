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
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutMs = 15000;
    let timeoutId = null;
    if (controller) {
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }
    const baseOpts = Object.assign(
        { credentials: 'same-origin' },
        opts,
        controller ? { signal: controller.signal } : {}
    );
    if (typeof ViewAsBanner !== 'undefined' && ViewAsBanner.authFetchHeaders) {
        baseOpts.headers = ViewAsBanner.authFetchHeaders(baseOpts.headers || {});
    }
    const res = await fetch('/api' + path, baseOpts).finally(() => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    });
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
let cachedAllUsers = [];
let accountsFilter = 'all';
let accountsSearchQuery = '';
let lastAccessRequestCount = 0;
let adminAccessPollTimer = null;
let activeAdminTab = 'accounts';

const ADMIN_TAB_CONFIG = {
    accounts: { panelId: 'accountsPanel', tabId: 'adminTabAccounts', perms: ['manage_users'] },
    groups: { panelId: 'groupsPanel', tabId: 'adminTabGroups', perms: ['manage_groups'] },
    calendars: {
        panelId: 'calendarsPanel',
        tabId: 'adminTabCalendars',
        perms: ['manage_calendar_access', 'create_calendars'],
        anyPerm: true
    },
    system: { panelId: 'systemPanel', tabId: 'adminTabSystem', perms: ['manage_settings'] },
    monitor: {
        panelId: 'monitorPanel',
        tabId: 'adminTabMonitor',
        perms: ['view_presence', 'view_audit'],
        anyPerm: true
    }
};

const LEGACY_ADMIN_HASH = {
    usersSection: 'accounts',
    groupsSection: 'groups',
    calendarAccessSection: 'calendars',
    lockSettingsSection: 'system',
    presenceSection: 'monitor',
    activitySection: 'monitor'
};

function adminTabVisible(tabKey) {
    const cfg = ADMIN_TAB_CONFIG[tabKey];
    if (!cfg) {
        return false;
    }
    if (cfg.anyPerm) {
        return cfg.perms.some((p) => adminHasPerm(p));
    }
    return cfg.perms.every((p) => adminHasPerm(p));
}

function firstVisibleAdminTab() {
    const order = ['accounts', 'groups', 'calendars', 'system', 'monitor'];
    for (let i = 0; i < order.length; i++) {
        if (adminTabVisible(order[i])) {
            return order[i];
        }
    }
    return null;
}

function switchAdminTab(tabKey, options) {
    const opts = options || {};
    const cfg = ADMIN_TAB_CONFIG[tabKey];
    if (!cfg || !adminTabVisible(tabKey)) {
        return;
    }
    activeAdminTab = tabKey;
    Object.keys(ADMIN_TAB_CONFIG).forEach((key) => {
        const c = ADMIN_TAB_CONFIG[key];
        const panel = document.getElementById(c.panelId);
        const tabBtn = document.getElementById(c.tabId);
        const show = key === tabKey;
        if (panel) {
            panel.hidden = !show;
        }
        if (tabBtn) {
            tabBtn.setAttribute('aria-selected', show ? 'true' : 'false');
            tabBtn.tabIndex = show ? 0 : -1;
        }
    });
    if (!opts.skipHash && typeof location !== 'undefined') {
        const nextHash = '#' + tabKey;
        if (location.hash !== nextHash) {
            history.replaceState(null, '', nextHash);
        }
    }
    if (tabKey === 'accounts' && adminHasPerm('manage_users')) {
        loadAccessRequestsBanner().catch(() => {});
    }
    if (tabKey === 'monitor') {
        loadPresence().catch(() => {});
        loadActivity().catch(() => {});
    }
    saveAdminSessionState();
}

function saveAdminSessionState() {
    if (typeof CCPSessionRestore === 'undefined') {
        return;
    }
    if (CCPSessionRestore.saveAdminSession) {
        CCPSessionRestore.saveAdminSession({
            activeTab: activeAdminTab,
            accountsFilter,
            accountsSearchQuery
        });
    }
    if (CCPSessionRestore.capturePageSession) {
        CCPSessionRestore.capturePageSession();
    }
}

function restoreAdminSessionState() {
    if (typeof CCPSessionRestore === 'undefined' || !CCPSessionRestore.getAdminSession) {
        return;
    }
    const saved = CCPSessionRestore.getAdminSession();
    if (!saved || typeof saved !== 'object') {
        return;
    }
    if (saved.accountsFilter) {
        accountsFilter = saved.accountsFilter;
    }
    if (typeof saved.accountsSearchQuery === 'string') {
        accountsSearchQuery = saved.accountsSearchQuery;
    }
    if (saved.activeTab && adminTabVisible(saved.activeTab)) {
        activeAdminTab = saved.activeTab;
    }
    const search = document.getElementById('accountsSearchInput');
    if (search && typeof saved.accountsSearchQuery === 'string') {
        search.value = saved.accountsSearchQuery;
    }
}

function applyAdminTabVisibility() {
    const bar = document.getElementById('adminTabBar');
    let anyTab = false;
    Object.keys(ADMIN_TAB_CONFIG).forEach((key) => {
        const cfg = ADMIN_TAB_CONFIG[key];
        const tabBtn = document.getElementById(cfg.tabId);
        const panel = document.getElementById(cfg.panelId);
        const visible = adminTabVisible(key);
        if (tabBtn) {
            tabBtn.hidden = !visible;
        }
        if (panel && !visible) {
            panel.hidden = true;
        }
        if (visible) {
            anyTab = true;
        }
    });
    if (bar) {
        bar.hidden = !anyTab;
    }
    const monPresence = document.getElementById('monitorPresenceBlock');
    const monActivity = document.getElementById('monitorActivityBlock');
    if (monPresence) {
        monPresence.hidden = !adminHasPerm('view_presence');
    }
    if (monActivity) {
        monActivity.hidden = !adminHasPerm('view_audit');
    }
    if (anyTab && !adminTabVisible(activeAdminTab)) {
        const first = firstVisibleAdminTab();
        if (first) {
            switchAdminTab(first, { skipHash: true });
        }
    }
}

function resolveAdminTabFromHash() {
    let raw = (location.hash || '').replace(/^#/, '');
    if (LEGACY_ADMIN_HASH[raw]) {
        raw = LEGACY_ADMIN_HASH[raw];
    }
    if (raw && adminTabVisible(raw)) {
        return raw;
    }
    return firstVisibleAdminTab();
}

function setupAdminTabs() {
    const bar = document.getElementById('adminTabBar');
    if (!bar || bar.dataset.bound === '1') {
        return;
    }
    bar.dataset.bound = '1';
    bar.querySelectorAll('.admin-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            if (tab) {
                switchAdminTab(tab);
            }
        });
    });
    window.addEventListener('hashchange', () => {
        const tab = resolveAdminTabFromHash();
        if (tab) {
            switchAdminTab(tab, { skipHash: true });
        }
    });
}

function accessLevelLabel(level) {
    const l = String(level || 'editor').toLowerCase();
    if (l === 'viewer') {
        return t('accessLevelViewer');
    }
    if (l === 'suggester') {
        return t('accessLevelSuggester');
    }
    return t('accessLevelEditor');
}

function formatCalendarSummaryCell(u) {
    if (!u || !u.active) {
        return '—';
    }
    if (u.calendarAccessMode === 'all') {
        return t('calendarsAllAccess');
    }
    if (!u.hasCalendarAccess) {
        return '<span class="badge-inactive">' + escapeHtml(t('calendarsNoAccess')) + '</span>';
    }
    const items = u.calendarSummary || [];
    if (!items.length) {
        return escapeHtml(t('calendarsHasAccess'));
    }
    const max = 3;
    const parts = items.slice(0, max).map((c) => {
        const name = c.name || c.calendarId || '';
        return escapeHtml(name) + ' (' + escapeHtml(accessLevelLabel(c.accessLevel)) + ')';
    });
    let text = parts.join(', ');
    if (items.length > max) {
        text += ' ' + escapeHtml(t('calendarsMore', { count: items.length - max }));
    }
    return '<span class="admin-calendars-cell">' + text + '</span>';
}

function userMatchesAccountsFilter(u) {
    if (accountsFilter === 'active') {
        return Boolean(u.active);
    }
    if (accountsFilter === 'inactive') {
        return !u.active;
    }
    if (accountsFilter === 'waiting') {
        return Boolean(u.active) && !u.hasCalendarAccess;
    }
    return true;
}

function userMatchesAccountsSearch(u) {
    const q = accountsSearchQuery.trim().toLowerCase();
    if (!q) {
        return true;
    }
    const hay = [u.displayName, u.email, u.kakaoUserId, u.id].filter(Boolean).join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
}

function syncReviewWaitingButtons() {
    const onWaiting = accountsFilter === 'waiting';
    ['accountsReviewWaitingBtn', 'adminGlobalReviewWaitingBtn'].forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn) {
            return;
        }
        btn.textContent = t(onWaiting ? 'showAllAccounts' : 'reviewWaiting');
        btn.title = t(onWaiting ? 'showAllAccountsTitle' : 'reviewWaitingTitle');
        btn.setAttribute('aria-pressed', onWaiting ? 'true' : 'false');
    });
}

function setAccountsFilter(nextFilter) {
    accountsFilter = nextFilter || 'all';
    document.querySelectorAll('.admin-filter-chip').forEach((c) => {
        c.classList.toggle('is-active', c.getAttribute('data-filter') === accountsFilter);
    });
    syncReviewWaitingButtons();
    renderUsersTable();
    saveAdminSessionState();
}

function updateAccountsTabBadge(waitingCount) {
    const tab = document.getElementById('adminTabAccounts');
    if (!tab) {
        return;
    }
    const base = t('navAccounts');
    tab.textContent = waitingCount > 0 ? base + ' (' + waitingCount + ')' : base;
}

async function loadAccessRequestsBanner() {
    const canNotify =
        adminHasPerm('manage_users') || adminHasPerm('manage_calendar_access');
    if (!canNotify) {
        return;
    }
    const banners = [
        { el: document.getElementById('accountsAccessBanner'), text: document.getElementById('accountsAccessBannerText') },
        { el: document.getElementById('adminGlobalAccessBanner'), text: document.getElementById('adminGlobalAccessBannerText') }
    ];
    try {
        const data = await api('/admin/access-requests');
        const count = data && data.count != null ? Number(data.count) : 0;
        updateAccountsTabBadge(count);
        const msg = count === 1 ? t('accessBannerOne') : count > 0 ? t('accessBannerMany', { count: String(count) }) : '';
        if (count > lastAccessRequestCount && lastAccessRequestCount > 0) {
            showAdminSaveNotice(t('accessBannerNew'), false);
        }
        lastAccessRequestCount = count;
        banners.forEach((b) => {
            if (!b.el || !b.text) {
                return;
            }
            if (count > 0) {
                b.el.hidden = false;
                b.text.textContent = msg;
            } else {
                b.el.hidden = true;
            }
        });
    } catch (_) {
        banners.forEach((b) => {
            if (b.el) {
                b.el.hidden = true;
            }
        });
    }
}

function setupAccountsToolbar() {
    const search = document.getElementById('accountsSearchInput');
    if (search && search.dataset.bound !== '1') {
        search.dataset.bound = '1';
        search.addEventListener('input', () => {
            accountsSearchQuery = search.value || '';
            renderUsersTable();
            saveAdminSessionState();
        });
    }
    document.querySelectorAll('.admin-filter-chip').forEach((chip) => {
        if (chip.dataset.bound === '1') {
            return;
        }
        chip.dataset.bound = '1';
        chip.addEventListener('click', () => {
            setAccountsFilter(chip.getAttribute('data-filter') || 'all');
        });
    });
    function goReviewWaiting() {
        const nextFilter = accountsFilter === 'waiting' ? 'all' : 'waiting';
        if (!adminTabVisible('accounts')) {
            if (adminTabVisible('calendars')) {
                switchAdminTab('calendars');
            }
            return;
        }
        switchAdminTab('accounts');
        setAccountsFilter(nextFilter);
    }
    ['accountsReviewWaitingBtn', 'adminGlobalReviewWaitingBtn'].forEach((id) => {
        const reviewBtn = document.getElementById(id);
        if (reviewBtn && reviewBtn.dataset.bound !== '1') {
            reviewBtn.dataset.bound = '1';
            reviewBtn.addEventListener('click', goReviewWaiting);
        }
    });
    if (typeof window !== 'undefined') {
        window.syncAdminReviewWaitingButtons = syncReviewWaitingButtons;
    }
    syncReviewWaitingButtons();
}

function startAdminAccessPoll() {
    if (adminAccessPollTimer) {
        clearInterval(adminAccessPollTimer);
    }
    adminAccessPollTimer = setInterval(() => {
        if (document.hidden || !currentAdminId) {
            return;
        }
        loadAccessRequestsBanner().catch(() => {});
    }, 60000);
}

function renderAccessLevelGrid(container, items, namePrefix, accessPayload, labelKey, idField) {
    container.innerHTML = '';
    const key = labelKey || 'displayName';
    const field = idField || (namePrefix.indexOf('Group') >= 0 ? 'groupId' : 'userId');
    const accessById = new Map();
    const listKey = field === 'groupId' ? 'groupAccess' : 'userAccess';
    const legacyKey = field === 'groupId' ? 'groupIds' : 'userIds';
    const rows = (accessPayload && accessPayload[listKey]) || [];
    rows.forEach((a) => {
        if (a && a[field]) {
            accessById.set(a[field], a.accessLevel || 'editor');
        }
    });
    const legacyIds = (accessPayload && accessPayload[legacyKey]) || [];
    (items || []).forEach((item) => {
        const row = document.createElement('div');
        row.className = 'admin-access-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = namePrefix;
        cb.value = item.id;
        const hasDirect = accessById.has(item.id);
        const legacyOn = legacyIds.includes(item.id);
        cb.checked = hasDirect || legacyOn;
        const levelSelect = document.createElement('select');
        levelSelect.setAttribute('aria-label', t('accessLevelLabel'));
        ['viewer', 'suggester', 'editor'].forEach((lvl) => {
            const opt = document.createElement('option');
            opt.value = lvl;
            opt.textContent = accessLevelLabel(lvl);
            levelSelect.appendChild(opt);
        });
        levelSelect.value = accessById.get(item.id) || 'editor';
        levelSelect.disabled = !cb.checked;
        cb.addEventListener('change', () => {
            levelSelect.disabled = !cb.checked;
        });
        const nameSpan = document.createElement('span');
        nameSpan.textContent = item[key] || item.name || item.email || item.id;
        row.appendChild(cb);
        row.appendChild(nameSpan);
        row.appendChild(levelSelect);
        container.appendChild(row);
    });
}

function collectAccessPayloadFromGrid(container, idKey) {
    const out = [];
    container.querySelectorAll('.admin-access-row').forEach((row) => {
        const cb = row.querySelector('input[type="checkbox"]');
        const sel = row.querySelector('select');
        if (!cb || !cb.checked || !cb.value) {
            return;
        }
        const entry = {};
        entry[idKey] = cb.value;
        entry.accessLevel = sel && sel.value ? sel.value : 'editor';
        out.push(entry);
    });
    return out;
}

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
let permissionMeta = null;
let editUserInitialRole = 'teacher';
let editUserPermissionsTouched = false;
let editUserPermissionsInitializing = false;
let addUserPermissionsTouched = false;

function isAdminViewAsMode() {
    return (
        typeof TeamAuth !== 'undefined' &&
        TeamAuth.isViewAsMode &&
        TeamAuth.isViewAsMode()
    );
}

const ADMIN_PAGE_ACCESS_PERMS = [
    'access_admin_page',
    'manage_users',
    'manage_groups',
    'manage_calendar_access',
    'manage_settings',
    'view_presence',
    'view_audit'
];

function targetCanAccessAdmin(u) {
    if (!u || !u.active) {
        return false;
    }
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    return ADMIN_PAGE_ACCESS_PERMS.some((p) => perms.includes(p));
}

function applyAdminViewAsReadOnly() {
    if (!isAdminViewAsMode()) {
        document.documentElement.classList.remove('admin-view-as-readonly');
        return;
    }
    document.documentElement.classList.add('admin-view-as-readonly');
    const hideIds = ['addUserForm', 'addGroupForm', 'lockSettingsForm', 'bootstrapBox'];
    hideIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.hidden = true;
            el.setAttribute('aria-hidden', 'true');
        }
    });
    const calSaveBtn = document.querySelector('#calendarAccessForm button[type="submit"]');
    if (calSaveBtn) {
        calSaveBtn.hidden = true;
        calSaveBtn.disabled = true;
    }
    showAdminSaveNotice(t('viewAsReadOnlyNotice'), false);
}

async function openViewAsExchangeTab(exchangeToken, page) {
    const url = page + '?viewAsExchange=' + encodeURIComponent(exchangeToken);
    window.open(url, '_blank', 'noopener,noreferrer');
}

async function startViewAsExchange(userId) {
    return api('/admin/view-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
    });
}

function isCurrentUserSuperAdmin() {
    const me = typeof TeamAuth !== 'undefined' ? TeamAuth.getUser() : null;
    if (!me) {
        return false;
    }
    return normalizeRoleKey(me.role) === 'super_admin';
}

function normalizeRoleKey(role) {
    return role === 'admin' ? 'super_admin' : role || 'teacher';
}

async function ensurePermissionMeta() {
    if (!isCurrentUserSuperAdmin()) {
        return null;
    }
    if (permissionMeta) {
        return permissionMeta;
    }
    try {
        permissionMeta = await api('/admin/permission-meta');
    } catch (_) {
        permissionMeta = null;
    }
    return permissionMeta;
}

function applySuperAdminRoleOptionVisibility(selectEl) {
    if (!selectEl) {
        return;
    }
    const opt = selectEl.querySelector('option[value="super_admin"]');
    if (opt) {
        const show = isCurrentUserSuperAdmin();
        opt.hidden = !show;
        opt.disabled = !show;
    }
}

function getRolePresetFromMeta(meta, role) {
    if (!meta || !meta.rolePresets) {
        return [];
    }
    const key = normalizeRoleKey(role);
    return (meta.rolePresets[key] || meta.rolePresets.teacher || []).slice();
}

/** Effective permissions for checkbox UI (API permissions array, else role preset). */
function effectivePermissionsForUser(user, meta, roleFallback) {
    if (Array.isArray(user.permissions)) {
        return user.permissions.slice().sort();
    }
    const role = normalizeRoleKey(roleFallback || user.role);
    return getRolePresetFromMeta(meta, role);
}

function buildPermissionCheckboxes(container, meta, selectedIds) {
    if (!container || !meta || !meta.permissions) {
        return;
    }
    container.innerHTML = '';
    const selected = new Set(selectedIds || []);
    meta.permissions.forEach((def) => {
        const label = document.createElement('label');
        label.className = 'admin-perm-check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = def.id;
        cb.checked = selected.has(def.id);
        label.appendChild(cb);
        const span = document.createElement('span');
        span.textContent = t(def.labelKey);
        label.appendChild(span);
        container.appendChild(label);
    });
}

function readPermissionCheckboxes(container) {
    if (!container) {
        return [];
    }
    const ids = [];
    container.querySelectorAll('input[type="checkbox"]:checked').forEach((cb) => {
        ids.push(cb.value);
    });
    return ids.sort();
}

function setPermissionCheckboxes(container, ids) {
    if (!container) {
        return;
    }
    const set = new Set(ids || []);
    container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = set.has(cb.value);
    });
}

function clientRequiresElevationConfirm(role, previousRole, selectedPerms, meta) {
    const next = normalizeRoleKey(role);
    const prev = normalizeRoleKey(previousRole);
    if (next === 'super_admin' && prev !== 'super_admin') {
        return true;
    }
    if (next === 'super_admin') {
        return false;
    }
    if (!meta || !meta.superAdminPermissionIds) {
        return false;
    }
    const sa = meta.superAdminPermissionIds.slice().sort();
    const sel = (selectedPerms || []).slice().sort();
    if (sel.length !== sa.length) {
        return false;
    }
    for (let i = 0; i < sa.length; i++) {
        if (sel[i] !== sa[i]) {
            return false;
        }
    }
    return true;
}

function updateEditUserElevationUi() {
    const box = document.getElementById('editUserElevationBox');
    const roleEl = document.getElementById('editUserRole');
    const list = document.getElementById('editUserPermissionsList');
    const section = document.getElementById('editUserPermissionsSection');
    if (!box || !roleEl || !section || section.hidden) {
        if (box) {
            box.hidden = true;
        }
        return;
    }
    box.hidden = !clientRequiresElevationConfirm(
        roleEl.value,
        editUserInitialRole,
        readPermissionCheckboxes(list),
        permissionMeta
    );
}

function updateAddUserElevationUi() {
    const box = document.getElementById('addUserElevationBox');
    const roleEl = document.getElementById('newRole');
    const list = document.getElementById('addUserPermissionsList');
    const section = document.getElementById('addUserPermissionsSection');
    if (!box || !roleEl || !section || section.hidden) {
        if (box) {
            box.hidden = true;
        }
        return;
    }
    box.hidden = !clientRequiresElevationConfirm(
        roleEl.value,
        'teacher',
        readPermissionCheckboxes(list),
        permissionMeta
    );
}

function appendPermissionsToBody(body, role, listEl, sectionEl, confirmEl, previousRole) {
    if (!isCurrentUserSuperAdmin() || !sectionEl || sectionEl.hidden || !listEl) {
        return;
    }
    const perms = readPermissionCheckboxes(listEl);
    body.permissions = perms;
    if (clientRequiresElevationConfirm(role, previousRole, perms, permissionMeta)) {
        const pwd = confirmEl && confirmEl.value ? confirmEl.value : '';
        if (!pwd) {
            throw new Error(t('elevationPasswordRequired'));
        }
        body.confirmPassword = pwd;
    }
}

async function prepareEditUserPermissions(user) {
    const section = document.getElementById('editUserPermissionsSection');
    const list = document.getElementById('editUserPermissionsList');
    const elevation = document.getElementById('editUserElevationBox');
    const confirmInput = document.getElementById('editUserConfirmPassword');
    const roleEl = document.getElementById('editUserRole');
    const displayRole = normalizeRoleKey(roleEl ? roleEl.value : user.role);
    editUserInitialRole = normalizeRoleKey(user.role);
    editUserPermissionsTouched = false;
    if (confirmInput) {
        confirmInput.value = '';
    }
    applySuperAdminRoleOptionVisibility(roleEl);
    if (!isCurrentUserSuperAdmin() || editUserInitialRole === 'super_admin') {
        if (section) {
            section.hidden = true;
        }
        if (elevation) {
            elevation.hidden = true;
        }
        return;
    }
    const meta = await ensurePermissionMeta();
    if (!meta || !section || !list) {
        if (section) {
            section.hidden = true;
        }
        return;
    }
    section.hidden = false;
    editUserPermissionsInitializing = true;
    try {
        const initialPerms = effectivePermissionsForUser(user, meta, displayRole);
        buildPermissionCheckboxes(list, meta, initialPerms);
        updateEditUserElevationUi();
    } finally {
        editUserPermissionsInitializing = false;
    }
}

async function prepareAddUserPermissions() {
    const section = document.getElementById('addUserPermissionsSection');
    const list = document.getElementById('addUserPermissionsList');
    const elevation = document.getElementById('addUserElevationBox');
    const confirmInput = document.getElementById('addUserConfirmPassword');
    addUserPermissionsTouched = false;
    applySuperAdminRoleOptionVisibility(document.getElementById('newRole'));
    if (confirmInput) {
        confirmInput.value = '';
    }
    if (!isCurrentUserSuperAdmin()) {
        if (section) {
            section.hidden = true;
        }
        if (elevation) {
            elevation.hidden = true;
        }
        return;
    }
    const meta = await ensurePermissionMeta();
    if (!meta || !section || !list) {
        if (section) {
            section.hidden = true;
        }
        return;
    }
    section.hidden = false;
    const roleEl = document.getElementById('newRole');
    const role = roleEl ? roleEl.value : 'teacher';
    buildPermissionCheckboxes(list, meta, getRolePresetFromMeta(meta, role));
    updateAddUserElevationUi();
}

function setupPermissionsUiHandlers() {
    const editRole = document.getElementById('editUserRole');
    const editList = document.getElementById('editUserPermissionsList');
    if (editRole && editRole.dataset.permBound !== '1') {
        editRole.dataset.permBound = '1';
        editRole.addEventListener('change', () => {
            if (editUserPermissionsInitializing) {
                return;
            }
            if (!editUserPermissionsTouched && permissionMeta) {
                setPermissionCheckboxes(
                    editList,
                    getRolePresetFromMeta(permissionMeta, editRole.value)
                );
            }
            updateEditUserElevationUi();
        });
    }
    if (editList && editList.dataset.permBound !== '1') {
        editList.dataset.permBound = '1';
        editList.addEventListener('change', () => {
            editUserPermissionsTouched = true;
            updateEditUserElevationUi();
        });
    }
    const newRole = document.getElementById('newRole');
    const addList = document.getElementById('addUserPermissionsList');
    if (newRole && newRole.dataset.permBound !== '1') {
        newRole.dataset.permBound = '1';
        newRole.addEventListener('change', () => {
            if (!addUserPermissionsTouched && permissionMeta) {
                setPermissionCheckboxes(
                    addList,
                    getRolePresetFromMeta(permissionMeta, newRole.value)
                );
            }
            updateAddUserElevationUi();
        });
    }
    if (addList && addList.dataset.permBound !== '1') {
        addList.dataset.permBound = '1';
        addList.addEventListener('change', () => {
            addUserPermissionsTouched = true;
            updateAddUserElevationUi();
        });
    }
}

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
    applyAdminTabVisibility();
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

async function openEditUserModal(user, triggerEl) {
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
    try {
        await prepareEditUserPermissions(user);
    } catch (_) {
        /* still open modal */
    }
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
            const role = document.getElementById('editUserRole')?.value || 'teacher';
            const patchBody = {
                displayName,
                email: document.getElementById('editUserEmail')?.value.trim() || null,
                kakaoUserId: document.getElementById('editUserKakaoId')?.value.trim() || null,
                role
            };
            appendPermissionsToBody(
                patchBody,
                role,
                document.getElementById('editUserPermissionsList'),
                document.getElementById('editUserPermissionsSection'),
                document.getElementById('editUserConfirmPassword'),
                editUserInitialRole
            );
            await api('/admin/users/' + encodeURIComponent(id), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patchBody)
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

async function openViewAsUser(u) {
    const name = u.displayName || u.email || u.id;
    try {
        const result = await startViewAsExchange(u.id);
        const exchangeToken = result.exchangeToken;
        if (!targetCanAccessAdmin(u)) {
            if (!confirm(t('viewAsNoAdminAccess', { name }))) {
                return;
            }
            await openViewAsExchangeTab(exchangeToken, '/index.html');
            return;
        }
        if (!confirm(t('confirmViewAs', { name }))) {
            return;
        }
        await openViewAsExchangeTab(exchangeToken, '/admin.html');
    } catch (ex) {
        showAdminSaveNotice(ex.message, true);
    }
}

function buildUserActionItems(u, activeSuperAdminCount, isSelf) {
    if (isAdminViewAsMode()) {
        return [];
    }
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
        if (!isSelf && isCurrentUserSuperAdmin()) {
            const isSuperTarget = u.role === 'admin' || u.role === 'super_admin';
            if (!isSuperTarget) {
                items.push({
                    label: t('viewAs'),
                    title: t('viewAsAdminTitle'),
                    onClick: () => openViewAsUser(u)
                });
            }
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
    cachedAllUsers = await api('/admin/users');
    renderUsersTable();
    await loadAccessRequestsBanner();
}

function renderUsersTable() {
    const body = document.getElementById('usersBody');
    if (!body) {
        return;
    }
    body.innerHTML = '';
    const users = cachedAllUsers || [];
    const activeSuperAdminCount = countActiveSuperAdmins(users);
    const filtered = users.filter((u) => userMatchesAccountsFilter(u) && userMatchesAccountsSearch(u));

    if (!filtered.length) {
        renderEmptyRow(body, 7, users.length ? 'emptyUsersFilter' : 'emptyUsers');
        return;
    }

    filtered.forEach((u) => {
        const tr = document.createElement('tr');
        const roleLabel = roleDisplayLabel(u.role);
        let roleHtml = escapeHtml(roleLabel);
        if (u.customPermissions && u.customPermissions.length) {
            roleHtml +=
                ' <span class="badge-custom-perms">' + escapeHtml(t('customPermissionsBadge')) + '</span>';
        }
        tr.innerHTML =
            '<td>' +
            escapeHtml(u.displayName) +
            '</td><td>' +
            escapeHtml(u.email || '—') +
            '</td><td>' +
            escapeHtml(u.kakaoUserId || '—') +
            '</td><td>' +
            roleHtml +
            '</td><td>' +
            formatCalendarSummaryCell(u) +
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
        if (!isAdminViewAsMode()) {
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
        } else {
            cell.textContent = '—';
        }
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
    if (isAdminViewAsMode()) {
        return;
    }
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
    const allUsers = cachedAllUsers.length ? cachedAllUsers : await api('/admin/users');
    const teachers = allUsers.filter((u) => u.active);
    renderAccessLevelGrid(
        document.getElementById('accessTeachersGrid'),
        teachers,
        'accessTeacher',
        access,
        'displayName',
        'userId'
    );
    renderAccessLevelGrid(
        document.getElementById('accessGroupsGrid'),
        cachedGroups.length ? cachedGroups : await api('/admin/groups'),
        'accessGroup',
        access,
        'name',
        'groupId'
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
        if (adminHasPerm('manage_users') || adminHasPerm('manage_calendar_access')) {
            await loadAccessRequestsBanner();
        }
        if (adminTabVisible('monitor')) {
            await loadPresence();
            await loadActivity();
        }
    } finally {
        refreshInFlight -= 1;
        setSessionStatus(sessionStatusText);
    }
}

function setupAdminNav(signedIn) {
    const nav = document.getElementById('adminNav');
    const signInLink = document.getElementById('adminSignInLink');
    const tabBar = document.getElementById('adminTabBar');
    if (tabBar) {
        tabBar.hidden = !signedIn;
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
        Object.keys(ADMIN_TAB_CONFIG).forEach((key) => {
            const el = document.getElementById(ADMIN_TAB_CONFIG[key].panelId);
            if (el) {
                el.hidden = true;
            }
        });
        const bar = document.getElementById('adminTabBar');
        if (bar) {
            bar.hidden = true;
        }
        return;
    }
    applyAdminTabVisibility();
    const tab =
        (adminTabVisible(activeAdminTab) && activeAdminTab) ||
        resolveAdminTabFromHash() ||
        firstVisibleAdminTab();
    if (tab) {
        switchAdminTab(tab, { skipHash: false });
    }
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

async function fetchAdminHealth() {
    try {
        const res = await fetch('/api/health', { credentials: 'same-origin' });
        if (res.ok) {
            return await res.json();
        }
    } catch (_) {
        /* ignore */
    }
    return {};
}

function getDevOpenAccessAdminUser() {
    return {
        id: 'dev-open',
        email: 'dev@local',
        displayName: 'Dev Teacher',
        role: 'admin',
        canAccessAdmin: true
    };
}

function showBootstrapSetup() {
    setupAdminNav(false);
    showAdminSections(false);
    setSessionStatus('');
    document.getElementById('bootstrapBox').style.display = 'block';
}

function setupBootstrapForm() {
    const btn = document.getElementById('bootstrapBtn');
    if (!btn || btn.dataset.bound === '1') {
        return;
    }
    btn.dataset.bound = '1';
    const defaultLabel = btn.textContent;
    btn.addEventListener('click', async () => {
        const email = document.getElementById('bootstrapEmail')?.value.trim() || '';
        if (!email) {
            showAdminSaveNotice(t('bootstrapEmailRequired') || 'Email is required.', true);
            return;
        }
        btn.disabled = true;
        btn.textContent = t('bootstrapCreating') || 'Creating…';
        try {
            await api('/admin/bootstrap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    secret: document.getElementById('bootstrapSecret')?.value || '',
                    email,
                    displayName: document.getElementById('bootstrapName')?.value.trim() || '',
                    password: document.getElementById('bootstrapPassword')?.value || undefined
                })
            });
            showAdminSaveNotice(t('adminCreated'), false);
            location.reload();
        } catch (ex) {
            showAdminSaveNotice(ex.message, true);
            btn.disabled = false;
            btn.textContent = defaultLabel;
        }
    });
}

async function resolveAdminUser() {
    const health = await fetchAdminHealth();

    if (health.needsBootstrap) {
        try {
            const me = await api('/auth/me');
            if (me && me.id) {
                return me;
            }
        } catch (_) {
            /* no session yet — show first-time setup */
        }
        return { needsBootstrap: true };
    }

    let me = null;
    if (typeof TeamAuth !== 'undefined' && TeamAuth.ensure) {
        me = await TeamAuth.ensure();
    }

    if (!me && health.openAccess) {
        return getDevOpenAccessAdminUser();
    }

    if (!me) {
        return await api('/auth/me');
    }

    return me;
}

async function init() {
    setupActionMenuCloseOnOutside();
    setupEditUserModal();
    setupResetPasswordModal();
    setupLockSettingsForm();
    setupAdminTabs();
    setupAccountsToolbar();
    setupBootstrapForm();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && currentAdminId) {
            refreshAll().catch(() => {});
        }
    });
    try {
        const resolved = await resolveAdminUser();
        if (resolved && resolved.needsBootstrap) {
            showBootstrapSetup();
            return;
        }
        const me = resolved;
        if (!me || !me.id) {
            throw new Error('Not signed in');
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
        restoreAdminSessionState();
        showAdminSections(true);
        applyAdminTabVisibility();
        if (isCurrentUserSuperAdmin()) {
            ensurePermissionMeta()
                .then(() => {
                    setupPermissionsUiHandlers();
                    return prepareAddUserPermissions();
                })
                .catch(() => {});
        } else {
            applySuperAdminRoleOptionVisibility(document.getElementById('newRole'));
            applySuperAdminRoleOptionVisibility(document.getElementById('editUserRole'));
        }
        startAdminAccessPoll();
        if (typeof ViewAsBanner !== 'undefined' && ViewAsBanner.renderViewAsBanner) {
            ViewAsBanner.renderViewAsBanner(me);
        }
        applyAdminViewAsReadOnly();
        setSessionStatus(
            isAdminViewAsMode() && me.viewAs && me.viewAs.targetDisplayName
                ? t('viewAsReadOnlyNotice') + ' ' + me.viewAs.targetDisplayName
                : t('signedInAs', { name: currentAdminDisplayName })
        );
        document.getElementById('bootstrapBox').style.display = 'none';
        if (typeof AdminI18n !== 'undefined' && AdminI18n.applyAdminLanguage) {
            AdminI18n.applyAdminLanguage();
        }
        if (typeof TeamAuth !== 'undefined' && TeamAuth.startIdleWatch && !isAdminViewAsMode()) {
            TeamAuth.startIdleWatch();
        }
        await refreshAll();
        if (typeof CCPSessionRestore !== 'undefined' && CCPSessionRestore.capturePageSession) {
            CCPSessionRestore.capturePageSession();
        }
    } catch (err) {
        if (err && err.message === 'redirect') {
            return;
        }
        setupAdminNav(false);
        showAdminSections(false);
        if (err.message.includes('Not signed in') || err.message.includes('401')) {
            const health = await fetchAdminHealth();
            if (health.needsBootstrap) {
                showBootstrapSetup();
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
            const role = document.getElementById('newRole').value;
            const createBody = {
                displayName: document.getElementById('newDisplayName').value.trim(),
                email: email || undefined,
                kakaoUserId: kakaoUserId || undefined,
                role,
                password: document.getElementById('newPassword').value || undefined
            };
            appendPermissionsToBody(
                createBody,
                role,
                document.getElementById('addUserPermissionsList'),
                document.getElementById('addUserPermissionsSection'),
                document.getElementById('addUserConfirmPassword'),
                'teacher'
            );
            await api('/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createBody)
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
            const teachersGrid = document.getElementById('accessTeachersGrid');
            const groupsGrid = document.getElementById('accessGroupsGrid');
            const userAccess = collectAccessPayloadFromGrid(teachersGrid, 'userId');
            const groupAccess = collectAccessPayloadFromGrid(groupsGrid, 'groupId');
            await api('/admin/calendars/' + encodeURIComponent(calId) + '/access', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userAccess, groupAccess })
            });
            const calLabel =
                document.getElementById('accessCalendarSelect')?.selectedOptions?.[0]?.textContent || calId;
            await loadCalendarAccessUI();
            showAdminSaveNotice(t('savedCalendarAccess', { name: calLabel }), false);
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
