# Developer guide — Class Calendar Multi User

Quick reference for editing this repo and pushing updates. Teachers use [FOR TEACHERS.md](FOR%20TEACHERS.md) and [FOR TEACHERS-ko.md](FOR%20TEACHERS-ko.md); in-app Help is in `howto.js`. Production setup uses [CLOUDFLARE-DEPLOY.md](CLOUDFLARE-DEPLOY.md).

## Local setup

**Preview requires the server** — opening HTML files directly (or static-only preview) will not load team calendars or save data. Always use `npm start` and http://localhost:8080.

1. `.env` should exist (copy from `.env.example` if missing).
2. Keep `ALLOW_OPEN_ACCESS=1` for login-free local dev (never use in production).
3. `npm install` then `npm start` → http://localhost:8080
4. SQLite DB: `data/calendars.db` (created on first run).

| Variable | Purpose |
|----------|---------|
| `PORT` | Default 8080 |
| `PUBLIC_URL` | OAuth redirect base |
| `ALLOW_OPEN_ACCESS=1` | Dev only — synthetic admin |
| `KAKAO_*`, `BOOTSTRAP_ADMIN_SECRET` | Real auth / first admin |

## Architecture

| Layer | Local (`npm start`) | Production (`npm run deploy`) |
|-------|---------------------|-------------------------------|
| API | `server/index.js` + `server/*.js` | `worker/src/index.js` |
| DB | `server/schema.js` → `data/calendars.db` | `worker/migrations/*.sql` → D1 |
| Static | Express serves repo root | Wrangler `[assets]` (see `.assetsignore`) |

Frontend calls `/api` via `js/calendar-sync.js` (save debounce, poll, locks, revisions).

**Sibling repo:** `../Calendar App` — `npm run sync-from-main` copies UI updates (skips `js/calendar-sync.js`, `package.json`, `.env`).

## Where to edit

| Task | Files |
|------|--------|
| Calendar UI, print, syllabus | `app.js`, `js/`, `styles.css`, `index.html` |
| Team sync / locks | `js/calendar-sync.js`, hooks in `app.js` |
| Login / session | `js/team-auth.js`, `login.html` |
| Admin UI | `admin.html`, `js/admin.js` |
| REST / Kakao / sessions | `server/index.js` **and** `worker/src/index.js` |
| Users, passwords, locks | `server/users.js` + Worker mirror in `worker/src/index.js` |
| Calendar CRUD | `server/calendars.js` |
| Access control | `server/calendar-access.js`, `worker/src/calendar-access.js` |
| App settings | `server/app-settings.js`, `worker/src/app-settings.js` |
| Export JSON shape | `SCHEMA.md`, `Example Calendars/` |

---

## Dual-backend checklist (required for `/api` changes)

Use this whenever you change auth, routes, locks, calendars, admin, or DB behavior.

- [ ] **Express** — Update `server/index.js` and any `server/*.js` module used by the route.
- [ ] **Worker** — Mirror the same behavior in `worker/src/index.js` (and `worker/src/*.js` if logic is shared).
- [ ] **Response shape** — Match status codes, JSON fields, and error messages so `js/calendar-sync.js` and `js/admin.js` work on both hosts.
- [ ] **Schema** (if tables/columns changed):
  - [ ] Add migration SQL: `worker/migrations/NNNN_description.sql`
  - [ ] Update local schema: `server/schema.js`
  - [ ] Run `npm run db:migrate:remote` before or right after deploy (see below)
- [ ] **Local test** — `npm start`, exercise the changed flow at http://localhost:8080
- [ ] **No secrets in git** — Kakao keys and `BOOTSTRAP_ADMIN_SECRET` stay in `.env` (local) or `wrangler secret put` (production)

UI-only changes still need **`npx wrangler deploy`** for production (see deploy checklist). Local-only: `npm start` is enough.

**Lock / sync API notes:** Server returns explicit `holdsLock` on meta/lock/load — do not infer only from `lock.holderUserId`. `409` revision conflict includes `body.document`; duplicate name uses `code: DUPLICATE_NAME` (no conflict modal).

---

## Deploy verification checklist (production)

Production: https://classcalendarmultiuser.nathanksimpson.workers.dev (see `PUBLIC_URL` in `wrangler.toml`).

**Important:** `git push origin main` alone does **not** update the live site. Run **`npm run deploy`** (`npx wrangler deploy`) after pushing (or deploy from your PC without pushing, for a quick test).

- [ ] **Local smoke test** — `npm start`; confirm the feature works with `ALLOW_OPEN_ACCESS=1`.
- [ ] **Tests** (if syllabus/homework touched) — `node tests/<name>.test.mjs`
- [ ] **Cache bust** (if `app.js`, `calendar-sync.js`, or `team-auth.js` changed) — bump `?v=` on those script tags in `index.html` (e.g. `?v=20260526-delete-refresh`).
- [ ] **Push** (optional backup on GitHub) — `git push origin main`
- [ ] **Deploy** — `npm run deploy` from project folder (requires `npx wrangler login` once).
- [ ] **Cloudflare** — Dashboard → Workers → **classcalendarmultiuser** → confirm latest deployment succeeded.
- [ ] **D1 migrations** (only if you added a new file under `worker/migrations/`):

  ```powershell
  cd "f:\Calendar App Multi User"
  npm run db:migrate:remote
  ```

  Current migrations (apply in order on remote D1):

  | File | Purpose |
  |------|---------|
  | `0001_init.sql` | Core tables |
  | `0003_lock_pending.sql` | Lock pending requester |
  | `0004_calendar_access.sql` | Groups and calendar access |
  | `0005_app_settings.sql` | App settings (e.g. lock stale minutes) |

- [ ] **Production smoke test** — Open live URL; sign in with Kakao if auth changed; verify admin/calendar flows.
- [ ] **Secrets** — New env vars for production need `npx wrangler secret put NAME` (never commit).

---

## npm scripts

| Script | Command |
|--------|---------|
| `start` | Local Express + SQLite |
| `deploy` | `wrangler deploy` |
| `db:migrate:remote` | Apply D1 migrations to `calendar-team` |
| `sync-from-main` | Copy from `../Calendar App` |

## Common pitfalls

1. **Wrong repo** — This is `f:\Calendar App Multi User`, not `f:\Calendar App` (single-user, no team sync).
2. Fixing only `server/` leaves production broken until `worker/src/index.js` matches.
3. Local migrations live in `server/schema.js`; production needs `worker/migrations/*.sql`.
4. After `sync-from-main`, re-check `index.html` script tags.
5. Lock/revision fields must match API and `js/calendar-sync.js` (`readOnly`, `holdsLock`, `lock`, `revision`, `pendingEditRequest`).
6. Same display name ≠ same calendar — each row has a unique `id`; names are unique on create/rename only (existing duplicates not auto-fixed).
7. **Lock debugging** — Both users must be on the **same** `calendarId`; use `?lockDebug=1` or `CalendarSync.setLockDebugEnabled(true)`; hard refresh (Ctrl+F5) after deploy.

Do not commit `.env`, `data/`, `node_modules/`, or `.wrangler/`.

---

## Security

See **[SECURITY-AUDIT.md](SECURITY-AUDIT.md)** for a pinned security review (Kakao OAuth, locks, bootstrap, rate limiting) and phased remediation plan. Auth/TOTP/Kakao removal are **not** implemented until explicitly scheduled.

## Agent handoff

See **[AGENTS.md](AGENTS.md)** for recent feature summary, lock behavior, key files, and suggested first steps for a new coding session.
