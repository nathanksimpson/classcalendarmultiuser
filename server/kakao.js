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
    const id = me && me.id != null ? String(me.id) : '';
    const account = (me && me.kakao_account) || {};
    const email = account.email || null;
    const nickname =
        (account.profile && account.profile.nickname) ||
        (me && me.properties && me.properties.nickname) ||
        '';
    return { kakaoUserId: id, email, nickname };
}

function buildAuthorizeUrl(clientId, redirectUri, state) {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code'
    });
    if (state) {
        params.set('state', state);
    }
    return 'https://kauth.kakao.com/oauth/authorize?' + params.toString();
}

module.exports = {
    exchangeAuthorizationCode,
    fetchUserProfile,
    profileFromKakaoMe,
    buildAuthorizeUrl
};
