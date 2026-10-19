/**
 * Single TMS job runner for the local server, Cloudflare Worker, and (later) Sync Helper.
 * Keep response shapes and HTTP codes identical to the previous per-kind preview functions.
 */
'use strict';

let tmsRoster = require('./tms-roster-core.cjs');
let tmsCounsel = require('./tms-counsel-core.cjs');

const BRIDGE_PROTOCOL = 2;

function tmsError(message, code, status) {
    const err = new Error(message);
    err.code = code;
    err.status = status;
    return err;
}

function credsFrom(payload) {
    const username = String((payload && payload.username) || '').trim();
    const password = String((payload && payload.password) || '');
    let scrapeOpts = {};
    if (username || password) {
        if (!username || !password) {
            throw tmsError('TMS username and password are required', 'TMS_CREDS_MISSING', 503);
        }
        scrapeOpts = { username, password };
    }
    const cfg = Object.assign({}, tmsRoster.getConfig(), scrapeOpts);
    if (!tmsRoster.credentialsConfigured(cfg)) {
        throw tmsError('TMS credentials not configured', 'TMS_CREDS_MISSING', 503);
    }
    return { scrapeOpts, cfg };
}

const JOBS = {
    roster: async (_payload, { scrapeOpts }) => {
        const result = await tmsRoster.scrapeRosters(scrapeOpts);
        const cohorts = result.cohorts || [];
        return {
            cohorts,
            meta: {
                homeUrl: result.meta && result.meta.homeUrl,
                pagesFetched: result.meta && result.meta.pagesFetched,
                cohortCount: cohorts.length,
                studentCount: cohorts.reduce((n, c) => n + ((c.students && c.students.length) || 0), 0)
            }
        };
    },

    essays: async (_payload, { scrapeOpts }) => {
        const result = await tmsRoster.scrapeEssaySubmissions(scrapeOpts);
        return {
            assignments: result.assignments || [],
            rows: result.rows || [],
            meta: result.meta || {}
        };
    },

    essayContent: async (payload, { scrapeOpts }) => {
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        if (!rows.length) {
            throw tmsError('At least one essay row is required', 'TMS_ESSAY_ROWS_MISSING', 400);
        }
        const result = await tmsRoster.scrapeEssayContents(Object.assign({}, scrapeOpts, { rows }));
        return {
            essays: result.essays || [],
            meta: result.meta || {}
        };
    },

    homework: async (payload, { scrapeOpts }) => {
        const onlyTmsClassIds = [];
        const onlyTmsClassId = String(payload.tmsClassId || payload.onlyTmsClassId || '').trim();
        if (onlyTmsClassId) {
            onlyTmsClassIds.push(onlyTmsClassId);
            scrapeOpts.onlyTmsClassId = onlyTmsClassId;
        }
        (Array.isArray(payload.tmsClassIds) ? payload.tmsClassIds : []).forEach((id) => {
            const s = String(id || '').trim();
            if (s && onlyTmsClassIds.indexOf(s) === -1) {
                onlyTmsClassIds.push(s);
            }
        });
        if (onlyTmsClassIds.length) {
            scrapeOpts.onlyTmsClassIds = onlyTmsClassIds;
        }
        const onlyTmsClassName = String(payload.className || payload.onlyTmsClassName || '').trim();
        if (onlyTmsClassName) {
            scrapeOpts.onlyTmsClassName = onlyTmsClassName;
        }
        const result = await tmsRoster.scrapeHomeworkChecks(scrapeOpts);
        return {
            classes: result.classes || [],
            meta: result.meta || {}
        };
    },

    counsel: async (payload, { cfg }) => {
        if (Array.isArray(payload.classes) && payload.classes.length) {
            const batches = payload.classes
                .map((entry) => {
                    const classId = String(entry && entry.classId ? entry.classId : '').trim();
                    const tmsClassId = String(entry && entry.tmsClassId ? entry.tmsClassId : '').trim();
                    const students = Array.isArray(entry && entry.students) ? entry.students : [];
                    return {
                        classId,
                        tmsClassId,
                        students: students.map((s) => ({
                            id: s && s.id != null ? String(s.id) : '',
                            name: s && s.name ? String(s.name) : '',
                            tmsMpidx: String((s && (s.tmsMpidx || s.mpidx)) || '').trim()
                        }))
                    };
                })
                .filter((batch) => batch.students.length > 0);
            if (!batches.length) {
                return { classes: {}, stats: { classes: 0, students: 0, scraped: 0, noMpidx: 0, errors: 0 } };
            }
            return tmsCounsel.scrapeCounselProfilesBatch(cfg, batches);
        }
        const students = Array.isArray(payload.students) ? payload.students : [];
        const tmsClassId = String(payload.tmsClassId || '').trim();
        return tmsCounsel.scrapeCounselProfiles(cfg, students, { tmsClassId });
    }
};

const JOB_KINDS = Object.keys(JOBS);

async function runTmsJob(kind, body) {
    const job = JOBS[kind];
    if (!job) {
        throw tmsError('Unknown sync kind: ' + String(kind || ''), 'TMS_UNKNOWN_KIND', 400);
    }
    const payload = body && typeof body === 'object' ? body : {};
    return job(payload, credsFrom(payload));
}

/** Test-only seam so unit tests never hit TMS. */
function setTmsCoresForTests(cores) {
    if (cores && cores.tmsRoster) {
        tmsRoster = cores.tmsRoster;
    }
    if (cores && cores.tmsCounsel) {
        tmsCounsel = cores.tmsCounsel;
    }
}

module.exports = {
    BRIDGE_PROTOCOL,
    JOB_KINDS,
    runTmsJob,
    credsFrom,
    setTmsCoresForTests
};
