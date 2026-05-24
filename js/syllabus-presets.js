/**
 * PDF-derived class type presets (window.CCPSyllabusPresets).
 * Delegates to CCPCurriculaData; one preset per curriculum/subject track.
 */
(function (global) {
    function curriculaApi() {
        return global.CCPCurriculaData || null;
    }

    global.CCPSyllabusPresets = {
        getAll() {
            const api = curriculaApi();
            return api ? api.getAll() : [];
        },
        getById(id) {
            const api = curriculaApi();
            return api ? api.getById(id) : null;
        },
        resolvePresetId(id) {
            const api = curriculaApi();
            return api ? api.resolvePresetId(id) : id;
        },
        getLegacyAliases() {
            const api = curriculaApi();
            return api && api.getLegacyAliases ? api.getLegacyAliases() : {};
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
