/**
 * Restore js/syllabus-table.js from agent transcript Write/StrReplace ops.
 * Run: node scripts/restore-syllabus-table.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outPath = path.join(root, 'js', 'syllabus-table.js');
const transcriptRoot = path.join(
    'C:',
    'Users',
    'SIMSTER',
    '.cursor',
    'projects',
    'simson-jsl-simson-jsl-2-Nathan-Apps-In-Development-Cursor-Builds-Calendar-App',
    'agent-transcripts'
);
const TARGET_SUFFIX = 'syllabus-table.js';

const PRIORITY = [
    '89ba3830-7e04-4c98-9388-b91185f7d5ed',
    '70c12c97-e8f3-42c8-b128-ce21c45d834d',
    '4c2c3ffa-1353-4045-8d61-c48e3434e598',
    'd9829502-7807-4e02-8391-1e6b1f804988',
    'd7e05de1-0a9c-4cb7-b4cf-2236781041f3',
    'ed1efc04-10e0-4271-9e13-fbb9ecb6ff3d',
    '38164a19-752c-410d-afe8-87487d940b24'
];

function walkJsonl(dir, acc = []) {
    if (!fs.existsSync(dir)) return acc;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walkJsonl(p, acc);
        else if (ent.name.endsWith('.jsonl')) acc.push(p);
    }
    return acc;
}

function orderedFiles() {
    const all = walkJsonl(transcriptRoot);
    const seen = new Set();
    const ordered = [];
    for (const uid of PRIORITY) {
        for (const p of all) {
            if (p.includes(uid) && !seen.has(p)) {
                seen.add(p);
                ordered.push(p);
            }
        }
    }
    for (const p of all.sort()) {
        if (!seen.has(p)) {
            seen.add(p);
            ordered.push(p);
        }
    }
    return ordered;
}

function isTarget(p) {
    return p && p.replace(/\\/g, '/').endsWith(TARGET_SUFFIX);
}

function* iterOps(filePath) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        let obj;
        try {
            obj = JSON.parse(line);
        } catch {
            continue;
        }
        if (obj.role !== 'assistant') continue;
        const content = obj.message?.content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
            if (block.type !== 'tool_use') continue;
            const name = block.name;
            if (name !== 'Write' && name !== 'StrReplace') continue;
            const inp = block.input || {};
            if (!isTarget(inp.path)) continue;
            yield { name, file: path.basename(filePath), line: i + 1, inp };
        }
    }
}

let content = null;
let writes = 0;
let applied = 0;
let skipped = 0;
const failures = [];

for (const file of orderedFiles()) {
    for (const { name, file: fname, line, inp } of iterOps(file)) {
        if (name === 'Write') {
            content = inp.contents ?? '';
            writes += 1;
            console.log(`WRITE ${fname}:${line} (${content.length} chars)`);
            continue;
        }
        const oldStr = inp.old_string;
        const newStr = inp.new_string;
        if (content == null) {
            skipped += 1;
            console.log(`SKIP (no base) ${fname}:${line}`);
            continue;
        }
        if (oldStr == null || newStr == null) {
            skipped += 1;
            continue;
        }
        if (!content.includes(oldStr)) {
            failures.push(`${fname}:${line}`);
            skipped += 1;
            console.log(`FAIL ${fname}:${line} old_string not found (${oldStr.length} chars)`);
            continue;
        }
        content = content.replace(oldStr, newStr);
        applied += 1;
        console.log(`OK ${fname}:${line}`);
    }
}

if (content == null) {
    console.error('No Write base found');
    process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, content, 'utf8');
const lineCount = content.split('\n').length;
console.log(`\nWrote ${outPath}`);
console.log(`  bytes=${Buffer.byteLength(content, 'utf8')} lines=${lineCount}`);
console.log(`  writes=${writes} applied=${applied} skipped=${skipped} failures=${failures.length}`);
if (failures.length) console.log('First failures:', failures.slice(0, 10));
