/**
 * Team sync for dayNotes[] — local cache first, then CalendarSync.saveDayNotesOnly.
 */
(function (global) {
    function createDayNotesSave(deps) {
        let saveInFlight = false;

        async function saveAfterMutate(dayNotes, rollbackSnapshot) {
            if (deps.saveToLocalCache) {
                deps.saveToLocalCache();
            }
            if (!deps.hasTeamSync || !deps.hasTeamSync()) {
                return { ok: true, localOnly: true };
            }
            if (!deps.hasDayNotesAccess || !deps.hasDayNotesAccess()) {
                return { ok: true, localOnly: true };
            }
            const sync = deps.getCalendarSync ? deps.getCalendarSync() : null;
            if (!sync || typeof sync.saveDayNotesOnly !== 'function') {
                return { ok: true, localOnly: true };
            }
            saveInFlight = true;
            try {
                return await sync.saveDayNotesOnly(dayNotes);
            } catch (err) {
                if (deps.onRollback && rollbackSnapshot) {
                    deps.onRollback(rollbackSnapshot);
                }
                if (deps.onConflict) {
                    deps.onConflict(err);
                }
                throw err;
            } finally {
                saveInFlight = false;
            }
        }

        return {
            saveAfterMutate,
            isSaveInFlight: () => saveInFlight
        };
    }

    global.CCPDayNotesSave = { createDayNotesSave };
})(typeof window !== 'undefined' ? window : globalThis);
