/**
 * Run: node tests/classroom-essay-class-summary.test.mjs
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
const summaryCode = readFileSync(
    path.join(root, 'js', 'classroom-essay-class-summary.js'),
    'utf8'
);
const printCode = readFileSync(
    path.join(root, 'js', 'classroom-essay-class-summary-print.js'),
    'utf8'
);
const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(domainCode, sandbox);
vm.runInNewContext(summaryCode, sandbox);
vm.runInNewContext(printCode, sandbox);

const d = sandbox.window.CCPClassroomDomain;
const summary = sandbox.window.CCPClassroomEssayClassSummary;
const printApi = sandbox.window.CCPClassroomEssayClassSummaryPrint;

const today = d.todayISO();
const pastDate = d.addDaysISO(today, -5);

const appData = {
    classes: [
        {
            id: 'c1',
            name: 'Alpha',
            cohortIds: ['coh1'],
            syllabusRows: [
                {
                    id: 'r1',
                    kind: 'lesson',
                    date: pastDate,
                    planTitle: 'Essay Day 1',
                    homework: 'essay draft'
                },
                {
                    id: 'r2',
                    kind: 'lesson',
                    date: pastDate,
                    planTitle: 'Essay Day 2',
                    homework: 'essay draft'
                }
            ]
        },
        {
            id: 'c2',
            name: 'Beta',
            cohortIds: ['coh2'],
            syllabusRows: [
                {
                    id: 'r3',
                    kind: 'lesson',
                    date: pastDate,
                    planTitle: 'Beta Essay',
                    homework: 'essay draft'
                }
            ]
        },
        {
            id: 'c3',
            name: 'Gamma No HR',
            cohortIds: ['coh3'],
            syllabusRows: [
                {
                    id: 'r4',
                    kind: 'lesson',
                    date: pastDate,
                    planTitle: 'Gamma Essay',
                    homework: 'essay draft'
                }
            ]
        }
    ],
    cohorts: [
        {
            id: 'coh1',
            homeroomTeacherUserId: 'hr-kim',
            homeroomTeacherName: 'Kim',
            students: [
                { id: 's1', name: 'Amy', nameEn: 'Amy En', sortOrder: 0, active: true },
                { id: 's2', name: 'Ben', sortOrder: 1, active: true }
            ]
        },
        {
            id: 'coh2',
            homeroomTeacherUserId: 'hr-park',
            homeroomTeacherName: 'Park',
            students: [{ id: 's3', name: 'Cal', sortOrder: 0, active: true }]
        },
        {
            id: 'coh3',
            students: [{ id: 's4', name: 'Deb', sortOrder: 0, active: true }]
        }
    ],
    essaySubmissions: [
        {
            id: 'e1',
            classId: 'c1',
            syllabusRowId: 'r1',
            records: [
                { studentId: 's1', status: 'complete' },
                {
                    studentId: 's2',
                    status: 'resubmit_required',
                    note: 'Fix intro',
                    submittedRetest: true
                }
            ]
        },
        {
            id: 'e2',
            classId: 'c1',
            syllabusRowId: 'r2',
            records: [
                { studentId: 's1', status: 'exempt' },
                { studentId: 's2', status: 'submitted' }
            ]
        },
        {
            id: 'e3',
            classId: 'c2',
            syllabusRowId: 'r3',
            records: [{ studentId: 's3', status: 'incomplete' }]
        },
        {
            id: 'e4',
            classId: 'c3',
            syllabusRowId: 'r4',
            records: [{ studentId: 's4', status: 'not_submitted' }]
        }
    ]
};

{
    const allRows = d.listEssayClassSummaryRows(appData, { classes: appData.classes });
    assert(allRows.length === 6, `expected 6 full roster rows, got ${allRows.length}`);
    const statuses = new Set(allRows.map((r) => r.status));
    assert(statuses.has('complete'), 'includes complete');
    assert(statuses.has('exempt'), 'includes exempt');
    assert(statuses.has('incomplete'), 'includes incomplete');
    assert(statuses.has('resubmit_required'), 'includes resubmit');
}

{
    const assignments = [
        { key: 'c1|r1', classId: 'c1', syllabusRowId: 'r1' },
        { key: 'c2|r3', classId: 'c2', syllabusRowId: 'r3' },
        { key: 'c3|r4', classId: 'c3', syllabusRowId: 'r4' }
    ];
    const rows = summary.listRowsForAssignments(appData, assignments);
    assert(rows.length === 4, `filtered to 4 rows (not r2), got ${rows.length}`);
    assert(
        !rows.some((r) => r.syllabusRowId === 'r2'),
        'assignment filter excludes unselected r2'
    );

    const groups = summary.groupRowsByHomeroom(rows, appData);
    assert(groups.length === 3, `expected 3 HR groups (Kim, Park, no HR), got ${groups.length}`);
    assert(groups[0].homeroomLabel === 'Kim' || groups[0].homeroomKey === 'hr-kim', 'Kim first or labeled');
    assert(groups[groups.length - 1].homeroomKey === summary.NO_HOMEROOM_KEY, 'no-HR last');

    const labels = {
        noHomeroom: 'No homeroom',
        hrHeading: '== HR Teacher: {name} ==',
        retestReceived: 'Retest received',
        overdue: 'overdue',
        noStudents: 'No students',
        statusLabels: {
            not_submitted: 'Not submitted',
            submitted: 'Received',
            complete: 'Complete',
            resubmit_required: 'Needs resubmit',
            incomplete: 'Inc.',
            exempt: 'Exempt'
        }
    };
    const text = summary.formatCopyText(groups, labels);
    assert(text.includes('== HR Teacher: Kim =='), 'copy has Kim heading');
    assert(text.includes('== HR Teacher: Park =='), 'copy has Park heading');
    assert(text.includes('== HR Teacher: No homeroom =='), 'copy has no-HR heading');
    assert(text.includes('Complete'), 'copy includes Complete status');
    assert(text.includes('Amy (Amy En)'), 'copy includes Korean (English) when nameEn set');
    assert(text.includes('Ben\t') || text.includes('Ben '), 'copy includes Korean-only when no nameEn');
    assert(!text.includes('Ben ('), 'Korean-only student has no empty English paren');
    assert(text.includes('Fix intro'), 'copy includes resubmit note');
    assert(text.includes('Retest received'), 'copy includes retest chip text');
    assert(text.includes('Inc.'), 'copy includes incomplete');
    assert(text.includes('Not submitted'), 'copy includes not submitted');
    assert(!text.includes('Essay Day 2'), 'filtered copy excludes unselected Day 2 assignment');
    assert(!text.includes('\u2014') && !text.includes('\u2013'), 'copy has no em/en dashes');
    assert(text.includes(' - '), 'copy uses ASCII hyphen separators');
}

{
    const onlyR2 = summary.listRowsForAssignments(appData, [
        { key: 'c1|r2', classId: 'c1', syllabusRowId: 'r2' }
    ]);
    const groups = summary.groupRowsByHomeroom(onlyR2, appData);
    const labels = {
        noHomeroom: 'No homeroom',
        statusLabels: {
            exempt: 'Exempt',
            submitted: 'Received'
        }
    };
    const text = summary.formatCopyText(groups, labels);
    assert(text.includes('Exempt'), 'filtered r2 includes exempt');
    assert(text.includes('Received'), 'filtered r2 includes received');
    assert(!text.includes('Fix intro'), 'filtered r2 excludes r1 note');
}

{
    const rows = summary.listRowsForAssignments(appData, [
        { key: 'c1|r1', classId: 'c1', syllabusRowId: 'r1' }
    ]);
    const groups = summary.groupRowsByHomeroom(rows, appData);
    const html = printApi.renderDocumentHtml(
        { groups, generatedAt: today, calendarName: 'Test Cal' },
        {
            title: 'Essay class summary',
            generatedAt: 'Generated',
            noHomeroom: 'No homeroom',
            colStudent: 'Student',
            colStatus: 'Status',
            colDue: 'Due',
            colNotes: 'Notes',
            retestReceived: 'Retest received',
            overdue: 'overdue',
            noStudents: 'None',
            statusLabels: {
                complete: 'Complete',
                resubmit_required: 'Needs resubmit'
            }
        }
    );
    assert(html.includes('essay-class-summary-status-chip'), 'print has status chips');
    assert(html.includes('essay-status--complete'), 'print has complete chip class');
    assert(html.includes('essay-status--resubmit'), 'print has resubmit chip class');
    assert(html.includes('Amy (Amy En)'), 'print includes Korean (English)');
    assert(html.includes('Fix intro'), 'print includes note');
    assert(html.includes('Retest received'), 'print includes retest');
    assert(!!printApi.PRINT_STYLES, 'print styles exported');
}

{
    const assignments = [
        { key: 'c1|r1', classId: 'c1', className: 'Alpha', ssDueDate: '2026-03-15' },
        { key: 'c1|r2', classId: 'c1', className: 'Alpha', ssDueDate: '2026-04-01' },
        { key: 'c2|r3', classId: 'c2', className: 'Beta', ssDueDate: '2026-03-20' },
        { key: 'c3|r4', classId: 'c3', className: 'Gamma No HR', ssDueDate: '2026-03-10' }
    ];
    assert(summary.monthKeyFromDueDate('2026-03-15') === '2026-03', 'monthKeyFromDueDate');
    assert(summary.monthKeyFromDueDate('') === '', 'empty due → empty month');

    const months = summary.listMonthFilterOptions(assignments);
    assert(months[0] === '2026-04', 'months newest first');
    assert(months.includes('2026-03'), 'includes March');

    const hrs = summary.listHomeroomFilterOptions(assignments, appData);
    assert(hrs.some((h) => h.key === 'hr-kim'), 'HR options include Kim');
    assert(hrs.some((h) => h.key === 'hr-park'), 'HR options include Park');
    assert(hrs.some((h) => h.key === summary.NO_HOMEROOM_KEY), 'HR options include no-HR');
    assert(hrs[hrs.length - 1].key === summary.NO_HOMEROOM_KEY, 'no-HR last in options');

    const byMonth = summary.filterAssignmentsByHrAndMonth(assignments, appData, {
        month: '2026-03'
    });
    assert(byMonth.length === 3, 'month filter keeps March dues');
    assert(
        byMonth.every((r) => summary.monthKeyFromDueDate(r.ssDueDate) === '2026-03'),
        'all kept rows are March'
    );

    const byHr = summary.filterAssignmentsByHrAndMonth(assignments, appData, {
        homeroomKey: 'hr-kim'
    });
    assert(byHr.length === 2, 'HR Kim keeps Alpha assignments');
    assert(byHr.every((r) => r.classId === 'c1'), 'Kim filter is Alpha only');

    const byNoHr = summary.filterAssignmentsByHrAndMonth(assignments, appData, {
        homeroomKey: summary.NO_HOMEROOM_KEY
    });
    assert(byNoHr.length === 1 && byNoHr[0].classId === 'c3', 'no-HR filter keeps Gamma');

    const combined = summary.filterAssignmentsByHrAndMonth(assignments, appData, {
        homeroomKey: 'hr-kim',
        month: '2026-03'
    });
    assert(combined.length === 1 && combined[0].key === 'c1|r1', 'HR + month AND together');
}

console.log('classroom-essay-class-summary.test.mjs: ok');
