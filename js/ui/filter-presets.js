/**
 * Shared filter preset markup (My classes only, etc.).
 */
(function (global) {
    function escapeAttr(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * @param {{ id: string, checked?: boolean, labelClass?: string, i18nKey?: string }} options
     */
    function buildMyClassesOnlyCheckbox(options) {
        const opts = options || {};
        const id = opts.id || 'filterMyClassesOnly';
        const checked = opts.checked ? ' checked' : '';
        const labelClass = opts.labelClass ? ` ${opts.labelClass}` : '';
        const i18nKey = opts.i18nKey || 'filterMyClassesOnly';
        return `<label class="checkbox-label${labelClass}" data-filter-preset="my-classes">
            <input type="checkbox" id="${escapeAttr(id)}"${checked} />
            <span data-i18n="${escapeAttr(i18nKey)}">My classes only</span>
        </label>`;
    }

    /**
     * @param {ParentNode|Document} root
     * @param {string} inputId
     * @param {(checked: boolean) => void} onChange
     */
    function wireMyClassesOnlyChange(root, inputId, onChange) {
        const scope = root && root.querySelector ? root : document;
        const el = scope.querySelector ? scope.querySelector(`#${inputId}`) : document.getElementById(inputId);
        if (!el || typeof onChange !== 'function') {
            return;
        }
        el.addEventListener('change', () => onChange(el.checked));
    }

    global.CCPFilterPresets = {
        MY_CLASSES_PRESET: 'my-classes',
        buildMyClassesOnlyCheckbox,
        wireMyClassesOnlyChange
    };
})(typeof window !== 'undefined' ? window : globalThis);
