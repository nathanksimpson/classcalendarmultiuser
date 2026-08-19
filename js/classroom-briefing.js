/**
 * Classroom Briefing tab — pre-class student summary.
 *
 * Scrapes TMS profiles_new.aspx (counsel + attendance) through the local bridge,
 * translates Korean notes to English via /api/translate, builds per-student cards
 * with a watch-list strip at the top.
 *
 * Data is session-only (never written to the shared calendar JSON).
 */
(function () {
    'use strict';

    // ── constants ──────────────────────────────────────────────────────────────

    const LOCAL_BRIDGE_BASE = 'http://127.0.0.1:8080';
    const BRIDGE_PING_PATH = '/api/tms/bridge/ping';
    const BRIDGE_COUNSEL_PATH = '/api/tms/bridge/counsel';
    const SERVER_COUNSEL_PATH = '/api/tms/counsel/preview';
    const TRANSLATE_PATH = '/api/translate';

    const TRANSLATE_BATCH_SIZE = 5;   // notes per batch to stay under rate limit
    const TRANSLATE_BATCH_GAP_MS = 3500;

    // session-only cache: Map<cacheKey, result>
    const _cache = new Map();

    // ── i18n helper ───────────────────────────────────────────────────────────

    function t(key, fallback) {
        try {
            const i18n = window.CCPi18n || (window.appI18n && window.appI18n.strings);
            if (i18n && i18n[key]) return i18n[key];
        } catch (_) { /* ignore */ }
        return fallback || key;
    }

    // ── DOM refs ──────────────────────────────────────────────────────────────

    const panel = document.getElementById('panel-briefing');
    const mount = document.getElementById('briefingMount');
    const syncBtn = document.getElementById('briefingSyncBtn');
    const classSelect = document.getElementById('briefingClassSelect');
    const statusEl = document.getElementById('briefingStatus');

    if (!panel || !mount || !syncBtn || !classSelect) return; // panel not in DOM

    // ── state helpers ─────────────────────────────────────────────────────────

    function showStatus(msg, isError) {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.hidden = !msg;
        statusEl.className = 'briefing-status-text' + (isError ? ' briefing-status-text--error' : '');
    }

    function getAppState() {
        return (window.CCPAppStore && window.CCPAppStore.getState) ? window.CCPAppStore.getState() : null;
    }

    // ── class picker ──────────────────────────────────────────────────────────

    function buildClassOptions() {
        const state = getAppState();
        const cal = state && state.calendar;
        const classes = (cal && cal.classes) || [];
        classSelect.innerHTML = '';
        if (!classes.length) {
            const opt = document.createElement('option');
            opt.textContent = '—';
            classSelect.appendChild(opt);
            return;
        }
        classes.forEach(cls => {
            if (cls.archived && !cls.students) return;
            const opt = document.createElement('option');
            opt.value = cls.id;
            opt.textContent = cls.name || cls.id;
            classSelect.appendChild(opt);
        });
    }

    // ── student list from app state ───────────────────────────────────────────

    function getStudentsForClass(classId) {
        const state = getAppState();
        const cal = state && state.calendar;
        const classes = (cal && cal.classes) || [];
        const cohorts = (cal && cal.cohorts) || [];

        const classData = classes.find((c) => c && c.id === classId);
        if (!classData) return [];

        const cohortIds =
            window.CCPClassroomDomain &&
            typeof window.CCPClassroomDomain.getCohortIdsForClass === 'function'
                ? window.CCPClassroomDomain.getCohortIdsForClass(classData)
                : (classData.cohortIds || classData.cohortId || []);

        const idsSet = new Set((Array.isArray(cohortIds) ? cohortIds : [cohortIds]).filter(Boolean));
        const out = [];

        // In this app model, students live under cohorts, not under calendar.students.
        cohorts.forEach((cohort) => {
            if (!cohort || !idsSet.has(cohort.id)) return;
            (cohort.students || []).forEach((stu) => {
                if (!stu) return;
                if (stu.active === false) return; // archived roster entries
                const mpidx = String(stu.tmsMpidx || stu.mpidx || '').trim();
                if (!mpidx) return; // Briefing is specifically the TMS profiles_new.aspx scrape
                out.push({ id: stu.id, name: stu.name, tmsMpidx: mpidx });
            });
        });

        return out;
    }

    function getTmsClassId(classId) {
        const state = getAppState();
        const cal = state && state.calendar;
        const classes = (cal && cal.classes) || [];
        const cls = classes.find(c => c.id === classId);
        return (cls && (cls.tmsClassId || cls.tmsId || cls.tmsCohortId)) || '';
    }

    // ── bridge detection ──────────────────────────────────────────────────────

    async function pingBridge() {
        try {
            const res = await fetch(LOCAL_BRIDGE_BASE + BRIDGE_PING_PATH, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit'
            });
            if (res.ok) {
                const json = await res.json().catch(() => null);
                return json && json.bridge === true;
            }
        } catch (_) { /* bridge not running */ }
        return false;
    }

    // ── API calls ─────────────────────────────────────────────────────────────

    async function fetchCounselProfiles(students, tmsClassId, useBridge, credentials) {
        const payload = {
            students: students.map(s => ({
                id: s.id,
                name: s.name,
                tmsMpidx: s.tmsMpidx || s.tmsId || '',
                tmsClassId: tmsClassId || ''
            })),
            tmsClassId: tmsClassId || ''
        };
        if (credentials) {
            payload.username = credentials.username;
            payload.password = credentials.password;
        }

        const url = useBridge
            ? LOCAL_BRIDGE_BASE + BRIDGE_COUNSEL_PATH
            : SERVER_COUNSEL_PATH;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: useBridge ? 'cors' : 'same-origin',
            credentials: useBridge ? 'omit' : 'include',
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            const code = errBody && errBody.code;
            if (code === 'TMS_BRIDGE_REQUIRED' || code === 'TMS_CREDS_MISSING') {
                const err = new Error(errBody.error || 'TMS bridge required');
                err.code = code;
                throw err;
            }
            if (code === 'TMS_LOGIN_FAILED') {
                const err = new Error(errBody.error || 'TMS login failed');
                err.code = code;
                throw err;
            }
            throw new Error(errBody.error || `HTTP ${res.status}`);
        }

        return res.json();
    }

    // ── translation ───────────────────────────────────────────────────────────

    async function translateBatch(texts) {
        if (!texts || !texts.length) return [];
        const res = await fetch(TRANSLATE_PATH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ texts, from: 'ko', to: 'en' })
        });
        if (!res.ok) return texts.map(() => '');
        const data = await res.json().catch(() => null);
        return (data && data.translations) || texts.map(() => '');
    }

    async function translateAllNotes(studentProfiles) {
        // Collect all notes that need translation (Korean text only, non-empty)
        const items = []; // { profileIdx, noteIdx, text }
        studentProfiles.forEach((profile, pi) => {
            (profile.notes || []).forEach((note, ni) => {
                if (note.text && !note.textEn) {
                    items.push({ profileIdx: pi, noteIdx: ni, text: note.text });
                }
            });
            // Also translate attendance memos
            (profile.attendanceRecords || []).forEach((rec, ri) => {
                if (rec.memo && !rec.memoEn) {
                    items.push({ profileIdx: pi, noteIdx: -1, recIdx: ri, text: rec.memo });
                }
            });
        });
        if (!items.length) return;

        // Batch translate
        for (let i = 0; i < items.length; i += TRANSLATE_BATCH_SIZE) {
            const batch = items.slice(i, i + TRANSLATE_BATCH_SIZE);
            const texts = batch.map(item => item.text);
            const translations = await translateBatch(texts).catch(() => texts.map(() => ''));

            batch.forEach((item, j) => {
                const translated = translations[j] || '';
                if (item.noteIdx === -1) {
                    // attendance memo
                    const rec = studentProfiles[item.profileIdx].attendanceRecords[item.recIdx];
                    if (rec) rec.memoEn = translated;
                } else {
                    const note = studentProfiles[item.profileIdx].notes[item.noteIdx];
                    if (note) note.textEn = translated;
                }
            });

            if (i + TRANSLATE_BATCH_SIZE < items.length) {
                await new Promise(r => setTimeout(r, TRANSLATE_BATCH_GAP_MS));
            }
        }
    }

    // ── flag label helpers ─────────────────────────────────────────────────────

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
        if (flag.severity === 'danger' || flag.type === 'quit') return 'briefing-flag--danger';
        if (flag.severity === 'warning') return 'briefing-flag--warning';
        return 'briefing-flag--info';
    }

    // ── render ────────────────────────────────────────────────────────────────

    function renderWatchList(studentProfiles) {
        const watchStudents = studentProfiles.filter(p => p.watchFlags && p.watchFlags.length > 0);
        if (!watchStudents.length) {
            return `<div class="briefing-watchlist">
                <h2 class="briefing-section-title">${t('briefingWatchListTitle', 'Watch list')}</h2>
                <p class="section-hint">${t('briefingWatchListEmpty', 'No flags detected.')}</p>
            </div>`;
        }
        const chips = watchStudents.map(p => {
            const topFlag = p.watchFlags[0];
            const cls = flagSeverityClass(topFlag);
            const label = flagLabel(topFlag);
            const date = topFlag.date ? `<span class="briefing-flag-date">${topFlag.date}</span>` : '';
            return `<span class="briefing-flag-chip ${cls}">${esc(p.name)} · ${esc(label)}${date}</span>`;
        }).join('');
        return `<div class="briefing-watchlist">
            <h2 class="briefing-section-title">${t('briefingWatchListTitle', 'Watch list')}</h2>
            <div class="briefing-flag-row">${chips}</div>
        </div>`;
    }

    function renderAttendanceTable(records) {
        if (!records || !records.length) {
            return `<p class="section-hint">${t('briefingAttendanceEmpty', 'No attendance records.')}</p>`;
        }
        const rows = records.slice(0, 10).map(rec => {
            const statusClass = rec.status === '결석' ? 'briefing-att--absent'
                : rec.status === '지각' ? 'briefing-att--late'
                : rec.status === '조퇴' ? 'briefing-att--early'
                : 'briefing-att--present';
            const memo = rec.memoEn || rec.memo || '';
            return `<tr>
                <td class="briefing-att-date">${esc(rec.date)}</td>
                <td class="briefing-att-status ${statusClass}">${esc(rec.status)}</td>
                <td class="briefing-att-memo">${esc(memo)}</td>
            </tr>`;
        }).join('');
        return `<table class="briefing-table briefing-att-table">
            <thead><tr><th>Date</th><th>Status</th><th>Note</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    function renderCounselTable(notes) {
        if (!notes || !notes.length) {
            return `<p class="section-hint">${t('briefingCounselEmpty', 'No counseling notes.')}</p>`;
        }
        const rows = notes.map(note => {
            const flagChips = (note.flags || []).map(f =>
                `<span class="briefing-flag-chip briefing-flag-chip--inline ${f === 'quit' ? 'briefing-flag--danger' : 'briefing-flag--warning'}">${esc(f)}</span>`
            ).join('');
            const translated = note.textEn ? `<div class="briefing-note-en">${esc(note.textEn)}</div>` : '';
            const rowClass = note.flags && note.flags.length > 0 ? 'briefing-note-row--flagged' : '';
            return `<tr class="briefing-note-row ${rowClass}">
                <td class="briefing-note-date">${esc(note.date)}</td>
                <td class="briefing-note-kind">${esc(note.kind)}</td>
                <td class="briefing-note-text">
                    <div class="briefing-note-ko">${esc(note.text)}</div>
                    ${translated}
                    ${flagChips}
                </td>
            </tr>`;
        }).join('');
        return `<table class="briefing-table briefing-counsel-table">
            <thead><tr><th>Date</th><th>Type</th><th>Note</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    function renderStatusBadge(profile) {
        const s = profile.enrollStatus;
        if (s === '퇴원') {
            const date = profile.quitDate ? ` (${profile.quitDate})` : '';
            return `<span class="briefing-enroll-badge briefing-enroll-badge--quit">${t('briefingStatusQuit', 'Left')}${date}</span>`;
        }
        if (s === '휴원') {
            const period = profile.breakPeriod ? ` (${profile.breakPeriod})` : '';
            return `<span class="briefing-enroll-badge briefing-enroll-badge--break">${t('briefingStatusBreak', 'On break')}${period}</span>`;
        }
        if (s) {
            return `<span class="briefing-enroll-badge briefing-enroll-badge--active">${t('briefingStatusActive', 'Active')}</span>`;
        }
        return profile.error === 'no_mpidx'
            ? `<span class="briefing-enroll-badge briefing-enroll-badge--none">${t('briefingNoTmsLink', 'No TMS link')}</span>`
            : '';
    }

    function renderStudentCard(profile) {
        const watchChips = (profile.watchFlags || []).map(f =>
            `<span class="briefing-flag-chip briefing-flag-chip--card ${flagSeverityClass(f)}">${esc(flagLabel(f))}</span>`
        ).join('');
        const statusBadge = renderStatusBadge(profile);

        const cardClass = profile.watchFlags && profile.watchFlags.length > 0 ? 'briefing-card briefing-card--flagged' : 'briefing-card';

        return `<div class="${cardClass}" id="briefing-card-${esc(profile.studentId)}">
            <div class="briefing-card-header">
                <span class="briefing-card-name">${esc(profile.name)}</span>
                ${statusBadge}
                <span class="briefing-card-chips">${watchChips}</span>
            </div>
            <div class="briefing-card-body">
                <details class="briefing-section-detail" open>
                    <summary class="briefing-section-title">${t('briefingAttendanceTitle', 'Recent attendance')}</summary>
                    ${renderAttendanceTable(profile.attendanceRecords)}
                </details>
                <details class="briefing-section-detail">
                    <summary class="briefing-section-title">${t('briefingCounselTitle', 'Counseling notes')}</summary>
                    ${renderCounselTable(profile.notes)}
                </details>
            </div>
        </div>`;
    }

    function renderAll(studentProfiles) {
        if (!studentProfiles || !studentProfiles.length) {
            mount.innerHTML = `<p class="section-hint">${t('briefingNoStudents', 'No students with TMS profile links in this class.')}</p>`;
            return;
        }
        const watchHtml = renderWatchList(studentProfiles);
        const cards = studentProfiles.map(renderStudentCard).join('');
        mount.innerHTML = `${watchHtml}<div class="briefing-cards">${cards}</div>`;
    }

    // ── re-render translated notes in-place ────────────────────────────────────

    function patchTranslatedNotes(studentProfiles) {
        studentProfiles.forEach(profile => {
            const card = document.getElementById(`briefing-card-${profile.studentId}`);
            if (!card) return;

            // Patch counsel note translations
            const rows = card.querySelectorAll('.briefing-note-row');
            rows.forEach((row, ni) => {
                const note = profile.notes && profile.notes[ni];
                if (!note || !note.textEn) return;
                let enEl = row.querySelector('.briefing-note-en');
                if (!enEl) {
                    enEl = document.createElement('div');
                    enEl.className = 'briefing-note-en';
                    const textCell = row.querySelector('.briefing-note-text');
                    if (textCell) textCell.appendChild(enEl);
                }
                enEl.textContent = note.textEn;
            });

            // Patch attendance memo translations
            const attRows = card.querySelectorAll('.briefing-att-memo');
            attRows.forEach((cell, ri) => {
                const rec = profile.attendanceRecords && profile.attendanceRecords[ri];
                if (!rec || !rec.memoEn) return;
                cell.textContent = rec.memoEn;
            });
        });
    }

    // ── main sync flow ────────────────────────────────────────────────────────

    async function doSync() {
        syncBtn.disabled = true;
        showStatus(t('briefingLoadingMsg', 'Loading TMS profiles…'));

        const classId = classSelect.value;
        const students = getStudentsForClass(classId);
        const tmsClassId = getTmsClassId(classId);

        if (!students.length) {
            mount.innerHTML = `<p class="section-hint">${t('briefingNoStudents', 'No students with TMS profile links in this class.')}</p>`;
            showStatus('');
            syncBtn.disabled = false;
            return;
        }

        const cacheKey = `briefing-${classId}`;
        // If cached result is already in session, use it
        if (_cache.has(cacheKey)) {
            const cached = _cache.get(cacheKey);
            renderAll(cached);
            showStatus('');
            syncBtn.disabled = false;
            return;
        }

        const bridgeAvailable = await pingBridge();
        let result;
        try {
            result = await fetchCounselProfiles(students, tmsClassId, bridgeAvailable);
        } catch (err) {
            const code = err && err.code;
            if (code === 'TMS_BRIDGE_REQUIRED' || !bridgeAvailable) {
                showStatus(t('briefingErrorBridgeRequired', 'TMS bridge required. Run npm start on the work PC.'), true);
            } else if (code === 'TMS_LOGIN_FAILED') {
                showStatus(t('briefingErrorLoginFailed', 'TMS login failed. Check credentials in Settings.'), true);
            } else {
                showStatus(err.message || 'Sync failed', true);
            }
            syncBtn.disabled = false;
            return;
        }

        const profiles = (result && result.students) || [];
        _cache.set(cacheKey, profiles);

        renderAll(profiles);
        showStatus(t('briefingTranslating', 'Translating…'));

        // Translate in background and patch DOM as results come in
        try {
            await translateAllNotes(profiles);
            patchTranslatedNotes(profiles);
        } catch (_) { /* translation is best-effort */ }

        showStatus('');
        syncBtn.disabled = false;
    }

    // ── init ──────────────────────────────────────────────────────────────────

    function init() {
        buildClassOptions();
        syncBtn.addEventListener('click', doSync);
    }

    // Wait for app state to be available
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Use requestAnimationFrame to let app.js boot first
        requestAnimationFrame(() => requestAnimationFrame(init));
    }

    // Rebuild class picker whenever the tab is activated
    panel.addEventListener('tabactivate', buildClassOptions);

    // ── escape helper ─────────────────────────────────────────────────────────

    function esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

})();
