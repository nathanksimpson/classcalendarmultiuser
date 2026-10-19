/**
 * Browser port of shared/calendar-mutations.cjs — keep logic in sync.
 */
(function (global) {
    const SCHEDULE_ENTITIES = new Set([
        'classes',
        'events',
        'timetableTimeSlots',
        'periodSlotMap',
        'customClassTypes',
        'customSyllabusTemplates'
    ]);

    const CLASSROOM_ENTITIES = new Set([
        'cohorts',
        'attendanceSessions',
        'homeworkCompletions',
        'essaySubmissions',
        'essayGroups',
        'studentPoints',
        'studentTests',
        'debateTeamSessions',
        'debateScores',
        'debateCustomFormats',
        'speakingTestRecords',
        'debateBookDistributions',
        'pendingDebateBookChecks',
        'tmsRosterLinks',
        'tmsEssayLinks',
        'essayGraderSettings'
    ]);

    const DAYNOTES_ENTITIES = new Set(['dayNotes']);

    const SESSION_RECORD_ENTITIES = new Set([
        'attendanceSessions',
        'homeworkCompletions',
        'essaySubmissions'
    ]);

    const CLASSROOM_ENTITY_PAYLOAD_KEY = {
        cohorts: 'cohort',
        attendanceSessions: 'session',
        homeworkCompletions: 'completion',
        essaySubmissions: 'submission',
        essayGroups: 'group',
        studentPoints: 'entry',
        studentTests: 'test',
        debateTeamSessions: 'session',
        debateScores: 'score',
        debateCustomFormats: 'format',
        speakingTestRecords: 'record',
        debateBookDistributions: 'distribution',
        pendingDebateBookChecks: 'check'
    };

    const CLASSROOM_ENTITY_ID_KEY = {
        cohorts: 'cohortId',
        attendanceSessions: 'sessionId',
        homeworkCompletions: 'completionId',
        essaySubmissions: 'submissionId',
        essayGroups: 'groupId',
        studentPoints: 'entryId',
        studentTests: 'testId',
        debateTeamSessions: 'sessionId',
        debateScores: 'scoreId',
        debateCustomFormats: 'formatId',
        speakingTestRecords: 'recordId',
        debateBookDistributions: 'distributionId',
        pendingDebateBookChecks: 'checkId'
    };

    function deepClone(data) {
        return JSON.parse(JSON.stringify(data || {}));
    }

    function upsertById(arr, item, idKey) {
        const list = Array.isArray(arr) ? arr.slice() : [];
        const key = idKey || 'id';
        const id = item && item[key];
        if (id == null) {
            return list;
        }
        const idx = list.findIndex((row) => row && String(row[key]) === String(id));
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], item);
        } else {
            list.push(Object.assign({}, item));
        }
        return list;
    }

    function removeById(arr, id, idKey) {
        const key = idKey || 'id';
        if (id == null) {
            return Array.isArray(arr) ? arr.slice() : [];
        }
        return (Array.isArray(arr) ? arr : []).filter((row) => !row || String(row[key]) !== String(id));
    }

    function mergeSessionRecords(localRecords, serverRecords, studentIdKey, touchedStudentIds) {
        const key = studentIdKey || 'studentId';
        const map = new Map();
        (serverRecords || []).forEach((row) => {
            if (row && row[key] != null) {
                map.set(String(row[key]), Object.assign({}, row));
            }
        });
        const touched =
            Array.isArray(touchedStudentIds) && touchedStudentIds.length
                ? new Set(touchedStudentIds.map((id) => String(id)))
                : null;
        (localRecords || []).forEach((row) => {
            if (!row || row[key] == null) {
                return;
            }
            const id = String(row[key]);
            if (touched && !touched.has(id)) {
                return;
            }
            const existing = map.get(id);
            map.set(id, existing ? Object.assign({}, existing, row) : Object.assign({}, row));
        });
        return Array.from(map.values());
    }

    function studentRecordsOverlap(localRecords, serverRecords, studentIdKey) {
        const key = studentIdKey || 'studentId';
        const serverMap = new Map();
        (serverRecords || []).forEach((row) => {
            if (row && row[key] != null) {
                serverMap.set(String(row[key]), row);
            }
        });
        for (const row of localRecords || []) {
            if (!row || row[key] == null) {
                continue;
            }
            const serverRow = serverMap.get(String(row[key]));
            if (serverRow && JSON.stringify(serverRow) !== JSON.stringify(row)) {
                return true;
            }
        }
        return false;
    }

    function mergeSessionLikeItem(existing, incoming) {
        if (!existing) {
            return Object.assign({}, incoming);
        }
        if (!incoming) {
            return Object.assign({}, existing);
        }
        const touched = Array.isArray(incoming.touchedStudentIds)
            ? incoming.touchedStudentIds
            : null;
        const merged = Object.assign({}, existing, incoming);
        delete merged.touchedStudentIds;
        if (Array.isArray(incoming.records) || Array.isArray(existing.records)) {
            merged.records = mergeSessionRecords(
                incoming.records,
                existing.records,
                'studentId',
                touched
            );
        }
        return merged;
    }

    function upsertSessionLike(arr, item) {
        const list = Array.isArray(arr) ? arr.slice() : [];
        if (!item || item.id == null) {
            return list;
        }
        const idx = list.findIndex((row) => row && String(row.id) === String(item.id));
        if (idx >= 0) {
            list[idx] = mergeSessionLikeItem(list[idx], item);
        } else {
            const copy = Object.assign({}, item);
            delete copy.touchedStudentIds;
            list.push(copy);
        }
        return list;
    }

    function applyDayNoteMutation(dayNotes, payload) {
        const list = Array.isArray(dayNotes) ? dayNotes.slice() : [];
        const op = payload && payload.op;
        if (op === 'remove') {
            const noteId = payload.noteId || (payload.note && payload.note.id);
            if (!noteId) {
                return list;
            }
            return list.filter((n) => !n || String(n.id) !== String(noteId));
        }
        if (op === 'upsert' && payload.note && payload.note.id) {
            return upsertById(list, payload.note, 'id');
        }
        return list;
    }

    function extractClassroomItem(entity, payload) {
        const body = payload || {};
        const key = CLASSROOM_ENTITY_PAYLOAD_KEY[entity];
        if (key && body[key] && typeof body[key] === 'object') {
            return body[key];
        }
        if (body.id != null) {
            return body;
        }
        return null;
    }

    function extractClassroomRemoveId(entity, payload) {
        const body = payload || {};
        const idKey = CLASSROOM_ENTITY_ID_KEY[entity];
        if (idKey && body[idKey] != null) {
            return body[idKey];
        }
        return body.id != null ? body.id : null;
    }

    function applyClassroomMutation(next, m) {
        const entity = m.entity;
        const action = m.action;
        const payload = m.payload || {};
        if (entity === 'tmsRosterLinks' || entity === 'tmsEssayLinks') {
            if (action === 'upsert' || action === 'replace') {
                const value = payload[entity] != null ? payload[entity] : payload.value;
                if (value && typeof value === 'object') {
                    next[entity] = Object.assign({}, next[entity] || {}, value);
                }
            }
            return;
        }
        if (entity === 'essayGraderSettings') {
            if (action === 'upsert' || action === 'replace') {
                const value =
                    payload.essayGraderSettings != null ? payload.essayGraderSettings : payload.value;
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    next.essayGraderSettings = value;
                }
            }
            return;
        }
        if (action === 'remove') {
            const id = extractClassroomRemoveId(entity, payload);
            next[entity] = removeById(next[entity], id, 'id');
            return;
        }
        if (action !== 'upsert') {
            return;
        }
        const item = extractClassroomItem(entity, payload);
        if (!item || item.id == null) {
            return;
        }
        if (SESSION_RECORD_ENTITIES.has(entity)) {
            next[entity] = upsertSessionLike(next[entity], item);
        } else {
            next[entity] = upsertById(next[entity], item, 'id');
        }
    }

    const LESSON_CLASS_FIELDS = [
        'startDate', 'endDate', 'meetingDays', 'schedulePattern', 'scheduleModel',
        'daysOfWeek', 'period', 'timeSlotId', 'classTime', 'durationMin',
        'termStart', 'termEnd', 'firstClassDate', 'compressionMode', 'compressionMerges',
        'skippedLessons', 'customSchedule'
    ];
    const SYLLABUS_CLASS_FIELDS = [
        'syllabusRows', 'syllabusNotes', 'syllabusGeneralNotes', 'syllabusUnits',
        'bookId', 'curriculumId', 'curriculumTemplateId', 'customSyllabusTemplateId',
        'syllabusTemplateId'
    ];

    function ensureSourceVersions(data) {
        if (!data.meta || typeof data.meta !== 'object') {
            data.meta = {};
        }
        if (!data.meta.versions || typeof data.meta.versions !== 'object') {
            data.meta.versions = { lessons: 0, syllabus: 0, roster: 0 };
        }
        ['lessons', 'syllabus', 'roster'].forEach((key) => {
            const n = Number(data.meta.versions[key]);
            data.meta.versions[key] = Number.isFinite(n) && n >= 0 ? n : 0;
        });
        return data.meta.versions;
    }

    function meaningfulSourceValue(value) {
        if (value == null) {
            return false;
        }
        if (Array.isArray(value) && value.length === 0) {
            return false;
        }
        if (typeof value === 'string' && !String(value).trim()) {
            return false;
        }
        if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
            return false;
        }
        return true;
    }

    function sourceFieldChanged(prev, nextObj, keys) {
        return keys.some((key) => {
            const a = prev ? prev[key] : undefined;
            const b = nextObj ? nextObj[key] : undefined;
            if (!meaningfulSourceValue(a) && !meaningfulSourceValue(b)) {
                return false;
            }
            return JSON.stringify(a == null ? null : a) !== JSON.stringify(b == null ? null : b);
        });
    }

    function cohortRosterSignature(cohort) {
        if (!cohort) {
            return '';
        }
        const students = Array.isArray(cohort.students) ? cohort.students : [];
        const people = students
            .map((student) =>
                [student && student.id, student && student.name, student && student.nameEn].join('\u001f')
            )
            .sort()
            .join('\u001e');
        return [cohort.id, cohort.name, people].join('\u001d');
    }

    function noteSourceVersionBump(doc, bumpSet, mutation) {
        if (!mutation || !mutation.entity) {
            return;
        }
        const entity = mutation.entity;
        const action = mutation.action;
        const payload = mutation.payload || {};
        if (entity === 'events' || entity === 'timetableTimeSlots' || entity === 'periodSlotMap') {
            bumpSet.add('lessons');
            return;
        }
        if (entity === 'customSyllabusTemplates') {
            bumpSet.add('syllabus');
            return;
        }
        if (entity === 'cohorts') {
            const cohortObj = payload.cohort || payload;
            if (action === 'remove') {
                bumpSet.add('roster');
                return;
            }
            const prev = (doc.cohorts || []).find(
                (row) => row && cohortObj && String(row.id) === String(cohortObj.id)
            );
            if (cohortRosterSignature(prev) !== cohortRosterSignature(cohortObj)) {
                bumpSet.add('roster');
            }
            return;
        }
        if (entity === 'classes' && action === 'remove') {
            bumpSet.add('lessons');
            return;
        }
        if (entity === 'classes' && action === 'upsert') {
            const classObj = payload.class || payload;
            if (!classObj || !classObj.id) {
                return;
            }
            const prev = (doc.classes || []).find((c) => c && String(c.id) === String(classObj.id));
            if (sourceFieldChanged(prev, classObj, LESSON_CLASS_FIELDS)) {
                bumpSet.add('lessons');
            }
            if (sourceFieldChanged(prev, classObj, SYLLABUS_CLASS_FIELDS)) {
                bumpSet.add('syllabus');
            }
        }
    }

    function applyCalendarMutations(data, mutations) {
        const next = deepClone(data);
        const list = Array.isArray(mutations) ? mutations : [];
        const sourceBumpSet = new Set();
        for (const m of list) {
            if (!m || !m.entity || !m.action) {
                continue;
            }
            noteSourceVersionBump(next, sourceBumpSet, m);
            const key = `${m.entity}/${m.action}`;
            const payload = m.payload || {};
            switch (key) {
                case 'classes/upsert': {
                    const classObj = payload.class || payload;
                    if (classObj && classObj.id) {
                        next.classes = upsertById(next.classes, classObj, 'id');
                    }
                    break;
                }
                case 'classes/remove': {
                    const classId = payload.classId || payload.id;
                    next.classes = removeById(next.classes, classId, 'id');
                    break;
                }
                case 'events/upsert': {
                    const eventObj = payload.event || payload;
                    if (eventObj && eventObj.id) {
                        next.events = upsertById(next.events, eventObj, 'id');
                    }
                    break;
                }
                case 'events/remove': {
                    const eventId = payload.eventId || payload.id;
                    next.events = removeById(next.events, eventId, 'id');
                    break;
                }
                case 'dayNotes/mutate': {
                    next.dayNotes = applyDayNoteMutation(next.dayNotes, payload);
                    break;
                }
                case 'timetableTimeSlots/upsert': {
                    const slot = payload.slot || payload;
                    if (slot && slot.id) {
                        next.timetableTimeSlots = upsertById(next.timetableTimeSlots, slot, 'id');
                    }
                    break;
                }
                case 'timetableTimeSlots/remove': {
                    next.timetableTimeSlots = removeById(
                        next.timetableTimeSlots,
                        payload.slotId || payload.id,
                        'id'
                    );
                    break;
                }
                case 'periodSlotMap/upsert': {
                    next.periodSlotMap = Object.assign(
                        {},
                        next.periodSlotMap || {},
                        payload.periodSlotMap || payload.map || payload
                    );
                    break;
                }
            default:
                if (CLASSROOM_ENTITIES.has(m.entity)) {
                    applyClassroomMutation(next, m);
                }
                break;
        }
    }
    if (sourceBumpSet.size) {
        const versions = ensureSourceVersions(next);
        sourceBumpSet.forEach((key) => {
            versions[key] = (Number(versions[key]) || 0) + 1;
        });
        try {
            global.dispatchEvent(new CustomEvent('ccp:source-versions'));
        } catch (_) {
            /* ignore */
        }
    }
    return next;
    }

    function validateMutations(mutations) {
        if (!Array.isArray(mutations)) {
            return { ok: false, error: 'mutations must be an array' };
        }
        if (mutations.length === 0) {
            return { ok: false, error: 'mutations must not be empty' };
        }
        for (const m of mutations) {
            if (!m || typeof m !== 'object' || !m.entity || !m.action) {
                return { ok: false, error: 'each mutation requires entity and action' };
            }
        }
        return { ok: true };
    }

    function classifyMutations(mutations) {
        const result = {
            schedule: false,
            classroom: false,
            dayNotes: false,
            entities: []
        };
        const seen = new Set();
        for (const m of mutations || []) {
            if (!m || !m.entity) {
                continue;
            }
            const entity = String(m.entity);
            if (!seen.has(entity)) {
                seen.add(entity);
                result.entities.push(entity);
            }
            if (SCHEDULE_ENTITIES.has(entity)) {
                result.schedule = true;
            } else if (DAYNOTES_ENTITIES.has(entity)) {
                result.dayNotes = true;
            } else if (CLASSROOM_ENTITIES.has(entity)) {
                result.classroom = true;
            } else {
                result.schedule = true;
            }
        }
        return result;
    }

    function classroomFieldsToMutations(fields) {
        const body = fields || {};
        const mutations = [];
        const ts = Date.now();
        Object.keys(CLASSROOM_ENTITY_PAYLOAD_KEY).forEach((entity) => {
            if (!Object.prototype.hasOwnProperty.call(body, entity)) {
                return;
            }
            const arr = body[entity];
            if (!Array.isArray(arr)) {
                return;
            }
            const payloadKey = CLASSROOM_ENTITY_PAYLOAD_KEY[entity];
            arr.forEach((item) => {
                if (!item || item.id == null) {
                    return;
                }
                const payload = {};
                payload[payloadKey] = item;
                mutations.push({
                    entity,
                    action: 'upsert',
                    payload,
                    timestamp: ts
                });
            });
        });
        if (Object.prototype.hasOwnProperty.call(body, 'tmsRosterLinks')) {
            mutations.push({
                entity: 'tmsRosterLinks',
                action: 'upsert',
                payload: { tmsRosterLinks: body.tmsRosterLinks || {} },
                timestamp: ts
            });
        }
        if (Object.prototype.hasOwnProperty.call(body, 'tmsEssayLinks')) {
            mutations.push({
                entity: 'tmsEssayLinks',
                action: 'upsert',
                payload: { tmsEssayLinks: body.tmsEssayLinks || {} },
                timestamp: ts
            });
        }
        if (Object.prototype.hasOwnProperty.call(body, 'essayGraderSettings')) {
            const settings =
                body.essayGraderSettings && typeof body.essayGraderSettings === 'object'
                    ? body.essayGraderSettings
                    : {};
            mutations.push({
                entity: 'essayGraderSettings',
                action: 'replace',
                payload: { essayGraderSettings: settings },
                timestamp: ts
            });
        }
        return mutations;
    }

    function classroomMutationsToPayload(mutations, baseData) {
        const base = baseData || {};
        const applied = applyCalendarMutations(base, mutations);
        const payload = {};
        const classif = classifyMutations(mutations);
        classif.entities.forEach((entity) => {
            if (!CLASSROOM_ENTITIES.has(entity)) {
                return;
            }
            if (Object.prototype.hasOwnProperty.call(applied, entity)) {
                payload[entity] = applied[entity];
            }
        });
        return payload;
    }

    global.CCPCalendarMutations = {
        SCHEDULE_ENTITIES,
        CLASSROOM_ENTITIES,
        DAYNOTES_ENTITIES,
        SESSION_RECORD_ENTITIES,
        applyCalendarMutations,
        ensureSourceVersions,
        validateMutations,
        classifyMutations,
        classroomFieldsToMutations,
        classroomMutationsToPayload,
        applyDayNoteMutation,
        upsertById,
        removeById,
        mergeSessionRecords,
        studentRecordsOverlap,
        mergeSessionLikeItem
    };
})(typeof window !== 'undefined' ? window : globalThis);
