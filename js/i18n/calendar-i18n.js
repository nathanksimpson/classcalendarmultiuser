/**
 * Calendar app i18n bundle — translations loaded from calendar-en.js / calendar-ko.js.
 */
(function (global) {
    'use strict';

    const bundle = global.CCPCalendarI18n || {};

    const translations = {
        en: bundle.en || {},
        ko: bundle.ko || {}
    };

    function t(key, lang) {
        const L = lang || global.calendarCurrentLanguage || 'en';
        return translations[L][key] || translations.en[key] || key;
    }

    global.CCPCalendarI18n = Object.assign(bundle, {
        translations,
        t
    });
})(typeof window !== 'undefined' ? window : globalThis);
