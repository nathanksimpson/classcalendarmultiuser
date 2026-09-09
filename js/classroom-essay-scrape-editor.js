/**
 * TMS essay list scrape → filter → fetch bodies → open Batch Essay Editor.
 * Bodies stay in sessionStorage only (never calendar JSON). No TMS writes.
 */
(function (global) {
    const SESSION_ROWS_KEY = 'ccmu_essay_scrape_rows';
    const SESSION_BATCH_KEY = 'ccmu_essay_batch';
    const USERNAME_KEY = 'ccp.tmsRosterUsername';
    const BRIDGE_TIMEOUT_MS = 120000;
    const STILL_LOADING_MS = 15000;

    let hooks = null;
    let bound = false;
    let allRows = [];
    let filteredRows = [];
    let selectedKeys = new Set();
    let filterState = {
        classes: new Set(),
        titles: new Set(),
        teachers: new Set(),
        evaluators: new Set(),
        evaluations: new Set(),
        fromDate: '',
        toDate: ''
    };
    let loading = false;
    let fetchingBodies = false;

    function t(key) {
        if (hooks && typeof hooks.t === 'function') {
            return hooks.t(key);
        }
        return key;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function rowKey(row) {
        return [
            row.mpidx || '',
            row.tmsClassId || '',
            row.homeworkItemIdx || '',
            row.lessonDate || '',
            row.name || ''
        ].join('|');
    }

    function mapEssayType(title) {
        const lower = String(title || '').toLowerCase();
        if (lower.includes('debate') || lower.includes('토론')) {
            return 'argumentative';
        }
        if (lower.includes('speech') || lower.includes('스피치') || lower.includes('발표')) {
            return 'speech';
        }
        if (lower.includes('opinion') || lower.includes('의견')) {
            return 'opinion';
        }
        if (lower.includes('news') || lower.includes('뉴스')) {
            return 'news-response';
        }
        return 'news-response';
    }

    /** Mirror shared/tms-roster-core groupWritingRowsIntoAssignments for browser-side sync. */
    function groupRowsIntoAssignments(rows) {
        const byKey = new Map();
        (Array.isArray(rows) ? rows : []).forEach((row) => {
            if (!row || !row.name || !row.title) {
                return;
            }
            const key = row.homeworkItemIdx
                ? `hw:${row.homeworkItemIdx}`
                : `n:${String(row.className || '').toLowerCase()}|${String(row.title || '').toLowerCase()}|${row.lessonDate || ''}`;
            if (!byKey.has(key)) {
                byKey.set(key, {
                    tmsClassId: String(row.tmsClassId || ''),
                    className: String(row.className || ''),
                    title: String(row.title || ''),
                    mpidx: String(row.mpidx || ''),
                    homeworkItemIdx: String(row.homeworkItemIdx || ''),
                    lessonDate: String(row.lessonDate || ''),
                    assignedDate: String(row.lessonDate || ''),
                    assignedMonth: '',
                    portfolioTitle: '',
                    dueDate: '',
                    students: []
                });
            }
            const bucket = byKey.get(key);
            if (!bucket.tmsClassId && row.tmsClassId) {
                bucket.tmsClassId = String(row.tmsClassId);
            }
            if (!bucket.className && row.className) {
                bucket.className = String(row.className);
            }
            if (!bucket.lessonDate && row.lessonDate) {
                bucket.lessonDate = String(row.lessonDate);
                bucket.assignedDate = String(row.lessonDate);
            }
            if (!bucket.mpidx && row.mpidx) {
                bucket.mpidx = String(row.mpidx);
            }
            const seen = new Set(bucket.students.map((s) => `${s.mpidx || ''}|${s.name}`));
            const studentKey = `${row.mpidx || ''}|${row.name}`;
            if (!seen.has(studentKey)) {
                bucket.students.push({
                    name: row.name,
                    nameEn: row.nameEn || '',
                    mpidx: row.mpidx || '',
                    submitted: true,
                    submittedAt: row.submittedAt || ''
                });
            }
        });
        return Array.from(byKey.values());
    }

    function domain() {
        return global.CCPClassroomDomain || null;
    }

    function refreshEssaysSheet() {
        if (hooks && typeof hooks.refreshEssaysSheet === 'function') {
            hooks.refreshEssaysSheet();
            return;
        }
        const essays = global.CCPClassroomEssays;
        if (essays && typeof essays.render === 'function') {
            const panel = document.getElementById('panel-essays');
            if (panel) {
                essays.render(panel);
            }
        }
    }

    /**
     * After essay text fetch: mark Not submitted → Received for confidently mapped rows only.
     * No mapping wizard; skips choose/unmapped assignments.
     * @returns {Promise<number>} applied Received count
     */
    async function markReceivedForFetchedRows(fetchedRows) {
        if (!hooks || !fetchedRows || !fetchedRows.length) {
            return 0;
        }
        if (hooks.isViewOnly && hooks.isViewOnly()) {
            return 0;
        }
        const d = domain();
        if (
            !d ||
            typeof d.previewTmsEssaySync !== 'function' ||
            typeof d.applyTmsEssaySync !== 'function' ||
            typeof d.upsertTmsEssayLinks !== 'function'
        ) {
            return 0;
        }
        const appData = hooks.getAppData ? hooks.getAppData() : null;
        if (!appData) {
            return 0;
        }
        const assignments = groupRowsIntoAssignments(fetchedRows);
        if (!assignments.length) {
            return 0;
        }
        const preview = d.previewTmsEssaySync(appData, { assignments });
        const planRows = (preview.planRows || []).filter(
            (row) =>
                row &&
                row.userAction === 'map' &&
                row.userClassId &&
                row.userSyllabusRowId
        );
        if (!planRows.length) {
            return 0;
        }
        // Re-preview with only auto-mapped assignment rows (ignore choose / unresolved).
        const mappedPreview =
            typeof d.previewTmsEssaySyncPlan === 'function'
                ? d.previewTmsEssaySyncPlan(appData, planRows)
                : preview;
        if (!(mappedPreview && mappedPreview.updates && mappedPreview.updates.length)) {
            return 0;
        }
        const result = d.applyTmsEssaySync(appData.essaySubmissions, mappedPreview, {
            appData,
            newStudentId: () =>
                typeof d.newId === 'function'
                    ? d.newId('stu')
                    : hooks.generateId
                      ? hooks.generateId()
                      : `stu_${Date.now()}`,
            planRows
        });
        const appliedCount = Number(
            (result && result.summary && result.summary.appliedCount) || 0
        );
        if (!appliedCount) {
            return 0;
        }
        const nextLinks = d.upsertTmsEssayLinks(appData.tmsEssayLinks, planRows, appData.classes);
        const savePayload = {
            essaySubmissions: result.essaySubmissions,
            tmsEssayLinks: nextLinks
        };
        if (result.cohorts) {
            savePayload.cohorts = result.cohorts;
        }
        if (typeof hooks.saveClassroom !== 'function') {
            return 0;
        }
        const saveResult = await hooks.saveClassroom(savePayload);
        if (hooks.hasTeamSync && hooks.hasTeamSync() && saveResult == null) {
            if (hooks.showToast) {
                hooks.showToast(t('classroomEssayTmsSyncSaveFailed'), true);
            }
            return 0;
        }
        refreshEssaysSheet();
        return appliedCount;
    }

    function normalizeFlatRows(body) {
        const fromRows = Array.isArray(body && body.rows) ? body.rows : [];
        if (fromRows.length) {
            return fromRows.map((r, i) => ({
                key: rowKey(r) || `r${i}`,
                name: String(r.name || ''),
                nameEn: String(r.nameEn || ''),
                displayName: String(r.displayName || r.name || ''),
                className: String(r.className || ''),
                teacher: String(r.teacher || ''),
                title: String(r.title || ''),
                correct: String(r.correct || ''),
                evaluator: String(r.evaluator || ''),
                submittedAt: String(r.submittedAt || ''),
                lessonDate: String(r.lessonDate || ''),
                mpidx: String(r.mpidx || ''),
                tmsClassId: String(r.tmsClassId || ''),
                homeworkItemIdx: String(r.homeworkItemIdx || ''),
                body: '',
                bodyOk: false
            }));
        }
        const assignments = Array.isArray(body && body.assignments) ? body.assignments : [];
        const flat = [];
        assignments.forEach((a) => {
            (Array.isArray(a.students) ? a.students : []).forEach((s) => {
                const row = {
                    name: String(s.name || ''),
                    nameEn: String(s.nameEn || ''),
                    displayName: s.nameEn
                        ? `${s.name}(${s.nameEn})`
                        : String(s.name || ''),
                    className: String(a.className || ''),
                    teacher: '',
                    title: String(a.title || ''),
                    correct: '',
                    evaluator: '',
                    submittedAt: String(s.submittedAt || ''),
                    lessonDate: String(a.lessonDate || ''),
                    mpidx: String(s.mpidx || a.mpidx || ''),
                    tmsClassId: String(a.tmsClassId || ''),
                    homeworkItemIdx: String(a.homeworkItemIdx || ''),
                    body: '',
                    bodyOk: false
                };
                row.key = rowKey(row);
                flat.push(row);
            });
        });
        return flat;
    }

    function persistSessionRows() {
        try {
            sessionStorage.setItem(
                SESSION_ROWS_KEY,
                JSON.stringify({
                    savedAt: new Date().toISOString(),
                    rows: allRows
                })
            );
        } catch (_) {
            /* quota */
        }
    }

    function restoreSessionRows() {
        try {
            const raw = sessionStorage.getItem(SESSION_ROWS_KEY);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.rows)) {
                allRows = parsed.rows;
            }
        } catch (_) {
            allRows = [];
        }
    }

    function isLocalHost() {
        try {
            const host = String(location.hostname || '').toLowerCase();
            return host === 'localhost' || host === '127.0.0.1';
        } catch (_) {
            return false;
        }
    }

    function bridgeFetchInit(extra) {
        return Object.assign(
            { credentials: 'omit', targetAddressSpace: 'loopback' },
            extra || {}
        );
    }

    async function probeBridge() {
        if (isLocalHost()) {
            return null;
        }
        const bases = ['http://127.0.0.1:8080', 'http://localhost:8080'];
        for (const base of bases) {
            const controller =
                typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), 3000) : null;
            try {
                const res = await fetch(
                    `${base}/api/tms/bridge/ping`,
                    bridgeFetchInit({
                        method: 'GET',
                        signal: controller ? controller.signal : undefined
                    })
                );
                if (timer) {
                    clearTimeout(timer);
                }
                if (!res.ok) {
                    continue;
                }
                const body = await res.json().catch(() => null);
                if (body && body.ok === true && body.bridge === true) {
                    return {
                        base,
                        previewUrl: `${base}/api/tms/bridge/essays/preview`,
                        contentUrl: `${base}/api/tms/bridge/essays/content`
                    };
                }
            } catch (_) {
                if (timer) {
                    clearTimeout(timer);
                }
            }
        }
        return null;
    }

    function readCreds() {
        const userEl = document.getElementById('essayScrapeUsername');
        const passEl = document.getElementById('essayScrapePassword');
        const rememberEl = document.getElementById('essayScrapeRememberUser');
        return {
            username: userEl ? String(userEl.value || '').trim() : '',
            password: passEl ? String(passEl.value || '') : '',
            rememberUser: Boolean(rememberEl && rememberEl.checked)
        };
    }

    function hydrateCreds() {
        const userEl = document.getElementById('essayScrapeUsername');
        const rememberEl = document.getElementById('essayScrapeRememberUser');
        let saved = '';
        try {
            saved = String(localStorage.getItem(USERNAME_KEY) || '');
        } catch (_) {
            saved = '';
        }
        if (userEl && !userEl.value && saved) {
            userEl.value = saved;
        }
        if (rememberEl) {
            rememberEl.checked = Boolean(saved);
        }
    }

    function persistUsername(username, remember) {
        try {
            if (remember && username) {
                localStorage.setItem(USERNAME_KEY, username);
            } else if (!remember) {
                localStorage.removeItem(USERNAME_KEY);
            }
        } catch (_) {
            /* ignore */
        }
    }

    function setError(msg) {
        const el = document.getElementById('essayScrapeError');
        if (!el) {
            return;
        }
        if (msg) {
            el.textContent = msg;
            el.hidden = false;
        } else {
            el.textContent = '';
            el.hidden = true;
        }
    }

    function setStatus(msg) {
        const el = document.getElementById('essayScrapeStatus');
        if (el) {
            el.textContent = msg || '';
        }
    }

    function uniqueValues(rows, field) {
        const set = new Set();
        rows.forEach((r) => {
            const v = String(r[field] || '').trim();
            set.add(v || '[Empty]');
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }

    function renderFilterGroup(containerId, field, values) {
        const mount = document.getElementById(containerId);
        if (!mount) {
            return;
        }
        const selected = filterState[field];
        mount.innerHTML = values
            .map((v) => {
                const isChecked = selected.has(v);
                return `<label class="checkbox-label selection-chip"><input type="checkbox" data-filter-field="${field}" value="${escapeHtml(v)}" ${
                    isChecked ? 'checked' : ''
                }> <span>${escapeHtml(v)}</span></label>`;
            })
            .join('');
        mount.querySelectorAll('input[type="checkbox"]').forEach((input) => {
            input.addEventListener('change', () => {
                const f = input.getAttribute('data-filter-field');
                const val = input.value;
                if (!filterState[f]) {
                    return;
                }
                if (input.checked) {
                    filterState[f].add(val);
                } else {
                    filterState[f].delete(val);
                }
                applyFilters();
            });
        });
    }

    function rebuildFilterUi() {
        renderFilterGroup('essayScrapeFilterClass', 'classes', uniqueValues(allRows, 'className'));
        renderFilterGroup('essayScrapeFilterTitle', 'titles', uniqueValues(allRows, 'title'));
        renderFilterGroup('essayScrapeFilterTeacher', 'teachers', uniqueValues(allRows, 'teacher'));
        renderFilterGroup(
            'essayScrapeFilterEvaluator',
            'evaluators',
            uniqueValues(allRows, 'evaluator')
        );
        renderFilterGroup(
            'essayScrapeFilterEval',
            'evaluations',
            uniqueValues(allRows, 'correct')
        );
        const fromEl = document.getElementById('essayScrapeFromDate');
        const toEl = document.getElementById('essayScrapeToDate');
        if (fromEl) {
            fromEl.value = filterState.fromDate || '';
        }
        if (toEl) {
            toEl.value = filterState.toDate || '';
        }
    }

    function passesFilterSet(set, value) {
        if (!set || set.size === 0) {
            return true;
        }
        const v = String(value || '').trim() || '[Empty]';
        return set.has(v);
    }

    function applyFilters() {
        const from = filterState.fromDate;
        const to = filterState.toDate;
        filteredRows = allRows.filter((r) => {
            if (!passesFilterSet(filterState.classes, r.className)) {
                return false;
            }
            if (!passesFilterSet(filterState.titles, r.title)) {
                return false;
            }
            if (!passesFilterSet(filterState.teachers, r.teacher)) {
                return false;
            }
            if (!passesFilterSet(filterState.evaluators, r.evaluator)) {
                return false;
            }
            if (!passesFilterSet(filterState.evaluations, r.correct)) {
                return false;
            }
            if (from || to) {
                const d = String(r.submittedAt || '').trim();
                if (!d) {
                    return false;
                }
                if (from && d < from) {
                    return false;
                }
                if (to && d > to) {
                    return false;
                }
            }
            return true;
        });
        renderTable();
        updateActionButtons();
    }

    function clearFilters() {
        filterState = {
            classes: new Set(),
            titles: new Set(),
            teachers: new Set(),
            evaluators: new Set(),
            evaluations: new Set(),
            fromDate: '',
            toDate: ''
        };
        rebuildFilterUi();
        applyFilters();
    }

    function renderTable() {
        const tbody = document.getElementById('essayScrapeTableBody');
        const countEl = document.getElementById('essayScrapeResultsCount');
        if (countEl) {
            countEl.textContent = t('classroomEssayScrapeResultsCount')
                .replace('{shown}', String(filteredRows.length))
                .replace('{total}', String(allRows.length))
                .replace('{selected}', String(selectedKeys.size));
        }
        if (!tbody) {
            return;
        }
        if (!filteredRows.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="section-hint">${escapeHtml(
                t('classroomEssayScrapeNoResults')
            )}</td></tr>`;
            return;
        }
        tbody.innerHTML = filteredRows
            .map((r) => {
                const checked = selectedKeys.has(r.key) ? 'checked' : '';
                const bodyMark = r.bodyOk
                    ? `<span class="section-hint">${escapeHtml(t('classroomEssayScrapeBodyYes'))}</span>`
                    : `<span class="section-hint">${escapeHtml(t('classroomEssayScrapeBodyNo'))}</span>`;
                return `<tr data-row-key="${escapeHtml(r.key)}">
                    <td><input type="checkbox" class="essay-scrape-row-check" data-key="${escapeHtml(r.key)}" ${checked}></td>
                    <td>${escapeHtml(r.displayName || r.name)}</td>
                    <td>${escapeHtml(r.className)}</td>
                    <td>${escapeHtml(r.teacher)}</td>
                    <td>${escapeHtml(r.title)}</td>
                    <td>${escapeHtml(r.correct)}</td>
                    <td>${escapeHtml(r.submittedAt)}</td>
                    <td>${bodyMark}</td>
                </tr>`;
            })
            .join('');
        tbody.querySelectorAll('.essay-scrape-row-check').forEach((input) => {
            input.addEventListener('change', () => {
                const key = input.getAttribute('data-key');
                if (input.checked) {
                    selectedKeys.add(key);
                } else {
                    selectedKeys.delete(key);
                }
                updateActionButtons();
                if (countEl) {
                    countEl.textContent = t('classroomEssayScrapeResultsCount')
                        .replace('{shown}', String(filteredRows.length))
                        .replace('{total}', String(allRows.length))
                        .replace('{selected}', String(selectedKeys.size));
                }
            });
        });
        tbody.querySelectorAll('tr[data-row-key]').forEach((tr) => {
            tr.addEventListener('click', (e) => {
                if (e.target && e.target.closest('input')) {
                    return;
                }
                const key = tr.getAttribute('data-row-key');
                const input = tr.querySelector('.essay-scrape-row-check');
                if (!input) {
                    return;
                }
                input.checked = !input.checked;
                if (input.checked) {
                    selectedKeys.add(key);
                } else {
                    selectedKeys.delete(key);
                }
                updateActionButtons();
            });
        });
    }

    function updateActionButtons() {
        const fetchBtn = document.getElementById('essayScrapeFetchBodiesBtn');
        const openBtn = document.getElementById('essayScrapeOpenEditorBtn');
        const selected = allRows.filter((r) => selectedKeys.has(r.key));
        const withBody = selected.filter((r) => r.bodyOk && r.body);
        if (fetchBtn) {
            fetchBtn.disabled = loading || fetchingBodies || selected.length === 0;
        }
        if (openBtn) {
            openBtn.disabled = loading || fetchingBodies || withBody.length === 0;
        }
    }

    function selectAllFiltered() {
        filteredRows.forEach((r) => selectedKeys.add(r.key));
        renderTable();
        updateActionButtons();
    }

    function clearSelection() {
        selectedKeys.clear();
        renderTable();
        updateActionButtons();
    }

    async function loadList() {
        if (loading || !hooks) {
            return;
        }
        if (hooks.isViewOnly && hooks.isViewOnly()) {
            setError(t('rosterImportReadOnly') || 'Read only');
            return;
        }
        const creds = readCreds();
        persistUsername(creds.username, creds.rememberUser);
        loading = true;
        setError('');
        setStatus(t('classroomEssayScrapeLoading'));
        updateActionButtons();
        const loadBtn = document.getElementById('essayScrapeLoadBtn');
        if (loadBtn) {
            loadBtn.disabled = true;
        }
        let stillTimer = null;
        let abortTimer = null;
        const controller =
            typeof AbortController !== 'undefined' ? new AbortController() : null;
        try {
            const payload = {};
            if (creds.username || creds.password) {
                payload.username = creds.username;
                payload.password = creds.password;
            }
            const bridge = await probeBridge();
            const onLocal = isLocalHost();
            const previewUrl = bridge
                ? bridge.previewUrl
                : onLocal
                  ? '/api/tms/essays/preview'
                  : '';
            if (!previewUrl) {
                setError(
                    `${t('rosterTmsBridgeMissingHint')} ${t('rosterTmsBridgeLocalNetworkHint')}`
                );
                setStatus('');
                return;
            }
            if (bridge) {
                setStatus(t('classroomEssayTmsBridgeLoading'));
            }
            stillTimer = setTimeout(() => {
                if (loading) {
                    setStatus(t('classroomEssayTmsBridgeStillLoading'));
                }
            }, STILL_LOADING_MS);
            if (controller) {
                abortTimer = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
            }
            const fetchInit = bridge
                ? bridgeFetchInit({
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                      signal: controller.signal
                  })
                : {
                      method: 'POST',
                      credentials: 'same-origin',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                      signal: controller.signal
                  };
            const res = await fetch(previewUrl, fetchInit);
            const contentType = String(res.headers.get('content-type') || '').toLowerCase();
            const body = contentType.includes('application/json')
                ? await res.json().catch(() => null)
                : null;
            if (!res.ok) {
                const code = body && body.code;
                if (code === 'TMS_CREDS_MISSING') {
                    setError(t('rosterTmsSyncCredsMissing'));
                } else if (code === 'TMS_LOGIN_FAILED' || res.status === 401) {
                    setError(t('rosterTmsSyncLoginFailed'));
                } else {
                    setError((body && body.error) || t('rosterTmsSyncError'));
                }
                setStatus('');
                return;
            }
            allRows = normalizeFlatRows(body);
            selectedKeys.clear();
            filterState = {
                classes: new Set(),
                titles: new Set(),
                teachers: new Set(),
                evaluators: new Set(),
                evaluations: new Set(),
                fromDate: '',
                toDate: ''
            };
            persistSessionRows();
            rebuildFilterUi();
            applyFilters();
            const filtersEl = document.getElementById('essayScrapeFilters');
            const resultsEl = document.getElementById('essayScrapeResults');
            if (filtersEl) {
                filtersEl.hidden = allRows.length === 0;
            }
            if (resultsEl) {
                resultsEl.hidden = allRows.length === 0;
            }
            setStatus(
                t('classroomEssayScrapeLoaded').replace('{count}', String(allRows.length))
            );
        } catch (err) {
            if (err && err.name === 'AbortError') {
                setError(t('classroomEssayTmsBridgeTimeout'));
            } else {
                setError((err && err.message) || t('rosterTmsSyncError'));
            }
            setStatus('');
        } finally {
            if (stillTimer) {
                clearTimeout(stillTimer);
            }
            if (abortTimer) {
                clearTimeout(abortTimer);
            }
            loading = false;
            if (loadBtn) {
                loadBtn.disabled = false;
            }
            updateActionButtons();
        }
    }

    async function fetchBodies() {
        if (fetchingBodies || loading || !hooks) {
            return;
        }
        const selected = allRows.filter((r) => selectedKeys.has(r.key));
        if (!selected.length) {
            setError(t('classroomEssayScrapeSelectFirst'));
            return;
        }
        const creds = readCreds();
        persistUsername(creds.username, creds.rememberUser);
        fetchingBodies = true;
        setError('');
        setStatus(
            t('classroomEssayScrapeFetchingBodies').replace('{count}', String(selected.length))
        );
        updateActionButtons();
        let stillTimer = null;
        let abortTimer = null;
        const controller =
            typeof AbortController !== 'undefined' ? new AbortController() : null;
        try {
            const payload = {
                rows: selected.map((r) => ({
                    mpidx: r.mpidx,
                    tmsClassId: r.tmsClassId,
                    homeworkItemIdx: r.homeworkItemIdx,
                    lessonDate: r.lessonDate,
                    name: r.name,
                    displayName: r.displayName,
                    className: r.className,
                    title: r.title
                }))
            };
            if (creds.username || creds.password) {
                payload.username = creds.username;
                payload.password = creds.password;
            }
            const bridge = await probeBridge();
            const onLocal = isLocalHost();
            const contentUrl = bridge
                ? bridge.contentUrl
                : onLocal
                  ? '/api/tms/essays/content'
                  : '';
            if (!contentUrl) {
                setError(
                    `${t('rosterTmsBridgeMissingHint')} ${t('rosterTmsBridgeLocalNetworkHint')}`
                );
                setStatus('');
                return;
            }
            stillTimer = setTimeout(() => {
                if (fetchingBodies) {
                    setStatus(t('classroomEssayScrapeFetchingStill'));
                }
            }, STILL_LOADING_MS);
            if (controller) {
                abortTimer = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
            }
            const fetchInit = bridge
                ? bridgeFetchInit({
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                      signal: controller.signal
                  })
                : {
                      method: 'POST',
                      credentials: 'same-origin',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                      signal: controller.signal
                  };
            const res = await fetch(contentUrl, fetchInit);
            const contentType = String(res.headers.get('content-type') || '').toLowerCase();
            const body = contentType.includes('application/json')
                ? await res.json().catch(() => null)
                : null;
            if (!res.ok) {
                setError((body && body.error) || t('classroomEssayScrapeFetchFailed'));
                setStatus('');
                return;
            }
            const essays = Array.isArray(body && body.essays) ? body.essays : [];
            const byKey = new Map();
            essays.forEach((e) => {
                byKey.set(
                    rowKey({
                        mpidx: e.mpidx,
                        tmsClassId: e.tmsClassId,
                        homeworkItemIdx: e.homeworkItemIdx,
                        lessonDate: e.lessonDate,
                        name: e.name
                    }),
                    e
                );
            });
            let okCount = 0;
            let failCount = 0;
            allRows = allRows.map((r) => {
                if (!selectedKeys.has(r.key)) {
                    return r;
                }
                const hit = byKey.get(r.key);
                if (hit && hit.ok && hit.body) {
                    okCount += 1;
                    return Object.assign({}, r, {
                        body: hit.body,
                        bodyOk: true,
                        teacherFeedback: hit.teacherFeedback || ''
                    });
                }
                failCount += 1;
                return Object.assign({}, r, {
                    body: '',
                    bodyOk: false
                });
            });
            persistSessionRows();
            applyFilters();

            let receivedCount = 0;
            if (okCount > 0) {
                const fetchedOk = allRows.filter(
                    (r) => selectedKeys.has(r.key) && r.bodyOk && r.body
                );
                try {
                    receivedCount = await markReceivedForFetchedRows(fetchedOk);
                } catch (markErr) {
                    if (typeof console !== 'undefined' && console.warn) {
                        console.warn('[essay scrape] mark Received failed', markErr);
                    }
                }
            }

            if (receivedCount > 0) {
                const doneMsg = t('classroomEssayScrapeFetchDoneReceived')
                    .replace('{ok}', String(okCount))
                    .replace('{fail}', String(failCount))
                    .replace('{received}', String(receivedCount));
                setStatus(doneMsg);
                if (hooks.showToast) {
                    hooks.showToast(doneMsg);
                }
            } else if (okCount > 0) {
                setStatus(
                    t('classroomEssayScrapeFetchDoneNoReceived')
                        .replace('{ok}', String(okCount))
                        .replace('{fail}', String(failCount))
                );
            } else {
                setStatus(
                    t('classroomEssayScrapeFetchDone')
                        .replace('{ok}', String(okCount))
                        .replace('{fail}', String(failCount))
                );
            }
            if (failCount) {
                const firstErr = essays.find((e) => !e.ok || !e.body);
                const detail = firstErr
                    ? `${firstErr.error || firstErr.code || 'empty'}${
                          firstErr.url ? ` · ${firstErr.url}` : ''
                      }`
                    : '';
                setError(
                    failCount && !okCount
                        ? `${t('classroomEssayScrapeFetchFailed')}${detail ? ` (${detail})` : ''}`
                        : t('classroomEssayScrapeFetchPartial')
                              .replace('{ok}', String(okCount))
                              .replace('{fail}', String(failCount))
                              .replace('{detail}', detail)
                );
            }
        } catch (err) {
            if (err && err.name === 'AbortError') {
                setError(t('classroomEssayTmsBridgeTimeout'));
            } else {
                setError((err && err.message) || t('classroomEssayScrapeFetchFailed'));
            }
            setStatus('');
        } finally {
            if (stillTimer) {
                clearTimeout(stillTimer);
            }
            if (abortTimer) {
                clearTimeout(abortTimer);
            }
            fetchingBodies = false;
            updateActionButtons();
        }
    }

    function openBatchEditor() {
        const selected = allRows.filter((r) => selectedKeys.has(r.key) && r.bodyOk && r.body);
        if (!selected.length) {
            setError(t('classroomEssayScrapeNeedBodies'));
            return;
        }
        const byType = new Map();
        selected.forEach((r) => {
            const typ = mapEssayType(r.title);
            if (!byType.has(typ)) {
                byType.set(typ, []);
            }
            byType.get(typ).push({
                studentName: r.displayName || r.name,
                className: r.className,
                essayText: r.body,
                title: r.title
            });
        });
        const types = Array.from(byType.keys());
        const opened = [];
        const blocked = [];
        const savedAt = new Date().toISOString();
        types.forEach((essayType) => {
            const essays = byType.get(essayType) || [];
            const payload = { essayType, essays, savedAt };
            const payloadJson = JSON.stringify(payload);
            const storageKey = `${SESSION_BATCH_KEY}_${essayType}`;
            try {
                // Per-type keys so multiple editor tabs do not race on one payload.
                localStorage.setItem(storageKey, payloadJson);
                sessionStorage.setItem(storageKey, payloadJson);
            } catch (err) {
                blocked.push(essayType);
                return;
            }
            const editorUrl = `${location.origin}/tools/essay-batch-editor.html?batchType=${encodeURIComponent(
                essayType
            )}`;
            let win = null;
            try {
                win = window.open(editorUrl, `ccmuEssayBatchEditor_${essayType}`);
            } catch (_) {
                win = null;
            }
            if (!win) {
                blocked.push(essayType);
                return;
            }
            opened.push(essayType);
            try {
                win.focus();
            } catch (_) {
                /* ignore */
            }
        });
        if (!opened.length) {
            setError(
                blocked.length
                    ? `${t('classroomEssayScrapePopupBlocked')} ${t('classroomEssayScrapeOpenManually')}`
                    : t('classroomEssayScrapeSessionFull')
            );
            return;
        }
        const totalEssays = selected.length;
        let msg = t('classroomEssayScrapeEditorOpenedMulti')
            .replace('{windows}', String(opened.length))
            .replace('{count}', String(totalEssays))
            .replace('{types}', opened.join(', '));
        if (blocked.length) {
            msg += ` ${t('classroomEssayScrapeEditorPartialBlocked').replace(
                '{types}',
                blocked.join(', ')
            )}`;
            setError(
                `${t('classroomEssayScrapePopupBlocked')} ${t('classroomEssayScrapeOpenManually')}`
            );
        } else {
            setError('');
        }
        setStatus(msg);
        if (hooks.showToast) {
            hooks.showToast(msg, blocked.length > 0);
        }
    }

    function openModal() {
        if (!hooks) {
            return;
        }
        if (hooks.isViewOnly && hooks.isViewOnly()) {
            if (hooks.showToast) {
                hooks.showToast(t('rosterImportReadOnly') || 'Read only', true);
            }
            return;
        }
        setError('');
        setStatus('');
        hydrateCreds();
        restoreSessionRows();
        if (allRows.length) {
            rebuildFilterUi();
            applyFilters();
            const filtersEl = document.getElementById('essayScrapeFilters');
            const resultsEl = document.getElementById('essayScrapeResults');
            if (filtersEl) {
                filtersEl.hidden = false;
            }
            if (resultsEl) {
                resultsEl.hidden = false;
            }
            setStatus(
                t('classroomEssayScrapeSessionRestored').replace('{count}', String(allRows.length))
            );
        } else {
            const filtersEl = document.getElementById('essayScrapeFilters');
            const resultsEl = document.getElementById('essayScrapeResults');
            if (filtersEl) {
                filtersEl.hidden = true;
            }
            if (resultsEl) {
                resultsEl.hidden = true;
            }
        }
        updateActionButtons();
        if (hooks.openModal) {
            hooks.openModal(document.getElementById('essayScrapeEditorModal'));
        }
    }

    function closeModal() {
        if (hooks && hooks.closeModal) {
            hooks.closeModal(document.getElementById('essayScrapeEditorModal'));
        }
    }

    function bindUi() {
        if (bound) {
            return;
        }
        bound = true;
        document.getElementById('classroomEssaysScrapeEditorBtn')?.addEventListener('click', () => {
            openModal();
        });
        document.getElementById('essayScrapeLoadBtn')?.addEventListener('click', () => {
            void loadList();
        });
        document.getElementById('essayScrapePassword')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void loadList();
            }
        });
        document.getElementById('essayScrapeFetchBodiesBtn')?.addEventListener('click', () => {
            void fetchBodies();
        });
        document.getElementById('essayScrapeOpenEditorBtn')?.addEventListener('click', () => {
            openBatchEditor();
        });
        document.getElementById('essayScrapeSelectAllBtn')?.addEventListener('click', () => {
            selectAllFiltered();
        });
        document.getElementById('essayScrapeClearSelectionBtn')?.addEventListener('click', () => {
            clearSelection();
        });
        document.getElementById('essayScrapeClearFiltersBtn')?.addEventListener('click', () => {
            clearFilters();
        });
        document.getElementById('cancelEssayScrapeEditorBtn')?.addEventListener('click', () => {
            closeModal();
        });
        document.getElementById('closeEssayScrapeEditorModal')?.addEventListener('click', () => {
            closeModal();
        });
        document.getElementById('essayScrapeBridgeTestBtn')?.addEventListener('click', () => {
            window.open('http://127.0.0.1:8080/api/tms/bridge/ping', '_blank', 'noopener,noreferrer');
        });
        document.getElementById('essayScrapeFromDate')?.addEventListener('change', (e) => {
            filterState.fromDate = e.target.value || '';
            applyFilters();
        });
        document.getElementById('essayScrapeToDate')?.addEventListener('change', (e) => {
            filterState.toDate = e.target.value || '';
            applyFilters();
        });
    }

    function init(h) {
        hooks = h;
        bindUi();
    }

    global.CCPClassroomEssayScrapeEditor = {
        init,
        openModal
    };
})(typeof window !== 'undefined' ? window : globalThis);
