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

    /**
     * Keep events that apply to at least one class in the active cohort.
     * Prefer options.eventAppliesToClass (same semantics as app.js).
     * Legacy fallback: event.applicableClassIds when no matcher is provided.
     */
    function filterEventsByCohort(events, cohortId, classes, options) {
        const list = Array.isArray(events) ? events : [];
        if (!cohortId) {
            return list.slice();
        }
        const classList = Array.isArray(classes) ? classes : [];
        const cohortClasses = filterClassesByCohort(classList, cohortId);
        const cohortClassIds = new Set(cohortClasses.map((c) => c.id).filter(Boolean));
        if (!cohortClassIds.size) {
            return list.slice();
        }
        const opts = options && typeof options === 'object' ? options : {};
        const appliesFn = typeof opts.eventAppliesToClass === 'function'
            ? opts.eventAppliesToClass
            : null;
        return list.filter((ev) => {
            if (!ev) {
                return false;
            }
            if (appliesFn) {
                return cohortClasses.some((classData) => appliesFn(ev, classData));
            }
            // Legacy path: only known when events stored applicableClassIds.
            if (!Array.isArray(ev.applicableClassIds)) {
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
