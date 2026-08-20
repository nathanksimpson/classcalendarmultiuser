/**
 * Probe TMS after login — dumps class popup sidebar + roster scrape.
 *
 * Primary roster source is /class/class_Main_New_PopUp.aspx (sidebar Hsubclass).
 * TMS_ROSTER_URLS is only a fallback if that popup yields no classes.
 *
 * Usage (from repo root, with .env credentials):
 *   node scripts/tms-probe.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
require('../server/load-env');
const tms = require('../server/tms-roster');
// counsel scraper — may not exist yet during initial development
let tmsCounsel = null;
try {
    tmsCounsel = require('../shared/tms-counsel-core.cjs');
} catch (_) { /* not yet built */ }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '_tms-dump');

async function main() {
    if (!tms.credentialsConfigured(tms.getConfig())) {
        console.error(
            'Missing TMS_USERNAME / TMS_PASSWORD in .env. Add them, then re-run this script.'
        );
        process.exit(1);
    }
    console.log('Logging in to TMS…');
    const info = await tms.probe();
    console.log('Home URL:', info.homeUrl);
    console.log('Title:', info.title);
    console.log('Class popup sidebar classes:', info.classSelectCount || 0);
    (info.classSelectSample || []).forEach((c) =>
        console.log(`  ${c.cohortName} (id=${c.tmsClassId})`)
    );
    console.log('Roster-like links (legacy fallback):', info.rosterLikeLinks.length);
    info.rosterLikeLinks.slice(0, 10).forEach((u) => console.log('  ', u));

    console.log('\nScraping rosters (class popup first)…');
    const scraped = await tms.scrapeRosters();
    console.log(`Source: ${scraped.meta && scraped.meta.source}`);
    console.log(`Found ${scraped.cohorts.length} cohort(s)`);
    scraped.cohorts.forEach((c) => {
        const idPart = c.tmsClassId ? ` id=${c.tmsClassId}` : '';
        const sched =
            c.schedule && c.schedule.start
                ? ` ${c.schedule.start}~${c.schedule.end || '?'}`
                : '';
        console.log(`  ${c.cohortName}${idPart}${sched}: ${c.students.length} students`);
        c.students.slice(0, 5).forEach((s) =>
            console.log(`    - ${s.name}${s.mpidx ? ` mpidx=${s.mpidx}` : ''}`)
        );
        if (c.students.length > 5) {
            console.log(`    … +${c.students.length - 5} more`);
        }
    });
    console.log('\nPages fetched:');
    (scraped.meta.pages || []).forEach((p) => {
        console.log(
            `  [${p.ok ? 'ok' : 'fail'}] ${p.status} students=${p.studentCount || 0} ${p.url}`
        );
    });

    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'probe-result.json');
    fs.writeFileSync(
        outPath,
        JSON.stringify({ probedAt: new Date().toISOString(), info, scraped }, null, 2),
        'utf8'
    );
    console.log('\nWrote', outPath);
    console.log(
        'Tip: real class names come from class_Main_New_PopUp.aspx. TMS_ROSTER_URLS is only a fallback.'
    );

    // --counsel flag: fetch a raw profiles_new.aspx and write fixture HTML
    if (process.argv.includes('--counsel') && tmsCounsel) {
        console.log('\n--- Counsel probe ---');
        // Use first synced student from first cohort as the test subject
        const firstCohort = scraped.cohorts && scraped.cohorts[0];
        const firstStudent = firstCohort && firstCohort.students && firstCohort.students[0];
        if (!firstStudent || !firstStudent.mpidx) {
            console.log('No student with mpidx found — run roster sync first or set TMS_ROSTER_URLS.');
        } else {
            const tmsClassId = (firstCohort && firstCohort.tmsClassId) || '';
            console.log(`Fetching counsel profile for mpidx=${firstStudent.mpidx} classId=${tmsClassId}…`);
            try {
                const cfg = Object.assign({}, tms.getConfig());
                const result = await tmsCounsel.scrapeCounselProfile(cfg, {
                    mpidx: firstStudent.mpidx,
                    tmsClassId,
                    studentId: firstStudent.mpidx,
                    name: firstStudent.name || ''
                });
                const fixturePath = path.join(
                    __dirname,
                    '../tests/fixtures/tms/profiles-new-real.html'
                );
                if (result && result._rawHtml) {
                    fs.writeFileSync(fixturePath, result._rawHtml, 'utf8');
                    console.log('Wrote raw HTML to', fixturePath);
                    console.log('Review and sanitize (remove real names/phones) before committing.');
                }
                const iframeDir = path.join(__dirname, '../tests/fixtures/tms');
                if (result && result._iframeHtml) {
                    const names = { counsel: 'iframe-consult-real.html', absence: 'iframe-absence-real.html', profile: 'iframe-profile-real.html' };
                    Object.keys(names).forEach((key) => {
                        const html = result._iframeHtml[key];
                        if (html) {
                            const p = path.join(iframeDir, names[key]);
                            fs.writeFileSync(p, html, 'utf8');
                            console.log('Wrote iframe HTML to', p, `(${html.length} bytes)`);
                        }
                    });
                }
                const jsonPath = path.join(outDir, 'counsel-probe-result.json');
                fs.writeFileSync(
                    jsonPath,
                    JSON.stringify({ probedAt: new Date().toISOString(), result }, null, 2),
                    'utf8'
                );
                console.log('Wrote parsed result to', jsonPath);
                if (result && result.notes) {
                    console.log(`  status: ${result.enrollStatus || '?'}`);
                    console.log(`  퇴원일: ${result.quitDate || 'none'}`);
                    console.log(`  휴원기간: ${result.breakPeriod || 'none'}`);
                    console.log(`  counsel notes: ${result.notes.length}`);
                    console.log(`  attendance notes: ${(result.attendanceRecords || []).length}`);
                }
            } catch (err) {
                console.error('Counsel probe failed:', err.message || err);
            }
        }
    }
}

main().catch((err) => {
    console.error(err.code || '', err.message || err);
    process.exit(1);
});
