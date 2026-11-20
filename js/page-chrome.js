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
        const el = document.getElementById('appNoticeRail');
        // Inside a blurred/positioned parent (e.g. an old cached header) the bar sits under
        // popouts and gets blurred with the page. Keep it a direct child of <body>.
        if (el && el.parentElement && el.parentElement !== document.body && document.body) {
            document.body.insertBefore(el, document.body.firstChild);
        }
        return el;
    }

    /** A popout (modal) is open: errors stay until dismissed so they can be read. */
    function modalIsOpen() {
        return Boolean(document.querySelector('.modal.active, .modal[aria-hidden="false"]:not([hidden])'));
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
        if (type === 'error' && modalIsOpen()) {
            return 0;
        }
        if (typeof options.duration === 'number') {
            return options.duration;
        }
        if (options.dismissible && type === 'error') {
            return 0;
        }
        return NOTICE_DURATIONS[type] != null ? NOTICE_DURATIONS[type] : NOTICE_DURATIONS.default;
    }

    function shouldShowDismiss(type, options) {
        if (type === 'error' && modalIsOpen()) {
            return true;
        }
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
    const VIEWPORT_BP_NARROW_HEADER = 900;
    let viewportTierResizeBound = false;
    let viewportTierOwnedExternally = false;
    let viewportTierResizeHandler = null;

    function syncViewportTier() {
        if (typeof document === 'undefined') {
            return 'desktop';
        }
        let tier = 'desktop';
        if (window.matchMedia && window.matchMedia(`(max-width: ${VIEWPORT_BP_PHONE}px)`).matches) {
            tier = 'phone';
        } else if (window.matchMedia && window.matchMedia(`(max-width: ${VIEWPORT_BP_NARROW_HEADER}px)`).matches) {
            tier = 'tablet-sm';
        } else if (window.matchMedia && window.matchMedia(`(max-width: ${VIEWPORT_BP_TABLET}px)`).matches) {
            tier = 'tablet';
        }
        document.documentElement.dataset.viewport = tier;
        syncNavDock(tier);
        return tier;
    }

    /**
     * Bottom section bar only on touch devices (phone/tablet width AND finger as the main
     * pointer). Desktop browsers in a narrow window keep the top menus.
     */
    let navDockMediaBound = false;
    function isTouchPrimaryDevice() {
        return Boolean(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
    }

    function syncNavDock(tier) {
        const t = tier || document.documentElement.dataset.viewport || 'desktop';
        document.documentElement.dataset.navDock = t !== 'desktop' && isTouchPrimaryDevice() ? 'bottom' : 'top';
        if (!navDockMediaBound && window.matchMedia) {
            navDockMediaBound = true;
            const mq = window.matchMedia('(hover: none) and (pointer: coarse)');
            const onChange = () => syncNavDock();
            if (typeof mq.addEventListener === 'function') {
                mq.addEventListener('change', onChange);
            } else if (typeof mq.addListener === 'function') {
                mq.addListener(onChange);
            }
        }
    }

    function unbindViewportTierResize() {
        if (viewportTierResizeBound && viewportTierResizeHandler && typeof window !== 'undefined') {
            window.removeEventListener('resize', viewportTierResizeHandler);
        }
        viewportTierResizeBound = false;
        viewportTierResizeHandler = null;
    }

    /**
     * Main app claims ownership so satellite pages keep this listener,
     * but index.html does not run two resize writers.
     */
    function claimViewportOwnership() {
        viewportTierOwnedExternally = true;
        unbindViewportTierResize();
    }

    function initViewportTier() {
        syncViewportTier();
        if (viewportTierOwnedExternally) {
            return;
        }
        if (!viewportTierResizeBound && typeof window !== 'undefined') {
            viewportTierResizeBound = true;
            viewportTierResizeHandler = syncViewportTier;
            window.addEventListener('resize', viewportTierResizeHandler);
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
        claimViewportOwnership,
        NOTICE_PRIORITY,
        NOTICE_DURATIONS
    };
    global.CCPNotice = { show: showNotice, dismiss: dismissNotice };

    /*
     * Error log: error notices, uncaught errors and rejected promises go to
     * Admin › Monitor › Error log (POST /api/client-errors). Batched, de-duplicated, capped.
     */
    const ERROR_LOG_FLUSH_MS = 2500;
    const ERROR_LOG_MAX_PER_PAGE = 60;
    let errorQueue = [];
    let errorFlushTimer = null;
    let errorSentCount = 0;
    const recentErrors = new Map();

    function errorContext() {
        const parts = [];
        const modal = document.querySelector('.modal.active, .modal[aria-hidden="false"]:not([hidden])');
        if (modal && modal.id) {
            parts.push('popout:' + modal.id);
        }
        const tab = document.querySelector('.app-tab-panel:not([hidden])');
        if (tab && tab.id) {
            parts.push('tab:' + tab.id.replace(/^panel-/, ''));
        }
        return parts.join(' ');
    }

    function buildStamp() {
        const script = document.querySelector('script[src*="app.js"]');
        const m = script && /[?&]v=([^&]+)/.exec(script.getAttribute('src') || '');
        return m ? m[1] : '';
    }

    function flushErrors() {
        errorFlushTimer = null;
        if (!errorQueue.length || typeof fetch !== 'function') {
            return;
        }
        const batch = errorQueue.splice(0, 10);
        try {
            fetch('/api/client-errors', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ errors: batch }),
                keepalive: true
            }).catch(() => {});
        } catch (_) {
            /* never let logging throw */
        }
        if (errorQueue.length) {
            errorFlushTimer = global.setTimeout(flushErrors, ERROR_LOG_FLUSH_MS);
        }
    }

    function reportError(info) {
        try {
            const message = String((info && info.message) || '').trim();
            if (!message || errorSentCount >= ERROR_LOG_MAX_PER_PAGE) {
                return;
            }
            // Our own logging request failing must not log itself.
            if (/\/api\/client-errors/.test(message)) {
                return;
            }
            const key = (info.kind || '') + '|' + message;
            const now = Date.now();
            const prev = recentErrors.get(key);
            if (prev && now - prev.at < 60000) {
                prev.entry.count = (prev.entry.count || 1) + 1;
                return;
            }
            const entry = {
                message: message.slice(0, 500),
                kind: info.kind || 'error',
                context: info.context || errorContext(),
                stack: String(info.stack || '').slice(0, 4000),
                page: location.pathname + location.hash,
                build: buildStamp(),
                userAgent: navigator.userAgent,
                at: new Date().toISOString(),
                count: 1
            };
            recentErrors.set(key, { at: now, entry });
            errorQueue.push(entry);
            errorSentCount += 1;
            if (!errorFlushTimer) {
                errorFlushTimer = global.setTimeout(flushErrors, ERROR_LOG_FLUSH_MS);
            }
        } catch (_) {
            /* ignore */
        }
    }

    global.CCPErrorLog = { report: reportError };

    const baseShowNotice = global.CCPNotice.show;
    global.CCPNotice.show = function (message, opts) {
        if (opts && opts.type === 'error') {
            reportError({ message: String(message || ''), kind: 'notice' });
        }
        return baseShowNotice(message, opts);
    };
    global.addEventListener('error', (event) => {
        if (!event || !event.message) {
            return; // resource load errors have no message
        }
        reportError({
            message: event.message,
            kind: 'uncaught',
            stack:
                (event.error && event.error.stack) ||
                `${event.filename || ''}:${event.lineno || ''}:${event.colno || ''}`
        });
    });
    global.addEventListener('unhandledrejection', (event) => {
        const reason = event && event.reason;
        reportError({
            message: (reason && (reason.message || String(reason))) || 'Unhandled promise rejection',
            kind: 'promise',
            stack: reason && reason.stack
        });
    });
    global.addEventListener('pagehide', flushErrors);

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initViewportTier);
        } else {
            initViewportTier();
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
