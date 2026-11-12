/**
 * Class board storage for the local Express server.
 * Rules live in shared/board-core.cjs. This file only talks to SQLite.
 */
const { getDb, newId, nowIso } = require('./schema');
const { parseDataObjectFromRow, serializeDataBlob } = require('./calendar-storage');
const CalAccess = require('./calendar-access');
const ActivityLog = require('./activity-log');
const core = require('../shared/board-core.cjs');

function database() {
    const db = getDb();
    return {
        one(sql, params) {
            return db.prepare(sql).get(...(params || []));
        },
        all(sql, params) {
            return db.prepare(sql).all(...(params || []));
        },
        run(sql, params) {
            return db.prepare(sql).run(...(params || []));
        },
        batch(writes) {
            db.transaction(() => {
                writes.forEach((w) => db.prepare(w.sql).run(...(w.params || [])));
            })();
        }
    };
}

function encrypt(entityId, text) {
    const blob = serializeDataBlob(entityId, String(text));
    return {
        body: blob.data,
        bodyEncVersion: blob.dataEncVersion,
        bodyKeyWrapped: blob.dataKeyWrapped == null ? null : blob.dataKeyWrapped
    };
}

function decrypt(row, entityId) {
    const value = parseDataObjectFromRow(
        {
            id: entityId,
            data: row.body,
            dataEncVersion: row.bodyEncVersion,
            dataKeyWrapped: row.bodyKeyWrapped
        },
        entityId
    );
    return value == null ? '' : String(value);
}

function makeCtx() {
    const db = database();
    return {
        db,
        now: nowIso,
        newId,
        encrypt,
        decrypt,
        record(user, entry) {
            ActivityLog.recordActivityForUser(user, entry);
        },
        calendarName(calendarId) {
            const row = db.one('SELECT name FROM calendars WHERE id = ?', [calendarId]);
            return row && row.name ? row.name : '';
        },
        canAccess(user, calendarId) {
            return CalAccess.canAccessCalendar(user, calendarId);
        },
        calendarExists(calendarId) {
            return Boolean(db.one('SELECT id FROM calendars WHERE id = ?', [calendarId]));
        },
        loadCalendar(calendarId) {
            const doc = require('./calendars').getCalendar(calendarId);
            return doc ? doc.data : null;
        },
        accessibleCalendarIds(user) {
            return CalAccess.listCalendarsForUser(user).map((row) => row.id);
        }
    };
}

function dispatch(http) {
    return core.dispatch(makeCtx(), http);
}

function deleteForCalendar(calendarId) {
    const db = getDb();
    core.CALENDAR_DELETE_STEPS.forEach((step) => {
        db.prepare(step.sql).run(...step.params(calendarId));
    });
}

module.exports = {
    dispatch,
    deleteForCalendar
};
