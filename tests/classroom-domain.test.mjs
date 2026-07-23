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
assert(singleStudents[0].student.name === 'Kim', 'sorted by Korean/English name (Kim before Lee)');

const hangulCohorts = [
    {
        id: 'c-ko',
        name: 'Hangul',
        students: [
            { id: 'h3', name: '이다은', sortOrder: 0, active: true },
            { id: 'h1', name: '김민지', sortOrder: 1, active: true },
            { id: 'h2', name: '박서준', sortOrder: 2, active: true }
        ]
    }
];
const hangulSorted = d.normalizeCohortStudents(hangulCohorts[0]);
assert(hangulSorted.map((s) => s.name).join(',') === '김민지,박서준,이다은', 'Hangul 가나다 order ignores sortOrder');
const hangulResolved = d.resolveStudentsForClass({ id: 'cls-ko', cohortIds: ['c-ko'] }, hangulCohorts);
assert(
    hangulResolved.map((e) => e.student.name).join(',') === '김민지,박서준,이다은',
    'resolveStudentsForClass uses Korean name order'
);
assert(d.compareStudentNames({ name: '김' }, { name: '이' }) < 0, 'compareStudentNames 김 before 이');

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
assert(Array.isArray(migrated.speakingTestRecords), 'speakingTestRecords init');

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

let speakingRecords = [];
const speakingEntry = {
    id: 'spk1',
    classId: 'cls1',
    settings: { studentSortMode: 'pasteOrder' },
    assignments: [{ id: 'spa1', title: 'Unit 1', date: '2026-03-01' }],
    scores: {
        s1: {
            spa1: [{ pronunciation: 'A', speed: 'B', intonation: 'A', grammar: 'C', content: 'A' }]
        }
    }
};
speakingRecords = d.upsertSpeakingTestRecord(speakingRecords, speakingEntry);
speakingRecords = d.upsertSpeakingTestRecord(speakingRecords, {
    ...speakingEntry,
    settings: { studentSortMode: 'alphabetical' },
    assignments: [
        { id: 'spa1', title: 'Unit 1', date: '2026-03-01' },
        { id: 'spa2', title: 'Unit 2', date: '2026-03-15' }
    ]
});
assert(speakingRecords.length === 1, 'upsert speaking record replaces same class');
assert(speakingRecords[0].settings.studentSortMode === 'alphabetical', 'speaking settings updated');
assert(speakingRecords[0].assignments.length === 2, 'speaking assignments updated');
const foundSpeaking = d.findSpeakingTestRecord(speakingRecords, 'cls1');
assert(foundSpeaking && foundSpeaking.id === 'spk1', 'findSpeakingTestRecord by classId');
const badSpeaking = d.normalizeSpeakingTestRecord({ id: 'x', classId: '' });
assert(badSpeaking === null, 'speaking record requires classId');

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
assert(classAlerts.ae === 1, 'class AE counts submitted awaiting eval');

const assignmentAlerts = d.essayAlertCountsForAssignment(essaySubmissionPastDue, yesterday, 2);
assert(assignmentAlerts.ae === 1, 'assignment AE counts submitted status');
assert(assignmentAlerts.od === 1, 'assignment OD still counts overdue not_submitted');
assert(
    d.essayAlertCountsForAssignment(null, yesterday, 2).ae === 0,
    'assignment AE is zero with no submission'
);

{
    const closedSubmission = {
        id: 'es-closed',
        classId: 'cls-essay',
        syllabusRowId: 'row1',
        lessonDate: yesterday,
        ssDueDate: yesterday,
        records: [
            { studentId: 's1', status: 'incomplete', submittedRetest: false, note: '' },
            { studentId: 's2', status: 'exempt', submittedRetest: false, note: '' }
        ]
    };
    assert(
        d.normalizeEssaySubmission(closedSubmission).records[0].status === 'incomplete',
        'normalize keeps incomplete'
    );
    assert(
        d.normalizeEssaySubmission(closedSubmission).records[1].status === 'exempt',
        'normalize keeps exempt'
    );
    assert(
        d.essayOverdueNotSubmittedCount(closedSubmission, yesterday, 2) === 0,
        'OD excludes incomplete and exempt'
    );
    assert(
        d.essayAlertCountsForAssignment(closedSubmission, yesterday, 2).od === 0,
        'assignment OD zero when overdue rows are closed'
    );
    const counts = d.countEssayByStatus(closedSubmission);
    assert(counts.incomplete === 1 && counts.exempt === 1, 'counts incomplete and exempt');
    assert(d.essayProgressDenominator(counts, 2) === 1, 'percent denom excludes exempt');
    assert(d.essayPercentComplete(counts, 2) === 0, 'percent complete zero with no complete');
    const outstanding = d.listEssayOutstandingStudentRows(
        {
            classes: [essayClass],
            cohorts,
            essaySubmissions: [closedSubmission]
        },
        { classes: [essayClass] }
    );
    assert(outstanding.length === 0, 'incomplete and exempt are not outstanding');
}

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
    d.formatEssayClassAlertSuffix({ rs: 1, od: 3, ae: 2 }) === ' RS:1 OD:3 AE:2',
    'formatEssayClassAlertSuffix builds RS/OD/AE suffix'
);
assert(d.formatEssayClassAlertSuffix({ rs: 0, od: 0, ae: 0 }) === '', 'formatEssayClassAlertSuffix omits zeros');
assert(
    d.formatEssayClassAlertSuffix({ rs: 0, od: 0, ae: 4 }) === ' AE:4',
    'formatEssayClassAlertSuffix can show AE alone'
);

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

