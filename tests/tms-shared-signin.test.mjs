/**
 * Run: node tests/tms-shared-signin.test.mjs
 * One TMS sign-in, one error wording and one timetable pull for every screen (js/tms-sync-client.js),
 * and one TMS class-name reader for new cohorts (js/tms-class-name.js).
 * Synthetic data only.
 */
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
};

/* Fake TMS: same-origin bridge; "teacher"/"right" signs in, anything else is refused. */
const calls = [];
globalThis.fetch = async (url, init) => {
    if (String(url).includes('/ping') || (init && init.method === 'GET')) {
        return { ok: false, status: 404, headers: { get: () => '' }, json: async () => ({}) };
    }
    const body = JSON.parse((init && init.body) || '{}');
    calls.push({ url: String(url), body });
    const json = (status, obj) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => obj });
    if (body.username !== 'teacher' || body.password !== 'right') {
        return json(401, { error: 'login failed', code: 'TMS_LOGIN_FAILED' });
    }
    return json(200, { placements: [{ cohortName: 'PinkT^2609', day: 'tue' }] });
};

await import(pathToFileURL(path.join(root, 'js', 'tms-sync-client.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'tms-class-name.js')).href);
const S = globalThis.CCPTmsSync;
const N = globalThis.CCPTmsClassName;

/* ---------- error wording ---------- */
{
    assert.match(S.errorText({ code: 'TMS_LOGIN_FAILED' }), /sign in to TMS/);
    assert.match(S.errorText({ code: 'TMS_CREDS_MISSING' }), /username and password/);
    assert.match(S.errorText({ code: 'TMS_HELPER_MISSING' }), /Sync Helper/);
    assert.match(S.errorText(new Error('Failed to fetch')), /Sync Helper/);
    assert.equal(S.errorText({ message: 'odd' }), 'odd');
    assert.equal(S.isSignInError({ status: 401 }), true);
    assert.equal(S.isSignInError({ code: 'TMS_SCRAPE_FAILED' }), false);
}

/* ---------- a sign-in TMS accepted is kept for the tab only; a refused one is dropped ---------- */
{
    assert.equal(S.getSessionCredentials(), null);
    await assert.rejects(S.run('schedule', { username: 'teacher', password: 'wrong' }));
    assert.equal(S.getSessionCredentials(), null, 'refused sign-in is not kept');
    await S.run('schedule', { username: 'teacher', password: 'right' });
    assert.deepEqual(S.getSessionCredentials(), { username: 'teacher', password: 'right' });
    assert.equal([...store.values()].includes('right'), false, 'password never stored');
    // A tab's Sync button reads it when the Sync Center has nothing typed (no Sync Center loaded here).
    assert.equal(S.currentCredentials().password, 'right');
}

/* ---------- runWithSignIn: reuses the tab sign-in, no popup ---------- */
{
    const before = calls.length;
    const body = await S.runWithSignIn('schedule', {});
    assert.ok(body && body.placements.length === 1);
    assert.equal(calls.length, before + 1);
    assert.equal(calls[calls.length - 1].body.password, 'right');
}

/* ---------- pullSchedule: one pull, reused for an hour, fresh on request ---------- */
{
    S.forgetSessionCredentials();
    const first = await S.pullSchedule({ credentials: { username: 'teacher', password: 'right' } });
    assert.ok(first.body && !first.reused);
    const n = calls.length;
    const again = await S.pullSchedule();
    assert.equal(again.reused, true, 'second pull within the hour is reused');
    assert.equal(calls.length, n, 'no second TMS request');
    const fresh = await S.pullSchedule({ fresh: true });
    assert.ok(fresh.body && !fresh.reused, 'fresh pull uses the tab sign-in');
    assert.equal(calls.length, n + 1);
    await assert.rejects(S.pullSchedule({ fresh: true, credentials: { username: 'teacher', password: 'nope' } }), (e) => S.isSignInError(e));
}

/* ---------- TMS class names for new cohorts ---------- */
{
    assert.equal(N.stripTmsClassName('[HR] Basic 2M^2603'), 'Basic 2M', 'roster keeps the day letter');
    assert.equal(N.cohortNameFromTms('[HR] Basic 2M^2603'), 'Basic 2', 'wizard drops it');
    assert.deepEqual(N.scheduleForNewCohort('Basic 2M^2603'), { schedulePattern: 'mwf', meetingDays: [1, 3, 5] });
    assert.deepEqual(N.scheduleForNewCohort('PinkT^2609'), { schedulePattern: 'tth', meetingDays: [2, 4] });
    assert.deepEqual(N.scheduleForNewCohort('Gold T'), { schedulePattern: 'tth', meetingDays: [2, 4] }, 'trailing T');
    assert.deepEqual(N.scheduleForNewCohort('Debate Club'), { schedulePattern: 'mwf', meetingDays: [1, 3, 5] }, 'no letter: Mon/Wed/Fri');
}

console.log('tms-shared-signin tests passed');
