/**
 * Production asset build: copy allow-listed static files to dist/, minify JS/CSS,
 * stamp content-hash ?v= cache strings, and write dist/_headers.
 * Local dev (npm start) continues to use repo root; deploy uses dist/.
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';
import { concatCssForDist } from './split-styles.mjs';
import { checkTreeEncoding } from './encoding-check.mjs';

const require = createRequire(import.meta.url);
const { renderHeadersFile } = require('../shared/security-headers.cjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

/** Top-level directories published to production (copied recursively). */
const SHIP_DIRS = new Set(['js', 'css', 'help', 'templates', 'tools', 'downloads']);

/** Top-level files published to production (in addition to *.html). */
const SHIP_FILES = new Set([
    'app.js',
    'styles.css',
    'admin.css',
    'help.css',
    'homework-import-standard.json',
    'FOR TEACHERS.md',
    'FOR TEACHERS-ko.md'
]);

/** Known dev-only top-level items: skipped quietly. Anything not shipped or listed here fails the build. */
const DEV_ONLY_DIRS = new Set([
    'node_modules',
    '.git',
    '.github',
    '.cursor',
    '.prod-recovery',
    '.wrangler',
    'dist',
    'data',
    'crypto',
    'shared',
    'Reference',
    'scripts',
    'tests',
    'server',
    'worker',
    'docs',
    'design',
    'helper',
    'Example Calendars'
]);

const DEV_ONLY_FILES = new Set([
    'package.json',
    'package-lock.json',
    'wrangler.toml',
    '.env',
    '.env.example',
    '.gitignore',
    '.gitattributes',
    '.editorconfig',
    '.assetsignore'
]);

function isDevOnlyTopLevel(name, isDir) {
    if (isDir) {
        return DEV_ONLY_DIRS.has(name) || name.startsWith('design_handoff_') || name.startsWith('.tmp');
    }
    return (
        DEV_ONLY_FILES.has(name) ||
        name.startsWith('.tmp') ||
        /\.(md|bat|log|patch|bak)$/i.test(name)
    );
}

/** Files inside shipped directories that must never be published. */
function shouldSkipNestedFile(name) {
    if (name.startsWith('.tmp') || name === '_headers') {
        return true;
    }
    return /\.(bat|log|patch|bak)$/i.test(name) || (name.endsWith('.md') && !name.startsWith('FOR TEACHERS'));
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
    'js/dom.js',
    'js/ui/modal.js',
    'js/views/class-list-view.js',
    'js/views/event-list-view.js',
    'js/views/calendar-view.js',
    'js/tab-warnings.js',
    'js/view-as-i18n.js',
    'js/cohort-management.js',
    'js/meeting-days-control.js',
    'js/setup-board.js',
    'js/teacher-management.js',
    'js/planner/teacher-planner-core.js',
    'js/planner/teacher-planner-ui.js',
    'js/planner/teacher-planner-page.js',
    'js/core/app-state.js'
];

const MINIFY_CSS = ['styles.css', 'admin.css', 'help.css'];

function copyRecursive(srcDir, destDir) {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const ent of entries) {
        const srcPath = path.join(srcDir, ent.name);
        const destPath = path.join(destDir, ent.name);
        if (ent.isDirectory()) {
            if (ent.name.startsWith('.tmp') || ent.name === 'node_modules') {
                continue;
            }
            fs.mkdirSync(destPath, { recursive: true });
            copyRecursive(srcPath, destPath);
            continue;
        }
        if (shouldSkipNestedFile(ent.name)) {
            continue;
        }
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
    }
}

/** Copy only allow-listed top-level items; throw on anything unclassified. */
function copyAllowListed() {
    const unknown = [];
    for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
        const name = ent.name;
        const isDir = ent.isDirectory();
        const ship = isDir ? SHIP_DIRS.has(name) : SHIP_FILES.has(name) || /\.html$/i.test(name);
        if (ship) {
            const src = path.join(root, name);
            const dest = path.join(dist, name);
            if (isDir) {
                fs.mkdirSync(dest, { recursive: true });
                copyRecursive(src, dest);
            } else {
                fs.copyFileSync(src, dest);
            }
            continue;
        }
        if (!isDevOnlyTopLevel(name, isDir)) {
            unknown.push((isDir ? 'dir  ' : 'file ') + name);
        }
    }
    if (unknown.length) {
        throw new Error(
            'Build stopped: unclassified top-level item(s). Add each to SHIP_* (publish) or DEV_ONLY_* (keep private) in scripts/build-assets.mjs:\n  ' +
                unknown.join('\n  ')
        );
    }
}

// ---- Content-hash cache busting (8.1) -------------------------------------------------------

