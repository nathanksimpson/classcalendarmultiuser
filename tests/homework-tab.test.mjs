import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

async function loadHomeworkTestModules() {
    const utilsPath = path.join(root, 'js', 'utils.js');
    const templatesPath = path.join(root, 'js', 'syllabus-templates.js');
    const syllabusPath = path.join(root, 'js', 'syllabus-table.js');
    const tabPath = path.join(root, 'js', 'homework-tab.js');

    await import(pathToFileURL(utilsPath).href);
    await import(pathToFileURL(templatesPath).href);
    await import(pathToFileURL(syllabusPath).href);

    const tabCode = readFileSync(tabPath, 'utf8');
    const sandbox = { window: globalThis, globalThis };
    vm.runInNewContext(tabCode, sandbox);
    return {
        HT: sandbox.window.CCPHomeworkTab,
        CCPSyllabus: globalThis.CCPSyllabus,
        CCPSyllabusTemplates: globalThis.CCPSyllabusTemplates
    };
}

const { HT, CCPSyllabus, CCPSyllabusTemplates } = await loadHomeworkTestModules();

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const classData = {
    startDate: '2026-05-01',
    endDate: '2026-06-30',
    meetingDays: [1, 3, 5]
};

const hooks = {
    getMeetingDays: (c) => c.meetingDays || [],
    isHolidayForClass: (dateStr) => dateStr === '2026-05-06',
    getHolidayForClass: (dateStr) => (dateStr === '2026-05-06' ? { name: "Children's Day" } : null)
};

const rows = [
    { id: 'row-1', kind: 'lesson', date: '2026-05-04', sessionNumber: 1, planTitle: 'Unit 1 Part 1', planDetail: 'HW week 1' },
    { id: 'row-2', kind: 'lesson', date: '2026-05-08', sessionNumber: 2, planTitle: 'Unit 2 Part 1', planDetail: 'HW week 2' },
    { id: 'row-3', kind: 'lesson', date: '2026-05-11', sessionNumber: 3, planTitle: 'Unit 2 Part 2', planDetail: 'HW week 3' }
];

{
    const next = HT.getNextClassMeetingAfter(classData, '2026-05-04', hooks);
    assert(next === '2026-05-08', 'skips Wed holiday 5/6, next class is Fri 5/8');
}

{
    const skipped = HT.collectSkippedRegularClassMeetings(classData, '2026-05-04', '2026-05-08', hooks);
    assert(skipped.length === 1, 'one skipped meeting between 5/4 and 5/8');
    assert(skipped[0].date === '2026-05-06', 'Wed 5/6 is skipped');
    assert(skipped[0].label === "Children's Day", 'holiday name included');
}

{
    const pkt = HT.computeHomeworkForClass({
        classData,
        syllabusRows: rows,
        referenceDate: '2026-05-08',
        hooks
    });
    assert(pkt.gradingHomework === 'HW week 1', 'on 5/8 class, grade homework from previous session');
    assert(pkt.assignHomework === 'HW week 2', 'assign homework for current session');
    assert(pkt.dueDate === '2026-05-11', 'due next lesson date');
    assert(pkt.gradingSourceRowId === 'row-1', 'grading links to previous session syllabus row');
    assert(pkt.assignSourceRowId === 'row-2', 'assign links to current session row');
    assert(Array.isArray(pkt.skippedClassDates) && pkt.skippedClassDates.length === 0,
        'no skipped days between Fri 5/8 and Mon 5/11');
}

{
    const pkt = HT.computeHomeworkForClass({
        classData,
        syllabusRows: rows,
        referenceDate: '2026-05-04',
        hooks
    });
    assert(pkt.gradingHomework === '', 'first lesson has no previous homework to grade');
    assert(pkt.assignHomework === 'HW week 1', 'first lesson assigns week 1 homework');
    assert(pkt.messageKey === 'homeworkTabNoGradingText', 'first lesson shows no-grading message');
    assert(pkt.dueDate === '2026-05-08', 'due after holiday gap');
    assert(pkt.skippedClassDates.length === 1, 'explains Wed holiday before due');
    assert(pkt.skippedClassDates[0].date === '2026-05-06', 'skipped date is holiday');
}

{
    const pkt = HT.computeHomeworkForClass({
        classData,
        syllabusRows: rows,
        referenceDate: '2026-05-05',
        hooks
    });
    assert(pkt.targetLessonDate === '2026-05-08', 'between classes, target upcoming lesson');
}

