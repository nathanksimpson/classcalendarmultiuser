/**
 * Debounced auto-save + status pill for classroom sheet tabs.
 */
(function (global) {
    /**
     * @param {{
     *   delayMs?: number,
     *   debounce?: Function,
     *   t: (key: string) => string,
     *   getStatusEl: () => HTMLElement|null,
     *   saveAsync: (opts: { silent?: boolean }) => Promise<void>,
     *   i18nPrefix?: string
     * }} options
     */
    function create(options) {
        const opts = options || {};
        const delayMs = opts.delayMs != null ? opts.delayMs : 500;
        const t = opts.t || ((key) => key);
        const getStatusEl = opts.getStatusEl || (() => null);
        const saveAsync = opts.saveAsync;
        const i18nPrefix = opts.i18nPrefix || 'classroomSave';

        let saveStatus = 'saved';
        let saveInFlight = null;
        let debouncedSave = null;

        function statusKey(state) {
            const suffix =
                state === 'saved'
                    ? 'Saved'
                    : state === 'saving'
                      ? 'Saving'
                      : state === 'pending'
                        ? 'Pending'
                        : 'Error';
            return `${i18nPrefix}${suffix}`;
        }

        function updateStatus(state) {
            saveStatus = state;
            const el = getStatusEl();
            if (!el) {
                return;
            }
            el.textContent = t(statusKey(state));
            el.className = `classroom-save-status section-hint classroom-save-status--${state}`;
        }

        function ensureDebounced() {
            if (debouncedSave || typeof opts.debounce !== 'function') {
                return;
            }
            debouncedSave = opts.debounce(() => {
                void invokeSave({ silent: true });
            }, delayMs);
        }

        function scheduleSave() {
            ensureDebounced();
            if (debouncedSave) {
                updateStatus('pending');
                debouncedSave();
            } else {
                void invokeSave({ silent: true });
            }
        }

        async function invokeSave(saveOpts) {
            const silent = saveOpts && saveOpts.silent;
            if (saveInFlight) {
                await saveInFlight;
            }
            updateStatus('saving');
            const run = (async () => {
                try {
                    await saveAsync({ silent: !!silent });
                    updateStatus('saved');
                } catch (err) {
                    updateStatus('error');
                    throw err;
                }
            })();
            saveInFlight = run;
            try {
                await run;
            } finally {
                saveInFlight = null;
            }
        }

        async function flushPendingSave() {
            if (debouncedSave && debouncedSave.flush) {
                debouncedSave.flush();
            }
            if (saveInFlight) {
                await saveInFlight;
            }
        }

        async function flushBeforeLeave() {
            await flushPendingSave();
        }

        function bindManualSaveBtn(panel, selector, canSave) {
            const btn = panel && panel.querySelector(selector);
            if (!btn) {
                return;
            }
            const editable = typeof canSave === 'function' ? canSave() : !!canSave;
            btn.disabled = !editable;
            if (btn.dataset.ccpAutosaveBound === '1') {
                return;
            }
            btn.dataset.ccpAutosaveBound = '1';
            btn.addEventListener('click', () => {
                if (debouncedSave && debouncedSave.flush) {
                    debouncedSave.flush();
                }
                void invokeSave({ silent: false });
            });
        }

        function syncStatusDisplay() {
            updateStatus(saveStatus === 'pending' ? 'pending' : saveStatus);
        }

        return {
            scheduleSave,
            flushPendingSave,
            flushBeforeLeave,
            bindManualSaveBtn,
            syncStatusDisplay,
            updateStatus,
            invokeSave
        };
    }

    global.CCPClassroomAutosave = {
        create
    };
})(typeof window !== 'undefined' ? window : globalThis);
