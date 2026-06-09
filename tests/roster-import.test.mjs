import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadRosterImport() {
    const code = readFileSync(path.join(root, 'js', 'roster-import.js'), 'utf8');
    const sandbox = { window: {}, globalThis: {} };
    vm.runInNewContext(code, sandbox);
    return sandbox.window.CCPRosterImport;
}

const RI = loadRosterImport();
const FIXTURE = readFileSync(path.join(__dirname, 'fixtures', 'roster-paste-jun2026.txt'), 'utf8');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

function findStudent(result, cohortName, studentName) {
    const cohort = result.cohorts.find((c) => c.cohortName === cohortName);
    assert(cohort, `cohort ${cohortName}`);
    const student = cohort.students.find((s) => s.name === studentName);
    assert(student, `student ${studentName} in ${cohortName}`);
    return student;
}

// Full fixture counts
{
    const result = RI.parseRosterPaste(FIXTURE);
    const total = result.cohorts.reduce((n, c) => n + c.students.length, 0);
    assert(result.cohorts.length === 15, `expected 15 cohorts, got ${result.cohorts.length}`);
    assert(total === 103, `expected 103 students, got ${total}`);

    const expectedCounts = {
        'Bada T': 2,
        'Garam T': 3,
        'Yeoul T': 10,
        'Saemmul T': 8,
        'Purple T': 12,
        'Navy T': 7,
        'Blue T': 6,
        'Orange M': 5,
        'Green M': 8,
        'Navy M': 9,
        'Purple M': 7,
        'Saemmul M': 14,
        'Yeoul M': 7,
        'Garam M': 4,
        'Byeolmaru M': 1
    };
    for (const [name, count] of Object.entries(expectedCounts)) {
        const cohort = result.cohorts.find((c) => c.cohortName === name);
        assert(cohort && cohort.students.length === count, `${name}: expected ${count}, got ${cohort?.students.length}`);
    }
}

// Stable ids
{
    const a = RI.parseRosterPaste(FIXTURE);
    const b = RI.parseRosterPaste(FIXTURE);
    assert(
        JSON.stringify(a.cohorts[0].students[0]) === JSON.stringify(b.cohorts[0].students[0]),
        'stable student records'
    );
    assert(a.cohorts[0].students[0].id === 'stu-bada-t-01', 'bada t first id');
}

// Edge cases
{
    const result = RI.parseRosterPaste(FIXTURE);

    const yongju = findStudent(result, 'Yeoul T', '조용준★');
    assert(yongju.nameEn === 'Yongju', 'yongju nameEn');
    assert(yongju.memo === '수호X', 'yongju memo');
    assert(yongju.locationTag === '잠실', 'yongju location');

    const tony = findStudent(result, 'Yeoul T', '김서진B');
    assert(tony.nameEn === 'Tony', 'kim seojin B');

    const ellena = findStudent(result, 'Saemmul T', '김서진A');
    assert(ellena.nameEn === 'Ellena', 'kim seojin A');

    const jihang = findStudent(result, 'Green M', '이지행');
    assert(jihang.nameEn === '', 'ijihang empty english');
    assert(jihang.memo.includes('수호X'), 'ijihang suho memo');

    const haan = findStudent(result, 'Byeolmaru M', '이하안');
    assert(haan.nameEn === 'Ha-an', 'byeolmaru ha-an');

    const ahRin = findStudent(result, 'Purple T', '김아린★');
    assert(ahRin.memo === '수호O', 'ah-rin suho');

    // Noise not captured as names
    for (const cohort of result.cohorts) {
        for (const s of cohort.students) {
            assert(s.name !== 'Test Point', 'no Test Point name');
            assert(s.name !== 'SMS', 'no SMS name');
            assert(s.name !== '촬영 알림', 'no recording alert name');
        }
    }
}

// normalizeCohortLabel
{
    assert(RI.normalizeCohortLabel('Purple T') === RI.normalizeCohortLabel('PurpleT'), 'purple t normalized');
    assert(RI.normalizeCohortLabel('Yeoul T') === RI.normalizeCohortLabel('YeoulT'), 'yeoul t normalized');
}

// parseRosterPack (amalgamated JSON export)
{
    const json = JSON.parse(readFileSync(path.join(root, 'data', 'roster-import-jun2026.json'), 'utf8'));
    const parsed = RI.parseRosterPack(json);
    assert(!parsed.error, parsed.error || 'parse pack');
    assert(parsed.pack.cohorts.length === 15, 'pack cohort count');
    const totalStudents = parsed.pack.cohorts.reduce((n, c) => n + c.students.length, 0);
    assert(totalStudents === 103, `expected 103 students in amalgamated JSON, got ${totalStudents}`);
}

