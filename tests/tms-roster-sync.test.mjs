import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadDomain() {
    const code = readFileSync(path.join(root, 'js', 'classroom-domain.js'), 'utf8');
    const sandbox = { window: {}, globalThis: {} };
    vm.runInNewContext(code, sandbox);
    return sandbox.window.CCPClassroomDomain;
}

const D = loadDomain();

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

{
    assert(D.koreanNameKey('김 민 수') === '김민수', 'collapse spaces');
    assert(D.koreanNameKey('  이서연 ') === '이서연', 'trim');
    assert(D.OFF_ROSTER_TAG === 'off_roster', 'off roster constant');
    assert(D.STUDENT_TAGS.includes('off_roster'), 'tag allowlist');
}

// Do not add duplicate when Korean name already in cohort
{
    const existing = [
        { id: 'stu_a', name: '김민수', nameEn: 'Minsu', tags: [] },
        { id: 'stu_b', name: '이서연', nameEn: 'Seoyeon', tags: [] }
    ];
    const tms = [
        { name: '김민수', nameEn: 'DifferentEn' },
        { name: '이서연' },
        { name: '박지훈' }
    ];
    const result = D.mergeRosterByKoreanName(existing, tms, {
        newStudentId: () => 'stu_new'
    });
    assert(result.summary.added.length === 1, 'one new student');
    assert(result.summary.added[0].name === '박지훈', 'new is 박지훈');
    assert(result.summary.matched.length === 2, 'two matched');
    assert(result.students.filter((s) => s.name === '김민수').length === 1, 'no duplicate 김민수');
    assert(result.students.find((s) => s.name === '김민수').id === 'stu_a', 'keep existing id');
    assert(result.students.find((s) => s.name === '김민수').nameEn === 'Minsu', 'keep existing English');
}

// Flag missing from TMS; clear when they return
{
    const existing = [
        { id: 'stu_a', name: '김민수', tags: [] },
        { id: 'stu_b', name: '이서연', tags: [] }
    ];
    const first = D.mergeRosterByKoreanName(existing, [{ name: '김민수' }]);
    assert(first.summary.flagged.length === 1, 'flagged one');
    assert(first.summary.flagged[0].name === '이서연', 'flagged 이서연');
    const flagged = first.students.find((s) => s.id === 'stu_b');
    assert(flagged.tags.includes('off_roster'), 'has off_roster tag');
    assert(!first.students.find((s) => s.id === 'stu_a').tags.includes('off_roster'), 'matched not flagged');

    const second = D.mergeRosterByKoreanName(first.students, [
        { name: '김민수' },
        { name: '이서연' }
    ]);
    assert(second.summary.cleared.length === 1, 'cleared one');
    assert(
        !second.students.find((s) => s.id === 'stu_b').tags.includes('off_roster'),
        'off_roster cleared'
    );
}

// Never deletes students
{
    const existing = [
        { id: 'stu_a', name: '김민수', tags: ['new'] },
        { id: 'stu_gone', name: '최유나', tags: ['interested'] }
    ];
    const result = D.mergeRosterByKoreanName(existing, [{ name: '김민수' }]);
    assert(result.students.length === 2, 'still two students');
    const gone = result.students.find((s) => s.id === 'stu_gone');
    assert(gone, 'kept gone student');
    assert(gone.tags.includes('interested'), 'kept other tags');
    assert(gone.tags.includes('off_roster'), 'added off_roster');
}

// applyTmsRosterPlan maps by cohort
{
    const cohorts = [
        { id: 'c1', name: 'Purple T', students: [{ id: 'stu_a', name: '김민수', tags: [] }] },
        { id: 'c2', name: 'Navy T', students: [] }
    ];
    const plan = [
        {
            userAction: 'map',
            userTargetId: 'c1',
            importCohortName: 'Purple T',
            students: [{ name: '김민수' }, { name: '이서연' }]
        },
        { userAction: 'skip', importCohortName: 'Other', students: [{ name: '무시' }] }
    ];
    let n = 0;
    const applied = D.applyTmsRosterPlan(cohorts, plan, {
        newStudentId: () => `stu_x${++n}`
    });
    assert(applied.cohorts[0].students.length === 2, 'purple grew');
    assert(applied.cohorts[1].students.length === 0, 'navy untouched');
    assert(applied.results[0].summary.added.length === 1, 'one added in result');
}

// TMS class → cohort link memory
{
    assert(D.normalizeTmsClassKey('가람 월') === '가람월', 'normalize hangul name key');
    assert(D.normalizeTmsClassKey('Purple T', '42') === 'id:42', 'prefer tms id key');

    const cohorts = [
        { id: 'c1', name: 'Garam M', students: [] },
        { id: 'c2', name: 'Navy T', students: [] }
    ];
    const links = {
        가람월: { action: 'map', cohortId: 'c1', tmsClassName: '가람 월' },
        스킵반: { action: 'skip', cohortId: '', tmsClassName: '스킵반' },
        죽은링크: { action: 'map', cohortId: 'missing', tmsClassName: '죽은링크' }
    };

    const known = D.resolveTmsRosterLink(links, '가람 월', cohorts);
    assert(known.remembered === true, 'known remembered');
    assert(known.userAction === 'map', 'known map');
    assert(known.userTargetId === 'c1', 'known cohort');

    const skipped = D.resolveTmsRosterLink(links, '스킵반', cohorts);
    assert(skipped.remembered === true, 'skip remembered');
    assert(skipped.userAction === 'skip', 'skip action');

    const stale = D.resolveTmsRosterLink(links, '죽은링크', cohorts);
    assert(stale.remembered === false, 'stale not remembered');
    assert(stale.userAction === 'choose', 'stale requires choose');

    const unknown = D.resolveTmsRosterLink(links, '새로운반', cohorts);
    assert(unknown.remembered === false, 'unknown not remembered');
    assert(unknown.userAction === 'choose', 'unknown requires choose');

    const next = D.upsertTmsRosterLinks(
        links,
        [
            { importCohortName: '가람 월', userAction: 'map', userTargetId: 'c2' },
            { importCohortName: '새로운반', userAction: 'skip' }
        ],
        cohorts
    );
    assert(next['가람월'].cohortId === 'c2', 'upsert overwrites map');
    assert(next['새로운반'].action === 'skip', 'upsert adds skip');
    assert(!next['죽은링크'], 'stale map to missing cohort cleaned');
}

console.log('tms-roster-sync.test.mjs: ok');
