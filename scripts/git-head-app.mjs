import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.tmp-app-head.js');
const text = execSync('git show HEAD:app.js', {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
});
fs.writeFileSync(out, text, 'utf8');
console.log('Wrote', out, 'lines', text.split('\n').length);
