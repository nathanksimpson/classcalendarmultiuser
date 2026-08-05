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
    assert(D.koreanMatchKey('권이안◆') === D.koreanMatchKey('권이안'), 'status symbol stripped from match key');
    assert(D.nameDisambiguatorSuffix('권이안◆') === '◆', 'diamond suffix on display');
    assert(D.hangulNameVariantPair('권이안', '권이안◆') === true, 'same match key across diamond');
    assert(D.koreanMatchKey('김민수A') !== D.koreanMatchKey('김민수'), 'Latin suffix kept in match key');
    assert(D.hangulNameVariantPair('김민수', '김민수A') === false, 'no auto fuzzy across Latin suffix');
}

// Status symbol auto-matches; Latin suffix stays unclear
{
    const existing = [
        { id: 'stu_a', name: '권이안', tags: ['off_roster'] },
        { id: 'stu_b', name: '김민수', tags: [] },
        { id: 'stu_c', name: '이서연', nameEn: 'Seoyeon', tags: [] }
    ];
    const diamond = D.mergeRosterByKoreanName(existing, [{ name: '권이안◆', nameEn: 'Ian' }]);
    assert(diamond.summary.added.length === 0, 'diamond not added as new');
    assert(diamond.summary.matched.some((m) => m.id === 'stu_a'), 'diamond matched');
    const mapped = diamond.students.find((s) => s.id === 'stu_a');
    assert(mapped.name === '권이안◆', 'adopted TMS display with diamond');
    assert(mapped.nameEn === 'Ian', 'adopted TMS English on exact match');
    assert(!mapped.tags.includes('off_roster'), 'cleared off_roster on symbol match');
    assert(D.listUnclearTmsStudentMatches(existing, [{ name: '권이안◆' }]).length === 0, 'diamond not unclear');

    const unclear = D.listUnclearTmsStudentMatches(existing, [{ name: '김민수A', nameEn: '' }]);
    assert(unclear.length === 1, 'Latin suffix unclear');
    assert(unclear[0].reason === 'shared_hangul_core', 'shared core reason');
    assert(
        unclear[0].candidates.some((c) => c.id === 'stu_b'),
        'Hangul peer first'
    );
    assert(
        unclear[0].candidates.some((c) => c.id === 'stu_c'),
        'full cohort map list includes other students'
    );
    assert(
        unclear[0].candidates.some((c) => c.id === 'stu_a'),
        'off_roster included in map candidates'
    );
}

// Resolution add keeps diamond name (forced add even though keys match)
{
    const existing = [{ id: 'stu_a', name: '권이안', tags: [] }];
    const key = D.koreanMatchKey('권이안◆');
    const result = D.mergeRosterByKoreanName(existing, [{ name: '권이안◆' }], {
        newStudentId: () => 'stu_new',
        studentResolutions: { [key]: { action: 'add' } }
    });
    assert(result.summary.added.length === 1, 'added disambiguated student');
    assert(result.summary.added[0].name === '권이안◆', 'kept diamond on add');
    assert(result.students.length === 2, 'both students remain');
}

// Resolution map adopts TMS identifying name so next Sync exact-matches
{
    const existing = [{ id: 'stu_a', name: '권이안', nameEn: 'Alice', tags: ['off_roster'] }];
    const key = D.koreanMatchKey('권이안◆');
    const result = D.mergeRosterByKoreanName(existing, [{ name: '권이안◆', nameEn: '' }], {
        studentResolutions: { [key]: { action: 'map', studentId: 'stu_a' } }
    });
    assert(result.summary.added.length === 0, 'no add on map');
    assert(result.summary.matched.some((m) => m.id === 'stu_a' && m.nameUpdated), 'mapped + renamed');
    const mapped = result.students.find((s) => s.id === 'stu_a');
    assert(mapped.name === '권이안◆', 'adopted TMS Hangul name');
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
    assert(mapped.name === '권이안◆', 'name from TMS');
    assert(mapped.nameEn === 'Ian', 'nameEn from TMS when present');
}

// Unresolved Latin-suffix unclear does not auto-add
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

// Remembered skip/map on cohort survive applyTmsRosterPlan
{
    const cohorts = [
        {
            id: 'coh1',
            name: 'Test',
            students: [
                { id: 'stu_a', name: '김민수', tags: [] },
                { id: 'stu_b', name: '이서연', tags: [] }
            ],
            tmsStudentResolutions: {}
        }
    ];
    const keyA = D.koreanMatchKey('김민수A');
    const keySkip = D.koreanMatchKey('김민수B');
    const plan = [
        {
            userAction: 'map',
            userTargetId: 'coh1',
            importCohortName: 'TMS',
            students: [
                { name: '김민수A', nameEn: 'Min' },
                { name: '이서연' },
                { name: '김민수B', nameEn: '' }
            ],
            studentResolutions: {
                [keyA]: { action: 'map', studentId: 'stu_a' },
                [keySkip]: { action: 'skip' }
            }
        }
    ];
    const applied = D.applyTmsRosterPlan(cohorts, plan, { newStudentId: () => 'stu_new' });
    const coh = applied.cohorts[0];
    assert(coh.students.find((s) => s.id === 'stu_a').name === '김민수A', 'map wrote TMS name');
    assert(coh.students.find((s) => s.id === 'stu_a').nameEn === 'Min', 'map wrote TMS English');
    assert(!coh.students.some((s) => s.name === '김민수B'), 'skip did not add');
    assert(coh.tmsStudentResolutions[keyA].action === 'map', 'map remembered');
    assert(coh.tmsStudentResolutions[keySkip].action === 'skip', 'skip remembered');

    // Next Sync: 김민수A exact-matches renamed student; 김민수B still unclear but skip is remembered.
    const tmsAgain = [
        { name: '김민수A', nameEn: 'Min' },
        { name: '이서연' },
        { name: '김민수B', nameEn: '' }
    ];
    const unclear = D.listUnclearTmsStudentMatches(coh.students, tmsAgain);
    assert(
        unclear.every((u) => u.tmsKey !== keyA),
        'mapped name no longer unclear'
    );
    assert(
        unclear.some((u) => u.tmsKey === keySkip),
        'skipped Latin variant still listed until memory applied'
    );
    const row = { studentResolutions: {} };
    const still = D.applyRememberedTmsStudentResolutions(coh, unclear, row);
    assert(still.length === 0, 'remembered skip clears review queue');
    assert(row.studentResolutions[keySkip].action === 'skip', 'memory applied skip');

    const second = D.mergeRosterByKoreanName(coh.students, tmsAgain, {
        studentResolutions: row.studentResolutions
    });
    assert(second.summary.added.length === 0, 'second sync does not add skipped name');
    assert(second.summary.matched.some((m) => m.id === 'stu_a'), 'second sync still matches mapped');
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
