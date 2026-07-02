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
        cohorts: [],
        essaySubmissions: [
            {
                id: 'e1',
                classId: 'c1',
                syllabusRowId: 'r1',
                records: [
                    { studentId: 's1', status: 'complete' },
                    { studentId: 's2', status: 'submitted' }
                ]
            }
        ]
    };
    const rows = CCPClassroomEssayProgress.listEssayAssignments(appData, {
        classes: appData.classes,
        access: { canEditClass: () => true, canBypass: () => false }
    });
    assert(rows.length === 1, 'one assignment row');
    assert(rows[0].counts.complete === 1, 'complete count');
    assert(rows[0].counts.submitted === 1, 'submitted count');
    const filtered = CCPClassroomEssayProgress.filterAssignments(rows, {
        selectedKeys: new Set([rows[0].key])
    });
    assert(filtered.length === 1, 'selected filter');
}

console.log('classroom-essay-progress.test.mjs: all passed');
