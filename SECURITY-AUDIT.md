# Security audit — Class Calendar Multi User

**Date:** 2026-05-25  
**Scope:** Team auth, calendar API, locks, admin, deployment surface.  
**Status:** Findings documented; remediation phased (see below). No code changes from this doc alone.

---

## Executive summary

The app is a multi-teacher calendar with Kakao OAuth, SQLite (local) / D1 (production), edit locks, and revision-based saves. Several issues increase risk of account takeover, unauthorized edits, or abuse. **Recommended direction:** remove Kakao long-term; add **TOTP** (authenticator app) for admins/teachers; apply Phase 0 quick fixes before larger auth work.

---

## High-priority findings

| ID | Issue | Risk | Notes |
|----|--------|------|--------|
| H1 | **Kakao OAuth** — third-party login, token/session handling | Account linking, session fixation, dependency on Kakao config | Plan migration to password + TOTP |
| H2 | **`force` lock bypass** — API may allow taking lock without holder consent | Concurrent edits, data loss | Audit `worker/src/index.js` and `server/index.js` lock routes |
| H3 | **Bootstrap admin secret** — single env var creates first admin | Brute force if exposed/guessable | Rate limit, long random secret, disable after bootstrap |
| H4 | **No rate limiting** on login, bootstrap, password change | Brute force, credential stuffing | Add per-IP limits on Worker + Express |
| H5 | **`ALLOW_OPEN_ACCESS=1`** in dev | Full admin if mis-deployed | Never set in production; document in DEVELOPER.md |

---

## Medium-priority findings

| ID | Issue | Risk |
|----|--------|------|
| M1 | Session cookies — `Secure`, `HttpOnly`, `SameSite` must be correct in production | Session theft |
| M2 | CORS / `PUBLIC_URL` mismatch | Broken auth or open redirects |
| M3 | Admin HTML (`admin.html`) — relies on same session as app | Privilege escalation if session weak |
| M4 | Import JSON — large payloads, no size cap at edge | DoS, prototype pollution (validate schema) |
| M5 | Calendar access groups — logic duplicated server/worker | Drift → wrong ACL in one environment |

---

## Low / hygiene

- Log sensitive fields (passwords, tokens) — ensure redaction.
- D1 / SQLite backups — encrypt at rest where stored.
- Dependency audit — `npm audit` periodically.
- Content Security Policy — not present on static assets; consider for XSS hardening.

---

## Recommended remediation phases

### Phase 0 — Quick wins (days)

1. Confirm production has **no** `ALLOW_OPEN_ACCESS`.
2. Rotate `BOOTSTRAP_ADMIN_SECRET` after first admin exists; document “disable bootstrap.”
3. Review lock `force` parameter — remove or restrict to admin-only with audit log.
4. Add basic rate limits on `/api/auth/*` and bootstrap routes.
5. Verify cookie flags on production Worker.

### Phase 1 — Auth hardening (weeks)

1. Password policy (min length, breach check optional).
2. **TOTP** for admin (and optionally all teachers).
3. Session rotation on login; idle timeout.
4. Structured audit log for admin actions (user create, calendar delete, force lock).

### Phase 2 — Kakao removal (planned)

1. Migrate users to local username/password (+ TOTP).
2. Remove Kakao env vars and OAuth routes from server + worker.
3. Update `login.html` and `FOR TEACHERS.md`.

---

## Testing checklist (after fixes)

- [ ] Cannot access admin without valid session.
- [ ] Bootstrap endpoint disabled or rate-limited after setup.
- [ ] Two users: lock holder cannot be silently overridden without policy.
- [ ] `ALLOW_OPEN_ACCESS` absent in Wrangler secrets / env.
- [ ] Import rejects malformed or oversized JSON safely.

---

## References

- [DEVELOPER.md](DEVELOPER.md) — dual backend, deploy, env vars  
- [AGENTS.md](AGENTS.md) — lock/sync behavior  
- [CLOUDFLARE-DEPLOY.md](CLOUDFLARE-DEPLOY.md) — production secrets  

*This document is a pinned snapshot for planning; update as issues are fixed or re-verified.*
