/**
 * API policy contract tests (shared modules used by server + worker).
 * Run: node tests/api-lock-contract.test.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const Auth = require(path.join(root, 'shared', 'auth-permissions.cjs'));
const Classroom = require(path.join(root, 'shared', 'classroom-access-core.cjs'));

const teacher = { id: 't1', role: 'teacher', permissions: null };
const admin = { id: 'a1', role: 'admin', permissions: JSON.stringify(Auth.ROLE_PRESETS.admin) };

const calendarData = {
    classes: [
        {
            id: 'cls1',
            classTeachers: [{ userId: 't1', name: 'Kim' }]
        }
    ],
    cohorts: [],
    attendanceSessions: [],
    homeworkCompletions: [],
    studentPoints: [],
    studentTests: [],
    debateTeamSessions: [],
    debateCustomFormats: []
};

assert(Auth.hasPermission(admin, Auth.PERMS.FORCE_SAVE), 'admin force save');
assert(!Auth.hasPermission(teacher, Auth.PERMS.FORCE_SAVE), 'teacher no force save');

const blocked = Classroom.prepareClassroomForSave(teacher, calendarData, {
    attendanceSessions: [
        {
            id: 'att1',
            classId: 'cls-other',
            date: '2026-06-01',
            records: []
        }
    ]
});
assert(blocked.error, 'cannot edit other class attendance');

const allowed = Classroom.prepareClassroomForSave(teacher, calendarData, {
    studentPoints: [
        {
            id: 'pt1',
            classId: 'cls1',
            studentId: 's1',
            date: '2026-06-01',
            delta: 1,
            reason: 'good'
        }
    ]
});
assert(!allowed.error, 'points save allowed for assigned class');
assert(allowed.merged.studentPoints.length === 1, 'points merged');
assert(allowed.merged.studentPoints[0].authorUserId === 't1', 'author stamped');

const debateAllowed = Classroom.prepareClassroomForSave(teacher, calendarData, {
    debateTeamSessions: [
        {
            id: 'deb1',
            classId: 'cls1',
            date: '2026-06-01',
            sessionState: { students: ['A'], debates: [] }
        }
    ]
});
assert(!debateAllowed.error, 'debate save allowed for assigned class');
assert(debateAllowed.merged.debateTeamSessions[0].authorUserId === 't1', 'debate author stamped');

console.log('api-lock-contract.test.mjs: all passed');
