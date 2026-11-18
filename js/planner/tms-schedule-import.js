/**
 * TMS schedule -> planner draft. Pure: no DOM, no network, nothing is written to TMS.
 * window.CCPTmsScheduleImport
 *
 * Takes the placements the read-only TMS scrape returns (teacher, day, time, cohort, subject) and matches
 * them to the calendar's OWN cohorts, classes and teachers. The result is a draft (a snapshot you can compare
 * with other drafts) and a report of everything that did not match, so nothing is silently dropped.
 * It never creates or changes cohorts, classes or teachers in the calendar.
 */
(function (global) {
    const DOW = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };

    function P() {
        return global.CCPTeacherPlanner;
    }

    function norm(v) {
        return String(v == null ? '' : v).trim();
    }

    /** "NavyM^2609" -> { key: 'navym', term: '2609' }. */
    function cohortKey(raw) {
        const text = norm(raw);
        const m = text.match(/\^([^\s^]+)\s*$/);
        return { key: text.replace(/\^.*$/, '').replace(/\s+/g, '').toLowerCase(), term: m ? m[1] : '' };
    }

    function nameKey(raw) {
        return norm(raw).replace(/\s+/g, '').toLowerCase();
    }

    const mins = (s) => {
        const [h, m] = String(s).split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };

    /** The period whose start time is closest to this clock time. */
    function periodFinder(appData) {
        const TT = global.CCPTeacherTimetable;
        const slots = (appData.timetableTimeSlots && appData.timetableTimeSlots.length)
            ? appData.timetableTimeSlots
            : (TT && TT.getDefaultTimetableTimeSlots ? TT.getDefaultTimetableTimeSlots() : []);
        const map = (appData.periodSlotMap && Object.keys(appData.periodSlotMap).length)
            ? appData.periodSlotMap
            : (TT && TT.getDefaultPeriodSlotMap ? TT.getDefaultPeriodSlotMap() : {});
        return (start) => {
            let best = null;
            Object.keys(map).forEach((p) => {
                const slot = slots.find((s) => s.id === map[p]);
                if (!slot) return;
                const d = Math.abs(mins(slot.start) - mins(start));
                if (!best || d < best.d) best = { d, p: Number(p) };
            });
            return best ? best.p : null;
        };
    }

    /**
     * @param {Object} appData the calendar (cohorts, classes, teacherProfiles)
     * @param {{ placements: Array }} tms  rows { teacherName|teacher, day, start, end, cohortName|cohort, subject }
     * @param {{ term?: string, label?: string, now?: Date }} [options]
     *   term: only this TMS term suffix (e.g. "2609"); omitted = the term that matches the most calendar cohorts.
     * @returns {{ draft: Object, report: Object }}
     */
    function buildDraftFromTms(appData, tms, options) {
        const api = P();
        const opts = options || {};
        const rows = ((tms && tms.placements) || []).map((p) => {
            const c = cohortKey(p.cohortName != null ? p.cohortName : p.cohort);
            return {
                teacher: norm(p.teacherName != null ? p.teacherName : p.teacher),
                dow: DOW[String(p.day || '').toLowerCase()] || 0,
                start: norm(p.start),
                subject: norm(p.subject),
                day: String(p.day || '').toLowerCase(),
                cohort: c.key,
                cohortRaw: norm(p.cohortName != null ? p.cohortName : p.cohort),
                term: c.term
            };
        }).filter((r) => r.dow && r.cohort && r.start);

        const cohorts = appData.cohorts || [];
        const cohortByKey = new Map(cohorts.map((c) => [nameKey(c.name), c]));
        // TMS class names often differ from calendar cohort names (Korean vs English, etc.). The links saved by
        // the roster sync ("this TMS class is that cohort") fill in whatever the names alone do not match.
        const byId = new Map(cohorts.map((c) => [String(c.id), c]));
        const links = appData.tmsRosterLinks && typeof appData.tmsRosterLinks === 'object' ? appData.tmsRosterLinks : {};
        Object.keys(links).forEach((k) => {
            const e = links[k];
            if (!e || e.action !== 'map' || !byId.has(String(e.cohortId))) return;
            const key = cohortKey(e.tmsClassName || k).key;
            if (key && !cohortByKey.has(key)) cohortByKey.set(key, byId.get(String(e.cohortId)));
        });
        const skipped = new Set();
        Object.keys(links).forEach((k) => {
            const e = links[k];
            if (e && e.action === 'skip') skipped.add(cohortKey(e.tmsClassName || k).key);
        });
        const known = new Set(cohortByKey.keys());

        // Which TMS term lines up with this calendar: the one that matches the most cohorts.
        const termScore = new Map();
        rows.forEach((r) => {
            if (!r.term || !known.has(r.cohort)) return;
            if (!termScore.has(r.term)) termScore.set(r.term, new Set());
            termScore.get(r.term).add(r.cohort);
        });
        // On a tie, prefer the term that is running now (YYMM <= this month, newest of those) over a term that
        // has not started yet: TMS timetables also hold next term's classes (e.g. 2612 while 2609 is running).
        const nowDate = opts.now || new Date();
        const nowYm = (nowDate.getFullYear() % 100) * 100 + (nowDate.getMonth() + 1);
        const termRank = (term) => {
            const n = Number(term) || 0;
            return n <= nowYm ? nowYm - n : 10000 + (n - nowYm);
        };
        const terms = Array.from(termScore.entries()).map(([term, set]) => ({ term, cohorts: set.size }))
            .sort((a, b) => b.cohorts - a.cohorts || termRank(a.term) - termRank(b.term));
        const wantTerm = opts.term === 'all' ? '' : (opts.term || (terms[0] && terms[0].term) || '');
        const used = rows.filter((r) => (!wantTerm || !r.term || r.term === wantTerm) && !skipped.has(r.cohort));

        const profiles = appData.teacherProfiles || [];
        const profileByName = new Map(profiles.map((t) => [nameKey(t.name), t]));
        const periodFor = periodFinder(appData);
        const classes = appData.classes || [];

        const report = {
            term: wantTerm,
            terms,
            placements: rows.length,
            used: used.length,
            matched: 0,
            unmatchedCohorts: [],
            unmatchedClasses: [],
            unmatchedTeachers: [],
            multiTeacherClasses: [],
            mergedClasses: [],
            trace: [],
            classesWithoutTms: 0
        };
        const tally = (list, key, extra) => {
            const hit = list.find((x) => x.key === key);
            if (hit) hit.count += 1;
            else list.push(Object.assign({ key, count: 1 }, extra || {}));
        };

        // Row-by-row record of what was read and where it went (shown in Tools, TMS import details).
        const trace = (r, status, cls) => report.trace.push({
            teacher: r.teacher, day: r.day, start: r.start, cohort: r.cohortRaw, subject: r.subject, status,
            className: cls ? cls.name : '', period: periodFor(r.start)
        });
        rows.forEach((r) => {
            if (skipped.has(r.cohort)) trace(r, 'skipped');
            else if (wantTerm && r.term && r.term !== wantTerm) trace(r, 'other-term');
        });

        // One bucket per calendar class.
        const buckets = new Map();
        used.forEach((r) => {
            const cohort = cohortByKey.get(r.cohort);
            if (!cohort) {
                trace(r, 'no-cohort');
                tally(report.unmatchedCohorts, r.cohortRaw, { name: r.cohortRaw, days: [] });
                const u = report.unmatchedCohorts.find((x) => x.key === r.cohortRaw);
                if (u && !u.days.includes(r.dow)) u.days.push(r.dow);
                return;
            }
            const subject = api.normalizeSubject(r.subject);
            const mine = classes.filter((k) => (k.cohortIds || [k.cohortId]).includes(cohort.id));
            // Classes left out of the plan (e.g. the extra class of a merged pair) only count when nothing else fits.
            const live = mine.filter((k) => k.plannerExcluded !== true);
            const candidates = (live.length ? live : mine).filter((k) => api.subjectOfName(k.name) === subject);
            // Several classes of one subject in a cohort: take the first that has no bucket yet, else the first.
            const cls = candidates.find((k) => !buckets.has(k.id)) || candidates[0];
            if (!cls) { trace(r, 'no-class'); }
            if (!cls) return tally(report.unmatchedClasses, `${r.cohortRaw}|${r.subject}`, { cohort: r.cohortRaw, cohortId: cohort.id, subject: r.subject });
            if (!buckets.has(cls.id)) buckets.set(cls.id, { cls, rows: [] });
            buckets.get(cls.id).rows.push(r);
            trace(r, 'placed', cls);
            report.matched += 1;
        });

        // Merged classes: one teacher cannot teach two classes in the same period, so two cohorts listed for the
        // same teacher, day and time (TMS shows both cohort names in the cell) are one merged class.
        const atSlot = new Map();
        used.forEach((r) => {
            const k = `${r.teacher}|${r.dow}|${r.start}`;
            if (!atSlot.has(k)) atSlot.set(k, []);
            atSlot.get(k).push(r);
        });
        const mergedBy = new Map();
        atSlot.forEach((slotRows) => {
            const byCohort = new Map();
            slotRows.forEach((r) => { if (!byCohort.has(r.cohort)) byCohort.set(r.cohort, r); });
            if (byCohort.size < 2) return;
            const members = Array.from(byCohort.values()).filter((m) => cohortByKey.has(m.cohort));
            if (members.length < 2) return;
            const key = `${members[0].teacher}|${members.map((m) => m.cohort).sort().join('+')}|${members.map((m) => api.normalizeSubject(m.subject)).sort().join('+')}`;
            if (!mergedBy.has(key)) {
                const cohortObjs = members.map((m) => cohortByKey.get(m.cohort)).filter(Boolean);
                const together = cohortObjs.length === members.length && classes.some((k) => {
                    const ids = k.cohortIds || [k.cohortId];
                    return cohortObjs.every((c) => ids.includes(c.id));
                });
                mergedBy.set(key, {
                    teacher: members[0].teacher,
                    cohorts: members.map((m) => m.cohortRaw),
                    cohortIds: cohortObjs.map((c) => c.id),
                    subject: members[0].subject,
                    subjectKey: api.normalizeSubject(members[0].subject),
                    periods: 0,
                    calendarMerged: together
                });
            }
            mergedBy.get(key).periods += 1;
        });
        report.mergedClasses = Array.from(mergedBy.values());

        const stamp = (opts.now || new Date()).toISOString();
        const assignments = [];
        let n = 0;
        buckets.forEach(({ cls, rows: list }) => {
            const seen = new Set();
            const meetings = [];
            list.forEach((r) => {
                const period = periodFor(r.start);
                if (period == null) return;
                const k = `${r.dow}|${period}`;
                if (seen.has(k)) return;
                seen.add(k);
                n += 1;
                meetings.push({ meetingId: `mtg-tms-${n}`, dow: r.dow, period: String(period) });
            });
            // The teacher with most of this class's periods; others are reported.
            const count = new Map();
            list.forEach((r) => count.set(r.teacher, (count.get(r.teacher) || 0) + 1));
            const names = Array.from(count.entries()).sort((a, b) => b[1] - a[1]);
            const top = names[0] ? names[0][0] : '';
            if (names.length > 1) report.multiTeacherClasses.push({ classId: cls.id, name: cls.name, teachers: names.map((x) => x[0]) });
            const prof = top ? profileByName.get(nameKey(top)) : null;
            if (top && !prof) tally(report.unmatchedTeachers, top, { name: top });
            assignments.push({
                assignmentId: `asg-tms-${assignments.length + 1}`,
                demandId: `demand:${cls.id}`,
                classId: cls.id,
                teacherProfileId: prof ? prof.id : null,
                userId: prof ? prof.userId || null : null,
                roomId: null,
                meetings,
                locked: false,
                manualKeep: true,
                source: 'tms'
            });
        });
        report.classesWithoutTms = classes.filter((k) => !buckets.has(k.id)).length;

        const draft = {
            id: `draft-tms-${stamp.replace(/\D/g, '').slice(0, 14)}`,
            label: opts.label || `TMS ${stamp.slice(0, 16).replace('T', ' ')}`,
            status: 'ready',
            source: 'tms',
            createdAt: stamp,
            updatedAt: stamp,
            assignments,
            issues: [],
            metrics: {}
        };
        if (api && typeof api.recomputeDraftMetrics === 'function') {
            try { api.recomputeDraftMetrics(appData, draft); } catch (_) { /* metrics are optional here */ }
        }
        return { draft, report };
    }

    global.CCPTmsScheduleImport = { buildDraftFromTms, cohortKey };
    if (typeof module !== 'undefined' && module.exports) module.exports = global.CCPTmsScheduleImport;
})(typeof window !== 'undefined' ? window : globalThis);
