/**
 * Run: node tests/calendar-access.test.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const CalAccess = require(path.join(root, 'server/calendar-access.js'));
const Auth = require(path.join(root, 'server/auth-permissions.js'));

const editorUser = {
    id: 'user-1',
    email: 'teacher@example.com',
    role: 'teacher',
    permissions: null,
    active: true
};

const permsNone = CalAccess.resolveCalendarPermissions(null, 'cal-1');
assert(permsNone.accessLevel === null && !permsNone.canEdit && !permsNone.canSuggest, 'empty user');

const adminUser = {
    id: 'admin-1',
    email: 'admin@example.com',
    role: 'admin',
    permissions: JSON.stringify(Auth.ROLE_PRESETS.admin),
    active: true
};
const permsAdmin = CalAccess.resolveCalendarPermissions(adminUser, 'cal-1');
assert(permsAdmin.accessLevel === 'editor', 'list-all admin gets editor');
assert(permsAdmin.canEdit === true, 'admin can edit');
assert(permsAdmin.canSuggest === true, 'admin can suggest');

assert(CalAccess.canEditCalendar(adminUser, 'cal-1') === true, 'canEditCalendar wrapper');
assert(CalAccess.canSuggestChanges(adminUser, 'cal-1') === true, 'canSuggestChanges wrapper');

console.log('calendar-access.test.mjs: all passed');
