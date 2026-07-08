/**
 * Run: node tests/classroom-essay-resubmit-summary.test.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

const domainCode = readFileSync(path.join(root, 'js', 'classroom-domain.js'), 'utf8');
const summaryCode = readFileSync(path.join(root, 'js', 'classroom-essay-resubmit-summary.js'), 'utf8');
const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(domainCode, sandbox);
vm.runInNewContext(summaryCode, sandbox);

const { CCPClassroomEssayResubmitSummary, CCPClassroomDomain } = sandbox.window;

{
    const classes = [
        {
            id: 'c1',
            name: 'Alpha',
            classTypeId: 't1',
            grade: '5',
            teacherIds: ['u1'],
            syllabusRows: [{ kind: 'lesson', date: '2026-06-01', planTitle: 'Essay 1', trackEssay: true, id: 'row1' }]
        },
        {
            id: 'c2',
            name: 'Beta',
            classTypeId: 't2',
            grade: '6',
            teacherIds: ['u2'],
            syllabusRows: []
        }
    ];
    const appData = {
        classes,
        cohorts: [],
        essaySubmissions: [
            {
                classId: 'c1',
                syllabusRowId: 'row1',
                records: [{ studentId: 's1', status: 'resubmit_required', note: 'fix', submittedRetest: false }]
            }
        ],
        classTypes: [{ id: 't1', label: 'Type A' }]
    };
    const filtered = CCPClassroomEssayResubmitSummary.filterClassesForSummary(classes, appData, {
        hasResubmitsOnly: true,
        currentUserId: 'u1'
    });
    assert(filtered.length === 1 && filtered[0].id === 'c1', 'filters to classes with resubmits');

    const rows = CCPClassroomEssayResubmitSummary.listResubmitRows(appData, { classes });
    assert(rows.length === 1 && rows[0].studentId === 's1', 'lists resubmit rows');

    const selected = CCPClassroomEssayResubmitSummary.filterResubmitRows(rows, {
        selectedClassIds: new Set(['c1'])
    });
    assert(selected.length === 1, 'filters rows by selected class');

    const groups = CCPClassroomEssayResubmitSummary.groupResubmitRowsByClass(selected);
    assert(groups.length === 1 && groups[0].assignments.length === 1, 'groups by class and assignment');
}

console.log('classroom-essay-resubmit-summary.test.mjs: ok');
