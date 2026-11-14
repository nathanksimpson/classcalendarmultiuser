# Calendar Multi User — Agent Handoff

Use this with [DEVELOPER.md](DEVELOPER.md) for day-to-day edits and deploy steps.

## Project

| | |
|--|--|
| **Folder** | `D:\Simson USB\Class Calendar Multi User` (USB — drive letter may be `D:`, `E:`, etc.) |
| **NOT** | `f:\Calendar App` (single-user, no team sync) |
| **GitHub** | https://github.com/nathanksimpson/classcalendarmultiuser |
| **Live** | https://classmanager.live (also https://classcalendarmultiuser.nathanksimpson.workers.dev) |
| **Branch** | `main` |
| **Portable copy** | USB stick — carry repo between home and work PCs (includes `.git`) |
| **Code source of truth** | **USB folder** synced with GitHub `main` — `git pull` / `git push` from `D:\Simson USB\Class Calendar Multi User` (drive letter may differ) |
| **Live features** | Production URL after a push to `main` or `npm run deploy` — may differ from an unsynced local copy |

**Open Cursor on the USB path only.** The old network workspace (`\\simson-jsl\...\Class Calendar Multi-User`) is **retired** — do not edit it or port fixes from it. Any uncommitted work there is stale; USB + `origin/main` wins.

After starting a session: `git pull origin main` in the USB project folder (on **whichever PC** you are using). Do not assume the USB folder matches production until you pull and/or compare with the live site.

## USB portable workflow (home ↔ work)

The repo lives on a **USB drive** (`Simson USB\Class Calendar Multi User`) so you carry the same project between home and work. The USB holds source files and `.git`; it does **not** deploy the app and is **not** a substitute for Git.

| What USB does | What it does *not* do |
|---------------|------------------------|
| Carry the repo (and `.git`) between PCs | Update https://classmanager.live |
| Let you open the same folder in Cursor on either machine | Replace `git pull` / `git push` |
| | Keep `node_modules` reliable (re-run `npm install` per PC when needed) |

**Deployed features can differ from your folder:** production only changes when someone runs `npm run deploy`. Treat **GitHub `main` + last deploy** as the checklist for “what should be live,” not “whatever is on the USB stick right now.”

**Recommended session start (each PC):**

1. Plug in USB; open `\<drive letter>:\Simson USB\Class Calendar Multi User` in Cursor (drive letter may differ per PC).
2. `git pull origin main` — get changes pushed from the other PC.
3. If `package.json` changed or `npm start` fails with `NODE_MODULE_VERSION`: delete `node_modules`, run `npm install`.
4. Ensure `.env` exists (copy from `.env.example` once per PC if needed; `ALLOW_OPEN_ACCESS=1` for local dev).
5. `npm start` → test at http://localhost:8080 before deploying.

**End of session:**

1. `git commit` + `git push origin main` when changes are ready (backs up to GitHub).
2. `npm run deploy` from **one** machine when production should update.
3. Close Cursor/terminals; safely eject USB.

**USB pitfalls:**

