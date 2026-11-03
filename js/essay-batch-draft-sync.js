/**
 * Load and save the Batch Essay Editor's current batch for the signed-in teacher.
 * One draft per campus calendar. API keys stay in this browser.
 */
(function (global) {
    const SAVE_DEBOUNCE_MS = 1200;
    let saveTimer = null;
    let calendarId = '';
    let ready = false;
    let cloudAvailable = false;
    let conflict = false;
    let baseUpdatedAt = null;
    let clearRequested = false;
    let allowEmptyUpload = false;
    let saving = false;
    let saveAgain = false;
    let getDraftFn = function () {
        return null;
    };
    let onStatusFn = function () {};
    let onSavedFn = function () {};

    function setStatus(onStatus, message, isError) {
        if (typeof onStatus === 'function') {
            onStatus(message || '', Boolean(isError));
        }
    }

    function currentDraft() {
        const draft = typeof getDraftFn === 'function' ? getDraftFn() : null;
        return draft && typeof draft === 'object' ? draft : {};
    }

    function hasWork(draft) {
        if (!draft || typeof draft !== 'object') {
            return false;
        }
        if (typeof draft.textInput === 'string' && draft.textInput.trim()) {
            return true;
        }
        if (Array.isArray(draft.results) && draft.results.length > 0) {
            return true;
        }
        if (draft.batchTeachingNotes && typeof draft.batchTeachingNotes === 'object') {
            return true;
        }
        return false;
    }

    function emptyDraft() {
        return {
            version: 1,
            essayType: 'news-response',
            textInput: '',
            results: [],
            batchTeachingNotes: null,
            listLinks: []
        };
    }

    async function bootstrap(options) {
        const opts = options || {};
        ready = false;
        conflict = false;
        cloudAvailable = false;
        calendarId = '';
        baseUpdatedAt = null;
        clearRequested = false;
        allowEmptyUpload = false;
        if (typeof opts.getLocalDraft === 'function') {
            getDraftFn = opts.getLocalDraft;
        }
        if (typeof opts.onStatus === 'function') {
            onStatusFn = opts.onStatus;
        }
        if (typeof opts.onSaved === 'function') {
            onSavedFn = opts.onSaved;
        }
        const finishReady = function () {
            if (typeof opts.onReady === 'function') {
                opts.onReady();
            }
        };

        if (
            typeof global.TeamAuth === 'undefined' ||
            typeof global.CalendarSync === 'undefined' ||
            typeof global.CalendarSync.loadEssayBatchDraft !== 'function'
        ) {
            setStatus(onStatusFn, 'Draft: this browser only', false);
            finishReady();
            return { ok: false, reason: 'no_sync' };
        }

        try {
            await global.TeamAuth.ensure();
        } catch (err) {
            if (!(err && err.message === 'redirect')) {
                setStatus(onStatusFn, 'Draft: this browser only', false);
            }
            finishReady();
            return { ok: false, reason: err && err.message === 'redirect' ? 'redirect' : 'auth' };
        }

        const id =
            typeof global.CalendarSync.getActiveCalendarId === 'function'
                ? global.CalendarSync.getActiveCalendarId()
                : '';
        if (!id) {
            setStatus(onStatusFn, 'Draft: this browser only', false);
            finishReady();
            return { ok: false, reason: 'no_calendar' };
        }
        calendarId = id;

        let response;
        try {
            response = await global.CalendarSync.loadEssayBatchDraft(id);
        } catch (err) {
            setStatus(onStatusFn, 'Draft: this browser only', false);
            finishReady();
            return { ok: false, reason: 'load_failed' };
        }

        cloudAvailable = true;
        ready = true;
        baseUpdatedAt = response && response.updatedAt ? response.updatedAt : null;
        const cloudAt = baseUpdatedAt || '';
        const localSyncedAt = opts.localSyncedAt ? String(opts.localSyncedAt) : '';
        const cloudNewer = Boolean(cloudAt && cloudAt > localSyncedAt);
        finishReady();

        if (opts.applyCloud && cloudNewer) {
            const incoming = response && response.draft ? response.draft : emptyDraft();
            if (typeof opts.applyDraft === 'function') {
                opts.applyDraft(incoming, cloudAt);
            }
            if (typeof onSavedFn === 'function') {
                onSavedFn(cloudAt);
            }
            setStatus(onStatusFn, 'Draft: saved', false);
            return { ok: true, applied: true };
        }

        const dirty = typeof opts.isLocalDirty === 'function' ? Boolean(opts.isLocalDirty()) : false;
        const localWork = hasWork(currentDraft());
        const shouldUpload =
            (localWork && (!opts.applyCloud || dirty || !cloudAt)) ||
            (opts.applyCloud && dirty && !localWork && Boolean(cloudAt));
        if (shouldUpload) {
            setStatus(onStatusFn, 'Draft: saving', false);
            scheduleSave(getDraftFn, onStatusFn, {
                onSaved: onSavedFn,
                allowEmpty: Boolean(opts.applyCloud && !localWork)
            });
            return { ok: true, uploading: true };
        }

        setStatus(onStatusFn, cloudAt ? 'Draft: saved' : 'Draft: ready', false);
        return { ok: true, calendarId: id };
    }

    function scheduleSave(getDraft, onStatus, options) {
        if (typeof getDraft === 'function') {
            getDraftFn = getDraft;
        }
        if (typeof onStatus === 'function') {
            onStatusFn = onStatus;
        }
        const opts = options || {};
        if (typeof opts.onSaved === 'function') {
            onSavedFn = opts.onSaved;
        }
        if (opts.allowEmpty) {
            allowEmptyUpload = true;
        }
        if (opts.clear) {
            clearRequested = true;
        }
        if (!ready || !cloudAvailable || conflict || !calendarId) {
            return;
        }
        if (saveTimer) {
            clearTimeout(saveTimer);
        }
        saveTimer = setTimeout(function () {
            saveTimer = null;
            void flush();
        }, SAVE_DEBOUNCE_MS);
    }

    function flushSoon() {
        if (!ready || !cloudAvailable || conflict) {
            return;
        }
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        void flush();
    }

    async function flush() {
        if (!ready || !cloudAvailable || conflict || !calendarId) {
            return;
        }
        if (saving) {
            saveAgain = true;
            return;
        }
        saving = true;
        try {
            do {
                saveAgain = false;
                await saveOnce();
            } while (saveAgain && !conflict);
        } finally {
            saving = false;
        }
    }

    async function saveOnce() {
        const draft = currentDraft();
        const work = hasWork(draft);
        if (!work && !clearRequested && !(allowEmptyUpload && baseUpdatedAt)) {
            return;
        }
        try {
            const saved = await global.CalendarSync.putEssayBatchDraft(calendarId, {
                baseUpdatedAt: baseUpdatedAt,
                draft: draft
            });
            baseUpdatedAt = saved && saved.updatedAt ? saved.updatedAt : baseUpdatedAt;
            clearRequested = false;
            if (typeof onSavedFn === 'function') {
                onSavedFn(baseUpdatedAt);
            }
            setStatus(onStatusFn, 'Draft: saved', false);
        } catch (err) {
            const body = err && err.body;
            const code = (err && err.code) || (body && body.code) || '';
            const status = err && err.status;
            if (status === 409 || code === 'DRAFT_CONFLICT') {
                conflict = true;
                setStatus(
                    onStatusFn,
                    'Draft: saved on another computer. Reload to use that copy.',
                    true
                );
                return;
            }
            if (status === 413 || code === 'DRAFT_TOO_LARGE') {
                setStatus(onStatusFn, 'Draft: too large for the cloud', true);
                return;
            }
            if (status === 403 && (code === 'VIEW_AS_MODE' || /view as/i.test(String((err && err.message) || '')))) {
                cloudAvailable = false;
                setStatus(onStatusFn, 'Draft: this browser only', false);
                return;
            }
            setStatus(onStatusFn, 'Draft: this browser only', true);
        }
    }

    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') {
                flushSoon();
            }
        });
    }

    global.CCPEssayBatchDraft = {
        bootstrap: bootstrap,
        scheduleSave: scheduleSave
    };
})(typeof window !== 'undefined' ? window : globalThis);
