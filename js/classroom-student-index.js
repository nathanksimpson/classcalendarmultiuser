/**
 * Left student index rail for attendance & homework.
 */
(function (global) {
    let hooks = null;
    let selectedStudentId = null;
    let checkedIds = new Set();

    function domain() {
        return global.CCPClassroomDomain;
    }

    function rowApi() {
        return global.CCPClassroomStudentRow;
    }

    function t(key) {
        return hooks && hooks.t ? hooks.t(key) : key;
    }

    function escapeHtml(s) {
        return rowApi() ? rowApi().escapeHtml(s) : String(s || '');
    }

    function render(mountEl, students, options) {
        if (!mountEl) {
            return;
        }
        const opts = options || {};
        const list = Array.isArray(students) ? students : [];
        const showCheckboxes = opts.showCheckboxes !== false;
        const html = [];
        html.push('<div class="classroom-index-toolbar">');
        if (showCheckboxes) {
            html.push(
                `<label class="classroom-index-select-all"><input type="checkbox" id="classroomIndexSelectAll" /> ${escapeHtml(t('classroomSelectAll'))}</label>`
            );
        }
        html.push('</div>');
        html.push('<ul class="classroom-index-list" role="list">');
        list.forEach((entry, idx) => {
            const sid = entry.student.id;
            const active = sid === selectedStudentId ? ' is-active' : '';
            const checked = checkedIds.has(sid) ? ' checked' : '';
            const label = rowApi() ? rowApi().formatStudentLabel(entry, t) : escapeHtml(entry.student.name);
            const actions = rowApi() ? rowApi().buildPlaceholderActions(t) : '';
            html.push(`<li class="classroom-index-item${active}" data-student-id="${escapeHtml(sid)}" role="listitem">`);
            html.push('<div class="classroom-index-item-head">');
            if (showCheckboxes) {
                html.push(
                    `<input type="checkbox" class="classroom-index-check" data-student-id="${escapeHtml(sid)}"${checked} aria-label="${escapeHtml(entry.student.name)}" />`
                );
            }
            html.push(`<button type="button" class="classroom-index-name-btn" data-student-id="${escapeHtml(sid)}">`);
            html.push(`<span class="classroom-index-num">${idx + 1}.</span> ${label}`);
            html.push('</button></div>');
            html.push(`<div class="classroom-index-actions">${actions}</div>`);
            html.push('</li>');
        });
        html.push('</ul>');
        if (!list.length) {
            html.push(`<p class="section-hint classroom-index-empty">${escapeHtml(t('classroomNoStudents'))}</p>`);
        }
        mountEl.innerHTML = html.join('');

        mountEl.querySelectorAll('.classroom-index-name-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                selectedStudentId = btn.getAttribute('data-student-id');
                if (typeof opts.onSelect === 'function') {
                    opts.onSelect(selectedStudentId);
                }
                render(mountEl, students, options);
            });
        });

        mountEl.querySelectorAll('.classroom-index-check').forEach((cb) => {
            cb.addEventListener('change', () => {
                const id = cb.getAttribute('data-student-id');
                if (cb.checked) {
                    checkedIds.add(id);
                } else {
                    checkedIds.delete(id);
                }
                if (typeof opts.onCheckChange === 'function') {
                    opts.onCheckChange(getCheckedIds());
                }
            });
        });

        const selectAll = mountEl.querySelector('#classroomIndexSelectAll');
        if (selectAll) {
            selectAll.checked = list.length > 0 && list.every((e) => checkedIds.has(e.student.id));
            selectAll.addEventListener('change', () => {
                if (selectAll.checked) {
                    list.forEach((e) => checkedIds.add(e.student.id));
                } else {
                    checkedIds.clear();
                }
                if (typeof opts.onCheckChange === 'function') {
                    opts.onCheckChange(getCheckedIds());
                }
                render(mountEl, students, options);
            });
        }
    }

    function getCheckedIds() {
        return Array.from(checkedIds);
    }

    function setCheckedIds(ids) {
        checkedIds = new Set(Array.isArray(ids) ? ids : []);
    }

    function clearChecks() {
        checkedIds.clear();
    }

    function getSelectedStudentId() {
        return selectedStudentId;
    }

    function setSelectedStudentId(id) {
        selectedStudentId = id || null;
    }

    function initTab(h) {
        hooks = h;
    }

    global.CCPClassroomStudentIndex = {
        initTab,
        render,
        getCheckedIds,
        setCheckedIds,
        clearChecks,
        getSelectedStudentId,
        setSelectedStudentId
    };
})(typeof window !== 'undefined' ? window : globalThis);
