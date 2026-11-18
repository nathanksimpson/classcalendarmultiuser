/**
 * Migrate to next term — Data zone wizard (TMS cohorts + CCMU student continuity +
 * homeroom + per-cohort teaching decisions for the logged-in teacher).
 */
(function (global) {
    /** Class/cohort name with its level in the UI language (display only). */
    function displayName(name) {
        const lp = global.CCPLevelProfile;
        return lp && lp.localizeClassName ? lp.localizeClassName(name) : name == null ? '' : String(name);
    }

    let hooks = null;
    let modalEl = null;
    let step = 1;
    let previousSnapshot = null;
    let scrapedCohorts = [];
    /** Full unfiltered scrape result */
    let scrapedCohortsAll = [];
    /** @type {Set<string>} TMS class ids excluded on step 2 */
    let excludedTmsClassIds = new Set();
    /** @type {Array<{ code: string, count: number, kind: string }>} */
    let discoveredTermCodes = [];
    let createdCohortMap = [];
    let transferPlan = null;
    let selectedMoves = new Set();
    let selectedAdds = new Set();
    /** @type {Map<string, string>} unclearKey → chosen previous studentId */
    let unclearResolutions = new Map();
    /** @type {Map<string, string>} addKey → previous studentId */
    let manualAddLinks = new Map();
    /** @type {Map<string, string>} studentId → toCohortId */
    let manualUnmatchedMoves = new Map();
    /** @type {Set<string>} */
    let manualUnmatchedInclude = new Set();
    let transferPlanSourceKey = '';
    /** @type {File[]} */
    let pendingTimetableFiles = [];
    /** Every teacher's TMS timetable (teacher_time.aspx), pulled with the roster; null when it could not be read. */
    let scrapedSchedule = null;
    let scheduleNote = '';
    /** Classes step: the preview's picks reader, and the picks once the step is left. */
    let classPreview = null;
    let classPicks = null;
    let scrapeLoading = false;
    let wizardSettings = {
        newName: '',
        monthShift: 3,
        clearClassroom: true,
        copyEvents: true,
        tmsUser: '',
        tmsPass: '',
        termCodeFilter: ''
    };

    function tmsNameApi() {
        return global.CCPTmsClassName || null;
    }

    function cohortScrapeKey(c) {
        if (!c) {
            return '';
        }
        const id = String(c.tmsClassId || '').trim();
        if (id) {
            return `id:${id}`;
        }
        return `name:${String(c.cohortName || '')
            .toLowerCase()
            .replace(/\s+/g, '')}`;
    }

    function refreshDiscoveredTermCodes() {
        const api = tmsNameApi();
        if (!api || !api.listTermCodesFromNames) {
            discoveredTermCodes = [];
            return;
        }
        const names = (scrapedCohortsAll || []).map((c) => c && c.cohortName).filter(Boolean);
        discoveredTermCodes = api.listTermCodesFromNames(names);
    }

    function getFilteredScrapedCohorts() {
        const api = tmsNameApi();
        const filter = String(wizardSettings.termCodeFilter || '').trim();
        return (scrapedCohortsAll || []).filter((c) => {
            if (!c) {
                return false;
            }
            const key = cohortScrapeKey(c);
            if (excludedTmsClassIds.has(key)) {
                return false;
            }
            if (filter && api && api.cohortMatchesTermFilter) {
                return api.cohortMatchesTermFilter(c.cohortName, filter);
            }
            return true;
        });
    }

    function rebuildCohortMapFromScrapeFilter() {
        scrapedCohorts = getFilteredScrapedCohorts();
        const specs = buildCohortCreateSpecs(scrapedCohorts, getAppData());
        createdCohortMap = specs.map((spec, i) =>
            Object.assign({}, spec, {
                cohortId: `migrate_tmp_${i}_${spec.tmsClassId || i}`
            })
        );
        transferPlanSourceKey = '';
        transferPlan = null;
    }

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
        const api = tmsNameApi();
        if (api && api.parseTmsClassNameMeta) {
            const meta = api.parseTmsClassNameMeta(name);
            if (meta.baseName) {
                return meta.baseName;
            }
        }
        const stripped = String(name || '')
            .replace(/^\[[^\]]+\]\s*/u, '')
            .replace(/\s+/g, ' ')
            .trim();
        return (stripped.split('^')[0] || stripped).trim();
    }

    function inferScheduleFromName(name) {
        const api = tmsNameApi();
        if (api && api.parseTmsClassNameMeta) {
            const meta = api.parseTmsClassNameMeta(name);
            if (meta.schedulePattern) {
                return {
                    schedulePattern: meta.schedulePattern,
                    meetingDays: meta.meetingDays.slice()
                };
            }
        }
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
        if (global.CCPTmsSyncCenter && global.CCPTmsSyncCenter.open) {
            const session = await global.CCPTmsSyncCenter.open({
                kinds: ['roster'],
                scope: { source: 'term-migrate' },
                credentials: {
                    username: String(username || '').trim(),
                    password: String(password || '')
                }
            });
            const loaded = session && session.results && session.results.roster;
            if (loaded && Array.isArray(loaded.cohorts)) {
                return loaded;
            }
            if (loaded && loaded.cohorts) {
                return loaded;
            }
            const err = new Error('TMS roster was not loaded');
            err.code = 'TMS_SYNC_CANCELLED';
            throw err;
        }
        if (!global.CCPTmsSync || !global.CCPTmsSync.run) {
            throw new Error('TMS sync is not available');
        }
        return global.CCPTmsSync.run('roster', {
            username: String(username || '').trim(),
            password: String(password || '')
        });
    }

    /** Every teacher's timetable from TMS with the same sign-in (reuses a pull from the last hour). */
    async function scrapeTmsSchedule(username, password) {
        const last = global.CCPLastTmsSchedulePull;
        if (last && last.body && Array.isArray(last.body.placements) && Date.now() - last.at < 60 * 60 * 1000) {
            return last.body;
        }
        if (!global.CCPTmsSync || !global.CCPTmsSync.run) {
            throw new Error('TMS sync is not available');
        }
        const payload = {};
        if (String(username || '').trim() || password) {
            payload.username = String(username || '').trim();
            payload.password = String(password || '');
        }
        const body = await global.CCPTmsSync.run('schedule', payload);
        if (!body || !Array.isArray(body.placements)) {
            throw new Error('TMS timetables were not loaded');
        }
        global.CCPLastTmsSchedulePull = { at: Date.now(), body };
        return body;
    }

    const DOW_BY_NAME = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };

    /**
     * TMS classes that are on a teacher's timetable but not in the roster scrape: they become cohorts too
     * (no students yet), so the term has every class TMS schedules.
     */
    function scheduleOnlyCohorts(rosterCohorts, schedule) {
        const key = (raw) => cleanTmsCohortName(raw).replace(/\s+/g, '').toLowerCase();
        const known = new Set((rosterCohorts || []).map((c) => key(c.cohortName)));
        const byKey = new Map();
        ((schedule && schedule.placements) || []).forEach((p) => {
            const raw = String(p.cohortName != null ? p.cohortName : p.cohort || '').trim();
            // Real TMS classes carry a term code; test entries do not.
            if (!raw || !/\^\d{4}\s*$/.test(raw) || /test|테스트/i.test(raw)) {
                return;
            }
            const k = key(raw);
            if (!k || known.has(k)) {
                return;
            }
            if (!byKey.has(k)) {
                byKey.set(k, { cohortName: raw, tmsClassId: '', students: [], fromSchedule: true, scheduleDays: [] });
            }
            const dow = DOW_BY_NAME[String(p.day || '').toLowerCase()];
            const entry = byKey.get(k);
            if (dow && !entry.scheduleDays.includes(dow)) {
                entry.scheduleDays.push(dow);
            }
        });
        return Array.from(byKey.values());
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
        const d = domain();
        if (!d || !d.matchHomeroomTeacherByName) {
            const name = String(tmsName || '').trim();
            return { userId: '', name: name };
        }
        return d.matchHomeroomTeacherByName(tmsName, hooks.listTeachers ? hooks.listTeachers() : []);
    }

    /**
     * Pure helper: build create specs from scrape + app timetable + previous cohort match.
     */
    function buildCohortCreateSpecs(tmsCohorts, appData) {
        const d = domain();
        const api = tmsNameApi();
        const previous = (appData && appData.cohorts) || [];
        const links = (appData && appData.tmsRosterLinks) || {};
        return (Array.isArray(tmsCohorts) ? tmsCohorts : []).map((c) => {
            let sched = inferScheduleFromName(c.cohortName);
            // A cohort found only on the timetables: its days come from there when the name says nothing.
            if (Array.isArray(c.scheduleDays) && c.scheduleDays.length && !/[MT]\s*(\^|$)/.test(String(c.cohortName || ''))) {
                const days = c.scheduleDays.slice().sort((a, b) => a - b);
                sched = { schedulePattern: days.every((d) => d === 2 || d === 4) ? 'tth' : 'mwf', meetingDays: days };
            }
            const mapped = mapScheduleForApp(c.schedule, appData);
            const match =
                d && d.matchPreviousCohortForTmsClass
                    ? d.matchPreviousCohortForTmsClass(previous, links, c.tmsClassId, c.cohortName)
                    : { cohort: null, matchedBy: '' };
            const prev = match.cohort;
            // Level: last term's matching cohort, else the TMS name ("빅키T", "Blue M").
            const lp = global.CCPLevelProfile;
            const parsed = lp && lp.parseClassName ? lp.parseClassName(c.cohortName) : null;
            const levelPreset =
                (prev && (prev.levelPreset || prev.level)) || (parsed ? parsed.levelId : '') || '';
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
                tmsTermCode:
                    api && api.parseTmsClassNameMeta
                        ? api.parseTmsClassNameMeta(c.cohortName).termCode || ''
                        : '',
                students: Array.isArray(c.students) ? c.students.slice() : [],
                schedulePattern: sched.schedulePattern,
                meetingDays: sched.meetingDays.slice(),
                schedule: c.schedule || null,
                tmsBlockStart: mapped && mapped.start ? mapped.start : '',
                tmsBlockEnd: mapped && mapped.end ? mapped.end : '',
                tmsSuggestedPeriod: mapped && mapped.period != null ? mapped.period : null,
                tmsSuggestedTimeSlotId: mapped && mapped.timeSlotId ? mapped.timeSlotId : '',
                tmsHomeroomName: c.tmsHomeroomName || '',
                fromSchedule: c.fromSchedule === true,
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

    function rebuildTransferPlan(options) {
        const opts = options || {};
        const d = domain();
        const fingerprint = createdCohortMap
            .map(
                (r) =>
                    `${r.cohortId}|${r.levelPreset || ''}|${r.matchedPreviousCohortId || ''}`
            )
            .join('||');
        const preserveSelections =
            !opts.force && transferPlan && transferPlanSourceKey === fingerprint;

        if (!d || !d.buildTermMigrateTransferPlan) {
            transferPlan = { moves: [], adds: [], unmatchedPrevious: [], unclear: [] };
            transferPlanSourceKey = fingerprint;
            if (!preserveSelections) {
                selectedMoves = new Set();
                selectedAdds = new Set();
            }
            return;
        }
        const targets = createdCohortMap.map((row) => ({
            cohortId: row.cohortId,
            cohortName: row.cohortName,
            levelPreset: row.levelPreset || '',
            students: row.students || []
        }));
        transferPlan = d.buildTermMigrateTransferPlan(previousSnapshot || [], targets);
        transferPlanSourceKey = fingerprint;
        if (!preserveSelections) {
            selectedMoves = new Set((transferPlan.moves || []).map((_, i) => `m${i}`));
            selectedAdds = new Set((transferPlan.adds || []).map((_, i) => `a${i}`));
            manualAddLinks = new Map();
            manualUnmatchedMoves = new Map();
            manualUnmatchedInclude = new Set();
            unclearResolutions = new Map();
        }
    }

    function listPreviousCohortsForPicker() {
        const snap = previousSnapshot || [];
        const d = domain();
        return snap.filter((c) => {
            if (!c) {
                return false;
            }
            if (d && typeof d.isArchiveCohort === 'function' && d.isArchiveCohort(c)) {
                return false;
            }
            return c.id !== 'cohort-student-archive' && !c.isArchiveCohort;
        });
    }

    function applyPreviousCohortLink(row, prevCohortId) {
        const prev = listPreviousCohortsForPicker().find((c) => c.id === prevCohortId);
        row.matchedPreviousCohortId = prev ? prev.id : '';
        if (prev) {
            if (!row.levelPreset) {
                row.levelPreset = String(prev.levelPreset || prev.level || '');
            }
            if (!row.homeroomTeacherUserId && !row.homeroomTeacherName) {
                row.homeroomTeacherUserId = String(prev.homeroomTeacherUserId || '');
                row.homeroomTeacherName = String(prev.homeroomTeacherName || '');
                row.homeroomDaySuffix = String(prev.homeroomDaySuffix || '');
            }
        }
    }

    function getCommittedStudentIds() {
        const used = new Set();
        (transferPlan && transferPlan.moves ? transferPlan.moves : []).forEach((m, i) => {
            if (selectedMoves.has(`m${i}`) && m.studentId) {
                used.add(m.studentId);
            }
        });
        manualAddLinks.forEach((sid) => {
            if (sid) {
                used.add(sid);
            }
        });
        unclearResolutions.forEach((sid) => {
            if (sid) {
                used.add(sid);
            }
        });
        manualUnmatchedInclude.forEach((sid) => used.add(sid));
        return used;
    }

    function listLinkablePreviousStudents(ignoreStudentId) {
        const d = domain();
        const exclude = getCommittedStudentIds();
        if (ignoreStudentId) {
            exclude.delete(ignoreStudentId);
        }
        if (d && d.listAvailablePreviousStudentsForMigrate) {
            return d.listAvailablePreviousStudentsForMigrate(previousSnapshot || [], exclude);
        }
        return [];
    }

    function findPreviousStudentById(studentId) {
        const d = domain();
        if (d && d.listAvailablePreviousStudentsForMigrate) {
            return d
                .listAvailablePreviousStudentsForMigrate(previousSnapshot || [], [])
                .find((p) => p.studentId === studentId);
        }
        return null;
    }

    function previousStudentOptionsHtml(students, selectedId) {
        return students
            .map((p) => {
                const sel = selectedId === p.studentId ? ' selected' : '';
                const label = `${p.name}${p.fromCohortName ? ` (${p.fromCohortName})` : ''}`;
                return `<option value="${escapeHtml(p.studentId)}"${sel}>${escapeHtml(label)}</option>`;
            })
            .join('');
    }

    function listAllPreviousClassesForUser() {
        const d = domain();
        const appData = getAppData() || {};
        const uid = currentUserId();
        if (!d || !d.findPreviousClassesForUser) {
            return [];
        }
        const out = [];
        listPreviousCohortsForPicker().forEach((cohort) => {
            d.findPreviousClassesForUser(appData, cohort.id, uid).forEach((cls) => {
                out.push({
                    id: cls.id,
                    name: cls.name,
                    cohortName: cohort.name,
                    cohortId: cohort.id,
                    period: cls.period
                });
            });
        });
        return out;
    }

    function setModalActionsDisabled(disabled) {
        ['termMigrateNextBtn', 'termMigrateBackBtn', 'termMigrateCancelBtn', 'termMigrateModalClose'].forEach(
            (id) => {
                const el = document.getElementById(id);
                if (el) {
                    el.disabled = Boolean(disabled);
                }
            }
        );
    }

    function showScrapeProgress(msg) {
        const progress = document.getElementById('termMigrateScrapeProgress');
        const phase = document.getElementById('termMigrateScrapePhase');
        const status = document.getElementById('termMigrateStatus');
        const modalBody = document.getElementById('termMigrateModalBody');
        if (progress) {
            progress.hidden = false;
        }
        if (phase) {
            phase.textContent = msg || '';
        }
        if (status) {
            status.textContent = '';
        }
        if (modalBody) {
            modalBody.setAttribute('aria-busy', 'true');
        }
        setModalActionsDisabled(true);
    }

    function hideScrapeProgress() {
        const progress = document.getElementById('termMigrateScrapeProgress');
        const phase = document.getElementById('termMigrateScrapePhase');
        const modalBody = document.getElementById('termMigrateModalBody');
        if (progress) {
            progress.hidden = true;
        }
        if (phase) {
            phase.textContent = '';
        }
        if (modalBody) {
            modalBody.removeAttribute('aria-busy');
        }
        setModalActionsDisabled(false);
    }

    function preloadTimetableLibs() {
        const imp = global.CCPTimetableImport;
        if (imp && typeof imp.preloadImportLibraries === 'function') {
            imp.preloadImportLibraries().catch(() => {});
        }
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

    function flushStep2PrevCohort() {
        document.querySelectorAll('.term-migrate-prev-cohort').forEach((sel) => {
            const idx = Number(sel.getAttribute('data-idx'));
            if (createdCohortMap[idx]) {
                applyPreviousCohortLink(createdCohortMap[idx], sel.value || '');
            }
        });
    }

    function flushStep3Transfers() {
        document.querySelectorAll('input[data-move]').forEach((cb) => {
            const key = cb.getAttribute('data-move');
            if (cb.checked) {
                selectedMoves.add(key);
            } else {
                selectedMoves.delete(key);
            }
        });
        document.querySelectorAll('input[data-add]').forEach((cb) => {
            const key = cb.getAttribute('data-add');
            if (cb.checked) {
                selectedAdds.add(key);
            } else {
                selectedAdds.delete(key);
            }
        });
        document.querySelectorAll('select[data-unclear]').forEach((sel) => {
            const key = sel.getAttribute('data-unclear');
            if (sel.value) {
                unclearResolutions.set(key, sel.value);
            } else {
                unclearResolutions.delete(key);
            }
        });
        document.querySelectorAll('select[data-add-link]').forEach((sel) => {
            const key = sel.getAttribute('data-add-link');
            if (sel.value) {
                manualAddLinks.set(key, sel.value);
            } else {
                manualAddLinks.delete(key);
            }
        });
        document.querySelectorAll('select[data-unmatched-to]').forEach((sel) => {
            const sid = sel.getAttribute('data-unmatched-to');
            if (sel.value) {
                manualUnmatchedMoves.set(sid, sel.value);
            } else {
                manualUnmatchedMoves.delete(sid);
            }
        });
        document.querySelectorAll('input[data-unmatched-include]').forEach((cb) => {
            const sid = cb.getAttribute('data-unmatched-include');
            if (cb.checked && manualUnmatchedMoves.get(sid)) {
                manualUnmatchedInclude.add(sid);
            } else {
                manualUnmatchedInclude.delete(sid);
            }
        });
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

    /** Draft of the new calendar's cohorts, for the Classes preview (ids are the wizard's temporary ids). */
    function draftCalendarForClasses() {
        const appData = getAppData() || {};
        return {
            cohorts: createdCohortMap.map((spec) => ({
                id: spec.cohortId,
                name: spec.cohortName,
                level: spec.levelPreset || '',
                levelPreset: spec.levelPreset || '',
                schedulePattern: spec.schedulePattern,
                meetingDays: (spec.meetingDays || []).slice(),
                scheduleBlock: 'primary',
                subjectSlots: [],
                students: []
            })),
            classes: [],
            teacherProfiles: appData.teacherProfiles || [],
            timetableTimeSlots: appData.timetableTimeSlots,
            periodSlotMap: appData.periodSlotMap,
            tmsRosterLinks: {}
        };
    }

    function classBuilderHooks() {
        return {
            t,
            getLang: () => (hooks && hooks.getLang ? hooks.getLang() : 'en'),
            generateId: () => newEntityId('cls'),
            escapeHtml,
            getSimsonLevelById: (id) => (global.CCPLevelProfile ? global.CCPLevelProfile.getLevelById(id) : null)
        };
    }

    /** Step 5, Classes: every cohort's subjects from the TMS timetables (level schedule fallback), one preview. */
    function renderClassesStep(body) {
        const CM = global.CCPCohortManagement;
        if (!CM || !CM.planBatchGeneration || !CM.buildBatchPreviewNode || !CM.withAppData) {
            classPreview = null;
            body.innerHTML = `<p class="section-hint">${escapeHtml(t('dataTermMigrateClassesMissing'))}</p>`;
            return;
        }
        const draft = draftCalendarForClasses();
        const intro = scrapedSchedule
            ? t('dataTermMigrateClassesHint')
            : t('dataTermMigrateClassesNoSchedule').replace('{why}', scheduleNote || '—');
        let preview = null;
        CM.withAppData(draft, () => {
            const plans = CM.planBatchGeneration(draft.cohorts, scrapedSchedule, { term: wizardSettings.termCodeFilter || '' });
            preview = CM.buildBatchPreviewNode(plans, intro);
        }, classBuilderHooks());
        classPreview = preview;
        body.innerHTML = '';
        body.appendChild(preview.node);
        // Re-entering the step keeps earlier unticks and picks.
        if (classPicks) {
            const byCohort = new Map(classPicks.map((p) => [p.cohortId, p]));
            preview.node.querySelectorAll('.cohorts-generate-all-cohort').forEach((sec, i) => {
                const spec = createdCohortMap[i];
                const saved = spec ? byCohort.get(spec.cohortId) : null;
                const box = sec.querySelector('input[type=checkbox]');
                if (box && !saved && !box.disabled) {
                    box.checked = false;
                    box.dispatchEvent(new Event('change'));
                }
            });
        }
    }

    function flushStep5Classes() {
        if (!classPreview) {
            return;
        }
        classPicks = classPreview.getPicks().map((p) => ({ cohortId: p.cohort.id, rows: p.rows }));
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
            nextBtn.disabled = scrapeLoading;
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
                <form class="credential-form" autocomplete="on" onsubmit="return false">
                    <div class="form-row">
                        <label class="form-group" for="termMigrateTmsUser">
                            <span>${escapeHtml(t('rosterTmsUsernameLabel') || 'TMS username')}</span>
                            <input type="text" id="termMigrateTmsUser" class="field-input field-control" autocomplete="off" />
                        </label>
                        <label class="form-group" for="termMigrateTmsPass">
                            <span>${escapeHtml(t('rosterTmsPasswordLabel') || 'TMS password')}</span>
                            <input type="password" id="termMigrateTmsPass" class="field-input field-control" autocomplete="off" />
                        </label>
                    </div>
                </form>
                <label class="form-group" for="termMigrateTermCodeFilter">
                    <span>${escapeHtml(t('dataTermMigrateTermCodeLabel'))}</span>
                    <input type="text" id="termMigrateTermCodeFilter" class="field-input field-control" autocomplete="off" placeholder="2606" />
                </label>
                <p class="section-hint">${escapeHtml(t('dataTermMigrateTermCodeHint'))}</p>
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
            const termEl = document.getElementById('termMigrateTermCodeFilter');
            if (termEl) {
                termEl.value = wizardSettings.termCodeFilter || '';
            }
            return;
        }

        if (step === 2) {
            const prevCohorts = listPreviousCohortsForPicker();
            const codeOpts = discoveredTermCodes
                .map((row) => {
                    const sel =
                        wizardSettings.termCodeFilter === row.code ? ' selected' : '';
                    const label = t('dataTermMigrateTermCodeOption')
                        .replace('{code}', row.code)
                        .replace('{n}', String(row.count));
                    return `<option value="${escapeHtml(row.code)}"${sel}>${escapeHtml(label)}</option>`;
                })
                .join('');
            const totalScraped = (scrapedCohortsAll || []).length;
            const rows = createdCohortMap
                .map((row, idx) => {
                    const period =
                        row.tmsSuggestedPeriod != null ? `P${row.tmsSuggestedPeriod}` : '—';
                    const block =
                        row.tmsBlockStart && row.tmsBlockEnd
                            ? `${row.tmsBlockStart}–${row.tmsBlockEnd}`
                            : '—';
                    const prevOpts = prevCohorts
                        .map((c) => {
                            const sel =
                                row.matchedPreviousCohortId === c.id ? ' selected' : '';
                            return `<option value="${escapeHtml(c.id)}"${sel}>${escapeHtml(displayName(c.name || c.id))}</option>`;
                        })
                        .join('');
                    return `<tr>
                        <td>${escapeHtml(row.cohortName)}</td>
                        <td>${escapeHtml(row.rawName || row.cohortName)}</td>
                        <td>${escapeHtml(row.tmsTermCode || '—')}</td>
                        <td>${escapeHtml(row.schedulePattern || '')}</td>
                        <td>${escapeHtml(block)}</td>
                        <td>${escapeHtml(period)}</td>
                        <td>${(row.students || []).length}</td>
                        <td>
                          <input type="text" class="field-input field-control term-migrate-level" data-idx="${idx}"
                            value="${escapeHtml(row.levelPreset || '')}" placeholder="${escapeHtml(t('dataTermMigrateLevelPlaceholder'))}" />
                        </td>
                        <td>
                          <select class="field-select field-control term-migrate-prev-cohort" data-idx="${idx}">
                            <option value="">${escapeHtml(t('dataTermMigratePrevCohortNone'))}</option>
                            ${prevOpts}
                          </select>
                        </td>
                    </tr>`;
                })
                .join('');
            body.innerHTML = `
                <p class="section-hint">${escapeHtml(t('dataTermMigrateStep2Hint'))}</p>
                <p class="section-hint">${escapeHtml(
                    t('dataTermMigrateTermCodeSummary')
                        .replace('{shown}', String(createdCohortMap.length))
                        .replace('{total}', String(totalScraped))
                        .replace(
                            '{filter}',
                            wizardSettings.termCodeFilter
                                ? wizardSettings.termCodeFilter
                                : t('dataTermMigrateTermCodeAll')
                        )
                )}</p>
                ${
                    discoveredTermCodes.length
                        ? `<label class="form-group" for="termMigrateTermCodeSelect">
                    <span>${escapeHtml(t('dataTermMigrateTermCodePick'))}</span>
                    <select id="termMigrateTermCodeSelect" class="field-select field-control">
                      <option value="">${escapeHtml(t('dataTermMigrateTermCodeAll'))}</option>
                      ${codeOpts}
                    </select>
                  </label>`
                        : ''
                }
                <div class="classroom-sheet-panel">
                  <div class="classroom-sheet-scroll">
                    <table class="classroom-sheet">
                      <thead><tr>
                        <th>${escapeHtml(t('dataTermMigrateColClass'))}</th>
                        <th>${escapeHtml(t('dataTermMigrateColTmsRaw'))}</th>
                        <th>${escapeHtml(t('dataTermMigrateColTermCode'))}</th>
                        <th>${escapeHtml(t('dataTermMigrateColDays'))}</th>
                        <th>${escapeHtml(t('dataTermMigrateColBlock'))}</th>
                        <th>${escapeHtml(t('dataTermMigrateColPeriod'))}</th>
                        <th>${escapeHtml(t('dataTermMigrateColStudents'))}</th>
                        <th>${escapeHtml(t('level') || 'Level')}</th>
                        <th>${escapeHtml(t('dataTermMigrateColPrevCohort'))}</th>
                      </tr></thead>
                      <tbody>${rows || `<tr><td colspan="9">${escapeHtml(t('dataTermMigrateNoClasses'))}</td></tr>`}</tbody>
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
            body.querySelectorAll('.term-migrate-prev-cohort').forEach((sel) => {
                sel.addEventListener('change', () => {
                    const idx = Number(sel.getAttribute('data-idx'));
                    if (createdCohortMap[idx]) {
                        applyPreviousCohortLink(createdCohortMap[idx], sel.value || '');
                    }
                });
            });
            const termSel = document.getElementById('termMigrateTermCodeSelect');
            if (termSel) {
                termSel.addEventListener('change', () => {
                    flushStep2Levels();
                    flushStep2PrevCohort();
                    wizardSettings.termCodeFilter = termSel.value || '';
                    rebuildCohortMapFromScrapeFilter();
                    renderStep();
                });
            }
            return;
        }

        if (step === 3) {
            rebuildTransferPlan({ force: false });
            const moves = (transferPlan && transferPlan.moves) || [];
            const adds = (transferPlan && transferPlan.adds) || [];
            const unmatched = (transferPlan && transferPlan.unmatchedPrevious) || [];
            const unclear = (transferPlan && transferPlan.unclear) || [];
            const cohortTargets = createdCohortMap.map((r) => ({
                id: r.cohortId,
                name: r.cohortName
            }));
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
                    const linkable = listLinkablePreviousStudents(manualAddLinks.get(key) || '');
                    const linkOpts = previousStudentOptionsHtml(
                        linkable,
                        manualAddLinks.get(key) || ''
                    );
                    return `<tr>
                      <td><input type="checkbox" data-add="${key}" ${selectedAdds.has(key) ? 'checked' : ''} /></td>
                      <td>${escapeHtml(a.tmsName || a.name)}</td>
                      <td>—</td>
                      <td>${escapeHtml(a.toCohortName)}</td>
                      <td>
                        <select class="field-select field-control" data-add-link="${key}">
                          <option value="">${escapeHtml(t('dataTermMigrateLinkPrevStudentNone'))}</option>
                          ${linkOpts}
                        </select>
                      </td>
                    </tr>`;
                })
                .join('');
            const unclearRows = unclear
                .map((u, i) => {
                    const key = `u${i}`;
                    const chosen = unclearResolutions.get(key) || '';
                    const candidateIds = new Set((u.candidates || []).map((c) => c.studentId));
                    const extra = listLinkablePreviousStudents(chosen || '');
                    const merged = [];
                    const seen = new Set();
                    (u.candidates || []).forEach((c) => {
                        if (!seen.has(c.studentId)) {
                            seen.add(c.studentId);
                            merged.push(c);
                        }
                    });
                    extra.forEach((p) => {
                        if (!seen.has(p.studentId)) {
                            seen.add(p.studentId);
                            merged.push(p);
                        }
                    });
                    const opts = merged
                        .map((c) => {
                            const sel = chosen === c.studentId ? ' selected' : '';
                            const label = `${c.name}${c.fromCohortName ? ` (${c.fromCohortName})` : ''}`;
                            return `<option value="${escapeHtml(c.studentId)}"${sel}>${escapeHtml(label)}</option>`;
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
            const unmatchedRows = unmatched
                .map((u) => {
                    const toOpts = cohortTargets
                        .map((c) => {
                            const sel =
                                manualUnmatchedMoves.get(u.studentId) === c.id ? ' selected' : '';
                            return `<option value="${escapeHtml(c.id)}"${sel}>${escapeHtml(displayName(c.name))}</option>`;
                        })
                        .join('');
                    const included = manualUnmatchedInclude.has(u.studentId);
                    return `<tr>
                      <td><input type="checkbox" data-unmatched-include="${escapeHtml(u.studentId)}" ${included ? 'checked' : ''} /></td>
                      <td>${escapeHtml(u.name)}</td>
                      <td>${escapeHtml(u.fromCohortName || '')}</td>
                      <td>
                        <select class="field-select field-control" data-unmatched-to="${escapeHtml(u.studentId)}">
                          <option value="">${escapeHtml(t('dataTermMigrateUnmatchedMoveTo'))}</option>
                          ${toOpts}
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
                        <th>${escapeHtml(t('dataTermMigrateLinkPrevStudent'))}</th>
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
                        ? `<h3 class="form-section-title">${escapeHtml(t('dataTermMigrateUnmatchedHeading'))}</h3>
                        <p class="section-hint">${escapeHtml(t('dataTermMigrateUnmatchedHint').replace('{n}', String(unmatched.length)))}</p>
                        <div class="classroom-sheet-panel"><div class="classroom-sheet-scroll">
                          <table class="classroom-sheet">
                            <thead><tr>
                              <th>${escapeHtml(t('dataTermMigrateUnmatchedInclude'))}</th>
                              <th>${escapeHtml(t('dataTermMigrateColStudent'))}</th>
                              <th>${escapeHtml(t('dataTermMigrateColFrom'))}</th>
                              <th>${escapeHtml(t('dataTermMigrateUnmatchedMoveTo'))}</th>
                            </tr></thead>
                            <tbody>${unmatchedRows}</tbody>
                          </table>
                        </div></div>`
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
            body.querySelectorAll('select[data-add-link]').forEach((sel) => {
                sel.addEventListener('change', () => {
                    const key = sel.getAttribute('data-add-link');
                    if (sel.value) {
                        manualAddLinks.set(key, sel.value);
                    } else {
                        manualAddLinks.delete(key);
                    }
                });
            });
            body.querySelectorAll('select[data-unmatched-to]').forEach((sel) => {
                sel.addEventListener('change', () => {
                    const sid = sel.getAttribute('data-unmatched-to');
                    if (sel.value) {
                        manualUnmatchedMoves.set(sid, sel.value);
                    } else {
                        manualUnmatchedMoves.delete(sid);
                        manualUnmatchedInclude.delete(sid);
                    }
                });
            });
            body.querySelectorAll('input[data-unmatched-include]').forEach((cb) => {
                cb.addEventListener('change', () => {
                    const sid = cb.getAttribute('data-unmatched-include');
                    if (cb.checked && manualUnmatchedMoves.get(sid)) {
                        manualUnmatchedInclude.add(sid);
                    } else {
                        manualUnmatchedInclude.delete(sid);
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
            renderClassesStep(body);
            return;
        }

        if (step === 6) {
            preloadTimetableLibs();
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
            const fileList =
                pendingTimetableFiles.length > 0
                    ? `<ul class="term-migrate-file-list">${pendingTimetableFiles
                          .map(
                              (f, i) =>
                                  `<li><span>${escapeHtml(f.name || `file ${i + 1}`)}</span><button type="button" class="btn btn-small btn-outline" data-timetable-remove="${i}">${escapeHtml(t('dataTermMigrateTimetableRemove'))}</button></li>`
                          )
                          .join('')}</ul>
                      <button type="button" class="btn btn-small btn-outline" id="termMigrateTimetableClearAll">${escapeHtml(t('dataTermMigrateTimetableClearAll'))}</button>`
                    : '';
            body.innerHTML = `
                <p class="section-hint">${escapeHtml(t('dataTermMigrateStep6Hint'))}</p>
                <label class="form-group" for="termMigrateTimetableFiles">
                    <span>${escapeHtml(t('dataTermMigrateTimetableLabel'))}</span>
                    <input type="file" id="termMigrateTimetableFiles" class="field-input field-control" multiple accept=".xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp" />
                </label>
                <p class="section-hint">${escapeHtml(t('dataTermMigrateTimetableHint'))}</p>
                <p class="section-hint">${escapeHtml(t('dataTermMigrateTimetableSkipHint'))}</p>
                ${fileList}
                <ul class="section-hint">
                  <li>${escapeHtml(t('dataTermMigrateReviewClasses').replace('{n}', String(createdCohortMap.length)))}</li>
                  <li>${escapeHtml(t('dataTermMigrateReviewMoves').replace('{n}', String(selectedMoves.size)))}</li>
                  <li>${escapeHtml(t('dataTermMigrateReviewAdds').replace('{n}', String(selectedAdds.size)))}</li>
                  <li>${escapeHtml(t('dataTermMigrateReviewHomeroom').replace('{n}', String(hrFilled)))}</li>
                  <li>${escapeHtml(
                      t('dataTermMigrateReviewClassesMade')
                          .replace('{cohorts}', String((classPicks || []).length))
                          .replace('{n}', String((classPicks || []).reduce((n, p) => n + p.rows.length, 0)))
                  )}</li>
                  <li>${escapeHtml(t('dataTermMigrateReviewTerm').replace('{start}', termStart).replace('{end}', termEnd))}</li>
                  <li>${escapeHtml(t('dataTermMigrateReviewEvents').replace('{n}', String(eventCount)))}</li>
                </ul>
            `;
            const fileInput = document.getElementById('termMigrateTimetableFiles');
            if (fileInput && fileInput.dataset.bound !== '1') {
                fileInput.dataset.bound = '1';
                fileInput.addEventListener('change', () => {
                    if (fileInput.files && fileInput.files.length) {
                        pendingTimetableFiles = pendingTimetableFiles.concat(
                            Array.from(fileInput.files)
                        );
                        fileInput.value = '';
                        renderStep();
                    }
                });
            }
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
            let cand = (u.candidates || []).find((c) => c.studentId === studentId);
            if (!cand) {
                cand = findPreviousStudentById(studentId);
            }
            if (!cand) {
                return;
            }
            const targetLevel = createdCohortMap.find((r) => r.cohortId === u.toCohortId);
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
                nextLevel: targetLevel ? targetLevel.levelPreset || '' : '',
                matchedBy: 'unclear',
                student: cand.student
            });
        });
        return moves;
    }

    function collectManualAddMoves() {
        const adds = (transferPlan && transferPlan.adds) || [];
        const moves = [];
        adds.forEach((a, i) => {
            const key = `a${i}`;
            if (!selectedAdds.has(key)) {
                return;
            }
            const studentId = manualAddLinks.get(key);
            if (!studentId) {
                return;
            }
            const cand = findPreviousStudentById(studentId);
            if (!cand) {
                return;
            }
            const targetLevel = createdCohortMap.find((r) => r.cohortId === a.toCohortId);
            moves.push({
                action: 'move',
                studentId,
                name: cand.name,
                nameEn: a.tmsNameEn || cand.nameEn || '',
                tmsName: a.tmsName || a.name,
                tmsMpidx: a.tmsMpidx || cand.tmsMpidx || '',
                fromCohortId: cand.fromCohortId,
                fromCohortName: cand.fromCohortName,
                toCohortId: a.toCohortId,
                toCohortName: a.toCohortName,
                previousLevel: cand.previousLevel,
                nextLevel: targetLevel ? targetLevel.levelPreset || '' : '',
                matchedBy: 'manual',
                student: cand.student
            });
        });
        return moves;
    }

    function collectManualUnmatchedMoves() {
        const moves = [];
        manualUnmatchedInclude.forEach((studentId) => {
            const toCohortId = manualUnmatchedMoves.get(studentId);
            if (!toCohortId) {
                return;
            }
            const cand = findPreviousStudentById(studentId);
            const target = createdCohortMap.find((r) => r.cohortId === toCohortId);
            if (!cand || !target) {
                return;
            }
            moves.push({
                action: 'move',
                studentId,
                name: cand.name,
                nameEn: cand.nameEn || '',
                tmsName: cand.name,
                tmsMpidx: cand.tmsMpidx || '',
                fromCohortId: cand.fromCohortId,
                fromCohortName: cand.fromCohortName,
                toCohortId,
                toCohortName: target.cohortName,
                previousLevel: cand.previousLevel,
                nextLevel: target.levelPreset || '',
                matchedBy: 'manual_unmatched',
                student: cand.student
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
            const termCodeInput = document.getElementById('termMigrateTermCodeFilter');
            wizardSettings = {
                newName: trimmed,
                monthShift: shiftInput ? Number(shiftInput.value) || 0 : 3,
                clearClassroom: clearCb ? clearCb.checked : true,
                copyEvents: copyEv ? copyEv.checked : true,
                tmsUser: user ? user.value : '',
                tmsPass: pass ? pass.value : '',
                termCodeFilter: termCodeInput ? termCodeInput.value.trim() : ''
            };
            scrapeLoading = true;
            showScrapeProgress(t('dataTermMigrateScraping'));
            try {
                previousSnapshot = snapshotPreviousStudents(getAppData());
                // The Classes step uses the cohort tab's class builder and the planner's TMS timetable reader.
                if (global.CCPTabScripts && global.CCPTabScripts.ensureTabScripts) {
                    try {
                        await global.CCPTabScripts.ensureTabScripts('cohorts');
                    } catch (_e) { /* the Classes step says what is missing */ }
                }
                const result = await scrapeTmsRosters(
                    wizardSettings.tmsUser,
                    wizardSettings.tmsPass
                );
                scrapedCohortsAll = Array.isArray(result.cohorts) ? result.cohorts.slice() : [];
                // Same sign-in: every teacher's timetable (teacher_time.aspx) for cohorts and classes.
                scrapedSchedule = null;
                scheduleNote = '';
                classPicks = null;
                try {
                    showScrapeProgress(t('dataTermMigrateScrapingSchedule'));
                    scrapedSchedule = await scrapeTmsSchedule(wizardSettings.tmsUser, wizardSettings.tmsPass);
                    const extra = scheduleOnlyCohorts(scrapedCohortsAll, scrapedSchedule);
                    scrapedCohortsAll = scrapedCohortsAll.concat(extra);
                } catch (schedErr) {
                    scheduleNote = (schedErr && schedErr.message) || String(schedErr);
                }
                refreshDiscoveredTermCodes();
                const api = tmsNameApi();
                if (!wizardSettings.termCodeFilter && api && api.pickDefaultTermCode) {
                    wizardSettings.termCodeFilter =
                        api.pickDefaultTermCode(discoveredTermCodes) || '';
                }
                rebuildCohortMapFromScrapeFilter();
                if (!createdCohortMap.length) {
                    hideScrapeProgress();
                    setStatus(t('dataTermMigrateNoClassesForTerm'), true);
                    scrapeLoading = false;
                    return;
                }
                step = 2;
                hideScrapeProgress();
                setStatus(
                    t('dataTermMigrateScrapeDone').replace(
                        '{n}',
                        String(createdCohortMap.length)
                    ),
                    false
                );
                renderStep();
            } catch (err) {
                hideScrapeProgress();
                setStatus(
                    t('dataTermMigrateScrapeFailed') +
                        ': ' +
                        (err && err.message ? err.message : String(err)),
                    true
                );
            } finally {
                scrapeLoading = false;
                hideScrapeProgress();
            }
            return;
        }

        if (step === 2) {
            flushStep2Levels();
            flushStep2PrevCohort();
            const termSel = document.getElementById('termMigrateTermCodeSelect');
            if (termSel) {
                wizardSettings.termCodeFilter = termSel.value || '';
            }
            rebuildCohortMapFromScrapeFilter();
            if (!createdCohortMap.length) {
                setStatus(t('dataTermMigrateNoClassesForTerm'), true);
                return;
            }
            rebuildTransferPlan({ force: true });
            step = 3;
            renderStep();
            return;
        }

        if (step === 3) {
            flushStep3Transfers();
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
            flushStep5Classes();
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
            flushStep5Classes();
        }
        if (step === 4) {
            flushStep4Homeroom();
        }
        if (step === 3) {
            flushStep3Transfers();
        }
        if (step === 2) {
            flushStep2Levels();
            flushStep2PrevCohort();
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
        flushStep4Homeroom();
        flushStep3Transfers();
        if (!transferPlan) {
            rebuildTransferPlan({ force: true });
        }

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
        collectManualAddMoves().forEach((m) => {
            moves.push(
                Object.assign({}, m, {
                    toCohortId: idRemap.get(m.toCohortId) || m.toCohortId
                })
            );
        });
        collectManualUnmatchedMoves().forEach((m) => {
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
            if (manualAddLinks.has(`a${i}`)) {
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
        const unmatched = (transferPlan.unmatchedPrevious || []).filter(
            (u) => u && u.studentId && !manualUnmatchedInclude.has(u.studentId)
        );
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

        // Classes: what the Classes step previewed, built on the new calendar (TMS periods and teachers, shared
        // classes for cohorts taught together), then last term's curriculum copied onto them.
        cloned.classes = [];
        const CM = global.CCPCohortManagement;
        if (CM && CM.applyBatchGeneration && CM.withAppData && classPicks && classPicks.length) {
            const picks = classPicks
                .map((p) => ({ cohort: finalCohorts.find((c) => c && c.id === idRemap.get(p.cohortId)), rows: p.rows }))
                .filter((p) => p.cohort);
            CM.withAppData(cloned, () => {
                CM.applyBatchGeneration(picks, scrapedSchedule, { term: wizardSettings.termCodeFilter || '' });
                const prevByNew = new Map();
                createdCohortMap.forEach((spec) => {
                    const realId = idRemap.get(spec.cohortId);
                    if (realId && spec.matchedPreviousCohortId) {
                        prevByNew.set(realId, spec.matchedPreviousCohortId);
                    }
                });
                CM.copyCurriculumFromPrevious(
                    cloned.classes,
                    sourceSnapshot,
                    (id) => prevByNew.get(id) || '',
                    (prev) => (d && d.shiftClassDatesForTerm ? d.shiftClassDatesForTerm(prev, monthShift, shiftIso) : prev)
                );
            }, classBuilderHooks());
        }

        if (
            pendingTimetableFiles.length &&
            global.CCPTimetableImportUi &&
            typeof global.CCPTimetableImportUi.importFilesForMigrate === 'function'
        ) {
            try {
                setStatus(t('timetableImportLoading'), false);
                const ttResult = await global.CCPTimetableImportUi.importFilesForMigrate(
                    pendingTimetableFiles.slice(),
                    cloned,
                    {}
                );
                cloned.classes = ttResult.classes;
            } catch (ttErr) {
                const fmt =
                    global.CCPTimetableImportUi &&
                    typeof global.CCPTimetableImportUi.formatImportError === 'function'
                        ? global.CCPTimetableImportUi.formatImportError(ttErr)
                        : t('timetableImportFailed');
                setStatus(
                    fmt +
                        (ttErr && ttErr.message ? ': ' + ttErr.message : ''),
                    true
                );
                return;
            }
        }

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
        scrapedCohortsAll = [];
        excludedTmsClassIds = new Set();
        discoveredTermCodes = [];
        createdCohortMap = [];
        transferPlan = null;
        selectedMoves = new Set();
        selectedAdds = new Set();
        transferPlanSourceKey = '';
        unclearResolutions = new Map();
        manualAddLinks = new Map();
        manualUnmatchedMoves = new Map();
        manualUnmatchedInclude = new Set();
        pendingTimetableFiles = [];
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
        scrapedCohortsAll = [];
        excludedTmsClassIds = new Set();
        discoveredTermCodes = [];
        createdCohortMap = [];
        transferPlan = null;
        selectedMoves = new Set();
        selectedAdds = new Set();
        transferPlanSourceKey = '';
        unclearResolutions = new Map();
        manualAddLinks = new Map();
        manualUnmatchedMoves = new Map();
        manualUnmatchedInclude = new Set();
        pendingTimetableFiles = [];
        preloadTimetableLibs();
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
        document.getElementById('termMigrateBody')?.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.target.id !== 'termMigrateTmsPass') {
                return;
            }
            e.preventDefault();
            void goNext();
        });
        document.getElementById('termMigrateBody')?.addEventListener('click', (e) => {
            const clearBtn = e.target.closest('#termMigrateTimetableClearAll');
            if (clearBtn && step === 6) {
                e.preventDefault();
                pendingTimetableFiles = [];
                renderStep();
                return;
            }
            const rmBtn = e.target.closest('[data-timetable-remove]');
            if (rmBtn && step === 6) {
                e.preventDefault();
                const idx = Number(rmBtn.getAttribute('data-timetable-remove'));
                pendingTimetableFiles = pendingTimetableFiles.filter((_, i) => i !== idx);
                renderStep();
            }
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
        scheduleOnlyCohorts,
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
