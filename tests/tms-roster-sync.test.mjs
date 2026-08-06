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
    assert(result.students.find((s) => s.name === '김민수').nameEn === 'DifferentEn', 'exact match adopts TMS English');
    assert(result.students.find((s) => s.name === '이서연').nameEn === 'Seoyeon', 'blank TMS English keeps CM');
}

// Exact Korean match pushes TMS English; blank TMS English leaves CM alone
{
    const existing = [{ id: 'stu_a', name: '김민수', nameEn: 'OldEn', tags: [] }];
    const withEn = D.mergeRosterByKoreanName(existing, [{ name: '김민수', nameEn: 'NewEn' }]);
    assert(withEn.students[0].nameEn === 'NewEn', 'exact match updates nameEn from TMS');
    const blankEn = D.mergeRosterByKoreanName(existing, [{ name: '김민수', nameEn: '' }]);
    assert(blankEn.students[0].nameEn === 'OldEn', 'exact match keeps CM nameEn when TMS blank');
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

// Unreliable partial roster can suppress missing/off_roster inference
{
    const existing = [
        { id: 'stu_a', name: '황연진', tags: [] },
        { id: 'stu_b', name: '김민수', tags: [] }
    ];
    const result = D.mergeRosterByKoreanName(existing, [{ name: '김민수' }], {
        suppressMissing: true
    });
    assert(result.summary.flagged.length === 0, 'suppressed rows do not flag missing students');
    assert(
        !result.students.find((s) => s.id === 'stu_a').tags.includes('off_roster'),
        'suppressed rows do not add off_roster'
    );
    assert(result.summary.matched.length === 1, 'positive match still applied');
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
        !result.students.find((s) => s.id === 'stu_a').tags.includes('off_roster'),
        'cleared off_roster while preserving matched student'
    );
}

// Hangul syllable helpers + symbol-aware match keys
{
    assert(D.hangulSyllables('김민수').join('') === '김민수', 'three syllables');
    assert(D.hangulSyllables('Kim김민수').join('') === '김민수', 'strip latin');
    assert(D.shareThreeHangulSyllables('김민수', '김민수아') === true, 'substring of 3');
    assert(D.shareThreeHangulSyllables('김민아', '김민수') === false, 'only 2 contiguous');
    assert(D.shareThreeHangulSyllables('김민', '김민수') === false, 'too short');
    assert(D.hangulNameVariantPair('권이안', '이안권') === false, 'non-contained shared syllables do not fuzzy match');
    assert(D.koreanMatchKey('권이안◆') === D.koreanMatchKey('권이안'), 'status symbol ignored in match key');
    assert(D.koreanMatchKey('김민수A') !== D.koreanMatchKey('김민수'), 'Latin disambiguator kept');
    assert(D.koreanMatchKey('김민수A') !== D.koreanMatchKey('김민수B'), 'Latin A ≠ B');
    assert(D.nameStatusSymbolSuffix('권이안◆') === '◆', 'diamond status suffix');
    assert(D.nameStatusSymbolSuffix('박세빈S◆') === 'S◆', 'shuttle counted as status suffix');
    assert(D.nameLatinDisambiguatorSuffix('김민수A') === 'A', 'latin suffix');
    assert(D.hangulNameVariantPair('권이안', '권이안◆') === true, 'symbol-only pair shares identity');
    assert(D.hangulNameVariantPair('김민수', '김민수A') === false, 'latin blocks fuzzy');
}

