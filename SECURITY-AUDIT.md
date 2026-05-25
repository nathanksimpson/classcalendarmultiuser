# Security audit — Class Calendar Multi User

**Date:** 2026-05-25 (updated 2026-05-25)  
**Scope:** Team auth (Kakao OAuth), calendar API, locks, admin, deployment surface.  
**Extended review:** See also the Cursor plan *security_audit_extension* for DDoS/cost abuse, XSS, and social-engineering notes.

---

## Executive summary

Multi-teacher calendar with **Kakao OAuth** (first login auto-creates teacher + pending-access until calendars are granted), password fallback, D1/SQLite, edit locks, and revision-based saves. Phase 0 fixes in code: **OAuth CSRF state cookie**, **no blind email→Kakao auto-link**, **`force` save restricted to lock holder or admin**, **5 MB API body cap**, **auth rate limits**, **XSS escapes** on key calendar DOM paths, **health endpoint** no longer leaks Kakao client ID fragments, **session rotation on login**, **logout-all**, **configurable session max days**.

**Remaining ops:** Run D1 migration `0006`, configure [Cloudflare rate limits](docs/CLOUDFLARE-RATE-LIMITS.md), rotate secrets, enable usage alerts.

---

## High-priority findings

| ID | Issue | Risk | Status |
|----|--------|------|--------|
| H1 | **Kakao OAuth** — third-party login | Account linking, session fixation, Kakao dependency | Mitigated: signed state cookie; auto-create + pending-access |
| H2 | **`force` on calendar PUT** — bypassed lock/revision for any teacher | Data loss, lock policy bypass | **Fixed:** `force` only if `role === admin` or user **holds lock** |
| H3 | **Bootstrap admin secret** | Brute force if guessable | Open — rate limited; rotate after first admin |
| H4 | **Rate limiting** on login/bootstrap | Brute force, OAuth flood | **Mitigated:** Worker D1 + Express in-memory; add Cloudflare rules |
| H5 | **`ALLOW_OPEN_ACCESS=1`** in dev | Full bypass if mis-deployed | Production worker: `openAccess: false` |
| N1 | **OAuth CSRF** — state not verified | Session fixation / login CSRF | **Fixed:** HMAC-signed `kakao_oauth_state` cookie |
| N2 | **Email pre-provisioning auto-link** | Wrong Kakao binds to pre-added email | **Fixed:** no auto-`UPDATE kakao_user_id`; admin must set Kakao ID |
| K1 | **Open Kakao self-registration** | User list spam; privacy vs allowlist | **Accepted (policy A):** auto-create on first Kakao login; calendar access still gated; teachers need not share email with admin |

---

## Medium-priority findings

| ID | Issue | Risk | Status |
|----|--------|------|--------|
| M1 | Session cookies — long-lived sessions | Stolen cookie window | **Mitigated:** rotate on login; logout-all; configurable `session_max_days` (1–14) |
| M2 | CORS / `PUBLIC_URL` mismatch | Broken auth / redirects | Document in DEVELOPER.md |
| M3 | Admin HTML visible to pending teachers | Static UI only; APIs 403 | Low |
| M4 | Import JSON size | DoS | **Mitigated:** 5 MB Express/Worker cap on JSON bodies |
| M5 | Calendar ACL duplicated server/worker | Drift | Ongoing dual maintenance |
| M-K1 | `kakaoClientIdHint` in `/api/health` | Recon | **Fixed:** removed |
| M-K2 | OAuth error `detail` in login URL | Info leak via Referer | **Fixed:** errors without `detail` query |
| M-K3 | Legacy `denied=1` query on login | PII in URL | **Fixed:** UI removed |
| M6 | Fixed 3s poll + lock touch | Load/cost scale | Open — Phase 1 adaptive poll |
| H6 | Full-document PUT, no edge body cap | Cost abuse | **Mitigated:** 5 MB cap |

---

## Low / hygiene

- Client idle logout — [js/team-auth.js](js/team-auth.js)
- CSP / HSTS — not on static assets; configure via Cloudflare
- Stored XSS — partial fix in [app.js](app.js) hot paths; continue audit for other `innerHTML`
- Prompt injection — N/A (no LLM)
- Kakao removal — Phase 2 per original roadmap

---

## Kakao login policy (implemented)

1. Teacher uses **Login with Kakao**; server verifies **signed OAuth state** (CSRF).
2. **First login** with a new Kakao user ID **auto-creates** a teacher row (email stored only if Kakao shares it — not required for admins to collect email).
3. Existing users match by **Kakao user ID**, or by email only when admin pre-added email and set the matching **Kakao user ID** (`kakao_not_linked` / `kakao_mismatch` otherwise).
4. **Calendar access** still requires group/calendar assignment (`pending-access.html` until granted).
5. Admins recognize new teachers in **Admin → Users** by display name and **Kakao ID** column.

Env: `OAUTH_STATE_SECRET` (optional; falls back to `BOOTSTRAP_ADMIN_SECRET`).

---

## Remediation phases

### Phase 0 — Done in code (deploy + migrate)

1. OAuth state verification (N1)
2. Kakao auto-create + pending-access (K1); email link policy (N2)
3. Restrict `force` on PUT (H2)
4. Auth rate limits + [Cloudflare guide](docs/CLOUDFLARE-RATE-LIMITS.md)
5. 5 MB body cap; remove health client ID hint
6. XSS escapes (calendar bars, print summary)
7. Session rotation on login; `POST /api/auth/logout-all`; `session_max_days` admin setting (migration `0007`)

### Phase 1 — Planned

- TOTP; session rotation; shorter max session
- CSP; broader `escapeHtml` audit
- Adaptive polling; per-user save limits

### Phase 2

- Remove Kakao; password + TOTP for all

---

## Testing checklist

- [ ] Callback with stolen `code`/wrong state → no `cal_session`
- [ ] First Kakao login creates user and shows pending-access until calendars granted
- [ ] Email pre-added without Kakao ID → `kakao_not_linked`
- [ ] Non-holder cannot `PUT` with `force: true` while another holds lock
- [ ] Class name `<img onerror=...>` does not run script in calendar view
- [ ] 25+ auth attempts/min/IP → 429
- [ ] `PUT` body &gt; 5 MB → 413
- [ ] Production: no `ALLOW_OPEN_ACCESS`; strong bootstrap secret
- [ ] After Kakao login: one `sessions` row per user; `kakao_oauth_state` cleared
- [ ] Second browser login invalidates first browser session
- [ ] Sign out all devices clears all sessions; `cal_session` gone
- [ ] Admin `session_max_days` applies to new login cookie Max-Age

---

## References

- [DEVELOPER.md](DEVELOPER.md) — env vars, dual backend  
- [AGENTS.md](AGENTS.md) — lock/sync  
- [KAKAO-SETUP.md](KAKAO-SETUP.md) — Kakao console + invite workflow  
- [docs/CLOUDFLARE-RATE-LIMITS.md](docs/CLOUDFLARE-RATE-LIMITS.md)
