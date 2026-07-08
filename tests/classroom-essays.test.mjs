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

        resubmit_required: 1

    });

    assert(segments.length === 4, 'four segments');

    assert(segments[0].flex === 3 && segments[2].flex === 5, 'proportional flex');

    const empty = CCPClassroomEssays.essayStatsSegmentFlex({

        not_submitted: 0,

        submitted: 0,

        complete: 0,

        resubmit_required: 0

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

    const rec = { studentId: 's1', status: 'submitted', submittedRetest: false, note: '' };

    const next = CCPClassroomEssays.applyStagedBatchToRecord(rec, 'status', 'complete', null);

    assert(next.status === 'complete', 'status batch action sets complete');

    assert(next.submittedRetest === false, 'status batch clears retest when leaving resubmit');

}



console.log('classroom-essays.test.mjs: all passed');


