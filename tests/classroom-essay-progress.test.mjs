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
                        date: '2026-06-25',
                        planTitle: 'Essay Day 1',
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
    assert(rows.length === 1, 'one assignment row');
    assert(rows[0].counts.complete === 1, 'complete count');
    assert(rows[0].counts.submitted === 1, 'submitted count');
    assert(rows[0].hasOutstandingStudents === true, 'has outstanding students');
    assert(rows[0].outstandingStudentCount === 1, 'one resubmit outstanding');

    const filtered = CCPClassroomEssayProgress.filterAssignments(rows, {
        selectedKeys: new Set([rows[0].key]),
        outstandingOnly: true
    });
    assert(filtered.length === 1, 'selected filter');

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

console.log('classroom-essay-progress.test.mjs: all passed');
