/**
 * Run: node tests/level-progression.test.mjs
 */
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(pathToFileURL(path.join(root, 'js', 'level-progression.js')).href);
const L = globalThis.CCPLevelProgression;
const YUMA = '유마', HOBBS = '홉스', ANNA = '안나', TIKA = '티카', LEO = '레오';
const POLA = '폴라', PABO = '파보', BAIKAL = '바이칼', BAIKAL_OLD = '바이컬', CANGCHEN = '캉첸';
const BIKI = '빅키';

// Elementary ladder (Mirinae below Byeolmaru).
assert.deepEqual(L.ELEMENTARY_ORDER.slice(6), ['Purple', 'Saemmul', 'Yeoul', 'Garam', 'Bada', 'Mirinae', 'Byeolmaru']);
// Moves after two terms at the level; fewer terms: stay; unknown: ask with a suggestion.
assert.deepEqual(L.defaultNext('Red', { termsAtLevel: 2 }), { to: 'Orange', reason: 'next' });
assert.deepEqual(L.defaultNext('Red', { termsAtLevel: 1 }), { to: 'Red', reason: 'stay' });
assert.deepEqual(L.defaultNext('Red'), { to: 'Orange', reason: 'ask' });
assert.equal(L.defaultNext('Purple', { termsAtLevel: 2 }).to, 'Saemmul');
assert.equal(L.defaultNext('Saemmul', { termsAtLevel: 3 }).to, 'Yeoul');
assert.equal(L.defaultNext('Byeolmaru', { termsAtLevel: 5 }).reason, 'stay');

// Sixth graders: their middle-school analogue.
assert.equal(L.middleFor('Saemmul'), YUMA);
assert.equal(L.middleFor('Yeoul'), YUMA);
assert.equal(L.middleFor('Garam'), LEO);
assert.equal(L.middleFor('Bada'), PABO);
assert.equal(L.middleFor('Mirinae'), POLA);
assert.equal(L.middleFor('Byeolmaru'), POLA);
assert.equal(L.middleFor('Red'), '');

// Middle school: only a December term moves to the next school year, within the same group.
assert.deepEqual(L.defaultNext(YUMA, { termStartMonth: 3 }), { to: YUMA, reason: 'stay' });
assert.deepEqual(L.defaultNext(YUMA, {}), { to: YUMA, reason: 'stay' });
assert.deepEqual(L.defaultNext(YUMA, { termStartMonth: 12 }), { to: HOBBS, reason: 'next', askLevelUp: true });
assert.equal(L.defaultNext(HOBBS, { termStartMonth: 12 }).to, ANNA);
assert.equal(L.defaultNext(POLA, { termStartMonth: 12 }).to, BAIKAL_OLD);
assert.equal(L.defaultNext(BAIKAL, { termStartMonth: 12 }).to, CANGCHEN, 'display spelling is accepted');
assert.equal(L.defaultNext('S1', { termStartMonth: 12 }).to, 'S2');
assert.deepEqual(L.defaultNext(ANNA, { termStartMonth: 12 }), { to: '', reason: 'graduate' });
assert.equal(L.defaultNext('nonsense').reason, 'unknown');

// Override beats default, only for the named cohort.
const plan = L.planProgression(
    [{ id: 'a', level: HOBBS }, { id: 'b', level: HOBBS }, { id: 'c', level: 'Green', termsAtLevel: 2 }],
    { a: LEO, c: '__stay__' },
    { termStartMonth: 12 }
);
assert.deepEqual(plan.map((p) => [p.id, p.to, p.source]), [
    ['a', LEO, 'override'],
    ['b', ANNA, 'default'],
    ['c', 'Green', 'override']
]);

// Override choices for a middle cohort are the next year's cohort of every group.
assert.deepEqual(L.optionsFor(YUMA), ['S2', HOBBS, TIKA, BIKI, BAIKAL_OLD]);

// Same ability, different school year: one group.
[YUMA, HOBBS, ANNA].forEach((id) => assert.equal(L.levelGroup(id), 'basic'));
assert.notEqual(L.levelGroup(TIKA), 'basic');
assert.equal(L.levelGroup('S2'), 'pre-basic');
assert.equal(L.levelGroup('Green'), 'Green');

// Students move, not only cohorts: a student override beats the cohort's default; small groups are flagged.
const cp = L.planProgression([{ id: 'a', level: HOBBS }], {}, { termStartMonth: 12 });
const sp = L.planStudents(
    [{ id: 's1', cohortId: 'a' }, { id: 's2', cohortId: 'a' }, { id: 's3', cohortId: 'a' }],
    cp,
    { s3: TIKA }
);
assert.deepEqual(sp.map((x) => [x.id, x.to, x.source]), [['s1', ANNA, 'cohort'], ['s2', ANNA, 'cohort'], ['s3', TIKA, 'override']]);
assert.deepEqual(L.belowMinimum(sp, 2), [{ level: TIKA, count: 1 }]);

// Cohorts follow students: a level with no students ends, a level students arrive at starts, a tiny one is flagged.
const dc = L.deriveCohorts(sp, [{ id: 'a', level: HOBBS }, { id: 'z', level: YUMA }], 2);
const st = Object.fromEntries(dc.map((d) => [d.level, d.status]));
assert.deepEqual(st, { [ANNA]: 'new', [TIKA]: 'small', [HOBBS]: 'empty', [YUMA]: 'empty' });
assert.equal(L.deriveCohorts(sp, [{ id: 'a', level: HOBBS }], 0).find((d) => d.level === TIKA).status, 'new');

console.log('level-progression tests passed');
const dc2 = L.deriveCohorts([{ id: 's', to: ANNA }, { id: 't', to: ANNA }], [{ id: 'c', level: ANNA }], 2);
assert.equal(dc2[0].status, 'continues');

// Size bands: 4+ healthy, 3 thin, 2 too small, 1 single (allowed, last resort), 17+ too big.
assert.deepEqual([0, 1, 2, 3, 4, 16, 17].map((n) => L.sizeBand(n)), ['empty', 'single', 'tooSmall', 'thin', 'healthy', 'healthy', 'tooBig']);
assert.equal(L.sizeBand(3, { healthyFrom: 3 }), 'healthy');
assert.equal(L.MOVE_REASONS.length, 6);
