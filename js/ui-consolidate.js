/**
 * UI consolidation helpers (November 2026 refresh).
 * window.CCPUiConsolidate
 *
 * 1. One-row toolbars: page toolbars never wrap onto a second or third line.
 *    Buttons that do not fit move into a "More ▾" menu at the end of the row and
 *    come back when there is room. Buttons are moved, not copied, so their click
 *    handlers (direct or delegated to the toolbar) keep working.
 * 2. Auto-growing textareas in the syllabus editor, so the page is the only
 *    thing that scrolls (no small scroll boxes inside table cells).
 * 3. --app-header-h on <html>: the sticky header's height, used to place sticky
 *    side lists just below it.
 */
(function (global) {
    'use strict';

    /** Toolbars that should stay on one line. */
    const BAR_SELECTORS = [
        '.app-tab-panel .module-toolbar > .toolbar-actions',
        '.app-tab-panel .module-toolbar.timetable-tab-toolbar',
        '.app-tab-panel .module-toolbar.homework-tab-toolbar',
        '.app-tab-panel .syllabus-table-actions',
        '.app-tab-panel .syllabus-editor-actions-bar',
        '#classroomRosterBulkActions'
    ];

    /** Controls that never move into the menu. */
    /** Never moved: main action, menus with their own popup, Save buttons, and
     *  plain text such as "Saved" or a row label. */
    const KEEP_SELECTOR = [
        '.btn-primary',
        '[aria-haspopup]',
        '[data-keep-visible]',
        '.ui-more',
        '[id*="save" i]',
        'span',
        'p',
        'strong',
        'small'
    ].join(', ');
    /** Direct children of a toolbar that may move into More (buttons, dropdowns, small settings). */
    const MOVABLE_SELECTOR = ':scope > :not(.ui-more):not(script):not(template)';
    const AUTOGROW_SELECTOR = '#panel-syllabus textarea, textarea[data-autogrow]';

    let hooks = {};
    let scheduled = false;
    let observer = null;
    let openBar = null;

    function t(key, fallback) {
        const fn = typeof hooks.t === 'function' ? hooks.t : (typeof global.t === 'function' ? global.t : null);
        let v = '';
        try {
            v = fn ? fn(key) : '';
        } catch (_) {
            v = '';
        }
        return v && v !== key ? v : fallback;
    }

    function isVisible(el) {
        return Boolean(el && el.getClientRects().length);
    }

    /* ---------- One-row toolbars ---------- */

    function ensureMoreControl(bar) {
        let wrap = bar.querySelector(':scope > .ui-more');
        if (wrap) {
            return wrap;
        }
        wrap = document.createElement('div');
        wrap.className = 'ui-more';
        wrap.hidden = true;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline btn-compact ui-more-btn';
        btn.setAttribute('aria-haspopup', 'menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = t('uiMoreActions', 'More') + ' ▾';
        const menu = document.createElement('div');
        menu.className = 'ui-more-menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            setMenuOpen(bar, menu.hidden);
        });
        menu.addEventListener('click', (event) => {
            if (event.target.closest('button, a')) {
                // Let the moved button's own handler run first, then close.
                setTimeout(() => setMenuOpen(bar, false), 0);
            }
        });
        wrap.appendChild(btn);
        wrap.appendChild(menu);
        bar.appendChild(wrap);
        return wrap;
    }

    function setMenuOpen(bar, open) {
        const wrap = bar && bar.querySelector(':scope > .ui-more');
        if (!wrap) {
            return;
        }
        const menu = wrap.querySelector('.ui-more-menu');
        const btn = wrap.querySelector('.ui-more-btn');
        menu.hidden = !open;
        btn.setAttribute('aria-expanded', String(Boolean(open)));
        if (open) {
            if (openBar && openBar !== bar) {
                setMenuOpen(openBar, false);
            }
            openBar = bar;
            positionMenu(btn, menu);
        } else if (openBar === bar) {
            openBar = null;
        }
    }

    /** Fixed position so the menu is never clipped by a scrolling ancestor. */
    function positionMenu(btn, menu) {
        const r = btn.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const vh = window.innerHeight;
        menu.style.position = 'fixed';
        menu.style.top = '0px';
        menu.style.left = '0px';
        const mw = menu.offsetWidth;
        const mh = menu.offsetHeight;
        let left = Math.min(Math.max(8, r.right - mw), vw - mw - 8);
        let top = r.bottom + 4;
        if (top + mh > vh - 8 && r.top - mh - 4 > 8) {
            top = r.top - mh - 4;
        }
        menu.style.left = `${Math.max(8, left)}px`;
        menu.style.top = `${top}px`;
        menu.style.maxHeight = `${Math.max(160, vh - top - 8)}px`;
    }

    function rememberOrder(bar) {
        let i = 0;
        bar.querySelectorAll(MOVABLE_SELECTOR).forEach((el) => {
            if (!el.dataset.uiOrder) {
                el.dataset.uiOrder = String(i);
            }
            i += 1;
        });
    }

    function restoreAll(bar, wrap) {
        const menu = wrap.querySelector('.ui-more-menu');
        const moved = Array.from(menu.children);
        moved.forEach((el) => {
            el.classList.remove('ui-more-item');
            el.removeAttribute('role');
            bar.insertBefore(el, wrap);
        });
        // Put everything back in its original order.
        const items = Array.from(bar.querySelectorAll(MOVABLE_SELECTOR))
            .filter((el) => el.dataset.uiOrder != null)
            .sort((a, b) => Number(a.dataset.uiOrder) - Number(b.dataset.uiOrder));
        if (moved.length) {
            items.forEach((el) => bar.insertBefore(el, wrap));
        }
    }

    function overflows(bar) {
        return bar.scrollWidth > bar.clientWidth + 1;
    }

    function fitBar(bar) {
        if (!bar.isConnected || !isVisible(bar)) {
            return;
        }
        bar.classList.add('ui-one-row');
        rememberOrder(bar);
        const wrap = ensureMoreControl(bar);
        const wasOpen = !wrap.querySelector('.ui-more-menu').hidden;
        setMenuOpen(bar, false);
        restoreAll(bar, wrap);
        wrap.hidden = true;
        if (!overflows(bar)) {
            return;
        }
        wrap.hidden = false;
        const menu = wrap.querySelector('.ui-more-menu');
        const candidates = Array.from(bar.querySelectorAll(MOVABLE_SELECTOR))
            .filter((el) => !el.matches(KEEP_SELECTOR) && !el.hidden && isVisible(el));
        // Always leave the first visible button in the row.
        const firstVisible = Array.from(bar.querySelectorAll(MOVABLE_SELECTOR)).find((el) => isVisible(el));
        while (overflows(bar) && candidates.length) {
            const el = candidates.pop();
            if (el === firstVisible) {
                continue;
            }
            el.classList.add('ui-more-item');
            el.setAttribute('role', 'menuitem');
            menu.insertBefore(el, menu.firstChild);
        }
        if (!menu.children.length) {
            wrap.hidden = true;
        } else if (wasOpen) {
            setMenuOpen(bar, true);
        }
    }

    function fitAllBars() {
        BAR_SELECTORS.forEach((sel) => {
            document.querySelectorAll(sel).forEach(fitBar);
        });
    }

    /* ---------- Auto-growing textareas ---------- */

    function growTextarea(el) {
        if (!el || el.tagName !== 'TEXTAREA' || !isVisible(el)) {
            return;
        }
        if (!el.classList.contains('ui-autogrow')) {
            el.classList.add('ui-autogrow');
            // Start compact (2 lines); the box grows as text is added.
            if (Number(el.getAttribute('rows')) > 2) {
                el.setAttribute('rows', '2');
            }
        }
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight + 2}px`;
    }

    function growAllTextareas() {
        document.querySelectorAll(AUTOGROW_SELECTOR).forEach(growTextarea);
    }

    /* ---------- Header height variable ---------- */

    function syncHeaderHeight() {
        const header = document.getElementById('appTopBar');
        if (!header) {
            return;
        }
        const h = Math.round(header.getBoundingClientRect().height);
        document.documentElement.style.setProperty('--app-header-h', `${h}px`);
    }

    /* ---------- Scheduling ---------- */

    function runAll() {
        scheduled = false;
        if (observer) {
            observer.disconnect();
        }
        try {
            syncHeaderHeight();
            fitAllBars();
            growAllTextareas();
        } finally {
            if (observer) {
                observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
            }
        }
    }

    function schedule() {
        if (scheduled) {
            return;
        }
        scheduled = true;
        requestAnimationFrame(runAll);
    }

    function init(nextHooks) {
        hooks = nextHooks && typeof nextHooks === 'object' ? nextHooks : {};
    }

    function setup() {
        if (typeof MutationObserver !== 'undefined' && !observer) {
            observer = new MutationObserver(schedule);
        }
        window.addEventListener('resize', schedule, { passive: true });
        if (typeof ResizeObserver !== 'undefined') {
            const header = document.getElementById('appTopBar');
            if (header) {
                new ResizeObserver(syncHeaderHeight).observe(header);
            }
        }
        document.addEventListener('input', (event) => {
            if (event.target && event.target.matches && event.target.matches(AUTOGROW_SELECTOR)) {
                growTextarea(event.target);
            }
        });
        document.addEventListener('click', (event) => {
            if (openBar && !openBar.contains(event.target)) {
                setMenuOpen(openBar, false);
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && openBar) {
                const btn = openBar.querySelector('.ui-more-btn');
                setMenuOpen(openBar, false);
                if (btn) {
                    btn.focus();
                }
            }
        });
        window.addEventListener('scroll', () => {
            if (openBar) {
                setMenuOpen(openBar, false);
            }
        }, { passive: true });
        schedule();
    }

    global.CCPUiConsolidate = { init, setup, refresh: schedule, fitBar, growTextarea };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup, { once: true });
    } else {
        setup();
    }
})(typeof window !== 'undefined' ? window : globalThis);