// Debate compressed Day 2+3: assign homework merges both days when saved row is Day-3-only
{
    const debateClass = { scheduleModel: 'debateMonthly', startDate: '2026-03-01', endDate: '2026-06-30', meetingDays: [3] };
    const templates = [
        { sessionNumber: 1, planTitle: 'Day 1', planDetail: 'HW-DAY-1' },
        { sessionNumber: 2, planTitle: 'Day 2', planDetail: 'HW-DAY-2' },
        { sessionNumber: 3, planTitle: 'Day 3', planDetail: 'HW-DAY-3' },
        { sessionNumber: 4, planTitle: 'Day 4 / Preview', planDetail: 'HW-DAY-4' }
    ];
    const indexes = CCPSyllabusTemplates.buildTemplateIndexes(templates);
    const existing = [
        { id: 'r2', kind: 'lesson', date: '2026-03-04', lessonNumber: 2, planDetail: 'HW-DAY-2' }
    ];
    const compressedRow = {
        id: 'g-compressed',
        kind: 'lesson',
        date: '2026-03-11',
        sessionNumber: 2,
        lessonNumber: 2,
        planTitle: 'Merge Day 2+3',
        planDetail: 'HW-DAY-3',
        scheduleCompressed: true,
        compressedGroupStart: 2,
        compressedGroupEnd: 3,
        debateCompressed: true,
        debateGroupStart: 2,
        debateGroupEnd: 3
    };
    const generated = [{ ...compressedRow, planDetail: 'HW-DAY-2\n\nHW-DAY-3' }];
    const resolved = CCPSyllabus.resolveCompressedSyllabusRows(
        [compressedRow],
        existing,
        generated,
        debateClass,
        { templateIndexes: indexes }
    );
    const syllabusRows = [
        { id: 'r1', kind: 'lesson', date: '2026-03-04', sessionNumber: 1, planTitle: 'Day 1', planDetail: 'HW-DAY-1' },
        resolved[0],
        { id: 'r4', kind: 'lesson', date: '2026-03-18', sessionNumber: 4, planTitle: 'Day 4', planDetail: 'HW-DAY-4' }
    ];
    const pkt = HT.computeHomeworkForClass({
        classData: debateClass,
        syllabusRows,
        referenceDate: '2026-03-11',
        hooks
    });
    assert(pkt.targetLessonDate === '2026-03-11', 'targets compressed calendar date');
    assert(pkt.assignHomework.includes('HW-DAY-2'), 'assign includes day 2 homework');
    assert(pkt.assignHomework.includes('HW-DAY-3'), 'assign includes day 3 homework');
    assert(pkt.gradingHomework.includes('HW-DAY-1'), 'grading from previous session unchanged');
}

// Compressed Day 2+3: due is next syllabus Day 4, not gap weekday / stale Day 3
{
    const debateClassGap = {
        scheduleModel: 'debateMonthly',
        startDate: '2026-03-01',
        endDate: '2026-06-30',
        meetingDays: [3]
    };
    const wedHooks = {
        getMeetingDays: (c) => c.meetingDays || [],
        isHolidayForClass: () => false
    };
    const compressed = {
        id: 'c23',
        kind: 'lesson',
        date: '2026-03-11',
        sessionNumber: 2,
        lessonNumber: 2,
        planTitle: 'Merge Day 2+3',
        planDetail: 'HW-DAY-2\n\nHW-DAY-3',
        scheduleCompressed: true,
        compressedGroupStart: 2,
        compressedGroupEnd: 3,
        debateCompressed: true,
        debateGroupStart: 2,
        debateGroupEnd: 3
    };
    const syllabusRowsGap = [
        {
            id: 'd1',
            kind: 'lesson',
            date: '2026-03-04',
            sessionNumber: 1,
            lessonNumber: 1,
            planTitle: 'Day 1',
            planDetail: 'HW-DAY-1'
        },
        compressed,
        {
            id: 'stale3',
            kind: 'lesson',
            date: '2026-03-18',
            sessionNumber: 3,
            lessonNumber: 3,
            planTitle: 'Day 3',
            planDetail: 'STALE-DAY-3'
        },
        {
            id: 'd4',
            kind: 'lesson',
            date: '2026-03-25',
            sessionNumber: 4,
            lessonNumber: 4,
            planTitle: 'Day 4',
            planDetail: 'HW-DAY-4'
        }
    ];
    const pktGap = HT.computeHomeworkForClass({
        classData: debateClassGap,
        syllabusRows: syllabusRowsGap,
        referenceDate: '2026-03-11',
        hooks: wedHooks
    });
    assert(pktGap.dueDate === '2026-03-25', 'compressed assign due is Day 4 date, not gap/stale Day 3');
    assert(pktGap.dueDateAutomatic === '2026-03-25', 'automatic due matches Day 4');
    const meetingOnly = HT.getNextClassMeetingAfter(debateClassGap, '2026-03-11', wedHooks);
    assert(meetingOnly === '2026-03-18', 'sanity: bare next meeting is the gap Wednesday');
}

