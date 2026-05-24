/**
 * Run: node tests/syllabus-curricula.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'schedule-matrix-data.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'syllabus-schedule-matrix.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'syllabus-curricula-data.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'syllabus-curricula.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'syllabus-presets.js')).href);

const { CCPSyllabusPresets, CCPScheduleMatrix, CCPCurriculaData } = globalThis;

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

// Legacy preset IDs resolve to new curricula
{
    assert(CCPSyllabusPresets.resolvePresetId('preset-rc-greenblue') === 'preset-rc-green-blue', 'greenblue alias');
    assert(CCPSyllabusPresets.getById('preset-rc-saemmul-wf')?.id === 'preset-rc-yeoul-saemmul', 'saemmul wf alias');
    assert(CCPSyllabusPresets.getById('preset-gr-garambada')?.id === 'preset-gr-garam', 'garambada alias');
}

// Navy preset has session templates and rcNavyUnit label mode
{
    const navy = CCPSyllabusPresets.getById('preset-rc-navy');
    assert(navy && navy.lessonLabelMode === 'rcNavyUnit', 'navy label mode');
    assert(navy.defaultSyllabusRowTemplates.length >= 20, 'navy templates');
    assert(navy.defaultSyllabusRowTemplates[0].planTitle.includes('Unit'), 'navy first title');
}

// Schedule matrix suggests MWF for Navy reading at Green level (junior uses Green in preset for green-blue only)
{
    const greenRc = CCPSyllabusPresets.getById('preset-rc-green-blue');
    const sug = CCPScheduleMatrix.suggestMeetingDaysForPreset(greenRc, { currentMeetingDays: [] });
    assert(sug && sug.meetingDays.join(',') === '1,3,5', 'green reading mwf suggest');
    assert(sug.period === 1, 'green reading period 1');
}

// Phonics red templates
{
    const red = CCPSyllabusPresets.getById('preset-phonics-red');
    assert(red.lessonLabelMode === 'phonicsUnit', 'phonics mode');
    assert(red.defaultSyllabusRowTemplates.some(r => r.planTitle.includes('1권')), 'phonics book marker');
}

// Hand in Hand Red / Orange / Yellow (shared pagination; Red-only listening tracks)
{
    const red = CCPSyllabusPresets.getById('preset-hand-in-hand-red');
    const orange = CCPSyllabusPresets.getById('preset-hand-in-hand-orange');
    const yellow = CCPSyllabusPresets.getById('preset-hand-in-hand-yellow');
    assert(red && orange && yellow, 'all hand in hand presets exist');
    assert(!orange.isStub && !yellow.isStub, 'orange yellow not stubs');
    [red, orange, yellow].forEach(p => {
        assert(p.defaultTotalLessons === 22, `${p.id} 22 lessons`);
        assert(p.defaultSyllabusRowTemplates[0].planTitle.includes('Unit 1'), `${p.id} first lesson pages`);
        assert(p.defaultSyllabusRowTemplates[1].planTitle.includes('Unit 1'), `${p.id} session 2 pages`);
        assert(p.defaultSyllabusRowTemplates[0].planDetail.includes('Worksheet 1'), `${p.id} worksheet line`);
    });
    [orange, yellow].forEach(p => {
        assert(!p.defaultSyllabusRowTemplates[1].planDetail.includes('Tracks:'), `${p.id} no tracks`);
    });
    assert(red.defaultBook === 'Hand in Hand 1', 'red book');
    assert(orange.defaultBook === 'Hand in Hand 2', 'orange book');
    assert(yellow.defaultBook === 'Hand in Hand 3', 'yellow book');
    assert(red.defaultSyllabusRowTemplates[0].planDetail.includes('Tracks: 2-4'), 'red listening tracks');
    assert(red.defaultSyllabusRowTemplates[0].planDetail.includes('음원경로'), 'red audio path');
    assert(red.defaultSyllabusRowTemplates[1].planDetail.includes('Homework:'), 'red homework heading');
    assert(!orange.defaultSyllabusRowTemplates[0].planDetail.includes('음원경로'), 'orange no audio block');
    assert(red.defaultSyllabusRowTemplates[21].planTitle.includes('Review Pages 88-93'), 'final review row');
    assert(!red.defaultSyllabusRowTemplates.some(r => r.planTitle.includes('Substitute Holiday')), 'no baked-in holidays');
    assert(!red.defaultSyllabusRowTemplates.some(r => r.planTitle.includes('Extra Class')), 'no baked-in extra class');
}

// WR+SP Write Right Green / Blue / Navy (18 sessions, SB/WB ranges)
{
    const green = CCPSyllabusPresets.getById('preset-wr-sp-green');
    const navy = CCPSyllabusPresets.getById('preset-wr-sp-navy');
    assert(green.defaultBook === 'Write Right 1', 'green book 1');
    assert(navy.defaultBook === 'Write Right 3', 'navy book 3');
    assert(green.defaultSyllabusRowTemplates.length === 18, 'write right 18 lessons');
    assert(green.defaultSyllabusRowTemplates[0].planTitle.includes('Lesson 1A'), 'lesson 1a');
    assert(green.defaultSyllabusRowTemplates[0].planTitle.includes('Speaking'), 'lesson 1a speaking');
    assert(green.defaultSyllabusRowTemplates[0].planDetail.includes('SB p.8-11'), 'lesson 1a sb');
    assert(green.defaultSyllabusRowTemplates[0].planDetail.includes('WB p.3-4'), 'lesson 1a wb');
    assert(green.defaultSyllabusRowTemplates[1].planTitle.includes('Lesson 1B'), 'lesson 1b');
    assert(green.defaultSyllabusRowTemplates[1].planDetail.includes('SB p.12-15'), 'lesson 1b sb');
    assert(green.defaultSyllabusRowTemplates[16].planTitle.includes('Writing Project 1 & 2'), 'combined project 1-2');
    assert(green.defaultSyllabusRowTemplates[16].planDetail.includes('p.72-73'), 'project sb 1');
    assert(green.defaultSyllabusRowTemplates[17].planDetail.includes('p.78-79'), 'project sb 4');
    assert(green.defaultSyllabusRowTemplates[0].planDetail.includes('could not complete'), 'incomplete hw note');
    assert(CCPSyllabusPresets.resolvePresetId('builtin-early-writer-weekly') === 'preset-early-writers-navy', 'early writer alias');
}

// WR+SP Early Writers Green / Blue / Navy (21 sessions, SB/WB ranges)
{
    const green = CCPSyllabusPresets.getById('preset-early-writers-green');
    const navy = CCPSyllabusPresets.getById('preset-early-writers-navy');
    const wrGreen = CCPSyllabusPresets.getById('preset-wr-sp-green');
    assert(green.defaultBook === 'Early Writers 1', 'ew green book 1');
    assert(navy.defaultBook === 'Early Writers 3', 'ew navy book 3');
    assert(green.defaultSyllabusRowTemplates.length === 21, 'early writers 21 lessons');
    assert(wrGreen.defaultSyllabusRowTemplates.length === 18, 'write right different count');
    assert(green.defaultSyllabusRowTemplates[0].planTitle.includes('Unit 1 [1/2]'), 'ew unit half title');
    assert(green.defaultSyllabusRowTemplates[0].planDetail.includes('Pages 8-11'), 'ew sb range');
    assert(green.defaultSyllabusRowTemplates[0].planDetail.includes('Workbook: Page 2'), 'ew wb page');
    assert(green.defaultSyllabusRowTemplates[10].planTitle.includes('Project #1'), 'ew project 1 block');
    assert(green.defaultSyllabusRowTemplates[15].planTitle.includes('(4/28) Level Test'), 'ew level test');
    assert(green.defaultSyllabusRowTemplates[18].planTitle.includes('Project #2'), 'ew project 2 block');
    assert(!green.defaultSyllabusRowTemplates[0].planTitle.includes('Lesson 1A'), 'ew not write right labels');
}

// The Best Writing Starter Green / Navy
{
    const green = CCPSyllabusPresets.getById('preset-bws-green');
    const navy = CCPSyllabusPresets.getById('preset-bws-navy');
    assert(green.defaultBook === 'The Best Writing Starter 1', 'bws green book 1');
    assert(navy.defaultBook === 'The Best Writing Starter 3', 'bws navy book 3');
    assert(green.defaultSyllabusRowTemplates.length === 18, 'bws 18 lessons');
    assert(green.defaultSyllabusRowTemplates[0].planTitle.includes('Unit 1-1'), 'bws unit 1-1');
    assert(green.defaultSyllabusRowTemplates[0].planTitle.includes('p.8'), 'bws unit 1 sb range');
    assert(green.defaultSyllabusRowTemplates[0].planDetail.includes('p.8-11'), 'bws unit 1 sb detail');
    assert(green.defaultSyllabusRowTemplates[0].planDetail.includes('every other day'), 'bws part1 hw');
    assert(green.defaultSyllabusRowTemplates[1].planTitle.includes('Unit 1-2'), 'bws unit 1-2');
    assert(green.defaultSyllabusRowTemplates[1].planDetail.includes('p.12-15'), 'bws unit 1-2 sb');
    assert(green.defaultSyllabusRowTemplates[1].planDetail.includes('Portfolio book Unit 1'), 'bws portfolio hw');
    assert(green.defaultSyllabusRowTemplates[8].planTitle.includes('Review 1'), 'bws review 1');
    assert(green.defaultSyllabusRowTemplates[8].planTitle.includes('p.40'), 'bws review 1 range');
    assert(navy.defaultSyllabusRowTemplates[17].planTitle.includes('Review 2'), 'bws review 2');
    assert(navy.defaultSyllabusRowTemplates[17].planDetail.includes('p.76-79'), 'bws review 2 sb');
    assert(!green.defaultSyllabusRowTemplates.some(r => /Project/i.test(r.planTitle)), 'bws no project days');
}

// Write Now: SB/WB ranges + homework detail
{
    const green = CCPSyllabusPresets.getById('preset-write-now-green');
    const blue = CCPSyllabusPresets.getById('preset-write-now-blue');
    const navy = CCPSyllabusPresets.getById('preset-write-now-navy');
    assert(green.defaultTotalLessons === 20, 'write now 20 lessons');
    assert(green.defaultSyllabusRowTemplates[0].planTitle === 'Unit 1 Part 1', 'wn part 1 title');
    assert(green.defaultSyllabusRowTemplates[0].planDetail.includes('P.8-11'), 'wn unit 1 sb');
    assert(green.defaultSyllabusRowTemplates[0].planDetail.includes('Workbook: P.2-3'), 'wn wb hw part1');
    assert(green.defaultSyllabusRowTemplates[1].planTitle === 'Unit 1 Part 2', 'wn part 2 title');
    assert(green.defaultSyllabusRowTemplates[1].planDetail.includes('P.12-15'), 'wn part2 sb');
    assert(green.defaultSyllabusRowTemplates[1].planDetail.includes('Listening Track 1'), 'wn listening');
    assert(green.defaultSyllabusRowTemplates[1].planDetail.includes('See the video file'), 'wn video note track 1');
    assert(blue.defaultSyllabusRowTemplates[0].planDetail.includes('P.8-11'), 'blue same pagination');
    assert(navy.defaultSyllabusRowTemplates[4].planTitle === 'Project 1', 'project row');
    assert(navy.defaultSyllabusRowTemplates[4].planDetail.includes('P. 24-25'), 'wn project 1 range');
    assert(navy.defaultSyllabusRowTemplates[19].planDetail.includes('Project 4 SB P. 78-79'), 'wn project 4 range');
}

// Level groups cover six bands
{
    const groups = CCPCurriculaData.groupPresetsByLevelGroup(CCPSyllabusPresets.getAll(), 'en');
    assert(groups.length >= 5, 'at least 5 level groups');
}

console.log('syllabus-curricula.test.mjs: all passed');
