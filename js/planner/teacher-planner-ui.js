/**
 * Schedule planner screen (planner.html) — rebuilt Nov 2026.
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
        doneOpen: false,
        setupTab: 'teachers',
        setupOpen: false,
        openBlockGrid: null, // teacher profile id or 'everyone'
        openTypes: null, // teacher profile id
        menu: null
    };
    let undoStack = [];
    let redoStack = [];
    let M = null; // model of the current render
    let bound = false;
    let drag = null;
    let pending = null;
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
        } catch (_) { /* ignore */ }
    }

    function savePrefs() {
        try {
            localStorage.setItem(PREF_KEY, JSON.stringify({
                view: state.view, day: state.day, band: state.band, issuesOpen: state.issuesOpen
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
                    days: Array.isArray(c.meetingDays) ? c.meetingDays.map(Number) : [],
                    homeroom: String(c.homeroomTeacherName || '').trim(),
                    students: Array.isArray(c.students) ? c.students.length : 0
                };
            })
            .sort((a, b) => bandRank(a.band) - bandRank(b.band) || a.rank - b.rank
                || a.name.localeCompare(b.name, undefined, { numeric: true }));
        const cohortById = new Map(cohorts.map((c) => [c.id, c]));

        const rooms = (data.rooms || []).slice()
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const roomById = new Map(rooms.map((r) => [r.id, r]));
        const periods = periodRows(data);

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
        const cols = m.cohorts
            .filter((c) => state.band === 'all' || c.band === state.band)
            .map((c) => ({ id: c.id, name: c.name, cohort: c }));
        if (m.noCohortDemands) cols.push({ id: NONE, name: t('spNoCohort', 'No cohort'), none: true });
        return cols;
    }

    /* ------------------------------------------------------------- mutations */

    function mutate(fn, options) {
        const opts = options || {};
        if (!M) return null;
        if (readOnly()) {
            notice(t('plannerReadOnlyHint', 'This calendar is read-only. Request edit access before applying a draft.'), 'error');
            return null;
        }
        const snap = JSON.stringify(M.draft);
        const res = fn(M.data, M.draft);
        if (res && res.ok === false) {
            notice(reasonText(res.reason || (res.reasons && res.reasons[0])), 'error');
            return res;
        }
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
        case 'room_double_booked':
            return t('spWhyRoomBusy', 'The room is already in use then');
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
            return t('spIssueTeacherType', '{name}: {teacher} is not the teacher type it asks for', { name, teacher });
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
        { id: 'clash', codes: ['teacher_double_booked', 'cohort_double_booked', 'room_conflict'] },
        { id: 'todo', codes: ['no_teacher', 'incomplete_placements'] },
        { id: 'warn', codes: ['outside_band_block', 'outside_cohort_days', 'teacher_unavailable', 'wrong_teacher_type', 'wrong_junior_senior_band', 'over_load', 'max_periods_per_day', 'long_run', 'teacher_limit', 'duplicate_weekday_2x'] },
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
                const cid = (d.cohortIds || []).find((id) => M.cohortById.has(id)) || NONE;
                if (!by.has(cid)) by.set(cid, []);
                by.get(cid).push(d);
            });
            const ids = M.cohorts.map((c) => c.id).filter((id) => by.has(id));
            if (by.has(NONE)) ids.push(NONE);
            return ids.map((cid) => `
<div class="sp-tray-group">
  <div class="sp-tray-group-title">${esc(cid === NONE ? t('spNoCohort', 'No cohort') : M.cohortById.get(cid).name)}</div>
  ${by.get(cid).map((d) => trayCard(M, d)).join('')}
</div>`).join('');
        };
        let html = '';
        if (!M.demands.length) {
            html = `<p class="sp-empty">${esc(t('spTrayEmpty', 'No classes yet. Add classes on the calendar first, or open Setup to bring left-out classes back.'))}</p>`;
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
        const demand = state.selected ? M.demandById.get(state.selected) : null;
        if (!demand) {
            el.hidden = true;
            el.innerHTML = '';
            return;
        }
        const asg = M.asgByDemand.get(demand.demandId);
        const meetings = asg ? (asg.meetings || []).slice().sort((a, b) => a.dow - b.dow || Number(a.period) - Number(b.period)) : [];
        const roomOpts = (cur) => `<option value="">${esc(t('spNoRoom', 'No room'))}</option>`
            + M.rooms.map((r) => `<option value="${esc(r.id)}"${r.id === cur ? ' selected' : ''}>${esc(r.name)}</option>`).join('');
        el.hidden = false;
        el.innerHTML = `
<div class="sp-insp-head" style="--c:${esc(demandColor(M, demand))}">
  <strong>${esc(classLabel(M, demand))}</strong>
  <button type="button" class="sp-icon-btn" data-act="deselect" aria-label="${esc(t('spClose', 'Close'))}">×</button>
</div>
<label class="sp-field">
  <span>${esc(t('spTeacher', 'Teacher'))}</span>
  <select class="field-select" data-change="class-teacher">
    <option value="">${esc(t('spNoTeacher', 'No teacher'))}</option>
    ${M.teachers.map((p) => `<option value="${esc(p.id)}"${asg && asg.teacherProfileId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
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
</div>`;
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
        if (band === 'junior') return t('plannerJunior', 'Junior');
        if (band === 'middle') return t('plannerMiddle', 'Middle');
        return t('plannerSenior', 'Senior');
    }

    function tileHtml(m, tile) {
        const { asg, m: meeting, demand } = tile;
        const bits = [];
        const cohort = demandCohortLabel(m, demand);
        const teacher = teacherName(m, asg.teacherProfileId);
        const room = roomName(m, tile.roomId);
        if (state.view !== 'cohorts' && cohort && !demand.name.toLowerCase().includes(cohort.toLowerCase())) bits.push(cohort);
        if (state.view !== 'teachers') bits.push(teacher || t('spNoTeacher', 'No teacher'));
        if (state.view !== 'rooms' && room) bits.push(room);
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
  style="--c:${esc(demandColor(m, demand))}"${why.length ? ` title="${esc(why.join(' · '))}"` : ''}>
  <span class="sp-tile-name">${asg.locked ? '<span class="sp-tile-lock" aria-hidden="true">🔒</span>' : ''}${why.length ? '<span class="sp-tile-flag" aria-hidden="true">!</span>' : ''}${esc(demand.name)}</span>
  ${bits.length ? `<span class="sp-tile-sub">${esc(bits.join(' · '))}</span>` : ''}
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
            }).join('')}</tr></thead><tbody>${M.periods.map((row, i) => `<tr class="${i > 0 && M.periods[i - 1].band !== row.band ? 'is-split' : ''}">${timeCell(row, i)}${DAYS.map((d) => cellHtml(M, col, d, row)).join('')}</tr>`).join('')}</tbody></table></div>`;
        } else {
            const d = state.day;
            html += `<div class="sp-board-scroll"><table class="sp-grid sp-grid--day" style="--cols:${cols.length}"><thead><tr><th class="sp-corner">${esc(dayLabel(d))}</th>${cols.map((c) => {
                const off = c.cohort && c.cohort.days.length && !c.cohort.days.includes(d);
                return `<th scope="col" class="sp-colth${off ? ' is-offday' : ''}${c.none ? ' is-none' : ''}"><div class="sp-colhead">${colHeader(M, c)}</div></th>`;
            }).join('')}</tr></thead><tbody>${M.periods.map((row, i) => `<tr class="${i > 0 && M.periods[i - 1].band !== row.band ? 'is-split' : ''}">${timeCell(row, i)}${cols.map((c) => cellHtml(M, c, d, row)).join('')}</tr>`).join('')}</tbody></table></div>`;
        }
        el.innerHTML = html;
        const next = el.querySelector('.sp-board-scroll');
        if (next && keep) {
            next.scrollLeft = keep.x;
            next.scrollTop = keep.y;
        }
    }

    function renderIssues() {
        const wrap = $('spIssues');
        if (!wrap) return;
        const groups = groupedIssues(M);
        const total = groups.reduce((n, g) => n + g.items.length, 0);
        wrap.classList.toggle('is-collapsed', !state.issuesOpen);
        const titles = {
            clash: t('spGroupClash', 'Clashes'),
            todo: t('spGroupTodo', 'Still to do'),
            warn: t('spGroupWarn', 'Worth a look'),
            room: t('spGroupRoom', 'Rooms')
        };
        wrap.innerHTML = `
<button type="button" class="sp-issues-head" data-act="toggle-issues" aria-expanded="${state.issuesOpen}">
  <span>${esc(t('spIssuesTitle', 'To fix'))}</span><span class="sp-count${groups[0].items.length ? ' is-bad' : ''}">${total}</span>
  <span class="sp-caret${state.issuesOpen ? ' is-open' : ''}" aria-hidden="true">▸</span>
</button>
${state.issuesOpen ? `<div class="sp-issues-body">${total ? groups.filter((g) => g.items.length).map((g) => `
<section class="sp-issue-group sp-issue-group--${g.id}">
  <h3>${esc(titles[g.id])} <span class="sp-count">${g.items.length}</span></h3>
  <ul>${g.items.slice(0, 40).map((x) => `<li><button type="button" class="sp-issue" data-act="jump-issue" data-issue="${esc(x.issue.id)}">${esc(x.text)}</button></li>`).join('')}</ul>
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
        let lead = '';
        if (d.kind === 'tile' && others.length === 1) {
            const a = { assignmentId: d.assignmentId, dow: d.dow, period: d.period };
            const b = { assignmentId: others[0].asg.assignmentId, dow: Number(others[0].m.dow), period: String(others[0].m.period) };
            const mode = view === 'teachers' ? 'teachers' : view === 'rooms' ? 'rooms' : 'time';
            check = P.checkSwap(M.data, M.draft, a, b, mode);
            run = (data, draft) => P.swapPeriods(data, draft, a, b, mode);
            lead = t('spHintSwap', 'Swap with {name}', { name: others[0].demand.name });
        } else if (d.kind === 'tile') {
            const from = { dow: d.dow, period: d.period };
            check = P.checkSlot(M.data, M.draft, d.demandId,
                Object.assign({}, to, { ignore: [{ assignmentId: d.assignmentId, dow: d.dow, period: d.period }] }), M.ctx);
            run = (data, draft) => P.movePeriodTo(data, draft, d.assignmentId, from, to);
        } else {
            check = P.checkSlot(M.data, M.draft, d.demandId, to, M.ctx);
            run = (data, draft) => P.placePeriod(data, draft, d.demandId, to);
        }
        if (!check.ok) {
            return { ok: false, level: 'bad', hint: reasonText(check.reasons[0], { need: demand.teacherRequirementType }) };
        }
        const soft = (check.softReasons || []).filter((r) => r !== 'teacher_reassigned');
        const hints = soft.map((r) => reasonText(r, { need: demand.teacherRequirementType }));
        if (check.warnOutOfBlock) hints.push(reasonText('out_of_block'));
        const info = [];
        if (stays) info.push(stays);
        if (lead) info.push(lead);
        if (check.teacherChanges && view === 'teachers' && !lead) {
            info.push(reasonText('teacher_reassigned', { teacher: teacherName(M, to.teacherProfileId) }));
        }
        return {
            ok: true,
            level: hints.length ? 'warn' : 'ok',
            hint: info.concat(hints).join(' · '),
            run,
            landing: { dow: target.dow, period: target.period }
        };
    }

    function markTargets() {
        if (!drag) return;
        drag.cache = new Map();
        document.querySelectorAll('#spBoard [data-cell]').forEach((cell) => {
            const info = cellInfo(cell);
            const res = evaluateDrop(drag, info);
            drag.cache.set(`${info.col}|${info.dow}|${info.period}`, res);
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
        if (action) {
            if (action.landing) {
                const asg = d.assignmentId ? { assignmentId: d.assignmentId } : null;
                const clashesBefore = clashCount();
                const res = mutate(action.run);
                if (res && res.ok !== false && clashCount() > clashesBefore) {
                    notice(t('spClashMade', 'That made a clash. Press “Suggest fixes” to see ways to move the other classes, or fix it by hand.'), 'info');
                }
                const id = (res && res.assignmentId) || (asg && asg.assignmentId);
                if (res && res.ok !== false && id) {
                    flashTile(id, action.landing.dow, action.landing.period);
                    render();
                }
            } else {
                mutate(action.run);
            }
        } else if (renderQueued) {
            render();
        }
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
        if (tab && ['teachers', 'rooms', 'classes'].includes(tab)) state.setupTab = tab;
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
        if (readOnly()) return;
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
        analysis: null, options: null, base: null, appliedId: null, appliedSig: null, error: ''
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
        autoState.options = A.buildOptions(M.data, JSON.parse(autoState.base), autoState.analysis);
        autoState.loading = false;
        renderAuto();
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
        if (autoState.error) html += `<p class="sp-hint sp-auto-error">${esc(autoState.error)}</p>`;
        else if (autoState.prevId && a && !autoState.loading) {
            html += `<p class="sp-hint">${esc(a.matched
                ? t('spAutoMatched', 'Found {matched} of {total} students in last term’s classes.', { matched: a.matched, total: a.students })
                : t('spAutoMatchedNone', 'None of this term’s students were found in that calendar, so last term is not used.'))}</p>`;
        } else if (!autoState.prevId && !autoState.loading) {
            html += `<p class="sp-hint">${esc(t('spAutoNoPrevHint', 'Choose last term’s calendar to keep teachers with the students they had.'))}</p>`;
        }
        if (autoState.loading || !autoState.options) {
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
                const current = autoState.appliedId === o.id;
                return `
<section class="sp-plan${current ? ' is-current' : ''}">
  <h3>${esc(titles[o.id] || o.id)}</h3>
  <ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}${need ? `<li class="sp-plan-warn">${esc(t('spPlanNeedHand', '{n} classes still need placing by hand', { n: need }))}</li>` : ''}${st.clashes ? `<li class="sp-plan-warn">${esc(t('spSumClashes', '{n} clashes', { n: st.clashes }))}</li>` : ''}</ul>
  <button type="button" class="btn ${current ? 'btn-outline' : 'btn-primary'} btn-small" data-act="use-plan" data-plan="${esc(o.id)}"${current ? ' disabled' : ''}>${esc(current ? t('spPlanCurrent', 'On the board now') : t('spPlanUse', 'Use this plan'))}</button>
</section>`;
            }).join('')}</div>`;
            if (autoState.options.length === 1) {
                html += `<p class="sp-hint">${esc(t('spAutoOnePlan', 'The other priorities give this same plan.'))}</p>`;
            }
            html += `<p class="sp-hint">${esc(t('spAutoKeeps', 'Plans only fill what is missing. Classes you placed stay where they are, and Undo brings the board back.'))}</p>`;
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
        if (!(await confirmBox(msg, t('plannerApply', 'Apply to calendar')))) return;
        const data = M.data;
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

    function printDaily() {
        const map = cellMap(M, 'cohorts');
        return DAYS.map((d) => {
            const cols = M.cohorts.filter((c) => !c.days.length || c.days.includes(d)
                || M.periods.some((row) => (map.get(`${c.id}|${d}|${row.period}`) || []).length));
            if (!cols.length) return '';
            return `
<div class="planner-print-page">${printHeader(`${t('spPrintDaily', 'Daily sheet')} · ${dayLabel(d)}`)}
  <table class="planner-print-table"><thead><tr><th class="planner-print-time-col"></th>${cols.map((c) => `<th>${esc(c.name)}</th>`).join('')}</tr></thead>
  <tbody>${M.periods.map((row) => `<tr><th class="planner-print-time-col">${esc(timeLabel(row))}</th>${cols.map((c) => printCell(map.get(`${c.id}|${d}|${row.period}`) || [], (x) => [
        teacherName(M, x.asg.teacherProfileId), roomName(M, x.roomId)
    ])).join('')}</tr>`).join('')}</tbody></table>
</div>`;
        }).join('');
    }

    function printSheet(kind) {
        const area = $('plannerPrintArea');
        if (!area || !M) return;
        area.innerHTML = kind === 'daily' ? printDaily() : printWeekly(kind);
        area.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => requestAnimationFrame(() => {
            global.print();
            area.setAttribute('aria-hidden', 'true');
        }));
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
        const pick = e.target.closest('.sp-tile, .sp-card');
        if (pick) {
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
        case 'auto': closeMenus(); openAuto(); break;
        case 'close-auto': closeAuto(); break;
        case 'fix': openFix(); break;
        case 'close-fix': closeFix(); break;
        case 'use-fix': useFix(el.getAttribute('data-plan')); break;
        case 'use-plan': usePlan(el.getAttribute('data-plan')); break;
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
        case 'toggle-done':
            state.doneOpen = !state.doneOpen;
            renderTray();
            break;
        case 'deselect':
            state.selected = null;
            render();
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
        if (kind === 'class-teacher') {
            const demandId = state.selected;
            mutate((data, draft) => api().setClassTeacher(data, draft, demandId, el.value || null));
        } else if (kind === 'meeting-room') {
            const asg = M.asgByDemand.get(state.selected);
            if (!asg) return;
            const dow = Number(el.getAttribute('data-dow'));
            const period = el.getAttribute('data-period');
            mutate((data, draft) => api().setMeetingRoom(data, draft, asg.assignmentId, dow, period, el.value || ''));
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

    function bindEvents() {
        if (bound) return;
        bound = true;
        loadPrefs();
        document.addEventListener('click', onClick);
        document.addEventListener('change', onChange);
        document.addEventListener('input', onInput);
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown);
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
        const root = $('plannerPageRoot');
        if (root) root.hidden = false;
        render();
    }

    global.CCPTeacherPlannerUi = {
        init,
        mountPage,
        render,
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
