/**
 * Defer tab-specific scripts until first visit (smaller initial download).
 */
(function (global) {
    const TAB_SCRIPTS = {
        cohorts: [
            'js/teacher-timetable.js?v=20260609-combine-match',
            'js/meeting-days-control.js?v=20260610-setup-board',
            'js/cohort-management.js?v=20260612-cohort-homeroom-crosssave',
            'js/setup-board.js?v=20260603-title-rename'
        ],
        timetable: [
            'js/teacher-timetable.js?v=20260609-combine-match',
            'js/timetable-export.js?v=20260602-tab-fast'
        ],
        teachers: [
            'js/teacher-timetable.js?v=20260609-combine-match',
            'js/teacher-management.js?v=20260610-setup-board',
            'js/class-curriculum-slices.js?v=20260603-cal-suffix2'
        ],
        curriculum: ['js/class-curriculum-slices.js?v=20260603-curriculum-pipeline'],
        classes: ['js/class-curriculum-slices.js?v=20260603-curriculum-pipeline'],
        syllabus: ['js/class-curriculum-slices.js?v=20260603-curriculum-pipeline'],
        calendar: [
            'js/teacher-timetable.js?v=20260609-combine-match',
            'js/class-curriculum-slices.js?v=20260603-cal-suffix2'
        ],
        students: [
            'js/roster-import.js?v=20260612-roster-paste-tab',
            'js/classroom-access.js?v=20260612-classroom-mvp',
            'js/classroom-student-row.js?v=20260612-classroom-density',
            'js/classroom-roster.js?v=20260612-note-categories'
        ],
        attendance: [
            'js/classroom-access.js?v=20260612-classroom-mvp',
            'js/classroom-student-row.js?v=20260612-classroom-density',
            'js/classroom-header.js?v=20260612-classroom-mvp',
            'js/classroom-attendance.js?v=20260612-classroom-density'
        ],
        'homework-tracking': [
            'js/classroom-access.js?v=20260612-classroom-mvp',
            'js/classroom-student-row.js?v=20260612-classroom-density',
            'js/classroom-header.js?v=20260612-classroom-mvp',
            'js/classroom-homework.js?v=20260612-classroom-density'
        ]
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

    function scriptVersion(src) {
        const m = String(src).match(/\?v=([^&]+)/);
        return m ? m[1] : '';
    }

    function loadScript(src) {
        const marker = scriptMarker(src);
        const version = scriptVersion(src);
        const existing = document.querySelector('script[data-cc-tab-src="' + marker + '"]');
        if (existing && version && (existing.dataset.ccVersion || '') !== version) {
            existing.remove();
            loaded.delete(marker);
            inflight.delete(marker);
        }
        if (loaded.has(marker)) {
            return Promise.resolve();
        }
        if (inflight.has(marker)) {
            return inflight.get(marker);
        }
        const p = new Promise((resolve, reject) => {
            const prior = document.querySelector('script[data-cc-tab-src="' + marker + '"]');
            if (prior) {
                if (prior.dataset.ccLoaded === '1') {
                    loaded.add(marker);
                    resolve();
                    return;
                }
                prior.addEventListener('load', () => resolve(), { once: true });
                prior.addEventListener('error', () => reject(new Error('Failed to load ' + src)), {
                    once: true
                });
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.defer = true;
            script.dataset.ccTabSrc = marker;
            if (version) {
                script.dataset.ccVersion = version;
            }
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
