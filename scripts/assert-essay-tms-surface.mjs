/**
 * Fail if the Essay TMS sync surface is missing from the tree.
 * Run via: node scripts/assert-essay-tms-surface.mjs
 * Also invoked from tests/essay-tms-surface.test.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
    return readFileSync(path.join(root, rel), 'utf8');
}

function mustInclude(rel, needles, errors) {
    const text = read(rel);
    for (const needle of needles) {
        if (!text.includes(needle)) {
            errors.push(`${rel}: missing ${JSON.stringify(needle)}`);
        }
    }
}

export function assertEssayTmsSurface() {
    const errors = [];

    mustInclude(
        'index.html',
        [
            'id="classroomEssaysTmsSyncBtn"',
            'id="classroomEssaysTmsSyncAllBtn"',
            'id="essayTmsSyncModal"'
        ],
        errors
    );

    const i18nKeys = [
        'classroomEssayTmsSyncTitle',
        'classroomEssayTmsSyncAllBtn',
        'classroomEssayTmsSyncThisClassBtn',
        'classroomEssayTmsBridgeStaleHint',
        'classroomEssayTmsLoadBtn',
        'classroomEssayTmsSyncConfirm'
    ];
    mustInclude(
        'js/i18n/calendar-en.js',
        i18nKeys.map((k) => `${k}:`),
        errors
    );
    mustInclude(
        'js/i18n/calendar-ko.js',
        i18nKeys.map((k) => `${k}:`),
        errors
    );

    mustInclude(
        'server/index.js',
        [
            "app.post('/api/tms/essays/preview'",
            "app.post('/api/tms/bridge/essays/preview'",
            'runTmsEssayPreview'
        ],
        errors
    );

    mustInclude(
        'worker/src/index.js',
        ["path === '/api/tms/essays/preview'"],
        errors
    );

    mustInclude(
        'js/classroom-essays.js',
        ['function bindEssayTmsSyncUi', 'function openEssayTmsSyncModal'],
        errors
    );

    return errors;
}

const isMain =
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    const errors = assertEssayTmsSurface();
    if (errors.length) {
        console.error('Essay TMS surface check failed:');
        errors.forEach((e) => console.error(' -', e));
        process.exit(1);
    }
    console.log('essay-tms-surface: ok');
}
