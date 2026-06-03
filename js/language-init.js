/**
 * Blocking language bootstrap (include in <head> after theme-init).
 * Uses saved calendarLanguage, else browser locale: ko → Korean, en → English,
 * any other tag → English (fallback).
 */
(function (global) {
    var STORAGE_KEY = 'calendarLanguage';

    /** @param {string[]} list BCP 47 tags in preference order */
    function detectLanguageFromPreferenceList(list) {
        try {
            var langs = list && list.length ? list : ['en'];
            for (var i = 0; i < langs.length; i++) {
                var code = String(langs[i] || '')
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

    function detectBrowserLanguage() {
        try {
            var nav = global.navigator;
            var list =
                nav && nav.languages && nav.languages.length
                    ? nav.languages
                    : [nav && nav.language ? nav.language : 'en'];
            return detectLanguageFromPreferenceList(list);
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
        detectLanguageFromPreferenceList: detectLanguageFromPreferenceList,
        detectBrowserLanguage: detectBrowserLanguage,
        resolveCalendarLanguage: resolveCalendarLanguage,
        applyDocumentLang: applyDocumentLang
    };
})(typeof window !== 'undefined' ? window : globalThis);
