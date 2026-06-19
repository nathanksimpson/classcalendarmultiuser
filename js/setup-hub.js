/**
 * Setup Hub — cohort board, cohort timetable preview, class detail, and term events.
 */
(function (global) {
    let hooks = null;
    let unsubscribe = null;
    let selectedClassId = '';

    function t(key) {
        return hooks && hooks.t ? hooks.t(key) : key;
    }

    function escapeHtml(s) {
        if (hooks && hooks.escapeHtml) {
            return hooks.escapeHtml(s);
        }
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function getAppData() {
        return hooks && hooks.getAppData ? hooks.getAppData() : {};
    }

    function getContext() {
        if (typeof global.CCPActiveContext !== 'undefined') {
            return global.CCPActiveContext.get();
        }
        const data = getAppData();
        const ui = data.ui || {};
        return {
            classId: ui.homeworkTabClassId || '',
            cohortId: ui.cohortsTabSelectedId || '',
            sessionDate: ''
        };
    }

    function getCohort(cohortId) {
        return (getAppData().cohorts || []).find((c) => c && c.id === cohortId) || null;
    }

    function getClassData(classId) {
        return (getAppData().classes || []).find((c) => c && c.id === classId) || null;
    }

    function renderToolbar(panel, ctx) {
        const toolbar = panel.querySelector('#setupHubToolbar');
        if (!toolbar) {
            return;
        }
        const cohort = ctx.cohortId ? getCohort(ctx.cohortId) : null;
        const classData = selectedClassId ? getClassData(selectedClassId) : null;
        const cohortLabel = cohort ? cohort.name || cohort.id : t('setupHubNoCohort');
        toolbar.innerHTML = `
            <div class="setup-hub-toolbar-row">
                <p class="setup-hub-context-chip selection-chip" role="status">
                    <strong>${escapeHtml(cohortLabel)}</strong>
                </p>
                <div class="setup-hub-toolbar-actions">
                    <button type="button" class="btn btn-outline btn-compact" id="setupHubOpenTimetable">${escapeHtml(t('setupHubOpenTimetable'))}</button>
                    <button type="button" class="btn btn-outline btn-compact" id="setupHubPrintSyllabus" ${classData ? '' : 'disabled'}>${escapeHtml(t('setupHubPrintSyllabus'))}</button>
                    <button type="button" class="btn btn-outline btn-compact" id="setupHubOpenClassEditor" ${classData ? '' : 'disabled'}>${escapeHtml(t('setupHubOpenClassEditor'))}</button>
                </div>
            </div>`;
        toolbar.querySelector('#setupHubOpenTimetable')?.addEventListener('click', () => {
            if (typeof hooks.navigateToZone === 'function') {
                hooks.navigateToZone('schedule', 'timetable');
            }
        });
        toolbar.querySelector('#setupHubPrintSyllabus')?.addEventListener('click', () => {
            if (classData && typeof hooks.printClassSyllabus === 'function') {
                hooks.printClassSyllabus(classData.id);
            }
        });
        toolbar.querySelector('#setupHubOpenClassEditor')?.addEventListener('click', () => {
            if (classData && typeof hooks.openClassEditor === 'function') {
                hooks.openClassEditor(classData.id);
            }
        });
    }

    function renderTimetablePreview(panel, ctx) {
        const mount = panel.querySelector('#setupHubTimetablePreview');
        if (!mount) {
            return;
        }
        if (!ctx.cohortId || typeof hooks.renderCohortTimetablePreview !== 'function') {
            mount.innerHTML = `<p class="module-empty-hint">${escapeHtml(t('setupHubSelectCohort'))}</p>`;
            return;
        }
        hooks.renderCohortTimetablePreview(mount, ctx.cohortId, {
            onClassClick(classId) {
                selectClass(classId, ctx.cohortId);
            }
        });
    }

    function renderClassDetail(panel, ctx) {
        const mount = panel.querySelector('#setupHubClassDetail');
        if (!mount) {
            return;
        }
        const classId = selectedClassId || ctx.classId;
        const classData = classId ? getClassData(classId) : null;
        if (!classData) {
            mount.innerHTML = `<p class="module-empty-hint">${escapeHtml(t('setupHubNoClass'))}</p>`;
            return;
        }
        const api = global.CCPTeacherTimetable;
        const teachers = Array.isArray(classData.classTeachers) ? classData.classTeachers : [];
        const teacherLines = teachers.length
            ? teachers.map((row) => {
                const name = row.displayName || row.assignedTeacherName || row.name || '';
                const sched = api && api.formatTeacherRowScheduleSummary
                    ? api.formatTeacherRowScheduleSummary(classData, row, getAppData())
                    : '';
                return sched ? `${name} (${sched})` : name;
            }).filter(Boolean).join('<br>')
            : escapeHtml(t('cohortsNoTeacher'));
        const periodVal = classData.period != null && classData.period !== '' ? String(classData.period) : '';
        mount.innerHTML = `
            <div class="setup-hub-class-detail">
                <h3 class="setup-hub-class-detail-title">${escapeHtml(classData.name || classData.id)}</h3>
                <p class="section-hint setup-hub-class-detail-teachers">${teacherLines}</p>
                <label class="setup-hub-period-field">
                    <span>${escapeHtml(t('setupHubPeriodLabel'))}</span>
                    <input type="number" id="setupHubClassPeriodInput" class="field-input" min="1" max="7" step="1" value="${escapeHtml(periodVal)}" ${hooks.isReadOnly && hooks.isReadOnly() ? 'disabled' : ''}>
                </label>
                <button type="button" class="btn btn-primary btn-small" id="setupHubSavePeriodBtn" ${hooks.isReadOnly && hooks.isReadOnly() ? 'disabled' : ''}>${escapeHtml(t('setupHubSavePeriod'))}</button>
            </div>`;
        mount.querySelector('#setupHubSavePeriodBtn')?.addEventListener('click', () => {
            const input = mount.querySelector('#setupHubClassPeriodInput');
            const raw = input ? parseInt(input.value, 10) : NaN;
            if (Number.isNaN(raw) || raw < 1 || raw > 7) {
                return;
            }
            classData.period = raw;
            if (typeof hooks.saveData === 'function') {
                hooks.saveData();
            }
            refresh();
        });
    }

    function renderEventsFooter(panel, ctx) {
        const list = panel.querySelector('#setupHubEventsList');
        const empty = panel.querySelector('#setupHubEventsEmpty');
        if (!list) {
            return;
        }
        list.innerHTML = '';
        const events = typeof hooks.getCohortEvents === 'function'
            ? hooks.getCohortEvents(ctx.cohortId)
            : [];
        if (!ctx.cohortId) {
            if (empty) {
                empty.hidden = false;
                empty.textContent = t('setupHubSelectCohort');
            }
            return;
        }
        if (!events.length) {
            if (empty) {
                empty.hidden = false;
                empty.textContent = t('setupHubEventsEmpty');
            }
            return;
        }
        if (empty) {
            empty.hidden = true;
        }
        events.slice().sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || ''))).forEach((ev) => {
            const li = document.createElement('li');
            li.className = 'setup-hub-event-row';
            const dateLabel = hooks.formatDateDisplay && ev.startDate
                ? hooks.formatDateDisplay(ev.startDate)
                : ev.startDate || '';
            li.innerHTML = `<span class="setup-hub-event-date">${escapeHtml(dateLabel)}</span> <span class="setup-hub-event-name">${escapeHtml(ev.name || ev.title || '')}</span>`;
            li.addEventListener('click', () => {
                if (typeof hooks.openEventEditor === 'function') {
                    hooks.openEventEditor(ev.id);
                }
            });
            list.appendChild(li);
        });
    }

    function refresh() {
        const panel = document.getElementById('panel-setup-hub');
        if (!panel || panel.hidden) {
            return;
        }
        const ctx = getContext();
        if (ctx.classId && ctx.classId !== selectedClassId) {
            selectedClassId = ctx.classId;
        }
        renderToolbar(panel, ctx);
        renderTimetablePreview(panel, ctx);
        renderClassDetail(panel, ctx);
        renderEventsFooter(panel, ctx);
    }

    function selectClass(classId, cohortId) {
        selectedClassId = classId || '';
        if (typeof global.CCPActiveContext !== 'undefined') {
            global.CCPActiveContext.set(
                { classId: selectedClassId, cohortId: cohortId || getContext().cohortId },
                { source: 'setup-hub' }
            );
        }
        refresh();
    }

    function initTab(tabHooks) {
        hooks = tabHooks;
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
        if (typeof global.CCPActiveContext !== 'undefined' && global.CCPActiveContext.subscribe) {
            unsubscribe = global.CCPActiveContext.subscribe(() => refresh());
        }
        const ctx = getContext();
        if (ctx.classId) {
            selectedClassId = ctx.classId;
        }
        refresh();
    }

    global.CCPSetupHub = {
        initTab,
        refresh,
        selectClass
    };
})(typeof window !== 'undefined' ? window : globalThis);
