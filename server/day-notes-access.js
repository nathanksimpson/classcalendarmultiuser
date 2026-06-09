const Auth = require('./auth-permissions');

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

function noteAuthorId(note) {
    if (!note) {
        return '';
    }
    const id = note.authorUserId;
    return id != null && String(id).trim() ? String(id).trim() : '';
}

function noteHomeroomNotifyUserId(note) {
    if (!note) {
        return '';
    }
    const id = note.homeroomNotifyUserId;
    return id != null && String(id).trim() ? String(id).trim() : '';
}

function buildSavedDayNote(now, was, uid, bypass) {
    const authorUserId = was
        ? noteAuthorId(was) || noteAuthorId(now) || uid
        : bypass && noteAuthorId(now)
            ? noteAuthorId(now)
            : uid;
    const saved = Object.assign({}, now, { authorUserId });
    const wasHr = noteHomeroomNotifyUserId(was);
    const nowHr = noteHomeroomNotifyUserId(now);
    if (was) {
        if (!bypass && wasHr !== nowHr) {
            return { error: 'Cannot change homeroom notification', dayNotes: [] };
        }
        if (wasHr) {
            saved.homeroomNotifyUserId = wasHr;
        } else {
            delete saved.homeroomNotifyUserId;
        }
    } else if (nowHr) {
        saved.homeroomNotifyUserId = nowHr;
    }
    return { error: null, note: saved };
}

/**
 * Validates dayNotes PUT payload, stamps author on new notes, preserves owners.
 * @returns {{ error: string|null, dayNotes: object[] }}
 */
function prepareDayNotesForSave(user, calendarData, nextDayNotes) {
    const bypass = userCanBypassDayNoteClassCheck(user);
    const classes = (calendarData && calendarData.classes) || [];
    const prev = calendarData && Array.isArray(calendarData.dayNotes) ? calendarData.dayNotes : [];
    const prevById = new Map(prev.filter(Boolean).map((n) => [n.id, n]));
    const nextList = Array.isArray(nextDayNotes) ? nextDayNotes.filter(Boolean) : [];
    const nextById = new Map(nextList.map((n) => [n.id, n]));
    const uid = String(user.id);
    const out = [];

    for (const noteId of prevById.keys()) {
        if (nextById.has(noteId)) {
            continue;
        }
        const was = prevById.get(noteId);
        if (bypass) {
            continue;
        }
        const classId = was.classId;
        const cls = classes.find((c) => c && c.id === classId);
        if (!cls || !isUserAssignedToClassInData(cls, user.id)) {
            return { error: 'You can only edit notes for classes you teach', dayNotes: [] };
        }
        const author = noteAuthorId(was);
        if (author && author !== uid) {
            return { error: "You cannot edit another teacher's note", dayNotes: [] };
        }
        if (!author) {
            return {
                error: 'This note cannot be deleted (created before author tracking)',
                dayNotes: []
            };
        }
    }

    for (const now of nextList) {
        if (!now || !now.id) {
            continue;
        }
        const was = prevById.get(now.id);
        const classId = now.classId;
        const cls = classes.find((c) => c && c.id === classId);
        if (!bypass) {
            if (!cls || !isUserAssignedToClassInData(cls, user.id)) {
                return { error: 'You can only edit notes for classes you teach', dayNotes: [] };
            }
        }

        if (!was) {
            const clientAuthor = noteAuthorId(now);
            if (clientAuthor && clientAuthor !== uid && !bypass) {
                return { error: 'Cannot set note author', dayNotes: [] };
            }
            const built = buildSavedDayNote(now, null, uid, bypass);
            if (built.error) {
                return { error: built.error, dayNotes: [] };
            }
            out.push(built.note);
            continue;
        }

        if (JSON.stringify(was) === JSON.stringify(now)) {
            out.push(was);
            continue;
        }

        if (!bypass) {
            const wasAuthor = noteAuthorId(was);
            if (wasAuthor && wasAuthor !== uid) {
                return { error: "You cannot edit another teacher's note", dayNotes: [] };
            }
            if (!wasAuthor) {
                return {
                    error: 'This note cannot be edited (created before author tracking)',
                    dayNotes: []
                };
            }
            const nowAuthor = noteAuthorId(now);
            if (nowAuthor && nowAuthor !== wasAuthor) {
                return { error: 'Cannot change note author', dayNotes: [] };
            }
        }

        const built = buildSavedDayNote(now, was, uid, bypass);
        if (built.error) {
            return { error: built.error, dayNotes: [] };
        }
        out.push(built.note);
    }

    return { error: null, dayNotes: out };
}

/** Returns an error message string, or null if the change is allowed. */
function assertDayNotesChangeAllowed(user, calendarData, nextDayNotes) {
    const prepared = prepareDayNotesForSave(user, calendarData, nextDayNotes);
    return prepared.error;
}

module.exports = {
    assertDayNotesChangeAllowed,
    prepareDayNotesForSave,
    isUserAssignedToClassInData,
    userCanBypassDayNoteClassCheck
};
