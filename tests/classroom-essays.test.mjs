/**

 * Run: node tests/classroom-essays.test.mjs

 */

import path from 'path';

import { fileURLToPath } from 'url';

import vm from 'vm';

import { readFileSync } from 'fs';



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.join(__dirname, '..');



function assert(cond, msg) {

    if (!cond) throw new Error(msg || 'assertion failed');

}



const domainCode = readFileSync(path.join(root, 'js', 'classroom-domain.js'), 'utf8');

const essaysCode = readFileSync(path.join(root, 'js', 'classroom-essays.js'), 'utf8');

const sandbox = { window: {}, globalThis: {} };

sandbox.globalThis = sandbox.window;

vm.runInNewContext(domainCode, sandbox);

vm.runInNewContext(essaysCode, sandbox);



const { CCPClassroomEssays } = sandbox.window;



{

    assert(CCPClassroomEssays.isReceivedStatus('submitted'), 'submitted is received');

    assert(CCPClassroomEssays.isReceivedStatus('complete'), 'complete is received');

    assert(CCPClassroomEssays.isReceivedStatus('resubmit_required'), 'resubmit is received');

    assert(CCPClassroomEssays.isReceivedStatus('demerit'), 'demerit is received');

    assert(!CCPClassroomEssays.isReceivedStatus('not_submitted'), 'not_submitted is not received');

}



{

    const records = [

        { studentId: 's1', status: 'not_submitted', submittedRetest: false, note: '' },

        { studentId: 's2', status: 'submitted', submittedRetest: false, note: '' }

    ];

    const next = CCPClassroomEssays.applyBatchStatusToRecords(

        records,

        ['s1', 's2'],

        'evaluation',

        'complete',

        null

    );

    assert(next[0].status === 'not_submitted', 'evaluation skips not_submitted s1');

    assert(next[1].status === 'complete', 'evaluation applies to received s2');

    assert(next[1].submittedRetest === false, 'complete clears retest');

}



{

    const records = [

        { studentId: 's1', status: 'complete', submittedRetest: true, note: '' }

    ];

    const next = CCPClassroomEssays.applyBatchStatusToRecords(

        records,

        ['s1'],

        'submission',

        'not_submitted',

        null

    );

    assert(next[0].status === 'not_submitted', 'submission clear received');

    assert(next[0].submittedRetest === false, 'clear received clears retest');

}



{

    const records = [

        { studentId: 's1', status: 'submitted', submittedRetest: false, note: 'x' }

    ];

    const next = CCPClassroomEssays.applyBatchStatusToRecords(

        records,

        ['s1'],

        'evaluation',

        'resubmit_required',

        true

    );

    assert(next[0].status === 'resubmit_required', 'evaluation resubmit');

    assert(next[0].submittedRetest === true, 'retest applied on resubmit evaluation');

}



{

    const records = [

        { studentId: 's1', status: 'submitted', submittedRetest: true, note: 'x' }

    ];

    const next = CCPClassroomEssays.applyBatchStatusToRecords(

        records,

        ['s1'],

        'evaluation',

        'resubmit_required',

        null

    );

    assert(next[0].status === 'resubmit_required', 'evaluation resubmit without retest patch');

    assert(next[0].submittedRetest === true, 'retest unchanged when null');

}



{

    const rec = CCPClassroomEssays.applyStagedBatchToRecord(

        { studentId: 's1', status: 'not_submitted', submittedRetest: false },

        'submission',

        'submitted',

        null

    );

    assert(rec.status === 'submitted', 'staged submission mark received');

}



{

    const segments = CCPClassroomEssays.essayStatsSegmentFlex({

        not_submitted: 3,

        submitted: 2,

        complete: 5,

        resubmit_required: 1,

        incomplete: 0,

        exempt: 0

    });

    assert(segments.length === 7, 'seven segments');

    assert(segments[0].flex === 3 && segments[2].flex === 5, 'proportional flex');

    const empty = CCPClassroomEssays.essayStatsSegmentFlex({

        not_submitted: 0,

        submitted: 0,

        complete: 0,

        resubmit_required: 0,

        incomplete: 0,

        exempt: 0

    });

    assert(empty.every((s) => s.flex === 1), 'equal flex when empty');

}



