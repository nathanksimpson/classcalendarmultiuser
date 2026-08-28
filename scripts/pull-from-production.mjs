/**
 * Download production assets from classmanager.live into the repo.
 * Readable sources are written in place; minified assets go to .prod-pulled/ for merge.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = 'https://classmanager.live';
const STAGING = path.join(ROOT, '.prod-pulled');

/** @type {{ repoPath: string, query: string, direct?: boolean }[]} */
const ASSETS = [
    { repoPath: 'js/timetable-import.js', query: 'v=20260828-migrate-ux', direct: true },
    { repoPath: 'js/timetable-import-ocr.js', query: 'v=20260828-migrate-ux', direct: true },
    { repoPath: 'js/timetable-import-pdf.js', query: 'v=20260828-migrate-ux', direct: true },
    { repoPath: 'js/timetable-import-ui.js', query: 'v=20260828-migrate-ux', direct: true },
    { repoPath: 'js/tms-class-name.js', query: 'v=20260828-term-code', direct: true },
    { repoPath: 'js/term-migrate-wizard.js', query: 'v=20260828-term-code', direct: true },
    { repoPath: 'js/classroom-roster.js', query: 'v=20260828-modal-stay', direct: true },
    { repoPath: 'js/ui/modal.js', query: 'v=20260828-modal-stay' },
    { repoPath: 'js/i18n/calendar-en.js', query: 'v=20260828-student-merge' },
    { repoPath: 'js/app-tab-scripts.js', query: 'v=20260828-modal-stay' },
    { repoPath: 'app.js', query: 'v=20260828-modal-stay' },
    { repoPath: 'styles.css', query: 'v=20260828-modal-stay' },
    { repoPath: 'index.html', query: '' }
];

async function download(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return res.text();
}

function looksMinified(text) {
    const sample = text.slice(0, 2000);
    const lines = sample.split('\n').length;
    return lines < 8 && sample.length > 1500;
}

function beautifyJs(code) {
    try {
        return execSync('npx --yes js-beautify@1.15.4', {
            input: code,
            encoding: 'utf8',
            maxBuffer: 20 * 1024 * 1024
        });
    } catch (err) {
        console.warn('js-beautify failed:', err.message);
        return code;
    }
}

function beautifyCss(code) {
    try {
        return execSync('npx --yes js-beautify@1.15.4 --type css', {
            input: code,
            encoding: 'utf8',
            maxBuffer: 20 * 1024 * 1024
        });
    } catch (err) {
        console.warn('css beautify failed:', err.message);
        return code;
    }
}

async function main() {
    fs.mkdirSync(STAGING, { recursive: true });
    const manifest = [];

    for (const asset of ASSETS) {
        const url =
            asset.query && asset.query.length
                ? `${BASE}/${asset.repoPath}?${asset.query}`
                : `${BASE}/${asset.repoPath}`;
        console.log('Fetching', url);
        let text = await download(url);
        const minified = looksMinified(text);
        const dest = asset.direct
            ? path.join(ROOT, asset.repoPath)
            : path.join(STAGING, asset.repoPath.replace(/\//g, '__'));

        if (asset.direct) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, text, 'utf8');
            manifest.push({ path: asset.repoPath, mode: 'direct', bytes: text.length });
            continue;
        }

        if (minified && asset.repoPath.endsWith('.css')) {
            text = beautifyCss(text);
        } else if (minified && asset.repoPath.endsWith('.js')) {
            text = beautifyJs(text);
        }

        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, text, 'utf8');
        manifest.push({
            path: asset.repoPath,
            mode: 'staged',
            minified,
            bytes: text.length,
            staging: path.relative(ROOT, dest)
        });
    }

    fs.writeFileSync(path.join(STAGING, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log('Done. Manifest:', path.join(STAGING, 'manifest.json'));
    for (const row of manifest) {
        console.log(`  ${row.mode.padEnd(6)} ${row.path} (${row.bytes} bytes)`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
