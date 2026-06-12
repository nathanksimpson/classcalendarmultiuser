# Developer guide — Class Calendar Multi User

Quick reference for editing this repo and pushing updates. Teachers use [FOR TEACHERS.md](FOR%20TEACHERS.md) and [FOR TEACHERS-ko.md](FOR%20TEACHERS-ko.md); in-app Help is at `help.html` (`js/help-guide.js`, `js/help-page.js`). Production setup uses [CLOUDFLARE-DEPLOY.md](CLOUDFLARE-DEPLOY.md).

**Project location:** `D:\Simson USB\Class Calendar Multi User` on the **Simson USB** stick (drive letter may be `D:`, `E:`, etc.). **GitHub** holds committed code; **production** holds what users see after `npm run deploy`. Those three can disagree briefly (e.g. deployed on work PC but not yet pushed). See [AGENTS.md](AGENTS.md) → *USB portable workflow*.

## Local setup

**Preview requires the server** — opening HTML files directly (or static-only preview) will not load team calendars or save data. Always use `npm start` and http://localhost:8080.

1. `.env` should exist (copy from `.env.example` if missing).
2. Keep `ALLOW_OPEN_ACCESS=1` for login-free local dev (never use in production).
3. `npm install` then `npm start` → http://localhost:8080
4. SQLite DB: `data/calendars.db` (created on first run).

### Visual cohort setup board (local preview only)

The **Setup → Cohorts** tab uses a visual setup board with click actions (`js/setup-board.js`, `js/meeting-days-control.js`): cohort list plus grid (no side palettes). Classes can be saved without a cohort on the Classes tab; assign via **+ Add class** on a cohort card or the cohort editor catalog (**Edit cohort**). Cohort↔class links are synced in `app.js` (`syncClassCohortLinks`, `syncAllClassCohortLinksInData`) and `js/teacher-timetable.js`. Lazy-loaded via `js/app-tab-scripts.js` (shared `teacher-timetable.js?v=20260620-cohort-integration`).

**Windows + Node 24:** Local server needs `better-sqlite3` ^12.10 (prebuilt for Node 24). If `npm install` works but `npm start` fails with `NODE_MODULE_VERSION`, Cursor may have installed native modules for its bundled Node — close integrated terminals, open **Windows PowerShell**, `cd` to the project, delete `node_modules`, and run `npm install` again (system `node -v` should match the Node you use to start the server).

| Variable | Purpose |
|----------|---------|
| `PORT` | Default 8080 |
| `PUBLIC_URL` | OAuth redirect base |
| `ALLOW_OPEN_ACCESS=1` | Dev only — synthetic admin |
| `KAKAO_*`, `BOOTSTRAP_ADMIN_SECRET`, `OAUTH_STATE_SECRET` (optional) | Real auth / first admin / OAuth CSRF signing |

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
| Login / session | `js/team-auth.js`, `login.html`, `pending-access.html` |
| Admin UI | `admin.html`, `js/admin.js` |
| Help page | `help.html`, `help.css`, `js/help-guide.js`, `js/help-page.js` |
| REST / Kakao / sessions | `server/index.js` **and** `worker/src/index.js` |
| Users, passwords, locks | `server/users.js` + Worker mirror in `worker/src/index.js` |
| Calendar CRUD | `server/calendars.js` |
| Access control | `server/calendar-access.js`, `worker/src/calendar-access.js`, `server/access-requests.js`, `worker/src/access-requests.js` |
| App settings | `server/app-settings.js`, `worker/src/app-settings.js` |
| Export JSON shape | `SCHEMA.md`, `Example Calendars/` |
| Daily class log (calendar) | `js/day-notes.js`, `appData.dayNotes[]`, calendar context menus in `app.js` |

### UI tokens and shared controls

Full guide for agents and UI work: **[UI_STYLE_GUIDE.md](UI_STYLE_GUIDE.md)** (on-screen UI). Syllabus A4 print/PDF: **[Syllabus Style Guide.md](Syllabus%20Style%20Guide.md)**.

Typography, spacing, and colors are defined in [`styles.css`](styles.css) `:root` (Simple Design System + 8px grid: `--space-*`, `--text-body-*`, `--text-h*`).

