/**
 * Shared source-encoding check (tests/encoding.test.mjs + build gate in build-assets.mjs).
 * Catches the two corruption shapes seen in this repo: invalid UTF-8 / U+FFFD, and Korean text
 * re-saved through a non-UTF-8 codepage, which leaves ASCII "??" glued to Hangul.
 */
import fs from 'fs';
import path from 'path';

export const ENCODING_SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'data',
    '.wrangler',
    'Reference',
    '_tms-dump'
]);

export const ENCODING_EXT = /\.(html|js|cjs|mjs|css|json|md|sql|toml)$/i;

const MOJIBAKE_HANGUL = /\?\?[\uAC00-\uD7A3]|[\uAC00-\uD7A3]\?\?/;

/** @returns {string[]} problems for one file (empty when clean) */
export function checkFileEncoding(filePath, label = filePath) {
    const buf = fs.readFileSync(filePath);
    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf);
    } catch {
        return [`${label}: not valid UTF-8`];
    }
    const problems = [];
    if (text.charCodeAt(0) === 0xfeff) problems.push(`${label}: has BOM`);
    if (text.includes('\uFFFD')) problems.push(`${label}: contains U+FFFD`);
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
        if (MOJIBAKE_HANGUL.test(lines[i])) {
            problems.push(`${label}:${i + 1}: "??" next to Hangul (corrupted Korean text)`);
            break;
        }
    }
    return problems;
}

/** Walk `dir` and check every file whose name matches `ext`. */
export function checkTreeEncoding(dir, { ext = ENCODING_EXT, skipDirs = ENCODING_SKIP_DIRS, root = dir } = {}) {
    const problems = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            if (skipDirs.has(ent.name) || ent.name.startsWith('.tmp')) continue;
            problems.push(...checkTreeEncoding(p, { ext, skipDirs, root }));
            continue;
        }
        if (!ext.test(ent.name)) continue;
        problems.push(...checkFileEncoding(p, path.relative(root, p)));
    }
    return problems;
}
