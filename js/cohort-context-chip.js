/**
 * Header chip showing active cohort filter with clear action.
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

    function resolveCohortName(cohortId) {
        if (!cohortId || !hooks) {
            return '';
        }
        const data = hooks.getAppData ? hooks.getAppData() : {};
        const cohort = (data.cohorts || []).find((c) => c && c.id === cohortId);
        return cohort ? cohort.name || cohort.id : cohortId;
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
        const name = resolveCohortName(cohortId);
        mount.hidden = false;
        mount.innerHTML = `
            <span class="selection-chip context-cohort-chip" role="status">
                <span class="context-cohort-chip__label">${escapeHtml(t('contextCohortWorkingIn'))}</span>
                <strong class="context-cohort-chip__name">${escapeHtml(name)}</strong>
                <button type="button" class="btn btn-outline btn-compact context-cohort-chip__clear" id="contextCohortChipClear">${escapeHtml(t('contextCohortClear'))}</button>
            </span>`;
        mount.querySelector('#contextCohortChipClear')?.addEventListener('click', () => {
            if (typeof global.CCPActiveContext !== 'undefined') {
                global.CCPActiveContext.set({ cohortId: '' }, { source: 'cohort-chip-clear' });
            }
            if (typeof hooks.onCohortCleared === 'function') {
                hooks.onCohortCleared();
            }
            render();
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
