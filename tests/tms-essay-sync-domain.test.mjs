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

const D = loadDomain();

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const today = '2026-07-21';

function sampleApp() {
    return {
        tmsRosterLinks: {
            'id:31040': {
                action: 'map',
                cohortId: 'coh1',
                tmsClassName: '여울T^2606',
                tmsClassId: '31040'
            }
        },
        tmsEssayLinks: {},
        cohorts: [
            {
                id: 'coh1',
                name: '여울T',
                students: [
                    { id: 'stu1', name: '박세빈S', nameEn: 'Sally', tags: [] },
                    { id: 'stu2', name: '이미제출', nameEn: '', tags: [] }
                ]
            }
        ],
        classes: [
            {
                id: 'cls1',
                name: '여울T Debate',
                cohortIds: ['coh1'],
                syllabusRows: [
                    {
                        id: 'row-debate',
                        kind: 'lesson',
                        date: today,
                        planTitle: 'Debate essay',
                        trackEssay: true
                    },
                    {
                        id: 'row-news',
                        kind: 'lesson',
                        date: '2026-07-22',
                        planTitle: 'News essay',
                        trackEssay: true
                    }
                ]
            }
        ],
        essaySubmissions: [
            {
                id: 'ess1',
                classId: 'cls1',
                syllabusRowId: 'row-debate',
                lessonDate: today,
                ssDueDate: today,
                teacherEvalDueDate: '2026-07-23',
                records: [
                    {
                        studentId: 'stu2',
                        status: 'complete',
                        submittedRetest: false,
                        note: '',
                        submissionLate: false,
                        overdueDismissed: false
                    }
                ]
            }
        ]
    };
}

{
    const key = D.normalizeEssayTitleKey('Debate essay');
    assert(key.includes('debate'), `title key ${key}`);
    assert(!key.includes('essay'), 'strips essay word');
}

{
    const app = sampleApp();
    const scrape = {
        assignments: [
            {
                tmsClassId: '31040',
                className: '여울T^2606',
                title: 'Debate',
                lessonDate: today,
                homeworkItemIdx: '1282873',
                students: [
                    { name: '박세빈S', submitted: true, submittedAt: '2026-07-28' },
                    { name: '이미제출', submitted: true, submittedAt: '2026-07-20' },
                    { name: '없는학생', submitted: true, submittedAt: '2026-07-28' }
                ]
            },
            {
                tmsClassId: '99999',
                className: 'UnknownClass',
                title: 'Debate',
                lessonDate: today,
                homeworkItemIdx: '1',
                students: [{ name: '누구', submitted: true, submittedAt: '2026-07-28' }]
            }
        ]
    };

    const built = D.buildTmsEssaySyncPlan(app, scrape);
    assert(built.rows.length === 2, `plan rows ${built.rows.length}`);
    const debateRow = built.rows.find((r) => r.homeworkItemIdx === '1282873');
    assert(debateRow, 'debate plan row');
    assert(debateRow.suggestedClassId === 'cls1', `suggested class ${debateRow.suggestedClassId}`);
    assert(debateRow.suggestedSyllabusRowId === 'row-debate', 'suggested assignment');
    assert(debateRow.userAction === 'choose', 'requires confirm by default');
    assert(debateRow.lessonDate === today, 'keeps assigned date');

    // Unresolved → unmatched
    let preview = D.previewTmsEssaySyncPlan(app, built.rows);
    assert(preview.updates.length === 0, 'no updates until mapped');
    assert(preview.unmatched.some((u) => u.reason === 'unresolved'), 'unresolved');

    // Confirm mapping
    debateRow.userAction = 'map';
    debateRow.userClassId = 'cls1';
    debateRow.userSyllabusRowId = 'row-debate';
    const unknown = built.rows.find((r) => r.homeworkItemIdx === '1');
    unknown.userAction = 'skip';

    preview = D.previewTmsEssaySyncPlan(app, built.rows);
    assert(preview.updates.length === 1, `updates ${preview.updates.length}`);
    assert(preview.updates[0].studentId === 'stu1', 'stu1 update');
    assert(preview.updates[0].submissionLate === true, 'late after due');
    assert(preview.skipped.some((s) => s.studentId === 'stu2'), 'skip complete');
    assert(preview.unmatched.some((u) => u.reason === 'student_unmatched'), 'student unmatched');
    assert(preview.unmatched.some((u) => u.needsReview), 'unmatched needs review');
    assert(preview.skipped.some((s) => s.reason === 'skipped_by_user'), 'user skip');

    debateRow.studentResolutions = {
        [D.koreanMatchKey('없는학생')]: { action: 'skip' }
    };
    const previewSkip = D.previewTmsEssaySyncPlan(app, built.rows);
    assert(
        previewSkip.skipped.some((s) => s.reason === 'student_skipped'),
        'student skipped via resolution'
    );
    assert(
        !previewSkip.unmatched.some((u) => u.studentName === '없는학생' && u.needsReview),
        'skipped student not pending review'
    );
    assert(previewSkip.updates.length === 1, 'matched update still present after skip');

    const applied = D.applyTmsEssaySync(app.essaySubmissions, previewSkip, { appData: app });
    assert(applied.summary.appliedCount === 1, 'applied 1');
    const sub = D.findEssaySubmission(applied.essaySubmissions, 'cls1', 'row-debate');
    const rec = D.getEssayRecordForStudent(sub, 'stu1');
    assert(rec && rec.status === 'submitted', 'stu1 now submitted');
    assert(rec.submissionLate === true, 'late flag');

    const links = D.upsertTmsEssayLinks({}, built.rows, app.classes);
    assert(links['hw:1282873'] && links['hw:1282873'].action === 'map', 'remember map');
    assert(links['hw:1282873'].classId === 'cls1', 'link class');
    assert(links['hw:1'] && links['hw:1'].action === 'skip', 'remember skip');
}

