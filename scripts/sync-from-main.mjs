/**
 * Copy updated app files from Calendar App (local) into this team project.
 * Does not overwrite cloud-only paths.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEST = path.join(__dirname, '..');
const SRC = path.join(DEST, '..', 'Calendar App');

const SKIP_DIRS = new Set(['node_modules', '.git', 'data', 'server', '.cursor']);
const SKIP_FILES = new Set(['package.json', 'package-lock.json', '.env', '.env.example']);
const SKIP_REL = new Set([
    'js/calendar-sync.js',
    'README.md'
]);

function shouldSkip(rel) {
    const norm = rel.replace(/\\/g, '/');
    if (SKIP_REL.has(norm)) {
        return true;
    }
    if (SKIP_FILES.has(path.basename(rel))) {
        return true;
    }
    return norm.split('/').some((p) => SKIP_DIRS.has(p));
}

function copyRecursive(srcDir, destDir, rel = '') {
    if (!fs.existsSync(srcDir)) {
        console.error('Source not found:', SRC);
        process.exit(1);
    }
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const ent of entries) {
        const relPath = rel ? `${rel}/${ent.name}` : ent.name;
        if (shouldSkip(relPath)) {
            continue;
        }
        const from = path.join(srcDir, ent.name);
        const to = path.join(destDir, ent.name);
        if (ent.isDirectory()) {
            fs.mkdirSync(to, { recursive: true });
            copyRecursive(from, to, relPath);
        } else {
            fs.copyFileSync(from, to);
            console.log('Copied', relPath);
        }
    }
}

console.log('Syncing from', SRC, 'to', DEST);
copyRecursive(SRC, DEST);
console.log('Done. Re-check team UI in index.html if you merged index.html from main.');
