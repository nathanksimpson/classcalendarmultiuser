/**
 * Prune stale classCalendarData localStorage keys (browser footprint).
 */
(function (global) {
    const DOMAIN_PREFIX = 'classCalendarData:';
    const LEGACY_KEY = 'classCalendarData';
    const UI_PREFIX = 'classCalendarUi:';
    const ACTIVE_IDS = ['teamCalendarActiveId'];

    function listDomainStorageKeys() {
        const keys = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && (k === LEGACY_KEY || k.startsWith(DOMAIN_PREFIX))) {
                    keys.push(k);
                }
            }
        } catch (_) {
            /* ignore */
        }
        return keys;
    }

    function normalizeCalendarIds(ids) {
        const set = new Set();
        if (!ids) {
            return set;
        }
        const list = Array.isArray(ids) ? ids : [ids];
        list.forEach((id) => {
            if (id != null && String(id).trim()) {
                set.add(String(id));
            }
        });
        return set;
    }

    /** Legacy: classCalendarUi:{calendarId}. User-scoped: classCalendarUi:{userId}:{calendarId}. */
    function isLegacyUiKey(key) {
        if (!key || !key.startsWith(UI_PREFIX)) {
            return false;
        }
        return (key.match(/:/g) || []).length === 1;
    }

    function calendarIdFromUiKey(key) {
        if (!key || !key.startsWith(UI_PREFIX)) {
            return null;
        }
        const rest = key.slice(UI_PREFIX.length);
        const sep = rest.lastIndexOf(':');
        if (sep >= 0) {
            return rest.slice(sep + 1);
        }
        return rest;
    }

    function removeDomainStorageKeys() {
        listDomainStorageKeys().forEach((key) => {
            try {
                localStorage.removeItem(key);
            } catch (_) {
                /* ignore */
            }
        });
    }

    /**
     * @param {object} [options]
     * @param {string[]} [options.keepCalendarIds] - calendar ids to retain domain copies for
     * @param {string} [options.activeCalendarId] - current calendar (always kept if set)
     * @param {boolean} [options.removeLegacy] - drop legacy classCalendarData key
     * @param {boolean} [options.pruneUi] - remove UI keys for calendars not in keep set
     */
    function pruneCalendarLocalStorage(options) {
        const opts = options || {};
        const keep = normalizeCalendarIds(opts.keepCalendarIds);
        if (opts.activeCalendarId) {
            keep.add(String(opts.activeCalendarId));
        }

        listDomainStorageKeys().forEach((key) => {
            if (key === LEGACY_KEY) {
                if (opts.removeLegacy !== false && keep.size > 0) {
                    try {
                        localStorage.removeItem(LEGACY_KEY);
                    } catch (_) {
                        /* ignore */
                    }
                }
                return;
            }
            const id = key.slice(DOMAIN_PREFIX.length);
            if (!keep.has(id)) {
                try {
                    localStorage.removeItem(key);
                } catch (_) {
                    /* ignore */
                }
            }
        });

        if (!opts.pruneUi) {
            return;
        }
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || !k.startsWith(UI_PREFIX)) {
                    continue;
                }
                const calId = calendarIdFromUiKey(k);
                if (calId && !keep.has(calId)) {
                    localStorage.removeItem(k);
                }
            }
        } catch (_) {
            /* ignore */
        }
    }

    /** Remove all domain calendar blobs and UI prefs; keep theme/language unless caller clears those. */
    function clearAllCalendarDomainStorage() {
        removeDomainStorageKeys();
        try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (k && k.startsWith(UI_PREFIX)) {
                    localStorage.removeItem(k);
                }
            }
        } catch (_) {
            /* ignore */
        }
    }

    function pruneOnCalendarSwitch(previousId, nextId, calendarList) {
        const keepIds = (calendarList || []).map((c) => c.id).filter(Boolean);
        pruneCalendarLocalStorage({
            keepCalendarIds: keepIds,
            activeCalendarId: nextId || previousId,
            removeLegacy: true,
            pruneUi: true
        });
    }

    /** Domain cache only — per-user UI prefs (classCalendarUi:{userId}:…) and session keys are kept. */
    function pruneOnLogout() {
        removeDomainStorageKeys();
        try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (k && isLegacyUiKey(k)) {
                    localStorage.removeItem(k);
                }
            }
        } catch (_) {
            /* ignore */
        }
    }

    global.CCPStoragePrune = {
        pruneCalendarLocalStorage,
        pruneOnCalendarSwitch,
        pruneOnLogout,
        clearAllCalendarDomainStorage,
        listDomainStorageKeys
    };
})(typeof window !== 'undefined' ? window : globalThis);