{
    // Remembered link auto-selects on next plan build
    const app = sampleApp();
    app.tmsEssayLinks = {
        'hw:1282873': {
            action: 'map',
            classId: 'cls1',
            syllabusRowId: 'row-debate',
            tmsClassId: '31040',
            className: '여울T^2606',
            title: 'Debate',
            lessonDate: today,
            homeworkItemIdx: '1282873'
        }
    };
    const built = D.buildTmsEssaySyncPlan(app, {
        assignments: [
            {
                tmsClassId: '31040',
                className: '여울T^2606',
                title: 'Debate',
                lessonDate: today,
                homeworkItemIdx: '1282873',
                students: [{ name: '박세빈S', submitted: true, submittedAt: '2026-07-28' }]
            }
        ]
    });
    assert(built.rows[0].remembered === true, 'remembered');
    assert(built.rows[0].userAction === 'map', 'auto map remembered');
    assert(built.rows[0].userClassId === 'cls1', 'class filled');
    assert(built.rows[0].userSyllabusRowId === 'row-debate', 'assignment filled');
}

{
    // Wrong-month remembered custom essay is ignored
    const app = sampleApp();
    app.classes[0].syllabusRows = [
        { id: 'row-jun-custom', kind: 'lesson', date: '2026-06-12', planTitle: 'Debate', trackEssay: true },
        { id: 'row-jul-custom', kind: 'lesson', date: '2026-07-18', planTitle: 'Debate', trackEssay: true }
    ];
    app.tmsEssayLinks = {
        'hw:1282873': {
            action: 'map',
            classId: 'cls1',
            syllabusRowId: 'row-jun-custom',
            tmsClassId: '31040',
            className: '여울T^2606',
            title: 'Debate',
            lessonDate: '2026-06-12',
            homeworkItemIdx: '1282873'
        }
    };
    const built = D.buildTmsEssaySyncPlan(app, {
        assignments: [
            {
                tmsClassId: '31040',
                className: '여울T^2606',
                title: 'Debate',
                lessonDate: '2026-07-23',
                assignedDate: '2026-07-23',
                homeworkItemIdx: '1282873',
                students: [{ name: '박세빈S', submitted: true, submittedAt: '2026-07-28' }]
            }
        ]
    });
    assert(built.rows[0].remembered === false, 'wrong-month remembered ignored');
    assert(built.rows[0].suggestedSyllabusRowId === 'row-jul-custom', 'suggested current-month custom');
}

{
    // Wrong-month remembered essay row with keyword title is also ignored
    const app = sampleApp();
    app.classes[0].syllabusRows = [
        { id: 'row-jul-essay', kind: 'lesson', date: '2026-07-10', planTitle: 'Debate essay', trackEssay: true },
        { id: 'row-aug-essay', kind: 'lesson', date: '2026-08-07', planTitle: 'Debate essay', trackEssay: true }
    ];
    app.tmsEssayLinks = {
        'hw:aug-yuma': {
            action: 'map',
            classId: 'cls1',
            syllabusRowId: 'row-jul-essay',
            tmsClassId: '31040',
            className: '유마T^2606',
            title: 'Debate',
            lessonDate: '2026-07-10',
            homeworkItemIdx: 'aug-yuma'
        }
    };
    const built = D.buildTmsEssaySyncPlan(app, {
        assignments: [
            {
                tmsClassId: '31040',
                className: '유마T^2606',
                title: 'Debate',
                lessonDate: '2026-08-07',
                assignedDate: '2026-08-07',
                homeworkItemIdx: 'aug-yuma',
                students: [{ name: '박세빈S', submitted: true, submittedAt: '2026-08-08' }]
            }
        ]
    });
    assert(built.rows[0].remembered === false, 'wrong-month remembered essay ignored');
    assert(built.rows[0].suggestedSyllabusRowId === 'row-aug-essay', 'suggested August essay');
}

{
    // Convenience preview still works (applies suggestions provisionally)
    const app = sampleApp();
    const preview = D.previewTmsEssaySync(app, {
        assignments: [
            {
                tmsClassId: '31040',
                className: '여울T^2606',
                title: 'Debate',
                lessonDate: today,
                homeworkItemIdx: '1282873',
                students: [{ name: '박세빈S', submitted: true, submittedAt: '2026-07-28' }]
            }
        ]
    });
    assert(preview.updates.length === 1, 'convenience preview updates');
}

{
    // June vs July same title — prefer matching month
    const app = sampleApp();
    app.classes[0].syllabusRows = [
        { id: 'row-jun', kind: 'lesson', date: '2026-06-15', planTitle: 'Debate essay', trackEssay: true },
        { id: 'row-jul', kind: 'lesson', date: '2026-07-14', planTitle: 'Debate essay', trackEssay: true }
    ];
    const hitJun = D.matchEssayAssignmentRow(app.classes[0], 'Debate', '2026-06-16');
    assert(hitJun && hitJun.syllabusRowId === 'row-jun', `June match ${hitJun && hitJun.syllabusRowId}`);
    const hitJul = D.matchEssayAssignmentRow(app.classes[0], 'Debate', '2026-07-15');
    assert(hitJul && hitJul.syllabusRowId === 'row-jul', `July match ${hitJul && hitJul.syllabusRowId}`);
}

{
    // Dated essay rows are month-locked even when the title includes essay keywords
    const app = sampleApp();
    app.classes[0].syllabusRows = [
        { id: 'row-jul', kind: 'lesson', date: '2026-07-14', planTitle: 'Debate essay', trackEssay: true },
        { id: 'row-aug', kind: 'lesson', date: '2026-08-14', planTitle: 'Debate essay', trackEssay: true }
    ];
    const hitAug = D.matchEssayAssignmentRow(app.classes[0], 'Debate', '2026-08-15', {
        assignedDate: '2026-08-15'
    });
    assert(hitAug && hitAug.syllabusRowId === 'row-aug', `keyword August match ${hitAug && hitAug.syllabusRowId}`);
}