| Use case | Class / token |
|----------|----------------|
| Standard text input or select (outside `.form-group`) | `.field-input`, `.field-select`, or `.field-control` |
| Toolbar / catalog dropdowns (compact) | add `.field-control--compact` |
| Bordered checkbox tiles (Teachers/Cohorts catalogs, filter rows) | `.checkbox-label.selection-chip` |
| Section headings in editors | `.form-section-title` |
| Form labels + fields | wrap in `.form-group` when possible |
| Hints | `.section-hint` |

Reference implementations: class editor (`.form-group`), calendar visibility bar (`.visibility-chip` — legacy alias; prefer `.selection-chip` in new setup-tab UI), lesson-filter popover (plain `.lesson-filter-chip` without borders is intentional for dense calendar filters only).

**Breakpoints (CSS + JS must agree):**

| Tier | Width | `html[data-viewport]` | JS |
|------|-------|----------------------|-----|
| Phone | ≤640px | `phone` | `isViewportPhone()` / `VIEWPORT_BP_PHONE` |
| Small tablet | 641–900px | `tablet-sm` | `matchMedia('(max-width: 900px)')` for narrow header |
| Tablet | 901–1024px | `tablet` | `isViewportTabletOrBelow()` |
| Desktop | >1024px | (unset) | default |

Use `--bp-sm`, `--bp-md`, `--bp-lg`, `--bp-tablet`, `--bp-xl` in new `@media` rules instead of ad-hoc pixel values. Split sidebars: `--split-sidebar-min` / `--split-sidebar-max`. Editor prose max width: `--editor-prose-max`.

**Mobile UX notes:**

- **Setup host** is hidden on phone (`syncSetupTabsVisibility`); `mobileSetupLimitedBanner` shows on setup tabs if user lands there on a small screen.
- **Notes tab** on phone redirects to `notes.html` (`prefersMobileNotesNav`); tab label becomes “Day notes” via `syncNotesTabPhoneChrome`.
- **Calendar** defaults to agenda on phone; Month segment hidden when `data-calendar-view="agenda"`.
- **Touch targets:** `--touch-min` (44px) on primary controls at `max-width: var(--bp-md)`.
- New UI: use tokens and shared classes — do not add one-off `padding`/`font-size` in feature CSS.

**Day notes vs class Notes:** `classes[].notes` in the class editor is a static class memo. `dayNotes[]` is timestamped per-class, per-calendar-day entries. **Entry:** calendar → right-click lesson → Add note (quick log for that class/day). **Single day:** day right-click or **Day notes** in term settings. **Browse/export range:** top-level **Notes** tab or **Classes** → **Notes** (same UI shell: date range, class/subject/grade filters, saved list, export). Data helpers: `js/day-notes.js` (`filterNotes`, `formatRangeExportByClass`). Tab DOM/preview cards: `js/class-notes-panel.js`; mount, filters, listeners, save/sync: `app.js` (`ensureClassNotesShell`, `initClassNotesPanelListeners`, `refreshClassNotesPanelIfMounted`). Filter checkboxes rebuild when calendar data loads via `refreshClassNotesPanelIfMounted`, not only on first tab open (`classNotesFiltersBuilt` guards one-time date restore).

**Day notes and the edit lock:** Saving notes uses `PUT` with `dayNotesOnly: true` (`CalendarSync.saveDayNotesOnly`) — **no calendar edit lock** required. Schedule changes still use the lock. Each note may include `authorUserId`; co-teachers see all notes for a class/day but may only edit/delete their own (server: `prepareDayNotesForSave` in `server/day-notes-access.js` / `worker/src/day-notes-access.js`). Legacy notes without `authorUserId` are read-only for teachers (admins with `manage_calendar_access` may change them). Concurrent note saves from two teachers can still produce a calendar **revision 409**; reload merges by note `id` via `mergeDayNotesById`.

## Editing surfaces (popout vs tab vs workspace)

The main app uses **one movable form** per entity (`#classForm`, `#holidayForm`): templates in `index.html` are cloned once and **moved** between mounts via `mountClassForm` / `mountHolidayForm` in `app.js`.

