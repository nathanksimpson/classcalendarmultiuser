/**
 * In-memory per-IP rate limits for auth routes (local Express).
 */
const buckets = new Map();

function clientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return String(forwarded).split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * @returns {boolean} true if allowed
 */
function checkRateLimit(key, limit, windowMs) {
    const now = Date.now();
    let row = buckets.get(key);
    if (!row || now - row.windowStart > windowMs) {
        row = { count: 1, windowStart: now };
        buckets.set(key, row);
        return true;
    }
    if (row.count >= limit) {
        return false;
    }
    row.count += 1;
    return true;
}

function rateLimitMiddleware(routeKey, limit, windowMs) {
    return (req, res, next) => {
        const key = `${routeKey}:${clientIp(req)}`;
        if (!checkRateLimit(key, limit, windowMs)) {
            res.status(429).json({ error: 'Too many requests. Try again later.' });
            return;
        }
        next();
    };
}

module.exports = {
    clientIp,
    checkRateLimit,
    rateLimitMiddleware
};