{
    // User-created custom essays must match the assigned month exactly
    const app = sampleApp();
    app.classes[0].syllabusRows = [
        { id: 'row-jun-custom', kind: 'lesson', date: '2026-06-15', planTitle: 'Debate', trackEssay: true },
        { id: 'row-jul-custom', kind: 'lesson', date: '2026-07-14', planTitle: 'Debate', trackEssay: true }
    ];
    const hitJul = D.matchEssayAssignmentRow(app.classes[0], 'Debate', '2026-07-23', {
        assignedDate: '2026-07-23'
    });
    assert(hitJul && hitJul.syllabusRowId === 'row-jul-custom', `custom July match ${hitJul && hitJul.syllabusRowId}`);
    const hitNone = D.matchEssayAssignmentRow(app.classes[0], 'Debate', '', {
        assignedDate: ''
    });
    assert(hitNone === null, 'custom needs assigned month');
}

{
    // Term-bounded matching excludes out-of-term rows
    const app = sampleApp();
    app.classes[0].syllabusRows = [
        { id: 'row-old', kind: 'lesson', date: '2026-03-10', planTitle: 'Debate essay', trackEssay: true },
        { id: 'row-cur', kind: 'lesson', date: '2026-07-14', planTitle: 'Debate essay', trackEssay: true }
    ];
    const hit = D.matchEssayAssignmentRow(app.classes[0], 'Debate', '2026-07-15', {
        termStart: '2026-07-01',
        termEnd: '2026-08-31'
    });
    assert(hit && hit.syllabusRowId === 'row-cur', `term-bound match ${hit && hit.syllabusRowId}`);
}

{
    // Out-of-term TMS source rows are excluded from the plan
    const app = sampleApp();
    const scrape = {
        assignments: [
            {
                tmsClassId: '31040',
                className: '여울T^2606',
                title: 'Debate',
                lessonDate: '2026-07-21',
                homeworkItemIdx: 'in-term',
                students: [{ name: '박세빈S', submitted: true, submittedAt: '2026-07-28' }]
            },
            {
                tmsClassId: '31040',
                className: '여울T^2606',
                title: 'Debate',
                lessonDate: '2026-03-21',
                homeworkItemIdx: 'old-term',
                students: [{ name: '박세빈S', submitted: true, submittedAt: '2026-03-28' }]
            }
        ]
    };
    const built = D.buildTmsEssaySyncPlan(app, scrape, {
        termStart: '2026-07-01',
        termEnd: '2026-08-31'
    });
    assert(built.rows.length === 1, `in-term rows ${built.rows.length}`);
    assert(built.rows[0].homeworkItemIdx === 'in-term', 'kept in-term row');
    assert(built.filteredOutOfTermCount === 1, `filtered count ${built.filteredOutOfTermCount}`);
}

{
    // If no term is configured, source rows are not filtered out
    const app = sampleApp();
    const scrape = {
        assignments: [
            {
                tmsClassId: '31040',
                className: '여울T^2606',
                title: 'Debate',
                lessonDate: '2026-03-21',
                homeworkItemIdx: 'old-term',
                students: [{ name: '박세빈S', submitted: true, submittedAt: '2026-03-28' }]
            }
        ]
    };
    const built = D.buildTmsEssaySyncPlan(app, scrape, {
        termStart: '',
        termEnd: ''
    });
    assert(built.rows.length === 1, `no-term rows ${built.rows.length}`);
    assert(built.filteredOutOfTermCount === 0, `no-term filtered ${built.filteredOutOfTermCount}`);
}

{
    // getEssayRowsForTerm filters by range
    const rows = [
        { id: 'a', kind: 'lesson', date: '2026-06-10', planTitle: 'X', trackEssay: true },
        { id: 'b', kind: 'lesson', date: '2026-07-10', planTitle: 'Y', trackEssay: true }
    ];
    const inTerm = D.getEssayRowsForTerm(rows, '2026-07-01', '2026-07-31');
    assert(inTerm.length === 1 && inTerm[0].id === 'b', 'only July row');
    const noTerm = D.getEssayRowsForTerm(rows, '', '');
    assert(noTerm.length === 2, 'no term = all rows');
}

{
    // When nothing is in-term, the helper stays empty instead of falling back to all rows
    const rows = [
        { id: 'a', kind: 'lesson', date: '2026-06-10', planTitle: 'Debate', trackEssay: true }
    ];
    const inTerm = D.getEssayRowsForTerm(rows, '2026-07-01', '2026-07-31');
    assert(inTerm.length === 0, 'no in-term rows means empty');
}

{
    // Month filter removes all wrong-month dated essay rows
    const rows = [
        { id: 'custom-jun', kind: 'lesson', date: '2026-06-10', planTitle: 'Debate', trackEssay: true },
        { id: 'custom-jul', kind: 'lesson', date: '2026-07-10', planTitle: 'Debate', trackEssay: true },
        { id: 'keyword-jun', kind: 'lesson', date: '2026-06-12', planTitle: 'Debate essay', trackEssay: true }
    ];
    const filtered = D.getEssayRowsForAssignedMonth(rows, '2026-07-23', '2026-06-01', '2026-07-31');
    assert(filtered.some((r) => r.id === 'custom-jul'), 'kept matching-month custom');
    assert(!filtered.some((r) => r.id === 'custom-jun'), 'removed wrong-month custom');
    assert(!filtered.some((r) => r.id === 'keyword-jun'), 'removed wrong-month keyword essay row');
}

{
    // Empty detail/homework do not create a false weak match
    const app = sampleApp();
    app.classes[0].syllabusRows = [
        { id: 'row-jul', kind: 'lesson', date: '2026-07-10', planTitle: '7월 에세이', planDetail: '', homework: '', trackEssay: true },
        { id: 'row-aug', kind: 'lesson', date: '2026-08-10', planTitle: '8월 에세이', planDetail: '', homework: '', trackEssay: true }
    ];
    const hit = D.matchEssayAssignmentRow(app.classes[0], '없는제목', '2026-08-12', {
        assignedDate: '2026-08-12'
    });
    assert(hit === null, 'blank detail/homework should not weak-match');
}

