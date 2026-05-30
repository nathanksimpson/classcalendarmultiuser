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

    function resolveTimeSlotIdForClass(classData, weekday, appData) {
        if (classData && classData.timeSlotId) {
            return classData.timeSlotId;
        }
        const period = getClassPeriodNumber(classData, weekday);
        if (period == null) {
            return null;
        }
        const map = (appData && appData.periodSlotMap) || DEFAULT_PERIOD_SLOT_MAP;
        return map[String(period)] || null;
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
                    list.push({
                        id: normalizeStr(row.id),
                        userId,
                        name,
                        category: normalizeStr(row.category),
                        curriculumId: normalizeStr(row.curriculumId),
                        classTypeId: normalizeStr(row.classTypeId),
                        book: normalizeStr(row.book)
                    });
                }
            });
        }
        if (!list.length) {
            const userId = normalizeStr(classData.assignedTeacherUserId);
            const name = normalizeStr(classData.assignedTeacherName);
            if (userId || name || normalizeStr(classData.curriculumId)) {
                list.push({
                    id: '',
                    userId,
                    name,
                    category: normalizeStr(classData.teacherCategory),
                    curriculumId: normalizeStr(classData.curriculumId),
                    classTypeId: normalizeStr(classData.classTypeId),
                    book: normalizeStr(classData.book)
                });
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

    function resolveHomeroomLabel(classData, cohortsById) {
        if (!classData) {
            return '';
        }
        const classHrName = normalizeStr(classData.homeroomTeacherName);
        const classHrUid = normalizeStr(classData.homeroomTeacherUserId);
        if (classHrName) {
            return classHrName;
        }
        if (classHrUid && cohortsById) {
            const cohort = Object.values(cohortsById).find((c) =>
                normalizeStr(c.homeroomTeacherUserId) === classHrUid
            );
            if (cohort && cohort.homeroomTeacherName) {
                return cohort.homeroomTeacherName;
            }
            return classHrUid;
        }
        const cohortId = normalizeStr(classData.cohortId);
        if (cohortId && cohortsById && cohortsById[cohortId]) {
            const cohort = cohortsById[cohortId];
            return normalizeStr(cohort.homeroomTeacherName)
                || normalizeStr(cohort.homeroomTeacherUserId)
                || '';
        }
        return '';
    }

    function getCohortClassIds(appData, cohort) {
        const ids = new Set(Array.isArray(cohort.classIds) ? cohort.classIds : []);
        (appData.classes || []).forEach((c) => {
            if (c.cohortId === cohort.id) {
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
            if (!teacherMatchesClass(classData, selector)) {
                return;
            }
            if (seen.has(classData.id)) {
                return;
            }
            seen.add(classData.id);
            items.push({ classData });
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

    function suggestCohortsFromClasses(classes) {
        const groups = new Map();
        (classes || []).forEach((c) => {
            const level = normalizeStr(c.level || c.levelCustom);
            const grade = normalizeStr(c.grade);
            const md = meetingDaysKey(getMeetingDaysFromClass(c));
            if (!level && !grade) {
                return;
            }
            const key = `${level}|${grade}|${md}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    id: '',
                    name: [level, grade, md ? `days ${md}` : ''].filter(Boolean).join(' · '),
                    level,
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
        scheduleItems.forEach(({ classData }) => {
            const blockKey = classData.scheduleBlock === 'secondary' ? 'secondary' : 'primary';
            const block = blocks[blockKey];
            const category = getTeacherCategoryForClass(classData, selector);
            const homeroomLabel = resolveHomeroomLabel(classData, cohortsById);
            const meetingDays = getMeetingDaysFromClass(classData);
            meetingDays.forEach((dow) => {
                if (dow < 1 || dow > 5) {
                    return;
                }
                const slotId = resolveTimeSlotIdForClass(classData, dow, appData);
                if (!slotId || !slotById[slotId]) {
                    return;
                }
                const row = block.rows.find((r) => r.timeSlotId === slotId);
                if (!row) {
                    return;
                }
                const cell = row.cells.find((c) => c.dow === dow);
                if (!cell) {
                    return;
                }
                cell.entries.push({
                    classId: classData.id,
                    className: classData.name || '',
                    category,
                    homeroomLabel,
                    label: category ? `${classData.name}\n(${category})` : classData.name
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
        if (scheduleItems.some(({ classData }) => classData.scheduleBlock !== 'secondary')) {
            resultBlocks.push(blocks.primary);
        } else if (!scheduleItems.length) {
            resultBlocks.push(blocks.primary);
        }
        if (scheduleItems.some(({ classData }) => classData.scheduleBlock === 'secondary')) {
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
        getTeacherCategoryForClass,
        listTeachersFromAppData,
        suggestCohortsFromClasses,
        buildTeacherWeeklyGrid,
        teacherKeyFromSelector,
        teacherMatchesTeacherRef,
        teacherMatchesClass,
        getHomeroomCohortsForTeacher,
        getClassesForTeacherSchedule,
        getCohortClassIds,
        formatTimeSlotLabel,
        getSortedTimeSlots,
        inferHomeroomDaySuffix,
        meetingDaysKey,
        getMeetingDaysFromClass
    };
})(typeof window !== 'undefined' ? window : globalThis);