{

    assert(

        CCPClassroomEssays.recordAffectsResubmitDayNote(

            { studentId: 's1', status: 'submitted', note: '' },

            { studentId: 's1', status: 'resubmit_required', note: '' }

        ),

        'entering resubmit affects day note'

    );

    assert(

        CCPClassroomEssays.recordAffectsResubmitDayNote(

            { studentId: 's1', status: 'resubmit_required', note: 'old' },

            { studentId: 's1', status: 'resubmit_required', note: 'new' }

        ),

        'resubmit note text affects day note'

    );

    assert(

        !CCPClassroomEssays.recordAffectsResubmitDayNote(

            { studentId: 's1', status: 'submitted', note: 'old' },

            { studentId: 's1', status: 'submitted', note: 'new' }

        ),

        'non-resubmit note edits do not affect day note'

    );

    assert(

        !CCPClassroomEssays.recordAffectsResubmitDayNote(

            { studentId: 's1', status: 'submitted', submittedRetest: false, note: '' },

            { studentId: 's1', status: 'submitted', submittedRetest: true, note: '' }

        ),

        'retest-only changes do not affect day note'

    );

}



{

    assert(CCPClassroomEssays.ESSAY_AUTOSAVE_DELAY_MS === 400, 'essay autosave delay 400ms');

}



{

    const row = { id: 'essay-row-1', kind: 'lesson', date: '2026-03-01', planTitle: 'Essay 1' };

    const classData = {

        id: 'c1',

        syllabusRows: [row]

    };

    sandbox.window.appData = {

        ui: { essayAssignmentByClassId: { c1: 'essay-row-1' } }

    };

    const resolved = CCPClassroomEssays.resolveEssayAssignmentForClass(classData);

    assert(resolved && resolved.id === 'essay-row-1', 'restores saved assignment from map');

}



{

    const classData = {

        id: 'c2',

        syllabusRows: [{ id: 'valid-row', kind: 'lesson', date: '2026-03-02', planTitle: 'Essay 2' }]

    };

    sandbox.window.appData = {

        ui: { essayAssignmentByClassId: { c2: 'stale-other-class-row' } }

    };

    const resolved = CCPClassroomEssays.resolveEssayAssignmentForClass(classData);

    assert(resolved && resolved.id === 'valid-row', 'invalid saved row falls back to default syllabus row');

}



{

    // Last viewed outside today's month still restores when no preferredDate.

    const julyRow = { id: 'july-essay', kind: 'lesson', date: '2026-07-15', planTitle: 'July Essay', trackEssay: true };

    const classData = { id: 'garam-t', syllabusRows: [julyRow] };

    sandbox.window.appData = {

        ui: { essayAssignmentByClassId: { 'garam-t': 'july-essay' } }

    };

    const resolved = CCPClassroomEssays.resolveEssayAssignmentForClass(classData);

    assert(resolved && resolved.id === 'july-essay', 'restores last viewed even when not current month');

}



{

    // Class switch: preferred July month wins over saved June assignment.

    const juneRow = { id: 'june-essay', kind: 'lesson', date: '2026-06-10', planTitle: 'June Essay', trackEssay: true };

    const julyRow = { id: 'july-essay-m', kind: 'lesson', date: '2026-07-20', planTitle: 'July Essay', trackEssay: true };

    const classData = { id: 'garam-m', syllabusRows: [juneRow, julyRow] };

    sandbox.window.appData = {

        ui: { essayAssignmentByClassId: { 'garam-m': 'june-essay' } }

    };

    const resolved = CCPClassroomEssays.resolveEssayAssignmentForClass(classData, '2026-07-15');

    assert(resolved && resolved.id === 'july-essay-m', 'preferred month overrides saved assignment in different month');

}



