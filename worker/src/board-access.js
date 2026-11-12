/**
 * Class board storage for the Cloudflare Worker.
 * Rules live in shared/board-core.cjs. This file only talks to D1.
 */
import { dbAll, dbOne, dbRun } from './db.js';
import { calendarDocForClient, CALENDAR_DOC_SELECT, parseDataObjectFromRow, serializeDataBlob } from './calendar-storage.js';
import * as CalAccess from './calendar-access.js';
import * as ActivityLog from './activity-log.js';
import { CALENDAR_DELETE_STEPS, dispatch as dispatchBoard } from '../../shared/board-core.cjs';
import { CREATE_STATEMENTS, SOURCE_COLUMN_SQL, SOURCE_INDEX_SQL } from '../../shared/board-schema.cjs';

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

const upgraded = new WeakSet();

function isMissingTable(err) {
    return /no such table/i.test(String((err && err.message) || ''));
}

/** Column names on board_posts. Empty when the table has not been created yet. */
async function boardPostColumns(env) {
    try {
        const rows = await dbAll(env, 'PRAGMA table_info(board_posts)');
        return (rows || []).map((row) => row.name);
    } catch (err) {
        if (isMissingTable(err)) {
            return [];
        }
        throw err;
    }
}

async function hasSourceIndex(env) {
    const row = await dbOne(
        env,
        "SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='idx_board_posts_source'"
    );
    return Boolean(row);
}

/**
 * Add the Notes tables to a database that was created before this feature.
 * Safe to run more than once. Does not change calendar rows.
 */
export async function ensureBoardSchema(env) {
    if (!env || !env.DB || upgraded.has(env.DB)) {
        return;
    }
    let names = await boardPostColumns(env);
    const indexed = names.includes('source_ref') ? await hasSourceIndex(env) : false;
    if (!names.length || !names.includes('source_ref') || !indexed) {
        if (typeof env.DB.batch === 'function') {
            await env.DB.batch(CREATE_STATEMENTS.map((sql) => env.DB.prepare(sql)));
        } else {
            for (const sql of CREATE_STATEMENTS) {
                await dbRun(env, sql);
            }
        }
        names = await boardPostColumns(env);
        if (!names.includes('source_ref')) {
            await dbRun(env, SOURCE_COLUMN_SQL);
        }
        await dbRun(env, SOURCE_INDEX_SQL);
    }
    upgraded.add(env.DB);
}

export async function dispatch(env, http) {
    await ensureBoardSchema(env);
    const result = await dispatchBoard(makeCtx(env), http);
    const message = result && result.body && result.body.error;
    if (result && isMissingTable({ message }) && env && env.DB) {
        upgraded.delete(env.DB);
        await ensureBoardSchema(env);
        return dispatchBoard(makeCtx(env), http);
    }
    return result;
}

export async function deleteForCalendar(env, calendarId) {
    await ensureBoardSchema(env);
    for (const step of CALENDAR_DELETE_STEPS) {
        await dbRun(env, step.sql, ...step.params(calendarId));
    }
}
