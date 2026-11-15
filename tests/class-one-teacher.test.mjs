/**
 * One teacher and one curriculum per class: the load-time tidy-up.
 * Run: node tests/class-one-teacher.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
await import(pathToFileURL(path.join(root, 'js', 'teacher-timetable.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'class-one-teacher.js')).href);
const TT = Object.assign({}, globalThis.CCPTeacherTimetable, globalThis.CCPClassOneTeacher);

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}
const pl = (c) => (c.placements || []).map((p) => `${p.dow}:${p.period}`).sort().join(' ');

// Planner-written row (Fall sample shape): times move to the class, row keeps only who.
{
    const cls = {
        id: 'a', name: 'A', meetingDays: [1, 3, 5], period: 2, curriculumId: '',
        classTeachers: [{
            id: 'ct1', userId: 'u1', name: '박테라', category: 'GR', curriculumId: 'cur-x', classTypeId: '',
            meetingDays: [1, 3, 5], period: 2, periodByWeekday: { 1: 2, 3: 2, 5: 1 },
            placements: [{ dow: 1, period: 2 }, { dow: 3, period: 2 }, { dow: 5, period: 1 }], scheduleBlock: 'primary'
        }]
    };
    const r = TT.tidyClassToOneTeacher(cls);
    assert(r.changed, 'changed');
    assert(pl(cls) === '1:2 3:2 5:1', `placements lifted: ${pl(cls)}`);
    assert(cls.periodByWeekday['5'] === 1, 'per-day period lifted');
    assert(cls.curriculumId === 'cur-x', 'row curriculum fills an empty class curriculum');
    assert(JSON.stringify(cls.classTeachers) === JSON.stringify([{ id: 'ct1', userId: 'u1', name: '박테라', category: 'GR' }]),
        'row is only who teaches');
    assert(!r.droppedTeachers.length && !r.curriculumConflict, 'nothing to report');
    // Idempotent.
    assert(!TT.tidyClassToOneTeacher(cls).changed, 'second run changes nothing');
}

// Two teachers, differing curriculum: keep the first, report the rest.
{
    const cls = {
        id: 'b', name: 'B', meetingDays: [2, 4], period: 5, curriculumId: 'cur-class',
        classTeachers: [
            { id: 'x', userId: 'u1', name: 'One', curriculumId: 'cur-other', meetingDays: [], period: null, placements: [] },
            { id: 'y', userId: 'u2', name: 'Two' }
        ]
    };
    const r = TT.tidyClassToOneTeacher(cls);
    assert(cls.classTeachers.length === 1 && cls.classTeachers[0].userId === 'u1', 'first teacher kept');
    assert(r.droppedTeachers.join() === 'Two', 'second teacher reported');
    assert(r.curriculumConflict === 'cur-other' && cls.curriculumId === 'cur-class', 'class curriculum kept, conflict reported');
    assert(!cls.placements, 'inherit row: class times untouched');
}

// Class already has its own placements: the row's old times do not override them.
{
    const cls = {
        id: 'c', placements: [{ dow: 2, period: 6 }], meetingDays: [2],
        classTeachers: [{ id: 'z', userId: 'u', name: 'Z', placements: [{ dow: 4, period: 1 }] }]
    };
    TT.tidyClassToOneTeacher(cls);
    assert(pl(cls) === '2:6', 'class placements win');
}

// Setting the teacher replaces, never adds.
{
    const cls = { id: 'd', classTeachers: [{ id: 'a', userId: 'u1', name: 'A' }] };
    assert(TT.addTeacherRowToClass(cls, { userId: 'u2', displayName: 'B' }, {}), 'replaced');
    assert(cls.classTeachers.length === 1 && cls.classTeachers[0].userId === 'u2', 'one teacher');
    assert(!TT.addTeacherRowToClass(cls, { userId: 'u2', displayName: 'B' }, {}), 'same teacher: no change');
}

console.log('class-one-teacher.test.mjs: all passed');
