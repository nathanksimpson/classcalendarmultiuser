/**
 * Run: node tests/hr-teacher-list.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'hr-teacher-list.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'hr-teacher-list-print.js')).href);

const api = globalThis.CCPHrTeacherList;
const printApi = globalThis.CCPHrTeacherListPrint;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const helpers = {
    getAllSimsonLevels: () => [
        { id: 'Red', name: 'Red' },
        { id: 'Orange', name: 'Orange' },
        { id: 'Yellow', name: 'Yellow' },
        { id: 'Green', name: 'Green' },
        { id: 'Blue', name: 'Blue' },
        { id: 'Navy', name: 'Navy' },
        { id: 'Purple', name: 'Purple' },
        { id: 'Yeoul', name: 'Yeoul' },
        { id: 'Saemmul', name: 'Saemmul' },
        { id: 'Garam', name: 'Garam' },
        { id: 'Bada', name: 'Bada' },
        { id: 'Byeolmaru', name: 'Byeolmaru' },
        { id: 'Mirinae', name: 'Mirinae' }
    ],
    getDefaultSimsonLevelColors: (id) => api.fallbackLevelColor(id),
    getEffectiveCohortPattern: (cohort) => (cohort.schedulePattern === 'tth' ? 'tth' : 'mwf'),
    formatCohortDisplayTitle: (cohort) => cohort.name || '',
    getHomeroomLabel: (cohort) => cohort.homeroomTeacherName || ''
};

const appData = {
    calendarName: 'Spring Term',
    cohorts: [
        {
            id: 'orange-tth',
            name: 'Orange',
            levelPreset: 'Orange',
            schedulePattern: 'tth',
            homeroomTeacherName: 'Park'
        },
        {
            id: 'byeol-mwf',
            name: 'Byeolmaru',
            levelPreset: 'Byeolmaru',
            schedulePattern: 'mwf',
            homeroomTeacherName: 'Lee'
        },
        {
            id: 'red-mwf',
            name: 'Red',
            levelPreset: 'Red',
            schedulePattern: 'mwf',
            homeroomTeacherName: 'Kim'
        },
        {
            id: 'red-tth',
            name: 'Red',
            levelPreset: 'Red',
            schedulePattern: 'tth',
            homeroomTeacherName: 'Choi'
        },
        {
            id: 'archive',
            name: 'Old',
            levelPreset: 'Red',
            schedulePattern: 'mwf',
            homeroomTeacherName: 'Ghost',
            isArchiveCohort: true
        }
    ]
};

const rows = api.buildRows(appData, helpers);
assert(rows.length === 3, `expected 3 rows, got ${rows.length}`);
assert(rows[0].cohortLabel === 'Red', `first row should be Red, got ${rows[0].cohortLabel}`);
assert(rows[1].cohortLabel === 'Orange', `second row should be Orange, got ${rows[1].cohortLabel}`);
assert(rows[2].cohortLabel === 'Byeolmaru', `third row should be Byeolmaru, got ${rows[2].cohortLabel}`);

assert(rows[0].mHrTeacher === 'Kim', `Red M HRT should be Kim, got ${rows[0].mHrTeacher}`);
assert(rows[0].tHrTeacher === 'Choi', `Red T HRT should be Choi, got ${rows[0].tHrTeacher}`);
assert(rows[1].mHrTeacher === '', 'Orange M HRT should be empty');
assert(rows[1].tHrTeacher === 'Park', `Orange T HRT should be Park, got ${rows[1].tHrTeacher}`);
assert(rows[2].mHrTeacher === 'Lee', `Byeolmaru M HRT should be Lee, got ${rows[2].mHrTeacher}`);
assert(rows[2].tHrTeacher === '', 'Byeolmaru T HRT should be empty');

assert(rows[0].accent === api.NAMED_LEVEL_COLORS.Red, 'Red row uses Red default color');
assert(rows[1].accent === api.NAMED_LEVEL_COLORS.Orange, 'Orange row uses Orange default color');
assert(rows[2].accent === api.NAMED_LEVEL_COLORS.Byeolmaru, 'Byeolmaru row uses Blue-band default');

// Cohort picker color overrides level defaults (MWF preferred over TT).
const coloredData = {
    calendarName: 'Spring Term',
    cohorts: [
        {
            id: 'red-mwf',
            name: 'Red',
            levelPreset: 'Red',
            schedulePattern: 'mwf',
            homeroomTeacherName: 'Kim',
            color: '#aabbcc'
        },
        {
            id: 'red-tth',
            name: 'Red',
            levelPreset: 'Red',
            schedulePattern: 'tth',
            homeroomTeacherName: 'Choi',
            color: '#222222'
        },
        {
            id: 'orange-tth',
            name: 'Orange',
            levelPreset: 'Orange',
            schedulePattern: 'tth',
            homeroomTeacherName: 'Park',
            color: '#112233'
        }
    ]
};
const coloredRows = api.buildRows(coloredData, helpers);
assert(coloredRows.length === 2, `expected 2 colored rows, got ${coloredRows.length}`);
assert(coloredRows[0].accent === '#aabbcc', `Red paired row prefers MWF color, got ${coloredRows[0].accent}`);
assert(coloredRows[1].accent === '#112233', `Orange TT-only uses cohort color, got ${coloredRows[1].accent}`);

const extraMwf = {
    ...appData,
    cohorts: appData.cohorts.concat({
        id: 'red-mwf-2',
        name: 'Red extra',
        levelPreset: 'Red',
        schedulePattern: 'mwf',
        homeroomTeacherName: 'Han'
    })
};
const extraRows = api.buildRows(extraMwf, helpers);
const redRows = extraRows.filter((r) => r.levelId === 'Red');
assert(redRows.length === 2, `two MWF Red cohorts should make two Red rows, got ${redRows.length}`);
assert(redRows.some((r) => r.mHrTeacher === 'Kim'), 'first Red MWF teacher kept');
assert(redRows.some((r) => r.mHrTeacher === 'Han'), 'second Red MWF teacher kept');

const html = printApi.renderDocumentHtml(rows, {
    title: 'HR Teacher List',
    colCohort: 'Cohort',
    colMHrt: 'MWF Homeroom T.',
    colTHrt: 'TT Homeroom T.'
}, { calendarName: 'Spring Term' });

assert(html.includes('MWF Homeroom T.'), 'print has MWF Homeroom T. column');
assert(html.includes('TT Homeroom T.'), 'print has TT Homeroom T. column');
assert(html.includes('Kim'), 'print includes Kim');
assert(html.includes('Choi'), 'print includes Choi');
assert(html.includes('#dc2626'), 'Red default hex is in the row style');
assert(html.includes('background-color:'), 'row has background fill');
assert(html.includes('border-left:3px solid #dc2626'), 'Red row left rail uses default color');
assert(html.includes('color:#243244'), 'print rows use light-paper dark text');

const navyHtml = printApi.renderDocumentHtml([{
    levelId: 'Navy',
    cohortLabel: 'Navy',
    mHrTeacher: 'Park',
    tHrTeacher: 'Lee',
    accent: api.NAMED_LEVEL_COLORS.Navy,
    textColor: '#f8fafc'
}], {
    title: 'HR Teacher List',
    colCohort: 'Cohort',
    colMHrt: 'MWF Homeroom T.',
    colTHrt: 'TT Homeroom T.'
});
assert(navyHtml.includes('color:#243244'), 'Navy row ignores dark-theme white text');
assert(!navyHtml.includes('#f8fafc'), 'Navy row does not use white text');
assert(navyHtml.includes('#1e3a8a'), 'Navy row still uses Navy accent');

const styles = printApi.getPrintStyles();
assert(styles.includes('print-color-adjust: exact'), 'print CSS keeps colors');
assert(styles.includes('color: #243244') || styles.includes('color:#243244'), 'table CSS locks light-paper text');

console.log('hr-teacher-list.test.mjs: all passed');
