/**
 * Term summary aggregation for classroom data (points, attendance, homework, tests).
 */
(function (global) {
    function domain() {
        return typeof global.CCPClassroomDomain !== 'undefined' ? global.CCPClassroomDomain : null;
    }

    function compareDateStr(a, b) {
        const d = domain();
        if (d && d.compareDateStr) {
            return d.compareDateStr(a, b);
        }
        return String(a || '').localeCompare(String(b || ''));
    }

    function isDateInRange(dateStr, from, to) {
        const date = String(dateStr || '').trim();
        if (!date) {
            return false;
        }
        const start = String(from || '').trim();
        const end = String(to || '').trim();
        if (start && compareDateStr(date, start) < 0) {
            return false;
        }
        if (end && compareDateStr(date, end) > 0) {
            return false;
        }
        return true;
    }

    function getClassTermDateRange(classData) {
        if (!classData) {
            return { from: '', to: '' };
        }
        return {
            from: String(classData.startDate || '').trim(),
            to: String(classData.endDate || '').trim()
        };
    }

    function resolveClassesForStudent(appData, studentId) {
        const sid = String(studentId || '').trim();
        const d = domain();
        if (!sid || !d) {
            return [];
        }
        return (appData.classes || [])
            .filter((c) => c && c.id)
            .filter((classData) => {
                const entries = d.resolveStudentsForClass(classData, appData.cohorts);
                return entries.some((e) => e.student && e.student.id === sid);
            });
    }

    function emptyAttendanceCounts() {
        return { present: 0, late: 0, absent: 0, early_leave: 0, sessions: 0 };
    }

    function emptyHomeworkCounts() {
        return { A: 0, B: 0, C: 0, N: 0, F: 0, X: 0, total: 0 };
    }

    function aggregatePointsForStudent(points, classId, studentId, from, to) {
        const d = domain();
        let total = 0;
        const byReason = new Map();
        (points || []).forEach((raw) => {
            const p = d && d.normalizePointEntry ? d.normalizePointEntry(raw) : raw;
            if (!p || p.classId !== classId || p.studentId !== studentId) {
                return;
            }
            if (!isDateInRange(p.date, from, to)) {
                return;
            }
            total += Number(p.delta) || 0;
            const reason = String(p.reason || '').trim() || '(none)';
            byReason.set(reason, (byReason.get(reason) || 0) + (Number(p.delta) || 0));
        });
        const reasons = Array.from(byReason.entries())
            .filter(([, net]) => net !== 0)
            .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
            .map(([reason, net]) => ({ reason, net }));
        return { total, reasons };
    }

    function aggregateAttendanceForStudent(sessions, classId, studentId, from, to) {
        const d = domain();
        const counts = emptyAttendanceCounts();
        (sessions || []).forEach((raw) => {
            const session = d && d.normalizeAttendanceSession ? d.normalizeAttendanceSession(raw) : raw;
            if (!session || session.classId !== classId) {
                return;
            }
            if (!isDateInRange(session.date, from, to)) {
                return;
            }
            const rec = d && d.getAttendanceRecordForStudent
                ? d.getAttendanceRecordForStudent(session, studentId)
                : (session.records || []).find((r) => r.studentId === studentId);
            if (!rec) {
                return;
            }
            counts.sessions += 1;
            if (counts[rec.status] != null) {
                counts[rec.status] += 1;
            }
        });
        return counts;
    }

    function aggregateHomeworkForStudent(completions, classId, studentId, from, to) {
        const d = domain();
        const grades = emptyHomeworkCounts();
        (completions || []).forEach((raw) => {
            const hw = d && d.normalizeHomeworkCompletion ? d.normalizeHomeworkCompletion(raw) : raw;
            if (!hw || hw.classId !== classId) {
                return;
            }
            const lessonDate = hw.lessonDate || '';
            if (!isDateInRange(lessonDate, from, to)) {
                return;
            }
            const rec = d && d.getHomeworkRecordForStudent
                ? d.getHomeworkRecordForStudent(hw, studentId)
                : (hw.records || []).find((r) => r.studentId === studentId);
            if (!rec) {
                return;
            }
            grades.total += 1;
            const g = rec.grade || 'X';
            if (grades[g] != null) {
                grades[g] += 1;
            } else {
                grades.X += 1;
            }
        });
        return grades;
    }

    function aggregateTestsForStudent(tests, classId, studentId, from, to) {
        const d = domain();
        const rows = [];
        (tests || []).forEach((raw) => {
            const test = d && d.normalizeStudentTest ? d.normalizeStudentTest(raw) : raw;
            if (!test || test.classId !== classId) {
                return;
            }
            if (!isDateInRange(test.testDate, from, to)) {
                return;
            }
            const rec = (test.records || []).find((r) => r.studentId === studentId);
            if (!rec) {
                return;
            }
            rows.push({
                testName: test.testName,
                testDate: test.testDate,
                score: rec.score,
                maxScore: rec.maxScore,
                note: rec.note || ''
            });
        });
        rows.sort((a, b) => compareDateStr(a.testDate, b.testDate) || String(a.testName).localeCompare(String(b.testName)));
        return rows;
    }

    function buildStudentTermSection(appData, classData, studentId) {
        const d = domain();
        const range = getClassTermDateRange(classData);
        const cid = classData.id;
        return {
            classId: cid,
            className: classData.name || cid,
            termFrom: range.from,
            termTo: range.to,
            points: aggregatePointsForStudent(appData.studentPoints, cid, studentId, range.from, range.to),
            attendance: aggregateAttendanceForStudent(
                appData.attendanceSessions,
                cid,
                studentId,
                range.from,
                range.to
            ),
            homework: aggregateHomeworkForStudent(
                appData.homeworkCompletions,
                cid,
                studentId,
                range.from,
                range.to
            ),
            tests: aggregateTestsForStudent(appData.studentTests, cid, studentId, range.from, range.to)
        };
    }

    function buildClassTermSummaryPayload(appData, classId) {
        const d = domain();
        const cid = String(classId || '').trim();
        const classData = (appData.classes || []).find((c) => c && c.id === cid);
        if (!classData || !d) {
            return null;
        }
        const range = getClassTermDateRange(classData);
        const students = d.resolveStudentsForClass(classData, appData.cohorts);
        const studentRows = students.map((entry) => {
            const sid = entry.student.id;
            return {
                studentId: sid,
                studentName: entry.student.name || sid,
                points: aggregatePointsForStudent(appData.studentPoints, cid, sid, range.from, range.to),
                attendance: aggregateAttendanceForStudent(
                    appData.attendanceSessions,
                    cid,
                    sid,
                    range.from,
                    range.to
                ),
                homework: aggregateHomeworkForStudent(
                    appData.homeworkCompletions,
                    cid,
                    sid,
                    range.from,
                    range.to
                ),
                tests: aggregateTestsForStudent(appData.studentTests, cid, sid, range.from, range.to)
            };
        });
        return {
            kind: 'class',
            classId: cid,
            className: classData.name || cid,
            calendarName: String(appData.calendarName || '').trim(),
            termFrom: range.from,
            termTo: range.to,
            students: studentRows
        };
    }

    function buildStudentTermSummaryPayload(appData, studentId) {
        const d = domain();
        const sid = String(studentId || '').trim();
        if (!sid || !d) {
            return null;
        }
        let studentName = sid;
        (appData.cohorts || []).some((cohort) => {
            const found = (cohort.students || []).find((s) => s && s.id === sid);
            if (found) {
                studentName = found.name || sid;
                return true;
            }
            return false;
        });
        const classes = resolveClassesForStudent(appData, sid);
        const classSections = classes.map((classData) => buildStudentTermSection(appData, classData, sid));
        return {
            kind: 'student',
            studentId: sid,
            studentName,
            calendarName: String(appData.calendarName || '').trim(),
            classes: classSections
        };
    }

    global.CCPClassroomTermSummary = {
        getClassTermDateRange,
        isDateInRange,
        resolveClassesForStudent,
        buildClassTermSummaryPayload,
        buildStudentTermSummaryPayload,
        aggregatePointsForStudent,
        aggregateAttendanceForStudent,
        aggregateHomeworkForStudent,
        aggregateTestsForStudent
    };
})(typeof window !== 'undefined' ? window : globalThis);
