-- Shared soundboard audio/images, stored once on the server so every
-- computer plays the same files. Content-addressed by SHA-256 and split
-- into chunks because a D1 row is capped at 2 MB.
CREATE TABLE IF NOT EXISTS soundboard_media (
    hash TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_count INTEGER NOT NULL,
    mime TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL,
    created_by_user_id TEXT,
    PRIMARY KEY (hash, chunk_index)
);