{

    // Class switch: saved assignment in preferred month is kept.

    const juneRow = { id: 'june-kept', kind: 'lesson', date: '2026-06-05', planTitle: 'June A', trackEssay: true };

    const julySaved = { id: 'july-saved', kind: 'lesson', date: '2026-07-08', planTitle: 'July A', trackEssay: true };

    const julyOther = { id: 'july-other', kind: 'lesson', date: '2026-07-22', planTitle: 'July B', trackEssay: true };

    const classData = { id: 'c-july', syllabusRows: [juneRow, julySaved, julyOther] };

    sandbox.window.appData = {

        ui: { essayAssignmentByClassId: { 'c-july': 'july-saved' } }

    };

    const resolved = CCPClassroomEssays.resolveEssayAssignmentForClass(classData, '2026-07-15');

    assert(resolved && resolved.id === 'july-saved', 'keeps saved assignment when it matches preferred month');

}



{

    // Preferred July with no July rows falls through to pickDefault (first on/after ref).

    const juneRow = { id: 'june-only', kind: 'lesson', date: '2026-06-10', planTitle: 'June', trackEssay: true };

    const augRow = { id: 'aug-only', kind: 'lesson', date: '2026-08-12', planTitle: 'August', trackEssay: true };

    const classData = { id: 'c-no-july', syllabusRows: [juneRow, augRow] };

    sandbox.window.appData = {

        ui: { essayAssignmentByClassId: { 'c-no-july': 'june-only' } }

    };

    const resolved = CCPClassroomEssays.resolveEssayAssignmentForClass(classData, '2026-07-15');

    assert(resolved && resolved.id === 'aug-only', 'no same-month essay falls through to first on/after preferred date');

}



{

    const rec = { studentId: 's1', status: 'submitted', submittedRetest: false, note: '' };

    const next = CCPClassroomEssays.applyStagedBatchToRecord(rec, 'status', 'complete', null);

    assert(next.status === 'complete', 'status batch action sets complete');

    assert(next.submittedRetest === false, 'status batch clears retest when leaving resubmit');

}



{

    const incomplete = CCPClassroomEssays.applyStagedBatchToRecord(
        { studentId: 's1', status: 'not_submitted', submittedRetest: true, note: '' },
        'status',
        'incomplete',
        null
    );
    assert(incomplete.status === 'incomplete', 'status batch can set incomplete');
    assert(incomplete.submittedRetest === false, 'incomplete clears retest');

    const exempt = CCPClassroomEssays.applyStagedBatchToRecord(
        { studentId: 's2', status: 'resubmit_required', submittedRetest: true, note: 'x' },
        'status',
        'exempt',
        null
    );
    assert(exempt.status === 'exempt', 'status batch can set exempt');
    assert(exempt.submittedRetest === false, 'exempt clears retest');

    assert(!CCPClassroomEssays.isReceivedStatus('incomplete'), 'incomplete is not received');
    assert(!CCPClassroomEssays.isReceivedStatus('exempt'), 'exempt is not received');

    const withNv = CCPClassroomEssays.applyStagedBatchToRecord(
        {
            studentId: 's3',
            status: 'not_submitted',
            submittedRetest: false,
            debateVideoMissing: true,
            note: ''
        },
        'status',
        'complete',
        null
    );
    assert(withNv.status === 'complete', 'status batch can complete with NV flag');
    assert(withNv.debateVideoMissing === true, 'status batch preserves debateVideoMissing');

}

