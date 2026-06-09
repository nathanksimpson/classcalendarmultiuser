/**
 * Run: node tests/classroom-access.test.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ClassroomAccess = require(path.join(__dirname, '..', 'server', 'classroom-access.js'));

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const calendarData = {
    classes: [
        {
            id: 'class1',
            classTeachers: [{ userId: 'teacher1', category: 'RC' }]
        }
    ],
    cohorts: [
        {
            id: 'cohort1',
            name: '3M',
            homeroomTeacherUserId: 'homeroom1',
            students: [{ id: 's1', name: 'Kim', active: true }]
        }
    ],
    attendanceSessions: [],
    homeworkCompletions: []
};

const homeroom = { id: 'homeroom1', role: 'teacher' };
const teacher = { id: 'teacher1', role: 'teacher' };
const other = { id: 'other', role: 'teacher' };
const admin = { id: 'admin1', role: 'admin', permissions: ['manage_calendar_access'] };

const rosterEdit = ClassroomAccess.prepareClassroomForSave(homeroom, calendarData, {
    cohorts: [
        {
            ...calendarData.cohorts[0],
            students: [
                { id: 's1', name: 'Kim', active: true },
                { id: 's2', name: 'Park', active: true }
            ]
        }
    ]
});
assert(!rosterEdit.error, 'homeroom can edit roster');
assert(rosterEdit.merged.cohorts[0].students.length === 2, 'student added');

const rosterDenied = ClassroomAccess.prepareClassroomForSave(other, calendarData, {
    cohorts: [
        {
            ...calendarData.cohorts[0],
            students: [{ id: 's1', name: 'Hacked', active: true }]
        }
    ]
});
assert(rosterDenied.error && rosterDenied.error.includes('homeroom'), 'non-homeroom cannot edit roster');

const attendanceOk = ClassroomAccess.prepareClassroomForSave(teacher, calendarData, {
    attendanceSessions: [
        {
            id: 'a1',
            classId: 'class1',
            date: '2026-06-09',
            records: [{ studentId: 's1', status: 'present', sessionNote: '' }]
        }
    ]
});
assert(!attendanceOk.error, 'assigned teacher can save attendance');
assert(attendanceOk.merged.attendanceSessions[0].authorUserId === 'teacher1', 'stamped author');

const attendanceDenied = ClassroomAccess.prepareClassroomForSave(other, calendarData, {
    attendanceSessions: [
        {
            id: 'a1',
            classId: 'class1',
            date: '2026-06-09',
            records: []
        }
    ]
});
assert(attendanceDenied.error && attendanceDenied.error.includes('teach'), 'other teacher blocked');

const adminRoster = ClassroomAccess.prepareClassroomForSave(admin, calendarData, {
    cohorts: calendarData.cohorts
});
assert(!adminRoster.error, 'admin bypass for roster');

console.log('classroom-access.test.mjs: all passed');
