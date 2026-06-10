import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadUtils() {
    const code = readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
    const sandbox = { window: {}, globalThis: {} };
    vm.runInNewContext(code, sandbox);
    return sandbox.window.CCPUtils;
}

function loadHomeworkImport() {
    const utilsCode = readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
    const importCode = readFileSync(path.join(root, 'js', 'homework-import.js'), 'utf8');
    const sandbox = { window: {}, globalThis: {} };
    vm.runInNewContext(utilsCode, sandbox);
    vm.runInNewContext(importCode, sandbox);
    return sandbox.window.CCPHomeworkImport;
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const U = loadUtils();

{
    assert(
        U.normalizeClipboardText('<Speaking — Write Right> Unit 1 – Speaking')
            === '<Speaking - Write Right> Unit 1 - Speaking',
        'em and en dash → hyphen'
    );
    assert(
        U.normalizeClipboardText('p.8\u221211') === 'p.8-11',
        'minus sign → hyphen'
    );
    assert(
        U.normalizeClipboardText('2026-05-08') === '2026-05-08',
        'ISO dates unchanged'
    );
    assert(U.normalizeClipboardText('') === '', 'empty string');
    assert(U.normalizeClipboardText(null) === '', 'null → empty');
    assert(
        U.normalizeClipboardText('2026-01-01 \u2013 2026-06-30 \u2014 Title')
            === '2026-01-01 - 2026-06-30 - Title',
        'range export dashes'
    );
    assert(
        U.normalizeClipboardText('\u2500\u2500\u2550\u2550') === '--==',
        'box drawing → ASCII'
    );
    assert(U.normalizeClipboardText('wait\u2026') === 'wait...', 'ellipsis');
    assert(U.normalizeClipboardText('\uAE40\uBBFC\uC9C0 \u00B7 Purple') === '\uAE40\uBBFC\uC9C0  -  Purple', 'middle dot');
    assert(
        U.sanitizeExportText('<Speaking \u2014 Write>') === '<Speaking - Write>',
        'sanitizeExportText alias'
    );
}

const HI = loadHomeworkImport();

{
    const raw = 'Unit 1 — Part 1\r\nHomework: p.8–11';
    const n = HI.normalizePasteText(raw);
    assert(n.includes('Unit 1 - Part 1'), 'homework import normalizes em dash in unit line');
    assert(n.includes('p.8-11'), 'homework import normalizes en dash in homework line');
    assert(!n.includes('\r'), 'homework import normalizes line endings');
}

console.log('utils.test.mjs: all passed');
