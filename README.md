# Class Calendar — Multi User (Team + Cloud)

GitHub: [nathanksimpson/classcalendarmultiuser](https://github.com/nathanksimpson/classcalendarmultiuser)

Teachers open **one bookmark**, sign in with **Kakao**, and edit shared calendars. No school PC running 24/7.

## Quick start (local test)

1. Copy `.env.example` to `.env` and set `ALLOW_OPEN_ACCESS=1` (dev only — skips login).
2. Run `npm install` then `npm start` (or double-click **START TEAM CALENDAR.bat**).
3. Open http://localhost:8080

## Production (Cloudflare + Kakao)

### 1. Kakao Developers

1. Create an app at [developers.kakao.com](https://developers.kakao.com).
2. Enable **Kakao Login** → set redirect URI:  
   `https://YOUR-DOMAIN/api/auth/kakao/callback`
3. Enable **email** consent if you want email-based allowlist.
4. Copy **REST API key** → `KAKAO_CLIENT_ID`.

### 2. Cloudflare

1. **Pages**: connect this folder; build command empty; output = project root.
2. **D1**: create database, run migration:  
   `npx wrangler d1 migrations apply calendar-team --remote`
3. **Worker**: deploy `worker/src/index.js` (see `wrangler.toml`); route `/api/*` to the Worker.
4. Set secrets:  
   `wrangler secret put KAKAO_CLIENT_ID`  
   `wrangler secret put KAKAO_CLIENT_SECRET`  
   `wrangler secret put BOOTSTRAP_ADMIN_SECRET`
5. Set `PUBLIC_URL` in `wrangler.toml` to your Pages URL.

### 3. First admin

1. Open `https://YOUR-DOMAIN/admin.html`.
2. Use **First-time setup** with `BOOTSTRAP_ADMIN_SECRET`.
3. Add teachers by **email** on the admin page.
4. Teachers use **Login with Kakao** on the bookmark.

## Teacher instructions

See **FOR TEACHERS.md** — bookmark + Kakao login only.

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