{
    // An explicit pick may map a TMS assignment onto an essay row in another month
    const app = sampleApp();
    app.classes[0].syllabusRows = [
        { id: 'row-jul', kind: 'lesson', date: '2026-07-10', planTitle: '7월 에세이', trackEssay: true },
        { id: 'row-aug', kind: 'lesson', date: '2026-08-10', planTitle: '8월 에세이', trackEssay: true }
    ];
    const preview = D.previewTmsEssaySyncPlan(app, [
        {
            className: '유마T^2606',
            title: '에세이숙제',
            lessonDate: '2026-08-12',
            assignedDate: '2026-08-12',
            studentCount: 1,
            students: [{ name: '박세빈S', submitted: true, submittedAt: '2026-08-13' }],
            userAction: 'map',
            userClassId: 'cls1',
            userSyllabusRowId: 'row-jul'
        }
    ]);
    assert(preview.updates.length === 1, 'explicit cross-month map is allowed');
    assert(preview.updates[0].syllabusRowId === 'row-jul', 'mapped the chosen July row');
    assert(
        !preview.unmatched.some((u) => u.reason === 'assignment_month_mismatch'),
        'explicit pick is not a month mismatch'
    );
}

{
    // Hand-added assignment outside the TMS month can still be chosen and marked Received
    const app = sampleApp();
    app.classes[0].syllabusRows = [
        {
            id: 'row-oct-custom',
            kind: 'lesson',
            date: '2026-10-02',
            planTitle: 'Debate draft',
            essaySubject: 'Debate',
            trackEssay: true
        }
    ];
    const preview = D.previewTmsEssaySyncPlan(app, [
        {
            className: 'Purple T',
            title: 'Debate',
            lessonDate: '2026-09-17',
            assignedDate: '2026-09-17',
            studentCount: 1,
            students: [{ name: '박세빈S', submitted: true, submittedAt: '2026-09-20' }],
            userAction: 'map',
            userClassId: 'cls1',
            userSyllabusRowId: 'row-oct-custom'
        }
    ]);
    assert(preview.updates.length === 1, 'explicit other-month custom maps');
    assert(preview.updates[0].syllabusRowId === 'row-oct-custom', 'mapped the hand-added row');
    const applied = D.applyTmsEssaySync(app.essaySubmissions, preview, { appData: app });
    const rec = D.getEssayRecordForStudent(
        D.findEssaySubmission(applied.essaySubmissions, 'cls1', 'row-oct-custom'),
        'stu1'
    );
    assert(rec && rec.status === 'submitted', 'hand-added assignment marked received');
}

{
    // Auto-suggest still stays in the TMS month when a later hand-added row exists
    const app = sampleApp();
    app.classes[0].syllabusRows = [
        {
            id: 'row-sep',
            kind: 'lesson',
            date: '2026-09-10',
            planTitle: 'September debate',
            essaySubject: 'Debate',
            trackEssay: true
        },
        {
            id: 'row-oct',
            kind: 'lesson',
            date: '2026-10-02',
            planTitle: 'October debate',
            essaySubject: 'Debate',
            trackEssay: true
        }
    ];
    const hit = D.matchEssayAssignmentRow(app.classes[0], 'Debate', '2026-09-17', {
        assignedDate: '2026-09-17'
    });
    assert(hit && hit.syllabusRowId === 'row-sep', `suggest stays in month ${hit && hit.syllabusRowId}`);
}

{
    // filterClassId limits plan to one class
    const app = sampleApp();
    app.tmsRosterLinks['id:88888'] = {
        action: 'map', cohortId: 'coh2', tmsClassName: 'OtherT^2606', tmsClassId: '88888'
    };
    app.cohorts.push({ id: 'coh2', name: 'OtherT', students: [{ id: 'stu-x', name: 'X' }] });
    app.classes.push({
        id: 'cls2',
        name: 'OtherT Writing',
        cohortIds: ['coh2'],
        syllabusRows: [
            { id: 'row-other', kind: 'lesson', date: today, planTitle: 'Weekly writing', trackEssay: true }
        ]
    });
    const scrape = {
        assignments: [
            {
                tmsClassId: '31040', className: '여울T^2606', title: 'Debate',
                lessonDate: today, homeworkItemIdx: '100',
                students: [{ name: '박세빈S', submitted: true, submittedAt: today }]
            },
            {
                tmsClassId: '88888', className: 'OtherT^2606', title: 'Weekly writing',
                lessonDate: today, homeworkItemIdx: '200',
                students: [{ name: 'X', submitted: true, submittedAt: today }]
            }
        ]
    };
    const all = D.buildTmsEssaySyncPlan(app, scrape);
    assert(all.rows.length === 2, 'all rows without filter');
    const filtered = D.buildTmsEssaySyncPlan(app, scrape, { filterClassId: 'cls1' });
    assert(filtered.rows.length === 1, `filtered ${filtered.rows.length}`);
    assert(filtered.rows[0].homeworkItemIdx === '100', 'kept cls1 row');
}

{
    // Symbol-insensitive essay match + name update on apply
    const app = sampleApp();
    app.cohorts[0].students[0].name = '박세빈S';
    const built = D.buildTmsEssaySyncPlan(app, {
        assignments: [
            {
                tmsClassId: '31040',
                className: '여울T^2606',
                title: 'Debate',
                lessonDate: today,
                homeworkItemIdx: '1282873',
                students: [{ name: '박세빈S◆', submitted: true, submittedAt: '2026-07-28' }]
            }
        ]
    });
    built.rows[0].userAction = 'map';
    built.rows[0].userClassId = 'cls1';
    built.rows[0].userSyllabusRowId = 'row-debate';
    const preview = D.previewTmsEssaySyncPlan(app, built.rows);
    assert(preview.updates.length === 1, 'symbol match update');
    assert(preview.updates[0].studentId === 'stu1', 'matched stu1');
    assert(preview.updates[0].nameUpdated === true, 'name update flagged');
    assert(preview.updates[0].tmsName === '박세빈', 'canonical tms name');
    const applied = D.applyTmsEssaySync(app.essaySubmissions, preview, { appData: app });
    assert(applied.summary.appliedCount === 1, 'applied');
    const stu = applied.cohorts[0].students.find((s) => s.id === 'stu1');
    assert(stu.name === '박세빈', 'cohort name canonical (no status symbols)');
    assert(Array.isArray(stu.tags) && stu.tags.includes('shuttle'), 'shuttle tag');
    assert(stu.tags.includes('transfer_in'), 'transfer tag');
}

