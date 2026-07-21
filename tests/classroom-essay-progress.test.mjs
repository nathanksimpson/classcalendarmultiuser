/**
 * Run: node tests/classroom-essay-progress.test.mjs
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
const progressCode = readFileSync(path.join(root, 'js', 'classroom-essay-progress.js'), 'utf8');
const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(domainCode, sandbox);
vm.runInNewContext(progressCode, sandbox);

const { CCPClassroomEssayProgress } = sandbox.window;
const d = sandbox.window.CCPClassroomDomain;

const today = d.todayISO();
const pastDate = d.addDaysISO(today, -10);
const futureDate = d.addDaysISO(today, 10);

{
    const appData = {
        classes: [
            {
                id: 'c1',
                name: 'Alpha',
                syllabusRows: [
                    {
                        id: 'r1',
                        kind: 'lesson',
                        date: pastDate,
                        planTitle: 'Essay Day 1',
                        homework: 'essay draft'
                    },
                    {
                        id: 'rFuture',
                        kind: 'lesson',
                        date: futureDate,
                        planTitle: 'Essay Future',
                        homework: 'essay draft'
                    }
                ]
            }
        ],
        cohorts: [
            {
                id: 'coh1',
                students: [
                    { id: 's1', name: 'Amy', sortOrder: 0, active: true },
                    { id: 's2', name: 'Ben', sortOrder: 1, active: true },
                    { id: 's3', name: 'Cal', sortOrder: 2, active: true }
                ]
            }
        ],
        essaySubmissions: [
            {
                id: 'e1',
                classId: 'c1',
                syllabusRowId: 'r1',
                records: [
                    { studentId: 's1', status: 'complete' },
                    { studentId: 's2', status: 'submitted' },
                    { studentId: 's3', status: 'resubmit_required', note: 'Fix intro' }
                ]
            }
        ]
    };
    appData.classes[0].cohortIds = ['coh1'];

    const rows = CCPClassroomEssayProgress.listEssayAssignments(appData, {
        classes: appData.classes,
        access: { canEditClass: () => true, canBypass: () => false }
    });
        assert(rows.length === 2, 'two assignment rows (past + future)');
        const pastRow = rows.find((r) => r.isPastDueStrict === true);
        assert(!!pastRow, 'found past-due assignment row');
        assert(pastRow.counts.complete === 1, 'complete count on past row');
        assert(pastRow.counts.submitted === 1, 'submitted count on past row');
        assert(pastRow.hasOutstandingStudents === true, 'past row has outstanding students');
        assert(pastRow.outstandingStudentCount === 1, 'past row has exactly one outstanding resubmit');

    const filtered = CCPClassroomEssayProgress.filterAssignments(rows, {
            selectedKeys: new Set(rows.map((r) => r.key)),
        outstandingOnly: true
    });
        assert(filtered.length === 1, 'outstanding-only + past-due filters out future rows');
        assert(filtered[0].key === pastRow.key, 'filtered row is the past-due one');

    const studentRows = CCPClassroomEssayProgress.listStudentProgressForAssignments(
        appData,
        filtered
    );
    assert(studentRows.length === 1, 'one outstanding student row');
    assert(studentRows[0].status === 'resubmit_required', 'resubmit student is outstanding');

    appData.cohorts[0].students.push({ id: 's4', name: 'Dana', sortOrder: 3, active: true });

    const studentRows2 = CCPClassroomEssayProgress.listStudentProgressForAssignments(
        appData,
        filtered
    );
    assert(studentRows2.length === 2, 'roster student without record is not submitted');
    const grouped = CCPClassroomEssayProgress.groupStudentProgressForReport(studentRows2);
    assert(grouped.length === 1, 'one class group');
    assert(grouped[0].assignments.length === 1, 'one assignment group');
    assert(grouped[0].assignments[0].notSubmitted.length === 1, 'one not submitted');
    assert(grouped[0].assignments[0].resubmit.length === 1, 'one resubmit');
}

{
    const outstanding = d.listEssayOutstandingStudentRows(
        {
            classes: [
                {
                    id: 'c2',
                    name: 'Beta',
                    cohortIds: ['coh2'],
                    syllabusRows: [
                        {
                            id: 'r2',
                            kind: 'lesson',
                            date: '2026-07-01',
                            planTitle: 'Essay 2',
                            homework: 'essay'
                        }
                    ]
                }
            ],
            cohorts: [
                {
                    id: 'coh2',
                    students: [{ id: 's10', name: 'Zoe', sortOrder: 0, active: true }]
                }
            ],
            essaySubmissions: []
        },
        {}
    );
    assert(outstanding.length === 1, 'roster student without submission counts as not submitted');
    assert(outstanding[0].studentName === 'Zoe', 'student name resolved');
}

{
    const appData = {
        classes: [
            {
                id: 'c3',
                name: 'Gamma',
                cohortIds: ['coh3'],
                syllabusRows: [
                    {
                        id: 'r3',
                        kind: 'lesson',
                        date: pastDate,
                        planTitle: 'Essay Closed',
                        homework: 'essay draft'
                    }
                ]
            }
        ],
        cohorts: [
            {
                id: 'coh3',
                students: [
                    { id: 'a1', name: 'Ann', sortOrder: 0, active: true },
                    { id: 'a2', name: 'Bob', sortOrder: 1, active: true },
                    { id: 'a3', name: 'Cat', sortOrder: 2, active: true },
                    { id: 'a4', name: 'Dan', sortOrder: 3, active: true }
                ]
            }
        ],
        essaySubmissions: [
            {
                id: 'e3',
                classId: 'c3',
                syllabusRowId: 'r3',
                ssDueDate: pastDate,
                records: [
                    { studentId: 'a1', status: 'complete' },
                    { studentId: 'a2', status: 'incomplete' },
                    { studentId: 'a3', status: 'exempt' },
                    { studentId: 'a4', status: 'not_submitted' }
                ]
            }
        ]
    };

    const rows = CCPClassroomEssayProgress.listEssayAssignments(appData, {
        classes: appData.classes,
        access: { canEditClass: () => true, canBypass: () => false }
    });
    assert(rows.length === 1, 'one closed-status assignment');
    assert(rows[0].outstandingStudentCount === 1, 'only not_submitted is outstanding');
    assert(rows[0].percentComplete === 33, 'percent = complete / (total - exempt) → 1/3');
    assert(rows[0].counts.incomplete === 1, 'incomplete counted');
    assert(rows[0].counts.exempt === 1, 'exempt counted');

    const studentRows = CCPClassroomEssayProgress.listStudentProgressForAssignments(appData, rows);
    assert(studentRows.length === 1, 'outstanding list omits incomplete and exempt');
    assert(studentRows[0].studentId === 'a4', 'remaining outstanding is not_submitted');
}

console.log('classroom-essay-progress.test.mjs: all passed');
