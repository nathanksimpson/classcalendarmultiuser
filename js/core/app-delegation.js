/**
 * Document-level listeners for calendar display, print, and filter popovers.
 */
(function (global) {
    function bindOnce(el, eventName, handler, flag) {
        if (!el || el.dataset[flag] === '1') {
            return;
        }
        el.dataset[flag] = '1';
        el.addEventListener(eventName, handler);
    }

    function initAppDelegation(options) {
        const opts = options || {};
        const {
            setPrintCalendarVisibilityCheckboxes,
            setPrintSummaryOptionCheckboxes,
            openWorkspaceBooks,
            applyPrintUseCalendarFiltersState,
            visibilityFilterIds,
            onVisibilityFilterChange,
            printSummaryOptionIds,
            savePrintSummaryVisibilityToUi
        } = opts;

        const workspaceBtn = document.getElementById('openWorkspaceBooksBtn');
        if (workspaceBtn && typeof openWorkspaceBooks === 'function') {
            bindOnce(workspaceBtn, 'click', openWorkspaceBooks, 'workspaceBooksBound');
        }

        (visibilityFilterIds || []).forEach((uiId) => {
            const el = document.getElementById(uiId);
            if (!el) {
                return;
            }
            bindOnce(el, 'change', () => {
                if (typeof onVisibilityFilterChange === 'function') {
                    onVisibilityFilterChange();
                }
            }, 'delegatedVisibilityBound');
        });

        const printSelectAll = document.getElementById('printCalVisSelectAllBtn');
        const printClearAll = document.getElementById('printCalVisClearAllBtn');
        if (printSelectAll && typeof setPrintCalendarVisibilityCheckboxes === 'function') {
            bindOnce(printSelectAll, 'click', () => setPrintCalendarVisibilityCheckboxes(true), 'printCalVisSelectBound');
        }
        if (printClearAll && typeof setPrintCalendarVisibilityCheckboxes === 'function') {
            bindOnce(printClearAll, 'click', () => setPrintCalendarVisibilityCheckboxes(false), 'printCalVisClearBound');
        }

        const summarySelectAll = document.getElementById('printSummarySelectAllBtn');
        const summaryClearAll = document.getElementById('printSummaryClearAllBtn');
        if (summarySelectAll && typeof setPrintSummaryOptionCheckboxes === 'function') {
            bindOnce(summarySelectAll, 'click', () => setPrintSummaryOptionCheckboxes(true), 'printSummarySelectBound');
        }
        if (summaryClearAll && typeof setPrintSummaryOptionCheckboxes === 'function') {
            bindOnce(summaryClearAll, 'click', () => setPrintSummaryOptionCheckboxes(false), 'printSummaryClearBound');
        }

        (printSummaryOptionIds || []).forEach((id) => {
            const el = document.getElementById(id);
            if (!el || typeof savePrintSummaryVisibilityToUi !== 'function') {
                return;
            }
            bindOnce(el, 'change', savePrintSummaryVisibilityToUi, 'summaryVisBound');
        });

        const printUseCalendarFilters = document.getElementById('printUseCalendarFilters');
        if (printUseCalendarFilters && typeof applyPrintUseCalendarFiltersState === 'function') {
            bindOnce(printUseCalendarFilters, 'change', applyPrintUseCalendarFiltersState, 'printUseCalFiltersBound');
        }
    }

    /** List panels: one click handler per stable parent (class/event lists). */
    function initListPanelDelegation() {
        if (typeof global.CCPClassListView !== 'undefined' && global.CCPClassListView.bindDelegation) {
            global.CCPClassListView.bindDelegation();
        }
        if (typeof global.CCPEventListView !== 'undefined' && global.CCPEventListView.bindDelegation) {
            global.CCPEventListView.bindDelegation();
        }
        if (typeof global.CCPCalendarView !== 'undefined' && global.CCPCalendarView.bindDelegation) {
            global.CCPCalendarView.bindDelegation();
        }
    }

    /** Popover commit handlers remain on popover bodies in app.js. */
    function initDynamicPanelDelegation() {
        initListPanelDelegation();
        initDynamicPanelDelegation._bound = true;
    }

    global.CCPAppDelegation = {
        initAppDelegation,
        initDynamicPanelDelegation
    };
})(typeof window !== 'undefined' ? window : globalThis);
