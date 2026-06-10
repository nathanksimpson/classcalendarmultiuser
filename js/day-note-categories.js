/**
 * Day note categories — built-in presets + custom calendar categories.
 */
(function (global) {
    const DEFAULT_CATEGORY_ID = 'class-notes';
    const BUILTIN_CATEGORY_IDS = new Set(['class-notes', 'parent-consult']);

    const BUILTIN_I18N_KEYS = {
        'class-notes': 'dayNoteCategoryClassNotes',
        'parent-consult': 'dayNoteCategoryParentConsult'
    };

    function normalizeCategoryId(raw) {
        const id = String(raw || '').trim();
        return id || DEFAULT_CATEGORY_ID;
    }

    function normalizeDayNoteCategory(raw) {
        if (!raw || typeof raw !== 'object') {
            return null;
        }
        const id = String(raw.id || '').trim();
        const name = String(raw.name || '').trim();
        if (!id || BUILTIN_CATEGORY_IDS.has(id) || !name) {
            return null;
        }
        return { id, name };
    }

    function normalizeDayNoteCategories(list) {
        if (!Array.isArray(list)) {
            return [];
        }
        const out = [];
        const seen = new Set();
        list.forEach((raw) => {
            const cat = normalizeDayNoteCategory(raw);
            if (!cat || seen.has(cat.id)) {
                return;
            }
            seen.add(cat.id);
            out.push(cat);
        });
        return out;
    }

    function isBuiltinCategoryId(id) {
        return BUILTIN_CATEGORY_IDS.has(normalizeCategoryId(id));
    }

    /**
     * @param {function} translate (key) => string
     * @returns {Array<{ id, name, builtin, custom }>}
     */
    function getAllCategories(customCategories, translate) {
        const t = typeof translate === 'function' ? translate : (k) => k;
        const builtins = ['class-notes', 'parent-consult'].map((id) => ({
            id,
            name: t(BUILTIN_I18N_KEYS[id] || id),
            builtin: true,
            custom: false
        }));
        const custom = normalizeDayNoteCategories(customCategories).map((cat) => ({
            id: cat.id,
            name: cat.name,
            builtin: false,
            custom: true
        }));
        return builtins.concat(custom);
    }

    function resolveCategoryLabel(categoryId, customCategories, translate) {
        const id = normalizeCategoryId(categoryId);
        if (BUILTIN_I18N_KEYS[id]) {
            const t = typeof translate === 'function' ? translate : (k) => k;
            return t(BUILTIN_I18N_KEYS[id]);
        }
        const custom = normalizeDayNoteCategories(customCategories).find((c) => c.id === id);
        return custom ? custom.name : id;
    }

    function createCategoryId() {
        return `dnc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }

    function createCategory(name) {
        const label = String(name || '').trim();
        if (!label) {
            return null;
        }
        return { id: createCategoryId(), name: label };
    }

    function isCategoryInUse(categoryId, dayNotes) {
        const id = normalizeCategoryId(categoryId);
        return (dayNotes || []).some((note) => note && normalizeCategoryId(note.categoryId) === id);
    }

    function canDeleteCategory(categoryId, dayNotes) {
        const id = normalizeCategoryId(categoryId);
        if (BUILTIN_CATEGORY_IDS.has(id)) {
            return { ok: false, reason: 'builtin' };
        }
        if (isCategoryInUse(id, dayNotes)) {
            return { ok: false, reason: 'in_use' };
        }
        return { ok: true, reason: null };
    }

    global.CCPDayNoteCategories = {
        DEFAULT_CATEGORY_ID,
        BUILTIN_CATEGORY_IDS,
        BUILTIN_I18N_KEYS,
        normalizeCategoryId,
        normalizeDayNoteCategory,
        normalizeDayNoteCategories,
        isBuiltinCategoryId,
        getAllCategories,
        resolveCategoryLabel,
        createCategory,
        isCategoryInUse,
        canDeleteCategory
    };
})(typeof window !== 'undefined' ? window : globalThis);