{
    // Skip-only unmatched → zero updates, no needsReview (sync can succeed with warns)
    const app = sampleApp();
    const built = D.buildTmsEssaySyncPlan(app, {
        assignments: [
            {
                tmsClassId: '31040',
                className: '여울T^2606',
                title: 'Debate',
                lessonDate: today,
                homeworkItemIdx: '1282873',
                students: [{ name: '없는학생', submitted: true, submittedAt: today }]
            }
        ]
    });
    built.rows[0].userAction = 'map';
    built.rows[0].userClassId = 'cls1';
    built.rows[0].userSyllabusRowId = 'row-debate';
    built.rows[0].studentResolutions = {
        [D.koreanMatchKey('없는학생')]: { action: 'skip' }
    };
    const preview = D.previewTmsEssaySyncPlan(app, built.rows);
    assert(preview.updates.length === 0, 'no updates');
    assert(preview.skipped.some((s) => s.reason === 'student_skipped'), 'skipped');
    assert((D.listEssayTmsStudentReviewQueue(app, built.rows) || []).length === 0, 'no review queue');
}

{
    // Add unmatched student then mark Received
    const app = sampleApp();
    const built = D.buildTmsEssaySyncPlan(app, {
        assignments: [
            {
                tmsClassId: '31040',
                className: '여울T^2606',
                title: 'Debate',
                lessonDate: today,
                homeworkItemIdx: '1282873',
                students: [{ name: '한지우', submitted: true, submittedAt: today }]
            }
        ]
    });
    built.rows[0].userAction = 'map';
    built.rows[0].userClassId = 'cls1';
    built.rows[0].userSyllabusRowId = 'row-debate';
    built.rows[0].studentResolutions = {
        [D.koreanMatchKey('한지우')]: { action: 'add' }
    };
    const preview = D.previewTmsEssaySyncPlan(app, built.rows);
    assert(preview.updates.length === 1 && preview.updates[0].addStudent, 'add update');
    const applied = D.applyTmsEssaySync(app.essaySubmissions, preview, {
        appData: app,
        newStudentId: () => 'stu_new_essay'
    });
    assert(applied.summary.appliedCount === 1, 'applied add');
    assert(
        applied.cohorts[0].students.some((s) => s.id === 'stu_new_essay' && s.name === '한지우'),
        'student added to cohort'
    );
    const sub = D.findEssaySubmission(applied.essaySubmissions, 'cls1', 'row-debate');
    assert(D.getEssayRecordForStudent(sub, 'stu_new_essay').status === 'submitted', 'received');
}

{
    // mpidx match wins over Latin-suffix Korean mismatch — no review
    const app = sampleApp();
    app.cohorts[0].students[0] = {
        id: 'stu1',
        name: '김민수',
        nameEn: 'Minsoo',
        tags: [],
        tmsMpidx: '99901'
    };
    const built = D.buildTmsEssaySyncPlan(app, {
        assignments: [
            {
                tmsClassId: '31040',
                className: '여울T^2606',
                title: 'Debate',
                lessonDate: today,
                homeworkItemIdx: '1282873',
                students: [
                    {
                        name: '김민수A',
                        nameEn: 'Min',
                        mpidx: '99901',
                        submitted: true,
                        submittedAt: today
                    }
                ]
            }
        ]
    });
    built.rows[0].userAction = 'map';
    built.rows[0].userClassId = 'cls1';
    built.rows[0].userSyllabusRowId = 'row-debate';
    const preview = D.previewTmsEssaySyncPlan(app, built.rows);
    assert(preview.summary.needsReviewCount === 0, 'mpidx match skips review');
    assert(preview.updates.length === 1, 'one update');
    assert(preview.updates[0].studentId === 'stu1', 'matched stu1');
    assert(preview.updates[0].nameUpdated === true, 'adopts Writing_list Korean');
    assert(preview.updates[0].tmsMpidx === '99901', 'carries mpidx');
    // Longer CCMU English kept over short Writing_list paren
    assert(preview.updates[0].tmsNameEn === 'Minsoo', 'keeps longer CCMU English');
    const applied = D.applyTmsEssaySync(app.essaySubmissions, preview, { appData: app });
    const stu = applied.cohorts[0].students.find((s) => s.id === 'stu1');
    assert(stu.name === '김민수A', 'Korean display updated');
    assert(stu.nameEn === 'Minsoo', 'English not shortened');
    assert(stu.tmsMpidx === '99901', 'mpidx stored');
}

{
    // Remembered cohort.tmsStudentResolutions reused on essay preview
    const app = sampleApp();
    app.cohorts[0].students.push({
        id: 'stu_x',
        name: '다른이름',
        nameEn: '',
        tags: []
    });
    app.cohorts[0].tmsStudentResolutions = {
        [D.koreanMatchKey('김민수A')]: { action: 'map', studentId: 'stu_x' }
    };
    const built = D.buildTmsEssaySyncPlan(app, {
        assignments: [
            {
                tmsClassId: '31040',
                className: '여울T^2606',
                title: 'Debate',
                lessonDate: today,
                homeworkItemIdx: '1282873',
                students: [{ name: '김민수A', submitted: true, submittedAt: today }]
            }
        ]
    });
    built.rows[0].userAction = 'map';
    built.rows[0].userClassId = 'cls1';
    built.rows[0].userSyllabusRowId = 'row-debate';
    const preview = D.previewTmsEssaySyncPlan(app, built.rows);
    assert(preview.summary.needsReviewCount === 0, 'remembered map skips review');
    assert(preview.updates[0].studentId === 'stu_x', 'mapped via remembered resolution');
}