- **One PC at a time** — USB cannot be on two machines simultaneously (simpler than Drive conflict copies).
- **Do not keep editing** the old Google Drive copy (`G:\Other computers\내 컴퓨터\Class Calendar Multi-User`) — USB is the only working folder. Optionally rename the Drive folder to `Class Calendar Multi-User (archived)`.
- **Do not rely on USB for `node_modules` or `.wrangler`** — reinstall per PC when needed; exclude them from manual copies (use `git` + `npm install`).
- **`.env` and `data/`** stay gitignored — copy `.env` once per PC if you need Kakao auth locally; DB is created on first `npm start` if missing.
- **Drive letter changes** — always navigate via `\Simson USB\Class Calendar Multi User\` in File Explorer, or use [`START TEAM CALENDAR.bat`](START%20TEAM%20CALENDAR.bat) (`%~dp0` works on any drive letter).
- **UNC / network paths** — `npm run deploy` may fail from a network workspace; run deploy from the USB local path (e.g. `D:\Simson USB\...`) or use `subst` to map a drive letter.
- **Old paths retired:** `f:\Calendar App Multi User`, Google Drive copy, and network `\\simson-jsl\...` Cursor workspace — **do not use**. If you see a stale UNC checkout, run `git fetch origin && git reset --hard origin/main` once, then work only from USB.
- **`npm test` / `npm run deploy`:** run from a local drive path (`D:\Simson USB\...` or `subst Z:` → USB). UNC cwd often breaks npm.

## Local preview (required for real data)

**Do not open `index.html` / `workspace.html` as a file or with Live Server only** — team calendars, login, and saves need the API.

1. `.env` with `ALLOW_OPEN_ACCESS=1` (local dev only).
2. `npm start` → http://localhost:8080 (default port **8080**).
3. Hard refresh (Ctrl+F5) after script/CSS changes.

Without `npm start`, the app cannot load or save calendar data.

**TMS Sync on classmanager.live:** teachers install the Sync Helper (port 8765) from the header Sync window. It stays on that PC so TMS sees the school IP. `npm start` on port 8080 remains the developer bridge. The live site probes `http://127.0.0.1:8765` first, then `http://127.0.0.1:8080`. Apply still saves to the cloud calendar.

**Essay Sync (Classroom → Essays → Sync from TMS):** uses `POST /api/tms/bridge/essays/preview` (not the roster bridge path). After pulling/deploying essay Sync code, **restart** the local bridge process — an old `npm start` still answers ping (`bridge: true`) but essay load fails with “Failed to fetch” until restarted from this project folder.

## Deploy (required for production)

> **Pushing to `main` deploys to production.** Cloudflare Workers Builds is connected to this repo: every push to `main` builds and deploys the live site within a few minutes. Anything not merged into `main` (for example a USB-only branch) **disappears from the live site** on the next push, because the deploy is built from `main` alone. Merge or rebase branch work into `main` before pushing. D1 migrations are **not** run by the build: run `npm run db:migrate:remote` yourself when a change adds one.


1. Test locally via `npm start` when possible (see above).
2. API changes: update **both** `server/` and `worker/src/`.
3. **Cache strings are automatic for deploys:** `npm run build` rewrites every quoted `…?v=…` ref (HTML and JS loaders such as `js/app-tab-scripts.js`) in `dist/` to a content hash, and sets `CCP_I18N_VERSION`. Manual `?v=` bumps in the repo are only needed if you want a hard refresh to pick up changes under local `npm start`. Keep a non-empty `?v=` on new script/link tags so the build can stamp them.
4. **What ships:** `scripts/build-assets.mjs` publishes an allow-list (`*.html`, `app.js`, `styles.css`, `js/`, `css/`, `help/`, `soundboard/`, `templates/`, `tools/`, …). A new top-level file or folder **fails the build** until you add it to `SHIP_*` (public) or `DEV_ONLY_*` (private). Security headers come from `shared/security-headers.cjs` (written to `dist/_headers`; Worker pages via `withSecurityHeaders`).
5. `npm run deploy` (runs `npm run build` → minified `dist/`, then wrangler) for a manual deploy. A push to `main` also deploys (Workers Builds). Local `npm start` still serves unfrozen sources from the repo root. **CSS:** edit root `styles.css` only; `npm run build` runs `css:split` then bundles `css/index.css` into `dist/styles.css` for production.
6. New D1 migration: `npm run db:migrate:remote` then deploy.
7. Production smoke test + Ctrl+F5 on browsers.

## Live sync — no edit lock (since Nov 2026)

The calendar edit lock is retired. Everyone with edit access edits at the same time, on any number of tabs and devices.

