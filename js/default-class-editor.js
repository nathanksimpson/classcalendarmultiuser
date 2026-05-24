/**
 * Default & PDF preset class types: registry, user overrides, editor UI.
 * window.CCPDefaultClassEditor
 */
(function (global) {
    const IDS = {
        DEBATE: 'builtin-debate',
        KOREAN_MULTI: 'builtin-korean-multiweekly',
        EARLY_WRITER: 'builtin-early-writer-weekly',
        WR_SP: 'builtin-wr-sp'
    };

    const SCHEDULE_MODEL_DEBATE_MONTHLY = 'debateMonthly';
    const SCHEDULE_MODEL_SEQUENTIAL_TERM = 'sequentialTerm';
    const DEFAULT_CLASS_TYPE_ID = IDS.WR_SP;

    const EDITABLE_FIELDS = [
        'name',
        'defaultTotalLessons',
        'defaultBook',
        'homeworkImportMode',
        'lessonLabelMode',
        'usesUnitPairLabels'
    ];

    let hooks = {
        getAppData: () => ({}),
        saveData: () => {},
        t: (k) => k,
        getLang: () => 'en',
        sanitizeTotalLessons: (n) => Math.max(1, parseInt(n, 10) || 1)
    };

    function init(options = {}) {
        hooks = { ...hooks, ...options };
    }

    function getAppData() {
        return hooks.getAppData() || {};
    }

    function ensureOverrides(appData) {
        const data = appData || getAppData();
        if (!data.defaultClassTypeOverrides || typeof data.defaultClassTypeOverrides !== 'object') {
            data.defaultClassTypeOverrides = {};
        }
        return data.defaultClassTypeOverrides;
    }

    function getBaseBuiltinTypes() {
        return [
            {
                id: IDS.WR_SP,
                nameKey: 'classTypeWrSp',
                fallbackName: 'WR+SP (2× per week, 1 unit/week)',
                isBuiltin: true,
                scheduleModel: SCHEDULE_MODEL_SEQUENTIAL_TERM,
                defaultTotalLessons: global.CCPCurriculaData && global.CCPCurriculaData.WRITE_RIGHT_SESSION_COUNT
                    ? global.CCPCurriculaData.WRITE_RIGHT_SESSION_COUNT
                    : 20,
                defaultBook: 'Write Right',
                defaultCompressionMode: 'sequentialTerm',
                usesUnitPairLabels: true,
                lessonLabelMode: 'wrSpUnit',
                homeworkImportMode: 'unitPair',
                defaultSyllabusRowTemplates: global.CCPCurriculaData
                    && global.CCPCurriculaData.buildWriteRightTemplates
                    ? global.CCPCurriculaData.buildWriteRightTemplates(null)
                    : undefined
            },
            {
                id: IDS.DEBATE,
                nameKey: 'classTypeDebate',
                fallbackName: 'Debate (once a week)',
                isBuiltin: true,
                scheduleModel: SCHEDULE_MODEL_DEBATE_MONTHLY,
                defaultTotalLessons: 4,
                defaultMeetingDays: [],
                defaultCompressionMode: 'autoWhenNeeded',
                homeworkImportMode: 'debate'
            },
            {
                id: IDS.KOREAN_MULTI,
                nameKey: 'classTypeKoreanMulti',
                fallbackName: 'Korean / multi-day (2× per week)',
                isBuiltin: true,
                scheduleModel: SCHEDULE_MODEL_SEQUENTIAL_TERM,
                defaultTotalLessons: 16,
                defaultCompressionMode: 'sequentialTerm',
                usesUnitPairLabels: true,
                homeworkImportMode: 'unitPair'
            }
        ];
    }

    function getPresetTypes() {
        if (global.CCPSyllabusPresets && global.CCPSyllabusPresets.getAll) {
            return global.CCPSyllabusPresets.getAll();
        }
        return [];
    }

    function resolveId(id) {
        if (!id) {
            return id;
        }
        if (global.CCPSyllabusPresets && global.CCPSyllabusPresets.resolvePresetId) {
            return global.CCPSyllabusPresets.resolvePresetId(id);
        }
        return id;
    }

    function mergeOverride(base, overrides) {
        if (!base || !overrides) {
            return base;
        }
        const patch = overrides[base.id];
        if (!patch || typeof patch !== 'object') {
            return { ...base };
        }
        const merged = { ...base };
        EDITABLE_FIELDS.forEach(key => {
            if (patch[key] !== undefined && patch[key] !== '') {
                merged[key] = patch[key];
            }
        });
        if (patch.defaultTotalLessons != null) {
            merged.defaultTotalLessons = hooks.sanitizeTotalLessons(patch.defaultTotalLessons);
        }
        if (patch.defaultSyllabusRowTemplates && Array.isArray(patch.defaultSyllabusRowTemplates)) {
            merged.defaultSyllabusRowTemplates = deepClone(patch.defaultSyllabusRowTemplates);
        }
        if (global.CCPBooksEditor && global.CCPBooksEditor.applyBookTemplatesToPreset) {
            global.CCPBooksEditor.applyBookTemplatesToPreset(merged, appData);
        }
        return merged;
    }

    function getBuiltinTypes(appData) {
        const overrides = ensureOverrides(appData);
        return getBaseBuiltinTypes().map(b => mergeOverride(b, overrides));
    }

    function getPresetTypesMerged(appData) {
        const overrides = ensureOverrides(appData);
        return getPresetTypes().map(p => mergeOverride(p, overrides));
    }

    function getCustomTypes(appData) {
        const data = appData || getAppData();
        if (!Array.isArray(data.customClassTypes)) {
            data.customClassTypes = [];
        }
        return data.customClassTypes;
    }

    function getAll(appData) {
        const data = appData || getAppData();
        return getBuiltinTypes(data)
            .concat(getPresetTypesMerged(data))
            .concat(getCustomTypes(data));
    }

    function getById(id, appData) {
        if (!id) {
            return null;
        }
        const resolved = resolveId(id);
        if (resolved === IDS.EARLY_WRITER) {
            return getById('preset-early-writers-navy', appData)
                || getById('preset-wr-sp-navy', appData)
                || getById(IDS.WR_SP, appData);
        }
        return getAll(appData).find(d => d.id === resolved) || null;
    }

    function getOptionLabel(def) {
        if (!def) {
            return '';
        }
        if (def.name && String(def.name).trim()) {
            return String(def.name).trim();
        }
        if (def.nameKey) {
            const fromKey = hooks.t(def.nameKey);
            if (fromKey && fromKey !== def.nameKey) {
                return fromKey;
            }
        }
        return (def.fallbackName || def.id || '').trim();
    }

    function isEditableDefault(def) {
        return !!(def && (def.isBuiltin || def.isSyllabusPreset));
    }

    function getEditableDefaults(appData) {
        const data = appData || getAppData();
        return getBuiltinTypes(data).concat(getPresetTypesMerged(data));
    }

    function saveOverride(typeId, patch, appData) {
        const data = appData || getAppData();
        const overrides = ensureOverrides(data);
        const base = getBaseBuiltinTypes().concat(getPresetTypes()).find(d => d.id === typeId);
        if (!base) {
            return false;
        }
        const prev = overrides[typeId] || {};
        const next = { ...prev };
        EDITABLE_FIELDS.forEach(key => {
            if (patch[key] !== undefined) {
                if (patch[key] === '' || patch[key] === null) {
                    delete next[key];
                } else {
                    next[key] = patch[key];
                }
            }
        });
        if (patch.defaultTotalLessons != null) {
            next.defaultTotalLessons = hooks.sanitizeTotalLessons(patch.defaultTotalLessons);
        }
        if (patch.usesUnitPairLabels !== undefined) {
            next.usesUnitPairLabels = !!patch.usesUnitPairLabels;
        }
        if (patch.defaultSyllabusRowTemplates !== undefined) {
            if (patch.defaultSyllabusRowTemplates == null) {
                delete next.defaultSyllabusRowTemplates;
            } else {
                next.defaultSyllabusRowTemplates = deepClone(patch.defaultSyllabusRowTemplates);
            }
        }
        if (Object.keys(next).length === 0) {
            delete overrides[typeId];
        } else {
            overrides[typeId] = next;
        }
        hooks.saveData();
        return true;
    }

    function saveCustomType(typeId, patch, appData) {
        const data = appData || getAppData();
        const list = getCustomTypes(data);
        const idx = list.findIndex(c => c.id === typeId);
        if (idx === -1) {
            return false;
        }
        const cur = list[idx];
        const next = { ...cur, id: typeId };
        if (patch.name !== undefined) {
            next.name = String(patch.name).trim() || cur.name;
        }
        if (patch.defaultTotalLessons != null) {
            next.defaultTotalLessons = hooks.sanitizeTotalLessons(patch.defaultTotalLessons);
        }
        if (patch.defaultBook !== undefined) {
            next.defaultBook = patch.defaultBook;
        }
        if (patch.homeworkImportMode !== undefined) {
            if (patch.homeworkImportMode) {
                next.homeworkImportMode = patch.homeworkImportMode;
            } else {
                delete next.homeworkImportMode;
            }
        }
        if (patch.lessonLabelMode !== undefined) {
            if (patch.lessonLabelMode) {
                next.lessonLabelMode = patch.lessonLabelMode;
            } else {
                delete next.lessonLabelMode;
            }
        }
        if (patch.usesUnitPairLabels !== undefined) {
            next.usesUnitPairLabels = !!patch.usesUnitPairLabels;
        }
        list[idx] = next;
        hooks.saveData();
        return true;
    }

    function resetOverride(typeId, appData) {
        const data = appData || getAppData();
        const overrides = ensureOverrides(data);
        delete overrides[typeId];
        hooks.saveData();
    }

    function resetAllOverrides(appData) {
        const data = appData || getAppData();
        data.defaultClassTypeOverrides = {};
        hooks.saveData();
    }

    function hasOverride(typeId, appData) {
        const overrides = ensureOverrides(appData);
        return !!(overrides[typeId] && Object.keys(overrides[typeId]).length);
    }

    function isFactoryDefaultId(typeId) {
        return !!(getBaseBuiltinTypes().concat(getPresetTypes()).find(d => d.id === typeId));
    }

    function isCustomTypeId(typeId, appData) {
        return getCustomTypes(appData).some(c => c.id === typeId);
    }

    function deepClone(value) {
        if (value == null) {
            return value;
        }
        return JSON.parse(JSON.stringify(value));
    }

    function uniqueCustomTypeName(baseName, appData) {
        const existing = new Set(getCustomTypes(appData).map(c => (c.name || '').trim()));
        let candidate = baseName.trim();
        if (!existing.has(candidate)) {
            return candidate;
        }
        const copySuffix = hooks.getLang() === 'ko' ? ' (복사)' : ' (copy)';
        if (!candidate.endsWith(copySuffix)) {
            candidate = `${candidate}${copySuffix}`;
        }
        if (!existing.has(candidate)) {
            return candidate;
        }
        let n = 2;
        while (existing.has(`${baseName.trim()} (${n})`)) {
            n += 1;
        }
        return `${baseName.trim()} (${n})`;
    }

    /**
     * Copy selected type into customClassTypes (new id). Returns new type id or null.
     */
    function duplicateClassType(sourceId, appData) {
        const data = appData || getAppData();
        const source = getById(sourceId, data);
        if (!source || !hooks.generateId) {
            return null;
        }
        const label = getOptionLabel(source);
        const custom = {
            id: hooks.generateId(),
            name: uniqueCustomTypeName(label, data),
            defaultTotalLessons: hooks.sanitizeTotalLessons(source.defaultTotalLessons || 4),
            defaultMeetingDays: Array.isArray(source.defaultMeetingDays)
                ? [...source.defaultMeetingDays]
                : [],
            defaultCompressionMode: source.defaultCompressionMode
                || (source.scheduleModel === SCHEDULE_MODEL_DEBATE_MONTHLY ? 'autoWhenNeeded' : 'sequentialTerm'),
            scheduleModel: source.scheduleModel || SCHEDULE_MODEL_SEQUENTIAL_TERM,
            duplicatedFrom: resolveId(source.id)
        };
        if (source.defaultBook) {
            custom.defaultBook = source.defaultBook;
        }
        if (source.homeworkImportMode) {
            custom.homeworkImportMode = source.homeworkImportMode;
        }
        if (source.lessonLabelMode) {
            custom.lessonLabelMode = source.lessonLabelMode;
        }
        if (source.usesUnitPairLabels) {
            custom.usesUnitPairLabels = true;
        }
        if (Array.isArray(source.defaultSyllabusUnits) && source.defaultSyllabusUnits.length) {
            custom.defaultSyllabusUnits = deepClone(source.defaultSyllabusUnits);
        }
        if (Array.isArray(source.defaultSyllabusRowTemplates) && source.defaultSyllabusRowTemplates.length) {
            custom.defaultSyllabusRowTemplates = deepClone(source.defaultSyllabusRowTemplates);
        }
        getCustomTypes(data).push(custom);
        hooks.saveData();
        return custom.id;
    }

    function populateSelect(selectEl, options = {}) {
        if (!selectEl) {
            return;
        }
        const appData = options.appData || getAppData();
        const prev = selectEl.value;
        const lang = options.lang || hooks.getLang();
        selectEl.innerHTML = '';

        const optCustom = document.createElement('option');
        optCustom.value = '';
        optCustom.setAttribute('data-i18n', 'classTypeCustom');
        optCustom.textContent = hooks.t('classTypeCustom');
        selectEl.appendChild(optCustom);

        getBuiltinTypes(appData).forEach(def => {
            const o = document.createElement('option');
            o.value = def.id;
            o.textContent = getOptionLabel(def);
            selectEl.appendChild(o);
        });

        const presets = getPresetTypesMerged(appData);
        if (presets.length) {
            const grouped = global.CCPCurricula && global.CCPCurricula.groupPresetsByLevelGroup
                ? global.CCPCurricula.groupPresetsByLevelGroup(presets, lang)
                : [{ levelGroup: 'other', label: lang === 'ko' ? 'PDF 프리셋' : 'PDF presets', presets }];
            grouped.forEach(grp => {
                const og = document.createElement('optgroup');
                og.label = grp.label;
                grp.presets
                    .slice()
                    .sort((a, b) => getOptionLabel(a).localeCompare(getOptionLabel(b), undefined, { sensitivity: 'base' }))
                    .forEach(def => {
                        const o = document.createElement('option');
                        o.value = def.id;
                        o.textContent = getOptionLabel(def) + (def.isStub ? (lang === 'ko' ? ' · stub' : ' · stub') : '');
                        o.dataset.syllabusPreset = '1';
                        if (def.levelGroup) {
                            o.dataset.levelGroup = def.levelGroup;
                        }
                        og.appendChild(o);
                    });
                selectEl.appendChild(og);
            });
        }

        getCustomTypes(appData)
            .slice()
            .sort((a, b) => getOptionLabel(a).localeCompare(getOptionLabel(b), undefined, { sensitivity: 'base' }))
            .forEach(def => {
                const o = document.createElement('option');
                o.value = def.id;
                o.textContent = getOptionLabel(def);
                o.dataset.customType = '1';
                selectEl.appendChild(o);
            });

        const ids = new Set(Array.from(selectEl.options).map(o => o.value));
        if (prev && ids.has(prev)) {
            selectEl.value = prev;
        } else if (prev) {
            const resolved = resolveId(prev);
            if (resolved && ids.has(resolved)) {
                selectEl.value = resolved;
            } else {
                const def = getById(prev, appData);
                if (def) {
                    const o = document.createElement('option');
                    o.value = prev;
                    o.textContent = getOptionLabel(def);
                    selectEl.appendChild(o);
                    selectEl.value = prev;
                }
            }
        }
    }

    const EDITOR_MODAL_VERSION = '3';

    function ensureEditorModal() {
        const existing = document.getElementById('defaultClassEditorModal');
        if (existing && existing.dataset.editorVersion === EDITOR_MODAL_VERSION
            && existing.querySelector('.default-class-editor-body')) {
            return existing;
        }
        if (existing) {
            existing.remove();
            editorBound = false;
        }
        const wrap = document.createElement('div');
        wrap.innerHTML = `
<div id="defaultClassEditorModal" class="modal default-class-editor-modal">
  <div class="modal-content modal-wide default-class-editor-content">
    <div class="modal-header">
      <h2 data-i18n="defaultClassEditorTitle">Edit default class types</h2>
      <button type="button" class="modal-close" id="closeDefaultClassEditorModal" aria-label="Close">&times;</button>
    </div>
    <div class="default-class-editor-body">
    <p class="section-hint default-class-editor-intro" data-i18n="defaultClassEditorHint">Change factory defaults for built-in and PDF preset types. Your classes keep their own settings; new classes use these values.</p>
    <div class="default-class-editor-layout">
      <div class="default-class-editor-list-wrap">
        <label class="default-class-editor-list-label" data-i18n="defaultClassEditorPickType">Type to edit</label>
        <select id="defaultClassEditorTypeList" class="default-class-editor-type-list" size="12"></select>
        <button type="button" id="defaultClassEditorDuplicateBtn" class="btn btn-outline btn-small" data-i18n="defaultClassEditorDuplicate">Duplicate class type</button>
        <button type="button" id="defaultClassEditorResetAllBtn" class="btn btn-outline btn-small" data-i18n="defaultClassEditorResetAll">Reset all to factory</button>
      </div>
      <form id="defaultClassEditorForm" class="default-class-editor-form">
        <div class="form-group">
          <label for="defaultClassEditorName" data-i18n="defaultClassEditorDisplayName">Display name</label>
          <input type="text" id="defaultClassEditorName" maxlength="120">
        </div>
        <div class="form-group">
          <label for="defaultClassEditorLessons" data-i18n="totalLessons">Total lessons</label>
          <input type="number" id="defaultClassEditorLessons" min="1" max="48" required>
        </div>
        <div class="form-group">
          <label for="defaultClassEditorBook" data-i18n="defaultBook">Default book</label>
          <input type="text" id="defaultClassEditorBook" maxlength="120">
        </div>
        <div class="form-group">
          <label for="defaultClassEditorImportMode" data-i18n="defaultClassEditorImportMode">Homework paste mode</label>
          <select id="defaultClassEditorImportMode">
            <option value="">—</option>
            <option value="unitPair">Unit Part (RC / WR+SP)</option>
            <option value="grUnit">GR Unit blocks</option>
            <option value="debate">Debate Day blocks</option>
            <option value="nonDebate">Non-debate book headings</option>
          </select>
        </div>
        <div class="form-group">
          <label for="defaultClassEditorLabelMode" data-i18n="defaultClassEditorLabelMode">Lesson label style</label>
          <select id="defaultClassEditorLabelMode">
            <option value="">Standard (Lesson 1, 2…)</option>
            <option value="grWeeklyUnit">GR weekly (Unit N)</option>
            <option value="rcNavyUnit">RC Navy (진도표 제목)</option>
            <option value="phonicsUnit">Phonics (진도표 제목)</option>
            <option value="toeflRcPage">TOEFL RC (page ranges)</option>
            <option value="handInHandUnit">Hand in Hand (syllabus titles)</option>
            <option value="wrSpUnit">WR+SP / Write Right (pages + Speaking/Writing/Project)</option>
            <option value="writeNowUnit">Write Now (pages + Speaking/Writing/Project)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="defaultClassEditorUnitPair">
            <span data-i18n="defaultClassEditorUnitPair">Unit pair labels (speaking / writing)</span>
          </label>
        </div>
        <p id="defaultClassEditorFactoryNote" class="section-hint default-class-editor-factory-note"></p>
        <div class="form-actions default-class-editor-form-actions">
          <button type="button" id="defaultClassEditorResetTypeBtn" class="btn btn-outline" data-i18n="defaultClassEditorResetType">Reset this type</button>
          <button type="submit" class="btn btn-primary" data-i18n="defaultClassEditorSave">Save default</button>
        </div>
      </form>
    </div>
    </div>
  </div>
</div>`;
        const modal = wrap.firstElementChild;
        modal.dataset.editorVersion = EDITOR_MODAL_VERSION;
        document.body.appendChild(modal);
        return document.getElementById('defaultClassEditorModal');
    }

    let editorBound = false;

    function fillEditorForm(typeId) {
        const appData = getAppData();
        const def = getById(typeId, appData);
        const base = getBaseBuiltinTypes().concat(getPresetTypes()).find(d => d.id === typeId);
        const nameIn = document.getElementById('defaultClassEditorName');
        const lessonsIn = document.getElementById('defaultClassEditorLessons');
        const bookIn = document.getElementById('defaultClassEditorBook');
        const importIn = document.getElementById('defaultClassEditorImportMode');
        const labelIn = document.getElementById('defaultClassEditorLabelMode');
        const pairIn = document.getElementById('defaultClassEditorUnitPair');
        const note = document.getElementById('defaultClassEditorFactoryNote');
        if (!def || !nameIn) {
            return;
        }
        nameIn.value = def.name || '';
        if (!nameIn.value && def.fallbackName && !def.nameKey) {
            nameIn.value = def.fallbackName;
        }
        if (!nameIn.value && def.nameKey) {
            nameIn.placeholder = getOptionLabel(def);
        }
        lessonsIn.value = String(def.defaultTotalLessons || 4);
        bookIn.value = def.defaultBook || '';
        importIn.value = def.homeworkImportMode || '';
        labelIn.value = def.lessonLabelMode || '';
        pairIn.checked = !!def.usesUnitPairLabels;
        const resetTypeBtn = document.getElementById('defaultClassEditorResetTypeBtn');
        const formEl = document.getElementById('defaultClassEditorForm');
        const saveBtn = formEl && formEl.querySelector('[type="submit"]');
        const isCustom = isCustomTypeId(typeId, appData);
        const isFactory = isFactoryDefaultId(typeId);

        if (note) {
            if (isCustom) {
                note.textContent = hooks.t('defaultClassEditorCustomTypeNote');
            } else if (base) {
                const factoryLessons = base.defaultTotalLessons;
                const factoryBook = base.defaultBook || '—';
                note.textContent = hooks.t('defaultClassEditorFactoryValues')
                    .replace('{lessons}', String(factoryLessons))
                    .replace('{book}', factoryBook);
            } else {
                note.textContent = '';
            }
        }
        if (resetTypeBtn) {
            resetTypeBtn.disabled = !isFactory;
            resetTypeBtn.title = isFactory ? '' : hooks.t('defaultClassEditorResetTypeDisabled');
        }
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = isCustom
                ? hooks.t('defaultClassEditorSaveCustom')
                : hooks.t('defaultClassEditorSave');
        }
    }

    function populateEditorTypeList(selectId) {
        const list = document.getElementById('defaultClassEditorTypeList');
        if (!list) {
            return;
        }
        const appData = getAppData();
        const prev = selectId || list.value;
        list.innerHTML = '';
        const lang = hooks.getLang();

        const addGroup = (label, defs) => {
            if (!defs.length) {
                return;
            }
            const og = document.createElement('optgroup');
            og.label = label;
            defs.forEach(def => {
                const o = document.createElement('option');
                o.value = def.id;
                let text = getOptionLabel(def);
                if (hasOverride(def.id, appData)) {
                    text += lang === 'ko' ? ' (수정됨)' : ' (edited)';
                }
                o.textContent = text;
                og.appendChild(o);
            });
            list.appendChild(og);
        };

        addGroup(lang === 'ko' ? '기본 유형' : 'Built-in', getBuiltinTypes(appData));
        const presets = getPresetTypesMerged(appData);
        if (global.CCPCurricula && global.CCPCurricula.groupPresetsByLevelGroup) {
            global.CCPCurricula.groupPresetsByLevelGroup(presets, lang).forEach(grp => {
                addGroup(grp.label, grp.presets);
            });
        } else {
            addGroup(lang === 'ko' ? 'PDF 프리셋' : 'PDF presets', presets);
        }
        addGroup(lang === 'ko' ? '내 유형 (복사본)' : 'My types (copies)', getCustomTypes(appData));

        if (prev && [...list.options].some(o => o.value === prev)) {
            list.value = prev;
        } else if (list.options.length) {
            list.selectedIndex = 0;
        }
        fillEditorForm(list.value);
    }

    function bindEditorUI() {
        if (editorBound) {
            return;
        }
        const modal = ensureEditorModal();
        const list = document.getElementById('defaultClassEditorTypeList');
        const form = document.getElementById('defaultClassEditorForm');
        const closeBtn = document.getElementById('closeDefaultClassEditorModal');
        const resetTypeBtn = document.getElementById('defaultClassEditorResetTypeBtn');
        const resetAllBtn = document.getElementById('defaultClassEditorResetAllBtn');
        const duplicateBtn = document.getElementById('defaultClassEditorDuplicateBtn');
        const openBtns = document.querySelectorAll('[data-open-default-class-editor]');

        if (list) {
            list.addEventListener('change', () => fillEditorForm(list.value));
        }
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const typeId = list && list.value;
                if (!typeId) {
                    return;
                }
                const appData = getAppData();
                const nameVal = (document.getElementById('defaultClassEditorName').value || '').trim();
                const patch = {
                    defaultTotalLessons: document.getElementById('defaultClassEditorLessons').value,
                    defaultBook: (document.getElementById('defaultClassEditorBook').value || '').trim(),
                    homeworkImportMode: document.getElementById('defaultClassEditorImportMode').value,
                    lessonLabelMode: document.getElementById('defaultClassEditorLabelMode').value,
                    usesUnitPairLabels: document.getElementById('defaultClassEditorUnitPair').checked
                };
                if (isCustomTypeId(typeId, appData)) {
                    patch.name = nameVal || getOptionLabel(getById(typeId, appData));
                    saveCustomType(typeId, patch, appData);
                } else {
                    const base = getBaseBuiltinTypes().concat(getPresetTypes()).find(d => d.id === typeId);
                    if (nameVal && base) {
                        const factoryLabel = base.nameKey ? hooks.t(base.nameKey) : (base.fallbackName || '');
                        if (nameVal !== factoryLabel && nameVal !== (base.fallbackName || '')) {
                            patch.name = nameVal;
                        }
                    } else if (nameVal) {
                        patch.name = nameVal;
                    }
                    saveOverride(typeId, patch, appData);
                }
                populateEditorTypeList(typeId);
                if (hooks.onDefaultsSaved) {
                    hooks.onDefaultsSaved();
                }
            });
        }
        if (resetTypeBtn && list) {
            resetTypeBtn.addEventListener('click', () => {
                if (!list.value) {
                    return;
                }
                if (!confirm(hooks.t('defaultClassEditorResetTypeConfirm'))) {
                    return;
                }
                resetOverride(list.value);
                populateEditorTypeList();
                if (hooks.onDefaultsSaved) {
                    hooks.onDefaultsSaved();
                }
            });
        }
        if (duplicateBtn && list) {
            duplicateBtn.addEventListener('click', () => {
                const sourceId = list.value;
                if (!sourceId) {
                    alert(hooks.t('defaultClassEditorDuplicatePick'));
                    return;
                }
                const newId = duplicateClassType(sourceId, getAppData());
                if (!newId) {
                    return;
                }
                populateEditorTypeList(newId);
                if (hooks.onDefaultsSaved) {
                    hooks.onDefaultsSaved();
                }
                if (hooks.onTypeDuplicated) {
                    hooks.onTypeDuplicated(newId);
                }
            });
        }
        if (resetAllBtn) {
            resetAllBtn.addEventListener('click', () => {
                if (!confirm(hooks.t('defaultClassEditorResetAllConfirm'))) {
                    return;
                }
                resetAllOverrides();
                populateEditorTypeList();
                if (hooks.onDefaultsSaved) {
                    hooks.onDefaultsSaved();
                }
            });
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', () => closeEditor());
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeEditor();
                }
            });
        }
        openBtns.forEach(btn => {
            if (!btn.dataset.defaultEditorBound) {
                btn.dataset.defaultEditorBound = '1';
                btn.addEventListener('click', () => openEditor());
            }
        });
        editorBound = true;
    }

    function closeEditor() {
        const modal = document.getElementById('defaultClassEditorModal');
        if (hooks.closeModal && modal) {
            hooks.closeModal(modal);
        } else if (modal) {
            modal.classList.remove('active');
        }
    }

    function openEditor() {
        ensureEditorModal();
        bindEditorUI();
        populateEditorTypeList();
        const modal = document.getElementById('defaultClassEditorModal');
        if (modal) {
            if (hooks.openModal) {
                hooks.openModal(modal);
            } else {
                modal.classList.add('active');
            }
            if (hooks.applyLanguage) {
                hooks.applyLanguage();
            }
        }
    }

    global.CCPDefaultClassEditor = {
        init,
        IDS,
        SCHEDULE_MODEL_DEBATE_MONTHLY,
        SCHEDULE_MODEL_SEQUENTIAL_TERM,
        DEFAULT_CLASS_TYPE_ID,
        ensureOverrides,
        getBaseBuiltinTypes,
        getBuiltinTypes,
        getPresetTypes: getPresetTypesMerged,
        getCustomTypes,
        getAll,
        getById,
        resolveId,
        getOptionLabel,
        getEditableDefaults,
        isEditableDefault,
        populateSelect,
        saveOverride,
        saveCustomType,
        resetOverride,
        resetAllOverrides,
        hasOverride,
        duplicateClassType,
        isCustomTypeId,
        isFactoryDefaultId,
        openEditor,
        bindEditorUI,
        ensureEditorModal
    };
})(typeof window !== 'undefined' ? window : globalThis);
