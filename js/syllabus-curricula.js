/**
 * Curricula loader — exposes presets to CCPSyllabusPresets and UI grouping helpers.
 */
(function (global) {
    function dataApi() {
        return global.CCPCurriculaData || null;
    }

    global.CCPCurricula = {
        getAll() {
            const api = dataApi();
            return api ? api.getAll() : [];
        },
        getById(id) {
            const api = dataApi();
            return api ? api.getById(id) : null;
        },
        resolvePresetId(id) {
            const api = dataApi();
            return api ? api.resolvePresetId(id) : id;
        },
        groupPresetsByLevelGroup(presets, lang) {
            const api = dataApi();
            if (api && api.groupPresetsByLevelGroup) {
                return api.groupPresetsByLevelGroup(presets, lang);
            }
            return [{ levelGroup: 'other', label: 'Other', order: 0, presets: presets || [] }];
        },
        getLevelGroupLabel(levelGroup, lang) {
            const api = dataApi();
            if (!api || !api.getLevelGroupMeta) {
                return levelGroup;
            }
            const meta = api.getLevelGroupMeta()[levelGroup];
            if (!meta) {
                return levelGroup;
            }
            return lang === 'ko' ? meta.label.ko : meta.label.en;
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
