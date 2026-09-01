/**
 * Run: node tests/homeroom-directory.test.mjs
 */
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

await import(pathToFileURL(path.join(root, 'js', 'tms-class-name.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'homeroom-directory.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'homeroom-directory-print.js')).href);

const api = globalThis.CCPHomeroomDirectory;
const printApi = globalThis.CCPHomeroomDirectoryPrint;

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

function byFamily(rows, name) {
    return rows.find((r) => r.familyName === name || r.familyKey === name);
}

{
    const rows = api.buildRows({
        cohorts: [
            {
                id: 'c-pm',
                name: 'Purple M',
                schedulePattern: 'mwf',
                homeroomTeacherUserId: 'u1',
                homeroomTeacherName: 'Kim'
            },
            {
                id: 'c-pt',
                name: 'Purple T',
                schedulePattern: 'tth',
                homeroomTeacherUserId: 'u2',
                homeroomTeacherName: 'Lee'
            }
        ]
    }, {
        teachers: [
            { userId: 'u1', displayName: '김민수' },
            { userId: 'u2', displayName: '이서연' }
        ]
    });
    assert(rows.length === 1, 'Purple M + Purple T pair into one row');
    assert(rows[0].familyName === 'Purple', `family name is Purple, got ${rows[0].familyName}`);
    assert(rows[0].mwf === '김민수', `MWF is Korean full name, got ${rows[0].mwf}`);
    assert(rows[0].tth === '이서연', `T/T is Korean full name, got ${rows[0].tth}`);
}

{
    const rows = api.buildRows({
        cohorts: [
            {
                id: 'c-om',
                name: 'OrangeM^2603',
                schedulePattern: 'mwf',
                homeroomTeacherUserId: 'u1',
                homeroomTeacherName: 'Park'
            },
            {
                id: 'c-ot',
                name: 'OrangeT^2603',
                schedulePattern: 'tth',
                homeroomTeacherUserId: 'u2',
                homeroomTeacherName: 'Choi'
            }
        ]
    }, {
        teachers: [
            { userId: 'u1', displayName: '박지훈' },
            { userId: 'u2', displayName: '최수아' }
        ]
    });
    assert(rows.length === 1, 'TMS caret names pair');
    assert(rows[0].familyName === 'Orange', `TMS baseName Orange, got ${rows[0].familyName}`);
    assert(rows[0].mwf === '박지훈', 'TMS MWF Korean name');
    assert(rows[0].tth === '최수아', 'TMS T/T Korean name');
}

{
    const rows = api.buildRows({
        cohorts: [
            {
                id: 'c-gm',
                name: 'GaramM',
                schedulePattern: 'mwf',
                meetingDays: [1, 3, 5],
                homeroomTeacherName: '김하나'
            }
        ]
    });
    assert(rows.length === 1, 'unpaired MWF still a row');
    assert(rows[0].familyName === 'Garam', `strip trailing M, got ${rows[0].familyName}`);
    assert(rows[0].mwf === '김하나', 'unpaired MWF teacher');
    assert(rows[0].tth === '', 'unpaired T/T cell empty');
}

{
    const rows = api.buildRows({
        cohorts: [
            {
                id: 'c-live',
                name: 'Navy T',
                schedulePattern: 'tth',
                homeroomTeacherName: '이하늘'
            },
            {
                id: 'cohort-student-archive',
                name: 'Student archive',
                isArchiveCohort: true,
                homeroomTeacherName: 'Should hide'
            }
        ]
    });
    assert(rows.length === 1, 'archive cohort skipped');
    assert(rows[0].familyName === 'Navy', 'live cohort kept');
    assert(!rows.some((r) => /archive/i.test(r.familyName) || r.mwf === 'Should hide'), 'archive not listed');
}

{
    const rows = api.buildRows({
        cohorts: [
            {
                id: 'c-empty',
                name: 'Yellow M',
                schedulePattern: 'mwf'
            }
        ]
    }, { teachers: [] });
    assert(rows.length === 1, 'row exists without teacher');
    assert(rows[0].mwf === '', 'missing 담임 is empty string in data');
    assert(rows[0].tth === '', 'no T/T cohort');
}

