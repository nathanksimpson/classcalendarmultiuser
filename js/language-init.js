/**
 * Blocking language bootstrap (include in <head> after theme-init).
 * Uses saved calendarLanguage, else browser locale (Korean → ko, otherwise en).
 */
(function (global) {
    var STORAGE_KEY = 'calendarLanguage';

    function detectBrowserLanguage() {
        try {
            var list =
                global.navigator.languages && global.navigator.languages.length
                    ? global.navigator.languages
                    : [global.navigator.language || 'en'];
            for (var i = 0; i < list.length; i++) {
                var code = String(list[i] || '')
                    .toLowerCase()
                    .split('-')[0];
                if (code === 'ko') {
                    return 'ko';
                }
                if (code === 'en') {
                    return 'en';
                }
            }
        } catch (e) {
            /* ignore */
        }
        return 'en';
    }

    function applyDocumentLang(lang) {
        var doc = global.document && global.document.documentElement;
        if (doc) {
            doc.lang = lang === 'ko' ? 'ko' : 'en';
        }
    }

    function resolveCalendarLanguage() {
        try {
            var saved = global.localStorage.getItem(STORAGE_KEY);
            if (saved === 'en' || saved === 'ko') {
                return saved;
            }
        } catch (e) {
            /* ignore */
        }
        var detected = detectBrowserLanguage();
        try {
            global.localStorage.setItem(STORAGE_KEY, detected);
        } catch (e2) {
            /* ignore */
        }
        return detected;
    }

    var lang = resolveCalendarLanguage();
    applyDocumentLang(lang);

    global.CCPLanguage = {
        STORAGE_KEY: STORAGE_KEY,
        detectBrowserLanguage: detectBrowserLanguage,
        resolveCalendarLanguage: resolveCalendarLanguage,
        applyDocumentLang: applyDocumentLang
    };
})(typeof window !== 'undefined' ? window : globalThis);
