/**
 * Probe TMS after login — dumps class popup sidebar + optional legacy links.
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
        console.log(`  ${c.cohortName}${idPart}: ${c.students.length} students`);
        c.students.slice(0, 5).forEach((s) => console.log(`    - ${s.name}`));
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
}

main().catch((err) => {
    console.error(err.code || '', err.message || err);
    process.exit(1);
});
