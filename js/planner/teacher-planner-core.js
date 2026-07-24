/**
 * Teacher schedule arrangement planner — pure domain core.
 * Shared by Class Calendar (Phase 1) and standalone (Phase 2).
 * No DOM. Depends optionally on CCPTeacherTimetable helpers when present.
 */
(function (global) {
    const PLANNER_RULES_VERSION = 2;
    /** Soft suggested period windows (shuttle bands). Overlap is intentional. */
    const BAND_PERIODS = {
        junior: [1, 2, 3],
        middle: [3, 4, 5],
        senior: [4, 5, 6, 7]
    };
    const SOFT_WEIGHTS = {
        preferredLevel: 8,
        preferredCurriculum: 8,
        preferredCohort: 5,
        preferredDay: 3,
        preferredPeriod: 3,
        preferredCadence: 4,
        preferredFrequency: 4,
        towardWeeklyTarget: 6,
        bandTarget: 4,
        morningAfternoon: 2,
        learnedBonusMax: 6,
        discouragedDay: -4,
        discouragedPeriod: -4,
        avoidFirstLast: -3,
        gapCreated: -2,
        aboveTarget: -5,
        belowTargetOpportunity: -2,
        roomUnresolved: -1
    };

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function uid(prefix) {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function slotKey(dow, period) {
        return `${Number(dow)}:${String(period)}`;
    }

    function parsePeriod(v) {
        if (v == null || v === '') return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n >= 1 ? n : null;
    }

    /** Junior Rainbow level names (EN + common aliases). */
    const JUNIOR_LEVEL_ORDER = ['red', 'orange', 'yellow', 'green', 'blue', 'navy', 'purple'];
    /** Senior Waterflow level names (EN canonical). */
    const SENIOR_LEVEL_ORDER = ['saemmul', 'yeoul', 'garam', 'bada', 'mirinae', 'byeolmaru'];

    function normalizeLevelKey(text) {
        return normalizeStr(text)
            .toLowerCase()
            .replace(/[\s_\-./]+/g, '')
            .replace(/별\s*마루/g, '별마루');
    }

    function levelKeyAliases(raw) {
        const key = normalizeLevelKey(raw);
        if (!key) return '';
        if (key === 'saemul' || key === 'saemmul' || key === '샘물') return 'saemmul';
        if (key === 'yeoul' || key === '여울') return 'yeoul';
        if (key === 'garam' || key === '가람') return 'garam';
        if (key === 'bada' || key === '바다') return 'bada';
        if (key === 'mirinae' || key === '미리내') return 'mirinae';
        if (
            key === 'byeolmaru'
            || key === 'beyoulmaru'
            || key === 'byeoulmaru'
            || key === '별마루'
            || key.indexOf('byeol') >= 0
            || key.indexOf('별마루') >= 0
        ) {
            return 'byeolmaru';
        }
        return key;
    }

    /**
     * Resolve planner band from a level / cohort name string.
     * Returns 'junior' | 'senior' | null if unrecognized (caller defaults to middle).
     */
    function resolvePlannerBandFromText(text) {
        const raw = normalizeStr(text);
        if (!raw) return null;
        const key = levelKeyAliases(raw);
        if (JUNIOR_LEVEL_ORDER.includes(key)) return 'junior';
        if (SENIOR_LEVEL_ORDER.includes(key)) return 'senior';
        const lower = raw.toLowerCase();
        if (/\b(red|orange|yellow|green|blue|navy|purple)\b/i.test(lower)) return 'junior';
        if (/(saemmul|saemul|yeoul|garam|bada|mirinae|byeol\s*maru|샘물|여울|가람|바다|미리내|별마루)/i.test(raw)) {
            return 'senior';
        }
        return null;
    }

    function cohortLevelText(cohort) {
        if (!cohort) return '';
        return normalizeStr(cohort.levelPreset || cohort.level || cohort.name || cohort.label || '');
    }

    function resolvePlannerBandForCohort(cohort) {
        const fromLevel = resolvePlannerBandFromText(cohortLevelText(cohort));
        if (fromLevel) return fromLevel;
        const block = normalizeStr(cohort && cohort.scheduleBlock).toLowerCase();
        if (block === 'secondary' || block === 'senior') return 'senior';
        if (block === 'middle' || block === 'middleschool' || block === 'middle-school') return 'middle';
        if (block === 'junior') return 'junior';
        // primary alone is ambiguous — default middle per product rule
        return 'middle';
    }

    function levelSortIndex(band, cohort) {
        const key = levelKeyAliases(cohortLevelText(cohort));
        if (band === 'junior') {
            const i = JUNIOR_LEVEL_ORDER.indexOf(key);
            return i >= 0 ? i : 100;
        }
        if (band === 'senior') {
            const i = SENIOR_LEVEL_ORDER.indexOf(key);
            return i >= 0 ? i : 100;
        }
        return 0;
    }

    function bandFromScheduleBlock(block, classData, cohorts) {
        const ids = getClassCohortIds(classData);
        for (let i = 0; i < ids.length; i += 1) {
            const c = (cohorts || []).find((x) => x && x.id === ids[i]);
            if (!c) continue;
            const fromLevel = resolvePlannerBandFromText(cohortLevelText(c));
            if (fromLevel) return fromLevel;
        }
        if (classData) {
            const fromClass = resolvePlannerBandFromText(
                classData.levelPreset || classData.level || classData.name
            );
            if (fromClass) return fromClass;
        }
        // Class scheduleBlock (legacy primary/secondary) when levels unknown
        const classBlock = normalizeStr(block || (classData && classData.scheduleBlock)).toLowerCase();
        if (classBlock === 'secondary' || classBlock === 'senior') return 'senior';
        if (classBlock === 'middle' || classBlock === 'middleschool' || classBlock === 'middle-school') return 'middle';
        if (classBlock === 'primary' || classBlock === 'junior') return 'junior';
        for (let i = 0; i < ids.length; i += 1) {
            const c = (cohorts || []).find((x) => x && x.id === ids[i]);
            if (!c) continue;
            const blockOnly = normalizeStr(c.scheduleBlock).toLowerCase();
            if (blockOnly === 'secondary' || blockOnly === 'senior') return 'senior';
            if (blockOnly === 'middle' || blockOnly === 'middleschool' || blockOnly === 'middle-school') return 'middle';
            if (blockOnly === 'junior' || blockOnly === 'primary') return 'junior';
        }
        return 'middle';
    }

    function periodBand(period) {
        const p = parsePeriod(period);
        if (p == null) return 'senior';
        if (BAND_PERIODS.junior.includes(p) && !BAND_PERIODS.senior.includes(p) && !BAND_PERIODS.middle.includes(p)) {
            return 'junior';
        }
        if (BAND_PERIODS.junior.includes(p) && !BAND_PERIODS.senior.includes(p)) return 'junior';
        if (BAND_PERIODS.senior.includes(p) && !BAND_PERIODS.junior.includes(p) && !BAND_PERIODS.middle.includes(p)) {
            return 'senior';
        }
        if (BAND_PERIODS.middle.includes(p) && BAND_PERIODS.junior.includes(p)) return 'junior';
        if (BAND_PERIODS.middle.includes(p) && BAND_PERIODS.senior.includes(p)) return 'senior';
        if (BAND_PERIODS.middle.includes(p)) return 'middle';
        if (BAND_PERIODS.junior.includes(p)) return 'junior';
        return 'senior';
    }

    function isOutOfBlock(band, period) {
        const b = band === 'middle' || band === 'senior' ? band : 'junior';
        const allowed = BAND_PERIODS[b] || BAND_PERIODS.junior;
        return !allowed.includes(parsePeriod(period));
    }

    function cohortMeetingDays(appData, demand) {
        const cohorts = Array.isArray(appData && appData.cohorts) ? appData.cohorts : [];
        const ids = (demand && demand.cohortIds) || [];
        const days = new Set();
        ids.forEach((cid) => {
            const c = cohorts.find((x) => x && x.id === cid);
            if (c && Array.isArray(c.meetingDays)) {
                c.meetingDays.forEach((d) => days.add(Number(d)));
            }
        });
        if (!days.size && demand && Array.isArray(demand.meetings)) {
            demand.meetings.forEach((m) => days.add(Number(m.dow)));
        }
        return [...days].filter((d) => d >= 1 && d <= 5).sort((a, b) => a - b);
    }

    function weeklyNeed(demand) {
        const freq = Number(demand && demand.weeklyFrequency) || 0;
        const meetings = (demand && demand.meetings) || [];
        return Math.max(freq, meetings.length, 1);
    }

    function assignmentMeetings(asg) {
        return Array.isArray(asg && asg.meetings) ? asg.meetings : [];
    }

    function hasDuplicateWeekday(meetings) {
        const seen = new Set();
        for (let i = 0; i < (meetings || []).length; i += 1) {
            const d = Number(meetings[i].dow);
            if (seen.has(d)) return true;
            seen.add(d);
        }
        return false;
    }

    function getClassCohortIds(classData) {
        if (global.CCPTeacherTimetable && global.CCPTeacherTimetable.getClassCohortIds) {
            return global.CCPTeacherTimetable.getClassCohortIds(classData);
        }
        if (!classData) return [];
        const ids = [];
        if (Array.isArray(classData.cohortIds)) {
            classData.cohortIds.forEach((id) => {
                const s = normalizeStr(id);
                if (s && !ids.includes(s)) ids.push(s);
            });
        }
        const primary = normalizeStr(classData.cohortId);
        if (primary && !ids.includes(primary)) ids.unshift(primary);
        return ids;
    }

    function inferCadence(meetingDays, schedulePattern) {
        const pat = normalizeStr(schedulePattern).toLowerCase();
        if (pat === 'mwf' || pat === 'tth' || pat === 'custom') return pat || 'custom';
        const days = Array.isArray(meetingDays)
            ? meetingDays.map(Number).filter((d) => d >= 1 && d <= 5).sort((a, b) => a - b)
            : [];
        if (global.CCPTeacherTimetable && global.CCPTeacherTimetable.inferCohortScheduleFromMeetingDays) {
            const inf = global.CCPTeacherTimetable.inferCohortScheduleFromMeetingDays(days);
            return normalizeStr(inf && inf.schedulePattern) || 'custom';
        }
        const key = days.join(',');
        if (key === '1,3,5') return 'mwf';
        if (key === '2,4') return 'tth';
        return days.length ? 'custom' : '';
    }

    function defaultTeacherProfile(partial) {
        const p = partial || {};
        return {
            id: normalizeStr(p.id) || uid('tp'),
            userId: normalizeStr(p.userId),
            name: normalizeStr(p.name) || 'Teacher',
            role: p.role === 'native' ? 'native' : 'korean',
            color: normalizeStr(p.color),
            limits: {
                maxPeriodsPerWeek: Number(p.limits && p.limits.maxPeriodsPerWeek) || 22,
                maxPeriodsPerDay: Number(p.limits && p.limits.maxPeriodsPerDay) || 5,
                minPeriodsPerWeek: Number(p.limits && p.limits.minPeriodsPerWeek) || 0,
                juniorAllowed: p.limits && p.limits.juniorAllowed === false ? false : true,
                middleAllowed: p.limits && p.limits.middleAllowed === false ? false : true,
                seniorAllowed: p.limits && p.limits.seniorAllowed === false ? false : true
            },
            availability: {
                unavailableDays: Array.isArray(p.availability && p.availability.unavailableDays)
                    ? p.availability.unavailableDays.map(Number)
                    : [],
                unavailablePeriods: Array.isArray(p.availability && p.availability.unavailablePeriods)
                    ? p.availability.unavailablePeriods.map(String)
                    : [],
                unavailableSlots: Array.isArray(p.availability && p.availability.unavailableSlots)
                    ? p.availability.unavailableSlots.map((s) => ({
                        dow: Number(s.dow),
                        period: String(s.period)
                    }))
                    : []
            },
            preferences: Object.assign({
                preferredLevels: [],
                allowedLevels: [],
                preferredCurricula: [],
                avoidCurricula: [],
                neverCurricula: [],
                preferredDays: [],
                discouragedDays: [],
                preferredPeriods: [],
                discouragedPeriods: [],
                morningPreferred: false,
                afternoonPreferred: false,
                avoidFirstPeriod: false,
                avoidLastPeriod: false,
                avoidGaps: true,
                preferCadence: [],
                preferFrequency: [],
                preferredCohortIds: [],
                preferCombinedClasses: 'neutral',
                preferredRoomIds: [],
                notes: ''
            }, p.preferences || {}),
            loadTargets: Object.assign({
                juniorPeriods: null,
                seniorPeriods: null,
                byCurriculum: {}
            }, p.loadTargets || {}),
            learnedPreferences: Object.assign({
                preferredClassTypeIds: {},
                preferredCohortIds: {},
                preferredPartnerTeacherIds: {},
                avoidedSlots: {},
                preferredSlots: {},
                updatedAt: null
            }, p.learnedPreferences || {})
        };
    }

    function defaultPlannerState(partial) {
        const p = partial || {};
        return {
            version: 1,
            activeDraftId: p.activeDraftId || null,
            selectedTeacherProfileIds: Array.isArray(p.selectedTeacherProfileIds)
                ? p.selectedTeacherProfileIds.slice()
                : [],
            viewMode: p.viewMode || 'teacherBoard',
            teacherBoard: Object.assign({
                zoom: 1,
                panelOrder: [],
                visibleIds: [],
                pinnedPairs: []
            }, p.teacherBoard || {}),
            roomBoard: Object.assign({
                zoom: 1,
                panelOrder: [],
                visibleIds: []
            }, p.roomBoard || {}),
            filters: Object.assign({
                band: 'all',
                cadence: 'all',
                frequency: 'all',
                combinedOnly: false
            }, p.filters || {}),
            blockouts: Object.assign({
                globalUnavailableSlots: [],
                globalUnavailablePeriods: [],
                notes: ''
            }, p.blockouts || {}),
            lockToCohortDays: p.lockToCohortDays === true,
            updatedAt: p.updatedAt || null
        };
    }

    function ensurePlannerFields(appData) {
        if (!appData || typeof appData !== 'object') return { migrated: false };
        let migrated = false;
        if (!Array.isArray(appData.rooms)) {
            appData.rooms = [];
            migrated = true;
        }
        if (!Array.isArray(appData.teacherProfiles)) {
            appData.teacherProfiles = [];
            migrated = true;
        } else {
            appData.teacherProfiles = appData.teacherProfiles.map((tp) => defaultTeacherProfile(tp));
        }
        if (!Array.isArray(appData.plannerDrafts)) {
            appData.plannerDrafts = [];
            migrated = true;
        }
        if (!appData.plannerState || typeof appData.plannerState !== 'object') {
            appData.plannerState = defaultPlannerState();
            migrated = true;
        } else {
            appData.plannerState = defaultPlannerState(appData.plannerState);
        }
        if (Array.isArray(appData.teacherTeachingProfiles) && appData.teacherTeachingProfiles.length
            && !appData.teacherProfiles.length) {
            appData.teacherProfiles = appData.teacherTeachingProfiles.map((row) => defaultTeacherProfile({
                userId: row.userId,
                name: row.name || row.userId,
                preferences: {
                    preferredCurricula: Object.keys(row.categories || {}).filter((k) => row.categories[k] === 'prefer'),
                    avoidCurricula: Object.keys(row.categories || {}).filter((k) => row.categories[k] === 'avoid'),
                    neverCurricula: Object.keys(row.categories || {}).filter((k) => row.categories[k] === 'never')
                }
            }));
            migrated = true;
        }
        return { migrated };
    }

    function seedTeacherProfilesFromAppData(appData) {
        ensurePlannerFields(appData);
        const tt = global.CCPTeacherTimetable;
        const listed = tt && tt.listTeachersFromAppData
            ? tt.listTeachersFromAppData(appData)
            : [];
        const byUser = new Map(appData.teacherProfiles.map((p) => [p.userId || p.id, p]));
        listed.forEach((t) => {
            const key = normalizeStr(t.userId) || normalizeStr(t.displayName);
            if (!key) return;
            if (![...byUser.keys()].some((k) => k === key || normalizeStr(byUser.get(k).name) === key)) {
                const profile = defaultTeacherProfile({
                    userId: normalizeStr(t.userId),
                    name: normalizeStr(t.displayName) || key
                });
                appData.teacherProfiles.push(profile);
                byUser.set(profile.userId || profile.id, profile);
            }
        });
        if (!appData.plannerState.teacherBoard.panelOrder.length) {
            appData.plannerState.teacherBoard.panelOrder = appData.teacherProfiles.map((p) => p.id);
            appData.plannerState.teacherBoard.visibleIds = appData.teacherProfiles.map((p) => p.id);
        }
        return appData.teacherProfiles;
    }

    function findTeacherProfileForClass(appData, cls) {
        const row = Array.isArray(cls && cls.classTeachers) && cls.classTeachers[0]
            ? cls.classTeachers[0]
            : null;
        if (!row) return null;
        const profiles = appData.teacherProfiles || [];
        const userId = normalizeStr(row.userId);
        const name = normalizeStr(row.name);
        if (userId) {
            const byUser = profiles.find((p) => normalizeStr(p.userId) === userId || normalizeStr(p.id) === userId);
            if (byUser) return byUser;
        }
        if (name) {
            return profiles.find((p) => normalizeStr(p.name).toLowerCase() === name.toLowerCase()) || null;
        }
        return null;
    }

    /**
     * Build a draft from live classTeachers + meeting slots (calendar schedule).
     */
    function seedDraftFromCalendar(appData, options) {
        const opts = options || {};
        ensurePlannerFields(appData);
        seedTeacherProfilesFromAppData(appData);
        const filters = opts.filters || (appData.plannerState && appData.plannerState.filters);
        const demands = buildDemandsFromAppData(appData, { filters })
            .filter((d) => d.includedInDraft !== false);
        const classesById = new Map((appData.classes || []).map((c) => [c.id, c]));
        const assignments = [];

        demands.forEach((demand) => {
            const cls = classesById.get(demand.classId);
            const teacher = cls ? findTeacherProfileForClass(appData, cls) : null;
            const meetings = (demand.meetings || []).map((m) => ({
                meetingId: uid('mtg'),
                dow: Number(m.dow),
                period: String(m.period)
            }));
            if (!teacher && !meetings.length) return;
            assignments.push({
                assignmentId: uid('asg'),
                demandId: demand.demandId,
                linkGroupId: demand.linkGroupId,
                classId: demand.classId,
                teacherProfileId: teacher ? teacher.id : null,
                userId: teacher ? teacher.userId : null,
                roomId: demand.preferredRoomId || (cls && cls.roomId) || null,
                meetings,
                locked: false,
                manualKeep: true,
                source: 'imported',
                score: { hardOk: true, softScore: 0, tags: ['imported'] }
            });
        });

        const teachers = (appData.teacherProfiles || []).map((t) => defaultTeacherProfile(t));
        const draft = {
            id: uid('draft'),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            label: opts.label || 'From calendar',
            status: 'ready',
            inputSnapshot: {
                teacherProfileIds: teachers.map((t) => t.id),
                includedDemandIds: demands.map((d) => d.demandId),
                rulesVersion: PLANNER_RULES_VERSION,
                source: 'calendar'
            },
            assignments,
            issues: [],
            metrics: {}
        };
        recomputeDraftMetrics(appData, draft);
        return draft;
    }

    function collectClassMeetings(classData, appData) {
        const meetings = [];
        const days = Array.isArray(classData.meetingDays)
            ? classData.meetingDays.map(Number).filter((d) => d >= 1 && d <= 5)
            : [];
        const byWd = classData.periodByWeekday && typeof classData.periodByWeekday === 'object'
            ? classData.periodByWeekday
            : null;
        const basePeriod = parsePeriod(classData.period);

        if (Array.isArray(classData.classTeachers) && classData.classTeachers.length) {
            const row = classData.classTeachers[0];
            if (global.CCPTeacherTimetable && global.CCPTeacherTimetable.getTeacherTimetablePlacements) {
                const placements = global.CCPTeacherTimetable.getTeacherTimetablePlacements(classData, row, appData);
                placements.forEach((pl, idx) => {
                    meetings.push({
                        meetingId: `demand:${classData.id}:m${idx + 1}`,
                        dow: Number(pl.dow),
                        period: String(pl.period)
                    });
                });
                if (meetings.length) return meetings;
            }
        }

        days.forEach((dow, idx) => {
            let period = basePeriod;
            if (byWd && byWd[String(dow)] != null) {
                period = parsePeriod(byWd[String(dow)]);
            }
            if (period == null) return;
            meetings.push({
                meetingId: `demand:${classData.id}:m${idx + 1}`,
                dow,
                period: String(period)
            });
        });
        return meetings;
    }

    function buildDemandsFromAppData(appData, options) {
        const opts = options || {};
        const classes = Array.isArray(appData && appData.classes) ? appData.classes : [];
        const cohorts = Array.isArray(appData && appData.cohorts) ? appData.cohorts : [];
        const demands = [];

        classes.forEach((cls) => {
            if (!cls || !cls.id) return;
            const cohortIds = getClassCohortIds(cls);
            const meetings = collectClassMeetings(cls, appData);
            const cadence = inferCadence(cls.meetingDays, cls.schedulePattern)
                || (cohortIds[0]
                    ? inferCadence(
                        (cohorts.find((c) => c.id === cohortIds[0]) || {}).meetingDays,
                        (cohorts.find((c) => c.id === cohortIds[0]) || {}).schedulePattern
                    )
                    : '');
            const weeklyFrequency = Number(cls.weeklyFrequency) || meetings.length || (Array.isArray(cls.meetingDays) ? cls.meetingDays.length : 0);
            const band = bandFromScheduleBlock(cls.scheduleBlock, cls, cohorts);
            let readiness = 'ready';
            if (!cadence) readiness = 'needsCadence';
            else if (!meetings.length) readiness = 'needsPeriod';
            if (cohortIds.length > 1 && readiness === 'ready') {
                // combined is fine; flag only when user wants review via filter
            }

            const demand = {
                demandId: `demand:${cls.id}`,
                classId: cls.id,
                cohortIds,
                name: normalizeStr(cls.name) || cls.id,
                band,
                level: normalizeStr(cls.levelPreset || cls.level),
                curriculumId: normalizeStr(cls.curriculumId),
                classTypeId: normalizeStr(cls.classTypeId),
                cadence: cadence || 'custom',
                weeklyFrequency: weeklyFrequency >= 2 ? 2 : (weeklyFrequency === 1 ? 1 : meetings.length),
                teacherRequirementType: cls.teacherRequirementType === 'korean' || cls.teacherRequirementType === 'native'
                    ? cls.teacherRequirementType
                    : 'either',
                preferredRoomId: normalizeStr(cls.roomId) || null,
                includedInDraft: cls.plannerExcluded === true ? false : true,
                readiness: meetings.length && cadence ? 'ready' : readiness,
                meetings,
                linkGroupId: `demand:${cls.id}`
            };

            if (opts.filters) {
                const f = opts.filters;
                if (f.band && f.band !== 'all' && demand.band !== f.band) return;
                if (f.cadence && f.cadence !== 'all' && demand.cadence !== f.cadence) return;
                if (f.frequency && f.frequency !== 'all') {
                    const want = f.frequency === '2x' ? 2 : 1;
                    if (demand.weeklyFrequency !== want && demand.meetings.length !== want) return;
                }
                if (f.combinedOnly && demand.cohortIds.length < 2) return;
            }
            demands.push(demand);
        });
        return demands;
    }

    function isSlotBlocked(teacher, dow, period, globalBlockouts) {
        const p = String(period);
        const d = Number(dow);
        const avail = teacher.availability || {};
        if ((avail.unavailableDays || []).map(Number).includes(d)) return 'teacher_day_blocked';
        if ((avail.unavailablePeriods || []).map(String).includes(p)) return 'teacher_period_blocked';
        if ((avail.unavailableSlots || []).some((s) => Number(s.dow) === d && String(s.period) === p)) {
            return 'teacher_slot_blocked';
        }
        const g = globalBlockouts || {};
        if ((g.globalUnavailablePeriods || []).map(String).includes(p)) return 'global_period_blocked';
        if ((g.globalUnavailableSlots || []).some((s) => Number(s.dow) === d && String(s.period) === p)) {
            return 'global_slot_blocked';
        }
        return null;
    }

    function occupancyMap(assignments) {
        const map = new Map();
        (assignments || []).forEach((asg) => {
            (asg.meetings || []).forEach((m) => {
                map.set(`${asg.teacherProfileId}|${slotKey(m.dow, m.period)}`, asg.assignmentId);
            });
        });
        return map;
    }

    function countTeacherLoad(assignments, teacherProfileId) {
        let n = 0;
        (assignments || []).forEach((asg) => {
            if (asg.teacherProfileId === teacherProfileId) n += (asg.meetings || []).length;
        });
        return n;
    }

    function countDayLoad(assignments, teacherProfileId, dow) {
        let n = 0;
        (assignments || []).forEach((asg) => {
            if (asg.teacherProfileId !== teacherProfileId) return;
            (asg.meetings || []).forEach((m) => {
                if (Number(m.dow) === Number(dow)) n += 1;
            });
        });
        return n;
    }

    function hardRejectReasons(teacher, demand, assignments, globalBlockouts) {
        const reasons = [];
        if (demand.teacherRequirementType === 'korean' && teacher.role !== 'korean') {
            reasons.push('wrong_teacher_type');
        }
        if (demand.teacherRequirementType === 'native' && teacher.role !== 'native') {
            reasons.push('wrong_teacher_type');
        }
        if (demand.band === 'junior' && teacher.limits.juniorAllowed === false) {
            reasons.push('wrong_junior_senior_band');
        }
        if (demand.band === 'middle' && teacher.limits.middleAllowed === false) {
            reasons.push('wrong_junior_senior_band');
        }
        if (demand.band === 'senior' && teacher.limits.seniorAllowed === false) {
            reasons.push('wrong_junior_senior_band');
        }
        const never = teacher.preferences.neverCurricula || [];
        if (demand.curriculumId && never.includes(demand.curriculumId)) {
            reasons.push('curriculum_never');
        }
        if (demand.classTypeId && never.includes(demand.classTypeId)) {
            reasons.push('curriculum_never');
        }
        const allowedLevels = teacher.preferences.allowedLevels || [];
        if (allowedLevels.length && demand.level && !allowedLevels.includes(demand.level)) {
            reasons.push('level_not_allowed');
        }

        const occ = occupancyMap(assignments);
        const meetings = demand.meetings || [];
        if (!meetings.length) {
            reasons.push('missing_required_meetings');
        }
        if (weeklyNeed(demand) >= 2 && hasDuplicateWeekday(meetings)) {
            reasons.push('duplicate_weekday_2x');
        }
        meetings.forEach((m) => {
            const blocked = isSlotBlocked(teacher, m.dow, m.period, globalBlockouts);
            if (blocked) reasons.push(blocked);
            if (occ.has(`${teacher.id}|${slotKey(m.dow, m.period)}`)) {
                reasons.push('teacher_double_booked');
            }
            if (countDayLoad(assignments, teacher.id, m.dow) + 1 > teacher.limits.maxPeriodsPerDay) {
                reasons.push('max_periods_per_day');
            }
        });
        // maxPeriodsPerWeek is soft (surfaced in recomputeDraftIssues), not a hard reject
        return [...new Set(reasons)];
    }

    /**
     * Validate placing one period of a demand/assignment onto a teacher cell.
     * Only missing_context is hard; all other checks are soft warnings (permissive DnD).
     * excludeAssignmentIds: assignments whose meetings are ignored for conflict (self / swap partner).
     */
    function isValidPlacement(appData, teacher, demand, dow, period, assignments, options) {
        const opts = options || {};
        const excludeIds = new Set((opts.excludeAssignmentIds || []).map(String));
        const lockOn = opts.lockToCohortDays != null
            ? !!opts.lockToCohortDays
            : !!(appData.plannerState && appData.plannerState.lockToCohortDays === true);
        const globalBlockouts = (appData.plannerState && appData.plannerState.blockouts) || {};
        const softReasons = [];

        if (!teacher || !demand) {
            return {
                ok: false,
                reasons: ['missing_context'],
                hardReasons: ['missing_context'],
                softReasons: [],
                warnOutOfBlock: false
            };
        }
        if (demand.teacherRequirementType === 'korean' && teacher.role !== 'korean') {
            softReasons.push('wrong_teacher_type');
        }
        if (demand.teacherRequirementType === 'native' && teacher.role !== 'native') {
            softReasons.push('wrong_teacher_type');
        }
        if (demand.band === 'junior' && teacher.limits.juniorAllowed === false) softReasons.push('wrong_junior_senior_band');
        if (demand.band === 'middle' && teacher.limits.middleAllowed === false) softReasons.push('wrong_junior_senior_band');
        if (demand.band === 'senior' && teacher.limits.seniorAllowed === false) softReasons.push('wrong_junior_senior_band');

        const blocked = isSlotBlocked(teacher, dow, period, globalBlockouts);
        if (blocked) {
            return {
                ok: false,
                reasons: [blocked],
                hardReasons: [blocked],
                softReasons: [],
                warnOutOfBlock: false
            };
        }

        const days = cohortMeetingDays(appData, demand);
        if (days.length && !days.includes(Number(dow))) {
            softReasons.push('outside_cohort_days');
        }
        if (lockOn && days.length && !days.includes(Number(dow))) {
            // lock is advisory only — already in softReasons
        }

        const others = (assignments || []).filter((a) => !excludeIds.has(String(a.assignmentId)));
        const occ = occupancyMap(others);
        if (occ.has(`${teacher.id}|${slotKey(dow, period)}`)) {
            softReasons.push('teacher_double_booked');
        }

        const cohortIds = new Set(demand.cohortIds || []);
        others.forEach((asg) => {
            const d = opts.demandById && opts.demandById.get(asg.demandId);
            if (!d) return;
            const overlap = (d.cohortIds || []).some((cid) => cohortIds.has(cid));
            if (!overlap) return;
            if ((asg.meetings || []).some((m) => Number(m.dow) === Number(dow) && String(m.period) === String(period))) {
                softReasons.push('cohort_double_booked');
            }
        });

        if (countDayLoad(others, teacher.id, dow) + 1 > (teacher.limits.maxPeriodsPerDay || 99)) {
            softReasons.push('max_periods_per_day');
        }

        const existing = (assignments || []).find((a) => a.demandId === demand.demandId && !excludeIds.has(String(a.assignmentId)));
        if (existing) {
            if (existing.teacherProfileId && existing.teacherProfileId !== teacher.id) {
                softReasons.push('teacher_reassigned');
            }
            const need = weeklyNeed(demand);
            const meetings = assignmentMeetings(existing);
            if (meetings.length >= need && !opts.replacingSlot) {
                softReasons.push('weekly_complete');
            }
            const nextMeetings = opts.replacingSlot
                ? meetings.concat([{ dow: Number(dow), period: String(period) }])
                : meetings.concat([{ dow: Number(dow), period: String(period) }]);
            if (need >= 2 && hasDuplicateWeekday(nextMeetings)) {
                softReasons.push('duplicate_weekday_2x');
            }
        }

        const warnOutOfBlock = isOutOfBlock(demand.band, period);
        const uniqueSoft = [...new Set(softReasons)];
        return {
            ok: true,
            reasons: uniqueSoft,
            hardReasons: [],
            softReasons: uniqueSoft,
            warnOutOfBlock
        };
    }

    function canSwapPeriods(appData, draft, draggedAsgId, targetAsgId, toDow, toPeriod, fromDow, fromPeriod) {
        const assignments = (draft && draft.assignments) || [];
        const dragged = assignments.find((a) => a.assignmentId === draggedAsgId);
        const target = assignments.find((a) => a.assignmentId === targetAsgId);
        if (!dragged || !target) {
            return { ok: false, reasons: ['missing_assignment'], hardReasons: ['missing_assignment'], softReasons: [] };
        }
        const demands = buildDemandsFromAppData(appData);
        const demandById = new Map(demands.map((d) => [d.demandId, d]));
        const teachers = appData.teacherProfiles || [];
        // Destination teachers: dragged goes to target's grid; target goes to dragged's grid
        const toTeacher = teachers.find((t) => t.id === target.teacherProfileId)
            || teachers.find((t) => t.id === dragged.teacherProfileId);
        const fromTeacher = teachers.find((t) => t.id === dragged.teacherProfileId)
            || teachers.find((t) => t.id === target.teacherProfileId);
        const dragDemand = demandById.get(dragged.demandId);
        const targetDemand = demandById.get(target.demandId);
        const exclude = [dragged.assignmentId, target.assignmentId];
        const draggedOk = isValidPlacement(appData, toTeacher, dragDemand, toDow, toPeriod, assignments, {
            excludeAssignmentIds: exclude,
            demandById,
            replacingSlot: true
        });
        const targetOk = isValidPlacement(appData, fromTeacher, targetDemand, fromDow, fromPeriod, assignments, {
            excludeAssignmentIds: exclude,
            demandById,
            replacingSlot: true
        });
        const soft = [...new Set([...(draggedOk.softReasons || draggedOk.reasons || []), ...(targetOk.softReasons || targetOk.reasons || [])])];
        return {
            ok: draggedOk.ok && targetOk.ok,
            reasons: soft,
            softReasons: soft,
            warnOutOfBlock: !!(draggedOk.warnOutOfBlock || targetOk.warnOutOfBlock)
        };
    }

    function placePeriodOnTeacher(appData, draft, demandId, teacherProfileId, dow, period) {
        ensurePlannerFields(appData);
        const demands = buildDemandsFromAppData(appData);
        const demand = demands.find((d) => d.demandId === demandId);
        const teacher = (appData.teacherProfiles || []).find((t) => t.id === teacherProfileId);
        if (!draft || !demand || !teacher) return { ok: false, reason: 'missing_context' };
        const demandById = new Map(demands.map((d) => [d.demandId, d]));
        const check = isValidPlacement(appData, teacher, demand, dow, period, draft.assignments, { demandById });
        if (!check.ok) return { ok: false, reason: check.reasons[0] || 'invalid', reasons: check.reasons };

        let asg = draft.assignments.find((a) => a.demandId === demandId);
        if (!asg) {
            asg = {
                assignmentId: uid('asg'),
                demandId: demand.demandId,
                linkGroupId: demand.linkGroupId,
                classId: demand.classId,
                teacherProfileId: teacher.id,
                userId: teacher.userId,
                roomId: demand.preferredRoomId || null,
                meetings: [],
                locked: false,
                manualKeep: true,
                source: 'manual',
                score: { hardOk: true, softScore: 0, tags: [] }
            };
            draft.assignments.push(asg);
        }
        asg.teacherProfileId = teacher.id;
        asg.userId = teacher.userId;
        asg.manualKeep = true;
        asg.source = 'manual';
        asg.meetings = assignmentMeetings(asg).concat([{
            meetingId: uid('mtg'),
            dow: Number(dow),
            period: String(period)
        }]);
        if (check.warnOutOfBlock || (check.softReasons && check.softReasons.length)) {
            asg.score = asg.score || {};
            asg.score.tags = [...new Set([
                ...(asg.score.tags || []),
                ...(check.warnOutOfBlock ? ['outside band block'] : []),
                ...(check.softReasons || [])
            ])];
        }
        draft.updatedAt = new Date().toISOString();
        recomputeDraftMetrics(appData, draft);
        return {
            ok: true,
            warnOutOfBlock: check.warnOutOfBlock,
            softReasons: check.softReasons || [],
            assignmentId: asg.assignmentId
        };
    }

    function movePeriod(appData, draft, assignmentId, fromDow, fromPeriod, toTeacherId, toDow, toPeriod) {
        const asg = (draft.assignments || []).find((a) => a.assignmentId === assignmentId);
        if (!asg) return { ok: false, reason: 'missing_assignment' };
        const demands = buildDemandsFromAppData(appData);
        const demand = demands.find((d) => d.demandId === asg.demandId);
        const teacher = (appData.teacherProfiles || []).find((t) => t.id === toTeacherId);
        if (!teacher || !demand) return { ok: false, reason: 'missing_context' };
        const demandById = new Map(demands.map((d) => [d.demandId, d]));
        const saved = assignmentMeetings(asg).slice();
        asg.meetings = saved.filter((m) => !(Number(m.dow) === Number(fromDow) && String(m.period) === String(fromPeriod)));
        const check = isValidPlacement(appData, teacher, demand, toDow, toPeriod, draft.assignments, {
            demandById,
            excludeAssignmentIds: [asg.assignmentId],
            replacingSlot: true
        });
        if (!check.ok) {
            asg.meetings = saved;
            return { ok: false, reason: check.reasons[0] || 'invalid', reasons: check.reasons };
        }
        // Single-teacher model: reassign whole assignment to destination teacher
        asg.teacherProfileId = toTeacherId;
        asg.userId = teacher.userId;
        asg.meetings = asg.meetings.concat([{ meetingId: uid('mtg'), dow: Number(toDow), period: String(toPeriod) }]);
        asg.manualKeep = true;
        asg.source = 'manual';
        draft.updatedAt = new Date().toISOString();
        recomputeDraftMetrics(appData, draft);
        return { ok: true, warnOutOfBlock: check.warnOutOfBlock, softReasons: check.softReasons || [] };
    }

    function removePeriod(appData, draft, assignmentId, dow, period) {
        const asg = (draft.assignments || []).find((a) => a.assignmentId === assignmentId);
        if (!asg) return { ok: false, reason: 'missing_assignment' };
        asg.meetings = assignmentMeetings(asg).filter(
            (m) => !(Number(m.dow) === Number(dow) && String(m.period) === String(period))
        );
        asg.manualKeep = true;
        asg.source = 'manual';
        draft.updatedAt = new Date().toISOString();
        recomputeDraftMetrics(appData, draft);
        return { ok: true };
    }

    function swapPeriodCells(appData, draft, draggedAsgId, targetAsgId, toDow, toPeriod, fromDow, fromPeriod) {
        const check = canSwapPeriods(appData, draft, draggedAsgId, targetAsgId, toDow, toPeriod, fromDow, fromPeriod);
        if (!check.ok) return { ok: false, reasons: check.reasons };
        const dragged = draft.assignments.find((a) => a.assignmentId === draggedAsgId);
        const target = draft.assignments.find((a) => a.assignmentId === targetAsgId);
        const dMeet = assignmentMeetings(dragged).map((m) => Object.assign({}, m));
        const tMeet = assignmentMeetings(target).map((m) => Object.assign({}, m));
        const dIdx = dMeet.findIndex((m) => Number(m.dow) === Number(fromDow) && String(m.period) === String(fromPeriod));
        const tIdx = tMeet.findIndex((m) => Number(m.dow) === Number(toDow) && String(m.period) === String(toPeriod));
        if (dIdx < 0 || tIdx < 0) return { ok: false, reason: 'slot_missing' };
        dMeet[dIdx] = { meetingId: uid('mtg'), dow: Number(toDow), period: String(toPeriod) };
        tMeet[tIdx] = { meetingId: uid('mtg'), dow: Number(fromDow), period: String(fromPeriod) };
        dragged.meetings = dMeet;
        target.meetings = tMeet;
        if (dragged.teacherProfileId !== target.teacherProfileId) {
            const tId = dragged.teacherProfileId;
            const uId = dragged.userId;
            dragged.teacherProfileId = target.teacherProfileId;
            dragged.userId = target.userId;
            target.teacherProfileId = tId;
            target.userId = uId;
        }
        dragged.manualKeep = true;
        target.manualKeep = true;
        dragged.source = 'manual';
        target.source = 'manual';
        draft.updatedAt = new Date().toISOString();
        recomputeDraftMetrics(appData, draft);
        return { ok: true, warnOutOfBlock: check.warnOutOfBlock, softReasons: check.softReasons || [] };
    }

    function setAssignmentTeacher(appData, draft, demandId, teacherProfileId) {
        const teacher = (appData.teacherProfiles || []).find((t) => t.id === teacherProfileId);
        const demand = buildDemandsFromAppData(appData).find((d) => d.demandId === demandId);
        if (!teacher || !demand || !draft) return { ok: false, reason: 'missing_context' };
        let asg = draft.assignments.find((a) => a.demandId === demandId);
        if (!asg) {
            asg = {
                assignmentId: uid('asg'),
                demandId: demand.demandId,
                linkGroupId: demand.linkGroupId,
                classId: demand.classId,
                teacherProfileId: teacher.id,
                userId: teacher.userId,
                roomId: demand.preferredRoomId || null,
                meetings: [],
                locked: false,
                manualKeep: true,
                source: 'manual',
                score: { hardOk: true, softScore: 0, tags: [] }
            };
            draft.assignments.push(asg);
        } else {
            asg.teacherProfileId = teacher.id;
            asg.userId = teacher.userId;
            asg.manualKeep = true;
            asg.source = 'manual';
        }
        draft.updatedAt = new Date().toISOString();
        recomputeDraftMetrics(appData, draft);
        return { ok: true, assignmentId: asg.assignmentId };
    }

    function recomputeDraftMetrics(appData, draft) {
        if (!draft) return draft;
        const teachers = (appData.teacherProfiles || []).map((t) => defaultTeacherProfile(t));
        const demands = buildDemandsFromAppData(appData).filter((d) => d.includedInDraft !== false);
        const demandById = new Map(demands.map((d) => [d.demandId, d]));
        const issues = [];
        const lockOn = !!(appData.plannerState && appData.plannerState.lockToCohortDays === true);

        (draft.assignments || []).forEach((asg) => {
            const demand = demandById.get(asg.demandId);
            if (!demand) return;
            const teacher = teachers.find((t) => t.id === asg.teacherProfileId);
            const meetings = assignmentMeetings(asg);
            if (weeklyNeed(demand) >= 2 && hasDuplicateWeekday(meetings)) {
                issues.push(createIssue({
                    severity: 'soft',
                    code: 'duplicate_weekday_2x',
                    message: `${demand.name}: 2× class needs two different days.`,
                    assignmentId: asg.assignmentId,
                    demandId: demand.demandId
                }));
            }
            if (teacher && demand) {
                if (demand.teacherRequirementType === 'korean' && teacher.role !== 'korean') {
                    issues.push(createIssue({
                        severity: 'soft',
                        code: 'wrong_teacher_type',
                        message: `${demand.name}: prefers a Korean teacher.`,
                        assignmentId: asg.assignmentId,
                        demandId: demand.demandId,
                        teacherProfileId: teacher.id
                    }));
                }
                if (demand.teacherRequirementType === 'native' && teacher.role !== 'native') {
                    issues.push(createIssue({
                        severity: 'soft',
                        code: 'wrong_teacher_type',
                        message: `${demand.name}: prefers a native teacher.`,
                        assignmentId: asg.assignmentId,
                        demandId: demand.demandId,
                        teacherProfileId: teacher.id
                    }));
                }
                if (demand.band === 'junior' && teacher.limits.juniorAllowed === false) {
                    issues.push(createIssue({
                        severity: 'soft',
                        code: 'wrong_junior_senior_band',
                        message: `${demand.name}: teacher is not set for junior band.`,
                        assignmentId: asg.assignmentId,
                        teacherProfileId: teacher.id
                    }));
                }
                if (demand.band === 'middle' && teacher.limits.middleAllowed === false) {
                    issues.push(createIssue({
                        severity: 'soft',
                        code: 'wrong_junior_senior_band',
                        message: `${demand.name}: teacher is not set for middle band.`,
                        assignmentId: asg.assignmentId,
                        teacherProfileId: teacher.id
                    }));
                }
                if (demand.band === 'senior' && teacher.limits.seniorAllowed === false) {
                    issues.push(createIssue({
                        severity: 'soft',
                        code: 'wrong_junior_senior_band',
                        message: `${demand.name}: teacher is not set for senior band.`,
                        assignmentId: asg.assignmentId,
                        teacherProfileId: teacher.id
                    }));
                }
            }
            meetings.forEach((m) => {
                if (isOutOfBlock(demand.band, m.period)) {
                    issues.push(createIssue({
                        severity: 'soft',
                        code: 'outside_band_block',
                        message: `${demand.name} is outside its ${demand.band} block (D${m.dow} P${m.period}).`,
                        assignmentId: asg.assignmentId,
                        demandId: demand.demandId,
                        teacherProfileId: asg.teacherProfileId
                    }));
                }
                const days = cohortMeetingDays(appData, demand);
                if (days.length && !days.includes(Number(m.dow))) {
                    issues.push(createIssue({
                        severity: 'soft',
                        code: 'outside_cohort_days',
                        message: lockOn
                            ? `${demand.name}: outside cohort days (lock on — warning only).`
                            : `${demand.name}: placed on a day outside cohort days.`,
                        assignmentId: asg.assignmentId,
                        demandId: demand.demandId
                    }));
                }
            });
            if (!asg.roomId) {
                issues.push(createIssue({
                    severity: 'soft',
                    code: 'room_unresolved',
                    message: `${demand.name}: no room assigned.`,
                    assignmentId: asg.assignmentId,
                    demandId: demand.demandId,
                    suggestedAction: 'assignRoom'
                }));
            } else {
                const others = (draft.assignments || []).filter((a) => a.assignmentId !== asg.assignmentId);
                if (roomConflictsFor(asg, asg.roomId, others).length) {
                    issues.push(createIssue({
                        severity: 'soft',
                        code: 'room_conflict',
                        message: `${demand.name}: room conflict.`,
                        assignmentId: asg.assignmentId,
                        demandId: demand.demandId,
                        suggestedAction: 'reassign'
                    }));
                }
            }
            const need = weeklyNeed(demand);
            if (meetings.length < need) {
                issues.push(createIssue({
                    severity: 'soft',
                    code: 'incomplete_placements',
                    message: `${demand.name} needs ${need - meetings.length} more period(s).`,
                    assignmentId: asg.assignmentId,
                    demandId: demand.demandId
                }));
            }
        });

        demands.forEach((d) => {
            const asg = (draft.assignments || []).find((a) => a.demandId === d.demandId);
            if (!asg || !asg.teacherProfileId) {
                issues.push(createIssue({
                    severity: 'soft',
                    code: 'no_teacher',
                    message: `${d.name}: no teacher yet.`,
                    demandId: d.demandId
                }));
            }
        });

        teachers.forEach((t) => {
            const assigned = countTeacherLoad(draft.assignments, t.id);
            if (assigned > (t.limits.maxPeriodsPerWeek || 0)) {
                issues.push(createIssue({
                    severity: 'soft',
                    code: 'over_load',
                    message: `${t.name} is over load target (${assigned}/${t.limits.maxPeriodsPerWeek}).`,
                    teacherProfileId: t.id
                }));
            }
            const byDay = {};
            (draft.assignments || []).forEach((asg) => {
                if (asg.teacherProfileId !== t.id) return;
                assignmentMeetings(asg).forEach((m) => {
                    const d = Number(m.dow);
                    byDay[d] = (byDay[d] || 0) + 1;
                });
            });
            Object.keys(byDay).forEach((d) => {
                if (byDay[d] > (t.limits.maxPeriodsPerDay || 99)) {
                    issues.push(createIssue({
                        severity: 'soft',
                        code: 'max_periods_per_day',
                        message: `${t.name}: over max periods on day ${d} (${byDay[d]}/${t.limits.maxPeriodsPerDay}).`,
                        teacherProfileId: t.id
                    }));
                }
            });
        });

        // Soft: teacher double-book
        const occ = new Map();
        (draft.assignments || []).forEach((asg) => {
            assignmentMeetings(asg).forEach((m) => {
                const key = `${asg.teacherProfileId}|${slotKey(m.dow, m.period)}`;
                if (occ.has(key)) {
                    issues.push(createIssue({
                        severity: 'soft',
                        code: 'teacher_double_booked',
                        message: `Teacher double-booked at D${m.dow} P${m.period}.`,
                        assignmentId: asg.assignmentId,
                        teacherProfileId: asg.teacherProfileId
                    }));
                } else occ.set(key, asg.assignmentId);
            });
        });

        // Soft: cohort double-book
        const cohortOcc = new Map();
        (draft.assignments || []).forEach((asg) => {
            const demand = demandById.get(asg.demandId);
            if (!demand) return;
            assignmentMeetings(asg).forEach((m) => {
                (demand.cohortIds || []).forEach((cid) => {
                    const key = `${cid}|${slotKey(m.dow, m.period)}`;
                    if (cohortOcc.has(key) && cohortOcc.get(key) !== asg.assignmentId) {
                        issues.push(createIssue({
                            severity: 'soft',
                            code: 'cohort_double_booked',
                            message: `${demand.name}: cohort overlap at D${m.dow} P${m.period}.`,
                            assignmentId: asg.assignmentId,
                            demandId: demand.demandId
                        }));
                    } else {
                        cohortOcc.set(key, asg.assignmentId);
                    }
                });
            });
        });

        const teacherLoads = {};
        teachers.forEach((t) => {
            const assigned = countTeacherLoad(draft.assignments, t.id);
            teacherLoads[t.id] = {
                assigned,
                min: t.limits.minPeriodsPerWeek,
                max: t.limits.maxPeriodsPerWeek,
                junior: (draft.assignments || []).filter((a) => a.teacherProfileId === t.id && (demandById.get(a.demandId) || {}).band === 'junior')
                    .reduce((n, a) => n + assignmentMeetings(a).length, 0),
                middle: (draft.assignments || []).filter((a) => a.teacherProfileId === t.id && (demandById.get(a.demandId) || {}).band === 'middle')
                    .reduce((n, a) => n + assignmentMeetings(a).length, 0),
                senior: (draft.assignments || []).filter((a) => a.teacherProfileId === t.id && (demandById.get(a.demandId) || {}).band === 'senior')
                    .reduce((n, a) => n + assignmentMeetings(a).length, 0)
            };
        });

        const assignedComplete = demands.filter((d) => {
            const asg = (draft.assignments || []).find((a) => a.demandId === d.demandId);
            return asg && assignmentMeetings(asg).length >= weeklyNeed(d);
        }).length;

        draft.issues = issues;
        draft.metrics = {
            assignedCount: assignedComplete,
            unassignedCount: Math.max(0, demands.length - assignedComplete),
            hardIssueCount: issues.filter((i) => i.severity === 'hard').length,
            softIssueCount: issues.filter((i) => i.severity === 'soft').length,
            teacherLoads,
            roomUnresolvedCount: (draft.assignments || []).filter((a) => !a.roomId).length
        };
        draft.status = draft.metrics.hardIssueCount ? 'hasIssues' : 'ready';
        return draft;
    }

    function softScore(teacher, demand, assignments) {
        let score = 0;
        const tags = [];
        const prefs = teacher.preferences || {};
        const learned = teacher.learnedPreferences || {};

        if (demand.level && (prefs.preferredLevels || []).includes(demand.level)) {
            score += SOFT_WEIGHTS.preferredLevel;
            tags.push('preferred level matched');
        }
        if (demand.curriculumId && (prefs.preferredCurricula || []).includes(demand.curriculumId)) {
            score += SOFT_WEIGHTS.preferredCurriculum;
            tags.push('preferred curriculum matched');
        }
        if (demand.classTypeId && (prefs.preferredCurricula || []).includes(demand.classTypeId)) {
            score += SOFT_WEIGHTS.preferredCurriculum;
        }
        (demand.cohortIds || []).forEach((cid) => {
            if ((prefs.preferredCohortIds || []).includes(cid)) {
                score += SOFT_WEIGHTS.preferredCohort;
                tags.push('preferred cohort matched');
            }
            const learnedCohort = Number(learned.preferredCohortIds && learned.preferredCohortIds[cid]) || 0;
            if (learnedCohort > 0) {
                score += Math.min(SOFT_WEIGHTS.learnedBonusMax, learnedCohort);
                tags.push('learned preference: cohort');
            }
        });
        if (demand.classTypeId) {
            const learnedCt = Number(learned.preferredClassTypeIds && learned.preferredClassTypeIds[demand.classTypeId]) || 0;
            if (learnedCt > 0) {
                score += Math.min(SOFT_WEIGHTS.learnedBonusMax, learnedCt);
                tags.push('learned preference: class type');
            }
        }
        if ((prefs.preferCadence || []).includes(demand.cadence)) {
            score += SOFT_WEIGHTS.preferredCadence;
        } else if ((prefs.preferCadence || []).length) {
            tags.push('outside preferred cadence');
        }
        const freqKey = demand.weeklyFrequency >= 2 || demand.meetings.length >= 2 ? '2x' : '1x';
        if ((prefs.preferFrequency || []).includes(freqKey)) {
            score += SOFT_WEIGHTS.preferredFrequency;
        }

        (demand.meetings || []).forEach((m) => {
            const dow = Number(m.dow);
            const period = String(m.period);
            if ((prefs.preferredDays || []).map(Number).includes(dow)) score += SOFT_WEIGHTS.preferredDay;
            if ((prefs.discouragedDays || []).map(Number).includes(dow)) {
                score += SOFT_WEIGHTS.discouragedDay;
                tags.push('used discouraged day');
            }
            if ((prefs.preferredPeriods || []).map(String).includes(period)) score += SOFT_WEIGHTS.preferredPeriod;
            if ((prefs.discouragedPeriods || []).map(String).includes(period)) {
                score += SOFT_WEIGHTS.discouragedPeriod;
                tags.push('used discouraged period');
            }
            if (prefs.avoidFirstPeriod && period === '1') {
                score += SOFT_WEIGHTS.avoidFirstLast;
                tags.push('avoid first period');
            }
            if (prefs.avoidLastPeriod && (period === '7' || period === '6')) {
                score += SOFT_WEIGHTS.avoidFirstLast;
                tags.push('avoid last period');
            }
            const perNum = parsePeriod(period) || 0;
            if (prefs.morningPreferred && perNum >= 1 && perNum <= 3) score += SOFT_WEIGHTS.morningAfternoon;
            if (prefs.afternoonPreferred && perNum >= 4) score += SOFT_WEIGHTS.morningAfternoon;
            const learnedSlot = Number(learned.preferredSlots && learned.preferredSlots[slotKey(dow, period)]) || 0;
            if (learnedSlot > 0) score += Math.min(3, learnedSlot);
            const avoidedSlot = Number(learned.avoidedSlots && learned.avoidedSlots[slotKey(dow, period)]) || 0;
            if (avoidedSlot > 0) score -= Math.min(3, avoidedSlot);
        });

        const load = countTeacherLoad(assignments, teacher.id) + (demand.meetings || []).length;
        const min = teacher.limits.minPeriodsPerWeek || 0;
        const max = teacher.limits.maxPeriodsPerWeek || 99;
        const mid = (min + max) / 2;
        if (Math.abs(load - mid) <= 2) score += SOFT_WEIGHTS.towardWeeklyTarget;
        if (load > max - 1) score += SOFT_WEIGHTS.aboveTarget;
        if (min > 0 && load < min) score += SOFT_WEIGHTS.belowTargetOpportunity;

        if (demand.cohortIds.length > 1 && prefs.preferCombinedClasses === 'no') {
            score -= 3;
        }
        if (demand.cohortIds.length > 1 && prefs.preferCombinedClasses === 'yes') {
            score += 3;
        }
        if (!demand.preferredRoomId) {
            score += SOFT_WEIGHTS.roomUnresolved;
            tags.push('room unresolved');
        }

        return { softScore: score, tags: [...new Set(tags)] };
    }

    function demandDifficulty(demand) {
        let d = 0;
        if (demand.teacherRequirementType !== 'either') d += 30;
        if ((demand.meetings || []).length >= 2) d += 20;
        if ((demand.cohortIds || []).length > 1) d += 15;
        if (demand.teacherRequirementType === 'native') d += 10;
        d += (demand.meetings || []).length;
        return d;
    }

    function createIssue(partial) {
        return Object.assign({
            id: uid('issue'),
            severity: 'hard',
            code: 'unknown',
            message: '',
            teacherProfileId: null,
            assignmentId: null,
            demandId: null,
            meetingId: null,
            suggestedAction: 'reassign'
        }, partial || {});
    }

    function generateDraft(appData, options) {
        const opts = options || {};
        ensurePlannerFields(appData);
        const teachers = (appData.teacherProfiles || []).map((t) => defaultTeacherProfile(t));
        const globalBlockouts = (appData.plannerState && appData.plannerState.blockouts) || {};
        const demands = buildDemandsFromAppData(appData, { filters: opts.filters || (appData.plannerState && appData.plannerState.filters) })
            .filter((d) => d.includedInDraft !== false);

        const prior = opts.priorAssignments || [];
        const lockedOrKept = prior.filter((a) => a.locked || a.manualKeep);
        const assignments = lockedOrKept.map((a) => Object.assign({}, a, {
            meetings: (a.meetings || []).map((m) => Object.assign({}, m))
        }));
        const issues = [];
        const covered = new Set(assignments.map((a) => a.demandId));

        const unassigned = demands
            .filter((d) => !covered.has(d.demandId))
            .filter((d) => {
                if (opts.onlyUnresolved) return true;
                if (opts.teacherProfileId) return true;
                if (opts.band && d.band !== opts.band) return false;
                return true;
            })
            .sort((a, b) => demandDifficulty(b) - demandDifficulty(a));

        // Capacity precheck
        const totalMeetings = demands.reduce((n, d) => n + (d.meetings || []).length, 0);
        const totalCapacity = teachers.reduce((n, t) => n + (t.limits.maxPeriodsPerWeek || 0), 0);
        if (totalMeetings > totalCapacity) {
            issues.push(createIssue({
                code: 'capacity_exceeded',
                message: `Demanded periods (${totalMeetings}) exceed teacher capacity (${totalCapacity}).`,
                suggestedAction: 'openDemand'
            }));
        }

        unassigned.forEach((demand) => {
            if (demand.readiness !== 'ready') {
                issues.push(createIssue({
                    code: demand.readiness,
                    message: `${demand.name} is not ready (${demand.readiness}).`,
                    demandId: demand.demandId,
                    suggestedAction: 'openDemand'
                }));
                return;
            }

            let eligibleTeachers = teachers;
            if (opts.teacherProfileId) {
                eligibleTeachers = teachers.filter((t) => t.id === opts.teacherProfileId);
            }

            const candidates = [];
            const rejectSummary = [];
            eligibleTeachers.forEach((teacher) => {
                const hard = hardRejectReasons(teacher, demand, assignments, globalBlockouts);
                if (hard.length) {
                    rejectSummary.push({ teacherProfileId: teacher.id, reasons: hard });
                    return;
                }
                const soft = softScore(teacher, demand, assignments);
                candidates.push({
                    teacher,
                    softScore: soft.softScore,
                    tags: soft.tags
                });
            });
            candidates.sort((a, b) => b.softScore - a.softScore);

            if (!candidates.length) {
                const topReasons = rejectSummary[0] ? rejectSummary[0].reasons.join(', ') : 'no eligible teacher';
                issues.push(createIssue({
                    code: 'unassigned',
                    message: `Could not assign ${demand.name}: ${topReasons}`,
                    demandId: demand.demandId,
                    teacherProfileId: rejectSummary[0] && rejectSummary[0].teacherProfileId,
                    suggestedAction: 'reassign'
                }));
                return;
            }

            const best = candidates[0];
            const assignment = {
                assignmentId: uid('asg'),
                demandId: demand.demandId,
                linkGroupId: demand.linkGroupId,
                classId: demand.classId,
                teacherProfileId: best.teacher.id,
                userId: best.teacher.userId,
                roomId: demand.preferredRoomId || null,
                meetings: demand.meetings.map((m) => Object.assign({}, m)),
                locked: false,
                manualKeep: false,
                source: 'auto',
                score: {
                    hardOk: true,
                    softScore: best.softScore,
                    tags: best.tags
                }
            };
            assignments.push(assignment);
            best.tags.filter((t) => t !== 'preferred level matched' && t !== 'preferred curriculum matched')
                .forEach((tag) => {
                    if (tag.startsWith('used discouraged') || tag.startsWith('avoid ') || tag === 'outside preferred cadence' || tag === 'room unresolved') {
                        issues.push(createIssue({
                            severity: 'soft',
                            code: 'soft_warning',
                            message: `${demand.name}: ${tag}`,
                            assignmentId: assignment.assignmentId,
                            demandId: demand.demandId,
                            teacherProfileId: best.teacher.id,
                            suggestedAction: 'keepLocked'
                        }));
                    }
                });
        });

        // Local improvement: try swaps that raise combined soft score
        localImproveSwaps(assignments, demands, teachers, globalBlockouts);

        // Soft room recommendation (never undoes teacher placement)
        const rooms = Array.isArray(appData.rooms) ? appData.rooms : [];
        recommendRooms(assignments, demands, rooms, issues);

        const draft = {
            id: uid('draft'),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            label: opts.label || 'Draft',
            status: 'ready',
            inputSnapshot: {
                teacherProfileIds: teachers.map((t) => t.id),
                includedDemandIds: demands.map((d) => d.demandId),
                rulesVersion: PLANNER_RULES_VERSION
            },
            assignments,
            issues,
            metrics: {}
        };
        // Merge generate-time issues then recompute soft/hard from current placements
        const baseIssues = issues.slice();
        recomputeDraftMetrics(appData, draft);
        draft.issues = baseIssues.concat(draft.issues || []);
        draft.metrics.hardIssueCount = draft.issues.filter((i) => i.severity === 'hard').length;
        draft.metrics.softIssueCount = draft.issues.filter((i) => i.severity === 'soft').length;
        draft.status = draft.metrics.hardIssueCount ? 'hasIssues' : 'ready';
        return draft;
    }

    function roomOccupancy(assignments) {
        const map = new Map();
        (assignments || []).forEach((asg) => {
            if (!asg.roomId) return;
            (asg.meetings || []).forEach((m) => {
                map.set(`${asg.roomId}|${slotKey(m.dow, m.period)}`, asg.assignmentId);
            });
        });
        return map;
    }

    function roomConflictsFor(assignment, roomId, otherAssignments) {
        if (!roomId) return ['room_missing'];
        const occ = roomOccupancy(otherAssignments);
        const conflicts = [];
        (assignment.meetings || []).forEach((m) => {
            const key = `${roomId}|${slotKey(m.dow, m.period)}`;
            if (occ.has(key) && occ.get(key) !== assignment.assignmentId) {
                conflicts.push('room_double_booked');
            }
        });
        return [...new Set(conflicts)];
    }

    function recommendRooms(assignments, demands, rooms, issues) {
        if (!rooms || !rooms.length) {
            assignments.forEach((asg) => {
                if (asg.roomId) return;
                const demand = (demands || []).find((d) => d.demandId === asg.demandId);
                issues.push(createIssue({
                    severity: 'soft',
                    code: 'room_unresolved',
                    message: `${(demand && demand.name) || asg.classId}: no rooms in catalog`,
                    assignmentId: asg.assignmentId,
                    demandId: asg.demandId,
                    suggestedAction: 'openDemand'
                }));
            });
            return;
        }
        assignments.forEach((asg) => {
            if (asg.roomId) {
                const others = assignments.filter((a) => a.assignmentId !== asg.assignmentId);
                const conflicts = roomConflictsFor(asg, asg.roomId, others);
                if (conflicts.length) {
                    issues.push(createIssue({
                        severity: 'soft',
                        code: 'room_conflict',
                        message: `Room conflict for ${asg.classId}`,
                        assignmentId: asg.assignmentId,
                        demandId: asg.demandId,
                        suggestedAction: 'reassign'
                    }));
                }
                return;
            }
            const demand = (demands || []).find((d) => d.demandId === asg.demandId);
            const preferred = demand && demand.preferredRoomId;
            const candidates = rooms.slice().sort((a, b) => {
                if (preferred && a.id === preferred) return -1;
                if (preferred && b.id === preferred) return 1;
                return (a.sortOrder || 0) - (b.sortOrder || 0);
            });
            const others = assignments.filter((a) => a.assignmentId !== asg.assignmentId);
            let placed = false;
            for (let i = 0; i < candidates.length; i += 1) {
                const room = candidates[i];
                if (roomConflictsFor(asg, room.id, others).length) continue;
                asg.roomId = room.id;
                placed = true;
                break;
            }
            if (!placed) {
                issues.push(createIssue({
                    severity: 'soft',
                    code: 'room_unresolved',
                    message: `${(demand && demand.name) || asg.classId}: room unresolved`,
                    assignmentId: asg.assignmentId,
                    demandId: asg.demandId,
                    suggestedAction: 'reassign'
                }));
            }
        });
    }

    function defaultRoom(partial) {
        const p = partial || {};
        return {
            id: normalizeStr(p.id) || uid('room'),
            name: normalizeStr(p.name) || 'Room',
            capacity: p.capacity != null ? Number(p.capacity) : null,
            allowedClassTypes: Array.isArray(p.allowedClassTypes) ? p.allowedClassTypes.slice() : [],
            notes: normalizeStr(p.notes),
            sortOrder: Number(p.sortOrder) || 0
        };
    }

    function moveAssignmentRoom(draft, assignmentId, toRoomId) {
        const asg = (draft.assignments || []).find((a) => a.assignmentId === assignmentId);
        if (!asg || asg.locked) return { ok: false, reason: 'locked_or_missing' };
        // Rooms are soft: allow double-books; recomputeDraftMetrics surfaces warnings.
        draft.assignments.forEach((a) => {
            if (a.linkGroupId !== asg.linkGroupId) return;
            a.roomId = toRoomId || null;
            a.manualKeep = true;
            a.source = 'manual';
            if (a.score && Array.isArray(a.score.tags)) {
                a.score.tags = a.score.tags.filter((t) => t !== 'room unresolved');
                if (!toRoomId) a.score.tags.push('room unresolved');
            }
        });
        draft.updatedAt = new Date().toISOString();
        return { ok: true };
    }

    function swapAssignmentRooms(draft, assignmentIdA, assignmentIdB) {
        const a = (draft.assignments || []).find((x) => x.assignmentId === assignmentIdA);
        const b = (draft.assignments || []).find((x) => x.assignmentId === assignmentIdB);
        if (!a || !b || a.locked || b.locked) return { ok: false, reason: 'locked_or_missing' };
        const others = draft.assignments.filter(
            (x) => x.linkGroupId !== a.linkGroupId && x.linkGroupId !== b.linkGroupId
        );
        const roomA = a.roomId || null;
        const roomB = b.roomId || null;
        if (roomB && roomConflictsFor(Object.assign({}, a, { roomId: roomB }), roomB, others).length) {
            return { ok: false, reason: 'room_conflict_a' };
        }
        if (roomA && roomConflictsFor(Object.assign({}, b, { roomId: roomA }), roomA, others).length) {
            return { ok: false, reason: 'room_conflict_b' };
        }
        draft.assignments.forEach((x) => {
            if (x.linkGroupId === a.linkGroupId) {
                x.roomId = roomB;
                x.manualKeep = true;
                x.source = 'manual';
            } else if (x.linkGroupId === b.linkGroupId) {
                x.roomId = roomA;
                x.manualKeep = true;
                x.source = 'manual';
            }
        });
        draft.updatedAt = new Date().toISOString();
        return { ok: true };
    }

    function localImproveSwaps(assignments, demands, teachers, globalBlockouts) {
        const demandById = new Map(demands.map((d) => [d.demandId, d]));
        let improved = true;
        let guard = 0;
        while (improved && guard < 40) {
            improved = false;
            guard += 1;
            for (let i = 0; i < assignments.length; i += 1) {
                const a = assignments[i];
                if (a.locked || a.manualKeep) continue;
                for (let j = i + 1; j < assignments.length; j += 1) {
                    const b = assignments[j];
                    if (b.locked || b.manualKeep) continue;
                    if (a.teacherProfileId === b.teacherProfileId) continue;
                    const da = demandById.get(a.demandId);
                    const db = demandById.get(b.demandId);
                    if (!da || !db) continue;
                    const ta = teachers.find((t) => t.id === a.teacherProfileId);
                    const tb = teachers.find((t) => t.id === b.teacherProfileId);
                    if (!ta || !tb) continue;

                    const without = assignments.filter((x) => x.assignmentId !== a.assignmentId && x.assignmentId !== b.assignmentId);
                    if (hardRejectReasons(tb, da, without, globalBlockouts).length) continue;
                    if (hardRejectReasons(ta, db, without, globalBlockouts).length) continue;

                    const before = (a.score && a.score.softScore || 0) + (b.score && b.score.softScore || 0);
                    const scoreAonB = softScore(tb, da, without);
                    const scoreBonA = softScore(ta, db, without);
                    const after = scoreAonB.softScore + scoreBonA.softScore;
                    if (after <= before + 2) continue;

                    const oldATeacher = a.teacherProfileId;
                    const oldAUser = a.userId;
                    a.teacherProfileId = b.teacherProfileId;
                    a.userId = b.userId;
                    a.score = { hardOk: true, softScore: scoreAonB.softScore, tags: scoreAonB.tags };
                    b.teacherProfileId = oldATeacher;
                    b.userId = oldAUser;
                    b.score = { hardOk: true, softScore: scoreBonA.softScore, tags: scoreBonA.tags };
                    improved = true;
                }
            }
        }
    }

    function swapAssignmentBundles(draft, assignmentIdA, assignmentIdB, teachers, demands, globalBlockouts) {
        const a = (draft.assignments || []).find((x) => x.assignmentId === assignmentIdA);
        const b = (draft.assignments || []).find((x) => x.assignmentId === assignmentIdB);
        if (!a || !b || a.locked || b.locked) return { ok: false, reason: 'locked_or_missing' };
        const ta = teachers.find((t) => t.id === a.teacherProfileId);
        const tb = teachers.find((t) => t.id === b.teacherProfileId);
        const da = demands.find((d) => d.demandId === a.demandId);
        const db = demands.find((d) => d.demandId === b.demandId);
        if (!ta || !tb || !da || !db) return { ok: false, reason: 'missing' };
        const others = draft.assignments.filter((x) => x.linkGroupId !== a.linkGroupId && x.linkGroupId !== b.linkGroupId);
        if (hardRejectReasons(tb, da, others, globalBlockouts).length) return { ok: false, reason: 'hard_a' };
        if (hardRejectReasons(ta, db, others, globalBlockouts).length) return { ok: false, reason: 'hard_b' };
        const scoreA = softScore(tb, da, others);
        const scoreB = softScore(ta, db, others);
        const aTeacher = a.teacherProfileId;
        const aUser = a.userId;
        draft.assignments.forEach((x) => {
            if (x.linkGroupId === a.linkGroupId) {
                x.teacherProfileId = b.teacherProfileId;
                x.userId = b.userId;
                x.manualKeep = true;
                x.source = 'manual';
                x.score = { hardOk: true, softScore: scoreA.softScore, tags: scoreA.tags };
            } else if (x.linkGroupId === b.linkGroupId) {
                x.teacherProfileId = aTeacher;
                x.userId = aUser;
                x.manualKeep = true;
                x.source = 'manual';
                x.score = { hardOk: true, softScore: scoreB.softScore, tags: scoreB.tags };
            }
        });
        draft.updatedAt = new Date().toISOString();
        return { ok: true };
    }

    /**
     * Permissive full swap for sidebar ↔ board: exchange teachers and meeting slots.
     * Soft conflicts surface in metrics; only missing/locked fail.
     */
    function swapAssignmentsFull(appData, draft, assignmentIdA, assignmentIdB) {
        const a = (draft.assignments || []).find((x) => x.assignmentId === assignmentIdA);
        const b = (draft.assignments || []).find((x) => x.assignmentId === assignmentIdB);
        if (!a || !b) return { ok: false, reason: 'missing_assignment', softReasons: [] };
        if (a.locked || b.locked) return { ok: false, reason: 'locked', softReasons: [] };
        if (a.assignmentId === b.assignmentId) return { ok: true, softReasons: [] };

        const aTeacher = a.teacherProfileId;
        const aUser = a.userId;
        const aMeetings = assignmentMeetings(a).map((m) => Object.assign({}, m));
        const bMeetings = assignmentMeetings(b).map((m) => Object.assign({}, m));

        a.teacherProfileId = b.teacherProfileId;
        a.userId = b.userId;
        a.meetings = bMeetings.map((m) => ({
            meetingId: uid('mtg'),
            dow: Number(m.dow),
            period: String(m.period)
        }));
        b.teacherProfileId = aTeacher;
        b.userId = aUser;
        b.meetings = aMeetings.map((m) => ({
            meetingId: uid('mtg'),
            dow: Number(m.dow),
            period: String(m.period)
        }));

        a.manualKeep = true;
        b.manualKeep = true;
        a.source = 'manual';
        b.source = 'manual';
        draft.updatedAt = new Date().toISOString();
        recomputeDraftMetrics(appData, draft);
        return { ok: true, softReasons: [] };
    }

    function moveAssignmentBundle(draft, assignmentId, toTeacherProfileId, teachers, demands, globalBlockouts, options) {
        const opts = options || {};
        const asg = (draft.assignments || []).find((a) => a.assignmentId === assignmentId);
        if (!asg || asg.locked) {
            return { ok: false, reason: 'locked_or_missing' };
        }
        const teacher = (teachers || []).find((t) => t.id === toTeacherProfileId);
        const demand = (demands || []).find((d) => d.demandId === asg.demandId);
        if (!teacher || !demand) return { ok: false, reason: 'missing_teacher_or_demand' };
        const others = draft.assignments.filter((a) => a.linkGroupId !== asg.linkGroupId);
        if (!opts.permissive) {
            const hard = hardRejectReasons(teacher, demand, others, globalBlockouts);
            if (hard.length) return { ok: false, reason: hard[0], reasons: hard };
        }
        const soft = softScore(teacher, demand, others);
        draft.assignments.forEach((a) => {
            if (a.linkGroupId !== asg.linkGroupId) return;
            a.teacherProfileId = teacher.id;
            a.userId = teacher.userId;
            a.manualKeep = true;
            a.source = 'manual';
            a.score = { hardOk: true, softScore: soft.softScore, tags: soft.tags };
        });
        draft.updatedAt = new Date().toISOString();
        return { ok: true, softReasons: opts.permissive ? soft.tags || [] : [] };
    }

    function recordLearningFromDraft(appData, draft) {
        ensurePlannerFields(appData);
        (draft.assignments || []).forEach((asg) => {
            if (asg.source !== 'manual' && !asg.manualKeep) return;
            const profile = appData.teacherProfiles.find((t) => t.id === asg.teacherProfileId);
            if (!profile) return;
            const lp = profile.learnedPreferences || (profile.learnedPreferences = defaultTeacherProfile().learnedPreferences);
            const demand = buildDemandsFromAppData(appData).find((d) => d.demandId === asg.demandId);
            if (!demand) return;
            if (demand.classTypeId) {
                lp.preferredClassTypeIds[demand.classTypeId] = (lp.preferredClassTypeIds[demand.classTypeId] || 0) + 1;
            }
            (demand.cohortIds || []).forEach((cid) => {
                lp.preferredCohortIds[cid] = (lp.preferredCohortIds[cid] || 0) + 1;
            });
            (asg.meetings || []).forEach((m) => {
                const key = slotKey(m.dow, m.period);
                lp.preferredSlots[key] = (lp.preferredSlots[key] || 0) + 1;
            });
            lp.updatedAt = new Date().toISOString();
        });
    }

    function applyDraftToAppData(appData, draft, options) {
        const opts = options || {};
        ensurePlannerFields(appData);
        const classes = Array.isArray(appData.classes) ? appData.classes : [];
        const applied = [];
        const failed = [];

        (draft.assignments || []).forEach((asg) => {
            const cls = classes.find((c) => c.id === asg.classId);
            if (!cls) {
                failed.push({ assignmentId: asg.assignmentId, reason: 'class_missing' });
                return;
            }
            if (!asg.userId && !opts.allowMissingUserId) {
                failed.push({ assignmentId: asg.assignmentId, reason: 'missing_user_id' });
                return;
            }
            const profile = (appData.teacherProfiles || []).find((t) => t.id === asg.teacherProfileId);
            const meetings = asg.meetings || [];
            const meetingDays = [...new Set(meetings.map((m) => Number(m.dow)))].sort((a, b) => a - b);
            const periodByWeekday = {};
            meetings.forEach((m) => {
                periodByWeekday[String(m.dow)] = parsePeriod(m.period);
            });
            const placements = meetings.map((m) => ({
                dow: Number(m.dow),
                period: parsePeriod(m.period)
            }));
            const row = {
                id: uid('ct'),
                userId: asg.userId || (profile && profile.userId) || '',
                name: (profile && profile.name) || '',
                category: '',
                curriculumId: cls.curriculumId || '',
                classTypeId: cls.classTypeId || '',
                meetingDays,
                period: placements[0] ? placements[0].period : cls.period,
                periodByWeekday,
                placements,
                scheduleBlock: cls.scheduleBlock || ''
            };
            if (!Array.isArray(cls.classTeachers)) cls.classTeachers = [];
            // Replace matching teacher row or set as sole planner-assigned row when empty/overwrite
            if (opts.replaceAllTeachers) {
                cls.classTeachers = [row];
            } else {
                const idx = cls.classTeachers.findIndex((r) => normalizeStr(r.userId) && normalizeStr(r.userId) === normalizeStr(row.userId));
                if (idx >= 0) cls.classTeachers[idx] = Object.assign({}, cls.classTeachers[idx], row, { id: cls.classTeachers[idx].id || row.id });
                else cls.classTeachers.push(row);
            }
            if (asg.roomId) cls.roomId = asg.roomId;
            // Write-through to class module schedule fields (Class Setup)
            cls.meetingDays = meetingDays.slice();
            cls.period = placements[0] ? placements[0].period : cls.period;
            cls.periodByWeekday = Object.assign({}, periodByWeekday);
            if (placements.length) {
                cls.weeklyFrequency = Math.max(Number(cls.weeklyFrequency) || 0, placements.length);
            }
            applied.push(asg.assignmentId);
        });

        if (opts.recordLearning !== false) {
            recordLearningFromDraft(appData, draft);
        }
        draft.status = 'applied';
        draft.updatedAt = new Date().toISOString();
        if (!Array.isArray(appData.plannerDrafts)) appData.plannerDrafts = [];
        const existingIdx = appData.plannerDrafts.findIndex((d) => d.id === draft.id);
        if (existingIdx >= 0) appData.plannerDrafts[existingIdx] = draft;
        else {
            appData.plannerDrafts.unshift(draft);
            appData.plannerDrafts = appData.plannerDrafts.slice(0, 5);
        }
        appData.plannerState.activeDraftId = draft.id;
        appData.plannerState.updatedAt = draft.updatedAt;
        return { applied, failed };
    }

    function setTeacherBlockoutSlot(teacherProfile, dow, period, blocked) {
        const tp = defaultTeacherProfile(teacherProfile);
        const slots = tp.availability.unavailableSlots.filter(
            (s) => !(Number(s.dow) === Number(dow) && String(s.period) === String(period))
        );
        if (blocked) slots.push({ dow: Number(dow), period: String(period) });
        tp.availability.unavailableSlots = slots;
        Object.assign(teacherProfile, tp);
        return teacherProfile;
    }

    function setGlobalBlockoutSlot(plannerState, dow, period, blocked, label) {
        const state = defaultPlannerState(plannerState);
        const slots = (state.blockouts.globalUnavailableSlots || []).filter(
            (s) => !(Number(s.dow) === Number(dow) && String(s.period) === String(period))
        );
        if (blocked) slots.push({ dow: Number(dow), period: String(period), label: label || '' });
        state.blockouts.globalUnavailableSlots = slots;
        Object.assign(plannerState, state);
        return plannerState;
    }

    global.CCPTeacherPlanner = {
        PLANNER_RULES_VERSION,
        SOFT_WEIGHTS,
        BAND_PERIODS,
        defaultTeacherProfile,
        defaultPlannerState,
        defaultRoom,
        ensurePlannerFields,
        seedTeacherProfilesFromAppData,
        seedDraftFromCalendar,
        findTeacherProfileForClass,
        buildDemandsFromAppData,
        hardRejectReasons,
        softScore,
        generateDraft,
        recommendRooms,
        moveAssignmentBundle,
        swapAssignmentBundles,
        swapAssignmentsFull,
        moveAssignmentRoom,
        swapAssignmentRooms,
        roomConflictsFor,
        applyDraftToAppData,
        recordLearningFromDraft,
        setTeacherBlockoutSlot,
        setGlobalBlockoutSlot,
        isSlotBlocked,
        occupancyMap,
        roomOccupancy,
        bandFromScheduleBlock,
        resolvePlannerBandFromText,
        resolvePlannerBandForCohort,
        levelSortIndex,
        JUNIOR_LEVEL_ORDER,
        SENIOR_LEVEL_ORDER,
        periodBand,
        isOutOfBlock,
        cohortMeetingDays,
        weeklyNeed,
        hasDuplicateWeekday,
        isValidPlacement,
        canSwapPeriods,
        placePeriodOnTeacher,
        movePeriod,
        removePeriod,
        swapPeriodCells,
        setAssignmentTeacher,
        recomputeDraftMetrics,
        inferCadence,
        getClassCohortIds
    };
})(typeof window !== 'undefined' ? window : globalThis);
