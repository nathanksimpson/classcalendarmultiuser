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
    const html = readFileSync(path.join(__dirname, 'fixtures', 'tms', 'writing-detail-debate.html'), 'utf8');
    const parsed = tms.parseEssayDetailContent(html);
    assert(parsed.portfolioTitle === '2026-07-23월 에세이숙제', `portfolio ${parsed.portfolioTitle}`);
    assert(parsed.body.includes('I agree with the motion'), `body ${parsed.body.slice(0, 40)}`);
}

{
    const html = readFileSync(path.join(__dirname, 'fixtures', 'tms', 'recphotopholi-sample.html'), 'utf8');
    const parsed = tms.parseEssayDetailContent(html);
    assert(
        parsed.portfolioTitle.includes('2026-07-22') || parsed.portfolioTitle.includes('에세이숙제'),
        `portfolioTitle ${parsed.portfolioTitle}`
    );
    assert(parsed.body.includes('listing and unlisted'), `body missing: ${parsed.body.slice(0, 80)}`);
    assert(!parsed.body.includes('Writing입니다'), 'header span stripped');
    assert(!/<font/i.test(parsed.body), 'should be plain student text, not red correction HTML');
}

{
    const url = tms.buildWritingDetailUrl(
        'http://tms.esimson.com',
        {
            mpidx: '124553',
            tmsClassId: '30974',
            homeworkItemIdx: '1283783',
            lessonDate: '2026-07-22'
        },
        ''
    );
    assert(url.includes('/recorder/rec_video/recphotopholi.aspx'), url);
    assert(url.includes('mpidx=124553'), url);
    assert(url.includes('classidx=30974'), url);
    assert(url.includes('homeworkitemidx=1283783'), url);
    assert(url.includes('wdate=20260722'), url);
    assert(!url.includes('hwidx='), 'must use homeworkitemidx not hwidx');
}

{
    const listHtml = readFileSync(path.join(__dirname, 'fixtures', 'tms', 'writing-list-page1.html'), 'utf8');
    // Fixture may not include photopoliview fn; dump does
    const dump = readFileSync(
        path.join(__dirname, '..', 'scripts', '_tms-dump', 'writing-list-get.html'),
        'utf8'
    );
    const tmpl = tms.extractPhotopoliviewUrlTemplate(dump);
    assert(/recphotopholi\.aspx/i.test(tmpl), `template ${tmpl}`);
    const rows = tms.parseWritingListRows(listHtml);
    assert(rows[0].teacher === 'Nathan', `teacher ${rows[0].teacher}`);
}

console.log('tms-essay-content.test.mjs: ok');
