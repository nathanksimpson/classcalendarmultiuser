/**
 * Calendar app i18n bundle — translations loaded from calendar-en.js / calendar-ko.js.
 *
 * English is always loaded (it is the fallback). Korean may be loaded lazily:
 * for English users it is skipped on first paint and fetched on demand the first
 * time they switch to Korean (see ensureLanguage). To keep that safe, the
 * `translations.en` / `translations.ko` objects are STABLE references that are
 * filled in place via Object.assign, so code in app.js that captured
 * `CCPCalendarI18n.translations` keeps working even after a late load.
 */
(function (global) {
    'use strict';

    const bundle = global.CCPCalendarI18n || {};

    const translations =
        bundle.translations && bundle.translations.en && bundle.translations.ko
            ? bundle.translations
            : { en: {}, ko: {} };

    /** Copy whatever language bundles are currently loaded into the stable refs. */
    function syncFromBundle() {
        const src = global.CCPCalendarI18n;
        if (!src) {
            return;
        }
        if (src.en) {
            Object.assign(translations.en, src.en);
        }
        if (src.ko) {
            Object.assign(translations.ko, src.ko);
        }
    }

    syncFromBundle();

    function isLanguageLoaded(lang) {
        return Boolean(translations[lang] && Object.keys(translations[lang]).length);
    }

    function t(key, lang) {
        const L = lang || global.calendarCurrentLanguage || 'en';
        return (translations[L] && translations[L][key]) || translations.en[key] || key;
    }

    const SCRIPT_SRC = {
        en: 'js/i18n/calendar-en.js',
        ko: 'js/i18n/calendar-ko.js'
    };
    const loadPromises = {};

    /**
     * Ensure a language bundle is loaded, fetching it on demand if needed.
     * Resolves once the bundle is available (or immediately if already loaded
     * or running outside a browser). Never rejects — on failure it resolves and
     * callers fall back to English.
     * @param {string} lang 'en' | 'ko'
     * @returns {Promise<void>}
     */
    function ensureLanguage(lang) {
        if (lang !== 'en' && lang !== 'ko') {
            return Promise.resolve();
        }
        if (isLanguageLoaded(lang)) {
            return Promise.resolve();
        }
        if (loadPromises[lang]) {
            return loadPromises[lang];
        }
        if (typeof document === 'undefined' || !document.createElement) {
            return Promise.resolve();
        }
        const version = global.CCP_I18N_VERSION ? '?v=' + global.CCP_I18N_VERSION : '';
        loadPromises[lang] = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = SCRIPT_SRC[lang] + version;
            script.onload = () => {
                syncFromBundle();
                resolve();
            };
            script.onerror = () => {
                resolve();
            };
            document.head.appendChild(script);
        });
        return loadPromises[lang];
    }

    global.CCPCalendarI18n = Object.assign(bundle, {
        translations,
        t,
        ensureLanguage,
        isLanguageLoaded,
        syncFromBundle
    });
})(typeof window !== 'undefined' ? window : globalThis);
