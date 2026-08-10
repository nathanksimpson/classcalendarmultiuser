/**
 * Migrate to next term — Data zone wizard (TMS cohorts + CCMU student continuity +
 * homeroom + per-cohort teaching decisions for the logged-in teacher).
 */
(function (global) {
    let hooks = null;
    let modalEl = null;
    let step = 1;
    let previousSnapshot = null;
    let scrapedCohorts = [];
    let createdCohortMap = [];
    let transferPlan = null;
    let selectedMoves = new Set();
    let selectedAdds = new Set();
    /** @type {Map<string, string>} unclearKey → chosen previous studentId */
    let unclearResolutions = new Map();
    let scrapeLoading = false;
    let wizardSettings = {
        newName: '',
        monthShift: 3,
        clearClassroom: true,
        copyEvents: true,
        tmsUser: '',
        tmsPass: ''
    };

    function domain() {
        return global.CCPClassroomDomain || null;
    }

    function t(key) {
        return hooks && hooks.t ? hooks.t(key) : key;
    }

    function escapeHtml(s) {
        if (global.CCPUtils && global.CCPUtils.escapeHtml) {
            return global.CCPUtils.escapeHtml(s);
        }
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function cleanTmsCohortName(name) {
        const stripped = String(name || '')
            .replace(/^\[[^\]]+\]\s*/u, '')
            .replace(/\s+/g, ' ')
            .trim();
        return (stripped.split('^')[0] || stripped).trim();
    }

    function inferScheduleFromName(name) {
        const core = cleanTmsCohortName(name).split('^')[0] || '';
        if (/T\s*$/i.test(core) || /T_\d/i.test(core)) {
            return { schedulePattern: 'tth', meetingDays: [2, 4] };
        }
        return { schedulePattern: 'mwf', meetingDays: [1, 3, 5] };
    }

    function isLocalHost() {
        try {
            const h = String((global.location && global.location.hostname) || '').toLowerCase();
            return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
        } catch (_) {
            return false;
        }
    }

    function getAppData() {
        return hooks && hooks.getAppData ? hooks.getAppData() : null;
    }

    function currentUserId() {
        return hooks && hooks.getCurrentUserId ? String(hooks.getCurrentUserId() || '') : '';
    }

    function currentUserDisplayName() {
        return hooks && hooks.getCurrentUserDisplayName
            ? String(hooks.getCurrentUserDisplayName() || '')
            : '';
    }

    function shiftIso(dateStr, monthDelta) {
        if (global.CCPTermCloneWizard && global.CCPTermCloneWizard.shiftIsoDate) {
            return global.CCPTermCloneWizard.shiftIsoDate(dateStr, monthDelta);
        }
        return dateStr;
    }

    function snapshotPreviousStudents(appData) {
        const cohorts = (appData && appData.cohorts) || [];
        return JSON.parse(JSON.stringify(cohorts));
    }

    async function scrapeTmsRosters(username, password) {
        const body = JSON.stringify({
            username: String(username || '').trim(),
            password: String(password || '')
        });
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

        if (!isLocalHost()) {
            const bases = ['http://127.0.0.1:8080', 'http://localhost:8080'];
            for (const base of bases) {
                try {
                    const ping = await fetch(`${base}/api/tms/bridge/ping`, {
                        credentials: 'omit',
                        targetAddressSpace: 'loopback'
                    });
                    if (!ping.ok) {
                        continue;
                    }
                    const meta = await ping.json().catch(() => null);
                    if (!meta || meta.ok !== true || meta.bridge !== true) {
                        continue;
                    }
                    const res = await fetch(`${base}/api/tms/bridge/preview`, {
                        method: 'POST',
                        headers,
                        body,
                        credentials: 'omit',
                        targetAddressSpace: 'loopback'
                    });
                    if (!res.ok) {
                        const errBody = await res.json().catch(() => ({}));
                        throw new Error(errBody.error || `bridge HTTP ${res.status}`);
                    }
                    return res.json();
                } catch (err) {
                    if (err && err.message && !/Failed to fetch|NetworkError|abort/i.test(err.message)) {
                        throw err;
                    }
                }
            }
        }

        const res = await fetch('/api/tms/roster/preview', {
            method: 'POST',
            headers,
            body,
            credentials: 'same-origin'
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error || `HTTP ${res.status}`);
        }
        return res.json();
    }

    function mapScheduleForApp(schedule, appData) {
        const d = domain();
        if (!d || !d.mapTmsBlockToPeriod || !schedule) {
            return null;
        }
        return d.mapTmsBlockToPeriod(
            schedule,
            appData && appData.timetableTimeSlots,
            appData && appData.periodSlotMap
        );
    }

    function matchHomeroomTeacherByName(tmsName) {
        const name = String(tmsName || '').trim();
        if (!name || !hooks || !hooks.listTeachers) {
            return { userId: '', name: name };
        }
        const teachers = hooks.listTeachers() || [];
        const exact = teachers.find(
            (r) => String(r.displayName || '').trim() === name || String(r.name || '').trim() === name
        );
        if (exact) {
            return { userId: exact.userId || '', name: exact.displayName || name };
        }
        const lower = name.toLowerCase();
        const fuzzy = teachers.find((r) => {
            const dn = String(r.displayName || '').toLowerCase();
            return dn && (dn.includes(lower) || lower.includes(dn));
        });
        if (fuzzy) {
            return { userId: fuzzy.userId || '', name: fuzzy.displayName || name };
        }
        return { userId: '', name };
    }

    /**
     * Pure helper: build create specs from scrape + app timetable + previous cohort match.
     */
    function buildCohortCreateSpecs(tmsCohorts, appData) {
        const d = domain();
        const previous = (appData && appData.cohorts) || [];
        const links = (appData && appData.tmsRosterLinks) || {};
        return (Array.isArray(tmsCohorts) ? tmsCohorts : []).map((c) => {
            const sched = inferScheduleFromName(c.cohortName);
            const mapped = mapScheduleForApp(c.schedule, appData);
            const match =
                d && d.matchPreviousCohortForTmsClass
                    ? d.matchPreviousCohortForTmsClass(previous, links, c.tmsClassId, c.cohortName)
                    : { cohort: null, matchedBy: '' };
            const prev = match.cohort;
            const levelPreset =
                (prev && (prev.levelPreset || prev.level)) || '';
            let homeroomTeacherUserId = prev ? String(prev.homeroomTeacherUserId || '') : '';
            let homeroomTeacherName = prev ? String(prev.homeroomTeacherName || '') : '';
            let homeroomDaySuffix = prev ? String(prev.homeroomDaySuffix || '') : '';
            if (!homeroomTeacherUserId && c.tmsHomeroomName) {
                const hr = matchHomeroomTeacherByName(c.tmsHomeroomName);
                homeroomTeacherUserId = hr.userId;
                homeroomTeacherName = hr.name || c.tmsHomeroomName;
            }
            return {
                tmsClassId: String(c.tmsClassId || ''),
                cohortName: cleanTmsCohortName(c.cohortName),
                rawName: c.cohortName || '',
                students: Array.isArray(c.students) ? c.students.slice() : [],
                schedulePattern: sched.schedulePattern,
                meetingDays: sched.meetingDays.slice(),
                schedule: c.schedule || null,
                tmsBlockStart: mapped && mapped.start ? mapped.start : '',
                tmsBlockEnd: mapped && mapped.end ? mapped.end : '',
                tmsSuggestedPeriod: mapped && mapped.period != null ? mapped.period : null,
                tmsSuggestedTimeSlotId: mapped && mapped.timeSlotId ? mapped.timeSlotId : '',
                tmsHomeroomName: c.tmsHomeroomName || '',
                levelPreset: String(levelPreset || ''),
                matchedPreviousCohortId: prev ? prev.id : '',
                matchedBy: match.matchedBy || '',
                homeroomTeacherUserId,
                homeroomTeacherName,
                homeroomDaySuffix,
                iTeachHere: false,
                classMode: null,
                previousClassId: '',
                subjectTrack: '',
                period: mapped && mapped.period != null ? mapped.period : null,
                startDate: '',
                endDate: '',
                previousClassOptions: []
            };
        });
    }

    function applyTeachingDefaults() {
        const d = domain();
        const appData = getAppData() || {};
        const monthShift = Number(wizardSettings.monthShift) || 0;
        const termStart = appData.termStart ? shiftIso(appData.termStart, monthShift) : '';
        const termEnd = appData.termEnd ? shiftIso(appData.termEnd, monthShift) : '';
        if (d && d.buildPerCohortTeachingDefaults) {
            createdCohortMap = d.buildPerCohortTeachingDefaults(
                appData,
                createdCohortMap,
                currentUserId(),
                {
                    monthShift,
                    termStart,
                    termEnd,
                    shiftIsoDate: shiftIso
                }
            );
        } else {
            createdCohortMap = createdCohortMap.map((row) =>
                Object.assign({}, row, {
                    startDate: termStart,
                    endDate: termEnd,
                    iTeachHere: false,
                    classMode: null
                })
            );
        }
    }

    function rebuildTransferPlan() {
        const d = domain();
        if (!d || !d.buildTermMigrateTransferPlan) {
            transferPlan = { moves: [], adds: [], unmatchedPrevious: [], unclear: [] };
            return;
        }
        const targets = createdCohortMap.map((row) => ({
            cohortId: row.cohortId,
            cohortName: row.cohortName,
            levelPreset: row.levelPreset || '',
            students: row.students || []
        }));
        transferPlan = d.buildTermMigrateTransferPlan(previousSnapshot || [], targets);
        selectedMoves = new Set((transferPlan.moves || []).map((_, i) => `m${i}`));
        selectedAdds = new Set((transferPlan.adds || []).map((_, i) => `a${i}`));
    }

    function ensureModal() {
        modalEl = document.getElementById('termMigrateModal');
        return modalEl;
    }

    function setStatus(msg, isError) {
        const el = document.getElementById('termMigrateStatus');
        if (!el) {
            return;
        }
        el.textContent = msg || '';
        el.classList.toggle('is-error', Boolean(isError));
    }

    function listSubjectTracksForRow(row) {
        const matrix = global.CCPScheduleMatrix;
        if (!matrix || !matrix.findSlots || !row.levelPreset) {
            return [];
        }
        const patternId = row.schedulePattern === 'tth' ? 'tth' : 'mwf';
        const slots = matrix.findSlots({
            level: row.levelPreset,
            patternId
        });
        const tracks = new Set();
        (slots || []).forEach((slot) => {
            Object.values(slot.byWeekday || {}).forEach((track) => {
                if (track) {
                    tracks.add(track);
                }
            });
        });
        return Array.from(tracks);
    }

    function periodOptionsHtml(selected) {
        const opts = [];
        for (let p = 1; p <= 8; p += 1) {
            const sel = Number(selected) === p ? ' selected' : '';
            opts.push(`<option value="${p}"${sel}>P${p}</option>`);
        }
        return opts.join('');
    }

    function flushStep2Levels() {
        document.querySelectorAll('.term-migrate-level').forEach((input) => {
            const idx = Number(input.getAttribute('data-idx'));
            if (createdCohortMap[idx]) {
                createdCohortMap[idx].levelPreset = String(input.value || '').trim();
            }
        });
    }

    function flushStep4Homeroom() {
        createdCohortMap.forEach((row, idx) => {
            const sel = document.getElementById(`termMigrateHrSel_${idx}`);
            const nameInput = document.getElementById(`termMigrateHrName_${idx}`);
            if (sel && hooks && hooks.parseTeacherPickerValue) {
                const parsed = hooks.parseTeacherPickerValue(sel.value);
                row.homeroomTeacherUserId = parsed.userId || '';
                if (nameInput && nameInput.value.trim()) {
                    row.homeroomTeacherName = nameInput.value.trim();
                } else {
                    row.homeroomTeacherName = parsed.displayName || row.homeroomTeacherName || '';
                }
            } else if (nameInput) {
                row.homeroomTeacherName = nameInput.value.trim();
            }
            const suffix = document.getElementById(`termMigrateHrSuffix_${idx}`);
            if (suffix) {
                row.homeroomDaySuffix = suffix.value.trim();
            }
        });
    }

    function flushStep5Teaching() {
        createdCohortMap.forEach((row, idx) => {
            const teachCb = document.getElementById(`termMigrateTeach_${idx}`);
            row.iTeachHere = Boolean(teachCb && teachCb.checked);
            if (!row.iTeachHere) {
                row.classMode = null;
                return;
            }
            const modeCarry = document.getElementById(`termMigrateModeCarry_${idx}`);
            row.classMode = modeCarry && modeCarry.checked ? 'carry' : 'new';
            const prevSel = document.getElementById(`termMigratePrevClass_${idx}`);
            if (prevSel) {
                row.previousClassId = prevSel.value || '';
            }
            const trackSel = document.getElementById(`termMigrateTrack_${idx}`);
            if (trackSel) {
                row.subjectTrack = trackSel.value || '';
            }
            const periodSel = document.getElementById(`termMigratePeriod_${idx}`);
            if (periodSel && periodSel.value) {
                row.period = Number(periodSel.value);
            }
            const startEl = document.getElementById(`termMigrateStart_${idx}`);
            const endEl = document.getElementById(`termMigrateEnd_${idx}`);
            if (startEl) {
                row.startDate = startEl.value || '';
            }
            if (endEl) {
                row.endDate = endEl.value || '';
            }
        });
    }

    function renderStep() {
        const body = document.getElementById('termMigrateBody');
        const title = document.getElementById('termMigrateModalTitle');
        const backBtn = document.getElementById('termMigrateBackBtn');
        const nextBtn = document.getElementById('termMigrateNextBtn');
        if (!body) {
            return;
        }
        if (title) {
            title.textContent = t('dataTermMigrateHeading');
        }
        if (backBtn) {
            backBtn.hidden = step <= 1;
        }
        if (nextBtn) {
            if (step === 1) {
                nextBtn.textContent = t('dataTermMigrateScrapeNext');
            } else if (step === 6) {
                nextBtn.textContent = t('dataTermMigrateSubmit');
            } else {
                nextBtn.textContent = t('dataTermMigrateContinue');
            }
        }

        if (step === 1) {
            body.innerHTML = `
                <p class="section-hint">${escapeHtml(t('dataTermMigrateHint'))}</p>
                <label class="form-group" for="termMigrateNameInput">
                    <span>${escapeHtml(t('dataTermCloneNameLabel'))}</span>
                    <input type="text" id="termMigrateNameInput" class="field-input field-control" autocomplete="off" />
                </label>
                <label class="form-group" for="termMigrateMonthShift">
                    <span>${escapeHtml(t('dataTermCloneMonthShift'))}</span>
                    <input type="number" id="termMigrateMonthShift" class="field-input field-control" min="0" max="24" step="1" value="3" />
                </label>
                <label class="checkbox-label selection-chip">
                    <input type="checkbox" id="termMigrateClearClassroom" checked />
                    <span>${escapeHtml(t('dataTermCloneClearClassroom'))}</span>
                </label>
                <label class="checkbox-label selection-chip">
                    <input type="checkbox" id="termMigrateCopyEvents" checked />
                    <span>${escapeHtml(t('dataTermMigrateCopyEvents'))}</span>
                </label>
                <div class="form-row">
                    <label class="form-group" for="termMigrateTmsUser">
                        <span>${escapeHtml(t('rosterTmsUsernameLabel') || 'TMS username')}</span>
                        <input type="text" id="termMigrateTmsUser" class="field-input field-control" autocomplete="username" />
                    </label>
                    <label class="form-group" for="termMigrateTmsPass">
                        <span>${escapeHtml(t('rosterTmsPasswordLabel') || 'TMS password')}</span>
                        <input type="password" id="termMigrateTmsPass" class="field-input field-control" autocomplete="current-password" />
                    </label>
                </div>
                <p class="section-hint">${escapeHtml(t('dataTermMigrateStep1Hint'))}</p>
            `;
            const appData = getAppData() || {};
            const nameInput = document.getElementById('termMigrateNameInput');
            const shiftInput = document.getElementById('termMigrateMonthShift');
            if (nameInput) {
                const base = String(appData.calendarName || '').trim();
                nameInput.value =
                    wizardSettings.newName ||
                    (base ? `${base} (next term)` : t('dataTermCloneDefaultName'));
            }
            if (shiftInput) {
                shiftInput.value = String(
                    wizardSettings.monthShift != null
                        ? wizardSettings.monthShift
                        : appData.termMonthCount || 3
                );
            }
            const clearCb = document.getElementById('termMigrateClearClassroom');
            if (clearCb) {
                clearCb.checked = wizardSettings.clearClassroom !== false;
            }
            const copyEv = document.getElementById('termMigrateCopyEvents');
            if (copyEv) {
                copyEv.checked = wizardSettings.copyEvents !== false;
            }
            const userEl = document.getElementById('termMigrateTmsUser');
            const passEl = document.getElementById('termMigrateTmsPass');
            if (userEl) {
                userEl.value = wizardSettings.tmsUser || '';
            }
            if (passEl) {
                passEl.value = wizardSettings.tmsPass || '';
            }
            return;
        }

        if (step === 2) {
            const rows = createdCohortMap
                .map((row, idx) => {
                    const period =
                        row.tmsSuggestedPeriod != null ? `P${row.tmsSuggestedPeriod}` : '—';
                    const block =
                        row.tmsBlockStart && row.tmsBlockEnd
                            ? `${row.tmsBlockStart}–${row.tmsBlockEnd}`
                            : '—';
                    return `<tr>
                        <td>${escapeHtml(row.cohortName)}</td>
                        <td>${escapeHtml(row.schedulePattern || '')}</td>
                        <td>${escapeHtml(block)}</td>
                        <td>${escapeHtml(period)}</td>
                        <td>${(row.students || []).length}</td>
                        <td>
                          <input type="text" class="field-input field-control term-migrate-level" data-idx="${idx}"
                            value="${escapeHtml(row.levelPreset || '')}" placeholder="${escapeHtml(t('dataTermMigrateLevelPlaceholder'))}" />
                        </td>
                    </tr>`;
                })
                .join('');
            body.innerHTML = `
                <p class="section-hint">${escapeHtml(t('dataTermMigrateStep2Hint'))}</p>
                <div class="classroom-sheet-panel">
                  <div class="classroom-sheet-scroll">
                    <table class="classroom-sheet">
                      <thead><tr>
                        <th>${escapeHtml(t('dataTermMigrateColClass'))}</th>
                        <th>${escapeHtml(t('dataTermMigrateColDays'))}</th>
                        <th>${escapeHtml(t('dataTermMigrateColBlock'))}</th>
                        <th>${escapeHtml(t('dataTermMigrateColPeriod'))}</th>
                        <th>${escapeHtml(t('dataTermMigrateColStudents'))}</th>
                        <th>${escapeHtml(t('level') || 'Level')}</th>
                      </tr></thead>
                      <tbody>${rows || `<tr><td colspan="6">${escapeHtml(t('dataTermMigrateNoClasses'))}</td></tr>`}</tbody>
                    </table>
                  </div>
                </div>
            `;
            body.querySelectorAll('.term-migrate-level').forEach((input) => {
                input.addEventListener('change', () => {
                    const idx = Number(input.getAttribute('data-idx'));
                    if (createdCohortMap[idx]) {
                        createdCohortMap[idx].levelPreset = String(input.value || '').trim();
                    }
                });
            });
            return;
        }

        if (step === 3) {
            rebuildTransferPlan();
            const moves = (transferPlan && transferPlan.moves) || [];
            const adds = (transferPlan && transferPlan.adds) || [];
            const unmatched = (transferPlan && transferPlan.unmatchedPrevious) || [];
            const unclear = (transferPlan && transferPlan.unclear) || [];
            const moveRows = moves
                .map((m, i) => {
                    const key = `m${i}`;
                    const levelNote = m.likelyLevelUp
                        ? ` (${escapeHtml(m.previousLevel || '?')} → ${escapeHtml(m.nextLevel || '?')})`
                        : m.previousLevel
                          ? ` (${escapeHtml(m.previousLevel)})`
                          : '';
                    return `<tr>
                      <td><input type="checkbox" data-move="${key}" ${selectedMoves.has(key) ? 'checked' : ''} /></td>
                      <td>${escapeHtml(m.name)}${levelNote}</td>
                      <td>${escapeHtml(m.fromCohortName)}</td>
                      <td>${escapeHtml(m.toCohortName)}</td>
                      <td>${escapeHtml(m.matchedBy || '')}</td>
                    </tr>`;
                })
                .join('');
            const addRows = adds
                .map((a, i) => {
                    const key = `a${i}`;
                    return `<tr>
                      <td><input type="checkbox" data-add="${key}" ${selectedAdds.has(key) ? 'checked' : ''} /></td>
                      <td>${escapeHtml(a.tmsName || a.name)}</td>
                      <td>—</td>
                      <td>${escapeHtml(a.toCohortName)}</td>
                      <td>new</td>
                    </tr>`;
                })
                .join('');
            const unclearRows = unclear
                .map((u, i) => {
                    const key = `u${i}`;
                    const chosen = unclearResolutions.get(key) || '';
                    const opts = (u.candidates || [])
                        .map((c) => {
                            const sel = chosen === c.studentId ? ' selected' : '';
                            return `<option value="${escapeHtml(c.studentId)}"${sel}>${escapeHtml(
                                `${c.name} (${c.fromCohortName || ''})`
                            )}</option>`;
                        })
                        .join('');
                    return `<tr>
                      <td>${escapeHtml(u.tmsName)}</td>
                      <td>${escapeHtml(u.toCohortName)}</td>
                      <td>
                        <select class="field-select field-control" data-unclear="${key}">
                          <option value="">${escapeHtml(t('dataTermMigrateUnclearPick'))}</option>
                          ${opts}
                        </select>
                      </td>
                    </tr>`;
                })
                .join('');
            body.innerHTML = `
                <p class="section-hint">${escapeHtml(t('dataTermMigrateStep3Hint'))}</p>
                <p class="section-hint">${escapeHtml(
                    t('dataTermMigrateTransferSummary')
                        .replace('{moves}', String(moves.length))
                        .replace('{adds}', String(adds.length))
                        .replace('{left}', String(unmatched.length))
                        .replace('{unclear}', String(unclear.length))
                )}</p>
                <div class="classroom-sheet-panel">
                  <div class="classroom-sheet-scroll">
                    <table class="classroom-sheet">
                      <thead><tr>
                        <th></th>
                        <th>${escapeHtml(t('dataTermMigrateColStudent'))}</th>
                        <th>${escapeHtml(t('dataTermMigrateColFrom'))}</th>
                        <th>${escapeHtml(t('dataTermMigrateColTo'))}</th>
                        <th>${escapeHtml(t('dataTermMigrateColMatch'))}</th>
                      </tr></thead>
                      <tbody>${moveRows}${addRows || ''}</tbody>
                    </table>
                  </div>
                </div>
                ${
                    unclear.length
                        ? `<h3 class="form-section-title">${escapeHtml(t('dataTermMigrateUnclearHeading'))}</h3>
                        <p class="section-hint">${escapeHtml(t('dataTermMigrateUnclearHint').replace('{n}', String(unclear.length)))}</p>
                        <div class="classroom-sheet-panel"><div class="classroom-sheet-scroll">
                          <table class="classroom-sheet">
                            <thead><tr>
                              <th>${escapeHtml(t('dataTermMigrateColStudent'))}</th>
                              <th>${escapeHtml(t('dataTermMigrateColTo'))}</th>
                              <th>${escapeHtml(t('dataTermMigrateUnclearPick'))}</th>
                            </tr></thead>
                            <tbody>${unclearRows}</tbody>
                          </table>
                        </div></div>`
                        : ''
                }
                ${
                    unmatched.length
                        ? `<p class="section-hint">${escapeHtml(t('dataTermMigrateUnmatchedHint').replace('{n}', String(unmatched.length)))}</p>
                        <ul class="section-hint">${unmatched
                            .slice(0, 40)
                            .map(
                                (u) =>
                                    `<li>${escapeHtml(u.name)} ← ${escapeHtml(u.fromCohortName || '')}</li>`
                            )
                            .join('')}${
                              unmatched.length > 40
                                  ? `<li>… +${unmatched.length - 40}</li>`
                                  : ''
                          }</ul>`
                        : ''
                }
            `;
            body.querySelectorAll('input[data-move]').forEach((cb) => {
                cb.addEventListener('change', () => {
                    const key = cb.getAttribute('data-move');
                    if (cb.checked) {
                        selectedMoves.add(key);
                    } else {
                        selectedMoves.delete(key);
                    }
                });
            });
            body.querySelectorAll('input[data-add]').forEach((cb) => {
                cb.addEventListener('change', () => {
                    const key = cb.getAttribute('data-add');
                    if (cb.checked) {
                        selectedAdds.add(key);
                    } else {
                        selectedAdds.delete(key);
                    }
                });
            });
            body.querySelectorAll('select[data-unclear]').forEach((sel) => {
                sel.addEventListener('change', () => {
                    const key = sel.getAttribute('data-unclear');
                    if (sel.value) {
                        unclearResolutions.set(key, sel.value);
                    } else {
                        unclearResolutions.delete(key);
                    }
                });
            });
            return;
        }

        if (step === 4) {
            const cards = createdCohortMap
                .map((row, idx) => {
                    return `<div class="form-group term-migrate-hr-card" data-idx="${idx}">
                      <h3 class="form-section-title">${escapeHtml(row.cohortName)}</h3>
                      <p class="section-hint">${escapeHtml(row.levelPreset || '—')} · ${(row.students || []).length} ${escapeHtml(t('dataTermMigrateColStudents'))}</p>
                      <div class="form-row" id="termMigrateHrMount_${idx}"></div>
                      <label class="form-group" for="termMigrateHrName_${idx}">
                        <span>${escapeHtml(t('timetableHomeroomTeacher') || 'Homeroom')}</span>
                        <input type="text" id="termMigrateHrName_${idx}" class="field-input field-control" value="${escapeHtml(row.homeroomTeacherName || '')}" />
                      </label>
                      <label class="form-group" for="termMigrateHrSuffix_${idx}">
                        <span>${escapeHtml(t('timetableHomeroomDaySuffix') || 'Day suffix')}</span>
                        <input type="text" id="termMigrateHrSuffix_${idx}" class="field-input field-control" value="${escapeHtml(row.homeroomDaySuffix || '')}" />
                      </label>
                    </div>`;
                })
                .join('');
            const missing = createdCohortMap.filter(
                (r) => !r.homeroomTeacherUserId && !r.homeroomTeacherName
            ).length;
            body.innerHTML = `
                <p class="section-hint">${escapeHtml(t('dataTermMigrateStep4Hint'))}</p>
                ${
                    missing
                        ? `<p class="section-hint">${escapeHtml(
                              t('dataTermMigrateHomeroomMissing').replace('{n}', String(missing))
                          )}</p>`
                        : ''
                }
                <div class="term-migrate-hr-list">${cards}</div>
            `;
            createdCohortMap.forEach((row, idx) => {
                const mount = document.getElementById(`termMigrateHrMount_${idx}`);
                if (!mount || !hooks || !hooks.buildTeacherSelect) {
                    return;
                }
                const sel = hooks.buildTeacherSelect(
                    row.homeroomTeacherUserId,
                    row.homeroomTeacherName
                );
                sel.id = `termMigrateHrSel_${idx}`;
                sel.className = 'field-select field-control term-migrate-hr-select';
                const label = document.createElement('label');
                label.className = 'form-group';
                label.appendChild(document.createTextNode(t('timetableHomeroomTeacher') || 'Homeroom'));
                label.appendChild(sel);
                mount.appendChild(label);
                sel.addEventListener('change', () => {
                    if (!hooks.parseTeacherPickerValue) {
                        return;
                    }
                    const parsed = hooks.parseTeacherPickerValue(sel.value);
                    row.homeroomTeacherUserId = parsed.userId || '';
                    const nameInput = document.getElementById(`termMigrateHrName_${idx}`);
                    if (nameInput && parsed.displayName) {
                        nameInput.value = parsed.displayName;
                        row.homeroomTeacherName = parsed.displayName;
                    }
                });
            });
            return;
        }

        if (step === 5) {
            const eventHint = wizardSettings.copyEvents
                ? t('dataTermMigrateEventsWillCopy').replace(
                      '{n}',
                      String(((getAppData() || {}).events || []).length)
                  )
                : t('dataTermMigrateEventsSkipped');
            const cards = createdCohortMap
                .map((row, idx) => {
                    const prevOpts = (row.previousClassOptions || [])
                        .map((c) => {
                            const sel = row.previousClassId === c.id ? ' selected' : '';
                            return `<option value="${escapeHtml(c.id)}"${sel}>${escapeHtml(c.name)}</option>`;
                        })
                        .join('');
                    const tracks = listSubjectTracksForRow(row);
                    const trackOpts = tracks
                        .map((tr) => {
                            const sel = row.subjectTrack === tr ? ' selected' : '';
                            return `<option value="${escapeHtml(tr)}"${sel}>${escapeHtml(tr)}</option>`;
                        })
                        .join('');
                    const teachOn = row.iTeachHere;
                    return `<div class="form-group term-migrate-teach-card" data-idx="${idx}">
                      <h3 class="form-section-title">${escapeHtml(row.cohortName)}</h3>
                      <p class="section-hint">${escapeHtml(row.levelPreset || '—')} · ${escapeHtml(row.schedulePattern || '')}</p>
                      <label class="checkbox-label selection-chip">
                        <input type="checkbox" id="termMigrateTeach_${idx}" ${teachOn ? 'checked' : ''} data-teach-idx="${idx}" />
                        <span>${escapeHtml(t('dataTermMigrateITeachHere'))}</span>
                      </label>
                      <div id="termMigrateTeachDetail_${idx}" ${teachOn ? '' : 'hidden'}>
                        <div class="form-row">
                          <label class="checkbox-label selection-chip">
                            <input type="radio" name="termMigrateMode_${idx}" id="termMigrateModeCarry_${idx}" value="carry"
                              ${row.classMode !== 'new' ? 'checked' : ''} ${prevOpts ? '' : 'disabled'} />
                            <span>${escapeHtml(t('dataTermMigrateCarryForward'))}</span>
                          </label>
                          <label class="checkbox-label selection-chip">
                            <input type="radio" name="termMigrateMode_${idx}" id="termMigrateModeNew_${idx}" value="new"
                              ${row.classMode === 'new' || !prevOpts ? 'checked' : ''} />
                            <span>${escapeHtml(t('dataTermMigrateBuildNew'))}</span>
                          </label>
                        </div>
                        <label class="form-group" for="termMigratePrevClass_${idx}">
                          <span>${escapeHtml(t('dataTermMigratePrevClass'))}</span>
                          <select id="termMigratePrevClass_${idx}" class="field-select field-control" ${prevOpts ? '' : 'disabled'}>
                            ${prevOpts || `<option value="">${escapeHtml(t('dataTermMigrateNoPrevClass'))}</option>`}
                          </select>
                        </label>
                        <label class="form-group" for="termMigrateTrack_${idx}">
                          <span>${escapeHtml(t('dataTermMigrateSubjectTrack'))}</span>
                          <select id="termMigrateTrack_${idx}" class="field-select field-control">
                            <option value="">${escapeHtml(t('dataTermMigratePickTrack'))}</option>
                            ${trackOpts}
                          </select>
                        </label>
                        <div class="form-row">
                          <label class="form-group" for="termMigratePeriod_${idx}">
                            <span>${escapeHtml(t('dataTermMigrateColPeriod'))}</span>
                            <select id="termMigratePeriod_${idx}" class="field-select field-control">
                              <option value="">—</option>
                              ${periodOptionsHtml(row.period)}
                            </select>
                          </label>
                          <label class="form-group" for="termMigrateStart_${idx}">
                            <span>${escapeHtml(t('dataTermMigrateStartDate'))}</span>
                            <input type="date" id="termMigrateStart_${idx}" class="field-input field-control" value="${escapeHtml(row.startDate || '')}" />
                          </label>
                          <label class="form-group" for="termMigrateEnd_${idx}">
                            <span>${escapeHtml(t('dataTermMigrateEndDate'))}</span>
                            <input type="date" id="termMigrateEnd_${idx}" class="field-input field-control" value="${escapeHtml(row.endDate || '')}" />
                          </label>
                        </div>
                      </div>
                    </div>`;
                })
                .join('');
            body.innerHTML = `
                <p class="section-hint">${escapeHtml(t('dataTermMigrateStep5Hint'))}</p>
                <p class="section-hint">${escapeHtml(eventHint)}</p>
                <div class="term-migrate-teach-list">${cards}</div>
            `;
            body.querySelectorAll('input[data-teach-idx]').forEach((cb) => {
                cb.addEventListener('change', () => {
                    const idx = Number(cb.getAttribute('data-teach-idx'));
                    const detail = document.getElementById(`termMigrateTeachDetail_${idx}`);
                    if (detail) {
                        detail.hidden = !cb.checked;
                    }
                    if (createdCohortMap[idx]) {
                        createdCohortMap[idx].iTeachHere = cb.checked;
                        if (cb.checked && !createdCohortMap[idx].classMode) {
                            createdCohortMap[idx].classMode = createdCohortMap[idx]
                                .previousClassOptions?.length
                                ? 'carry'
                                : 'new';
                        }
                    }
                });
            });
            return;
        }

        if (step === 6) {
            const teachCount = createdCohortMap.filter((r) => r.iTeachHere).length;
            const carryCount = createdCohortMap.filter(
                (r) => r.iTeachHere && r.classMode === 'carry'
            ).length;
            const newCount = createdCohortMap.filter(
                (r) => r.iTeachHere && r.classMode === 'new'
            ).length;
            const hrFilled = createdCohortMap.filter(
                (r) => r.homeroomTeacherUserId || r.homeroomTeacherName
            ).length;
            const appData = getAppData() || {};
            const monthShift = Number(wizardSettings.monthShift) || 0;
            const termStart = appData.termStart ? shiftIso(appData.termStart, monthShift) : '—';
            const termEnd = appData.termEnd ? shiftIso(appData.termEnd, monthShift) : '—';
            const eventCount = wizardSettings.copyEvents
                ? (appData.events || []).length
                : 0;
            body.innerHTML = `
                <p class="section-hint">${escapeHtml(t('dataTermMigrateStep6Hint'))}</p>
                <ul class="section-hint">
                  <li>${escapeHtml(t('dataTermMigrateReviewClasses').replace('{n}', String(createdCohortMap.length)))}</li>
                  <li>${escapeHtml(t('dataTermMigrateReviewMoves').replace('{n}', String(selectedMoves.size)))}</li>
                  <li>${escapeHtml(t('dataTermMigrateReviewAdds').replace('{n}', String(selectedAdds.size)))}</li>
                  <li>${escapeHtml(t('dataTermMigrateReviewHomeroom').replace('{n}', String(hrFilled)))}</li>
                  <li>${escapeHtml(
                      t('dataTermMigrateReviewMyClasses')
                          .replace('{n}', String(teachCount))
                          .replace('{carry}', String(carryCount))
                          .replace('{new}', String(newCount))
                  )}</li>
                  <li>${escapeHtml(t('dataTermMigrateReviewTerm').replace('{start}', termStart).replace('{end}', termEnd))}</li>
                  <li>${escapeHtml(t('dataTermMigrateReviewEvents').replace('{n}', String(eventCount)))}</li>
                </ul>
            `;
        }
    }

    function collectUnclearMoves() {
        const unclear = (transferPlan && transferPlan.unclear) || [];
        const moves = [];
        unclear.forEach((u, i) => {
            const key = `u${i}`;
            const studentId = unclearResolutions.get(key);
            if (!studentId || !u) {
                return;
            }
            const cand = (u.candidates || []).find((c) => c.studentId === studentId);
            if (!cand) {
                return;
            }
            moves.push({
                action: 'move',
                studentId,
                name: cand.name,
                nameEn: u.tmsNameEn || cand.nameEn || '',
                tmsName: u.tmsName,
                tmsMpidx: u.tmsMpidx || '',
                fromCohortId: cand.fromCohortId,
                fromCohortName: cand.fromCohortName,
                toCohortId: u.toCohortId,
                toCohortName: u.toCohortName,
                previousLevel: cand.previousLevel,
                nextLevel: '',
                matchedBy: 'unclear',
                student: cand
            });
        });
        return moves;
    }

    async function goNext() {
        if (scrapeLoading) {
            return;
        }
        if (step === 1) {
            const nameInput = document.getElementById('termMigrateNameInput');
            const trimmed = nameInput ? nameInput.value.trim() : '';
            if (!trimmed) {
                setStatus(t('dataTermCloneNameRequired'), true);
                return;
            }
            const user = document.getElementById('termMigrateTmsUser');
            const pass = document.getElementById('termMigrateTmsPass');
            const shiftInput = document.getElementById('termMigrateMonthShift');
            const clearCb = document.getElementById('termMigrateClearClassroom');
            const copyEv = document.getElementById('termMigrateCopyEvents');
            wizardSettings = {
                newName: trimmed,
                monthShift: shiftInput ? Number(shiftInput.value) || 0 : 3,
                clearClassroom: clearCb ? clearCb.checked : true,
                copyEvents: copyEv ? copyEv.checked : true,
                tmsUser: user ? user.value : '',
                tmsPass: pass ? pass.value : ''
            };
            scrapeLoading = true;
            setStatus(t('dataTermMigrateScraping'), false);
            try {
                previousSnapshot = snapshotPreviousStudents(getAppData());
                const result = await scrapeTmsRosters(
                    wizardSettings.tmsUser,
                    wizardSettings.tmsPass
                );
                scrapedCohorts = Array.isArray(result.cohorts) ? result.cohorts : [];
                if (!scrapedCohorts.length) {
                    setStatus(t('dataTermMigrateNoClasses'), true);
                    scrapeLoading = false;
                    return;
                }
                const specs = buildCohortCreateSpecs(scrapedCohorts, getAppData());
                createdCohortMap = specs.map((spec, i) =>
                    Object.assign({}, spec, {
                        cohortId: `migrate_tmp_${i}_${spec.tmsClassId || i}`
                    })
                );
                step = 2;
                setStatus(
                    t('dataTermMigrateScrapeDone').replace(
                        '{n}',
                        String(createdCohortMap.length)
                    ),
                    false
                );
                renderStep();
            } catch (err) {
                setStatus(
                    t('dataTermMigrateScrapeFailed') +
                        ': ' +
                        (err && err.message ? err.message : String(err)),
                    true
                );
            } finally {
                scrapeLoading = false;
            }
            return;
        }

        if (step === 2) {
            flushStep2Levels();
            step = 3;
            renderStep();
            return;
        }

        if (step === 3) {
            step = 4;
            renderStep();
            return;
        }

        if (step === 4) {
            flushStep4Homeroom();
            applyTeachingDefaults();
            step = 5;
            renderStep();
            return;
        }

        if (step === 5) {
            flushStep5Teaching();
            step = 6;
            renderStep();
            return;
        }

        if (step === 6) {
            await submitMigrate();
        }
    }

    function goBack() {
        if (step <= 1) {
            return;
        }
        if (step === 5) {
            flushStep5Teaching();
        }
        if (step === 4) {
            flushStep4Homeroom();
        }
        if (step === 3) {
            flushStep2Levels();
        }
        step -= 1;
        renderStep();
    }

    function newEntityId(prefix) {
        if (global.CCPUtils && global.CCPUtils.newId) {
            return global.CCPUtils.newId(prefix);
        }
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function buildUserClassForCohort(spec, newCohort, sourceAppData) {
        const d = domain();
        const uid = currentUserId();
        const monthShift = Number(wizardSettings.monthShift) || 0;
        if (!spec.iTeachHere || !newCohort) {
            return null;
        }
        if (spec.classMode === 'carry' && spec.previousClassId && d && d.carryForwardClassForTerm) {
            const prev = ((sourceAppData && sourceAppData.classes) || []).find(
                (c) => c && c.id === spec.previousClassId
            );
            if (prev) {
                return d.carryForwardClassForTerm(prev, newCohort, monthShift, uid, {
                    shiftIsoDate: shiftIso,
                    newClassId: () => newEntityId('cls'),
                    teacherName: currentUserDisplayName(),
                    startDate: spec.startDate || '',
                    endDate: spec.endDate || '',
                    period: spec.period
                });
            }
        }
        if (hooks && hooks.generateSingleClassForCohort) {
            return hooks.generateSingleClassForCohort(newCohort, spec.subjectTrack || '', {
                period: spec.period,
                startDate: spec.startDate,
                endDate: spec.endDate,
                userId: uid,
                teacherName: currentUserDisplayName()
            });
        }
        // Minimal fallback class when hooks are missing.
        const track = spec.subjectTrack || 'class';
        return {
            id: newEntityId('cls'),
            name: `${newCohort.name} · ${track}`,
            levelPreset: newCohort.levelPreset || '',
            level: newCohort.levelPreset || '',
            meetingDays: (newCohort.meetingDays || []).slice(),
            period: spec.period != null ? Number(spec.period) : undefined,
            cohortId: newCohort.id,
            cohortIds: [newCohort.id],
            scheduleBlock: newCohort.scheduleBlock || 'primary',
            startDate: spec.startDate || '',
            endDate: spec.endDate || '',
            classTeachers: uid
                ? [
                      {
                          id: newEntityId('ct'),
                          userId: uid,
                          name: currentUserDisplayName(),
                          category: ''
                      }
                  ]
                : [],
            assignedTeacherUserId: uid,
            assignedTeacherName: currentUserDisplayName(),
            generatedFromCohort: true,
            syllabusRows: []
        };
    }

    async function submitMigrate() {
        const appData = getAppData();
        if (!appData || typeof global.CCPTermCloneWizard === 'undefined') {
            setStatus(t('classroomModuleMissing') || 'Module missing', true);
            return;
        }
        const trimmed = wizardSettings.newName || '';
        if (!trimmed) {
            setStatus(t('dataTermCloneNameRequired'), true);
            return;
        }
        flushStep5Teaching();
        flushStep4Homeroom();
        rebuildTransferPlan();

        const monthShift = Number(wizardSettings.monthShift) || 0;
        const clearClassroom = wizardSettings.clearClassroom !== false;
        const sourceSnapshot = JSON.parse(JSON.stringify(appData));

        const cloned = global.CCPTermCloneWizard.buildClonedCalendarData(appData, {
            newName: trimmed,
            monthShift,
            clearClassroom
        });

        cloned.classes = [];
        if (wizardSettings.copyEvents && domain() && domain().shiftCalendarEvents) {
            cloned.events = domain().shiftCalendarEvents(sourceSnapshot.events || [], monthShift, {
                shiftIsoDate: shiftIso,
                newEventId: () => newEntityId('evt')
            });
        } else if (wizardSettings.copyEvents && Array.isArray(sourceSnapshot.events)) {
            cloned.events = sourceSnapshot.events.map((ev) => {
                const copy = JSON.parse(JSON.stringify(ev));
                copy.id = newEntityId('evt');
                if (copy.date) {
                    copy.date = shiftIso(copy.date, monthShift);
                }
                if (copy.startDate) {
                    copy.startDate = shiftIso(copy.startDate, monthShift);
                }
                if (copy.endDate) {
                    copy.endDate = shiftIso(copy.endDate, monthShift);
                }
                return copy;
            });
        } else {
            cloned.events = [];
        }
        cloned.tmsEssayLinks = {};
        if (clearClassroom) {
            cloned.attendanceSessions = [];
            cloned.homeworkCompletions = [];
            cloned.essaySubmissions = [];
            cloned.studentPoints = [];
            cloned.studentTests = [];
            cloned.dayNotes = [];
        }

        const oldCohorts = Array.isArray(cloned.cohorts) ? cloned.cohorts.slice() : [];
        const archive = oldCohorts.find(
            (c) => c && (c.id === 'cohort-student-archive' || c.isArchiveCohort)
        );

        const newCohorts = [];
        const idRemap = new Map();
        createdCohortMap.forEach((spec) => {
            const realId = newEntityId('coh');
            idRemap.set(spec.cohortId, realId);
            newCohorts.push({
                id: realId,
                name: spec.cohortName,
                level: spec.levelPreset || '',
                levelPreset: spec.levelPreset || '',
                grade: '',
                schedulePattern: spec.schedulePattern,
                meetingDays: (spec.meetingDays || []).slice(),
                periodCount: 0,
                scheduleBlock: 'primary',
                subjectSlots: [],
                classIds: [],
                students: [],
                homeroomTeacherUserId: spec.homeroomTeacherUserId || '',
                homeroomTeacherName: spec.homeroomTeacherName || '',
                homeroomDaySuffix: spec.homeroomDaySuffix || '',
                tmsBlockStart: spec.tmsBlockStart || '',
                tmsBlockEnd: spec.tmsBlockEnd || '',
                tmsSuggestedPeriod:
                    spec.tmsSuggestedPeriod != null ? spec.tmsSuggestedPeriod : null,
                tmsSuggestedTimeSlotId: spec.tmsSuggestedTimeSlotId || ''
            });
        });

        const workingCohorts = oldCohorts
            .filter((c) => c && !(c.id === 'cohort-student-archive' || c.isArchiveCohort))
            .concat(newCohorts);
        if (archive) {
            workingCohorts.push(archive);
        }

        const d = domain();
        const moves = [];
        (transferPlan.moves || []).forEach((m, i) => {
            if (!selectedMoves.has(`m${i}`)) {
                return;
            }
            moves.push(
                Object.assign({}, m, {
                    toCohortId: idRemap.get(m.toCohortId) || m.toCohortId
                })
            );
        });
        collectUnclearMoves().forEach((m) => {
            moves.push(
                Object.assign({}, m, {
                    toCohortId: idRemap.get(m.toCohortId) || m.toCohortId
                })
            );
        });
        const adds = [];
        (transferPlan.adds || []).forEach((a, i) => {
            if (!selectedAdds.has(`a${i}`)) {
                return;
            }
            adds.push(
                Object.assign({}, a, {
                    toCohortId: idRemap.get(a.toCohortId) || a.toCohortId
                })
            );
        });

        let cohortsAfter = workingCohorts;
        if (d && d.applyTermMigrateTransferPlan) {
            const applied = d.applyTermMigrateTransferPlan(
                workingCohorts,
                { moves, adds },
                { newStudentId: () => newEntityId('stu') }
            );
            cohortsAfter = applied.cohorts;
        }

        const keepIds = new Set(newCohorts.map((c) => c.id));
        if (archive) {
            keepIds.add(archive.id);
        }
        const unmatched = (transferPlan.unmatchedPrevious || []).filter((u) => u && u.studentId);
        let finalCohorts = cohortsAfter.filter((c) => c && keepIds.has(c.id));
        if (archive && unmatched.length && d && d.moveStudentsBetweenCohorts) {
            let list = cohortsAfter.slice();
            unmatched.forEach((u) => {
                const result = d.moveStudentsBetweenCohorts(
                    list,
                    u.fromCohortId,
                    archive.id,
                    [u.studentId]
                );
                if (!result.error) {
                    list = result.cohorts;
                }
            });
            finalCohorts = list.filter((c) => c && keepIds.has(c.id));
        }

        cloned.cohorts = finalCohorts;

        const links = {};
        createdCohortMap.forEach((spec) => {
            const realId = idRemap.get(spec.cohortId);
            if (!realId) {
                return;
            }
            const key = spec.tmsClassId
                ? `id:${spec.tmsClassId}`
                : String(spec.cohortName || '')
                      .toLowerCase()
                      .replace(/\s+/g, '');
            if (!key) {
                return;
            }
            links[key] = {
                action: 'map',
                cohortId: realId,
                tmsClassName: spec.rawName || spec.cohortName,
                tmsClassId: spec.tmsClassId || ''
            };
        });
        cloned.tmsRosterLinks = Object.assign({}, cloned.tmsRosterLinks || {}, links);

        const builtClasses = [];
        createdCohortMap.forEach((spec) => {
            const realId = idRemap.get(spec.cohortId);
            const cohort = finalCohorts.find((c) => c && c.id === realId);
            if (!cohort || !spec.iTeachHere) {
                return;
            }
            const cls = buildUserClassForCohort(spec, cohort, sourceSnapshot);
            if (cls) {
                builtClasses.push(cls);
                if (!Array.isArray(cohort.classIds)) {
                    cohort.classIds = [];
                }
                if (!cohort.classIds.includes(cls.id)) {
                    cohort.classIds.push(cls.id);
                }
            }
        });
        cloned.classes = builtClasses;

        try {
            if (
                hooks &&
                hooks.teamSyncEnabled &&
                typeof global.CalendarSync !== 'undefined' &&
                global.CalendarSync.createCalendar
            ) {
                const payload = JSON.parse(JSON.stringify(cloned));
                if (payload.ui) {
                    delete payload.ui;
                }
                await global.CalendarSync.createCalendar(payload, trimmed);
                setStatus(t('dataTermMigrateDone').replace('{name}', trimmed), false);
            } else if (hooks && hooks.applyLoadedAppData) {
                hooks.applyLoadedAppData(cloned);
                setStatus(t('dataTermMigrateLocalDone'), false);
            } else {
                setStatus(t('dataTermMigrateFailed') + ': no save path', true);
                return;
            }
            if (hooks && hooks.showMessage) {
                hooks.showMessage(t('dataTermMigrateDone').replace('{name}', trimmed), false);
            }
            closeModal();
        } catch (err) {
            setStatus(
                t('dataTermMigrateFailed') +
                    ': ' +
                    (err && err.message ? err.message : String(err)),
                true
            );
        }
    }

    function closeModal() {
        const modal = ensureModal();
        if (modal) {
            modal.style.display = 'none';
        }
        step = 1;
        scrapedCohorts = [];
        createdCohortMap = [];
        transferPlan = null;
        unclearResolutions = new Map();
        setStatus('', false);
    }

    function openModal() {
        const modal = ensureModal();
        if (!modal) {
            if (hooks && hooks.showMessage) {
                hooks.showMessage(t('classroomModuleMissing') || 'Missing modal', true);
            }
            return;
        }
        step = 1;
        previousSnapshot = null;
        scrapedCohorts = [];
        createdCohortMap = [];
        transferPlan = null;
        unclearResolutions = new Map();
        modal.style.display = 'flex';
        renderStep();
        setStatus('', false);
    }

    function bindModalChrome() {
        const modal = ensureModal();
        if (!modal || modal.dataset.bound === '1') {
            return;
        }
        modal.dataset.bound = '1';
        document.getElementById('termMigrateModalClose')?.addEventListener('click', closeModal);
        document.getElementById('termMigrateCancelBtn')?.addEventListener('click', closeModal);
        document.getElementById('termMigrateBackBtn')?.addEventListener('click', goBack);
        document.getElementById('termMigrateNextBtn')?.addEventListener('click', () => {
            void goNext();
        });
    }

    function init(nextHooks) {
        hooks = nextHooks || hooks;
        bindModalChrome();
        const btn = document.getElementById('dataTermMigrateBtn');
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => openModal());
        }
    }

    global.CCPTermMigrateWizard = {
        init,
        open: openModal,
        buildCohortCreateSpecs,
        mapScheduleForApp,
        scrapeTmsRosters,
        buildTermMigrateTransferPlan: (...args) => {
            const d = domain();
            return d && d.buildTermMigrateTransferPlan
                ? d.buildTermMigrateTransferPlan(...args)
                : { moves: [], adds: [], unmatchedPrevious: [], unclear: [] };
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
