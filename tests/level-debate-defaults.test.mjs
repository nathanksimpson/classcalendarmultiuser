/**
 * Run: node tests/level-debate-defaults.test.mjs
 * Golden parity: debate defaults by level must equal the pre-Phase-7 snapshot
 * (tests/fixtures/level-debate-golden.json), with and without js/level-profile.js.
 * To change a debate default on purpose: edit DEBATE_BAND_DEFAULTS, then re-run
 * scripts/snapshot-level-debate-defaults.mjs and review the fixture diff.
 */
import { readFileSync } from 'fs';
import { computeLevelDebateOutputs, GOLDEN_PATH, ALL_LEVEL_IDS } from '../scripts/snapshot-level-debate-defaults.mjs';

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
assert(Array.isArray(golden.cases) && golden.cases.length > 1000, 'golden fixture has the full matrix');
assert(ALL_LEVEL_IDS.length === 37, 'matrix covers all 37 levels');
ALL_LEVEL_IDS.forEach((id) => {
    assert(golden.cases.some((c) => c.classData.levelPreset === id), `golden covers levelPreset ${id}`);
    assert(golden.cases.some((c) => c.classData.levelCustom === id), `golden covers levelCustom ${id}`);
});

[false, true].forEach((withProfile) => {
    const out = computeLevelDebateOutputs({ withProfile });
    const label = withProfile ? 'with level-profile.js' : 'without level-profile.js';
    assert(JSON.stringify(out.stateKeys) === JSON.stringify(golden.stateKeys), `${label}: engine states unchanged`);
    assert(JSON.stringify(out.optionKeys) === JSON.stringify(golden.optionKeys), `${label}: engine options unchanged`);
    assert(out.cases.length === golden.cases.length, `${label}: case count ${out.cases.length}`);
    const mismatches = [];
    out.cases.forEach((c, i) => {
        if (JSON.stringify(c) !== JSON.stringify(golden.cases[i])) {
            mismatches.push(`#${i} ${JSON.stringify(c.classData)} book=${JSON.stringify(c.debateBook)}`);
        }
    });
    assert(mismatches.length === 0, `${label}: ${mismatches.length} cases differ from golden:\n${mismatches.slice(0, 10).join('\n')}`);
    assert(out.reshaped.length === 0, `${label}: sessions with teams were reshaped: ${out.reshaped.slice(0, 5).join(', ')}`);
});

// Spot checks that read like the product rules.
const byInput = (classData, book) => golden.cases.find((c) =>
    JSON.stringify(c.classData) === JSON.stringify(classData) && c.debateBook === book);
const forceIdx = golden.stateKeys.indexOf('pristine') * golden.optionKeys.length + golden.optionKeys.indexOf('force');
assert(byInput({ levelPreset: 'Purple' }, '').engine[forceIdx] === '1|ap|0|1|yeoul', 'Purple → purple mode, 1, Yeoul /20');
assert(byInput({ levelPreset: 'Yeoul' }, '').engine[forceIdx] === '0|ap|0|3|yeoul', 'Yeoul → 3, Yeoul /20');
assert(byInput({ levelPreset: 'Saemmul' }, '').engine[forceIdx] === '0|ap|0|3|yeoul', 'Saemmul → 3, Yeoul /20');
assert(byInput({ levelPreset: 'Garam' }, '').engine[forceIdx] === '0|ap|0|3|garam', 'Garam → 3, Garam /30');
assert(byInput({ levelPreset: '\uC720\uB9C8' }, '').engine[forceIdx] === '0|ap|0|3|garam', 'middle school → Garam /30');
assert(byInput({ levelPreset: 'Pre \uC720\uB9C8' }, '').engine[forceIdx] === '0|ap|0|3|garam', 'pre-middle → Garam /30');
assert(!golden.cases.some((c) => /\(Stu|김테/.test(JSON.stringify(c.classData))), 'fixture holds level ids and books only');

console.log('level-debate-defaults.test.mjs: all passed');
