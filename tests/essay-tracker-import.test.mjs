import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadModules() {
    const sandbox = { window: {}, globalThis: {} };
    sandbox.globalThis = sandbox.window;
    const rosterCode = readFileSync(path.join(root, 'js', 'roster-import.js'), 'utf8');
    const essayCode = readFileSync(path.join(root, 'js', 'essay-tracker-import.js'), 'utf8');
    vm.runInNewContext(rosterCode, sandbox);
    vm.runInNewContext(essayCode, sandbox);
    return {
        RI: sandbox.window.CCPRosterImport,
        EI: sandbox.window.CCPEssayTrackerImport
    };
}

const { RI, EI } = loadModules();

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const sampleTracker = {
    version: 1,
    updatedAt: '2026-06-01T00:00:00.000Z',
    classes: [
        {
            id: 'cls-1',
            name: 'Purple Tue 6/4',
            students: [
                {
                    id: 'uuid-1',
                    index: 1,
                    koreanName: '김나은',
                    englishName: 'Naeun',
                    branch: '잠실',
                    school: 'Test School',
                    grade: '5',
                    flags: { star: true, guardian: false },
                    status: 'submitted',
                    notes: 'note one'
                },
                {
                    id: 'uuid-2',
                    index: 2,
                    koreanName: '이준호',
                    englishName: 'Junho',
                    branch: '잠실',
                    flags: { star: false },
                    status: 'not_submitted'
                }
            ]
        },
        {
            id: 'cls-2',
            name: 'Empty Class',
            students: []
        }
    ]
};

assert(EI.isEssayTrackerPack(sampleTracker), 'detect essay tracker pack');
const parsed = EI.parseEssayTrackerPack(sampleTracker);
assert(!parsed.error, parsed.error || 'parse ok');
assert(parsed.pack.source === 'essay-homework-tracker', 'source tag');
assert(parsed.pack.mergeByName === true, 'mergeByName flag');
assert(parsed.pack.cohorts.length === 1, 'only class with students');
assert(parsed.pack.cohorts[0].cohortName === 'Purple Tue 6/4', 'class name');
assert(parsed.pack.cohorts[0].students.length === 2, 'student count');

const s0 = parsed.pack.cohorts[0].students[0];
assert(s0.name === '김나은' && s0.nameEn === 'Naeun', 'name mapping');
assert(s0.locationTag === '잠실', 'branch mapping');
assert(s0.tags.includes('interested'), 'star → interested tag');
assert(s0.memo.includes('Test School'), 'memo includes school');

const viaRouter = RI.parseImportFile(sampleTracker);
assert(!viaRouter.error, 'parseImportFile routes essay tracker');
assert(viaRouter.pack.cohorts.length === 1, 'router cohort count');

const calendarCohorts = [
    {
        id: 'cohort-purple',
        name: 'Purple Tue 6/4',
        students: [
            {
                id: 'stu-existing-1',
                name: '김나은',
                nameEn: 'Naeun',
                sortOrder: 1,
                active: true,
                tags: [],
                memo: ''
            }
        ]
    }
];

const plan = RI.matchImportCohorts(viaRouter.pack.cohorts, calendarCohorts).map((row) =>
    Object.assign({}, row, { mergeByName: true, userAction: 'map', userTargetId: 'cohort-purple' })
);
const preview = RI.computeImportPreview(plan, calendarCohorts)[0];
assert(preview.preview.updated === 1, 'name match counts as update');
assert(preview.preview.added === 1, 'new student counts as added');

const applied = RI.applyRosterImport(calendarCohorts, plan, {
    newId: () => 'cohort-new',
    newStudentId: () => 'stu-new-1'
});
assert(!applied.error, applied.error || 'apply ok');
const merged = applied.cohorts.find((c) => c.id === 'cohort-purple');
assert(merged.students.length === 2, 'merge replace keeps two students');
assert(
    merged.students.some((s) => s.id === 'stu-existing-1' && s.name === '김나은'),
    'existing id preserved by name'
);

console.log('essay-tracker-import.test.mjs: all passed');
