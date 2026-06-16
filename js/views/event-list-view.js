/**
 * Event list panel — keyed DOM updates + click delegation.
 * window.CCPEventListView
 */
(function (global) {
    let hooks = {
        getEvents: () => [],
        getSelectedId: () => '',
        getSearchQuery: () => '',
        onSelectEvent: () => {},
        getEventDisplayName: (ev) => ev.name || '',
        t: (key) => key,
        escapeHtml: (s) => String(s ?? '')
    };

    function init(nextHooks) {
        hooks = Object.assign({}, hooks, nextHooks || {});
    }

    function escape(s) {
        if (hooks.escapeHtml) {
            return hooks.escapeHtml(s);
        }
        return global.CCPUtils ? global.CCPUtils.escapeHtml(s) : String(s ?? '');
    }

    function createListButton(ev, isSelected) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'module-list-item' + (isSelected ? ' is-selected' : '');
        btn.dataset.action = 'select-event';
        btn.dataset.id = ev.id;
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', String(isSelected));
        const dateStr = ev.isRange
            ? `${ev.startDate || ''} – ${ev.endDate || ''}`
            : (ev.date || '');
        btn.innerHTML = `<span>${escape(hooks.getEventDisplayName(ev))}</span><span class="module-list-item-meta">${escape(dateStr)}</span>`;
        return btn;
    }

    function updateListButton(btn, ev, isSelected) {
        btn.classList.toggle('is-selected', isSelected);
        btn.setAttribute('aria-selected', String(isSelected));
        btn.dataset.id = ev.id;
        const dateStr = ev.isRange
            ? `${ev.startDate || ''} – ${ev.endDate || ''}`
            : (ev.date || '');
        btn.innerHTML = `<span>${escape(hooks.getEventDisplayName(ev))}</span><span class="module-list-item-meta">${escape(dateStr)}</span>`;
    }

    function renderEmpty(list, q) {
        list.replaceChildren();
        const empty = document.createElement('p');
        empty.className = 'module-list-empty';
        empty.style.padding = 'var(--space-3)';
        empty.style.color = 'var(--text-secondary)';
        empty.textContent = q ? hooks.t('lessonFilterSearchEmpty') : hooks.t('eventEditorEmpty');
        list.appendChild(empty);
    }

    function render() {
        const list = document.getElementById('eventList');
        if (!list) {
            return;
        }
        const q = (hooks.getSearchQuery() || '').trim().toLowerCase();
        const selectedId = hooks.getSelectedId() || '';
        const events = hooks.getEvents()
            .slice()
            .sort((a, b) => {
                const da = a.date || a.startDate || '';
                const db = b.date || b.startDate || '';
                return da.localeCompare(db);
            })
            .filter((ev) => {
                if (!q) {
                    return true;
                }
                const hay = [hooks.getEventDisplayName(ev), ev.type, ev.notes].join(' ').toLowerCase();
                return hay.includes(q);
            });

        if (events.length === 0) {
            renderEmpty(list, q);
            return;
        }

        const nextIds = new Set(events.map((e) => e.id));
        const existing = new Map();
        list.querySelectorAll('[data-action="select-event"]').forEach((node) => {
            existing.set(node.dataset.id, node);
        });

        existing.forEach((node, id) => {
            if (!nextIds.has(id)) {
                node.remove();
            }
        });

        events.forEach((ev, index) => {
            const isSelected = ev.id === selectedId;
            let btn = existing.get(ev.id);
            if (btn) {
                updateListButton(btn, ev, isSelected);
            } else {
                btn = createListButton(ev, isSelected);
            }
            const ref = list.children[index];
            if (ref !== btn) {
                list.insertBefore(btn, ref || null);
            }
        });
    }

    function bindDelegation() {
        const list = document.getElementById('eventList');
        if (!list || list.dataset.ccpListDelegation === '1') {
            return;
        }
        list.dataset.ccpListDelegation = '1';
        list.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="select-event"]');
            if (!btn || !list.contains(btn)) {
                return;
            }
            const id = btn.dataset.id;
            const ev = hooks.getEvents().find((item) => item.id === id);
            if (ev) {
                hooks.onSelectEvent(ev);
            }
        });
    }

    global.CCPEventListView = {
        init,
        render,
        bindDelegation
    };
})(typeof window !== 'undefined' ? window : globalThis);
