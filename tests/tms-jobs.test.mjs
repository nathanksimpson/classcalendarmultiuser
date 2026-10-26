import { createRequire } from 'module';
import assert from 'assert';

const require = createRequire(import.meta.url);
const {
    BRIDGE_PROTOCOL,
    JOB_KINDS,
    runTmsJob,
    setTmsCoresForTests
} = require('../shared/tms-jobs.cjs');

assert.strictEqual(BRIDGE_PROTOCOL, 2);
assert.deepStrictEqual(JOB_KINDS.slice().sort(), [
    'attendance',
    'counsel',
    'essayContent',
    'essays',
    'homework',
    'roster'
]);

let lastHomeworkOpts = null;
let lastEssayContentOpts = null;
let lastAttendanceBatches = null;

setTmsCoresForTests({
    tmsRoster: {
        getConfig() {
            return {};
        },
        credentialsConfigured(cfg) {
            return Boolean(cfg && cfg.username && cfg.password);
        },
        async scrapeRosters() {
            return {
                cohorts: [{ name: 'A', students: [{}, {}] }],
                meta: { homeUrl: 'https://tms.example/home', pagesFetched: 1 }
            };
        },
        async scrapeEssaySubmissions() {
            return { assignments: [{}], rows: [{}, {}], meta: { pagesFetched: 2 } };
        },
        async scrapeHomeworkChecks(opts) {
            lastHomeworkOpts = opts;
            return { classes: [{ tmsClassId: '9' }], meta: { fetched: 1 } };
        },
        async scrapeEssayContents(opts) {
            lastEssayContentOpts = opts;
            return { essays: [{ id: 'e1' }], meta: { fetched: 1 } };
        }
    },
    tmsCounsel: {
        async scrapeCounselProfilesBatch(_cfg, batches) {
            return { classes: { batch: batches.length }, stats: { classes: batches.length } };
        },
        async scrapeAttendanceBatch(_cfg, batches) {
            lastAttendanceBatches = batches;
            return { classes: {}, stats: { classes: batches.length, attendanceOnly: true } };
        },
        async scrapeCounselProfiles(_cfg, students, extra) {
            return { students: students.length, tmsClassId: extra && extra.tmsClassId };
        }
    }
});

async function expectReject(promise, code, status) {
    let caught = null;
    try {
        await promise;
    } catch (err) {
        caught = err;
    }
    assert.ok(caught, 'expected rejection');
    assert.strictEqual(caught.code, code);
    assert.strictEqual(caught.status, status);
}

await expectReject(runTmsJob('nope', { username: 'a', password: 'b' }), 'TMS_UNKNOWN_KIND', 400);
await expectReject(runTmsJob('roster', { username: 'only' }), 'TMS_CREDS_MISSING', 503);
await expectReject(runTmsJob('roster', {}), 'TMS_CREDS_MISSING', 503);
await expectReject(runTmsJob('essayContent', { username: 'a', password: 'b' }), 'TMS_ESSAY_ROWS_MISSING', 400);
await expectReject(
    runTmsJob('essayContent', { username: 'a', password: 'b', rows: [] }),
    'TMS_ESSAY_ROWS_MISSING',
    400
);

const roster = await runTmsJob('roster', { username: 'a', password: 'b' });
assert.strictEqual(roster.meta.cohortCount, 1);
assert.strictEqual(roster.meta.studentCount, 2);

const essays = await runTmsJob('essays', { username: 'a', password: 'b' });
assert.strictEqual(essays.rows.length, 2);

await runTmsJob('homework', {
    username: 'a',
    password: 'b',
    tmsClassId: '111',
    tmsClassIds: ['222', '111'],
    className: 'Green M'
});
assert.strictEqual(lastHomeworkOpts.onlyTmsClassId, '111');
assert.deepStrictEqual(lastHomeworkOpts.onlyTmsClassIds, ['111', '222']);
assert.strictEqual(lastHomeworkOpts.onlyTmsClassName, 'Green M');

const content = await runTmsJob('essayContent', {
    username: 'a',
    password: 'b',
    rows: [{ mpidx: '1' }]
});
assert.strictEqual(content.essays.length, 1);
assert.strictEqual(lastEssayContentOpts.rows.length, 1);

const counsel = await runTmsJob('counsel', {
    username: 'a',
    password: 'b',
    students: [{ id: 's1' }],
    tmsClassId: 'c9'
});
assert.strictEqual(counsel.students, 1);
assert.strictEqual(counsel.tmsClassId, 'c9');

const attendance = await runTmsJob('attendance', {
    username: 'a',
    password: 'b',
    classes: [
        { classId: 'c1', tmsClassId: '9', students: [{ id: 's1', name: 'A', mpidx: '100' }] },
        { classId: 'c2', tmsClassId: '8', students: [] }
    ]
});
assert.strictEqual(attendance.stats.attendanceOnly, true);
assert.strictEqual(lastAttendanceBatches.length, 1, 'empty classes are dropped');
assert.strictEqual(lastAttendanceBatches[0].students[0].tmsMpidx, '100', 'mpidx alias normalized');
const emptyAttendance = await runTmsJob('attendance', { username: 'a', password: 'b', classes: [] });
assert.deepStrictEqual(emptyAttendance.classes, {});

console.log('tms-jobs.test.mjs: ok');
