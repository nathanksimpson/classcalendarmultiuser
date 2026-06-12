/**
 * Class notes tab UI helpers (Notes tab + Classes → Notes).
 * Shell mount, filters, and save/sync stay in app.js; this module builds shared DOM pieces.
 */
(function (global) {
    const FILTER_ATTR = 'data-class-notes-filter';

    /**
     * @param {object|null} meta from resolveDayNoteMeta
     * @param {string} dateLabel formatted date
     * @param {string} timeLabel formatted time
     * @param {object} [opts]
     * @param {boolean} [opts.showClassInMeta]
     * @param {boolean} [opts.showHomeroomInMeta]
     * @param {boolean} [opts.showDate]
     * @param {boolean} [opts.showTime]
     * @returns {string[]}
     */
    function buildNoteMetaParts(meta, dateLabel, timeLabel, opts) {
        const options = opts || {};
        const showClassInMeta = options.showClassInMeta === true;
        const showHomeroomInMeta = options.showHomeroomInMeta !== false;
        const showDate = options.showDate !== false;
        const showTime = options.showTime !== false;
        const parts = [];
        if (showClassInMeta && meta) {
            const classLabel = meta.subject
                ? `${meta.className} — ${meta.subject}`
                : meta.className;
            if (classLabel) {
                parts.push(classLabel);
            }
        }
        if (showHomeroomInMeta && meta && meta.homeroomLabel) {
            parts.push(meta.homeroomLabel);
        }
        if (showDate && dateLabel) {
            parts.push(dateLabel);
        }
        if (showTime && timeLabel) {
            parts.push(timeLabel);
        }
        return parts;
    }

    /**
     * @param {object} note normalized day note
     * @param {object|null} api DayNotes API
     * @param {object} deps app-provided callbacks and formatters
     * @returns {HTMLElement}
     */
    function buildPreviewEntry(note, api, deps) {
        const {
            showClassInMeta = false,
            showHomeroomInMeta = true,
            readOnly = false,
            showEditDelete = true,
            isEditing = false,
            t,
            formatDateDisplay,
            resolveDayNoteMeta,
            currentLanguage,
            onCopy,
            onEdit,
            onDelete,
            onSaveEdit,
            onCancelEdit,
            renderNoteHtml,
            buildCategoryBadgeHtml,
            populateCategorySelect,
            getCategorySelectValue,
            setupMentionField
        } = deps;

        const entry = document.createElement('div');
        entry.className = 'class-notes-preview-entry day-note-list-entry';
        if (note.homeroomNotifyUserId) {
            entry.classList.add('day-note-entry--for-homeroom');
        }
        entry.dataset.noteId = note.id;

        const metaLine = document.createElement('div');
        metaLine.className = 'class-notes-preview-entry-meta day-note-list-entry-meta';
        const time = api ? api.formatTimeLabel(note.createdAt, currentLanguage) : '';
        const classMeta = typeof resolveDayNoteMeta === 'function'
            ? resolveDayNoteMeta(note.classId)
            : null;
        const parts = buildNoteMetaParts(
            classMeta,
            formatDateDisplay(note.date),
            time,
            { showClassInMeta, showHomeroomInMeta }
        );
        metaLine.textContent = parts.join(' · ');
        if (note.homeroomNotifyUserId) {
            const hrBadge = document.createElement('span');
            hrBadge.className = 'day-note-homeroom-badge';
            hrBadge.textContent = t('dayNoteForHomeroomBadge');
            metaLine.appendChild(hrBadge);
        }
        if (typeof buildCategoryBadgeHtml === 'function') {
            const catBadge = document.createElement('span');
            catBadge.innerHTML = buildCategoryBadgeHtml(note.categoryId);
            metaLine.appendChild(catBadge);
        }

        entry.appendChild(metaLine);

        if (!isEditing) {
            const body = document.createElement('p');
            body.className = 'class-notes-preview-entry-body day-note-list-entry-body';
            if (typeof renderNoteHtml === 'function') {
                body.innerHTML = renderNoteHtml(note);
            } else {
                body.textContent = note.text;
            }
            entry.appendChild(body);

            const actions = document.createElement('div');
            actions.className = 'class-notes-preview-entry-actions';

            if (typeof onCopy === 'function') {
                const copyBtn = document.createElement('button');
                copyBtn.type = 'button';
                copyBtn.className = 'btn btn-outline btn-small';
                copyBtn.textContent = t('classNotesCopy');
                copyBtn.addEventListener('click', () => onCopy(note));
                actions.appendChild(copyBtn);
            }

            if (showEditDelete) {
                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'btn btn-outline btn-small';
                editBtn.textContent = t('classNotesEdit');
                editBtn.disabled = readOnly;
                editBtn.addEventListener('click', () => onEdit(note.id));

                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'btn btn-outline btn-small class-notes-delete-btn';
                deleteBtn.textContent = t('classNotesDelete');
                deleteBtn.disabled = readOnly;
                deleteBtn.addEventListener('click', () => onDelete(note.id));

                actions.appendChild(editBtn);
                actions.appendChild(deleteBtn);
            }

            if (actions.childElementCount) {
                entry.appendChild(actions);
            }
            return entry;
        }

        const editWrap = document.createElement('div');
        editWrap.className = 'class-notes-preview-entry-edit';
        let categorySelect = null;
        if (typeof populateCategorySelect === 'function') {
            const catLabel = document.createElement('label');
            catLabel.className = 'class-notes-filter-field';
            const catSpan = document.createElement('span');
            catSpan.textContent = t('dayNoteCategoryLabel');
            categorySelect = document.createElement('select');
            categorySelect.className = 'class-notes-add-select day-note-category-select';
            populateCategorySelect(categorySelect, note.categoryId);
            catLabel.appendChild(catSpan);
            catLabel.appendChild(categorySelect);
            editWrap.appendChild(catLabel);
        }
        const textarea = document.createElement('textarea');
        textarea.className = 'day-note-textarea class-notes-preview-edit-textarea';
        textarea.rows = 3;
        textarea.value = note.text;
        editWrap.appendChild(textarea);
        if (typeof setupMentionField === 'function') {
            setupMentionField(textarea, () => note.classId || '');
        }
        const editActions = document.createElement('div');
        editActions.className = 'class-notes-preview-entry-edit-actions';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-primary btn-small';
        saveBtn.textContent = t('classNotesSaveEdit');
        saveBtn.addEventListener('click', () => {
            const text = (textarea.value || '').trim();
            if (text) {
                const categoryId = categorySelect && typeof getCategorySelectValue === 'function'
                    ? getCategorySelectValue(categorySelect)
                    : note.categoryId;
                onSaveEdit(note.id, text, note.classId, categoryId);
            }
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-outline btn-small';
        cancelBtn.textContent = t('classNotesCancelEdit');
        cancelBtn.addEventListener('click', () => onCancelEdit());

        editActions.appendChild(saveBtn);
        editActions.appendChild(cancelBtn);
        editWrap.appendChild(editActions);
        entry.appendChild(editWrap);
        return entry;
    }

    global.ClassNotesPanel = {
        FILTER_ATTR,
        buildPreviewEntry
    };
})(typeof window !== 'undefined' ? window : global);
