/**
 * Run: node tests/day-notes-export.test.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadDayNotes() {
    const utilsCode = readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
    const dayNotesCode = readFileSync(path.join(root, 'js', 'day-notes.js'), 'utf8');
    const sandbox = { window: {}, globalThis: {} };
    sandbox.window.globalThis = sandbox.globalThis;
    sandbox.globalThis.window = sandbox.window;
    vm.runInNewContext(utilsCode, sandbox);
    vm.runInNewContext(dayNotesCode, sandbox);
    return sandbox.window.CCPDayNotes;
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const api = loadDayNotes();
const BAD_CHARS = /[\u2014\u2013\u2500\u2550]/;

const sampleNotes = [
    {
        id: 'n1',
        classId: 'c1',
        date: '2026-06-10',
        text: 'Discussed unit 1 \u2014 pages 8\u201311',
        createdAt: '2026-06-10T10:30:00.000Z'
    },
    {
        id: 'n2',
        classId: 'c2',
        date: '2026-06-10',
        text: '\uD55C\uAE00 \uBA54\uBAA8',
        createdAt: '2026-06-10T14:00:00.000Z'
    }
];

const resolveMeta = (classId) => ({
    className: classId === 'c1' ? 'Purple T' : 'Green M',
    subject: 'Speaking'
});

{
    const out = api.formatExportText({
        dateStr: '2026-06-10',
        notes: sampleNotes,
        resolveMeta,
        locale: 'en',
        headerTitle: 'Daily class notes'
    });
    assert(!BAD_CHARS.test(out), 'single-day export has no em/box chars');
    assert(out.includes('2026-06-10 - Daily class notes'), 'ASCII date header');
    assert(out.includes('--------------------------------'), 'ASCII separator');
    assert(out.includes('Discussed unit 1 - pages 8-11'), 'note body dashes normalized');
    assert(out.includes('\uD55C\uAE00 \uBA54\uBAA8'), 'Korean note preserved');
    assert(out.includes('Purple T - Speaking'), 'class line ASCII');
    assert(/\[\d/.test(out), 'time bracket in export');
}

{
    const out = api.formatRangeExportByClass({
        notes: sampleNotes,
        classOrderIds: ['c1', 'c2'],
        resolveMeta,
        formatDate: (d) => d,
        locale: 'en',
        headerTitle: 'Class notes export',
        rangeLabel: '2026-01-01 - 2026-06-30'
    });
    assert(!BAD_CHARS.test(out), 'range export has no em/box chars');
    assert(out.includes('========================================'), 'ASCII range separator');
    assert(out.includes('-- Purple T - Speaking --'), 'ASCII class heading');
    assert(out.indexOf('Purple T') < out.indexOf('Green M'), 'class group order preserved');
}

console.log('day-notes-export.test.mjs: all passed');
