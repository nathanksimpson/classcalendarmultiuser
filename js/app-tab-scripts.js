/**
 * Defer tab-specific scripts until first visit (smaller initial download).
 */
(function (global) {
    const TAB_SCRIPTS = {
        cohorts: [
            'js/teacher-timetable.js?v=20260601-cohort-ux',
            'js/cohort-management.js?v=20260601-ui-consistency'
        ],
        timetable: [
            'js/teacher-timetable.js?v=20260608-cohort-first',
            'js/timetable-export.js?v=20260602-tab-fast'
        ],
        teachers: [
            'js/teacher-timetable.js?v=20260608-cohort-first',
            'js/teacher-management.js?v=20260601-ui-consistency',
            'js/class-curriculum-slices.js?v=20260608-teachers-tab'
        ],
        curriculum: ['js/class-curriculum-slices.js?v=20260608-teachers-tab'],
        calendar: ['js/class-curriculum-slices.js?v=20260608-teachers-tab']
    };

    const loaded = new Set();
    const inflight = new Map();

    function scriptMarker(src) {
        return src.split('?')[0];
    }

    function isScriptLoaded(marker) {
        return loaded.has(marker);
    }

    function tabNeedsScripts(tabId) {
        const list = TAB_SCRIPTS[tabId];
        if (!list || !list.length) {
            return false;
        }
        return list.some((src) => !isScriptLoaded(scriptMarker(src)));
    }

    function loadScript(src) {
        const marker = scriptMarker(src);
        if (loaded.has(marker)) {
            return Promise.resolve();
        }
        if (inflight.has(marker)) {
            return inflight.get(marker);
        }
        const p = new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-cc-tab-src="' + marker + '"]');
            if (existing) {
                if (existing.dataset.ccLoaded === '1') {
                    loaded.add(marker);
                    resolve();
                    return;
                }
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error('Failed to load ' + src)), {
                    once: true
                });
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.defer = true;
            script.dataset.ccTabSrc = marker;
            script.onload = () => {
                script.dataset.ccLoaded = '1';
                loaded.add(marker);
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load ' + src));
            document.head.appendChild(script);
        }).finally(() => {
            inflight.delete(marker);
        });
        inflight.set(marker, p);
        return p;
    }

    async function ensureTabScripts(tabId) {
        const list = TAB_SCRIPTS[tabId];
        if (!list || !list.length) {
            return;
        }
        const unique = [...new Set(list)];
        await Promise.all(unique.map(loadScript));
    }

    /** Load slices before print when calendar filters use multi-curriculum display. */
    async function ensurePrintScripts() {
        await ensureTabScripts('calendar');
    }

    global.CCPTabScripts = {
        ensureTabScripts,
        ensurePrintScripts,
        tabNeedsScripts
    };
})(typeof window !== 'undefined' ? window : globalThis);