// Regression: incomplete combined template must not drop saved Day 3 homework
{
    const debateClass = { scheduleModel: 'debateMonthly', startDate: '2026-03-01', endDate: '2026-06-30', meetingDays: [3] };
    const templates = [
        { sessionNumber: 2, planTitle: 'Day 2', planDetail: 'HW-DAY-2' },
        { sessionNumber: 3, planTitle: 'Day 3', planDetail: 'HW-DAY-3' },
        { planTitle: 'Day 2 & 3 Combined', planDetail: 'HW-DAY-2' }
    ];
    const indexes = CCPSyllabusTemplates.buildTemplateIndexes(templates);
    const compressedRow = {
        id: 'g-compressed',
        kind: 'lesson',
        date: '2026-03-11',
        sessionNumber: 2,
        lessonNumber: 2,
        planTitle: 'Merge Day 2+3',
        planDetail: 'HW-DAY-3',
        scheduleCompressed: true,
        compressedGroupStart: 2,
        compressedGroupEnd: 3,
        debateCompressed: true,
        debateGroupStart: 2,
        debateGroupEnd: 3
    };
    const generated = [{ ...compressedRow, planDetail: 'HW-DAY-2' }];
    const resolved = CCPSyllabus.resolveCompressedSyllabusRows(
        [compressedRow],
        [{ id: 'r2', kind: 'lesson', date: '2026-03-04', lessonNumber: 2, planDetail: 'HW-DAY-2' }],
        generated,
        debateClass,
        { templateIndexes: indexes }
    );
    const pkt = HT.computeHomeworkForClass({
        classData: debateClass,
        syllabusRows: [
            { id: 'r1', kind: 'lesson', date: '2026-03-04', sessionNumber: 1, planDetail: 'HW-DAY-1' },
            resolved[0],
            { id: 'r4', kind: 'lesson', date: '2026-03-18', sessionNumber: 4, planDetail: 'HW-DAY-4' }
        ],
        referenceDate: '2026-03-11',
        hooks
    });
    assert(pkt.assignHomework.includes('HW-DAY-2'), 'regression: assign includes day 2');
    assert(pkt.assignHomework.includes('HW-DAY-3'), 'regression: assign includes day 3');
}

// Saved compressed rows should not duplicate Day 3 when homework reads merged syllabus
{
    const debateClass = { scheduleModel: 'debateMonthly', startDate: '2026-03-01', endDate: '2026-06-30', meetingDays: [3] };
    const templates = [
        { sessionNumber: 2, planTitle: 'Day 2', planDetail: 'HW-DAY-2' },
        { sessionNumber: 3, planTitle: 'Day 3', planDetail: 'HW-DAY-3' }
    ];
    const indexes = CCPSyllabusTemplates.buildTemplateIndexes(templates);
    const savedCompressed = {
        id: 'saved-compressed',
        kind: 'lesson',
        date: '2026-03-11',
        sessionNumber: 2,
        lessonNumber: 2,
        planTitle: 'Merge Day 2+3',
        planDetail: 'HW-DAY-3',
        scheduleCompressed: true,
        compressedGroupStart: 2,
        compressedGroupEnd: 3,
        debateCompressed: true,
        debateGroupStart: 2,
        debateGroupEnd: 3
    };
    const generated = [{ ...savedCompressed, id: 'g-compressed', planDetail: 'HW-DAY-2\n\nHW-DAY-3' }];
    const resolved = CCPSyllabus.resolveCompressedSyllabusRows(
        [savedCompressed],
        [savedCompressed],
        generated,
        debateClass,
        { templateIndexes: indexes }
    );
    const pkt = HT.computeHomeworkForClass({
        classData: debateClass,
        syllabusRows: [
            { id: 'r1', kind: 'lesson', date: '2026-03-04', sessionNumber: 1, planDetail: 'HW-DAY-1' },
            resolved[0],
            { id: 'r4', kind: 'lesson', date: '2026-03-18', sessionNumber: 4, planDetail: 'HW-DAY-4' }
        ],
        referenceDate: '2026-03-11',
        hooks
    });
    assert(pkt.assignHomework === 'HW-DAY-2\n\nHW-DAY-3', 'homework auto-read uses merged compressed detail');
}

