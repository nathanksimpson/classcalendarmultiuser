/**
 * Run: node tests/classroom-essay-resubmit-print.test.mjs
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

const printCode = readFileSync(path.join(root, 'js', 'classroom-essay-resubmit-print.js'), 'utf8');
const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(printCode, sandbox);

const api = sandbox.window.CCPClassroomEssayResubmitPrint;

const labels = {
    title: 'Essay overdue and resubmit report',
    noRows: 'No overdue or resubmit students for this class.',
    sectionOverdue: 'Overdue',
    sectionResubmit: 'Resubmit',
    noStudentsInSection: 'None',
    noReason: '(no note)',
    retestReceived: 'Retest received',
    generatedAt: 'Generated',
    overdue: 'overdue'
};

{
    const html = api.renderDocumentHtml(
        {
            calendarName: 'Main Calendar',
            generatedAt: '2026-07-08',
            groups: [
                {
                    classId: 'c1',
                    className: 'Alpha',
                    classTypeLabel: 'Core',
                    levelLabel: 'L1',
                    assignments: [
                        {
                            assignmentLabel: '2026-07-01 - Essay 1',
                            notSubmitted: [
                                { studentName: 'Amy', ssDueDate: '2026-07-01', ssOverdue: true }
                            ],
                            resubmit: [
                                { studentName: 'Ben', note: 'Fix intro', submittedRetest: true }
                            ]
                        }
                    ]
                }
            ]
        },
        labels
    );

    assert(html.includes('Essay overdue and resubmit report'), 'renders OD-RS title');
    assert(html.includes('Overdue'), 'renders overdue section heading');
    assert(html.includes('Resubmit'), 'renders resubmit section heading');
    assert(html.includes('Amy'), 'renders overdue student');
    assert(html.includes('Ben'), 'renders resubmit student');
    assert(html.includes('Fix intro'), 'renders resubmit note');
    assert(html.includes('Retest received'), 'renders retest marker');
}

{
    const html = api.renderDocumentHtml(
        {
            groups: [
                {
                    classId: 'c2',
                    className: 'Beta',
                    assignments: [
                        {
                            assignmentLabel: '2026-07-02 - Essay 2',
                            notSubmitted: [],
                            resubmit: []
                        }
                    ]
                }
            ]
        },
        labels
    );

    assert(html.includes('None'), 'renders empty subsection label when a section has no students');
}

console.log('classroom-essay-resubmit-print.test.mjs: all passed');
