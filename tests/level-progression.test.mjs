/**
 * Run: node tests/level-progression.test.mjs
 */
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(pathToFileURL(path.join(root, 'js', 'level-progression.js')).href);
const L = globalThis.CCPLevelProgression;

// Elementary ladder.
assert.deepEqual(L.defaultNext('Red'), { to: 'Orange', reason: 'next' });
assert.equal(L.defaultNext('Purple').to, 'Saemmul');
assert.equal(L.defaultNext('Saemmul').to, 'Yeoul');
assert.equal(L.defaultNext('Yeoul').to, 'Garam');
assert.equal(L.defaultNext('Mirinae').reason, 'choose');

// Middle school: next school year, same tier.
assert.equal(L.defaultNext('유마').to, '홉스');
assert.equal(L.defaultNext('홉스').to, '안나');
assert.equal(L.defaultNext('폴라').to, '바이컬');
assert.equal(L.defaultNext('바이칼').to, '캉첸', 'display spelling is accepted');
assert.deepEqual(L.defaultNext('안나'), { to: '', reason: 'graduate' });
assert.equal(L.defaultNext('nonsense').reason, 'unknown');

// Override beats default, only for the named cohort.
const plan = L.planProgression(
    [{ id: 'a', level: '홉스' }, { id: 'b', level: '홉스' }, { id: 'c', level: 'Green' }],
    { a: '티카', c: '__stay__' }
);
assert.deepEqual(plan.map((p) => [p.id, p.to, p.source]), [
    ['a', '티카', 'override'],
    ['b', '안나', 'default'],
    ['c', 'Green', 'override']
]);

// Override choices for a middle cohort are the next year's cohort of every tier.
assert.deepEqual(L.optionsFor('유마'), ['홉스', '티카', '빅키', '바이컬']);

// Same ability, different school year: one group.
assert.equal(L.levelGroup('\uC720\uB9C8'), 'basic');
assert.equal(L.levelGroup('\uD649\uC2A4'), 'basic');
assert.equal(L.levelGroup('\uC548\uB098'), 'basic');
assert.notEqual(L.levelGroup('\uD2F0\uCE74'), 'basic');
assert.equal(L.levelGroup('Green'), 'Green');

console.log('level-progression tests passed');
