/**
 * Signed OAuth state cookie for Kakao login CSRF protection (Worker).
 */
import { sanitizeLoginContext } from './login-context.js';

const KAKAO_OAUTH_COOKIE = 'kakao_oauth_state';
const OAUTH_STATE_MAX_AGE_SEC = 600;

export function oauthStateSecret(env) {
    return (
        (env.OAUTH_STATE_SECRET || env.BOOTSTRAP_ADMIN_SECRET || '').trim() ||
        'dev-oauth-state-insecure-change-me'
    );
}

export function sanitizeReturnTo(returnTo) {
    const raw = typeof returnTo === 'string' ? returnTo : '/';
    if (raw.startsWith('/') && !raw.startsWith('//')) {
        return raw;
    }
    return '/';
}

async function signPayload(payload, secret) {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return btoa(String.fromCharCode(...new Uint8Array(sig)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function timingSafeEqualStr(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
        return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

function encodeReturnB64(returnTo) {
    return btoa(returnTo).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeReturnB64(returnB64) {
    const padded = returnB64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    return atob(padded + pad);
}

/**
 * @returns {Promise<{ state: string, setCookie: string, returnTo: string, loginContext: string }>}
 */
export async function createKakaoOAuthState(returnTo, secret, secure, loginContext) {
    const safeReturn = sanitizeReturnTo(returnTo);
    const ctx = sanitizeLoginContext(loginContext);
    const nonce = crypto.randomUUID().replace(/-/g, '');
    const returnB64 = encodeReturnB64(safeReturn);
    const payload = `${nonce}.${returnB64}.${ctx}`;
    const sig = await signPayload(payload, secret);
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

export function clearKakaoOAuthStateCookie(secure) {
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
 * @returns {Promise<{ ok: boolean, returnTo: string, loginContext: string }>}
 */
export async function verifyKakaoOAuthState(stateParam, cookieValue, secret) {
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
    const expectedSig = await signPayload(cookiePayload, secret);
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
        const returnTo = sanitizeReturnTo(decodeReturnB64(returnB64));
        return { ok: true, returnTo, loginContext };
    } catch (_) {
        return { ok: false, returnTo: '/', loginContext: 'personal' };
    }
}

export { KAKAO_OAUTH_COOKIE };
