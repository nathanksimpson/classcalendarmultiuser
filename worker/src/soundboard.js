import { dbOne, dbRun } from './db.js';
import { BOARD_ID, CREATE_TABLE_SQL, prepareBoard } from '../../shared/soundboard-store.cjs';

let tableReady = null;

function ensureTable(env) {
    if (!tableReady) {
        tableReady = dbRun(env, CREATE_TABLE_SQL);
    }
    return tableReady;
}

export async function getBoard(env) {
    await ensureTable(env);
    const row = await dbOne(
        env,
        'SELECT board_json, updated_at FROM soundboard_board WHERE id = ?',
        BOARD_ID
    );
    if (!row || !row.board_json) {
        return { board: null, updatedAt: null };
    }
    try {
        return { board: JSON.parse(row.board_json), updatedAt: row.updated_at || null };
    } catch (_) {
        return { board: null, updatedAt: null };
    }
}

export async function saveBoard(env, board, userId) {
    await ensureTable(env);
    const prepared = prepareBoard(board);
    if (!prepared.ok) {
        const err = new Error(prepared.error);
        err.status = 400;
        throw err;
    }
    const updatedAt = new Date().toISOString();
    await dbRun(
        env,
        `INSERT INTO soundboard_board (id, board_json, updated_at, updated_by_user_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           board_json = excluded.board_json,
           updated_at = excluded.updated_at,
           updated_by_user_id = excluded.updated_by_user_id`,
        BOARD_ID,
        prepared.json,
        updatedAt,
        userId || null
    );
    return { ok: true, updatedAt };
}
