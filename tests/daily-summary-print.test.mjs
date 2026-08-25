import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadDailySummaryPrint() {
    const code = readFileSync(path.join(root, 'js', 'daily-summary-print.js'), 'utf8');
    const sandbox = { window: {}, globalThis: {}, module: { exports: {} } };
    vm.runInNewContext(code, sandbox);
    return sandbox.window.CCPDailySummaryPrint || sandbox.module.exports;
}

const DSP = loadDailySummaryPrint();

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const labels = {
    teacherDocTitle: 'Teacher daily summary',
    fromLastClass: 'From last class',
    gradingHomework: 'Homework to grade today',
    todaySection: 'Today',
    studentSheetTitle: "Today's Homework",
    dateLabel: 'Date',
    dueLabel: 'Due',
    sessionLabel: 'Class',
    noPriorClass: 'No prior class',
    noPrepNotes: 'No prep notes',
    noGradingHomework: 'No grading',
    noTodayContent: 'No today',
    noHomework: 'No homework'
};

function splitPlanDetailSections(planDetail) {
    const raw = String(planDetail ?? '').trim();
    if (!raw.includes('Homework:')) {
        return { covered: raw, homework: '' };
    }
    const idx = raw.indexOf('Homework:');
    return {
        covered: raw.slice(0, idx).replace(/Covered in class:\s*/i, '').trim(),
        homework: raw.slice(idx + 'Homework:'.length).trim()
    };
}

{
    const classes = [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
        { id: 'c', name: 'Gamma' }
    ];
    const onDate = (c, date) => c.id === 'a' || (c.id === 'b' && date === '2026-06-10');
    const resolved = DSP.resolveClassesForDailyPrint(classes, {
        referenceDate: '2026-06-10',
        myClassesOnly: false,
        classOccursOnIsoDate: onDate
    });
    assert(resolved.length === 2, 'filters to classes on reference date');
    assert(resolved[0].id === 'a' && resolved[1].id === 'b', 'preserves order');
}

{
    const classes = [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' }
    ];
    const onDate = () => true;
    const resolved = DSP.resolveClassesForDailyPrint(classes, {
        referenceDate: '2026-06-10',
        myClassesOnly: true,
        assignedClassIds: new Set(['b']),
        classOccursOnIsoDate: onDate
    });
    assert(resolved.length === 1 && resolved[0].id === 'b', 'my classes only narrows list');
}

{
    const payload = DSP.buildDailySummaryPayload({
        classData: { id: 'c1', name: 'Debate A' },
        classMeta: 'Mon · Grade 5',
        calendarName: 'Spring 2026',
        referenceDate: '2026-06-10',
        referenceDateLabel: 'Jun 10',
        packet: {
            targetSessionNumber: 3,
            targetLessonTitle: 'Unit 2 Part 1',
            targetLessonDate: '2026-06-10',
            gradingHomework: 'Grade HW week 2',
            assignHomework: 'Covered in class:\np. 20-22\nHomework:\nWorkbook p. 10',
            dueDate: '2026-06-12'
        },
        prep: {
            previousMeetingDate: '2026-06-08',
            notes: [{ text: 'Review quiz answers', date: '2026-06-08' }]
        },
        previousMeetingDateLabel: 'Jun 8',
        dueDateLabel: 'Jun 12',
        splitPlanDetailSections
    });
    assert(payload.gradingHomework === 'Grade HW week 2', 'grading block passed through');
    assert(payload.todayCovered.includes('p. 20-22'), 'today covered extracted');
    assert(payload.studentHomework.includes('Workbook p. 10'), 'student homework extracted');
    assert(payload.prepNotes.length === 1, 'prep notes included');
}

{
    const html = DSP.renderTeacherSummaryCombinedDocumentHtml(
        [{
            classId: 'c1',
            className: 'Debate A',
            classMeta: 'Mon',
            calendarName: 'Term',
            referenceDateLabel: 'Jun 10',
            sessionNumber: 3,
            lessonTitle: 'Unit 2',
            previousMeetingDate: '2026-06-08',
            previousMeetingDateLabel: 'Jun 8',
            prepNotes: [{ text: 'Bring books' }],
            gradingHomework: 'HW to grade',
            todayCovered: 'Pages 1-5',
            assignHomework: '',
            studentHomework: '',
            dueDate: '',
            dueDateLabel: ''
        }],
        labels,
        { title: 'Teacher summary' }
    );
    assert(html.includes('daily-summary-sheet--teacher-combined'), 'combined teacher sheet');
    assert(html.includes('daily-summary-class-block'), 'class block');
    assert(html.includes('From last class'), 'prep section heading');
    assert(html.includes('Homework to grade today'), 'grading section');
    assert(html.includes('Today'), 'today section');
    assert(html.includes('Bring books'), 'prep note body');
}

{
    const html = DSP.renderStudentHandoutDocumentHtml(
        [
            {
                classId: 'c1',
                className: 'Debate A',
                referenceDateLabel: 'Jun 10',
                dueDateLabel: 'Jun 12',
                studentHomework: 'Workbook p. 10',
                assignHomework: 'Workbook p. 10'
            },
            {
                classId: 'c2',
                className: 'Debate B',
                referenceDateLabel: 'Jun 10',
                dueDateLabel: 'Jun 12',
                studentHomework: 'Read ch 3',
                assignHomework: 'Read ch 3'
            }
        ],
        labels,
        { copiesPerPage: 4, title: 'Student HW' }
    );
    const sheetCount = (html.match(/class="daily-summary-sheet daily-summary-sheet--student"/g) || []).length;
    assert(sheetCount === 2, 'one student sheet per class');
    assert(html.includes('daily-summary-student-page-header'), 'page header per class');
    assert(html.includes('Debate A · Jun 10'), 'class header line');
    assert(html.includes('border: 0.35mm solid #000'), 'solid cell borders in CSS');
    const slipCount = (html.match(/class="daily-summary-student-slip"/g) || []).length;
    assert(slipCount === 8, 'four slips per class across two classes');
}

{
    const classes = [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
        { id: 'c', name: 'Gamma' }
    ];
    const onDate = (c, date) => {
        if (c.id === 'b') {
            throw new Error('malformed schedule');
        }
        return c.id === 'a' || (c.id === 'c' && date === '2026-06-10');
    };
    const resolved = DSP.resolveClassesForDailyPrint(classes, {
        referenceDate: '2026-06-10',
        myClassesOnly: false,
        classOccursOnIsoDate: onDate
    });
    assert(resolved.length === 2, 'skips class whose occurs check throws');
    assert(resolved[0].id === 'a' && resolved[1].id === 'c', 'keeps good classes when one throws');
}

{
    assert(DSP.gridDimensionsForCopies(4).cols === 2 && DSP.gridDimensionsForCopies(4).rows === 2, '2x2 grid');
    assert(DSP.gridDimensionsForCopies(6).rows === 3, '2x3 grid for 6 copies');
}

{
    const hw = DSP.extractStudentHomework('Covered in class:\nx\nHomework:\ny', splitPlanDetailSections);
    assert(hw === 'y', 'extractStudentHomework prefers homework section');
}

console.log('daily-summary-print.test.mjs: all tests passed');
