/**
 * Calendar view hooks — registers stable delegation for calendar container actions.
 * Full calendar render remains in app.js; this module owns event wiring patterns.
 * window.CCPCalendarView
 */
(function (global) {
    let hooks = {
        onCalendarAction: () => {}
    };

    function init(nextHooks) {
        hooks = Object.assign({}, hooks, nextHooks || {});
    }

    function bindDelegation() {
        const container = document.getElementById('calendarContainer');
        if (!container || container.dataset.ccpCalendarDelegation === '1') {
            return;
        }
        container.dataset.ccpCalendarDelegation = '1';
        container.addEventListener('click', (e) => {
            const target = e.target.closest('[data-calendar-action]');
            if (!target || !container.contains(target)) {
                return;
            }
            hooks.onCalendarAction({
                action: target.dataset.calendarAction,
                id: target.dataset.id || '',
                date: target.dataset.date || '',
                el: target,
                event: e
            });
        });
    }

    global.CCPCalendarView = {
        init,
        bindDelegation
    };
})(typeof window !== 'undefined' ? window : globalThis);
