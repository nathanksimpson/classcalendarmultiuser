/**
 * Class board storage for the Cloudflare Worker.
 * Rules live in shared/board-core.cjs. This file only talks to D1.
 */
import { dbAll, dbOne, dbRun } from './db.js';
import { calendarDocForClient, CALENDAR_DOC_SELECT, parseDataObjectFromRow, serializeDataBlob } from './calendar-storage.js';
import * as CalAccess from './calendar-access.js';
import * as ActivityLog from './activity-log.js';
import { CALENDAR_DELETE_STEPS, dispatch as dispatchBoard } from '../../shared/board-core.cjs';

function database(env) {
    return {
        one(sql, params) {
            return dbOne(env, sql, ...(params || []));
        },
        all(sql, params) {
            return dbAll(env, sql, ...(params || []));
        },
        run(sql, params) {
            return dbRun(env, sql, ...(params || []));
        },
        /** One round trip for several writes (D1 runs a batch as one transaction). */
        batch(writes) {
            return env.DB.batch(
                writes.map((w) => env.DB.prepare(w.sql).bind(...(w.params || [])))
            );
        }
    };
}

function encryptBody(entityId, text, env) {
    const blob = serializeDataBlob(entityId, String(text), env);
    return {
        body: blob.data,
        bodyEncVersion: blob.dataEncVersion,
        bodyKeyWrapped: blob.dataKeyWrapped == null ? null : blob.dataKeyWrapped
    };
}

function decryptBody(row, entityId, env) {
    const value = parseDataObjectFromRow(
        {
            id: entityId,
            data: row.body,
            dataEncVersion: row.bodyEncVersion,
            dataKeyWrapped: row.bodyKeyWrapped
        },
        entityId,
        env
    );
    return value == null ? '' : String(value);
}

function makeCtx(env) {
    const db = database(env);
    return {
        db,
        now() {
            return new Date().toISOString();
        },
        newId() {
            return crypto.randomUUID();
        },
        encrypt(entityId, text) {
            return encryptBody(entityId, text, env);
        },
        decrypt(row, entityId) {
            return decryptBody(row, entityId, env);
        },
        record(user, entry) {
            return ActivityLog.recordActivityForUser(env, user, entry);
        },
        async calendarName(calendarId) {
            const row = await db.one('SELECT name FROM calendars WHERE id = ?', [calendarId]);
            return row && row.name ? row.name : '';
        },
        canAccess(user, calendarId) {
            return CalAccess.canAccessCalendar(env, user, calendarId);
        },
        async calendarExists(calendarId) {
            const row = await db.one('SELECT id FROM calendars WHERE id = ?', [calendarId]);
            return Boolean(row);
        },
        async loadCalendar(calendarId) {
            const row = await db.one(
                `SELECT ${CALENDAR_DOC_SELECT} FROM calendars WHERE id = ?`,
                [calendarId]
            );
            if (!row) {
                return null;
            }
            const doc = calendarDocForClient(row, env);
            return doc ? doc.data : null;
        },
        async accessibleCalendarIds(user) {
            const rows = await CalAccess.listCalendarsForUser(env, user);
            return rows.map((row) => row.id);
        }
    };
}

export function dispatch(env, http) {
    return dispatchBoard(makeCtx(env), http);
}

export async function deleteForCalendar(env, calendarId) {
    for (const step of CALENDAR_DELETE_STEPS) {
        await dbRun(env, step.sql, ...step.params(calendarId));
    }
}
