/**
 * Run: node tests/essay-class-filter.test.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

const domainCode = readFileSync(path.join(root, 'js', 'classroom-domain.js'), 'utf8');
const filterCode = readFileSync(path.join(root, 'js', 'essay-class-filter.js'), 'utf8');
const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(domainCode, sandbox);
vm.runInNewContext(filterCode, sandbox);

const { CCPEssayClassFilter, CCPClassroomDomain } = sandbox.window;

const classA = {
    id: 'c1',
    name: 'Alpha',
    classTeachers: [{ userId: 't1', name: 'Teacher One' }],
    syllabusRows: [{ kind: 'lesson', date: '2026-03-01', planTitle: 'Essay 1' }]
};

const classB = {
    id: 'c2',
    name: 'Beta',
    classTeachers: [{ userId: 't2', name: 'Teacher Two' }],
    syllabusRows: []
};

const classC = {
    id: 'c3',
    name: 'Gamma',
    classTeachers: [{ userId: 't1', name: 'Teacher One' }],
    syllabusRows: [{ kind: 'lesson', date: '2026-03-05', planTitle: 'Essay draft' }]
};

const classD = {
    id: 'c4',
    name: 'Delta',
    classTeachers: [{ userId: 't1', name: 'Teacher One' }],
    syllabusRows: [{ kind: 'lesson', date: '2026-03-06', planTitle: 'Lesson 3' }]
};

const ctx = {
    domain: CCPClassroomDomain,
    currentUserId: 't1',
    deps: {
        classIsMine: (c, userId) =>
            (c.classTeachers || []).some((row) => row.userId === userId)
    }
};

{
    const out = CCPEssayClassFilter.filterClassesForZoneContext(
        [classA, classB, classC],
        { essaysOnly: true },
        ctx
    );
    assert(out.length === 2 && out.every((c) => c.id === 'c1' || c.id === 'c3'), 'essaysOnly');
}

{
    const out = CCPEssayClassFilter.filterClassesForZoneContext(
        [classA, classB, classC],
        { myClassesOnly: true },
        ctx
    );
    assert(out.length === 2 && out.every((c) => c.id === 'c1' || c.id === 'c3'), 'myClassesOnly');
}

{
    assert(CCPEssayClassFilter.classHasEssayAssignments(classA, CCPClassroomDomain), 'class A has essays');
    assert(!CCPEssayClassFilter.classHasEssayAssignments(classB, CCPClassroomDomain), 'class B no essays');
    assert(!CCPEssayClassFilter.classHasEssayAssignments(classD, CCPClassroomDomain), 'class D generic lesson no essays');
}

{
    const out = CCPEssayClassFilter.filterClassesForZoneContext(
        [classA, classB, classC, classD],
        { essaysOnly: true },
        ctx
    );
    assert(
        out.length === 2 && out.every((c) => c.id === 'c1' || c.id === 'c3'),
        'essaysOnly excludes generic-lesson class'
    );
}

console.log('essay-class-filter.test.mjs: all passed');