// Already-merged saved compressed rows should stay deduped in homework
{
    const debateClass = { scheduleModel: 'debateMonthly', startDate: '2026-03-01', endDate: '2026-06-30', meetingDays: [3] };
    const templates = [
        { sessionNumber: 2, planTitle: 'Day 2', planDetail: 'HW-DAY-2' },
        { sessionNumber: 3, planTitle: 'Day 3', planDetail: 'HW-DAY-3' }
    ];
    const indexes = CCPSyllabusTemplates.buildTemplateIndexes(templates);
    const savedCompressed = {
        id: 'saved-compressed',
        kind: 'lesson',
        date: '2026-03-11',
        sessionNumber: 2,
        lessonNumber: 2,
        planTitle: 'Merge Day 2+3',
        planDetail: 'HW-DAY-2\n\nHW-DAY-3',
        scheduleCompressed: true,
        compressedGroupStart: 2,
        compressedGroupEnd: 3,
        debateCompressed: true,
        debateGroupStart: 2,
        debateGroupEnd: 3
    };
    const resolved = CCPSyllabus.resolveCompressedSyllabusRows(
        [savedCompressed],
        [savedCompressed],
        [{ ...savedCompressed }],
        debateClass,
        { templateIndexes: indexes }
    );
    const pkt = HT.computeHomeworkForClass({
        classData: debateClass,
        syllabusRows: [
            { id: 'r1', kind: 'lesson', date: '2026-03-04', sessionNumber: 1, planDetail: 'HW-DAY-1' },
            resolved[0],
            { id: 'r4', kind: 'lesson', date: '2026-03-18', sessionNumber: 4, planDetail: 'HW-DAY-4' }
        ],
        referenceDate: '2026-03-11',
        hooks
    });
    assert(pkt.assignHomework === 'HW-DAY-2\n\nHW-DAY-3', 'already merged saved row stays deduped');
}

function meetingHooks(holidayMap) {
    const holidays = holidayMap || {};
    return {
        getMeetingDays: (c) => c.meetingDays || [],
        isHolidayForClass: (dateStr) => Boolean(holidays[dateStr]),
        getHolidayForClass: (dateStr) => holidays[dateStr] || null
    };
}

{
    const tueThu = { startDate: '2026-08-01', endDate: '2026-09-30', meetingDays: [2, 4] };
    const tueThuRows = [
        { id: 'tt-1', kind: 'lesson', date: '2026-08-13', sessionNumber: 1, planTitle: 'Last Thu', planDetail: 'HW Thu' },
        { id: 'tt-2', kind: 'lesson', date: '2026-08-18', sessionNumber: 2, planTitle: 'Tue', planDetail: 'HW Tue' },
        { id: 'tt-3', kind: 'lesson', date: '2026-08-20', sessionNumber: 3, planTitle: 'Thu', planDetail: 'HW next Thu' }
    ];
    const tueThuHooks = meetingHooks();
    const pkt = HT.computeHomeworkForClass({
        classData: tueThu,
        syllabusRows: tueThuRows,
        referenceDate: '2026-08-18',
        hooks: tueThuHooks
    });
    assert(pkt.targetLessonDate === '2026-08-18', 'Tue/Thu working from Tuesday targets Tuesday');
    assert(pkt.assignHomework === 'HW Tue', 'assigns this Tuesday’s homework');
    assert(pkt.gradingHomework === 'HW Thu', 'grades last Thursday’s homework');
    assert(pkt.dueDate === '2026-08-20', 'Tue/Thu due is Thursday, not today');
}

{
    const tueThu = { startDate: '2026-08-01', endDate: '2026-09-30', meetingDays: [2, 4] };
    const dupRows = [
        { id: 'd-1', kind: 'lesson', date: '2026-08-13', sessionNumber: 1, planDetail: 'HW Thu' },
        { id: 'd-2a', kind: 'lesson', date: '2026-08-18', sessionNumber: 2, planDetail: 'HW Tue A' },
        { id: 'd-2b', kind: 'lesson', date: '2026-08-18', sessionNumber: 3, planDetail: 'HW Tue B' }
    ];
    const pkt = HT.computeHomeworkForClass({
        classData: tueThu,
        syllabusRows: dupRows,
        referenceDate: '2026-08-18',
        hooks: meetingHooks()
    });
    assert(pkt.dueDate === '2026-08-20', 'duplicate same-day rows still due Thursday, not Tuesday');
    assert(pkt.assignHomework === 'HW Tue A', 'assign uses first lesson on this class date');
    assert(pkt.gradingHomework === 'HW Thu', 'grading skips the other same-day row');
}

