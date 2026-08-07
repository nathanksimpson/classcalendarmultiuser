/**
 * Client-side classroom permission checks (mirror server/classroom-access.js).
 */
(function (global) {
    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    /** Optional provider so canEditClass can resolve linked cohorts without every call site. */
    let cohortsProvider = null;

    function setCohortsProvider(fn) {
        cohortsProvider = typeof fn === 'function' ? fn : null;
    }

    function resolveCohorts(cohortsArg) {
        if (Array.isArray(cohortsArg)) {
            return cohortsArg;
        }
        if (typeof cohortsProvider === 'function') {
            try {
                const list = cohortsProvider();
                if (Array.isArray(list)) {
                    return list;
                }
            } catch (_) {
                /* ignore */
            }
        }
        if (global.appData && Array.isArray(global.appData.cohorts)) {
            return global.appData.cohorts;
        }
        return [];
    }

    function canBypass() {
        if (typeof TeamAuth === 'undefined' || !TeamAuth.hasPermission) {
            return false;
        }
        return TeamAuth.hasPermission('manage_calendar_access');
    }

    function isUserAssignedToClass(classData, userId) {
        if (!classData || !userId) {
            return false;
        }
        const uid = String(userId);
        if (Array.isArray(classData.classTeachers)) {
            if (classData.classTeachers.some((row) => row && String(row.userId || '') === uid)) {
                return true;
            }
        }
        return String(classData.assignedTeacherUserId || '') === uid;
    }

    function currentUserId() {
        if (typeof TeamAuth === 'undefined' || !TeamAuth.getUser) {
            return '';
        }
        const user = TeamAuth.getUser();
        return user && user.id != null ? String(user.id) : '';
    }

    function getCohortIdsForClass(classData) {
        if (!classData) {
            return [];
        }
        if (global.CCPClassroomDomain && typeof global.CCPClassroomDomain.getCohortIdsForClass === 'function') {
            return global.CCPClassroomDomain.getCohortIdsForClass(classData) || [];
        }
        const ids = [];
        if (Array.isArray(classData.cohortIds)) {
            classData.cohortIds.forEach((id) => {
                const s = normalizeStr(id);
                if (s && !ids.includes(s)) {
                    ids.push(s);
                }
            });
        }
        const legacy = normalizeStr(classData.cohortId);
        if (legacy && !ids.includes(legacy)) {
            ids.push(legacy);
        }
        return ids;
    }

    function isHomeroomForCohort(cohort) {
        const uid = currentUserId();
        if (!uid || !cohort) {
            return false;
        }
        return normalizeStr(cohort.homeroomTeacherUserId) === uid;
    }

    function isHomeroomForClass(classData, cohorts) {
        const uid = currentUserId();
        if (!uid || !classData) {
            return false;
        }
        if (normalizeStr(classData.homeroomTeacherUserId) === uid) {
            return true;
        }
        const list = resolveCohorts(cohorts);
        const cohortIds = getCohortIdsForClass(classData);
        return cohortIds.some((cid) => {
            const cohort = list.find((c) => c && normalizeStr(c.id) === normalizeStr(cid));
            return isHomeroomForCohort(cohort);
        });
    }

    function canEditCohortRoster(cohort) {
        if (canBypass()) {
            return true;
        }
        return isHomeroomForCohort(cohort);
    }

    /**
     * Assigned teacher OR homeroom of a linked cohort.
     * @param {object} classData
     * @param {Array} [cohorts] optional; otherwise uses setCohortsProvider / appData.cohorts
     */
    function canEditClass(classData, cohorts) {
        if (canBypass()) {
            return true;
        }
        if (isUserAssignedToClass(classData, currentUserId())) {
            return true;
        }
        return isHomeroomForClass(classData, cohorts);
    }

    function canViewClassroom() {
        return typeof TeamAuth !== 'undefined' && TeamAuth.isSignedIn && TeamAuth.isSignedIn();
    }

    function canDeleteStudentPermanently() {
        return canBypass();
    }

    function canArchiveStudent(cohort) {
        if (canBypass()) {
            return true;
        }
        if (cohort && global.CCPClassroomDomain && global.CCPClassroomDomain.isArchiveCohort(cohort)) {
            return canEditCohortRoster(cohort);
        }
        return canEditCohortRoster(cohort);
    }

    global.CCPClassroomAccess = {
        canBypass,
        isUserAssignedToClass,
        isHomeroomForCohort,
        isHomeroomForClass,
        canEditCohortRoster,
        canEditClass,
        canViewClassroom,
        canDeleteStudentPermanently,
        canArchiveStudent,
        currentUserId,
        setCohortsProvider,
        getCohortIdsForClass
    };
})(typeof window !== 'undefined' ? window : globalThis);
