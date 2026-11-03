/**
 * Semantics-level regression tests for class filter contracts.
 * Run: node tests/class-filter-contracts.test.mjs
 *
 * Covers:
 * - same-name class siblings + event applicability exclusions
 * - teacher identity: userId wins over fuzzy display-name match
 * - cohort event filtering using real eventAppliesToClass semantics
 * - daily print class resolution stays date/my-classes scoped
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import vm from 'vm';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

function loadScript(relPath) {
    const code = readFileSync(path.join(root, relPath), 'utf8');
    const sandbox = { window: globalThis, globalThis, module: { exports: {} } };
    vm.runInNewContext(code, sandbox);
    return sandbox;
}

const require = createRequire(import.meta.url);
const { targetFilterAppliesToClassCore } = require(path.join(root, 'shared', 'event-applicability-core.cjs'));

const ctx = {
    gradeTotal: 9,
    sectionTotal: 12,
    isElementaryGrade: (g) => String(g || '').startsWith('초'),
    isMiddleSchoolGrade: (g) => String(g || '').startsWith('중'),
    getClassSectionPreset: (c) => c.levelPreset || null
};

// --- Applicability: same-name siblings + exclusion precedence ---
function eventAppliesToClass(event, classData) {
    if (!event || !classData) {
        return false;
    }
    const hasAny = (Array.isArray(event.grades) && event.grades.length > 0)
        || (Array.isArray(event.classIds) && event.classIds.length > 0)
        || (Array.isArray(event.classNames) && event.classNames.length > 0)
        || (Array.isArray(event.sectionLevels) && event.sectionLevels.length > 0)
        || (Array.isArray(event.excludedClassIds) && event.excludedClassIds.length > 0)
        || event.allElementary === true
        || event.allMiddleSchool === true;
    if (!hasAny) {
        return true;
    }
    return targetFilterAppliesToClassCore(event, classData, ctx);
}

{
    const blueP1 = { id: 'blue-p1', name: 'Blue', grade: '중1', cohortIds: ['cohort-a'] };
    const blueP2 = { id: 'blue-p2', name: 'Blue', grade: '중1', cohortIds: ['cohort-b'] };
    const holiday = {
        id: 'h1',
        type: 'holiday',
        grades: ['중1'],
        classIds: [],
        excludedClassIds: ['blue-p2'],
        classNames: [],
        sectionLevels: []
    };
    assert(eventAppliesToClass(holiday, blueP1), 'broad grade include keeps Blue P1');
    assert(!eventAppliesToClass(holiday, blueP2), 'excludedClassIds overrides broad include for Blue P2');
}

// --- Teacher identity: both sides have userIds → never fuzzy-match names ---
function lessonFilterTeacherNamesMatch(a, b) {
    const left = String(a || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const right = String(b || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!left || !right) {
        return false;
    }
    if (left === right) {
        return true;
    }
    if (left.includes(right) || right.includes(left)) {
        return true;
    }
    const lt = left.split(/[\s,]+/).filter(Boolean);
    const rt = right.split(/[\s,]+/).filter(Boolean);
    return Boolean(lt[0] && rt[0] && lt[0] === rt[0]);
}

function lessonFilterTeacherMatchesRef(ref, selector) {
    if (!ref || !selector) {
        return false;
    }
    const uid = String(selector.userId || '').trim();
    const refUid = String(ref.userId || ref.assignedTeacherUserId || '').trim();
    const refName = ref.displayName || ref.name || ref.assignedTeacherName || '';
    const selName = selector.displayName || '';
    if (uid && refUid) {
        return uid === refUid;
    }
    return lessonFilterTeacherNamesMatch(selName, refName);
}

{
    const selector = { userId: 'teacher-a', displayName: 'Nathan Kim' };
    const otherTeacherSameFirstName = { userId: 'teacher-b', displayName: 'Nathan Kimson' };
    assert(
        !lessonFilterTeacherMatchesRef(otherTeacherSameFirstName, selector),
        'different userIds must not match via fuzzy first-name'
    );
    assert(
        lessonFilterTeacherMatchesRef({ userId: 'teacher-a', displayName: 'Nate' }, selector),
        'matching userIds still match even when display names differ'
    );
    assert(
        lessonFilterTeacherMatchesRef({ name: 'Nathan Kim' }, selector),
        'legacy row without userId may still match by display name'
    );
}

// --- Cohort event filtering uses eventAppliesToClass ---
{
    const sandbox = loadScript('js/cohort-sidebar-filter.js');
    const CF = sandbox.window.CCPCohortSidebarFilter;
    assert(CF && CF.filterEventsByCohort, 'cohort sidebar filter module loaded');

    const classes = [
        { id: 'blue-p1', name: 'Blue', grade: '중1', cohortIds: ['cohort-a'] },
        { id: 'blue-p2', name: 'Blue', grade: '중1', cohortIds: ['cohort-b'] },
        { id: 'navy', name: 'Navy', grade: '중2', cohortIds: ['cohort-a'] }
    ];
    const events = [
        {
            id: 'ev-grade',
            type: 'holiday',
            grades: ['중1'],
            classIds: [],
            excludedClassIds: [],
            classNames: []
        },
        {
            id: 'ev-except-p2',
            type: 'holiday',
            grades: ['중1'],
            classIds: [],
            excludedClassIds: ['blue-p2'],
            classNames: []
        },
        {
            id: 'ev-only-p2',
            type: 'holiday',
            classIds: ['blue-p2'],
            grades: [],
            excludedClassIds: [],
            classNames: []
        },
        {
            id: 'ev-schoolwide',
            type: 'holiday',
            grades: [],
            classIds: [],
            excludedClassIds: [],
            classNames: []
        }
    ];

    const forCohortA = CF.filterEventsByCohort(events, 'cohort-a', classes, {
        eventAppliesToClass
    });
    const idsA = forCohortA.map((e) => e.id);
    assert(idsA.includes('ev-grade'), 'cohort A sees grade-중1 holiday via Blue P1');
    assert(idsA.includes('ev-except-p2'), 'cohort A still sees except-P2 holiday via Blue P1');
    assert(!idsA.includes('ev-only-p2'), 'cohort A does not see P2-only holiday');
    assert(idsA.includes('ev-schoolwide'), 'cohort A sees school-wide holiday');

    const forCohortB = CF.filterEventsByCohort(events, 'cohort-b', classes, {
        eventAppliesToClass
    });
    const idsB = forCohortB.map((e) => e.id);
    assert(idsB.includes('ev-grade'), 'cohort B sees grade-중1 holiday via Blue P2');
    assert(!idsB.includes('ev-except-p2'), 'cohort B does not see holiday that excludes Blue P2');
    assert(idsB.includes('ev-only-p2'), 'cohort B sees P2-only holiday');
}

// --- Daily print: date + myClassesOnly (cohort applied upstream in app.js) ---
{
    const DSP = loadScript('js/daily-summary-print.js').window.CCPDailySummaryPrint;
    assert(DSP && DSP.resolveClassesForDailyPrint, 'daily summary print module loaded');
    const classes = [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
        { id: 'c', name: 'Gamma' }
    ];
    const resolved = DSP.resolveClassesForDailyPrint(classes, {
        referenceDate: '2026-06-10',
        myClassesOnly: true,
        assignedClassIds: new Set(['a', 'c']),
        classOccursOnIsoDate: (c) => c.id === 'a' || c.id === 'b'
    });
    assert(resolved.length === 1 && resolved[0].id === 'a',
        'daily print intersects date-occurs with my-classes assignment');
}

// --- Phase 6: local "My classes only" boxes stay, but show the header scope's effective value ---
{
    const appSrc = readFileSync(path.join(root, 'app.js'), 'utf8');
    const booksSrc = readFileSync(path.join(root, 'js', 'classroom-debate-books.js'), 'utf8');
    const scopeSrc = readFileSync(path.join(root, 'js', 'class-scope.js'), 'utf8');
    [
        ['homework', appSrc],
        ['notes', appSrc],
        ['debateBooksSummary', booksSrc]
    ].forEach(([screen, src]) => {
        assert(src.includes(`effectiveMine('${screen}')`), `${screen} checkbox shows the effective value`);
        assert(src.includes(`setOverride('${screen}'`), `${screen} checkbox writes a local override`);
        assert(scopeSrc.includes(`'${screen}'`), `${screen} is a known class-scope screen`);
    });
    assert(appSrc.includes("getElementById('homeworkMyClassesOnly')"), 'homework checkbox kept');
    assert(appSrc.includes("getElementById('classNotesMyClassesOnly')"), 'notes checkbox kept');
    assert(booksSrc.includes("getElementById('debateBookClassSummaryMyClassesOnly')"), 'debate books checkbox kept');
    assert(/function onClassScopeChanged[\s\S]{0,400}applyLessonFilterJustMine\(\)[\s\S]{0,80}resetLessonFilters\(\)/.test(appSrc),
        'header change resets the Calendar lesson filter (Mine → Just my classes, All → reset)');
}

// --- Holiday Applies To / Except: UI normalizations never change who a holiday applies to ---
{
    const allGrades = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3'];
    const fullCtx = { ...ctx, gradeTotal: allGrades.length };
    const sample = [
        { id: 'e1', name: 'Sun', grade: '초3' },
        { id: 'm1', name: 'Blue', grade: '중1' },
        { id: 'm2', name: 'Navy', grade: '중2' }
    ];
    const applies = (target) => sample.map((c) => targetFilterAppliesToClassCore(target, c, fullCtx));
    const base = { classIds: [], classNames: [], sectionLevels: [], allElementary: false, allMiddleSchool: false };

    // Full grade list + exception (legacy) === no grades + same exception (normalized "Whole school except").
    const legacyFull = { ...base, grades: allGrades, excludedClassIds: ['m2'] };
    const normalizedFull = { ...base, grades: [], excludedClassIds: ['m2'] };
    assert(JSON.stringify(applies(legacyFull)) === JSON.stringify(applies(normalizedFull)),
        'full grade list normalizes to Any without changing results');
    assert(JSON.stringify(applies(normalizedFull)) === JSON.stringify([true, true, false]),
        'Whole school except Navy');

    // Both school bands (legacy) === neither band (normalized Any).
    const bothBands = { ...base, grades: ['중1'], excludedClassIds: [], allElementary: true, allMiddleSchool: true };
    const noBands = { ...bothBands, allElementary: false, allMiddleSchool: false };
    assert(JSON.stringify(applies(bothBands)) === JSON.stringify(applies(noBands)),
        'both bands checked equals band Any');

    // Groups + Except: middle school band except Blue.
    const groupsExcept = { ...base, grades: [], excludedClassIds: ['m1'], allMiddleSchool: true };
    assert(JSON.stringify(applies(groupsExcept)) === JSON.stringify([false, false, true]),
        'Groups (middle school) except Blue');

    // Specific classes: only those.
    const onlyClasses = { ...base, grades: [], excludedClassIds: [], classIds: ['e1'] };
    assert(JSON.stringify(applies(onlyClasses)) === JSON.stringify([true, false, false]),
        'Specific classes applies only to those');

    // Legacy broad + classIds: core ignores classIds, so the editor must clear them on load.
    const legacyBroadWithIds = { ...base, grades: allGrades, excludedClassIds: [], classIds: ['e1'] };
    assert(JSON.stringify(applies(legacyBroadWithIds)) === JSON.stringify([true, true, true]),
        'core ignores classIds once a broad filter is set');

    const appSrc = readFileSync(path.join(root, 'app.js'), 'utf8');
    assert(/function normalizeEventApplicabilityDraft[\s\S]{0,600}SCHOOL_GRADE_OPTIONS\.length[\s\S]{0,400}allElementary && d\.allMiddleSchool/.test(appSrc),
        'editor normalizes full grade list and both bands');
    assert(/function loadEventApplicabilityDraftFromHoliday[\s\S]{0,900}if \(hadBroad\) \{\s*d\.classIds = \[\];/.test(appSrc),
        'editor clears classIds the core would ignore');
    assert(appSrc.includes("const EVENT_APPLIES_SCOPES = ['all', 'groups', 'classes'];"),
        'Applies To has Whole school / Groups / Specific classes');
}

console.log('class-filter-contracts.test.mjs: all passed');
