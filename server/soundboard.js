const crypto = require('crypto');
const { getDb } = require('./schema');
const {
    BOARD_ID,
    MAX_MEDIA_BYTES,
    MEDIA_REF_PREFIX,
    prepareBoard,
    checkSaveBase,
    isValidMediaHash,
    normalizeMediaType,
    chunkBytes,
    blobToBytes,
    joinChunks
} = require('../shared/soundboard-store.cjs');

function httpError(message, status, extra) {
    const err = new Error(message);
    err.status = status;
    if (extra) {
        Object.assign(err, extra);
    }
    return err;
}

function readRow() {
    return getDb()
        .prepare('SELECT board_json, updated_at FROM soundboard_board WHERE id = ?')
        .get(BOARD_ID);
}

function parseRow(row) {
    if (!row || !row.board_json) {
        return { board: null, updatedAt: null };
    }
    try {
        return { board: JSON.parse(row.board_json), updatedAt: row.updated_at || null };
    } catch (_) {
        return { board: null, updatedAt: row.updated_at || null };
    }
}

function getBoard(since) {
    const row = readRow();
    if (since && row && row.updated_at === since) {
        return { unchanged: true, updatedAt: row.updated_at };
    }
    return parseRow(row);
}

function saveBoard(board, userId, baseUpdatedAt) {
    const prepared = prepareBoard(board);
    if (!prepared.ok) {
        throw httpError(prepared.error, 400);
    }
    const db = getDb();
    const current = readRow();
    const currentUpdatedAt = current ? current.updated_at : null;
    if (!checkSaveBase(currentUpdatedAt, baseUpdatedAt).ok) {
        const parsed = parseRow(current);
        throw httpError('The sound board was changed on another computer.', 409, {
            body: { error: 'conflict', board: parsed.board, updatedAt: parsed.updatedAt }
        });
    }
    let updatedAt = new Date().toISOString();
    if (currentUpdatedAt && updatedAt <= currentUpdatedAt) {
        updatedAt = new Date(Date.parse(currentUpdatedAt) + 1).toISOString();
    }
    db.prepare(
        `INSERT INTO soundboard_board (id, board_json, updated_at, updated_by_user_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           board_json = excluded.board_json,
           updated_at = excluded.updated_at,
           updated_by_user_id = excluded.updated_by_user_id`
    ).run(BOARD_ID, prepared.json, updatedAt, userId || null);
    return { ok: true, updatedAt };
}

/** `body` is a Buffer from express.raw(). */
function putMedia(body, contentType, userId) {
    const mime = normalizeMediaType(contentType);
    if (!mime) {
        throw httpError('Only audio or image files can be uploaded', 415);
    }
    const bytes = body && body.length ? new Uint8Array(body.buffer, body.byteOffset, body.length) : null;
    if (!bytes || !bytes.length) {
        throw httpError('Empty file', 400);
    }
    if (bytes.length > MAX_MEDIA_BYTES) {
        throw httpError('File is too large (15 MB max)', 413);
    }
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const db = getDb();
    const chunks = chunkBytes(bytes);
    const createdAt = new Date().toISOString();
    const insert = db.prepare(
        `INSERT OR REPLACE INTO soundboard_media
         (hash, chunk_index, chunk_count, mime, byte_size, data, created_at, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    db.transaction(() => {
        chunks.forEach((chunk, index) => {
            insert.run(hash, index, chunks.length, mime, bytes.length, Buffer.from(chunk), createdAt, userId || null);
        });
    })();
    return { ok: true, ref: MEDIA_REF_PREFIX + hash, hash, size: bytes.length, mime };
}

function getMedia(hash) {
    if (!isValidMediaHash(hash)) {
        return null;
    }
    const rows = getDb()
        .prepare(
            `SELECT chunk_index, chunk_count, mime, data
             FROM soundboard_media WHERE hash = ? ORDER BY chunk_index`
        )
        .all(hash);
    if (!rows.length || rows.length !== Number(rows[0].chunk_count)) {
        return null;
    }
    const bytes = joinChunks(rows.map((r) => blobToBytes(r.data)));
    return { mime: rows[0].mime, bytes: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length) };
}

module.exports = {
    getBoard,
    saveBoard,
    putMedia,
    getMedia
};