| Surface | When to use | Visible fields |
|---------|-------------|----------------|
| **Calendar popout** | Quick edit from the grid | `data-editor-mode="popout"` — shared fields only (see order below); Save in header |
| **Classes / Events tab** | Full editor | `data-editor-mode="full"` — same shared-field order as popout, then full-only sections (teacher/cohort, default book, book periods, notes, custom schedule, compression) |
| **Syllabus tab** | Lesson table + notes/units | Table first; header Save + Refresh + ⋮ More |
| **Workspace** (`workspace.html`) | Homework copy + books editor | Subset of `app.js`; revision banner uses `CalendarSync.onRemoteNewer` (no separate meta poll) |
| **Day notes app** (`notes.html`) | Mobile day journal — scheduled classes + `dayNotes[]` | `js/notes.js` + `app.js` save helpers; same login/API as main app |

**Teacher bookmark (sign in → notes):** `login.html?return=/notes.html` on the same host as the calendar (local: `http://localhost:8080/login.html?return=/notes.html`). When already signed in, use `/notes.html` directly.

Field-order convention (class and event — **same DOM order** in popout and full tab; popout hides `.form-group--full-only` and `.form-section-advanced`):

- **Class:** name → colors → curriculum (level, book, Apply) → term dates → period / level / grade → total lessons → meeting days → *(full only)* teacher & cohort, default book, book periods, notes, custom schedule, compression
- **Event:** name → colors → date range → dates → event type → applies to → *(full only)* notes

Popouts need little or no scrolling because calendar-visible fields come first.

Modal open/close/focus: `CCPModalRegistry` in `app.js` (class, event, print, conflict, team modals). Admin uses `bindAdminModalA11y` in `js/admin.js`.

Shared client modules: `js/utils.js` (`CCPUtils`), `js/client-api.js` (`CCPApi`), `js/theme-init.js` + `js/theme-toggle.js` (`CCPTheme`).

Future optional split: `app-calendar.js` / `app-syllabus.js` for smaller workspace bundle — not required today.

---

## Dual-backend checklist (required for `/api` changes)

Use this whenever you change auth, routes, locks, calendars, admin, or DB behavior.

- [ ] **Express** — Update `server/index.js` and any `server/*.js` module used by the route.
- [ ] **Worker** — Mirror the same behavior in `worker/src/index.js` (and `worker/src/*.js` if logic is shared).
- [ ] **Response shape** — Match status codes, JSON fields, and error messages so `js/calendar-sync.js` and `js/admin.js` work on both hosts.
- [ ] **Schema** (if tables/columns changed):
  - [ ] Add migration SQL: `worker/migrations/NNNN_description.sql` (use the next sequential number — see note below)
  - [ ] Update local schema: `server/schema.js`
  - [ ] Run `npm run db:migrate:remote` before or right after deploy (see below)

**D1 migration numbering:** Files live in `worker/migrations/`. Apply in lexicographic order. Historical duplicate prefixes (`0008_session_login_context.sql` vs `0008_nav_notification_ttl.sql`, etc.) are already applied on production — do not rename. For new migrations use the next free number (e.g. `0015_*.sql`). Local SQLite mirrors the same tables via `migrate*()` functions in `server/schema.js` — keep both in sync.
- [ ] **Local test** — `npm start`, exercise the changed flow at http://localhost:8080
- [ ] **No secrets in git** — Kakao keys and `BOOTSTRAP_ADMIN_SECRET` stay in `.env` (local) or `wrangler secret put` (production)

UI-only changes still need **`npx wrangler deploy`** for production (see deploy checklist). Local-only: `npm start` is enough.

**Lock / sync API notes:** Server returns explicit `holdsLock` on meta/lock/load — do not infer only from `lock.holderUserId`. `409` revision conflict includes `body.document`; duplicate name uses `code: DUPLICATE_NAME` (no conflict modal).

**Kakao auth:** First Kakao login auto-creates a teacher (`resolveKakaoLoginUser` in `server/users.js` / `worker/src/index.js`). Teachers with zero accessible calendars are redirected to `pending-access.html` at login (password and Kakao callback in `server/index.js` / `worker/src/index.js`; `TeamAuth.ensure` is a fallback if they hit `/` directly). Only admins may `POST /api/calendars`. Setup: [KAKAO-SETUP.md](KAKAO-SETUP.md). `GET /api/auth/me` includes `hasCalendarAccess`. Signed-in users may update their own display name via `PATCH /api/auth/profile` (`{ displayName }`); UI on `index.html` (Edit name) and `pending-access.html`.

