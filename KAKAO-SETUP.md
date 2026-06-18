# Kakao sign-in setup

Use this checklist so **Login with Kakao** works on production (`https://classmanager.live`).

## 1. Check current status

Open in a browser (or run in PowerShell):

```text
https://classmanager.live/api/health
```

You want:

```json
"kakaoConfigured": true
```

If it is `false`, the Worker does not have `KAKAO_CLIENT_ID` yet (see step 3).

## 2. Kakao Developers console

1. Go to [developers.kakao.com](https://developers.kakao.com) → your app.
2. **Kakao Login** → turn on **Kakao Login**.
3. **Redirect URI** — add **exactly** (no trailing slash):

   ```text
   https://classmanager.live/api/auth/kakao/callback
   ```

   Keep the legacy workers.dev URI until you confirm login on the custom domain:

   ```text
   https://classcalendarmultiuser.nathanksimpson.workers.dev/api/auth/kakao/callback
   ```

4. **Consent items** — **nickname** is enough for display names. **account_email** is optional (teachers do not need to share email with admins). Leave `KAKAO_OAUTH_SCOPES` unset unless you enable matching items under 동의항목.
5. Copy the **REST API key** (this is `KAKAO_CLIENT_ID`).
6. If your app uses a **Client secret**, copy that too (`KAKAO_CLIENT_SECRET`).

After deploy, register the redirect URI in Kakao Developers (see `/api/health` → `kakaoRedirectUri` or server startup log).

## 3. Cloudflare Worker secrets

In the project folder (`D:\Simson USB\Class Calendar Multi User` — adjust drive letter if needed), in PowerShell:

```powershell
cd "D:\Simson USB\Class Calendar Multi User"
npx wrangler secret put KAKAO_CLIENT_ID
```

Paste the REST API key when prompted.

**Client secret is required by default** on new REST API keys. Without it, login fails after Kakao (no user is created in Admin).

```powershell
npx wrangler secret put KAKAO_CLIENT_SECRET
```

Paste the code from Kakao **앱 → 플랫폼 키 → REST API 키 → 수정 → 클라이언트 시크릿** (or disable client secret on that key if you prefer not to use it).

Then deploy:

```powershell
npm run deploy
```

Hard refresh the login page (Ctrl+F5). `/api/health` should show `"kakaoConfigured": true`.

## 4. Teachers and calendar access

**First Kakao login** auto-creates a teacher account (Kakao user ID is stored; email is only saved if Kakao shares it — admins do not need teachers’ emails). Teachers see a **waiting** page until they have at least one accessible team calendar.

**Admin workflow:**

1. Open `https://classmanager.live/admin.html`
2. After a teacher signs in once, they appear under **Users** (use **Kakao ID** and display name to recognize them — no email required).
3. Add them to a **group** and/or assign **calendar access** on each calendar.
4. Teacher clicks **Check again** on the waiting page (or refreshes) → full planner opens.

Optional: pre-add by **Kakao user ID** only if you want the row ready before first login (email pre-add is optional and needs the Kakao ID set in Admin before that teacher signs in).

## 5. Local testing

In `.env` (copy from `.env.example`):

```env
KAKAO_CLIENT_ID=your_rest_api_key
KAKAO_CLIENT_SECRET=optional
PUBLIC_URL=http://localhost:8080
```

Do **not** use `ALLOW_OPEN_ACCESS=1` if you want to test real Kakao login.

Register in Kakao Developers:

```text
http://localhost:8080/api/auth/kakao/callback
```

Run `npm start`, open http://localhost:8080/login.html.

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Kakao button greyed out | Set `KAKAO_CLIENT_ID` secret and `npm run deploy` |
| `redirect_uri_mismatch` | Redirect URI in Kakao must match `/api/health` → `kakaoRedirectUri` exactly |
| Waiting for calendar access | Admin assigns group or calendar access; teacher clicks Check again |
| Account deactivated | Admin re-enabled user in Users table |
| Email shows “(not shared by Kakao)” | Enable email consent in Kakao app, or add user by Kakao ID in admin |
| `oauth_code_expired` | Click Login with Kakao again (code is one-time) |
| After sign out, same Kakao user logs in again | Calendar sign-out only ends *this app*. On the login page use **Use a different Kakao account** (asks Kakao for credentials again), or use a private/incognito window |
| Shared school PC | On login, choose **Shared or public computer** — shorter session (1 day) and 15 min idle sign-out; Kakao re-login is required |
| Kakao page **KOE205** / invalid_scope | Enable **동의항목** for each scope you request, or leave scopes off (default). To request email: enable **카카오계정(이메일)** in 동의항목, then `wrangler secret put KAKAO_OAUTH_SCOPES` with value `account_email profile_nickname` |
