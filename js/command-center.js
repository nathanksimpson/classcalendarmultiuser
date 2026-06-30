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
        if (!classData) {
            mount.innerHTML = '';
            if (empty) {
                empty.hidden = false;
            }
            return;
        }
        const ht = global.CCPHomeworkTab;
        if (!ht) {
            mount.innerHTML = `<p class="section-hint">${escapeHtml(t('homeworkTabModuleMissing'))}</p>`;
            return;
        }
        const hwHooks = hooks.getHomeworkHooks ? hooks.getHomeworkHooks() : null;
        const syllabusRows = typeof hooks.getSyllabusRowsForClass === 'function'
            ? hooks.getSyllabusRowsForClass(classData)
            : (Array.isArray(classData.syllabusRows) ? classData.syllabusRows : []);
        const packet = ht.computeHomeworkForClass({
            classData,
            syllabusRows,
            referenceDate: ctx.sessionDate || ht.formatISO(new Date()),
            hooks: hwHooks
        });
        if (!packet || !packet.hasSyllabusLessons) {
            mount.innerHTML = `<p class="section-hint">${escapeHtml(t('commandCenterHwNoRow'))}</p>`;
            if (empty) {
                empty.hidden = false;
            }
            return;
        }
        if (empty) {
            empty.hidden = true;
        }
        const assignText = packet.assignHomework || '';
        const gradingText = packet.gradingHomework || '';
        const dueLabel = packet.dueDate && hooks.formatHomeworkDueDateDisplay
            ? hooks.formatHomeworkDueDateDisplay(packet.dueDate)
            : (packet.dueDate && hooks.formatDateDisplay
                ? hooks.formatDateDisplay(packet.dueDate)
                : packet.dueDate || '');
        const chips = [];
        if (packet.targetSessionNumber > 0) {
            chips.push(`<span class="homework-session-chip homework-session-chip--current">${escapeHtml(t('homeworkTabThisClassChip').replace('{n}', String(packet.targetSessionNumber)).replace('{title}', packet.targetLessonTitle || ''))}</span>`);
        }
        if (packet.gradingSessionNumber > 0 && packet.gradingLessonDate) {
            chips.push(`<span class="homework-session-chip homework-session-chip--grading">${escapeHtml(t('homeworkTabGradingFromChip').replace('{n}', String(packet.gradingSessionNumber)).replace('{date}', hooks.formatDateDisplay(packet.gradingLessonDate)))}</span>`);
        }
        const chipsHtml = chips.length
            ? `<div class="homework-session-chips homework-session-chips--compact">${chips.join('')}</div>`
            : '';
        mount.innerHTML = `
            ${chipsHtml}
            <p class="section-hint homework-cc-blocks-heading">${escapeHtml(t('homeworkTabBlocksHeading'))}</p>
            <div class="homework-copy-block homework-copy-block--grade homework-copy-block--compact">
                <div class="homework-copy-block-header">
                    <div class="homework-copy-block-titles">
                        <h4 class="homework-copy-block-title"><span class="homework-copy-block-num" aria-hidden="true">①</span> ${escapeHtml(t('homeworkTabGradingTitle'))}</h4>
                        <p class="homework-copy-block-subtitle section-hint">${escapeHtml(t('homeworkTabGradingSubtitle'))}</p>
                    </div>
                    <button type="button" class="btn btn-outline btn-compact homework-copy-btn" id="commandCenterCopyGrading">${escapeHtml(t('homeworkTabCopy'))}</button>
                </div>
                <textarea class="field-textarea homework-copy-textarea homework-copy-textarea--readonly" id="commandCenterHwGrading" rows="5" readonly spellcheck="false">${escapeHtml(gradingText)}</textarea>
            </div>
            <div class="homework-copy-block homework-copy-block--assign homework-copy-block--compact">
                <div class="homework-copy-block-header">
                    <div class="homework-copy-block-titles">
                        <h4 class="homework-copy-block-title"><span class="homework-copy-block-num" aria-hidden="true">②</span> ${escapeHtml(t('homeworkTabAssignTitle'))}</h4>
                        <p class="homework-copy-block-subtitle section-hint">${escapeHtml(t('homeworkTabAssignSubtitle'))}</p>
                    </div>
                </div>
                ${dueLabel ? `<p class="section-hint homework-cc-due"><span>${escapeHtml(t('homeworkTabDueNextClass'))}:</span> <strong>${escapeHtml(dueLabel)}</strong></p>` : ''}
                <textarea class="field-textarea homework-copy-textarea homework-copy-textarea--readonly" id="commandCenterHwAssign" rows="5" readonly spellcheck="false">${escapeHtml(assignText)}</textarea>
                <button type="button" class="btn btn-outline btn-compact homework-copy-btn" id="commandCenterCopyAssign">${escapeHtml(t('homeworkTabCopyHomework'))}</button>
            </div>`;
        mount.querySelector('#commandCenterCopyAssign')?.addEventListener('click', () => {
            const body = mount.querySelector('#commandCenterHwAssign')?.value || assignText;
            const formatted = hooks.formatHomeworkPasteBlock
                ? hooks.formatHomeworkPasteBlock(body, classData, packet, 'assign')
                : body;
            void hooks.copyText(formatted);
        });
        mount.querySelector('#commandCenterCopyGrading')?.addEventListener('click', () => {
            const body = mount.querySelector('#commandCenterHwGrading')?.value || gradingText;
            const formatted = hooks.formatHomeworkPasteBlock
                ? hooks.formatHomeworkPasteBlock(body, classData, packet, 'grading')
                : body;
            void hooks.copyText(formatted);
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
