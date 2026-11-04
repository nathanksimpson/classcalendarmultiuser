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

    /** Never moved: main action, menus with their own popup, Save, Print and Report
     *  controls, and plain text such as "Saved" or a row label. */
    const KEEP_SELECTOR = [
        '.btn-primary',
        '[aria-haspopup]',
        '[data-keep-visible]',
        '.ui-more',
        '[id*="save" i]',
        '[id*="print" i]',
        '[id*="report" i]',
        'span',
        'p',
        'strong',
        'small'
    ].join(', ');
    /** A wrapper holding any of these stays too: a dropdown opened inside the More
     *  menu would be cut off by it (the Essays "Reports" menu with Print was). */
    const KEEP_INSIDE_SELECTOR = [
        '[aria-haspopup]',
        '[data-keep-visible]',
        '[id*="print" i]',
        '[id*="report" i]',
        'details'
    ].join(', ');

    function isKept(el) {
        return el.matches(KEEP_SELECTOR) || Boolean(el.querySelector(KEEP_INSIDE_SELECTOR));
    }
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
            .filter((el) => !isKept(el) && !el.hidden && isVisible(el));
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

    /* ---------- Floating dropdowns ---------- */

    /** Dropdowns drawn inside a card were cut off at the card's edge (Essays > Reports,
     *  where Print lives). While open they are placed over the page instead, next to
     *  their button, and scroll inside when taller than the screen. */
    const FLOATING_MENU_SELECTOR = '.classroom-essay-reports-dropdown';

    function placeFloatingMenus() {
        document.querySelectorAll(FLOATING_MENU_SELECTOR).forEach((menu) => {
            const open = !menu.hidden && menu.getClientRects().length;
            if (!open) {
                menu.classList.remove('ui-floating-menu');
                return;
            }
            const btn = menu.parentElement && menu.parentElement.querySelector(':scope > button');
            if (!btn) {
                return;
            }
            menu.classList.add('ui-floating-menu');
            positionMenu(btn, menu);
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

    /* ---------- Column labels for phone card rows ---------- */

    /**
     * On phones each student table row becomes a card and the column headers
     * are hidden, so copy each header's text onto its cells (data-label) for
     * CSS to show above the value. Student / checkbox columns need no label.
     */
    function labelSheetCells() {
        document.querySelectorAll('table.classroom-sheet').forEach((table) => {
            const heads = Array.from(table.querySelectorAll('thead tr:last-child > th'));
            if (!heads.length) {
                return;
            }
            const labels = heads.map((th) => (th.textContent || '').replace(/\s+/g, ' ').trim());
            table.querySelectorAll('tbody > tr').forEach((tr) => {
                const cells = Array.from(tr.children);
                if (cells.length !== labels.length) {
                    return;
                }
                cells.forEach((td, i) => {
                    const label = labels[i];
                    if (label && td.getAttribute('data-label') !== label) {
                        td.setAttribute('data-label', label);
                    }
                });
            });
        });
    }

    /* ---------- Reload (home-screen web app has no browser reload) ---------- */

    function isStandaloneApp() {
        return Boolean(
            (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
            || window.navigator.standalone === true
        );
    }

    function reloadApp() {
        window.location.reload();
    }

    function setupReloadButton() {
        const btn = document.getElementById('headerReloadBtn');
        if (!btn || btn.dataset.bound === '1') {
            return;
        }
        btn.dataset.bound = '1';
        btn.addEventListener('click', reloadApp);
    }

    /**
     * Pull down at the top of the page to reload, only when running as a
     * home-screen web app (Safari and Chrome tabs have their own reload).
     */
    function setupPullToReload() {
        if (!isStandaloneApp() || !('ontouchstart' in window)) {
            return;
        }
        const THRESHOLD = 80;
        const indicator = document.createElement('div');
        indicator.className = 'ui-pull-reload';
        indicator.setAttribute('aria-hidden', 'true');
        indicator.hidden = true;
        document.body.appendChild(indicator);
        let startY = null;
        let pulling = false;
        let distance = 0;

        const blocked = (target) => Boolean(
            target.closest('input, textarea, select, [contenteditable="true"], .modal, [role="dialog"], dialog, .ui-more-menu, #headerToolsCollapsible, .syllabus-row-drag-handle')
            || document.querySelector('.modal.is-open, .modal[open], dialog[open]')
        );

        document.addEventListener('touchstart', (event) => {
            if (event.touches.length !== 1 || window.scrollY > 0 || blocked(event.target)) {
                startY = null;
                return;
            }
            startY = event.touches[0].clientY;
            pulling = false;
            distance = 0;
        }, { passive: true });

        document.addEventListener('touchmove', (event) => {
            if (startY == null) {
                return;
            }
            distance = event.touches[0].clientY - startY;
            if (window.scrollY > 0 || distance <= 0) {
                indicator.hidden = true;
                pulling = false;
                return;
            }
            pulling = true;
            const ready = distance >= THRESHOLD;
            indicator.hidden = false;
            indicator.classList.toggle('is-ready', ready);
            indicator.textContent = ready ? t('uiReleaseToReload', 'Release to reload') : t('uiPullToReload', 'Pull to reload');
            indicator.style.transform = `translate(-50%, ${Math.min(distance, THRESHOLD * 1.5) * 0.5}px)`;
        }, { passive: true });

        const end = () => {
            if (pulling && distance >= THRESHOLD) {
                indicator.textContent = t('uiReloadApp', 'Reload') + '…';
                reloadApp();
                return;
            }
            indicator.hidden = true;
            startY = null;
            pulling = false;
        };
        document.addEventListener('touchend', end, { passive: true });
        document.addEventListener('touchcancel', end, { passive: true });
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
            placeFloatingMenus();
            growAllTextareas();
            labelSheetCells();
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
        setupReloadButton();
        setupPullToReload();
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
            placeFloatingMenus();
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
