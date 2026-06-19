/**
 * Filter list sidebars by active cohort selection.
 */
(function (global) {
    function classBelongsToCohort(classData, cohortId) {
        if (!cohortId || !classData) {
            return true;
        }
        const ids = Array.isArray(classData.cohortIds)
            ? classData.cohortIds
            : classData.cohortId
                ? [classData.cohortId]
                : [];
        return ids.includes(cohortId);
    }

    function filterClassesByCohort(classes, cohortId) {
        const list = Array.isArray(classes) ? classes : [];
        if (!cohortId) {
            return list.slice();
        }
        return list.filter((c) => classBelongsToCohort(c, cohortId));
    }

    function filterStudentsByCohort(studentEntries, cohortId, cohorts) {
        const list = Array.isArray(studentEntries) ? studentEntries : [];
        if (!cohortId) {
            return list.slice();
        }
        const cohort = (cohorts || []).find((c) => c && c.id === cohortId);
        if (!cohort) {
            return [];
        }
        const cohortStudentIds = new Set(
            (Array.isArray(cohort.studentIds) ? cohort.studentIds : []).map(String)
        );
        if (!cohortStudentIds.size) {
            return list.slice();
        }
        return list.filter((entry) => {
            const sid = entry && entry.student && entry.student.id;
            return sid && cohortStudentIds.has(String(sid));
        });
    }

    function filterEventsByCohort(events, cohortId, classes) {
        const list = Array.isArray(events) ? events : [];
        if (!cohortId) {
            return list.slice();
        }
        const classList = Array.isArray(classes) ? classes : [];
        const cohortClassIds = new Set(
            filterClassesByCohort(classList, cohortId).map((c) => c.id).filter(Boolean)
        );
        if (!cohortClassIds.size) {
            return list.slice();
        }
        return list.filter((ev) => {
            if (!ev || !Array.isArray(ev.applicableClassIds)) {
                return true;
            }
            if (!ev.applicableClassIds.length) {
                return true;
            }
            return ev.applicableClassIds.some((id) => cohortClassIds.has(id));
        });
    }

    function getActiveCohortId() {
        if (typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.getActiveCohortId) {
            return global.CCPActiveContext.getActiveCohortId() || '';
        }
        return '';
    }

    global.CCPCohortSidebarFilter = {
        classBelongsToCohort,
        filterClassesByCohort,
        filterStudentsByCohort,
        filterEventsByCohort,
        getActiveCohortId
    };
})(typeof window !== 'undefined' ? window : globalThis);
