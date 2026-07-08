/**
 * Cross-class essay student progress aggregation.
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
                const submissionWithRecords = d.ensureEssayRecordsForStudents(submission, students);
                const counts = d.countEssayByStatus(submissionWithRecords);
                const ssDue =
                    submission && submission.ssDueDate ? submission.ssDueDate : row.date || '';
                const teDue =
                    submission && submission.teacherEvalDueDate
                        ? submission.teacherEvalDueDate
                        : ssDue && d.addDaysISO
                            ? d.addDaysISO(ssDue, 2)
                            : '';
                const outstandingStudentCount =
                    (counts.not_submitted || 0) + (counts.resubmit_required || 0);
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
                    outstandingStudentCount,
                    hasOutstandingStudents: outstandingStudentCount > 0,
                    percentComplete:
                        totalStudents > 0
                            ? Math.round(((counts.complete || 0) / totalStudents) * 100)
                            : 0
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
        const outstandingOnly = opts.outstandingOnly || opts.pendingOnly;
        if (outstandingOnly) {
            list = list.filter((row) => row.hasOutstandingStudents);
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

    function listStudentProgressForAssignments(appData, assignments, options) {
        const d = domain();
        if (!d || !d.listEssayOutstandingStudentRows) {
            return [];
        }
        const opts = options || {};
        const assignmentList = Array.isArray(assignments) ? assignments : [];
        const keySet = new Set(assignmentList.map((row) => row && row.key).filter(Boolean));
        if (!keySet.size) {
            return [];
        }
        const classes = [];
        const classIds = new Set();
        assignmentList.forEach((row) => {
            if (row && row.classId && !classIds.has(row.classId)) {
                classIds.add(row.classId);
                classes.push({ id: row.classId, className: row.className });
            }
        });
        const allClasses = Array.isArray(appData && appData.classes) ? appData.classes : [];
        const classFilter = allClasses.filter((c) => c && classIds.has(c.id));
        const rows = d.listEssayOutstandingStudentRows(appData, {
            classes: classFilter.length ? classFilter : classes,
            statuses: opts.statuses
        });
        return rows.filter((row) => keySet.has(normalizeKey(row.classId, row.syllabusRowId)));
    }

    function groupStudentProgressForReport(rows) {
        const classGroups = new Map();
        (rows || []).forEach((row) => {
            if (!row || !row.classId) {
                return;
            }
            const assignKey = normalizeKey(row.classId, row.syllabusRowId);
            if (!classGroups.has(row.classId)) {
                classGroups.set(row.classId, {
                    classId: row.classId,
                    className: row.className || row.classId,
                    classTypeLabel: row.classTypeLabel || '',
                    levelLabel: row.levelLabel || '',
                    assignments: new Map()
                });
            }
            const classGroup = classGroups.get(row.classId);
            if (!classGroup.assignments.has(assignKey)) {
                classGroup.assignments.set(assignKey, {
                    key: assignKey,
                    syllabusRowId: row.syllabusRowId,
                    assignmentLabel: row.assignmentLabel || '',
                    lessonDate: row.lessonDate || '',
                    notSubmitted: [],
                    resubmit: []
                });
            }
            const assignGroup = classGroup.assignments.get(assignKey);
            if (row.status === 'resubmit_required') {
                assignGroup.resubmit.push(row);
            } else {
                assignGroup.notSubmitted.push(row);
            }
        });
        return Array.from(classGroups.values()).map((group) => ({
            classId: group.classId,
            className: group.className,
            classTypeLabel: group.classTypeLabel,
            levelLabel: group.levelLabel,
            assignments: Array.from(group.assignments.values()).sort((a, b) =>
                String(a.lessonDate).localeCompare(String(b.lessonDate))
            )
        }));
    }

    global.CCPClassroomEssayProgress = {
        normalizeKey,
        parseAssignmentKey,
        listEssayAssignments,
        filterAssignments,
        groupAssignmentsByClass,
        listStudentProgressForAssignments,
        groupStudentProgressForReport
    };
})(typeof window !== 'undefined' ? window : globalThis);
