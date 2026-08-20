/**
 * Classroom Briefing tab — pre-class student summary.
 *
 * Scrapes TMS counsel/attendance iframes through the local bridge,
 * translates Korean notes to English via /api/translate, builds per-student cards
 * with a watch-list strip at the top.
 *
 * Profiles are cached in memory and IndexedDB (this browser only — not the shared calendar).
 */
(function (global) {
    'use strict';

    const TMS_USERNAME_STORAGE_KEY = 'ccp.tmsRosterUsername';
    const BRIDGE_PING_PATH = '/api/tms/bridge/ping';
    const BRIDGE_COUNSEL_PATH = '/api/tms/bridge/counsel';
    const SERVER_COUNSEL_PATH = '/api/tms/counsel/preview';
    const TRANSLATE_PATH = '/translate';
    const TRANSLATE_GAP_MS = 150;
    const TRANSLATE_CONCURRENCY = 2;
    const TRANSLATE_RATE_LIMIT_WAIT_MS = 45000;
    const MAX_AUTO_TRANSLATE_NOTES_PER_STUDENT = 4;
    const COUNSEL_SYNC_TIMEOUT_MS = 15 * 60 * 1000;
    const SYNC_SECONDS_PER_STUDENT = 4;
    const IDB_NAME = 'ccp-briefing-cache';
    const IDB_STORE = 'profiles';
    const IDB_VERSION = 1;

    const _cache = new Map();

    let hooks = null;
    let classId = '';
    let eventsBound = false;
    let pendingSyncPlan = null;
    let syncProgressTimer = null;
    let syncProgressStartedAt = 0;
    let modalSyncActive = false;
    let persistTimer = null;
    let translateToken = 0;

    function t(key, fallback) {
        if (hooks && hooks.t) {
            const val = hooks.t(key);
            if (val && val !== key) {
                return val;
            }
        }
        try {
            const i18n = global.CCPi18n || (global.appI18n && global.appI18n.strings);
            if (i18n && i18n[key]) {
                return i18n[key];
            }
        } catch (_) {
            /* ignore */
        }
        return fallback || key;
    }

    function esc(str) {
        if (hooks && hooks.escapeHtml) {
            return hooks.escapeHtml(str);
        }
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function domain() {
        return global.CCPClassroomDomain;
    }

    function getAppData() {
        return hooks && hooks.getAppData ? hooks.getAppData() : global.appData || {};
    }

    function panelEl() {
        return document.getElementById('panel-briefing');
    }

    function mountEl() {
        return document.getElementById('briefingMount');
    }

    function syncBtnEl() {
        return document.getElementById('briefingSyncBtn');
    }

    function statusEl() {
        return document.getElementById('briefingStatus');
    }

    function showStatus(msg, isError) {
        if (modalSyncActive) {
            setModalProgressPhase(msg, isError);
            return;
        }
        const el = statusEl();
        if (!el) {
            return;
        }
        el.textContent = msg || '';
        el.hidden = !msg;
        el.className = 'briefing-status-text' + (isError ? ' briefing-status-text--error' : '');
    }

    function formatElapsed(seconds) {
        const s = Math.max(0, Math.floor(seconds));
        const mins = Math.floor(s / 60);
        const secs = s % 60;
        if (mins > 0) {
            return `${mins}:${String(secs).padStart(2, '0')}`;
        }
        return `${secs}s`;
    }

    function estimateSyncMinutes(studentCount) {
        const count = Math.max(1, studentCount || 1);
        return Math.max(2, Math.ceil((count * SYNC_SECONDS_PER_STUDENT) / 60));
    }

    function credFormEl() {
        return document.getElementById('briefingTmsCredForm');
    }

    function syncProgressEl() {
        return document.getElementById('briefingTmsSyncProgress');
    }

    function modalToolbarEl() {
        const modal = document.getElementById('briefingTmsSyncModal');
        return modal ? modal.querySelector('.toolbar-actions') : null;
    }

    function stopSyncProgressTimer() {
        if (syncProgressTimer) {
            clearInterval(syncProgressTimer);
            syncProgressTimer = null;
        }
    }

    function updateSyncProgressElapsed() {
        const elapsedEl = document.getElementById('briefingTmsSyncElapsed');
        if (!elapsedEl || !syncProgressStartedAt) {
            return;
        }
        const seconds = (Date.now() - syncProgressStartedAt) / 1000;
        elapsedEl.textContent = t('briefingSyncElapsed', 'Elapsed: {elapsed}').replace(
            '{elapsed}',
            formatElapsed(seconds)
        );
    }

    function setModalProgressPhase(msg, isError) {
        const phaseEl = document.getElementById('briefingTmsSyncPhase');
        if (phaseEl) {
            phaseEl.textContent = msg || '';
            phaseEl.className = 'briefing-sync-phase' + (isError ? ' briefing-status-text--error' : '');
        }
    }

    function showModalSyncProgress(plan) {
        modalSyncActive = true;
        const studentTotal = countPlanStudents(plan);
        const progress = syncProgressEl();
        const credForm = credFormEl();
        const toolbar = modalToolbarEl();
        const resultEl = document.getElementById('briefingTmsSyncResult');
        const estimateEl = document.getElementById('briefingTmsSyncEstimate');
        if (credForm) {
            credForm.hidden = true;
        }
        if (toolbar) {
            toolbar.hidden = true;
        }
        if (resultEl) {
            resultEl.hidden = true;
            resultEl.textContent = '';
            resultEl.className = 'section-hint briefing-sync-result';
        }
        if (progress) {
            progress.hidden = false;
        }
        if (estimateEl) {
            estimateEl.textContent = t(
                'briefingSyncEstimate',
                'Estimated total: about {minutes} min for {count} students'
            )
                .replace('{minutes}', String(estimateSyncMinutes(studentTotal)))
                .replace('{count}', String(studentTotal));
        }
        syncProgressStartedAt = Date.now();
        stopSyncProgressTimer();
        updateSyncProgressElapsed();
        syncProgressTimer = setInterval(updateSyncProgressElapsed, 1000);
        setModalProgressPhase(
            t('briefingSyncPhaseLoading', 'Loading TMS profiles for {count} students across {classes} classes…')
                .replace('{count}', String(studentTotal))
                .replace('{classes}', String(plan.length))
        );
    }

    function showModalSyncResult(msg, isError) {
        const resultEl = document.getElementById('briefingTmsSyncResult');
        const phaseEl = document.getElementById('briefingTmsSyncPhase');
        if (phaseEl) {
            phaseEl.textContent = t('briefingSyncPhaseDone', 'Sync complete.');
        }
        if (resultEl) {
            resultEl.hidden = !msg;
            resultEl.textContent = msg || '';
            resultEl.className =
                'section-hint briefing-sync-result' + (isError ? ' briefing-sync-result--error' : '');
        }
    }

    function hideModalSyncProgress() {
        modalSyncActive = false;
        stopSyncProgressTimer();
        syncProgressStartedAt = 0;
        const progress = syncProgressEl();
        const credForm = credFormEl();
        const toolbar = modalToolbarEl();
        if (progress) {
            progress.hidden = true;
        }
        if (credForm) {
            credForm.hidden = false;
        }
        if (toolbar) {
            toolbar.hidden = false;
        }
        setModalProgressPhase('');
    }

    function getClassData() {
        const data = getAppData();
        return (data.classes || []).find((c) => c && c.id === classId) || null;
    }

    function getStudents() {
        const d = domain();
        const data = getAppData();
        if (!d || typeof d.resolveStudentsForClass !== 'function') {
            return [];
        }
        return d.resolveStudentsForClass(getClassData(), data.cohorts || []).map((entry) => {
            const stu = entry.student || entry;
            return {
                id: stu.id,
                name: stu.name,
                tmsMpidx: String(stu.tmsMpidx || stu.mpidx || '').trim()
            };
        });
    }

    function getTmsClassIdForClass(classData) {
        const d = domain();
        const data = getAppData();
        if (!d || !classData) {
            return '';
        }
        const cohortIds = (d.getCohortIdsForClass(classData) || []).map((id) => String(id));
        const links =
            typeof d.normalizeTmsRosterLinks === 'function'
                ? d.normalizeTmsRosterLinks(data.tmsRosterLinks)
                : data.tmsRosterLinks || {};
        let found = '';
        Object.keys(links).forEach((key) => {
            if (found) {
                return;
            }
            const entry = links[key];
            if (!entry || entry.action !== 'map') {
                return;
            }
            if (cohortIds.indexOf(String(entry.cohortId || '')) === -1) {
                return;
            }
            if (entry.tmsClassId) {
                found = String(entry.tmsClassId);
            }
        });
        return found;
    }

    function getTmsClassId() {
        return getTmsClassIdForClass(getClassData());
    }

    function getAccessibleClasses() {
        if (global.CCPClassroomZoneContext && global.CCPClassroomZoneContext.getBaseAccessibleClasses) {
            return global.CCPClassroomZoneContext.getBaseAccessibleClasses();
        }
        return (getAppData().classes || []).filter(Boolean);
    }

    function buildStudentsPayload(classData) {
        const d = domain();
        const data = getAppData();
        if (!d || typeof d.resolveStudentsForClass !== 'function' || !classData) {
            return [];
        }
        return d.resolveStudentsForClass(classData, data.cohorts || []).map((entry) => {
            const stu = entry.student || entry;
            return {
                id: stu.id,
                name: stu.name,
                tmsMpidx: String(stu.tmsMpidx || stu.mpidx || '').trim()
            };
        });
    }

    function buildAllClassesSyncPlan() {
        const classes = getAccessibleClasses();
        const batches = [];
        classes.forEach((classData) => {
            if (!classData || !classData.id) {
                return;
            }
            const students = buildStudentsPayload(classData);
            if (!students.length) {
                return;
            }
            batches.push({
                classId: classData.id,
                tmsClassId: getTmsClassIdForClass(classData),
                students
            });
        });
        return batches;
    }

    function countPlanStudents(batches) {
        return (batches || []).reduce((sum, batch) => sum + (batch.students ? batch.students.length : 0), 0);
    }

    function applyBatchSyncResult(result) {
        const classes = (result && result.classes) || {};
        Object.keys(classes).forEach((key) => {
            const bucket = classes[key];
            const cid = bucket && bucket.classId ? bucket.classId : key === '__default__' ? '' : key;
            if (!cid) {
                return;
            }
            _cache.set(`briefing-${cid}`, (bucket && bucket.students) || []);
        });
        schedulePersistBriefingCache();
    }

    function getActiveCalendarId() {
        try {
            if (global.CalendarSync && typeof global.CalendarSync.getActiveCalendarId === 'function') {
                return String(global.CalendarSync.getActiveCalendarId() || '').trim();
            }
        } catch (_) {
            /* ignore */
        }
        return '';
    }

    function openBriefingIdb() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('no_idb'));
                return;
            }
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('idb_open_failed'));
        });
    }

    function cacheSnapshot() {
        const classes = {};
        _cache.forEach((students, key) => {
            const cid = String(key || '').replace(/^briefing-/, '');
            if (cid) {
                classes[cid] = students;
            }
        });
        return { savedAt: Date.now(), classes };
    }

    function applyCacheSnapshot(snapshot) {
        if (!snapshot || !snapshot.classes) {
            return 0;
        }
        let n = 0;
        Object.keys(snapshot.classes).forEach((cid) => {
            const students = snapshot.classes[cid];
            if (!cid || !Array.isArray(students)) {
                return;
            }
            _cache.set(`briefing-${cid}`, students);
            n += 1;
        });
        return n;
    }

    async function persistBriefingCacheNow() {
        const calId = getActiveCalendarId();
        if (!calId) {
            return;
        }
        try {
            const db = await openBriefingIdb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).put(cacheSnapshot(), calId);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('idb_put_failed'));
            });
            db.close();
        } catch (_) {
            /* best-effort */
        }
    }

    function schedulePersistBriefingCache() {
        if (persistTimer) {
            clearTimeout(persistTimer);
        }
        persistTimer = setTimeout(() => {
            persistTimer = null;
            void persistBriefingCacheNow();
        }, 400);
    }

    async function loadBriefingCache() {
        const calId = getActiveCalendarId();
        if (!calId) {
            return false;
        }
        try {
            const db = await openBriefingIdb();
            const snapshot = await new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const req = tx.objectStore(IDB_STORE).get(calId);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error || new Error('idb_get_failed'));
            });
            db.close();
            return applyCacheSnapshot(snapshot) > 0;
        } catch (_) {
            return false;
        }
    }

    function collectProfilesForTranslation(result) {
        const out = [];
        const classes = (result && result.classes) || {};
        Object.keys(classes).forEach((key) => {
            const bucket = classes[key];
            (bucket && bucket.students ? bucket.students : []).forEach((profile) => {
                if (profile) {
                    out.push(profile);
                }
            });
        });
        return out;
    }

    function summarizeSyncStats(stats) {
        if (!stats) {
            return '';
        }
        return t(
            'briefingSyncSummary',
            'Loaded {scraped} profiles across {classes} classes ({totalNotes} counsel notes, {noMpidx} without TMS link, {errors} errors).'
        )
            .replace('{scraped}', String(stats.scraped || 0))
            .replace('{classes}', String(stats.classes || 0))
            .replace('{totalNotes}', String(stats.totalNotes || 0))
            .replace('{noMpidx}', String(stats.noMpidx || 0))
            .replace('{errors}', String(stats.errors || 0));
    }

    function buildSyncWarnings(stats) {
        const warnings = [];
        if (!stats) {
            return warnings;
        }
        if ((stats.scraped || 0) > 0 && (stats.totalNotes || 0) === 0) {
            warnings.push(
                t(
                    'briefingSyncZeroNotes',
                    'Profiles loaded but no counseling notes were found. Check TMS class links or try again from the work PC bridge.'
                )
            );
        }
        if ((stats.missingClassIdx || 0) > 0) {
            warnings.push(
                t(
                    'briefingMissingClassIdx',
                    '{count} students missing TMS class link — counsel may be incomplete.'
                ).replace('{count}', String(stats.missingClassIdx))
            );
        }
        return warnings;
    }

    function resolveClassId(options) {
        const data = getAppData();
        const visible = global.CCPClassroomZoneContext
            ? global.CCPClassroomZoneContext.getVisibleClasses()
            : data.classes || [];
        if (global.CCPActiveContext && global.CCPActiveContext.resolveActiveClassId) {
            return (
                global.CCPActiveContext.resolveActiveClassId(data, {
                    classId: options && options.classId,
                    visibleClasses: visible
                }) || ''
            );
        }
        return (options && options.classId) || (data.ui && data.ui.classroomTabClassId) || '';
    }

    function tmsBridgeFetchInit(extra) {
        return Object.assign(
            {
                credentials: 'omit',
                targetAddressSpace: 'loopback'
            },
            extra || {}
        );
    }

    function getTmsBridgeBaseCandidates() {
        return ['http://127.0.0.1:8080', 'http://localhost:8080'];
    }

    function isLocalClassManagerHost() {
        try {
            const host = String(location.hostname || '').toLowerCase();
            return host === 'localhost' || host === '127.0.0.1';
        } catch (_) {
            return false;
        }
    }

    async function pingBridge() {
        for (const base of getTmsBridgeBaseCandidates()) {
            try {
                const res = await fetch(
                    base + BRIDGE_PING_PATH,
                    tmsBridgeFetchInit({ method: 'GET', mode: 'cors' })
                );
                if (res.ok) {
                    const json = await res.json().catch(() => null);
                    if (json && json.bridge === true) {
                        return { available: true, base };
                    }
                }
            } catch (_) {
                /* try next */
            }
        }
        return { available: false, base: '' };
    }

    function persistTmsUsernamePreference(username, remember) {
        try {
            if (remember && username) {
                localStorage.setItem(TMS_USERNAME_STORAGE_KEY, username);
            } else {
                localStorage.removeItem(TMS_USERNAME_STORAGE_KEY);
            }
        } catch (_) {
            /* ignore */
        }
    }

    function hydrateTmsCredForm() {
        const userEl = document.getElementById('briefingTmsUsername');
        const passEl = document.getElementById('briefingTmsPassword');
        const rememberEl = document.getElementById('briefingTmsRememberUser');
        const errEl = document.getElementById('briefingTmsModalError');
        if (passEl) {
            passEl.value = '';
        }
        if (errEl) {
            errEl.hidden = true;
            errEl.textContent = '';
        }
        let saved = '';
        try {
            saved = String(localStorage.getItem(TMS_USERNAME_STORAGE_KEY) || '').trim();
        } catch (_) {
            saved = '';
        }
        if (userEl) {
            userEl.value = saved;
        }
        if (rememberEl) {
            rememberEl.checked = Boolean(saved);
        }
        syncModalConfirmEnabled();
    }

    function readTmsCredFields() {
        const userEl = document.getElementById('briefingTmsUsername');
        const passEl = document.getElementById('briefingTmsPassword');
        const rememberEl = document.getElementById('briefingTmsRememberUser');
        return {
            username: userEl ? String(userEl.value || '').trim() : '',
            password: passEl ? String(passEl.value || '') : '',
            rememberUser: Boolean(rememberEl && rememberEl.checked)
        };
    }

    function syncModalConfirmEnabled() {
        const btn = document.getElementById('briefingTmsConfirmBtn');
        if (!btn) {
            return;
        }
        const creds = readTmsCredFields();
        btn.disabled = !(creds.username && creds.password);
    }

    function showModalError(msg) {
        const errEl = document.getElementById('briefingTmsModalError');
        if (!errEl) {
            showStatus(msg, true);
            return;
        }
        errEl.textContent = msg || '';
        errEl.hidden = !msg;
    }

    function resolveOpenModal() {
        if (hooks && hooks.openModal) {
            return hooks.openModal;
        }
        if (typeof global.openModal === 'function') {
            return global.openModal;
        }
        return null;
    }

    function resolveCloseModal() {
        if (hooks && hooks.closeModal) {
            return hooks.closeModal;
        }
        if (typeof global.closeModal === 'function') {
            return global.closeModal;
        }
        return null;
    }

    function openTmsLoginModal(plan) {
        const modal = document.getElementById('briefingTmsSyncModal');
        const openModalFn = resolveOpenModal();
        if (!modal || !openModalFn) {
            showStatus(t('briefingErrorBridgeRequired', 'TMS bridge required. Run npm start on the work PC.'), true);
            return;
        }
        pendingSyncPlan = Array.isArray(plan) ? plan : buildAllClassesSyncPlan();
        const hintEl = modal.querySelector('[data-briefing-sync-scope]');
        if (hintEl) {
            const studentTotal = countPlanStudents(pendingSyncPlan);
            hintEl.textContent = t(
                'briefingTmsSyncScopeHint',
                'One sign-in loads counseling notes and attendance for {count} students across {classes} classes.'
            )
                .replace('{count}', String(studentTotal))
                .replace('{classes}', String(pendingSyncPlan.length));
        }
        hydrateTmsCredForm();
        openModalFn(modal);
        const userEl = document.getElementById('briefingTmsUsername');
        const passEl = document.getElementById('briefingTmsPassword');
        if (userEl && !userEl.value) {
            userEl.focus();
        } else if (passEl) {
            passEl.focus();
        }
    }

    function closeTmsLoginModal() {
        hideModalSyncProgress();
        const modal = document.getElementById('briefingTmsSyncModal');
        const closeModalFn = resolveCloseModal();
        if (closeModalFn && modal) {
            closeModalFn(modal);
        }
        pendingSyncPlan = null;
    }

    async function fetchCounselProfiles(plan, credentials, bridge, options) {
        const opts = options || {};
        const payload = {
            classes: plan,
            username: credentials.username,
            password: credentials.password
        };
        const useBridge = Boolean(bridge && bridge.available);
        const url = useBridge ? bridge.base + BRIDGE_COUNSEL_PATH : SERVER_COUNSEL_PATH;
        const fetchOpts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: useBridge ? 'cors' : 'same-origin',
            credentials: useBridge ? 'omit' : 'include',
            body: JSON.stringify(payload)
        };
        if (opts.signal) {
            fetchOpts.signal = opts.signal;
        }
        const res = await fetch(url, tmsBridgeFetchInit(fetchOpts));
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const err = new Error(errBody.error || `HTTP ${res.status}`);
            err.code = errBody && errBody.code;
            throw err;
        }
        return res.json();
    }

    async function translateOne(text) {
        const payload = {
            text: String(text || ''),
            sourceLang: 'ko',
            targetLang: 'en'
        };
        if (global.CCPApi && typeof global.CCPApi.apiFetch === 'function') {
            try {
                const res = await global.CCPApi.apiFetch(TRANSLATE_PATH, {
                    method: 'POST',
                    timeoutMs: 30000,
                    body: payload
                });
                return String(res && res.translatedText ? res.translatedText : '').trim();
            } catch (err) {
                if (err && err.status === 429) {
                    const e = new Error('rate_limited');
                    e.code = 'RATE_LIMITED';
                    throw e;
                }
                if (err && err.status === 503) {
                    const e = new Error('not_configured');
                    e.code = 'TRANSLATE_NOT_CONFIGURED';
                    throw e;
                }
                const e = new Error('translate_failed');
                e.code = 'TRANSLATE_FAILED';
                e.status = err && err.status;
                throw e;
            }
        }
        const res = await fetch('/api' + TRANSLATE_PATH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        if (res.status === 429) {
            const err = new Error('rate_limited');
            err.code = 'RATE_LIMITED';
            throw err;
        }
        if (res.status === 503) {
            const err = new Error('not_configured');
            err.code = 'TRANSLATE_NOT_CONFIGURED';
            throw err;
        }
        if (!res.ok) {
            const err = new Error('translate_failed');
            err.code = 'TRANSLATE_FAILED';
            err.status = res.status;
            throw err;
        }
        const data = await res.json().catch(() => null);
        return String(data && data.translatedText ? data.translatedText : '').trim();
    }

    function collectTranslateItems(studentProfiles, options) {
        const opts = options || {};
        const counselOnly = opts.counselOnly !== false;
        const maxPerStudent = opts.maxPerStudent != null ? opts.maxPerStudent : MAX_AUTO_TRANSLATE_NOTES_PER_STUDENT;
        const items = [];
        (studentProfiles || []).forEach((profile, pi) => {
            let noteCount = 0;
            (profile.notes || []).forEach((note, ni) => {
                if (!note || !note.text || note.textEn) {
                    return;
                }
                if (maxPerStudent >= 0 && noteCount >= maxPerStudent) {
                    return;
                }
                noteCount += 1;
                items.push({
                    profileIdx: pi,
                    noteIdx: ni,
                    text: note.text,
                    date: note.date || ''
                });
            });
            if (!counselOnly) {
                (profile.attendanceRecords || []).forEach((rec, ri) => {
                    if (rec && rec.memo && !rec.memoEn) {
                        items.push({
                            profileIdx: pi,
                            noteIdx: -1,
                            recIdx: ri,
                            text: rec.memo,
                            date: rec.date || ''
                        });
                    }
                });
            }
        });
        items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        return items;
    }

    function applyTranslationItem(studentProfiles, item, translated) {
        if (!translated) {
            return false;
        }
        if (item.noteIdx === -1) {
            const rec =
                studentProfiles[item.profileIdx] &&
                studentProfiles[item.profileIdx].attendanceRecords &&
                studentProfiles[item.profileIdx].attendanceRecords[item.recIdx];
            if (rec) {
                rec.memoEn = translated;
                return true;
            }
            return false;
        }
        const note =
            studentProfiles[item.profileIdx] &&
            studentProfiles[item.profileIdx].notes &&
            studentProfiles[item.profileIdx].notes[item.noteIdx];
        if (note) {
            note.textEn = translated;
            return true;
        }
        return false;
    }

    /**
     * Translate counseling notes for one class via /api/translate.
     * Newest notes first. Abort when translateToken / classId changes.
     */
    async function translateAllNotes(studentProfiles, options) {
        const opts = options || {};
        const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
        const shouldAbort = typeof opts.shouldAbort === 'function' ? opts.shouldAbort : () => false;
        const concurrency = Math.max(1, opts.concurrency || TRANSLATE_CONCURRENCY);
        const items = collectTranslateItems(studentProfiles, {
            counselOnly: opts.counselOnly !== false,
            maxPerStudent:
                opts.maxPerStudent != null ? opts.maxPerStudent : MAX_AUTO_TRANSLATE_NOTES_PER_STUDENT
        });
        const stats = { total: items.length, translated: 0, failed: 0, stopped: false, code: '' };
        if (!items.length) {
            return stats;
        }

        let nextIndex = 0;

        async function translateItem(item) {
            let translated = '';
            try {
                translated = await translateOne(item.text);
            } catch (err) {
                if (err && err.code === 'RATE_LIMITED') {
                    await new Promise((r) => setTimeout(r, TRANSLATE_RATE_LIMIT_WAIT_MS));
                    if (shouldAbort()) {
                        throw err;
                    }
                    translated = await translateOne(item.text);
                } else {
                    throw err;
                }
            }
            return translated;
        }

        async function worker() {
            while (!stats.stopped) {
                if (shouldAbort()) {
                    stats.stopped = true;
                    stats.code = 'paused';
                    return;
                }
                const i = nextIndex;
                nextIndex += 1;
                if (i >= items.length) {
                    return;
                }
                const item = items[i];
                try {
                    const translated = await translateItem(item);
                    if (shouldAbort()) {
                        stats.stopped = true;
                        stats.code = 'paused';
                        return;
                    }
                    if (applyTranslationItem(studentProfiles, item, translated)) {
                        stats.translated += 1;
                    } else {
                        stats.failed += 1;
                    }
                } catch (err) {
                    if (shouldAbort()) {
                        stats.stopped = true;
                        stats.code = 'paused';
                        return;
                    }
                    stats.failed += 1;
                    stats.code = (err && err.code) || 'TRANSLATE_FAILED';
                    if (
                        err &&
                        (err.code === 'RATE_LIMITED' ||
                            err.code === 'TRANSLATE_NOT_CONFIGURED' ||
                            err.status === 401)
                    ) {
                        stats.stopped = true;
                        stats.code = err.code || stats.code;
                        return;
                    }
                }
                if (onProgress) {
                    onProgress(stats, Math.min(i + 1, items.length));
                }
                if (TRANSLATE_GAP_MS > 0 && nextIndex < items.length) {
                    await new Promise((r) => setTimeout(r, TRANSLATE_GAP_MS));
                }
            }
        }

        await Promise.all(Array.from({ length: concurrency }, () => worker()));
        return stats;
    }

    function getCurrentClassProfiles() {
        if (!classId) {
            return [];
        }
        return _cache.get(`briefing-${classId}`) || [];
    }

    function formatTranslateStatus(stats) {
        return t('briefingTranslateThisClass', 'Translating this class: {translated}/{total}')
            .replace('{translated}', String((stats && stats.translated) || 0))
            .replace('{total}', String((stats && stats.total) || 0));
    }

    function pauseClassTranslate() {
        translateToken += 1;
    }

    async function runTranslateForClass(options) {
        const opts = options || {};
        const targetClassId = classId;
        if (!targetClassId) {
            return { total: 0, translated: 0, failed: 0, stopped: false, code: '' };
        }
        const token = ++translateToken;
        const profiles = getCurrentClassProfiles();
        const maxPerStudent =
            opts.maxPerStudent != null ? opts.maxPerStudent : MAX_AUTO_TRANSLATE_NOTES_PER_STUDENT;

        try {
            return await translateAllNotes(profiles, {
                counselOnly: true,
                maxPerStudent,
                concurrency: TRANSLATE_CONCURRENCY,
                shouldAbort: () => token !== translateToken || classId !== targetClassId,
                onProgress: (stats) => {
                    if (token !== translateToken || classId !== targetClassId) {
                        return;
                    }
                    showStatus(formatTranslateStatus(stats));
                    patchTranslatedNotes(profiles);
                    schedulePersistBriefingCache();
                }
            });
        } finally {
            if (token === translateToken) {
                schedulePersistBriefingCache();
            }
        }
    }

    function startCurrentClassAutoTranslate() {
        const profiles = getCurrentClassProfiles();
        if (!profiles.length) {
            return;
        }
        const pending = collectTranslateItems(profiles, {
            counselOnly: true,
            maxPerStudent: MAX_AUTO_TRANSLATE_NOTES_PER_STUDENT
        });
        if (!pending.length) {
            return;
        }
        showStatus(formatTranslateStatus({ translated: 0, total: pending.length }));
        void runTranslateForClass({ maxPerStudent: MAX_AUTO_TRANSLATE_NOTES_PER_STUDENT }).then((tStats) => {
            if (!tStats || tStats.code === 'paused') {
                return;
            }
            patchTranslatedNotes(getCurrentClassProfiles());
            const outcome = summarizeTranslateOutcome('', [], tStats);
            if (outcome.msg) {
                showStatus(outcome.msg, outcome.isError);
            }
        });
    }

    function summarizeTranslateOutcome(summary, warnings, tStats) {
        if (!tStats || !tStats.total) {
            return {
                msg: summary + (warnings.length ? ` ${warnings.join(' ')}` : ''),
                isError: warnings.length > 0
            };
        }
        if (tStats.stopped && tStats.code === 'paused') {
            return { msg: '', isError: false };
        }
        if (tStats.stopped && tStats.code === 'TRANSLATE_NOT_CONFIGURED') {
            return {
                msg:
                    summary +
                    ' ' +
                    t(
                        'briefingTranslateNotConfigured',
                        'Translation is not available on this server.'
                    ),
                isError: true
            };
        }
        if (tStats.stopped && tStats.code === 'RATE_LIMITED') {
            return {
                msg:
                    summary +
                    ' ' +
                    t(
                        'briefingTranslateRateLimited',
                        'Translated {translated} of {total} notes. Rate limit reached — open Briefing again later to continue.'
                    )
                        .replace('{translated}', String(tStats.translated))
                        .replace('{total}', String(tStats.total)),
                isError: true
            };
        }
        if (tStats.translated > 0) {
            return {
                msg: t(
                    'briefingTranslateThisClassDone',
                    'Translated {translated} notes in this class.'
                ).replace('{translated}', String(tStats.translated)),
                isError: false
            };
        }
        if (tStats.failed > 0) {
            return {
                msg:
                    summary +
                    ' ' +
                    t(
                        'briefingTranslateFailed',
                        'Could not translate counseling notes. Try again later.'
                    ),
                isError: true
            };
        }
        return {
            msg: summary + (warnings.length ? ` ${warnings.join(' ')}` : ''),
            isError: warnings.length > 0
        };
    }

    function flagLabel(flag) {
        const typeMap = {
            quit: t('briefingFlagQuit', 'Left'),
            break: t('briefingFlagBreak', 'On break'),
            attendance: t('briefingFlagAttendance', 'Attendance issue'),
            ending_soon: t('briefingFlagEndingSoon', 'Ending soon'),
            starting_soon: t('briefingFlagStartingSoon', 'Starting soon'),
            tms_attendance: t('briefingFlagAttendance', 'Attendance issue')
        };
        return typeMap[flag.type] || flag.label || flag.type;
    }

    function flagSeverityClass(flag) {
        if (flag.severity === 'danger' || flag.type === 'quit') {
            return 'briefing-flag--danger';
        }
        if (flag.severity === 'warning') {
            return 'briefing-flag--warning';
        }
        return 'briefing-flag--info';
    }

    function renderWatchList(studentProfiles) {
        const watchStudents = studentProfiles.filter((p) => p.watchFlags && p.watchFlags.length > 0);
        if (!watchStudents.length) {
            return `<div class="briefing-watchlist">
                <h2 class="briefing-section-title">${esc(t('briefingWatchListTitle', 'Watch list'))}</h2>
                <p class="section-hint">${esc(t('briefingWatchListEmpty', 'No flags detected.'))}</p>
            </div>`;
        }
        const chips = watchStudents
            .map((p) => {
                const topFlag = p.watchFlags[0];
                const cls = flagSeverityClass(topFlag);
                const label = flagLabel(topFlag);
                const date = topFlag.date
                    ? `<span class="briefing-flag-date">${esc(topFlag.date)}</span>`
                    : '';
                return `<span class="briefing-flag-chip ${cls}">${esc(p.name)} · ${esc(label)}${date}</span>`;
            })
            .join('');
        return `<div class="briefing-watchlist">
            <h2 class="briefing-section-title">${esc(t('briefingWatchListTitle', 'Watch list'))}</h2>
            <div class="briefing-flag-row">${chips}</div>
        </div>`;
    }

    function renderAttendanceTable(records) {
        if (!records || !records.length) {
            return `<p class="section-hint">${esc(t('briefingAttendanceEmpty', 'No attendance records.'))}</p>`;
        }
        const rows = records
            .slice(0, 10)
            .map((rec) => {
                const statusClass =
                    rec.status === '결석'
                        ? 'briefing-att--absent'
                        : rec.status === '지각'
                          ? 'briefing-att--late'
                          : rec.status === '조퇴'
                            ? 'briefing-att--early'
                            : 'briefing-att--present';
                const memo = rec.memoEn || rec.memo || '';
                return `<tr>
                <td class="briefing-att-date">${esc(rec.date)}</td>
                <td class="briefing-att-status ${statusClass}">${esc(rec.status)}</td>
                <td class="briefing-att-memo">${esc(memo)}</td>
            </tr>`;
            })
            .join('');
        return `<table class="briefing-table briefing-att-table">
            <thead><tr><th>Date</th><th>Status</th><th>Note</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    function renderCounselTable(notes, profile) {
        if (profile && profile.error === 'parse_empty') {
            return `<p class="section-hint briefing-status-text--error">${esc(t('briefingParseEmpty', 'TMS returned a profile shell but no counsel rows were parsed.'))}</p>`;
        }
        if (!notes || !notes.length) {
            return `<p class="section-hint">${esc(t('briefingCounselEmpty', 'No counseling notes.'))}</p>`;
        }
        const rows = notes
            .map((note) => {
                const flagChips = (note.flags || [])
                    .map(
                        (f) =>
                            `<span class="briefing-flag-chip briefing-flag-chip--inline ${f === 'quit' ? 'briefing-flag--danger' : 'briefing-flag--warning'}">${esc(f)}</span>`
                    )
                    .join('');
                const translated = note.textEn
                    ? `<div class="briefing-note-en">${esc(note.textEn)}</div>`
                    : '';
                const rowClass =
                    note.flags && note.flags.length > 0 ? 'briefing-note-row--flagged' : '';
                return `<tr class="briefing-note-row ${rowClass}">
                <td class="briefing-note-date">${esc(note.date)}</td>
                <td class="briefing-note-kind">${esc(note.kind)}</td>
                <td class="briefing-note-text">
                    ${translated}
                    <div class="briefing-note-ko">${esc(note.text)}</div>
                    ${flagChips}
                </td>
            </tr>`;
            })
            .join('');
        return `<table class="briefing-table briefing-counsel-table">
            <thead><tr><th>Date</th><th>Type</th><th>Note</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    function renderStatusBadge(profile) {
        const s = profile.enrollStatus;
        if (s === '퇴원') {
            const date = profile.quitDate ? ` (${profile.quitDate})` : '';
            return `<span class="briefing-enroll-badge briefing-enroll-badge--quit">${esc(t('briefingStatusQuit', 'Left'))}${esc(date)}</span>`;
        }
        if (s === '휴원') {
            const period = profile.breakPeriod ? ` (${profile.breakPeriod})` : '';
            return `<span class="briefing-enroll-badge briefing-enroll-badge--break">${esc(t('briefingStatusBreak', 'On break'))}${esc(period)}</span>`;
        }
        if (s) {
            return `<span class="briefing-enroll-badge briefing-enroll-badge--active">${esc(t('briefingStatusActive', 'Active'))}</span>`;
        }
        if (profile.error === 'no_mpidx') {
            return `<span class="briefing-enroll-badge briefing-enroll-badge--none">${esc(t('briefingNoTmsLink', 'No TMS link'))}</span>`;
        }
        if (profile.error === 'parse_empty') {
            return `<span class="briefing-enroll-badge briefing-enroll-badge--none">${esc(t('briefingParseEmpty', 'TMS returned a profile shell but no counsel rows were parsed.'))}</span>`;
        }
        if (profile.error) {
            return `<span class="briefing-enroll-badge briefing-enroll-badge--none">${esc(t('briefingScrapeFailed', 'TMS profile unavailable'))}</span>`;
        }
        return '';
    }

    function renderStudentCard(profile) {
        const watchChips = (profile.watchFlags || [])
            .map(
                (f) =>
                    `<span class="briefing-flag-chip briefing-flag-chip--card ${flagSeverityClass(f)}">${esc(flagLabel(f))}</span>`
            )
            .join('');
        const statusBadge = renderStatusBadge(profile);
        const cardClass =
            profile.watchFlags && profile.watchFlags.length > 0
                ? 'briefing-card briefing-card--flagged'
                : 'briefing-card';
        return `<div class="${cardClass}" id="briefing-card-${esc(profile.studentId)}">
            <div class="briefing-card-header">
                <span class="briefing-card-name">${esc(profile.name)}</span>
                ${statusBadge}
                <span class="briefing-card-chips">${watchChips}</span>
            </div>
            <div class="briefing-card-body">
                <details class="briefing-section-detail">
                    <summary class="briefing-section-title">${esc(t('briefingAttendanceTitle', 'Recent attendance'))}</summary>
                    ${renderAttendanceTable(profile.attendanceRecords)}
                </details>
                <details class="briefing-section-detail">
                    <summary class="briefing-section-title">${esc(t('briefingCounselTitle', 'Counseling notes'))}</summary>
                    ${renderCounselTable(profile.notes, profile)}
                </details>
            </div>
        </div>`;
    }

    function renderEmptyRoster() {
        const mount = mountEl();
        if (!mount) {
            return;
        }
        const classData = getClassData();
        const name = classData && classData.name ? classData.name : '';
        if (!classId || !classData) {
            mount.innerHTML = `<p class="section-hint">${esc(t('briefingPickClass', 'Pick a class in the Classroom header above.'))}</p>`;
            return;
        }
        const msg = t('briefingNoRoster', '"{name}" has no linked cohort roster. Pick another class above, or link a cohort in Class Setup.')
            .replace('{name}', name);
        mount.innerHTML = `<p class="section-hint">${esc(msg)}</p>`;
    }

    function renderAll(studentProfiles) {
        const mount = mountEl();
        if (!mount) {
            return;
        }
        if (!studentProfiles || !studentProfiles.length) {
            renderEmptyRoster();
            return;
        }
        const watchHtml = renderWatchList(studentProfiles);
        const cards = studentProfiles.map(renderStudentCard).join('');
        mount.innerHTML = `${watchHtml}<div class="briefing-cards">${cards}</div>`;
    }

    function patchTranslatedNotes(studentProfiles) {
        studentProfiles.forEach((profile) => {
            if (!profile) {
                return;
            }
            const card = document.getElementById(`briefing-card-${profile.studentId}`);
            if (!card) {
                return;
            }
            const rows = card.querySelectorAll('.briefing-note-row');
            rows.forEach((row, ni) => {
                const note = profile.notes && profile.notes[ni];
                if (!note || !note.textEn) {
                    return;
                }
                const textCell = row.querySelector('.briefing-note-text');
                if (!textCell) {
                    return;
                }
                let enEl = row.querySelector('.briefing-note-en');
                if (!enEl) {
                    enEl = document.createElement('div');
                    enEl.className = 'briefing-note-en';
                    // Insert English above Korean without touching <details open> state.
                    const koEl = textCell.querySelector('.briefing-note-ko');
                    if (koEl) {
                        textCell.insertBefore(enEl, koEl);
                    } else {
                        textCell.appendChild(enEl);
                    }
                }
                if (enEl.textContent !== note.textEn) {
                    enEl.textContent = note.textEn;
                }
            });
            const attRows = card.querySelectorAll('.briefing-att-memo');
            attRows.forEach((cell, ri) => {
                const rec = profile.attendanceRecords && profile.attendanceRecords[ri];
                if (!rec || !rec.memoEn) {
                    return;
                }
                if (cell.textContent !== rec.memoEn) {
                    cell.textContent = rec.memoEn;
                }
            });
        });
    }

    async function onTranslateClick(e) {
        if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
        }
        const profiles = getCurrentClassProfiles();
        if (!profiles.length) {
            showStatus(
                t(
                    'briefingIdleHint',
                    'Sync TMS once to load counseling notes and attendance for all classes.'
                ),
                true
            );
            return;
        }
        const pending = collectTranslateItems(profiles, {
            counselOnly: true,
            maxPerStudent: -1
        });
        if (!pending.length) {
            showStatus(t('briefingTranslateThisClassIdle', 'This class already has English for loaded notes.'));
            return;
        }
        showStatus(formatTranslateStatus({ translated: 0, total: pending.length }));
        const tStats = await runTranslateForClass({ maxPerStudent: -1 });
        if (tStats && tStats.code === 'paused') {
            return;
        }
        patchTranslatedNotes(getCurrentClassProfiles());
        const outcome = summarizeTranslateOutcome('', [], tStats);
        showStatus(outcome.msg || formatTranslateStatus(tStats), outcome.isError);
    }

    function renderIdle() {
        const mount = mountEl();
        if (!mount) {
            return;
        }
        const students = getStudents();
        const cached = classId ? _cache.get(`briefing-${classId}`) : null;
        if (cached) {
            renderAll(cached);
            return;
        }
        if (!classId) {
            renderEmptyRoster();
            return;
        }
        if (!students.length) {
            renderEmptyRoster();
            return;
        }
        mount.innerHTML = `<p class="section-hint">${esc(t('briefingIdleHint', 'Sync TMS once to load counseling notes and attendance for all classes.'))}</p>`;
    }

    function onSyncClick(e) {
        if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
        }
        if (e && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
        }
        const plan = buildAllClassesSyncPlan();
        if (!plan.length) {
            if (!classId || !getClassData()) {
                renderEmptyRoster();
            } else {
                renderEmptyRoster();
            }
            showStatus(t('briefingNoClassesToSync', 'No classes with linked rosters to sync.'), true);
            return;
        }
        openTmsLoginModal(plan);
    }

    async function confirmTmsLogin(planOverride) {
        const creds = readTmsCredFields();
        if (!creds.username || !creds.password) {
            showModalError(t('briefingErrorCredsRequired', 'Enter your TMS username and password.'));
            return;
        }
        persistTmsUsernamePreference(creds.username, creds.rememberUser);

        const confirmBtn = document.getElementById('briefingTmsConfirmBtn');
        const plan = Array.isArray(planOverride) && planOverride.length
            ? planOverride
            : pendingSyncPlan && pendingSyncPlan.length
              ? pendingSyncPlan
              : buildAllClassesSyncPlan();
        if (!plan.length) {
            closeTmsLoginModal();
            renderEmptyRoster();
            showStatus(t('briefingNoClassesToSync', 'No classes with linked rosters to sync.'), true);
            return;
        }

        if (confirmBtn) {
            confirmBtn.disabled = true;
        }
        showModalError('');
        showModalSyncProgress(plan);

        const bridge = await pingBridge();
        if (!bridge.available && !isLocalClassManagerHost()) {
            hideModalSyncProgress();
            showModalError(
                t('briefingErrorBridgeRequired', 'TMS bridge required. Run npm start on the work PC.')
            );
            if (confirmBtn) {
                syncModalConfirmEnabled();
            }
            return;
        }

        let summary = '';
        let warnings = [];
        const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
        let timeoutId = null;
        if (abortController) {
            timeoutId = setTimeout(() => abortController.abort(), COUNSEL_SYNC_TIMEOUT_MS);
        }

        try {
            const result = await fetchCounselProfiles(plan, creds, bridge, {
                signal: abortController ? abortController.signal : undefined
            });
            applyBatchSyncResult(result);
            summary = summarizeSyncStats(result && result.stats);
            warnings = buildSyncWarnings(result && result.stats);
            showModalSyncResult(summary + (warnings.length ? ` ${warnings.join(' ')}` : ''), warnings.length > 0);
            await new Promise((r) => setTimeout(r, 800));
            closeTmsLoginModal();
            renderIdle();
            showStatus(summary + (warnings.length ? ` ${warnings.join(' ')}` : ''), warnings.length > 0);
            startCurrentClassAutoTranslate();
        } catch (err) {
            hideModalSyncProgress();
            const code = err && err.code;
            let msg = err && err.message ? err.message : 'Sync failed';
            if (err && err.name === 'AbortError') {
                msg = t(
                    'briefingSyncTimeout',
                    'Sync timed out after 15 minutes. Try again or sync fewer classes.'
                );
            } else if (code === 'TMS_LOGIN_FAILED') {
                msg = t('briefingErrorLoginFailed', 'TMS login failed. Check your username and password.');
            } else if (code === 'TMS_BRIDGE_REQUIRED' || code === 'TMS_CREDS_MISSING') {
                msg = t(
                    'briefingErrorBridgeRequired',
                    'TMS bridge required. Run npm start on the work PC.'
                );
            }
            showModalError(msg);
            showStatus('', false);
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            stopSyncProgressTimer();
            if (confirmBtn) {
                syncModalConfirmEnabled();
            }
            const passEl = document.getElementById('briefingTmsPassword');
            if (passEl) {
                passEl.value = '';
            }
        }
    }

    function bindEventsOnce() {
        if (eventsBound) {
            return;
        }
        eventsBound = true;
        document.getElementById('briefingSyncBtn')?.addEventListener('click', onSyncClick);
        document.getElementById('briefingTranslateBtn')?.addEventListener('click', (e) => {
            void onTranslateClick(e);
        });
        document.getElementById('briefingTmsConfirmBtn')?.addEventListener('click', () => {
            void confirmTmsLogin();
        });
        document.getElementById('closeBriefingTmsSyncModal')?.addEventListener('click', () => {
            closeTmsLoginModal();
        });
        document.getElementById('briefingTmsCancelBtn')?.addEventListener('click', () => {
            closeTmsLoginModal();
        });
        ['briefingTmsUsername', 'briefingTmsPassword'].forEach((id) => {
            document.getElementById(id)?.addEventListener('input', syncModalConfirmEnabled);
            document.getElementById(id)?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    void confirmTmsLogin();
                }
            });
        });
        if (global.CCPActiveContext && !bindEventsOnce._subscribed) {
            bindEventsOnce._subscribed = true;
            global.CCPActiveContext.subscribe((detail) => {
                const panel = panelEl();
                if (!panel || panel.hidden || !detail) {
                    return;
                }
                if (detail.classId !== undefined) {
                    const nextId = resolveClassId({ classId: detail.classId });
                    if (nextId !== classId) {
                        pauseClassTranslate();
                        classId = nextId;
                        renderIdle();
                        startCurrentClassAutoTranslate();
                    }
                }
            });
        }
    }

    async function initTab(h, options) {
        hooks = h;
        classId = resolveClassId(options);
        bindEventsOnce();
        const hadCache = await loadBriefingCache();
        renderIdle();
        if (hadCache) {
            startCurrentClassAutoTranslate();
        }
    }

    global.CCPClassroomBriefing = {
        initTab,
        render: renderIdle
    };
})(typeof window !== 'undefined' ? window : globalThis);
