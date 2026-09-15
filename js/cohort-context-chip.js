/**
 * Header chip showing active cohort list filter with clear action.
 * Label key is contextCohortFilteredTo (internal id stays global via CCPActiveContext).
 */
(function (global) {
    let hooks = null;
    let unsubscribe = null;

    function t(key) {
        return hooks && hooks.t ? hooks.t(key) : key;
    }

    function escapeHtml(s) {
        if (typeof CCPUtils !== 'undefined' && CCPUtils.escapeHtml) {
            return CCPUtils.escapeHtml(s);
        }
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function resolveCohort(cohortId) {
        if (!cohortId || !hooks) {
            return null;
        }
        const data = hooks.getAppData ? hooks.getAppData() : {};
        return (data.cohorts || []).find((c) => c && c.id === cohortId) || null;
    }

    function clearCohortFilter() {
        if (typeof global.CCPActiveContext !== 'undefined') {
            global.CCPActiveContext.set({ cohortId: '' }, { source: 'cohort-chip-clear' });
        }
        if (typeof hooks.onCohortCleared === 'function') {
            hooks.onCohortCleared();
        }
        render();
    }

    function render() {
        const mount = document.getElementById('contextCohortChip');
        if (!mount) {
            return;
        }
        const cohortId =
            typeof global.CCPActiveContext !== 'undefined'
                ? global.CCPActiveContext.getActiveCohortId()
                : '';
        if (!cohortId) {
            mount.hidden = true;
            mount.innerHTML = '';
            return;
        }
        const cohort = resolveCohort(cohortId);
        if (!cohort) {
            // Stale id (deleted cohort) — drop the filter quietly.
            clearCohortFilter();
            return;
        }
        const name = cohort.name || cohort.id;
        mount.hidden = false;
        mount.innerHTML = `
            <span class="context-cohort-chip" role="status">
                <span class="context-cohort-chip__label">${escapeHtml(t('contextCohortFilteredTo'))}</span>
                <span class="context-cohort-chip__name">${escapeHtml(name)}</span>
                <button type="button" class="btn btn-outline btn-compact context-cohort-chip__clear" id="contextCohortChipClear" aria-label="${escapeHtml(t('contextCohortClearAria'))}">${escapeHtml(t('contextCohortClear'))}</button>
            </span>`;
        mount.querySelector('#contextCohortChipClear')?.addEventListener('click', () => {
            clearCohortFilter();
        });
    }

    function init(h) {
        hooks = h || null;
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
        if (typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.subscribe) {
            unsubscribe = global.CCPActiveContext.subscribe(() => render());
        }
        render();
    }

    global.CCPCohortContextChip = {
        init,
        render
    };
})(typeof window !== 'undefined' ? window : globalThis);
