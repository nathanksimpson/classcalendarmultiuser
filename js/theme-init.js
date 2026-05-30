/**
 * Blocking theme bootstrap (include in <head> before CSS).
 */
(function () {
    try {
        var theme = localStorage.getItem('calendarTheme');
        if (theme === 'dark' || theme === 'light') {
            document.documentElement.setAttribute('data-theme', theme);
            document.documentElement.style.colorScheme = theme;
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.documentElement.style.colorScheme = 'dark';
        }
    } catch (e) {
        /* ignore */
    }
})();
