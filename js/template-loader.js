/**
 * Load large HTML form templates on demand (reduces index.html payload).
 */
(function (global) {
    const TEMPLATES = [
        { id: 'classFormTemplate', url: 'templates/class-form.html?v=20260603-class-form-order' },
        { id: 'syllabusEditorTemplate', url: 'templates/syllabus-editor.html' },
        { id: 'holidayFormTemplate', url: 'templates/holiday-form.html' },
        { id: 'printFormTemplate', url: 'templates/print-form.html' }
    ];

    let loadPromise = null;
    const FETCH_TIMEOUT_MS = 15000;

    function fetchTemplateHtml(url) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer =
            controller &&
            setTimeout(() => {
                controller.abort();
            }, FETCH_TIMEOUT_MS);
        return fetch(url, {
            credentials: 'same-origin',
            signal: controller ? controller.signal : undefined
        })
            .then((res) => {
                if (!res.ok) {
                    throw new Error('Failed to load template: ' + url + ' (' + res.status + ')');
                }
                return res.text();
            })
            .finally(() => {
                if (timer) {
                    clearTimeout(timer);
                }
            });
    }

    function injectTemplate(def, html) {
        if (document.getElementById(def.id)) {
            return;
        }
        const tpl = document.createElement('template');
        tpl.id = def.id;
        tpl.innerHTML = html;
        document.body.appendChild(tpl);
    }

    async function ensureTemplatesLoaded() {
        if (loadPromise) {
            return loadPromise;
        }
        loadPromise = (async () => {
            await Promise.all(
                TEMPLATES.map(async (def) => {
                    if (document.getElementById(def.id)) {
                        return;
                    }
                    const html = await fetchTemplateHtml(def.url);
                    injectTemplate(def, html);
                })
            );
        })().catch((err) => {
            loadPromise = null;
            throw err;
        });
        return loadPromise;
    }

    global.CCPTemplateLoader = {
        ensureTemplatesLoaded
    };
})(typeof window !== 'undefined' ? window : globalThis);
