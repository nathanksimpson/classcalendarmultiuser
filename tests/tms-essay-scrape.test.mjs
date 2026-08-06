import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const tms = require(path.join(root, 'shared', 'tms-roster-core.cjs'));

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

{
    const p = tms.parseWritingStudentLabel('박세빈S(Sally)');
    assert(p.name === '박세빈', `name got ${p.name}`);
    assert(p.nameEn === 'Sally', `en got ${p.nameEn}`);
    assert(p.statusMarks && p.statusMarks.shuttle === true, 'shuttle mark');
}

{
    const p = tms.parseWritingStudentLabel('김유겸(YooGyum)');
    assert(p.name === '김유겸', `name got ${p.name}`);
    assert(p.nameEn === 'YooGyum', 'en');
}

{
    const p = tms.parseWritingStudentLabel('황연진()');
    assert(p.name === '황연진', `empty paren name got ${p.name}`);
}

{
    const html = readFileSync(path.join(__dirname, 'fixtures', 'tms', 'writing-list-page1.html'), 'utf8');
    const rows = tms.parseWritingListRows(html);
    assert(rows.length === 5, `expected 5 rows got ${rows.length}`);
    const first = rows[0];
    assert(first.name === '박세빈', `first name ${first.name}`);
    assert(first.statusMarks && first.statusMarks.shuttle === true, 'first shuttle');
    assert(first.tmsClassId === '31040', `class id ${first.tmsClassId}`);
    assert(first.homeworkItemIdx === '1282873', 'homework idx');
    assert(first.lessonDate === '2026-07-21', `lessonDate ${first.lessonDate}`);
    assert(first.title === 'Debate', `title ${first.title}`);
    assert(first.submitted === true, 'submitted');
    assert(first.submittedAt === '2026-07-28', `submittedAt ${first.submittedAt}`);
    assert(first.className === '여울T^2606', `className ${first.className}`);

    const targets = tms.extractWritingPagingTargets(html);
    assert(targets.includes('pagingHelper$ctl00'), `paging ${targets.join(',')}`);

    const assignments = tms.groupWritingRowsIntoAssignments(rows);
    assert(assignments.length >= 2, `assignments ${assignments.length}`);
    const debate = assignments.find((a) => a.title === 'Debate' && a.tmsClassId === '31040');
    assert(debate, 'debate assignment');
    assert(debate.mpidx === '137465', `debate mpidx ${debate.mpidx}`);
    assert(debate.students.some((s) => s.name === '박세빈'), 'debate student');
    const park = debate.students.find((s) => s.name === '박세빈');
    assert(park && park.mpidx, 'essay student keeps per-row mpidx');
    const news = assignments.find((a) => a.homeworkItemIdx === '1283783');
    assert(news && news.title === 'News', 'news assignment');
    assert(news.students.length >= 2, `news students ${news.students.length}`);
    news.students.forEach((s) => {
        assert(s.mpidx, `news student ${s.name} has mpidx`);
    });
}

{
    const encoded =
        `<span id="pagingHelper"><a href="javascript:__doPostBack(&#39;pagingHelper$ctl00&#39;,&#39;&#39;)">2</a></span>`;
    const targets = tms.extractWritingPagingTargets(encoded);
    assert(targets.includes('pagingHelper$ctl00'), 'entity-encoded paging');
}

{
    const detailHtml = `
        <table>
            <tr><th>포트폴리오제목</th><td>2026-07-23월 에세이숙제</td></tr>
        </table>
    `;
    const meta = tms.parseEssayDetailMeta(detailHtml);
    assert(meta.portfolioTitle === '2026-07-23월 에세이숙제', `portfolioTitle ${meta.portfolioTitle}`);
    assert(meta.assignedDate === '2026-07-23', `assignedDate ${meta.assignedDate}`);
    assert(meta.assignedMonth === '2026-07', `assignedMonth ${meta.assignedMonth}`);
}

{
    assert(
        tms.parsePortfolioAssignedDate('20260723 에세이숙제') === '2026-07-23',
        'compact portfolio date'
    );
}

{
    // Exact-only status noise on writing labels
    const keep = tms.parseWritingStudentLabel('신규학(Hak)');
    assert(keep.name === '신규학', `rare name kept got ${keep.name}`);
    assert(keep.nameEn === 'Hak', 'en kept');
    const drop = tms.parseWritingStudentLabel('신규학생');
    assert(!drop.name, '신규학생 status label not a writing student name');
    const dropTag = tms.parseWritingStudentLabel('신규');
    assert(!dropTag.name, '신규 status tag not a writing student name');
}

console.log('tms-essay-scrape.test.mjs: ok');
