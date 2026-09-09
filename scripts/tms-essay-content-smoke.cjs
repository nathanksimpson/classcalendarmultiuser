/**
 * Live smoke: fetch one essay body via recphotopholi.aspx.
 * Usage: node scripts/tms-essay-content-smoke.cjs
 */
const path = require('path');
require(path.join(__dirname, '../server/load-env'));
const tms = require(path.join(__dirname, '../shared/tms-roster-core.cjs'));

async function main() {
    if (!tms.credentialsConfigured(tms.getConfig())) {
        console.error('Missing TMS credentials in .env');
        process.exit(1);
    }
    console.log('Scraping Writing list…');
    const list = await tms.scrapeEssaySubmissions();
    const row = (list.rows || [])[0];
    if (!row) {
        console.error('No writing rows');
        process.exit(1);
    }
    console.log('First row:', {
        name: row.name,
        className: row.className,
        title: row.title,
        mpidx: row.mpidx,
        tmsClassId: row.tmsClassId,
        homeworkItemIdx: row.homeworkItemIdx,
        lessonDate: row.lessonDate
    });
    console.log('Detail URL:', tms.buildWritingDetailUrl(tms.getConfig().baseUrl, row, ''));
    console.log('Fetching body…');
    const result = await tms.scrapeEssayContents({ rows: [row] });
    const essay = result.essays[0];
    console.log('meta', result.meta);
    console.log('ok', essay && essay.ok, 'code', essay && essay.code, 'error', essay && essay.error);
    console.log('url', essay && essay.url);
    console.log('portfolioTitle', essay && essay.portfolioTitle);
    console.log('body preview:\n', (essay && essay.body ? essay.body.slice(0, 400) : '(empty)'));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
