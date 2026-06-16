/**
 * Classroom CSV exports — attendance and homework completion reports.
 */
(function (global) {
    function escapeCsvCell(value) {
        const s = value == null ? '' : String(value);
        if (/[",\n\r]/.test(s)) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    }

    function downloadCsv(filename, rows) {
        const body = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
        const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function resolveStudentName(studentId, cohorts) {
        const sid = String(studentId || '').trim();
        for (const cohort of cohorts || []) {
            const students = (cohort && cohort.students) || [];
            const found = students.find((s) => s && s.id === sid);
            if (found) {
                return found.name || sid;
            }
        }
        return sid;
    }

    function resolveClassName(classId, classes) {
        const cls = (classes || []).find((c) => c && c.id === classId);
        return cls ? cls.name || classId : classId;
    }

    function exportAttendanceCsv(appData, options) {
        const data = appData || {};
        const opts = options || {};
        const from = opts.from || '';
        const to = opts.to || '';
        const d = global.CCPClassroomDomain;
        const compare = d ? d.compareDateStr.bind(d) : (a, b) => String(a).localeCompare(String(b));
        const rows = [['Date', 'Class', 'Student', 'Status', 'Session note']];
        (data.attendanceSessions || []).forEach((session) => {
            if (!session || !session.date) {
                return;
            }
            if (from && compare(session.date, from) < 0) {
                return;
            }
            if (to && compare(session.date, to) > 0) {
                return;
            }
            const className = resolveClassName(session.classId, data.classes);
            (session.records || []).forEach((rec) => {
                if (!rec || !rec.studentId) {
                    return;
                }
                rows.push([
                    session.date,
                    className,
                    resolveStudentName(rec.studentId, data.cohorts),
                    rec.status || '',
                    rec.sessionNote || ''
                ]);
            });
        });
        const stamp = new Date().toISOString().slice(0, 10);
        downloadCsv(`attendance-report_${stamp}.csv`, rows);
    }

    function exportHomeworkCsv(appData, options) {
        const data = appData || {};
        const opts = options || {};
        const from = opts.from || '';
        const to = opts.to || '';
        const d = global.CCPClassroomDomain;
        const compare = d ? d.compareDateStr.bind(d) : (a, b) => String(a).localeCompare(String(b));
        const rows = [['Lesson date', 'Class', 'Student', 'Grade', 'Self check', 'Parent check', 'Note']];
        (data.homeworkCompletions || []).forEach((hw) => {
            if (!hw) {
                return;
            }
            const lessonDate = hw.lessonDate || '';
            if (from && lessonDate && compare(lessonDate, from) < 0) {
                return;
            }
            if (to && lessonDate && compare(lessonDate, to) > 0) {
                return;
            }
            const className = resolveClassName(hw.classId, data.classes);
            (hw.records || []).forEach((rec) => {
                if (!rec || !rec.studentId) {
                    return;
                }
                rows.push([
                    lessonDate,
                    className,
                    resolveStudentName(rec.studentId, data.cohorts),
                    rec.grade || '',
                    rec.selfCheck || '',
                    rec.parentCheck ? 'yes' : 'no',
                    rec.note || ''
                ]);
            });
        });
        const stamp = new Date().toISOString().slice(0, 10);
        downloadCsv(`homework-report_${stamp}.csv`, rows);
    }

    global.CCPClassroomReports = {
        exportAttendanceCsv,
        exportHomeworkCsv,
        downloadCsv
    };
})(typeof window !== 'undefined' ? window : globalThis);