// matchImportCohorts
{
    const calendarCohorts = [
        { id: 'c-purple', name: 'PurpleT', students: [] },
        { id: 'c-yeoul', name: 'YeoulT', students: [] },
        { id: 'c-bada', name: 'Bada T', students: [] }
    ];
    const importCohorts = [
        { cohortName: 'Purple T', students: [{ id: 's1', name: 'A', sortOrder: 0, active: true, tags: [] }] },
        { cohortName: 'Yeoul T', students: [{ id: 's2', name: 'B', sortOrder: 0, active: true, tags: [] }] },
        { cohortId: 'c-bada', cohortName: 'Bada T', students: [{ id: 's3', name: 'C', sortOrder: 0, active: true, tags: [] }] },
        { cohortName: 'Unknown X', students: [{ id: 's4', name: 'D', sortOrder: 0, active: true, tags: [] }] }
    ];
    const plan = RI.matchImportCohorts(importCohorts, calendarCohorts);
    const purple = plan.find((r) => r.importCohortName === 'Purple T');
    const yeoul = plan.find((r) => r.importCohortName === 'Yeoul T');
    const bada = plan.find((r) => r.importCohortName === 'Bada T');
    const unknown = plan.find((r) => r.importCohortName === 'Unknown X');
    assert(purple.matchStatus === 'normalized' && purple.userTargetId === 'c-purple', 'purple normalized match');
    assert(yeoul.matchStatus === 'normalized', 'yeoul normalized');
    assert(bada.matchStatus === 'byId', 'bada by id');
    assert(unknown.matchStatus === 'unmatched' && unknown.userAction === 'choose', 'unknown unmatched');
}

// applyRosterImport replace / merge / skip / create
{
    const calendar = [
        {
            id: 'c1',
            name: 'PurpleT',
            students: [
                { id: 's-old', name: 'Old', sortOrder: 0, active: true, tags: [], memo: '' },
                { id: 's-shared', name: 'Was', sortOrder: 1, active: true, tags: [], memo: '' }
            ]
        }
    ];
    const impStudents = [
        { id: 's-shared', name: 'Updated', sortOrder: 0, active: true, tags: [], memo: '' },
        { id: 's-new', name: 'New', sortOrder: 1, active: true, tags: [], memo: '' }
    ];
    const basePlan = [
        {
            importKey: 'name:Purple T',
            importCohortName: 'Purple T',
            students: impStudents,
            userAction: 'map',
            userTargetId: 'c1',
            mergeMode: 'replace'
        }
    ];
    const replaced = RI.applyRosterImport(calendar, basePlan);
    assert(!replaced.error, 'replace ok');
    assert(replaced.cohorts[0].students.length === 2, 'replace count');
    assert(!replaced.cohorts[0].students.find((s) => s.id === 's-old'), 'old removed on replace');

    const merged = RI.applyRosterImport(calendar, [{ ...basePlan[0], mergeMode: 'merge' }]);
    assert(merged.cohorts[0].students.length === 3, 'merge keeps old + updates');

    const skipped = RI.applyRosterImport(calendar, [{ ...basePlan[0], userAction: 'skip' }]);
    assert(skipped.cohorts[0].students.length === 2, 'skip unchanged');

    const created = RI.applyRosterImport(calendar, [
        {
            importCohortName: 'New Cohort',
            students: impStudents,
            userAction: 'create',
            mergeMode: 'replace'
        }
    ], { newId: () => 'c-new', homeroomTeacherUserId: 'u1' });
    assert(created.cohorts.length === 2, 'create adds cohort');
    assert(created.cohorts[1].id === 'c-new', 'new id');
    assert(created.cohorts[1].homeroomTeacherUserId === 'u1', 'homeroom stamped');
}

// duplicate target validation
{
    const plan = [
        { userAction: 'map', userTargetId: 'c1', importCohortName: 'A' },
        { userAction: 'map', userTargetId: 'c1', importCohortName: 'B' }
    ];
    const v = RI.validateImportPlan(plan);
    assert(!v.ok && v.error === 'duplicateTargetCohort', 'duplicate target');
}

console.log('roster-import.test.mjs: all passed');