- **Saves send only what changed.** `js/sync-diff.js` compares the page's data (`appData`) with the last server copy (`CalendarSync.state.base`) and sends per-item / per-field mutations (`set`, `patch`, `remove`, `order`, `mapSet`, `mapUnset`, `replace`) with `PATCH /api/calendars/:id`. Attendance-style records go per student.
- **Server applies on top of the latest copy.** No 409 for PATCH: two people changing different fields both keep their change; the same field changed in two places is **latest save wins**, and the response lists what it replaced in `overwritten` (the page shows a notice).
- **Other devices' changes merge in.** The poll (8–15 s) sees a newer revision, fetches it, and replays this page's unsaved changes on top (`rebaseOnto`), so nothing unsaved is lost. A pull waits while the person is typing in a field.
- **Offline / closed tab:** unsaved changes are kept in `localStorage` (`classCalendarLivePending:<calId>`) and replayed on the next load.
- **Permissions still apply on the server** (calendar access + classroom access); suggesters only send classroom/day-note changes.
- **Edit areas (Admin → Accounts):** `edit_curriculum` (Curriculum tab, default syllabi, syllabus templates, class types), `edit_classes` (classes & class syllabi), `edit_events` (events, holidays, timetable, calendar name/term), `edit_planner`. Teachers get all but curriculum by default; head teachers and super admins get all. Field → area map: `EDIT_AREA_BY_FIELD` in `js/sync-diff.js`. The server drops blocked changes and lists them in `denied`; the page puts them back with a message and greys out those editors (`applyEditAreaRestrictions` in app.js). Custom permission lists saved before edit areas existed keep the role's areas (`edit_areas_set` marker in `shared/auth-permissions.cjs`).
- **"Also editing" toast:** each page sends what it is editing (`getCurrentEditFocus` in app.js → `?focus=classes:<id>&focusLabel=…` on the meta poll; stored in `user_presence.focus`, migration 0021). When another account's focus matches, a toast stays until dismissed (`refreshEditOverlapToasts`). Editors no longer see the lock control; view-only accounts keep the chip.
- Lock endpoints and `worker/src/lock.js` / `server/users.js` lock functions remain as no-ops that always answer "free, you may edit", so tabs cached from before the change keep working.
- Full `PUT` (whole calendar) is only for import/restore and still needs the matching revision unless forced.
- Next step planned: one Durable Object per calendar applying these same mutations in order and pushing them over WebSockets instead of polling.
- Debug: `?lockDebug=1` still logs sync events (`Merged server copy`, `live pull`).
- Tests: `tests/sync-diff.test.mjs` (diff/apply), `tests/live-sync-tabs.test.mjs` (two tabs, real calendar-sync.js), `tests/worker-concurrency.test.mjs` and `tests/worker-hardening.test.mjs` (real Worker; need better-sqlite3).
- **One full read per save.** `saveWithRetry` (`worker/src/calendar-write.js`) reads the document once and returns what it wrote in `saved`; build the response with `calendarDocFromSaved` instead of reading the row back.
- **Size limit.** A calendar is one D1 value and D1 refuses values over 2,000,000 bytes. `writeCalendar` logs a warning from 1,500,000 bytes and answers 507 `CALENDAR_TOO_LARGE` past the limit.
- **Nightly snapshots.** The 04:17 KST cron copies each changed calendar into `calendar_history` and keeps 14 days (`snapshotChangedCalendars` in `worker/src/calendar-storage.js`). Restore is manual: put `data` back on the `calendars` row and bump `revision`.

## Key files

| Area | Paths |
|------|--------|
| Worker API | `worker/src/index.js`, `worker/src/app-settings.js`, `worker/src/calendar-access.js` |
| Local server | `server/index.js`, `server/users.js`, `server/calendars.js`, `server/app-settings.js` |
| Client sync | `js/calendar-sync.js`, `js/team-auth.js`, `js/day-notes-save.js` (`CCPDayNotesSave` → `saveDayNotesOnly`) |
| Client UI | `app.js`, `index.html`, `styles.css` — follow [UI_STYLE_GUIDE.md](UI_STYLE_GUIDE.md) (scroll/sticky: same guide § *Scroll, sticky, and layout stability*); AI mockups: [CLAUDE_DESIGN_BRIEF.md](CLAUDE_DESIGN_BRIEF.md); syllabus print also needs [Syllabus Style Guide.md](Syllabus%20Style%20Guide.md) |
| Debate book periods | `js/debate-periods.js` — start-date book periods (not calendar month only) |
| Kakao / waiting | `login.html`, `pending-access.html`, `server/kakao.js`, `server/users.js` (`resolveKakaoLoginUser`) |
| Admin | `admin.html`, `js/admin.js` |
| Migrations | `worker/migrations/` (`0001` … `0023`; two files share `0008` and two share `0009`, none is `0002`) — number new ones strictly after the highest |

