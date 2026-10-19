/**
 * D1-backed per-IP rate limits for auth routes (Worker).
 */

export async function checkRateLimit(env, bucketKey, limit, windowMs) {
    try {
        const now = Date.now();
        const row = await env.DB.prepare(
            'SELECT hit_count, window_start_ms FROM api_rate_buckets WHERE bucket_key = ?'
        )
            .bind(bucketKey)
            .first();

        if (!row || now - Number(row.window_start_ms) > windowMs) {
            await env.DB.prepare(
                `INSERT INTO api_rate_buckets (bucket_key, hit_count, window_start_ms)
                 VALUES (?, 1, ?)
                 ON CONFLICT(bucket_key) DO UPDATE SET hit_count = 1, window_start_ms = excluded.window_start_ms`
            )
                .bind(bucketKey, now)
                .run();
            return true;
        }

        if (Number(row.hit_count) >= limit) {
            return false;
        }

        await env.DB.prepare(
            'UPDATE api_rate_buckets SET hit_count = hit_count + 1 WHERE bucket_key = ?'
        )
            .bind(bucketKey)
            .run();
        return true;
    } catch (_) {
        return false;
    }
}

export function clientIp(request) {
    return (
        request.headers.get('CF-Connecting-IP') ||
        request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
        'unknown'
    );
}

export async function rateLimitOr429(env, request, routeKey, limit, windowMs) {
    return rateLimitByKeyOr429(env, `${routeKey}:${clientIp(request)}`, limit, windowMs);
}

/** Same as rateLimitOr429 but with a caller-chosen bucket (e.g. per signed-in user). */
export async function rateLimitByKeyOr429(env, bucketKey, limit, windowMs) {
    const allowed = await checkRateLimit(env, bucketKey, limit, windowMs);
    if (!allowed) {
        return new Response(JSON.stringify({ error: 'Too many requests. Try again later.' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    return null;
}
