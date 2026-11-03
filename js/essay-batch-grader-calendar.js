/**
 * Load/save Batch Essay Editor grader settings from the active team calendar
 * (essayGraderSettings — classroomOnly, no schedule lock).
 * API keys stay in localStorage. The current essay batch is a separate per-teacher draft.
 */
(function (global) {
    const SAVE_DEBOUNCE_MS = 1200;
    let saveTimer = null;
    let calendarName = '';
    let calendarId = '';
    let loaded = false;
    let calendarData = null;

    function emptySettings() {
        return {
            version: 1,
            rules: null,
            promptBlocks: null,
            modelEssays: null,
            speechTemplate: '',
            updatedAt: ''
        };
    }

    function hasUsableSettings(blob) {
        if (!blob || typeof blob !== 'object') {
            return false;
        }
        return (
            Array.isArray(blob.rules) ||
            (blob.promptBlocks && typeof blob.promptBlocks === 'object') ||
            Array.isArray(blob.modelEssays) ||
            (typeof blob.speechTemplate === 'string' && blob.speechTemplate.trim())
        );
    }

    function setStatus(onStatus, message, isError) {
        if (typeof onStatus === 'function') {
            onStatus(message || '', Boolean(isError));
        }
    }

    async function bootstrap(options) {
        const opts = options || {};
        const onStatus = opts.onStatus;
        loaded = false;
        calendarName = '';
        calendarId = '';
        calendarData = null;

        if (typeof global.TeamAuth === 'undefined' || typeof global.CalendarSync === 'undefined') {
            setStatus(
                onStatus,
                'Calendar sync unavailable — grader settings stay in this browser only.',
                true
            );
            return { ok: false, reason: 'no_sync' };
        }

        try {
            await global.TeamAuth.ensure();
        } catch (err) {
            if (err && err.message === 'redirect') {
                return { ok: false, reason: 'redirect' };
            }
            setStatus(
                onStatus,
                'Sign in to ClassManager to sync grading rules per calendar.',
                true
            );
            return { ok: false, reason: 'auth' };
        }

        const id =
            typeof global.CalendarSync.getActiveCalendarId === 'function'
                ? global.CalendarSync.getActiveCalendarId()
                : '';
        if (!id) {
            setStatus(
                onStatus,
                'No active calendar — open ClassManager and select a campus calendar first.',
                true
            );
            return { ok: false, reason: 'no_calendar' };
        }
        calendarId = id;

        let doc;
        try {
            doc = await global.CalendarSync.loadCalendar(id);
        } catch (err) {
            setStatus(
                onStatus,
                (err && err.message) || 'Could not load calendar for grader settings.',
                true
            );
            return { ok: false, reason: 'load_failed' };
        }

        const data = (doc && doc.data) || {};
        calendarData = data;
        calendarName = String(data.calendarName || doc.name || '').trim();
        let settings = data.essayGraderSettings;
        let migrated = false;

        if (!hasUsableSettings(settings) && typeof opts.getLocalFallback === 'function') {
            const local = opts.getLocalFallback() || {};
            if (
                Array.isArray(local.rules) ||
                local.promptBlocks ||
                Array.isArray(local.modelEssays) ||
                (local.speechTemplate && String(local.speechTemplate).trim())
            ) {
                settings = {
                    version: 1,
                    rules: local.rules || null,
                    promptBlocks: local.promptBlocks || null,
                    modelEssays: local.modelEssays || null,
                    speechTemplate: local.speechTemplate || '',
                    updatedAt: new Date().toISOString()
                };
                migrated = true;
            }
        }

        if (hasUsableSettings(settings) && typeof opts.applySettings === 'function') {
            opts.applySettings(settings);
            loaded = true;
        }

        if (migrated && typeof opts.getSettingsToSave === 'function') {
            try {
                await saveNow(opts.getSettingsToSave, onStatus);
            } catch (saveErr) {
                setStatus(
                    onStatus,
                    (saveErr && saveErr.message) || 'Migrated locally but calendar save failed.',
                    true
                );
            }
        }

        const label = calendarName || id;
        setStatus(
            onStatus,
            migrated
                ? `Migrated browser grader settings → calendar “${label}”.`
                : loaded
                  ? `Grader settings: calendar “${label}”.`
                  : `Calendar “${label}” — using built-in defaults until you save.`,
            false
        );
        return { ok: true, calendarId: id, calendarName, migrated, loaded };
    }

    async function saveNow(getSettingsToSave, onStatus) {
        if (typeof global.CalendarSync === 'undefined' || !calendarId) {
            return null;
        }
        if (typeof getSettingsToSave !== 'function') {
            return null;
        }
        const blob = getSettingsToSave() || emptySettings();
        blob.version = 1;
        blob.updatedAt = new Date().toISOString();
        let doc;
        try {
            doc = await global.CalendarSync.saveClassroomData({ essayGraderSettings: blob });
        } catch (err) {
            if (!(err && err.status === 409) || typeof global.CalendarSync.loadCalendar !== 'function') {
                throw err;
            }
            // One retry onto the revision the server just returned. A second 409
            // means another save chose different grader settings.
            const fresh = await global.CalendarSync.loadCalendar(calendarId);
            calendarData = (fresh && fresh.data) || calendarData;
            doc = await global.CalendarSync.saveClassroomData({ essayGraderSettings: blob });
        }
        loaded = true;
        setStatus(onStatus, `Saved grader settings to “${calendarName || calendarId}”.`, false);
        return doc;
    }

    function scheduleSave(getSettingsToSave, onStatus) {
        if (!calendarId) {
            return;
        }
        if (saveTimer) {
            clearTimeout(saveTimer);
        }
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void saveNow(getSettingsToSave, onStatus).catch((err) => {
                const conflict = err && (err.status === 409 || /conflict/i.test(String(err.message || '')));
                setStatus(
                    onStatus,
                    conflict
                        ? 'The Essays list was saved in the other window. Change the grader setting again to retry.'
                        : (err && err.message) || 'Could not save grader settings to calendar.',
                    true
                );
            });
        }, SAVE_DEBOUNCE_MS);
    }

    global.CCPEssayBatchGraderCalendar = {
        emptySettings,
        bootstrap,
        scheduleSave,
        saveNow,
        getCalendarName: () => calendarName,
        getCalendarId: () => calendarId,
        getCalendarData: () => calendarData,
        setEssaySubmissions(list) {
            if (!calendarData) {
                calendarData = {};
            }
            calendarData.essaySubmissions = Array.isArray(list) ? list : [];
        },
        replaceCalendarData(data) {
            if (data && typeof data === 'object') {
                calendarData = data;
            }
        },
        isLoaded: () => loaded
    };
})(typeof window !== 'undefined' ? window : globalThis);
