/**
 * Curated class colors + theme-aware inverse (window.CCPClassColorPalette).
 */
(function (global) {
    const CALM_PALETTE = [
        '#356a9e', '#2f6fb0', '#2e9d5e', '#1f9d4d', '#36a06a', '#6f54a8',
        '#df641d', '#dd8a57', '#c96b8e', '#cfa23a', '#2e8b8b', '#5a6a80'
    ];

    function hexToHsl(hex) {
        const n = String(hex || '').replace('#', '');
        if (n.length < 6) {
            return [0, 0, 0.5];
        }
        let r = parseInt(n.slice(0, 2), 16) / 255;
        let g = parseInt(n.slice(2, 4), 16) / 255;
        let b = parseInt(n.slice(4, 6), 16) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        let s = 0;
        const l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) {
                h = (g - b) / d + (g < b ? 6 : 0);
            } else if (max === g) {
                h = (b - r) / d + 2;
            } else {
                h = (r - g) / d + 4;
            }
            h /= 6;
        }
        return [h, s, l];
    }

    function hslToHex(h, s, l) {
        const f = (n) => {
            const k = (n + h * 12) % 12;
            const a = s * Math.min(l, 1 - l);
            const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
            return Math.round(255 * c).toString(16).padStart(2, '0');
        };
        return '#' + f(0) + f(8) + f(4);
    }

    function lightenForDark(hex) {
        const hsl = hexToHsl(hex);
        return hslToHex(hsl[0], Math.min(hsl[1], 0.7), Math.max(hsl[2], 0.6));
    }

    function hexToRgba(hex, alpha) {
        const n = String(hex || '#356a9e').replace('#', '');
        const r = parseInt(n.slice(0, 2), 16);
        const g = parseInt(n.slice(2, 4), 16);
        const b = parseInt(n.slice(4, 6), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function chipStyle(hex, theme) {
        const accent = theme === 'dark' ? lightenForDark(hex) : hex;
        const alpha = theme === 'dark' ? 0.2 : 0.16;
        const text = theme === 'dark' ? '#dde6f1' : '#243244';
        return {
            background: hexToRgba(accent, alpha),
            color: text,
            borderLeft: '3px solid ' + accent
        };
    }

    function renderGrid(container, selectedHex, onPick) {
        if (!container) {
            return;
        }
        container.innerHTML = '';
        container.classList.add('class-color-palette-grid');
        CALM_PALETTE.forEach((hex) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'class-color-palette-swatch';
            btn.style.background = hex;
            btn.title = hex;
            if (selectedHex && selectedHex.toLowerCase() === hex.toLowerCase()) {
                btn.classList.add('is-selected');
            }
            btn.addEventListener('click', () => onPick(hex));
            container.appendChild(btn);
        });
        const custom = document.createElement('button');
        custom.type = 'button';
        custom.className = 'class-color-palette-swatch class-color-palette-custom';
        custom.title = 'Custom color';
        custom.innerHTML = '<span class="class-color-palette-custom-inner">+</span>';
        custom.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'color';
            input.value = selectedHex || CALM_PALETTE[0];
            input.addEventListener('change', () => onPick(input.value));
            input.click();
        });
        container.appendChild(custom);
    }

    function renderPreviewRow(container, hex, label) {
        if (!container || !hex) {
            return;
        }
        const light = chipStyle(hex, 'light');
        const dark = chipStyle(lightenForDark(hex), 'dark');
        const sample = (label || 'Preview') + ' · Unit 1';
        container.innerHTML =
            '<span class="class-color-preview-label">Preview</span>' +
            '<span class="class-color-preview-chip" style="background:' + light.background + ';color:' + light.color + ';border-left:' + light.borderLeft + '">' + sample + '</span>' +
            '<span class="class-color-preview-arrow">dark auto →</span>' +
            '<span class="class-color-preview-chip" style="background:' + dark.background + ';color:' + dark.color + ';border-left:' + dark.borderLeft + '">' + sample + '</span>';
    }

    global.CCPClassColorPalette = {
        CALM_PALETTE,
        lightenForDark,
        hexToRgba,
        chipStyle,
        renderGrid,
        renderPreviewRow
    };
})(typeof window !== 'undefined' ? window : globalThis);