/** Quoted local asset refs with a non-empty ?v= (string-concatenated '...?v=' + x refs are left alone). */
const VERSIONED_REF_RE =
    /(["'])((?:\.{0,2}\/)*(?:[\w.\- ]+\/)*[\w.\-]+\.(?:js|css|html|json))\?v=([^"'\s]+)\1/g;

function hashFile(absPath) {
    return createHash('sha256').update(fs.readFileSync(absPath)).digest('hex').slice(0, 10);
}

function listDistFiles(dir, ext, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            listDistFiles(p, ext, out);
        } else if (ext.test(ent.name)) {
            out.push(p);
        }
    }
    return out;
}

function resolveRef(fromFile, ref) {
    const clean = ref.replace(/^\.\//, '');
    const candidates = clean.startsWith('/')
        ? [path.join(dist, clean)]
        : [path.join(path.dirname(fromFile), clean), path.join(dist, clean)];
    return candidates.find((p) => p.startsWith(dist) && fs.existsSync(p) && fs.statSync(p).isFile()) || null;
}

/** Rewrite ?v= in one file; returns number of refs changed. */
function stampFile(file, hashCache) {
    const text = fs.readFileSync(file, 'utf8');
    let changed = 0;
    const out = text.replace(VERSIONED_REF_RE, (match, quote, ref, oldVersion) => {
        const target = resolveRef(file, ref);
        if (!target || target === file) {
            return match;
        }
        if (!hashCache.has(target)) {
            hashCache.set(target, hashFile(target));
        }
        const next = hashCache.get(target);
        if (next === oldVersion) {
            return match;
        }
        changed += 1;
        return `${quote}${ref}?v=${next}${quote}`;
    });
    if (changed) {
        fs.writeFileSync(file, out, 'utf8');
    }
    return changed;
}

function stampContentHashes() {
    const jsFiles = listDistFiles(dist, /\.js$/i);
    let jsRefs = 0;
    // Loaders can reference other loaders; repeat until hashes stop moving.
    for (let pass = 0; pass < 5; pass += 1) {
        const hashCache = new Map();
        const n = jsFiles.reduce((sum, f) => sum + stampFile(f, hashCache), 0);
        jsRefs += n;
        if (!n) {
            break;
        }
    }
    const hashCache = new Map();
    let htmlRefs = 0;
    for (const f of listDistFiles(dist, /\.html$/i)) {
        htmlRefs += stampFile(f, hashCache);
    }
    // CCP_I18N_VERSION is appended at runtime to lazily loaded calendar-en.js / calendar-ko.js.
    const i18nFiles = ['calendar-en.js', 'calendar-ko.js'].map((f) => path.join(dist, 'js', 'i18n', f));
    if (i18nFiles.every((p) => fs.existsSync(p))) {
        const i18nHash = createHash('sha256')
            .update(i18nFiles.map((p) => hashFile(p)).join(':'))
            .digest('hex')
            .slice(0, 10);
        for (const f of listDistFiles(dist, /\.html$/i)) {
            const html = fs.readFileSync(f, 'utf8');
            const next = html.replace(
                /(window\.CCP_I18N_VERSION\s*=\s*)(['"])[^'"]*\2/,
                (m, lhs, q) => `${lhs}${q}${i18nHash}${q}`
            );
            if (next !== html) {
                fs.writeFileSync(f, next, 'utf8');
            }
        }
    }
    console.log(`Cache strings: ${jsRefs} ref(s) in JS loaders, ${htmlRefs} ref(s) in HTML stamped with content hashes`);
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
    if (!fs.existsSync(dist)) {
        return;
    }
    try {
        fs.rmSync(dist, { recursive: true, force: true });
    } catch (err) {
        if (err.code !== 'EPERM' && err.code !== 'ENOTEMPTY') {
            throw err;
        }
        for (const entry of fs.readdirSync(dist)) {
            fs.rmSync(path.join(dist, entry), { recursive: true, force: true });
        }
    }
}

async function main() {
    const encodingProblems = checkTreeEncoding(root, { ext: /\.html$/i });
    if (encodingProblems.length) {
        throw new Error(
            'Build stopped: HTML files with broken encoding (restore them before deploying):\n' +
                encodingProblems.join('\n')
        );
    }
    rmDist();
    fs.mkdirSync(dist, { recursive: true });
    copyAllowListed();
    fs.writeFileSync(path.join(dist, '_headers'), renderHeadersFile(), 'utf8');
    // Flatten styles.css @imports into a single file for production (no nested @import).
    try {
        const flat = concatCssForDist('styles.css');
        fs.writeFileSync(path.join(dist, 'styles.css'), flat, 'utf8');
    } catch (err) {
        console.warn('CSS flatten from styles.css failed, using copied styles.css:', err.message);
    }
    await minifyFiles();
    stampContentHashes();
    // Production root alias — Cloudflare SPA would otherwise serve index.html for /essay-batch-editor.html
    try {
        const editorSrc = path.join(dist, 'tools', 'essay-batch-editor.html');
        if (fs.existsSync(editorSrc)) {
            fs.copyFileSync(editorSrc, path.join(dist, 'essay-batch-editor.html'));
        }
    } catch (err) {
        console.warn('Could not alias essay-batch-editor.html to dist root:', err.message);
    }
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
