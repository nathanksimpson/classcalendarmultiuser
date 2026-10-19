import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = new Map();
const localStorage = {
    getItem(key) {
        return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
        store.set(key, String(value));
    },
    removeItem(key) {
        store.delete(key);
    }
};

let calendarId = '';
const sandbox = {
    localStorage,
    appData: {
        classes: [{ id: 'class-a' }, { id: 'class-b' }],
        ui: {}
    },
    CCPSessionRestore: {
        getSessionUserId() {
            return 'user-1';
        }
    },
    CalendarSync: {
        getActiveCalendarId() {
            return calendarId;
        }
    }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(path.join(root, 'js/active-context.js'), 'utf8'), sandbox);

const ctx = sandbox.CCPActiveContext;

ctx.selectClass('missing-class', { source: 'test' });
assert.strictEqual(ctx.getActiveClassId(), '', 'unknown class id is not stored');

ctx.selectClass('class-a', { source: 'test' });
assert.strictEqual(ctx.getActiveClassId(), 'class-a');
assert.strictEqual(localStorage.getItem('ccpActiveClassId:user-1'), 'class-a', 'legacy key used before a calendar is open');

calendarId = 'cal-1';
ctx.reload();
assert.strictEqual(ctx.getActiveClassId(), 'class-a', 'first calendar copies the old user key once');
assert.strictEqual(localStorage.getItem('ccpActiveClassId:user-1:cal-1'), 'class-a');

ctx.selectClass('class-b', { source: 'test' });
calendarId = 'cal-2';
ctx.reload();
assert.strictEqual(ctx.getActiveClassId(), 'class-a', 'second calendar migrates the original class, not the other calendar');

calendarId = 'cal-1';
ctx.reload();
assert.strictEqual(ctx.getActiveClassId(), 'class-b', 'each calendar keeps its own class');

console.log('active-context.test.mjs: ok');
