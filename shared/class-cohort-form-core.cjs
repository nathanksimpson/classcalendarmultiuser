'use strict';

/**
 * Admin cohort gate removed — saving a class without a cohort is always allowed.
 */
function shouldBlockClassSaveForMissingCohort(_isAdmin, _formCohortIds, _cohortId) {
    return false;
}

function buildNewClassCohortDraft(cohortId) {
    const cid = String(cohortId || '').trim();
    if (!cid) {
        return { cohortId: '', cohortIds: [] };
    }
    return { cohortId: cid, cohortIds: [cid] };
}

function sortCohortsForClassSelect(cohorts) {
    return (Array.isArray(cohorts) ? cohorts : [])
        .filter((c) => c && c.id)
        .slice()
        .sort((a, b) => {
            const an = String(a.name || a.id || '');
            const bn = String(b.name || b.id || '');
            return an.localeCompare(bn, undefined, { sensitivity: 'base' });
        });
}

module.exports = {
    shouldBlockClassSaveForMissingCohort,
    buildNewClassCohortDraft,
    sortCohortsForClassSelect
};
