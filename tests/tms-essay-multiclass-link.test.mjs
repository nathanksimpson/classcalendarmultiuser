/**
 * TMS essay sync with many classes at once (Nov 2026 rework).
 * - TMS reuses a homework item across classes and weeks: one assignment per class + item + date.
 * - The class whose roster holds the submitters wins over a title-only match.
 * - Remembered links to a class with none of the submitters are not trusted.
 * - Scraped essays link to the right week's Essays-list row.
 * Run: node tests/tms-essay-multiclass-link.test.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

function loadDomain() {
    const code = readFileSync(path.join(root, 'js', 'classroom-domain.js'), 'utf8');
    const sandbox = { window: {}, globalThis: {} };
    vm.runInNewContext(code, sandbox);
    return sandbox.window.CCPClassroomDomain;
}

const D = loadDomain();

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const W1 = '2026-11-03';
const W2 = '2026-11-10';

/** Two same-level Blue classes, different rosters, same weekly "News essay" lessons. No roster links. */
function twoClassApp() {
    const lessons = (prefix) => [
        { id: `${prefix}-w1`, kind: 'lesson', date: W1, planTitle: 'News essay', trackEssay: true },
        { id: `${prefix}-w2`, kind: 'lesson', date: W2, planTitle: 'News essay', trackEssay: true }
    ];
    return {
        tmsRosterLinks: {},
        tmsEssayLinks: {},
        cohorts: [
            {
                id: 'cohA',
                name: 'BlueT1',
                students: [
                    { id: 'a1', name: '김테가', tags: [] },
                    { id: 'a2', name: '이테나', tags: [] }
                ]
            },
            {
                id: 'cohB',
                name: 'BlueT2',
                students: [
                    { id: 'b1', name: '박테다', tags: [] },
                    { id: 'b2', name: '최테라', tmsMpidx: '9002', tags: [] }
                ]
            }
        ],
        classes: [
            { id: 'clsA', name: 'BlueT1 News', cohortIds: ['cohA'], syllabusRows: lessons('A') },
            { id: 'clsB', name: 'BlueT2 News', cohortIds: ['cohB'], syllabusRows: lessons('B') }
        ],
        essaySubmissions: []
    };
}

/** Flat Writing-list rows: one homework item (777) shared by both TMS classes and both weeks. */
function sharedItemRows() {
    const row = (name, mpidx, tmsClassId, className, date) => ({
        name,
        nameEn: '',
        mpidx,
        tmsClassId,
        className,
        title: 'News essay',
        homeworkItemIdx: '777',
        lessonDate: date,
        submitted: true,
        submittedAt: date
    });
    return [
        row('김테가', '9001', '501', 'BlueT1^2611', W1),
        row('이테나', '9003', '501', 'BlueT1^2611', W1),
        row('박테다', '9004', '502', 'BlueT2^2611', W1),
        row('최테라', '9002', '502', 'BlueT2^2611', W1),
        // Week 2: same item, same student again (used to be dropped as a duplicate)
        row('김테가', '9001', '501', 'BlueT1^2611', W2),
        row('최테라', '9002', '502', 'BlueT2^2611', W2)
    ];
}

// 1. Grouping: one assignment per TMS class + homework item + lesson date
{
    const groups = D.groupTmsEssayRowsIntoAssignments(sharedItemRows());
    assert(groups.length === 4, `4 assignments (2 classes x 2 weeks), got ${groups.length}`);
    const a1 = groups.find((g) => g.tmsClassId === '501' && g.lessonDate === W1);
    assert(a1 && a1.students.length === 2, 'class 501 week 1 has its 2 students');
    assert(a1.students.every((s) => ['김테가', '이테나'].includes(s.name)), 'no students from class 502');
    const a2 = groups.find((g) => g.tmsClassId === '501' && g.lessonDate === W2);
    assert(a2 && a2.students.length === 1 && a2.students[0].name === '김테가', 'week 2 essay kept');
    const keys = new Set(groups.map((g) => D.normalizeTmsEssayAssignmentKey(g)));
    assert(keys.size === 4, 'distinct keys');

    const body = { assignments: [{ title: 'old', students: [] }], rows: sharedItemRows() };
    assert(D.regroupTmsEssayScrape(body).assignments.length === 4, 'regroup from flat rows');
    assert(D.regroupTmsEssayScrape({ assignments: [1] }).assignments.length === 1, 'no rows: unchanged');

    // Shared core (bridge / Sync Helper) groups the same way
    const core = require(path.join(root, 'shared', 'tms-roster-core.cjs'));
    assert(core.groupWritingRowsIntoAssignments(sharedItemRows()).length === 4, 'core groups per class+item+date');
}

