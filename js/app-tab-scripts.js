/**
 * Defer tab-specific scripts until first visit (smaller initial download).
 */
(function (global) {
    const SCRIPT_FEEDBACK_TEMPLATES = 'js/debate/feedback-templates.js?v=20260710-debate-v2';
    const SCRIPT_DEBATE_SCORESHEET_EXPORT = 'js/debate/debate-scoresheet-export.js?v=20260721-feedback-comments';
    const SCRIPT_DEBATE_TEAMS_V2 = 'js/debate/debate-teams-v2.js?v=20260907-day3-silent-gen';
    const SCRIPT_CLASS_CURRICULUM_SLICES = 'js/class-curriculum-slices.js?v=20260603-curriculum-pipeline';
    const SCRIPT_ROSTER_IMPORT = 'js/roster-import.js?v=20260806-name-marks';
    const SCRIPT_TEACHER_TIMETABLE = 'js/teacher-timetable.js?v=20260909-period8';

    const TAB_SCRIPTS = {
        cohorts: [
            SCRIPT_TEACHER_TIMETABLE,
            'js/meeting-days-control.js?v=20260610-setup-board',
            'js/hr-teacher-list.js?v=20260909-cohort-color',
            'js/hr-teacher-list-print.js?v=20260909-hr-title',
            'js/cohort-management.js?v=20260907-hr-t-list',
            'js/setup-board.js?v=20260828-cohort-catch22',
            'js/cohorts-class-detail.js?v=20260908-quick-wins'
        ],
        timetable: [
            SCRIPT_TEACHER_TIMETABLE,
            'js/timetable-export.js?v=20260602-tab-fast'
        ],
        teachers: [
            SCRIPT_TEACHER_TIMETABLE,
            SCRIPT_CLASS_CURRICULUM_SLICES
        ],
        curriculum: [SCRIPT_CLASS_CURRICULUM_SLICES],
        classes: [SCRIPT_CLASS_CURRICULUM_SLICES],
        syllabus: [SCRIPT_CLASS_CURRICULUM_SLICES],
        calendar: [
            SCRIPT_TEACHER_TIMETABLE,
            SCRIPT_CLASS_CURRICULUM_SLICES
        ],
        students: [
            'js/essay-tracker-import.js?v=20260630-essay-import',
            SCRIPT_ROSTER_IMPORT,
            'js/classroom-access.js?v=20260807-hr-tools',
            'js/classroom-student-row.js?v=20260723-tms-sync',
            'js/classroom-roster.js?v=20260907-day3-tms-callback'
        ],
        attendance: [
            'js/classroom-access.js?v=20260807-hr-tools',
            'js/classroom-student-row.js?v=20260723-tms-sync',
            'js/classroom-header.js?v=20260807-hr-tools',
            'js/classroom-attendance.js?v=20260806-patch-mutations'
        ],
        briefing: [
            'js/classroom-access.js?v=20260807-hr-tools',
            'js/classroom-header.js?v=20260807-hr-tools',
            'js/classroom-briefing.js?v=20260820-briefing-unique-gtr'
        ],
        'homework-tracking': [
            'js/classroom-access.js?v=20260807-hr-tools',
            'js/classroom-student-row.js?v=20260723-tms-sync',
            'js/classroom-header.js?v=20260807-hr-tools',
            'js/classroom-homework.js?v=20260806-status-chip',
        ],
        essays: [
            'js/classroom-access.js?v=20260807-hr-tools',
            'js/classroom-student-row.js?v=20260723-tms-sync',
            'js/classroom-essay-resubmit-day-note.js?v=20260824-mention-no-at-colon',
            'js/classroom-essay-progress.js?v=20260908-hw-due',
            'js/classroom-essay-progress-print.js?v=20260807-deconflict-min',
            'js/classroom-essay-resubmit-print.js?v=20260807-deconflict-min',
            'js/classroom-essay-resubmit-summary.js?v=20260708-essays-redesign',
            'js/classroom-essay-class-summary.js?v=20260807-deconflict-min',
            'js/classroom-essay-class-summary-print.js?v=20260807-deconflict-min',
            'js/classroom-header.js?v=20260807-hr-tools',
            'js/classroom-essay-scrape-editor.js?v=20260903-speech-grader',
            'js/classroom-essays.js?v=20260908-hw-due'
        ],
        ledger: [
            'js/classroom-access.js?v=20260807-hr-tools',
            'js/classroom-ledger-bridge.js?v=20260619-ui-overhaul',
            'js/classroom-ledger.js?v=20260807-hr-tools'
        ],
        'command-center': [
            'js/command-center.js?v=20260807-deconflict-min'
        ],
        points: [
            'js/classroom-access.js?v=20260807-hr-tools',
            'js/classroom-student-row.js?v=20260723-tms-sync',
            'js/classroom-point-reasons.js?v=20260618-point-reasons',
            'js/classroom-points.js?v=20260807-hr-tools'
        ],
        tests: [
            'js/classroom-access.js?v=20260807-hr-tools',
            'js/classroom-student-row.js?v=20260723-tms-sync',
            'js/classroom-header.js?v=20260807-hr-tools',
            'js/classroom-tests.js?v=20260703-zone-context'
        ],
        'debate-teams': [
            'https://cdn.jsdelivr.net/npm/pizzip@3.1.7/dist/pizzip.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
            SCRIPT_FEEDBACK_TEMPLATES,
            SCRIPT_DEBATE_SCORESHEET_EXPORT,
            SCRIPT_DEBATE_TEAMS_V2,
            'js/classroom-access.js?v=20260807-hr-tools',
            'js/classroom-debate-teams.js?v=20260907-day3-homework-build'
        ],
        'debate-scores': [
            'https://cdn.jsdelivr.net/npm/pizzip@3.1.7/dist/pizzip.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
            SCRIPT_FEEDBACK_TEMPLATES,
            SCRIPT_DEBATE_SCORESHEET_EXPORT,
            SCRIPT_DEBATE_TEAMS_V2,
            'js/classroom-access.js?v=20260807-hr-tools',
            'js/classroom-debate-scores.js?v=20260721-numpad-place'
        ],
        'debate-books': [
            'js/classroom-access.js?v=20260807-hr-tools',
            'js/classroom-student-row.js?v=20260723-tms-sync',
            'js/ui/classroom-autosave.js?v=20260807-deconflict-min',
            'js/classroom-essay-class-summary.js?v=20260807-deconflict-min',
            'js/classroom-debate-books-summary.js?v=20260901-books-print-search',
            'js/classroom-debate-books-summary-print.js?v=20260831-books-today',
            'js/classroom-debate-books.js?v=20260901-books-print-search'
        ],
        'speaking-test': [
            SCRIPT_ROSTER_IMPORT,
            'js/classroom-access.js?v=20260807-hr-tools',
            'js/speaking-test/speaking-test-core.js?v=20260720-speaking-modal',
            'js/classroom-speaking-test.js?v=20260818-init-keep-date'
        ]
    };

    const DEBATE_OPTIONAL_SCRIPTS = new Set([
        'https://cdn.jsdelivr.net/npm/pizzip@3.1.7/dist/pizzip.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
    ]);

    const DEBATE_CORE_SCRIPTS = [
        SCRIPT_FEEDBACK_TEMPLATES,
        SCRIPT_DEBATE_SCORESHEET_EXPORT,
        SCRIPT_DEBATE_TEAMS_V2
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
        if (tabId === 'debate-teams' || tabId === 'debate-scores') {
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
