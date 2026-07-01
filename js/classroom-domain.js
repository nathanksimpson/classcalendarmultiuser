/**
 * Classroom domain helpers — students, attendance, homework (pure, no DOM).
 */
(function (global) {
    const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'early_leave'];
    const HOMEWORK_GRADES = ['A', 'B', 'C', 'N', 'F', 'X'];
    const HOMEWORK_SELF_CHECKS = ['none', 'not_checked', 'satisfied'];
    const ESSAY_STATUSES = ['not_submitted', 'submitted', 'complete', 'resubmit_required'];
    const STUDENT_TAGS = ['interested', 'new', 'ending_soon', 'starting_soon'];
    const ARCHIVE_REASONS = ['break', 'new', 'left', 'starting_soon'];
    const ARCHIVE_COHORT_ID = 'cohort-student-archive';
    const DEFAULT_ARCHIVE_RETENTION_DAYS = 90;

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function compareDateStr(a, b) {
        return normalizeStr(a).localeCompare(normalizeStr(b));
    }

    function parseISODateLocal(dateStr) {
        if (global.CCPUtils && global.CCPUtils.parseISODateLocal) {
            return global.CCPUtils.parseISODateLocal(dateStr);
        }
        if (!dateStr || typeof dateStr !== 'string') {
            return new Date(NaN);
        }
        const parts = dateStr.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function formatISODate(d) {
        if (global.CCPUtils && global.CCPUtils.formatISODate) {
            return global.CCPUtils.formatISODate(d);
        }
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function todayISO() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return formatISODate(d);
    }

    function addDaysISO(dateStr, days) {
        const d = parseISODateLocal(dateStr);
        if (Number.isNaN(d.getTime())) {
            return dateStr;
        }
        d.setDate(d.getDate() + days);
        return formatISODate(d);
    }

    function getCohortIdsForClass(classData) {
        if (!classData) {
            return [];
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

    function normalizeStudent(raw) {
        if (!raw || !raw.id) {
            return null;
        }
        const tags = Array.isArray(raw.tags)
            ? raw.tags.filter((t) => STUDENT_TAGS.includes(t))
            : [];
        let archiveReason = normalizeStr(raw.archiveReason);
        if (archiveReason && !ARCHIVE_REASONS.includes(archiveReason)) {
            archiveReason = '';
        }
        return {
            id: normalizeStr(raw.id),
            name: normalizeStr(raw.name),
            nameEn: normalizeStr(raw.nameEn),
            locationTag: normalizeStr(raw.locationTag),
            sortOrder: Number.isFinite(raw.sortOrder) ? raw.sortOrder : 0,
            active: raw.active !== false,
            tags,
            memo: normalizeStr(raw.memo),
            archivedAt: normalizeStr(raw.archivedAt),
            archiveReason,
            expectedStartDate: normalizeStr(raw.expectedStartDate)
        };
    }

    function isArchiveCohort(cohort) {
        if (!cohort) {
            return false;
        }
        if (cohort.isArchiveCohort === true) {
            return true;
        }
        return normalizeStr(cohort.id) === ARCHIVE_COHORT_ID;
    }

    function findArchiveCohort(cohorts) {
        return (Array.isArray(cohorts) ? cohorts : []).find((c) => isArchiveCohort(c)) || null;
    }

    function ensureArchiveCohort(cohorts, options) {
        const opts = options || {};
        const list = Array.isArray(cohorts) ? cohorts.filter(Boolean).slice() : [];
        const existing = findArchiveCohort(list);
        if (existing) {
            return { cohorts: list, archiveCohort: existing, created: false };
        }
        const archive = {
            id: ARCHIVE_COHORT_ID,
            name: normalizeStr(opts.name) || 'Student archive',
            isArchiveCohort: true,
            classIds: [],
            students: []
        };
        if (opts.homeroomTeacherUserId) {
            archive.homeroomTeacherUserId = normalizeStr(opts.homeroomTeacherUserId);
        }
        list.push(archive);
        return { cohorts: list, archiveCohort: archive, created: true };
    }

    function findStudentCohort(studentId, cohorts) {
        const sid = normalizeStr(studentId);
        if (!sid) {
            return null;
        }
        for (const cohort of cohorts || []) {
            if (!cohort || isArchiveCohort(cohort)) {
                continue;
            }
            const students = normalizeCohortStudents(cohort);
            if (students.some((s) => s.id === sid)) {
                return cohort;
            }
        }
        return null;
    }

    function cloneCohorts(cohorts) {
        return (Array.isArray(cohorts) ? cohorts : []).map((c) =>
            Object.assign({}, c, {
                students: Array.isArray(c.students) ? c.students.map((s) => Object.assign({}, s)) : []
            })
        );
    }

    function removeStudentFromCohort(cohorts, cohortId, studentId) {
        const cid = normalizeStr(cohortId);
        const sid = normalizeStr(studentId);
        return cohorts.map((c) => {
            if (!c || c.id !== cid) {
                return c;
            }
            return Object.assign({}, c, {
                students: (c.students || []).filter((s) => s && normalizeStr(s.id) !== sid)
            });
        });
    }

    function archiveStudent(cohorts, studentId, fromCohortId, meta) {
        const opts = meta || {};
        const sid = normalizeStr(studentId);
        const fromId = normalizeStr(fromCohortId);
        if (!sid || !fromId) {
            return { error: 'missing_student', cohorts };
        }
        let list = cloneCohorts(cohorts);
        const fromCohort = list.find((c) => c && c.id === fromId);
        if (!fromCohort || isArchiveCohort(fromCohort)) {
            return { error: 'invalid_source', cohorts: list };
        }
        const student = normalizeCohortStudents(fromCohort).find((s) => s.id === sid);
        if (!student) {
            return { error: 'student_not_found', cohorts: list };
        }
        const ensured = ensureArchiveCohort(list, { homeroomTeacherUserId: opts.homeroomTeacherUserId });
        list = ensured.cohorts;
        const archiveId = ensured.archiveCohort.id;
        list = removeStudentFromCohort(list, fromId, sid);
        const reason = ARCHIVE_REASONS.includes(opts.archiveReason) ? opts.archiveReason : 'break';
        const tags = Array.isArray(student.tags) ? student.tags.filter((t) => t !== 'starting_soon') : [];
        if (reason === 'starting_soon') {
            tags.push('starting_soon');
        }
        const archived = Object.assign({}, student, {
            active: false,
            archivedAt: opts.archivedAt || new Date().toISOString(),
            archiveReason: reason,
            expectedStartDate: reason === 'starting_soon' ? normalizeStr(opts.expectedStartDate) : '',
            tags
        });
        list = list.map((c) => {
            if (!c || c.id !== archiveId) {
                return c;
            }
            const students = normalizeCohortStudents(c).filter((s) => s.id !== sid);
            students.push(archived);
            return Object.assign({}, c, { students });
        });
        return { error: null, cohorts: list, archiveCohortId: archiveId };
    }

    function restoreStudentFromArchive(cohorts, studentId, toCohortId) {
        const sid = normalizeStr(studentId);
        const toId = normalizeStr(toCohortId);
        let list = cloneCohorts(cohorts);
        const archive = findArchiveCohort(list);
        if (!archive || !sid || !toId) {
            return { error: 'invalid_restore', cohorts: list };
        }
        const student = normalizeCohortStudents(archive).find((s) => s.id === sid);
        const target = list.find((c) => c && c.id === toId);
        if (!student || !target || isArchiveCohort(target)) {
            return { error: 'invalid_restore', cohorts: list };
        }
        list = removeStudentFromCohort(list, archive.id, sid);
        const restored = Object.assign({}, student, {
            active: true,
            archivedAt: '',
            archiveReason: '',
            expectedStartDate: '',
            tags: (student.tags || []).filter((t) => t !== 'starting_soon')
        });
        list = list.map((c) => {
            if (!c || c.id !== toId) {
                return c;
            }
            const students = normalizeCohortStudents(c).filter((s) => s.id !== sid);
            students.push(restored);
            return Object.assign({}, c, { students });
        });
        return { error: null, cohorts: list };
    }

    function moveStudentsBetweenCohorts(cohorts, fromCohortId, toCohortId, studentIds) {
        const fromId = normalizeStr(fromCohortId);
        const toId = normalizeStr(toCohortId);
        const ids = (Array.isArray(studentIds) ? studentIds : []).map(normalizeStr).filter(Boolean);
        const list = cloneCohorts(cohorts);
        if (!fromId || !toId) {
            return { error: 'missing_cohort', cohorts: list, duplicates: [] };
        }
        if (!ids.length) {
            return { error: 'no_students', cohorts: list, duplicates: [] };
        }
        if (fromId === toId) {
            return { error: 'same_cohort', cohorts: list, duplicates: [] };
        }
        const fromCohort = list.find((c) => c && c.id === fromId);
        const toCohort = list.find((c) => c && c.id === toId);
        if (!fromCohort || !toCohort) {
            return { error: 'cohort_not_found', cohorts: list, duplicates: [] };
        }
        if (isArchiveCohort(fromCohort) || isArchiveCohort(toCohort)) {
            return { error: 'archive_cohort', cohorts: list, duplicates: [] };
        }
        const fromStudents = normalizeCohortStudents(fromCohort);
        const toStudents = normalizeCohortStudents(toCohort);
        const toIdSet = new Set(toStudents.map((s) => s.id));
        const duplicates = ids.filter((id) => toIdSet.has(id));
        if (duplicates.length) {
            return { error: 'duplicate_in_target', cohorts: list, duplicates };
        }
        const moveSet = new Set(ids);
        const moving = [];
        for (const sid of ids) {
            const student = fromStudents.find((s) => s.id === sid);
            if (!student) {
                return { error: 'student_not_found', cohorts: list, duplicates: [] };
            }
            moving.push(Object.assign({}, student));
        }
        let next = list.map((c) => {
            if (!c || c.id !== fromId) {
                return c;
            }
            return Object.assign({}, c, {
                students: fromStudents.filter((s) => !moveSet.has(s.id))
            });
        });
        const targetStudents = normalizeCohortStudents(toCohort);
        let sortOrder = targetStudents.length;
        const appended = moving.map((s) =>
            Object.assign({}, s, {
                sortOrder: sortOrder++
            })
        );
        next = next.map((c) => {
            if (!c || c.id !== toId) {
                return c;
            }
            return Object.assign({}, c, {
                students: targetStudents.concat(appended)
            });
        });
        return { error: null, cohorts: next, movedCount: moving.length, duplicates: [] };
    }

    function purgeStudentRecords(data, studentId) {
        const sid = normalizeStr(studentId);
        if (!sid || !data) {
            return data;
        }
        const next = Object.assign({}, data);
        if (Array.isArray(next.attendanceSessions)) {
            next.attendanceSessions = next.attendanceSessions.map((session) => {
                if (!session || !Array.isArray(session.records)) {
                    return session;
                }
                return Object.assign({}, session, {
                    records: session.records.filter((r) => normalizeStr(r.studentId) !== sid)
                });
            });
        }
        if (Array.isArray(next.homeworkCompletions)) {
            next.homeworkCompletions = next.homeworkCompletions.map((hw) => {
                if (!hw || !Array.isArray(hw.records)) {
                    return hw;
                }
                return Object.assign({}, hw, {
                    records: hw.records.filter((r) => normalizeStr(r.studentId) !== sid)
                });
            });
        }
        if (Array.isArray(next.essaySubmissions)) {
            next.essaySubmissions = next.essaySubmissions.map((essay) => {
                if (!essay || !Array.isArray(essay.records)) {
                    return essay;
                }
                return Object.assign({}, essay, {
                    records: essay.records.filter((r) => normalizeStr(r.studentId) !== sid)
                });
            });
        }
        if (Array.isArray(next.studentPoints)) {
            next.studentPoints = next.studentPoints.filter(
                (p) => !p || normalizeStr(p.studentId) !== sid
            );
        }
        if (Array.isArray(next.studentTests)) {
            next.studentTests = next.studentTests.map((test) => {
                if (!test || !Array.isArray(test.records)) {
                    return test;
                }
                return Object.assign({}, test, {
                    records: test.records.filter((r) => normalizeStr(r.studentId) !== sid)
                });
            });
        }
        return next;
    }

    function deleteStudentPermanently(cohorts, studentId, cohortId) {
        const sid = normalizeStr(studentId);
        const cid = normalizeStr(cohortId);
        if (!sid || !cid) {
            return { error: 'missing_student', cohorts };
        }
        let list = cloneCohorts(cohorts);
        const cohort = list.find((c) => c && c.id === cid);
        if (!cohort) {
            return { error: 'cohort_not_found', cohorts: list };
        }
        if (!normalizeCohortStudents(cohort).some((s) => s.id === sid)) {
            return { error: 'student_not_found', cohorts: list };
        }
        list = removeStudentFromCohort(list, cid, sid);
        return { error: null, cohorts: list, studentId: sid };
    }

    function isPastArchiveRetention(student, retentionDays, refDate) {
        const days = Number(retentionDays);
        if (!student || !student.archivedAt || !Number.isFinite(days) || days <= 0) {
            return false;
        }
        const archivedDate = normalizeStr(student.archivedAt).slice(0, 10);
        if (!archivedDate) {
            return false;
        }
        const ref = normalizeStr(refDate) || todayISO();
        const cutoff = addDaysISO(archivedDate, days);
        return compareDateStr(ref, cutoff) > 0;
    }

    function listStudentsPastRetention(cohort, retentionDays, refDate) {
        if (!cohort || !isArchiveCohort(cohort)) {
            return [];
        }
        return normalizeCohortStudents(cohort).filter((s) =>
            isPastArchiveRetention(s, retentionDays, refDate)
        );
    }

    function normalizeCohortStudents(cohort) {
        if (!cohort) {
            return [];
        }
        const list = Array.isArray(cohort.students) ? cohort.students : [];
        return list
            .map(normalizeStudent)
            .filter(Boolean)
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }

    /**
     * Active students for a class (union of linked cohorts, deduped by id).
     * @returns {Array<{ student, cohortId, cohortName }>}
     */
    function resolveStudentsForClass(classData, cohorts) {
        if (!classData) {
            return [];
        }
        const cohortList = Array.isArray(cohorts) ? cohorts : [];
        const cohortIds = getCohortIdsForClass(classData);
        const byId = new Map();
        cohortIds.forEach((cohortId) => {
            const cohort = cohortList.find((c) => c && c.id === cohortId);
            if (!cohort) {
                return;
            }
            normalizeCohortStudents(cohort)
                .filter((s) => s.active)
                .forEach((student) => {
                    if (!byId.has(student.id)) {
                        byId.set(student.id, {
                            student,
                            cohortId: cohort.id,
                            cohortName: normalizeStr(cohort.name)
                        });
                    }
                });
        });
        return Array.from(byId.values()).sort(
            (a, b) => a.student.sortOrder - b.student.sortOrder
                || a.student.name.localeCompare(b.student.name)
        );
    }

    function findStudentInCohorts(studentId, cohorts) {
        const sid = normalizeStr(studentId);
        if (!sid) {
            return null;
        }
        for (const cohort of cohorts || []) {
            const students = normalizeCohortStudents(cohort);
            const found = students.find((s) => s.id === sid);
            if (found) {
                return { student: found, cohort };
            }
        }
        return null;
    }

    function attendanceSessionKey(classId, date) {
        return `${normalizeStr(classId)}|${normalizeStr(date)}`;
    }

    function normalizeAttendanceRecord(raw) {
        if (!raw || !raw.studentId) {
            return null;
        }
        const status = ATTENDANCE_STATUSES.includes(raw.status) ? raw.status : 'present';
        return {
            studentId: normalizeStr(raw.studentId),
            status,
            sessionNote: normalizeStr(raw.sessionNote)
        };
    }

    function normalizeAttendanceSession(raw) {
        if (!raw || !raw.id || !raw.classId || !raw.date) {
            return null;
        }
        const records = Array.isArray(raw.records)
            ? raw.records.map(normalizeAttendanceRecord).filter(Boolean)
            : [];
        return {
            id: normalizeStr(raw.id),
            classId: normalizeStr(raw.classId),
            date: normalizeStr(raw.date),
            records,
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function findAttendanceSession(sessions, classId, date) {
        const list = Array.isArray(sessions) ? sessions : [];
        const cid = normalizeStr(classId);
        const d = normalizeStr(date);
        return list.find((s) => s && s.classId === cid && s.date === d) || null;
    }

    function upsertAttendanceSession(sessions, session) {
        const normalized = normalizeAttendanceSession(session);
        if (!normalized) {
            return Array.isArray(sessions) ? sessions.slice() : [];
        }
        const list = Array.isArray(sessions) ? sessions.filter(Boolean).slice() : [];
        const idx = list.findIndex(
            (s) => s.classId === normalized.classId && s.date === normalized.date
        );
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], normalized, { id: list[idx].id || normalized.id });
        } else {
            list.push(normalized);
        }
        return list;
    }

    function getAttendanceRecordForStudent(session, studentId) {
        if (!session || !Array.isArray(session.records)) {
            return null;
        }
        const sid = normalizeStr(studentId);
        return session.records.find((r) => r.studentId === sid) || null;
    }

    function countAttendanceStatuses(session) {
        const counts = { present: 0, late: 0, absent: 0, early_leave: 0, total: 0 };
        if (!session || !Array.isArray(session.records)) {
            return counts;
        }
        session.records.forEach((r) => {
            if (!r || !r.studentId) {
                return;
            }
            counts.total += 1;
            if (counts[r.status] != null) {
                counts[r.status] += 1;
            }
        });
        return counts;
    }

    function countRecentAbsences(sessions, studentId, classId, refDate, windowDays) {
        const days = windowDays == null ? 30 : windowDays;
        const ref = normalizeStr(refDate) || todayISO();
        const cutoff = addDaysISO(ref, -days);
        const sid = normalizeStr(studentId);
        const cid = normalizeStr(classId);
        let count = 0;
        (sessions || []).forEach((session) => {
            if (!session || session.classId !== cid) {
                return;
            }
            if (compareDateStr(session.date, cutoff) < 0 || compareDateStr(session.date, ref) > 0) {
                return;
            }
            const rec = getAttendanceRecordForStudent(session, sid);
            if (rec && rec.status === 'absent') {
                count += 1;
            }
        });
        return count;
    }

    function normalizeHomeworkRecord(raw) {
        if (!raw || !raw.studentId) {
            return null;
        }
        let grade = normalizeStr(raw.grade).toUpperCase();
        if (!HOMEWORK_GRADES.includes(grade)) {
            grade = 'X';
        }
        let selfCheck = normalizeStr(raw.selfCheck);
        if (!HOMEWORK_SELF_CHECKS.includes(selfCheck)) {
            selfCheck = 'none';
        }
        return {
            studentId: normalizeStr(raw.studentId),
            grade,
            selfCheck,
            parentCheck: Boolean(raw.parentCheck),
            note: normalizeStr(raw.note)
        };
    }

    function normalizeHomeworkCompletion(raw) {
        if (!raw || !raw.id || !raw.classId) {
            return null;
        }
        const syllabusRowId = normalizeStr(raw.syllabusRowId);
        if (!syllabusRowId) {
            return null;
        }
        const records = Array.isArray(raw.records)
            ? raw.records.map(normalizeHomeworkRecord).filter(Boolean)
            : [];
        return {
            id: normalizeStr(raw.id),
            classId: normalizeStr(raw.classId),
            syllabusRowId,
            lessonDate: normalizeStr(raw.lessonDate),
            records,
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function findHomeworkCompletion(completions, classId, syllabusRowId) {
        const list = Array.isArray(completions) ? completions : [];
        const cid = normalizeStr(classId);
        const rid = normalizeStr(syllabusRowId);
        return list.find((h) => h && h.classId === cid && h.syllabusRowId === rid) || null;
    }

    function upsertHomeworkCompletion(completions, entry) {
        const normalized = normalizeHomeworkCompletion(entry);
        if (!normalized) {
            return Array.isArray(completions) ? completions.slice() : [];
        }
        const list = Array.isArray(completions) ? completions.filter(Boolean).slice() : [];
        const idx = list.findIndex(
            (h) => h.classId === normalized.classId && h.syllabusRowId === normalized.syllabusRowId
        );
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], normalized, { id: list[idx].id || normalized.id });
        } else {
            list.push(normalized);
        }
        return list;
    }

    function getHomeworkRecordForStudent(completion, studentId) {
        if (!completion || !Array.isArray(completion.records)) {
            return null;
        }
        const sid = normalizeStr(studentId);
        return completion.records.find((r) => r.studentId === sid) || null;
    }

    function isEssaySyllabusRow(row) {
        if (!row) {
            return false;
        }
        const hay = `${normalizeStr(row.planTitle)} ${normalizeStr(row.planDetail)} ${normalizeStr(row.homework)}`.toLowerCase();
        return hay.includes('essay') || hay.includes('에세이');
    }

    function getEssayRowsFromSyllabus(rows) {
        const lessons = getLessonRowsFromSyllabus(rows);
        const essayRows = lessons.filter(isEssaySyllabusRow);
        return essayRows.length ? essayRows : lessons;
    }

    function normalizeEssayRecord(raw) {
        if (!raw || !raw.studentId) {
            return null;
        }
        const status = normalizeStr(raw.status);
        const validStatus = ESSAY_STATUSES.includes(status) ? status : 'not_submitted';
        return {
            studentId: normalizeStr(raw.studentId),
            status: validStatus,
            submittedRetest: Boolean(raw.submittedRetest),
            note: normalizeStr(raw.note)
        };
    }

    function normalizeEssaySubmission(raw) {
        if (!raw || !raw.id || !raw.classId) {
            return null;
        }
        const syllabusRowId = normalizeStr(raw.syllabusRowId);
        if (!syllabusRowId) {
            return null;
        }
        const records = Array.isArray(raw.records)
            ? raw.records.map(normalizeEssayRecord).filter(Boolean)
            : [];
        return {
            id: normalizeStr(raw.id),
            classId: normalizeStr(raw.classId),
            syllabusRowId,
            lessonDate: normalizeStr(raw.lessonDate),
            ssDueDate: normalizeStr(raw.ssDueDate),
            teacherEvalDueDate: normalizeStr(raw.teacherEvalDueDate),
            records,
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function findEssaySubmission(submissions, classId, syllabusRowId) {
        const list = Array.isArray(submissions) ? submissions : [];
        const cid = normalizeStr(classId);
        const rid = normalizeStr(syllabusRowId);
        return list.find((e) => e && e.classId === cid && e.syllabusRowId === rid) || null;
    }

    function upsertEssaySubmission(submissions, entry) {
        const normalized = normalizeEssaySubmission(entry);
        if (!normalized) {
            return Array.isArray(submissions) ? submissions.slice() : [];
        }
        const list = Array.isArray(submissions) ? submissions.filter(Boolean).slice() : [];
        const idx = list.findIndex(
            (e) => e.classId === normalized.classId && e.syllabusRowId === normalized.syllabusRowId
        );
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], normalized, { id: list[idx].id || normalized.id });
        } else {
            list.push(normalized);
        }
        return list;
    }

    function getEssayRecordForStudent(submission, studentId) {
        if (!submission || !Array.isArray(submission.records)) {
            return null;
        }
        const sid = normalizeStr(studentId);
        return submission.records.find((r) => r.studentId === sid) || null;
    }

    function ensureEssayRecordsForStudents(submission, studentEntries) {
        const base = submission
            ? Object.assign({}, submission, {
                records: Array.isArray(submission.records) ? submission.records.slice() : []
            })
            : { records: [] };
        const records = base.records.slice();
        const seen = new Set(records.map((r) => normalizeStr(r.studentId)));
        (Array.isArray(studentEntries) ? studentEntries : []).forEach((entry) => {
            const sid = entry && entry.student && normalizeStr(entry.student.id);
            if (!sid || seen.has(sid)) {
                return;
            }
            records.push({
                studentId: sid,
                status: 'not_submitted',
                submittedRetest: false,
                note: ''
            });
            seen.add(sid);
        });
        base.records = records;
        return base;
    }

    function countEssayByStatus(submission) {
        const counts = { not_submitted: 0, submitted: 0, complete: 0, resubmit_required: 0 };
        if (!submission || !Array.isArray(submission.records)) {
            return counts;
        }
        submission.records.forEach((r) => {
            const status = r && ESSAY_STATUSES.includes(r.status) ? r.status : 'not_submitted';
            counts[status] += 1;
        });
        return counts;
    }

    function essayResubmitCount(submission) {
        return countEssayByStatus(submission).resubmit_required;
    }

    function essayResubmitCountForClass(submissions, classId) {
        const cid = normalizeStr(classId);
        let total = 0;
        (Array.isArray(submissions) ? submissions : []).forEach((raw) => {
            const essay = normalizeEssaySubmission(raw);
            if (essay && essay.classId === cid) {
                total += essayResubmitCount(essay);
            }
        });
        return total;
    }

    function daysUntilISO(dateStr) {
        const due = normalizeStr(dateStr);
        if (!due) {
            return null;
        }
        const today = todayISO();
        const tParts = today.split('-').map(Number);
        const dParts = due.split('-').map(Number);
        const tMs = Date.UTC(tParts[0], tParts[1] - 1, tParts[2]);
        const dMs = Date.UTC(dParts[0], dParts[1] - 1, dParts[2]);
        return Math.round((dMs - tMs) / 86400000);
    }

    function pickDefaultEssaySyllabusRow(classData, refDate) {
        const rows = getEssayRowsFromSyllabus(classData && classData.syllabusRows);
        if (!rows.length) {
            return null;
        }
        const ref = normalizeStr(refDate) || todayISO();
        for (let i = 0; i < rows.length; i += 1) {
            if (compareDateStr(rows[i].date, ref) >= 0) {
                return rows[i];
            }
        }
        return rows[rows.length - 1];
    }

    function getLessonRowsFromSyllabus(rows) {
        if (global.CCPHomeworkTab && global.CCPHomeworkTab.getLessonRowsFromSyllabus) {
            return global.CCPHomeworkTab.getLessonRowsFromSyllabus(rows);
        }
        return (rows || [])
            .filter((r) => r && r.kind === 'lesson' && r.date)
            .sort((a, b) => compareDateStr(a.date, b.date));
    }

    function getSyllabusRowKey(row) {
        if (!row) {
            return '';
        }
        const id = normalizeStr(row.id);
        if (id) {
            return id;
        }
        return `${normalizeStr(row.date)}|${row.sessionNumber || 0}|${normalizeStr(row.planTitle)}`;
    }

    function pickDefaultSyllabusRow(classData, refDate) {
        const rows = getLessonRowsFromSyllabus(classData && classData.syllabusRows);
        if (!rows.length) {
            return null;
        }
        const ref = normalizeStr(refDate) || todayISO();
        if (global.CCPHomeworkTab && global.CCPHomeworkTab.findTargetLessonIndex) {
            const idx = global.CCPHomeworkTab.findTargetLessonIndex(rows, ref);
            if (idx >= 0 && idx < rows.length) {
                return rows[idx];
            }
        }
        for (let i = 0; i < rows.length; i += 1) {
            if (compareDateStr(rows[i].date, ref) >= 0) {
                return rows[i];
            }
        }
        return rows[rows.length - 1];
    }

    function normalizePointEntry(raw) {
        if (!raw || !raw.id || !raw.classId || !raw.studentId) {
            return null;
        }
        const delta = Number(raw.delta);
        if (!Number.isFinite(delta) || delta === 0) {
            return null;
        }
        return {
            id: normalizeStr(raw.id),
            classId: normalizeStr(raw.classId),
            studentId: normalizeStr(raw.studentId),
            date: normalizeStr(raw.date) || todayISO(),
            delta: Math.round(delta),
            reason: normalizeStr(raw.reason),
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function listPointsForClass(points, classId) {
        const cid = normalizeStr(classId);
        return (Array.isArray(points) ? points : [])
            .map(normalizePointEntry)
            .filter(Boolean)
            .filter((p) => p.classId === cid)
            .sort((a, b) => compareDateStr(b.date, a.date) || b.updatedAt.localeCompare(a.updatedAt));
    }

    function sumPointsForStudent(points, classId, studentId) {
        const sid = normalizeStr(studentId);
        const cid = normalizeStr(classId);
        let total = 0;
        (Array.isArray(points) ? points : []).forEach((raw) => {
            const p = normalizePointEntry(raw);
            if (p && p.classId === cid && p.studentId === sid) {
                total += p.delta;
            }
        });
        return total;
    }

    function appendPointEntry(points, entry) {
        const normalized = normalizePointEntry(entry);
        if (!normalized) {
            return Array.isArray(points) ? points.slice() : [];
        }
        const list = Array.isArray(points) ? points.filter(Boolean).slice() : [];
        list.push(normalized);
        return list;
    }

    function appendPointEntries(points, entries) {
        let list = Array.isArray(points) ? points.filter(Boolean).slice() : [];
        (Array.isArray(entries) ? entries : []).forEach((raw) => {
            list = appendPointEntry(list, raw);
        });
        return list;
    }

    function studentTestKey(classId, testName, testDate) {
        return `${normalizeStr(classId)}|${normalizeStr(testName)}|${normalizeStr(testDate)}`;
    }

    function normalizeTestRecord(raw) {
        if (!raw || !raw.studentId) {
            return null;
        }
        const score = raw.score == null || raw.score === '' ? null : Number(raw.score);
        const maxScore = raw.maxScore == null || raw.maxScore === '' ? null : Number(raw.maxScore);
        return {
            studentId: normalizeStr(raw.studentId),
            score: Number.isFinite(score) ? score : null,
            maxScore: Number.isFinite(maxScore) ? maxScore : null,
            note: normalizeStr(raw.note)
        };
    }

    function normalizeStudentTest(raw) {
        if (!raw || !raw.id || !raw.classId) {
            return null;
        }
        const testName = normalizeStr(raw.testName);
        const testDate = normalizeStr(raw.testDate);
        if (!testName || !testDate) {
            return null;
        }
        const records = Array.isArray(raw.records)
            ? raw.records.map(normalizeTestRecord).filter(Boolean)
            : [];
        return {
            id: normalizeStr(raw.id),
            classId: normalizeStr(raw.classId),
            testName,
            testDate,
            records,
            authorUserId: normalizeStr(raw.authorUserId),
            updatedAt: normalizeStr(raw.updatedAt)
        };
    }

    function findStudentTest(tests, classId, testName, testDate) {
        const list = Array.isArray(tests) ? tests : [];
        const key = studentTestKey(classId, testName, testDate);
        return (
            list.find((t) => t && studentTestKey(t.classId, t.testName, t.testDate) === key) || null
        );
    }

    function upsertStudentTest(tests, entry) {
        const normalized = normalizeStudentTest(entry);
        if (!normalized) {
            return Array.isArray(tests) ? tests.slice() : [];
        }
        const list = Array.isArray(tests) ? tests.filter(Boolean).slice() : [];
        const key = studentTestKey(normalized.classId, normalized.testName, normalized.testDate);
        const idx = list.findIndex(
            (t) => t && studentTestKey(t.classId, t.testName, t.testDate) === key
        );
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], normalized, { id: list[idx].id || normalized.id });
        } else {
            list.push(normalized);
        }
        return list;
    }

    function getTestRecordForStudent(test, studentId) {
        if (!test || !Array.isArray(test.records)) {
            return null;
        }
        const sid = normalizeStr(studentId);
        return test.records.find((r) => r.studentId === sid) || null;
    }

    function listTestsForClass(tests, classId) {
        const cid = normalizeStr(classId);
        return (Array.isArray(tests) ? tests : [])
            .map(normalizeStudentTest)
            .filter(Boolean)
            .filter((t) => t.classId === cid)
            .sort((a, b) => compareDateStr(b.testDate, a.testDate) || a.testName.localeCompare(b.testName));
    }

    function migrateClassroomData(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }
        let migrated = false;
        if (!Array.isArray(data.attendanceSessions)) {
            data.attendanceSessions = [];
            migrated = true;
        }
        if (!Array.isArray(data.homeworkCompletions)) {
            data.homeworkCompletions = [];
            migrated = true;
        }
        if (!Array.isArray(data.essaySubmissions)) {
            data.essaySubmissions = [];
            migrated = true;
        }
        if (!Array.isArray(data.studentPoints)) {
            data.studentPoints = [];
            migrated = true;
        }
        if (!Array.isArray(data.studentTests)) {
            data.studentTests = [];
            migrated = true;
        }
        if (!Array.isArray(data.portfolioRecordings)) {
            data.portfolioRecordings = [];
            migrated = true;
        }
        if (!Array.isArray(data.portfolioEntries)) {
            data.portfolioEntries = [];
            migrated = true;
        }
        if (!Array.isArray(data.smsLog)) {
            data.smsLog = [];
            migrated = true;
        }
        if (Array.isArray(data.cohorts)) {
            data.cohorts.forEach((cohort) => {
                if (!cohort || typeof cohort !== 'object') {
                    return;
                }
                if (!Array.isArray(cohort.students)) {
                    cohort.students = [];
                    migrated = true;
                }
            });
            const ensured = ensureArchiveCohort(data.cohorts);
            if (ensured.created) {
                data.cohorts = ensured.cohorts;
                migrated = true;
            }
        }
        if (!data.ui || typeof data.ui !== 'object') {
            data.ui = {};
        }
        if (!Number.isFinite(data.ui.studentArchiveRetentionDays)) {
            data.ui.studentArchiveRetentionDays = DEFAULT_ARCHIVE_RETENTION_DAYS;
            migrated = true;
        }
        return migrated;
    }

    function newId(prefix) {
        if (global.CCPUtils && global.CCPUtils.newId) {
            return global.CCPUtils.newId(prefix);
        }
        return `${prefix || 'id'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    }

    const api = {
        ATTENDANCE_STATUSES,
        HOMEWORK_GRADES,
        HOMEWORK_SELF_CHECKS,
        ESSAY_STATUSES,
        STUDENT_TAGS,
        ARCHIVE_REASONS,
        ARCHIVE_COHORT_ID,
        DEFAULT_ARCHIVE_RETENTION_DAYS,
        isArchiveCohort,
        findArchiveCohort,
        ensureArchiveCohort,
        findStudentCohort,
        archiveStudent,
        restoreStudentFromArchive,
        moveStudentsBetweenCohorts,
        deleteStudentPermanently,
        purgeStudentRecords,
        isPastArchiveRetention,
        listStudentsPastRetention,
        normalizeStr,
        compareDateStr,
        todayISO,
        addDaysISO,
        getCohortIdsForClass,
        normalizeStudent,
        normalizeCohortStudents,
        resolveStudentsForClass,
        findStudentInCohorts,
        attendanceSessionKey,
        normalizeAttendanceSession,
        findAttendanceSession,
        upsertAttendanceSession,
        getAttendanceRecordForStudent,
        countAttendanceStatuses,
        countRecentAbsences,
        normalizeHomeworkCompletion,
        findHomeworkCompletion,
        upsertHomeworkCompletion,
        getHomeworkRecordForStudent,
        normalizeEssaySubmission,
        findEssaySubmission,
        upsertEssaySubmission,
        getEssayRecordForStudent,
        ensureEssayRecordsForStudents,
        countEssayByStatus,
        essayResubmitCount,
        essayResubmitCountForClass,
        daysUntilISO,
        getEssayRowsFromSyllabus,
        pickDefaultEssaySyllabusRow,
        getLessonRowsFromSyllabus,
        getSyllabusRowKey,
        pickDefaultSyllabusRow,
        normalizePointEntry,
        listPointsForClass,
        sumPointsForStudent,
        appendPointEntry,
        appendPointEntries,
        normalizeStudentTest,
        findStudentTest,
        upsertStudentTest,
        getTestRecordForStudent,
        listTestsForClass,
        studentTestKey,
        migrateClassroomData,
        newId
    };

    global.CCPClassroomDomain = api;
})(typeof window !== 'undefined' ? window : globalThis);