**Pending access (in-app only):** `pending-access.html` shows a confirmation splash (“pending admin approval”) — no email in v1. On load it calls `POST /api/access-request` (or `GET /api/access-request/me` for status only), which logs `user_needs_access` via `notifyUserNeedsAccess` (24h dedup). New Kakao signups may land with `?welcome=1`.

**Per-calendar access:** Each grant on `calendar_members` / `calendar_groups` has `access_level`: `viewer` (read-only), `suggester` (read-only + suggestions API), or `editor` (normal lock + save). Admin **Calendars** tab saves `{ userAccess, groupAccess }` via `PUT /api/admin/calendars/:id/access`. Calendar meta includes `canEdit`, `accessLevel`, and `readOnly` merges permission + lock. Waiting teachers appear in `GET /api/admin/access-requests` (in-app admin banner).

**Global permissions (super admin):** `users.permissions` JSON overrides role presets when set. Super admins edit checkboxes in the Accounts **Edit user** / **Add teacher** forms (`GET /api/admin/permission-meta`). Promoting to **Super admin** role or granting all global permissions on another role requires the actor’s `confirmPassword`. Only super admins may assign the super admin role or custom permissions. `canForceUnlock` remains role-based (`super_admin` / `head_teacher`), not checkbox-based. Logic: `server/admin-user-policy.js` (mirror `worker/src/admin-user-policy.js`).

**Calendar creator scope:** `calendars.created_by_user_id` (migration `0012_calendars_created_by.sql`). **Teacher** preset: `create_calendars` and `view_calendars` only; creators manage access and delete only calendars they created. **Head teacher** preset adds `manage_groups` and `manage_calendar_access` (any calendar on Admin → Calendars) but not `view_all_calendars` or `delete_calendars` globally. Global checkboxes grant any calendar. New calendars set `created_by_user_id` on create. Migration `0014_head_teacher_preset.sql` clears stored `permissions` for existing `head_teacher` rows so they pick up the preset.

---

## Deploy verification checklist (production)

Production: https://classcalendarmultiuser.nathanksimpson.workers.dev (see `PUBLIC_URL` in `wrangler.toml`).

**Important:** `git push origin main` alone does **not** update the live site unless **Cloudflare Workers Builds** is connected (it runs `wrangler deploy` on push; `wrangler.toml` `[build]` runs `npm run build` first). For manual deploy, run **`npm run deploy`** (`npm run build` then `wrangler deploy`). Local dev still uses source files from the repo root (`npm start`); production static assets are minified into `dist/` (gitignored).

- [ ] **Local smoke test** — `npm start`; confirm the feature works with `ALLOW_OPEN_ACCESS=1`.
- [ ] **Tests** — `npm test` (language-init + `tests/i18n-parity.test.mjs` for en/ko key parity); add `node tests/<name>.test.mjs` if you touched syllabus/homework logic.
- [ ] **Cache bust** (if `app.js`, `calendar-sync.js`, or `team-auth.js` changed) — bump `?v=` on those script tags in `index.html` (e.g. `?v=20260526-delete-refresh`).
- [ ] **Push** (optional backup on GitHub) — `git push origin main`
- [ ] **Deploy** — `npm run deploy` from project folder (requires `npx wrangler login` once).
- [ ] **Cloudflare** — Dashboard → Workers → **classcalendarmultiuser** → confirm latest deployment succeeded.
- [ ] **D1 migrations** (only if you added a new file under `worker/migrations/`):

  ```powershell
  cd "D:\Simson USB\Class Calendar Multi User"
  npm run db:migrate:remote
  ```

  Current migrations (apply in order on remote D1):

  | File | Purpose |
  |------|---------|
  | `0001_init.sql` | Core tables |
  | `0003_lock_pending.sql` | Lock pending requester |
  | `0004_calendar_access.sql` | Groups and calendar access |
  | `0005_app_settings.sql` | App settings (e.g. lock stale minutes) |
  | `0015_calendar_blob_encryption.sql` | `data_enc_version`, `data_key_wrapped` on calendars + suggestions |

