/**
 * Client-side classroom permission checks (mirror server/classroom-access.js).
 */
(function (global) {
    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
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

    function isHomeroomForCohort(cohort) {
        const uid = currentUserId();
        if (!uid || !cohort) {
            return false;
        }
        return normalizeStr(cohort.homeroomTeacherUserId) === uid;
    }

    function canEditCohortRoster(cohort) {
        if (canBypass()) {
            return true;
        }
        return isHomeroomForCohort(cohort);
    }

    function canEditClass(classData) {
        if (canBypass()) {
            return true;
        }
        return isUserAssignedToClass(classData, currentUserId());
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
        canEditCohortRoster,
        canEditClass,
        canViewClassroom,
        canDeleteStudentPermanently,
        canArchiveStudent,
        currentUserId
    };
})(typeof window !== 'undefined' ? window : globalThis);
