/**
 * Mobile day-notes page — date + scheduled classes + per-class note entry.
 */
(function () {
    let notesSelectedDate = '';
    let notesSelectedClassId = null;
    let notesEditingId = null;
    let notesMyClassesOnly = false;
    let notesClassSearchQuery = '';
    let notesDayIndexCache = null;
    /** Unsaved add-note text per class (survives list re-render / sync refresh). */
    const notesAddDraftByClass = Object.create(null);

    function captureNotesAddDraft() {
        const textEl = document.getElementById('notesAddText');
        if (!textEl || !notesSelectedClassId) {
            return;
        }
        notesAddDraftByClass[notesSelectedClassId] = textEl.value;
    }

    function clearNotesAddDraft(classId) {
        if (classId) {
            delete notesAddDraftByClass[classId];
        }
    }

    function bindNotesAddTextInput() {
        const textEl = document.getElementById('notesAddText');
        if (!textEl || textEl.dataset.notesInputBound === '1') {
            return;
        }
        textEl.dataset.notesInputBound = '1';
        textEl.addEventListener('input', () => {
            captureNotesAddDraft();
        });
    }

    function bindNotesAddMentionField() {
        const textEl = document.getElementById('notesAddText');
        if (!textEl || textEl.dataset.mentionInit === '1') {
            return;
        }
        if (typeof setupDayNoteMentionField !== 'function') {
            return;
        }
        textEl.dataset.mentionInit = '1';
        setupDayNoteMentionField(textEl, () => normalizeNotesClassId(notesSelectedClassId) || '');
    }

    function getParams() {
        return new URLSearchParams(location.search);
    }

    function normalizeNotesClassId(classId) {
        if (classId == null || classId === '') {
            return '';
        }
        return String(classId).trim();
    }

    function todayIso() {
        if (typeof window !== 'undefined' && window.CCPUtils && window.CCPUtils.formatDateISO) {
            return window.CCPUtils.formatDateISO(new Date());
        }
        if (typeof formatDateISO === 'function') {
            return formatDateISO(new Date());
        }
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function showNotesRemoteBanner(show) {
        const banner = document.getElementById('notesRemoteBanner');
        if (banner) {
            banner.hidden = !show;
        }
    }

    function showNotesInitError(message) {
        const banner = document.getElementById('notesInitErrorBanner');
        const textEl = document.getElementById('notesInitErrorText');
        if (textEl) {
            textEl.textContent = message || '';
        }
        if (banner) {
            banner.hidden = !message;
        }
    }

    function hideNotesInitError() {
        const banner = document.getElementById('notesInitErrorBanner');
        if (banner) {
            banner.hidden = true;
        }
    }

    function showNotesSyncHint(message) {
        const el = document.getElementById('notesSyncHint');
        if (!el) {
            return;
        }
        if (!message) {
            el.hidden = true;
            return;
        }
        el.textContent = message;
        el.hidden = false;
    }

    function hideNotesSyncHint() {
        showNotesSyncHint('');
    }

    function showNotesStatus(ok, message) {
        if (!message) {
            return;
        }
        if (window.CCPNotice && window.CCPNotice.show) {
            window.CCPNotice.show(message, {
                type: ok ? 'success' : 'error',
                duration: ok ? 2800 : 0,
                dismissible: !ok,
                force: true
            });
            return;
        }
        const el = document.getElementById('notesStatus');
        if (!el) {
            return;
        }
        el.hidden = false;
        el.textContent = message;
        el.classList.toggle('is-ok', !!ok);
        el.classList.toggle('is-error', !ok);
        clearTimeout(showNotesStatus._timer);
        showNotesStatus._timer = setTimeout(() => {
            el.hidden = true;
        }, 2800);
    }

    function isNotesEditorReadOnly(classId) {
        if (typeof isDayNoteWriteBlocked === 'function') {
            return isDayNoteWriteBlocked(classId || notesSelectedClassId);
        }
        return false;
    }

    function syncNotesReadOnlyBanner() {
        const el = document.getElementById('notesReadOnlyBanner');
        if (!el) {
            return;
        }
        const classId = notesSelectedClassId;
        const blocked = isNotesEditorReadOnly(classId);
        if (blocked) {
            el.hidden = false;
            el.textContent =
                typeof getDayNoteWriteBlockedMessage === 'function'
                    ? getDayNoteWriteBlockedMessage(classId)
                    : typeof t === 'function'
                      ? t('dayNoteReadOnlyHint')
                      : '';
        } else {
            el.hidden = true;
        }
        const saveBtn = document.getElementById('notesSaveBtn');
        const textEl = document.getElementById('notesAddText');
        [saveBtn, textEl].forEach((node) => {
            if (node) {
                node.disabled = blocked;
            }
        });
    }

    function getCurrentUserId() {
        if (typeof getDayNotesActorUserId === 'function') {
            return getDayNotesActorUserId();
        }
        try {
            if (typeof TeamAuth !== 'undefined' && TeamAuth.getUser) {
                const u = TeamAuth.getUser();
                if (u && u.id) {
                    return String(u.id);
                }
            }
        } catch (_) {
            /* ignore */
        }
        return '';
    }

    function classAssignedToUser(classData, userId) {
        if (!classData || !userId) {
            return false;
        }
        if (typeof isUserAssignedToClassForDayNotes === 'function') {
            return isUserAssignedToClassForDayNotes(classData, userId);
        }
        const teachers = classData.classTeachers;
        if (!Array.isArray(teachers)) {
            return String(classData.assignedTeacherUserId || '') === String(userId);
        }
        return teachers.some((row) => row && String(row.userId || '') === String(userId));
    }

    function lessonEntryAssignedToUser(entry, userId) {
        if (!entry || !userId) {
            return false;
        }
        const row = entry.teacherRow;
        const uid = String(userId);
        if (row && String(row.userId || '').trim()) {
            return String(row.userId) === uid;
        }
        return classAssignedToUser(entry.classData, uid);
    }

    function buildNotesDayIndexCache() {
        if (typeof ensureTermStartData === 'function') {
            ensureTermStartData();
        }
        if (typeof buildNotesDayIndex === 'function') {
            return buildNotesDayIndex();
        }
        if (typeof buildDayIndex === 'function') {
            return buildDayIndex();
        }
        return { scheduledLessons: {} };
    }

    function getScheduledLessonsForDate(dateStr, options = {}) {
        const skipMyFilter = Boolean(options.includeAllTeachers);
        try {
            if (!notesDayIndexCache) {
                notesDayIndexCache = buildNotesDayIndexCache();
            }
        } catch (err) {
            console.error('Notes buildDayIndex failed:', err);
            notesDayIndexCache = { scheduledLessons: {} };
        }
        const lessons = (notesDayIndexCache.scheduledLessons || {})[dateStr] || [];
        if (skipMyFilter || !notesMyClassesOnly) {
            return lessons;
        }
        const userId = getCurrentUserId();
        if (!userId) {
            return lessons;
        }
        return lessons.filter((entry) => lessonEntryAssignedToUser(entry, userId));
    }

    function invalidateDayIndexCache() {
        notesDayIndexCache = null;
    }

    let notesBeforeUnloadBound = false;

    function getActiveNotesCalendarId() {
        if (typeof CalendarSync !== 'undefined' && CalendarSync.getActiveCalendarId) {
            const id = CalendarSync.getActiveCalendarId();
            if (id) {
                return String(id);
            }
        }
        try {
            return localStorage.getItem('teamCalendarActiveId') || '';
        } catch (_) {
            return '';
        }
    }

    function saveNotesSessionState() {
        if (typeof CCPSessionRestore === 'undefined' || !CCPSessionRestore.saveNotesSession) {
            return;
        }
        CCPSessionRestore.saveNotesSession({
            date: notesSelectedDate,
            classId: notesSelectedClassId || '',
            myClassesOnly: notesMyClassesOnly,
            classSearch: notesClassSearchQuery,
            calendarId: getActiveNotesCalendarId()
        });
        if (CCPSessionRestore.capturePageSession) {
            CCPSessionRestore.capturePageSession();
        }
    }

    function bindNotesBeforeUnload() {
        if (notesBeforeUnloadBound || typeof window === 'undefined') {
            return;
        }
        notesBeforeUnloadBound = true;
        window.addEventListener('beforeunload', () => {
            captureNotesAddDraft();
            saveNotesSessionState();
        });
    }

    function resolveSelectedDate() {
        const input = document.getElementById('notesDateInput');
        const fromInput = input ? (input.value || '').trim() : '';
        if (fromInput) {
            return fromInput;
        }
        return notesSelectedDate || todayIso();
    }

    function shiftDateIso(dateStr, deltaDays) {
        if (typeof parseISODateLocal !== 'function' || typeof formatDateISO !== 'function') {
            return dateStr;
        }
        const d = parseISODateLocal(dateStr);
        if (!d) {
            return dateStr;
        }
        d.setDate(d.getDate() + deltaDays);
        return formatDateISO(d);
    }

    function setNotesDate(dateStr, options = {}) {
        const next = (dateStr || '').trim() || todayIso();
        notesSelectedDate = next;
        const input = document.getElementById('notesDateInput');
        if (input) {
            input.value = next;
        }
        if (!options.keepClass) {
            notesSelectedClassId = null;
            notesEditingId = null;
        }
        invalidateDayIndexCache();
        renderNotesClassList();
        if (notesSelectedClassId) {
            renderNotesEditor(notesSelectedClassId);
            setNotesEditorOpen(true);
        } else {
            hideNotesEditor();
        }
        saveNotesSessionState();
        if (!options.skipUrl && typeof history !== 'undefined' && history.replaceState) {
            const params = new URLSearchParams(location.search);
            params.set('date', next);
            if (notesSelectedClassId) {
                params.set('classId', notesSelectedClassId);
            } else {
                params.delete('classId');
            }
            const qs = params.toString();
            history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
        }
    }

    function selectNotesClass(classId) {
        openNotesEditorForClass(classId || null, {});
    }

    function getNotesEditorSheet() {
        return document.getElementById('notesEditorSheet');
    }

    function getNotesEditorBackdrop() {
        return document.getElementById('notesEditorBackdrop');
    }

    function revealNotesEditorSheet() {
        const sheet = getNotesEditorSheet();
        const backdrop = getNotesEditorBackdrop();
        const section = document.getElementById('notesEditorSection');
        if (sheet) {
            sheet.hidden = false;
            sheet.removeAttribute('hidden');
        }
        if (backdrop) {
            backdrop.hidden = false;
            backdrop.removeAttribute('hidden');
            backdrop.setAttribute('aria-hidden', 'false');
        }
        if (section) {
            section.hidden = false;
            section.removeAttribute('hidden');
        }
        document.body.classList.add('notes-editor-open');
        return Boolean(sheet && section);
    }

    function concealNotesEditorSheet() {
        const sheet = getNotesEditorSheet();
        const backdrop = getNotesEditorBackdrop();
        if (sheet) {
            sheet.hidden = true;
        }
        if (backdrop) {
            backdrop.hidden = true;
            backdrop.setAttribute('aria-hidden', 'true');
        }
        document.body.classList.remove('notes-editor-open');
    }

    function setNotesEditorOpen(open) {
        if (!open) {
            concealNotesEditorSheet();
            return false;
        }
        return revealNotesEditorSheet();
    }

    function closeNotesEditorSheet() {
        captureNotesAddDraft();
        setNotesEditorOpen(false);
        clearNotesClassSelection();
        const hint = document.getElementById('notesPickClassHint');
        if (hint) {
            hint.hidden = false;
        }
    }

    function clearNotesClassSelection(options = {}) {
        const skipUrl = options.skipUrl === true;
        const skipListRender = options.skipListRender === true;
        const skipSave = options.skipSave === true;
        notesSelectedClassId = null;
        notesEditingId = null;
        if (!skipUrl) {
            syncNotesUrlFromSelection('', notesSelectedDate || resolveSelectedDate());
        }
        if (!skipListRender) {
            renderNotesClassList();
        }
        if (!skipSave) {
            saveNotesSessionState();
        }
    }

    function findNotesClassRow(classId) {
        const listEl = document.getElementById('notesClassList');
        const id = normalizeNotesClassId(classId);
        if (!listEl || !id) {
            return null;
        }
        const escaped =
            typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
        return listEl.querySelector(`.notes-class-item[data-class-id="${escaped}"]`);
    }

    function focusNotesAddField() {
        const textEl = document.getElementById('notesAddText');
        const classId = normalizeNotesClassId(notesSelectedClassId);
        if (!textEl || !classId || isNotesEditorReadOnly(classId)) {
            return;
        }
        requestAnimationFrame(() => {
            if (
                normalizeNotesClassId(notesSelectedClassId) === classId
                && !isNotesEditorReadOnly(classId)
            ) {
                textEl.focus();
            }
        });
    }

    function openNotesEditorForClass(classId, options = {}) {
        const nextId = normalizeNotesClassId(classId) || null;
        const sameClass = nextId === normalizeNotesClassId(notesSelectedClassId);
        const skipListRender = options.skipListRender === true;
        const skipScroll = options.skipScroll === true;
        const skipFocus = options.skipFocus === true;
        const skipUrl = options.skipUrl === true;

        if (!nextId || !classExistsInAppData(nextId)) {
            if (!sameClass) {
                captureNotesAddDraft();
            }
            notesSelectedClassId = null;
            notesEditingId = null;
            if (!skipListRender) {
                renderNotesClassList();
            }
            hideNotesEditor();
            const hint = document.getElementById('notesPickClassHint');
            if (hint) {
                hint.hidden = false;
            }
            saveNotesSessionState();
            if (!skipUrl) {
                syncNotesUrlFromSelection('', notesSelectedDate || resolveSelectedDate());
            }
            return;
        }

        if (!sameClass) {
            captureNotesAddDraft();
            notesEditingId = null;
        }
        notesSelectedClassId = nextId;
        if (!skipListRender) {
            renderNotesClassList();
        }
        renderNotesEditor(nextId);
        setNotesEditorOpen(true);
        const hint = document.getElementById('notesPickClassHint');
        if (hint) {
            hint.hidden = true;
        }
        if (!skipScroll && !sameClass) {
            scrollNotesSelectionIntoView(nextId);
        }
        if (!skipFocus) {
            focusNotesAddField();
        } else if (options.preserveFocus === true) {
            const textEl = document.getElementById('notesAddText');
            if (textEl && document.activeElement === textEl) {
                textEl.focus();
            }
        }
        saveNotesSessionState();
        if (!skipUrl) {
            syncNotesUrlFromSelection(nextId, notesSelectedDate || resolveSelectedDate());
        }
    }

    function classExistsInAppData(classId) {
        const id = normalizeNotesClassId(classId);
        if (!id || typeof appData === 'undefined' || !Array.isArray(appData.classes)) {
            return false;
        }
        return appData.classes.some((c) => c && normalizeNotesClassId(c.id) === id);
    }

    function resolveNotesRestoreSelection() {
        const resolved = resolveInitialNotesDate();
        const dateStr = (notesSelectedDate || resolved.dateStr || '').trim() || todayIso();
        return { dateStr };
    }

    function syncNotesUrlFromSelection(classId, dateStr) {
        if (typeof history === 'undefined' || !history.replaceState) {
            return;
        }
        const params = new URLSearchParams(location.search);
        if (dateStr) {
            params.set('date', dateStr);
        }
        if (classId) {
            params.set('classId', classId);
        } else {
            params.delete('classId');
        }
        const qs = params.toString();
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    }

    function applyPersistedNotesChrome(dateStr) {
        applyInitialNotesDate(dateStr);
        const myOnlyEl = document.getElementById('notesMyClassesOnly');
        if (myOnlyEl) {
            myOnlyEl.checked = notesMyClassesOnly;
        }
        syncNotesClassSearchInput();
    }

    function handleNotesMyClassesOnlyChange() {
        const myOnly = document.getElementById('notesMyClassesOnly');
        const editorWasOpen = document.body.classList.contains('notes-editor-open');
        notesMyClassesOnly = myOnly ? myOnly.checked : false;
        invalidateDayIndexCache();
        renderNotesClassList();
        const selectedId = normalizeNotesClassId(notesSelectedClassId);
        if (
            editorWasOpen
            && selectedId
            && classExistsInAppData(selectedId)
            && isSelectedClassVisibleInNotesList(selectedId)
        ) {
            renderNotesEditor(selectedId);
            setNotesEditorOpen(true);
        } else if (editorWasOpen) {
            hideNotesEditor();
        }
        saveNotesSessionState();
    }

    function scrollNotesSelectionIntoView(classId) {
        if (!classId) {
            return;
        }
        const listEl = document.getElementById('notesClassList');
        if (!listEl) {
            return;
        }
        const escaped =
            typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(classId) : classId.replace(/"/g, '\\"');
        const row = findNotesClassRow(classId);
        if (!row) {
            return;
        }
        requestAnimationFrame(() => {
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
    }

    function hideNotesEditor() {
        setNotesEditorOpen(false);
        const hint = document.getElementById('notesPickClassHint');
        if (hint) {
            hint.hidden = false;
        }
    }

    function reopenNotesEditorAfterDayNotesChange(options = {}) {
        const classId = normalizeNotesClassId(notesSelectedClassId);
        if (!classId || !classExistsInAppData(classId)) {
            return;
        }
        notesSelectedClassId = classId;
        invalidateDayIndexCache();
        if (!options.skipListRender) {
            renderNotesClassList();
        }
        renderNotesEditor(classId);
        setNotesEditorOpen(true);
        const hint = document.getElementById('notesPickClassHint');
        if (hint) {
            hint.hidden = true;
        }
        syncNotesReadOnlyBanner();
    }

    function buildNotesPreviewEntry(note, api) {
        const panel = typeof ClassNotesPanel !== 'undefined' ? ClassNotesPanel : null;
        if (!panel || !panel.buildPreviewEntry) {
            return document.createElement('div');
        }
        const readOnly =
            typeof canUserEditDayNoteEntry === 'function'
                ? !canUserEditDayNoteEntry(note)
                : isNotesEditorReadOnly(notesSelectedClassId);
        return panel.buildPreviewEntry(note, api, {
            showClassInMeta: false,
            readOnly,
            isEditing: notesEditingId === note.id,
            t,
            formatDateDisplay,
            resolveDayNoteMeta,
            currentLanguage,
            onEdit: (id) => {
                notesEditingId = id;
                reopenNotesEditorAfterDayNotesChange({ skipListRender: true });
            },
            onDelete: (id) => {
                if (!confirm(t('classNotesConfirmDelete'))) {
                    return;
                }
                if (typeof deleteClassDayNote === 'function' && deleteClassDayNote(id)) {
                    showNotesStatus(true, t('classNotesDeleted'));
                    reopenNotesEditorAfterDayNotesChange();
                }
            },
            onSaveEdit: (id, text, classId, categoryId) => {
                const note = appData.dayNotes.find((n) => n && n.id === id);
                const cid = classId || (note && note.classId) || '';
                const taggedStudentIds =
                    typeof syncDayNoteTaggedStudentIds === 'function'
                        ? syncDayNoteTaggedStudentIds(text, cid)
                        : [];
                const patch = {
                    text,
                    categoryId: categoryId || (note && note.categoryId) || 'class-notes'
                };
                if (taggedStudentIds.length) {
                    patch.taggedStudentIds = taggedStudentIds;
                } else {
                    patch.taggedStudentIds = [];
                }
                if (typeof updateClassDayNote === 'function' && updateClassDayNote(id, patch)) {
                    notesEditingId = null;
                    showNotesStatus(true, t('classNotesUpdated'));
                    reopenNotesEditorAfterDayNotesChange();
                }
            },
            onCancelEdit: () => {
                notesEditingId = null;
                reopenNotesEditorAfterDayNotesChange({ skipListRender: true });
            },
            renderNoteHtml:
                typeof renderDayNoteTextHtml === 'function' ? renderDayNoteTextHtml : undefined,
            buildCategoryBadgeHtml:
                typeof buildDayNoteCategoryBadgeHtml === 'function'
                    ? buildDayNoteCategoryBadgeHtml
                    : undefined,
            populateCategorySelect:
                typeof populateDayNoteCategorySelect === 'function'
                    ? populateDayNoteCategorySelect
                    : undefined,
            getCategorySelectValue:
                typeof getSelectedDayNoteCategoryId === 'function'
                    ? getSelectedDayNoteCategoryId
                    : undefined,
            setupMentionField:
                typeof setupDayNoteMentionField === 'function' ? setupDayNoteMentionField : undefined
        });
    }

    function renderNotesEditor(classId) {
        const section = document.getElementById('notesEditorSection');
        const hint = document.getElementById('notesPickClassHint');
        const titleEl = document.getElementById('notesEditorTitle');
        const metaEl = document.getElementById('notesEditorMeta');
        const listEl = document.getElementById('notesExistingList');
        const textEl = document.getElementById('notesAddText');
        if (!section || !classId) {
            hideNotesEditor();
            return;
        }
        const dateStr = resolveSelectedDate();
        const meta = typeof resolveDayNoteMeta === 'function'
            ? resolveDayNoteMeta(classId)
            : { className: '', subject: '', homeroomLabel: '' };
        if (titleEl) {
            titleEl.textContent = meta.className || classId;
        }
        if (metaEl) {
            const parts = [typeof formatDateDisplay === 'function' ? formatDateDisplay(dateStr) : dateStr];
            if (meta.subject) {
                parts.push(meta.subject);
            }
            if (meta.homeroomLabel) {
                parts.push(meta.homeroomLabel);
            }
            metaEl.textContent = parts.join(' · ');
        }
        if (hint) {
            hint.hidden = true;
        }
        const api = typeof getDayNotesApi === 'function' ? getDayNotesApi() : null;
        if (typeof ensureDayNotesArray === 'function') {
            ensureDayNotesArray();
        }
        const notes = api ? api.getNotesForClassOnDate(appData.dayNotes, classId, dateStr) : [];
        if (listEl) {
            listEl.replaceChildren();
            notes.forEach((note) => {
                listEl.appendChild(buildNotesPreviewEntry(note, api));
            });
        }
        if (textEl && !notesEditingId) {
            const hadFocus = document.activeElement === textEl;
            const draft = notesAddDraftByClass[classId];
            if (draft != null && String(draft).length > 0) {
                textEl.value = draft;
            } else if (!hadFocus) {
                textEl.value = '';
            }
        }
        bindNotesAddTextInput();
        bindNotesAddMentionField();
        syncNotesReadOnlyBanner();
    }

    function normalizeNotesSearchQuery(query) {
        return String(query || '').trim().toLowerCase();
    }

    function getNotesClassDisplayName(classData, lessonByClassId) {
        if (!classData) {
            return '';
        }
        const lessonEntry =
            lessonByClassId && lessonByClassId.get ? lessonByClassId.get(classData.id) : null;
        return (
            (lessonEntry && (lessonEntry.calendarTitle || lessonEntry.classData?.name)) ||
            (typeof formatClassLabelWithPeriod === 'function'
                ? formatClassLabelWithPeriod(classData)
                : '') ||
            classData.name ||
            classData.id ||
            ''
        );
    }

    function classMatchesNotesSearch(classData, lessonByClassId, query) {
        const q = normalizeNotesSearchQuery(query);
        if (!q || !classData) {
            return true;
        }
        const subject =
            typeof getClassSubjectForDayNotes === 'function'
                ? getClassSubjectForDayNotes(classData)
                : '';
        const haystack = [
            getNotesClassDisplayName(classData, lessonByClassId),
            subject,
            classData.name,
            classData.id
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return haystack.includes(q);
    }

    function filterNotesClassGroupsForSearch(groups, query) {
        const q = normalizeNotesSearchQuery(query);
        if (!q) {
            return groups;
        }
        const filterList = (list) =>
            (list || []).filter((classData) =>
                classMatchesNotesSearch(classData, groups.lessonByClassId, q)
            );
        const onDay = filterList(groups.onDay);
        const offDay = filterList(groups.offDay);
        return {
            onDay,
            offDay,
            lessonByClassId: groups.lessonByClassId,
            totalCount: onDay.length + offDay.length
        };
    }

    function isSelectedClassVisibleInNotesList(classId) {
        const id = normalizeNotesClassId(classId);
        if (!id) {
            return false;
        }
        try {
            const groups = filterNotesClassGroupsForSearch(
                getNotesListGroupsForUi(resolveSelectedDate()),
                notesClassSearchQuery
            );
            return groups.onDay.concat(groups.offDay).some(
                (classData) => classData && normalizeNotesClassId(classData.id) === id
            );
        } catch (_) {
            return classExistsInAppData(id);
        }
    }

    function syncNotesClassSearchInput() {
        const input = document.getElementById('notesClassSearch');
        if (input && input.value !== notesClassSearchQuery) {
            input.value = notesClassSearchQuery;
        }
    }

    function getNotesListGroupsForUi(dateStr) {
        if (typeof getNotesClassListGroupsForDate !== 'function') {
            return { onDay: [], offDay: [], lessonByClassId: new Map(), totalCount: 0 };
        }
        try {
            if (!notesDayIndexCache) {
                notesDayIndexCache = buildNotesDayIndexCache();
            }
        } catch (err) {
            console.error('Notes buildDayIndex failed:', err);
            notesDayIndexCache = { scheduledLessons: {} };
        }
        return getNotesClassListGroupsForDate(dateStr, {
            myClassesOnly: notesMyClassesOnly,
            userId: getCurrentUserId(),
            dayIndex: notesDayIndexCache
        });
    }

    function appendNotesClassRow(listEl, classData, dateStr, lessonByClassId) {
        if (!listEl || !classData || !classData.id) {
            return;
        }
        const lessonEntry = lessonByClassId && lessonByClassId.get
            ? lessonByClassId.get(classData.id)
            : null;
        const row = document.createElement('div');
        row.className = 'notes-class-item';
        row.role = 'listitem';
        row.dataset.classId = normalizeNotesClassId(classData.id);
        if (normalizeNotesClassId(notesSelectedClassId) === normalizeNotesClassId(classData.id)) {
            row.classList.add('is-selected');
        }
        const title = document.createElement('span');
        title.className = 'notes-class-item-title';
        const displayName = getNotesClassDisplayName(classData, lessonByClassId);
        title.textContent = displayName;
        const meta = document.createElement('span');
        meta.className = 'notes-class-item-meta';
        const metaParts = [];
        if (lessonEntry && lessonEntry.lesson && lessonEntry.lesson.lessonNumber != null) {
            const lessonLabel =
                typeof t === 'function'
                    ? t('notesLessonLabel').replace('{n}', String(lessonEntry.lesson.lessonNumber))
                    : 'Lesson ' + lessonEntry.lesson.lessonNumber;
            metaParts.push(lessonLabel);
        }
        const subject =
            typeof getClassSubjectForDayNotes === 'function'
                ? getClassSubjectForDayNotes(classData)
                : '';
        if (subject) {
            metaParts.push(subject);
        }
        meta.textContent = metaParts.join(' · ');
        row.appendChild(title);
        if (metaParts.length) {
            row.appendChild(meta);
        }
        if (typeof classHasDayNoteOnDate === 'function' && classHasDayNoteOnDate(classData.id, dateStr)) {
            row.classList.add('notes-class-item--has-note');
            row.setAttribute('aria-label', (title.textContent || '') + ' — has notes');
        }
        row.addEventListener('click', (ev) => {
            ev.preventDefault();
            selectNotesClass(classData.id);
        });
        if (global.CCPClassColorTile) {
            global.CCPClassColorTile.apply(row, classData, {
                selected: normalizeNotesClassId(notesSelectedClassId) === normalizeNotesClassId(classData.id)
            });
        }
        listEl.appendChild(row);
    }

    function renderNotesClassList() {
        const listEl = document.getElementById('notesClassList');
        const emptyEl = document.getElementById('notesClassListEmpty');
        if (!listEl) {
            return;
        }
        const dateStr = resolveSelectedDate();
        notesSelectedDate = dateStr;
        let groups;
        try {
            groups = filterNotesClassGroupsForSearch(
                getNotesListGroupsForUi(dateStr),
                notesClassSearchQuery
            );
        } catch (err) {
            console.error('Notes class list groups failed:', err);
            groups = { onDay: [], offDay: [], lessonByClassId: new Map(), totalCount: 0 };
        }
        const { onDay, offDay, lessonByClassId, totalCount } = groups;
        const allClasses = onDay.concat(offDay);
        const searchActive = normalizeNotesSearchQuery(notesClassSearchQuery).length > 0;
        listEl.replaceChildren();

        if (emptyEl) {
            let emptyMessage =
                typeof t === 'function' ? t('notesNoClasses') : 'No classes in this calendar.';
            if (searchActive && totalCount === 0) {
                emptyMessage =
                    typeof t === 'function' ? t('notesNoSearchMatch') : 'No classes match your search.';
            } else if (totalCount === 0 && notesMyClassesOnly) {
                const uid = getCurrentUserId();
                if (!uid) {
                    emptyMessage =
                        typeof t === 'function' ? t('notesMyClassesSignIn') : emptyMessage;
                } else {
                    const allGroups =
                        typeof getNotesClassListGroupsForDate === 'function'
                            ? getNotesClassListGroupsForDate(dateStr, {
                                  myClassesOnly: false,
                                  dayIndex: notesDayIndexCache
                              })
                            : null;
                    if (allGroups && allGroups.totalCount > 0) {
                        emptyMessage =
                            typeof t === 'function' ? t('notesNoMyClassesOnDay') : emptyMessage;
                    }
                }
            }
            emptyEl.textContent = emptyMessage;
            emptyEl.hidden = totalCount > 0;
        }

        const appendSectionTitle = (label, options = {}) => {
            const el = document.createElement('div');
            el.className =
                'module-list-section-title' +
                (options.divider ? ' module-list-section-title--divider' : '');
            el.textContent = label;
            listEl.appendChild(el);
        };

        if (onDay.length > 0) {
            appendSectionTitle(
                (typeof t === 'function' && t('homeworkTabSelectedDateClasses')) ||
                    "Selected date's classes"
            );
            onDay.forEach((classData) => {
                appendNotesClassRow(listEl, classData, dateStr, lessonByClassId);
            });
        }
        const otherClasses = onDay.length > 0 ? offDay : allClasses;
        if (otherClasses.length > 0) {
            appendSectionTitle(
                (typeof t === 'function' && t('homeworkTabOtherClasses')) || 'Other classes',
                { divider: onDay.length > 0 }
            );
            otherClasses.forEach((classData) => {
                appendNotesClassRow(listEl, classData, dateStr, lessonByClassId);
            });
        }
    }

    /** Fix broken markup like `??/button>` from bad saves / wrong encoding. */
    function repairCorruptedNotesMarkup() {
        const buttonRepairs = [
            {
                id: 'notesLangToggle',
                className: 'btn btn-outline btn-small btn-lang',
                attrs: { 'data-i18n': 'langToggle' }
            },
            {
                id: 'notesThemeToggle',
                className: 'btn btn-outline btn-small btn-header-theme',
                attrs: { 'data-i18n': 'themeDark' }
            },
            {
                id: 'notesPrevDayBtn',
                className: 'btn btn-outline btn-small notes-day-nav-btn',
                text: '\u2039',
                attrs: { 'aria-label': 'Previous day' }
            },
            {
                id: 'notesNextDayBtn',
                className: 'btn btn-outline btn-small notes-day-nav-btn',
                text: '\u203A',
                attrs: { 'aria-label': 'Next day' }
            },
            {
                id: 'notesEditorCloseBtn',
                className: 'btn btn-outline btn-small notes-editor-close-btn',
                text: '\u00D7',
                attrs: { 'data-i18n-aria-label': 'notesEditorClose' }
            }
        ];
        buttonRepairs.forEach(({ id, className, text, attrs }) => {
            const btn = document.getElementById(id);
            if (!btn || btn.tagName !== 'BUTTON') {
                return;
            }
            const raw = btn.outerHTML || '';
            if (raw.includes('/button>') && !raw.toLowerCase().includes('</button>')) {
                const parent = btn.parentNode;
                if (!parent) {
                    return;
                }
                const next = document.createElement('button');
                next.id = id;
                next.type = 'button';
                next.className = className;
                if (text) {
                    next.textContent = text;
                }
                if (attrs) {
                    Object.entries(attrs).forEach(([key, value]) => {
                        next.setAttribute(key, value);
                    });
                }
                parent.replaceChild(next, btn);
            }
        });
        const search = document.getElementById('notesClassSearch');
        if (search) {
            const placeholder = search.getAttribute('placeholder') || '';
            if (!placeholder || placeholder.includes('??')) {
                search.setAttribute('placeholder', 'Search classes\u2026');
            }
        }
    }

    function setupNotesChrome() {
        const label = document.getElementById('notesCalendarLabel');
        if (label && typeof appData !== 'undefined') {
            label.textContent = appData.calendarName || '';
        }
        const langBtn = document.getElementById('notesLangToggle');
        if (langBtn && langBtn.dataset.bound !== '1') {
            langBtn.dataset.bound = '1';
            langBtn.addEventListener('click', () => {
                if (typeof toggleLanguage === 'function') {
                    toggleLanguage();
                    applyLanguage();
                    renderNotesClassList();
                    if (notesSelectedClassId) {
                        renderNotesEditor(notesSelectedClassId);
                        setNotesEditorOpen(true);
                    }
                }
            });
        }
        const themeBtn = document.getElementById('notesThemeToggle');
        if (themeBtn && themeBtn.dataset.bound !== '1') {
            themeBtn.dataset.bound = '1';
            themeBtn.addEventListener('click', () => {
                if (typeof toggleTheme === 'function') {
                    toggleTheme();
                }
            });
        }
        const reloadBtn = document.getElementById('notesReloadBtn');
        if (reloadBtn && reloadBtn.dataset.bound !== '1') {
            reloadBtn.dataset.bound = '1';
            reloadBtn.addEventListener('click', async () => {
                if (typeof reloadNotesCalendar === 'function') {
                    await reloadNotesCalendar();
                }
            });
        }
        const retryBtn = document.getElementById('notesInitRetryBtn');
        if (retryBtn && retryBtn.dataset.bound !== '1') {
            retryBtn.dataset.bound = '1';
            retryBtn.addEventListener('click', () => {
                location.reload();
            });
        }
    }

    function bindNotesEditorSheetControls() {
        const closeBtn = document.getElementById('notesEditorCloseBtn');
        if (closeBtn && closeBtn.dataset.bound !== '1') {
            closeBtn.dataset.bound = '1';
            closeBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                closeNotesEditorSheet();
            });
        }
        const backdrop = getNotesEditorBackdrop();
        if (backdrop && backdrop.dataset.bound !== '1') {
            backdrop.dataset.bound = '1';
            backdrop.addEventListener('pointerup', (ev) => {
                if (ev.target !== backdrop) {
                    return;
                }
                closeNotesEditorSheet();
            });
        }
        const sheet = getNotesEditorSheet();
        if (sheet && sheet.dataset.bound !== '1') {
            sheet.dataset.bound = '1';
            const stopBackdropDismiss = (ev) => {
                ev.stopPropagation();
            };
            sheet.addEventListener('pointerdown', stopBackdropDismiss);
            sheet.addEventListener('click', stopBackdropDismiss);
        }
        if (!bindNotesEditorSheetControls._escapeBound) {
            bindNotesEditorSheetControls._escapeBound = true;
            document.addEventListener('keydown', (ev) => {
                if (ev.key !== 'Escape' || !document.body.classList.contains('notes-editor-open')) {
                    return;
                }
                ev.preventDefault();
                closeNotesEditorSheet();
            });
        }
    }

    function bindNotesControls() {
        bindNotesEditorSheetControls();
        const dateInput = document.getElementById('notesDateInput');
        if (dateInput && dateInput.dataset.bound !== '1') {
            dateInput.dataset.bound = '1';
            dateInput.addEventListener('change', () => {
                setNotesDate(dateInput.value, { skipUrl: false });
            });
        }
        const todayBtn = document.getElementById('notesTodayBtn');
        if (todayBtn && todayBtn.dataset.bound !== '1') {
            todayBtn.dataset.bound = '1';
            todayBtn.addEventListener('click', () => setNotesDate(todayIso()));
        }
        const myClassesTodayBtn = document.getElementById('notesMyClassesTodayBtn');
        if (myClassesTodayBtn && myClassesTodayBtn.dataset.bound !== '1') {
            myClassesTodayBtn.dataset.bound = '1';
            myClassesTodayBtn.addEventListener('click', () => {
                notesMyClassesOnly = true;
                const myOnlyEl = document.getElementById('notesMyClassesOnly');
                if (myOnlyEl) {
                    myOnlyEl.checked = true;
                }
                setNotesDate(todayIso());
                saveNotesSessionState();
            });
        }
        const prevBtn = document.getElementById('notesPrevDayBtn');
        if (prevBtn && prevBtn.dataset.bound !== '1') {
            prevBtn.dataset.bound = '1';
            prevBtn.addEventListener('click', () => {
                setNotesDate(shiftDateIso(resolveSelectedDate(), -1));
            });
        }
        const nextBtn = document.getElementById('notesNextDayBtn');
        if (nextBtn && nextBtn.dataset.bound !== '1') {
            nextBtn.dataset.bound = '1';
            nextBtn.addEventListener('click', () => {
                setNotesDate(shiftDateIso(resolveSelectedDate(), 1));
            });
        }
        const myOnly = document.getElementById('notesMyClassesOnly');
        const myOnlyLabel = document.getElementById('notesMyClassesOnlyLabel');
        if (myOnlyLabel && myOnlyLabel.dataset.bound !== '1') {
            myOnlyLabel.dataset.bound = '1';
            ['pointerdown', 'click', 'touchstart'].forEach((type) => {
                myOnlyLabel.addEventListener(
                    type,
                    (ev) => {
                        ev.stopPropagation();
                    },
                    { passive: type === 'touchstart' }
                );
            });
        }
        if (myOnly && myOnly.dataset.bound !== '1') {
            myOnly.dataset.bound = '1';
            myOnly.addEventListener('change', (ev) => {
                ev.stopPropagation();
                handleNotesMyClassesOnlyChange();
            });
            myOnly.addEventListener('click', (ev) => {
                ev.stopPropagation();
            });
        }
        const classSearch = document.getElementById('notesClassSearch');
        if (classSearch && classSearch.dataset.bound !== '1') {
            classSearch.dataset.bound = '1';
            classSearch.addEventListener('input', () => {
                notesClassSearchQuery = classSearch.value || '';
                renderNotesClassList();
                saveNotesSessionState();
            });
            classSearch.addEventListener('click', (ev) => {
                ev.stopPropagation();
            });
            classSearch.addEventListener('keydown', (ev) => {
                ev.stopPropagation();
            });
        }
        const saveBtn = document.getElementById('notesSaveBtn');
        if (saveBtn && saveBtn.dataset.bound !== '1') {
            saveBtn.dataset.bound = '1';
            saveBtn.addEventListener('click', () => {
                const classId = notesSelectedClassId;
                const textEl = document.getElementById('notesAddText');
                const text = textEl ? (textEl.value || '').trim() : '';
                if (!classId || !text) {
                    return;
                }
                if (typeof appendClassDayNote !== 'function') {
                    return;
                }
                const ok = appendClassDayNote({
                    classId,
                    dateStr: resolveSelectedDate(),
                    text,
                    createdAt: new Date().toISOString(),
                    taggedStudentIds:
                        typeof syncDayNoteTaggedStudentIds === 'function'
                            ? syncDayNoteTaggedStudentIds(text, classId)
                            : []
                });
                if (!ok) {
                    return;
                }
                if (textEl) {
                    textEl.value = '';
                }
                clearNotesAddDraft(classId);
                const msg = typeof isViewAsSession === 'function' && isViewAsSession()
                    ? t('classNotesSavedViewAs')
                    : t('classNotesSaved');
                showNotesStatus(true, msg);
                reopenNotesEditorAfterDayNotesChange();
                const textElAfterSave = document.getElementById('notesAddText');
                if (textElAfterSave && !isNotesEditorReadOnly(classId)) {
                    requestAnimationFrame(() => {
                        if (
                            normalizeNotesClassId(notesSelectedClassId) === normalizeNotesClassId(classId)
                            && !isNotesEditorReadOnly(classId)
                        ) {
                            textElAfterSave.focus();
                        }
                    });
                }
                saveNotesSessionState();
            });
        }
    }

    function resolveInitialNotesDate() {
        const params = getParams();
        let dateStr = (params.get('date') || '').trim();
        if (
            typeof CCPSessionRestore !== 'undefined'
            && CCPSessionRestore.getNotesSession
        ) {
            const saved = CCPSessionRestore.getNotesSession();
            if (saved) {
                if (!dateStr && saved.date) {
                    dateStr = saved.date;
                }
                if (saved.myClassesOnly != null) {
                    notesMyClassesOnly = Boolean(saved.myClassesOnly);
                }
                if (saved.classSearch != null) {
                    notesClassSearchQuery = String(saved.classSearch);
                }
            }
        }
        if (!dateStr) {
            dateStr = todayIso();
        }
        return { dateStr };
    }

    function applyInitialNotesDate(dateStr) {
        const next = (dateStr || '').trim() || todayIso();
        notesSelectedDate = next;
        const input = document.getElementById('notesDateInput');
        if (input) {
            input.value = next;
        }
    }

    window.finalizeNotesPageBoot = function finalizeNotesPageBoot(options = {}) {
        if (!document.body.classList.contains('notes-page')) {
            return;
        }
        const initialBoot = options.initialBoot === true;
        const editorWasOpen = document.body.classList.contains('notes-editor-open');
        const preserveFocus = options.preserveFocus === true;
        const textEl = document.getElementById('notesAddText');
        const typingInAddField = preserveFocus && textEl && document.activeElement === textEl;
        if (preserveFocus) {
            captureNotesAddDraft();
        }

        const { dateStr } = resolveNotesRestoreSelection();
        applyPersistedNotesChrome(dateStr);

        if (options.invalidateIndex !== false) {
            invalidateDayIndexCache();
        }
        setupNotesChrome();
        syncNotesReadOnlyBanner();

        let classId = '';
        if (initialBoot) {
            notesSelectedClassId = null;
            syncNotesUrlFromSelection('', dateStr);
        } else {
            const inMemoryId = normalizeNotesClassId(notesSelectedClassId);
            if (editorWasOpen && inMemoryId && classExistsInAppData(inMemoryId)) {
                classId = inMemoryId;
            } else {
                notesSelectedClassId = null;
                syncNotesUrlFromSelection('', dateStr);
            }
        }

        try {
            renderNotesClassList();
        } catch (err) {
            console.error('Notes class list render failed:', err);
        }

        if (classId) {
            notesSelectedClassId = classId;
            renderNotesEditor(classId);
            setNotesEditorOpen(true);
            const hint = document.getElementById('notesPickClassHint');
            if (hint) {
                hint.hidden = true;
            }
            if (!typingInAddField) {
                focusNotesAddField();
            } else if (typingInAddField && textEl) {
                textEl.focus();
            }
            saveNotesSessionState();
        } else {
            hideNotesEditor();
            const hint = document.getElementById('notesPickClassHint');
            if (hint) {
                hint.hidden = false;
            }
            saveNotesSessionState();
        }
    };

    window.syncNotesLockReadOnlyState = function syncNotesLockReadOnlyState() {
        if (!document.body.classList.contains('notes-page')) {
            return;
        }
        syncNotesReadOnlyBanner();
    };

    window.refreshNotesEditorAfterDayNotesChange = function refreshNotesEditorAfterDayNotesChange() {
        if (!document.body.classList.contains('notes-page')) {
            return;
        }
        if (!normalizeNotesClassId(notesSelectedClassId)) {
            window.finalizeNotesPageBoot({ invalidateIndex: true, preserveFocus: false });
            return;
        }
        reopenNotesEditorAfterDayNotesChange();
    };

    window.refreshNotesPageUi = function refreshNotesPageUi() {
        window.finalizeNotesPageBoot({
            invalidateIndex: true,
            preserveFocus: true
        });
    };

    window.initNotesPage = async function initNotesPage() {
        let syncWarning = '';

        if (typeof loadLanguage === 'function') {
            loadLanguage();
        }
        if (typeof loadTheme === 'function') {
            loadTheme();
        }

        repairCorruptedNotesMarkup();

        bindNotesControls();
        bindNotesAddTextInput();
        bindNotesAddMentionField();
        bindNotesBeforeUnload();
        const urlDate = (getParams().get('date') || '').trim();
        if (urlDate) {
            applyInitialNotesDate(urlDate);
        }

        if (typeof TeamAuth !== 'undefined' && location.protocol !== 'file:') {
            try {
                await TeamAuth.ensure();
            } catch (e) {
                if (e && e.message === 'redirect') {
                    return;
                }
            }
        }

        if (typeof loadData === 'function') {
            loadData();
        }

        try {
            if (typeof initTeamSync === 'function') {
                await initTeamSync();
            }
            if (typeof ensureActiveCalendarLoaded === 'function') {
                await ensureActiveCalendarLoaded({
                    forceIfStale:
                        !Array.isArray(appData.classes) || appData.classes.length === 0
                });
            }
        } catch (err) {
            console.error('Notes team sync failed:', err);
            const syncMsg = typeof t === 'function' ? t('syncError') : 'Sync error';
            syncWarning = `${syncMsg}: ${err.message || err}`;
        } finally {
            if (typeof finishTeamSyncBoot === 'function') {
                finishTeamSyncBoot();
            }
        }

        if (typeof TeamAuth !== 'undefined' && location.protocol !== 'file:') {
            try {
                if (typeof ensureTeamTeacherAccountsLoaded === 'function') {
                    await ensureTeamTeacherAccountsLoaded();
                }
                if (
                    typeof linkClassTeachersToTeamAccounts === 'function'
                    && linkClassTeachersToTeamAccounts()
                ) {
                    if (
                        typeof teamSyncEnabled !== 'undefined'
                        && teamSyncEnabled
                        && typeof CalendarSync !== 'undefined'
                        && CalendarSync.scheduleSave
                    ) {
                        CalendarSync.scheduleSave();
                    } else if (typeof saveData === 'function') {
                        saveData();
                    }
                }
            } catch (_) {
                /* teacher account list optional */
            }
        }

        try {
            if (typeof ensureTermStartData === 'function') {
                ensureTermStartData();
            }
            if (typeof applyLanguage === 'function') {
                applyLanguage();
            }
            setupNotesChrome();
            window.finalizeNotesPageBoot({
                invalidateIndex: false,
                preserveFocus: false,
                initialBoot: true
            });

            if (typeof CCPSessionRestore !== 'undefined' && CCPSessionRestore.capturePageSession) {
                CCPSessionRestore.capturePageSession();
            }

            hideNotesInitError();
            if (syncWarning) {
                showNotesSyncHint(syncWarning);
            } else {
                hideNotesSyncHint();
            }
        } catch (uiErr) {
            console.error('Notes UI failed:', uiErr);
            const base = typeof t === 'function' ? t('notesLoadFailed') : 'Could not load notes.';
            const detail = uiErr && uiErr.message ? ` (${uiErr.message})` : '';
            showNotesInitError(base + detail);
            if (syncWarning) {
                showNotesSyncHint(syncWarning);
            }
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        if (!document.body.classList.contains('notes-page')) {
            return;
        }
        repairCorruptedNotesMarkup();
        if (typeof initNotesPage === 'function') {
            initNotesPage().catch((err) => {
                console.error('initNotesPage failed:', err);
                const base = typeof t === 'function' ? t('notesLoadFailed') : 'Could not load notes.';
                const detail = err && err.message ? ` (${err.message})` : '';
                showNotesInitError(base + detail);
            });
        }
    });
})();
