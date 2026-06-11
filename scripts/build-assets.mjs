/**
 * Production asset build: copy static files to dist/ and minify JS/CSS.
 * Local dev (npm start) continues to use repo root; deploy uses dist/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    '.cursor',
    '.wrangler',
    'dist',
    'data',
    'crypto',
    'Reference',
    'scripts',
    'tests',
    'server',
    'worker',
    'Example Calendars'
]);

const SKIP_FILES = new Set([
    'package-lock.json',
    '.env',
    '.env.example',
    '.tmp-cookies.txt',
    'wrangler.toml',
    'AGENTS.md',
    'DEVELOPER.md',
    'SECURITY-AUDIT.md',
    'SCHEMA.md',
    'CLOUDFLARE-DEPLOY.md',
    'KAKAO-SETUP.md'
]);

function shouldSkipFile(name) {
    if (SKIP_FILES.has(name)) {
        return true;
    }
    if (name.endsWith('.bat') || name.startsWith('.tmp')) {
        return true;
    }
    if (name.endsWith('.md') && !name.startsWith('FOR TEACHERS')) {
        return true;
    }
    return false;
}

const MINIFY_JS = [
    'js/i18n/calendar-en.js',
    'js/i18n/calendar-ko.js',
    'js/i18n/calendar-i18n.js',
    'app.js',
    'js/calendar-sync.js',
    'js/team-auth.js',
    'js/admin.js',
    'js/help-guide.js',
    'js/help-page.js',
    'js/workspace.js',
    'js/notes.js',
    'js/day-notes.js',
    'js/day-note-categories.js',
    'js/day-note-mentions.js',
    'js/class-notes-panel.js',
    'js/books-editor.js',
    'js/syllabus-table.js',
    'js/homework-import.js',
    'js/homework-tab.js',
    'js/default-class-editor.js',
    'js/teacher-timetable.js',
    'js/debate-periods.js',
    'js/schedule-core.js',
    'js/utils.js',
    'js/client-api.js',
    'js/load-extension-scripts.js',
    'js/template-loader.js',
    'js/app-tab-scripts.js',
    'js/storage-prune.js',
    'js/view-as-banner.js',
    'js/class-curriculum-slices.js',
    'js/timetable-export.js',
    'js/syllabus-curricula.js',
    'js/syllabus-presets.js',
    'js/syllabus-schedule-matrix.js',
    'js/syllabus-curricula-data.js',
    'js/syllabus-templates.js',
    'js/schedule-matrix-data.js',
    'js/theme-init.js',
    'js/language-init.js',
    'js/theme-toggle.js',
    'js/games-loader.js',
    'js/snake-game.js',
    'js/dino-game.js',
    'js/admin-i18n.js',
    'js/session-restore.js',
    'js/page-chrome.js',
    'js/tab-warnings.js',
    'js/view-as-i18n.js',
    'js/cohort-management.js',
    'js/meeting-days-control.js',
    'js/setup-board.js',
    'js/teacher-management.js'
];

const MINIFY_CSS = ['styles.css', 'admin.css', 'help.css'];

function shouldSkipDir(name) {
    return SKIP_DIRS.has(name);
}

function copyRecursive(srcDir, destDir) {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const ent of entries) {
        const srcPath = path.join(srcDir, ent.name);
        const destPath = path.join(destDir, ent.name);
        if (ent.isDirectory()) {
            if (shouldSkipDir(ent.name)) {
                continue;
            }
            fs.mkdirSync(destPath, { recursive: true });
            copyRecursive(srcPath, destPath);
            continue;
        }
        if (shouldSkipFile(ent.name)) {
            continue;
        }
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
    }
}

async function minifyFiles() {
    for (const rel of MINIFY_JS) {
        const inFile = path.join(dist, rel);
        if (!fs.existsSync(inFile)) {
            continue;
        }
        await esbuild.build({
            entryPoints: [inFile],
            outfile: inFile,
            allowOverwrite: true,
            minify: true,
            bundle: false,
            legalComments: 'none',
            target: ['es2020']
        });
    }
    for (const rel of MINIFY_CSS) {
        const inFile = path.join(dist, rel);
        if (!fs.existsSync(inFile)) {
            continue;
        }
        const css = fs.readFileSync(inFile, 'utf8');
        const out = await esbuild.transform(css, {
            loader: 'css',
            minify: true
        });
        fs.writeFileSync(inFile, out.code);
    }
}

function rmDist() {
    if (fs.existsSync(dist)) {
        fs.rmSync(dist, { recursive: true, force: true });
    }
}

async function main() {
    rmDist();
    fs.mkdirSync(dist, { recursive: true });
    copyRecursive(root, dist);
    await minifyFiles();
    let bytes = 0;
    for (const rel of [...MINIFY_JS, ...MINIFY_CSS]) {
        const p = path.join(dist, rel);
        if (fs.existsSync(p)) {
            bytes += fs.statSync(p).size;
        }
    }
    console.log('Built dist/ — minified core assets ~' + Math.round(bytes / 1024) + ' KB');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