// Status marks no longer block matching; they sync onto tags instead of identity
{
    const existing = [{ id: 'stu_a', name: '권이안', tags: [] }];
    const unclear = D.listUnclearTmsStudentMatches(existing, [{ name: '권이안◆', nameEn: '' }]);
    assert(unclear.length === 0, 'status mark gain is silent');
    const blocked = D.mergeRosterByKoreanName(existing, [{ name: '권이안◆' }]);
    assert(blocked.summary.added.length === 0, 'no silent add on mark change');
    assert(blocked.summary.matched.length === 1, 'status-mark variant still matches same student');
    assert(blocked.students.find((s) => s.id === 'stu_a').name === '권이안', 'CM name unchanged');
    assert(blocked.students.find((s) => s.id === 'stu_a').tags.includes('transfer_in'), 'transfer tag added');

    const key = D.koreanMatchKey('권이안◆');
    const result = D.mergeRosterByKoreanName(existing, [{ name: '권이안◆' }], {
        studentResolutions: { [key]: { action: 'map', studentId: 'stu_a' } }
    });
    assert(result.summary.matched.length === 1, 'mapped after review');
    assert(result.students.find((s) => s.id === 'stu_a').name === '권이안', 'canonical name unchanged after map');
    assert(result.students.find((s) => s.id === 'stu_a').tags.includes('transfer_in'), 'map still applies transfer tag');

    const stripUnclear = D.listUnclearTmsStudentMatches(
        [{ id: 'stu_a', name: '권이안◆', tags: [] }],
        [{ name: '권이안' }]
    );
    assert(stripUnclear.length === 0, 'symbol loss not unclear');
    const strip = D.mergeRosterByKoreanName(
        [{ id: 'stu_a', name: '권이안◆', tags: [] }],
        [{ name: '권이안' }],
        { studentResolutions: { [D.koreanMatchKey('권이안')]: { action: 'map', studentId: 'stu_a' } } }
    );
    assert(strip.students[0].name === '권이안', 'adopted TMS without symbol');
}

// Parenthesized suffix from TMS roster ("Name()" or "Name(English)") should be ignored for identity
{
    assert(D.koreanNameKey('황연진()') === '황연진', 'strip empty parens');
    assert(D.koreanNameKey('황연진(Leo)') === '황연진', 'strip parens with English');
    assert(D.koreanNameKey('양민아()') === '양민아', 'strip empty parens for 양민아');
}

{
    const existing = [{ id: 'stu_a', name: '황연진', tags: [] }];
    const matched = D.mergeRosterByKoreanName(existing, [{ name: '황연진()' }]);
    assert(matched.summary.matched.length === 1, '황연진() matches 황연진');
    assert(matched.summary.flagged.length === 0, 'not flagged missing when parens present');
    assert(D.listUnclearTmsStudentMatches(existing, [{ name: '황연진()' }]).length === 0, 'no unclear queue for parens');

    const matchedEn = D.mergeRosterByKoreanName(existing, [{ name: '황연진(Leo)', nameEn: '' }]);
    assert(matchedEn.summary.matched.length === 1, '황연진(Leo) matches 황연진 identity');
    assert(matchedEn.summary.flagged.length === 0, 'no missing when parens with English');
}

// Bracketed suffix from TMS roster ("Name[]" or "Name[English]") should be ignored for identity
{
    assert(D.koreanNameKey('황연진[]') === '황연진', 'strip empty brackets');
    assert(D.koreanNameKey('황연진[Leo]') === '황연진', 'strip bracket with English');
    assert(D.koreanNameKey('황연진[] 학생') === '황연진', 'strip trailing 학생 label');
    assert(D.koreanNameKey('양민아[]') === '양민아', 'strip empty brackets for 양민아');
}

{
    const existing = [{ id: 'stu_a', name: '황연진', tags: [] }];
    const matched = D.mergeRosterByKoreanName(existing, [{ name: '황연진[]' }]);
    assert(matched.summary.matched.length === 1, '황연진[] matches 황연진');
    assert(matched.summary.flagged.length === 0, 'not flagged missing when brackets present');
    assert(D.listUnclearTmsStudentMatches(existing, [{ name: '황연진[]' }]).length === 0, 'no unclear queue for brackets');
}

