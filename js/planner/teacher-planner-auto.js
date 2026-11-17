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

    /** How long the plan options may take in total (ms) before the best found so far is returned. */
    const DEFAULT_TIME_LIMIT_MS = 6000;

    const PRIORITIES = {
        continuity: { continuity: 1.6, breaks: 1, balance: 0.6 },
        breaks: { continuity: 0.6, breaks: 2.6, balance: 0.6 },
        balance: { continuity: 0.8, breaks: 1, balance: 3 }
    };

    /** What kind of class this is: its class type, else the subject in its name ("Blue M · Grammar" -> grammar). */
    /** The subject of a class, spelled one way (shared with the TMS import): see CCPTeacherPlanner.subjectOfName. */
    const subjectOfName = (name) => P().subjectOfName(name);

    function typeKeyOf(d) {
        // The name decides first: two classes with different class types can still be the same subject.
        const bySubject = subjectOfName(d.name);
        if (bySubject) return `name:${bySubject}`;
        const type = String(d.classTypeId || '').trim();
        return type ? `type:${type}` : `name:${String(d.demandId || '')}`;
    }

    /**
     * Every "how much do we like it" number auto-schedule uses, in one place (higher score = better).
     * Hard rules are never traded against these; they only choose between allowed options.
     * `slot*` terms rank one period for one class, `pick*` terms rank a teacher for a class.
     */
    const SOFT_WEIGHTS = Object.freeze({
        slotEarlier: -0.4,            // per position in the students' hours: earlier first
        slotOutsideOwnBlock: -10,     // Purple outside its own block (primary early, secondary later)
        slotNoRoom: -40,              // no room free that seats the class
        slotRainbowIn23: 8,           // Red to Navy in periods 2 or 3
        slotRainbowElsewhere: -4,     // Red to Navy in any other period
        slotSameBlockDay: 8,          // a cohort's period it already uses on its other days
        slotNewBlockDay: -6,          // a different block from its other days
        slotNextToCohortClass: 6,     // directly next to another class of the cohort that day
        slotCohortHolePerPeriod: -6,  // per free period away from the cohort's other classes
        slotTeacherNextTo: 1.5,       // next to another class of this teacher (times the breaks priority)
        slotPreferred: 1,             // teacher's preferred day or period
        slotDiscouraged: -3,          // teacher's discouraged day or period, or avoided first/last period
        slotContinuity: 4,            // same time as last term (times the continuity priority)
        dayExtraSplit: -3,            // each split of a teacher's day beyond one break
        dayRunAtLimit: -3,            // a run of classes at the longest allowed
        pickMissingPeriod: -60,       // per period of the class that could not be placed with this teacher
        pickContinuity: 100,          // teacher taught these students last term (times priority and match)
        pickBalance: -20,             // teacher's share of the weekly load (times the balance priority)
        pickSameSubject: 12           // teacher already teaches this subject to another cohort
    });

    /** Separate stretches of classes in a teacher's day (back-to-back classes are one stretch). */
    function teachingBlocks(periods) {
        const nums = [...new Set(periods.map(Number))].sort((a, b) => a - b);
        let blocks = nums.length ? 1 : 0;
        for (let i = 1; i < nums.length; i += 1) if (nums[i] - nums[i - 1] > 1) blocks += 1;
        return blocks;
    }

    /**
     * How pleasant a teacher's day is (higher is better). Breaks are allowed, of any length, and never
     * forbidden; teachers prefer them grouped, so every extra stretch of classes (a split break) costs a little.
     * Long runs cost too.
     */
    function dayShapeScore(periods, runLimit) {
        const nums = [...periods].sort((a, b) => a - b);
        if (nums.length < 2) return 0;
        let score = 0;
        score += SOFT_WEIGHTS.dayExtraSplit * Math.max(0, teachingBlocks(nums) - 2); // one break is fine; each further split costs
        const run = P().longestRun(nums);
        if (run >= runLimit) score += SOFT_WEIGHTS.dayRunAtLimit; // at the limit: allowed, not liked
        return score;
    }

    /**
     * Independent rule check of a draft (does not use the placement code, so it catches its mistakes).
     * Returns a list of { code, demandId, dow, period, meetings, auto, message }; `auto` is true when one of the
     * meetings was placed by auto-schedule (options.fresh = that set; without it every meeting counts as auto).
     * Rules: no double-booking (teacher, cohort, room); a class once a day, and one class of a kind per cohort a day;
     * cohort day (2 periods MWF / 3 Tue-Thu, back to back) and one block on every day; cohort days; student hours;
     * teacher type, limits, blocked times, daily/weekly maximums, longest run; the first period unless switched on.
     */
    function verifyDraft(appData, draft, options) {
        const api = P();
        const opts = options || {};
        const fresh = opts.fresh || null;
        const demands = api.buildDemandsFromAppData(appData).filter((d) => d.includedInDraft !== false);
        const demandById = new Map(demands.map((d) => [d.demandId, d]));
        const teacherById = new Map((appData.teacherProfiles || []).map((t) => [t.id, api.defaultTeacherProfile(t)]));
        const runLimit = api.maxConsecutive(appData);
        const blockouts = (appData.plannerState && appData.plannerState.blockouts) || {};
        const allPeriods = periodNumbers(appData);
        const useFirst = !!(appData.plannerState && appData.plannerState.useFirstPeriod === true);
        const rows = [];
        (draft.assignments || []).forEach((asg) => {
            const demand = demandById.get(asg.demandId);
            if (!demand || demand.special) return;
            (asg.meetings || []).forEach((m) => rows.push({ asg, demand, m, dow: Number(m.dow), n: Number(m.period) }));
        });
        const isAuto = (r) => !fresh || fresh.has(r.m);
        const out = [];
        const add = (code, list) => {
            const r = list[0];
            const message = (api.RULES[code] || {}).message || code;
            out.push({ code, demandId: r.demand.demandId, dow: r.dow, period: String(r.n), meetings: list.map((x) => x.m), auto: list.some(isAuto), message });
        };
        const group = (keyOf) => {
            const map = new Map();
            rows.forEach((r) => keyOf(r).forEach((k) => { if (!map.has(k)) map.set(k, []); map.get(k).push(r); }));
            return map;
        };
        const distinct = (list) => list.filter((r, i) => list.findIndex((x) => x.m === r.m) === i);
        // Double-booking.
        group((r) => (r.asg.teacherProfileId ? [`${r.asg.teacherProfileId}|${r.dow}|${r.n}`] : [])).forEach((l) => {
            if (distinct(l).length > 1) add('teacher_double_booked', l);
        });
        group((r) => (r.demand.cohortIds || []).map((c) => `${c}|${r.dow}|${r.n}`)).forEach((l) => {
            if (distinct(l).length > 1) add('cohort_double_booked', l);
        });
        group((r) => { const id = api.meetingRoomId(r.asg, r.m); return id ? [`${id}|${r.dow}|${r.n}`] : []; }).forEach((l) => {
            if (distinct(l).length > 1) add('room_double_booked', l);
        });
        // A class once a day (unless it meets more often than it has days); one class of a kind per cohort a day.
        group((r) => [`${r.asg.assignmentId}|${r.dow}`]).forEach((l) => {
            const days = api.classAllowedDays(appData, l[0].demand) || [1, 2, 3, 4, 5];
            if (distinct(l).length > 1 && !api.mustDoubleUp(l[0].demand, days)) add('class_twice_a_day', l);
        });
        group((r) => (r.demand.cohortIds || []).map((c) => `${c}|${r.dow}|${typeKeyOf(r.demand)}`)).forEach((l) => {
            if (new Set(l.map((r) => r.demand.demandId)).size > 1) add('same_kind_same_day', l);
        });
        // Cohort day shape, and one block on every day it comes.
        const cohortDay = group((r) => (r.demand.cohortIds || []).map((c) => `${c}|${r.dow}`));
        cohortDay.forEach((l, key) => {
            const dow = Number(key.split('|')[1]);
            const nums = [...new Set(l.map((r) => r.n))];
            if (api.cohortDayBroken(nums, dow)) add('cohort_day_shape', l);
        });
        group((r) => (r.demand.cohortIds || []).map((c) => String(c))).forEach((l) => {
            const nums = [...new Set(l.map((r) => r.n))];
            if (api.cohortDayBroken(nums, l[0].dow)) add('cohort_block', l);
        });
        // Per meeting rules.
        rows.forEach((r) => {
            const teacher = r.asg.teacherProfileId ? teacherById.get(r.asg.teacherProfileId) : null;
            const days = api.classAllowedDays(appData, r.demand);
            if (days && !days.includes(r.dow)) add('off_day', [r]);
            if (api.outsideStudentHours(appData, r.demand, r.n, r.dow)) add('outside_student_hours', [r]);
            if (!useFirst && allPeriods.length > 1 && r.n === allPeriods[0] && isAuto(r)) add('first_period', [r]);
            if (teacher) {
                if (api.teacherLimitReason(teacher, r.demand)) add('wrong_teacher', [r]);
                if (api.teacherUnavailable(appData, teacher, r.dow, r.n, blockouts)) add('teacher_unavailable', [r]);
            }
        });
        // Teacher day and week limits.
        group((r) => (r.asg.teacherProfileId ? [`${r.asg.teacherProfileId}|${r.dow}`] : [])).forEach((l, key) => {
            const t = teacherById.get(key.split('|')[0]);
            const nums = [...new Set(l.map((r) => r.n))];
            if (!t) return;
            if (api.teacherDayLimitBroken(t, nums, runLimit)) add('teacher_day_limit', l);
        });
        group((r) => (r.asg.teacherProfileId ? [String(r.asg.teacherProfileId)] : [])).forEach((l, key) => {
            const t = teacherById.get(key);
            if (t && api.teacherWeekLimitBroken(t, distinct(l).length)) add('teacher_week_limit', l);
        });
        return out;
    }

    /**
     * Why a class could not be placed, from the draft as it stands (works on any draft, auto or by hand).
     * Walks every day and period the class could meet in, and records the FIRST rule that rules each one out, so the
     * counts add up to the slots that were looked at. Teachers are only blamed for slots every other rule allows.
     * @returns {{ demandId, name, free: number, looked: number,
     *             blockers: Array<{ rule, count, detail?: string }>,
     *             teachers: Array<{ teacherProfileId, name, reasons: Object<string, number> }>,
     *             fixes: Array<{ rule, text }> }}
     */
    function explainUnplaced(appData, draft, demandId) {
        const api = P();
        const demands = api.buildDemandsFromAppData(appData).filter((d) => d.includedInDraft !== false);
        const demandById = new Map(demands.map((d) => [d.demandId, d]));
        const demand = demandById.get(demandId);
        const out = { demandId, name: demand ? demand.name || '' : '', free: 0, looked: 0, blockers: [], teachers: [], fixes: [] };
        if (!demand) return out;
        const counts = new Map();
        const details = new Map();
        const bump = (rule, detail) => {
            counts.set(rule, (counts.get(rule) || 0) + 1);
            if (detail && !details.has(rule)) details.set(rule, detail);
        };
        const runLimit = api.maxConsecutive(appData);
        const blockouts = (appData.plannerState && appData.plannerState.blockouts) || {};
        const allPeriods = periodNumbers(appData);
        const periods = appData.plannerState && appData.plannerState.useFirstPeriod === true ? allPeriods : allPeriods.slice(1);
        const teachers = (appData.teacherProfiles || []).map((t) => api.defaultTeacherProfile(t));
        const eligible = teachers.filter((t) => !api.teacherLimitReason(t, demand));
        const myAsg = (draft.assignments || []).find((x) => x.demandId === demandId) || null;
        const mine = (myAsg && myAsg.meetings || []).map((m) => ({ dow: Number(m.dow), n: Number(m.period) }));

        // What the rest of the draft has taken.
        const cohortDay = new Map();
        const cohortBusyBy = new Map(); // `${cid}|${dow}|${n}` -> class name
        const teacherBusyBy = new Map();
        const teacherDay = new Map();
        const load = new Map();
        const addTo = (map, k, n) => { if (!map.has(k)) map.set(k, []); map.get(k).push(n); };
        (draft.assignments || []).forEach((asg) => {
            const d = demandById.get(asg.demandId);
            if (!d || asg.demandId === demandId) return;
            (asg.meetings || []).forEach((m) => {
                const dow = Number(m.dow);
                const n = Number(m.period);
                (d.cohortIds || []).forEach((cid) => { addTo(cohortDay, `${cid}|${dow}`, n); cohortBusyBy.set(`${cid}|${dow}|${n}`, d.name || ''); });
                if (asg.teacherProfileId) {
                    teacherBusyBy.set(`${asg.teacherProfileId}|${dow}|${n}`, d.name || '');
                    addTo(teacherDay, `${asg.teacherProfileId}|${dow}`, n);
                    load.set(asg.teacherProfileId, (load.get(asg.teacherProfileId) || 0) + 1);
                }
            });
        });
        const cohortAll = (cid) => {
            const all = [];
            cohortDay.forEach((list, key) => { if (key.startsWith(`${cid}|`)) all.push(...list); });
            return all;
        };

        const days = api.classAllowedDays(appData, demand);
        const teacherWhy = new Map(eligible.map((t) => [t.id, {}]));
        if (!eligible.length) {
            bump('no_eligible_teacher', 'No teacher is set up to take this kind of class.');
        }
        if (days && !days.length) {
            bump('no_common_days', 'The cohorts of this class share no day.');
        } else {
            const dayList = days || [1, 2, 3, 4, 5];
            const key = typeKeyOf(demand);
            dayList.forEach((dow) => {
                const sameKindWith = (draft.assignments || []).map((o) => demandById.get(o.demandId))
                    .find((od, i) => od && od.demandId !== demandId && typeKeyOf(od) === key
                        && (od.cohortIds || []).some((cid) => (demand.cohortIds || []).includes(cid))
                        && ((draft.assignments[i].meetings || []).some((m) => Number(m.dow) === dow)));
                periods.forEach((n) => {
                    out.looked += 1;
                    if (mine.some((x) => x.dow === dow && x.n === n)) return bump('already_here');
                    if (mine.some((x) => x.dow === dow) && !api.mustDoubleUp(demand, days)) return bump('class_twice_a_day');
                    if (sameKindWith) return bump('same_kind_same_day', sameKindWith.name || '');
                    const busyCohort = (demand.cohortIds || []).find((cid) => cohortBusyBy.has(`${cid}|${dow}|${n}`));
                    if (busyCohort) return bump('cohort_busy', cohortBusyBy.get(`${busyCohort}|${dow}|${n}`));
                    if (api.outsideStudentHours(appData, demand, n, dow)) return bump('outside_student_hours');
                    if ((demand.cohortIds || []).some((cid) => api.cohortDayBroken((cohortDay.get(`${cid}|${dow}`) || []).concat([n]), dow))) return bump('cohort_day_shape');
                    if ((demand.cohortIds || []).some((cid) => api.cohortDayBroken(cohortAll(cid).concat([n]), dow))) return bump('cohort_block');
                    if (!eligible.length) return bump('no_eligible_teacher');
                    // Every rule on the cohort side allows it; can any eligible teacher take it?
                    const tmine = (t) => teacherDay.get(`${t.id}|${dow}`) || [];
                    let anyFree = false;
                    eligible.forEach((t) => {
                        let why = '';
                        if (teacherBusyBy.has(`${t.id}|${dow}|${n}`)) why = 'teacher_double_booked';
                        else if (api.teacherUnavailable(appData, t, dow, n, blockouts)) why = 'teacher_unavailable';
                        else if (api.teacherWeekLimitBroken(t, (load.get(t.id) || 0) + 1)) why = 'teacher_week_limit';
                        else if (api.teacherDayLimitBroken(t, tmine(t).concat([n]), runLimit)) why = 'teacher_day_limit';
                        if (!why) anyFree = true;
                        else teacherWhy.get(t.id)[why] = (teacherWhy.get(t.id)[why] || 0) + 1;
                    });
                    if (anyFree) out.free += 1;
                    else bump('no_teacher_free');
                });
            });
        }
        out.blockers = Array.from(counts.entries()).filter(([r]) => r !== 'already_here')
            .map(([rule, count]) => ({ rule, count, detail: details.get(rule) || '' }))
            .sort((x, y) => y.count - x.count);
        out.teachers = eligible.map((t) => ({ teacherProfileId: t.id, name: t.name || '', reasons: teacherWhy.get(t.id) }));

        // Fixes, from what blocks most.
        // Hours and "once a day" are how the term is set up, not something to fix: point at what can be moved.
        const structural = ['outside_student_hours', 'class_twice_a_day'];
        const top = out.blockers.find((b) => !structural.includes(b.rule)) || out.blockers[0];
        const names = eligible.map((t) => t.name).filter(Boolean).join(', ');
        if (!eligible.length) {
            out.fixes.push({ rule: 'no_eligible_teacher', text: 'Allow a teacher to take this kind of class in Setup.' });
        } else if (top) {
            if (top.rule === 'no_teacher_free') {
                out.fixes.push({ rule: top.rule, text: `Free a period for ${names}, or let another teacher take this class.` });
            } else if (top.rule === 'cohort_busy') {
                out.fixes.push({ rule: top.rule, text: `The cohort is busy at the open times${top.detail ? ` (for example ${top.detail})` : ''}: move one of its other classes.` });
            } else if (top.rule === 'cohort_day_shape' || top.rule === 'cohort_block') {
                out.fixes.push({ rule: top.rule, text: 'The cohort\'s block is full: move another of its classes to a different period, or give it a free day.' });
            } else if (top.rule === 'same_kind_same_day' || top.rule === 'class_twice_a_day') {
                out.fixes.push({ rule: top.rule, text: 'The once-a-day rule leaves no day: move the other class of this kind to another day.' });
            } else if (top.rule === 'outside_student_hours') {
                out.fixes.push({ rule: top.rule, text: 'No period is inside the students\' hours: check the cohort\'s level window.' });
            } else if (top.rule === 'no_common_days') {
                out.fixes.push({ rule: top.rule, text: 'Check the cohort days: the cohorts of this class never come on the same day.' });
            }
        }
        return out;
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
        // The first period (14:30) is ignored unless the planner's "Use the first period" setting is on.
        const allPeriods = periodNumbers(appData);
        const periods = appData.plannerState && appData.plannerState.useFirstPeriod === true ? allPeriods : allPeriods.slice(1);
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
        const loadRef = api.loadReferenceDate(appData);
        const rebuild = () => {
            [teacherBusy, cohortBusy, roomBusy, teacherDay, cohortDay, load].forEach((x) => x.clear());
            draft.assignments.forEach((asg) => {
                const demand = demandById.get(asg.demandId);
                if (!demand) return;
                (asg.meetings || []).forEach((m) => occupy(demand, asg.teacherProfileId, Number(m.dow), m.period, api.meetingRoomId(asg, m)));
                // A special class outside its dates does not count towards the weekly limit.
                if (asg.teacherProfileId && !api.countsForLoad(demand, loadRef)) {
                    load.set(asg.teacherProfileId, (load.get(asg.teacherProfileId) || 0) - (asg.meetings || []).length);
                }
            });
        };
        rebuild();
        const fresh = new Set(); // periods placed in this run (the only ones the repair step may shift)
        /** A free room for this time: the class's own if free, else the smallest free one that seats everyone. */
        const pickRoom = (asg, demand, dow, n) => {
            if (!rooms.length) return null;
            const free = (id) => id && !roomBusy.has(`${id}|${dow}|${n}`);
            if (free(asg.roomId) && !api.roomTooSmall(appData, demand, asg.roomId)) return asg.roomId;
            // A room that cannot seat the class is never used; the class is left without a room instead.
            const fits = rooms.filter((r) => free(r.id) && !api.roomTooSmall(appData, demand, r.id))
                .sort((a, b) => (Number(a.capacity) || 999) - (Number(b.capacity) || 999));
            return (fits[0] || {}).id || null;
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
            if (api.teacherWeekLimitBroken(teacher, (load.get(teacher.id) || 0) + 1)) return false;
            if (api.teacherUnavailable(appData, teacher, dow, n, blockouts)) return false;
            if (api.teacherDayLimitBroken(teacher, mine.concat([n]), runLimit)) return false;
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
            // Only days every cohort of the class comes; none in common means it cannot be placed.
            const allowed = api.classAllowedDays(appData, demand);
            return allowed || DAYS.slice();
        };

        /** Every period a cohort has on any day (its block: the same periods on every day it comes). */
        const cohortAllPeriods = (cid) => {
            const all = [];
            cohortDay.forEach((list, key) => { if (key.startsWith(`${cid}|`)) list.forEach((x) => all.push(x)); });
            return all;
        };
        /** Hard: with this period added, the cohort would use more periods overall than one day allows, or leave a hole. */
        const breaksBlock = (demand, dow, n, extra) => (demand.cohortIds || []).some((cid) => {
            const all = cohortAllPeriods(cid).concat(extra || [], [n]);
            return !!api.cohortDayBroken(all, dow);
        });
        const RAINBOW = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Navy'];
        /** Does one of this class's cohorts already have another class of the same kind on this day? */
        const sameKindThatDay = (demand, dow) => {
            const key = typeKeyOf(demand);
            return draft.assignments.some((other) => {
                if (other.demandId === demand.demandId) return false;
                const od = demandById.get(other.demandId);
                if (!od || typeKeyOf(od) !== key) return false;
                if (!(od.cohortIds || []).some((cid) => (demand.cohortIds || []).includes(cid))) return false;
                return (other.meetings || []).some((m) => Number(m.dow) === dow);
            });
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
                // A class never meets twice on the same day when auto places it (only when it needs more
                // meetings a week than it has days does it have to double up).
                const freshDays = days.filter((d) => !usedDays.has(d));
                const dayPool0 = freshDays.length ? freshDays : (count + usedDays.size > days.length ? days : []);
                // Two classes of the same kind (e.g. two Grammar classes) never share a day for a cohort.
                const dayPool = dayPool0.filter((dw) => !sameKindThatDay(demand, dw));
                dayPool.forEach((dow) => {
                    periods.forEach((n, idx) => {
                        if (picked.some((x) => x.dow === dow && x.n === n)) return;
                        if ((demand.cohortIds || []).some((cid) => cohortBusy.has(`${cid}|${dow}|${n}`))) return;
                        if (api.outsideStudentHours(appData, demand, n, dow)) return;
                        // Hard: a cohort's day is at most 2 periods on MWF / 3 on Tue/Thu, first class to last,
                        // and students never sit through a free period between two classes (one shared rule).
                        if ((demand.cohortIds || []).some((cid) => api.cohortDayBroken((cohortDay.get(`${cid}|${dow}`) || [])
                            .concat(picked.filter((x) => x.dow === dow).map((x) => x.n), [n]), dow))) return;
                        // Hard: a cohort has one block, the same periods on every day it comes (2 periods MWF, 3 Tue/Thu).
                        if (breaksBlock(demand, dow, n, picked.map((x) => x.n))) return;
                        const mine = tDay(dow);
                        if (!teacherCanTake(teacher, dow, n, mine)) return;
                        // Prefer times when a room that seats the class is free (a room is never shared or overfilled).
                        const roomFree = !rooms.length || rooms.some((r) => !roomBusy.has(`${r.id}|${dow}|${n}`)
                            && !api.roomTooSmall(appData, demand, r.id));
                        let score = SOFT_WEIGHTS.slotEarlier * idx; // earlier in the students' hours first
                        // Purple may go anywhere, but its own block (primary early, secondary later) is preferred.
                        if (api.outsideStudentHours(appData, demand, n, dow, { byBlock: true })) score += SOFT_WEIGHTS.slotOutsideOwnBlock;
                        if (!roomFree) score += SOFT_WEIGHTS.slotNoRoom;
                        // Rainbow classes (Red to Navy, not Purple) prefer periods 2 and 3 (15:20 to 17:00).
                        if (RAINBOW.includes(String(demand.level || '').trim())) score += (n === 2 || n === 3) ? SOFT_WEIGHTS.slotRainbowIn23 : SOFT_WEIGHTS.slotRainbowElsewhere;
                        // A cohort keeps the same block every day it comes (e.g. Mon, Wed and Fri all at periods 4–5):
                        // reward the periods it already uses on its other days, discourage a different block.
                        (demand.cohortIds || []).forEach((cid) => {
                            const other = new Set();
                            cohortDay.forEach((list, key) => {
                                const [c2, d2] = key.split('|');
                                if (c2 === cid && Number(d2) !== dow) list.forEach((x) => other.add(x));
                            });
                            if (!other.size) return;
                            const here = (cohortDay.get(`${cid}|${dow}`) || [])
                                .concat(picked.filter((x) => x.dow === dow).map((x) => x.n));
                            if (other.has(n)) score += SOFT_WEIGHTS.slotSameBlockDay;
                            else if (!here.length) score += SOFT_WEIGHTS.slotNewBlockDay;
                        });
                        // Students should not sit through empty periods.
                        (demand.cohortIds || []).forEach((cid) => {
                            const theirs = cohortDay.get(`${cid}|${dow}`) || [];
                            if (!theirs.length) return;
                            const dist = Math.min(...theirs.map((x) => Math.abs(x - n)));
                            score += dist === 1 ? SOFT_WEIGHTS.slotNextToCohortClass : SOFT_WEIGHTS.slotCohortHolePerPeriod * (dist - 1);
                        });
                        if (teacher) {
                            score += w.breaks * (dayShapeScore(mine.concat([n]), runLimit) - dayShapeScore(mine, runLimit));
                            if (mine.some((x) => Math.abs(x - n) === 1)) score += SOFT_WEIGHTS.slotTeacherNextTo * w.breaks;
                            if ((prefs.preferredDays || []).map(Number).includes(dow)) score += SOFT_WEIGHTS.slotPreferred;
                            if ((prefs.discouragedDays || []).map(Number).includes(dow)) score += SOFT_WEIGHTS.slotDiscouraged;
                            if ((prefs.preferredPeriods || []).map(String).includes(String(n))) score += SOFT_WEIGHTS.slotPreferred;
                            if ((prefs.discouragedPeriods || []).map(String).includes(String(n))) score += SOFT_WEIGHTS.slotDiscouraged;
                            if (prefs.avoidFirstPeriod && idx === 0) score += SOFT_WEIGHTS.slotDiscouraged;
                            if (prefs.avoidLastPeriod && idx === periods.length - 1) score += SOFT_WEIGHTS.slotDiscouraged;
                        }
                        if (prevSlots.some((s) => s.dow === dow && Number(s.period) === n)) score += SOFT_WEIGHTS.slotContinuity * w.continuity;
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
        // opts.seed: break ties between equally hard classes in another order (used to retry a tight term).
        let order = demands;
        if (opts.seed) {
            let x = Number(opts.seed) || 1;
            const rnd = () => {
                x = (x * 1103515245 + 12345) % 2147483648;
                return x / 2147483648;
            };
            order = demands.slice();
            for (let i = order.length - 1; i > 0; i -= 1) {
                const j = Math.floor(rnd() * (i + 1));
                [order[i], order[j]] = [order[j], order[i]];
            }
        }
        const todo = order
            .filter((d) => !d.special) // special classes are placed by hand only
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

        const result = { placed: 0, teachersSet: 0, unplaced: [], timedOut: false };
        // opts.deadline (epoch ms): stop placing when it passes and return what is done so far; the rest is listed as unplaced.
        const timeUp = () => !!opts.deadline && Date.now() > opts.deadline;
        const teacherPickedNow = new Set(); // assignments whose teacher this run chose

        todo.forEach(({ d: demand }) => {
            let asg = asgOf(demand);
            const missing = missingOf(demand);
            if (timeUp()) {
                result.timedOut = true;
                if (missing > 0) result.unplaced.push({ demandId: demand.demandId, missing, reason: 'time_limit' });
                return;
            }
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
                    if (api.teacherWeekLimitBroken(teacher, now + extra + missing)) return;
                    const clash = alreadyOnBoard.some((m) => teacherBusy.has(`${teacher.id}|${Number(m.dow)}|${Number(m.period)}`)
                        || api.teacherUnavailable(appData, teacher, m.dow, m.period, blockouts));
                    if (clash) return;
                }
                const slots = chooseSlots(demand, teacher, missing);
                let score = slots.score + SOFT_WEIGHTS.pickMissingPeriod * (missing - slots.picked.length);
                const kept = continuityOf(demand, teacher.id);
                if (kept) score += SOFT_WEIGHTS.pickContinuity * w.continuity * kept.score;
                score += SOFT_WEIGHTS.pickBalance * w.balance * ((now + extra + slots.picked.length) / maxWeek);
                // Preferred, not required: one teacher for the same subject across cohorts.
                if (!fixedTeacher) {
                    const key = typeKeyOf(demand);
                    const alreadyTeaches = draft.assignments.some((o) => o.teacherProfileId === teacher.id && o.demandId !== demand.demandId
                        && (() => { const od = demandById.get(o.demandId); return od && typeKeyOf(od) === key; })());
                    if (alreadyTeaches) score += SOFT_WEIGHTS.pickSameSubject;
                }
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
                teacherPickedNow.add(asg);
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
        // Would this period make a cohort of the class stay longer than allowed that day? (classes at
        // the same time are about to be moved away, so the span is counted without that period twice)
        const spanTooLong = (demand, dow, n) => (demand.cohortIds || []).some((cid) =>
            api.cohortDayBroken((cohortDay.get(`${cid}|${dow}`) || []).concat([n]), dow))
            || breaksBlock(demand, dow, n);
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
                    if (api.outsideStudentHours(appData, demand, n, dow)) continue;
                    if (spanTooLong(demand, dow, n, asg)) continue;
                    // The same hard rules as chooseSlots: once a class a day (unless it must double up), one class of a kind a day.
                    if (used.has(dow) && !api.mustDoubleUp(demand, days)) continue;
                    if (sameKindThatDay(demand, dow)) continue;
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
                    if (fixedInTheWay || inTheWay.length > 2) continue;
                    if (!inTheWay.length) {
                        // Free for the cohort and the teacher (e.g. after trying another teacher): just take it.
                        const mineFree = teacher ? (teacherDay.get(`${teacher.id}|${dow}`) || []) : [];
                        if (!teacherCanTake(teacher, dow, n, mineFree)) continue;
                        addMeeting(asg, demand, dow, n);
                        return true;
                    }
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
        while (progress && rounds < 40 && !timeUp()) {
            progress = false;
            rounds += 1;
            result.unplaced.forEach((u) => {
                if (u.missing <= 0) return;
                const demand = demandById.get(u.demandId);
                const asg = demand && asgOf(demand);
                if (!asg) return;
                let ok = tryEject(demand, asg);
                if (!ok && teacherPickedNow.has(asg) && !(asg.meetings || []).length) {
                    // Nothing placed yet and the teacher was only this run's guess: try the other teachers who may take it.
                    const first = asg.teacherProfileId;
                    ok = eligible(demand).filter((tc) => tc.id !== first).some((tc) => {
                        asg.teacherProfileId = tc.id;
                        asg.userId = tc.userId || null;
                        if (tryEject(demand, asg)) return true;
                        return false;
                    });
                    if (!ok) {
                        const back = teachers.find((tc) => tc.id === first);
                        asg.teacherProfileId = first;
                        asg.userId = back ? back.userId || null : null;
                    }
                }
                if (ok) {
                    u.missing -= 1;
                    result.placed += 1;
                    result.repaired = (result.repaired || 0) + 1;
                    progress = true;
                }
            });
        }
        result.unplaced = result.unplaced.filter((u) => u.missing > 0 || u.reason === 'no_teacher');

        /*
         * Final check. An independent pass (verifyDraft) looks for any broken rule. Anything auto-schedule placed that
         * breaks one is taken off the board (the most recently placed meeting of each problem) and placed again with the
         * full rule filter; what cannot be placed again is reported as still to place. Repeats until clean (max 6 passes).
         */
        const placedOrder = new Map();
        [...fresh].forEach((m, i) => placedOrder.set(m, i));
        let passes = 0;
        for (; passes < 6 && !timeUp(); passes += 1) {
            const bad = verifyDraft(appData, draft, { fresh }).filter((v) => v.auto);
            if (!bad.length) break;
            const drop = new Set();
            bad.forEach((v) => {
                const mine = v.meetings.filter((m) => fresh.has(m)).sort((a, b) => (placedOrder.get(b) || 0) - (placedOrder.get(a) || 0));
                if (mine.length) drop.add(mine[0]);
            });
            if (!drop.size) break;
            const affected = new Map();
            draft.assignments.forEach((asg) => {
                const gone = (asg.meetings || []).filter((m) => drop.has(m));
                if (!gone.length) return;
                asg.meetings = asg.meetings.filter((m) => !drop.has(m));
                gone.forEach((m) => fresh.delete(m));
                affected.set(asg, gone.length);
            });
            rebuild();
            affected.forEach((count, asg) => {
                const demand = demandById.get(asg.demandId);
                if (!demand) return;
                const teacher = teacherOf(asg);
                const picked = chooseSlots(demand, teacher, count).picked;
                picked.forEach((slot) => {
                    const m = addMeeting(asg, demand, slot.dow, slot.n);
                    placedOrder.set(m, placedOrder.size + 1);
                });
                const left = count - picked.length;
                if (left > 0) {
                    const u = result.unplaced.find((x) => x.demandId === demand.demandId);
                    if (u) u.missing += left;
                    else result.unplaced.push({ demandId: demand.demandId, missing: left, reason: 'no_time' });
                    result.placed -= left;
                }
            });
        }
        // What is left (hand-placed or locked classes that were already wrong are listed too, flagged auto: false).
        result.unplaced.forEach((u) => { u.why = explainUnplaced(appData, draft, u.demandId); });
        result.violations = verifyDraft(appData, draft, { fresh });
        result.rulesKept = !result.violations.some((v) => v.auto);
        result.checkPasses = passes;
        if (timeUp()) result.timedOut = true;

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
        // Locked and special classes always stay (special classes are placed by hand only).
        const fixed = (e) => e.asg.locked || !!(e.demand || demandById.get(e.asg.demandId) || {}).special;
        const rank = (e) => (fixed(e) ? 1e15 : 0) + sign * (Number(e.m.movedAt) || 0);
        const losers = new Map(); // meeting -> entry
        groups.forEach((list) => {
            const distinct = list.filter((e, i) => list.findIndex((x) => x.m === e.m) === i);
            if (distinct.length < 2) return;
            const sorted = distinct.slice().sort((a, b) => rank(b) - rank(a));
            sorted.slice(1).forEach((e) => { if (!fixed(e)) losers.set(e.m, e); });
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
                const dem = demandById.get(e.asg.demandId);
                const free = rooms.find((r) => !used.has(`${r.id}|${slot}`) && !api.roomTooSmall(appData, dem, r.id));
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
            holes += Math.max(0, teachingBlocks(nums) - 2); // split breaks: stretches of classes beyond two in one day
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
    function buildOptions(appData, draft, analysis, options) {
        const seen = new Set();
        const out = [];
        // The whole run is held to a time budget (ms) so a tight term never freezes the page; each plan gets an equal share.
        const budget = options && Number.isFinite(Number(options.timeLimitMs)) ? Number(options.timeLimitMs) : DEFAULT_TIME_LIMIT_MS;
        // options.seedOffset: a retry starts from other tie-break orders than the run before it.
        const seedOffset = options && Number.isFinite(Number(options.seedOffset)) ? Math.max(0, Math.floor(Number(options.seedOffset))) : 0;
        const started = Date.now();
        const ids = Object.keys(PRIORITIES);
        ids.forEach((id, idx) => {
            const share = Math.max(0, started + budget - Date.now()) / (ids.length - idx);
            const priorityEnd = Date.now() + share;
            // A tight term can leave a class out; then try again with ties broken in other orders.
            let copy = null;
            let result = null;
            for (let attempt = 0; attempt < 16; attempt += 1) {
                if (attempt && Date.now() >= priorityEnd) break;
                const tryDraft = JSON.parse(JSON.stringify(draft));
                const tryResult = autoSchedule(appData, tryDraft, { analysis, priority: id, seed: (attempt || seedOffset) ? (attempt + seedOffset * 16) * 7919 : 0, deadline: priorityEnd });
                const broken = (r) => (r.violations || []).filter((v) => v.auto).length * 1000;
                const missing = (r) => r.unplaced.reduce((n, u) => n + (u.missing || 0), 0) + broken(r);
                if (!result || missing(tryResult) < missing(result)) {
                    copy = tryDraft;
                    result = tryResult;
                }
                if (!missing(result)) break;
            }
            const sig = signature(copy);
            if (seen.has(sig)) return;
            seen.add(sig);
            out.push({ id, timedOut: !!result.timedOut, draft: copy, result, stats: Object.assign(planStats(appData, copy, analysis), { rulesBroken: (result.violations || []).filter((v) => v.auto).length }) });
        });
        return out;
    }

    global.CCPPlannerAuto = {
        PRIORITIES,
        DEFAULT_TIME_LIMIT_MS,
        SOFT_WEIGHTS,
        termRoster,
        analysePreviousTerm,
        autoSchedule,
        planStats,
        verifyDraft,
        explainUnplaced,
        buildOptions,
        resolveClashes,
        clashOptions,
        termHasStarted
    };
})(typeof window !== 'undefined' ? window : globalThis);
