/**
 * Per-teacher weekly timetable grid (Excel-style).
 * Derives Mon–Fri × time-slot grids from classes, cohorts, and teacher assignments.
 */
(function (global) {
    const WEEKDAY_COLUMNS = [
        { dow: 1, key: 'mon', en: 'Mon', ko: '월' },
        { dow: 2, key: 'tue', en: 'Tue', ko: '화' },
        { dow: 3, key: 'wed', en: 'Wed', ko: '수' },
        { dow: 4, key: 'thu', en: 'Thu', ko: '목' },
        { dow: 5, key: 'fri', en: 'Fri', ko: '금' }
    ];

    const CLASS_TYPE_TO_CATEGORY = {
        'builtin-debate': 'Debate',
        'builtin-wr-sp': 'Wr&Spk',
        'builtin-rc': 'RC',
        'builtin-conversation': 'Conversation'
    };

    const TEACHER_CATEGORY_PRESETS = [
        'Debate',
        'Wr&Spk',
        'Spk&Wr',
        'IPE',
        'Conversation',
        'RC',
        'Grammar',
        'News',
        'Phonics',
        'Reading',
        'Animation',
        'Other'
    ];

    const DEFAULT_TIME_SLOTS = [
        { id: 'ts1', start: '14:30', end: '15:20', durationMin: 45, sortOrder: 1 },
        { id: 'ts2', start: '15:20', end: '16:10', durationMin: 45, sortOrder: 2 },
        { id: 'ts3', start: '16:10', end: '17:00', durationMin: 45, sortOrder: 3 },
        { id: 'ts4', start: '17:00', end: '18:00', durationMin: 55, sortOrder: 4 },
        { id: 'ts5', start: '18:00', end: '19:00', durationMin: 55, sortOrder: 5 },
        { id: 'ts6', start: '19:00', end: '20:00', durationMin: 55, sortOrder: 6 },
        { id: 'ts7', start: '20:00', end: '21:00', durationMin: 55, sortOrder: 7 }
    ];

    const DEFAULT_PERIOD_SLOT_MAP = {
        '1': 'ts1',
        '2': 'ts2',
        '3': 'ts3',
        '4': 'ts4',
        '5': 'ts5',
        '6': 'ts6',
        '7': 'ts7'
    };

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function meetingDaysKey(days) {
        if (!Array.isArray(days) || !days.length) {
            return '';
        }
        return days.slice().sort((a, b) => a - b).join(',');
    }

    function normalizeMeetingDaysArray(days) {
        if (!Array.isArray(days)) {
            return [];
        }
        const out = [];
        days.forEach((d) => {
            const n = parseInt(d, 10);
            if (!Number.isNaN(n) && n >= 0 && n <= 6 && !out.includes(n)) {
                out.push(n);
            }
        });
        return out.sort((a, b) => a - b);
    }

    function getMeetingDaysFromClass(classData) {
        if (!classData) {
            return [];
        }
        if (Array.isArray(classData.meetingDays) && classData.meetingDays.length) {
            return normalizeMeetingDaysArray(classData.meetingDays);
        }
        const d = classData.dayOfWeek;
        if (d !== null && d !== undefined && d !== '' && !Number.isNaN(parseInt(d, 10))) {
            return [parseInt(d, 10)];
        }
        return [];
    }

    function normalizePeriodByWeekday(map) {
        if (!map || typeof map !== 'object') {
            return null;
        }
        const out = {};
        Object.keys(map).forEach((k) => {
            const dow = parseInt(k, 10);
            const p = parseInt(map[k], 10);
            if (!Number.isNaN(dow) && dow >= 0 && dow <= 6 && !Number.isNaN(p) && p >= 1 && p <= 7) {
                out[String(dow)] = p;
            }
        });
        return Object.keys(out).length ? out : null;
    }

    function getClassPeriodNumber(classData, weekday) {
        if (!classData) {
            return null;
        }
        if (weekday !== undefined && weekday !== null) {
            const byWd = normalizePeriodByWeekday(classData.periodByWeekday);
            if (byWd && byWd[String(weekday)] !== undefined) {
                return byWd[String(weekday)];
            }
        }
        const p = parseInt(classData.period, 10);
        return !Number.isNaN(p) && p >= 1 && p <= 7 ? p : null;
    }

    function resolveTimeSlotIdFromPeriod(period, timeSlotIdOverride, appData) {
        if (timeSlotIdOverride) {
            return timeSlotIdOverride;
        }
        if (period == null) {
            return null;
        }
        const map = (appData && appData.periodSlotMap) || DEFAULT_PERIOD_SLOT_MAP;
        return map[String(period)] || null;
    }

    function resolveTimeSlotIdForClass(classData, weekday, appData) {
        if (classData && classData.timeSlotId) {
            return classData.timeSlotId;
        }
        const period = getClassPeriodNumber(classData, weekday);
        return resolveTimeSlotIdFromPeriod(period, '', appData);
    }

    function normalizeTeacherRow(row) {
        const r = row || {};
        const placements = [];
        if (Array.isArray(r.placements)) {
            r.placements.forEach((p) => {
                const dow = parseInt(p.dow, 10);
                const period = parseInt(p.period, 10);
                if (!Number.isNaN(dow) && dow >= 0 && dow <= 6 && !Number.isNaN(period) && period >= 1 && period <= 7) {
                    placements.push({ dow, period });
                }
            });
        }
        return {
            id: normalizeStr(r.id),
            userId: normalizeStr(r.userId),
            name: normalizeStr(r.name),
            category: normalizeStr(r.category),
            curriculumId: normalizeStr(r.curriculumId),
            classTypeId: normalizeStr(r.classTypeId),
            book: normalizeStr(r.book),
            meetingDays: normalizeMeetingDaysArray(r.meetingDays || []),
            period: r.period != null && r.period !== '' ? parseInt(r.period, 10) : null,
            periodByWeekday: normalizePeriodByWeekday(r.periodByWeekday),
            timeSlotId: normalizeStr(r.timeSlotId),
            scheduleBlock: r.scheduleBlock === 'secondary' ? 'secondary' : (r.scheduleBlock === 'primary' ? 'primary' : ''),
            placements
        };
    }

    function getTeacherMeetingDays(classData, teacherRow) {
        const row = normalizeTeacherRow(teacherRow);
        if (row.meetingDays.length) {
            return row.meetingDays;
        }
        return getMeetingDaysFromClass(classData);
    }

    function getTeacherPeriodNumber(teacherRow, classData, weekday) {
        const row = normalizeTeacherRow(teacherRow);
        if (weekday !== undefined && weekday !== null && row.periodByWeekday) {
            const p = row.periodByWeekday[String(weekday)];
            if (p !== undefined) {
                return p;
            }
        }
        if (row.period != null && !Number.isNaN(row.period) && row.period >= 1 && row.period <= 7) {
            return row.period;
        }
        return getClassPeriodNumber(classData, weekday);
    }

    function resolveTimeSlotIdForTeacherRow(classData, teacherRow, weekday, appData) {
        const row = normalizeTeacherRow(teacherRow);
        if (row.timeSlotId) {
            return row.timeSlotId;
        }
        const period = getTeacherPeriodNumber(row, classData, weekday);
        return resolveTimeSlotIdFromPeriod(period, '', appData);
    }

    /**
     * @returns {{ dow: number, period: number, timeSlotId: string }[]}
     */
    function getTeacherTimetablePlacements(classData, teacherRow, appData) {
        const row = normalizeTeacherRow(teacherRow);
        const effectiveDays = getTeacherMeetingDays(classData, row).filter((d) => d >= 1 && d <= 5);
        const out = [];
        const seen = new Set();

        function addPlacement(dow, period) {
            if (dow < 1 || dow > 5 || period == null || period < 1 || period > 7) {
                return;
            }
            if (effectiveDays.length && !effectiveDays.includes(dow)) {
                return;
            }
            const slotId = resolveTimeSlotIdFromPeriod(period, row.timeSlotId, appData)
                || resolveTimeSlotIdForTeacherRow(classData, row, dow, appData);
            if (!slotId) {
                return;
            }
            const key = `${dow}|${slotId}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            out.push({ dow, period, timeSlotId: slotId });
        }

        if (row.placements.length) {
            row.placements.forEach((p) => addPlacement(p.dow, p.period));
            return out;
        }

        if (row.periodByWeekday) {
            const days = effectiveDays.length ? effectiveDays : Object.keys(row.periodByWeekday).map((k) => parseInt(k, 10));
            days.forEach((dow) => {
                const p = row.periodByWeekday[String(dow)];
                if (p !== undefined) {
                    addPlacement(dow, p);
                }
            });
            if (out.length) {
                return out;
            }
        }

        if (row.period != null && !Number.isNaN(row.period)) {
            const days = effectiveDays.length ? effectiveDays : getMeetingDaysFromClass(classData).filter((d) => d >= 1 && d <= 5);
            days.forEach((dow) => addPlacement(dow, row.period));
            if (out.length) {
                return out;
            }
        }

        const classDays = effectiveDays.length ? effectiveDays : getMeetingDaysFromClass(classData).filter((d) => d >= 1 && d <= 5);
        const classByWd = normalizePeriodByWeekday(classData && classData.periodByWeekday);
        classDays.forEach((dow) => {
            let period = null;
            if (classByWd && classByWd[String(dow)] !== undefined) {
                period = classByWd[String(dow)];
            } else {
                period = getClassPeriodNumber(classData, dow);
            }
            addPlacement(dow, period);
        });

        return out;
    }

    function formatTeacherRowScheduleSummary(classData, teacherRow, appData, lang) {
        const placements = getTeacherTimetablePlacements(classData, teacherRow, appData);
        if (!placements.length) {
            return '';
        }
        const useKo = lang === 'ko';
        const periodLabel = useKo ? '교시' : 'P';
        const parts = placements.map((pl) => {
            const col = WEEKDAY_COLUMNS.find((c) => c.dow === pl.dow);
            const day = col ? (useKo ? col.ko : col.en) : String(pl.dow);
            return `${day} ${periodLabel}${pl.period}`;
        });
        return parts.join(', ');
    }

    function findTeacherRowForSelector(classData, selector) {
        return getClassTeachersList(classData).find((row) =>
            teacherMatchesTeacherRef({ userId: row.userId, displayName: row.name }, selector)
        ) || null;
    }

    function classHasTeacherAssignment(classData, selector) {
        return Boolean(findTeacherRowForSelector(classData, selector));
    }

    function ensureClassTeachersArray(classData) {
        if (!classData) {
            return [];
        }
        if (!Array.isArray(classData.classTeachers)) {
            classData.classTeachers = [];
        }
        return classData.classTeachers;
    }

    function buildDefaultTeacherRowForClass(classData, selector, options) {
        options = options || {};
        const userId = normalizeStr(selector && selector.userId);
        const name = normalizeStr(selector && selector.displayName) || userId;
        const level = normalizeStr(classData.levelPreset)
            || normalizeStr(classData.levelCustom)
            || normalizeStr(classData.level);
        let curriculumId = normalizeStr(options.curriculumId) || normalizeStr(classData.curriculumId);
        let classTypeId = normalizeStr(classData.classTypeId);
        let book = normalizeStr(classData.book);
        let category = normalizeStr(options.category) || deriveTeacherCategory(classData);
        if (global.CCPBooksEditor && curriculumId) {
            const presetId = global.CCPBooksEditor.resolvePresetFromLevelAndBook(
                level,
                curriculumId,
                options.appData
            );
            if (presetId) {
                classTypeId = presetId;
            }
            const merged = global.CCPBooksEditor.buildMergedClassDefaults(
                curriculumId,
                classTypeId,
                options.appData,
                level
            );
            if (merged.defaultBook && !book) {
                book = merged.defaultBook;
            }
        }
        return normalizeTeacherRow({
            id: options.rowId || '',
            userId,
            name,
            category,
            curriculumId,
            classTypeId,
            book
        });
    }

    function addTeacherRowToClass(classData, selector, options) {
        if (!classData || !selector) {
            return false;
        }
        if (classHasTeacherAssignment(classData, selector)) {
            return false;
        }
        const rows = ensureClassTeachersArray(classData);
        const row = buildDefaultTeacherRowForClass(classData, selector, options);
        if (!row.id && typeof options.generateId === 'function') {
            row.id = options.generateId();
        } else if (!row.id) {
            row.id = 'tr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        }
        rows.push(row);
        return true;
    }

    function removeTeacherFromClass(classData, selector) {
        if (!classData || !selector || !Array.isArray(classData.classTeachers)) {
            return 0;
        }
        const before = classData.classTeachers.length;
        classData.classTeachers = classData.classTeachers.filter(
            (row) => !teacherMatchesTeacherRef({ userId: row.userId, displayName: row.name }, selector)
        );
        return before - classData.classTeachers.length;
    }

    function cohortHasHomeroom(cohort, selector) {
        if (!cohort || !selector) {
            return false;
        }
        return teacherMatchesTeacherRef(
            {
                userId: cohort.homeroomTeacherUserId,
                displayName: cohort.homeroomTeacherName
            },
            selector
        );
    }

    function setCohortHomeroom(cohort, selector) {
        if (!cohort || !selector) {
            return;
        }
        cohort.homeroomTeacherUserId = normalizeStr(selector.userId);
        cohort.homeroomTeacherName = normalizeStr(selector.displayName)
            || cohort.homeroomTeacherUserId;
    }

    function clearCohortHomeroom(cohort) {
        if (!cohort) {
            return;
        }
        cohort.homeroomTeacherUserId = '';
        cohort.homeroomTeacherName = '';
    }

    function deriveTeacherCategory(classData) {
        const explicit = normalizeStr(classData && classData.teacherCategory);
        if (explicit) {
            return explicit;
        }
        const typeId = normalizeStr(classData && classData.classTypeId);
        if (typeId && CLASS_TYPE_TO_CATEGORY[typeId]) {
            return CLASS_TYPE_TO_CATEGORY[typeId];
        }
        if (/debate/i.test(typeId) || /debate/i.test(normalizeStr(classData && classData.name))) {
            return 'Debate';
        }
        if (/wr.?sp|spk.?wr|write.?right/i.test(typeId)) {
            return 'Wr&Spk';
        }
        if (/conversation/i.test(normalizeStr(classData && classData.name))) {
            return 'Conversation';
        }
        if (/\bipe\b/i.test(normalizeStr(classData && classData.name))) {
            return 'IPE';
        }
        return '';
    }

    function formatTimeSlotLabel(slot, lang) {
        if (!slot) {
            return '';
        }
        const sep = lang === 'ko' ? '~' : '–';
        const dur = slot.durationMin ? ` (${slot.durationMin}mins)` : '';
        return `${slot.start}${sep}${slot.end}${dur}`;
    }

    function getSortedTimeSlots(appData) {
        const slots = (appData && Array.isArray(appData.timetableTimeSlots) && appData.timetableTimeSlots.length)
            ? appData.timetableTimeSlots.slice()
            : DEFAULT_TIME_SLOTS.slice();
        return slots.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    }

    function normalizeTeacherName(name) {
        return normalizeStr(name).toLowerCase().replace(/\s+/g, ' ');
    }

    function teacherNameTokens(name) {
        const n = normalizeTeacherName(name);
        if (!n) {
            return [];
        }
        return n.split(/[\s,]+/).filter(Boolean);
    }

    function teacherNamesMatch(a, b) {
        const left = normalizeTeacherName(a);
        const right = normalizeTeacherName(b);
        if (!left || !right) {
            return false;
        }
        if (left === right) {
            return true;
        }
        if (left.includes(right) || right.includes(left)) {
            return true;
        }
        const lt = teacherNameTokens(left);
        const rt = teacherNameTokens(right);
        if (lt[0] && rt[0] && lt[0] === rt[0]) {
            return true;
        }
        return false;
    }

    function teacherMatchesTeacherRef(ref, selector, options) {
        options = options || {};
        if (!ref || !selector) {
            return false;
        }
        const uid = normalizeStr(selector.userId);
        const refUid = normalizeStr(ref.userId || ref.assignedTeacherUserId || ref.homeroomTeacherUserId);
        const refName = ref.displayName || ref.name || ref.assignedTeacherName || ref.homeroomTeacherName || '';
        const selName = selector.displayName || '';
        if (uid && refUid && uid === refUid) {
            return true;
        }
        if (options.accountOnly === true) {
            return false;
        }
        if (teacherNamesMatch(selName, refName)) {
            return true;
        }
        return false;
    }

    function getClassTeachersList(classData) {
        if (!classData) {
            return [];
        }
        const list = [];
        if (Array.isArray(classData.classTeachers)) {
            classData.classTeachers.forEach((row) => {
                const userId = normalizeStr(row.userId);
                const name = normalizeStr(row.name);
                if (userId || name || normalizeStr(row.curriculumId)) {
                    list.push(normalizeTeacherRow(row));
                }
            });
        }
        if (!list.length) {
            const userId = normalizeStr(classData.assignedTeacherUserId);
            const name = normalizeStr(classData.assignedTeacherName);
            if (userId || name || normalizeStr(classData.curriculumId)) {
                list.push(normalizeTeacherRow({
                    id: '',
                    userId,
                    name,
                    category: classData.teacherCategory,
                    curriculumId: classData.curriculumId,
                    classTypeId: classData.classTypeId,
                    book: classData.book
                }));
            }
        }
        return list;
    }

    function teacherMatchesClass(classData, selector) {
        if (!classData || !selector) {
            return false;
        }
        return getClassTeachersList(classData).some((row) =>
            teacherMatchesTeacherRef({ userId: row.userId, displayName: row.name }, selector)
        );
    }

    function getTeacherCategoryForClass(classData, selector) {
        const teachers = getClassTeachersList(classData);
        const match = teachers.find((row) =>
            teacherMatchesTeacherRef({ userId: row.userId, displayName: row.name }, selector)
        );
        if (match && match.category) {
            return match.category;
        }
        return deriveTeacherCategory(classData);
    }

    function resolveHomeroomUserIdForClass(classData, appData) {
        if (!classData) {
            return '';
        }
        const classHrUid = normalizeStr(classData.homeroomTeacherUserId);
        if (classHrUid) {
            return classHrUid;
        }
        const cohorts = (appData && appData.cohorts) || [];
        const cohortsById = {};
        cohorts.forEach((c) => {
            if (c && c.id) {
                cohortsById[c.id] = c;
            }
        });
        const cohortIds = getClassCohortIds(classData);
        for (let i = 0; i < cohortIds.length; i += 1) {
            const cohort = cohortsById[cohortIds[i]];
            if (cohort) {
                const hrUid = normalizeStr(cohort.homeroomTeacherUserId);
                if (hrUid) {
                    return hrUid;
                }
            }
        }
        return '';
    }

    function findHomeroomTeacherDisplayName(userId, classData, cohortsById) {
        const uid = normalizeStr(userId);
        if (!uid) {
            return '';
        }
        if (classData) {
            if (normalizeStr(classData.homeroomTeacherUserId) === uid) {
                const classHrName = normalizeStr(classData.homeroomTeacherName);
                if (classHrName) {
                    return classHrName;
                }
            }
            const classTeachers = getClassTeachersList(classData);
            for (let i = 0; i < classTeachers.length; i += 1) {
                const row = classTeachers[i];
                if (normalizeStr(row.userId) === uid && normalizeStr(row.name)) {
                    return normalizeStr(row.name);
                }
            }
        }
        if (cohortsById) {
            const cohortValues = Object.values(cohortsById);
            for (let i = 0; i < cohortValues.length; i += 1) {
                const cohort = cohortValues[i];
                if (!cohort || normalizeStr(cohort.homeroomTeacherUserId) !== uid) {
                    continue;
                }
                const cohortName = normalizeStr(cohort.homeroomTeacherName);
                if (cohortName) {
                    return cohortName;
                }
            }
        }
        return '';
    }

    function resolveHomeroomLabel(classData, cohortsById, appData) {
        if (!classData) {
            return '';
        }
        const classHrName = normalizeStr(classData.homeroomTeacherName);
        const classHrUid = normalizeStr(classData.homeroomTeacherUserId);
        if (classHrName) {
            return classHrName;
        }
        if (classHrUid) {
            const fromLinked = findHomeroomTeacherDisplayName(classHrUid, classData, cohortsById);
            if (fromLinked) {
                return fromLinked;
            }
            if (appData) {
                const teachers = listTeachersFromAppData(appData);
                const hit = teachers.find((row) => normalizeStr(row.userId) === classHrUid);
                if (hit) {
                    const name = normalizeStr(hit.displayName);
                    if (name && name !== classHrUid) {
                        return name;
                    }
                }
            }
        }
        const cohortIds = getClassCohortIds(classData);
        for (let i = 0; i < cohortIds.length; i += 1) {
            const cohort = cohortsById && cohortsById[cohortIds[i]];
            if (!cohort) {
                continue;
            }
            const name = normalizeStr(cohort.homeroomTeacherName);
            if (name) {
                return name;
            }
            const uid = normalizeStr(cohort.homeroomTeacherUserId);
            if (!uid) {
                continue;
            }
            const fromLinked = findHomeroomTeacherDisplayName(uid, classData, cohortsById);
            if (fromLinked) {
                return fromLinked;
            }
            if (appData) {
                const teachers = listTeachersFromAppData(appData);
                const hit = teachers.find((row) => normalizeStr(row.userId) === uid);
                if (hit) {
                    const resolved = normalizeStr(hit.displayName);
                    if (resolved && resolved !== uid) {
                        return resolved;
                    }
                }
            }
        }
        return '';
    }

    function getClassCohortIds(classData) {
        if (!classData) {
            return [];
        }
        const seen = new Set();
        const ids = [];
        if (Array.isArray(classData.cohortIds)) {
            classData.cohortIds.forEach((id) => {
                const cid = normalizeStr(id);
                if (cid && !seen.has(cid)) {
                    seen.add(cid);
                    ids.push(cid);
                }
            });
        }
        const legacy = normalizeStr(classData.cohortId);
        if (legacy && !seen.has(legacy)) {
            ids.push(legacy);
        }
        return ids;
    }

    function classHasCohortId(classData, cohortId) {
        const cid = normalizeStr(cohortId);
        if (!cid) {
            return false;
        }
        return getClassCohortIds(classData).includes(cid);
    }

    function syncClassPrimaryCohortId(classData) {
        const ids = getClassCohortIds(classData);
        classData.cohortIds = ids.slice();
        const primary = normalizeStr(classData.cohortId);
        if (primary && ids.includes(primary)) {
            return;
        }
        classData.cohortId = ids[0] || '';
    }

    function addClassCohortId(classData, cohortId) {
        const cid = normalizeStr(cohortId);
        if (!cid || !classData) {
            return;
        }
        const ids = getClassCohortIds(classData);
        if (!ids.includes(cid)) {
            ids.push(cid);
        }
        classData.cohortIds = ids;
        if (!normalizeStr(classData.cohortId)) {
            classData.cohortId = cid;
        }
    }

    function removeClassCohortId(classData, cohortId) {
        const cid = normalizeStr(cohortId);
        if (!cid || !classData) {
            return;
        }
        const ids = getClassCohortIds(classData).filter((id) => id !== cid);
        classData.cohortIds = ids;
        if (normalizeStr(classData.cohortId) === cid) {
            classData.cohortId = ids[0] || '';
        }
    }

    function teacherRefKeyFromRow(row) {
        const uid = normalizeStr(row.userId);
        const name = normalizeStr(row.name);
        return uid || (name ? name.toLowerCase() : '');
    }

    function isCombinableAcrossCohortsClassType(classTypeId) {
        const id = normalizeStr(classTypeId);
        if (!id) {
            return false;
        }
        const g = typeof global !== 'undefined' ? global : null;
        const matrix = g && g.CCPScheduleMatrix ? g.CCPScheduleMatrix : null;
        if (!matrix || !matrix.getMatrix) {
            return false;
        }
        const tracks = matrix.getMatrix().builtinSubjectTracks || {};
        return Object.keys(tracks).some((key) => {
            const entry = tracks[key];
            return entry && normalizeStr(entry.classTypeId) === id;
        });
    }

    function classesShareAssignedTeacher(classA, classB) {
        const keysA = new Set();
        getClassTeachersList(classA).forEach((row) => {
            const key = teacherRefKeyFromRow(row);
            if (key) {
                keysA.add(key);
            }
        });
        if (!keysA.size) {
            return false;
        }
        return getClassTeachersList(classB).some((row) => {
            const key = teacherRefKeyFromRow(row);
            return key && keysA.has(key);
        });
    }

    function classesMatchForCombine(classA, classB) {
        if (!classA || !classB || classA.id === classB.id) {
            return false;
        }
        const typeA = normalizeStr(classA.classTypeId);
        const typeB = normalizeStr(classB.classTypeId);
        if (!typeA || typeA !== typeB) {
            return false;
        }
        if (!isCombinableAcrossCohortsClassType(typeA)) {
            return false;
        }
        return classesShareAssignedTeacher(classA, classB);
    }

    function getClassesForCohort(appData, cohortId) {
        const cid = normalizeStr(cohortId);
        if (!cid) {
            return [];
        }
        return (appData.classes || []).filter((c) => classHasCohortId(c, cid));
    }

    /**
     * Pairs of classes (one per cohort) that look like duplicates for combining.
     * @returns {{ classA: object, classB: object, matchKey: string }[]}
     */
    function findDuplicateClassPairsForCohorts(appData, cohortIdA, cohortIdB) {
        const aId = normalizeStr(cohortIdA);
        const bId = normalizeStr(cohortIdB);
        if (!aId || !bId || aId === bId) {
            return [];
        }
        const listA = getClassesForCohort(appData, aId);
        const listB = getClassesForCohort(appData, bId);
        const pairs = [];
        const usedB = new Set();
        listA.forEach((classA) => {
            const match = listB.find((classB) =>
                !usedB.has(classB.id) && classesMatchForCombine(classA, classB)
            );
            if (match) {
                usedB.add(match.id);
                const matchKey = normalizeStr(classA.classTypeId);
                pairs.push({ classA, classB: match, matchKey });
            }
        });
        return pairs;
    }

    function formatCohortNamesForClass(classData, cohortsById, options) {
        options = options || {};
        const maxLen = options.maxLen != null ? options.maxLen : 24;
        const ids = getClassCohortIds(classData);
        const names = ids
            .map((id) => {
                const c = cohortsById[id];
                return c ? (c.name || id) : id;
            })
            .filter(Boolean);
        if (!names.length) {
            return '';
        }
        let label = names.join(' + ');
        if (label.length > maxLen) {
            label = names.map((n) => (n.length > 8 ? n.slice(0, 7) + '…' : n)).join('+');
        }
        return label;
    }

    /**
     * Link keeper to both cohorts and optionally remove duplicate class record.
     * @returns {{ keeperId: string, removedId: string, deleted: boolean }}
     */
    function combineCohortClassPair(appData, keeperId, duplicateId, cohortIdA, cohortIdB, options) {
        options = options || {};
        const keeper = (appData.classes || []).find((c) => c.id === keeperId);
        const duplicate = (appData.classes || []).find((c) => c.id === duplicateId);
        if (!keeper || !duplicate || keeper.id === duplicate.id) {
            return { keeperId: keeperId || '', removedId: '', deleted: false, error: 'invalid' };
        }
        const aId = normalizeStr(cohortIdA);
        const bId = normalizeStr(cohortIdB);
        if (aId) {
            addClassCohortId(keeper, aId);
        }
        if (bId) {
            addClassCohortId(keeper, bId);
        }
        removeClassCohortId(duplicate, aId);
        removeClassCohortId(duplicate, bId);
        syncClassPrimaryCohortId(keeper);

        let deleted = false;
        if (options.deleteDuplicate) {
            const idx = (appData.classes || []).findIndex((c) => c.id === duplicate.id);
            if (idx >= 0) {
                appData.classes.splice(idx, 1);
                deleted = true;
            }
        }
        if (options.renameKeeper && options.renameLabel) {
            keeper.name = normalizeStr(options.renameLabel) || keeper.name;
        }
        return { keeperId: keeper.id, removedId: duplicate.id, deleted };
    }

    function findPossibleDuplicatePairsAcrossCohorts(appData) {
        const cohorts = (appData.cohorts || []).filter((c) => c && c.id);
        const pairs = [];
        for (let i = 0; i < cohorts.length; i += 1) {
            for (let j = i + 1; j < cohorts.length; j += 1) {
                findDuplicateClassPairsForCohorts(appData, cohorts[i].id, cohorts[j].id).forEach((p) => {
                    pairs.push({
                        cohortIdA: cohorts[i].id,
                        cohortIdB: cohorts[j].id,
                        cohortNameA: cohorts[i].name || cohorts[i].id,
                        cohortNameB: cohorts[j].name || cohorts[j].id,
                        ...p
                    });
                });
            }
        }
        return pairs;
    }

    function getCohortMeetingDaysForWarnings(cohort) {
        if (!cohort) {
            return [];
        }
        const g = typeof global !== 'undefined' ? global : null;
        if (g && g.CCPCohortManagement && g.CCPCohortManagement.getCohortMeetingDays) {
            return g.CCPCohortManagement.getCohortMeetingDays(cohort);
        }
        const matrix = g && g.CCPScheduleMatrix ? g.CCPScheduleMatrix : null;
        const patternId = normalizeStr(cohort.schedulePattern);
        if (patternId && patternId !== 'custom' && matrix) {
            const pat = matrix.getPatterns()[patternId];
            if (pat && Array.isArray(pat.meetingDays)) {
                return pat.meetingDays.slice();
            }
        }
        return normalizeMeetingDaysArray(cohort.meetingDays).filter((d) => d >= 1 && d <= 5);
    }

    function classLabelForWarning(classData) {
        return normalizeStr(classData.name) || classData.id || '';
    }

    function getClassTimetableSlotKeys(classData, appData) {
        const seen = new Set();
        const keys = [];
        const rows = getClassTeachersList(classData);
        const sources = rows.length ? rows : [normalizeTeacherRow({})];
        sources.forEach((row) => {
            getTeacherTimetablePlacements(classData, row, appData).forEach((pl) => {
                const k = `${pl.dow}|${pl.timeSlotId}`;
                if (!seen.has(k)) {
                    seen.add(k);
                    keys.push(k);
                }
            });
        });
        return keys;
    }

    /**
     * Cohort-scoped setup warnings for the cohort board tiles.
     * @returns {Array<{ code: string, severity: string, messageKey: string, params?: object, classId?: string }>}
     */
    function collectCohortSetupWarnings(cohort, appData, options) {
        options = options || {};
        const warnings = [];
        if (!cohort || !cohort.id || !appData) {
            return warnings;
        }
        const cohortId = cohort.id;

        const hrUid = normalizeStr(cohort.homeroomTeacherUserId);
        const hrName = normalizeStr(cohort.homeroomTeacherName);
        if (!hrUid && !hrName) {
            warnings.push({
                code: 'no_homeroom',
                severity: 'warn',
                messageKey: 'setupBoardWarnNoHomeroom'
            });
        }

        const classIds = getCohortClassIds(appData, cohort);
        const classes = classIds
            .map((id) => (appData.classes || []).find((c) => c && c.id === id))
            .filter(Boolean);

        if (!classes.length) {
            warnings.push({
                code: 'no_classes',
                severity: 'info',
                messageKey: 'setupBoardWarnNoClasses'
            });
            return warnings;
        }

        const cohortDays = getCohortMeetingDaysForWarnings(cohort);
        const cohortSet = new Set(cohortDays);

        classes.forEach((cls) => {
            const className = classLabelForWarning(cls);
            const teachers = getClassTeachersList(cls);
            if (!teachers.length) {
                warnings.push({
                    code: 'class_no_teacher',
                    severity: 'warn',
                    messageKey: 'setupBoardWarnClassNoTeacher',
                    params: { class: className },
                    classId: cls.id
                });
            }
            const classDays = getMeetingDaysFromClass(cls).filter((d) => d >= 1 && d <= 5);
            if (classDays.length && cohortDays.length && classDays.some((d) => !cohortSet.has(d))) {
                warnings.push({
                    code: 'class_days_outside',
                    severity: 'warn',
                    messageKey: 'setupBoardWarnDaysOutside',
                    params: { class: className },
                    classId: cls.id
                });
            }
        });

        const teacherSlotMap = new Map();
        classes.forEach((cls) => {
            const className = classLabelForWarning(cls);
            getClassTeachersList(cls).forEach((row) => {
                const tKey = teacherRefKeyFromRow(row);
                if (!tKey) {
                    return;
                }
                const tLabel = normalizeStr(row.name) || row.userId || tKey;
                getTeacherTimetablePlacements(cls, row, appData).forEach((pl) => {
                    const slotKey = `${tKey}|${pl.dow}|${pl.timeSlotId}`;
                    if (!teacherSlotMap.has(slotKey)) {
                        teacherSlotMap.set(slotKey, { teacherLabel: tLabel, classes: [] });
                    }
                    const entry = teacherSlotMap.get(slotKey);
                    if (!entry.classes.includes(className)) {
                        entry.classes.push(className);
                    }
                });
            });
        });
        teacherSlotMap.forEach((entry) => {
            if (entry.classes.length > 1) {
                warnings.push({
                    code: 'teacher_double_book',
                    severity: 'error',
                    messageKey: 'setupBoardWarnTeacherDoubleBook',
                    params: {
                        teacher: entry.teacherLabel,
                        classes: entry.classes.join(', ')
                    }
                });
            }
        });

        const slotClassMap = new Map();
        classes.forEach((cls) => {
            const className = classLabelForWarning(cls);
            getClassTimetableSlotKeys(cls, appData).forEach((k) => {
                if (!slotClassMap.has(k)) {
                    slotClassMap.set(k, []);
                }
                const arr = slotClassMap.get(k);
                if (!arr.includes(className)) {
                    arr.push(className);
                }
            });
        });
        slotClassMap.forEach((names) => {
            if (names.length > 1) {
                warnings.push({
                    code: 'period_collision',
                    severity: 'warn',
                    messageKey: 'setupBoardWarnPeriodCollision',
                    params: { classes: names.join(', ') }
                });
            }
        });

        const dupReported = new Set();
        findPossibleDuplicatePairsAcrossCohorts(appData).forEach((pair) => {
            if (pair.cohortIdA !== cohortId && pair.cohortIdB !== cohortId) {
                return;
            }
            const key = `${pair.classA.id}|${pair.classB.id}`;
            if (dupReported.has(key)) {
                return;
            }
            dupReported.add(key);
            const otherName = pair.cohortIdA === cohortId ? pair.cohortNameB : pair.cohortNameA;
            warnings.push({
                code: 'duplicate_combined',
                severity: 'warn',
                messageKey: 'setupBoardWarnDuplicateCombined',
                params: {
                    classA: classLabelForWarning(pair.classA),
                    classB: classLabelForWarning(pair.classB),
                    otherCohort: otherName
                }
            });
        });

        return warnings;
    }

    function getCohortClassIds(appData, cohort) {
        if (!cohort || !cohort.id) {
            return [];
        }
        const classIdSet = new Set((appData.classes || []).map((c) => c && c.id).filter(Boolean));
        const ids = new Set(
            (Array.isArray(cohort.classIds) ? cohort.classIds : []).filter((id) => classIdSet.has(id))
        );
        (appData.classes || []).forEach((c) => {
            if (classHasCohortId(c, cohort.id)) {
                ids.add(c.id);
            }
        });
        return Array.from(ids);
    }

    function getHomeroomCohortsForTeacher(appData, selector) {
        return (appData.cohorts || []).filter((cohort) =>
            teacherMatchesTeacherRef({
                userId: cohort.homeroomTeacherUserId,
                displayName: cohort.homeroomTeacherName
            }, selector)
        );
    }

    function getClassesForTeacherSchedule(appData, selector) {
        const seen = new Set();
        const items = [];
        (appData.classes || []).forEach((classData) => {
            const teacherRow = findTeacherRowForSelector(classData, selector);
            if (!teacherRow) {
                return;
            }
            if (seen.has(classData.id)) {
                return;
            }
            seen.add(classData.id);
            items.push({ classData, teacherRow: normalizeTeacherRow(teacherRow) });
        });
        return items;
    }

    function teacherKeyFromSelector(selector) {
        const uid = normalizeStr(selector && selector.userId);
        const name = normalizeStr(selector && selector.displayName);
        return uid || name.toLowerCase() || '';
    }

    function listTeachersFromAppData(appData) {
        const map = new Map();
        function add(userId, displayName) {
            const uid = normalizeStr(userId);
            const name = normalizeStr(displayName);
            if (!uid && !name) {
                return;
            }
            const key = uid || name.toLowerCase();
            if (!map.has(key)) {
                map.set(key, { userId: uid, displayName: name || uid });
            } else if (name && !map.get(key).displayName) {
                map.get(key).displayName = name;
            }
        }
        (appData.classes || []).forEach((c) => {
            getClassTeachersList(c).forEach((row) => {
                add(row.userId, row.name);
            });
        });
        (appData.cohorts || []).forEach((cohort) => {
            add(cohort.homeroomTeacherUserId, cohort.homeroomTeacherName);
        });
        return Array.from(map.values()).sort((a, b) =>
            (a.displayName || a.userId).localeCompare(b.displayName || b.userId, undefined, { sensitivity: 'base' })
        );
    }

    function inferHomeroomDaySuffix(cohort, classesById) {
        if (cohort && cohort.homeroomDaySuffix) {
            return normalizeStr(cohort.homeroomDaySuffix);
        }
        const days = Array.isArray(cohort && cohort.meetingDays) && cohort.meetingDays.length
            ? normalizeMeetingDaysArray(cohort.meetingDays)
            : null;
        if (days && days.length === 1 && days[0] === 1) {
            return 'M';
        }
        if (days && days.length === 1 && days[0] === 2) {
            return 'T';
        }
        if (days && days.join(',') === '1,3,5') {
            return 'M';
        }
        if (days && days.join(',') === '2,4') {
            return 'T';
        }
        const linked = (cohort && cohort.classIds || [])
            .map((id) => classesById[id])
            .filter(Boolean);
        for (let i = 0; i < linked.length; i += 1) {
            const m = normalizeStr(linked[i].name).match(/([MTGW])_/i) || normalizeStr(linked[i].name).match(/([MTGW])\^/i);
            if (m) {
                return m[1].toUpperCase();
            }
        }
        return '';
    }

    const TTH_WEEKDAYS = new Set([2, 4]);
    const MWF_PATTERN_IDS = new Set(['mwf', 'mw', 'wf', 'mf']);

    function patternBucketForFilter(patternId) {
        const pat = normalizeStr(patternId);
        if (pat === 'tth') {
            return 'tth';
        }
        if (MWF_PATTERN_IDS.has(pat)) {
            return 'mwf';
        }
        return '';
    }

    function bucketFromMeetingDays(days) {
        const weekdays = (days || []).filter((d) => d >= 1 && d <= 5);
        if (weekdays.length && weekdays.every((d) => TTH_WEEKDAYS.has(d))) {
            return 'tth';
        }
        return 'mwf';
    }

    function gatherLinkedClassMeetingDayKeys(appData, cohort) {
        if (!cohort) {
            return new Map();
        }
        const counts = new Map();
        getCohortClassIds(appData, cohort).forEach((classId) => {
            const cls = (appData.classes || []).find((c) => c.id === classId);
            if (!cls) {
                return;
            }
            const days = getMeetingDaysFromClass(cls).filter((d) => d >= 1 && d <= 5);
            if (!days.length) {
                return;
            }
            const key = meetingDaysKey(days);
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        return counts;
    }

    function majorityMeetingDaysFromCounts(counts) {
        let bestKey = '';
        let bestCount = 0;
        counts.forEach((count, key) => {
            if (count > bestCount) {
                bestCount = count;
                bestKey = key;
            }
        });
        if (!bestKey) {
            return [];
        }
        return bestKey.split(',').map((d) => parseInt(d, 10)).filter((n) => !Number.isNaN(n));
    }

    function cohortScheduleFieldsBlank(cohort) {
        return !normalizeStr(cohort.schedulePattern)
            && !(Array.isArray(cohort.meetingDays) && cohort.meetingDays.length);
    }

    function getEffectiveCohortPattern(cohort, appData) {
        if (!cohort) {
            return 'mwf';
        }
        const stored = normalizeStr(cohort.schedulePattern);
        if (stored && stored !== 'custom') {
            const bucket = patternBucketForFilter(stored);
            if (bucket) {
                return bucket;
            }
        }
        if (stored === 'custom' && Array.isArray(cohort.meetingDays) && cohort.meetingDays.length) {
            return bucketFromMeetingDays(cohort.meetingDays);
        }
        const matrix = global.CCPScheduleMatrix;
        const counts = gatherLinkedClassMeetingDayKeys(appData, cohort);
        if (counts.size) {
            const days = majorityMeetingDaysFromCounts(counts);
            const pid = matrix && matrix.patternIdFromMeetingDays
                ? matrix.patternIdFromMeetingDays(days)
                : null;
            if (pid) {
                const bucket = patternBucketForFilter(pid);
                if (bucket) {
                    return bucket;
                }
            }
            return bucketFromMeetingDays(days);
        }
        if (Array.isArray(cohort.meetingDays) && cohort.meetingDays.length) {
            return bucketFromMeetingDays(cohort.meetingDays);
        }
        return 'mwf';
    }

    /**
     * Map class meeting days to cohort schedulePattern + meetingDays.
     * Exact MWF/TTH/etc. when days match a pattern; otherwise bucket (e.g. Tue-only → tth).
     */
    function inferCohortScheduleFromMeetingDays(days) {
        const normalized = normalizeMeetingDaysArray(days).filter((d) => d >= 1 && d <= 5);
        if (!normalized.length) {
            return { schedulePattern: 'mwf', meetingDays: [1, 3, 5] };
        }
        const matrix = global.CCPScheduleMatrix;
        const pid = matrix && matrix.patternIdFromMeetingDays
            ? matrix.patternIdFromMeetingDays(normalized)
            : null;
        if (pid && matrix && matrix.getPatterns) {
            const pat = matrix.getPatterns()[pid];
            return {
                schedulePattern: pid,
                meetingDays: pat && Array.isArray(pat.meetingDays)
                    ? pat.meetingDays.slice()
                    : normalized.slice()
            };
        }
        const bucket = bucketFromMeetingDays(normalized);
        const patterns = matrix && matrix.getPatterns ? matrix.getPatterns() : {};
        if (bucket === 'tth' && patterns.tth && Array.isArray(patterns.tth.meetingDays)) {
            return {
                schedulePattern: 'tth',
                meetingDays: patterns.tth.meetingDays.slice()
            };
        }
        if (patterns.mwf && Array.isArray(patterns.mwf.meetingDays)) {
            return {
                schedulePattern: 'mwf',
                meetingDays: patterns.mwf.meetingDays.slice()
            };
        }
        return {
            schedulePattern: 'custom',
            meetingDays: normalized.slice()
        };
    }

    function applyCohortScheduleFromMeetingDays(cohort, days) {
        if (!cohort) {
            return false;
        }
        const sched = inferCohortScheduleFromMeetingDays(days);
        cohort.schedulePattern = sched.schedulePattern;
        cohort.meetingDays = sched.meetingDays.slice();
        return true;
    }

    function syncCohortScheduleFromLinkedClasses(cohort, appData, options) {
        options = options || {};
        if (!cohort) {
            return { applied: false, reason: 'no_cohort' };
        }
        if (!options.force && !cohortScheduleFieldsBlank(cohort)) {
            return { applied: false, reason: 'not_blank' };
        }
        const counts = gatherLinkedClassMeetingDayKeys(appData, cohort);
        if (!counts.size) {
            return { applied: false, reason: 'no_class_days' };
        }
        const days = majorityMeetingDaysFromCounts(counts);
        if (!days.length) {
            return { applied: false, reason: 'no_class_days' };
        }
        applyCohortScheduleFromMeetingDays(cohort, days);
        return {
            applied: true,
            patternId: cohort.schedulePattern,
            meetingDays: cohort.meetingDays.slice()
        };
    }

    function inferCohortScheduleFromLinkedClasses(cohort, appData) {
        return syncCohortScheduleFromLinkedClasses(cohort, appData, { force: false });
    }

    function inferBlankCohortSchedules(appData) {
        let count = 0;
        (appData.cohorts || []).forEach((cohort) => {
            if (!cohort) {
                return;
            }
            const result = inferCohortScheduleFromLinkedClasses(cohort, appData);
            if (result.applied) {
                count += 1;
            }
        });
        return count;
    }

    function suggestCohortsFromClasses(classes) {
        const groups = new Map();
        (classes || []).forEach((c) => {
            const levelPreset = normalizeStr(c.levelPreset);
            const levelCustom = normalizeStr(c.level || c.levelCustom);
            const level = levelPreset || levelCustom;
            const grade = normalizeStr(c.grade);
            const md = meetingDaysKey(getMeetingDaysFromClass(c));
            if (!level && !grade) {
                return;
            }
            const key = `${level}|${grade}|${md}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    id: '',
                    name: [levelCustom || levelPreset, grade].filter(Boolean).join(' · '),
                    level: levelCustom || levelPreset,
                    levelPreset,
                    grade,
                    meetingDays: getMeetingDaysFromClass(c),
                    classIds: [],
                    homeroomTeacherUserId: '',
                    homeroomTeacherName: '',
                    homeroomDaySuffix: ''
                });
            }
            groups.get(key).classIds.push(c.id);
        });
        return Array.from(groups.values());
    }

    function buildEmptyGrid(timeSlots, blockId) {
        const rows = timeSlots.map((slot) => ({
            timeSlotId: slot.id,
            timeLabel: '',
            cells: WEEKDAY_COLUMNS.map((col) => ({
                dow: col.dow,
                entries: [],
                conflict: false
            }))
        }));
        return {
            id: blockId,
            columns: WEEKDAY_COLUMNS.slice(),
            rows
        };
    }

    function buildTeacherWeeklyGrid(appData, selector, options) {
        options = options || {};
        const lang = options.lang === 'ko' ? 'ko' : 'en';
        const timeSlots = getSortedTimeSlots(appData);
        const slotById = {};
        timeSlots.forEach((s) => {
            slotById[s.id] = s;
        });

        const classesById = {};
        (appData.classes || []).forEach((c) => {
            classesById[c.id] = c;
        });

        const blocks = {
            primary: buildEmptyGrid(timeSlots, 'primary'),
            secondary: buildEmptyGrid(timeSlots, 'secondary')
        };

        const cohortsById = {};
        (appData.cohorts || []).forEach((cohort) => {
            cohortsById[cohort.id] = cohort;
        });

        const scheduleItems = getClassesForTeacherSchedule(appData, selector);
        scheduleItems.forEach(({ classData, teacherRow }) => {
            const rowNorm = normalizeTeacherRow(teacherRow);
            const blockKey = rowNorm.scheduleBlock === 'secondary'
                ? 'secondary'
                : (rowNorm.scheduleBlock === 'primary'
                    ? 'primary'
                    : (classData.scheduleBlock === 'secondary' ? 'secondary' : 'primary'));
            const block = blocks[blockKey];
            const category = rowNorm.category || getTeacherCategoryForClass(classData, selector);
            const homeroomLabel = resolveHomeroomLabel(classData, cohortsById, appData);
            const placements = getTeacherTimetablePlacements(classData, rowNorm, appData);
            const color = normalizeStr(classData.color) || '#6366f1';
            const textColor = normalizeStr(classData.textColor) || '';
            placements.forEach((pl) => {
                const slotId = pl.timeSlotId;
                if (!slotId || !slotById[slotId]) {
                    return;
                }
                const gridRow = block.rows.find((r) => r.timeSlotId === slotId);
                if (!gridRow) {
                    return;
                }
                const cell = gridRow.cells.find((c) => c.dow === pl.dow);
                if (!cell) {
                    return;
                }
                const cohortIds = getClassCohortIds(classData);
                const cohortSuffix = cohortIds.length > 1
                    ? formatCohortNamesForClass(classData, cohortsById, { maxLen: 28 })
                    : '';
                let displayName = classData.name || '';
                let label = category ? `${displayName}\n(${category})` : displayName;
                if (cohortSuffix) {
                    label = `${displayName}\n(${cohortSuffix})`;
                    if (category) {
                        label += `\n(${category})`;
                    }
                }
                cell.entries.push({
                    classId: classData.id,
                    className: displayName,
                    category,
                    homeroomLabel,
                    color,
                    textColor,
                    cohortIds: cohortIds.slice(),
                    combinedCohorts: cohortSuffix,
                    label
                });
            });
        });

        Object.keys(blocks).forEach((blockKey) => {
            const block = blocks[blockKey];
            block.rows.forEach((row) => {
                const slot = slotById[row.timeSlotId];
                row.timeLabel = formatTimeSlotLabel(slot, lang);
                row.cells.forEach((cell) => {
                    cell.conflict = cell.entries.length > 1;
                });
            });
        });

        const homeroomCohorts = getHomeroomCohortsForTeacher(appData, selector);
        const homeroomLabels = [];
        homeroomCohorts.forEach((cohort) => {
            const suffix = inferHomeroomDaySuffix(cohort, classesById);
            if (suffix) {
                homeroomLabels.push(suffix);
            }
        });

        const displayName = normalizeStr(selector.displayName)
            || normalizeStr(selector.userId)
            || '';

        const resultBlocks = [];
        function itemUsesBlock(item, blockId) {
            const rowNorm = normalizeTeacherRow(item.teacherRow);
            if (rowNorm.scheduleBlock === blockId) {
                return true;
            }
            if (rowNorm.scheduleBlock) {
                return false;
            }
            const onClass = item.classData.scheduleBlock === 'secondary' ? 'secondary' : 'primary';
            return onClass === blockId;
        }
        if (scheduleItems.some((item) => itemUsesBlock(item, 'primary')) || !scheduleItems.length) {
            resultBlocks.push(blocks.primary);
        }
        if (scheduleItems.some((item) => itemUsesBlock(item, 'secondary'))) {
            resultBlocks.push(blocks.secondary);
        }

        const hasConflicts = resultBlocks.some((b) =>
            b.rows.some((r) => r.cells.some((c) => c.conflict))
        );

        return {
            teacherName: displayName,
            homeroomLabels: [...new Set(homeroomLabels)],
            homeroomCohorts: homeroomCohorts.map((cohort) => ({
                id: cohort.id,
                name: cohort.name || '',
                level: cohort.level || '',
                grade: cohort.grade || '',
                homeroomDaySuffix: inferHomeroomDaySuffix(cohort, classesById),
                classIds: getCohortClassIds(appData, cohort)
            })),
            blocks: resultBlocks,
            hasConflicts,
            assignedClassCount: scheduleItems.length
        };
    }

    function formatLocalIsoDate(date) {
        const d = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(d.getTime())) {
            return '';
        }
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function parseTimeToMinutes(hhmm) {
        const raw = normalizeStr(hhmm);
        if (!raw) {
            return null;
        }
        const parts = raw.split(':');
        if (parts.length < 2) {
            return null;
        }
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (Number.isNaN(h) || Number.isNaN(m)) {
            return null;
        }
        return h * 60 + m;
    }

    function resolveActiveTimeSlot(appData, at) {
        const when = at instanceof Date ? at : new Date();
        if (Number.isNaN(when.getTime())) {
            return null;
        }
        const mins = when.getHours() * 60 + when.getMinutes();
        const slots = getSortedTimeSlots(appData);
        for (let i = 0; i < slots.length; i += 1) {
            const slot = slots[i];
            const start = parseTimeToMinutes(slot.start);
            const end = parseTimeToMinutes(slot.end);
            if (start == null || end == null) {
                continue;
            }
            if (mins >= start && mins < end) {
                return { slot, inSession: true };
            }
        }
        return null;
    }

    function resolveActiveTimeSlotId(appData, at) {
        const active = resolveActiveTimeSlot(appData, at);
        return active && active.slot ? active.slot.id : null;
    }

    /**
     * Map local date/time + teacher weekly schedule to the class in session now (Mon–Fri only).
     * @param {object} appData
     * @param {object} teacherSelector
     * @param {{ at?: Date, classOccursOnIsoDate?: function }} [options]
     * @returns {object|null}
     */
    function resolveCurrentClassContext(appData, teacherSelector, options) {
        options = options || {};
        if (!appData || !teacherSelector) {
            return null;
        }
        const at = options.at instanceof Date ? options.at : new Date();
        if (Number.isNaN(at.getTime())) {
            return null;
        }
        const dow = at.getDay();
        if (dow < 1 || dow > 5) {
            return null;
        }
        const active = resolveActiveTimeSlot(appData, at);
        if (!active || !active.slot) {
            return null;
        }
        const dateStr = formatLocalIsoDate(at);
        const activeSlotId = active.slot.id;
        const occursOnDate = typeof options.classOccursOnIsoDate === 'function'
            ? options.classOccursOnIsoDate
            : null;
        const scheduleItems = getClassesForTeacherSchedule(appData, teacherSelector);
        for (let i = 0; i < scheduleItems.length; i += 1) {
            const item = scheduleItems[i];
            const classData = item.classData;
            const teacherRow = item.teacherRow;
            if (!classData || !classData.id) {
                continue;
            }
            if (occursOnDate && !occursOnDate(classData, dateStr)) {
                continue;
            }
            const placements = getTeacherTimetablePlacements(classData, teacherRow, appData);
            for (let j = 0; j < placements.length; j += 1) {
                const pl = placements[j];
                if (pl.dow === dow && pl.timeSlotId === activeSlotId) {
                    return {
                        dateStr,
                        dow,
                        timeSlotId: activeSlotId,
                        timeSlot: active.slot,
                        classId: classData.id,
                        className: classData.name || '',
                        classData,
                        teacherRow,
                        inSession: true
                    };
                }
            }
        }
        return null;
    }

    global.CCPTeacherTimetable = {
        WEEKDAY_COLUMNS,
        TEACHER_CATEGORY_PRESETS,
        DEFAULT_TIME_SLOTS,
        DEFAULT_PERIOD_SLOT_MAP,
        getDefaultTimetableTimeSlots: () => DEFAULT_TIME_SLOTS.slice(),
        getDefaultPeriodSlotMap: () => ({ ...DEFAULT_PERIOD_SLOT_MAP }),
        deriveTeacherCategory,
        getClassTeachersList,
        resolveHomeroomLabel,
        resolveHomeroomUserIdForClass,
        getTeacherCategoryForClass,
        listTeachersFromAppData,
        suggestCohortsFromClasses,
        getEffectiveCohortPattern,
        inferCohortScheduleFromMeetingDays,
        applyCohortScheduleFromMeetingDays,
        syncCohortScheduleFromLinkedClasses,
        inferCohortScheduleFromLinkedClasses,
        inferBlankCohortSchedules,
        patternBucketForFilter,
        buildTeacherWeeklyGrid,
        teacherKeyFromSelector,
        teacherMatchesTeacherRef,
        teacherMatchesClass,
        getHomeroomCohortsForTeacher,
        getClassesForTeacherSchedule,
        getClassCohortIds,
        classHasCohortId,
        addClassCohortId,
        removeClassCohortId,
        syncClassPrimaryCohortId,
        classesMatchForCombine,
        getClassesForCohort,
        findDuplicateClassPairsForCohorts,
        findPossibleDuplicatePairsAcrossCohorts,
        collectCohortSetupWarnings,
        formatCohortNamesForClass,
        combineCohortClassPair,
        getCohortClassIds,
        formatTimeSlotLabel,
        getSortedTimeSlots,
        inferHomeroomDaySuffix,
        meetingDaysKey,
        getMeetingDaysFromClass,
        normalizeTeacherRow,
        getTeacherMeetingDays,
        getTeacherTimetablePlacements,
        resolveActiveTimeSlotId,
        resolveCurrentClassContext,
        formatTeacherRowScheduleSummary,
        findTeacherRowForSelector,
        getTeacherPeriodNumber,
        classHasTeacherAssignment,
        addTeacherRowToClass,
        removeTeacherFromClass,
        cohortHasHomeroom,
        setCohortHomeroom,
        clearCohortHomeroom,
        buildDefaultTeacherRowForClass
    };
})(typeof window !== 'undefined' ? window : globalThis);
