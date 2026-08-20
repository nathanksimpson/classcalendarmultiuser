/**
 * Classroom Briefing tab — pre-class student summary.
 *
 * Scrapes TMS profiles_new.aspx (counsel + attendance) through the local bridge,
 * translates Korean notes to English via /api/translate, builds per-student cards
 * with a watch-list strip at the top.
 *
 * Data is session-only (never written to the shared calendar JSON).
 */
(function (global) {
    'use strict';

    const TMS_USERNAME_STORAGE_KEY = 'ccp.tmsRosterUsername';
    const BRIDGE_PING_PATH = '/api/tms/bridge/ping';
    const BRIDGE_COUNSEL_PATH = '/api/tms/bridge/counsel';
    const SERVER_COUNSEL_PATH = '/api/tms/counsel/preview';
    const TRANSLATE_PATH = '/api/translate';
    const TRANSLATE_BATCH_SIZE = 5;
    const TRANSLATE_BATCH_GAP_MS = 3500;

    const _cache = new Map();

    let hooks = null;
    let classId = '';
    let eventsBound = false;

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
        const el = statusEl();
        if (!el) {
            return;
        }
        el.textContent = msg || '';
        el.hidden = !msg;
        el.className = 'briefing-status-text' + (isError ? ' briefing-status-text--error' : '');
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

    function getTmsClassId() {
        const d = domain();
        const data = getAppData();
        const classData = getClassData();
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

    function openTmsLoginModal() {
        const modal = document.getElementById('briefingTmsSyncModal');
        if (!modal || !hooks || !hooks.openModal) {
            return;
        }
        hydrateTmsCredForm();
        hooks.openModal(modal);
        const userEl = document.getElementById('briefingTmsUsername');
        const passEl = document.getElementById('briefingTmsPassword');
        if (userEl && !userEl.value) {
            userEl.focus();
        } else if (passEl) {
            passEl.focus();
        }
    }

    function closeTmsLoginModal() {
        const modal = document.getElementById('briefingTmsSyncModal');
        if (hooks && hooks.closeModal && modal) {
            hooks.closeModal(modal);
        }
    }

    async function fetchCounselProfiles(students, tmsClassId, credentials, bridge) {
        const payload = {
            students: students.map((s) => ({
                id: s.id,
                name: s.name,
                tmsMpidx: s.tmsMpidx || '',
                tmsClassId: tmsClassId || ''
            })),
            tmsClassId: tmsClassId || '',
            username: credentials.username,
            password: credentials.password
        };
        const useBridge = Boolean(bridge && bridge.available);
        const url = useBridge ? bridge.base + BRIDGE_COUNSEL_PATH : SERVER_COUNSEL_PATH;
        const res = await fetch(
            url,
            tmsBridgeFetchInit({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                mode: useBridge ? 'cors' : 'same-origin',
                credentials: useBridge ? 'omit' : 'include',
                body: JSON.stringify(payload)
            })
        );
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const err = new Error(errBody.error || `HTTP ${res.status}`);
            err.code = errBody && errBody.code;
            throw err;
        }
        return res.json();
    }

    async function translateBatch(texts) {
        if (!texts || !texts.length) {
            return [];
        }
        const res = await fetch(TRANSLATE_PATH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ texts: texts, from: 'ko', to: 'en' })
        });
        if (!res.ok) {
            return texts.map(() => '');
        }
        const data = await res.json().catch(() => null);
        return (data && data.translations) || texts.map(() => '');
    }

    async function translateAllNotes(studentProfiles) {
        const items = [];
        studentProfiles.forEach((profile, pi) => {
            (profile.notes || []).forEach((note, ni) => {
                if (note.text && !note.textEn) {
                    items.push({ profileIdx: pi, noteIdx: ni, text: note.text });
                }
            });
            (profile.attendanceRecords || []).forEach((rec, ri) => {
                if (rec.memo && !rec.memoEn) {
                    items.push({ profileIdx: pi, noteIdx: -1, recIdx: ri, text: rec.memo });
                }
            });
        });
        if (!items.length) {
            return;
        }
        for (let i = 0; i < items.length; i += TRANSLATE_BATCH_SIZE) {
            const batch = items.slice(i, i + TRANSLATE_BATCH_SIZE);
            const texts = batch.map((item) => item.text);
            const translations = await translateBatch(texts).catch(() => texts.map(() => ''));
            batch.forEach((item, j) => {
                const translated = translations[j] || '';
                if (item.noteIdx === -1) {
                    const rec = studentProfiles[item.profileIdx].attendanceRecords[item.recIdx];
                    if (rec) {
                        rec.memoEn = translated;
                    }
                } else {
                    const note = studentProfiles[item.profileIdx].notes[item.noteIdx];
                    if (note) {
                        note.textEn = translated;
                    }
                }
            });
            if (i + TRANSLATE_BATCH_SIZE < items.length) {
                await new Promise((r) => setTimeout(r, TRANSLATE_BATCH_GAP_MS));
            }
        }
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

    function renderCounselTable(notes) {
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
                    <div class="briefing-note-ko">${esc(note.text)}</div>
                    ${translated}
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
        return profile.error === 'no_mpidx'
            ? `<span class="briefing-enroll-badge briefing-enroll-badge--none">${esc(t('briefingNoTmsLink', 'No TMS link'))}</span>`
            : '';
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
                <details class="briefing-section-detail" open>
                    <summary class="briefing-section-title">${esc(t('briefingAttendanceTitle', 'Recent attendance'))}</summary>
                    ${renderAttendanceTable(profile.attendanceRecords)}
                </details>
                <details class="briefing-section-detail">
                    <summary class="briefing-section-title">${esc(t('briefingCounselTitle', 'Counseling notes'))}</summary>
                    ${renderCounselTable(profile.notes)}
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
                let enEl = row.querySelector('.briefing-note-en');
                if (!enEl) {
                    enEl = document.createElement('div');
                    enEl.className = 'briefing-note-en';
                    const textCell = row.querySelector('.briefing-note-text');
                    if (textCell) {
                        textCell.appendChild(enEl);
                    }
                }
                enEl.textContent = note.textEn;
            });
            const attRows = card.querySelectorAll('.briefing-att-memo');
            attRows.forEach((cell, ri) => {
                const rec = profile.attendanceRecords && profile.attendanceRecords[ri];
                if (!rec || !rec.memoEn) {
                    return;
                }
                cell.textContent = rec.memoEn;
            });
        });
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
        mount.innerHTML = `<p class="section-hint">${esc(t('briefingIdleHint', 'Sign in to TMS to load counseling notes and attendance for this class.'))}</p>`;
    }

    function onSyncClick() {
        const students = getStudents();
        if (!classId || !getClassData()) {
            renderEmptyRoster();
            return;
        }
        if (!students.length) {
            renderEmptyRoster();
            return;
        }
        openTmsLoginModal();
    }

    async function confirmTmsLogin() {
        const creds = readTmsCredFields();
        if (!creds.username || !creds.password) {
            showModalError(t('briefingErrorCredsRequired', 'Enter your TMS username and password.'));
            return;
        }
        persistTmsUsernamePreference(creds.username, creds.rememberUser);

        const confirmBtn = document.getElementById('briefingTmsConfirmBtn');
        const students = getStudents();
        const tmsClassId = getTmsClassId();
        if (!students.length) {
            closeTmsLoginModal();
            renderEmptyRoster();
            return;
        }

        if (confirmBtn) {
            confirmBtn.disabled = true;
        }
        showModalError('');
        showStatus(t('briefingLoadingMsg', 'Loading TMS profiles…'));

        const bridge = await pingBridge();
        if (!bridge.available && !isLocalClassManagerHost()) {
            showModalError(
                t('briefingErrorBridgeRequired', 'TMS bridge required. Run npm start on the work PC.')
            );
            showStatus('', false);
            if (confirmBtn) {
                syncModalConfirmEnabled();
            }
            return;
        }

        try {
            const result = await fetchCounselProfiles(students, tmsClassId, creds, bridge);
            const profiles = (result && result.students) || [];
            _cache.set(`briefing-${classId}`, profiles);
            closeTmsLoginModal();
            renderAll(profiles);
            showStatus(t('briefingTranslating', 'Translating…'));
            try {
                await translateAllNotes(profiles);
                patchTranslatedNotes(profiles);
            } catch (_) {
                /* best-effort */
            }
            showStatus('');
        } catch (err) {
            const code = err && err.code;
            let msg = err && err.message ? err.message : 'Sync failed';
            if (code === 'TMS_LOGIN_FAILED') {
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
                    classId = resolveClassId({ classId: detail.classId });
                    renderIdle();
                }
            });
        }
    }

    function initTab(h, options) {
        hooks = h;
        classId = resolveClassId(options);
        bindEventsOnce();
        renderIdle();
    }

    global.CCPClassroomBriefing = {
        initTab,
        render: renderIdle
    };
})(typeof window !== 'undefined' ? window : globalThis);
