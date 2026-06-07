import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'app.js');
let app = fs.readFileSync(appPath, 'utf8');

const start = app.indexOf('const translations = {');
const end = app.indexOf('const SYNC_ERROR_KEYS');
if (start < 0 || end < 0) {
    throw new Error('Could not find translations block');
}

const replacement =
    'const translations =\n' +
    '    typeof CCPCalendarI18n !== \'undefined\' && CCPCalendarI18n.translations\n' +
    '        ? CCPCalendarI18n.translations\n' +
    '        : { en: {}, ko: {} };\n\n';

app = app.slice(0, start) + replacement + app.slice(end);
fs.writeFileSync(appPath, app);
console.log('Updated app.js — removed inline translations');
