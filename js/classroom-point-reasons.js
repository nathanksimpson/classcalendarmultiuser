/**
 * Built-in point reason presets for the Classroom Points tab.
 */
(function (global) {
    const PRESET_IDS = ['homework', 'attitude', 'unprepared', 'tshirt', 'test_result'];
    const OTHER_ID = 'other';
    const DEFAULT_PRESET_ID = PRESET_IDS[0];

    const PRESET_I18N_KEYS = {
        homework: 'classroomPointReasonHomework',
        attitude: 'classroomPointReasonAttitude',
        unprepared: 'classroomPointReasonUnprepared',
        tshirt: 'classroomPointReasonTshirt',
        test_result: 'classroomPointReasonTestResult'
    };

    function normalizePresetId(raw) {
        const id = String(raw || '').trim();
        if (id === OTHER_ID || PRESET_IDS.includes(id)) {
            return id;
        }
        return DEFAULT_PRESET_ID;
    }

    function isOtherReasonPreset(presetId) {
        return normalizePresetId(presetId) === OTHER_ID;
    }

    function getPresetLabel(presetId, translate) {
        const id = normalizePresetId(presetId);
        if (id === OTHER_ID) {
            const t = typeof translate === 'function' ? translate : (k) => k;
            return t('classroomPointReasonOther');
        }
        const key = PRESET_I18N_KEYS[id];
        const t = typeof translate === 'function' ? translate : (k) => k;
        return key ? t(key) : id;
    }

    /**
     * @param {function} translate (key) => string
     * @returns {Array<{ id, label }>}
     */
    function getPointReasonPresets(translate) {
        const t = typeof translate === 'function' ? translate : (k) => k;
        const presets = PRESET_IDS.map((id) => ({
            id,
            label: t(PRESET_I18N_KEYS[id] || id)
        }));
        presets.push({
            id: OTHER_ID,
            label: t('classroomPointReasonOther')
        });
        return presets;
    }

    /**
     * @param {{ presetId?: string, customText?: string, translate?: function }} opts
     * @returns {string}
     */
    function resolvePointReason(opts) {
        const options = opts || {};
        const presetId = normalizePresetId(options.presetId);
        const translate = options.translate;
        if (isOtherReasonPreset(presetId)) {
            return String(options.customText || '').trim();
        }
        return getPresetLabel(presetId, translate);
    }

    global.CCPClassroomPointReasons = {
        PRESET_IDS,
        OTHER_ID,
        DEFAULT_PRESET_ID,
        PRESET_I18N_KEYS,
        normalizePresetId,
        isOtherReasonPreset,
        getPresetLabel,
        getPointReasonPresets,
        resolvePointReason
    };
})(typeof window !== 'undefined' ? window : globalThis);
