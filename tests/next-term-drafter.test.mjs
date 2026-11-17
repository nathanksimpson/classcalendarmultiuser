/** Run: node tests/next-term-drafter.test.mjs */
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
await import(pathToFileURL(path.join(root, 'js', 'level-progression.js')).href);
await import(pathToFileURL(path.join(root, 'js', 'planner', 'next-term-drafter.js')).href);
const D = globalThis.CCPNextTermDrafter;
const st = (n) => Array.from({ length: n }, (_, i) => ({ id: 's' + i, active: true }));

assert.equal(D.nextTermStartMonth({ termStart: '2026-09-01', termMonthCount: 3 }), 12);
assert.equal(D.nextTermStartMonth({ termStart: '2026-12-01', termMonthCount: 3 }), 3);
assert.equal(D.nextTermStartMonth({}), 12);

const cohorts = [
    { id: 'a', name: 'RedM', level: 'Red', students: st(3), termsAtLevel: 2 },
    { id: 'b', name: 'OrangeM', level: 'Orange', students: st(2), termsAtLevel: 2 },
    { id: 'c', name: 'Yuma', level: '유마', students: st(5) },
    { id: 'd', name: 'X', level: 'Nonsense', students: [] }
];
let r = D.buildDraft(cohorts, {}, { termStartMonth: 12 });
const row = (id) => r.rows.find((x) => x.id === id);
assert.equal(row('a').to, 'Orange');
assert.equal(row('c').to, '홉스', 'December moves middle school up a year');
assert.equal(row('d').reason, 'unknown');
// Red and Orange cohorts both landing on Orange/Yellow: grouped by next level.
const orange = r.groups.find((g) => g.level === 'Orange');
assert.equal(orange.students, 3);
assert.equal(orange.band, 'thin');
// Override: Orange stays, so Orange's group now holds Red's 3 plus Orange's 2.
r = D.buildDraft(cohorts, { b: '__stay__' }, { termStartMonth: 12 });
assert.equal(r.groups.find((g) => g.level === 'Orange').students, 5);
assert.equal(r.groups.find((g) => g.level === 'Orange').band, 'healthy');
// Not December: middle school stays.
r = D.buildDraft(cohorts, {}, { termStartMonth: 3 });
assert.equal(r.rows.find((x) => x.id === 'c').to, '유마');
// Inactive students are not counted.
assert.equal(D.buildDraft([{ id: 'z', level: 'Red', students: [{ active: false }, { active: true }], termsAtLevel: 2 }], {}, {}).rows[0].students, 1);
console.log('next-term-drafter ok');