{
    const homeworkCode = readFileSync(path.join(root, 'js', 'homework-tab.js'), 'utf8');
    vm.runInNewContext(homeworkCode, sandbox);
    const D = sandbox.window.CCPClassroomDomain;
    const HT = sandbox.window.CCPHomeworkTab;
    assert(D && typeof D.resolveEssayStudentDueDate === 'function', 'domain exports resolveEssayStudentDueDate');
    assert(HT && typeof HT.resolveHomeworkDueDate === 'function', 'homework tab exports resolveHomeworkDueDate');

    const classData = {
        id: 'c1',
        startDate: '2026-05-01',
        endDate: '2026-06-30',
        meetingDays: [1, 3, 5],
        syllabusRows: [
            {
                id: 'row-essay',
                kind: 'lesson',
                date: '2026-05-04',
                sessionNumber: 1,
                planTitle: 'Essay 1',
                planDetail: 'Write essay',
                trackEssay: true
            },
            {
                id: 'row-2',
                kind: 'lesson',
                date: '2026-05-08',
                sessionNumber: 2,
                planTitle: 'Next',
                planDetail: 'HW'
            }
        ]
    };
    sandbox.window.CCPGetHomeworkTabHooks = () => ({
        getMeetingDays: (c) => c.meetingDays || [],
        isHolidayForClass: () => false
    });

    const row = classData.syllabusRows[0];
    const autoDue = D.resolveEssayStudentDueDate(row, classData, null);
    assert(autoDue === '2026-05-06', 'essay default due is next MWF meeting (Wed), not lesson day');

    const overriddenRow = { ...row, homeworkDueDate: '2026-05-20' };
    assert(
        D.resolveEssayStudentDueDate(overriddenRow, classData, null) === '2026-05-20',
        'essay due reads homeworkDueDate override'
    );

    const legacyStored = { ssDueDate: '2026-05-04' };
    assert(
        D.resolveEssayStudentDueDate(row, classData, legacyStored) === '2026-05-04',
        'saved essay due stays, even when it is the lesson day'
    );

    const customStored = { ssDueDate: '2026-05-15' };
    assert(
        D.resolveEssayStudentDueDate(row, classData, customStored) === '2026-05-15',
        'explicit custom ssDueDate still wins'
    );
}

{
    const cleared = CCPClassroomEssays.applyStagedBatchToRecord(
        { studentId: 's1', status: 'demerit', retestAssigned: true, retestPassed: true, note: '' },
        'evaluation',
        'complete',
        null
    );
    assert(cleared.status === 'complete', 'leaving demerit sets complete');
    assert(cleared.retestAssigned === false, 'leaving demerit clears assigned retest');
    assert(cleared.retestPassed === false, 'leaving demerit clears passed');

    const kept = CCPClassroomEssays.applyStagedBatchToRecord(
        { studentId: 's1', status: 'demerit', retestAssigned: true, retestPassed: true, note: '' },
        'evaluation',
        'demerit',
        null
    );
    assert(kept.retestAssigned === true && kept.retestPassed === true, 'staying on demerit keeps flags');

    const entered = CCPClassroomEssays.applyStagedBatchToRecord(
        { studentId: 's1', status: 'submitted', retestAssigned: true, retestPassed: true, note: '' },
        'evaluation',
        'demerit',
        null
    );
    assert(entered.status === 'demerit', 'evaluation can set demerit');
    assert(entered.retestAssigned === false && entered.retestPassed === false, 'entering demerit starts unchecked');
}

{
    const local = [
        { studentId: 's1', status: 'not_submitted', note: 'typed locally', submissionLate: false },
        { studentId: 's2', status: 'submitted', note: '', submissionLate: false }
    ];
    const baseline = [
        { studentId: 's1', status: 'not_submitted', note: '', submissionLate: false },
        { studentId: 's2', status: 'submitted', note: '', submissionLate: false }
    ];
    const server = [
        { studentId: 's1', status: 'complete', note: '', submissionLate: false },
        { studentId: 's2', status: 'complete', note: 'from editor', submissionLate: true }
    ];
    const merged = CCPClassroomEssays.mergeEssayDraftFromServer(local, baseline, server);
    const s1 = merged.records.find((row) => row.studentId === 's1');
    const s2 = merged.records.find((row) => row.studentId === 's2');
    assert(s1.status === 'complete', 'server completion applies when this page did not change status');
    assert(s1.note === 'typed locally', 'a local note is kept when the server completion arrives');
    assert(s2.status === 'complete' && s2.note === 'from editor' && s2.submissionLate === true, 'untouched row takes the server record');
    assert(merged.changedIds.indexOf('s1') >= 0 && merged.changedIds.indexOf('s2') >= 0, 'both rows are reported changed');

    const again = CCPClassroomEssays.mergeEssayDraftFromServer(merged.records, merged.baselineRecords, server);
    const s1b = again.records.find((row) => row.studentId === 's1');
    assert(s1b.status === 'complete' && s1b.note === 'typed locally', 'a second merge does not drop the local note');
    assert(again.changedIds.length === 0, 'nothing else changed on the second merge');
}

