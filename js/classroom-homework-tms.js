/**
 * TMS 숙제확인 → Classroom Homework completions (this class / selected assignment).
 */
(function (global) {
    const USERNAME_KEY = 'ccp.tmsRosterUsername';
    const BRIDGE_TIMEOUT_MS = 120000;
    const STILL_LOADING_MS = 15000;

    let hooks = null;
    let ctxApi = null;
    let bound = false;
    let plan = null;
    let loading = false;

    function t(key) {
        return hooks && typeof hooks.t === 'function' ? hooks.t(key) : key;
    }

    function tf(key, params) {
        let text = t(key);
        Object.keys(params || {}).forEach((name) => {
            text = String(text).replace(new RegExp('\\{' + name + '\\}', 'g'), String(params[name]));
        });
        return text;
    }

    function domain() {
        return global.CCPClassroomDomain;
    }

    function getAppData() {
        return hooks && hooks.getAppData ? hooks.getAppData() : {};
    }

    function setStatus(msg) {
        const el = document.getElementById('homeworkTmsSyncStatus');
        if (el) {
            el.textContent = msg || '';
        }
    }

    function setError(msg) {
        const el = document.getElementById('homeworkTmsSyncError');
        if (!el) {
            return;
        }
        el.hidden = !msg;
        el.textContent = msg || '';
    }

    function setConfirmEnabled(on) {
        const btn = document.getElementById('homeworkTmsSyncConfirmBtn');
        if (btn) {
            btn.disabled = !on;
        }
    }

    function hydrateCredForm() {
        const userEl = document.getElementById('homeworkTmsUsername');
        const rememberEl = document.getElementById('homeworkTmsRememberUser');
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

    function readCreds() {
        const userEl = document.getElementById('homeworkTmsUsername');
        const passEl = document.getElementById('homeworkTmsPassword');
        const rememberEl = document.getElementById('homeworkTmsRememberUser');
        return {
            username: userEl ? String(userEl.value || '').trim() : '',
            password: passEl ? String(passEl.value || '') : '',
            rememberUser: Boolean(rememberEl && rememberEl.checked)
        };
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

    function isLocalClassManagerHost() {
        try {
            if (typeof location === 'undefined') {
                return false;
            }
            const host = String(location.hostname || '').toLowerCase();
            return host === 'localhost' || host === '127.0.0.1';
        } catch (_) {
            return false;
        }
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

    async function probeLocalBridge() {
        if (isLocalClassManagerHost()) {
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
                    tmsBridgeFetchInit({
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
                        previewUrl: `${base}/api/tms/bridge/homework/preview`
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

    function linkedTmsClassIds() {
        const d = domain();
        const classId = ctxApi && ctxApi.getClassId ? ctxApi.getClassId() : '';
        if (!d || !d.getLinkedTmsClassIdsForClass || !classId) {
            return [];
        }
        return d.getLinkedTmsClassIdsForClass(getAppData(), classId) || [];
    }

    function currentClassName() {
        if (ctxApi && typeof ctxApi.getClassName === 'function') {
            return String(ctxApi.getClassName() || '').trim();
        }
        const classId = ctxApi && ctxApi.getClassId ? ctxApi.getClassId() : '';
        const data = getAppData();
        const cls = (Array.isArray(data.classes) ? data.classes : []).find(
            (c) => c && String(c.id) === String(classId)
        );
        return cls && cls.name ? String(cls.name).trim() : '';
    }

    function openModal() {
        plan = null;
        setError('');
        setStatus('');
        setConfirmEnabled(false);
        hydrateCredForm();
        const classId = ctxApi && ctxApi.getClassId ? ctxApi.getClassId() : '';
        const syllabusRowId = ctxApi && ctxApi.getSyllabusRowId ? ctxApi.getSyllabusRowId() : '';
        if (!classId || !syllabusRowId) {
            setError(t('classroomHomeworkTmsSyncNeedAssignment'));
        }
        if (hooks && hooks.openModal) {
            hooks.openModal(document.getElementById('homeworkTmsSyncModal'));
        }
    }

    function closeModal() {
        if (hooks && hooks.closeModal) {
            hooks.closeModal(document.getElementById('homeworkTmsSyncModal'));
        }
    }

    async function loadPreview() {
        if (!hooks) {
            return;
        }
        if (hooks.isViewOnly && hooks.isViewOnly()) {
            setError(t('rosterImportReadOnly') || 'Read only');
            return;
        }
        const classId = ctxApi && ctxApi.getClassId ? ctxApi.getClassId() : '';
        const syllabusRowId = ctxApi && ctxApi.getSyllabusRowId ? ctxApi.getSyllabusRowId() : '';
        if (!classId || !syllabusRowId) {
            setError(t('classroomHomeworkTmsSyncNeedAssignment'));
            return;
        }
        const creds = readCreds();
        persistUsername(creds.username, creds.rememberUser);
        plan = null;
        loading = true;
        setError('');
        setStatus(t('classroomHomeworkTmsSyncLoading'));
        setConfirmEnabled(false);
        const loadBtn = document.getElementById('homeworkTmsLoadBtn');
        if (loadBtn) {
            loadBtn.disabled = true;
        }

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        let stillTimer = null;
        let abortTimer = null;
        const finish = () => {
            loading = false;
            if (stillTimer) {
                clearTimeout(stillTimer);
            }
            if (abortTimer) {
                clearTimeout(abortTimer);
            }
            if (loadBtn) {
                loadBtn.disabled = false;
            }
        };

        try {
            const payload = {};
            if (creds.username || creds.password) {
                payload.username = creds.username;
                payload.password = creds.password;
            }
            const tmsClassIds = linkedTmsClassIds();
            if (tmsClassIds[0]) {
                payload.tmsClassId = tmsClassIds[0];
            }
            if (tmsClassIds.length) {
                payload.tmsClassIds = tmsClassIds;
            }
            const className = currentClassName();
            if (className) {
                payload.className = className;
            }
            const onLocalHost = isLocalClassManagerHost();
            const bridge = await probeLocalBridge();
            const previewUrl = bridge
                ? bridge.previewUrl
                : onLocalHost
                  ? '/api/tms/homework/preview'
                  : '';
            if (!bridge && !onLocalHost) {
                setError(
                    `${t('rosterTmsBridgeMissingHint')} ${t('rosterTmsBridgeLocalNetworkHint')}`
                );
                setStatus('');
                finish();
                return;
            }
            if (bridge) {
                setStatus(t('classroomHomeworkTmsBridgeLoading'));
            }
            stillTimer = setTimeout(() => {
                if (loading) {
                    setStatus(t('classroomHomeworkTmsBridgeLoading'));
                }
            }, STILL_LOADING_MS);
            if (controller) {
                abortTimer = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
            }
            const fetchInit = bridge
                ? tmsBridgeFetchInit({
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
                      signal: controller ? controller.signal : undefined
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
                } else if (code === 'TMS_BRIDGE_REQUIRED') {
                    setError(t('briefingErrorBridgeRequired'));
                } else {
                    setError((body && body.error) || t('rosterTmsSyncFailed') || res.statusText);
                }
                setStatus('');
                finish();
                return;
            }
            const d = domain();
            if (!d || !d.previewTmsHomeworkSyncPlan) {
                setError(t('classroomModuleMissing'));
                finish();
                return;
            }
            plan = d.previewTmsHomeworkSyncPlan(getAppData(), {
                classId,
                syllabusRowId,
                tmsClasses: (body && body.classes) || []
            });
            const matched = (plan.updates || []).length;
            const skippedCount = (plan.skipped || []).length;
            const unmatchedCount = (plan.unmatched || []).length;
            if (!matched && !unmatchedCount && skippedCount) {
                setStatus(tf('classroomHomeworkTmsSyncNothingToApply', { count: String(skippedCount) }));
                setConfirmEnabled(false);
            } else if (!matched && !unmatchedCount) {
                setStatus(t('classroomHomeworkTmsSyncEmpty'));
                setConfirmEnabled(false);
            } else {
                setStatus(
                    tf('classroomHomeworkTmsSyncPreview', {
                        matched: String(matched),
                        missing: String(plan.missingCount || 0),
                        selfCheck: String(plan.selfCheckCount || 0),
                        parentCheck: String(plan.parentCheckCount || 0),
                        unmatched: String((plan.unmatched || []).length)
                    })
                );
                setConfirmEnabled(matched > 0);
            }
        } catch (err) {
            setError(err && err.message ? err.message : String(err));
            setStatus('');
        } finally {
            finish();
        }
    }

    async function applyPreview() {
        if (!plan || !hooks || !hooks.saveClassroom) {
            return;
        }
        const d = domain();
        if (!d || !d.applyTmsHomeworkSync) {
            return;
        }
        const classId = ctxApi && ctxApi.getClassId ? ctxApi.getClassId() : '';
        const syllabusRowId = ctxApi && ctxApi.getSyllabusRowId ? ctxApi.getSyllabusRowId() : '';
        const lessonDate = ctxApi && ctxApi.getLessonDate ? ctxApi.getLessonDate() : '';
        const data = getAppData();
        const next = d.applyTmsHomeworkSync(data.homeworkCompletions, plan, {
            classId,
            syllabusRowId,
            lessonDate,
            authorUserId: hooks.getCurrentUserId ? hooks.getCurrentUserId() : ''
        });
        const confirmBtn = document.getElementById('homeworkTmsSyncConfirmBtn');
        if (confirmBtn) {
            confirmBtn.disabled = true;
        }
        try {
            await hooks.saveClassroom({ homeworkCompletions: next });
            if (hooks.showToast) {
                hooks.showToast(t('classroomHomeworkTmsApplied'));
            }
            if (global.CCPTabWarnings && global.CCPTabWarnings.scheduleRefresh) {
                global.CCPTabWarnings.scheduleRefresh();
            }
            closeModal();
            if (ctxApi && typeof ctxApi.afterApply === 'function') {
                ctxApi.afterApply();
            }
        } catch (err) {
            setError(err && err.message ? err.message : String(err));
            setConfirmEnabled(true);
        }
    }

    function bindUi() {
        if (bound) {
            return;
        }
        bound = true;
        document.getElementById('classroomHomeworkTmsSyncBtn')?.addEventListener('click', () => {
            openModal();
        });
        document.getElementById('homeworkTmsLoadBtn')?.addEventListener('click', () => {
            void loadPreview();
        });
        document.getElementById('homeworkTmsPassword')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void loadPreview();
            }
        });
        document.getElementById('homeworkTmsSyncConfirmBtn')?.addEventListener('click', () => {
            void applyPreview();
        });
        document.getElementById('cancelHomeworkTmsSyncBtn')?.addEventListener('click', () => {
            closeModal();
        });
        document.getElementById('closeHomeworkTmsSyncModal')?.addEventListener('click', () => {
            closeModal();
        });
        document.getElementById('homeworkTmsBridgeTestBtn')?.addEventListener('click', () => {
            window.open('http://127.0.0.1:8080/api/tms/bridge/ping', '_blank', 'noopener,noreferrer');
        });
    }

    function init(h, api) {
        hooks = h;
        ctxApi = api || {};
        bindUi();
    }

    global.CCPClassroomHomeworkTms = {
        init,
        openModal
    };
})(typeof window !== 'undefined' ? window : globalThis);
