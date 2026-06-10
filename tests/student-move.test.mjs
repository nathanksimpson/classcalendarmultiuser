/**
 * Run: node tests/student-move.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'classroom-domain.js')).href);

const d = globalThis.CCPClassroomDomain;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const baseCohorts = [
    {
        id: 'c-a',
        name: 'CohortA',
        students: [
            { id: 's1', name: 'One', sortOrder: 0, active: true, tags: [] },
            { id: 's2', name: 'Two', sortOrder: 1, active: true, tags: [] },
            { id: 's3', name: 'Three', sortOrder: 2, active: true, tags: [] }
        ]
    },
    {
        id: 'c-b',
        name: 'CohortB',
        students: [{ id: 's9', name: 'Nine', sortOrder: 0, active: true, tags: [] }]
    }
];

{
    const moved = d.moveStudentsBetweenCohorts(baseCohorts, 'c-a', 'c-b', ['s1', 's2']);
    assert(!moved.error, moved.error || 'move ok');
    assert(moved.movedCount === 2, 'moved count');
    const a = moved.cohorts.find((c) => c.id === 'c-a');
    const b = moved.cohorts.find((c) => c.id === 'c-b');
    assert(a.students.length === 1 && a.students[0].id === 's3', 'source trimmed');
    assert(b.students.length === 3, 'target gained');
    assert(b.students[1].id === 's1' && b.students[1].sortOrder === 1, 'sort order appended');
    assert(b.students[2].id === 's2' && b.students[2].sortOrder === 2, 'second sort order');
}

{
    const blocked = d.moveStudentsBetweenCohorts(
        [
            {
                id: 'c-a',
                name: 'A',
                students: [{ id: 's2', name: 'Two', sortOrder: 0, active: true, tags: [] }]
            },
            {
                id: 'c-b',
                name: 'B',
                students: [{ id: 's2', name: 'Dup', sortOrder: 0, active: true, tags: [] }]
            }
        ],
        'c-a',
        'c-b',
        ['s2']
    );
    assert(blocked.error === 'duplicate_in_target', 'duplicate blocked');
    assert(blocked.duplicates.includes('s2'), 'duplicate id listed');
}

{
    const same = d.moveStudentsBetweenCohorts(baseCohorts, 'c-a', 'c-a', ['s1']);
    assert(same.error === 'same_cohort', 'same cohort');

    const empty = d.moveStudentsBetweenCohorts(baseCohorts, 'c-a', 'c-b', []);
    assert(empty.error === 'no_students', 'empty ids');

    const archive = d.ensureArchiveCohort(baseCohorts, { homeroomTeacherUserId: 'u1' });
    const fromArchive = d.moveStudentsBetweenCohorts(
        archive.cohorts,
        archive.archiveCohort.id,
        'c-a',
        ['s1']
    );
    assert(fromArchive.error === 'archive_cohort', 'archive source blocked');
}

console.log('student-move.test.mjs: all passed');
