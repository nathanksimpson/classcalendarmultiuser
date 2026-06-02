/**
 * Run: node tests/cohort-class-links.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'teacher-timetable.js')).href);

const api = globalThis.CCPTeacherTimetable;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

/** Old bug: seed from stale cohort.classIds then re-link every listed class. */
function syncCohortLinksBroken(cohort, classes) {
    const ids = new Set(Array.isArray(cohort.classIds) ? cohort.classIds : []);
    classes.forEach((cls) => {
        if (api.classHasCohortId(cls, cohort.id)) {
            ids.add(cls.id);
        }
    });
    cohort.classIds = Array.from(ids);
    cohort.classIds.forEach((classId) => {
        const cls = classes.find((c) => c.id === classId);
        if (cls) {
            api.addClassCohortId(cls, cohort.id);
        }
    });
}

/** Fixed: cohort.classIds derived only from classes that still reference the cohort. */
function syncCohortLinksFixed(cohort, classes) {
    const ids = new Set();
    classes.forEach((cls) => {
        if (api.classHasCohortId(cls, cohort.id)) {
            ids.add(cls.id);
        }
    });
    cohort.classIds = Array.from(ids);
    cohort.classIds.forEach((classId) => {
        const cls = classes.find((c) => c.id === classId);
        if (cls) {
            api.addClassCohortId(cls, cohort.id);
        }
    });
}

const cohort = { id: 'cohort-a', classIds: ['class-1', 'class-2'] };
const classes = [
    { id: 'class-1', cohortIds: ['cohort-a'], cohortId: 'cohort-a' },
    { id: 'class-2', cohortIds: ['cohort-a'], cohortId: 'cohort-a' }
];

api.removeClassCohortId(classes[1], 'cohort-a');
syncCohortLinksBroken(cohort, classes);
assert(
    api.classHasCohortId(classes[1], 'cohort-a'),
    'broken sync re-links removed class from stale cohort.classIds'
);

cohort.classIds = ['class-1', 'class-2'];
classes[1].cohortIds = ['cohort-a'];
classes[1].cohortId = 'cohort-a';
api.removeClassCohortId(classes[1], 'cohort-a');
syncCohortLinksFixed(cohort, classes);
assert(
    !api.classHasCohortId(classes[1], 'cohort-a'),
    'fixed sync keeps class removed from cohort'
);
assert(
    cohort.classIds.length === 1 && cohort.classIds[0] === 'class-1',
    'fixed sync updates cohort.classIds'
);
assert(
    api.getCohortClassIds({ classes }, cohort).length === 1,
    'getCohortClassIds matches single remaining class'
);

cohort.classIds = ['class-1', 'deleted-class'];
assert(
    api.getCohortClassIds({ classes }, cohort).length === 1
        && api.getCohortClassIds({ classes }, cohort)[0] === 'class-1',
    'getCohortClassIds ignores orphan ids not in classes[]'
);

console.log('cohort-class-links.test.mjs: all passed');
