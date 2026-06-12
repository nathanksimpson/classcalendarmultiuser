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

{
    const resolveHomeroomMeta = (classId) => {
        if (classId === 'c1' || classId === 'c2') {
            return { key: 'hr1', label: 'Kim Teacher' };
        }
        if (classId === 'c3') {
            return { key: 'hr2', label: 'Lee Teacher' };
        }
        return { key: api.NO_HOMEROOM_KEY, label: '(No homeroom teacher)' };
    };
    const multiNotes = [
        {
            id: 'n1',
            classId: 'c1',
            date: '2026-06-10',
            text: 'Note A',
            createdAt: '2026-06-10T10:00:00.000Z'
        },
        {
            id: 'n2',
            classId: 'c2',
            date: '2026-06-11',
            text: 'Note B',
            createdAt: '2026-06-11T10:00:00.000Z'
        },
        {
            id: 'n3',
            classId: 'c3',
            date: '2026-06-10',
            text: 'Note C',
            createdAt: '2026-06-10T12:00:00.000Z'
        },
        {
            id: 'n4',
            classId: 'c4',
            date: '2026-06-12',
            text: 'Orphan note',
            createdAt: '2026-06-12T09:00:00.000Z'
        }
    ];
    const hrGroups = api.groupNotesByHomeroom(
        multiNotes,
        ['hr1', 'hr2', api.NO_HOMEROOM_KEY],
        resolveHomeroomMeta,
        ['c1', 'c2', 'c3', 'c4']
    );
    assert(hrGroups.length === 3, 'three homeroom groups');
    assert(hrGroups[0].homeroomKey === 'hr1', 'first homeroom key');
    assert(hrGroups[0].groups.length === 2, 'Kim has two classes');
    assert(hrGroups[0].groups[0].classId === 'c1', 'class order within homeroom');
    assert(hrGroups[2].homeroomKey === api.NO_HOMEROOM_KEY, 'no homeroom last');
    assert(hrGroups[2].groups[0].classId === 'c4', 'orphan class in no-homeroom bucket');
}

{
    const resolveHomeroomMeta = (classId) => {
        if (classId === 'c1' || classId === 'c2') {
            return { key: 'hr1', label: 'Kim Teacher' };
        }
        if (classId === 'c3') {
            return { key: 'hr2', label: 'Lee Teacher' };
        }
        return { key: api.NO_HOMEROOM_KEY, label: '(No homeroom teacher)' };
    };
    const resolveMeta = (classId) => ({
        className: classId === 'c1' ? 'Purple T' : classId === 'c2' ? 'Blue T' : classId === 'c3' ? 'Green M' : 'Orphan',
        subject: 'Speaking'
    });
    const multiNotes = [
        {
            id: 'n1',
            classId: 'c1',
            date: '2026-06-10',
            text: 'Note A',
            createdAt: '2026-06-10T10:30:00.000Z'
        },
        {
            id: 'n2',
            classId: 'c3',
            date: '2026-06-10',
            text: 'Note C',
            createdAt: '2026-06-10T14:00:00.000Z'
        },
        {
            id: 'n3',
            classId: 'c4',
            date: '2026-06-12',
            text: 'Orphan note',
            createdAt: '2026-06-12T09:00:00.000Z'
        }
    ];
    const out = api.formatRangeExportByHomeroom({
        notes: multiNotes,
        classOrderIds: ['c1', 'c3', 'c4'],
        homeroomOrderKeys: ['hr1', 'hr2', api.NO_HOMEROOM_KEY],
        resolveMeta,
        resolveHomeroomMeta,
        formatDate: (d) => d,
        locale: 'en',
        headerTitle: 'Class notes export',
        rangeLabel: '2026-01-01 - 2026-06-30'
    });
    assert(!BAD_CHARS.test(out), 'homeroom range export has no em/box chars');
    assert(out.includes('== Kim Teacher =='), 'homeroom section heading');
    assert(out.includes('-- Purple T - Speaking --'), 'class heading nested under homeroom');
    assert(out.indexOf('Kim Teacher') < out.indexOf('Lee Teacher'), 'homeroom section order');
    assert(out.indexOf('Lee Teacher') < out.indexOf('(No homeroom teacher)'), 'no homeroom section last');
    assert(out.includes('Orphan note'), 'orphan note in export');
}

console.log('day-notes-export.test.mjs: all passed');
