/**
 * Schedule planner — auto-schedule (CCPPlannerAuto).
 *
 * Fills in what is not placed yet; it never moves a period or changes a teacher
 * that is already on the board.
 *
 *   analysePreviousTerm  – which of last term's teachers taught the students of
 *                          each of this term's classes (students are followed
 *                          across level-up by TMS id, else by a unique name).
 *   autoSchedule         – gives each class its missing periods and a teacher.
 *   buildOptions         – runs it with different priorities so the planner
 *                          can offer a few plans to choose from.
 *
 * A class shared by several cohorts (합반) counts all of their students and
 * only takes a time when every one of its cohorts is free.
 *
 * Unlike the board (which only warns), auto-schedule treats these as fixed:
 * teacher limits from Setup, times off, clock-in/out, the hours students are
 * at school, daily and weekly limits, and the most periods in a row.
 */
(function (global) {
    const DAYS = [1, 2, 3, 4, 5];

    function P() {
        return global.CCPTeacherPlanner;
    }

    function norm(v) {
        return String(v == null ? '' : v).trim();
    }

    function lower(v) {
        return norm(v).toLowerCase();
    }

    /* ----------------------------------------------------- previous term */

    /** cohortId -> [[key, key…] per student]. Keys: TMS id, and the name when it is unique in the term. */
    function termRoster(data) {
        const cohorts = (data && data.cohorts) || [];
        const nameCount = new Map();
        const each = (fn) => cohorts.forEach((c) => {
            if (!c || c.isArchiveCohort) return;
            (c.students || []).forEach((st) => {
                if (!st || st.active === false || norm(st.archivedAt)) return;
                fn(c, st);
            });
        });
        each((c, st) => {
            const n = lower(st.name);
            if (n) nameCount.set(n, (nameCount.get(n) || 0) + 1);
        });
        const roster = new Map();
        each((c, st) => {
            const keys = [];
            if (norm(st.tmsMpidx)) keys.push(`tms:${norm(st.tmsMpidx)}`);
            const n = lower(st.name);
            if (n && nameCount.get(n) === 1) keys.push(`name:${n}`);
            if (!keys.length) keys.push(`id:${norm(st.id)}`);
            if (!roster.has(c.id)) roster.set(c.id, []);
            roster.get(c.id).push(keys);
        });
        return roster;
    }

    function classStudents(roster, cohortIds) {
        const seen = new Set();
        const out = [];
        (cohortIds || []).forEach((cid) => {
            (roster.get(cid) || []).forEach((keys) => {
                if (seen.has(keys[0])) return;
                seen.add(keys[0]);
                out.push(keys);
            });
        });
        return out;
    }

    function subjectKey(d) {
        return lower(d.classTypeId) || lower(d.curriculumId);
    }

    function classTeacherRows(cls) {
        const rows = Array.isArray(cls && cls.classTeachers) ? cls.classTeachers.slice() : [];
        if (!rows.length && cls && (norm(cls.assignedTeacherUserId) || norm(cls.assignedTeacherName))) {
            rows.push({ userId: cls.assignedTeacherUserId, name: cls.assignedTeacherName });
        }
        return rows;
    }

    /**
     * @returns {{ byDemand: Map<string, {total:number, matched:number, teachers:Array, slots:Array}>,
     *             students:number, matched:number }}
     */
    function analysePreviousTerm(appData, prevData) {
        const out = { byDemand: new Map(), students: 0, matched: 0 };
        if (!appData || !prevData || !P()) return out;
        const profiles = appData.teacherProfiles || [];
        const findProfile = (row) => {
            const uid = norm(row.userId);
            const name = lower(row.name);
            return (uid && profiles.find((p) => norm(p.userId) === uid))
                || (name && profiles.find((p) => lower(p.name) === name))
                || null;
        };
        const prevRoster = termRoster(prevData);
        const prevClassById = new Map((prevData.classes || []).map((c) => [c.id, c]));
        const prev = P().buildDemandsFromAppData(prevData).map((d) => {
            const keys = new Set();
            classStudents(prevRoster, d.cohortIds).forEach((ks) => ks.forEach((k) => keys.add(k)));
            const teachers = classTeacherRows(prevClassById.get(d.classId)).map(findProfile).filter(Boolean);
            return { d, keys, teachers, subject: subjectKey(d) };
        }).filter((x) => x.keys.size);

        const roster = termRoster(appData);
        const allPrevKeys = new Set();
        prevRoster.forEach((list) => list.forEach((ks) => ks.forEach((k) => allPrevKeys.add(k))));
        const seenStudents = new Set();
        roster.forEach((list) => list.forEach((ks) => {
            if (seenStudents.has(ks[0])) return;
            seenStudents.add(ks[0]);
            out.students += 1;
            if (ks.some((k) => allPrevKeys.has(k))) out.matched += 1;
        }));

        P().buildDemandsFromAppData(appData).forEach((demand) => {
            const students = classStudents(roster, demand.cohortIds);
            if (!students.length) return;
            const subject = subjectKey(demand);
            const byTeacher = new Map();
            let best = null;
            let matched = 0;
            students.forEach((ks) => { if (ks.some((k) => allPrevKeys.has(k))) matched += 1; });
            prev.forEach((pc) => {
                const count = students.filter((ks) => ks.some((k) => pc.keys.has(k))).length;
                if (!count) return;
                const same = !!subject && subject === pc.subject;
                const score = (count / students.length) * (same ? 1 : 0.5);
                pc.teachers.forEach((tp) => {
                    const cur = byTeacher.get(tp.id);
                    if (!cur || score > cur.score) {
                        byTeacher.set(tp.id, { teacherProfileId: tp.id, count, sameSubject: same, score });
                    }
                });
                if (same && (!best || count > best.count)) best = { count, meetings: pc.d.meetings || [] };
            });
            out.byDemand.set(demand.demandId, {
                total: students.length,
                matched,
                teachers: [...byTeacher.values()].sort((a, b) => b.score - a.score),
                slots: best ? best.meetings.map((m) => ({ dow: Number(m.dow), period: String(m.period) })) : []
            });
        });
        return out;
    }

    /* ------------------------------------------------------- scheduling */

    function periodNumbers(appData) {
        const tp = global.CCPTimetablePeriods;
        const map = (appData.periodSlotMap && Object.keys(appData.periodSlotMap).length)
            ? appData.periodSlotMap
            : (tp && tp.getDefaultMap ? tp.getDefaultMap() : {});
        const nums = tp && tp.getPeriodNumbers ? tp.getPeriodNumbers(map) : [];
        return nums.length ? nums : [1, 2, 3, 4, 5, 6, 7];
    }

    const PRIORITIES = {
        continuity: { continuity: 1.6, breaks: 1, balance: 0.6 },
        breaks: { continuity: 0.6, breaks: 2.6, balance: 0.6 },
        balance: { continuity: 0.8, breaks: 1, balance: 3 }
    };

    /** How pleasant a teacher's day is (higher is better): holes and long runs cost. */
    function dayShapeScore(periods, runLimit) {
        const nums = [...periods].sort((a, b) => a - b);
        if (nums.length < 2) return 0;
        let score = 0;
        for (let i = 1; i < nums.length; i += 1) {
            const gap = nums[i] - nums[i - 1] - 1;
            if (gap === 1) score -= 5; // one empty period stuck between classes
            else if (gap >= 3) score -= 3; // long wait at school
        }
        const run = P().longestRun(nums);
        if (run >= runLimit) score -= 3; // at the limit: allowed, not liked
        return score;
    }

    /**
     * Fill the draft in place.
     * options: { analysis, priority: 'continuity'|'breaks'|'balance', weights? }
     * Returns { placed, teachersSet, unplaced: [{ demandId, missing, reason }] }.
     */
    function autoSchedule(appData, draft, options) {
        const opts = options || {};
        const api = P();
        api.ensurePlannerFields(appData);
        const w = Object.assign({}, PRIORITIES[opts.priority] || PRIORITIES.continuity, opts.weights || {});
        const analysis = opts.analysis || { byDemand: new Map() };
        const runLimit = api.maxConsecutive(appData);
        const blockouts = (appData.plannerState && appData.plannerState.blockouts) || {};
        const periods = periodNumbers(appData);
        const teachers = (appData.teacherProfiles || []).map((t) => api.defaultTeacherProfile(t));
        const rooms = (appData.rooms || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const cohortById = new Map(((appData.cohorts || [])).map((c) => [c.id, c]));
        const demands = api.buildDemandsFromAppData(appData).filter((d) => d.includedInDraft !== false);
        const demandById = new Map(demands.map((d) => [d.demandId, d]));
        if (!Array.isArray(draft.assignments)) draft.assignments = [];

        // What is already taken.
        const teacherBusy = new Set();
        const cohortBusy = new Set();
        const roomBusy = new Set();
        const teacherDay = new Map(); // `${tid}|${dow}` -> [period numbers]
        const cohortDay = new Map();
        const load = new Map();
        const push = (map, key, n) => {
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(n);
        };
        const occupy = (demand, teacherId, dow, period, roomId) => {
            const n = Number(period);
            if (teacherId) {
                teacherBusy.add(`${teacherId}|${dow}|${n}`);
                push(teacherDay, `${teacherId}|${dow}`, n);
                load.set(teacherId, (load.get(teacherId) || 0) + 1);
            }
            (demand.cohortIds || []).forEach((cid) => {
                cohortBusy.add(`${cid}|${dow}|${n}`);
                push(cohortDay, `${cid}|${dow}`, n);
            });
            if (roomId) roomBusy.add(`${roomId}|${dow}|${n}`);
        };
        const rebuild = () => {
            [teacherBusy, cohortBusy, roomBusy, teacherDay, cohortDay, load].forEach((x) => x.clear());
            draft.assignments.forEach((asg) => {
                const demand = demandById.get(asg.demandId);
                if (!demand) return;
                (asg.meetings || []).forEach((m) => occupy(demand, asg.teacherProfileId, Number(m.dow), m.period, api.meetingRoomId(asg, m)));
            });
        };
        rebuild();
        const fresh = new Set(); // periods placed in this run (the only ones the repair step may shift)
        const studentCount = (demand) => {
            const seen = new Set();
            (demand.cohortIds || []).forEach((cid) => {
                ((cohortById.get(cid) || {}).students || []).forEach((st) => {
                    if (st && st.active !== false) seen.add(st.id || st.name);
                });
            });
            return seen.size;
        };
        /** A free room for this time: the class's own if free, else the smallest free one that seats everyone. */
        const pickRoom = (asg, demand, dow, n) => {
            if (!rooms.length) return null;
            const free = (id) => id && !roomBusy.has(`${id}|${dow}|${n}`);
            if (free(asg.roomId)) return asg.roomId;
            const size = studentCount(demand);
            const open = rooms.filter((r) => free(r.id));
            const fits = open.filter((r) => r.capacity == null || !Number(r.capacity) || Number(r.capacity) >= size)
                .sort((a, b) => (Number(a.capacity) || 999) - (Number(b.capacity) || 999));
            const biggest = open.slice().sort((a, b) => (Number(b.capacity) || 0) - (Number(a.capacity) || 0));
            return (fits[0] || biggest[0] || {}).id || null;
        };
        const addMeeting = (asg, demand, dow, n) => {
            const meeting = {
                meetingId: `mtg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                dow,
                period: String(n),
                auto: true
            };
            const roomId = pickRoom(asg, demand, dow, n);
            if (rooms.length) {
                if (roomId && !asg.roomId) asg.roomId = roomId;
                else if ((roomId || '') !== (asg.roomId || '')) meeting.roomId = roomId || '';
            }
            asg.meetings = (asg.meetings || []).concat([meeting]);
            fresh.add(meeting);
            occupy(demand, asg.teacherProfileId, dow, n, roomId);
            return meeting;
        };
        /** The fixed rules for one teacher (or none) taking one period at this time. Cohort clashes are checked by the caller. */
        const teacherCanTake = (teacher, dow, n, mine) => {
            if (!teacher) return !api.isSlotBlocked(api.defaultTeacherProfile({}), dow, n, blockouts);
            if (teacherBusy.has(`${teacher.id}|${dow}|${n}`)) return false;
            if (api.isSlotBlocked(teacher, dow, n, blockouts)) return false;
            if (api.outsideTeacherHours(appData, teacher, n)) return false;
            if (mine.length + 1 > (teacher.limits.maxPeriodsPerDay || 99)) return false;
            if (api.longestRun(mine.concat([n])) > runLimit) return false;
            return true;
        };

        const asgOf = (demand) => draft.assignments.find((a) => a.demandId === demand.demandId) || null;
        const missingOf = (demand) => {
            const asg = asgOf(demand);
            return Math.max(0, api.weeklyNeed(demand) - (asg ? (asg.meetings || []).length : 0));
        };
        const eligible = (demand) => teachers.filter((t) => !api.teacherLimitReason(t, demand));
        const continuityOf = (demand, teacherId) => {
            const info = analysis.byDemand.get(demand.demandId);
            return info ? info.teachers.find((x) => x.teacherProfileId === teacherId) || null : null;
        };

        /** Days every cohort of the class comes (falls back to any day a cohort comes, then Mon–Fri). */
        const classDays = (demand) => {
            const lists = (demand.cohortIds || [])
                .map((cid) => cohortById.get(cid))
                .filter((c) => c && Array.isArray(c.meetingDays) && c.meetingDays.length)
                .map((c) => c.meetingDays.map(Number).filter((d) => d >= 1 && d <= 5));
            if (!lists.length) return DAYS.slice();
            const common = DAYS.filter((d) => lists.every((l) => l.includes(d)));
            if (common.length) return common;
            return DAYS.filter((d) => lists.some((l) => l.includes(d)));
        };

        /** Choose `count` slots for this class with this teacher (null = no teacher). */
        const chooseSlots = (demand, teacher, count) => {
            const asg = asgOf(demand);
            const days = classDays(demand);
            const usedDays = new Set((asg ? asg.meetings || [] : []).map((m) => Number(m.dow)));
            const prevSlots = (analysis.byDemand.get(demand.demandId) || { slots: [] }).slots;
            const prefs = teacher ? teacher.preferences || {} : {};
            const picked = [];
            let total = 0;
            const tDay = (dow) => (teacher ? (teacherDay.get(`${teacher.id}|${dow}`) || []) : [])
                .concat(picked.filter((x) => x.dow === dow).map((x) => x.n));
            for (let k = 0; k < count; k += 1) {
                let best = null;
                // Spread a class over different days while it still can.
                const freshDays = days.filter((d) => !usedDays.has(d));
                const dayPool = freshDays.length ? freshDays : days;
                dayPool.forEach((dow) => {
                    periods.forEach((n, idx) => {
                        if (picked.some((x) => x.dow === dow && x.n === n)) return;
                        if ((demand.cohortIds || []).some((cid) => cohortBusy.has(`${cid}|${dow}|${n}`))) return;
                        if (api.outsideStudentHours(appData, demand, n)) return;
                        const mine = tDay(dow);
                        if (!teacherCanTake(teacher, dow, n, mine)) return;
                        let score = -0.4 * idx; // earlier in the students' hours first
                        // Students should not sit through empty periods.
                        (demand.cohortIds || []).forEach((cid) => {
                            const theirs = cohortDay.get(`${cid}|${dow}`) || [];
                            if (!theirs.length) return;
                            const dist = Math.min(...theirs.map((x) => Math.abs(x - n)));
                            score += dist === 1 ? 6 : -6 * (dist - 1);
                        });
                        if (teacher) {
                            score += w.breaks * (dayShapeScore(mine.concat([n]), runLimit) - dayShapeScore(mine, runLimit));
                            if (mine.some((x) => Math.abs(x - n) === 1)) score += 1.5 * w.breaks;
                            if ((prefs.preferredDays || []).map(Number).includes(dow)) score += 1;
                            if ((prefs.discouragedDays || []).map(Number).includes(dow)) score -= 3;
                            if ((prefs.preferredPeriods || []).map(String).includes(String(n))) score += 1;
                            if ((prefs.discouragedPeriods || []).map(String).includes(String(n))) score -= 3;
                            if (prefs.avoidFirstPeriod && idx === 0) score -= 3;
                            if (prefs.avoidLastPeriod && idx === periods.length - 1) score -= 3;
                        }
                        if (prevSlots.some((s) => s.dow === dow && Number(s.period) === n)) score += 4 * w.continuity;
                        // Twice a week: not on back-to-back days when there is a choice.
                        const otherDays = [...usedDays];
                        if (otherDays.length && otherDays.every((d) => Math.abs(d - dow) >= 2)) score += 2;
                        if (!best || score > best.score) best = { dow, n, score };
                    });
                });
                if (!best) break;
                picked.push(best);
                usedDays.add(best.dow);
                total += best.score;
            }
            return { picked, score: total };
        };

        const only = Array.isArray(opts.onlyDemandIds) ? new Set(opts.onlyDemandIds) : null;
        const todo = demands
            .filter((d) => !only || only.has(d.demandId))
            .filter((d) => missingOf(d) > 0 || !(asgOf(d) && asgOf(d).teacherProfileId))
            .map((d) => {
                const asg = asgOf(d);
                const fixed = asg && asg.teacherProfileId ? 1 : 0;
                const info = analysis.byDemand.get(d.demandId);
                return {
                    d,
                    fixed,
                    options: fixed ? 1 : eligible(d).length,
                    strength: info && info.teachers[0] ? info.teachers[0].score : 0
                };
            })
            // Hardest first: shared classes, fewest possible teachers, strongest tie to a teacher.
            .sort((a, b) => b.fixed - a.fixed
                || (b.d.cohortIds || []).length - (a.d.cohortIds || []).length
                || a.options - b.options
                || b.strength - a.strength
                || api.weeklyNeed(b.d) - api.weeklyNeed(a.d));

        const result = { placed: 0, teachersSet: 0, unplaced: [] };

        todo.forEach(({ d: demand }) => {
            let asg = asgOf(demand);
            const missing = missingOf(demand);
            const fixedTeacher = asg && asg.teacherProfileId
                ? teachers.find((t) => t.id === asg.teacherProfileId) || null
                : null;
            const candidates = fixedTeacher ? [fixedTeacher] : eligible(demand);
            const alreadyOnBoard = asg ? (asg.meetings || []) : [];
            let best = null;
            candidates.forEach((teacher) => {
                const maxWeek = teacher.limits.maxPeriodsPerWeek || 99;
                const now = load.get(teacher.id) || 0;
                // Taking the class means taking the periods it already has, too.
                const extra = fixedTeacher ? 0 : alreadyOnBoard.length;
                if (!fixedTeacher) {
                    if (now + extra + missing > maxWeek) return;
                    const clash = alreadyOnBoard.some((m) => teacherBusy.has(`${teacher.id}|${Number(m.dow)}|${Number(m.period)}`)
                        || api.isSlotBlocked(teacher, m.dow, m.period, blockouts)
                        || api.outsideTeacherHours(appData, teacher, m.period));
                    if (clash) return;
                }
                const slots = chooseSlots(demand, teacher, missing);
                let score = slots.score - 60 * (missing - slots.picked.length);
                const kept = continuityOf(demand, teacher.id);
                if (kept) score += 100 * w.continuity * kept.score;
                score -= 20 * w.balance * ((now + extra + slots.picked.length) / maxWeek);
                if (!best || score > best.score) best = { teacher, slots, score, kept };
            });
            if (!best && !fixedTeacher) {
                // Nobody fits: still give the class a time so only the teacher is left to decide.
                best = { teacher: null, slots: chooseSlots(demand, null, missing), score: 0, kept: null };
            }
            if (!best) return;

            if (!asg && (best.slots.picked.length || best.teacher)) {
                asg = {
                    assignmentId: `asg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                    demandId: demand.demandId,
                    linkGroupId: demand.linkGroupId,
                    classId: demand.classId,
                    teacherProfileId: null,
                    userId: null,
                    roomId: demand.preferredRoomId || null,
                    meetings: [],
                    locked: false,
                    manualKeep: false,
                    source: 'auto',
                    score: { hardOk: true, softScore: 0, tags: [] }
                };
                draft.assignments.push(asg);
            }
            if (!asg) {
                result.unplaced.push({ demandId: demand.demandId, missing, reason: 'no_time' });
                return;
            }
            if (!fixedTeacher && best.teacher) {
                asg.teacherProfileId = best.teacher.id;
                asg.userId = best.teacher.userId || null;
                // Why this teacher, shown in the planner.
                asg.auto = best.kept
                    ? { count: best.kept.count, total: (analysis.byDemand.get(demand.demandId) || {}).total || 0, sameSubject: best.kept.sameSubject }
                    : {};
                result.teachersSet += 1;
                (asg.meetings || []).forEach((m) => {
                    teacherBusy.add(`${best.teacher.id}|${Number(m.dow)}|${Number(m.period)}`);
                    push(teacherDay, `${best.teacher.id}|${Number(m.dow)}`, Number(m.period));
                    load.set(best.teacher.id, (load.get(best.teacher.id) || 0) + 1);
                });
            }
            best.slots.picked.forEach((slot) => {
                addMeeting(asg, demand, slot.dow, slot.n);
                result.placed += 1;
            });
            const left = missing - best.slots.picked.length;
            if (left > 0) result.unplaced.push({ demandId: demand.demandId, missing: left, reason: 'no_time' });
            else if (!asg.teacherProfileId) result.unplaced.push({ demandId: demand.demandId, missing: 0, reason: 'no_teacher' });
        });

        /*
         * Repair step. Placing one class at a time can paint itself into a corner: a period is
         * left over although a full timetable exists. For each left-over period, look for a time
         * that is only taken by periods placed in this run, take it, and find those periods a new
         * home. If they cannot all be re-homed the try is undone. Nothing placed before this run moves.
         */
        const teacherOf = (asg) => (asg.teacherProfileId ? teachers.find((t) => t.id === asg.teacherProfileId) || null : null);
        const tryEject = (demand, asg) => {
            const teacher = teacherOf(asg);
            const days = classDays(demand);
            const used = new Set((asg.meetings || []).map((m) => Number(m.dow)));
            const order = days.filter((d) => !used.has(d)).concat(days.filter((d) => used.has(d)));
            for (let di = 0; di < order.length; di += 1) {
                const dow = order[di];
                for (let pi = 0; pi < periods.length; pi += 1) {
                    const n = periods[pi];
                    if ((asg.meetings || []).some((m) => Number(m.dow) === dow && Number(m.period) === n)) continue;
                    if (api.outsideStudentHours(appData, demand, n)) continue;
                    const inTheWay = [];
                    let fixedInTheWay = false;
                    draft.assignments.forEach((other) => {
                        if (other === asg) return;
                        const od = demandById.get(other.demandId);
                        if (!od) return;
                        const shares = (od.cohortIds || []).some((cid) => (demand.cohortIds || []).includes(cid))
                            || (teacher && other.teacherProfileId === teacher.id);
                        if (!shares) return;
                        (other.meetings || []).forEach((m) => {
                            if (Number(m.dow) !== dow || Number(m.period) !== n) return;
                            if (!fresh.has(m) || other.locked) fixedInTheWay = true;
                            else inTheWay.push({ asg: other, m, demand: od });
                        });
                    });
                    if (fixedInTheWay || !inTheWay.length || inTheWay.length > 2) continue;
                    const saved = [[asg, asg.meetings]].concat(inTheWay.map((o) => [o.asg, o.asg.meetings]));
                    const undo = () => {
                        saved.forEach(([a, list]) => { a.meetings = list; });
                        rebuild();
                    };
                    inTheWay.forEach((o) => { o.asg.meetings = o.asg.meetings.filter((m) => m !== o.m); });
                    rebuild();
                    const mine = teacher ? (teacherDay.get(`${teacher.id}|${dow}`) || []) : [];
                    if (!teacherCanTake(teacher, dow, n, mine)) {
                        undo();
                        continue;
                    }
                    addMeeting(asg, demand, dow, n);
                    const rehomed = inTheWay.every((o) => {
                        const pick = chooseSlots(o.demand, teacherOf(o.asg), 1).picked[0];
                        if (!pick) return false;
                        addMeeting(o.asg, o.demand, pick.dow, pick.n);
                        return true;
                    });
                    if (rehomed) return true;
                    undo();
                }
            }
            return false;
        };
        let rounds = 0;
        let progress = true;
        while (progress && rounds < 40) {
            progress = false;
            rounds += 1;
            result.unplaced.forEach((u) => {
                if (u.missing <= 0) return;
                const demand = demandById.get(u.demandId);
                const asg = demand && asgOf(demand);
                if (!asg) return;
                if (tryEject(demand, asg)) {
                    u.missing -= 1;
                    result.placed += 1;
                    result.repaired = (result.repaired || 0) + 1;
                    progress = true;
                }
            });
        }
        result.unplaced = result.unplaced.filter((u) => u.missing > 0 || u.reason === 'no_teacher');

        draft.updatedAt = new Date().toISOString();
        api.recomputeDraftMetrics(appData, draft);
        return result;
    }

    /* --------------------------------------------------- fixing clashes */

    function termHasStarted(appData, today) {
        const start = norm(appData && appData.termStart);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return false;
        const d = today || new Date();
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return start <= iso;
    }

    /**
     * Move classes out of each other's way.
     * In every clash the class that stays is the locked one, else the one moved most recently;
     * the others get a new time with the same teacher. Only when no time works with the same
     * teacher, and options.allowTeacherChange is true, the class gets another teacher.
     *
     * Returns { moved: [{demandId, from, to}], teacherChanged: [{demandId, from, to}],
     *           needTeacherChange: [demandId], stuck: [demandId], rooms: number }.
     */
    function resolveClashes(appData, draft, options) {
        const opts = options || {};
        const api = P();
        const out = { moved: [], teacherChanged: [], needTeacherChange: [], stuck: [], rooms: 0 };
        const demands = api.buildDemandsFromAppData(appData).filter((d) => d.includedInDraft !== false);
        const demandById = new Map(demands.map((d) => [d.demandId, d]));
        const groups = new Map();
        const add = (key, entry) => {
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(entry);
        };
        (draft.assignments || []).forEach((asg) => {
            const demand = demandById.get(asg.demandId);
            if (!demand) return;
            (asg.meetings || []).forEach((m) => {
                const slot = `${Number(m.dow)}|${Number(m.period)}`;
                const entry = { asg, m, demand };
                if (asg.teacherProfileId) add(`t|${asg.teacherProfileId}|${slot}`, entry);
                (demand.cohortIds || []).forEach((cid) => add(`c|${cid}|${slot}`, entry));
            });
        });
        // options.keep: 'recent' (default) keeps the class moved last; 'earlier' keeps the ones that were there first.
        const sign = opts.keep === 'earlier' ? -1 : 1;
        const rank = (e) => (e.asg.locked ? 1e15 : 0) + sign * (Number(e.m.movedAt) || 0);
        const losers = new Map(); // meeting -> entry
        groups.forEach((list) => {
            const distinct = list.filter((e, i) => list.findIndex((x) => x.m === e.m) === i);
            if (distinct.length < 2) return;
            const sorted = distinct.slice().sort((a, b) => rank(b) - rank(a));
            sorted.slice(1).forEach((e) => { if (!e.asg.locked) losers.set(e.m, e); });
        });

        const byDemand = new Map();
        losers.forEach((e) => {
            if (!byDemand.has(e.demand.demandId)) byDemand.set(e.demand.demandId, { asg: e.asg, taken: [] });
            byDemand.get(e.demand.demandId).taken.push(e.m);
        });
        byDemand.forEach((info) => {
            info.asg.meetings = info.asg.meetings.filter((m) => !info.taken.includes(m));
        });
        const slotsOf = (asg) => new Set((asg.meetings || []).map((m) => `${m.dow}|${m.period}`));
        const settle = (demandId, info, before) => {
            const added = (info.asg.meetings || []).filter((m) => !before.has(`${m.dow}|${m.period}`));
            return added.length >= info.taken.length ? added : null;
        };
        const ids = [...byDemand.keys()];
        const beforeSlots = new Map(ids.map((id) => [id, slotsOf(byDemand.get(id).asg)]));
        if (ids.length) autoSchedule(appData, draft, { analysis: opts.analysis, priority: 'breaks', onlyDemandIds: ids });

        ids.forEach((id) => {
            const info = byDemand.get(id);
            let added = settle(id, info, beforeSlots.get(id));
            if (!added) {
                // No time works with the same teacher. Take back any partial result first.
                info.asg.meetings = info.asg.meetings.filter((m) => beforeSlots.get(id).has(`${m.dow}|${m.period}`));
                const oldTeacher = info.asg.teacherProfileId;
                const oldUser = info.asg.userId;
                let changed = false;
                if (oldTeacher) {
                    info.asg.teacherProfileId = null;
                    info.asg.userId = null;
                    const trial = JSON.parse(JSON.stringify(draft));
                    autoSchedule(appData, trial, { analysis: opts.analysis, priority: 'breaks', onlyDemandIds: [id] });
                    const tAsg = trial.assignments.find((a) => a.demandId === id);
                    const ok = tAsg && tAsg.teacherProfileId && tAsg.teacherProfileId !== oldTeacher
                        && tAsg.meetings.length >= beforeSlots.get(id).size + info.taken.length;
                    if (ok && opts.allowTeacherChange) {
                        info.asg.teacherProfileId = tAsg.teacherProfileId;
                        info.asg.userId = tAsg.userId;
                        info.asg.meetings = tAsg.meetings;
                        delete info.asg.auto;
                        out.teacherChanged.push({ demandId: id, from: oldTeacher, to: tAsg.teacherProfileId });
                        added = settle(id, info, beforeSlots.get(id));
                        changed = true;
                    } else if (ok) {
                        out.needTeacherChange.push(id);
                    }
                }
                if (!changed) {
                    // Put it back where it was; the clash stays on the To fix list.
                    info.asg.teacherProfileId = oldTeacher;
                    info.asg.userId = oldUser;
                    info.asg.meetings = info.asg.meetings.concat(info.taken);
                    if (!out.needTeacherChange.includes(id)) out.stuck.push(id);
                    return;
                }
            }
            info.taken.forEach((m, i) => {
                const to = added[i];
                if (to) out.moved.push({ demandId: id, from: { dow: Number(m.dow), period: String(m.period) }, to: { dow: Number(to.dow), period: String(to.period) } });
            });
        });

        // Rooms used twice: the later-moved class keeps the room, the other takes a free one.
        const rooms = (appData.rooms || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        if (rooms.length) {
            const used = new Map();
            const all = [];
            (draft.assignments || []).forEach((asg) => (asg.meetings || []).forEach((m) => {
                if (demandById.has(asg.demandId)) all.push({ asg, m });
            }));
            all.sort((a, b) => rank(b) - rank(a));
            all.forEach((e) => {
                const slot = `${Number(e.m.dow)}|${Number(e.m.period)}`;
                const roomId = api.meetingRoomId(e.asg, e.m);
                if (!roomId) return;
                if (!used.has(`${roomId}|${slot}`)) {
                    used.set(`${roomId}|${slot}`, true);
                    return;
                }
                const free = rooms.find((r) => !used.has(`${r.id}|${slot}`));
                e.m.roomId = free ? free.id : '';
                if (free) used.set(`${free.id}|${slot}`, true);
                out.rooms += 1;
            });
        }
        draft.updatedAt = new Date().toISOString();
        api.recomputeDraftMetrics(appData, draft);
        return out;
    }

    /**
     * A few ways to clear the clashes, for the planner to offer.
     * Each: { id, draft, result } where id is 'keep' (move the others, same teachers),
     * 'other' (move the class that was moved last instead) or 'teacher' (may change teachers).
     */
    function clashOptions(appData, draft, analysis) {
        const variants = [
            { id: 'keep', keep: 'recent', allowTeacherChange: false },
            { id: 'other', keep: 'earlier', allowTeacherChange: false },
            { id: 'teacher', keep: 'recent', allowTeacherChange: true }
        ];
        const seen = new Set();
        const out = [];
        variants.forEach((v) => {
            const copy = JSON.parse(JSON.stringify(draft));
            const result = resolveClashes(appData, copy, { analysis, keep: v.keep, allowTeacherChange: v.allowTeacherChange });
            if (!result.moved.length && !result.teacherChanged.length && !result.rooms) return;
            if (v.id === 'teacher' && !result.teacherChanged.length) return;
            const sig = signature(copy);
            if (seen.has(sig)) return;
            seen.add(sig);
            const left = (copy.issues || []).filter((i) => ['teacher_double_booked', 'cohort_double_booked', 'room_conflict'].includes(i.code)).length;
            out.push({ id: v.id, draft: copy, result, clashesLeft: left });
        });
        return out;
    }

    /** Numbers for comparing plans. */
    function planStats(appData, draft, analysis) {
        const api = P();
        const info = analysis || { byDemand: new Map() };
        const demands = api.buildDemandsFromAppData(appData).filter((d) => d.includedInDraft !== false);
        let ready = 0;
        let kept = 0;
        let keepable = 0;
        const perTeacherDay = new Map();
        const loads = new Map();
        demands.forEach((d) => {
            const asg = (draft.assignments || []).find((a) => a.demandId === d.demandId);
            const meetings = asg ? asg.meetings || [] : [];
            if (asg && asg.teacherProfileId && meetings.length >= api.weeklyNeed(d)) ready += 1;
            const cont = info.byDemand.get(d.demandId);
            // Of the students who could stay with a teacher they had, how many do.
            const possible = cont ? cont.teachers.filter((x) => {
                const tp = (appData.teacherProfiles || []).find((t) => t.id === x.teacherProfileId);
                return tp && !api.teacherLimitReason(api.defaultTeacherProfile(tp), d);
            }) : [];
            if (possible.length) {
                keepable += Math.max(...possible.map((x) => x.count));
                const hit = asg && possible.find((x) => x.teacherProfileId === asg.teacherProfileId);
                if (hit) kept += hit.count;
            }
            if (asg && asg.teacherProfileId) {
                meetings.forEach((m) => {
                    const key = `${asg.teacherProfileId}|${Number(m.dow)}`;
                    if (!perTeacherDay.has(key)) perTeacherDay.set(key, []);
                    perTeacherDay.get(key).push(Number(m.period));
                    loads.set(asg.teacherProfileId, (loads.get(asg.teacherProfileId) || 0) + 1);
                });
            }
        });
        let longest = 0;
        let holes = 0;
        perTeacherDay.forEach((list) => {
            longest = Math.max(longest, api.longestRun(list));
            const nums = [...new Set(list)].sort((a, b) => a - b);
            for (let i = 1; i < nums.length; i += 1) if (nums[i] - nums[i - 1] === 2) holes += 1;
        });
        const all = (appData.teacherProfiles || []).map((t) => loads.get(t.id) || 0);
        return {
            total: demands.length,
            ready,
            keptShare: keepable ? kept / keepable : null,
            longestRun: longest,
            holes,
            loadMin: all.length ? Math.min(...all) : 0,
            loadMax: all.length ? Math.max(...all) : 0,
            clashes: (draft.issues || []).filter((i) => ['teacher_double_booked', 'cohort_double_booked', 'room_conflict'].includes(i.code)).length
        };
    }

    function signature(draft) {
        return (draft.assignments || [])
            .map((a) => `${a.demandId}>${a.teacherProfileId || ''}>${(a.meetings || []).map((m) => `${m.dow}:${m.period}`).sort().join(',')}`)
            .sort()
            .join('|');
    }

    /** A few different plans from the same starting board. Each: { id, draft, result, stats }. */
    function buildOptions(appData, draft, analysis) {
        const seen = new Set();
        const out = [];
        Object.keys(PRIORITIES).forEach((id) => {
            const copy = JSON.parse(JSON.stringify(draft));
            const result = autoSchedule(appData, copy, { analysis, priority: id });
            const sig = signature(copy);
            if (seen.has(sig)) return;
            seen.add(sig);
            out.push({ id, draft: copy, result, stats: planStats(appData, copy, analysis) });
        });
        return out;
    }

    global.CCPPlannerAuto = {
        PRIORITIES,
        termRoster,
        analysePreviousTerm,
        autoSchedule,
        planStats,
        buildOptions,
        resolveClashes,
        clashOptions,
        termHasStarted
    };
})(typeof window !== 'undefined' ? window : globalThis);
