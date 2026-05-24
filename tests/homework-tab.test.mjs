import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadHomeworkTab() {
    const utilsCode = readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
    const tabCode = readFileSync(path.join(root, 'js', 'homework-tab.js'), 'utf8');
    const sandbox = { window: {}, globalThis: {} };
    vm.runInNewContext(utilsCode, sandbox);
    vm.runInNewContext(tabCode, sandbox);
    return sandbox.window.CCPHomeworkTab;
}

const HT = loadHomeworkTab();

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
    assert(pkt.gradingHomework === 'HW week 2', 'on 5/8 class, grade homework due this session');
    assert(pkt.assignHomework === 'HW week 3', 'assign homework for next session');
    assert(pkt.dueDate === '2026-05-11', 'due next lesson date');
    assert(pkt.gradingSourceRowId === 'row-2', 'grading links to current session syllabus row');
    assert(pkt.assignSourceRowId === 'row-3', 'assign links to next session row');
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

console.log('homework-tab.test.mjs: all passed');