{
    const prevList = [
        {
            id: 'es1',
            classId: 'c1',
            syllabusRowId: 'r1',
            ssDueDate: '2026-11-20',
            teacherEvalDueDate: '2026-11-22',
            records: [
                { studentId: 's1', status: 'submitted', note: '' },
                { studentId: 's2', status: 'submitted', note: 'from other class work' }
            ]
        },
        {
            id: 'es-other',
            classId: 'c2',
            syllabusRowId: 'r9',
            records: [{ studentId: 'z1', status: 'complete', note: '' }]
        }
    ];
    const baseline = {
        ssDueDate: '2026-11-20',
        teacherEvalDueDate: '2026-11-22',
        records: [
            { studentId: 's1', status: 'submitted', note: '' },
            { studentId: 's2', status: 'submitted', note: 'from other class work' }
        ]
    };
    const draft = {
        id: 'es1',
        classId: 'c1',
        syllabusRowId: 'r1',
        ssDueDate: '2026-11-20',
        teacherEvalDueDate: '2026-11-22',
        records: [
            { studentId: 's1', status: 'complete', note: '' },
            { studentId: 's2', status: 'submitted', note: 'from other class work' },
            { studentId: 's3', status: 'not_submitted', note: '' }
        ]
    };
    const payload = CCPClassroomEssays.buildEssaySavePayload(prevList, draft, baseline);
    assert(payload.touchedStudentIds.join(',') === 's1', 'only the student this page changed is touched');
    assert(payload.mutations.length === 1, 'one assignment mutation');
    assert(
        payload.mutations[0].payload.submission.touchedStudentIds.join(',') === 's1',
        'save mutation names only that student'
    );
    const saved = payload.nextList.find((row) => row.id === 'es1');
    const s2 = saved.records.find((row) => row.studentId === 's2');
    const s3 = saved.records.find((row) => row.studentId === 's3');
    assert(s2 && s2.note === 'from other class work', 'untouched classmate keeps the calendar copy');
    assert(!s3, 'padded empty roster rows are not written');
    assert(payload.nextList.some((row) => row.id === 'es-other'), 'other assignments stay in the list');

    const pingDraft = {
        id: 'es1',
        classId: 'c1',
        syllabusRowId: 'r1',
        ssDueDate: '2026-11-20',
        teacherEvalDueDate: '2026-11-22',
        records: [
            { studentId: 's1', status: 'submitted', note: '' },
            { studentId: 's2', status: 'complete', note: 'from editor' }
        ]
    };
    const pingBaseline = {
        ssDueDate: '2026-11-20',
        teacherEvalDueDate: '2026-11-22',
        records: [
            { studentId: 's1', status: 'submitted', note: '' },
            { studentId: 's2', status: 'complete', note: 'from editor' }
        ]
    };
    const painted = CCPClassroomEssays.buildEssaySavePayload(
        JSON.parse(JSON.stringify(prevList)),
        pingDraft,
        pingBaseline
    );
    assert(painted.touchedStudentIds.length === 0, 'a ping that was painted in is not treated as this page\'s save');
    assert(painted.mutations.length === 0, 'paint-only ping does not send a write');
    const paintedRow = painted.nextList.find((row) => row.id === 'es1');
    const paintedS2 = paintedRow.records.find((row) => row.studentId === 's2');
    assert(paintedS2.status === 'submitted', 'paint-only ping leaves the calendar copy until the real save arrives');
}

console.log('classroom-essays.test.mjs: all passed');


