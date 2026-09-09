/**
 * Homeroom class access, counseling English enrich, off_roster sheet exclusion.
 * Run: node tests/classroom-access.test.mjs
 *      (this file also covers enrich + off_roster; run: node tests/homeroom-tms-en-offroster.test.mjs)
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ClassroomAccess = require(path.join(__dirname, '..', 'server', 'classroom-access.js'));
const tms = require(path.join(__dirname, '..', 'shared', 'tms-roster-core.cjs'));

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

function loadDomain() {
    const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'classroom-domain.js'), 'utf8');
    const sandbox = { console, window: {} };
    sandbox.window = sandbox;
    vm.runInNewContext(code, sandbox);
    return sandbox.CCPClassroomDomain;
}

// --- Homeroom can edit linked classes they do not teach ---
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
            students: [
                { id: 's1', name: 'Kim', active: true, tags: [] },
                {
                    id: 's-off',
                    name: 'OffGhost',
                    active: true,
                    tags: ['off_roster']
                }
            ]
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

assert(
    !ClassroomAccess.assertCanEditClass(homeroom, calendarData, 'debate1'),
    'homeroom can edit debate class linked to their cohort'
);
assert(
    !ClassroomAccess.assertCanEditClass(teacher, calendarData, 'class1'),
    'assigned teacher still allowed'
);
assert(
    ClassroomAccess.assertCanEditClass(other, calendarData, 'debate1'),
    'unrelated teacher denied'
);

const forHomeroom = ClassroomAccess.classesForUser(calendarData, homeroom);
assert(
    forHomeroom.some((c) => c.id === 'debate1') && forHomeroom.some((c) => c.id === 'class1'),
    'classesForUser includes homeroom-linked classes'
);

const essayOk = ClassroomAccess.prepareClassroomForSave(homeroom, calendarData, {
    essaySubmissions: [
        {
            id: 'es1',
            classId: 'debate1',
            syllabusRowId: 'row1',
            lessonDate: '2026-06-09',
            studentId: 's1',
            status: 'submitted'
        }
    ]
});
assert(!essayOk.error, 'homeroom can save essays for linked class: ' + (essayOk.error || ''));

const attendanceOk = ClassroomAccess.prepareClassroomForSave(homeroom, calendarData, {
    attendanceSessions: [
        {
            id: 'a1',
            classId: 'debate1',
            date: '2026-06-09',
            records: [{ studentId: 's1', status: 'present', sessionNote: '' }]
        }
    ]
});
assert(!attendanceOk.error, 'homeroom can save attendance for linked class');

const deniedMsg = ClassroomAccess.assertCanEditClass(other, calendarData, 'class1');
assert(
    deniedMsg && /homeroom/i.test(deniedMsg),
    'denial message mentions homeroom'
);

// --- Counseling English enrich ---
const fixture = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'tms', 'class-popup-counsel-english-snippet.html'),
    'utf8'
);
const mainStudents = tms.parseStudentsFromClassPopup(fixture);
assert(mainStudents.length === 3, 'fixture has 3 students');
// parseStudentsFromClassPopup enriches from 상담 txtenglishname (full EN).
assert(
    mainStudents.find((s) => s.mpidx === '36723').nameEn === 'Hyeonjun',
    'popup parse uses full counsel English Hyeonjun'
);
assert(
    mainStudents.find((s) => s.mpidx === '126672').nameEn === 'Benjamin',
    'popup parse uses full counsel English Benjamin'
);
assert(
    mainStudents.find((s) => s.mpidx === '109554').nameEn === 'Ian',
    'short counsel English kept as Ian'
);

const byMpidx = tms.parseCounselingEnglishByMpidx(fixture);
assert(byMpidx.get('36723') === 'Hyeonjun', 'counsel Hyeonjun');
assert(byMpidx.get('126672') === 'Benjamin', 'counsel Benjamin');
assert(byMpidx.get('109554') === 'Ian', 'counsel Ian');

// Enrich upgrades truncated main-list paren hints when called standalone.
const truncated = [
    { name: '신현준', nameEn: 'Hyeonj', mpidx: '36723' },
    { name: '고영후', nameEn: 'Benjam', mpidx: '126672' },
    { name: '권이안', nameEn: 'Ian', mpidx: '109554' }
];
const enriched = tms.enrichStudentsWithCounselingEnglish(truncated, fixture);
assert(
    enriched.find((s) => s.mpidx === '36723').nameEn === 'Hyeonjun',
    'enrich replaces truncated English'
);
assert(
    enriched.find((s) => s.mpidx === '126672').nameEn === 'Benjamin',
    'enrich Benjamin full'
);
assert(
    enriched.find((s) => s.mpidx === '109554').nameEn === 'Ian',
    'short counsel English kept'
);

// Prefer longer counseling over shorter main
const softSrc = [{ name: 'X', nameEn: 'Abc', mpidx: '1' }];
const soft = tms.enrichStudentsWithCounselingEnglish(softSrc, '');
assert(soft[0].nameEn === 'Abc', 'empty html soft-fails');
assert(soft[0] !== softSrc[0], 'enrich returns new objects');

// --- adopt prefers longer nameEn ---
const D = loadDomain();
const merged = D.mergeRosterByKoreanName(
    [{ id: 'stu_a', name: '신현준', nameEn: 'Old', tags: [], active: true }],
    [{ name: '신현준', nameEn: 'Hyeonjun', mpidx: '36723' }]
);
assert(
    merged.students.find((s) => s.id === 'stu_a').nameEn === 'Hyeonjun',
    'merge adopts full TMS English'
);

// --- off_roster excluded from class sheets ---
const resolved = D.resolveStudentsForClass(
    { id: 'debate1', cohortIds: ['cohort1'] },
    calendarData.cohorts
);
assert(resolved.some((r) => r.student.id === 's1'), 'active student on sheet');
assert(
    !resolved.some((r) => r.student.id === 's-off'),
    'off_roster student hidden from class sheets'
);

console.log('homeroom-tms-en-offroster.test.mjs: all passed');
