/**
 * Run: node tests/event-applicability.test.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const { targetFilterAppliesToClassCore } = require(path.join(root, 'shared', 'event-applicability-core.cjs'));

const GRADES = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3'];
const SECTIONS = ['Blue', 'Red', 'Navy'];

const ctx = {
    gradeTotal: GRADES.length,
    sectionTotal: SECTIONS.length,
    isElementaryGrade: (g) => String(g || '').startsWith('초'),
    isMiddleSchoolGrade: (g) => String(g || '').startsWith('중'),
    getClassSectionPreset: (c) => c.levelPreset || c.level || null
};

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const blueP1 = { id: 'blue-p1', name: 'Blue', grade: '중1', levelPreset: 'Blue' };
const blueP2 = { id: 'blue-p2', name: 'Blue', grade: '중1', levelPreset: 'Blue' };
const redP1 = { id: 'red-p1', name: 'Red', grade: '중1', levelPreset: 'Red' };

assert(
    targetFilterAppliesToClassCore({
        grades: ['중1'],
        classIds: [],
        excludedClassIds: ['blue-p2'],
        sectionLevels: [],
        allElementary: false,
        allMiddleSchool: false
    }, blueP1, ctx),
    'grade match with class exclusion keeps Blue P1'
);
assert(
    !targetFilterAppliesToClassCore({
        grades: ['중1'],
        classIds: [],
        excludedClassIds: ['blue-p2'],
        sectionLevels: [],
        allElementary: false,
        allMiddleSchool: false
    }, blueP2, ctx),
    'excludedClassIds removes Blue P2'
);

assert(
    targetFilterAppliesToClassCore({
        grades: ['중1'],
        sectionLevels: ['Blue'],
        classIds: [],
        excludedClassIds: [],
        allElementary: false,
        allMiddleSchool: false
    }, blueP1, ctx),
    'additive AND: 중1 + Blue includes Blue class'
);
assert(
    !targetFilterAppliesToClassCore({
        grades: ['중1'],
        sectionLevels: ['Blue'],
        classIds: [],
        excludedClassIds: [],
        allElementary: false,
        allMiddleSchool: false
    }, redP1, ctx),
    'additive AND: 중1 + Blue excludes Red section'
);

assert(
    !targetFilterAppliesToClassCore({
        classIds: ['blue-p2'],
        classNames: ['Blue'],
        excludedClassIds: [],
        grades: ['중2'],
        sectionLevels: [],
        allElementary: false,
        allMiddleSchool: false
    }, blueP2, ctx),
    'explicit class id does not bypass unchecked grade category'
);

assert(
    targetFilterAppliesToClassCore({
        classIds: ['blue-p2'],
        classNames: ['Blue'],
        excludedClassIds: [],
        grades: [],
        sectionLevels: [],
        allElementary: false,
        allMiddleSchool: false
    }, blueP2, ctx),
    'class-only whitelist still works without broad filters'
);

assert(
    !targetFilterAppliesToClassCore({
        classIds: ['blue-p2'],
        classNames: ['Blue'],
        excludedClassIds: [],
        grades: [],
        sectionLevels: [],
        allElementary: false,
        allMiddleSchool: false
    }, blueP1, ctx),
    'class-only whitelist excludes sibling with same name'
);

console.log('event-applicability.test.mjs: all passed');
