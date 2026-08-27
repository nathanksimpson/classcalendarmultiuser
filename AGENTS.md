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
| **Live features** | Production URL after `npm run deploy` — may differ from an unsynced local copy |

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

**TMS Sync on classmanager.live (work IP allowlist):** keep `npm start` / START TEAM CALENDAR.bat running on the work PC (port 8080). The live Sync modal probes `http://127.0.0.1:8080/api/tms/bridge/ping` and scrapes via the local bridge so TMS sees the work IP; Apply still saves to the cloud calendar.

**Essay Sync (Classroom → Essays → Sync from TMS):** uses `POST /api/tms/bridge/essays/preview` (not the roster bridge path). After pulling/deploying essay Sync code, **restart** the local bridge process — an old `npm start` still answers ping (`bridge: true`) but essay load fails with “Failed to fetch” until restarted from this project folder.

## Deploy (required for production)

1. Test locally via `npm start` when possible (see above).
2. API changes: update **both** `server/` and `worker/src/`.
3. Bump `?v=` on changed scripts in `index.html` (`app.js`, `js/calendar-sync.js`, `js/team-auth.js`).
4. `npm run deploy` (runs `npm run build` → minified `dist/`, then wrangler) — **git push alone does not update the live site.** Local `npm start` still serves unfrozen sources from the repo root. **CSS:** edit root `styles.css` only; `npm run build` runs `css:split` then bundles `css/index.css` into `dist/styles.css` for production.
5. New D1 migration: `npm run db:migrate:remote` then deploy.
6. Production smoke test + Ctrl+F5 on browsers.

### Cloudflare auth (local PC vs Cloud Agent)

| Where | How Wrangler authenticates |
|-------|----------------------------|
| **USB / home / work PC** | `npx wrangler login` once (interactive browser login) |
| **Cursor Cloud Agent** | Environment secrets — **not** interactive login |

Cloud Agents need these Cursor environment secrets (never commit them; never paste into chat or `.env` in git):

| Secret | Required | Purpose |
|--------|----------|---------|
| `CLOUDFLARE_API_TOKEN` | Yes | Wrangler API auth for `whoami` / `npm run deploy` / remote D1 |
| `CLOUDFLARE_ACCOUNT_ID` | Recommended | Pins the account that owns `classmanager.live` and D1 `calendar-team` |

Create the token at [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) (template **Edit Cloudflare Workers**, plus D1 edit and Workers Routes on `classmanager.live` if using a custom token). Verify in the agent with `npx wrangler whoami` before deploying.

## Collaborative lock (current behavior)

- No force takeover: blocked user sends **edit request** only.
- Holder: **Allow** | **Dismiss** (`POST .../lock/grant`, `.../lock/dismiss`).
- Allow → `flushPendingSave()` then grant.
- Policy: Allow, release, or admin **stale timeout** only (`app_settings.lock_stale_minutes`, 5–120 min).
- Poll ~3s in `calendar-sync.js`; holder **heartbeat** `POST .../lock/touch` when `holdsLock`.
- Worker blocks PUT save if another user holds lock; refreshes lock on holder save.
- Logout releases all locks (`team-auth.js` + server + worker).
- Debug: `?lockDebug=1` or `CalendarSync.setLockDebugEnabled(true)` — panel in `index.html`, log in `calendar-sync.js` / `app.js`.

## Key files

| Area | Paths |
|------|--------|
| Worker API | `worker/src/index.js`, `worker/src/app-settings.js`, `worker/src/calendar-access.js` |
| Local server | `server/index.js`, `server/users.js`, `server/calendars.js`, `server/app-settings.js` |
| Client sync | `js/calendar-sync.js`, `js/team-auth.js`, `js/day-notes-save.js` (`CCPDayNotesSave` → `saveDayNotesOnly`) |
| Client UI | `app.js`, `index.html`, `styles.css` — follow [UI_STYLE_GUIDE.md](UI_STYLE_GUIDE.md); AI mockups: [CLAUDE_DESIGN_BRIEF.md](CLAUDE_DESIGN_BRIEF.md); syllabus print also needs [Syllabus Style Guide.md](Syllabus%20Style%20Guide.md) |
| Debate book periods | `js/debate-periods.js` — start-date book periods (not calendar month only) |
| Kakao / waiting | `login.html`, `pending-access.html`, `server/kakao.js`, `server/users.js` (`resolveKakaoLoginUser`) |
| Admin | `admin.html`, `js/admin.js` |
| Migrations | `worker/migrations/0001` … `0005` |

## Pitfalls

1. Always change **worker AND server** for API behavior.
2. Use server **`holdsLock`** — do not rely only on client inferring from `lock.holderUserId`.
3. `409`: revision conflict has `body.document`; duplicate name has `code: DUPLICATE_NAME`.
4. Lock bugs: same `calendarId` on both browsers; `?lockDebug=1`; hard refresh after deploy.
5. Do not edit Cursor plan files unless the user asks.
6. Debate scheduling uses **`debateBookPeriods`** (start date per book), not `booksByMonth` alone. Bump `debate-periods.js` and `app.js` cache strings in `index.html` when changing period logic.

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
5. Match worker + server; bump `index.html` cache strings; `npm run deploy` from one PC, then `git push`
6. **UI updates:** follow [UI_STYLE_GUIDE.md](UI_STYLE_GUIDE.md); update [CLAUDE_DESIGN_BRIEF.md](CLAUDE_DESIGN_BRIEF.md) when tokens or shell layout change; syllabus print layout also needs [Syllabus Style Guide.md](Syllabus%20Style%20Guide.md)
