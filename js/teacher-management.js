/**
 * Teachers tab — timetable preview only; assignments on Cohorts setup board.
 */
(function (global) {
    let hooks = null;

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function getApi() {
        return global.CCPTeacherTimetable || null;
    }

    function canAccessTeacherManagementTab() {
        if (typeof global.TeamAuth === 'undefined' || !global.TeamAuth.getUser) {
            return false;
        }
        const user = global.TeamAuth.getUser();
        if (!user) {
            return false;
        }
        if (global.TeamAuth.canAccessAdmin && global.TeamAuth.canAccessAdmin()) {
            return true;
        }
        const role = user.role === 'admin' ? 'super_admin' : (user.role || 'teacher');
        if (role === 'super_admin' || role === 'head_teacher') {
            return true;
        }
        return global.TeamAuth.hasPermission('manage_calendar_access');
    }

    function syncTabVisibility() {
        const btn = document.getElementById('tabBtn-teachers');
        if (!btn) {
            return;
        }
        const show = canAccessTeacherManagementTab();
        btn.hidden = !show;
        btn.style.display = show ? '' : 'none';
        if (!show && hooks && hooks.getActiveTab() === 'teachers') {
            hooks.navigateToTab('calendar');
        }
    }

    function getSelector() {
        if (!hooks) {
            return null;
        }
        return hooks.getTeacherSelector();
    }

    function escapeHtml(s) {
        if (hooks && hooks.escapeHtml) {
            return hooks.escapeHtml(s);
        }
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function renderTeacherList() {
        const list = document.getElementById('teachersTabTeacherList');
        if (!list || !hooks) {
            return;
        }
        const q = normalizeStr(document.getElementById('teachersTabTeacherSearch')?.value).toLowerCase();
        const active = getSelector();
        list.innerHTML = '';
        const teachers = hooks.listTeachers();
        const filtered = teachers.filter((row) => {
            if (!q) {
                return true;
            }
            const hay = [row.displayName, row.userId, row.email].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
        if (!filtered.length) {
            const empty = document.createElement('p');
            empty.className = 'module-list-empty';
            empty.textContent = q ? hooks.t('lessonFilterSearchEmpty') : hooks.t('timetableTeachersListEmpty');
            list.appendChild(empty);
            return;
        }
        filtered.forEach((row) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const api = getApi();
            const isSelected = active && api && api.teacherMatchesTeacherRef(
                { userId: row.userId, displayName: row.displayName },
                active
            );
            btn.className = 'module-list-item' + (isSelected ? ' is-selected' : '');
            btn.setAttribute('role', 'option');
            btn.setAttribute('aria-selected', String(isSelected));
            btn.innerHTML = `<span>${escapeHtml(hooks.formatTeacherLabel(row))}</span>`;
            btn.addEventListener('click', () => {
                hooks.selectTeacher({ userId: row.userId, displayName: row.displayName });
                renderAll();
            });
            list.appendChild(btn);
        });
    }

    function renderPreview() {
        const mount = document.getElementById('teachersTabPreviewMount');
        const hint = document.getElementById('teachersTabPreviewHint');
        if (!mount || !hooks) {
            return;
        }
        const selector = getSelector();
        const api = getApi();
        if (!selector || !api) {
            mount.innerHTML = '';
            if (hint) {
                hint.hidden = false;
            }
            return;
        }
        if (hint) {
            hint.hidden = true;
        }
        hooks.renderTimetablePreviewInto(mount, selector);
    }

    function renderAll() {
        renderTeacherList();
        renderPreview();
    }

    function bindOnce() {
        if (document.body.dataset.teachersTabBound === '1') {
            return;
        }
        document.body.dataset.teachersTabBound = '1';

        document.getElementById('teachersTabTeacherSearch')?.addEventListener('input', () => renderTeacherList());

        document.getElementById('teachersTabManageCohortsLink')?.addEventListener('click', (e) => {
            e.preventDefault();
            hooks.navigateToTab('cohorts', { host: 'setup' });
        });

        document.getElementById('teachersTabOpenTimetableBtn')?.addEventListener('click', () => {
            const sel = getSelector();
            if (sel && hooks) {
                hooks.openInTimetableTab(sel);
            }
        });
        document.getElementById('teachersTabFilterCalendarBtn')?.addEventListener('click', () => {
            const sel = getSelector();
            if (sel && hooks) {
                hooks.filterCalendarToTeacher(sel);
            }
        });
    }

    function initTab(h) {
        hooks = h;
        bindOnce();
        syncTabVisibility();
    }

    function onTabActivated() {
        if (!hooks) {
            return;
        }
        void hooks.ensureTeacherAccounts().then(() => {
            renderAll();
        });
    }

    function onCalendarDataChanged() {
        if (hooks && hooks.getActiveTab() === 'teachers') {
            renderAll();
        }
    }

    global.CCPTeacherManagement = {
        canAccessTeacherManagementTab,
        syncTabVisibility,
        initTab,
        onTabActivated,
        onCalendarDataChanged
    };
})(typeof window !== 'undefined' ? window : globalThis);
