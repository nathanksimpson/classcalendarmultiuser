/**
 * Header chrome: Hide tabs / restore chip, tools ⋮ overflow, lock details positioning.
 * window.CCPHeaderChrome
 */
(function (global) {
    'use strict';

    const NAV_TABS_COLLAPSED_STORAGE_KEY = 'ccpNavTabsCollapsed';
    const DEFAULT_TABLET_BP = 1024;

    let hooks = {};
    let headerRowPanelsRaf = 0;

    function t(key) {
        return typeof hooks.t === 'function' ? hooks.t(key) : key;
    }

    function getTabletBp() {
        const n = Number(hooks.viewportBpTablet);
        return Number.isFinite(n) && n > 0 ? n : DEFAULT_TABLET_BP;
    }

    function isZoneNavReorderActive() {
        return Boolean(
            document.querySelector('.is-reorder-active, .is-nav-dragging, .is-nav-reorder-pending')
        );
    }

    function getNavTabsCollapsed() {
        return document.documentElement.getAttribute('data-nav-tabs-collapsed') === '1';
    }

    function getActiveNavLocationLabels() {
        const zoneBtn = document.querySelector('.app-zone-btn.is-active, .app-zone-btn[aria-selected="true"]');
        const zoneLabel = zoneBtn ? (zoneBtn.textContent || '').trim() : '';
        const activePanel = document.querySelector('.app-zone-segment-panel.is-active:not([hidden])');
        const segmentBtn = activePanel
            ? activePanel.querySelector('.app-zone-segment-btn.is-active, .app-zone-segment-btn[aria-selected="true"]')
            : null;
        const segmentLabel = segmentBtn && !segmentBtn.hidden
            ? (segmentBtn.textContent || '').trim()
            : '';
        if (zoneLabel && segmentLabel) {
            return `${zoneLabel} · ${segmentLabel}`;
        }
        return zoneLabel || segmentLabel || '';
    }

    function updateNavTabsCollapsedChip() {
        const chip = document.getElementById('navTabsCollapsedChip');
        const labelEl = document.getElementById('navTabsCollapsedChipLabel');
        if (!chip || !labelEl) {
            return;
        }
        const collapsed = getNavTabsCollapsed();
        const label = getActiveNavLocationLabels();
        labelEl.textContent = label;
        chip.hidden = !collapsed || !label;
        chip.setAttribute('aria-hidden', String(chip.hidden));
        chip.title = t('navTabsCollapsedChipTitle');
        chip.setAttribute('aria-label', label
            ? `${label}. ${t('navTabsShowTitle')}`
            : t('navTabsShowTitle'));
    }

    function updateNavTabsCollapseChrome() {
        const toggle = document.getElementById('accountHideTabsBtn');
        const collapsed = getNavTabsCollapsed();
        if (toggle) {
            const labelKey = collapsed ? 'accountShowTabs' : 'accountHideTabs';
            const titleKey = collapsed ? 'navTabsShowTitle' : 'navTabsHideTitle';
            toggle.textContent = t(labelKey);
            toggle.setAttribute('data-i18n', labelKey);
            toggle.setAttribute('data-i18n-title', titleKey);
            toggle.title = t(titleKey);
            toggle.setAttribute('aria-pressed', String(collapsed));
        }
        updateNavTabsCollapsedChip();
    }

    function setNavTabsCollapsed(collapsed, options = {}) {
        const next = Boolean(collapsed);
        if (next && isZoneNavReorderActive() && !options.force) {
            return false;
        }
        if (next) {
            document.documentElement.setAttribute('data-nav-tabs-collapsed', '1');
        } else {
            document.documentElement.removeAttribute('data-nav-tabs-collapsed');
        }
        try {
            localStorage.setItem(NAV_TABS_COLLAPSED_STORAGE_KEY, next ? '1' : '0');
        } catch (_) {
            /* ignore quota / private mode */
        }
        updateNavTabsCollapseChrome();
        requestAnimationFrame(() => {
            if (typeof hooks.syncAppChromeStickyTop === 'function') {
                hooks.syncAppChromeStickyTop();
            }
            if (!next && typeof hooks.syncAllZoneNavScrollAffordances === 'function') {
                hooks.syncAllZoneNavScrollAffordances();
            }
        });
        return true;
    }

    function toggleNavTabsCollapsed() {
        if (getNavTabsCollapsed()) {
            setNavTabsCollapsed(false);
            return;
        }
        setNavTabsCollapsed(true);
    }

    function setupNavTabsCollapseToggle() {
        const toggle = document.getElementById('accountHideTabsBtn');
        const chip = document.getElementById('navTabsCollapsedChip');
        if (toggle && toggle.dataset.bound !== '1') {
            toggle.dataset.bound = '1';
            toggle.addEventListener('click', () => {
                toggleNavTabsCollapsed();
                setHeaderToolsOverflowOpen(false);
            });
        }
        if (chip && chip.dataset.bound !== '1') {
            chip.dataset.bound = '1';
            chip.addEventListener('click', () => setNavTabsCollapsed(false));
        }
        let stored = false;
        try {
            stored = localStorage.getItem(NAV_TABS_COLLAPSED_STORAGE_KEY) === '1';
        } catch (_) {
            stored = false;
        }
        setNavTabsCollapsed(stored, { force: true });
    }

    function setHeaderToolsOverflowOpen(open) {
        const row = document.getElementById('headerToolsRow');
        const btn = document.getElementById('headerToolsOverflowBtn');
        if (!row || !btn) {
            return;
        }
        const next = Boolean(open);
        row.classList.toggle('is-overflow-open', next);
        btn.setAttribute('aria-expanded', String(next));
        positionHeaderRowPanels();
    }

    function isHeaderRowScrollTier() {
        return Boolean(window.matchMedia && window.matchMedia(`(max-width: ${getTabletBp()}px)`).matches);
    }

    function clearHeaderRowPanelPosition(panel) {
        if (!panel) {
            return;
        }
        ['position', 'top', 'left', 'right', 'bottom', 'maxHeight', 'overflow', 'overflowY'].forEach((prop) => {
            panel.style[prop] = '';
        });
    }

    /**
     * ≤1024 the primary header row scrolls sideways, which would clip absolute children,
     * so the ⋮ panel and the lock details drawer are fixed and placed from their trigger.
     */
    function positionHeaderRowPanels() {
        const narrow = isHeaderRowScrollTier();
        const toolsRow = document.getElementById('headerToolsRow');
        const overflowBtn = document.getElementById('headerToolsOverflowBtn');
        const overflowPanel = document.getElementById('headerToolsCollapsible');
        const positionFixed = typeof hooks.positionFixedPopoverBelowTrigger === 'function'
            ? hooks.positionFixedPopoverBelowTrigger
            : null;
        if (overflowPanel) {
            const open = Boolean(toolsRow && toolsRow.classList.contains('is-overflow-open'));
            if (narrow && open) {
                if (!positionFixed || !positionFixed(overflowBtn, overflowPanel, { align: 'right', minMaxHeight: 120 })) {
                    setHeaderToolsOverflowOpen(false);
                }
            } else {
                clearHeaderRowPanelPosition(overflowPanel);
            }
        }
        const status = document.getElementById('teamLockStatus');
        const pill = document.getElementById('teamLockSyncBar');
        const details = document.getElementById('teamLockDetails');
        if (details) {
            const drawerOpen = Boolean(status && status.classList.contains('team-lock-status--drawer-open'));
            if (!(narrow && drawerOpen && positionFixed && positionFixed(pill, details, { align: 'left', minMaxHeight: 120 }))) {
                clearHeaderRowPanelPosition(details);
            }
        }
    }

    function scheduleHeaderRowPanelsPosition() {
        if (headerRowPanelsRaf) {
            return;
        }
        headerRowPanelsRaf = requestAnimationFrame(() => {
            headerRowPanelsRaf = 0;
            positionHeaderRowPanels();
        });
    }

    function setupHeaderToolsOverflow() {
        const row = document.getElementById('headerToolsRow');
        const btn = document.getElementById('headerToolsOverflowBtn');
        if (!row || !btn || btn.dataset.bound === '1') {
            return;
        }
        btn.dataset.bound = '1';
        document.getElementById('appTopBarPrimaryRow')?.addEventListener('scroll', scheduleHeaderRowPanelsPosition, { passive: true });
        window.addEventListener('resize', scheduleHeaderRowPanelsPosition, { passive: true });
        window.addEventListener('scroll', scheduleHeaderRowPanelsPosition, { passive: true });
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            setHeaderToolsOverflowOpen(!row.classList.contains('is-overflow-open'));
        });
        document.addEventListener('click', (event) => {
            if (!row.classList.contains('is-overflow-open')) {
                return;
            }
            if (row.contains(event.target)) {
                return;
            }
            setHeaderToolsOverflowOpen(false);
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                setHeaderToolsOverflowOpen(false);
            }
        });
    }

    function setupLockDrawerToggle() {
        const toggle = document.getElementById('teamLockDrawerToggle');
        const status = document.getElementById('teamLockStatus');
        if (!toggle || !status || toggle.dataset.bound === '1') {
            return;
        }
        toggle.dataset.bound = '1';
        toggle.addEventListener('click', () => {
            const open = status.classList.toggle('team-lock-status--drawer-open');
            toggle.setAttribute('aria-expanded', String(open));
            positionHeaderRowPanels();
        });
    }

    function init(nextHooks) {
        hooks = nextHooks && typeof nextHooks === 'object' ? nextHooks : {};
    }

    function setup() {
        setupNavTabsCollapseToggle();
        setupHeaderToolsOverflow();
        setupLockDrawerToggle();
    }

    global.CCPHeaderChrome = {
        init,
        setup,
        updateNavTabsCollapseChrome,
        updateNavTabsCollapsedChip,
        setNavTabsCollapsed,
        getNavTabsCollapsed,
        setHeaderToolsOverflowOpen,
        positionHeaderRowPanels
    };
})(typeof window !== 'undefined' ? window : globalThis);
