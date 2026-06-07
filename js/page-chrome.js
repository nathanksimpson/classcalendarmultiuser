/**
 * Shared page chrome: notices, modals, theme/lang helpers for satellite pages.
 * window.CCPPageChrome, window.CCPNotice
 */
(function (global) {
    const NOTICE_PRIORITY = { error: 4, lock: 3, sync: 2, success: 1, info: 0 };
    let noticeTimer = null;
    let currentPriority = -1;

    function escapeHtml(s) {
        if (global.CCPUtils && global.CCPUtils.escapeHtml) {
            return global.CCPUtils.escapeHtml(s);
        }
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(s) {
        if (global.CCPUtils && global.CCPUtils.escapeAttr) {
            return global.CCPUtils.escapeAttr(s);
        }
        return escapeHtml(s);
    }

    function getNoticeRail() {
        return document.getElementById('appNoticeRail') || document.getElementById('appStatus');
    }

    function getSyncToastEl() {
        return document.getElementById('syncToast');
    }

    function afterTransition(el, onDone) {
        if (!el) {
            if (onDone) {
                onDone();
            }
            return;
        }
        let done = false;
        const finish = () => {
            if (done) {
                return;
            }
            done = true;
            el.removeEventListener('transitionend', onTransitionEnd);
            if (onDone) {
                onDone();
            }
        };
        const onTransitionEnd = (e) => {
            if (e.target === el) {
                finish();
            }
        };
        el.addEventListener('transitionend', onTransitionEnd);
        global.setTimeout(finish, 400);
    }

    function dismissNoticeRail(el) {
        if (!el) {
            return;
        }
        el.classList.remove('app-notice-rail--visible', 'app-status-visible', 'sync-toast--visible');
        afterTransition(el, () => {
            el.classList.remove(
                'app-notice-rail--error',
                'app-notice-rail--lock',
                'app-notice-rail--sync',
                'app-notice-rail--success',
                'app-status-error',
                'app-status-lock',
                'sync-toast-error',
                'sync-toast-success'
            );
            el.textContent = '';
            el.setAttribute('aria-hidden', 'true');
            currentPriority = -1;
        });
    }

    /**
     * @param {string} message
     * @param {{ type?: string, duration?: number, force?: boolean }} [opts]
     */
    function showNotice(message, opts) {
        const options = opts || {};
        const type = options.type || 'info';
        const priority = NOTICE_PRIORITY[type] != null ? NOTICE_PRIORITY[type] : 0;
        const el = getNoticeRail();
        if (!el || !message) {
            const legacy = getSyncToastEl();
            if (legacy && message) {
                legacy.textContent = message;
                legacy.className = 'sync-toast sync-toast--visible' + (type === 'error' ? ' sync-toast-error' : ' sync-toast-success');
                legacy.setAttribute('aria-hidden', 'false');
            }
            return;
        }
        if (!options.force && currentPriority > priority && el.classList.contains('app-notice-rail--visible')) {
            return;
        }
        if (noticeTimer) {
            global.clearTimeout(noticeTimer);
            noticeTimer = null;
        }
        const duration =
            typeof options.duration === 'number'
                ? options.duration
                : type === 'error'
                  ? 8000
                  : type === 'success'
                    ? 4000
                    : 6000;

        const apply = () => {
            el.textContent = message;
            el.className = 'app-notice-rail app-notice-rail--' + type;
            el.setAttribute('aria-hidden', 'false');
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
            requestAnimationFrame(() => {
                el.classList.add('app-notice-rail--visible');
            });
            currentPriority = priority;
            if (duration > 0) {
                noticeTimer = global.setTimeout(() => {
                    noticeTimer = null;
                    dismissNoticeRail(el);
                }, duration);
            }
        };

        if (el.classList.contains('app-notice-rail--visible')) {
            apply();
            return;
        }
        apply();
    }

    function dismissNotice() {
        if (noticeTimer) {
            global.clearTimeout(noticeTimer);
            noticeTimer = null;
        }
        dismissNoticeRail(getNoticeRail());
    }

    function getModalFocusables(modal) {
        if (!modal) {
            return [];
        }
        const nodes = modal.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        return Array.from(nodes).filter((n) => n.offsetParent !== null || n === document.activeElement);
    }

    function openModal(modal, triggerEl) {
        if (!modal) {
            return;
        }
        const trigger = triggerEl || document.activeElement;
        if (trigger && trigger instanceof HTMLElement) {
            modal._ccpTrigger = trigger;
        }
        modal.style.removeProperty('display');
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        if (!modal.getAttribute('role')) {
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
        }
        const focusables = getModalFocusables(modal);
        if (focusables.length) {
            focusables[0].focus();
        }
    }

    function closeModal(modal) {
        if (!modal) {
            return;
        }
        const trigger = modal._ccpTrigger;
        modal.classList.remove('active');
        modal.style.removeProperty('display');
        modal.setAttribute('aria-hidden', 'true');
        if (trigger && typeof trigger.focus === 'function') {
            try {
                trigger.focus();
            } catch (_) {
                /* ignore */
            }
        }
        delete modal._ccpTrigger;
    }

    function wireThemeToggle(buttonId, getLabels) {
        const btn = document.getElementById(buttonId);
        if (!btn || btn.dataset.ccpThemeBound === '1') {
            return;
        }
        btn.dataset.ccpThemeBound = '1';
        const labels = getLabels || (() => ({}));
        const refresh = () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const labelKey = isDark ? 'themeLight' : 'themeDark';
            const label = labels[labelKey] || (isDark ? '☀️ Light' : '🌙 Dark');
            const title = labels.themeToggleTitle || 'Switch light/dark theme';
            btn.textContent = label;
            btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
            btn.setAttribute('title', title);
        };
        btn.addEventListener('click', () => {
            if (global.CCPTheme && global.CCPTheme.toggleTheme) {
                global.CCPTheme.toggleTheme({
                    buttonIds: [buttonId],
                    getButtonLabel: (isDark) => {
                        const labelKey = isDark ? 'themeLight' : 'themeDark';
                        return labels[labelKey] || (isDark ? '☀️ Light' : '🌙 Dark');
                    },
                    getButtonTitle: () => labels.themeToggleTitle || 'Switch light/dark theme'
                });
            }
            refresh();
        });
        refresh();
    }

    function initPageShell(options) {
        const opts = options || {};
        if (global.CCPTheme && global.CCPTheme.loadTheme) {
            global.CCPTheme.loadTheme({
                buttonIds: opts.themeButtonIds || [],
                getButtonLabel: opts.getThemeLabel,
                getButtonTitle: opts.getThemeTitle
            });
        }
        (opts.themeButtonIds || []).forEach((id) => {
            wireThemeToggle(id, opts.themeLabels || {});
        });
        if (typeof opts.onLangToggle === 'function' && opts.langButtonId) {
            const langBtn = document.getElementById(opts.langButtonId);
            if (langBtn && langBtn.dataset.ccpLangBound !== '1') {
                langBtn.dataset.ccpLangBound = '1';
                langBtn.addEventListener('click', opts.onLangToggle);
            }
        }
    }

    global.CCPPageChrome = {
        escapeHtml,
        escapeAttr,
        showNotice,
        dismissNotice,
        getModalFocusables,
        openModal,
        closeModal,
        wireThemeToggle,
        initPageShell,
        NOTICE_PRIORITY
    };
    global.CCPNotice = { show: showNotice, dismiss: dismissNotice };
})(typeof window !== 'undefined' ? window : globalThis);
