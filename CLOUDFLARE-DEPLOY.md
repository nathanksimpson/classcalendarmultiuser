# Cloudflare deploy (Workers Builds + local)

## GitHub red X — `dist` does not exist

If **Workers Builds** or GitHub shows:

```text
The directory specified by the "assets.directory" field ... does not exist: .../dist
```

**Cause:** Production static files live in `dist/`, created by `npm run build`. That folder is in `.gitignore`, so a push alone does not include it. Cloudflare was running only `npx wrangler deploy` without building first.

**Fix:** `wrangler.toml` includes:

```toml
[build]
command = "npm run build"
```

Wrangler runs that before deploy (local and CI). Commit and push `wrangler.toml`, then retry the build in the Cloudflare dashboard or push again.

Local deploy still uses `npm run deploy` (`npm run build && wrangler deploy`) — same result.

---

## D1 error 10021 (placeholder database id)

Your build runs `npx wrangler deploy`. It failed because `wrangler.toml` still had a placeholder D1 id:

```text
binding DB of type d1 must have a valid `database_id` specified [code: 10021]
```

Follow these steps once, then push to GitHub to redeploy.

---

## Step 1 — Create the D1 database

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com).
2. Go to **Storage & databases** → **D1 SQL Database** (or search “D1”).
3. Click **Create database**.
4. Name it exactly: **`calendar-team`**
5. Click **Create**.
6. Open the new database → copy **Database ID** (a UUID like `a1b2c3d4-...`).

---

## Step 2 — Put the ID in `wrangler.toml`

1. On your PC, open `G:\Other computers\내 컴퓨터\Class Calendar Multi-User\wrangler.toml`.
2. Find this line:

   ```toml
   database_id = "REPLACE_WITH_YOUR_D1_ID"
   ```

3. Replace `REPLACE_WITH_YOUR_D1_ID` with your real Database ID (keep the quotes).

4. After your first successful deploy, set `PUBLIC_URL` in the same file to your real URL, for example:

   ```toml
   PUBLIC_URL = "https://classcalendarmultiuser.<your-subdomain>.workers.dev"
   ```

   (Cloudflare shows the exact URL on the Worker overview page.)

---

## Step 3 — Run the database migration (one time)

On your PC, in PowerShell:

```powershell
cd "G:\Other computers\내 컴퓨터\Class Calendar Multi-User"
npx wrangler login
npx wrangler d1 migrations apply calendar-team --remote
```

This creates the tables (`calendars`, `users`, `sessions`, etc.).

---

## Step 4 — Set secrets (Kakao + admin)

Still in the project folder:

```powershell
npx wrangler secret put KAKAO_CLIENT_ID
npx wrangler secret put KAKAO_CLIENT_SECRET
npx wrangler secret put BOOTSTRAP_ADMIN_SECRET
```

Type each value when prompted (nothing appears on screen — that is normal).

---

## Step 5 — Commit and push

```powershell
cd "G:\Other computers\내 컴퓨터\Class Calendar Multi-User"
git add wrangler.toml CLOUDFLARE-DEPLOY.md worker/src/index.js .assetsignore
git commit -m "Fix Cloudflare deploy: D1 id, static assets, setup doc"
git push
```

Cloudflare will rebuild automatically. The deploy should succeed once `database_id` is a real UUID.

---

## Step 6 — First admin

1. Open `https://YOUR-WORKER-URL/admin.html`
2. Use **First-time setup** with your `BOOTSTRAP_ADMIN_SECRET`.
3. Add teacher emails, then teachers use **Login with Kakao**.

Kakao redirect URI must be:

```text
https://YOUR-WORKER-URL/api/auth/kakao/callback
```

---

## Optional: get Database ID from the command line

After `npx wrangler login`:

```powershell
npx wrangler d1 list
```

Copy the **uuid** in the row for `calendar-team`.
