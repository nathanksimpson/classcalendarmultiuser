/**
 * Theme storage and toggle (window.CCPTheme).
 */
(function (global) {
    const STORAGE_KEY = 'calendarTheme';

    function getStoredTheme() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') {
            return saved;
        }
        if (global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    function updateToggleButtons(options, isDark) {
        const opts = options || {};
        (opts.buttonIds || []).forEach((id) => {
            const btn = document.getElementById(id);
            if (!btn) {
                return;
            }
            if (typeof opts.getButtonLabel === 'function') {
                btn.textContent = opts.getButtonLabel(isDark);
            }
            btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
            if (typeof opts.getButtonTitle === 'function') {
                btn.setAttribute('title', opts.getButtonTitle());
            }
        });
        if (typeof opts.afterUpdate === 'function') {
            opts.afterUpdate(isDark);
        }
    }

    function applyTheme(theme, options) {
        const next = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.classList.remove('print-color-mode-light');
        document.documentElement.setAttribute('data-theme', next);
        document.documentElement.style.colorScheme = next;
        localStorage.setItem(STORAGE_KEY, next);
        updateToggleButtons(options, next === 'dark');
        return next;
    }

    function loadTheme(options) {
        return applyTheme(getStoredTheme(), options);
    }

    function toggleTheme(options) {
        const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        return applyTheme(current === 'dark' ? 'light' : 'dark', options);
    }

    global.CCPTheme = { STORAGE_KEY, getStoredTheme, applyTheme, loadTheme, toggleTheme, updateToggleButtons };
})(typeof window !== 'undefined' ? window : globalThis);