// 2. Sync all: each TMS class maps to the class whose roster holds its students, each week to its row
{
    const app = twoClassApp();
    const scrape = D.regroupTmsEssayScrape({ rows: sharedItemRows() });
    const built = D.buildTmsEssaySyncPlan(app, scrape);
    assert(built.rows.length === 4, 'all 4 assignments in plan');
    const want = {
        [`501|${W1}`]: ['clsA', 'A-w1'],
        [`501|${W2}`]: ['clsA', 'A-w2'],
        [`502|${W1}`]: ['clsB', 'B-w1'],
        [`502|${W2}`]: ['clsB', 'B-w2']
    };
    built.rows.forEach((r) => {
        const [cls, row] = want[`${r.tmsClassId}|${r.lessonDate}`];
        assert(r.suggestedClassId === cls, `${r.tmsClassId} ${r.lessonDate} -> ${cls}, got ${r.suggestedClassId}`);
        assert(r.suggestedSyllabusRowId === row, `${r.tmsClassId} ${r.lessonDate} -> ${row}, got ${r.suggestedSyllabusRowId}`);
    });

    // Quick path (scrape editor): every student gets linked
    const preview = D.previewTmsEssaySync(app, scrape);
    assert(preview.updates.length === 6, `6 student essays linked, got ${preview.updates.length}`);
    assert(
        !preview.unmatched.some((u) => u && u.reason === 'student_unmatched'),
        'no student left unmatched'
    );
    const b2w2 = preview.updates.find((u) => u.studentId === 'b2' && u.syllabusRowId === 'B-w2');
    assert(b2w2, 'BlueT2 student week 2 linked to week 2 row');

    // Batch-editor card lookup picks the right week
    const w1 = D.lookupEssayListLink(preview, {
        studentName: '김테가', className: 'BlueT1^2611', title: 'News essay', tmsClassId: '501', lessonDate: W1
    });
    const w2 = D.lookupEssayListLink(preview, {
        studentName: '김테가', className: 'BlueT1^2611', title: 'News essay', tmsClassId: '501', lessonDate: W2
    });
    assert(w1 && w1.syllabusRowId === 'A-w1' && w1.studentId === 'a1', 'week 1 card link');
    assert(w2 && w2.syllabusRowId === 'A-w2' && w2.studentId === 'a1', 'week 2 card link');
}

// 3. Old homework-item-only link from class A is not reused for TMS class B
{
    const app = twoClassApp();
    app.tmsEssayLinks = {
        'hw:777': {
            action: 'map', classId: 'clsA', syllabusRowId: 'A-w1',
            tmsClassId: '501', className: 'BlueT1^2611', title: 'News essay', lessonDate: W1, homeworkItemIdx: '777'
        }
    };
    const built = D.buildTmsEssaySyncPlan(app, D.regroupTmsEssayScrape({ rows: sharedItemRows() }));
    const a = built.rows.find((r) => r.tmsClassId === '501' && r.lessonDate === W1);
    const b = built.rows.find((r) => r.tmsClassId === '502' && r.lessonDate === W1);
    assert(a.remembered && a.userClassId === 'clsA', 'legacy link still used for its own class + date');
    assert(!b.remembered && b.suggestedClassId === 'clsB', 'legacy link not reused for another TMS class');
    const a2 = built.rows.find((r) => r.tmsClassId === '501' && r.lessonDate === W2);
    assert(!a2.remembered && a2.suggestedSyllabusRowId === 'A-w2', 'legacy link not reused for another week');
}

// 4. A remembered link to a class with none of the submitters is not trusted
{
    const app = twoClassApp();
    const scrape = D.regroupTmsEssayScrape({ rows: sharedItemRows() });
    const bW1 = scrape.assignments.find((g) => g.tmsClassId === '502' && g.lessonDate === W1);
    app.tmsEssayLinks = {
        [D.normalizeTmsEssayAssignmentKey(bW1)]: {
            action: 'map', classId: 'clsA', syllabusRowId: 'A-w1',
            tmsClassId: '502', className: 'BlueT2^2611', title: 'News essay', lessonDate: W1, homeworkItemIdx: '777'
        }
    };
    const built = D.buildTmsEssaySyncPlan(app, scrape);
    const row = built.rows.find((r) => r.tmsClassId === '502' && r.lessonDate === W1);
    assert(!row.remembered, 'wrong-roster link ignored');
    assert(row.suggestedClassId === 'clsB', 'fresh roster match suggested');
}

// 5. Two classes fit equally and no roster evidence: no guess
{
    const app = twoClassApp();
    const scrape = {
        assignments: [
            {
                tmsClassId: '599', className: 'Unknown^2611', title: 'News essay', homeworkItemIdx: '1',
                lessonDate: W1, students: [{ name: '없는학생', submitted: true }]
            }
        ]
    };
    const built = D.buildTmsEssaySyncPlan(app, scrape);
    assert(built.rows[0].suggestedClassId === '', `tie gives no suggestion, got ${built.rows[0].suggestedClassId}`);
}

// 6. Sync this class without a roster link: kept when the class roster has the students
{
    const app = twoClassApp();
    const scrape = D.regroupTmsEssayScrape({ rows: sharedItemRows() });
    const built = D.buildTmsEssaySyncPlan(app, scrape, { filterClassId: 'clsB' });
    assert(built.rows.length === 2, `clsB sync keeps its 2 assignments, got ${built.rows.length}`);
    assert(built.rows.every((r) => r.tmsClassId === '502' && r.suggestedClassId === 'clsB'), 'only BlueT2, suggested clsB');
}

// 7. Pager: each link with its page number (the scraper walks 2, 3, … from each page)
{
    const core = require(path.join(root, 'shared', 'tms-roster-core.cjs'));
    const html = readFileSync(path.join(root, 'tests', 'fixtures', 'tms', 'writing-list-page1.html'), 'utf8');
    const links = core.extractWritingPagingLinks(html);
    assert(links.some((l) => l.target === 'pagingHelper$ctl00' && l.page === 2), `fixture pager: ${JSON.stringify(links)}`);
    const page3 =
        `<span id="pagingHelper"><a href="javascript:__doPostBack(&#39;pagingHelper$ctl00&#39;,&#39;&#39;)">1</a> / ` +
        `<a href="javascript:__doPostBack('pagingHelper$ctl01','')"> 2 / </a><font>3</font> / ` +
        `<a href="javascript:__doPostBack('pagingHelper$ctl02','')"> 4 </a></span>`;
    const l3 = core.extractWritingPagingLinks(page3);
    assert(l3.find((l) => l.page === 4).target === 'pagingHelper$ctl02', 'next page read from the current page');
}

console.log('tms-essay-multiclass-link.test.mjs: ok');
