/**
 * Build ClassManagerSync.exe on a developer PC with Node 22.
 * Teachers never run this. Inno Setup (installed separately) compiles helper/installer.iss.
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
    console.error('build:helper needs Node 22 or newer. This PC is Node ' + process.versions.node);
    process.exit(1);
}

const esbuild = require('esbuild');
const buildDir = path.join(root, 'helper', 'build');
mkdirSync(buildDir, { recursive: true });

await esbuild.build({
    entryPoints: [path.join(root, 'helper', 'sync-helper.cjs')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: path.join(buildDir, 'helper-bundle.cjs')
});

execSync('node --experimental-sea-config helper/sea-config.json', { cwd: root, stdio: 'inherit' });
const exePath = path.join(buildDir, 'ClassManagerSync.exe');
copyFileSync(process.execPath, exePath);
execSync(
    'npx postject "' + exePath + '" NODE_SEA_BLOB "' + path.join(buildDir, 'sea-prep.blob') + '" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    { cwd: root, stdio: 'inherit' }
);
console.log('Built helper/build/ClassManagerSync.exe');
console.log('Next: compile helper/installer.iss with Inno Setup 6.');
