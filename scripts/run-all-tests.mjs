import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = path.join(root, 'tests');
const files = fs
    .readdirSync(testsDir)
    .filter((name) => name.endsWith('.test.mjs'))
    .sort();

let failed = 0;
for (const file of files) {
    const full = path.join(testsDir, file);
    const result = spawnSync(process.execPath, [full], { stdio: 'inherit', cwd: root });
    if (result.status !== 0) {
        failed += 1;
        console.error(`FAILED: ${file}`);
    }
}

if (failed) {
    console.error(`\n${failed} test file(s) failed out of ${files.length}`);
    process.exit(1);
}

console.log(`\nAll ${files.length} test files passed.`);
