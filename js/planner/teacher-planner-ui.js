/**
 * Teacher planner UI — used by planner.html satellite page.
 */
(function (global) {
    let bound = false;
    let activeStep = 'teachers';
    let boardView = 'teachers'; // teachers | rooms
    let dragAssignmentId = null;
    let dragKind = 'teacher'; // teacher | room | bin | period
    let dragDemandId = null;
    let dragFromDow = null;
    let dragFromPeriod = null;
    let selectedDemandId = null;
    let binSearchQuery = '';
    let focusedTeacherId = null;
    let roomDay = 1; // Mon–Fri (1–5), Rooms board day sheet
    let highlightCohortId = null;
    let highlightCohortTimer = null;

    function $(id) {
        return document.getElementById(id);
    }

    function t(key, fallback) {
        if (typeof getCalendarTranslation === 'function') {
            const v = getCalendarTranslation(key);
            if (v) return v;
        }
        if (typeof global.t === 'function') {
            const v = global.t(key);
            if (v && v !== key) return v;
        }
        return fallback || key;
    }

    function getAppData() {
        return global.appData || (typeof appData !== 'undefined' ? appData : null);
    }

    function api() {
        return global.CCPTeacherPlanner;
    }

    function markDirty() {
        if (typeof saveData === 'function') {
            saveData();
            return;
        }
        if (typeof global.saveData === 'function') {
            global.saveData();
        }
    }

    function ensureData() {
        const data = getAppData();
        const planner = api();
        if (!data || !planner) return null;
        planner.ensurePlannerFields(data);
        planner.seedTeacherProfilesFromAppData(data);
        return data;
    }

    function setStep(step) {
        activeStep = step;
        ['teachers', 'demand', 'rooms', 'draft'].forEach((s) => {
            const panel = $(`plannerStep-${s}`);
            const tab = $(`plannerStepTab-${s}`);
            if (panel) panel.hidden = s !== step;
            if (tab) tab.classList.toggle('is-active', s === step);
        });
        render();
    }

    function mountPage() {
        const root = $('plannerPageRoot') || $('timetablePlannerRoot');
        if (root) root.hidden = false;
        ensureData();
        setStep(activeStep || 'teachers');
    }

    function getActiveDraft(data) {
        const id = data.plannerState && data.plannerState.activeDraftId;
        if (!id) return null;
        return (data.plannerDrafts || []).find((d) => d.id === id) || null;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(s) {
        return escapeHtml(s).replace(/'/g, '&#39;');
    }

    function weekdayLabel(dow) {
        return ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][Number(dow)] || String(dow);
    }

    function periodTimeLabel(period, data) {
        const p = Number(period);
        const fallback = {
            1: '14:30–15:20',
            2: '15:20–16:10',
            3: '16:10–17:00',
            4: '17:00–18:00',
            5: '18:00–19:00',
            6: '19:00–20:00',
            7: '20:00–21:00'
        };
        let slots = [];
        if (global.CCPTimetablePeriods && typeof global.CCPTimetablePeriods.getSortedTimeSlots === 'function') {
            slots = global.CCPTimetablePeriods.getSortedTimeSlots(data || getAppData()) || [];
        }
        const slot = slots[p - 1];
        if (slot && slot.start && slot.end) {
            const lang = (typeof getCalendarLanguage === 'function' && getCalendarLanguage())
                || (global.appData && global.appData.language)
                || 'en';
            const sep = String(lang).toLowerCase().startsWith('ko') ? '~' : '–';
            return `${slot.start}${sep}${slot.end}`;
        }
        return fallback[p] || `P${p}`;
    }

    function placementsShortText(asg) {
        const meetings = (asg && asg.meetings) || [];
        if (!meetings.length) return '';
        return meetings.map((m) => `${weekdayLabel(m.dow)} P${m.period}`).join(', ');
    }

    function cohortBand(cohort) {
        const b = String((cohort && cohort.scheduleBlock) || '').toLowerCase();
        if (b === 'secondary' || b === 'senior') return 'senior';
        if (b === 'middle' || b === 'middleschool' || b === 'middle-school') return 'middle';
        if (b === 'primary' || b === 'junior') return 'junior';
        const level = String((cohort && (cohort.levelPreset || cohort.level || cohort.name)) || '').toLowerCase();
        if (/senior|waterflow|garam|bada|yeoul|saemmul|mirinae|byeolmaru|시니어/.test(level)) return 'senior';
        if (/middle|중|jung|미들/.test(level)) return 'middle';
        return 'junior';
    }

    function cohortMeetingDaysList(cohort) {
        const days = Array.isArray(cohort && cohort.meetingDays) ? cohort.meetingDays : [];
        return days.map(Number).filter((d) => d >= 1 && d <= 5);
    }

    function cohortDisplayName(cohort) {
        return (cohort && (cohort.name || cohort.label || cohort.id)) || '';
    }

    function bandRank(band) {
        if (band === 'junior') return 0;
        if (band === 'middle') return 1;
        return 2;
    }

    function sortedCohortsForRoomSheet(data) {
        const cohorts = Array.isArray(data.cohorts) ? data.cohorts.slice() : [];
        return cohorts.sort((a, b) => {
            const br = bandRank(cohortBand(a)) - bandRank(cohortBand(b));
            if (br !== 0) return br;
            return String(cohortDisplayName(a)).localeCompare(String(cohortDisplayName(b)));
        });
    }

    function findAssignmentForCohortSlot(assignments, demandById, cohortId, dow, period) {
        return (assignments || []).find((asg) => {
            const demand = demandById.get(asg.demandId);
            if (!demand) return false;
            if (!(demand.cohortIds || []).includes(cohortId)) return false;
            return (asg.meetings || []).some((m) => Number(m.dow) === Number(dow) && String(m.period) === String(period));
        });
    }

    function focusRoomColumn(data, cohortId, scrollTo) {
        const cohort = (data.cohorts || []).find((c) => c && c.id === cohortId);
        if (cohort) {
            const days = cohortMeetingDaysList(cohort);
            if (days.length && !days.includes(Number(roomDay))) {
                roomDay = days[0];
            }
        }
        highlightCohortId = cohortId || null;
        if (highlightCohortTimer) clearTimeout(highlightCohortTimer);
        highlightCohortTimer = setTimeout(() => {
            highlightCohortId = null;
            const latest = ensureData();
            if (latest && boardView === 'rooms') renderDraft(latest);
        }, 1800);
        renderDraft(data);
        if (scrollTo && cohortId) {
            const col = document.querySelector(`[data-cohort-col="${CSS.escape ? CSS.escape(cohortId) : cohortId}"]`);
            if (col && col.scrollIntoView) col.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }

    function renderTeachers(data) {
        const mount = $('plannerTeachersMount');
        if (!mount) return;
        const profiles = data.teacherProfiles || [];
        if (!profiles.length) {
            mount.innerHTML = `<div class="planner-empty-card">
              <p class="module-empty-hint">${t('plannerNoTeachers', 'No teachers found yet. Assign teachers on classes in the calendar, then reopen this page.')}</p>
            </div>`;
            return;
        }
        mount.innerHTML = profiles.map((p) => {
            const limits = p.limits || {};
            const prefs = p.preferences || {};
            const blockouts = (p.availability.unavailableSlots || []).map((s) => `${s.dow}:${s.period}`).join(', ');
            return `
<article class="planner-teacher-card" data-profile-id="${escapeAttr(p.id)}">
  <header class="planner-teacher-card-header">
    <div>
      <strong class="planner-card-title">${escapeHtml(p.name)}</strong>
      <p class="planner-card-sub section-hint">${escapeHtml(p.userId || t('plannerNoAccountId', 'No account id'))}</p>
    </div>
    <label class="form-group planner-inline-field">
      <span class="planner-field-label">${t('plannerRole', 'Role')}</span>
      <select class="field-select planner-teacher-role" data-field="role" aria-label="Role">
        <option value="korean" ${p.role === 'korean' ? 'selected' : ''}>${t('plannerRoleKorean', 'Korean')}</option>
        <option value="native" ${p.role === 'native' ? 'selected' : ''}>${t('plannerRoleNative', 'Native')}</option>
      </select>
    </label>
  </header>
  <div class="planner-card-section">
    <h3 class="planner-card-section-title">${t('plannerLimits', 'Teaching limits')}</h3>
    <div class="planner-teacher-card-grid">
      <label class="form-group"><span class="planner-field-label">${t('plannerMaxWeek', 'Max / week')}</span>
        <input type="number" class="field-input" data-field="maxPeriodsPerWeek" value="${limits.maxPeriodsPerWeek || 22}" min="0" max="40">
      </label>
      <label class="form-group"><span class="planner-field-label">${t('plannerMaxDay', 'Max / day')}</span>
        <input type="number" class="field-input" data-field="maxPeriodsPerDay" value="${limits.maxPeriodsPerDay || 5}" min="0" max="12">
      </label>
      <label class="form-group"><span class="planner-field-label">${t('plannerMinWeek', 'Min / week')}</span>
        <input type="number" class="field-input" data-field="minPeriodsPerWeek" value="${limits.minPeriodsPerWeek || 0}" min="0" max="40">
      </label>
    </div>
  </div>
  <div class="planner-card-section">
    <h3 class="planner-card-section-title">${t('plannerBandsPrefs', 'Bands & preferences')}</h3>
    <div class="planner-teacher-flags">
      <label class="planner-chip-toggle"><input type="checkbox" data-field="juniorAllowed" ${limits.juniorAllowed !== false ? 'checked' : ''}> ${t('plannerJunior', 'Junior')}</label>
      <label class="planner-chip-toggle"><input type="checkbox" data-field="middleAllowed" ${limits.middleAllowed !== false ? 'checked' : ''}> ${t('plannerMiddle', 'Middle')}</label>
      <label class="planner-chip-toggle"><input type="checkbox" data-field="seniorAllowed" ${limits.seniorAllowed !== false ? 'checked' : ''}> ${t('plannerSenior', 'Senior')}</label>
      <label class="planner-chip-toggle"><input type="checkbox" data-field="avoidFirstPeriod" ${prefs.avoidFirstPeriod ? 'checked' : ''}> ${t('plannerAvoidP1', 'Avoid P1')}</label>
      <label class="planner-chip-toggle"><input type="checkbox" data-field="avoidLastPeriod" ${prefs.avoidLastPeriod ? 'checked' : ''}> ${t('plannerAvoidLast', 'Avoid last')}</label>
      <label class="planner-chip-toggle"><input type="checkbox" data-pref-cadence="mwf" ${(prefs.preferCadence || []).includes('mwf') ? 'checked' : ''}> ${t('plannerPreferMwf', 'Prefer MWF')}</label>
      <label class="planner-chip-toggle"><input type="checkbox" data-pref-cadence="tth" ${(prefs.preferCadence || []).includes('tth') ? 'checked' : ''}> ${t('plannerPreferTth', 'Prefer T/T')}</label>
    </div>
  </div>
  <div class="planner-card-section">
    <h3 class="planner-card-section-title">${t('plannerBlockouts', 'Block-outs')}</h3>
    <p class="section-hint">${t('plannerBlockoutsHelp', 'Unavailable weekday:period cells. Example: 5:7 blocks Friday period 7.')}</p>
    <input type="text" class="field-input planner-blockout-input" data-field="blockoutText"
      value="${escapeAttr(blockouts)}"
      placeholder="5:7, 1:1">
  </div>
</article>`;
        }).join('');
    }

    function renderRooms(data) {
        const mount = $('plannerRoomsMount');
        if (!mount) return;
        const rooms = Array.isArray(data.rooms) ? data.rooms : [];
        mount.innerHTML = `
<div class="planner-rooms-toolbar">
  <button type="button" class="btn btn-primary btn-small" id="plannerAddRoomBtn" data-i18n="plannerAddRoom">${t('plannerAddRoom', '+ Add room')}</button>
  <span class="section-hint">${t('plannerRoomsSoftNote', 'Rooms are soft: missing/overlapping rooms warn, but do not block teacher placement.')}</span>
</div>
<div class="planner-rooms-list">
${rooms.length ? rooms.map((r, idx) => `
  <article class="planner-room-card" data-room-id="${escapeAttr(r.id)}">
    <label class="form-group"><span class="planner-field-label">${t('plannerRoomName', 'Room name')}</span>
      <input type="text" class="field-input" data-room-field="name" value="${escapeAttr(r.name || '')}">
    </label>
    <label class="form-group"><span class="planner-field-label">${t('plannerRoomCapacity', 'Capacity')}</span>
      <input type="number" class="field-input" data-room-field="capacity" value="${r.capacity != null ? r.capacity : ''}" min="0">
    </label>
    <button type="button" class="btn btn-outline btn-small planner-room-remove" data-i18n="plannerRemoveRoom">${t('plannerRemoveRoom', 'Remove')}</button>
  </article>`).join('') : `<div class="planner-empty-card"><p class="module-empty-hint">${t('plannerNoRooms', 'No rooms yet. Add Room A / Room B style names, then generate a draft.')}</p></div>`}
</div>`;
    }

    function renderDemand(data) {
        const mount = $('plannerDemandMount');
        const summary = $('plannerDemandSummary');
        if (!mount) return;
        const planner = api();
        const demands = planner.buildDemandsFromAppData(data, {
            filters: data.plannerState && data.plannerState.filters
        });
        const junior = demands.filter((d) => d.band === 'junior').reduce((n, d) => n + d.meetings.length, 0);
        const senior = demands.filter((d) => d.band === 'senior').reduce((n, d) => n + d.meetings.length, 0);
        const mwf = demands.filter((d) => d.cadence === 'mwf').length;
        const tth = demands.filter((d) => d.cadence === 'tth').length;
        const combined = demands.filter((d) => d.cohortIds.length > 1).length;
        if (summary) {
            summary.innerHTML = `
<span class="planner-stat">${demands.length} <small>${t('plannerStatClasses', 'classes')}</small></span>
<span class="planner-stat">${junior} <small>${t('plannerStatJunior', 'junior p')}</small></span>
<span class="planner-stat">${senior} <small>${t('plannerStatSenior', 'senior p')}</small></span>
<span class="planner-stat">MWF ${mwf}</span>
<span class="planner-stat">T/T ${tth}</span>
<span class="planner-stat">${combined} <small>${t('plannerStatCombined', 'combined')}</small></span>`;
        }
        mount.innerHTML = `
<div class="planner-demand-filters">
  <select id="plannerFilterBand" class="field-select">
    <option value="all">All bands</option>
    <option value="junior">Junior</option>
    <option value="middle">Middle</option>
    <option value="senior">Senior</option>
  </select>
  <select id="plannerFilterCadence" class="field-select">
    <option value="all">All cadence</option>
    <option value="mwf">MWF</option>
    <option value="tth">T/T</option>
  </select>
  <label><input type="checkbox" id="plannerFilterCombined"> Combined only</label>
</div>
<div class="planner-demand-table-wrap">
<table class="classroom-sheet planner-demand-table">
  <thead><tr>
    <th>Include</th><th>Class</th><th>Band</th><th>Cadence</th><th>Meetings</th><th>Teacher type</th><th>Status</th>
  </tr></thead>
  <tbody>
  ${demands.map((d) => `
    <tr data-demand-id="${escapeAttr(d.demandId)}" data-class-id="${escapeAttr(d.classId)}">
      <td><input type="checkbox" class="planner-demand-include" ${d.includedInDraft !== false ? 'checked' : ''}></td>
      <td>${escapeHtml(d.name)}${d.cohortIds.length > 1 ? ' <span class="lesson-filter-chip">combined</span>' : ''}</td>
      <td>${escapeHtml(d.band)}</td>
      <td>${escapeHtml(d.cadence)}</td>
      <td>${d.meetings.map((m) => `D${m.dow}P${m.period}`).join(', ') || '—'}</td>
      <td>
        <select class="field-select planner-demand-type">
          <option value="either" ${d.teacherRequirementType === 'either' ? 'selected' : ''}>Either</option>
          <option value="korean" ${d.teacherRequirementType === 'korean' ? 'selected' : ''}>Korean</option>
          <option value="native" ${d.teacherRequirementType === 'native' ? 'selected' : ''}>Native</option>
        </select>
      </td>
      <td>${escapeHtml(d.readiness)}</td>
    </tr>`).join('')}
  </tbody>
</table>
</div>`;
        const f = data.plannerState.filters || {};
        const bandEl = $('plannerFilterBand');
        const cadEl = $('plannerFilterCadence');
        const combEl = $('plannerFilterCombined');
        if (bandEl) bandEl.value = f.band || 'all';
        if (cadEl) cadEl.value = f.cadence || 'all';
        if (combEl) combEl.checked = !!f.combinedOnly;
    }

    function classColor(data, demand) {
        const cls = (data.classes || []).find((c) => c.id === demand.classId);
        if (cls && cls.color) return cls.color;
        const cohortId = (demand.cohortIds || [])[0];
        const cohort = (data.cohorts || []).find((c) => c.id === cohortId);
        return (cohort && cohort.color) || 'var(--primary)';
    }

    function renderSuggestPanel(data, draft, demand) {
        const planner = api();
        const asg = ((draft && draft.assignments) || []).find((a) => a.demandId === demand.demandId);
        const meetingsLen = asg ? (asg.meetings || []).length : 0;
        if (asg && asg.teacherProfileId && meetingsLen > 0) {
            const te = (data.teacherProfiles || []).find((p) => p.id === asg.teacherProfileId);
            return `<div class="planner-suggest-panel">
  <p class="section-hint">${t('plannerTeacherLocked', 'Teacher locked while periods are placed.')}</p>
  <div class="planner-suggest-row is-active">${escapeHtml((te && te.name) || asg.teacherProfileId)}</div>
</div>`;
        }
        const rows = (data.teacherProfiles || []).map((te) => {
            const check = planner.isValidPlacement(data, te, demand, 1, 1, (draft && draft.assignments) || [], {
                demandById: new Map([[demand.demandId, demand]]),
                lockToCohortDays: false
            });
            // Eligibility without a real slot: role/band only
            let eligible = true;
            let reason = '';
            if (demand.teacherRequirementType === 'korean' && te.role !== 'korean') {
                eligible = false;
                reason = t('plannerWrongRole', 'Wrong role');
            } else if (demand.teacherRequirementType === 'native' && te.role !== 'native') {
                eligible = false;
                reason = t('plannerWrongRole', 'Wrong role');
            } else if (demand.band === 'junior' && te.limits.juniorAllowed === false) {
                eligible = false;
                reason = t('plannerWrongBand', 'Band not allowed');
            } else if (demand.band === 'middle' && te.limits.middleAllowed === false) {
                eligible = false;
                reason = t('plannerWrongBand', 'Band not allowed');
            } else if (demand.band === 'senior' && te.limits.seniorAllowed === false) {
                eligible = false;
                reason = t('plannerWrongBand', 'Band not allowed');
            }
            const load = draft && draft.metrics && draft.metrics.teacherLoads
                ? draft.metrics.teacherLoads[te.id]
                : null;
            const loadTxt = load ? `${load.assigned}/${load.max}` : '';
            return `<button type="button" class="planner-suggest-row ${eligible ? '' : 'is-ineligible'}"
              data-suggest-teacher="${escapeAttr(te.id)}" data-suggest-demand="${escapeAttr(demand.demandId)}"
              ${eligible ? '' : 'disabled'}>
              <span>${escapeHtml(te.name)}</span>
              <span class="section-hint">${eligible ? loadTxt : reason}</span>
            </button>`;
        }).join('');
        return `<div class="planner-suggest-panel">
  <p class="planner-bin-heading">${t('plannerAvailableTeachers', 'Available teachers')}</p>
  ${rows || `<p class="section-hint">${t('plannerNoEligibleTeachers', 'No eligible teachers')}</p>`}
</div>`;
    }

    function renderClassBin(data, draft) {
        const list = $('plannerClassBinList');
        if (!list) return;
        const planner = api();
        const demands = planner.buildDemandsFromAppData(data, {
            filters: data.plannerState && data.plannerState.filters
        }).filter((d) => d.includedInDraft !== false);
        const q = String(binSearchQuery || '').trim().toLowerCase();
        const filtered = demands.filter((d) => !q || String(d.name || '').toLowerCase().includes(q));
        const assignments = (draft && draft.assignments) || [];

        const open = [];
        const complete = [];
        filtered.forEach((d) => {
            const asg = assignments.find((a) => a.demandId === d.demandId);
            const need = planner.weeklyNeed(d);
            const have = asg ? (asg.meetings || []).length : 0;
            const done = have >= need && asg && asg.teacherProfileId;
            (done ? complete : open).push({ demand: d, asg, need, have });
        });

        function openRow(item) {
            const d = item.demand;
            const asg = item.asg;
            const te = asg && asg.teacherProfileId
                ? (data.teacherProfiles || []).find((p) => p.id === asg.teacherProfileId)
                : null;
            const selected = selectedDemandId === d.demandId ? ' is-selected' : '';
            const color = classColor(data, d);
            const meta = te
                ? te.name
                : t('plannerNoTeacherYet', 'No teacher yet — drag to any eligible teacher');
            const suggest = (boardView === 'teachers' && selectedDemandId === d.demandId)
                ? renderSuggestPanel(data, draft, d)
                : '';
            const canDrag = boardView === 'teachers';
            return `<div class="planner-bin-row planner-bin-row--unassigned${selected}"
              style="--row-color:${escapeAttr(color)}"
              data-demand-id="${escapeAttr(d.demandId)}"
              data-bin-select="${escapeAttr(d.demandId)}"
              draggable="${canDrag ? 'true' : 'false'}" data-drag-kind="bin">
  <span class="planner-bin-drag-handle" aria-hidden="true" style="${canDrag ? '' : 'visibility:hidden'}">⠿</span>
  <div class="planner-bin-row-main">
    <div class="planner-bin-row-name">${escapeHtml(d.name)}</div>
    <div class="planner-bin-row-meta">${escapeHtml(meta)}</div>
  </div>
  <span class="planner-bin-row-progress">${item.have}/${item.need}</span>
</div>${suggest}`;
        }

        function completeRow(item) {
            const d = item.demand;
            const asg = item.asg;
            const te = asg && asg.teacherProfileId
                ? (data.teacherProfiles || []).find((p) => p.id === asg.teacherProfileId)
                : null;
            const color = classColor(data, d);
            return `<div class="planner-bin-row planner-bin-row--assigned"
              style="--row-color:${escapeAttr(color)}"
              data-demand-id="${escapeAttr(d.demandId)}"
              data-bin-select="${escapeAttr(d.demandId)}"
              draggable="false" data-drag-kind="bin">
  <span class="planner-bin-drag-handle" aria-hidden="true" style="visibility:hidden">⠿</span>
  <div class="planner-bin-row-main">
    <div class="planner-bin-row-name">${escapeHtml(d.name)}</div>
    <div class="planner-bin-row-meta">${escapeHtml(placementsShortText(asg))}</div>
  </div>
  <span class="planner-bin-row-arrow">→ ${escapeHtml((te && te.name) || '—')}</span>
</div>`;
        }

        if (!filtered.length) {
            list.innerHTML = `<p class="planner-bin-empty-note">${t('plannerBinEmpty', 'No classes in draft filters.')}</p>`;
            return;
        }

        list.innerHTML = `
<div class="planner-bin-section-label">${t('plannerNeedsPeriods', 'Needs periods')} (${open.length})</div>
${open.length
        ? open.map(openRow).join('')
        : `<div class="planner-bin-empty-note">${t('plannerEverythingPlaced', 'Everything is placed.')}</div>`}
<div class="planner-bin-section-label planner-bin-section-label--spaced">${t('plannerBinComplete', 'Complete')} (${complete.length})</div>
${complete.length
        ? complete.map(completeRow).join('')
        : `<div class="planner-bin-empty-note">${t('plannerNoneYet', 'None yet.')}</div>`}`;
    }

    function renderDraft(data) {
        const mount = $('plannerDraftMount');
        const issuesMount = $('plannerIssuesMount');
        const metricsMount = $('plannerMetricsMount');
        if (!mount) return;
        const draft = getActiveDraft(data);
        const lockEl = $('plannerLockCohortDays');
        if (lockEl) {
            lockEl.checked = data.plannerState.lockToCohortDays !== false;
        }

        const order = (data.plannerState.teacherBoard && data.plannerState.teacherBoard.panelOrder
            && data.plannerState.teacherBoard.panelOrder.length)
            ? data.plannerState.teacherBoard.panelOrder
            : data.teacherProfiles.map((p) => p.id);
        const visible = (data.plannerState.teacherBoard && data.plannerState.teacherBoard.visibleIds
            && data.plannerState.teacherBoard.visibleIds.length)
            ? data.plannerState.teacherBoard.visibleIds
            : order;

        if (metricsMount) {
            if (!draft) {
                metricsMount.textContent = t('plannerNoDraftYet', 'No draft yet. Generate one to arrange teachers.');
            } else {
                const m = draft.metrics || {};
                metricsMount.innerHTML = `
<span class="planner-stat">${m.assignedCount || 0} <small>${t('plannerStatAssigned', 'assigned')}</small></span>
<span class="planner-stat">${m.unassignedCount || 0} <small>${t('plannerStatUnassigned', 'unassigned')}</small></span>
<span class="planner-stat">${m.hardIssueCount || 0} <small>${t('plannerStatHard', 'hard')}</small></span>
<span class="planner-stat">${m.softIssueCount || 0} <small>${t('plannerStatSoft', 'soft')}</small></span>
<span class="planner-stat">${m.roomUnresolvedCount || 0} <small>${t('plannerStatNoRoom', 'no room')}</small></span>`;
            }
        }

        const teachersBtn = $('plannerBoardTeachersBtn');
        const roomsBtn = $('plannerBoardRoomsBtn');
        if (teachersBtn) teachersBtn.classList.toggle('is-active', boardView === 'teachers');
        if (roomsBtn) roomsBtn.classList.toggle('is-active', boardView === 'rooms');

        renderClassBin(data, draft);

        if (issuesMount) {
            const issues = (draft && draft.issues) || [];
            issuesMount.innerHTML = issues.length
                ? `<ul class="planner-issue-list">${issues.map((i) => `<li class="planner-issue planner-issue--${i.severity}"><strong>${escapeHtml(i.code)}</strong> ${escapeHtml(i.message)}</li>`).join('')}</ul>`
                : `<p class="section-hint">${t('plannerNoIssues', 'No issues')}</p>`;
        }

        if (boardView === 'rooms') {
            renderRoomBoard(data, draft, mount);
            return;
        }

        const profiles = order
            .map((id) => data.teacherProfiles.find((p) => p.id === id))
            .filter(Boolean)
            .filter((p) => visible.includes(p.id));

        const periods = [1, 2, 3, 4, 5, 6, 7];
        const days = [1, 2, 3, 4, 5];
        const assignments = (draft && draft.assignments) || [];
        const blockouts = data.plannerState.blockouts || {};
        const demandById = new Map(api().buildDemandsFromAppData(data).map((d) => [d.demandId, d]));
        const bands = api().BAND_PERIODS || { junior: [1, 2, 3], middle: [3, 4, 5], senior: [4, 5, 6, 7] };

        mount.innerHTML = `
<div class="planner-board-toolbar">
  <span class="section-hint planner-band-legend">
    <span class="planner-band-chip planner-band-chip--junior">${t('plannerJunior', 'Junior')} P${(bands.junior || []).join('-')}</span>
    <span class="planner-band-chip planner-band-chip--middle">${t('plannerMiddle', 'Middle')} P${(bands.middle || []).join('-')}</span>
    <span class="planner-band-chip planner-band-chip--senior">${t('plannerSenior', 'Senior')} P${(bands.senior || []).join('-')}</span>
  </span>
</div>
<div class="planner-teacher-board planner-teacher-board--timetable planner-teacher-board--stack">
${profiles.map((p) => {
    const load = draft && draft.metrics && draft.metrics.teacherLoads
        ? draft.metrics.teacherLoads[p.id]
        : null;
    const focused = focusedTeacherId === p.id ? ' is-focused' : '';
    return `
<section class="planner-teacher-panel${focused}" data-profile-id="${escapeAttr(p.id)}" id="planner-panel-${escapeAttr(p.id)}">
  <header class="planner-teacher-panel-header" data-panel-handle="1" draggable="true">
    <strong class="planner-panel-title">${escapeHtml(p.name)}</strong>
    <span class="planner-panel-load">${load ? `${load.assigned}/${load.max}` : ''}</span>
  </header>
  <table class="timetable-grid planner-tt-grid">
    <thead><tr><th class="timetable-col-time"></th>${days.map((d) => `<th>${weekdayLabel(d)}</th>`).join('')}</tr></thead>
    <tbody>
    ${periods.map((per) => {
        const band = api().periodBand(per);
        const prevBand = per > 1 ? api().periodBand(per - 1) : band;
        const bandCls = `planner-period-band--${band}`;
        const dividerCls = band !== prevBand ? ' planner-band-divider' : '';
        return `
      <tr class="${bandCls}${dividerCls}">
        <th class="timetable-col-time">${escapeHtml(periodTimeLabel(per, data))}</th>
        ${days.map((dow) => {
            const blocked = api().isSlotBlocked(p, dow, per, blockouts);
            const asg = assignments.find((a) => a.teacherProfileId === p.id
                && (a.meetings || []).some((m) => Number(m.dow) === dow && String(m.period) === String(per)));
            if (blocked) {
                return `<td class="timetable-cell planner-cell planner-cell--blocked" data-dow="${dow}" data-period="${per}" title="Blocked"></td>`;
            }
            if (!asg) {
                return `<td class="timetable-cell planner-cell planner-cell--empty" data-profile-id="${escapeAttr(p.id)}" data-dow="${dow}" data-period="${per}"></td>`;
            }
            const demand = demandById.get(asg.demandId) || { name: asg.classId, band: 'junior', classId: asg.classId };
            const color = classColor(data, demand);
            const out = api().isOutOfBlock(demand.band, per);
            const roomName = asg.roomId
                ? ((data.rooms || []).find((r) => r.id === asg.roomId) || {}).name || asg.roomId
                : '';
            const bandShort = demand.band === 'junior'
                ? t('plannerJrShort', 'Jr')
                : demand.band === 'middle'
                    ? t('plannerMidShort', 'Mid')
                    : t('plannerSrShort', 'Sr');
            return `<td class="timetable-cell timetable-cell--colored planner-cell${out ? ' planner-cell--outofblock' : ''}"
              style="background-color:${escapeAttr(color)}"
              data-profile-id="${escapeAttr(p.id)}" data-dow="${dow}" data-period="${per}">
              <button type="button" class="planner-card planner-card--tt" draggable="true"
                data-drag-kind="period"
                data-assignment-id="${escapeAttr(asg.assignmentId)}"
                data-from-dow="${dow}" data-from-period="${per}"
                title="${escapeAttr(demand.name)}">
                <span class="planner-card-name">${out ? '⚠ ' : ''}${escapeHtml(demand.name)}</span>
                <span class="planner-card-meta">${escapeHtml(bandShort)}${roomName ? ` · ${escapeHtml(roomName)}` : ''}${(asg.meetings || []).length > 1 ? ` · ${(asg.meetings || []).length}×` : ''}</span>
              </button>
              <button type="button" class="planner-tile-remove" data-remove-asg="${escapeAttr(asg.assignmentId)}"
                data-remove-dow="${dow}" data-remove-period="${per}" aria-label="Remove">×</button>
            </td>`;
        }).join('')}
      </tr>`;
    }).join('')}
    </tbody>
  </table>
</section>`;
}).join('')}
</div>`;
    }

    function renderRoomBoard(data, draft, mount) {
        const rooms = Array.isArray(data.rooms) ? data.rooms.slice() : [];
        const periods = [1, 2, 3, 4, 5, 6, 7];
        const days = [1, 2, 3, 4, 5];
        const assignments = (draft && draft.assignments) || [];
        const demandById = new Map(api().buildDemandsFromAppData(data).map((d) => [d.demandId, d]));
        const columns = sortedCohortsForRoomSheet(data);
        const bandOrder = [
            ['junior', t('plannerJunior', 'Junior')],
            ['middle', t('plannerMiddle', 'Middle')],
            ['senior', t('plannerSenior', 'Senior')]
        ];

        if (!columns.length) {
            mount.innerHTML = `<div class="planner-empty-card"><p class="module-empty-hint">${t('plannerNoCohortsRoomSheet', 'Add cohorts in Class Setup, then return here to assign rooms by day.')}</p></div>`;
            return;
        }

        if (!days.includes(Number(roomDay))) roomDay = 1;

        const dayTabs = days.map((d) => `
<button type="button" class="planner-day-tab-btn${Number(roomDay) === d ? ' is-active' : ''}" data-room-day="${d}">${weekdayLabel(d)}</button>`).join('');

        const groupHeaderCells = bandOrder.map(([bandKey, label]) => {
            const cols = columns.filter((c) => cohortBand(c) === bandKey);
            if (!cols.length) return '';
            return `<th class="planner-room-band-header" colspan="${cols.length}">${escapeHtml(label)}</th>`;
        }).join('');

        const subHeaderCells = columns.map((c) => {
            const daysShort = cohortMeetingDaysList(c).map(weekdayLabel).join('/');
            const hl = highlightCohortId === c.id ? ' is-col-highlighted' : '';
            const color = c.color || 'var(--primary)';
            return `<th class="${hl.trim()}" data-cohort-col="${escapeAttr(c.id)}">
  <span class="planner-room-cohort-swatch" style="background:${escapeAttr(color)}"></span>${escapeHtml(cohortDisplayName(c))}
  <br><span class="planner-room-cohort-meta">${escapeHtml(daysShort || '—')}</span>
</th>`;
        }).join('');

        const bodyRows = periods.map((p) => {
            const contentCells = columns.map((c) => {
                const hl = highlightCohortId === c.id ? ' is-col-highlighted' : '';
                const asg = findAssignmentForCohortSlot(assignments, demandById, c.id, roomDay, p);
                if (asg) {
                    const demand = demandById.get(asg.demandId) || {};
                    const te = asg.teacherProfileId
                        ? (data.teacherProfiles || []).find((t) => t.id === asg.teacherProfileId)
                        : null;
                    const out = api().isOutOfBlock(demand.band || cohortBand(c), p);
                    const color = classColor(data, demand.cohortIds ? demand : { classId: asg.classId, cohortIds: [c.id] });
                    const name = demand.name || asg.classId;
                    return `<td class="planner-room-sheet-cell planner-room-sheet-cell--colored${hl}${out ? ' is-outofblock' : ''}"
                      style="background:${escapeAttr(color)}"
                      title="${out ? escapeAttr(t('plannerOutsideBlock', 'Outside the suggested block')) : ''}">
  <div class="planner-room-sheet-cell-name">${out ? '⚠ ' : ''}${escapeHtml(name)}</div>
  <div class="planner-room-sheet-cell-teacher">${escapeHtml((te && te.name) || t('plannerNoTeacherShort', 'No teacher'))}</div>
</td>`;
                }
                const cBand = cohortBand(c);
                const pBand = api().periodBand(p);
                const outEmpty = (cBand === 'junior' && pBand === 'senior')
                    || (cBand === 'senior' && pBand === 'junior');
                if (outEmpty) {
                    return `<td class="planner-room-sheet-cell planner-room-sheet-cell--outofblock${hl}"></td>`;
                }
                const attendDays = cohortMeetingDaysList(c);
                if (attendDays.length && !attendDays.includes(Number(roomDay))) {
                    return `<td class="planner-room-sheet-cell planner-room-sheet-cell--notattending${hl}"></td>`;
                }
                return `<td class="planner-room-sheet-cell planner-room-sheet-cell--empty${hl}"></td>`;
            }).join('');

            const roomCells = columns.map((c) => {
                const hl = highlightCohortId === c.id ? ' is-col-highlighted' : '';
                const asg = findAssignmentForCohortSlot(assignments, demandById, c.id, roomDay, p);
                if (!asg) return `<td class="planner-room-sheet-cell planner-room-row-cell${hl}"></td>`;
                const opts = rooms.map((r) => `<option value="${escapeAttr(r.id)}"${asg.roomId === r.id ? ' selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
                return `<td class="planner-room-sheet-cell planner-room-row-cell${hl}">
  <select class="planner-room-select${!asg.roomId ? ' is-empty' : ''}" data-room-asg="${escapeAttr(asg.assignmentId)}" aria-label="${escapeAttr(t('plannerRoom', 'Room'))}">
    <option value=""${!asg.roomId ? ' selected' : ''}>${escapeHtml(t('plannerAddRoomOption', '+ Add room'))}</option>
    ${opts}
  </select>
</td>`;
            }).join('');

            return `<tr><th class="planner-room-time-col">${escapeHtml(periodTimeLabel(p, data))}</th>${contentCells}</tr>
<tr><th class="planner-room-label-col">${escapeHtml(t('plannerRoom', 'Room'))}</th>${roomCells}</tr>`;
        }).join('');

        const roomsHint = rooms.length
            ? t('plannerRoomSheetHint', 'Pick a day, then assign a room under each class. Room conflicts warn only.')
            : t('plannerNoRoomsBoard', 'Add rooms in step 3, then return here to assign rooms.');

        mount.innerHTML = `
<div class="planner-board-toolbar planner-room-sheet-toolbar">
  <div class="planner-day-tabs" role="tablist" aria-label="${escapeAttr(t('plannerBoardRooms', 'Rooms'))}">${dayTabs}</div>
  <span class="section-hint">${escapeHtml(roomsHint)}</span>
</div>
<div class="planner-room-sheet-wrap">
  <table class="planner-room-sheet" style="--planner-room-cols:${columns.length}">
    <thead>
      <tr><th class="planner-room-time-col"></th>${groupHeaderCells}</tr>
      <tr><th class="planner-room-time-col"></th>${subHeaderCells}</tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</div>`;
    }

    function render() {
        const data = ensureData();
        if (!data || !api()) return;
        if (activeStep === 'teachers') renderTeachers(data);
        if (activeStep === 'demand') renderDemand(data);
        if (activeStep === 'rooms') renderRooms(data);
        if (activeStep === 'draft') renderDraft(data);
    }

    function readTeacherCardsIntoData(data) {
        document.querySelectorAll('.planner-teacher-card').forEach((card) => {
            const id = card.getAttribute('data-profile-id');
            const profile = data.teacherProfiles.find((p) => p.id === id);
            if (!profile) return;
            const role = card.querySelector('[data-field="role"]');
            if (role) profile.role = role.value === 'native' ? 'native' : 'korean';
            const maxW = card.querySelector('[data-field="maxPeriodsPerWeek"]');
            const maxD = card.querySelector('[data-field="maxPeriodsPerDay"]');
            const minW = card.querySelector('[data-field="minPeriodsPerWeek"]');
            if (maxW) profile.limits.maxPeriodsPerWeek = Number(maxW.value) || 0;
            if (maxD) profile.limits.maxPeriodsPerDay = Number(maxD.value) || 0;
            if (minW) profile.limits.minPeriodsPerWeek = Number(minW.value) || 0;
            const junior = card.querySelector('[data-field="juniorAllowed"]');
            const middle = card.querySelector('[data-field="middleAllowed"]');
            const senior = card.querySelector('[data-field="seniorAllowed"]');
            if (junior) profile.limits.juniorAllowed = junior.checked;
            if (middle) profile.limits.middleAllowed = middle.checked;
            if (senior) profile.limits.seniorAllowed = senior.checked;
            const a1 = card.querySelector('[data-field="avoidFirstPeriod"]');
            const aL = card.querySelector('[data-field="avoidLastPeriod"]');
            if (a1) profile.preferences.avoidFirstPeriod = a1.checked;
            if (aL) profile.preferences.avoidLastPeriod = aL.checked;
            const cadence = [];
            card.querySelectorAll('[data-pref-cadence]').forEach((el) => {
                if (el.checked) cadence.push(el.getAttribute('data-pref-cadence'));
            });
            profile.preferences.preferCadence = cadence;
            const blockText = card.querySelector('[data-field="blockoutText"]');
            if (blockText) {
                profile.availability.unavailableSlots = String(blockText.value || '')
                    .split(',')
                    .map((part) => part.trim())
                    .filter(Boolean)
                    .map((part) => {
                        const [dow, period] = part.split(':');
                        return { dow: Number(dow), period: String(period) };
                    })
                    .filter((s) => s.dow >= 1 && s.dow <= 5 && s.period);
            }
        });
    }

    function generateDraftAction(rerunOpts) {
        const data = ensureData();
        if (!data || !api()) return;
        readTeacherCardsIntoData(data);
        const prior = getActiveDraft(data);
        const draft = api().generateDraft(data, Object.assign({
            priorAssignments: prior ? prior.assignments : [],
            label: 'Arrange draft'
        }, rerunOpts || {}));
        data.plannerDrafts = [draft].concat((data.plannerDrafts || []).filter((d) => d.id !== draft.id)).slice(0, 5);
        data.plannerState.activeDraftId = draft.id;
        data.plannerState.updatedAt = draft.updatedAt;
        markDirty();
        setStep('draft');
    }

    function applyDraftAction() {
        const data = ensureData();
        const draft = getActiveDraft(data);
        if (!data || !draft || !api()) return;
        if (typeof CalendarSync !== 'undefined' && CalendarSync.isReadOnly && CalendarSync.isReadOnly()) {
            const msg = t('plannerReadOnlyHint', 'This calendar is read-only. Request edit access before applying a draft.');
            if (typeof showAppNotice === 'function') showAppNotice(msg, 'error');
            else if (global.CCPNotice && global.CCPNotice.show) global.CCPNotice.show(msg);
            return;
        }
        const result = api().applyDraftToAppData(data, draft, { replaceAllTeachers: false });
        markDirty();
        if (typeof renderTimetableTab === 'function') renderTimetableTab();
        const msg = `Applied ${result.applied.length}` + (result.failed.length ? `, failed ${result.failed.length}` : '');
        if (typeof showAppNotice === 'function') showAppNotice(msg, 'success');
        else if (global.CCPNotice && global.CCPNotice.show) global.CCPNotice.show(msg);
        render();
    }

    function bindEvents() {
        if (bound) return;
        bound = true;
        document.addEventListener('click', (e) => {
            const stepTab = e.target.closest && e.target.closest('[data-planner-step]');
            if (stepTab) {
                setStep(stepTab.getAttribute('data-planner-step'));
                return;
            }
            const boardBtn = e.target.closest && e.target.closest('[data-board-view]');
            if (boardBtn) {
                boardView = boardBtn.getAttribute('data-board-view') === 'rooms' ? 'rooms' : 'teachers';
                const data = ensureData();
                if (data) renderDraft(data);
                return;
            }
            if (e.target.closest('#plannerAddRoomBtn')) {
                const data = ensureData();
                if (!data || !api()) return;
                data.rooms = data.rooms || [];
                const room = api().defaultRoom({
                    name: `${t('plannerRoomDefaultName', 'Room')} ${data.rooms.length + 1}`,
                    sortOrder: data.rooms.length
                });
                data.rooms.push(room);
                if (data.plannerState.roomBoard) {
                    data.plannerState.roomBoard.panelOrder = data.rooms.map((r) => r.id);
                    data.plannerState.roomBoard.visibleIds = data.rooms.map((r) => r.id);
                }
                markDirty();
                renderRooms(data);
                return;
            }
            if (e.target.classList && e.target.classList.contains('planner-room-remove')) {
                const card = e.target.closest('.planner-room-card');
                const roomId = card && card.getAttribute('data-room-id');
                const data = ensureData();
                if (!data || !roomId) return;
                data.rooms = (data.rooms || []).filter((r) => r.id !== roomId);
                markDirty();
                renderRooms(data);
                return;
            }
            if (e.target.closest('#plannerGenerateBtn')) {
                generateDraftAction();
                return;
            }
            if (e.target.closest('#plannerRerunUnresolvedBtn')) {
                generateDraftAction({ onlyUnresolved: true });
                return;
            }
            if (e.target.closest('#plannerApplyBtn')) {
                applyDraftAction();
                return;
            }
            const binSelect = e.target.closest && e.target.closest('[data-bin-select]');
            if (binSelect) {
                if (e.target.closest('.planner-suggest-panel')) return;
                const demandId = binSelect.getAttribute('data-bin-select');
                selectedDemandId = selectedDemandId === demandId ? null : demandId;
                const data = ensureData();
                const draft = getActiveDraft(data);
                const asg = draft && (draft.assignments || []).find((a) => a.demandId === demandId);
                const demand = (api() && data)
                    ? api().buildDemandsFromAppData(data).find((d) => d.demandId === demandId)
                    : null;
                if (boardView === 'rooms' && demand && (demand.cohortIds || [])[0]) {
                    focusRoomColumn(data, demand.cohortIds[0], true);
                    return;
                }
                if (asg && asg.teacherProfileId && (asg.meetings || []).length) {
                    focusedTeacherId = asg.teacherProfileId;
                    const panel = $(`planner-panel-${asg.teacherProfileId}`);
                    if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                if (data) renderDraft(data);
                return;
            }
            const dayTab = e.target.closest && e.target.closest('[data-room-day]');
            if (dayTab) {
                roomDay = Number(dayTab.getAttribute('data-room-day')) || 1;
                const data = ensureData();
                if (data) renderDraft(data);
                return;
            }
            const cohortCol = e.target.closest && e.target.closest('[data-cohort-col]');
            if (cohortCol && boardView === 'rooms') {
                const data = ensureData();
                if (data) focusRoomColumn(data, cohortCol.getAttribute('data-cohort-col'), false);
                return;
            }
            const suggestBtn = e.target.closest && e.target.closest('[data-suggest-teacher]');
            if (suggestBtn) {
                const data = ensureData();
                const draft = getActiveDraft(data);
                if (!data || !draft || !api()) return;
                const result = api().setAssignmentTeacher(
                    data,
                    draft,
                    suggestBtn.getAttribute('data-suggest-demand'),
                    suggestBtn.getAttribute('data-suggest-teacher')
                );
                if (result.ok) {
                    focusedTeacherId = suggestBtn.getAttribute('data-suggest-teacher');
                    markDirty();
                    renderDraft(data);
                }
                return;
            }
            const removeBtn = e.target.closest && e.target.closest('[data-remove-asg]');
            if (removeBtn) {
                const data = ensureData();
                const draft = getActiveDraft(data);
                if (!data || !draft || !api()) return;
                api().removePeriod(
                    data,
                    draft,
                    removeBtn.getAttribute('data-remove-asg'),
                    removeBtn.getAttribute('data-remove-dow'),
                    removeBtn.getAttribute('data-remove-period')
                );
                markDirty();
                renderDraft(data);
            }
        });

        document.addEventListener('input', (e) => {
            if (e.target && e.target.id === 'plannerBinSearch') {
                binSearchQuery = e.target.value || '';
                const data = ensureData();
                if (data) renderClassBin(data, getActiveDraft(data));
            }
        });

        document.addEventListener('change', (e) => {
            const roomSel = e.target && e.target.closest && e.target.closest('.planner-room-select[data-room-asg]');
            if (!roomSel) return;
            const data = ensureData();
            const draft = getActiveDraft(data);
            if (!data || !draft || !api()) return;
            const assignmentId = roomSel.getAttribute('data-room-asg');
            const toRoomId = roomSel.value || null;
            const result = api().moveAssignmentRoom(draft, assignmentId, toRoomId);
            if (!result.ok) {
                if (typeof showAppNotice === 'function') {
                    showAppNotice(result.reason || t('plannerRoomConflict', 'Room conflict'), 'error');
                }
                renderDraft(data);
                return;
            }
            api().recomputeDraftMetrics(data, draft);
            markDirty();
            renderDraft(data);
            if (typeof showAppNotice === 'function') {
                showAppNotice(
                    toRoomId
                        ? t('plannerRoomAssigned', 'Room assigned.')
                        : t('plannerRoomRemoved', 'Room removed.'),
                    'success'
                );
            }
        });

        document.addEventListener('change', (e) => {
            const data = ensureData();
            if (!data) return;
            if (e.target.id === 'plannerLockCohortDays') {
                data.plannerState.lockToCohortDays = !!e.target.checked;
                const draft = getActiveDraft(data);
                if (draft && api().recomputeDraftMetrics) api().recomputeDraftMetrics(data, draft);
                markDirty();
                renderDraft(data);
                return;
            }
            if (e.target.id === 'plannerFilterBand' || e.target.id === 'plannerFilterCadence' || e.target.id === 'plannerFilterCombined') {
                data.plannerState.filters.band = ($('plannerFilterBand') || {}).value || 'all';
                data.plannerState.filters.cadence = ($('plannerFilterCadence') || {}).value || 'all';
                data.plannerState.filters.combinedOnly = !!(($('plannerFilterCombined') || {}).checked);
                markDirty();
                renderDemand(data);
                return;
            }
            if (e.target.classList && e.target.classList.contains('planner-demand-include')) {
                const row = e.target.closest('tr');
                const classId = row && row.getAttribute('data-class-id');
                const cls = (data.classes || []).find((c) => c.id === classId);
                if (cls) {
                    cls.plannerExcluded = !e.target.checked;
                    markDirty();
                }
                return;
            }
            if (e.target.classList && e.target.classList.contains('planner-demand-type')) {
                const row = e.target.closest('tr');
                const classId = row && row.getAttribute('data-class-id');
                const cls = (data.classes || []).find((c) => c.id === classId);
                if (cls) {
                    cls.teacherRequirementType = e.target.value;
                    markDirty();
                }
                return;
            }
            if (e.target.closest && e.target.closest('.planner-teacher-card')) {
                readTeacherCardsIntoData(data);
                markDirty();
            }
            if (e.target.closest && e.target.closest('.planner-room-card')) {
                const card = e.target.closest('.planner-room-card');
                const roomId = card.getAttribute('data-room-id');
                const room = (data.rooms || []).find((r) => r.id === roomId);
                if (!room) return;
                const nameEl = card.querySelector('[data-room-field="name"]');
                const capEl = card.querySelector('[data-room-field="capacity"]');
                if (nameEl) room.name = nameEl.value;
                if (capEl) room.capacity = capEl.value === '' ? null : Number(capEl.value);
                markDirty();
            }
        });

        document.addEventListener('dragstart', (e) => {
            const binRow = e.target.closest && e.target.closest('.planner-bin-row--unassigned');
            if (binRow && e.target.closest('[data-bin-select], .planner-bin-row')) {
                dragKind = 'bin';
                dragDemandId = binRow.getAttribute('data-demand-id');
                dragAssignmentId = null;
                e.dataTransfer.setData('text/plain', dragDemandId || '');
                e.dataTransfer.setData('text/drag-kind', 'bin');
                e.dataTransfer.setData('text/demand-id', dragDemandId || '');
                e.dataTransfer.effectAllowed = 'move';
                return;
            }
            const card = e.target.closest && e.target.closest('.planner-card');
            if (card) {
                dragAssignmentId = card.getAttribute('data-assignment-id');
                dragKind = card.getAttribute('data-drag-kind') || (boardView === 'rooms' ? 'room' : 'period');
                dragFromDow = card.getAttribute('data-from-dow');
                dragFromPeriod = card.getAttribute('data-from-period');
                e.dataTransfer.setData('text/plain', dragAssignmentId || '');
                e.dataTransfer.setData('text/drag-kind', dragKind);
                if (dragFromDow != null) e.dataTransfer.setData('text/from-dow', String(dragFromDow));
                if (dragFromPeriod != null) e.dataTransfer.setData('text/from-period', String(dragFromPeriod));
                e.dataTransfer.effectAllowed = 'move';
                return;
            }
            const panel = e.target.closest && e.target.closest('.planner-teacher-panel');
            if (panel && e.target.closest('[data-panel-handle]')) {
                e.dataTransfer.setData('text/panel', panel.getAttribute('data-profile-id'));
            }
            if (panel && e.target.closest('[data-room-panel-handle]')) {
                e.dataTransfer.setData('text/room-panel', panel.getAttribute('data-room-id'));
            }
        });

        document.addEventListener('dragover', (e) => {
            const cell = e.target.closest && e.target.closest('.planner-cell');
            if (cell || (e.target.closest && (
                e.target.closest('.planner-teacher-panel')
                || e.target.closest('.planner-room-panel')
            ))) {
                e.preventDefault();
            }
            if (!cell || boardView === 'rooms') return;
            const data = ensureData();
            const draft = getActiveDraft(data);
            if (!data || !draft || !api()) return;
            document.querySelectorAll('.planner-cell.drop-valid, .planner-cell.drop-valid-warn, .planner-cell.drop-invalid')
                .forEach((el) => el.classList.remove('drop-valid', 'drop-valid-warn', 'drop-invalid'));
            const kind = dragKind;
            const dow = cell.getAttribute('data-dow');
            const period = cell.getAttribute('data-period');
            const teacherId = cell.getAttribute('data-profile-id');
            if (!teacherId || cell.classList.contains('planner-cell--blocked')) return;
            const demands = api().buildDemandsFromAppData(data);
            const demandById = new Map(demands.map((d) => [d.demandId, d]));
            const teacher = (data.teacherProfiles || []).find((p) => p.id === teacherId);
            let check = { ok: false, warnOutOfBlock: false };
            if (kind === 'bin' && dragDemandId) {
                const demand = demandById.get(dragDemandId);
                check = api().isValidPlacement(data, teacher, demand, dow, period, draft.assignments, { demandById });
            } else if ((kind === 'period' || kind === 'teacher') && dragAssignmentId) {
                const asg = draft.assignments.find((a) => a.assignmentId === dragAssignmentId);
                const demand = asg && demandById.get(asg.demandId);
                const occupant = cell.querySelector('.planner-card');
                if (occupant && occupant.getAttribute('data-assignment-id') !== dragAssignmentId) {
                    const swap = api().canSwapPeriods(
                        data, draft, dragAssignmentId, occupant.getAttribute('data-assignment-id'),
                        dow, period, dragFromDow, dragFromPeriod
                    );
                    check = { ok: swap.ok, warnOutOfBlock: swap.warnOutOfBlock };
                } else {
                    // preview move: strip current slot
                    const saved = (asg.meetings || []).slice();
                    asg.meetings = saved.filter((m) => !(Number(m.dow) === Number(dragFromDow) && String(m.period) === String(dragFromPeriod)));
                    check = api().isValidPlacement(data, teacher, demand, dow, period, draft.assignments, { demandById });
                    asg.meetings = saved;
                }
            }
            cell.classList.add(check.ok ? (check.warnOutOfBlock ? 'drop-valid-warn' : 'drop-valid') : 'drop-invalid');
        });

        document.addEventListener('dragleave', (e) => {
            const cell = e.target.closest && e.target.closest('.planner-cell');
            if (cell) cell.classList.remove('drop-valid', 'drop-valid-warn', 'drop-invalid');
        });

        document.addEventListener('drop', (e) => {
            const data = ensureData();
            const draft = getActiveDraft(data);
            if (!data || !draft || !api()) return;
            document.querySelectorAll('.planner-cell.drop-valid, .planner-cell.drop-valid-warn, .planner-cell.drop-invalid')
                .forEach((el) => el.classList.remove('drop-valid', 'drop-valid-warn', 'drop-invalid'));

            const roomPanelId = e.dataTransfer.getData('text/room-panel');
            if (roomPanelId) {
                const targetPanel = e.target.closest && e.target.closest('.planner-room-panel');
                if (!targetPanel) return;
                e.preventDefault();
                const order = (data.plannerState.roomBoard.panelOrder || data.rooms.map((r) => r.id)).slice();
                const from = order.indexOf(roomPanelId);
                const toId = targetPanel.getAttribute('data-room-id');
                const to = order.indexOf(toId);
                if (from >= 0 && to >= 0 && from !== to) {
                    order.splice(from, 1);
                    order.splice(to, 0, roomPanelId);
                    data.plannerState.roomBoard.panelOrder = order;
                    markDirty();
                    renderDraft(data);
                }
                return;
            }

            const panelId = e.dataTransfer.getData('text/panel');
            if (panelId) {
                const targetPanel = e.target.closest && e.target.closest('.planner-teacher-panel:not(.planner-room-panel)');
                if (!targetPanel) return;
                e.preventDefault();
                const order = data.plannerState.teacherBoard.panelOrder.slice();
                const from = order.indexOf(panelId);
                const toId = targetPanel.getAttribute('data-profile-id');
                const to = order.indexOf(toId);
                if (from >= 0 && to >= 0 && from !== to) {
                    order.splice(from, 1);
                    order.splice(to, 0, panelId);
                    data.plannerState.teacherBoard.panelOrder = order;
                    markDirty();
                    renderDraft(data);
                }
                return;
            }

            const kind = e.dataTransfer.getData('text/drag-kind') || dragKind || 'period';
            const targetCard = e.target.closest && e.target.closest('.planner-card');
            const targetCell = e.target.closest && e.target.closest('.planner-cell');

            if (kind === 'room' || boardView === 'rooms') {
                const assignmentId = e.dataTransfer.getData('text/plain') || dragAssignmentId;
                if (!assignmentId) return;
                if (targetCard) {
                    e.preventDefault();
                    const otherId = targetCard.getAttribute('data-assignment-id');
                    const result = api().swapAssignmentRooms(draft, assignmentId, otherId);
                    if (result.ok) {
                        markDirty();
                        renderDraft(data);
                    }
                    return;
                }
                if (targetCell && targetCell.classList.contains('planner-cell--room')) {
                    e.preventDefault();
                    const toRoom = targetCell.getAttribute('data-room-id');
                    const result = api().moveAssignmentRoom(draft, assignmentId, toRoom);
                    if (result.ok) {
                        markDirty();
                        renderDraft(data);
                    }
                }
                return;
            }

            const toDow = targetCell && targetCell.getAttribute('data-dow');
            const toPeriod = targetCell && targetCell.getAttribute('data-period');
            const toTeacher = targetCell && targetCell.getAttribute('data-profile-id');

            if (kind === 'bin') {
                const demandId = e.dataTransfer.getData('text/demand-id') || dragDemandId;
                if (!demandId || !targetCell || !toTeacher) return;
                e.preventDefault();
                const result = api().placePeriodOnTeacher(data, draft, demandId, toTeacher, toDow, toPeriod);
                if (result.ok) {
                    markDirty();
                    renderDraft(data);
                } else if (typeof showAppNotice === 'function') {
                    showAppNotice(result.reason || 'Invalid drop', 'error');
                }
                return;
            }

            const assignmentId = e.dataTransfer.getData('text/plain') || dragAssignmentId;
            const fromDow = e.dataTransfer.getData('text/from-dow') || dragFromDow;
            const fromPeriod = e.dataTransfer.getData('text/from-period') || dragFromPeriod;
            if (!assignmentId || !targetCell) return;

            if (targetCard && targetCard.getAttribute('data-assignment-id') !== assignmentId) {
                e.preventDefault();
                const otherId = targetCard.getAttribute('data-assignment-id');
                const result = api().swapPeriodCells(
                    data, draft, assignmentId, otherId,
                    toDow, toPeriod, fromDow, fromPeriod
                );
                if (result.ok) {
                    markDirty();
                    renderDraft(data);
                }
                return;
            }

            if (targetCell.classList.contains('planner-cell--empty') && toTeacher) {
                e.preventDefault();
                const result = api().movePeriod(data, draft, assignmentId, fromDow, fromPeriod, toTeacher, toDow, toPeriod);
                if (result.ok) {
                    markDirty();
                    renderDraft(data);
                } else if (typeof showAppNotice === 'function') {
                    showAppNotice(result.reason || 'Invalid move', 'error');
                }
            }
        });
    }

    function init() {
        bindEvents();
    }

    global.CCPTeacherPlannerUi = {
        init,
        mountPage,
        setStep,
        render,
        ensureData
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : globalThis);
