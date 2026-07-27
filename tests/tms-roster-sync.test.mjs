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
    assert(D.koreanNameKey('김\u00A0민수') === '김민수', 'NBSP');
    assert(D.koreanNameKey('김\u200B민수') === '김민수', 'zero-width space');
    assert(D.koreanNameKey('김\u200D민수') === '김민수', 'ZWJ');
    assert(D.koreanNameKey('김·민수') === '김민수', 'middle dot');
    assert(D.koreanNameKey('김-민수') === '김민수', 'hyphen');
    assert(D.koreanNameKey('김민수'.normalize('NFD')) === '김민수', 'NFD → NFC key');
    assert(D.koreanNameKey('김\uFF2D인수') === D.koreanNameKey('김M인수'), 'fullwidth Latin');
    assert(D.koreanNameKey('김민수') !== D.koreanNameKey('김민서'), 'distinct names stay distinct');
    assert(D.OFF_ROSTER_TAG === 'off_roster', 'off roster constant');
    assert(D.STUDENT_TAGS.includes('off_roster'), 'tag allowlist');
}

// Looser key: cohort + TMS variants still merge as matched (not off_roster)
{
    const existing = [{ id: 'stu_a', name: '김민수', tags: [] }];
    const tms = [{ name: '김\u200B·민 수' }];
    const result = D.mergeRosterByKoreanName(existing, tms);
    assert(result.summary.matched.length === 1, 'variant Hangul matched');
    assert(result.summary.flagged.length === 0, 'not flagged off roster');
    assert(result.summary.added.length === 0, 'no duplicate add');
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

// Already Off roster + still missing from TMS still counts in flagged preview
{
    const existing = [
        { id: 'stu_a', name: '김민수', tags: [] },
        { id: 'stu_gone', name: '최유나', tags: ['off_roster'] }
    ];
    const result = D.mergeRosterByKoreanName(existing, [{ name: '김민수' }]);
    assert(result.summary.flagged.length === 1, 'already-tagged missing still flagged');
    assert(result.summary.flagged[0].id === 'stu_gone', 'flagged is 최유나');
    assert(
        result.students.find((s) => s.id === 'stu_gone').tags.includes('off_roster'),
        'keeps off_roster while missing'
    );
}

// All names match → every Off roster tag is removed
{
    const existing = [
        { id: 'stu_a', name: '김민수', tags: ['off_roster', 'new'] },
        { id: 'stu_b', name: '이서연', tags: ['off_roster'] },
        { id: 'stu_c', name: '박·지훈', tags: ['off_roster'] }
    ];
    const result = D.mergeRosterByKoreanName(existing, [
        { name: '김민수' },
        { name: '이서연' },
        { name: '박지훈' }
    ]);
    assert(result.summary.matched.length === 3, 'all three matched');
    assert(result.summary.flagged.length === 0, 'nobody flagged');
    assert(result.summary.cleared.length === 3, 'cleared all three');
    result.students.forEach((s) => {
        assert(!s.tags.includes('off_roster'), `${s.name} lost off_roster`);
    });
    assert(
        result.students.find((s) => s.id === 'stu_a').tags.includes('new'),
        'kept other tags while clearing off_roster'
    );
}

// Hangul syllable helpers
{
    assert(D.hangulSyllables('김민수').join('') === '김민수', 'three syllables');
    assert(D.hangulSyllables('Kim김민수').join('') === '김민수', 'strip latin');
    assert(D.shareThreeHangulSyllables('김민수', '김민수아') === true, 'substring of 3');
    assert(D.shareThreeHangulSyllables('김민아', '김민수') === false, 'only 2 contiguous');
    assert(D.shareThreeHangulSyllables('김민', '김민수') === false, 'too short');
    assert(D.hangulNameVariantPair('권이안', '이안권') === false, 'non-contained shared syllables do not fuzzy match');
}

// Fuzzy clear: equal count + unique 3-syllable substring
{
    const existing = [
        { id: 'stu_a', name: '이서연', tags: [] },
        { id: 'stu_b', name: '김민수', tags: ['off_roster'] }
    ];
    const result = D.mergeRosterByKoreanName(existing, [
        { name: '이서연' },
        { name: '김민수아' }
    ]);
    assert(result.summary.matched.length === 2, 'exact + fuzzy matched');
    assert(result.summary.added.length === 0, 'no duplicate add for fuzzy TMS name');
    assert(result.summary.flagged.length === 0, 'nobody flagged');
    assert(result.summary.cleared.length === 1, 'cleared off_roster via fuzzy');
    assert(result.summary.fuzzyCleared.length === 1, 'fuzzyCleared listed');
    assert(result.summary.fuzzyCleared[0].id === 'stu_b', 'fuzzy cleared 김민수');
    assert(
        !result.students.find((s) => s.id === 'stu_b').tags.includes('off_roster'),
        'off_roster removed'
    );
    assert(result.students.find((s) => s.id === 'stu_b').name === '김민수', 'did not rename');
    assert(
        result.summary.warnings.some((w) => w.code === 'fuzzy_syllable_match'),
        'fuzzy warning recorded'
    );
}

// Fuzzy: duplicate candidates → no clear
{
    const existing = [
        { id: 'stu_a', name: '김민수', tags: ['off_roster'] },
        { id: 'stu_b', name: '김민수아', tags: ['off_roster'] }
    ];
    const result = D.mergeRosterByKoreanName(existing, [
        { name: '김민수XX' },
        { name: '박지훈' }
    ]);
    // Both CM names share 김민수 with TMS 김민수XX → ambiguous for that TMS; 박지훈 unmatched
    // Counts equal (2===2) but pairing not unique for 김민수 / 김민수아 vs one overlapping TMS
    assert(result.summary.fuzzyCleared.length === 0, 'no fuzzy clear when duplicate candidates');
    assert(
        result.students.find((s) => s.id === 'stu_a').tags.includes('off_roster'),
        'stu_a still off_roster'
    );
    assert(
        result.students.find((s) => s.id === 'stu_b').tags.includes('off_roster'),
        'stu_b still off_roster'
    );
}

// Fuzzy: unequal headcount + unique 3-syllable variant still merges (no false New)
{
    const existing = [
        { id: 'stu_a', name: '김민수', tags: ['off_roster'] },
        { id: 'stu_b', name: '이서연', tags: [] }
    ];
    const result = D.mergeRosterByKoreanName(existing, [{ name: '김민수아' }]);
    assert(result.summary.fuzzyCleared.length === 1, 'fuzzy clears despite unequal count');
    assert(result.summary.fuzzyCleared[0].id === 'stu_a', 'fuzzy cleared 김민수');
    assert(result.summary.added.length === 0, 'no duplicate add for fuzzy TMS name');
    assert(
        !result.students.find((s) => s.id === 'stu_a').tags.includes('off_roster'),
        'off_roster removed via fuzzy'
    );
    assert(result.students.find((s) => s.id === 'stu_a').name === '김민수', 'did not rename');
    assert(result.summary.flagged.length === 1, '이서연 still flagged as missing');
    assert(result.summary.flagged[0].id === 'stu_b', 'flagged is 이서연');
    assert(
        result.students.find((s) => s.id === 'stu_b').tags.includes('off_roster'),
        '이서연 got off_roster'
    );
}

// Fuzzy: already-off-roster inflation must not block matching an active name variant
{
    const existing = [
        { id: 'stu_a', name: '김민수', tags: [] },
        { id: 'stu_b', name: '이서연', tags: [] },
        { id: 'stu_gone', name: '최유나', tags: ['off_roster'] }
    ];
    const result = D.mergeRosterByKoreanName(existing, [
        { name: '김민수아' },
        { name: '이서연' }
    ]);
    assert(result.summary.matched.length === 2, 'exact + fuzzy matched');
    assert(result.summary.added.length === 0, 'no false New for 김민수아');
    assert(result.summary.fuzzyCleared.length === 0, '김민수 was not off_roster before');
    assert(
        result.summary.warnings.some((w) => w.code === 'fuzzy_syllable_match' && w.matchedId === 'stu_a'),
        'fuzzy warning for 김민수'
    );
    assert(result.students.find((s) => s.id === 'stu_a').name === '김민수', 'kept CM spelling');
    assert(result.summary.flagged.length === 1, 'only 최유나 flagged');
    assert(result.summary.flagged[0].id === 'stu_gone', 'flagged is 최유나');
    assert(
        result.students.find((s) => s.id === 'stu_gone').tags.includes('off_roster'),
        '최유나 stays off_roster'
    );
}

// Unrelated TMS name with no 3-syllable overlap still adds + flags
{
    const existing = [
        { id: 'stu_a', name: '김민수', tags: ['off_roster'] },
        { id: 'stu_b', name: '이서연', tags: [] }
    ];
    const result = D.mergeRosterByKoreanName(existing, [{ name: '박지훈' }]);
    assert(result.summary.fuzzyCleared.length === 0, 'no fuzzy for unrelated name');
    assert(result.summary.added.length === 1, '박지훈 added as new');
    assert(result.summary.flagged.length === 2, 'both CM flagged as missing');
}

// New Korean-only TMS student should add even with empty English name
{
    const existing = [
        { id: 'stu_a', name: '김민수', tags: [] },
        { id: 'stu_b', name: '이서연', tags: [] }
    ];
    let n = 0;
    const result = D.mergeRosterByKoreanName(existing, [
        { name: '김민수' },
        { name: '권이안', nameEn: '' }
    ], {
        newStudentId: () => `stu_new${++n}`
    });
    assert(result.summary.added.length === 1, 'one korean-only student added');
    assert(result.summary.added[0].name === '권이안', '권이안 added');
    assert(result.students.find((s) => s.name === '권이안').nameEn === '', 'empty english kept');
    assert(result.summary.flagged.length === 1, 'only missing classmanager name flagged');
    assert(result.summary.flagged[0].name === '이서연', 'flagged existing missing');
}

// Empty TMS scrape should not mass-flag an active class
{
    const existing = [
        { id: 'stu_a', name: '김민수', tags: [] },
        { id: 'stu_b', name: '이서연', tags: ['off_roster'] }
    ];
    const result = D.mergeRosterByKoreanName(existing, []);
    assert(result.summary.flagged.length === 0, 'no empty-scrape off_roster blast');
    assert(result.summary.added.length === 0, 'no adds on empty scrape');
    assert(result.summary.warnings.some((w) => w.code === 'incomplete_tms_scrape'), 'warn incomplete scrape');
    assert(!result.students.find((s) => s.id === 'stu_a').tags.includes('off_roster'), 'active student unchanged');
    assert(result.students.find((s) => s.id === 'stu_b').tags.includes('off_roster'), 'existing tag preserved');
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
