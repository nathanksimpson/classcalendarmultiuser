/**
 * Timetable period schedule helpers (time slots + period map).
 */
(function (global) {
    const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
    const MAX_PERIODS = 12;
    const MIN_PERIODS = 1;

    function normalizeStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function parseHHMM(hhmm) {
        const m = String(hhmm || '').trim().match(HHMM);
        if (!m) {
            return null;
        }
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    }

    function computeDurationMin(start, end) {
        const a = parseHHMM(start);
        const b = parseHHMM(end);
        if (a == null || b == null || b <= a) {
            return null;
        }
        return b - a;
    }

    function syncDurationFromTimes(slot) {
        const s = slot || {};
        const dur = computeDurationMin(s.start, s.end);
        if (dur != null) {
            return Object.assign({}, s, { durationMin: dur });
        }
        return Object.assign({}, s);
    }

    function getDefaultSlots() {
        if (global.CCPTeacherTimetable && global.CCPTeacherTimetable.getDefaultTimetableTimeSlots) {
            return global.CCPTeacherTimetable.getDefaultTimetableTimeSlots().map((s) => Object.assign({}, s));
        }
        return [];
    }

    function getDefaultMap() {
        if (global.CCPTeacherTimetable && global.CCPTeacherTimetable.getDefaultPeriodSlotMap) {
            return Object.assign({}, global.CCPTeacherTimetable.getDefaultPeriodSlotMap());
        }
        return {};
    }

    function normalizeTimeSlots(slots) {
        const list = Array.isArray(slots) ? slots.slice() : [];
        const seen = new Set();
        const out = [];
        list.forEach((raw, idx) => {
            if (!raw || typeof raw !== 'object') {
                return;
            }
            const id = normalizeStr(raw.id) || `ts${idx + 1}`;
            if (seen.has(id)) {
                return;
            }
            seen.add(id);
            const start = normalizeStr(raw.start);
            const end = normalizeStr(raw.end);
            if (!HHMM.test(start) || !HHMM.test(end)) {
                return;
            }
            const synced = syncDurationFromTimes({
                id,
                start,
                end,
                durationMin: raw.durationMin,
                sortOrder: raw.sortOrder != null ? Number(raw.sortOrder) : idx + 1
            });
            out.push(synced);
        });
        out.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        out.forEach((s, i) => {
            s.sortOrder = i + 1;
        });
        return out;
    }

    function getPeriodNumbers(periodSlotMap) {
        const map = periodSlotMap && typeof periodSlotMap === 'object' ? periodSlotMap : {};
        return Object.keys(map)
            .map((k) => parseInt(k, 10))
            .filter((n) => !Number.isNaN(n) && n >= 1)
            .sort((a, b) => a - b);
    }

    function getMaxPeriodNumber(appData) {
        const map = (appData && appData.periodSlotMap) || getDefaultMap();
        const nums = getPeriodNumbers(map);
        if (nums.length) {
            return Math.max(...nums);
        }
        return 7;
    }

    function getMinPeriodNumber(appData) {
        const nums = getPeriodNumbers((appData && appData.periodSlotMap) || getDefaultMap());
        return nums.length ? Math.min(...nums) : 1;
    }

    function normalizePeriodSlotMap(map, slots) {
        const slotIds = new Set((slots || []).map((s) => s.id));
        const out = {};
        const nums = getPeriodNumbers(map);
        nums.forEach((n) => {
            const slotId = normalizeStr(map[String(n)]);
            if (slotId && slotIds.has(slotId)) {
                out[String(n)] = slotId;
            }
        });
        return out;
    }

    function validatePeriodSchedule(slots, map) {
        const errors = [];
        const normalized = normalizeTimeSlots(slots);
        if (normalized.length < MIN_PERIODS) {
            errors.push('min_periods');
        }
        if (normalized.length > MAX_PERIODS) {
            errors.push('max_periods');
        }
        normalized.forEach((s) => {
            const dur = computeDurationMin(s.start, s.end);
            if (dur == null) {
                errors.push(`invalid_range:${s.id}`);
            }
        });
        const nums = getPeriodNumbers(map);
        nums.forEach((n) => {
            const slotId = map[String(n)];
            if (!normalized.some((s) => s.id === slotId)) {
                errors.push(`orphan_period:${n}`);
            }
        });
        return { ok: errors.length === 0, errors, slots: normalized };
    }

    function nextSlotId(slots) {
        let n = 1;
        const ids = new Set((slots || []).map((s) => s.id));
        while (ids.has(`ts${n}`)) {
            n += 1;
        }
        return `ts${n}`;
    }

    function addPeriod(slots, map) {
        const normalized = normalizeTimeSlots(slots);
        if (normalized.length >= MAX_PERIODS) {
            return { ok: false, reason: 'max_periods', slots: normalized, map: Object.assign({}, map) };
        }
        const nums = getPeriodNumbers(map);
        const nextPeriod = nums.length ? Math.max(...nums) + 1 : 1;
        const last = normalized[normalized.length - 1];
        let start = '14:00';
        let end = '15:00';
        if (last && last.end && HHMM.test(last.end)) {
            start = last.end;
            const startMin = parseHHMM(start);
            if (startMin != null) {
                const endMin = startMin + (last.durationMin || 55);
                const h = Math.floor(endMin / 60);
                const m = endMin % 60;
                end = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            }
        }
        const id = nextSlotId(normalized);
        const newSlot = syncDurationFromTimes({
            id,
            start,
            end,
            sortOrder: normalized.length + 1
        });
        const newSlots = normalized.concat([newSlot]);
        const newMap = Object.assign({}, map || {});
        newMap[String(nextPeriod)] = id;
        return { ok: true, slots: newSlots, map: newMap, period: nextPeriod };
    }

    function classUsesPeriod(classData, periodNum) {
        if (!classData || periodNum == null) {
            return false;
        }
        const p = parseInt(periodNum, 10);
        if (Number.isNaN(p)) {
            return false;
        }
        const classPeriod = parseInt(classData.period, 10);
        if (!Number.isNaN(classPeriod) && classPeriod === p) {
            return true;
        }
        const pbw = classData.periodByWeekday;
        if (pbw && typeof pbw === 'object') {
            if (Object.values(pbw).some((v) => parseInt(v, 10) === p)) {
                return true;
            }
        }
        const teachers = Array.isArray(classData.classTeachers) ? classData.classTeachers : [];
        return teachers.some((row) => {
            if (!row) {
                return false;
            }
            const rowPeriod = parseInt(row.period, 10);
            if (!Number.isNaN(rowPeriod) && rowPeriod === p) {
                return true;
            }
            const rowPb = row.periodByWeekday;
            if (rowPb && typeof rowPb === 'object') {
                return Object.values(rowPb).some((v) => parseInt(v, 10) === p);
            }
            if (Array.isArray(row.placements)) {
                return row.placements.some((pl) => pl && parseInt(pl.period, 10) === p);
            }
            return false;
        });
    }

    function findClassesUsingPeriod(appData, periodNum) {
        const classes = Array.isArray(appData && appData.classes) ? appData.classes : [];
        return classes.filter((c) => classUsesPeriod(c, periodNum));
    }

    function removePeriod(slots, map, periodNum) {
        const p = parseInt(periodNum, 10);
        const slotId = map && map[String(p)];
        if (!slotId) {
            return { ok: false, reason: 'not_found', slots: normalizeTimeSlots(slots), map: Object.assign({}, map) };
        }
        const normalized = normalizeTimeSlots(slots);
        if (normalized.length <= MIN_PERIODS) {
            return { ok: false, reason: 'min_periods', slots: normalized, map: Object.assign({}, map) };
        }
        const newSlots = normalized.filter((s) => s.id !== slotId);
        const newMap = Object.assign({}, map);
        delete newMap[String(p)];
        return { ok: true, slots: newSlots, map: newMap, removedSlotId: slotId };
    }

    function resetToDefaultSchedule() {
        const slots = getDefaultSlots();
        const map = getDefaultMap();
        return { slots: normalizeTimeSlots(slots), map: Object.assign({}, map) };
    }

    function getSortedTimeSlots(appData) {
        const slots = (appData && Array.isArray(appData.timetableTimeSlots) && appData.timetableTimeSlots.length)
            ? appData.timetableTimeSlots
            : getDefaultSlots();
        return normalizeTimeSlots(slots);
    }

    global.CCPTimetablePeriods = {
        MAX_PERIODS,
        MIN_PERIODS,
        HHMM,
        parseHHMM,
        computeDurationMin,
        syncDurationFromTimes,
        normalizeTimeSlots,
        getPeriodNumbers,
        getMaxPeriodNumber,
        getMinPeriodNumber,
        normalizePeriodSlotMap,
        validatePeriodSchedule,
        addPeriod,
        removePeriod,
        findClassesUsingPeriod,
        classUsesPeriod,
        resetToDefaultSchedule,
        getSortedTimeSlots,
        getDefaultSlots,
        getDefaultMap
    };
}(typeof window !== 'undefined' ? window : globalThis));
