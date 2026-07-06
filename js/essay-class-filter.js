/**
 * Classroom zone class list filters — My classes + Has essays toggles.
 */
(function (global) {
    function classHasEssayAssignments(classData, domainApi) {
        if (!classData || !domainApi) {
            return false;
        }
        const rows = domainApi.getEssayRowsFromSyllabus(classData.syllabusRows);
        return rows.length > 0;
    }

    function classIsMine(classData, userId, deps) {
        if (!classData || !userId) {
            return false;
        }
        if (deps && typeof deps.classIsMine === 'function') {
            return deps.classIsMine(classData, userId);
        }
        return (classData.classTeachers || []).some((row) => row && row.userId === userId);
    }

    function filterClassesForZoneContext(classes, options, ctx) {
        const list = Array.isArray(classes) ? classes : [];
        const opts = options || {};
        const domainApi = ctx && ctx.domain;
        const deps = (ctx && ctx.deps) || {};
        const userId = ctx && ctx.currentUserId ? ctx.currentUserId : '';
        return list.filter((classData) => {
            if (!classData) {
                return false;
            }
            if (opts.myClassesOnly && !classIsMine(classData, userId, deps)) {
                return false;
            }
            if (opts.essaysOnly && !classHasEssayAssignments(classData, domainApi)) {
                return false;
            }
            return true;
        });
    }

    global.CCPEssayClassFilter = {
        classHasEssayAssignments,
        classIsMine,
        filterClassesForZoneContext
    };
})(typeof window !== 'undefined' ? window : globalThis);
