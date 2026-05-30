/**
 * Curriculum workspace page — homework copy + book editor (uses app.js data layer).
 */
(function () {
    let workspaceBooksSelectedId = null;
    let workspacePollTimer = null;

    function getParams() {
        return new URLSearchParams(location.search);
    }

    function switchWorkspaceTab(tabId) {
        document.querySelectorAll('.workspace-tab-btn').forEach((btn) => {
            const on = btn.dataset.wsTab === tabId;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.querySelectorAll('.workspace-panel').forEach((panel) => {
            const on = panel.dataset.wsPanel === tabId;
            panel.classList.toggle('is-active', on);
            panel.hidden = !on;
        });
        if (tabId === 'books') {
            refreshWorkspaceBooksPanel();
        } else if (tabId === 'homework' && typeof renderHomeworkEditor === 'function') {
            renderHomeworkEditor();
        }
    }

    function refreshWorkspaceBooksPanel() {
        const list = document.getElementById('workspaceBooksList');
        const mount = document.getElementById('workspaceBooksEditorMount');
        if (!window.CCPBooksEditor || !list || !mount) {
            return;
        }
        const params = getParams();
        const bookParam = params.get('book');
        if (bookParam && !workspaceBooksSelectedId) {
            workspaceBooksSelectedId = bookParam;
        }
        window.CCPBooksEditor.renderFullPageBookList(list, workspaceBooksSelectedId);
        if (workspaceBooksSelectedId) {
            window.CCPBooksEditor.renderFullPageEditor(mount, workspaceBooksSelectedId, {
                onSaved: () => {
                    if (typeof renderHomeworkEditor === 'function') {
                        renderHomeworkEditor();
                    }
                }
            });
        }
    }

    function bindWorkspaceTabs() {
        document.querySelectorAll('.workspace-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.wsTab;
                if (tab) {
                    switchWorkspaceTab(tab);
                }
            });
        });
        const list = document.getElementById('workspaceBooksList');
        if (list && list.dataset.bound !== '1') {
            list.dataset.bound = '1';
            list.addEventListener('click', (e) => {
                const item = e.target.closest('.workspace-book-list-item');
                if (!item || !item.dataset.bookId) {
                    return;
                }
                workspaceBooksSelectedId = item.dataset.bookId;
                refreshWorkspaceBooksPanel();
            });
        }
        const editBookBtn = document.getElementById('homeworkEditBookBtn');
        if (editBookBtn && editBookBtn.dataset.bound !== '1') {
            editBookBtn.dataset.bound = '1';
            editBookBtn.addEventListener('click', () => {
                const bookId =
                    typeof getBookIdForSelectedHomeworkClass === 'function'
                        ? getBookIdForSelectedHomeworkClass()
                        : null;
                if (bookId) {
                    workspaceBooksSelectedId = bookId;
                }
                switchWorkspaceTab('books');
                refreshWorkspaceBooksPanel();
            });
        }
    }

    function setupWorkspaceChrome() {
        const label = document.getElementById('workspaceCalendarLabel');
        if (label && typeof appData !== 'undefined') {
            label.textContent = appData.calendarName || '';
        }
        const langBtn = document.getElementById('workspaceLangToggle');
        if (langBtn && langBtn.dataset.bound !== '1') {
            langBtn.dataset.bound = '1';
            langBtn.addEventListener('click', () => {
                if (typeof toggleLanguage === 'function') {
                    toggleLanguage();
                }
            });
        }
        const themeBtn = document.getElementById('workspaceThemeToggle');
        if (themeBtn && themeBtn.dataset.bound !== '1') {
            themeBtn.dataset.bound = '1';
            themeBtn.addEventListener('click', () => {
                if (typeof toggleTheme === 'function') {
                    toggleTheme();
                }
            });
        }
        const reloadBtn = document.getElementById('workspaceReloadBtn');
        if (reloadBtn && reloadBtn.dataset.bound !== '1') {
            reloadBtn.dataset.bound = '1';
            reloadBtn.addEventListener('click', async () => {
                if (typeof reloadWorkspaceCalendar === 'function') {
                    await reloadWorkspaceCalendar();
                }
            });
        }
    }

    function startWorkspaceRevisionPoll() {
        /* CalendarSync polling + onRemoteNewer in app.js shows workspaceRemoteBanner */
    }

    window.initWorkspacePage = async function initWorkspacePage() {
        loadLanguage();
        loadTheme();
        if (typeof TeamAuth !== 'undefined' && location.protocol !== 'file:') {
            try {
                await TeamAuth.ensure();
            } catch (e) {
                if (e && e.message === 'redirect') {
                    return;
                }
            }
        }
        if (typeof CCPLoader !== 'undefined' && CCPLoader.loadExtensionScripts) {
            await CCPLoader.loadExtensionScripts();
        }
        loadData();
        if (typeof initDefaultClassEditorModule === 'function') {
            initDefaultClassEditorModule();
        }
        if (typeof initBooksEditorModule === 'function') {
            initBooksEditorModule();
        }
        const teamStatus = document.getElementById('teamSyncStatus');
        if (teamStatus && typeof updateTeamSyncStatus === 'function') {
            updateTeamSyncStatus('syncing');
        }
        await initTeamSync();
        applyLanguage();
        initHomeworkTabControls();
        initHomeworkTabListeners();
        renderHomeworkClassList();
        renderHomeworkEditor();
        bindWorkspaceTabs();
        setupWorkspaceChrome();
        const params = getParams();
        const tab = params.get('tab') === 'books' ? 'books' : 'homework';
        if (params.get('book')) {
            workspaceBooksSelectedId = params.get('book');
        }
        switchWorkspaceTab(tab);
    };

    document.addEventListener('DOMContentLoaded', () => {
        if (!document.body.classList.contains('workspace-page')) {
            return;
        }
        if (typeof initWorkspacePage === 'function') {
            initWorkspacePage();
        }
    });
})();