{
    const existing = [{ id: 'stu_a', name: '황연진', tags: [] }];
    const matched = D.mergeRosterByKoreanName(existing, [{ name: '황연진[] 학생' }]);
    assert(matched.summary.matched.length === 1, '황연진[] 학생 matches 황연진');
    assert(matched.summary.flagged.length === 0, 'not flagged missing when 학생 label present');
    assert(
        D.listUnclearTmsStudentMatches(existing, [{ name: '황연진[] 학생' }]).length === 0,
        'no unclear queue for brackets+학생'
    );
}

// Identical Hangul+mark still silent-matches
{
    const existing = [{ id: 'stu_a', name: '정태희', nameEn: 'Taeheu', tags: ['new'] }];
    assert(D.listUnclearTmsStudentMatches(existing, [{ name: '정태희★' }]).length === 0, 'identical not unclear');
    const result = D.mergeRosterByKoreanName(existing, [{ name: '정태희★', nameEn: 'Taeheui' }]);
    assert(result.summary.matched.length === 1, 'identical mark matched');
    assert(result.summary.added.length === 0, 'no add');
    assert(result.students[0].nameEn === 'Taeheui', 'TMS English adopted on silent match');
    assert(result.students[0].name === '정태희', 'canonical name stays stripped');
    assert(result.students[0].tags.includes('new'), 'new tag stays synced');
}

// Existing CM duplicates (정태희 + 정태희★) require merge choice
{
    const existing = [
        { id: 'stu_star', name: '정태희★', nameEn: 'Taeheu', tags: [] },
        { id: 'stu_plain', name: '정태희', nameEn: 'Taeheu', tags: [] }
    ];
    const unclear = D.listUnclearTmsStudentMatches(existing, [{ name: '정태희', nameEn: 'Taeheu' }]);
    assert(unclear.length === 1, 'duplicate unclear');
    assert(unclear[0].reason === 'duplicate_existing', 'duplicate_existing');
    assert(unclear[0].candidates.length === 2, 'both candidates');
    const blocked = D.mergeRosterByKoreanName(existing, [{ name: '정태희' }]);
    assert(blocked.summary.added.length === 0, 'no third student');
    assert(blocked.summary.matched.length === 0, 'no silent adopt onto one dup');
}

// Latin disambiguator still unclear vs bare Hangul
{
    const existing = [{ id: 'stu_a', name: '김민수', tags: [] }];
    const unclear = D.listUnclearTmsStudentMatches(existing, [{ name: '김민수A', nameEn: '' }]);
    assert(unclear.length === 1, 'one unclear latin');
    assert(unclear[0].reason === 'shared_hangul_core', 'shared core reason');
    assert(unclear[0].candidates[0].id === 'stu_a', 'candidate is bare name');
}

// Resolution add keeps canonical name and syncs transfer tag
{
    const existing = [{ id: 'stu_a', name: '권이안', tags: [] }];
    const key = D.koreanMatchKey('권이안◆');
    const result = D.mergeRosterByKoreanName(existing, [{ name: '권이안◆' }], {
        newStudentId: () => 'stu_new',
        studentResolutions: { [key]: { action: 'add' } }
    });
    assert(result.summary.added.length === 1, 'added disambiguated student');
    assert(result.summary.added[0].name === '권이안', 'kept canonical name on add');
    assert(result.students.length === 2, 'both students remain');
    assert(result.students.find((s) => s.id === 'stu_new').tags.includes('transfer_in'), 'transfer tag set on add');
}

