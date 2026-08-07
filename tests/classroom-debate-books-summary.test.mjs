/**
 * Run: node tests/classroom-debate-books-summary.test.mjs
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import vm from 'vm';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox.window;

await import(pathToFileURL(path.join(root, 'js', 'debate-periods.js')).href);
vm.runInNewContext(readFileSync(path.join(root, 'js', 'classroom-domain.js'), 'utf8'), sandbox);
vm.runInNewContext(
    readFileSync(path.join(root, 'js', 'classroom-essay-class-summary.js'), 'utf8'),
    sandbox
);
vm.runInNewContext(
    readFileSync(path.join(root, 'js', 'classroom-debate-books-summary.js'), 'utf8'),
    sandbox
);
vm.runInNewContext(
    readFileSync(path.join(root, 'js', 'classroom-debate-books-summary-print.js'), 'utf8'),
    sandbox
);

const d = sandbox.window.CCPClassroomDomain;
const summary = sandbox.window.CCPClassroomDebateBooksSummary;
const printApi = sandbox.window.CCPClassroomDebateBooksSummaryPrint;

const appData = {
    classes: [
        {
            id: 'cls1',
            name: 'Alpha',
            cohortIds: ['coh1'],
            scheduleModel: 'debateMonthly',
            startDate: '2026-03-01',
            endDate: '2026-03-31',
            book: 'Purple Book',
            homeroomTeacherName: 'Kim HR'
        }
    ],
    cohorts: [
        {
            id: 'coh1',
            name: 'A',
            homeroomTeacherName: 'Kim HR',
            students: [
                { id: 's1', name: 'Student One', active: true },
                { id: 's2', name: 'Student Two', active: true }
            ]
        }
    ],
    debateBookDistributions: [
        {
            id: 'dbd1',
            classId: 'cls1',
            periodKey: '2026-03',
            bookTitle: 'Purple Book',
            records: [
                { studentId: 's1', status: 'issued', note: '' },
                { studentId: 's2', status: 'missing', note: 'lost' }
            ]
        }
    ]
};

const entries = d.listDebateBookSummaryEntries(appData, { skipEmptyRoster: true });
assert(entries.length === 1, 'one summary entry');
assert(summary.filterEntriesByHrAndMonth(entries, appData, { month: '2026-03' }).length === 1, 'month filter');
assert(summary.normalizeWarnMode('bogus') === 'all', 'warn normalize');

const rows = summary.listRowsForEntries(appData, entries);
assert(rows.length === 2, 'two student rows');
const attentionRows = summary.filterRowsByWarnMode(rows, 'attention');
assert(attentionRows.length === 1 && attentionRows[0].status === 'missing', 'attention filter');

const groups = summary.groupRowsByHomeroom(attentionRows, appData, { warnMode: 'attention' });
assert(groups.length === 1, 'one HR group');
assert(groups[0].classes[0].periods[0].students.length === 1, 'one student in group');

const labels = {
    title: 'Books class summary',
    noStudents: 'None',
    noStudentsInSection: 'None',
    noHomeroom: 'No homeroom',
    hrHeading: '== HR: {name} ==',
    colStudent: 'Student',
    colStatus: 'Status',
    colNotes: 'Notes',
    statusLabels: {
        not_issued: 'Not issued',
        issued: 'Issued',
        missing: 'Missing'
    }
};
const html = printApi.renderDocumentHtml({ groups, generatedAt: '2026-03-15' }, labels);
assert(html.includes('Student Two'), 'print html includes student');
assert(html.includes('Missing'), 'print html includes status');

const copyText = summary.formatCopyText(groups, labels);
assert(copyText.includes('Student Two'), 'copy text includes student');

console.log('classroom-debate-books-summary.test.mjs: ok');
