/**
 * Client CCPClassroomAccess: class-level + cohort 담임, cohorts arg.
 * Run: node tests/classroom-access-client.test.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const accessCode = readFileSync(path.join(root, 'js', 'classroom-access.js'), 'utf8');
const sandbox = {
    window: {},
    globalThis: {},
    TeamAuth: {
        hasPermission() {
            return false;
        },
        getUser() {
            return { id: 'homeroom1', role: 'teacher' };
        },
        isSignedIn() {
            return true;
        }
    }
};
sandbox.globalThis = sandbox.window;
sandbox.window.TeamAuth = sandbox.TeamAuth;
vm.runInNewContext(accessCode, sandbox);

const access = sandbox.window.CCPClassroomAccess;
assert(access, 'CCPClassroomAccess loaded');

const cohorts = [
    {
        id: 'cohort1',
        name: '3M',
        homeroomTeacherUserId: 'homeroom1'
    }
];

const taught = {
    id: 'class1',
    classTeachers: [{ userId: 'homeroom1', category: 'RC' }],
    cohortIds: ['cohort1']
};
const debateOnly = {
    id: 'debate1',
    classTeachers: [{ userId: 'debate-teacher', category: 'Debate' }],
    cohortIds: ['cohort1']
};
const classLevelHr = {
    id: 'solo',
    classTeachers: [{ userId: 'other', category: 'RC' }],
    cohortIds: [],
    homeroomTeacherUserId: 'homeroom1'
};
const unrelated = {
    id: 'other-class',
    classTeachers: [{ userId: 'other', category: 'RC' }],
    cohortIds: ['other-cohort']
};

assert(access.canEditClass(taught, cohorts), 'can edit taught class');
assert(access.canEditClass(debateOnly, cohorts), 'can edit cohort-HR linked debate class with cohorts arg');
assert(access.canEditClass(classLevelHr, []), 'can edit class-level HR with empty cohorts');
assert(!access.canEditClass(unrelated, cohorts), 'cannot edit unrelated class');

// Without cohorts arg and without window.appData, cohort-HR fails; class-level still works
sandbox.window.appData = { cohorts: [] };
assert(
    !access.canEditClass(debateOnly),
    'cohort-HR fails when cohorts missing from provider/window'
);
assert(access.canEditClass(classLevelHr), 'class-level HR still works without cohorts list');

access.setCohortsProvider(() => cohorts);
assert(access.canEditClass(debateOnly), 'setCohortsProvider restores cohort-HR access');

assert(access.isHomeroomForClass(debateOnly, cohorts), 'isHomeroomForClass cohort link');
assert(access.isHomeroomForClass(classLevelHr, []), 'isHomeroomForClass class-level');

console.log('classroom-access-client.test.mjs: all passed');
