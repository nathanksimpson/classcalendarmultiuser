/**
 * Run: node tests/i18n-interpolation.test.mjs
 */
function formatI18n(template, vars) {
    let s = template;
    if (vars && typeof vars === 'object') {
        Object.entries(vars).forEach(([name, value]) => {
            s = s.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value ?? ''));
        });
    }
    return s;
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg);
    }
}

const chip = formatI18n('Schedule (saved): {days} · {start} – {end}', {
    days: 'Mon, Wed, Fri',
    start: 'Mar 1',
    end: 'Jun 30'
});
assert(chip === 'Schedule (saved): Mon, Wed, Fri · Mar 1 – Jun 30', `chip interpolation: ${chip}`);
assert(!chip.includes('{days}'), 'no raw days placeholder');

const summary = formatI18n('{rows} rows in syllabus', { rows: 12 });
assert(summary === '12 rows in syllabus', summary);

const homework = formatI18n('Assign at class on {date} · Session {n}: {title}', {
    date: 'Mar 5',
    n: 3,
    title: 'Unit 2'
});
assert(homework.includes('Mar 5') && homework.includes('Session 3'), homework);

console.log('All i18n-interpolation tests passed.');
