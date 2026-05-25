# Cloudflare rate limiting (production)

The app enforces **in-Worker D1 rate limits** on auth routes after migration `0006_api_rate_buckets.sql`. For defense in depth, add **Cloudflare dashboard** rules on your production zone.

## Recommended rules

Create **Rate limiting rules** (Security → WAF → Rate limiting rules) for hostname `classcalendarmultiuser.nathanksimpson.workers.dev` (or your custom domain):

| Path prefix | Suggestion | Notes |
|-------------|------------|--------|
| `/api/auth/kakao` | 40 requests / 15 min / IP | OAuth start |
| `/api/auth/kakao/callback` | 40 requests / 15 min / IP | OAuth callback |
| `/api/auth/password` | 25 requests / 15 min / IP | Password login |
| `/api/admin/bootstrap` | 15 requests / 15 min / IP | Until first admin exists |

Optional: global `/api/*` ceiling (e.g. 300 req/min/IP) for cost-abuse protection.

## After deploy

1. Run `npm run db:migrate:remote` so D1 has `api_rate_buckets`.
2. Enable **Usage notifications** for Workers and D1 in the Cloudflare dashboard.
3. Test: repeated failed logins should return HTTP **429**.

Local Express uses in-memory limits in [server/rate-limit.js](../server/rate-limit.js) with the same thresholds.
