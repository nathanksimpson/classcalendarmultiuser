/**
 * Shared page chrome: notices, modals, theme/lang helpers for satellite pages.
 * window.CCPPageChrome, window.CCPNotice
 */
(function (global) {
    const NOTICE_PRIORITY = { error: 4, lock: 3, sync: 2, success: 1, info: 0 };
    const NOTICE_DURATIONS = {
        error: 8000,
        success: 4000,
        lock: 5000,
        sync: 6000,
        info: 6000,
        default: 6000
    };
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
        return document.getElementById('appNoticeRail');
    }

    function getDismissLabel() {
        if (typeof global.t === 'function') {
            const label = global.t('noticeDismiss');
            if (label && label !== 'noticeDismiss') {
                return label;
            }
        }
        return 'Dismiss';
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

    function clearNoticeRailContent(el) {
        if (!el) {
            return;
        }
        el.replaceChildren();
        el.textContent = '';
    }

    function dismissNoticeRail(el) {
        if (!el) {
            return;
        }
        el.classList.remove('app-notice-rail--visible');
        afterTransition(el, () => {
            el.classList.remove(
                'app-notice-rail--error',
                'app-notice-rail--lock',
                'app-notice-rail--sync',
                'app-notice-rail--success',
                'app-notice-rail--info',
                'app-notice-rail--dismissible'
            );
            clearNoticeRailContent(el);
            el.setAttribute('aria-hidden', 'true');
            currentPriority = -1;
        });
    }

    function bindDismissButton(el, btn) {
        if (!btn || btn.dataset.ccpNoticeBound === '1') {
            return;
        }
        btn.dataset.ccpNoticeBound = '1';
        btn.addEventListener('click', () => {
            if (noticeTimer) {
                global.clearTimeout(noticeTimer);
                noticeTimer = null;
            }
            dismissNoticeRail(el);
        });
    }

    function renderNoticeContent(el, message, dismissible) {
        clearNoticeRailContent(el);
        if (!dismissible) {
            el.textContent = message;
            return;
        }
        el.classList.add('app-notice-rail--dismissible');
        const inner = document.createElement('div');
        inner.className = 'app-notice-rail__inner';
        const msg = document.createElement('span');
        msg.className = 'app-notice-rail__message';
        msg.textContent = message;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'app-notice-rail__dismiss';
        btn.setAttribute('aria-label', getDismissLabel());
        btn.textContent = '\u00d7';
        bindDismissButton(el, btn);
        inner.appendChild(msg);
        inner.appendChild(btn);
        el.appendChild(inner);
    }

    function resolveDuration(type, options) {
        if (typeof options.duration === 'number') {
            return options.duration;
        }
        if (options.dismissible && type === 'error') {
            return 0;
        }
        return NOTICE_DURATIONS[type] != null ? NOTICE_DURATIONS[type] : NOTICE_DURATIONS.default;
    }

    function shouldShowDismiss(type, options) {
        if (typeof options.dismissible === 'boolean') {
            return options.dismissible;
        }
        return type === 'error' || type === 'success';
    }

    /**
     * @param {string} message
     * @param {{ type?: string, duration?: number, force?: boolean, dismissible?: boolean }} [opts]
     */
    function showNotice(message, opts) {
        const options = opts || {};
        const type = options.type || 'info';
        const priority = NOTICE_PRIORITY[type] != null ? NOTICE_PRIORITY[type] : 0;
        const el = getNoticeRail();
        if (!el || !message) {
            return;
        }
        if (!options.force && currentPriority > priority && el.classList.contains('app-notice-rail--visible')) {
            return;
        }
        if (noticeTimer) {
            global.clearTimeout(noticeTimer);
            noticeTimer = null;
        }
        const duration = resolveDuration(type, options);
        const dismissible = shouldShowDismiss(type, options);

        const apply = () => {
            el.className = 'app-notice-rail app-notice-rail--' + type;
            renderNoticeContent(el, message, dismissible);
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
        if (global.CCPModal && global.CCPModal.getModalFocusables) {
            return global.CCPModal.getModalFocusables(modal);
        }
        if (!modal) {
            return [];
        }
        const nodes = modal.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        return Array.from(nodes).filter((n) => n.offsetParent !== null || n === document.activeElement);
    }

    function openModal(modal, triggerEl) {
        if (global.CCPModal && global.CCPModal.open) {
            global.CCPModal.open(modal, triggerEl);
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
        if (global.CCPModal && global.CCPModal.close) {
            global.CCPModal.close(modal);
            return;
        }
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

    const VIEWPORT_BP_PHONE = 640;
    const VIEWPORT_BP_TABLET = 1024;
    let viewportTierResizeBound = false;

    function syncViewportTier() {
        if (typeof document === 'undefined') {
            return 'desktop';
        }
        let tier = 'desktop';
        if (window.matchMedia && window.matchMedia(`(max-width: ${VIEWPORT_BP_PHONE}px)`).matches) {
            tier = 'phone';
        } else if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
            tier = 'tablet-sm';
        } else if (window.matchMedia && window.matchMedia(`(max-width: ${VIEWPORT_BP_TABLET}px)`).matches) {
            tier = 'tablet';
        }
        document.documentElement.dataset.viewport = tier;
        return tier;
    }

    function initViewportTier() {
        syncViewportTier();
        if (!viewportTierResizeBound && typeof window !== 'undefined') {
            viewportTierResizeBound = true;
            window.addEventListener('resize', syncViewportTier);
        }
    }

    function initPageShell(options) {
        const opts = options || {};
        initViewportTier();
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
        syncViewportTier,
        initViewportTier,
        NOTICE_PRIORITY,
        NOTICE_DURATIONS
    };
    global.CCPNotice = { show: showNotice, dismiss: dismissNotice };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initViewportTier);
        } else {
            initViewportTier();
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
