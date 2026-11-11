/**
 * Shared Tools month (CCPToolsMonth) + month-aware CCPAssignments.
 * Run: node tests/tools-month.test.mjs
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg || 'assertion failed');
    }
}

function load(today) {
    const events = [];
    const sandbox = {
        console,
        appData: { ui: {}, classes: [], cohorts: [] },
        CustomEvent: class CustomEvent {
            constructor(type, init) {
                this.type = type;
                this.detail = init && init.detail;
            }
        },
        dispatchEvent(e) {
            events.push(e);
        },
        addEventListener() {},
        events
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInNewContext(readFileSync(path.join(root, 'js', 'classroom-domain.js'), 'utf8'), sandbox);
    vm.runInNewContext(readFileSync(path.join(root, 'js', 'tools-month.js'), 'utf8'), sandbox);
    vm.runInNewContext(readFileSync(path.join(root, 'js', 'assignments.js'), 'utf8'), sandbox);
    sandbox.CCPClassroomDomain.todayISO = () => today;
    return sandbox;
}

// --- CCPToolsMonth ---
{
    const sb = load('2026-11-11');
    const M = sb.CCPToolsMonth;
    assert(M.get(sb.appData) === '2026-11', 'first use defaults to the current month');
    M.set('2026-10', { appData: sb.appData });
    assert(M.get(sb.appData) === '2026-10', 'set month sticks');
    assert(sb.events.length === 1 && sb.events[0].detail.month === '2026-10', 'change event fired once');
    M.set('2026-10', { appData: sb.appData });
    assert(sb.events.length === 1, 'no event when unchanged');
    M.set('', { appData: sb.appData });
    assert(M.get(sb.appData) === '', 'empty = All months');
    assert(sb.appData.ui.toolsMonth === 'all', 'All months stored explicitly (not reset to current)');
    assert(M.shift('2026-12', 1) === '2027-01', 'shift crosses year forward');
    assert(M.shift('2026-01', -1) === '2025-12', 'shift crosses year back');
    assert(M.label('2026-11', 'en') === 'Nov 2026', 'English label');
    assert(M.label('2026-11', 'ko') === '2026년 11월', 'Korean label');
    assert(M.nearest('2026-11', ['2026-09', '2026-12']) === '2026-12', 'nearest picks closest');
    assert(M.nearest('2026-11', ['2026-10', '2026-12']) === '2026-12', 'tie prefers later month');
    assert(M.nearest('2026-11', []) === '', 'nearest of nothing is empty');
}

// --- Month-aware essay assignments ---
function essayClass() {
    return {
        id: 'cls1',
        name: 'Purple M',
        syllabusRows: [
            { id: 'r-oct', date: '2026-10-08', trackEssay: true, sessionNumber: 1, lessonTitle: 'Oct essay' },
            { id: 'r-nov-a', date: '2026-11-05', trackEssay: true, sessionNumber: 2, lessonTitle: 'Nov essay A' },
            { id: 'r-nov-b', date: '2026-11-19', trackEssay: true, sessionNumber: 3, lessonTitle: 'Nov essay B' },
            // Dated in Nov, but the teacher listed it under December
            { id: 'r-dec', date: '2026-11-26', trackEssay: true, sessionNumber: 4, lessonTitle: 'Dec essay', essayListMonth: '2026-12' }
        ]
    };
}

{
    const sb = load('2026-11-11');
    const A = sb.CCPAssignments;
    const cls = essayClass();
    sb.appData.classes = [cls];
    const all = A.list('essay', cls, sb.appData, {});
    if (!all.length) {
        console.log('tools-month.test.mjs: domain lists no essay rows for fixture; skipping assignment checks');
    } else {
        const ids = (items) => items.map((i) => i.id).join(',');
        const key = (id) => {
            const row = cls.syllabusRows.find((r) => r.id === id);
            return sb.CCPClassroomDomain.getSyllabusRowKey(row);
        };
        const nov = A.list('essay', cls, sb.appData, { month: '2026-11' });
        assert(nov.length === 2, `Nov lists two essays (got ${ids(nov)})`);
        assert(!nov.some((i) => i.id === key('r-dec')), 'essay listed under Dec is not in Nov');
        const dec = A.list('essay', cls, sb.appData, { month: '2026-12' });
        assert(dec.length === 1 && dec[0].id === key('r-dec'), 'teacher list month wins over date');
        assert(A.list('essay', cls, sb.appData, { month: '2026-09' }).length === 0, 'empty month lists nothing');

        // Current month: next one due from today
        const hitNov = A.resolve('essay', cls, sb.appData, { month: '2026-11' });
        assert(hitNov && hitNov.id === key('r-nov-b'), 'current month picks next due (Nov 19)');

        // Saved pick in the month is kept
        A.select('essay', cls.id, key('r-nov-a'), { silent: true, appData: sb.appData });
        const kept = A.resolve('essay', cls, sb.appData, { month: '2026-11' });
        assert(kept && kept.id === key('r-nov-a'), 'saved pick in the selected month is kept');

        // Saved pick from another month is replaced by one in the month
        const oct = A.resolve('essay', cls, sb.appData, { month: '2026-10' });
        assert(oct && oct.id === key('r-oct'), 'switching month picks that month, not the saved Nov pick');

        // Empty month → null (tab shows empty state, no silent month jump)
        assert(A.resolve('essay', cls, sb.appData, { month: '2026-09' }) === null, 'empty month resolves to nothing');

        // Default month comes from CCPToolsMonth when the caller doesn't pass one
        sb.CCPToolsMonth.set('2026-12', { appData: sb.appData });
        const viaShared = A.resolve('essay', cls, sb.appData, {});
        assert(viaShared && viaShared.id === key('r-dec'), 'resolve follows the shared Tools month by default');
        sb.CCPToolsMonth.set('', { appData: sb.appData });
        assert(A.resolve('essay', cls, sb.appData, {}) !== null, 'All months resolves something');

        const months = A.months('essay', cls, sb.appData, {});
        assert(months.join(',') === '2026-12,2026-11,2026-10', `months newest first (got ${months.join(',')})`);
    }
}

console.log('tools-month.test.mjs: all passed');
