/**
 * Shared filter hierarchy helper (js/filter-hierarchy.js).
 * Run: node tests/filter-hierarchy.test.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const FH = require(path.join(__dirname, '..', 'js', 'filter-hierarchy.js'));

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

const labels = {
    any: 'Any',
    anyReset: 'Back to Any',
    countOf: '{n} of {total}',
    hiddenBy: 'Hidden by {group}',
    except: 'Except:',
    exceptMore: '+{n} more',
    exceptRemoveAria: 'Include {name} again',
    all: 'All',
    none: 'None',
    modeOnly: 'Only checked',
    modeExcept: 'All except unchecked'
};

const classes = [
    { id: 'a', label: 'Alpha', grade: '중1' },
    { id: 'b', label: 'Beta', grade: '중1' },
    { id: 'c', label: 'Gamma', grade: '중2' }
];

// --- computeClassStates: matched / dimmed with reason / exception ---
{
    const states = FH.computeClassStates(classes, {
        facetReason: (c) => (c.grade === '중1' ? null : 'Grade'),
        isChecked: (c) => c.id !== 'b'
    });
    assert(states[0].state === 'on', 'matched + checked is on');
    assert(states[1].state === 'off', 'matched + unchecked is an exception');
    assert(states[2].state === 'excluded' && states[2].reason === 'Grade', 'facet-ruled-out class is dimmed with reason');
    const sum = FH.summarizeStates(states);
    assert(sum.matched === 2 && sum.on === 1 && sum.off === 1 && sum.excluded === 1, 'summary counts');
}

// --- Group count: empty or full selection both read as Any ---
{
    assert(FH.groupCountText(0, 9, labels) === 'Any', 'no selection is Any');
    assert(FH.groupCountText(9, 9, labels) === 'Any', 'full selection is Any');
    assert(FH.groupCountText(2, 9, labels) === '2 of 9', 'partial selection shows count');
}

// --- Preview markup: exception row only in except mode; excluded chips disabled ---
{
    const states = FH.computeClassStates(classes, {
        facetReason: (c) => (c.id === 'c' ? 'Grade' : null),
        isChecked: (c) => c.id === 'a'
    });
    const exceptHtml = FH.renderPreview({ attr: 'data-x', title: 'Classes', states, mode: 'except', labels });
    assert(exceptHtml.includes('data-fh-except-remove="b"'), 'unchecked matched class is listed under Except');
    assert(!exceptHtml.includes('data-fh-except-remove="c"'), 'facet-excluded class is not an exception');
    assert(/value="c" disabled/.test(exceptHtml), 'facet-excluded chip is disabled');
    assert(exceptHtml.includes('Hidden by Grade'), 'reason shown as tooltip');

    const onlyHtml = FH.renderPreview({ attr: 'data-x', title: 'Classes', states, mode: 'only', labels });
    assert(!onlyHtml.includes('fh-except-row'), 'no Except row in only mode');
    assert(onlyHtml.includes('Only checked'), 'only-mode hint shown');

    const hinted = FH.renderPreview({ attr: 'data-x', title: 'Classes', states, mode: 'only', labels, hint: 'Custom hint' });
    assert(hinted.includes('Custom hint'), 'explicit hint overrides mode hint');
}

// --- Escaping: labels never inject markup ---
{
    const html = FH.renderGroup({
        key: 'grades',
        attr: 'data-x',
        title: 'Grade',
        options: [{ value: '"><b>', label: '<script>' }],
        selected: [],
        labels
    });
    assert(!html.includes('<script>') && !html.includes('"><b>'), 'values and labels are escaped');
}

console.log('filter-hierarchy.test.mjs: all passed');
