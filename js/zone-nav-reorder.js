/**
 * Long-press (touch) or click-drag (mouse) reorder for zone + segment nav tabs.
 * Supports within-row reorder and cross-zone segment moves (tabId identity).
 */
(function zoneNavReorderModule(global) {
    'use strict';

    const LONG_PRESS_MS = 450;
    const TOUCH_MOVE_CANCEL_PX = 8;
    const MOUSE_DRAG_START_PX = 6;
    const ARCHIVED_SEGMENT_IDS = new Set(['command-center']);
    const FIXED_SEGMENT_TAB_IDS = new Set(['teachers', 'portfolio', 'command-center', 'data']);
    const NO_SEGMENT_ZONES = new Set(['more']);

    let hooks = null;
    let bound = false;
    let dragState = null;
    let documentListenersBound = false;

    function isMousePointer(e) {
        return e && e.pointerType === 'mouse';
    }

    function prefersReducedMotion() {
        return typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function bindDocumentPointerListeners() {
        if (documentListenersBound) {
            return;
        }
        documentListenersBound = true;
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
    }

    function unbindDocumentPointerListeners() {
        if (!documentListenersBound) {
            return;
        }
        documentListenersBound = false;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
    }

    function isDraggableNavButton(el) {
        if (!el || el.hidden) {
            return false;
        }
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
            return false;
        }
        const segment = el.dataset.segment;
        const tabId = el.dataset.tab || '';
        if (segment && ARCHIVED_SEGMENT_IDS.has(segment)) {
            return false;
        }
        if (tabId && FIXED_SEGMENT_TAB_IDS.has(tabId)) {
            return false;
        }
        return !!(el.dataset.zone || el.dataset.segment || el.dataset.tab);
    }

    function getNavItemId(el) {
        if (!el) {
            return '';
        }
        if (el.dataset.zone) {
            return el.dataset.zone;
        }
        return el.dataset.tab || el.dataset.segment || '';
    }

    function normalizeOrder(order, defaults) {
        const defaultList = Array.isArray(defaults) ? defaults.filter(Boolean) : [];
        const allowed = new Set(defaultList);
        const saved = Array.isArray(order) ? order.filter((id) => allowed.has(id)) : [];
        const missing = defaultList.filter((id) => !saved.includes(id));
        const merged = [...saved];
        missing.forEach((id) => {
            const defaultIdx = defaultList.indexOf(id);
            let insertAt = merged.length;
            for (let i = 0; i < merged.length; i += 1) {
                if (defaultList.indexOf(merged[i]) > defaultIdx) {
                    insertAt = i;
                    break;
                }
            }
            merged.splice(insertAt, 0, id);
        });
        return merged;
    }

    function normalizeZoneOrder(order, defaults) {
        return normalizeOrder(order, defaults);
    }

    function normalizeSegmentOrder(zoneId, order, defaults) {
        const filteredDefaults = (Array.isArray(defaults) ? defaults : []).filter(
            (id) => !ARCHIVED_SEGMENT_IDS.has(id)
        );
        return normalizeOrder(order, filteredDefaults);
    }

    function getEligibleChildren(container) {
        if (!container) {
            return [];
        }
        return Array.from(container.children).filter(isDraggableNavButton);
    }

    function sortChildren(container, orderedIds, idGetter) {
        if (!container || !Array.isArray(orderedIds) || !orderedIds.length) {
            return;
        }
        const children = Array.from(container.children);
        const eligible = children.filter(isDraggableNavButton);
        const ineligible = children.filter((el) => !isDraggableNavButton(el));
        const byId = new Map(eligible.map((el) => [idGetter(el), el]));
        const sortedEligible = orderedIds.map((id) => byId.get(id)).filter(Boolean);
        eligible.forEach((el) => {
            if (!sortedEligible.includes(el)) {
                sortedEligible.push(el);
            }
        });
        [...sortedEligible, ...ineligible].forEach((el) => {
            container.appendChild(el);
        });
    }

    function readOrderFromContainer(container, idGetter) {
        return getEligibleChildren(container).map(idGetter).filter(Boolean);
    }

    function applyZoneOrder() {
        if (!hooks || typeof hooks.getZoneOrder !== 'function') {
            return;
        }
        const container = document.getElementById('appZoneNav');
        if (!container) {
            return;
        }
        sortChildren(container, hooks.getZoneOrder(), getNavItemId);
    }

    function findSegmentButtonByTabId(tabId) {
        if (!tabId) {
            return null;
        }
        return document.querySelector(`.app-zone-segment-btn[data-tab="${tabId}"]`);
    }

    function applySegmentOrders() {
        if (!hooks) {
            return;
        }
        const tabZone = typeof hooks.getTabZoneMap === 'function' ? hooks.getTabZoneMap() : {};
        const panels = Array.from(document.querySelectorAll('.app-zone-segment-panel'));
        const panelByZone = new Map(panels.map((p) => [p.dataset.zone, p]));

        Object.keys(tabZone || {}).forEach((tabId) => {
            const zoneId = tabZone[tabId];
            if (!zoneId || NO_SEGMENT_ZONES.has(zoneId)) {
                return;
            }
            const panel = panelByZone.get(zoneId);
            const btn = findSegmentButtonByTabId(tabId);
            if (panel && btn && btn.parentElement !== panel) {
                panel.appendChild(btn);
            }
        });

        panels.forEach((panel) => {
            const zoneId = panel.dataset.zone;
            if (!zoneId) {
                return;
            }
            let orderedIds = [];
            if (typeof hooks.getTabOrder === 'function') {
                orderedIds = hooks.getTabOrder(zoneId) || [];
            } else if (typeof hooks.getSegmentOrder === 'function') {
                orderedIds = hooks.getSegmentOrder(zoneId) || [];
            }
            sortChildren(panel, orderedIds, getNavItemId);
        });
    }

    function applyOrder() {
        applyZoneOrder();
        applySegmentOrders();
        if (typeof hooks?.onOrderApplied === 'function') {
            hooks.onOrderApplied();
        }
    }

    function getInsertBeforeElement(container, pointerX, movingEl, draggingEl) {
        const candidates = Array.from(container.children).filter((el) => {
            if (el === movingEl || el === draggingEl) {
                return false;
            }
            return isDraggableNavButton(el);
        });
        for (const el of candidates) {
            const rect = el.getBoundingClientRect();
            const mid = rect.left + rect.width / 2;
            if (pointerX < mid) {
                return el;
            }
        }
        return null;
    }

    function createPlaceholder(draggingEl) {
        const rect = draggingEl.getBoundingClientRect();
        const style = window.getComputedStyle(draggingEl);
        const placeholder = document.createElement('span');
        placeholder.className = 'app-zone-nav-reorder-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.style.width = `${rect.width}px`;
        placeholder.style.height = `${rect.height}px`;
        placeholder.style.marginLeft = style.marginLeft;
        placeholder.style.marginRight = style.marginRight;
        placeholder.style.marginBottom = style.marginBottom;
        return placeholder;
    }

    function clearFloaterStyles(el) {
        if (!el) {
            return;
        }
        el.style.position = '';
        el.style.left = '';
        el.style.top = '';
        el.style.width = '';
        el.style.height = '';
        el.style.zIndex = '';
        el.style.margin = '';
        el.style.touchAction = '';
        el.style.transform = '';
    }

    function clearSiblingShiftStyles(container) {
        if (!container) {
            return;
        }
        getEligibleChildren(container).forEach((el) => {
            el.style.transition = '';
            el.style.transform = '';
        });
    }

    function animateSiblingShift(container, placeholder, draggingEl, applyDomChange) {
        if (prefersReducedMotion()) {
            applyDomChange();
            return;
        }
        const siblings = getEligibleChildren(container).filter(
            (el) => el !== draggingEl && el !== placeholder
        );
        const before = new Map(siblings.map((el) => [el, el.getBoundingClientRect().left]));
        applyDomChange();
        siblings.forEach((el) => {
            const startLeft = before.get(el);
            const dx = startLeft - el.getBoundingClientRect().left;
            if (!dx) {
                return;
            }
            el.style.transition = 'none';
            el.style.transform = `translateX(${dx}px)`;
            requestAnimationFrame(() => {
                el.style.transition = 'transform 180ms ease';
                el.style.transform = '';
            });
        });
    }

    function placeholderSlotUnchanged(container, placeholder, insertBefore, draggingEl) {
        if (insertBefore) {
            return placeholder.nextElementSibling === insertBefore;
        }
        const trailing = Array.from(container.children).filter(
            (el) => el !== placeholder && el !== draggingEl && isDraggableNavButton(el)
        );
        const lastEligible = trailing[trailing.length - 1];
        return lastEligible && placeholder.previousElementSibling === lastEligible;
    }

    function resolveDropZone(clientX, clientY) {
        const stack = document.elementsFromPoint
            ? document.elementsFromPoint(clientX, clientY)
            : [];
        for (const el of stack) {
            if (!el || !el.closest) {
                continue;
            }
            const zoneBtn = el.closest('.app-zone-btn');
            if (zoneBtn && zoneBtn.dataset.zone) {
                const zoneId = zoneBtn.dataset.zone;
                if (NO_SEGMENT_ZONES.has(zoneId)) {
                    return { zoneId, panel: null, zoneBtn, blocked: true };
                }
                const panel = document.querySelector(`.app-zone-segment-panel[data-zone="${zoneId}"]`);
                return { zoneId, panel, zoneBtn, blocked: false };
            }
            const panel = el.closest('.app-zone-segment-panel');
            if (panel && panel.dataset.zone) {
                const zoneId = panel.dataset.zone;
                if (NO_SEGMENT_ZONES.has(zoneId)) {
                    return { zoneId, panel: null, zoneBtn: null, blocked: true };
                }
                const btn = document.querySelector(`.app-zone-btn[data-zone="${zoneId}"]`);
                return { zoneId, panel, zoneBtn: btn, blocked: false };
            }
        }
        return null;
    }

    function resolveDropContainer(clientX, clientY, kind, fallbackContainer, state) {
        if (kind !== 'segment') {
            return fallbackContainer;
        }
        const dropInfo = resolveDropZone(clientX, clientY);
        if (!dropInfo) {
            if (state && state.sourceContainer) {
                setDragPreviewZone(state, {
                    zoneId: state.sourceZoneId,
                    panel: state.sourceContainer,
                    blocked: false
                });
                state.dropBlocked = false;
                return state.sourceContainer;
            }
            return fallbackContainer;
        }
        if (dropInfo.blocked) {
            markDropZoneBlocked(state);
            return state ? state.container : null;
        }
        clearDropZoneBlocked();
        setDragPreviewZone(state, dropInfo);
        state.dropBlocked = false;
        return dropInfo.panel || fallbackContainer;
    }

    function clearDropZoneBlocked() {
        document.querySelectorAll('.app-zone-btn.is-nav-drop-blocked').forEach((btn) => {
            btn.classList.remove('is-nav-drop-blocked');
        });
    }

    function markDropZoneBlocked(state) {
        clearDropZoneBlocked();
        const dataBtn = document.querySelector('.app-zone-btn[data-zone="more"]');
        if (dataBtn) {
            dataBtn.classList.add('is-nav-drop-blocked');
        }
        if (state) {
            state.dropBlocked = true;
        }
    }

    function setDragPreviewZone(state, dropInfo) {
        if (!state || state.kind !== 'segment' || !dropInfo || dropInfo.blocked) {
            return;
        }
        const zoneId = dropInfo.zoneId;
        const panel = dropInfo.panel;
        if (!zoneId || !panel) {
            return;
        }
        if (state.previewZoneId === zoneId) {
            return;
        }
        state.previewZoneId = zoneId;

        document.querySelectorAll('.app-zone-btn').forEach((btn) => {
            const isTarget = btn.dataset.zone === zoneId;
            btn.classList.toggle('is-nav-drop-target', isTarget);
        });

        document.querySelectorAll('.app-zone-segment-panel').forEach((segmentPanel) => {
            const show = segmentPanel.dataset.zone === zoneId;
            segmentPanel.hidden = !show;
            segmentPanel.classList.toggle('is-nav-drop-preview-row', show);
            segmentPanel.classList.toggle('is-active', show);
        });

        syncZoneNavScrollAffordance(panel);
    }

    function clearDragPreview(state) {
        document.body.classList.remove('is-nav-cross-zone-drag', 'is-nav-drop-preview');
        clearDropZoneBlocked();
        document.querySelectorAll('.app-zone-btn').forEach((btn) => {
            btn.classList.remove('is-nav-drop-target');
        });
        document.querySelectorAll('.app-zone-segment-panel').forEach((segmentPanel) => {
            segmentPanel.classList.remove('is-nav-drop-preview-row');
        });
        const segmentNav = document.getElementById('appZoneSegmentNav');
        if (segmentNav && state && state.segmentNavTitleBackup !== undefined) {
            if (state.segmentNavTitleBackup) {
                segmentNav.title = state.segmentNavTitleBackup;
            } else {
                segmentNav.removeAttribute('title');
            }
        }
        if (typeof hooks?.onPreviewEnd === 'function') {
            hooks.onPreviewEnd();
        }
    }

    function syncZoneNavScrollAffordance(scrollEl) {
        if (!scrollEl || typeof hooks?.syncZoneNavScrollAffordance !== 'function') {
            return;
        }
        hooks.syncZoneNavScrollAffordance(scrollEl);
    }

    function movePlaceholder(state, pointerX, pointerY) {
        const dropContainer = resolveDropContainer(
            pointerX,
            pointerY,
            state.kind,
            state.container,
            state
        );
        if (!dropContainer) {
            state.dropBlocked = true;
            return;
        }
        if (dropContainer !== state.container) {
            // Cross-panel: move placeholder into the target panel.
            clearSiblingShiftStyles(state.container);
            state.container.classList.remove('is-reorder-active');
            state.container = dropContainer;
            dropContainer.classList.add('is-reorder-active');
            if (state.placeholder && state.placeholder.parentNode !== dropContainer) {
                dropContainer.appendChild(state.placeholder);
            }
        }
        const { container, placeholder, draggingEl } = state;
        const insertBefore = getInsertBeforeElement(container, pointerX, placeholder, draggingEl);
        if (placeholderSlotUnchanged(container, placeholder, insertBefore, draggingEl)) {
            return;
        }
        animateSiblingShift(container, placeholder, draggingEl, () => {
            if (insertBefore) {
                container.insertBefore(placeholder, insertBefore);
                return;
            }
            const trailing = Array.from(container.children).filter(
                (el) => el !== placeholder && el !== draggingEl && isDraggableNavButton(el)
            );
            const lastEligible = trailing[trailing.length - 1];
            if (lastEligible) {
                lastEligible.after(placeholder);
            } else if (draggingEl.parentNode === container) {
                container.insertBefore(placeholder, draggingEl);
            } else {
                container.appendChild(placeholder);
            }
        });
    }

    function updateFloaterPosition(state, clientX, clientY) {
        state.draggingEl.style.left = `${clientX - state.floatOffsetX}px`;
        const y = clientY != null ? clientY - state.floatOffsetY : state.lockedTop;
        // Keep a soft vertical follow so the chip feels lifted, not stuck on one row.
        const lift = prefersReducedMotion() ? 0 : 8;
        state.draggingEl.style.top = `${y - lift}px`;
    }

    function cancelPendingDrag(state) {
        if (!state) {
            return;
        }
        clearTimeout(state.pressTimer);
        state.draggingEl.classList.remove('is-nav-reorder-pending');
    }

    function finishDrag(commit) {
        if (!dragState) {
            return;
        }
        const state = dragState;
        dragState = null;

        cancelPendingDrag(state);
        state.draggingEl.classList.remove('is-nav-dragging');
        state.draggingEl.removeAttribute('aria-grabbed');
        state.container.classList.remove('is-reorder-active');
        if (state.sourceContainer) {
            state.sourceContainer.classList.remove('is-reorder-active');
        }
        clearSiblingShiftStyles(state.container);
        if (state.sourceContainer && state.sourceContainer !== state.container) {
            clearSiblingShiftStyles(state.sourceContainer);
        }

        if (state.placeholder && state.placeholder.parentNode) {
            state.container.insertBefore(state.draggingEl, state.placeholder);
            state.placeholder.remove();
        }
        clearFloaterStyles(state.draggingEl);

        if (state.captured && state.draggingEl.releasePointerCapture) {
            try {
                state.draggingEl.releasePointerCapture(state.pointerId);
            } catch (_) {
                /* ignore */
            }
        }

        if (commit && state.didDrag && !state.dropBlocked) {
            if (state.kind === 'zone' && typeof hooks.setZoneOrder === 'function') {
                const newOrder = readOrderFromContainer(state.container, getNavItemId);
                hooks.setZoneOrder(newOrder);
            } else if (state.kind === 'segment') {
                const movingTabId = getNavItemId(state.draggingEl);
                const targetZoneId = state.container.dataset.zone;
                const sourceZoneId = state.sourceContainer && state.sourceContainer.dataset.zone;
                const insertBeforeEl = state.draggingEl.nextElementSibling
                    && isDraggableNavButton(state.draggingEl.nextElementSibling)
                    ? state.draggingEl.nextElementSibling
                    : null;
                const insertBeforeTabId = insertBeforeEl ? getNavItemId(insertBeforeEl) : '';

                if (
                    typeof hooks.setTabLayout === 'function'
                    && typeof hooks.getTabZoneMap === 'function'
                    && typeof hooks.getTabOrder === 'function'
                ) {
                    const currentLayout = {
                        navTabZone: hooks.getTabZoneMap(),
                        navTabOrder: {}
                    };
                    document.querySelectorAll('.app-zone-segment-panel').forEach((panel) => {
                        const zid = panel.dataset.zone;
                        if (zid) {
                            currentLayout.navTabOrder[zid] = (hooks.getTabOrder(zid) || []).slice();
                        }
                    });

                    if (sourceZoneId === targetZoneId) {
                        currentLayout.navTabOrder[targetZoneId] = readOrderFromContainer(
                            state.container,
                            getNavItemId
                        );
                        hooks.setTabLayout(currentLayout);
                        applyOrder();
                    } else if (global.CCPNavTabLayout && global.CCPNavTabLayout.applyCrossZoneMove) {
                        const result = global.CCPNavTabLayout.applyCrossZoneMove(
                            currentLayout,
                            movingTabId,
                            targetZoneId,
                            insertBeforeTabId
                        );
                        if (!result.ok) {
                            if (typeof hooks.onIllegalDrop === 'function') {
                                hooks.onIllegalDrop(result.reason);
                            }
                            applyOrder();
                        } else {
                            // Ensure insert position matches DOM drop slot.
                            const ordered = readOrderFromContainer(state.container, getNavItemId);
                            if (!ordered.includes(movingTabId)) {
                                const withMoving = ordered.slice();
                                let at = withMoving.length;
                                if (insertBeforeTabId) {
                                    const idx = withMoving.indexOf(insertBeforeTabId);
                                    if (idx >= 0) {
                                        at = idx;
                                    }
                                }
                                withMoving.splice(at, 0, movingTabId);
                                result.layout.navTabOrder[targetZoneId] = withMoving;
                            } else {
                                result.layout.navTabOrder[targetZoneId] = ordered;
                            }
                            hooks.setTabLayout(result.layout);
                            applyOrder();
                        }
                    }
                } else if (typeof hooks.setSegmentOrder === 'function' && targetZoneId) {
                    const newOrder = readOrderFromContainer(state.container, getNavItemId);
                    hooks.setSegmentOrder(targetZoneId, newOrder);
                }
            }
            if (typeof hooks.saveUiState === 'function') {
                hooks.saveUiState();
            }
            if (typeof hooks.showSavedToast === 'function') {
                hooks.showSavedToast();
            }
        } else if (commit && state.didDrag && state.dropBlocked) {
            if (typeof hooks.onIllegalDrop === 'function') {
                hooks.onIllegalDrop('illegal-drop');
            }
            applyOrder();
        }

        if (state.suppressClick) {
            const el = state.draggingEl;
            const suppress = (e) => {
                e.preventDefault();
                e.stopPropagation();
                el.removeEventListener('click', suppress, true);
            };
            el.addEventListener('click', suppress, true);
            window.setTimeout(() => {
                el.removeEventListener('click', suppress, true);
            }, 0);
        }
        clearDragPreview(state);
        unbindDocumentPointerListeners();
    }

    function onPointerMove(e) {
        if (!dragState || e.pointerId !== dragState.pointerId) {
            return;
        }
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        const dist = Math.hypot(dx, dy);
        if (!dragState.active) {
            if (dragState.useMouseDrag) {
                if (dist < MOUSE_DRAG_START_PX) {
                    return;
                }
                startDrag(dragState, e);
            } else if (dist > TOUCH_MOVE_CANCEL_PX) {
                cancelPendingDrag(dragState);
                dragState = null;
                unbindDocumentPointerListeners();
                return;
            } else {
                return;
            }
        }
        e.preventDefault();
        dragState.didDrag = true;
        dragState.suppressClick = true;
        updateFloaterPosition(dragState, e.clientX, e.clientY);
        movePlaceholder(dragState, e.clientX, e.clientY);
    }

    function onPointerUp(e) {
        if (!dragState || e.pointerId !== dragState.pointerId) {
            return;
        }
        const wasActive = dragState.active;
        if (!wasActive) {
            cancelPendingDrag(dragState);
            dragState = null;
            unbindDocumentPointerListeners();
            return;
        }
        finishDrag(wasActive);
    }

    function startDrag(state, pointerEvent) {
        clearTimeout(state.pressTimer);
        state.active = true;
        state.didDrag = false;
        state.suppressClick = false;
        state.container.classList.add('is-reorder-active');
        state.draggingEl.classList.remove('is-nav-reorder-pending');
        state.draggingEl.classList.add('is-nav-dragging');
        state.draggingEl.setAttribute('aria-grabbed', 'true');

        const rect = state.draggingEl.getBoundingClientRect();
        const point = pointerEvent || { clientX: state.startX, clientY: state.startY };
        state.floatOffsetX = point.clientX - rect.left;
        state.floatOffsetY = point.clientY - rect.top;
        state.lockedTop = rect.top;

        const placeholder = createPlaceholder(state.draggingEl);
        state.container.insertBefore(placeholder, state.draggingEl);
        state.placeholder = placeholder;

        state.draggingEl.style.position = 'fixed';
        state.draggingEl.style.left = `${rect.left}px`;
        state.draggingEl.style.top = `${rect.top}px`;
        state.draggingEl.style.width = `${rect.width}px`;
        state.draggingEl.style.height = `${rect.height}px`;
        state.draggingEl.style.zIndex = '';
        state.draggingEl.style.margin = '0';
        state.draggingEl.style.touchAction = 'none';

        if (state.draggingEl.setPointerCapture) {
            try {
                state.draggingEl.setPointerCapture(state.pointerId);
                state.captured = true;
            } catch (_) {
                state.captured = false;
            }
        }

        updateFloaterPosition(state, point.clientX, point.clientY);

        if (state.kind === 'segment') {
            state.sourceZoneId = state.sourceContainer.dataset.zone || '';
            state.previewZoneId = state.sourceZoneId;
            state.contentTabId = typeof hooks?.getActiveTabId === 'function' ? hooks.getActiveTabId() : '';
            document.body.classList.add('is-nav-cross-zone-drag', 'is-nav-drop-preview');
            const segmentNav = document.getElementById('appZoneSegmentNav');
            if (segmentNav) {
                state.segmentNavTitleBackup = segmentNav.getAttribute('title') || '';
                const hint = typeof hooks?.t === 'function'
                    ? (hooks.t('navReorderCrossZoneHint') || hooks.t('navReorderHint'))
                    : '';
                if (hint) {
                    segmentNav.title = hint;
                }
            }
            setDragPreviewZone(state, {
                zoneId: state.sourceZoneId,
                panel: state.sourceContainer,
                blocked: false
            });
        }
    }

    function onPointerDown(e) {
        if (dragState || e.button !== 0) {
            return;
        }
        const container = e.currentTarget;
        const kind = container.dataset.navReorderKind;
        const draggingEl = e.target.closest(kind === 'zone' ? '.app-zone-btn' : '.app-zone-segment-btn');
        if (!draggingEl || !container.contains(draggingEl) || !isDraggableNavButton(draggingEl)) {
            return;
        }
        const useMouseDrag = isMousePointer(e);
        const state = {
            kind,
            container,
            sourceContainer: container,
            sourceZoneId: container.dataset.zone || '',
            previewZoneId: '',
            contentTabId: '',
            segmentNavTitleBackup: undefined,
            draggingEl,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            active: false,
            didDrag: false,
            suppressClick: false,
            captured: false,
            useMouseDrag,
            pressTimer: null,
            placeholder: null,
            floatOffsetX: 0,
            floatOffsetY: 0,
            lockedTop: 0,
            dropBlocked: false
        };
        if (!useMouseDrag) {
            draggingEl.classList.add('is-nav-reorder-pending');
            state.pressTimer = window.setTimeout(() => {
                if (!dragState || dragState.draggingEl !== draggingEl) {
                    return;
                }
                startDrag(dragState, null);
            }, LONG_PRESS_MS);
        }
        dragState = state;
        bindDocumentPointerListeners();
    }

    function bindContainer(container, kind) {
        if (!container || container.dataset.navReorderBound === '1') {
            return;
        }
        // Segment panels may start with <2 visible children but still accept cross-zone drops.
        if (kind === 'zone' && getEligibleChildren(container).length < 2) {
            return;
        }
        container.dataset.navReorderBound = '1';
        container.dataset.navReorderKind = kind;
        container.addEventListener('pointerdown', onPointerDown);
    }

    function init(nextHooks) {
        hooks = nextHooks || null;
        if (bound || !hooks) {
            return;
        }
        bound = true;

        const zoneNav = document.getElementById('appZoneNav');
        const segmentNav = document.getElementById('appZoneSegmentNav');
        if (zoneNav && typeof hooks.t === 'function') {
            const hint = hooks.t('navReorderHint');
            if (hint) {
                zoneNav.title = hint;
            }
        }
        if (segmentNav && typeof hooks.t === 'function') {
            const hint = hooks.t('navReorderCrossZoneHint') || hooks.t('navReorderHint');
            if (hint) {
                segmentNav.title = hint;
            }
        }

        bindContainer(zoneNav, 'zone');
        document.querySelectorAll('.app-zone-segment-panel').forEach((panel) => {
            bindContainer(panel, 'segment');
        });
    }

    global.CCPZoneNavReorder = {
        init,
        applyOrder,
        normalizeZoneOrder,
        normalizeSegmentOrder
    };
})(typeof window !== 'undefined' ? window : globalThis);
