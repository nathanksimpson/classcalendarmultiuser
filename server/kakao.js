/**
 * Optional OAuth scopes (space-separated). Only request scopes enabled under
 * Kakao Login > 동의항목 — otherwise Kakao returns KOE205 invalid_scope.
 * Set KAKAO_OAUTH_SCOPES=account_email profile_nickname in .env after enabling consent.
 */
function oauthScopesFromEnv() {
    const raw = process.env.KAKAO_OAUTH_SCOPES;
    return raw && String(raw).trim() ? String(raw).trim() : '';
}

async function exchangeAuthorizationCode(code, redirectUri, clientId, clientSecret) {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code
    });
    if (clientSecret) {
        body.set('client_secret', clientSecret);
    }
    const res = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body: body.toString()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(json.error_description || json.error || 'Kakao token exchange failed');
        err.status = res.status;
        err.body = json;
        throw err;
    }
    return json;
}

async function fetchUserProfile(accessToken) {
    const res = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
        }
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error('Kakao user profile failed');
        err.status = res.status;
        err.body = json;
        throw err;
    }
    return json;
}

function profileFromKakaoMe(me) {
    if (!me || me.id == null || me.id === undefined) {
        return { kakaoUserId: '', email: null, nickname: '' };
    }
    const id = String(me.id);
    const account = (me && me.kakao_account) || {};
    let email = account.email || null;
    if (account.email_needs_agreement === true) {
        email = null;
    }
    const nickname =
        (account.profile && account.profile.nickname) ||
        (me && me.properties && me.properties.nickname) ||
        '';
    return { kakaoUserId: id, email, nickname };
}

/** Kakao authorize `prompt`: login = re-enter credentials; select_account = pick among saved sessions. */
function sanitizeKakaoOAuthPrompt(value) {
    const p = value && String(value).trim();
    if (p === 'login' || p === 'select_account') {
        return p;
    }
    return null;
}

function buildAuthorizeUrl(clientId, redirectUri, state, options) {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code'
    });
    if (state) {
        params.set('state', state);
    }
    const prompt =
        options && options.prompt ? sanitizeKakaoOAuthPrompt(options.prompt) : null;
    if (prompt) {
        params.set('prompt', prompt);
    }
    const scope = oauthScopesFromEnv();
    if (scope) {
        params.set('scope', scope);
    }
    return 'https://kauth.kakao.com/oauth/authorize?' + params.toString();
}

function kakaoErrorDetail(err) {
    const body = (err && err.body) || {};
    const parts = [
        err && err.message,
        body.error_description,
        body.error,
        body.error_code
    ].filter(Boolean);
    return String(parts[0] || 'unknown').slice(0, 200);
}

function classifyOAuthError(err) {
    const msg = String((err && err.message) || '').toLowerCase();
    const body = (err && err.body) || {};
    const code = String(body.error || '').toLowerCase();
    const errCode = String(body.error_code || '').toUpperCase();
    if (msg.includes('redirect_uri') || code === 'invalid_redirect_uri' || errCode === 'KOE006') {
        return 'redirect_uri_mismatch';
    }
    if (code === 'access_denied') {
        return 'oauth_denied';
    }
    if (code === 'invalid_grant' || msg.includes('authorization code') || errCode === 'KOE322') {
        return 'oauth_code_expired';
    }
    if (
        msg.includes('client_secret') ||
        msg.includes('bad client credentials') ||
        code === 'invalid_client' ||
        errCode === 'KOE029'
    ) {
        return 'kakao_client_secret';
    }
    if (errCode === 'KOE205') {
        return 'invalid_scope';
    }
    return 'oauth_failed';
}

function loginRedirectForKakaoError(err) {
    const code = classifyOAuthError(err);
    return '/kakao-login.html?error=' + encodeURIComponent(code);
}

module.exports = {
    oauthScopesFromEnv,
    exchangeAuthorizationCode,
    fetchUserProfile,
    profileFromKakaoMe,
    sanitizeKakaoOAuthPrompt,
    buildAuthorizeUrl,
    classifyOAuthError,
    kakaoErrorDetail,
    loginRedirectForKakaoError
};
