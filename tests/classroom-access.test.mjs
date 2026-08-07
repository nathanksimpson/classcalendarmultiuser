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
            classTeachers: [{ userId: 'teacher1', category: 'RC' }],
            cohortIds: ['cohort1']
        },
        {
            id: 'debate1',
            classTeachers: [{ userId: 'debate-teacher', category: 'Debate' }],
            cohortIds: ['cohort1']
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
    homeworkCompletions: [],
    essaySubmissions: [],
    debateTeamSessions: [],
    debateCustomFormats: []
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

const debateSessionOk = ClassroomAccess.prepareClassroomForSave(teacher, calendarData, {
    debateTeamSessions: [
        {
            id: 'dts1',
            classId: 'class1',
            date: '2026-06-09',
            sessionState: { students: ['Kim'], debates: [] }
        }
    ]
});
assert(!debateSessionOk.error, 'assigned teacher can save debate sessions');
assert(debateSessionOk.merged.debateTeamSessions[0].authorUserId === 'teacher1', 'debate session stamped author');

const debateSessionDenied = ClassroomAccess.prepareClassroomForSave(other, calendarData, {
    debateTeamSessions: [
        {
            id: 'dts1',
            classId: 'class1',
            date: '2026-06-09',
            sessionState: { students: ['Kim'], debates: [] }
        }
    ]
});
assert(debateSessionDenied.error && debateSessionDenied.error.includes('teach'), 'other teacher blocked from debate sessions');

const debateFormatOk = ClassroomAccess.prepareClassroomForSave(teacher, calendarData, {
    debateCustomFormats: [
        {
            id: 'fmt1',
            name: 'Custom AP',
            govRoles: ['PM'],
            oppRoles: ['LO']
        }
    ]
});
assert(!debateFormatOk.error, 'debate custom formats save allowed');
assert(debateFormatOk.merged.debateCustomFormats[0].authorUserId === 'teacher1', 'debate format stamped author');

// Homeroom of linked cohort can edit class sheets they do not teach
assert(
    !ClassroomAccess.assertCanEditClass(homeroom, calendarData, 'debate1'),
    'homeroom can edit debate class'
);
const homeroomAttendance = ClassroomAccess.prepareClassroomForSave(homeroom, calendarData, {
    attendanceSessions: [
        {
            id: 'a2',
            classId: 'debate1',
            date: '2026-06-10',
            records: [{ studentId: 's1', status: 'present', sessionNote: '' }]
        }
    ]
});
assert(!homeroomAttendance.error, 'homeroom can save attendance on linked class');
const forHomeroom = ClassroomAccess.classesForUser(calendarData, homeroom);
assert(
    forHomeroom.some((c) => c.id === 'debate1'),
    'classesForUser includes homeroom-linked debate class'
);
const denyMsg = ClassroomAccess.assertCanEditClass(other, calendarData, 'debate1');
assert(denyMsg && /homeroom/i.test(denyMsg), 'error mentions homeroom');

// Class-level homeroomTeacherUserId (no cohort 담임 match required)
const classLevelHrData = {
    classes: [
        {
            id: 'solo-hr-class',
            classTeachers: [{ userId: 'other-teacher', category: 'RC' }],
            cohortIds: [],
            homeroomTeacherUserId: 'class-hr-1'
        },
        {
            id: 'linked-but-class-hr',
            classTeachers: [{ userId: 'other-teacher', category: 'Debate' }],
            cohortIds: ['cohort-other'],
            homeroomTeacherUserId: 'class-hr-1'
        }
    ],
    cohorts: [
        {
            id: 'cohort-other',
            name: 'Other',
            homeroomTeacherUserId: 'someone-else',
            students: []
        }
    ],
    attendanceSessions: [],
    homeworkCompletions: [],
    essaySubmissions: []
};
const classHr = { id: 'class-hr-1', role: 'teacher' };
assert(
    !ClassroomAccess.assertCanEditClass(classHr, classLevelHrData, 'solo-hr-class'),
    'class-level HR can edit class with no cohort ids'
);
assert(
    !ClassroomAccess.assertCanEditClass(classHr, classLevelHrData, 'linked-but-class-hr'),
    'class-level HR wins even when cohort 담임 differs'
);
assert(
    ClassroomAccess.assertCanEditClass(other, classLevelHrData, 'solo-hr-class'),
    'unrelated teacher blocked from class-level HR class'
);
const forClassHr = ClassroomAccess.classesForUser(classLevelHrData, classHr);
assert(
    forClassHr.length === 2 && forClassHr.every((c) => c.homeroomTeacherUserId === 'class-hr-1'),
    'classesForUser includes class-level HR classes'
);

console.log('classroom-access.test.mjs: all passed');
