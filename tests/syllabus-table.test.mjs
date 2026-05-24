/**
 * Run: node tests/syllabus-table.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const utilsPath = path.join(root, 'js', 'utils.js');
const templatesPath = path.join(root, 'js', 'syllabus-templates.js');
const syllabusPath = path.join(root, 'js', 'syllabus-table.js');

await import(pathToFileURL(utilsPath).href);
await import(pathToFileURL(templatesPath).href);
await import(pathToFileURL(syllabusPath).href);

const { CCPSyllabus } = globalThis;

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

// Month/week cells use rowspan (PDF-style merged cells)
{
    const rows = CCPSyllabus.normalizeRows([
        { date: '2026-03-02', monthKey: '2026-03', weekLabel: 'Mar 2–6', sessionNumber: 1, planTitle: 'A' },
        { date: '2026-03-05', monthKey: '2026-03', weekLabel: 'Mar 2–6', sessionNumber: 2, planTitle: 'B' },
        { date: '2026-03-09', monthKey: '2026-03', weekLabel: 'Mar 9–13', sessionNumber: 3, planTitle: 'C' },
        { date: '2026-07-07', monthKey: '2026-07', weekLabel: 'July 6–10', sessionNumber: 4, planTitle: 'D' }
    ]);
    const merge = CCPSyllabus.computeSyllabusCellMerges(rows, true);
    assert(merge.monthRowspan[0] === 3, 'March spans 3 rows');
    assert(merge.monthRowspan[3] === 1, 'July spans 1 row');
    assert(merge.weekRowspan[0] === 2, 'first week spans 2 rows');
    assert(merge.weekRowspan[2] === 1, 'second week spans 1 row');
    const html = CCPSyllabus.renderSyllabusTableHtml({}, rows, { pdfLayout: true, tableYear: '2026' });
    assert(html.includes('rowspan="3"'), 'month rowspan in html');
    assert(html.includes('syllabus-cell-merged'), 'merged cell class');
    assert(html.includes('July'), 'July label in merged cell');
}

// A4 PDF export adds density class for long syllabi
{
    const manyRows = Array.from({ length: 28 }, (_, i) => ({
        date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
        monthKey: '2026-03',
        weekLabel: 'Mar 2–6',
        sessionNumber: i + 1,
        planTitle: `Lesson ${i + 1}`
    }));
    const docHtml = CCPSyllabus.renderSyllabusDocumentHtml(
        { title: 'Test' },
        [{ classData: {}, rows: manyRows, classTitle: 'Navy 7A' }],
        { pdfLayout: true, a4Pdf: true, tableYear: '2026', colWeek: 'Week', colClass: 'Class', colPlan: 'Plan', colNote: 'Note' }
    );
    assert(!docHtml.includes('syllabus-a4-page syllabus-a4-dense'), '28 rows use normal density');
    assert(!docHtml.includes('syllabus-a4-page syllabus-a4-extra-dense'), '28 rows use normal density');
    assert(docHtml.includes('syllabus-a4-sheet'), 'A4 sheet wrapper per class');
    assert(docHtml.includes('<colgroup>'), 'colgroup for column widths');
    assert(docHtml.includes('width:48%'), 'plan column width');
}

// Week label Mon–Fri
{
    const label = CCPSyllabus.getSchoolWeekLabel('2026-03-04');
    assert(label === 'Mar 2–6', `expected Mar 2–6, got ${label}`);
}

// Holiday slot uses session number and (M/D) title
{
    const classData = { name: 'Navy' };
    const lessons = [
        { date: '2026-03-02', monthKey: '2026-03', label: '', __syllabusHoliday: true }
    ];
    const rows = CCPSyllabus.buildSyllabusRowsFromSchedule(classData, lessons, {
        isHolidayForClass: () => true,
        getHolidayForClass: () => ({ name: 'Substitute Holiday', bgColor: '#fef3c7', textColor: '#b45309' }),
        getEventColors: (_ev, type) => ({
            bg: '#fef3c7',
            text: '#b45309',
            type: type || 'holiday'
        })
    });
    assert(rows.length === 1, 'one holiday row');
    assert(rows[0].kind === 'holiday', 'kind holiday');
    assert(rows[0].rowBg === '#fef3c7', 'holiday rowBg from event colors');
    assert(rows[0].rowColor === '#b45309', 'holiday rowColor from event colors');
    assert(rows[0].sessionNumber === 0, 'holiday has no class number');
    assert(rows[0].planTitle.includes('Substitute Holiday'), 'holiday name in plan');
    assert(rows[0].planTitle.includes('(3/2)'), 'short date in plan');
    assert((rows[0].planDetail || '').length > 0, 'holiday has subline detail');
}

// Unscheduled lessons append at end with overflow kind
{
    const classData = { syllabusUnits: [] };
    const lessons = [
        { date: '2026-03-05', monthKey: '2026-03', label: 'Unit 1' },
        { __syllabusOverflowIntro: true },
        { __syllabusUnscheduled: true, lessonNum: 3, label: 'Unit 2 [1/2] – Speaking' }
    ];
    const rows = CCPSyllabus.buildSyllabusRowsFromSchedule(classData, lessons, {
        isHolidayForClass: () => false,
        overflowIntro: 'Not placed:',
        overflowNote: 'Extend term.'
    });
    const overflow = rows.filter(r => r.kind === 'overflow');
    assert(overflow.length === 1, 'one overflow row');
    assert(overflow[0].sessionNumber === 3, 'curriculum number in class column');
    assert(overflow[0].note.includes('Extend'), 'overflow note');
}

// Session numbering and lesson rows
{
    const classData = {
        syllabusUnits: [
            { speakingPages: 'SB p. 8–11', writingPages: 'WB p. 2' }
        ]
    };
    const lessons = [
        { date: '2026-03-02', label: 'Unit 1 [1/2] – Speaking', monthKey: '2026-03' },
        { date: '2026-03-05', label: 'Unit 1 [2/2] – Writing', monthKey: '2026-03' }
    ];
    const rows = CCPSyllabus.buildSyllabusRowsFromSchedule(classData, lessons, {
        isHolidayForClass: () => false
    });
    assert(rows.length === 2, 'expected 2 lesson rows');
    assert(rows[0].sessionNumber === 1, 'first session is 1');
    assert(rows[1].sessionNumber === 2, 'second session is 2');
    assert(rows[0].planDetail.includes('SB'), 'speaking pages from unit');
    assert(rows[1].planDetail.includes('WB'), 'writing pages from unit');
}

// Holiday between lessons: class # and pages stay on curriculum lesson index
{
    const classData = {
        syllabusUnits: [
            { speakingPages: 'SPEAK-UNIT-1', writingPages: 'WRITE-UNIT-1' },
            { speakingPages: 'SPEAK-UNIT-2', writingPages: 'WRITE-UNIT-2' }
        ]
    };
    const lessons = [
        { date: '2026-03-02', label: 'Unit 1 [1/2] – Speaking', monthKey: '2026-03' },
        { date: '2026-03-05', label: '', __syllabusHoliday: true, monthKey: '2026-03' },
        { date: '2026-03-09', label: 'Unit 1 [2/2] – Writing', monthKey: '2026-03' }
    ];
    const rows = CCPSyllabus.buildSyllabusRowsFromSchedule(classData, lessons, {
        isHolidayForClass: (dateStr) => dateStr === '2026-03-05'
    });
    const lessonRows = rows.filter(r => r.kind === 'lesson');
    assert(lessonRows.length === 2, 'two lesson rows around holiday');
    assert(lessonRows[0].sessionNumber === 1, 'first lesson class # 1');
    assert(lessonRows[1].sessionNumber === 2, 'second lesson class # 2 after holiday');
    assert(lessonRows[0].planDetail.includes('SPEAK-UNIT-1'), 'lesson 1 speaking pages');
    assert(lessonRows[1].planDetail.includes('WRITE-UNIT-1'), 'lesson 2 writing pages for unit 1');
}

// Preset pages follow plan title (Unit 1 Part 1) when building rows
{
    const classData = { classTypeId: 'preset-write-now-green', syllabusUnits: [] };
    const lessons = [
        { date: '2026-03-02', label: 'Unit 1 Part 1', monthKey: '2026-03' },
        { date: '2026-03-05', label: '', __syllabusHoliday: true, monthKey: '2026-03' },
        { date: '2026-03-09', label: 'Unit 1 Part 2', monthKey: '2026-03' }
    ];
    const templates = [
        { sessionNumber: 1, planTitle: 'Unit 1 Part 1', planDetail: 'WN-PAGES-PART-1' },
        { sessionNumber: 2, planTitle: 'Unit 1 Part 2', planDetail: 'WN-PAGES-PART-2' }
    ];
    const rows = CCPSyllabus.buildSyllabusRowsFromSchedule(classData, lessons, {
        isHolidayForClass: (d) => d === '2026-03-05',
        rowTemplates: templates
    });
    const lessonsOnly = rows.filter(r => r.kind === 'lesson');
    assert(lessonsOnly[0].planDetail.includes('WN-PAGES-PART-1'), 'part 1 pages by title');
    assert(lessonsOnly[1].planDetail.includes('WN-PAGES-PART-2'), 'part 2 pages after holiday');
}

// Merge preserves manual note and typed planDetail
{
    const existing = [
        {
            id: 'a',
            kind: 'lesson',
            date: '2026-03-02',
            sessionNumber: 1,
            planTitle: 'Unit 1 [1/2] – Speaking',
            planDetail: 'My custom pages',
            note: 'Intro week',
            source: 'generated'
        }
    ];
    const generated = [
        {
            id: 'b',
            kind: 'lesson',
            date: '2026-03-02',
            sessionNumber: 1,
            planTitle: 'Unit 1 [1/2] – Speaking',
            planDetail: 'Auto pages',
            note: '',
            source: 'generated'
        }
    ];
    const merged = CCPSyllabus.mergeSyllabusRows(existing, generated);
    assert(merged.length === 1, 'one merged row');
    assert(merged[0].planDetail === 'My custom pages', 'keeps user planDetail');
    assert(merged[0].note === 'Intro week', 'keeps user note');
}

// Imported source preserved like manual on refresh
{
    const existing = [
        {
            id: 'a',
            kind: 'lesson',
            date: '2026-03-02',
            sessionNumber: 1,
            planTitle: 'Unit 1',
            planDetail: 'Pasted homework',
            note: '',
            source: 'imported'
        }
    ];
    const generated = [
        {
            id: 'b',
            kind: 'lesson',
            date: '2026-03-02',
            sessionNumber: 1,
            planTitle: 'Unit 1 [1/2] – Speaking',
            planDetail: 'Auto pages',
            note: '',
            source: 'generated'
        }
    ];
    const merged = CCPSyllabus.mergeSyllabusRows(existing, generated);
    assert(merged[0].planDetail === 'Pasted homework', 'keeps imported planDetail');
    assert(merged[0].source === 'imported', 'keeps imported source');
}

// Note rows kept on merge
{
    const existing = [
        {
            id: 'n1',
            kind: 'note',
            planTitle: 'Each unit is one week.',
            planDetail: '',
            note: '',
            source: 'manual'
        }
    ];
    const generated = [
        {
            kind: 'lesson',
            date: '2026-03-02',
            sessionNumber: 1,
            planTitle: 'Day 1',
            planDetail: '',
            note: '',
            source: 'generated'
        }
    ];
    const merged = CCPSyllabus.mergeSyllabusRows(existing, generated);
    assert(merged[0].kind === 'note', 'note row stays first');
    assert(merged.length === 2, 'note + lesson');
}

// Printable table HTML includes inline holiday background colors
{
    const rows = CCPSyllabus.normalizeRows([{
        kind: 'holiday',
        date: '2026-03-02',
        monthKey: '2026-03',
        weekLabel: 'Mar 2–6',
        sessionNumber: 0,
        planTitle: '(3/2) Thanksgiving',
        planDetail: 'No class',
        rowBg: '#ff6b6b',
        rowColor: '#ffffff',
        eventType: 'holiday'
    }]);
    const html = CCPSyllabus.renderSyllabusTableHtml({}, rows, { pdfLayout: true, tableYear: '2026' });
    assert(html.includes('background-color:#ff6b6b'), 'holiday rowBg in print HTML');
    assert(html.includes('color:#ffffff'), 'holiday rowColor in print HTML');
    assert(html.includes('syllabus-row-holiday'), 'holiday row class');
}

// Scale fills full page height (scale up when short, down when tall)
{
    const contentH = 1000;
    const contentW = 700;
    const scaleUp = CCPSyllabus.computeSyllabusPageScale(500, 300, contentW, contentH);
    assert(Math.abs(scaleUp - 2) < 0.001, 'short content scales up to fill height');
    const scaleDown = CCPSyllabus.computeSyllabusPageScale(2000, 600, contentW, contentH);
    assert(Math.abs(scaleDown - 0.5) < 0.001, 'tall content scales down to fit height');
    const scaleWidth = CCPSyllabus.computeSyllabusPageScale(500, 900, contentW, contentH);
    assert(scaleWidth < 2 && Math.abs(900 * scaleWidth - contentW) < 1, 'width cap when scaled up');
}

console.log('All syllabus-table tests passed.');