## Pitfalls

1. Always change **worker AND server** for API behavior. A new route that should not be open to a just-registered account must check `userHasCalendarAccess` (Worker) / `requireCalendarAccess` (server), not only the session.
2. There is no edit lock: `holdsLock` now just means "may edit" (from permissions). Never add a save path that sends the whole calendar for normal edits — use the live-sync diff.
3. `409`: revision conflict has `body.document`; duplicate name has `code: DUPLICATE_NAME`.
4. Sync bugs: same `calendarId` on both browsers; `?lockDebug=1`; hard refresh after deploy.
5. Do not edit Cursor plan files unless the user asks.
6. **Fixtures must never contain real student/teacher names.** Use `*-real.html` (gitignored) locally and commit redacted `*-snippet.html` only. Fake names in committed fixtures follow the `김테가` / `(Stuaa)` pattern.
7. **Encoding:** save every file as UTF-8 without BOM (`.editorconfig`). `npm test` (`tests/encoding.test.mjs`) and `npm run build` fail on invalid UTF-8, BOM, U+FFFD, or `??` glued to Hangul (Korean re-saved through the wrong codepage).
6. Debate scheduling uses **`debateBookPeriods`** (start date per book), not `booksByMonth` alone. (Deploy cache strings are content hashes — see Deploy step 3.)

## Local dev processes (optional)

Default local server: port **8080** (`npm start`). You may also have had:

- Node on **8081** (`node server/index.js` with custom `PORT`)
- Wrangler dev **8787** / **8788**

Stop (PowerShell):

```powershell
netstat -ano | findstr "8080 8081 8787 8788"
Stop-Process -Id <PID> -Force
```

Or: `Get-Process -Name node, wrangler -ErrorAction SilentlyContinue | Stop-Process -Force`

Stopping local dev does **not** affect the production Cloudflare worker.

## Suggested first steps

1. Plug in USB; `git pull origin main`
2. Compare behavior with **production** if the user reports “deployed features changed” — folder may lag until pull/deploy
3. Read lock routes in `worker/src/index.js` and polling in `js/calendar-sync.js`
4. For lock bugs: reproduce with `?lockDebug=1`, compare `calendarId` on both browsers
5. Match worker + server; `npm run deploy` from one PC (cache strings are stamped automatically), then `git push`
6. **UI updates:** follow [UI_STYLE_GUIDE.md](UI_STYLE_GUIDE.md); update [CLAUDE_DESIGN_BRIEF.md](CLAUDE_DESIGN_BRIEF.md) when tokens or shell layout change; syllabus print layout also needs [Syllabus Style Guide.md](Syllabus%20Style%20Guide.md)

## UI work (scroll, sticky, layout)

Before changing setup tabs, editors, or satellite pages, read **Scroll, sticky, and layout stability** in [UI_STYLE_GUIDE.md](UI_STYLE_GUIDE.md). Short defaults:

- **One primary scroller** per screen — usually the page; inner `overflow: auto` only for grids/lists/modals (planner `.sp-board-scroll`, picker lists). Do not fix wheel traps with tab-wide `wheel` JS.
- **Sticky** headers use `--app-chrome-sticky-top` plus local toolbar height; class form uses **`overflow: clip`**, not `hidden`, so Save stays pinned.
- **No layout jump** — reserve lock/sync bar space; keep disabled toolbars in the DOM (Cohorts).
- **Ship UI** with en+ko i18n, token-only dark theme, `?v=` on touched assets, and CSS comments when scroll choice is easy to regress.
- **References:** Cohorts + Homework (`styles.css`), `css/design-fidelity-append.css`, `planner.html` / `.sp-*`, `.team-lock-sync-bar--inline`.
