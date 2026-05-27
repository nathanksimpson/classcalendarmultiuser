/**
 * Lazy-loads syllabus/curriculum extension scripts and optional howto.js.
 * Critical path: schedule-core, utils, team-auth, calendar-sync, app.js only.
 */
(function (global) {
    const EXTENSION_SCRIPTS = [
        'js/syllabus-table.js?v=20260527-debate-templates',
        'js/schedule-matrix-data.js',
        'js/syllabus-schedule-matrix.js',
        'js/syllabus-curricula-data.js?v=20260527-debate-curricula',
        'js/syllabus-curricula.js',
        'js/syllabus-presets.js',
        'js/default-class-editor.js',
        'js/books-editor.js?v=20260529-curriculum',
        'js/homework-import.js',
        'js/homework-tab.js',
        'js/syllabus-templates.js?v=20260527-debate-templates'
    ];

    const HOWTO_SCRIPT = 'howto.js?v=20260528-howto-team';

    let extensionPromise = null;
    let howtoPromise = null;
    let extensionLoaded = false;

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const marker = src.split('?')[0];
            const existing = document.querySelector('script[data-cc-src="' + marker + '"]');
            if (existing) {
                if (existing.dataset.ccLoaded === '1') {
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
            script.dataset.ccSrc = marker;
            script.onload = () => {
                script.dataset.ccLoaded = '1';
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load ' + src));
            document.head.appendChild(script);
        });
    }

    function loadExtensionScripts() {
        if (extensionLoaded) {
            return Promise.resolve();
        }
        if (!extensionPromise) {
            extensionPromise = (async () => {
                for (const src of EXTENSION_SCRIPTS) {
                    await loadScript(src);
                }
                extensionLoaded = true;
            })().catch((err) => {
                extensionPromise = null;
                throw err;
            });
        }
        return extensionPromise;
    }

    function loadHowtoScript() {
        if (global.CCPHowTo) {
            return Promise.resolve();
        }
        if (!howtoPromise) {
            howtoPromise = loadScript(HOWTO_SCRIPT).catch((err) => {
                howtoPromise = null;
                throw err;
            });
        }
        return howtoPromise;
    }

    global.CCPLoader = {
        loadExtensionScripts,
        loadHowtoScript,
        get extensionLoaded() {
            return extensionLoaded;
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
