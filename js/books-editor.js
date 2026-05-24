/**
 * Books — curriculum page data (Write Now, Write Right, etc.) used by class syllabi.
 * window.CCPBooksEditor
 */
(function (global) {
    let hooks = {
        getAppData: () => ({}),
        saveData: () => {},
        t: (k) => k,
        getLang: () => 'en',
        openModal: () => {},
        closeModal: () => {},
        onBooksSaved: () => {}
    };

    function init(options = {}) {
        hooks = { ...hooks, ...options };
    }

    function getAppData() {
        return hooks.getAppData() || {};
    }

    function ensureBookOverrides(appData) {
        const data = appData || getAppData();
        if (!data.bookOverrides || typeof data.bookOverrides !== 'object') {
            data.bookOverrides = {};
        }
        return data.bookOverrides;
    }

    function slugifyBookKey(text) {
        return (text || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'book';
    }

    /** Strip trailing book number / level tag for series grouping. */
    function bookSeriesBaseName(defaultBook, fallbackName) {
        const raw = (defaultBook || fallbackName || '').trim();
        if (!raw) {
            return fallbackName || 'Book';
        }
        return raw
            .replace(/\s+\d+\s*$/i, '')
            .replace(/\s*\((green|blue|navy|red|orange|yellow|purple)\)\s*$/i, '')
            .trim() || raw;
    }

    function deriveBookKey(preset) {
        const base = bookSeriesBaseName(preset.defaultBook, preset.fallbackName || preset.name);
        return slugifyBookKey(base);
    }

    function deepClone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function getFactoryPresetById(id) {
        if (global.CCPSyllabusPresets && global.CCPSyllabusPresets.getById) {
            return global.CCPSyllabusPresets.getById(id);
        }
        return null;
    }

    function normalizeRowTemplates(rows) {
        return (rows || []).map((r, i) => ({
            sessionNumber: r.sessionNumber != null ? r.sessionNumber : i + 1,
            planTitle: r.planTitle || '',
            planDetail: r.planDetail || '',
            note: r.note || ''
        }));
    }

    function getFactoryTemplatesForBook(book) {
        const firstId = book && book.presetIds && book.presetIds[0];
        if (!firstId) {
            return [];
        }
        const factory = getFactoryPresetById(firstId);
        return normalizeRowTemplates(factory && factory.defaultSyllabusRowTemplates);
    }

    /**
     * Discover book series from factory PDF presets that ship row templates.
     */
    function discoverBooks(appData) {
        const api = global.CCPSyllabusPresets;
        if (!api || !api.getAll) {
            return [];
        }
        const overrides = ensureBookOverrides(appData);
        const byKey = new Map();
        api.getAll().forEach((preset) => {
            const templates = preset.defaultSyllabusRowTemplates;
            if (!Array.isArray(templates) || templates.length === 0) {
                return;
            }
            const key = deriveBookKey(preset);
            if (!byKey.has(key)) {
                byKey.set(key, {
                    id: key,
                    name: bookSeriesBaseName(preset.defaultBook, preset.fallbackName || preset.name),
                    presetIds: [],
                    levels: [],
                    defaultTotalLessons: preset.defaultTotalLessons,
                    lessonLabelMode: preset.lessonLabelMode || '',
                    programTrack: preset.programTrack || ''
                });
            }
            const book = byKey.get(key);
            book.presetIds.push(preset.id);
            if (preset.level && !book.levels.includes(preset.level)) {
                book.levels.push(preset.level);
            }
            if (preset.defaultTotalLessons > (book.defaultTotalLessons || 0)) {
                book.defaultTotalLessons = preset.defaultTotalLessons;
            }
        });
        return [...byKey.values()]
            .map((book) => {
                const hasOverride = !!(overrides[book.id]
                    && Array.isArray(overrides[book.id].defaultSyllabusRowTemplates)
                    && overrides[book.id].defaultSyllabusRowTemplates.length);
                const factoryRows = getFactoryTemplatesForBook(book);
                const effectiveRows = hasOverride
                    ? normalizeRowTemplates(overrides[book.id].defaultSyllabusRowTemplates)
                    : factoryRows;
                return {
                    ...book,
                    sessionCount: effectiveRows.length,
                    factorySessionCount: factoryRows.length,
                    hasOverride,
                    levelsLabel: book.levels.sort().join(', ')
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    function getBookById(bookId, appData) {
        return discoverBooks(appData).find((b) => b.id === bookId) || null;
    }

    function getTemplatesForBookId(bookId, appData) {
        const book = getBookById(bookId, appData);
        if (!book) {
            return [];
        }
        const overrides = ensureBookOverrides(appData);
        if (overrides[bookId] && Array.isArray(overrides[bookId].defaultSyllabusRowTemplates)) {
            return normalizeRowTemplates(overrides[bookId].defaultSyllabusRowTemplates);
        }
        return getFactoryTemplatesForBook(book);
    }

    function getTemplatesForPresetId(presetId, appData) {
        const factory = getFactoryPresetById(presetId);
        if (!factory || !Array.isArray(factory.defaultSyllabusRowTemplates)) {
            return null;
        }
        const key = deriveBookKey(factory);
        const custom = getTemplatesForBookId(key, appData);
        return custom.length ? custom : normalizeRowTemplates(factory.defaultSyllabusRowTemplates);
    }

    function applyBookTemplatesToPreset(merged, appData) {
        if (!merged || !merged.id) {
            return merged;
        }
        const tpl = getTemplatesForPresetId(merged.id, appData);
        if (tpl && tpl.length) {
            merged.defaultSyllabusRowTemplates = deepClone(tpl);
        }
        return merged;
    }

    function saveBookTemplates(bookId, rowTemplates, appData) {
        const book = getBookById(bookId, appData);
        if (!book) {
            return false;
        }
        const overrides = ensureBookOverrides(appData);
        const normalized = normalizeRowTemplates(rowTemplates);
        const factory = getFactoryTemplatesForBook(book);
        if (JSON.stringify(normalized) === JSON.stringify(factory)) {
            delete overrides[bookId];
        } else {
            overrides[bookId] = {
                defaultSyllabusRowTemplates: normalized,
                updatedAt: new Date().toISOString()
            };
        }
        hooks.saveData();
        hooks.onBooksSaved();
        return true;
    }

    function resetBookToFactory(bookId, appData) {
        const overrides = ensureBookOverrides(appData);
        delete overrides[bookId];
        hooks.saveData();
        hooks.onBooksSaved();
    }

    function countBookOverrides(appData) {
        const overrides = ensureBookOverrides(appData);
        return Object.keys(overrides).filter((k) => {
            const o = overrides[k];
            return o && Array.isArray(o.defaultSyllabusRowTemplates) && o.defaultSyllabusRowTemplates.length;
        }).length;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(str) {
        return escapeHtml(str).replace(/'/g, '&#39;');
    }

    let editingBookId = null;

    function ensureModalDom() {
        const existing = document.getElementById('booksEditorModal');
        if (existing && existing.querySelector('.books-editor-body')) {
            return existing;
        }
        if (existing) {
            existing.remove();
        }
        const wrap = document.createElement('div');
        wrap.innerHTML = `
<div id="booksEditorModal" class="modal books-editor-modal">
  <div class="modal-content modal-wide books-editor-content">
    <div class="modal-header">
      <h2 data-i18n="booksEditorTitle">Edit book</h2>
      <button type="button" class="modal-close" id="closeBooksEditorModal" aria-label="Close">&times;</button>
    </div>
    <div class="books-editor-body">
      <p class="section-hint books-editor-intro" data-i18n="booksEditorHint">Lesson plans and page blocks for this book. Changes apply to all linked class types (e.g. Green, Blue, Navy).</p>
      <div id="booksEditorMeta" class="books-editor-meta"></div>
      <div class="books-editor-toolbar">
        <span data-i18n="booksEditorSessionsHeading">Sessions</span>
      </div>
      <div class="books-editor-table-wrap">
        <table class="books-editor-table" id="booksEditorTable">
          <thead>
            <tr>
              <th class="books-col-num">#</th>
              <th data-i18n="booksEditorColPlan">Lesson plan</th>
              <th data-i18n="booksEditorColPages">Pages / detail</th>
            </tr>
          </thead>
          <tbody id="booksEditorTableBody"></tbody>
        </table>
      </div>
      <div class="form-actions books-editor-actions">
        <button type="button" id="booksEditorResetBtn" class="btn btn-outline" data-i18n="booksEditorReset">Reset to factory</button>
        <button type="button" id="booksEditorSaveBtn" class="btn btn-primary" data-i18n="booksEditorSave">Save book</button>
      </div>
    </div>
  </div>
</div>`;
        document.body.appendChild(wrap.firstElementChild);
        if (typeof hooks.applyLanguage === 'function') {
            hooks.applyLanguage();
        }
        return document.getElementById('booksEditorModal');
    }

    function renderEditorTable(bookId) {
        const tbody = document.getElementById('booksEditorTableBody');
        const meta = document.getElementById('booksEditorMeta');
        if (!tbody || !meta) {
            return;
        }
        const appData = getAppData();
        const book = getBookById(bookId, appData);
        if (!book) {
            return;
        }
        const rows = getTemplatesForBookId(bookId, appData);
        meta.innerHTML = `
          <p><strong>${escapeHtml(book.name)}</strong></p>
          <p class="section-hint">${escapeHtml(hooks.t('booksEditorMetaLevels').replace('{levels}', book.levelsLabel || '—'))}</p>
          <p class="section-hint">${escapeHtml(hooks.t('booksEditorMetaLessons').replace('{n}', String(book.defaultTotalLessons || rows.length)))}</p>
          <p class="section-hint">${escapeHtml(hooks.t('booksEditorMetaPresets').replace('{ids}', book.presetIds.join(', ')))}</p>
          ${book.hasOverride ? `<p class="books-editor-custom-badge">${escapeHtml(hooks.t('booksEditorCustomBadge'))}</p>` : ''}
        `;
        tbody.innerHTML = '';
        rows.forEach((row) => {
            const tr = document.createElement('tr');
            tr.dataset.session = String(row.sessionNumber);
            tr.innerHTML = `
              <td class="books-col-num">${row.sessionNumber}</td>
              <td><input type="text" class="books-ed-title" value="${escapeAttr(row.planTitle)}" maxlength="200"></td>
              <td><textarea class="books-ed-detail" rows="5">${escapeHtml(row.planDetail)}</textarea></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function collectEditorRows() {
        const tbody = document.getElementById('booksEditorTableBody');
        if (!tbody) {
            return [];
        }
        return Array.from(tbody.querySelectorAll('tr')).map((tr) => {
            const sessionNumber = parseInt(tr.dataset.session, 10);
            return {
                sessionNumber: Number.isNaN(sessionNumber) ? 0 : sessionNumber,
                planTitle: (tr.querySelector('.books-ed-title')?.value || '').trim(),
                planDetail: tr.querySelector('.books-ed-detail')?.value || ''
            };
        }).filter((r) => r.sessionNumber > 0);
    }

    function openBookEditor(bookId) {
        const book = getBookById(bookId, getAppData());
        if (!book) {
            return;
        }
        editingBookId = bookId;
        const modal = ensureModalDom();
        renderEditorTable(bookId);
        hooks.openModal(modal);
    }

    function bindEditorUI() {
        if (document.body.dataset.booksEditorBound === '1') {
            return;
        }
        document.body.dataset.booksEditorBound = '1';
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-open-book-editor]');
            if (!btn) {
                return;
            }
            const bookId = btn.getAttribute('data-book-id');
            if (bookId) {
                openBookEditor(bookId);
            }
        });
        document.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('#closeBooksEditorModal');
            const modal = document.getElementById('booksEditorModal');
            if (closeBtn && modal) {
                hooks.closeModal(modal);
            }
        });
        document.addEventListener('click', (e) => {
            if (e.target.id !== 'booksEditorSaveBtn') {
                return;
            }
            if (!editingBookId) {
                return;
            }
            const rows = collectEditorRows();
            if (!rows.length) {
                alert(hooks.t('booksEditorNoRows'));
                return;
            }
            saveBookTemplates(editingBookId, rows, getAppData());
            renderEditorTable(editingBookId);
            const modal = document.getElementById('booksEditorModal');
            hooks.closeModal(modal);
        });
        document.addEventListener('click', (e) => {
            if (e.target.id !== 'booksEditorResetBtn') {
                return;
            }
            if (!editingBookId) {
                return;
            }
            if (!confirm(hooks.t('booksEditorResetConfirm'))) {
                return;
            }
            resetBookToFactory(editingBookId, getAppData());
            renderEditorTable(editingBookId);
        });
    }

    function renderPrintBooksList() {
        const listEl = document.getElementById('printBooksList');
        const statsEl = document.getElementById('printBooksStats');
        if (!listEl && !statsEl) {
            return;
        }
        const appData = getAppData();
        const books = discoverBooks(appData);
        const editedCount = countBookOverrides(appData);
        if (statsEl) {
            statsEl.textContent = hooks.t('printBooksStats')
                .replace('{books}', String(books.length))
                .replace('{edited}', String(editedCount));
        }
        if (!listEl) {
            return;
        }
        listEl.innerHTML = '';
        if (books.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'section-hint';
            empty.textContent = hooks.t('printBooksEmpty');
            listEl.appendChild(empty);
            return;
        }
        books.forEach((book) => {
            const row = document.createElement('div');
            row.className = 'print-books-item';
            const main = document.createElement('div');
            main.className = 'print-books-item-main';
            const title = document.createElement('span');
            title.className = 'print-books-item-title';
            title.textContent = book.name;
            const meta = document.createElement('span');
            meta.className = 'print-books-item-meta section-hint';
            const metaParts = [
                hooks.t('booksListSessions').replace('{n}', String(book.sessionCount)),
                book.levelsLabel || ''
            ].filter(Boolean);
            meta.textContent = metaParts.join(' · ');
            main.appendChild(title);
            main.appendChild(meta);
            if (book.hasOverride) {
                const badge = document.createElement('span');
                badge.className = 'print-books-edited-badge';
                badge.textContent = hooks.t('booksListEdited');
                main.appendChild(badge);
            }
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn btn-outline btn-small';
            editBtn.setAttribute('data-open-book-editor', '');
            editBtn.setAttribute('data-book-id', book.id);
            editBtn.textContent = hooks.t('booksListEdit');
            row.appendChild(main);
            row.appendChild(editBtn);
            listEl.appendChild(row);
        });
    }

    global.CCPBooksEditor = {
        init,
        discoverBooks,
        getBookById,
        getTemplatesForBookId,
        getTemplatesForPresetId,
        applyBookTemplatesToPreset,
        saveBookTemplates,
        resetBookToFactory,
        countBookOverrides,
        renderPrintBooksList,
        bindEditorUI,
        openBookEditor,
        deriveBookKey
    };
})(typeof window !== 'undefined' ? window : globalThis);