// Resolution map adopts TMS identifying name so next Sync exact-matches
{
    const existing = [{ id: 'stu_a', name: '권이안', nameEn: 'Alice', tags: ['off_roster'] }];
    const key = D.koreanMatchKey('권이안◆');
    const result = D.mergeRosterByKoreanName(existing, [{ name: '권이안◆', nameEn: '' }], {
        studentResolutions: { [key]: { action: 'map', studentId: 'stu_a' } }
    });
    assert(result.summary.added.length === 0, 'no add on map');
    assert(result.summary.matched.some((m) => m.id === 'stu_a'), 'mapped onto existing student');
    const mapped = result.students.find((s) => s.id === 'stu_a');
    assert(mapped.name === '권이안', 'kept canonical TMS Hangul name');
    assert(mapped.nameEn === 'Alice', 'empty TMS nameEn keeps CM English');
    assert(!mapped.tags.includes('off_roster'), 'cleared off_roster on map');

    const second = D.mergeRosterByKoreanName(result.students, [{ name: '권이안◆' }], {});
    assert(second.summary.added.length === 0, 'second sync no add');
    assert(second.summary.matched.some((m) => m.id === 'stu_a'), 'second sync exact match');
    assert(
        !second.summary.warnings.some((w) => w.code === 'unresolved_unclear_name'),
        'second sync not unclear'
    );
    assert(D.listUnclearTmsStudentMatches(result.students, [{ name: '권이안◆' }]).length === 0, 'no unclear queue');
}

// Resolution map writes TMS nameEn when provided
{
    const existing = [{ id: 'stu_a', name: '권이안', nameEn: 'Alice', tags: [] }];
    const key = D.koreanMatchKey('권이안◆');
    const result = D.mergeRosterByKoreanName(existing, [{ name: '권이안◆', nameEn: 'Ian' }], {
        studentResolutions: { [key]: { action: 'map', studentId: 'stu_a' } }
    });
    const mapped = result.students.find((s) => s.id === 'stu_a');
    assert(mapped.name === '권이안', 'canonical name from TMS');
    assert(mapped.nameEn === 'Ian', 'nameEn from TMS when present');
}

// Duplicate Korean names: Map resolution wins over first exact match
{
    const existing = [
        { id: 'stu_a', name: '김민수', nameEn: 'A', tags: [] },
        { id: 'stu_b', name: '김민수', nameEn: 'B', tags: [] }
    ];
    const key = D.koreanNameKey('김민수');
    const unclear = D.listUnclearTmsStudentMatches(existing, [{ name: '김민수', nameEn: 'Minsu' }]);
    assert(unclear.length === 1 && unclear[0].reason === 'duplicate_existing', 'duplicate unclear');
    const result = D.mergeRosterByKoreanName(existing, [{ name: '김민수', nameEn: 'Minsu' }], {
        studentResolutions: { [key]: { action: 'map', studentId: 'stu_b' } }
    });
    assert(result.summary.matched.some((m) => m.id === 'stu_b' && m.resolved), 'mapped to second');
    assert(result.students.find((s) => s.id === 'stu_b').nameEn === 'Minsu', 'TMS en on chosen');
    assert(
        result.summary.flagged.some((f) => f.id === 'stu_a'),
        'other duplicate flagged off roster'
    );
    assert(result.students.find((s) => s.id === 'stu_a').tags.includes('off_roster'), 'stu_a off roster');
}

// Remembered skip applies without re-queue (Latin unclear case)
{
    const cohort = {
        id: 'c1',
        students: [{ id: 'stu_a', name: '김민수', tags: [] }],
        tmsStudentResolutions: {
            [D.koreanMatchKey('김민수A')]: { action: 'skip' }
        }
    };
    const unclear = D.listUnclearTmsStudentMatches(cohort.students, [{ name: '김민수A' }]);
    assert(unclear.length === 1, 'still listed as unclear raw');
    const row = { studentResolutions: {} };
    const still = D.applyRememberedTmsStudentResolutions(cohort, unclear, row);
    assert(still.length === 0, 'remembered skip not queued');
    assert(row.studentResolutions[D.koreanMatchKey('김민수A')].action === 'skip', 'skip injected');
}

// Unresolved unclear does not auto-add (Latin)
{
    const existing = [{ id: 'stu_a', name: '김민수', tags: [] }];
    const result = D.mergeRosterByKoreanName(existing, [{ name: '김민수A' }], {
        softUnclear: true
    });
    assert(result.summary.added.length === 0, 'no auto add while unclear');
    assert(
        result.summary.warnings.some((w) => w.code === 'unresolved_unclear_name'),
        'unresolved warning'
    );
}

