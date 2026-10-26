/**
 * TMS sync health check — runs each sync kind once and reports pass/fail.
 *
 * READ-ONLY toward TMS: uses the same sign-in + GET scrapes as the app's sync.
 * Prints counts and errors only — never student names.
 *
 * Run on a school-network PC (TMS only accepts school IPs), from the repo root:
 *   node scripts/tms-diagnose.mjs                 (uses TMS_USERNAME / TMS_PASSWORD from .env)
 *   node scripts/tms-diagnose.mjs essays counsel  (only some kinds)
 *
 * Also checks the Sync Helper on http://127.0.0.1:8765 if it is running.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('../server/load-env');
require('../server/tms-roster'); // installs the TMS TLS trust fix on the shared core
const { runTmsJob, JOB_KINDS } = require('../shared/tms-jobs.cjs');

const ORDER = ['roster', 'essays', 'counsel', 'homework'];
const wanted = process.argv.slice(2).filter(Boolean);
const kinds = (wanted.length ? wanted : ORDER).filter((k) => JOB_KINDS.includes(k));

const username = String(process.env.TMS_USERNAME || '').trim();
const password = String(process.env.TMS_PASSWORD || '');
if (!username || !password) {
    console.error('Add TMS_USERNAME and TMS_PASSWORD to .env, then run again.');
    process.exit(1);
}

function summarize(kind, body) {
    if (kind === 'roster') {
        return `${(body.cohorts || []).length} classes, ${body.meta && body.meta.studentCount} students`;
    }
    if (kind === 'essays') {
        return `${(body.assignments || []).length} assignments, ${(body.rows || []).length} rows`;
    }
    if (kind === 'homework') {
        return `${(body.classes || []).length} classes`;
    }
    if (kind === 'counsel') {
        const s = body.stats || {};
        const profiles = Object.keys(body.profiles || body.byStudent || {}).length;
        return `stats ${JSON.stringify(s)}${profiles ? `, ${profiles} profiles` : ''}`;
    }
    return 'ok';
}

async function checkHelper() {
    try {
        const res = await fetch('http://127.0.0.1:8765/api/tms/bridge/ping', {
            headers: { Origin: 'https://classmanager.live' }
        });
        const body = await res.json().catch(() => null);
        console.log(`Sync Helper: HTTP ${res.status}`, body ? `version ${body.version}, kinds ${(body.kinds || []).join(',')}` : '');
    } catch (_) {
        console.log('Sync Helper: not running on 127.0.0.1:8765');
    }
}

async function counselPayload(rosterBody) {
    // Attendance needs students with TMS ids; take one class from the roster scrape.
    const cohort = (rosterBody && rosterBody.cohorts || []).find((c) => c.tmsClassId && (c.students || []).length);
    if (!cohort) {
        return null;
    }
    return {
        classes: [{
            classId: 'diagnose',
            tmsClassId: cohort.tmsClassId,
            students: cohort.students.slice(0, 5).map((s, i) => ({ id: String(i), name: s.name, tmsMpidx: s.tmsMpidx || s.mpidx || '' }))
        }]
    };
}

await checkHelper();
let rosterBody = null;
let failed = 0;
for (const kind of kinds) {
    const started = Date.now();
    let payload = { username, password };
    if (kind === 'counsel') {
        const extra = await counselPayload(rosterBody);
        if (!extra) {
            console.log('counsel: SKIPPED — run with roster first (needs one class with TMS student ids)');
            continue;
        }
        payload = Object.assign(payload, extra);
    }
    try {
        const body = await runTmsJob(kind, payload);
        if (kind === 'roster') {
            rosterBody = body;
        }
        console.log(`${kind}: OK in ${((Date.now() - started) / 1000).toFixed(1)}s — ${summarize(kind, body)}`);
    } catch (err) {
        failed += 1;
        const cause = err && err.cause ? ` (cause: ${err.cause.code || err.cause.message || err.cause})` : '';
        console.log(`${kind}: FAILED in ${((Date.now() - started) / 1000).toFixed(1)}s — ${err && err.code ? `[${err.code}] ` : ''}${err && err.message}${cause}`);
    }
}
process.exit(failed ? 1 : 0);
