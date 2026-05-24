# Calendar Multi User — Agent Handoff

Use this with [DEVELOPER.md](DEVELOPER.md) for day-to-day edits and deploy steps.

## Project

| | |
|--|--|
| **Folder** | `f:\Calendar App Multi User` |
| **NOT** | `f:\Calendar App` (single-user, no team sync) |
| **GitHub** | https://github.com/nathanksimpson/classcalendarmultiuser |
| **Live** | https://classcalendarmultiuser.nathanksimpson.workers.dev |
| **Branch** | `main` |

After starting a session: `git pull origin main` in the project folder.

## Deploy (required for production)

1. Test locally: `npm start` (`.env` with `ALLOW_OPEN_ACCESS=1`).
2. API changes: update **both** `server/` and `worker/src/`.
3. Bump `?v=` on changed scripts in `index.html` (`app.js`, `js/calendar-sync.js`, `js/team-auth.js`).
4. `npm run deploy` — **git push alone does not update the live site.**
5. New D1 migration: `npm run db:migrate:remote` then deploy.
6. Production smoke test + Ctrl+F5 on browsers.

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
| Client sync | `js/calendar-sync.js`, `js/team-auth.js` |
| Client UI | `app.js`, `index.html`, `styles.css` |
| Admin | `admin.html`, `js/admin.js` |
| Migrations | `worker/migrations/0001` … `0005` |

## Pitfalls

1. Always change **worker AND server** for API behavior.
2. Use server **`holdsLock`** — do not rely only on client inferring from `lock.holderUserId`.
3. `409`: revision conflict has `body.document`; duplicate name has `code: DUPLICATE_NAME`.
4. Lock bugs: same `calendarId` on both browsers; `?lockDebug=1`; hard refresh after deploy.
5. Do not edit Cursor plan files unless the user asks.

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

1. `git pull origin main`
2. Read lock routes in `worker/src/index.js` and polling in `js/calendar-sync.js`
3. For lock bugs: reproduce with `?lockDebug=1`, compare `calendarId` on both browsers
4. Match worker + server; bump `index.html` cache strings; `npm run deploy`