{
    // mergeStudentRecords rekeys essay/attendance and drops shell
    const app = {
        cohorts: [
            {
                id: 'coh1',
                name: 'Test',
                students: [
                    {
                        id: 'stu_keep',
                        name: '김민수',
                        nameEn: 'KeepEn',
                        tags: [],
                        tmsMpidx: '111'
                    },
                    {
                        id: 'stu_drop',
                        name: '김민수',
                        nameEn: 'DropEnglishLong',
                        tags: ['off_roster'],
                        tmsMpidx: ''
                    }
                ],
                tmsStudentResolutions: {
                    [D.koreanMatchKey('김민수')]: { action: 'map', studentId: 'stu_drop' }
                }
            }
        ],
        attendanceSessions: [
            {
                id: 'att1',
                classId: 'cls1',
                date: today,
                records: [
                    { studentId: 'stu_keep', status: 'present', sessionNote: '' },
                    { studentId: 'stu_drop', status: 'late', sessionNote: 'from drop' }
                ]
            }
        ],
        essaySubmissions: [
            {
                id: 'ess1',
                classId: 'cls1',
                syllabusRowId: 'row1',
                records: [
                    {
                        studentId: 'stu_keep',
                        status: 'submitted',
                        note: '',
                        submittedRetest: false,
                        submissionLate: false,
                        overdueDismissed: false
                    },
                    {
                        studentId: 'stu_drop',
                        status: 'complete',
                        note: 'done',
                        submittedRetest: false,
                        submissionLate: false,
                        overdueDismissed: false
                    }
                ]
            }
        ],
        homeworkCompletions: [],
        studentPoints: [{ id: 'p1', studentId: 'stu_drop', delta: 1 }],
        studentTests: [],
        debateScores: [],
        dayNotes: [{ id: 'n1', taggedStudentIds: ['stu_drop', 'stu_keep'] }]
    };
    const result = D.mergeStudentRecords(app, {
        keepId: 'stu_keep',
        dropId: 'stu_drop',
        profileFrom: 'keep',
        clearOffRoster: true
    });
    assert(!result.error, `merge error ${result.error}`);
    const students = result.appData.cohorts[0].students;
    assert(students.length === 1 && students[0].id === 'stu_keep', 'one student left');
    assert(!students[0].tags.includes('off_roster'), 'off_roster cleared');
    assert(students[0].nameEn === 'DropEnglishLong', 'longer English kept');
    assert(students[0].tmsMpidx === '111', 'tmsMpidx kept');
    const att = result.appData.attendanceSessions[0].records;
    assert(att.length === 1 && att[0].studentId === 'stu_keep', 'attendance rekeyed');
    assert(att[0].sessionNote === 'from drop', 'attendance note from drop when keep empty');
    const essayRec = result.appData.essaySubmissions[0].records;
    assert(essayRec.length === 1 && essayRec[0].studentId === 'stu_keep', 'essay rekeyed');
    assert(essayRec[0].status === 'complete', 'higher essay status kept');
    assert(essayRec[0].note === 'done', 'essay note kept');
    assert(
        result.appData.studentPoints.every((p) => p.studentId === 'stu_keep'),
        'points rekeyed'
    );
    assert(
        result.appData.dayNotes[0].taggedStudentIds.join(',') === 'stu_keep',
        'day note tags deduped'
    );
    assert(
        result.appData.cohorts[0].tmsStudentResolutions[D.koreanMatchKey('김민수')].studentId ===
            'stu_keep',
        'resolutions remapped'
    );
    const suspects = D.listSuspectedDuplicateStudents(result.appData.cohorts[0]);
    assert(suspects.length === 0, 'no suspects after merge');
}

{
    const app = sampleApp();
    app.classes[0].syllabusRows[0].homeworkDueDate = '2026-08-01';
    app.essaySubmissions[0].ssDueDate = '2026-07-28';
    const preview = D.previewTmsEssaySyncPlan(app, [
        {
            userAction: 'map',
            userClassId: 'cls1',
            userSyllabusRowId: 'row-debate',
            className: '여울T^2606',
            title: 'Debate',
            lessonDate: today,
            students: [{ name: '박세빈S', submitted: true, submittedAt: '2026-07-28' }]
        }
    ]);
    assert(preview.updates.length === 1, 'same-day essay due still updates');
    assert(preview.updates[0].submissionLate === false, 'submitted on the essay due date is on time');
    assert(preview.updates[0].submittedAt === '2026-07-28', 'preview keeps submittedAt');
    const applied = D.applyTmsEssaySync(app.essaySubmissions, preview, { appData: app });
    const rec = D.getEssayRecordForStudent(
        D.findEssaySubmission(applied.essaySubmissions, 'cls1', 'row-debate'),
        'stu1'
    );
    assert(rec.status === 'submitted', 'new receive stored');
    assert(rec.submittedAt === '2026-07-28', 'new receive stores submittedAt');
    assert(rec.submissionLate === false, 'stored late flag matches same-day due');
}

