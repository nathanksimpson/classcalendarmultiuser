/**
 * Signed OAuth state cookie for Kakao login CSRF protection.
 */
const crypto = require('crypto');
const { sanitizeLoginContext } = require('./login-context');

const KAKAO_OAUTH_COOKIE = 'kakao_oauth_state';
const OAUTH_STATE_MAX_AGE_SEC = 600;

function oauthStateSecret(envOrProcessEnv) {
    const e = envOrProcessEnv || process.env;
    return (
        (e.OAUTH_STATE_SECRET || e.BOOTSTRAP_ADMIN_SECRET || '').trim() ||
        'dev-oauth-state-insecure-change-me'
    );
}

function sanitizeReturnTo(returnTo) {
    const raw = typeof returnTo === 'string' ? returnTo : '/';
    if (raw.startsWith('/') && !raw.startsWith('//')) {
        return raw;
    }
    return '/';
}

function signPayload(payload, secret) {
    return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function timingSafeEqualStr(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) {
        return false;
    }
    return crypto.timingSafeEqual(ba, bb);
}

/**
 * @returns {{ state: string, setCookie: string, returnTo: string, loginContext: string }}
 */
function createKakaoOAuthState(returnTo, secret, secure, loginContext) {
    const safeReturn = sanitizeReturnTo(returnTo);
    const ctx = sanitizeLoginContext(loginContext);
    const nonce = crypto.randomBytes(16).toString('hex');
    const returnB64 = Buffer.from(safeReturn, 'utf8').toString('base64url');
    const payload = `${nonce}.${returnB64}.${ctx}`;
    const sig = signPayload(payload, secret);
    const cookieValue = `${payload}.${sig}`;
    const parts = [
        `${KAKAO_OAUTH_COOKIE}=${encodeURIComponent(cookieValue)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${OAUTH_STATE_MAX_AGE_SEC}`
    ];
    if (secure) {
        parts.push('Secure');
    }
    return {
        state: payload,
        setCookie: parts.join('; '),
        returnTo: safeReturn,
        loginContext: ctx
    };
}

function clearKakaoOAuthStateCookie(secure) {
    const parts = [
        `${KAKAO_OAUTH_COOKIE}=`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=0'
    ];
    if (secure) {
        parts.push('Secure');
    }
    return parts.join('; ');
}

/**
 * @returns {{ ok: boolean, returnTo: string, loginContext: string }}
 */
function verifyKakaoOAuthState(stateParam, cookieValue, secret) {
    if (!stateParam || !cookieValue) {
        return { ok: false, returnTo: '/', loginContext: 'personal' };
    }
    const cookieParts = String(cookieValue).split('.');
    if (cookieParts.length < 3) {
        return { ok: false, returnTo: '/', loginContext: 'personal' };
    }
    const sig = cookieParts.pop();
    const cookiePayload = cookieParts.join('.');
    if (!timingSafeEqualStr(cookiePayload, stateParam)) {
        return { ok: false, returnTo: '/', loginContext: 'personal' };
    }
    const expectedSig = signPayload(cookiePayload, secret);
    if (!timingSafeEqualStr(sig, expectedSig)) {
        return { ok: false, returnTo: '/', loginContext: 'personal' };
    }
    const stateParts = stateParam.split('.');
    if (stateParts.length < 2) {
        return { ok: false, returnTo: '/', loginContext: 'personal' };
    }
    const returnB64 = stateParts[1];
    const loginContext =
        stateParts.length >= 3 ? sanitizeLoginContext(stateParts[2]) : 'personal';
    try {
        const returnTo = sanitizeReturnTo(Buffer.from(returnB64, 'base64url').toString('utf8'));
        return { ok: true, returnTo, loginContext };
    } catch (_) {
        return { ok: false, returnTo: '/', loginContext: 'personal' };
    }
}

module.exports = {
    KAKAO_OAUTH_COOKIE,
    oauthStateSecret,
    createKakaoOAuthState,
    verifyKakaoOAuthState,
    clearKakaoOAuthStateCookie,
    sanitizeReturnTo
};
