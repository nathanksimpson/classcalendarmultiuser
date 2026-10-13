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

    function isMyClass(classData, currentUserId) {
        const d = domain();
        if (d && d.essayReportClassIsMine) {
            return d.essayReportClassIsMine(classData, currentUserId);
        }
        if (!currentUserId || !classData) {
            return true;
        }
        const teachers = Array.isArray(classData.teacherIds) ? classData.teacherIds : [];
        if (!teachers.length) {
            return true;
        }
        return teachers.includes(currentUserId);
    }

    function classScopeOf(filters) {
        const d = domain();
        const opts = filters || {};
        if (d && d.normalizeEssayReportClassScope) {
            return d.normalizeEssayReportClassScope(opts.classScope, opts.myClassesOnly);
        }
        if (opts.classScope === 'mine' || opts.classScope === 'other' || opts.classScope === 'all') {
            return opts.classScope;
        }
        return opts.myClassesOnly ? 'mine' : 'all';
    }

    function classHasEssaySubject(classData, appData, essaySubject) {
        const d = domain();
        if (!essaySubject || !d || !d.listEssayResubmitRows || !d.essayReportSubjectMatches) {
            return true;
        }
        const rows = d.listEssayResubmitRows(appData, { classes: [classData] });
        return rows.some((row) => d.essayReportSubjectMatches(row && row.essaySubject, essaySubject));
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
            const scope = classScopeOf(opts);
            if (scope === 'mine' && !isMyClass(classData, opts.currentUserId)) {
                return false;
            }
            if (scope === 'other' && isMyClass(classData, opts.currentUserId)) {
                return false;
            }
            if (opts.essaySubject && !classHasEssaySubject(classData, appData, opts.essaySubject)) {
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
        const d = domain();
        let list = rows || [];
        const selected = opts.selectedClassIds;
        if (selected instanceof Set) {
            if (selected.size) {
                list = list.filter((row) => row && selected.has(row.classId));
            }
        } else if (selected) {
            const idSet = selected instanceof Set ? selected : new Set(selected);
            list = list.filter((row) => row && idSet.has(row.classId));
        }
        if (opts.essaySubject && d && d.essayReportSubjectMatches) {
            list = list.filter((row) =>
                d.essayReportSubjectMatches(row && row.essaySubject, opts.essaySubject)
            );
        }
        return list;
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
