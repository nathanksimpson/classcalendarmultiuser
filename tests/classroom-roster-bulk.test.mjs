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

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const D = loadDomain();

{
    const cohorts = [
        {
            id: 'c1',
            name: 'Navy',
            students: [
                { id: 's1', name: '김민수', tags: ['new'], active: true },
                { id: 's2', name: '이서연', tags: [], active: true },
                { id: 's3', name: '박지훈', tags: ['interested'], active: true }
            ]
        }
    ];
    const updated = D.updateStudentsInCohort(cohorts, 'c1', ['s1', 's2'], {
        addTags: ['off_roster'],
        removeTags: ['new'],
        active: false
    });
    assert(!updated.error, 'update ok');
    assert(updated.updatedCount === 2, 'two updated');
    const s1 = updated.cohorts[0].students.find((s) => s.id === 's1');
    const s2 = updated.cohorts[0].students.find((s) => s.id === 's2');
    const s3 = updated.cohorts[0].students.find((s) => s.id === 's3');
    assert(s1.active === false && !s1.tags.includes('new') && s1.tags.includes('off_roster'), 's1 tags');
    assert(s2.active === false && s2.tags.includes('off_roster'), 's2 tags');
    assert(s3.active === true && s3.tags.includes('interested'), 's3 untouched');
}

{
    const cohorts = [
        {
            id: 'c1',
            name: 'Navy',
            students: [
                { id: 's1', name: '김민수', tags: [], active: true },
                { id: 's2', name: '이서연', tags: [], active: true }
            ]
        }
    ];
    const archived = D.archiveStudents(cohorts, ['s1', 's2'], 'c1', {
        archiveReason: 'break'
    });
    assert(!archived.error, 'archive ok');
    assert(archived.archivedCount === 2, 'two archived');
    const navy = archived.cohorts.find((c) => c.id === 'c1');
    const arch = archived.cohorts.find((c) => D.isArchiveCohort(c));
    assert(navy.students.length === 0, 'navy empty');
    assert(arch && arch.students.length === 2, 'archive has two');
}

console.log('classroom-roster-bulk.test.mjs: ok');
