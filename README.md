# Class Calendar — Multi User (Team + Cloud)

GitHub: [nathanksimpson/classcalendarmultiuser](https://github.com/nathanksimpson/classcalendarmultiuser)

Teachers open **one bookmark**, sign in with **Kakao**, and edit shared calendars. No school PC running 24/7.

## Quick start (local test)

1. Copy `.env.example` to `.env` and set `ALLOW_OPEN_ACCESS=1` (dev only — skips login).
2. Run `npm install` then `npm start` (or double-click **START TEAM CALENDAR.bat**).
3. Open http://localhost:8080

**Editing or deploying code?** See **[DEVELOPER.md](DEVELOPER.md)** (dual-backend checklist, deploy steps, file map). AI agents: also read **[AGENTS.md](AGENTS.md)**.

## Production (Cloudflare + Kakao)

### 1. Kakao Developers

1. Create an app at [developers.kakao.com](https://developers.kakao.com).
2. Enable **Kakao Login** → set redirect URI:  
   `https://YOUR-DOMAIN/api/auth/kakao/callback`
3. Enable **email** consent if you want email-based allowlist.
4. Copy **REST API key** → `KAKAO_CLIENT_ID`.

### 2. Cloudflare (Workers + D1)

This repo deploys with **`npx wrangler deploy`** (static files + API in one Worker).

**If the build failed with error `10021`**, follow **[CLOUDFLARE-DEPLOY.md](CLOUDFLARE-DEPLOY.md)** (create D1, paste `database_id` into `wrangler.toml`, migrate, secrets, push).

Summary:

1. Create D1 database **`calendar-team`** → copy **Database ID** into `wrangler.toml`.
2. `npm run db:migrate:remote`
3. `wrangler secret put` for Kakao + `BOOTSTRAP_ADMIN_SECRET`
4. Set `PUBLIC_URL` in `wrangler.toml` to your live `*.workers.dev` URL.
5. Push to GitHub (Cloudflare rebuilds).

### 3. First admin

1. Open `https://YOUR-DOMAIN/admin.html`.
2. Use **First-time setup** with `BOOTSTRAP_ADMIN_SECRET`.
3. Add teachers by **email** on the admin page.
4. Teachers use **Login with Kakao** on the bookmark.

## Teacher instructions

- English: **[FOR TEACHERS.md](FOR%20TEACHERS.md)** — bookmark, Kakao or password login, team calendars, edit locks.
- Korean: **[FOR TEACHERS-ko.md](FOR%20TEACHERS-ko.md)** — same content in Korean.

## Synology NAS

Use NAS for **backup exports** only (Print & data tab). Live editing uses Cloudflare, not the NAS drive.

## Local server env

| Variable | Purpose |
|----------|---------|
| `KAKAO_CLIENT_ID` | Kakao REST API key |
| `KAKAO_CLIENT_SECRET` | Optional |
| `BOOTSTRAP_ADMIN_SECRET` | Create first admin |
| `ALLOW_OPEN_ACCESS=1` | Dev only — no login |
| `PUBLIC_URL` | Full URL (for OAuth redirect) |

Data is stored in `data/calendars.db` (SQLite) when using `npm start`.
