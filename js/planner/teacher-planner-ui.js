/**
 * Schedule planner screen (Schedule › Planner tab of index.html) — rebuilt Nov 2026.
 *
 * One workspace instead of wizard steps:
 *   top bar   – what you are looking at (sheet, day, level), then actions
 *   left      – class tray: every class, with how many periods are placed
 *   middle    – the board. Three sheets over the same draft:
 *                 Teachers (a column per teacher), Cohorts (a column per cohort),
 *                 Rooms (a column per room). Pick one day, or "Week" for one
 *                 teacher / cohort / room across Mon–Fri.
 *   right     – things to fix, each one jumps to its place on the board
 *
 * Everything is assigned by dragging: tray → board, tile → another cell,
 * tile → tile (swap), tile → tray (take off the board). Dragging uses pointer
 * events so the held tile floats under the pointer and it works with touch.
 *
 * Rules live in teacher-planner-core.js (CCPTeacherPlanner). This file is DOM only.
 */
(function (global) {
    const NONE = '__none__';
    const SPECIAL = '__special__';
    const DAYS = [1, 2, 3, 4, 5];
    const VIEWS = ['teachers', 'cohorts', 'rooms'];
    const PREF_KEY = 'ccpPlannerView2';
    const UNDO_LIMIT = 50;

    const state = {
        view: 'teachers',
        day: 1, // 0 = week
        focus: { teachers: null, cohorts: null, rooms: null },
        band: 'all',
        query: '',
        selected: null, // demandId
        issuesOpen: true,
        issuesAll: false, // show every line of a long To fix group
        compact: false, // Cohorts sheet: room on the tile, whole day fits on screen
        doneOpen: false,
        setupTab: 'teachers',
        setupOpen: false,
        openBlockGrid: null, // teacher profile id or 'everyone'
        openTypes: null, // teacher profile id
        cohortSel: new Set(), // cohort ids ticked for batch edit in Setup
        cohortFilter: { level: 'all', days: 'all', block: 'all', hours: 'all' }, // Setup > Cohorts list filters
        editClass: null, // demandId whose class settings are open in the side panel
        addSpecial: false, // the "Add class" (special class) form is open in the side panel
        menu: null
    };
    let undoStack = [];
    let redoStack = [];
    let M = null; // model of the current render
    let bound = false;
    let drag = null;
    let pending = null;
    // Touch screens: a tapped class is "held" until a slot is tapped (no dragging needed).
    let held = null;
    let lastPointer = 'mouse';
    let sort = null;
    let flash = null;
    let renderQueued = false;

    /* ---------------------------------------------------------------- helpers */

    function $(id) {
        return document.getElementById(id);
    }

    function t(key, fallback, vars) {
        let s = '';
        if (typeof global.getCalendarTranslation === 'function') s = global.getCalendarTranslation(key) || '';
        if ((!s || s === key) && typeof global.t === 'function') {
            const v = global.t(key);
            if (v && v !== key) s = v;
        }
        if (!s || s === key) s = fallback || key;
        if (vars) {
            Object.keys(vars).forEach((name) => {
                s = s.split(`{${name}}`).join(String(vars[name] == null ? '' : vars[name]));
            });
        }
        return s;
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function api() {
        return global.CCPTeacherPlanner;
    }

    function getAppData() {
        return global.appData || (typeof appData !== 'undefined' ? appData : null); // eslint-disable-line no-undef
    }

    function notice(msg, kind) {
        if (!msg) return;
        if (typeof global.showAppNotice === 'function') global.showAppNotice(msg, kind || 'info');
        else if (typeof showAppNotice === 'function') showAppNotice(msg, kind || 'info'); // eslint-disable-line no-undef
        else if (global.CCPNotice && global.CCPNotice.show) global.CCPNotice.show(msg);
    }

    function readOnly() {
        return typeof CalendarSync !== 'undefined' // eslint-disable-line no-undef
            && CalendarSync.isReadOnly && CalendarSync.isReadOnly(); // eslint-disable-line no-undef
    }

    function markDirty() {
        if (typeof saveData === 'function') saveData(); // eslint-disable-line no-undef
        else if (typeof global.saveData === 'function') global.saveData();
    }

    function dayNames() {
        const short = t('dayNamesShort', '');
        if (Array.isArray(short) && short.length === 7) return short;
        const lang = document.documentElement.lang === 'ko' ? 'ko' : 'en';
        return lang === 'ko'
            ? ['일', '월', '화', '수', '목', '금', '토']
            : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    }

    function dayLabel(dow) {
        return dayNames()[Number(dow)] || String(dow);
    }

    function loadPrefs() {
        try {
            const raw = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
            if (!raw) return;
            if (VIEWS.includes(raw.view)) state.view = raw.view;
            if ([0, 1, 2, 3, 4, 5].includes(raw.day)) state.day = raw.day;
            if (['all', 'junior', 'middle', 'senior'].includes(raw.band)) state.band = raw.band;
            if (typeof raw.issuesOpen === 'boolean') state.issuesOpen = raw.issuesOpen;
            if (typeof raw.compact === 'boolean') state.compact = raw.compact;
        } catch (_) { /* ignore */ }
    }

    function savePrefs() {
        try {
            localStorage.setItem(PREF_KEY, JSON.stringify({
                view: state.view, day: state.day, band: state.band, issuesOpen: state.issuesOpen, compact: state.compact
            }));
        } catch (_) { /* ignore */ }
    }

    /* ------------------------------------------------------------------ data */

    function ensureData() {
        const data = getAppData();
        if (!data || !api()) return null;
        api().ensurePlannerFields(data);
        api().seedTeacherProfilesFromAppData(data);
        return data;
    }

    function getActiveDraft(data) {
        const id = data.plannerState && data.plannerState.activeDraftId;
        return id ? (data.plannerDrafts || []).find((d) => d.id === id) || null : null;
    }

    function installDraft(data, draft) {
        data.plannerDrafts = [draft].concat((data.plannerDrafts || []).filter((d) => d.id !== draft.id)).slice(0, 5);
        data.plannerState.activeDraftId = draft.id;
        data.plannerState.updatedAt = draft.updatedAt;
    }

    function ensureDraft(data) {
        let draft = getActiveDraft(data);
        if (!draft) {
            draft = api().seedDraftFromCalendar(data, { label: 'From calendar' });
            installDraft(data, draft);
        }
        if (!Array.isArray(draft.assignments)) draft.assignments = [];
        return draft;
    }

    function periodRows(data) {
        const tp = global.CCPTimetablePeriods;
        const slots = tp && tp.getSortedTimeSlots ? tp.getSortedTimeSlots(data) : [];
        const map = (data.periodSlotMap && Object.keys(data.periodSlotMap).length)
            ? data.periodSlotMap
            : (tp && tp.getDefaultMap ? tp.getDefaultMap() : {});
        let nums = tp && tp.getPeriodNumbers ? tp.getPeriodNumbers(map) : [];
        if (!nums.length) nums = [1, 2, 3, 4, 5, 6, 7];
        const byId = {};
        slots.forEach((s) => { byId[s.id] = s; });
        return nums.map((n) => {
            const slot = byId[map[String(n)]] || null;
            return {
                period: String(n),
                start: slot ? slot.start : '',
                end: slot ? slot.end : '',
                band: api().periodBand(n)
            };
        });
    }

    function bandRank(band) {
        return band === 'junior' ? 0 : band === 'middle' ? 1 : 2;
    }

    function buildModel() {
        const data = ensureData();
        if (!data) return null;
        const draft = ensureDraft(data);
        const P = api();
        P.recomputeDraftMetrics(data, draft);
        const allDemands = P.buildDemandsFromAppData(data);
        const demands = allDemands.filter((d) => d.includedInDraft !== false);
        const demandById = new Map(allDemands.map((d) => [d.demandId, d]));
        const classById = new Map((data.classes || []).map((c) => [c.id, c]));
        const asgByDemand = new Map();
        draft.assignments.forEach((a) => { if (!asgByDemand.has(a.demandId)) asgByDemand.set(a.demandId, a); });

        const order = (data.plannerState.teacherBoard && data.plannerState.teacherBoard.panelOrder) || [];
        const teachers = (data.teacherProfiles || []).slice().sort((a, b) => {
            const ia = order.indexOf(a.id);
            const ib = order.indexOf(b.id);
            return (ia < 0 ? 9999 : ia) - (ib < 0 ? 9999 : ib);
        });
        const teacherById = new Map(teachers.map((x) => [x.id, x]));

        const cohorts = (data.cohorts || [])
            .filter((c) => c && c.id && !c.isArchiveCohort)
            .map((c) => {
                const band = P.resolvePlannerBandForCohort(c);
                return {
                    id: c.id,
                    name: String(c.name || '').trim() || c.id,
                    color: c.color || '',
                    band,
                    rank: P.levelSortIndex(band, c),
                    days: P.cohortBlock(data, c).days,
                    block: P.cohortBlock(data, c),
                    scheduleBlock: String(c.scheduleBlock || '').toLowerCase(),
                    homeroom: String(c.homeroomTeacherName || '').trim(),
                    students: Array.isArray(c.students) ? c.students.filter((st) => st && st.active !== false && !st.archivedAt).length : 0
                };
            })
            .sort((a, b) => bandRank(a.band) - bandRank(b.band) || a.rank - b.rank
                || a.name.localeCompare(b.name, undefined, { numeric: true }));
        const cohortById = new Map(cohorts.map((c) => [c.id, c]));

        const rooms = (data.rooms || []).slice()
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const roomById = new Map(rooms.map((r) => [r.id, r]));
        let periods = periodRows(data);
        // First period (P1) is ignored: its row is hidden unless the setting is on or a class already sits in it.
        if (periods.length > 1 && !(data.plannerState && data.plannerState.useFirstPeriod === true)) {
            const first = periods[0].period;
            const used = draft.assignments.some((a) => (a.meetings || []).some((m) => String(m.period) === first));
            if (!used) periods = periods.slice(1);
        }

        // Where every placed period sits, per sheet.
        const tiles = [];
        const teacherSlot = new Map();
        const cohortSlot = new Map();
        const roomSlot = new Map();
        const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1);
        draft.assignments.forEach((asg) => {
            const demand = demandById.get(asg.demandId);
            if (!demand || demand.includedInDraft === false) return;
            (asg.meetings || []).forEach((m) => {
                const slot = `${Number(m.dow)}|${String(m.period)}`;
                const roomId = P.meetingRoomId(asg, m);
                const cohortIds = (demand.cohortIds || []).filter((id) => cohortById.has(id));
                tiles.push({ asg, m, demand, slot, roomId, cohortIds });
                if (asg.teacherProfileId) bump(teacherSlot, `${asg.teacherProfileId}|${slot}`);
                cohortIds.forEach((cid) => bump(cohortSlot, `${cid}|${slot}`));
                if (roomId) bump(roomSlot, `${roomId}|${slot}`);
            });
        });
        const warnSlots = new Map();
        (draft.issues || []).forEach((i) => {
            if (['outside_band_block', 'outside_cohort_days', 'teacher_unavailable'].includes(i.code) && i.assignmentId) {
                const k = `${i.assignmentId}|${i.dow}|${i.period}`;
                warnSlots.set(k, (warnSlots.get(k) || []).concat([i.code]));
            }
        });
        tiles.forEach((tile) => {
            const { asg, slot } = tile;
            tile.clash = [];
            if (asg.teacherProfileId && teacherSlot.get(`${asg.teacherProfileId}|${slot}`) > 1) tile.clash.push('teacher');
            if (tile.cohortIds.some((cid) => cohortSlot.get(`${cid}|${slot}`) > 1)) tile.clash.push('cohort');
            if (tile.roomId && roomSlot.get(`${tile.roomId}|${slot}`) > 1) tile.clash.push('room');
            tile.warn = warnSlots.get(`${asg.assignmentId}|${slot}`) || null;
        });

        const m = {
            data, draft, demands, allDemands, demandById, classById, asgByDemand,
            teachers, teacherById, cohorts, cohortById, rooms, roomById, periods, tiles,
            ctx: { demands: allDemands, demandById },
            noCohortDemands: demands.some((d) => !(d.cohortIds || []).some((id) => cohortById.has(id)))
        };
        m.cellTiles = cellMap(m, state.view);
        return m;
    }

    function tileColumns(tile, view) {
        if (view === 'teachers') return [tile.asg.teacherProfileId || NONE];
        if (view === 'rooms') return [tile.roomId || NONE];
        return tile.cohortIds.length ? tile.cohortIds : [NONE];
    }

    function cellMap(m, view) {
        const map = new Map();
        m.tiles.forEach((tile) => {
            tileColumns(tile, view).forEach((col) => {
                const key = `${col}|${tile.slot}`;
                if (!map.has(key)) map.set(key, []);
                map.get(key).push(tile);
            });
        });
        return map;
    }

    // Teacher colours: distinct, readable with white text, in teacher order. A teacher's own colour
    // (Setup) wins.
    const TEACHER_PALETTE = ['#2563eb', '#dc2626', '#059669', '#9333ea', '#ea580c', '#0891b2',
        '#c026d3', '#4d7c0f', '#b45309', '#4f46e5', '#0f766e', '#be123c'];
    const NO_TEACHER_COLOR = '#94a3b8';

    function teacherColor(m, teacherProfileId) {
        if (!teacherProfileId) return NO_TEACHER_COLOR;
        const i = m.teachers.findIndex((x) => x.id === teacherProfileId);
        if (i < 0) return NO_TEACHER_COLOR;
        const own = m.teachers[i].color;
        return /^#[0-9a-f]{6}$/i.test(own || '') ? own : TEACHER_PALETTE[i % TEACHER_PALETTE.length];
    }

    /** Per-day sheets (Cohorts, Rooms) colour classes by teacher; the Teachers sheet by cohort. */
    function colorByTeacher() {
        return state.view === 'cohorts' || state.view === 'rooms';
    }

    function demandColor(m, demand) {
        const cid = (demand.cohortIds || []).find((id) => m.cohortById.has(id));
        const cohort = cid ? m.cohortById.get(cid) : null;
        const cls = m.classById.get(demand.classId);
        return (cohort && cohort.color) || (cls && cls.color) || '#94a3b8';
    }

    function demandCohortLabel(m, demand) {
        return (demand.cohortIds || [])
            .map((id) => m.cohortById.get(id))
            .filter(Boolean)
            .map((c) => c.name)
            .join(' + ');
    }

    function demandNeed(demand) {
        return api().weeklyNeed(demand);
    }

    function placedCount(m, demand) {
        const asg = m.asgByDemand.get(demand.demandId);
        return asg ? (asg.meetings || []).length : 0;
    }

    function teacherName(m, id) {
        const p = id ? m.teacherById.get(id) : null;
        return p ? p.name : '';
    }

    function roomName(m, id) {
        const r = id ? m.roomById.get(id) : null;
        return r ? r.name : '';
    }

    function columnsFor(m, view) {
        if (view === 'teachers') {
            const cols = m.teachers.map((p) => ({ id: p.id, name: p.name, teacher: p }));
            cols.push({ id: NONE, name: t('spNoTeacher', 'No teacher'), none: true });
            return cols;
        }
        if (view === 'rooms') {
            const cols = m.rooms.map((r) => ({ id: r.id, name: r.name, room: r }));
            cols.push({ id: NONE, name: t('spNoRoom', 'No room'), none: true });
            return cols;
        }
        // One day: only cohorts that come that day (an MWF day has no TT columns, and the other way
        // round), plus any cohort that has a class placed on it anyway.
        const dayOnly = state.day >= 1 && state.day <= 5;
        const cols = m.cohorts
            .filter((c) => state.band === 'all' || c.band === state.band)
            .filter((c) => !dayOnly || !c.days.length || c.days.includes(state.day)
                || m.tiles.some((x) => Number(x.m.dow) === state.day && x.cohortIds.includes(c.id)))
            .map((c) => ({ id: c.id, name: c.name, cohort: c }));
        if (m.noCohortDemands) cols.push({ id: NONE, name: t('spNoCohort', 'No cohort'), none: true });
        return cols;
    }

    /* ------------------------------------------------------------- mutations */

    /**
     * The calendar copy can be swapped for a newer one at any time (live sync pulls another device's
     * changes every few seconds). Always edit the current copy, or the change goes into an old object
     * that is no longer saved and disappears on the next redraw.
     */
    function freshModel() {
        const current = getAppData();
        if (current && (!M || M.data !== current)) M = buildModel();
        return M;
    }

    function mutate(fn, options) {
        const opts = options || {};
        if (!freshModel()) return null;
        if (readOnly()) {
            notice(t('plannerReadOnlyHint', 'This calendar is read-only. Request edit access before applying a draft.'), 'error');
            return null;
        }
        const snap = JSON.stringify(M.draft);
        const res = fn(M.data, M.draft);
        if (res && res.ok === false) {
            notice(reasonText(res.reason || (res.reasons && res.reasons[0])), 'error');
            render();
            return res;
        }
        // Allowed by hand, but worth saying (e.g. a room already in use, the wrong teacher type).
        if (res && res.clashes && res.clashes.length && !opts.quiet) notice(reasonText(res.clashes[0]), 'info');
        if (!opts.noUndo) {
            undoStack.push(snap);
            if (undoStack.length > UNDO_LIMIT) undoStack.shift();
            redoStack = [];
        }
        markDirty();
        render();
        return res;
    }

    function restoreDraft(json) {
        const data = M.data;
        const draft = JSON.parse(json);
        const idx = (data.plannerDrafts || []).findIndex((d) => d.id === data.plannerState.activeDraftId);
        if (idx >= 0) data.plannerDrafts[idx] = draft;
        else installDraft(data, draft);
        data.plannerState.activeDraftId = draft.id;
    }

    function undo() {
        if (!undoStack.length || !M || readOnly()) return;
        redoStack.push(JSON.stringify(M.draft));
        restoreDraft(undoStack.pop());
        markDirty();
        render();
    }

    function redo() {
        if (!redoStack.length || !M || readOnly()) return;
        undoStack.push(JSON.stringify(M.draft));
        restoreDraft(redoStack.pop());
        markDirty();
        render();
    }

    /* ----------------------------------------------------------------- texts */

    function reasonText(code, ctx) {
        const c = ctx || {};
        switch (code) {
        case 'teacher_day_blocked':
        case 'teacher_period_blocked':
        case 'teacher_slot_blocked':
            return t('spWhyTeacherOff', 'This teacher is marked not available then');
        case 'teacher_outside_hours':
            return t('spWhyOutsideWork', 'Outside this teacher’s working hours');
        case 'teacher_own_type_only':
            return t('spWhyOwnTypeOnly', 'This teacher only takes classes marked for their teacher type');
        case 'class_type_not_allowed':
            return t('spWhyClassType', 'This teacher is not set to teach this class type');
        case 'global_period_blocked':
        case 'global_slot_blocked':
            return t('spWhyEveryoneOff', 'This time is blocked for everyone');
        case 'wrong_teacher_type':
            return c.need === 'native'
                ? t('spWhyNeedsNative', 'This class asks for a native teacher')
                : t('spWhyNeedsKorean', 'This class asks for a Korean teacher');
        case 'wrong_junior_senior_band':
            return t('spWhyBand', 'This teacher is not set to teach this level');
        case 'outside_cohort_days':
            return t('spWhyOffDay', 'The cohort does not come on this day');
        case 'teacher_double_booked':
            return t('spWhyTeacherBusy', 'The teacher already has a class then');
        case 'cohort_double_booked':
            return t('spWhyCohortBusy', 'The cohort already has a class then');
        case 'cohort_day_too_long':
            return t('spWhyCohortDay', 'Students are only here 2 periods on Mon/Wed/Fri and 3 on Tue/Thu');
        case 'room_double_booked':
            return t('spWhyRoomBusy', 'The room is already in use then');
        case 'room_too_small':
            return t('spWhyRoomSmall', 'This room is too small for the class');
        case 'max_periods_per_day':
            return t('spWhyDayLimit', 'Over the teacher’s limit for one day');
        case 'weekly_complete':
            return t('spWhyComplete', 'This class already has all its periods');
        case 'duplicate_weekday_2x':
            return t('spWhySameDay', 'Two periods of this class on the same day');
        case 'out_of_block':
            return t('spWhyOutOfBlock', 'Outside the hours these students are at school');
        case 'already_here':
            return t('spWhyAlreadyHere', 'This class is already here');
        case 'teacher_reassigned':
            return t('spWhyTeacherChanges', 'Teacher changes to {name} for all of this class’s periods', { name: c.teacher || '' });
        case 'missing_context':
        case 'missing_assignment':
        case 'slot_missing':
            return t('spWhyGone', 'That class is no longer on the board. Try again.');
        default:
            return code ? String(code) : '';
        }
    }

    function slotText(m, dow, period) {
        if (dow == null || period == null) return '';
        const row = m.periods.find((p) => p.period === String(period));
        return `${dayLabel(dow)} ${row && row.start ? row.start : `P${period}`}`;
    }

    function issueText(m, issue) {
        const demand = issue.demandId ? m.demandById.get(issue.demandId)
            : (issue.assignmentId ? m.demandById.get((m.draft.assignments.find((a) => a.assignmentId === issue.assignmentId) || {}).demandId) : null);
        const name = demand ? classLabel(m, demand) : '';
        const when = slotText(m, issue.dow, issue.period);
        const teacher = teacherName(m, issue.teacherProfileId);
        switch (issue.code) {
        case 'teacher_double_booked':
            return t('spIssueTeacherClash', '{teacher} has two classes at {when}', { teacher: teacher || '?', when });
        case 'cohort_day_too_long':
            return t('spIssueCohortDay', '{cohort} is at the academy {span} periods on {day} (most is {limit})', {
                cohort: (m.cohortById.get(issue.cohortId) || {}).name || name,
                span: issue.span, limit: issue.limit, day: dayLabel(issue.dow)
            });
        case 'cohort_block_differs':
            return t('spIssueCohortBlock', '{cohort} is not in the same periods on every day it comes', {
                cohort: (m.cohortById.get(issue.cohortId) || {}).name || name
            });
        case 'cohort_day_gap':
            return t('spIssueCohortGap', '{cohort} has a free period between classes on {day}', {
                cohort: (m.cohortById.get(issue.cohortId) || {}).name || name, day: dayLabel(issue.dow)
            });
        case 'cohort_double_booked':
            return t('spIssueCohortClash', '{cohort} has two classes at {when}', {
                cohort: (m.cohortById.get(issue.cohortId) || {}).name || name, when
            });
        case 'room_conflict':
            return t('spIssueRoomClash', '{room} is used twice at {when}', { room: roomName(m, issue.roomId) || name, when });
        case 'no_teacher':
            return t('spIssueNoTeacher', '{name} has no teacher', { name });
        case 'incomplete_placements':
            return t('spIssueIncomplete', '{name} needs {n} more', { name, n: issue.missing || 1 });
        case 'outside_band_block':
            return t('spIssueOutOfBlock', '{name} is outside the hours its students are at school ({when})', { name, when });
        case 'long_run':
            return t('spIssueLongRun', '{teacher} has {count} periods in a row on {day}', { teacher, count: issue.count, day: dayLabel(issue.dow) });
        case 'teacher_limit':
            return t('spIssueTeacherLimit', '{name}: outside what {teacher} is set to teach', { name, teacher });
        case 'no_common_day':
            return t('spIssueNoCommonDay', '{name}: its cohorts do not share a day, so it cannot be placed', { name });
        case 'teacher_unavailable':
            if (issue.outsideHours) {
                return t('spIssueOutsideWork', '{name} is outside {teacher}’s working hours ({when})', { name, teacher, when });
            }
            return issue.everyone
                ? t('spIssueEveryoneOff', '{name} is at a time blocked for everyone ({when})', { name, when })
                : t('spIssueTeacherOff', '{name}: {teacher} is marked not available at {when}', { name, teacher, when });
        case 'outside_cohort_days':
            return t('spIssueOffDay', '{name} is on a day its cohort does not come ({when})', { name, when });
        case 'wrong_teacher_type':
            return issue.reason === 'teacher_own_type_only'
                ? t('spIssueOwnTypeOnly', '{name}: {teacher} only takes classes for their teacher type', { name, teacher })
                : t('spIssueTeacherType', '{name}: {teacher} is not the teacher type it asks for', { name, teacher });
        case 'wrong_junior_senior_band':
            return t('spIssueTeacherBand', '{name}: {teacher} is not set to teach this level', { name, teacher });
        case 'over_load':
            return t('spIssueOverWeek', '{teacher} is over the weekly limit ({count}/{limit})', {
                teacher, count: issue.count, limit: issue.limit
            });
        case 'max_periods_per_day':
            return t('spIssueOverDay', '{teacher} is over the daily limit on {day} ({count}/{limit})', {
                teacher, day: dayLabel(issue.dow), count: issue.count, limit: issue.limit
            });
        case 'duplicate_weekday_2x':
            return t('spIssueSameDay', '{name} has two periods on the same day', { name });
        case 'room_too_small':
            return t('spIssueRoomSmall', '{name}: {count} students in {room}, which seats {limit}', { name, count: issue.count, limit: issue.limit, room: roomName(m, issue.roomId) });
        case 'room_unresolved':
            return t('spIssueNoRoom', '{name} has no room', { name });
        default:
            return issue.message || issue.code;
        }
    }

    function classLabel(m, demand) {
        const cohort = demandCohortLabel(m, demand);
        if (!cohort || demand.name.toLowerCase().includes(cohort.toLowerCase())) return demand.name;
        return `${cohort} · ${demand.name}`;
    }

    const ISSUE_GROUPS = [
        { id: 'clash', codes: ['teacher_double_booked', 'cohort_double_booked', 'room_conflict', 'wrong_teacher_type'] },
        { id: 'todo', codes: ['no_teacher', 'incomplete_placements', 'no_common_day'] },
        { id: 'warn', codes: ['outside_band_block', 'outside_cohort_days', 'teacher_unavailable', 'cohort_day_too_long', 'cohort_day_gap', 'cohort_block_differs', 'wrong_junior_senior_band', 'over_load', 'max_periods_per_day', 'long_run', 'teacher_limit', 'duplicate_weekday_2x'] },
        { id: 'room', codes: ['room_unresolved', 'room_too_small'] }
    ];

    function groupedIssues(m) {
        const seen = new Set();
        const groups = ISSUE_GROUPS.map((g) => ({ id: g.id, items: [] }));
        (m.draft.issues || []).forEach((issue) => {
            const gi = ISSUE_GROUPS.findIndex((g) => g.codes.includes(issue.code));
            if (gi < 0) return;
            // "No room" only matters once the school has rooms set up.
            if (issue.code === 'room_unresolved' && !m.rooms.length) return;
            const demand = issue.demandId ? m.demandById.get(issue.demandId) : null;
            if (demand && demand.includedInDraft === false) return;
            const text = issueText(m, issue);
            if (seen.has(text)) return;
            seen.add(text);
            groups[gi].items.push({ issue, text });
        });
        return groups;
    }

    /* ---------------------------------------------------------------- render */

    function render() {
        if (drag || sort) {
            renderQueued = true;
            return;
        }
        renderQueued = false;
        const root = $('plannerPageRoot');
        if (!root) return;
        M = buildModel();
        if (!M) return;
        root.hidden = false;
        if (state.selected && !M.demandById.has(state.selected)) state.selected = null;
        VIEWS.forEach((v) => {
            const cols = columnsFor(M, v).filter((c) => !c.none);
            if (!cols.some((c) => c.id === state.focus[v])) state.focus[v] = cols[0] ? cols[0].id : NONE;
        });
        renderToolbar();
        renderSummary();
        renderTray();
        renderBoard();
        renderIssues();
        if (state.setupOpen) renderSetup();
        document.body.classList.toggle('sp-readonly', !!readOnly());
    }

    function renderToolbar() {
        document.querySelectorAll('[data-sp-view]').forEach((b) => {
            const on = b.getAttribute('data-sp-view') === state.view;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const days = $('spDays');
        if (days) {
            const clashByDay = {};
            M.tiles.forEach((tile) => {
                if (tile.clash.length) clashByDay[Number(tile.m.dow)] = true;
            });
            days.innerHTML = [0].concat(DAYS).map((d) => `
<button type="button" class="sp-day${state.day === d ? ' is-active' : ''}" data-sp-day="${d}" aria-pressed="${state.day === d}">
  ${d === 0 ? esc(t('spWeek', 'Week')) : esc(dayLabel(d))}${d && clashByDay[d] ? '<span class="sp-dot" aria-hidden="true"></span>' : ''}
</button>`).join('');
        }
        const band = $('spBand');
        if (band && band.value !== state.band) band.value = state.band;
        const compact = $('spCompactBtn');
        if (compact) {
            compact.hidden = state.view !== 'cohorts';
            compact.classList.toggle('is-active', state.compact);
            compact.setAttribute('aria-pressed', state.compact ? 'true' : 'false');
        }
        const u = $('spUndoBtn');
        const r = $('spRedoBtn');
        if (u) u.disabled = !undoStack.length;
        if (r) r.disabled = !redoStack.length;
        const ro = !!readOnly();
        ['plannerApplyBtn', 'spAutoBtn'].forEach((id) => {
            const el = $(id);
            if (el) el.disabled = ro;
        });
    }

    function renderSummary() {
        const el = $('spSummary');
        if (!el) return;
        const total = M.demands.length;
        const done = M.demands.filter((d) => placedCount(M, d) >= demandNeed(d) && (M.asgByDemand.get(d.demandId) || {}).teacherProfileId).length;
        const groups = groupedIssues(M);
        const clashes = groups[0].items.length;
        const warns = groups[2].items.length;
        el.innerHTML = `
<span class="sp-sum-main">${esc(t('spSumDone', '{done} of {total} classes ready', { done, total }))}</span>
<span class="sp-sum-bar" aria-hidden="true"><span style="width:${total ? Math.round((done / total) * 100) : 0}%"></span></span>
${clashes ? `<span class="sp-pill sp-pill--bad">${esc(t('spSumClashes', '{n} clashes', { n: clashes }))}</span><button type="button" class="btn btn-outline btn-small sp-fix-btn" data-act="fix">${esc(t('spFixBtn', 'Suggest fixes'))}</button>` : ''}
${warns ? `<span class="sp-pill sp-pill--warn">${esc(t('spSumWarnings', '{n} warnings', { n: warns }))}</span>` : ''}
${!clashes && !warns && total && done === total ? `<span class="sp-pill sp-pill--ok">${esc(t('spSumAllGood', 'Nothing to fix'))}</span>` : ''}`;
    }

    function trayCard(m, demand) {
        const need = demandNeed(demand);
        const placed = placedCount(m, demand);
        const asg = m.asgByDemand.get(demand.demandId);
        const teacher = asg ? teacherName(m, asg.teacherProfileId) : '';
        const complete = placed >= need;
        return `
<div class="sp-card${state.selected === demand.demandId ? ' is-selected' : ''}${complete ? ' is-complete' : ''}" data-drag="tray" data-demand="${esc(demand.demandId)}" style="--c:${esc(demandColor(m, demand))}" tabindex="0" role="button" aria-label="${esc(classLabel(m, demand))}">
  <span class="sp-card-name">${esc(demand.name)}</span>
  <span class="sp-badge${complete ? ' is-done' : ''}">${placed}/${need}</span>
  <span class="sp-card-sub${teacher ? '' : ' is-missing'}">${esc(teacher || t('spNoTeacher', 'No teacher'))}</span>
  ${demand.special ? specialTagHtml(demand) : ''}
</div>`;
    }

    function renderTray() {
        const el = $('spTrayList');
        if (!el) return;
        const scroll = el.scrollTop;
        const q = state.query.trim().toLowerCase();
        const match = (d) => {
            if (state.band !== 'all' && d.band !== state.band) return false;
            if (!q) return true;
            const asg = M.asgByDemand.get(d.demandId);
            return `${d.name} ${demandCohortLabel(M, d)} ${asg ? teacherName(M, asg.teacherProfileId) : ''}`.toLowerCase().includes(q);
        };
        const isDone = (d) => placedCount(M, d) >= demandNeed(d) && !!(M.asgByDemand.get(d.demandId) || {}).teacherProfileId;
        const list = M.demands.filter(match);
        const todo = list.filter((d) => !isDone(d));
        const done = list.filter(isDone);
        const group = (items) => {
            const by = new Map();
            items.forEach((d) => {
                const cid = d.special ? SPECIAL : (d.cohortIds || []).find((id) => M.cohortById.has(id)) || NONE;
                if (!by.has(cid)) by.set(cid, []);
                by.get(cid).push(d);
            });
            const ids = (by.has(SPECIAL) ? [SPECIAL] : []).concat(M.cohorts.map((c) => c.id).filter((id) => by.has(id)));
            if (by.has(NONE)) ids.push(NONE);
            return ids.map((cid) => `
<div class="sp-tray-group">
  <div class="sp-tray-group-title">${esc(cid === SPECIAL ? t('spSpecialGroup', 'Special') : cid === NONE ? t('spNoCohort', 'No cohort') : M.cohortById.get(cid).name)}</div>
  ${by.get(cid).map((d) => trayCard(M, d)).join('')}
</div>`).join('');
        };
        let html = readOnly() ? '' : `<button type="button" class="btn btn-outline btn-small sp-add-class" data-act="add-special">${esc(t('spAddSpecial', '+ Add class'))}</button>`;
        if (!M.demands.length) {
            html += `<p class="sp-empty">${esc(t('spTrayEmpty', 'No classes yet. Add classes on the calendar first, or open Setup to bring left-out classes back.'))}</p>`;
        } else {
            html += `<div class="sp-tray-section-title">${esc(t('spTrayTodo', 'To place'))} <span class="sp-count">${todo.length}</span></div>`;
            html += todo.length ? group(todo)
                : `<p class="sp-empty">${esc(q ? t('spTrayNoMatch', 'Nothing matches.') : t('spTrayAllPlaced', 'Every class is placed.'))}</p>`;
            html += `
<button type="button" class="sp-tray-section-title sp-tray-toggle" data-act="toggle-done" aria-expanded="${state.doneOpen}">
  <span class="sp-caret${state.doneOpen ? ' is-open' : ''}" aria-hidden="true">▸</span>${esc(t('spTrayDone', 'Placed'))} <span class="sp-count">${done.length}</span>
</button>`;
            if (state.doneOpen) html += group(done);
        }
        el.innerHTML = html;
        el.scrollTop = scroll;
        renderInspector();
    }

    function renderInspector() {
        const el = $('spInspector');
        if (!el) return;
        if (state.addSpecial) {
            el.hidden = false;
            el.classList.add('is-editing');
            el.innerHTML = specialFormHtml();
            const first = el.querySelector('[data-special="name"]');
            if (first && !first.value) first.focus();
            return;
        }
        const demand = state.selected ? M.demandById.get(state.selected) : null;
        if (!demand) {
            el.hidden = true;
            el.innerHTML = '';
            el.classList.remove('is-editing');
            return;
        }
        const asg = M.asgByDemand.get(demand.demandId);
        const meetings = asg ? (asg.meetings || []).slice().sort((a, b) => a.dow - b.dow || Number(a.period) - Number(b.period)) : [];
        const roomOpts = (cur) => `<option value="">${esc(t('spNoRoom', 'No room'))}</option>`
            + M.rooms.map((r) => `<option value="${esc(r.id)}"${r.id === cur ? ' selected' : ''}>${esc(r.name)}</option>`).join('');
        el.hidden = false;
        el.classList.toggle('is-editing', state.editClass === demand.demandId);
        el.innerHTML = `
<div class="sp-insp-head" style="--c:${esc(demandColor(M, demand))}">
  <strong>${esc(classLabel(M, demand))}</strong>
  <button type="button" class="sp-icon-btn" data-act="deselect" aria-label="${esc(t('spClose', 'Close'))}">×</button>
</div>
<label class="sp-field">
  <span>${esc(t('spTeacher', 'Teacher'))}</span>
  <select class="field-select" data-change="class-teacher">
    <option value="">${esc(t('spNoTeacher', 'No teacher'))}</option>
    ${M.teachers.map((p) => {
        // Wrong teacher type: still allowed by hand, labelled so it is a choice.
        const why = api().teacherLimitReason(p, demand);
        const blocked = (why === 'wrong_teacher_type' || why === 'teacher_own_type_only') && !(asg && asg.teacherProfileId === p.id);
        return `<option value="${esc(p.id)}"${asg && asg.teacherProfileId === p.id ? ' selected' : ''}>${esc(p.name)}${blocked ? ` · ${esc(t('spWrongTypeShort', 'wrong teacher type'))}` : ''}</option>`;
    }).join('')}
  </select>
</label>
${asg ? `<label class="sp-chip sp-lock"><input type="checkbox" data-change="class-lock"${asg.locked ? ' checked' : ''}><span>${esc(t('spLock', 'Lock in place (suggestions will not move it)'))}</span></label>` : ''}
${asg && asg.auto && asg.auto.count && asg.teacherProfileId ? `<p class="sp-hint sp-auto-why">${esc(t('spAutoWhy', '{teacher} taught {count} of these {total} students last term.', { teacher: teacherName(M, asg.teacherProfileId), count: asg.auto.count, total: asg.auto.total }))}</p>` : ''}
<div class="sp-field">
  <span>${esc(t('spPlacedPeriods', 'Periods'))} <em>${meetings.length}/${demandNeed(demand)}</em></span>
  ${meetings.length ? `<ul class="sp-insp-list">${meetings.map((m) => `
    <li>
      <button type="button" class="sp-link" data-act="jump-slot" data-dow="${m.dow}" data-period="${esc(m.period)}">${esc(slotText(M, m.dow, m.period))}</button>
      ${M.rooms.length ? `<select class="field-select sp-room-select" data-change="meeting-room" data-dow="${m.dow}" data-period="${esc(m.period)}" aria-label="${esc(t('spRoom', 'Room'))}">${roomOpts(api().meetingRoomId(asg, m))}</select>` : ''}
      <button type="button" class="sp-icon-btn" data-act="remove-period" data-asg="${esc(asg.assignmentId)}" data-dow="${m.dow}" data-period="${esc(m.period)}" aria-label="${esc(t('spRemovePeriod', 'Take off the board'))}">×</button>
    </li>`).join('')}</ul>` : `<p class="sp-empty">${esc(t('spInspDragHint', 'Drag this class onto the board to give it a time.'))}</p>`}
</div>
${classEditHtml(demand)}`;
    }

    /** "Special · Nov 20 – Dec 18" tag on a special class's card and tiles. */
    function specialTagHtml(demand) {
        const fmt = (iso) => {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
            if (!m) return '';
            try {
                return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
                    .toLocaleDateString(global.calendarCurrentLanguage === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' });
            } catch (_) {
                return iso.slice(5);
            }
        };
        const range = [fmt(demand.startDate), fmt(demand.endDate)].filter(Boolean).join(' – ');
        return `<span class="sp-special-tag">${esc(t('spSpecialTag', 'Special'))}${range ? ` · ${esc(range)}` : ''}</span>`;
    }

    function termDates() {
        const ok = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
        return { start: ok(M.data.termStart), end: ok(M.data.termEnd) };
    }

    /** The "Add class" form: a special or temporary class, no cohort needed, one slot a week. */
    function specialFormHtml() {
        const term = termDates();
        return `<section class="sp-insp-edit sp-special-form" aria-label="${esc(t('spAddSpecialTitle', 'Add a special class'))}">
  <div class="sp-insp-edit-head">
    <strong>${esc(t('spAddSpecialTitle', 'Add a special class'))}</strong>
    <button type="button" class="sp-link" data-act="add-special-cancel">${esc(t('spCancel', 'Cancel'))}</button>
  </div>
  <p class="sp-hint">${esc(t('spAddSpecialHint', 'One time slot a week, placed by hand. For another day or time, add it again or use Duplicate.'))}</p>
  <label class="sp-field"><span>${esc(t('spClassName', 'Class name'))}</span>
    <input type="text" class="field-input" data-special="name" maxlength="120" placeholder="${esc(t('spSpecialNameExample', 'e.g. Speech contest prep'))}">
  </label>
  <label class="sp-field"><span>${esc(t('spTeacherTypeNeeded', 'Teacher type'))}</span>
    <select class="field-select" data-special="type">
      <option value="either">${esc(t('spTypeEither', 'Any teacher'))}</option>
      <option value="korean">${esc(t('spRoleKoreanFull', 'Korean teacher'))}</option>
      <option value="native">${esc(t('spRoleNativeFull', 'Native teacher'))}</option>
    </select>
  </label>
  <label class="sp-field"><span>${esc(t('spSpecialStudents', 'Students (optional, for room size)'))}</span>
    <input type="number" class="field-input sp-in-small" min="0" max="200" data-special="students">
  </label>
  <div class="sp-field"><span>${esc(t('spSpecialCohorts', 'Cohorts (optional)'))}</span>
    <span class="sp-chips sp-chips--wrap">${M.cohorts.map((c) => `<label class="sp-chip"><input type="checkbox" data-special-cohort="${esc(c.id)}"><span>${esc(c.name)}</span></label>`).join('')}</span>
  </div>
  <div class="sp-field-row">
    <label class="sp-field"><span>${esc(t('spSpecialStart', 'Starts'))}</span><input type="date" class="field-input" data-special="start" value="${esc(term.start)}"></label>
    <label class="sp-field"><span>${esc(t('spSpecialEnd', 'Ends'))}</span><input type="date" class="field-input" data-special="end" value="${esc(term.end)}"></label>
  </div>
  <button type="button" class="btn btn-primary btn-small" data-act="add-special-save">${esc(t('spAddSpecialSave', 'Add class'))}</button>
</section>`;
    }

    function newClassId() {
        return `cl-sp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    }

    /** Create a special class on the calendar (saved straight away) and select it. */
    function saveSpecialClass(form) {
        const val = (k) => {
            const x = form.querySelector(`[data-special="${k}"]`);
            return x ? String(x.value || '').trim() : '';
        };
        const name = val('name');
        if (!name) {
            notice(t('spSpecialNeedName', 'Give the class a name first.'), 'error');
            return;
        }
        const start = val('start');
        const end = val('end');
        if (start && end && end < start) {
            notice(t('spSpecialBadDates', 'The end date is before the start date.'), 'error');
            return;
        }
        const cohortIds = Array.from(form.querySelectorAll('[data-special-cohort]')).filter((x) => x.checked)
            .map((x) => x.getAttribute('data-special-cohort'));
        const students = Math.round(Number(val('students')));
        const type = val('type');
        const id = newClassId();
        setupEdit((data) => {
            data.classes = data.classes || [];
            data.classes.push(specialClassRecord({ id, name, type, students, cohortIds, start, end }));
            cohortIds.forEach((cid) => {
                const c = (data.cohorts || []).find((x) => x.id === cid);
                if (c && Array.isArray(c.classIds) && !c.classIds.includes(id)) c.classIds.push(id);
            });
        });
        state.addSpecial = false;
        state.selected = `demand:${id}`;
        state.editClass = null;
        render();
    }

    function specialClassRecord(o) {
        return {
            id: o.id,
            name: o.name,
            plannerSpecial: true,
            levelPreset: '',
            level: '',
            grade: '',
            cohortId: (o.cohortIds || [])[0] || '',
            cohortIds: o.cohortIds || [],
            classTypeId: '',
            scheduleBlock: '',
            meetingDays: [],
            weeklyFrequency: 1,
            teacherRequirementType: o.type === 'korean' || o.type === 'native' ? o.type : undefined,
            plannerStudents: o.students > 0 ? o.students : undefined,
            classTeachers: [],
            color: '#64748b',
            textColor: '#ffffff',
            startDate: o.start || '',
            endDate: o.end || '',
            useAutoTermEnd: false,
            notes: ''
        };
    }

    /** Duplicate a special class (for another day or time); the copy is not placed yet. */
    function duplicateSpecial(classId) {
        const src = (M.data.classes || []).find((c) => c.id === classId);
        if (!src) return;
        const id = newClassId();
        setupEdit((data) => {
            data.classes.push(specialClassRecord({
                id,
                name: src.name,
                type: src.teacherRequirementType,
                students: Number(src.plannerStudents) || 0,
                cohortIds: api().getClassCohortIds(src),
                start: src.startDate,
                end: src.endDate
            }));
            api().getClassCohortIds(src).forEach((cid) => {
                const c = (data.cohorts || []).find((x) => x.id === cid);
                if (c && Array.isArray(c.classIds) && !c.classIds.includes(id)) c.classIds.push(id);
            });
        });
        state.selected = `demand:${id}`;
        state.editClass = null;
        notice(t('spSpecialDuplicated', 'Copy made. Place it on the board for its other time.'), 'info');
        render();
    }

    /** Delete a special class (only special ones can be deleted here). */
    function deleteSpecial(classId) {
        const cls = (M.data.classes || []).find((c) => c.id === classId);
        if (!cls || cls.plannerSpecial !== true) return;
        confirmBox(t('spSpecialDeleteConfirm', 'Delete {name}? It is removed from the calendar too.', { name: cls.name }), t('spDelete', 'Delete')).then((yes) => {
            if (!yes) return;
            const draft = M.draft;
            setupEdit((data) => {
                data.classes = (data.classes || []).filter((c) => c.id !== classId);
                (data.cohorts || []).forEach((c) => {
                    if (Array.isArray(c.classIds)) c.classIds = c.classIds.filter((x) => x !== classId);
                });
                if (draft) draft.assignments = (draft.assignments || []).filter((a) => a.classId !== classId && a.demandId !== `demand:${classId}`);
            });
            state.selected = null;
            state.editClass = null;
            render();
        });
    }

    /**
     * "Edit class": the class settings that decide warnings (which cohorts, teacher type, periods a week),
     * changed right here. They save to the class straight away, not on Apply. Everything else is in the
     * full class editor, opened in a new tab on the same calendar.
     */
    function classEditHtml(demand) {
        const cls = (M.data.classes || []).find((c) => c.id === demand.classId);
        if (!cls) return '';
        const fullHref = `/?tab=classes&classId=${encodeURIComponent(cls.id)}`;
        const open = state.editClass === demand.demandId;
        const ro = readOnly();
        if (!open) {
            return `<div class="sp-insp-edit-row">
  <button type="button" class="btn btn-outline btn-small" data-act="edit-class"${ro ? ' disabled' : ''}>${esc(t('spEditClass', 'Edit class'))}</button>
</div>`;
        }
        const mine = api().getClassCohortIds(cls);
        const need = cls.teacherRequirementType === 'korean' || cls.teacherRequirementType === 'native' ? cls.teacherRequirementType : 'either';
        return `<section class="sp-insp-edit" data-class="${esc(cls.id)}" aria-label="${esc(t('spEditClass', 'Edit class'))}">
  <div class="sp-insp-edit-head">
    <strong>${esc(t('spEditClass', 'Edit class'))}</strong>
    <button type="button" class="sp-link" data-act="edit-class-close">${esc(t('spHoldDone', 'Done'))}</button>
  </div>
  <p class="sp-hint">${esc(t('spEditClassHint', 'Saves to the class straight away, not on Apply.'))}</p>
  <label class="sp-field"><span>${esc(t('spClassName', 'Class name'))}</span>
    <input type="text" class="field-input" data-change="edit-class-name" value="${esc(cls.name || '')}" maxlength="120">
  </label>
  <div class="sp-field"><span>${esc(t('spClassCohorts', 'Cohorts (tick more than one for a combined class)'))}</span>
    <span class="sp-chips sp-chips--wrap">${M.cohorts.slice().sort((x, y) => Number(mine.includes(y.id)) - Number(mine.includes(x.id))).map((c) => `<label class="sp-chip"><input type="checkbox" data-change="edit-class-cohort" data-cohort-id="${esc(c.id)}"${mine.includes(c.id) ? ' checked' : ''}><span>${esc(c.name)}</span></label>`).join('')}</span>
  </div>
  <label class="sp-field"><span>${esc(t('spTeacherTypeNeeded', 'Teacher type'))}</span>
    <select class="field-select" data-change="edit-class-type">
      <option value="either"${need === 'either' ? ' selected' : ''}>${esc(t('spTypeEither', 'Any teacher'))}</option>
      <option value="korean"${need === 'korean' ? ' selected' : ''}>${esc(t('spRoleKoreanFull', 'Korean teacher'))}</option>
      <option value="native"${need === 'native' ? ' selected' : ''}>${esc(t('spRoleNativeFull', 'Native teacher'))}</option>
    </select>
  </label>
  ${demand.special ? `
  <label class="sp-field"><span>${esc(t('spSpecialStudents', 'Students (optional, for room size)'))}</span>
    <input type="number" class="field-input sp-in-small" min="0" max="200" data-change="edit-class-students" value="${Number(cls.plannerStudents) > 0 ? Number(cls.plannerStudents) : ''}">
  </label>
  <div class="sp-field-row">
    <label class="sp-field"><span>${esc(t('spSpecialStart', 'Starts'))}</span><input type="date" class="field-input" data-change="edit-class-start" value="${esc(cls.startDate || '')}"></label>
    <label class="sp-field"><span>${esc(t('spSpecialEnd', 'Ends'))}</span><input type="date" class="field-input" data-change="edit-class-end" value="${esc(cls.endDate || '')}"></label>
  </div>` : `
  <label class="sp-field"><span>${esc(t('spPerWeek', 'Periods / week'))}</span>
    <input type="number" class="field-input sp-in-small" min="1" max="10" data-change="edit-class-freq" value="${demandNeed(demand)}">
  </label>`}
  <label class="sp-chip"><input type="checkbox" data-change="edit-class-include"${cls.plannerExcluded === true ? '' : ' checked'}><span>${esc(t('spInPlanLong', 'Include in this plan'))}</span></label>
  ${demand.special ? `<div class="sp-insp-edit-actions">
    <button type="button" class="btn btn-outline btn-small" data-act="special-duplicate">${esc(t('spDuplicate', 'Duplicate'))}</button>
    <button type="button" class="btn btn-outline btn-small sp-danger" data-act="special-delete">${esc(t('spDeleteClass', 'Delete class'))}</button>
  </div>` : ''}
  <a class="sp-link sp-insp-full" href="${esc(fullHref)}" target="_blank" rel="noopener">${esc(t('spEditClassFull', 'Open the full class editor ↗'))}</a>
</section>`;
    }

    /** Change one class setting from the side panel, then redraw (warnings update at once). */
    function editClassField(el, kind) {
        const box = el.closest('[data-class]');
        if (!box || readOnly()) return;
        const id = box.getAttribute('data-class');
        setupEdit((data) => {
            const cls = (data.classes || []).find((c) => c.id === id);
            if (!cls) return;
            if (kind === 'edit-class-name') {
                const v = String(el.value || '').trim();
                if (v) cls.name = v;
            } else if (kind === 'edit-class-type') {
                if (el.value === 'either') delete cls.teacherRequirementType;
                else cls.teacherRequirementType = el.value;
            } else if (kind === 'edit-class-freq') {
                const n = Math.round(Number(el.value));
                if (n >= 1 && n <= 10) cls.weeklyFrequency = n;
            } else if (kind === 'edit-class-students') {
                const n = Math.round(Number(el.value));
                if (n > 0) cls.plannerStudents = n;
                else delete cls.plannerStudents;
            } else if (kind === 'edit-class-start' || kind === 'edit-class-end') {
                const v = String(el.value || '');
                const other = kind === 'edit-class-start' ? cls.endDate : cls.startDate;
                if (v && other && (kind === 'edit-class-start' ? v > other : v < other)) {
                    notice(t('spSpecialBadDates', 'The end date is before the start date.'), 'error');
                    return;
                }
                if (kind === 'edit-class-start') cls.startDate = v;
                else cls.endDate = v;
            } else if (kind === 'edit-class-include') {
                if (el.checked) delete cls.plannerExcluded;
                else cls.plannerExcluded = true;
            } else if (kind === 'edit-class-cohort') {
                const ticked = Array.from(box.querySelectorAll('[data-change="edit-class-cohort"]'))
                    .filter((x) => x.checked).map((x) => x.getAttribute('data-cohort-id'));
                if (!ticked.length && cls.plannerSpecial !== true) {
                    el.checked = true; // a class keeps at least one cohort (special classes may have none)
                    return;
                }
                cls.cohortIds = ticked;
                cls.cohortId = ticked[0];
            }
        });
        render();
    }

    function colHeader(m, col) {
        if (col.teacher) {
            const load = (m.draft.metrics.teacherLoads || {})[col.id] || { assigned: 0, max: col.teacher.limits.maxPeriodsPerWeek };
            const max = load.max || 0;
            const pct = max ? Math.min(100, Math.round((load.assigned / max) * 100)) : 0;
            const over = max && load.assigned > max;
            return `
<span class="sp-col-name">${esc(col.name)}</span>
<span class="sp-col-meta"><span class="sp-role sp-role--${esc(col.teacher.role)}">${esc(col.teacher.role === 'native' ? t('spRoleNativeShort', 'NT') : t('spRoleKoreanShort', 'KT'))}</span>
<span class="sp-load${over ? ' is-over' : ''}" title="${esc(t('spLoadTitle', 'Periods this week / weekly limit'))}"><span class="sp-load-bar"><span style="width:${pct}%"></span></span>${load.assigned}/${max}</span></span>`;
        }
        if (col.cohort) {
            const c = col.cohort;
            return `
<span class="sp-col-name"><span class="sp-swatch" style="background:${esc(c.color || '#94a3b8')}"></span>${esc(col.name)}</span>
<span class="sp-col-count">${esc(t('spStudentsN', '{n} students', { n: c.students }))}</span>
<span class="sp-col-meta">${esc(bandLabel(c.band))}${c.homeroom ? ` · ${esc(c.homeroom)}` : ''}</span>`;
        }
        if (col.room) {
            return `
<span class="sp-col-name">${esc(col.name)}</span>
<span class="sp-col-meta">${col.room.capacity ? esc(t('spSeats', '{n} seats', { n: col.room.capacity })) : '&nbsp;'}</span>`;
        }
        return `<span class="sp-col-name sp-col-name--none">${esc(col.name)}</span><span class="sp-col-meta">&nbsp;</span>`;
    }

    function bandLabel(band) {
        if (band === 'junior') return t('plannerJunior', 'Lower elem');
        if (band === 'middle') return t('plannerMiddle', 'Middle school');
        return t('plannerSenior', 'Upper elem');
    }

    /** On the Cohorts sheet the column already names the cohort: show the subject part of the class name. */
    /** Compact Cohorts sheet: the room sits on the tile instead of a row under it. */
    function compactCohorts() {
        return state.view === 'cohorts' && state.compact;
    }

    function subjectOnly(m, demand) {
        const name = String(demand.name || '');
        const i = name.lastIndexOf(' · ');
        return i > 0 ? name.slice(i + 3) : name;
    }

    function tileHtml(m, tile) {
        const { asg, m: meeting, demand } = tile;
        const bits = [];
        const cohort = demandCohortLabel(m, demand);
        const teacher = teacherName(m, asg.teacherProfileId);
        const room = roomName(m, tile.roomId);
        if (state.view !== 'cohorts' && cohort && !demand.name.toLowerCase().includes(cohort.toLowerCase())) bits.push(cohort);
        if (state.view !== 'teachers') bits.push(teacher || t('spNoTeacher', 'No teacher'));
        if (state.view === 'teachers' && room) bits.push(room);
        const why = [];
        if (tile.clash.includes('teacher')) why.push(reasonText('teacher_double_booked'));
        if (tile.clash.includes('cohort')) why.push(reasonText('cohort_double_booked'));
        if (tile.clash.includes('room')) why.push(reasonText('room_double_booked'));
        (tile.warn || []).forEach((code) => {
            why.push(code === 'outside_band_block' ? reasonText('out_of_block')
                : code === 'outside_cohort_days' ? reasonText('outside_cohort_days')
                    : t('spWhyTeacherOffOrHours', 'Teacher is not available or off hours then'));
        });
        const sel = state.selected === demand.demandId;
        const key = `${asg.assignmentId}|${tile.slot}`;
        return `
<div class="sp-tile${tile.clash.length ? ' is-clash' : ''}${tile.warn ? ' is-warn' : ''}${sel ? ' is-selected' : ''}${state.selected && !sel ? ' is-dim' : ''}${flash === key ? ' is-flash' : ''}"
  data-drag="tile" data-asg="${esc(asg.assignmentId)}" data-demand="${esc(demand.demandId)}" data-dow="${Number(meeting.dow)}" data-period="${esc(meeting.period)}"
  style="--c:${esc(colorByTeacher() ? teacherColor(m, asg.teacherProfileId) : demandColor(m, demand))}"${why.length ? ` title="${esc(why.join(' · '))}"` : ''}>
  <span class="sp-tile-name">${asg.locked ? '<span class="sp-tile-lock" aria-hidden="true">🔒</span>' : ''}${why.length ? '<span class="sp-tile-flag" aria-hidden="true">!</span>' : ''}${esc(state.view === 'cohorts' ? subjectOnly(m, demand) : demand.name)}</span>
  ${bits.length ? `<span class="sp-tile-sub">${esc(bits.join(' · '))}</span>` : ''}
  ${demand.special ? specialTagHtml(demand) : ''}
  ${compactCohorts() ? tileRoomChip(m, tile) : ''}
  <button type="button" class="sp-tile-x" data-act="remove-period" data-asg="${esc(asg.assignmentId)}" data-dow="${Number(meeting.dow)}" data-period="${esc(meeting.period)}" aria-label="${esc(t('spRemovePeriod', 'Take off the board'))}">×</button>
</div>`;
    }

    function cellHtml(m, col, dow, row) {
        const key = `${col.id}|${dow}|${row.period}`;
        const tiles = m.cellTiles.get(key) || [];
        let cls = 'sp-cell';
        let label = '';
        if (col.teacher) {
            const blocked = api().isSlotBlocked(col.teacher, dow, row.period, m.data.plannerState.blockouts);
            if (blocked) {
                cls += ' is-blocked';
                label = t('spBlocked', 'Not available');
            } else if (api().outsideTeacherHours(m.data, col.teacher, row.period)) {
                cls += ' is-blocked';
                label = t('spOffHours', 'Off hours');
            }
        }
        if (col.cohort && col.cohort.days.length && !col.cohort.days.includes(dow)) cls += ' is-offday';
        if (col.none) cls += ' is-none';
        return `<td class="${cls}" data-cell="1" data-col="${esc(col.id)}" data-dow="${dow}" data-period="${esc(row.period)}">${tiles.map((x) => tileHtml(m, x)).join('')}${!tiles.length && label ? `<span class="sp-cell-label">${esc(label)}</span>` : ''}</td>`;
    }

    /** Students in a class: every student of all its cohorts, counted once (combined classes too). */
    function classSize(m, demand) {
        return api().classSizeOf(m.data, demand);
    }

    /** Rooms already used at a time on a day: room id -> assignment id. */
    function roomsBusyAt(m, dow, period) {
        const busy = new Map();
        m.tiles.forEach((x) => {
            if (Number(x.m.dow) === Number(dow) && String(x.m.period) === String(period) && x.roomId) busy.set(x.roomId, x.asg.assignmentId);
        });
        return busy;
    }

    /** Room picker for one placed period. Rooms that are taken or too small can't be picked. */
    function roomSelectHtml(m, x, extraClass) {
        const size = classSize(m, x.demand);
        const busy = roomsBusyAt(m, x.m.dow, x.m.period);
        const opts = m.rooms.map((r) => {
            const takenBy = busy.get(r.id);
            const taken = takenBy && takenBy !== x.asg.assignmentId;
            const small = Number(r.capacity) > 0 && size > Number(r.capacity);
            const note = taken ? t('spRoomInUse', 'in use') : small ? t('spRoomTooSmallShort', 'too small') : '';
            const seats = r.capacity && !extraClass ? ` (${Number(r.capacity)})` : '';
            return `<option value="${esc(r.id)}"${r.id === x.roomId ? ' selected' : ''}>${esc(r.name)}${seats}${note ? ` · ${esc(note)}` : ''}</option>`;
        }).join('');
        return `<select class="sp-roomsel${extraClass ? ` ${extraClass}` : ''}" data-change="tile-room" data-asg="${esc(x.asg.assignmentId)}" data-dow="${Number(x.m.dow)}" data-period="${esc(x.m.period)}" aria-label="${esc(t('spRoomFor', 'Room for {name}', { name: x.demand.name }))}"${readOnly() ? ' disabled' : ''}>
    <option value="">${esc(t('spNoRoom', 'No room'))}</option>${opts}
  </select>`;
    }

    /** Compact Cohorts sheet: room picker on the tile, plus the combined size. */
    function tileRoomChip(m, x) {
        if (!m.rooms.length) return '';
        const combined = (x.demand.cohortIds || []).filter((cid) => m.cohortById.has(cid)).length > 1;
        return `<span class="sp-tile-room${x.roomId ? '' : ' is-missing'}${x.clash.includes('room') ? ' is-clash' : ''}">${roomSelectHtml(m, x, 'sp-roomsel--chip')}${combined ? `<span class="sp-roomsize" title="${esc(t('spCombinedSize', '{n} students (combined)', { n: classSize(m, x.demand) }))}">${esc(t('spCombinedShort', '{n} comb.', { n: classSize(m, x.demand) }))}</span>` : ''}</span>`;
    }

    /**
     * Cohort sheet: a row under each period with the room of every class in it, like the printed
     * 강의실 row. A combined class shows its total students. Only on the Cohorts sheet.
     */
    function roomRowHtml(m, cells, row) {
        if (state.view !== 'cohorts' || state.compact) return '';
        const anything = cells.some(({ col, dow }) => (m.cellTiles.get(`${col.id}|${dow}|${row.period}`) || []).length);
        if (!anything) return '';
        const cellsHtml = cells.map(({ col, dow }) => {
            const tiles = m.cellTiles.get(`${col.id}|${dow}|${row.period}`) || [];
            if (!tiles.length) return '<td class="sp-roomcell is-empty"></td>';
            return `<td class="sp-roomcell">${tiles.map((x) => {
                const size = classSize(m, x.demand);
                const combined = (x.demand.cohortIds || []).filter((cid) => m.cohortById.has(cid)).length > 1;
                const label = combined
                    ? t('spCombinedSize', '{n} students (combined)', { n: size })
                    : t('spStudentsN', '{n} students', { n: size });
                return `<div class="sp-roomline${x.roomId ? '' : ' is-missing'}${x.clash.includes('room') ? ' is-clash' : ''}">
  ${m.rooms.length ? roomSelectHtml(m, x) : `<span class="sp-roomnone">${esc(t('spNoRoomsYet', 'No rooms set up'))}</span>`}
  ${combined || tiles.length > 1 ? `<span class="sp-roomsize">${esc(label)}</span>` : ''}
</div>`;
            }).join('')}</td>`;
        }).join('');
        return `<tr class="sp-roomrow"><th scope="row" class="sp-time sp-roomlabel">${esc(t('spRoomRow', 'Room'))}</th>${cellsHtml}</tr>`;
    }

    function teacherLegend(m) {
        const used = new Set(m.tiles.map((x) => x.asg.teacherProfileId || NONE));
        const items = m.teachers.filter((x) => used.has(x.id))
            .map((x) => ({ name: x.name, color: teacherColor(m, x.id) }));
        if (used.has(NONE)) items.push({ name: t('spNoTeacher', 'No teacher'), color: NO_TEACHER_COLOR });
        if (!items.length) return '';
        return `<div class="sp-legend" aria-label="${esc(t('spLegendTeachers', 'Colour by teacher'))}">${items.map((x) =>
            `<span class="sp-legend-item"><span class="sp-legend-dot" style="background:${esc(x.color)}"></span>${esc(x.name)}</span>`).join('')}</div>`;
    }

    /** Empty board: one clear next step instead of a long To fix list. */
    function startCardHtml(m) {
        if (m.tiles.length) return '';
        const todo = m.demands.filter((d) => d.includedInDraft !== false);
        if (!todo.length) return '';
        const ro = readOnly();
        return `<div class="sp-start" role="note">
  <div class="sp-start-text">
    <strong>${esc(t('spStartTitle', '{n} classes to place', { n: todo.length }))}</strong>
    <span>${esc(t('spStartBody', 'Let Auto-schedule make a first plan, or drag classes from the To place list onto the board. Check teachers and rooms in Setup first.'))}</span>
  </div>
  <div class="sp-start-actions">
    <button type="button" class="btn btn-primary btn-small" data-act="auto"${ro ? ' disabled' : ''}>${esc(t('spAuto', 'Auto-schedule'))}</button>
    <button type="button" class="btn btn-outline btn-small" data-act="open-setup">${esc(t('spSetup', 'Setup'))}</button>
  </div>
</div>`;
    }

    function renderBoard() {
        const el = $('spBoard');
        if (!el) return;
        const scroller = el.querySelector('.sp-board-scroll');
        const keep = scroller ? { x: scroller.scrollLeft, y: scroller.scrollTop } : null;
        M.cellTiles = cellMap(M, state.view);
        const cols = columnsFor(M, state.view);
        const real = cols.filter((c) => !c.none);
        let html = '';

        if (!real.length) {
            const msg = state.view === 'teachers'
                ? t('spEmptyTeachers', 'No teachers yet. Add them in Setup, then drag classes onto their columns.')
                : state.view === 'rooms'
                    ? t('spEmptyRooms', 'No rooms yet. Add your classrooms in Setup, then drag classes into them.')
                    : t('spEmptyCohorts', 'No cohorts on this calendar yet. Create them on the Cohorts tab of the calendar.');
            el.innerHTML = `<div class="sp-board-empty"><p>${esc(msg)}</p>${state.view !== 'cohorts' ? `<button type="button" class="btn btn-primary btn-small" data-act="open-setup" data-tab="${state.view}">${esc(t('spOpenSetup', 'Open Setup'))}</button>` : ''}</div>`;
            return;
        }

        const timeCell = (row, i) => {
            const split = i > 0 && M.periods[i - 1].band !== row.band;
            return `<th scope="row" class="sp-time${split ? ' is-split' : ''}"><span class="sp-time-num">${esc(row.period)}</span><span class="sp-time-clock">${esc(row.start)}${row.end ? `<br>${esc(row.end)}` : ''}</span></th>`;
        };

        if (state.day === 0) {
            const focusId = state.focus[state.view];
            const col = cols.find((c) => c.id === focusId) || cols[0];
            html += `<div class="sp-focus" role="tablist" aria-label="${esc(t('spFocusLabel', 'Show the week for'))}">${cols.map((c) => {
                const count = M.tiles.filter((x) => tileColumns(x, state.view).includes(c.id)).length;
                if (c.none && !count) return '';
                return `<button type="button" role="tab" class="sp-focus-pill${c.id === col.id ? ' is-active' : ''}" data-sp-focus="${esc(c.id)}" aria-selected="${c.id === col.id}">${c.cohort ? `<span class="sp-swatch" style="background:${esc(c.cohort.color || '#94a3b8')}"></span>` : ''}${esc(c.name)} <span class="sp-count">${count}</span></button>`;
            }).join('')}</div>`;
            html += `<div class="sp-board-scroll"><table class="sp-grid sp-grid--week"><thead><tr><th class="sp-corner"><div class="sp-colhead">${colHeader(M, col)}</div></th>${DAYS.map((d) => {
                const off = col.cohort && col.cohort.days.length && !col.cohort.days.includes(d);
                return `<th scope="col" class="sp-dayhead${off ? ' is-offday' : ''}">${esc(dayLabel(d))}</th>`;
            }).join('')}</tr></thead><tbody>${M.periods.map((row, i) => `<tr class="${i > 0 && M.periods[i - 1].band !== row.band ? 'is-split' : ''}">${timeCell(row, i)}${DAYS.map((d) => cellHtml(M, col, d, row)).join('')}</tr>${roomRowHtml(M, DAYS.map((d) => ({ col, dow: d })), row)}`).join('')}</tbody></table></div>`;
        } else {
            const d = state.day;
            html += `<div class="sp-board-scroll"><table class="sp-grid sp-grid--day" style="--cols:${cols.length}"><thead><tr><th class="sp-corner">${esc(dayLabel(d))}</th>${cols.map((c) => {
                const off = c.cohort && c.cohort.days.length && !c.cohort.days.includes(d);
                return `<th scope="col" class="sp-colth${off ? ' is-offday' : ''}${c.none ? ' is-none' : ''}"><div class="sp-colhead">${colHeader(M, c)}</div></th>`;
            }).join('')}</tr></thead><tbody>${M.periods.map((row, i) => `<tr class="${i > 0 && M.periods[i - 1].band !== row.band ? 'is-split' : ''}">${timeCell(row, i)}${cols.map((c) => cellHtml(M, c, d, row)).join('')}</tr>${roomRowHtml(M, cols.map((c) => ({ col: c, dow: d })), row)}`).join('')}</tbody></table></div>`;
        }
        if (colorByTeacher()) html = teacherLegend(M) + html;
        html = startCardHtml(M) + html;
        queueMicrotask(markHeld);
        el.classList.toggle('sp-by-teacher', colorByTeacher());
        el.classList.toggle('is-compact', compactCohorts());
        el.innerHTML = html;
        const next = el.querySelector('.sp-board-scroll');
        if (next && keep) {
            next.scrollLeft = keep.x;
            next.scrollTop = keep.y;
        }
    }

    const ISSUE_SHORT = 6;

    /**
     * One To fix group. Long groups are shortened: "Still to do" becomes one line per kind
     * ("No teacher yet: 61 classes"), other groups show the first few. "Show all" opens the rest.
     */
    function issueListHtml(g) {
        const line = (x) => `<li><button type="button" class="sp-issue" data-act="jump-issue" data-issue="${esc(x.issue.id)}">${esc(x.text)}</button></li>`;
        const long = g.items.length > ISSUE_SHORT;
        if (!long || state.issuesAll) {
            return `<ul>${g.items.slice(0, 200).map(line).join('')}</ul>${long ? `<button type="button" class="sp-link sp-issues-more" data-act="issues-all">${esc(t('spIssuesShowFewer', 'Show fewer'))}</button>` : ''}`;
        }
        let body;
        if (g.id === 'todo') {
            const counts = new Map();
            g.items.forEach((x) => counts.set(x.issue.code, (counts.get(x.issue.code) || 0) + 1));
            const label = {
                no_teacher: t('spSumNoTeacher', 'No teacher yet: {n} classes'),
                incomplete_placements: t('spSumIncomplete', 'Need more periods on the board: {n} classes'),
                no_common_day: t('spSumNoCommonDay', 'Cohorts with no shared day: {n} classes')
            };
            body = `<ul class="sp-issue-sum">${[...counts].map(([code, n]) => `<li>${esc((label[code] || code).replace('{n}', n))}</li>`).join('')}</ul>`;
        } else {
            body = `<ul>${g.items.slice(0, ISSUE_SHORT).map(line).join('')}</ul>`;
        }
        return `${body}<button type="button" class="sp-link sp-issues-more" data-act="issues-all">${esc(t('spIssuesShowAll', 'Show all {n}', { n: g.items.length }))}</button>`;
    }

    function renderIssues() {
        const wrap = $('spIssues');
        if (!wrap) return;
        const groups = groupedIssues(M);
        const total = groups.reduce((n, g) => n + g.items.length, 0);
        // Nothing to fix: fold the panel so the board gets the width (the summary bar says so too).
        const open = state.issuesOpen && total > 0;
        wrap.classList.toggle('is-collapsed', !open);
        const titles = {
            clash: t('spGroupClash', 'Clashes'),
            todo: t('spGroupTodo', 'Still to do'),
            warn: t('spGroupWarn', 'Worth a look'),
            room: t('spGroupRoom', 'Rooms')
        };
        wrap.innerHTML = `
<button type="button" class="sp-issues-head" data-act="toggle-issues" aria-expanded="${open}">
  <span>${esc(t('spIssuesTitle', 'To fix'))}</span><span class="sp-count${groups[0].items.length ? ' is-bad' : ''}">${total}</span>
  <span class="sp-caret${open ? ' is-open' : ''}" aria-hidden="true">▸</span>
</button>
${open ? `<div class="sp-issues-body">${total ? groups.filter((g) => g.items.length).map((g) => `
<section class="sp-issue-group sp-issue-group--${g.id}">
  <h3>${esc(titles[g.id])} <span class="sp-count">${g.items.length}</span></h3>
  ${issueListHtml(g)}
</section>`).join('') : `<p class="sp-empty">${esc(t('spIssuesNone', 'Nothing to fix. Check the board, then press Apply to calendar.'))}</p>`}</div>` : ''}`;
    }

    /* ------------------------------------------------------------ navigation */

    function flashTile(assignmentId, dow, period) {
        flash = `${assignmentId}|${Number(dow)}|${String(period)}`;
        setTimeout(() => {
            flash = null;
            document.querySelectorAll('.sp-tile.is-flash').forEach((el) => el.classList.remove('is-flash'));
        }, 1600);
    }

    function showSlot(demandId, dow, period) {
        const asg = M.asgByDemand.get(demandId);
        if (dow != null) {
            if (state.day !== 0) state.day = Number(dow);
        }
        if (asg && state.day === 0) {
            const demand = M.demandById.get(demandId);
            const m = (asg.meetings || []).find((x) => Number(x.dow) === Number(dow) && String(x.period) === String(period));
            if (state.view === 'teachers') state.focus.teachers = asg.teacherProfileId || NONE;
            else if (state.view === 'rooms') state.focus.rooms = (m && api().meetingRoomId(asg, m)) || NONE;
            else state.focus.cohorts = (demand.cohortIds || []).find((id) => M.cohortById.has(id)) || NONE;
        }
        state.selected = demandId;
        if (asg && dow != null) flashTile(asg.assignmentId, dow, period);
        savePrefs();
        render();
        const el = document.querySelector('.sp-tile.is-flash');
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }

    function jumpToIssue(issueId) {
        const issue = (M.draft.issues || []).find((i) => i.id === issueId);
        if (!issue) return;
        let demandId = issue.demandId;
        const asg = issue.assignmentId ? M.draft.assignments.find((a) => a.assignmentId === issue.assignmentId) : null;
        if (!demandId && asg) demandId = asg.demandId;
        if (issue.code === 'room_conflict' || issue.code === 'room_unresolved' || issue.code === 'room_too_small') {
            if (M.rooms.length) state.view = 'rooms';
        } else if (issue.code === 'cohort_double_booked' || issue.code === 'outside_cohort_days') {
            state.view = 'cohorts';
        } else if (issue.teacherProfileId) {
            state.view = 'teachers';
        }
        let dow = issue.dow;
        let period = issue.period;
        if (dow == null && asg && asg.meetings && asg.meetings[0]) {
            dow = asg.meetings[0].dow;
            period = asg.meetings[0].period;
        }
        if (!demandId) {
            // Teacher-level issue (over the limit): show that teacher's week.
            if (issue.teacherProfileId) {
                state.view = 'teachers';
                if (issue.dow != null) state.day = Number(issue.dow);
                else {
                    state.day = 0;
                    state.focus.teachers = issue.teacherProfileId;
                }
            }
            savePrefs();
            render();
            return;
        }
        if (state.band !== 'all') {
            const demand = M.demandById.get(demandId);
            if (demand && demand.band !== state.band) state.band = 'all';
        }
        showSlot(demandId, dow, period);
    }

    /* ------------------------------------------------------------- drag: drop */

    function cellInfo(cell) {
        return {
            col: cell.getAttribute('data-col'),
            dow: Number(cell.getAttribute('data-dow')),
            period: cell.getAttribute('data-period')
        };
    }

    /** What would happen if the held class were dropped on this cell. */
    function evaluateDrop(d, target) {
        const P = api();
        const demand = M.demandById.get(d.demandId);
        if (!demand) return { ok: false, level: 'bad', hint: reasonText('missing_context') };
        const view = state.view;
        const to = { dow: target.dow, period: target.period };
        if (view === 'teachers') to.teacherProfileId = target.col === NONE ? null : target.col;
        if (view === 'rooms') to.roomId = target.col === NONE ? '' : target.col;
        let stays = '';
        if (view === 'cohorts') {
            // A class keeps its own cohort: dropped on another column it takes that time in its own.
            const mine = (demand.cohortIds || []).filter((id) => M.cohortById.has(id));
            const belongs = target.col === NONE ? !mine.length : mine.includes(target.col);
            if (!belongs) {
                target = Object.assign({}, target, { col: mine[0] || NONE });
                stays = t('spHintOwnCohort', 'Goes in its own column ({name})', {
                    name: mine[0] ? M.cohortById.get(mine[0]).name : t('spNoCohort', 'No cohort')
                });
            }
        }
        const key = `${target.col}|${target.dow}|${target.period}`;
        const here = M.cellTiles.get(key) || [];
        if (d.kind === 'tile' && here.some((x) => x.asg.assignmentId === d.assignmentId
            && Number(x.m.dow) === d.dow && String(x.m.period) === String(d.period))) {
            return { same: true, ok: false, level: 'same', hint: '' };
        }
        const others = here.filter((x) => x.asg.assignmentId !== d.assignmentId);
        let check;
        let run;
        let recheck;
        let rerun;
        let lead = '';
        if (d.kind === 'tile' && others.length === 1) {
            const a = { assignmentId: d.assignmentId, dow: d.dow, period: d.period };
            const b = { assignmentId: others[0].asg.assignmentId, dow: Number(others[0].m.dow), period: String(others[0].m.period) };
            const mode = view === 'teachers' ? 'teachers' : view === 'rooms' ? 'rooms' : 'time';
            check = P.checkSwap(M.data, M.draft, a, b, mode);
            run = (data, draft) => P.swapPeriods(data, draft, a, b, mode);
            recheck = () => P.checkSwap(M.data, M.draft, a, b, mode, { allowOffDay: true });
            rerun = (data, draft) => P.swapPeriods(data, draft, a, b, mode, { allowOffDay: true });
            lead = t('spHintSwap', 'Swap with {name}', { name: others[0].demand.name });
        } else if (d.kind === 'tile') {
            const from = { dow: d.dow, period: d.period };
            check = P.checkSlot(M.data, M.draft, d.demandId,
                Object.assign({}, to, { ignore: [{ assignmentId: d.assignmentId, dow: d.dow, period: d.period }] }), M.ctx);
            run = (data, draft) => P.movePeriodTo(data, draft, d.assignmentId, from, to);
            recheck = () => P.checkSlot(M.data, M.draft, d.demandId,
                Object.assign({}, to, { allowOffDay: true, ignore: [{ assignmentId: d.assignmentId, dow: d.dow, period: d.period }] }), M.ctx);
            rerun = (data, draft) => P.movePeriodTo(data, draft, d.assignmentId, from, Object.assign({}, to, { allowOffDay: true }));
        } else {
            check = P.checkSlot(M.data, M.draft, d.demandId, to, M.ctx);
            run = (data, draft) => P.placePeriod(data, draft, d.demandId, to);
            recheck = () => P.checkSlot(M.data, M.draft, d.demandId, Object.assign({}, to, { allowOffDay: true }), M.ctx);
            rerun = (data, draft) => P.placePeriod(data, draft, d.demandId, Object.assign({}, to, { allowOffDay: true }));
        }
        let offDay = false;
        if (!check.ok && (check.reasons || []).length === 1 && check.reasons[0] === 'outside_cohort_days') {
            // The only thing against it is the day: allowed by hand after a confirmation.
            const again = recheck();
            if (again.ok) {
                check = again;
                run = rerun;
                offDay = true;
            }
        }
        if (!check.ok) {
            return { ok: false, level: 'bad', hint: reasonText(check.reasons[0], { need: demand.teacherRequirementType }) };
        }
        // Allowed by hand, but a clash (double booking, wrong teacher type, room too small, off-day): red.
        const clashes = check.clashes || [];
        const soft = (check.softReasons || []).filter((r) => r !== 'teacher_reassigned')
            .sort((x, y) => Number(clashes.includes(y)) - Number(clashes.includes(x)));
        const hints = soft.map((r) => reasonText(r, { need: demand.teacherRequirementType }));
        if (check.warnOutOfBlock) hints.push(reasonText('out_of_block'));
        if (offDay) hints.push(t('spHintConfirmFirst', 'you will be asked to confirm'));
        const info = [];
        if (stays) info.push(stays);
        if (lead) info.push(lead);
        if (check.teacherChanges && view === 'teachers' && !lead) {
            info.push(reasonText('teacher_reassigned', { teacher: teacherName(M, to.teacherProfileId) }));
        }
        return {
            ok: true,
            level: clashes.length ? 'clash' : hints.length ? 'warn' : 'ok',
            hint: info.concat(hints).join(' · '),
            run,
            confirm: offDay
                ? t('spConfirmOffDay', '{name} does not normally come on {day}. Place it there anyway?', {
                    name: demandCohortLabel(M, demand) || demand.name, day: dayLabel(target.dow)
                })
                : '',
            landing: { dow: target.dow, period: target.period }
        };
    }

    function markTargets(src) {
        const d = src || drag;
        if (!d) return;
        d.cache = new Map();
        document.querySelectorAll('#spBoard [data-cell]').forEach((cell) => {
            const info = cellInfo(cell);
            const res = evaluateDrop(d, info);
            d.cache.set(`${info.col}|${info.dow}|${info.period}`, res);
            cell.setAttribute('data-drop', res.level);
        });
    }

    function clearTargets() {
        document.querySelectorAll('[data-drop]').forEach((el) => el.removeAttribute('data-drop'));
        document.querySelectorAll('.is-over').forEach((el) => el.classList.remove('is-over'));
    }

    /* ----------------------------------------------------------- drag: engine */

    function beginDrag(e) {
        const src = pending.src;
        const rect = src.getBoundingClientRect();
        const kind = src.getAttribute('data-drag');
        const ghost = src.cloneNode(true);
        ghost.classList.add('sp-ghost');
        ghost.classList.remove('is-dim', 'is-selected', 'is-flash');
        ghost.removeAttribute('data-drag');
        ghost.style.width = `${Math.min(Math.max(rect.width, 120), 220)}px`;
        const hint = document.createElement('div');
        hint.className = 'sp-ghost-hint';
        hint.hidden = true;
        const holder = document.createElement('div');
        holder.className = 'sp-ghost-holder';
        holder.appendChild(ghost);
        holder.appendChild(hint);
        document.body.appendChild(holder);
        drag = {
            kind,
            demandId: src.getAttribute('data-demand'),
            assignmentId: src.getAttribute('data-asg') || null,
            dow: kind === 'tile' ? Number(src.getAttribute('data-dow')) : null,
            period: kind === 'tile' ? src.getAttribute('data-period') : null,
            holder,
            hint,
            dx: Math.min(e.clientX - rect.left, 200),
            dy: Math.min(e.clientY - rect.top, 40),
            over: null,
            x: e.clientX,
            y: e.clientY,
            pointerId: pending.id
        };
        pending = null;
        src.classList.add('is-drag-source');
        document.body.classList.add('sp-dragging');
        document.body.classList.toggle('sp-dragging-tile', kind === 'tile');
        markTargets();
        moveDrag(e);
        drag.raf = requestAnimationFrame(autoScroll);
    }

    function sourceEl() {
        if (!drag) return null;
        if (drag.kind === 'tile') {
            return document.querySelector(`.sp-tile[data-asg="${CSS.escape(drag.assignmentId)}"][data-dow="${drag.dow}"][data-period="${CSS.escape(String(drag.period))}"]`);
        }
        return document.querySelector(`.sp-card[data-demand="${CSS.escape(drag.demandId)}"]`);
    }

    function setHint(text, level) {
        if (!drag) return;
        drag.hint.hidden = !text;
        drag.hint.textContent = text || '';
        drag.hint.setAttribute('data-level', level || 'ok');
    }

    function moveDrag(e) {
        drag.x = e.clientX;
        drag.y = e.clientY;
        drag.holder.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const cell = el && el.closest ? el.closest('#spBoard [data-cell]') : null;
        const tray = !cell && el && el.closest ? el.closest('#spTray') : null;
        const hop = !cell && el && el.closest ? el.closest('[data-sp-day], [data-sp-focus]') : null;
        const over = cell || (tray && drag.kind === 'tile' ? tray : null) || hop || null;
        if (over !== drag.over) {
            if (drag.over) drag.over.classList.remove('is-over');
            clearTimeout(drag.hopTimer);
            drag.over = over;
            if (over) over.classList.add('is-over');
            if (hop) {
                // Hold over a day or a name to turn the page while carrying a class.
                drag.hopTimer = setTimeout(() => {
                    if (!drag || drag.over !== hop) return;
                    if (hop.hasAttribute('data-sp-day')) state.day = Number(hop.getAttribute('data-sp-day'));
                    else state.focus[state.view] = hop.getAttribute('data-sp-focus');
                    renderToolbar();
                    renderBoard();
                    const src = sourceEl();
                    if (src) src.classList.add('is-drag-source');
                    drag.over = null;
                    markTargets();
                }, 480);
            }
        }
        if (cell) {
            const info = cellInfo(cell);
            const res = (drag.cache && drag.cache.get(`${info.col}|${info.dow}|${info.period}`)) || evaluateDrop(drag, info);
            setHint(res.hint, res.level);
        } else if (tray && drag.kind === 'tile') {
            setHint(t('spHintRemove', 'Take off the board'), 'ok');
        } else {
            setHint('', 'ok');
        }
    }

    function autoScroll() {
        if (!drag) return;
        const sc = document.querySelector('#spBoard .sp-board-scroll');
        if (sc) {
            const r = sc.getBoundingClientRect();
            const edge = 48;
            const speed = 14;
            if (drag.y > r.top && drag.y < r.bottom) {
                if (drag.x > r.right - edge && drag.x < r.right + 20) sc.scrollLeft += speed;
                else if (drag.x < r.left + edge + 56 && drag.x > r.left - 20) sc.scrollLeft -= speed;
            }
            if (drag.x > r.left && drag.x < r.right) {
                if (drag.y > r.bottom - edge && drag.y < r.bottom + 20) sc.scrollTop += speed;
                else if (drag.y < r.top + edge + 40 && drag.y > r.top - 20) sc.scrollTop -= speed;
            }
        }
        drag.raf = requestAnimationFrame(autoScroll);
    }

    function endDrag(e, cancelled) {
        if (!drag) return;
        const d = drag;
        cancelAnimationFrame(d.raf);
        clearTimeout(d.hopTimer);
        let action = null;
        if (!cancelled && e) {
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const cell = el && el.closest ? el.closest('#spBoard [data-cell]') : null;
            const tray = !cell && el && el.closest ? el.closest('#spTray') : null;
            if (cell) {
                const res = evaluateDrop(d, cellInfo(cell));
                if (res.ok) action = res;
                else if (!res.same && res.hint) notice(res.hint, 'error');
            } else if (tray && d.kind === 'tile') {
                action = {
                    run: (data, draft) => api().removePeriod(data, draft, d.assignmentId, d.dow, d.period)
                };
            }
        }
        d.holder.remove();
        drag = null;
        clearTargets();
        document.body.classList.remove('sp-dragging', 'sp-dragging-tile');
        document.querySelectorAll('.is-drag-source').forEach((x) => x.classList.remove('is-drag-source'));
        if (action) runDrop(action, d);
        else if (renderQueued) render();
    }

    /** Carry out a drop (from a drag or a touch tap). done(true) when something changed. */
    function runDrop(action, d, done) {
        const finish = (ok) => { if (done) done(ok); };
        if (action.confirm) {
            // Off-day override: nothing happens unless the user says yes.
            const pendingAction = Object.assign({}, action, { confirm: '' });
            confirmBox(action.confirm, t('spPlaceAnyway', 'Place anyway')).then((yes) => {
                if (!yes) {
                    render();
                    finish(false);
                    return;
                }
                const res = mutate(pendingAction.run, { quiet: true });
                const id = (res && res.assignmentId) || d.assignmentId;
                if (res && res.ok !== false && id) flashTile(id, pendingAction.landing.dow, pendingAction.landing.period);
                finish(!(res && res.ok === false));
                render();
            });
            return;
        }
        if (action.landing) {
            const clashesBefore = clashCount();
            const res = mutate(action.run, { quiet: true });
            if (res && res.ok !== false && clashCount() > clashesBefore) {
                notice(t('spClashMade', 'That made a clash. Press “Suggest fixes” to see ways to move the other classes, or fix it by hand.'), 'info');
            }
            const id = (res && res.assignmentId) || d.assignmentId;
            if (res && res.ok !== false && id) flashTile(id, action.landing.dow, action.landing.period);
            finish(!(res && res.ok === false));
            render();
        } else {
            mutate(action.run, { quiet: true });
            finish(true);
        }
    }

    /* ---------------------------------------------------- touch: tap to place */

    function holdFrom(el) {
        const kind = el.getAttribute('data-drag');
        return {
            kind,
            demandId: el.getAttribute('data-demand'),
            assignmentId: el.getAttribute('data-asg') || null,
            dow: kind === 'tile' ? Number(el.getAttribute('data-dow')) : null,
            period: kind === 'tile' ? el.getAttribute('data-period') : null
        };
    }

    function heldEl() {
        if (!held) return null;
        if (held.kind === 'tile') {
            return document.querySelector(`.sp-tile[data-asg="${CSS.escape(held.assignmentId)}"][data-dow="${held.dow}"][data-period="${CSS.escape(String(held.period))}"]`);
        }
        return document.querySelector(`.sp-card[data-demand="${CSS.escape(held.demandId)}"]`);
    }

    function pickUp(el) {
        held = holdFrom(el);
        state.selected = held.demandId;
        render();
    }

    function letGo() {
        if (!held) return;
        held = null;
        clearTargets();
        render();
    }

    /** After every render: colour the slots for the held class and show the bar. */
    function markHeld() {
        document.querySelectorAll('.is-held').forEach((x) => x.classList.remove('is-held'));
        document.body.classList.toggle('sp-holding', !!held);
        document.body.classList.toggle('sp-holding-tile', !!held && held.kind === 'tile');
        let bar = $('spHoldBar');
        if (!held) {
            if (bar) bar.hidden = true;
            return;
        }
        const demand = M.demandById.get(held.demandId);
        if (!demand) {
            held = null;
            if (bar) bar.hidden = true;
            return;
        }
        const el = heldEl();
        if (el) el.classList.add('is-held');
        markTargets(held);
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'spHoldBar';
            bar.className = 'sp-holdbar';
            bar.setAttribute('role', 'status');
            document.body.appendChild(bar);
        }
        const left = held.kind !== 'tile' ? demandNeed(demand) - placedCount(M, demand) : 0;
        const msg = held.kind === 'tile'
            ? t('spHoldTile', 'Moving {name}. Tap a slot to move it, or tap the list to take it off.', { name: demand.name })
            : t('spHoldCard', 'Placing {name} ({n} left). Tap a slot.', { name: demand.name, n: left });
        bar.hidden = false;
        bar.innerHTML = `<span class="sp-holdbar-text">${esc(msg)}</span><button type="button" class="btn btn-outline btn-small" data-act="let-go">${esc(t('spHoldDone', 'Done'))}</button>`;
    }

    /** A tap while a class is held. Returns true when the tap was used. */
    function tapWhileHeld(e) {
        if (!held) return false;
        const cell = e.target.closest('#spBoard [data-cell]');
        if (cell) {
            const res = evaluateDrop(held, cellInfo(cell));
            if (res.same) {
                letGo();
                return true;
            }
            if (!res.ok) {
                if (res.hint) notice(res.hint, 'error');
                return true;
            }
            const d = held;
            runDrop(res, d, (ok) => {
                if (!ok || !held) return;
                // A class from the list stays in hand until all its periods are on the board.
                const demand = M.demandById.get(d.demandId);
                if (d.kind !== 'tile' && demand && placedCount(M, demand) < demandNeed(demand)) markHeld();
                else letGo();
            });
            return true;
        }
        if (held.kind === 'tile' && e.target.closest('#spTray') && !e.target.closest('.sp-card')) {
            const d = held;
            held = null;
            mutate((data, draft) => api().removePeriod(data, draft, d.assignmentId, d.dow, d.period));
            return true;
        }
        return false;
    }

    /* ------------------------------------------------- drag to reorder (setup) */

    function beginSort(e) {
        const item = pending.src.closest('[data-sort-item]');
        const list = item && item.parentElement;
        if (!item || !list) {
            pending = null;
            return;
        }
        const rect = item.getBoundingClientRect();
        const ghost = item.cloneNode(true);
        ghost.classList.add('sp-sort-ghost');
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        document.body.appendChild(ghost);
        item.classList.add('is-sort-source');
        sort = { item, list, ghost, dy: e.clientY - rect.top, left: rect.left, kind: list.getAttribute('data-sort-list') };
        pending = null;
        document.body.classList.add('sp-dragging');
        moveSort(e);
    }

    function moveSort(e) {
        const { item, list, ghost } = sort;
        ghost.style.transform = `translate(${sort.left}px, ${e.clientY - sort.dy}px)`;
        const items = Array.from(list.querySelectorAll(':scope > [data-sort-item]'));
        const before = new Map(items.map((el) => [el, el.getBoundingClientRect().top]));
        const others = items.filter((el) => el !== item);
        let ref = null;
        for (let i = 0; i < others.length; i += 1) {
            const r = others[i].getBoundingClientRect();
            if (e.clientY < r.top + r.height / 2) {
                ref = others[i];
                break;
            }
        }
        if ((ref || null) === (item.nextElementSibling || null)) return;
        list.insertBefore(item, ref);
        // The other rows slide out of the way.
        items.forEach((el) => {
            if (el === item) return;
            const delta = before.get(el) - el.getBoundingClientRect().top;
            if (!delta) return;
            el.style.transition = 'none';
            el.style.transform = `translateY(${delta}px)`;
            requestAnimationFrame(() => {
                el.style.transition = 'transform 160ms ease';
                el.style.transform = '';
            });
        });
    }

    function endSort() {
        if (!sort) return;
        const s = sort;
        const ids = Array.from(s.list.querySelectorAll(':scope > [data-sort-item]')).map((el) => el.getAttribute('data-sort-item'));
        const target = s.item.getBoundingClientRect();
        s.ghost.style.transition = 'transform 140ms ease';
        s.ghost.style.transform = `translate(${target.left}px, ${target.top}px)`;
        setTimeout(() => {
            s.ghost.remove();
            s.item.classList.remove('is-sort-source');
        }, 150);
        sort = null;
        document.body.classList.remove('sp-dragging');
        const data = M.data;
        if (s.kind === 'teachers') {
            data.plannerState.teacherBoard.panelOrder = ids;
        } else if (s.kind === 'rooms') {
            ids.forEach((id, i) => {
                const room = data.rooms.find((r) => r.id === id);
                if (room) room.sortOrder = i + 1;
            });
        }
        markDirty();
        setTimeout(render, 160);
    }

    /* ---------------------------------------------------------- pointer wiring */

    function onPointerDown(e) {
        lastPointer = e.pointerType || 'mouse';
        if (e.button != null && e.button !== 0) return;
        const handle = e.target.closest && e.target.closest('[data-sort-handle]');
        if (handle) {
            if (readOnly()) return;
            pending = { src: handle, x: e.clientX, y: e.clientY, id: e.pointerId, sort: true };
            e.preventDefault();
            return;
        }
        const src = e.target.closest && e.target.closest('[data-drag]');
        if (!src || e.target.closest('button, select, input, a, textarea')) return;
        if (readOnly()) return;
        pending = { src, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType === 'touch' };
        if (pending.touch) {
            if (held) letGo(); // a long-press drag replaces a held class
            pending.timer = setTimeout(() => {
                if (pending && pending.src === src) beginDrag({ clientX: pending.x, clientY: pending.y });
            }, 180);
        }
    }

    function onPointerMove(e) {
        if (sort) {
            e.preventDefault();
            moveSort(e);
            return;
        }
        if (drag) {
            e.preventDefault();
            moveDrag(e);
            return;
        }
        if (!pending) return;
        const dist = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
        if (pending.sort) {
            if (dist > 3) beginSort(e);
            return;
        }
        if (pending.touch) {
            pending.x = e.clientX;
            pending.y = e.clientY;
            return;
        }
        if (dist > 5) beginDrag(e);
    }

    function onPointerUp(e) {
        if (pending) {
            clearTimeout(pending.timer);
            pending = null;
        }
        if (sort) endSort();
        if (drag) {
            drag.justEnded = true;
            suppressClick = true;
            setTimeout(() => { suppressClick = false; }, 0);
            endDrag(e, e.type === 'pointercancel');
        }
    }
    let suppressClick = false;

    /* ----------------------------------------------------------------- setup */

    function openSetup(tab) {
        if (tab && ['cohorts', 'teachers', 'rooms', 'classes'].includes(tab)) state.setupTab = tab;
        state.setupOpen = true;
        const dlg = $('spSetup');
        if (dlg) dlg.hidden = false;
        document.body.classList.add('sp-modal-open');
        renderSetup();
        const first = dlg && dlg.querySelector('[data-setup-tab].is-active');
        if (first) first.focus();
    }

    function closeSetup() {
        state.setupOpen = false;
        state.openBlockGrid = null;
        const dlg = $('spSetup');
        if (dlg) dlg.hidden = true;
        document.body.classList.remove('sp-modal-open');
        render();
    }

    function blockGrid(m, ownerId) {
        const everyone = ownerId === 'everyone';
        const profile = everyone ? null : m.teacherById.get(ownerId);
        const g = m.data.plannerState.blockouts || {};
        const isOn = (dow, period) => (everyone
            ? (g.globalUnavailableSlots || []).some((s) => Number(s.dow) === dow && String(s.period) === period)
            : (profile.availability.unavailableSlots || []).some((s) => Number(s.dow) === dow && String(s.period) === period));
        return `
<div class="sp-blockgrid" role="group" aria-label="${esc(t('spBlockGridLabel', 'Times not available'))}">
  <p class="sp-hint">${esc(everyone
        ? t('spBlockHintEveryone', 'Click the times when nobody should teach (staff meeting, dinner). A class dropped there gets a warning.')
        : t('spBlockHintTeacher', 'Click the times this teacher cannot teach. A class dropped there gets a warning.'))}</p>
  <table><thead><tr><th></th>${DAYS.map((d) => `<th>${esc(dayLabel(d))}</th>`).join('')}</tr></thead>
  <tbody>${m.periods.map((row) => `<tr><th>${esc(row.start || row.period)}</th>${DAYS.map((d) => {
        const on = isOn(d, row.period);
        return `<td><button type="button" class="sp-block${on ? ' is-on' : ''}" data-act="toggle-block" data-owner="${esc(ownerId)}" data-dow="${d}" data-period="${esc(row.period)}" aria-pressed="${on}" aria-label="${esc(`${dayLabel(d)} ${row.start || row.period}`)}"></button></td>`;
    }).join('')}</tr>`).join('')}</tbody></table>
</div>`;
    }

    /* ------------------------------------------------- Setup > Periods (clock times) */

    function periodsApi() {
        return global.CCPTimetablePeriods || null;
    }

    /** The period table: number, start, end. Saved straight away (the whole app uses these times). */
    function periodsSetupHtml() {
        const tp = periodsApi();
        if (!tp) return `<p class="sp-empty">${esc(t('spPeriodsUnavailable', 'Period times are not available here.'))}</p>`;
        const slots = tp.getSortedTimeSlots(M.data);
        const map = Object.assign({}, M.data.periodSlotMap || tp.getDefaultMap());
        const nums = tp.getPeriodNumbers(map);
        const ro = readOnly();
        const firstOn = !!(M.data.plannerState && M.data.plannerState.useFirstPeriod === true);
        return `<label class="sp-chip"><input type="checkbox" data-change="use-first-period"${firstOn ? ' checked' : ''}${ro ? ' disabled' : ''}><span>${esc(t('spUseFirstPeriod', 'Use the first period (P1)'))}</span></label>
<p class="sp-hint">${esc(t('spUseFirstPeriodHint', 'Off: the first period is ignored. Auto-schedule never uses it and the board hides it (a class already placed there keeps it visible).'))}</p>
<p class="sp-hint">${esc(t('spSetupPeriodsHint', 'Clock times for each period. The board, warnings and printouts use these, and so does the rest of the app. Changes save straight away.'))}</p>
<table class="sp-table sp-periods"><thead><tr><th>${esc(t('timetablePeriodColPeriod', 'Period'))}</th><th>${esc(t('timetablePeriodColStart', 'Start'))}</th><th>${esc(t('timetablePeriodColEnd', 'End'))}</th><th></th></tr></thead><tbody>
${nums.map((n) => {
        const slot = slots.find((x) => x.id === map[String(n)]) || {};
        return `<tr data-period-row="${esc(String(n))}">
  <td><strong>P${esc(String(n))}</strong></td>
  <td><input type="time" class="field-input" data-change="period-start" value="${esc(slot.start || '')}"${ro ? ' disabled' : ''} aria-label="${esc(t('timetablePeriodColStart', 'Start'))}"></td>
  <td><input type="time" class="field-input" data-change="period-end" value="${esc(slot.end || '')}"${ro ? ' disabled' : ''} aria-label="${esc(t('timetablePeriodColEnd', 'End'))}"></td>
  <td><button type="button" class="sp-icon-btn" data-act="period-remove"${ro ? ' disabled' : ''} aria-label="${esc(t('timetablePeriodRemove', 'Remove'))}">×</button></td>
</tr>`;
    }).join('')}
</tbody></table>
<div class="sp-setup-actions">
  <button type="button" class="btn btn-outline btn-small" data-act="period-add"${ro ? ' disabled' : ''}>${esc(t('timetablePeriodAdd', '+ Add period'))}</button>
  <button type="button" class="btn btn-outline btn-small" data-act="period-reset"${ro ? ' disabled' : ''}>${esc(t('timetablePeriodResetDefaults', 'Reset to defaults'))}</button>
</div>`;
    }

    /** Save a new period schedule after checking it; false (with a message) when it is not valid. */
    function savePeriods(slots, map) {
        const tp = periodsApi();
        const v = tp.validatePeriodSchedule(slots, map);
        if (!v.ok) {
            notice(t('spPeriodsInvalid', 'Each period must end after it starts.'), 'error');
            renderSetup();
            return false;
        }
        setupEdit((data) => {
            data.timetableTimeSlots = v.slots;
            data.periodSlotMap = tp.normalizePeriodSlotMap(map, v.slots);
        });
        render();
        return true;
    }

    function currentPeriods() {
        const tp = periodsApi();
        return {
            slots: tp.getSortedTimeSlots(M.data).map((x) => Object.assign({}, x)),
            map: Object.assign({}, M.data.periodSlotMap || tp.getDefaultMap())
        };
    }

    function editPeriodTime(el, which) {
        const tp = periodsApi();
        const row = el.closest('[data-period-row]');
        if (!tp || !row || readOnly()) return;
        const cur = currentPeriods();
        const slot = cur.slots.find((x) => x.id === cur.map[row.getAttribute('data-period-row')]);
        if (!slot) return;
        slot[which] = el.value;
        const dur = tp.computeDurationMin(slot.start, slot.end);
        if (dur != null) slot.durationMin = dur;
        savePeriods(cur.slots, cur.map);
    }

    function periodAction(act, el) {
        const tp = periodsApi();
        if (!tp || readOnly()) return;
        const cur = currentPeriods();
        if (act === 'period-add') {
            const r = tp.addPeriod(cur.slots, cur.map);
            if (r.ok) savePeriods(r.slots, r.map);
        } else if (act === 'period-remove') {
            const n = el.closest('[data-period-row]').getAttribute('data-period-row');
            const used = tp.findClassesUsingPeriod(M.data, n);
            if (used.length) {
                notice(t('timetablePeriodInUse', 'Period {period} is used by: {classes}').replace('{period}', n).replace('{classes}', used.map((c) => c.name || c.id).join(', ')), 'error');
                return;
            }
            const r = tp.removePeriod(cur.slots, cur.map, n);
            if (r.ok) savePeriods(r.slots, r.map);
        } else if (act === 'period-reset') {
            confirmBox(t('timetablePeriodResetDefaults', 'Reset to defaults') + '?', t('spOk', 'OK')).then((yes) => {
                if (!yes) return;
                const d = tp.resetToDefaultSchedule();
                savePeriods(d.slots, d.map);
            });
        }
    }

    function renderSetup() {
        const body = $('spSetupBody');
        if (!body || !M) return;
        const keep = body.scrollTop;
        document.querySelectorAll('[data-setup-tab]').forEach((b) => {
            const on = b.getAttribute('data-setup-tab') === state.setupTab;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        const grip = `<button type="button" class="sp-grip" data-sort-handle aria-label="${esc(t('spDragToReorder', 'Drag to reorder'))}" title="${esc(t('spDragToReorder', 'Drag to reorder'))}"><span aria-hidden="true">⋮⋮</span></button>`;
        let html = '';
        if (state.setupTab === 'teachers') {
            const classTypes = classTypeList(M);
            const g = M.data.plannerState.blockouts || {};
            const everyoneCount = (g.globalUnavailableSlots || []).length;
            html += `<p class="sp-hint">${esc(t('spSetupTeachersHint', 'Teachers on your classes are listed automatically. Drag to set the column order on the board. Clock-in, clock-out and times off only give warnings; a class can still be placed there.'))}</p>`;
            html += `<div class="sp-rows" data-sort-list="teachers">${M.teachers.map((p) => {
                const off = (p.availability.unavailableSlots || []).length;
                const open = state.openBlockGrid === p.id;
                return `
<div class="sp-row" data-sort-item="${esc(p.id)}" data-teacher="${esc(p.id)}">
  <div class="sp-row-main">
    ${grip}
    <input class="field-input sp-in-name" data-input="teacher-name" value="${esc(p.name)}" aria-label="${esc(t('spName', 'Name'))}">
    <select class="field-select" data-change="teacher-role" aria-label="${esc(t('plannerRole', 'Role'))}">
      <option value="korean"${p.role === 'korean' ? ' selected' : ''}>${esc(t('spRoleKoreanFull', 'Korean teacher'))}</option>
      <option value="native"${p.role === 'native' ? ' selected' : ''}>${esc(t('spRoleNativeFull', 'Native teacher'))}</option>
    </select>
    <label class="sp-num"><span>${esc(t('spColour', 'Colour'))}</span><input type="color" class="sp-colour" data-change="teacher-colour" value="${esc(teacherColor(M, p.id))}"></label>
    <label class="sp-num"><span>${esc(t('spMaxWeek', 'Max / week'))}</span><input type="number" class="field-input" min="0" max="60" data-input="teacher-maxweek" value="${Number(p.limits.maxPeriodsPerWeek) || 0}"></label>
    <label class="sp-num"><span>${esc(t('spMaxDay', 'Max / day'))}</span><input type="number" class="field-input" min="0" max="12" data-input="teacher-maxday" value="${Number(p.limits.maxPeriodsPerDay) || 0}"></label>
    <label class="sp-num"><span>${esc(t('spClockIn', 'Clock in'))}</span><input type="time" class="field-input" data-input="teacher-workstart" value="${esc(p.availability.workStart || '')}"></label>
    <label class="sp-num"><span>${esc(t('spClockOut', 'Clock out'))}</span><input type="time" class="field-input" data-input="teacher-workend" value="${esc(p.availability.workEnd || '')}"></label>
    <span class="sp-chips" role="group" aria-label="${esc(t('spLevels', 'Levels taught'))}">
      ${['junior', 'middle', 'senior'].map((b) => `<label class="sp-chip"><input type="checkbox" data-change="teacher-band" data-band="${b}"${p.limits[`${b}Allowed`] !== false ? ' checked' : ''}><span>${esc(bandLabel(b))}</span></label>`).join('')}
      <label class="sp-chip" title="${esc(t('spOwnTypeOnlyTitle', 'Only give this teacher classes marked for their own teacher type'))}"><input type="checkbox" data-change="teacher-owntype"${p.limits.ownTypeOnly ? ' checked' : ''}><span>${esc(p.role === 'native' ? t('spNativeClassesOnly', 'Native-teacher classes only') : t('spKoreanClassesOnly', 'Korean-teacher classes only'))}</span></label>
    </span>
    ${classTypes.length ? `<button type="button" class="btn btn-outline btn-small${state.openTypes === p.id ? ' is-active' : ''}" data-act="toggle-types" data-owner="${esc(p.id)}" aria-expanded="${state.openTypes === p.id}">${esc((p.limits.onlyClassTypeIds || []).length ? t('spClassTypesN', 'Class types ({n})', { n: p.limits.onlyClassTypeIds.length }) : t('spClassTypesAny', 'Class types: any'))}</button>` : ''}
    <button type="button" class="btn btn-outline btn-small${open ? ' is-active' : ''}" data-act="toggle-blockgrid" data-owner="${esc(p.id)}" aria-expanded="${open}">${esc(off ? t('spTimesOffN', 'Times off ({n})', { n: off }) : t('spTimesOff', 'Times off'))}</button>
    <button type="button" class="sp-icon-btn" data-act="remove-teacher" aria-label="${esc(t('spRemoveTeacher', 'Remove {name}', { name: p.name }))}">×</button>
  </div>
  ${state.openTypes === p.id ? `<div class="sp-blockgrid"><p class="sp-hint">${esc(t('spClassTypesHint', 'Tick the class types this teacher teaches. None ticked means any.'))}</p><span class="sp-chips sp-chips--wrap">${classTypes.map((ct) => `<label class="sp-chip"><input type="checkbox" data-change="teacher-classtype" data-type="${esc(ct.id)}"${(p.limits.onlyClassTypeIds || []).includes(ct.id) ? ' checked' : ''}><span>${esc(ct.label)}</span></label>`).join('')}</span></div>` : ''}
  ${open ? blockGrid(M, p.id) : ''}
</div>`;
            }).join('')}</div>
<div class="sp-setup-actions">
  <button type="button" class="btn btn-outline btn-small" data-act="add-teacher">${esc(t('spAddTeacher', '+ Add teacher'))}</button>
  <label class="sp-num sp-num--inline"><span>${esc(t('spMaxRun', 'Most periods in a row'))}</span><input type="number" class="field-input" min="1" max="12" data-input="max-run" value="${api().maxConsecutive(M.data)}"></label>
  <button type="button" class="btn btn-outline btn-small${state.openBlockGrid === 'everyone' ? ' is-active' : ''}" data-act="toggle-blockgrid" data-owner="everyone" aria-expanded="${state.openBlockGrid === 'everyone'}">${esc(everyoneCount ? t('spEveryoneOffN', 'Times blocked for everyone ({n})', { n: everyoneCount }) : t('spEveryoneOff', 'Times blocked for everyone'))}</button>
</div>
${state.openBlockGrid === 'everyone' ? blockGrid(M, 'everyone') : ''}`;
        } else if (state.setupTab === 'cohorts') {
            const pending = api().pendingCohortBlocks(M.data);
            html += `<p class="sp-hint">${esc(t('spSetupCohortsHint', 'When each cohort’s students are at school, by class period (blank = the level’s usual periods). The planner uses these straight away for warnings and auto-schedule. The cohorts themselves only change when you press “Save to cohorts”.'))}</p>`;
            [...state.cohortSel].forEach((id) => { if (!M.cohortById.has(id)) state.cohortSel.delete(id); });
            // Filters narrow the list; "change several at once" works on the ticked cohorts that are
            // shown, or on everything shown when none is ticked.
            const shown = M.cohorts.filter(cohortFilterMatch);
            const ticked = shown.filter((c) => state.cohortSel.has(c.id));
            const target = ticked.length ? ticked : shown;
            const allOn = shown.length > 0 && ticked.length === shown.length;
            const group = (key, opts) => `<span class="sp-filter-group" role="group" aria-label="${esc(cohortFilterTitle(key))}">
      <span class="sp-filter-label">${esc(cohortFilterTitle(key))}</span>
      ${opts.map((v) => `<button type="button" class="sp-filter-chip${state.cohortFilter[key] === v ? ' is-active' : ''}" data-act="cohort-filter" data-key="${key}" data-value="${v}" aria-pressed="${state.cohortFilter[key] === v}">${esc(cohortFilterLabel(v))}</button>`).join('')}
    </span>`;
            const levels = ['all'].concat(['junior', 'senior', 'middle'].filter((b) => M.cohorts.some((c) => c.band === b)));
            html += M.cohorts.length ? `
<div class="sp-filters" role="group" aria-label="${esc(t('spFilterLabel', 'Show cohorts'))}">
    ${group('level', levels)}
    ${group('days', ['all', 'mwf', 'tth'])}
    ${group('block', ['all', 'primary', 'secondary'])}
    ${group('hours', ['all', 'nohours', 'set'])}
    <span class="sp-count">${esc(t('spFilterCount', '{n} of {total} shown', { n: shown.length, total: M.cohorts.length }))}</span>
</div>
<div class="sp-batch" role="group" aria-label="${esc(t('spBatchLabel', 'Change several cohorts at once'))}">
  <div class="sp-batch-row">
    <strong>${esc(t('spBatchTitle', 'Change several at once'))}</strong>
    <span class="sp-hint">${esc(ticked.length
        ? t('spBatchTicked', 'Applies to the {n} ticked cohorts.', { n: ticked.length })
        : t('spBatchShown', 'Applies to all {n} cohorts shown. Tick some to narrow it.', { n: shown.length }))}</span>
  </div>
  <div class="sp-batch-row">
    <span class="sp-chips">${DAYS.map((d) => `<label class="sp-chip"><input type="checkbox" data-batch-day="${d}"${state.batchDays && state.batchDays.includes(d) ? ' checked' : ''}><span>${esc(dayLabel(d))}</span></label>`).join('')}</span>
    <button type="button" class="btn btn-outline btn-small" data-act="cohort-batch" data-what="days"${target.length ? '' : ' disabled'}>${esc(t('spBatchSetDays', 'Set these days'))}</button>
    <label class="sp-num"><span>${esc(t('spBlockFrom', 'From'))}</span>${periodSelectHtml('start', state.batchStart || '', 'id="spBatchStart"')}</label>
    <label class="sp-num"><span>${esc(t('spBlockTo', 'To'))}</span>${periodSelectHtml('end', state.batchEnd || '', 'id="spBatchEnd"')}</label>
    <button type="button" class="btn btn-outline btn-small" data-act="cohort-batch" data-what="hours"${target.length ? '' : ' disabled'}>${esc(t('spBatchSetHours', 'Set these hours'))}</button>
  </div>
</div>
<table class="sp-table"><thead><tr><th><input type="checkbox" data-change="cohort-select-all"${allOn ? ' checked' : ''} aria-label="${esc(t('spBatchAll', 'All'))}"></th><th>${esc(t('spCohort', 'Cohort'))}</th><th>${esc(t('spDays', 'Days'))}</th><th>${esc(t('spBlockFrom', 'From'))}</th><th>${esc(t('spBlockTo', 'To'))}</th><th></th></tr></thead><tbody>${shown.length ? '' : `<tr><td colspan="6" class="sp-empty">${esc(t('spFilterNone', 'No cohorts match these filters.'))}</td></tr>`}${shown.map((c) => `
<tr data-cohort="${esc(c.id)}"${state.cohortSel.has(c.id) ? ' class="is-picked"' : ''}>
  <td><input type="checkbox" data-change="cohort-select"${state.cohortSel.has(c.id) ? ' checked' : ''} aria-label="${esc(c.name)}"></td>
  <td><span class="sp-swatch" style="background:${esc(c.color || '#94a3b8')}"></span>${esc(c.name)} <span class="sp-hint">${esc(bandLabel(c.band))}</span></td>
  <td><span class="sp-chips">${DAYS.map((d) => `<label class="sp-chip"><input type="checkbox" data-change="cohort-day" data-dow="${d}"${c.block.days.includes(d) ? ' checked' : ''}><span>${esc(dayLabel(d))}</span></label>`).join('')}</span></td>
  <td>${periodSelectHtml('start', c.block.start, `data-change="cohort-start" aria-label="${esc(t('spBlockFrom', 'From'))}"`)}</td>
  <td>${periodSelectHtml('end', c.block.end, `data-change="cohort-end" aria-label="${esc(t('spBlockTo', 'To'))}"`)}</td>
  <td>${c.block.staged ? `<span class="sp-pill sp-pill--warn">${esc(t('spNotSaved', 'Not saved to cohort'))}</span>` : (!c.block.start || !c.block.end ? `<span class="sp-hint">${esc(t('spBlockDefault', 'No hours set: uses the usual hours for its level'))}</span>` : '')}</td>
</tr>`).join('')}</tbody></table>
<div class="sp-setup-actions">
  <button type="button" class="btn btn-primary btn-small" data-act="save-cohort-blocks"${pending.length ? '' : ' disabled'}>${esc(t('spSaveCohorts', 'Save to cohorts ({n})', { n: pending.length }))}</button>
  <button type="button" class="btn btn-outline btn-small" data-act="discard-cohort-blocks"${pending.length ? '' : ' disabled'}>${esc(t('spDiscardCohorts', 'Discard changes'))}</button>
</div>` : `<p class="sp-empty">${esc(t('spEmptyCohorts', 'No cohorts on this calendar yet. Create them on the Cohorts tab of the calendar.'))}</p>`;
        } else if (state.setupTab === 'periods') {
            html += periodsSetupHtml();
        } else if (state.setupTab === 'rooms') {
            html += `<p class="sp-hint">${esc(t('spSetupRoomsHint', 'Rooms are optional. Once you add them, drag classes into rooms on the Rooms sheet.'))}</p>`;
            html += `<div class="sp-rows" data-sort-list="rooms">${M.rooms.map((r) => `
<div class="sp-row" data-sort-item="${esc(r.id)}" data-room="${esc(r.id)}">
  <div class="sp-row-main">
    ${grip}
    <input class="field-input sp-in-name" data-input="room-name" value="${esc(r.name)}" aria-label="${esc(t('spRoomName', 'Room name'))}">
    <label class="sp-num"><span>${esc(t('spSeatsLabel', 'Seats'))}</span><input type="number" class="field-input" min="0" max="200" data-input="room-capacity" value="${r.capacity != null ? Number(r.capacity) : ''}"></label>
    <button type="button" class="sp-icon-btn" data-act="remove-room" aria-label="${esc(t('spRemoveRoom', 'Remove {name}', { name: r.name }))}">×</button>
  </div>
</div>`).join('')}</div>
<div class="sp-setup-actions"><button type="button" class="btn btn-outline btn-small" data-act="add-room">${esc(t('spAddRoom', '+ Add room'))}</button></div>`;
        } else {
            html += `<p class="sp-hint">${esc(t('spSetupClassesHint', 'How many periods a week each class needs, and which kind of teacher. Untick a class to leave it out of the plan.'))}</p>`;
            const by = new Map();
            M.allDemands.forEach((d) => {
                const cid = (d.cohortIds || []).find((id) => M.cohortById.has(id)) || NONE;
                if (!by.has(cid)) by.set(cid, []);
                by.get(cid).push(d);
            });
            const ids = M.cohorts.map((c) => c.id).filter((id) => by.has(id));
            if (by.has(NONE)) ids.push(NONE);
            html += ids.length ? `<table class="sp-table"><thead><tr><th>${esc(t('spInPlan', 'In plan'))}</th><th>${esc(t('spClass', 'Class'))}</th><th>${esc(t('spPerWeek', 'Periods / week'))}</th><th>${esc(t('spTeacherType', 'Teacher'))}</th></tr></thead><tbody>${ids.map((cid) => `
<tr class="sp-table-group"><th colspan="4">${esc(cid === NONE ? t('spNoCohort', 'No cohort') : M.cohortById.get(cid).name)}</th></tr>
${by.get(cid).map((d) => `
<tr data-class="${esc(d.classId)}"${d.includedInDraft === false ? ' class="is-off"' : ''}>
  <td><input type="checkbox" data-change="class-include"${d.includedInDraft !== false ? ' checked' : ''} aria-label="${esc(t('spInPlan', 'In plan'))}"></td>
  <td><span class="sp-swatch" style="background:${esc(demandColor(M, d))}"></span>${esc(d.name)}</td>
  <td><input type="number" class="field-input sp-in-small" min="1" max="10" data-input="class-freq" value="${demandNeed(d)}" aria-label="${esc(t('spPerWeek', 'Periods / week'))}"></td>
  <td><select class="field-select" data-change="class-type" aria-label="${esc(t('spTeacherType', 'Teacher'))}">
    <option value="either"${d.teacherRequirementType === 'either' ? ' selected' : ''}>${esc(t('spTypeEither', 'Any teacher'))}</option>
    <option value="korean"${d.teacherRequirementType === 'korean' ? ' selected' : ''}>${esc(t('spRoleKoreanFull', 'Korean teacher'))}</option>
    <option value="native"${d.teacherRequirementType === 'native' ? ' selected' : ''}>${esc(t('spRoleNativeFull', 'Native teacher'))}</option>
  </select></td>
</tr>`).join('')}`).join('')}</tbody></table>` : `<p class="sp-empty">${esc(t('spTrayEmpty', 'No classes yet. Add classes on the calendar first, or open Setup to bring left-out classes back.'))}</p>`;
        }
        body.innerHTML = html;
        body.scrollTop = keep;
        body.classList.toggle('sp-locked', !!readOnly());
    }

    /**
     * Pick student hours by class period, not by typing times. 'start' lists each period's start
     * ("P4 · 17:00"), 'end' each period's end ("P7 · to 21:00"); the cohort still stores the times.
     * Blank = the level's usual periods. A saved time that is not a period edge stays as its own choice.
     */
    function periodSelectHtml(edge, current, attrs) {
        const cur = String(current || '');
        const opts = M.periods.map((row) => {
            const time = edge === 'start' ? row.start : row.end;
            if (!time) return null;
            const label = edge === 'start'
                ? t('spPeriodFrom', 'P{n} · {time}', { n: row.period, time })
                : t('spPeriodTo', 'P{n} · to {time}', { n: row.period, time });
            return { time, label };
        }).filter(Boolean);
        const known = !cur || opts.some((o) => o.time === cur);
        return `<select class="field-select sp-period-select" ${attrs}>
  <option value="">${esc(t('spLevelDefault', 'Level default'))}</option>
  ${known ? '' : `<option value="${esc(cur)}" selected>${esc(cur)}</option>`}
  ${opts.map((o) => `<option value="${esc(o.time)}"${o.time === cur ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
</select>`;
    }

    /** Setup > Cohorts filters: which cohorts the list shows. */
    function cohortFilterMatch(c) {
        const f = state.cohortFilter;
        const days = (c.block && c.block.days) || [];
        const hasHours = !!(c.block && c.block.start && c.block.end);
        if (f.level !== 'all' && c.band !== f.level) return false;
        if (f.days === 'mwf' && !(days.length && days.every((d) => [1, 3, 5].includes(d)))) return false;
        if (f.days === 'tth' && !(days.length && days.every((d) => [2, 4].includes(d)))) return false;
        if (f.block !== 'all' && (c.scheduleBlock || '') !== f.block) return false;
        if (f.hours === 'nohours' && hasHours) return false;
        if (f.hours === 'set' && !hasHours) return false;
        return true;
    }

    function cohortFilterTitle(key) {
        return {
            level: t('spFilterLevel', 'Level'),
            days: t('spDays', 'Days'),
            block: t('spFilterBlock', 'Block'),
            hours: t('spFilterHours', 'Hours')
        }[key] || key;
    }

    function cohortFilterLabel(v) {
        if (v === 'junior' || v === 'senior' || v === 'middle') return bandLabel(v);
        return {
            all: t('spBatchAll', 'All'),
            mwf: t('spPickMwf', 'Mon/Wed/Fri'),
            tth: t('spPickTth', 'Tue/Thu'),
            primary: t('spPickPrimary', 'Primary block'),
            secondary: t('spPickSecondary', 'Secondary block'),
            nohours: t('spPickNoHours', 'No hours set'),
            set: t('spPickHoursSet', 'Hours set')
        }[v] || v;
    }

    /** Remember what is typed in the batch row across re-renders. */
    function keepBatchInputs() {
        const body = $('spSetupBody');
        if (!body) return;
        const boxes = body.querySelectorAll('[data-batch-day]');
        if (boxes.length) state.batchDays = Array.from(boxes).filter((x) => x.checked).map((x) => Number(x.getAttribute('data-batch-day')));
        if ($('spBatchStart')) state.batchStart = $('spBatchStart').value;
        if ($('spBatchEnd')) state.batchEnd = $('spBatchEnd').value;
    }

    async function saveCohortBlocks() {
        if (!M || readOnly()) return;
        const pending = api().pendingCohortBlocks(M.data);
        if (!pending.length) return;
        const list = pending.map((x) => `${x.name}: ${x.block.days.map(dayLabel).join(' ')}${x.block.start && x.block.end ? ` ${x.block.start}–${x.block.end}` : ''}`).join('\n');
        if (!(await confirmBox(
            `${t('spConfirmCohorts', 'Change the days and hours of these cohorts on the calendar?')}\n\n${list}`,
            t('spSaveCohortsOk', 'Save to cohorts')
        ))) return;
        const n = api().writeCohortBlocks(M.data);
        markDirty();
        M = buildModel();
        if (state.setupOpen) renderSetup();
        notice(t('spCohortsSaved', 'Cohorts updated: {n}.', { n }), 'success');
    }

    function classTypeList(m) {
        const seen = new Map();
        const builtin = { 'builtin-debate': 'Debate', 'builtin-wr-sp': 'Wr&Spk', 'builtin-rc': 'RC', 'builtin-conversation': 'Conversation' };
        m.allDemands.forEach((d) => {
            const id = String(d.classTypeId || '');
            if (!id || seen.has(id)) return;
            let label = '';
            if (typeof global.getClassTypeDefinitionById === 'function') {
                const def = global.getClassTypeDefinitionById(id);
                label = def ? String(def.name || def.label || def.displayName || '') : '';
            }
            seen.set(id, label || builtin[id] || id.replace(/^builtin-/, ''));
        });
        return [...seen.entries()].map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }

    function setupEdit(fn) {
        if (readOnly() || !freshModel()) return;
        fn(M.data);
        markDirty();
    }

    /* ---------------------------------------------------------------- actions */

    function confirmBox(message, okLabel) {
        return new Promise((resolve) => {
            const dlg = $('spConfirm');
            if (!dlg) {
                resolve(global.confirm ? global.confirm(message) : true);
                return;
            }
            $('spConfirmText').textContent = message;
            const ok = $('spConfirmOk');
            ok.textContent = okLabel || t('spOk', 'OK');
            dlg.hidden = false;
            const done = (val) => {
                dlg.hidden = true;
                dlg.removeEventListener('click', onClick);
                document.removeEventListener('keydown', onKey, true);
                resolve(val);
            };
            function onClick(ev) {
                const b = ev.target.closest('[data-confirm]');
                if (b) done(b.getAttribute('data-confirm') === 'ok');
                else if (ev.target === dlg) done(false);
            }
            function onKey(ev) {
                if (ev.key === 'Escape') {
                    ev.stopPropagation();
                    done(false);
                }
            }
            dlg.addEventListener('click', onClick);
            document.addEventListener('keydown', onKey, true);
            ok.focus();
        });
    }

    /**
     * Pull the term schedule from TMS (read-only) and put it on the board as a draft: it is matched to this
     * calendar's own cohorts, classes and teachers; whatever does not match is reported and left out.
     * Nothing is written to TMS, and nothing is applied to the calendar (that stays the explicit Apply step).
     */
    async function pullTms() {
        if (!M || readOnly()) return;
        const I = global.CCPTmsScheduleImport;
        const S = global.CCPTmsSync;
        if (!I || !S) {
            notice(t('spTmsMissing', 'TMS sync is not available on this page.'), 'error');
            return;
        }
        const has = M.draft.assignments.some((a) => a.source === 'manual');
        if (has && !(await confirmBox(
            t('spTmsReplace', 'Replace this plan with the schedule that is in TMS now? You can undo this.'),
            t('spReplace', 'Replace')
        ))) return;
        notice(t('spTmsPulling', 'Pulling the schedule from TMS…'), 'info');
        let body;
        try {
            body = await S.run('schedule', {});
        } catch (err) {
            const code = err && err.code;
            notice(code === 'TMS_BRIDGE_OUTDATED' ? t('tmsSyncOutdatedHint', 'Update the local ClassManager (restart npm start).')
                : code === 'TMS_BRIDGE_REQUIRED' ? t('tmsSyncMissingHint', 'Install the Sync helper first.')
                    : code === 'TMS_CREDS_MISSING' ? t('rosterTmsSyncCredsMissing', 'TMS sign-in is not set up.')
                        : code === 'TMS_LOGIN_FAILED' || (err && err.status === 401) ? t('rosterTmsSyncLoginFailed', 'TMS sign-in failed.')
                            : (err && err.message) || t('spTmsFailed', 'Could not pull the schedule from TMS.'), 'error');
            return;
        }
        if (!body || !Array.isArray(body.placements)) {
            notice(t('spTmsFailed', 'Could not pull the schedule from TMS.'), 'error');
            return;
        }
        const out = I.buildDraftFromTms(freshModel().data, body);
        const rep = out.report;
        if (!out.draft.assignments.length) {
            notice(t('spTmsNothing', 'No TMS class matched this calendar’s cohorts and classes, so nothing was changed.'), 'error');
            return;
        }
        const res = mutate((data) => {
            const prev = getActiveDraft(data);
            out.draft.id = prev ? prev.id : out.draft.id;
            installDraft(data, out.draft);
            // A named copy stays in the calendar's snapshot history so pulls can be compared and restored later.
            if (global.CCPTeacherPlannerSnapshots && global.CCPTeacherPlannerSnapshots.save) {
                global.CCPTeacherPlannerSnapshots.save(data, out.draft.label, { draft: out.draft, note: 'TMS pull' });
            }
            return { ok: true };
        });
        if (!res) return;
        const left = rep.unmatchedCohorts.length + rep.unmatchedClasses.length + rep.unmatchedTeachers.length;
        notice(t('spTmsDone', 'Pulled from TMS (term {term}): {periods} periods on {classes} classes.', {
            term: rep.term || '–', periods: out.draft.assignments.reduce((n, a) => n + (a.meetings || []).length, 0), classes: out.draft.assignments.length
        }) + (left ? ' ' + t('spTmsLeft', 'Left out: {cohorts} cohorts, {classes} classes and {teachers} teachers that are not in this calendar.', {
            cohorts: rep.unmatchedCohorts.length, classes: rep.unmatchedClasses.length, teachers: rep.unmatchedTeachers.length
        }) : ''), left ? 'info' : 'success');
    }

    async function loadFromCalendar() {
        if (!M || readOnly()) return;
        const has = M.draft.assignments.some((a) => a.source === 'manual');
        if (has && !(await confirmBox(
            t('spConfirmReload', 'Replace this plan with the times and teachers that are on the calendar now? You can undo this.'),
            t('spReplace', 'Replace')
        ))) return;
        mutate((data) => {
            const prev = getActiveDraft(data);
            const draft = api().seedDraftFromCalendar(data, { label: 'From calendar' });
            if (prev) draft.id = prev.id;
            installDraft(data, draft);
            return { ok: true };
        });
        notice(t('spLoaded', 'Plan loaded from the calendar.'), 'success');
    }


    /* ---------------------------------------------------------- auto-schedule */

    const autoState = {
        open: false, loading: false, calendars: null, prevId: '', prevData: null,
        analysis: null, options: null, base: null, appliedId: null, appliedSig: null, error: '',
        handCount: 0, moveHand: false // moveHand: null = not answered yet
    };

    function activeCalendarId() {
        return typeof CalendarSync !== 'undefined' && CalendarSync.getActiveCalendarId // eslint-disable-line no-undef
            ? String(CalendarSync.getActiveCalendarId() || '') : ''; // eslint-disable-line no-undef
    }

    async function openAuto() {
        if (!M || !global.CCPPlannerAuto) return;
        if (readOnly()) {
            notice(t('plannerReadOnlyHint', 'This calendar is read-only. Request edit access before applying a draft.'), 'error');
            return;
        }
        // Reopened straight after choosing a plan: offer the same plans so another can be picked.
        if (!(autoState.base && autoState.appliedSig === JSON.stringify(M.draft.assignments))) {
            autoState.base = JSON.stringify(M.draft);
            autoState.appliedId = null;
            // Classes already on the board that are not locked: ask before moving any of them.
            autoState.handCount = M.draft.assignments.filter((a) => !a.locked && (a.meetings || []).length
                && M.demandById.get(a.demandId) && M.demandById.get(a.demandId).includedInDraft !== false).length;
            autoState.moveHand = autoState.handCount ? null : false;
        }
        autoState.open = true;
        autoState.options = null;
        autoState.error = '';
        $('spAuto').hidden = false;
        document.body.classList.add('sp-modal-open');
        autoState.loading = true;
        renderAuto();
        if (!autoState.calendars) {
            try {
                const res = await CalendarSync.listCalendars(); // eslint-disable-line no-undef
                const list = Array.isArray(res) ? res : (res && res.calendars) || [];
                const mine = activeCalendarId();
                autoState.calendars = list.filter((c) => c && String(c.id) !== mine);
            } catch (_) {
                autoState.calendars = [];
            }
        }
        let prevId = String(M.data.plannerState.previousCalendarId || '');
        if (!autoState.calendars.some((c) => String(c.id) === prevId)) prevId = '';
        await loadPrevious(prevId);
    }

    async function loadPrevious(id) {
        if (!autoState.open || !M) return;
        autoState.loading = true;
        autoState.error = '';
        renderAuto();
        if (!id) autoState.prevData = null;
        else if (autoState.prevId !== id || !autoState.prevData) {
            try {
                autoState.prevData = await CalendarSync.fetchCalendarCopy(id); // eslint-disable-line no-undef
            } catch (err) {
                autoState.prevData = null;
                autoState.error = t('spAutoPrevFailed', 'Could not open that calendar. Plans below do not use last term.');
            }
        }
        autoState.prevId = id;
        const A = global.CCPPlannerAuto;
        autoState.analysis = autoState.prevData
            ? A.analysePreviousTerm(M.data, autoState.prevData)
            : { byDemand: new Map(), students: 0, matched: 0 };
        if (autoState.moveHand === null) autoState.options = null;
        else {
            const base = JSON.parse(autoState.base);
            if (autoState.moveHand) {
                // Allowed to move: unlocked classes come off the board (teachers stay) and are placed again.
                base.assignments.forEach((a) => { if (!a.locked) a.meetings = []; });
            }
            autoState.attempt = 0;
            try {
                autoState.options = await runBuild(base);
            } catch (err) {
                autoState.error = String((err && err.message) || err);
            }
        }
        autoState.loading = false;
        renderAuto();
    }

    /**
     * Run the auto-schedule search off the page in a Web Worker so the page stays responsive.
     * Falls back to running it here when a worker cannot be started (old browser, blocked, file://).
     */
    let autoWorker = null;
    let autoJob = 0;
    function runBuild(base, limit, seedOffset) {
        const A = global.CCPPlannerAuto;
        const opts = {};
        if (limit) opts.timeLimitMs = limit;
        if (seedOffset) opts.seedOffset = seedOffset;
        const inline = () => new Promise((resolve) => setTimeout(() => resolve(A.buildOptions(M.data, base, autoState.analysis, opts)), 30));
        if (typeof global.Worker !== 'function') return inline();
        return new Promise((resolve, reject) => {
            const id = ++autoJob;
            try {
                if (!autoWorker) autoWorker = new global.Worker('js/planner/auto-worker.js?v=20261117-worker');
            } catch (err) { autoWorker = null; resolve(inline()); return; }
            const w = autoWorker;
            const done = () => { w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); };
            const onMsg = (ev) => {
                if (!ev.data || ev.data.id !== id) return;
                done();
                if (ev.data.ok) resolve(ev.data.options); else reject(new Error(ev.data.error));
            };
            const onErr = () => {
                done();
                try { w.terminate(); } catch (e) { /* ignore */ }
                if (autoWorker === w) autoWorker = null;
                resolve(inline());
            };
            w.addEventListener('message', onMsg);
            w.addEventListener('error', onErr);
            try {
                w.postMessage({ id, appData: M.data, draft: base, analysis: autoState.analysis, options: opts });
            } catch (err) { onErr(); }
        });
    }

    /* --------------------------------------------------------- plan history */

    const historyState = { open: false };

    function snapApi() {
        return global.CCPTeacherPlannerSnapshots;
    }

    /** One line per class: teacher and periods, so two plans can be compared. */
    function planSigMap(draft) {
        const m = new Map();
        ((draft && draft.assignments) || []).forEach((a) => {
            const periods = (a.meetings || []).map((x) => `${x.dow}.${x.period}`).sort().join(',');
            m.set(a.demandId, `${a.teacherProfileId || ''}|${periods}`);
        });
        return m;
    }

    function diffCount(a, b) {
        const x = planSigMap(a);
        const y = planSigMap(b);
        let n = 0;
        new Set([...x.keys(), ...y.keys()]).forEach((k) => { if (x.get(k) !== y.get(k)) n += 1; });
        return n;
    }

    function openHistory() {
        if (!M || !snapApi()) return;
        historyState.open = true;
        $('spHistory').hidden = false;
        document.body.classList.add('sp-modal-open');
        renderHistory();
    }

    function closeHistory() {
        historyState.open = false;
        const dlg = $('spHistory');
        if (dlg) dlg.hidden = true;
        document.body.classList.remove('sp-modal-open');
    }

    function renderHistory() {
        const body = $('spHistoryBody');
        if (!body || !M || !snapApi()) return;
        const S = snapApi();
        const ro = readOnly();
        const items = S.list(M.data);
        let html = `
<div class="sp-field sp-hist-save">
  <span>${esc(t('spHistSaveLabel', 'Save the plan on the board as a version'))}</span>
  <div class="sp-hist-row">
    <input type="text" class="field-input" id="spHistName" maxlength="80" placeholder="${esc(t('spHistNamePh', 'Name (optional)'))}">
    <button type="button" class="btn btn-primary btn-small" data-act="hist-save"${ro ? ' disabled' : ''}>${esc(t('spHistSave', 'Save version'))}</button>
  </div>
</div>`;
        if (!items.length) {
            html += `<p class="sp-hint">${esc(t('spHistEmpty', 'No saved versions yet. Pulling from TMS saves one automatically.'))}</p>`;
        } else {
            html += '<ul class="sp-hist-list">';
            items.forEach((s) => {
                const full = S.get(M.data, s.id);
                const n = diffCount(M.draft, full && full.draft);
                const when = s.createdAt ? new Date(s.createdAt).toLocaleString() : '';
                html += `
<li class="sp-hist-item" data-snap="${esc(s.id)}">
  <div class="sp-hist-main">
    <input type="text" class="field-input sp-hist-title" data-hist-name="${esc(s.id)}" value="${esc(s.name)}" maxlength="80"${ro ? ' disabled' : ''}>
    <span class="sp-hint">${esc(when)} · ${esc(t('spHistClasses', '{n} classes', { n: s.assignmentCount }))} · ${esc(n ? t('spHistDiffers', '{n} differ from the board', { n }) : t('spHistSame', 'same as the board'))}</span>
  </div>
  <div class="sp-hist-actions">
    <button type="button" class="btn btn-outline btn-small" data-act="hist-restore" data-id="${esc(s.id)}"${ro ? ' disabled' : ''}>${esc(t('spHistRestore', 'Restore'))}</button>
    <button type="button" class="btn btn-outline btn-small" data-act="hist-rename" data-id="${esc(s.id)}"${ro ? ' disabled' : ''}>${esc(t('spHistRename', 'Rename'))}</button>
    <button type="button" class="btn btn-outline btn-small" data-act="hist-delete" data-id="${esc(s.id)}"${ro ? ' disabled' : ''}>${esc(t('spHistDelete', 'Delete'))}</button>
  </div>
</li>`;
            });
            html += '</ul>';
        }
        body.innerHTML = html;
    }

    function historySave() {
        if (!M || readOnly()) return;
        const input = $('spHistName');
        const name = input ? input.value.trim() : '';
        const res = mutate((data, draft) => snapApi().save(data, name || draft.label || '', { draft }), { noUndo: true });
        if (res && res.ok) {
            notice(t('spHistSaved', 'Version saved.'), 'success');
            renderHistory();
        }
    }

    async function historyRestore(id) {
        if (!M || readOnly()) return;
        const snap = snapApi().get(M.data, id);
        if (!snap) return;
        const n = diffCount(M.draft, snap.draft);
        if (n && !(await confirmBox(
            t('spHistRestoreAsk', 'Put “{name}” on the board? It replaces the current plan; you can undo this.', { name: snap.name }),
            t('spHistRestore', 'Restore')
        ))) return;
        const res = mutate((data) => {
            const r = snapApi().restore(data, id);
            if (r.ok) data.plannerDrafts = (data.plannerDrafts || []).slice(0, 5);
            return r;
        });
        if (res && res.ok) {
            notice(t('spHistRestored', 'Restored “{name}”.', { name: snap.name }), 'success');
            renderHistory();
        }
    }

    function historyRename(id) {
        if (!M || readOnly()) return;
        const input = document.querySelector(`[data-hist-name="${id}"]`);
        if (!input || !input.value.trim()) return;
        const res = mutate((data) => snapApi().rename(data, id, input.value), { noUndo: true });
        if (res && res.ok) renderHistory();
    }

    async function historyDelete(id) {
        if (!M || readOnly()) return;
        const snap = snapApi().get(M.data, id);
        if (!snap) return;
        if (!(await confirmBox(t('spHistDeleteAsk', 'Delete the saved version “{name}”? This cannot be undone.', { name: snap.name }), t('spHistDelete', 'Delete')))) return;
        const res = mutate((data) => snapApi().remove(data, id), { noUndo: true });
        if (res && res.ok) renderHistory();
    }

    /** How good a plan is, lower is better: classes left to place, and broken rules weigh far more. */
    function planCost(o) {
        return o.result.unplaced.reduce((n, x) => n + (x.missing || 1), 0) + 1000 * ((o.stats && o.stats.rulesBroken) || 0);
    }

    /** Try again: more time and other tie-break orders; each plan keeps whichever run was better. */
    async function retryAuto() {
        if (!autoState.open || !M || autoState.loading || autoState.moveHand === null) return;
        const A = global.CCPPlannerAuto;
        autoState.attempt = (autoState.attempt || 0) + 1;
        autoState.loading = true;
        renderAuto();
        try {
            const base = JSON.parse(autoState.base);
            if (autoState.moveHand) base.assignments.forEach((a) => { if (!a.locked) a.meetings = []; });
            const limit = Math.min(30000, A.DEFAULT_TIME_LIMIT_MS * (1 + 2 * autoState.attempt));
            const next = await runBuild(base, limit, autoState.attempt);
            const old = new Map((autoState.options || []).map((o) => [o.id, o]));
            autoState.options = next.map((o) => (old.has(o.id) && planCost(old.get(o.id)) <= planCost(o) ? old.get(o.id) : o));
        } catch (err) {
            autoState.error = String((err && err.message) || err);
        }
        autoState.loading = false;
        renderAuto();
    }

    /** Short text for what ruled out the most slots for a class that could not be placed. */
    function whyText(why) {
        if (!why || !why.blockers || !why.blockers.length) return '';
        const structural = ['outside_student_hours', 'class_twice_a_day'];
        const shown = why.blockers.filter((b) => !structural.includes(b.rule)).slice(0, 2);
        const list = (shown.length ? shown : why.blockers.slice(0, 1)).map((b) => t(`spWhy_${b.rule}`, b.rule, { n: b.count, detail: b.detail || '' }));
        const fix = (why.fixes || [])[0];
        const fixText = fix ? t(`spFix_${fix.rule}`, fix.text, { detail: ((why.blockers.find((b) => b.rule === fix.rule) || {}).detail) || '' }) : '';
        return list.join('; ') + (fixText ? ` — ${fixText}` : '');
    }

    function closeAuto() {
        autoState.open = false;
        const dlg = $('spAuto');
        if (dlg) dlg.hidden = true;
        document.body.classList.remove('sp-modal-open');
    }

    function renderAuto() {
        const body = $('spAutoBody');
        if (!body || !M) return;
        const cals = autoState.calendars || [];
        const a = autoState.analysis;
        const titles = {
            continuity: t('spPlanContinuity', 'Keep teachers with their students'),
            breaks: t('spPlanBreaks', 'Best breaks for teachers'),
            balance: t('spPlanBalance', 'Even workload')
        };
        let html = `
<label class="sp-field sp-auto-prev">
  <span>${esc(t('spAutoPrev', 'Last term’s calendar'))}</span>
  <select class="field-select" data-change="auto-prev"${autoState.loading ? ' disabled' : ''}>
    <option value="">${esc(t('spAutoPrevNone', 'None (do not use last term)'))}</option>
    ${cals.map((c) => `<option value="${esc(c.id)}"${String(c.id) === autoState.prevId ? ' selected' : ''}>${esc(c.name || c.id)}</option>`).join('')}
  </select>
</label>`;
        if (autoState.handCount) {
            html += `
<div class="sp-field sp-auto-hand">
  <span>${esc(t('spAutoHandAsk', '{n} classes are already on the board. May auto-schedule move them?', { n: autoState.handCount }))}</span>
  <div class="sp-seg" role="group">
    <button type="button" class="sp-seg-btn${autoState.moveHand === false ? ' is-active' : ''}" data-act="auto-hand" data-move="0" aria-pressed="${autoState.moveHand === false}">${esc(t('spAutoHandKeep', 'No, keep them where they are'))}</button>
    <button type="button" class="sp-seg-btn${autoState.moveHand === true ? ' is-active' : ''}" data-act="auto-hand" data-move="1" aria-pressed="${autoState.moveHand === true}">${esc(t('spAutoHandMove', 'Yes, they may move'))}</button>
  </div>
  <p class="sp-hint">${esc(t('spAutoHandHint', 'Locked classes never move. Teachers already on a class stay on it either way.'))}</p>
</div>`;
        }
        if (autoState.error) html += `<p class="sp-hint sp-auto-error">${esc(autoState.error)}</p>`;
        else if (autoState.prevId && a && !autoState.loading) {
            html += `<p class="sp-hint">${esc(a.matched
                ? t('spAutoMatched', 'Found {matched} of {total} students in last term’s classes.', { matched: a.matched, total: a.students })
                : t('spAutoMatchedNone', 'None of this term’s students were found in that calendar, so last term is not used.'))}</p>`;
        } else if (!autoState.prevId && !autoState.loading) {
            html += `<p class="sp-hint">${esc(t('spAutoNoPrevHint', 'Choose last term’s calendar to keep teachers with the students they had.'))}</p>`;
        }
        if (!autoState.loading && autoState.moveHand === null) {
            html += `<p class="sp-empty">${esc(t('spAutoHandFirst', 'Answer the question above to see the plans.'))}</p>`;
        } else if (autoState.loading || !autoState.options) {
            html += `<p class="sp-empty">${esc(t('spAutoWorking', 'Working out plans…'))}</p>`;
        } else {
            html += `<div class="sp-plans">${autoState.options.map((o) => {
                const st = o.stats;
                const need = o.result.unplaced.length;
                const lines = [t('spSumDone', '{done} of {total} classes ready', { done: st.ready, total: st.total })];
                if (st.keptShare != null) lines.push(t('spPlanKept', '{pct}% of students keep a teacher they had', { pct: Math.round(st.keptShare * 100) }));
                lines.push(t('spPlanRun', 'Longest stretch: {n} in a row', { n: st.longestRun }));
                lines.push(t('spPlanHoles', 'One-period gaps: {n}', { n: st.holes }));
                lines.push(t('spPlanLoad', 'Periods per teacher: {min} to {max}', { min: st.loadMin, max: st.loadMax }));
                const broken = st.rulesBroken || 0;
                lines.push(broken
                    ? t('spPlanCheckBad', 'Rule check: {n} problems left', { n: broken })
                    : t('spPlanChecked', 'Rule check: every rule kept'));
                const current = autoState.appliedId === o.id;
                return `
<section class="sp-plan${current ? ' is-current' : ''}">
  <h3>${esc(titles[o.id] || o.id)}</h3>
  <ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}${o.timedOut ? `<li class="sp-plan-warn">${esc(t('spPlanTimedOut', 'Stopped early: it ran out of time'))}</li>` : ''}${need ? `<li class="sp-plan-warn">${esc(t('spPlanNeedHand', '{n} classes still need placing by hand', { n: need }))}</li>` : ''}${st.clashes ? `<li class="sp-plan-warn">${esc(t('spSumClashes', '{n} clashes', { n: st.clashes }))}</li>` : ''}</ul>
  ${need ? `<details class="sp-plan-why"><summary>${esc(t('spPlanWhy', 'Why these were not placed'))}</summary><ul>${o.result.unplaced.map((x) => {
                    const why = x.why || {};
                    const text = x.reason === 'time_limit' ? t('spWhy_time_limit', 'Not reached: out of time') : whyText(why);
                    return `<li><strong>${esc(why.name || x.demandId)}</strong>${text ? `: ${esc(text)}` : ''}</li>`;
                }).join('')}</ul></details>` : ''}
  <button type="button" class="btn ${current ? 'btn-outline' : 'btn-primary'} btn-small" data-act="use-plan" data-plan="${esc(o.id)}"${current ? ' disabled' : ''}>${esc(current ? t('spPlanCurrent', 'On the board now') : t('spPlanUse', 'Use this plan'))}</button>
</section>`;
            }).join('')}</div>`;
            if (autoState.options.length === 1) {
                html += `<p class="sp-hint">${esc(t('spAutoOnePlan', 'The other priorities give this same plan.'))}</p>`;
            }
            const anyLeft = autoState.options.some((o) => o.result.unplaced.length || o.timedOut || (o.stats && o.stats.rulesBroken));
            html += `<p class="sp-auto-retry"><button type="button" class="btn ${anyLeft ? 'btn-primary' : 'btn-outline'} btn-small" data-act="auto-retry">${esc(t('spAutoRetry', 'Try again'))}</button> <span class="sp-hint">${esc(t('spAutoRetryHint', 'Searches longer and in other orders. Each plan keeps whichever run was better.'))}</span></p>`;
            html += `<p class="sp-hint">${esc(autoState.moveHand
                ? t('spAutoMoves', 'These plans place every unlocked class again. Undo brings the board back.')
                : t('spAutoKeeps', 'Plans only fill what is missing. Classes you placed stay where they are, and Undo brings the board back.'))}</p>`;
        }
        body.innerHTML = html;
    }

    function usePlan(id) {
        const opt = (autoState.options || []).find((o) => o.id === id);
        if (!opt || !M) return;
        const switching = !!autoState.appliedId;
        const res = mutate((data) => {
            const next = JSON.parse(JSON.stringify(opt.draft));
            next.id = data.plannerState.activeDraftId || next.id;
            restoreDraft(JSON.stringify(next));
            return { ok: true };
        }, { noUndo: switching }); // switching plans keeps one Undo step back to the board before auto
        if (!res) return;
        autoState.appliedId = id;
        autoState.appliedSig = JSON.stringify(M.draft.assignments);
        closeAuto();
        const need = opt.result.unplaced.length;
        notice(need
            ? t('spAutoDoneNeed', 'Plan is on the board. {n} classes still need placing by hand (see To fix).', { n: need })
            : t('spAutoDone', 'Plan is on the board. Drag anything to change it, or press Undo.'), need ? 'info' : 'success');
        // Clashes left on the board: offer the fixes straight away so the user can accept one.
        if (clashCount() > 0) {
            notice(t('spAutoDoneClash', 'Plan is on the board, but {n} clashes are left. Pick a suggested fix, or close this and move them yourself.', { n: clashCount() }), 'info');
            setTimeout(openFix, 0);
        }
    }

    /* ------------------------------------------------------------ fix clashes */

    const fixState = { open: false, options: null, agreed: false };

    function openFix() {
        if (!M || !global.CCPPlannerAuto) return;
        if (readOnly()) {
            notice(t('plannerReadOnlyHint', 'This calendar is read-only. Request edit access before applying a draft.'), 'error');
            return;
        }
        fixState.options = global.CCPPlannerAuto.clashOptions(M.data, M.draft, autoState.analysis || undefined);
        fixState.agreed = false;
        fixState.open = true;
        $('spFix').hidden = false;
        document.body.classList.add('sp-modal-open');
        renderFix();
    }

    function closeFix() {
        fixState.open = false;
        const dlg = $('spFix');
        if (dlg) dlg.hidden = true;
        document.body.classList.remove('sp-modal-open');
    }

    function renderFix() {
        const body = $('spFixBody');
        if (!body || !M) return;
        const started = global.CCPPlannerAuto.termHasStarted(M.data);
        const titles = {
            keep: t('spFixKeep', 'Keep the class you moved last, move the others'),
            other: t('spFixOther', 'Move the class you moved last instead'),
            teacher: t('spFixTeacher', 'Move the others, changing the teacher where no time fits')
        };
        const name = (id) => {
            const d = M.demandById.get(id);
            return d ? classLabel(M, d) : id;
        };
        const opts = fixState.options || [];
        let html = '';
        if (!opts.length) {
            html = `<p class="sp-empty">${esc(t('spFixNone', 'No automatic fix found. Unlock a class or free up a teacher, or move the classes by hand.'))}</p>`;
        } else {
            html = `<p class="sp-hint">${esc(t('spFixHint', 'Locked classes never move. Pick a suggestion, or close this and move the classes yourself.'))}</p>
<div class="sp-plans">${opts.map((o) => {
                const r = o.result;
                const lines = r.moved.map((mv) => `${name(mv.demandId)}: ${slotText(M, mv.from.dow, mv.from.period)} → ${slotText(M, mv.to.dow, mv.to.period)}`)
                    .concat(r.teacherChanged.map((tc) => `${name(tc.demandId)}: ${teacherName(M, tc.from)} → ${teacherName(M, tc.to)}`));
                if (r.rooms) lines.push(t('spFixRooms', '{n} room changes', { n: r.rooms }));
                const changes = r.teacherChanged.length;
                const needsYes = changes && started;
                return `
<section class="sp-plan">
  <h3>${esc(titles[o.id] || o.id)}</h3>
  <ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}
  ${o.clashesLeft ? `<li class="sp-plan-warn">${esc(t('spFixLeft', '{n} clashes would be left', { n: o.clashesLeft }))}</li>` : ''}
  ${r.needTeacherChange.length ? `<li class="sp-plan-warn">${esc(t('spFixNeedsTeacher', '{n} classes only fit with a different teacher', { n: r.needTeacherChange.length }))}</li>` : ''}
  ${changes && !started ? `<li class="sp-plan-warn">${esc(t('spFixTeacherWarn', 'Changes the teacher of {n} classes', { n: changes }))}</li>` : ''}</ul>
  ${needsYes ? `<label class="sp-chip sp-plan-yes"><input type="checkbox" data-change="fix-agree"${fixState.agreed ? ' checked' : ''}><span>${esc(t('spFixAgree', 'The term has started. Yes, change the teacher of {n} classes.', { n: changes }))}</span></label>` : ''}
  <button type="button" class="btn btn-primary btn-small" data-act="use-fix" data-plan="${esc(o.id)}"${needsYes && !fixState.agreed ? ' disabled' : ''}>${esc(t('spFixUse', 'Use this'))}</button>
</section>`;
            }).join('')}</div>`;
        }
        body.innerHTML = html;
    }

    function useFix(id) {
        const opt = (fixState.options || []).find((o) => o.id === id);
        if (!opt || !M) return;
        const res = mutate((data) => {
            const next = JSON.parse(JSON.stringify(opt.draft));
            next.id = data.plannerState.activeDraftId || next.id;
            restoreDraft(JSON.stringify(next));
            return { ok: true };
        });
        if (!res) return;
        closeFix();
        const first = opt.result.moved[0];
        if (first) showSlot(first.demandId, first.to.dow, first.to.period);
        notice(opt.result.teacherChanged.length
            ? t('spFixDoneTeacher', 'Fixed. {n} classes have a new teacher. Undo brings it back.', { n: opt.result.teacherChanged.length })
            : t('spFixDone', 'Fixed. Undo brings it back.'), opt.result.teacherChanged.length ? 'info' : 'success');
    }

    function clashCount() {
        return M ? groupedIssues(M)[0].items.length : 0;
    }

    async function clearBoard() {
        if (!M || readOnly()) return;
        if (!(await confirmBox(
            t('spConfirmClear', 'Take every class off the board? Teachers stay on their classes. You can undo this.'),
            t('spClear', 'Clear the board')
        ))) return;
        mutate((data, draft) => {
            draft.assignments.forEach((a) => {
                a.meetings = [];
                a.source = 'manual';
            });
            api().recomputeDraftMetrics(data, draft);
            return { ok: true };
        });
    }

    async function applyToCalendar() {
        if (!M) return;
        if (readOnly()) {
            notice(t('plannerReadOnlyHint', 'This calendar is read-only. Request edit access before applying a draft.'), 'error');
            return;
        }
        const placed = M.draft.assignments.filter((a) => (a.meetings || []).length && M.demandById.get(a.demandId)
            && M.demandById.get(a.demandId).includedInDraft !== false);
        if (!placed.length) {
            notice(t('spApplyNothing', 'Nothing is on the board yet.'), 'info');
            return;
        }
        const clashes = groupedIssues(M)[0].items.length;
        const msg = t('spConfirmApply', 'Write the days, periods, teachers and rooms of {n} classes to the calendar?', { n: placed.length })
            + (clashes ? ` ${t('spConfirmApplyClashes', '{n} clashes are still on the board.', { n: clashes })}` : '');
        const pendingBlocks = api().pendingCohortBlocks(M.data);
        const fullMsg = pendingBlocks.length
            ? `${msg}\n\n${t('spConfirmApplyCohorts', 'This also saves the changed days and hours of {n} cohorts: {names}.', { n: pendingBlocks.length, names: pendingBlocks.map((x) => x.name).join(', ') })}`
            : msg;
        if (!(await confirmBox(fullMsg, t('plannerApply', 'Apply to calendar')))) return;
        const data = M.data;
        if (pendingBlocks.length) api().writeCohortBlocks(data);
        const draft = M.draft;
        const excluded = draft.assignments.filter((a) => {
            const d = M.demandById.get(a.demandId);
            return !d || d.includedInDraft === false;
        });
        const view = Object.assign({}, draft, { assignments: draft.assignments.filter((a) => !excluded.includes(a)) });
        const result = api().applyDraftToAppData(data, view, { allowMissingUserId: true, replaceFirstTeacher: true });
        draft.status = 'applied';
        draft.updatedAt = view.updatedAt;
        installDraft(data, draft);
        markDirty();
        render();
        notice(t('spApplied', 'Calendar updated: {n} classes.', { n: result.applied.length }), 'success');
    }

    /* ------------------------------------------------------------------ print */

    function printHeader(title) {
        const name = String((M.data && M.data.calendarName) || '').trim();
        return `<div class="planner-print-page-header"><div class="planner-print-page-title">${esc(title)}</div><div class="planner-print-page-meta">${esc(name)}</div></div>`;
    }

    function printCell(tiles, lines) {
        if (!tiles.length) return '<td></td>';
        return `<td>${tiles.map((x) => `<div class="planner-print-cell-name">${esc(x.demand.name)}</div><div class="planner-print-cell-sub">${esc(lines(x).filter(Boolean).join(' · '))}</div>`).join('')}</td>`;
    }

    function timeLabel(row) {
        return row.start ? `${row.start}–${row.end}` : `P${row.period}`;
    }

    function printWeekly(kind) {
        const cols = columnsFor(M, kind).filter((c) => !c.none);
        const map = cellMap(M, kind);
        const title = kind === 'teachers' ? t('spPrintTeachers', 'Teacher timetables')
            : kind === 'rooms' ? t('spPrintRooms', 'Room timetables') : t('spPrintCohorts', 'Cohort timetables');
        const blocks = cols.map((c) => `
<div class="planner-print-block">
  <div class="planner-print-block-title">${esc(c.name)}</div>
  <table class="planner-print-table"><thead><tr><th class="planner-print-time-col"></th>${DAYS.map((d) => `<th>${esc(dayLabel(d))}</th>`).join('')}</tr></thead>
  <tbody>${M.periods.map((row) => `<tr><th class="planner-print-time-col">${esc(timeLabel(row))}</th>${DAYS.map((d) => printCell(map.get(`${c.id}|${d}|${row.period}`) || [], (x) => [
        kind !== 'cohorts' ? demandCohortLabel(M, x.demand) : '',
        kind !== 'teachers' ? teacherName(M, x.asg.teacherProfileId) : '',
        kind !== 'rooms' ? roomName(M, x.roomId) : ''
    ])).join('')}</tr>`).join('')}</tbody></table>
</div>`).join('');
        return `<div class="planner-print-page">${printHeader(title)}${blocks}</div>`;
    }

    function printText(hex) {
        const raw = String(hex || '').replace('#', '');
        if (!/^[0-9a-fA-F]{6}$/.test(raw)) return '#1c2430';
        const lum = (0.299 * parseInt(raw.slice(0, 2), 16) + 0.587 * parseInt(raw.slice(2, 4), 16) + 0.114 * parseInt(raw.slice(4, 6), 16)) / 255;
        return lum > 0.62 ? '#1c2430' : '#ffffff';
    }

    function printPageHeader(title) {
        const name = String((M.data && M.data.calendarName) || '').trim() || t('plannerPageTitle', 'Schedule planner');
        return `<div class="planner-print-page-header"><div class="planner-print-page-title">${esc(title)}</div><div class="planner-print-page-meta">ClassManager · ${esc(name)}</div></div>`;
    }

    function bandShort(band) {
        return band === 'junior' ? t('plannerJrShort', 'Jr') : band === 'middle' ? t('plannerMiddle1', '중1') : t('plannerSrShort', 'Sr');
    }

    /**
     * Teacher timetable, same sheet as the planner printed before the rebuild:
     * one block per teacher (role, periods a week), Mon–Fri across, clock times down,
     * each class in its colour with level and room.
     */
    function printTeachers() {
        const map = cellMap(M, 'teachers');
        const blocks = M.teachers.map((te) => {
            const rows = M.periods.map((row) => `<tr><th class="planner-print-time-col">${esc(timeLabel(row))}</th>${DAYS.map((d) => {
                const tiles = map.get(`${te.id}|${d}|${row.period}`) || [];
                if (!tiles.length) return '<td></td>';
                const color = demandColor(M, tiles[0].demand);
                return `<td class="planner-print-cell-colored" style="background:${esc(color)};color:${printText(color)}">${tiles.map((x) => {
                    const room = roomName(M, x.roomId);
                    return `<div class="planner-print-cell-name">${esc(x.demand.name)}</div><div class="planner-print-cell-sub">${esc(bandShort(x.demand.band))}${room ? ` · ${esc(room)}` : ''}</div>`;
                }).join('')}</td>`;
            }).join('')}</tr>`).join('');
            const load = M.tiles.filter((x) => x.asg.teacherProfileId === te.id).length;
            const role = te.role === 'native' ? t('plannerRoleNative', 'Native') : t('plannerRoleKorean', 'Korean');
            return `
<div class="planner-print-block">
  <div class="planner-print-block-title">${esc(te.name)}</div>
  <div class="planner-print-block-subtitle">${esc(role)} · ${load}/${Number(te.limits.maxPeriodsPerWeek) || 22} ${esc(t('plannerPeriodsPerWeek', 'periods/wk'))}</div>
  <table class="planner-print-table"><thead><tr><th class="planner-print-time-col"></th>${DAYS.map((d) => `<th>${esc(dayLabel(d))}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
</div>`;
        }).join('');
        return `<div class="planner-print-page">${printPageHeader(t('plannerPrintTeacherTitle', 'Teacher timetable'))}${blocks}</div>`;
    }

    /**
     * Room schedule, same sheet as before the rebuild: one page per weekday, a column per cohort
     * that has class that day (grouped Junior / Senior / 중1), 반명 and 인원 rows on top, and under
     * every period a 강의실 row with the room.
     */
    function printRoomSchedule() {
        const map = cellMap(M, 'cohorts');
        const bands = [['junior', t('plannerJunior', 'Lower elem')], ['senior', t('plannerSenior', 'Upper elem')], ['middle', t('plannerMiddle', 'Middle school')]];
        const rank = { junior: 0, senior: 1, middle: 2 };
        return DAYS.map((d) => {
            const title = `${dayLabel(d)} ${t('plannerPrintRoomTitle', 'Room schedule')}`;
            const cols = M.cohorts
                .filter((c) => M.periods.some((row) => (map.get(`${c.id}|${d}|${row.period}`) || []).length))
                .sort((a, b) => rank[a.band] - rank[b.band]);
            if (!cols.length) {
                return `<div class="planner-print-page">${printPageHeader(title)}<p>${esc(t('plannerNoScheduledThisDay', 'No classes are scheduled on this day yet.'))}</p></div>`;
            }
            const bandCells = bands.map(([key, label]) => {
                const n = cols.filter((c) => c.band === key).length;
                return n ? `<th class="planner-print-band-header" colspan="${n}">${esc(label)}</th>` : '';
            }).join('');
            const nameCells = cols.map((c) => {
                const color = c.color || '#e3e8ef';
                return `<th style="background:${esc(color)} !important;color:${printText(color)};-webkit-print-color-adjust:exact;print-color-adjust:exact">${esc(c.name)}</th>`;
            }).join('');
            const countCells = cols.map((c) => `<td>${c.students ? c.students : '—'}</td>`).join('');
            const body = M.periods.map((row) => {
                const cells = cols.map((c) => map.get(`${c.id}|${d}|${row.period}`) || []);
                const classRow = cells.map((tiles) => {
                    if (!tiles.length) return '<td></td>';
                    const color = teacherColor(M, tiles[0].asg.teacherProfileId);
                    const warn = tiles.some((x) => (x.warn || []).includes('outside_band_block'));
                    return `<td class="planner-print-cell-colored" style="background:${esc(color)};color:${printText(color)}${warn ? ';outline:2px dashed #b45309;outline-offset:-2px' : ''}">${tiles.map((x) => `<div class="planner-print-cell-name">${warn ? '⚠ ' : ''}${esc(x.demand.name)}</div><div class="planner-print-cell-sub">${esc(teacherName(M, x.asg.teacherProfileId) || t('plannerNoTeacherShort', 'No teacher'))}</div>`).join('')}</td>`;
                }).join('');
                const roomRow = cells.map((tiles) => {
                    if (!tiles.length) return '<td></td>';
                    const names = tiles.map((x) => roomName(M, x.roomId));
                    const missing = names.some((n) => !n);
                    return `<td style="font-weight:700;${missing ? 'color:#b45309' : ''}">${esc(names.map((n) => n || t('plannerRoomTbd', 'TBD')).join(' / '))}</td>`;
                }).join('');
                return `<tr><th class="planner-print-time-col">${esc(timeLabel(row))}</th>${classRow}</tr><tr><th class="planner-print-room-label">${esc(t('plannerRoomClassroom', '강의실'))}</th>${roomRow}</tr>`;
            }).join('');
            return `
<div class="planner-print-page">${printPageHeader(title)}
  <table class="planner-print-table"><thead>
    <tr><th class="planner-print-time-col"></th>${bandCells}</tr>
    <tr><th class="planner-print-time-col">${esc(t('plannerRoomBanmyeong', '반명'))}</th>${nameCells}</tr>
    <tr><th class="planner-print-time-col">${esc(t('plannerRoomEnrollment', '인원'))}</th>${countCells}</tr>
  </thead><tbody>${body}</tbody></table>
</div>`;
        }).join('');
    }

    function printSheet(kind) {
        const area = $('plannerPrintArea');
        if (!area || !M) return;
        area.innerHTML = kind === 'teachers' ? printTeachers()
            : kind === 'rooms' ? printRoomSchedule()
                : kind === 'byroom' ? printWeekly('rooms') : printWeekly(kind);
        area.setAttribute('aria-hidden', 'false');
        // Wide sheets (a column per cohort or room) are squeezed to the page instead of being cut off.
        const cols = Math.max(0, ...Array.from(area.querySelectorAll('table')).map((tb) => (tb.rows[0] ? tb.rows[tb.rows.length - 1].cells.length : 0)));
        area.setAttribute('data-density', cols > 12 ? 'tight' : cols > 8 ? 'snug' : 'normal');
        // Print straight from the tap: iPad Safari may ignore print() called later. Reading a size
        // forces layout first. The sheet stays in place (hidden on screen), because on iPad print()
        // returns before the page is captured.
        // Print only the sheet: it must sit directly in <body> (it lives in the planner tab), and
        // body.sp-printing hides everything else until printing is over.
        if (area.parentElement !== document.body) document.body.appendChild(area);
        document.body.classList.add('sp-printing');
        const done = () => {
            document.body.classList.remove('sp-printing');
            global.removeEventListener('afterprint', done);
        };
        global.addEventListener('afterprint', done);
        void area.offsetHeight;
        global.print();
    }

    /* ----------------------------------------------------------------- events */

    function toggleMenu(id, anchor) {
        document.querySelectorAll('.sp-menu').forEach((mEl) => {
            const open = mEl.id === id && mEl.hidden;
            mEl.hidden = !open;
            const btn = document.querySelector(`[data-menu="${mEl.id}"]`);
            if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        state.menu = id && !$(id).hidden ? id : null;
        if (state.menu && anchor) {
            const first = $(id).querySelector('button');
            if (first) first.focus();
        }
    }

    function closeMenus() {
        if (!state.menu) return;
        document.querySelectorAll('.sp-menu').forEach((mEl) => { mEl.hidden = true; });
        document.querySelectorAll('[data-menu]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
        state.menu = null;
    }

    function onClick(e) {
        if (suppressClick) return;
        const menuBtn = e.target.closest('[data-menu]');
        if (menuBtn) {
            toggleMenu(menuBtn.getAttribute('data-menu'), menuBtn);
            return;
        }
        if (state.menu && !e.target.closest('.sp-menu')) closeMenus();

        const viewBtn = e.target.closest('[data-sp-view]');
        if (viewBtn) {
            state.view = viewBtn.getAttribute('data-sp-view');
            savePrefs();
            render();
            return;
        }
        const dayBtn = e.target.closest('[data-sp-day]');
        if (dayBtn) {
            state.day = Number(dayBtn.getAttribute('data-sp-day'));
            savePrefs();
            render();
            return;
        }
        const focusBtn = e.target.closest('[data-sp-focus]');
        if (focusBtn) {
            state.focus[state.view] = focusBtn.getAttribute('data-sp-focus');
            render();
            return;
        }
        const tabBtn = e.target.closest('[data-setup-tab]');
        if (tabBtn) {
            state.setupTab = tabBtn.getAttribute('data-setup-tab');
            state.openBlockGrid = null;
            renderSetup();
            return;
        }
        if (e.target.id === 'spFix') {
            closeFix();
            return;
        }
        if (e.target.id === 'spHistory') {
            closeHistory();
            return;
        }
        if (e.target.id === 'spAuto') {
            closeAuto();
            return;
        }
        if (e.target.id === 'spSetup') {
            closeSetup();
            return;
        }

        const actEl = e.target.closest('[data-act]');
        if (actEl) {
            runAction(actEl.getAttribute('data-act'), actEl);
            return;
        }
        if (held && tapWhileHeld(e)) return;
        const pick = e.target.closest('.sp-tile, .sp-card');
        if (pick && !e.target.closest('select, input, label')) {
            state.addSpecial = false;
            if (lastPointer === 'touch' && !readOnly()) {
                // Touch: one tap picks the class up; then tap where it goes.
                pickUp(pick);
                return;
            }
            const id = pick.getAttribute('data-demand');
            state.selected = state.selected === id ? null : id;
            render();
        }
    }

    function runAction(act, el) {
        const row = el.closest('[data-teacher], [data-room], [data-class]');
        switch (act) {
        case 'undo': undo(); break;
        case 'redo': redo(); break;
        case 'open-setup': closeMenus(); openSetup(el.getAttribute('data-tab')); break;
        case 'close-setup': closeSetup(); break;
        case 'load-calendar': closeMenus(); loadFromCalendar(); break;
        case 'pull-tms': closeMenus(); pullTms(); break;
        case 'auto': closeMenus(); openAuto(); break;
        case 'close-auto': closeAuto(); break;
        case 'history': closeMenus(); openHistory(); break;
        case 'close-history': closeHistory(); break;
        case 'hist-save': historySave(); break;
        case 'hist-restore': historyRestore(el.getAttribute('data-id')); break;
        case 'hist-rename': historyRename(el.getAttribute('data-id')); break;
        case 'hist-delete': historyDelete(el.getAttribute('data-id')); break;
        case 'auto-hand':
            autoState.moveHand = el.getAttribute('data-move') === '1';
            autoState.appliedId = null;
            loadPrevious(autoState.prevId);
            break;
        case 'fix': openFix(); break;
        case 'save-cohort-blocks': saveCohortBlocks(); break;
        case 'cohort-filter': {
            keepBatchInputs();
            const key = el.getAttribute('data-key');
            if (state.cohortFilter[key] !== undefined) state.cohortFilter[key] = el.getAttribute('data-value');
            renderSetup();
            break;
        }
        case 'cohort-batch': {
            keepBatchInputs();
            const what = el.getAttribute('data-what');
            if (what === 'hours' && (!state.batchStart || !state.batchEnd || state.batchStart >= state.batchEnd)) {
                notice(t('spBatchNeedHours', 'Pick a From period and a later To period first.'), 'error');
                break;
            }
            if (what === 'days' && !state.batchDays.length) {
                notice(t('spBatchNeedDays', 'Tick at least one day first.'), 'error');
                break;
            }
            const shownIds = M.cohorts.filter(cohortFilterMatch).map((c) => c.id);
            const tickedIds = shownIds.filter((id) => state.cohortSel.has(id));
            const ids = tickedIds.length ? tickedIds : shownIds;
            setupEdit((data) => {
                ids.forEach((id) => {
                    const cohort = (data.cohorts || []).find((c) => c.id === id);
                    if (!cohort) return;
                    const cur = api().cohortBlock(data, cohort);
                    api().stageCohortBlock(data, id, what === 'days'
                        ? { days: state.batchDays, start: cur.start, end: cur.end }
                        : { days: cur.days, start: state.batchStart, end: state.batchEnd });
                });
            });
            M = buildModel();
            renderSetup();
            notice(t('spBatchDone', 'Changed {n} cohorts here. Press “Save to cohorts” to write them to the calendar.', { n: ids.length }), 'info');
            break;
        }
        case 'discard-cohort-blocks':
            setupEdit((data) => { data.plannerState.cohortBlocks = {}; });
            M = buildModel();
            renderSetup();
            break;
        case 'close-fix': closeFix(); break;
        case 'use-fix': useFix(el.getAttribute('data-plan')); break;
        case 'use-plan': usePlan(el.getAttribute('data-plan')); break;
        case 'auto-retry': retryAuto(); break;
        case 'toggle-types': {
            const owner = el.getAttribute('data-owner');
            state.openTypes = state.openTypes === owner ? null : owner;
            renderSetup();
            break;
        }
        case 'clear-board': closeMenus(); clearBoard(); break;
        case 'apply': applyToCalendar(); break;
        case 'print': closeMenus(); printSheet(el.getAttribute('data-kind')); break;
        case 'toggle-issues':
            state.issuesOpen = !state.issuesOpen;
            savePrefs();
            renderIssues();
            break;
        case 'issues-all':
            state.issuesAll = !state.issuesAll;
            renderIssues();
            break;
        case 'toggle-compact':
            state.compact = !state.compact;
            savePrefs();
            render();
            break;
        case 'let-go': letGo(); break;
        case 'toggle-done':
            state.doneOpen = !state.doneOpen;
            renderTray();
            break;
        case 'deselect':
            state.selected = null;
            state.editClass = null;
            render();
            break;
        case 'tt-import-excel':
        case 'tt-export-excel':
            // Shared with the rest of the app (app.js): the Excel import writes classes on the calendar,
            // the export is what is on the calendar (Apply first to include this plan).
            if (typeof global.openTimetableTool === 'function') {
                global.openTimetableTool(act === 'tt-import-excel' ? 'import-excel' : 'export-all');
            }
            break;
        case 'period-add':
        case 'period-remove':
        case 'period-reset':
            periodAction(act, el);
            break;
        case 'add-special':
            state.addSpecial = true;
            state.editClass = null;
            renderInspector();
            break;
        case 'add-special-cancel':
            state.addSpecial = false;
            renderInspector();
            break;
        case 'add-special-save':
            saveSpecialClass(el.closest('.sp-special-form'));
            break;
        case 'special-duplicate': {
            const d = M.demandById.get(state.selected);
            if (d) duplicateSpecial(d.classId);
            break;
        }
        case 'special-delete': {
            const d = M.demandById.get(state.selected);
            if (d) deleteSpecial(d.classId);
            break;
        }
        case 'edit-class':
            state.editClass = state.selected;
            renderInspector();
            break;
        case 'edit-class-close':
            state.editClass = null;
            renderInspector();
            break;
        case 'jump-issue': jumpToIssue(el.getAttribute('data-issue')); break;
        case 'jump-slot': showSlot(state.selected, Number(el.getAttribute('data-dow')), el.getAttribute('data-period')); break;
        case 'remove-period': {
            const asgId = el.getAttribute('data-asg');
            const dow = Number(el.getAttribute('data-dow'));
            const period = el.getAttribute('data-period');
            mutate((data, draft) => api().removePeriod(data, draft, asgId, dow, period));
            break;
        }
        case 'toggle-blockgrid': {
            const owner = el.getAttribute('data-owner');
            state.openBlockGrid = state.openBlockGrid === owner ? null : owner;
            renderSetup();
            break;
        }
        case 'toggle-block': {
            const owner = el.getAttribute('data-owner');
            const dow = Number(el.getAttribute('data-dow'));
            const period = el.getAttribute('data-period');
            const on = !el.classList.contains('is-on');
            setupEdit((data) => {
                if (owner === 'everyone') api().setGlobalBlockoutSlot(data.plannerState, dow, period, on);
                else {
                    const p = data.teacherProfiles.find((x) => x.id === owner);
                    if (p) api().setTeacherBlockoutSlot(p, dow, period, on);
                }
            });
            M = buildModel();
            renderSetup();
            break;
        }
        case 'add-teacher':
            setupEdit((data) => {
                const p = api().defaultTeacherProfile({ name: t('spNewTeacher', 'New teacher') });
                data.teacherProfiles.push(p);
                const order = data.plannerState.teacherBoard.panelOrder;
                if (!order.includes(p.id)) order.push(p.id);
            });
            M = buildModel();
            renderSetup();
            focusLast('[data-teacher] .sp-in-name');
            break;
        case 'remove-teacher': {
            const id = row && row.getAttribute('data-teacher');
            const onClass = M.draft.assignments.some((a) => a.teacherProfileId === id);
            const go = () => {
                setupEdit((data) => {
                    data.teacherProfiles = data.teacherProfiles.filter((p) => p.id !== id);
                    data.plannerState.teacherBoard.panelOrder = data.plannerState.teacherBoard.panelOrder.filter((x) => x !== id);
                    M.draft.assignments.forEach((a) => {
                        if (a.teacherProfileId === id) {
                            a.teacherProfileId = null;
                            a.userId = null;
                        }
                    });
                });
                M = buildModel();
                renderSetup();
            };
            if (!onClass) go();
            else {
                confirmBox(
                    t('spConfirmRemoveTeacher', 'Remove this teacher from the plan? Their classes stay on the board with no teacher.'),
                    t('spRemove', 'Remove')
                ).then((ok) => { if (ok) go(); });
            }
            break;
        }
        case 'add-room':
            setupEdit((data) => {
                const n = data.rooms.length + 1;
                data.rooms.push(api().defaultRoom({ name: t('spNewRoom', 'Room {n}', { n }), sortOrder: n }));
            });
            M = buildModel();
            renderSetup();
            focusLast('[data-room] .sp-in-name');
            break;
        case 'remove-room': {
            const id = row && row.getAttribute('data-room');
            setupEdit((data) => {
                data.rooms = data.rooms.filter((r) => r.id !== id);
                M.draft.assignments.forEach((a) => {
                    if (a.roomId === id) a.roomId = null;
                    (a.meetings || []).forEach((m) => { if (m.roomId === id) delete m.roomId; });
                });
                (data.classes || []).forEach((c) => { if (c.roomId === id) c.roomId = ''; });
            });
            M = buildModel();
            renderSetup();
            break;
        }
        default: break;
        }
    }

    function focusLast(selector) {
        const all = document.querySelectorAll(`#spSetupBody ${selector}`);
        const el = all[all.length - 1];
        if (el) {
            el.focus();
            if (el.select) el.select();
        }
    }

    function onChange(e) {
        const el = e.target;
        if (el.id === 'spBand') {
            state.band = el.value;
            savePrefs();
            render();
            return;
        }
        const kind = el.getAttribute('data-change');
        if (!kind || !M) return;
        const row = el.closest('[data-teacher], [data-room], [data-class]');
        if (kind === 'use-first-period') {
            const on = el.checked;
            setupEdit((data) => { data.plannerState.useFirstPeriod = on; });
            render();
            renderSetup();
        } else if (kind === 'period-start' || kind === 'period-end') {
            editPeriodTime(el, kind === 'period-start' ? 'start' : 'end');
        } else if (kind.startsWith('edit-class-')) {
            editClassField(el, kind);
        } else if (kind === 'class-teacher') {
            const demandId = state.selected;
            mutate((data, draft) => api().setClassTeacher(data, draft, demandId, el.value || null));
        } else if (kind === 'meeting-room') {
            const asg = M.asgByDemand.get(state.selected);
            if (!asg) return;
            const dow = Number(el.getAttribute('data-dow'));
            const period = el.getAttribute('data-period');
            mutate((data, draft) => api().setMeetingRoom(data, draft, asg.assignmentId, dow, period, el.value || ''));
        } else if (kind === 'cohort-select' || kind === 'cohort-select-all') {
            if (kind === 'cohort-select-all') state.cohortSel = new Set(el.checked ? M.cohorts.filter(cohortFilterMatch).map((c) => c.id) : []);
            else {
                const id = el.closest('[data-cohort]').getAttribute('data-cohort');
                if (el.checked) state.cohortSel.add(id);
                else state.cohortSel.delete(id);
            }
            keepBatchInputs();
            renderSetup();
        } else if (kind === 'cohort-day' || kind === 'cohort-start' || kind === 'cohort-end') {
            keepBatchInputs();
            const tr = el.closest('[data-cohort]');
            const id = tr.getAttribute('data-cohort');
            setupEdit((data) => {
                api().stageCohortBlock(data, id, {
                    days: Array.from(tr.querySelectorAll('[data-change="cohort-day"]:checked')).map((x) => Number(x.getAttribute('data-dow'))),
                    start: tr.querySelector('[data-change="cohort-start"]').value,
                    end: tr.querySelector('[data-change="cohort-end"]').value
                });
            });
            M = buildModel();
            renderSetup();
        } else if (kind === 'tile-room') {
            const asgId = el.getAttribute('data-asg');
            const dow = Number(el.getAttribute('data-dow'));
            const period = el.getAttribute('data-period');
            mutate((data, draft) => api().setMeetingRoom(data, draft, asgId, dow, period, el.value || ''));
        } else if (kind === 'teacher-colour') {
            const id = row.getAttribute('data-teacher');
            setupEdit((data) => {
                const p = data.teacherProfiles.find((x) => x.id === id);
                if (p) p.color = el.value;
            });
            M = buildModel();
        } else if (kind === 'fix-agree') {
            fixState.agreed = el.checked;
            renderFix();
        } else if (kind === 'class-lock') {
            const demandId = state.selected;
            const on = el.checked;
            mutate((data, draft) => {
                const a = draft.assignments.find((x) => x.demandId === demandId);
                if (a) a.locked = on;
                return { ok: true };
            });
        } else if (kind === 'auto-prev') {
            if (!readOnly()) {
                M.data.plannerState.previousCalendarId = el.value || '';
                markDirty();
            }
            loadPrevious(el.value || '');
        } else if (kind === 'teacher-owntype' || kind === 'teacher-classtype') {
            const id = row.getAttribute('data-teacher');
            setupEdit((data) => {
                const p = data.teacherProfiles.find((x) => x.id === id);
                if (!p) return;
                if (kind === 'teacher-owntype') p.limits.ownTypeOnly = el.checked;
                else {
                    const type = el.getAttribute('data-type');
                    const list = (p.limits.onlyClassTypeIds || []).filter((x) => x !== type);
                    if (el.checked) list.push(type);
                    p.limits.onlyClassTypeIds = list;
                }
            });
        } else if (kind === 'teacher-role' || kind === 'teacher-band') {
            const id = row.getAttribute('data-teacher');
            setupEdit((data) => {
                const p = data.teacherProfiles.find((x) => x.id === id);
                if (!p) return;
                if (kind === 'teacher-role') {
                    p.role = el.value === 'native' ? 'native' : 'korean';
                    setTimeout(renderSetup, 0);
                } else p.limits[`${el.getAttribute('data-band')}Allowed`] = el.checked;
            });
        } else if (kind === 'class-include' || kind === 'class-type') {
            const id = row.getAttribute('data-class');
            setupEdit((data) => {
                const cls = (data.classes || []).find((c) => c.id === id);
                if (!cls) return;
                if (kind === 'class-include') {
                    if (el.checked) delete cls.plannerExcluded;
                    else cls.plannerExcluded = true;
                    row.classList.toggle('is-off', !el.checked);
                } else if (el.value === 'either') delete cls.teacherRequirementType;
                else cls.teacherRequirementType = el.value;
            });
        }
    }

    function onInput(e) {
        const el = e.target;
        if (el.id === 'spSearch') {
            state.query = el.value;
            renderTray();
            return;
        }
        const kind = el.getAttribute('data-input');
        if (!kind || !M) return;
        if (kind === 'max-run') {
            const n = parseInt(el.value, 10);
            if (Number.isFinite(n) && n >= 1) setupEdit((data) => { data.plannerState.maxConsecutive = Math.min(12, n); });
            return;
        }
        const row = el.closest('[data-teacher], [data-room], [data-class]');
        if (!row) return;
        const num = (min, max, dflt) => {
            const n = parseInt(el.value, 10);
            return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : dflt;
        };
        setupEdit((data) => {
            if (kind.startsWith('teacher-')) {
                const p = data.teacherProfiles.find((x) => x.id === row.getAttribute('data-teacher'));
                if (!p) return;
                if (kind === 'teacher-name') p.name = el.value.trim() || p.name;
                if (kind === 'teacher-maxweek') p.limits.maxPeriodsPerWeek = num(0, 60, 22);
                if (kind === 'teacher-maxday') p.limits.maxPeriodsPerDay = num(0, 12, 5);
                if (kind === 'teacher-workstart') p.availability.workStart = el.value || '';
                if (kind === 'teacher-workend') p.availability.workEnd = el.value || '';
            } else if (kind.startsWith('room-')) {
                const r = data.rooms.find((x) => x.id === row.getAttribute('data-room'));
                if (!r) return;
                if (kind === 'room-name') r.name = el.value.trim() || r.name;
                if (kind === 'room-capacity') r.capacity = el.value === '' ? null : num(0, 200, null);
            } else if (kind === 'class-freq') {
                const cls = (data.classes || []).find((c) => c.id === row.getAttribute('data-class'));
                if (cls) cls.weeklyFrequency = num(1, 10, 1);
            }
        });
    }

    function onKeyDown(e) {
        if (e.key === 'Escape') {
            if (drag) {
                endDrag(null, true);
                return;
            }
            if (held) {
                letGo();
                return;
            }
            if (state.menu) {
                closeMenus();
                return;
            }
            if (fixState.open) {
                closeFix();
                return;
            }
            if (autoState.open) {
                closeAuto();
                return;
            }
            if (state.setupOpen && $('spConfirm') && $('spConfirm').hidden) {
                closeSetup();
                return;
            }
            if (state.selected) {
                state.selected = null;
                render();
            }
            return;
        }
        const typing = e.target.closest && e.target.closest('input, textarea, select');
        if ((e.ctrlKey || e.metaKey) && !typing && !state.setupOpen) {
            const k = e.key.toLowerCase();
            if (k === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
                e.preventDefault();
                redo();
            }
        }
        if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('sp-card')) {
            e.preventDefault();
            const id = e.target.getAttribute('data-demand');
            state.selected = state.selected === id ? null : id;
            render();
        }
    }

    // The planner lives in a tab of the main app: only react to events inside it, so its
    // data-act buttons and shortcuts never catch clicks, typing or Ctrl+Z meant for other tabs.
    const PLANNER_AREAS = '#plannerPageRoot, #spSetup, #spAuto, #spFix, #spConfirm, #spHoldBar';

    function inPlanner(target) {
        return !!(target && target.closest && target.closest(PLANNER_AREAS));
    }

    function plannerVisible() {
        const root = $('plannerPageRoot');
        return !!root && !root.hidden && root.offsetParent !== null;
    }

    function bindEvents() {
        if (bound) return;
        bound = true;
        loadPrefs();
        document.addEventListener('click', (e) => {
            if (inPlanner(e.target)) {
                freshModel();
                onClick(e);
                return;
            }
            // A click elsewhere closes an open planner menu.
            document.querySelectorAll('.sp-menu').forEach((mEl) => { mEl.hidden = true; });
        });
        document.addEventListener('change', (e) => { if (inPlanner(e.target)) { freshModel(); onChange(e); } });
        document.addEventListener('input', (e) => { if (inPlanner(e.target)) { freshModel(); onInput(e); } });
        document.addEventListener('keydown', (e) => {
            if (plannerVisible() && (inPlanner(e.target) || e.target === document.body || e.target === document.documentElement)) onKeyDown(e);
        });
        document.addEventListener('pointerdown', (e) => { if (inPlanner(e.target)) { freshModel(); onPointerDown(e); } });
        document.addEventListener('pointermove', onPointerMove, { passive: false });
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
        // A touch that has become a drag must not scroll the page.
        document.addEventListener('touchmove', (e) => {
            if (drag || sort) e.preventDefault();
        }, { passive: false });
        document.addEventListener('contextmenu', (e) => {
            if (drag || (pending && pending.touch)) e.preventDefault();
        });
    }

    function init() {
        bindEvents();
    }

    function mountPage() {
        bindEvents();
        const root = $('plannerPageRoot');
        if (root) root.hidden = false;
        render();
    }

    /** Calendar data changed (another device, another tab of the app): redraw, but not mid-drag. */
    function refresh() {
        if (!plannerVisible()) return;
        if (drag || pending || sort) {
            renderQueued = true;
            return;
        }
        render();
    }

    global.CCPTeacherPlannerUi = {
        init,
        mountPage,
        render,
        refresh,
        ensureData,
        openSetup,
        // for tests
        _state: state,
        _model: () => M,
        _evaluateDrop: (d, target) => evaluateDrop(d, target)
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }
})(typeof window !== 'undefined' ? window : globalThis);
