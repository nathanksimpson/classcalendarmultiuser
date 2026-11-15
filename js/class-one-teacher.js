/**
 * One teacher and one curriculum per class (Nov 2026).
 *
 * A class's times (days, periods, placements) and curriculum live on the class. Its teacher row
 * only says who teaches it: { id, userId, name, category }. Substitutes are added by date, not as
 * a second teacher.
 *
 * tidyClassToOneTeacher runs on every load (migrateData in app.js), so this file loads on every
 * page that loads app.js. It is pure: no DOM, no other modules.
 */
(function (global) {
    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function toInt(v) {
        if (v == null || v === '') return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
    }

    function normalizeDays(days) {
        if (!Array.isArray(days)) return [];
        const out = [];
        days.forEach((d) => {
            const n = toInt(d);
            if (n != null && n >= 0 && n <= 6 && !out.includes(n)) out.push(n);
        });
        return out.sort((a, b) => a - b);
    }

    function classDays(classData) {
        const days = normalizeDays(classData && classData.meetingDays);
        if (days.length) return days;
        const d = toInt(classData && classData.dayOfWeek);
        return d != null && d >= 0 && d <= 6 ? [d] : [];
    }

    function classPeriodFor(classData, dow) {
        const map = classData && classData.periodByWeekday;
        if (map && typeof map === 'object') {
            const p = toInt(map[String(dow)]);
            if (p != null && p >= 1) return p;
        }
        const p = toInt(classData && classData.period);
        return p != null && p >= 1 ? p : null;
    }

    /** Placements a teacher row holds on its own (older data), or [] when it follows the class. */
    function teacherRowOwnPlacements(classData, row) {
        const r = row || {};
        const out = [];
        const push = (dow, period) => {
            const d = toInt(dow);
            const p = toInt(period);
            if (d == null || d < 0 || d > 6 || p == null || p < 1) return;
            if (out.some((x) => x.dow === d && x.period === p)) return;
            out.push({ dow: d, period: p });
        };
        if (Array.isArray(r.placements) && r.placements.length) {
            r.placements.forEach((pl) => push(pl && pl.dow, pl && pl.period));
            if (out.length) return out;
        }
        const ownDays = normalizeDays(r.meetingDays);
        const days = ownDays.length ? ownDays : classDays(classData);
        if (r.periodByWeekday && typeof r.periodByWeekday === 'object') {
            days.forEach((dow) => {
                if (r.periodByWeekday[String(dow)] !== undefined) push(dow, r.periodByWeekday[String(dow)]);
            });
            if (out.length) return out;
        }
        const rowPeriod = toInt(r.period);
        if (rowPeriod != null && rowPeriod >= 1) {
            days.forEach((dow) => push(dow, rowPeriod));
            if (out.length) return out;
        }
        if (ownDays.length) {
            ownDays.forEach((dow) => push(dow, classPeriodFor(classData, dow)));
        }
        return out;
    }

    /**
     * Keeps the first teacher, moves that row's own days and periods onto the class (when the class
     * has no placements yet), fills an empty class curriculum from it, and strips the row to who
     * teaches it. Returns what was dropped so the page can say so once. Safe to run on every load.
     */
    function tidyClassToOneTeacher(classData) {
        const report = { changed: false, droppedTeachers: [], curriculumConflict: '' };
        if (!classData || !Array.isArray(classData.classTeachers)) {
            return report;
        }
        const rows = classData.classTeachers.filter((r) => r && typeof r === 'object');
        if (!rows.length) {
            if (classData.classTeachers.length) {
                classData.classTeachers = [];
                report.changed = true;
            }
            return report;
        }
        const first = rows[0];
        rows.slice(1).forEach((r) => {
            const label = normalizeStr(r.name) || normalizeStr(r.userId);
            if (label) report.droppedTeachers.push(label);
        });

        const hasClassPlacements = Array.isArray(classData.placements) && classData.placements.length > 0;
        if (!hasClassPlacements) {
            const own = teacherRowOwnPlacements(classData, first);
            if (own.length) {
                classData.placements = own;
                classData.meetingDays = [...new Set(own.map((p) => p.dow))].sort((a, b) => a - b);
                const byWd = {};
                own.forEach((p) => {
                    if (byWd[String(p.dow)] === undefined) byWd[String(p.dow)] = p.period;
                });
                classData.periodByWeekday = byWd;
                classData.period = own[0].period;
                classData.dayOfWeek = classData.meetingDays.length === 1 ? classData.meetingDays[0] : null;
                report.changed = true;
            }
        }

        const rowCurriculum = normalizeStr(first.curriculumId);
        const classCurriculum = normalizeStr(classData.curriculumId);
        if (rowCurriculum && !classCurriculum) {
            classData.curriculumId = rowCurriculum;
            report.changed = true;
        } else if (rowCurriculum && rowCurriculum !== classCurriculum) {
            report.curriculumConflict = rowCurriculum;
        }

        const slim = {
            id: normalizeStr(first.id),
            userId: normalizeStr(first.userId),
            name: normalizeStr(first.name),
            category: normalizeStr(first.category)
        };
        const sameShape = rows.length === 1
            && classData.classTeachers.length === 1
            && Object.keys(first).length === 4
            && Object.keys(slim).every((k) => first[k] === slim[k]);
        if (!sameShape) {
            classData.classTeachers = [slim];
            report.changed = true;
        }
        return report;
    }

    global.CCPClassOneTeacher = {
        tidyClassToOneTeacher,
        teacherRowOwnPlacements
    };
})(typeof window !== 'undefined' ? window : globalThis);
