/**
 * Debate Rec must stay READ-ONLY toward TMS.
 *  1. The Debate Rec module never talks to TMS itself; its only TMS entry point is
 *     the shared TMS Sync window with the attendance (counsel) scrape selected.
 *  2. That scrape only issues GET requests after the standard sign-in.
 *  3. Scraped attendance flows into the Debate Rec check end to end.
 * Run: node tests/debate-rec-tms-readonly.test.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

// ── 1. Static: Debate Rec module has no direct TMS / network writes ──────
{
    const src = readFileSync(path.join(root, 'js', 'classroom-debate-rec.js'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert(!/\bfetch\s*\(/.test(code), 'Debate Rec must not call fetch()');
    assert(!/XMLHttpRequest/.test(code), 'Debate Rec must not use XMLHttpRequest');
    assert(!/apiFetch/.test(code), 'Debate Rec must not call the API directly');
    assert(!/CCPTmsSync\b(?!Center)/.test(code), 'Debate Rec must not call CCPTmsSync directly');
    assert(!/\/api\/tms/.test(code), 'Debate Rec must not reference TMS API routes');
    const opens = code.match(/\.open\(\s*\{[\s\S]*?kinds:\s*\[([^\]]*)\]/g) || [];
    assert(opens.length === 1, `exactly one TMS Sync open call (got ${opens.length})`);
    assert(/kinds:\s*\[\s*'counsel'\s*\]/.test(opens[0]), 'TMS Sync opened with attendance scrape only');
    assert(/hooks\.saveClassroom\(\{\s*essaySubmissions/.test(code), 'writes go to ClassManager essaySubmissions');
}

// ── 2. Runtime: the attendance scrape only GETs after sign-in ────────────
const tmsRoster = require(path.join(root, 'shared', 'tms-roster-core.cjs'));
const counsel = require(path.join(root, 'shared', 'tms-counsel-core.cjs'));

const absenceHtml = `<!DOCTYPE html><html><body><table>
<tr><th>날짜</th><th>반</th><th>상태</th><th>메모</th></tr>
<tr><td>2026-10-21</td><td>Purple M</td><td>결석</td><td>병결</td></tr>
<tr><td>2026-10-09</td><td>Purple M</td><td>지각</td><td></td></tr>
</table></body></html>`;
const shellHtml = `<html><body>
<iframe src="/iframe/student_consulting_list_new.aspx?mpidx=100"></iframe>
<iframe src="/iFrame/student_absense_list.aspx?mpidx=100"></iframe>
</body></html>`;

const calls = [];
const original = {
    credentialsConfigured: tmsRoster.credentialsConfigured,
    login: tmsRoster.login,
    fetchPage: tmsRoster.fetchPage
};
tmsRoster.credentialsConfigured = () => true;
tmsRoster.login = async () => {
    calls.push({ kind: 'login', method: 'POST', url: 'login' });
    return { homeHtml: '<html>staffidx=7</html>', homeUrl: 'https://tms.example/home' };
};
tmsRoster.fetchPage = async (jar, url, options) => {
    const method = String((options && options.method) || 'GET').toUpperCase();
    calls.push({ kind: 'page', method, url, hasBody: Boolean(options && options.body) });
    let text = '<html></html>';
    if (/absense_list/i.test(url)) {
        text = absenceHtml;
    } else if (/profiles_new/i.test(url)) {
        text = shellHtml;
    }
    return { text, finalUrl: url, status: 200 };
};

let result;
try {
    result = await counsel.scrapeCounselProfilesBatch(
        { baseUrl: 'https://tms.example', username: 'u', password: 'p' },
        [{ classId: 'c1', tmsClassId: '123', students: [{ id: 's1', name: '김민준', tmsMpidx: '100' }] }]
    );
} finally {
    Object.assign(tmsRoster, original);
}

assert(calls.filter((c) => c.kind === 'login').length === 1, 'signs in once');
const pages = calls.filter((c) => c.kind === 'page');
assert(pages.length > 0, 'scrape loads pages');
pages.forEach((c) => {
    assert(c.method === 'GET', `non-GET request to TMS: ${c.method} ${c.url}`);
    assert(!c.hasBody, `request body sent to TMS: ${c.url}`);
});

// ── 3. End to end: scraped attendance → Debate Rec flags ─────────────────
await import(pathToFileURL(path.join(root, 'js', 'debate-periods.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'classroom-domain.js')).href);
const d = globalThis.CCPClassroomDomain;

const bucket = result && result.classes && (result.classes.c1 || Object.values(result.classes)[0]);
const profile = bucket && bucket.students && bucket.students.find((p) => p.studentId === 's1');
assert(profile && Array.isArray(profile.attendanceRecords), 'profile has attendance records');
assert(profile.attendanceRecords.some((r) => r.date === '2026-10-21' && r.status === '결석'), 'absence parsed');

const appData = {
    classes: [{
        id: 'c1',
        name: 'Purple M',
        scheduleModel: 'debateMonthly',
        cohortIds: ['co1'],
        syllabusRows: [
            { id: 'r4', kind: 'lesson', date: '2026-10-21', sessionNumber: 4, planTitle: 'Day 4 / Preview', trackEssay: true }
        ]
    }],
    cohorts: [{ id: 'co1', name: 'Purple M', students: [{ id: 's1', name: '김민준', active: true }] }],
    essaySubmissions: []
};
const byStudent = new Map([[profile.studentId, profile.attendanceRecords]]);
const check = d.applyDebateRecTmsCheck(appData, 'c1', byStudent, { todayIso: '2026-10-24' });
const rec = d.getEssayRecordForStudent(d.findEssaySubmission(check.submissions, 'c1', 'r4'), 's1');
assert(rec && rec.debateRecStatus === 'not_recorded', 'scraped 결석 → Not recorded');
assert(rec.debateRecTmsMemo === '병결', 'memo carried through');

console.log('debate-rec-tms-readonly.test.mjs: ok');
