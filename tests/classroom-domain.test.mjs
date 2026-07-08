/**
 * Run: node tests/classroom-domain.test.mjs
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

const cohorts = [
    {
        id: 'c1',
        name: '3M',
        students: [
            { id: 's1', name: 'Kim', sortOrder: 0, active: true },
            { id: 's2', name: 'Lee', sortOrder: 1, active: true }
        ]
    },
    {
        id: 'c2',
        name: '3T',
        students: [{ id: 's2', name: 'Lee (T)', sortOrder: 0, active: true }]
    }
];

const classSingle = { id: 'cls1', cohortIds: ['c1'] };
const classCombined = { id: 'cls2', cohortIds: ['c1', 'c2'] };

const singleStudents = d.resolveStudentsForClass(classSingle, cohorts);
assert(singleStudents.length === 2, 'single cohort resolves 2 students');
assert(singleStudents[0].student.name === 'Kim', 'sorted by sortOrder');

const combined = d.resolveStudentsForClass(classCombined, cohorts);
assert(combined.length === 2, 'combined cohorts dedupe by student id');
assert(combined.some((e) => e.student.id === 's1'), 's1 from c1');
assert(combined.some((e) => e.student.id === 's2'), 's2 once');

let sessions = [];
const session = {
    id: 'att1',
    classId: 'cls1',
    date: '2026-06-09',
    records: [{ studentId: 's1', status: 'present', sessionNote: '' }]
};
sessions = d.upsertAttendanceSession(sessions, session);
sessions = d.upsertAttendanceSession(sessions, {
    ...session,
    records: [{ studentId: 's1', status: 'absent', sessionNote: 'sick' }]
});
assert(sessions.length === 1, 'upsert attendance replaces same class+date');
assert(sessions[0].records[0].status === 'absent', 'attendance record updated');

const migrated = { cohorts: [{ id: 'x', name: 'X' }] };
assert(d.migrateClassroomData(migrated) === true, 'migrate adds arrays');
assert(Array.isArray(migrated.attendanceSessions), 'attendanceSessions init');
assert(Array.isArray(migrated.cohorts[0].students), 'cohort students init');
assert(Array.isArray(migrated.debateTeamSessions), 'debateTeamSessions init');
assert(Array.isArray(migrated.debateCustomFormats), 'debateCustomFormats init');

let debateSessions = [];
const debateEntry = {
    id: 'dts1',
    classId: 'cls1',
    date: '2026-07-07',
    sessionState: { students: ['Kim'], settings: { formatId: 'simson' } },
    studentIds: ['s1']
};
debateSessions = d.upsertDebateTeamSession(debateSessions, debateEntry);
debateSessions = d.upsertDebateTeamSession(debateSessions, {
    ...debateEntry,
    sessionState: { students: ['Kim', 'Lee'], settings: { formatId: 'ap' } }
});
assert(debateSessions.length === 1, 'upsert debate session replaces same class+date');
assert(debateSessions[0].sessionState.settings.formatId === 'ap', 'debate session updated');
const found = d.findDebateTeamSession(debateSessions, 'cls1', '2026-07-07');
assert(found && found.id === 'dts1', 'findDebateTeamSession by class+date');

const customFmt = d.normalizeDebateCustomFormat({
    id: 'dcf1',
    name: 'Custom',
    govName: 'Gov',
    oppName: 'Opp',
    govRoles: ['PM'],
    oppRoles: ['LO']
});
assert(customFmt && customFmt.name === 'Custom', 'normalizeDebateCustomFormat');

const today = d.todayISO();
const yesterday = d.addDaysISO(today, -1);
const tomorrow = d.addDaysISO(today, 1);

const essayClass = {
    id: 'cls-essay',
    name: '3M Essay',
    classTypeId: 'builtin-debate',
    grade: '3',
    levelPreset: 'Garam',
    subject: 'Writing',
    cohortIds: ['c1'],
    syllabusRows: [
        {
            id: 'row1',
            kind: 'lesson',
            date: yesterday,
            planTitle: 'Essay 1'
        }
    ]
};

const essaySubmissionPastDue = {
    id: 'es1',
    classId: 'cls-essay',
    syllabusRowId: 'row1',
    lessonDate: yesterday,
    ssDueDate: yesterday,
    records: [
        { studentId: 's1', status: 'not_submitted', submittedRetest: false, note: '' },
        { studentId: 's2', status: 'submitted', submittedRetest: false, note: '' }
    ]
};

assert(
    d.essayOverdueNotSubmittedCount(essaySubmissionPastDue, yesterday, 2) === 1,
    'OD counts not_submitted when SS due is past'
);
assert(
    d.essayOverdueNotSubmittedCount(essaySubmissionPastDue, today, 2) === 0,
    'OD excludes due today'
);
assert(
    d.essayOverdueNotSubmittedCount(essaySubmissionPastDue, tomorrow, 2) === 0,
    'OD excludes future due dates'
);

const classAlerts = d.essayAlertCountsForClass([essaySubmissionPastDue], essayClass, cohorts);
assert(classAlerts.od === 1, 'class OD aggregates assignment');
assert(classAlerts.rs === 0, 'class RS zero without resubmits');

const resubmitSubmission = {
    id: 'es2',
    classId: 'cls-essay',
    syllabusRowId: 'row1',
    records: [
        {
            studentId: 's1',
            status: 'resubmit_required',
            submittedRetest: true,
            note: 'Fix intro'
        }
    ]
};
const resubmitRows = d.listEssayResubmitRows(
    {
        classes: [essayClass],
        cohorts,
        essaySubmissions: [resubmitSubmission]
    },
    { classes: [essayClass] }
);
assert(resubmitRows.length === 1, 'listEssayResubmitRows returns resubmit students');
assert(resubmitRows[0].studentName === 'Kim', 'resubmit row resolves student name');
assert(resubmitRows[0].note === 'Fix intro', 'resubmit row includes note');
assert(resubmitRows[0].submittedRetest === true, 'resubmit row includes retest flag');

assert(
    d.formatEssayClassAlertSuffix({ rs: 1, od: 3 }) === ' RS:1 OD:3',
    'formatEssayClassAlertSuffix builds RS/OD suffix'
);
assert(d.formatEssayClassAlertSuffix({ rs: 0, od: 0 }) === '', 'formatEssayClassAlertSuffix omits zeros');

const assignments = d.listEssayAssignmentsForClass(
    essayClass,
    { essaySubmissions: [essaySubmissionPastDue], cohorts }
);
assert(assignments.length === 1, 'listEssayAssignmentsForClass returns essay rows');
assert(assignments[0].od === 1, 'assignment summary includes OD');

assert(assignments[0].od === 1, 'assignment summary includes OD');

const genericClass = {
    id: 'cls-generic',
    name: '3M Regular',
    cohortIds: ['c1'],
    syllabusRows: [
        { id: 'row-g1', kind: 'lesson', date: yesterday, planTitle: 'Lesson 5' },
        { id: 'row-g2', kind: 'lesson', date: today, planTitle: 'Vocabulary review' }
    ]
};
assert(
    d.getEssayRowsFromSyllabus(genericClass.syllabusRows).length === 0,
    'generic lessons are not essay rows without fallback'
);

const explicitEssayClass = {
    id: 'cls-explicit',
    syllabusRows: [
        { id: 'row-e1', kind: 'lesson', date: today, planTitle: 'Writing', trackEssay: true }
    ]
};
assert(
    d.getEssayRowsFromSyllabus(explicitEssayClass.syllabusRows).length === 1,
    'trackEssay true includes non-keyword row'
);

const optedOutClass = {
    id: 'cls-optout',
    syllabusRows: [
        { id: 'row-o1', kind: 'lesson', date: today, planTitle: 'Essay 2', trackEssay: false }
    ]
};
assert(
    d.getEssayRowsFromSyllabus(optedOutClass.syllabusRows).length === 0,
    'trackEssay false excludes keyword row'
);

const reparseTarget = {
    id: 'cls-reparse',
    syllabusRows: [
        { id: 'row-r1', kind: 'lesson', date: today, planTitle: 'Essay draft' },
        { id: 'row-r2', kind: 'lesson', date: today, planTitle: 'Grammar' }
    ]
};
const reparseResult = d.reparseEssayFlagsForClass(reparseTarget);
assert(reparseResult.essayRowsFound === 1, 'reparse finds one essay row');
assert(
    reparseResult.rows.find((row) => row.id === 'row-r1').trackEssay === true,
    'reparse marks essay row true'
);
assert(
    reparseResult.rows.find((row) => row.id === 'row-r2').trackEssay === false,
    'reparse marks non-essay row false'
);

const orphanData = {
    essaySubmissions: [
        { id: 'es-orphan', classId: 'cls-reparse', syllabusRowId: 'row-r2', records: [] },
        { id: 'es-keep', classId: 'cls-reparse', syllabusRowId: 'row-r1', records: [] }
    ]
};
const reparseClass = Object.assign({}, reparseTarget, { syllabusRows: reparseResult.rows });
assert(d.pruneOrphanEssaySubmissions(orphanData, reparseClass) === 1, 'prune removes orphan submissions');
assert(orphanData.essaySubmissions.length === 1, 'prune keeps essay submission');
assert(orphanData.essaySubmissions[0].syllabusRowId === 'row-r1', 'prune keeps correct row');

const teacherPendingSubmission = {
    id: 'es-te',
    classId: 'cls-essay',
    syllabusRowId: 'row1',
    records: [
        { studentId: 's1', status: 'submitted', submittedRetest: false, note: '' },
        { studentId: 's2', status: 'complete', submittedRetest: false, note: '' }
    ]
};
assert(
    d.isEssayTeacherEvalOverdue(teacherPendingSubmission, yesterday) === true,
    'teacher eval overdue when received students await grading'
);
const teacherDoneSubmission = {
    id: 'es-te2',
    classId: 'cls-essay',
    syllabusRowId: 'row1',
    records: [
        { studentId: 's1', status: 'complete', submittedRetest: false, note: '' },
        { studentId: 's2', status: 'resubmit_required', submittedRetest: false, note: '' }
    ]
};
assert(
    d.isEssayTeacherEvalOverdue(teacherDoneSubmission, yesterday) === false,
    'teacher eval not overdue when grading finished'
);

const outstandingRows = d.listEssayOutstandingStudentRows(
    {
        classes: [essayClass],
        cohorts,
        essaySubmissions: [
            {
                id: 'es-mixed',
                classId: 'cls-essay',
                syllabusRowId: 'row1',
                records: [
                    {
                        studentId: 's1',
                        status: 'resubmit_required',
                        submittedRetest: true,
                        note: 'Fix intro'
                    },
                    { studentId: 's2', status: 'submitted', submittedRetest: false, note: '' }
                ]
            }
        ]
    },
    { classes: [essayClass] }
);
assert(outstandingRows.length === 1, 'outstanding rows exclude submitted students');
assert(outstandingRows[0].status === 'resubmit_required', 'only resubmit student is outstanding');
assert(outstandingRows[0].studentName === 'Kim', 'outstanding row resolves student name');

const grouped = d.groupEssayStudentRowsByClass(resubmitRows);
assert(grouped.length === 1, 'groupEssayStudentRowsByClass returns one class');
assert(grouped[0].assignments.length === 1, 'grouped class has one assignment');
assert(grouped[0].assignments[0].students.length === 1, 'grouped assignment has one student');

console.log('classroom-domain.test.mjs: all passed');
