/**
 * Debate Rec must stay READ-ONLY toward TMS.
 *  1. The Debate Rec module never talks to TMS itself; its only TMS entry point is
 *     the shared TMS Sync window with the attendance-only scrape selected.
 *  2. After sign-in, the fast path only GETs. A through-date (older Day 4s)
 *     may also read absence-list pages. It never writes attendance back to TMS.
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
    assert(/kinds:\s*\[\s*'attendance'\s*\]/.test(opens[0]), 'TMS Sync opened with attendance scrape only');
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
let fastResult;
let fastPages = [];
let attendanceOnlyResult;
const attendanceCalls = [];
try {
    result = await counsel.scrapeCounselProfilesBatch(
        { baseUrl: 'https://tms.example', username: 'u', password: 'p' },
        [{ classId: 'c1', tmsClassId: '123', students: [{ id: 's1', name: '김민준', tmsMpidx: '100' }] }]
    );
    const fullCalls = calls.length;
    // Attendance-only scrape: same sign-in, then only the absence list (plus one class warm-up).
    fastResult = await counsel.scrapeAttendanceBatch(
        { baseUrl: 'https://tms.example', username: 'u', password: 'p' },
        [
            { classId: 'c1', tmsClassId: '123', students: [{ id: 's1', name: '김민준', tmsMpidx: '100' }] },
            { classId: 'c2', tmsClassId: '123', students: [{ id: 's9', name: '김민준', tmsMpidx: '100' }] }
        ]
    );
    fastPages = calls.slice(fullCalls).filter((c) => c.kind === 'page');
    const beforeAttendanceOnly = calls.length;
    attendanceOnlyResult = await counsel.scrapeCounselProfilesBatch(
        { baseUrl: 'https://tms.example', username: 'u', password: 'p' },
        [{ classId: 'c1', tmsClassId: '123', students: [{ id: 's1', name: '김민준', tmsMpidx: '100' }] }],
        { attendanceOnly: true }
    );
    calls.slice(beforeAttendanceOnly).forEach((c) => attendanceCalls.push(c));
} finally {
    Object.assign(tmsRoster, original);
}

{
    assert(fastResult && fastResult.stats && fastResult.stats.attendanceOnly, 'attendance-only stats flag');
    assert(fastResult.stats.students === 1 && fastResult.stats.reused === 1, 'same student in two classes is fetched once');
    const absenceGets = fastPages.filter((c) => /absense_list/i.test(c.url));
    assert(absenceGets.length === 1, `one absence-list GET per unique student (got ${absenceGets.length})`);
    assert(!fastPages.some((c) => /consulting|student_profile|profiles_new/i.test(c.url)),
        'attendance-only scrape skips counsel notes, profile and shell pages');
    fastPages.forEach((c) => assert(c.method === 'GET' && !c.hasBody, `non-GET request to TMS: ${c.method} ${c.url}`));
    const p9 = fastResult.classes.c2.students[0];
    assert(p9.studentId === 's9' && p9.attendanceRecords.some((r) => r.status === '결석'), 'reused profile keeps per-class student id');
}

assert(calls.filter((c) => c.kind === 'login').length === 3, 'each scrape signs in once');
const pages = calls.filter((c) => c.kind === 'page');
assert(pages.length > 0, 'scrape loads pages');
pages.forEach((c) => {
    assert(c.method === 'GET', `non-GET request to TMS: ${c.method} ${c.url}`);
    assert(!c.hasBody, `request body sent to TMS: ${c.url}`);
});

const attendancePages = attendanceCalls.filter((c) => c.kind === 'page');
assert(attendancePages.some((c) => /absense_list/i.test(c.url)), 'attendance-only still loads the absence list');
assert(!attendancePages.some((c) => /student_consulting_list/i.test(c.url)), 'attendance-only never requests counseling');
assert(!attendancePages.some((c) => /student_profile|profiles_popup|profile_popup/i.test(c.url)), 'attendance-only skips the profile page');
const attendanceBucket = attendanceOnlyResult && attendanceOnlyResult.classes && (attendanceOnlyResult.classes.c1 || Object.values(attendanceOnlyResult.classes)[0]);
const attendanceProfile = attendanceBucket && attendanceBucket.students && attendanceBucket.students.find((p) => p.studentId === 's1');
const dayMemo = attendanceProfile && (attendanceProfile.attendanceRecords || []).find((r) => r.date === '2026-10-21');
assert(dayMemo && dayMemo.status === '결석' && dayMemo.memo === '병결', 'attendance-only still returns the day’s memo');

// Older pager pages are read so a previous month's attendance is included.
{
    const page1 = `<html><input type="hidden" name="__VIEWSTATE" value="abc" />
<a href="javascript:__doPostBack('pagingHelper$ctl00','')">2</a>
<table><tr><th>날짜</th><th>상태</th><th>메모</th></tr>
<tr><td>2026-10-21</td><td>결석</td><td>병결</td></tr></table></html>`;
    const page2 = `<table><tr><th>날짜</th><th>상태</th><th>메모</th></tr>
<tr><td>2026-09-16</td><td>결석</td><td>감기</td></tr></table>`;
    const pagingCalls = [];
    tmsRoster.credentialsConfigured = () => true;
    tmsRoster.login = async () => ({ homeHtml: '<html>staffidx=7</html>', homeUrl: 'https://tms.example/home' });
    tmsRoster.fetchPage = async (jar, url, options) => {
        const method = String((options && options.method) || 'GET').toUpperCase();
        pagingCalls.push({ method, url, body: options && options.body ? String(options.body) : '' });
        let text = shellHtml;
        if (method === 'POST') {
            text = page2;
        } else if (/absense_list/i.test(url)) {
            text = page1;
        }
        return { text, finalUrl: url, status: 200 };
    };
    let paged;
    try {
        paged = await counsel.scrapeCounselProfilesBatch(
            { baseUrl: 'https://tms.example', username: 'u', password: 'p' },
            [{ classId: 'c1', tmsClassId: '123', students: [{ id: 's1', name: '김민준', tmsMpidx: '100' }] }],
            { attendanceOnly: true }
        );
    } finally {
        Object.assign(tmsRoster, original);
    }
    const posts = pagingCalls.filter((c) => c.method === 'POST');
    assert(posts.length === 1, 'one read of the next absence page');
    assert(/__EVENTTARGET=pagingHelper/i.test(posts[0].body), 'pager postback only');
    const pagedBucket = paged && paged.classes && (paged.classes.c1 || Object.values(paged.classes)[0]);
    const pagedProfile = pagedBucket && pagedBucket.students && pagedBucket.students.find((p) => p.studentId === 's1');
    const dates = (pagedProfile && pagedProfile.attendanceRecords || []).map((r) => r.date).sort();
    assert(dates.indexOf('2026-10-21') !== -1 && dates.indexOf('2026-09-16') !== -1, `both months loaded: ${dates.join(',')}`);
    const older = pagedProfile.attendanceRecords.find((r) => r.date === '2026-09-16');
    assert(older && older.memo === '감기', 'older month note kept');
}

// A month control is posted for each month back through the Day 4 date.
{
    const page1 = `<html><input type="hidden" name="__VIEWSTATE" value="abc" />
<select name="selYear" id="selYear"><option value="2026">2026</option></select>
<select name="selMonth" id="selMonth"><option value="10">10</option><option value="9">9</option></select>
<table><tr><th>날짜</th><th>상태</th><th>메모</th></tr>
<tr><td>2026-10-21</td><td>출석</td><td></td></tr></table></html>`;
    const pageSept = `<table><tr><th>날짜</th><th>상태</th><th>메모</th></tr>
<tr><td>2026-09-16</td><td>결석</td><td>감기</td></tr></table>`;
    const monthCalls = [];
    tmsRoster.credentialsConfigured = () => true;
    tmsRoster.login = async () => ({ homeHtml: '<html>staffidx=7</html>', homeUrl: 'https://tms.example/home' });
    tmsRoster.fetchPage = async (jar, url, options) => {
        const method = String((options && options.method) || 'GET').toUpperCase();
        monthCalls.push({ method, url, body: options && options.body ? String(options.body) : '' });
        let text = shellHtml;
        if (method === 'POST') {
            text = pageSept;
        } else if (/absense_list/i.test(url)) {
            text = page1;
        }
        return { text, finalUrl: url, status: 200 };
    };
    let monthResult;
    try {
        monthResult = await counsel.scrapeCounselProfilesBatch(
            { baseUrl: 'https://tms.example', username: 'u', password: 'p' },
            [{ classId: 'c1', tmsClassId: '123', students: [{ id: 's1', name: '김민준', tmsMpidx: '100' }] }],
            { attendanceOnly: true, attendanceThroughDate: '2026-09-16', attendanceToday: '2026-10-26' }
        );
    } finally {
        Object.assign(tmsRoster, original);
    }
    const posts = monthCalls.filter((c) => c.method === 'POST');
    assert(posts.length === 2, `September and October month posts (got ${posts.length})`);
    assert(posts.some((c) => /(?:^|&)selMonth=9(?:&|$)/.test(c.body) && /selYear=2026/.test(c.body)), 'September is requested on the form');
    const bucket = monthResult && monthResult.classes && (monthResult.classes.c1 || Object.values(monthResult.classes)[0]);
    const profile = bucket && bucket.students && bucket.students.find((p) => p.studentId === 's1');
    const sept = profile && (profile.attendanceRecords || []).find((r) => r.date === '2026-09-16');
    assert(sept && sept.status === '결석' && sept.memo === '감기', 'September absence and note merged');
    assert((profile.attendanceRecords || []).some((r) => r.date === '2026-10-21'), 'October row kept');
}

// Every month from the first recording day of the term is requested, not one sample month.
{
    const options = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        .map((n) => `<option value="${n}">${n}</option>`)
        .join('');
    const page1 = `<html><input type="hidden" name="__VIEWSTATE" value="abc" />
<select name="selYear" id="selYear"><option value="2026">2026</option></select>
<select name="selMonth" id="selMonth">${options}</select>
<table><tr><th>날짜</th><th>상태</th><th>메모</th></tr>
<tr><td>2026-10-21</td><td>출석</td><td></td></tr></table></html>`;
    const march = `<table><tr><th>날짜</th><th>상태</th><th>메모</th></tr>
<tr><td>2026-03-18</td><td>결석</td><td>여행</td></tr></table>`;
    const termCalls = [];
    tmsRoster.credentialsConfigured = () => true;
    tmsRoster.login = async () => ({ homeHtml: '<html>staffidx=7</html>', homeUrl: 'https://tms.example/home' });
    tmsRoster.fetchPage = async (jar, url, options) => {
        const method = String((options && options.method) || 'GET').toUpperCase();
        const body = options && options.body ? String(options.body) : '';
        termCalls.push({ method, body });
        let text = shellHtml;
        if (method === 'POST' && /(?:^|&)selMonth=3(?:&|$)/.test(body)) {
            text = march;
        } else if (method === 'POST') {
            text = '<table><tr><th>날짜</th><th>상태</th></tr><tr><td>2026-06-01</td><td>출석</td></tr></table>';
        } else if (/absense_list/i.test(url)) {
            text = page1;
        }
        return { text, finalUrl: url, status: 200 };
    };
    let termResult;
    try {
        termResult = await counsel.scrapeCounselProfilesBatch(
            { baseUrl: 'https://tms.example', username: 'u', password: 'p' },
            [{ classId: 'c1', tmsClassId: '123', students: [{ id: 's1', name: '김민준', tmsMpidx: '100' }] }],
            { attendanceOnly: true, attendanceThroughDate: '2026-03-18', attendanceToday: '2026-10-26' }
        );
    } finally {
        Object.assign(tmsRoster, original);
    }
    const posts = termCalls.filter((c) => c.method === 'POST');
    assert(posts.length === 8, `March through October requested (got ${posts.length})`);
    assert(posts.some((c) => /(?:^|&)selMonth=3(?:&|$)/.test(c.body)), 'March is requested');
    assert(posts.some((c) => /(?:^|&)selMonth=9(?:&|$)/.test(c.body)), 'September is requested with the other months');
    const bucket = termResult && termResult.classes && (termResult.classes.c1 || Object.values(termResult.classes)[0]);
    const profile = bucket && bucket.students && bucket.students[0];
    const mar = profile && (profile.attendanceRecords || []).find((r) => r.date === '2026-03-18');
    assert(mar && mar.status === '결석' && mar.memo === '여행', 'the first month of the term is merged');
}

// No month control and no pager: do not invent a query, and do not invent September.
{
    const bareCalls = [];
    tmsRoster.credentialsConfigured = () => true;
    tmsRoster.login = async () => ({ homeHtml: '<html>staffidx=7</html>', homeUrl: 'https://tms.example/home' });
    tmsRoster.fetchPage = async (jar, url, options) => {
        const method = String((options && options.method) || 'GET').toUpperCase();
        bareCalls.push({ method, url });
        const text = /absense_list/i.test(url) ? absenceHtml : shellHtml;
        return { text, finalUrl: url, status: 200 };
    };
    let bare;
    try {
        bare = await counsel.scrapeCounselProfilesBatch(
            { baseUrl: 'https://tms.example', username: 'u', password: 'p' },
            [{ classId: 'c1', tmsClassId: '123', students: [{ id: 's1', name: '김민준', tmsMpidx: '100' }] }],
            { attendanceOnly: true, attendanceThroughDate: '2026-09-16', attendanceToday: '2026-10-26' }
        );
    } finally {
        Object.assign(tmsRoster, original);
    }
    assert(!bareCalls.some((c) => c.method === 'POST'), 'no form post when the page has no month control');
    const bucket = bare && bare.classes && (bare.classes.c1 || Object.values(bare.classes)[0]);
    const profile = bucket && bucket.students && bucket.students[0];
    assert(!(profile.attendanceRecords || []).some((r) => r.date === '2026-09-16'), 'September is not guessed present');
}

// Same student in two TMS classes: scrape each class and merge the lists.
{
    const classCalls = [];
    let lastClass = '';
    tmsRoster.credentialsConfigured = () => true;
    tmsRoster.login = async () => ({ homeHtml: '<html>staffidx=7</html>', homeUrl: 'https://tms.example/home' });
    tmsRoster.fetchPage = async (jar, url, options) => {
        const method = String((options && options.method) || 'GET').toUpperCase();
        const classMatch = String(url).match(/ClassIdx=(\d+)/i);
        if (classMatch) {
            lastClass = classMatch[1];
        }
        classCalls.push({ method, url, lastClass });
        const pad = '<!-- attendance list -->'.repeat(12);
        let text = shellHtml;
        if (/absense_list/i.test(url)) {
            text = lastClass === '222'
                ? `${pad}<table><tr><th>날짜</th><th>상태</th><th>메모</th></tr><tr><td>2026-09-16</td><td>결석</td><td>감기</td></tr></table>`
                : `${pad}<table><tr><th>날짜</th><th>상태</th><th>메모</th></tr><tr><td>2026-10-21</td><td>출석</td><td></td></tr></table>`;
        }
        return { text, finalUrl: url, status: 200 };
    };
    let merged;
    try {
        merged = await counsel.scrapeCounselProfilesBatch(
            { baseUrl: 'https://tms.example', username: 'u', password: 'p' },
            [
                { classId: 'cOld', tmsClassId: '111', students: [{ id: 'sOld', name: '김민준', tmsMpidx: '100' }] },
                { classId: 'cNew', tmsClassId: '222', students: [{ id: 'sNew', name: '김민준', tmsMpidx: '100' }] }
            ],
            { attendanceOnly: true }
        );
    } finally {
        Object.assign(tmsRoster, original);
    }
    const absenceGets = classCalls.filter((c) => c.method === 'GET' && /absense_list/i.test(c.url));
    assert(absenceGets.length === 2, 'each TMS class id loads attendance');
    ['cOld', 'cNew'].forEach((cid) => {
        const bucket = merged.classes[cid];
        const dates = ((bucket.students[0] || {}).attendanceRecords || []).map((r) => r.date).sort();
        assert(dates.indexOf('2026-09-16') !== -1 && dates.indexOf('2026-10-21') !== -1, `${cid} keeps both months: ${dates.join(',')}`);
    });
    const oldSept = merged.classes.cOld.students[0].attendanceRecords.find((r) => r.date === '2026-09-16');
    assert(oldSept && oldSept.memo === '감기', 'older class keeps the September note');
}

// A redirect must not drop the absence post body.
{
    const realFetch = globalThis.fetch;
    const fetchCalls = [];
    globalThis.fetch = async (url, opts) => {
        const method = String((opts && opts.method) || 'GET').toUpperCase();
        const body = opts && opts.body ? String(opts.body) : '';
        fetchCalls.push({ method, body });
        if (method === 'POST' && fetchCalls.filter((c) => c.method === 'POST').length === 1) {
            return new Response('', { status: 302, headers: { location: String(url) } });
        }
        const html = '<table><tr><th>날짜</th><th>상태</th><th>메모</th></tr><tr><td>2026-09-16</td><td>결석</td><td>감기</td></tr></table>';
        return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    };
    try {
        const page = await tmsRoster.fetchPage({ map: new Map() }, 'https://tms.example/iFrame/student_absense_list.aspx', {
            method: 'POST',
            preservePost: true,
            body: '__EVENTTARGET=pagingHelper%24ctl00&__EVENTARGUMENT='
        });
        const posts = fetchCalls.filter((c) => c.method === 'POST');
        assert(posts.length >= 2, 'redirect is followed as POST');
        assert(posts[1].body === posts[0].body, 'the post body is kept');
        assert(String(page.text).includes('2026-09-16'), 'the followed post returns the older page');
    } finally {
        globalThis.fetch = realFetch;
    }
}

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