// Variant names require review (no silent fuzzy consume)
{
    const existing = [
        { id: 'stu_a', name: '이서연', tags: [] },
        { id: 'stu_b', name: '김민수', tags: ['off_roster'] }
    ];
    const unclear = D.listUnclearTmsStudentMatches(existing, [
        { name: '이서연' },
        { name: '김민수아' }
    ]);
    assert(unclear.length === 1, '김민수아 unclear');
    assert(unclear[0].reason === 'fuzzy_variant', 'fuzzy_variant reason');
    const key = D.koreanNameKey('김민수아');
    const result = D.mergeRosterByKoreanName(existing, [
        { name: '이서연' },
        { name: '김민수아' }
    ], {
        studentResolutions: { [key]: { action: 'map', studentId: 'stu_b' } }
    });
    assert(result.summary.matched.length === 2, 'exact + resolved matched');
    assert(result.summary.added.length === 0, 'no duplicate add for resolved variant');
    assert(result.summary.flagged.length === 0, 'nobody flagged');
    assert(result.summary.cleared.length === 1, 'cleared off_roster via map resolution');
    assert(
        !result.students.find((s) => s.id === 'stu_b').tags.includes('off_roster'),
        'off_roster removed'
    );
    assert(result.students.find((s) => s.id === 'stu_b').name === '김민수아', 'adopted TMS variant name');
    assert(
        D.listUnclearTmsStudentMatches(result.students, [
            { name: '이서연' },
            { name: '김민수아' }
        ]).length === 0,
        'second pass not unclear after map rename'
    );
}

// Ambiguous shared-core candidates stay unresolved without a choice
{
    const existing = [
        { id: 'stu_a', name: '김민수', tags: ['off_roster'] },
        { id: 'stu_b', name: '김민수아', tags: ['off_roster'] }
    ];
    const result = D.mergeRosterByKoreanName(existing, [
        { name: '김민수XX' },
        { name: '박지훈' }
    ]);
    assert(result.summary.added.length === 1, '박지훈 still added');
    assert(
        result.summary.warnings.some((w) => w.code === 'unresolved_unclear_name'),
        '김민수XX needs review'
    );
    assert(
        result.students.find((s) => s.id === 'stu_a').tags.includes('off_roster'),
        'stu_a still off_roster until resolved'
    );
    assert(
        result.students.find((s) => s.id === 'stu_b').tags.includes('off_roster'),
        'stu_b still off_roster until resolved'
    );
}

// Unequal headcount variant still reviewed then mapped
{
    const existing = [
        { id: 'stu_a', name: '김민수', tags: ['off_roster'] },
        { id: 'stu_b', name: '이서연', tags: [] }
    ];
    const key = D.koreanNameKey('김민수아');
    const result = D.mergeRosterByKoreanName(existing, [{ name: '김민수아' }], {
        studentResolutions: { [key]: { action: 'map', studentId: 'stu_a' } }
    });
    assert(result.summary.added.length === 0, 'no duplicate add for resolved variant');
    assert(
        !result.students.find((s) => s.id === 'stu_a').tags.includes('off_roster'),
        'off_roster removed via map'
    );
    assert(result.students.find((s) => s.id === 'stu_a').name === '김민수아', 'adopted TMS variant name');
    assert(result.summary.flagged.length === 1, '이서연 still flagged as missing');
    assert(result.summary.flagged[0].id === 'stu_b', 'flagged is 이서연');
}

