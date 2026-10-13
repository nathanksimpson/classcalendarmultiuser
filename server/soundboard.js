const { getDb } = require('./schema');
const { BOARD_ID, prepareBoard } = require('../shared/soundboard-store.cjs');

function readRow() {
    return getDb()
        .prepare('SELECT board_json, updated_at FROM soundboard_board WHERE id = ?')
        .get(BOARD_ID);
}

function getBoard() {
    const row = readRow();
    if (!row || !row.board_json) {
        return { board: null, updatedAt: null };
    }
    try {
        return { board: JSON.parse(row.board_json), updatedAt: row.updated_at || null };
    } catch (_) {
        return { board: null, updatedAt: null };
    }
}

function saveBoard(board, userId) {
    const prepared = prepareBoard(board);
    if (!prepared.ok) {
        const err = new Error(prepared.error);
        err.status = 400;
        throw err;
    }
    const updatedAt = new Date().toISOString();
    getDb()
        .prepare(
            `INSERT INTO soundboard_board (id, board_json, updated_at, updated_by_user_id)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               board_json = excluded.board_json,
               updated_at = excluded.updated_at,
               updated_by_user_id = excluded.updated_by_user_id`
        )
        .run(BOARD_ID, prepared.json, updatedAt, userId || null);
    return { ok: true, updatedAt };
}

module.exports = {
    getBoard,
    saveBoard
};
