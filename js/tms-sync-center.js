/**
 * Header Sync Center. Existing Sync buttons open this modal.
 * Review markup stays in the tab panes (same element ids) so each module can still apply.
 */
(function (global) {
    'use strict';

    const KIND_ORDER = ['roster', 'essays', 'homework', 'counsel'];
    const KIND_TAB = {
        roster: 'students',
        essays: 'essays',
        homework: 'homework-tracking',
        counsel: 'briefing'
    };

    let password = '';
    let openOptions = null;
    let pendingResolve = null;
    let results = {};
    let applied = {};
    let running = false;
    let hosted = false;
    let helperViewState = null;
    let helperToggleBusy = false;
    let guideAutoShown = false;
    let guideStoppedByUser = false;
    let guideTimer = null;
    let guideStartedAt = 0;
    let guideStep = 1;
    let guideNoteMode = '';
    let guideDownloadStarted = false;
    const HELPER_START_URL = 'classmanager-sync://start';
    const INSTALLER_URL = 'https://github.com/nathanksimpson/classcalendarmultiuser/releases/download/sync-helper-1.0.0/ClassManagerSyncSetup.exe';
    const HELPER_UNINSTALL_URL = 'classmanager-sync://uninstall';
    const HELPER_SEEN_KEY = 'ccp.syncHelperInstalled';
    const GUIDE_DONE_KEY = 'ccp.syncHelperGuideDone';
    const GUIDE_SKIP_KEY = 'ccp.syncHelperGuideSkipped';
    const GUIDE_PROBE_MS = 2000;
    const GUIDE_DOWNLOAD_AFTER_MS = 4000;
    const GUIDE_WAIT_MS = 45000;
    const HEALTH_PROBE_MS = 45000;
    const HEALTH_TOAST_COOLDOWN_MS = 5 * 60 * 1000;
    const SAFE_QUICK_KINDS = ['homework', 'essays', 'counsel'];

    let healthTimer = null;
    let healthWasReady = false;
    let healthToastAt = 0;

    function t(key, fallback) {
        try {
            if (typeof global.t === 'function') {
                const val = global.t(key);
                if (val && val !== key) {
                    return val;
                }
            }
        } catch (_) {
            /* ignore */
        }
        return fallback || key;
    }

    function syncApi() {
        return global.CCPTmsSync || null;
    }

    function getCredentials() {
        const userEl = document.getElementById('tmsSyncUsername');
        const passEl = document.getElementById('tmsSyncPassword');
        const rememberEl = document.getElementById('tmsSyncRememberUser');
        if (passEl) {
            password = String(passEl.value || '');
        }
        return {
            username: userEl ? String(userEl.value || '').trim() : '',
            password: password,
            rememberUser: Boolean(rememberEl && rememberEl.checked)
        };
    }

    function activeClassId() {
        try {
            if (global.CCPClassroomZoneContext && global.CCPClassroomZoneContext.getActiveClassId) {
                return global.CCPClassroomZoneContext.getActiveClassId() || '';
            }
            if (global.CCPActiveContext && global.CCPActiveContext.getActiveClassId) {
                return global.CCPActiveContext.getActiveClassId() || '';
            }
        } catch (_) {
            /* ignore */
        }
        return '';
    }

    function scopeMode() {
        const picked = document.querySelector('input[name="tmsSyncScope"]:checked');
        return picked && picked.value === 'class' ? 'class' : 'all';
    }

    function scopePayload() {
        const mode = scopeMode();
        const classId = mode === 'class' ? activeClassId() || (openOptions && openOptions.scope && openOptions.scope.classId) || '' : '';
        return { mode: mode, classId: classId };
    }

    function selectedKinds() {
        return KIND_ORDER.filter((kind) => {
            const box = document.querySelector('input[name="tmsSyncKind"][value="' + kind + '"]');
            return Boolean(box && box.checked);
        });
    }

    function classroomHooks() {
        if (typeof global.getClassroomHooks === 'function') {
            try {
                return global.getClassroomHooks();
            } catch (_) {
                return null;
            }
        }
        return null;
    }

    async function ensureKind(kind) {
        const tabId = KIND_TAB[kind];
        if (tabId && global.CCPTabScripts && global.CCPTabScripts.ensureTabScripts) {
            await global.CCPTabScripts.ensureTabScripts(tabId);
        }
        const hooks = classroomHooks();
        if (kind === 'roster' && global.CCPClassroomRoster && global.CCPClassroomRoster.ensureSyncUi) {
            global.CCPClassroomRoster.ensureSyncUi(hooks);
        }
        if (kind === 'essays' && global.CCPClassroomEssays && global.CCPClassroomEssays.ensureSyncUi) {
            global.CCPClassroomEssays.ensureSyncUi(hooks);
        }
        if (kind === 'homework' && global.CCPClassroomHomeworkTms && global.CCPClassroomHomeworkTms.ensureSyncUi) {
            global.CCPClassroomHomeworkTms.ensureSyncUi(hooks);
        }
        if (kind === 'counsel' && global.CCPClassroomBriefing && global.CCPClassroomBriefing.ensureSyncUi) {
            global.CCPClassroomBriefing.ensureSyncUi(hooks);
        }
    }

    function hostReviews() {
        if (hosted) {
            return;
        }
        const map = {
            tmsSyncPaneRoster: 'rosterTmsReviewMount',
            tmsSyncPaneEssays: 'essayTmsReviewMount',
            tmsSyncPaneHomework: 'homeworkTmsReviewMount',
            tmsSyncPaneCounsel: 'briefingTmsReviewMount'
        };
        Object.keys(map).forEach((paneId) => {
            const pane = document.getElementById(paneId);
            const mount = document.getElementById(map[paneId]);
            if (pane && mount) {
                pane.appendChild(mount);
            }
        });
        hosted = true;
    }

    function statusLabel(state) {
        const status = state && state.status;
        if (status === 'same-origin') {
            return t('tmsSyncStatusSameOrigin', 'This PC — TMS uses the school network.');
        }
        if (status === 'ready') {
            const ver = state.version ? ' ' + state.version : '';
            return t('tmsSyncStatusReady', 'Helper ready') + ver;
        }
        if (status === 'outdated') {
            return t('tmsSyncStatusOutdated', 'Helper is out of date');
        }
        return t('tmsSyncStatusMissing', 'Helper not found');
    }

    function notify(message, isError) {
        if (!message) {
            return;
        }
        if (global.CCPNotice && typeof global.CCPNotice.show === 'function') {
            global.CCPNotice.show(message, { type: isError ? 'error' : 'info' });
            return;
        }
        if (typeof global.showSyncToast === 'function') {
            global.showSyncToast(message, Boolean(isError));
        }
    }

    function paintStaleNudge(state) {
        const btn = document.getElementById('tmsSyncCenterBtn');
        const api = syncApi();
        const ready = api && api.isBridgeReady
            ? api.isBridgeReady(state)
            : Boolean(state && (state.status === 'ready' || state.status === 'same-origin'));
        const stale = ready && api && api.isLastSyncStale ? api.isLastSyncStale() : false;
        if (btn) {
            btn.classList.toggle('tms-sync-center-btn--stale', stale);
            if (stale) {
                btn.title = t(
                    'tmsSyncStaleNudgeTitle',
                    'TMS sync is overdue — open Sync to Load and Apply'
                );
                btn.setAttribute('data-i18n-title', 'tmsSyncStaleNudgeTitle');
            } else {
                btn.title = t('tmsSyncCenterBtnTitle', 'Sync from TMS');
                btn.setAttribute('data-i18n-title', 'tmsSyncCenterBtnTitle');
            }
        }
        const dot = document.getElementById('tmsSyncCenterDot');
        if (dot && stale) {
            dot.classList.add('tms-sync-status-dot--stale');
        }
        return stale;
    }

    function paintHelper(state) {
        const text = document.getElementById('tmsSyncHelperText');
        const hint = document.getElementById('tmsSyncHelperHint');
        const dot = document.getElementById('tmsSyncCenterDot');
        const helperDot = document.getElementById('tmsSyncHelperDot');
        const status = (state && state.status) || 'missing';
        [dot, helperDot].forEach((el) => {
            if (!el) {
                return;
            }
            el.className = 'tms-sync-status-dot tms-sync-status-dot--' + status;
        });
        if (text) {
            text.textContent = statusLabel(state);
        }
        const helperInstall = status === 'missing' || (status === 'outdated' && state && state.bridgeKind === 'helper');
        const devOutdated = status === 'outdated' && !(state && state.bridgeKind === 'helper');
        if (hint) {
            if (status === 'missing') {
                hint.textContent = t(
                    'tmsSyncMissingTitle',
                    'Install the Sync Helper (one time, about 1 minute)'
                );
            } else if (helperInstall) {
                hint.textContent = t('tmsSyncOutdatedHelperTitle', 'Update Sync Helper');
            } else if (devOutdated) {
                hint.textContent = t(
                    'tmsSyncOutdatedHint',
                    'Update the local ClassManager (restart npm start).'
                );
            } else {
                hint.textContent = '';
            }
        }
        const steps = document.getElementById('tmsSyncHelperSteps');
        if (steps) {
            steps.hidden = !helperInstall;
            steps.textContent = helperInstall
                ? t(
                    'tmsSyncMissingSteps',
                    'TMS only accepts the school network. The helper lets ClassManager sync through this PC. 1. Download the installer. 2. Double-click it. If Windows warns you, click More info, then Run anyway. 3. Come back and press Check again. If Check again still fails: lock icon by the address bar → Site settings → Local network access → Allow.'
                )
                : '';
        }
        const link = document.getElementById('tmsSyncHelperDownload');
        if (link) {
            link.hidden = !helperInstall;
            if (state && state.downloadUrl) {
                link.href = state.downloadUrl;
            }
        }
        helperViewState = state || { status: 'missing' };
        paintHeaderHelper(helperViewState);
        paintStaleNudge(helperViewState);
    }

    function startHealthWatch() {
        if (healthTimer) {
            return;
        }
        const api = syncApi();
        if (api && api.isBridgeReady) {
            healthWasReady = api.isBridgeReady(api.getBridgeState && api.getBridgeState());
        }
        const tick = async () => {
            const sync = syncApi();
            if (!sync || !sync.detectBridge) {
                return;
            }
            try {
                const state = await sync.detectBridge();
                const ready = sync.isBridgeReady ? sync.isBridgeReady(state) : false;
                if (healthWasReady && !ready) {
                    const now = Date.now();
                    if (now - healthToastAt >= HEALTH_TOAST_COOLDOWN_MS) {
                        healthToastAt = now;
                        notify(
                            t(
                                'tmsHelperDroppedToast',
                                'Sync Helper disconnected on this PC. Reopen Helper or Check again in Sync.'
                            ),
                            true
                        );
                    }
                }
                healthWasReady = ready;
                paintHelper(state);
            } catch (_) {
                /* next tick */
            }
        };
        healthTimer = setInterval(() => {
            void tick();
        }, HEALTH_PROBE_MS);
    }

    function headerMode(state) {
        const status = state && state.status;
        const kind = state && state.bridgeKind;
        if (status === 'same-origin' || (status === 'ready' && kind !== 'helper')) {
            return 'dev';
        }
        if (status === 'ready' && kind === 'helper') {
            return 'helper';
        }
        if (status === 'outdated' && kind === 'helper') {
            return 'update';
        }
        if (status === 'outdated') {
            return 'dev-old';
        }
        return 'off';
    }

    function paintHeaderHelper(state) {
        const btn = document.getElementById('tmsHelperToggle');
        const label = document.getElementById('tmsHelperToggleText');
        const dot = document.getElementById('tmsHelperToggleDot');
        if (!btn) {
            return;
        }
        const mode = headerMode(state);
        const name = t('tmsHelperBtn', 'Helper');
        let statusWord = t('tmsHelperOff', 'Off');
        let dotStatus = 'missing';
        if (mode === 'helper' || mode === 'dev') {
            statusWord = t('tmsHelperConnected', 'Connected');
            dotStatus = 'ready';
        } else if (mode === 'update' || mode === 'dev-old') {
            statusWord = t('tmsHelperUpdate', 'Update');
            dotStatus = 'outdated';
        }
        const caption = name + ' · ' + statusWord;
        if (label) {
            label.textContent = caption;
        }
        btn.setAttribute('aria-label', caption);
        btn.title = caption;
        btn.disabled = helperToggleBusy;
        if (dot) {
            dot.className = 'tms-sync-status-dot tms-sync-status-dot--' + dotStatus;
        }
        if (mode === 'helper' || mode === 'update') {
            try {
                localStorage.setItem(HELPER_SEEN_KEY, '1');
            } catch (_) {
                /* ignore */
            }
        }
        const uninstallBtn = document.getElementById('tmsHelperUninstall');
        if (uninstallBtn) {
            uninstallBtn.hidden = !helperInstallKnown(state);
            uninstallBtn.textContent = t('tmsHelperUninstall', 'Uninstall');
        }
    }

    function helperInstallKnown(state) {
        const mode = headerMode(state);
        if (mode === 'helper' || mode === 'update') {
            return true;
        }
        try {
            return localStorage.getItem(HELPER_SEEN_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function openHelperProtocol(url) {
        return new Promise((resolve) => {
            let blurred = false;
            const onBlur = () => {
                blurred = true;
            };
            window.addEventListener('blur', onBlur);
            const frame = document.createElement('iframe');
            frame.hidden = true;
            frame.setAttribute('aria-hidden', 'true');
            frame.src = url;
            document.body.appendChild(frame);
            setTimeout(() => {
                window.removeEventListener('blur', onBlur);
                frame.remove();
                resolve(blurred);
            }, 1200);
        });
    }

    async function onHelperUninstall(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const ok = window.confirm(t('tmsHelperUninstallConfirm', 'Remove the Sync Helper from this PC?'));
        if (!ok) {
            return;
        }
        const api = syncApi();
        const state = helperViewState;
        if (state && state.bridgeKind === 'helper' && api && api.stopHelper) {
            guideStoppedByUser = true;
            try {
                await api.stopHelper();
            } catch (_) {
                /* helper already stopped */
            }
            await delay(400);
            if (api.detectBridge) {
                await api.detectBridge();
            }
        }
        const opened = await openHelperProtocol(HELPER_UNINSTALL_URL);
        if (!opened) {
            window.alert(t(
                'tmsHelperUninstallSettings',
                'Open Windows Settings, then Apps, then ClassManager Sync Helper, then Uninstall.'
            ));
        }
    }

    function delay(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    function launchHelperFromClick() {
        window.location.assign(HELPER_START_URL);
    }

    function guideIsOpen() {
        const modal = document.getElementById('tmsHelperGuideModal');
        return Boolean(modal && modal.classList.contains('active'));
    }

    function paintGuideLabels() {
        const pairs = [
            ['tmsHelperGuideTitle', 'Set up the Sync Helper'],
            ['tmsHelperGuideSmartScreen', 'If Windows says it protected your PC, click More info, then Run anyway.'],
            ['tmsHelperGuidePassHint', 'Used for this sync only. Not saved in a file.'],
            ['tmsHelperGuideDoneText', 'This PC can now sync. TMS sees the school network through the helper.'],
            ['tmsHelperGuideNext', 'Open Sync in the header to load rosters and the other jobs.'],
            ['tmsHelperGuideFinish', 'Done'],
            ['tmsHelperGuideStart', 'Start the helper']
        ];
        pairs.forEach((pair) => {
            const el = document.getElementById(pair[0]);
            if (el) {
                el.textContent = t(pair[0], pair[1]);
            }
        });
        const steps = [
            ['1', 'tmsHelperGuideStepInstall', 'Install the helper'],
            ['2', 'tmsHelperGuideStepWait', 'Wait until it is running'],
            ['3', 'tmsHelperGuideStepSignIn', 'Sign in to TMS'],
            ['4', 'tmsHelperGuideStepDone', "You're ready"]
        ];
        steps.forEach((row) => {
            const li = document.querySelector('#tmsHelperGuideSteps li[data-guide-step="' + row[0] + '"] span');
            if (li) {
                li.textContent = t(row[1], row[2]);
            }
        });
        const userLabel = document.querySelector('label[for="tmsHelperGuideUsername"]');
        const passLabel = document.querySelector('label[for="tmsHelperGuidePassword"]');
        if (userLabel) {
            userLabel.textContent = t('rosterTmsUsernameLabel', 'TMS username');
        }
        if (passLabel) {
            passLabel.textContent = t('rosterTmsPasswordLabel', 'TMS password');
        }
    }

    function setGuideStep(step, noteMode) {
        guideStep = step;
        guideNoteMode = noteMode || '';
        paintGuideLabels();
        document.querySelectorAll('#tmsHelperGuideSteps li').forEach((li) => {
            const n = Number(li.getAttribute('data-guide-step'));
            li.classList.toggle('is-active', n === step);
            li.classList.toggle('is-done', n < step);
            if (n === step) {
                li.setAttribute('aria-current', 'step');
            } else {
                li.removeAttribute('aria-current');
            }
        });
        const smart = document.getElementById('tmsHelperGuideSmartScreen');
        const note = document.getElementById('tmsHelperGuideNote');
        const signIn = document.getElementById('tmsHelperGuideSignIn');
        const done = document.getElementById('tmsHelperGuideDone');
        const startRow = document.getElementById('tmsHelperGuideStartRow');
        const startLink = document.getElementById('tmsHelperGuideStart');
        if (startLink) {
            const installed = helperInstallKnown(helperViewState);
            if (installed) {
                startLink.href = HELPER_START_URL;
                startLink.textContent = t('tmsHelperGuideStart', 'Start the helper');
            } else {
                const fromState = helperViewState && helperViewState.downloadUrl;
                startLink.href = fromState || INSTALLER_URL;
                startLink.textContent = t('tmsSyncDownloadInstaller', 'Download installer');
            }
        }
        if (smart) {
            smart.hidden = step > 2;
        }
        if (startRow) {
            startRow.hidden = step >= 3;
        }
        const skipRow = document.getElementById('tmsHelperGuideSkipRow');
        if (skipRow) {
            skipRow.hidden = step >= 4;
        }
        if (signIn) {
            signIn.hidden = step < 3;
        }
        if (done) {
            done.hidden = step < 4;
        }
        if (note) {
            if (guideNoteMode === 'probe-failed') {
                note.textContent = t(
                    'tmsHelperGuideBlocked',
                    'The browser blocked the helper on this PC. Click the lock by the address bar, open Site settings, and set Local network access to Allow. Then click Start the helper.'
                );
            } else if (guideNoteMode === 'downloading') {
                note.textContent = t(
                    'tmsHelperGuideDownloading',
                    'The installer is downloading. Open ClassManagerSyncSetup.exe from the download bar.'
                );
            } else if (guideNoteMode === 'still-down') {
                note.textContent = t(
                    'tmsHelperGuideStillDown',
                    'Finish the installer window if it is still open. This page will move on when the helper is running.'
                );
            } else if (step === 2) {
                note.textContent = t('tmsHelperGuideWaitNote', 'Waiting for the helper on this PC.');
            } else {
                note.textContent = '';
            }
        }
    }

    function hydrateGuideCreds() {
        const api = syncApi();
        const saved = api && api.getSavedUsername ? api.getSavedUsername() : '';
        const userEl = document.getElementById('tmsSyncUsername');
        const passEl = document.getElementById('tmsSyncPassword');
        const guideUser = document.getElementById('tmsHelperGuideUsername');
        const guidePass = document.getElementById('tmsHelperGuidePassword');
        const name = String((userEl && userEl.value) || saved || '').trim();
        const secret = String((passEl && passEl.value) || password || '');
        if (guideUser) {
            guideUser.value = name;
        }
        if (guidePass) {
            guidePass.value = secret;
        }
    }

    function syncGuideCredsToMemory() {
        const guideUser = document.getElementById('tmsHelperGuideUsername');
        const guidePass = document.getElementById('tmsHelperGuidePassword');
        const name = guideUser ? String(guideUser.value || '').trim() : '';
        const secret = guidePass ? String(guidePass.value || '') : '';
        password = secret;
        const api = syncApi();
        if (name && api && api.setSavedUsername) {
            api.setSavedUsername(name, true);
        }
        const userEl = document.getElementById('tmsSyncUsername');
        const passEl = document.getElementById('tmsSyncPassword');
        const rememberEl = document.getElementById('tmsSyncRememberUser');
        if (userEl && name) {
            userEl.value = name;
        }
        if (passEl) {
            passEl.value = secret;
        }
        if (rememberEl && name) {
            rememberEl.checked = true;
        }
    }

    function stopGuideProbe() {
        if (guideTimer) {
            clearInterval(guideTimer);
            guideTimer = null;
        }
    }

    function closeHelperGuide() {
        stopGuideProbe();
        const modal = document.getElementById('tmsHelperGuideModal');
        if (global.CCPModal && modal) {
            global.CCPModal.close(modal);
        } else if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('hidden', '');
            modal.setAttribute('aria-hidden', 'true');
        }
    }

    function guideWasSkipped() {
        try {
            return localStorage.getItem(GUIDE_SKIP_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function skipHelperGuide() {
        guideStoppedByUser = true;
        try {
            localStorage.setItem(GUIDE_SKIP_KEY, '1');
        } catch (_) {
            /* ignore */
        }
        closeHelperGuide();
    }

    function finishHelperGuide() {
        syncGuideCredsToMemory();
        try {
            localStorage.setItem(GUIDE_DONE_KEY, '1');
        } catch (_) {
            /* ignore */
        }
        closeHelperGuide();
    }

    function connectedGuideStep() {
        const guideUser = document.getElementById('tmsHelperGuideUsername');
        const guidePass = document.getElementById('tmsHelperGuidePassword');
        const name = guideUser ? String(guideUser.value || '').trim() : '';
        const secret = guidePass ? String(guidePass.value || '') : '';
        return name && secret ? 4 : 3;
    }

    async function guideTick() {
        if (!guideIsOpen()) {
            stopGuideProbe();
            return;
        }
        const api = syncApi();
        if (!api || !api.detectBridge) {
            return;
        }
        const state = await api.detectBridge();
        if (!guideIsOpen()) {
            return;
        }
        const mode = headerMode(state);
        if (mode === 'helper' || mode === 'dev') {
            syncGuideCredsToMemory();
            setGuideStep(connectedGuideStep(), '');
            return;
        }
        if (mode === 'update') {
            const waited = Date.now() - guideStartedAt;
            setGuideStep(1, waited >= GUIDE_WAIT_MS ? 'still-down' : '');
            return;
        }
        if (!guideDownloadStarted && !helperInstallKnown(state)) {
            setGuideStep(1, '');
            return;
        }
        const elapsed = Date.now() - guideStartedAt;
        if (elapsed >= GUIDE_PROBE_MS) {
            setGuideStep(2, elapsed >= GUIDE_WAIT_MS ? 'still-down' : 'downloading');
            return;
        }
        setGuideStep(1, '');
    }

    function installerUrl() {
        const fromState = helperViewState && helperViewState.downloadUrl;
        return fromState || INSTALLER_URL;
    }

    function beginInstallerDownload() {
        const url = installerUrl();
        const link = document.getElementById('tmsHelperGuideStart');
        if (link) {
            link.href = url;
            link.textContent = t('tmsSyncDownloadInstaller', 'Download installer');
        }
        const a = document.createElement('a');
        a.href = url;
        document.body.appendChild(a);
        a.click();
        a.remove();
        guideDownloadStarted = true;
    }

    function startGuide(state, opts) {
        const update = Boolean(opts && opts.update);
        const modal = document.getElementById('tmsHelperGuideModal');
        if (!modal) {
            return;
        }
        if (guideIsOpen() && !update) {
            return;
        }
        guideStoppedByUser = false;
        hydrateGuideCreds();
        setGuideStep(1, '');
        if (global.CCPModal) {
            global.CCPModal.open(modal, document.getElementById('tmsHelperToggle'));
        } else {
            modal.removeAttribute('hidden');
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
        }
        guideStartedAt = Date.now();
        stopGuideProbe();
        guideTimer = window.setInterval(() => {
            void guideTick();
        }, GUIDE_PROBE_MS);
        void guideTick();
    }

    async function onHelperToggle() {
        if (helperToggleBusy) {
            return;
        }
        const api = syncApi();
        if (!api || !api.detectBridge) {
            return;
        }
        const modeBefore = headerMode(helperViewState);
        const state = await api.detectBridge();
        const mode = headerMode(state);
        if (mode === 'helper' && modeBefore !== 'helper') {
            return;
        }
        if (mode === 'helper') {
            const ok = window.confirm(t('tmsHelperStopConfirm', 'Stop the Sync Helper on this PC?'));
            if (!ok) {
                return;
            }
            helperToggleBusy = true;
            paintHeaderHelper(helperViewState);
            guideStoppedByUser = true;
            try {
                if (api.stopHelper) {
                    await api.stopHelper();
                }
                await delay(400);
                await api.detectBridge();
            } finally {
                helperToggleBusy = false;
                paintHeaderHelper(helperViewState);
            }
            return;
        }
        if (mode === 'dev') {
            return;
        }
        if (mode === 'dev-old') {
            void open({});
            return;
        }
        if (mode === 'update') {
            startGuide(state, { update: true });
            return;
        }
        startGuide(state, { update: false });
    }

    function paintLastSync() {
        const api = syncApi();
        const last = api && api.getLastSync ? api.getLastSync() : {};
        KIND_ORDER.forEach((kind) => {
            const el = document.getElementById('tmsSyncLast-' + kind);
            if (!el) {
                return;
            }
            const iso = last && last[kind];
            el.textContent = iso
                ? t('tmsSyncLastPrefix', 'Last sync') + ' ' + iso.replace('T', ' ').slice(0, 16)
                : t('tmsSyncLastNever', 'Not synced yet');
        });
    }

    function showPane(kind) {
        KIND_ORDER.forEach((name) => {
            const pane = document.getElementById('tmsSyncPane' + name.charAt(0).toUpperCase() + name.slice(1));
            const btn = document.querySelector('[data-tms-sync-tab="' + name + '"]');
            const on = name === kind;
            if (pane) {
                pane.hidden = !on;
            }
            if (btn) {
                btn.classList.toggle('is-active', on);
                btn.setAttribute('aria-selected', on ? 'true' : 'false');
            }
        });
        const tabs = document.getElementById('tmsSyncReviewTabs');
        if (tabs) {
            tabs.hidden = false;
        }
    }

    function setProgress(ratio, label) {
        const wrap = document.getElementById('tmsSyncProgress');
        const fill = document.getElementById('tmsSyncProgressFill');
        const text = document.getElementById('tmsSyncProgressLabel');
        if (wrap) {
            wrap.hidden = false;
        }
        const pct = Math.max(0, Math.min(100, Math.round((ratio || 0) * 100)));
        if (fill) {
            fill.style.width = pct + '%';
        }
        if (text) {
            text.textContent = label || pct + '%';
        }
    }

    function finishOpen(payload) {
        const resolve = pendingResolve;
        pendingResolve = null;
        openOptions = null;
        if (resolve) {
            resolve(payload || { results: results, applied: applied });
        }
    }

    function close() {
        const modal = document.getElementById('tmsSyncCenterModal');
        if (global.CCPModal && modal) {
            global.CCPModal.close(modal);
        } else if (modal) {
            modal.classList.remove('active');
            modal.hidden = true;
        }
        finishOpen({ results: results, applied: applied });
    }

    function applyScopeFromOptions(options) {
        const wantClass = Boolean(options && options.scope && (options.scope.classId || options.scope.mode === 'class'));
        const all = document.getElementById('tmsSyncScopeAll');
        const one = document.getElementById('tmsSyncScopeClass');
        if (all) {
            all.checked = !wantClass;
        }
        if (one) {
            one.checked = wantClass;
        }
    }

    function applyKindChecks(options) {
        const wanted = options && Array.isArray(options.kinds) && options.kinds.length ? options.kinds : KIND_ORDER.slice();
        KIND_ORDER.forEach((kind) => {
            const box = document.querySelector('input[name="tmsSyncKind"][value="' + kind + '"]');
            if (box) {
                box.checked = wanted.indexOf(kind) !== -1;
            }
        });
    }

    function hydrateCreds(options) {
        const api = syncApi();
        const userEl = document.getElementById('tmsSyncUsername');
        const passEl = document.getElementById('tmsSyncPassword');
        const rememberEl = document.getElementById('tmsSyncRememberUser');
        const preset = (options && options.credentials) || {};
        const saved = api && api.getSavedUsername ? api.getSavedUsername() : '';
        const username = String(preset.username || saved || '').trim();
        password = String(preset.password || '');
        if (userEl) {
            userEl.value = username;
        }
        if (passEl) {
            passEl.value = password;
        }
        if (rememberEl) {
            rememberEl.checked = Boolean(saved || preset.username);
        }
    }

    async function refreshHelper() {
        const api = syncApi();
        if (!api) {
            paintHelper({ status: 'missing' });
            return;
        }
        const state = await api.detectBridge();
        paintHelper(state);
    }

    function open(options) {
        hostReviews();
        if (pendingResolve) {
            finishOpen({ results: results, applied: applied, replaced: true });
        }
        openOptions = options || {};
        results = {};
        applied = {};
        return new Promise((resolve) => {
            pendingResolve = resolve;
            applyKindChecks(openOptions);
            applyScopeFromOptions(openOptions);
            hydrateCreds(openOptions);
            paintLastSync();
            const tabs = document.getElementById('tmsSyncReviewTabs');
            if (tabs && !results.roster && !results.essays && !results.homework && !results.counsel) {
                tabs.hidden = true;
            }
            const modal = document.getElementById('tmsSyncCenterModal');
            if (global.CCPModal && modal) {
                global.CCPModal.open(modal);
            } else if (modal) {
                modal.hidden = false;
                modal.classList.add('active');
            }
            void refreshHelper();
            const first = (openOptions.kinds && openOptions.kinds[0]) || 'roster';
            if (document.getElementById('tmsSyncReviewTabs') && document.getElementById('tmsSyncReviewTabs').hidden === false) {
                showPane(first === 'essayContent' ? 'essays' : first);
            }
        });
    }

    async function loadSelected() {
        if (running) {
            return;
        }
        const api = syncApi();
        if (!api) {
            return;
        }
        const creds = getCredentials();
        api.setSavedUsername(creds.username, creds.rememberUser);
        const kinds = selectedKinds();
        if (!kinds.length) {
            return;
        }
        running = true;
        const loadBtn = document.getElementById('tmsSyncLoadBtn');
        if (loadBtn) {
            loadBtn.disabled = true;
        }
        const scope = scopePayload();
        const studentGuess = scope.mode === 'class' ? 8 : 40;
        const minutes = api.estimateSyncMinutes(studentGuess);
        setProgress(0.05, t('tmsSyncWorking', 'Loading from TMS…') + ' (~' + minutes + ' min)');
        try {
            for (let i = 0; i < kinds.length; i += 1) {
                const kind = kinds[i];
                setProgress((i + 0.2) / kinds.length, t('tmsSyncWorking', 'Loading from TMS…'));
                await ensureKind(kind);
                showPane(kind);
                if (kind === 'roster' && global.CCPClassroomRoster && global.CCPClassroomRoster.loadTmsPreview) {
                    results.roster = await global.CCPClassroomRoster.loadTmsPreview(creds);
                } else if (kind === 'essays' && global.CCPClassroomEssays && global.CCPClassroomEssays.loadTmsPreview) {
                    results.essays = await global.CCPClassroomEssays.loadTmsPreview(creds, {
                        classId: scope.mode === 'class' ? scope.classId : ''
                    });
                } else if (kind === 'homework' && global.CCPClassroomHomeworkTms && global.CCPClassroomHomeworkTms.loadPreview) {
                    results.homework = await global.CCPClassroomHomeworkTms.loadPreview(creds);
                } else if (kind === 'counsel' && global.CCPClassroomBriefing && global.CCPClassroomBriefing.runSync) {
                    const classId = scope.mode === 'class' ? scope.classId : '';
                    results.counsel = await global.CCPClassroomBriefing.runSync(creds, { classId: classId });
                    applied.counsel = true;
                }
                setProgress((i + 1) / kinds.length, t('tmsSyncLoadedKind', 'Loaded'));
            }
            paintLastSync();
            paintStaleNudge(helperViewState);
            const firstLoaded = kinds[0];
            if (firstLoaded) {
                showPane(firstLoaded);
            }
        } finally {
            running = false;
            if (loadBtn) {
                loadBtn.disabled = false;
            }
        }
    }

    async function applyAll() {
        const order = selectedKinds();
        for (let i = 0; i < order.length; i += 1) {
            const kind = order[i];
            if (kind === 'roster') {
                const btn = document.getElementById('rosterTmsSyncConfirmBtn');
                if (btn && !btn.disabled) {
                    btn.click();
                    applied.roster = true;
                }
            } else if (kind === 'essays') {
                const btn = document.getElementById('essayTmsSyncConfirmBtn');
                if (btn && !btn.disabled) {
                    btn.click();
                    applied.essays = true;
                }
            } else if (kind === 'homework') {
                const btn = document.getElementById('homeworkTmsSyncConfirmBtn');
                if (btn && !btn.disabled) {
                    btn.click();
                    applied.homework = true;
                }
            }
        }
    }

    /** Apply only safe kinds — never roster (always needs review). */
    async function applySafeKinds() {
        const essayBtn = document.getElementById('essayTmsSyncConfirmBtn');
        if (essayBtn && !essayBtn.disabled) {
            essayBtn.click();
            applied.essays = true;
        }
        const homeworkBtn = document.getElementById('homeworkTmsSyncConfirmBtn');
        if (homeworkBtn && !homeworkBtn.disabled) {
            homeworkBtn.click();
            applied.homework = true;
        }
        /* counsel applies during Load via briefing.runSync */
    }

    function ensureQuickSyncKindsChecked() {
        document.querySelectorAll('input[name="tmsSyncKind"]').forEach((input) => {
            const kind = input.value;
            if (SAFE_QUICK_KINDS.includes(kind)) {
                input.checked = true;
            }
            /* leave roster as the teacher left it — Load may include it, Apply will not */
        });
    }

    async function quickSync() {
        if (running) {
            return;
        }
        ensureQuickSyncKindsChecked();
        if (!selectedKinds().length) {
            notify(t('tmsSyncQuickNone', 'Select at least one kind to sync.'), true);
            return;
        }
        await loadSelected();
        await applySafeKinds();
        paintStaleNudge(helperViewState || (syncApi() && syncApi().getBridgeState && syncApi().getBridgeState()));
        const rosterLoaded = Boolean(results.roster);
        if (rosterLoaded) {
            showPane('roster');
            notify(
                t(
                    'tmsSyncQuickRosterLeft',
                    'Quick sync applied safe kinds. Review roster, then Apply.'
                ),
                false
            );
        } else {
            notify(t('tmsSyncQuickDone', 'Quick sync finished for safe kinds.'), false);
        }
    }

    function wheelDeltaY(event) {
        if (event.deltaMode === 1) {
            return event.deltaY * 16;
        }
        if (event.deltaMode === 2) {
            return event.deltaY * (event.currentTarget.clientHeight || 0);
        }
        return event.deltaY;
    }

    /**
     * A horizontal scrollbar makes overflow-y compute to auto and adds a few
     * pixels of vertical range. That is not a real vertical scroller.
     */
    function consumesVerticalWheel(el) {
        if (!el || el.nodeType !== 1) {
            return false;
        }
        const oy = getComputedStyle(el).overflowY;
        if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') {
            return false;
        }
        const range = el.scrollHeight - el.clientHeight;
        if (range <= 1) {
            return false;
        }
        const bar = el.offsetHeight - el.clientHeight;
        if (bar > 0 && range <= bar + 1) {
            return false;
        }
        return true;
    }

    /** Vertical wheel always moves the dialog unless a nested box can really scroll. */
    function bindWheel(modal) {
        modal.addEventListener('wheel', (event) => {
            if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
                return;
            }
            const scroller = modal.querySelector('.modal-content > .modal-body-scroll');
            if (!scroller || !consumesVerticalWheel(scroller)) {
                return;
            }
            let node = event.target instanceof Element ? event.target : null;
            if (!node && event.target && event.target.parentElement) {
                node = event.target.parentElement;
            }
            while (node && node !== scroller && node !== modal) {
                if (consumesVerticalWheel(node)) {
                    return;
                }
                node = node.parentElement;
            }
            scroller.scrollTop += wheelDeltaY(event);
            event.preventDefault();
        }, { passive: false, capture: true });
    }

    function bind() {
        const modal = document.getElementById('tmsSyncCenterModal');
        if (!modal || modal.dataset.tmsSyncBound === '1') {
            return;
        }
        modal.dataset.tmsSyncBound = '1';
        bindWheel(modal);
        if (global.CCPModal && global.CCPModal.register) {
            global.CCPModal.register('tmsSyncCenterModal', {
                onClose: () => close()
            });
        }
        document.getElementById('tmsSyncCenterBtn')?.addEventListener('click', () => {
            void open({});
        });
        document.getElementById('tmsHelperToggle')?.addEventListener('click', () => {
            const known = helperViewState && helperViewState.checked;
            const mode = known ? headerMode(helperViewState) : 'off';
            if (mode === 'off' && helperInstallKnown(helperViewState)) {
                launchHelperFromClick();
            } else if (mode === 'off' || mode === 'update') {
                beginInstallerDownload();
            }
            void onHelperToggle();
        });
        document.getElementById('tmsHelperGuideStart')?.addEventListener('click', (event) => {
            const mode = headerMode(helperViewState);
            if (mode !== 'off' && mode !== 'update') {
                event.preventDefault();
                return;
            }
            if (!helperInstallKnown(helperViewState)) {
                guideDownloadStarted = true;
            }
        });
        document.getElementById('tmsHelperUninstall')?.addEventListener('click', (event) => {
            void onHelperUninstall(event);
        });
        document.addEventListener('calendarLanguageChanged', () => {
            paintHeaderHelper(helperViewState || { status: 'missing' });
            if (guideIsOpen()) {
                setGuideStep(guideStep, guideNoteMode);
            }
        });
        if (global.CCPModal && global.CCPModal.register) {
            global.CCPModal.register('tmsHelperGuideModal', {
                onClose: () => {
                    guideStoppedByUser = true;
                    try {
                        localStorage.setItem(GUIDE_SKIP_KEY, '1');
                    } catch (_) {
                        /* ignore */
                    }
                    stopGuideProbe();
                }
            });
        }
        document.getElementById('tmsHelperGuideClose')?.addEventListener('click', () => skipHelperGuide());
        document.getElementById('tmsHelperGuideSkip')?.addEventListener('click', () => skipHelperGuide());
        document.getElementById('tmsHelperGuideFinish')?.addEventListener('click', () => finishHelperGuide());
        const onGuideCredInput = () => {
            syncGuideCredsToMemory();
            if (!guideIsOpen() || guideStep < 3) {
                return;
            }
            const mode = headerMode(helperViewState);
            if (mode === 'helper' || mode === 'dev') {
                setGuideStep(connectedGuideStep(), '');
            }
        };
        document.getElementById('tmsHelperGuideUsername')?.addEventListener('input', onGuideCredInput);
        document.getElementById('tmsHelperGuidePassword')?.addEventListener('input', onGuideCredInput);
        document.getElementById('tmsSyncCenterClose')?.addEventListener('click', () => close());
        document.getElementById('tmsSyncCheckAgain')?.addEventListener('click', () => {
            void refreshHelper();
        });
        document.getElementById('tmsSyncLoadBtn')?.addEventListener('click', () => {
            void loadSelected();
        });
        document.getElementById('tmsSyncQuickBtn')?.addEventListener('click', () => {
            void quickSync();
        });
        document.getElementById('tmsSyncApplyAllBtn')?.addEventListener('click', () => {
            void applyAll();
        });
        document.getElementById('tmsSyncPassword')?.addEventListener('input', (e) => {
            password = String(e.target.value || '');
        });
        document.querySelectorAll('[data-tms-sync-tab]').forEach((btn) => {
            btn.addEventListener('click', () => showPane(btn.getAttribute('data-tms-sync-tab')));
        });
        const api = syncApi();
        if (api && api.onBridgeChange) {
            api.onBridgeChange(paintHelper);
        }
        void refreshHelper();
        startHealthWatch();
    }

    function boot() {
        hostReviews();
        bind();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    global.CCPTmsSyncCenter = {
        open: open,
        close: close,
        getCredentials: getCredentials
    };
})(typeof window !== 'undefined' ? window : globalThis);
