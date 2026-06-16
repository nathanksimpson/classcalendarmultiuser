/**
 * Class list panel — keyed DOM updates + click delegation.
 * window.CCPClassListView
 */
(function (global) {
    let hooks = {
        getClasses: () => [],
        getSelectedId: () => '',
        getSearchQuery: () => '',
        onSelectClass: () => {},
        t: (key) => key,
        escapeHtml: (s) => String(s ?? ''),
        formatClassLabelWithPeriod: () => '',
        getClassScheduleGapStatus: () => ({ incomplete: false, unplacedLessonNumbers: [], totalLessons: 0 }),
        getClassCurriculumWarningKindForClass: () => null,
        inlineWarnBadgeHtml: () => '',
        scheduleTabWarningsRefresh: () => {}
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

    function buildItemHtml(classData, badge) {
        const meta = [hooks.formatClassLabelWithPeriod(classData), classData.grade]
            .filter(Boolean)
            .join(' · ');
        return `<span>${escape(classData.name)}${badge}</span><span class="module-list-item-meta">${escape(meta)}</span>`;
    }

    function getWarningBadge(classData) {
        const flags = (typeof global.CCPTabWarnings !== 'undefined' && global.CCPTabWarnings.getClassWarningFlags)
            ? global.CCPTabWarnings.getClassWarningFlags(classData)
            : {
                scheduleGap: hooks.getClassScheduleGapStatus(classData).incomplete,
                curriculumWarn: hooks.getClassCurriculumWarningKindForClass(classData)
            };
        let badge = '';
        if (flags.scheduleGap) {
            const gap = hooks.getClassScheduleGapStatus(classData);
            badge += hooks.inlineWarnBadgeHtml(
                hooks.t('scheduleGapWarning')
                    .replace('{name}', classData.name || '')
                    .replace('{unplaced}', gap.unplacedLessonNumbers.length)
                    .replace('{total}', gap.totalLessons)
            );
        }
        if (flags.curriculumWarn) {
            const curTitle = flags.curriculumWarn === 'missing'
                ? hooks.t('classCurriculumWarningListMissing')
                : hooks.t('classCurriculumWarningList');
            badge += hooks.inlineWarnBadgeHtml(curTitle);
        }
        return badge;
    }

    function createListButton(classData, isSelected) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'module-list-item' + (isSelected ? ' is-selected' : '');
        btn.dataset.action = 'select-class';
        btn.dataset.id = classData.id;
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', String(isSelected));
        btn.innerHTML = buildItemHtml(classData, getWarningBadge(classData));
        return btn;
    }

    function updateListButton(btn, classData, isSelected) {
        btn.classList.toggle('is-selected', isSelected);
        btn.setAttribute('aria-selected', String(isSelected));
        btn.dataset.id = classData.id;
        btn.innerHTML = buildItemHtml(classData, getWarningBadge(classData));
    }

    function renderEmpty(list, q) {
        list.replaceChildren();
        const empty = document.createElement('p');
        empty.className = 'module-list-empty';
        empty.style.padding = 'var(--space-3)';
        empty.style.color = 'var(--text-secondary)';
        empty.textContent = q ? hooks.t('lessonFilterSearchEmpty') : hooks.t('classEditorEmpty');
        list.appendChild(empty);
    }

    function render() {
        const list = document.getElementById('classList');
        if (!list) {
            return;
        }
        const q = (hooks.getSearchQuery() || '').trim().toLowerCase();
        const selectedId = hooks.getSelectedId() || '';
        const classes = hooks.getClasses().filter((c) => {
            if (!q) {
                return true;
            }
            const hay = [c.name, c.grade, c.book, c.levelCustom, hooks.formatClassLabelWithPeriod(c)]
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });

        if (classes.length === 0) {
            renderEmpty(list, q);
            hooks.scheduleTabWarningsRefresh();
            return;
        }

        const nextIds = new Set(classes.map((c) => c.id));
        const existing = new Map();
        list.querySelectorAll('[data-action="select-class"]').forEach((node) => {
            existing.set(node.dataset.id, node);
        });

        existing.forEach((node, id) => {
            if (!nextIds.has(id)) {
                node.remove();
            }
        });

        classes.forEach((classData, index) => {
            const isSelected = classData.id === selectedId;
            let btn = existing.get(classData.id);
            if (btn) {
                updateListButton(btn, classData, isSelected);
            } else {
                btn = createListButton(classData, isSelected);
            }
            const ref = list.children[index];
            if (ref !== btn) {
                list.insertBefore(btn, ref || null);
            }
        });

        hooks.scheduleTabWarningsRefresh();
    }

    function bindDelegation() {
        const list = document.getElementById('classList');
        if (!list || list.dataset.ccpListDelegation === '1') {
            return;
        }
        list.dataset.ccpListDelegation = '1';
        list.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="select-class"]');
            if (!btn || !list.contains(btn)) {
                return;
            }
            const id = btn.dataset.id;
            const classData = hooks.getClasses().find((c) => c.id === id);
            if (classData) {
                hooks.onSelectClass(classData);
            }
        });
    }

    global.CCPClassListView = {
        init,
        render,
        bindDelegation
    };
})(typeof window !== 'undefined' ? window : globalThis);
