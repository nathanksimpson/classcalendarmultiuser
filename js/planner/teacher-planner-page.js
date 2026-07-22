/**
 * Schedule planner satellite page bootstrap (planner.html).
 * Loads calendar via team sync, then mounts CCPTeacherPlannerUi.
 */
(function () {
    function t(key, fallback) {
        if (typeof window.t === 'function') {
            const v = window.t(key);
            if (v) return v;
        }
        return fallback || key;
    }

    function showPlannerRemoteBanner(show) {
        const banner = document.getElementById('plannerRemoteBanner');
        if (banner) banner.hidden = !show;
    }

    function showPlannerInitError(message) {
        const banner = document.getElementById('plannerInitErrorBanner');
        const textEl = document.getElementById('plannerInitErrorText');
        if (textEl) textEl.textContent = message || '';
        if (banner) banner.hidden = !message;
    }

    function hidePlannerInitError() {
        const banner = document.getElementById('plannerInitErrorBanner');
        if (banner) banner.hidden = true;
    }

    function showPlannerSyncHint(message) {
        const el = document.getElementById('plannerSyncHint');
        if (!el) return;
        if (!message) {
            el.hidden = true;
            return;
        }
        el.textContent = message;
        el.hidden = false;
    }

    function updateCalendarLabel() {
        const el = document.getElementById('plannerCalendarLabel');
        if (!el) return;
        const name = (window.appData && window.appData.calendarName)
            || (typeof appData !== 'undefined' && appData && appData.calendarName)
            || '';
        el.textContent = name ? String(name).trim() : '';
    }

    function updateReadOnlyBanner() {
        const banner = document.getElementById('plannerReadOnlyBanner');
        if (!banner) return;
        const readOnly = typeof CalendarSync !== 'undefined'
            && CalendarSync.isReadOnly
            && CalendarSync.isReadOnly();
        banner.hidden = !readOnly;
        const applyBtn = document.getElementById('plannerApplyBtn');
        const genBtn = document.getElementById('plannerGenerateBtn');
        if (applyBtn) applyBtn.disabled = !!readOnly;
        if (genBtn) genBtn.disabled = !!readOnly;
    }

    function setupPlannerChrome() {
        const langBtn = document.getElementById('plannerLangToggle');
        if (langBtn && !langBtn.dataset.bound) {
            langBtn.dataset.bound = '1';
            langBtn.addEventListener('click', () => {
                if (typeof toggleLanguage === 'function') toggleLanguage();
                else if (typeof loadLanguage === 'function') loadLanguage();
                if (typeof applyLanguage === 'function') applyLanguage();
                if (window.CCPTeacherPlannerUi && window.CCPTeacherPlannerUi.render) {
                    window.CCPTeacherPlannerUi.render();
                }
            });
        }
        const themeBtn = document.getElementById('plannerThemeToggle');
        if (themeBtn && !themeBtn.dataset.bound) {
            themeBtn.dataset.bound = '1';
            themeBtn.addEventListener('click', () => {
                if (typeof toggleTheme === 'function') toggleTheme();
                else if (window.CCPThemeToggle && window.CCPThemeToggle.toggle) {
                    window.CCPThemeToggle.toggle();
                }
            });
        }
        const reloadBtn = document.getElementById('plannerReloadBtn');
        if (reloadBtn && !reloadBtn.dataset.bound) {
            reloadBtn.dataset.bound = '1';
            reloadBtn.addEventListener('click', () => {
                if (typeof reloadPlannerCalendar === 'function') {
                    reloadPlannerCalendar();
                } else {
                    location.reload();
                }
            });
        }
        const retryBtn = document.getElementById('plannerInitRetryBtn');
        if (retryBtn && !retryBtn.dataset.bound) {
            retryBtn.dataset.bound = '1';
            retryBtn.addEventListener('click', () => location.reload());
        }
        updateCalendarLabel();
        updateReadOnlyBanner();
    }

    window.refreshPlannerPageUi = function refreshPlannerPageUi() {
        updateCalendarLabel();
        updateReadOnlyBanner();
        if (typeof CalendarSync !== 'undefined' && CalendarSync.state && CalendarSync.state.remoteNewer) {
            showPlannerRemoteBanner(true);
        }
        if (window.CCPTeacherPlannerUi && window.CCPTeacherPlannerUi.render) {
            window.CCPTeacherPlannerUi.render();
        }
    };

    window.initPlannerPage = async function initPlannerPage() {
        let syncWarning = '';

        if (typeof loadLanguage === 'function') loadLanguage();
        if (typeof loadTheme === 'function') loadTheme();

        setupPlannerChrome();

        if (typeof TeamAuth !== 'undefined' && location.protocol !== 'file:') {
            try {
                await TeamAuth.ensure();
            } catch (e) {
                if (e && e.message === 'redirect') return;
            }
        }

        if (typeof loadData === 'function') loadData();

        try {
            if (typeof initTeamSync === 'function') {
                await initTeamSync();
            }
            if (typeof ensureActiveCalendarLoaded === 'function') {
                await ensureActiveCalendarLoaded({
                    forceIfStale:
                        !Array.isArray(appData.classes) || appData.classes.length === 0
                });
            }
        } catch (err) {
            console.error('Planner team sync failed:', err);
            const syncMsg = typeof t === 'function' ? t('syncError') : 'Sync error';
            syncWarning = `${syncMsg}: ${err.message || err}`;
        } finally {
            if (typeof finishTeamSyncBoot === 'function') {
                finishTeamSyncBoot();
            }
        }

        if (typeof TeamAuth !== 'undefined' && location.protocol !== 'file:') {
            try {
                if (typeof ensureTeamTeacherAccountsLoaded === 'function') {
                    await ensureTeamTeacherAccountsLoaded();
                }
            } catch (_) {
                /* optional */
            }
        }

        try {
            if (typeof ensureTermStartData === 'function') ensureTermStartData();
            if (typeof applyLanguage === 'function') applyLanguage();
            setupPlannerChrome();

            if (window.CCPTeacherPlannerUi) {
                if (window.CCPTeacherPlannerUi.init) window.CCPTeacherPlannerUi.init();
                if (window.CCPTeacherPlannerUi.mountPage) window.CCPTeacherPlannerUi.mountPage();
                else if (window.CCPTeacherPlannerUi.render) window.CCPTeacherPlannerUi.render();
            }

            if (typeof CCPSessionRestore !== 'undefined' && CCPSessionRestore.capturePageSession) {
                CCPSessionRestore.capturePageSession();
            }

            hidePlannerInitError();
            if (syncWarning) showPlannerSyncHint(syncWarning);
            else showPlannerSyncHint('');
            updateReadOnlyBanner();
        } catch (uiErr) {
            console.error('Planner UI failed:', uiErr);
            const base = t('plannerLoadFailed', 'Could not load schedule planner.');
            const detail = uiErr && uiErr.message ? ` (${uiErr.message})` : '';
            showPlannerInitError(base + detail);
            if (syncWarning) showPlannerSyncHint(syncWarning);
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        if (!document.body.classList.contains('planner-page')) return;
        if (typeof initPlannerPage === 'function') {
            initPlannerPage().catch((err) => {
                console.error('initPlannerPage failed:', err);
                const base = t('plannerLoadFailed', 'Could not load schedule planner.');
                const detail = err && err.message ? ` (${err.message})` : '';
                showPlannerInitError(base + detail);
            });
        }
    });
})();