- [ ] **Blob encryption** (if enabling application-level calendar encryption):
  1. Generate key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  2. Local: add `DATA_ENCRYPTION_MASTER_KEY` to `.env` (back up offline)
  3. Production: `npx wrangler secret put DATA_ENCRYPTION_MASTER_KEY`
  4. Deploy dual-read code, then `npm run db:migrate:remote`
  5. Encrypt existing rows: `node scripts/encrypt-calendars-blob.mjs --remote` (and `--local` for dev DB)
  6. Smoke test: load/save calendar, classroom partial save, suggestion create/apply
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

1. **Wrong repo** — This is `Simson USB\Class Calendar Multi User`, not `f:\Calendar App` (single-user, no team sync).
2. **USB ≠ deploy** — Carrying the USB between PCs does not update production; only `npm run deploy` does. After switching computers: plug in USB, `git pull origin main`, `npm install` if needed. If live site behavior differs from your folder, pull from GitHub and check who last deployed.
3. Fixing only `server/` leaves production broken until `worker/src/index.js` matches.
4. Local migrations live in `server/schema.js`; production needs `worker/migrations/*.sql`.
5. After `sync-from-main`, re-check `index.html` script tags.
6. Lock/revision fields must match API and `js/calendar-sync.js` (`readOnly`, `holdsLock`, `lock`, `revision`, `pendingEditRequest`).
7. Same display name ≠ same calendar — each row has a unique `id`; names are unique on create/rename only (existing duplicates not auto-fixed).
8. **Lock debugging** — Both users must be on the **same** `calendarId`; use `?lockDebug=1` or `CalendarSync.setLockDebugEnabled(true)`; hard refresh (Ctrl+F5) after deploy.

Do not commit `.env`, `data/`, `node_modules/`, or `.wrangler/`.

---

## Calendar load recovery (debate migration & `global is not defined`)

Older builds referenced Node’s **`global`** in the browser bundle, which threw **`ReferenceError: global is not defined`** during **`migrateData`** or when opening the class editor (`collectDebateBookPeriodsFromForm`). That prevented team calendars from loading and could block lazy-loaded modules (e.g. syllabus).

**Fix in code:** Use **`globalThis`** (via **`getCCPDebatePeriods()`**) and **`js/debate-periods.js`** exporting **`globalThis.CCPDebatePeriods`**. **`migrateData`** only runs **`migrateBooksByMonthToPeriods`** when **`CCPDebatePeriods`** is present; migration errors per class are logged and skipped so one bad row does not break the whole calendar.

**One-time client migration:** Debate classes with legacy **`booksByMonth`** gain **`debateBookPeriods`** when the app loads (`debateBookPeriodsMigrated` prevents repeat). After deploy, **`index.html`** script **`?v=`** must be bumped so browsers fetch the fixed **`app.js`** / **`debate-periods.js`**.

**If the app errors on load after an update:** Hard refresh (**Ctrl+F5** / empty cache reload), reopen the calendar, confirm you’re on the intended team calendar. Do not wipe **D1** data; server-side calendars are intact once the client runs the fixed bundle.

---

## Security

See **[SECURITY-AUDIT.md](SECURITY-AUDIT.md)** for a pinned security review (Kakao OAuth, locks, bootstrap, rate limiting) and phased remediation plan. Auth/TOTP/Kakao removal are **not** implemented until explicitly scheduled.

**Calendar blob encryption (v1):** `crypto/blob-at-rest.js` encrypts `calendars.data` and `calendar_suggestions.data` with AES-256-GCM envelope encryption when `DATA_ENCRYPTION_MASTER_KEY` is set. Legacy plaintext rows (`data_enc_version = 0`) still load. New saves encrypt when the key is present. Optional `DATA_ENCRYPTION_REQUIRED=1` fails writes without a key. Implementation: `server/calendar-storage.js`, `worker/src/calendar-storage.js`.

## Agent handoff

See **[AGENTS.md](AGENTS.md)** for recent feature summary, lock behavior, key files, and suggested first steps for a new coding session.
