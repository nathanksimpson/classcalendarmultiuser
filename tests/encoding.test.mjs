// Fail if any source file is not valid UTF-8, has a BOM, contains U+FFFD, or has "??"-mangled Korean.
import path from 'path';
import { fileURLToPath } from 'url';
import { checkTreeEncoding } from '../scripts/encoding-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bad = checkTreeEncoding(root);

if (bad.length) {
    console.error('Encoding check failed:\n' + bad.join('\n'));
    process.exit(1);
}
console.log('encoding.test.mjs: ok');
