/**
 * Defer tab-specific scripts until first visit (smaller initial download).
 */
(function (global) {
    const TAB_SCRIPTS = {
        cohorts: [
            'js/teacher-timetable.js?v=20260612-timetable-conflicts',
            'js/meeting-days-control.js?v=20260610-setup-board',
            'js/cohort-management.js?v=20260629-ui-fixes',
            'js/setup-board.js?v=20260629-ui-fixes',
            'js/cohorts-class-detail.js?v=20260703-design-fidelity'
        ],
        timetable: [
            'js/timetable-periods.js?v=20260619-term-flex',
            'js/teacher-timetable.js?v=20260619-term-flex',
            'js/timetable-export.js?v=20260602-tab-fast'
        ],
        teachers: [
            'js/teacher-timetable.js?v=20260612-timetable-conflicts',
            'js/teacher-management.js?v=20260610-setup-board',
            'js/class-curriculum-slices.js?v=20260603-cal-suffix2'
        ],
        curriculum: ['js/class-curriculum-slices.js?v=20260603-curriculum-pipeline'],
        classes: ['js/class-curriculum-slices.js?v=20260603-curriculum-pipeline'],
        syllabus: ['js/class-curriculum-slices.js?v=20260603-curriculum-pipeline'],
        calendar: [
            'js/teacher-timetable.js?v=20260612-timetable-conflicts',
            'js/class-curriculum-slices.js?v=20260603-cal-suffix2'
        ],
        homework: ['js/homework-tab.js?v=20260619-ui-overhaul'],
        students: [
            'js/essay-tracker-import.js?v=20260630-essay-import',
            'js/roster-import.js?v=20260630-essay-import',
            'js/classroom-access.js?v=20260612-classroom-mvp',
            'js/classroom-student-row.js?v=20260708-essays-visual',
            'js/classroom-roster.js?v=20260701-roster-ui'
        ],
        attendance: [
            'js/classroom-access.js?v=20260612-classroom-mvp',
            'js/classroom-student-row.js?v=20260708-essays-visual',
            'js/classroom-header.js?v=20260703-zone-context',
            'js/classroom-attendance.js?v=20260703-zone-context'
        ],
        'homework-tracking': [
            'js/classroom-access.js?v=20260612-classroom-mvp',
            'js/classroom-student-row.js?v=20260708-essays-visual',
            'js/classroom-header.js?v=20260703-zone-context',
            'js/classroom-homework.js?v=20260703-zone-context'
        ],
        essays: [
            'js/classroom-access.js?v=20260612-classroom-mvp',
            'js/classroom-student-row.js?v=20260708-essays-visual',
            'js/classroom-essay-resubmit-day-note.js?v=20260702-essay-enhance',
            'js/classroom-essay-progress.js?v=20260708-student-progress',
            'js/classroom-essay-progress-print.js?v=20260708-student-progress',
            'js/classroom-essay-resubmit-print.js?v=20260707-essay-context',
            'js/classroom-essay-resubmit-summary.js?v=20260708-essays-redesign',
            'js/classroom-header.js?v=20260707-essay-context',
            'js/classroom-essays.js?v=20260708-essay-ae-badge'
        ],
        ledger: [
            'js/classroom-access.js?v=20260612-classroom-mvp',
            'js/classroom-ledger-bridge.js?v=20260619-ui-overhaul',
            'js/classroom-ledger.js?v=20260703-zone-context'
        ],
        'command-center': [
            'js/command-center.js?v=20260703-design-fidelity'
        ],
        points: [
            'js/classroom-access.js?v=20260612-classroom-mvp',
            'js/classroom-student-row.js?v=20260708-essays-visual',
            'js/classroom-point-reasons.js?v=20260618-point-reasons',
            'js/classroom-points.js?v=20260703-zone-context'
        ],
        tests: [
            'js/classroom-access.js?v=20260612-classroom-mvp',
            'js/classroom-student-row.js?v=20260708-essays-visual',
            'js/classroom-header.js?v=20260703-zone-context',
            'js/classroom-tests.js?v=20260703-zone-context'
        ],
        'debate-teams': [
            'https://cdn.jsdelivr.net/npm/pizzip@3.1.7/dist/pizzip.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
            'js/debate/feedback-templates.js?v=20260710-debate-v2',
            'js/debate/debate-scoresheet-export.js?v=20260720-introduce-rebut',
            'js/debate/debate-teams-v2.js?v=20260720-print-cards-popup',
            'js/classroom-access.js?v=20260612-classroom-mvp',
            'js/classroom-debate-teams.js?v=20260720-roster-meta'
        ]
    };

    const DEBATE_OPTIONAL_SCRIPTS = new Set([
        'https://cdn.jsdelivr.net/npm/pizzip@3.1.7/dist/pizzip.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
    ]);

    const DEBATE_CORE_SCRIPTS = [
        'js/debate/feedback-templates.js?v=20260710-debate-v2',
        'js/debate/debate-scoresheet-export.js?v=20260720-introduce-rebut',
        'js/debate/debate-teams-v2.js?v=20260720-print-cards-popup'
    ];

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
            if (marker.endsWith('debate-teams-v2.js') && !isDebateCoreReady()) {
                invalidateScript(src);
            } else {
                return Promise.resolve();
            }
        }
        if (inflight.has(marker)) {
            return inflight.get(marker);
        }
        const p = new Promise((resolve, reject) => {
            const prior = document.querySelector('script[data-cc-tab-src="' + marker + '"]');
            if (prior) {
                if (prior.dataset.ccLoaded === '1') {
                    if (marker.endsWith('debate-teams-v2.js') && !isDebateCoreReady()) {
                        prior.remove();
                        loaded.delete(marker);
                    } else {
                        loaded.add(marker);
                        resolve();
                        return;
                    }
                } else {
                    prior.addEventListener('load', () => resolve(), { once: true });
                    prior.addEventListener('error', () => reject(new Error('Failed to load ' + src)), {
                        once: true
                    });
                    return;
                }
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

    function invalidateScript(src) {
        const marker = scriptMarker(src);
        loaded.delete(marker);
        inflight.delete(marker);
        const existing = document.querySelector('script[data-cc-tab-src="' + marker + '"]');
        if (existing) {
            existing.remove();
        }
    }

    function isDebateCoreReady() {
        return !!(global.CCPDebateTeamsV2 && global.CCPDebateTeamsV2.collectState);
    }

    async function ensureDebateCoreScripts() {
        if (isDebateCoreReady()) {
            return true;
        }
        await Promise.all(DEBATE_CORE_SCRIPTS.map(loadScript));
        if (isDebateCoreReady()) {
            return true;
        }
        DEBATE_CORE_SCRIPTS.forEach(invalidateScript);
        await Promise.all(DEBATE_CORE_SCRIPTS.map(loadScript));
        return isDebateCoreReady();
    }

    async function ensureTabScripts(tabId) {
        const list = TAB_SCRIPTS[tabId];
        if (!list || !list.length) {
            return;
        }
        const unique = [...new Set(list)];
        if (tabId === 'debate-teams') {
            const required = unique.filter((src) => !DEBATE_OPTIONAL_SCRIPTS.has(src));
            const optional = unique.filter((src) => DEBATE_OPTIONAL_SCRIPTS.has(src));
            await Promise.all(required.map(loadScript));
            await Promise.allSettled(optional.map(loadScript));
            return;
        }
        await Promise.all(unique.map(loadScript));
    }

    /** Load slices before print when calendar filters use multi-curriculum display. */
    async function ensurePrintScripts() {
        await ensureTabScripts('calendar');
    }

    global.CCPTabScripts = {
        ensureTabScripts,
        ensureDebateCoreScripts,
        isDebateCoreReady,
        ensurePrintScripts,
        tabNeedsScripts
    };
})(typeof window !== 'undefined' ? window : globalThis);
