/**
 * Conflict merge assistant — summarize differences between local and server calendar JSON.
 */
(function (global) {
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
        studentPoints: 'entry',
        studentTests: 'test',
        debateTeamSessions: 'session',
        debateScores: 'score',
        debateCustomFormats: 'format',
        speakingTestRecords: 'record'
    };

    function countById(arr) {
        const set = new Set();
        (arr || []).forEach((item) => {
            if (item && item.id != null) {
                set.add(String(item.id));
            }
        });
        return set;
    }

    function diffIdSets(localArr, serverArr) {
        const localIds = countById(localArr);
        const serverIds = countById(serverArr);
        let addedLocal = 0;
        let addedServer = 0;
        localIds.forEach((id) => {
            if (!serverIds.has(id)) {
                addedLocal += 1;
            }
        });
        serverIds.forEach((id) => {
            if (!localIds.has(id)) {
                addedServer += 1;
            }
        });
        let changed = 0;
        localIds.forEach((id) => {
            if (!serverIds.has(id)) {
                return;
            }
            const localItem = (localArr || []).find((x) => x && String(x.id) === id);
            const serverItem = (serverArr || []).find((x) => x && String(x.id) === id);
            if (JSON.stringify(localItem) !== JSON.stringify(serverItem)) {
                changed += 1;
            }
        });
        return { addedLocal, addedServer, changed };
    }

    function studentRecordsOverlap(localRecords, serverRecords, studentIdKey) {
        if (
            typeof global.CCPCalendarMutations !== 'undefined' &&
            global.CCPCalendarMutations.studentRecordsOverlap
        ) {
            return global.CCPCalendarMutations.studentRecordsOverlap(
                localRecords,
                serverRecords,
                studentIdKey
            );
        }
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

    function summarizeConflict(localData, serverData) {
        const local = localData || {};
        const server = serverData || {};
        const sections = [
            { key: 'classes', labelKey: 'syncConflictClasses' },
            { key: 'events', labelKey: 'syncConflictEvents' },
            { key: 'dayNotes', labelKey: 'syncConflictDayNotes' },
            { key: 'cohorts', labelKey: 'syncConflictCohorts' },
            { key: 'attendanceSessions', labelKey: 'syncConflictAttendance' },
            { key: 'homeworkCompletions', labelKey: 'syncConflictHomework' },
            { key: 'essaySubmissions', labelKey: 'syncConflictEssays' },
            { key: 'studentPoints', labelKey: 'syncConflictPoints' },
            { key: 'studentTests', labelKey: 'syncConflictTests' },
            { key: 'debateTeamSessions', labelKey: 'syncConflictDebateSessions' },
            { key: 'debateScores', labelKey: 'syncConflictDebateScores' },
            { key: 'speakingTestRecords', labelKey: 'syncConflictSpeakingTests' }
        ];
        const lines = [];
        sections.forEach((section) => {
            const diff = diffIdSets(local[section.key], server[section.key]);
            if (diff.addedLocal || diff.addedServer || diff.changed) {
                lines.push({
                    labelKey: section.labelKey,
                    addedLocal: diff.addedLocal,
                    addedServer: diff.addedServer,
                    changed: diff.changed
                });
            }
        });
        if (local.calendarName !== server.calendarName) {
            lines.push({ labelKey: 'syncConflictCalendarName', calendarName: true });
        }
        return lines;
    }

    function extractUpsertItem(entity, payload) {
        const body = payload || {};
        if (entity === 'classes') {
            return body.class || body;
        }
        if (entity === 'events') {
            return body.event || body;
        }
        if (entity === 'timetableTimeSlots') {
            return body.slot || body;
        }
        const key = CLASSROOM_ENTITY_PAYLOAD_KEY[entity];
        if (key && body[key]) {
            return body[key];
        }
        return body.id != null ? body : null;
    }

    function extractRemoveId(entity, payload) {
        const body = payload || {};
        if (entity === 'classes') {
            return body.classId || body.id;
        }
        if (entity === 'events') {
            return body.eventId || body.id;
        }
        if (entity === 'timetableTimeSlots') {
            return body.slotId || body.id;
        }
        const idKeys = {
            cohorts: 'cohortId',
            attendanceSessions: 'sessionId',
            homeworkCompletions: 'completionId',
            essaySubmissions: 'submissionId',
            studentPoints: 'entryId',
            studentTests: 'testId',
            debateTeamSessions: 'sessionId',
            debateScores: 'scoreId',
            debateCustomFormats: 'formatId',
            speakingTestRecords: 'recordId'
        };
        const key = idKeys[entity];
        if (key && body[key] != null) {
            return body[key];
        }
        return body.id;
    }

    function entityArray(server, entity) {
        return Array.isArray(server[entity]) ? server[entity] : [];
    }

    function mutationsOverlap(mutations, serverData) {
        const server = serverData || {};
        for (const m of mutations || []) {
            if (!m || !m.entity) {
                continue;
            }
            const entity = m.entity;
            const action = m.action;

            if (entity === 'dayNotes' && action === 'mutate') {
                const payload = m.payload || {};
                if (payload.op === 'upsert' && payload.note && payload.note.id) {
                    const id = payload.note.id;
                    const serverItem = (server.dayNotes || []).find(
                        (n) => n && String(n.id) === String(id)
                    );
                    if (serverItem && JSON.stringify(serverItem) !== JSON.stringify(payload.note)) {
                        return true;
                    }
                }
                if (payload.op === 'remove') {
                    const id = payload.noteId || (payload.note && payload.note.id);
                    const serverItem = (server.dayNotes || []).find(
                        (n) => n && String(n.id) === String(id)
                    );
                    if (serverItem) {
                        return true;
                    }
                }
                continue;
            }

            if (entity === 'tmsRosterLinks' || entity === 'tmsEssayLinks') {
                continue;
            }

            if (action === 'remove') {
                const id = extractRemoveId(entity, m.payload);
                const serverItem = entityArray(server, entity).find(
                    (row) => row && String(row.id) === String(id)
                );
                if (serverItem) {
                    return true;
                }
                continue;
            }

            if (action !== 'upsert') {
                continue;
            }

            const localItem = extractUpsertItem(entity, m.payload);
            if (!localItem || localItem.id == null) {
                continue;
            }
            const serverItem = entityArray(server, entity).find(
                (row) => row && String(row.id) === String(localItem.id)
            );
            if (!serverItem) {
                continue;
            }
            if (SESSION_RECORD_ENTITIES.has(entity)) {
                const touched = Array.isArray(localItem.touchedStudentIds)
                    ? localItem.touchedStudentIds.map(String)
                    : null;
                if (touched && touched.length) {
                    const localTouched = (localItem.records || []).filter(
                        (r) => r && r.studentId != null && touched.includes(String(r.studentId))
                    );
                    const serverTouched = (serverItem.records || []).filter(
                        (r) => r && r.studentId != null && touched.includes(String(r.studentId))
                    );
                    if (studentRecordsOverlap(localTouched, serverTouched)) {
                        return true;
                    }
                    continue;
                }
                if (studentRecordsOverlap(localItem.records, serverItem.records)) {
                    return true;
                }
                continue;
            }
            if (JSON.stringify(serverItem) !== JSON.stringify(localItem)) {
                return true;
            }
        }
        return false;
    }

    function renderSummaryHtml(lines, t, escapeHtml) {
        const esc = escapeHtml || ((s) => String(s || ''));
        const translate = t || ((k) => k);
        if (!lines.length) {
            return `<p class="section-hint">${esc(translate('syncConflictNoDiff'))}</p>`;
        }
        return `<ul class="conflict-merge-summary">${lines
            .map((line) => {
                if (line.calendarName) {
                    return `<li>${esc(translate('syncConflictCalendarName'))}</li>`;
                }
                const parts = [];
                if (line.addedLocal) {
                    parts.push(
                        translate('syncConflictYoursOnly').replace('{n}', String(line.addedLocal))
                    );
                }
                if (line.addedServer) {
                    parts.push(
                        translate('syncConflictTheirsOnly').replace('{n}', String(line.addedServer))
                    );
                }
                if (line.changed) {
                    parts.push(translate('syncConflictChanged').replace('{n}', String(line.changed)));
                }
                return `<li><strong>${esc(translate(line.labelKey))}</strong>: ${esc(parts.join('; '))}</li>`;
            })
            .join('')}</ul>`;
    }

    global.CCPConflictMerge = {
        summarizeConflict,
        renderSummaryHtml,
        diffIdSets,
        mutationsOverlap,
        studentRecordsOverlap
    };
})(typeof window !== 'undefined' ? window : globalThis);
