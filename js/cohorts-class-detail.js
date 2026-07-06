/**
 * Cohorts panel — class detail on board card select (ported from Setup Hub).
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

    function getClassData(classId) {
        return (getAppData().classes || []).find((c) => c && c.id === classId) || null;
    }

    function renderClassDetail(panel, ctx) {
        const mount = panel.querySelector('#cohortsClassDetail');
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
        const readOnly = hooks.isReadOnly && hooks.isReadOnly();
        mount.innerHTML = `
            <div class="setup-hub-class-detail">
                <h3 class="setup-hub-class-detail-title">${escapeHtml(classData.name || classData.id)}</h3>
                <p class="section-hint setup-hub-class-detail-teachers">${teacherLines}</p>
                <label class="setup-hub-period-field">
                    <span>${escapeHtml(t('setupHubPeriodLabel'))}</span>
                    <input type="number" id="cohortsClassPeriodInput" class="field-input" min="1" max="7" step="1" value="${escapeHtml(periodVal)}" ${readOnly ? 'disabled' : ''}>
                </label>
                <div class="cohorts-class-detail-actions">
                    <button type="button" class="btn btn-primary btn-small" id="cohortsSavePeriodBtn" ${readOnly ? 'disabled' : ''}>${escapeHtml(t('setupHubSavePeriod'))}</button>
                    <button type="button" class="btn btn-outline btn-small" id="cohortsPrintSyllabusBtn">${escapeHtml(t('setupHubPrintSyllabus'))}</button>
                    <button type="button" class="btn btn-outline btn-small" id="cohortsOpenClassEditorBtn">${escapeHtml(t('setupHubOpenClassEditor'))}</button>
                </div>
            </div>`;
        mount.querySelector('#cohortsSavePeriodBtn')?.addEventListener('click', () => {
            const input = mount.querySelector('#cohortsClassPeriodInput');
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
        mount.querySelector('#cohortsPrintSyllabusBtn')?.addEventListener('click', () => {
            if (typeof hooks.printClassSyllabus === 'function') {
                hooks.printClassSyllabus(classData.id);
            }
        });
        mount.querySelector('#cohortsOpenClassEditorBtn')?.addEventListener('click', () => {
            if (typeof hooks.openClassEditor === 'function') {
                hooks.openClassEditor(classData.id);
            }
        });
    }

    function refresh() {
        const panel = document.getElementById('panel-cohorts');
        if (!panel || panel.hidden) {
            return;
        }
        const ctx = getContext();
        if (ctx.classId && ctx.classId !== selectedClassId) {
            selectedClassId = ctx.classId;
        }
        renderClassDetail(panel, ctx);
    }

    function selectClass(classId, cohortId) {
        selectedClassId = classId || '';
        if (typeof global.CCPActiveContext !== 'undefined') {
            global.CCPActiveContext.set(
                { classId: selectedClassId, cohortId: cohortId || getContext().cohortId },
                { source: 'cohorts-board' }
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

    global.CCPCohortsClassDetail = {
        initTab,
        refresh,
        selectClass
    };
})(typeof window !== 'undefined' ? window : globalThis);
