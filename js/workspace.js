/**
 * Curriculum workspace page — homework copy + book editor (uses app.js data layer).
 */
(function () {
    let workspaceBooksSelectedId = null;

    function getParams() {
        return new URLSearchParams(location.search);
    }

    function showWorkspaceInitError(message) {
        const banner = document.getElementById('workspaceRemoteBanner');
        if (!banner) {
            return;
        }
        const textEl = banner.querySelector('[data-i18n="workspaceRemoteNewer"]')
            || banner.querySelector('span');
        if (textEl) {
            textEl.textContent = message || '';
        }
        banner.hidden = false;
    }

    function hideWorkspaceInitError() {
        const banner = document.getElementById('workspaceRemoteBanner');
        if (!banner) {
            return;
        }
        if (
            typeof CalendarSync !== 'undefined'
            && CalendarSync.state
            && CalendarSync.state.remoteNewer
        ) {
            return;
        }
        banner.hidden = true;
    }

    function showWorkspaceEmptyState() {
        if (typeof appData === 'undefined' || !Array.isArray(appData.classes) || appData.classes.length > 0) {
            return;
        }
        const label = document.getElementById('workspaceCalendarLabel');
        const failMsg = typeof t === 'function' ? t('workspaceLoadFailed') : 'Could not load calendar.';
        if (label && !String(label.textContent || '').trim()) {
            label.textContent = failMsg;
        }
        const empty = document.getElementById('homeworkEditorEmpty');
        if (empty) {
            empty.textContent = failMsg;
            empty.hidden = false;
        }
        const content = document.getElementById('homeworkEditorContent');
        if (content) {
            content.hidden = true;
        }
    }

    function saveWorkspaceSessionState() {
        if (typeof CCPSessionRestore === 'undefined') {
            return;
        }
        const activeTab = document.querySelector('.workspace-tab-btn.is-active')?.dataset.wsTab || 'homework';
        if (CCPSessionRestore.saveWorkspaceSession) {
            CCPSessionRestore.saveWorkspaceSession({
                tab: activeTab,
                bookId: workspaceBooksSelectedId || ''
            });
        }
        if (CCPSessionRestore.capturePageSession) {
            CCPSessionRestore.capturePageSession();
        }
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
        saveWorkspaceSessionState();
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
        const searchQuery = (document.getElementById('workspaceBooksListSearch')?.value || '').trim();
        window.CCPBooksEditor.renderFullPageBookList(list, workspaceBooksSelectedId, { searchQuery });
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
        const booksSearch = document.getElementById('workspaceBooksListSearch');
        if (booksSearch && booksSearch.dataset.bound !== '1') {
            booksSearch.dataset.bound = '1';
            booksSearch.addEventListener('input', () => refreshWorkspaceBooksPanel());
        }
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
                saveWorkspaceSessionState();
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
            label.textContent = appData.calendarName || label.textContent || '';
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

    function renderWorkspaceHomeworkUi() {
        if (typeof refreshWorkspaceHomeworkUi === 'function') {
            refreshWorkspaceHomeworkUi();
            return;
        }
        if (typeof initHomeworkTabControls === 'function') {
            initHomeworkTabControls();
        }
        if (typeof renderHomeworkClassList === 'function') {
            renderHomeworkClassList();
        }
        if (typeof renderHomeworkEditor === 'function') {
            renderHomeworkEditor();
        }
    }

    window.initWorkspacePage = async function initWorkspacePage() {
        let initError = '';

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

        try {
            if (typeof CCPLoader !== 'undefined' && CCPLoader.loadExtensionScripts) {
                await CCPLoader.loadExtensionScripts();
            }
        } catch (err) {
            console.error('Workspace extension scripts failed:', err);
            initError = typeof t === 'function' ? t('homeworkTabModuleMissing') : 'Homework module did not load.';
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

        try {
            if (typeof initTeamSync === 'function') {
                await initTeamSync();
            }
            if (
                typeof appData !== 'undefined'
                && Array.isArray(appData.classes)
                && appData.classes.length === 0
                && typeof CalendarSync !== 'undefined'
                && CalendarSync.getActiveCalendarId
                && CalendarSync.getActiveCalendarId()
                && typeof reloadActiveCalendarFromServer === 'function'
            ) {
                await reloadActiveCalendarFromServer();
            }
        } catch (err) {
            console.error('Workspace team sync failed:', err);
            const syncMsg = typeof t === 'function' ? t('syncError') : 'Sync error';
            initError = initError || `${syncMsg}: ${err.message || err}`;
            if (teamStatus && typeof updateTeamSyncStatus === 'function') {
                updateTeamSyncStatus('error', err.message || syncMsg);
            }
        }

        try {
            const params = getParams();
            const classIdParam = params.get('classId');
            if (classIdParam && typeof ensureUiState === 'function') {
                ensureUiState();
                appData.ui.homeworkTabClassId = classIdParam;
                if (typeof saveUiStateToLocalStorage === 'function') {
                    saveUiStateToLocalStorage();
                }
            }

            applyLanguage();
            if (typeof initHomeworkTabListeners === 'function') {
                initHomeworkTabListeners();
            }
            renderWorkspaceHomeworkUi();
            bindWorkspaceTabs();
            setupWorkspaceChrome();

            let tab = params.get('tab') === 'books' ? 'books' : 'homework';
            if (params.get('book')) {
                workspaceBooksSelectedId = params.get('book');
            } else if (
                !params.get('tab')
                && typeof CCPSessionRestore !== 'undefined'
                && CCPSessionRestore.getWorkspaceSession
            ) {
                const wsSaved = CCPSessionRestore.getWorkspaceSession();
                if (wsSaved) {
                    if (wsSaved.tab === 'books' || wsSaved.tab === 'homework') {
                        tab = wsSaved.tab;
                    }
                    if (wsSaved.bookId && !workspaceBooksSelectedId) {
                        workspaceBooksSelectedId = wsSaved.bookId;
                    }
                }
            }
            switchWorkspaceTab(tab);

            if (typeof restoreAppSessionState === 'function') {
                restoreAppSessionState();
            }
            if (typeof CCPSessionRestore !== 'undefined' && CCPSessionRestore.capturePageSession) {
                CCPSessionRestore.capturePageSession();
            }

            if (initError) {
                showWorkspaceInitError(initError);
            } else {
                hideWorkspaceInitError();
            }
            showWorkspaceEmptyState();
        } catch (uiErr) {
            console.error('Workspace UI render failed:', uiErr);
            showWorkspaceInitError(
                typeof t === 'function' ? t('workspaceLoadFailed') : 'Could not load workspace.'
            );
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        if (!document.body.classList.contains('workspace-page')) {
            return;
        }
        if (typeof initWorkspacePage === 'function') {
            initWorkspacePage().catch((err) => {
                console.error('initWorkspacePage failed:', err);
                const msg = typeof t === 'function' ? t('workspaceLoadFailed') : 'Could not load workspace.';
                showWorkspaceInitError(msg);
                if (typeof renderHomeworkClassList === 'function') {
                    renderHomeworkClassList();
                }
                showWorkspaceEmptyState();
            });
        }
    });
})();
