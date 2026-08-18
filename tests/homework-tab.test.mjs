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
        { id: 'r4', kind: 'lesson', date: '2026-03-18', sessionNumber: 3, planTitle: 'Day 4', planDetail: 'HW-DAY-4' }
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
            { id: 'r4', kind: 'lesson', date: '2026-03-18', sessionNumber: 3, planDetail: 'HW-DAY-4' }
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
            { id: 'r4', kind: 'lesson', date: '2026-03-18', sessionNumber: 3, planDetail: 'HW-DAY-4' }
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
            { id: 'r4', kind: 'lesson', date: '2026-03-18', sessionNumber: 3, planDetail: 'HW-DAY-4' }
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
        sessionNumber: 2
    });
    assert(!block.includes('2026-08-20'), 'clipboard text does not include due date');
    assert(block.includes('Blue T'), 'clipboard still includes class name');
    assert(block.includes('Read p. 12'), 'clipboard includes homework body');
}

console.log('homework-tab.test.mjs: all passed');