const debateClass = {
    id: 'cls-debate',
    name: 'Debate A',
    scheduleModel: 'debateMonthly',
    syllabusRows: [
        { id: 'd1', kind: 'lesson', date: '2026-03-03', planTitle: 'Day 1', sessionNumber: 1 },
        { id: 'd2', kind: 'lesson', date: '2026-03-10', planTitle: 'Day 2', sessionNumber: 2 },
        { id: 'd3', kind: 'lesson', date: '2026-03-17', planTitle: 'Day 3', sessionNumber: 3 },
        { id: 'd4', kind: 'lesson', date: '2026-03-24', planTitle: 'Day 4 / Preview', sessionNumber: 4 },
        {
            id: 'd4b',
            kind: 'lesson',
            date: '2026-04-28',
            planTitle: 'Day 4 / Preview & Day 1 (month bridge)',
            sessionNumber: 4
        }
    ]
};
assert(d.classUsesDebateTeamAssignments(debateClass), 'debateMonthly class uses debate team assignments');
assert(!d.classUsesDebateTeamAssignments(genericClass), 'non-debate class does not use assignment picker');
assert(d.isDebateTeamAssignmentRow(debateClass.syllabusRows[3]), 'Day 4 row is debate team assignment');
assert(!d.isDebateTeamAssignmentRow(debateClass.syllabusRows[0]), 'Day 1 row is not debate team assignment');
assert(
    d.getDebateTeamRowsFromSyllabus(debateClass.syllabusRows).length === 2,
    'two Day 4 rows found for debate class'
);
const debateAssignments = d.listDebateTeamAssignmentsForClass(debateClass);
assert(debateAssignments.length === 2, 'listDebateTeamAssignmentsForClass returns two Day 4s');
assert(debateAssignments[0].date === '2026-03-24', 'first debate assignment is March Day 4');
assert(
    debateAssignments[0].assignmentLabel.includes('Day 4'),
    'debate assignment label includes Day 4'
);
assert(
    d.pickDefaultDebateTeamDate(debateClass, '2026-03-01') === '2026-03-24',
    'default debate date picks soonest Day 4 on or after ref'
);
assert(
    d.pickDefaultDebateTeamDate(debateClass, '2026-05-01') === '2026-04-28',
    'default debate date falls back to last Day 4 when all past'
);

{
    const multiMonthEssayClass = {
        id: 'cls-essay-months',
        syllabusRows: [
            {
                id: 'e-jun',
                kind: 'lesson',
                date: '2026-06-10',
                planTitle: 'June Essay',
                trackEssay: true,
                homework: 'essay draft'
            },
            {
                id: 'e-jul-early',
                kind: 'lesson',
                date: '2026-07-05',
                planTitle: 'July Early',
                trackEssay: true,
                homework: 'essay draft'
            },
            {
                id: 'e-jul-late',
                kind: 'lesson',
                date: '2026-07-20',
                planTitle: 'July Late',
                trackEssay: true,
                homework: 'essay draft'
            },
            {
                id: 'e-aug',
                kind: 'lesson',
                date: '2026-08-12',
                planTitle: 'August Essay',
                trackEssay: true,
                homework: 'essay draft'
            }
        ]
    };
    assert(d.sameCalendarMonth('2026-07-15', '2026-07-01') === true, 'sameCalendarMonth true');
    assert(d.sameCalendarMonth('2026-07-15', '2026-06-30') === false, 'sameCalendarMonth false');
    assert(d.yearMonthKey('2026-07-23') === '2026-07', 'yearMonthKey');

    const midJuly = d.pickDefaultEssaySyllabusRow(multiMonthEssayClass, '2026-07-15');
    assert(midJuly && midJuly.id === 'e-jul-late', 'mid-month picks next essay still in month');

    const earlyJuly = d.pickDefaultEssaySyllabusRow(multiMonthEssayClass, '2026-07-01');
    assert(earlyJuly && earlyJuly.id === 'e-jul-early', 'start of month picks first upcoming in month');

    const endJuly = d.pickDefaultEssaySyllabusRow(multiMonthEssayClass, '2026-07-25');
    assert(endJuly && endJuly.id === 'e-jul-late', 'late month with only past essays picks latest in month');

    const noMonthMatch = d.pickDefaultEssaySyllabusRow(multiMonthEssayClass, '2026-09-01');
    assert(noMonthMatch && noMonthMatch.id === 'e-aug', 'no essay this month falls back to last past overall');

    const beforeAll = d.pickDefaultEssaySyllabusRow(multiMonthEssayClass, '2026-05-01');
    assert(beforeAll && beforeAll.id === 'e-jun', 'before all essays falls back to first upcoming');
}

const emptySyllabusDebate = {
    id: 'cls-debate-empty',
    scheduleModel: 'debateMonthly',
    syllabusRows: []
};
const scheduledFallback = d.listDebateTeamAssignmentsForClass(emptySyllabusDebate, {
    scheduledLessons: [
        { date: '2026-05-05', label: 'Day 1', group: { days: [1] } },
        { date: '2026-05-26', label: 'Day 4', group: { days: [4] } },
        { date: '2026-06-23', label: 'Day 4 / Preview', group: { days: [4] } }
    ]
});
assert(scheduledFallback.length === 2, 'scheduled lesson fallback lists Day 4 dates');
assert(scheduledFallback[0].date === '2026-05-26', 'fallback first Day 4 date');

console.log('classroom-domain.test.mjs: all passed');
