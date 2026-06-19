/**
 * Long-press (touch) or click-drag (mouse) reorder for zone + segment nav tabs.
 */
(function zoneNavReorderModule(global) {
    'use strict';

    const LONG_PRESS_MS = 450;
    const TOUCH_MOVE_CANCEL_PX = 8;
    const MOUSE_DRAG_START_PX = 6;
    const ARCHIVED_SEGMENT_IDS = new Set(['command-center']);

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
        if (segment && ARCHIVED_SEGMENT_IDS.has(segment)) {
            return false;
        }
        return !!(el.dataset.zone || el.dataset.segment);
    }

    function getNavItemId(el) {
        return el.dataset.zone || el.dataset.segment || '';
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

    function applySegmentOrders() {
        if (!hooks || typeof hooks.getSegmentOrder !== 'function') {
            return;
        }
        document.querySelectorAll('.app-zone-segment-panel').forEach((panel) => {
            const zoneId = panel.dataset.zone;
            if (!zoneId) {
                return;
            }
            sortChildren(panel, hooks.getSegmentOrder(zoneId), getNavItemId);
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

    function movePlaceholder(state, pointerX) {
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

    function updateFloaterPosition(state, clientX) {
        state.draggingEl.style.left = `${clientX - state.floatOffsetX}px`;
        state.draggingEl.style.top = `${state.lockedTop}px`;
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
        clearSiblingShiftStyles(state.container);

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

        if (commit && state.didDrag) {
            const newOrder = readOrderFromContainer(state.container, getNavItemId);
            if (state.kind === 'zone' && typeof hooks.setZoneOrder === 'function') {
                hooks.setZoneOrder(newOrder);
            } else if (state.kind === 'segment' && typeof hooks.setSegmentOrder === 'function') {
                const zoneId = state.container.dataset.zone;
                if (zoneId) {
                    hooks.setSegmentOrder(zoneId, newOrder);
                }
            }
            if (typeof hooks.saveUiState === 'function') {
                hooks.saveUiState();
            }
            if (typeof hooks.showSavedToast === 'function') {
                hooks.showSavedToast();
            }
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
        updateFloaterPosition(dragState, e.clientX);
        movePlaceholder(dragState, e.clientX);
    }

    function onPointerUp(e) {
        if (!dragState || e.pointerId !== dragState.pointerId) {
            return;
        }
        const wasActive = dragState.active;
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
        state.draggingEl.style.zIndex = '1200';

        if (state.draggingEl.setPointerCapture) {
            try {
                state.draggingEl.setPointerCapture(state.pointerId);
                state.captured = true;
            } catch (_) {
                state.captured = false;
            }
        }

        updateFloaterPosition(state, point.clientX);
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
            lockedTop: 0
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
        if (getEligibleChildren(container).length < 2) {
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
            const hint = hooks.t('navReorderHint');
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
