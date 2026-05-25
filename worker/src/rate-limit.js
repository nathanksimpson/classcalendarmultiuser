/**
 * D1-backed per-IP rate limits for auth routes (Worker).
 */

export async function checkRateLimit(env, bucketKey, limit, windowMs) {
    const now = Date.now();
    let row;
    try {
        row = await env.DB.prepare(
            'SELECT hit_count, window_start_ms FROM api_rate_buckets WHERE bucket_key = ?'
        )
            .bind(bucketKey)
            .first();
    } catch (_) {
        return true;
    }

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
}

export function clientIp(request) {
    return (
        request.headers.get('CF-Connecting-IP') ||
        request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
        'unknown'
    );
}

export async function rateLimitOr429(env, request, routeKey, limit, windowMs) {
    const key = `${routeKey}:${clientIp(request)}`;
    const allowed = await checkRateLimit(env, key, limit, windowMs);
    if (!allowed) {
        return new Response(JSON.stringify({ error: 'Too many requests. Try again later.' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    return null;
}
