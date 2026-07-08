/**
 * Essay resubmit summary — filter classes, list rows, group for preview/print.
 */
(function (global) {
    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function domain() {
        return global.CCPClassroomDomain;
    }

    function classMatchesSearch(classData, query) {
        const q = normalizeStr(query).toLowerCase();
        if (!q) {
            return true;
        }
        const haystack = [
            classData && classData.name,
            classData && classData.id,
            classData && classData.grade,
            classData && classData.levelPreset,
            classData && classData.levelCustom,
            classData && classData.subject
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return haystack.includes(q);
    }

    function classHasResubmits(classData, appData) {
        const d = domain();
        if (!d || !classData) {
            return false;
        }
        const counts = d.essayAlertCountsForClass(
            appData.essaySubmissions,
            classData,
            appData.cohorts || []
        );
        return (counts.rs || 0) > 0;
    }

    function isMyClass(classData, currentUserId, appData) {
        if (!currentUserId || !classData) {
            return true;
        }
        const teachers = Array.isArray(classData.teacherIds) ? classData.teacherIds : [];
        if (!teachers.length) {
            return true;
        }
        return teachers.includes(currentUserId);
    }

    function filterClassesForSummary(classes, appData, filters) {
        const opts = filters || {};
        const d = domain();
        return (classes || []).filter((classData) => {
            if (!classData || !classData.id) {
                return false;
            }
            if (!classMatchesSearch(classData, opts.search)) {
                return false;
            }
            if (opts.classTypeId && normalizeStr(classData.classTypeId) !== normalizeStr(opts.classTypeId)) {
                return false;
            }
            if (opts.grade && normalizeStr(classData.grade) !== normalizeStr(opts.grade)) {
                return false;
            }
            if (opts.levelLabel && d && normalizeStr(d.resolveClassLevelLabel(classData)) !== normalizeStr(opts.levelLabel)) {
                return false;
            }
            if (opts.subject && normalizeStr(classData.subject) !== normalizeStr(opts.subject)) {
                return false;
            }
            if (opts.myClassesOnly && !isMyClass(classData, opts.currentUserId, appData)) {
                return false;
            }
            if (opts.hasResubmitsOnly && !classHasResubmits(classData, appData)) {
                return false;
            }
            return true;
        });
    }

    function listResubmitRows(appData, options) {
        const d = domain();
        if (!d || !d.listEssayResubmitRows) {
            return [];
        }
        return d.listEssayResubmitRows(appData, options || {});
    }

    function filterResubmitRows(rows, options) {
        const opts = options || {};
        const selected = opts.selectedClassIds;
        if (!selected || (selected instanceof Set && !selected.size)) {
            return rows || [];
        }
        const idSet = selected instanceof Set ? selected : new Set(selected);
        return (rows || []).filter((row) => row && idSet.has(row.classId));
    }

    function groupResubmitRowsByClass(rows) {
        const d = domain();
        if (!d || !d.groupEssayStudentRowsByClass) {
            return [];
        }
        return d.groupEssayStudentRowsByClass(rows || []);
    }

    function uniqueClassTypeOptions(classes, appData) {
        const d = domain();
        const seen = new Map();
        (classes || []).forEach((classData) => {
            if (!classData) {
                return;
            }
            const id = normalizeStr(classData.classTypeId);
            if (!id || seen.has(id)) {
                return;
            }
            const label = d && d.resolveClassTypeLabel ? d.resolveClassTypeLabel(classData, appData) : id;
            seen.set(id, { id, label: label || id });
        });
        return Array.from(seen.values()).sort((a, b) => String(a.label).localeCompare(String(b.label)));
    }

    global.CCPClassroomEssayResubmitSummary = {
        filterClassesForSummary,
        listResubmitRows,
        filterResubmitRows,
        groupResubmitRowsByClass,
        uniqueClassTypeOptions
    };
})(typeof window !== 'undefined' ? window : globalThis);
