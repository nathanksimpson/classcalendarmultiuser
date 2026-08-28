/**
 * Merge production i18n keys (student merge + timetable import) into calendar-en/ko.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectLines(text, keyPrefixes) {
    const lines = [];
    const re = new RegExp(`^\\s+(${keyPrefixes.join('|')})[A-Za-z0-9_]*:\\s*.+,\\s*$`);
    for (const line of text.split('\n')) {
        if (re.test(line)) {
            lines.push(line);
        }
    }
    return lines;
}

function mergeKeys(targetPath, prodPath, keyPrefixes, insertBeforeKey) {
    const prodLines = collectLines(fs.readFileSync(prodPath, 'utf8'), keyPrefixes);
    let text = fs.readFileSync(targetPath, 'utf8');
    const keyNames = prodLines.map((line) => line.trim().split(':')[0]);

    for (const key of keyNames) {
        const lineRe = new RegExp(`^\\s+${key}:\\s*.+,\\s*$`, 'm');
        text = text.replace(lineRe, '');
    }

    const insertRe = new RegExp(`^(\\s+${insertBeforeKey}:\\s*.+,\\s*)$`, 'm');
    const block = prodLines.join('\n') + '\n';
    if (!insertRe.test(text)) {
        throw new Error(`Anchor ${insertBeforeKey} not found in ${targetPath}`);
    }
    text = text.replace(insertRe, `$1\n${block.trimEnd()}`);
    text = text.replace(/\n{3,}/g, '\n\n');
    fs.writeFileSync(targetPath, text, 'utf8');
    console.log(path.basename(targetPath), `merged ${prodLines.length} keys before ${insertBeforeKey}`);
}

const staging = path.join(root, '.prod-pulled');
const studentKeys = ['studentMerge'];
const timetableKeys = ['timetableImport', 'dataTermMigrateTimetable'];

mergeKeys(
    path.join(root, 'js/i18n/calendar-en.js'),
    path.join(staging, 'js__i18n__calendar-en.js'),
    studentKeys,
    'rosterTmsSyncSuccess'
);
mergeKeys(
    path.join(root, 'js/i18n/calendar-en.js'),
    path.join(staging, 'js__i18n__calendar-en.js'),
    timetableKeys,
    'dataCalendarBackupHeading'
);

mergeKeys(
    path.join(root, 'js/i18n/calendar-ko.js'),
    path.join(staging, 'js__i18n__calendar-ko.js'),
    studentKeys,
    'rosterTmsSyncSuccess'
);
mergeKeys(
    path.join(root, 'js/i18n/calendar-ko.js'),
    path.join(staging, 'js__i18n__calendar-ko.js'),
    timetableKeys,
    'dataCalendarBackupHeading'
);