// Off-roster inflation must not block reviewing an active name variant
{
    const existing = [
        { id: 'stu_a', name: '김민수', tags: [] },
        { id: 'stu_b', name: '이서연', tags: [] },
        { id: 'stu_gone', name: '최유나', tags: ['off_roster'] }
    ];
    const unclear = D.listUnclearTmsStudentMatches(existing, [
        { name: '김민수아' },
        { name: '이서연' }
    ]);
    assert(unclear.length === 1, 'only 김민수아 unclear');
    const key = D.koreanNameKey('김민수아');
    const result = D.mergeRosterByKoreanName(existing, [
        { name: '김민수아' },
        { name: '이서연' }
    ], {
        studentResolutions: { [key]: { action: 'map', studentId: 'stu_a' } }
    });
    assert(result.summary.matched.length === 2, 'exact + resolved matched');
    assert(result.summary.added.length === 0, 'no false New for 김민수아');
    assert(result.students.find((s) => s.id === 'stu_a').name === '김민수아', 'adopted TMS spelling');
    assert(result.summary.flagged.length === 1, 'only 최유나 flagged');
    assert(result.summary.flagged[0].id === 'stu_gone', 'flagged is 최유나');
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

// applyTmsRosterPlan can create a new cohort from unmatched TMS rows
{
    const cohorts = [{ id: 'c1', name: 'Purple T', students: [{ id: 'stu_a', name: '김민수', tags: [] }] }];
    let newStudentSeq = 0;
    let newCohortSeq = 0;
    const applied = D.applyTmsRosterPlan(
        cohorts,
        [
            {
                userAction: 'create',
                importCohortName: 'Orange M',
                students: [{ name: '이서연' }, { name: '박지훈', nameEn: 'Jihoon' }],
                schedulePattern: 'mwf',
                meetingDays: [1, 3, 5],
                tmsSuggestedPeriod: 4,
                tmsSuggestedTimeSlotId: 'slot4',
                tmsBlockStart: '16:10',
                tmsBlockEnd: '17:00'
            }
        ],
        {
            newStudentId: () => `stu_new${++newStudentSeq}`,
            newCohortId: () => `cohort_new${++newCohortSeq}`,
            homeroomTeacherUserId: 'teacher_1'
        }
    );
    assert(applied.cohorts.length === 2, 'created cohort added');
    const created = applied.cohorts.find((c) => c.id === 'cohort_new1');
    assert(created, 'created cohort present');
    assert(created.name === 'Orange M', 'created cohort keeps TMS name');
    assert(created.homeroomTeacherUserId === 'teacher_1', 'created cohort stamps homeroom user');
    assert(created.students.length === 2, 'created cohort gets TMS students');
    assert(
        created.students.map((s) => s.id).sort().join(',') === 'stu_new1,stu_new2',
        'new student ids generated'
    );
    assert(
        created.students.find((s) => s.name === '박지훈').nameEn === 'Jihoon',
        'created student keeps English name'
    );
    assert(created.tmsSuggestedPeriod === 4, 'created cohort keeps suggested period');
    assert(applied.results[0].created === true, 'result marked created');
    assert(applied.results[0].targetId === 'cohort_new1', 'result returns new target id');
    assert(applied.results[0].summary.added.length === 2, 'all students treated as added');
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
            { importCohortName: '새로운반', userAction: 'skip' },
            { importCohortName: '오렌지반', userAction: 'create', createdCohortId: 'c1' }
        ],
        cohorts
    );
    assert(next['가람월'].cohortId === 'c2', 'upsert overwrites map');
    assert(next['새로운반'].action === 'skip', 'upsert adds skip');
    assert(next['오렌지반'].action === 'map', 'created cohort remembered as map');
    assert(next['오렌지반'].cohortId === 'c1', 'created cohort link stored');
    assert(!next['죽은링크'], 'stale map to missing cohort cleaned');
}

