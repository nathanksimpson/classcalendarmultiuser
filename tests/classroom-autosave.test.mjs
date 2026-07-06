/**
 * Run: node tests/classroom-autosave.test.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

function debounce(fn, wait) {
    let timer = null;
    let pending = null;
    const debounced = (...args) => {
        pending = args;
        clearTimeout(timer);
        timer = setTimeout(() => {
            pending = null;
            fn(...args);
        }, wait);
    };
    debounced.flush = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
            if (pending) {
                const args = pending;
                pending = null;
                fn(...args);
            }
        }
    };
    return debounced;
}

const code = readFileSync(path.join(root, 'js', 'ui', 'classroom-autosave.js'), 'utf8');
const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(code, sandbox);

const { CCPClassroomAutosave } = sandbox.window;

{
    const statusEl = { textContent: '', className: '' };
    let saveCount = 0;
    let lastSilent = null;
    const autosave = CCPClassroomAutosave.create({
        delayMs: 50,
        debounce,
        t: (key) => key,
        getStatusEl: () => statusEl,
        saveAsync: async (opts) => {
            saveCount += 1;
            lastSilent = opts.silent;
        }
    });

    autosave.scheduleSave();
    assert(statusEl.className.includes('pending'), 'scheduleSave sets pending');
    await new Promise((r) => setTimeout(r, 80));
    assert(saveCount === 1, 'debounced save runs once');
    assert(lastSilent === true, 'scheduled save is silent');
    assert(statusEl.className.includes('saved'), 'saved after success');
}

{
    const statusEl = { textContent: '', className: '' };
    let saveCount = 0;
    const autosave = CCPClassroomAutosave.create({
        delayMs: 1000,
        debounce,
        t: (key) => key,
        getStatusEl: () => statusEl,
        saveAsync: async () => {
            saveCount += 1;
        }
    });

    autosave.scheduleSave();
    await autosave.flushPendingSave();
    assert(saveCount === 1, 'flushPendingSave runs pending debounced save');
    assert(statusEl.className.includes('saved'), 'saved after flush');
}

{
    const statusEl = { textContent: '', className: '' };
    const autosave = CCPClassroomAutosave.create({
        delayMs: 500,
        debounce,
        t: (key) => key,
        i18nPrefix: 'classroomEssaySave',
        getStatusEl: () => statusEl,
        saveAsync: async () => {}
    });

    autosave.updateStatus('saving');
    assert(statusEl.textContent === 'classroomEssaySaveSaving', 'custom i18n prefix');
}

console.log('classroom-autosave.test.mjs: all passed');
