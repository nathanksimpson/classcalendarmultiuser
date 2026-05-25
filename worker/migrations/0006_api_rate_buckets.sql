CREATE TABLE IF NOT EXISTS api_rate_buckets (
    bucket_key TEXT PRIMARY KEY,
    hit_count INTEGER NOT NULL DEFAULT 0,
    window_start_ms INTEGER NOT NULL
);
