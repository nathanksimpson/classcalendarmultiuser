/**
 * Run: node tests/filter-presets.test.mjs
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

const code = readFileSync(path.join(root, 'js', 'ui', 'filter-presets.js'), 'utf8');
const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox.window;
vm.runInNewContext(code, sandbox);

const { CCPFilterPresets } = sandbox.window;

{
    const html = CCPFilterPresets.buildMyClassesOnlyCheckbox({ id: 'homeworkMyClassesOnly', checked: true });
    assert(html.includes('id="homeworkMyClassesOnly"'), 'preserves id');
    assert(html.includes('data-filter-preset="my-classes"'), 'my-classes preset attr');
    assert(html.includes('checked'), 'checked state');
    assert(html.includes('filterMyClassesOnly'), 'default i18n key');
}

{
    let seen = null;
    const input = {
        checked: false,
        addEventListener(_type, fn) {
            this._onChange = fn;
        }
    };
    const rootEl = {
        querySelector(sel) {
            return sel === '#testMyOnly' ? input : null;
        }
    };
    CCPFilterPresets.wireMyClassesOnlyChange(rootEl, 'testMyOnly', (checked) => {
        seen = checked;
    });
    input.checked = true;
    input._onChange();
    assert(seen === true, 'wire change handler');
}

{
    // Phase 6: the shared builder still renders the box; callers pass the effective scope value.
    const off = CCPFilterPresets.buildMyClassesOnlyCheckbox({ id: 'homeworkMyClassesOnly', checked: false });
    assert(!/\schecked(\s|>|=)/.test(off), 'unchecked when the effective value is false');
}

console.log('filter-presets.test.mjs: all passed');
