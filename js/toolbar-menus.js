/**
 * Tools toolbar menus (TMS ▾ · Actions ▾): <details class="toolbar-menu"> wrappers around
 * the tab's existing buttons, so their ids, listeners and disabled/hidden state keep working.
 *
 * - Closes after an item is clicked, on an outside click, and on Escape.
 * - Opening one menu closes the others.
 * - A menu whose items are all hidden is hidden too (e.g. Edit group outside a group).
 */
(function (global) {
    'use strict';

    const MENU_SELECTOR = 'details.toolbar-menu';
    let bound = false;

    function menus(root) {
        const doc = root || (typeof document !== 'undefined' ? document : null);
        return doc ? Array.from(doc.querySelectorAll(MENU_SELECTOR)) : [];
    }

    function closeAll(except) {
        menus().forEach((menu) => {
            if (menu !== except && menu.open) {
                menu.open = false;
            }
        });
    }

    /** Hide a menu when every item in it is hidden; show it again when one comes back. */
    function syncVisibility(root) {
        menus(root).forEach((menu) => {
            const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
            const anyVisible = items.some((item) => !item.hidden);
            menu.hidden = items.length > 0 && !anyVisible;
        });
    }

    function bind() {
        if (bound || typeof document === 'undefined') {
            return;
        }
        bound = true;
        document.addEventListener(
            'toggle',
            (e) => {
                const menu = e.target;
                if (menu && menu.matches && menu.matches(MENU_SELECTOR) && menu.open) {
                    closeAll(menu);
                }
            },
            true
        );
        document.addEventListener('click', (e) => {
            const target = e.target;
            const item = target && target.closest ? target.closest(`${MENU_SELECTOR} [role="menuitem"]`) : null;
            if (item) {
                const menu = item.closest(MENU_SELECTOR);
                // Let the item's own click handler run first.
                setTimeout(() => {
                    if (menu) {
                        menu.open = false;
                    }
                }, 0);
                return;
            }
            const inside = target && target.closest ? target.closest(MENU_SELECTOR) : null;
            closeAll(inside);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const open = menus().find((menu) => menu.open);
                if (open) {
                    open.open = false;
                    open.querySelector('summary')?.focus();
                }
            }
        });
        if (typeof MutationObserver !== 'undefined') {
            // Tabs toggle item.hidden from their own code; keep the menu in step.
            const observer = new MutationObserver(() => syncVisibility());
            menus().forEach((menu) => {
                observer.observe(menu, { attributes: true, attributeFilter: ['hidden'], subtree: true });
            });
        }
        syncVisibility();
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bind);
        } else {
            bind();
        }
    }

    global.CCPToolbarMenus = { bind, closeAll, syncVisibility };
})(typeof window !== 'undefined' ? window : globalThis);
