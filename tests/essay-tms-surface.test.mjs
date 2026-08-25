import { assertEssayTmsSurface } from '../scripts/assert-essay-tms-surface.mjs';

const errors = assertEssayTmsSurface();
if (errors.length) {
    console.error('essay-tms-surface.test.mjs FAILED:');
    errors.forEach((e) => console.error(' -', e));
    process.exit(1);
}
console.log('essay-tms-surface.test.mjs: ok');
