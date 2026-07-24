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

// --- Applicability: same-name siblings + exclusion precedence ---
function eventAppliesToClass(event, classData) {
    if (!event || !classData) {
        return false;
    }
    const classId = String(classData.id || '').trim();
    const excludedClassIds = Array.isArray(event.excludedClassIds) ? event.excludedClassIds : [];
    if (classId && excludedClassIds.includes(classId)) {
        return false;
    }
    const classIds = Array.isArray(event.classIds) ? event.classIds : [];
    const hasClassNames = event.classNames && event.classNames.length > 0;
    const hasClassIds = classIds.length > 0;
    const hasGrades = event.grades && event.grades.length > 0;
    const hasSections = event.sectionLevels && event.sectionLevels.length > 0;
    const hasBroadFilters = hasGrades || hasSections
        || event.allElementary === true
        || event.allMiddleSchool === true;
    if (!hasClassIds && !hasClassNames && !hasBroadFilters) {
        return true;
    }
    if (hasClassIds && classId && classIds.includes(classId)) {
        return true;
    }
    if (!hasClassIds && hasClassNames && event.classNames.includes(classData.name)) {
        return true;
    }
    if (!hasBroadFilters) {
        return false;
    }
    if (hasGrades && event.grades.includes(classData.grade)) {
        return true;
    }
    return false;
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

console.log('class-filter-contracts.test.mjs: all passed');
