import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDom() {
    const utilsCode = readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
    const domCode = readFileSync(path.join(root, 'js', 'dom.js'), 'utf8');
    const sandbox = { window: {}, globalThis: {}, document: { createElement: () => ({}) } };
    vm.runInNewContext(utilsCode, sandbox);
    vm.runInNewContext(domCode, sandbox);
    return sandbox.window.CCPDom;
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const D = loadDom();

{
    const out = D.html`<b>${'<script>'}</b>`;
    assert(out === '<b>&lt;script&gt;</b>', 'html template escapes interpolations');
    assert(D.escapeHtml('a & b') === 'a &amp; b', 'escapeHtml');
}

console.log('dom.test.mjs: all passed');
