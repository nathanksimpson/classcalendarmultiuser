/**
 * Shared class-color tile styling (calendar calm chips + selection lists).
 * window.CCPClassColorTile
 */
(function (global) {
    const DEFAULT_ACCENT = '#356a9e';

    function hexToRgba(hex, alpha) {
        const n = String(hex || DEFAULT_ACCENT).replace('#', '');
        if (n.length < 6) {
            return 'rgba(53,106,158,' + alpha + ')';
        }
        const r = parseInt(n.slice(0, 2), 16);
        const g = parseInt(n.slice(2, 4), 16);
        const b = parseInt(n.slice(4, 6), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function isDarkTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    function getAccent(classData) {
        return (classData && classData.color) || DEFAULT_ACCENT;
    }

    function getFillAlpha(options) {
        const dark = isDarkTheme();
        let alpha = dark ? 0.16 : 0.14;
        if (options && (options.selected || options.checked)) {
            alpha = dark ? 0.22 : 0.2;
        }
        return alpha;
    }

    function getReadableText(accent, classData) {
        if (classData && classData.textColor) {
            return classData.textColor;
        }
        if (typeof global.getReadableTextOnBackground === 'function') {
            const bg = hexToRgba(accent, getFillAlpha({}));
            return global.getReadableTextOnBackground(bg, isDarkTheme() ? '#dde6f1' : '#243244');
        }
        return isDarkTheme() ? '#dde6f1' : '#243244';
    }

    function apply(el, classData, options) {
        if (!el || !classData) {
            return;
        }
        const opts = options || {};
        const accent = getAccent(classData);
        const alpha = getFillAlpha(opts);
        const borderAlpha = isDarkTheme() ? 0.42 : 0.34;
        const text = getReadableText(accent, classData);

        el.classList.add('class-color-tile');
        el.style.setProperty('--class-tile-accent', accent);
        el.style.setProperty('--class-tile-bg', hexToRgba(accent, alpha));
        el.style.setProperty('--class-tile-text', text);
        el.style.backgroundColor = hexToRgba(accent, alpha);
        el.style.borderLeft = opts.borderless ? '' : ('3px solid ' + accent);
        el.style.borderColor = opts.borderless ? 'transparent' : hexToRgba(accent, borderAlpha);
        el.style.color = text;

        if (opts.selected || opts.checked) {
            el.classList.add('is-active');
        }
    }

    function clear(el) {
        if (!el) {
            return;
        }
        el.classList.remove('class-color-tile', 'is-active');
        el.style.removeProperty('--class-tile-accent');
        el.style.removeProperty('--class-tile-bg');
        el.style.removeProperty('--class-tile-text');
        el.style.removeProperty('backgroundColor');
        el.style.removeProperty('borderLeft');
        el.style.removeProperty('borderColor');
        el.style.removeProperty('color');
    }

    function applyCalmBar(el, classData) {
        if (!el || !classData) {
            return;
        }
        apply(el, classData, {});
        el.classList.add('event-bar--calm');
        const book = el.querySelector('.event-book');
        if (book) {
            book.style.color = isDarkTheme() ? 'rgba(221, 230, 241, 0.55)' : '#6b7689';
            book.style.opacity = '1';
        }
    }

    function applyPanelAccent(headerEl, classData) {
        if (!headerEl) {
            return;
        }
        if (!classData || !classData.id) {
            headerEl.classList.remove('class-panel-accent');
            headerEl.style.removeProperty('backgroundColor');
            headerEl.style.removeProperty('borderTopColor');
            headerEl.style.removeProperty('--class-tile-accent');
            headerEl.style.removeProperty('--class-tile-text');
            const h2 = headerEl.querySelector('h2');
            if (h2) {
                h2.style.removeProperty('color');
            }
            return;
        }
        const accent = getAccent(classData);
        const alpha = isDarkTheme() ? 0.12 : 0.1;
        const text = getReadableText(accent, classData);
        headerEl.classList.add('class-panel-accent');
        headerEl.style.setProperty('--class-tile-accent', accent);
        headerEl.style.setProperty('--class-tile-text', text);
        headerEl.style.backgroundColor = hexToRgba(accent, alpha);
        headerEl.style.borderTopColor = accent;
        const h2 = headerEl.querySelector('h2');
        if (h2) {
            h2.style.color = text;
        }
    }

    function refreshAll() {
        document.querySelectorAll('.class-color-tile[data-class-id]').forEach((el) => {
            const id = el.dataset.classId;
            const data = global.appData && Array.isArray(global.appData.classes)
                ? global.appData.classes.find((c) => c && String(c.id) === String(id))
                : null;
            if (data) {
                const selected = el.classList.contains('is-selected')
                    || Boolean(el.querySelector('input[type="checkbox"]:checked, input[type="radio"]:checked'));
                apply(el, data, { selected });
            }
        });
        const form = document.getElementById('classForm');
        const header = form && form.querySelector('.class-modal-header');
        const classId = form && form.querySelector('#classId') && form.querySelector('#classId').value;
        if (header && classId && global.appData) {
            const cls = global.appData.classes.find((c) => c && c.id === classId);
            applyPanelAccent(header, cls || null);
        }
    }

    global.CCPClassColorTile = {
        apply,
        clear,
        applyCalmBar,
        applyPanelAccent,
        refreshAll,
        hexToRgba
    };
})(typeof window !== 'undefined' ? window : globalThis);
