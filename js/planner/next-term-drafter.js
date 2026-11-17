/**
 * Schedule drafter (prototype) — plan next term's levels and cohort sizes (CCPNextTermDrafter).
 *
 * First step of the "Next term" tool: for each cohort, what level does it most likely move to,
 * and how big would each next-term level group be? Everything here is a DRAFT held in memory:
 * nothing is written to the calendar, and no student is moved on their own.
 *
 * Standalone by design: `buildDraft` is pure (cohorts in, rows out) and `mount` only needs a
 * container and a list of cohorts, so this can run outside the planner too.
 * Needs js/level-progression.js (CCPLevelProgression).
 */
(function (global) {
    'use strict';

    const STAY = '__stay__';

    function L() {
        return global.CCPLevelProgression;
    }

    function activeCount(c) {
        return ((c && c.students) || []).filter((s) => s && s.active !== false).length;
    }

    /** Start month of the term after this calendar's (termStart + termMonthCount months); 12 when unknown. */
    function nextTermStartMonth(appData) {
        const m = /^(\d{4})-(\d{2})/.exec(String((appData && appData.termStart) || ''));
        if (!m) return 12;
        const add = Number(appData.termMonthCount) || 3;
        return ((Number(m[2]) - 1 + add) % 12) + 1;
    }

    /**
     * @param {Array<{id,name,level,students?,termsAtLevel?}>} cohorts
     * @param {Object<string,string>} overrides cohort id -> level, or '__stay__'
     * @param {{termStartMonth?:number}} ctx
     * @param {{healthyFrom?:number,thinAt?:number,max?:number}} sizes
     * @returns {{rows:Array, groups:Array}}
     */
    function buildDraft(cohorts, overrides, ctx, sizes) {
        const P = L();
        const plan = P.planProgression(cohorts, overrides, ctx);
        const byId = new Map(plan.map((p) => [p.id, p]));
        const rows = (cohorts || []).map((c) => {
            const p = byId.get(c.id);
            const n = activeCount(c);
            return {
                id: c.id,
                name: c.name || c.id,
                from: p.from || String(c.level || ''),
                to: p.to,
                reason: p.reason,
                source: p.source,
                askLevelUp: !!(P.defaultNext(p.from, ctx || {}).askLevelUp),
                students: n,
                options: P.optionsFor(p.from)
            };
        });
        // Next-term groups: every cohort that lands on the same level would share it.
        const groups = new Map();
        rows.forEach((r) => {
            if (!r.to) return; // graduating or unknown
            if (!groups.has(r.to)) groups.set(r.to, { level: r.to, students: 0, cohorts: [] });
            const g = groups.get(r.to);
            g.students += r.students;
            g.cohorts.push(r.id);
        });
        const out = Array.from(groups.values()).map((g) => Object.assign(g, { band: P.sizeBand(g.students, sizes) }));
        return { rows, groups: out };
    }

    /* ------------------------------------------------------------------ view */

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function tr(key, fallback, vars) {
        let s = '';
        if (typeof global.getCalendarTranslation === 'function') s = global.getCalendarTranslation(key) || '';
        if (!s || s === key) s = fallback || key;
        Object.keys(vars || {}).forEach((k) => { s = s.split(`{${k}}`).join(String(vars[k])); });
        return s;
    }

    const state = { overrides: {}, month: null };

    /**
     * Draw the drafter into `root`.
     * @param {HTMLElement} root
     * @param {{cohorts:Array, termStart?:string, termMonthCount?:number}} data  a calendar (or any object with cohorts)
     */
    function mount(root, data) {
        if (!root) return;
        const cohorts = (data && data.cohorts) || [];
        if (state.month == null) state.month = nextTermStartMonth(data);
        const draw = () => {
            const d = buildDraft(cohorts, state.overrides, { termStartMonth: state.month });
            const months = [3, 6, 9, 12];
            let h = `
<p class="sp-hint">${esc(tr('drafterDraftNote', 'Prototype · always a draft. Nothing here changes the calendar or moves a student.'))}</p>
<label class="sp-field"><span>${esc(tr('drafterMonth', 'Next term starts in'))}</span>
  <select class="field-select" data-drafter-month>
    ${months.map((m) => `<option value="${m}"${m === Number(state.month) ? ' selected' : ''}>${esc(tr('drafterMonthN', 'Month {n}', { n: m }))}</option>`).join('')}
  </select></label>`;
            if (!cohorts.length) {
                root.innerHTML = h + `<p class="sp-hint">${esc(tr('drafterNoCohorts', 'No cohorts in this calendar yet.'))}</p>`;
                return;
            }
            h += `<table class="drafter-table"><thead><tr>
  <th>${esc(tr('drafterColCohort', 'Cohort'))}</th><th>${esc(tr('drafterColNow', 'Level now'))}</th>
  <th>${esc(tr('drafterColStudents', 'Students'))}</th><th>${esc(tr('drafterColNext', 'Next term'))}</th></tr></thead><tbody>`;
            d.rows.forEach((r) => {
                const pick = Object.prototype.hasOwnProperty.call(state.overrides, r.id) ? state.overrides[r.id] : '';
                const sug = r.reason === 'graduate' ? tr('drafterGraduate', 'Finishes middle school')
                    : r.reason === 'unknown' ? tr('drafterUnknown', 'Level not recognised')
                        : r.reason === 'stay' ? tr('drafterStay', 'Stays') + ` (${r.to})`
                            : `${r.to}${r.reason === 'ask' ? ' ?' : ''}`;
                h += `<tr><td>${esc(r.name)}</td><td>${esc(r.from)}</td><td>${r.students}</td><td>
<select class="field-select" data-drafter-pick="${esc(r.id)}">
  <option value=""${pick === '' ? ' selected' : ''}>${esc(tr('drafterSuggested', 'Suggested'))}: ${esc(sug)}</option>
  <option value="${STAY}"${pick === STAY ? ' selected' : ''}>${esc(tr('drafterStay', 'Stays'))}</option>
  ${r.options.map((o) => `<option value="${esc(o)}"${pick === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}
</select>${r.reason === 'ask' && pick === '' ? ` <span class="sp-hint">${esc(tr('drafterAskHint', 'check terms at this level'))}</span>` : ''}</td></tr>`;
            });
            h += `</tbody></table>
<h3 class="drafter-h">${esc(tr('drafterGroups', 'Next-term groups'))}</h3>
<ul class="drafter-groups">${d.groups.map((g) => `<li class="drafter-band drafter-band--${g.band}"><strong>${esc(g.level)}</strong> · ${esc(tr('drafterStudentsN', '{n} students', { n: g.students }))} · ${esc(tr('drafterBand_' + g.band, g.band))}</li>`).join('')}</ul>`;
            root.innerHTML = h;
        };
        if (!root.__drafterBound) {
            root.__drafterBound = true;
            root.addEventListener('change', (ev) => {
                const pick = ev.target.closest('[data-drafter-pick]');
                if (pick) {
                    const id = pick.getAttribute('data-drafter-pick');
                    if (pick.value === '') delete state.overrides[id]; else state.overrides[id] = pick.value;
                    root.__drafterDraw();
                    return;
                }
                if (ev.target.matches('[data-drafter-month]')) {
                    state.month = Number(ev.target.value);
                    root.__drafterDraw();
                }
            });
        }
        root.__drafterDraw = draw;
        draw();
    }

    function reset() {
        state.overrides = {};
        state.month = null;
    }

    global.CCPNextTermDrafter = { buildDraft, nextTermStartMonth, mount, reset, STAY };
    if (typeof module !== 'undefined' && module.exports) module.exports = global.CCPNextTermDrafter;
})(typeof window !== 'undefined' ? window : globalThis);