{
    const tueThu = { startDate: '2026-08-01', endDate: '2026-09-30', meetingDays: [2, 4] };
    const pastOnly = [
        { id: 'p-1', kind: 'lesson', date: '2026-08-13', sessionNumber: 1, planDetail: 'HW last class' }
    ];
    const pkt = HT.computeHomeworkForClass({
        classData: tueThu,
        syllabusRows: pastOnly,
        referenceDate: '2026-08-18',
        hooks: meetingHooks()
    });
    assert(pkt.targetLessonDate === '2026-08-18', 'extra Tuesday still counts as this class');
    assert(pkt.assignHomework === '', 'no lesson row on extra Tuesday');
    assert(pkt.gradingHomework === 'HW last class', 'grades last numbered lesson at this extra meeting');
    assert(pkt.dueDate === '2026-08-20', 'extra meeting due is next meeting after today, not today');
}

{
    const mwf = { startDate: '2026-08-01', endDate: '2026-09-30', meetingDays: [1, 3, 5] };
    const mwfRows = [
        { id: 'm-1', kind: 'lesson', date: '2026-08-17', sessionNumber: 1, planDetail: 'HW Mon' },
        { id: 'm-2', kind: 'lesson', date: '2026-08-19', sessionNumber: 2, planDetail: 'HW Wed' }
    ];
    const pkt = HT.computeHomeworkForClass({
        classData: mwf,
        syllabusRows: mwfRows,
        referenceDate: '2026-08-17',
        hooks: meetingHooks()
    });
    assert(pkt.dueDate === '2026-08-19', 'MWF Monday due is Wednesday, not Monday');
}

{
    const weekly = { startDate: '2026-08-01', endDate: '2026-09-30', meetingDays: [3] };
    const weeklyRows = [
        { id: 'w-1', kind: 'lesson', date: '2026-08-19', sessionNumber: 1, planDetail: 'HW this Wed' },
        { id: 'w-2', kind: 'lesson', date: '2026-08-26', sessionNumber: 2, planDetail: 'HW next Wed' }
    ];
    const pkt = HT.computeHomeworkForClass({
        classData: weekly,
        syllabusRows: weeklyRows,
        referenceDate: '2026-08-19',
        hooks: meetingHooks()
    });
    assert(pkt.dueDate === '2026-08-26', 'weekly Wednesday due is next Wednesday, not today');
}

{
    const tueThu = { startDate: '2026-08-01', endDate: '2026-09-30', meetingDays: [2, 4] };
    const tueThuRows = [
        { id: 'h-1', kind: 'lesson', date: '2026-08-18', sessionNumber: 1, planDetail: 'HW Tue' },
        { id: 'h-2', kind: 'lesson', date: '2026-08-25', sessionNumber: 2, planDetail: 'HW next Tue' }
    ];
    const pkt = HT.computeHomeworkForClass({
        classData: tueThu,
        syllabusRows: tueThuRows,
        referenceDate: '2026-08-18',
        hooks: meetingHooks({ '2026-08-20': { name: 'Holiday Thursday' } })
    });
    assert(pkt.dueDate === '2026-08-25', 'holiday Thursday is skipped; due is following Tuesday');
    assert(pkt.skippedClassDates.length === 1, 'skip list includes the holiday');
    assert(pkt.skippedClassDates[0].date === '2026-08-20', 'skipped date is Thursday holiday');
}

{
    const lastClass = { startDate: '2026-08-01', endDate: '2026-08-18', meetingDays: [2, 4] };
    const lastRows = [
        { id: 'l-1', kind: 'lesson', date: '2026-08-18', sessionNumber: 1, planDetail: 'HW last' }
    ];
    const pkt = HT.computeHomeworkForClass({
        classData: lastClass,
        syllabusRows: lastRows,
        referenceDate: '2026-08-18',
        hooks: meetingHooks()
    });
    assert(pkt.dueDate === '', 'last lesson of term has no due date');
    assert(pkt.messageKey === 'homeworkTabNoDueDate' || pkt.messageKey === 'homeworkTabNoGradingText',
        'last lesson reports missing due date or first-lesson grading empty');
}