{
    const app = sampleApp();
    app.essaySubmissions[0].records.push({
        studentId: 'stu1',
        status: 'complete',
        submittedRetest: false,
        note: 'keep',
        submissionLate: true,
        overdueDismissed: false
    });
    const preview = D.previewTmsEssaySyncPlan(app, [
        {
            userAction: 'map',
            userClassId: 'cls1',
            userSyllabusRowId: 'row-debate',
            className: '여울T^2606',
            title: 'Debate',
            lessonDate: today,
            students: [{ name: '박세빈S', submitted: true, submittedAt: today }]
        }
    ]);
    assert(preview.updates.length === 0, 'already received is not a new mark');
    assert(preview.dateRefreshes.length === 1, 'already received still refreshes the date');
    assert(preview.skipped.some((s) => s.reason === 'already_set' && s.studentId === 'stu1'), 'still skipped as already set');
    const applied = D.applyTmsEssaySync(app.essaySubmissions, preview, { appData: app });
    assert(applied.summary.appliedCount === 0, 'refresh is not a mark-received count');
    assert(applied.summary.refreshedCount === 1, 'date refresh counted');
    const rec = D.getEssayRecordForStudent(
        D.findEssaySubmission(applied.essaySubmissions, 'cls1', 'row-debate'),
        'stu1'
    );
    assert(rec.status === 'complete', 'status stays complete');
    assert(rec.note === 'keep', 'note stays');
    assert(rec.submittedAt === today, 'submittedAt backfilled');
    assert(rec.submissionLate === false, 'same-day refresh clears received late');
}

{
    // Same month, two subjects: each TMS subject hits its own assignment.
    const app = sampleApp();
    app.classes[0].syllabusRows = [
        {
            id: 'row-debate',
            kind: 'lesson',
            date: '2026-07-10',
            planTitle: 'Monthly writing',
            essaySubject: 'Debate',
            trackEssay: true
        },
        {
            id: 'row-news',
            kind: 'lesson',
            date: '2026-07-18',
            planTitle: 'Monthly writing',
            essaySubject: 'News',
            trackEssay: true
        }
    ];
    const debateHit = D.matchEssayAssignmentRow(app.classes[0], 'Debate', '2026-07-21');
    const newsHit = D.matchEssayAssignmentRow(app.classes[0], '뉴스', '2026-07-22');
    assert(debateHit && debateHit.syllabusRowId === 'row-debate', 'Debate subject match');
    assert(newsHit && newsHit.syllabusRowId === 'row-news', 'News subject match');
    const speechHit = D.matchEssayAssignmentRow(app.classes[0], 'Speech', '2026-07-21');
    assert(speechHit === null, 'unrelated subject does not take a Debate or News row');
}

{
    // Saved subject matches even when the assignment title does not mention it.
    const app = sampleApp();
    app.classes[0].syllabusRows = [
        {
            id: 'row-speech',
            kind: 'lesson',
            date: '2026-07-12',
            planTitle: 'March writing',
            essaySubject: 'Speech',
            trackEssay: true
        }
    ];
    const hit = D.matchEssayAssignmentRow(app.classes[0], 'Speech', '2026-07-20');
    assert(hit && hit.syllabusRowId === 'row-speech', 'custom subject matches by name');
}

{
    // A remembered link to the wrong subject is ignored.
    const app = sampleApp();
    app.classes[0].syllabusRows[0].essaySubject = 'Debate';
    app.classes[0].syllabusRows[1].essaySubject = 'News';
    app.tmsEssayLinks = {
        'hw:news-item': {
            action: 'map',
            classId: 'cls1',
            syllabusRowId: 'row-debate',
            title: 'News',
            lessonDate: today,
            homeworkItemIdx: 'news-item'
        }
    };
    const built = D.buildTmsEssaySyncPlan(app, {
        assignments: [
            {
                tmsClassId: '31040',
                className: '여울T^2606',
                title: 'News',
                lessonDate: today,
                homeworkItemIdx: 'news-item',
                students: [{ name: '박세빈S', submitted: true, submittedAt: today }]
            }
        ]
    });
    assert(built.rows[0].remembered === false, 'wrong-subject remembered link ignored');
    assert(built.rows[0].suggestedSyllabusRowId === 'row-news', 'suggested the News assignment');
}

{
    // Preview refuses to mark Received on a different subject.
    const app = sampleApp();
    app.classes[0].syllabusRows[0].essaySubject = 'Debate';
    const preview = D.previewTmsEssaySyncPlan(app, [
        {
            className: '여울T^2606',
            title: 'News',
            lessonDate: today,
            assignedDate: today,
            studentCount: 1,
            students: [{ name: '박세빈S', submitted: true, submittedAt: today }],
            userAction: 'map',
            userClassId: 'cls1',
            userSyllabusRowId: 'row-debate'
        }
    ]);
    assert(preview.updates.length === 0, 'subject mismatch blocks updates');
    assert(
        preview.unmatched.some((u) => u.reason === 'assignment_subject_mismatch'),
        'subject mismatch reported'
    );
}

{
    // A title that is only the word essay must not match every assignment.
    const app = sampleApp();
    app.classes[0].syllabusRows = [
        {
            id: 'row-plain',
            kind: 'lesson',
            date: '2026-07-10',
            planTitle: 'Essay',
            trackEssay: true
        }
    ];
    const hit = D.matchEssayAssignmentRow(app.classes[0], 'Debate', '2026-07-15');
    assert(hit === null, 'blank title key does not match every subject');
}

