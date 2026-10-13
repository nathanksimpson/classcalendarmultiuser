/**
 * Shared soundboard board validation.
 * One team-wide board is stored as JSON. Audio files stay as remote URLs
 * or static /soundboard/media paths — not as uploaded blobs.
 */
const BOARD_ID = 'team';
const MAX_JSON_CHARS = 900000;
const MAX_SOUNDS = 5000;

function validateBoard(board) {
    if (!board || typeof board !== 'object' || Array.isArray(board)) {
        return { ok: false, error: 'Board must be an object' };
    }
    if (board.schemaVersion !== 1 && board.schemaVersion !== 2) {
        return { ok: false, error: 'Unsupported board version' };
    }
    if (!Array.isArray(board.sounds)) {
        return { ok: false, error: 'Board is missing sounds' };
    }
    if (board.sounds.length > MAX_SOUNDS) {
        return { ok: false, error: 'Too many sounds' };
    }
    for (let i = 0; i < board.sounds.length; i += 1) {
        const sound = board.sounds[i];
        if (!sound || typeof sound !== 'object') {
            return { ok: false, error: 'Invalid sound' };
        }
        if (typeof sound.id !== 'string' || !sound.id.trim()) {
            return { ok: false, error: 'Invalid sound' };
        }
        if (typeof sound.title !== 'string') {
            return { ok: false, error: 'Invalid sound title' };
        }
        const ref = sound.audioRef != null ? sound.audioRef : sound.fileUrl;
        if (typeof ref !== 'string' || !String(ref).trim()) {
            return { ok: false, error: 'Invalid sound audio' };
        }
    }
    return { ok: true };
}

function prepareBoard(board) {
    const check = validateBoard(board);
    if (!check.ok) {
        return check;
    }
    let json;
    try {
        json = JSON.stringify(board);
    } catch (_) {
        return { ok: false, error: 'Board could not be saved' };
    }
    if (json.length > MAX_JSON_CHARS) {
        return { ok: false, error: 'Board is too large to save' };
    }
    return { ok: true, json };
}

const CREATE_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS soundboard_board (
        id TEXT PRIMARY KEY,
        board_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by_user_id TEXT
    );
`;

module.exports = {
    BOARD_ID,
    MAX_JSON_CHARS,
    CREATE_TABLE_SQL,
    validateBoard,
    prepareBoard
};
