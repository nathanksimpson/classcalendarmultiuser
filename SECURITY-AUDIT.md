# Security audit — Class Calendar Multi User

**Date:** 2026-05-25 (updated 2026-05-31)  
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
| H-A1 | **`user_admin` could PATCH/demote super-admin accounts** | Privilege / account takeover | **Fixed:** `assertCanManageTargetUser` on admin user routes (server + worker) |
| H-A2 | **Suggestion dismiss without calendar ACL** | IDOR for `apply_suggestions` holders | **Fixed:** `canAccessCalendar` on dismiss (server; worker already gated at suggestion block) |

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
| M-A1 | **`GET /api/groups` for pending users** | Org structure leak | **Fixed:** same gate as `/api/teachers` |
| M-A3 | **Server lock bypass drift** | Head teacher bypass on local PUT | **Fixed:** holder check aligned with worker |
| M-A7 | **Admin HTML public** | UI recon | **Mitigated:** redirect to login without `canAccessAdmin` |
| M-A9 | **Internal docs in `dist/`** | Recon (D1 id, audit notes) | **Fixed:** excluded from build |
| M-A6 | **Worker rate limit fails open on D1 error** | Auth brute force | **Fixed:** fail closed |

---

## Low / hygiene

- Client idle logout — [js/team-auth.js](js/team-auth.js)
- CSP / HSTS — not on static assets; configure via Cloudflare
- Stored XSS — partial fix in [app.js](app.js) hot paths; **class autocomplete** escaped (2026-05-31); continue audit for other `innerHTML`
- Prompt injection — N/A (no LLM)
- Kakao removal — Phase 2 per original roadmap

---

## Kakao login policy (implemented)

1. Teacher uses **Login with Kakao**; server verifies **signed OAuth state** (CSRF).
2. **First login** with a new Kakao user ID **auto-creates** a teacher row (email stored only if Kakao shares it — not required for admins to collect email).
3. Existing users match by **Kakao user ID**, or by email only when admin pre-added email and set the matching **Kakao user ID** (`kakao_not_linked` / `kakao_mismatch` otherwise).
4. **Calendar access** still requires group/calendar assignment (`pending-access.html` until granted).
5. Admins recognize new teachers in **Admin → Users** by display name and **Kakao ID** column.

Env: `OAUTH_STATE_SECRET` (required when Kakao enabled on local server; falls back to `BOOTSTRAP_ADMIN_SECRET` on worker if unset).

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
8. Admin super-admin target protection (H-A1); suggestion dismiss ACL (H-A2); groups gate (M-A1)
9. Admin HTML login redirect; internal docs excluded from production build (M-A7, M-A9)
10. Local server: `ALLOW_OPEN_ACCESS` localhost-only; Kakao requires strong OAuth state secret

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
- [ ] `user_admin` gets 403 when PATCHing a super-admin account
- [ ] User with `apply_suggestions` but no calendar access gets 404 on suggestion dismiss
- [ ] Pending-access user gets 403 on `GET /api/groups`
- [ ] `/admin.html` without admin session redirects to login
- [ ] Production `dist/` does not serve `SECURITY-AUDIT.md` or `wrangler.toml`

---

## References

- [DEVELOPER.md](DEVELOPER.md) — env vars, dual backend  
- [AGENTS.md](AGENTS.md) — lock/sync  
- [KAKAO-SETUP.md](KAKAO-SETUP.md) — Kakao console + invite workflow  
- [docs/CLOUDFLARE-RATE-LIMITS.md](docs/CLOUDFLARE-RATE-LIMITS.md)