// Cross-cohort transfer detection (missing on A + add on B)
{
    const cohorts = [
        {
            id: 'cA',
            name: 'Cohort A',
            students: [
                { id: 'stu_move', name: '김민수', tags: [] },
                { id: 'stu_stay', name: '이서연', tags: [] }
            ]
        },
        {
            id: 'cB',
            name: 'Cohort B',
            students: [{ id: 'stu_other', name: '박지훈', tags: [] }]
        }
    ];
    const plan = [
        {
            importCohortName: 'TMS A',
            userAction: 'map',
            userTargetId: 'cA',
            students: [{ name: '이서연' }],
            studentResolutions: {}
        },
        {
            importCohortName: 'TMS B',
            userAction: 'map',
            userTargetId: 'cB',
            students: [{ name: '박지훈' }, { name: '김민수◆' }],
            studentResolutions: {}
        }
    ];
    const transfers = D.detectTmsRosterTransfers(cohorts, plan);
    assert(transfers.length === 1, `one transfer ${transfers.length}`);
    assert(transfers[0].studentId === 'stu_move', 'moved student id');
    assert(transfers[0].fromCohortId === 'cA', 'from A');
    assert(transfers[0].toCohortId === 'cB', 'to B');

    const ambiguous = D.detectTmsRosterTransfers(cohorts, [
        plan[0],
        plan[1],
        {
            importCohortName: 'TMS C',
            userAction: 'map',
            userTargetId: 'cB',
            students: [{ name: '김민수' }],
            studentResolutions: {}
        }
    ]);
    // Two destinations for same key → no unique transfer (second row also targets B with add)
    // Rebuild with two distinct destinations:
    const cohorts3 = cohorts.concat([
        { id: 'cC', name: 'Cohort C', students: [] }
    ]);
    const amb2 = D.detectTmsRosterTransfers(cohorts3, [
        plan[0],
        {
            importCohortName: 'TMS B',
            userAction: 'map',
            userTargetId: 'cB',
            students: [{ name: '박지훈' }, { name: '김민수' }],
            studentResolutions: {}
        },
        {
            importCohortName: 'TMS C',
            userAction: 'map',
            userTargetId: 'cC',
            students: [{ name: '김민수' }],
            studentResolutions: {}
        }
    ]);
    assert(amb2.length === 0, 'ambiguous destinations → no transfer');

    const moved = D.applyTmsRosterTransfers(cohorts, transfers);
    assert(!moved.errors.length, 'move ok');
    const markKey = D.koreanMatchKey('김민수◆');
    const planWithMarkMap = [
        plan[0],
        Object.assign({}, plan[1], {
            studentResolutions: {
                [markKey]: { action: 'map', studentId: 'stu_move' }
            }
        })
    ];
    const afterMove = D.applyTmsRosterPlan(moved.cohorts, planWithMarkMap, {
        newStudentId: () => 'stu_should_not'
    });
    const a = afterMove.cohorts.find((c) => c.id === 'cA');
    const b = afterMove.cohorts.find((c) => c.id === 'cB');
    assert(!a.students.some((s) => s.id === 'stu_move'), 'gone from A');
    assert(b.students.some((s) => s.id === 'stu_move'), 'same id on B');
    assert(b.students.find((s) => s.id === 'stu_move').name === '김민수', 'canonical name kept on B');
    assert(b.students.find((s) => s.id === 'stu_move').tags.includes('transfer_in'), 'transfer tag updated on B');
    assert(!b.students.some((s) => s.id === 'stu_should_not'), 'no duplicate add');
}

