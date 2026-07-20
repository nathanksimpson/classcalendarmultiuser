/**
 * Tab layout helpers: default zone membership, migrate segment order → tabId order,
 * normalize custom assignments, empty-zone / Data guards.
 */
(function navTabLayoutModule(global) {
    'use strict';

    const ARCHIVED_SEGMENT_IDS = new Set(['command-center']);
    const FIXED_SEGMENT_TAB_IDS = new Set(['teachers', 'portfolio', 'command-center', 'data']);
    const NO_SEGMENT_ZONES = new Set(['more']);

    function buildTabIdToSegment(zoneSegmentToTab) {
        const map = {};
        Object.keys(zoneSegmentToTab || {}).forEach((zoneId) => {
            const segs = zoneSegmentToTab[zoneId] || {};
            Object.keys(segs).forEach((segmentId) => {
                const tabId = segs[segmentId];
                if (tabId) {
                    map[tabId] = segmentId;
                }
            });
        });
        return map;
    }

    function buildDefaultTabZone(zoneSegmentToTab) {
        const map = {};
        Object.keys(zoneSegmentToTab || {}).forEach((zoneId) => {
            if (NO_SEGMENT_ZONES.has(zoneId)) {
                return;
            }
            const segs = zoneSegmentToTab[zoneId] || {};
            Object.keys(segs).forEach((segmentId) => {
                const tabId = segs[segmentId];
                if (tabId && !ARCHIVED_SEGMENT_IDS.has(segmentId)) {
                    map[tabId] = zoneId;
                }
            });
        });
        return map;
    }

    function buildDefaultTabOrder(zoneSegmentToTab) {
        const out = {};
        Object.keys(zoneSegmentToTab || {}).forEach((zoneId) => {
            if (NO_SEGMENT_ZONES.has(zoneId)) {
                out[zoneId] = [];
                return;
            }
            const segs = zoneSegmentToTab[zoneId] || {};
            out[zoneId] = Object.keys(segs)
                .filter((segmentId) => !ARCHIVED_SEGMENT_IDS.has(segmentId))
                .map((segmentId) => segs[segmentId])
                .filter(Boolean);
        });
        return out;
    }

    function migrateSegmentOrderToTabOrder(navSegmentOrder, zoneSegmentToTab) {
        const result = {};
        Object.keys(zoneSegmentToTab || {}).forEach((zoneId) => {
            const segs = zoneSegmentToTab[zoneId] || {};
            const stored = navSegmentOrder && Array.isArray(navSegmentOrder[zoneId])
                ? navSegmentOrder[zoneId]
                : Object.keys(segs);
            const tabIds = [];
            stored.forEach((segmentId) => {
                if (ARCHIVED_SEGMENT_IDS.has(segmentId)) {
                    return;
                }
                const tabId = segs[segmentId];
                if (tabId && !tabIds.includes(tabId)) {
                    tabIds.push(tabId);
                }
            });
            Object.keys(segs).forEach((segmentId) => {
                if (ARCHIVED_SEGMENT_IDS.has(segmentId)) {
                    return;
                }
                const tabId = segs[segmentId];
                if (tabId && !tabIds.includes(tabId)) {
                    tabIds.push(tabId);
                }
            });
            result[zoneId] = tabIds;
        });
        return result;
    }

    function normalizeTabLayout(input, zoneSegmentToTab, zoneIds) {
        const defaultsZone = buildDefaultTabZone(zoneSegmentToTab);
        const defaultsOrder = buildDefaultTabOrder(zoneSegmentToTab);
        const allowedZones = new Set((zoneIds || Object.keys(zoneSegmentToTab || {})).filter(Boolean));
        const allowedTabs = new Set(Object.keys(defaultsZone));

        const navTabZone = {};
        const rawZone = input && input.navTabZone && typeof input.navTabZone === 'object'
            ? input.navTabZone
            : {};
        Object.keys(defaultsZone).forEach((tabId) => {
            const requested = String(rawZone[tabId] || '').trim();
            if (
                requested
                && allowedZones.has(requested)
                && !NO_SEGMENT_ZONES.has(requested)
                && !FIXED_SEGMENT_TAB_IDS.has(tabId)
            ) {
                navTabZone[tabId] = requested;
            } else {
                navTabZone[tabId] = defaultsZone[tabId];
            }
        });

        const navTabOrder = {};
        const rawOrder = input && input.navTabOrder && typeof input.navTabOrder === 'object'
            ? input.navTabOrder
            : {};

        allowedZones.forEach((zoneId) => {
            if (NO_SEGMENT_ZONES.has(zoneId)) {
                navTabOrder[zoneId] = [];
                return;
            }
            const assigned = Object.keys(navTabZone).filter((tabId) => navTabZone[tabId] === zoneId);
            const preferred = Array.isArray(rawOrder[zoneId]) ? rawOrder[zoneId] : defaultsOrder[zoneId] || [];
            const ordered = [];
            preferred.forEach((tabId) => {
                if (assigned.includes(tabId) && !ordered.includes(tabId)) {
                    ordered.push(tabId);
                }
            });
            assigned.forEach((tabId) => {
                if (!ordered.includes(tabId)) {
                    ordered.push(tabId);
                }
            });
            navTabOrder[zoneId] = ordered;
        });

        // Forbid empty segment zones: restore any emptied zone from defaults.
        Object.keys(defaultsOrder).forEach((zoneId) => {
            if (NO_SEGMENT_ZONES.has(zoneId)) {
                return;
            }
            if ((navTabOrder[zoneId] || []).length > 0) {
                return;
            }
            const restore = defaultsOrder[zoneId] || [];
            restore.forEach((tabId) => {
                navTabZone[tabId] = zoneId;
            });
            navTabOrder[zoneId] = restore.slice();
            // Remove restored tabs from other zones' orders
            Object.keys(navTabOrder).forEach((otherZone) => {
                if (otherZone === zoneId) {
                    return;
                }
                navTabOrder[otherZone] = (navTabOrder[otherZone] || []).filter(
                    (tabId) => navTabZone[tabId] === otherZone
                );
            });
        });

        // Only store overrides that differ from defaults (optional slim form for sync)
        const overrides = {};
        Object.keys(navTabZone).forEach((tabId) => {
            if (navTabZone[tabId] !== defaultsZone[tabId]) {
                overrides[tabId] = navTabZone[tabId];
            }
        });

        return {
            navTabZone,
            navTabOrder,
            navTabZoneOverrides: overrides,
            allowedTabs
        };
    }

    function canAcceptSegmentDrop(targetZoneId, movingTabId, options) {
        const opts = options || {};
        if (!targetZoneId || !movingTabId) {
            return false;
        }
        if (NO_SEGMENT_ZONES.has(targetZoneId)) {
            return false;
        }
        if (FIXED_SEGMENT_TAB_IDS.has(movingTabId)) {
            return false;
        }
        if (ARCHIVED_SEGMENT_IDS.has(opts.segmentId)) {
            return false;
        }
        return true;
    }

    function wouldEmptySourceZone(navTabOrder, sourceZoneId, movingTabId) {
        const order = (navTabOrder && navTabOrder[sourceZoneId]) || [];
        const remaining = order.filter((id) => id !== movingTabId);
        return remaining.length === 0;
    }

    function applyCrossZoneMove(layout, movingTabId, targetZoneId, insertBeforeTabId) {
        const navTabZone = Object.assign({}, layout.navTabZone || {});
        const navTabOrder = {};
        Object.keys(layout.navTabOrder || {}).forEach((zoneId) => {
            navTabOrder[zoneId] = (layout.navTabOrder[zoneId] || []).slice();
        });
        const sourceZoneId = navTabZone[movingTabId];
        if (!sourceZoneId || !canAcceptSegmentDrop(targetZoneId, movingTabId)) {
            return { ok: false, reason: 'illegal-drop', layout };
        }
        if (sourceZoneId === targetZoneId) {
            const list = navTabOrder[targetZoneId] || [];
            const without = list.filter((id) => id !== movingTabId);
            let insertAt = without.length;
            if (insertBeforeTabId) {
                const idx = without.indexOf(insertBeforeTabId);
                if (idx >= 0) {
                    insertAt = idx;
                }
            }
            without.splice(insertAt, 0, movingTabId);
            navTabOrder[targetZoneId] = without;
            return {
                ok: true,
                layout: { navTabZone, navTabOrder }
            };
        }
        if (wouldEmptySourceZone(navTabOrder, sourceZoneId, movingTabId)) {
            return { ok: false, reason: 'empty-zone', layout };
        }
        navTabOrder[sourceZoneId] = (navTabOrder[sourceZoneId] || []).filter((id) => id !== movingTabId);
        navTabZone[movingTabId] = targetZoneId;
        const targetList = (navTabOrder[targetZoneId] || []).filter((id) => id !== movingTabId);
        let insertAt = targetList.length;
        if (insertBeforeTabId) {
            const idx = targetList.indexOf(insertBeforeTabId);
            if (idx >= 0) {
                insertAt = idx;
            }
        }
        targetList.splice(insertAt, 0, movingTabId);
        navTabOrder[targetZoneId] = targetList;
        return {
            ok: true,
            layout: { navTabZone, navTabOrder }
        };
    }

    function getZoneForTab(tabId, navTabZone, zoneSegmentToTab) {
        if (navTabZone && navTabZone[tabId]) {
            return navTabZone[tabId];
        }
        const defaults = buildDefaultTabZone(zoneSegmentToTab);
        return defaults[tabId] || null;
    }

    function segmentForTab(tabId, zoneSegmentToTab) {
        const map = buildTabIdToSegment(zoneSegmentToTab);
        return map[tabId] || tabId;
    }

    function tabForZoneSegment(zoneId, segmentId, zoneSegmentToTab, navTabZone) {
        // Prefer a tab that is assigned to this zone and uses this segment id.
        const tabIdToSegment = buildTabIdToSegment(zoneSegmentToTab);
        const candidates = Object.keys(tabIdToSegment).filter(
            (tabId) => tabIdToSegment[tabId] === segmentId
        );
        if (candidates.length === 1) {
            return candidates[0];
        }
        if (candidates.length > 1) {
            const assigned = candidates.find(
                (tabId) => getZoneForTab(tabId, navTabZone, zoneSegmentToTab) === zoneId
            );
            if (assigned) {
                return assigned;
            }
            const defaultZone = buildDefaultTabZone(zoneSegmentToTab);
            const byDefault = candidates.find((tabId) => defaultZone[tabId] === zoneId);
            if (byDefault) {
                return byDefault;
            }
        }
        const segs = (zoneSegmentToTab && zoneSegmentToTab[zoneId]) || {};
        return segs[segmentId] || null;
    }

    global.CCPNavTabLayout = {
        ARCHIVED_SEGMENT_IDS,
        FIXED_SEGMENT_TAB_IDS,
        NO_SEGMENT_ZONES,
        buildTabIdToSegment,
        buildDefaultTabZone,
        buildDefaultTabOrder,
        migrateSegmentOrderToTabOrder,
        normalizeTabLayout,
        canAcceptSegmentDrop,
        wouldEmptySourceZone,
        applyCrossZoneMove,
        getZoneForTab,
        segmentForTab,
        tabForZoneSegment
    };
})(typeof window !== 'undefined' ? window : globalThis);
