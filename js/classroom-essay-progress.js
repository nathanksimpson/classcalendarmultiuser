/**
 * Cross-class essay grading progress aggregation.
 */
(function (global) {
    function domain() {
        return global.CCPClassroomDomain;
    }

    function normalizeKey(classId, syllabusRowId) {
        return `${String(classId || '').trim()}|${String(syllabusRowId || '').trim()}`;
    }

    function parseAssignmentKey(key) {
        const parts = String(key || '').split('|');
        return { classId: parts[0] || '', syllabusRowId: parts[1] || '' };
    }

    function getAssignmentLabel(row) {
        if (!row) {
            return '';
        }
        return `${row.date || ''} — ${row.planTitle || row.planDetail || ''}`.trim();
    }

    function isOverdueISO(isoDate) {
        const d = domain();
        if (!d || !isoDate) {
            return false;
        }
        const days = d.daysUntilISO(isoDate);
        return days != null && days < 0;
    }

    /**
     * @param {object} appData
     * @param {{ classes?: object[], access?: object, cohortFilter?: function }} options
     */
    function listEssayAssignments(appData, options) {
        const opts = options || {};
        const d = domain();
        if (!d) {
            return [];
        }
        let classes = Array.isArray(opts.classes)
            ? opts.classes
            : Array.isArray(appData && appData.classes)
                ? appData.classes
                : [];
        const access = opts.access;
        if (access) {
            classes = classes.filter(
                (c) => c && (access.canEditClass(c) || access.canBypass())
            );
        }
        if (typeof opts.cohortFilter === 'function') {
            classes = opts.cohortFilter(classes);
        }

        const submissions = Array.isArray(appData && appData.essaySubmissions)
            ? appData.essaySubmissions
            : [];
        const assignments = [];

        classes.forEach((classData) => {
            if (!classData || !classData.id) {
                return;
            }
            const rows = d.getEssayRowsFromSyllabus(classData.syllabusRows);
            rows.forEach((row) => {
                const syllabusRowId = d.getSyllabusRowKey(row);
                if (!syllabusRowId) {
                    return;
                }
                const key = normalizeKey(classData.id, syllabusRowId);
                const submission = d.findEssaySubmission(submissions, classData.id, syllabusRowId);
                const students = d.resolveStudentsForClass(classData, appData.cohorts || []);
                const totalStudents = students.length;
                const counts = submission
                    ? d.countEssayByStatus(submission)
                    : {
                        not_submitted: totalStudents,
                        submitted: 0,
                        complete: 0,
                        resubmit_required: 0
                    };
                const ssDue = submission && submission.ssDueDate ? submission.ssDueDate : row.date || '';
                const teDue =
                    submission && submission.teacherEvalDueDate
                        ? submission.teacherEvalDueDate
                        : ssDue && d.addDaysISO
                            ? d.addDaysISO(ssDue, 2)
                            : '';
                const graded = (counts.complete || 0) + (counts.resubmit_required || 0);
                const pending = totalStudents - graded - (counts.submitted || 0);
                assignments.push({
                    key,
                    classId: classData.id,
                    className: classData.name || classData.id,
                    syllabusRowId,
                    lessonDate: row.date || '',
                    assignmentLabel: getAssignmentLabel(row),
                    totalStudents,
                    counts,
                    ssDueDate: ssDue,
                    teacherEvalDueDate: teDue,
                    ssOverdue: isOverdueISO(ssDue),
                    teOverdue: isOverdueISO(teDue),
                    percentComplete:
                        totalStudents > 0
                            ? Math.round(((counts.complete || 0) / totalStudents) * 100)
                            : 0,
                    hasPendingGrading: pending > 0 || (counts.submitted || 0) > 0
                });
            });
        });

        assignments.sort((a, b) => {
            const byClass = String(a.className).localeCompare(String(b.className));
            if (byClass !== 0) {
                return byClass;
            }
            return String(a.lessonDate).localeCompare(String(b.lessonDate));
        });
        return assignments;
    }

    function filterAssignments(assignments, options) {
        const opts = options || {};
        let list = Array.isArray(assignments) ? assignments.slice() : [];
        const selectedKeys = opts.selectedKeys;
        if (selectedKeys && selectedKeys.size) {
            list = list.filter((row) => selectedKeys.has(row.key));
        }
        if (opts.pendingOnly) {
            list = list.filter((row) => row.hasPendingGrading);
        }
        return list;
    }

    function groupAssignmentsByClass(assignments) {
        const groups = new Map();
        (assignments || []).forEach((row) => {
            if (!groups.has(row.classId)) {
                groups.set(row.classId, {
                    classId: row.classId,
                    className: row.className,
                    rows: []
                });
            }
            groups.get(row.classId).rows.push(row);
        });
        return Array.from(groups.values());
    }

    global.CCPClassroomEssayProgress = {
        normalizeKey,
        parseAssignmentKey,
        listEssayAssignments,
        filterAssignments,
        groupAssignmentsByClass
    };
})(typeof window !== 'undefined' ? window : globalThis);
