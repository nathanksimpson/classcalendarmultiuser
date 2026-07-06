/**
 * Command Center — syllabus progression, day note, and homework copy in one view.
 */
(function (global) {
    let hooks = null;
    let unsubscribe = null;
    let mobileSegment = 'syllabus';
    let editingNoteId = null;
    let noteDraft = '';

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
            classId: ui.homeworkTabClassId || ui.classroomTabClassId || '',
            cohortId: ui.cohortsTabSelectedId || '',
            sessionDate: ui.classroomTabDate || ui.homeworkReferenceDate || ''
        };
    }

    function getClassData(classId) {
        return (getAppData().classes || []).find((c) => c && c.id === classId) || null;
    }

    function isPhoneViewport() {
        return document.documentElement.getAttribute('data-viewport') === 'phone';
    }

    function getLessonRows(classData) {
        const ht = global.CCPHomeworkTab;
        if (!ht || !classData) {
            return [];
        }
        const rows = Array.isArray(classData.syllabusRows) ? classData.syllabusRows : [];
        return ht.getLessonRowsFromSyllabus(rows);
    }

    function findActiveLessonIndex(lessons, sessionDate) {
        const ht = global.CCPHomeworkTab;
        if (!ht || !lessons.length) {
            return -1;
        }
        const ref = sessionDate || (ht.formatISO ? ht.formatISO(new Date()) : '');
        return ht.findTargetLessonIndex(lessons, ref);
    }

    function renderToolbar(panel, classData, ctx) {
        const toolbar = panel.querySelector('#commandCenterToolbar');
        if (!toolbar) {
            return;
        }
        const classLabel = classData ? classData.name || classData.id : t('commandCenterNoClass');
        const dateLabel = ctx.sessionDate && hooks.formatDateDisplay
            ? hooks.formatDateDisplay(ctx.sessionDate)
            : ctx.sessionDate || '';
        toolbar.innerHTML = `
            <div class="command-center-toolbar-row">
                <p class="command-center-context-chip selection-chip" role="status">
                    <strong>${escapeHtml(classLabel)}</strong>
                    ${dateLabel ? `<span class="command-center-context-date">· ${escapeHtml(dateLabel)}</span>` : ''}
                </p>
                <div class="command-center-toolbar-actions">
                    <button type="button" class="btn btn-outline btn-compact" id="commandCenterOpenTimetable">${escapeHtml(t('commandCenterPickFromTimetable'))}</button>
                    <button type="button" class="btn btn-outline btn-compact" id="commandCenterPrintSyllabus" ${classData ? '' : 'disabled'}>${escapeHtml(t('commandCenterPrintSyllabus'))}</button>
                    <button type="button" class="btn btn-outline btn-compact" id="commandCenterOpenSyllabus" ${classData ? '' : 'disabled'}>${escapeHtml(t('commandCenterOpenSyllabus'))}</button>
                </div>
            </div>`;
        toolbar.querySelector('#commandCenterOpenTimetable')?.addEventListener('click', () => {
            if (typeof hooks.navigateToZone === 'function') {
                hooks.navigateToZone('schedule', 'timetable');
            }
        });
        toolbar.querySelector('#commandCenterPrintSyllabus')?.addEventListener('click', () => {
            if (classData && typeof hooks.printClassSyllabus === 'function') {
                hooks.printClassSyllabus(classData.id);
            }
        });
        toolbar.querySelector('#commandCenterOpenSyllabus')?.addEventListener('click', () => {
            if (classData && typeof hooks.openSyllabusEditor === 'function') {
                hooks.openSyllabusEditor(classData.id);
            }
        });
    }

    function renderMobileTabs(panel) {
        const tabs = panel.querySelector('#commandCenterMobileTabs');
        if (!tabs) {
            return;
        }
        if (!isPhoneViewport()) {
            tabs.hidden = true;
            return;
        }
        tabs.hidden = false;
        const segments = [
            { id: 'syllabus', label: t('commandCenterPanelSyllabus') },
            { id: 'note', label: t('commandCenterPanelNote') },
            { id: 'hw', label: t('commandCenterPanelHw') }
        ];
        tabs.innerHTML = segments
            .map((seg) => {
                const active = mobileSegment === seg.id ? ' is-active' : '';
                return `<button type="button" class="command-center-mobile-tab${active}" data-segment="${seg.id}">${escapeHtml(seg.label)}</button>`;
            })
            .join('');
        tabs.querySelectorAll('.command-center-mobile-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                mobileSegment = btn.getAttribute('data-segment') || 'syllabus';
                render(panel);
            });
        });
    }

    function syncMobilePanelVisibility(panel) {
        const phone = isPhoneViewport();
        panel.querySelectorAll('[data-cc-panel]').forEach((el) => {
            if (!phone) {
                el.hidden = false;
                return;
            }
            el.hidden = el.getAttribute('data-cc-panel') !== mobileSegment;
        });
    }

    function renderSyllabusPanel(panel, classData, ctx) {
        const mount = panel.querySelector('#commandCenterSyllabusList');
        const empty = panel.querySelector('#commandCenterSyllabusEmpty');
        if (!mount) {
            return;
        }
        if (!classData) {
            mount.innerHTML = '';
            if (empty) {
                empty.hidden = false;
            }
            return;
        }
        if (empty) {
            empty.hidden = true;
        }
        const lessons = getLessonRows(classData);
        const activeIdx = findActiveLessonIndex(lessons, ctx.sessionDate);
        if (!lessons.length) {
            mount.innerHTML = `<p class="section-hint">${escapeHtml(t('commandCenterNoSyllabusRows'))}</p>`;
            return;
        }
        mount.innerHTML = lessons
            .map((row, idx) => {
                const active = idx === activeIdx ? ' command-center-syllabus-row--active' : '';
                const title = row.planTitle || row.planDetail || '';
                const date = row.date || '';
                return `<button type="button" class="command-center-syllabus-row${active}" data-row-id="${escapeHtml(row.id || '')}" data-row-date="${escapeHtml(date)}">
                    <span class="command-center-syllabus-row__date">${escapeHtml(date)}</span>
                    <span class="command-center-syllabus-row__title">${escapeHtml(title)}</span>
                </button>`;
            })
            .join('');
        mount.querySelectorAll('.command-center-syllabus-row').forEach((btn) => {
            btn.addEventListener('click', () => {
                const date = btn.getAttribute('data-row-date') || '';
                if (date && typeof global.CCPActiveContext !== 'undefined') {
                    global.CCPActiveContext.set({ sessionDate: date }, { source: 'command-center-syllabus' });
                }
            });
        });
    }

    function renderNotePanel(panel, classData, ctx) {
        const mount = panel.querySelector('#commandCenterNoteEditor');
        const empty = panel.querySelector('#commandCenterNoteEmpty');
        if (!mount) {
            return;
        }
        if (!classData || !ctx.sessionDate) {
            mount.innerHTML = '';
            if (empty) {
                empty.hidden = false;
            }
            return;
        }
        if (empty) {
            empty.hidden = true;
        }
        const api = global.CCPDayNotes;
        const data = getAppData();
        const notes = api && api.getNotesForClassOnDate
            ? api.getNotesForClassOnDate(data.dayNotes, classData.id, ctx.sessionDate)
            : [];
        const primary = notes[0] || null;
        if (primary && editingNoteId !== primary.id) {
            editingNoteId = primary.id;
            noteDraft = primary.text || '';
        } else if (!primary) {
            editingNoteId = null;
        }
        mount.innerHTML = `
            <label class="form-group command-center-note-field">
                <span class="form-label">${escapeHtml(t('commandCenterDayNoteLabel'))}</span>
                <textarea id="commandCenterNoteText" class="field-textarea" rows="12" spellcheck="true">${escapeHtml(noteDraft)}</textarea>
            </label>
            <div class="command-center-note-actions">
                <button type="button" class="btn btn-primary btn-compact" id="commandCenterNoteSave">${escapeHtml(t('save'))}</button>
            </div>`;
        const textarea = mount.querySelector('#commandCenterNoteText');
        textarea?.addEventListener('input', () => {
            noteDraft = textarea.value;
        });
        mount.querySelector('#commandCenterNoteSave')?.addEventListener('click', () => {
            const text = (textarea && textarea.value ? textarea.value : '').trim();
            if (!text) {
                return;
            }
            if (editingNoteId && typeof hooks.updateDayNote === 'function') {
                hooks.updateDayNote(editingNoteId, { text });
            } else if (typeof hooks.appendDayNote === 'function') {
                hooks.appendDayNote({
                    classId: classData.id,
                    dateStr: ctx.sessionDate,
                    text
                });
            }
            render(panel);
        });
    }

    function renderHomeworkPanel(panel, classData, ctx) {
        const mount = panel.querySelector('#commandCenterHomeworkBody');
        const empty = panel.querySelector('#commandCenterHomeworkEmpty');
        if (!mount) {
            return;
        }
        if (empty) {
            empty.hidden = true;
        }
        const classLabel = classData ? escapeHtml(classData.name || classData.id) : '';
        mount.innerHTML = `
            <p class="section-hint">${escapeHtml(t('commandCenterHwLinkHint'))}</p>
            <button type="button" class="btn btn-primary btn-compact" id="commandCenterOpenHomeworkCopy">${escapeHtml(t('commandCenterHwOpenCopy'))}</button>
            ${classLabel ? `<p class="section-hint command-center-hw-class-ref">${classLabel}</p>` : ''}`;
        mount.querySelector('#commandCenterOpenHomeworkCopy')?.addEventListener('click', () => {
            if (typeof hooks.navigateToZone === 'function') {
                const opts = classData && classData.id ? { classId: classData.id } : {};
                hooks.navigateToZone('schedule', 'homework', opts);
            }
        });
    }

    function render(panel) {
        if (!panel) {
            return;
        }
        const ctx = getContext();
        const classData = getClassData(ctx.classId);
        renderToolbar(panel, classData, ctx);
        renderMobileTabs(panel);
        renderSyllabusPanel(panel, classData, ctx);
        renderNotePanel(panel, classData, ctx);
        renderHomeworkPanel(panel, classData, ctx);
        syncMobilePanelVisibility(panel);
    }

    function initTab(h) {
        hooks = h;
        if (unsubscribe) {
            unsubscribe();
        }
        if (typeof global.CCPActiveContext !== 'undefined') {
            unsubscribe = global.CCPActiveContext.subscribe(() => {
                const panel = document.getElementById('panel-command-center');
                if (panel && !panel.hidden) {
                    render(panel);
                }
            });
        }
        const panel = document.getElementById('panel-command-center');
        render(panel);
    }

    global.CCPCommandCenter = {
        initTab,
        render
    };
})(typeof window !== 'undefined' ? window : globalThis);
