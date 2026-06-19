/**
 * Term rollover wizard — clone calendar data and shift class/event dates.
 */
(function (global) {
    function parseYearMonth(ym) {
        const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
        if (!m) {
            return null;
        }
        return { year: Number(m[1]), month: Number(m[2]) };
    }

    function addMonthsYearMonth(ym, delta) {
        const parsed = parseYearMonth(ym);
        if (!parsed) {
            return ym;
        }
        let month = parsed.month + delta;
        let year = parsed.year;
        while (month > 12) {
            month -= 12;
            year += 1;
        }
        while (month < 1) {
            month += 12;
            year -= 1;
        }
        return `${year}-${String(month).padStart(2, '0')}`;
    }

    function shiftIsoDate(dateStr, monthDelta) {
        const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) {
            return dateStr;
        }
        const ym = addMonthsYearMonth(`${m[1]}-${m[2]}`, monthDelta);
        const parts = ym.split('-');
        const day = Math.min(Number(m[3]), 28);
        return `${parts[0]}-${parts[1]}-${String(day).padStart(2, '0')}`;
    }

    function shiftYearMonthField(value, monthDelta) {
        if (!value) {
            return value;
        }
        if (/^\d{4}-\d{2}$/.test(value)) {
            return addMonthsYearMonth(value, monthDelta);
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return shiftIsoDate(value, monthDelta);
        }
        return value;
    }

    function newEntityId(prefix) {
        if (global.CCPUtils && global.CCPUtils.newId) {
            return global.CCPUtils.newId(prefix);
        }
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    }

    /**
     * @param {object} source app data
     * @param {{ newName?: string, monthShift?: number, clearClassroom?: boolean }} opts
     */
    function buildClonedCalendarData(source, opts) {
        const options = opts || {};
        const monthShift = Number(options.monthShift) || 0;
        const cloned = JSON.parse(JSON.stringify(source || {}));
        const idMap = new Map();

        if (options.newName) {
            cloned.calendarName = String(options.newName).trim();
        } else if (cloned.calendarName) {
            cloned.calendarName = `${cloned.calendarName} (copy)`;
        }

        if (cloned.termStart) {
            cloned.termStart = shiftYearMonthField(cloned.termStart, monthShift);
        }
        if (cloned.termEnd) {
            cloned.termEnd = shiftYearMonthField(cloned.termEnd, monthShift);
        }

        (cloned.classes || []).forEach((cls) => {
            if (!cls) {
                return;
            }
            const oldId = cls.id;
            const newId = newEntityId('cls');
            idMap.set(oldId, newId);
            cls.id = newId;
            if (cls.startDate) {
                cls.startDate = shiftYearMonthField(cls.startDate, monthShift);
            }
            if (cls.endDate) {
                cls.endDate = shiftYearMonthField(cls.endDate, monthShift);
            }
            (cls.syllabusRows || []).forEach((row) => {
                if (row && row.date) {
                    row.date = shiftIsoDate(row.date, monthShift);
                }
            });
        });

        (cloned.events || []).forEach((ev) => {
            if (!ev) {
                return;
            }
            ev.id = newEntityId('evt');
            if (ev.startDate) {
                ev.startDate = shiftIsoDate(ev.startDate, monthShift);
            }
            if (ev.endDate) {
                ev.endDate = shiftIsoDate(ev.endDate, monthShift);
            }
            if (ev.date) {
                ev.date = shiftIsoDate(ev.date, monthShift);
            }
        });

        if (options.clearClassroom) {
            cloned.attendanceSessions = [];
            cloned.homeworkCompletions = [];
            cloned.studentPoints = [];
            cloned.studentTests = [];
            cloned.dayNotes = [];
        } else {
            const remapClassId = (id) => idMap.get(id) || id;
            (cloned.attendanceSessions || []).forEach((s) => {
                if (s) {
                    s.id = newEntityId('att');
                    s.classId = remapClassId(s.classId);
                    if (s.date) {
                        s.date = shiftIsoDate(s.date, monthShift);
                    }
                }
            });
            (cloned.homeworkCompletions || []).forEach((h) => {
                if (h) {
                    h.id = newEntityId('hw');
                    h.classId = remapClassId(h.classId);
                    if (h.lessonDate) {
                        h.lessonDate = shiftIsoDate(h.lessonDate, monthShift);
                    }
                }
            });
            (cloned.studentPoints || []).forEach((p) => {
                if (p) {
                    p.id = newEntityId('pt');
                    p.classId = remapClassId(p.classId);
                    if (p.date) {
                        p.date = shiftIsoDate(p.date, monthShift);
                    }
                }
            });
            (cloned.studentTests || []).forEach((t) => {
                if (t) {
                    t.id = newEntityId('tst');
                    t.classId = remapClassId(t.classId);
                    if (t.testDate) {
                        t.testDate = shiftIsoDate(t.testDate, monthShift);
                    }
                }
            });
            (cloned.dayNotes || []).forEach((n) => {
                if (n) {
                    n.id = newEntityId('dn');
                    n.classId = remapClassId(n.classId);
                    if (n.date) {
                        n.date = shiftIsoDate(n.date, monthShift);
                    }
                }
            });
        }

        (cloned.cohorts || []).forEach((c) => {
            if (!c || !Array.isArray(c.classIds)) {
                return;
            }
            c.classIds = c.classIds.map((id) => idMap.get(id) || id);
            (c.subjectSlots || []).forEach((slot) => {
                if (slot && slot.classId) {
                    slot.classId = idMap.get(slot.classId) || slot.classId;
                }
            });
        });

        return cloned;
    }

    global.CCPTermCloneWizard = {
        buildClonedCalendarData,
        shiftIsoDate,
        addMonthsYearMonth
    };
})(typeof window !== 'undefined' ? window : globalThis);