{
    const tueThu = { startDate: '2026-08-01', endDate: '2026-09-30', meetingDays: [2, 4] };
    const tueThuRows = [
        { id: 'o-1', kind: 'lesson', date: '2026-08-18', sessionNumber: 1, planDetail: 'HW Tue' },
        { id: 'o-2', kind: 'lesson', date: '2026-08-20', sessionNumber: 2, planDetail: 'HW Thu' }
    ];
    const pkt = HT.computeHomeworkForClass({
        classData: tueThu,
        syllabusRows: tueThuRows,
        referenceDate: '2026-08-19',
        hooks: meetingHooks()
    });
    assert(pkt.targetLessonDate === '2026-08-20', 'off-day Wednesday still targets upcoming Thursday');
    assert(pkt.dueDate === '2026-08-25', 'off-day due is next meeting after upcoming Thursday');
}

{
    const tueThu = { startDate: '2026-08-01', endDate: '2026-09-30', meetingDays: [2, 4] };
    const tueThuRows = [
        { id: 'past-1', kind: 'lesson', date: '2026-08-13', sessionNumber: 1, planDetail: 'HW last Thu' },
        { id: 'past-2', kind: 'lesson', date: '2026-08-18', sessionNumber: 2, planDetail: 'HW Tue' }
    ];
    const pkt = HT.computeHomeworkForClass({
        classData: tueThu,
        syllabusRows: tueThuRows,
        referenceDate: '2026-08-13',
        hooks: meetingHooks()
    });
    assert(pkt.dueDate === '2026-08-18', 'working from last Thursday: due today (next class) is correct');
}

{
    const block = HT.formatHomeworkBlock('Read p. 12', {
        includeHeader: true,
        className: 'Blue T',
        dueLabel: 'Due',
        dueDateLabel: '2026-08-20',
        sessionLabel: 'Session',
        sessionNumber: 2,
        roleLabel: 'Grade now'
    });
    assert(!block.includes('2026-08-20'), 'clipboard text does not include due date');
    assert(block.includes('Blue T'), 'clipboard still includes class name');
    assert(block.includes('Session 2 · Grade now'), 'grading clipboard names Grade now beside the session');
    assert(block.includes('Read p. 12'), 'clipboard includes homework body');

    const assignBlock = HT.formatHomeworkBlock('Write p. 4', {
        includeHeader: true,
        className: 'Blue T',
        sessionLabel: 'Session',
        sessionNumber: 5,
        roleLabel: 'Covered in class'
    });
    assert(assignBlock.includes('Session 5 · Covered in class'), 'assign clipboard names Covered in class beside the session');
    assert(assignBlock.startsWith('Blue T\nSession 5 · Covered in class\n\nWrite p. 4'), 'assign header sits above the homework body');

    const roleOnly = HT.formatHomeworkBlock('Vocab', {
        includeHeader: true,
        className: 'Blue T',
        sessionLabel: 'Session',
        sessionNumber: 0,
        roleLabel: 'Grade now'
    });
    assert(roleOnly.includes('Grade now'), 'role still appears when there is no session number');
    assert(!roleOnly.includes('Session 0'), 'missing session number is omitted');
}

{
    assert(HT.textIncludesDebateDay3('Day 3') === true, 'Day 3 title matches');
    assert(HT.textIncludesDebateDay3('Alt Day 3') === true, 'Alt Day 3 title matches');
    assert(HT.textIncludesDebateDay3('Day 2 & 3 Combined') === true, 'combined title matches');
    assert(HT.textIncludesDebateDay3('Day 2') === false, 'Day 2 alone does not match');
    assert(HT.textIncludesDebateDay3('Day 4 / Preview') === false, 'Day 4 does not match');
    assert(HT.isDebateHomeworkClass({ scheduleModel: 'debateMonthly' }) === true, 'debateMonthly is debate class');
    assert(HT.isDebateHomeworkClass({ scheduleModel: 'sequentialTerm' }) === false, 'sequential is not debate');

    const debateClass = { scheduleModel: 'debateMonthly', name: 'Garam Debate' };
    assert(
        HT.assignHomeworkIncludesDebateDay3(debateClass, {
            assignSourceTitle: 'Day 3',
            assignHomework: 'Memorize speech'
        }) === true,
        'packet with Day 3 title triggers automation'
    );
    assert(
        HT.assignHomeworkIncludesDebateDay3(debateClass, {
            assignSourceTitle: 'Day 1',
            assignHomework: 'Vocab'
        }) === false,
        'Day 1 packet does not trigger'
    );
    assert(
        HT.assignHomeworkIncludesDebateDay3({ scheduleModel: 'sequentialTerm' }, {
            assignSourceTitle: 'Day 3'
        }) === false,
        'non-debate class ignores Day 3 title'
    );
    assert(
        HT.assignHomeworkIncludesDebateDay3(debateClass, {
            assignSourceTitle: '',
            assignSourceSessionNumber: 3,
            assignHomework: ''
        }) === true,
        'session number 3 triggers for debate class'
    );
}