// Archive rematch: restore keeps id; decline adds new
{
    const cohorts = [
        {
            id: 'c1',
            name: 'Class A',
            students: [{ id: 'stu_live', name: '이서연', tags: [] }]
        },
        {
            id: D.ARCHIVE_COHORT_ID,
            name: 'Student archive',
            students: [
                {
                    id: 'stu_arch',
                    name: '김민수',
                    nameEn: 'Minsu',
                    tmsMpidx: '99901',
                    tags: [],
                    active: true,
                    archivedAt: '2026-01-01T00:00:00.000Z',
                    archiveReason: 'break'
                }
            ]
        }
    ];
    const unclear = D.listUnclearTmsStudentMatches(
        cohorts[0].students,
        [{ name: '김민수★', mpidx: '99901', statusMarks: { isNew: true, shuttle: false, transferIn: false } }],
        { archiveStudents: cohorts[1].students }
    );
    assert(unclear.length === 1, 'archive restore review');
    assert(unclear[0].reason === 'restore_from_archive', 'restore reason');
    assert(unclear[0].candidates[0].id === 'stu_arch', 'archived candidate');

    const blocked = D.mergeRosterByKoreanName(cohorts[0].students, [{ name: '김민수', mpidx: '99901' }], {
        archiveStudents: cohorts[1].students,
        newStudentId: () => 'stu_should_not'
    });
    assert(blocked.summary.added.length === 0, 'no silent add while archive hit');
    assert(
        blocked.summary.warnings.some((w) => w && w.code === 'needs_archive_restore'),
        'needs restore warning'
    );

    const restoredPlan = D.applyTmsRosterPlan(cohorts, [
        {
            importCohortName: 'TMS A',
            userAction: 'map',
            userTargetId: 'c1',
            students: [
                {
                    name: '김민수★',
                    mpidx: '99901',
                    statusMarks: { isNew: true, shuttle: false, transferIn: false }
                }
            ],
            studentResolutions: {
                [D.koreanMatchKey('김민수')]: { action: 'restore', studentId: 'stu_arch' }
            }
        }
    ]);
    const live = restoredPlan.cohorts.find((c) => c.id === 'c1');
    const arch = restoredPlan.cohorts.find((c) => c.id === D.ARCHIVE_COHORT_ID);
    const stu = live.students.find((s) => s.id === 'stu_arch');
    assert(stu, 'restored into mapped cohort');
    assert(stu.name === '김민수', 'canonical name on restore');
    assert(stu.tags.includes('new'), 'new tag from ★');
    assert(!stu.archivedAt, 'cleared archivedAt');
    assert(!(arch.students || []).some((s) => s.id === 'stu_arch'), 'removed from archive');

    const addNew = D.applyTmsRosterPlan(cohorts, [
        {
            importCohortName: 'TMS A',
            userAction: 'map',
            userTargetId: 'c1',
            students: [{ name: '김민수', mpidx: '99901' }],
            studentResolutions: {
                [D.koreanMatchKey('김민수')]: { action: 'add' }
            }
        }
    ], { newStudentId: () => 'stu_fresh' });
    assert(addNew.cohorts.find((c) => c.id === 'c1').students.some((s) => s.id === 'stu_fresh'), 'decline restore adds new');
    assert(
        addNew.cohorts.find((c) => c.id === D.ARCHIVE_COHORT_ID).students.some((s) => s.id === 'stu_arch'),
        'archive kept when declined'
    );
}

// Suspected duplicate mpidx helper
{
    const dups = D.listSuspectedDuplicateStudents({
        students: [
            { id: 'a', name: '김민수', tmsMpidx: '111', tags: [] },
            { id: 'b', name: '김민수B', tmsMpidx: '111', tags: [] }
        ]
    });
    assert(dups.some((d) => d.reason === 'duplicate_tms_mpidx'), 'duplicate mpidx surfaced');
}

// Exact-only status noise: keep rare 신/신규* real names; reject status labels only
{
    assert(D.isRosterStatusNoiseName('신규') === true, '신규 status noise');
    assert(D.isRosterStatusNoiseName('신규학생') === true, '신규학생 status noise');
    assert(D.isRosterStatusNoiseName('신규학') === false, '신규학 kept (not prefix)');
    assert(D.isRosterStatusNoiseName('신규생') === false, '신규생 kept (not prefix)');
    assert(D.isRosterStatusNoiseName('신선우') === false, '신선우 kept');

    const keepRare = D.mergeRosterByKoreanName([], [{ name: '신규학', nameEn: 'Hak' }], {
        newStudentId: () => 'stu_sin'
    });
    assert(keepRare.summary.added.length === 1, '신규학 added');
    assert(keepRare.summary.added[0].name === '신규학', '신규학 name kept');

    const dropStatus = D.mergeRosterByKoreanName([], [{ name: '신규학생' }], {
        newStudentId: () => 'stu_bad'
    });
    assert(dropStatus.summary.added.length === 0, '신규학생 not added as student');
}

console.log('tms-roster-sync.test.mjs: ok');
