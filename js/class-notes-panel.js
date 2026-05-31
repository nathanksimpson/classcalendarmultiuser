/**
 * Class notes tab UI helpers (Notes tab + Classes → Notes).
 * Shell mount, filters, and save/sync stay in app.js; this module builds shared DOM pieces.
 */
(function (global) {
    const FILTER_ATTR = 'data-class-notes-filter';

    /**
     * @param {object} note normalized day note
     * @param {object|null} api DayNotes API
     * @param {object} deps app-provided callbacks and formatters
     * @returns {HTMLElement}
     */
    function buildPreviewEntry(note, api, deps) {
        const {
            showClassInMeta = false,
            readOnly = false,
            isEditing = false,
            t,
            formatDateDisplay,
            resolveDayNoteMeta,
            currentLanguage,
            onEdit,
            onDelete,
            onSaveEdit,
            onCancelEdit
        } = deps;

        const entry = document.createElement('div');
        entry.className = 'class-notes-preview-entry day-note-list-entry';
        entry.dataset.noteId = note.id;

        const metaLine = document.createElement('div');
        metaLine.className = 'class-notes-preview-entry-meta day-note-list-entry-meta';
        const time = api ? api.formatTimeLabel(note.createdAt, currentLanguage) : '';
        const parts = [formatDateDisplay(note.date), time];
        if (showClassInMeta && resolveDayNoteMeta) {
            const classMeta = resolveDayNoteMeta(note.classId);
            const classLabel = classMeta.subject
                ? `${classMeta.className} — ${classMeta.subject}`
                : classMeta.className;
            if (classLabel) {
                parts.unshift(classLabel);
            }
        }
        metaLine.textContent = parts.filter(Boolean).join(' · ');

        const actions = document.createElement('div');
        actions.className = 'class-notes-preview-entry-actions';

        entry.appendChild(metaLine);
        entry.appendChild(actions);

        if (!isEditing) {
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

            const body = document.createElement('p');
            body.className = 'class-notes-preview-entry-body day-note-list-entry-body';
            body.textContent = note.text;
            entry.appendChild(body);
            return entry;
        }

        const editWrap = document.createElement('div');
        editWrap.className = 'class-notes-preview-entry-edit';
        const textarea = document.createElement('textarea');
        textarea.className = 'day-note-textarea class-notes-preview-edit-textarea';
        textarea.rows = 3;
        textarea.value = note.text;
        textarea.spellcheck = true;
        const editActions = document.createElement('div');
        editActions.className = 'class-notes-preview-entry-edit-actions';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-primary btn-small';
        saveBtn.textContent = t('classNotesSaveEdit');
        saveBtn.addEventListener('click', () => {
            const text = (textarea.value || '').trim();
            if (text) {
                onSaveEdit(note.id, text);
            }
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-outline btn-small';
        cancelBtn.textContent = t('classNotesCancelEdit');
        cancelBtn.addEventListener('click', () => onCancelEdit());

        editActions.appendChild(saveBtn);
        editActions.appendChild(cancelBtn);
        editWrap.appendChild(textarea);
        editWrap.appendChild(editActions);
        entry.appendChild(editWrap);
        return entry;
    }

    global.ClassNotesPanel = {
        FILTER_ATTR,
        buildPreviewEntry
    };
})(typeof window !== 'undefined' ? window : global);
