/**
 * Ledger data bridge — native classroom domain default; alternate tracker via postMessage later.
 */
(function (global) {
    function domain() {
        return global.CCPClassroomDomain;
    }

    function nativeBridge(hooks) {
        return {
            id: 'native',
            getRoster(classId) {
                const data = hooks.getAppData();
                const cls = (data.classes || []).find((c) => c && c.id === classId);
                const d = domain();
                return d ? d.resolveStudentsForClass(cls, data.cohorts) : [];
            },
            getAttendanceSession(classId, dateStr) {
                const data = hooks.getAppData();
                const d = domain();
                return d ? d.findAttendanceSession(data.attendanceSessions, classId, dateStr) : null;
            },
            getAttendanceStatus(classId, dateStr, studentId) {
                const session = this.getAttendanceSession(classId, dateStr);
                if (!session || !Array.isArray(session.records)) {
                    return 'present';
                }
                const rec = session.records.find((r) => r.studentId === studentId);
                return rec && rec.status ? rec.status : 'present';
            },
            setAttendanceStatus(classId, dateStr, studentId, status, draftSession) {
                const d = domain();
                if (!d) {
                    return draftSession;
                }
                const records = Array.isArray(draftSession.records) ? draftSession.records.slice() : [];
                const idx = records.findIndex((r) => r.studentId === studentId);
                const base = idx >= 0 ? records[idx] : { studentId, status: 'present', sessionNote: '' };
                const next = Object.assign({}, base, { status });
                if (idx >= 0) {
                    records[idx] = next;
                } else {
                    records.push(next);
                }
                return Object.assign({}, draftSession, { classId, date: dateStr, records });
            },
            getHomeworkGrade(classId, syllabusRowId, studentId) {
                const data = hooks.getAppData();
                const d = domain();
                const completion = d
                    ? d.findHomeworkCompletion(data.homeworkCompletions, classId, syllabusRowId)
                    : null;
                if (!completion || !Array.isArray(completion.records)) {
                    return '';
                }
                const rec = completion.records.find((r) => r.studentId === studentId);
                return rec && rec.grade ? rec.grade : '';
            },
            setHomeworkGrade(classId, syllabusRowId, lessonDate, studentId, grade, draftCompletion) {
                const records = Array.isArray(draftCompletion.records) ? draftCompletion.records.slice() : [];
                const idx = records.findIndex((r) => r.studentId === studentId);
                const base = idx >= 0 ? records[idx] : { studentId, grade: '', selfCheck: 'none', parentCheck: false, note: '' };
                const next = Object.assign({}, base, { grade });
                if (idx >= 0) {
                    records[idx] = next;
                } else {
                    records.push(next);
                }
                return Object.assign({}, draftCompletion, {
                    classId,
                    syllabusRowId,
                    lessonDate,
                    records
                });
            },
            getPointsSum(classId, studentId) {
                const data = hooks.getAppData();
                const d = domain();
                return d ? d.sumPointsForStudent(data.studentPoints, classId, studentId) : 0;
            },
            buildPointEntry(classId, dateStr, studentId, delta, reason) {
                const d = domain();
                return {
                    id: d.newId('pt'),
                    classId,
                    studentId,
                    date: dateStr,
                    delta: Math.round(delta),
                    reason: String(reason || '').trim()
                };
            }
        };
    }

    /** Stub for integrated homework tracker — implement postMessage when embedded. */
    function trackerBridge(hooks) {
        const base = nativeBridge(hooks);
        return Object.assign({}, base, { id: 'tracker-stub' });
    }

    function createBridge(hooks, options) {
        options = options || {};
        if (options.mode === 'tracker') {
            return trackerBridge(hooks);
        }
        return nativeBridge(hooks);
    }

    global.CCPLedgerBridge = {
        createBridge,
        nativeBridge
    };
})(typeof window !== 'undefined' ? window : globalThis);