{
    const name = api.resolveHomeroomKoreanName(
        { homeroomTeacherUserId: 'u1', homeroomTeacherName: 'Kim' },
        [{ userId: 'u1', displayName: '김민수' }]
    );
    assert(name === '김민수', `prefer Hangul account name over English short name, got ${name}`);
    assert(!name.includes('선생님'), 'does not append 선생님');
}

{
    const name = api.resolveHomeroomKoreanName(
        { homeroomTeacherUserId: 'u1', homeroomTeacherName: '박지훈' },
        [{ userId: 'u1', displayName: 'Park' }]
    );
    assert(name === '박지훈', `prefer Hangul stored name when account has no Hangul, got ${name}`);
}

{
    const name = api.resolveHomeroomKoreanName(
        { homeroomTeacherUserId: 'u1', homeroomTeacherName: 'Nate' },
        [{ userId: 'u1', displayName: 'Nathan Kim' }]
    );
    assert(name === 'Nathan Kim', 'full account display name when no Hangul exists');
}

{
    assert(api.scheduleBucket({ schedulePattern: 'tth' }) === 'tth', 'tth pattern');
    assert(api.scheduleBucket({ schedulePattern: 'mwf' }) === 'mwf', 'mwf pattern');
    assert(api.scheduleBucket({ schedulePattern: 'mw' }) === 'mwf', 'mw counts as MWF');
    assert(api.scheduleBucket({ meetingDays: [2, 4] }) === 'tth', 'Tue/Thu days');
    assert(api.scheduleBucket({ meetingDays: [1, 3, 5] }) === 'mwf', 'MWF days');
}

{
    const rows = api.buildRows({
        cohorts: [
            {
                id: 'c-a',
                name: 'Zulu M',
                schedulePattern: 'mwf',
                homeroomTeacherName: '가'
            },
            {
                id: 'c-b',
                name: 'Alpha T',
                schedulePattern: 'tth',
                homeroomTeacherName: '나'
            }
        ]
    });
    assert(rows[0].familyName === 'Alpha' && rows[1].familyName === 'Zulu', 'sorted alphabetically');
}

{
    const rows = api.buildRows({
        cohorts: [
            {
                id: 'c1',
                name: 'Bada M',
                schedulePattern: 'mwf',
                homeroomTeacherName: '김민수'
            },
            {
                id: 'c2',
                name: 'Bada',
                schedulePattern: 'mwf',
                homeroomTeacherName: '이서연'
            }
        ]
    });
    const bada = byFamily(rows, 'Bada');
    assert(bada, 'Bada family exists');
    assert(bada.mwf.includes('김민수') && bada.mwf.includes('이서연'), 'two MWF teachers joined');
}

{
    const html = printApi.renderDocumentHtml(
        {
            calendarName: 'Fall 2026',
            rows: [{ familyName: 'Purple', mwf: '김민수', tth: '이서연' }]
        },
        {
            title: 'Homeroom list',
            colClasses: 'Classes',
            colMwf: 'MWF',
            colTth: 'T/T',
            empty: '—'
        }
    );
    assert(html.includes('Purple'), 'print HTML has class family');
    assert(html.includes('김민수'), 'print HTML has MWF Hangul name');
    assert(html.includes('이서연'), 'print HTML has T/T Hangul name');
    assert(html.includes('Fall 2026'), 'print HTML has calendar name');
    assert(html.includes('MWF') && html.includes('T/T'), 'print HTML has schedule columns');
}

{
    const html = printApi.renderDocumentHtml(
        { rows: [{ familyName: 'Solo', mwf: '', tth: '' }] },
        { empty: '—', colClasses: 'Classes', colMwf: 'MWF', colTth: 'T/T' }
    );
    assert(html.includes('—'), 'empty teacher cells use em dash in print');
}

console.log('homeroom-directory.test.mjs: all passed');