{
    // Retcon resets only checked students and drops this assignment's TMS memory.
    const app = sampleApp();
    app.classes[0].syllabusRows[0].essaySubject = 'Debate';
    app.essaySubmissions[0].records = [
        {
            studentId: 'stu1',
            status: 'complete',
            submittedAt: '2026-07-20',
            submissionLate: true,
            overdueDismissed: true,
            submittedRetest: true,
            note: 'keep me'
        },
        {
            studentId: 'stu2',
            status: 'submitted',
            submittedAt: '2026-07-19',
            submissionLate: false,
            submittedRetest: false,
            note: 'other'
        }
    ];
    app.tmsEssayLinks = {
        'hw:deb': {
            action: 'map',
            classId: 'cls1',
            syllabusRowId: 'row-debate',
            title: 'Debate',
            lessonDate: today,
            homeworkItemIdx: 'deb'
        },
        'hw:other': {
            action: 'map',
            classId: 'cls1',
            syllabusRowId: 'row-news',
            title: 'News',
            lessonDate: today,
            homeworkItemIdx: 'other'
        }
    };
    const blocked = D.retconEssayCompletions(app, {
        classId: 'cls1',
        syllabusRowId: 'row-news',
        studentIds: ['stu1']
    });
    assert(blocked.error === 'missing_subject', 'retcon requires a saved subject');
    const result = D.retconEssayCompletions(app, {
        classId: 'cls1',
        syllabusRowId: 'row-debate',
        studentIds: ['stu1']
    });
    assert(!result.error, 'retcon ok');
    assert(result.resetCount === 1, 'one student reset');
    const reset = D.getEssayRecordForStudent(
        D.findEssaySubmission(result.essaySubmissions, 'cls1', 'row-debate'),
        'stu1'
    );
    const kept = D.getEssayRecordForStudent(
        D.findEssaySubmission(result.essaySubmissions, 'cls1', 'row-debate'),
        'stu2'
    );
    assert(reset.status === 'not_submitted', 'checked student cleared');
    assert(reset.submittedAt === '', 'submission day cleared');
    assert(reset.submissionLate === false, 'late cleared');
    assert(reset.submittedRetest === false, 'retest cleared');
    assert(reset.note === 'keep me', 'note kept');
    assert(kept.status === 'submitted', 'unchecked student unchanged');
    assert(!result.tmsEssayLinks['hw:deb'], 'this assignment link removed');
    assert(result.tmsEssayLinks['hw:other'], 'other assignment link kept');
}

{
    const choices = D.listEssaySubjectChoices(sampleApp(), sampleApp().classes[0]);
    assert(choices[0] === 'Debate' && choices[1] === 'News', 'builtin subjects stay first');
    const created = D.createCustomEssayAssignment(
        { id: 'cls-sub', syllabusRows: [] },
        { title: 'Speech draft', date: today, essaySubject: 'Speech', id: 'syl-speech' }
    );
    assert(created.row.essaySubject === 'Speech', 'custom subject stored');
    const named = D.createCustomEssayAssignment(
        { id: 'cls-sub2', syllabusRows: [] },
        { title: '토론 글', date: today, essaySubject: '토론' }
    );
    assert(named.row.essaySubject === 'Debate', 'Korean debate name canonicalizes');
}

{
    assert(D.koreanMatchKey('김민수A') !== D.koreanMatchKey('김민수B'), 'suffix A is not suffix B');
    assert(D.koreanMatchKey('김민수A') !== D.koreanMatchKey('김민수'), 'suffix A is not unmarked');
    const app = {
        cohorts: [
            {
                id: 'coh1',
                name: 'Yellow',
                students: [
                    { id: 'a1', name: '김민수A', nameEn: 'Ann', tags: [], tmsMpidx: '' },
                    { id: 'a2', name: '김민수A', nameEn: 'A', tags: [], tmsMpidx: '999' },
                    { id: 'a3', name: '김민수A', nameEn: '', tags: ['off_roster'], tmsMpidx: '' },
                    { id: 'a_off', name: '김민수A', tags: [], active: false },
                    { id: 'b1', name: '김민수B', tags: [], tmsMpidx: '111' },
                    { id: 'plain', name: '김민수', tags: [], tmsMpidx: '111' }
                ]
            },
            {
                id: D.ARCHIVE_COHORT_ID,
                isArchiveCohort: true,
                students: [
                    { id: 'arch1', name: '김민수A', tags: [] },
                    { id: 'arch2', name: '김민수A', tags: [] }
                ]
            }
        ],
        attendanceSessions: [
            {
                id: 'att1',
                classId: 'cls1',
                date: today,
                records: [
                    { studentId: 'a1', status: 'late', sessionNote: 'from copy' },
                    { studentId: 'b1', status: 'present', sessionNote: 'bee' }
                ]
            }
        ],
        homeworkCompletions: [],
        essaySubmissions: [],
        studentPoints: [],
        studentTests: [],
        dayNotes: [{ id: 'n1', taggedStudentIds: ['a3', 'b1'] }]
    };
    assert(D.planCohortDuplicateMerges(app, D.ARCHIVE_COHORT_ID).length === 0, 'archive is not scanned');
    const groups = D.planCohortDuplicateMerges(app, 'coh1');
    assert(groups.length === 1, 'only the A copies are one group');
    assert(groups[0].keepId === 'a2', 'row with a TMS id is kept');
    assert(groups[0].dropIds.length === 2, 'two extra A copies');
    assert(!groups[0].dropIds.includes('b1'), 'B is not in the A group');
    assert(!groups[0].dropIds.includes('plain'), 'unmarked name is not in the A group');
    assert(!groups[0].dropIds.includes('a_off'), 'inactive copy is not grouped');
    const applied = D.applyCohortDuplicateMerges(app, groups);
    assert(!applied.error, `dedup apply error ${applied.error}`);
    assert(applied.applied.length === 2, 'both extra copies merged');
    const students = applied.appData.cohorts[0].students;
    const aRows = students.filter((s) => s && s.name === '김민수A' && s.active !== false);
    assert(aRows.length === 1 && aRows[0].id === 'a2', 'one active 김민수A left');
    assert(students.some((s) => s && s.id === 'b1'), '김민수B stays');
    assert(students.some((s) => s && s.id === 'plain'), 'plain 김민수 stays');
    assert(aRows[0].tmsMpidx === '999', 'kept TMS id');
    assert(!aRows[0].tags.includes('off_roster'), 'off roster cleared on merge');
    const att = applied.appData.attendanceSessions[0].records;
    assert(att.some((r) => r.studentId === 'a2' && r.sessionNote === 'from copy'), 'attendance moved to kept id');
    assert(att.some((r) => r.studentId === 'b1' && r.sessionNote === 'bee'), 'other student attendance unchanged');
    assert(
        applied.appData.dayNotes[0].taggedStudentIds.join(',') === 'a2,b1',
        'day note tag moved onto kept id'
    );
}

console.log('tms-essay-sync-domain.test.mjs: ok');