{
    const start = HT.DEBATE_TEAMS_BLOCK_START;
    const end = HT.DEBATE_TEAMS_BLOCK_END;
    const base = 'Memorize your speech for class.';
    const teams = 'DEBATE 1\n1. Alice (PM) — Proposition';
    const once = HT.injectDebateTeamsIntoAssignText(base, teams);
    assert(once.includes(start), 'inject adds start marker');
    assert(once.includes(end), 'inject adds end marker');
    assert(once.includes(teams), 'inject adds speaking order');
    assert(once.startsWith(base), 'inject keeps homework body');

    const twice = HT.injectDebateTeamsIntoAssignText(once, 'DEBATE 1\n1. Bob (LO)');
    assert(twice.includes('Bob (LO)'), 're-inject replaces with new teams');
    assert(!twice.includes('Alice (PM)'), 'old teams block removed on re-inject');
    assert((twice.match(new RegExp(start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 1,
        'only one start marker after re-inject');

    const stripped = HT.stripDebateTeamsBlock(twice);
    assert(!stripped.includes(start), 'strip removes teams block');
    assert(stripped.includes(base), 'strip keeps homework body');
}

// Manual homeworkDueDate override on assign syllabus row
{
    const rowsWithOverride = rows.map((r) =>
        r.id === 'row-1' ? { ...r, homeworkDueDate: '2026-05-20' } : { ...r }
    );
    const pkt = HT.computeHomeworkForClass({
        classData,
        syllabusRows: rowsWithOverride,
        referenceDate: '2026-05-04',
        hooks
    });
    assert(pkt.dueDate === '2026-05-20', 'override due date wins over next class');
    assert(pkt.dueDateOverridden === true, 'packet marks due as overridden');
    assert(pkt.dueDateAutomatic === '2026-05-08', 'automatic next-class still exposed');
    assert(pkt.skippedClassDates.some((s) => s.date === '2026-05-06'),
        'skips still listed between assign and override due');
}

{
    const resolved = HT.resolveHomeworkDueDate(classData, rows[0], hooks, rows);
    assert(resolved.dueDate === '2026-05-08', 'resolve without override uses next class');
    assert(resolved.dueDateOverridden === false, 'not overridden');

    const cleared = HT.resolveHomeworkDueDate(
        classData,
        { ...rows[0], homeworkDueDate: '' },
        hooks,
        rows
    );
    assert(cleared.dueDate === '2026-05-08', 'empty override clears to automatic');
    assert(cleared.dueDateOverridden === false, 'empty override is not overridden');
}

{
    assert(HT.isValidHomeworkDueIso('2026-05-20') === true, 'valid ISO accepted');
    assert(HT.isValidHomeworkDueIso('bad') === false, 'invalid ISO rejected');
}

{
    assert(HT.assignNeedsEssayCheck({ title: 'Day 4 / Preview', text: 'Read p. 1' }) === true, 'Day 4 title warns');
    assert(
        HT.assignNeedsEssayCheck({ title: 'Day 4 / Preview & Day 1 (month bridge)', text: '' }) === true,
        'month-bridge Day 4 warns'
    );
    assert(HT.assignNeedsEssayCheck({ title: 'Day 2', text: 'Write an essay' }) === true, 'essay text warns');
    assert(HT.assignNeedsEssayCheck({ title: 'Day 2', text: '에세이 쓰기' }) === true, 'Korean essay text warns');
    assert(HT.assignNeedsEssayCheck({ title: 'Day 1', text: 'Vocab', trackEssay: true }) === true, 'trackEssay warns');
    assert(
        HT.assignNeedsEssayCheck({ title: 'Day 2', text: 'Write an essay', trackEssay: false }) === false,
        'essay checkbox off does not warn'
    );
    assert(HT.assignNeedsEssayCheck({ title: 'Day 2', text: 'Practice speeches' }) === false, 'Day 2 without essay does not warn');
    assert(
        HT.assignNeedsEssayCheck({ title: 'Day 4', text: 'no essay word', trackEssay: false }) === true,
        'Day 4 warns even if the essay checkbox is off'
    );

    const essayRows = [
        { id: 'd2', kind: 'lesson', date: '2026-05-04', sessionNumber: 2, planTitle: 'Day 2', planDetail: 'Practice speeches' },
        { id: 'd4', kind: 'lesson', date: '2026-05-08', sessionNumber: 4, planTitle: 'Day 4 / Preview', planDetail: 'HW-DAY-4' }
    ];
    const day2Pkt = HT.computeHomeworkForClass({
        classData,
        syllabusRows: essayRows,
        referenceDate: '2026-05-04',
        hooks
    });
    assert(day2Pkt.assignNeedsEssayCheck === false, 'Day 2 packet does not warn');
    const day4Pkt = HT.computeHomeworkForClass({
        classData,
        syllabusRows: essayRows,
        referenceDate: '2026-05-08',
        hooks
    });
    assert(day4Pkt.assignNeedsEssayCheck === true, 'Day 4 packet warns');
    const essayPkt = HT.computeHomeworkForClass({
        classData,
        syllabusRows: [
            {
                id: 'e1',
                kind: 'lesson',
                date: '2026-05-04',
                sessionNumber: 1,
                planTitle: 'Unit 3',
                planDetail: 'Write an essay',
                trackEssay: true
            }
        ],
        referenceDate: '2026-05-04',
        hooks
    });
    assert(essayPkt.assignNeedsEssayCheck === true, 'essay homework packet warns');
}

{
    assert(HT.homeworkSavedMarkId('class-1', '2026-10-22', 'grading') === '2026-10-22:class-1:grading', 'grading saved mark id');
    assert(HT.homeworkSavedMarkId('class-1', '2026-10-22', 'assign') === '2026-10-22:class-1:assign', 'assign saved mark id');
    assert(HT.homeworkSavedMarkId('class-1', '2026-10-22', 'other') === '', 'saved mark id needs a known block');
    assert(HT.homeworkSavedMarkId('', '2026-10-22', 'grading') === '', 'saved mark id needs a class');
    assert(HT.homeworkSavedMarkId('class-1', '10/22', 'grading') === '', 'saved mark id needs an ISO date');
    assert(HT.isHomeworkSavedForClass([], 'class-1', '2026-10-22', 'grading') === false, 'missing mark is not saved');
    const stamped = '2026-10-22T00:00:00.000Z';
    const graded = HT.setHomeworkSavedMark([], 'class-1', '2026-10-22', 'grading', true, stamped);
    assert(graded.length === 1, 'check adds one row');
    assert(graded[0].id === '2026-10-22:class-1:grading', 'check row id');
    assert(graded[0].category === 'grading', 'check stores the block');
    assert(graded[0].saved === true, 'check stores saved true');
    assert(graded[0].updatedAt === stamped, 'check keeps the given timestamp');
    assert(HT.isHomeworkSavedForClass(graded, 'class-1', '2026-10-22', 'grading') === true, 'checked block reads saved');
    assert(HT.isHomeworkSavedForClass(graded, 'class-1', '2026-10-22', 'assign') === false, 'the other block stays unsaved');
    assert(HT.isHomeworkSavedForClass(graded, 'class-1', '2026-10-23', 'grading') === false, 'another day is not saved');
    const unchecked = HT.setHomeworkSavedMark(graded, 'class-1', '2026-10-22', 'grading', false, '2026-10-22T01:00:00.000Z');
    assert(graded.length === 1 && graded[0].saved === true, 'set does not mutate the previous list');
    assert(unchecked.length === 1 && unchecked[0].saved === false, 'turning saved off keeps the row as saved false');
    assert(HT.isHomeworkSavedForClass(unchecked, 'class-1', '2026-10-22', 'grading') === false, 'unsaved block reads not saved');
    const both = HT.setHomeworkSavedMark(unchecked, 'class-1', '2026-10-22', 'assign', true, '2026-10-22T02:00:00.000Z');
    assert(both.length === 2, 'grade and assign are separate rows');
    assert(HT.isHomeworkSavedForClass(both, 'class-1', '2026-10-22', 'assign') === true, 'assign block reads saved');
    assert(HT.setHomeworkSavedMark(both, 'class-2', 'bad-date', 'grading', true).length === both.length, 'bad date does not add a row');
}

console.log('homework-tab.test.mjs: all passed');
