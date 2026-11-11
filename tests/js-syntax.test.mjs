/**
 * Every browser script must parse. A stray quote in a string (e.g. an apostrophe in a
 * single-quoted i18n line) otherwise only shows up when esbuild fails the deploy.
 * Run: node tests/js-syntax.test.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function listJs(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) {
            out.push(...listJs(p));
        } else if (name.endsWith('.js')) {
            out.push(p);
        }
    }
    return out;
}

const files = [path.join(root, 'app.js'), ...listJs(path.join(root, 'js'))];
const problems = [];
for (const file of files) {
    const code = readFileSync(file, 'utf8');
    if (/^\s*(import|export)\s/m.test(code)) {
        continue; /* ES modules are checked by the build, not as classic scripts */
    }
    try {
        new vm.Script(code, { filename: path.relative(root, file) });
    } catch (err) {
        problems.push(`${path.relative(root, file)}: ${err.message}`);
    }
}

if (problems.length) {
    throw new Error(`Scripts that do not parse:\n${problems.join('\n')}`);
}
console.log(`js-syntax.test.mjs: all passed (${files.length} files)`);
