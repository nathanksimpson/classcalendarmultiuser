const Auth = require('./auth-permissions.cjs');

function normalizeStr(v) {
    return String(v == null ? '' : v).trim();
}

function isUserAssignedToClassInData(classData, userId) {
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

function userCanBypassDayNoteClassCheck(user) {
    return Auth.hasPermission(user, Auth.PERMS.MANAGE_CALENDAR_ACCESS);
}

function userCanBypass(user) {
    return userCanBypassDayNoteClassCheck(user);
}

function isHomeroomForCohort(user, cohort) {
    if (!user || !cohort) {
        return false;
    }
    const uid = String(user.id);
    return normalizeStr(cohort.homeroomTeacherUserId) === uid;
}

function userCanEditCohortRoster(user, cohort) {
    if (!cohort) {
        return false;
    }
    if (userCanBypass(user)) {
        return true;
    }
    return isHomeroomForCohort(user, cohort);
}

function classesForUser(calendarData, user) {
    const classes = (calendarData && calendarData.classes) || [];
    if (userCanBypass(user)) {
        return classes;
    }
    return classes.filter((cls) => isUserAssignedToClassInData(cls, user.id));
}

function assertCanEditClass(user, calendarData, classId) {
    if (userCanBypass(user)) {
        return null;
    }
    const cls = ((calendarData && calendarData.classes) || []).find((c) => c && c.id === classId);
    if (!cls || !isUserAssignedToClassInData(cls, user.id)) {
        return 'You can only edit classroom data for classes you teach';
    }
    return null;
}

function validateCohortsChange(user, prevCohorts, nextCohorts) {
    const prev = Array.isArray(prevCohorts) ? prevCohorts : [];
    const next = Array.isArray(nextCohorts) ? nextCohorts : [];
    if (userCanBypass(user)) {
        return null;
    }
    const prevById = new Map(prev.filter(Boolean).map((c) => [c.id, c]));
    const nextById = new Map(next.filter(Boolean).map((c) => [c.id, c]));

    for (const [id, was] of prevById) {
        const now = nextById.get(id);
        if (!now) {
            if (!userCanEditCohortRoster(user, was)) {
                return 'You can only edit rosters for cohorts where you are homeroom teacher';
            }
            continue;
        }
        const wasStudents = JSON.stringify(was.students || []);
        const nowStudents = JSON.stringify(now.students || []);
        if (wasStudents !== nowStudents && !userCanEditCohortRoster(user, was)) {
            return 'You can only edit rosters for cohorts where you are homeroom teacher';
        }
    }

    for (const [id, now] of nextById) {
        if (prevById.has(id)) {
            continue;
        }
        if (!userCanEditCohortRoster(user, now)) {
            return 'You can only edit rosters for cohorts where you are homeroom teacher';
        }
    }

    return null;
}

function collectClassIdsFromSessions(sessions) {
    const ids = new Set();
    (sessions || []).forEach((s) => {
        if (s && s.classId) {
            ids.add(normalizeStr(s.classId));
        }
    });
    return ids;
}

function validateSessionsChange(user, calendarData, prevSessions, nextSessions) {
    const prev = Array.isArray(prevSessions) ? prevSessions : [];
    const next = Array.isArray(nextSessions) ? nextSessions : [];
    const prevByKey = new Map(prev.filter(Boolean).map((s) => [`${s.classId}|${s.date}`, s]));
    const nextByKey = new Map(next.filter(Boolean).map((s) => [`${s.classId}|${s.date}`, s]));

    const touchedClassIds = new Set();
    for (const key of new Set([...prevByKey.keys(), ...nextByKey.keys()])) {
        const was = prevByKey.get(key);
        const now = nextByKey.get(key);
        if (JSON.stringify(was) !== JSON.stringify(now)) {
            const classId = (now && now.classId) || (was && was.classId);
            if (classId) {
                touchedClassIds.add(classId);
            }
        }
    }

    for (const classId of touchedClassIds) {
        const err = assertCanEditClass(user, calendarData, classId);
        if (err) {
            return err;
        }
    }
    return null;
}

function validateHomeworkChange(user, calendarData, prevList, nextList) {
    const prev = Array.isArray(prevList) ? prevList : [];
    const next = Array.isArray(nextList) ? nextList : [];
    const prevByKey = new Map(prev.filter(Boolean).map((h) => [`${h.classId}|${h.syllabusRowId}`, h]));
    const nextByKey = new Map(next.filter(Boolean).map((h) => [`${h.classId}|${h.syllabusRowId}`, h]));

    const touchedClassIds = new Set();
    for (const key of new Set([...prevByKey.keys(), ...nextByKey.keys()])) {
        const was = prevByKey.get(key);
        const now = nextByKey.get(key);
        if (JSON.stringify(was) !== JSON.stringify(now)) {
            const classId = (now && now.classId) || (was && was.classId);
            if (classId) {
                touchedClassIds.add(classId);
            }
        }
    }

    for (const classId of touchedClassIds) {
        const err = assertCanEditClass(user, calendarData, classId);
        if (err) {
            return err;
        }
    }
    return null;
}

function validateEssayChange(user, calendarData, prevList, nextList) {
    const prev = Array.isArray(prevList) ? prevList : [];
    const next = Array.isArray(nextList) ? nextList : [];
    const prevByKey = new Map(prev.filter(Boolean).map((e) => [`${e.classId}|${e.syllabusRowId}`, e]));
    const nextByKey = new Map(next.filter(Boolean).map((e) => [`${e.classId}|${e.syllabusRowId}`, e]));

    const touchedClassIds = new Set();
    for (const key of new Set([...prevByKey.keys(), ...nextByKey.keys()])) {
        const was = prevByKey.get(key);
        const now = nextByKey.get(key);
        if (JSON.stringify(was) !== JSON.stringify(now)) {
            const classId = (now && now.classId) || (was && was.classId);
            if (classId) {
                touchedClassIds.add(classId);
            }
        }
    }

    for (const classId of touchedClassIds) {
        const err = assertCanEditClass(user, calendarData, classId);
        if (err) {
            return err;
        }
    }
    return null;
}

function stampSessions(sessions, userId) {
    const now = new Date().toISOString();
    const uid = String(userId);
    return (Array.isArray(sessions) ? sessions : []).filter(Boolean).map((s) =>
        Object.assign({}, s, {
            authorUserId: normalizeStr(s.authorUserId) || uid,
            updatedAt: now
        })
    );
}

function stampHomework(completions, userId) {
    const now = new Date().toISOString();
    const uid = String(userId);
    return (Array.isArray(completions) ? completions : []).filter(Boolean).map((h) =>
        Object.assign({}, h, {
            authorUserId: normalizeStr(h.authorUserId) || uid,
            updatedAt: now
        })
    );
}

function stampEssay(submissions, userId) {
    return stampHomework(submissions, userId);
}

function validatePointsChange(user, calendarData, prevList, nextList) {
    const prev = Array.isArray(prevList) ? prevList : [];
    const next = Array.isArray(nextList) ? nextList : [];
    const prevById = new Map(prev.filter(Boolean).map((p) => [p.id, p]));
    const nextById = new Map(next.filter(Boolean).map((p) => [p.id, p]));
    const touchedClassIds = new Set();
    for (const id of new Set([...prevById.keys(), ...nextById.keys()])) {
        if (JSON.stringify(prevById.get(id)) !== JSON.stringify(nextById.get(id))) {
            const classId =
                (nextById.get(id) && nextById.get(id).classId) ||
                (prevById.get(id) && prevById.get(id).classId);
            if (classId) {
                touchedClassIds.add(classId);
            }
        }
    }
    for (const classId of touchedClassIds) {
        const err = assertCanEditClass(user, calendarData, classId);
        if (err) {
            return err;
        }
    }
    return null;
}

function validateTestsChange(user, calendarData, prevList, nextList) {
    const prev = Array.isArray(prevList) ? prevList : [];
    const next = Array.isArray(nextList) ? nextList : [];
    const testKey = (t) =>
        t ? `${normalizeStr(t.classId)}|${normalizeStr(t.testName)}|${normalizeStr(t.testDate)}` : '';
    const prevByKey = new Map(prev.filter(Boolean).map((t) => [testKey(t), t]));
    const nextByKey = new Map(next.filter(Boolean).map((t) => [testKey(t), t]));
    const touchedClassIds = new Set();
    for (const key of new Set([...prevByKey.keys(), ...nextByKey.keys()])) {
        if (!key) {
            continue;
        }
        if (JSON.stringify(prevByKey.get(key)) !== JSON.stringify(nextByKey.get(key))) {
            const classId =
                (nextByKey.get(key) && nextByKey.get(key).classId) ||
                (prevByKey.get(key) && prevByKey.get(key).classId);
            if (classId) {
                touchedClassIds.add(classId);
            }
        }
    }
    for (const classId of touchedClassIds) {
        const err = assertCanEditClass(user, calendarData, classId);
        if (err) {
            return err;
        }
    }
    return null;
}

function stampPoints(points, userId) {
    const now = new Date().toISOString();
    const uid = String(userId);
    return (Array.isArray(points) ? points : []).filter(Boolean).map((p) =>
        Object.assign({}, p, {
            authorUserId: normalizeStr(p.authorUserId) || uid,
            updatedAt: now
        })
    );
}

function stampTests(tests, userId) {
    return stampHomework(tests, userId);
}

function prepareClassroomForSave(user, calendarData, payload) {
    const data = calendarData || {};
    const body = payload || {};
    const merged = {};
    const hasCohorts = Object.prototype.hasOwnProperty.call(body, 'cohorts');
    const hasAttendance = Object.prototype.hasOwnProperty.call(body, 'attendanceSessions');
    const hasHomework = Object.prototype.hasOwnProperty.call(body, 'homeworkCompletions');
    const hasEssays = Object.prototype.hasOwnProperty.call(body, 'essaySubmissions');
    const hasPoints = Object.prototype.hasOwnProperty.call(body, 'studentPoints');
    const hasTests = Object.prototype.hasOwnProperty.call(body, 'studentTests');

    if (!hasCohorts && !hasAttendance && !hasHomework && !hasEssays && !hasPoints && !hasTests) {
        return { error: 'No classroom fields to save', merged: {} };
    }

    if (hasCohorts) {
        const err = validateCohortsChange(user, data.cohorts, body.cohorts);
        if (err) {
            return { error: err, merged: {} };
        }
        merged.cohorts = Array.isArray(body.cohorts) ? body.cohorts : [];
    }

    if (hasAttendance) {
        const nextSessions = stampSessions(body.attendanceSessions, user.id);
        const err = validateSessionsChange(user, data, data.attendanceSessions, nextSessions);
        if (err) {
            return { error: err, merged: {} };
        }
        merged.attendanceSessions = nextSessions;
    }

    if (hasHomework) {
        const nextHw = stampHomework(body.homeworkCompletions, user.id);
        const err = validateHomeworkChange(user, data, data.homeworkCompletions, nextHw);
        if (err) {
            return { error: err, merged: {} };
        }
        merged.homeworkCompletions = nextHw;
    }

    if (hasEssays) {
        const nextEssays = stampEssay(body.essaySubmissions, user.id);
        const err = validateEssayChange(user, data, data.essaySubmissions, nextEssays);
        if (err) {
            return { error: err, merged: {} };
        }
        merged.essaySubmissions = nextEssays;
    }

    if (hasPoints) {
        const nextPoints = stampPoints(body.studentPoints, user.id);
        const err = validatePointsChange(user, data, data.studentPoints, nextPoints);
        if (err) {
            return { error: err, merged: {} };
        }
        merged.studentPoints = nextPoints;
    }

    if (hasTests) {
        const nextTests = stampTests(body.studentTests, user.id);
        const err = validateTestsChange(user, data, data.studentTests, nextTests);
        if (err) {
            return { error: err, merged: {} };
        }
        merged.studentTests = nextTests;
    }

    return { error: null, merged };
}

module.exports = {
    prepareClassroomForSave,
    userCanBypass,
    userCanEditCohortRoster,
    isHomeroomForCohort,
    isUserAssignedToClassInData,
    classesForUser,
    assertCanEditClass,
    collectClassIdsFromSessions
};
