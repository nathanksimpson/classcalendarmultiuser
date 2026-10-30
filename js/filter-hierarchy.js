/**
 * Shared Scope → Narrow by → Classes hierarchy for filter popovers
 * (Calendar Filter + event "Applies to"). Rendering + DOM reading only;
 * filter semantics stay with the caller.
 */
(function (root) {
    'use strict';

    const EXCEPT_ROW_MAX = 8;

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function fill(template, values) {
        return String(template || '').replace(/\{(\w+)\}/g, (m, key) => (
            Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : m
        ));
    }

    /**
     * @param {Array<{id:string,label:string}|object>} classes
     * @param {{ facetReason:(c)=>string|null, isChecked:(c)=>boolean, getId?:(c)=>string, getLabel?:(c)=>string }} opts
     * @returns {Array<{id:string,label:string,state:'on'|'off'|'excluded',reason:string|null}>}
     */
    function computeClassStates(classes, opts) {
        const o = opts || {};
        const getId = o.getId || ((c) => String(c.id));
        const getLabel = o.getLabel || ((c) => String(c.label || c.name || c.id));
        return (Array.isArray(classes) ? classes : []).filter(Boolean).map((c) => {
            const reason = o.facetReason ? o.facetReason(c) : null;
            if (reason) {
                return { id: getId(c), label: getLabel(c), state: 'excluded', reason };
            }
            const on = o.isChecked ? !!o.isChecked(c) : true;
            return { id: getId(c), label: getLabel(c), state: on ? 'on' : 'off', reason: null };
        });
    }

    function summarizeStates(states) {
        const out = { total: 0, matched: 0, on: 0, off: 0, excluded: 0 };
        (states || []).forEach((s) => {
            out.total += 1;
            if (s.state === 'excluded') {
                out.excluded += 1;
                return;
            }
            out.matched += 1;
            out[s.state === 'on' ? 'on' : 'off'] += 1;
        });
        return out;
    }

    function groupCountText(selectedCount, total, labels) {
        if (!selectedCount || selectedCount >= total) {
            return labels.any;
        }
        return fill(labels.countOf, { n: selectedCount, total });
    }

    function renderScopeButtons(options, active, attr) {
        return options.map((opt) => {
            const on = opt.value === active;
            return `<button type="button" class="syllabus-segment-btn${on ? ' is-active' : ''}" role="radio" aria-checked="${on}" ${attr}="${esc(opt.value)}">${esc(opt.label)}</button>`;
        }).join('');
    }

    /** Sync an existing static segment control (e.g. scope) to a value. */
    function setSegmentActive(container, attr, value) {
        if (!container) {
            return;
        }
        container.querySelectorAll(`[${attr}]`).forEach((btn) => {
            const on = btn.getAttribute(attr) === value;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-checked', on ? 'true' : 'false');
        });
    }

    function renderGroup(cfg) {
        const { key, attr, title, options, labels } = cfg;
        if (!options || !options.length) {
            return '';
        }
        const selected = new Set((cfg.selected || []).map(String));
        const chips = options.map((opt) => `
            <label class="checkbox-label lesson-filter-chip">
                <input type="checkbox" ${attr}="${esc(key)}" value="${esc(opt.value)}"${selected.has(String(opt.value)) ? ' checked' : ''}>
                <span>${esc(opt.label)}</span>
            </label>`).join('');
        const isAny = selected.size === 0 || selected.size >= options.length;
        return `
            <details class="lesson-filter-section fh-group" data-filter-key="${esc(key)}" data-fh-group="${esc(key)}"${cfg.open ? ' open' : ''}>
                <summary class="fh-group-summary">
                    <span class="fh-group-title">${esc(title)}</span>
                    <span class="fh-group-count${isAny ? '' : ' is-narrowed'}" data-fh-count>${esc(groupCountText(selected.size, options.length, labels))}</span>
                </summary>
                <div class="fh-group-body">
                    <div class="lesson-filter-chip-grid">${chips}</div>
                    <button type="button" class="btn btn-outline btn-small fh-any-btn" data-fh-any="${esc(key)}"${isAny ? ' hidden' : ''}>${esc(labels.anyReset)}</button>
                </div>
            </details>`;
    }

    function renderSegmentGroup(cfg) {
        const { key, title, options, value, labels } = cfg;
        const active = options.find((o) => o.value === value) || options[0];
        const isAny = active === options[0];
        return `
            <details class="lesson-filter-section fh-group fh-group--segment" data-fh-group="${esc(key)}"${cfg.open ? ' open' : ''}>
                <summary class="fh-group-summary">
                    <span class="fh-group-title">${esc(title)}</span>
                    <span class="fh-group-count${isAny ? '' : ' is-narrowed'}" data-fh-count>${esc(isAny ? labels.any : active.label)}</span>
                </summary>
                <div class="fh-group-body">
                    <div class="calendar-view-switch fh-segment" role="radiogroup" aria-label="${esc(title)}" data-fh-segment="${esc(key)}">
                        ${renderScopeButtons(options, active.value, 'data-fh-segment-value')}
                    </div>
                </div>
            </details>`;
    }

    function renderNarrow(title, groupsHtml) {
        const inner = (groupsHtml || []).filter(Boolean).join('');
        if (!inner) {
            return '';
        }
        return `<div class="fh-narrow"><h4 class="lesson-filter-section-title fh-tier-title">${esc(title)}</h4>${inner}</div>`;
    }

    /**
     * @param {{ attr:string, title:string, states:Array, mode:'only'|'except', labels:object, hint?:string }} cfg
     */
    function renderPreview(cfg) {
        const { attr, title, states, mode, labels } = cfg;
        const sum = summarizeStates(states);
        const chips = states.map((s) => {
            const excluded = s.state === 'excluded';
            const tip = excluded && s.reason ? ` title="${esc(fill(labels.hiddenBy, { group: s.reason }))}"` : '';
            return `
            <label class="checkbox-label lesson-filter-chip${excluded ? ' is-excluded-by-facet' : ''}"${tip}>
                <input type="checkbox" ${attr}="classIds" value="${esc(s.id)}"${s.state === 'on' ? ' checked' : ''}${excluded ? ' disabled' : ''}>
                <span>${esc(s.label)}</span>
            </label>`;
        }).join('');
        let exceptRow = '';
        if (mode === 'except' && sum.off > 0) {
            const off = states.filter((s) => s.state === 'off');
            const shown = off.slice(0, EXCEPT_ROW_MAX).map((s) => `
                <button type="button" class="btn btn-outline btn-small fh-except-chip" data-fh-except-remove="${esc(s.id)}" aria-label="${esc(fill(labels.exceptRemoveAria, { name: s.label }))}">${esc(s.label)} <span aria-hidden="true">&times;</span></button>`).join('');
            const more = off.length > EXCEPT_ROW_MAX
                ? `<span class="fh-except-more">${esc(fill(labels.exceptMore, { n: off.length - EXCEPT_ROW_MAX }))}</span>`
                : '';
            exceptRow = `<div class="fh-except-row"><span class="fh-except-label">${esc(labels.except)}</span>${shown}${more}</div>`;
        }
        return `
            <section class="lesson-filter-section fh-preview" data-filter-key="classIds" data-fh-preview data-fh-mode="${esc(mode)}">
                <div class="fh-preview-head">
                    <h4 class="lesson-filter-section-title fh-tier-title">${esc(title)}</h4>
                    <span class="fh-group-count" data-fh-count>${esc(fill(labels.countOf, { n: sum.on, total: sum.matched }))}</span>
                    <span class="fh-preview-actions">
                        <button type="button" class="btn btn-outline btn-small" data-fh-preview-all>${esc(labels.all)}</button>
                        <button type="button" class="btn btn-outline btn-small" data-fh-preview-none>${esc(labels.none)}</button>
                    </span>
                </div>
                <p class="section-hint fh-mode-hint">${esc(cfg.hint || (mode === 'except' ? labels.modeExcept : labels.modeOnly))}</p>
                <div class="lesson-filter-chip-grid">${chips}</div>
                ${exceptRow}
            </section>`;
    }

    function readGroupSelection(body, attr, key) {
        if (!body) {
            return null;
        }
        const boxes = body.querySelectorAll(`[data-fh-group="${key}"] input[${attr}="${key}"]`);
        if (!boxes.length) {
            return null;
        }
        const out = [];
        boxes.forEach((cb) => {
            if (cb.checked) {
                out.push(cb.value);
            }
        });
        return out;
    }

    function readSegmentValue(body, key) {
        const btn = body && body.querySelector(`[data-fh-segment="${key}"] .is-active[data-fh-segment-value]`);
        return btn ? btn.getAttribute('data-fh-segment-value') : null;
    }

    function readPreview(body, attr) {
        const checked = [];
        const unchecked = [];
        if (body) {
            body.querySelectorAll(`[data-fh-preview] input[${attr}="classIds"]`).forEach((cb) => {
                if (cb.disabled) {
                    return;
                }
                (cb.checked ? checked : unchecked).push(cb.value);
            });
        }
        return { checked, unchecked };
    }

    function captureView(body) {
        const open = {};
        let focusSel = null;
        if (body) {
            body.querySelectorAll('[data-fh-group]').forEach((el) => {
                open[el.getAttribute('data-fh-group')] = el.open === true;
            });
            const active = body.ownerDocument && body.ownerDocument.activeElement;
            if (active && body.contains(active)) {
                if (active.matches('input[type="checkbox"]')) {
                    const attr = Array.from(active.attributes).find((a) => a.name.startsWith('data-') && a.name !== 'data-fh-segment-value');
                    if (attr) {
                        focusSel = `input[${attr.name}="${attr.value}"][value="${(active.value || '').replace(/"/g, '\\"')}"]`;
                    }
                } else if (active.hasAttribute('data-fh-segment-value')) {
                    focusSel = `[data-fh-segment-value="${active.getAttribute('data-fh-segment-value')}"]`;
                }
            }
        }
        return { open, focusSel };
    }

    function restoreView(body, view) {
        if (!body || !view) {
            return;
        }
        Object.keys(view.open || {}).forEach((key) => {
            const el = body.querySelector(`[data-fh-group="${key}"]`);
            if (el) {
                el.open = view.open[key];
            }
        });
        if (view.focusSel) {
            try {
                const el = body.querySelector(view.focusSel);
                if (el) {
                    el.focus({ preventScroll: true });
                }
            } catch (_) {
                /* selector built from attribute values; ignore odd ids */
            }
        }
    }

    /** Hide chips/groups that do not match; auto-open collapsed groups with matches. */
    function applySearch(body, query) {
        if (!body) {
            return false;
        }
        const q = String(query || '').trim().toLocaleLowerCase();
        let anyVisible = false;
        body.querySelectorAll('.lesson-filter-section').forEach((section) => {
            let matches = 0;
            section.querySelectorAll('.lesson-filter-chip').forEach((chip) => {
                const label = (chip.querySelector('span') || {}).textContent || '';
                const match = !q || label.toLocaleLowerCase().includes(q);
                chip.hidden = !match;
                if (match) {
                    matches += 1;
                }
            });
            const isSegmentGroup = section.classList.contains('fh-group--segment');
            section.hidden = q ? matches === 0 : false;
            if (q && matches > 0 && section.tagName === 'DETAILS') {
                section.open = true;
            }
            if (!q && isSegmentGroup) {
                section.hidden = false;
            }
            if (matches > 0 || (!q && isSegmentGroup)) {
                anyVisible = true;
            }
        });
        body.classList.toggle('lesson-filter-body--search-empty', !!q && !anyVisible);
        return anyVisible;
    }

    /**
     * Wire Any / All / None / Except-remove / segment buttons and checkbox changes once per body.
     * onChange is called after the DOM reflects the user's intent.
     */
    function bindControls(body, attr, onChange) {
        if (!body || body.dataset.fhBound === '1') {
            return;
        }
        body.dataset.fhBound = '1';
        body.addEventListener('change', (e) => {
            if (e.target && e.target.matches && e.target.matches(`input[${attr}]`)) {
                onChange();
            }
        });
        body.addEventListener('click', (e) => {
            const target = e.target && e.target.closest ? e.target : null;
            if (!target) {
                return;
            }
            const anyBtn = target.closest('[data-fh-any]');
            if (anyBtn) {
                const key = anyBtn.getAttribute('data-fh-any');
                body.querySelectorAll(`[data-fh-group="${key}"] input[${attr}]`).forEach((cb) => {
                    cb.checked = false;
                });
                onChange();
                return;
            }
            const segBtn = target.closest('[data-fh-segment-value]');
            if (segBtn && body.contains(segBtn)) {
                const group = segBtn.closest('[data-fh-segment]');
                if (group) {
                    setSegmentActive(group, 'data-fh-segment-value', segBtn.getAttribute('data-fh-segment-value'));
                    onChange();
                }
                return;
            }
            const allBtn = target.closest('[data-fh-preview-all]');
            const noneBtn = target.closest('[data-fh-preview-none]');
            if (allBtn || noneBtn) {
                body.querySelectorAll(`[data-fh-preview] input[${attr}="classIds"]`).forEach((cb) => {
                    if (!cb.disabled) {
                        cb.checked = !!allBtn;
                    }
                });
                onChange();
                return;
            }
            const removeBtn = target.closest('[data-fh-except-remove]');
            if (removeBtn) {
                const id = removeBtn.getAttribute('data-fh-except-remove');
                body.querySelectorAll(`[data-fh-preview] input[${attr}="classIds"]`).forEach((cb) => {
                    if (cb.value === id) {
                        cb.checked = true;
                    }
                });
                onChange();
            }
        });
    }

    const api = {
        computeClassStates,
        summarizeStates,
        groupCountText,
        renderScopeButtons,
        setSegmentActive,
        renderGroup,
        renderSegmentGroup,
        renderNarrow,
        renderPreview,
        readGroupSelection,
        readSegmentValue,
        readPreview,
        captureView,
        restoreView,
        applySearch,
        bindControls
    };

    root.CCPFilterHierarchy = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
